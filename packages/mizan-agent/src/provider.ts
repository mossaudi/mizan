import { Answer, decodeOrFail, decodeSync, isOk, type DegradeReason, type Result, err, ok } from "@mizan/core"

/**
 * The provider port: the one place a model is allowed to exist.
 *
 * ## Why a port and not a client
 *
 * Everything downstream of generation is a pure function of a decoded `Answer`, so the only
 * thing that needs an interface is the call itself. A port makes the three honest outcomes
 * representable in the type system:
 *
 *  - a real answer,
 *  - `provider_unavailable` / `provider_timeout` / `provider_not_configured` — which the
 *    product renders as **model unavailable**, and
 *  - `provider_malformed_output` — which becomes `unverifiable`.
 *
 * There is deliberately no `PartialAnswer` and no `MaybeAnswer`. A type that can hold half an
 * answer is a type that will eventually be rendered as if it were whole, and "partial answer
 * shown as complete" is the exact thing AGENTS.md section 16 forbids.
 *
 * ## The prompt is a hint, not a control
 *
 * `GenerationRequest` carries an `instructions` string and a list of retrieved `contexts`, and
 * `sanitize.ts` decides what actually goes into the model. Section 12 of the constitution is
 * the reason this is stated here rather than assumed: a prompt that says "quote verbatim" is
 * an output-quality measure, and the enforcement of quote fidelity is `mizan-verify`'s
 * containment check, which runs afterwards and is not negotiable.
 */

export type TranscriptSource = "live" | "precomputed"

export type RetrievedContext = {
  /** Which tool produced it, for the trace. */
  readonly tool: string
  /** Already sanitized text. The agent never sees raw corpus text. */
  readonly text: string
  readonly citationLabel: string
}

export type GenerationRequest = {
  /** The user's question. The only place question text exists. */
  readonly question: string
  /**
   * Which of the two model calls this is.
   *
   * The spine calls the model twice per question — once to decompose it into retrieval
   * queries, once to answer it — and both calls carry the SAME question. A precomputed
   * transcript is therefore keyed on the pair, not on the question alone; without this the
   * decomposition entry would overwrite the answer entry and every replay would answer with a
   * list of search queries.
   */
  readonly stage: "decompose" | "answer"
  /** Retrieved, sanitized, length-capped context. Empty for the decomposition call. */
  readonly contexts: readonly RetrievedContext[]
  /** Advisory instructions. Never a security boundary. */
  readonly instructions: string
}

export type GenerationSuccess = {
  readonly answer: Answer
  readonly provider: string
  readonly model: string
}

export type ProviderFailure = {
  readonly _tag: "provider_failed"
  readonly reason: Extract<DegradeReason, `provider_${string}`>
  readonly detail: string
}

export type GenerationResult = Result<GenerationSuccess, ProviderFailure>

/** The port itself. Implemented by the live adapter and by the transcript adapter. */
export type Provider = {
  readonly name: string
  readonly model: string
  /** `"live"` or `"precomputed"`, and the answer's own `transcript` field must agree with it. */
  readonly kind: TranscriptSource
  generate: (request: GenerationRequest) => Promise<GenerationResult>
}

/**
 * Build a failure `Result`.
 *
 * Returns the `Result` rather than the bare error because every call site is `return
 * providerFailure(...)`, and returning a `ProviderFailure` from a function typed
 * `GenerationResult` would be a type error at each of the dozen places that need it. One
 * constructor, one shape, no way to forget the `err`.
 */
export const providerFailure = (reason: ProviderFailure["reason"], detail: string): GenerationResult => {
  const failure: ProviderFailure = { _tag: "provider_failed", reason, detail }
  // The explicit type argument is load-bearing: without it `err` infers its error type from
  // the contextual return type, which is `GenerationResult`, producing
  // `Result<never, GenerationResult>` and a cascade of confusing assignability errors.
  return err<ProviderFailure>(failure)
}

/**
 * A provider that tries each configured provider in order and returns the first success.
 *
 * ## Why this exists
 *
 * A single external provider is a single point of failure. When the primary provider is
 * unavailable (timeout, network error, or misconfiguration), the system fails over to the
 * next provider in the chain. The failover is transparent to the caller: the response
 * carries the name and model of the provider that actually answered.
 *
 * ## Honest degradation
 *
 * If all providers fail, the LAST failure is returned. This is the most informative
 * failure: it names the provider that was tried last and the reason it failed. The caller
 * renders this as `model unavailable` — never as a partial or canned response.
 *
 * ## The provider name
 *
 * The failover provider's `name` and `model` are set to the first provider's values.
 * This is a static label for the failover chain itself. The actual provider that answered
 * is identified by the `provider` and `model` fields in `GenerationSuccess`, which are
 * set by `decodeAnswer` using the winning provider's configuration.
 */
export const failoverProvider = (providers: readonly Provider[]): Provider => {
  if (providers.length === 0) {
    return {
      name: "failover",
      model: "none",
      kind: "live",
      generate: async () => providerFailure("provider_not_configured", "failover: no providers configured"),
    }
  }
  const primary = providers[0]!
  const rest = providers.slice(1)
  return {
    name: primary.name,
    model: primary.model,
    kind: primary.kind,
    generate: async (request: GenerationRequest): Promise<GenerationResult> => {
      const result = await primary.generate(request)
      if (result.ok) return result
      for (const provider of rest) {
        const fallback = await provider.generate(request)
        if (fallback.ok) return fallback
      }
      return result
    },
  }
}

/**
 * Decode whatever the model returned.
 *
 * A model is an untrusted input source (AGENTS.md section 1). It is told to return JSON; it
 * may return prose, or JSON with a `verdict` field it invented, or nothing. All of that becomes
 * `provider_malformed_output`, which the product renders as `unverifiable` — never as a
 * partially-trusted answer, and never as a crash.
 */
export const decodeAnswer = (raw: unknown, provider: string, model: string, transcript: TranscriptSource): GenerationResult => {
  const decoded = decodeOrFail(decodeSync(Answer), raw, "Answer")
  if (!isOk(decoded)) {
    return providerFailure("provider_malformed_output", `${provider}/${model}: ${decoded.error.detail}`)
  }
  // The transcript label is a schema-level value, not a convention: a replayed answer that
  // claims to be live is the exact confusion that loses a demo its credibility.
  if (decoded.value.transcript !== transcript) {
    return providerFailure(
      "provider_malformed_output",
      `${provider}/${model} is registered as "${transcript}" but its payload says "${decoded.value.transcript}"; refusing to present one as the other`,
    )
  }
  return ok({ answer: decoded.value, provider, model })
}

export * as Provider from "./provider.ts"
