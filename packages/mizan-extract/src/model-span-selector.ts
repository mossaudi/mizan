import { type Result, err, isOk, ok } from "@mizan/core"
import { MIN_VERIFIABLE_QUOTE_CHARS } from "@mizan/core"
import { SpanCandidate, SpanCandidates, ModelSpanSelectorInput, ModelSpanSelectorOutput, type SpanCandidate as SpanCandidateType, type ModelSpanSelectorInput as ModelSpanSelectorInputType, type ModelSpanSelectorOutput as ModelSpanSelectorOutputType } from "./schema/span-candidate.ts"
import { type SpanSourceHint as SpanSourceHintType } from "./schema/span-source-hint.ts"
import { extractProvider, type ExtractTransport, type ExtractProviderConfig, type ExtractGenerationResult, type ExtractProviderFailure, unconfiguredExtractProvider, MAX_INPUT_CHUNK_CHARS } from "./provider.ts"

/**
 * Model-assisted quote span selector.
 *
 * This module extracts candidate quote spans from article chunks using a language model.
 * It is G-1.1 compliant: it does NOT import @mizan/verify, and its output is
 * display-only suggestions that are passed to the verifier for deterministic verdicts.
 *
 * ## Security boundaries
 *
 * - Article text is fenced, length-capped (≤2000 chars), and marked data-only before
 *   entering the prompt (prompt injection mitigation).
 * - Model output is decoded via `decodeOrFail` with the declared schema before any
 *   code touches it (schema-first decoding).
 * - The selector CANNOT grant verified status - all candidates must pass through
 *   the verifier's strict containment check.
 * - No semantic/meaning matching - only verbatim quote extraction.
 *
 * ## Fallback behavior
 *
 * - Model unavailable / timeout → fallback to lexical selector (unavailable surface)
 * - Schema decode failure → fallback to lexical selector (prompt bug)
 * - Rate limit / 5xx → retry 2x with backoff, then fallback
 * - 4xx errors → fail fast (configuration bug)
 */
 
const MAX_CANDIDATES_DEFAULT = 10
const MAX_RETRIES = 2
const BASE_RETRY_DELAY_MS = 1000

/**
 * Deterministic retry delay calculation for reproducibility.
 * Uses fixed exponential backoff without jitter to maintain byte-identical runs.
 * The delay is determined solely by attempt number.
 */
function getRetryDelay(attempt: number): number {
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt)
}

/**
 * Validate and normalize a source hint from the model.
 */
function normalizeSourceHint(hint: string): SpanSourceHintType {
  const lower = hint.toLowerCase()
  if (lower === "quran") return "quran"
  if (lower === "hadith") return "hadith"
  if (lower === "collection") return "collection"
  return "unknown"
}

/**
 * Filter and validate candidates: remove too-short quotes, duplicates, invalid offsets.
 * Clamps confidence bounds to [0, 1] as a safety measure.
 */
function validateCandidates(
  candidates: readonly SpanCandidateType[],
  chunkText: string
): readonly SpanCandidateType[] {
  const seen = new Set<string>()
  const valid: SpanCandidateType[] = []

  for (const candidate of candidates) {
    // Minimum quote length for verifiability (uses shared constant from @mizan/core)
    const foldedQuote = candidate.quote.replace(/[\s\p{M}]/gu, "")
    if (foldedQuote.length < MIN_VERIFIABLE_QUOTE_CHARS) continue

    // Valid offsets within chunk
    if (candidate.startOffset < 0 || candidate.endOffset > chunkText.length) continue
    if (candidate.startOffset >= candidate.endOffset) continue

    // Deduplicate by quote text
    const key = candidate.quote.trim()
    if (seen.has(key)) continue
    seen.add(key)

    // Normalize source hint and clamp confidence bounds
    valid.push({
      ...candidate,
      sourceHint: normalizeSourceHint(candidate.sourceHint),
      confidence: Math.max(0, Math.min(1, candidate.confidence)),
    })
  }

  return valid
}

/**
 * Call the extract provider with retry logic for transient failures.
 * Uses deterministic exponential backoff (no jitter) for reproducibility.
 * Retries on: provider_timeout, provider_unavailable, rate_limited
 * Fails fast on: provider_not_configured, schema_decode_failed
 */
async function callExtractProviderWithRetry(
  provider: ReturnType<typeof extractProvider>,
  chunkText: string,
  chunkIndex: number,
  maxCandidates: number
): Promise<ExtractGenerationResult> {
  let lastResult: ExtractGenerationResult | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await provider.generate(chunkText, chunkIndex, maxCandidates)
    lastResult = result

    if (result.ok) {
      return result
    }

    // Don't retry on configuration errors or schema decode failures
    if (result.error.reason === "provider_not_configured" ||
        result.error.reason === "schema_decode_failed") {
      return result
    }

    // For the last attempt, don't wait
    if (attempt === MAX_RETRIES) {
      break
    }

    // Deterministic exponential backoff (no jitter) for byte-identical reproducibility
    const delay = getRetryDelay(attempt)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  return lastResult!
}

/**
 * Check if an error reason is retryable (transient failure).
 * Retryable: provider_timeout, provider_unavailable, rate_limited
 * Non-retryable: provider_not_configured, schema_decode_failed
 */
function isRetryableError(reason: ExtractProviderFailure["reason"]): boolean {
  return reason === "provider_timeout" || reason === "provider_unavailable" || reason === "rate_limited"
}

/**
 * Model-assisted span selector for a single article chunk.
 *
 * @param provider - The extract provider (from @mizan/extract provider.ts)
 * @param input - Chunk text and metadata
 * @returns Validated span candidates or degraded result
 */
export async function selectSpansForChunk(
  provider: ReturnType<typeof extractProvider>,
  input: ModelSpanSelectorInputType
): Promise<ModelSpanSelectorOutputType> {
  // Input validation: reject excessively large chunk text before it reaches the provider
  // Uses shared constant from provider to maintain consistency (10x the output cap)
  if (input.chunkText.length > MAX_INPUT_CHUNK_CHARS) {
    return {
      chunkIndex: input.chunkIndex,
      candidates: [],
      degraded: true,
      degradationReason: "chunk_too_large",
    }
  }

  const result = await callExtractProviderWithRetry(
    provider,
    input.chunkText,
    input.chunkIndex,
    input.maxCandidates ?? MAX_CANDIDATES_DEFAULT
  )

  if (!result.ok) {
    // Map extract provider errors to degraded output
    let degradationReason: string
    switch (result.error.reason) {
      case "provider_not_configured":
        degradationReason = "provider_not_configured"
        break
      case "provider_timeout":
        degradationReason = "model_timeout"
        break
      case "provider_unavailable":
        degradationReason = "model_unavailable"
        break
      case "rate_limited":
        degradationReason = "rate_limited"
        break
      case "provider_malformed_output":
        degradationReason = "model_malformed_output"
        break
      case "schema_decode_failed":
        degradationReason = "schema_decode_failed"
        break
      default:
        degradationReason = "unknown_error"
    }

    return {
      chunkIndex: input.chunkIndex,
      candidates: [],
      degraded: true,
      degradationReason,
    }
  }

  // Validate and filter candidates
  const validated = validateCandidates(result.value.candidates, input.chunkText)

  return {
    chunkIndex: result.value.chunkIndex,
    candidates: validated,
    degraded: false,
  }
}

/**
 * Process multiple chunks with the model-assisted selector.
 * Returns results for all chunks, with degraded chunks marked.
 */
export async function selectSpansForChunks(
  provider: ReturnType<typeof extractProvider>,
  chunks: readonly { text: string; index: number }[],
  maxCandidatesPerChunk?: number
): Promise<readonly ModelSpanSelectorOutputType[]> {
  const results: ModelSpanSelectorOutputType[] = []

  for (const chunk of chunks) {
    const input: ModelSpanSelectorInputType = {
      chunkText: chunk.text,
      chunkIndex: chunk.index,
      maxCandidates: maxCandidatesPerChunk,
    }

    const result = await selectSpansForChunk(provider, input)
    results.push(result)
  }

  return results
}

/**
 * Create an unconfigured extract provider for testing or when no model is available.
 */
export function createUnconfiguredExtractProvider(reason: string): ReturnType<typeof extractProvider> {
  return unconfiguredExtractProvider(reason)
}

export * as ModelSpanSelector from "./model-span-selector.ts"