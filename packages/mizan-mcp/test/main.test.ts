import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve, sep } from "node:path"
import { REPOSITORY_ROOT, defaultAttestationPath, defaultCorpusPath } from "../src/main.ts"

/**
 * Where the MCP server looks for its corpus when the operator names none.
 *
 * ## The defect this exists to catch
 *
 * `bun run mcp` from a directory that is not the repository root found no corpus and exited 2 with a
 * named reason — which is the honest surface, but it is the wrong *answer*: the corpus was right
 * there, three levels above this file. The default resolved from `process.cwd()`, so the server read
 * whatever sat beside the caller's shell: a different corpus on a developer's machine and on a
 * judge's, which for this project is the difference between a served verdict and an absent one.
 *
 * The fix counts `..` from `import.meta.dir`, and a counted path is exactly the kind of fix that
 * reads as correct and is wrong by one: two levels up from `packages/mizan-mcp/src` is
 * `packages/`, which has no `data/corpus.db` and no `attestation.json`. So the assertion below is not
 * "the string ends with data/corpus.db" — that passes for the broken path too. It is "files that
 * only exist at the real root exist under the resolved root", which fails by exactly the bug.
 *
 * ## Why importing `src/main.ts` was impossible before
 *
 * It called `process.exit(await main())` at module scope, so importing it started a server and killed
 * the test runner. `import.meta.main` is now guarded there — the same shape `scripts/benchmark.ts`
 * uses — and this file is what that guard bought.
 */
describe("the default corpus location does not depend on the working directory", () => {
  test("the resolved root is the repository root, pinned by committed files", () => {
    // `AGENTS.md` and the workspace manifest are committed at the root and nowhere else, and
    // `data/eval/` is committed and lives under the root. Under the two-`..` bug all three are absent.
    expect(basename(REPOSITORY_ROOT)).not.toBe("packages")
    expect(existsSync(join(REPOSITORY_ROOT, "AGENTS.md"))).toBe(true)
    expect(existsSync(join(REPOSITORY_ROOT, "package.json"))).toBe(true)
    expect(existsSync(join(REPOSITORY_ROOT, "data", "eval", "golden-normalization.json"))).toBe(true)
  })

  test("the corpus default sits in that root's data directory", () => {
    expect(defaultCorpusPath()).toBe(join(REPOSITORY_ROOT, "data", "corpus.db"))
    expect(defaultCorpusPath().endsWith(`${sep}data${sep}corpus.db`)).toBe(true)
  })

  test("the attestation default is the root attestation, beside it", () => {
    expect(defaultAttestationPath()).toBe(join(REPOSITORY_ROOT, "attestation.json"))
  })

  test("resolution is the same from a foreign working directory", () => {
    // The property the story is about, asserted the way a user hits it: the shell is somewhere else
    // entirely. A default that consulted `process.cwd()` would change under this `chdir`; one
    // resolved from this file's location cannot.
    const elsewhere = tmpdir()
    const restore = process.cwd()
    try {
      process.chdir(elsewhere)
      expect(defaultCorpusPath()).toBe(join(REPOSITORY_ROOT, "data", "corpus.db"))
      expect(defaultAttestationPath()).toBe(join(REPOSITORY_ROOT, "attestation.json"))
      expect(resolve(REPOSITORY_ROOT)).not.toBe(resolve(elsewhere))
    } finally {
      process.chdir(restore)
    }
  })

  test("the environment still wins, because an operator may name any corpus", () => {
    // Fail-closed is about verification, not about location: the point of the override is to serve a
    // corpus at another path, and the attestation still has to authorise whatever it names.
    const restoreCorpus = process.env["MIZAN_CORPUS_PATH"]
    const restoreAttestation = process.env["MIZAN_ATTESTATION_PATH"]
    try {
      process.env["MIZAN_CORPUS_PATH"] = join(tmpdir(), "elsewhere.db")
      process.env["MIZAN_ATTESTATION_PATH"] = join(tmpdir(), "elsewhere.json")
      expect(defaultCorpusPath()).toBe(join(tmpdir(), "elsewhere.db"))
      expect(defaultAttestationPath()).toBe(join(tmpdir(), "elsewhere.json"))
    } finally {
      if (restoreCorpus === undefined) delete process.env["MIZAN_CORPUS_PATH"]
      else process.env["MIZAN_CORPUS_PATH"] = restoreCorpus
      if (restoreAttestation === undefined) delete process.env["MIZAN_ATTESTATION_PATH"]
      else process.env["MIZAN_ATTESTATION_PATH"] = restoreAttestation
    }
  })

  test("the corpus lives under the root this package's own tree is in", () => {
    // The counted `..`, checked against the tree rather than against itself. This file is
    // `<root>/packages/mizan-mcp/test/<this file>`, so the root is three `dirname`s up from here — the
    // same three `src/main.ts` counts from its own directory. If either count forgets one it lands on
    // `packages/`, which holds no `packages/` of its own and no `AGENTS.md` — both asserted here, from
    // committed files, so the assertion cannot pass by agreeing with a wrong constant.
    const packageRoot = dirname(import.meta.dir)
    expect(existsSync(join(packageRoot, "package.json"))).toBe(true)
    expect(dirname(dirname(dirname(import.meta.dir)))).toBe(REPOSITORY_ROOT)
    expect(existsSync(join(REPOSITORY_ROOT, "packages", "mizan-mcp", "package.json"))).toBe(true)
    expect(dirname(dirname(defaultCorpusPath()))).toBe(REPOSITORY_ROOT)
  })
})