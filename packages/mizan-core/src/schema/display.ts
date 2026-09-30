import { Schema } from "effect"

/**
 * The two discrete display states of Sprint 2, and the spans they point at.
 *
 * ## The constraint these shapes exist to satisfy
 *
 * Sprint 2's standing constraint: a correction and a relevance assessment each emit **a discrete
 * state plus a located span** — never a percentage, a confidence bucket, a severity, or a weighted
 * trust score. That constraint is not a style preference; it is the finding from the feasibility
 * spike in ADR-03, where a fuzzy 0.89 scored an invented hadith above a faithful paraphrase. A
 * number on these surfaces is the fabrication-acceptance hole wearing a nicer hat (AGENTS.md §10).
 *
 * So both shapes are tagged unions with a `state` discriminant, and **neither contains a number that
 * is not a position**. The only numbers in `CorrectionSpan` are `startChar` and `endChar`, which
 * are indices into the folded record: a location, not a measurement.
 *
 * ## `Relevance` has no counts either
 *
 * The obvious design is `{ matched, total }` and then a renderer that divides. That was rejected
 * because the quotient is a score, and a score is the thing being banned. `Relevance` carries the
 * located question terms and the missing ones, as lists, so a reader is told *which words* the
 * answer does and does not use without anything in the repository ever computing a rate.
 */

/**
 * A located run of the cited record, in FOLDED coordinates.
 *
 * `text` is the canonical form, not a transcription. A folded Arabic string is not what the source
 * published, and showing it beside a badge would be both an offence to the reader and a licence
 * problem; the renderer labels it as canonical for exactly that reason.
 */
export const CorrectionSpan = Schema.Struct({
  /** Index into the folded record where the located run begins. */
  startChar: Schema.Number,
  /** Index just past the end of the located run. */
  endChar: Schema.Number,
  /** The canonical text of the run. */
  text: Schema.String,
  /** `true` when `text` is the first `MAX_SPAN_CHARS` of a longer run, and says so on screen. */
  capped: Schema.Boolean,
})
export type CorrectionSpan = Schema.Schema.Type<typeof CorrectionSpan>

/**
 * A rejected claim has a located canonical span to point at.
 *
 * Never a match strength. Nothing in this union is reachable from `verify.ts`, so the badge above
 * the span was computed by containment and the span below it was computed by a different module,
 * and gate G-7 re-asserts that they are separate code paths.
 */
export const LocatedCorrection = Schema.Struct({
  state: Schema.Literal("located"),
  span: CorrectionSpan,
})
export type LocatedCorrection = Schema.Schema.Type<typeof LocatedCorrection>

/**
 * No span. The reason is part of the state, because "no span" and "we did not look" are different
 * facts and a reader who cannot tell them apart is back to trusting a badge they cannot check.
 *
 * `unverifiable` is the spelling Sprint 2 fixes for this case: an absent span must never be
 * rendered as an empty string beside a location marker, which reads as "the match is here, and it
 * is empty".
 */
export const UnverifiableCorrection = Schema.Struct({
  state: Schema.Literal("unverifiable"),
  reason: Schema.String,
})
export type UnverifiableCorrection = Schema.Schema.Type<typeof UnverifiableCorrection>

export const Correction = Schema.Union([LocatedCorrection, UnverifiableCorrection])
export type Correction = Schema.Schema.Type<typeof Correction>

/**
 * The three relevance states, and no fourth.
 *
 *  - `answers`         every content term of the question occurs in the answer's canonical form
 *  - `doesNotAnswer`   no content term of the question occurs in it
 *  - `undetermined`    the checker cannot decide, and says why
 *
 * `undetermined` is the load-bearing one. It is never collapsed into `answers` — a checker that
 * cannot decide is not a checker that found nothing wrong — and it is rendered distinctly, because
 * a reader who sees `undetermined` and a reader who sees `answers` must be able to tell which
 * question was asked.
 */
export const RelevanceState = Schema.Union([
  Schema.Literal("answers"),
  Schema.Literal("doesNotAnswer"),
  Schema.Literal("undetermined"),
])
export type RelevanceState = Schema.Schema.Type<typeof RelevanceState>

/**
 * A relevance assessment: the state, the terms it located, and the terms it could not.
 *
 * There is no `matched: 3, total: 7` here, and that omission is deliberate — see the module
 * header. The lists are in the question's own order so two runs over the same question produce
 * byte-identical output.
 */
export const Relevance = Schema.Struct({
  state: RelevanceState,
  /** Content terms of the question found in the answer's canonical form. */
  located: Schema.Array(Schema.String),
  /** Content terms of the question absent from the answer's canonical form. */
  missing: Schema.Array(Schema.String),
  /** A sentence saying why this state and not another. Never empty. */
  reason: Schema.String,
})
export type Relevance = Schema.Schema.Type<typeof Relevance>

export * as DisplaySchema from "./display.ts"
