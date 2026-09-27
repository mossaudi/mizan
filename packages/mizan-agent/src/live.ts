import type { Answer, Result } from "@mizan/core"
import { decodeAnswer, providerFailure, type GenerationRequest, type GenerationResult, type Provider } from "./provider.ts"
import { fence } from "./sanitize.ts"

/**
 * The live hosted provider.
 *
 * ## No network in this package
 *
 * This file makes no HTTP call. It takes a `Transport` — a function from a URL and a body to a
 * `Result` — and the composition root (`apps/cli`) supplies the real one. Two reasons:
 *
 *  - **The allowlist stays a single decision.** `mizan-corpus/src/http.ts` is the only module
 *    allowed to open a socket, and it allowlists three corpus hosts. A model API is a
 *    different trust domain with a different threat model, and folding it into that list would
 *    blur exactly the boundary that file exists to draw. Whoever builds the transport decides
 *    the host, and there is one such place.
 *  - **The degradation surface is testable without a network.** Every honest failure below is
 *    reachable by handing `generate` a transport that returns that failure, so the tests
 *    assert the real code path rather than a mock of it.
 *
 * ## Every failure is `model unavailable`
 *
 * No key, a refused connection, a 429, a 5xx, a 30-second timeout, a body that is not JSON, a
 * body that is JSON but not an `Answer` — all of them return a `Result` error, and the CLI
 * renders the one string `model unavailable`. What this adapter must never do is return a
 * partial answer, a cached answer, or a plausible-looking default. There is no fallback path
 * in this file, and that is the point.
 */

/** The injected transport. Deliberately narrower than `fetch`. */
export type TransportRequest = {
  readonly url: string
  readonly body: string
  readonly signal: AbortSignal
}

export type Transport = (request: TransportRequest) => Promise<Result<{ readonly body: string }, string>>

/** The budget from the architecture: a provider that has not answered in 30 s is unavailable. */
export const PROVIDER_TIMEOUT_MS = 30_000

export type HostedConfig = {
  readonly url: string
  readonly apiKey: string
  readonly model: string
  readonly name?: string
  readonly timeoutMs?: number
}

/** Pull the JSON body out of a chat-completions-shaped response. */
export const readResponseJson = (body: string): Result<unknown, string> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch (cause) {
    return { ok: false, error: `response was not JSON: ${cause instanceof Error ? cause.message : "parse error"}` }
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, error: "response was JSON but not an object" }
  const choices = (parsed as { readonly choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return { ok: false, error: "response had no choices" }
  const content = (choices[0] as { readonly message?: { readonly content?: unknown } }).message?.content
  if (typeof content !== "string") return { ok: false, error: "response choice had no textual content" }
  try {
    return { ok: true, value: JSON.parse(content) as unknown }
  } catch {
    // A model that wrapped its JSON in prose is malformed output, not a transport failure.
    return { ok: true, value: content }
  }
}

/**
 * The request body. Kept as data so its shape is reviewable rather than buried.
 *
 * The context block goes through `fence`, not through a format written here. That is the whole
 * point of having one definition: a second, weaker copy of "how retrieved text enters a prompt"
 * is a place where the length cap and the `data-only` label can be forgotten, and the forgotten
 * copy is the one that reaches the model. Sanitising here rather than at each call site means a
 * caller cannot construct an unfenced prompt even by accident.
 */
export const buildRequestBody = (request: GenerationRequest, model: string): string =>
  JSON.stringify({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: request.instructions },
      { role: "user", content: `${request.question}\n\n${fence(request.contexts)}` },
    ],
  })

/**
 * Did this transport failure mean "we ran out of time"?
 *
 * Matched against the message rather than a status code because a timeout may arrive as an
 * abort, a `DOMException`, or a plain thrown string depending on the runtime. The two spellings
 * both matter: `fetch` says "The operation was aborted", a raw socket says "timed out", and
 * matching only "timeout" silently misreports every abort as a plain outage.
 */
const isTimeout = (detail: string): boolean => /timed out|timeout|abort/i.test(detail)

/**
 * Build the live provider.
 *
 * An empty API key is `provider_not_configured` rather than a request that will 401. The
 * distinction matters to the person reading the ledger: "you did not configure a key" and
 * "the provider is down" are different problems with different fixes.
 */
export const hostedProvider = (config: HostedConfig, transport: Transport): Provider => ({
  name: config.name ?? "hosted",
  model: config.model,
  kind: "live",
  generate: async (request: GenerationRequest): Promise<GenerationResult> => {
    if (config.apiKey.trim().length === 0) {
      return providerFailure("provider_not_configured", `${config.name ?? "hosted"}: no API key was configured`)
    }
    const timeoutMs = config.timeoutMs ?? PROVIDER_TIMEOUT_MS
    const response = await transport({
      url: config.url,
      body: buildRequestBody(request, config.model),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      return providerFailure(isTimeout(response.error) ? "provider_timeout" : "provider_unavailable", response.error)
    }
    const payload = readResponseJson(response.value.body)
    if (!payload.ok) {
      return providerFailure("provider_malformed_output", `${config.name ?? "hosted"}: ${payload.error}`)
    }
    return decodeAnswer(payload.value, config.name ?? "hosted", config.model, "live")
  },
})

/** An `Answer` is only ever built here or in a test; this asserts the two shapes agree. */
export const isAnswerShape = (value: unknown): value is Answer => typeof value === "object" && value !== null && "claims" in value

export * as Live from "./live.ts"
