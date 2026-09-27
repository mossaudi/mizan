import { evidenceIsPresent, noMatchStrength, type ClaimVerdict, type EvidenceRef, type MatchStrength, type VerdictReason } from "@mizan/core"

/**
 * Fail-closed coercion — the NOT-VERIFIED rule.
 *
 * A `verified` verdict that carries no matching evidence is not a verified verdict. It
 * is a bug, a partial write, or something trying to look authoritative. All three are
 * coerced DOWN to `unverifiable (no_matching_evidence)`, and the evidence field is
 * cleared so no downstream consumer can read a `verified` string with no provenance
 * behind it.
 *
 * The inverse is checked too: a non-`verified` verdict must not carry evidence, which
 * would let a UI render a confident citation chip next to a `rejected` badge.
 *
 * This is the single most important function in the package after containment. A
 * verifier that can be talked into a `verified` is worse than no verifier, because it
 * transfers false authority onto someone making a religious decision. AGENTS.md §3.
 */

export type CoerceInput = {
  readonly verdict: "verified" | "unverifiable" | "rejected"
  readonly reason: VerdictReason
  readonly matchStrength: MatchStrength
  readonly evidence: EvidenceRef | null
}

export const coerceFailClosed = (input: CoerceInput): CoerceInput => {
  if (input.verdict === "verified" && input.evidence === null) {
    return {
      verdict: "unverifiable",
      reason: "no_matching_evidence",
      matchStrength: noMatchStrength,
      evidence: null,
    }
  }
  if (input.verdict !== "verified" && input.evidence !== null) {
    return { verdict: input.verdict, reason: input.reason, matchStrength: noMatchStrength, evidence: null }
  }
  return input
}

/** Apply the coercion to a finished claim verdict, preserving its id. */
export const coerceClaimVerdict = (verdict: ClaimVerdict): ClaimVerdict => ({ ...coerceFailClosed(verdict), claimId: verdict.claimId })

/** The invariant the report guarantees: evidence is present if and only if verified. Delegates to core — one source of truth. */
export const evidenceIsConsistent = (verdict: ClaimVerdict): boolean => evidenceIsPresent(verdict.verdict, verdict.evidence)

export * as Coerce from "./coerce.ts"
