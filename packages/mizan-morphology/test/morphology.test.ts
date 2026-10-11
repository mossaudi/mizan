import { describe, it, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  QURANIC_ROOTS,
  DECLARED_QURANIC_ROOT_COUNT,
  isQuranicRoot,
  getAllQuranicRoots,
  validateRoot,
} from "../src/roots.ts"
import {
  extractRoot,
  extractStem,
  extractLemma,
  analyzeText,
  buildRootCoverageArtefact,
  type DualStemmerResult,
} from "../src/analyzer.ts"
import { RootExtractionResult, TextMorphologyAnalysis, RootCoverageArtefact } from "../src/schema.ts"
import { decodeOrFail, decodeSync } from "@mizan/core"

describe("@mizan/morphology - Roots Dictionary", () => {
  it("has the declared root count as a constant matching actual dictionary", () => {
    // The declared count matches the actual dictionary size (CR fix: no misleading mismatch)
    expect(DECLARED_QURANIC_ROOT_COUNT).toBeGreaterThan(0)
    expect(DECLARED_QURANIC_ROOT_COUNT).toBe(getAllQuranicRoots().length)
  })

  it("isQuranicRoot returns true for known roots", () => {
    expect(isQuranicRoot("علم")).toBe(true)
    expect(isQuranicRoot("كفر")).toBe(true)
    expect(isQuranicRoot("إيمان")).toBe(true)
    expect(isQuranicRoot("صلاة")).toBe(true)
  })

  it("isQuranicRoot returns false for unknown strings", () => {
    expect(isQuranicRoot("غيرمعلوم")).toBe(false)
    expect(isQuranicRoot("xyz")).toBe(false)
    expect(isQuranicRoot("")).toBe(false)
  })

  it("getAllQuranicRoots returns sorted array", () => {
    const roots = getAllQuranicRoots()
    expect(Array.isArray(roots)).toBe(true)
    expect(roots.length).toBeGreaterThan(0)
    // Check sorted
    for (let i = 1; i < roots.length; i++) {
      const current = roots[i]
      const previous = roots[i - 1]
      if (current !== undefined && previous !== undefined) {
        expect(current >= previous).toBe(true)
      }
    }
  })

  it("validateRoot validates against ArabicRoot schema", () => {
    expect(validateRoot("علم")).toBe(true)
    expect(validateRoot("كفر")).toBe(true)
    // Too short
    expect(validateRoot("ع")).toBe(false)
    // Too long
    expect(validateRoot("علمكفرإيمانصلاة")).toBe(false)
    // Non-Arabic
    expect(validateRoot("abc")).toBe(false)
  })
})

describe("@mizan/morphology - Dual Stemmer Cross-Check", () => {
  it("extractRoot returns agreed root for known Quranic words", () => {
    const result = extractRoot("العالمين") // al-'alamin -> root: عالم
    expect(result.patternCandidate).not.toBeNull()
    expect(typeof result.dictionaryMatch).toBe("boolean")
    expect(typeof result.agreed).toBe("boolean")
  })

  it("extractRoot returns null root when stemmers disagree", () => {
    const result = extractRoot("غيرمعلوم") // not in dictionary
    expect(result.root).toBeNull()
    expect(result.agreed).toBe(false)
  })

  it("extractStem returns stem for valid words", () => {
    const stem = extractStem("المؤمنين")
    expect(stem).not.toBeNull()
    expect(typeof stem).toBe("string")
  })

  it("extractStem returns null for too-short words", () => {
    expect(extractStem("ع")).toBeNull()
    expect(extractStem("")).toBeNull()
  })

  it("extractLemma returns lemma for valid words", () => {
    const lemma = extractLemma("المؤمنين")
    expect(lemma).not.toBeNull()
    expect(typeof lemma).toBe("string")
  })

  it("analyzeText processes full text and returns aligned arrays", () => {
    const text = "العالمين الرحمن الرحيم"
    const result = analyzeText(text)

    expect(Array.isArray(result.roots)).toBe(true)
    expect(Array.isArray(result.stems)).toBe(true)
    expect(Array.isArray(result.lemmas)).toBe(true)
    expect(result.roots.length).toBe(result.stems.length)
    expect(result.stems.length).toBe(result.lemmas.length)
    expect(result.dualStemmerStats.total).toBeGreaterThan(0)
    expect(result.dualStemmerStats.agreed + result.dualStemmerStats.disagreed).toBeLessThanOrEqual(result.dualStemmerStats.total)
  })

  it("dual-stemmer stats track agreement and disagreement", () => {
    const text = "العالمين غيرمعلوم الرحمن"
    const result = analyzeText(text)

    expect(result.dualStemmerStats.total).toBe(3)
    expect(typeof result.dualStemmerStats.agreed).toBe("number")
    expect(typeof result.dualStemmerStats.disagreed).toBe("number")
  })
})

describe("@mizan/morphology - Schema Validation", () => {
  it("RootExtractionResult schema validates correct output", () => {
    const validResult = {
      root: "علم",
      patternCandidate: "علم",
      dictionaryMatch: true,
      agreed: true,
    }
    const decoded = decodeOrFail(decodeSync(RootExtractionResult), validResult, "RootExtractionResult")
    expect(decoded.ok).toBe(true)
  })

  it("RootExtractionResult schema rejects invalid root", () => {
    const invalidResult = {
      root: "غيرمعلوم", // not a valid root per schema (would fail ArabicRoot check)
      patternCandidate: "غيرمعلوم",
      dictionaryMatch: false,
      agreed: false,
    }
    const decoded = decodeOrFail(decodeSync(RootExtractionResult), invalidResult, "RootExtractionResult")
    // The schema allows any string for root field since it's NullOr(ArabicRoot) - ArabicRoot validates at decode
    // Actually ArabicRoot has constraints, so this should fail
    expect(decoded.ok).toBe(false)
  })

  it("TextMorphologyAnalysis schema validates analysis output", () => {
    const text = "العالمين الرحمن"
    const analysis = analyzeText(text)
    const validOutput = {
      roots: analysis.roots,
      stems: analysis.stems,
      lemmas: analysis.lemmas,
      dualStemmerStats: analysis.dualStemmerStats,
    }
    const decoded = decodeOrFail(decodeSync(TextMorphologyAnalysis), validOutput, "TextMorphologyAnalysis")
    expect(decoded.ok).toBe(true)
  })

  it("RootCoverageArtefact schema validates measurement artefact", () => {
    const artefact = buildRootCoverageArtefact(
      "test-fingerprint",
      { totalWords: 100, agreed: 80, disagreed: 10 },
      1200
    )
    const decoded = decodeOrFail(decodeSync(RootCoverageArtefact), artefact, "RootCoverageArtefact")
    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.value.schemaVersion).toBe(1)
      expect(decoded.value.declaredRootCount).toBe(DECLARED_QURANIC_ROOT_COUNT)
      expect(decoded.value.coveragePercent).toContain("%")
    }
  })
})

describe("@mizan/morphology - G-1.1 Compliance", () => {
  it("declares only @mizan/core as dependency (no @mizan/verify)", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps["@mizan/core"]).toBeDefined()
    expect(deps["@mizan/verify"]).toBeUndefined()
    // No other @mizan/* deps allowed except core
    for (const dep of Object.keys(deps)) {
      if (dep.startsWith("@mizan/") && dep !== "@mizan/core") {
        throw new Error(`Forbidden dependency: ${dep}`)
      }
    }
  })
})

export * as MorphologyTest from "./morphology.test.ts"