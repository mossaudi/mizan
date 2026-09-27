import type { Citation, CorpusRecord, ResolvedCitation } from "@mizan/core"

/**
 * The per-claim citation cap (D5).
 *
 * ## Why resolution is an INPUT here
 *
 * Resolving `collection:number` to a row is I/O, and this package is allowed none. The
 * verifier receives resolution already done, which is what lets it stay a total, synchronous,
 * clock-free function over a fixed corpus snapshot — and that is the whole basis of the 100%
 * determinism gate. ADR-02: same snapshot, same input, same verdicts, always.
 *
 * `ResolvedCitation` is declared in `@mizan/core` because it is a contract between the corpus
 * (which does the resolving) and this package (which must not). See `core/schema/resolved.ts`
 * for why ambiguity is a first-class state rather than an empty record list: hadith number 1
 * exists in al-Bukhari, Sahih Muslim and dozens of other collections, so resolving it to the
 * wrong one would produce a confident, false `rejected` — accusing a correct answer of
 * misquoting. `unverifiable` says "we cannot tell", which is the only honest output.
 */

export { type ResolvedCitation } from "@mizan/core"

/** The per-claim citation cap. A model emitting six is confused or padding; see D5. */
export const MAX_CITATIONS_PER_CLAIM = 3

export type CappedCitations = {
  /** The citations that survived the cap, in the order the answer produced them. */
  readonly considered: readonly Citation[]
  /** How many the cap dropped. Zero when the claim was within the cap. */
  readonly dropped: number
  /**
   * True only when the cap is what PREVENTED a decision: the claim exceeded the cap AND
   * nothing in the capped set resolved. If one of the capped citations does resolve, the
   * claim gets the reason that actually explains its outcome — a cap that overwrote the
   * real reason would be a cap lying in the trace.
   */
  readonly capIsTheReason: boolean
}

/** The resolution lookup key. Collection-scoped by design; NUL cannot occur in a decoded field. */
export const resolutionKey = (citation: Citation): string => `${citation.collection}|${citation.number ?? ""}`

export const capCitations = (
  citations: readonly Citation[],
  resolvedFor: (citation: Citation) => ResolvedCitation,
): CappedCitations => {
  const considered = citations.slice(0, MAX_CITATIONS_PER_CLAIM)
  const dropped = citations.length - considered.length
  if (dropped <= 0) return { considered, dropped, capIsTheReason: false }
  const anyResolved = considered.some((citation) => resolvedFor(citation).records.length > 0)
  return { considered, dropped, capIsTheReason: !anyResolved }
}

export * as Citations from "./citations.ts"
