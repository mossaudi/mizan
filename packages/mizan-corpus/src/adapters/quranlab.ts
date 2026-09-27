import { err, ok, sha256Hex } from "@mizan/core"
import type { AdapterFailure, FetchContext, RawRecord, SourceAdapter } from "./types.ts"

/**
 * quranlab/hadith — the Arabic matn of the Kutub al-Sittah, over the Hugging Face
 * datasets-server rows API.
 *
 * ## Why the rows API and not the parquet files
 *
 * The dataset ships parquet, and parquet would be one request instead of three hundred. Bun
 * has no parquet reader, and adding a dependency to read a file whose licence we have already
 * had to reason about carefully is a poor trade in a project whose whole point is having few
 * dependencies. `rows?offset=&length=100` is a documented, paginated, stable interface, and
 * offset pagination is deterministic — which matters, because the artefact digest is computed
 * over the page bodies **in fetch order** and must be reproducible.
 *
 * ## What is ingested, and what is deliberately not
 *
 * In: `text` (the Arabic matn), `hadith_number`, `collection`, `sunnah_url`, and the
 * published grade. Out: the `reference`/isnad payload, whose per-row terms the dataset card
 * lists separately from the public-domain Arabic. That exclusion is recorded in the source
 * descriptor's `notes`, so it is visible in `sources.json` and in `DISCLOSURE.md` rather than
 * living only in this comment.
 *
 * ## The grade model, applied to real data
 *
 * `grades` is a list and is EMPTY for rows in collections the dataset does not grade per row
 * (Sahih al-Bukhari, for instance, is `graded: false` at the collection level and its rows
 * carry `n_grades: 0`). The naive implementation defaults that to "authentic", which would be
 * us issuing a religious-legal judgement we never made (ADR-06). This adapter stores
 * `grade: null, gradeBasis: "none"` and lets the product say "this dataset publishes no grade
 * for this row". When `grades` is present, the row's own grade is stored with basis `"row"`
 * and the `gradeSource` naming the dataset — never presented as our ruling.
 *
 * ## Why `hadith_key` is used as the record id
 *
 * The dataset already publishes `bukhari:1` — collection-namespaced, which is exactly the id
 * shape `CorpusRecord` requires and exactly what makes resolution collision-free. Re-deriving
 * an id from two loosely-typed fields would be strictly worse.
 */

/** The Arabic collections of the six canonical books, plus al-Muwatta and an-Nawawi. */
export const QURANLAB_COLLECTIONS = [
  "bukhari",
  "muslim",
  "abudawud",
  "tirmidhi",
  "nasai",
  "ibnmajah",
  "malik",
  "nawawi",
] as const

const DATASET = "quranlab%2Fhadith"
const PAGE_SIZE = 100
const MAX_ROWS_PER_COLLECTION = 12_000

/** The fields this adapter reads. Anything else in the response is ignored on purpose. */
type HadithRow = {
  readonly hadith_key: string
  readonly collection: string
  readonly hadith_number: string
  readonly text: string
  readonly sunnah_url: string | null
  /**
   * One entry per grading body. An OBJECT, not a string — `[{ grader, grade }, …]`.
   *
   * This was originally typed `readonly string[] | null` and joined directly, which produced
   * the literal string `"[object Object] / [object Object]"` in all 36,024 hadith records of
   * the first committed ingest. The bug was invisible to every test that constructed its own
   * fixture with string grades, and visible the moment a real row was read. Typed as the
   * object it is, and `readGrade` is a pure function of the decoded row so a real-shaped
   * fixture now pins it.
   */
  readonly grades: readonly HadithGrade[] | null
  readonly n_grades: number
}

export type HadithGrade = {
  readonly grader: string
  readonly grade: string
}

const isHadithGrade = (value: unknown): value is HadithGrade => {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.grade === "string"
}

const rowsUrl = (collection: string, offset: number, length: number): string =>
  `https://datasets-server.huggingface.co/rows?dataset=${DATASET}&config=${collection}-ar&split=train&offset=${offset}&length=${length}`

type RowsResponse = {
  readonly rows?: readonly { readonly row: unknown }[]
  readonly error?: string
}

/**
 * Pull the published grade out of a row, or `null` with basis `"none"`.
 *
 * `n_grades: 0` with an empty list is the dataset declining to grade, not a missing value to
 * be filled in. A row graded by several bodies is stored as those bodies' own assertions,
 * joined — the dataset's summary, not our ranking of them, and not our ruling (ADR-06).
 *
 * A grader entry that is not `{ grader, grade }` is skipped rather than coerced. Coercing is
 * what produced `"[object Object]"`; the honest handling of an entry we cannot read is to not
 * report it as a grade.
 */
export const readGrade = (row: HadithRow): { readonly grade: string | null; readonly basis: "row" | "none" } => {
  const grades = (row.grades ?? []).filter(isHadithGrade)
  if (grades.length === 0) return { grade: null, basis: "none" }
  return { grade: grades.map((entry) => entry.grade).join(" / "), basis: "row" }
}

const toRawRecord = (row: HadithRow): RawRecord => {
  const grade = readGrade(row)
  return {
    id: row.hadith_key,
    collection: row.collection,
    number: row.hadith_number,
    textDisplay: row.text,
    sourceUrl: row.sunnah_url,
    grade: grade.grade,
    gradeBasis: grade.basis,
    translation: null,
  }
}

const isHadithRow = (value: unknown): value is HadithRow => {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.hadith_key === "string" && typeof candidate.text === "string"
}

export const quranlabAdapter: SourceAdapter = {
  slug: "quranlab/hadith",
  fetchRecords: async (context: FetchContext) => {
    const records: RawRecord[] = []
    const bodies: string[] = []
    let malformed = 0
    let fetched = 0

    for (const collection of QURANLAB_COLLECTIONS) {
      let offset = 0
      // Page until the API returns a short page: that is the documented end-of-dataset signal.
      while (fetched < context.limit && offset < MAX_ROWS_PER_COLLECTION) {
        const length = Math.min(PAGE_SIZE, context.limit - fetched)
        const response = await context.get(rowsUrl(collection, offset, length))
        if (!response.ok) {
          return err({
            _tag: "adapter_failed" as const,
            reason: "fetch_failed" as const,
            detail: `quranlab ${collection} offset ${offset}: ${response.detail}`,
          })
        }
        bodies.push(response.body)

        const parsed = JSON.parse(response.body) as RowsResponse
        if (parsed.error !== undefined) {
          return err({
            _tag: "adapter_failed",
            reason: "schema_mismatch",
            detail: `quranlab ${collection} offset ${offset}: ${parsed.error}`,
          })
        }
        const page = parsed.rows ?? []
        for (const entry of page) {
          if (!isHadithRow(entry.row)) {
            malformed += 1
            continue
          }
          records.push(toRawRecord(entry.row))
          fetched += 1
        }
        if (page.length < length) break
        offset += PAGE_SIZE
      }
    }

    if (records.length === 0) {
      return err({ _tag: "adapter_failed", reason: "schema_mismatch", detail: "quranlab returned no usable rows" })
    }

    return ok({
      records,
      // The digest covers the page bodies in fetch order, so a re-fetch of the same rows
      // reproduces it. It is what makes "the same corpus" a checkable claim.
      sha256: sha256Hex(bodies.join("|")),
      dropped: malformed === 0 ? [] : [{ reason: "row did not match the hadith row shape", count: malformed }],
    })
  },
}

export * as Quranlab from "./quranlab.ts"
