import { Schema } from "effect"
import { SpanSourceHint } from "./span-source-hint.ts"

/**
 * Schema for a candidate quote span extracted by the model-assisted selector.
 *
 * This is DISPLAY-ONLY data. The verifier (@mizan/verify) never sees this schema,
 * and G-1.1 enforces that this package cannot import @mizan/verify.
 *
 * The model output is decoded through this schema via decodeOrFail at the trust boundary.
 * Invalid payloads are rejected and the selector falls back to the lexical selector.
 */
export const SpanCandidate = Schema.Struct({
  /** The extracted quote text, verbatim from the article. */
  quote: Schema.String,
  /** Character offset of the quote start in the article chunk. */
  startOffset: Schema.Number,
  /** Character offset of the quote end in the article chunk. */
  endOffset: Schema.Number,
  /** Source hint from the model: which collection/type this quote likely comes from. */
  sourceHint: SpanSourceHint,
  /** Model confidence score (0-1). Display-only, never influences verdict. */
  confidence: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /** Unique identifier for this candidate within the chunk. */
  candidateId: Schema.String,
})
export type SpanCandidate = Schema.Schema.Type<typeof SpanCandidate>

/** Array of span candidates returned by the model-assisted selector. */
export const SpanCandidates = Schema.Array(SpanCandidate)
export type SpanCandidates = Schema.Schema.Type<typeof SpanCandidates>

/** The model output schema for a single chunk. */
export const ModelSpanSelectorOutput = Schema.Struct({
  /** The chunk index this output corresponds to. */
  chunkIndex: Schema.Number,
  /** Array of candidate spans found in this chunk. */
  candidates: SpanCandidates,
  /** Whether the model timed out or failed for this chunk. */
  degraded: Schema.optional(Schema.Boolean),
  /** Degradation reason if applicable. */
  degradationReason: Schema.optional(Schema.String),
})
export type ModelSpanSelectorOutput = Schema.Schema.Type<typeof ModelSpanSelectorOutput>

/** Input to the model-assisted selector for one chunk. */
export const ModelSpanSelectorInput = Schema.Struct({
  /** The article chunk text (fenced, length-capped, marked data-only). */
  chunkText: Schema.String,
  /** The chunk index in the document. */
  chunkIndex: Schema.Number,
  /** Maximum number of candidates to return. */
  maxCandidates: Schema.optional(Schema.Number),
})
export type ModelSpanSelectorInput = Schema.Schema.Type<typeof ModelSpanSelectorInput>

export * as SpanSchema from "./span-candidate.ts"