import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DegradationCondition, conditionOf, decodeCondition, describedConditions, describeCondition } from "@mizan/core"

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

/**
 * One name per row of the AGENTS.md section 16 table, plus the states a surface reports instead of
 * entering the pipeline.
 *
 * `corpus_unusable` and `attestation_unreadable` are not in that table: they are the two states the
 * shipped surfaces hit before a run exists — a corpus file that is present and cannot be opened, and
 * an attestation that is present and cannot be read. They were added deliberately rather than being
 * projected onto `corpus_absent` / `attestation_mismatch`, which would have told a client the corpus
 * was missing when it was on disk and corrupt; see the header of `src/schema/degradation.ts`.
 */
const CONDITIONS = [
  "corpus_absent",
  "corpus_unusable",
  "attestation_unreadable",
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

  test("the set is exactly the ten declared names, so an eleventh cannot be added in one file", () => {
    // `schema/degradation.ts` is the authority and this list is its reading; a divergence between
    // the two is what would let a surface report a state nobody adjudicated.
    const source = readFileSync(join(import.meta.dir, "..", "src", "schema", "degradation.ts"), "utf8")
    const declared = [...source.matchAll(/"([a-z_]+)"/g)].map((match) => match[1] ?? "")
    for (const condition of CONDITIONS) expect(declared).toContain(condition)
    expect(CONDITIONS).toHaveLength(10)
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

  test("the wording table and the vocabulary agree in BOTH directions", () => {
    // One direction is not enough, and the direction that is usually written is the useless one.
    // `for (const condition of CONDITIONS) describeCondition(condition)` passes even when the
    // schema has grown a literal nobody wrote a sentence for — which is precisely the hole the
    // nine-branch `if` chain left open, where a tenth condition rendered as `unmeasured`.
    //
    // So the comparison runs the other way too: every key in the wording table must still be a
    // condition the schema admits. A name deleted from `DegradationCondition` with its sentence left
    // behind fails here instead of being reported by a surface that no longer has a condition to
    // report.
    expect(describedConditions()).toEqual([...CONDITIONS].toSorted())
  })

  test("no condition's sentence opens with another condition's name, so a mistyped key cannot read as coverage", () => {
    // The sharper form of the distinctness assertion above: distinct sentences are not enough if a
    // sentence was copied under the wrong key, because the prefix is what a client branches on and
    // it is the only part of the line that is machine-read. A copy-paste that left `unmeasured:` at
    // the head of a fault sentence would satisfy "distinct" and mislabel every fault.
    for (const condition of describedConditions()) {
      const described = describeCondition(condition)
      for (const other of describedConditions()) {
        if (other === condition) continue
        expect(described.startsWith(`${other}:`)).toBe(false)
      }
    }
  })

  test("the two pre-run corpus states are distinct from the absences they resemble", () => {
    // The reason they are in the set rather than projected. A present-but-broken corpus and a corpus
    // that is not there send an operator to different places, and a present-but-unreadable
    // attestation is not a disagreement with the corpus.
    expect(describeCondition("corpus_unusable")).toContain("not the same as an absent corpus")
    expect(describeCondition("corpus_absent")).not.toContain("corrupt")
    expect(describeCondition("attestation_unreadable")).not.toBe(describeCondition("attestation_mismatch"))
    expect(describeCondition("attestation_mismatch")).toContain("is not the corpus attestation.json authorises")
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
