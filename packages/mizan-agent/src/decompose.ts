import { sha256Hex, type Result, err, ok } from "@mizan/core"
import { providerFailure, type GenerationRequest, type GenerationResult, type Provider, type ProviderFailure, type RetrievedContext } from "./provider.ts"
import { MAX_TOTAL_CONTEXT_CHARS, sanitizeContexts } from "./sanitize.ts"

/**
 * Decomposition: turn one question into retrieval queries, with a cache and a budget.
 *
 * ## Why decomposition is cached rather than recomputed
 *
 * It is the only model call that happens before retrieval, so it is the one that decides what
 * the retriever can possibly see. Caching it on the question hash means a repeated question
 * is answered from the same queries, which is a precondition for the verifier's determinism
 * claim: if the queries changed between two runs, the evidence changed, and "byte-identical
 * verdicts" would be a statement about two different questions.
 *
 * ## The budget is a cap on the NUMBER of queries, not just their length
 *
 * A decomposition that returns forty queries turns a bounded retrieval into an unbounded one,
 * and the total-context cap in `sanitize.ts` would then silently truncate evidence the
 * retriever found. So the count is capped first, and the drop is reported as
 * `tool_call_cap_reached` rather than being invisible.
 */

/** The architectural cap on decomposition. Three collections: quran, bukhari, muslim. */
export const MAX_DECOMPOSITION_QUERIES = 4

export type Decomposition = {
  readonly queries: readonly string[]
  readonly dropped: number
}

/** A cache with a hard entry cap, so a long-running process cannot grow without limit. */
export type DecompositionCache = {
  readonly size: () => number
  readonly get: (key: string) => readonly string[] | undefined
  readonly set: (key: string, queries: readonly string[]) => void
}

export const CACHE_CAPACITY = 256

/**
 * A small insertion-ordered LRU.
 *
 * Map preserves insertion order, so the oldest key is the first one from `keys()`. A full
 * implementation would need recency updates on read; this one evicts on insert only, which is
 * FIFO rather than LRU. Named honestly below rather than called LRU.
 */
export const fifoCache = (capacity: number = CACHE_CAPACITY): DecompositionCache => {
  const store = new Map<string, readonly string[]>()
  return {
    size: () => store.size,
    get: (key) => store.get(key),
    set: (key, queries) => {
      if (store.size >= capacity && !store.has(key)) {
        const oldest = store.keys().next()
        if (oldest.done !== true) store.delete(oldest.value)
      }
      store.set(key, queries)
    },
  }
}

export const cacheKey = (question: string): string => sha256Hex(question)

/**
 * Pull the queries out of a decomposition reply: one per non-blank line of the first claim's
 * text.
 *
 * The decomposition prompt re-uses the `Answer` contract rather than inventing a second
 * response shape. That is deliberate — one decode path, so a malformed model reply is caught
 * in exactly one place — and it is why the extraction is this small.
 */
export const readQueries = (text: string | null): readonly string[] | null => {
  if (text === null) return null
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return lines.length === 0 ? null : lines
}

/**
 * A decomposition-specific failure.
 *
 * A local constructor rather than the shared `providerFailure`, because the two functions
 * return different `Result` types — a `GenerationResult` is not a `Result<Decomposition, _>`.
 * Reusing the shared one would mean unwrapping and re-wrapping the same error at every call
 * site, which is how a failure reason gets lost in a refactor.
 */
const decompositionFailure = (provider: Provider, detail: string): Result<Decomposition, ProviderFailure> => {
  const failure: ProviderFailure = { _tag: "provider_failed", reason: "provider_malformed_output", detail: `${provider.name}: ${detail}` }
  return err<ProviderFailure>(failure)
}

const capQueries = (queries: readonly string[]): Decomposition => {
  const kept = queries.slice(0, MAX_DECOMPOSITION_QUERIES)
  return { queries: kept, dropped: queries.length - kept.length }
}

/**
 * Decompose `question` into retrieval queries, using the cache when it can.
 *
 * Returns the queries on success. A provider failure is passed through unchanged, because a
 * failure to decompose and a failure to answer are the same failure to the person using the
 * product: there is no model, so there is no answer.
 */
export const decompose = async (
  provider: Provider,
  cache: DecompositionCache,
  question: string,
  instructions: string,
): Promise<Result<Decomposition, ProviderFailure>> => {
  const key = cacheKey(question)
  const cached = cache.get(key)
  if (cached !== undefined) return ok(capQueries(cached))

  const request: GenerationRequest = { question, stage: "decompose", contexts: [], instructions }
  const generated: GenerationResult = await provider.generate(request)
  if (!generated.ok) return err(generated.error)

  // The model answered the decomposition prompt with the same `Answer` contract, so the
  // queries arrive as the first claim's text, one per line.
  const queries = readQueries(generated.value.answer.claims[0]?.text ?? null)
  if (queries === null) return decompositionFailure(provider, "the decomposition reply carried no usable query")

  const capped = capQueries(queries)
  cache.set(key, capped.queries)
  return ok(capped)
}

/** Build a retrieval request from queries, with the total context budget already applied. */
export const retrievalContexts = (request: GenerationRequest): readonly RetrievedContext[] =>
  sanitizeContexts(request.contexts).filter((context) => context.text.length > 0)

/** The total characters the spine may put in front of the model. */
export const contextBudget = (): number => MAX_TOTAL_CONTEXT_CHARS

export * as Decompose from "./decompose.ts"
