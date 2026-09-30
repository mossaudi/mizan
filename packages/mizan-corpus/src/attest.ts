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
  /**
   * The corpus changed between two reads of the same open handle.
   *
   * A distinct tag rather than another `attestation_mismatch`, because there is no second file to
   * disagree with: the thing that moved is the corpus the FIRST read returned, so there is nothing
   * for a caller to compare against and nothing to repair. A caller that pattern-matched on
   * `_tag` gets "this run measured two different corpora" instead of "the committed attestation is
   * wrong", and those two point at different operators and different files.
   */
  | { readonly _tag: "corpus_replaced_during_read"; readonly detail: string }

const READ_FAILURE: AttestationProblem["_tag"] = "attestation_unreadable"

const readProblem = (failure: CommittedReadFailure): AttestationProblem => ({
  _tag: READ_FAILURE,
  detail: describeReadFailure(failure),
})

/**
 * The `attestation_unreadable` problem, for a caller that failed at `open` rather than at decode.
 *
 * Exported so a surface which finds the file ABSENT can name the same problem the decoder names,
 * instead of inventing a second wording for one condition. A missing `attestation.json` and an
 * unreadable one are the same fact about the run — nothing on disk says which corpus this is — and
 * a harness that has to tell "absent" from "corrupt" from a pair of differently-shaped messages is a
 * harness that will eventually read the wrong one and publish a figure.
 *
 * The alternative, catching `ENOENT` and printing a bespoke sentence, is the defect this exists to
 * prevent: it is a third vocabulary for a condition the type already names, and it is the kind of
 * third vocabulary that skips the `attestation_unreadable` branch on the next surface someone adds.
 */
export const attestationUnreadable = (detail: string): AttestationProblem => ({
  _tag: READ_FAILURE,
  detail,
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
      // The JSON key, not the English word for it. "attests snapshot X" reads naturally and is
      // useless: the operator's next action is to open `attestation.json` and look at one named field.
      detail: `attestation.json attests snapshotHash ${short(committed.snapshotHash)}…, the open database is ${short(snapshot.snapshotHash)}…`,
    })
  }

  if (committed.recordCount !== snapshot.recordCount) {
    return err({
      _tag: "attestation_mismatch",
      detail: `attestation.json attests recordCount ${committed.recordCount}, the open database holds ${snapshot.recordCount}`,
    })
  }

  return ok(committed)
}

/**
 * One line for an operator. Log-safe: it names fields and counts, never content.
 *
 * The `_tag` is printed, not just the sentence, and that is the point of routing every failure
 * through one vocabulary: a harness, a test, or the next surface added to this repository has to be
 * able to tell "the file was not there" from "the file describes a different corpus" from "the
 * corpus moved under a read in progress" without pattern-matching on English that someone will
 * reword. Three names, all in the type, and a reader can key on any of them.
 */
export const describeAttestationProblem = (problem: AttestationProblem): string => {
  if (problem._tag === "attestation_unreadable") {
    return `${problem._tag}: attestation.json could not be read as an attestation: ${problem.detail}`
  }
  return `${problem._tag}: ${problem.detail}`
}

/**
 * Did the corpus stay the same corpus across a long read?
 *
 * ## Why this exists, and why it is not a footnote
 *
 * `attestSnapshot` answers "is the snapshot on disk the one we authorised?" and it is asked ONCE,
 * before any work starts. The benchmark then reads 27,234 records out of a file another process may
 * be rewriting, and every figure it prints is a statement about the corpus as it was when the
 * attestation was checked. If an ingest replaced the database in between, those figures describe
 * two different corpora: a baseline rate computed against rows that no longer exist and a record
 * count copied from a header that has been overwritten. Neither number is wrong on its own, and
 * their difference is a fabrication of exactly the kind this repository exists to prevent.
 *
 * Re-reading the identity at the end is the only way to know, and `bun run benchmark:vs-search` was
 * already doing it inline — with no test, because provoking a mid-run replacement requires winning a
 * write race against another process, which is both platform-dependent and a reliable source of
 * flaky CI (AGENTS.md section 14: a flaky CI job is a defect, not noise). So the comparison moved
 * here, where it is a pure function of two identities and can be watched failing, and the runner
 * calls it. That is a trade of end-to-end coverage for determinism, stated rather than hidden.
 *
 * ## Why this module and not the benchmark
 *
 * `attest.ts` is the one place in the repository that answers "is this the corpus you think it is",
 * and it already answers two other versions of that question — `compareAttestations` for a fresh
 * ingest, `attestSnapshot` for an already-built snapshot. A third copy inside `scripts/benchmark/`
 * would be a second definition of what corpus identity IS, and the two would drift exactly where it
 * matters: a field added to `SnapshotIdentity` and compared in one place but not the other.
 *
 * ## What counts as drift
 *
 * `snapshotHash` or `recordCount`, the same two fields `attestSnapshot` compares and for the same
 * reason: the hash is a digest over the records, so matching it already implies every field of every
 * row is unchanged. A hash that is still equal but a count that moved is reported, because that is
 * what a partially-applied write looks like. A hash that is still equal and a count that moved is
 * possible and would be a defect upstream — the hash covers the records and the count is derived
 * from them — which is why this returns the failure rather than reconciling the two.
 */
export const attestSnapshotUnchanged = (
  before: SnapshotIdentity,
  after: SnapshotIdentity,
): Result<SnapshotIdentity, AttestationProblem> => {
  if (after.snapshotHash !== before.snapshotHash) {
    return err({
      _tag: "corpus_replaced_during_read",
      detail: `the corpus changed while it was being read: snapshotHash ${short(after.snapshotHash)}… was ${short(before.snapshotHash)}…`,
    })
  }

  if (after.recordCount !== before.recordCount) {
    return err({
      _tag: "corpus_replaced_during_read",
      detail: `the corpus changed while it was being read: recordCount ${after.recordCount} was ${before.recordCount}`,
    })
  }

  return ok(before)
}

export * as Attest from "./attest.ts"
