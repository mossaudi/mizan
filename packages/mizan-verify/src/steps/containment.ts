import { normalizeForMatch, type Citation, type CorpusRecord } from "@mizan/core"

/**
 * The single containment primitive in the entire verification path.
 *
 * There is exactly one `String.prototype.includes` in this package, and it is here.
 * Every route to a `verified` verdict terminates in this function; no other module
 * in `mizan-verify` may compare a quote against a record. Gate G-1 asserts the
 * property mechanically, and a unit test asserts that this file is the only one that
 * mentions `includes`.
 *
 * ## Why strict containment and nothing else
 *
 * A feasibility spike measured the alternative. Against a real diacriticized hadith:
 *
 *   - verbatim quote, diacriticized ......... substring match
 *   - verbatim, tashkeel stripped ........... substring match
 *   - verbatim + tatweel + doubled spaces ... substring match
 *   - English gloss ......................... no match
 *   - faithful Arabic paraphrase ............ no match, but FUZZY = TRUE
 *   - fabricated hadith ..................... no match, but FUZZY = TRUE
 *
 * So containment is *sufficient* for the case that matters (a real quotation, however
 * the model spelled it) and correctly *rejects* both fabrications. A similarity
 * fallback, by contrast, accepts the fabrication. That is CWE-345 — insufficient
 * verification of data authenticity — with a confidence indicator on it, and it is
 * the reason this function takes a boolean and not a score. ADR-03, INTEGRITY.md §2.
 *
 * ## Why the fold happens here and not in the corpus
 *
 * `record.textMatch` was folded ONCE at ingest. A verification run folds only the
 * quote — tens of characters — and does an `includes` against a pre-folded column. A
 * normalizer that ran over the corpus at query time would be a per-query cost on
 * ~42k records, and would put the exact string a verdict depends on outside the
 * snapshot's hash.
 */

export type ContainmentResult = {
  /** True only when the folded quote is a substring of the folded record. */
  readonly hit: boolean
  /** The quote after the deterministic Arabic fold. Empty for an empty or diacritics-only quote. */
  readonly foldedQuote: string
  /** Characters of the folded quote found in the record. Equals `foldedQuote.length` on a hit. */
  readonly matchedChars: number
  /** Characters in the record's folded text, for the display-only ratio. */
  readonly recordChars: number
}

const MISS: ContainmentResult = { hit: false, foldedQuote: "", matchedChars: 0, recordChars: 0 }

/**
 * Fold a quoted span into the containment key.
 *
 * Exported so the report can report `quoteChars` without re-folding, and so a caller
 * can show a judge exactly what string the verdict was computed on.
 */
export const foldQuote = (rawQuote: string): string => normalizeForMatch(rawQuote)

/**
 * The one and only containment check.
 *
 * An empty folded quote is a miss by construction. That is what makes an empty or
 * whitespace-only quote `unverifiable (empty_quote)` rather than an accidental match
 * against every record.
 */
export const containsQuote = (rawQuote: string, record: CorpusRecord): ContainmentResult => {
  const foldedQuote = foldQuote(rawQuote)
  if (foldedQuote.length === 0) return { ...MISS, recordChars: record.textMatch.length }
  const hit = record.textMatch.includes(foldedQuote)
  if (!hit) return { hit, foldedQuote, matchedChars: 0, recordChars: record.textMatch.length }
  return { hit, foldedQuote, matchedChars: foldedQuote.length, recordChars: record.textMatch.length }
}

export * as Containment from "./containment.ts"
