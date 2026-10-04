import type { Database } from "bun:sqlite"
import { isOk, unresolved, type Citation, type CorpusRecord, type ResolvedCitation } from "@mizan/core"
import { decodeRecordRow, recordSelect, rowId, type RawRow } from "./rows.ts"

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
 * accuse a correct answer of misquoting. `unverifiable` says "we cannot tell", which is
 * the only honest output when that is the case.
 *
 * ## Every row is decoded, in `rows.ts`
 *
 * A row read back out of SQLite is still crossing a boundary — the file could have been
 * written by an older ingest, or tampered with. The decode itself is shared with the
 * nearest-quote scan, and a row that does not decode becomes a problem reported here rather
 * than a `textMatch` that is silently `undefined` and quietly makes a `rejected` verdict out
 * of a bug.
 */

export type ResolveProblem = {
  readonly citation: Citation
  readonly detail: string
}

const rowsToRecords = (rows: readonly RawRow[]): { readonly records: readonly CorpusRecord[]; readonly problems: readonly ResolveProblem[] } => {
  const records: CorpusRecord[] = []
  const problems: ResolveProblem[] = []
  for (const row of rows) {
    const decoded = decodeRecordRow(row)
    if (!isOk(decoded)) {
      problems.push({
        citation: { collection: row.collection, number: row.number, grade: null, raw: row.id },
        detail: `row ${rowId(row)} does not match CorpusRecord: ${decoded.error.detail}`,
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
        ? db.query<RawRow, [string]>(recordSelect(" WHERE number = ? ORDER BY id")).all(citation.number)
        : db.query<RawRow, [string, string]>(recordSelect(" WHERE collection = ? AND number = ? ORDER BY id")).all(collection, citation.number)

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
