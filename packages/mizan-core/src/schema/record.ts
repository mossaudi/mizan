import { Schema } from "effect"

/**
 * `CorpusRecord` — one addressable row of the corpus, and the only thing a
 * verification decision is ever allowed to touch.
 *
 * Two fields carry the product's integrity story:
 *
 *  - `textDisplay` is the source text, **verbatim and never rewritten**. The Qur'an
 *    source is under no-derivatives terms, and rewriting a sacred text to suit a
 *    normalizer would be wrong on its own terms.
 *  - `textMatch` is the same text with the fold from
 *    `normalize/normalize.ts` applied ONCE, at ingest. It is the only surface the
 *    verifier ever compares against, so verification never runs a normalizer over the
 *    corpus at query time.
 *
 * ## `textMatch` MUST NEVER BE DISPLAYED
 *
 * The folded form is not a faithful transcription of anything. Tanzil's
 * `ٱلْعَٰلَمِينَ` folds to `العلمين` — the superscript alef is a combining mark and is
 * removed — and `ٱلْحَمْدُ` folds to `الحمد`. It is a MATCHING KEY, not a text. Every user
 * surface in this repository renders `textDisplay`; `textMatch` exists to be compared
 * with, and showing it to a judge would be both a licensing breach and an offence. The
 * product rule is one line: **render `textDisplay`, compare `textMatch`.**
 *
 * On `grade` (AGENTS.md section 15, ADR-06): a grade is the DATASET's grade. It is
 * stored exactly as published, together with who published it (`gradeSource`) and on
 * what basis (`gradeBasis`). `grade: null` means "this dataset asserts no grade for
 * this row" and the product says so — it is never defaulted, never inferred, and
 * never rendered as our own ruling.
 */

export const GradeBasis = Schema.Union([
  Schema.Literal("row"),
  Schema.Literal("collection"),
  Schema.Literal("none"),
])
export type GradeBasis = Schema.Schema.Type<typeof GradeBasis>

/**
 * The one collection that is not a hadith book.
 *
 * ## Why this constant exists, and why the retrieval package needs it
 *
 * `collection` is a per-source slug: `abudawud`, `nasai`, `tirmidhi`, and so on. There is no
 * `hadith` collection, because hadith is a *family* of books rather than a book — which is
 * exactly the kind of assumption that a filter written as `collection = 'hadith'` gets wrong,
 * and that one did: `hadithSearch` filtered on that string for the whole life of the retrieval
 * package and matched zero of the corpus's 27 234 rows, so hadith retrieval was silently dead
 * and every hadith question degraded to `no sources found`.
 *
 * So the two parts of this corpus are defined by that one distinction — the Qur'an, and
 * everything else — and the definition is stated once, here, where the `collection` field is
 * documented. `@mizan/corpus` writes it (the Tanzil adapter) and `@mizan/retrieval` reads it
 * (the Qur'an-only tool). A third family, were one ever added, would make this a union rather
 * than a single slug; `docs/` notes the tafsir corpus is deliberately not being built.
 *
 * Hadith membership is deliberately NOT expressed through `gradeApplicable`. That flag says a
 * dataset grades its rows, and coupling retrieval to it would make a hadith book whose dataset
 * declines to grade it unsearchable — a grade policy leaking into what the corpus *is*.
 */
export const QURAN_COLLECTION = "quran"

export const CorpusRecord = Schema.Struct({
  /** `"{collection}:{number}"`, or `"{collection}:{seq}"` for unnumbered rows. Namespaced, so duplicate ids across collections are safe. */
  id: Schema.String,
  collection: Schema.String,
  /** Hadith number as a STRING: numbering follows the printed edition and may be non-numeric. Nullable for unnumbered rows. */
  number: Schema.NullOr(Schema.String),
  /** Exactly as the source dataset asserts it, or null. Never inferred. */
  grade: Schema.NullOr(Schema.String),
  /** False for the Qur'an, where the concept does not apply; true for hadith. */
  gradeApplicable: Schema.Boolean,
  /** The dataset that asserted the grade, e.g. `"quranlab/hadith"`. */
  gradeSource: Schema.String,
  gradeBasis: GradeBasis,
  /** GENERATED from source metadata during ingest. Never a hand-typed literal. */
  attribution: Schema.String,
  license: Schema.String,
  licenseUrl: Schema.String,
  sourceUrl: Schema.String,
  textDisplay: Schema.String,
  textMatch: Schema.String,
  translation: Schema.optional(Schema.String),
})
export type CorpusRecord = Schema.Schema.Type<typeof CorpusRecord>

/**
 * The per-row registry projection: everything needed to audit provenance, without
 * the text. One JSONL line per record in `data/registry/records.jsonl`, so a licence
 * or attribution defect can be traced to a single row instead of to a whole corpus.
 */
export const CorpusRecordMeta = Schema.Struct({
  id: Schema.String,
  collection: Schema.String,
  number: Schema.NullOr(Schema.String),
  grade: Schema.NullOr(Schema.String),
  gradeApplicable: Schema.Boolean,
  gradeSource: Schema.String,
  gradeBasis: GradeBasis,
  attribution: Schema.String,
  license: Schema.String,
  licenseUrl: Schema.String,
  sourceUrl: Schema.String,
  /** sha256 of `textDisplay`, so a tampered row is detectable without storing the row. */
  textHash: Schema.String,
})
export type CorpusRecordMeta = Schema.Schema.Type<typeof CorpusRecordMeta>

/** Project a record to its registry projection. */
export const toRecordMeta = (record: CorpusRecord, sha256Hex: (value: string) => string): CorpusRecordMeta => ({
  id: record.id,
  collection: record.collection,
  number: record.number,
  grade: record.grade,
  gradeApplicable: record.gradeApplicable,
  gradeSource: record.gradeSource,
  gradeBasis: record.gradeBasis,
  attribution: record.attribution,
  license: record.license,
  licenseUrl: record.licenseUrl,
  sourceUrl: record.sourceUrl,
  textHash: sha256Hex(record.textDisplay),
})

export * as RecordSchema from "./record.ts"
