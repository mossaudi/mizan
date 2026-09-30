import { describe, expect, test } from "bun:test"
import { canonicalJson, type Claim } from "@mizan/core"
import { anchorFrom, appearsInOrder, locateAnchor, verifyAnswer, type VerifyInput } from "../src/index.ts"
import { BUKHARI_1, BUKHARI_2, SNAPSHOT_HASH, cite, claim } from "./fixtures.ts"
import type { ResolvedCitation } from "@mizan/core"

/**
 * The anchor locator (MIZ-106) and the branch it feeds.
 *
 * ## The story these tests tell
 *
 * A claim that *abridges* a source — truthfully, in order, but not verbatim — now reports
 * `unverifiable (no_matching_evidence)` instead of `rejected`. That is the correction the
 * feature exists to make, and it is gated so hard elsewhere (G-7) that the tests here can
 * afford to be about behaviour rather than about machinery.
 *
 * ## The invariant that matters most
 *
 * The anchor is consulted ONLY when strict containment has already failed. A claim whose
 * quote IS the source text is `verified` whether or not it coughs up an anchor — the anchor
 * can never change a `verified`, never speed it up, and never cheapen it. That property is
 * tested twice, because it is the property that makes "landing the mechanism inert" an honest
 * statement rather than a hope.
 */

const resolved = (citation: ReturnType<typeof cite>, records: readonly typeof BUKHARI_1[], ambiguous = false): ResolvedCitation => ({
  citation,
  records,
  ambiguous,
})

const only = (input: Omit<VerifyInput, "snapshotHash">): ReturnType<typeof verifyAnswer> =>
  verifyAnswer({ ...input, snapshotHash: SNAPSHOT_HASH })

/** A claim that cites the record but abridges it (no anchor yet — that is the caller's choice). */
const abridged = (anchor: string | null | undefined): Claim =>
  claim("c1", "الأعمال تُبنى على النوايا", [cite("bukhari", "1")], "an abridgement", anchor)

/** Folded form of the famous opening span of BUKHARI_1, and its third word. */
const OPENING_FRAGMENT = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ"
const FOLDED_OPENING = "انما الاعمال بالنيات"
const REAR_WORD = "لكل"

describe("anchorFrom — validation at the boundary", () => {
  test("no anchor is the overwhelmingly common case: absent means absent, not failed", () => {
    expect(anchorFrom(null)).toBeNull()
    expect(anchorFrom(undefined)).toBeNull()
  })

  test("an empty or whitespace-only anchor is absent", () => {
    expect(anchorFrom("")).toBeNull()
    expect(anchorFrom("   ")).toBeNull()
  })

  test("a two-word fragment is too short to be a deliberate pointer at real text", () => {
    expect(anchorFrom("الْأَعْمَالُ بِالنِّيَّاتِ")).toBeNull()
  })

  test("a three-word fragment is the minimum a pointer may be", () => {
    expect(anchorFrom(OPENING_FRAGMENT)).toBe(FOLDED_OPENING)
  })

  test("the whole first hadith is exactly the maximum of eight words, and is accepted", () => {
    // The fold strips tashkeel and folds alef-maqsura (نوى -> نوي) but KEEPS the Arabic
    // comma attached to its token — so the folded form below is the exact one, not a gloss.
    expect(anchorFrom("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى")).toBe(
      "انما الاعمال بالنيات، وانما لكل امري ما نوي",
    )
  })

  test("nine words is a quotation in disguise, and is rejected", () => {
    expect(anchorFrom("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى بَعْدُ")).toBeNull()
  })

  test("an over-long anchor is rejected outright, never truncated to fit", () => {
    const long = `${"وَ ".repeat(100)}لِكُلِّ`
    expect(anchorFrom(long)).toBeNull()
  })
})

describe("appearsInOrder — the shared ordered-token relation", () => {
  const recordTokens = "انما الاعمال بالنيات وانما لكل امري ما نوى".split(" ")

  test("contiguous tokens in order are ordered", () => {
    const run = appearsInOrder("انما الاعمال بالنيات".split(" "), recordTokens)
    expect(run).toEqual({ ordered: true, firstIndex: 0, lastIndex: 2 })
  })

  test("non-contiguous tokens in order are ordered, with the true first and last indices", () => {
    const run = appearsInOrder("انما لكل".split(" "), recordTokens)
    expect(run).toEqual({ ordered: true, firstIndex: 0, lastIndex: 4 })
  })

  test("tokens out of order are not ordered", () => {
    const run = appearsInOrder("النيات الاعمال".split(" "), recordTokens)
    expect(run).toEqual({ ordered: false, firstIndex: -1, lastIndex: -1 })
  })

  test("the same occurrence cannot satisfy a repeated token", () => {
    // The record contains exactly one bare `انما`; a second request must fail rather than
    // re-using the same index, which would let two claims share a single occurrence.
    const run = appearsInOrder("انما انما".split(" "), recordTokens)
    expect(run.ordered).toBe(false)
  })

  test("an empty quote token list is not ordered", () => {
    expect(appearsInOrder([], recordTokens).ordered).toBe(false)
  })

  test("an empty record token list is not ordered", () => {
    expect(appearsInOrder("انما".split(" "), []).ordered).toBe(false)
  })
})

describe("locateAnchor — two arms, one real substring, no numbers", () => {
  test("arm A: a contiguous folded span is located at its first occurrence", () => {
    const span = locateAnchor(FOLDED_OPENING, BUKHARI_1)
    expect(span.located).toBe(true)
    expect(span.span).toBe(FOLDED_OPENING)
    // The reported span is a real substring of the record, not a reconstruction.
    expect(BUKHARI_1.textMatch.indexOf(span.span)).toBeGreaterThanOrEqual(0)
  })

  test("arm B: an ordered non-contiguous fragment is located, and the span is the record's own text", () => {
    // Careful example choice: `انما امري` is NOT a substring of the folded record (arm A
    // must miss), yet its tokens appear in order at indices 0 and 5 (arm B must hit).
    const span = locateAnchor("انما امري", BUKHARI_1)
    expect(span.located).toBe(true)
    expect(span.span).toBe("انما الاعمال بالنيات، وانما لكل امري")
    expect(BUKHARI_1.textMatch.indexOf(span.span)).toBeGreaterThanOrEqual(0)
  })

  test("arm A wins when both arms could fire, so the short contiguous span is reported", () => {
    // This anchor IS contiguous in the record, so arm B must not be consulted at all —
    // otherwise the same anchor could report two different spans depending on arm order.
    const span = locateAnchor(FOLDED_OPENING, BUKHARI_1)
    expect(span.span).toBe(FOLDED_OPENING)
  })

  test("a fragment that is not in the record is not located", () => {
    const span = locateAnchor("وكانت الاعمال كلها", BUKHARI_1)
    expect(span).toEqual({ located: false, span: "" })
  })

  test("a fragment from a DIFFERENT record is not located: anchors address one resolved source", () => {
    const span = locateAnchor("بدا الاسلام", BUKHARI_1)
    expect(span.located).toBe(false)
    expect(locateAnchor("بدا الاسلام", BUKHARI_2).located).toBe(true)
  })

  test("an empty anchor is not located", () => {
    expect(locateAnchor("", BUKHARI_1)).toEqual({ located: false, span: "" })
  })

  test("an expired deadline short-circuits both arms to not-located", () => {
    expect(locateAnchor(FOLDED_OPENING, BUKHARI_1, () => true)).toEqual({ located: false, span: "" })
  })

  test("a predicate that fires DURING arm B abandons the search rather than finishing late", () => {
    let calls = 0
    const deadline = (): boolean => (calls += 1) > 1
    // The same non-contiguous corridor as the arm B test above, so arm A misses first.
    const span = locateAnchor("انما امري", BUKHARI_1, deadline)
    expect(span).toEqual({ located: false, span: "" })
    expect(calls).toBe(2)
  })
})

describe("verifyClaim branch between containment and accusation", () => {
  test("an abridged claim whose anchor is in the cited record is unverifiable, not rejected", () => {
    const report = only({
      claims: [abridged(OPENING_FRAGMENT)],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "no_matching_evidence", evidence: null })
  })

  test("the correction is absent without an anchor: an anchorless abridgement stays rejected", () => {
    const report = only({
      claims: [abridged(null)],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]).toMatchObject({ verdict: "rejected", reason: "quote_absent_at_cited_id" })
  })

  test("an anchor that fails the word bounds is treated as absent, not half-applied", () => {
    const report = only({
      claims: [abridged("الْأَعْمَالُ بِالنِّيَّاتِ")],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("rejected")
  })

  test("an anchor that is NOT in the cited record changes nothing: still rejected", () => {
    const report = only({
      claims: [abridged("بدا الاسلام بالفريضتين")],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("rejected")
  })

  test("the anchor cannot reach across to a different cited record", () => {
    // The anchor is BUKHARI_2's text but the citation resolves to BUKHARI_1.
    const report = only({
      claims: [abridged("بدا الاسلام بالفريضتين")],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.reason).toBe("quote_absent_at_cited_id")
  })

  test("a claim that ALREADY verifies is verified regardless of its anchor — the anchor is consulted only after containment", () => {
    const quoted = claim("c1", FOLDED_OPENING, [cite("bukhari", "1")], "verbatim", "وكانت الاعمال كلها")
    const report = only({
      claims: [quoted],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
  })

  test("a deadline that fires during the anchor search yields verification_timeout, never a verdict", () => {
    let calls = 0
    const report = only({
      claims: [abridged(OPENING_FRAGMENT)],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
      // Pre-check (call 1) passes; the expiry fires inside the locator.
      deadlineExpired: () => (calls += 1) > 1,
    })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "verification_timeout" })
  })
})

describe("the anchor arm stays inside the determinism guarantee", () => {
  const input = (): VerifyInput => ({
    snapshotHash: SNAPSHOT_HASH,
    claims: [
      claim("verbatim", "انما الاعمال بالنيات", [cite("bukhari", "1")], "verbatim", "وكانت الاعمال كلها"),
      claim("abridged", "الأعمال تُبنى على النوايا", [cite("bukhari", "1")], "abridged", OPENING_FRAGMENT),
      claim("absent", "الأعمال تُبنى على النوايا", [cite("bukhari", "1")], "abridged", REAR_WORD),
    ],
    evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
  })

  test("100 runs over anchored claims are byte-identical", () => {
    const first = canonicalJson(verifyAnswer(input()))
    for (let run = 0; run < 100; run += 1) expect(canonicalJson(verifyAnswer(input()))).toBe(first)
  })

  test("the anchor cannot change the shape of a verified verdict or its evidence", () => {
    const report = only({
      claims: [claim("c1", "انما الاعمال بالنيات", [cite("bukhari", "1")], "verbatim", OPENING_FRAGMENT)],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    const verdict = report.claims[0]
    expect(verdict?.verdict).toBe("verified")
    expect(verdict?.matchStrength).toEqual({ kind: "exact", percent: 100 })
    expect(verdict?.evidence?.recordId).toBe("bukhari:1")
  })
})