#!/usr/bin/env bun
/**
 * Per-collection presence, for the harness that measures it and the gate that judges a document by it.
 *
 * ## Why this is its own module rather than a function at the bottom of the harness
 *
 * Three facts forced the split, and each one is a reason the next edit would otherwise have to reason
 * about the wrong file:
 *
 *  1. **The key vocabulary is shared with the gate.** `checkPresenceCollectionNamed` in
 *     `packages/mizan-gate` reads what this file writes. A key typed in both places is two answers to one
 *     question, and the second one is the copy that rots (AGENTS.md section 17) — so the keys are imported
 *     from `@mizan/gate`, which is where the rule reads them, and declared once there.
 *  2. **The renderer and the figures must not be able to disagree.** A table column and a published key
 *     are the same fact. `figures` and `render` both derive from one `PresenceProbe` list and one cutoff
 *     list, so adding a collection cannot add a row without adding a key.
 *  3. **It is testable without a corpus.** `scripts/eval/suggest-coverage.ts` is 1,069 lines and every
 *     interesting function in it needs a 27,234-record database. A per-collection claim test that needs
 *     the corpus is a test nobody runs when the corpus is absent, which is exactly when a coverage figure
 *     matters.
 *
 * ## What "measured" means here, precisely
 *
 * A collection is measured when it carries **at least one** adversarial case. That is a deliberately
 * weaker bar than `FABRICATION_COVERAGE_FLOOR`, and the two are kept apart on purpose:
 *
 *  - The **floor** is the gate's. Two cases per served collection is what this repository will *accept*,
 *    and `checkCollectionCoverage` fails the build below it.
 *  - The **share** is the artefact's. It answers "what fraction of served records sits in a collection
 *    anyone has tried to falsify anything against", and one case answers that question honestly.
 *
 * Collapsing them would publish `100%` as a figure that a later re-derivation could silently invalidate,
 * and would make a one-case collection indistinguishable from a fifteen-case one in the only number a
 * customer reads. The nuance lives in the per-collection `Cases` keys, which is where a reader can see it.
 *
 * ## Why the cut-offs are passed in rather than imported
 *
 * `CUTOFFS` lives in `suggest-coverage.ts` and is `[1, 3, MAX_TOP_K]`. Importing it here would make a
 * module that holds no corpus responsible for the product's cut-off vocabulary, and importing the other
 * direction would be a cycle. So the list arrives as an argument: this module knows how to report a set of
 * cut-offs, and one place decides which cut-offs exist.
 *
 * ## Why presence is a count and never a percentage
 *
 * `quran` carries two cases. Two cases support `2 of 2` and nothing else — a percentage published from a
 * two-case denominator reads as a rate, and a reader cannot tell it apart from one measured over 4,000.
 * Every figure here is a numerator and a denominator, and the denominator is published beside it under its
 * own key, because a count without its denominator is an integer (ADR-17).
 */
import type { Verdict } from "@mizan/core"
import { coverageCaseKey, coveragePresenceKey, coverageVerdictKey, COVERAGE_KEYS } from "@mizan/gate"

/** The two outcomes a containment figure counts. `unverifiable` is deliberately absent — see `PresenceProbe`. */
export type VerdictKey = "rejected" | "verified"

/** Declaration order, so the table columns and the recorded keys are written in one pass and one order. */
export const VERDICT_KEYS: readonly VerdictKey[] = ["rejected", "verified"]

/**
 * One case, reduced to what a per-collection row needs: which book it was attempted against, and whether
 * its anchor reached each cut-off.
 *
 * `reached` is one boolean per entry of the caller's cut-off list, **in the same order** — the same
 * convention `CaseMeasurement.hits` uses, and for the same reason: a probe that silently disagreed with its
 * cut-off list would publish a `Top5` figure describing top-3.
 */
export type PresenceProbe = {
  readonly collection: string
  readonly reached: readonly boolean[]
  /**
   * The verdict the set was adjudicated to expect, carried so the rejection figures are derived rather
   * than retyped.
   *
   * ## Why this is on the probe and not re-counted from a second list
   *
   * Because the rejected/verified split is the same fact as the case count, read along a different axis,
   * and two lists would be two things to keep in step. `EvalCase.expectedVerdict` is the only
   * authoritative statement of what a case is for — it is what a judge signed, and what
   * `checkCollectionCoverage`'s `eval-fabrication-not-rejected` rule requires to be `rejected` for every
   * case in this set. So the figures below are a projection of the adjudication, and `Accepted` — not
   * `Rejected` — would be the word for a probe whose expectation is `verified`, which is exactly the
   * fixture judging itself that the gate forbids.
   *
   * A `unverifiable` expectation contributes to neither figure and therefore to neither total: it is a
   * case whose outcome we decline to decide, and counting it as "not caught" would misreport the one
   * number a reader uses to ask whether this repository catches fabrications.
   */
  readonly expected: Verdict
}

/** Case counts by collection, in sorted key order so the rendered table and the recorded keys agree. */
export const caseCountsByCollection = (probes: readonly PresenceProbe[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const probe of probes) counts.set(probe.collection, (counts.get(probe.collection) ?? 0) + 1)
  return new Map([...counts.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
}

/** Cases where the anchor reached one cut-off, for one collection. */
export const presenceFor = (
  probes: readonly PresenceProbe[],
  collection: string,
  cutoffIndex: number,
): number =>
  probes.filter((probe) => probe.collection === collection && probe.reached[cutoffIndex] === true).length

/**
 * Cases per collection, split by the verdict the set expects — the containment figures, as opposed to
 * the `presenceFor` ranking figures.
 *
 * `Cases` and `Rejected` are equal for a healthy fabrication set, and that equality is not an
 * assumption here: `eval-fabrication-not-rejected` fails the build when a case in the set expects
 * anything else, so once that rule is green these two columns are the same column read twice, and a
 * divergence in the published table would show up as `presence-row-stale`. See `VerdictKeyPrefix` in
 * `@mizan/gate` for the keys these write.
 */
export const verdictCountsByCollection = (
  probes: readonly PresenceProbe[],
): ReadonlyMap<string, Readonly<Record<VerdictKey, number>>> => {
  const counts = new Map<string, Record<VerdictKey, number>>()
  for (const probe of probes) {
    const row = counts.get(probe.collection) ?? { rejected: 0, verified: 0 }
    if (probe.expected === "rejected" || probe.expected === "verified") row[probe.expected] += 1
    counts.set(probe.collection, row)
  }
  return new Map([...counts.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
}

/**
 * The published coverage figures, flat and top level.
 *
 * Flat because `readFigures` walks top-level entries only — a nested object would make every figure rule
 * in the gate permanently green with nothing to compare, which is the same shape of defect as a rule scoped
 * to documents that exclude the document holding the error.
 *
 * `served` is the attestation's `collectionCounts`, which is the population this is a share of. Read from
 * the attestation and nowhere else, so the served set has exactly one authority.
 */
export const coverageFigures = (
  probes: readonly PresenceProbe[],
  cutoffs: readonly number[],
  served: Readonly<Record<string, number>>,
): Readonly<Record<string, number | string>> => {
  const counts = caseCountsByCollection(probes)
  const servedKeys = Object.keys(served).sort()
  const measured = servedKeys.filter((collection) => (counts.get(collection) ?? 0) > 0)
  const unmeasured = servedKeys.filter((collection) => (counts.get(collection) ?? 0) === 0)
  const servedTotal = servedKeys.reduce((total, key) => total + (served[key] ?? 0), 0)
  const measuredRecords = measured.reduce((total, key) => total + (served[key] ?? 0), 0)
  const figures: Record<string, number | string> = {
    [COVERAGE_KEYS.collections]: measured.join(","),
    [COVERAGE_KEYS.measuredCollections]: measured.length,
    [COVERAGE_KEYS.unmeasuredCollections]: unmeasured.length,
    [COVERAGE_KEYS.measuredRecords]: measuredRecords,
    [COVERAGE_KEYS.unmeasuredRecords]: servedTotal - measuredRecords,
    // One decimal, so a share is not a precision the measurement has. A share of zero is a real 0.0 and
    // not a missing value: the key is always written, so "no figure" is never the answer to "what share".
    [COVERAGE_KEYS.sharePercent]: servedTotal === 0 ? 0 : Math.round((measuredRecords / servedTotal) * 1000) / 10,
  }
  for (const [collection, count] of counts) {
    figures[coverageCaseKey(collection)] = count
    for (const [index, cutoff] of cutoffs.entries()) {
      figures[coveragePresenceKey(collection, cutoff)] = presenceFor(probes, collection, index)
    }
    const verdicts = verdictCountsByCollection(probes).get(collection)
    for (const verdict of VERDICT_KEYS) {
      figures[coverageVerdictKey(collection, verdict)] = verdicts?.[verdict] ?? 0
    }
  }
  return figures
}

/**
 * The per-collection table: a case count and a `hits/cases` cell per cut-off.
 *
 * Denominators are the collection's own case count, repeated in every cell, because `2/2` and `2/15` in
 * the same column are the whole reason this table exists — a reader who sees `2/2` alone cannot tell
 * whether the collection was measured twice or fifty times, and `quran` and `abudawud` genuinely differ
 * by a factor of seven and a half.
 *
 * A served collection with no cases gets a row of `zero` rather than a row of `0`. `0` is what a
 * measured-and-missed column prints, and a served-but-unmeasured collection is a different fact: nobody
 * asked, so nothing was found.
 *
 * ## Why `rejected` and `verified` sit in the same table
 *
 * Because the top-N columns answer a ranking question and these answer the containment question, and a
 * reader who can only see one of them cannot tell whether a book that ranks its adjudications second
 * also catches its fabrications. For a healthy set the `rejected` column equals `cases`, which is the
 * point worth stating plainly: this repository's answer to "did the fabricated quote get through" is
 * published per book rather than only as `falseVerifiedCount: 0` in aggregate.
 */
export const renderCoverage = (
  probes: readonly PresenceProbe[],
  cutoffs: readonly number[],
  served: Readonly<Record<string, number>>,
): string => {
  const counts = caseCountsByCollection(probes)
  const verdicts = verdictCountsByCollection(probes)
  const header = `| collection | cases | ${cutoffs.map((cutoff) => `top-${cutoff}`).join(" | ")} | ${VERDICT_KEYS.join(" | ")} | served records |`
  const rule = `| --- | --- | ${cutoffs.map(() => "---").join(" | ")} | ${VERDICT_KEYS.map(() => "---").join(" | ")} | --- |`
  const rows = Object.keys(served)
    .sort()
    .map((collection) => {
      const cases = counts.get(collection) ?? 0
      const presence = cases === 0 ? cutoffs.map(() => "zero") : cutoffs.map((_cutoff, index) => `${presenceFor(probes, collection, index)}/${cases}`)
      // An unmeasured collection's verdict cells are `zero`, not `0`: nobody asked, so nothing was
      // caught — the same distinction as the presence cells above, and `checkCoverageTableRows` skips a
      // word for exactly the reason it skips a word in the presence columns.
      const contained = cases === 0 ? VERDICT_KEYS.map(() => "zero") : VERDICT_KEYS.map((verdict) => String(verdicts.get(collection)?.[verdict] ?? 0))
      return `| ${collection} | ${cases} | ${[...presence, ...contained].join(" | ")} | ${served[collection] ?? 0} |`
    })
  return [header, rule, ...rows].join("\n")
}

/**
 * The sentence a document needs beside a corpus-wide presence figure, and which it cannot invent.
 *
 * Built from the artefact's own vocabulary rather than hand-written so the product's disclosure and the
 * measured artefact cannot drift into two different descriptions of one measurement. `docs/specs/measurements.md`
 * quotes the same string, and `checkPresenceCollectionNamed` is what refuses a document that omits it.
 */
/**
 * The one sentence that says what the table above it measured.
 *
 * ## Why the count is `N of M` and not `all N`
 *
 * The first version said "measured over all ${measured.length} served collections" — where `N` was the
 * number of collections that actually had a case. The day one collection was unmeasured, that sentence
 * would have read "measured over all 3 served collections" while six were being served, which is the
 * precise claim this whole story exists to delete: the corpus-wide reading that arithmetic cannot catch.
 * A count of the collections measured, next to the count of the collections served, is the only spelling
 * that stays true when one is missing.
 *
 * When every served collection is measured the sentence says so in words, because "6 of 6" is a fact a
 * reader has to do arithmetic to enjoy and the table beside it already shows the rows.
 */
export const coverageClaim = (probes: readonly PresenceProbe[], served: Readonly<Record<string, number>>): string => {
  const counts = caseCountsByCollection(probes)
  const measured = Object.keys(served).sort().filter((collection) => (counts.get(collection) ?? 0) > 0)
  const named = measured.map((collection) => `${collection} ${counts.get(collection) ?? 0}`).join(", ")
  const thinnest = measured.reduce<{ readonly collection: string; readonly cases: number } | null>(
    (weakest, collection) => {
      const cases = counts.get(collection) ?? 0
      if (weakest !== null && weakest.cases <= cases) return weakest
      return { collection, cases }
    },
    null,
  )
  const scope =
    measured.length === Object.keys(served).length
      ? `all ${measured.length} served collections`
      : `${measured.length} of the ${Object.keys(served).length} served collections`
  const caveat =
    thinnest === null || measured.length === 0
      ? "no served collection carries a case, so there is nothing to measure"
      : `the thinnest is ${thinnest.collection} at ${thinnest.cases} case${thinnest.cases === 1 ? "" : "s"}`
  return `measured over ${scope} (${named}); ${caveat}`
}

export * as CoverageTables from "./coverage-tables.ts"
