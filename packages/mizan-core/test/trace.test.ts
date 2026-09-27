import { describe, expect, test } from "bun:test"
import { GENESIS_PREV_HASH, chainHash, isSha256Hex, sha256Hex } from "../src/hash.ts"
import { isOk } from "../src/result.ts"
import { decodeOrFail, decodeSync } from "../src/schema/decode.ts"
import {
  RunTrace,
  RunTraceDraft,
  sealTrace,
  summariseClaim,
  traceChainHead,
  traceDigest,
  TRACE_SCHEMA_VERSION,
  type RunTrace as RunTraceType,
} from "../src/schema/trace.ts"
import type { ClaimVerdict } from "../src/schema/verdict.ts"

const draft = (overrides: Partial<RunTraceDraft> = {}): RunTraceDraft => ({
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId: "run-1",
  questionHash: sha256Hex("ما حكم الصلاة"),
  corpusSnapshotHash: sha256Hex("corpus"),
  transcript: "precomputed",
  toolsCalled: [{ tool: "hadith_search", queryHash: sha256Hex("q"), resultCount: 2, ranking: "fused", elapsedMs: 12 }],
  claims: [{ claimId: "c1", verdict: "verified", reason: "exact_containment", match: "exact" }],
  escalation: { action: "answer", reasons: [] },
  timings: { retrievalMs: 12, generationMs: 30, verificationMs: 1, totalMs: 43 },
  degraded: [],
  timestamp: "2026-09-27T00:00:00.000Z",
  ...overrides,
})

describe("chainHash", () => {
  test("matches the documented rule exactly, so both chains build links the same way", () => {
    expect(chainHash("prev", { a: 1 })).toBe(sha256Hex('prev|{"a":1}'))
  })

  test("separates prevHash from the payload, so a shifted boundary cannot collide", () => {
    // "ab" + "|" + "{}" and "a" + "|" + "b{}" must not be the same material.
    expect(chainHash("ab", {})).not.toBe(chainHash("a", { x: "b" } as unknown))
  })

  test("is insensitive to property order, because canonicalJson sorts keys", () => {
    expect(chainHash("p", { a: 1, b: 2 })).toBe(chainHash("p", { b: 2, a: 1 }))
  })

  test("a changed payload changes the digest", () => {
    expect(chainHash("p", { a: 1 })).not.toBe(chainHash("p", { a: 2 }))
  })
})

describe("sealTrace", () => {
  test("a sealed trace carries the chain position and a real digest", () => {
    const sealed = sealTrace(draft(), GENESIS_PREV_HASH)
    expect(sealed.prevHash).toBe(GENESIS_PREV_HASH)
    expect(isSha256Hex(sealed.entryHash)).toBe(true)
    expect(sealed.entryHash).toBe(traceDigest(GENESIS_PREV_HASH, draft()))
  })

  test("is total and pure: the same draft and the same prevHash give the same entry", () => {
    expect(sealTrace(draft(), GENESIS_PREV_HASH)).toEqual(sealTrace(draft(), GENESIS_PREV_HASH))
  })

  test("prevHash is INSIDE the digest, which is what makes it a chain", () => {
    expect(sealTrace(draft(), "a".repeat(64)).entryHash).not.toBe(sealTrace(draft(), "b".repeat(64)).entryHash)
  })

  test("the timestamp is NOT hashed, so a backwards clock cannot break the chain", () => {
    const later = sealTrace(draft({ timestamp: "2026-09-27T00:00:01.000Z" }), GENESIS_PREV_HASH)
    const earlier = sealTrace(draft({ timestamp: "2020-01-01T00:00:00.000Z" }), GENESIS_PREV_HASH)
    expect(later.entryHash).toBe(earlier.entryHash)
    expect(later.timestamp).not.toBe(earlier.timestamp)
  })

  test("every other field IS hashed, so tampering with a verdict is detectable", () => {
    const honest = sealTrace(draft(), GENESIS_PREV_HASH).entryHash
    const forged = sealTrace(
      draft({ claims: [{ claimId: "c1", verdict: "rejected", reason: "quote_absent_at_cited_id", match: "none" }] }),
      GENESIS_PREV_HASH,
    ).entryHash
    expect(forged).not.toBe(honest)
  })

  test("a tool call's query hash is hashed, but the trace holds no query text", () => {
    const sealed = sealTrace(draft(), GENESIS_PREV_HASH)
    expect(sealed.toolsCalled[0]?.queryHash).toHaveLength(64)
    expect(JSON.stringify(sealed)).not.toContain("ما حكم")
  })
})

describe("traceChainHead", () => {
  test("an empty chain is at genesis", () => {
    expect(traceChainHead([])).toBe(GENESIS_PREV_HASH)
  })

  test("the head is the last entry's digest", () => {
    const first = sealTrace(draft(), GENESIS_PREV_HASH)
    const second = sealTrace(draft({ runId: "run-2" }), first.entryHash)
    expect(traceChainHead([first, second])).toBe(second.entryHash)
  })
})

describe("summariseClaim", () => {
  const evidence = {
    recordId: "bukhari:1",
    collection: "bukhari",
    number: "1",
    sourceUrl: "https://example.invalid/1",
    license: "CC BY-SA 4.0",
    attribution: "Sunnah.com",
    grade: null,
    gradeSource: "quranlab/hadith",
    gradeBasis: "collection",
    matchedChars: 20,
    quoteChars: 20,
  } as const

  const verdict = (overrides: Partial<ClaimVerdict>): ClaimVerdict => ({
    claimId: "c1",
    verdict: "unverifiable",
    reason: "identifier_unresolved",
    matchStrength: { kind: "none" },
    evidence: null,
    ...overrides,
  })

  test("a verified verdict summarises to the exact badge label", () => {
    const summary = summariseClaim(
      verdict({ verdict: "verified", reason: "exact_containment", matchStrength: { kind: "exact", percent: 100 }, evidence }),
    )
    expect(summary).toEqual({ claimId: "c1", verdict: "verified", reason: "exact_containment", match: "exact" })
  })

  test("a rejected verdict summarises to none", () => {
    const summary = summariseClaim(verdict({ verdict: "rejected", reason: "quote_absent_at_cited_id" }))
    expect(summary.match).toBe("none")
    expect(summary.verdict).toBe("rejected")
  })

  test("the summary carries no evidence and no quoted span, so no corpus text reaches the ledger", () => {
    expect(Object.keys(summariseClaim(verdict({}))).sort()).toEqual(["claimId", "match", "reason", "verdict"])
  })
})

describe("the trace contract is a real boundary", () => {
  const good = sealTrace(draft(), GENESIS_PREV_HASH)

  test("a well-formed trace decodes", () => {
    expect(isOk(decodeOrFail(decodeSync(RunTrace), good, "RunTrace"))).toBe(true)
  })

  test("excess chain fields are DISCARDED, so sealTrace is the only thing that can set them", () => {
    const decoded = decodeOrFail(
      decodeSync(RunTraceDraft),
      { ...draft(), prevHash: "a".repeat(64), entryHash: "b".repeat(64) },
      "RunTraceDraft",
    )
    if (!isOk(decoded)) throw new Error("expected a decode")
    expect("prevHash" in decoded.value).toBe(false)
    expect("entryHash" in decoded.value).toBe(false)
  })

  test("a transcript must be labelled live or precomputed, so it is never ambiguous", () => {
    const decoded = decodeOrFail(decodeSync(RunTrace), { ...good, transcript: "cached" }, "RunTrace")
    expect(isOk(decoded)).toBe(false)
  })

  test("a degraded trace keeps its honesty markers", () => {
    const degraded: RunTraceType = sealTrace(draft({ degraded: ["provider_unavailable"] }), GENESIS_PREV_HASH)
    const decoded = decodeOrFail(decodeSync(RunTrace), degraded, "RunTrace")
    if (!isOk(decoded)) throw new Error("expected a decode")
    expect(decoded.value.degraded).toEqual(["provider_unavailable"])
  })
})
