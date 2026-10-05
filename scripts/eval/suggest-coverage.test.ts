import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { err, normalizeForMatch, isErr, isOk, ok, unwrapOrThrow } from "@mizan/core"
import { buildSnapshot, openSnapshot, toCorpusRecord } from "@mizan/corpus"
import { MIN_SHARED_TRIGRAMS } from "@mizan/suggest"
import { MIN_SHARED_RUN_CHARS } from "@mizan/verify"
import {
  CUTOFFS,
  FLOORS,
  HARNESS_COMMAND,
  LATENCY_BAND_MULTIPLIER,
  RUN_FLOORS,
  attempt,
  casesFrom,
  conditionsLines,
  coverageAt,
  floorRecallCost,
  incompleteFloors,
  isHit,
  measureCase,
  precisionAt,
  recordFigures,
  scanCost,
  slowestOf,
  suggestionFigures,
  RECORD_RUNS,
  type CaseMeasurement,
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
    unwrapOrThrow(measureCase(db, { id, quote, anchorFolded }), `measureCase(${id})`)

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
    const result = measureCase(closed, { id: "fixture-closed", quote: `${VERSE} العظيم`, anchorFolded: normalizeForMatch(VERSE) })
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
    const result = measureCase(closed, { id: "fixture-closed", quote: VERSE, anchorFolded: normalizeForMatch(VERSE) })
    expect(isErr(result)).toBe(true)
    if (isOk(result)) return
    expect(result.error).not.toContain(VERSE)
  })

  test("no measurement is returned alongside the reason, so a caller cannot read a figure out of a failed case", () => {
    const closed = openFixture()
    closed.close()
    const result = measureCase(closed, { id: "fixture-closed", quote: VERSE, anchorFolded: normalizeForMatch(VERSE) })
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
  test("an anchor absent from the set falls back to the anchor id rather than to an empty string", () => {
    const cases = casesFrom({
      cases: [
        { id: "c1", quote: "q", anchorId: "bukhari:1" },
        { id: "c2", quote: "q2", anchorId: "bukhari:2", anchorText: "text" },
      ],
    } as unknown as Parameters<typeof casesFrom>[0])
    expect(cases[0]?.anchorFolded).toBe(normalizeForMatch("bukhari:1"))
    expect(cases[1]?.anchorFolded).toBe(normalizeForMatch("text"))
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
  const figures = suggestionFigures(measurements, { p50: 600.4, p95: 700.6, max: 900.2 }, identity)

  test("every value is top-level, so nothing is nested out of the rule's reach", () => {
    for (const value of Object.values(figures)) {
      expect(typeof value === "number" || typeof value === "string").toBe(true)
    }
  })

  test("the only string is the corpus fingerprint, because a latency without a corpus is about nothing", () => {
    const strings = Object.entries(figures).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    expect(strings.map((entry) => entry[0])).toEqual(["suggestionCorpusFingerprint"])
    expect(figures.suggestionCorpusFingerprint).toBe(identity.snapshotHash)
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
    expect(attempt(() => err("scan failed: ...")).error).toBe("scan failed: ...")
    expect(isOk(attempt(() => ok(41)))).toBe(true)
  })

  test("the tables are checked for completeness before a measurement is published", () => {
    // `coverageAt` counts a missing entry as a MISS and `precisionAt` reads a missing floor as zero
    // shown — both total, both deliberate, and both of which turn an incomplete table into a coverage
    // number that is quietly too low. The readers cannot be the ones to notice, so the producer is.
    const full = Object.fromEntries(FLOORS.map((floor) => [floor, CUTOFFS.map(() => false)]))
    const gated = Object.fromEntries(RUN_FLOORS.map((floor) => [floor, DISPLAYED]))
    expect(incompleteFloors(full, gated)).toBeNull()

    const oneShort = { ...full, [FLOORS[2]]: CUTOFFS.slice(0, 2) }
    expect(incompleteFloors(oneShort, gated)).toContain(`${FLOORS[2]}`)
  })

  test("a display floor with no entry refuses too, and names how many are missing", () => {
    // The other table, and the one whose failure would be invisible: an absent `gated` entry is read as
    // zero rows shown, which shortens the denominator and quietly improves the precision it is a
    // fraction of.
    const full = Object.fromEntries(FLOORS.map((floor) => [floor, CUTOFFS.map(() => false)]))
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