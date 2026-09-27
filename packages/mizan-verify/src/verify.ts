import {
  exactMatchStrength,
  noMatchStrength,
  type Claim,
  type ClaimVerdict,
  type CorpusRecord,
  type EvidenceRef,
  type VerdictReason,
  type VerdictReport,
} from "@mizan/core"
import { capCitations, resolutionKey, MAX_CITATIONS_PER_CLAIM, type ResolvedCitation } from "./steps/citations.ts"
import { containsQuote, foldQuote } from "./steps/containment.ts"
import { coerceClaimVerdict } from "./steps/coerce.ts"

/**
 * THE SIX-STEP PER-CLAIM VERIFICATION PROCEDURE.
 *
 * This is the differentiator, and it is deliberately boring: six steps, no model, no
 * score, no fallback, total function, no clock. The claim `verified` is decidable in the
 * absence of a provider, in a test, in CI, and in a court.
 *
 * ## Preconditions this module assumes, and who guarantees them
 *
 * The caller (the agent) decodes the model output through `Answer` at the trust boundary
 * and resolves citations against the snapshot before calling. This module re-checks
 * nothing it was handed, because re-validating a decoded value is theatre — the schema
 * already did it, and the snapshot hash in the report says which corpus was used.
 *
 * ## Why the result is `VerdictReport` and not `Result<VerdictReport, VerifyError>`
 *
 * AGENTS.md section 2 requires a `Result` where a function can fail for a BUSINESS
 * reason. This one cannot: every possible input produces a verdict, because the fail-closed
 * steps below turn every failure mode into `unverifiable` with a named reason. A
 * `Result` here would mean there is an `Err` path that yields no verdict — and there is
 * none, deliberately. The 100% determinism gate runs this function 100 times over the
 * same snapshot and requires byte-identical output; a `Result` wrapper would only add a
 * branch that never executes.
 *
 * ## The `unverifiable` / `rejected` line
 *
 * You may only accuse a citation of misquotation if the thing it points at demonstrably
 * exists. So `rejected` requires a RESOLVED record that lacks the quote; an unresolvable
 * or ambiguous identifier is `unverifiable`. Getting this backwards in either direction
 * is a religious-safety defect, not a UX preference. See the spike numbers in
 * `steps/containment.ts`.
 */

export type VerifyInput = {
  readonly claims: readonly Claim[]
  /**
   * Citation resolution, already performed by the caller. Indexed by
   * `collection` + `number`; a duplicate key means the last entry wins, and a citation
   * absent from this array is treated as unresolved.
   */
  readonly evidence: readonly ResolvedCitation[]
  /** The content hash of the snapshot the verdicts were computed against. Provenance. */
  readonly snapshotHash: string
  /**
   * A clock-free deadline hook. The verifier does not read a clock — that is a G-1
   * violation — so the caller supplies the predicate. Returning `true` stops further
   * claims and degrades the rest to `unverifiable (verification_timeout)`, which is the
   * 10s budget of the AT, and never a cached prior verdict.
   */
  readonly deadlineExpired?: () => boolean
}

/* ------------------------------------------------------------------ verdict builders */

const unverifiable = (claimId: string, reason: VerdictReason): ClaimVerdict => ({
  claimId,
  verdict: "unverifiable",
  reason,
  matchStrength: noMatchStrength,
  evidence: null,
})

const rejected = (claimId: string): ClaimVerdict => ({
  claimId,
  verdict: "rejected",
  reason: "quote_absent_at_cited_id",
  matchStrength: noMatchStrength,
  evidence: null,
})

/** The ONLY constructor of a `verified` verdict in this repository. */
const verified = (claimId: string, record: CorpusRecord, quoteChars: number): ClaimVerdict => {
  const evidence: EvidenceRef = {
    recordId: record.id,
    collection: record.collection,
    number: record.number,
    sourceUrl: record.sourceUrl,
    license: record.license,
    attribution: record.attribution,
    grade: record.grade,
    gradeSource: record.gradeSource,
    gradeBasis: record.gradeBasis,
    // A containment hit means every folded quote character was found, by definition.
    matchedChars: quoteChars,
    quoteChars,
  }
  return { claimId, verdict: "verified", reason: "exact_containment", matchStrength: exactMatchStrength, evidence }
}

/* ------------------------------------------------------------------ helpers */

/** Deduplicate by record id, keeping the first occurrence. Records are unique by id. */
const dedupeById = (records: readonly CorpusRecord[]): readonly CorpusRecord[] => {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (seen.has(record.id)) return false
    seen.add(record.id)
    return true
  })
}

/**
 * Pick the winning record deterministically: lowest `id` lexicographically.
 *
 * Order-independent on purpose. If the winner depended on the order the caller happened
 * to supply candidates, two runs with the same snapshot could disagree, and the
 * determinism gate would be measuring database iteration order instead of our code.
 */
const lowestId = (records: readonly CorpusRecord[]): CorpusRecord | null =>
  records.reduce<CorpusRecord | null>((best, candidate) => {
    if (best === null) return candidate
    return candidate.id < best.id ? candidate : best
  }, null)

const buildLookup = (evidence: readonly ResolvedCitation[]): ReadonlyMap<string, ResolvedCitation> => {
  const lookup = new Map<string, ResolvedCitation>()
  for (const entry of evidence) lookup.set(resolutionKey(entry.citation), entry)
  return lookup
}

/* ------------------------------------------------------------------ the six steps */

/**
 * Verify one claim. Read the steps in order: each one is a fail-closed early return, and
 * the happy path is the last line (AGENTS.md section 4).
 */
const verifyClaim = (claim: Claim, resolvedFor: (citation: Claim["citations"][number]) => ResolvedCitation): ClaimVerdict => {
  // Step 1 — the quote. `text` is the model's opinion and is never verified; only a
  // QUOTED SPAN is falsifiable. An empty or diacritics-only quote cannot be contained.
  const foldedQuote = foldQuote(claim.quote ?? "")
  if (foldedQuote.length === 0) return unverifiable(claim.id, "empty_quote")

  // Step 2 — a claim with no citation asserts nothing checkable. Fail closed.
  if (claim.citations.length === 0) return unverifiable(claim.id, "no_citation")

  // Step 3 — cap at 3 (D5). A cap that is not the reason does not become the reason.
  const cap = capCitations(claim.citations, resolvedFor)
  if (cap.considered.length === 0) return unverifiable(claim.id, "citation_cap_exceeded")
  if (cap.capIsTheReason) return unverifiable(claim.id, "citation_cap_exceeded")

  // Step 4 — resolve. All candidates across all capped citations, deduplicated.
  const resolutions = cap.considered.map((citation) => resolvedFor(citation))
  const records = dedupeById(resolutions.flatMap((resolution) => resolution.records))
  if (records.length === 0) {
    const ambiguous = resolutions.some((resolution) => resolution.ambiguous)
    return unverifiable(claim.id, ambiguous ? "collection_ambiguous" : "identifier_unresolved")
  }

  // Step 5 — THE decision. Strict normalized containment against the folded record.
  const hits = records.filter((record) => containsQuote(claim.quote ?? "", record).hit)
  const winner = lowestId(hits)
  if (winner !== null) return coerceClaimVerdict(verified(claim.id, winner, foldedQuote.length))

  // Step 6 — coercion. A `verified` without evidence was already downgraded above; here
  // the remaining question is whether we may accuse the citation of misquotation. Only
  // if EVERY capped citation resolved to a real record — a single unresolved citation
  // means the quote might be in a source we never looked at.
  const allResolved = resolutions.every((resolution) => resolution.records.length > 0)
  if (!allResolved) return unverifiable(claim.id, "identifier_unresolved")
  if (resolutions.some((resolution) => resolution.ambiguous)) return unverifiable(claim.id, "collection_ambiguous")
  return rejected(claim.id)
}

/**
 * Verify every claim in an answer and return the report.
 *
 * The caller's claim order is preserved in `claims` so a judge can line the badges up
 * with the sentences they came from.
 */
export const verifyAnswer = (input: VerifyInput): VerdictReport => {
  const lookup = buildLookup(input.evidence)
  const resolvedFor = (citation: Claim["citations"][number]): ResolvedCitation =>
    lookup.get(resolutionKey(citation)) ?? { citation, records: [], ambiguous: false }

  const verdicts = input.claims.map((claim) => {
    // The budget is checked BEFORE the work, not after: a verdict computed past the
    // deadline is a verdict we cannot claim was timely.
    if (input.deadlineExpired?.() === true) return unverifiable(claim.id, "verification_timeout")
    return verifyClaim(claim, resolvedFor)
  })

  const timedOut = verdicts.some((verdict) => verdict.reason === "verification_timeout")
  return {
    claims: verdicts,
    degraded: timedOut ? ["verification_timeout"] : [],
    snapshotHash: input.snapshotHash,
    // Deterministic and cheap: how many citations COULD have been considered, from the
    // cap alone. No second walk of the claims.
    citationsConsidered: input.claims.reduce(
      (total, claim) => total + Math.min(claim.citations.length, MAX_CITATIONS_PER_CLAIM),
      0,
    ),
  }
}

export * as Verify from "./verify.ts"
