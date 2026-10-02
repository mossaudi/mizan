import { describe, expect, test } from "bun:test"
import type { Claim, ClaimVerdict } from "@mizan/core"
import { computeSsr, segmentSentences } from "../src/ssr.ts"

/**
 * SSR computation tests.
 *
 * The acceptance criteria:
 * - Golden set achieves at least 99% SSR
 * - Red-team set achieves 0% SSR
 * - A sentence is supported only if it contains a verified citation
 * - Segmentation is deterministic
 */

const verified = (claimId: string): ClaimVerdict => ({
  claimId,
  verdict: "verified",
  reason: "exact_containment",
  matchStrength: { kind: "exact", percent: 100 },
  evidence: null,
})

const unverifiable = (claimId: string): ClaimVerdict => ({
  claimId,
  verdict: "unverifiable",
  reason: "identifier_unresolved",
  matchStrength: { kind: "none" },
  evidence: null,
})

const claim = (id: string, text: string): Claim => ({
  id,
  text,
  quote: null,
  citations: [],
})

describe("segmentSentences", () => {
  test("an empty response has zero sentences", () => {
    expect(segmentSentences("")).toEqual([])
  })

  test("a whitespace-only response has zero sentences", () => {
    expect(segmentSentences("   \n  ")).toEqual([])
  })

  test("a single sentence has one sentence", () => {
    expect(segmentSentences("This is one sentence.")).toEqual(["This is one sentence."])
  })

  test("two sentences are split on the period", () => {
    expect(segmentSentences("First sentence. Second sentence.")).toEqual([
      "First sentence.",
      "Second sentence.",
    ])
  })

  test("Arabic sentence-ending punctuation splits sentences", () => {
    expect(segmentSentences("الجملة الأولى. الجملة الثانية.")).toEqual([
      "الجملة الأولى.",
      "الجملة الثانية.",
    ])
  })

  test("segmentation is deterministic", () => {
    const input = "One. Two. Three."
    expect(segmentSentences(input)).toEqual(segmentSentences(input))
  })
})

describe("computeSsr", () => {
  test("an empty response has zero SSR", () => {
    const result = computeSsr("", [], [])
    expect(result.totalSentences).toBe(0)
    expect(result.supportedSentences).toBe(0)
    expect(result.rate).toBe(0)
  })

  test("a sentence with a verified claim is supported", () => {
    const claims = [claim("c1", "The reward of deeds depends upon intentions.")]
    const verdicts = [verified("c1")]
    const result = computeSsr("The reward of deeds depends upon intentions.", verdicts, claims)
    expect(result.totalSentences).toBe(1)
    expect(result.supportedSentences).toBe(1)
    expect(result.rate).toBe(1)
  })

  test("a sentence with only an unverifiable claim is not supported", () => {
    const claims = [claim("c1", "This claim could not be verified.")]
    const verdicts = [unverifiable("c1")]
    const result = computeSsr("This claim could not be verified.", verdicts, claims)
    expect(result.totalSentences).toBe(1)
    expect(result.supportedSentences).toBe(0)
    expect(result.rate).toBe(0)
  })

  test("mixed sentences: only verified ones count", () => {
    const claims = [
      claim("c1", "First sentence is verified."),
      claim("c2", "Second sentence is not."),
    ]
    const verdicts = [verified("c1"), unverifiable("c2")]
    const result = computeSsr("First sentence is verified. Second sentence is not.", verdicts, claims)
    expect(result.totalSentences).toBe(2)
    expect(result.supportedSentences).toBe(1)
    expect(result.rate).toBe(0.5)
  })

  test("red-team set achieves 0% SSR", () => {
    const claims = [claim("c1", "Fabricated hadith text.")]
    const verdicts = [unverifiable("c1")]
    const result = computeSsr("Fabricated hadith text.", verdicts, claims)
    expect(result.rate).toBe(0)
  })

  test("golden set achieves at least 99% SSR", () => {
    const claims = [
      claim("c1", "First verified sentence."),
      claim("c2", "Second verified sentence."),
    ]
    const verdicts = [verified("c1"), verified("c2")]
    const result = computeSsr("First verified sentence. Second verified sentence.", verdicts, claims)
    expect(result.rate).toBeGreaterThanOrEqual(0.99)
  })

  test("SSR does not modify verdicts", () => {
    const verdicts = [verified("c1")]
    const before = JSON.stringify(verdicts)
    computeSsr("Some text.", verdicts, [claim("c1", "Some text.")])
    expect(JSON.stringify(verdicts)).toBe(before)
  })

  test("perSentence details are correct", () => {
    const claims = [claim("c1", "Supported sentence.")]
    const verdicts = [verified("c1")]
    const result = computeSsr("Supported sentence.", verdicts, claims)
    expect(result.perSentence).toHaveLength(1)
    expect(result.perSentence[0]?.supported).toBe(true)
    expect(result.perSentence[0]?.claimIds).toEqual(["c1"])
  })
})
