import { foldQuote, MAX_QUOTE_CHARS, boundRecordText, sharedTrigramTypes, trigramsOf, trigramTypes } from "./trigrams.ts"
import { byCodeUnit, byNeighbourOrder, rankCandidates, type NeighbourCandidate } from "./rank.ts"

/**
 * The floor, the cap, and the two functions the product and the harness both call.
 *
 * ## Why this module can be trusted with a similarity judgement
 *
 * It cannot: ADR-07 is why it is a leaf package whose vocabulary excludes the words a decision is
 * made of, and ADR-09 is why what it produces is an ORDER of real record ids rather than a number
 * about how right any of them is. This module never opens a database and never sees a claim.
 *
 * ## Why the floor is a named constant and not an argument
 *
 * `8` is anchored to the verifier's `MIN_SPAN_CHARS = 8`: a correction span must survive eight
 * canonical characters to be offered at all, and a suggestion that is weaker than the threshold for
 * mentioning a correction is noise dressed as help. It is a constant here so that
 * `rankNeighbours` cannot be called with a floor of 0 by accident — and the floor is still reachable
 * for measurement through `rankNeighboursAtFloor`, because the recorded coverage number in
 * `scripts/eval/suggest-coverage.ts` is reported at 4, 8 and 12 and a harness that could not vary
 * the floor could not keep that number honest.
 *
 * Deduplication by folded text and the code-unit ordering that makes the result reproducible are
 * ADR-10, and both live in `rank.ts` and below.
 */

/** Shared 3-gram types a record must reach to be offered at all. Anchored to `MIN_SPAN_CHARS`. */
export const MIN_SHARED_TRIGRAMS = 8

/** What a caller gets when it does not ask for a count: three lines, which is a readable block. */
export const DEFAULT_TOP_K = 3

/** The hard ceiling. Three to five, and never more, however large `topK` is claimed to be. */
export const MAX_TOP_K = 5

/**
 * How many rows the expensive half of ranking will look at, in whole tie groups.
 *
 * ## Why there is a number like this at all
 *
 * On the real corpus the floor of eight shared 3-gram types admits a median of **20,796 of 27,234**
 * rows for a fabricated hadith, because a long record written in Arabic clears eight shared windows
 * with a fifty-character quote almost by accident. Ranking twenty thousand candidates means counting
 * the 3-gram types of twenty thousand records — most of a second per rejected claim, spent to
 * choose five lines. `docs/specs/measurements.md` records the measured cost of the narrowed path and
 * the conditions it was measured under; the figure named here is the pre-narrowing one, kept because
 * it is what the narrowing was worth.
 *
 * So the rows are narrowed first, and the narrowing is required to be **answer-preserving**: a row is
 * dropped only when its `contained` and `shared` keys are *strictly* worse than every kept row's, which
 * means it sorts below all of them under the full order no matter what its type count turns out to be.
 * Only rows that tie on both cheap keys with the last kept row are carried past the cut, so a tie is
 * never split — splitting one would let a dropped row beat a kept one on the third key, and "the third
 * nearest" would depend on where the cut fell (ADR-09, ADR-10).
 */
export const MAX_ROWS_RANKED = 1_024

/** True when `row` outranks `other` on the two keys that cost nothing to compute. */
const outranksOnCheapKeys = (row: ScannedNeighbour, other: ScannedNeighbour): boolean => {
  if (row.contained !== other.contained) return row.contained
  return row.shared > other.shared
}

/** True when two rows tie on both cheap keys, which is exactly when the type count decides. */
const tiesOnCheapKeys = (row: ScannedNeighbour, other: ScannedNeighbour): boolean =>
  row.contained === other.contained && row.shared === other.shared

/**
 * Keep the rows that can reach the top `MAX_TOP_K`, and nothing else, without changing the order.
 *
 * The sort here uses only `contained`, `shared` and `recordId` — no type counts, so it costs a numeric
 * comparison per row and produces the same grouping the full order does, because those three keys come
 * first in that order too. Rows of one folded text share those keys (they are functions of the text),
 * so dropping a row cannot drop a better row of the same text, and deduplication below is unaffected.
 */
const narrowToReachableRows = (eligible: readonly ScannedNeighbour[]): readonly ScannedNeighbour[] => {
  if (eligible.length <= MAX_ROWS_RANKED) return eligible
  const byCheapKeys = [...eligible].sort(
    (a, b) => (outranksOnCheapKeys(a, b) ? -1 : outranksOnCheapKeys(b, a) ? 1 : byCodeUnit(a.recordId, b.recordId)),
  )
  const straddling = byCheapKeys[MAX_ROWS_RANKED - 1]
  // Unreachable — the length check above guarantees the index — but if it ever happened the honest
  // answer is the whole eligible list, which is what this function did before it existed (AGENTS.md §3).
  if (straddling === undefined) return eligible
  const groupStart = byCheapKeys.findIndex((row) => tiesOnCheapKeys(row, straddling))
  let groupEnd = groupStart
  for (let index = groupStart + 1; index < byCheapKeys.length; index += 1) {
    const row = byCheapKeys[index]
    if (row === undefined || !tiesOnCheapKeys(row, straddling)) break
    groupEnd = index
  }
  return byCheapKeys.slice(0, groupEnd + 1)
}

/** One row's measurement against the quote, as the scan hands it back. */
export type RowOverlap = {
  /** True when the record contains the folded quote outright. Measured, never graded. */
  readonly contained: boolean
  /** Distinct 3-gram types shared with the quote. */
  readonly shared: number
}

/**
 * A search opened once, for one quote.
 *
 * The scan calls `overlapOf` on every record, so the quote is folded and its 3-gram set is built
 * exactly once no matter how many rows are read. Returning a closure instead of a function of
 * `(quote, record)` is what keeps that from becoming a per-row rebuild — the difference between a
 * ~200 ms scan and a multi-second one on the real 27,234-row snapshot. That comparison is a ratio
 * between two shapes of the same loop, not the product's cost; the shipped figure is in
 * `docs/specs/measurements.md`.
 */
export type SearchHandle = {
  /** The quote as everything downstream must see it. Exposed so the caller never folds twice. */
  readonly quoteFolded: string
  /** True when the folded quote is too short to yield a single 3-gram, so nothing can be measured. */
  readonly quoteTooShort: boolean
  /** Measure one folded record against this quote. Pure, and cheap enough for every row. */
  readonly overlapOf: (foldedRecordText: string) => RowOverlap
}

/**
 * Open a search over a quote.
 *
 * ## What `overlapOf` does and does not decide
 *
 * It answers two questions about one record — does it contain the quote, and how many distinct
 * 3-gram types does it share with it — and nothing about whether the record should be shown. That
 * decision belongs to `rankNeighbours`, so a scan cannot widen or narrow the floor it is feeding.
 */
export const openSearch = (rawQuote: string): SearchHandle => {
  const quoteFolded = foldQuote(rawQuote)
  const quoteTrigrams = trigramsOf(quoteFolded)
  return {
    quoteFolded,
    quoteTooShort: quoteTrigrams.size === 0,
    overlapOf: (foldedRecordText: string) => {
      // Bounded once, then measured: bounding twice would re-walk a 65 KB record for no reason.
      const bounded = boundRecordText(foldedRecordText)
      return {
        contained: quoteFolded.length > 0 && bounded.includes(quoteFolded),
        shared: sharedTrigramTypes(bounded, quoteTrigrams),
      }
    },
  }
}

/** One record that cleared the floor, before the order is applied. */
export type ScannedNeighbour = {
  readonly recordId: string
  /**
   * The collection the record belongs to, carried so the search can be scoped without a second read.
   *
   * The scan already has the column in hand, so this costs nothing to carry, and dropping it would
   * make scoping a second database pass — the difference between a policy the caller can apply and a
   * policy the caller cannot.
   */
  readonly collection: string
  readonly textMatch: string
  readonly contained: boolean
  readonly shared: number
}

/** One neighbour, in order, with its place in the list already decided. */
export type RankedNeighbour = {
  /** Dense from 1. A position, not a measurement, and never divided by anything. */
  readonly rank: number
  readonly recordId: string
  /** The record's folded text, for the display-only `longestRunFor` diagnostic. */
  readonly textMatch: string
  /** True when the record contains the quote outright. */
  readonly contained: boolean
}

/** The input to ranking: a quote, the rows that cleared the floor, and how many lines to return. */
export type RankNeighboursInput = {
  readonly quote: string
  readonly rows: readonly ScannedNeighbour[]
  readonly topK?: number
}

/**
 * `topK`, clamped to `[1, MAX_TOP_K]`, with the default applied.
 *
 * Clamping rather than rejecting is deliberate: `topK` comes from a future HTTP query parameter and
 * from a CLI flag, and the honest response to `topK: 5000` is five lines, not a 400. A number that
 * is not a finite number gets the default, because `NaN` reaching a `.slice()` would produce an empty
 * list and an empty list reads as "nothing near your quote".
 */
export const boundTopK = (requested: number | undefined): number => {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_TOP_K
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_TOP_K)
}

/**
 * Collapse records that say the same thing.
 *
 * ## Why this is not optional
 *
 * The real snapshot holds 31 rows whose folded text is the identical Qur'anic verse, so an
 * undeduplicated top five can be one quote printed five times — which reads as five independent
 * sources for a fabrication and is the opposite of the truth. Identity is the folded text, because
 * the fold is what made them identical; the ids differ, the words do not.
 *
 * ## Why the survivor is the ORDER winner and not the first one seen
 *
 * Rows arrive from the scan in `recordId` order, so "the first one seen" would be an answer that
 * happens to be right whenever the scan is in id order and wrong the moment it is not — and a
 * determinism test reverses the rows on purpose to catch exactly that. The winner is therefore the
 * candidate that wins `byNeighbourOrder` within its group, which for identical text reduces to the
 * smaller `recordId`, and is the same row no matter what order the scan read them in.
 *
 * The `recordTypes` of a text are counted at most once per distinct text, on first ask, so 31
 * identical verses cost one pass rather than 31 — and a candidate that never reaches a tie-break costs
 * none at all.
 */
const distinctByText = (rows: readonly ScannedNeighbour[]): readonly NeighbourCandidate[] => {
  const lazyTypes = new Map<string, () => number>()
  const typeCount = (textMatch: string): (() => number) => {
    const known = lazyTypes.get(textMatch)
    if (known !== undefined) return known
    let counted: number | undefined
    const read = (): number => {
      if (counted === undefined) counted = trigramTypes(textMatch)
      return counted
    }
    lazyTypes.set(textMatch, read)
    return read
  }

  const best = new Map<string, NeighbourCandidate>()
  for (const row of rows) {
    const candidate: NeighbourCandidate = {
      recordId: row.recordId,
      textMatch: row.textMatch,
      contained: row.contained,
      shared: row.shared,
      // Rows of one text share this thunk, so a tie inside the group reads the same number twice
      // and the group is decided by `recordId` alone — which is exactly the ADR-10 rule, arrived at by
      // the order rather than by a special case.
      recordTypes: typeCount(row.textMatch),
    }
    const key = row.collection + '::' + row.textMatch
      const existing = best.get(key)
    if (existing === undefined || byNeighbourOrder(candidate, existing) < 0) best.set(key, candidate)
  }
  return [...best.values()]
}

/**
 * Rank at an explicit floor.
 *
 * Exposed for the coverage harness, which has to report the neighbourhood at 4, 8 and 12 shared
 * types to keep the chosen 8 defensible. Product code calls `rankNeighbours`, which pins the floor to
 * `MIN_SHARED_TRIGRAMS` — the floor is not a per-call dial.
 */
export const rankNeighboursAtFloor = (
  input: RankNeighboursInput & { readonly floor: number },
): readonly RankedNeighbour[] => {
  if (input.quote.trim().length === 0) return []
  const eligible = input.rows.filter((row) => row.contained || row.shared >= input.floor)
  return rankCandidates(distinctByText(narrowToReachableRows(eligible)))
    .slice(0, boundTopK(input.topK))
    .map((row, index) => ({
      rank: index + 1,
      recordId: row.recordId,
      textMatch: row.textMatch,
      contained: row.contained,
    }))
}

/**
 * Rank the records the scan cleared, for display beside a rejection.
 *
 * Deterministic by construction: one fold per quote, one total order, no clock, no locale, no
 * randomness, no I/O. The same rows and the same quote give the same list on every machine and every
 * run, which is what lets the coverage harness record a number and the determinism test assert it.
 *
 * Returns an empty list when the quote is empty or nothing cleared the floor. An empty list is
 * honest — "no_candidates" is what the CLI says about it — and it is never padded: three
 * suggestions where there is one real candidate would be one real candidate and two blanks.
 */
export const rankNeighbours = (input: RankNeighboursInput): readonly RankedNeighbour[] =>
  rankNeighboursAtFloor({ ...input, floor: MIN_SHARED_TRIGRAMS })

/**
 * Rank only the records of one collection.
 *
 * ## Why the default scope is the cited record's own collection
 *
 * A citation names a collection, and the lineage of a hadith is part of what the citation asserts: a
 * reader who cited Bukhari:1234 and is shown Abu Dawud:4321 has been shown a different book. Worse,
 * an unscoped search hides that — with 27,234 records across a dozen collections, a wrong-collection
 * citation is very likely to find *something* close in some other book, and the reader is handed a
 * plausible line with no way to see that it came from somewhere else. Scoping makes the common
 * failure honest: a citation into the wrong collection reaches `no_candidates`, which is a statement
 * about proximity the reader can check, rather than a list from the wrong lineage.
 *
 * ## Why this is a function and not a filter the caller writes
 *
 * Because the filter has to run *before* the cap and *inside* the same floor, or "within this
 * collection" would mean "the best five of this collection out of everything the cap let through" —
 * which is a different list every time the corpus grows. One place applies it.
 *
 * Widening to the whole snapshot is the caller's decision, not a fallback here, and the caller must
 * say so in what it returns: a widened list presented as a scoped one is a silent downgrade wearing a
 * scoped list's clothes (AGENTS.md §16).
 */
export const rankNeighboursInCollection = (
  input: RankNeighboursInput & { readonly collection: string },
): readonly RankedNeighbour[] =>
  rankNeighboursAtFloor({
    quote: input.quote,
    topK: input.topK,
    floor: MIN_SHARED_TRIGRAMS,
    rows: input.rows.filter((row) => row.collection === input.collection),
  })

/** The cap on quote length, re-exported so a caller can state it without a second import. */
export { MAX_QUOTE_CHARS }

export * as Suggest from "./suggest.ts"