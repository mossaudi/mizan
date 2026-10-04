/**
 * The one order candidates are ever sorted in.
 *
 * Recorded as ADR-09 (what the four keys mean) and ADR-10 (why there is a fourth key, and why
 * deduplication by folded text happens after the order rather than during the scan).
 *
 * ## Why the comparator lives alone in a file
 *
 * The ranking is the only place where "nearest" is decided, so it gets exactly one definition, and
 * every sort in the product — the scan's survivor list, the harness, the tests — goes through it.
 * Two comparators that disagreed would make "the fifth nearest" a question about which code path ran
 * (AGENTS.md §17).
 *
 * ## The four keys, and why there are four
 *
 *  1. **containment** — a record that contains the quote outright outranks everything else, because
 *     a label that is quoted exactly is the most likely origin of the quote. This is the same
 *     relation the verifier decides by, which is why it is the first key and not a weighting.
 *  2. **shared 3-gram types, descending** — more surviving windows means closer in the only sense
 *     that survives an edit. Distinct types, never occurrences, for the reason in `trigrams.ts`.
 *  3. **record 3-gram types, ascending** — among rows sharing the same quote content, the shorter
 *     text is the closer restatement, so it ranks first. Ascending, because fewer types is closer.
 *  4. **`recordId`, ascending by UTF-16 code unit** — and this is the key that makes the whole thing
 *     a function rather than a habit.
 *
 * ## Why the tie-break is a code-unit comparison and not `localeCompare`
 *
 * `localeCompare` consults the platform's collation data: its result depends on the ICU version, the
 * locale, and whether the platform has been updated. The verifier's determinism claim is
 * 100% byte-identical verdicts across runs, and a comparator whose answer changes when a machine is
 * updated would quietly break that claim for suggestions too — a list that reorders after a
 * dependency bump is a list nobody can cite. `<` compares UTF-16 code units, is total, and is the
 * same comparison the gate tests and the snapshot digests use. Same-input-same-output is not a
 * nicety here; it is the product's claim (AGENTS.md §9, and the determinism test).
 */

/**
 * One record that cleared the floor, carrying the two numbers the order is defined on.
 *
 * `contained` and `shared` are measured during the scan — the scan is the only pass over the
 * corpus, and a second pass to rank 27,234 rows would double the wall clock for no new information.
 * `recordTypes` is a *thunk* rather than a number: it is the third key, so it is reached only by rows
 * that already tie on the first two, and on the real corpus the floor admits around twenty thousand
 * rows of which five are displayed. Counting the trigram types of twenty thousand records to break a
 * tie between two of them would be twenty thousand set builds for at most one number, so the count
 * happens on first ask and is then memoised per distinct text.
 */
export type NeighbourCandidate = {
  readonly recordId: string
  /** The record's folded text, exactly as stored. Used for the display diagnostic and for dedup. */
  readonly textMatch: string
  /** True when this record contains the folded quote outright. Measured by containment, not graded. */
  readonly contained: boolean
  /** Distinct 3-gram types shared with the quote. */
  readonly shared: number
  /** Distinct 3-gram types in this record, counted the first time the order asks. */
  readonly recordTypes: () => number
}

/** Total order on strings by UTF-16 code unit. Total: for any `a`, `b`, exactly one of <, >, =. */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The order, as a comparator.
 *
 * Every key is compared with a discriminating branch and a flat happy path at the bottom, because
 * this function is read far more often than it is edited (AGENTS.md §4). The type counts are asked for
 * last, which is what makes them lazy in practice: a comparison that decided on containment or shared
 * types never calls them.
 */
export const byNeighbourOrder = (a: NeighbourCandidate, b: NeighbourCandidate): number => {
  if (a.contained !== b.contained) return a.contained ? -1 : 1
  if (a.shared !== b.shared) return b.shared - a.shared
  const typesOfA = a.recordTypes()
  const typesOfB = b.recordTypes()
  return typesOfA === typesOfB ? byCodeUnit(a.recordId, b.recordId) : typesOfA - typesOfB
}

/** Sort a copy, so a caller's array is never mutated behind its back. */
export const rankCandidates = (candidates: readonly NeighbourCandidate[]): readonly NeighbourCandidate[] =>
  [...candidates].sort(byNeighbourOrder)

export * as Rank from "./rank.ts"