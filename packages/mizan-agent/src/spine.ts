import { type DegradeReason } from "@mizan/core"
import { providerFailure, type GenerationRequest, type GenerationResult, type Provider, type RetrievedContext } from "./provider.ts"
import { fence } from "./sanitize.ts"
import { decompose, fifoCache, type DecompositionCache, type Decomposition } from "./decompose.ts"

/**
 * The bounded spine: question in, an honest outcome out.
 *
 * ## The one thing this module guarantees
 *
 * **It never returns an answer it did not receive.** There is no branch anywhere below that
 * constructs an `Answer`, a `Claim`, or a `quote` on failure. Every failure path returns a
 * `SpineFailure` with a `DegradeReason`, and the CLI turns exactly one of those reasons into
 * the string `model unavailable`. That is the whole contract, and it is verifiable by reading
 * this file: if you cannot point at the line where a degraded run produced prose, the design
 * holds.
 *
 * ## Why the order is decompose → retrieve → generate
 *
 * Retrieval needs the queries, and the queries come from the model. Running it the other way
 * would mean retrieving on the raw question, which for "what did the Prophet say about X"
 * retrieves the word "Prophet" and ranks nothing useful. The cost is that the most fragile
 * dependency sits first, which is why decomposition is cached and why its failure degrades
 * rather than aborts.
 *
 * ## No verdict is computed here
 *
 * This module hands an answer to the caller. `mizan-verify` decides what is true about it, and
 * this package is not even a dependency of the verifier. Keeping the boundary here is what
 * stops a future refactor from letting the agent have an opinion about a verdict — which
 * would be the fastest possible route to the CWE-345 hole this project exists to close.
 */

export type SpineInput = {
  readonly question: string
  /** Advisory. Never a control: the verifier is the authority (AGENTS.md section 12). */
  readonly instructions: string
}

export type SpineSuccess = {
  readonly answer: import("@mizan/core").Answer
  readonly contexts: readonly RetrievedContext[]
  readonly decomposition: Decomposition
  readonly provider: string
  readonly model: string
  readonly transcript: "live" | "precomputed"
}

export type SpineFailure = {
  readonly ok: false
  readonly reason: DegradeReason
  /** What the person sees. One string per reason, never a stack trace. */
  readonly message: string
  readonly detail: string
}

/** The only user-visible degradation strings. Kept here so there is one mapping (section 17). */
export const DEGRADE_MESSAGES: Readonly<Record<"model_unavailable", string>> = {
  model_unavailable: "model unavailable",
}

/** Retrieval, injected. Kept as a port so the agent package owns no database and no I/O. */
export type Retriever = (queries: readonly string[]) => readonly RetrievedContext[]

export type SpineDeps = {
  readonly provider: Provider
  readonly retrieve: Retriever
  readonly cache?: DecompositionCache
}

const unavailable = (detail: string, reason: DegradeReason = "provider_unavailable"): SpineFailure => ({
  ok: false,
  reason,
  message: DEGRADE_MESSAGES.model_unavailable,
  detail,
})

/**
 * Run the spine.
 *
 * Three model-facing steps, and each one can fail into the same honest state. Note what is
 * absent: there is no `try`, no `catch` that produces an answer, and no default. If the
 * provider is unreachable the run is `model unavailable`, full stop.
 */
export const runSpine = async (input: SpineInput, deps: SpineDeps): Promise<SpineSuccess | SpineFailure> => {
  const cache = deps.cache ?? fifoCache()

  const decomposed = await decompose(deps.provider, cache, input.question, input.instructions)
  if (!decomposed.ok) {
    return unavailable(`decomposition failed: ${decomposed.error.detail}`, decomposed.error.reason)
  }

  const contexts = sanitizeAndRetrieve(decomposed.value.queries, deps.retrieve)
  if (contexts.length === 0) {
    // A corpus miss is its own honest state, distinct from a model failure: the model was
    // fine and the corpus had nothing. The CLI renders `no sources found` for this.
    return {
      ok: false,
      reason: "no_sources_found",
      message: "no sources found",
      detail: `retrieval returned nothing for ${decomposed.value.queries.length} queries`,
    }
  }

  const request: GenerationRequest = { question: input.question, stage: "answer", contexts, instructions: input.instructions }
  const generated: GenerationResult = await deps.provider.generate(request)
  if (!generated.ok) {
    return unavailable(`generation failed: ${generated.error.detail}`, generated.error.reason)
  }

  return {
    answer: generated.value.answer,
    contexts,
    decomposition: decomposed.value,
    provider: generated.value.provider,
    model: generated.value.model,
    // Taken from the provider's registration, and already cross-checked against the payload's
    // own label in decodeAnswer. Three independent sources must agree before we call it live.
    transcript: deps.provider.kind,
  }
}

const sanitizeAndRetrieve = (queries: readonly string[], retrieve: Retriever): readonly RetrievedContext[] =>
  retrieve(queries).filter((context) => context.text.trim().length > 0)

/** The prompt body, exposed so a test can assert the fence is actually applied. */
export const buildPrompt = (input: SpineInput, contexts: readonly RetrievedContext[]): string =>
  `${input.instructions}\n\n${fence(contexts)}\n\n${input.question}`

export * as Spine from "./spine.ts"
