import type { Database } from "bun:sqlite"
import { fuse, type FusedHit, type RankedList } from "./rrf.ts"
import type { RankedChunk } from "./schema.ts"

/**
 * Shared fusion logic for cross-collection search.
 *
 * This module consolidates the weighted RRF fusion that was previously
 * duplicated between search.ts and shamela-search.ts.
 */

/** Hit with weight and collection metadata for fusion. */
export type WeightedHit = {
  readonly hit: FusedHit
  readonly weight: number
  readonly collection: "quran" | "hadith" | "shamela"
}

/** Unified search result with metadata only (no corpus text). */
export type UnifiedSearchResult = {
  readonly collection: "quran" | "hadith" | "shamela"
  readonly ref: string
  readonly score: number
  readonly snippet: string
  readonly sourceHash: string
}

/** Default retrieval weights for RRF fusion. */
export type RetrievalWeights = {
  readonly quran: number
  readonly hadith: number
  readonly shamela: number
}

export const DEFAULT_RETRIEVAL_WEIGHTS: Readonly<RetrievalWeights> = {
  quran: 1.0,
  hadith: 1.0,
  shamela: 0.8,
} as const

/** Shamela chunk row from FTS5. */
type ShamelaChunkRow = {
  readonly rowid: number
  readonly book_id: number
  readonly page_number: number
  readonly book_title: string
  readonly author: string
  readonly category: string
  readonly source_hash: string
}

/** Quran/Hadith record row. */
type RecordChunkRow = {
  readonly id: string
  readonly number: string | null
  readonly sourceUrl: string
}

/** Metadata columns for Shamela. */
const SHAMELA_CHUNK_COLUMNS = "rowid, book_id, page_number, book_title, author, category, source_hash"

/** Metadata columns for Quran/Hadith. */
const RECORD_CHUNK_COLUMNS = "id, number, sourceUrl"

/**
 * Fetch metadata for a hit from the appropriate table.
 */
export const getHitMetadata = (
  db: Database,
  collection: string,
  id: string
): { ref: string; snippet: string; sourceHash: string } | null => {
  if (collection === "shamela") {
    const row = db.query<ShamelaChunkRow, [string]>(
      `SELECT book_id, page_number, book_title, author, category, source_hash FROM shamela_pages WHERE rowid = ?`
    ).get(id)
    if (!row) return null
    return {
      ref: `${row.book_id}:${row.page_number}`,
      snippet: `${row.book_title} — ${row.author} (${row.category})`,
      sourceHash: row.source_hash,
    }
  } else {
    const row = db.query<RecordChunkRow, [string]>(
      `SELECT id, number, sourceUrl FROM records WHERE id = ?`
    ).get(id)
    if (!row) return null
    return {
      ref: row.number ?? row.id,
      snippet: row.sourceUrl,
      sourceHash: row.id,
    }
  }
}

/**
 * Fuse hits from multiple collections with weights applied.
 *
 * This is the single source of truth for weighted cross-collection fusion.
 * Previously duplicated in search.ts and shamela-search.ts.
 */
export const fuseWithWeights = (
  db: Database,
  hits: readonly WeightedHit[]
): readonly UnifiedSearchResult[] => {
  // Group by collection and apply RRF within each, then merge with weights
  const byCollection = new Map<string, WeightedHit[]>()
  for (const h of hits) {
    const arr = byCollection.get(h.collection) ?? []
    arr.push(h)
    byCollection.set(h.collection, arr)
  }

  const fusedByCollection: UnifiedSearchResult[] = []

  for (const [collection, collectionHits] of byCollection) {
    // RRF within collection
    const lists: RankedList[] = [{
      name: collection,
      ids: collectionHits.map((h) => h.hit.id),
    }]
    const fused = fuse(lists)
    for (const f of fused) {
      const original = collectionHits.find((h) => h.hit.id === f.id)
      if (original) {
        const meta = getHitMetadata(db, original.collection, f.id)
        if (meta) {
          fusedByCollection.push({
            collection: collection as "quran" | "hadith" | "shamela",
            ref: meta.ref,
            score: f.score * original.weight,
            snippet: meta.snippet,
            sourceHash: meta.sourceHash,
          })
        }
      }
    }
  }

  return fusedByCollection
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
}

/**
 * Convert Shamela FTS5 hits to RankedChunk for single-collection search.
 */
export const toShamelaChunks = (
  db: Database,
  hits: readonly FusedHit[]
): readonly RankedChunk[] => {
  if (hits.length === 0) return []
  const ids = hits.map((hit) => hit.id)
  const placeholders = ids.map(() => "?").join(", ")
  const rows = db.query<ShamelaChunkRow, string[]>(
    `SELECT ${SHAMELA_CHUNK_COLUMNS} FROM shamela_pages WHERE rowid IN (${placeholders})`
  ).all(...ids)
  const byId = new Map(rows.map((row) => [String(row.rowid), row]))

  return hits.flatMap((hit, index) => {
    const row = byId.get(hit.id)
    if (row === undefined) return []
    return [
      {
        id: hit.id,
        collection: "shamela" as const,
        number: `${row.book_id}:${row.page_number}`,
        rank: index,
        score: hit.score,
        grade: null,
        gradeApplicable: false,
        gradeSource: "shamela/ws",
        attribution: `${row.book_title} — ${row.author} (${row.category})`,
        license: "content-only (verified per-book)",
        sourceUrl: `https://shamela.ws/book/${row.book_id}/${row.page_number}`,
        sourceHash: row.source_hash,
      },
    ]
  })
}

/**
 * Convert Quran/Hadith FTS5 hits to RankedChunk.
 * (Previously `toChunks` in search.ts)
 */
export const toRecordChunks = (
  db: Database,
  hits: readonly FusedHit[]
): readonly RankedChunk[] => {
  if (hits.length === 0) return []
  const ids = hits.map((hit) => hit.id)
  const placeholders = ids.map(() => "?").join(", ")
  const rows = db.query<RecordChunkRow & {
    readonly collection: string
    readonly grade: string | null
    readonly gradeApplicable: number
    readonly gradeSource: string
    readonly attribution: string
    readonly license: string
  }, string[]>(`SELECT id, collection, number, grade, gradeApplicable, gradeSource, attribution, license, sourceUrl FROM records WHERE id IN (${placeholders})`).all(...ids)
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
        gradeApplicable: row.gradeApplicable === 1,
        gradeSource: row.gradeSource,
        attribution: row.attribution,
        license: row.license,
        sourceUrl: row.sourceUrl,
        sourceHash: row.id,
      },
    ]
  })
}

export * as Fusion from "./fusion.ts"