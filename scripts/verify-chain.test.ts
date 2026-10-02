import { describe, expect, test } from "bun:test"
import { GENESIS_PREV_HASH, TRACE_SCHEMA_VERSION, sealTrace, type RunTraceDraft } from "@mizan/core"
import { serialiseEntry } from "@mizan/provenance"
import { verifyChain, exitCodeFor, benchmarkChain, parseFlags, tamperLastEntry } from "./verify-chain.ts"

/**
 * Chain verify script tests.
 *
 * ## What these tests verify
 *
 * 1. A valid chain passes with exit code 0.
 * 2. An empty file passes with exit code 0 and 0 entries.
 * 3. A tampered chain fails with exit code 1 and the exact index.
 * 4. A decode failure fails with exit code 3.
 * 5. The error message contains only hashes and indices (no content).
 * 6. The exit code mapping is correct.
 * 7. The `--benchmark` and `--expect-tamper` flags actually do something.
 */

const draft = (runId: string): RunTraceDraft => ({
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

const sealedChain = (count: number): string => {
  const entries: string[] = []
  let prev = GENESIS_PREV_HASH
  for (let i = 0; i < count; i += 1) {
    const trace = sealTrace(draft(`run-${i}`), prev)
    entries.push(serialiseEntry(trace))
    prev = trace.entryHash
  }
  return entries.join("")
}

describe("verifyChain", () => {
  test("an empty file is valid with 0 entries", () => {
    const result = verifyChain("")
    expect(result.valid).toBe(true)
    expect(result.entriesVerified).toBe(0)
    expect(result.tamperIndex).toBeNull()
  })

  test("a valid chain passes", () => {
    const result = verifyChain(sealedChain(5))
    expect(result.valid).toBe(true)
    expect(result.entriesVerified).toBe(5)
    expect(result.tamperIndex).toBeNull()
  })

  test("a single entry is valid", () => {
    const result = verifyChain(sealedChain(1))
    expect(result.valid).toBe(true)
    expect(result.entriesVerified).toBe(1)
  })

  test("a tampered entry is detected at the exact index", () => {
    const chain = sealedChain(5)
    const lines = chain.split("\n").filter((l) => l.length > 0)
    // Tamper with entry 2 (index 2)
    const tampered = JSON.parse(lines[2]!) as { runId: string }
    tampered.runId = "tampered-run"
    lines[2] = JSON.stringify(tampered)
    const result = verifyChain(lines.join("\n") + "\n")
    expect(result.valid).toBe(false)
    expect(result.tamperIndex).toBe(2)
  })

  test("a deleted entry is detected", () => {
    const chain = sealedChain(5)
    const lines = chain.split("\n").filter((l) => l.length > 0)
    // Delete entry 2
    lines.splice(2, 1)
    const result = verifyChain(lines.join("\n") + "\n")
    expect(result.valid).toBe(false)
    expect(result.tamperIndex).toBe(2)
  })

  test("an inserted forged entry is detected", () => {
    const chain = sealedChain(5)
    const lines = chain.split("\n").filter((l) => l.length > 0)
    // Insert a forged entry at position 2
    const forged = sealTrace(draft("forged-run"), GENESIS_PREV_HASH)
    lines.splice(2, 0, serialiseEntry(forged).trim())
    const result = verifyChain(lines.join("\n") + "\n")
    expect(result.valid).toBe(false)
    expect(result.tamperIndex).toBe(2)
  })

  test("a decode failure is detected", () => {
    const chain = sealedChain(5)
    const lines = chain.split("\n").filter((l) => l.length > 0)
    // Corrupt entry 3
    lines[3] = "{ not valid json"
    const result = verifyChain(lines.join("\n") + "\n")
    expect(result.valid).toBe(false)
    expect(result.tamperIndex).toBe(3)
  })

  test("the error message contains only hashes and indices", () => {
    const chain = sealedChain(5)
    const lines = chain.split("\n").filter((l) => l.length > 0)
    const tampered = JSON.parse(lines[2]!) as { runId: string }
    tampered.runId = "SECRET_CONTENT_THAT_MUST_NOT_LEAK"
    lines[2] = JSON.stringify(tampered)
    const result = verifyChain(lines.join("\n") + "\n")
    expect(result.valid).toBe(false)
    expect(result.message).not.toContain("SECRET_CONTENT_THAT_MUST_NOT_LEAK")
  })
})

describe("exitCodeFor", () => {
  test("a valid chain exits 0", () => {
    expect(exitCodeFor({ valid: true, entriesVerified: 5, tamperIndex: null, message: "" })).toBe(0)
  })

  test("a tampered chain exits 1", () => {
    expect(exitCodeFor({ valid: false, entriesVerified: 2, tamperIndex: 2, message: "entry 2: digest_mismatch" })).toBe(1)
  })

  test("a decode failure exits 3", () => {
    expect(exitCodeFor({ valid: false, entriesVerified: 3, tamperIndex: 3, message: "entry 3: decode_failed" })).toBe(3)
  })
})

/**
 * The two documented self-check flags.
 *
 * The failure these guard is specific and was real: a flag the script does not implement is a flag
 * it ignores, so `--benchmark` used to print the ordinary result and exit 0 — a judge following
 * the runbook would record a passed budget measurement that was never taken. Both surfaces are
 * therefore tested in the direction that matters, which is the one where the honest answer is a
 * refusal rather than a pass.
 */
describe("parseFlags", () => {
  test("no flags means neither self-check runs", () => {
    expect(parseFlags([])).toEqual({ json: false, benchmark: null, expectTamper: false })
  })

  test("`--benchmark` with no number means the published 10,000-entry figure", () => {
    // The alternative — defaulting to a small number nobody can compare against — would make the
    // command succeed while reporting a figure unlike the one the acceptance criterion names.
    expect(parseFlags(["--benchmark"]).benchmark).toBe(10_000)
  })

  test("a bare number overrides the benchmark size, so a judge can scale the figure", () => {
    expect(parseFlags(["--benchmark", "50000"]).benchmark).toBe(50_000)
  })

  test("a number with no `--benchmark` runs no benchmark, because it is a size for nothing", () => {
    expect(parseFlags(["50000"]).benchmark).toBeNull()
  })

  test("the flags compose, so a judge can get machine-readable output from either", () => {
    expect(parseFlags(["--expect-tamper", "--json"])).toEqual({ json: true, benchmark: null, expectTamper: true })
  })
})

describe("benchmarkChain", () => {
  test("the synthesised chain verifies, so the benchmark is measuring verification and not a decode failure", () => {
    // Without this a passing benchmark would be indistinguishable from a benchmark that spent its
    // whole budget failing to parse its own input.
    expect(verifyChain(sealedChain(50)).valid).toBe(true)
  })

  test("a small chain verifies inside the published budget", () => {
    const measured = benchmarkChain(200)
    expect(measured.entries).toBe(200)
    expect(measured.withinBudget).toBe(true)
  })
})

describe("tamperLastEntry", () => {
  test("an altered final entry is detected at exactly its index, not merely somewhere", () => {
    const chain = sealedChain(8)
    const { tampered, alteredIndex } = tamperLastEntry(chain)
    expect(alteredIndex).toBe(7)
    expect(tampered.valid).toBe(false)
    expect(tampered.tamperIndex).toBe(7)
  })

  test("the corruption is invisible in the reported message, so no entry content can leak", () => {
    const { tampered } = tamperLastEntry(sealedChain(4))
    expect(tampered.message).not.toContain("tampered")
    expect(tampered.message).toMatch(/entry 3/)
  })
})
