/**
 * `@mizan/gate` — the machine-checked invariants. This package is the actual deliverable;
 * the verifier is only the most visible part of it.
 *
 * Every gate is a pure function from source text to findings, so each one has a self-test
 * that plants a violation and requires the gate to fail. A guard that cannot fail is not a
 * guard (AGENTS.md section 14).
 */

export { collectSourceFiles, collectSourceFilesSync, formatFindings, findMatchingLines, repoPath, underPrefix, withoutGateSelf, GATE_SELF_PREFIX, CODE_EXTENSIONS, type Finding, type GateId, type ScanMode, type SourceFile } from "./scan.ts"
export { stripComments, stripCommentsOnly } from "./strip-comments.ts"
export { tokenPattern, type TokenPatternOptions } from "./token-pattern.ts"
export { gateNoSimilarity, checkDependencyIsolation, checkNoSimilarity, checkNoAmbientAuthority, checkContainmentOnly, SIMILARITY_TOKENS, AMBIENT_AUTHORITY_TOKENS, INCLUDES_ALLOWLIST, VERIFY_PREFIX } from "./gates/g1-no-similarity.ts"
export { gateNoRawHtml, checkNoRawHtml, checkVerdictIsolation, VERIFY_ENTRY } from "./gates/g2-no-raw-html.ts"
export { gateNoEvasion, checkNoDynamicEval, checkNoObfuscation, checkNoAntiAnalysis, checkNoDonorWorkaround, DONOR_TOKENS } from "./gates/g3-no-evasion.ts"
export { runGitleaks, GITLEAKS_ARGS, GITLEAKS_MISSING_MESSAGE, GITLEAKS_VERSION, type GitleaksResult } from "./gates/g4-gitleaks.ts"
export {
  checkBacktickedPaths,
  checkDocumentedScripts,
  checkEnvVars,
  checkRegistryClaims,
  claim,
  LICENCE_CLASSES,
  type DocsClaim,
  type DocsRule,
} from "./docs-claims.ts"
export { checkedPaths, runDocsClaimChecks, AUDITED_DOCUMENTS, BENCHMARK_ARTEFACT, DEMO_RUNBOOK, GITIGNORE, REQUIRED_DOCUMENTS, ATTESTATION, ENV_EXAMPLE, GOLDEN_EVAL, PROVIDER_SOURCE, REDTEAM_EVAL, REGISTRY, VALUE_PROOF, type AuditTier, type CheckedFile, type DocsCheckResult } from "./docs-check.ts"
export { formatDocsFailure, formatDocsSuccess, TIER_CAPTION } from "./docs-report.ts"
export { checkAnswerQualityClaim, checkBenchmarkClaimUnbacked, isRate, ANSWER_QUALITY_PHRASES, QUANTITIES, benchmarkScope, figuresIn, groupFigure, renderingsOf, statementBacking, type ExternalFigure, type Quantity, type StatedBenchmark } from "./docs-value.ts"
export { checkExternalClaimUnbacked, externalClaimFigures, EXTERNAL_CLAIMS_PATH, type FigurePromise } from "./docs-external.ts"
export { checkExecutorLabelBlindness, EXECUTOR_PATH, LABEL_TOKENS } from "./docs-benchmark.ts"
export { checkVerdictPolarityInverted, LOCATED_VERDICT, POLARITY_REASONS, UNLOCATED_VERDICT } from "./docs-polarity.ts"
export { ADR_DIRECTORY, ADR_PATTERN, checkAdrCitationUnresolved, checkAdrDocument } from "./docs-adr.ts"
export { ABSENT_COLLECTION, COVERAGE, CORPUS_SURFACE_EXTENSIONS, CORPUS_SURFACE_ROOTS, NAMES, NEGATED_COVERAGE, RENUNCIATION, RENOUNCED, checkCorpusAbsenceUnstated, checkCorpusPresenceContradiction, checkServedCollectionsNamed, unnamedCollections } from "./docs-corpus.ts"
export { isDeclaredGenerated } from "./docs-generated.ts"
export { checkRunbookOrder, KEYED_LIVE_PATH, REPLAY_PATH } from "./docs-runbook.ts"
export { checkGateCountClaim, extractGateCountClaims, tokenToNumber, GATE_CLAIM_EXCLUDES, GATE_CLAIM_EXTENSIONS, type GateCountClaim } from "./docs-gates.ts"
export { checkSnapshotArithmetic } from "./docs-snapshot.ts"
export { checkEvalBreadth, type StatedSet } from "./docs-artifacts.ts"
export { checkLiveProviderClaim } from "./docs-egress.ts"
export { checkLicenceFields, REGISTRY_PATH } from "./gates/g5-licence-fields.ts"
export { gateNoFalseVerified, assertNoFalseVerified, checkOneConstructionSite, checkOneSchemaSite, checkNoComputedPercent, checkNoAdHocMatchStrength, checkVerdictPathClosure, VERDICT_PATH, VERDICT_PATH_ENTRY, VERDICT_CONSTRUCTION_SITES, PERCENT_OWNERS } from "./gates/g6-no-false-verified.ts"
export { gateVerdictPathPurity, checkAnchorModuleHasNoOpinion, checkNoSimilarityOnPath, checkNoAmbientAuthorityOnPath, checkNoPercentKeyOnPath, checkNoAppCodeOnPath, checkDisplayPathPresent, checkRelevanceModuleHasNoOutcome, checkSuggestPackageIsLeaf, checkSuggestPackageNamesNoOutcome, checkSuggestPackageReachesNoVerdictPath, checkSuggestPackageHasNoAmbientAuthority, checkDisplayContractNumbers, ANCHOR_MODULE, ANCHOR_BANNED_WORD, DISPLAY_CONTRACT_NUMBERS, DISPLAY_PATH, DISPLAY_SCHEMA_MODULE, PERCENT_KEY_RULE, PERCENT_KEY_TOKENS, RELEVANCE_BANNED_WORDS, RELEVANCE_MODULE, SUGGEST_ALLOWED_SPECIFIER, SUGGEST_IMPORT_RULE, SUGGEST_PATH } from "./gates/g7-verdict-path-purity.ts"
export { runGates, summariseOutcomes, GATE_IDS, HIGHEST_GATE_ID, type GateOutcome, type RunGatesOptions } from "./run-gates.ts"
export {
  CHECK_NAMES,
  CHECK_BUDGET_MS,
  buildReport,
  checkCommand,
  discoverPackages,
  resolveToolchain,
  runCi,
  runPackageChecks,
  summariseReport,
  type CheckName,
  type CheckOutcome,
  type CiReport,
  type ExtraPlan,
  type PackageOutcome,
  type PackagePlan,
  type Toolchain,
} from "./ci.ts"
export { findRepositoryRoot, findRoot, requireRepositoryRoot } from "./repo-root.ts"
