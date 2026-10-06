/**
 * Every published figure, re-derived from the committed artefacts — for `bun run accept:customer`.
 *
 * ## What this is for
 *
 * `accept:customer` runs six checks and prints six verdicts, which tells a customer the repository is
 * *consistent*. It does not tell them what the numbers **are**. Those live in a document, and a document
 * is the one thing in this repository nobody can re-derive: the reader is asked to take the table on
 * faith, which is the faith this project exists to remove. So the acceptance command re-derives them and
 * prints them beside the verdicts, with three properties a hand-typed summary cannot have:
 *
 *  - **every figure is counted, not copied** — the case counts come from `collectionCountsOf` over the
 *    committed set, the same function `checkCollectionCoverage` judges the build with, so the report and
 *    the gate cannot be two implementations of one question (AGENTS.md §17);
 *  - **every figure is labelled with the identity it came from** — the set's `datasetDigest`, and the
 *    corpus fingerprint for anything that measured a corpus. A report that publishes a count without the
 *    identity of the data it counted is a number nobody can tell has gone stale (Story 4);
 *  - **a figure that cannot be re-derived prints `unmeasured` and says why** — never a blank cell, never a
 *    zero, and never a number carried over from an older snapshot. `unmeasured` is visibly not `0`,
 *    which is the whole difference between "we measured it and found nothing" and "nobody measured it".
 *
 * ## Why it needs no corpus
 *
 * Because every input is a committed file: the served set is `attestation.json`, the cases are the eval
 * set, and the measured outcome and the latency are `data/benchmark/vs-search.json`. That is what makes
 * the disclosure survive a clean clone — the one checkout a customer is most likely to run it on — and
 * it is the reason this module takes evidence as arguments rather than reading anything itself: the
 * decision over three texts is a pure function, so the whole disclosure is testable in milliseconds with
 * no database and no corpus.
 *
 * ## What it will not print
 *
 * No quote, no question, no case text, no absolute path, no hostname. Collection ids, counts, ratios,
 * digests and conditions only (AGENTS.md §13) — a report is a thing people paste into a ticket.
 */

import { EvalSet, decodeOrFail, decodeSync, identityMismatch, isErr, isOk } from "@mizan/core"
import { BENCHMARK_ARTEFACT, COVERAGE_SET, collectionCountsOf, coverageVerdictKey } from "@mizan/gate"
import { ARTEFACT_PATH, LATENCY_BAND_MULTIPLIER, HARNESS_COMMAND } from "../eval/suggest-coverage.ts"

/**
 * The word a cell prints when no run in this checkout produced the figure.
 *
 * Named once, because it is a published word: a reader who has seen it once has to recognise it the
 * second time, and a second spelling of the same absence is a second thing to look up. It is a word
 * rather than a dash or an empty cell because an empty cell reads as a rendering accident and a dash
 * reads as a rounding, and neither says "this was not measured here".
 */
export const UNMEASURED = "unmeasured"

/** The figures a re-derivation has to work from, and nothing else. Read by the caller, pure here. */
export type Evidence = {
  /** Collection -> served record count, from `attestation.json`. Empty when no count could be read. */
  readonly served: ReadonlyMap<string, number>
  /** Every collection the attestation names, whether or not it carries a usable count for it. */
  readonly servedNames: ReadonlySet<string>
  /** Whether an attestation exists and names its collections. `false` means a corpus was claimed and cannot be listed. */
  readonly servedUsable: boolean
  /** The committed fabrication set's text, or `null` when this checkout ships none. */
  readonly redteam: string | null
  /** The committed measurement artefact's text, or `null` when this checkout ships none. */
  readonly benchmark: string | null
}

/**
 * One served collection's row, with every cell independently absent-or-present.
 *
 * `null` per cell rather than a row of `unmeasured`, because the four cells come from three artefacts
 * with three different failure modes: `servedRecords` from the attestation, `cases` from the set, and
 * `rejected`/`verified` from the recorded run — and a checkout can be missing any one of them. A row
 * that could not be dropped therefore exists per collection with the cells it can prove (Story 3's
 * "zeros rendered, not omitted", in its stronger form: an unmeasured cell is rendered, not omitted).
 */
export type CollectionFigure = {
  readonly collection: string
  readonly servedRecords: number | null
  readonly cases: number | null
  readonly rejected: number | null
  readonly verified: number | null
}

/**
 * The nearest-quote latency figure, with the conditions that make it a measurement.
 *
 * The quantity, the band, the case count, the ranker floor, and the corpus it ran against. A published
 * latency figure without those is a number a reader cannot interpret, and ADR-C10 records one that drifted
 * 1.77× across three documents before anybody could say why. The machine block — runtime, platform, CPU —
 * is not in this type: the artefact does not carry it, so this report does not restate it and names the
 * document that does instead. Inventing those three would be the one place in this file where a figure
 * could come from nowhere.
 */
export type LatencyFigure = {
  readonly p50Ms: number
  readonly p95Ms: number
  readonly maxMs: number
  readonly bandMultiplier: number
  readonly cases: number
  readonly rankerFloor: number
  readonly corpusRecordCount: number
  readonly corpusFingerprint: string
}

/** Everything the report prints, and nothing it does not. */
export type PublishedFigures = {
  readonly datasetDigest: string | null
  readonly rows: readonly CollectionFigure[]
  readonly latency: LatencyFigure | null
  /** One line per figure that could not be re-derived, each naming what is missing and why. */
  readonly notes: readonly string[]
}

/** The set, decoded through the contract `@mizan/core` declares, or `null` when it does not decode. */
const readSet = (text: string | null): EvalSet | null => {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const decoded = decodeOrFail(decodeSync(EvalSet), parsed, COVERAGE_SET)
  if (!isOk(decoded)) return null
  return decoded.value
}

/**
 * A measurement artefact as a flat field map, or `null` when it is not one.
 *
 * `null` for an array or a bare scalar too: neither carries a key to read, and an artefact that does not
 * carry keys has not recorded a figure.
 */
const readArtefact = (text: string | null): Readonly<Record<string, unknown>> | null => {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  return parsed as Readonly<Record<string, unknown>>
}

/** A finite number, or `null`. A recorded figure that is not a number is not a figure. */
const numberOf = (fields: Readonly<Record<string, unknown>>, key: string): number | null => {
  const value = fields[key]
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

/**
 * The measured outcome per collection, or the reason it may not be printed.
 *
 * ## Why the identity gate is here and not only in the harness
 *
 * `suggestionEvalSetDigest` and the set's own `datasetDigest` are what `recallRegression` compares before
 * it will judge a recall figure, and refusing there stops a *record*. This is the other half: a report
 * that printed `rejected: 15` beside a set whose digest has changed would be publishing one measurement's
 * figure against another measurement's denominator — the same invisible failure, in the document a
 * customer reads rather than in the artefact a gate reads. So the report applies the same refusal through
 * `identityMismatch`, whose success type is `never`: there is no code path here that prints a measured
 * outcome across two identities, and none that treats an absent digest as a match.
 *
 * The return type carries the reason so the caller can print *why* the cells are `unmeasured`. A refusal
 * that only says "unmeasured" is a cell the reader cannot act on.
 */
const measuredOutcome = (
  artefact: Readonly<Record<string, unknown>> | null,
  set: EvalSet | null,
): Readonly<{ fields: Readonly<Record<string, unknown>> | null; refusal: string }> => {
  if (artefact === null) {
    return { fields: null, refusal: `${ARTEFACT_PATH} is absent or is not a flat object, so no containment figure was recorded` }
  }
  if (set === null) {
    return { fields: null, refusal: `${COVERAGE_SET} does not decode, so no recorded figure can be attributed to the set it was measured over` }
  }
  const recorded = artefact["suggestionEvalSetDigest"]
  const compared = identityMismatch(typeof recorded === "string" ? recorded : null, set.datasetDigest)
  if (isErr(compared)) return { fields: null, refusal: compared.error }
  return { fields: artefact, refusal: "" }
}

/**
 * One row per collection this checkout can name, in name order. The served set is the denominator.
 *
 * `servedNames` rather than the keys of `served`, because the two differ in exactly the case that matters
 * here: a collection the attestation names with a count that is not a number is still a collection this
 * product claims to serve, and dropping the row would report four collections when it serves six. The
 * `served records` cell prints `unmeasured` for it, which is the truth about the count, rather than the
 * collection disappearing — which is what a name list would make it look like.
 */
const collectionsToReport = (names: ReadonlySet<string>, set: EvalSet | null): readonly string[] => {
  if (names.size > 0) return [...names].sort()
  if (set === null) return []
  return [...collectionCountsOf(set).keys()].sort()
}

/** The per-collection cells, from the counted cases and the recorded outcome. */
const rowOf = (
  collection: string,
  served: ReadonlyMap<string, number>,
  set: EvalSet | null,
  outcome: Readonly<Record<string, unknown>> | null,
): CollectionFigure => {
  const counts = set === null ? null : collectionCountsOf(set)
  const recorded = (verdict: "rejected" | "verified"): number | null =>
    outcome === null ? null : numberOf(outcome, coverageVerdictKey(collection, verdict))
  return {
    collection,
    servedRecords: served.get(collection) ?? null,
    cases: counts?.get(collection) ?? null,
    rejected: recorded("rejected"),
    verified: recorded("verified"),
  }
}

/**
 * The latency figure, or `null` with the reason.
 *
 * ## Why the recorded band is compared rather than read
 *
 * `LATENCY_BAND_MULTIPLIER` is the harness's constant and `suggestionLatencyBandMultiplier` is what it
 * wrote. They are one fact with two spellings, and the report prints a *recorded* figure, so a mismatch
 * between them means the artefact was written by a harness this checkout does not have — in which case
 * every other figure beside it is equally from that other harness and none of them is re-derivable here.
 * Printing the constant anyway would produce a confident band on top of figures we cannot check, which is
 * the failure mode of a summary that fills gaps with what it expects to find.
 */
const latencyOf = (artefact: Readonly<Record<string, unknown>> | null): Readonly<{ value: LatencyFigure | null; refusal: string }> => {
  if (artefact === null) return { value: null, refusal: `${ARTEFACT_PATH} is absent or is not a flat object, so no latency figure was recorded` }
  const p50Ms = numberOf(artefact, "suggestionLatencyP50Ms")
  const p95Ms = numberOf(artefact, "suggestionLatencyP95Ms")
  const maxMs = numberOf(artefact, "suggestionLatencyMaxMs")
  const cases = numberOf(artefact, "suggestionCaseCount")
  const corpusRecordCount = numberOf(artefact, "suggestionCorpusRecordCount")
  const bandMultiplier = numberOf(artefact, "suggestionLatencyBandMultiplier")
  const rankerFloor = numberOf(artefact, "suggestionFloorNarrowingTrigrams")
  const corpusFingerprint = artefact["suggestionCorpusFingerprint"]
  const missing = [
    ["suggestionLatencyP50Ms", p50Ms],
    ["suggestionLatencyP95Ms", p95Ms],
    ["suggestionLatencyMaxMs", maxMs],
    ["suggestionCaseCount", cases],
    ["suggestionCorpusRecordCount", corpusRecordCount],
    ["suggestionLatencyBandMultiplier", bandMultiplier],
    ["suggestionFloorNarrowingTrigrams", rankerFloor],
  ]
    .filter(([, value]) => value === null)
    .map(([key]) => String(key))
  if (missing.length > 0) return { value: null, refusal: `${ARTEFACT_PATH} records no ${missing.join(", ")}` }
  if (typeof corpusFingerprint !== "string" || corpusFingerprint.length === 0) {
    return { value: null, refusal: `${ARTEFACT_PATH} records no \`suggestionCorpusFingerprint\`, so the latency figure names no corpus` }
  }
  if (bandMultiplier !== LATENCY_BAND_MULTIPLIER) {
    return {
      value: null,
      refusal: `${ARTEFACT_PATH} recorded a tolerance band of ${String(bandMultiplier)}x and this checkout's harness declares ${LATENCY_BAND_MULTIPLIER}x, so the recorded latency is not comparable here`,
    }
  }
  return {
    value: {
      p50Ms: p50Ms as number,
      p95Ms: p95Ms as number,
      maxMs: maxMs as number,
      bandMultiplier: bandMultiplier as number,
      cases: cases as number,
      rankerFloor: rankerFloor as number,
      corpusRecordCount: corpusRecordCount as number,
      corpusFingerprint,
    },
    refusal: "",
  }
}

/** The served-set line's own refusal, so an unenumerable corpus is named rather than read as empty. */
const servedRefusal = (names: ReadonlySet<string>, usable: boolean, set: EvalSet | null): string => {
  if (names.size > 0) return ""
  if (!usable) return "attestation.json is present and names no usable collection, so the served set is unmeasured"
  if (set !== null) return "attestation.json is absent, so no collection is claimed to be served; the rows below are the collections the set exercises"
  return "attestation.json and the fabrication set are both absent, so there is nothing to report per collection"
}

/**
 * Every published figure, derived from evidence.
 *
 * Total, never partial: a missing artefact produces rows of `unmeasured` and a note naming the file, so
 * the shape of the disclosure is the same on a clean clone as on a full checkout and the reader learns
 * which figures are missing rather than learning that the report is short.
 */
export const figuresFrom = (evidence: Evidence): PublishedFigures => {
  const set = readSet(evidence.redteam)
  const artefact = readArtefact(evidence.benchmark)
  const outcome = measuredOutcome(artefact, set)
  const latency = latencyOf(artefact)
  const notes = [servedRefusal(evidence.servedNames, evidence.servedUsable, set), outcome.refusal, latency.refusal].filter((note) => note !== "")
  const collections = collectionsToReport(evidence.servedNames, set)
  return {
    datasetDigest: set?.datasetDigest ?? null,
    rows: collections.map((collection) => rowOf(collection, evidence.served, set, outcome.fields)),
    latency: latency.value,
    notes,
  }
}

/** A count, or the word that says nothing was measured. Never a blank cell and never a bare `0` for a gap. */
const cell = (value: number | null): string => (value === null ? UNMEASURED : String(value))

/** `5,272` — the spelling every document in this repository uses for a corpus size. */
const grouped = (value: number): string => value.toLocaleString("en-US")

/** The table. One row per collection, in name order, with every cell stated. */
const renderTable = (rows: readonly CollectionFigure[]): readonly string[] => {
  const header = "| collection | cases | rejected | verified | served records |"
  const rule = "| --- | --- | --- | --- | --- |"
  const body = rows.map((row) =>
    `| ${row.collection} | ${cell(row.cases)} | ${cell(row.rejected)} | ${cell(row.verified)} | ${row.servedRecords === null ? UNMEASURED : grouped(row.servedRecords)} |`,
  )
  return [header, rule, ...body]
}

/**
 * The latency line: the quantity, the band, the population and the corpus, in one sentence each.
 *
 * Restated from the artefact rather than from `docs/specs/measurements.md`, and every number in it comes
 * from the artefact — including the corpus size, printed as the artefact spells it so a reader can compare
 * the two strings. The machine block is named, not copied: ADR-C10 says a figure published without the
 * runtime, platform and CPU is not a measurement, and this report is not the place those three live.
 */
const renderLatency = (latency: LatencyFigure): readonly string[] => [
  `  latency            p50 ${latency.p50Ms}ms, p95 ${latency.p95Ms}ms, max ${latency.maxMs}ms — measured by \`${HARNESS_COMMAND}\` over ${latency.cases} adversarial fabricated quotes`,
  `                     at ranker floor ${latency.rankerFloor}, one scan and one ranking per case, cold process; quantiles are the values at index floor(cases x fraction), nothing interpolated;`,
  `                     corpus recordCount=${latency.corpusRecordCount} fingerprint=${latency.corpusFingerprint}.`,
  `                     Tolerance band ${latency.bandMultiplier}x on p95 and max. The architecture's target was <50ms p95 and it is missed by more than an order of magnitude (ADR-08);`,
  `                     the runtime, platform and CPU behind this figure are recorded in docs/specs/measurements.md, and a figure quoted without them is not a measurement (ADR-C10).`,
]

/**
 * The figures block, as an operator reads it.
 *
 * The heading says *re-derived from the committed artefacts* rather than *measured*, because that is the
 * difference a customer is being asked to act on: this block did not measure anything. It read the same
 * files a judge would, and printed what they say.
 */
export const renderFigures = (figures: PublishedFigures): readonly string[] => {
  const served = figures.rows.map((row) => row.collection)
  const records = figures.rows.reduce((total, row) => total + (row.servedRecords ?? 0), 0)
  const lines = [
    "published figures — re-derived from the committed artefacts, not measured by this run",
    `  dataset digest     ${figures.datasetDigest ?? UNMEASURED} — the identity of ${COVERAGE_SET} every figure below is counted over`,
    `  served set         ${served.length === 0 ? UNMEASURED : `${served.join(", ")} (${served.length} collections, ${grouped(records)} records)`} — from attestation.json`,
    ...(figures.rows.length === 0 ? ["  per collection       no collection could be named, so no row could be printed"] : renderTable(figures.rows)),
  ]
  if (figures.latency === null) lines.push("  latency            unmeasured")
  else lines.push(...renderLatency(figures.latency))
  for (const note of figures.notes) lines.push(`  ${UNMEASURED}        ${note}`)
  return lines
}

export * as AcceptanceFigures from "./figures.ts"
