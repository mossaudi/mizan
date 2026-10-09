/**
 * `@mizan/verify` — the differentiator.
 *
 * One dependency: `@mizan/core`. No provider, no vector store, no embedding, no
 * edit-distance, no fuzzy matching, no network, no clock, no randomness, no locale.
 * Every route to a `verified` verdict terminates in `steps/containment.ts`.
 *
 * `src/diagnostics/` holds the display-only longest-run diagnostic and the display-only
 * closeness floor that decides which records the suggestion list may print. Both are
 * exported so the report can render them, and gate **G-1** fails the build if `verify.ts`
 * imports them. That separation is the point: a judge should see how close a `rejected`
 * quote came, and no code path should be able to convert that number into a verdict.
 *
 * `steps/anchor.ts` is the second, non-`verified` route: it answers "is this abridgement
 * in the record we already resolved?" with a span or with nothing. Gate **G-7** fails the
 * build if that file so much as names an outcome, and if any percentage-shaped field
 * appears anywhere in the verdict path's import closure.
 */

export { containsQuote, foldQuote, type ContainmentResult } from "./steps/containment.ts"
export { capCitations, resolutionKey, MAX_CITATIONS_PER_CLAIM, type CappedCitations } from "./steps/citations.ts"
export type { ResolvedCitation } from "@mizan/core"
export { coerceClaimVerdict, coerceFailClosed, evidenceIsConsistent, type CoerceInput } from "./steps/coerce.ts"
export { anchorFrom, appearsInOrder, locateAnchor, ANCHOR_MIN_WORDS, ANCHOR_MAX_WORDS, ANCHOR_MAX_CHARS, type OrderedRun } from "./steps/anchor.ts"
export { verifyAnswer, type VerifyInput } from "./verify.ts"
export { computeSsr, segmentSentences } from "./ssr.ts"
export {
  DOCUMENT_TOO_LARGE,
  MAX_DOCUMENT_CHARS,
  checkDocumentCap,
  chunkWindow,
  documentDigestOf,
  segmentDocument,
  type DocumentRefusal,
} from "./document-segments.ts"
export { selectSpans, type SelectedSpan, type SelectionGap, type SelectionResult } from "./select-spans.ts"
export {
  ARTICLE_RED_TEAM_FIXTURES,
  HALLMARK_TYPES,
  RED_TEAM_FIXTURES,
  type ArticleRedTeamFixture,
  type DifficultyTier,
  type HallmarkType,
  type RedTeamFixture,
} from "./red-team.ts"
export { longestRunFor, locatedSpanFor, type LongestRun, type LocatedSpan } from "./diagnostics/longest-run.ts"
export {
  MIN_SHARED_RUN_CHARS,
  runClearsFloor,
  runClearsFloorAt,
  sharedRunOf,
  type SharedRun,
} from "./diagnostics/nearest-floor.ts"
