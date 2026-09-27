import { Database } from "bun:sqlite"
import { mkdirSync, rmSync } from "node:fs"
import { dirname } from "node:path"
import { canonicalJson, type CorpusRecord } from "@mizan/core"
import { computeSnapshotHash } from "./adapters/record.ts"

/**
 * The reproducible snapshot: one SQLite file, one FTS5 index, one hash.
 *
 * ## Why FTS5 indexes the FOLDED column
 *
 * This is the decision that makes Arabic retrieval work at all, and it was measured rather
 * than assumed. SQLite's `unicode61` tokenizer keeps diacritic marks INSIDE the token, so
 * `t.match '"الاعمال"'` against the diacriticized `ٱلْأَعْمَالُ` returns zero rows. Indexing
 * `textMatch` — the same folded string the verifier compares against — makes a folded query
 * find it, and it also means **retrieval and verification agree on what the text is**. One
 * fold, applied at ingest, used by both. A retriever that folded differently from the verifier
 * would surface records the verifier then rejects, and the product would look broken.
 *
 * The alternative — a custom tokenizer doing Arabic folding in C — was rejected: it moves a
 * correctness-critical rule out of a reviewed TypeScript module and into a build step.
 *
 * ## What makes it reproducible
 *
 * The file is written from scratch every ingest, in a fixed row order, with no timestamps and
 * no autoincrement counters, and the recorded `snapshotHash` is a digest over the RECORDS
 * rather than over the file. Two ingests of the same upstream bytes therefore produce the same
 * hash, which is the property a verdict report needs when it says "computed against this
 * snapshot".
 */

export const SNAPSHOT_SCHEMA_VERSION = "1"

/** Columns are explicit and ordered. A `SELECT *` in a verdict path would be a schema leak. */
const RECORD_COLUMNS = [
  "id",
  "collection",
  "number",
  "grade",
  "gradeApplicable",
  "gradeSource",
  "gradeBasis",
  "attribution",
  "license",
  "licenseUrl",
  "sourceUrl",
  "textDisplay",
  "textMatch",
  "translation",
] as const

const SCHEMA = `
CREATE TABLE records (
  id             TEXT PRIMARY KEY,
  collection     TEXT NOT NULL,
  number         TEXT,
  grade          TEXT,
  gradeApplicable INTEGER NOT NULL,
  gradeSource    TEXT NOT NULL,
  gradeBasis     TEXT NOT NULL,
  attribution    TEXT NOT NULL,
  license        TEXT NOT NULL,
  licenseUrl     TEXT NOT NULL,
  sourceUrl      TEXT NOT NULL,
  textDisplay    TEXT NOT NULL,
  textMatch      TEXT NOT NULL,
  translation    TEXT
);
CREATE INDEX records_by_collection_number ON records (collection, number);
CREATE INDEX records_by_number ON records (number);
CREATE INDEX records_by_collection ON records (collection);
CREATE VIRTUAL TABLE records_fts USING fts5 (recordId UNINDEXED, body, tokenize='unicode61');
CREATE TABLE snapshot_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

export type Snapshot = {
  readonly path: string
  readonly snapshotHash: string
  readonly recordCount: number
  readonly collectionCounts: Readonly<Record<string, number>>
  close: () => void
}

const toRow = (record: CorpusRecord): readonly (string | number | null)[] => [
  record.id,
  record.collection,
  record.number,
  record.grade,
  record.gradeApplicable ? 1 : 0,
  record.gradeSource,
  record.gradeBasis,
  record.attribution,
  record.license,
  record.licenseUrl,
  record.sourceUrl,
  record.textDisplay,
  record.textMatch,
  record.translation ?? null,
]

const countByCollection = (records: readonly CorpusRecord[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const record of records) counts[record.collection] = (counts[record.collection] ?? 0) + 1
  return counts
}

/** Duplicate ids are a data defect, not something to resolve by "last write wins". */
export const findDuplicateIds = (records: readonly CorpusRecord[]): readonly string[] => {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const record of records) {
    if (seen.has(record.id)) duplicates.add(record.id)
    seen.add(record.id)
  }
  return [...duplicates].sort()
}

/**
 * Build the snapshot at `path`. Rows are written in sorted id order for a byte-stable file.
 *
 * The parent directory is created here rather than by the caller: this function owns the file
 * it writes, and a missing `data/` should not be a `SQLITE_CANTOPEN` that only shows up after
 * a forty-thousand-row fetch has already been paid for.
 */
export const buildSnapshot = (path: string, records: readonly CorpusRecord[]): Snapshot => {
  const duplicates = findDuplicateIds(records)
  if (duplicates.length > 0) {
    throw new Error(`duplicate record ids would make resolution ambiguous: ${duplicates.slice(0, 5).join(", ")}`)
  }

  mkdirSync(dirname(path), { recursive: true })
  // From scratch, as the header promises. Without this, a re-ingest dies on "table already
  // exists" — and a snapshot is not a database you may migrate: a file that carries rows from
  // two different ingests has no `snapshotHash` that means anything.
  rmSync(path, { force: true })
  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode = DELETE")
  db.exec(SCHEMA)

  const ordered = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const insert = db.prepare(
    `INSERT INTO records (${RECORD_COLUMNS.join(", ")}) VALUES (${RECORD_COLUMNS.map(() => "?").join(", ")})`,
  )
  const insertFts = db.prepare("INSERT INTO records_fts (recordId, body) VALUES (?, ?)")

  const writeAll = db.transaction((batch: readonly CorpusRecord[]) => {
    for (const record of batch) {
      insert.run(...toRow(record))
      // The FTS body is the FOLDED text. See the file header for why that is the whole point.
      insertFts.run(record.id, record.textMatch)
    }
  })

  // Batched so a 40k-row ingest is a few hundred transactions rather than 40 000.
  const BATCH = 500
  for (let start = 0; start < ordered.length; start += BATCH) {
    writeAll(ordered.slice(start, start + BATCH))
  }

  const snapshotHash = computeSnapshotHash(ordered)
  const meta = db.prepare("INSERT INTO snapshot_meta (key, value) VALUES (?, ?)")
  meta.run("schemaVersion", SNAPSHOT_SCHEMA_VERSION)
  meta.run("snapshotHash", snapshotHash)
  meta.run("recordCount", String(ordered.length))
  meta.run("collectionCounts", canonicalJson(countByCollection(ordered)))
  db.exec("ANALYZE")
  db.close()

  return {
    path,
    snapshotHash,
    recordCount: ordered.length,
    collectionCounts: countByCollection(ordered),
    close: () => undefined,
  }
}

/** Open an existing snapshot read-only. Read-only matters: a query must never mutate the corpus. */
export const openSnapshot = (path: string): Database => new Database(path, { readonly: true })

export const readSnapshotMeta = (db: Database): Readonly<Record<string, string>> => {
  const rows = db.query<{ readonly key: string; readonly value: string }, []>("SELECT key, value FROM snapshot_meta").all()
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export * as Snapshot from "./snapshot.ts"
