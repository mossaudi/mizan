import { describe, expect, test } from "bun:test"
import { normalizeForMatch } from "@mizan/core"
import {
  DEFAULT_TOP_K,
  MAX_ROWS_RANKED,
  MAX_TOP_K,
  MIN_SHARED_TRIGRAMS,
  boundTopK,
  openSearch,
  rankNeighbours,
  rankNeighboursAtFloor,
  rankNeighboursInCollection,
  type ScannedNeighbour,
} from "../src/index.ts"

const VERSE = "الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم"

const row = (overrides: Partial<ScannedNeighbour> & { readonly recordId: string }): ScannedNeighbour => ({
  collection: "test",
  textMatch: VERSE,
  contained: false,
  shared: MIN_SHARED_TRIGRAMS,
  ...overrides,
})

const many = (count: number): readonly ScannedNeighbour[] =>
  Array.from({ length: count }, (_, index) => row({ recordId: `r${index}`, textMatch: `${VERSE} ${index}` }))

describe("opening a search", () => {
  test("folds the quote once and hands the same fold back", () => {
    const search = openSearch("  Qur'an 2:255  ")
    expect(search.quoteFolded).toBe(normalizeForMatch("  Qur'an 2:255  "))
  })

  test("says a quote with no window in it cannot be measured", () => {
    expect(openSearch("ab").quoteTooShort).toBe(true)
    expect(openSearch(VERSE).quoteTooShort).toBe(false)
  })

  test("measures containment without any grading or reading of the text", () => {
    const search = openSearch(VERSE)
    expect(search.overlapOf(normalizeForMatch(`مقدمة ${VERSE} خاتمة`)).contained).toBe(true)
    expect(search.overlapOf(normalizeForMatch("سورة الفاتحة")).contained).toBe(false)
  })

  test("measures nothing against an unquotable quote rather than matching everything", () => {
    const search = openSearch("")
    expect(search.overlapOf(VERSE).shared).toBe(0)
    expect(search.overlapOf(VERSE).contained).toBe(false)
  })
})

describe("the floor", () => {
  test("keeps a row that reaches it", () => {
    expect(rankNeighbours({ quote: VERSE, rows: [row({ recordId: "a", shared: MIN_SHARED_TRIGRAMS })] })).toHaveLength(1)
  })

  test("drops a row one short of it", () => {
    expect(rankNeighbours({ quote: VERSE, rows: [row({ recordId: "a", shared: MIN_SHARED_TRIGRAMS - 1 })] })).toHaveLength(0)
  })

  test("lets an outright hit past the floor, because a hit needs no overlap to be argued about", () => {
    const hit = row({ recordId: "a", shared: 0, contained: true })
    expect(rankNeighbours({ quote: VERSE, rows: [hit] })).toHaveLength(1)
  })
})

describe("dedup by what the record actually says", () => {
  test("lists one line for 31 identical verses", () => {
    const duplicates = Array.from({ length: 31 }, (_, index) => row({ recordId: `qur:2:255:${index}` }))
    const ranked = rankNeighbours({ quote: VERSE, rows: duplicates })
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.recordId).toBe("qur:2:255:0")
  })

  test("keeps two records whose text differs, however close", () => {
    const ranked = rankNeighbours({
      quote: VERSE,
      rows: [
        row({ recordId: "a", textMatch: VERSE }),
        row({ recordId: "b", textMatch: `${VERSE} لا تأخذه سنة` }),
      ],
    })
    expect(ranked.map((entry) => entry.recordId)).toEqual(["a", "b"])
  })

  test("dedups without changing the order of what survives", () => {
    const rows = [
      row({ recordId: "b", shared: 20, textMatch: `${VERSE} زائد` }),
      row({ recordId: "a", shared: 20, textMatch: `${VERSE} زائد` }),
      row({ recordId: "c", shared: 30, textMatch: `${VERSE} جديد` }),
    ]
    expect(rankNeighbours({ quote: VERSE, rows }).map((entry) => entry.recordId)).toEqual(["c", "a"])
  })
})

describe("how many lines come back", () => {
  test("defaults to three, which is a readable block", () => {
    expect(boundTopK(undefined)).toBe(DEFAULT_TOP_K)
    expect(rankNeighbours({ quote: VERSE, rows: many(9) })).toHaveLength(DEFAULT_TOP_K)
  })

  test("never exceeds five, however large it is asked to be", () => {
    expect(boundTopK(5_000)).toBe(MAX_TOP_K)
    expect(rankNeighbours({ quote: VERSE, rows: many(20), topK: 5_000 })).toHaveLength(MAX_TOP_K)
  })

  test("is not padded with blanks when fewer records qualify", () => {
    expect(rankNeighbours({ quote: VERSE, rows: many(2) })).toHaveLength(2)
  })

  test("falls back to the default when the number is not a number", () => {
    expect(boundTopK(Number.NaN)).toBe(DEFAULT_TOP_K)
    expect(rankNeighbours({ quote: VERSE, rows: many(9), topK: Number.NaN })).toHaveLength(DEFAULT_TOP_K)
  })

  test("numbers the survivors densely from one", () => {
    expect(rankNeighbours({ quote: VERSE, rows: many(4), topK: 4 }).map((entry) => entry.rank)).toEqual([1, 2, 3, 4])
  })
})

describe("narrowing the rows before ranking", () => {
  /** Rows whose texts are distinct, so dedup cannot hide which ones survived. */
  const crowd = (count: number, sharedOf: (index: number) => number): readonly ScannedNeighbour[] =>
    Array.from({ length: count }, (_, index) =>
      row({ recordId: `r${String(index).padStart(5, "0")}`, textMatch: `${VERSE} ${index}`, shared: sharedOf(index) }),
    )

  const idsOf = (ranked: readonly { readonly recordId: string }[]): readonly string[] => ranked.map((entry) => entry.recordId)

  test("a corpus far past the cap gives the same five lines as ranking every row", () => {
    // Two thirds of the crowd share exactly the floor, so the third key decides inside that group and
    // the answer must not depend on where the cut fell.
    const rows = crowd(MAX_ROWS_RANKED * 3, (index) => (index % 3 === 0 ? 20 : MIN_SHARED_TRIGRAMS))
    const topFive = { quote: VERSE, rows, topK: MAX_TOP_K }
    const full = rankNeighboursAtFloor({ ...topFive, floor: MIN_SHARED_TRIGRAMS })
    expect(idsOf(rankNeighbours(topFive))).toEqual(idsOf(full))
  })

  test("a row that would win only on the third key is still reachable from its own tie group", () => {
    // The winner is inside the straddling group and has the fewest 3-gram types of the group, so it
    // can only be found if the whole group is kept rather than a prefix of it.
    const rows = crowd(MAX_ROWS_RANKED + 10, () => MIN_SHARED_TRIGRAMS)
    const ranked = rankNeighbours({ quote: VERSE, rows, topK: MAX_TOP_K })
    expect(ranked).toHaveLength(MAX_TOP_K)
    // `VERSE 0` is shorter than `VERSE 1`, so the type-count tie-break picks the lowest index.
    expect(idsOf(ranked)[0]).toBe("r00000")
  })

  test("rows below the floor are not carried into the cap", () => {
    const rows = crowd(MAX_ROWS_RANKED * 2, (index) => (index === MAX_ROWS_RANKED * 2 - 1 ? 1 : MIN_SHARED_TRIGRAMS))
    const ranked = rankNeighbours({ quote: VERSE, rows, topK: MAX_TOP_K })
    expect(idsOf(ranked)).not.toContain(`r${String(MAX_ROWS_RANKED * 2 - 1).padStart(5, "0")}`)
  })

  test("the cap never costs the reader a line: a small crowd is ranked whole", () => {
    const rows = crowd(9, (index) => MIN_SHARED_TRIGRAMS + index)
    expect(rankNeighbours({ quote: VERSE, rows, topK: MAX_TOP_K })).toHaveLength(MAX_TOP_K)
  })
})

describe("nothing to rank", () => {
  test("an empty quote returns nothing rather than everything", () => {
    expect(rankNeighbours({ quote: "   ", rows: many(5) })).toEqual([])
  })

  test("no rows returns nothing", () => {
    expect(rankNeighbours({ quote: VERSE, rows: [] })).toEqual([])
  })
})

describe("scoping the search to one collection", () => {
  /** Three collections' worth of rows, one of them closer than the others. */
  const rows: readonly ScannedNeighbour[] = [
    row({ recordId: "abudawud:1", collection: "abudawud", shared: 40, textMatch: `${VERSE} قريب جدا` }),
    row({ recordId: "bukhari:1", collection: "bukhari", shared: 20 }),
    row({ recordId: "malik:1", collection: "malik", shared: 30, textMatch: `${VERSE} متوسط` }),
  ]

  test("only the named collection is ranked", () => {
    const ranked = rankNeighboursInCollection({ quote: VERSE, rows, collection: "bukhari" })
    expect(ranked.map((entry) => entry.recordId)).toEqual(["bukhari:1"])
  })

  test("a closer record in another collection cannot outrank the cited one", () => {
    // Without the scope, `abudawud:1` wins on shared types. The point of the scope is that lineage
    // beats proximity: a citation into Bukhari is not answered with a record from another book.
    expect(rankNeighbours({ quote: VERSE, rows }).map((entry) => entry.recordId)[0]).toBe("abudawud:1")
    expect(rankNeighboursInCollection({ quote: VERSE, rows, collection: "bukhari" })[0]?.recordId).toBe("bukhari:1")
  })

  test("a collection with nothing at all returns nothing, so the caller can say no_candidates", () => {
    expect(rankNeighboursInCollection({ quote: VERSE, rows, collection: "tirmidhi" })).toEqual([])
  })

  test("scoping is applied before the cap, not after it", () => {
    // The same list as an unscoped rank restricted to one collection, which is what makes "within
    // this collection" mean the collection's own best rather than whatever survived a global cut.
    const many = Array.from({ length: MAX_ROWS_RANKED * 2 }, (_, index) =>
      row({ recordId: `r${index}`, collection: index % 2 === 0 ? "in" : "out", shared: index, textMatch: `${VERSE} ${index}` }),
    )
    const scoped = rankNeighboursInCollection({ quote: VERSE, rows: many, collection: "in", topK: MAX_TOP_K })
    expect(scoped).toHaveLength(MAX_TOP_K)
    expect(scoped.every((entry) => entry.recordId.startsWith("r") && Number(entry.recordId.slice(1)) % 2 === 0)).toBe(true)
  })

  test("an empty quote scopes to nothing rather than to everything", () => {
    expect(rankNeighboursInCollection({ quote: "  ", rows, collection: "bukhari" })).toEqual([])
  })

  test("the floor is the product's, not the caller's, so a scope cannot be used to loosen it", () => {
    const weak = [row({ recordId: "bukhari:weak", collection: "bukhari", shared: MIN_SHARED_TRIGRAMS - 1 })]
    expect(rankNeighboursInCollection({ quote: VERSE, rows: weak, collection: "bukhari" })).toEqual([])
  })
})

describe("the floor is a product decision, not a per-call dial", () => {
  test("the harness can measure 4, 8 and 12 without moving the product's floor", () => {
    const rows = [row({ recordId: "a", shared: 10 })]
    expect(rankNeighboursAtFloor({ quote: VERSE, rows, floor: 4 })).toHaveLength(1)
    expect(rankNeighboursAtFloor({ quote: VERSE, rows, floor: 12 })).toHaveLength(0)
    expect(MIN_SHARED_TRIGRAMS).toBe(8)
  })
})