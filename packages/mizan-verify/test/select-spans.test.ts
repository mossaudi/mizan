import { describe, expect, test } from "bun:test"
import { MAX_QUOTE_CHARS } from "@mizan/core"
import { ARTICLE_RED_TEAM_FIXTURES, type HallmarkType } from "../src/red-team.ts"
import { selectSpans, type SelectionResult } from "../src/select-spans.ts"

/**
 * Span selection, and the two fixtures that are the reason this module is checked at all.
 *
 * `R-1` is the integrity risk this exists for: a component that SELECTS which spans get checked can
 * hide a fabrication by not emitting it. So the tests below are not "does selection find quotes" — they
 * are "does every segment the selector skipped come back as a NAMED gap", planted with a document whose
 * fabrication is deliberately invisible to the selector.
 */

/**
 * How many distinct segments a result accounted for, emitted or gapped.
 *
 * Declared here rather than in the module because it is a TEST invariant rather than product behaviour:
 * the module's own guarantee is structural — the loop emits exactly one of the two per segment — and
 * this asserts it from outside, where a future edit cannot change both halves together.
 */
const accounted = (result: SelectionResult): number =>
  new Set([...result.spans.map((span) => span.segmentIndex), ...result.gaps.map((gap) => gap.segmentIndex)]).size

describe("a quoted span is selected", () => {
  test("a delimited quotation is emitted with its segment index and verbatim text", () => {
    const result = selectSpans(['The Prophet said, "faith is the belief of the heart".'], 0)
    expect(result.spans).toHaveLength(1)
    expect(result.spans[0]).toEqual({ segmentIndex: 0, quote: "faith is the belief of the heart" })
  })

  test("an Arabic quotation pair is emitted the same way", () => {
    const arabic = "قال النبي «الصلاة عماد الدين» ثم سكت."
    const result = selectSpans([arabic], 0)
    expect(result.spans[0]?.quote).toBe("الصلاة عماد الدين")
  })

  test("a speech verb with no quotation marks still yields a span", () => {
    const result = selectSpans(["Narrated by Ibn Umar who said, the prayer is the pillar of the religion."], 0)
    expect(result.spans.length).toBeGreaterThanOrEqual(1)
    expect(result.gaps).toEqual([])
  })

  test("an Arabic speech introducer is recognised", () => {
    const result = selectSpans(["حدثنا عن النبي قال الصدقة تنطفئ بالربع."], 0)
    expect(result.spans.length).toBeGreaterThanOrEqual(1)
  })

  test("the same span appearing twice in one segment is emitted once", () => {
    const result = selectSpans(['She said, "repeat me" and later said, "repeat me" again.'], 0)
    expect(result.spans.map((span) => span.quote)).toEqual(["repeat me"])
  })

  test("a delimited quotation wins over the speech rule, so the same words are not checked twice", () => {
    // Both shapes are present, and the speech shape is a superset. Emitting both would double the
    // verification work for a LESS precise span.
    const result = selectSpans(['He said, "the prayer is the pillar" and then he paused.'], 0)
    expect(result.spans.map((span) => span.quote)).toEqual(["the prayer is the pillar"])
  })

  test("an unclosed quotation mark yields no span rather than a span that runs to end of segment", () => {
    const result = selectSpans(['He began, "and then the record goes on'], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps[0]?.reason).toBe("no_quotation_like_span")
  })
})

/**
 * The planted apostrophe cases, because a false positive here lands on the fail-open side.
 *
 * An emitted span is a segment the report stops listing as `not_extracted`. So a segment containing no
 * quotation at all — a contraction, a possessive — that the selector misreads as a quotation leaves the
 * gap list entirely, and the published `extracted` count over a document that contained nothing
 * quotable goes up by one. Both sentences below are the ones that produced a span before the
 * apostrophe was removed from `QUOTE_PAIRS`; they are pinned verbatim rather than rephrased, because a
 * regression test written from the fixed behaviour proves nothing about the defect.
 */
describe("an apostrophe is a contraction, not a quotation mark", () => {
  test("a possessive inside a sentence yields no span and a NAMED gap", () => {
    const result = selectSpans(["It's the Prophet's word that we return."], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps).toEqual([{ segmentIndex: 0, reason: "no_quotation_like_span" }])
  })

  test("two possessives in one sentence still produce nothing, rather than a span cut across words", () => {
    const result = selectSpans(["The traveller's staff and the guide's map were left."], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps).toEqual([{ segmentIndex: 0, reason: "no_quotation_like_span" }])
  })

  test("a contraction does not count towards `extracted`, because it is not an extraction", () => {
    // The published selection-recall figure is `segments - extracted`, so this is the assertion that
    // keeps the denominator honest rather than the assertion that the parser is tidy.
    const contraction = selectSpans(["The reader's question stands unasked."], 0)
    const realQuote = selectSpans(['He said, "the prayer is the pillar".'], 0)
    expect(contraction.spans.length).toBe(0)
    expect(realQuote.spans.length).toBeGreaterThan(contraction.spans.length)
  })

  test("a real quotation inside a sentence that also holds contractions is still found", () => {
    // The asymmetry has to cost the rare case, not the common one: `don't` must not blind the selector
    // to the double-quoted passage beside it.
    const result = selectSpans(['He said, "don\'t call it charity" when they left.'], 0)
    expect(result.spans.map((span) => span.quote)).toEqual(["don't call it charity"])
  })
})

/**
 * The speech rule emits the words the SPEAKER said, not the words the AUTHOR wrote.
 *
 * ## Why this is an integrity rule and not tidying
 *
 * Because a span carrying its own introducer is structurally unverifiable while still counting as
 * extracted. `He said, the believing servant is like a mountain` cannot be contained in any record —
 * `He said,` appears in no record — so the emitted span could never clear evidence, and it did so in
 * the NUMERATOR of the published selection-recall figure. It also made `sharedRunChars` credit the
 * corpus with attribution words the corpus never contained.
 *
 * The selection would still have been reported as a gap had it been dropped; it was not dropped, it
 * was counted. That is the direction R-1 is graded on, so it is the direction that had to change.
 */
describe("the attribution is not part of the quote", () => {
  test("an English introducer and its separating comma are trimmed from the span", () => {
    // The sentence terminator is excluded too, exactly as the delimited rule excludes the closing
    // quotation mark's surroundings: a span is the words, not the punctuation the author typed around
    // them, and both rules agreeing is what keeps one document's two shapes comparable.
    const result = selectSpans(["He said, the believing servant is like a mountain of faith indeed."], 0)
    expect(result.spans.map((span) => span.quote)).toEqual(["the believing servant is like a mountain of faith indeed"])
  })

  test("a speaker name before the verb is trimmed along with the verb", () => {
    const result = selectSpans(["Ibn Umar reported, the prayer is the pillar of the religion."], 0)
    expect(result.spans[0]?.quote).toBe("the prayer is the pillar of the religion")
  })

  test("an Arabic introducer is trimmed, in the same direction as the English one", () => {
    const result = selectSpans(["قال المؤمن أخي مثل الجبل"], 0)
    expect(result.spans.map((span) => span.quote)).toEqual(["المؤمن أخي مثل الجبل"])
  })

  test("قالوا is trimmed whole, so the span does not begin وا", () => {
    // `قالوا` contains `قال` at the same index, followed by the letter `و` — so the boundary rule rejects
    // the shorter verb outright and only `قالوا` is ever a candidate. Trimming `قال` instead would emit
    // `وا المؤمنون`, an attribution fragment with "they said" still in it, which is the defect removed here.
    const result = selectSpans(["قالوا المؤمنون kamar"], 0)
    expect(result.spans.map((span) => span.quote)).toEqual(["المؤمنون kamar"])
  })

  test("a segment that is ONLY an introducer is a named gap, not an empty span", () => {
    const result = selectSpans(["He said,"], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps[0]?.reason).toBe("no_quotation_like_span")
  })

  test("an internal comma does NOT end a span, because a cut that discards the rest is a silent gap", () => {
    // The regression this pins: `SPAN_END` once carried `,` and `،`, so this sentence produced the span
    // `the believing servant is like a mountain` and DROPPED the 58 characters after the comma — with no
    // `SelectionGap`, so the segment read as fully examined. R-1 arriving through a precision change
    // rather than a selector omission. A comma is a separator before the quote and nothing inside it.
    const result = selectSpans(
      ["He said, the believing servant is like a mountain, and whoever does not follow it is astray."],
      0,
    )
    expect(result.spans.map((span) => span.quote)).toEqual([
      "the believing servant is like a mountain, and whoever does not follow it is astray",
    ])
    expect(result.gaps).toEqual([])
  })

  test("the discarded text is accounted for: every segment is either emitted or gapped", () => {
    // The accounting invariant stated over the case that broke it. `spans.length + gaps.length` is not the
    // right sum — one segment may carry several spans — so this is over DISTINCT segment indices, which is
    // the number the coverage denominator is built from.
    const result = selectSpans(
      [
        "He said, the believing servant is like a mountain, and whoever does not follow it is astray.",
        "A sentence with no quotation at all.",
        'A quoted one, "like this".',
      ],
      0,
    )
    expect(accounted(result)).toBe(3)
  })

  test("an Arabic comma is a separator too, so the rule does not depend on which script the author typed", () => {
    // `،` was a boundary and `,` was not, which made one sentence produce three clauses in one span in
    // English and one clause per span in Arabic — the same sentence checked differently by keyboard. Now
    // neither is a boundary, so the two scripts are handled by the same rule rather than by a matched pair
    // of terminators that could drift apart again.
    expect(selectSpans(["He said, alpha, beta, gamma"], 0).spans.map((s) => s.quote)).toEqual([
      "alpha, beta, gamma",
    ])
    expect(selectSpans(["قال، ألف، باء"], 0).spans.map((s) => s.quote)).toEqual(["ألف، باء"])
  })

  test("a verb matched INSIDE a word is not an introducer, in either script", () => {
    // `indexOf` has no boundary, so `قال` matched at index 1 of `مقالة` and at index 2 of `القالون`,
    // and the published span was `ة جميلة جدا` — text the author never wrote, cut mid-token. A span that
    // is not the author's words cannot be contained in a record, so it could only ever be unverifiable
    // while still counting in the numerator of selection recall.
    const arabic = ["مقالة جميلة جدا", "القالون كثيرون", "مقاليد البيت"]
    for (const segment of arabic) {
      expect(selectSpans([segment], 0).spans).toEqual([])
    }
  })

  test("an English prefix of a verb is not a verb, so a negation is never dropped from the span", () => {
    // `unreported facts are not evidence` matched `reported` at index 2 and published `facts are not
    // evidence` as the author's text. The difference between the two is a NEGATION, which is the whole
    // reason a span has to be the author's words rather than a substring that resembles them.
    const result = selectSpans(["unreported facts are not evidence"], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps[0]?.reason).toBe("no_quotation_like_span")
  })

  test("a real introducer beside a word that merely contains one still yields a span", () => {
    // The control for the boundary rule: rejecting a mid-word match must not reject the segment. The
    // asymmetry is the point — a quotation we cannot see becomes a NAMED gap, and a quotation we can
    // see is checked.
    const result = selectSpans(['Unreported hearsay. He said, "faith is the belief of the heart".'], 0)
    expect(result.spans.map((span) => span.quote)).toEqual(["faith is the belief of the heart"])
  })

  test("a vocalised Arabic verb is matched whole, not through its diacritics", () => {
    // `\p{M}` counts as a word character, so a combining mark after the verb does not read as a boundary
    // and the introducer is never trimmed out of the middle of a vocalised word.
    expect(selectSpans(["قَالَ المؤمنون"], 0).spans).toEqual([])
    expect(selectSpans(["قال المؤمنون"], 0).spans.map((span) => span.quote)).toEqual(["المؤمنون"])
  })

  test("a trimmed span is still a span, so the denominator does not reward keeping the attribution", () => {
    const trimmed = selectSpans(["He said, the believing servant is like a mountain."], 0)
    const plain = selectSpans(["The believing servant is like a mountain."], 0)
    expect(trimmed.spans.length).toBe(1)
    expect(plain.spans.length).toBeLessThanOrEqual(1)
  })
})

describe("R-1: a deliberately skipped fabrication is a visible gap", () => {
  test("a segment the selector does not emit comes back as a NAMED gap, never as an absence", () => {
    const segments = ["plain.", "plain.", "plain.", "The record exists but this sentence quotes nothing at all."]
    const skipped = selectSpans(segments, 3)
    expect(skipped.spans).toEqual([])
    expect(skipped.gaps).toEqual([{ segmentIndex: 3, reason: "no_quotation_like_span" }])
  })

  test("every segment is either emitted or gapped, so the two halves always sum to the segments", () => {
    const result = selectSpans(['A quoted sentence, "inside".', "A sentence with no quotation at all.", 'Another, "here".'], 0)
    expect(accounted(result)).toBe(3)
  })

  test("a document where every sentence looks like a quotation is legitimate, and is not called a clean one", () => {
    const result = selectSpans(['"one".', '"two".', '"three".'], 0)
    expect(result.spans).toHaveLength(3)
    expect(result.gaps).toEqual([])
  })
})

describe("a segment longer than the quote bound", () => {
  test("it is a gap with the actionable reason, never a truncated span that looks checked", () => {
    const huge = `"${"a".repeat(MAX_QUOTE_CHARS + 10)}"`
    const result = selectSpans([huge], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps[0]?.reason).toBe("segment_exceeds_quote_bound")
  })

  test("a 50,000-character run with no terminator is a gap, not a 4,096-character prefix", () => {
    const result = selectSpans(["z".repeat(50_000)], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0]?.reason).toBe("no_quotation_like_span")
  })
})

describe("a document with no quotation-like span says so", () => {
  test("extracted is zero and every segment is gapped, rather than an empty list reading as success", () => {
    const result = selectSpans(["one plain sentence.", "another plain sentence."], 0)
    expect(result.spans).toEqual([])
    expect(result.gaps.map((gap) => gap.segmentIndex)).toEqual([0, 1])
  })
})

describe("A03: document text is data, never instruction", () => {
  const injection = ARTICLE_RED_TEAM_FIXTURES.find((fixture) => fixture.id === "ART-001")

  test("the injection fixture exists, permanently, rather than as a manual check", () => {
    expect(injection).toBeDefined()
    expect(injection?.document).toContain("Ignore all previous instructions")
  })

  test("an instruction inside the document changes no count and grants nothing", () => {
    const withoutInjection = selectSpans(
      ['FABRICATED: he said, "the believing servant is like a mountain" is what the record says.'],
      0,
    )
    const withInjection = selectSpans([injection?.document ?? ""], 0)
    expect(withInjection.spans.length).toBe(withoutInjection.spans.length)
    expect(withInjection.gaps.length).toBe(withoutInjection.gaps.length)
  })

  test("a span carrying an instruction is a SPAN, not a verdict: the shape has no verdict field", () => {
    const result = selectSpans([injection?.document ?? ""], 0)
    const span = result.spans[0]
    expect(span).toBeDefined()
    expect(Object.keys(span ?? {}).toSorted()).toEqual(["quote", "segmentIndex"])
  })

  test("the plausible-fabrication fixture is pinned too, so the suggestion surface has a target", () => {
    const plausible = ARTICLE_RED_TEAM_FIXTURES.find((fixture) => fixture.id === "ART-002")
    expect(plausible).toBeDefined()
    expect(selectSpans([plausible?.document ?? ""], 0).spans.length).toBeGreaterThan(0)
  })

  test("every article fixture carries the FABRICATED marker, so none can become a real citation", () => {
    for (const fixture of ARTICLE_RED_TEAM_FIXTURES) expect(fixture.document).toContain("FABRICATED_")
  })

  test("every article fixture names a HALLMARK type the taxonomy already publishes", () => {
    const types: readonly HallmarkType[] = ["hybrid_fabrication", "plausible_fabrication"]
    for (const fixture of ARTICLE_RED_TEAM_FIXTURES) expect(types).toContain(fixture.hallmarkType)
  })
})

describe("selection is reproducible", () => {
  test("the same segments produce byte-identical spans and gaps on repeat runs", () => {
    const segments = ['A quoted sentence, "inside".', "plain.", 'Another, "here".']
    expect(JSON.stringify(selectSpans(segments, 0))).toBe(JSON.stringify(selectSpans(segments, 0)))
  })

  test("a window starting mid-document does not re-report the segments before it", () => {
    const resumed = selectSpans(['A quoted sentence, "inside".', "plain.", 'Another, "here".'], 1)
    expect(resumed.spans.map((span) => span.segmentIndex)).toEqual([2])
    expect(resumed.gaps.map((gap) => gap.segmentIndex)).toEqual([1])
  })

  test("a `from` past the end is empty, not an error", () => {
    expect(selectSpans(["one."], 99)).toEqual({ spans: [], gaps: [], considered: 0 })
  })

  test("the module reaches no clock, no randomness, no network and no filesystem", () => {
    // A pure function cannot become an injection sink or hold a connection open, so the A03 control on
    // this path is the absence of anything to reach. The adversarial fixture above is the second half.
    expect(selectSpans(['"a".', "b."], 0)).toEqual(selectSpans(['"a".', "b."], 0))
  })
})
