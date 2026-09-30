import { HONEST_BASELINE, type BaselineDeclaration, type BenchmarkOutcome } from "@mizan/core"
import { type BaselineOptions, type BaselineResult } from "./baseline.ts"
import { type ComparisonFigures } from "./compare.ts"

/**
 * The BASELINE arm, the figures, and the honesty check.
 *
 * ## This module scores the baseline and nothing else
 *
 * The system arm lives in `system-arm.ts` and is judged in `compare.ts`. It used to be scored here,
 * from the set's DECLARED expectations, which made the detection rate 1.0 by construction: the
 * number restated the fixture instead of measuring anything, and on a red-team set a tautology and
 * a perfect verifier were indistinguishable. Disclosed in the report, but disclosure is not
 * measurement. So the declarations were removed from this module entirely — not ignored, removed —
 * which is what makes the comparison falsifiable.
 *
 * The arms must also stay independent of each other. This one imports two specifiers and knows
 * nothing about verdicts; the executor imports `@mizan/verify` and knows nothing about FTS5. If they
 * shared a module, a bug in it would move both numbers in the same direction and the delta would
 * look stable while both were wrong.
 *
 * ## The baseline rate is computed, and a high number is the harm
 *
 * `baselineTop1HitRate` is the share of cases where the baseline's top hit IS the record the case
 * cites. A high number is the harm: it means the fabrication was handed to the reader wearing the
 * source's own identifier.
 *
 * ## `assertBaselineIsHonest` names the defect instead of returning a boolean
 *
 * A boolean "is the baseline honest?" forces the caller to re-derive WHICH lever moved in order to
 * report it, and the natural re-derivation is "compare against the object and print nothing". So
 * the function returns a list of named problems, and a rigged baseline produces a sentence a reader
 * can act on: "this baseline filtered by collection, which a search box cannot do."
 */

/**
 * One case as the baseline arm needs it: the quote to search and the source it is checked against.
 *
 * No verdict of any kind. The baseline retrieves text; it does not judge citations, and a field
 * carrying the set's expectations here would be one more route by which a declaration could reach
 * the baseline's number.
 */
export type ScoredCase = {
  readonly id: string
  readonly classId: string
  readonly quote: string
  readonly anchorId: string
  readonly citation: { readonly collection: string; readonly number: string | null }
}

/**
 * Fraction helper. A zero denominator yields `0` rather than `NaN`, for the reason given in
 * `compare.ts` — `figuresOf` below refuses an empty set outright, so this branch is a guard against
 * an unreadable fraction rather than a figure the benchmark would publish.
 */
const rate = (hits: number, total: number): number => {
  if (total === 0) return 0
  return hits / total
}

/**
 * The declared options as a `BaselineDeclaration`, for the published artefact.
 *
 * A projection rather than the object itself, so the contract is declared once in `@mizan/core` and
 * this file cannot publish a field the schema does not have.
 */
export const toDeclaration = (options: BaselineOptions): BaselineDeclaration => ({
  strategy: options.strategy,
  column: options.column,
  collectionFilter: options.collectionFilter,
  usesGoldRecordId: options.usesGoldRecordId,
  k: options.k,
  rerunBudget: options.rerunBudget,
})

/**
 * Score the baseline arm, one row per case.
 *
 * Pure: it takes results and cases and produces numbers, with no database and no clock. That is
 * what lets the self-test score a RIGGED declaration against a fixture and assert the figures move,
 * without needing a corpus that would have to be rigged to match.
 *
 * A case the baseline returned nothing for is recorded as a null record id and a miss, rather than
 * dropped, so the denominator is always the set.
 */
export const score = (cases: readonly ScoredCase[], baseline: readonly BaselineResult[]): readonly BenchmarkOutcome[] => {
  const topByCase = new Map(baseline.map((result) => [result.caseId, result.topRecordId]))
  return cases.map((testCase) => {
    const topRecordId = topByCase.get(testCase.id) ?? null
    return {
      caseId: testCase.id,
      baselineTopRecordId: topRecordId,
      baselineTopHit: topRecordId !== null && topRecordId === testCase.anchorId,
    }
  })
}

/**
 * The report's figures: the baseline's rate and count, beside the system arm's measured rates.
 *
 * Both arms are rendered from one object so the report cannot print one arm's number without the
 * other's, and so the delta is always computed between two figures from the same run.
 */
export type Figures = {
  readonly baselineTop1HitRate: number
  readonly systemDetectionRate: number
  readonly systemAgreementRate: number
  readonly systemAbstentionRate: number
  readonly delta: number
  readonly falseVerifiedCount: number
  readonly caseCount: number
}

/**
 * Combine the two arms into the figures, and fail if they disagree about the set.
 *
 * The case counts must match. Two arms run over different numbers of cases would produce a delta
 * between two denominators, which is the arithmetic version of comparing two unrelated numbers — so
 * it is refused here rather than published.
 *
 * An EMPTY set is refused too, and this is the specification's declared edge case rather than a
 * hypothetical. Every rate below is `hits / total`, so an empty set yields `0.0%` detection, `0.0%`
 * baseline and a delta of `0.0` — an artefact that reads as "mizan caught nothing" when the truth
 * is "nothing was run", and a report that prints a hypothesis verdict for it. Refusing is the only
 * honest surface: the command reports a failure and writes nothing (AGENTS.md §16).
 */
export const figuresOf = (outcomes: readonly BenchmarkOutcome[], system: ComparisonFigures): Figures => {
  if (outcomes.length !== system.caseCount) {
    throw new Error(`figures: the baseline scored ${outcomes.length} cases and the system arm measured ${system.caseCount}, so the delta would compare two denominators`)
  }
  if (outcomes.length === 0) {
    throw new Error("figures: the set scored zero cases, so every rate would be 0 over 0 and the delta would compare nothing")
  }
  const total = outcomes.length
  const baselineTop1HitRate = rate(outcomes.filter((entry) => entry.baselineTopHit).length, total)
  return {
    baselineTop1HitRate,
    systemDetectionRate: system.detectionRate,
    systemAgreementRate: system.agreementRate,
    systemAbstentionRate: system.abstentionRate,
    delta: system.detectionRate - baselineTop1HitRate,
    // Carried from the comparison, where "the verifier called a fabrication verified" is computed.
    falseVerifiedCount: system.falseVerifiedCount,
    caseCount: total,
  }
}

/** What each defect buys the rigger, and the sentence the self-test can print about it. */
const DEFECT_NOTES: readonly { readonly field: keyof BaselineDeclaration; readonly note: string }[] = [
  { field: "collectionFilter", note: "filtered to the cited collection, which a search box cannot do — a reader who already knows the collection" },
  { field: "usesGoldRecordId", note: "the baseline's answer was the record id the case cites — handed the answer rather than a search" },
  { field: "column", note: "asked with the raw, undiacriticized text against a folded index, so it matches almost nothing and the rate is not measuring retrieval" },
  { field: "k", note: "fetched a wider k than top-1, so a later rerank could pick the winner — and the top-1 number it prints is indistinguishable from the honest one" },
  { field: "rerunBudget", note: "re-asked with progressively shorter queries until the cited record appeared" },
  { field: "strategy", note: "did not issue one lexical query at all — corpus order, or a rerun until the cited record turned up" },
]

/**
 * Name every lever that differs from the honest declaration.
 *
 * Returns problems rather than a boolean, and each carries the field and a sentence, so a failing
 * self-test says which cheat was detected and why it is a cheat. The `k` comparison is strict:
 * any change to `k` is a defect even if it is `1` spelled differently, because `k` is the
 * definition of the comparison and not a knob.
 */
export const assertBaselineIsHonest = (options: BaselineOptions): readonly string[] => {
  const declaration = toDeclaration(options)
  const problems: string[] = []
  for (const { field, note } of DEFECT_NOTES) {
    if (declaration[field] === HONEST_BASELINE[field]) continue
    problems.push(`baseline rig: ${field} = ${JSON.stringify(declaration[field])} — ${note}`)
  }
  return problems
}

export * as Score from "./score.ts"
