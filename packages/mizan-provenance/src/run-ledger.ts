import { GENESIS_PREV_HASH, RunTrace, decodeOrFail, decodeSync, traceChainHead, traceDigest, type Result, err, ok } from "@mizan/core"

/**
 * The run ledger's chain rules. Pure: no clock, no I/O, no randomness.
 *
 * ## What a run ledger is FOR
 *
 * The corpus ledger answers "where did this text come from". This one answers the harder
 * question: *did a run happen, and did it happen the way the trace says it did?* A product
 * that can prove its corpus is authentic and cannot prove its own run history is a product
 * whose central claim is unfalsifiable in the part that matters — because a fabricated
 * `verified` badge is indistinguishable from a computed one unless the ledger is checked.
 *
 * ## What it deliberately does NOT contain
 *
 * No question text, no answer text, no corpus text, no PII, no provider key. A `RunTrace`
 * carries `questionHash`, per-claim verdict codes, and timings (AGENTS.md section 13). This
 * module adds no field; the chain is built out of what the core contract already allows, and
 * the digest projection lives in `@mizan/core/schema/trace.ts` so there is exactly one
 * definition of what a run link is made of.
 *
 * ## Why `verifyRunChain` names an index
 *
 * Same reason as the ingest chain, and it is the acceptance criterion of R11: "the ledger is
 * invalid" is not actionable, "entry 7 does not match" is. The index is exact, and only the
 * FIRST break is reported, because every link after the first is unverifiable — its
 * `prevHash` is a value we can no longer trust.
 */

export const RUN_LEDGER_VERSION = "1"

/** Why a chain is not intact. Each variant names something a person can go and look at. */
export type ChainBreak = {
  /** Zero-based index into the ledger array. The judge-facing number. */
  readonly index: number
  readonly reason: "prev_hash_mismatch" | "digest_mismatch" | "decode_failed" | "not_append_only"
  readonly detail: string
}

/** A ledger that did not end cleanly, e.g. a process killed mid-write. */
export type TornTail = {
  /** 1-based line number of the incomplete line. */
  readonly line: number
  readonly bytes: number
  readonly detail: string
}

export type LedgerProblem = { readonly _tag: "chain_broken"; readonly breaks: readonly ChainBreak[] } | { readonly _tag: "torn_tail"; readonly tail: TornTail }

/**
 * Parse one ledger line.
 *
 * Decoded through the `RunTrace` schema rather than `JSON.parse`-and-trust, because this file
 * is a trust boundary: it is read back from disk, and it is exactly the artefact an attacker
 * with write access would edit to launder a fabricated run (AGENTS.md section 1).
 *
 * The decode failure is folded into the chain break rather than thrown, so a single corrupt
 * line is reported as *the line that is corrupt* instead of aborting the whole read — which is
 * the difference between a diagnosable problem and a crashed tool.
 */
const decodeLine = (line: string, index: number): Result<RunTrace, ChainBreak> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(line) as unknown
  } catch (cause) {
    return err({ index, reason: "decode_failed", detail: `entry ${index} is not valid JSON: ${cause instanceof Error ? cause.message : "parse error"}` })
  }
  const decoded = decodeOrFail(decodeSync(RunTrace), parsed, "RunTrace")
  if (!decoded.ok) {
    return err({ index, reason: "decode_failed", detail: `entry ${index} does not decode as a RunTrace: ${decoded.error.detail}` })
  }
  return ok(decoded.value)
}

/**
 * Verify the chain end to end, returning the first break.
 *
 * Three independent checks per entry, because they catch different attacks:
 *
 *  - `decode_failed` — the line is not a well-formed `RunTrace`. Catches hand-written entries
 *    that never came from `sealTrace`.
 *  - `prev_hash_mismatch` — this entry does not follow the one before it. Catches deletion and
 *    reordering, which per-entry digests cannot see because every surviving entry still hashes
 *    correctly.
 *  - `digest_mismatch` — the entry's own `entryHash` does not match its content. Catches
 *    editing a field after the fact.
 */
export const verifyRunChain = (traces: readonly RunTrace[]): readonly ChainBreak[] => {
  let expectedPrev = GENESIS_PREV_HASH
  for (const [index, trace] of traces.entries()) {
    if (trace.prevHash !== expectedPrev) {
      return [{ index, reason: "prev_hash_mismatch", detail: `entry ${index} follows ${trace.prevHash.slice(0, 12)}…, expected ${expectedPrev.slice(0, 12)}…` }]
    }
    const recomputed = traceDigest(trace.prevHash, trace)
    if (recomputed !== trace.entryHash) {
      return [{ index, reason: "digest_mismatch", detail: `entry ${index} was altered after it was written` }]
    }
    expectedPrev = trace.entryHash
  }
  return []
}

/**
 * Detect a torn tail: a final line with no newline terminator.
 *
 * ## Why this is not "just ignore the last line"
 *
 * A process killed between `write` and the newline leaves half a JSON object. Two tempting
 * responses are both wrong. Ignoring it means the ledger silently loses the run that was in
 * flight — and a lost run is a run whose claims were never shown to be verified. Truncating
 * it means a later append lands on top of the fragment and corrupts the entry after it too.
 *
 * So it is REPORTED, by line and byte count, and the caller refuses to append until a human
 * decides what happened. The chain itself is intact up to the break — `verifyRunChain` is the
 * tool for that question, and `tornTail` is the tool for this one.
 *
 * Note this can only ever be the LAST line. A missing newline in the middle is a corruption
 * the parser will already have caught as `decode_failed`, because the next entry's JSON would
 * be glued onto it.
 */
export const tornTail = (raw: string): TornTail | null => {
  if (raw.length === 0) return null
  if (raw.endsWith("\n")) return null
  const lines = raw.split("\n")
  const last = lines[lines.length - 1] ?? ""
  return {
    line: lines.length,
    bytes: last.length,
    detail: `line ${lines.length} has no terminating newline (${last.length} bytes); the file was probably truncated mid-write`,
  }
}

/**
 * Split a ledger file into entries and problems.
 *
 * Returns the entries that parsed *and* the breaks that did not, so one bad line does not
 * hide the state of the rest. The caller decides: `verifyRunChain` over the good prefix
 * answers "where did it break", and this answers "what is readable".
 */
export const readRunChain = (raw: string): { readonly traces: readonly RunTrace[]; readonly breaks: readonly ChainBreak[]; readonly tail: TornTail | null } => {
  const tail = tornTail(raw)
  const body = tail === null ? raw : raw.slice(0, raw.length - tail.bytes)
  const lines = body.split("\n")
  const traces: RunTrace[] = []
  const breaks: ChainBreak[] = []
  for (const [physical, line] of lines.entries()) {
    // A blank line is skipped, but it still occupies a line: the reported index is the line a
    // judge can go and open, so filtering first and numbering afterwards would point them at
    // the wrong line for every break below a stray newline.
    if (line.trim().length === 0) continue
    const decoded = decodeLine(line, physical)
    if (decoded.ok) traces.push(decoded.value)
    else breaks.push(decoded.error)
  }
  return { traces, breaks, tail }
}

/** A full report for a judge: intact, or the exact first break. */
export const auditRunLedger = (raw: string): Result<{ readonly traces: readonly RunTrace[]; readonly head: string }, LedgerProblem> => {
  const { traces, breaks, tail } = readRunChain(raw)
  if (tail !== null) return err({ _tag: "torn_tail", tail })
  if (breaks.length > 0) return err({ _tag: "chain_broken", breaks: [breaks[0]!] })
  const chainBreaks = verifyRunChain(traces)
  if (chainBreaks.length > 0) return err({ _tag: "chain_broken", breaks: chainBreaks })
  return ok({ traces, head: traceChainHead(traces) })
}

/** One line for a judge. The index is the whole point, so it leads. */
export const describeProblem = (problem: LedgerProblem): string => {
  if (problem._tag === "torn_tail") return `torn tail: ${problem.tail.detail}`
  const first = problem.breaks[0]!
  return `entry ${first.index}: ${first.reason} — ${first.detail}`
}

/** The hash the next entry must follow, given what is on disk right now. */
export const headOf = (traces: readonly RunTrace[]): string => traceChainHead(traces)

/** The bytes one entry occupies on disk: canonical JSON, one line, newline-terminated. */
export const serialiseEntry = (trace: RunTrace): string => `${JSON.stringify(trace)}\n`

export * as RunLedger from "./run-ledger.ts"
