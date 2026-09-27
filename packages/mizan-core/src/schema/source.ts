import { Schema } from "effect"
import { GradeBasis } from "./record.ts"

/**
 * `SourceDescriptor` — the committed, human-readable record of where the corpus came from.
 *
 * This is the module the gates validate, the ingest writes, and `DISCLOSURE.md` is
 * generated from. It is deliberately committed to git while `records.jsonl` and
 * `corpus.db` are generated and gitignored: the *provenance* of a corpus is small and must
 * be reviewable in a diff, while the corpus itself is large and reproducible from it.
 *
 * ## `licenceClass` is a judgement, stored, not a string
 *
 * Free-text licence fields are how "we checked the licence" quietly becomes "we assumed a
 * licence". Enumerating the classes makes the decision reviewable:
 *
 *  - `permissive`       MIT / Apache-2.0 / CC0 — derivatives and redistribution allowed.
 *  - `copyleft`         share-alike obligations attach to derivatives.
 *  - `content-only`     redistribution allowed, derivatives restricted (e.g. CC BY-ND).
 *  - `no-derivatives`   the text must be stored and shown VERBATIM. The Qur'an sources are
 *                       here. A normalizer that rewrites sacred text to make matching
 *                       easier is a licensing violation as well as a theological one, which
 *                       is why `CorpusRecord` keeps `textDisplay` and folds only into the
 *                       separate `textMatch` column.
 *  - `unconfirmed`      we have not established the terms. NEVER valid for an enabled
 *                       source — gate **G-5** fails the build on exactly that combination,
 *                       so "we'll sort the licence out later" cannot reach a snapshot.
 *
 * ## `enabled: false` is a first-class, declared state
 *
 * A source whose licence is `unconfirmed` stays in the registry with `enabled: false` and an
 * `exclusionReason`. Deleting it would hide the decision from the next person, who would
 * then re-add it and re-derive the same conclusion. An exclusion that is visible is a
 * decision; an exclusion that is invisible is a bug waiting to be rediscovered.
 */

export const LicenceClass = Schema.Union([
  Schema.Literal("permissive"),
  Schema.Literal("copyleft"),
  Schema.Literal("content-only"),
  Schema.Literal("no-derivatives"),
  Schema.Literal("unconfirmed"),
])
export type LicenceClass = Schema.Schema.Type<typeof LicenceClass>

/** True when the stored text must be byte-identical to the source, so no derivative may be shown as the text. */
export const requiresVerbatimText = (licenceClass: LicenceClass): boolean => licenceClass === "no-derivatives"

export const SourceDescriptor = Schema.Struct({
  /** Stable slug, `publisher/dataset`. Never a URL: URLs move, slugs are keys. */
  source: Schema.String,
  title: Schema.String,
  publisher: Schema.String,
  /** Where the artefact was fetched from, for re-fetching during a reproducible ingest. */
  url: Schema.String,
  /** The licence as the source states it, verbatim. Free text on purpose — we quote them, we do not paraphrase. */
  license: Schema.String,
  licenceClass: LicenceClass,
  licenseUrl: Schema.String,
  /** The attribution string shown in the UI. Generated from publisher/title/licence, never hand-typed per row. */
  attribution: Schema.String,
  /** sha256 of the fetched artefact, so a re-ingest can prove it got the same bytes. */
  sha256: Schema.String,
  /** Rows contributed to the snapshot. */
  records: Schema.Number,
  /** False means excluded from the snapshot. The row stays, with an `exclusionReason`. */
  enabled: Schema.Boolean,
  exclusionReason: Schema.NullOr(Schema.String),
  /** False for the Qur'an, where grading does not apply (AGENTS.md section 15). */
  gradeApplicable: Schema.Boolean,
  /** Whether grades in this source are per-row or a collection-level statement. */
  gradeBasis: GradeBasis,
  /**
   * Exactly which FIELDS of the source artefact this snapshot ingests, and what was left
   * out. A mixed-licence dataset has no single licence answer, and the honest thing is to
   * write down which columns we took rather than to pick the friendliest reading of the
   * card. `null` when the whole artefact is used and the licence is unambiguous.
   */
  notes: Schema.NullOr(Schema.String),
})
export type SourceDescriptor = Schema.Schema.Type<typeof SourceDescriptor>

/** `sources.json` is a generated file: a header, then one descriptor per source. */
export const SourceRegistry = Schema.Struct({
  schemaVersion: Schema.String,
  generatedBy: Schema.String,
  sources: Schema.Array(SourceDescriptor),
})
export type SourceRegistry = Schema.Schema.Type<typeof SourceRegistry>

/** Fields that must be non-empty for the registry to be trustworthy. One list, used by G-5 and by the ingest. */
export const REQUIRED_LICENCE_FIELDS = ["source", "title", "publisher", "url", "license", "licenseUrl", "attribution", "sha256"] as const

export * as SourceSchema from "./source.ts"
