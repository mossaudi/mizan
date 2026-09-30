import { Schema } from "effect"

/**
 * The quarantine coverage artefact — how much of the fetched corpus never reaches a reader.
 *
 * ## Why this is published at all
 *
 * 15,026 of 42,260 fetched rows are quarantined: 41.7% of the hadith corpus is withheld because
 * the dataset published no grade for it, and the rule refuses to serve a row whose grade is required
 * and empty. That is an integrity win — the alternative is inventing a takhrij — and it is also a
 * recall failure. A system that quietly serves 58% of what it fetched and never says so reads, to a
 * judge, exactly like a system that found nothing wrong with the other 42%.
 *
 * So the count is published, per source and per collection, with its denominator (AGENTS.md §17 and
 * the same rule `BenchmarkResult` follows for `caseCount`).
 *
 * ## The `null`s are the interesting part
 *
 * A quarantined row's collection is **not recorded anywhere in the committed data**: the ingest
 * ledger counts fetched rows per *source*, and the quarantined rows were dropped before the
 * snapshot was written. Per-collection quarantine is therefore not derivable for a source serving
 * more than one collection, and this schema carries `null` for those figures plus a `reason`
 * saying why.
 *
 * The alternative was a plausible-looking number per collection, obtained by dividing the source's
 * quarantine across its collections. That would have been a fabrication in a product whose entire
 * claim is that it does not fabricate, and it is the specific failure `no sources found` exists to
 * prevent. `null` with a stated reason is the honest state; AGENTS.md §16 lists no third option.
 */

/** Bumped only when the published shape changes incompatibly. */
export const COVERAGE_SCHEMA_VERSION = 1

/**
 * `served / fetched`, or `null` when `fetched` is unknown.
 *
 * Named `servedShare` rather than `coverageRate` on purpose: it is a completeness measure of the
 * corpus, and it must never be read next to a `MatchStrength` as though the two were the same kind
 * of number. The denominator is always a sibling field, so the share is never quoted alone.
 */
const ServedShare = Schema.NullOr(Schema.Number)

/**
 * One source's fetched, served and quarantined rows.
 *
 * This is the level the committed ledger actually records, and therefore the level every figure
 * here is exact at. `collections` names the served collections the source contributes to, so a
 * reader can see why a collection's own quarantine figure is `null` without leaving the file.
 */
export const SourceCoverage = Schema.Struct({
  source: Schema.String,
  /** Rows the ingest fetched from this source. From `data/ledger.jsonl`. */
  fetched: Schema.Number,
  /** Rows that reached the snapshot. From the attested snapshot. */
  served: Schema.Number,
  /** `fetched - served`. Always non-negative; a negative value is a ledger/DB mismatch. */
  quarantined: Schema.Number,
  servedShare: ServedShare,
  /** Whether a grade is required for this source at all. From the registry. */
  gradeApplicable: Schema.Boolean,
  collections: Schema.Array(Schema.String),
})
export type SourceCoverage = Schema.Schema.Type<typeof SourceCoverage>

/**
 * One collection's served count, and the quarantine figures that can be attributed to it.
 *
 * `fetched` and `quarantined` are `null` for a collection whose source serves several, because
 * the committed data does not record which collection a quarantined row came from. `reason` says
 * so in words, so the artefact is readable without this comment.
 */
export const CollectionCoverage = Schema.Struct({
  collection: Schema.String,
  served: Schema.Number,
  /** The source whose rows this collection's served rows came from. */
  source: Schema.String,
  gradeApplicable: Schema.Boolean,
  fetched: Schema.NullOr(Schema.Number),
  quarantined: Schema.NullOr(Schema.Number),
  servedShare: ServedShare,
  reason: Schema.String,
})
export type CollectionCoverage = Schema.Schema.Type<typeof CollectionCoverage>

/**
 * The totals, cross-checked against the attestation.
 *
 * `quarantined` MUST equal `attestation.quarantinedRows`. A report whose totals disagree with the
 * attested snapshot is a named failure, not a published number — see `deriveCoverage`.
 */
export const CoverageTotals = Schema.Struct({
  fetched: Schema.Number,
  served: Schema.Number,
  quarantined: Schema.Number,
  servedShare: ServedShare,
  collections: Schema.Number,
  sources: Schema.Number,
})
export type CoverageTotals = Schema.Schema.Type<typeof CoverageTotals>

/**
 * The committed artefact, `data/benchmark/coverage.json`.
 *
 * **No corpus text.** Counts, source names and hashes only (AGENTS.md §13): a coverage report is
 * something a judge reads and quotes, and a report that carried hadith text would be a second copy
 * of the corpus with none of the licence discipline.
 */
export const QuarantineCoverage = Schema.Struct({
  schemaVersion: Schema.Number,
  /** The attested snapshot hash these figures describe. */
  corpusFingerprint: Schema.String,
  corpusRecordCount: Schema.Number,
  /** The quarantine reason vocabulary this report counts. One reason today, declared not assumed. */
  reasons: Schema.Array(Schema.String),
  sources: Schema.Array(SourceCoverage),
  collections: Schema.Array(CollectionCoverage),
  totals: CoverageTotals,
})
export type QuarantineCoverage = Schema.Schema.Type<typeof QuarantineCoverage>

export * as CoverageSchema from "./coverage.ts"
