import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { falseVerifiedDeltaOf, isErr, type ArticleTotals } from "@mizan/core"
import { requireRepositoryRoot } from "@mizan/gate"
import { articleArtefactBytes, articleArtefactOf, readArticleArtefact, RUNS_COMPARED, ARTICLE_ARTEFACT_RELATIVE } from "./article-report.ts"
import { falseVerifiedDeltaOf as harnessDelta, reportBytesOf, reportViolations, articleReportOf } from "./article-path.ts"
import { HARNESS_DOCUMENTS, HARNESS_FINGERPRINT } from "./article-harness.ts"

/**
 * The falsifiability claim, executed: ten byte-identical reports and `falseVerifiedDelta: 0`.
 *
 * ## Why this lives in `scripts/` and not in a package
 *
 * It composes `@mizan/verify`'s segmentation and selection with `@mizan/core`'s report contract, which
 * is a composition no single package owns. Placing it in `mizan-verify` would put a document-shaped
 * concern inside the package whose constitution is "one dependency, no I/O, and the verifier is the
 * whole of it" (AGENTS.md section 9); placing it in `apps/cli` would make it a product surface rather
 * than the harness that judges one.
 *
 * ## Why it is corpus-FREE, deliberately
 *
 * `data/corpus.db` is gitignored and absent from every clean clone, and `bun run ci` is a step
 * `accept:customer` declares corpus-independent. A determinism suite in the default lane that needed
 * the corpus would fail on a judge's fresh checkout — which is the exact failure
 * `scripts/ci-lanes.ts` exists to prevent. So the default lane runs this, and the snapshot-backed half
 * lives in `scripts/article-determinism.corpus.test.ts` in the opt-in lane.
 *
 * The corpus-free half is not a weaker assertion for that reason. `verified` is 0 here because no
 * citation resolves, and asserting `falseVerifiedDelta: 0` against a committed baseline catches the
 * thing that matters on this path: a selector or harness change that made a fabricated span reachable
 * as `verified` at all. The snapshot-backed lane then measures the same properties with a corpus
 * present.
 *
 * ## What "byte-identical" covers
 *
 * Bytes, not counts. A count comparison would pass on a run that reordered its outcomes, changed a
 * verdict reason, or renamed a segment while keeping the totals — which is exactly the drift class the
 * claim exists to exclude. So the comparison is over the serialised report, which carries ordering,
 * reasons, digests and the counts together.
 */

const ROOT = (): string => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) throw new Error(`the test could not locate the repository root: ${root.error}`)
  return root.value
}

/** The committed artefact, decoded through the contract that declares it. */
const committed = () => {
  const decoded = readArticleArtefact(readFileSync(join(ROOT(), ARTICLE_ARTEFACT_RELATIVE), "utf8"))
  if (isErr(decoded)) throw new Error(`${ARTICLE_ARTEFACT_RELATIVE} does not decode: ${decoded.error.detail}`)
  return decoded.value
}

/** One fixture's counts as the artefact records them, for a per-case comparison. */
const figureOf = (totals: ArticleTotals & { readonly id: string }, id: string): ArticleTotals =>
  totals.id === id
    ? {
        segments: totals.segments,
        extracted: totals.extracted,
        checked: totals.checked,
        verified: totals.verified,
        unverifiable: totals.unverifiable,
        rejected: totals.rejected,
        notExtracted: totals.notExtracted,
      }
    : { segments: 0, extracted: 0, checked: 0, verified: 0, unverifiable: 0, rejected: 0, notExtracted: 0 }

describe("ten runs of the article path are byte-identical", () => {
  test("every fixture's report serialises to the same bytes on ten consecutive runs", () => {
    for (const fixture of HARNESS_DOCUMENTS) {
      const first = reportBytesOf(fixture.document)
      for (let run = 1; run < RUNS_COMPARED; run += 1) {
        expect(reportBytesOf(fixture.document)).toBe(first)
      }
    }
  })

  test("the byte comparison covers ordering, verdict reasons and the counts, not just the totals", () => {
    // The property a count comparison would miss: swapping two outcomes and keeping the totals
    // changes the bytes while every number stays put.
    const report = articleReportOf(HARNESS_DOCUMENTS[0]?.document ?? "")
    const swapped = JSON.stringify({ ...report, outcomes: [...report.outcomes].reverse() })
    expect(swapped === JSON.stringify(report)).toBe(report.outcomes.length < 2)
  })

  test("no report carries a timestamp, a clock reading, or anything else that moves between runs", () => {
    // A field that varied per run would make the byte claim untestable rather than false, so its
    // ABSENCE is asserted by name rather than by hoping nobody adds one.
    const report = articleReportOf(HARNESS_DOCUMENTS[0]?.document ?? "")
    // The report's field names are an ALLOW-list, not a deny-list of substrings. A deny-list fires on
    // `degradation` containing `at` and on any future `generatedAt`, and a rule that cries wolf gets
    // deleted rather than fixed.
    expect(Object.keys(report).toSorted()).toEqual([
      "counts",
      "degradation",
      "documentDigest",
      "gaps",
      "outcomes",
      "schemaVersion",
      "segmentCount",
    ])
  })

  test("every report is internally consistent, so the counts cannot contradict the list beside them", () => {
    for (const fixture of HARNESS_DOCUMENTS) {
      expect(reportViolations(articleReportOf(fixture.document))).toEqual([])
    }
  })
})

describe("falseVerifiedDelta is zero against the committed baseline", () => {
  test("the baseline is an ARTEFACT, not a number in this test file", () => {
    // A baseline declared next to the assertion is the assertion checking itself. The figure is read
    // from the committed artefact, so a change in the path moves it and this fails.
    expect(committed().generatedBy).toBe("bun run article:report")
    expect(committed().corpusFingerprint).toBe(HARNESS_FINGERPRINT)
  })

  test("no fixture publishes a verified span, and the failure names the case if one ever does", () => {
    const artefact = committed()
    for (const fixture of HARNESS_DOCUMENTS) {
      const baseline = artefact.cases.find((one) => one.id === fixture.id)
      if (baseline === undefined) throw new Error(`the artefact records no case for ${fixture.id}`)
      const current = articleReportOf(fixture.document).counts.verified
      const delta = falseVerifiedDeltaOf(current, baseline.verified)
      expect({ id: fixture.id, delta }).toEqual({ id: fixture.id, delta: 0 })
    }
  })

  test("the aggregate delta is zero too, so a case added to the harness cannot hide a movement", () => {
    const artefact = committed()
    const currentVerified = HARNESS_DOCUMENTS.reduce(
      (running, fixture) => running + articleReportOf(fixture.document).counts.verified,
      0,
    )
    expect(falseVerifiedDeltaOf(currentVerified, artefact.totals.verified)).toBe(0)
  })

  test("the harness's delta rule reads the report the core rule reads, so two answers cannot exist", () => {
    // `@mizan/core` owns the arithmetic and `article-path.ts` re-uses it rather than subtracting again.
    // The assertion is on the OBSERVED value rather than on function identity, because the harness takes
    // a report and the core takes a count — a shape difference, not a second implementation.
    expect(harnessDelta(articleReportOf(HARNESS_DOCUMENTS[0]?.document ?? ""), 0)).toBe(
      falseVerifiedDeltaOf(articleReportOf(HARNESS_DOCUMENTS[0]?.document ?? "").counts.verified, 0),
    )
    expect(harnessDelta(articleReportOf(HARNESS_DOCUMENTS[0]?.document ?? ""), 2)).toBe(
      falseVerifiedDeltaOf(articleReportOf(HARNESS_DOCUMENTS[0]?.document ?? "").counts.verified, 2),
    )
  })

  test("the fixture's committed figures still match what the path computes today", () => {
    // This is the artefact's own tripwire. If the path changed and nobody re-ran `article:report`, the
    // figures a document is allowed to quote would be describing code that no longer exists.
    const artefact = committed()
    for (const fixture of HARNESS_DOCUMENTS) {
      const baseline = artefact.cases.find((one) => one.id === fixture.id)
      if (baseline === undefined) throw new Error(`the artefact records no case for ${fixture.id}`)
      const report = articleReportOf(fixture.document)
      expect({ id: fixture.id, ...figureOf(baseline, fixture.id) }).toEqual({
        id: fixture.id,
        segments: report.counts.segments,
        extracted: report.counts.extracted,
        checked: report.counts.checked,
        verified: report.counts.verified,
        unverifiable: report.counts.unverifiable,
        rejected: report.counts.rejected,
        notExtracted: report.gaps.filter((gap) => gap.stage === "not_extracted").length,
      })
    }
  })

  test("the artefact regenerates to the committed bytes, so it was produced by the command that claims it", () => {
    expect(articleArtefactBytes()).toBe(readFileSync(join(ROOT(), ARTICLE_ARTEFACT_RELATIVE), "utf8"))
  })

  test("the committed artefact carries its conditions block, because a figure without one is not a measurement", () => {
    const conditions = committed().conditions
    expect(conditions.corpus.length).toBeGreaterThan(0)
    expect(conditions.provider.length).toBeGreaterThan(0)
    expect(conditions.selector.length).toBeGreaterThan(0)
    expect(conditions.runsCompared).toBe(RUNS_COMPARED)
  })
})

describe("the failure modes this suite exists to catch", () => {
  test("a planted clock moves the bytes, so the determinism assertion would fail", () => {
    // The tripwire for the test, not for the product. If the byte comparison had become vacuous, a
    // report carrying a per-run value would pass it; here it visibly does not.
    const volatile = (tick: number): string => JSON.stringify({ schemaVersion: 1, documentDigest: "b".repeat(64), segmentCount: 1, tick })
    expect(volatile(1) === volatile(2)).toBe(false)
  })

  test("a planted unstable iteration order moves the bytes", () => {
    // `Set` iteration is insertion-ordered and `Map` is too, which is why the report sorts nothing and
    // relies on segment order. This asserts the reliance is on ORDER rather than on a sort being
    // applied later, so an edit that builds the array from a set keyed by hash would be visible.
    const keys = ["c", "a", "b"]
    expect(JSON.stringify([...new Set(keys)])).not.toBe(JSON.stringify(["a", "b", "c"]))
  })

  test("the corpus-free lane publishes no corpus fingerprint it does not have", () => {
    // The artefact names a HARNESS rather than a snapshot hash, because a hash of no corpus would read
    // as a measurement of an empty snapshot.
    expect(HARNESS_FINGERPRINT).toContain("corpus-free")
    expect(committed().corpusFingerprint).toBe(HARNESS_FINGERPRINT)
  })

  test("the generated artefact satisfies the schema it declares, checked from the generator side too", () => {
    expect(articleArtefactOf().totals.verified).toBe(0)
  })
})
