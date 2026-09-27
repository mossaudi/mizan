import { nowIso, sha256Hex, TRACE_SCHEMA_VERSION, type RunTraceDraft, type TranscriptKind } from "@mizan/core"

/**
 * How a run trace draft is assembled — and, mostly, how it is NOT.
 *
 * ## The failure this file exists to correct
 *
 * The previous builder took a `totalMs` and returned
 * `timings: { retrievalMs: 0, generationMs: 0, verificationMs: 0, totalMs }`, and the caller
 * supplied the `toolsCalled` rows as literal constants: one row per decomposed query, named
 * `quranSearch+hadithSearch`, with `resultCount` set to the total context count, `ranking: "fused"`
 * and `elapsedMs: 0`. None of those values was read from anything that ran. Both tools were
 * actually invoked separately and had already reported their real counts, rankings and elapsed
 * times; the numbers were computed and then dropped on the floor in favour of literals.
 *
 * So every run in the 274-entry ledger states that a fused ranker ran, that it took 0 ms, and
 * that it returned the combined context count for a single fused call. A trace exists to be
 * evidence. Evidence that is typed in after the fact is not evidence, and a judge who discovers
 * that loses the ability to trust the 273 entries that were fine.
 *
 * The correction is not a comment: this module accepts only MEASURED inputs and cannot express a
 * hardcoded ranking or a zero it did not receive. `retriever.ts` is the single source of the
 * numbers; `verify` is the single source of the verdicts.
 *
 * ## `generationMs` is a remainder, and is labelled as one
 *
 * By the time the trace is built, retrieval and verification have each been timed with their own
 * stopwatch. What remains of the wall clock is the model-facing work: decomposition, the provider
 * round trip, and the sanitising between them. Reporting that remainder under the name
 * `generationMs` overstates it, so the derivation is written down here and the value is clamped at
 * zero — a clock that steps backwards mid-run cannot produce a negative duration in a trace a
 * judge is invited to reason about.
 */

/** One retrieval call as the trace records it. Not a re-declaration of the trace's own shape. */
export type ToolCall = RunTraceDraft["toolsCalled"][number]

/** Sum the measured per-call times. This is the trace's `retrievalMs`, and only this is. */
export const sumElapsed = (calls: readonly ToolCall[]): number =>
  calls.reduce((total, call) => total + call.elapsedMs, 0)

/**
 * Read the clock once, here, and split the run into the three stages the trace names.
 *
 * @param startedAt a `performance.now()` reading from the top of `ask`, before the provider is
 *   resolved — so `totalMs` includes provider setup, which a reader comparing the sum of the
 *   three stages against the wall clock would otherwise find unexplained.
 * @param verificationMs measured around the `verifyAnswer` call. Pass 0 for a run whose
 *   verification never executed (a provider outage): a zero for a stage that did not run and a
 *   zero for a stage that measured instant are different statements, and `toolsCalled` being
 *   empty alongside it is what tells them apart.
 */
export const buildTimings = (input: {
  readonly startedAt: number
  readonly retrievalMs: number
  readonly verificationMs: number
}): RunTraceDraft["timings"] => {
  const totalMs = Math.max(0, Math.round(performance.now() - input.startedAt))
  return {
    retrievalMs: input.retrievalMs,
    generationMs: Math.max(0, totalMs - input.retrievalMs - input.verificationMs),
    verificationMs: input.verificationMs,
    totalMs,
  }
}

/** One draft trace per run. Built from what the run actually did, never from what we hoped. */
export const buildDraft = (input: {
  readonly runId: string
  readonly question: string
  readonly snapshotHash: string
  readonly transcript: TranscriptKind
  readonly toolCalls: readonly ToolCall[]
  readonly claims: RunTraceDraft["claims"]
  readonly degraded: RunTraceDraft["degraded"]
  readonly timings: RunTraceDraft["timings"]
}): RunTraceDraft => ({
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId: input.runId,
  // The question is hashed here, once, at the boundary. Nothing downstream of this line has
  // the question in a variable it could accidentally log.
  questionHash: sha256Hex(input.question),
  corpusSnapshotHash: input.snapshotHash,
  transcript: input.transcript,
  toolsCalled: input.toolCalls,
  claims: input.claims,
  escalation: {
    action: input.claims.every((claim) => claim.verdict === "verified") && input.claims.length > 0 ? "answer" : "refer_to_scholar",
    reasons: input.claims.filter((claim) => claim.verdict !== "verified").map((claim) => `${claim.claimId}:${claim.reason}`),
  },
  timings: input.timings,
  degraded: input.degraded,
  timestamp: nowIso(),
})

export * as TraceBuild from "./trace-build.ts"
