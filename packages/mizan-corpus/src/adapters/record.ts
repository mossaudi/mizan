import { normalizeForMatch, sha256Hex, type CorpusRecord } from "@mizan/core"
import type { SourceMeta } from "./source-meta.ts"
import type { RawRecord } from "./types.ts"

/**
 * `RawRecord` -> `CorpusRecord`. The single place `textMatch` is created.
 *
 * Everything invariant about a stored record is decided here, once:
 *
 *  - the fold, applied ONCE at ingest (AGENTS.md / `record.ts`: `textMatch` is a matching
 *    key, `textDisplay` is the truth);
 *  - `attribution`, `license`, `licenseUrl` and `gradeSource` copied from the source
 *    descriptor, so they are GENERATED from source metadata and can never be hand-typed per
 *    row (that is how a corpus ends up with 40 000 slightly different credit lines);
 *  - the grade policy, so `grade`/`gradeBasis`/`gradeApplicable` agree with each other.
 *
 * ## A `no-derivatives` source gets an assertion, not a promise
 *
 * For a `no-derivatives` source the adapter must supply exactly what the source published.
 * `textDisplay` is stored as received — no trimming beyond the file's own line structure, no
 * diacritic stripping, no re-encoding. What makes that checkable rather than aspirational is
 * that `textDisplay` is the ONLY field a user surface may render, and G-6.1/G-6.3 ensure no
 * other code can start treating a folded string as displayable text.
 */

export type BuildContext = {
  readonly meta: SourceMeta
  /** The source descriptor's slug, used as `gradeSource`. */
  readonly gradeSource: string
}

export const toCorpusRecord = (raw: RawRecord, context: BuildContext): CorpusRecord => {
  const { descriptor } = context.meta
  const sourceUrl = raw.sourceUrl ?? descriptor.url
  return {
    id: raw.id,
    collection: raw.collection,
    number: raw.number,
    grade: raw.grade,
    gradeApplicable: descriptor.gradeApplicable,
    gradeSource: context.gradeSource,
    gradeBasis: raw.gradeBasis,
    attribution: descriptor.attribution,
    license: descriptor.license,
    licenseUrl: descriptor.licenseUrl,
    sourceUrl,
    textDisplay: raw.textDisplay,
    textMatch: normalizeForMatch(raw.textDisplay),
    translation: raw.translation ?? undefined,
  }
}

/** Fold a record the same way, for a caller that only needs the key (tests, diagnostics). */
export const foldText = (textDisplay: string): string => normalizeForMatch(textDisplay)

/**
 * The snapshot hash: a digest over the RECORDS, not over the file.
 *
 * A digest of `corpus.db` would change on every rebuild even when the content is identical,
 * because SQLite writes page-level state. A digest of the ordered record ids and their
 * `textMatch` values changes only when the corpus changes, which is the property the
 * `snapshotHash` in a verdict report is supposed to have: "these verdicts were computed
 * against THIS corpus".
 */
/**
 * The single digest that identifies a snapshot.
 *
 * ## What MUST be in the material
 *
 * Every field the snapshot stores and a person relies on: identity, BOTH text columns, and
 * the grade with its attribution. This originally hashed `id` and `textMatch` only, and that
 * was wrong twice over:
 *
 *  - **`grade` was unpinned.** The grade is a religious-legal claim (AGENTS.md section 15).
 *    A grade rewritten across all 36,024 hadith records would have left `snapshotHash`
 *    byte-identical, so the attestation would still verify while the grades had changed. The
 *    live demonstration of that hole: every hadith grade was `"[object Object] / …"`, and the
 *    hash did not move when it was fixed.
 *  - **`textDisplay` was unpinned.** That is the text a user reads beside a "verified" badge.
 *    Tampering with it would not disturb the hash, so the corpus could display one wording and
 *    attest to another.
 *
 * Hashing only the *match* column would be defensible if nothing else were ever shown. It is.
 *
 * ## What is deliberately NOT in the material
 *
 * The ingest timestamp, the artefact digest, and the licence strings. They belong to the
 * ledger entry and the registry, which are hashed and verified in their own right; folding
 * them in here would make "same corpus" depend on when it was fetched.
 *
 * ## Why a field list, and not the whole object
 *
 * `canonicalJson` over the entire record would be the obvious implementation and it is worse:
 * it makes the digest change whenever a new field is added, including a field that does not
 * describe content. This list is explicit, so a new stored field forces a decision here rather
 * than silently changing every published hash.
 */
const SNAPSHOT_HASHED_FIELDS = [
  "id",
  "collection",
  "number",
  "grade",
  "gradeSource",
  "gradeApplicable",
  "textDisplay",
  "textMatch",
] as const

export const computeSnapshotHash = (records: readonly CorpusRecord[]): string => {
  const ordered = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const material = ordered
    .map((record) => SNAPSHOT_HASHED_FIELDS.map((field) => `${field}=${String(record[field] ?? "")}`).join("|"))
    .join("\n")
  return sha256Hex(material)
}

/**
 * The exact field list the snapshot digest covers, exported so a test can assert that a
 * changed field MOVES the hash. A hash nobody has seen react to a tamper is decorative.
 */
export const snapshotHashedFields = (): readonly string[] => SNAPSHOT_HASHED_FIELDS

export * as Record_ from "./record.ts"
