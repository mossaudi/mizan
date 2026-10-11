import { Schema } from "effect"

/**
 * Source hint for a candidate span - indicates where the quote likely originates.
 * This is a hint from the model, not a verified citation.
 */
export const SpanSourceHint = Schema.Union([
  Schema.Literal("quran"),
  Schema.Literal("hadith"),
  Schema.Literal("collection"),
  Schema.Literal("unknown"),
])
export type SpanSourceHint = Schema.Schema.Type<typeof SpanSourceHint>

/** Collection-specific source hint for hadith. */
export const CollectionSourceHint = Schema.Struct({
  kind: Schema.Literal("collection"),
  collection: Schema.String, // e.g., "bukhari", "muslim", "abudawud"
})
export type CollectionSourceHint = Schema.Schema.Type<typeof CollectionSourceHint>

/** The full source hint union for display. */
export const FullSourceHint = Schema.Union([
  Schema.Literal("quran"),
  Schema.Literal("hadith"),
  Schema.Literal("unknown"),
  CollectionSourceHint,
])
export type FullSourceHint = Schema.Schema.Type<typeof FullSourceHint>

export * as SpanSourceHintNs from "./span-source-hint.ts"