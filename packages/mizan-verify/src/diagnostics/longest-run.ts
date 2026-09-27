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
 */

/** Bounded so a pathological input cannot turn a display aid into a denial of service. */
const MAX_QUOTE_CHARS = 4_096
const MAX_RECORD_CHARS = 65_536

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

/** Longest common *substring*, by dynamic programming with a single rolling row. */
const longestCommonSubstring = (quote: string, record: string): number => {
  // The outer loop runs over the SHORT string, so the rolling row never exceeds the
  // record's length. `let` here is the sanctioned accumulator case of AGENTS.md section 6:
  // a DP row cannot be expressed as a fold over a single array.
  let previous = new Uint32Array(record.length + 1)
  let current = new Uint32Array(record.length + 1)
  let best = 0
  for (const quoteChar of quote) {
    current = new Uint32Array(record.length + 1)
    for (let i = 1; i <= record.length; i += 1) {
      if (quoteChar !== record.charAt(i - 1)) continue
      const run = (previous[i - 1] ?? 0) + 1
      current[i] = run
      if (run > best) best = run
    }
    previous = current
  }
  return best
}

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

export * as Diagnostics from "./longest-run.ts"
