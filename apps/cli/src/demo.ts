#!/usr/bin/env bun
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { err, isOk, ok, transcriptLabel, type DemoQuestion, type Result, type VerdictReport } from "@mizan/core"
import { resolveCitations } from "@mizan/corpus"
import { verifyAnswer } from "@mizan/verify"
import { runSpine, transcriptProvider, type Provider, type RetrievedContext, type TranscriptFile } from "@mizan/agent"
import { buildSourceTable, renderReport } from "./render.ts"
import { suggestionsFor } from "./suggestions.ts"
import { assessRelevance } from "./relevance.ts"
import { makeRetriever } from "./retriever.ts"
import { DEMO_QUESTIONS_RELATIVE, readDemoQuestionSet } from "./demo-questions.ts"
import { readTranscript, TRANSCRIPT_RELATIVE } from "./transcript-file.ts"
import { buildDemoCorpus, describeDemoCorpusFailure, DEMO_ANCHORS_RELATIVE, type DemoCorpus } from "./demo-corpus.ts"
import { SYSTEM_INSTRUCTIONS, VERIFICATION_BUDGET_MS } from "./instructions.ts"
import { EXIT_DEGRADED, EXIT_OK, EXIT_UNTRUSTED, EXIT_USAGE } from "./exit-codes.ts"

/**
 * `bun run demo` — the money shot, and the command a judge is most likely to run.
 *
 * ## What it runs without
 *
 * No API key, no network, and no `data/corpus.db`. Those three absences are the design rather
 * than a limitation: a demo that needs a key dies in the room, and a demo that needs the 81 MB
 * snapshot has a setup step nobody performs in front of a judge. So the demo assembles its own
 * corpus from `data/eval/demo-anchors.json` — two committed anchors, attested row by row — and
 * replays committed answers from `data/transcript.json` through the real pipeline.
 *
 * ## What "replay" does and does not mean
 *
 * The *answers* are committed. The *verdicts* are not. `runSpine`, retrieval, citation
 * resolution and `verifyAnswer` all run for real, on this machine, against a real SQLite
 * snapshot; only the model call is answered from disk. A `VERIFIED` badge below was computed by
 * the same six-step procedure that gates this repository, against the corpus whose fingerprint
 * is printed above it — and a tampered anchor cannot reach it (`demo-corpus.ts`).
 *
 * ## Why this writes nothing to the ledger
 *
 * `data/runs.jsonl` is a committed, hash-chained artefact. A demo that appended to it would
 * leave `git status` dirty for whoever ran it, and would make the number `verify:runs` prints
 * depend on how many times the demo had been run. So the demo reads the pipeline and leaves the
 * record alone, and says so on screen: a demonstration of provenance cannot itself be taken on
 * trust.
 *
 * ## The direction of the expectations
 *
 * `data/demo-questions.json` declares the verdict each claim is meant to reach, and this file
 * checks the pipeline against that declaration and exits non-zero on a disagreement. A demo that
 * printed whatever came out would pass on the day the verifier regressed, which is the opposite
 * of what a demonstration is for.
 */

/** One declared expectation, beside what the pipeline actually produced. */
type ExpectationOutcome = {
  readonly claimId: string
  readonly declared: string
  readonly observed: string
  readonly matched: boolean
}

/** Everything one question contributed to the screen. */
type QuestionOutcome = {
  readonly id: string
  /** The rendered screen text for this question. */
  readonly screen: string
  /** False when the pipeline degraded, or produced a verdict the question file does not declare. */
  readonly asDeclared: boolean
  readonly degraded: boolean
}

/* ------------------------------------------------------------------ the header a judge reads first */

/**
 * Everything a reader needs in order to distrust the badges below if they want to.
 *
 * The fingerprint is printed in full rather than truncated. `renderHeader` prints 16 characters
 * because it is one line in a shared component; this one exists to be pasted into a `sha256sum`,
 * and a truncated digest cannot be checked by anyone.
 *
 * ## Why the key line is a statement about the CODE and not about the environment
 *
 * MIZ-104 requires that the demo "still replays the committed transcript and says so" when a key
 * is present. The tempting implementation is to read `process.env.MIZAN_LLM_API_KEY` here and
 * print "a key was present and ignored" — and that would be the one edit that breaks the property
 * the line is making, because reading the key is exactly the reach the demo must not have.
 *
 * So the line says what is true unconditionally and is checkable: **this command imports no module
 * that can read an environment variable.** `apps/cli/test/demo-key-closure.test.ts` walks the
 * demo's relative-import closure and fails if `provider-config.ts` — the only module in `apps/cli`
 * that touches `process.env` or names the key — ever appears in it, with planted violations proving
 * the walk can fail. A key in the operator's shell is therefore ignored by construction rather
 * than by inspection, and this sentence is true whether or not one exists.
 *
 * That is the AGENTS.md section 12 discipline applied to a security claim: a prompt, a comment, or
 * a conditional is not a control, and a control that can be weakened by a line edit is not one.
 */
const renderDemoHeader = (corpus: DemoCorpus): string => {
  const collections = Object.entries(corpus.collectionCounts)
    .map(([collection, count]) => `${collection} ${count}`)
    .join(", ")
  return [
    "═".repeat(72),
    "  mizan — offline demo",
    "  no API key · no network · no data/corpus.db",
    "  key         this command reads no environment variable; a key in your shell is ignored",
    // The mode word comes from `TRANSCRIPT_LABEL` in `@mizan/core`, which is also what the CLI
    // header and the static page read. It used to be a literal here, and the two strings on one
    // screen had already drifted — the header said "deterministic replay" and this line said
    // "committed answers replayed". A judge reading both would have been shown two answers to
    // "which mode is this?", which is the opposite of what Story 4 asks this line to do
    // (AGENTS.md section 17: one source of truth per fact).
    //
    // The trailing clause is the half that is NOT in the shared label, and it is the half that
    // matters: a label with no scope reads as a disclaimer covering the whole report, badges
    // included, which would be a false retraction of the one claim this demo makes. The answers
    // are replayed; every badge below them was computed by the verifier on this run.
    `  transcript  ${transcriptLabel("precomputed")} — verdicts computed live`,
    `  corpus      ${corpus.snapshotHash}`,
    `  records     ${corpus.recordCount} (${collections}), rebuilt from ${DEMO_ANCHORS_RELATIVE}`,
    "  attested    every row's textHash re-checked against its stored text before any verdict",
    "  ledger      this command appends nothing to data/runs.jsonl",
    "═".repeat(72),
  ].join("\n")
}

/* ------------------------------------------------------------------ checking the declaration */

/**
 * Compare what the verifier decided against what the question file says it should decide.
 *
 * Both directions matter, and the second is the easy one to forget: a claim the file does not
 * declare is a mismatch even when its verdict looks right, because an undeclared claim is a
 * claim nobody reviewed, and a demo that tolerates one is showing unreviewed output as a
 * demonstration of a reviewed system.
 */
const checkExpectations = (question: DemoQuestion, report: VerdictReport): readonly ExpectationOutcome[] => {
  const byId = new Map(report.claims.map((claim) => [claim.claimId, claim]))
  const declared = new Set(question.expectations.map((entry) => entry.claimId))
  const declaredChecks: ExpectationOutcome[] = question.expectations.map((expectation) => {
    const observed = byId.get(expectation.claimId)
    return {
      claimId: expectation.claimId,
      declared: `${expectation.expectedVerdict} (${expectation.expectedReason})`,
      observed: observed === undefined ? "no verdict at all" : `${observed.verdict} (${observed.reason})`,
      matched: observed !== undefined && observed.verdict === expectation.expectedVerdict && observed.reason === expectation.expectedReason,
    }
  })
  const undeclared: ExpectationOutcome[] = report.claims
    .filter((claim) => !declared.has(claim.claimId))
    .map((claim) => ({ claimId: claim.claimId, declared: "not declared in the question file", observed: `${claim.verdict} (${claim.reason})`, matched: false }))
  return [...declaredChecks, ...undeclared]
}

/* ------------------------------------------------------------------ running one question */

/** The one signature a retriever has to satisfy, named so this file does not spell it twice. */
type Retrieve = (queries: readonly string[]) => readonly RetrievedContext[]

/**
 * Run one question through the real pipeline and render it. Degrades; never guesses.
 *
 * `retrieve` is built once by the caller and shared, so every question in the demo is answered from
 * the same retriever over the same snapshot. Building one per question would be harmless here, but
 * it would make "one corpus, one fingerprint" an accident of a loop rather than a property.
 */
const runQuestion = async (
  corpus: DemoCorpus,
  provider: Provider,
  retrieve: Retrieve,
  question: DemoQuestion,
  index: number,
  total: number,
): Promise<QuestionOutcome> => {
  const outcome = await runSpine({ question: question.question, instructions: SYSTEM_INSTRUCTIONS }, { provider, retrieve })

  const banner = [`\n  ${index}/${total}  ${question.id}`, `  ask:   ${question.question}`, `  shows: ${question.demonstrates}`].join("\n")

  if (!("answer" in outcome)) {
    const screen = [banner, `  ${outcome.message}`, `    reason: ${outcome.reason}`, `    detail: ${outcome.detail}`].join("\n")
    return { id: question.id, screen, asDeclared: false, degraded: true }
  }

  const { resolved } = resolveCitations(corpus.db, outcome.answer.claims.flatMap((claim) => claim.citations))
  const startedAt = performance.now()
  const report = verifyAnswer({
    claims: outcome.answer.claims,
    evidence: resolved,
    snapshotHash: corpus.snapshotHash,
    deadlineExpired: () => performance.now() - startedAt > VERIFICATION_BUDGET_MS,
  })
  const rendered = renderReport({
    prose: outcome.answer.prose,
    report,
    claims: outcome.answer.claims,
    sources: buildSourceTable(resolved),
    relevance: outcome.answer.claims.map((claim) => assessRelevance(question.question, claim.quote ?? "")),
    // The same feature the judge sees on a keyed run, over the same real snapshot, for the same
    // rejections — a demo that dropped it would be showing the product without the part the
    // customer asked for. It is display-only and reads no verdict, so it cannot move a badge, and
    // the expectation checks below are computed from `report`, not from anything printed here.
    suggestions: suggestionsFor(corpus.db, outcome.answer.claims, report.claims),
    transcript: outcome.transcript,
    model: provider.model,
    sourceCount: outcome.contexts.length,
    snapshotHash: corpus.snapshotHash,
  })

  const checks = checkExpectations(question, report)
  const verdictLines = checks.map((check) =>
    check.matched
      ? `  ✓ ${check.claimId} reached ${check.observed}, as declared`
      : `  ✗ ${check.claimId} reached ${check.observed}, but the question file declares ${check.declared}`,
  )
  return { id: question.id, screen: [banner, rendered, ...verdictLines].join("\n"), asDeclared: checks.every((check) => check.matched), degraded: false }
}

/* ------------------------------------------------------------------ preflight */

/**
 * Refuse before any verdict is computed if a declared anchor is not in the corpus.
 *
 * Without this the demo runs to completion and reports `unverifiable` for a citation to a row it
 * never had — a truthful statement about a snapshot built wrong, presented as a demonstration of
 * the verifier. Both answers are honest; only one of them is what the committed files meant.
 */
const preflight = (questions: readonly DemoQuestion[], corpus: DemoCorpus): Result<true, string> => {
  for (const question of questions) {
    for (const anchorId of question.anchorIds) {
      if (corpus.recordIds.has(anchorId)) continue
      return err(`the question "${question.id}" needs anchor ${anchorId}, which is not in the rebuilt demo corpus. Run \`bun run make:transcript\`.`)
    }
  }
  return ok(true)
}

/* ------------------------------------------------------------------ loading committed inputs */

const loadQuestions = async (root: string): Promise<Result<readonly DemoQuestion[], string>> => {
  const set = await readDemoQuestionSet(root)
  if (!isOk(set)) return err(set.error)
  if (set.value.questions.length === 0) return err(`${DEMO_QUESTIONS_RELATIVE} declares no questions, so the demo has nothing to show.`)
  return ok(set.value.questions)
}

const loadTranscript = async (root: string): Promise<Result<TranscriptFile, string>> => {
  const entries = await readTranscript(join(root, TRANSCRIPT_RELATIVE))
  if (entries === null) return err(`no usable transcript at ${TRANSCRIPT_RELATIVE}. Run \`bun run make:transcript\`.`)
  return ok({ entries })
}

const usage = (message: string): number => {
  console.error(`the demo cannot run: ${message}`)
  return EXIT_USAGE
}

/* ------------------------------------------------------------------ the whole demo */

/**
 * Remove the demo's temporary snapshot.
 *
 * `close()` is not enough to unlink a SQLite file on Windows: the handle stays live until the
 * collector finalises it, so a bare `rmSync` fails with EBUSY and turns a demonstration that just
 * passed into a non-zero exit. `Bun.gc(true)` is the documented way to release it, and
 * `maxRetries` covers the residue. `packages/mizan-retrieval/test/search.test.ts` arrived at the
 * same combination independently, which is the sign it is the right one.
 *
 * A failure here is NOT allowed to change the exit code. The demo's verdict is about the corpus
 * and the verdicts, both of which have already been decided by the time this runs; a leaked temp
 * directory is a nuisance that belongs on stderr, not a reason to report a failed demonstration.
 */
const removeTempDir = (dir: string): void => {
  try {
    Bun.gc(true)
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause)
    console.error(`\nNOTE: the temporary demo snapshot at ${dir} could not be removed (${why}). It is safe to delete.`)
  }
}

/**
 * Build the corpus, run the questions, and decide the demo's verdict.
 *
 * Four honest states, each with its own sentence and its own exit code: every declared outcome
 * reached (`0`), the pipeline degraded (`1`), a committed input was unusable (`2`), or the run's
 * own claim about itself failed (`3`).
 *
 * `3` is the shared code for the two ways this command cannot be believed: a corpus that failed
 * attestation, and a pipeline that answered something the question file does not declare. Both are
 * "do not trust the output above", and a harness that sees `3` knows not to read the badges — which
 * is why a regression and a tampered artefact are not split into two codes that mean the same
 * thing to the only consumer of this exit status.
 */
const runWithCorpus = async (root: string, dir: string, questions: readonly DemoQuestion[], transcript: TranscriptFile): Promise<number> => {
  const built = await buildDemoCorpus(root, dir)
  if (!isOk(built)) {
    // A failed attestation is neither a usage error nor a degradation: nothing about the run can
    // be believed and no verdict is shown, so the only response is to stop (section 3). Everything
    // else — an unusable committed file, or a temporary directory this machine would not write to —
    // is `EXIT_USAGE`, including a build fault: the anchors passed their own checks, and calling a
    // local `SQLITE_CANTOPEN` "tampering" would be a false claim about the committed corpus.
    const untrustworthy = built.error._tag === "anchor_tampered" || built.error._tag === "anchor_fold_mismatch"
    console.error(describeDemoCorpusFailure(built.error))
    return untrustworthy ? EXIT_UNTRUSTED : EXIT_USAGE
  }

  const corpus = built.value
  try {
    const ready = preflight(questions, corpus)
    if (!ready.ok) return usage(ready.error)

    console.log(renderDemoHeader(corpus))
    const provider = transcriptProvider(transcript)
    const { retrieve } = makeRetriever(corpus.db)
    const outcomes: QuestionOutcome[] = []
    for (const [index, question] of questions.entries()) {
      const outcome = await runQuestion(corpus, provider, retrieve, question, index + 1, questions.length)
      outcomes.push(outcome)
      console.log(outcome.screen)
    }
    return summarise(outcomes)
  } finally {
    // Closed on every path out, including the usage and degradation ones. A handle left open
    // past here is what makes the directory undeletable on the way out.
    corpus.close()
  }
}

/** The entry point, and the only place a temporary directory exists. */
const runDemo = async (root: string): Promise<number> => {
  const questions = await loadQuestions(root)
  if (!questions.ok) return usage(questions.error)
  const transcript = await loadTranscript(root)
  if (!transcript.ok) return usage(transcript.error)

  const dir = mkdtempSync(join(tmpdir(), "mizan-demo-"))
  try {
    return await runWithCorpus(root, dir, questions.value, transcript.value)
  } finally {
    removeTempDir(dir)
  }
}

/** The closing line, and the only place the demo's verdict on itself is decided. */
const summarise = (outcomes: readonly QuestionOutcome[]): number => {
  const asDeclared = outcomes.filter((outcome) => outcome.asDeclared)
  const degraded = outcomes.filter((outcome) => outcome.degraded)
  console.log(`\n${"─".repeat(72)}`)
  console.log(`  ${asDeclared.length}/${outcomes.length} questions reached the outcome data/demo-questions.json declares`)
  if (degraded.length > 0) {
    console.log(`  ${degraded.length} degraded instead: ${degraded.map((outcome) => outcome.id).join(", ")}`)
    return EXIT_DEGRADED
  }
  if (asDeclared.length !== outcomes.length) {
    console.log("  the rest produced a verdict the committed question file does not declare. That is a regression, not a demonstration.")
    return EXIT_UNTRUSTED
  }
  console.log("  every badge above was computed by mizan-verify from the corpus fingerprint printed at the top of this output.")
  return EXIT_OK
}

/**
 * Exit, without `process.exit`.
 *
 * The exit code is the demo's most machine-readable output, so it is set rather than forced.
 * `process.exit` is a hard stop that can drop a buffered tail when stdout is a pipe, and this
 * command prints 8 KB of evidence whose whole point is that the reader sees all of it; the last
 * line is the one that says the badges are computed, so losing it is the worst possible loss. The
 * snapshot is closed on every path out of `runWithCorpus`, so there is no handle keeping the loop
 * alive and nothing to wait for.
 */
process.exitCode = await runDemo(process.cwd())
