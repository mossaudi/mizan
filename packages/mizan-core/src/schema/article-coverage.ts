import { Schema } from "effect"
import { DegradationCondition } from "./degradation.ts"
import { Suggestion } from "./display.ts"
import { VerdictSummary } from "./verdict.ts"

/**
 * The DOCUMENT-level coverage contract — the unit of accountability for an article.
 *
 * ## Why this is a separate module from `schema/coverage.ts`
 *
 * `schema/coverage.ts` is the QUARANTINE artefact: how much of the fetched corpus never reaches a
 * reader, per source and per collection. It is exported from the package barrel at line 40 and read
 * by `scripts/eval/coverage-tables.ts`. This module is a different fact about a different object — a
 * document a client submitted, not a corpus we built — and overwriting the other one would destroy
 * the quarantine report and break `bun run eval:suggestions`. Two artefacts, two modules, one
 * declaration each (AGENTS.md section 17).
 *
 * ## What this contract exists to make impossible
 *
 * A component that SELECTS which spans get checked can hide a fabrication by not emitting it. So a
 * report that printed verdicts alone would be a fail-open report: every fabricated span the selector
 * skipped would simply be absent, and "absent" reads exactly like "nothing was there to find".
 *
 * Therefore the report publishes `segments`, `extracted` and `checked` beside every verdict count,
 * and the `gaps` list names every segment that did not reach the verifier together with WHY. A reader
 * can distinguish "we looked and found nothing" from "we never looked", which is the whole claim.
 *
 * ## Why there is no ratio field anywhere in here
 *
 * `extracted / segments` is the number this feature is about, and it is deliberately absent as a
 * field. Three separate modules already reject the quotient: `Relevance` refused `{matched, total}`
 * for exactly this reason (`schema/display.ts`), gate G-7.4 rejects a percentage-shaped property key
 * on the display path, and gate G-7.12 enumerates the only numbers a displayed candidate may carry.
 * The two counts are stored and the ratio is printed — as two integers with the denominator beside
 * them, never as a percentage, which is the shape AGENTS.md section 10 bans.
 *
 * ## No corpus text, and no corpus provenance
 *
 * `SpanOutcome.summary` is the `VerdictSummary` projection, never a `ClaimVerdict` — so `evidence`,
 * `sourceUrl`, `license` and `attribution` cannot travel on a report this module declares. `suggestion`
 * is the existing display-only `Suggestion` contract, reused verbatim so no fourth number and no new
 * union member is introduced (AGENTS.md section 10, ADR-12).
 */

/** Bumped only when the published shape changes incompatibly. */
export const ARTICLE_COVERAGE_SCHEMA_VERSION = 1

/**
 * Why a segment did not reach a verdict. A closed union, never a free string.
 *
 * ## The two halves are different facts and the split is load-bearing
 *
 *  - `no_quotation_like_span` / `segment_exceeds_quote_bound` — the SELECTOR did not emit a span.
 *    We never looked. This is the half that makes R-1 visible: a fabrication the selector skipped
 *    lands here as a named row rather than vanishing.
 *  - `model_unavailable` / `decode_failed` — an extraction was attempted and could not finish. We
 *    looked and could not see. `decode_failed` exists for the model-assisted path that Sprint 1 does
 *    not build; it is declared now so that adding that path is an addition to a closed set rather
 *    than a second vocabulary beside it, and so the reason exists before anything can emit it.
 *  - `verification_timeout` / `no_sources_found` — a span was emitted and the verifier could not
 *    decide it.
 *
 * Named `no_quotation_like_span` rather than `no_citation_like_span` because that is what the
 * deterministic selector actually detects: it finds a delimited or speech-introduced QUOTATION, and
 * it resolves no citation at all. A reason whose name claims more than the code measures is the same
 * defect `MatchStrength` exists to prevent (AGENTS.md section 10) — the reader is entitled to believe
 * the word.
 */
export const GapReason = Schema.Union([
  /** The segment held no delimited quotation and no speech-introduced span. */
  Schema.Literal("no_quotation_like_span"),
  /** The segment's only candidate span is longer than `MAX_QUOTE_CHARS`, so it was not truncated into something that looks checked. */
  Schema.Literal("segment_exceeds_quote_bound"),
  /** A provider was needed to read this span and could not be reached. */
  Schema.Literal("model_unavailable"),
  /** Whatever produced the span crossed the trust boundary and failed `decodeOrFail`. */
  Schema.Literal("decode_failed"),
  /** The span reached the verifier and the request budget expired. */
  Schema.Literal("verification_timeout"),
  /** The citation resolved to nothing, so there was nothing to contain the span in. */
  Schema.Literal("no_sources_found"),
])
export type GapReason = Schema.Schema.Type<typeof GapReason>

/**
 * Where a gap happened, which is what separates "we never looked" from "we looked and could not
 * decide". The two are printed differently because they are different sentences, and a reader given
 * the first when the truth was the second has been told we checked a span we never checked.
 */
export const GapStage = Schema.Union([Schema.Literal("not_extracted"), Schema.Literal("not_checked")])
export type GapStage = Schema.Schema.Type<typeof GapStage>

/** One segment that did not reach a verdict, and why. This list is what makes the gap visible. */
export const CoverageGap = Schema.Struct({
  segmentIndex: Schema.Number,
  stage: GapStage,
  reason: GapReason,
})
export type CoverageGap = Schema.Schema.Type<typeof CoverageGap>

/**
 * The shared degradation condition each gap reason belongs to, or `null`.
 *
 * A `Record<GapReason, …>` rather than a lookup beside the renderers, for the reason
 * `CONDITION_SENTENCE` in `degradation.ts` gives: the key type is the DERIVED union, so adding a
 * reason without deciding whether it is a shared condition is a `tsc` error rather than a condition
 * a surface quietly invents. Three reasons are `null` — they are not pipeline conditions at all but
 * facts about this document's text, and projecting them onto `unmeasured` would publish "nobody
 * produced this figure" for a segment that simply contains no quotation.
 */
export const CONDITION_OF_GAP: Readonly<Record<GapReason, DegradationCondition | null>> = {
  no_quotation_like_span: null,
  segment_exceeds_quote_bound: null,
  model_unavailable: "model_unavailable",
  decode_failed: null,
  verification_timeout: "unverifiable",
  no_sources_found: "no_sources_found",
}

/** The shared condition for a gap, or `null` when the reason is not a pipeline condition. */
export const conditionOfGap = (reason: GapReason): DegradationCondition | null => CONDITION_OF_GAP[reason]

/**
 * The four counts plus the three verdict counts, and NOT `notExtracted` / `notChecked`.
 *
 * Those two are DERIVED at render time from `gaps.filter(stage).length`. Storing a count beside the
 * list it summarises is two declarations of one fact, and two declarations are where two runs
 * legitimately disagree (AGENTS.md section 17). A test asserts the derived totals equal the gap-list
 * lengths, so the renderer and the data cannot drift apart.
 */
export const ArticleCounts = Schema.Struct({
  /** The whole-document denominator: how many segments the document has. */
  segments: Schema.Number,
  /** How many of those segments the selector emitted a span for. */
  extracted: Schema.Number,
  /** How many emitted spans reached the verifier. Never above `extracted`. */
  checked: Schema.Number,
  verified: Schema.Number,
  unverifiable: Schema.Number,
  rejected: Schema.Number,
})
export type ArticleCounts = Schema.Schema.Type<typeof ArticleCounts>

/**
 * One checked span: its segment index, the `VerdictSummary` projection, and the display-only
 * suggestion attached to it.
 *
 * `suggestion` is non-null only for a span that is not `verified`; null means the suggestion pass was
 * never run for it, which is absence and not a fourth `Suggestion` state.
 */
export const SpanOutcome = Schema.Struct({
  segmentIndex: Schema.Number,
  state: Schema.Literal("checked"),
  summary: VerdictSummary,
  suggestion: Schema.NullOr(Suggestion),
})
export type SpanOutcome = Schema.Schema.Type<typeof SpanOutcome>

/** The committed document-level report. Counts, per-span outcomes and the gaps between them. */
export const ArticleCoverageReport = Schema.Struct({
  schemaVersion: Schema.Literal(ARTICLE_COVERAGE_SCHEMA_VERSION),
  /**
   * `sha256Hex` of the submitted document. The ONLY document identifier this report carries — never
   * the document, never a span (AGENTS.md section 13). It is what a reader compares two reports by,
   * and what a cursor binds to.
   */
  documentDigest: Schema.String,
  /** The whole-document denominator, repeated beside the counts so no consumer can quote one alone. */
  segmentCount: Schema.Number,
  counts: ArticleCounts,
  outcomes: Schema.Array(SpanOutcome),
  gaps: Schema.Array(CoverageGap),
  /** The one degradation condition that applies to the whole run, or `null`. */
  degradation: Schema.NullOr(DegradationCondition),
})
export type ArticleCoverageReport = Schema.Schema.Type<typeof ArticleCoverageReport>

/** The zero report, for a chunk that has produced nothing yet. Never a claim that nothing was wrong. */
export const emptyArticleCounts = (): ArticleCounts => ({
  segments: 0,
  extracted: 0,
  checked: 0,
  verified: 0,
  unverifiable: 0,
  rejected: 0,
})

/** `gaps` at one stage. The derived `notExtracted` / `notChecked` figures, in one place. */
export const gapsAt = (gaps: readonly CoverageGap[], stage: GapStage): readonly CoverageGap[] =>
  gaps.filter((gap) => gap.stage === stage)

/** The segments the selector never emitted, as a sorted index list. */
export const notExtractedSegments = (gaps: readonly CoverageGap[]): readonly number[] =>
  gapsAt(gaps, "not_extracted")
    .map((gap) => gap.segmentIndex)
    .sort((a, b) => a - b)

/** The segments emitted but never checked, as a sorted index list. */
export const notCheckedSegments = (gaps: readonly CoverageGap[]): readonly number[] =>
  gapsAt(gaps, "not_checked")
    .map((gap) => gap.segmentIndex)
    .sort((a, b) => a - b)

/**
 * The counts, computed in ONE pass from the outcomes rather than handed in.
 *
 * ## Why the caller does not supply them
 *
 * A caller that passed its own counts could pass counts that disagree with the list beside them, and
 * the disagreement is the fail-open direction: a report saying `verified: 40` beside forty `rejected`
 * rows is exactly the artefact this module exists to make impossible. So `segments`, `extracted` and
 * `checked` are read off the denominator, the outcome list and the same list again, and only the
 * three verdict tallies are accumulated — from the outcomes themselves.
 *
 * The client calls this ONCE, over the outcomes it accumulated across every chunk, which is what
 * makes an interrupted-and-resumed run byte-identical to an uninterrupted one: the report is a
 * function of the outcome list, and the outcome list is a function of the document.
 */
export const articleCountsOf = (
  segmentCount: number,
  outcomes: readonly SpanOutcome[],
): ArticleCounts => {
  let verified = 0
  let unverifiable = 0
  let rejected = 0
  for (const outcome of outcomes) {
    if (outcome.summary.verdict === "verified") verified += 1
    if (outcome.summary.verdict === "unverifiable") unverifiable += 1
    if (outcome.summary.verdict === "rejected") rejected += 1
  }
  return {
    segments: segmentCount,
    extracted: outcomes.length,
    checked: outcomes.length,
    verified,
    unverifiable,
    rejected,
  }
}

/**
 * The count invariants, as the list of violations. Empty means the report is internally consistent.
 *
 * Exported and pure so a test can plant a broken report and require this to fail, and so a renderer
 * can refuse to print one rather than print it with a shrug.
 */
export const articleCountViolations = (report: ArticleCoverageReport): readonly string[] => {
  const { counts, segmentCount, outcomes, gaps } = report
  const violations: string[] = []
  if (counts.segments !== segmentCount) violations.push(`counts.segments ${counts.segments} is not segmentCount ${segmentCount}`)
  if (counts.checked > counts.extracted) violations.push(`checked ${counts.checked} is above extracted ${counts.extracted}`)
  if (counts.extracted > counts.segments) violations.push(`extracted ${counts.extracted} is above segments ${counts.segments}`)
  if (counts.verified + counts.unverifiable + counts.rejected !== counts.checked) {
    violations.push("the verdict tallies do not sum to checked")
  }
  if (counts.extracted !== outcomes.length) violations.push(`extracted ${counts.extracted} is not outcomes.length ${outcomes.length}`)
  const emitted = new Set(outcomes.map((outcome) => outcome.segmentIndex))
  const seen = new Set<number>()
  for (const gap of gaps) {
    if (seen.has(gap.segmentIndex)) violations.push(`segment ${gap.segmentIndex} appears in gaps twice`)
    seen.add(gap.segmentIndex)
    if (emitted.has(gap.segmentIndex)) violations.push(`segment ${gap.segmentIndex} is both emitted and a gap`)
  }
  for (const outcome of outcomes) {
    if (outcome.summary.verdict === "verified" && outcome.suggestion !== null) {
      violations.push(`segment ${outcome.segmentIndex} is verified and carries a suggestion`)
    }
  }
  return violations
}

/** Bumped only when the artefact's published shape changes incompatibly. */
export const ARTICLE_ARTEFACT_SCHEMA_VERSION = 1

/**
 * One fixture's published figures in `data/eval/article-coverage.json`.
 *
 * ## Why the artefact carries COUNTS and not a ratio
 *
 * `selectionRecall` is the load-bearing number of this whole feature — it is what lets a reader tell
 * "we checked and found nothing" from "we never looked" — and it is published as the PAIR
 * `notExtracted` and `segments`. Two integers with the denominator beside them. A percentage-shaped
 * field would be refused here for the same reason `Relevance` refused `{matched, total}`: the
 * quotient is a score, and a score on a document of unknown reliability is exactly the number a judge
 * would quote without the conditions under which it was produced.
 *
 * `falseVerified` is here for the same honesty. A report whose selector emitted nothing reads
 * `verified: 0` for the wrong reason, so the figure a determinism test asserts against a baseline is
 * this count beside the span count beside it.
 */
export const ArticleArtefactCase = Schema.Struct({
  /** The fixture's id. Never its text: document text belongs in no artefact (AGENTS.md section 13). */
  id: Schema.String,
  /** `sha256Hex` of the document, so two reports can be compared without holding either document. */
  documentDigest: Schema.String,
  segments: Schema.Number,
  extracted: Schema.Number,
  checked: Schema.Number,
  verified: Schema.Number,
  unverifiable: Schema.Number,
  rejected: Schema.Number,
  /** Derived from the gap list at generation time, never stored beside the gap list itself. */
  notExtracted: Schema.Number,
})
export type ArticleArtefactCase = Schema.Schema.Type<typeof ArticleArtefactCase>

/**
 * The same seven counts with no identity, so a prose sentence can quote the aggregate without the
 * table. Declared rather than derived with `.pick` because the beta `Schema` seam has no pick, and a
 * hand-written intersection of the two shapes would be a second declaration (AGENTS.md section 17).
 */
export const ArticleTotals = Schema.Struct({
  segments: Schema.Number,
  extracted: Schema.Number,
  checked: Schema.Number,
  verified: Schema.Number,
  unverifiable: Schema.Number,
  rejected: Schema.Number,
  notExtracted: Schema.Number,
})
export type ArticleTotals = Schema.Schema.Type<typeof ArticleTotals>

/**
 * The committed selection-recall artefact.
 *
 * ## Why `falseVerifiedDelta` is computed here and nowhere else
 *
 * A delta needs two numbers, and a test that computed its own baseline would be asserting a number
 * against itself. So the artefact holds the recorded counts and `falseVerifiedDelta` is the signed
 * difference a run measures against them — which means a figure a judge reads has a committed
 * counterparty and `check:docs` has something to compare a prose sentence against (AGENTS.md 17).
 */
export const ArticleCoverageArtefact = Schema.Struct({
  schemaVersion: Schema.Literal(ARTICLE_ARTEFACT_SCHEMA_VERSION),
  generatedBy: Schema.String,
  /**
   * What the figures were measured against.
   *
   * A fingerprint rather than a corpus hash, because the corpus-free lane runs with no corpus at all,
   * and a hash of nothing would read as a measurement of an empty snapshot. The fingerprint names the
   * harness instead, so a figure with no corpus behind it is legible as such.
   */
  corpusFingerprint: Schema.String,
  /** Aggregate across every fixture, so a prose sentence can quote one figure rather than a table. */
  totals: ArticleTotals,
  cases: Schema.Array(ArticleArtefactCase),
  /**
   * The conditions every figure here was produced under, in the document itself.
   *
   * A latency or coverage figure with no conditions block is not a measurement, it is a number
   * (ADR-13). Carrying them in the artefact rather than in the prose is what makes the prose
   * checkable: `docs/specs/measurements.md` holds the same discipline for the corpus figures.
   */
  conditions: Schema.Struct({
    corpus: Schema.String,
    provider: Schema.String,
    selector: Schema.String,
    runsCompared: Schema.Number,
  }),
})
export type ArticleCoverageArtefact = Schema.Schema.Type<typeof ArticleCoverageArtefact>

/**
 * `falseVerifiedDelta`: this run's verified count minus the baseline's.
 *
 * Signed rather than absolute, so a movement in EITHER direction is visible. A drop would be a
 * containment regression dressed as an improvement and an absolute value would hide it.
 */
export const falseVerifiedDeltaOf = (current: number, baseline: number): number => current - baseline

export * as ArticleCoverage from "./article-coverage.ts"
