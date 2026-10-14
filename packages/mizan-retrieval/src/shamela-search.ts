import type { Database } from "bun:sqlite"
import { isOk, ok, type Result, type RetrievalError } from "@mizan/core"
import { fuse, type FusedHit, type RankedList } from "./rrf.ts"
import { broadExpression, phraseExpression, prefixExpression, prepareQuery, expressionsFor, cleanLimit, RECENT } from "./search-common.ts"
import type { CorpusScope, Query, RankedChunk, SearchResult } from "./schema.ts"
import { search } from "./search.ts"
import {
  fuseWithWeights,
  toShamelaChunks,
  type UnifiedSearchResult,
  type RetrievalWeights,
  DEFAULT_RETRIEVAL_WEIGHTS,
} from "./fusion.ts"

/**
 * Shamela-specific lexical search over the FTS5 index.
 *
 * This module searches the `shamela_pages` FTS5 table directly, returning
 * metadata-only results (no corpus text). The results can be fused with
 * Quran and Hadith results via RRF in `searchAllCollections`.
 */

/** One row from shamela_pages, as the FTS join needs it. */
type ShamelaFtsRow = { readonly id: number }

/** Rank Shamela pages by BM25. */
export const shamelaBm25Order = (db: Database, expression: string, take: number, bookId?: number): readonly string[] => {
  let sql: string
  let bindings: (string | number)[]

  if (bookId !== undefined) {
    sql = `
      SELECT rowid AS id FROM shamela_pages
      WHERE shamela_pages MATCH ? AND book_id = ?
      ORDER BY bm25(shamela_pages) ASC, rowid ASC
      LIMIT ?
    `
    bindings = [expression, bookId, take]
  } else {
    sql = `
      SELECT rowid AS id FROM shamela_pages
      WHERE shamela_pages MATCH ?
      ORDER BY bm25(shamela_pages) ASC, rowid ASC
      LIMIT ?
    `
    bindings = [expression, take]
  }

  return db
    .query<{ readonly id: number }, (string | number)[]>(sql)
    .all(...bindings)
    .map((row) => String(row.id))
}

/**
 * Search Shamela pages only.
 */
export const searchShamela = (db: Database, query: Query, bookId?: number): Result<SearchResult, RetrievalError> => {
  const prepared = prepareQuery(query.text)
  if (!isOk(prepared)) return prepared
  const take = cleanLimit(query.limit)
  const passes = expressionsFor(prepared.value, "shamela")

  const lists: RankedList[] = []
  for (const pass of passes) {
    const ids = shamelaBm25Order(db, pass.expression, RECENT, bookId)
    if (ids.length > 0) lists.push({ name: pass.name, ids })
  }

  const hits = fuse(lists)
  const top = hits.slice(0, take)
  return ok({
    chunks: toShamelaChunks(db, top),
    count: Math.min(hits.length, take),
    ranking: lists.length > 1 ? "fused" : "unavailable",
  })
}

/**
 * Search all collections and fuse via RRF with weights.
 * Returns metadata-only unified results.
 */
export const searchAllCollections = (
  db: Database,
  query: Query,
  weights: RetrievalWeights = DEFAULT_RETRIEVAL_WEIGHTS,
  limit: number = 20
): readonly UnifiedSearchResult[] => {
  // Search each collection independently
  const quranQuery: Query = { ...query, scope: "quran" }
  const hadithQuery: Query = { ...query, scope: "hadith" }
  const shamelaQuery: Query = { ...query, scope: "any" }

  const quranResult = search(db, quranQuery)
  const hadithResult = search(db, hadithQuery)
  const shamelaResult = searchShamela(db, shamelaQuery)

  // Collect all hits with weights
  type WeightedHit = {
    readonly hit: FusedHit
    readonly weight: number
    readonly collection: "quran" | "hadith" | "shamela"
  }

  const allHits: WeightedHit[] = []

  if (isOk(quranResult)) {
    for (const chunk of quranResult.value.chunks) {
      allHits.push({
        hit: { id: chunk.id, score: chunk.score, ranks: { quran: chunk.rank + 1 } },
        weight: weights.quran,
        collection: "quran",
      })
    }
  }

  if (isOk(hadithResult)) {
    for (const chunk of hadithResult.value.chunks) {
      allHits.push({
        hit: { id: chunk.id, score: chunk.score, ranks: { hadith: chunk.rank + 1 } },
        weight: weights.hadith,
        collection: "hadith",
      })
    }
  }

  if (isOk(shamelaResult)) {
    for (const chunk of shamelaResult.value.chunks) {
      allHits.push({
        hit: { id: chunk.id, score: chunk.score, ranks: { shamela: chunk.rank + 1 } },
        weight: weights.shamela,
        collection: "shamela",
      })
    }
  }

  // Fuse with weights applied to scores using shared fusion logic
  const fused = fuseWithWeights(db, allHits)
  return fused.slice(0, limit)
}

/** Shamela search row from database query. */
export type ShamelaSearchRow = {
  readonly book_id: number
  readonly page_number: number
  readonly book_title: string
  readonly author: string
  readonly category: string
  readonly snippet: string
  readonly source_hash: string
}

/** Shamela search result for direct FTS5 queries. */
export type ShamelaSearchResult = {
  readonly bookId: number
  readonly pageNumber: number
  readonly bookTitle: string
  readonly author: string
  readonly category: string
  readonly snippet: string
  readonly sourceHash: string
}

export * as ShamelaSearch from "./shamela-search.ts"