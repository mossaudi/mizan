import { describe, expect, test } from "bun:test"
import { GENESIS_PREV_HASH, TRACE_SCHEMA_VERSION, sealTrace, type RunTrace, type RunTraceDraft } from "@mizan/core"
import { TRANCHE_MIN_ENTRIES, auditTranche, auditTrancheFile } from "../src/index.ts"
import { serialiseEntry } from "../src/run-ledger.ts"

/**
 * The tranche audit (MIZ-110's machine-check half).
 *
 * The tranche command's only protection against "trust me, these are live" is this module, so
 * each test plants one *shape* of the ADR-11 bug — a placeholder timing, a constant
 * resultCount, a precomputed row masquerading in the tail — and requires the audit to name it.
 * A machine check that cannot name what it caught is a machine check nobody can fix.
 */

const draft = (overrides: Partial<RunTraceDraft> = {}): RunTraceDraft => ({
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId: "run-0001",
  questionHash: "9f".repeat(32),
  corpusSnapshotHash: "54a20e5d28532eae5a6851cc26a9486cc5806b32ab5fa20bf40219c7946d4599",
  transcript: "live",
  toolsCalled: [{ tool: "quranSearch", queryHash: "11".repeat(32), resultCount: 3, ranking: "fused", elapsedMs: 12 }],
  claims: [{ claimId: "claim-1", verdict: "verified", reason: "exact_containment", match: "exact" }],
  escalation: { action: "answer", reasons: [] },
  timings: { retrievalMs: 12, generationMs: 800, verificationMs: 4, totalMs: 816 },
  degraded: [],
  timestamp: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

const sealed = (count: number, at: (index: number) => Partial<RunTraceDraft> = () => ({})): readonly RunTrace[] => {
  const entries: RunTrace[] = []
  let prev = GENESIS_PREV_HASH
  for (let index = 0; index < count; index += 1) {
    const trace = sealTrace(draft({ runId: `run-${String(index).padStart(4, "0")}`, ...at(index) }), prev)
    entries.push(trace)
    prev = trace.entryHash
  }
  return entries
}

/** A complete, genuinely-varying draft: distinct resultCounts and real per-run timings. */
const varying = (index: number): RunTraceDraft => ({
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId: `run-${String(index).padStart(4, "0")}`,
  questionHash: "9f".repeat(32),
  corpusSnapshotHash: "54a20e5d28532eae5a6851cc26a9486cc5806b32ab5fa20bf40219c7946d4599",
  transcript: "live",
  toolsCalled: [{ tool: "quranSearch", queryHash: String(index).padStart(64, "0"), resultCount: 3 + (index % 7), ranking: "fused" as const, elapsedMs: 10 + index }],
  claims: [{ claimId: "claim-1", verdict: "verified", reason: "exact_containment", match: "exact" }],
  escalation: { action: "answer", reasons: [] },
  timings: { retrievalMs: 10 + index, generationMs: 500 + index * 13, verificationMs: 3 + index, totalMs: 600 + index * 17 },
  degraded: [],
  timestamp: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
})

describe("auditTranche — the pure tail check", () => {
  test("a clean, genuinely-varying live tail passes", () => {
    const traces = sealed(TRANCHE_MIN_ENTRIES + 2, varying)
    const audit = auditTranche(traces, 2)
    expect(audit.ok).toBe(true)
    expect(audit.count).toBe(TRANCHE_MIN_ENTRIES)
    expect(audit.violations).toEqual([])
  })

  test("entries before the declared start index are out of scope", () => {
    // The first entry is a precomputed placeholder, but the tranche starts AFTER it — the
    // disclosed past is not the tranche, and ADR-11's doctrine is disclosure, not rewriting.
    const traces = sealed(TRANCHE_MIN_ENTRIES + 1, (index) => (index === 0 ? { transcript: "precomputed" as const } : varying(index)))
    expect(auditTranche(traces, 1).ok).toBe(true)
  })

  test("a short tranche is reported as short, not padded", () => {
    const traces = sealed(TRANCHE_MIN_ENTRIES - 1, varying)
    const audit = auditTranche(traces, 0)
    expect(audit.ok).toBe(false)
    expect(audit.violations.some((v) => v.includes("short"))).toBe(true)
  })

  test("a precomputed row inside the tail is a tier violation", () => {
    const traces = sealed(TRANCHE_MIN_ENTRIES, (index) => (index === 10 ? { transcript: "precomputed" as const } : varying(index)))
    const audit = auditTranche(traces, 0)
    expect(audit.ok).toBe(false)
    expect(audit.violations.some((v) => v.includes("transcript is \"precomputed\""))).toBe(true)
  })

  test("an executed tool call with elapsedMs 0 is a placeholder, and is named by its index", () => {
    const traces = sealed(TRANCHE_MIN_ENTRIES, (index) =>
      index === 4
        ? { ...varying(index), toolsCalled: [{ tool: "quranSearch", queryHash: "55".repeat(32), resultCount: 8, ranking: "fused" as const, elapsedMs: 0 }], timings: { ...varying(index).timings, retrievalMs: 0 } }
        : varying(index),
    )
    const audit = auditTranche(traces, 0)
    expect(audit.ok).toBe(false)
    expect(audit.violations.some((v) => v.startsWith("entry 4:") && v.includes("elapsedMs is 0"))).toBe(true)
  })

  test("a live run whose generationMs is 0 never happened", () => {
    const traces = sealed(TRANCHE_MIN_ENTRIES, (index) =>
      index === 2 ? { ...varying(index), timings: { ...varying(index).timings, generationMs: 0 } } : varying(index),
    )
    const audit = auditTranche(traces, 0)
    expect(audit.ok).toBe(false)
    expect(audit.violations.some((v) => v.startsWith("entry 2:") && v.includes("generationMs is 0"))).toBe(true)
  })

  test("a constant resultCount across the tail is the ADR-11 signature", () => {
    // Every retrieval returns exactly 3 records: individually plausible, together the bug.
    const traces = sealed(TRANCHE_MIN_ENTRIES, (index) => ({
      toolsCalled: [{ tool: "quranSearch", queryHash: String(index).padStart(64, "0"), resultCount: 3, ranking: "fused" as const, elapsedMs: 20 + index }],
      timings: { retrievalMs: 20 + index, generationMs: 700 + index, verificationMs: 4, totalMs: 800 + index },
    }))
    const audit = auditTranche(traces, 0)
    expect(audit.ok).toBe(false)
    expect(audit.violations.some((v) => v.includes("constant count"))).toBe(true)
  })

  test("a key-shaped token hiding in the tail is reported, entry by entry", () => {
    const traces = sealed(TRANCHE_MIN_ENTRIES, (index) =>
      index === 7 ? { ...varying(index), runId: "sk-orchestration-prod-9a1b2c3d4e5f" } : varying(index),
    )
    const audit = auditTranche(traces, 0)
    expect(audit.ok).toBe(false)
    expect(audit.violations.some((v) => v.startsWith("entry 7:") && v.includes("key-shaped token"))).toBe(true)
  })

  test("a known question string in the tail is reported (rule 13)", () => {
    const question = "هل صلاة الوتر واجبة؟"
    const traces = sealed(TRANCHE_MIN_ENTRIES, (index) =>
      index === 1 ? { ...varying(index), questionHash: question } : varying(index),
    )
    const audit = auditTranche(traces, 0, { knownQuestions: [question] })
    expect(audit.ok).toBe(false)
    expect(audit.violations.some((v) => v.startsWith("entry 1:") && v.includes("question string"))).toBe(true)
  })
})

describe("auditTrancheFile — chain first, tail second", () => {
  test("a clean file with a clear tranche boundary passes", () => {
    const traces = sealed(TRANCHE_MIN_ENTRIES + 3, varying)
    const raw = traces.map(serialiseEntry).join("")
    const audited = auditTrancheFile(raw, 3)
    expect(audited.ok).toBe(true)
    if (!audited.ok) return
    expect(audited.audit.count).toBe(TRANCHE_MIN_ENTRIES)
    expect(audited.audit.violations).toEqual([])
  })

  test("a broken chain is reported as a chain problem BEFORE any tail check", () => {
    // The implanted entry edits its escalation but leaves entryHash alone; the audit must not
    // reach the tail logic and must name the exact broken index.
    const traces = sealed(TRANCHE_MIN_ENTRIES + 1, varying)
    const tampered = [...traces]
    tampered[5] = { ...traces[5]!, escalation: { action: "refer_to_scholar", reasons: ["planted"] } }
    const audited = auditTrancheFile(tampered.map(serialiseEntry).join(""), 1)
    expect(audited.ok).toBe(false)
    if (audited.ok) return
    expect(audited.problem).toContain("entry 5")
  })

  test("a torn tail is refused, because a half-written row is not an honest row", () => {
    const traces = sealed(2, varying)
    const raw = `${serialiseEntry(traces[0]!)}${serialiseEntry(traces[1]!).slice(0, 30)}`
    const audited = auditTrancheFile(raw, 0)
    expect(audited.ok).toBe(false)
    if (audited.ok) return
    expect(audited.problem).toContain("torn tail")
  })
})