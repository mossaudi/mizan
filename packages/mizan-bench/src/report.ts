/**
 * The benchmark's vocabulary: what a case is, and what a number about it means.
 *
 * ## Why this file exists, and what it is protecting
 *
 * The previous harness reported `Overall SSR: 100.0%` while never calling `computeSsr`. It
 * computed `passCount / totalCases`, which is a PASS RATE, and printed it under the name of the
 * Sentence-Support Rate. Both numbers are fractions of cases, so the two are trivially confusable
 * and the printed figure was true about nothing in particular: it would have read 100% on a run
 * where every sentence of every answer was ungrounded, because "no case failed" and "every
 * sentence was supported" are unrelated claims.
 *
 * In a repository whose entire premise is that the badge was *computed*, a published metric that
 * is not the metric it is named after is not a cosmetic bug. It is the same defect one layer up:
 * a figure that asserts rather than measures. So the metrics are typed by what they count, the
 * denominators are named fields rather than inline arithmetic, and `null` is available for "this
 * metric does not apply to this suite" — because a false-positive rate over a set of
 * deliberately-true cases is not 0%, it is undefined.
 *
 * Nothing in this module reads a database, a clock, or a random number. It is a function of the
 * cases it is handed, which is what makes it testable at all.
 */

import type { Citation, ClaimVerdict, Verdict, VerdictReason } from "@mizan/core"

/** A verdict the harness treats as the failure of interest: the one that must never occur. */
export const FALSE_VERDICT: Verdict = "verified"

/**
 * How one case is scored. Two modes, and the second one is named rather than folded into the first.
 *
 * - `exact` — the verdict must EQUAL `expectedVerdict`. The default, and what every HALLMARK fixture
 *   and every golden case is held to. This is the stricter bar and it is the one most cases get.
 * - `never_verified` — the fabrication bar: `verified` fails and any other verdict passes.
 *
 * ## Why a second mode exists at all, and why it is not a loophole
 *
 * `data/eval/redteam-fabricated.json` declares all 40 fabrications `rejected`, and the repository has
 * published — in `data/eval/adjudication.json` as `redTeamMovement` and in README — that the
 * procedure emits `unverifiable` for all 40, because a human-drawn anchor drawn from a largely real
 * span locates at step 5b. The human ruling and the observed verdict are both correct and they answer
 * different questions.
 *
 * So a harness could score those 40 against the ruling and report 40 failures for behaviour the
 * project deliberately shipped. The alternative — widening `exact` to "rejected or unverifiable"
 * everywhere — would do the same damage to the 11 HALLMARK fixtures and the 200 golden cases, whose
 * exact verdicts ARE the claim being measured. A per-case mode names the difference where it exists
 * and keeps `exact` exact everywhere else, and `CaseResult.scoredBy` prints it, so a reader can see
 * which bar a passing case was held to rather than having to infer it.
 *
 * The mode never moves the false-positive count: `metrics.falsePositiveRate` counts fabrications
 * that came back `verified` regardless of how the case was scored, so a `never_verified` case that
 * fabricates a `verified` fails the suite AND lands in the rate that must be zero.
 */
export type CaseScoring = "exact" | "never_verified"

/** Every scoring mode, so a renderer or a test cannot silently skip one. */
export const CASE_SCORINGS: readonly CaseScoring[] = ["exact", "never_verified"]

/** One case: a claim, the citation it rests on, and what the harness expects back. */
export type BenchCase = {
  readonly id: string
  /**
   * The prose this case contributes to the response whose sentences are scored.
   *
   * A case whose `prose` is absent is scored for its verdict but contributes NO sentences, so it
   * moves the pass/fail and false-positive counts without moving SSR. That separation is the point:
   * SSR is a property of text, and a case with no text cannot change a text metric.
   */
  readonly prose?: string
  readonly claimText: string
  /**
   * The quoted span, or `null` when the case has none.
   *
   * `null` rather than `""` because the product's own rule is one: `normalizeQuote` in
   * `@mizan/core` collapses an absent, empty and whitespace-only quote to `null`, and the verifier
   * answers all three `unverifiable (empty_quote)`. A harness that wrote `?? ""` would be applying
   * a second, different answer to the same question at a second site (AGENTS.md section 17), and the
   * two could drift without anything noticing.
   */
  readonly quote: string | null
  readonly citations: readonly Citation[]
  /**
   * A 3-8 word span of real source text a human drew for this case, forwarded to the claim's
   * `anchor`.
   *
   * Carried rather than dropped because the harness builds the claim: the 40 committed fabrications
   * in `data/eval/` carry one each, and a harness that dropped it would run them with step 5b
   * unreachable — scoring them `rejected` while measuring the arm that runs *before* the one they
   * exist to exercise. Absent means the claim carried no anchor, which is the pre-activation state
   * and a legal answer.
   */
  readonly anchorText?: string
  readonly expectedVerdict: Verdict
  /**
   * How this case is scored. Absent means `exact`.
   *
   * The only cases that set it are the 40 committed fabrications in `data/eval/`, held to
   * `never_verified` for the reason `CaseScoring` gives. See that type before widening it.
   */
  readonly scoredBy?: CaseScoring
  /**
   * `true` when the citations are fabricated, i.e. the case exists to catch a false `verified`.
   *
   * Only fabricated cases enter the false-positive denominator. Including non-fabricated cases there
   * is what the previous harness did, and it diluted the one number that matters: 14 fabricated
   * cases caught out of 31 "total" cases reads like a 55% false-positive rate when the honest
   * denominator is 14.
   */
  readonly fabricated: boolean
}

/**
 * A case plus the verdict the harness actually received.
 *
 * `verdict` is the verifier's OWN `ClaimVerdict`, not a verdict name and a reason the harness
 * re-typed beside it. `computeSsr` is then handed what `@mizan/verify` produced, and the harness
 * never manufactures a `matchStrength` to feed a metric — a harness that invented the shape it
 * scores would be measuring its own fixture, which is the defect `report.ts` exists to prevent, one
 * layer down.
 */
export type CaseOutcome = {
  readonly case: BenchCase
  readonly verdict: ClaimVerdict
}

/**
 * The mode a case is scored by. One answer, so `casePassed` and the report row cannot disagree.
 *
 * A function rather than an `??` at each of the two call sites because "absent means exact" is a
 * rule about the vocabulary, and a rule written twice is a rule one of the two will forget.
 */
export const scoringOf = (bench: BenchCase): CaseScoring => bench.scoredBy ?? "exact"

/**
 * Does this outcome agree with the case's expectation?
 *
 * `never_verified` fails ONLY on `verified`. There are three verdicts in `@mizan/core`, so the two
 * modes differ over exactly one input, and a fabrication is the only thing this repository is
 * forbidden from getting wrong on a religious text.
 */
export const casePassed = (outcome: CaseOutcome): boolean =>
  scoringOf(outcome.case) === "never_verified"
    ? outcome.verdict.verdict !== FALSE_VERDICT
    : outcome.verdict.verdict === outcome.case.expectedVerdict

/** One case's row in a suite, and the two fractions that are defined for it. */
export type CaseResult = {
  readonly id: string
  readonly expectedVerdict: Verdict
  /** Which bar this row was held to, printed so a passing row is not mistaken for an exact match. */
  readonly scoredBy: CaseScoring
  readonly verdict: Verdict
  readonly reason: VerdictReason
  readonly passed: boolean
  /** `false` when the case contributed no prose, so SSR is undefined for it. */
  readonly contributesSentences: boolean
}

/**
 * A rate, or `null` where the rate has no meaning.
 *
 * `null` rather than `0` is load-bearing. "No fabricated cases, so 0% false positives" and "every
 * fabricated case was refused, so 0% false positives" are different facts, and a harness that
 * cannot print the first one will eventually print the second one by accident.
 */
export type Rate = number | null

/** The three fractions a suite can report, each with the count it was computed from. */
export type SuiteMetrics = {
  /** pass rate — cases whose verdict matched the expectation, over all cases. */
  readonly passRate: Rate
  /** Sentence-Support Rate, from `computeSsr`, over the sentences the suite's prose produced. */
  readonly ssr: Rate
  /** fraction of FABRICATED cases that came back `verified`. */
  readonly falsePositiveRate: Rate
  readonly counts: {
    readonly totalCases: number
    readonly passedCases: number
    readonly fabricatedCases: number
    readonly falseVerdicts: number
    readonly totalSentences: number
    readonly supportedSentences: number
  }
}

export type SuiteResult = {
  readonly name: string
  /**
   * `true` when this suite is a ROLL-UP of another suite's outcomes rather than an independent run.
   *
   * The previous harness ran the fourteen red-team fixtures a second time under the name
   * "hallmark" and added the results to the totals, so the report said thirty-one cases when
   * seventeen had been evaluated. A derived suite is reported, and excluded from every total, so a
   * reader can see the roll-up without the headline counting it twice.
   */
  readonly derivedFrom?: string
  readonly metrics: SuiteMetrics
  readonly cases: readonly CaseResult[]
  readonly error?: string
}

/**
 * How a run ended, in the three words a reader can act on.
 *
 * `not_run` exists because `true`/`false` cannot say the difference between "every case passed" and
 * "no case ran", and a boolean harness is forced to collapse them. It collapsed them to `true`:
 * `buildReport([])` — a run that evaluated nothing at all — reported `allPassed: true` and printed
 * `RESULT: PASS`. That is the one failure mode this repository cannot ship: a green benchmark for a
 * run that inspected nothing, which is indistinguishable from a green benchmark for a perfect run
 * by anyone reading the output.
 *
 * So the state is named rather than inferred from an emptiness check downstream, every renderer has
 * to spell all three out, and the exit code follows it. `not_run` is not `fail` either — it is a
 * distinct answer to "did the benchmark pass?", and the answer is "it did not run".
 */
export type ReportOutcome = "pass" | "fail" | "not_run"

/** The complete set of outcomes, so a renderer cannot silently drop one. */
export const REPORT_OUTCOMES: readonly ReportOutcome[] = ["pass", "fail", "not_run"]

export type BenchmarkReport = {
  readonly schemaVersion: string
  readonly counts: {
    readonly totalCases: number
    readonly passedCases: number
    readonly fabricatedCases: number
    readonly falseVerdicts: number
    readonly totalSentences: number
    readonly supportedSentences: number
  }
  /** The headline Sentence-Support Rate, from `computeSsr`. Never a pass rate. */
  readonly ssr: Rate
  /** The headline false-positive rate, over fabricated cases only. */
  readonly falsePositiveRate: Rate
  readonly passRate: Rate
  readonly suites: readonly SuiteResult[]
  readonly outcome: ReportOutcome
}

/** `total / part`, or `null` when there is no denominator to divide by. */
export const rateOf = (part: number, total: number): Rate => (total > 0 ? part / total : null)

/** How a rate prints. `null` prints as `n/a`, never as `0.0%`. */
export const percentOf = (rate: Rate): string => (rate === null ? "n/a" : `${(rate * 100).toFixed(1)}%`)