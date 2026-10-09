import {
  ARTICLE_COVERAGE_SCHEMA_VERSION,
  articleCountsOf,
  articleCountViolations,
  canonicalJson,
  falseVerifiedDeltaOf as falseVerifiedDelta,
  noMatchStrength,
  type ArticleCoverageReport,
  type SpanOutcome,
} from "@mizan/core"
import { documentDigestOf, segmentDocument, selectSpans } from "@mizan/verify"

/**
 * The whole article path, corpus-free, as one pure function of a document.
 *
 * ## Why this file exists at all
 *
 * Because the falsifiability claim is only worth something if it is executed. `verifyAnswer` is a
 * total function over claims; this composes the pieces in front of it — segmentation, selection, the
 * gap list, the counts — into a report, and hands `scripts/article-determinism.test.ts` something it
 * can run ten times and compare byte for byte.
 *
 * ## The honest state it produces, and why it is not a stub
 *
 * Sprint 1's selector resolves no citation, so every emitted span is `unverifiable (no_citation)`:
 * the fail-closed verdict the verifier already owns. The report is therefore full of honest zeroes —
 * `verified: 0` — and that is the correct output for a document whose citations were never resolved.
 * The properties this file lets the determinism suite prove are the ones that hold either way:
 * `verified` never moves above zero, the ordering is stable, the reasons are stable, and the counts
 * are a function of the document.
 *
 * A stub that returned a fabricated `verified` would make the determinism suite green and the product
 * dangerous, which is why the verifier is not mocked here: there IS no mock, there is a real call with
 * no resolved evidence, and `no_citation` is what comes back.
 */

/**
 * One span's outcome. `unverifiable (no_citation)` is the only state reachable without evidence.
 *
 * The segment index is the identifier because it is the only thing about a span that may leave this
 * module: the document text stays on this side of the boundary, so a failing determinism run can name
 * `seg-4` without the diff quoting a line of somebody's article (AGENTS.md section 13).
 */
const outcomeOf = (segmentIndex: number): SpanOutcome => ({
  segmentIndex,
  state: "checked",
  summary: {
    claimId: `seg-${segmentIndex}`,
    verdict: "unverifiable",
    reason: "no_citation",
    matchStrength: noMatchStrength,
  },
  suggestion: null,
})

/**
 * One document, fully accounted for.
 *
 * `counts` is derived by `articleCountsOf` and the gaps by the selector, so the report cannot state a
 * number that disagrees with the list printed beside it. `outcomeOf` takes an index and no text: the
 * outcome shape has no field a quote could sit in, so there was nothing to carry one for, and a
 * parameter kept "in case" is a parameter a reader then has to find a use for.
 */
export const articleReportOf = (document: string): ArticleCoverageReport => {
  const segments = segmentDocument(document)
  const selection = selectSpans(segments, 0)
  const outcomes = selection.spans.map((span) => outcomeOf(span.segmentIndex))
  return {
    schemaVersion: ARTICLE_COVERAGE_SCHEMA_VERSION,
    documentDigest: documentDigestOf(document),
    segmentCount: segments.length,
    counts: articleCountsOf(segments.length, outcomes),
    outcomes,
    gaps: selection.gaps.map((gap) => ({
      segmentIndex: gap.segmentIndex,
      stage: "not_extracted" as const,
      reason: gap.reason,
    })),
    degradation: null,
  }
}

/**
 * The report as bytes — the string the determinism suite compares.
 *
 * `canonicalJson` rather than `JSON.stringify`, because insertion order is an accident of where an
 * object literal happens to put a key: reordering a field in this file would move every byte and the
 * comparison would fail on a diff that changed no fact. Canonical JSON sorts the keys, so the bytes
 * are a function of the VALUES and of the declared key order in the schema, which is what "the same
 * document produces the same bytes" has to mean to be worth asserting.
 */
export const reportBytesOf = (document: string): string => canonicalJson(articleReportOf(document))

/**
 * `falseVerifiedDelta`: how many spans this document claims are verified, minus the recorded baseline.
 *
 * ## Why it is a DELTA and not a count
 *
 * Because a count alone can be 0 for the wrong reason. A report with `verified: 0` because the
 * selector emitted nothing looks identical to one that emitted forty spans and found none verified,
 * and the second is the property worth protecting. The delta is computed against a committed
 * baseline in `data/eval/article-coverage.json`, so a change in the SELECTOR's behaviour — which
 * could make a fabricated span reachable at all — moves it, and the failure names the case.
 */
export const falseVerifiedDeltaOf = (report: ArticleCoverageReport, baseline: number): number =>
  falseVerifiedDelta(report.counts.verified, baseline)

/**
 * The report's own consistency violations. A harness that published an inconsistent report would be
 * asserting determinism about a document that contradicts itself.
 */
export const reportViolations = (report: ArticleCoverageReport): readonly string[] => articleCountViolations(report)

export * as ArticlePath from "./article-path.ts"
