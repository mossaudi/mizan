import { decodeAnswer, providerFailure, type GenerationRequest, type GenerationResult, type Provider } from "../provider.ts"

/**
 * The Ollama local fallback provider.
 *
 * ## Why this exists
 *
 * A demo that requires a live API key dies in the room. When all remote providers are
 * unavailable, the system falls back to a local Ollama instance so demos can proceed
 * fully offline.
 *
 * ## The provider trait
 *
 * This adapter implements the same `Provider` trait as `hostedProvider` and
 * `transcriptProvider`. It can be selected via configuration and is transparent to
 * downstream code.
 *
 * ## Security
 *
 * The request contains only the prompt. No local file paths or system information
 * is sent. The connection is to localhost only (no SSRF risk).
 *
 * ## Honest degradation
 *
 * If Ollama is not running, the adapter returns `provider_unavailable` with a clear
 * message. It never fabricates a response.
 */

/** The default Ollama host. */
export const DEFAULT_OLLAMA_HOST = "http://localhost:11434"

/** The default Ollama model. */
export const DEFAULT_OLLAMA_MODEL = "llama3.2"

/** The Ollama API path for chat completions. */
export const OLLAMA_CHAT_PATH = "/api/chat"

/** Configuration for the Ollama provider. */
export type OllamaConfig = {
  /** The Ollama host URL. Defaults to http://localhost:11434. */
  readonly host?: string
  /** The model to use. Defaults to llama3.2. */
  readonly model?: string
  /** The provider name. Defaults to "ollama". */
  readonly name?: string
  /** Timeout in milliseconds. Defaults to 30000. */
  readonly timeoutMs?: number
}

/** The budget from the architecture: a provider that has not answered in 30 s is unavailable. */
export const OLLAMA_TIMEOUT_MS = 30_000

/**
 * Build the Ollama provider.
 *
 * The provider sends requests to the local Ollama instance and normalizes the
 * response to the common internal `Answer` type. If Ollama is not running or
 * returns an error, the provider returns an honest failure.
 */
export const ollamaProvider = (config: OllamaConfig = {}): Provider => {
  const host = (config.host ?? DEFAULT_OLLAMA_HOST).replace(/\/+$/, "")
  const model = config.model ?? DEFAULT_OLLAMA_MODEL
  const name = config.name ?? "ollama"
  const timeoutMs = config.timeoutMs ?? OLLAMA_TIMEOUT_MS

  return {
    name,
    model,
    kind: "live",
    generate: async (request: GenerationRequest): Promise<GenerationResult> => {
      const url = `${host}${OLLAMA_CHAT_PATH}`
      const body = JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: request.instructions },
          { role: "user", content: request.question },
        ],
      })

      let response: Response
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        })
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "network failure"
        return providerFailure("provider_unavailable", `${name}: Ollama is not reachable at ${host} (${detail})`)
      }

      if (!response.ok) {
        return providerFailure("provider_unavailable", `${name}: Ollama returned HTTP ${response.status}`)
      }

      let payload: unknown
      try {
        payload = await response.json() as unknown
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "parse error"
        return providerFailure("provider_malformed_output", `${name}: response was not JSON (${detail})`)
      }

      const content = extractContent(payload)
      if (content === null) {
        return providerFailure("provider_malformed_output", `${name}: response had no message content`)
      }

      return decodeAnswer(content, name, model, "live")
    },
  }
}

/**
 * Extract the message content from an Ollama response.
 *
 * Ollama returns `{ message: { role: "assistant", content: "..." } }` for chat
 * completions. This function extracts the content string, or null if the shape
 * is unexpected.
 */
const extractContent = (payload: unknown): unknown => {
  if (typeof payload !== "object" || payload === null) return null
  const message = (payload as { message?: unknown }).message
  if (typeof message !== "object" || message === null) return null
  const content = (message as { content?: unknown }).content
  if (typeof content !== "string") return null
  // Ollama may return the answer as a JSON string; try to parse it.
  try {
    return JSON.parse(content) as unknown
  } catch {
    return content
  }
}

export * as Ollama from "./ollama.ts"
