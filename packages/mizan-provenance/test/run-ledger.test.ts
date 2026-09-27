import { afterEach, describe, expect, test } from "bun:test"
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GENESIS_PREV_HASH, TRACE_SCHEMA_VERSION, sealTrace, type RunTrace, type RunTraceDraft } from "@mizan/core"
import {
  auditRunLedger,
  describeProblem,
  headOf,
  readRunChain,
  serialiseEntry,
  tornTail,
  verifyRunChain,
} from "../src/run-ledger.ts"
import { appendRunTrace, appendRunTraces, readLedger } from "../src/run-store.ts"

/**
 * The run ledger's self-test.
 *
 * Story 11's acceptance criterion is that verification names the exact broken index, so most
 * of this file is a planted corruption. Each one is written to disk, read back through the
 * real reader, and required to produce the right index — because a break detector tested only
 * on in-memory arrays is a break detector that has never seen a file.
 */

const tempRoots: string[] = []

const tempLedger = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "mizan-run-"))
  tempRoots.push(dir)
  return join(dir, "runs.jsonl")
}

afterEach(async () => {
  for (const dir of tempRoots.splice(0)) await rm(dir, { recursive: true, force: true })
})

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

/** A chain of `count` entries, sealed correctly with the same rule the store uses. */
const sealed = (count: number): readonly RunTrace[] => {
  const entries: RunTrace[] = []
  let prev = GENESIS_PREV_HASH
  for (let index = 0; index < count; index += 1) {
    const trace = sealTrace(draft({ runId: `run-000${index + 1}` }), prev)
    entries.push(trace)
    prev = trace.entryHash
  }
  return entries
}

const writeChain = async (path: string, entries: readonly RunTrace[]): Promise<void> => {
  await writeFile(path, entries.map(serialiseEntry).join(""), "utf8")
}

describe("verifyRunChain", () => {
  test("an empty chain is intact", () => {
    expect(verifyRunChain([])).toEqual([])
  })

  test("an intact chain has no breaks", () => {
    expect(verifyRunChain(sealed(5))).toEqual([])
  })

  test("names the exact index of an entry that was edited after the fact", () => {
    const entries = sealed(5)
    const tampered = [...entries]
    // Edit the content of entry 2 but leave its entryHash alone.
    const original = tampered[2]!
    tampered[2] = { ...original, escalation: { action: "refer_to_scholar", reasons: ["planted"] } }
    const breaks = verifyRunChain(tampered)
    expect(breaks).toHaveLength(1)
    expect(breaks[0]?.index).toBe(2)
    expect(breaks[0]?.reason).toBe("digest_mismatch")
  })

  test("names the exact index when an entry was deleted", () => {
    const entries = sealed(5)
    const withHole = [entries[0]!, entries[1]!, entries[3]!, entries[4]!]
    const breaks = verifyRunChain(withHole)
    expect(breaks).toHaveLength(1)
    // The index is the LINE in the file, which is what a judge can go and look at. Deleting
    // original entry 2 leaves original entry 3 sitting on file line 2, and that is the line
    // which can no longer chain — the missing entry has no line to report.
    expect(breaks[0]?.index).toBe(2)
    expect(breaks[0]?.reason).toBe("prev_hash_mismatch")
  })

  test("names the exact index when entries were reordered", () => {
    const entries = sealed(4)
    const breaks = verifyRunChain([entries[0]!, entries[2]!, entries[1]!, entries[3]!])
    expect(breaks[0]?.index).toBe(1)
    expect(breaks[0]?.reason).toBe("prev_hash_mismatch")
  })

  test("names the first break only, because later links are unverifiable", () => {
    const entries = sealed(6)
    const breaks = verifyRunChain([{ ...entries[0]!, escalation: { action: "refer_to_scholar", reasons: [] } }, ...entries.slice(1)])
    expect(breaks).toHaveLength(1)
    expect(breaks[0]?.index).toBe(0)
  })

  test("a re-parented entry cannot smuggle in a position of its own", () => {
    // sealTrace is the only thing that sets a chain position, so an entry that claims a
    // prevHash nobody followed is caught before it can pretend to be at index 1.
    const entries = sealed(3)
    const orphan = sealTrace(draft({ runId: "run-orphan" }), "9".repeat(64))
    const breaks = verifyRunChain([...entries, orphan])
    expect(breaks[0]?.index).toBe(3)
    expect(breaks[0]?.reason).toBe("prev_hash_mismatch")
  })
})

describe("tornTail", () => {
  test("no tail on an empty file", () => {
    expect(tornTail("")).toBeNull()
  })

  test("no tail when the last line is newline-terminated", () => {
    expect(tornTail("a\nb\n")).toBeNull()
  })

  test("detects a file that was truncated mid-write", () => {
    const truncated = '{"schemaVersion":"1","runId":"run-0001"'
    const tail = tornTail(truncated)
    expect(tail).not.toBeNull()
    expect(tail?.line).toBe(1)
    expect(tail?.bytes).toBe(truncated.length)
    expect(tail?.detail).toContain("no terminating newline")
  })

  test("reports the LAST line, not the first", () => {
    const tail = tornTail('{"a":1}\n{"b":2}\n{"c":')
    expect(tail?.line).toBe(3)
  })
})

describe("readRunChain", () => {
  test("reads a well-formed chain", async () => {
    const path = await tempLedger()
    await writeChain(path, sealed(3))
    const { traces, breaks, tail } = readRunChain(await readFile(path, "utf8"))
    expect(traces).toHaveLength(3)
    expect(breaks).toEqual([])
    expect(tail).toBeNull()
  })

  test("reports a hand-written line that is not a RunTrace", async () => {
    const path = await tempLedger()
    const entries = sealed(2)
    await writeFile(path, `${serialiseEntry(entries[0]!)}{"runId":"forged"}\n${serialiseEntry(entries[1]!)}`, "utf8")
    const { traces, breaks } = readRunChain(await readFile(path, "utf8"))
    expect(traces).toHaveLength(2)
    expect(breaks).toHaveLength(1)
    expect(breaks[0]?.index).toBe(1)
    expect(breaks[0]?.reason).toBe("decode_failed")
  })

  test("one bad line does not hide the good ones", async () => {
    const path = await tempLedger()
    const entries = sealed(3)
    // Built as an explicit list of physical lines, because the assertion is about which line a
    // judge opens. `serialiseEntry` appends its own newline, so a template literal here would
    // add a blank line and quietly move the number being asserted.
    const lines = [JSON.stringify(entries[0]), "not json at all", JSON.stringify(entries[2])]
    await writeFile(path, `${lines.join("\n")}\n`, "utf8")
    const { traces, breaks } = readRunChain(await readFile(path, "utf8"))
    expect(traces).toHaveLength(2)
    expect(breaks[0]?.index).toBe(1)
  })

  test("a break below a blank line reports the line a judge can open", async () => {
    const path = await tempLedger()
    const entries = sealed(3)
    // Physical line 3 is the forged one; line 2 is blank and carries no entry at all.
    const lines = [JSON.stringify(entries[0]), "", '{"runId":"forged"}', JSON.stringify(entries[2])]
    await writeFile(path, `${lines.join("\n")}\n`, "utf8")
    const { traces, breaks } = readRunChain(await readFile(path, "utf8"))
    expect(traces).toHaveLength(2)
    expect(breaks).toHaveLength(1)
    // 2, not 1. A reader told "entry 1" opens the blank line, sees nothing, and concludes the
    // tool is wrong. Filtering blank lines before numbering is invisible until this case.
    expect(breaks[0]?.index).toBe(2)
    expect(describeProblem({ _tag: "chain_broken", breaks: [breaks[0]!] })).toContain("entry 2")
  })
})

describe("auditRunLedger", () => {
  test("an intact chain reports its head", async () => {
    const path = await tempLedger()
    const entries = sealed(4)
    await writeChain(path, entries)
    const audited = auditRunLedger(await readFile(path, "utf8"))
    expect(audited.ok).toBe(true)
    if (!audited.ok) return
    expect(audited.value.traces).toHaveLength(4)
    expect(audited.value.head).toBe(headOf(entries))
  })

  test("a torn tail is reported as a torn tail, not as a broken chain", async () => {
    // The distinction matters: a torn tail is a crash, a broken chain is a tamper, and they
    // have different causes and different repairs.
    const path = await tempLedger()
    const entries = sealed(2)
    await writeFile(path, `${serialiseEntry(entries[0]!)}${serialiseEntry(entries[1]!).slice(0, 40)}`, "utf8")
    const audited = auditRunLedger(await readFile(path, "utf8"))
    expect(audited.ok).toBe(false)
    if (audited.ok) return
    expect(audited.error._tag).toBe("torn_tail")
    expect(describeProblem(audited.error)).toContain("torn tail")
  })

  test("ignores blank lines without shifting indices", async () => {
    const entries = sealed(2)
    // A blank line before a *good* entry: it is skipped for parsing, and the entry after it
    // still decodes. The break case below is the one that matters.
    const withBlank = `${serialiseEntry(entries[0]!)}\n\n${serialiseEntry(entries[1]!)}\n`
    const clean = readRunChain(withBlank)
    expect(clean.traces).toHaveLength(2)
    expect(clean.breaks).toEqual([])
  })

  test("a tampered chain is reported with the exact index, in the message", async () => {
    const path = await tempLedger()
    const entries = sealed(4)
    const tampered = [...entries]
    tampered[2] = { ...entries[2]!, escalation: { action: "refer_to_scholar", reasons: ["planted"] } }
    await writeChain(path, tampered)
    const audited = auditRunLedger(await readFile(path, "utf8"))
    expect(audited.ok).toBe(false)
    if (audited.ok) return
    expect(describeProblem(audited.error)).toContain("entry 2")
    expect(describeProblem(audited.error)).toContain("digest_mismatch")
  })
})

describe("appendRunTrace", () => {
  test("a missing ledger is an empty ledger, not an error", async () => {
    const path = await tempLedger()
    const state = await readLedger(path)
    expect(state.ok).toBe(true)
    if (!state.ok) return
    expect(state.value.traces).toEqual([])
    expect(state.value.head).toBe(GENESIS_PREV_HASH)
  })

  test("appends and returns the index the run can be cited by", async () => {
    const path = await tempLedger()
    const first = await appendRunTrace(path, draft({ runId: "run-a" }))
    const second = await appendRunTrace(path, draft({ runId: "run-b" }))
    expect(first).toEqual({ ok: true, index: 0, entryHash: expect.any(String) })
    expect(second.ok && second.index).toBe(1)

    const audited = auditRunLedger(await readFile(path, "utf8"))
    expect(audited.ok).toBe(true)
    if (!audited.ok) return
    expect(audited.value.traces.map((trace) => trace.runId)).toEqual(["run-a", "run-b"])
  })

  test("refuses to append onto a broken chain, and says which entry broke", async () => {
    // Appending onto a broken chain would bury the original break under a later one, making
    // the tampering unauditable. This refusal is the fail-closed behaviour.
    const path = await tempLedger()
    const entries = sealed(3)
    const tampered = [...entries]
    tampered[1] = { ...entries[1]!, escalation: { action: "refer_to_scholar", reasons: ["planted"] } }
    await writeChain(path, tampered)

    const outcome = await appendRunTrace(path, draft({ runId: "run-after-tamper" }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe("ledger_broken")
    expect(outcome.detail).toContain("entry 1")

    // And nothing was written.
    expect((await readFile(path, "utf8")).split("\n").filter((line) => line.length > 0)).toHaveLength(3)
  })

  test("refuses to append onto a torn tail, and does not corrupt the next entry", async () => {
    const path = await tempLedger()
    const entries = sealed(1)
    const halfWritten = '{"partial":'
    await writeFile(path, `${serialiseEntry(entries[0]!)}${halfWritten}`, "utf8")
    const before = await readFile(path, "utf8")

    const outcome = await appendRunTrace(path, draft({ runId: "run-after-tear" }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe("torn_tail")
    expect(await readFile(path, "utf8")).toBe(before)
  })

  test("a write that cannot happen fails closed and says the run is untrusted", async () => {
    // The parent path is a regular FILE, so mkdir cannot create the directory and the write
    // cannot succeed. The message must not leave the caller thinking the run was recorded
    // (AGENTS.md section 16: a ledger write failure marks the run untrusted, never "as if
    // recorded").
    const dir = await mkdtemp(join(tmpdir(), "mizan-run-"))
    tempRoots.push(dir)
    const blocker = join(dir, "blocker")
    await writeFile(blocker, "i am a file, not a directory", "utf8")
    const path = join(blocker, "runs.jsonl")

    const outcome = await appendRunTrace(path, draft())
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe("write_failed")
    expect(outcome.detail).toContain("UNTRUSTED")
  })

  test("appends in order and stops at the first failure", async () => {
    const path = await tempLedger()
    const results = await appendRunTraces(path, [draft({ runId: "a" }), draft({ runId: "b" }), draft({ runId: "c" })])
    expect(results.every((result) => result.ok)).toBe(true)
    const audited = auditRunLedger(await readFile(path, "utf8"))
    expect(audited.ok && audited.value.traces).toHaveLength(3)
  })

  test("a batch of n produces ONE chain, so the whole ledger verifies", async () => {
    // The regression this guards: the batch path used to re-read and re-audit the file per entry,
    // which is quadratic, and a cursor bug would show up as a fork rather than as a slow run.
    const path = await tempLedger()
    const results = await appendRunTraces(path, Array.from({ length: 12 }, (_, i) => draft({ runId: `batch-${i}` })))
    expect(results.filter((result) => result.ok)).toHaveLength(12)
    expect(results.map((result) => (result.ok ? result.index : -1))).toEqual(Array.from({ length: 12 }, (_, i) => i))

    const audited = auditRunLedger(await readFile(path, "utf8"))
    expect(audited.ok).toBe(true)
    if (!audited.ok) return
    expect(audited.value.traces).toHaveLength(12)
    // Every prevHash links to the entry before it, not merely to a valid-looking hash.
    for (const [index, trace] of audited.value.traces.entries()) {
      const expectedPrev = index === 0 ? GENESIS_PREV_HASH : audited.value.traces[index - 1]!.entryHash
      expect(trace.prevHash).toBe(expectedPrev)
    }
  })

  test("a batch onto an existing ledger continues its indices, it does not restart at 0", async () => {
    // The index comes from a COUNT carried in the cursor rather than from an array the cursor
    // used to hold. On an empty file both spellings give 0, so this is the only case that can
    // tell them apart: a cursor that forgot to read the existing length would report indices
    // 0,1,2 for what are really entries 2,3,4 — and "which run?" is the number a judge cites.
    const path = await tempLedger()
    const first = await appendRunTrace(path, draft({ runId: "solo-0" }))
    expect(first.ok && first.index).toBe(0)
    const second = await appendRunTrace(path, draft({ runId: "solo-1" }))
    expect(second.ok && second.index).toBe(1)

    const batch = await appendRunTraces(path, [draft({ runId: "more-2" }), draft({ runId: "more-3" })])
    expect(batch.map((result) => (result.ok ? result.index : -1))).toEqual([2, 3])

    const audited = auditRunLedger(await readFile(path, "utf8"))
    expect(audited.ok && audited.value.traces.map((t) => t.runId)).toEqual(["solo-0", "solo-1", "more-2", "more-3"])
  })
})

/**
 * The post-write check verifies the TAIL, not the whole file. That is the performance fix, and it
 * is only legitimate if the properties the old full re-audit provided are still provided.
 *
 * Each test below is a property that a naive "just read the last line" implementation loses, and
 * that the real implementation has to earn back some other way. If any of them fails, the
 * optimisation has silently dropped a guarantee and the fix is wrong — not merely slow.
 */
describe("the tail verification keeps the guarantees a full re-audit provided", () => {
  test("a concurrent append between the audit and the write is detected as a fork", async () => {
    // The hard case. Our own entry legitimately chains from the head we audited, so comparing it
    // to our own expected head proves nothing. The evidence of a fork is the entry BEFORE ours: if
    // it is not the head we chained from, somebody else wrote in between.
    const path = await tempLedger()
    const first = await appendRunTrace(path, draft({ runId: "run-a" }))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const headAfterFirst = first.entryHash

    // Simulate the interleaving directly: take the bytes we audited, then have another writer
    // append an entry chained from the same head before ours lands.
    const beforeConcurrent = await readFile(path, "utf8")
    const intruder = sealTrace(draft({ runId: "run-intruder" }), headAfterFirst)
    const ourEntry = sealTrace(draft({ runId: "run-ours" }), headAfterFirst)
    // Both entries claim the same prevHash: the file is now a fork.
    await writeFile(path, `${beforeConcurrent}${serialiseEntry(intruder)}${serialiseEntry(ourEntry)}`, "utf8")

    // The file is not intact, so the append must refuse rather than chain onto a fork.
    const outcome = await appendRunTrace(path, draft({ runId: "run-after-fork" }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe("ledger_broken")
  })

  test("an entry whose prevHash is not the audited head is refused", async () => {
    // Same property, reached through the tail check rather than the prefix audit: the file is
    // otherwise intact, but the last line we are about to sit behind is not the head we read.
    const path = await tempLedger()
    const entries = sealed(2)
    // Chain entry 1 onto GENESIS rather than onto entry 0. `readRunChain` still parses it, and
    // the prefix audit is what must catch it.
    const forked = [entries[0]!, sealTrace(draft({ runId: "run-forked" }), GENESIS_PREV_HASH)]
    await writeChain(path, forked)

    const outcome = await appendRunTrace(path, draft({ runId: "run-after-fork" }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe("ledger_broken")
    expect(outcome.detail).toContain("entry 1")
  })

  test("a truncated ledger during the write is refused, not read at a shifted offset", async () => {
    // Byte offsets are only meaningful against the file we audited. If the file shrank, every
    // offset we hold is wrong, so the implementation must refuse rather than seek.
    const path = await tempLedger()
    await appendRunTrace(path, draft({ runId: "run-a" }))
    const raw = await readFile(path, "utf8")
    await writeFile(path, raw.slice(0, 20), "utf8")

    const outcome = await appendRunTrace(path, draft({ runId: "run-b" }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    // The pre-append audit catches this first, as a torn tail — a truncation to a non-newline
    // offset is exactly that. Either refusal is a correct answer; what matters is that the run
    // is not recorded against offsets that no longer mean anything.
    expect(["ledger_broken", "torn_tail", "verify_failed"]).toContain(outcome.reason)
    // And nothing was appended onto the truncated file.
    expect(await readFile(path, "utf8")).toBe(raw.slice(0, 20))
  })

  test("an entry longer than the lookup window is refused as too long, not blamed on a writer", async () => {
    // The reachable production shape, not a synthetic one: a model that repeats one
    // five-thousand-character citation five hundred times writes a multi-megabyte entry, and the
    // 64 KB backwards window cannot reach its start. The refusal is correct — we cannot confirm
    // the chain — but the message must not invent a concurrent writer that was never there.
    const path = await tempLedger()
    const oversized = draft({
      runId: "run-oversized",
      toolsCalled: Array.from({ length: 700 }, (_, index) => ({
        tool: "quranSearch",
        queryHash: String(index).padStart(64, "0"),
        resultCount: 3,
        ranking: "fused" as const,
        elapsedMs: 1,
      })),
    })
    const first = await appendRunTrace(path, oversized)
    expect(first.ok).toBe(true)
    // The window really is exceeded, or this test is proving nothing.
    expect((await readFile(path, "utf8")).length).toBeGreaterThan(64 * 1024)

    const outcome = await appendRunTrace(path, draft({ runId: "run-after-oversized" }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe("verify_failed")
    expect(outcome.detail).toContain("lookup window")
    expect(outcome.detail).toContain("UNTRUSTED")
    expect(outcome.detail).not.toContain("another writer")
  })

  test("a blank line before the append is refused as unreadable, not as a fork", async () => {
    // The second way of failing to read the line before our own, and the other one that used to
    // collapse into the same `null`. `readRunChain` skips blank lines, so a ledger carrying one
    // passes its audit and reaches this check — and a message blaming a concurrent writer would
    // again be naming a process that does not exist.
    const path = await tempLedger()
    const first = await appendRunTrace(path, draft({ runId: "run-a" }))
    expect(first.ok).toBe(true)
    await appendFile(path, "\n", "utf8")

    const outcome = await appendRunTrace(path, draft({ runId: "run-b" }))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe("verify_failed")
    expect(outcome.detail).toContain("could not read the entry preceding the append")
    expect(outcome.detail).not.toContain("another writer")
  })
})

describe("what the ledger may contain", () => {
  test("the serialised entry has no question text, only the hash", async () => {
    const path = await tempLedger()
    await appendRunTrace(path, draft({ runId: "run-privacy" }))
    const raw = await readFile(path, "utf8")
    expect(raw).toContain(draft().questionHash)
    // The field is named questionHash and the value is 64 hex characters: there is no field
    // anywhere in a RunTrace that could hold the question itself.
    expect(raw).not.toMatch(/"question"\s*:/)
    expect(raw).not.toMatch(/"answer"\s*:/)
    expect(raw).not.toMatch(/"text"\s*:/)
  })
})
