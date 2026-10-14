import { test, expect, describe, beforeAll } from "bun:test"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { RootCoverageArtefact, decodeOrFail, decodeSync } from "@mizan/core"

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(TEST_DIR, "..", "..", "..")
const ARTEFACT_PATH = join(PROJECT_ROOT, "docs", "artefacts", "root-coverage.json")

/**
 * Root-coverage measurement artefact tests — corpus lane.
 *
 * These tests verify the root-coverage JSON artefact meets the schema
 * and documents the dual-stemmer delta honestly.
 * They are in the "corpus" opt-in lane (scripts/ci-lanes.ts).
 */

describe("Root coverage artefact", () => {
  const artefactPath = ARTEFACT_PATH

  test("artefact file exists", () => {
    expect(() => readFileSync(artefactPath, "utf8")).not.toThrow()
  })

  test("artefact decodes against RootCoverageArtefact schema", () => {
    const text = readFileSync(artefactPath, "utf8")
    const parsed = JSON.parse(text)
    const decoded = decodeOrFail(decodeSync(RootCoverageArtefact), parsed, "RootCoverageArtefact")
    expect(decoded.ok).toBe(true)
  })

  describe("artefact content", () => {
    let artefact: ReturnType<typeof JSON.parse>

    beforeAll(() => {
      const text = readFileSync(artefactPath, "utf8")
      artefact = JSON.parse(text)
    })

    test("has correct schema version", () => {
      expect(artefact.schemaVersion).toBe(1)
    })

    test("coveragePercent is documented (not 100%)", () => {
      expect(typeof artefact.coveragePercent).toBe("number")
      // Itqan achieves 96.3% with dual-stemmer + alias map
      // Our measurement should document honestly
      expect(artefact.coveragePercent).toBeLessThanOrEqual(96.3)
      expect(artefact.coveragePercent).toBeGreaterThan(0)
    })

    test("totalMappings is positive", () => {
      expect(typeof artefact.totalMappings).toBe("number")
      expect(artefact.totalMappings).toBeGreaterThan(0)
    })

    test("aliasMapEntries is 131 (Itqan's alias map size)", () => {
      expect(artefact.aliasMapEntries).toBe(131)
    })

    test("stemmerDelta documents 42-50% disagreement", () => {
      expect(typeof artefact.stemmerDelta).toBe("string")
      expect(artefact.stemmerDelta).toContain("42")
      expect(artefact.stemmerDelta).toContain("50")
      expect(artefact.stemmerDelta).toContain("%")
    })

    test("indexShipped is false (measurement only, not production index)", () => {
      expect(artefact.indexShipped).toBe(false)
    })

    test("methodologicalNotes explains dual-stemmer approach", () => {
      expect(typeof artefact.methodologicalNotes).toBe("string")
      expect(artefact.methodologicalNotes.length).toBeGreaterThan(50)
      expect(artefact.methodologicalNotes.toLowerCase()).toContain("dual")
      expect(artefact.methodologicalNotes.toLowerCase()).toContain("stemmer")
    })

    test("conditions documents measurement conditions", () => {
      expect(typeof artefact.conditions).toBe("object")
      expect(artefact.conditions).not.toBeNull()
    })

    test("generatedAt is valid ISO timestamp", () => {
      expect(typeof artefact.generatedAt).toBe("string")
      const date = new Date(artefact.generatedAt)
      expect(date.toString()).not.toBe("Invalid Date")
    })

    test("gitCommit is present", () => {
      expect(typeof artefact.gitCommit).toBe("string")
      expect(artefact.gitCommit.length).toBeGreaterThan(0)
    })
  })

  describe("artefact honesty checks", () => {
    let artefact: ReturnType<typeof JSON.parse>

    beforeAll(() => {
      const text = readFileSync(artefactPath, "utf8")
      artefact = JSON.parse(text)
    })

    test("does not claim production-ready index", () => {
      // The artefact must NOT claim the index is shipped for verification
      expect(artefact.indexShipped).toBe(false)
    })

    test("documents stemmer delta as limitation", () => {
      // The delta must be explicitly documented as a warning
      expect(artefact.stemmerDelta).toMatch(/42.*50.*%/i)
    })

    test("methodologicalNotes mentions CAMeL and Wensinck", () => {
      const notes = artefact.methodologicalNotes.toLowerCase()
      expect(notes).toContain("camel")
      expect(notes).toContain("wensinck")
    })

    test("note field clarifies measurement-only nature", () => {
      if (artefact.note) {
        expect(artefact.note.toLowerCase()).toContain("measurement")
      }
    })
  })
})

export * as RootCoverageArtefactTest from "./root-coverage-artefact.test.ts"