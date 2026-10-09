import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ARTICLE_COVERAGE_SCHEMA_VERSION,
  articleCountsOf,
  type ArticleCoverageReport,
  type SpanOutcome,
} from "@mizan/core"
import { coverageGaps, coverageLines, coverageSentenceOf, renderCoverage } from "../src/coverage-render.ts"

/**
 * The coverage renderer, and the completeness sentence gate G-7.13 exists to police.
 *
 * The planted case here is a report whose `extracted` is BELOW `segments` — a document whose selector
 * skipped a fabrication — and the assertion is that the renderer says so rather than summarising the
 * document as clean. That is the R-1 mitigation in its most legible form, and it is a test rather than
 * a convention because a convention is a thing somebody stops following.
 */

const DIGEST = "d".repeat(64)

const outcome = (segmentIndex: number, verdict: "verified" | "unverifiable" | "rejected"): SpanOutcome => ({
  segmentIndex,
  state: "checked",
  summary: {
    claimId: `seg-${segmentIndex}`,
    verdict,
    reason: verdict === "verified" ? "exact_containment" : "no_citation",
    matchStrength: verdict === "verified" ? { kind: "exact", percent: 100 } : { kind: "none" },
  },
  suggestion: null,
})

const reportOf = (
  segments: number,
  outcomes: readonly SpanOutcome[],
  gaps: readonly { segmentIndex: number; stage: "not_extracted" | "not_checked"; reason: "no_quotation_like_span" | "verification_timeout" }[],
): ArticleCoverageReport => ({
  schemaVersion: ARTICLE_COVERAGE_SCHEMA_VERSION,
  documentDigest: DIGEST,
  segmentCount: segments,
  counts: articleCountsOf(segments, outcomes),
  outcomes,
  gaps,
  degradation: null,
})

describe("the seven figures", () => {
  test("they are published in reading order, and every one is an integer", () => {
    const report = reportOf(5, [outcome(0, "verified"), outcome(1, "rejected")], [
      { segmentIndex: 2, stage: "not_extracted", reason: "no_quotation_like_span" },
      { segmentIndex: 3, stage: "not_extracted", reason: "no_quotation_like_span" },
      { segmentIndex: 4, stage: "not_checked", reason: "verification_timeout" },
    ])
    expect(coverageLines(report)).toEqual([
      { label: "segments", value: 5 },
      { label: "extracted", value: 2 },
      { label: "checked", value: 2 },
      { label: "verified", value: 1 },
      { label: "unverifiable", value: 0 },
      { label: "rejected", value: 1 },
      { label: "notExtracted", value: 2 },
    ])
    for (const line of coverageLines(report)) expect(Number.isInteger(line.value)).toBe(true)
  })

  test("notExtracted is DERIVED from the gap list, so it cannot disagree with it", () => {
    const report = reportOf(3, [], [
      { segmentIndex: 0, stage: "not_extracted", reason: "no_quotation_like_span" },
      { segmentIndex: 1, stage: "not_extracted", reason: "no_quotation_like_span" },
      { segmentIndex: 2, stage: "not_checked", reason: "verification_timeout" },
    ])
    expect(coverageLines(report).find((line) => line.label === "notExtracted")?.value).toBe(2)
    expect(report.counts).not.toHaveProperty("notExtracted")
  })

  test("no line is a percentage, so nothing on this surface could be read as a rate of agreement", () => {
    const report = reportOf(4, [outcome(0, "verified")], [])
    for (const line of coverageLines(report)) expect(line.label).not.toMatch(/percent|ratio|share|score/)
    expect(Object.keys(report.counts)).not.toContain("extractedShare")
  })

  test("the gaps are grouped by stage with their segment indices, so a reader can go and look", () => {
    const report = reportOf(4, [], [
      { segmentIndex: 2, stage: "not_extracted", reason: "no_quotation_like_span" },
      { segmentIndex: 1, stage: "not_checked", reason: "verification_timeout" },
    ])
    expect(coverageGaps(report)).toEqual([
      { stage: "not_extracted", count: 1, segments: [2] },
      { stage: "not_checked", count: 1, segments: [1] },
    ])
  })
})

describe("a completeness claim cannot be printed without the denominator", () => {
  test("a document whose selector skipped a span never reads as clean", () => {
    const report = reportOf(4, [outcome(0, "verified")], [
      { segmentIndex: 1, stage: "not_extracted", reason: "no_quotation_like_span" },
      { segmentIndex: 2, stage: "not_extracted", reason: "no_quotation_like_span" },
      { segmentIndex: 3, stage: "not_checked", reason: "verification_timeout" },
    ])
    const sentence = coverageSentenceOf(report)
    expect(sentence).toContain("1 of 4 segments extracted")
    expect(sentence).not.toContain("all verified")
  })

  test("every branch that makes a claim carries the extracted-of-segments denominator on it", () => {
    const partial = reportOf(4, [outcome(0, "verified")], [
      { segmentIndex: 1, stage: "not_extracted", reason: "no_quotation_like_span" },
    ])
    const undecided = reportOf(2, [outcome(0, "verified"), outcome(1, "verified")], [
      { segmentIndex: 2, stage: "not_checked", reason: "verification_timeout" },
    ])
    const clean = reportOf(2, [outcome(0, "verified"), outcome(1, "verified")], [])
    for (const report of [partial, undecided, clean]) {
      const sentence = coverageSentenceOf(report)
      expect(sentence).toContain("segments extracted")
    }
  })

  test("the exact-ratios case STILL shows the denominator, and never a percentage", () => {
    const report = reportOf(2, [outcome(0, "verified"), outcome(1, "verified")], [])
    const sentence = coverageSentenceOf(report)
    expect(sentence).toContain("2 of 2 segments extracted")
    expect(sentence).not.toContain("100%")
  })
})

/**
 * The planted verdict case, and the reason it is a separate describe block.
 *
 * `all verified` is a claim about VERDICTS. The branch that emits it once branched only on coverage —
 * `segments`, `extracted`, `checked` — so a document with `verified: 0` and nothing decided otherwise
 * fell through to the claiming branch and was told every span was verified. On the shipped path that is
 * not an edge case: claims carry `citations: []`, the verifier answers `unverifiable (no_citation)` for
 * all of them, and `verified: 0` is what every real run produces.
 *
 * So this is planted from the ORDINARY output rather than from a contrived one, and it is asserted on
 * the rendered report as well as on the sentence: the seven figures are two lines below the claim, and a
 * reader skimming the first line is exactly the reader the claim has to be true for.
 */
describe("the completeness claim is about verdicts, so the verdict tallies are read", () => {
  test("the ordinary shipped run — nothing verified — never reads as all verified", () => {
    const report = reportOf(2, [outcome(0, "unverifiable"), outcome(1, "unverifiable")], [])
    const sentence = coverageSentenceOf(report)
    expect(sentence).not.toContain("all verified")
    expect(sentence).toContain("0 of 2 extracted spans verified")
  })

  test("it says what the other spans were decided as, rather than leaving the reader to guess", () => {
    const mixed = coverageSentenceOf(reportOf(2, [outcome(0, "verified"), outcome(1, "rejected")], []))
    expect(mixed).toContain("1 of 2 extracted spans verified")
    expect(mixed).toContain("0 unverifiable and 1 rejected")
    const none = coverageSentenceOf(reportOf(2, [outcome(0, "unverifiable"), outcome(1, "unverifiable")], []))
    expect(none).toContain("2 unverifiable and 0 rejected")
  })

  test("it still carries both denominator words, because it is a claim about this document", () => {
    const sentence = coverageSentenceOf(reportOf(2, [outcome(0, "unverifiable"), outcome(1, "unverifiable")], []))
    expect(sentence).toContain("segments")
    expect(sentence).toContain("extracted")
  })

  test("the rendered report does not put the claim anywhere near the verified count of zero", () => {
    const rendered = renderCoverage(reportOf(2, [outcome(0, "unverifiable"), outcome(1, "unverifiable")], []))
    expect(rendered).not.toContain("all verified")
    expect(rendered).toContain("verified: 0")
  })

  test("the claiming branch is still reachable, and only for a document where it is true", () => {
    // The other half of the fix: a fix that made the claim unprintable would pass every test above
    // while destroying the feature. The branch fires, and fires only when `verified` equals `extracted`.
    expect(coverageSentenceOf(reportOf(2, [outcome(0, "verified"), outcome(1, "verified")], []))).toContain(
      "all verified",
    )
    expect(coverageSentenceOf(reportOf(3, [outcome(0, "verified"), outcome(1, "verified"), outcome(2, "verified")], []))).toContain(
      "all verified",
    )
  })

  test("an undecided span is counted as undecided, never as an unverifiable verdict", () => {
    // Branch ORDER, asserted rather than described: a span the verifier never finished sits in neither
    // the verified nor the unverifiable tally, so the undecided branch has to intercept before the
    // tallies are read. The counts are supplied directly because `articleCountsOf` derives
    // `checked === extracted` from the outcome list, so this is the one state the helper cannot build.
    const report: ArticleCoverageReport = {
      schemaVersion: ARTICLE_COVERAGE_SCHEMA_VERSION,
      documentDigest: DIGEST,
      segmentCount: 2,
      counts: { segments: 2, extracted: 2, checked: 1, verified: 1, unverifiable: 0, rejected: 0 },
      outcomes: [outcome(0, "verified")],
      gaps: [{ segmentIndex: 1, stage: "not_checked", reason: "verification_timeout" }],
      degradation: "unverifiable",
    }
    const sentence = coverageSentenceOf(report)
    expect(sentence).toContain("1 could not be decided")
    expect(sentence).not.toContain("all verified")
  })
})

describe("segments = 0 never divides and never claims", () => {
  test("the sentence says there were no segments, with no NaN and no claim", () => {
    const report = reportOf(0, [], [])
    const sentence = coverageSentenceOf(report)
    expect(sentence).toBe("there were no segments, so nothing in this document was examined")
    expect(sentence).not.toContain("NaN")
    expect(sentence).not.toContain("of 0")
    expect(sentence).not.toContain("all verified")
  })

  test("an empty document does not render as one with zero problems found", () => {
    const rendered = renderCoverage(reportOf(0, [], []))
    expect(rendered).toContain("no segments")
    expect(rendered).not.toContain("nothing was found")
  })
})

describe("renderCoverage", () => {
  test("the sentence comes FIRST, so a truncated view still carries the claim and its denominator", () => {
    const report = reportOf(4, [outcome(0, "verified")], [
      { segmentIndex: 1, stage: "not_extracted", reason: "no_quotation_like_span" },
    ])
    const rendered = renderCoverage(report)
    expect(rendered.split("\n")[0]).toBe(coverageSentenceOf(report))
  })

  test("it prints the digest and never the document", () => {
    const rendered = renderCoverage(reportOf(1, [outcome(0, "verified")], []))
    expect(rendered).toContain(DIGEST)
    expect(rendered).toContain("documentDigest")
  })

  test("it names the gaps by segment index, so a skipped fabrication is a location", () => {
    const rendered = renderCoverage(reportOf(3, [], [
      { segmentIndex: 2, stage: "not_extracted", reason: "no_quotation_like_span" },
    ]))
    expect(rendered).toContain("gaps (not_extracted): 2")
  })
})

describe("rendered corpus text is text only", () => {
  test("no raw-HTML sink appears anywhere in the renderer (AGENTS.md section 11, gate G-2)", () => {
    const text = readFileSync(join(import.meta.dir, "..", "src", "coverage-render.ts"), "utf8")
    for (const sink of ["innerHTML", "dangerouslySetInnerHTML", "{@html}", "document.write"]) {
      expect(text).not.toContain(sink)
    }
  })
})
