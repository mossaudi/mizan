import { Schema } from "effect"
import { decodeOrFail, decodeSync, stripTerminalControls, type Result, err, ok, type DecodeFailure, MIN_VERIFIABLE_QUOTE_CHARS } from "@mizan/core"
import { ModelSpanSelectorOutput, type ModelSpanSelectorOutput as ModelSpanSelectorOutputType } from "./schema/span-candidate.ts"

/**
 * Provider port for the extract selector.
 *
 * This is a minimal provider interface for the model-assisted span selector.
 * It decodes to the extract-specific schema (ModelSpanSelectorOutput).
 *
 * ## G-1.1 Compliance
 *
 * This package does NOT import @mizan/verify. It only depends on @mizan/core
 * and effect.
 */

export type ExtractTransportRequest = {
  readonly url: string
  readonly body: string
  readonly signal: AbortSignal
}

export type ExtractTransport = (request: ExtractTransportRequest) => Promise<Result<{ readonly body: string }, string>>

export type ExtractProviderConfig = {
  readonly url: string
  readonly apiKey: string
  readonly model: string
  readonly name?: string
  readonly timeoutMs?: number
  readonly allowedHosts?: readonly string[]
}

/** The budget from the architecture: a provider that has not answered in 30 s is unavailable. */
export const EXTRACT_PROVIDER_TIMEOUT_MS = 30_000

/** Maximum chunk characters sent to the model (fenced, length-capped, data-only). */
export const MAX_CHUNK_CHARS = 2000

/** Maximum input chunk text size before fencing (10x the output cap) to prevent memory pressure. */
export const MAX_INPUT_CHUNK_CHARS = MAX_CHUNK_CHARS * 10

/** 
 * Minimum Arabic characters for a quote to be verifiable.
 * Re-exported from @mizan/core for consumers that need the constant
 * without importing the full normalization module.
 * Rationale: 15 characters is the empirically determined floor below
 * which strict containment verification produces unacceptable false
 * positive rates on fabricated hadith (ADR-03 spike evidence).
 */
export { MIN_VERIFIABLE_QUOTE_CHARS }

/** Maximum inner JSON content size from model response (10 KB) to prevent memory exhaustion. */
export const MAX_INNER_JSON_SIZE = 10_000

/** Schema for the outer HTTP response from the provider. */
const ProviderResponseSchema = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({
        content: Schema.String,
      }),
    })
  ),
})

/** Schema that parses the inner model response content as JSON string. */
const ModelSpanSelectorOutputFromJson = Schema.fromJsonString(ModelSpanSelectorOutput)

/** The system prompt for the extract selector. */
export const EXTRACT_SYSTEM_PROMPT = `You are a quote extraction assistant for Islamic text verification.
Your task is to identify verbatim quotations from the Qur'an or Hadith in the provided text.

RULES:
1. Extract ONLY verbatim quotes that appear in the text. Do not paraphrase or summarize.
2. For each quote, provide: the exact quote text, character offsets (start/end), source hint (quran/hadith/collection/unknown), and confidence (0-1).
3. If a quote cites a specific collection (e.g., "Bukhari", "Muslim"), use "collection" as sourceHint.
4. If the source is clearly Qur'an, use "quran". If clearly Hadith but no collection named, use "hadith".
5. If uncertain, use "unknown".
6. Return ONLY valid JSON matching the schema. No extra text.
7. Maximum 10 candidates per chunk.
8. Minimum quote length: 15 Arabic characters (shorter fragments are not verifiable).

Output schema:
{
  "chunkIndex": number,
  "candidates": [
    {
      "quote": "string",
      "startOffset": number,
      "endOffset": number,
      "sourceHint": "quran" | "hadith" | "collection" | "unknown",
      "confidence": number,
      "candidateId": "string"
    }
  ],
  "degraded": boolean,
  "degradationReason": "string"
}`

/** Dangerous control characters to strip from input before fencing. */
const DANGEROUS_CHARS_REGEX = /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g

function fenceChunkText(text: string): string {
  // Sanitize: remove null bytes and other dangerous control characters
  const sanitized = text.replace(DANGEROUS_CHARS_REGEX, "")
  const capped = sanitized.length > MAX_CHUNK_CHARS ? sanitized.slice(0, MAX_CHUNK_CHARS) : sanitized
  return `<<<ARTICLE_CHUNK_DATA_ONLY>>>\n${capped}\n<<<END_ARTICLE_CHUNK>>>`
}

/**
 * Build the request body for the extract selector.
 */
function buildExtractRequestBody(chunkText: string, chunkIndex: number, maxCandidates: number, model: string): string {
  const sanitized = stripTerminalControls(chunkText)
  const fenced = fenceChunkText(sanitized)
  const userPrompt = `Extract verbatim Qur'an/Hadith quotes from chunk ${chunkIndex} (max ${maxCandidates} candidates).
Minimum quote length: 15 Arabic characters.

${fenced}

Return JSON only.`

  return JSON.stringify({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: EXTRACT_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  })
}

/**
 * Extract JSON from the response body using schema-first decoding.
 * Strict: model response content MUST be valid JSON. No prose fallback.
 * No JSON.parse on untrusted input at trust boundary (AGENTS.md §1).
 */
function readExtractResponseJson(body: string): Result<unknown, string> {
  // Decode outer response via schema (schema-first at trust boundary)
  const outerDecoded = decodeOrFail(decodeSync(ProviderResponseSchema), body, "ProviderResponse")
  if (!outerDecoded.ok) {
    return { ok: false, error: `response schema validation failed: ${outerDecoded.error.detail}` }
  }
  const content = outerDecoded.value.choices[0]?.message?.content
  if (typeof content !== "string") {
    return { ok: false, error: "response choice had no textual content" }
  }

  // Size limit to prevent memory exhaustion from massive inner JSON.
  if (content.length > MAX_INNER_JSON_SIZE) {
    return { ok: false, error: `model response content exceeds maximum allowed size of ${MAX_INNER_JSON_SIZE} bytes` }
  }

  // Decode inner content via schema (schema-first at trust boundary)
  const innerDecoded = decodeOrFail(decodeSync(ModelSpanSelectorOutputFromJson), content, "ModelSpanSelectorOutput")
  if (!innerDecoded.ok) {
    return { ok: false, error: `model response content schema validation failed: ${innerDecoded.error.detail}` }
  }
  return { ok: true, value: innerDecoded.value }
}

/**
 * Check if a transport failure is a timeout.
 */
function isTimeout(detail: string): boolean {
  return /timed out|timeout|abort/i.test(detail)
}

/**
 * Check if a transport failure is a rate limit (HTTP 429).
 * The transport layer should include "429" or "rate limit" in the error detail.
 */
function isRateLimited(detail: string): boolean {
  return /429|rate.?limit|too many requests/i.test(detail)
}

/**
 * Provider failure for extract.
 */
export type ExtractProviderFailure = {
  readonly _tag: "extract_provider_failed"
  readonly reason: "provider_not_configured" | "provider_timeout" | "provider_unavailable" | "provider_malformed_output" | "schema_decode_failed" | "rate_limited"
  readonly detail: string
}

export type ExtractGenerationResult = Result<ModelSpanSelectorOutputType, ExtractProviderFailure>

/**
 * Build a failure Result for extract provider.
 */
function extractProviderFailure(reason: ExtractProviderFailure["reason"], detail: string): ExtractGenerationResult {
  return err({ _tag: "extract_provider_failed", reason, detail })
}

/**
 * Validate a single allowed host entry.
 * Rejects empty strings, entries with protocols, paths, or port specifications.
 */
function validateAllowedHostEntry(entry: string): Result<void, string> {
  const trimmed = entry.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: "allowedHosts entry cannot be empty" }
  }
  // Reject protocols (http://, https://, etc.)
  if (/^[a-z]+:/i.test(trimmed)) {
    return { ok: false, error: `allowedHosts entry must not contain protocol: ${trimmed}` }
  }
  // Reject paths
  if (trimmed.includes("/")) {
    return { ok: false, error: `allowedHosts entry must not contain path: ${trimmed}` }
  }
  // Reject port specifications
  if (trimmed.includes(":") && !trimmed.startsWith("[")) {
    // Allow IPv6 literals like [::1] but reject host:port
    return { ok: false, error: `allowedHosts entry must not contain port: ${trimmed}` }
  }
  // Reject wildcard patterns that could be abused
  if (trimmed.includes("*")) {
    return { ok: false, error: `allowedHosts entry must not contain wildcards: ${trimmed}` }
  }
  return { ok: true, value: undefined }
}

/**
 * Validate that the provider URL hostname is in the allowed hosts list (SSRF mitigation).
 * Uses proper domain label hierarchy validation to prevent subdomain takeover attacks.
 * Example: allowed "example.com" should match "example.com", "api.example.com", "v1.api.example.com"
 * but NOT "example.com.attacker.com" or "evil.example.com.attacker.com"
 * 
 * Each allowed host entry is validated before use (Finding 5: input validation at boundary).
 */
function validateAllowedHosts(url: string, allowedHosts?: readonly string[]): Result<void, string> {
  if (!allowedHosts || allowedHosts.length === 0) {
    return { ok: true, value: undefined }
  }
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return { ok: false, error: `invalid provider URL: ${url}` }
  }

  // Validate each allowed host entry first (defense in depth)
  for (const entry of allowedHosts) {
    const validation = validateAllowedHostEntry(entry)
    if (!validation.ok) {
      return { ok: false, error: `invalid allowedHosts configuration: ${validation.error}` }
    }
  }

  const normalizedHostname = hostname.toLowerCase().replace(/^\./, "")

  for (const allowed of allowedHosts) {
    const normalizedAllowed = allowed.toLowerCase().replace(/^\./, "")
    // Exact match
    if (normalizedHostname === normalizedAllowed) {
      return { ok: true, value: undefined }
    }
    // Subdomain match: check at label boundaries using split
    // "api.example.com" ends with "example.com" at label boundary (allowed parts match suffix)
    // "example.com.attacker.com" does NOT end with "example.com" at label boundary
    if (isSubdomainOf(normalizedHostname, normalizedAllowed)) {
      return { ok: true, value: undefined }
    }
  }
  return { ok: false, error: `provider host ${hostname} is not in allowed hosts list` }
}

/**
 * Check if hostname is exactly allowedDomain or a proper subdomain of it.
 * Uses label-based comparison to prevent suffix-match bypasses.
 * 
 * @param hostname - The hostname to check (e.g., "api.example.com")
 * @param allowedDomain - The allowed domain (e.g., "example.com")
 * @returns true if hostname === allowedDomain or hostname is a subdomain of allowedDomain
 */
function isSubdomainOf(hostname: string, allowedDomain: string): boolean {
  const hostParts = hostname.split(".")
  const allowedParts = allowedDomain.split(".")
  
  // Hostname must have at least as many labels as allowed domain
  if (hostParts.length < allowedParts.length) return false
  
  // Check if the suffix labels match exactly
  for (let i = 0; i < allowedParts.length; i++) {
    if (hostParts[hostParts.length - allowedParts.length + i] !== allowedParts[i]) {
      return false
    }
  }
  
  // Must have at least one additional label for subdomain (strict subdomain)
  // If equal length, it would be exact match which is handled above
  return hostParts.length > allowedParts.length
}

/**
 * The extract provider.
 */
export const extractProvider = (config: ExtractProviderConfig, transport: ExtractTransport) => ({
  name: config.name ?? "extract",
  model: config.model,
  kind: "live" as const,
  generate: async (chunkText: string, chunkIndex: number, maxCandidates?: number): Promise<ExtractGenerationResult> => {
    if (config.apiKey.trim().length === 0) {
      return extractProviderFailure("provider_not_configured", `${config.name ?? "extract"}: no API key was configured`)
    }
    // SSRF mitigation: validate URL hostname against allowlist
    const hostValidation = validateAllowedHosts(config.url, config.allowedHosts)
    if (!hostValidation.ok) {
      return extractProviderFailure("provider_not_configured", `${config.name ?? "extract"}: ${hostValidation.error}`)
    }
    const timeoutMs = config.timeoutMs ?? EXTRACT_PROVIDER_TIMEOUT_MS
    const response = await transport({
      url: config.url,
      body: buildExtractRequestBody(chunkText, chunkIndex, maxCandidates ?? 10, config.model),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      const reason = isTimeout(response.error)
        ? "provider_timeout"
        : isRateLimited(response.error)
          ? "rate_limited"
          : "provider_unavailable"
      return extractProviderFailure(reason, response.error)
    }
    const payload = readExtractResponseJson(response.value.body)
    if (!payload.ok) {
      return extractProviderFailure("provider_malformed_output", `${config.name ?? "extract"}: ${payload.error}`)
    }
    // Decode using the extract schema
    const decoded = decodeOrFail(decodeSync(ModelSpanSelectorOutput), payload.value, "ModelSpanSelectorOutput")
    if (!decoded.ok) {
      return extractProviderFailure("schema_decode_failed", `${config.name ?? "extract"}: ${decoded.error.detail}`)
    }
    // Ensure chunkIndex matches
    if (decoded.value.chunkIndex !== chunkIndex) {
      return extractProviderFailure("schema_decode_failed", `${config.name ?? "extract"}: chunkIndex mismatch (expected ${chunkIndex}, got ${decoded.value.chunkIndex})`)
    }
    return ok(decoded.value)
  },
})

/**
 * An unconfigured extract provider that fails honestly.
 */
export const unconfiguredExtractProvider = (reason: string) => ({
  name: "unconfigured-extract",
  model: "none",
  kind: "live" as const,
  generate: async (): Promise<ExtractGenerationResult> =>
    extractProviderFailure("provider_not_configured", reason),
})

export { fenceChunkText, validateAllowedHosts, validateAllowedHostEntry, isSubdomainOf }

export * as ExtractProvider from "./provider.ts"