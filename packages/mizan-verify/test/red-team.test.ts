import { describe, expect, test } from "bun:test"
import { verifyAnswer } from "../src/verify.ts"
import { RED_TEAM_FIXTURES } from "./red-team-fixtures.ts"
import { SNAPSHOT_HASH } from "./fixtures.ts"

/**
 * Red-team test: zero false `verified` verdicts on fabricated citations.
 *
 * ## The acceptance criterion
 *
 * Every fixture in RED_TEAM_FIXTURES must NOT produce a `verified` verdict.
 * All fixtures must receive either `unverifiable` or `rejected`.
 *
 * ## Why this test exists
 *
 * The HALLMARK benchmark's core finding is that the false-positive rate, not recall,
 * decides whether a verifier is deployable. For mizan, a false `verified` on a
 * fabricated hadith is a religious harm, not a bug. This test is the machine-checked
 * invariant that the verifier never fabricates a `verified` verdict.
 *
 * ## What would make this test fail
 *
 * - A fixture produces a `verified` verdict (the verifier was talked into confirming
 *   a fabrication — the CWE-345 hole).
 * - A fixture crashes the verifier (an unexpected error is a test failure, not a pass).
 */

describe("red-team: zero false verified verdicts", () => {
  test("all 14 HALLMARK-type fixtures are present", () => {
    expect(RED_TEAM_FIXTURES).toHaveLength(14)
  })

  test("every fixture has a unique ID", () => {
    const ids = RED_TEAM_FIXTURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(14)
  })

  test("every fixture is labelled as fabricated", () => {
    for (const fixture of RED_TEAM_FIXTURES) {
      expect(fixture.claim.text).toContain("FABRICATED")
      expect(fixture.claim.quote ?? "").toContain("FABRICATED")
    }
  })

  test("no fixture produces a verified verdict", () => {
    const failures: string[] = []
    for (const fixture of RED_TEAM_FIXTURES) {
      const report = verifyAnswer({
        claims: [fixture.claim],
        evidence: [],
        snapshotHash: SNAPSHOT_HASH,
      })
      const verdict = report.claims[0]
      if (verdict === undefined) {
        failures.push(`${fixture.id}: no verdict produced`)
        continue
      }
      if (verdict.verdict === "verified") {
        failures.push(`${fixture.id}: FABRICATED citation produced verified verdict`)
      }
    }
    expect(failures).toEqual([])
  })

  test("every fixture produces either unverifiable or rejected", () => {
    for (const fixture of RED_TEAM_FIXTURES) {
      const report = verifyAnswer({
        claims: [fixture.claim],
        evidence: [],
        snapshotHash: SNAPSHOT_HASH,
      })
      const verdict = report.claims[0]
      expect(verdict).toBeDefined()
      expect(verdict?.verdict === "unverifiable" || verdict?.verdict === "rejected").toBe(true)
    }
  })

  test("the full red-team suite passes only if zero false verified", () => {
    let falseVerified = 0
    for (const fixture of RED_TEAM_FIXTURES) {
      const report = verifyAnswer({
        claims: [fixture.claim],
        evidence: [],
        snapshotHash: SNAPSHOT_HASH,
      })
      if (report.claims[0]?.verdict === "verified") falseVerified += 1
    }
    expect(falseVerified).toBe(0)
  })
})
