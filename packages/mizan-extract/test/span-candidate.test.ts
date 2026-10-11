import { describe, it, expect } from "bun:test"
import { SpanCandidate, SpanCandidates, ModelSpanSelectorInput, ModelSpanSelectorOutput } from "../src/schema/span-candidate.ts"
import { SpanSourceHint } from "../src/schema/span-source-hint.ts"
import { decodeOrFail, decodeSync } from "@mizan/core"

describe("SpanCandidate schema", () => {
  it("decodes valid span candidate", () => {
    const input = {
      quote: "إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ",
      startOffset: 10,
      endOffset: 50,
      sourceHint: "hadith",
      confidence: 0.95,
      candidateId: "cand-1",
    }
    const result = decodeOrFail(decodeSync(SpanCandidate), input, "SpanCandidate")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.quote).toBe("إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ")
      expect(result.value.sourceHint).toBe("hadith")
      expect(result.value.confidence).toBe(0.95)
    }
  })

  it("rejects invalid source hint", () => {
    const input = {
      quote: "test",
      startOffset: 0,
      endOffset: 4,
      sourceHint: "invalid",
      confidence: 0.5,
      candidateId: "cand-1",
    }
    const result = decodeOrFail(decodeSync(SpanCandidate), input, "SpanCandidate")
    expect(result.ok).toBe(false)
  })

  it("rejects confidence out of range", () => {
    const input = {
      quote: "test",
      startOffset: 0,
      endOffset: 4,
      sourceHint: "hadith",
      confidence: 1.5,
      candidateId: "cand-1",
    }
    const result = decodeOrFail(decodeSync(SpanCandidate), input, "SpanCandidate")
    // Schema now validates confidence range 0-1
    expect(result.ok).toBe(false)
  })
})

describe("ModelSpanSelectorOutput schema", () => {
  it("decodes valid output with candidates", () => {
    const input = {
      chunkIndex: 0,
      candidates: [
        {
          quote: "إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ",
          startOffset: 10,
          endOffset: 50,
          sourceHint: "hadith",
          confidence: 0.95,
          candidateId: "cand-1",
        },
      ],
      degraded: false,
    }
    const result = decodeOrFail(decodeSync(ModelSpanSelectorOutput), input, "ModelSpanSelectorOutput")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.chunkIndex).toBe(0)
      expect(result.value.candidates.length).toBe(1)
      expect(result.value.degraded).toBe(false)
    }
  })

  it("decodes degraded output", () => {
    const input = {
      chunkIndex: 1,
      candidates: [],
      degraded: true,
      degradationReason: "model_timeout",
    }
    const result = decodeOrFail(decodeSync(ModelSpanSelectorOutput), input, "ModelSpanSelectorOutput")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.degraded).toBe(true)
      expect(result.value.degradationReason).toBe("model_timeout")
    }
  })
})

describe("SpanSourceHint schema", () => {
  it("accepts valid hints", () => {
    const validHints = ["quran", "hadith", "collection", "unknown"]
    for (const hint of validHints) {
      const result = decodeOrFail(decodeSync(SpanSourceHint), hint, "SpanSourceHint")
      expect(result.ok).toBe(true)
    }
  })

  it("rejects invalid hint", () => {
    const result = decodeOrFail(decodeSync(SpanSourceHint), "invalid", "SpanSourceHint")
    expect(result.ok).toBe(false)
  })
})

describe("ModelSpanSelectorInput schema", () => {
  it("decodes valid input", () => {
    const input = {
      chunkText: "Some article text with a quote إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ in it.",
      chunkIndex: 0,
      maxCandidates: 5,
    }
    const result = decodeOrFail(decodeSync(ModelSpanSelectorInput), input, "ModelSpanSelectorInput")
    expect(result.ok).toBe(true)
  })

  it("decodes input without maxCandidates", () => {
    const input = {
      chunkText: "Some text",
      chunkIndex: 0,
    }
    const result = decodeOrFail(decodeSync(ModelSpanSelectorInput), input, "ModelSpanSelectorInput")
    expect(result.ok).toBe(true)
  })
})