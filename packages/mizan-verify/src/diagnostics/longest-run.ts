import { MAX_QUOTE_CHARS, MAX_RECORD_CHARS } from "@mizan/core"
import { foldQuote } from "../steps/containment.ts"

/**
 * DISPLAY-ONLY longest-run diagnostic. NOT part of verification. Do not import from
 * `verify.ts` — gate G-1 fails the build if you do.
 *
 * ## What this is for
 *
 * A judge looking at a `rejected` badge wants to know *how close* it came: did the model
 * drop one clause, or invent the sentence? "The longest run of shared characters is 34 of
 * 61" answers that in one line, and a bare "rejected" does not.
 *
 * ## What this must never be for
 *
 * Turning `displayPercent` into a threshold. That is the whole point of the exercise.
 * The spike in ADR-03 measured it on a real corpus: a *fabricated* hadith scored 0.89 and
 * a *faithful paraphrase* scored 0.86, because Arabic shares long character runs with
 * plenty of real texts. A threshold anywhere above "the quote is contained" accepts
 * fabrications. A number in this file is a number a human reads; a number that changes a
 * verdict is a vulnerability with a decimal point.
 *
 * That is why `MatchStrength` is `exact | none` and why this file is a separate module
 * the verifier cannot see. AGENTS.md section 10.
 *
 * ## Why the two bounds are imported rather than declared
 *
 * `MAX_QUOTE_CHARS` and `MAX_RECORD_CHARS` bound the same two strings in `@mizan/suggest`, for the
 * same reason — a bound before anything quadratic — and this package may not depend on that one, so
 * `@mizan/core` owns both numbers. Two local copies would be two answers to "how much text does this
 * product look at", and the disagreement would be silent (AGENTS.md §17).
 */

export type LongestRun = {
  /** Length of the longest common contiguous run, in folded characters. */
  readonly runChars: number
  /** Length of the folded quote. */
  readonly quoteChars: number
  /** `true` when the folded quote is contained outright — the only verified path. */
  readonly contained: boolean
  /**
   * `0..100`, rounded to one decimal. **DISPLAY ONLY.**
   * `runChars / quoteChars`, which is why a short quote that shares a common phrase can
   * look flattering. Read it next to `contained`, never instead of it.
   */
  readonly displayPercent: number
}

const EMPTY_RUN: LongestRun = { runChars: 0, quoteChars: 0, contained: false, displayPercent: 0 }

/**
 * A located run of the record, in FOLDED coordinates.
 *
 * ## Why this is not a confidence
 *
 * `startChar` and `endChar` are positions. There is no length on this type that a caller could
 * divide, and no `percent` field to turn into one — the same reason `MatchStrength` is two shapes
 * and not a number. A correction says "the record says this, here"; it never says "the record
 * agrees this much".
 *
 * `absent` is a first-class case, not a zero-length span. A caller that received
 * `{ startChar: 0, endChar: 0, text: "" }` would render a caret under position zero of a record
 * that shares nothing with the quote, which is a location marker pointing at a non-fact.
 */
export type LocatedSpan =
  | { readonly kind: "located"; readonly startChar: number; readonly endChar: number; readonly text: string }
  | { readonly kind: "absent" }

const ABSENT_SPAN: LocatedSpan = { kind: "absent" }

/**
 * The longest common substring, with where it sits in the record.
 *
 * ## The tie-break, stated because it has to be
 *
 * Several runs of the same maximum length are common — an Arabic text that repeats a phrase
 * verbatim does so three or four times. The DP scans the record's indices in ascending order and
 * only replaces the best on a strictly greater run length, so among equally long runs the one with
 * the **earliest end index** wins, and for a fixed length the earliest end index IS the earliest
 * start index. That makes the result a function of the two inputs alone, with no dependence on
 * iteration order, no tie to break by hand, and no chance of two runs of the same binary reporting
 * different spans.
 */
const longestCommonSubstringAt = (quote: string, record: string): { readonly length: number; readonly start: number } => {
  // The outer loop runs over the SHORT string, so the rolling row never exceeds the
  // record's length. `let` here is the sanctioned accumulator case of AGENTS.md section 6:
  // a DP row cannot be expressed as a fold over a single array.
  let previous = new Uint32Array(record.length + 1)
  let current = new Uint32Array(record.length + 1)
  let best = 0
  let bestStart = 0
  for (const quoteChar of quote) {
    current = new Uint32Array(record.length + 1)
    for (let i = 1; i <= record.length; i += 1) {
      if (quoteChar !== record.charAt(i - 1)) continue
      const run = (previous[i - 1] ?? 0) + 1
      current[i] = run
      if (run > best) {
        best = run
        bestStart = i - run
      }
    }
    previous = current
  }
  return { length: best, start: bestStart }
}

/** Longest common *substring*, by dynamic programming with a single rolling row. */
const longestCommonSubstring = (quote: string, record: string): number => longestCommonSubstringAt(quote, record).length

/**
 * Measure the longest shared run between a quoted span and a record.
 *
 * Both inputs are folded with the containment key first, so the diagnostic is measuring
 * the same string the verdict was measured on.
 */
export const longestRunFor = (rawQuote: string, foldedRecordText: string): LongestRun => {
  const quoteChars = foldQuote(rawQuote).slice(0, MAX_QUOTE_CHARS)
  if (quoteChars.length === 0) return EMPTY_RUN
  const recordChars = foldedRecordText.slice(0, MAX_RECORD_CHARS)
  if (recordChars.length === 0) return EMPTY_RUN
  const runChars = longestCommonSubstring(quoteChars, recordChars)
  const displayPercent = Math.round((runChars / quoteChars.length) * 1_000) / 10
  return { runChars, quoteChars: quoteChars.length, contained: recordChars.includes(quoteChars), displayPercent }
}

/**
 * Locate the longest shared run of a quoted span inside a record, in folded coordinates.
 *
 * **Display only**, exactly like `longestRunFor`: `verify.ts` cannot import this file (gate G-1),
 * and the correction surface that consumes it lives on the far side of G-7's display path. The
 * return value is a location, so a caller cannot turn it into a strength by arithmetic — there is
 * nothing to divide.
 *
 * The span is a run of the FOLDED record, so it is canonical text rather than a transcription. A
 * run found inside a fold that removed tashkeel does not correspond to a contiguous stretch of
 * anything a reader can see, which is why the renderer labels it canonical and cites the record.
 */
export const locatedSpanFor = (rawQuote: string, foldedRecordText: string): LocatedSpan => {
  const quoteChars = foldQuote(rawQuote).slice(0, MAX_QUOTE_CHARS)
  if (quoteChars.length === 0) return ABSENT_SPAN
  const recordChars = foldedRecordText.slice(0, MAX_RECORD_CHARS)
  if (recordChars.length === 0) return ABSENT_SPAN
  const { length, start } = longestCommonSubstringAt(quoteChars, recordChars)
  if (length === 0) return ABSENT_SPAN
  return { kind: "located", startChar: start, endChar: start + length, text: recordChars.slice(start, start + length) }
}

export * as Diagnostics from "./longest-run.ts"
