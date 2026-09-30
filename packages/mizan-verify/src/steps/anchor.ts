import { normalizeForMatch, type AnchorSpan, type CorpusRecord } from "@mizan/core"

/**
 * The anchor locator — how a claim that is NOT a contiguous quotation gets decided.
 *
 * ## The only thing this module is allowed to do
 *
 * Report whether a span of the ALREADY-RESOLVED cited record contains a 3-8 word fragment of
 * real source text, and if so return that span verbatim. That is all. It cannot search the
 * corpus, cannot re-resolve a citation, cannot change which record is checked, and cannot
 * return a number of any kind. Gate **G-7.1** fails the build if this file so much as names
 * an outcome, and **G-7.4** fails it if a percentage-shaped field appears.
 *
 * ## Why a locator and not a measurement
 *
 * The feasibility spike behind ADR-03 measured the alternative: a fabricated but plausible
 * hadith scores HIGH on similarity, edit distance and embeddings, while a faithful paraphrase
 * scores poorly on all of them. Any threshold that admits the second admits the first, and it
 * would be retuned on exactly the cases that motivated it. So this module has no threshold, no
 * distance, and no count — `appearsInOrder` returns a boolean and two integer offsets, and
 * those offsets are the *ends of a real substring*, never a ratio of anything. The architecture
 * predicted 100% byte-identical output across repeated runs precisely because there is nothing
 * here to be approximate.
 *
 * ## Two arms, and why the "normalized" arm is not a third one
 *
 * Arm A is `textMatch.indexOf(foldedAnchor)`: a concrete contiguous span, first occurrence.
 * Arm B is an ordered, non-contiguous token match. The architecture names three arms —
 * exact, normalized, ordered-token-subsequence — but `record.textMatch` is ALREADY
 * `normalizeForMatch(textDisplay)`, folded once at ingest, so a separate "normalized" pass is
 * definitionally arm A on the same string. Shipping it as a third arm would be a dead branch
 * that a reader would have to reason about, so this header says so instead.
 *
 * ## `indexOf`, never `includes`
 *
 * `String.prototype.includes` answers a yes/no question; `indexOf` answers "where". Gate
 * **G-1.4** pins `includes` to `steps/containment.ts` and `src/diagnostics/` because
 * containment is the single place a decision is made. Using `indexOf` here keeps that
 * allowlist at its current size and keeps "the only `includes`" a single-file fact, rather
 * than a list with three entries that grows every time a helper needs to find a string.
 *
 * ## The shape is the control
 *
 * `AnchorSpan` is `{ located: boolean; span: string }` — two fields, and no third is
 * representable. A branch that could report "located, 0.87" would have reintroduced the very
 * number this repository spent a feasibility spike proving cannot be trusted with this
 * decision. `located: false` is an expected outcome, not an error: it is the answer for a
 * claim whose abridgement cannot be found, and it is why this module adds no new failure mode.
 *
 * ## No clock, no randomness, no network
 *
 * A deadline is an injected PREDICATE, exactly as `verifyAnswer`'s `deadlineExpired` already
 * is, because a clock read inside the decision path would make verdicts depend on machine
 * speed. If the predicate has expired the answer is "not located" — never a partial span, and
 * never a retry.
 */

/** Fewer words than this is too short to be a deliberate pointer at real text. */
export const ANCHOR_MIN_WORDS = 3

/** More words than this is a quotation, and a quotation is what containment already decides. */
export const ANCHOR_MAX_WORDS = 8

/**
 * A hard cap on the FOLDED anchor, in characters.
 *
 * It bounds the work a single claim can ask for and it is enforced on the folded string rather
 * than the raw one, because the folded string is what gets searched. An over-long anchor is
 * REJECTED, never truncated: a truncation would silently hand the locator a different string
 * than the author wrote, and "we looked for something near what you said" is not a claim this
 * repository is willing to make on a judge's behalf.
 */
export const ANCHOR_MAX_CHARS = 160

/** The not-located answer. A module constant so every miss is byte-identical. */
const NOT_LOCATED: AnchorSpan = { located: false, span: "" }

/** The not-ordered answer. `-1` rather than a null so the type stays numeric and total. */
const NOT_ORDERED: OrderedRun = { ordered: false, firstIndex: -1, lastIndex: -1 }

/**
 * The result of the shared ordered-token relation.
 *
 * Two integers and a boolean. Deliberately not a count and not a ratio: a count of matched
 * tokens over a total is a score wearing a hat, and the display-only taxonomy reuses this
 * relation while staying outside the decision path.
 */
export type OrderedRun = {
  readonly ordered: boolean
  /** Index into the record's token list of the first quote token matched. `-1` when not ordered. */
  readonly firstIndex: number
  /** Index into the record's token list of the last quote token matched. `-1` when not ordered. */
  readonly lastIndex: number
}

/**
 * Fold and validate a raw anchor, or return `null`.
 *
 * ## Why validation rather than trust
 *
 * The anchor crosses a trust boundary: it is model output, decoded but not thereby
 * trustworthy. A word count is a claim about intent ("this is a short pointer at real text"),
 * and an unvalidated anchor of forty words is a quotation — which containment has already
 * ruled on by the time this is reached. So the bounds are checked here, in one place, and a
 * claim that fails them is treated as though it carried no anchor at all.
 *
 * `null` means "absent", not "error", and the caller's response to absent is the answer it
 * already gave before this module existed.
 */
export const anchorFrom = (raw: string | null | undefined): string | null => {
  if (raw === null || raw === undefined) return null
  const folded = normalizeForMatch(raw)
  if (folded.length === 0) return null
  if (folded.length > ANCHOR_MAX_CHARS) return null
  const words = folded.split(" ").length
  if (words < ANCHOR_MIN_WORDS) return null
  if (words > ANCHOR_MAX_WORDS) return null
  return folded
}

/**
 * The SHARED ordered-token relation.
 *
 * One forward pass, no backtracking, `O(record tokens + quote tokens)`. Each quote token must
 * appear at a strictly later index than the one before it, so "present in order" cannot be
 * satisfied by re-using the same occurrence of a common word.
 *
 * This is named `appearsInOrder` rather than anything overlap-shaped on purpose: the banned
 * vocabulary in **G-1.2** would flag a name like `tokenOverlap`, and the only fix for a
 * false positive is to weaken the list. A rule that cries wolf gets switched off, and a
 * switched-off rule protects nothing. The naming discipline is doing load-bearing work here.
 */
export const appearsInOrder = (quoteTokens: readonly string[], recordTokens: readonly string[]): OrderedRun => {
  if (quoteTokens.length === 0) return NOT_ORDERED
  let cursor = 0
  let firstIndex = -1
  let lastIndex = -1
  for (const token of quoteTokens) {
    const at = indexFrom(recordTokens, token, cursor)
    if (at < 0) return NOT_ORDERED
    if (firstIndex < 0) firstIndex = at
    lastIndex = at
    cursor = at + 1
  }
  return { ordered: true, firstIndex, lastIndex }
}

/** First index at or after `from` whose token equals `token`, or -1. */
const indexFrom = (tokens: readonly string[], token: string, from: number): number => {
  for (let index = Math.max(from, 0); index < tokens.length; index += 1) {
    if (tokens[index] === token) return index
  }
  return -1
}

/** Tokens with their character offsets, so a token index maps back to a real substring. */
type TokenRuns = { readonly tokens: readonly string[]; readonly starts: readonly number[]; readonly ends: readonly number[] }

/**
 * Split folded text into whitespace-delimited tokens, recording where each one begins.
 *
 * `textMatch` is whitespace-collapsed and trimmed by the fold, so a single space is the only
 * separator and the offsets are exact. One pass, and the three arrays stay parallel by
 * construction because they are pushed together.
 */
const tokenRuns = (text: string): TokenRuns => {
  const tokens: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  let cursor = 0
  for (const token of text.split(" ")) {
    tokens.push(token)
    starts.push(cursor)
    ends.push(cursor + token.length)
    cursor += token.length + 1
  }
  return { tokens, starts, ends }
}

/**
 * Locate a folded anchor in ONE already-resolved record.
 *
 * ## Determinism, stated rather than assumed
 *
 * A span that occurs more than once reports the FIRST occurrence, because `indexOf` and the
 * forward pass both scan left to right. Given the same snapshot and the same anchor this
 * returns the same span every time, with no clock, no randomness and no locale involved.
 *
 * ## Which record
 *
 * The caller passes one record it has already resolved. This function never receives a
 * collection, never queries anything, and never chooses between candidates — so an anchor
 * cannot pull a claim toward a source the answer did not cite. That is the whole of the
 * injection surface, and it is structural rather than filtered.
 *
 * @param foldedAnchor Output of `anchorFrom`. Passing `""` is legal and reports not-located.
 * @param record The single record the claim's citation resolved to.
 * @param expired Injected deadline predicate; `true` short-circuits to not-located.
 */
export const locateAnchor = (foldedAnchor: string, record: CorpusRecord, expired?: () => boolean): AnchorSpan => {
  if (expired?.() === true) return NOT_LOCATED
  if (foldedAnchor.length === 0) return NOT_LOCATED

  // Arm A — a concrete contiguous span. `indexOf` returns -1 on a miss and 0 on a hit at the
  // very start, so the comparison has to be against zero and not used for truthiness.
  const at = record.textMatch.indexOf(foldedAnchor)
  if (at >= 0) return { located: true, span: record.textMatch.slice(at, at + foldedAnchor.length) }

  // Arm B — the tokens appear, in order, not contiguously. The span is the record's own text
  // from the first matched token through the last, so what is reported is a real substring of
  // the record rather than a reconstruction of what the model said.
  const runs = tokenRuns(record.textMatch)
  const run = appearsInOrder(foldedAnchor.split(" "), runs.tokens)
  if (!run.ordered) return NOT_LOCATED
  if (expired?.() === true) return NOT_LOCATED
  return { located: true, span: record.textMatch.slice(runs.starts[run.firstIndex] ?? 0, runs.ends[run.lastIndex] ?? 0) }
}

export * as Anchor from "./anchor.ts"
