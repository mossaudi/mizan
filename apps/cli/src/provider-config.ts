import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { hostedProvider, transcriptProvider, type Provider, type TranscriptEntry, type Transport } from "@mizan/agent"

/**
 * Choosing a provider, and refusing to invent one.
 *
 * ## The rule this file exists to enforce
 *
 * There is no mock provider, no fixture provider, and no default. If neither a configured API
 * key nor a committed transcript exists, `resolveProvider` returns a provider that fails every
 * call with `provider_not_configured`, and the product prints `model unavailable`. That is the
 * correct outcome, and it is why this function returns a `Provider` rather than throwing or
 * exiting: the failure has to flow through the same path as an outage, so there is exactly one
 * place that renders it.
 *
 * ## Which is preferred, and why
 *
 * A configured key wins, because a live run is the real thing. A transcript is the fallback so
 * a demo survives an outage — and it is labelled `"precomputed"` in its type, its payload, and
 * the run trace, so a replay can never be mistaken for a live generation.
 *
 * ## The transport is built here, and nowhere else
 *
 * This is the single place in the repository that knows a model API's hostname. The agent
 * package takes a `Transport` and never opens a socket itself, so the allowlist stays one
 * decision in one file rather than being spread across adapters — the same discipline
 * `mizan-corpus/src/http.ts` keeps for corpus hosts.
 */

/** Only this host may be called. Not a suffix match: `evil-openai.com` must not pass. */
export const PROVIDER_HOST = "api.openai.com"
export const PROVIDER_URL = `https://${PROVIDER_HOST}/v1/chat/completions`

const ENV_KEY = "MIZAN_API_KEY"
const ENV_MODEL = "MIZAN_MODEL"

const readEnv = (name: string): string | null => {
  const value = process.env[name]
  if (value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const transcriptPath = (root: string, relative: string): string => `${root}/${relative}`

const readTranscript = async (path: string): Promise<readonly TranscriptEntry[] | null> => {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown
    if (typeof parsed !== "object" || parsed === null) return null
    const entries = (parsed as { readonly entries?: unknown }).entries
    if (!Array.isArray(entries)) return null
    // Narrowed by shape, not trusted: a transcript is a committed file, and a malformed entry
    // would otherwise surface as a confusing decode error deep inside a replay. Anything that
    // is not an entry with a usable stage and question hash is dropped, and a file that ends
    // up empty simply means "no model configured".
    return entries.filter((entry): entry is TranscriptEntry => {
      if (typeof entry !== "object" || entry === null) return false
      const candidate = entry as { readonly stage?: unknown; readonly questionHash?: unknown }
      if (candidate.stage !== "decompose" && candidate.stage !== "answer") return false
      return typeof candidate.questionHash === "string" && candidate.questionHash.length > 0
    })
  } catch {
    // A corrupt transcript is not a crash: it is the same "there is no model" state.
    return null
  }
}

/**
 * The one outbound call, allowlisted and bounded.
 *
 * `redirect: "error"` for the same reason the corpus client uses it: a redirect is the
 * standard way to walk past a host allowlist, and no model API we talk to needs one.
 */
const transport: Transport = async (request) => {
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The key is read from the closure, never from the request, so it cannot be logged
        // alongside a request body by an interceptor.
        authorization: `Bearer ${process.env[ENV_KEY] ?? ""}`,
      },
      body: request.body,
      signal: request.signal,
      redirect: "error",
    })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status} ${response.statusText}` }
    return { ok: true, value: { body: await response.text() } }
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "network failure" }
  }
}

/** A provider that is honest about having no model, and never fabricates one. */
const unconfiguredProvider = (reason: string): Provider => ({
  name: "unconfigured",
  model: "none",
  kind: "live",
  generate: async () => ({ ok: false, error: { _tag: "provider_failed", reason: "provider_not_configured", detail: reason } }),
})

export const resolveProvider = async (root: string, transcriptRelative: string): Promise<Provider> => {
  const apiKey = readEnv(ENV_KEY)
  if (apiKey !== null) {
    return hostedProvider({ url: PROVIDER_URL, apiKey, model: readEnv(ENV_MODEL) ?? "gpt-4o-mini", name: "hosted" }, transport)
  }

  const entries = await readTranscript(transcriptPath(root, transcriptRelative))
  if (entries !== null && entries.length > 0) return transcriptProvider({ entries })

  return unconfiguredProvider(
    `no ${ENV_KEY} was set and ${transcriptRelative} holds no entries, so there is no model. ` +
      `Set ${ENV_KEY} for a live run, or commit a transcript to ${transcriptRelative} for a labelled replay.`,
  )
}

export * as ProviderConfig from "./provider-config.ts"
