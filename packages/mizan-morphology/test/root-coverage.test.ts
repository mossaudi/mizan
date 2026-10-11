import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { existsSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import {
  scanCorpusRoots,
  renderRootCoverage,
  buildConditions,
  recordArtefact,
  checkBaseline,
  parseMode,
  type RootCoverageMode,
  HARNESS_COMMAND,
} from "../../../scripts/eval/root-coverage.ts"
import { buildSnapshot, openSnapshot, type Snapshot } from "@mizan/corpus"
import { toCorpusRecord, type RawRecord } from "@mizan/corpus"
import { normalizeForMatch, type CorpusRecord, CorpusRecord as CorpusRecordSchema } from "@mizan/core"
import { DECLARED_QURANIC_ROOT_COUNT } from "@mizan/morphology"
import type { SourceMeta } from "@mizan/corpus"

const TMP_DIR = join(tmpdir(), "mizan-root-coverage-test")

const meta = (over: { descriptor?: Partial<SourceMeta["descriptor"]>; enabled?: boolean; exclusionReason?: string | null } = {}): SourceMeta => ({
  enabled: over.enabled ?? true,
  exclusionReason: over.exclusionReason ?? null,
  descriptor: {
    source: "test/fixture",
    title: "Test fixture",
    publisher: "test",
    url: "https://example.invalid/data",
    license: "CC0-1.0",
    licenceClass: "permissive",
    licenseUrl: "https://example.invalid/licence",
    attribution: "test fixture",
    gradeApplicable: true,
    gradeBasis: "row" as const,
    notes: null,
    ...over.descriptor,
  },
})

const raw = (over: Partial<RawRecord> = {}): RawRecord => ({
  id: "test:1",
  collection: "test",
  number: "1",
  textDisplay: "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ",
  sourceUrl: null,
  grade: null,
  gradeBasis: "none",
  translation: null,
  ...over,
})

let testDb: Database
let testSnapshot: Snapshot
let testRecords: CorpusRecord[]

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true })

  testRecords = [
    toCorpusRecord(raw({ id: "test:1", textDisplay: "العالمين الرحمن الرحيم" }), { meta: meta(), gradeSource: "test" }),
    toCorpusRecord(raw({ id: "test:2", textDisplay: "المؤمنين الصالحين" }), { meta: meta(), gradeSource: "test" }),
  ]

  const path = join(TMP_DIR, "test-corpus.db")
  testSnapshot = buildSnapshot(path, testRecords)
  testDb = openSnapshot(path)
})

afterAll(() => {
  testDb.close()
  try {
    rmSync(TMP_DIR, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe("@mizan/eval:roots - scanCorpusRoots", () => {
  it("scans the corpus and returns root statistics", () => {
    const result = scanCorpusRoots(testDb)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { totalWords, agreed, disagreed, rootsFound, perCollection } = result.value
    expect(totalWords).toBeGreaterThan(0)
    expect(agreed).toBeGreaterThanOrEqual(0)
    expect(disagreed).toBeGreaterThanOrEqual(0)
    expect(rootsFound).toBeInstanceOf(Set)
    expect(perCollection).toBeInstanceOf(Map)
    expect(perCollection.has("test")).toBe(true)
  })

  it("dual-stemmer stats track agreement and disagreement", () => {
    const result = scanCorpusRoots(testDb)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { agreed, disagreed, totalWords } = result.value
    expect(agreed + disagreed).toBeLessThanOrEqual(totalWords)
  })
})

describe("@mizan/eval:roots - renderRootCoverage", () => {
  it("renders a formatted coverage table", () => {
    const stats = { totalWords: 100, agreed: 80, disagreed: 10 }
    const rootsFound = new Set(["عالم", "رحمن", "مؤمن"])
    const perCollection = new Map([
      ["test", { words: 100, agreed: 80, roots: new Set(["عالم", "رحمن", "مؤمن"]) }],
    ])
    const served = new Map([["test", 2]])

    const output = renderRootCoverage(stats, rootsFound, perCollection, served)
    expect(output).toContain("ROOT COVERAGE MEASUREMENT")
    expect(output).toContain(`Declared Quranic roots: ${DECLARED_QURANIC_ROOT_COUNT}`)
    expect(output).toContain("Roots found in corpus: 3")
    expect(output).toContain("DUAL-STEMMER CROSS-CHECK")
    expect(output).toContain("Total words analyzed: 100")
    expect(output).toContain("Stemmers agreed: 80")
    expect(output).toContain("PER-COLLECTION BREAKDOWN")
    expect(output).toContain("test")
  })
})

describe("@mizan/eval:roots - buildConditions", () => {
  it("builds conditions object with expected fields", () => {
    const identity = { snapshotHash: "abc123", recordCount: 100 }
    const conditions = buildConditions(identity)
    expect(conditions.corpus).toBe("abc123")
    expect(conditions.stemmerVersion).toBe("pattern+dictionary:v1")
    expect(conditions.dictionaryVersion).toContain("quranic-roots-")
    expect(conditions.command).toBe(HARNESS_COMMAND)
    expect(conditions.platform).toBeDefined()
    expect(conditions.arch).toBeDefined()
    expect(conditions.cpus).toBeDefined()
    expect(conditions.nodeVersion).toBeDefined()
  })
})

describe("@mizan/eval:roots - recordArtefact", () => {
  it("writes artefact to disk and returns path", () => {
    const artefact = {
      schemaVersion: 1 as const,
      generatedBy: "test",
      corpusFingerprint: "abc123",
      declaredRootCount: DECLARED_QURANIC_ROOT_COUNT,
      rootsFound: 3,
      coveragePercent: "1.1%",
      dualStemmer: { totalWords: 100, agreed: 80, disagreed: 10, agreementRate: "80.0%" },
      conditions: { corpus: "abc123", stemmerVersion: "v1", dictionaryVersion: "v1" },
      note: "test",
    }

    // Ensure the directory exists
    const artefactDir = join(process.cwd(), "data", "artefacts")
    mkdirSync(artefactDir, { recursive: true })

    const result = recordArtefact(artefact)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toContain("root-coverage.json")
      expect(existsSync(result.value)).toBe(true)
    }
  })
})

describe("@mizan/eval:roots - checkBaseline", () => {
  it("passes when baseline exists", () => {
    const baseline = { rootsFound: 3, coveragePercent: "1.1%", agreementRate: "80.0%" }
    const figures = { rootsFound: 3, coveragePercent: "1.1%", agreementRate: "80.0%" }
    const result = checkBaseline(baseline, figures)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe("baseline exists")
  })

  it("fails when baseline is empty", () => {
    const baseline = {}
    const figures = { rootsFound: 3, coveragePercent: "1.1%", agreementRate: "80.0%" }
    const result = checkBaseline(baseline, figures)
    expect(result.ok).toBe(false)
  })
})

describe("@mizan/eval:roots - parseMode", () => {
  it("parses measure mode (no flags)", () => {
    const result = parseMode([])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe("measure")
  })

  it("parses check mode", () => {
    const result = parseMode(["--check"])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe("check")
  })

  it("parses record mode", () => {
    const result = parseMode(["--record"])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe("record")
  })

  it("rejects unknown flags", () => {
    const result = parseMode(["--unknown"])
    expect(result.ok).toBe(false)
  })

  it("rejects multiple flags", () => {
    const result = parseMode(["--check", "--record"])
    expect(result.ok).toBe(false)
  })
})

describe("@mizan/eval:roots - integration", () => {
  it("end-to-end scan produces valid artefact structure", () => {
    const scanResult = scanCorpusRoots(testDb)
    expect(scanResult.ok).toBe(true)
    if (!scanResult.ok) return

    const { totalWords, agreed, disagreed, rootsFound } = scanResult.value
    const artefact = {
      schemaVersion: 1 as const,
      generatedBy: "test",
      corpusFingerprint: testSnapshot.snapshotHash,
      declaredRootCount: DECLARED_QURANIC_ROOT_COUNT,
      rootsFound: rootsFound.size,
      coveragePercent: `${DECLARED_QURANIC_ROOT_COUNT > 0 ? (Math.round((rootsFound.size / DECLARED_QURANIC_ROOT_COUNT) * 1000) / 10).toFixed(1) : 0}%`,
      dualStemmer: {
        totalWords,
        agreed,
        disagreed,
        agreementRate: `${totalWords > 0 ? (Math.round((agreed / totalWords) * 1000) / 10).toFixed(1) : 0}%`,
      },
      conditions: { corpus: testSnapshot.snapshotHash, stemmerVersion: "v1", dictionaryVersion: "v1" },
      note: "test",
    }

    expect(artefact.schemaVersion).toBe(1)
    expect(artefact.declaredRootCount).toBe(DECLARED_QURANIC_ROOT_COUNT)
    expect(artefact.rootsFound).toBeGreaterThanOrEqual(0)
    expect(artefact.coveragePercent).toContain("%")
    expect(artefact.dualStemmer.agreementRate).toContain("%")
  })

  it("database schema includes morphology columns (root, stem, lemma)", () => {
    const stmt = testDb.query("PRAGMA table_info(records)")
    const columns = stmt.all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)
    expect(columnNames).toContain("root")
    expect(columnNames).toContain("stem")
    expect(columnNames).toContain("lemma")
  })

  it("CorpusRecord schema includes optional root, stem, lemma fields", () => {
    // Verify the schema declares the morphology fields
    const schemaKeys = Object.keys(CorpusRecordSchema.fields)
    expect(schemaKeys).toContain("root")
    expect(schemaKeys).toContain("stem")
    expect(schemaKeys).toContain("lemma")
  })

  it("morphology fields can be written to and read from snapshot", () => {
    const meta = (over: { descriptor?: Partial<SourceMeta["descriptor"]>; enabled?: boolean; exclusionReason?: string | null } = {}): SourceMeta => ({
      enabled: over.enabled ?? true,
      exclusionReason: over.exclusionReason ?? null,
      descriptor: {
        source: "test/morph",
        title: "Test morphology",
        publisher: "test",
        url: "https://example.invalid/data",
        license: "CC0-1.0",
        licenceClass: "permissive",
        licenseUrl: "https://example.invalid/licence",
        attribution: "test fixture",
        gradeApplicable: true,
        gradeBasis: "row" as const,
        notes: null,
        ...over.descriptor,
      },
    })

    const raw = (over: Partial<RawRecord> = {}): RawRecord => ({
      id: "test:morph1",
      collection: "test",
      number: "1",
      textDisplay: "العالمين الرحمن الرحيم",
      sourceUrl: null,
      grade: null,
      gradeBasis: "none",
      translation: null,
      ...over,
    })

    const record = toCorpusRecord(raw({ id: "test:morph1", textDisplay: "العالمين الرحمن الرحيم" }), { meta: meta(), gradeSource: "test" })
    
    // Manually add morphology fields (simulating what would happen if populated during ingest)
    const recordWithMorph = {
      ...record,
      root: "عالم",
      stem: "عالم",
      lemma: "عالم",
    }

    const testDir = join(tmpdir(), "mizan-morph-test-" + Date.now())
    const path = join(testDir, "morph-test.db")
    mkdirSync(testDir, { recursive: true })
    
    const { buildSnapshot: buildSnap } = require("@mizan/corpus")
    const snapshot = buildSnap(path, [recordWithMorph])
    
    const db = openSnapshot(path)
    const row = db.query("SELECT root, stem, lemma FROM records WHERE id = ?").get("test:morph1") as { root: string; stem: string; lemma: string }
    
    expect(row.root).toBe("عالم")
    expect(row.stem).toBe("عالم")
    expect(row.lemma).toBe("عالم")
    
    db.close()
    // Windows: file handle may linger; best-effort cleanup
    try { rmSync(testDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })
})