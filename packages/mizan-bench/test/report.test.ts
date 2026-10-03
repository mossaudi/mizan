import { describe, expect, test } from "bun:test"
import type { Citation, ClaimVerdict, Verdict, VerdictReason } from "@mizan/core"
import { CASE_SCORINGS, buildReport, buildSuite, casePassed, failedSuite, failingCases, percentOf, renderReport, scoringOf, type BenchCase, type CaseOutcome } from "../src/index.ts"

/**
 * Benchmark metric tests.
 *
 * ## What each test is trying to catch
 *
 * The previous harness reported `Overall SSR: 100.0%` while computing `passCount / totalCases`,
 * and reported thirty-one cases when seventeen had been evaluated. Both were true on the run that
 * printed them. So every headline below is checked against the number a reader would compute by
 * hand from the counts beside it, and the two conflations get their own tests:
 *
 *  - **SSR is not a pass rate.** `report.ssr` must equal `supportedSentences / totalSentences`,
 *    and a suite whose every case passed while one sentence was unsupported must not print 100%.
 *  - **A derived suite is not totalled.** The HALLMARK roll-up re-prints the red-team outcomes, so
 *    the totals must count seventeen cases and not thirty-one.
 *
 * ## The fabricated case that verifies is a fixture, not a hope
 *
 * `fabricatedVerified` builds the outcome the harness exists to report and a correct verifier will
 * never produce. Without it the false-positive-rate tests would be asserting that 0/14 is 0 — which
 * is what the metric would read if the division were accidentally the wrong way round, and the
 * assertion would still pass.
 */

const CITATION: Citation = { collection: "tirmidhi", number: "1", grade: null, raw: "tirmidhi:1" }

/** A real `ClaimVerdict`, in the shape `verifyAnswer` produces. */
const outcome = (claimId: string, verdict: Verdict, reason: VerdictReason = "exact_containment"): ClaimVerdict => ({
  claimId,
  verdict,
  reason,
  matchStrength: verdict === "verified" ? { kind: "exact", percent: 100 } : { kind: "none" },
  evidence: null,
})

const benchCase = (overrides: Partial<BenchCase> & Pick<BenchCase, "id" | "expectedVerdict" | "fabricated">): BenchCase => ({
  claimText: "A claim resting on a cited record.",
  quote: "a verbatim span",
  citations: [CITATION],
  ...overrides,
})

/**
 * One case paired with the verdict it received.
 *
 * The verdict carries the CASE's id, because `computeSsr` joins sentences to claims by
 * `claimId` — a verdict stamped with a placeholder id would leave every sentence ungrounded, and
 * the suite's SSR would read 0 for a fixture that verified everything.
 */
const judged = (bench: BenchCase, verdict: Verdict, reason: VerdictReason = "exact_containment"): CaseOutcome => ({
  case: bench,
  verdict: outcome(bench.id, verdict, reason),
})

const golden = (id: string): BenchCase =>
  benchCase({ id, expectedVerdict: "verified", fabricated: false, prose: `A verified claim ${id}.`, claimText: `A verified claim ${id}.` })

const fabrication = (id: string): BenchCase =>
  benchCase({ id, expectedVerdict: "unverifiable", fabricated: true, claimText: "FABRICATED_TEXT." })

describe("casePassed — the two scoring modes, and what each refuses", () => {
  test("`exact` is exact: a verdict that differs from the expectation fails", () => {
    // The default, and the mode every golden case and every HALLMARK fixture is held to. Absent
    // `scoredBy` must mean `exact`, or adding the mode below would silently weaken every existing case.
    for (const [expected, actual] of [["verified", "rejected"], ["verified", "unverifiable"], ["rejected", "unverifiable"], ["unverifiable", "rejected"]] as const) {
      const bench = benchCase({ id: "c", expectedVerdict: expected, fabricated: true })
      expect(casePassed({ case: bench, verdict: outcome("c", actual) })).toBe(false)
    }
    const bench = benchCase({ id: "c", expectedVerdict: "verified", fabricated: false })
    expect(casePassed({ case: bench, verdict: outcome("c", "verified") })).toBe(true)
  })

  test("`never_verified` fails on exactly one input, and that input is the false positive", () => {
    // Three verdicts in `@mizan/core`, so the two modes differ over one. The one they differ on is
    // `verified`: the fabrication bar is "this may not come back verified", not "this must return a
    // particular other verdict". A case that came back `rejected` and one that abstained as
    // `unverifiable` both satisfy it, which is why the committed fabrications are held to it.
    const bench = benchCase({ id: "rt", expectedVerdict: "rejected", fabricated: true, scoredBy: "never_verified" })
    expect(casePassed({ case: bench, verdict: outcome("rt", "rejected") })).toBe(true)
    expect(casePassed({ case: bench, verdict: outcome("rt", "unverifiable", "no_matching_evidence") })).toBe(true)
    expect(casePassed({ case: bench, verdict: outcome("rt", "verified") })).toBe(false)
  })

  test("the mode never moves the false-positive rate, so it cannot launder a fabrication", () => {
    // The reason a second mode is defensible at all: the suite fails AND the rate that must be zero
    // counts it. A mode that only softened the pass bit would be a way to publish 100% over 40
    // fabrications while one of them verified.
    const suite = buildSuite("redteam-eval", [
      judged(benchCase({ id: "rt-1", expectedVerdict: "rejected", fabricated: true, scoredBy: "never_verified" }), "unverifiable", "no_matching_evidence"),
      judged(benchCase({ id: "rt-2", expectedVerdict: "rejected", fabricated: true, scoredBy: "never_verified" }), "verified"),
    ])
    expect(suite.metrics.counts.passedCases).toBe(1)
    expect(suite.metrics.falsePositiveRate).toBe(0.5)
    expect(suite.cases.map((entry) => entry.scoredBy)).toEqual(["never_verified", "never_verified"])
  })

  test("scoringOf answers the same way for an absent mode as the arithmetic above assumes", () => {
    expect(scoringOf(benchCase({ id: "c", expectedVerdict: "verified", fabricated: false }))).toBe("exact")
    expect(scoringOf(benchCase({ id: "c", expectedVerdict: "rejected", fabricated: true, scoredBy: "never_verified" }))).toBe("never_verified")
    // The vocabulary is closed, so a renderer cannot be handed a mode it has no word for.
    expect(CASE_SCORINGS).toEqual(["exact", "never_verified"])
  })

  test("a suite that mixes modes says so when rendered", () => {
    const mixed = buildSuite("mixed", [
      judged(benchCase({ id: "g-1", expectedVerdict: "verified", fabricated: false }), "verified"),
      judged(benchCase({ id: "rt-1", expectedVerdict: "rejected", fabricated: true, scoredBy: "never_verified" }), "unverifiable", "no_matching_evidence"),
    ])
    expect(renderReport(buildReport([mixed]))).toContain("mixed [scored: never_verified]")
  })

  test("a suite scored only exactly says nothing, so a caveat is never decoration", () => {
    const exact = buildSuite("golden-eval", [judged(benchCase({ id: "g-1", expectedVerdict: "verified", fabricated: false }), "verified")])
    expect(renderReport(buildReport([exact]))).not.toContain("scored:")
  })
})

describe("buildSuite", () => {
  test("counts every outcome, and marks the ones that agreed", () => {
    const suite = buildSuite("golden", [judged(golden("g-1"), "verified"), judged(golden("g-2"), "verified")])
    expect(suite.metrics.counts.totalCases).toBe(2)
    expect(suite.metrics.counts.passedCases).toBe(2)
    expect(suite.metrics.passRate).toBe(1)
    expect(suite.cases.every((entry) => entry.passed)).toBe(true)
  })

  test("a case whose verdict disagrees with its expectation fails, and says so", () => {
    const suite = buildSuite("red-team", [judged(fabrication("rt-1"), "verified", "exact_containment")])
    expect(suite.cases[0]?.passed).toBe(false)
    expect(suite.cases[0]?.verdict).toBe("verified")
    expect(suite.cases[0]?.reason).toBe("exact_containment")
    expect(suite.metrics.counts.passedCases).toBe(0)
  })

  test("SSR is the sentence-support rate, not the pass rate", () => {
    // Two cases, both verdicts `verified` — so the pass rate is 1. Only one of them carries prose,
    // so totalSentences is 1, and if SSR were the pass rate it would read 1 anyway. Drop the second
    // case's prose and add a third that is verified but ungrounded: the denominators diverge.
    const grounded = benchCase({ id: "g-1", expectedVerdict: "verified", fabricated: false, prose: "A grounded sentence.", claimText: "A grounded sentence." })
    const ungrounded = benchCase({ id: "g-2", expectedVerdict: "verified", fabricated: false, prose: "A sentence with no claim in it.", claimText: "a claim nobody wrote down" })
    const noProse = benchCase({ id: "g-3", expectedVerdict: "verified", fabricated: false, claimText: "A claim with no prose of its own." })
    const suite = buildSuite("golden", [judged(grounded, "verified"), judged(ungrounded, "verified"), judged(noProse, "verified")])
    expect(suite.metrics.counts.totalCases).toBe(3)
    expect(suite.metrics.passRate).toBe(1)
    expect(suite.metrics.counts.totalSentences).toBe(2)
    expect(suite.metrics.counts.supportedSentences).toBe(1)
    expect(suite.metrics.ssr).toBe(0.5)
  })

  test("a case with no prose is scored for its verdict and contributes no sentences", () => {
    const suite = buildSuite("red-team", [judged(fabrication("rt-1"), "unverifiable", "identifier_unresolved")])
    expect(suite.cases[0]?.contributesSentences).toBe(false)
    expect(suite.metrics.counts.totalSentences).toBe(0)
    expect(suite.metrics.ssr).toBeNull()
  })

  test("each case's prose is its own answer, so unterminated cases are counted separately", () => {
    // PLANTED-VIOLATION test for the defect this suite's real fixture exposed. Joining every case's
    // prose into one "response" and calling `computeSsr` once segments the golden set's three cases
    // as ONE sentence, because none of the three ends in a terminator. The published denominator then
    // reads 1 where the truth is 3. The rate looks fine at 100%; the count — the number a reader
    // divides by — is wrong, and a single failure would report 0/1 instead of 2/3.
    const one = benchCase({ id: "u-1", expectedVerdict: "verified", fabricated: false, prose: "لا تقبل صلاه بغير طهور", claimText: "لا تقبل صلاه بغير طهور" })
    const two = benchCase({ id: "u-2", expectedVerdict: "verified", fabricated: false, prose: "اذا توضا العبد المسلم", claimText: "اذا توضا العبد المسلم" })
    const three = benchCase({ id: "u-3", expectedVerdict: "unverifiable", fabricated: false, prose: "مفتاح الصلاه الطهور", claimText: "مفتاح الصلاه الطهور" })
    const suite = buildSuite("golden", [judged(one, "verified"), judged(two, "verified"), judged(three, "unverifiable", "quote_absent_at_cited_id")])
    expect(suite.metrics.counts.totalSentences).toBe(3)
    expect(suite.metrics.counts.supportedSentences).toBe(2)
    // 2/3, not the 0/1 a joined response would report and not the 0/3 a case-level rate would.
    expect(suite.metrics.ssr).toBeCloseTo(2 / 3)
  })

  test("one case's verdict cannot support a sentence that belongs to another case", () => {
    // The other half of scoring per case, and the reason it is not only about the count. Two claims
    // quoting the SAME span: one cited correctly and `verified`, one cited wrongly and rejected.
    // Scored in one joined call, both sentences list both claims, and `computeSsr` marks a sentence
    // supported when ANY claim inside it is verified — so the rejected claim's wording is counted as
    // supported by the other claim's success. Per case, the second sentence has only the rejected
    // claim to stand on and is unsupported. This is the fabrication-acceptance shape one layer down:
    // a wrong citation riding in on a right one.
    const right = benchCase({ id: "s-1", expectedVerdict: "verified", fabricated: false, prose: "A span two cases quote.", claimText: "A span two cases quote." })
    const wrong = benchCase({ id: "s-2", expectedVerdict: "rejected", fabricated: false, prose: "A span two cases quote.", claimText: "A span two cases quote." })
    const suite = buildSuite("golden", [
      judged(right, "verified"),
      judged(wrong, "rejected", "quote_absent_at_cited_id"),
    ])
    expect(suite.metrics.counts.totalSentences).toBe(2)
    expect(suite.metrics.counts.supportedSentences).toBe(1)
    expect(suite.metrics.ssr).toBe(0.5)
  })

  test("the false-positive denominator is the fabricated cases, not the suite", () => {
    // Three goldens that verify, one fabrication that does not. The honest rate is 0/1. Dividing by
    // the four cases would report 0 too, so the fixture adds a second fabrication that DOES verify:
    // the honest rate is then 1/2 and the wrong denominator would say 1/4.
    const suite = buildSuite("mixed", [
      judged(golden("g-1"), "verified"),
      judged(golden("g-2"), "verified"),
      judged(golden("g-3"), "verified"),
      judged(fabrication("rt-1"), "unverifiable", "identifier_unresolved"),
      judged(fabrication("rt-2"), "verified", "exact_containment"),
    ])
    expect(suite.metrics.counts.fabricatedCases).toBe(2)
    expect(suite.metrics.counts.falseVerdicts).toBe(1)
    expect(suite.metrics.falsePositiveRate).toBe(0.5)
  })

  test("a suite with no fabricated cases has an undefined false-positive rate, not zero", () => {
    const suite = buildSuite("golden", [judged(golden("g-1"), "verified")])
    expect(suite.metrics.counts.fabricatedCases).toBe(0)
    expect(suite.metrics.falsePositiveRate).toBeNull()
    expect(percentOf(suite.metrics.falsePositiveRate)).toBe("n/a")
  })

  test("an empty suite is a suite with no denominator, not a suite that passed everything", () => {
    const suite = buildSuite("empty", [])
    expect(suite.metrics.counts.totalCases).toBe(0)
    expect(suite.metrics.passRate).toBeNull()
    expect(suite.metrics.ssr).toBeNull()
  })

  test("a derived suite names the suite it was computed from", () => {
    expect(buildSuite("hallmark", [], "red-team").derivedFrom).toBe("red-team")
    expect(buildSuite("red-team", []).derivedFrom).toBeUndefined()
  })
})

describe("buildReport", () => {
  const suites = () => [
    buildSuite("golden", [judged(golden("g-1"), "verified"), judged(golden("g-2"), "verified")]),
    buildSuite("red-team", [
      judged(fabrication("rt-1"), "unverifiable", "identifier_unresolved"),
      judged(fabrication("rt-2"), "unverifiable", "identifier_unresolved"),
    ]),
    buildSuite("hallmark", [judged(fabrication("rt-1"), "unverifiable", "identifier_unresolved")], "red-team"),
  ]

  test("an empty suite set is a run that measured nothing, and it is not a pass", () => {
    const report = buildReport([])
    expect(report.suites).toEqual([])
    expect(report.ssr).toBeNull()
    expect(report.falsePositiveRate).toBeNull()
    expect(report.passRate).toBeNull()
    // The regression this line used to get wrong: `allPassed` was `true` here, because
    // `broken.length === 0` holds for an empty list. A run that evaluated nothing and a run where
    // everything passed were the same value, which is the one thing this harness may not report.
    expect(report.outcome).toBe("not_run")
  })

  test("a suite that loaded but held no cases is also a run that measured nothing", () => {
    expect(buildReport([buildSuite("golden", [])]).outcome).toBe("not_run")
  })

  test("an errored roll-up fails a run whose counted suites all passed", () => {
    const report = buildReport([
      buildSuite("red-team", [judged(fabrication("rt-1"), "unverifiable", "identifier_unresolved")]),
      failedSuite("hallmark", "roll-up failed to build", "red-team"),
    ])
    expect(report.outcome).toBe("fail")
  })

  test("a derived suite is reported but not totalled", () => {
    const report = buildReport(suites())
    // 2 golden + 2 red-team. The hallmark roll-up re-prints rt-1 and must not be added again.
    expect(report.counts.totalCases).toBe(4)
    expect(report.suites).toHaveLength(3)
    expect(report.suites.map((suite) => suite.name)).toEqual(["golden", "red-team", "hallmark"])
  })

  test("the headline SSR is the sentence-support rate over the counted suites", () => {
    const report = buildReport(suites())
    expect(report.ssr).toBe(1)
    expect(report.counts.totalSentences).toBe(2)
    expect(report.counts.supportedSentences).toBe(2)
    // The two fabrications carry no prose, so they cannot move a text metric.
    expect(report.falsePositiveRate).toBe(0)
  })

  test("a fabrication that verifies fails the run and is listed by id", () => {
    const report = buildReport([
      buildSuite("golden", [judged(golden("g-1"), "verified")]),
      buildSuite("red-team", [judged(fabrication("rt-9"), "verified", "exact_containment")]),
    ])
    expect(report.outcome).toBe("fail")
    expect(report.counts.falseVerdicts).toBe(1)
    expect(report.falsePositiveRate).toBe(1)
    expect(failingCases(report).map((entry) => [entry.suite, entry.id, entry.verdict])).toEqual([["red-team", "rt-9", "verified"]])
  })

  test("a suite that failed to load is a broken suite, not an empty one that passed", () => {
    const report = buildReport([buildSuite("golden", [judged(golden("g-1"), "verified")]), failedSuite("red-team", "corpus missing")])
    expect(report.outcome).toBe("fail")
    expect(report.counts.totalCases).toBe(1)
    expect(report.suites[1]?.error).toBe("corpus missing")
    expect(report.suites[1]?.metrics.passRate).toBeNull()
  })

  test("a derived suite that fails cannot certify the run it was derived from", () => {
    const redTeam = buildSuite("red-team", [judged(fabrication("rt-1"), "verified", "exact_containment")])
    const report = buildReport([redTeam, buildSuite("hallmark", [], "red-team")])
    expect(report.outcome).toBe("fail")
  })

  test("one case out of two, both verdicts identical", () => {
    const report = buildReport([
      buildSuite("golden", [judged(golden("g-1"), "verified"), judged(golden("g-2"), "unverifiable", "identifier_unresolved")]),
    ])
    expect(report.counts.totalCases).toBe(2)
    expect(report.counts.passedCases).toBe(1)
    expect(report.passRate).toBe(0.5)
    expect(report.outcome).toBe("fail")
  })

  test("the report carries the schema version it was built at", () => {
    // Bumped from "2" to "3" when `CaseResult` gained `scoredBy`. A schema version that does not move
    // when the artefact's shape does is a version number that means nothing, and this report is what a
    // judge reads without running anything.
    expect(buildReport([]).schemaVersion).toBe("3")
  })
})

describe("renderReport", () => {
  test("an undefined rate prints as n/a, never as 0.0%", () => {
    const text = renderReport(buildReport([buildSuite("golden", [judged(golden("g-1"), "verified")])]))
    expect(text).toContain("false positive rate (fabricated cases only): n/a")
    expect(text).not.toContain("false positive rate (fabricated cases only): 0.0%")
  })

  test("it names SSR as the sentence-support rate, so a pass rate could not have been printed under it", () => {
    expect(renderReport(buildReport([]))).toContain("SSR (sentence support rate): n/a")
  })

  test("failing cases are listed with their suite, id and verdict", () => {
    const text = renderReport(buildReport([buildSuite("red-team", [judged(fabrication("rt-7"), "verified", "exact_containment")])]))
    expect(text).toContain("failing cases:")
    expect(text).toContain("rt-7 (red-team): verified — exact_containment")
    expect(text).toContain("RESULT: FAIL")
  })

  test("a suite error is printed rather than swallowed", () => {
    expect(renderReport(buildReport([failedSuite("red-team", "corpus missing")]))).toContain("error: corpus missing")
  })

  test("a derived suite says which suite it came from", () => {
    const text = renderReport(buildReport([buildSuite("red-team", []), buildSuite("hallmark", [], "red-team")]))
    expect(text).toContain("hallmark (derived from red-team)")
  })

  test("a run that evaluated nothing says so, and does not print RESULT: PASS", () => {
    const text = renderReport(buildReport([]))
    expect(text).toContain("RESULT: NOTHING RAN")
    expect(text).not.toContain("RESULT: PASS")
    expect(text).toContain("no suite was evaluated: these are no measurements")
  })

  test("the three outcomes render to three different headlines", () => {
    const passing = renderReport(buildReport([buildSuite("golden", [judged(golden("g-1"), "verified")])]))
    const failing = renderReport(buildReport([buildSuite("golden", [judged(golden("g-1"), "unverifiable")])]))
    const absent = renderReport(buildReport([]))
    expect(passing.trimEnd().endsWith("RESULT: PASS")).toBe(true)
    expect(failing.trimEnd().endsWith("RESULT: FAIL")).toBe(true)
    expect(absent.trimEnd().endsWith("RESULT: NOTHING RAN")).toBe(true)
  })
})

describe("the report carries no case content", () => {
  test("the serialised report holds counts, ids and verdicts — never a claim, a quote or a citation", () => {
    const report = buildReport([
      buildSuite("golden", [judged(benchCase({ id: "g-1", expectedVerdict: "verified", fabricated: false, prose: "SECRET_ANSWER_TEXT.", claimText: "SECRET_ANSWER_TEXT." }), "verified")]),
      buildSuite("red-team", [judged(benchCase({ id: "rt-1", expectedVerdict: "unverifiable", fabricated: true, claimText: "SECRET_FABRICATION." }), "unverifiable", "identifier_unresolved")]),
    ])
    const json = JSON.stringify(report)
    expect(json).not.toContain("SECRET_ANSWER_TEXT")
    expect(json).not.toContain("SECRET_FABRICATION")
    expect(json).not.toContain("a verbatim span")
    expect(json).not.toContain("tirmidhi")
  })
})
