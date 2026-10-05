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
 * ## `--record` is gated on recall, because latency is the only figure an index could improve
 *
 * ADR-08 rejected the one implementation that met the sub-50 ms target — a 46 MB FTS5 sidecar — on the
 * grounds that it returned nothing at all for three of ten adversarial quotes. A change that trades
 * recall for latency is exactly the failure this product exists to prevent, and the FTS spike proved it
 * is the change a performance-minded engineer reaches for.
 *
 * So `recallRegression` runs before anything is written: this run's top-5 presence and gated recall are
 * compared against the recorded baseline, and a regression refuses the write. Note the asymmetry — the
 * latency tolerance band (`LATENCY_BAND_MULTIPLIER`) exists because wall clock is a property of the
 * *machine*, so a rerun on a different laptop must not read as a regression. Recall is a property of the
 * *code*, so no band belongs on it and none is applied here. An artefact carrying no recall baseline is
 * a refusal rather than a pass: a gate that cannot read its own baseline has verified nothing.
 *
 * The latency figures are still printed before this check, because they are a measurement anyone may
 * read. What is refused is *recording* them over a search that lost a record — the latency number would
 * outlive the behaviour it described (ADR-17).
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
import { decodeOrFail, decodeSync, describeDecodeFailure, isErr, isOk, ok, err, normalizeForMatch, EvalSet, type CorpusError, type Result, type Verdict } from "@mizan/core"
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
import { coverageClaim, coverageFigures, renderCoverage, type PresenceProbe } from "./coverage-tables.ts"

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

/**
 * One case, reduced to what this measurement needs. No question text, no prose.
 *
 * `expectedVerdict` is present because the per-collection containment figures are derived from it, not
 * because this harness has an opinion about the verifier. The figure a reader wants — "how many
 * fabrications did this book catch" — has no other source that is not a retyped constant, and the set's
 * adjudication is the one authority for it. The gate's `eval-fabrication-not-rejected` rule is what keeps
 * that derivation honest: a case expecting `verified` fails the build rather than inflating the rejected
 * column of the table.
 */
export type CoverageCase = {
  readonly id: string
  readonly expectedVerdict: Verdict
  /**
   * The citation's collection — which book this fabrication was attempted against.
   *
   * The citation, not the anchor. A case's `anchorId` is the record it quotes, which for
   * `identifier_unresolved` and `collection_ambiguous` is not the collection the citation names, and
   * `collection_ambiguous` names none at all. Per-collection coverage answers "which book was this
   * attempted against", and the anchor answers "which record was it built from"; the two differ whenever
   * a citation was deliberately ambiguous, which is the case class that most needs to be counted honestly.
   */
  readonly collection: string
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
    expectedVerdict: testCase.expectedVerdict,
    collection: testCase.citation.collection,
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

/**
 * The per-collection view of a run: which book each case was attempted against, and whether its anchor
 * reached each cut-off.
 *
 * Built from the measurements already taken rather than from a second pass over the corpus: the hit
 * tables are indexed by case, the cases carry their citation's collection, and pairing the two is a
 * `Map` lookup per case. This is what makes the per-collection figures free (ADR: the breakdown "costs no
 * additional scans"), and the pairing is asserted rather than trusted — a probe whose case id is not in
 * this run's measurements is refused below, because a per-collection figure computed over an incomplete
 * pairing would be a rate with a denominator nobody published.
 *
 * The cut-off index is `MIN_SHARED_TRIGRAMS`'s row, the product's ranker floor, because presence at any
 * other floor is the harness's own experiment and not the list a reader was shown.
 */
export const probesFrom = (
  measurements: readonly CaseMeasurement[],
  cases: readonly CoverageCase[],
): Result<readonly PresenceProbe[], string> => {
  const byId = new Map(measurements.map((entry) => [entry.id, entry]))
  const probes: PresenceProbe[] = []
  for (const testCase of cases) {
    const measured = byId.get(testCase.id)
    if (measured === undefined) return err(`${testCase.id} was measured at no ranker floor, so it has no per-collection presence to report`)
    // The whole hit row, in `CUTOFFS` order — not a single boolean. Collapsing it to one would make a
    // `Top3` figure describe top-5, which is the keying bug that once published `suggestionPresenceTop2`
    // describing top-3 and left it in the artefact permanently.
    const reached = measured.hits[MIN_SHARED_TRIGRAMS]
    if (reached === undefined) return err(`${testCase.id} recorded no hit row at ranker floor ${MIN_SHARED_TRIGRAMS}, so it has no per-collection presence to report`)
    probes.push({ collection: testCase.collection, reached, expected: testCase.expectedVerdict })
  }
  return ok(probes)
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

/** How a thrown IO or JSON error is named, once, so no message invents its own wording. */
const describeCause = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/**
 * Runs a `Result`-returning computation and turns anything thrown inside it into a `Result` failure.
 *
 * ## Why this exists rather than six try/catch blocks
 *
 * Every fallible step in this file returns `Result` already, and the pattern for converting one is
 * always the same two lines: catch, name the cause, return `err`. Written out six times it is six
 * chances to forget the case id, and the one that forgot it produced a message with no measurement in
 * it — which in a harness report is indistinguishable from a repository fault.
 *
 * ## Why the boundary is honest about what it caught
 *
 * `describeCause` returns the thrown value's own message, so an unexpected failure is reported as an
 * unexpected failure and not dressed up as one of the expected ones. A caller can still tell the two
 * apart: expected refusals carry a path or a rule id, and this one carries whatever the runtime said.
 * That distinction matters more than it looks — a corpus fault and a bug in this file have the same
 * exit code, and only the message tells them apart after the fact.
 *
 * The name is `attempt` rather than `attemptEither` because a second type parameter for a function with
 * exactly one caller would be a capability nothing uses.
 */
export const attempt = <T>(compute: () => Result<T, string>): Result<T, string> => {
  try {
    return compute()
  } catch (cause) {
    return err(describeCause(cause))
  }
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
 * ## Why a scan failure is a `Result` and not a throw
 *
 * A row that could not be decoded means the corpus is not the corpus this figure is about, and a
 * coverage number computed over a corpus we could not read is not a coverage number (AGENTS.md
 * section 16). The refusal is unchanged — the run publishes nothing — but the channel is not.
 *
 * `throw` here would have crossed out of this function into `main`'s loop and out of that as an
 * uncaught exception: a stack trace on stderr and exit code 1, which is the same number an ordinary
 * bug produces. The failure a corpus error represents is the one state where a figure must NOT be
 * printed, and a caller that can neither see nor branch on it cannot be relied on to stay quiet.
 * Every other fallible step in `main` already returns a `Result` — `readCommittedAttestation`,
 * `attestSnapshot`, `decodeOrFail` — and this was the one that had not been converted, so a reader
 * auditing the harness could not know which failures it handles. It now handles all of them, and the
 * type system says so at every call site.
 *
 * The error is a `string` rather than a tagged union because it is a harness diagnostic, not a
 * contract: nothing branches on its shape, and a tag would invent a taxonomy with one member.
 *
 * ## Why the whole body is inside the try
 *
 * Only the scan was inside a boundary, and only because it already returned a `Result`. Everything
 * after it — `sharedRunOf`, `rankNeighboursAtFloor`, the `.map` over rows, the lookups into `hits` and
 * `gated` — could throw on a corpus row this harness has not met, and an exception thrown here leaves
 * through `main`'s loop as an uncaught error: a stack trace and exit code 1, indistinguishable from an
 * ordinary bug. That is the exact confusion the scan conversion above was made to remove, left in place
 * for every step after it. So the conversion is finished here rather than half-applied, and the test
 * suite plants a collaborator that throws to prove the boundary is real rather than decorative.
 *
 * ## Why completeness is checked before returning `ok`
 *
 * `hits[floor]` and `gated[runFloor]` are filled by the two loops directly above, so they are complete
 * by construction — today. That is a property of this function's body, and a later edit that adds a
 * floor, filters one, or returns early would break it silently: `coverageAt` counts a missing entry as a
 * *miss* (deliberately, and correctly — a case that was not measured is not a hit), so an incomplete
 * table would publish a coverage number that is quietly too low, and `precisionAt` would publish a
 * denominator that is quietly too small. A figure that flatters the harness by accident is the one
 * thing this repository is not allowed to ship, so the invariant is asserted rather than assumed, and
 * its failure is a refusal to publish.
 */
export const measureCase = (db: Database, testCase: CoverageCase): Result<CaseMeasurement, string> => {
  const startedAt = performance.now()
  return attempt(() => {
    const scanned = scanSuggestionCandidates(db, testCase.quote, SCAN_FLOOR)
    if (!isOk(scanned)) return err(`scan failed: ${describeCorpusError(scanned.error)}`)
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
    const incomplete = incompleteFloors(hits, gated)
    if (incomplete !== null) return err(`${testCase.id}: ${incomplete}`)
    return ok({ id: testCase.id, ms, hits, gated })
  })
}

/**
 * The floor whose table is short, or `null` when every one is full.
 *
 * ## Why this is worth a check at all
 *
 * See the note on `measureCase`. `coverageAt` counts a missing `hits` entry as a miss and `precisionAt`
 * reads `gated[floor]` with a fallback of zero, so both are total functions over a table that is complete
 * only by accident. Both were written that way on purpose — a case that was not measured is not a hit,
 * and an unmeasured rank is not a display — which is exactly why the *producer* has to be the place that
 * refuses: the readers cannot, by design, be the ones who notice.
 */
export const incompleteFloors = (hits: Readonly<Record<number, boolean[]>>, gated: Readonly<Record<number, Displayed>>): string | null => {
  const short = FLOORS.filter((floor) => hits[floor]?.length !== CUTOFFS.length)
  if (short.length > 0) return `${short.length} of ${FLOORS.length} ranker floors recorded no full cut-off table: ${short.join(", ")}`
  const ungated = RUN_FLOORS.filter((runFloor) => gated[runFloor] === undefined)
  if (ungated.length > 0) return `${ungated.length} of ${RUN_FLOORS.length} display floors recorded nothing at all: ${ungated.join(", ")}`
  return null
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
 * There are exactly two non-numeric keys, and both are identities. `suggestionCorpusFingerprint` is
 * there because a latency number without the corpus it was measured on is a number about nothing;
 * `suggestionEvalSetDigest` is there because a recall *rate* without the case set it is a rate of is
 * worse — it looks comparable to the one before it and is not. The claim rule reads the corpus
 * fingerprint directly rather than through `readFigures`, which is why it is named explicitly rather
 * than swept up with the rest.
 *
 * Key names are the contract between this harness and `checkLatencyFigureUnbacked`. They are
 * namespaced under `suggestion` so they cannot collide with the retrieval figures already in the file,
 * and they are declared once, here.
 */
export const suggestionFigures = (
  measurements: readonly CaseMeasurement[],
  cost: { readonly p50: number; readonly p95: number; readonly max: number },
  identity: SnapshotIdentity,
  evalSetDigest: string,
  probes: readonly PresenceProbe[] = [],
  served: Readonly<Record<string, number>> = {},
): Readonly<Record<string, number | string>> => {
  const total = measurements.length
  const figures: Record<string, number | string> = {
    suggestionCaseCount: total,
    suggestionCorpusRecordCount: identity.recordCount,
    suggestionCorpusFingerprint: identity.snapshotHash,
    // The denominator, recorded beside the ratio it is a ratio of. `recallRegression` refuses a run
    // whose digest differs from this one, so a regenerated case set cannot be compared against a
    // baseline that was measured over a different one — the shift that reports a pass over evidence
    // nobody could have compared (ADR-17).
    [BASELINE_IDENTITY_KEY]: evalSetDigest,
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
  // Per-collection figures, spread last so they cannot displace a key above them. Present only when the
  // run had a served set to measure against — an empty object would publish `sharePercent: 0` and read as
  // "measured nothing", which is a different statement from "this harness was not asked".
  if (Object.keys(served).length > 0) Object.assign(figures, coverageFigures(probes, CUTOFFS, served))
  return figures
}

/** The artefact the claim sweep reads, and the path it writes. */
export const ARTEFACT_PATH = "data/benchmark/vs-search.json"

/**
 * The recall keys a recorded run must carry before another run may be recorded against it.
 *
 * Named once, and read from the artefact rather than hardcoded, because the whole point is that the
 * precondition is stated by the artefact and not by this file: a gate whose floor is a literal here is
 * a floor the next engineer changes without noticing the baseline it was defending.
 */
export const RECALL_BASELINE_KEYS = ["suggestionPresenceTop5", "suggestionRecallGatedTop5"] as const

/**
 * The identity key a recorded run must carry before another run may be compared against it.
 *
 * The baseline is a count over a case set, and a count without its denominator is not a measurement —
 * it is an integer. `vs-search.json` already records the *corpus* fingerprint, which covers the data
 * being searched; this covers the questions being asked of it. Regenerating the red-team set changes
 * the denominator, which is the failure ADR-17 names as the dangerous one: the aggregate can land on
 * the same value, the comparison reports a pass, and the output is indistinguishable from a real one.
 *
 * A distinct constant rather than a third entry in `RECALL_BASELINE_KEYS`, because it is a different
 * kind of check — a string equality, not a floor — and lumping the two together would let a future edit
 * relax one while appearing to preserve the other.
 */
export const BASELINE_IDENTITY_KEY = "suggestionEvalSetDigest"

/**
 * Whether this run lost recall against the recorded baseline, or a typed reason it cannot tell.
 *
 * ## Why recall gates the record and latency does not gate itself
 *
 * ADR-17: the sidecar ADR-08 rejected was the only option fast enough, and it returned nothing for
 * three of ten adversarial quotes. A change that trades recall for latency is the failure this product
 * exists to prevent, so it may not be *recorded* — and `--record` is the only way a number reaches the
 * artefact a document is checked against, which makes the precondition here rather than in review.
 *
 * The asymmetry is deliberate and it is the reason the tolerance band applies to latency alone: wall
 * clock is a property of the machine, so `LATENCY_BAND_MULTIPLIER` exists to absorb a different
 * laptop. Recall is a property of the code, so a dropped record is a regression with no machine that
 * explains it away, and **no tolerance band belongs on it**.
 *
 * ## Identity is checked before recall, because a floor over the wrong denominator is not a floor
 *
 * Order is the whole point, and it is why this is one function rather than two called at the call site:
 * comparing 40/40 against a 40-case set with the current 41-case set would pass while describing two
 * different experiments. So the recorded `suggestionEvalSetDigest` is compared first, and a changed set
 * refuses here rather than producing a recall verdict that would read as a pass.
 *
 * ## Three refusals, and why absent is one of them
 *
 * An artefact carrying neither key is treated as a refusal, not as a pass. That is `identityMismatch`'s
 * reasoning applied to a floor: "I cannot tell" and "it is fine" are different answers, and a gate
 * that cannot read its own baseline has not verified anything (AGENTS.md section 3). A baseline written
 * before recall was recorded therefore blocks the first new record rather than waving it through.
 *
 * ## Why every refusal names `--rebaseline` and never a hand edit
 *
 * The first version of these messages told the operator to add a number to `vs-search.json` by hand.
 * That is the same defect as `checkSnapshotArithmetic` reading a figure a person typed: the value is
 * now unfalsifiable, because the only thing that ever measured it was a person deciding what it should
 * be. It also made the *legitimate* case — the eval set was legitimately regenerated, so the recorded
 * floor describes a different denominator — indistinguishable from a real regression, and the only way
 * through was to edit the file.
 *
 * `--rebaseline` is that legitimate case as a command: it re-measures over the set on disk and
 * rewrites the baseline from that measurement, so the value is still one a run produced. It is a
 * separate mode rather than a flag on `--record` because it is the only path that may move a floor
 * down, and a flag would let that reach the artefact without its own name in the invocation.
 */
export const recallRegression = (
  baseline: Readonly<Record<string, unknown>>,
  figures: Readonly<Record<string, number | string>>,
  evalSetDigest: string,
): Result<string, string> => {
  const recordedIdentity = baseline[BASELINE_IDENTITY_KEY]
  if (typeof recordedIdentity !== "string") {
    return err(`${ARTEFACT_PATH} records no \`${BASELINE_IDENTITY_KEY}\`, so this run's recall has no denominator to be compared against. That key was added when every eval set gained a \`datasetDigest\`, and an artefact written before it cannot be compared to anything. Run \`bun run eval:suggestions --rebaseline\` to measure over the set on disk and record the result`)
  }
  if (recordedIdentity !== evalSetDigest) {
    return err(`the eval set is not the one this baseline was measured over: ${SET_PATH} is \`${evalSetDigest}\` and ${ARTEFACT_PATH} recorded \`${recordedIdentity}\`. A recall rate over a different case set is not a pass or a regression, it is a different measurement — run \`bun run eval:suggestions --rebaseline\` to re-measure over the current set`)
  }
  for (const key of RECALL_BASELINE_KEYS) {
    const recorded = baseline[key]
    if (typeof recorded !== "number") {
      return err(`${ARTEFACT_PATH} records no \`${key}\`, so this run's recall cannot be compared against a baseline, and a figure with no floor is not a measurement. Run \`bun run eval:suggestions --rebaseline\` to measure and record this run's \`${key}\``)
    }
    const current = figures[key]
    if (typeof current !== "number") {
      return err(`this run computed no \`${key}\`, so it cannot be compared against the recorded ${recorded}`)
    }
    if (current < recorded) {
      return err(`recall regressed: \`${key}\` is ${current} against a recorded ${recorded}. A record that is no longer found is worse than a slow one (ADR-17), and no latency figure may be recorded over it — fix the search, and do not rebaseline this away`)
    }
  }
  return ok("recall holds")
}

/**
 * What `--rebaseline` moved, printed before the write so the movement is on the record.
 *
 * ## Why this exists at all
 *
 * Because `--rebaseline` is the one command that may lower a floor, and a floor that moved with no
 * explanation is indistinguishable from a regression someone waved through. Printing old -> new for
 * every key it touches, with the digest it is now measured over, means the next reader of the artefact
 * sees the movement in the commit that made it rather than having to diff two JSON files to find out.
 *
 * A key the artefact did not carry reads `none` rather than being skipped, because "the floor did not
 * exist before this run" is the more useful half of the report when somebody is reading it to decide
 * whether the baseline was quietly replaced.
 */
export const rebaselineReport = (
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, number | string>>,
  evalSetDigest: string,
): readonly string[] => {
  const rows = [
    ...RECALL_BASELINE_KEYS.map((key) => {
      const was = before[key]
      const recorded = typeof was === "number" ? String(was) : "none"
      return `  ${key}: ${recorded} -> ${after[key] ?? "uncomputed"}`
    }),
    `  ${BASELINE_IDENTITY_KEY}: ${typeof before[BASELINE_IDENTITY_KEY] === "string" ? String(before[BASELINE_IDENTITY_KEY]) : "none"} -> ${evalSetDigest}`,
  ]
  return [
    "",
    `REBASELINED — the recall floor was NOT compared against before this run, and it has now been rewritten from this measurement.`,
    `Every floor above moved to whatever this run measured, including a drop. If that is wrong, revert this run's commit; do not re-record over it.`,
    ...rows,
    "",
  ]
}

/**
 * What this invocation is allowed to do.
 *
 * Four modes, and the point of naming them is that the *default* and the *gate* are different commands.
 * A plain run prints measurements and writes nothing, so a reader who runs the harness "to see the
 * numbers" cannot silently move the baseline every document is checked against. `--check` is the gate:
 * it compares against the recorded baseline and writes nothing, which is what the acceptance step needs
 * and what a CI job needs. `--record` is the only path into the artefact, and `--rebaseline` is the one
 * mode that may move a baseline *down*.
 */
export type CoverageMode = "measure" | "check" | "record" | "rebaseline"

export const COVERAGE_MODE_FLAGS: Readonly<Record<CoverageMode, string>> = {
  measure: "",
  check: "--check",
  record: "--record",
  rebaseline: "--rebaseline",
}

/**
 * The mode this argv asks for, or the reason it cannot be told.
 *
 * ## Why an unrecognised flag refuses instead of being ignored
 *
 * Because `--chek` is a typo, and a harness that ignored it would run in `measure`, print a table, and
 * exit 0 — which the acceptance step would read as a pass. A refusal names the four flags that exist.
 * This is the same fail-closed line as everywhere else (AGENTS.md section 3), and it is cheap here
 * because the accepted set is four strings.
 *
 * Two modes at once refuses for the same reason with one extra word: `--record --rebaseline` reads like
 * "record, and it's fine", and the combination that means something is only obvious to whoever typed it.
 */
export const parseCoverageMode = (argv: readonly string[]): Result<CoverageMode, string> => {
  const requested = argv.filter((arg) => arg.startsWith("--"))
  const modes = requested.filter((flag) => (Object.values(COVERAGE_MODE_FLAGS) as readonly string[]).includes(flag))
  if (modes.length > 1) return err(`this run asked for two modes at once (${modes.join(", ")}); pass exactly one of --check, --record, --rebaseline, or none to measure`)
  const unknown = requested.filter((flag) => !(Object.values(COVERAGE_MODE_FLAGS) as readonly string[]).includes(flag))
  if (unknown.length > 0) return err(`unknown flag ${unknown.join(", ")}; this harness takes --check, --record, --rebaseline, or none`)
  if (argv.length !== requested.length) return err(`this harness takes flags, not positional arguments (${argv.filter((arg) => !arg.startsWith("--")).join(", ")})`)
  const mode = modes[0]
  if (mode === undefined) return ok("measure")
  if (mode === COVERAGE_MODE_FLAGS.check) return ok("check")
  if (mode === COVERAGE_MODE_FLAGS.record) return ok("record")
  return ok("rebaseline")
}

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
 *
 * ## Why the path is a parameter and why this returns a `Result`
 *
 * The path is passed in so the rule is testable against a file the test owns, instead of against the
 * committed artefact. The `Result` is the same discipline as the scan's: an artefact that is not a
 * JSON object is not a place this harness may write, and a `throw` would exit 1 with a stack trace
 * between the latency table and the record line — the one place a reader is told a figure was
 * published (AGENTS.md §2).
 */
export const recordFigures = (artefactPath: string, figures: Readonly<Record<string, number | string>>): Result<string, string> => {
  const read = readTextFile(artefactPath)
  if (!isOk(read)) return err(read.error)
  const parsed = parseJsonObject(read.value, artefactPath)
  if (!isOk(parsed)) return err(parsed.error)
  const owned = Object.entries(parsed.value).filter(([key]) => !key.startsWith("suggestion"))
  try {
    writeFileSync(artefactPath, `${JSON.stringify({ ...Object.fromEntries(owned), ...figures }, null, 2)}\n`, "utf8")
  } catch (cause) {
    return err(`${artefactPath} could not be written: ${describeCause(cause)}`)
  }
  return ok(artefactPath)
}

/**
 * A committed file's text, or the reason it could not be read.
 *
 * The reason every read in this harness goes through here rather than through `readFileSync` directly:
 * a file that cannot be read is a figure that cannot be published, so it has to arrive as a value
 * `main` can print and refuse on. A `throw` from `readFileSync` would be an uncaught exception instead
 * — exit code 1, a stack trace, and no statement of which measurement was refused (AGENTS.md §2).
 */
const readTextFile = (path: string): Result<string, string> => {
  try {
    return ok(readFileSync(path, "utf8"))
  } catch (cause) {
    return err(`${path} could not be read: ${describeCause(cause)}`)
  }
}

/** Parsed as an object, or refused. An array or a bare scalar carries no key to replace. */
const parseJsonObject = (text: string, path: string): Result<Readonly<Record<string, unknown>>, string> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (cause) {
    return err(`${path} is not valid JSON: ${describeCause(cause)}`)
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return err(`${path} is not a JSON object, so there is nothing here to read as one`)
  }
  return ok(parsed as Readonly<Record<string, unknown>>)
}

/**
 * The recorded artefact as it stands, or the reason it cannot be read.
 *
 * Read BEFORE the figures are recorded so `recallRegression` has a baseline to compare against. A
 * missing artefact is a refusal rather than a pass: there is no baseline, so there is nothing the
 * recall gate could have verified (AGENTS.md section 3).
 */
export const readBaseline = (path: string = ARTEFACT_PATH): Result<Readonly<Record<string, unknown>>, string> => {
  const read = readTextFile(path)
  if (!isOk(read)) return err(read.error)
  return parseJsonObject(read.value, path)
}

/**
 * The corpus, opened read-only, or the reason it could not be opened.
 *
 * A `Database` constructor over a truncated or non-SQLite file throws. That is the exact environment
 * the story calls unmeasurable, and it is also the one where a stack trace would be the only thing a
 * reader saw — so the refusal is a value carrying the reason, and `main` prints it and exits 3 having
 * published nothing.
 */
const openCorpus = (): Result<Database, string> => {
  try {
    return ok(new Database(CORPUS_PATH, { readonly: true }))
  } catch (cause) {
    return err(`${CORPUS_PATH} could not be opened: ${describeCause(cause)}`)
  }
}

const readCommittedAttestation = (): Result<string, AttestationProblem> => {
  if (!existsSync(ATTESTATION_PATH)) return err(attestationUnreadable(`${ATTESTATION_PATH} does not exist`))
  const read = readTextFile(ATTESTATION_PATH)
  if (!isOk(read)) return err(attestationUnreadable(read.error))
  return ok(read.value)
}

/**
 * The adversarial set, decoded, or the reason it could not be.
 *
 * Both halves are here rather than in `main` because both can fail on a committed file — a truncated
 * JSON body and a well-formed body with a case missing `quote` are different defects with the same
 * consequence, and both must leave the run with no figure printed rather than with a stack trace
 * between two tables.
 */
const readEvalSet = (): Result<EvalSet, string> => {
  const read = readTextFile(SET_PATH)
  if (!isOk(read)) return err(read.error)
  const parsed = parseJsonObject(read.value, SET_PATH)
  if (!isOk(parsed)) return err(parsed.error)
  const decoded = decodeOrFail(decodeSync(EvalSet), parsed.value, SET_PATH)
  if (!isOk(decoded)) return err(`${SET_PATH} did not decode: ${describeDecodeFailure(decoded.error)}`)
  return ok(decoded.value)
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

/**
 * The refusal every unmeasurable precondition takes: one `FAIL` line naming the reason, the line that
 * says no figure was computed, and the exit code that means "the measurement is untrusted".
 *
 * One function so the three cannot come apart — the message that names the reason and the exit code
 * that says what it means are the same promise, and a branch that printed a reason and returned 0
 * would be a green run describing nothing.
 */
const refuse = (reason: string): number => {
  console.error(`FAIL ${reason}`)
  console.error("No figures were computed.")
  return EXIT_UNTRUSTED
}

const main = (): number => {
  // The mode first, before anything is measured. An argv this harness cannot read is refused without
  // touching the corpus, because a typo'd flag that quietly became a `measure` run would print a table
  // that reads as a result to whoever ran it.
  const mode = parseCoverageMode(process.argv.slice(2))
  if (!isOk(mode)) return refuse(mode.error)
  if (!existsSync(CORPUS_PATH)) {
    console.error(`FAIL ${CORPUS_PATH} is missing, so there is no corpus to measure against. Run \`bun run ingest\` first.`)
    return EXIT_UNTRUSTED
  }
  if (!existsSync(SET_PATH)) {
    console.error(`FAIL ${SET_PATH} is missing, so there are no adversarial cases to measure recall against.`)
    return EXIT_UNTRUSTED
  }

  const record = mode.value === "record" || mode.value === "rebaseline"
  // Opened through the `Result` rather than constructed here: a corpus file that is present and is not
  // a database is a precondition this harness can state, and a constructor throw would answer it with
  // a stack trace and exit code 1.
  const opened = openCorpus()
  if (!isOk(opened)) return refuse(opened.error)
  const db = opened.value
  try {
    const identity = readIdentity(db)
    const onDisk = `snapshotHash=${identity.snapshotHash} recordCount=${identity.recordCount}`
    if (identity.snapshotHash.length === 0 || !Number.isInteger(identity.recordCount)) {
      return refuse(`${CORPUS_PATH} records no usable identity: ${onDisk}.`)
    }
    const committed = readCommittedAttestation()
    if (!isOk(committed)) return refuse(describeAttestationProblem(committed.error))
    const attested = attestSnapshot(committed.value, identity)
    if (isErr(attested)) {
      console.error(`FAIL ${describeAttestationProblem(attested.error)}`)
      console.error(`  committed   ${ATTESTATION_PATH}`)
      console.error(`  on disk     ${onDisk}`)
      console.error("No figures were computed.")
      return EXIT_UNTRUSTED
    }

    const set = readEvalSet()
    if (!isOk(set)) return refuse(set.error)

    const cases = casesFrom(set.value)
    // The served set, from the attestation that was just verified against the on-disk corpus. Read from
    // the attestation and nowhere else, so the population every per-collection figure is a share of has
    // exactly one authority (AGENTS.md section 17).
    const served = attested.value.collectionCounts

    // `--record` runs the measurement RECORD_RUNS times and publishes the slowest, so the figure of
    // record is chosen by the tool rather than by whoever is reading the output. Measured spread on the
    // recorded machine is ~1.5x on p95 — the whole width of the tolerance band — so "pick the worst of
    // five" cannot be left to memory. A plain run measures once and publishes nothing.
    //
    // The run loop stops at the end of the first run that could not measure every case, and every reason
    // that run produced is reported together. Two properties, both load-bearing: the loop does not spend
    // four more minutes re-measuring a corpus it has already failed to read, and a five-run `--record`
    // does not print the same unreadable case five times. Nothing below this block runs if `reasons` is
    // non-empty, so a run with an unreadable case publishes no figure at all rather than a table of 39.
    const runs = record ? RECORD_RUNS : 1
    const measurements: CaseMeasurement[] = []
    const costs: Cost[] = []
    const reasons = new Set<string>()
    for (let run = 0; run < runs && reasons.size === 0; run += 1) {
      console.error(`# run ${run + 1} of ${runs}`)
      const perRun: CaseMeasurement[] = []
      for (const testCase of cases) {
        const measured = measureCase(db, testCase)
        if (!isOk(measured)) {
          reasons.add(`${testCase.id}: ${measured.error}`)
          continue
        }
        perRun.push(measured.value)
        console.error(`  ${testCase.id} ${measured.value.ms.toFixed(0)}ms`)
      }
      // Only the first run's quality figures are reported: they are deterministic, so printing the
      // tables five times would be five copies of one answer, and a reader comparing them for movement
      // would be comparing identical numbers and wondering why they match.
      if (run === 0) measurements.push(...perRun)
      costs.push(scanCost(perRun))
    }
    if (reasons.size > 0) {
      // Every reason, not the first: a run that could not measure five cases says so five times, because
      // the fix is a corpus defect and the operator needs all of it at once.
      for (const reason of reasons) console.error(`FAIL ${reason}`)
      console.error("No figures were computed.")
      return EXIT_UNTRUSTED
    }
    const slowest = slowestOf(costs, runs)
    if (slowest === null) return EXIT_UNTRUSTED
    const cost = runs === 1 ? (costs[0] ?? slowest) : slowest
    const probes = probesFrom(measurements, cases)
    if (!isOk(probes)) return refuse(probes.error)
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
    // Per collection BEFORE the aggregate recall sentence, and immediately above it, because the sentence
    // below is the one a customer quotes and the table is the only thing that tells them what it is over.
    // The claim sentence is generated from the same probes as the table and the recorded keys, so the
    // product's disclosure and the artefact cannot become two descriptions of one measurement.
    console.log(`\n## presence per collection — ${coverageClaim(probes.value, served)}`)
    console.log(renderCoverage(probes.value, CUTOFFS, served))
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

    // `measure` ends here: it printed the figures above and wrote nothing. Returning *before* the
    // baseline is read is what makes the default mode safe — there is no code path below this line that
    // can write, and therefore no default invocation that can move a floor.
    if (mode.value === "measure") return 0
    // Recorded only after the end-of-run attestation re-read, so a corpus rewritten mid-run cannot
    // have its figures written into the artefact a document is checked against.
    //
    // A write that fails is reported and exits 3, not swallowed: the figures above were printed, and a
    // reader who is told nothing would quote a number that no artefact carries and no rule can then
    // check. The word "recorded" is only true when this line prints (AGENTS.md §16).
    const figures = suggestionFigures(measurements, cost, identity, set.value.datasetDigest, probes.value, served)
    const baseline = readBaseline()
    if (!isOk(baseline)) return refuse(baseline.error)
    // ADR-17: recall is a PRECONDITION, not a figure. The latency figures above are already printed
    // — they are a measurement anyone may read — but they may not be *recorded* over a search change
    // that lost the record it was derived from. `--record` and `--check` are the only paths into the
    // artefact a document is checked against, so this is the place the gate belongs: a search that
    // traded recall for the sub-50 ms target passes every other check in this repository, and this is
    // the one that refuses it.
    //
    // `--check` takes this same refusal and turns it into the exit code, writing nothing — which is what
    // the acceptance step and a CI job need, and what `measure` cannot give them because `measure`
    // refuses to read a baseline at all.
    if (mode.value === "rebaseline") {
      for (const line of rebaselineReport(baseline.value, figures, set.value.datasetDigest)) console.log(line)
    } else {
      const recall = recallRegression(baseline.value, figures, set.value.datasetDigest)
      if (!isOk(recall)) return refuse(recall.error)
      // `--check` stops one line below the write. Read a baseline, compare, and publish a verdict —
      // with no path from here to `recordFigures`, so a check that passed cannot have moved a floor.
      if (mode.value === "check") {
        console.log(`\n${recall.value} — measured against ${ARTEFACT_PATH} over the set digest \`${set.value.datasetDigest}\`. Nothing was written; run \`bun run eval:suggestions --record\` to publish these figures.`)
        return 0
      }
    }
    const written = recordFigures(ARTEFACT_PATH, figures)
    if (!isOk(written)) return refuse(written.error)
    console.log(`\nrecorded flat suggestion figures into ${written.value} — the artefact \`check:docs\` judges a stated latency against`)
    return 0
  } finally {
    db.close()
  }
}

if (import.meta.main) process.exit(main())

export * as SuggestCoverage from "./suggest-coverage.ts"
