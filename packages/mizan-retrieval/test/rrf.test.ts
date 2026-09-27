import { describe, expect, test } from "bun:test"
import { isErr, isOk } from "@mizan/core"
import { RRF_K, fuse } from "../src/rrf.ts"
import {
  MAX_QUERY_CHARS,
  broadExpression,
  phraseExpression,
  prefixExpression,
  prepareQuery,
} from "../src/query.ts"

const ids = (hits: ReturnType<typeof fuse>): readonly string[] => hits.map((hit) => hit.id)
const scoreOf = (hits: ReturnType<typeof fuse>, id: string): number =>
  hits.find((hit) => hit.id === id)?.score ?? 0

describe("fuse", () => {
  test("an empty input is an empty result, not an error", () => {
    expect(fuse([])).toEqual([])
  })

  test("a document only one list returned still appears, with a LOWER score", () => {
    // RRF does not discard single-list documents; it down-weights them. Asserting otherwise
    // would encode a false requirement, and a document nobody ranked highly is not the same
    // as a document that does not exist.
    const fused = fuse([{ name: "a", ids: ["both", "lonely"] }, { name: "b", ids: ["both"] }])
    expect(ids(fused)).toEqual(["both", "lonely"])
    expect(scoreOf(fused, "lonely")).toBeLessThan(scoreOf(fused, "both"))
  })

  test("a document both rankers like beats one only a single ranker likes", () => {
    const fused = fuse([
      { name: "broad", ids: ["both", "only_broad"] },
      { name: "phrase", ids: ["both"] },
    ])
    expect(ids(fused)[0]).toBe("both")
  })

  test("rank 1 in two lists outranks rank 1 in one", () => {
    const fused = fuse([{ name: "broad", ids: ["second", "first"] }, { name: "phrase", ids: ["first"] }])
    expect(ids(fused)[0]).toBe("first")
  })

  test("the formula is 1/(K+rank) summed over the rankers that returned the document", () => {
    const fused = fuse([{ name: "broad", ids: ["x"] }, { name: "phrase", ids: ["x", "y"] }])
    const expected = 1 / (RRF_K + 1) + 1 / (RRF_K + 1)
    expect(scoreOf(fused, "x")).toBeCloseTo(expected, 9)
  })

  test("it is general over N lists, and a third list can change the ordering", () => {
    const two = fuse([
      { name: "a", ids: ["x", "y"] },
      { name: "b", ids: ["x", "y"] },
    ])
    expect(ids(two)).toEqual(["x", "y"])
    // A third list that only saw `y` is enough to flip it: two rank-1s plus one rank-1 beats
    // two rank-1s alone, because `y` was never penalised in the third list.
    const three = fuse([
      { name: "a", ids: ["x", "y"] },
      { name: "b", ids: ["x", "y"] },
      { name: "c", ids: ["y"] },
    ])
    expect(ids(three)).toEqual(["y", "x"])
  })

  test("a genuine tie breaks on ascending id, so the ordering is total and reproducible", () => {
    // `x` is rank 1 in one list and rank 2 in the other, and `y` is the mirror image, so the
    // scores are exactly equal. Reversing ONE list is not a tie: it changes the ranks.
    const forward = fuse([{ name: "a", ids: ["x", "y"] }, { name: "b", ids: ["y", "x"] }])
    const reversed = fuse([{ name: "a", ids: ["y", "x"] }, { name: "b", ids: ["x", "y"] }])
    expect(scoreOf(forward, "x")).toBe(scoreOf(forward, "y"))
    expect(ids(forward)).toEqual(["x", "y"])
    expect(ids(reversed)).toEqual(["x", "y"])
  })

  test("a repeated id in one list gets one rank, not two", () => {
    const fused = fuse([{ name: "a", ids: ["x", "x"] }])
    expect(fused).toHaveLength(1)
    expect(fused[0]?.ranks).toEqual({ a: 1 })
  })

  test("the ranks map records where each ranker placed the hit", () => {
    const fused = fuse([{ name: "broad", ids: ["x"] }, { name: "phrase", ids: ["y", "x"] }])
    expect(fused.find((hit) => hit.id === "x")?.ranks).toEqual({ broad: 1, phrase: 2 })
  })

  test("it is pure: the same input gives byte-identical output", () => {
    const lists = [
      { name: "a", ids: ["p", "q", "r"] },
      { name: "b", ids: ["r", "p"] },
    ]
    expect(JSON.stringify(fuse(lists))).toBe(JSON.stringify(fuse(lists)))
  })
})

describe("prepareQuery", () => {
  test("a blank query is rejected, never treated as match-everything", () => {
    expect(isErr(prepareQuery(""))).toBe(true)
    expect(isErr(prepareQuery("   "))).toBe(true)
  })

  test("a query with no word characters is rejected rather than silently matching", () => {
    const result = prepareQuery("!!! ???")
    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error._tag).toBe("empty_query")
  })

  test("an over-long query is rejected at the cap", () => {
    const result = prepareQuery("a".repeat(MAX_QUERY_CHARS + 1))
    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error._tag).toBe("query_too_long")
  })

  test("it folds the query, so a folded query finds a folded record", () => {
    const result = prepareQuery("الصَّلَاةُ")
    if (!isOk(result)) throw new Error("expected tokens")
    expect(result.value).toEqual(["الصلاه"])
  })

  test("a hyphenated question is two words, not one rejected token", () => {
    const result = prepareQuery("الصلاة-الجيدة")
    if (!isOk(result)) throw new Error("expected tokens")
    expect(result.value).toEqual(["الصلاه", "الجيده"])
  })
})

describe("the FTS5 query language is not reachable from user text", () => {
  /**
   * FTS5's MATCH argument has OR, AND, NOT, NEAR(...), prefix `*`, column `^` and quoting.
   * These tests exist because a query that reaches the parser as an EXPRESSION rather than as
   * LITERAL text would let a caller express proximity — a similarity judgement — in the index.
   */
  test("every FTS5 sigil is stripped from the tokens", () => {
    const result = prepareQuery('الصلاة" OR * ^ ( ) - NEAR :')
    if (!isOk(result)) throw new Error("expected tokens")
    for (const token of result.value) expect(token).toMatch(/^[\p{L}\p{N}]+$/u)
  })

  test("the operator words survive the allow-list as WORDS, so quoting is what neutralises them", () => {
    const result = prepareQuery("الصلاة OR NEAR")
    if (!isOk(result)) throw new Error("expected tokens")
    expect(result.value).toContain("OR")
    expect(result.value).toContain("NEAR")
    expect(broadExpression(result.value)).toBe('"الصلاه" OR "OR" OR "NEAR"')
  })

  test("a query that is only an operator is a literal, not a boolean", () => {
    const result = prepareQuery("OR")
    if (!isOk(result)) throw new Error("expected tokens")
    expect(broadExpression(result.value)).toBe('"OR"')
  })

  test("a phrase expression is one quoted string, so word order is significant", () => {
    const result = prepareQuery("الصلاة凭借")
    if (!isOk(result)) throw new Error("expected tokens")
    expect(phraseExpression(result.value)).toBe('"الصلاه凭借"')
  })

  test("a prefix expression prefixes ONLY the last token", () => {
    const result = prepareQuery("الصلاة الجيدة")
    if (!isOk(result)) throw new Error("expected tokens")
    expect(prefixExpression(result.value)).toBe('"الصلاه" "الجيده"*')
  })

  test("an embedded quote can never be quoted, so the expression cannot be broken out of", () => {
    expect(() => prefixExpression(['a"b'])).toThrow()
  })

  test("in the OR pass every token is a quoted literal, so no operator can survive", () => {
    const result = prepareQuery('x" OR y* ^z')
    if (!isOk(result)) throw new Error("expected tokens")
    const expression = broadExpression(result.value)
    expect(expression).toBe('"x" OR "OR" OR "y" OR "z"')
    for (const token of result.value) expect(expression).toContain(`"${token}"`)
  })
})
