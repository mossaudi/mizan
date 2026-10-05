import { describe, expect, test } from "bun:test"
import { coverageOf, countFor, interleaveByCollection, underFloor, FABRICATION_COVERAGE_FLOOR } from "./selection.ts"

/**
 * ADR-15's selection rule, proved with a literal pool.
 *
 * ## Why there is no corpus in this file
 *
 * The whole reason `selection.ts` is a separate module from `build.ts` is that this test can run
 * without the 83 MB database and without an ingest. If the rule were inside the builder, proving it
 * would mean building the corpus first, and the CWE-345 claim — the one this repository exists on —
 * would only be checkable by somebody who already had everything set up.
 *
 * So every fixture below is an array of `{ collection, id }`. The property being asserted is
 * structural, and it does not become less true because the spans are strings.
 */

/** The six collections `attestation.json` serves, in the order `collectionsOf` returns them. */
const COLLECTIONS = ["abudawud", "ibnmajah", "malik", "nasai", "quran", "tirmidhi"] as const

/** Five anchors from each collection — the shape `mainAnchors(db)` produces today. */
const poolOf = (perCollection: number, collections: readonly string[] = COLLECTIONS) =>
  collections.flatMap((collection) =>
    Array.from({ length: perCollection }, (_unused, index) => ({ collection, id: `${collection}-${index + 1}` })),
  )

const ids = (entries: readonly { readonly id: string }[]): readonly string[] => entries.map((entry) => entry.id)

describe("interleaveByCollection", () => {
  test("every collection appears before any collection appears twice", () => {
    const drawn = interleaveByCollection(poolOf(5), 6)
    expect(ids(drawn)).toEqual(["abudawud-1", "ibnmajah-1", "malik-1", "nasai-1", "quran-1", "tirmidhi-1"])
  })

  test("the defect it replaces: slicing a grouped pool is slicing one collection", () => {
    // This is the planted violation. `mainAnchors(db).slice(0, 8)` over five anchors per collection
    // yields eight cases from two collections and never touches nasai, quran or tirmidhi — and every
    // other check on the resulting set passes.
    const sliced = poolOf(5).slice(0, 8)
    const served = countFor(coverageOf(sliced), "nasai")
    expect(served).toBe(0)
    expect(new Set(sliced.map((entry) => entry.collection)).size).toBe(2)
  })

  test("the same slice through the interleaver covers all six at the floor", () => {
    const drawn = interleaveByCollection(poolOf(5), 16)
    const counts = coverageOf(drawn)
    expect([...counts.keys()].sort()).toEqual([...COLLECTIONS].sort())
    // 16 over 6 is 2 remainder 4: four collections get three and two get two. The floor is 2, and the
    // guarantee is `>= floor`, not `== floor` — a set that needs more cases gets more.
    expect(Math.min(...COLLECTIONS.map((collection) => countFor(counts, collection)))).toBe(FABRICATION_COVERAGE_FLOOR)
  })

  test("is deterministic: same pool, same order, every time", () => {
    const first = interleaveByCollection(poolOf(5), 17)
    const second = interleaveByCollection(poolOf(5), 17)
    expect(ids(first)).toEqual(ids(second))
  })

  test("preserves pool order within a collection", () => {
    // Twelve is two full rounds over six collections, so each collection yields two anchors and the
    // within-collection order is observable. Six would be one round and would prove nothing about it.
    const drawn = interleaveByCollection(poolOf(3), 12)
    expect(ids(drawn.filter((entry) => entry.collection === "nasai"))).toEqual(["nasai-1", "nasai-2"])
  })

  test("buckets follow the pool's own order, not a sort", () => {
    // A sort would be a second source of truth about which collection comes first; the pool's order
    // is the corpus's order, and a caller that wants a different one sorts the pool itself.
    const reversed = [...COLLECTIONS].reverse()
    const drawn = interleaveByCollection(poolOf(1, reversed), 3)
    expect(ids(drawn)).toEqual(["tirmidhi-1", "quran-1", "nasai-1"])
  })

  test("an offset skips whole rounds, so two classes can take disjoint spans", () => {
    // `letter_transposed` takes 0..8 and `word_inserted` takes 8..16. Both classes need cases from
    // every collection, and with five anchors per collection an offset below 8 would overlap.
    const first = interleaveByCollection(poolOf(5), 8, 0)
    const second = interleaveByCollection(poolOf(5), 8, 8)
    expect(first.map((entry) => entry.id).filter((id) => second.some((entry) => entry.id === id))).toEqual([])
  })

  test("a pool thinner than the request returns what exists and does not repeat", () => {
    // Padding with a re-used anchor would raise the count to satisfy a quota while lowering the
    // evidence, which is the `silent mock` row of AGENTS.md section 16.
    const drawn = interleaveByCollection(poolOf(1, ["abudawud", "malik"]), 8)
    expect(ids(drawn)).toEqual(["abudawud-1", "malik-1"])
    expect(new Set(ids(drawn)).size).toBe(drawn.length)
  })

  test("a collection exhausted early does not consume a round from the others", () => {
    const pool = [{ collection: "abudawud", id: "abudawud-only" }, ...poolOf(2, ["malik"])]
    expect(ids(interleaveByCollection(pool, 5))).toEqual(["abudawud-only", "malik-1", "malik-2"])
  })

  test("a zero, negative or empty request draws nothing rather than throwing", () => {
    expect(interleaveByCollection(poolOf(5), 0)).toEqual([])
    expect(interleaveByCollection(poolOf(5), -3)).toEqual([])
    expect(interleaveByCollection([], 5)).toEqual([])
  })

  test("an offset past the end draws nothing", () => {
    expect(interleaveByCollection(poolOf(2), 4, 99)).toEqual([])
  })
})

describe("coverageOf", () => {
  test("counts per collection and reads zero for an absent one", () => {
    const counts = coverageOf(poolOf(5))
    expect(countFor(counts, "quran")).toBe(5)
    expect(countFor(counts, "sahih")).toBe(0)
  })

  test("an absent collection is zero, never undefined, so callers need no guard", () => {
    // `undefined` here would make `count < floor` false and quietly satisfy the rule for a
    // collection nobody tested, which is the defect in its purest form.
    expect(countFor(new Map(), "nasai") < FABRICATION_COVERAGE_FLOOR).toBe(true)
  })
})

describe("underFloor", () => {
  test("names the collections that are short, sorted, and no others", () => {
    // Twelve is two rounds, so every served collection reaches the floor and nothing is reported.
    const counts = coverageOf(interleaveByCollection(poolOf(5), 12))
    expect(underFloor(counts, COLLECTIONS)).toEqual([])
  })

  test("reports exactly the collections the committed set was missing", () => {
    // The planted defect: five abudawud anchors then three ibnmajah, which is what
    // `mainAnchors(db).slice(0, 8)` produced. Four of the six served collections were short.
    const counts = coverageOf(poolOf(5).slice(0, 8))
    expect(underFloor(counts, COLLECTIONS)).toEqual(["malik", "nasai", "quran", "tirmidhi"])
  })

  test("is sorted, so the message is the same on every machine", () => {
    expect(underFloor(new Map(), [...COLLECTIONS].reverse())).toEqual([...COLLECTIONS].sort())
  })

  test("the floor is read from the gate, not restated here", () => {
    // `underFloor` and `checkCollectionCoverage` must agree by construction. If this number were
    // copied into `selection.ts`, a generator could size a set the gate would then reject — and the
    // failure would appear in CI as a docs finding about a corpus nobody had touched.
    expect(FABRICATION_COVERAGE_FLOOR).toBe(2)
  })
})