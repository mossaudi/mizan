import { err, isErr, isOk, ok, sha256Hex, type Result } from "@mizan/core"
import { Database } from "bun:sqlite"
import { search, searchShamela, searchAllCollections, fuseWithWeights, type UnifiedSearchResult, DEFAULT_RETRIEVAL_WEIGHTS, type RetrievalWeights, type RankedChunk } from "@mizan/retrieval"
import type { McpTool, McpToolResult } from "../server.ts"

/**
 * Shamela MCP tools for agentic evidence seeking.
 *
 * These tools allow an AI agent to iteratively search and read Shamela content
 * during article verification, enabling multi-hop evidence gathering.
 *
 * ## Tools
 *
 * 1. `search_shamela` — Search Shamela pages by query, optionally scoped to a book
 * 2. `read_shamela_page` — Read a specific page from a Shamela book
 *
 * ## Security
 *
 * - All inputs validated at schema boundary
 * - Results are metadata-only (no full corpus text in logs)
 * - Traces carry questionHash only (AGENTS.md §13)
 * - Read-only: no write operations
 * - Rate limited per tool to prevent abuse
 */

const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 100 // max requests per window per tool

interface RateLimitEntry {
  timestamps: number[]
}

const rateLimitStore = new Map<string, RateLimitEntry>()

/** Check and record a request for rate limiting. Returns true if allowed, false if rate limited. */
const checkRateLimit = (toolName: string): boolean => {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS

  const entry = rateLimitStore.get(toolName) ?? { timestamps: [] }
  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }

  entry.timestamps.push(now)
  rateLimitStore.set(toolName, entry)
  return true
}

/** Reset rate limit state (for testing). */
export const resetShamelaRateLimit = (): void => {
  rateLimitStore.clear()
}

const SHAMELA_SEARCH_TOOL: McpTool = {
  name: "search_shamela",
  description:
    "Search Shamela classical Arabic literature corpus. Returns ranked results with book title, author, page number, and snippet. Use for finding relevant passages in tafsir, fiqh, history, and literature.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query in Arabic" },
      bookId: { type: ["number", "null"], description: "Optional book ID to scope search" },
      limit: { type: ["number", "null"], description: "Maximum results (default 10, max 50)" },
      weights: {
        type: ["object", "null"],
        description: "Optional retrieval weights for cross-collection fusion",
        properties: {
          quran: { type: "number" },
          hadith: { type: "number" },
          shamela: { type: "number" },
        },
      },
    },
    required: ["query"],
  },
}

const READ_SHAMELA_PAGE_TOOL: McpTool = {
  name: "read_shamela_page",
  description:
    "Read metadata for a specific page from a Shamela book. Returns book title, author, category, page number, and content hash (not the full text). Use after search_shamela to identify a specific passage for verification.",
  inputSchema: {
    type: "object",
    properties: {
      bookId: { type: "number", description: "Shamela book ID" },
      pageNumber: { type: "number", description: "Page number within the book" },
    },
    required: ["bookId", "pageNumber"],
  },
}

export const SHAMELA_TOOLS: readonly [McpTool, McpTool] = [SHAMELA_SEARCH_TOOL, READ_SHAMELA_PAGE_TOOL]

const MAX_SEARCH_LIMIT = 50
const DEFAULT_SEARCH_LIMIT = 10

/** Validate search_shamela arguments. */
const validateSearchArgs = (args: unknown): { query: string; bookId?: number; limit: number; weights?: RetrievalWeights } | { error: string } => {
  if (typeof args !== "object" || args === null) return { error: "arguments must be an object" }
  const fields = args as Record<string, unknown>

  const query = fields["query"]
  if (typeof query !== "string" || query.trim().length === 0) {
    return { error: "query is required and must be a non-empty string" }
  }
  if (query.length > 500) {
    return { error: "query must be at most 500 characters" }
  }

  const bookId = fields["bookId"]
  let parsedBookId: number | undefined
  if (bookId !== undefined && bookId !== null) {
    if (typeof bookId !== "number" || !Number.isInteger(bookId) || bookId <= 0) {
      return { error: "bookId must be a positive integer" }
    }
    parsedBookId = bookId
  }

  const limit = fields["limit"]
  let parsedLimit = DEFAULT_SEARCH_LIMIT
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== "number" || !Number.isFinite(limit)) {
      return { error: "limit must be a finite number" }
    }
    const truncated = Math.trunc(limit)
    if (truncated < 1) {
      return { error: "limit must be at least 1" }
    }
    parsedLimit = Math.min(truncated, MAX_SEARCH_LIMIT)
  }

  const weights = fields["weights"]
  let parsedWeights: RetrievalWeights | undefined
  if (weights !== undefined && weights !== null) {
    if (typeof weights !== "object" || weights === null) {
      return { error: "weights must be an object" }
    }
    const w = weights as Record<string, unknown>
    const validateWeight = (value: unknown, defaultValue: number): number => {
      if (typeof value !== "number" || !Number.isFinite(value)) return defaultValue
      if (value < 0) return defaultValue
      if (value > 10) return defaultValue // Reasonable upper bound
      return value
    }
    parsedWeights = {
      quran: validateWeight(w.quran, DEFAULT_RETRIEVAL_WEIGHTS.quran),
      hadith: validateWeight(w.hadith, DEFAULT_RETRIEVAL_WEIGHTS.hadith),
      shamela: validateWeight(w.shamela, DEFAULT_RETRIEVAL_WEIGHTS.shamela),
    }
  }

  return { query: query.trim(), bookId: parsedBookId, limit: parsedLimit, weights: parsedWeights }
}

/** Validate read_shamela_page arguments. */
const validateReadArgs = (args: unknown): { bookId: number; pageNumber: number } | { error: string } => {
  if (typeof args !== "object" || args === null) return { error: "arguments must be an object" }
  const fields = args as Record<string, unknown>

  const bookId = fields["bookId"]
  if (typeof bookId !== "number" || !Number.isInteger(bookId) || bookId <= 0) {
    return { error: "bookId is required and must be a positive integer" }
  }

  const pageNumber = fields["pageNumber"]
  if (typeof pageNumber !== "number" || !Number.isInteger(pageNumber) || pageNumber <= 0) {
    return { error: "pageNumber is required and must be a positive integer" }
  }

  return { bookId, pageNumber }
}

/** Execute search_shamela tool. */
export const executeSearchShamela = (db: Database, args: unknown, questionHash: string): McpToolResult => {
  // Rate limiting
  if (!checkRateLimit("search_shamela")) {
    return toolError("rate_limited", "rate limit exceeded for search_shamela")
  }

  const validated = validateSearchArgs(args)
  if ("error" in validated) {
    return toolError("invalid_arguments", validated.error)
  }

  const { query, bookId, limit, weights } = validated

  try {
    let results: readonly UnifiedSearchResult[]

    if (weights !== undefined && bookId !== undefined) {
      // Cross-collection search with custom weights, scoped to a specific Shamela book
      // Use searchShamela directly with bookId for efficiency, then fuse with other collections
      const shamelaResults = searchShamela(db, { text: query, limit }, bookId)
      if (isErr(shamelaResults)) {
        return toToolError(shamelaResults.error)
      }
      const shamelaChunks = shamelaResults.value.chunks

      // Search other collections
      const quranResults = search(db, { text: query, scope: "quran", limit })
      const hadithResults = search(db, { text: query, scope: "hadith", limit })

      // Build weighted hits for fusion
      type WeightedHit = {
        readonly hit: { readonly id: string; readonly score: number; readonly ranks: Record<string, number> }
        readonly weight: number
        readonly collection: "quran" | "hadith" | "shamela"
      }

      const allHits: WeightedHit[] = []

      if (isOk(quranResults)) {
        for (const chunk of quranResults.value.chunks) {
          allHits.push({
            hit: { id: chunk.id, score: chunk.score, ranks: { quran: chunk.rank + 1 } },
            weight: weights.quran,
            collection: "quran",
          })
        }
      }

      if (isOk(hadithResults)) {
        for (const chunk of hadithResults.value.chunks) {
          allHits.push({
            hit: { id: chunk.id, score: chunk.score, ranks: { hadith: chunk.rank + 1 } },
            weight: weights.hadith,
            collection: "hadith",
          })
        }
      }

      for (const chunk of shamelaChunks) {
        allHits.push({
          hit: { id: chunk.id, score: chunk.score, ranks: { shamela: chunk.rank + 1 } },
          weight: weights.shamela,
          collection: "shamela",
        })
      }

      results = fuseWithWeights(db, allHits)
    } else if (weights !== undefined) {
      // Cross-collection search with custom weights (no bookId filter)
      results = searchAllCollections(db, { text: query, limit }, weights, limit)
    } else if (bookId !== undefined) {
      // Shamela-only search scoped to book
      const shamelaResults = searchShamela(db, { text: query, limit }, bookId)
      if (isErr(shamelaResults)) {
        return toToolError(shamelaResults.error)
      }
      results = shamelaResults.value.chunks.map((c) => toUnifiedResult(c))
    } else {
      // Shamela-only search across all books
      const shamelaResults = searchShamela(db, { text: query, limit })
      if (isErr(shamelaResults)) {
        return toToolError(shamelaResults.error)
      }
      results = shamelaResults.value.chunks.map((c) => toUnifiedResult(c))
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            questionHash,
            results: results.slice(0, limit),
            count: results.length,
          }),
        },
      ],
    }
  } catch (cause) {
    return toolError("shamela_unavailable", `unexpected error: ${cause instanceof Error ? cause.name : "unknown"}`)
  }
}

/** Convert Shamela SearchResult error to tool error. */
const toToolError = (error: unknown): McpToolResult => {
  const detail = typeof error === "object" && error !== null && "detail" in error
    ? String((error as Record<string, unknown>).detail)
    : "unknown error"
  return toolError("shamela_unavailable", `search failed: ${detail}`)
}

/** Convert Shamela RankedChunk to UnifiedSearchResult using chunk's sourceHash. */
const toUnifiedResult = (chunk: RankedChunk): UnifiedSearchResult => {
  return {
    collection: "shamela" as const,
    ref: chunk.number ?? chunk.id,
    score: chunk.score,
    snippet: chunk.attribution,
    sourceHash: chunk.sourceHash,
  }
}

/** Execute read_shamela_page tool. */
export const executeReadShamelaPage = (db: Database, args: unknown, questionHash: string): McpToolResult => {
  // Rate limiting
  if (!checkRateLimit("read_shamela_page")) {
    return toolError("rate_limited", "rate limit exceeded for read_shamela_page")
  }

  const validated = validateReadArgs(args)
  if ("error" in validated) {
    return toolError("invalid_arguments", validated.error)
  }

  const { bookId, pageNumber } = validated

  try {
    const row = db.query<ShamelaPageRow, [number, number]>(
      `SELECT source_hash, book_title, author, category FROM shamela_pages WHERE book_id = ? AND page_number = ?`
    ).get(bookId, pageNumber)

    if (row === undefined || row === null) {
      return toolError("not_found", `page ${pageNumber} not found in book ${bookId}`)
    }

    // Return the pre-computed source_hash (AGENTS.md §11, §13 - no corpus text in responses)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            questionHash,
            bookId,
            pageNumber,
            bookTitle: row.book_title,
            author: row.author,
            category: row.category,
            contentHash: row.source_hash,
            sourceHash: row.source_hash,
          }),
        },
      ],
    }
  } catch (cause) {
    return toolError("shamela_unavailable", `unexpected error: ${cause instanceof Error ? cause.name : "unknown"}`)
  }
}

type ShamelaPageRow = {
  readonly source_hash: string
  readonly book_title: string
  readonly author: string
  readonly category: string
}

const toolError = (reason: string, detail: string): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ error: { reason, detail } }) }],
  isError: true,
})

export * as ShamelaTools from "./shamela-tools.ts"