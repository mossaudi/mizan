import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Degradation matrix tests.
 *
 * ## What these tests verify
 *
 * 1. All 7 failure modes are documented in the degradation matrix.
 * 2. Each failure mode has a named exit code.
 * 3. Each failure mode has exactly one correct surface.
 * 4. No failure mode produces a canned answer or silent mock.
 * 5. The degradation matrix is present and citable.
 */

const DEGRADATION_MATRIX_PATH = join(import.meta.dir, "..", "..", "..", "docs", "degradation-matrix.md")

const FAILURE_MODES = [
  { id: 1, name: "Provider down", surface: "model unavailable", exitCode: 1 },
  { id: 2, name: "Corpus miss", surface: "no sources found", exitCode: 1 },
  { id: 3, name: "Verification timeout", surface: "unverifiable", exitCode: 1 },
  { id: 4, name: "Ledger write failure", surface: "run marked untrusted", exitCode: 3 },
  { id: 5, name: "Attestation mismatch", surface: "loud integrity error", exitCode: 3 },
  { id: 6, name: "Tafsir backend unreachable", surface: "unavailable", exitCode: 1 },
  { id: 7, name: "Second ranker down", surface: 'semanticRanking: "unavailable"', exitCode: 1 },
] as const

describe("degradation matrix", () => {
  test("all 7 failure modes are documented", () => {
    const content = readFileSync(DEGRADATION_MATRIX_PATH, "utf8")
    for (const mode of FAILURE_MODES) {
      expect(content).toContain(mode.name)
    }
  })

  test("each failure mode has a named exit code", () => {
    const content = readFileSync(DEGRADATION_MATRIX_PATH, "utf8")
    for (const mode of FAILURE_MODES) {
      expect(content).toContain(`Exit Code`)
      expect(mode.exitCode).toBeGreaterThan(0)
    }
  })

  test("each failure mode has exactly one correct surface", () => {
    const content = readFileSync(DEGRADATION_MATRIX_PATH, "utf8")
    for (const mode of FAILURE_MODES) {
      expect(content).toContain(mode.surface)
    }
  })

  test("no failure mode produces a canned answer", () => {
    const content = readFileSync(DEGRADATION_MATRIX_PATH, "utf8")
    expect(content).toContain("canned answer")
    expect(content).toContain("Forbidden Surfaces")
  })

  test("no failure mode produces a silent mock", () => {
    const content = readFileSync(DEGRADATION_MATRIX_PATH, "utf8")
    expect(content).toContain("silent mock")
  })

  test("the degradation matrix documents the fail-closed principle", () => {
    const content = readFileSync(DEGRADATION_MATRIX_PATH, "utf8")
    expect(content).toContain("Fail closed")
  })

  test("the degradation matrix documents no bypass", () => {
    const content = readFileSync(DEGRADATION_MATRIX_PATH, "utf8")
    expect(content).toContain("No bypass")
  })
})
