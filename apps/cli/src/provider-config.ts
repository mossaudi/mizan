import { err, isErr, ok, type Result } from "@mizan/core"
import { hostedProvider, ollamaProvider, transcriptProvider, type Provider, type Transport } from "@mizan/agent"
import { readTranscript } from "./transcript-file.ts"

/**
 * Re-exported, not re-declared.
 *
 * `TRANSCRIPT_RELATIVE` and `readTranscript` live in `./transcript-file.ts` because the demo replays
 * the transcript and must not be able to reach this module to do it — see that file's header. They
 * are re-exported here so `main.ts` and every existing caller keep one import site and there is
 * still exactly one definition of each (AGENTS.md section 17).
 */
export { readTranscript, TRANSCRIPT_RELATIVE } from "./transcript-file.ts"

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
 * ## The variable names are the documented ones
 *
 * `.env.example` has always documented `MIZAN_PROVIDER`, `MIZAN_LLM_BASE_URL`, `MIZAN_LLM_MODEL`
 * and `MIZAN_LLM_API_KEY`, and `DISCLOSURE.md` and `INTEGRITY.md` both instruct an operator to set
 * `MIZAN_PROVIDER=scripted`. The code read none of them — it read `MIZAN_API_KEY` and
 * `MIZAN_MODEL`, which appear in no documentation anywhere in the repository. So the documented
 * offline-replay instructions did nothing, and a reader who followed `.env.example` exactly got
 * `model unavailable` with no indication why. The names are now the documented ones, and
 * `scripts/check-docs-claims.ts` asserts the two sets agree so they cannot drift again.
 *
 * `MIZAN_PROVIDER` is not decoration: `scripted` is an explicit request for the committed
 * transcript, and it wins even when a key is present. "I set this and it used my key anyway" is
 * a worse failure than "this is not a provider mizan implements".
 *
 * ## The endpoint is host-allowlisted, and the allowlist is code
 *
 * `MIZAN_LLM_BASE_URL` makes a user-supplied URL reachable, which is textbook A10 SSRF, so the
 * host is checked against `PROVIDER_ALLOWED_HOSTS` and the scheme must be `https`. The allowlist
 * is a hardcoded array rather than configuration: adding a host is a reviewable code change that
 * shows up in a diff, which is the same discipline `mizan-corpus/src/http.ts` keeps for corpus
 * hosts. Making it an env var would mean any deployment that can read the environment can also
 * redirect the API key anywhere, which defeats the point of the check.
 *
 * A host outside the allowlist is REFUSED, not replaced with the default. Silently ignoring an
 * operator's configured endpoint would send their requests to a different company than the one
 * they named, with their key attached.
 *
 * ## The transport is built here, and nowhere else
 *
 * This is the single place in the run path that knows a remote model API's hostname: the allowlist
 * below decides it, and the transport re-checks it before any socket opens. The Ollama adapter in
 * `@mizan/agent` knows only its loopback default, and the one route to it is the exported
 * `resolveProviderWithFallback` at the bottom of this file — which no caller in this repository
 * uses. Every REMOTE model host string lives here, so the allowlist stays one decision in one file.
 */

export const ENV_PROVIDER = "MIZAN_PROVIDER"
export const ENV_API_KEY = "MIZAN_LLM_API_KEY"
export const ENV_BASE_URL = "MIZAN_LLM_BASE_URL"
export const ENV_MODEL = "MIZAN_LLM_MODEL"

/** The only host that may be called by default. Not a suffix match: `evil-openai.com` must not pass. */
export const PROVIDER_HOST = "api.openai.com"

/**
 * Hosts a provider URL may name. Code, not configuration — see the file header.
 *
 * An operator who needs a different host adds it here, in a reviewable diff, together with the
 * licence and data-residency reasoning that belongs in `DISCLOSURE.md`.
 */
export const PROVIDER_ALLOWED_HOSTS: readonly string[] = [PROVIDER_HOST]

/** The OpenAI-compatible API base, with no trailing slash. */
export const DEFAULT_PROVIDER_BASE = `https://${PROVIDER_HOST}/v1`

/** Appended to the base to reach the chat endpoint. */
export const PROVIDER_CHAT_PATH = "chat/completions"

export const DEFAULT_PROVIDER_MODEL = "gpt-4o-mini"

/** The only two modes. `scripted` is the committed transcript, labelled `precomputed` everywhere. */
export const PROVIDER_MODES = ["hosted", "scripted"] as const
export type ProviderMode = (typeof PROVIDER_MODES)[number]

/** The full default endpoint, exported because tests and the disclosure both state it. */
export const PROVIDER_URL = `${DEFAULT_PROVIDER_BASE}/${PROVIDER_CHAT_PATH}`

const readEnv = (name: string): string | null => {
  const value = process.env[name]
  if (value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

const isProviderMode = (value: string): value is ProviderMode =>
  (PROVIDER_MODES as readonly string[]).includes(value)

const transcriptPath = (root: string, relative: string): string => `${root}/${relative}`

/**
 * `new URL` without the throw.
 *
 * Deliberately not annotated with an explicit `URL`: the global `URL` is declared differently by
 * Bun's types and the Node lib, so naming it here is a type error on one runtime and a silent
 * mismatch on the other. Inference gives the type the runtime actually returns.
 */
const parseUrl = (value: string) => {
  try {
    return ok(new URL(value))
  } catch {
    return err(`${ENV_BASE_URL} is not a valid URL: ${JSON.stringify(value)}`)
  }
}

/**
 * Turn a configured base URL into the endpoint we will actually call, or say why not.
 *
 * Four checks, all of which have been a real SSRF or credential-leak vector in a config-driven
 * client: the scheme must be `https` (a `http://` base puts the key on the wire in the clear), the
 * URL must parse, it must not embed `user:password@` (which would put a second credential in a
 * log line via the URL), and the host must be allowlisted.
 *
 * @returns the absolute endpoint, or a one-line reason an operator can act on.
 */
export const resolveProviderEndpoint = (base: string): Result<string, string> => {
  const withoutTrailingSlash = base.trim().replace(/\/+$/, "")
  const parsed = parseUrl(withoutTrailingSlash)
  if (isErr(parsed)) return parsed
  const url = parsed.value

  if (url.protocol !== "https:") {
    return err(`${ENV_BASE_URL} must be https, not ${url.protocol.replace(":", "")}`)
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return err(`${ENV_BASE_URL} must not embed credentials in the URL; use ${ENV_API_KEY} instead`)
  }
  if (!PROVIDER_ALLOWED_HOSTS.includes(url.hostname)) {
    return err(
      `${ENV_BASE_URL} names ${url.hostname}, which is not in the provider host allowlist ` +
        `(${PROVIDER_ALLOWED_HOSTS.join(", ")}). Add it to PROVIDER_ALLOWED_HOSTS in ` +
        "apps/cli/src/provider-config.ts to allow it deliberately.",
    )
  }
  return ok(`${withoutTrailingSlash}/${PROVIDER_CHAT_PATH}`)
}

/**
 * The one outbound call, allowlisted and bounded.

 *
 * `redirect: "error"` for the same reason the corpus client uses it: a redirect is the standard
 * way to walk past a host allowlist, and no model API we talk to needs one.
 *
 * ## The key is captured, not re-read
 *
 * The previous version read `process.env[ENV_KEY]` at request time, inside the fetch. That made
 * the credential the header carried depend on the state of the global environment at the moment
 * of the call rather than at the moment the provider was configured — so a key that was
 * exported, used to build the provider, and then unset (or rotated, or shadowed by a test
 * harness) would either send a DIFFERENT key than the one `hostedProvider` validated as
 * configured, or send `Bearer ` with an empty credential to a live endpoint. The configured value
 * is now a closure parameter: the same key that was checked is the key that is sent, for the whole
 * run.
 *
 * The host is re-checked here as well as in `resolveProviderEndpoint`. That is deliberate
 * duplication, not an oversight: this is the function that opens the socket, so this is where the
 * allowlist has to hold even if a future caller builds a URL by some other route.
 */
const transportFor =
  (apiKey: string): Transport =>
  async (request) => {
    const host = new URL(request.url).hostname
    if (!PROVIDER_ALLOWED_HOSTS.includes(host)) {
      return { ok: false, error: `allowlist_denied: ${host} is not a permitted provider host` }
    }
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The key is captured in the closure and read only from `apiKey`, so it cannot be
          // logged alongside a request body by an interceptor and cannot change mid-run.
          authorization: `Bearer ${apiKey}`,
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

/**
 * The committed transcript, if there is one.
 *
 * A separate function so both routes into a replay — an explicit `MIZAN_PROVIDER=scripted` and the
 * "no key, fall back" default — degrade through the identical message. A reader who asked for
 * `scripted` and got `provider_not_configured` needs to know the transcript is missing, not that
 * a key is missing.
 */
const resolveScripted = async (root: string, transcriptRelative: string): Promise<Provider> => {
  const entries = await readTranscript(transcriptPath(root, transcriptRelative))
  if (entries !== null && entries.length > 0) return transcriptProvider({ entries })
  return unconfiguredProvider(
    `${ENV_PROVIDER}=scripted was requested but ${transcriptRelative} holds no usable entries, so there is no model. ` +
      `Run \`bun run ask --list-questions\` to see what this build can replay.`,
  )
}

/**
 * Whether a credential is configured in this environment right now.
 *
 * Exported for one caller, and the reason is a correctness one rather than a convenience one:
 * `main.ts` offers the replay when a *configured* provider fails, and that offer is only true
 * advice while a key exists. Telling a keyless run to "unset `MIZAN_LLM_API_KEY`" names a route
 * that cannot succeed — it is already unset — so the same honest-sounding sentence is false advice
 * in exactly the state a judge is most likely to be in. The check lives here because this module
 * already owns `readEnv`, and a second reader of `process.env` would be a second source of truth
 * for what "configured" means.
 */
export const providerKeyConfigured = (): boolean => readEnv(ENV_API_KEY) !== null

/**
 * Resolve the provider for this run. Never throws, never invents a model.
 *
 * Order of precedence, and why: an explicit `MIZAN_PROVIDER` decides the mode and is not
 * second-guessed; within `hosted`, a configured key wins over a transcript because a live run is
 * the real thing; the transcript is the fallback so a demo survives an outage, and it is
 * labelled `"precomputed"` in its type, its payload and the run trace, so a replay can never be
 * mistaken for a live generation.
 */
export const resolveProvider = async (root: string, transcriptRelative: string): Promise<Provider> => {
  const mode = readEnv(ENV_PROVIDER) ?? "hosted"
  if (!isProviderMode(mode)) {
    return unconfiguredProvider(
      `${ENV_PROVIDER}=${JSON.stringify(mode)} is not a provider mizan implements. ` +
        `Valid values: ${PROVIDER_MODES.join(", ")}.`,
    )
  }

  if (mode === "scripted") return await resolveScripted(root, transcriptRelative)

  const apiKey = readEnv(ENV_API_KEY)
  if (apiKey === null) return await resolveScripted(root, transcriptRelative)

  const endpoint = resolveProviderEndpoint(readEnv(ENV_BASE_URL) ?? DEFAULT_PROVIDER_BASE)
  if (isErr(endpoint)) return unconfiguredProvider(endpoint.error)

  return hostedProvider(
    { url: endpoint.value, apiKey, model: readEnv(ENV_MODEL) ?? DEFAULT_PROVIDER_MODEL, name: "hosted" },
    transportFor(apiKey),
  )
}

/**
 * Resolve the provider with Ollama fallback.
 *
 * When all remote providers are unavailable (no API key, no transcript), the system
 * falls back to a local Ollama instance so demos can proceed fully offline.
 *
 * The fallback is automatic: the caller does not need to know which provider was
 * selected. The provider's `kind` field tells the truth — `"live"` for hosted and
 * Ollama, `"precomputed"` for transcripts.
 */
export const resolveProviderWithFallback = async (root: string, transcriptRelative: string): Promise<Provider> => {
  const provider = await resolveProvider(root, transcriptRelative)
  // If the provider is unconfigured (no key, no transcript), fall back to Ollama.
  if (provider.name === "unconfigured") {
    return ollamaProvider()
  }
  return provider
}

export * as ProviderConfig from "./provider-config.ts"
