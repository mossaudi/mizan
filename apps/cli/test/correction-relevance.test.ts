import { describe, expect, test } from "bun:test"
import { MAX_SPAN_CHARS, MIN_SPAN_CHARS, correctionFor, renderCorrection } from "../src/correction.ts"
import { assessRelevance, relevanceLabel } from "../src/relevance.ts"
import { normalizeForMatch } from "@mizan/core"

/**
 * ST3 and ST4: the two surfaces Sprint 2 added beside the badge.
 *
 * They are tested together because the one thing that must hold for both is the separation: a
 * discrete state plus a location, with no number in either that a reader could read as a strength,
 * and no route by which either could have changed a badge. Gate G-7 re-asserts the separation
 * structurally at every run; these tests assert it behaviourally.
 */

/**
 * A real, fully diacriticized hadith span (Sunan Abi Dawud 4255, verbatim).
 *
 * The right-to-left marks and the quotation marks are built from code points rather than typed.
 * The source publishes `U+200F` around its matn, and an RLM sitting next to a literal `"` inside
 * a double-quoted string terminates the literal and produces a syntax error no reader can see —
 * which is exactly the invisible-character problem `terminal.ts` documents, met in a test file.
 */
const RLM = String.fromCharCode(0x200f)
const QUOTE = String.fromCharCode(0x22)
const MATN = "يَتَقَارَبُ الزَّمَانُ وَيَنْقُصُ الْعِلْمُ وَتَظْهَرُ الْفِتَنُ وَيُلْقَى الشُّحُّ وَيَكْثُرُ الْهَرْجُ"

const RECORD = `حَدَّثَنَا أَحْمَدُ بْنُ صَالِحٍ، قَالَ قَالَ رَسُولُ اللَّهِ صلى الله عليه وسلم ${RLM}${QUOTE}${RLM} ${MATN} ${RLM}${QUOTE}${RLM} ‏.‏`

const recordKey = (): string => normalizeForMatch(RECORD)

describe("a correction is a location or an honest refusal, never a number", () => {
  test("a re-worded quote locates the run the record really has", () => {
    const fabricated = "يَتَقَارَبُ الزَّمَانُ وَيَنْقُصُ الْفِقْهُ وَتَظْهَرُ الْفِتَنُ وَيُلْقَى الشُّحُّ وَيَكْثُرُ الْهَرْجُ"
    const correction = correctionFor({ verdict: "rejected", quote: fabricated, recordTextMatch: recordKey() })
    if (correction.state !== "located") throw new Error("this quote re-words the record, so a span exists")
    // The invented clause is `الفقه` for `العلم`. The shared run on either side of it is located.
    expect(correction.span.text.length).toBeGreaterThanOrEqual(MIN_SPAN_CHARS)
    expect(correction.span.capped).toBe(false)
  })

  test("the span is a slice of the folded record at the position it states", () => {
    const quote = "وَتَظْهَرُ الْفِتَنُ وَيُلْقَى الشُّحُّ وَيَكْثُرُ الْهَرْجُ"
    const key = recordKey()
    const correction = correctionFor({ verdict: "rejected", quote, recordTextMatch: key })
    if (correction.state !== "located") throw new Error("this quote is verbatim, so a span exists")
    expect(key.slice(correction.span.startChar, correction.span.endChar)).toBe(correction.span.text)
  })

  test("the span is the record's own text, so a reader can look it up", () => {
    const correction = correctionFor({ verdict: "rejected", quote: "يَتَقَارَبُ الزَّمَانُ", recordTextMatch: recordKey() })
    if (correction.state !== "located") throw new Error("this quote is verbatim, so a span exists")
    expect(recordKey()).toContain(correction.span.text)
  })

  test("the correction carries no field a caller could turn into a score", () => {
    const correction = correctionFor({ verdict: "rejected", quote: "يَتَقَارَبُ الزَّمَانُ", recordTextMatch: recordKey() })
    if (correction.state !== "located") throw new Error("this quote is verbatim, so a span exists")
    // AGENTS.md §10: a percentage may live only in a display-only diagnostic. The span's numbers
    // are two indices into one string; there is nothing here to divide.
    expect(Object.keys(correction.span).sort()).toEqual(["capped", "endChar", "startChar", "text"])
  })

  test("rendering a span prints no percentage and no score word", () => {
    const correction = correctionFor({ verdict: "rejected", quote: "يَتَقَارَبُ الزَّمَانُ", recordTextMatch: recordKey() })
    const text = renderCorrection(correction).join("\n")
    expect(text).not.toContain("%")
    expect(text).not.toContain("percent")
    expect(text).not.toContain("confidence")
    expect(text).not.toMatch(/\b\d+\s*(out of|\/)\s*\d+/)
  })
})

describe("every correction failure state is stated, and none is silent", () => {
  test("a verified claim is not offered a correction", () => {
    const correction = correctionFor({ verdict: "verified", quote: "يَتَقَارَبُ", recordTextMatch: recordKey() })
    expect(correction.state).toBe("unverifiable")
    if (correction.state !== "unverifiable") throw new Error("the state is not unverifiable, so this throw is unreachable")
    expect(correction.reason).toContain("rejected claim only")
  })

  test("an unverifiable claim is not offered a correction either", () => {
    // The badge already says unverifiable; a span under it would read as partial evidence for a
    // claim that produced none.
    expect(correctionFor({ verdict: "unverifiable", quote: "يَتَقَارَبُ", recordTextMatch: recordKey() }).state).toBe("unverifiable")
  })

  test("a rejection with no quotation says so", () => {
    const correction = correctionFor({ verdict: "rejected", quote: "   ", recordTextMatch: recordKey() })
    if (correction.state !== "unverifiable") throw new Error("there is nothing to locate, so this throw is unreachable")
    expect(correction.reason).toContain("no quotation")
  })

  test("a rejection whose citation resolved to nothing says so", () => {
    // Never silently print nothing: an empty correction reads as "there is no correction to make",
    // which is a different claim from "we could not look".
    const correction = correctionFor({ verdict: "rejected", quote: "يَتَقَارَبُ الزَّمَانُ", recordTextMatch: null })
    if (correction.state !== "unverifiable") throw new Error("there is nothing to point into, so this throw is unreachable")
    expect(correction.reason).toContain("resolved to no record")
  })

  test("a fully invented quote against an unrelated record refuses rather than pointing at a letter", () => {
    // The coincidence case. `xyzzy plugh` shares only a space with an Arabic record, so the
    // longest run is below the floor and the honest answer refuses a location.
    const correction = correctionFor({ verdict: "rejected", quote: "xyzzy plugh", recordTextMatch: recordKey() })
    if (correction.state !== "unverifiable") throw new Error("the shared run is below the floor, so this throw is unreachable")
    expect(correction.reason).toContain("too short to be a location")
  })

  test("a run too short to be a location is refused, and the reason is the floor", () => {
    // Two unrelated Arabic strings nearly always share a letter. Printing a one-character span
    // under a REJECTED badge would present coincidence as what the record says.
    const correction = correctionFor({ verdict: "rejected", quote: "ن", recordTextMatch: recordKey() })
    if (correction.state !== "unverifiable") throw new Error("one character is not a location, so this throw is unreachable")
    expect(correction.reason).toContain("too short")
  })

  test("a run one character below the floor is still refused", () => {
    // A 7-folded-character run against a record that holds exactly it: the longest run is
    // one below MIN_SPAN_CHARS, so there is a genuine run and it is still refused.
    // (An earlier version of this test embedded the padded quote in the record, which made
    // the record contain the whole padded string and the run was never below the floor.)
    const run = "والفتنة"
    const correction = correctionFor({ verdict: "rejected", quote: run, recordTextMatch: normalizeForMatch(`zzz ${run} zzz`) })
    if (correction.state !== "unverifiable") throw new Error("the run is below the floor, so this throw is unreachable")
    expect(correction.reason).toContain("too short")
  })

  test("every unverifiable reason renders as one visible line", () => {
    for (const input of [
      { verdict: "verified" as const, quote: "يَتَقَارَبُ", recordTextMatch: recordKey() },
      { verdict: "rejected" as const, quote: "", recordTextMatch: recordKey() },
      { verdict: "rejected" as const, quote: "يَتَقَارَبُ", recordTextMatch: null },
      { verdict: "rejected" as const, quote: "xyzzy", recordTextMatch: recordKey() },
    ]) {
      const lines = renderCorrection(correctionFor(input))
      expect(lines).toHaveLength(1)
      expect(lines[0]).toStartWith("correction: unavailable — ")
    }
  })
})

describe("a long run is capped and says that it is capped", () => {
  test("a run over the cap is truncated and flagged", () => {
    const long = "أ".repeat(200)
    const correction = correctionFor({ verdict: "rejected", quote: long, recordTextMatch: normalizeForMatch(`بداية ${long} نهاية`) })
    if (correction.state !== "located") throw new Error("a 200-character run is far above the floor")
    expect(correction.span.capped).toBe(true)
    expect(correction.span.text).toHaveLength(MAX_SPAN_CHARS)
  })

  test("the rendered span says it is the start of a longer run", () => {
    const long = "أ".repeat(200)
    const lines = renderCorrection(correctionFor({ verdict: "rejected", quote: long, recordTextMatch: normalizeForMatch(`بداية ${long} نهاية`) }))
    expect(lines.join("\n")).toContain(`first ${MAX_SPAN_CHARS} folded characters of a longer run`)
  })

  test("a run exactly at the cap is not flagged as capped", () => {
    const exact = "ب".repeat(MAX_SPAN_CHARS)
    const correction = correctionFor({ verdict: "rejected", quote: exact, recordTextMatch: normalizeForMatch(`بداية ${exact} نهاية`) })
    if (correction.state !== "located") throw new Error("a cap-length run is above the floor")
    expect(correction.span.capped).toBe(false)
    expect(correction.span.text).toHaveLength(MAX_SPAN_CHARS)
  })

  test("a run exactly at the floor is located", () => {
    const exact = "ج".repeat(MIN_SPAN_CHARS)
    const correction = correctionFor({ verdict: "rejected", quote: exact, recordTextMatch: normalizeForMatch(`بداية ${exact} نهاية`) })
    expect(correction.state).toBe("located")
  })
})

describe("the correction locates a run and never changes what the badge said", () => {
  test("the same rejected claim yields the same span every time", () => {
    const input = { verdict: "rejected" as const, quote: "وَيَنْقُصُ الْفِقْهُ وَتَظْهَرُ الْفِتَنُ", recordTextMatch: recordKey() }
    const first = correctionFor(input)
    for (let attempt = 0; attempt < 5; attempt += 1) expect(correctionFor(input)).toEqual(first)
  })

  test("a located span does not upgrade a rejection into anything", () => {
    // The structural half is in `schema/display.ts`: `Correction` has no verdict field. This test
    // is the behavioural half — the value returned alongside a REJECTED badge still says `located`
    // and nothing about the claim's own outcome.
    const correction = correctionFor({ verdict: "rejected", quote: "وَتَظْهَرُ الْفِتَنُ", recordTextMatch: recordKey() })
    expect(correction.state).toBe("located")
    expect(Object.keys(correction)).not.toContain("verdict")
  })

  test("the marker line is bounded, so a deep span does not push the report off screen", () => {
    const deep = "ب".repeat(120)
    const lines = renderCorrection(correctionFor({ verdict: "rejected", quote: deep, recordTextMatch: normalizeForMatch(`${"ط".repeat(400)} ${deep}`) }))
    const marker = lines.find((line) => line.includes("^"))
    if (marker === undefined) throw new Error("a located span renders a marker, so this throw is unreachable")
    const caretColumn = marker.indexOf("^")
    expect(caretColumn).toBeLessThanOrEqual(80)
  })

  test("a bounded marker states that the position is further in than the bound", () => {
    const deep = "ب".repeat(120)
    const lines = renderCorrection(correctionFor({ verdict: "rejected", quote: deep, recordTextMatch: normalizeForMatch(`${"ط".repeat(400)} ${deep}`) }))
    expect(lines.join("\n")).toContain("the position above is exact")
  })

  test("the exact position is always stated, so a bounded marker is never the only record of it", () => {
    const lines = renderCorrection(correctionFor({ verdict: "rejected", quote: "وَتَظْهَرُ الْفِتَنُ", recordTextMatch: recordKey() }))
    expect(lines[0]).toMatch(/at folded character \d+/)
  })
})

describe("relevance is three discrete words and a located term list", () => {
  test("a quote that shares the question's terms answers it", () => {
    const relevance = assessRelevance("ماذا قال النبي عن تقارب الزمان؟", "يَتَقَارَبُ الزَّمَانُ وَيَنْقُصُ الْعِلْمُ")
    expect(relevance.state).toBe("answers")
    expect(relevanceLabel(relevance)).toBe("answers")
  })

  test("a quote sharing no content term does not answer it", () => {
    const relevance = assessRelevance("ما حكم صلاة الجماعة؟", "يَتَقَارَبُ الزَّمَانُ وَيَنْقُصُ الْعِلْمُ")
    expect(relevance.state).toBe("doesNotAnswer")
    expect(relevance.located).toEqual([])
  })

  test("an empty question is undetermined rather than answered", () => {
    expect(assessRelevance("", "أي نص").state).toBe("undetermined")
  })

  test("an empty quote is undetermined rather than answering", () => {
    expect(assessRelevance("ماذا قال النبي", "").state).toBe("undetermined")
  })

  test("a question made only of question words is undetermined, because it has no content to match", () => {
    // Failing closed matters most here: a question with no content term would otherwise share
    // nothing and be reported as `doesNotAnswer`, which asserts something about the answer.
    expect(assessRelevance("ما الذي قاله؟", "أي نص آخر").state).toBe("undetermined")
  })

  test("a question whose quote contradicts its polarity is undetermined, not answered", () => {
    // A lexical set relation has no way to tell "is fasting forbidden" from "is fasting permitted".
    // Reporting `answers` would transfer authority the method does not have.
    expect(assessRelevance("هل الصيام حرام في رمضان؟", "الصيام مكروه في رمضان").state).toBe("undetermined")
  })

  test("a non-negated question is assessed rather than refused", () => {
    expect(assessRelevance("ماذا قال النبي عن العلم؟", "ينقص العلم").state).toBe("answers")
  })

  test("the located terms are the question's own terms that occur in the quote", () => {
    const relevance = assessRelevance("ماذا قال النبي عن تقارب الزمان ونقص العلم؟", "قال النبي إن الزمان يتقارب")
    expect(relevance.located.length).toBeGreaterThan(0)
    for (const term of relevance.located) {
      expect("قال النبي إن الزمان يتقارب".replace(/[ً-ٰٟ]/g, "")).toContain(term)
    }
  })

  test("the reason is a sentence, so the report explains itself without a legend", () => {
    expect(assessRelevance("ما حكم صلاة الجماعة؟", "يَتَقَارَبُ الزَّمَانُ").reason.length).toBeGreaterThan(10)
  })

  test("the same question and quote always give the same assessment", () => {
    const first = assessRelevance("ماذا قال النبي عن الصوم؟", "الصومpillar strong")
    for (let attempt = 0; attempt < 5; attempt += 1) expect(assessRelevance("ماذا قال النبي عن الصوم؟", "الصومpillar strong")).toEqual(first)
  })

  test("a relevance value names no outcome, so it cannot read as a badge", () => {
    const relevance = assessRelevance("ماذا قال النبي عن العلم؟", "ينقص العلم")
    expect(Object.keys(relevance).sort()).toEqual(["located", "missing", "reason", "state"])
  })

  test("each of the three states has its own label", () => {
    const labels = new Set([
      relevanceLabel(assessRelevance("ما حكم صلاة الجماعة؟", "تقارب الزمن")),
      relevanceLabel(assessRelevance("ماذا قال النبي عن تقارب الزمان؟", "تقارب الزمان وعلاماته")),
      relevanceLabel(assessRelevance("", "")),
    ])
    expect(labels.size).toBe(3)
  })
})
