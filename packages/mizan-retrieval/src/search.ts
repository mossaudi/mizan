import type { Database } from "bun:sqlite"
import { isOk, ok, type Result, type RetrievalError } from "@mizan/core"
import { fuse, type FusedHit, type RankedList } from "./rrf.ts"
import { broadExpression, phraseExpression, prefixExpression, prepareQuery } from "./query.ts"
import type { Query, RankedChunk, SearchResult } from "./schema.ts"

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

/** Ranks a document that no ranker returned must not outrank one that did. */
const DEFAULT_LIMIT = 8
const MAX_LIMIT = 32

const RECENT = 1_000

const cleanLimit = (limit: number | undefined): number => {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT)
}

/**
 * The recall pass: the OR of the query tokens, ranked by FTS5's BM25.
 *
 * `bm25()` returns NEGATIVE numbers, more negative meaning a better match, so ascending order is
 * best-first. Only the ordering is consumed — the magnitude is never compared across rankers.
 */
export const bm25Order = (db: Database, expression: string, collection: string | undefined, take: number): readonly string[] => {
  const sql = `SELECT f.recordId AS id FROM records_fts f JOIN records r ON r.id = f.recordId
     WHERE records_fts MATCH ? AND (? IS NULL OR r.collection = ?)
     ORDER BY bm25(records_fts) ASC, f.recordId ASC LIMIT ?`
  const bindings: [string, string | null, string | null, number] = [expression, collection ?? null, collection ?? null, take]
  return db
    .query<FtsRow, [string, string | null, string | null, number]>(sql)
    .all(...bindings)
    .map((row) => row.id)
}

/**
 * The distinct rank passes a query of this shape actually produces.
 *
 * Passes are deduplicated on their EXPRESSION, and the prefix pass is always included.
 *
 * Dropping the prefix pass for a single-token query is the tempting micro-optimisation, and it is
 * backwards: a one-word question is the case that needs it most. Arabic inflection means "مسجد"
 * has to reach the token in "مسجدا", and only the prefix pass can do that — the OR and phrase
 * passes both fail on it. The prefix pass is the sole recall mechanism for single words.
 *
 * Deduplication is the other half. With one token the OR and phrase expressions are byte-identical,
 * so fusing them as if they were two independent rankers would double-count a single opinion and
 * inflate every score, making a weak match look like a strong one. RRF is only meaningful over
 * genuinely different opinions.
 *
 * Exported for the test that pins both properties, because both are invisible from the outside:
 * a doubled pass and a missing one both look like "results came back".
 */
export const expressionsFor = (tokens: readonly string[]): readonly { readonly name: string; readonly expression: string }[] => {
  const candidates = [
    { name: "bm25_or", expression: broadExpression(tokens) },
    { name: "phrase", expression: phraseExpression(tokens) },
    { name: "prefix", expression: prefixExpression(tokens) },
  ]
  const seen = new Set<string>()
  return candidates.filter((pass) => {
    if (seen.has(pass.expression)) return false
    seen.add(pass.expression)
    return true
  })
}

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

/** Attach the metadata a citation needs, and never anything the ranker has no business carrying. */
const toChunks = (db: Database, hits: readonly FusedHit[]): readonly RankedChunk[] => {
  // An empty `IN ()` is a SQL syntax error, so the empty case returns before a query is built.
  if (hits.length === 0) return []
  const ids = hits.map((hit) => hit.id)
  const placeholders = ids.map(() => "?").join(", ")
  const rows = db.query<ChunkRow, string[]>(`SELECT ${CHUNK_COLUMNS} FROM records WHERE id IN (${placeholders})`).all(...ids)
  const byId = new Map(rows.map((row) => [row.id, row]))

  return hits.flatMap((hit, index) => {
    const row = byId.get(hit.id)
    if (row === undefined) return []
    return [
      {
        id: row.id,
        collection: row.collection,
        number: row.number,
        rank: index,
        score: hit.score,
        grade: row.grade,
        // `=== 1` rather than `Boolean(...)`: a corrupt row would otherwise silently read as
        // "applicable" by way of being truthy, which is a grade we did not earn.
        gradeApplicable: row.gradeApplicable === 1,
        gradeSource: row.gradeSource,
        attribution: row.attribution,
        license: row.license,
        sourceUrl: row.sourceUrl,
      },
    ]
  })
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
  const passes = expressionsFor(prepared.value)

  const lists: RankedList[] = []
  for (const pass of passes) {
    const ids = bm25Order(db, pass.expression, query.collection, RECENT)
    if (ids.length > 0) lists.push({ name: pass.name, ids })
  }

  const hits = fuse(lists)
  const top = hits.slice(0, take)
  return ok({
    chunks: toChunks(db, top),
    count: Math.min(hits.length, take),
    ranking: lists.length > 1 ? "fused" : "unavailable",
  })
}

export * as Search from "./search.ts"
