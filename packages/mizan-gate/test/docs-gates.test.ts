import { describe, expect, test } from "bun:test"
import { checkGateCountClaim, extractGateCountClaims } from "../src/docs-gates.ts"
import { GATE_IDS, HIGHEST_GATE_ID, runGates } from "../src/run-gates.ts"
import { findRepositoryRoot } from "../src/repo-root.ts"
import type { GateId } from "../src/scan.ts"

/**
 * R8 — the gate-count rule's self-test.
 *
 * **Fixtures are built from fragments, deliberately.** This file is itself scanned by R8, because
 * `docs-check.ts` discovers its inputs by walking the tree rather than from an allowlist. A literal
 * stale range written here would therefore be a stale claim in the repository, and the build would
 * be red for the right reason and the wrong one at the same time. This is the same discipline as
 * G-7 exporting `ANCHOR_BANNED_WORD` "so the self-test plants exactly this and not a paraphrase":
 * the fixture is assembled, not typed.
 *
 * The real-tree assertion for this rule is not duplicated here. `docs-claims.test.ts` already runs
 * `runDocsClaimChecks` against the actual repository and asserts it is green, and R8 is part of that
 * call — so this file carries the rule's discrimination and the one thing that assertion cannot
 * cover, which is that `GATE_IDS` still matches what the runner runs.
 */
const range = (from: number, to: number): string => `G-${String(from)}..G-${String(to)}`
const cardinal = (word: string): string => `${word} structural gates`

/** The truth a correct file agrees with. Seven gates, ending on G-7. */
const truth: readonly GateId[] = ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"]

/** G-4 needs the gitleaks binary, so the runner self-test skips it. */
const WITHOUT_GITLEAKS = truth.filter((id) => id !== "G-4")

describe("GATE_IDS is the gate set, derived from the runner", () => {
  test("is ascending and ends on the highest id", () => {
    expect(GATE_IDS).toEqual(truth)
    expect(HIGHEST_GATE_ID).toBe("G-7")
  })

  test("names exactly the gates runGates runs, with no extras", async () => {
    // The single-source-of-truth guard. `GATE_IDS` is what the documentation is checked against,
    // so if a gate could be added to the runner without joining `GATE_IDS` — or join `GATE_IDS`
    // without the runner running it — every count in the repository would be checked against the
    // wrong number while still reporting green.
    const root = findRepositoryRoot(import.meta.dir)
    if (root === null) throw new Error("no repository root above the gate package")
    const outcomes = await runGates({ root, skipGitleaks: true })
    const ran = outcomes.map((outcome) => outcome.gate).sort()
    expect(ran).toEqual(WITHOUT_GITLEAKS)
    // G-4 is the skippable one, so it is absent from that list and must be in the table anyway.
    expect(GATE_IDS).toContain("G-4")
  }, 300_000)
})

describe("extractGateCountClaims", () => {
  test("reads a dotted range and takes its upper bound", () => {
    expect(extractGateCountClaims(`structural gates ${range(1, 7)}`)).toEqual([
      { kind: "range", value: 7, text: range(1, 7) },
    ])
  })

  test("reads the ellipsis, en-dash and word separators", () => {
    for (const separator of ["..", "...", "…", "–", "—", " to ", " through "]) {
      const claims = extractGateCountClaims(`G-1${separator}G-7`)
      expect(claims).toHaveLength(1)
      expect(claims[0]?.value).toBe(7)
    }
  })

  test("reads a qualified cardinal count", () => {
    expect(extractGateCountClaims(`run the ${cardinal("seven")} first`)).toEqual([
      { kind: "cardinal", value: 7, text: cardinal("seven") },
    ])
  })

  test("reads the same count written in digits, and as a run for two digits", () => {
    // The branch that was missing. Words only was the shipped state, so the rule could not see one
    // of the two ways a person writes a count — and a claim of coverage that its own pattern does
    // not have is the defect `scan.ts` names as worse than a stated blind spot. Two plants, because
    // the second is a different mechanism: a listed alternative per value reads one digit and a
    // digit *run* reads a count nobody listed.
    expect(extractGateCountClaims(`run the ${cardinal("4")} first`)).toEqual([{ kind: "cardinal", value: 4, text: cardinal("4") }])
    expect(extractGateCountClaims(`run the ${cardinal("12")} first`)).toEqual([{ kind: "cardinal", value: 12, text: cardinal("12") }])
  })

  test("the two spellings of one count are read as the same number", () => {
    // The reason the digits branch exists rather than a second list of words: the word form and the
    // digit form are one sentence, and a rule that graded them differently would be grading the
    // typography. Built from the helper, so neither spelling is written out in this file — the file
    // is scanned by the rule it is testing.
    const spelled = extractGateCountClaims(cardinal("four"))
    const figured = extractGateCountClaims(cardinal("4"))
    expect(spelled[0]?.value).toBe(4)
    expect(figured[0]?.value).toBe(4)
  })

  test("a digit count with no qualifier is still not a claim", () => {
    // The `structural` requirement does not weaken for the new spelling. Without this, the digit
    // branch would swallow the two unrelated senses of `gate` the header documents, and a rule that
    // cries wolf is switched off rather than narrowed.
    expect(extractGateCountClaims("CI runs 4 gates.")).toEqual([])
    expect(extractGateCountClaims("the 2 gate G-6 can check")).toEqual([])
  })

  test("does not assemble a range out of a sub-rule id and a gate id", () => {
    // G-6.5 is a rule inside G-6. Reading "G-6.5 and G-7" as a range ending at 5 would be a
    // false positive on a true sentence, which is how a check gets switched off.
    expect(extractGateCountClaims("G-6.5 and G-7 both fail")).toEqual([])
  })

  test("does not read the gate number out of a sub-rule at the END of a range", () => {
    // The other end, and the one the head test above does not cover. `G-6.5` is not a gate, so
    // reporting "6" from a range that ends on a sub-rule would call a true sentence stale. The
    // fixture is assembled for the reason in this file's header: written out literally, the second
    // of these two strings is itself a claim `docs-check.ts` would report in this file.
    expect(extractGateCountClaims(`gates ${range(1, 6)}.5 cover the tree`)).toEqual([])
    // And a multi-digit id is still read whole: the `6` of `65` must not be taken as the bound.
    expect(extractGateCountClaims(`gates ${range(1, 65)}.5 cover the tree`)).toEqual([])
  })

  test("orders findings by code unit, not by the machine's locale", () => {
    // The determinism requirement. ICU collation orders `seven` before `Seven`; UTF-16 code units
    // order `S` before `s`. A locale-aware sort therefore produces a different report on a
    // full-ICU host than on a small-ICU one for the same commit, which is the machine-dependence
    // `byCodeUnit` exists to remove. Pinned by code unit, so this test passes identically
    // everywhere and fails on any host that reintroduces `localeCompare`.
    const shouted = cardinal("Seven")
    const whispered = cardinal("seven")
    expect(extractGateCountClaims(`${shouted} and ${whispered}`)).toEqual([
      { kind: "cardinal", value: 7, text: shouted },
      { kind: "cardinal", value: 7, text: whispered },
    ])
  })

  test("does not read a bare cardinal that does not say structural", () => {
    // All three are true sentences in this repository, about two senses of "gate" that have
    // nothing to do with the gate suite. They are named here so the omission stays a decision.
    expect(extractGateCountClaims("## The two gates, and why their bars differ")).toEqual([])
    expect(extractGateCountClaims("the one gate G-6 can check")).toEqual([])
    expect(extractGateCountClaims(`${"six"} gates clean`)).toEqual([])
  })

  test("does not read a gate id that is merely listed", () => {
    expect(extractGateCountClaims(truth.map((id) => `"${id}"`).join(", "))).toEqual([])
  })

  test("is case-insensitive on the cardinal word", () => {
    const shouted = ["Six", "Structural", "Gates"].join(" ")
    expect(extractGateCountClaims(shouted)).toEqual([{ kind: "cardinal", value: 6, text: shouted }])
  })
})

describe("checkGateCountClaim", () => {
  test("a correct range passes", () => {
    expect(checkGateCountClaim(`structural gates ${range(1, 7)}`, "README.md", truth)).toEqual([])
  })

  test("a correct cardinal passes", () => {
    expect(checkGateCountClaim(`the ${cardinal("seven")} run in CI`, "README.md", truth)).toEqual([])
  })

  test("a stale range fails and names the truth", () => {
    const claims = checkGateCountClaim(`structural gates ${range(1, 6)}`, "README.md", truth)
    expect(claims).toHaveLength(1)
    expect(claims[0]?.rule).toBe("gate-count-stale")
    expect(claims[0]?.file).toBe("README.md")
    expect(claims[0]?.detail).toContain("7 (G-1, G-2, G-3, G-4, G-5, G-6, G-7)")
  })

  test("a stale cardinal fails", () => {
    const claims = checkGateCountClaim(`the ${cardinal("six")} run in CI`, "DISCLOSURE.md", truth)
    expect(claims).toHaveLength(1)
    expect(claims[0]?.rule).toBe("gate-count-stale")
  })

  test("a stale cardinal written in digits fails the same way, and names the truth", () => {
    // The end-to-end form of the digit branch: a rule that flagged the word form and let the digit
    // form past would be a rule a document can defeat by picking a font, so the discrimination is
    // asserted through `checkGateCountClaim` rather than only on the extraction above.
    const claims = checkGateCountClaim(`the ${cardinal("4")} run in CI`, "README.md", truth)
    expect(claims).toHaveLength(1)
    expect(claims[0]?.rule).toBe("gate-count-stale")
    expect(claims[0]?.detail).toContain("7 (G-1, G-2, G-3, G-4, G-5, G-6, G-7)")
  })

  test("a correct cardinal in digits passes", () => {
    expect(checkGateCountClaim(`the ${cardinal("7")} run in CI`, "README.md", truth)).toEqual([])
  })

  test("a range ending past the top gate fails too", () => {
    expect(checkGateCountClaim(`structural gates ${range(1, 8)}`, "AGENTS.md", truth)).toHaveLength(1)
  })

  test("the rule discriminates: planting a wrong truth fails a file that was correct", () => {
    // Without this, a rule that returned [] unconditionally would pass every test above.
    expect(checkGateCountClaim(`structural gates ${range(1, 7)}`, "README.md", ["G-1", "G-2"])).toHaveLength(1)
  })

  test("a file that makes no claim produces no findings", () => {
    expect(checkGateCountClaim("G-1 bans similarity and G-7 re-asserts it.", "docs/x.md", truth)).toEqual([])
  })

  test("an empty gate set makes no claim, so nothing can be wrong", () => {
    expect(checkGateCountClaim(`structural gates ${range(1, 6)}`, "README.md", [])).toEqual([])
  })

  test("a range is judged against the top id and a cardinal against the count", () => {
    // Six declared gates whose highest id is G-7 — a retired id. Both sentences are then true,
    // and a rule that compared each against the other's quantity would reject one of them.
    const retired: readonly GateId[] = ["G-1", "G-2", "G-3", "G-4", "G-5", "G-7"]
    expect(checkGateCountClaim(`structural gates ${range(1, 7)}`, "a.md", retired)).toEqual([])
    expect(checkGateCountClaim(`the ${cardinal("six")} run in CI`, "a.md", retired)).toEqual([])
  })

  test("a range ending on a sub-rule is not a claim, so it cannot be stale", () => {
    // The end-to-end form of the extraction test: a line about sub-rules must produce no finding
    // even though the digit before the dot would otherwise be compared against the gate count.
    expect(checkGateCountClaim(`gates ${range(1, 6)}.5 cover the tree`, "README.md", truth)).toEqual([])
  })
})
