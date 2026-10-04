#!/usr/bin/env bun
/**
 * `bun run eval:suggestions` — does the nearest-quote list actually reach the record a fabrication
 * came from, and what does the search cost?
 *
 * ## What this measures, and what it deliberately does not
 *
 * RECALL against the red-team set, at three floors and three cut-offs, plus the wall clock of one
 * scan. It is not a benchmark of answer quality and it prints no figure about verdicts: the badge is
 * decided by `@mizan/verify` on exact containment (ADR-03) and nothing here can touch it.
 *
 * A hit is measured on FOLDED TEXT, not on a record id. The corpus stores the same Qur'anic text
 * under several ids (ADR-10), so an id comparison would score the correct answer as a miss for every
 * duplicate and report a recall problem that does not exist. What the reader wants is the text.
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
 * ## Nothing is written
 *
 * The snapshot is opened read-only and stdout is the only output. This is a measurement, not a run:
 * a number in `data/` would look like a recorded fact of the product, and a coverage figure that can
 * be regenerated in a minute does not need a schema to be trustworthy.
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
import { existsSync, readFileSync } from "node:fs"
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

/** Reserved for an integrity failure: a figure printed here would describe nothing. */
export const EXIT_UNTRUSTED = 3

/** The floors this harness reports. The product passes `MIN_SHARED_TRIGRAMS`; ADR-09 explains why. */
export const FLOORS = [4, 8, 12] as const

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

/** One case's result: whether the anchor was inside each cut-off, at each floor. */
export type CaseMeasurement = {
  readonly id: string
  readonly ms: number
  /** `hits[floor]` is one boolean per entry of {@link CUTOFFS}, in the same order. */
  readonly hits: Readonly<Record<number, readonly boolean[]>>
}

/**
 * Scan once, time the product's own path, and report recall at every floor.
 *
 * ## What the clock covers, and what it deliberately does not
 *
 * `ms` is the work a user waits for when one claim is rejected: one scan of the corpus and one ranking
 * at the floor the product actually uses. The recall sweep below ranks the same rows at three floors to
 * keep ADR-09's choice defensible, and that is *measurement* work a user never pays for — so it is
 * outside the clock. Timing it would report this harness's cost as the product's cost, which is the one
 * number in this repository that must not be flattered (AGENTS.md section 13).
 *
 * Throws on a scan failure rather than counting it as a miss: a row that could not be decoded means
 * the corpus is not the corpus this figure is about, and a coverage number computed over a corpus we
 * could not read is not a coverage number (AGENTS.md section 16). The caller has already checked the
 * attestation, so the honest outcome is a loud failure.
 */
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

  rankedAt(MIN_SHARED_TRIGRAMS)
  const ms = performance.now() - startedAt

  const hits: Record<number, boolean[]> = {}
  for (const floor of FLOORS) {
    const ranked = rankedAt(floor)
    hits[floor] = CUTOFFS.map((cutoff) => isHit(testCase.anchorFolded, ranked.slice(0, cutoff)))
  }
  return { id: testCase.id, ms, hits }
}

/** `hits/cases` for one floor and one cut-off index. A missing entry counts as a miss, not as a skip. */
export const coverageAt = (measurements: readonly CaseMeasurement[], floor: number, cutoffIndex: number, total: number): string => {
  const hits = measurements.filter((entry) => entry.hits[floor]?.[cutoffIndex] === true).length
  return `${hits}/${total}`
}

/**
 * p50 / p95 / max over the per-case times.
 *
 * Sorted by VALUE, never by case id, so the figure depends on the run and not on the order the cases
 * were declared in. The quantile is the value at index `floor(n * f)`, clamped — the conventional
 * choice for a small sample, where interpolating a number between two cases would invent one.
 */
export const scanCost = (measurements: readonly CaseMeasurement[]): { readonly p50: number; readonly p95: number; readonly max: number } => {
  const times = measurements.map((entry) => entry.ms).sort((a, b) => a - b)
  const at = (fraction: number): number => times[Math.min(times.length - 1, Math.floor(times.length * fraction))] ?? 0
  return { p50: at(0.5), p95: at(0.95), max: times[times.length - 1] ?? 0 }
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
  `  clocked work       one scan + one ranking at floor ${MIN_SHARED_TRIGRAMS} — the product path. The recall table's three floors is this harness's own work and is outside the clock.`,
  `  quantile rule      p50 and p95 are the values at index floor(cases x fraction) of the ascending times, clamped; max is the slowest case. Nothing is interpolated between cases.`,
  `  cache state        cold process: no warm-up scan, the snapshot opened read-only, and nothing written to the corpus`,
  `  runtime            ${conditions.machine.runtime}`,
  `  platform           ${conditions.machine.platform}`,
  `  cpu                ${conditions.machine.cpu}`,
  `  tolerance band     a rerun may differ from a published figure by up to ${LATENCY_BAND_MULTIPLIER}x on p95 and max. A figure published without this block is meaningless (ADR-C10).`,
]

const renderTable = (measurements: readonly CaseMeasurement[], total: number): string => {
  const lines = ["| floor | top-1 | top-3 | top-5 |", "| --- | --- | --- | --- |"]
  for (const floor of FLOORS) {
    const cells = CUTOFFS.map((_cutoff, index) => coverageAt(measurements, floor, index, total))
    lines.push(`| ${floor} | ${cells.join(" | ")} |`)
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
    const measurements: CaseMeasurement[] = []
    for (const testCase of cases) {
      measurements.push(measureCase(db, testCase))
      console.error(`  ${testCase.id} ${measurements[measurements.length - 1]?.ms.toFixed(0) ?? "0"}ms`)
    }
    const cost = scanCost(measurements)
    console.log(`# nearest-quote coverage — ${cases.length} adversarial cases from ${SET_PATH}`)
    console.log(`# corpus ${onDisk}`)
    console.log("# a hit is the anchor's folded span CONTAINED IN a candidate's folded text, not a record id (ADR-10)\n")

    console.log(renderTable(measurements, cases.length))
    console.log(`\nproduct path per rejected claim (one scan + one ranking at floor ${MIN_SHARED_TRIGRAMS}): p50 ${cost.p50.toFixed(0)}ms, p95 ${cost.p95.toFixed(0)}ms, max ${cost.max.toFixed(0)}ms`)
    console.log("the recall table above is measured outside that clock: ranking the same rows at three floors is this harness's work, not the product's")
    console.log("the product's target was <50ms p95; this is the honest number for an exhaustive scan with no index (ADR-08)")
    // The conditions travel with the figure in the same run, because a latency number copied out of
    // one run and its conditions copied out of another is how the two drift apart (ADR-C10).
    console.log("\n## conditions — the figure above means nothing without these")
    for (const line of conditionsLines({ identity, caseCount: cases.length, machine: readMachineFacts() })) console.log(line)

    const drift = attestSnapshotUnchanged(identity, readIdentity(db))
    if (isErr(drift)) {
      console.error(`FAIL ${describeAttestationProblem(drift.error)}`)
      console.error(`  at start   ${onDisk}`)
      console.error("The figures above describe two different corpora and must not be quoted.")
      return EXIT_UNTRUSTED
    }
    return 0
  } finally {
    db.close()
  }
}

if (import.meta.main) process.exit(main())

export * as SuggestCoverage from "./suggest-coverage.ts"
