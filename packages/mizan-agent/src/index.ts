/**
 * `@mizan/agent` — the bounded spine, and the only place a model may exist.
 *
 * The package is arranged as ports and adapters, and the direction of every arrow matters:
 *
 *  - `provider.ts` is the port. It defines what a model must be able to do, which is: return a
 *    decoded `Answer`, or return one of four honest failure reasons. There is no partial
 *    answer, because a type that can hold half an answer will eventually be rendered as a
 *    whole one.
 *  - `live.ts` is the hosted adapter, and it makes no network call: the transport is injected
 *    by the composition root, so the host allowlist stays a single decision in one file.
 *  - `transcript.ts` is the precomputed adapter, labelled `"precomputed"` in its type, its
 *    payload, and every run trace it produces.
 *  - `sanitize.ts` is the trust boundary for everything entering a prompt.
 *  - `decompose.ts` caches decomposition by question hash and caps the number of queries.
 *  - `spine.ts` orchestrates and, critically, contains no branch that could invent an answer.
 *
 * ## What this package must never do
 *
 * Compute, imply, default, or hint at a verdict. `mizan-verify` owns that, and this package is
 * not a dependency of the verifier. Keeping the arrow pointing one way is what stops a future
 * refactor from letting the agent have an opinion about whether a quote is real — which is
 * the fastest route to the fabrication-acceptance hole the whole project exists to close.
 */

export {
  decodeAnswer,
  providerFailure,
  type GenerationRequest,
  type GenerationResult,
  type GenerationSuccess,
  type Provider,
  type ProviderFailure,
  type RetrievedContext,
  type TranscriptSource,
} from "./provider.ts"

export {
  MAX_CONTEXT_CHARS,
  MAX_TOTAL_CONTEXT_CHARS,
  TRUNCATION_MARKER,
  clip,
  fence,
  sanitizeContext,
  sanitizeContexts,
  stripInvisible,
} from "./sanitize.ts"

export {
  PROVIDER_TIMEOUT_MS,
  buildRequestBody,
  hostedProvider,
  readResponseJson,
  type HostedConfig,
  type Transport,
  type TransportRequest,
} from "./live.ts"

export { entryKey, questionKey, transcriptOf, transcriptProvider, type TranscriptEntry, type TranscriptFile } from "./transcript.ts"

export {
  CACHE_CAPACITY,
  MAX_DECOMPOSITION_QUERIES,
  cacheKey,
  decompose,
  fifoCache,
  type Decomposition,
  type DecompositionCache,
} from "./decompose.ts"

export {
  DEGRADE_MESSAGES,
  buildPrompt,
  runSpine,
  type Retriever,
  type SpineDeps,
  type SpineFailure,
  type SpineInput,
  type SpineSuccess,
} from "./spine.ts"
