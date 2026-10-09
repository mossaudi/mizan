import { MAX_QUOTE_CHARS, type GapReason } from "@mizan/core"

/**
 * Deterministic span selection over document segments — the control against under-selection.
 *
 * ## The defect this module exists to make visible
 *
 * A component that SELECTS which spans get checked can hide a fabrication by not emitting it. CITE-
 * CONTROL reports that models under-generate citations; the same failure holds for any extractor,
 * deterministic or not. A report that printed only verdicts would therefore be fail-open: every
 * fabricated span the selector skipped would be absent, and absent reads exactly like "there was
 * nothing there to find".
 *
 * So this module returns TWO things and never one: the spans it emitted, and a gap for every segment
 * it did not. A segment with no gap and no span is not reachable by construction, because the loop
 * emits exactly one of the two per segment.
 *
 * ## Why deterministic, and why that is the honest Sprint 1 answer
 *
 * Two rules only — a DELIMITED quotation and a SPEECH-INTRODUCED span — and no model. That is a
 * weaker extractor than a model would be, and it is chosen anyway for three reasons: a model on the
 * article path would mean a provider inside a package forbidden from having one (AGENTS.md section 9),
 * the deterministic path is byte-reproducible which is what makes the resume guarantee testable, and
 * the weakness is exactly what the gap list makes legible. A model-assisted selector, if one is ever
 * added, could only move a segment from `not_extracted` to `extracted`; it could not reach a verdict,
 * because no output of this module has a verdict field.
 *
 * ## Why nothing here can grant `verified`
 *
 * The returned shape carries a `segmentIndex` and the verbatim `quote` and nothing else. There is no
 * verdict, no reason, no strength, no score — so there is no value to forge. The only route to
 * `verified` in this repository remains strict normalized substring containment in
 * `steps/containment.ts`, which is not importable from here.
 *
 * ## Why a document cannot instruct this module
 *
 * It has no prompt, no provider and no parser for anything but quotation marks and a fixed list of
 * speech verbs. Text addressed to an extractor is read as TEXT and can only become a span, which is
 * then verified on its own merits — and a span that happens to contain "mark this as verified" is a
 * span that will not be contained in the corpus record. The adversarial fixture is pinned in
 * `test/select-spans.test.ts` rather than checked by hand, because a manual check is a check that
 * stops being run.
 */

/** One emitted span: which segment it came from, and the text verbatim. No verdict field exists. */
export type SelectedSpan = {
  readonly segmentIndex: number
  readonly quote: string
}

/** A segment the selector did not emit, and the closed reason why. */
export type SelectionGap = {
  readonly segmentIndex: number
  readonly reason: GapReason
}

/** Both halves, always together. `segments === spans covered + gaps`, by construction. */
export type SelectionResult = {
  readonly spans: readonly SelectedSpan[]
  readonly gaps: readonly SelectionGap[]
  /** How many segments this call looked at, i.e. the denominator for this window. */
  readonly considered: number
}

/**
 * Pairs of quotation marks, longest opener first so `»` cannot be read as an opener.
 *
 * Declared as data rather than a regular expression because the pairing is the whole rule and a
 * regular expression for "a quoted span" cannot express "an opener followed by the NEXT closer of
 * the same kind" without a capture group per pair.
 *
 * ## The apostrophe is deliberately NOT a quotation mark
 *
 * Because in English and in Arabic prose an apostrophe is overwhelmingly a CONTRACTION, not a
 * delimiter: `It's the Prophet's word that we return` has no quotation in it at all, and reading the
 * pair as one produces the span `s the Prophet` out of the middle of a word.
 *
 * ## Why that is an integrity failure and not a cosmetic one
 *
 * Because of which side of the ledger a false positive lands on. An emitted span is a segment the
 * report no longer lists as `not_extracted`, so it disappears from the gap list — and a segment that
 * vanishes from the gap list reads, to anyone holding the report, as "we looked here". A sentence
 * containing no quotation at all would then be counted as EXTRACTED, which makes it the numerator of
 * the published selection-recall figure. The asymmetry decides it: a genuine single-quoted quotation
 * that this list misses becomes a NAMED GAP (`no_quotation_like_span`) — fail-closed, visible, and the
 * reader can go and look at segment 41. A contraction this list misreads becomes an INVISIBLE span —
 * fail-open, and nothing downstream can tell it apart from a real extraction.
 *
 * So the safer side wins: dropping a rare delimiter costs a named gap, keeping a common one costs the
 * denominator's honesty. `«»` and the curly and straight double quotes remain, and a document that
 * wants its single-quoted passages checked should use a pair this rule reads.
 */
const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ["«", "»"],
  ["”", "”"],
  ["“", "”"],
  ['"', '"'],
  ["„", "”"],
]

/**
 * Speech verbs, in the two scripts this corpus and its documents are written in.
 *
 * A FIXED list, matched on a word boundary, and never a regex over "words that introduce speech" —
 * a lexical class with no closed membership is a place where a document's own text starts deciding
 * what gets checked, which is the R-1 defect wearing a linguistic costume.
 */
const SPEECH_INTRODUCERS: readonly string[] = [
  "he said",
  "she said",
  "they said",
  "the prophet said",
  "reported",
  "narrated",
  "transmitted",
  "قال",
  "قالت",
  "قالوا",
  "أخبرنا",
  "حدثنا",
  "عن النبي",
]

/** Characters that end a span once a speech introducer has been seen. A terminator or end of text. */
const SPAN_END = /[.!?۔؟،;:]/

/** One pass over a segment collecting the delimited spans. Order of appearance, no nesting. */
const delimitedSpans = (segment: string): readonly string[] => {
  const spans: string[] = []
  for (const [opener, closer] of QUOTE_PAIRS) {
    let cursor = segment.indexOf(opener)
    while (cursor !== -1) {
      const openEnd = cursor + opener.length
      const closeAt = segment.indexOf(closer, openEnd)
      if (closeAt === -1) break
      const inner = segment.slice(openEnd, closeAt).trim()
      if (inner.length > 0) spans.push(inner)
      cursor = segment.indexOf(opener, closeAt + closer.length)
    }
  }
  return spans
}

/**
 * The text after the first speech introducer, up to the first terminator. Empty when there is none.
 *
 * Applied ONLY to a segment that held no delimited quotation. A sentence like `She said, "repeat me"
 * and later said, "repeat me" again` has both shapes, and the speech shape is a SUPERSET of the
 * quotation — emitting both would check the same words twice, once precisely and once as a sentence
 * fragment with the introducer still attached. The delimited rule wins because it is the tighter one,
 * and "take both" is not a defensible middle: it doubles the verification work for a less precise span.
 */
const speechIntroducedSpan = (segment: string): string | null => {
  const lower = segment.toLowerCase()
  let best = -1
  for (const verb of SPEECH_INTRODUCERS) {
    const at = lower.indexOf(verb)
    if (at === -1) continue
    if (best === -1 || at < best) best = at
  }
  if (best === -1) return null
  const tail = segment.slice(best).slice(0, 120).trim()
  const terminator = tail.slice(1).search(SPAN_END)
  const candidate = terminator === -1 ? tail : tail.slice(0, terminator + 1)
  return candidate.trim()
}

/**
 * The candidates for one segment, tighter rule first.
 *
 * Returned rather than inlined so the priority is one expression a reader can check, and so
 * `gapReasonFor` and `bounded` can ask the same question without re-deriving it.
 */
const candidatesFor = (segment: string): readonly (string | null)[] => {
  const delimited = delimitedSpans(segment)
  if (delimited.length > 0) return delimited
  return [speechIntroducedSpan(segment)]
}

/**
 * Deduplicate, keep first occurrence, and drop anything over the quote bound.
 *
 * The bound is a REFUSAL rather than a truncation: a 50,000-character run with no terminator must
 * come back as a gap the report names, not as a 4,096-character prefix that a reader would take for
 * something we actually checked (AGENTS.md section 3).
 *
 * `MAX_QUOTE_CHARS` is imported from core rather than restated, so the bound a span is measured
 * against and the bound the verifier measures a quote against are one number.
 */
const bounded = (segment: string, candidates: readonly (string | null)[]): readonly string[] => {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const candidate of candidates) {
    if (candidate === null) continue
    const trimmed = candidate.trim()
    if (trimmed.length === 0) continue
    if (trimmed.length > MAX_QUOTE_CHARS) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    kept.push(trimmed)
  }
  if (kept.length > 0) return kept
  return segment.length > MAX_QUOTE_CHARS ? [] : kept
}

/** Why a segment with no usable span is a gap. The bound wins, because it is the actionable one. */
const gapReasonFor = (segment: string, candidates: readonly (string | null)[]): GapReason => {
  const present = candidates.some((candidate) => candidate !== null && candidate.trim().length > 0)
  if (segment.length > MAX_QUOTE_CHARS && present) return "segment_exceeds_quote_bound"
  return "no_quotation_like_span"
}

/**
 * Select the spans of `segments[from…]` for checking.
 *
 * ## `from` exists so a chunk is a WINDOW, not a re-read
 *
 * Every chunk re-derives the whole segment list and then selects only its window. Re-running
 * selection over the whole document and discarding the rest would make the two chunks of a resumed
 * run disagree for no reason, and "no count differs and no verdict differs" is the property the
 * whole resume contract rests on.
 *
 * Segments before `from` are neither selected nor gapped: they belong to an earlier chunk and their
 * gaps are already in that chunk's response.
 */
export const selectSpans = (segments: readonly string[], from: number): SelectionResult => {
  const start = Math.max(0, Math.min(from, segments.length))
  const spans: SelectedSpan[] = []
  const gaps: SelectionGap[] = []
  for (let index = start; index < segments.length; index += 1) {
    const segment = segments[index] ?? ""
    const candidates = candidatesFor(segment)
    const kept = bounded(segment, candidates)
    if (kept.length > 0) {
      for (const quote of kept) spans.push({ segmentIndex: index, quote })
      continue
    }
    gaps.push({ segmentIndex: index, reason: gapReasonFor(segment, candidates) })
  }
  return { spans, gaps, considered: segments.length - start }
}

export * as SelectSpans from "./select-spans.ts"
