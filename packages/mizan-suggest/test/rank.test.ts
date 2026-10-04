import { describe, expect, test } from "bun:test"
import { byCodeUnit, byNeighbourOrder, rankCandidates, type NeighbourCandidate } from "../src/index.ts"

const candidate = (overrides: Partial<NeighbourCandidate> & { readonly recordId: string }): NeighbourCandidate => ({
  textMatch: "text",
  contained: false,
  shared: 8,
  recordTypes: () => 400,
  ...overrides,
})

describe("the order, key by key", () => {
  test("puts an outright hit first, whatever else it shares", () => {
    const hit = candidate({ recordId: "z", contained: true, shared: 8, recordTypes: () => 900 })
    const near = candidate({ recordId: "a", contained: false, shared: 400, recordTypes: () => 9 })
    expect(rankCandidates([near, hit])[0]?.recordId).toBe("z")
  })

  test("puts more shared types first", () => {
    const many = candidate({ recordId: "a", shared: 12 })
    const few = candidate({ recordId: "b", shared: 8 })
    expect(rankCandidates([few, many])[0]?.recordId).toBe("a")
  })

  test("puts the shorter restatement first when they share the same content", () => {
    const short = candidate({ recordId: "a", recordTypes: () => 120 })
    const long = candidate({ recordId: "b", recordTypes: () => 900 })
    expect(rankCandidates([long, short])[0]?.recordId).toBe("a")
  })

  test("falls back to recordId, ascending, when all three keys tie", () => {
    const first = candidate({ recordId: "qur:2:255:1" })
    const second = candidate({ recordId: "qur:2:255:2" })
    expect(rankCandidates([second, first])[0]?.recordId).toBe("qur:2:255:1")
  })

  test("compares ids by code unit, not by any human collation", () => {
    // "b" is U+0062 and "ا" is U+0627, so code-unit order puts ASCII first. That is not
    // alphabetical for mixed scripts and it is exactly the point: the answer is the same on a
    // machine with different ICU data, which `localeCompare` would not be.
    expect(byCodeUnit("b", "ا")).toBe(-1)
    expect(byCodeUnit("ا", "b")).toBe(1)
    expect(byCodeUnit("a", "a")).toBe(0)
  })

  test("orders mixed-script ids the same way regardless of the row order", () => {
    const latin = candidate({ recordId: "b" })
    const arabic = candidate({ recordId: "ا" })
    const forward = rankCandidates([latin, arabic])
    expect(rankCandidates([arabic, latin]).map((row) => row.recordId)).toEqual(forward.map((row) => row.recordId))
    expect(forward[0]?.recordId).toBe("b")
  })
})

describe("the type count is asked for, not paid for", () => {
  test("a row the first two keys already decide never has its types counted", () => {
    let counted = 0
    const counting = (types: number) => (): number => {
      counted += 1
      return types
    }
    const hit = candidate({ recordId: "z", contained: true, shared: 8, recordTypes: counting(900) })
    const near = candidate({ recordId: "a", contained: false, shared: 400, recordTypes: counting(9) })
    expect(byNeighbourOrder(hit, near)).toBeLessThan(0)
    expect(byNeighbourOrder(near, hit)).toBeGreaterThan(0)
    expect(counted).toBe(0)
  })

  test("a tie on the first two keys does count them", () => {
    let counted = 0
    const counting = (types: number) => (): number => {
      counted += 1
      return types
    }
    const short = candidate({ recordId: "b", recordTypes: counting(12) })
    const long = candidate({ recordId: "a", recordTypes: counting(900) })
    expect(byNeighbourOrder(short, long)).toBeLessThan(0)
    expect(counted).toBe(2)
  })
})

describe("sorting does not touch its input", () => {
  test("returns a new array", () => {
    const rows = [candidate({ recordId: "b" }), candidate({ recordId: "a" })]
    const before = rows.map((row) => row.recordId)
    rankCandidates(rows)
    expect(rows.map((row) => row.recordId)).toEqual(before)
  })
})

describe("the order is total", () => {
  test("no two distinct candidates compare as equal when their ids differ", () => {
    const a = candidate({ recordId: "a" })
    const b = candidate({ recordId: "b" })
    expect(Math.sign(byNeighbourOrder(a, b))).toBe(-Math.sign(byNeighbourOrder(b, a)))
  })

  test("a candidate equals itself", () => {
    const a = candidate({ recordId: "a" })
    expect(byNeighbourOrder(a, a)).toBe(0)
  })
})