import { computeSsr } from "@mizan/verify"
import type { Claim } from "@mizan/core"
import {
  FALSE_VERDICT,
  casePassed,
  percentOf,
  rateOf,
  scoringOf,
  type BenchmarkReport,
  type CaseOutcome,
  type CaseResult,
  type ReportOutcome,
  type SuiteMetrics,
  type SuiteResult,
} from "./report.ts"

/**
 * The numbers: a suite, the suites rolled up, and the report a reader is handed.
 *
 * ## The three mistakes this module exists to make impossible
 *
 * The vocabulary in `report.ts` names what each metric counts. This file is where those counts are
 * produced, and every branch below closes one of the conflations the vocabulary warns about —
 * structurally rather than by review:
 *
 *  1. **SSR counts sentences, not cases.** `ssr` is `supportedSentences / totalSentences`, read
 *    straight off `computeSsr`. It is never `passedCases / totalCases` wearing the SSR name.
 *  2. **The false-positive denominator is the fabricated cases.** A golden case that verifies is a
 *    success; counting it in "how often does a fabrication get through" makes a working verifier
 *    look like it misses half its fabrications.
 *  3. **A derived suite is reported and not totalled.** The HALLMARK roll-up re-prints the red-team
 *    outcomes. Summing it would report seventeen evaluated cases as thirty-one.
 *
 * ## The verdicts arrive; this file never invents one
 *
 * `CaseOutcome` carries the verifier's own `ClaimVerdict`. `computeSsr` is handed exactly those, so
 * the harness cannot manufacture a `matchStrength` to feed a metric — a harness that built the
 * shape it scores would be measuring its own fixture, which is defect 1 again, one layer down.
 *
 * ## No clock, no database, no randomness
 *
 * Every function here is a total function of the outcomes it is handed. The corpus read happens in
 * `scripts/benchmark.ts` and arrives as data, which is what lets this module be tested against
 * outcomes a fixture chose — including the ones a correct verifier would never produce.
 */

/** Bumped when the report's shape changes in a way a reader would notice. */
export const REPORT_SCHEMA_VERSION = "3"

/**
 * The claim a case's SSR is computed against.
 *
 * `computeSsr` attributes a sentence to a claim by finding that claim's `text` inside the sentence,
 * so `prose` must CONTAIN `claimText`. A case whose prose omits it contributes sentences that can
 * never be attributed, and therefore can never be supported — which is the metric reporting a fixture
 * defect instead of hiding it, and the only honest direction for a number whose whole claim is that
 * it was measured.
 */
const claimOf = (outcome: CaseOutcome): Claim => ({
  id: outcome.case.id,
  text: outcome.case.claimText,
  quote: outcome.case.quote,
  citations: outcome.case.citations,
  ...(outcome.case.anchorText === undefined ? {} : { anchor: outcome.case.anchorText }),
})

/**
 * The sentence-support counts for a suite, SUMMED OVER CASES.
 *
 * ## Why per case and not one joined "response"
 *
 * The obvious implementation — join every case's `prose` into one string and call `computeSsr` once
 * — is wrong, and wrong in the way this repository exists to prevent. The golden set's three cases
 * are three independent answers, none of which ends in a sentence terminator. Joined, they
 * segment as ONE sentence, so the denominator published as "SSR 100%" was really `1 / 1` where the
 * truth was `3 / 3`. The rate looked identical; the count did not. And had one of the three failed,
 * the harness would have reported `0 / 1 = 0%` for a suite that was really `2 / 3 = 66.7%` — a
 * headline metric off by two thirds, published under a name that claims it was computed.
 *
 * `computeSsr` is the authority on what a sentence is, so it is called per case and its counts are
 * added. Each case is then scored against exactly its own sentence and its own single verdict, which
 * is also what stops one case's verdict supporting a sentence that belongs to another.
 *
 * Cases with no `prose` contribute nothing to either count: a fabrication has no answer text, so it
 * has no sentences for SSR to be defined over. It is still scored for its verdict.
 */
const ssrOf = (outcomes: readonly CaseOutcome[]): { readonly total: number; readonly supported: number } => {
  let total = 0
  let supported = 0
  for (const outcome of outcomes) {
    if (outcome.case.prose === undefined) continue
    const one = computeSsr(outcome.case.prose, [outcome.verdict], [claimOf(outcome)])
    total += one.totalSentences
    supported += one.supportedSentences
  }
  return { total, supported }
}

/**
 * One case's row.
 *
 * `contributesSentences` is `false` when the case carried no prose, which is what lets a suite
 * score a fabrication for its verdict without the fabrication's invented wording becoming a
 * sentence the SSR denominator pays for.
 */
const toCaseResult = (outcome: CaseOutcome): CaseResult => ({
  id: outcome.case.id,
  expectedVerdict: outcome.case.expectedVerdict,
  scoredBy: scoringOf(outcome.case),
  verdict: outcome.verdict.verdict,
  reason: outcome.verdict.reason,
  passed: casePassed(outcome),
  contributesSentences: outcome.case.prose !== undefined,
})

/** Count the fabrications that came back `verified`. The one number that must be zero. */
const falseVerdictsOf = (outcomes: readonly CaseOutcome[]): number =>
  outcomes.filter((outcome) => outcome.case.fabricated && outcome.verdict.verdict === FALSE_VERDICT).length

/** A suite's metrics. Every denominator is a named count; none is invented. */
const metricsOf = (outcomes: readonly CaseOutcome[], cases: readonly CaseResult[]): SuiteMetrics => {
  const fabricated = outcomes.filter((outcome) => outcome.case.fabricated)
  const ssr = ssrOf(outcomes)
  const passedCases = cases.filter((entry) => entry.passed).length
  return {
    passRate: rateOf(passedCases, outcomes.length),
    ssr: rateOf(ssr.supported, ssr.total),
    falsePositiveRate: rateOf(falseVerdictsOf(outcomes), fabricated.length),
    counts: {
      totalCases: outcomes.length,
      passedCases,
      fabricatedCases: fabricated.length,
      falseVerdicts: falseVerdictsOf(outcomes),
      totalSentences: ssr.total,
      supportedSentences: ssr.supported,
    },
  }
}

/** The metrics of a suite that never ran. Every rate undefined, not zero. */
const emptyMetrics = (): SuiteMetrics => ({
  passRate: null,
  ssr: null,
  falsePositiveRate: null,
  counts: {
    totalCases: 0,
    passedCases: 0,
    fabricatedCases: 0,
    falseVerdicts: 0,
    totalSentences: 0,
    supportedSentences: 0,
  },
})

/**
 * One suite: its cases, their verdicts, and the three rates defined for it.
 *
 * `derivedFrom` names the suite a roll-up was computed from. It appears in the report so a reader
 * can see the HALLMARK table, and `buildReport` excludes it from every total — see the third
 * conflation in this file's header.
 */
export const buildSuite = (name: string, outcomes: readonly CaseOutcome[], derivedFrom?: string): SuiteResult => {
  const cases = outcomes.map(toCaseResult)
  const rollUp = derivedFrom === undefined ? {} : { derivedFrom }
  return { name, ...rollUp, metrics: metricsOf(outcomes, cases), cases }
}

/**
 * A suite that could not be run at all.
 *
 * Its rates are undefined and its error is carried, so `buildReport` can count it as broken rather
 * than as an empty suite that passed. Graceful degradation here means "say so, and keep going", not
 * "report a clean zero".
 */
export const failedSuite = (name: string, error: string, derivedFrom?: string): SuiteResult => {
  const rollUp = derivedFrom === undefined ? {} : { derivedFrom }
  return { name, ...rollUp, metrics: emptyMetrics(), cases: [], error }
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/** Add count blocks field by field, so a new count cannot be silently dropped from the roll-up. */
const addCounts = (suites: readonly SuiteResult[]): BenchmarkReport["counts"] => ({
  totalCases: sum(suites.map((suite) => suite.metrics.counts.totalCases)),
  passedCases: sum(suites.map((suite) => suite.metrics.counts.passedCases)),
  fabricatedCases: sum(suites.map((suite) => suite.metrics.counts.fabricatedCases)),
  falseVerdicts: sum(suites.map((suite) => suite.metrics.counts.falseVerdicts)),
  totalSentences: sum(suites.map((suite) => suite.metrics.counts.totalSentences)),
  supportedSentences: sum(suites.map((suite) => suite.metrics.counts.supportedSentences)),
})

/**
 * How the run ended, and why the three-way answer is decided HERE.
 *
 * ## A broken loader outranks "nothing ran"
 *
 * `fail` is checked first. A suite that threw while loading produced no cases, so a "no cases were
 * evaluated" test alone would report that failure as `not_run` — a red run presented as an absent
 * one. An error is a thing that happened; an empty result is not.
 *
 * ## An errored ROLL-UP still fails the run
 *
 * Failing cases are counted from non-derived suites only, because a roll-up reprints its source's
 * cases and counting both would double them. An error is different: a hallmark roll-up that could
 * not be built is a gap in the report that no other suite accounts for, so it fails the run even
 * though the suite it derives from passed.
 *
 * ## `not_run` is the state the previous harness could not express
 *
 * `allPassed: broken.length === 0` was `true` for an empty suite list, so a run that evaluated
 * nothing printed `RESULT: PASS`. There is now a name for it, and `scripts/benchmark.ts` turns it
 * into a non-zero exit so it cannot be recorded as a green benchmark.
 */
const outcomeOf = (suites: readonly SuiteResult[], counts: BenchmarkReport["counts"]): ReportOutcome => {
  if (suites.some((suite) => suite.error !== undefined)) return "fail"
  const broken = suites.some((suite) => suite.derivedFrom === undefined && suite.cases.some((entry) => !entry.passed))
  if (broken) return "fail"
  if (counts.totalCases === 0) return "not_run"
  return "pass"
}

/**
 * The unified report: every suite, and the headline figures over the suites that were actually run.
 *
 * Derived suites are excluded from the counts AND from the pass/fail decision, because a roll-up
 * that passed when the suite it rolls up failed would be a way to certify a broken run.
 */
export const buildReport = (suites: readonly SuiteResult[]): BenchmarkReport => {
  const counted = suites.filter((suite) => suite.derivedFrom === undefined)
  const counts = addCounts(counted)
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    counts,
    ssr: rateOf(counts.supportedSentences, counts.totalSentences),
    falsePositiveRate: rateOf(counts.falseVerdicts, counts.fabricatedCases),
    passRate: rateOf(counts.passedCases, counts.totalCases),
    suites,
    outcome: outcomeOf(suites, counts),
  }
}

/** One failing case, as the report prints it. */
export type FailingCase = {
  readonly suite: string
  readonly id: string
  readonly verdict: string
  readonly reason: string
}

/**
 * Every failing case across every suite, in suite order.
 *
 * Includes derived suites, because a reader told "14 caught" wants the table that says which 14 —
 * and the headline already told them whether the run passed. Derived cases are not in any total.
 */
export const failingCases = (report: BenchmarkReport): readonly FailingCase[] =>
  report.suites.flatMap((suite) =>
    suite.cases
      .filter((entry) => !entry.passed)
      .map((entry) => ({ suite: suite.name, id: entry.id, verdict: entry.verdict, reason: entry.reason })),
  )

/** The headline block: the totals over every counted suite, each rate named for what it counts. */
const headlineLines = (report: BenchmarkReport): readonly string[] => {
  const { counts } = report
  return [
    `cases: ${counts.totalCases}  passed: ${counts.passedCases}  failed: ${counts.totalCases - counts.passedCases}`,
    `SSR (sentence support rate): ${percentOf(report.ssr)}`,
    `false positive rate (fabricated cases only): ${percentOf(report.falsePositiveRate)}`,
    `pass rate: ${percentOf(report.passRate)}`,
  ]
}

/**
 * The scoring modes present in a suite, other than `exact`.
 *
 * Printed on the suite line, because a suite scored on `never_verified` reads identically to one
 * scored on `exact` otherwise: both print a count of passed cases over a count of cases, and a
 * reader cannot tell that forty fabrications were held to a weaker bar than the two hundred golden
 * cases beside them. Sorted so the text is byte-stable across runs.
 */
const nonExactScoring = (suite: SuiteResult): readonly string[] =>
  [...new Set(suite.cases.filter((entry) => entry.scoredBy !== "exact").map((entry) => entry.scoredBy))].sort()

/** One block per suite, with roll-ups labelled by what they derive from. */
const suiteLines = (report: BenchmarkReport): readonly string[] =>
  report.suites.flatMap((suite) => {
    const rollUp = suite.derivedFrom === undefined ? "" : ` (derived from ${suite.derivedFrom})`
    const scoring = nonExactScoring(suite)
    const bar = scoring.length === 0 ? "" : ` [scored: ${scoring.join(", ")}]`
    const error = suite.error === undefined ? [] : [`    error: ${suite.error}`]
    return [
      `  ${suite.name}${rollUp}${bar}`,
      `    cases: ${suite.metrics.counts.totalCases}  passed: ${suite.metrics.counts.passedCases}`,
      `    SSR: ${percentOf(suite.metrics.ssr)}  FPR: ${percentOf(suite.metrics.falsePositiveRate)}`,
      ...error,
    ]
  })

/** The failing-case table, or nothing at all when nothing failed. */
const failureLines = (report: BenchmarkReport): readonly string[] => {
  const failures = failingCases(report)
  if (failures.length === 0) return []
  return [
    "",
    "failing cases:",
    ...failures.map((failure) => `  ${failure.id} (${failure.suite}): ${failure.verdict} — ${failure.reason}`),
  ]
}

/** One headline per outcome. Exhaustive, so adding a state is a type error here. */
const RESULT_LINES: Readonly<Record<BenchmarkReport["outcome"], string>> = {
  pass: "RESULT: PASS",
  fail: "RESULT: FAIL",
  not_run: "RESULT: NOTHING RAN",
}

/**
 * The report as text.
 *
 * `percentOf` prints an undefined rate as `n/a`, never as `0.0%`, so "no fabricated cases ran" and
 * "every fabricated case was refused" cannot both be printed by one line. The rendering names SSR
 * as the sentence-support rate and the false-positive rate as being over fabricated cases, because
 * a bare `SSR: 100.0%` is exactly the label a pass rate could have been printed under.
 *
 * All three outcomes are spelled out rather than derived from a boolean here, because the renderer
 * is the last place a reader looks: `RESULT: NOTHING RAN` is the only rendering that cannot be
 * mistaken for a pass, and a conditional that forgot a state would fall back to the pass branch.
 */
export const renderReport = (report: BenchmarkReport): string => {
  const nothingRan = report.outcome === "not_run" ? ["", "no suite was evaluated: these are no measurements"] : []
  return [
    "mizan unified benchmark report",
    "==============================",
    "",
    ...headlineLines(report),
    "",
    "per-suite:",
    ...suiteLines(report),
    ...failureLines(report),
    ...nothingRan,
    "",
    RESULT_LINES[report.outcome],
  ].join("\n")
}

export * as Build from "./build.ts"
