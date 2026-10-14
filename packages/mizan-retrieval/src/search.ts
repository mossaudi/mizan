import type { Database } from "bun:sqlite"
import { isOk, ok, QURAN_COLLECTION, type Result, type RetrievalError } from "@mizan/core"
import { fuse, type FusedHit, type RankedList } from "./rrf.ts"
import { broadExpression, phraseExpression, prefixExpression, prepareQuery, expressionsFor, cleanLimit, RECENT, scopeSql, DEFAULT_LIMIT, MAX_LIMIT } from "./search-common.ts"
import type { CorpusScope, Query, RankedChunk, SearchResult } from "./schema.ts"
import { searchShamela } from "./shamela-search.ts"
import {
  fuseWithWeights,
  getHitMetadata,
  toRecordChunks,
  type UnifiedSearchResult,
  type RetrievalWeights,
  DEFAULT_RETRIEVAL_WEIGHTS,
} from "./fusion.ts"

/**
 * The two lexical rankers and their fusion.
 *
 * Both rankers read the SAME FTS5 index, whose body column is the pre-folded `textMatch`. That
 * is deliberate: retrieval and verification then agree on what the text is, so the retriever
 * cannot surface a record the verifier will go on to reject for a folding mismatch.
 *
 * Neither ranker scores text directly and neither computes a similarity. A ranker's only output
 * is an ORDERED LIST OF IDS, and `fuse` combines positions. There is no threshold to tune, no
 * score to calibrate, and no path by which "close enough" can enter — the similarity question is
 * simply not asked here. It is asked once, later, by the verifier, and the verifier only accepts
 * exact containment.
 */

/** One row of `records`, as the FTS join needs it. */
type FtsRow = { readonly id: string }

/** Everything a citation needs about a hit, and nothing the ranker has no business carrying. */
type ChunkRow = {
  readonly id: string
  readonly collection: string
  readonly number: string | null
  readonly grade: string | null
  /** SQLite has no boolean type: this arrives as the INTEGER 0 or 1 that ingest wrote. */
  readonly gradeApplicable: number
  readonly gradeSource: string
  readonly attribution: string
  readonly license: string
  readonly sourceUrl: string
}

const CHUNK_COLUMNS = "id, collection, number, grade, gradeApplicable, gradeSource, attribution, license, sourceUrl"

/**
 * The recall pass: the OR of the query tokens, ranked by FTS5's BM25.
 *
 * `bm25()` returns NEGATIVE numbers, more negative meaning a better match, so ascending order is
 * best-first. Only the ordering is consumed — the magnitude is never compared across rankers.
 */
export const bm25Order = (db: Database, expression: string, scope: CorpusScope | undefined, take: number): readonly string[] => {
  const filter = scopeSql(scope ?? "any")
  const sql = `SELECT f.recordId AS id FROM records_fts f JOIN records r ON r.id = f.recordId
     WHERE records_fts MATCH ? AND (${filter.predicate})
     ORDER BY bm25(records_fts) ASC, f.recordId ASC LIMIT ?`
  const bindings: [string, ...string[], number] = [expression, ...filter.bindings, take]
  return db
    .query<FtsRow, (string | number)[]>(sql)
    .all(...bindings)
    .map((row) => row.id)
}

/**
 * Run every pass, fuse, and report honestly which passes contributed.
 *
 * `ranking: "unavailable"` when only ONE pass produced hits: the ordering is then a single
 * ranker's opinion and the caller is entitled to know that before it builds a prompt on it.
 */
export const search = (db: Database, query: Query): Result<SearchResult, RetrievalError> => {
  const prepared = prepareQuery(query.text)
  if (!isOk(prepared)) return prepared
  const take = cleanLimit(query.limit)
  const passes = expressionsFor(prepared.value, "bm25")

  const lists: RankedList[] = []
  for (const pass of passes) {
    const ids = bm25Order(db, pass.expression, query.scope, RECENT)
    if (ids.length > 0) lists.push({ name: pass.name, ids })
  }

  const hits = fuse(lists)
  const top = hits.slice(0, take)
  return ok({
    chunks: toRecordChunks(db, top),
    count: Math.min(hits.length, take),
    ranking: lists.length > 1 ? "fused" : "unavailable",
  })
}

/** Exported for the test that pins the distinct pass count. */
export { expressionsFor } from "./search-common.ts"

export * as Search from "./search.ts"
