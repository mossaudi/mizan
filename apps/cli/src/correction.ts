import type { Correction } from "@mizan/core"
import { locatedSpanFor } from "@mizan/verify"

/**
 * ST3 — the correction surface. A `REJECTED` badge is a dead end until it says what the record
 * actually says.
 *
 * ## What this module is
 *
 * A judge who sees `REJECTED` cannot tell the two most common causes apart: the model invented
 * the sentence, or the model dropped a clause. The longest run of shared characters has been
 * computed since Sprint 1 and deliberately hidden. This module turns it into a **location**: a
 * canonical span of the cited record, with a marker under it, so the reader can see the difference
 * between "invented" and "re-worded" without running anything.
 *
 * ## What this module may never become
 *
 *  - **A number.** The standing Sprint 2 constraint is a discrete state plus a located span, and
 *    this one is structural rather than aspirational: the `Correction` type in `@mizan/core` has
 *    exactly two shapes, and the only numbers in either of them are `startChar` and `endChar`.
 *    There is no percentage, no confidence and no severity to render, because there is none to
 *    render. A reviewer can prove this by reading the union in `schema/display.ts`.
 *  - **A way to change a badge.** This is display code on a display path. Gate G-7 re-asserts, at
 *    every run, that the verdict path and the display path are separate closures — so the span
 *    below the badge provably had no hand in the badge above it. A span is a location, never a
 *    verdict upgrade: a located span never turns a `rejected` into anything else.
 *  - **A guess.** Every failure state is `unverifiable` with a stated reason, never a partial or
 *    shortened span. AGENTS.md §16: degrade to an honest state, not to a plausible one.
 *
 * ## Why `MAX_SPAN_CHARS` is 60
 *
 * The reference figure Sprint 2 cites is BurhanAI's 66.56% correction rate, measured over a
 * comparable span length. A span long enough to print wraps in an 80-column terminal and stops
 * being locatable; a span of 60 folded characters sits on one line under a marker, which is the
 * property that makes it a *location* rather than a quotation. When a run is longer, the span is
 * truncated to the cap and `capped` is `true`, so the screen says "this is the start of a longer
 * match" rather than quietly showing a shorter one.
 *
 * ## Why `MIN_SPAN_CHARS` exists, and why it is not a threshold anyone can tune
 *
 * Any two Arabic strings share a letter, and a document of a few thousand folded characters
 * contains every letter many times. So an invented quote and an unrelated record will nearly
 * always have a longest common run of one or two characters — and a correction that says "the
 * cited record contains this run, at folded character 412: `ي`" is not a correction. It is
 * coincidence wearing the correction surface's own voice, which is the one failure mode this
 * repository cannot afford on the surface whose whole purpose is telling a reader what the
 * record really says.
 *
 * So there is a floor, and the floor fails closed to `unverifiable` with the length stated, rather
 * than printing a location nobody can act on. The value is the length of a short Arabic phrase:
 * below it a run is a letter, a bigram or a single short word, and in a corpus this size those
 * occur by chance often enough to be worthless. It is deliberately a fixed constant rather than a
 * ratio of the quote — a ratio would be a strength, and a strength is what this surface may not
 * have (AGENTS.md §10).
 */

/** The most folded characters of a located run that reach the screen. */
export const MAX_SPAN_CHARS = 60

/**
 * The fewest folded characters a run may have and still be called a location.
 *
 * See the module header. Exported because the test asserts the boundary, and a boundary nobody can
 * name is a boundary nobody can check.
 */
export const MIN_SPAN_CHARS = 8

/** The reason a correction could not be produced. Never empty, never a guess. */
export type CorrectionReason =
  | "not-a-rejection"
  | "no-quote-to-locate"
  | "no-record-to-locate-against"
  | "no-shared-run"
  | "shared-run-too-short"

const reasonText: Readonly<Record<CorrectionReason, string>> = {
  "not-a-rejection": "correction is offered for a rejected claim only; this claim was not rejected",
  "no-quote-to-locate": "there was no quotation to locate, so there is no span to point at",
  "no-record-to-locate-against": "the citation resolved to no record, so there is nothing to point into",
  "no-shared-run": "this quote and the cited record share no run of characters, so there is no span to point at",
  "shared-run-too-short": "the longest run this quote and the cited record share is too short to be a location",
}

const unverifiable = (reason: CorrectionReason): Correction => ({ state: "unverifiable", reason: reasonText[reason] })

/** What this module needs to place a span. Only the folded key, never the display text. */
export type CorrectionInput = {
  readonly verdict: "verified" | "rejected" | "unverifiable"
  readonly quote: string
  /** The cited record's folded matching key, or `null` when the citation resolved to nothing. */
  readonly recordTextMatch: string | null
}

/**
 * Locate the span a rejected claim should be corrected against.
 *
 * Total: every input produces a `Correction`, and the only inputs that produce a span are the ones
 * that genuinely have one. A caller never has to handle a throw, and never receives a half-built
 * span.
 */
export const correctionFor = (input: CorrectionInput): Correction => {
  if (input.verdict !== "rejected") return unverifiable("not-a-rejection")
  if (input.quote.trim().length === 0) return unverifiable("no-quote-to-locate")
  if (input.recordTextMatch === null) return unverifiable("no-record-to-locate-against")

  const located = locatedSpanFor(input.quote, input.recordTextMatch)
  if (located.kind === "absent") return unverifiable("no-shared-run")
  if (located.endChar - located.startChar < MIN_SPAN_CHARS) return unverifiable("shared-run-too-short")

  const capped = located.endChar - located.startChar > MAX_SPAN_CHARS
  const startChar = located.startChar
  const endChar = capped ? startChar + MAX_SPAN_CHARS : located.endChar
  return { state: "located", span: { startChar, endChar, text: located.text.slice(0, MAX_SPAN_CHARS), capped } }
}

/**
 * One continuous run of spaces the width the terminal gives it, for aligning a marker.
 *
 * Bounded, because a marker is a location hint and not a ruler: a run 3,000 folded characters into
 * a record would otherwise emit three thousand spaces and push the line off screen. When the
 * position is beyond the bound the line says so, so a shortened marker is never a *wrong* one.
 */
const MAX_MARKER_COLUMN = 72

const markerLine = (startChar: number): string => {
  const shown = Math.min(startChar, MAX_MARKER_COLUMN)
  const beyond = startChar > MAX_MARKER_COLUMN ? `  (the run starts further in than ${MAX_MARKER_COLUMN} folded characters; the position above is exact)` : ""
  return `${" ".repeat(shown)}^${beyond}`
}

/**
 * The correction as report lines, text nodes only (AGENTS.md §11).
 *
 * The marker is what makes this a *location*: a reader sees where in the record the run sits,
 * rather than being handed a string with no position. The exact index is always stated in the first
 * line, so the marker is a visual aid and never the only record of where the span is.
 */
export const renderCorrection = (correction: Correction): readonly string[] => {
  if (correction.state === "unverifiable") return [`correction: unavailable — ${correction.reason}`]

  const { span } = correction
  const cap = span.capped ? ` (first ${MAX_SPAN_CHARS} folded characters of a longer run)` : ""
  return [
    `correction: the cited record contains this run, at folded character ${span.startChar}:`,
    `    ${span.text}${cap}`,
    `    ${markerLine(span.startChar)}  (canonical form: folded for matching, so this is not a transcription)`,
  ]
}

export * as CorrectionSurface from "./correction.ts"
