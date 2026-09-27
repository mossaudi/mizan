/**
 * `@mizan/gate` — the machine-checked invariants. This package is the actual deliverable;
 * the verifier is only the most visible part of it.
 *
 * Every gate is a pure function from source text to findings, so each one has a self-test
 * that plants a violation and requires the gate to fail. A guard that cannot fail is not a
 * guard (AGENTS.md section 14).
 */

export { collectSourceFiles, formatFindings, findMatchingLines, repoPath, underPrefix, withoutGateSelf, GATE_SELF_PREFIX, CODE_EXTENSIONS, type Finding, type GateId, type ScanMode, type SourceFile } from "./scan.ts"
export { stripComments, stripCommentsOnly } from "./strip-comments.ts"
export { tokenPattern, type TokenPatternOptions } from "./token-pattern.ts"
export { gateNoSimilarity, checkDependencyIsolation, checkNoSimilarity, checkNoAmbientAuthority, checkContainmentOnly, SIMILARITY_TOKENS, AMBIENT_AUTHORITY_TOKENS, INCLUDES_ALLOWLIST, VERIFY_PREFIX } from "./gates/g1-no-similarity.ts"
export { gateNoRawHtml, checkNoRawHtml, checkVerdictIsolation, VERIFY_ENTRY } from "./gates/g2-no-raw-html.ts"
export { gateNoEvasion, checkNoDynamicEval, checkNoObfuscation, checkNoAntiAnalysis, checkNoDonorWorkaround, DONOR_TOKENS } from "./gates/g3-no-evasion.ts"
export { runGitleaks, GITLEAKS_ARGS, GITLEAKS_MISSING_MESSAGE, type GitleaksResult } from "./gates/g4-gitleaks.ts"
export { checkLicenceFields, REGISTRY_PATH } from "./gates/g5-licence-fields.ts"
export { gateNoFalseVerified, assertNoFalseVerified, checkOneConstructionSite, checkOneSchemaSite, checkNoComputedPercent, checkNoAdHocMatchStrength, VERDICT_CONSTRUCTION_SITES, PERCENT_OWNERS } from "./gates/g6-no-false-verified.ts"
export { runGates, summariseOutcomes, type GateOutcome, type RunGatesOptions } from "./run-gates.ts"
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
