import { Schema } from "effect"

/**
 * Per-claim Sentence-Support Rate (SSR) — TREC 2025 RAG Track alignment.
 *
 * ## What SSR measures
 *
 * SSR is the ratio of supported sentences to total sentences in a generated response.
 * A sentence is "supported" only if it contains at least one citation that received a
 * `verified` verdict. Sentences with only `unverifiable` or `no sources found` citations
 * are NOT supported.
 *
 * ## Why this is a read-only metric
 *
 * SSR computation does not modify verdicts. It is a pure function of the verdicts and
 * the response text. The verdicts are computed by `verifyAnswer` and SSR is computed
 * afterwards — there is no feedback loop.
 *
 * ## Determinism
 *
 * Sentence segmentation is deterministic: the same input always produces the same
 * sentence count. No clock, no randomness, no locale.
 */

/** The result of an SSR computation. */
export const SsrResult = Schema.Struct({
  /** Total sentences segmented from the response. */
  totalSentences: Schema.Number,
  /** Sentences containing at least one `verified` citation. */
  supportedSentences: Schema.Number,
  /** `supportedSentences / totalSentences`. 0 when there are no sentences. */
  rate: Schema.Number,
  /** Per-sentence support details. */
  perSentence: Schema.Array(
    Schema.Struct({
      /** 1-based sentence index. */
      index: Schema.Number,
      /** Whether this sentence contains at least one verified citation. */
      supported: Schema.Boolean,
      /** Claim IDs whose citations appear in this sentence. */
      claimIds: Schema.Array(Schema.String),
    }),
  ),
})
export type SsrResult = Schema.Schema.Type<typeof SsrResult>

/** SSR schema version, bumped on breaking changes. */
export const SSR_SCHEMA_VERSION = "1"

export * as Ssr from "./ssr.ts"
