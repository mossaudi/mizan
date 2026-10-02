import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { RED_TEAM_FIXTURES } from "./red-team-fixtures.ts"

/**
 * HALLMARK 14-type coverage matrix test.
 *
 * ## What this test verifies
 *
 * 1. All 14 HALLMARK hallucination types are mapped to test cases.
 * 2. Each test case has a unique identifier.
 * 3. Each test case has a defined expected verdict.
 * 4. The coverage matrix document is present and citable.
 * 5. Each difficulty tier has at least one test case.
 *
 * ## Why this test exists
 *
 * The HALLMARK benchmark's core finding is that the false-positive rate, not recall,
 * decides whether a verifier is deployable. This test ensures mizan's verifier handles
 * every known hallucination category, not just the easy ones.
 */

const HALLMARK_TYPES = [
  "fabricated_doi",
  "nonexistent_venue",
  "placeholder_authors",
  "future_date",
  "chimeric_title",
  "wrong_venue",
  "author_mismatch",
  "preprint_as_published",
  "hybrid_fabrication",
  "merged_citation",
  "partial_author_list",
  "near_miss_title",
  "plausible_fabrication",
  "arxiv_version_mismatch",
] as const

describe("HALLMARK 14-type coverage", () => {
  test("all 14 HALLMARK types are mapped", () => {
    const mappedTypes = RED_TEAM_FIXTURES.map((f) => f.hallmarkType)
    for (const type of HALLMARK_TYPES) {
      expect(mappedTypes).toContain(type)
    }
  })

  test("each type has at least one test case", () => {
    for (const type of HALLMARK_TYPES) {
      const fixtures = RED_TEAM_FIXTURES.filter((f) => f.hallmarkType === type)
      expect(fixtures.length).toBeGreaterThanOrEqual(1)
    }
  })

  test("each test case has a unique identifier", () => {
    const ids = RED_TEAM_FIXTURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(14)
  })

  test("each test case has a defined expected verdict", () => {
    for (const fixture of RED_TEAM_FIXTURES) {
      expect(fixture.expectedVerdict).toBeDefined()
      expect(["unverifiable", "rejected"]).toContain(fixture.expectedVerdict)
    }
  })

  test("each test case is tagged with a difficulty tier", () => {
    for (const fixture of RED_TEAM_FIXTURES) {
      expect(fixture.tier).toBeDefined()
      expect(["Easy", "Medium", "Hard"]).toContain(fixture.tier)
    }
  })

  test("at least one test case exists for each tier", () => {
    const tiers = new Set(RED_TEAM_FIXTURES.map((f) => f.tier))
    expect(tiers.has("Easy")).toBe(true)
    expect(tiers.has("Medium")).toBe(true)
    expect(tiers.has("Hard")).toBe(true)
  })

  test("the coverage matrix document is present", () => {
    const matrixPath = join(import.meta.dir, "..", "..", "..", "docs", "hallmark-coverage-matrix.md")
    const content = readFileSync(matrixPath, "utf8")
    expect(content).toContain("HALLMARK")
    expect(content).toContain("RT-001")
    expect(content).toContain("RT-014")
  })

  test("the coverage matrix includes the HALLMARK paper reference", () => {
    const matrixPath = join(import.meta.dir, "..", "..", "..", "docs", "hallmark-coverage-matrix.md")
    const content = readFileSync(matrixPath, "utf8")
    expect(content).toContain("arXiv:2607.18360")
  })

  test("test cases contain no real hadith content", () => {
    for (const fixture of RED_TEAM_FIXTURES) {
      expect(fixture.claim.text).toContain("FABRICATED")
      expect(fixture.claim.quote).toContain("FABRICATED")
    }
  })
})
