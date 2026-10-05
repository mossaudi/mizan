import { CorpusRecord, decodeOrFail, decodeSync, type DecodeFailure, type Result } from "@mizan/core"

/**
 * Decoding a SQLite row into a `CorpusRecord`, in one place.
 *
 * ## Why this file exists
 *
 * Two modules read records out of the database — `resolve.ts`, which finds the row a citation named,
 * and `candidates.ts`, which streams every row's text to find the nearest ones to a quote. Both
 * need the same columns, the same 0/1-to-boolean conversion, and the same decode. Written twice,
 * the second copy would be the one that forgets `gradeApplicable` and the one that stops rejecting a
 * malformed row (AGENTS.md §17). One decoder, two callers.
 *
 * ## Why a row read back out of SQLite is still a trust boundary
 *
 * The file could have been written by an older ingest, or edited since the attestation was signed.
 * So a row is decoded through the declared schema before any code touches its fields, and a row that
 * does not decode is a typed failure the caller must handle — never a `textMatch` that is silently
 * `undefined` and quietly turns into a `rejected` verdict or an empty suggestion list.
 */

/** Every column a full record needs, in the order `CorpusRecord` declares them. */
export const RECORD_COLUMNS =
  "id, collection, number, grade, gradeApplicable, gradeSource, gradeBasis, attribution, license, licenseUrl, sourceUrl, textDisplay, textMatch, translation"

/**
 * The three columns a nearest-quote scan needs, and nothing more.
 *
 * `collection` is here rather than fetched later because the caller's default scope is the cited
 * record's own collection, and a scope that costs a second pass is a scope nobody applies.
 */
export const CANDIDATE_COLUMNS = "id, collection, textMatch"

/** `SELECT` for a full record, with an optional `WHERE`/`ORDER BY` tail supplied by the caller. */
export const recordSelect = (tail = ""): string => `SELECT ${RECORD_COLUMNS} FROM records${tail}`

/**
 * The shape SQLite hands back. It is not `CorpusRecord` yet: SQLite has no boolean type, so
 * `gradeApplicable` arrives as 0/1, and an absent `translation` arrives as `null`.
 */
export type RawRow = {
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

/** A candidate row: what the nearest-quote scan reads, and nothing else. */
export type RawCandidateRow = {
  readonly id: string
  readonly collection: string
  readonly textMatch: string
}

/** SQLite has no boolean type; the column is 0/1 and the schema wants a boolean. */
export const toRecord = (row: RawRow): unknown => ({
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

/**
 * Decode one row, or say precisely which row did not decode.
 *
 * The failure names the row id and nothing else. A decode failure detail can contain the offending
 * value, and a row of corpus text is not something to write into a log line, a trace, or an error
 * message that a human will paste into an issue (AGENTS.md §13). Callers that turn the failure into
 * outward-facing text go through {@link decodeFailureSummary} for exactly that reason.
 */
export const decodeRecordRow = (row: RawRow): Result<CorpusRecord, DecodeFailure> =>
  decodeOrFail(decodeSync(CorpusRecord), toRecord(row), "CorpusRecord")

/**
 * A decode failure, described without the value that caused it.
 *
 * ## Why the raw `detail` may not be forwarded
 *
 * Effect Schema names the *received* value whenever it can be precise about one, so the detail this
 * seam produces is corpus text under another name. Measured on a row whose `gradeBasis` is a free-text
 * note, the decoder returned:
 *
 * ```text
 * Expected "row" | "collection" | "none", got "نص المحقق"
 * ```
 *
 * `CorpusRecord.gradeBasis` is a three-literal union, and the failure quoted a six-word Arabic note
 * straight out of the snapshot. A `CorpusError.detail` is read by the CLI, printed to stderr, and
 * pasted into bug reports; forwarding that verbatim puts corpus text into all three, in the one place
 * AGENTS.md §13 says it cannot go.
 *
 * ## What is left, and why it is enough
 *
 * The schema name and nothing else: which contract the row failed. The failing row is already named
 * separately by `recordId`, and the value is the only part that could be corpus content — so dropping
 * it loses an operator's clue about *which column* is wrong while removing the leak entirely, and
 * that trade is worth taking: a wrong value in a log is a disclosure, a missing path is an
 * inconvenience.
 *
 * Exported rather than inlined at the two call sites, because "may this document state this detail"
 * and "what may be written about a bad row" must have one answer (AGENTS.md §17).
 */
export const decodeFailureSummary = (failure: DecodeFailure): string => `does not satisfy ${failure.schema}`

/** The row id, or `"unknown"` when even that is not a string — for naming a row without quoting it. */
export const rowId = (row: { readonly id?: unknown }): string => (typeof row.id === "string" ? row.id : "unknown")

export * as Rows from "./rows.ts"