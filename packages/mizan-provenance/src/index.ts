/**
 * `@mizan/provenance` — the append-only, hash-chained record of every run.
 *
 * Two modules, split along the line that matters for testing:
 *
 *  - `run-ledger.ts` is pure. Chain rules, torn-tail detection, and the judge-facing summary.
 *    No clock, no I/O, no randomness, so every one of its claims is testable by planting a
 *    specific corruption.
 *  - `run-store.ts` is the only I/O, and it is fail-closed. A write that cannot be confirmed
 *    is reported as a failure and the run is untrusted (AGENTS.md sections 3 and 16).
 *
 * The digest projection is NOT here. It lives in `@mizan/core/schema/trace.ts` as
 * `traceDigest`, and this package reuses it unchanged, so the run chain and the ingest chain
 * are built by one definition of what a link is (AGENTS.md section 17).
 *
 * What the ledger never contains: question text, answer text, corpus text, PII, or a secret.
 * A `RunTrace` carries `questionHash`, verdict codes and timings, and this package adds no
 * field to it — that is what makes a ledger a judge can be asked to read (section 13).
 */

export {
  RUN_LEDGER_VERSION,
  auditRunLedger,
  describeProblem,
  headOf,
  readRunChain,
  serialiseEntry,
  tornTail,
  verifyRunChain,
  type ChainBreak,
  type LedgerProblem,
  type TornTail,
} from "./run-ledger.ts"

export {
  appendRunTrace,
  appendRunTraces,
  readLedger,
  type AppendFailureReason,
  type AppendResult,
  type LedgerState,
} from "./run-store.ts"
