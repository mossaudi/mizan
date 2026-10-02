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
export { canonicalJson } from "./json.ts"
export { elapsedMs, isExpired, nowIso, startDeadline, withDeadline, withDeadlineResult, type Deadline } from "./time.ts"

export { matchesExactly, normalize, normalizeForMatch, normalizeForRender, normalizeForTerminal, isNonBlank } from "./normalize/normalize.ts"
export { BIDI_CONTROL_MARKS, COMBINING_MARKS, FOLD_PIPELINE, FOLD_STAGE_NOTES, type FoldStage } from "./normalize/fold-table.ts"
export { displayWidth, isBareControl, stripTerminalControls, ESC, ZERO_WIDTH } from "./normalize/terminal.ts"

export { decodeOrFail, decodeSync, describeDecodeFailure, type Decodable, type DecodeFailure } from "./schema/decode.ts"
export { ANCHOR_PROTOCOL_VERSION, AnchorAdjudication, AnchorAdjudicationSet, AnchorSpan } from "./schema/anchor.ts"
export { Answer, Citation, Claim, emptyClaim } from "./schema/claim.ts"
export { BaselineDeclaration, BenchmarkOutcome, BenchmarkResult, BENCHMARK_SCHEMA_VERSION, HONEST_BASELINE, PRE_REGISTERED_HYPOTHESIS, METHOD_NOT_PUBLISHED, PEER_REGISTER_VERSION, PeerFigure, PeerMethod, PeerRegister, peerStatesAFigure } from "./schema/benchmark.ts"
export { COVERAGE_SCHEMA_VERSION, CollectionCoverage, CoverageTotals, QuarantineCoverage, SourceCoverage } from "./schema/coverage.ts"
export { Correction, CorrectionSpan, LocatedCorrection, Relevance, RelevanceState, UnverifiableCorrection } from "./schema/display.ts"
export { DEMO_ANCHOR_SET_VERSION, DEMO_QUESTION_SET_VERSION, DemoAnchor, DemoAnchorSet, DemoExpectation, DemoQuestion, DemoQuestionSet } from "./schema/demo.ts"
export { DivergenceResolution, EvalAnchor, EvalCase, EvalSet, KnownDivergence } from "./schema/eval.ts"
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
  badgeFor,
  evidenceIsPresent,
  exactMatchStrength,
  noMatchStrength,
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
