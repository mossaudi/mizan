import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  ANSWER_QUALITY_PHRASES,
  checkAnswerQualityClaim,
  checkBenchmarkClaimUnbacked,
  runDocsClaimChecks,
  type DocsClaim,
  type StatedBenchmark,
} from "../src/index.ts"

/**
 * Tests for D-1's rules ten and fourteen, the two Story 6 adds.
 *
 * Both are proved the way every other rule here is proved: a document that is correct passes, and
 * a document with the defect planted fails and names itself. The runner tests at the bottom exist
 * for a different reason — a pure rule that `runDocsClaimChecks` never calls would pass every
 * assertion above it while protecting nothing, so the wiring is asserted separately.
 */

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((claim) => claim.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((claim) => `${claim.rule}: ${claim.detail}`).join("\n")

/** The published figures, transcribed so the fixtures read like the artefact rather than like a mock. */
const ARTEFACT = JSON.stringify({
  schemaVersion: 2,
  caseCount: 40,
  systemDetectionRate: 1,
  systemAgreementRate: 1,
  systemAbstentionRate: 0,
  baselineTop1HitRate: 0.65,
  delta: 0.35,
  falseVerifiedCount: 0,
  systemArmSource: "executed-verifier",
})

const backed: StatedBenchmark = { path: "data/benchmark/vs-search.json", text: ARTEFACT }
const absent: StatedBenchmark = { path: "data/benchmark/vs-search.json", text: null }

const report = (document: string, artefact: StatedBenchmark = backed, file = "docs/value-proof.md"): readonly DocsClaim[] =>
  checkBenchmarkClaimUnbacked(document, file, artefact)

describe("R10 — a benchmark figure must be one the committed artefact publishes", () => {
  test("passes a benchmark section written entirely in the artefact's own figures", () => {
    const honest = [
      "## The benchmark",
      "",
      "The baseline top-1 hit rate was 65.0% and the system detection rate was 100.0%.",
      "The system abstention rate was 0.0%, false-verified was 0, and the delta was +35.0 pp over 40 cases.",
      "",
      "| Artefact field | Figure |",
      "| --- | --- |",
      "| `baselineTop1HitRate` | **65.0%** |",
      "| `systemDetectionRate` | **100.0%** |",
      "| `delta` | **+35.0 pp** |",
    ].join("\n")
    expect(details(report(honest))).toBe("")
  })

  test("names a figure the artefact does not publish — the number added without an artefact", () => {
    // Story 6's negative acceptance criterion, planted. The remediation is in the message: the
    // figure is the defect, and the message says which file could back it.
    const drift = "## The benchmark\n\nThe system detection rate was 99.0% of fabrications.\n"
    const claims = report(drift)
    expect(rules(claims)).toEqual(["benchmark-claim-unbacked"])
    expect(details(claims)).toContain("99.0")
    expect(details(claims)).toContain("data/benchmark/vs-search.json")
  })

  test("names a figure stated for a quantity that disagrees with the artefact", () => {
    // Backing alone would pass this: `65.0` is a figure the artefact publishes, just not the one
    // being attributed here. Attribution is the second half of the rule.
    const wrong = "## The benchmark\n\nThe system detection rate was 65.0%.\n"
    expect(details(report(wrong))).toContain("systemDetectionRate")
    expect(details(report(wrong))).toContain("publishes 1")
  })

  test("names a table row whose figure disagrees with the row's own field", () => {
    const row = ["## The benchmark", "", "| Field | Figure |", "| --- | --- |", "| `falseVerifiedCount` | **3** |"].join("\n")
    const claims = report(row)
    expect(rules(claims)).toEqual(["benchmark-claim-unbacked"])
    expect(details(claims)).toContain("`falseVerifiedCount`")
  })

  test("names a row labelling a field the artefact does not publish", () => {
    const row = ["## The benchmark", "", "| Field | Figure |", "| --- | --- |", "| `hallucinationRate` | **3** |"].join("\n")
    // `hallucinationRate` is not one of rule ten's quantities, so the row is only checked as an
    // unbacked figure — and `3` is not published. What must NOT happen is silence.
    expect(rules(report(row))).toEqual(["benchmark-claim-unbacked"])
  })

  test("does not mistake a different number in the same sentence for the quantity's figure", () => {
    // The connector test. A window would read "40" as the detection rate and report a correct
    // document; the figure the sentence actually states is the one after `is`.
    const sentence = "## The benchmark\n\nThe system detection rate, measured over 40 cases, is 100.0%.\n"
    expect(details(report(sentence))).toBe("")
  })

  test("ignores digits inside a fingerprint, a query grammar and a table separator", () => {
    const noise = [
      "## The benchmark",
      "",
      "Fingerprint `7b3b66fbca7fb9df471b49524f31409391addea87f8d0f262d84f7812a48240d`, baseline `fts5-bm25`, k = 1.",
      "",
      "| --- | --- |",
    ].join("\n")
    expect(details(report(noise))).toBe("")
  })

  test("leaves a figure stated outside any benchmark section alone, because another rule owns it", () => {
    // The comparison table's sourced market figures are not benchmark claims, and a rule that
    // reported them would force the pack to stop citing its sources.
    expect(details(report("## What the market says\n\nCitation accuracy sits near 74% across search-class products.\n"))).toBe("")
  })

  test("reports a section that states figures when the artefact is missing, rather than skipping it", () => {
    // Fail closed (AGENTS §3): an absent artefact is not a licence to print.
    const claims = report("## The benchmark\n\nThe system detection rate was 100.0%.\n", absent)
    expect(rules(claims)).toEqual(["benchmark-claim-unbacked"])
    expect(details(claims)).toContain("missing or unreadable")
  })

  test("says nothing about a section that states no figure", () => {
    expect(details(report("## The benchmark\n\nHow the arms are run, and why they are independent.\n", absent))).toBe("")
  })

  test("keeps checking past a `# comment` inside a fenced block", () => {
    // The fence is what stops a shell comment from ending the section it is documenting, and the
    // figure on the far side of it is exactly where a hand edit would go.
    const fenced = ["## The benchmark", "", "```bash", "# print the figures", "bun run benchmark:vs-search", "```", "", "The system detection rate was 99.0%."].join("\n")
    expect(rules(report(fenced))).toEqual(["benchmark-claim-unbacked"])
  })
})

describe("R14 — no audited document may claim answer or retrieval quality", () => {
  test("passes a document that makes no such claim", () => {
    const honest = ["# Value proof", "", "Search attaches citations; mizan adjudicates them.", "", "Answer generation is out of scope (ADR-C2)."].join("\n")
    expect(checkAnswerQualityClaim(honest, "docs/value-proof.md")).toEqual([])
  })

  test("names an assertive answer-quality claim, with the line it is on", () => {
    const claims = checkAnswerQualityClaim("# pack\n\nmizan outperforms every search engine ever built.\n", "docs/value-proof.md")
    expect(rules(claims)).toEqual(["answer-quality-claim"])
    expect(details(claims)).toContain("line 3")
    expect(details(claims)).toContain("ADR-C2")
  })

  test("every phrase in the banned list actually fires", () => {
    // A banned-phrase list with one dead regex in it is a silent hole: the list looks long and
    // one shape passes. Each entry is proved against its own sentence.
    const samples = [
      "we outperform the competition",
      "mizan produces better answers",
      "mizan gives more accurate answers",
      "mizan gives superior answers",
      "mizan gives more reliable answers",
      "mizan delivers higher answer quality",
      "answer quality is better than before",
      "the answers are better than the baseline's",
    ]
    expect(ANSWER_QUALITY_PHRASES).toHaveLength(samples.length)
    for (const [index, sample] of samples.entries()) {
      const claims = checkAnswerQualityClaim(sample, "docs/value-proof.md")
      expect(`phrase ${index}: ${details(claims)}`).toContain("answer-quality-claim")
    }
  })

  test("matches case-insensitively, because a claim is a claim however it is capitalised", () => {
    expect(rules(checkAnswerQualityClaim("Mizan Outperforms Everything.", "README.md"))).toEqual(["answer-quality-claim"])
  })

  test("cannot read intent: declining to make the claim still contains it, so the pack never quotes one", () => {
    // Documented, not accidental. A rule that parsed negation would be a rule nobody could predict
    // from reading it, so the list is literal and `docs/value-proof.md` states its scope as a
    // scope ("answer generation is out of scope") rather than as a denial.
    const declined = "mizan does not claim better answers than anyone else"
    expect(rules(checkAnswerQualityClaim(declined, "docs/value-proof.md"))).toEqual(["answer-quality-claim"])
  })
})

/** Write `files` into a fresh temp directory and return its path. */
const tree = (files: Readonly<Record<string, string>>): string => {
  const root = join(tmpdir(), `mizan-value-${crypto.randomUUID()}`)
  for (const [relative, body] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body, "utf8")
  }
  return root
}

describe("the runner actually applies rules ten and fourteen", () => {
  test("audits the pack and the benchmark artefact, and reports an unbacked figure", () => {
    // The wiring, not the rule: a pure function nothing calls would pass every test above.
    const root = tree({
      "docs/value-proof.md": "## The benchmark\n\nThe system detection rate was 99.0%.\n",
      "data/benchmark/vs-search.json": ARTEFACT,
    })
    const result = runDocsClaimChecks(root)
    expect(rules(result.claims)).toContain("benchmark-claim-unbacked")
    expect(result.checked).toContain("docs/value-proof.md")
    expect(result.checked).toContain("data/benchmark/vs-search.json")
  })

  test("audits the pack for answer-quality claims too", () => {
    const root = tree({
      "docs/value-proof.md": "# pack\n\nmizan outperforms everything.\n",
      "data/benchmark/vs-search.json": ARTEFACT,
    })
    expect(rules(runDocsClaimChecks(root).claims)).toContain("answer-quality-claim")
  })

  test("an absent pack is not a failure, because audited is not the same as required", () => {
    const result = runDocsClaimChecks(tree({ "data/benchmark/vs-search.json": ARTEFACT }))
    expect(rules(result.claims)).not.toContain("benchmark-claim-unbacked")
    expect(result.checked).not.toContain("docs/value-proof.md")
  })
})
