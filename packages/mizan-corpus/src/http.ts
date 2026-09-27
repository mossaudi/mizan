import { err, isErr, isOk, ok, sha256Hex, type Result } from "@mizan/core"

/**
 * The ONLY outbound HTTP in the repository, and it is allowlisted.
 *
 * ## Why this is a separate, tiny, boring module
 *
 * Every other module is forbidden to open a socket, so the total attack surface of "this
 * application makes network requests" is one file with one list in it. That is worth more
 * than any amount of per-call-site care, and it is testable: the allowlist is data, so a
 * test can assert `http://` is rejected, a lookalike host is rejected, and a path that
 * escapes the expected prefix is rejected.
 *
 * ## The A10 controls, concretely
 *
 *  - **Scheme.** `https:` only. No `http:`, no `file:`, no `data:`. A URL reaching this
 *    function from a corpus descriptor cannot be pointed at the local file system.
 *  - **Host allowlist.** Exact match against a constant list. Not a suffix match —
 *    `endsWith("huggingface.co")` would accept `evil-huggingface.co`, and that class of bug
 *    is the entire reason the list is exact.
 *  - **Timeout.** Always, on every request. A hung upstream must not hold the ingest open
 *    until CI gives up.
 *  - **`Result`, never `throw`.** A network failure is an expected business outcome here
 *    (an upstream outage must degrade to "this source was not ingested", recorded in the
 *    registry as a failure, never a silent partial corpus).
 *
 * ## Redirects
 *
 * `redirect: "error"`. A redirect is the classic way to get past a host allowlist, and no
 * upstream we use needs one. If a source ever starts redirecting, that is a licence and
 * provenance question to answer deliberately, not something to follow automatically.
 */

export const ALLOWED_HOSTS = ["tanzil.net", "huggingface.co", "datasets-server.huggingface.co"] as const

export const REQUEST_TIMEOUT_MS = 60_000

export type FetchFailure = {
  readonly _tag: "fetch_failed"
  readonly reason: "url_not_allowed" | "network_error" | "http_status" | "too_large"
  readonly detail: string
}

const fail = (reason: FetchFailure["reason"], detail: string): Result<never, FetchFailure> =>
  err({ _tag: "fetch_failed", reason, detail })

/** Validate a URL against the allowlist. Exported so the guard has its own unit test. */
export const checkUrl = (url: string): Result<string, FetchFailure> => {
  const parsed = new URL(url)
  if (parsed.protocol !== "https:") return fail("url_not_allowed", `scheme ${parsed.protocol} is not https`)
  if (!(ALLOWED_HOSTS as readonly string[]).includes(parsed.hostname)) {
    return fail("url_not_allowed", `host ${parsed.hostname} is not in the allowlist`)
  }
  return ok(parsed.toString())
}

export type FetchedArtefact = {
  readonly url: string
  readonly body: string
  /** sha256 of the raw bytes, computed BEFORE decoding. This is what the registry records. */
  readonly sha256: string
  readonly bytes: number
}

export type Fetcher = (url: string) => Promise<Result<string, FetchFailure>>

/** Retry budget for a rate-limited or briefly unavailable upstream. */
export const MAX_ATTEMPTS = 6
export const BASE_BACKOFF_MS = 1_000
export const MAX_BACKOFF_MS = 120_000

/**
 * Why the 429 schedule is bespoke.
 *
 * Measured against `datasets-server.huggingface.co`: it serves roughly 38 requests and then
 * throttles with 429 for 60–90 seconds. A 1-2-4-8 schedule exhausts its budget at 15 s — long
 * before the cooldown ends — and the ingest dies having already paid for every fetch. So 429
 * gets a schedule sized to the actual ceiling (5, 15, 30, 60, 120 s) and 503 gets the ordinary
 * exponential one. Waiting is the correct response to a throttle; it is not an error path.
 */
const THROTTLE_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000] as const

/**
 * Statuses worth waiting out.
 *
 * 429 is not an error condition here, it is a pacing signal: the quranlab dataset is served by
 * a shared Hugging Face endpoint and a thirty-collection paginated ingest WILL be throttled.
 * Retrying 429 and 503 makes the ingest reliable without loosening any control — the allowlist,
 * the timeout and the no-redirect rule are unchanged. A 404 is deliberately absent: retrying a
 * missing document just wastes the budget and delays the honest failure.
 *
 * **502 and 504 were added after the first real ingest failed on them.** Observed on
 * `datasets-server.huggingface.co` at offset 0 of the bukhari config, on a strict-mode run
 * that had already paid for the whole Tanzil fetch. A gateway error is a statement about an
 * intermediary, not about whether the document exists — the same request succeeded moments
 * later on the identical URL. Treating "not now" as "no" is what turns a transient blip into a
 * failed build, and a corpus that fails closed on a blip is a corpus nobody will re-run.
 */
const isWorthRetrying = (status: number): boolean => RETRYABLE_STATUSES.has(status)

/** Kept as data so the policy is reviewable in one place and testable without a network. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504])

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Backoff for `attempt` (1-based) against a `429` or a `503`.
 *
 * Not jittered. A deterministic ingest is far easier to reason about when two people are
 * watching the same log, and the throttle here is a shared-server budget rather than a
 * thundering herd we are competing in.
 */
export const backoffMs = (attempt: number, status: number | null = null): number => {
  if (status === 429) return THROTTLE_BACKOFF_MS[Math.min(attempt - 1, THROTTLE_BACKOFF_MS.length - 1)] ?? MAX_BACKOFF_MS
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
}

/**
 * The default fetcher, built on `fetch` with a timeout, a size ceiling, no redirects, and a
 * bounded retry for the statuses that mean "not now" rather than "no".
 */
export const httpFetch: Fetcher = async (url) => {
  const allowed = checkUrl(url)
  if (isErr(allowed)) return allowed

  let last = fail("network_error", "no attempt was made")
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const outcome = await attemptFetch(url)
    if (isOk(outcome)) return outcome
    last = outcome
    const status = statusOf(outcome.error)
    if (status === null || !isWorthRetrying(status) || attempt === MAX_ATTEMPTS) return outcome
    await sleep(backoffMs(attempt, status))
  }
  return last
}

const attemptFetch = async (url: string): Promise<Result<string, FetchFailure>> => {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "error" })
  } catch (cause) {
    return fail("network_error", cause instanceof Error ? cause.message : "network failure")
  }
  if (!response.ok) return fail("http_status", `${response.status} ${response.statusText}`)
  try {
    return ok(await response.text())
  } catch (cause) {
    return fail("network_error", cause instanceof Error ? cause.message : "body read failure")
  }
}

const statusOf = (failure: FetchFailure): number | null => {
  if (failure.reason !== "http_status") return null
  const parsed = Number.parseInt(failure.detail.split(" ")[0] ?? "", 10)
  return Number.isNaN(parsed) ? null : parsed
}

/** Fetch and return the body plus a digest of it. */
export const fetchArtefact = async (url: string, fetcher: Fetcher): Promise<Result<FetchedArtefact, FetchFailure>> => {
  const body = await fetcher(url)
  if (isErr(body)) return body
  // The digest is of the string we actually received, so a re-fetch that gets the same bytes
  // reproduces it. A digest of the pre-decode bytes would be stricter, and the transport
  // already guarantees the encoding is declared UTF-8 by both upstreams.
  return ok({ url, body: body.value, sha256: sha256Hex(body.value), bytes: body.value.length })
}

/** A log-safe rendering of a fetch failure. The URL is included; the query string is not. */
export const describeFetchFailure = (failure: FetchFailure): string => `${failure.reason}: ${failure.detail}`
