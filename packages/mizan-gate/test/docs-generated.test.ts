import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { checkBacktickedPaths, type DocsClaim } from "../src/docs-claims.ts"
import { checkedPaths, GITIGNORE, runDocsClaimChecks } from "../src/docs-check.ts"
import { isDeclaredGenerated } from "../src/docs-generated.ts"

/**
 * Story 1 — a clean clone has to be able to run its own gate.
 *
 * `bun run check:docs` is the first step in `ci.yml`, before typecheck, tests and gates, so on a
 * clean clone it used to exit 1 over `data/corpus.db`: `DISCLOSURE.md` names the snapshot, the
 * file is gitignored and reproducible, and nobody who has just cloned the repository has it. The
 * rule that reported it is R1, the one that caught six genuinely false paths in the same document,
 * so the fix could not be to weaken R1 — it had to be to let R1 distinguish a MISSING file from a
 * DECLARED one.
 *
 * ## What makes this a gate change and not a documentation change
 *
 * The predicate is derived from the repository's own `.gitignore`, so there is no second list to
 * drift (AGENTS.md section 17), and the syntax subset it understands is deliberately partial. A
 * pattern it cannot read is skipped, which can only ADD a finding — never remove one. Every test
 * below that could pass for the wrong reason is paired with one that must fail.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const gitignore = (): string => readFileSync(join(ROOT, GITIGNORE), "utf8")

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((found) => found.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((found) => found.detail).join("\n")

describe("a declared generated artefact is in the repository even when it is not on disk", () => {
  const declared = isDeclaredGenerated(
    ["data/corpus.db", "data/registry/records.jsonl", "data/raw/", "node_modules/", ".env", "*.log"].join("\n"),
  )

  test("an anchored literal is declared", () => {
    expect(declared("data/corpus.db")).toBe(true)
    expect(declared("data/registry/records.jsonl")).toBe(true)
  })

  test("a path inside an ignored directory is declared, because git ignores it too", () => {
    expect(declared("data/raw/quran.json")).toBe(true)
    expect(declared("apps/cli/node_modules/@mizan/core/index.ts")).toBe(true)
  })

  test("the directory itself is declared when a document names it with a trailing slash", () => {
    expect(declared("data/raw/")).toBe(true)
  })

  test("an unanchored basename is declared at any depth", () => {
    expect(declared("apps/cli/.env")).toBe(true)
  })

  test("a path nothing declares is NOT declared, which is the whole point of the rule", () => {
    expect(declared("data/corpus.snapshot")).toBe(false)
    expect(declared("data/ghost.db")).toBe(false)
    expect(declared("data")).toBe(false)
  })
})

describe("the subset is chosen so that not understanding a pattern can only add a finding", () => {
  test("a wildcard pattern is not read, so a path it really ignores is still reported", () => {
    // `*.log` in git really does ignore `a/b/c.log`. This module declines to read it, so it
    // reports the path instead — the red-build direction, which is the safe one. A matcher that
    // guessed here would be guessing about every other pattern too.
    expect(isDeclaredGenerated("*.log")("a/b/c.log")).toBe(false)
  })

  test("a negated literal re-admits a path an earlier pattern ignored", () => {
    // The `!` is the whole point of this case, so it has to be in the input: two positive literals
    // would exercise nothing a two-pattern ignore does not already exercise, and the branch that
    // clears an earlier match would go unrun. Paired both ways, so neither the negation nor the
    // pattern it is supposed to override can be removed without one of the two expectations going
    // red.
    const declared = isDeclaredGenerated(["data/keep/", "!data/keep/keep.json"].join("\n"))
    expect(declared("data/keep/keep.json")).toBe(false)
    expect(declared("data/keep/drop.json")).toBe(true)
  })

  test("a negation that follows an ignore wins, because the last matching pattern does", () => {
    const declared = isDeclaredGenerated(["data/skip/", "!data/skip/keep.json"].join("\n"))
    expect(declared("data/skip/keep.json")).toBe(false)
    expect(declared("data/skip/drop.json")).toBe(true)
  })

  test("a negated wildcard is not read, so a re-admitted wildcard path is still declared", () => {
    // The one imprecision this subset has, stated as a test so it cannot become an assumption: a
    // negation this module cannot read does not clear an earlier literal. In this repository the
    // only negated pattern is `!.env.example`, which is on disk anyway, so no path is affected.
    expect(isDeclaredGenerated("data/*\n!data/keep.json")("data/keep.json")).toBe(false)
  })

  test("comments and blank lines are not patterns", () => {
    const declared = isDeclaredGenerated("# data/ghost.db\n\n   \n")
    expect(declared("data/ghost.db")).toBe(false)
  })

  test("an empty .gitignore declares nothing", () => {
    expect(isDeclaredGenerated("")("data/corpus.db")).toBe(false)
  })
})

describe("R1 reads a documented path through the declaration", () => {
  test("a declared generated artefact is not reported as a missing path", () => {
    const document = "Run `bun run ingest` to build `data/corpus.db`.\n"
    expect(rules(checkBacktickedPaths(document, "DISCLOSURE.md", isDeclaredGenerated(gitignore())))).toEqual([])
  })

  test("a path that neither exists nor is declared is still reported, with the file and the path", () => {
    const document = "See `data/corpus.snapshot` for the digest.\n"
    const claims = checkBacktickedPaths(document, "DISCLOSURE.md", isDeclaredGenerated(gitignore()))
    expect(rules(claims)).toEqual(["missing-path"])
    expect(details(claims)).toContain("data/corpus.snapshot")
  })

  test("the same document produces different findings with and without the declaration", () => {
    // The pair that makes this a decision rather than a loosening: with no `.gitignore` consulted,
    // the sentence is a false claim. With it, the sentence is a true one. Nothing about the
    // document changed.
    const document = "The snapshot lives at `data/corpus.db`.\n"
    expect(rules(checkBacktickedPaths(document, "README.md", () => false))).toEqual(["missing-path"])
    expect(rules(checkBacktickedPaths(document, "README.md", isDeclaredGenerated(gitignore())))).toEqual([])
  })
})

describe("the repository's own .gitignore is the authority, and it is read", () => {
  test("the runner reports that it read the .gitignore it consulted", () => {
    expect(checkedPaths(runDocsClaimChecks(ROOT))).toContain(GITIGNORE)
  })

  test("the real corpus paths are declared generated, so a clone is not a false claim", () => {
    const declared = isDeclaredGenerated(gitignore())
    for (const path of ["data/corpus.db", "data/registry/records.jsonl", "data/raw/quran.json", ".env"]) {
      expect(declared(path)).toBe(true)
    }
  })

  test("a path the .gitignore does not declare is still reported by the real runner", () => {
    // The repository-wide pass, through the real `.gitignore`, on a path that is genuinely absent.
    // If this ever stops failing, the declaration has become a blanket excuse.
    const claims = checkBacktickedPaths("`data/not-a-real-artefact.jsonl`\n", "README.md", isDeclaredGenerated(gitignore()))
    expect(rules(claims)).toEqual(["missing-path"])
  })
})
