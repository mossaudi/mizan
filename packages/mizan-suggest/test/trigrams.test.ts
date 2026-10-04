import { describe, expect, test } from "bun:test"
import { normalizeForMatch } from "@mizan/core"
import {
  MAX_QUOTE_CHARS,
  MAX_RECORD_CHARS,
  SUBSTRING_SEARCH_MAX_QUOTE_GRAMS,
  boundRecordText,
  foldQuote,
  sharedTrigramTypes,
  trigramTypes,
  trigramsOf,
} from "../src/index.ts"

/**
 * Parity with the verifier's fold is asserted in `apps/cli/test/suggestions.test.ts`, where
 * `@mizan/verify` is already a dependency: this package's import closure stays `@mizan/core` only,
 * in tests as well as in production, so gate G-7.8 has nothing to exempt.
 */
describe("the fold this package compares in", () => {
  test("is the canonical form the corpus stores in textMatch", () => {
    expect(foldQuote("Q 2:255")).toBe(normalizeForMatch("Q 2:255"))
  })

  test("is idempotent, so folding twice is folding once", () => {
    const once = foldQuote("  بِسْمِ ٱللَّهِ  ")
    expect(foldQuote(once)).toBe(once)
  })
})

describe("the quote cap", () => {
  test("bounds a pathological quote so nothing downstream grows with it", () => {
    const long = "أ".repeat(MAX_QUOTE_CHARS + 5_000)
    expect(foldQuote(long).length).toBe(MAX_QUOTE_CHARS)
  })

  test("leaves an ordinary quote alone", () => {
    const short = "الرحمن الرحيم"
    expect(foldQuote(short)).toBe(short)
  })
})

describe("the record cap", () => {
  test("bounds record text", () => {
    expect(boundRecordText("ب".repeat(MAX_RECORD_CHARS + 10)).length).toBe(MAX_RECORD_CHARS)
  })

  test("leaves an ordinary record alone", () => {
    const text = "بسم الله الرحمن الرحيم"
    expect(boundRecordText(text)).toBe(text)
  })
})

describe("3-grams of folded text", () => {
  test("of text shorter than the window is empty, not itself", () => {
    expect([...trigramsOf("ab")]).toEqual([])
  })

  test("are every window, in order", () => {
    expect([...trigramsOf("abcd")]).toEqual(["abc", "bcd"])
  })

  test("are deduplicated by type, so a repeated phrase counts once", () => {
    expect(trigramTypes("abcabcabc")).toBe(3)
  })

  test("count types, not occurrences", () => {
    expect(trigramTypes("abcd")).toBe(2)
  })
})

describe("shared types between a record and a quote", () => {
  const quote = trigramsOf("الله لا إله إلا هو")

  test("is zero when the windows do not overlap", () => {
    expect(sharedTrigramTypes("سورة الفاتحة", quote)).toBe(0)
  })

  test("counts each shared type once, however often it repeats", () => {
    const repeated = "الله لا إله إلا هو الله لا إله إلا هو"
    const once = "الله لا إله إلا هو"
    expect(sharedTrigramTypes(repeated, quote)).toBe(sharedTrigramTypes(once, quote))
  })

  test("is symmetric in what it counts, so an edited quote still shares with its record", () => {
    const edited = "الله لا اله الا هو"
    expect(sharedTrigramTypes(foldQuote(edited), trigramsOf("الله لا إله إلا هو"))).toBeGreaterThan(4)
  })
})

describe("the two evaluation orders of the same count", () => {
  /** A quote wide enough to cross {@link SUBSTRING_SEARCH_MAX_QUOTE_GRAMS} into the window order. */
  const wideQuote = (gramCount: number): string =>
    Array.from({ length: gramCount + 2 }, (_, index) => String.fromCharCode(0xe000 + index)).join("")

  /** The window order, written out here so the test does not compare the module against itself. */
  const byWindow = (record: string, quoteTrigrams: ReadonlySet<string>): number => {
    const shared = new Set<string>()
    for (let index = 0; index + 3 <= record.length; index += 1) {
      const gram = record.slice(index, index + 3)
      if (quoteTrigrams.has(gram)) shared.add(gram)
    }
    return shared.size
  }

  test("a quote below the line counts the same as a window would", () => {
    const text = "الله لا إله إلا هو الحي القيوم"
    const grams = trigramsOf(text)
    expect(grams.size).toBeLessThan(SUBSTRING_SEARCH_MAX_QUOTE_GRAMS)
    expect(sharedTrigramTypes(text, grams)).toBe(byWindow(text, grams))
  })

  test("a quote above the line counts the same as a window would", () => {
    const text = wideQuote(SUBSTRING_SEARCH_MAX_QUOTE_GRAMS + 40)
    const grams = trigramsOf(text)
    expect(grams.size).toBeGreaterThan(SUBSTRING_SEARCH_MAX_QUOTE_GRAMS)
    const record = `${text.slice(0, 400)}نص لا صلة له${text.slice(300, 900)}`
    expect(sharedTrigramTypes(record, grams)).toBe(byWindow(record, grams))
  })

  test("the line itself takes the fast order and still agrees", () => {
    const text = wideQuote(SUBSTRING_SEARCH_MAX_QUOTE_GRAMS)
    const grams = trigramsOf(text)
    expect(grams.size).toBe(SUBSTRING_SEARCH_MAX_QUOTE_GRAMS)
    const record = `${text.slice(0, 500)}rhs${text.slice(200)}`
    expect(sharedTrigramTypes(record, grams)).toBe(byWindow(record, grams))
  })
})