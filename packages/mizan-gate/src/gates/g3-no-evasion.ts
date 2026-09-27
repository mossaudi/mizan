import { findMatchingLines, productionFiles, type Finding, type SourceFile } from "../scan.ts"
import { tokenPattern } from "../token-pattern.ts"

/**
 * G-3 — no evasion, and the donor workaround stays deleted.
 *
 * Four rules:
 *
 *  - **G-3.1 no dynamic evaluation.** `eval`, `new Function`, `execScript`. A verifier built
 *    out of string-built code is a verifier whose logic cannot be reviewed.
 *  - **G-3.2 no encoding-based obfuscation.** `atob`, `btoa`, `fromCharCode`, `unescape`.
 *    Legitimate UTF-8 handling uses `TextEncoder`; base64 round-trips in this repository
 *    exist only to hide something.
 *  - **G-3.3 no anti-analysis.** `debugger`, `navigator.webdriver`, `NODE_ENV` sniffing
 *    outside a build script. Code that changes behaviour when it believes it is being
 *    observed is not code a judge can evaluate.
 *  - **G-3.4 no donor workaround.** The upstream project shipped a WAN-rotation "network
 *    recovery" module and called it from the workflow phase-delegate hook. `mizan` copies
 *    none of it, and this rule is what keeps the copy from creeping back in: any surviving
 *    reference to `network-recovery` / `rotateWan` is a build failure, not a code comment.
 *
 * Remediation is structural, not behavioural: nothing in this product is supposed to
 * attempt an evasion, so the only enforcement available is "the code is not there".
 */

const DYNAMIC_EVAL = ["eval(", "new Function(", "execScript", "Function(\"return"] as const
const OBFUSCATION = ["atob(", "btoa(", "fromCharCode", "unescape(", "decodeURI(", "Buffer.from("] as const
const ANTI_ANALYSIS = ["debugger", "webdriver", "headless", "puppeteer", "playwright"] as const

/** Names of the removed donor module and its call site. */
export const DONOR_TOKENS = ["network-recovery", "networkRecovery", "rotateWan", "wanRotation", "recoverNetwork"] as const

export const checkNoDynamicEval = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-3", "G-3.1 no-dynamic-eval", productionFiles(files), tokenPattern(DYNAMIC_EVAL, { allowSuffix: false }))

export const checkNoObfuscation = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-3", "G-3.2 no-obfuscation", productionFiles(files), tokenPattern(OBFUSCATION, { allowSuffix: false }))

export const checkNoAntiAnalysis = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-3", "G-3.3 no-anti-analysis", productionFiles(files), tokenPattern(ANTI_ANALYSIS))

export const checkNoDonorWorkaround = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-3", "G-3.4 no-donor-workaround", productionFiles(files), tokenPattern(DONOR_TOKENS, { allowSuffix: false }))

export const gateNoEvasion = (files: readonly SourceFile[]): readonly Finding[] => [
  ...checkNoDynamicEval(files),
  ...checkNoObfuscation(files),
  ...checkNoAntiAnalysis(files),
  ...checkNoDonorWorkaround(files),
]

export * as G3 from "./g3-no-evasion.ts"
