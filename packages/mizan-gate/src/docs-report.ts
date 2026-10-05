import type { AuditTier, DocsCheckResult } from "./docs-check.ts"

/**
 * How the claim sweep reads to a human, as one owner for the wording.
 *
 * ## Why this is a module and not a `console.error` in the script
 *
 * `scripts/check-docs-claims.ts` used to build its failure report inline, at the bottom of a function
 * that also located the repository and called `process.exit` at module scope. That made the report
 * untestable: a test could only transcribe the template and assert against its own transcription,
 * which is a tautology — the printer could print `[rule] file` and the test would still pass, because
 * the test never called the printer.
 *
 * The failure report is the one output of this repository that a person acts on. If it names a stale
 * number but not the rule, or not the artefact it should match, the next person has to guess which of
 * the two latency documents drifted and against what — and a finding nobody can act on is a finding
 * that gets suppressed with a `// check:docs is wrong` comment. So the format is a pure function here,
 * the script only prints it, and the integration test asserts against the real thing.
 *
 * ## Why this returns lines rather than a string
 *
 * A caller may want to prefix each line, colour it, or send it to `process.stderr` one line at a time.
 * Returning a joined string would make the first of those impossible without re-splitting on `\n`, and
 * a detail containing a newline would then break the split.
 *
 * ## What a finding may contain
 *
 * Paths, rule ids, integers, hashes and a fixed phrase or two. Never corpus text: this string reaches
 * a build log, and a decoded failure detail can quote the value that failed (AGENTS.md §13).
 */
export const formatDocsFailure = (result: DocsCheckResult): readonly string[] => [
  `check:docs FAILED — ${result.claims.length} documented claim(s) disagree with the repository.`,
  "",
  ...result.claims.map((found) => `  [${found.rule}] ${found.file}: ${found.detail}`),
  "",
  "  These are claims a judge would rely on. Fix the document, or implement what it",
  "  describes — do not delete the claim, because the drift it records was real.",
]

/** How a tier is described in the coverage report, in the order a reader should see them. */
export const TIER_CAPTION: Readonly<Record<AuditTier, string>> = {
  document: "audited document — the full claim-rule set",
  surface: "corpus surface — R15, plus the gate-count and ADR sweep",
  evidence: "evidence — read as the authority a rule judges a document against, not audited",
}

/**
 * The passing report, tier by tier.
 *
 * ## Why the counts are three and not one
 *
 * The report used to print one flat "27 files audited" over a list whose entries had received very
 * different treatment: judge-facing documents ran the full rule set, corpus surfaces received exactly
 * one rule, and artefacts were read only as the authority a rule judges a document against. A tool
 * whose whole purpose is to stop the repository overstating coverage was overstating its own, and a
 * judge skimming the output would have taken that at face value. Three counts, and each file listed
 * with the tier it was read at, is a report a reader can audit against what the rules actually do.
 *
 * `swept` is a fourth number because it is a different scope again: the whole-tree gate-count and ADR
 * sweep, which is neither an audit nor a corpus surface.
 */
export const formatDocsSuccess = (result: DocsCheckResult): readonly string[] => {
  const at = (tier: AuditTier): number => result.checked.filter((entry) => entry.tier === tier).length
  const headline = `check:docs OK — ${at("document")} audited documents, ${at("surface")} corpus surfaces, ${at("evidence")} evidence artefacts read; ${result.swept} files swept for gate-count and ADR citations.`
  const listed = (["document", "surface", "evidence"] as const).flatMap((tier) => {
    const paths = result.checked.filter((entry) => entry.tier === tier).map((entry) => entry.path)
    if (paths.length === 0) return []
    return [`  ${TIER_CAPTION[tier]}: ${paths.join(", ")}`]
  })
  return [headline, "  no claim disagrees with the repository.", ...listed]
}

export * as DocsReport from "./docs-report.ts"