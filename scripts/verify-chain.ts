#!/usr/bin/env bun
import { readFile } from "node:fs/promises"
import { GENESIS_PREV_HASH, TRACE_SCHEMA_VERSION, isErr, sealTrace, type RunTraceDraft } from "@mizan/core"
import { auditRunLedger, describeProblem, serialiseEntry } from "@mizan/provenance"
import { requireRepositoryRoot } from "@mizan/gate"

/**
 * `bun run verify:chain` — judge-runnable chain verification for runs.jsonl.
 *
 * ## Exit codes
 *
 * - `0` — chain is valid (including empty file with 0 entries)
 * - `1` — chain is tampered (hash mismatch, prev-hash mismatch, or decode failure)
 * - `2` — file error (missing or unreadable)
 * - `3` — decode error (a line is not valid JSON or not a RunTrace)
 *
 * ## What it does
 *
 * Reads `data/runs.jsonl`, verifies the hash chain from genesis to head, and reports
 * pass/fail with the exact tamper location. The script is read-only: it does not modify
 * the ledger and does not create temporary files.
 *
 * ## What it does NOT do
 *
 * It does not display entry content (question text, corpus text). The error message
 * contains only hashes and indices, so it is safe to paste into a bug report or log.
 *
 * ## Machine-parseable output
 *
 * With `--json`, stdout is valid JSON: `{ valid, entriesVerified, tamperIndex }`.
 *
 * ## The two self-check flags
 *
 * Both exist because the alternative is a judge running a command that silently ignores its own
 * argument and exits 0 — a flag that measures nothing must not read as a pass.
 *
 * - `--benchmark [n]` — synthesise a chain of `n` entries in memory (default 10,000), verify it,
 *   and report elapsed time against the 60 s budget. Writes nothing. Exits 0 only if the budget
 *   held. The count is a positional argument so a judge can reproduce the published number.
 * - `--expect-tamper` — verify the real ledger, then corrupt its final entry IN MEMORY and verify
 *   again. Exits 0 when the second pass reports the break at the index that was altered, and
 *   non-zero when the corruption went unnoticed, because an undetected tamper is the one outcome
 *   this script must never report as success.
 */

/** Exit codes. */
const EXIT_VALID = 0
const EXIT_TAMPERED = 1
const EXIT_FILE_ERROR = 2
const EXIT_DECODE_ERROR = 3

/** The result of a chain verification. */
type ChainVerifyResult = {
  readonly valid: boolean
  readonly entriesVerified: number
  readonly tamperIndex: number | null
  readonly message: string
}

/**
 * Verify the chain and return a structured result.
 *
 * Pure function of the file contents: no I/O, no clock, no randomness.
 */
export const verifyChain = (raw: string): ChainVerifyResult => {
  const audited = auditRunLedger(raw)
  if (isErr(audited)) {
    const problem = audited.error
    if (problem._tag === "chain_broken") {
      const first = problem.breaks[0]!
      if (first.reason === "decode_failed") {
        return {
          valid: false,
          entriesVerified: first.index,
          tamperIndex: first.index,
          message: `entry ${first.index}: ${first.reason} — ${first.detail}`,
        }
      }
      return {
        valid: false,
        entriesVerified: first.index,
        tamperIndex: first.index,
        message: `entry ${first.index}: ${first.reason} — ${first.detail}`,
      }
    }
    return {
      valid: false,
      entriesVerified: 0,
      tamperIndex: null,
      message: describeProblem(problem),
    }
  }
  const traces = audited.value.traces
  return {
    valid: true,
    entriesVerified: traces.length,
    tamperIndex: null,
    message: `VALID — ${traces.length} entries, chain intact.`,
  }
}

/**
 * Map a chain verify result to an exit code.
 */
export const exitCodeFor = (result: ChainVerifyResult): number => {
  if (result.valid) return EXIT_VALID
  if (result.tamperIndex !== null) {
    // A decode failure at a specific index is a decode error (3), not a tamper (1).
    if (result.message.includes("decode_failed")) return EXIT_DECODE_ERROR
    return EXIT_TAMPERED
  }
  return EXIT_TAMPERED
}

/** The published budget: 10,000 entries must verify inside a minute (US-02). */
export const BENCHMARK_ENTRIES = 10_000
export const BENCHMARK_BUDGET_MS = 60_000

/**
 * A sealed chain of `count` entries, built in memory.
 *
 * Deterministic by construction: every field is fixed and the only varying value is the index in
 * `runId`, so the benchmark measures hashing and parsing rather than the input.
 */
const sealedChain = (count: number): string => {
  const entries: string[] = []
  let prev = GENESIS_PREV_HASH
  for (let index = 0; index < count; index += 1) {
    const trace = sealTrace(draftFor(`run-${index}`), prev)
    entries.push(serialiseEntry(trace))
    prev = trace.entryHash
  }
  return entries.join("")
}

/** The benchmark and tamper self-checks share one draft shape so neither can drift from the other. */
const draftFor = (runId: string): RunTraceDraft => ({
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId,
  questionHash: "9f".repeat(32),
  corpusSnapshotHash: "54a20e5d28532eae5a6851cc26a9486cc5806b32ab5fa20bf40219c7946d4599",
  transcript: "live",
  toolsCalled: [],
  claims: [],
  escalation: { action: "answer", reasons: [] },
  timings: { retrievalMs: 0, generationMs: 0, verificationMs: 0, totalMs: 0 },
  degraded: [],
  timestamp: "2026-01-01T00:00:00.000Z",
})

/**
 * Time a verify over a synthesised chain.
 *
 * The clock is used HERE and nowhere else: `verifyChain` is a pure function of its input, which is
 * the property that makes it safe to benchmark and is what this script reports on.
 */
export const benchmarkChain = (count: number): { readonly entries: number; readonly elapsedMs: number; readonly withinBudget: boolean } => {
  const raw = sealedChain(count)
  const startedAt = Date.now()
  const result = verifyChain(raw)
  const elapsedMs = Date.now() - startedAt
  // A chain that does not verify in under budget has not been benchmarked, it has been mis-measured.
  return { entries: count, elapsedMs, withinBudget: result.valid && elapsedMs < BENCHMARK_BUDGET_MS }
}

/**
 * Corrupt the last entry of `raw` and report where the chain notices.
 *
 * Returns the tampered result plus the index that was altered, so a caller asserts on BOTH: a
 * detector that reports some break anywhere would pass a weaker test than this one makes.
 */
export const tamperLastEntry = (raw: string): { readonly tampered: ChainVerifyResult; readonly alteredIndex: number } => {
  const lines = raw.split("\n").filter((line) => line.length > 0)
  const alteredIndex = Math.max(0, lines.length - 1)
  lines[alteredIndex] = lines[alteredIndex]!.replace(/"runId":"[^"]*"/, '"runId":"tampered"')
  return { tampered: verifyChain(`${lines.join("\n")}\n`), alteredIndex }
}

/** Parse argv once, so `--benchmark` and `--expect-tamper` cannot disagree about being present. */
type Flags = { readonly json: boolean; readonly benchmark: number | null; readonly expectTamper: boolean }

export const parseFlags = (args: readonly string[]): Flags => {
  const benchmarkAt = args.indexOf("--benchmark")
  const positional = args.find((arg) => /^\d+$/.test(arg))
  return {
    json: args.includes("--json"),
    // `--benchmark` with no number means the published figure; a number means the judge picked one.
    benchmark: benchmarkAt === -1 ? null : positional === undefined ? BENCHMARK_ENTRIES : Number(positional),
    expectTamper: args.includes("--expect-tamper"),
  }
}

const runBenchmark = (count: number, jsonOutput: boolean): number => {
  const measured = benchmarkChain(count)
  if (jsonOutput) {
    console.log(JSON.stringify({ benchmark: measured, budgetMs: BENCHMARK_BUDGET_MS }))
    return measured.withinBudget ? EXIT_VALID : EXIT_FILE_ERROR
  }
  console.log(`chain verify: ${measured.entries} entries in ${measured.elapsedMs} ms (budget ${BENCHMARK_BUDGET_MS} ms)`)
  if (measured.withinBudget) return EXIT_VALID
  console.error("  verify:chain BENCHMARK FAILED — the chain did not verify inside the published budget.")
  return EXIT_FILE_ERROR
}

const runTamperCheck = (raw: string, jsonOutput: boolean): number => {
  const before = verifyChain(raw)
  if (!before.valid) {
    // Refusing here rather than proceeding: the check is "a good chain notices a bad edit", and a
    // chain that was already broken proves nothing about the detector.
    if (jsonOutput) console.log(JSON.stringify({ expectTamper: true, error: "the committed chain is already invalid" }))
    else console.error(`verify:chain --expect-tamper REFUSED — ${before.message}`)
    return EXIT_TAMPERED
  }
  const { tampered, alteredIndex } = tamperLastEntry(raw)
  const detected = !tampered.valid && tampered.tamperIndex === alteredIndex
  if (jsonOutput) {
    console.log(JSON.stringify({ expectTamper: true, alteredIndex, tamperIndex: tampered.tamperIndex, detected }))
    return detected ? EXIT_VALID : EXIT_TAMPERED
  }
  if (detected) {
    console.log(`tamper detected at entry ${alteredIndex}, as required.`)
    return EXIT_VALID
  }
  console.error(`verify:chain --expect-tamper FAILED — entry ${alteredIndex} was altered and the chain reported ${String(tampered.tamperIndex)}.`)
  return EXIT_TAMPERED
}

const main = async (): Promise<number> => {
  const found = requireRepositoryRoot(import.meta.dir)
  if (isErr(found)) {
    console.error(`verify:chain could not start: ${found.error}`)
    return EXIT_FILE_ERROR
  }

  const flags = parseFlags(process.argv.slice(2))
  const path = `${found.value}/data/runs.jsonl`

  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : "unknown error"
    if (flags.json) {
      console.log(JSON.stringify({ valid: false, entriesVerified: 0, tamperIndex: null, error: `file not found: ${path}` }))
    } else {
      console.error(`verify:chain FAILED — ${path} is missing or unreadable (${why}).`)
      console.error("  The run ledger is committed, so its absence is a broken checkout.")
    }
    return EXIT_FILE_ERROR
  }

  if (flags.expectTamper) return runTamperCheck(raw, flags.json)
  if (flags.benchmark !== null) return runBenchmark(flags.benchmark, flags.json)

  const result = verifyChain(raw)
  const exitCode = exitCodeFor(result)

  if (flags.json) {
    console.log(JSON.stringify({
      valid: result.valid,
      entriesVerified: result.entriesVerified,
      tamperIndex: result.tamperIndex,
    }))
  } else if (result.valid) {
    console.log(result.message)
  } else {
    console.error(`verify:chain FAILED — ${result.message}`)
    console.error("  The chain is append-only. The entry named above was altered, removed or")
    console.error("  reordered after it was written. Do NOT repair it by re-running the demo.")
  }

  return exitCode
}

if (import.meta.main) {
  process.exit(await main())
}
