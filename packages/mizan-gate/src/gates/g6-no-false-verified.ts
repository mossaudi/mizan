import { findMatchingLines, productionFiles, type Finding, type SourceFile } from "../scan.ts"
import type { ClaimVerdict } from "@mizan/core"

/**
 * G-6 — no false `verified`. The acceptance metric, as an invariant.
 *
 * The AT's target is "zero false `verified`" across 100 adversarial queries. A statistical
 * target needs a statistical test, which is what `packages/mizan-verify/test` is; but the
 * cheap half of the guarantee is structural, and this gate is it:
 *
 *  - **G-6.1 one construction site.** A `verdict: "verified"` property may only be written in
 *    `verify.ts` — the single function whose entire body is the containment decision. A
 *    comparison (`=== "verified"`) is allowed anywhere, because deciding what to do about a
 *    verdict is not the same as inventing one.
 *  - **G-6.2 one schema site.** `Schema.Literal("verified")` may only appear in the verdict
 *    schema, so the wire contract and the decision cannot drift apart.
 *  - **G-6.3 no computed percentage.** `percent:` may appear nowhere outside the two files
 *    that own the two match shapes. This is the rule that would fail if someone threaded a
 *    similarity score into `MatchStrength` — the CWE-345 hole wearing a decimal point.
 *  - **G-6.4 no ad-hoc match strength.** `matchStrength:` must be one of the two constants
 *    or a schema literal, never a value computed at the call site.
 *
 * `assertNoFalseVerified` is the dynamic half: a pure invariant checker the CLI, the CI job
 * and the tests can all run over any verdict array, including a forged one.
 */

/** The only file allowed to write a `verified` verdict, and one of the two allowed to mention a percent. */
export const VERDICT_CONSTRUCTION_SITES = ["packages/mizan-verify/src/verify.ts"] as const
export const PERCENT_OWNERS = ["packages/mizan-verify/src/verify.ts", "packages/mizan-core/src/schema/verdict.ts"] as const
export const VERDICT_SCHEMA_OWNER = "packages/mizan-core/src/schema/verdict.ts"

export const inAny = (path: string, owners: readonly string[]): boolean => owners.includes(path)

/**
 * Object-literal position only, and not a type annotation.
 *
 * The lookbehind skips `readonly x: T` members. A type declaration like
 * `readonly verdict: "verified" | "unverifiable"` in `coerce.ts` NAMES the three verdicts; it
 * cannot produce one. Excluding it by position rather than by adding `coerce.ts` to an
 * allowlist is the difference between a precise rule and a hole: a real `verdict: "verified"`
 * object literal in that same file is still reported.
 */
const VERDICT_LITERAL = /(?<!readonly )verdict\s*:\s*["']verified["']/

/**
 * Match-strength values that are permitted at an assignment.
 *
 * `MatchStrength` appears in this list because it is a TYPE name and `tsc` rejects a type used
 * in value position — so allowing the token costs nothing and removes the false positive from
 * `readonly matchStrength: MatchStrength` type annotations. `tsc --noEmit` runs in CI, which
 * is what makes that carve-out safe rather than merely convenient.
 */
const MATCH_STRENGTH_ALLOWED = "(?:exactMatchStrength|noMatchStrength|MatchStrength|Schema\\.)"

/**
 * The negative lookahead puts the whitespace INSIDE it, and that is load-bearing.
 *
 * The obvious form — `matchStrength\s*:\s*(?!exactMatchStrength|...)` — is broken by
 * backtracking: `\s*` gives back the space to satisfy the match, the lookahead is then
 * evaluated at a position starting with `" "`, which does not begin with `noMatchStrength`, so
 * the negative lookahead SUCCEEDS and every allowlisted assignment is reported. The rule was
 * flagging the two constants it exists to permit, and a rule that reports correct code gets
 * deleted rather than fixed.
 */
export const MATCH_STRENGTH_RULE = new RegExp(`matchStrength\\s*:(?!\\s*${MATCH_STRENGTH_ALLOWED})`)

export const checkOneConstructionSite = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-6", "G-6.1 one-construction-site", productionFiles(files), VERDICT_LITERAL, "code+strings").filter(
    (finding) => !inAny(finding.path, VERDICT_CONSTRUCTION_SITES),
  )

export const checkOneSchemaSite = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-6", "G-6.2 one-schema-site", productionFiles(files), /Schema\.Literal\(["']verified["']\)/, "code+strings").filter(
    (finding) => finding.path !== VERDICT_SCHEMA_OWNER,
  )

export const checkNoComputedPercent = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-6", "G-6.3 no-computed-percent", productionFiles(files), /percent\s*:/).filter(
    (finding) => !inAny(finding.path, PERCENT_OWNERS),
  )

export const checkNoAdHocMatchStrength = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-6", "G-6.4 no-ad-hoc-match-strength", productionFiles(files), MATCH_STRENGTH_RULE).filter(
    (finding) => !inAny(finding.path, PERCENT_OWNERS),
  )

/**
 * The dynamic invariant. Every `verified` in a report must carry the exact-containment
 * reason, the exact match shape, and real evidence; and a `verified` may never appear
 * alongside a `none` match strength.
 *
 * Returns a list of human-readable violations, empty when the report is honest.
 */
export const assertNoFalseVerified = (verdicts: readonly ClaimVerdict[]): readonly string[] => {
  const violations: string[] = []
  verdicts.forEach((verdict) => {
    if (verdict.verdict !== "verified") {
      if (verdict.evidence !== null) violations.push(`${verdict.claimId}: non-verified verdict carries evidence`)
      return
    }
    if (verdict.reason !== "exact_containment") violations.push(`${verdict.claimId}: verified with reason ${verdict.reason}`)
    if (verdict.matchStrength.kind !== "exact") violations.push(`${verdict.claimId}: verified with match strength ${verdict.matchStrength.kind}`)
    if (verdict.matchStrength.kind === "exact" && verdict.matchStrength.percent !== 100) {
      violations.push(`${verdict.claimId}: verified at percent ${verdict.matchStrength.percent}`)
    }
    if (verdict.evidence === null) violations.push(`${verdict.claimId}: verified with no evidence`)
    if (verdict.evidence !== null && verdict.evidence.matchedChars !== verdict.evidence.quoteChars) {
      violations.push(`${verdict.claimId}: verified with a partial match (${verdict.evidence.matchedChars}/${verdict.evidence.quoteChars})`)
    }
  })
  return violations
}

export const gateNoFalseVerified = (files: readonly SourceFile[]): readonly Finding[] => [
  ...checkOneConstructionSite(files),
  ...checkOneSchemaSite(files),
  ...checkNoComputedPercent(files),
  ...checkNoAdHocMatchStrength(files),
]

export * as G6 from "./g6-no-false-verified.ts"
