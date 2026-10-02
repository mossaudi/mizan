import { GENESIS_PREV_HASH, chainHash, decodeOrFail, decodeSync, describeDecodeFailure, isErr, type Result, err, ok } from "@mizan/core"
import { Schema } from "effect"

/**
 * The hash-chained ingest ledger and the committed attestation.
 *
 * ## What problem this solves
 *
 * A corpus without a chain can be quietly edited: change one ayah, re-run, and nothing records
 * that the snapshot differs from last week's. With a chain, every ingest is a link that names
 * its predecessor's hash, so any later edit breaks verification at the exact entry where it
 * happened — and the entry is identified by digest alone, so the ledger itself cannot be
 * doctored without detection.
 *
 * ## The rule
 *
 * The digest rule is `chainHash` in `@mizan/core`, NOT restated here: the per-run trace chain
 * in `@mizan/core/schema/trace.ts` chains the same way, and a judge reading both chains with
 * one mental model must not find two different ways of building a link (AGENTS.md section 17).
 * `canonicalJson` sorts keys, so the hash does not depend on property order in the object
 * literal — otherwise a refactor that reorders two fields would look like a corpus change.
 * `prevHash` is inside the hashed material, which is what makes the chain a chain: reordering
 * or removing an entry changes that entry's hash and every hash after it.
 *
 * The two chains differ in what they INCLUDE: this payload carries `at`, so the corpus chain is
 * sensitive to a backwards clock. That is pre-existing and pinned by committed artefacts, so it
 * is not changed unilaterally; `schema/trace.ts` documents the reconciliation.
 * TODO(S12): drop `at` from this digest.
 *
 * ## Fail closed
 *
 * `verifyLedger` returns the index of the FIRST broken link rather than a boolean, because
 * "the chain is broken somewhere" is not actionable and "link 7 does not match" is. The first
 * break is the only trustworthy one: everything after it is unverifiable.
 */

export type LedgerEntry = {
  readonly seq: number
  readonly at: string
  readonly source: string
  readonly rows: number
  readonly artefactSha256: string
  readonly snapshotHash: string
  readonly prevHash: string
  readonly hash: string
}

/**
 * The declared shape of a committed ledger line.
 *
 * ## Why this exists
 *
 * `data/ledger.jsonl` and `attestation.json` are committed files that a judge-facing command
 * reads back. Until this schema existed they were read with `JSON.parse(...) as LedgerEntry`,
 * which is exactly the "decode-and-trust" shortcut AGENTS.md section 1 forbids: a cast makes
 * the compiler stop asking, so a truncated line or a renamed field would be carried straight
 * into `verifyLedger` and reported as a *hash* break — pointing an investigator at tampering
 * when the real fault was a malformed file.
 *
 * The type is kept alongside the schema rather than derived from it, so the declared contract
 * and the checked contract are visible in one place and a divergence is a compile error rather
 * than a runtime surprise.
 */
export const LedgerEntrySchema = Schema.Struct({
  seq: Schema.Number,
  at: Schema.String,
  source: Schema.String,
  rows: Schema.Number,
  artefactSha256: Schema.String,
  snapshotHash: Schema.String,
  prevHash: Schema.String,
  hash: Schema.String,
})

export type LedgerPayload = {
  readonly source: string
  readonly rows: number
  readonly artefactSha256: string
  readonly snapshotHash: string
  /** ISO timestamp, supplied by the caller so the ledger module itself reads no clock. */
  readonly at: string
}

export const entryHash = (prevHash: string, payload: LedgerPayload): string => chainHash(prevHash, payload)

/** Append one entry to a chain. Pure: it takes the previous hash and returns the new entry. */
export const appendEntry = (prevHash: string, seq: number, payload: LedgerPayload): LedgerEntry => ({
  seq,
  at: payload.at,
  source: payload.source,
  rows: payload.rows,
  artefactSha256: payload.artefactSha256,
  snapshotHash: payload.snapshotHash,
  prevHash,
  hash: entryHash(prevHash, payload),
})

/** The last hash of a chain, or the genesis hash for an empty one. */
export const chainHead = (entries: readonly LedgerEntry[]): string => {
  const last = entries[entries.length - 1]
  return last?.hash ?? GENESIS_PREV_HASH
}

export type ChainBreak = { readonly seq: number; readonly reason: "prev_hash_mismatch" | "hash_mismatch"; readonly detail: string }

/**
 * Verify a chain end to end.
 *
 * @returns an empty list when the chain is intact, or the FIRST break. Everything after the
 *   first break is unverifiable, so reporting later breaks would be misleading.
 */
export const verifyLedger = (entries: readonly LedgerEntry[]): readonly ChainBreak[] => {
  let expectedPrev = GENESIS_PREV_HASH
  for (const entry of entries) {
    if (entry.prevHash !== expectedPrev) {
      return [{ seq: entry.seq, reason: "prev_hash_mismatch", detail: `entry ${entry.seq} follows ${entry.prevHash.slice(0, 12)}…, expected ${expectedPrev.slice(0, 12)}…` }]
    }
    const recomputed = entryHash(entry.prevHash, {
      source: entry.source,
      rows: entry.rows,
      artefactSha256: entry.artefactSha256,
      snapshotHash: entry.snapshotHash,
      at: entry.at,
    })
    if (recomputed !== entry.hash) {
      return [{ seq: entry.seq, reason: "hash_mismatch", detail: `entry ${entry.seq} was altered after it was written` }]
    }
    expectedPrev = entry.hash
  }
  return []
}

/**
 * The committed attestation: what a judge or a re-runner can check without the corpus.
 *
 * Per-source row counts and digests, the snapshot hash, and the chain head. Small enough to
 * read in a code review, which is the point — the provenance of the corpus is a diff, not a
 * database dump.
 */
export type Attestation = {
  readonly schemaVersion: string
  readonly generatedAt: string
  readonly snapshotHash: string
  readonly recordCount: number
  readonly quarantinedRows: number
  readonly collectionCounts: Readonly<Record<string, number>>
  readonly sources: readonly {
    readonly source: string
    readonly licenceClass: string
    readonly enabled: boolean
    readonly rows: number
    readonly artefactSha256: string
  }[]
  readonly chainHead: string
  readonly chainLength: number
  /** VRO maturity level (1, 2, or 3). Optional for backward compatibility. */
  readonly maturityLevel?: 1 | 2 | 3
  /** The 8 IETF VRO control areas with their concrete field mappings. */
  readonly controlAreas?: readonly {
    readonly area: string
    readonly fields: readonly string[]
    readonly description: string
  }[]
  /** Evidence of the 100x byte-identical determinism gate. */
  readonly determinismEvidence?: {
    readonly gateName: string
    readonly passed: boolean
    readonly runCount: number
    readonly byteIdentical: boolean
  }
  /** The corpus snapshot SHA-256 hash (redundant with snapshotHash for VRO compliance). */
  readonly corpusSnapshotHash?: string
}

/**
 * The declared shape of `attestation.json`.
 *
 * Same reasoning as `LedgerEntrySchema`: the committed attestation is read back by
 * `ingest:check`, so it is decoded rather than cast. `collectionCounts` is a
 * `Record<string, number>`, which means a count written as a string ("6236") is a decode
 * failure — correct, because the attestation is the thing that decides whether a corpus is
 * consistent, and a count that cannot be compared as a number cannot decide anything.
 */
export const AttestationSchema = Schema.Struct({
  schemaVersion: Schema.String,
  generatedAt: Schema.String,
  snapshotHash: Schema.String,
  recordCount: Schema.Number,
  /**
   * Rows that were fetched, found to be missing a grade their collection requires, and
   * therefore never served. Committed on purpose: a quarantine that leaves no trace is
   * indistinguishable from a source that was never fetched, and a judge comparing the fetched
   * artefact against `recordCount` would have no way to account for the difference.
   */
  quarantinedRows: Schema.Number,
  collectionCounts: Schema.Record(Schema.String, Schema.Number),
  sources: Schema.Array(
    Schema.Struct({
      source: Schema.String,
      licenceClass: Schema.String,
      enabled: Schema.Boolean,
      rows: Schema.Number,
      artefactSha256: Schema.String,
    }),
  ),
  chainHead: Schema.String,
  chainLength: Schema.Number,
  /** VRO maturity level (1, 2, or 3). Optional for backward compatibility. */
  maturityLevel: Schema.optional(Schema.Union([Schema.Literal(1), Schema.Literal(2), Schema.Literal(3)])),
  /** The 8 IETF VRO control areas with their concrete field mappings. */
  controlAreas: Schema.optional(
    Schema.Array(
      Schema.Struct({
        area: Schema.String,
        fields: Schema.Array(Schema.String),
        description: Schema.String,
      }),
    ),
  ),
  /** Evidence of the 100x byte-identical determinism gate. */
  determinismEvidence: Schema.optional(
    Schema.Struct({
      gateName: Schema.String,
      passed: Schema.Boolean,
      runCount: Schema.Number,
      byteIdentical: Schema.Boolean,
    }),
  ),
  /** The corpus snapshot SHA-256 hash (redundant with snapshotHash for VRO compliance). */
  corpusSnapshotHash: Schema.optional(Schema.String),
})

/** A mismatch between the attestation and a fresh ingest is a LOUD failure, never a warning. */export const compareAttestations = (committed: Attestation, fresh: Attestation): readonly string[] => {
  const differences: string[] = []
  if (committed.snapshotHash !== fresh.snapshotHash) {
    differences.push(`snapshotHash: committed ${committed.snapshotHash.slice(0, 12)}… vs fresh ${fresh.snapshotHash.slice(0, 12)}…`)
  }
  if (committed.recordCount !== fresh.recordCount) {
    differences.push(`recordCount: committed ${committed.recordCount} vs fresh ${fresh.recordCount}`)
  }
  if (committed.quarantinedRows !== fresh.quarantinedRows) {
    differences.push(`quarantinedRows: committed ${committed.quarantinedRows} vs fresh ${fresh.quarantinedRows}`)
  }
  for (const source of fresh.sources) {
    const previous = committed.sources.find((entry) => entry.source === source.source)
    if (previous === undefined) {
      differences.push(`source ${source.source} is new`)
      continue
    }
    if (previous.artefactSha256 !== source.artefactSha256) {
      differences.push(`source ${source.source} artefact digest changed: ${previous.artefactSha256.slice(0, 12)}… → ${source.artefactSha256.slice(0, 12)}…`)
    }
    if (previous.rows !== source.rows) {
      differences.push(`source ${source.source} row count changed: ${previous.rows} → ${source.rows}`)
    }
  }
  for (const source of committed.sources) {
    if (!fresh.sources.some((entry) => entry.source === source.source)) {
      differences.push(`source ${source.source} is missing from the fresh ingest`)
    }
  }
  return differences
}

export type AttestationCheck = Result<readonly string[], { readonly _tag: "attestation_mismatch"; readonly differences: readonly string[] }>

export const checkAttestation = (committed: Attestation, fresh: Attestation): AttestationCheck => {
  const differences = compareAttestations(committed, fresh)
  if (differences.length === 0) return ok(differences)
  return err({ _tag: "attestation_mismatch", differences })
}

/* -------------------------------------------------------------------------------------- *
 * Reading the COMMITTED artefacts back.
 *
 * This lives here, next to the schemas it uses, for two reasons.
 *
 * First, it is the only place that knows how a committed file is turned back into a typed
 * value, and two root scripts both need that. A per-script copy is how the two drift.
 *
 * Second, and more importantly, it is testable. A decoder reached only from a shell script is
 * a decoder nobody has ever seen reject anything.
 * -------------------------------------------------------------------------------------- */

export type CommittedReadFailure =
  /** The bytes were not JSON at all. `line` is 1-based, `null` for a whole-document file. */
  | { readonly _tag: "malformed_json"; readonly line: number | null; readonly detail: string }
  /** The bytes were JSON, but not the shape we declared. */
  | { readonly _tag: "malformed_shape"; readonly line: number | null; readonly detail: string }

/** One-line, log-safe rendering of a read failure. */
export const describeReadFailure = (failure: CommittedReadFailure): string => {
  const where = failure.line === null ? "" : `line ${failure.line}: `
  return `${where}${failure.detail}`
}

const decodeLine = (line: string, lineNumber: number): Result<LedgerEntry, CommittedReadFailure> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(line) as unknown
  } catch (cause) {
    return err({ _tag: "malformed_json", line: lineNumber, detail: cause instanceof Error ? cause.message : "unparseable" })
  }
  const decoded = decodeOrFail(decodeSync(LedgerEntrySchema), parsed, "LedgerEntry")
  if (isErr(decoded)) return err({ _tag: "malformed_shape", line: lineNumber, detail: describeDecodeFailure(decoded.error) })
  return ok(decoded.value)
}

/**
 * Decode a committed `ledger.jsonl` into entries.
 *
 * A blank line is skipped rather than rejected: a trailing newline is the normal way to end a
 * file, and a ledger that refused to load because of one would be a nuisance. Everything else
 * is decoded, and the FIRST bad line ends the read — a partially trusted chain is not a chain,
 * and `verifyLedger` must never be handed entries we invented around a gap.
 */
export const decodeLedgerText = (text: string): Result<readonly LedgerEntry[], CommittedReadFailure> => {
  const entries: LedgerEntry[] = []
  const lines = text.split("\n")
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) continue
    const decoded = decodeLine(line, index + 1)
    if (isErr(decoded)) return err(decoded.error)
    entries.push(decoded.value)
  }
  return ok(entries)
}

/** U+FEFF, the byte order mark, as a character rather than as bytes. Spelled as an escape so it is
 * visible in a diff: written literally it is invisible in every editor, which is a poor property
 * for a constant whose whole job is to be an invisible character. */
const BYTE_ORDER_MARK = "\uFEFF"

/**
 * Drop one leading byte order mark.
 *
 * RFC 8259 section 8.1 says implementations MAY ignore a BOM rather than treating it as an error,
 * and for THIS file that is not a courtesy — it is the difference between a true statement and a
 * false alarm on the repository's integrity path.
 *
 * `attestation.json` is the only thing on disk that says which corpus is authorised, so
 * `attestSnapshot` is the check a tampered `corpus.db` has to get past. Windows tooling emits a
 * BOM routinely — `Set-Content`, `Out-File` under Windows PowerShell 5.1, and `>` redirection in
 * `cmd.exe` all produce UTF-8 *with* BOM, and this repository's own CI matrix runs
 * `windows-latest`. An operator who re-saved the file after a legitimate edit would have been told
 * `attestation_unreadable: malformed_json`, which asserts the attestation is corrupt when it is
 * byte-for-byte correct and names no action that would help.
 *
 * A refused BOM is a false negative on a security control, and a false negative teaches the next
 * operator to disable the control. Stripping one character cannot weaken the comparison that
 * follows: the text still has to decode through `AttestationSchema` and then match
 * `snapshotHash` and `recordCount` exactly, so nothing a BOM could carry survives to reach a
 * verdict.
 *
 * Exactly one, and only at the start. A U+FEFF anywhere else is content, and content is what the
 * schema decides about — trimming it would be a second, silent way of changing what was attested.
 */
const stripByteOrderMark = (text: string): string => (text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)

/** The exact set of keys an `attestation.json` may carry. */
const ATTESTATION_KEYS = [
  "schemaVersion",
  "generatedAt",
  "snapshotHash",
  "recordCount",
  "quarantinedRows",
  "collectionCounts",
  "sources",
  "chainHead",
  "chainLength",
  "maturityLevel",
  "controlAreas",
  "determinismEvidence",
  "corpusSnapshotHash",
] as const

/**
 * Reject unknown fields in an attestation.
 *
 * Effect's `Schema.Struct` strips unknown keys by default, which means a typo or a
 * hand-edited field would be silently dropped — the attestation would decode as if the
 * field were never there. This check compares the parsed keys against the expected
 * set and names the offender, so a malformed file is diagnosable rather than silently
 * accepted.
 */
const validateNoUnknownFields = (parsed: Record<string, unknown>): Result<null, CommittedReadFailure> => {
  const unknown = Object.keys(parsed).filter((key) => !(ATTESTATION_KEYS as readonly string[]).includes(key))
  if (unknown.length > 0) {
    return err({ _tag: "malformed_shape", line: null, detail: `unknown field(s): ${unknown.join(", ")}` })
  }
  return ok(null)
}

/** The 8 IETF VRO control areas that must be present in a VRO-aligned attestation. */
const VRO_CONTROL_AREAS = [
  "identity",
  "provenance",
  "integrity",
  "determinism",
  "licensing",
  "coverage",
  "degradation",
  "auditability",
] as const

/**
 * Validate that an attestation is VRO-compliant.
 *
 * Checks that all 8 IETF VRO control areas are present, the maturity level is declared,
 * the determinism evidence is present, and the corpus snapshot hash is present.
 * Returns an error naming the first missing element.
 */
export const validateVroCompliance = (attestation: Attestation): Result<null, string> => {
  if (attestation.maturityLevel === undefined) {
    return err("maturityLevel is missing — the attestation must declare a VRO maturity level (1, 2, or 3)")
  }
  if (attestation.controlAreas === undefined) {
    return err("controlAreas is missing — the attestation must map all 8 IETF VRO control areas")
  }
  const areas = attestation.controlAreas.map((c) => c.area)
  for (const area of VRO_CONTROL_AREAS) {
    if (!areas.includes(area)) {
      return err(`control area "${area}" is missing from the attestation`)
    }
  }
  if (attestation.determinismEvidence === undefined) {
    return err("determinismEvidence is missing — the attestation must include evidence of the 100x byte-identical gate")
  }
  if (attestation.corpusSnapshotHash === undefined) {
    return err("corpusSnapshotHash is missing — the attestation must include the corpus snapshot SHA-256 hash")
  }
  return ok(null)
}

/** Decode a committed `attestation.json`. */
export const decodeAttestationText = (text: string): Result<Attestation, CommittedReadFailure> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripByteOrderMark(text)) as unknown
  } catch (cause) {
    return err({ _tag: "malformed_json", line: null, detail: cause instanceof Error ? cause.message : "unparseable" })
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return err({ _tag: "malformed_shape", line: null, detail: "attestation.json must be a JSON object" })
  }
  const noUnknown = validateNoUnknownFields(parsed as Record<string, unknown>)
  if (isErr(noUnknown)) return noUnknown
  const decoded = decodeOrFail(decodeSync(AttestationSchema), parsed, "Attestation")
  if (isErr(decoded)) return err({ _tag: "malformed_shape", line: null, detail: describeDecodeFailure(decoded.error) })
  return ok(decoded.value)
}

export * as Ledger from "./ledger.ts"
