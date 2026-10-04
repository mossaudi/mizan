#!/usr/bin/env bun
/**
 * `bun run eval:suggestions` — does the nearest-quote list actually reach the record a fabrication
 * came from, and what does the search cost?
 *
 * ## What this measures, and what it deliberately does not
 *
 * PRESENCE of the adjudicated anchor at three narrowing floors and three cut-offs; PRECISION at each
 * rank the reader actually sees; and the wall clock of one scan. It is not a benchmark of answer
 * quality and it prints no figure about verdicts: the badge is decided by `@mizan/verify` on exact
 * containment (ADR-03) and nothing here can touch it.
 *
 * A hit is measured on FOLDED TEXT, not on a record id. The corpus stores the same Qur'anic text
 * under several ids (ADR-10), so an id comparison would score the correct answer as a miss for every
 * duplicate and report a recall problem that does not exist. What the reader wants is the text.
 *
 * ## Why precision is reported per rank and not as one number
 *
 * "Nearest-quote suggestions are 94% correct" is the kind of sentence this repository exists to make
 * impossible: one number, no denominator, and no way to tell whether the fourth line of a five-line
 * list is as good as the first. So each rank gets its own row, the denominator is stated
 * (`displayed`), and the cases where the list was too short to have anything at that rank are counted
 * and printed rather than folded in as a miss — padding a list to K would be a lie and dropping the
 * absent cases would hide the cost of the floor that caused them. Neither number is an accuracy claim:
 * they describe what this list showed on this corpus at this commit, and the corpus hash is printed
 * above them.
 *
 * ## Why the display floor is swept on every run
 *
 * `MIN_SHARED_RUN_CHARS` is a number someone chose, and a chosen number with no table behind it is an
 * opinion. So the sweep at the end of this output measures, for each candidate floor, how many of the
 * forty cases still show their anchor anywhere in the list — the recall cost of precision. A drop at
 * some floor and a flat region above it is what makes the choice an argument rather than a preference,
 * and it is recomputed every run so a re-ingested corpus cannot leave the decision resting on a table
 * measured against a snapshot that no longer exists.
 *
 * ## Why one scan per case serves every configuration
 *
 * The floor and the cut-off are applied by `rankNeighboursAtFloor`, AFTER the scan, to the rows the
 * scan carried. One streamed pass therefore yields the ranked list at floor 4, 8 and 12, and slicing
 * it gives top-1, top-3 and top-5. Nine configurations for the price of one: forty scans of 27,234
 * records instead of three hundred and sixty, and the latency figure measured on the same work the
 * product does rather than on nine variants of it.
 *
 * ## The attestation comes FIRST, and nothing is printed before it passes
 *
 * Every figure here is a statement about a specific corpus. Same discipline as
 * `scripts/benchmark/run.ts`, for the same reason: a stale snapshot produces perfectly
 * ordinary-looking coverage, and the mismatch case is where printing is most harmful. On any
 * disagreement this harness prints both identities and exits 3 having printed no figure at all.
 *
 * The fingerprint is read again at the END, because a corpus rewritten mid-run produced a number
 * describing two different corpora.
 *
 * ## Nothing is written, unless `--record` is passed
 *
 * The snapshot is opened read-only and stdout is the only output by default. This is a measurement, not
 * a run: a number in `data/` would look like a recorded fact of the product, and a coverage figure that
 * can be regenerated in a minute does not need a schema to be trustworthy.
 *
 * `--record` is the one exception, and it exists because a figure a judge reads has to be checkable by
 * something that is not a human reading a table. It merges the flat `suggestion*` keys into
 * `data/benchmark/vs-search.json` — the artefact `check:docs` already reads — so the docs claim sweep
 * can compare a stated latency against a recorded one instead of trusting the prose (ADR-13). It never
 * runs by accident: an artefact rewritten by every measurement would be an artefact nobody could
 * attribute, and the git diff of a latency change is the point.
 *
 * ## Every figure is printed with the conditions it was measured under
 *
 * The last section is the conditions block: corpus identity, case count, what the clock covered and
 * what it deliberately did not, the quantile rule, the cache state, the runtime, the platform, the CPU
 * and the declared tolerance. It is emitted here rather than written into a document by hand because
 * the figure this repository published and the figure its own harness printed already disagreed once,
 * and the reason nobody noticed is that a number in prose has nothing to contradict it. A document
 * that quotes a latency figure quotes this block with it (ADR-C10).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { arch, cpus, platform } from "node:os"
import { Database } from "bun:sqlite"
import { decodeOrFail, decodeSync, describeDecodeFailure, isErr, isOk, ok, err, normalizeForMatch, EvalSet, type CorpusError, type Result } from "@mizan/core"
import {
  attestSnapshot,
  attestSnapshotUnchanged,
  attestationUnreadable,
  describeAttestationProblem,
  readSnapshotMeta,
  scanSuggestionCandidates,
  type AttestationProblem,
  type SnapshotIdentity,
} from "@mizan/corpus"
import { MAX_TOP_K, MIN_SHARED_TRIGRAMS, rankNeighboursAtFloor, type RankedNeighbour } from "@mizan/suggest"
import { MIN_SHARED_RUN_CHARS, runClearsFloorAt, sharedRunOf, type SharedRun } from "@mizan/verify"

const CORPUS_PATH = "data/corpus.db"
const ATTESTATION_PATH = "attestation.json"
const SET_PATH = "data/eval/redteam-fabricated.json"

/** The command a reader runs to reproduce every figure printed here. Named in the conditions block. */
export const HARNESS_COMMAND = "bun run eval:suggestions"

/**
 * How far a rerun may sit from a published figure before it counts as a different figure.
 *
 * ## What the band catches, and what it does not
 *
 * Wall clock is a property of the machine as well as of the code, so a published latency number is
 * meaningless without a tolerance: an exact-equality rule would fail on every other laptop, and a
 * rule with no band cannot exist at all. 1.5x is chosen from two measured facts rather than by taste.
 * Five consecutive runs of this harness on the machine named in the conditions block spanned p95
 * 632 ms to 709 ms — 1.12x, which the band absorbs with room to spare. The drift that actually
 * happened to this repository was a published `p95 634 ms` against a measured `p95 1121 ms`, which is
 * 1.77x and would fail at 1.5x. So the band sits above this machine's own spread and below the drift
 * that reached a document, and it catches a retyped number, a deleted one and a 40% regression.
 *
 * **What it cannot catch, stated rather than implied:** a machine two or three times slower than the
 * one the figure was recorded on. No multiplier fixes that, because the honest options are both bad —
 * a band wide enough to accept any hardware accepts a real regression, and a band narrow enough to
 * reject a slow machine rejects this one. The answer is the conditions block: a figure is published
 * together with the hardware that produced it, so a reader on other hardware compares against their
 * own run rather than against ours.
 */
export const LATENCY_BAND_MULTIPLIER = 1.5

/**
 * How many runs `--record` measures before publishing.
 *
 * Five because that is the count ADR-C10 names, and the count is here rather than in prose so that
 * changing it changes the published figure's meaning rather than only its documentation.
 */
export const RECORD_RUNS = 5

/** Reserved for an integrity failure: a figure printed here would describe nothing. */
export const EXIT_UNTRUSTED = 3

/** The floors this harness reports for the RANKER. The product passes `MIN_SHARED_TRIGRAMS`. */
export const FLOORS = [4, 8, 12] as const

/**
 * The display floors this harness sweeps, in the unit the reader sees.
 *
 * `MIN_SHARED_RUN_CHARS` is one of these, and the table it sits in is what makes the value an
 * argument. The range brackets the shipped floor from both sides — 4 is where the floor starts
 * removing the noise rows a live run observed at 5 to 8 shared characters, and 20 is far enough above
 * the recorded anchors to show whether the flat region is real or luck.
 *
 * These are not the ranker's 3-gram floors above. The two are different jobs (ADR-12) and one table
 * for both would make a sweep look like it were moving the ranker when it is not.
 */
export const RUN_FLOORS = [4, 8, 10, 12, 16, 20] as const

/**
 * The floor handed to the scan, which is the LOOSEST floor reported.
 *
 * The scan drops rows below the floor it is given (see `candidates.ts`), so scanning at 8 and then
 * ranking at 4 would measure a number for a floor the user never gets. One scan at the loosest floor
 * admits a superset of what 8 and 12 admit, so all three rows of the table are exact.
 */
export const SCAN_FLOOR = Math.min(...FLOORS)

/** The cut-offs a reader actually sees: the first line, a readable block, the hard ceiling. */
export const CUTOFFS = [1, 3, MAX_TOP_K] as const

/** One case, reduced to what this measurement needs. No question, no expected verdict, no prose. */
export type CoverageCase = {
  readonly id: string
  readonly quote: string
  /** The record the quote was mutated from, as FOLDED text. The only ground truth used here. */
  readonly anchorFolded: string
}

/**
 * The cases, reduced to quote and folded anchor.
 *
 * The anchor is folded HERE, once, with the search's own fold. Folding it anywhere else would be a
 * second definition of "the same text" — the drift AGENTS.md section 17 exists to prevent — and the
 * hit test would then quietly measure nothing at all.
 */
export const casesFrom = (set: EvalSet): readonly CoverageCase[] =>
  set.cases.map((testCase) => ({
    id: testCase.id,
    quote: testCase.quote,
    anchorFolded: normalizeForMatch(testCase.anchorText ?? testCase.anchorId),
  }))

/**
 * Did the anchor reach the top N?
 *
 * `anchorText` is a span quoted from *inside* the record, not the record's whole `textMatch`, so
 * equality can never fire. Containment of the folded span inside the candidate's folded text is the
 * honest relation — and it is the same relation `@mizan/verify` uses to reach a verdict, so measuring
 * recall this way adds no similarity judgement of its own (ADR-03, ADR-08).
 */
export const isHit = (anchorFolded: string, ranked: readonly { readonly textMatch: string }[]): boolean =>
  ranked.some((row) => row.textMatch.includes(anchorFolded))

/** What the reader was shown at one display floor, and where the anchor landed among it. */
export type Displayed = {
  /** Rows that cleared the floor. The list is never padded to `MAX_TOP_K`. */
  readonly shown: number
  /**
   * One-based position of the adjudicated anchor among those rows, or 0 when it was not shown.
   *
   * 0 and not `null` because zero is already the statement "nothing at position 0" — the rank is
   * dense from 1 on the product, so an absent anchor has no rank at all and 0 is the only value that
   * cannot be confused with one.
   */
  readonly anchorRank: number
}

/** One case's result: whether the anchor was inside each cut-off, at each floor, and what was shown. */
export type CaseMeasurement = {
  readonly id: string
  readonly ms: number
  /** `hits[floor]` is one boolean per entry of {@link CUTOFFS}, in the same order. */
  readonly hits: Readonly<Record<number, readonly boolean[]>>
  /** One {@link Displayed} per entry of {@link RUN_FLOORS}. */
  readonly gated: Readonly<Record<number, Displayed>>
}

/** One ranked row and the two integers the display decision is made from. */
type Measured = {
  readonly row: RankedNeighbour
  readonly run: SharedRun
}

/** True when the candidate's folded text holds the anchor's folded span. */
const holds = (entry: Measured, anchorFolded: string): boolean => entry.row.textMatch.includes(anchorFolded)

/**
 * What a list gated at `runFloor` showed: how many rows, and which position the anchor took.
 *
 * The list is counted as filtered and never padded, so `shown` can be less than `MAX_TOP_K` — and
 * that shortfall is data, not a defect. It is why `precisionAt` reports `absent` separately: a list
 * that stopped at two rows is the floor working, and folding it into a denominator would charge the
 * floor for precision it did not claim.
 */
const displayedAt = (measured: readonly Measured[], anchorFolded: string, runFloor: number): Displayed => {
  const shown = measured.filter((entry) => runClearsFloorAt(entry.run, runFloor))
  const anchorRank = shown.findIndex((entry) => holds(entry, anchorFolded))
  return { shown: shown.length, anchorRank: anchorRank + 1 }
}

/**
 * Name a corpus failure without naming a corpus record's text.
 *
 * Only `row_undecodable` carries a row id; every other corpus failure is named by its tag alone. The
 * union is narrowed here rather than at the call site so that a new failure mode cannot make this
 * harness print a field it does not have (AGENTS.md section 13).
 */
const describeCorpusError = (error: CorpusError): string => {
  if (error._tag === "row_undecodable") return `${error._tag} at ${error.recordId}`
  return error._tag
}

/**
 * Scan once, time the product's own path, and report what was shown at every floor.
 *
 * ## What the clock covers, and what it deliberately does not
 *
 * `ms` is the work a user waits for when one claim is rejected: one scan of the corpus, one ranking at
 * the floor the product actually uses, and the shared-run measurement and display filter on the rows
 * that ranking returned — because a user waits for those too, and a figure that quietly excluded the
 * step this cycle added would be flattering the change it is meant to measure.
 *
 * Everything below that is *measurement* work a user never pays for: ranking the same rows at three
 * ranker floors to keep ADR-09's choice defensible, and applying the display filter once per swept
 * floor to make the floor sweep possible. Timing those would report this harness's cost as the
 * product's cost, which is the one number in this repository that must not be flattered (AGENTS.md
 * section 13). The sweep reuses the runs measured inside the clock, so it costs comparisons and not
 * a second pass over 27,234 records.
 *
 * Throws on a scan failure rather than counting it as a miss: a row that could not be decoded means
 * the corpus is not the corpus this figure is about, and a coverage number computed over a corpus we
 * could not read is not a coverage number (AGENTS.md section 16). The caller has already checked the
 * attestation, so the honest outcome is a loud failure.
 */
export const measureCase = (db: Database, testCase: CoverageCase): CaseMeasurement => {
  const startedAt = performance.now()
  const scanned = scanSuggestionCandidates(db, testCase.quote, SCAN_FLOOR)
  if (!isOk(scanned)) throw new Error(`scan failed: ${describeCorpusError(scanned.error)}`)
  const source = scanned.value

  // The scan's own fold is handed back rather than folding a second time. `foldQuote` is idempotent,
  // so either spelling gives the same ranking — passing the folded value simply keeps the "fold once per
  // quote" contract in `candidates.ts` true rather than aspirational.
  const rankedAt = (floor: number): readonly RankedNeighbour[] =>
    rankNeighboursAtFloor({ quote: source.quoteFolded, rows: source.rows, floor, topK: MAX_TOP_K })

  const productRows = rankedAt(MIN_SHARED_TRIGRAMS)
  const measured: Measured[] = productRows.map((row) => ({
    row,
    run: sharedRunOf(testCase.quote, row.textMatch),
  }))
  // The display filter runs inside the clock, because a user waits for it too. Its result is what
  // `displayedAt` recomputes for each swept floor below off the SAME measurements — the sweep compares
  // rows against a floor, so it never pays for a second pass over the ranked list or the corpus.
  const shipped = displayedAt(measured, testCase.anchorFolded, MIN_SHARED_RUN_CHARS)
  const ms = performance.now() - startedAt

  const hits: Record<number, boolean[]> = {}
  for (const floor of FLOORS) {
    const ranked = rankedAt(floor)
    hits[floor] = CUTOFFS.map((cutoff) => isHit(testCase.anchorFolded, ranked.slice(0, cutoff)))
  }

  const gated: Record<number, Displayed> = { [MIN_SHARED_RUN_CHARS]: shipped }
  for (const runFloor of RUN_FLOORS) {
    gated[runFloor] = runFloor === MIN_SHARED_RUN_CHARS ? shipped : displayedAt(measured, testCase.anchorFolded, runFloor)
  }
  return { id: testCase.id, ms, hits, gated }
}

/** `hits/cases` for one floor and one cut-off index. A missing entry counts as a miss, not as a skip. */
export const coverageAt = (measurements: readonly CaseMeasurement[], floor: number, cutoffIndex: number, total: number): string => {
  const hits = measurements.filter((entry) => entry.hits[floor]?.[cutoffIndex] === true).length
  return `${hits}/${total}`
}

/** How many cases still show their anchor anywhere in a list of at most `MAX_TOP_K` rows. */
const presenceAt = (measurements: readonly CaseMeasurement[], floor: number, cutoffIndex: number): number =>
  measurements.filter((entry) => entry.hits[floor]?.[cutoffIndex] === true).length

/**
 * What the reader saw at one rank, and what it cost to keep that rank meaningful.
 *
 * ## Why the denominator is `displayed` and never the case count
 *
 * Forty cases and a hit rate of `38/40` at rank 1 reads as "95% correct". It is not that, and the
 * difference is the whole reason this type exists: on the same forty cases rank 5 might be `3/9`, and
 * reporting it as `3/40` would make the floor look like it was hiding precision when in fact it
 * shortened the list — the denominator has to be the cases where a row was actually printed at that
 * position, or the floor's effect is invisible exactly where it is strongest.
 *
 * `absent` is reported rather than absorbed. Dividing by zero would have to print `0/0`, which a
 * reader cannot interpret; and folding absent cases into the denominator would be the same padding
 * the product refuses to do, moved into the measurement.
 *
 * Nothing here is an accuracy claim. It says which of the rows this list printed, on this corpus, at
 * this commit, were the record the case was built from — and the corpus hash is printed above it.
 */
export type RankPrecision = {
  readonly rank: number
  /** Cases where a candidate was printed at this rank. The denominator. */
  readonly displayed: number
  /** Of those, how many held the adjudicated anchor. */
  readonly hits: number
  /** Cases where the list was shorter than this rank, so nothing could be printed there. */
  readonly absent: number
}

/** `hits/displayed` at one rank and one display floor, as whole numbers only. */
export const precisionAt = (
  measurements: readonly CaseMeasurement[],
  floor: number,
  rank: number,
): RankPrecision => {
  const displayed = measurements.filter((entry) => (entry.gated[floor]?.shown ?? 0) >= rank).length
  const hits = measurements.filter((entry) => entry.gated[floor]?.anchorRank === rank).length
  return { rank, displayed, hits, absent: measurements.length - displayed }
}

/** The recall a display floor costs, in cases: what the ranker found, and what survived the floor. */
export type RecallCost = {
  /** Cases where the anchor was inside the ungated top-`MAX_TOP_K` — presence before the floor. */
  readonly shipped: number
  /** Cases where it was inside the gated list — presence after. */
  readonly gated: number
}

/**
 * The floor's price, in cases.
 *
 * Both figures are counts out of the same case set, so `shipped - gated` is exactly the number of
 * cases the floor removed the anchor from. A floor that costs nothing is worth any precision; one that
 * costs cases has to be argued for, and this is the argument, recomputed on every run.
 */
export const floorRecallCost = (measurements: readonly CaseMeasurement[], runFloor: number): RecallCost => ({
  shipped: presenceAt(measurements, MIN_SHARED_TRIGRAMS, CUTOFFS.length - 1),
  gated: measurements.filter((entry) => (entry.gated[runFloor]?.anchorRank ?? 0) > 0).length,
})

/**
 * p50 / p95 / max over the per-case times.
 *
 * Sorted by VALUE, never by case id, so the figure depends on the run and not on the order the cases
 * were declared in. The quantile is the value at index `floor(n * f)`, clamped — the conventional
 * choice for a small sample, where interpolating a number between two cases would invent one.
 */
/** The three latency figures one run measured. Named so `slowestOf` reads as what it is. */
export type Cost = { readonly p50: number; readonly p95: number; readonly max: number }

export const scanCost = (measurements: readonly CaseMeasurement[]): Cost => {
  const times = measurements.map((entry) => entry.ms).sort((a, b) => a - b)
  const at = (fraction: number): number => times[Math.min(times.length - 1, Math.floor(times.length * fraction))] ?? 0
  return { p50: at(0.5), p95: at(0.95), max: times[times.length - 1] ?? 0 }
}

/**
 * The slowest of N runs, componentwise — the figure of record ADR-C10 requires.
 *
 * ## Why this is a function and not a habit
 *
 * "Publish the slowest of five consecutive runs" was, until this function existed, a rule enforced by
 * whoever happened to be holding the terminal: run it five times, look at the five p95s, type the
 * largest one. That is a rule with no mechanism, and a rule with no mechanism is honoured exactly as
 * often as somebody remembers. Measured across five runs of the shipped path on the recorded machine,
 * p95 spanned 705–1088 ms and `max` spanned 720–1262 ms, so the choice of run is worth roughly 1.5x on
 * the published figure — which is the whole width of the tolerance band. A figure picked by eye is
 * therefore not merely informal, it is the difference between a passing document and a failing one.
 *
 * Componentwise rather than by picking one run: the slowest p50 and the slowest p95 are not in the same
 * run, and choosing one run would publish a p95 from a run whose p50 was fast, describing a run that
 * never happened.
 *
 * Deterministic and order-independent — a maximum over a set is, so `recordSlowest` is safe to call from
 * anywhere in any order and needs no accumulator state.
 */
export const slowestOf = (costs: readonly Cost[], count: number): Cost | null => {
  if (costs.length === 0 || count < 1) return null
  const widest = (key: "p50" | "p95" | "max"): number => Math.max(...costs.map((cost) => cost[key]))
  return { p50: widest("p50"), p95: widest("p95"), max: widest("max") }
}

/**
 * The flat `suggestion*` keys this run measured, as a `Record<string, number | string>`.
 *
 * ## Why flat, top-level and numeric
 *
 * `readFigures` in `packages/mizan-gate/src/docs-value.ts` walks `Object.entries` of the parsed JSON
 * and keeps the entries whose value is a number. A nested object, an array, or a value inside one is
 * invisible to it — so an artefact shaped `latency: { p95: 709 }` would produce a rule that is green
 * forever because it never sees anything to compare. Every key here is top level. `readFigures` is the
 * reason `vs-search.json` was flat to begin with and this keeps that true rather than working around
 * it.
 *
 * The one non-numeric key is `suggestionCorpusFingerprint`, and it is there because a latency number
 * without the corpus it was measured on is a number about nothing. The claim rule reads it directly
 * rather than through `readFigures`, which is why it is named explicitly rather than swept up with the
 * rest.
 *
 * Key names are the contract between this harness and `checkLatencyFigureUnbacked`. They are
 * namespaced under `suggestion` so they cannot collide with the retrieval figures already in the file,
 * and they are declared once, here.
 */
export const suggestionFigures = (
  measurements: readonly CaseMeasurement[],
  cost: { readonly p50: number; readonly p95: number; readonly max: number },
  identity: SnapshotIdentity,
): Readonly<Record<string, number | string>> => {
  const total = measurements.length
  const figures: Record<string, number | string> = {
    suggestionCaseCount: total,
    suggestionCorpusRecordCount: identity.recordCount,
    suggestionCorpusFingerprint: identity.snapshotHash,
    suggestionFloorNarrowingTrigrams: MIN_SHARED_TRIGRAMS,
    suggestionFloorRunChars: MIN_SHARED_RUN_CHARS,
    suggestionLatencyP50Ms: Math.round(cost.p50),
    suggestionLatencyP95Ms: Math.round(cost.p95),
    suggestionLatencyMaxMs: Math.round(cost.max),
    suggestionLatencyBandMultiplier: LATENCY_BAND_MULTIPLIER,
  }
  for (const cutoff of CUTOFFS) {
    const index = CUTOFFS.indexOf(cutoff)
    if (index < 0) continue
    // Keyed by the CUT-OFF (1, 3, 5), never by the array index. The two differ — `CUTOFFS` is
    // [1, 3, MAX_TOP_K] — and keying by index would publish a `suggestionPresenceTop2` column that
    // describes top-3, which is precisely the kind of plausible-looking wrong number this artefact
    // exists to make impossible. Keyed by the value, the key and the column cannot come apart.
    figures[`suggestionPresenceTop${cutoff}`] = presenceAt(measurements, MIN_SHARED_TRIGRAMS, index)
    figures[`suggestionPresenceDenominatorTop${cutoff}`] = total
  }
  for (const rank of Array.from({ length: MAX_TOP_K }, (_unused, index) => index + 1)) {
    const precision = precisionAt(measurements, MIN_SHARED_RUN_CHARS, rank)
    figures[`suggestionPrecisionRank${rank}Hits`] = precision.hits
    figures[`suggestionPrecisionRank${rank}Denominator`] = precision.displayed
  }
  const recalled = floorRecallCost(measurements, MIN_SHARED_RUN_CHARS)
  figures.suggestionRecallShippedTop5 = recalled.shipped
  figures.suggestionRecallGatedTop5 = recalled.gated
  return figures
}

/** The artefact the claim sweep reads, and the path it writes. */
export const ARTEFACT_PATH = "data/benchmark/vs-search.json"

/**
 * Replace every `suggestion*` key in the benchmark artefact with this run's figures.
 *
 * ## Why the namespace is replaced rather than merged
 *
 * A plain merge leaves orphans: when the recorded key set changes — a cut-off renamed, a rank dropped
 * — the old key survives with a plausible-looking number that nothing writes and no rule reads. This
 * run published `suggestionPresenceTop2: 38` describing top-3, because an earlier iteration keyed the
 * cut-offs by array index. A merge made that number permanent and unowned, which is worse than the
 * bug that produced it.
 *
 * So the harness owns the whole `suggestion` namespace outright: every key is removed and every key is
 * rewritten on each `--record`. The retrieval keys above it are untouched — an artefact that lost its
 * own pre-registered hypothesis because someone recorded a latency would be an artefact nobody could
 * diff.
 *
 * Attestation has already passed before this is reachable: the caller computes no figures at all
 * until it does, and a figure describing a corpus nobody vouched for has no business being recorded.
 */
export const recordFigures = (figures: Readonly<Record<string, number | string>>): string => {
  const parsed: unknown = JSON.parse(readFileSync(ARTEFACT_PATH, "utf8"))
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${ARTEFACT_PATH} is not a JSON object, so there is nothing safe to write into`)
  }
  const owned = Object.entries(parsed).filter(([key]) => !key.startsWith("suggestion"))
  writeFileSync(ARTEFACT_PATH, `${JSON.stringify({ ...Object.fromEntries(owned), ...figures }, null, 2)}\n`, "utf8")
  return ARTEFACT_PATH
}

const readCommittedAttestation = (): Result<string, AttestationProblem> => {
  if (!existsSync(ATTESTATION_PATH)) return err(attestationUnreadable(`${ATTESTATION_PATH} does not exist`))
  try {
    return ok(readFileSync(ATTESTATION_PATH, "utf8"))
  } catch (cause) {
    return err(attestationUnreadable(`${ATTESTATION_PATH} could not be read: ${cause instanceof Error ? cause.message : String(cause)}`))
  }
}

/** The corpus's own fingerprint, or a zero hash the caller will refuse to measure against. */
export const readIdentity = (db: Database): SnapshotIdentity => {
  const meta = readSnapshotMeta(db)
  return { snapshotHash: meta.snapshotHash ?? "", recordCount: Number(meta.recordCount) }
}

/**
 * What the measurement depended on, as three strings.
 *
 * Read at the call site and passed in rather than read inside the formatter, so the formatter stays a
 * pure function of its arguments and can be tested without a machine. A CPU list that comes back
 * empty is reported as `unknown` rather than omitted: a condition that is absent reads as a condition
 * that was satisfied.
 */
export type MachineFacts = {
  readonly runtime: string
  readonly platform: string
  readonly cpu: string
}

/** The hardware and runtime this run of the harness executed on. */
export const readMachineFacts = (): MachineFacts => ({
  runtime: `bun ${Bun.version}`,
  platform: `${platform()} ${arch()}`,
  cpu: cpus()[0]?.model.trim() ?? "unknown",
})

/** Everything a figure measured here is only comparable to a figure measured under. */
export type MeasurementConditions = {
  readonly identity: SnapshotIdentity
  readonly caseCount: number
  readonly machine: MachineFacts
}

/**
 * The conditions block, which every document quoting a figure from this harness copies.
 *
 * ## Why this is emitted by the harness rather than written into a document by hand
 *
 * A latency figure has already drifted away from its measurement once in this repository, and the
 * reason it survived is that a number in prose has no owner to contradict it. Printing the figure and
 * the conditions in one run means a document quotes a block this code produced, so the corpus identity
 * in the prose cannot outlive the corpus it described — a re-ingested snapshot changes the hash the
 * next run prints, and the document's copy is then visibly a copy of an older run.
 *
 * It carries an identity, three integers, three strings and no case text: the artefact a document
 * cites contains case ids and hashes only, never a quote and never a question (AGENTS.md §13).
 */
export const conditionsLines = (conditions: MeasurementConditions): readonly string[] => [
  `  command            ${HARNESS_COMMAND}`,
  `  corpus             snapshotHash=${conditions.identity.snapshotHash} recordCount=${conditions.identity.recordCount}`,
  `  cases              ${conditions.caseCount} adversarial fabricated quotes from ${SET_PATH}`,
  `  clocked work       one scan + one ranking at ranker floor ${MIN_SHARED_TRIGRAMS} + the shared-run measurement and display filter on the rows that ranking returned — the product path. The ranker floor sweep and the display floor sweep are this harness's own work and are outside the clock.`,
  `  quantile rule      p50 and p95 are the values at index floor(cases x fraction) of the ascending times, clamped; max is the slowest case. Nothing is interpolated between cases.`,
  `  cache state        cold process: no warm-up scan, the snapshot opened read-only, and nothing written to the corpus`,
  `  runtime            ${conditions.machine.runtime}`,
  `  platform           ${conditions.machine.platform}`,
  `  cpu                ${conditions.machine.cpu}`,
  `  tolerance band     a rerun may differ from a published figure by up to ${LATENCY_BAND_MULTIPLIER}x on p95 and max. A figure published without this block is meaningless (ADR-C10).`,
]

/** The presence table, at the three ranker floors and the three cut-offs. */
const renderTable = (measurements: readonly CaseMeasurement[], total: number): string => {
  const lines = ["| ranker floor | top-1 | top-3 | top-5 |", "| --- | --- | --- | --- |"]
  for (const floor of FLOORS) {
    const cells = CUTOFFS.map((_cutoff, index) => coverageAt(measurements, floor, index, total))
    lines.push(`| ${floor} | ${cells.join(" | ")} |`)
  }
  return lines.join("\n")
}

/**
 * Precision per rank, at the shipped display floor.
 *
 * A row is printed for EVERY rank up to `MAX_TOP_K`, including the ones where nothing was printed.
 * A table that stopped at the last rank with a hit would hide the floor's effect entirely, which is
 * the one thing this table exists to show.
 */
const renderPrecision = (measurements: readonly CaseMeasurement[], floor: number): string => {
  const lines = [
    "| rank | hits | displayed | absent |",
    "| --- | --- | --- | --- |",
  ]
  for (const rank of Array.from({ length: MAX_TOP_K }, (_unused, index) => index + 1)) {
    const precision = precisionAt(measurements, floor, rank)
    lines.push(`| ${rank} | ${precision.hits} | ${precision.displayed} | ${precision.absent} |`)
  }
  return lines.join("\n")
}

/**
 * The floor sweep: what each candidate floor costs in cases.
 *
 * `shipped` is constant across the rows by construction — it is presence at the product's ranker floor
 * before any display floor — which is what makes the `cost` column readable at a glance: a floor that
 * costs 0 buys precision for free, and a floor that costs 3 has to be worth three cases.
 */
const renderSweep = (measurements: readonly CaseMeasurement[]): string => {
  const lines = ["| run floor | anchor shown | shipped | cost |", "| --- | --- | --- | --- |"]
  for (const runFloor of RUN_FLOORS) {
    const recalled = floorRecallCost(measurements, runFloor)
    const mark = runFloor === MIN_SHARED_RUN_CHARS ? " (shipped)" : ""
    lines.push(`| ${runFloor}${mark} | ${recalled.gated}/${measurements.length} | ${recalled.shipped}/${measurements.length} | ${recalled.shipped - recalled.gated} |`)
  }
  return lines.join("\n")
}

const main = (): number => {
  if (!existsSync(CORPUS_PATH)) {
    console.error(`FAIL ${CORPUS_PATH} is missing, so there is no corpus to measure against. Run \`bun run ingest\` first.`)
    return EXIT_UNTRUSTED
  }
  if (!existsSync(SET_PATH)) {
    console.error(`FAIL ${SET_PATH} is missing, so there are no adversarial cases to measure recall against.`)
    return EXIT_UNTRUSTED
  }

  const record = process.argv.slice(2).includes("--record")
  const db = new Database(CORPUS_PATH, { readonly: true })
  try {
    const identity = readIdentity(db)
    const onDisk = `snapshotHash=${identity.snapshotHash} recordCount=${identity.recordCount}`
    if (identity.snapshotHash.length === 0 || !Number.isInteger(identity.recordCount)) {
      console.error(`FAIL ${CORPUS_PATH} records no usable identity: ${onDisk}.`)
      console.error("No figures were computed.")
      return EXIT_UNTRUSTED
    }
    const committed = readCommittedAttestation()
    if (!isOk(committed)) {
      console.error(`FAIL ${describeAttestationProblem(committed.error)}`)
      console.error("No figures were computed.")
      return EXIT_UNTRUSTED
    }
    const attested = attestSnapshot(committed.value, identity)
    if (isErr(attested)) {
      console.error(`FAIL ${describeAttestationProblem(attested.error)}`)
      console.error(`  committed   ${ATTESTATION_PATH}`)
      console.error(`  on disk     ${onDisk}`)
      console.error("No figures were computed.")
      return EXIT_UNTRUSTED
    }

    const decoded = decodeOrFail(decodeSync(EvalSet), JSON.parse(readFileSync(SET_PATH, "utf8")) as unknown, SET_PATH)
    if (!isOk(decoded)) {
      console.error(`FAIL ${SET_PATH} did not decode: ${describeDecodeFailure(decoded.error)}`)
      console.error("No figures were computed.")
      return EXIT_UNTRUSTED
    }

    const cases = casesFrom(decoded.value)

    // `--record` runs the measurement RECORD_RUNS times and publishes the slowest, so the figure of
    // record is chosen by the tool rather than by whoever is reading the output. Measured spread on the
    // recorded machine is ~1.5x on p95 — the whole width of the tolerance band — so "pick the worst of
    // five" cannot be left to memory. A plain run measures once and publishes nothing.
    const runs = record ? RECORD_RUNS : 1
    const measurements: CaseMeasurement[] = []
    const costs: Cost[] = []
    for (let run = 0; run < runs; run += 1) {
      console.error(`# run ${run + 1} of ${runs}`)
      const perRun: CaseMeasurement[] = []
      for (const testCase of cases) {
        perRun.push(measureCase(db, testCase))
        console.error(`  ${testCase.id} ${perRun[perRun.length - 1]?.ms.toFixed(0) ?? "0"}ms`)
      }
      // Only the first run's quality figures are reported: they are deterministic, so printing the
      // tables five times would be five copies of one answer, and a reader comparing them for movement
      // would be comparing identical numbers and wondering why they match.
      if (run === 0) measurements.push(...perRun)
      costs.push(scanCost(perRun))
    }
    const slowest = slowestOf(costs, runs)
    if (slowest === null) return EXIT_UNTRUSTED
    const cost = runs === 1 ? (costs[0] ?? slowest) : slowest
    console.log(`# nearest-quote coverage — ${cases.length} adversarial cases from ${SET_PATH}`)
    console.log(`# corpus ${onDisk}`)
    console.log("# a hit is the anchor's folded span CONTAINED IN a candidate's folded text, not a record id (ADR-10)\n")

    // Quality first and latency second, never interleaved: a wall-clock figure pasted next to a
    // deterministic one invites a reader to treat both as equally re-measurable, and only one of them
    // is. Everything above this line is byte-identical across runs on one commit.
    console.log("## presence — where the adjudicated record lands, at each ranker floor")
    console.log(renderTable(measurements, cases.length))
    console.log(`\n## precision at the display floor of ${MIN_SHARED_RUN_CHARS} shared folded characters`)
    console.log(renderPrecision(measurements, MIN_SHARED_RUN_CHARS))
    console.log(`\n## display floor sweep — the recall each candidate floor costs, in cases`)
    console.log(renderSweep(measurements))
    console.log("\n## latency")
    console.log(`product path per rejected claim (one scan + one ranking at ranker floor ${MIN_SHARED_TRIGRAMS} + the display filter): p50 ${cost.p50.toFixed(0)}ms, p95 ${cost.p95.toFixed(0)}ms, max ${cost.max.toFixed(0)}ms`)
    if (runs > 1) console.log(`that is the slowest of ${runs} runs of this path, componentwise; every run's own figures were p50 ${costs.map((entry) => entry.p50.toFixed(0)).join("/")}ms, p95 ${costs.map((entry) => entry.p95.toFixed(0)).join("/")}ms`)
    console.log("the tables above are measured outside that clock: ranking at three floors and filtering at five is this harness's work, not the product's")
    console.log("the product's target was <50ms p95; this is the honest number for an exhaustive scan with no index (ADR-08)")
    // The conditions travel with the figure in the same run, because a latency number copied out of
    // one run and its conditions copied out of another is how the two drift apart (ADR-C10).
    console.log("\n## conditions — the figures above mean nothing without these")
    for (const line of conditionsLines({ identity, caseCount: cases.length, machine: readMachineFacts() })) console.log(line)

    const drift = attestSnapshotUnchanged(identity, readIdentity(db))
    if (isErr(drift)) {
      console.error(`FAIL ${describeAttestationProblem(drift.error)}`)
      console.error(`  at start   ${onDisk}`)
      console.error("The figures above describe two different corpora and must not be quoted.")
      return EXIT_UNTRUSTED
    }

    if (!record) return 0
    // Recorded only after the end-of-run attestation re-read, so a corpus rewritten mid-run cannot
    // have its figures written into the artefact a document is checked against.
    const written = recordFigures(suggestionFigures(measurements, cost, identity))
    console.log(`\nrecorded flat suggestion figures into ${written} — the artefact \`check:docs\` judges a stated latency against`)
    return 0
  } finally {
    db.close()
  }
}

if (import.meta.main) process.exit(main())

export * as SuggestCoverage from "./suggest-coverage.ts"
