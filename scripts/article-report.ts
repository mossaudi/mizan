#!/usr/bin/env bun
import { ArticleCoverageArtefact, decodeOrFail, decodeSync, isErr, type ArticleTotals } from "@mizan/core"
import { requireRepositoryRoot } from "@mizan/gate"
import { articleReportOf, reportBytesOf } from "./article-path.ts"
import { HARNESS_DOCUMENTS, HARNESS_FINGERPRINT } from "./article-harness.ts"

/**
 * `bun run article:report` — produce `data/eval/article-coverage.json`, the selection-recall artefact.
 *
 * ## Why a GENERATOR rather than a committed file somebody typed
 *
 * Every figure a document is allowed to quote needs a committed counterparty, or `bun run check:docs`
 * has nothing to compare it against and a number in prose is just a number (AGENTS.md section 17). A
 * hand-written artefact makes that check theatre: the file would agree with itself forever and disagree
 * with the code on the first selector change.
 *
 * So this computes every figure from the same harness the determinism test runs and writes what it
 * computed. Re-running it and getting no diff IS the assertion that the committed artefact still
 * describes the code; getting a diff is a figure that moved.
 *
 * ## Why it is corpus-FREE and therefore runs on a clean clone
 *
 * `data/corpus.db` is gitignored, so a generator that needed it could not have produced the artefact a
 * clean clone is supposed to read. This runs `scripts/article-path.ts`, whose selector resolves no
 * citation — so every span is `unverifiable (no_citation)` and `verified` is 0 for a reason the
 * artefact's `conditions` block STATES rather than hides. That zero is the point: it is the value a
 * determinism test asserts against, and a fabricated span marked verified would move it.
 *
 * ## One file, one write, then decoded back through its own contract
 *
 * `writeFileSync` of a fully-built string. A partial write would leave a truncated artefact that still
 * parses as JSON with fields missing, so the string is decoded through `ArticleCoverageArtefact` before
 * it reaches the disk and a malformed one is a named failure here rather than a silently-zero figure in
 * the next commit.
 */

/** Where the artefact lives, as one declaration. The tests read the committed file through this path. */
export const ARTICLE_ARTEFACT_RELATIVE = "data/eval/article-coverage.json"

/** How many runs of the path this artefact's figures came from, recorded in its conditions block. */
export const RUNS_COMPARED = 10

/** One fixture's counts, plus the `notExtracted` figure derived from the gap list. */
const caseOf = (id: string, document: string): ArticleTotals & { readonly id: string; readonly documentDigest: string } => {
  const report = articleReportOf(document)
  return {
    id,
    documentDigest: report.documentDigest,
    segments: report.counts.segments,
    extracted: report.counts.extracted,
    checked: report.counts.checked,
    verified: report.counts.verified,
    unverifiable: report.counts.unverifiable,
    rejected: report.counts.rejected,
    notExtracted: report.gaps.filter((gap) => gap.stage === "not_extracted").length,
  }
}

/** Sum a column across every case. One pass, and an empty set is `0` rather than `NaN`. */
const totalOf = (cases: readonly (ArticleTotals & { readonly id: string })[]): ArticleTotals => {
  const sum = (pick: (one: ArticleTotals & { readonly id: string }) => number): number =>
    cases.reduce((running, one) => running + pick(one), 0)
  return {
    segments: sum((one) => one.segments),
    extracted: sum((one) => one.extracted),
    checked: sum((one) => one.checked),
    verified: sum((one) => one.verified),
    unverifiable: sum((one) => one.unverifiable),
    rejected: sum((one) => one.rejected),
    notExtracted: sum((one) => one.notExtracted),
  }
}

/**
 * The artefact, computed rather than read.
 *
 * ## Why the determinism check is HERE as well as in the test
 *
 * A generator that produced a different `cases` array on its second call would be writing an artefact
 * nobody can trust, and the cheapest place to notice is the run that writes it. The test still runs the
 * path ten times, because a check a generator performs about itself is a check that can be deleted by
 * accident — the artefact's `conditions.runsCompared` records that both happened.
 */
export const articleArtefactOf = (): ArticleCoverageArtefact => {
  const cases = HARNESS_DOCUMENTS.map((fixture) => caseOf(fixture.id, fixture.document))
  const first = JSON.stringify(cases)
  for (let run = 1; run < RUNS_COMPARED; run += 1) {
    const again = JSON.stringify(HARNESS_DOCUMENTS.map((fixture) => caseOf(fixture.id, fixture.document)))
    if (again !== first) throw new Error(`the article path is not deterministic: run ${run + 1} differs from run 1`)
  }
  return {
    schemaVersion: 1,
    generatedBy: "bun run article:report",
    corpusFingerprint: HARNESS_FINGERPRINT,
    totals: totalOf(cases),
    cases,
    conditions: {
      corpus: "none - data/corpus.db is gitignored and this artefact was produced without it, so every span is unverifiable (no_citation) and verified is 0",
      provider: "none - no model was called; the selector is deterministic and resolves no citation",
      selector: "deterministic delimited-quotation and speech-introduced selection, no model assist",
      runsCompared: RUNS_COMPARED,
    },
  }
}

/**
 * The artefact as bytes, decoded back through its own contract first.
 *
 * Decoding BEFORE writing is the fail-closed order: a generator that cannot satisfy the shape it
 * declares must not replace a committed artefact that can.
 */
export const articleArtefactBytes = (): string => {
  const built = articleArtefactOf()
  const decoded = decodeOrFail(decodeSync(ArticleCoverageArtefact), built, "ArticleCoverageArtefact")
  if (isErr(decoded)) {
    throw new Error(`the generated artefact does not satisfy its own schema: ${decoded.error.detail}`)
  }
  return `${JSON.stringify(decoded.value, null, 2)}\n`
}

/**
 * The committed artefact, decoded.
 *
 * `JSON.parse` on a committed file, then `decodeOrFail` — the boundary AGENTS.md section 1 names. A
 * hand-edited artefact with a missing field is a decode failure naming that field, never a lenient read
 * that quietly reports `segments: undefined` as zero.
 */
export const readArticleArtefact = (text: string) =>
  decodeOrFail(decodeSync(ArticleCoverageArtefact), JSON.parse(text) as unknown, "ArticleCoverageArtefact")

const main = async (): Promise<number> => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) {
    console.error(`article:report could not start: ${root.error}`)
    return 2
  }
  const artefact = articleArtefactOf()
  const target = `${root.value}/${ARTICLE_ARTEFACT_RELATIVE}`
  await Bun.write(target, articleArtefactBytes())
  console.log(`wrote ${ARTICLE_ARTEFACT_RELATIVE}`)
  console.log(`  fingerprint: ${artefact.corpusFingerprint}`)
  console.log(`  runs compared: ${artefact.conditions.runsCompared}`)
  console.log(`  totals: ${JSON.stringify(artefact.totals)}`)
  console.log(`  a single fixture report is ${reportBytesOf(HARNESS_DOCUMENTS[0]?.document ?? "").length} bytes`)
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}

export * as ArticleReport from "./article-report.ts"
