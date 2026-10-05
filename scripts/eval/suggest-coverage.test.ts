import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { err, normalizeForMatch, isErr, isOk, ok, unwrapOrThrow } from "@mizan/core"
import { buildSnapshot, openSnapshot, toCorpusRecord } from "@mizan/corpus"
import { MIN_SHARED_TRIGRAMS } from "@mizan/suggest"
import { caseCountsByCollection, verdictCountsByCollection, type PresenceProbe } from "./coverage-tables.ts"
import { MIN_SHARED_RUN_CHARS } from "@mizan/verify"
import {
  CUTOFFS,
  ARTEFACT_PATH,
  FLOORS,
  HARNESS_COMMAND,
  BASELINE_IDENTITY_KEY,
  LATENCY_BAND_MULTIPLIER,
  RECALL_BASELINE_KEYS,
  RUN_FLOORS,
attempt,
  casesFrom,
  COVERAGE_MODE_FLAGS,
  conditionsLines,
  coverageAt,
  floorRecallCost,
  incompleteFloors,
  isHit,
  measureCase,
  parseCoverageMode,
  precisionAt,
  readBaseline,
  rebaselineReport,
  recallRegression,
  recordFigures,
  scanCost,
  slowestOf,
  suggestionFigures,
  RECORD_RUNS,
  type CaseMeasurement,
  type CoverageCase,
  type CoverageMode,
  type Displayed,
  type MeasurementConditions,
} from "./suggest-coverage.ts"

/**
 * The harness's own arithmetic, over a corpus small enough to be obvious.
 *
 * The harness's `main()` reads the committed corpus, takes about a minute, and asserts nothing on
 * its own — a measurement you cannot fail is not a guard. So the FIGURES it computes are tested
 * here against a fixture where the right answer is known by construction, and `main()` is left to
 * be run by a person who wants the number.
 *
 * Four properties are pinned here, and each one is a way the number could have lied:
 *   1. a hit is FOLDED TEXT, not a record id — the corpus stores the same verse twice, so an
 *      id-based test would report a miss where the reader gets the right answer;
 *   2. a cut-off is a PREFIX of one ranking, so top-1 ⊆ top-3 ⊆ top-5 and a ranker that reordered
 *      between cut-offs would be caught;
 *   3. `coverageAt` counts a MISS as a miss and never as a skip, which is what stops a missing
 *      measurement from quietly improving the reported rate;
 *   4. a measurement that cannot be completed refuses to publish, rather than publishing a table
 *      with a hole in it that both readers above would have read as a real measurement.
 */

const VERSE = "الله لا إله إلا هو الحي القيوم"

/** A `Displayed` with the shape the completeness check cares about: present, whatever its numbers. */
const DISPLAYED: Displayed = { shown: 0, anchorRank: 0 }

const openFixture = (): Database => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "mizan-suggest-coverage-"))
  const path = join(fixtureDir, "corpus.db")
  buildSnapshot(path, [
    // The same verse under two ids, which is the case an id-based hit test gets wrong.
    build({ id: "quran:2:255", collection: "quran", number: "2:255", textDisplay: VERSE, sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
    build({ id: "quran:2:255:b", collection: "quran", number: "2:255", textDisplay: VERSE, sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
    build({ id: "quran:112:1", collection: "quran", number: "112:1", textDisplay: "قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد", sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
  ])
  const handle = openSnapshot(path)
  // The directory is removed after the handle closes; Windows keeps the file locked briefly, so the
  // cleanup is best-effort and the reason is here rather than in an empty catch.
  try {
    rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  } catch {
    // the OS reclaims a temp directory; a leftover file is a far smaller problem than a flaky test
  }
  return handle
}

let db: Database
beforeAll(() => {
  db = openFixture()
})

afterAll(() => {
  if (db !== undefined) db.close()
})

const meta = {
  enabled: true,
  exclusionReason: null,
  descriptor: {
    source: "test/fixture",
    title: "Test fixture",
    publisher: "test",
    url: "https://example.invalid/data",
    license: "CC0-1.0",
    licenceClass: "permissive" as const,
    licenseUrl: "https://example.invalid/licence",
    attribution: "test fixture",
    sha256: "a".repeat(64),
    records: 3,
    gradeApplicable: false,
    gradeBasis: "none" as const,
    notes: null,
  },
}

const build = (raw: Parameters<typeof toCorpusRecord>[0]) => toCorpusRecord(raw, { meta, gradeSource: "test/fixture" })

describe("a hit is the folded text, not the record id", () => {
  /** `isHit` reads folded text and nothing else, so a row's id is extra information it never uses. */
  const candidates = (...rows: readonly { readonly recordId: string; readonly textMatch: string }[]) => rows

  test("the anchor text matches a row stored under a different id", () => {
    const rows = candidates({ recordId: "quran:2:255:b", textMatch: normalizeForMatch(VERSE) })
    expect(isHit(normalizeForMatch(VERSE), rows)).toBe(true)
  })

  test("diacritics on the anchor do not prevent a hit", () => {
    const rows = candidates({ recordId: "any:1", textMatch: normalizeForMatch(VERSE) })
    expect(isHit(normalizeForMatch("اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ"), rows)).toBe(true)
  })

  test("an anchor quoted from inside a longer record is a hit — anchors are spans, not whole texts", () => {
    const rows = candidates(
      { recordId: "abudawud:1003", textMatch: normalizeForMatch(`${VERSE} ثم قال ﷺ كما قال غريب`) },
      { recordId: "any:2", textMatch: normalizeForMatch("نص لا علاقة له") },
    )
    expect(isHit(normalizeForMatch(VERSE), rows)).toBe(true)
  })

  test("an unrelated row is a miss", () => {
    expect(isHit(normalizeForMatch(VERSE), candidates({ recordId: "quran:112:1", textMatch: "نص آخر" }))).toBe(false)
  })
})

describe("the harness measures a real scan", () => {
  /**
   * Measure a case against the fixture, or fail the test with the harness's own reason.
   *
   * Every call here is on a fixture the test just built, so a failure is a defect rather than an
   * unreadable corpus — which is exactly the distinction `measureCase` now draws, and reusing its
   * reason keeps this helper from inventing a second error vocabulary.
   */
  const measured = (id: string, quote: string, anchorFolded: string): CaseMeasurement =>
    unwrapOrThrow(measureCase(db, { id, expectedVerdict: "rejected", collection: "tirmidhi", quote, anchorFolded }), `measureCase(${id})`)

  test("a quote fabricated from the verse is found in the corpus", () => {
    const fabricated = `${VERSE} العظيم`
    const measurement = measured("fixture-1", fabricated, normalizeForMatch(VERSE))
    // Floor 4 is the loosest configuration, floor 12 the strictest; the fixture is small enough
    // that the strictest still admits the verse, which is what makes the cut-off test below mean
    // something rather than pass by being empty.
    expect(measurement.hits[4]?.[0]).toBe(true)
    expect(measurement.ms).toBeGreaterThan(0)
  })

  test("cut-offs are prefixes of one ranking, so hits never disappear as the list grows", () => {
    const measurement = measured("fixture-1", `${VERSE} العظيم`, normalizeForMatch(VERSE))
    for (const floor of [4, 8, 12]) {
      const [top1, top3, top5] = measurement.hits[floor] ?? []
      expect(top1).toBe(true)
      expect(top3).toBe(true)
      expect(top5).toBe(true)
    }
  })

  test("a quote with no near record is a miss at every floor, and that is a number not a failure", () => {
    const measurement = measured("fixture-2", "nothing in this corpus resembles these words", normalizeForMatch(VERSE))
    expect(measurement.hits[4]?.flat().every((hit) => hit === false)).toBe(true)
  })

  test("the identical verse is listed once, so a second id cannot be counted twice", () => {
    const measurement = measured("fixture-1", `${VERSE} العظيم`, normalizeForMatch(VERSE))
    expect(measurement.hits[4]?.[2]).toBe(true)
  })
})

/**
 * A corpus failure is a `Result`, not a crash — and the distinction is the point.
 *
 * The scan already reports an unreadable row rather than throwing (AGENTS.md §2), so a scan failure
 * used to reach `main` as an exception: exit code 1, a stack trace, and — worst — no guarantee that
 * the run had printed nothing first. Now the failure is a value the caller must handle, which is what
 * makes "prints no partial figures" a property of the code rather than of the order two statements
 * happen to appear in.
 */
describe("an unmeasurable case is reported, not thrown", () => {
  test("a closed database is an `err`, so the caller can refuse to publish rather than crash", () => {
    const closed = openFixture()
    closed.close()
    const result = measureCase(closed, { id: "fixture-closed", expectedVerdict: "rejected", collection: "tirmidhi", quote: `${VERSE} العظيم`, anchorFolded: normalizeForMatch(VERSE) })
    expect(isErr(result)).toBe(true)
    if (isOk(result)) return
    expect(result.error).toContain("scan failed")
  })

  test("the reason names the failure mode rather than a record's text", () => {
    // `row_undecodable` is the one corpus failure that carries an id, and it is the one failure a
    // reader of a coverage report can act on. The rest are named by tag alone, because a log line in a
    // product that logs hashes only has no business carrying corpus text (AGENTS.md §13).
    const closed = openFixture()
    closed.close()
    const result = measureCase(closed, { id: "fixture-closed", expectedVerdict: "rejected", collection: "tirmidhi", quote: VERSE, anchorFolded: normalizeForMatch(VERSE) })
    expect(isErr(result)).toBe(true)
    if (isOk(result)) return
    expect(result.error).not.toContain(VERSE)
  })

  test("no measurement is returned alongside the reason, so a caller cannot read a figure out of a failed case", () => {
    const closed = openFixture()
    closed.close()
    const result = measureCase(closed, { id: "fixture-closed", expectedVerdict: "rejected", collection: "tirmidhi", quote: VERSE, anchorFolded: normalizeForMatch(VERSE) })
    expect(result).not.toHaveProperty("value")
    expect(result).not.toHaveProperty("hits")
    expect(result).not.toHaveProperty("ms")
  })
})

describe("the reported figures cannot be flattered by a missing measurement", () => {
  const measurement = (id: string, hit: boolean) => ({ id, ms: 10, hits: { 4: [hit, hit, hit] }, gated: {} })

  test("a hit is counted and a miss is counted", () => {
    expect(coverageAt([measurement("a", true), measurement("b", false)], 4, 0, 2)).toBe("1/2")
  })

  test("a measurement with no entry for the floor counts as a miss, not as an absent case", () => {
    // The denominator is the caller's `total`, not the length of the list that happened to have an
    // entry. That is the whole point: a harness that quietly shrinks its own denominator reports a
    // better rate for a worse run.
    expect(coverageAt([{ id: "a", ms: 1, hits: {}, gated: {} }], 4, 0, 3)).toBe("0/3")
  })

  test("the p95 comes from the sorted times, and one slow case moves it", () => {
    const even = scanCost([{ id: "a", ms: 10, hits: {}, gated: {} }, { id: "b", ms: 20, hits: {}, gated: {} }])
    expect(even.max).toBe(20)
    const odd = scanCost([{ id: "a", ms: 10, hits: {}, gated: {} }, { id: "b", ms: 20, hits: {}, gated: {} }, { id: "c", ms: 900, hits: {}, gated: {} }])
    expect(odd.p50).toBe(20)
    expect(odd.p95).toBe(900)
    expect(odd.max).toBe(900)
    // Sorted by value, so the declaration order of the cases cannot change the figure.
    expect(scanCost([{ id: "b", ms: 900, hits: {}, gated: {} }, { id: "a", ms: 10, hits: {}, gated: {} }, { id: "c", ms: 20, hits: {}, gated: {} }]).p95).toBe(900)
  })
})

/**
 * Precision is reported per rank, with its denominator stated.
 *
 * These are the cases the original single-number design got wrong. A list of two out of forty cases
 * that shows the right record in both would read as `2/40` at rank 1 — indistinguishable from a list
 * that showed two records, one right and one wrong, out of forty. The denominator has to be the cases
 * where a row was actually printed at that position, or the display floor's effect is invisible
 * exactly where it does its work.
 */
describe("precision is measured against the rows that were actually displayed", () => {
  const shown = (id: string, shownRows: number, anchorRank: number): CaseMeasurement => ({
    id,
    ms: 1,
    hits: { 8: [false, false, false] },
    gated: { [MIN_SHARED_RUN_CHARS]: { shown: shownRows, anchorRank } },
  })

  test("rank 1 is measured against the cases that displayed a row there", () => {
    const precision = precisionAt([shown("a", 2, 1), shown("b", 2, 1), shown("c", 1, 0)], MIN_SHARED_RUN_CHARS, 1)
    expect(precision.displayed).toBe(3)
    expect(precision.hits).toBe(2)
    expect(precision.absent).toBe(0)
  })

  test("a rank the list never reached is absent, and is not folded into the denominator", () => {
    // Every case stopped at two rows, so rank 3 has no denominator at all. Reporting `0/40` here would
    // be the padding the product refuses to do, moved into the measurement; reporting `0/0` would print
    // a number a reader cannot interpret. The honest answer is a count of cases that could not show it.
    const precision = precisionAt([shown("a", 2, 1), shown("b", 2, 0)], MIN_SHARED_RUN_CHARS, 3)
    expect(precision.displayed).toBe(0)
    expect(precision.hits).toBe(0)
    expect(precision.absent).toBe(2)
  })

  test("a missing floor entry is absent, never a displayed row", () => {
    // Fail closed on the same discipline as everywhere else: an absent measurement cannot make a rank
    // look populated, because the alternative is a figure that improves when the harness breaks.
    const precision = precisionAt([{ id: "a", ms: 1, hits: {}, gated: {} }], MIN_SHARED_RUN_CHARS, 1)
    expect(precision.displayed).toBe(0)
    expect(precision.absent).toBe(1)
  })

  test("precision is deterministic: the same cases in another order give the same numbers", () => {
    const cases = [shown("a", 3, 1), shown("b", 1, 0), shown("c", 5, 5), shown("d", 2, 2)]
    const forward = precisionAt(cases, MIN_SHARED_RUN_CHARS, 2)
    const reversed = precisionAt([...cases].reverse(), MIN_SHARED_RUN_CHARS, 2)
    expect(reversed).toEqual(forward)
  })
})

/** The floor's price, in cases, and the sweep that chooses it. */
describe("the display floor sweep prices the floor in cases", () => {
  const measured = (id: string, ungatedHit: boolean, gatedRank: number): CaseMeasurement => ({
    id,
    ms: 1,
    hits: { [MIN_SHARED_TRIGRAMS]: [ungatedHit, ungatedHit, ungatedHit] },
    gated: { [MIN_SHARED_RUN_CHARS]: { shown: 1, anchorRank: gatedRank } },
  })

  test("a floor that drops the anchor shows it in the difference, not in a lower rate", () => {
    const recalled = floorRecallCost([measured("a", true, 1), measured("b", true, 0)], MIN_SHARED_RUN_CHARS)
    expect(recalled.shipped).toBe(2)
    expect(recalled.gated).toBe(1)
  })

  test("the shipped floor appears in the sweep, so the chosen value is one row of a measured table", () => {
    // If `MIN_SHARED_RUN_CHARS` were not in `RUN_FLOORS`, the table would describe floors the product
    // does not use and the choice would be unfalsifiable from the output — which is the state this
    // table was added to end.
    expect(RUN_FLOORS).toContain(MIN_SHARED_RUN_CHARS)
  })
})

describe("the figure of record is the slowest of five runs, chosen by the tool", () => {
  const cost = (p50: number, p95: number, max: number): { readonly p50: number; readonly p95: number; readonly max: number } => ({ p50, p95, max })

  test("the slowest of each component wins, even when they come from different runs", () => {
    // The case that makes "just pick one run" wrong: run 2 has the worst p95 and run 3 the worst max, so
    // there is no single run whose three figures describe a run that actually happened.
    const slowest = slowestOf([cost(600, 700, 900), cost(610, 1000, 950), cost(590, 800, 1100)], 3)
    expect(slowest).toEqual(cost(610, 1000, 1100))
  })

  test("a fast run cannot make the published figure fast, so re-running cannot flatter the artefact", () => {
    const first = slowestOf([cost(600, 700, 900), cost(620, 800, 950)], 2)
    expect(slowestOf([cost(10, 10, 10)], 1)).toEqual(cost(10, 10, 10))
    // The point of the function: the figure is a property of the worst run, so a later fast run does
    // not lower it. Published latency only improves when the code or the machine does.
    expect(first).toEqual(cost(620, 800, 950))
  })

  test("the result does not depend on the order the runs are supplied in", () => {
    const runs = [cost(600, 700, 900), cost(620, 800, 950), cost(590, 750, 1000)]
    expect(slowestOf(runs, 3)).toEqual(slowestOf([...runs].reverse(), 3))
  })

  test("no runs is no figure, not a zero that would read as an impossibly fast measurement", () => {
    expect(slowestOf([], 5)).toBeNull()
    expect(slowestOf([cost(600, 700, 900)], 0)).toBeNull()
  })

  test("the run count is the one ADR-C10 names, so changing it changes the published meaning", () => {
    expect(RECORD_RUNS).toBe(5)
  })

  test("the published band is at least the spread the five runs actually showed on p95", () => {
    // Measured across five runs of the shipped path: p95 spanned 705-1088 ms, so 1.54x. This does not
    // assert the exact numbers — those belong to a machine, not to a test — but it pins the relationship
    // that matters: a band narrower than the run-to-run spread would report a passing document as
    // broken, and the band is what ADR-13 lets a document rely on.
    expect(LATENCY_BAND_MULTIPLIER).toBeGreaterThanOrEqual(1.5)
  })
})

describe("casesFrom reduces the eval set to what the measurement needs", () => {
  /** The minimum a `caseCountsByCollection` probe needs, so the assertion is about the grouping only. */
  const probesOf = (cases: readonly CoverageCase[]): readonly PresenceProbe[] =>
    cases.map((entry) => ({ collection: entry.collection, reached: [true, true, true], expected: entry.expectedVerdict }))

  test("an anchor absent from the set falls back to the anchor id rather than to an empty string", () => {
    const cases = casesFrom({
      cases: [
        { id: "c1", quote: "q", anchorId: "bukhari:1", citation: { collection: "bukhari", number: "1" } },
        { id: "c2", quote: "q2", anchorId: "bukhari:2", anchorText: "text", citation: { collection: "bukhari", number: "2" } },
      ],
    } as unknown as Parameters<typeof casesFrom>[0])
    expect(cases[0]?.anchorFolded).toBe(normalizeForMatch("bukhari:1"))
    expect(cases[1]?.anchorFolded).toBe(normalizeForMatch("text"))
  })

  test("a case carries its CITATION's collection, because that is the book the figure is about", () => {
    // The per-collection table attributes each case to `citation.collection`, not to the anchor's. A
    // fixture that omits the field would have this read `undefined` and group every case under one key,
    // which is a table of one row and a coverage claim about a collection nobody measured.
    const cases = casesFrom({
      cases: [
        { id: "c1", quote: "q", anchorId: "abudawud:1", citation: { collection: "abudawud", number: "1" } },
        { id: "c2", quote: "q", anchorId: "quran:2", citation: { collection: "quran", number: "2" } },
      ],
    } as unknown as Parameters<typeof casesFrom>[0])
    expect([...caseCountsByCollection(probesOf(cases))]).toEqual([
      ["abudawud", 1],
      ["quran", 1],
    ])
  })

  test("a case carries its adjudicated expectation, because the rejection figures are derived from it", () => {
    // CR-3. The `rejected` column has no other source that is not a retyped constant, and `reached`
    // cannot supply it: a fabrication whose anchor ranked first is still a fabrication. Read from the
    // set rather than recomputed here, so a case class that stopped expecting `rejected` changes the
    // published figures instead of being silently reclassified.
    const cases = casesFrom({
      cases: [
        { id: "c1", quote: "q", expectedVerdict: "rejected", anchorId: "abudawud:1", citation: { collection: "abudawud", number: "1" } },
        { id: "c2", quote: "q", expectedVerdict: "verified", anchorId: "abudawud:2", citation: { collection: "abudawud", number: "2" } },
      ],
    } as unknown as Parameters<typeof casesFrom>[0])
    expect(verdictCountsByCollection(probesOf(cases)).get("abudawud")).toEqual({ rejected: 1, verified: 1 })
  })
})

/**
 * The recorded artefact is the claim sweep's only evidence, so its shape is a contract, not a detail.
 *
 * `readFigures` in `@mizan/gate` walks the top level of the parsed JSON and keeps the numeric entries.
 * A figure nested one level down is not wrong, it is invisible — the rule would read an artefact that
 * parsed and find nothing to compare, and would be green forever. These tests are what stop the shape
 * being "tidied" into a nested object by a future change, which is the refactor the architecture note
 * warns about by name.
 */
describe("the figures this harness records are in the shape the claim rule reads", () => {
  const measurements: readonly CaseMeasurement[] = [
    { id: "a", ms: 10, hits: { [MIN_SHARED_TRIGRAMS]: [true, true, true] }, gated: { [MIN_SHARED_RUN_CHARS]: { shown: 3, anchorRank: 1 } } },
    { id: "b", ms: 20, hits: { [MIN_SHARED_TRIGRAMS]: [false, true, true] }, gated: { [MIN_SHARED_RUN_CHARS]: { shown: 1, anchorRank: 0 } } },
  ]
  const identity = { snapshotHash: "c".repeat(64), recordCount: 27_234 }
  const digest = `ds1:${"e".repeat(64)}`
  const figures = suggestionFigures(measurements, { p50: 600.4, p95: 700.6, max: 900.2 }, identity, digest)

  test("every value is top-level, so nothing is nested out of the rule's reach", () => {
    for (const value of Object.values(figures)) {
      expect(typeof value === "number" || typeof value === "string").toBe(true)
    }
  })

  test("the only strings are identities, and both are named rather than swept up with the figures", () => {
    // Enumerated, not merely counted. A third string added to this artefact is a judgement a reader
    // cannot make from the file, and the list here is what forces the decision to be written down.
    const strings = Object.entries(figures).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    expect(strings.map((entry) => entry[0])).toEqual(["suggestionCorpusFingerprint", BASELINE_IDENTITY_KEY])
    expect(figures.suggestionCorpusFingerprint).toBe(identity.snapshotHash)
  })

  test("the eval set's identity is recorded, because a recall rate is a ratio and this is its denominator", () => {
    expect(figures[BASELINE_IDENTITY_KEY]).toBe(digest)
    // The key is the one `recallRegression` reads, so a rename here that missed the reader would make
    // every future `--record` refuse for a reason naming a key the artefact no longer carries.
    expect(BASELINE_IDENTITY_KEY).toBe("suggestionEvalSetDigest")
  })

  test("a latency is recorded as whole milliseconds, never as a fraction a reader would re-round", () => {
    expect(figures.suggestionLatencyP50Ms).toBe(600)
    expect(figures.suggestionLatencyP95Ms).toBe(701)
    expect(figures.suggestionLatencyMaxMs).toBe(900)
  })

  test("a cut-off column is named by the cut-off it measures, never by its position in the list", () => {
    // `CUTOFFS` is [1, 3, 5]. An earlier iteration keyed these by array index and published
    // `suggestionPresenceTop2` describing top-3 — a plausible-looking wrong number in the one file a
    // document is checked against. Keyed by value, the key and the column cannot come apart.
    expect(figures).toHaveProperty("suggestionPresenceTop1")
    expect(figures).toHaveProperty("suggestionPresenceTop3")
    expect(figures).toHaveProperty("suggestionPresenceTop5")
    expect(figures).not.toHaveProperty("suggestionPresenceTop2")
    expect(figures).not.toHaveProperty("suggestionPresenceTop0")
    expect(figures.suggestionPresenceTop1).toBe(1)
    expect(figures.suggestionPresenceTop5).toBe(2)
  })

  test("every rank the reader can see publishes a numerator and the denominator it is a fraction of", () => {
    for (const rank of [1, 2, 3, 4, 5]) {
      expect(figures).toHaveProperty(`suggestionPrecisionRank${rank}Hits`)
      expect(figures).toHaveProperty(`suggestionPrecisionRank${rank}Denominator`)
    }
    // rank 1: both cases displayed a row there, and one of them was the anchor. rank 2: one case
    // displayed a row, and it was not the anchor — the second column is the point.
    expect(figures.suggestionPrecisionRank1Hits).toBe(1)
    expect(figures.suggestionPrecisionRank1Denominator).toBe(2)
    expect(figures.suggestionPrecisionRank2Denominator).toBe(1)
    expect(figures.suggestionPrecisionRank2Hits).toBe(0)
  })

  test("the floor's recall cost is recorded, so a later run cannot quietly tighten it", () => {
    expect(figures.suggestionRecallShippedTop5).toBe(2)
    expect(figures.suggestionRecallGatedTop5).toBe(1)
    expect(figures.suggestionFloorRunChars).toBe(MIN_SHARED_RUN_CHARS)
    expect(figures.suggestionLatencyBandMultiplier).toBe(LATENCY_BAND_MULTIPLIER)
  })
})

/**
 * `--record` writes to a file, so writing is a step that can fail — and it fails as a value.
 *
 * Every other precondition in this harness already arrived as a `Result`, which is what let `main`
 * print a reason and exit 3 having published nothing. The write was the one left throwing, so a
 * malformed artefact exited 1 with a stack trace on the line after the reader was told the figure had
 * been recorded (AGENTS.md §2).
 */
describe("a measurement refuses rather than escaping as an exception", () => {
  // The corpus layer already converts its own failures, so the scan's boundary was real but not the
  // whole function: `sharedRunOf`, `rankNeighboursAtFloor`, the `.map` over rows and the lookups below
  // were all unguarded, and an exception from any of them left as an uncaught error — a stack trace and
  // exit code 1, the same number an ordinary bug produces. These pin the boundary that closes that.
  test("a thrown Error becomes a Result failure carrying its own message", () => {
    const thrown = attempt<number>(() => {
      throw new Error("a corpus row this harness has not met")
    })
    expect(isErr(thrown)).toBe(true)
    if (!isErr(thrown)) return
    expect(thrown.error).toBe("a corpus row this harness has not met")
  })

  test("a thrown non-Error is still named, rather than becoming 'undefined'", () => {
    // A `catch` that assumed `instanceof Error` would print "undefined" here and the harness report
    // would carry a refusal that names nothing at all.
    const thrown = attempt<number>(() => {
      throw "the stream ended early" as unknown
    })
    expect(isErr(thrown)).toBe(true)
    if (!isErr(thrown)) return
    expect(thrown.error).toBe("the stream ended early")
  })

  test("an expected refusal passes through unchanged, so the boundary never relabels it", () => {
    // The reason this is not a blanket `catch` that wraps everything in one message: a corpus fault and
    // a bug in this file exit with the same code, and only the message separates them. A boundary that
    // rewrote both into one shape would destroy the one distinction a reader has.
    const refused = attempt(() => err("scan failed: ..."))
    expect(isErr(refused)).toBe(true)
    if (!isErr(refused)) return
    expect(refused.error).toBe("scan failed: ...")
    expect(isOk(attempt(() => ok(41)))).toBe(true)
  })

  test("the tables are checked for completeness before a measurement is published", () => {
    // `coverageAt` counts a missing entry as a MISS and `precisionAt` reads a missing floor as zero
    // shown — both total, both deliberate, and both of which turn an incomplete table into a coverage
    // number that is quietly too low. The readers cannot be the ones to notice, so the producer is.
    const full = Object.fromEntries(FLOORS.map((floor) => [floor, CUTOFFS.map(() => false)])) as Record<number, boolean[]>
    const gated = Object.fromEntries(RUN_FLOORS.map((floor) => [floor, DISPLAYED]))
    expect(incompleteFloors(full, gated)).toBeNull()

    const oneShort: Record<number, boolean[]> = { ...full, [FLOORS[2]]: CUTOFFS.slice(0, 2).map(() => false) }
    expect(incompleteFloors(oneShort, gated)).toContain(`${FLOORS[2]}`)
  })

  test("a display floor with no entry refuses too, and names how many are missing", () => {
    // The other table, and the one whose failure would be invisible: an absent `gated` entry is read as
    // zero rows shown, which shortens the denominator and quietly improves the precision it is a
    // fraction of.
    const full = Object.fromEntries(FLOORS.map((floor) => [floor, CUTOFFS.map(() => false)])) as Record<number, boolean[]>
    const { [RUN_FLOORS[0]]: _dropped, ...gated } = Object.fromEntries(RUN_FLOORS.map((floor) => [floor, DISPLAYED]))
    expect(incompleteFloors(full, gated)).toContain(`1 of ${RUN_FLOORS.length} display floors`)
  })
})

describe("recording refuses rather than throwing, and says which file stopped it", () => {
  const dir = mkdtempSync(join(tmpdir(), "mizan-suggest-record-"))
  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    } catch {
      // the OS reclaims a temp directory; a leftover file is a far smaller problem than a flaky test
    }
  })

  const at = (name: string, body: string): string => {
    const path = join(dir, name)
    writeFileSync(path, body, "utf8")
    return path
  }

  const figures = { suggestionLatencyP95Ms: 700, suggestionCorpusFingerprint: "d".repeat(64) }

  test("an artefact that is not a JSON object is refused, naming the file", () => {
    const path = at("array.json", "[1, 2, 3]\n")
    const result = recordFigures(path, figures)
    expect(isErr(result)).toBe(true)
    if (isOk(result)) return
    expect(result.error).toContain(path)
    expect(result.error).toContain("not a JSON object")
  })

  test("a truncated body is refused, naming the file and saying it is not JSON", () => {
    const path = at("truncated.json", "{ \"suggestionLatencyP95Ms\": 700,\n")
    const result = recordFigures(path, figures)
    expect(isErr(result)).toBe(true)
    if (isOk(result)) return
    expect(result.error).toContain(path)
    expect(result.error).toContain("not valid JSON")
  })

  test("an absent file is refused rather than created, because an empty artefact would back nothing", () => {
    const result = recordFigures(join(dir, "no-such-dir", "vs-search.json"), figures)
    expect(isErr(result)).toBe(true)
    if (isOk(result)) return
    expect(result.error).toContain("could not be read")
  })

  test("the whole suggestion namespace is replaced, so a key this run dropped cannot survive", () => {
    // The orphan this exists to prevent: an earlier `--record` published `suggestionPresenceTop2`, and a
    // merge made that wrong number permanent, unowned and invisible.
    const path = at("vs-search.json", `${JSON.stringify({ systemDetectionRate: 0.918, suggestionPresenceTop2: 38 }, null, 2)}\n`)
    const written = recordFigures(path, figures)
    expect(isOk(written)).toBe(true)
    const recorded = JSON.parse(readFileSync(path, "utf8")) as Readonly<Record<string, unknown>>
    expect(recorded.suggestionPresenceTop2).toBeUndefined()
    expect(recorded.suggestionLatencyP95Ms).toBe(700)
    // And the keys this harness does not own survive untouched, so a latency recording cannot silently
    // rewrite the pre-registered retrieval hypothesis the file also carries.
    expect(recorded.systemDetectionRate).toBe(0.918)
  })
})

/**
 * The conditions block is what makes a latency figure mean anything, so its content is the tested
 * surface rather than its layout.
 *
 * The drift this exists to prevent is specific: a document quoted a number the harness no longer
 * printed, and nothing in the build could see the difference. A block that omitted the corpus
 * identity, the case count or the tolerance would leave that hole exactly where it was while reading
 * as though it had been closed, so each of those is asserted by name.
 */
describe("every published figure travels with the conditions it was measured under", () => {
  const conditions: MeasurementConditions = {
    identity: { snapshotHash: "b".repeat(64), recordCount: 27_234 },
    caseCount: 40,
    machine: { runtime: "bun 1.3.14", platform: "linux x64", cpu: "Test CPU" },
  }
  const block = (): string => conditionsLines(conditions).join("\n")

  test("the block names the corpus identity, so a re-ingested snapshot invalidates the figure", () => {
    expect(block()).toContain(`snapshotHash=${"b".repeat(64)}`)
    expect(block()).toContain("recordCount=27234")
  })

  test("the block names the command and the number of cases", () => {
    expect(block()).toContain(HARNESS_COMMAND)
    expect(block()).toContain("40 adversarial fabricated quotes")
  })

  test("the block separates the product path from this harness's own measurement work", () => {
    // A reader who cannot tell which work the clock covered cannot use the figure, and the recall
    // table is the part most easily mistaken for it.
    expect(block()).toContain("one scan + one ranking")
    expect(block()).toContain("outside the clock")
  })

  test("the block publishes the quantile rule, because p95 over a small sample is not an average", () => {
    expect(block()).toContain("floor(cases x fraction)")
    expect(block()).toContain("Nothing is interpolated")
  })

  test("the block names the runtime, the platform and the CPU it ran on", () => {
    expect(block()).toContain("bun 1.3.14")
    expect(block()).toContain("linux x64")
    expect(block()).toContain("Test CPU")
  })

  test("the block states the tolerance as a number, not as a promise", () => {
    expect(block()).toContain(`${LATENCY_BAND_MULTIPLIER}x`)
    // 1.5x is the declared band because it absorbs this machine's own 1.12x run-to-run spread and
    // still fails the 1.77x drift that actually happened here. Pinned so the number cannot be widened
    // silently into a band that accepts a regression.
    expect(LATENCY_BAND_MULTIPLIER).toBe(1.5)
  })

  test("the block carries an identity, integers and hashes only — no quote, no corpus text", () => {
    // AGENTS.md §13: a durable artefact holds hashes and counts. The block is quoted verbatim into
    // three documents, so anything it carried would be quoted with it. The shape asserted is the one
    // the block is built to have: a padded lower-case label, then its value.
    for (const line of conditionsLines(conditions)) {
      expect(line).not.toMatch(/[\u0600-\u06FF]/)
      expect(line.trim()).toMatch(/^[a-z][a-z ]*\s{2,}\S/)
    }
  })

  test("a machine that reports no CPU is stated as unknown, never omitted", () => {
    // An absent condition reads as a condition that held. `unknown` is the honest answer and is a
    // different string, so the omission cannot pass as agreement.
    const lines = conditionsLines({ ...conditions, machine: { ...conditions.machine, cpu: "unknown" } })
    expect(lines.join("\n")).toContain("cpu                unknown")
  })
})

/**
 * The four modes, tested as a pure function over argv.
 *
 * CR-2 and CR-4 are both about which invocation is allowed to reach the writer, and neither is a
 * property a test can see by reading `main`. So the mode is a value with its own parser, and the parser
 * is what these tests plant violations against — including the one that matters most: a default run that
 * cannot move a floor, which is what makes pointing the acceptance step at a bare invocation harmless
 * but useless (the acceptance step now passes `--check`).
 */
describe("the mode a run was asked for", () => {
  test("no flag measures, which is the default a reader runs to see the numbers", () => {
    expect(parseCoverageMode([])).toEqual(ok<CoverageMode>("measure"))
  })

  test("each mode is reachable by exactly its own flag, and only its own", () => {
    // Driven off the declaration rather than a re-listed copy, so adding a mode without a flag here —
    // or a flag no mode answers to — fails this test instead of shipping (AGENTS.md section 17).
    for (const [mode, flag] of Object.entries(COVERAGE_MODE_FLAGS)) {
      if (flag === "") continue
      expect(parseCoverageMode([flag])).toEqual(ok(mode as CoverageMode))
    }
  })

  test("a typo refuses rather than falling back to measure, so the acceptance step cannot pass on one", () => {
    // The failure this closes: `--chek` ignored would print a table, exit 0, and be read as "every
    // record still found". The gate's step would be green having verified nothing.
    const verdict = parseCoverageMode(["--chek"])
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("--chek")
    // The refusal names what does exist, so the reader does not have to know the mode vocabulary first.
    expect(verdict.error).toContain("--check")
    expect(verdict.error).toContain("--record")
    expect(verdict.error).toContain("--rebaseline")
  })

  test("two modes at once refuse, because the combination reads as 'record, and it's fine'", () => {
    const verdict = parseCoverageMode(["--record", "--rebaseline"])
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("two modes at once")
  })

  test("a positional argument refuses, because a case id is not an instruction to this harness", () => {
    const verdict = parseCoverageMode(["--check", "quran"])
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("positional")
  })

  test("the four modes are written down once, so a new mode cannot be added without naming it here", () => {
    expect(Object.keys(COVERAGE_MODE_FLAGS).sort()).toEqual(["check", "measure", "rebaseline", "record"])
  })
})

/**
 * `--rebaseline` is the only command that may move a floor down, so what it prints is part of the
 * integrity of the artefact rather than a nicety.
 *
 * The defect it replaces is a refusal message that told the operator to add a number to
 * `vs-search.json` by hand. That made the legitimate case — the eval set was legitimately regenerated,
 * so the recorded floor describes a different denominator — indistinguishable from a real regression,
 * and the only way through it was to write an unmeasured number into the file every document is checked
 * against. `--rebaseline` re-measures instead, and this report is what keeps the movement visible.
 */
describe("rebaselining prints the movement it caused", () => {
  const DIGEST = `ds1:${"e".repeat(64)}`
  const AFTER: Readonly<Record<string, number | string>> = {
    suggestionPresenceTop5: 36,
    suggestionRecallGatedTop5: 30,
  }

  test("every floor it rewrote is reported as before -> after, so the commit carries the movement", () => {
    const report = rebaselineReport({ suggestionPresenceTop5: 38, suggestionRecallGatedTop5: 38 }, AFTER, DIGEST).join("\n")
    expect(report).toContain("suggestionPresenceTop5: 38 -> 36")
    expect(report).toContain("suggestionRecallGatedTop5: 38 -> 30")
  })

  test("the report names the digest the new baseline is measured over", () => {
    // The denominator the old floor described is gone, and the report is where that is stated.
    const report = rebaselineReport({ suggestionEvalSetDigest: `ds1:${"a".repeat(64)}` }, AFTER, DIGEST).join("\n")
    expect(report).toContain(`ds1:${"a".repeat(64)} -> ${DIGEST}`)
  })

  test("a floor that did not exist before reads as `none`, not as a zero it never was", () => {
    // The half that matters when somebody reads this to decide whether the baseline was quietly
    // replaced: "none" says a floor was created, where "0" would say one was already zero.
    const report = rebaselineReport({}, AFTER, DIGEST).join("\n")
    expect(report).toContain("suggestionPresenceTop5: none -> 36")
    expect(report).not.toContain("suggestionPresenceTop5: 0 ->")
  })

  test("the report says the floor was NOT compared, because that is the whole cost of the mode", () => {
    // A reader who sees a drop in the artefact and no record of a skipped comparison cannot tell a
    // sanctioned rebaseline from a waved-through regression.
    const report = rebaselineReport({}, AFTER, DIGEST).join("\n")
    expect(report).toContain("NOT compared")
    expect(report).toContain("including a drop")
  })
})

/**
 * ADR-17: the recall precondition on `--record`, tested as a pure function over two tables.
 *
 * The tempting way to test a gate like this is to run the harness against the real corpus twice with
 * different floors and watch the second one refuse. That costs a minute per run, needs the corpus, and
 * — the fatal part — would pass for the wrong reason often enough that a reader could not tell whether
 * recall or the harness broke. So the decision is extracted, and the refusal is proven to depend on the
 * recall numbers alone.
 *
 * Each test below plants one violation. A gate whose refusals cannot each be provoked is not a gate;
 * it is a condition, and it fails the "a guard that cannot fail is not a guard" requirement in
 * AGENTS.md section 14 for exactly the case where it matters most.
 */
describe("recall is a precondition on recording, because latency is the only figure an index buys", () => {
  /** The identity every baseline in this block was measured over. */
  const DIGEST = `ds1:${"e".repeat(64)}`

  /** A baseline and a run that ties it, which is the only case that is allowed to proceed. */
  const BASELINE: Readonly<Record<string, unknown>> = {
    [BASELINE_IDENTITY_KEY]: DIGEST,
    suggestionPresenceTop5: 38,
    suggestionRecallGatedTop5: 38,
  }
  const TIED: Readonly<Record<string, number | string>> = {
    suggestionPresenceTop5: 38,
    suggestionRecallGatedTop5: 38,
  }

  test("a run that ties the recorded baseline is allowed to record", () => {
    // The pass path, stated first: a gate proven only to refuse is indistinguishable from a broken one,
    // and the person who broke it would be told they had implemented a precondition.
    expect(recallRegression(BASELINE, TIED, DIGEST)).toEqual(ok("recall holds"))
  })

  test("a run that IMPROVES recall is allowed to record", () => {
    // Asymmetric on purpose. A floor is a floor, not a target to be defended: refusing an improvement
    // would make the gate a brake on a fix, and the engineer would then work around it.
    const improved = { ...TIED, suggestionPresenceTop5: 40, suggestionRecallGatedTop5: 40 }
    expect(recallRegression(BASELINE, improved, DIGEST)).toEqual(ok("recall holds"))
  })

  test("losing one top-5 presence refuses, and the refusal names both numbers", () => {
    // The planted violation. 38 -> 37 is a single record that no longer appears in the first five, and
    // it is the whole failure mode ADR-08's FTS spike demonstrated: faster, and quietly returning
    // nothing for a quote it used to answer.
    const lost = { ...TIED, suggestionPresenceTop5: 37 }
    const verdict = recallRegression(BASELINE, lost, DIGEST)
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("suggestionPresenceTop5")
    expect(verdict.error).toContain("37")
    expect(verdict.error).toContain("38")
    // The reason must name the rule that decided it, or a reader is left to guess whether the refusal
    // was a performance budget or an integrity one.
    expect(verdict.error).toContain("ADR-17")
  })

  test("losing gated recall refuses even when presence is unchanged", () => {
    // The second key is not redundant with the first, which is why both are compared. Presence is "a
    // row was shown"; gated recall is "the row shown was the anchor". A ranking that drifts so the
    // right record is displayed in the wrong position keeps every presence number while losing the
    // record a judge is actually looking for.
    const lost = { ...TIED, suggestionRecallGatedTop5: 30 }
    const verdict = recallRegression(BASELINE, lost, DIGEST)
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("suggestionRecallGatedTop5")
  })

  test("no tolerance band is applied to recall, however small the loss", () => {
    // `LATENCY_BAND_MULTIPLIER` is 1.5x, and it would happily wave through 38 -> 37. Applying it here
    // would be the defect: wall clock belongs to the machine, and recall belongs to the code. One record
    // is the whole unit of judgement in this product, so one record lost is a regression.
    const oneLost = recallRegression({ ...BASELINE, suggestionPresenceTop5: 1 }, { ...TIED, suggestionPresenceTop5: 1 }, DIGEST)
    expect(oneLost).toEqual(ok("recall holds"))
    const actuallyLost = recallRegression({ ...BASELINE, suggestionPresenceTop5: 1 }, { ...TIED, suggestionPresenceTop5: 0 }, DIGEST)
    expect(isErr(actuallyLost)).toBe(true)
  })

  test("an artefact with no recall baseline refuses, because it cannot be compared against nothing", () => {
    // The first `--record` after recall was added to the artefact, and the case that decides whether the
    // gate is fail-closed. Reading a missing key as "no regression" would let the very change the gate
    // exists to catch — the one that introduces an index — record its own baseline with nobody to check
    // it against (AGENTS.md section 3).
    //
    // The identity key stays, deliberately. Spreading `undefined` over it is not "leaving it out" — it is
    // still a present key holding `undefined`, which the reader's `typeof` check refuses — so the run
    // would stop at the identity refusal and this test would quietly stop proving the thing it is named
    // for. The floor is missing *independently* of the denominator here.
    const verdict = recallRegression(
      { [BASELINE_IDENTITY_KEY]: DIGEST },
      TIED,
      DIGEST,
    )
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("suggestionPresenceTop5")
    expect(verdict.error).toContain("not a measurement")
    // Not a regression: nothing was compared, so reporting a loss would send the reader to fix a search
    // that never failed anything.
    expect(verdict.error).not.toContain("regressed")
  })

  test("a changed eval set refuses before any recall is compared", () => {
    // The failure ADR-17 calls the dangerous one, and the reason identity is checked first rather than
    // alongside: regenerating the case set moves the denominator, the aggregate can land on the same
    // value, and the comparison reports a pass over two experiments. 40/40 against a 40-case set and
    // 40/40 against a 41-case set are not the same measurement, and only the digest can tell them apart.
    const verdict = recallRegression(BASELINE, TIED, `ds1:${"f".repeat(64)}`)
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("not the one this baseline was measured over")
    expect(verdict.error).toContain("a different measurement")
    // Both digests are named, because the person fixing this needs to know which file to edit and which
    // set to regenerate — a refusal that says only "mismatch" sends them to git log.
    expect(verdict.error).toContain(`ds1:${"e".repeat(64)}`)
    expect(verdict.error).toContain(`ds1:${"f".repeat(64)}`)
  })

  test("a baseline with no identity refuses as an incomparable denominator, not as a regression", () => {
    // Ordering, stated as its own test. An artefact predating `datasetDigest` has no denominator, and
    // the refusal must name that fact rather than reporting a recall loss that never happened — a
    // message blaming a regression would send the reader to fix the search when the artefact is what
    // needs attention.
    const verdict = recallRegression({ suggestionPresenceTop5: 40, suggestionRecallGatedTop5: 40 }, TIED, DIGEST)
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain(BASELINE_IDENTITY_KEY)
    expect(verdict.error).not.toContain("regressed")
  })

  test("a baseline key that is present but not a number refuses rather than coercing", () => {
    // A string "38" would compare under `Number()` and quietly pass a corrupt artefact. The refusal has
    // to name the artefact, because the artefact is what the person has to fix by hand.
    const verdict = recallRegression({ ...BASELINE, suggestionPresenceTop5: "38" }, TIED, DIGEST)
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("data/benchmark/vs-search.json")
  })

  test("a run that computed no recall figure refuses to record latency over an unknown search", () => {
    // Absent in the other direction. A harness that failed to measure recall produced a latency figure
    // that says nothing about whether the search still finds the record, and recording it would publish
    // that figure as evidence of a working path.
    const verdict = recallRegression(BASELINE, { suggestionLatencyP95Ms: 753 }, DIGEST)
    expect(isErr(verdict)).toBe(true)
    if (!isErr(verdict)) return
    expect(verdict.error).toContain("suggestionPresenceTop5")
  })

  test("both baseline keys are read, so neither can be dropped from the artefact unnoticed", () => {
    // The set is written down once. A test that re-listed the keys here would be a second source of
    // truth, and the failure it would miss is the artefact quietly losing one (AGENTS.md section 17).
    expect(RECALL_BASELINE_KEYS).toEqual(["suggestionPresenceTop5", "suggestionRecallGatedTop5"])
    for (const key of RECALL_BASELINE_KEYS) {
      const without = { ...BASELINE }
      delete without[key]
      expect(isErr(recallRegression(without, TIED, DIGEST))).toBe(true)
    }
  })

  test("the committed artefact carries a baseline, so the gate is satisfiable by today's code", () => {
    // The failure this exists to catch is the gate being *unsatisfiable*: a truncation of the artefact,
    // or a key renamed without this being updated, would make every future `--record` refuse forever and
    // the latency figures unrecordable. Nobody would notice, because refusing is the gate working. So the
    // real file is read here, and the values it holds must satisfy a run that finds everything.
    const read = readBaseline(join(import.meta.dir, "..", "..", ARTEFACT_PATH))
    expect(isOk(read)).toBe(true)
    if (!isOk(read)) return
    const baseline: Record<string, number | string> = {}
    for (const [key, value] of Object.entries(read.value)) {
      if (typeof value === "number" || typeof value === "string") baseline[key] = value
    }
    for (const key of RECALL_BASELINE_KEYS) {
      expect(typeof baseline[key]).toBe("number")
    }
    // Full recall is the shipped path's actual figure, which is why this gate can demand it. Asserted
    // rather than assumed: if the search ever loses a record, this is the test that says so first, and
    // it should fail here rather than at the next `--record` with no explanation.
    expect(recallRegression(baseline, baseline, baseline[BASELINE_IDENTITY_KEY] as string)).toEqual(ok("recall holds"))
  })

  test("an artefact that is not a JSON object refuses, rather than reading as no regression", () => {
    // The shape a hand-edit produces: a truncated file, or a stray `[` making the artefact an array.
    // `readFigures` in the gate walks the top level for numbers, so an array would silently contribute
    // nothing and every latency comparison would read as "not stated" — green, and meaningless.
    const dir = mkdtempSync(join(tmpdir(), "mizan-baseline-"))
    try {
      const path = join(dir, "vs-search.json")
      writeFileSync(path, "[1, 2, 3]")
      const verdict = readBaseline(path)
      expect(isErr(verdict)).toBe(true)
      if (!isErr(verdict)) return
      expect(verdict.error).toContain("not a JSON object")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("a missing artefact refuses, because there is no baseline to compare against", () => {
    const verdict = readBaseline(join(tmpdir(), "mizan-does-not-exist", "vs-search.json"))
    expect(isErr(verdict)).toBe(true)
  })
})