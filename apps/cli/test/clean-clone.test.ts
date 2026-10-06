import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { decodeCondition } from "@mizan/core"
import { conditionOfCliState, describeCliState, type CliCorpusState } from "../src/degradation.ts"
import { boundedExit, SUBPROCESS_TIMEOUT_MS } from "./subprocess-budget.ts"

/**
 * The CLI on a checkout with no corpus — Story 7's "a clean clone exits with a typed reason".
 *
 * ## What is being asserted
 *
 * That the state the CLI is in when `data/corpus.db` is absent is a **word from the shared
 * vocabulary**, not a sentence this package made up. Before this, `apps/cli` printed
 * `no corpus at data/corpus.db. Run \`bun run ingest\` first.` while the MCP server printed
 * `corpus_missing: … the MCP server will not serve without an attested corpus` — two different
 * reasons, in two different vocabularies, for the same absence, with nothing in the type system able
 * to notice. `conditionOfCliState` goes through `conditionOf`, the single seam through which a
 * degradation name enters the vocabulary, so the agreement is now an import-graph fact rather than a
 * review comment. `packages/mizan-mcp/test/clean-clone.test.ts` asserts the other half.
 *
 * ## Why a synthetic checkout rather than this one
 *
 * `data/corpus.db` is gitignored and present on a developer's machine, so a test that relied on its
 * absence would pass on CI and fail at home — the shape of a fix that hides a defect. So the test
 * builds the smallest directory that `requireRepositoryRoot` accepts as a mizan workspace (a
 * workspace `package.json`, `AGENTS.md`, and the two package subtrees the resolver requires) and runs
 * the real `main.ts` against it with `cwd` set there. What the CLI then finds is exactly what a fresh
 * clone has: a workspace and no corpus.
 *
 * ## Why the process is spawned rather than imported
 *
 * `main.ts` calls `process.exit` at module scope, so importing it would end the test runner. The exit
 * code and the line on stderr are also the two things a user actually observes, and they are the two
 * things a mocked run cannot assert.
 */

/** The smallest directory `requireRepositoryRoot` accepts, so a child process resolves it as the root. */
const syntheticCheckout = (): string => {
  const root = mkdtempSync(join(tmpdir(), "mizan-clean-clone-cli-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "mizan", workspaces: ["apps/*", "packages/*"] }), "utf8")
  writeFileSync(join(root, "AGENTS.md"), "# synthetic checkout\n", "utf8")
  mkdirSync(join(root, "packages", "mizan-verify"), { recursive: true })
  mkdirSync(join(root, "packages", "mizan-core"), { recursive: true })
  return root
}

/**
 * Run the real CLI against `cwd` and collect what a user would see.
 *
 * Bounded rather than awaited bare, and the bound is the point of this helper rather than a
 * refinement of it: `node:child_process`'s `close` event does not fire for a child that never exits,
 * so an unbounded version of this line turns a wedged CLI into a wedged suite. The three tests below
 * spend their budget running a full `main.ts` boot on a Windows host, so the shared constant is
 * exactly as wide as the slowest observation this file makes — see `subprocess-budget.ts`.
 */
const askIn = (cwd: string): Promise<{ readonly code: number; readonly stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(import.meta.dir, "..", "src", "main.ts"), "what is the definition of salah?"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString()
    })
    const closed = new Promise<number>((done) => {
      child.on("close", (code) => done(code ?? 0))
    })
    void boundedExit(
      closed,
      () => {
        child.kill()
      },
      `main.ts in ${cwd}`,
      () => stderr,
    ).then((code) => {
      resolve({ code, stderr })
    })
  })

describe("the CLI's own vocabulary", () => {
  const STATES: readonly CliCorpusState[] = ["corpus_absent", "corpus_unusable", "attestation_unreadable", "attestation_mismatch"]

  test("every state the CLI can report decodes into the shared vocabulary", () => {
    // The planted violation fails: a state added to `CliCorpusState` without a matching literal in
    // `DegradationCondition` projects to `null` here, and the MCP table is asserted the same way in
    // its own clean-clone test — so one surface cannot grow a word the other has never heard of.
    for (const state of STATES) {
      const condition = conditionOfCliState(state)
      expect(condition).not.toBeNull()
      if (condition === null) continue
      expect(decodeCondition(condition).ok).toBe(true)
    }
  })

  test("the printed line carries the condition's own name, so a reader and a scraper agree", () => {
    // `describeCondition` begins every sentence with the condition, and the CLI must not bury it
    // behind a prefix — otherwise a client matching on the word finds nothing on stderr.
    const line = describeCliState("corpus_absent", "no corpus at data/corpus.db.")
    expect(line).toContain("corpus_absent:")
    expect(line).toContain("data/corpus.db")
  })

  test("a state the vocabulary cannot name prints its own name, not a borrowed one", () => {
    // Fail closed on the projection. Reporting `corpus_absent` for a state we cannot name would claim
    // a certainty we do not have, which is the one thing this vocabulary exists to prevent.
    const line = describeCliState("tafsir_unavailable" as CliCorpusState, "no backend ships")
    expect(line).toBe("tafsir_unavailable: no backend ships")
    expect(line).not.toContain("corpus_absent")
  })
})

describe("the CLI on a checkout with no corpus", () => {
  test("the planted violation fails: a missing corpus is `corpus_absent` and a non-zero exit", async () => {
    const root = syntheticCheckout()
    try {
      const { code, stderr } = await askIn(root)
      expect(code).not.toBe(0)
      // The word a customer compares across surfaces, on the surface the operator reads.
      expect(stderr).toContain("corpus_absent:")
      // And no stack trace: a crash is one of the states the degradation matrix forbids. Bun prints a
      // trace as lines beginning with whitespace then `at `, so that shape is what is asserted —
      // rather than a bare `at `, which the sentence "…no corpus at data/corpus.db" contains.
      expect(stderr).not.toContain("SQLITE_")
      expect(stderr).not.toMatch(/\n\s+at /)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, SUBPROCESS_TIMEOUT_MS)

  test("a corpus that is present but is not a snapshot is `corpus_unusable`, not `corpus_absent`", async () => {
    // The state the vocabulary grew a name for, and the one that used to escape as a raw stack trace:
    // `existsSync` is satisfied by a text file and `bun:sqlite` opens it lazily, so the throw happened
    // on the first query with nothing around it. Saying "absent" here would send the operator to
    // `bun run ingest` for a file that is present and broken — which does fix it, but for a reason
    // the message must name, because an integrator reading `corpus_absent` will go looking for a
    // checkout that has no corpus at all.
    const root = syntheticCheckout()
    try {
      mkdirSync(join(root, "data"))
      writeFileSync(join(root, "data", "corpus.db"), "this is not a SQLite file\n", "utf8")
      const { code, stderr } = await askIn(root)
      expect(code).not.toBe(0)
      expect(stderr).toContain("corpus_unusable:")
      expect(stderr).not.toContain("corpus_absent:")
      expect(stderr).not.toContain("SQLITE_")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, SUBPROCESS_TIMEOUT_MS)

  test("an empty corpus file cannot state its identity, so it is `corpus_unusable` too", async () => {
    // A text file and an empty file are two shapes of the same refusal, and the difference between
    // them is not worth a test of its own: an empty file is a *valid* SQLite database holding no
    // tables, so the refusal comes from the identity read rather than the open. Asserted here so the
    // two shapes are not mistaken for two states — and so a future reader does not expect
    // `attestation_unreadable` here, which needs a real snapshot and is covered by the projection
    // table above and by `packages/mizan-mcp/test/clean-clone.test.ts`.
    const root = syntheticCheckout()
    try {
      mkdirSync(join(root, "data"))
      writeFileSync(join(root, "data", "corpus.db"), "", "utf8")
      const { code, stderr } = await askIn(root)
      expect(code).not.toBe(0)
      expect(stderr).toContain("corpus_unusable:")
      expect(stderr).not.toMatch(/\n\s+at /)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, SUBPROCESS_TIMEOUT_MS)
})
