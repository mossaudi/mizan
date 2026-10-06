/**
 * `@mizan/core` — contracts, the Arabic fold table, `Result`, typed errors, hashing
 * and deadlines.
 *
 * What this package must never contain, per the architecture: any I/O, any model
 * call, any corpus data. It is a leaf that everything else may depend on, which is
 * what makes `mizan-verify` isolatable — the differentiator declares exactly one
 * dependency, and that dependency is this.
 *
 * Where a name is both a schema (a value) and a contract (a type), the single
 * re-export carries both meanings, so `CorpusRecord` is usable as a type and as a
 * `Schema.Struct` with no alias to keep in sync.
 */

export { err, errorTag, describeError, flatMap, isErr, isOk, mapError, mapResult, ok, unwrapOrThrow, type Result } from "./result.ts"
export type {
  CorpusError,
  ErrorOfKind,
  GateError,
  MizanError,
  ProviderError,
  ProvenanceError,
  RetrievalError,
  VerifyError,
} from "./errors.ts"
export { CHAIN_SEPARATOR, GENESIS_PREV_HASH, chainHash, isSha256Hex, sha256Hex, shortHash } from "./hash.ts"
export { DATASET_DIGEST_VERSION, digestOf, identityMismatch, isDatasetDigest } from "./hash/dataset-identity.ts"
export { canonicalJson } from "./json.ts"
export { elapsedMs, isExpired, nowIso, startDeadline, withDeadline, withDeadlineResult, type Deadline } from "./time.ts"

export { matchesExactly, normalize, normalizeForMatch, normalizeForRender, normalizeForTerminal, isNonBlank } from "./normalize/normalize.ts"
export { BIDI_CONTROL_MARKS, COMBINING_MARKS, FOLD_PIPELINE, FOLD_STAGE_NOTES, type FoldStage } from "./normalize/fold-table.ts"
export { MAX_QUOTE_CHARS, MAX_RECORD_CHARS } from "./normalize/bounds.ts"
export { displayWidth, isBareControl, stripTerminalControls, ESC, ZERO_WIDTH } from "./normalize/terminal.ts"

export { decodeOrFail, decodeSync, describeDecodeFailure, type Decodable, type DecodeFailure } from "./schema/decode.ts"
export { ANCHOR_PROTOCOL_VERSION, AnchorAdjudication, AnchorAdjudicationSet, AnchorSpan } from "./schema/anchor.ts"
export { Answer, Citation, Claim, emptyClaim, normalizeQuote } from "./schema/claim.ts"
export { BaselineDeclaration, BenchmarkOutcome, BenchmarkResult, BENCHMARK_SCHEMA_VERSION, HONEST_BASELINE, PRE_REGISTERED_HYPOTHESIS, METHOD_NOT_PUBLISHED, PEER_REGISTER_VERSION, PeerFigure, PeerMethod, PeerRegister, peerStatesAFigure } from "./schema/benchmark.ts"
export { COVERAGE_SCHEMA_VERSION, CollectionCoverage, CoverageTotals, QuarantineCoverage, SourceCoverage } from "./schema/coverage.ts"
export { Correction, CorrectionSpan, LocatedCorrection, NearbyRecord, Relevance, RelevanceState, SUGGESTION_DISCLAIMER, SUGGESTION_MEASURED_COLLECTIONS, SUGGESTION_MEASUREMENT_SCOPE, SUGGESTION_THIN_COLLECTIONS, Suggestion, SuggestionCandidates, SuggestionNoCandidates, SuggestionScope, SuggestionUnavailable, UnverifiableCorrection, type SuggestionState } from "./schema/display.ts"
export { DEMO_ANCHOR_SET_VERSION, DEMO_QUESTION_SET_VERSION, DemoAnchor, DemoAnchorSet, DemoExpectation, DemoQuestion, DemoQuestionSet } from "./schema/demo.ts"
export { CollectionCoverageRow, DivergenceResolution, EvalAnchor, EvalCase, EvalSet, KnownDivergence } from "./schema/eval.ts"
export { DegradationCondition, conditionOf, decodeCondition, describedConditions, describeCondition } from "./schema/degradation.ts"
export { ResolvedCitation, unresolved } from "./schema/resolved.ts"
export { SSR_SCHEMA_VERSION, SsrResult } from "./schema/ssr.ts"
export { CorpusRecord, CorpusRecordMeta, GradeBasis, QURAN_COLLECTION, toRecordMeta } from "./schema/record.ts"
export {
  LicenceClass,
  SourceDescriptor,
  SourceRegistry,
  REQUIRED_LICENCE_FIELDS,
  requiresVerbatimText,
} from "./schema/source.ts"
export {
  ClaimVerdict,
  DegradeReason,
  EvidenceRef,
  MatchStrength,
  VERDICT_BADGE,
  Verdict,
  VerdictReason,
  VerdictReport,
  VerdictSummary,
  badgeFor,
  evidenceIsPresent,
  exactMatchStrength,
  noMatchStrength,
  summariseVerdict,
} from "./schema/verdict.ts"
export {
  ChainHead,
  ClaimSummary,
  Escalation,
  RankingMode,
  RunTrace,
  RunTraceDraft,
  Timings,
  ToolCall,
  TRACE_SCHEMA_VERSION,
  TRANSCRIPT_LABEL,
  TranscriptKind,
  sealTrace,
  summariseClaim,
  traceChainHead,
  traceDigest,
  transcriptLabel,
} from "./schema/trace.ts"

export {
  SUPPORTED_LANGUAGES,
  LANGUAGE_COUNT,
  detectLanguage,
  detectLanguageWithBasis,
  isSupportedLanguage,
  isRtlLanguage,
  getLanguage,
  validateQuestion,
  processQuestion,
  rtlLanguages,
  ltrLanguages,
  type Detection,
  type DetectionBasis,
  type Language,
} from "./i18n.ts"
