import { findMatchingLines, importClosure, productionFiles, type Finding, type SourceFile } from "../scan.ts"
import { tokenPattern } from "../token-pattern.ts"

/**
 * G-2 — no raw-HTML sinks, and `verify.ts` may not reach the display-only diagnostic.
 *
 * Two rules:
 *
 *  - **G-2.1 no raw-HTML sink.** No `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
 *    `dangerouslySetInnerHTML`, `{@html`, `v-html`, `document.write`. Corpus text is data we
 *    fetched from the internet and then hand to a browser; a raw-HTML sink is the A03 path
 *    from "someone's hadith" to script execution. A text node is not a sanitiser we have to
 *    keep in sync — it is not a sanitiser at all.
 *  - **G-2.2 verdict isolation.** `verify.ts` may not import `src/diagnostics/`. The
 *    longest-run diagnostic is display-only, and the separation between "a number a human
 *    reads" and "a number that changes a verdict" is only real if the compiler enforces it.
 *    This is the rule that makes the containment claim in `AGENTS.md` section 10 checkable
 *    rather than aspirational.
 */

const HTML_SINKS = [
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "dangerouslySetInnerHTML",
  "document.write",
  "document.writeln",
  "{@html",
  "v-html",
  "bypassSecurityTrustHtml",
  "createContextualFragment",
] as const

const tokenRules = (tokens: readonly string[]): RegExp => tokenPattern(tokens, { allowSuffix: false })

export const VERIFY_ENTRY = "packages/mizan-verify/src/verify.ts"

export const checkNoRawHtml = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-2", "G-2.1 no-raw-html", productionFiles(files), tokenRules(HTML_SINKS))

/**
 * G-2.2 verdict isolation: nothing on the path from `verify.ts` to a verdict may import the
 * display-only diagnostic.
 *
 * The scope is the transitive import CLOSURE of `verify.ts`, not the whole repository. Two
 * reasons, and the second is the important one:
 *
 *  - `packages/mizan-verify/src/index.ts` re-exports the longest-run diagnostic deliberately, so
 *    a display surface can render it. A whole-tree rule flags that documented export, and a
 *    rule that flags correct code is a rule that gets deleted.
 *  - the closure is the real invariant. Adding a helper that `verify.ts` imports cannot smuggle
 *    the diagnostic in, so the rule stays total for the thing it protects.
 */
export const checkVerdictIsolation = (files: readonly SourceFile[]): readonly Finding[] => {
  const verdictPath = importClosure(productionFiles(files), VERIFY_ENTRY)
  return findMatchingLines("G-2", "G-2.2 verdict-isolation", verdictPath, /from\s*["'][^"']*diagnostics[^"']*["']/, "code+strings")
}

export const gateNoRawHtml = (files: readonly SourceFile[]): readonly Finding[] => [
  ...checkNoRawHtml(files),
  ...checkVerdictIsolation(files),
]

export * as G2 from "./g2-no-raw-html.ts"
