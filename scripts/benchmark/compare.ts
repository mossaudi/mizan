import type { Verdict } from "@mizan/core"
import type { SystemOutcome } from "./system-arm.ts"

/**
 * The comparison: measured outcomes against declared expectations.
 *
 * ## This is the ONLY place the two meet
 *
 * `system-arm.ts` cannot see the labels and this module cannot see the corpus. The split is what
 * makes the comparison falsifiable: the executor produces verdicts that stand on their own, and
 * everything about judging them — agreement, the false-verified count, the abstention rate — is
 * derived here, in one file a reader can read in a minute to see exactly what the benchmark asserts
 * about itself.
 *
 * ## Why agreement is published beside detection
 *
 * `detectionRate` is the share of cases the verifier did not call `verified`, and on a red-team set
 * it is 1.0 whether the verifier is perfect or broken. `agreementRate` is the share where the
 * verifier's verdict EQUALS the set's declared verdict, which is 0.0 if the verifier is inverted and
 * 1.0 only if it reproduces the declared behaviour case for case. Publishing the first without the
 * second is how a tautology gets read as a result; the second is what makes the first mean something.
 *
 * `abstentionRate` is published because a system that answers `unverifiable` on everything scores a
 * perfect detection rate while judging nothing. Detection, agreement and abstention together
 * decompose the claim, and printing only the flattering half of a decomposition is how a benchmark
 * starts telling a flattering story.
 */

/** A case as the comparator sees it: the declaration, and nothing about how to verify it. */
export type LabelledCase = {
  readonly id: string
  readonly verdict: Verdict
}

/** The joined, per-case record. Kept per case so a disagreement can be named, not just counted. */
export type Comparison = {
  readonly caseId: string
  readonly declared: Verdict
  readonly measured: Verdict
  readonly agreed: boolean
  /** True when the verifier called it `verified` and the set did not. The release blocker. */
  readonly falseVerified: boolean
  readonly abstained: boolean
}

/** The figures the report renders. Fractions with the counts that produced them. */
export type ComparisonFigures = {
  readonly detectionRate: number
  readonly agreementRate: number
  readonly abstentionRate: number
  readonly falseVerifiedCount: number
  readonly caseCount: number
}

/**
 * Refuse a measurement the set does not declare.
 *
 * Both directions of the join are checked, and this is the one the per-row lookup cannot catch. A
 * declaration with no measurement is caught per row, in `compare`; a measurement with no
 * declaration produces no row at all, so it would silently shrink the denominator — the executor was
 * handed a case the set does not contain, and the rate that came out would be about a smaller set
 * than the one the report names.
 *
 * It cannot fire on the committed path, where `measured` is built from the same case list, and that
 * is the point of a guard rather than an assertion: it is checked on every run for the price of a
 * `Set` lookup, and it fails closed rather than publishing a rate over a set nobody can enumerate.
 */
const assertDeclared = (cases: readonly LabelledCase[], measured: readonly SystemOutcome[]): void => {
  const declaredIds = new Set(cases.map((testCase) => testCase.id))
  const undeclared = measured.filter((outcome) => !declaredIds.has(outcome.caseId))
  if (undeclared.length === 0) return
  throw new Error(
    `compare: the executor measured ${undeclared.length} case(s) the set does not declare (${undeclared.map((outcome) => outcome.caseId).join(", ")}), so they would vanish from the denominator`,
  )
}

/**
 * Join measurements to declarations, one row per case.
 *
 * A row that cannot be scored is a hard error rather than a silently dropped case: an unmeasured
 * declaration is caught below, and an undeclared measurement is caught above, so no case can leave
 * the join without either a verdict beside its label or a message naming why it could not be had.
 */
export const compare = (cases: readonly LabelledCase[], measured: readonly SystemOutcome[]): readonly Comparison[] => {
  assertDeclared(cases, measured)
  const measuredById = new Map(measured.map((outcome) => [outcome.caseId, outcome]))
  return cases.map((testCase) => {
    const outcome = measuredById.get(testCase.id)
    if (outcome === undefined) {
      throw new Error(`compare: no measured outcome for ${testCase.id}, so the case would be dropped from the denominator`)
    }
    return {
      caseId: testCase.id,
      declared: testCase.verdict,
      measured: outcome.verdict,
      agreed: outcome.verdict === testCase.verdict,
      falseVerified: outcome.verdict === "verified" && testCase.verdict !== "verified",
      abstained: outcome.verdict === "unverifiable",
    }
  })
}

/**
 * Fraction helper. A zero denominator yields `0` rather than `NaN`.
 *
 * `0` is the honest reading of "nothing was counted out of nothing" — the alternative, `NaN`,
 * serialises into the artefact as `null` and prints as `NaN%`, and a figure a reader cannot read
 * is a figure nobody checks. The case where a rate is *meaningless* rather than zero — an empty
 * set — is refused where the figures are assembled, not here, so the two questions stay separate.
 */
const rate = (hits: number, total: number): number => {
  if (total === 0) return 0
  return hits / total
}

/** The three rates and the blocker count, derived from the joined rows. */
export const figuresOf = (comparisons: readonly Comparison[]): ComparisonFigures => {
  const total = comparisons.length
  return {
    detectionRate: rate(comparisons.filter((row) => row.measured !== "verified").length, total),
    agreementRate: rate(comparisons.filter((row) => row.agreed).length, total),
    abstentionRate: rate(comparisons.filter((row) => row.abstained).length, total),
    // Counted rather than asserted, so a violating run still leaves an artefact recording it.
    falseVerifiedCount: comparisons.filter((row) => row.falseVerified).length,
    caseCount: total,
  }
}

/** Every row where the verifier and the set disagree, named. Empty on a clean run. */
export const disagreements = (comparisons: readonly Comparison[]): readonly string[] =>
  comparisons
    .filter((row) => !row.agreed)
    .map((row) => `${row.caseId}: verifier said ${row.measured}, the set declares ${row.declared}`)

export * as Compare from "./compare.ts"
