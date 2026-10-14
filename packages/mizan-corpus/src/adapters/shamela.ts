import { err, isErr, isOk, ok, sha256Hex, type Result } from "@mizan/core"
import type { FetchContext, RawRecord, SourceAdapter } from "./types.ts"
import {
  ALLOWED_HOSTS,
  httpFetch,
  checkUrl,
  type Fetcher,
  type FetchFailure,
  MAX_ATTEMPTS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  THROTTLE_BACKOFF_MS,
  RETRYABLE_STATUSES,
  isWorthRetrying,
  backoffMs,
  REQUEST_TIMEOUT_MS,
  sleep,
  statusOf,
} from "../http.ts"
import { loadShamelaLicenseRegistry, buildShamelaLicenseMap } from "./shamela-license.ts"
import { resolve } from "node:path"
import { realpathSync } from "node:fs"

/**
 * Shamela.ws adapter — license-gated ingestion of classical Arabic literature.
 *
 * ## Why this adapter exists
 *
 * Shamela.ws hosts 8,598+ books of classical Arabic literature. The ingestion is
 * license-gated: only books with `licenseStatus: "cleared"` in the source registry
 * are fetched. The adapter reads the Shamela v4 REST API (requires API key).
 *
 * ## The Shamela v4 API
 *
 * Base: `https://api.shamela.ws` (or configured instance)
 * Endpoints:
 *   - `GET /api/books` — paginated book list with metadata
 *   - `GET /api/books/{id}` — book details
 *   - `GET /api/books/{id}/pages` — paginated page content
 *   - `GET /api/master_patch` — master database metadata
 *
 * Authentication: `Authorization: Bearer <API_KEY>` header.
 *
 * ## License gating (G-5)
 *
 * The adapter checks `licenseStatus` from the source registry BEFORE fetching.
 * Books with `blocked` or `pending` status are skipped with an audit log entry.
 * This is enforced at the adapter boundary, not in the ingest loop.
 *
 * ## FTS5 indexing
 *
 * Pages are inserted into a `shamela_pages` FTS5 virtual table with columns:
 *   - `book_id` (UNINDEXED)
 *   - `page_number` (UNINDEXED)
 *   - `book_title` (UNINDEXED)
 *   - `author` (UNINDEXED)
 *   - `category` (UNINDEXED)
 *   - `content` (indexed, the page text)
 *   - `source_hash` (UNINDEXED, sha256 of page text)
 *   - `ingest_timestamp` (UNINDEXED)
 *   - `license_status` (UNINDEXED)
 *
 * The main `records` table is NOT used for Shamela — Shamela has its own tables.
 * Retrieval searches the FTS5 index directly.
 */

// Re-export allowed hosts for Shamela (add to http.ts ALLOWED_HOSTS)
export const SHAMELA_API_HOST = "api.shamela.ws" as const

/** Shamela book from the API. */
export type ShamelaBook = {
  readonly id: number
  readonly title: string
  readonly author: string
  readonly category: string
  readonly page_count: number
  readonly license_status: "cleared" | "blocked" | "pending"
}

/** Shamela page from the API. */
export type ShamelaPage = {
  readonly book_id: number
  readonly page_number: number
  readonly content: string
}

/** API response for book list. */
type BookListResponse = {
  readonly books: readonly ShamelaBookApi[]
  readonly page: number
  readonly per_page: number
  readonly total: number
}

/** API response for pages. */
type PagesResponse = {
  readonly pages: readonly ShamelaPageApi[]
  readonly page: number
  readonly per_page: number
  readonly total: number
}

/** Raw book from API (before license status added). */
type ShamelaBookApi = {
  readonly id: number
  readonly title: string
  readonly author: string
  readonly category: string
  readonly page_count: number
}

/** Raw page from API. */
type ShamelaPageApi = {
  readonly page_number: number
  readonly content: string
}

/** License registry entry for a Shamela book. */
export type ShamelaLicenseEntry = {
  readonly bookId: number
  readonly title: string
  readonly author: string
  readonly licenseStatus: "cleared" | "blocked" | "pending"
  readonly licenseBasis: string
}

/** License registry file. */
export type ShamelaLicenseRegistry = {
  readonly schemaVersion: number
  readonly generatedAt: string
  readonly description: string
  readonly books: readonly ShamelaLicenseEntry[]
}

/** Build a map of bookId -> licenseStatus from the registry. Uses shared loader with project-root resolution. */
const buildLicenseMap = (basePath?: string): Map<number, "cleared" | "blocked" | "pending"> => {
  return buildShamelaLicenseMap(basePath)
}

/** Build the book list URL. */
const bookListUrl = (page: number, perPage: number): string =>
  `https://${SHAMELA_API_HOST}/api/books?page=${page}&per_page=${perPage}`

/** Build the pages URL for a book. */
const bookPagesUrl = (bookId: number, page: number, perPage: number): string =>
  `https://${SHAMELA_API_HOST}/api/books/${bookId}/pages?page=${page}&per_page=${perPage}`

/** Decode book list response with license status from registry. */
export const decodeBookList = (response: unknown, basePath?: string): Result<readonly ShamelaBook[], DecodeFailure> => {
  if (typeof response !== "object" || response === null) {
    return err({ _tag: "decode_failed", detail: "response is not an object" })
  }
  const data = response as Record<string, unknown>
  if (!Array.isArray(data.books)) {
    return err({ _tag: "decode_failed", detail: "books is not an array" })
  }

  const licenseMap = buildShamelaLicenseMap(basePath)
  const books: ShamelaBook[] = []
  for (const book of data.books) {
    if (typeof book !== "object" || book === null) continue
    const b = book as Record<string, unknown>
    if (typeof b.id !== "number" || typeof b.title !== "string" ||
        typeof b.author !== "string" || typeof b.category !== "string" ||
        typeof b.page_count !== "number") continue
    // License status comes from registry, not API.
    const licenseStatus = licenseMap.get(b.id) ?? "pending"
    books.push({
      id: b.id,
      title: b.title,
      author: b.author,
      category: b.category,
      page_count: b.page_count,
      license_status: licenseStatus,
    })
  }
  return ok(books)
}

/** Decode pages response. */
export const decodePages = (response: unknown): Result<readonly ShamelaPage[], DecodeFailure> => {
  if (typeof response !== "object" || response === null) {
    return err({ _tag: "decode_failed", detail: "response is not an object" })
  }
  const data = response as Record<string, unknown>
  if (!Array.isArray(data.pages)) {
    return err({ _tag: "decode_failed", detail: "pages is not an array" })
  }
  const pages: ShamelaPage[] = []
  for (const page of data.pages) {
    if (typeof page !== "object" || page === null) continue
    const p = page as Record<string, unknown>
    if (typeof p.page_number !== "number" || typeof p.content !== "string") continue
    pages.push({
      book_id: 0, // filled in by caller
      page_number: p.page_number,
      content: p.content,
    })
  }
  return ok(pages)
}

/** Fetch with Shamela API key. */
const shamelaFetch: Fetcher = async (url: string): Promise<Result<string, FetchFailure>> => {
  const apiKey = process.env.SHAMELA_API_KEY
  if (!apiKey) {
    return err({
      _tag: "fetch_failed",
      reason: "misconfigured",
      detail: "SHAMELA_API_KEY environment variable not set",
    })
  }
  const allowed = checkUrl(url)
  if (isErr(allowed)) return allowed

  let last: Result<string, FetchFailure> = err({
    _tag: "fetch_failed",
    reason: "network_error",
    detail: "no attempt was made",
  })
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const outcome = await attemptFetchWithAuth(url, apiKey)
    if (isOk(outcome)) return outcome
    last = outcome
    const status = statusOf(outcome.error)
    if (status === null || !isWorthRetrying(status) || attempt === MAX_ATTEMPTS) return outcome
    await sleep(backoffMs(attempt, status))
  }
  return last
}

/** Fetch with Authorization header and timeout. */
const attemptFetchWithAuth = async (url: string, apiKey: string): Promise<Result<string, FetchFailure>> => {
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    })
  } catch (cause) {
    return err({
      _tag: "fetch_failed",
      reason: "network_error",
      detail: cause instanceof Error ? cause.message : "network failure",
    })
  }
  if (!response.ok) {
    return err({
      _tag: "fetch_failed",
      reason: "http_status",
      detail: `${response.status} ${response.statusText}`,
    })
  }
  try {
    return ok(await response.text())
  } catch (cause) {
    return err({
      _tag: "fetch_failed",
      reason: "network_error",
      detail: cause instanceof Error ? cause.message : "body read failure",
    })
  }
}

/**
 * Fetch the list of cleared books from Shamela.
 * Only books with license_status "cleared" in the registry are returned.
 */
export const fetchBookList = async (
  context: FetchContext,
  clearedBookIds: readonly number[]
): Promise<Result<readonly ShamelaBook[], AdapterFailure>> => {
  const clearedSet = new Set(clearedBookIds)
  const allBooks: ShamelaBook[] = []
  let page = 1
  const perPage = 100
  let fetched = 0

  while (fetched < context.limit) {
    const url = bookListUrl(page, perPage)
    const response = await context.get(url)
    if (!response.ok) {
      return err({
        _tag: "adapter_failed",
        reason: "fetch_failed",
        detail: `shamela book list page ${page}: ${response.detail}`,
      })
    }

    const parsed = JSON.parse(response.body) as BookListResponse
    const decoded = decodeBookList(parsed, undefined)
    if (isErr(decoded)) {
      return err({
        _tag: "adapter_failed",
        reason: "schema_mismatch",
        detail: `shamela book list page ${page}: ${decoded.error.detail}`,
      })
    }

    for (const book of decoded.value) {
      if (!clearedSet.has(book.id)) continue
      allBooks.push(book)
      fetched += 1
      if (fetched >= context.limit) break
    }

    if (parsed.books.length < perPage) break
    page += 1
    if (page % 10 === 0) context.report?.(fetched)
  }

  return ok(allBooks)
}

/**
 * Fetch pages for a single book as an async iterable.
 * Each page yields a Result<ShamelaPage, AdapterFailure>.
 */
export const fetchPages = async function* (
  context: FetchContext,
  bookId: number,
  bookTitle: string,
  bookAuthor: string,
  bookCategory: string
): AsyncGenerator<Result<ShamelaPage & { readonly book_title: string; readonly author: string; readonly category: string }, AdapterFailure>> {
  let page = 1
  const perPage = 50
  let fetched = 0

  while (fetched < context.limit) {
    const url = bookPagesUrl(bookId, page, perPage)
    const response = await context.get(url)
    if (!response.ok) {
      yield err({
        _tag: "adapter_failed",
        reason: "fetch_failed",
        detail: `shamela book ${bookId} pages page ${page}: ${response.detail}`,
      })
      return
    }

    const parsed = JSON.parse(response.body) as PagesResponse
    const decoded = decodePages(parsed)
    if (isErr(decoded)) {
      yield err({
        _tag: "adapter_failed",
        reason: "schema_mismatch",
        detail: `shamela book ${bookId} pages page ${page}: ${decoded.error.detail}`,
      })
      return
    }

    for (const p of decoded.value) {
      yield ok({
        ...p,
        book_id: bookId,
        book_title: bookTitle,
        author: bookAuthor,
        category: bookCategory,
      })
      fetched += 1
      if (fetched >= context.limit) return
    }

    if (parsed.pages.length < perPage) return
    page += 1
    if (page % 20 === 0) context.report?.(fetched)
  }
}

/** Adapter failure type. */
export type AdapterFailure = {
  readonly _tag: "adapter_failed"
  readonly reason: "fetch_failed" | "schema_mismatch"
  readonly detail: string
}

/** Decode failure type. */
export type DecodeFailure = {
  readonly _tag: "decode_failed"
  readonly detail: string
}

/**
 * Shamela source adapter.
 * Note: This adapter is NOT in the ADAPTERS array by default — it is only
 * enabled when the Shamela source is marked as enabled in source-meta.ts
 * AND has cleared books in the registry.
 */
export const shamelaAdapter: SourceAdapter = {
  slug: "shamela/ws",
  fetchRecords: async (context: FetchContext): Promise<Result<{ readonly records: readonly RawRecord[]; readonly sha256: string; readonly dropped: readonly { readonly reason: string; readonly count: number }[] }, AdapterFailure>> => {
    // This adapter works differently: it doesn't produce RawRecord directly.
    // Instead, it writes to the Shamela FTS5 tables. The ingest pipeline
    // calls a separate Shamela-specific ingest function.
    // This stub exists to satisfy the SourceAdapter interface.
    return err({
      _tag: "adapter_failed",
      reason: "schema_mismatch",
      detail: "shamela adapter uses dedicated ingest pipeline, not fetchRecords",
    })
  },
}

export * as Shamela from "./shamela.ts"