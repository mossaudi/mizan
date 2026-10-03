import { Database } from "bun:sqlite"
import { existsSync, readFileSync } from "node:fs"
import { err, isErr, ok, type Claim, type ClaimVerdict, type ResolvedCitation, type Result } from "@mizan/core"
import {
  attestSnapshot,
  attestationUnreadable,
  describeAttestationProblem,
  readSnapshotMeta,
  resolveCitations,
  type AttestationProblem,
  type SnapshotIdentity,
} from "@mizan/corpus"
import { verifyAnswer } from "@mizan/verify"

/**
 * The corpus-backed verification port — the difference between a tool that verifies and a tool
 * that returns `unverifiable` in a convincing costume.
 *
 * ## Why this module exists
 *
 * The first version of the MCP server called `verifyAnswer` with `evidence: []` and a literal
 * `snapshotHash: "mcp"`. That is a total function with no inputs, so it answered every request
 * with the same verdict, and no request could ever be answered `verified`. It is also worse than
 * an unimplemented feature: a client cannot tell an honest "this citation is not in my corpus"
 * from a server that has never looked. An MCP tool whose failure mode is indistinguishable from
 * its answer is the CWE-345 shape, one process boundary out.
 *
 * So the evidence is resolved here — a database read, which `@mizan/verify` is forbidden from
 * performing (AGENTS.md section 9) — and the verifier receives it as data, exactly as the CLI does.
 *
 * ## The attestation gate, and why it is not optional
 *
 * `openCorpusVerifier` refuses to serve unless the corpus on disk matches the committed
 * `attestation.json`. Without it, an integrator's client would be told `verified` against
 * whatever `corpus.db` happened to be in the directory, with no statement anywhere that the
 * corpus had been authorised. A verdict is only meaningful relative to an attested snapshot;
 * serving one against an unattested corpus is a confident falsehood with a badge on it.
 *
 * ## Read-only, and read-only by construction
 *
 * The database is opened `{ readonly: true }`. The server has no write path at all — no ingest,
 * no ledger append — which is what makes "the MCP server does not modify the corpus or the
 * ledger" a property of the type surface rather than a promise in a comment.
 */

/** One request's claims, plus the budget the verifier must respect. */
export type VerifyInput = {
  readonly claims: readonly Claim[]
  /** `true` once the request has run past its budget. Checked by the verifier, not by us. */
  readonly deadlineExpired?: () => boolean
}

/**
 * The port `server.ts` depends on.
 *
 * A function, not an interface, because there is exactly one method and one implementation.
 * Declaring an interface here would be a second thing to keep in step with `verifyAnswer`'s
 * signature for no reader's benefit.
 */
export type Verifier = (input: VerifyInput) => readonly ClaimVerdict[]

/**
 * Why the server cannot serve.
 *
 * Each tag has exactly one correct surface — an MCP tool error carrying this tag as its
 * machine-readable `reason`, never a verdict. A client that cannot tell "the corpus is missing"
 * from "your citation is not in the corpus" is the defect this type exists to prevent.
 */
export type CorpusProblem =
  | { readonly _tag: "corpus_missing"; readonly detail: string }
  | { readonly _tag: "corpus_unusable"; readonly detail: string }
  | { readonly _tag: "attestation_unreadable"; readonly detail: string }
  | { readonly _tag: "attestation_mismatch"; readonly detail: string }

/** One sentence per tag, carrying the tag itself so a client can branch without reading English. */
export const describeCorpusProblem = (problem: CorpusProblem): string => {
  const head = `${problem._tag}: ${problem.detail}`
  if (problem._tag === "corpus_missing" || problem._tag === "corpus_unusable") {
    return `${head} — the MCP server will not answer without an attested corpus. Run \`bun run ingest\`.`
  }
  return `${head} — the corpus on disk is not the corpus attestation.json authorises, so no verdict computed against it would mean anything.`
}

/**
 * The snapshot identity the corpus claims for itself. `unusable` when it claims none.
 *
 * The read is wrapped because `bun:sqlite` opens a file lazily: a path that exists and is not a
 * database opens without complaint and throws on the first query. An exception here would escape
 * `openCorpusVerifier` as a crash, and a crash is one of the states the degradation matrix forbids
 * (AGENTS.md section 16) — the whole point of this function is that a file which cannot state its
 * identity is an answerable "no", not an unanswered question.
 */
const identityOf = (db: Database): Result<SnapshotIdentity, CorpusProblem> => {
  let meta: Readonly<Record<string, string>>
  try {
    meta = readSnapshotMeta(db)
  } catch (cause) {
    return err({
      _tag: "corpus_unusable",
      detail: `the corpus file is not a readable snapshot: ${cause instanceof Error ? cause.message : String(cause)}`,
    })
  }
  const snapshotHash = meta.snapshotHash ?? ""
  const recordCount = Number(meta.recordCount)
  if (snapshotHash.length === 0 || !Number.isInteger(recordCount)) {
    return err({
      _tag: "corpus_unusable",
      detail: `the snapshot recorded no usable identity (snapshotHash length ${snapshotHash.length}, recordCount ${String(meta.recordCount)})`,
    })
  }
  return ok({ snapshotHash, recordCount })
}

/**
 * Read and check the committed attestation against the corpus on disk.
 *
 * Fail-closed at both steps: an unreadable file is not an attestation with no fields, and a
 * mismatch is not a warning. Both are refusals, and both go through `corpusProblemOf` rather than
 * re-deciding the tag here, so the four tags have exactly one producer in this repository.
 *
 * ## Why the read is inside a `try`, when `existsSync` already ran
 *
 * `existsSync` and `readFileSync` answer different questions, and a TOCTOU window is not the only
 * gap between them: the path can be a DIRECTORY (`EISDIR`), it can be unreadable for want of a
 * permission the caller does not hold (`EACCES`), or it can be a dangling link that resolves to
 * nothing. All three throw, and this is a package boundary — a `throw` here escapes `openCorpusVerifier`,
 * whose signature promises `Result`, and lands in `main.ts` as an unhandled rejection. The honest
 * surface for "the corpus is there and its attestation cannot be read" is the same
 * `attestation_unreadable` refusal as a missing file, because to a caller it is the same fact, and
 * the message names the file so the operator can act on it.
 */
const checkAttested = (attestationPath: string, identity: SnapshotIdentity): Result<SnapshotIdentity, CorpusProblem> => {
  if (!existsSync(attestationPath)) {
    return err(corpusProblemOf(attestationUnreadable(`${attestationPath} does not exist: the corpus is present but nothing on disk says which corpus it is`)))
  }
  let raw: string
  try {
    raw = readFileSync(attestationPath, "utf8")
  } catch (cause) {
    return err(corpusProblemOf(attestationUnreadable(`${attestationPath} could not be read: ${cause instanceof Error ? cause.message : String(cause)}`)))
  }
  const attested = attestSnapshot(raw, identity)
  if (isErr(attested)) return err(corpusProblemOf(attested.error))
  return ok(identity)
}

/** Map an `AttestationProblem` onto a `CorpusProblem` without re-deciding which tag it is. */
export const corpusProblemOf = (problem: AttestationProblem): CorpusProblem =>
  problem._tag === "attestation_unreadable"
    ? { _tag: "attestation_unreadable", detail: describeAttestationProblem(problem) }
    : { _tag: "attestation_mismatch", detail: describeAttestationProblem(problem) }

/**
 * A verifier that resolves evidence against a snapshot whose identity is already attested.
 *
 * ## Why resolution runs per request
 *
 * The citations arrive with the request: a single snapshot serves an unbounded set of identifiers,
 * so there is nothing to pre-resolve. What that costs is a database read per citation — this module
 * is where the query happens, because `@mizan/verify` is forbidden from performing one.
 *
 * ## What bounds that work, stated accurately
 *
 * An earlier version of this comment claimed the citation cap in `@mizan/verify` bounds the work
 * per claim regardless of who is asking. That was false, and in the direction that matters: that cap
 * runs AFTER this function has already spent one SQL statement per citation, so a client could ask
 * for 5,000 citations on each of 32 claims, cost this module 160,000 queries, and have 159,904 of
 * the results discarded. Measured against the real snapshot, that call took 26.9 s against a 30 s
 * budget the verifier itself could never interrupt, because `deadlineExpired` is only consulted
 * downstream of this read.
 *
 * The bound is therefore `MAX_CITATIONS_PER_CLAIM` and `MAX_CITATIONS_PER_CALL` in `server.ts`,
 * enforced by `decodeVerifyArgs` before anything reaches this function. This module's job is to be
 * honest about where the cap does NOT apply: the verifier's own cap shapes the verdict, this
 * module's caller caps the query count.
 *
 * ## Unresolvable citations are reported as verdicts, not dropped
 *
 * `resolveCitations` returns a citation with an empty `records` array and `verifyAnswer` turns
 * that into `unverifiable (identifier_unresolved)` — a verdict, with the reason the client can act
 * on. Silently dropping them instead would hand the client a report that looks complete and is
 * missing exactly the citations that failed.
 */
export const createCorpusVerifier = (db: Database, identity: SnapshotIdentity): Verifier => {
  const resolve = (claims: readonly Claim[]): readonly ResolvedCitation[] =>
    resolveCitations(
      db,
      claims.flatMap((claim) => claim.citations),
    ).resolved

  return ({ claims, deadlineExpired }: VerifyInput): readonly ClaimVerdict[] => {
    const report = verifyAnswer({
      claims,
      evidence: resolve(claims),
      snapshotHash: identity.snapshotHash,
      deadlineExpired,
    })
    return report.claims
  }
}

/** How to find the corpus and the attestation. Relative to the repository root by default. */
export type CorpusOptions = {
  readonly corpusPath: string
  readonly attestationPath: string
}

/** A verifier and the database it reads. The caller owns the handle and must close it. */
export type OpenVerifier = {
  readonly verifier: Verifier
  readonly db: Database
  readonly identity: SnapshotIdentity
}

/**
 * Open the corpus read-only and attest it, or refuse.
 *
 * The handle is closed on every failure path, because a leaked read-only handle is a file lock
 * that outlives the process that made it — the kind of defect that appears as "the next ingest
 * cannot open the file" on a machine nobody was working on.
 */
export const openCorpusVerifier = (options: CorpusOptions): Result<OpenVerifier, CorpusProblem> => {
  if (!existsSync(options.corpusPath)) {
    return err({ _tag: "corpus_missing", detail: `${options.corpusPath} does not exist` })
  }

  let db: Database
  try {
    db = new Database(options.corpusPath, { readonly: true })
  } catch (cause) {
    return err({
      _tag: "corpus_unusable",
      detail: `${options.corpusPath} could not be opened read-only: ${cause instanceof Error ? cause.message : String(cause)}`,
    })
  }

  const identity = identityOf(db)
  if (isErr(identity)) {
    db.close()
    return identity
  }

  const attested = checkAttested(options.attestationPath, identity.value)
  if (isErr(attested)) {
    db.close()
    return attested
  }

  return ok({ verifier: createCorpusVerifier(db, identity.value), db, identity: identity.value })
}

export * as Verifier from "./verifier.ts"
