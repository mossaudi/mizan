import { MAX_QUOTE_CHARS, MAX_RECORD_CHARS, normalizeForMatch } from "@mizan/core"

/**
 * Character 3-grams over FOLDED text, and nothing else.
 *
 * ## Why this is a separate module
 *
 * Three callers need the same notion of "a 3-gram of folded text" — the scan, the ranking and the
 * tests that pin both — and three implementations of it would be three answers to one question
 * (AGENTS.md §17). This module owns the fold and the window, and exports nothing else.
 *
 * ## Why the fold is `normalizeForMatch` and not something local
 *
 * Because the stored `textMatch` column is already that fold (`adapters/record.ts` is the only
 * place a `textMatch` is created), and `foldQuote` in the verifier is literally
 * `normalizeForMatch`. Folding the quote here with any other function would mean suggestions
 * compared a quote in one canonical form against records in another, and the mismatch would show up
 * as a candidate that "should have" matched. Parity is the whole reason this package may depend on
 * `@mizan/core` and need nothing else.
 *
 * ## Why 3-grams at all
 *
 * A word-boundary index cannot find the record that contains a misquoted Arabic span, because a
 * mutated word loses its token. A 3-gram window has no notion of a word: a record that shares most
 * of the quote's windows is near it in the only sense that survives an edit. The window is fixed at
 * 3 and named, so a future "try 4" is a diff somebody argues for rather than a parameter nobody
 * noticed.
 *
 * ## What this module is not allowed to become
 *
 * There is no score here and no threshold. A count of shared windows is a count; the number a reader
 * would want is printed by the display-only `longestRunFor` diagnostic as two integers in a
 * sentence, and the quotient is never materialised anywhere (AGENTS.md §10, and gate G-7.4 on the
 * surface that renders it).
 */

/** The window, in characters. Fixed: the vocabulary of this package is written down here once. */
export const TRIGRAM_CHARS = 3

// `MAX_QUOTE_CHARS` and `MAX_RECORD_CHARS` are re-exported from `@mizan/core`, not declared here.
// The display-only `longestRunFor` diagnostic bounds the same two strings for the same reason, and
// neither package may depend on the other, so core owns the numbers and both read them — a second
// copy of either constant is a place where the two can disagree about what was compared without any
// test failing. See `packages/mizan-core/src/normalize/bounds.ts` for the argument.
export { MAX_QUOTE_CHARS, MAX_RECORD_CHARS }

/** The quote as everything downstream must see it: folded once, then capped. */
export const foldQuote = (rawQuote: string): string => normalizeForMatch(rawQuote).slice(0, MAX_QUOTE_CHARS)

/**
 * A record's folded text, capped.
 *
 * Applied by the scan rather than by the ranking so that the bound is part of "how much text was
 * considered" rather than a surprise applied twice.
 */
export const boundRecordText = (foldedText: string): string =>
  foldedText.length <= MAX_RECORD_CHARS ? foldedText : foldedText.slice(0, MAX_RECORD_CHARS)

/**
 * The point at which counting stops searching the record per quote gram and starts sliding a window.
 *
 * ## Why this number exists at all
 *
 * {@link sharedTrigramTypes} has two evaluation orders that return the same integer and differ only
 * in cost, and this is the line between them. Measured on the committed snapshot — 27,234 rows, one
 * scan of the whole corpus, a real fabricated hadith of 41 distinct grams:
 *
 * | order | one scan |
 * | --- | --- |
 * | search each quote gram in the record | **254 ms** |
 * | slide a window over the record | **2,613 ms** |
 *
 * The window order is ten times slower because each of the corpus's 7.3 million window positions
 * allocates a three-character string to hash. But the fast order costs `quote grams` native searches
 * per record, so a 4,096-character quote — `MAX_QUOTE_CHARS` away — would multiply it by a hundred
 * and turn a display aid into a stall on every row. Two hundred and fifty-six grams is several times
 * the size of a fabricated claim's quote and still deep inside the fast order's advantage; past it,
 * the bound on work per row matters more than the constant factor. It is a measured number, not a
 * preference, and `trigrams.test.ts` pins that both orders agree wherever the line falls.
 */
export const SUBSTRING_SEARCH_MAX_QUOTE_GRAMS = 256

/** Every distinct 3-gram of folded text, as a set of types. */
export const trigramsOf = (foldedText: string): ReadonlySet<string> => {
  const grams = new Set<string>()
  for (let index = 0; index + TRIGRAM_CHARS <= foldedText.length; index += 1) {
    grams.add(foldedText.slice(index, index + TRIGRAM_CHARS))
  }
  return grams
}

/** How many distinct 3-gram types a folded text has. Built only for rows that clear the floor. */
export const trigramTypes = (foldedText: string): number => trigramsOf(boundRecordText(foldedText)).size

/**
 * How many DISTINCT 3-gram types a folded record shares with the quote.
 *
 * Repeats must not count twice, or a record that repeats one phrase thirty times would outrank the
 * record that actually says the quote. A set is therefore the whole computation, and the record's own
 * type count is left to the ranking — which needs it only for the rows that cleared the floor, so
 * building it here for all 27,234 rows would be 27,234 allocations spent on rows that can never rank.
 *
 * Distinct types are counted by asking the *quote's* side, "which of your grams does this record
 * contain?", once per gram. The record is bounded here so the function is safe to call on its own,
 * not only from a caller that remembered to bound it.
 */
export const sharedTrigramTypes = (foldedText: string, quoteTrigrams: ReadonlySet<string>): number => {
  const bounded = boundRecordText(foldedText)
  if (quoteTrigrams.size <= SUBSTRING_SEARCH_MAX_QUOTE_GRAMS) {
    return bySearchingEachQuoteGram(bounded, quoteTrigrams)
  }
  return bySlidingWindow(bounded, quoteTrigrams)
}

/**
 * The count, by searching the record once per distinct quote gram.
 *
 * `String.prototype.includes` is a native search, so this order does `quote grams` of them and no
 * string allocation at all — which is why it is the fast one for the short quotes a fabricated claim
 * is made of.
 */
const bySearchingEachQuoteGram = (boundedRecordText: string, quoteTrigrams: ReadonlySet<string>): number => {
  let shared = 0
  for (const gram of quoteTrigrams) {
    if (boundedRecordText.includes(gram)) shared += 1
  }
  return shared
}

/**
 * The count, by sliding a window over the record and asking about every window.
 *
 * This order costs `record length` regardless of how long the quote is, which is what makes a
 * pathological quote cheap instead of a stall, at the price of allocating one three-character string
 * per window position.
 */
const bySlidingWindow = (boundedRecordText: string, quoteTrigrams: ReadonlySet<string>): number => {
  const shared = new Set<string>()
  for (let index = 0; index + TRIGRAM_CHARS <= boundedRecordText.length; index += 1) {
    const gram = boundedRecordText.slice(index, index + TRIGRAM_CHARS)
    if (quoteTrigrams.has(gram)) shared.add(gram)
  }
  return shared.size
}

export * as Trigrams from "./trigrams.ts"