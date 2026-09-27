import { Database } from "bun:sqlite"
import { normalizeForMatch, type CorpusRecord } from "@mizan/core"

/**
 * Anchor selection: which real corpus rows the eval sets quote, and which span of each.
 *
 * ## Why the sets carry their own anchors
 *
 * `data/corpus.db` is 81 MB and gitignored, so a committed set that referenced record ids
 * would be unrunnable in CI and unrunnable by a judge — and "runnable in 60 seconds by
 * anyone" is the property the whole entry is sold on. So each set ships the handful of
 * corpus rows it needs, in full, with their licence and attribution read straight out of the
 * snapshot. The test then builds a hermetic snapshot from those rows and runs the REAL
 * resolver and the REAL verifier against it. Nothing is mocked, and nothing needs the network.
 *
 * `textHash` is the tie back to the shipped corpus: it is the sha256 of `textDisplay`, so a
 * re-ingest that changes a quoted row is detected rather than silently tolerated.
 *
 * ## Why spans, and why these spans
 *
 * A case quotes a SPAN of a record, not the whole record, because a model quotes a sentence.
 * The span is chosen to be auditable: no bidi control marks, no quotation marks, no Arabic
 * comma, no colon. Hadith text is full of `‏"‏` wrappers and RLM marks, and a span containing
 * one would make the tatweel and undiacriticized mutations meaningless — the fold strips
 * those marks, so the mutation would appear to work for the wrong reason. Every selection
 * rule here is deterministic: same snapshot in, same spans out, byte for byte.
 */

/** Bidi controls, the RTL/LTR marks and the Arabic letter mark. Mirrors the fold table. */
const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/

/**
 * Characters a span must not contain.
 *
 * `"` `«` `»` are the corpus's own quotation delimiters, `،` is the Arabic comma, and `:` is
 * the narrator's speech marker. All four appear constantly in hadith prose, and all four make
 * a span harder to read in a diff without making the test any stronger.
 */
const DISALLOWED = /["«»،:]/

/** Word counts tried in order. Longer spans are more meaningful; shorter ones fit more records. */
const SPAN_SIZES = [12, 10, 8] as const

/** A folded span shorter than this is too short to be a meaningful quotation. */
const MIN_FOLDED_CHARS = 40

export const isCleanSpan = (span: string): boolean =>
  !BIDI.test(span) && !DISALLOWED.test(span) && normalizeForMatch(span).length >= MIN_FOLDED_CHARS

/**
 * The first clean window of `size` words starting at or after `from`.
 *
 * Returns null rather than a degraded span. A caller that gets null must skip the record, not
 * substitute something less clean: a span with a bidi mark in it is exactly the input the
 * fold table exists to handle, and testing it accidentally would let a real fold bug hide.
 */
const windowFrom = (words: readonly string[], from: number, size: number): string | null => {
  const slice = words.slice(from, from + size)
  if (slice.length < size) return null
  const span = slice.join(" ")
  return isCleanSpan(span) ? span : null
}

/**
 * The first `count` DISTINCT clean spans of `text`, in order, optionally filtered by `accept`.
 *
 * ## Spans are DISJOINT, not merely distinct
 *
 * After accepting a window the scan jumps past it, so two cases never share a span or eleven
 * words of one. It would have been cheaper to step one word at a time and collect twenty
 * twelve-word windows out of one long record, but those twenty cases would be the same
 * sentence with a different word chopped off — the set would read as 200 cases and behave like
 * 6. Coverage is counted in texts, not in windows.
 *
 * Scanning left to right and skipping whole windows means the result is a function of the text
 * alone, so re-running the generator on an unchanged snapshot reproduces every span byte for
 * byte. The `accept` filter is what lets one function serve every class: a digit class needs a
 * span that actually contains a digit, and a substitution class needs a span that actually
 * contains the word it is going to replace.
 */
export const findSpans = (text: string, count: number, accept?: (span: string) => boolean): readonly string[] => {
  const words = text.split(/\s+/).filter((word) => word.length > 0)
  const found: string[] = []
  for (const size of SPAN_SIZES) {
    let start = 0
    while (start + size <= words.length && found.length < count) {
      const span = windowFrom(words, start, size)
      if (span === null || (accept !== undefined && !accept(span))) {
        start += 1
        continue
      }
      found.push(span)
      start += size
    }
    if (found.length >= count) break
  }
  return found
}

/** A span containing an ASCII digit — the precondition for both digit classes. */
export const containsAsciiDigit = (span: string): boolean => /[0-9]/.test(span)

/** A span containing `word`, for a substitution class. */
export const containsWord =
  (word: string) =>
  (span: string): boolean =>
    span.includes(word)

const RECORD_COLUMNS = "id, collection, number, grade, gradeApplicable, gradeSource, gradeBasis, attribution, license, licenseUrl, sourceUrl, textDisplay, translation"

type RawRow = { readonly [key: string]: string | number | null }

const toAnchor = (row: RawRow): CorpusRecord => ({
  id: String(row.id),
  collection: String(row.collection),
  number: row.number === null ? null : String(row.number),
  grade: row.grade === null ? null : String(row.grade),
  gradeApplicable: row.gradeApplicable === 1,
  gradeSource: String(row.gradeSource),
  gradeBasis: String(row.gradeBasis) as CorpusRecord["gradeBasis"],
  attribution: String(row.attribution),
  license: String(row.license),
  licenseUrl: String(row.licenseUrl),
  sourceUrl: String(row.sourceUrl),
  textDisplay: String(row.textDisplay),
  textMatch: normalizeForMatch(String(row.textDisplay)),
  translation: row.translation === null ? undefined : String(row.translation),
})

/** Every row in a collection, id-ascending. `ORDER BY id` is what makes selection deterministic. */
export const rowsIn = (db: Database, collection: string): readonly CorpusRecord[] =>
  db
    .query<RawRow, [string]>(`SELECT ${RECORD_COLUMNS} FROM records WHERE collection = ? ORDER BY id`)
    .all(collection)
    .map(toAnchor)

/** Every collection present, name-ascending. */
export const collectionsOf = (db: Database): readonly string[] =>
  db.query<{ readonly collection: string }, []>("SELECT DISTINCT collection FROM records ORDER BY collection").all().map((row) => row.collection)

/**
 * Every record whose display text contains `needle`, id-ascending.
 *
 * `instr` rather than `LIKE`, deliberately. `LIKE` treats `%` and `_` in the needle as
 * wildcards, so a substitution word containing one would silently match a whole collection —
 * and the resulting "fabrication" would not contain the word it claims to have replaced, which
 * is precisely the bug this file exists to make impossible. `instr` has no wildcards.
 */
export const recordsContaining = (db: Database, needle: string): readonly CorpusRecord[] =>
  db
    .query<RawRow, [string]>(`SELECT ${RECORD_COLUMNS} FROM records WHERE instr(textDisplay, ?) > 0 ORDER BY id`)
    .all(needle)
    .map(toAnchor)

/**
 * Up to `count` (record, span) pairs drawn from `records` in order.
 *
 * Skipping records without a usable span is normal, not an error: a handful of very short
 * Qur'anic fragments have no 8-word clean window, and a set that demanded one would be
 * asserting that hadith prose never contains a bidi mark. The returned array is shorter than
 * `count` when the corpus cannot supply that many, and the generator treats a short result as
 * a hard failure rather than shrinking the set.
 */
export const anchorsWithSpans = (
  records: readonly CorpusRecord[],
  count: number,
  accept?: (span: string) => boolean,
): readonly (readonly [CorpusRecord, string])[] => {
  const found: (readonly [CorpusRecord, string])[] = []
  for (const record of records) {
    if (found.length >= count) break
    const span = findSpans(record.textDisplay, 1, accept)[0]
    if (span === undefined) continue
    found.push([record, span])
  }
  return found
}

/** The corpus as one folded string per record, for the global containment check. */
export const loadFoldedCorpus = (db: Database): readonly string[] =>
  db.query<{ readonly textMatch: string }, []>("SELECT textMatch FROM records ORDER BY id").all().map((row) => row.textMatch)

/**
 * What the corpus can resolve, as two flat sets.
 *
 * Built so `validate` can check a citation-shape case without the database. A case labelled
 * `identifier_unresolved` whose number turns out to EXIST would not be unverifiable at all — it
 * would be `verified` or `rejected` — and a case labelled `collection_ambiguous` whose number
 * lives in only one collection would resolve to a single row, which is the confident falsehood
 * the ambiguity rule exists to prevent. Both are silent mislabels, and both are cheap to rule
 * out at build time instead of discovering as a confusing test failure later.
 */
export type CorpusIndex = {
  /** `"{collection}|{number}"` for every resolvable citation. */
  readonly existingKeys: ReadonlySet<string>
  /** Numbers that appear in more than one collection. */
  readonly ambiguousNumbers: ReadonlySet<string>
}

export const indexCorpus = (db: Database): CorpusIndex => {
  const rows = db.query<{ readonly collection: string; readonly number: string }, []>("SELECT DISTINCT collection, number FROM records WHERE number IS NOT NULL").all()
  const existingKeys = new Set<string>()
  const byNumber = new Map<string, Set<string>>()
  for (const row of rows) {
    existingKeys.add(`${row.collection}|${row.number}`)
    const collections = byNumber.get(row.number) ?? new Set<string>()
    collections.add(row.collection)
    byNumber.set(row.number, collections)
  }
  const ambiguousNumbers = new Set([...byNumber.entries()].filter(([, collections]) => collections.size > 1).map(([number]) => number))
  return { existingKeys, ambiguousNumbers }
}

/** Records whose text contains an ASCII digit — the only source of `arabic_indic_digits` cases. */
export const recordsWithDigits = (db: Database): readonly CorpusRecord[] =>
  db
    .query<RawRow, []>(`SELECT ${RECORD_COLUMNS} FROM records WHERE textDisplay GLOB '*[0-9]*' ORDER BY id`)
    .all()
    .map(toAnchor)

/** The number of distinct collections that use `number`, for the `collection_ambiguous` class. */
export const collectionsUsingNumber = (db: Database, number: string): readonly string[] =>
  db
    .query<{ readonly collection: string }, [string]>("SELECT DISTINCT collection FROM records WHERE number = ? ORDER BY collection")
    .all(number)
    .map((row) => row.collection)

/** The largest number in a collection, so the generator can pick a number that cannot exist. */
export const maxNumberIn = (db: Database, collection: string): number => {
  const row = db
    .query<{ readonly max: number | null }, [string]>("SELECT MAX(CAST(number AS INTEGER)) AS max FROM records WHERE collection = ?")
    .get(collection)
  return row?.max ?? 0
}

export * as Anchors from "./anchors.ts"
