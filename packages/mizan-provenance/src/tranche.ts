import { type RunTrace } from "@mizan/core"
import { auditRunLedger, describeProblem } from "./run-ledger.ts"

/**
 * The machine check that makes a live-run tranche believable (MIZ-110).
 *
 * ## What the tranche is, and why it needs a machine check
 *
 * ADR-11 discloses that 196 of 274 ledger rows carry placeholder timings from a trace-builder
 * bug, and that 273 of 274 runs are precomputed rather than live. The repair is not to rewrite
 * — rewriting breaks the hash chain — but to APPEND a tranche of genuinely live runs and to put
 * a machine in between "the team says these are live" and "the ledger says these are live".
 * That machine is this module. A human reading twenty rows and saying "yes, looks real" is the
 * exact failure ADR-11 exists to stop; a machine check over the TAIL is the acceptance test the
 * sprint chose precisely because the key cannot run in CI.
 *
 * ## Why every check is about the DEBUG SHAPE, not the average
 *
 * Placeholder rows are not individually absurd — a zero millisecond stage is a lie, but a
 * plausibly fast one. So each rule targets the signature of the bug, not a threshold:
 *
 *  - *transcript* must be `live`. A replayed transcript in the tranche is a row wearing a
 *    costume; the tier is a schema value, and the schema value is checked, not the prose.
 *  - a *stage that executed* must take real time. A tool call is executed whenever
 *    `toolsCalled` is non-empty; generation and verification execute on every live run, so a
 *    zero on any stage mean the timings were stamped, not measured.
 *  - *resultCount* must not be constant across the tail. The bug wrote `resultCount: 3` into
 *    every row. A bank of twenty real runs having the SAME result count is possible the way
 *    twenty coin flips landing heads is possible — and with the same kind of credibility.
 *  - no *question string* and no *key-shaped token* may be present: rule 13 and A02/A07,
 *    checked because the file is a trust boundary read back from disk.
 *
 * ## The start index exists to make the check tail-ONLY
 *
 * Passing the whole ledger array but auditing only from `startIndex` keeps the read cheap in
 * the common case and lets the caller say exactly where the tranche begins. Entries before the
 * start index are irrelevant to the question "is the tranche honest" — they are the disclosed
 * past, and ADR-11's doctrine is to disclose rather than to mend them.
 *
 * ## What this module is NOT
 *
 * It is not a chain verifier — `auditRunLedger` is, and the file-level entry below runs it
 * first. It is not a gate in CI; it is a check the tranche command runs when it has done its
 * work, and that a judge can run again at any time.
 */

/** The tranche must reach this many entries; fewer means "short", never "padded". */
export const TRANCHE_MIN_ENTRIES = 20

/** OpenAI-style key prefix. Extend the array as shapes appear; never accept a bare `sk-` alone. */
const KEY_SHAPES = [/sk-[A-Za-z0-9]{10,}/]

export type TrancheAudit = {
  readonly ok: boolean
  /** Zero-based index of the first audited entry — the declared tranche start. */
  readonly startIndex: number
  /** How many entries the tail actually held. */
  readonly count: number
  /** Human-readable violations, one per entry per rule, empty when `ok`. */
  readonly violations: readonly string[]
}

export type TrancheOptions = {
  /** Fewer entries than this is a short tranche. Defaults to `TRANCHE_MIN_ENTRIES`. */
  readonly minCount?: number
  /**
   * The question texts the tranche asked. Passed in so "no question string in the ledger" is
   * checkable; without them the rule has nothing to look for and checks only the key shapes.
   */
  readonly knownQuestions?: readonly string[]
}

/**
 * Audit the entries at and after `startIndex`.
 *
 * Pure over an already-decoded, already-chain-verified array: decoding is a trust-boundary
 * concern that belongs to the ledger reader, and chain integrity belongs to `verifyRunChain`.
 * Both run before this in `auditTrancheFile`.
 */
export const auditTranche = (traces: readonly RunTrace[], startIndex: number, options: TrancheOptions = {}): TrancheAudit => {
  const minCount = options.minCount ?? TRANCHE_MIN_ENTRIES
  const violations: string[] = []

  const tail = traces.slice(startIndex)
  if (tail.length < minCount) {
    violations.push(`tranche is short: ${tail.length} entries at or after index ${startIndex}, expected at least ${minCount}`)
  }

  for (const [offset, trace] of tail.entries()) {
    const index = startIndex + offset
    if (trace.transcript !== "live") {
      violations.push(`entry ${index}: transcript is "${trace.transcript}", but the tranche is by definition live`)
    }

    if (trace.toolsCalled.length > 0) {
      if (trace.timings.retrievalMs === 0) {
        violations.push(`entry ${index}: retrievalMs is 0 on a run that called ${trace.toolsCalled.length} tool(s), so retrieval executed`)
      }
      for (const [callIndex, call] of trace.toolsCalled.entries()) {
        if (call.elapsedMs === 0) {
          violations.push(`entry ${index}: tool call ${callIndex} (${call.tool}) elapsedMs is 0 on a run whose retrieval executed`)
        }
      }
    }

    if (trace.timings.generationMs === 0) {
      violations.push(`entry ${index}: generationMs is 0 on a live run; generation executed or the run should be degraded`)
    }
    if (trace.timings.verificationMs === 0) {
      violations.push(`entry ${index}: verificationMs is 0 on a live run; verification always executes`)
    }
    if (trace.timings.totalMs === 0) {
      violations.push(`entry ${index}: totalMs is 0, which no real run has`)
    }

    const json = JSON.stringify(trace)
    for (const shape of KEY_SHAPES) {
      const found = shape.exec(json)
      if (found !== null) violations.push(`entry ${index}: key-shaped token "${found[0]}" present in the entry`)
    }
    for (const question of options.knownQuestions ?? []) {
      if (json.includes(question)) violations.push(`entry ${index}: a known question string appears in the entry`)
    }
  }

  // The ADR-11 signature check works on what the tail as a whole says, not on one entry.
  const counts = tail.flatMap((trace) => trace.toolsCalled.map((call) => call.resultCount))
  if (counts.length >= 2 && new Set(counts).size === 1) {
    violations.push(`tranche: every retrieval across the tail returned resultCount ${counts[0]}; a constant count is the placeholder-bug signature`)
  }

  return {
    ok: violations.length === 0,
    startIndex,
    count: tail.length,
    violations,
  }
}

export type TrancheFileAudit =
  | { readonly ok: true; readonly audit: TrancheAudit }
  | { readonly ok: false; readonly problem: string; readonly audit?: TrancheAudit }

/**
 * The file-level entry point: chain first, tail second.
 *
 * A tranche whose chain is broken cannot be audited for honesty — the rows themselves are
 * untrustworthy before any per-row check runs — so `auditRunLedger` comes first and its exact
 * break is re-reported. A tranche that fails the honesty checks is a different failure, and
 * carries the structured `audit` with its named violations so the caller (and a judge) can
 * read exactly what the machine objected to.
 */
export const auditTrancheFile = (
  raw: string,
  startIndex: number,
  options: TrancheOptions = {},
): TrancheFileAudit => {
  const ledger = auditRunLedger(raw)
  if (!ledger.ok) return { ok: false, problem: describeProblem(ledger.error) }
  const audit = auditTranche(ledger.value.traces, startIndex, options)
  if (!audit.ok) {
    const names = audit.violations.join("; ")
    return { ok: false, problem: `tranche failed ${audit.violations.length} check(s): ${names}`, audit }
  }
  return { ok: true, audit }
}

export * as Tranche from "./tranche.ts"