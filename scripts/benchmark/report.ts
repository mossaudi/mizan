import { type BaselineDeclaration, type BenchmarkResult } from "@mizan/core"
import type { Figures } from "./score.ts"

/**
 * The report: one deterministic string, and nothing that varies between runs.
 *
 * ## Byte-identical output is a REQUIREMENT, not a nicety
 *
 * MIZ-102 asks for output that is byte-identical across reruns, and the way that is achieved is by
 * having nothing in this module that could vary. So: no timestamp, no duration, no file size, no
 * absolute path, no iteration over a `Set` or a `Map` whose order is insertion-dependent at
 * runtime, no locale-dependent number formatting. Rates are rendered from integer arithmetic on
 * counts that are already in hand.
 *
 * That is also why `preRegisteredHypothesis` is printed FIRST, above the declaration and the
 * figures. A benchmark whose reader sees the result before the claim risks reading the number as
 * confirmation of whatever they already assumed; the ordering makes the claim a precondition of the
 * reading.
 *
 * ## No count is typed into the prose
 *
 * Every number this module prints comes out of `result` — the rates from `figures`, the corpus size
 * and the case count from the artefact. A literal `40` in a sentence is a second source of truth
 * for the denominator that nothing checks: the set grows, the sentence keeps claiming the old size,
 * and the report reads as though it were describing the run it just performed (AGENTS.md §17). The
 * one place a count does appear in a literal is `PRE_REGISTERED_HYPOTHESIS`, which is a frozen
 * pre-registered claim about a set of a stated size and is asserted verbatim by the self-test —
 * a hypothesis is allowed to name the set it was registered against; a measured figure is not
 * allowed to name itself.
 *
 * ## Why there is no "percent" field here
 *
 * Rates are printed as percentages for a reader's convenience, computed in this display function from
 * the fractions in `BenchmarkResult`. The artefact stores fractions, so a reader who wants to re-do
 * the arithmetic is working from the same numbers this function divided. Gate G-6.3 bans a
 * `percent:` key outside the two files that own `MatchStrength`; the ban is about the KEY, and
 * keeping the multiplication in a display function is what keeps it satisfied without giving up a
 * readable report.
 *
 * A negative delta is printed with its sign. The hypothesis may not be supported, and a report that
 * clamped a negative to zero would be asserting a result the run did not produce — the command exits
 * 0 either way precisely so the printed number is the deliverable.
 */

/** Fixed-width so a column of rates lines up and a diff of two runs is readable. */
const asRate = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`

/** The declaration, one field per line, so a rigged value is visible at a glance. */
const renderDeclaration = (declaration: BaselineDeclaration): readonly string[] => [
  `    strategy            ${declaration.strategy}`,
  `    column              ${declaration.column}`,
  `    collectionFilter    ${String(declaration.collectionFilter)}`,
  `    usesGoldRecordId    ${String(declaration.usesGoldRecordId)}`,
  `    k                   ${declaration.k}`,
  `    rerunBudget         ${declaration.rerunBudget}`,
]

/**
 * The full report.
 *
 * The corpus is identified by its fingerprint, which arrives inside `result` and is never a path: a
 * path would make the output machine-dependent and the byte-identical requirement impossible.
 *
 * @param result the artefact as it will be committed.
 * @param figures the fractions the run computed, rendered here. Passing them alongside the artefact
 *   rather than reading them back out of it is what lets the report and the artefact be compared by
 *   a test instead of by a reader.
 */
export const renderBenchmarkReport = (result: BenchmarkResult, figures: Figures): string => {
  const deltaLine = figures.delta >= 0 ? `+${asRate(figures.delta)}` : asRate(figures.delta)
  const supported =
    figures.delta > 0 && figures.falseVerifiedCount === 0
      ? "supported on this run"
      : "NOT supported on this run — the figures are published as measured, and the exit code is 0 either way"

  return [
    "mizan vs plain lexical search",
    "===========================",
    "",
    "Pre-registered hypothesis",
    `  ${result.preRegisteredHypothesis}`,
    "",
    "Corpus",
    `  fingerprint   ${result.corpusFingerprint}`,
    `  records       ${result.corpusRecordCount}`,
    "",
    `Set: ${result.setName} (${result.caseCount} cases)`,
    "",
    "Baseline declaration",
    ...renderDeclaration(result.declaration),
    "",
    "Figures",
    `  baseline top-1 hit rate    ${asRate(figures.baselineTop1HitRate)}`,
    `  system detection rate      ${asRate(figures.systemDetectionRate)}`,
    `  system agreement rate      ${asRate(figures.systemAgreementRate)}`,
    `  system abstention rate     ${asRate(figures.systemAbstentionRate)}`,
    `  delta                      ${deltaLine}`,
    `  false verified             ${figures.falseVerifiedCount}`,
    "",
    "Reading these numbers",
    `  The system arm is EXECUTED: ${result.systemArmSource}. verifyAnswer was called once per case against`,
    "  the corpus identified above, and the detection rate is what it returned. The executor cannot read",
    "  the set's declared verdicts; the two are joined afterwards, in scripts/benchmark/compare.ts.",
    "  A detection rate of 100% on a red-team set is what a correct verifier looks like AND what an",
    "  inverted one looks like, so it is published beside the AGREEMENT rate: the share of cases where",
    "  the verifier's verdict equals the set's declared verdict. Agreement is 0.0 for an inverted",
    "  verifier, which is what makes the detection rate legible rather than merely flattering.",
    "  The baseline asks FTS5 for the folded quote's tokens OR-ed together, ranked by bm25, top 1, ties",
    `  broken by record id. Asking for the whole phrase instead returns 0 of these ${result.caseCount} on the committed`,
    "  corpus, because every fabrication differs from the real span by a word; a search box does not",
    "  require the phrase, and neither does this harness.",
    "  The abstention rate is published so a high detection rate cannot hide behind declining to judge.",
    "  A negative delta is printed as measured. The hypothesis is not adjusted to fit.",
    "",
    `Hypothesis: ${supported}.`,
    "",
  ].join("\n")
}

export * as Report from "./report.ts"
