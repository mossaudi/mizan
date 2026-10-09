import { describe, expect, test } from "bun:test"
import {
  ARTICLE_COVERAGE_SCHEMA_VERSION,
  ArticleCoverageReport,
  CONDITION_OF_GAP,
  CoverageGap,
  GapReason,
  SpanOutcome,
  articleCountViolations,
  articleCountsOf,
  decodeOrFail,
  decodeSync,
  emptyArticleCounts,
  gapsAt,
  notCheckedSegments,
  notExtractedSegments,
} from "@mizan/core"

/**
 * The document coverage contract: the unit of accountability for an article.
 *
 * Three properties are load-bearing and each has its own describe block:
 *
 *  1. `unverifiable` and `not_extracted` are DIFFERENT states, because they are different sentences —
 *     "we looked and could not decide" versus "we never looked".
 *  2. The report crosses a trust boundary through a declared schema, so a hand-edited artefact is a
 *     decode failure naming the field rather than a lenient read (AGENTS.md section 1).
 *  3. The counts are DERIVED, so a caller cannot pass a count that disagrees with the list beside it.
 */

const DIGEST = "b".repeat(64)

const summary = (verdict: "verified" | "unverifiable" | "rejected") => ({
  verdict,
  reason: verdict === "verified" ? ("exact_containment" as const) : ("no_citation" as const),
  matchStrength: verdict === "verified" ? ({ kind: "exact", percent: 100 } as const) : ({ kind: "none" } as const),
})

const outcome = (segmentIndex: number, verdict: "verified" | "unverifiable" | "rejected"): SpanOutcome => ({
  segmentIndex,
  state: "checked",
  summary: { claimId: `seg-${segmentIndex}`, ...summary(verdict) },
  suggestion: null,
})

const gap = (segmentIndex: number, stage: "not_extracted" | "not_checked", reason: GapReason): CoverageGap => ({
  segmentIndex,
  stage,
  reason,
})

const reportOf = (segments: number, outcomes: readonly SpanOutcome[], gaps: readonly CoverageGap[]): ArticleCoverageReport => ({
  schemaVersion: ARTICLE_COVERAGE_SCHEMA_VERSION,
  documentDigest: DIGEST,
  segmentCount: segments,
  counts: articleCountsOf(segments, outcomes),
  outcomes,
  gaps,
  degradation: null,
})

describe("unverifiable and not_extracted are distinguishable states", () => {
  test("a span the verifier timed out is an OUTCOME with a reason, not a gap", () => {
    const timedOut = outcome(0, "unverifiable")
    const report = reportOf(1, [timedOut], [])
    expect(report.outcomes[0]?.summary.verdict).toBe("unverifiable")
    expect(report.gaps).toEqual([])
  })

  test("a span the selector never emitted is a GAP with an index", () => {
    const report = reportOf(2, [], [gap(1, "not_extracted", "no_quotation_like_span")])
    expect(report.outcomes).toEqual([])
    expect(report.gaps[0]?.stage).toBe("not_extracted")
  })

  test("a span emitted and then not decided is a `not_checked` gap, which is a THIRD surface", () => {
    const report = reportOf(3, [outcome(0, "unverifiable")], [gap(2, "not_checked", "verification_timeout")])
    expect(report.gaps[0]?.stage).toBe("not_checked")
    expect(notCheckedSegments(report.gaps)).toEqual([2])
    expect(notExtractedSegments(report.gaps)).toEqual([])
  })

  test("the two gap stages are counted apart, so a reader can tell which happened for each span", () => {
    const gaps = [gap(0, "not_extracted", "no_quotation_like_span"), gap(1, "not_checked", "verification_timeout")]
    expect(gapsAt(gaps, "not_extracted")).toHaveLength(1)
    expect(gapsAt(gaps, "not_checked")).toHaveLength(1)
  })
})

describe("the counts are derived, never supplied", () => {
  test("segments, extracted and checked come from the denominator and the outcome list", () => {
    const counts = articleCountsOf(7, [outcome(0, "verified"), outcome(1, "rejected")])
    expect(counts.segments).toBe(7)
    expect(counts.extracted).toBe(2)
    expect(counts.checked).toBe(2)
  })

  test("the verdict tallies sum to checked", () => {
    const counts = articleCountsOf(9, [outcome(0, "verified"), outcome(1, "verified"), outcome(2, "rejected")])
    expect(counts.verified + counts.unverifiable + counts.rejected).toBe(counts.checked)
  })

  test("there is no `notExtracted` field, because it would be a second declaration of the gap list", () => {
    expect(Object.keys(emptyArticleCounts()).toSorted()).toEqual([
      "checked",
      "extracted",
      "rejected",
      "segments",
      "unverifiable",
      "verified",
    ])
  })
})

describe("articleCountViolations", () => {
  test("a consistent report has none", () => {
    const report = reportOf(3, [outcome(0, "verified"), outcome(1, "unverifiable")], [gap(2, "not_extracted", "no_quotation_like_span")])
    expect(articleCountViolations(report)).toEqual([])
  })

  test("a count that disagrees with segmentCount is named", () => {
    const report = reportOf(3, [outcome(0, "verified")], [])
    const broken = { ...report, counts: { ...report.counts, segments: 99 } }
    expect(articleCountViolations(broken).join(" ")).toContain("segmentCount")
  })

  test("a verdict tally that does not sum to checked is named", () => {
    const report = reportOf(1, [outcome(0, "verified")], [])
    const broken = { ...report, counts: { ...report.counts, verified: 5 } }
    expect(articleCountViolations(broken).join(" ")).toContain("sum to checked")
  })

  test("a segment that is both emitted and gapped is a violation, not a rounding difference", () => {
    const report = reportOf(1, [outcome(0, "verified")], [gap(0, "not_extracted", "no_quotation_like_span")])
    expect(articleCountViolations(report).join(" ")).toContain("both emitted and a gap")
  })

  test("a verified span carrying a suggestion is a violation, because it reads as the reason for the badge", () => {
    const withSuggestion: SpanOutcome = {
      ...outcome(0, "verified"),
      suggestion: { state: "no_candidates", considered: 0, scope: { kind: "snapshot", widenedFrom: null }, reason: "x" },
    }
    expect(articleCountViolations(reportOf(1, [withSuggestion], [])).join(" ")).toContain("carries a suggestion")
  })

  test("a duplicate gap for one segment is a violation", () => {
    const report = reportOf(2, [], [
      gap(0, "not_extracted", "no_quotation_like_span"),
      gap(0, "not_checked", "verification_timeout"),
    ])
    expect(articleCountViolations(report).join(" ")).toContain("twice")
  })
})

describe("the report crosses a trust boundary through a declared schema", () => {
  const decode = (payload: unknown) => decodeOrFail(decodeSync(ArticleCoverageReport), payload, "ArticleCoverageReport")

  test("a well-formed report decodes", () => {
    const decoded = decode(JSON.parse(JSON.stringify(reportOf(1, [outcome(0, "verified")], []))))
    expect(decoded.ok).toBe(true)
  })

  test("a missing field is a decode failure naming the schema, never a lenient read", () => {
    const payload = JSON.parse(JSON.stringify(reportOf(1, [outcome(0, "verified")], []))) as Record<string, unknown>
    delete payload["counts"]
    const decoded = decode(payload)
    expect(decoded.ok).toBe(false)
    if (decoded.ok) return
    expect(decoded.error.schema).toBe("ArticleCoverageReport")
  })

  test("a hand-edited verdict string is a decode failure, not a rendered report", () => {
    const payload = JSON.parse(JSON.stringify(reportOf(1, [outcome(0, "verified")], []))) as Record<string, unknown>
    payload["outcomes"] = [{ segmentIndex: 0, state: "checked", summary: { ...summary("unverifiable"), verdict: "looks fine" }, suggestion: null }]
    expect(decode(payload).ok).toBe(false)
  })

  test("an unknown gap reason is refused, because the vocabulary is closed", () => {
    const decoded = decode({ ...reportOf(1, [], [gap(0, "not_extracted", "looks fine" as GapReason)]), counts: articleCountsOf(1, []) })
    expect(decoded.ok).toBe(false)
  })

  test("the failure never echoes the payload, which is untrusted and may be enormous", () => {
    const decoded = decode("x".repeat(50_000))
    expect(decoded.ok).toBe(false)
    if (decoded.ok) return
    expect(decoded.error.detail.length).toBeLessThanOrEqual(220)
  })
})

describe("every gap reason is adjudicated into the shared vocabulary", () => {
  test("the Record is total over the union, so a new reason without a decision is a tsc error", () => {
    expect(Object.keys(CONDITION_OF_GAP).toSorted()).toEqual(
      ["decode_failed", "model_unavailable", "no_quotation_like_span", "no_sources_found", "segment_exceeds_quote_bound", "verification_timeout"].toSorted(),
    )
  })

  test("the three facts about a document's own text are NOT pipeline conditions", () => {
    // Projecting them onto `unmeasured` would publish "nobody produced this figure" for a segment that
    // simply contains no quotation — two different claims behind one word.
    expect(CONDITION_OF_GAP.no_quotation_like_span).toBeNull()
    expect(CONDITION_OF_GAP.segment_exceeds_quote_bound).toBeNull()
    expect(CONDITION_OF_GAP.decode_failed).toBeNull()
  })

  test("the three pipeline reasons project onto the conditions the surfaces already print", () => {
    expect(CONDITION_OF_GAP.verification_timeout).toBe("unverifiable")
    expect(CONDITION_OF_GAP.model_unavailable).toBe("model_unavailable")
    expect(CONDITION_OF_GAP.no_sources_found).toBe("no_sources_found")
  })
})
