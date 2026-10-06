#!/usr/bin/env bun
/**
 * `bun run benchmark:vs-search` — does mizan catch fabrications a plain search hands to the reader?
 *
 * ## What this command is, and what it deliberately is not
 *
 * A COMPARISON, with a hypothesis stated before the figures. It runs two independent arms over the
 * red-team set and reports both. It is not a benchmark of mizan: the system arm is the set's DECLARED
 * expectation, because running the verifier over the cases the verifier was built from would measure
 * agreement rather than capability, and because a comparison whose two arms share a module is one in
 * which a single bug moves both numbers the same way and the delta looks stable while both are wrong.
 *
 * ## The attestation comes FIRST, and nothing is printed before it passes
 *
 * Every figure here is a statement about a specific corpus. A benchmark that computed numbers against
 * an unattested database and printed them anyway would be asserting a result about a corpus nobody
 * vouched for — and the mismatch case is where printing is most harmful, because a stale corpus
 * produces perfectly ordinary-looking rates. So the order is: read the attestation, compare it
 * against the open snapshot, and on any disagreement print BOTH hashes and the field that differs,
 * then exit 3 having printed no figures at all.
 *
 * The fingerprint is read again at the END. A benchmark is a long read of a file another process may
 * be rewriting, and a corpus that changed mid-run produced a number describing two different corpora.
 * Re-reading is the only way to know.
 *
 * ## Exit 0 even when the hypothesis fails
 *
 * The published output is the deliverable. A non-zero exit for "the hypothesis was not supported"
 * would make this a test — and a test whose result decides what gets checked is a test that gets
 * weakened until it passes. Exit 3 is reserved for the integrity failure, where no figure should be
 * believed at all.
 *
 * ## Nothing is written except the artefact
 *
 * The snapshot is opened read-only, the set is read, and the one file written is
 * `data/benchmark/vs-search.json`. No ingest, no ledger append, no run trace: this is a measurement,
 * not a run, and putting it in the ledger would imply it was a query a person asked.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"
import { BENCHMARK_SCHEMA_VERSION, decodeOrFail, decodeSync, err, EvalSet, isErr, isOk, ok, PRE_REGISTERED_HYPOTHESIS, type EvalCase, type Result, BenchmarkResult } from "@mizan/core"
import { attestSnapshot, attestSnapshotUnchanged, attestationUnreadable, describeAttestationProblem, readSnapshotMeta, type AttestationProblem, type SnapshotIdentity } from "@mizan/corpus"
import { HONEST_OPTIONS, runBaseline, type BaselineCase } from "./baseline.ts"
import { assertBaselineIsHonest, figuresOf, score, toDeclaration, type ScoredCase } from "./score.ts"
import { runSystemArm, type SystemCase } from "./system-arm.ts"
import { compare, disagreements, figuresOf as systemFigures, type LabelledCase } from "./compare.ts"
import { renderBenchmarkReport } from "./report.ts"

const CORPUS_PATH = "data/corpus.db"
const ATTESTATION_PATH = "attestation.json"
const REDTEAM_PATH = "data/eval/redteam-fabricated.json"
const OUT_PATH = "data/benchmark/vs-search.json"

/**
 * Integrity failure: a figure must not be printed, and a caller must be able to tell it apart from an
 * ordinary success. 3 matches the CLI's `EXIT_UNTRUSTED`, so one number means "do not believe the
 * output" across the whole repository.
 */
const EXIT_UNTRUSTED = 3

/**
 * The red-team set, decoded once.
 *
 * `EvalSet` rather than a hand-rolled shape, because these are the cases the benchmark is about and
 * reading them through the same schema `eval.test.ts` uses is what makes a benchmark result and a
 * test result comparable. A benchmark that parsed the fixture with its own reader would keep working
 * after the fixture changed shape, which is the same defect class as a gate that scans nothing.
 *
 * Returned whole, and projected at the point of use, because the three consumers need three
 * disjoint halves of each case: the baseline needs the quote, the executor needs the quote and the
 * citation and must NOT see the declaration, and the comparator needs the declaration alone.
 */
const readRedTeam = (): readonly EvalCase[] => {
  if (!existsSync(REDTEAM_PATH)) throw new Error(`${REDTEAM_PATH} is missing. Run \`bun run build:eval\` first.`)
  const decoded = decodeOrFail(decodeSync(EvalSet), JSON.parse(readFileSync(REDTEAM_PATH, "utf8")) as unknown, REDTEAM_PATH)
  if (!isOk(decoded)) throw new Error(`${REDTEAM_PATH} is not a valid eval set: ${decoded.error.detail}`)
  return decoded.value.cases
}

/**
 * The three disjoint projections of one set, built together.
 *
 * Built in one place so the split cannot drift: a case added to the executor's input but not the
 * comparator's would silently vanish from the denominator, and a case given to the executor with its
 * declaration attached would reintroduce the tautology the split exists to prevent.
 */
const projectCases = (cases: readonly EvalCase[]): { readonly baseline: readonly ScoredCase[]; readonly system: readonly SystemCase[]; readonly labelled: readonly LabelledCase[] } => ({
  baseline: cases.map((entry) => ({ id: entry.id, classId: entry.classId, quote: entry.quote, anchorId: entry.anchorId, citation: entry.citation })),
  system: cases.map((entry) => ({ id: entry.id, quote: entry.quote, citation: entry.citation })),
  labelled: cases.map((entry) => ({ id: entry.id, verdict: entry.expectedVerdict })),
})

/**
 * The baseline arm's view of the same cases.
 *
 * A projection rather than passing `ScoredCase` through, so the baseline module's declared input is
 * satisfied by construction and it is impossible to widen its reach later by widening this type.
 */
const toBaselineCases = (cases: readonly ScoredCase[]): readonly BaselineCase[] =>
  cases.map((entry) => ({ id: entry.id, quote: entry.quote, anchorId: entry.anchorId, citation: entry.citation }))

const main = (): number => {
  if (!existsSync(CORPUS_PATH)) {
    console.error(`FAIL ${CORPUS_PATH} is missing, so there is no corpus to measure against. Run \`bun run ingest\` first.`)
    return EXIT_UNTRUSTED
  }
  const db = new Database(CORPUS_PATH, { readonly: true })
  try {
    return runAttested(db)
  } finally {
    db.close()
  }
}

/** The committed side of the comparison, read for the failure message only. */
const committedIdentity = (): string => {
  if (!existsSync(ATTESTATION_PATH)) return "(absent)"
  let committed: { readonly snapshotHash?: string; readonly recordCount?: number }
  try {
    committed = JSON.parse(readFileSync(ATTESTATION_PATH, "utf8")) as {
      readonly snapshotHash?: string
      readonly recordCount?: number
    }
  } catch {
    // The file is present and unreadable AS AN ATTESTATION, which the decode below already reports.
    // This line only has to stay truthful so the two-hashes block never prints a `?` for something
    // it could have said, and never claims a hash it could not actually read.
    return "(unreadable)"
  }
  return `${committed.snapshotHash ?? "?"} (${committed.recordCount ?? "?"} records)`
}

/**
 * Read the committed attestation text, or name the problem.
 *
 * Every way this read fails is `attestation_unreadable` — absent, a directory rather than a file, a
 * permission error, a file another process holds — because all of them reduce to the same fact about
 * the run: **nothing on disk says which corpus this is**. The one thing this must never be is a raw
 * throw, because an uncaught `EISDIR` on the integrity path is the crash AGENTS.md section 16 lists
 * as an unacceptable state, and this is the integrity path.
 */
const readCommittedAttestation = (): Result<string, AttestationProblem> => {
  if (!existsSync(ATTESTATION_PATH)) return err(attestationUnreadable(`${ATTESTATION_PATH} does not exist`))
  try {
    return ok(readFileSync(ATTESTATION_PATH, "utf8"))
  } catch (cause) {
    return err(attestationUnreadable(`${ATTESTATION_PATH} could not be read: ${cause instanceof Error ? cause.message : String(cause)}`))
  }
}

/**
 * The corpus's own account of itself, in the shape the attestation check compares.
 *
 * Read through ONE function at both ends of the run on purpose. The start and the end must derive
 * identity identically, and a second derivation is exactly how an end-of-run re-check comes to
 * compare a different thing from what it checked at the start — which would make the re-check
 * decorative. `""` for a missing hash is deliberate: `runAttested` rejects it before any work
 * begins, and if it reappears at the end the row was deleted underneath the run, which is drift.
 */
const readIdentity = (db: Database): SnapshotIdentity => {
  const meta = readSnapshotMeta(db)
  return { snapshotHash: meta.snapshotHash ?? "", recordCount: Number(meta.recordCount) }
}

const runAttested = (db: Database): number => {
  const identity = readIdentity(db)
  const { snapshotHash, recordCount } = identity
  if (snapshotHash.length === 0 || !Number.isInteger(recordCount)) {
    const meta = readSnapshotMeta(db)
    console.error(
      `FAIL ${CORPUS_PATH} records no usable identity: snapshotHash=${JSON.stringify(meta.snapshotHash)}, recordCount=${JSON.stringify(meta.recordCount)}.`,
    )
    console.error("No figures were computed.")
    return EXIT_UNTRUSTED
  }
  const onDisk = `${snapshotHash} (${recordCount} records)`

  const committed = readCommittedAttestation()
  if (isErr(committed)) {
    console.error(`FAIL ${describeAttestationProblem(committed.error)}`)
    console.error(`  committed   ${committedIdentity()}`)
    console.error(`  on disk     ${onDisk}`)
    console.error("No figures were computed. Run `bun run ingest` to produce an attestation.")
    return EXIT_UNTRUSTED
  }

  const attested = attestSnapshot(committed.value, { snapshotHash, recordCount })
  if (isErr(attested)) {
    // Both sides, always, and both in full. A message that only says "mismatch" leaves an operator
    // nothing to act on, and the disagreeing field is what points at the file that changed; a
    // truncated digest is not checkable by the person who has to act on it.
    console.error(`FAIL ${describeAttestationProblem(attested.error)}`)
    console.error(`  committed   ${committedIdentity()}`)
    console.error(`  on disk     ${onDisk}`)
    console.error("No figures were computed.")
    return EXIT_UNTRUSTED
  }

  // The honest declaration is checked before anything is computed, so a rig cannot produce a figure
  // that then gets published. This is a no-op in practice and is exactly the point: the benchmark's
  // own honesty is asserted by the same function the self-test proves detects a violation.
  const problems = assertBaselineIsHonest(HONEST_OPTIONS)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL ${problem}`)
    console.error("The honest declaration is not honest. No figures were computed.")
    return EXIT_UNTRUSTED
  }

  const cases = readRedTeam()
  // An empty set is refused here, before either arm runs, so the command reports an integrity
  // failure and exits 3 rather than reaching `figuresOf` — which holds the same guard as an
  // invariant and would otherwise surface it as an uncaught throw. Every published rate is
  // `hits / total`, so an empty set would otherwise write an artefact reading "mizan caught 0%",
  // which is a statement about a run that never happened (AGENTS.md §16).
  if (cases.length === 0) {
    console.error(`FAIL ${REDTEAM_PATH} declares zero cases, so there is nothing to measure and every rate would be 0 over 0.`)
    console.error("No figures were computed.")
    return EXIT_UNTRUSTED
  }
  const arms = projectCases(cases)

  // The system arm is EXECUTED, not read off the set: `verifyAnswer` is called once per case against
  // this corpus, and `compare` is what joins the result to the declarations. If the executor could
  // see the declarations the comparison would be a tautology, which is why `arms.system` carries no
  // verdict of any kind.
  const measured = runSystemArm(db, arms.system, snapshotHash)
  const comparisons = compare(arms.labelled, measured)

  // A disagreement is published, not fatal: the artefact records what the verifier actually said, and
  // an unexplained disagreement is exactly what a judge needs to see. It is named on stderr so a run
  // that is only being watched for regressions does not scroll it away.
  for (const row of disagreements(comparisons)) console.error(`NOTE system arm disagrees with the set — ${row}`)

  const outcomes = score(arms.baseline, runBaseline(db, toBaselineCases(arms.baseline), HONEST_OPTIONS))
  const computed = figuresOf(outcomes, systemFigures(comparisons))
  // The two arms are built by two functions over two inputs, so a defect in either surfaces here as a
  // refusal naming the two denominators. Before this was a `Result` it surfaced as an uncaught throw out
  // of the command that publishes `delta` and `falseVerifiedCount` — the one place in this repository
  // where a stack trace replaces a sentence about which arms disagree (AGENTS.md §2, §16).
  if (isErr(computed)) {
    console.error(`FAIL ${computed.error}`)
    console.error("No figures were computed.")
    return EXIT_UNTRUSTED
  }
  const figures = computed.value

  const result = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    preRegisteredHypothesis: PRE_REGISTERED_HYPOTHESIS,
    corpusFingerprint: snapshotHash,
    corpusRecordCount: recordCount,
    setName: "redteam-fabricated",
    caseCount: figures.caseCount,
    baselineTop1HitRate: figures.baselineTop1HitRate,
    systemDetectionRate: figures.systemDetectionRate,
    systemAgreementRate: figures.systemAgreementRate,
    systemAbstentionRate: figures.systemAbstentionRate,
    delta: figures.delta,
    falseVerifiedCount: figures.falseVerifiedCount,
    systemArmSource: "executed-verifier",
    declaration: toDeclaration(HONEST_OPTIONS),
  }

  const decoded = decodeOrFail(decodeSync(BenchmarkResult), result, OUT_PATH)
  if (!isOk(decoded)) {
    console.error(`FAIL the result does not satisfy BenchmarkResult: ${decoded.error.detail}`)
    console.error("Nothing was written.")
    return EXIT_UNTRUSTED
  }

  // Re-attest after the run: a corpus rewritten mid-benchmark yields figures describing two corpora.
  // The comparison lives in @mizan/corpus rather than inline here because that module already owns
  // "is this the corpus you think it is", and because a predicate about corpus identity is only
  // testable as a function — provoking the race itself needs a second writer and would be flaky.
  const drift = attestSnapshotUnchanged({ snapshotHash, recordCount }, readIdentity(db))
  if (isErr(drift)) {
    console.error(`FAIL ${describeAttestationProblem(drift.error)}`)
    console.error(`  at start   ${onDisk}`)
    console.error("No artefact was written; the figures describe two different corpora.")
    return EXIT_UNTRUSTED
  }

  console.log(renderBenchmarkReport(decoded.value, figures))
  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, `${JSON.stringify(decoded.value, null, 2)}\n`, "utf8")
  console.log(`wrote ${OUT_PATH}`)
  return 0
}

process.exit(main())
