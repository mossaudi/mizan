import type { Database } from "bun:sqlite"
import { CorpusRecord, decodeOrFail, decodeSync, isOk, unresolved, type Citation, type ResolvedCitation } from "@mizan/core"

/**
 * Citation resolution — the seam between "a model said `bukhari:1`" and "here is the row".
 *
 * ## Why resolution lives in the corpus and not in the verifier
 *
 * `@mizan/verify` is allowed no I/O (AGENTS.md section 9). Resolution is a database read, so
 * it happens here and the verifier receives the outcome as data. That is what lets the
 * differentiator be a pure function — and it is why the whole verification path is testable
 * without a snapshot, a network, or a clock.
 *
 * ## The three states a citation can be in
 *
 *  - **resolved**  exactly one record matches. The verifier may then verify OR reject.
 *  - **ambiguous** the number exists in more than one collection and the citation named none.
 *    `unverifiable (collection_ambiguous)`.
 *  - **unresolved** no record matches. `unverifiable (identifier_unresolved)`.
 *
 * The middle state is the one a naive implementation gets wrong, and getting it wrong
 * produces a confident falsehood: hadith number 1 exists in al-Bukhari, Sahih Muslim and
 * dozens of other collections, so resolving it to the first match would make the verifier
 * accuse a correct answer of misquoting. `unverifiable` says "we cannot tell", which is the
 * only honest output when that is the case.
 *
 * ## Every row is decoded through `CorpusRecord`
 *
 * A row read back out of SQLite is still crossing a boundary — the file could have been
 * written by an older ingest, or tampered with. Decoding it means a malformed row is a typed
 * failure that this module can report, not a `textMatch` that is silently `undefined` and
 * quietly makes a `rejected` verdict out of a bug.
 */

const RECORD_SELECT = `SELECT id, collection, number, grade, gradeApplicable, gradeSource, gradeBasis,
  attribution, license, licenseUrl, sourceUrl, textDisplay, textMatch, translation FROM records`

type RawRow = {
  readonly id: string
  readonly collection: string
  readonly number: string | null
  readonly grade: string | null
  readonly gradeApplicable: number
  readonly gradeSource: string
  readonly gradeBasis: string
  readonly attribution: string
  readonly license: string
  readonly licenseUrl: string
  readonly sourceUrl: string
  readonly textDisplay: string
  readonly textMatch: string
  readonly translation: string | null
}

export type ResolveProblem = {
  readonly citation: Citation
  readonly detail: string
}

/** SQLite has no boolean type; the column is 0/1 and the schema wants a boolean. */
const toRecord = (row: RawRow): unknown => ({
  id: row.id,
  collection: row.collection,
  number: row.number,
  grade: row.grade,
  gradeApplicable: row.gradeApplicable === 1,
  gradeSource: row.gradeSource,
  gradeBasis: row.gradeBasis,
  attribution: row.attribution,
  license: row.license,
  licenseUrl: row.licenseUrl,
  sourceUrl: row.sourceUrl,
  textDisplay: row.textDisplay,
  textMatch: row.textMatch,
  translation: row.translation ?? undefined,
})

const rowsToRecords = (rows: readonly RawRow[]): { readonly records: readonly CorpusRecord[]; readonly problems: readonly ResolveProblem[] } => {
  const records: CorpusRecord[] = []
  const problems: ResolveProblem[] = []
  for (const row of rows) {
    const decoded = decodeOrFail(decodeSync(CorpusRecord), toRecord(row), "CorpusRecord")
    if (!isOk(decoded)) {
      problems.push({
        citation: { collection: row.collection, number: row.number, grade: null, raw: row.id },
        detail: `row ${row.id} does not match CorpusRecord: ${decoded.error.detail}`,
      })
      continue
    }
    records.push(decoded.value)
  }
  return { records, problems }
}

/**
 * Resolve citations against the snapshot.
 *
 * @param citations the citations exactly as the model wrote them. A citation with an empty
 *   collection is resolved by number alone and marked ambiguous if the number exists in more
 *   than one collection.
 */
export const resolveCitations = (db: Database, citations: readonly Citation[]): { readonly resolved: readonly ResolvedCitation[]; readonly problems: readonly ResolveProblem[] } => {
  const resolved: ResolvedCitation[] = []
  const problems: ResolveProblem[] = []

  for (const citation of citations) {
    if (citation.number === null || citation.number.trim().length === 0) {
      resolved.push(unresolved(citation))
      continue
    }
    const collection = citation.collection.trim()
    const rows =
      collection.length === 0
        ? db.query<RawRow, [string]>(`${RECORD_SELECT} WHERE number = ? ORDER BY id`).all(citation.number)
        : db.query<RawRow, [string, string]>(`${RECORD_SELECT} WHERE collection = ? AND number = ? ORDER BY id`).all(collection, citation.number)

    const decoded = rowsToRecords(rows)
    problems.push(...decoded.problems)

    // Ambiguity is about COLLECTIONS, not rows: two rows in one collection with the same
    // number is a data defect (the id is unique, so it cannot happen), while the same number
    // in two collections is ordinary in hadith and must not be guessed at.
    const collections = new Set(decoded.records.map((record) => record.collection))
    const ambiguous = collection.length === 0 && collections.size > 1
    resolved.push({ citation, records: decoded.records, ambiguous })
  }

  return { resolved, problems }
}

export * as Resolve from "./resolve.ts"
