import { isErr, type Result, err, ok } from "@mizan/core"
import { decodeAttestationText, describeReadFailure, type Attestation, type CommittedReadFailure } from "./ledger.ts"

/**
 * The QUERY path's attestation check: is the snapshot on disk the one we said we would serve?
 *
 * ## Why this has to exist here and not only in `ingest.ts`
 *
 * `runIngest` already fails closed on an attestation mismatch, and `ingest:check` re-runs it in
 * CI. Both run at BUILD time. Nothing ran at QUERY time, which is the state that matters when a
 * badge is printed: the corpus is a file on disk that anyone can replace, `attestation.json` is a
 * separate file that says what that corpus should be, and until now the shipped `ask` path read
 * the first and never compared it against the second. A DB swapped on disk, or a partial ingest
 * that stopped after the rows but before the attestation was rewritten, produced ordinary
 * verdicts from an unattested corpus — and `verifyAnswer` stamped those verdicts with whatever
 * `snapshotHash` the snapshot happened to claim about itself. A file that is its own authority
 * attests to nothing.
 *
 * This is the "attestation mismatch -> loud integrity error, no verdict" row of the degradation
 * matrix (AGENTS.md section 16), implemented on the path that actually computes verdicts.
 *
 * ## Why the caller supplies the identity rather than a Database
 *
 * A `Database` handle would make this the second place that knows the `snapshot_meta` schema.
 * The caller already read that row through `readSnapshotMeta`, and passing the two values keeps
 * the query path's claim to "opens the snapshot, compares it, and refuses" without a second
 * reader. The reader is `snapshot.ts`; this is the comparison.
 *
 * ## What is compared, and what is deliberately not
 *
 * `snapshotHash` and `recordCount`. The hash is a digest over the RECORDS, so matching it already
 * implies every field of every row is unchanged, and a per-column comparison would be a second,
 * weaker way of saying the same thing. The count is checked anyway because it is the field a
 * human reads: when the hashes disagree, "27,234 records versus 3" tells an investigator far more
 * than two 64-character strings do.
 *
 * The per-source `artefactSha256` values are NOT compared, because they describe upstream fetches
 * at ingest time and have no counterpart in a built snapshot. Comparing them here would compare
 * the database to a file it has no access to, which is `ingest:check`'s job and not this one's.
 */

export type SnapshotIdentity = {
  readonly snapshotHash: string
  readonly recordCount: number
}

export type AttestationProblem =
  /** The committed file is missing, unreadable, or is not an `Attestation` at all. */
  | { readonly _tag: "attestation_unreadable"; readonly detail: string }
  /** The file decoded, and it describes a different corpus than the one on disk. */
  | { readonly _tag: "attestation_mismatch"; readonly detail: string }

const READ_FAILURE: AttestationProblem["_tag"] = "attestation_unreadable"

const readProblem = (failure: CommittedReadFailure): AttestationProblem => ({
  _tag: READ_FAILURE,
  detail: describeReadFailure(failure),
})

/** 12 hex characters is enough to eyeball and short enough to read out loud. */
const short = (hash: string): string => hash.slice(0, 12)

/**
 * Compare the committed attestation against the open snapshot.
 *
 * @returns the decoded attestation when the two agree. On any disagreement, an error carrying a
 *   message naming the field — a caller that cannot say WHICH field diverged has not told an
 *   operator anything they can act on.
 */
export const attestSnapshot = (committedText: string, snapshot: SnapshotIdentity): Result<Attestation, AttestationProblem> => {
  const decoded = decodeAttestationText(committedText)
  if (isErr(decoded)) return err(readProblem(decoded.error))
  const committed = decoded.value

  if (committed.snapshotHash !== snapshot.snapshotHash) {
    return err({
      _tag: "attestation_mismatch",
      detail: `attestation.json attests snapshot ${short(committed.snapshotHash)}…, the open database is ${short(snapshot.snapshotHash)}…`,
    })
  }

  if (committed.recordCount !== snapshot.recordCount) {
    return err({
      _tag: "attestation_mismatch",
      detail: `attestation.json attests ${committed.recordCount} records, the open database holds ${snapshot.recordCount}`,
    })
  }

  return ok(committed)
}

/** One line for an operator. Log-safe: it names fields and counts, never content. */
export const describeAttestationProblem = (problem: AttestationProblem): string =>
  problem._tag === "attestation_unreadable"
    ? `attestation.json could not be read as an attestation: ${problem.detail}`
    : `attestation mismatch: ${problem.detail}`

export * as Attest from "./attest.ts"
