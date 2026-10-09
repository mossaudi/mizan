import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { HALLMARK_TYPES, RED_TEAM_FIXTURES, ARTICLE_RED_TEAM_FIXTURES } from "./red-team-fixtures.ts"

/**
 * The committed coverage matrix, as an absolute path.
 *
 * Declared once so the four assertions below that read it cannot disagree about which file they read.
 */
const MATRIX_PATH = join(import.meta.dir, "..", "..", "..", "docs", "hallmark-coverage-matrix.md")

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
 *
 * ## The taxonomy is imported, not retyped
 *
 * This file used to declare its own copy of the 14 type strings. That is a second answer to "what
 * are the HALLMARK types" which can agree with the fixtures while being wrong about the paper, and
 * a coverage test that enumerates the taxonomy from the same place the fixtures are built is the
 * only version that can notice a type nobody implemented (AGENTS.md section 17).
 */

describe("HALLMARK 14-type coverage", () => {
  test("the published taxonomy is the 14 types, so a shortened list cannot quietly pass this suite", () => {
    expect(HALLMARK_TYPES).toHaveLength(14)
  })

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
    const content = readFileSync(MATRIX_PATH, "utf8")
    expect(content).toContain("HALLMARK")
    expect(content).toContain("RT-001")
    expect(content).toContain("RT-014")
  })

  test("the coverage matrix includes the HALLMARK paper reference", () => {
    const content = readFileSync(MATRIX_PATH, "utf8")
    expect(content).toContain("arXiv:2607.18360")
  })

  test("test cases contain no real hadith content", () => {
    for (const fixture of RED_TEAM_FIXTURES) {
      expect(fixture.claim.text).toContain("FABRICATED")
      expect(fixture.claim.quote).toContain("FABRICATED")
    }
  })

  test("the matrix document's declared verdicts are the fixtures' declared verdicts", () => {
    // The document is the citable artefact, so it is a second published answer to "what does RT-004
    // earn?". It WAS a second answer, and it was the wrong one: the matrix printed `unverifiable` for
    // all 14 while the fixtures earned `rejected` for 11 of them, and the benchmark then reported 10
    // correct verdicts as failures. A document nobody diffs against the code is a document that
    // drifts, so the diff is the test.
    const matrix = readFileSync(MATRIX_PATH, "utf8")
    const rowOf = (id: string): string | undefined =>
      matrix.split("\n").find((line) => line.startsWith(`| `) && line.includes(`| ${id} |`))

    for (const fixture of RED_TEAM_FIXTURES) {
      const row = rowOf(fixture.id)
      expect(row).toBeDefined()
      // Column 6 of the matrix table is the expected verdict. Sliced by cell boundary so the fixture
      // id in column 4 and the test file path in column 7 cannot be mistaken for it.
      const cells = (row ?? "").split("|").map((cell) => cell.trim())
      expect(cells[6]).toBe(fixture.expectedVerdict)
    }
  })

  test("no fixture declares `verified`, because that is the one verdict this suite exists to forbid", () => {
    // The field's type already forbids it, so this is a guard on the type, not on the data: it fails
    // the moment somebody widens `expectedVerdict` to include `verified`, which is the single edit
    // that would let the suite declare its own failure as an expectation.
    const declared = new Set(RED_TEAM_FIXTURES.map((fixture) => fixture.expectedVerdict))
    expect(declared.has("verified" as (typeof RED_TEAM_FIXTURES)[number]["expectedVerdict"])).toBe(false)
  })
})

describe("the article surface inherits HALLMARK cases rather than extending the taxonomy", () => {
  /**
   * Every article fixture's row in the matrix, by fixture id.
   *
   * The matrix is the citable artefact, so a fixture that exists only in code is a fixture a judge
   * cannot find \u2014 which is the same defect as a red-team suite whose inputs were re-pointed without
   * disclosure, recorded further down this document.
   */
  const rowOf = (id: string): string | undefined =>
    readFileSync(MATRIX_PATH, "utf8")
      .split("\n")
      .find((line) => line.startsWith(`| `) && line.includes(`| ${id} |`))

  test("the article surface has at least one pinned case, so a new feature cannot ship with no red-team coverage", () => {
    expect(ARTICLE_RED_TEAM_FIXTURES.length).toBeGreaterThan(0)
  })

  test("every article fixture names a type the fourteen already publish, so the taxonomy stays at fourteen", () => {
    for (const fixture of ARTICLE_RED_TEAM_FIXTURES) {
      expect(HALLMARK_TYPES).toContain(fixture.hallmarkType)
    }
  })

  test("every article fixture has a row in the committed matrix, named and declared as unreachable", () => {
    for (const fixture of ARTICLE_RED_TEAM_FIXTURES) {
      const row = rowOf(fixture.id)
      expect(row).toBeDefined()
      expect(row).toContain(fixture.hallmarkType)
      expect(row).toContain("`unverifiable`")
    }
  })

  test("an article fixture id can never collide with a per-claim one, so the two sets cannot be confused", () => {
    const ids = ARTICLE_RED_TEAM_FIXTURES.map((fixture) => fixture.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(RED_TEAM_FIXTURES.map((fixture) => fixture.id)).not.toContain(id)
  })

  test("both attack shapes the article path adds are covered: injection-to-grant and a plausible fabrication", () => {
    // The two shapes named by R-6 and R-2 respectively. A new surface that shipped with only one of
    // them would be covered against one failure and blind to the other.
    const types = ARTICLE_RED_TEAM_FIXTURES.map((fixture) => fixture.hallmarkType)
    expect(types).toContain("hybrid_fabrication")
    expect(types).toContain("plausible_fabrication")
  })
})
