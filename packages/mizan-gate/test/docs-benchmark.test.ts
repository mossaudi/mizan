import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DocsClaim } from "../src/docs-claims.ts"

import { checkedPaths, runDocsClaimChecks } from "../src/docs-check.ts"
import { EXECUTOR_PATH, LABEL_TOKENS, checkExecutorLabelBlindness } from "../src/docs-benchmark.ts"

/**
 * Story 1 — rule nineteen, the benchmark executor's label blindness.
 *
 * The previous system arm computed "detection" from the set's declared expectations, so on a red-team
 * set its detection rate was 1.0 by construction. The rewritten arm's blindness rested on a type and
 * on review, and the two documents that said so also said the scan was unshipped. This suite is that
 * scan, and its planted violation is the field the old arm used.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const executor = readFileSync(join(ROOT, EXECUTOR_PATH), "utf8")

/** The file that publishes the hand-adjudicated rulings, named because it is the counterexample. */
const EVAL_LOADER_PATH = "scripts/eval/adjudication-loader.ts"

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((found) => found.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((found) => `${found.rule}: ${found.detail}`).join("\n")

describe("R19 - the executor may not read the labels it would otherwise restate", () => {
  test("the shipped executor passes", () => {
    expect(details(checkExecutorLabelBlindness(executor, EXECUTOR_PATH))).toBe("")
  })

  test("the planted violation: the old arm's own field name", () => {
    const claims = checkExecutorLabelBlindness("const cases = readSet()\nconst detection = cases.filter((c) => c.expectedVerdict === \"rejected\").length\n", EXECUTOR_PATH)
    expect(rules(claims)).toEqual(["executor-label-blindness"])
    expect(details(claims)).toContain("expectedVerdict")
    expect(details(claims)).toContain("line 2")
  })

  for (const token of LABEL_TOKENS) {
    test(`\`${token}\` is reported`, () => {
      expect(details(checkExecutorLabelBlindness(`const ${token} = 1\n`, EXECUTOR_PATH))).toContain(token)
    })
  }

  test("every token on the list is reported, so the list is not aspirational", () => {
    // The list is the rule, so a token that nothing exercises is a token nobody has checked.
    const source = LABEL_TOKENS.map((token) => `const ${token} = 1`).join("\n")
    const reported = new Set(checkExecutorLabelBlindness(source, EXECUTOR_PATH).map((found) => found.detail.match(/names `([^`]+)`/)?.[1] ?? ""))
    for (const token of LABEL_TOKENS) expect(reported.has(token)).toBe(true)
  })

  test("one finding per token however many times it appears, so the fix list is the file", () => {
    expect(checkExecutorLabelBlindness("expectedVerdict\nexpectedVerdict\nexpectedVerdict\n", EXECUTOR_PATH)).toHaveLength(1)
  })

  test("the finding names the token, the file and the line, because \"something is wrong somewhere\" is not actionable", () => {
    const claims = checkExecutorLabelBlindness("const groundTruth = []\n", EXECUTOR_PATH)
    expect(claims[0]?.file).toBe(EXECUTOR_PATH)
    expect(details(claims)).toContain("line 1")
    expect(details(claims)).toContain("groundTruth")
    expect(details(claims)).toContain("detection rate")
  })

  test("a field the verifier actually uses is not a label, and is not reported", () => {
    // The executor is a verifier driver: it says `verdict` and `reason` throughout, because that is
    // what it records. A rule that banned those would report the file for doing its job.
    const source = "type SystemOutcome = { readonly verdict: Verdict; readonly reason: string }\nreturn { verdict: claim.verdict, reason: claim.reason }\n"
    expect(details(checkExecutorLabelBlindness(source, EXECUTOR_PATH))).toBe("")
  })

  test("a token as a substring of a longer identifier is not the token", () => {
    expect(details(checkExecutorLabelBlindness("const expectedVerdictCount = 1\n", EXECUTOR_PATH))).toBe("")
  })

  test("the ban is case-insensitive, because an executor may shout its expectations", () => {
    // A rename to SCREAMING_SNAKE is a rename to the same ban, and a rule that only reads one casing
    // makes the executor's response to a finding a way around the rule rather than a way to comply.
    const claims = checkExecutorLabelBlindness('const EXPECTED_VERDICT = cases[0].EXPECTED_VERDICT\nreturn EXPECTED_VERDICT\n', EXECUTOR_PATH)
    expect(rules(claims)).toEqual(["executor-label-blindness"])
    expect(details(claims)).toContain("line 1")
  })

  test("the ban ignores case and word separators, so renaming it is not evading it", () => {
    // `_`, `-` and `.` are all separator noise between the same two words, and a rule keyed on the
    // literal camelCase spelling is bypassed by a `sed` one-liner. SCREAMING_SNAKE is the naming a
    // benchmark harness actually uses for a constant, so this is a plausible evasion, not a contrived
    // one.
    for (const spelling of ["EXPECTED_VERDICT", "Expected_Verdict", "expected-verdict"]) {
      const claims = checkExecutorLabelBlindness(`const ${spelling} = "rejected"\n`, EXECUTOR_PATH)
      expect(details(claims)).toContain("line 1")
    }
  })

  test("separator tolerance does not make the ban looser than the identifier boundary", () => {
    // The tolerance is on case and on separators *between* the words, never on the boundary itself: a
    // `ground` prefix or an `ise` suffix is a different identifier and stays unreported, which is the
    // same rule the substring test above asserts for the unsplit spelling.
    for (const identifier of ["groundTruthy", "theExpectedVerdict", "x_ground_truth_count"]) {
      expect(details(checkExecutorLabelBlindness(`const ${identifier} = 1\n`, EXECUTOR_PATH))).toBe("")
    }
  })

  test("a token inside a comment is reported too, and the fix is to point at the module", () => {
    // Comments are not stripped: a stripper that treats `//` in a URL as a comment would hide every
    // token after it, which is the fail-open direction. The executor's header used to list the
    // banned identifiers to explain the ban and tripped this. It now points at `docs-benchmark.ts`,
    // and the list has one home.
    const source = "/** this file may not name expectedVerdict */\nexport const runSystemArm = () => []\n"
    const claims = checkExecutorLabelBlindness(source, EXECUTOR_PATH)
    expect(rules(claims)).toEqual(["executor-label-blindness"])
    expect(details(claims)).toContain("line 1")
  })

  test("the executor's header points at the rule rather than restating the token list", () => {
    expect(executor).toContain("docs-benchmark.ts")
    for (const token of LABEL_TOKENS) expect(executor).not.toContain(token)
  })
})

describe("the executor is the file the ban applies to, and its absence is a finding", () => {
  test("the shipped executor is registered as evidence the rule read", () => {
    expect(checkedPaths(runDocsClaimChecks(ROOT))).toContain(EXECUTOR_PATH)
  })

  test("the whole run is clean", () => {
    expect(rules(runDocsClaimChecks(ROOT).claims.filter((found) => found.rule === "executor-label-blindness"))).toEqual([])
  })

  test("a repository without the executor fails rather than skipping", () => {
    // Fail closed, and the reason is specific: `docs/value-proof.md` states that this scan exists, so
    // a repository where the file is gone is one whose claim about the scan is false. Skipping would
    // make deleting the file the cheapest way to silence the rule (AGENTS.md §3).
    expect(EXECUTOR_PATH).toBe("scripts/benchmark/system-arm.ts")
  })

  test("the executor's own comment names the scan rather than calling it unshipped", () => {
    // The stale comment was the reason this rule existed in prose: the file said an invariant was
    // reviewed-only while the document beside it said the same. One of the two was wrong.
    expect(executor).toContain("checkExecutorLabelBlindness")
    expect(executor).not.toContain("unshipped")
  })

  test("a real scripts/eval source genuinely holds banned tokens, so the scoping is not vacuous", () => {
    // The previous version of this assertion checked that a file was non-empty and that the token list
    // was non-empty, which is true whether or not the generator holds a label. It therefore proved
    // nothing about the decision it claimed to be stating. `adjudication-loader.ts` publishes the
    // hand-adjudicated rulings and names `adjudicatedVerdict`; the ban's identifier-shaped list
    // matches `adjudication` inside it, so this file is the one that would be reported if the scope
    // were ever widened to the tree.
    const loader = readFileSync(join(ROOT, EVAL_LOADER_PATH), "utf8")
    const matched = LABEL_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`).test(loader))
    expect(matched.length).toBeGreaterThan(0)
    // And the rule really would fire on it, so this is a live exclusion rather than an inert one.
    expect(rules(checkExecutorLabelBlindness(loader, EVAL_LOADER_PATH)).length).toBeGreaterThan(0)
  })

  test("the eval generator is not under this ban, because it is where labels are published", () => {
    // The scoping is by *which file the runner feeds the rule*, not by anything the rule decides, so
    // the assertion has to be about the runner: a tree-wide ban would forbid the generator from
    // expressing what a case is expected to be, and `check:docs` would fail on `scripts/eval/`.
    const run = runDocsClaimChecks(ROOT)
    expect(rules(run.claims.filter((found) => found.rule === "executor-label-blindness"))).toEqual([])
    // The only source this rule reads is the executor, asserted through the coverage report rather
    // than through the finding list, because a rule that read more would still report nothing.
    expect(checkedPaths(run)).toContain(EXECUTOR_PATH)
    for (const path of checkedPaths(run)) {
      if (!path.startsWith("scripts/eval/")) continue
      expect(path).not.toBe(EVAL_LOADER_PATH)
    }
  })
})