import type { ArticleCoverageReport, CoverageGap, GapStage } from "@mizan/core"

/**
 * The document coverage renderer — the ONLY site where a completeness sentence can be formed.
 *
 * ## Why this module exists rather than a line in an existing renderer
 *
 * A verdict-only report is a fail-open report. A component that SELECTS which spans get checked can
 * hide a fabrication by not emitting it, so every span the selector skipped has to be visible beside
 * the spans it did emit — and the only way to make that structural rather than a review convention is
 * to give the sentence one owner. Gate G-7.13 reads this file: a completeness phrase anywhere else in
 * the display path fails the build, and a completeness phrase HERE must carry the denominator on the
 * same line.
 *
 * ## The seven figures, and the one that is DERIVED
 *
 * `segments`, `extracted`, `checked`, `verified`, `unverifiable` and `rejected` are read from
 * `counts`. `notExtracted` is derived here from the gap list rather than read from a field, because a
 * stored count beside the list it summarises is two declarations of one fact and two declarations are
 * where two runs legitimately disagree (AGENTS.md section 17). `notChecked` needs no line of its own:
 * it is the second group in `coverageGaps`.
 *
 * ## No percentage, anywhere, ever
 *
 * `extracted / segments` is the number this feature is about and it is deliberately absent. Three
 * separate controls already refuse the quotient — `Relevance`'s rejected `{matched, total}` in
 * `schema/display.ts`, gate G-7.4 on percentage-shaped keys, gate G-7.12 on the display contract's
 * numbers — so a ratio printed here would be the CWE-345 hole wearing a nicer hat (AGENTS.md
 * section 10). Two integers, denominator beside them.
 */

/** The published figures, in the order a reader meets them. Every one is a whole number. */
export type CoverageLine = { readonly label: string; readonly value: number }

/** The gaps at one stage: how many, and which segment indices, so a reader can go and look. */
export type CoverageGapGroup = {
  readonly stage: GapStage
  readonly count: number
  readonly segments: readonly number[]
}

/**
 * The seven figures the report publishes.
 *
 * `notExtracted` is counted from `gaps`, so a count that disagreed with the list it summarises cannot
 * be printed even if one were passed in — and none is: `report.counts` has no such field to disagree.
 */
export const coverageLines = (report: ArticleCoverageReport): readonly CoverageLine[] => [
  { label: "segments", value: report.counts.segments },
  { label: "extracted", value: report.counts.extracted },
  { label: "checked", value: report.counts.checked },
  { label: "verified", value: report.counts.verified },
  { label: "unverifiable", value: report.counts.unverifiable },
  { label: "rejected", value: report.counts.rejected },
  { label: "notExtracted", value: report.gaps.filter((gap) => gap.stage === "not_extracted").length },
]

/** The gaps grouped by stage, ascending by segment index inside each group. */
export const coverageGaps = (report: ArticleCoverageReport): readonly CoverageGapGroup[] =>
  (["not_extracted", "not_checked"] as const).map((stage) => {
    const inStage: readonly CoverageGap[] = report.gaps.filter((gap) => gap.stage === stage)
    return { stage, count: inStage.length, segments: inStage.map((gap) => gap.segmentIndex).sort((a, b) => a - b) }
  })

/**
 * The one completeness sentence, and the denominator that goes with it.
 *
 * ## Every branch either prints a denominator or prints no claim at all
 *
 * That is the invariant gate G-7.13 enforces, and the zero-segment branch is why it is written as an
 * invariant rather than as a habit. A document with `segments = 0` has an undefined ratio, and the
 * three tempting renderings of that are a division by zero, a `NaN` on screen, and a claim that a
 * document containing nothing passed. All three are refused, and the sentence says what is actually
 * true: there were no segments.
 *
 * ## Why `verified` is read, and why it is read LAST
 *
 * Because the phrase `all verified` is a claim about VERDICTS, not about coverage, and a sentence that
 * branched only on `segments`, `extracted` and `checked` printed it for a document on which nothing was
 * verified at all. That is the fail-open direction this whole module exists to prevent, reached through
 * a branch rather than through a missing count: the shipped path returns `unverifiable (no_citation)` for
 * every span, so `verified: 0` is the ORDINARY case, and the sentence claiming every one of them was
 * verified was the normal output rather than an edge case. `verified` is compared against `extracted`
 * rather than against `checked`, because that is the number the reader is being asked to weigh.
 *
 * The order is load-bearing and is stated rather than left to be discovered. `checked < extracted` is
 * tested FIRST: a span the verifier never finished is in neither the `verified` nor the `unverifiable`
 * tally, so a sentence built from the tallies alone would count a timeout as an unverifiable verdict. The
 * undecided branch has to intercept before the tallies are read, or the report would attribute a reason
 * to a span that has none.
 *
 * Each of the four claiming branches inlines the words `segments` and `extracted` rather than
 * interpolating a prebuilt phrase, because the gate reads the SOURCE LINE and a claim whose denominator
 * arrived from a variable one line up is a claim a reader of the diff cannot check. The `all verified`
 * branch keeps that literal phrase DELIBERATELY: it is the phrasing gate G-7.13 reads, so rephrasing it
 * to something the rule cannot see would quietly unpolice the one branch where a claim is made.
 */
export const coverageSentenceOf = (report: ArticleCoverageReport): string => {
  const { segments, extracted, checked, verified, unverifiable, rejected } = report.counts
  if (segments === 0) return "there were no segments, so nothing in this document was examined"
  if (extracted < segments) return `${extracted} of ${segments} segments extracted; ${segments - extracted} were never examined`
  if (checked < extracted) return `${extracted} of ${segments} segments extracted; ${extracted - checked} could not be decided`
  if (verified < extracted) {
    return `${verified} of ${extracted} extracted spans verified by containment; ${unverifiable} unverifiable and ${rejected} rejected, out of ${segments} segments`
  }
  return `all verified: ${extracted} of ${segments} segments extracted, and every one decided by containment`
}

/** The whole report as text. The sentence comes FIRST, so a truncated view still carries the claim. */
export const renderCoverage = (report: ArticleCoverageReport): string => {
  const counts = coverageLines(report).map((line) => `  ${line.label}: ${line.value}`)
  const gaps = coverageGaps(report)
    .filter((group) => group.count > 0)
    .map((group) => `  gaps (${group.stage}): ${group.segments.join(", ")}`)
  return [
    coverageSentenceOf(report),
    ...counts,
    ...gaps,
    `  documentDigest: ${report.documentDigest}`,
    `  degradation: ${report.degradation ?? "none"}`,
  ].join("\n")
}

export * as CoverageRender from "./coverage-render.ts"
