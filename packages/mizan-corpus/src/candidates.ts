import type { Database } from "bun:sqlite"
import { err, isOk, ok, type CorpusError, type CorpusRecord, type Result } from "@mizan/core"
import { MAX_TOP_K, MIN_SHARED_TRIGRAMS, openSearch, type ScannedNeighbour } from "@mizan/suggest"
import { CANDIDATE_COLUMNS, decodeRecordRow, recordSelect, rowId, type RawCandidateRow, type RawRow } from "./rows.ts"

/**
 * Reading the corpus for nearest-quote suggestions — I/O here, judgement nowhere.
 *
 * ## Why this module exists at all
 *
 * Two rules collide in this feature and only this file resolves them. The ranking must be pure
 * (`@mizan/verify`'s whole discipline, AGENTS.md §9), so it cannot open a database. The scan must
 * be honest, so it cannot be a heuristic dressed as a measurement. So the database read lives here,
 * in the corpus, and the judgement lives in `@mizan/suggest`, which sees nothing but strings.
 *
 * ## Why the scan is a STREAM and not `.all()`
 *
 * `SELECT ... FROM records` on the real snapshot is 27,234 rows and about four megabytes of text.
 * `.all()` materialises all of it as an array before the first comparison runs: the peak memory of
 * a display aid, held for the length of a scan, on every invocation, to produce at most five lines.
 * `.iterate()` holds one row at a time, so the scan's memory is one row regardless of corpus size
 * and the whole feature costs what a single indexed lookup should cost. This is the same discipline
 * `packages/mizan-retrieval/src/search.ts` applies to its bounded queries, and the reason
 * `considered` is a plain counter rather than `rows.length`.
 *
 * ## Why the floor is applied HERE, as a filter, and not only in the ranking
 *
 * Measured on the committed corpus: a Hadith quote shares at least one character 3-gram with
 * **26,655 of 27,234** records. Arabic is dense in short function-word trigrams — `ال`, `وا`, `من`
 * appear in nearly every text — so "shares something" is almost the whole corpus, and carrying those
 * rows costs about four seconds per scan, almost all of it spent building a trigram-type set for
 * records no floor could admit.
 *
 * So the scan takes the floor as a **parameter** and drops rows below it while streaming. This is not
 * the scan judging nearness: `MIN_SHARED_TRIGRAMS` is exported by `@mizan/suggest`, the caller passes
 * it, and `rankNeighbours` applies the very same floor again to what arrives — so the judgement is
 * still made in one place, and the scan only declines to *carry* rows that place has already
 * excluded. `considered` still counts every row read, so the number a reader is shown is unchanged.
 *
 * ## Why `ORDER BY id`
 *
 * It makes the scan's row order a property of the data rather than of the storage engine, which is
 * what lets the ranking be a pure function of a set. Nothing here depends on the order — the ranking
 * applies a total order afterwards — but an ordered stream means the same snapshot produces the same
 * intermediate list on every engine, so a surprising result is a data question and not a plan
 * question.
 *
 * ## Why a malformed row FAILS THE SCAN rather than being skipped
 *
 * Skipping a row that does not decode would shrink `considered`, and `considered` is printed. A
 * reader told "none of 27,234 records is near your quote" when the program quietly could not read
 * one of them has been told a falsehood in the exact place the feature exists to avoid. So the scan
 * stops and says `row_undecodable`, and the CLI prints `unavailable` (AGENTS.md §16). The error names
 * the row id and the schema failure — never the row's text, which is corpus content and belongs in
 * no log line (AGENTS.md §13).
 *
 * ## What is measured here and what is decided elsewhere
 *
 * `overlapOf` answers two questions per row — is the quote contained outright, and how many distinct
 * 3-gram types do they share — and is called once per row with the quote folded a single time. It
 * decides nothing about what to show: the order, the dedup and the cap all belong to `rankNeighbours`.
 * The floor is the one judgement this file *applies*, and it applies the floor `@mizan/suggest`
 * declares and the ranking re-checks, so a number cannot be loosened here and quietly honoured
 * downstream.
 */

/** What one scan of the corpus produced. */
export type SuggestionCandidateSource = {
  /** Rows read. Printed beside the suggestions, so the scope of the search is visible. */
  readonly considered: number
  /** Rows that cleared the caller's floor, or contained the quote outright, in no meaningful order yet. */
  readonly rows: readonly ScannedNeighbour[]
  /** The quote as the scan folded it, so the caller never folds it a second time. */
  readonly quoteFolded: string
}

/**
 * Open the candidate stream, turning a driver error into a typed failure.
 *
 * ## Why this cannot be left to the caller
 *
 * `db.query` throws when the table or a selected column does not exist, and `iterate` throws when a
 * row cannot be read. Both are ordinary outcomes here, not programming errors: the snapshot is a file
 * that may have been written by an older ingest, edited since the attestation was signed, or replaced
 * with something that is not a corpus at all. Letting that error escape would cross a package boundary
 * as a `throw`, which AGENTS.md §2 forbids, and it would reach the reader as a stack trace where the
 * product has exactly one honest sentence for it — `unavailable`, "we could not look" (AGENTS.md §16).
 *
 * The driver's message is deliberately dropped rather than carried in `detail`: it describes the
 * schema of the file we were handed, which is not the corpus text, the quote, or the row's identity,
 * and the failure names the one thing an operator can act on — that the columns a candidate scan reads
 * are not all there.
 */
const openCandidateStream = (db: Database): Result<Iterable<RawCandidateRow>, CorpusError> => {
  try {
    return ok(db.query<RawCandidateRow, []>(`SELECT ${CANDIDATE_COLUMNS} FROM records ORDER BY id`).iterate())
  } catch {
    return err({ _tag: "parse_failed", source: "suggestions", detail: `the records table does not hold the columns a candidate scan reads (${CANDIDATE_COLUMNS})` })
  }
}

/** The same guard for the row loop, for an error raised while the stream is being read. */
const readCandidates = (
  stream: Iterable<RawCandidateRow>,
  onRow: (row: RawCandidateRow) => CorpusError | null,
): CorpusError | null => {
  try {
    for (const row of stream) {
      const failure = onRow(row)
      if (failure !== null) return failure
    }
  } catch {
    return { _tag: "parse_failed", source: "suggestions", detail: "the records table could not be streamed to its end" }
  }
  return null
}

/**
 * Stream every record's text and keep the rows a quote could plausibly be near.
 *
 * Rows that share less than `minShared` types are dropped here rather than downstream: the ranking
 * would drop them anyway, and carrying 27,234 of them would move the memory this module exists to
 * save. Rows that clear it are all carried, because whether they are *worth showing* — the order, the
 * dedup, the cap — is a judgement, and the judgement is not made here.
 *
 * @param rawQuote the quote exactly as the user or model wrote it. Folded once, here.
 * @param minShared the ranking floor, supplied by the caller. Defaults to `MIN_SHARED_TRIGRAMS`.
 * @returns `err(row_undecodable)` if any row fails its schema, `err(parse_failed)` if the table
 *   cannot be read at all; `ok` otherwise, possibly with an empty `rows` array — which the caller
 *   reports as `no_candidates`, not as a failure.
 */
export const scanSuggestionCandidates = (
  db: Database,
  rawQuote: string,
  minShared: number = MIN_SHARED_TRIGRAMS,
): Result<SuggestionCandidateSource, CorpusError> => {
  const search = openSearch(rawQuote)
  const stream = openCandidateStream(db)
  if (!isOk(stream)) return stream

  const rows: ScannedNeighbour[] = []
  let considered = 0

  const failure = readCandidates(stream.value, (row) => {
    const textMatch = row.textMatch
    if (typeof textMatch !== "string") {
      return { _tag: "row_undecodable", recordId: rowId(row), detail: "textMatch is not a string" }
    }
    // `collection` decides the caller's default search scope, so a row without one cannot be scoped —
    // and a scope guessed from an absent column is a scope that silently becomes the whole corpus.
    if (typeof row.collection !== "string") {
      return { _tag: "row_undecodable", recordId: rowId(row), detail: "collection is not a string" }
    }
    const overlap = search.overlapOf(textMatch)
    considered += 1
    // Containment bypasses the floor here exactly as it does in the ranking: a record that holds the
    // quote outright is the answer to "what did they mean?" whatever its 3-gram overlap says.
    if (!overlap.contained && overlap.shared < minShared) return null
    rows.push({ recordId: row.id, collection: row.collection, textMatch, contained: overlap.contained, shared: overlap.shared })
    return null
  })
  if (failure !== null) return err(failure)

  return ok({ considered, rows, quoteFolded: search.quoteFolded })
}

/**
 * Fetch the full records behind at most `MAX_TOP_K` ids, in `recordId` order.
 *
 * ## Why this is a second query and not the first one widened
 *
 * The scan needs two columns from 27,234 rows; a suggestion needs fourteen columns from five. One
 * query doing both would read the metadata of every row to use the metadata of five, and would make
 * the scan's cost depend on how wide a record is. So the scan is narrow and this is the narrow
 * follow-up, with the ids as bound parameters — never interpolated into SQL text (A03).
 *
 * The caller keys the result by id because the ranking decided the order and a re-read of the same
 * rows must not be trusted to preserve it: SQLite is free to return an `IN` list in any order it
 * likes, and a caller that assumed otherwise would render a shuffled list on a different engine
 * version. Missing rows are a failure, not a short list: a vanished record means the snapshot changed
 * under us, and the honest output is `unavailable`.
 */
export const fetchSuggestionRecords = (db: Database, recordIds: readonly string[]): Result<readonly CorpusRecord[], CorpusError> => {
  if (recordIds.length === 0) return ok([])
  if (recordIds.length > MAX_TOP_K) {
    return err({ _tag: "parse_failed", source: "suggestions", detail: `at most ${MAX_TOP_K} records may be fetched` })
  }

  const placeholders = recordIds.map(() => "?").join(", ")
  const rows = db.query<RawRow, string[]>(recordSelect(` WHERE id IN (${placeholders}) ORDER BY id`)).all(...recordIds)

  const records: CorpusRecord[] = []
  for (const row of rows) {
    const decoded = decodeRecordRow(row)
    if (!isOk(decoded)) return err({ _tag: "row_undecodable", recordId: rowId(row), detail: decoded.error.detail })
    records.push(decoded.value)
  }

  const found = new Set(records.map((record) => record.id))
  const missing = recordIds.find((id) => !found.has(id))
  if (missing !== undefined) return err({ _tag: "row_undecodable", recordId: missing, detail: "record vanished between the scan and the read" })

  return ok(records)
}

export * as Candidates from "./candidates.ts"