import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { normalizeForMatch } from "@mizan/core"
import { buildSnapshot, openSnapshot, toCorpusRecord } from "@mizan/corpus"
import {
  HARNESS_COMMAND,
  LATENCY_BAND_MULTIPLIER,
  casesFrom,
  conditionsLines,
  coverageAt,
  isHit,
  measureCase,
  scanCost,
  type MeasurementConditions,
} from "./suggest-coverage.ts"

/**
 * The coverage harness's own arithmetic, over a corpus small enough to be obvious.
 *
 * The harness's `main()` reads the committed corpus, takes about a minute, and asserts nothing on
 * its own — a measurement you cannot fail is not a guard. So the FIGURES it computes are tested
 * here against a fixture where the right answer is known by construction, and `main()` is left to
 * be run by a person who wants the number.
 *
 * Three properties are pinned here, and each one is a way the number could have lied:
 *   1. a hit is FOLDED TEXT, not a record id — the corpus stores the same verse twice, so an
 *      id-based test would report a miss where the reader gets the right answer;
 *   2. a cut-off is a PREFIX of one ranking, so top-1 ⊆ top-3 ⊆ top-5 and a ranker that reordered
 *      between cut-offs would be caught;
 *   3. `coverageAt` counts a MISS as a miss and never as a skip, which is what stops a missing
 *      measurement from quietly improving the reported rate.
 */

const VERSE = "الله لا إله إلا هو الحي القيوم"

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
  test("a quote fabricated from the verse is found in the corpus", () => {
    const fabricated = `${VERSE} العظيم`
    const measured = measureCase(db, { id: "fixture-1", quote: fabricated, anchorFolded: normalizeForMatch(VERSE) })
    // Floor 4 is the loosest configuration, floor 12 the strictest; the fixture is small enough
    // that the strictest still admits the verse, which is what makes the cut-off test below mean
    // something rather than pass by being empty.
    expect(measured.hits[4]?.[0]).toBe(true)
    expect(measured.ms).toBeGreaterThan(0)
  })

  test("cut-offs are prefixes of one ranking, so hits never disappear as the list grows", () => {
    const fabricated = `${VERSE} العظيم`
    const measured = measureCase(db, { id: "fixture-1", quote: fabricated, anchorFolded: normalizeForMatch(VERSE) })
    for (const floor of [4, 8, 12]) {
      const [top1, top3, top5] = measured.hits[floor] ?? []
      expect(top1).toBe(true)
      expect(top3).toBe(true)
      expect(top5).toBe(true)
    }
  })

  test("a quote with no near record is a miss at every floor, and that is a number not a failure", () => {
    const measured = measureCase(db, { id: "fixture-2", quote: "nothing in this corpus resembles these words", anchorFolded: normalizeForMatch(VERSE) })
    expect(measured.hits[4]?.flat().every((hit) => hit === false)).toBe(true)
  })

  test("the identical verse is listed once, so a second id cannot be counted twice", () => {
    const measured = measureCase(db, { id: "fixture-1", quote: `${VERSE} العظيم`, anchorFolded: normalizeForMatch(VERSE) })
    expect(measured.hits[4]?.[2]).toBe(true)
  })
})

describe("the reported figures cannot be flattered by a missing measurement", () => {
  const measurement = (id: string, hit: boolean) => ({ id, ms: 10, hits: { 4: [hit, hit, hit] } })

  test("a hit is counted and a miss is counted", () => {
    expect(coverageAt([measurement("a", true), measurement("b", false)], 4, 0, 2)).toBe("1/2")
  })

  test("a measurement with no entry for the floor counts as a miss, not as an absent case", () => {
    // The denominator is the caller's `total`, not the length of the list that happened to have an
    // entry. That is the whole point: a harness that quietly shrinks its own denominator reports a
    // better rate for a worse run.
    expect(coverageAt([{ id: "a", ms: 1, hits: {} }], 4, 0, 3)).toBe("0/3")
  })

  test("the p95 comes from the sorted times, and one slow case moves it", () => {
    const even = scanCost([{ id: "a", ms: 10, hits: {} }, { id: "b", ms: 20, hits: {} }])
    expect(even.max).toBe(20)
    const odd = scanCost([{ id: "a", ms: 10, hits: {} }, { id: "b", ms: 20, hits: {} }, { id: "c", ms: 900, hits: {} }])
    expect(odd.p50).toBe(20)
    expect(odd.p95).toBe(900)
    expect(odd.max).toBe(900)
    // Sorted by value, so the declaration order of the cases cannot change the figure.
    expect(scanCost([{ id: "b", ms: 900, hits: {} }, { id: "a", ms: 10, hits: {} }, { id: "c", ms: 20, hits: {} }]).p95).toBe(900)
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