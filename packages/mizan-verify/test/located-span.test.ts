import { describe, expect, test } from "bun:test"
import { locatedSpanFor } from "../src/diagnostics/longest-run.ts"
import { normalizeForMatch } from "@mizan/core"

/**
 * A located span is the display-only primitive the correction surface is built on, and its two
 * properties that matter are that it is *deterministic* and that it is a *location*. The tests
 * below pin both, plus the fold boundary — the case where a run exists only because the fold
 * removed a character, and a caret placed by eye would land in the wrong place.
 */

/** The record side is passed folded, exactly as `resolveCitations` returns it. */
const folded = (text: string): string => normalizeForMatch(text)

describe("a located span points at real characters of the record", () => {
  test("the span's text is exactly the slice it claims", () => {
    const record = folded("the world draws near while knowledge diminishes")
    const span = locatedSpanFor("knowledge diminishes", record)
    expect(span.kind).toBe("located")
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(record.slice(span.startChar, span.endChar)).toBe(span.text)
  })

  test("start and end bracket the run with nothing outside them", () => {
    const record = folded("alpha bravo charlie delta echo")
    const span = locatedSpanFor("charlie delta", record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.startChar).toBe(12)
    expect(span.endChar - span.startChar).toBe(span.text.length)
  })

  test("a run at the very start of the record starts at zero", () => {
    const record = folded("يبدأ من هنا ويستمر")
    const span = locatedSpanFor("يبدأ", record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.startChar).toBe(0)
  })

  test("a run at the very end ends at the record's length", () => {
    const record = folded("this text ends here")
    const span = locatedSpanFor("ends here", record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.endChar).toBe(record.length)
  })

  test("a span carries no number a caller could divide into a strength", () => {
    // The type is `{ startChar, endChar, text }` and nothing else. There is no `percent` field to
    // compute a score from, which is how the correction surface stays on the display side of G-7.
    const record = folded("some shared text")
    const span = locatedSpanFor("shared", record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(Object.keys(span).sort()).toEqual(["endChar", "kind", "startChar", "text"])
  })
})

describe("an absent run is a state, not a zero-length span", () => {
  test("no shared character at all is absent", () => {
    // A Latin quote against an Arabic record: disjoint scripts, so the longest run is genuinely
    // zero characters rather than the single shared letter a same-script pair would produce.
    expect(locatedSpanFor("xyzzy", folded("حدثنا احمد بن صالح"))).toEqual({ kind: "absent" })
  })

  test("a single shared character is a located run, which is why the correction surface floors it", () => {
    // Pinned deliberately: the primitive measures honestly and this test documents the consequence.
    // Two unrelated Arabic strings nearly always share a letter, so `correctionFor` applies
    // `MIN_SPAN_CHARS` on top — the coincidence is real, and it is not a location.
    const shared = "ن"
    const record = folded(`حديث ${shared} طويل`)
    if (!record.includes(shared)) throw new Error("the fixture must actually contain the shared character")
    expect(locatedSpanFor(shared, record)).toEqual({ kind: "located", startChar: 5, endChar: 6, text: shared })
  })

  test("an empty quote is absent rather than a span at position zero", () => {
    // A `{ startChar: 0, endChar: 0 }` result would place a caret under the first character of a
    // record that shares nothing with the quote — a location marker pointing at a non-fact.
    expect(locatedSpanFor("", folded("any record at all"))).toEqual({ kind: "absent" })
  })

  test("a quote that folds away to nothing is absent", () => {
    // Whitespace and tashkeel are the fold's business; a quote carrying neither is empty after it.
    expect(locatedSpanFor("   ", folded("any record at all"))).toEqual({ kind: "absent" })
  })

  test("an empty record is absent", () => {
    expect(locatedSpanFor("a quote", "")).toEqual({ kind: "absent" })
  })
})

describe("the tie-break is the earliest-ending run, every time", () => {
  test("a repeated phrase resolves to its first occurrence", () => {
    const record = folded("the same words again the same words again")
    const span = locatedSpanFor("the same words", record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.text).toBe("the same words")
    expect(span.startChar).toBe(0)
  })

  test("two equally long runs resolve identically across repeated calls", () => {
    const record = folded("abc def ghi")
    const quote = "xabc xdef"
    const first = locatedSpanFor(quote, record)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(locatedSpanFor(quote, record)).toEqual(first)
    }
  })

  test("the choice does not depend on the order the inputs are supplied", () => {
    // The claim being pinned is that the span is a function of the two strings, so a caller that
    // folds first and a caller that does not cannot disagree about where the run is.
    const record = folded("alpha beta gamma")
    const fromFolded = locatedSpanFor("beta gamma", record)
    const fromRaw = locatedSpanFor("beta gamma", "alpha beta gamma")
    expect(fromRaw).toEqual(fromFolded)
  })
})

describe("the fold boundary is where an eyeballed caret would be wrong", () => {
  test("a run that exists only after tashkeel is removed is still located", () => {
    // The quote carries diacritics, the record does not, and the run is found in the folded text.
    // It corresponds to no contiguous stretch of anything a reader can see, which is why the
    // renderer labels the span canonical rather than transcribing it.
    const quoted = "يَتَقَارَبُ الزَّمَانُ"
    const record = folded("حدثنا احمد بن صالح قال يتقارب الزمان وينقص العلم")
    const span = locatedSpanFor(quoted, record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.text).toBe("يتقارب الزمان")
  })

  test("the located run is a substring of the folded record, never of the raw one", () => {
    const raw = "قَالَ رَسُولُ اللَّهِ"
    const record = folded(raw)
    const span = locatedSpanFor(raw, record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(record.slice(span.startChar, span.endChar)).toBe(span.text)
    expect(span.text).not.toContain(String.fromCharCode(0x64e))
  })

  test("letter-form folding does not move the reported position", () => {
    // `أ` and `ا` fold to one form, so the folded record is shorter than the raw text. The span is
    // reported in folded coordinates and the renderer says so, rather than reporting an index into
    // a string the reader cannot see.
    const raw = "أمر المؤمن"
    const record = folded(raw)
    const span = locatedSpanFor(raw, record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.endChar).toBeLessThanOrEqual(record.length)
    expect(record.slice(span.startChar, span.endChar)).toBe(span.text)
  })
})

describe("the input caps are the ones the module states", () => {
  test("a very long quote is truncated rather than scanned whole", () => {
    // 4,096 folded characters is `MAX_QUOTE_CHARS`. A quote longer than that is a model failure,
    // and scanning it whole is a denial-of-service primitive on a judge-facing path.
    const quote = "أ".repeat(8_000)
    const span = locatedSpanFor(quote, folded(quote))
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.text.length).toBe(4_096)
  })

  test("a very long record is truncated rather than scanned whole", () => {
    const record = "ب".repeat(70_000)
    const span = locatedSpanFor("ب", record)
    if (span.kind !== "located") throw new Error("the run is not absent, so this throw is unreachable")
    expect(span.startChar).toBe(0)
  })

  test("a run beyond the record cap is not located, and says so", () => {
    // Fail closed: content past the cap is not evidence, so it does not produce a span.
    const record = `${"ب".repeat(65_536)}جديد`
    expect(locatedSpanFor("جديد", record)).toEqual({ kind: "absent" })
  })
})
