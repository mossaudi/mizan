import { err, isNonBlank, normalizeForMatch, ok, type Result, type RetrievalError } from "@mizan/core"

/**
 * Building the FTS5 `MATCH` expression. A security boundary, not a convenience.
 *
 * ## Why this file exists at all
 *
 * FTS5's `MATCH` argument is a QUERY LANGUAGE, not a string: it has `OR`, `AND`, `NOT`,
 * `NEAR(...)`, prefix `*`, column filters `^`, and quoting. Interpolating a user's question
 * into it hands the user that language. `NEAR` is in particular an *ordering* primitive — it
 * lets a caller express proximity, which is a similarity judgement, and the whole point of this
 * repository is that similarity does not get to decide anything. So a query that reaches the
 * index has been reduced to characters that cannot mean anything but text.
 *
 * ## The two defences, and why one is not enough
 *
 *  1. **Allow-list the characters.** After folding, keep only `\p{L}` and `\p{N}` runs. That
 *     removes every FTS5 sigil (`"`, `(`, `)`, `*`, `^`, `-`, `:`) and the `*` prefix operator.
 *  2. **Quote every token anyway.** Character filtering alone is NOT sufficient, because the
 *     operator words are plain letters: the single word `OR` survives an allow-list and then
 *     means "logical or" to the parser. Wrapping each token in double quotes makes it a literal
 *     string, so `"OR"` is the word or and nothing else. This is why both defences are here.
 *
 * Because the allow-list guarantees a token contains no `"`, the quotes need no escaping — and
 * `assertQuotable` re-proves that at runtime instead of trusting a comment.
 */

/** Longer than any real question, short enough that a pasted document cannot become a query. */
export const MAX_QUERY_CHARS = 200

/**
 * The character allow-list, expressed as the INVERSE of a separator.
 *
 * `normalizeForMatch` deliberately preserves punctuation — it is a display-and-match fold, and
 * quietly deleting a `-` from a corpus string would corrupt a citation — so the folded query can
 * still contain `"`, `*`, `(`, `:`, `-` and the rest of FTS5's operator set. Splitting on any
 * non-alphanumeric run is what removes them, and it is why the two defences above are both
 * needed: this drops the sigils, and `quote` neutralises the alphabetic operator words.
 *
 * It splits on more than whitespace on purpose. `الصلاة-الجيدة` is one token to a naive
 * whitespace split, and a token containing `-` would then be rejected whole — so a perfectly
 * ordinary hyphenated question would come back as `empty_query`. Splitting on the character
 * class instead yields `["الصلاه", "الجيده"]`, which is both safe and what the reader meant.
 */
const TOKEN_SEPARATORS = /[^\p{L}\p{N}]+/u

/** Folded words: maximal runs of letters and digits. Nothing else can reach the index. */
const splitTokens = (folded: string): readonly string[] =>
  folded.split(TOKEN_SEPARATORS).filter((token) => token.length > 0)

/** FTS5 string literals double an embedded quote. Unreachable after the allow-list; proved anyway. */
const quote = (token: string): string => {
  if (token.includes('"')) throw new TypeError(`fts5: refusing to quote an unfiltered token ${token}`)
  return `"${token}"`
}

export const assertQuotable = quote

/** The broad pass: every query token, OR-ed. High recall. */
export const broadExpression = (tokens: readonly string[]): string => tokens.map(quote).join(" OR ")

/** The precise pass: the tokens as one consecutive phrase. No recall, high precision. */
export const phraseExpression = (tokens: readonly string[]): string => quote(tokens.join(" "))

/**
 * The prefix pass: all but the last token exact, the last one a prefix.
 *
 * This is what lets a judge type the start of a verse and get the rest, and it is the reason
 * the precise pass is a genuinely separate ranker rather than a stricter filter on the same list.
 */
export const prefixExpression = (tokens: readonly string[]): string => {
  const head = tokens.slice(0, -1).map(quote)
  const last = tokens[tokens.length - 1]
  if (last === undefined) throw new TypeError("fts5: prefix expression needs at least one token")
  return [...head, `${quote(last)}*`].join(" ")
}

/**
 * Fold and tokenise a caller-supplied query.
 *
 * Folding here rather than at each call site is what keeps the retriever and the verifier
 * agreeing on what the text is: the same `normalizeForMatch` that produced `textMatch` at
 * ingest produces the query, so a folded query finds a folded record.
 *
 * @returns `empty_query` for blank input or input with no word characters — a query of pure
 *   punctuation has no honest answer, and matching everything would be the dishonest one.
 *   `query_too_long` past the cap.
 */
export const prepareQuery = (raw: string): Result<readonly string[], RetrievalError> => {
  if (!isNonBlank(raw)) return err({ _tag: "empty_query" })
  if (raw.length > MAX_QUERY_CHARS) return err({ _tag: "query_too_long", length: raw.length, cap: MAX_QUERY_CHARS })
  const tokens = splitTokens(normalizeForMatch(raw))
  if (tokens.length === 0) return err({ _tag: "empty_query" })
  return ok(tokens)
}

export * as FtsQuery from "./query.ts"
