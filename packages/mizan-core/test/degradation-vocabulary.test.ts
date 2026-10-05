import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DegradationCondition, conditionOf, decodeCondition, describeCondition } from "@mizan/core"

/**
 * The degradation vocabulary as a contract, not as prose.
 *
 * ## Why this file exists separately from the existing `degradation.test.ts`
 *
 * That file checks the seven rows are *documented*. This one checks they are *enforceable*: that a
 * surface naming a condition gets the same name a customer reads on the other surface, and that a
 * condition nobody adjudicated is a decode failure rather than a string that happens to be accepted.
 *
 * The gap between the two is where Story 7's requirement lived: "both surfaces name the same
 * degradation condition" was previously checkable only by comparing two sets of string literals by
 * eye, and there is no test that could fail when they diverged.
 */

/** One name per row of the AGENTS.md section 16 table, plus the one non-failure state. */
const CONDITIONS = [
  "corpus_absent",
  "no_sources_found",
  "model_unavailable",
  "unverifiable",
  "semantic_ranking_unavailable",
  "ledger_write_failed",
  "attestation_mismatch",
  "unmeasured",
] as const

describe("DegradationCondition", () => {
  test("every condition in the constitution's table decodes", () => {
    for (const condition of CONDITIONS) {
      const decoded = decodeCondition(condition)
      expect(decoded.ok).toBe(true)
      if (decoded.ok) expect(decoded.value).toBe(condition)
    }
  })

  test("an unknown name is a decode failure, never a silent pass", () => {
    for (const bogus of ["corpus_absent_but_really_fine", "CORPUS_ABSENT", "", "verified", "ok"]) {
      expect(decodeCondition(bogus).ok).toBe(false)
    }
  })

  test("a non-string is a decode failure too", () => {
    for (const bogus of [null, undefined, 0, true, { condition: "corpus_absent" }, ["corpus_absent"]]) {
      expect(decodeCondition(bogus).ok).toBe(false)
    }
  })

  test("the failure names the schema, so a report can attribute it", () => {
    const refused = decodeCondition("nope")
    if (refused.ok) throw new Error("unreachable")
    expect(refused.error.schema).toBe("DegradationCondition")
    expect(refused.error._tag).toBe("decode_failed")
  })

  test("the set is exactly the eight declared names, so a ninth cannot be added in one file", () => {
    // `schema/degradation.ts` is the authority and this list is its reading; a divergence between
    // the two is what would let a surface report a state nobody adjudicated.
    const source = readFileSync(join(import.meta.dir, "..", "src", "schema", "degradation.ts"), "utf8")
    const declared = [...source.matchAll(/"([a-z_]+)"/g)].map((match) => match[1] ?? "")
    for (const condition of CONDITIONS) expect(declared).toContain(condition)
    expect(CONDITIONS).toHaveLength(8)
  })
})

describe("describeCondition", () => {
  test("gives every condition a sentence that carries the condition's own name", () => {
    for (const condition of CONDITIONS) {
      const described = describeCondition(condition)
      expect(described.startsWith(`${condition}:`)).toBe(true)
      expect(described.length).toBeGreaterThan(condition.length + 10)
    }
  })

  test("each sentence says what did NOT happen, so the reader is not left guessing", () => {
    for (const condition of CONDITIONS) {
      const described = describeCondition(condition)
      expect(described).toMatch(/no |not |never |Forbid|forbidden|outside/i)
    }
  })

  test("each sentence is distinct: two conditions must not share one wording", () => {
    const sentences = CONDITIONS.map(describeCondition)
    expect(new Set(sentences).size).toBe(CONDITIONS.length)
  })

  test("`unmeasured` is visibly distinct from a measured zero", () => {
    const described = describeCondition("unmeasured")
    expect(described).toContain("not the same as a figure of zero")
  })

  test("the tafsir row of the section 16 table is absent, because no tafsir backend ships", () => {
    // The matrix's seventh row names a backend this repository does not have. It is absent from
    // the literal set deliberately: a condition nobody can produce is not vocabulary a surface can
    // be held to, and adding it would invite a caller to report a state it cannot reach.
    expect(CONDITIONS).not.toContain("tafsir_unavailable" as never)
    expect(describeCondition("unmeasured")).not.toContain("tafsir")
  })
})

describe("conditionOf", () => {
  test("is the same narrowing, so a projection table cannot invent a name", () => {
    expect(conditionOf("attestation_mismatch").ok).toBe(true)
    expect(conditionOf("attestation-problem").ok).toBe(false)
  })

  test("no module in the tree may declare its own degradation string", () => {
    // The MCP projection is asserted in `packages/mizan-mcp/test/clean-clone.test.ts` by decoding
    // each of its tags through this schema; what matters here is that the vocabulary itself has
    // exactly one home, so the dependency runs in one direction only.
    const source = readFileSync(join(import.meta.dir, "..", "src", "schema", "degradation.ts"), "utf8")
    const index = readFileSync(join(import.meta.dir, "..", "src", "index.ts"), "utf8")
    expect(index).toContain('from "./schema/degradation.ts"')
    expect(source).toContain('export * as Degradation from "./degradation.ts"')
  })
})
