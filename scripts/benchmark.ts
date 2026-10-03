#!/usr/bin/env bun
/**
 * `bun run benchmark` — the unified benchmark harness (US-12).
 *
 * ## One command, every suite, one report
 *
 * 1. **golden-live** — three claims whose quotes are verbatim spans of records in `data/corpus.db`,
 *    so the deterministic verifier answers `verified` by construction. It is the suite that proves the
 *    SHIPPED snapshot verifies, which is why it is three cases and not two hundred.
 * 2. **golden-eval** — the 200 committed cases of `data/eval/golden-normalization.json`, scored
 *    exactly, against a snapshot built from that set's own anchors.
 * 3. **redteam-eval** — the 40 committed fabrications of `data/eval/redteam-fabricated.json`, held to
 *    the `never_verified` bar. `scripts/benchmark/eval-suites.ts` explains why that bar and not the
 *    file's own `rejected` expectation.
 * 4. **hallmark-red-team** — the 14 HALLMARK-type fabricated citations, each of which must reach the
 *    verdict it declares, measured against the shipped snapshot.
 * 5. **hallmark** — the same 14 outcomes as the per-type table the coverage matrix points at. It is a
 *    ROLL-UP, marked `derivedFrom: "hallmark-red-team"`, and is excluded from every total.
 *
 * ## Why the committed sets were added
 *
 * This command measured 17 cases while README published "every eval set through one harness", and the
 * other 223 lived in `apps/cli/test/eval.test.ts`. A published sentence and a command that
 * contradicts it ten lines later is the defect this repository exists to prevent, and US-12 asks for
 * one command. So the two committed sets are suites here now, and they are hermetic: each builds its
 * snapshot from its own anchors, which is why the command still needs nothing the sets do not ship.
 *
 * ## The arithmetic is not this file's
 *
 * Every figure comes from `@mizan/bench`. This file resolves citations, runs `@mizan/verify`, and
 * hands the verdicts over. It used to compute its own metrics, and it computed them two ways wrong:
 *
 *  - `overallSsr` was `passCount / totalCases` — a pass rate, printed under the name of the
 *    Sentence-Support Rate. It read 100% on a run where every sentence was ungrounded.
 *  - The HALLMARK roll-up was added to the totals, so 17 evaluated cases were reported as 31.
 *
 * Neither was a typo. Both were the metric being something other than what it was named, which is the
 * same defect the repository exists to prevent, one layer up.
 *
 * ## SSR covers `golden-live`, and the report says so rather than rounding it up
 *
 * Only `golden-live` carries prose, because only it carries an ANSWER. The committed eval sets ship
 * verdicts and quotes, not generated sentences, so their cases contribute no sentences and their
 * suites print `n/a` — which is what `report.ts` reserves `null` for. Substituting an `EvalCase`'s
 * `note` would have produced SSR 47% on a suite that scores 200/200: arithmetically true, and about
 * nothing a reader would call grounding.
 *
 * ## Exit codes
 *
 * - 0 — every counted suite passed, and at least one case was evaluated
 * - 1 — a case failed, a suite failed to load, OR NOTHING WAS EVALUATED
 * - 2 — could not start: no corpus, no attestation, or a corpus `attestation.json` does not authorise
 *
 * The middle code covers "nothing ran" on purpose. It is not 0 because a benchmark that evaluated
 * nothing has measured nothing, and a 0 recorded against it is a green tick for a run that
 * inspected no data — the exact defect `buildReport`'s `not_run` outcome exists to name. It is not 2
 * because the harness did start, did read the corpus, and did produce a report; a caller reading 2
 * would go looking for a missing database that is sitting right there.
 *
 * ## Every fault has a name, and none of them is a stack trace
 *
 * Code 2 is the surface for a corpus that cannot be trusted: absent, unopenable, not a database,
 * recording no identity, or disagreeing with the attestation. `openCorpus` and `identityOf` return
 * `Result` and the reads are wrapped, because `bun:sqlite` opens a file LAZILY — a path that exists
 * and is not a database opens without complaint and raises `SQLITE_NOTADB` on the first query, which
 * `existsSync` cannot see. Unguarded, that escape printed a raw `SQLiteError` stack and exited 1,
 * where 1 means "a case failed": a judge reading it would go hunting for a broken fixture while the
 * corpus sat there corrupt.
 *
 * ## Security
 *
 * The report carries counts, case ids, verdicts and reasons. No question text, no claim text, no
 * quote, no corpus content, no secrets (AGENTS.md section 13).
 *
 * ## Reliability
 *
 * A suite that throws is reported with its error and the others still run. `buildReport` counts a
 * suite with an error as BROKEN, so "the rest were fine" cannot be published as "it passed". The
 * report file is written for every outcome, including `not_run`, because the record of a run that
 * measured nothing is worth keeping — it is the exit code, not the file, that is load-bearing.
 *
 * ## Why the paths are parameters, and the entrypoint is guarded
 *
 * `runBenchmark(paths)` is the whole harness and `main` only prints what it returned. The reason is
 * the fault surface above: an `existsSync` check and a `try`/`finally` with no `catch` left the
 * "not a database" path unreachable and unobservable, so it was not a behaviour but a latent stack
 * trace. Injecting the paths is what lets a test hand it a file that exists, is not a database, and
 * assert the refusal — the same shape `verify-chain.ts` uses, and the reason `import.meta.main` is
 * guarded here at all: an unguarded `process.exit` makes the module unimportable, so every one of
 * these paths was untestable by construction.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"
import { err, isErr, normalizeQuote, ok, type Result, type ResolvedCitation } from "@mizan/core"
import { attestSnapshot, attestSnapshotUnchanged, attestationUnreadable, describeAttestationProblem, readSnapshotMeta, resolveCitations, type AttestationProblem, type SnapshotIdentity } from "@mizan/corpus"
import { verifyAnswer } from "@mizan/verify"
import { buildReport, buildSuite, failedSuite, renderReport, type BenchCase, type BenchmarkReport, type CaseOutcome, type SuiteResult } from "@mizan/bench"
import { requireRepositoryRoot } from "@mizan/gate"
import { RED_TEAM_FIXTURES } from "@mizan/verify"
import { evalSuites } from "./benchmark/eval-suites.ts"

/**
 * Where the harness reads from and writes to.
 *
 * Four paths, injected rather than read from module constants, so a test can point the harness at a
 * corpus that is absent, corrupt or unattested without touching the committed one. Nothing about the
 * measurement changes: the same four locations, named by the caller.
 */
export type BenchmarkPaths = {
  readonly corpusPath: string
  readonly attestationPath: string
  readonly evalDir: string
  readonly outPath: string
}

/** Where the harness reads and writes, relative to the repository root. */
const REPOSITORY_RELATIVE: BenchmarkPaths = {
  corpusPath: "data/corpus.db",
  attestationPath: "attestation.json",
  evalDir: "data/eval",
  outPath: "data/benchmark/benchmark-report.json",
}

/**
 * The repository's own paths, absolute.
 *
 * Resolved from this file's location rather than from `process.cwd()`, because `bun run benchmark`
 * and `bun test` inside `scripts/` do not share a working directory and a harness that resolves its
 * own corpus relative to the caller's shell is a harness that reports a missing corpus on a
 * perfectly good checkout. `verify-chain.ts` resolves its ledger the same way.
 */
export const repositoryPaths = (): Result<BenchmarkPaths, string> => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) return root
  return ok({
    corpusPath: `${root.value}/${REPOSITORY_RELATIVE.corpusPath}`,
    attestationPath: `${root.value}/${REPOSITORY_RELATIVE.attestationPath}`,
    evalDir: `${root.value}/${REPOSITORY_RELATIVE.evalDir}`,
    outPath: `${root.value}/${REPOSITORY_RELATIVE.outPath}`,
  })
}

/**
 * Exit codes, matching `apps/cli/src/exit-codes.ts` and `scripts/benchmark/run.ts`.
 *
 * These are restated rather than imported because a `scripts/` module cannot depend on an app, and
 * that is exactly why the comment above exists: this file and `run.ts` both have to agree with the
 * CLI by hand. An earlier version of this file declared its own `EXIT_UNTRUSTED = 2`, which made
 * `bun run benchmark` and `bun run benchmark:vs-search` return different numbers for the same
 * failure on the same corpus, and contradicted the published claim in README.md that "the benchmark
 * exits 3". AGENTS.md section 17 — one source of truth per fact — is why this number is `3` and not
 * whatever seemed natural in isolation.
 *
 * `2` is deliberately absent. In `exit-codes.ts` it means "you invoked me wrongly", and this harness
 * has no such failure: every way of getting it wrong is a run that either measured something or
 * refused to.
 */
export const EXIT_OK = 0

/** The run happened and a case did not reach the verdict it was declared to reach. Same fact as the CLI's `EXIT_DEGRADED = 1`. */
export const EXIT_FAILURES = 1

/** The corpus is absent, unreadable, or not the one `attestation.json` authorises. Same fact as the CLI's `EXIT_UNTRUSTED = 3`. */
export const EXIT_UNTRUSTED = 3

/**
 * The golden set.
 *
 * Each `quote` is a verbatim span of the record its citation names, so strict normalized
 * containment resolves to `verified`. The `prose` IS the claim text: a sentence that does not
 * contain its claim can never be attributed to it, so the two must be the same string here or SSR
 * would report the golden set as ungrounded for a fixture defect.
 */
const GOLDEN_SET: readonly BenchCase[] = [
  {
    id: "golden-001",
    prose: "لا تقبل صلاه بغير طهور ولا صدقه من غلول",
    claimText: "لا تقبل صلاه بغير طهور ولا صدقه من غلول",
    quote: "لا تقبل صلاه بغير طهور ولا صدقه من غلول",
    citations: [{ collection: "tirmidhi", number: "1", grade: null, raw: "tirmidhi:1" }],
    expectedVerdict: "verified",
    fabricated: false,
  },
  {
    id: "golden-002",
    prose: "اذا توضا العبد المسلم او المومن فغسل وجهه",
    claimText: "اذا توضا العبد المسلم او المومن فغسل وجهه",
    quote: "اذا توضا العبد المسلم او المومن فغسل وجهه",
    citations: [{ collection: "tirmidhi", number: "2", grade: null, raw: "tirmidhi:2" }],
    expectedVerdict: "verified",
    fabricated: false,
  },
  {
    id: "golden-003",
    prose: "مفتاح الصلاه الطهور وتحريمها التكبير وتحليلها التسليم",
    claimText: "مفتاح الصلاه الطهور وتحريمها التكبير وتحليلها التسليم",
    quote: "مفتاح الصلاه الطهور وتحريمها التكبير وتحليلها التسليم",
    citations: [{ collection: "tirmidhi", number: "3", grade: null, raw: "tirmidhi:3" }],
    expectedVerdict: "verified",
    fabricated: false,
  },
]

/**
 * The 14 red-team fixtures, as benchmark cases.
 *
 * `fabricated: true` puts them in the false-positive denominator — the only denominator that figure
 * is defined over — and `prose` is deliberately absent: a fabrication carries no claim text that
 * belongs in a sentence-support rate, and the previous harness counted its invented wording as an
 * answer sentence.
 */
const RED_TEAM_SET: readonly BenchCase[] = RED_TEAM_FIXTURES.map((fixture) => ({
  id: fixture.id,
  claimText: fixture.claim.text,
  quote: normalizeQuote(fixture.claim.quote),
  citations: fixture.claim.citations,
  expectedVerdict: fixture.expectedVerdict,
  fabricated: true,
}))

/**
 * Resolve every citation once, so each suite runs against the same snapshot read.
 *
 * Resolution is a database read and `@mizan/verify` is forbidden from performing one, so it happens
 * here and the verifier receives the outcome as data. Three of the fourteen red-team fixtures name a
 * collection or a number the snapshot does not hold (RT-001, RT-002, RT-005); those resolve to zero
 * records and the verifier answers `unverifiable (identifier_unresolved)`. The other eleven resolve
 * to one record each and are rejected on content — a verdict, not a dropped case, in both branches.
 *
 * A `Result` because this is the last SQL the harness runs before the verdict loop, so it is the
 * one query whose failure has no suite to be attributed to. Each suite's own throws are already
 * caught by `runAll` and reported per suite; one that escapes here would take down the report
 * itself, which is the "if a suite fails to load, report the error and continue" requirement with
 * nowhere left to continue to.
 */
const resolveEvidence = (db: Database, corpusPath: string): Result<readonly ResolvedCitation[], string> => {
  const citations = [...GOLDEN_SET, ...RED_TEAM_SET].flatMap((entry) => entry.citations)
  try {
    const { resolved, problems } = resolveCitations(db, citations)
    for (const problem of problems) {
      console.error(`WARN citation resolution: ${problem.detail}`)
    }
    return ok(resolved)
  } catch (cause) {
    return err(`citation resolution failed against ${corpusPath}: ${why(cause)}`)
  }
}

/** Run one suite's cases through the real verifier and collect what it answered. */
const judge = (cases: readonly BenchCase[], evidence: readonly ResolvedCitation[], snapshotHash: string): CaseOutcome[] =>
  cases.map((bench) => {
    const report = verifyAnswer({
      claims: [
        {
          id: bench.id,
          text: bench.claimText,
          quote: bench.quote,
          citations: bench.citations,
          ...(bench.anchorText === undefined ? {} : { anchor: bench.anchorText }),
        },
      ],
      evidence,
      snapshotHash,
    })
    const verdict = report.claims[0]
    if (verdict === undefined) {
      // Unreachable for a one-claim input, and refusing to invent a verdict is the right way to
      // treat a case the verifier did not answer: an absent answer is not a pass.
      throw new Error(`${bench.id}: the verifier returned no verdict for a single-claim request`)
    }
    return { case: bench, verdict }
  })

/**
 * A thrown value's message, as a string.
 *
 * `bun:sqlite` throws `Error`s and so does `JSON.parse` and Bun's own stream code, but `unknown`
 * is `unknown`: a `catch` clause is the one place a value's type is genuinely unknown, and
 * `String(cause)` is the fallback that cannot itself throw.
 */
const why = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * Every suite, in report order: the two that read the shipped snapshot, then the two committed eval
 * sets, then the HALLMARK fixtures and their roll-up.
 *
 * Each suite is wrapped independently so one throwing cannot cost the reader the others. The HALLMARK
 * roll-up reuses the red-team OUTCOMES by reference — the same objects, not a second evaluation
 * under a second name — and `buildSuite(..., "hallmark-red-team")` marks it derived, which is what
 * keeps it out of every total.
 *
 * The eval-set suites come first in the report because they are the broad measurement: 240 committed
 * cases, hermetic, and the ones README points at. `golden-live` and `hallmark-red-team` are the two
 * that exercise the shipped `data/corpus.db`, and they are named so a reader can tell which is which.
 */
const runAll = (evidence: readonly ResolvedCitation[], snapshotHash: string, evalDir: string): SuiteResult[] => {
  const attempt = <T>(run: () => T, onFailure: (cause: unknown) => T): T => {
    try {
      return run()
    } catch (cause) {
      return onFailure(cause)
    }
  }

  const golden = attempt(() => buildSuite("golden-live", judge(GOLDEN_SET, evidence, snapshotHash)), (cause) => failedSuite("golden-live", why(cause)))

  let redTeam: readonly CaseOutcome[] = []
  const redTeamSuite = attempt(
    () => {
      redTeam = judge(RED_TEAM_SET, evidence, snapshotHash)
      return buildSuite("hallmark-red-team", redTeam)
    },
    (cause) => failedSuite("hallmark-red-team", why(cause)),
  )

  const hallmark = attempt(
    () => buildSuite("hallmark", redTeam, "hallmark-red-team"),
    (cause) => failedSuite("hallmark", why(cause), "hallmark-red-team"),
  )

  return [golden, ...evalSuites(evalDir), redTeamSuite, hallmark]
}

/** Read the committed attestation. Unreadable is a refusal, not an attestation with no fields. */
const readCommittedAttestation = (path: string): Result<string, AttestationProblem> => {
  if (!existsSync(path)) return err(attestationUnreadable(`${path} does not exist`))
  try {
    return ok(readFileSync(path, "utf8"))
  } catch (cause) {
    return err(attestationUnreadable(`${path} could not be read: ${why(cause)}`))
  }
}

/**
 * What the corpus claims for itself, or why it cannot say.
 *
 * ## Why the read is wrapped, when `existsSync` already ran
 *
 * `bun:sqlite` opens a file LAZILY: a path that exists and is not a database opens without complaint
 * and raises `SQLITE_NOTADB: file is not a database` on the first query. `existsSync` cannot see that,
 * and an uncaught throw here is the surface this function exists to replace — a raw stack trace and
 * exit 1, where exit 1 means "a case failed". A judge reading it would go hunting for a broken
 * fixture while the corpus sat there corrupt. The message names the file and the command that
 * fixes it, because "unavailable, for reasons we decline to give" is the one surface §16 forbids.
 */
export const identityOf = (db: Database, corpusPath: string): Result<SnapshotIdentity, string> => {
  let meta: Readonly<Record<string, string>>
  try {
    meta = readSnapshotMeta(db)
  } catch (cause) {
    return err(`${corpusPath} is not a readable snapshot: ${why(cause)}. Re-run \`bun run ingest\`.`)
  }
  const identity = { snapshotHash: meta.snapshotHash ?? "", recordCount: Number(meta.recordCount) }
  if (identity.snapshotHash.length === 0 || !Number.isInteger(identity.recordCount)) {
    return err(`${corpusPath} records no usable identity (snapshotHash length ${identity.snapshotHash.length}, recordCount ${String(meta.recordCount)}).`)
  }
  return ok(identity)
}

/**
 * The corpus, open read-only, with its identity already known to be usable.
 *
 * The handle is closed on the one failure path that follows opening it, so a refused harness never
 * leaves a file lock behind for the next ingest to trip over.
 */
export const openCorpus = (corpusPath: string): Result<{ readonly db: Database; readonly identity: SnapshotIdentity }, string> => {
  if (!existsSync(corpusPath)) {
    return err(`${corpusPath} is missing. Run \`bun run ingest\` first.`)
  }
  let db: Database
  try {
    db = new Database(corpusPath, { readonly: true })
  } catch (cause) {
    return err(`${corpusPath} could not be opened read-only: ${why(cause)}`)
  }
  const identity = identityOf(db, corpusPath)
  if (isErr(identity)) {
    db.close()
    return identity
  }
  return ok({ db, identity: identity.value })
}

/** Measure, or name the fault. Never a raw stack trace, never exit 1 for something that is not a case. */
const measure = (db: Database, identity: SnapshotIdentity, paths: BenchmarkPaths): Result<BenchmarkReport, string> => {
  const committed = readCommittedAttestation(paths.attestationPath)
  if (isErr(committed)) return err(describeAttestationProblem(committed.error))

  const attested = attestSnapshot(committed.value, identity)
  if (isErr(attested)) return err(describeAttestationProblem(attested.error))

  const evidence = resolveEvidence(db, paths.corpusPath)
  if (isErr(evidence)) return evidence

  const report = buildReport(runAll(evidence.value, identity.snapshotHash, paths.evalDir))

  // Re-attest after the run: the harness must not have moved the snapshot it was measured against.
  const after = identityOf(db, paths.corpusPath)
  if (isErr(after)) return after
  const drift = attestSnapshotUnchanged(identity, after.value)
  if (isErr(drift)) return err(describeAttestationProblem(drift.error))

  return ok(report)
}

/**
 * The harness: open, attest, run every suite, write the report, close.
 *
 * One function, no printing and no `process.exit`, so a test can call it against a corpus that is
 * absent, corrupt or unattested and assert the refusal it returns. Printing and the exit code live
 * in `main`, because what a judge reads is a presentation decision and what the harness measured is
 * not.
 *
 * The report is written for every outcome that produced one — including `not_run` — because the
 * record of a run that measured nothing is worth keeping. It is the exit code, not the file, that is
 * load-bearing.
 */
export const runBenchmark = (paths: BenchmarkPaths): Result<BenchmarkReport, string> => {
  const opened = openCorpus(paths.corpusPath)
  if (isErr(opened)) return opened
  const { db, identity } = opened.value
  try {
    const measured = measure(db, identity, paths)
    if (isErr(measured)) return measured
    mkdirSync(dirname(paths.outPath), { recursive: true })
    writeFileSync(paths.outPath, `${JSON.stringify(measured.value, null, 2)}\n`, "utf8")
    return measured
  } finally {
    db.close()
  }
}

/**
 * `bun run benchmark`: run the harness, print what it found, and map the outcome to an exit code.
 *
 * With no `paths`, the repository's own. The exit code is derived from `report.outcome`, not from
 * whether anything was printed, so the two cannot disagree. `not_run` shares the failure code
 * deliberately: there is no fourth code for it, because "ran and found nothing to measure" must
 * never be reported as a pass, and adding a code here would only invite a caller to special-case it
 * back to 0.
 *
 * Could-not-start is `EXIT_UNTRUSTED`, which is also what `runBenchmark` refuses with. Two reasons to
 * find the root and two to measure nothing are the same answer to "the harness did not measure":
 * there is no third code for "the harness could not locate itself", because a caller reading a
 * distinct one would go looking for a corpus fault that is really a packaging fault.
 */
export const main = async (paths?: BenchmarkPaths): Promise<number> => {
  const located = paths === undefined ? repositoryPaths() : ok(paths)
  if (isErr(located)) {
    console.error(`FAIL the harness could not locate the repository: ${located.error}`)
    return EXIT_UNTRUSTED
  }

  const measured = runBenchmark(located.value)
  if (isErr(measured)) {
    console.error(`FAIL ${measured.error}`)
    return EXIT_UNTRUSTED
  }

  const report = measured.value
  console.log(renderReport(report))
  console.log(`wrote ${located.value.outPath}`)
  return report.outcome === "pass" ? EXIT_OK : EXIT_FAILURES
}

if (import.meta.main) {
  process.exit(await main())
}
