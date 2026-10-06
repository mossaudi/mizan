import { Database } from "bun:sqlite"
import { existsSync, readFileSync } from "node:fs"
import { conditionOf, describeCondition, err, isErr, ok, type Claim, type ClaimVerdict, type DegradationCondition, type ResolvedCitation, type Result } from "@mizan/core"
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
 *
 * ## Why the answer is a `Result` and not an array
 *
 * Because "this verifier cannot answer" is a value the type system has to carry, and the moment it is
 * carried by something else — a thrown `Error`, a sentinel array, a `null` — it becomes a fact the
 * server has to *remember* to check. `refusingVerifier` below is the whole reason this is worth a
 * signature: an MCP server with no corpus serves every request with a typed refusal, and the only way that
 * is expressible without inventing a verdict is for the port to have an error channel.
 */
export type Verifier = (input: VerifyInput) => Result<readonly ClaimVerdict[], CorpusProblem>

/**
 * Why the server cannot serve.
 *
 * Each tag has exactly one correct surface — an MCP tool error carrying this tag as its
 * machine-readable `reason`, never a verdict. A client that cannot tell "the corpus is missing"
 * from "your citation is not in the corpus" is the defect this type exists to prevent.
 *
 * ## Why `verifier_faulted` is a tag and not a reuse of `corpus_unusable`
 *
 * The catch-all in `server.ts` catches whatever escapes the verifier port, and `corpus_unusable`
 * used to be its word. That asserts something the catch cannot know: that the corpus file is present
 * but cannot be opened. A throw can equally come from the containment walk in `@mizan/verify`, from a
 * driver that has never been heard of, or from a future step in the chain — and each of those is a
 * fault in *our* verification, not a statement about the corpus on disk.
 *
 * The distinction has a remedy behind it. `corpus_unusable` sends an operator to re-run
 * `bun run ingest`, which for a throw originating downstream of the query will produce the same
 * corpus and the same failure — the wrong fix, presented confidently. `verifier_faulted` says the
 * fault is in the verifier and projects onto `unverifiable`, whose sentence is the honest one: the
 * claim reached the verifier and could not be decided. Fail-closed means *not* claiming a cause we
 * did not establish (AGENTS.md section 3), and the two conditions differ only in which remedy they
 * name.
 */
export type CorpusProblem =
  | { readonly _tag: "corpus_missing"; readonly detail: string }
  | { readonly _tag: "corpus_unusable"; readonly detail: string }
  | { readonly _tag: "verifier_faulted"; readonly detail: string }
  | { readonly _tag: "attestation_unreadable"; readonly detail: string }
  | { readonly _tag: "attestation_mismatch"; readonly detail: string }

/**
 * The MCP `CorpusProblem` tags projected onto the shared degradation vocabulary.
 *
 * ## Why this is a one-to-one map and not a guess
 *
 * `corpus_missing` used to have no honest name in the shared set, and `corpus_unusable` was
 * projected onto `corpus_absent` — which tells a client the corpus is not on disk when it is, and
 * corrupt. Two states with opposite remedies ("run ingest" versus "the file is broken") behind one
 * word is how an integrator spends an afternoon on the wrong fix, so the vocabulary grew two names
 * instead: see `packages/mizan-core/src/schema/degradation.ts` for the reasoning.
 *
 * `verifier_faulted` projects onto `unverifiable` rather than onto a new shared name, because from
 * the *product's* point of view the two are the same statement: a claim reached the verifier and the
 * honest answer is that it could not be decided. The extra specificity is worth keeping in the MCP
 * tag, where an integrator can see the exact fault, and is not worth a new word in the shared
 * vocabulary, where it would be one more name a CLI run could never produce.
 *
 * The result is that every tag has exactly one condition and every tag reaches the wire carrying
 * the same word the CLI prints, so a customer comparing the two surfaces cannot be told two reasons
 * for one absence.
 */
const CONDITION_BY_TAG: Readonly<Record<CorpusProblem["_tag"], string>> = {
  corpus_missing: "corpus_absent",
  corpus_unusable: "corpus_unusable",
  verifier_faulted: "unverifiable",
  attestation_unreadable: "attestation_unreadable",
  attestation_mismatch: "attestation_mismatch",
}

/**
 * The shared condition for a problem, or `null` when this build's vocabulary does not contain it.
 *
 * `null` rather than a throw or a cast: the projection goes through `conditionOf`, which is the one
 * place a name enters the vocabulary, so a tag added here without a matching literal fails as a
 * `DecodeFailure` a caller can report instead of becoming a name the rest of the repository has
 * never heard of. `test/clean-clone.test.ts` asserts every tag projects, which is what keeps the
 * `null` unreachable in practice.
 */
export const conditionOfCorpusProblem = (problem: CorpusProblem): DegradationCondition | null => {
  const decoded = conditionOf(CONDITION_BY_TAG[problem._tag])
  return decoded.ok ? decoded.value : null
}

/**
 * Every shape an absolute path arrives in, in one alternation.
 *
 * ## The three shapes, and why one regex has to know all of them
 *
 * A path reaches a `detail` in one of three spellings, and the original two-alternative pattern only
 * recognised the bare ones:
 *
 *   1. **Bare** — `C:\Users\…`, `c:/users/…`, `/home/…`.
 *   2. **Scheme-prefixed URI** — `file:///C:/Users/…`, `unix:///var/lib/…`. Produced by
 *      `pathToFileURL`, by `URL#href`, and by driver messages that render a path as a URL.
 *   3. **Key-prefixed** — `path:C:\Users\…`, and `{ path: 'C:\Users\…' }` from an inspected `SystemError`.
 *
 * Shape 2 leaked *completely*: the leading `/` of `unix:///var/lib` is preceded by `:` and every
 * subsequent `/` by `/`, so the lookbehind that protects a URL scheme from the drive-letter alternative
 * also protected the path inside the URL scheme. Shape 3 leaked the same way, because `path:` puts a colon
 * in front of the drive letter.
 *
 * So the scheme alternative comes FIRST and carries its own `file:` / `unix:` / `path:` prefix. It is an
 * allow-list of the three schemes that name the local filesystem, not a general `scheme:` rule — a general
 * rule would eat `https://api.example.com/v1`, and a mangled driver message is a worse outcome than the
 * leak it was preventing.
 *
 * ## Why the two bare alternatives refuse to start mid-word
 *
 * `https://api.example.com/v1` and `does/not/exist/corpus.db` both contain slashes, and redacting them
 * would corrupt a URL in a driver message and delete the very relative path this module wants to keep
 * naming. The lookbehind is what separates "the start of an absolute path" from "a separator inside
 * something else": an absolute path begins after whitespace, a quote, an opening bracket or the start of
 * the string, and never after a word character, a colon, a slash, a dot or a hyphen. `data/corpus.db`
 * survives intact; `/var/lib/mizan/corpus.db` does not.
 *
 * ## Why the drive alternative still keeps `:` in its lookbehind
 *
 * `[A-Za-z]:[\\/]` alone matches the tail of a URL scheme: `https://x` contains `s:/`, so the first version
 * of this returned `http<host path>` for a perfectly ordinary driver message. The boundary guard is what
 * makes a drive letter a *whole token*, and removing `:` from it to accommodate `path:C:\…` would
 * reintroduce that mangling. The key-prefixed shape is the scheme alternative's job, not this one's.
 *
 * ## Why the scheme alternative demands a character after the colon
 *
 * `path:` with nothing path-like behind it is prose — a label in a sentence. The `+` is what keeps the
 * `path:` label in `{ code, path: 'C:\…' }` from being replaced on its own and leaving the quoted path
 * behind, which is the worst of both outcomes: a mangled label *and* the leak.
 */
const ABSOLUTE_PATH =
  /(?<![\w])(?:file|unix|path):\/?\/?[^\s"'`,;)\]]+|(?<![\w:/.-])[A-Za-z]:[\\/][^\s"'`,;)\]]*|(?<![\w:/.-])\/[^\s"'`,;)\]]*/gi

/**
 * Replace every absolute path in a detail with `<host path>`.
 *
 * Exported so the invariant is testable on its own, and so a caller that assembles a detail by hand
 * has one function to reach for rather than a regex to copy.
 */
export const withoutAbsolutePaths = (text: string): string => text.replace(ABSOLUTE_PATH, "<host path>")

/**
 * One sentence per tag, carrying the tag itself so a client can branch without reading English.
 *
 * ## Why this is the wire boundary, and why paths are stripped here
 *
 * This function produces the text an MCP client receives. `detail` is assembled from the operator's
 * own configuration — `MIZAN_CORPUS_PATH`, which on a customer's machine is
 * `C:\Users\somebody\AppData\Local\…\corpus.db` — and from driver messages that quote the file they
 * failed on. Both are absolute paths, and both reach a *client*, which is a different trust domain
 * from the operator who typed the path. Nothing about the corpus is leaked by naming it (no text, no
 * hash, no record), but a filesystem layout is exactly what a docs team does not need to publish, and
 * `AGENTS.md` section 13's rule — hashes and roles, never content or layout — is cheaper to keep as
 * a mechanical strip than as a review convention.
 *
 * The redaction is applied HERE, once, at the single place where a `CorpusProblem` becomes text,
 * rather than at each of the five places one is constructed. That is the difference between a
 * control and a convention: a fifth producer added next year is redacted automatically, whereas a
 * per-constructor `replaceAll` is five chances to forget.
 *
 * The operator does not lose the path: `main.ts` prints the resolved paths on stderr, which is
 * operator-only and is where a filesystem layout belongs.
 */
export const describeCorpusProblem = (problem: CorpusProblem): string => {
  const head = `${problem._tag}: ${withoutAbsolutePaths(problem.detail)}`
  const condition = conditionOfCorpusProblem(problem)
  const shared = condition === null ? `no shared degradation condition describes ${problem._tag}` : describeCondition(condition)
  // The shared sentence comes last and the local detail first, so a log line reads
  // `corpus_missing: <host path> — corpus_absent: …` and the shared condition is the word a client
  // parses. `detail` names a role and a driver message, never corpus text (AGENTS.md section 13).
  return `${head} — ${shared}`
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

  return ({ claims, deadlineExpired }: VerifyInput): Result<readonly ClaimVerdict[], CorpusProblem> =>
    ok(
      verifyAnswer({
        claims,
        evidence: resolve(claims),
        snapshotHash: identity.snapshotHash,
        deadlineExpired,
      }).claims,
    )
}

/**
 * A verifier that refuses every request with one problem, and computes nothing.
 *
 * ## Why this exists rather than exiting
 *
 * A clean clone has no `data/corpus.db`, and an MCP client has no way to distinguish "the server is not
 * running" from "the server is running and holds nothing" — the first is a spawn failure it may retry, the
 * second is a state it can act on. So the server starts, answers `initialize` and `tools/list` normally,
 * and answers `tools/call` with a refusal whose `reason` is a word from the shared vocabulary. Story 7 asks
 * for exactly this: a completed round-trip carrying the degradation condition, so an integrator can branch
 * on it.
 *
 * What it must never do is compute a verdict, and it cannot: it never reads the corpus, never calls
 * `verifyAnswer`, and returns no `ClaimVerdict` at all. `verified` is unreachable from here, which is the
 * property that makes starting up the right answer.
 */
export const refusingVerifier = (problem: CorpusProblem): Verifier => () => err(problem)

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
