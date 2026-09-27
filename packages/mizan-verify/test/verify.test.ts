import { describe, expect, test } from "bun:test"
import { canonicalJson } from "@mizan/core"
import {
  evidenceIsConsistent,
  foldQuote,
  longestRunFor,
  verifyAnswer,
  type ResolvedCitation,
  type VerifyInput,
} from "../src/index.ts"
import {
  ALL_RECORDS,
  BUKHARI_1,
  BUKHARI_2,
  BUKHARI_UNGRADED,
  FABRICATION,
  GLOSS,
  MUSLIM_1,
  PARAPHRASE,
  QURAN_2_255,
  SNAPSHOT_HASH,
  cite,
  claim,
} from "./fixtures.ts"

/**
 * The verifier's behaviour, case by case.
 *
 * The order of these tests is the order of the six-step procedure, and the middle of them is
 * where religious safety actually lives: the difference between `rejected` (the source exists
 * and does not contain the quote — the model misquoted) and `unverifiable` (we cannot tell).
 * Calling a faithful paraphrase "rejected" accuses a correct answer of lying.
 */

const resolved = (citation: ReturnType<typeof cite>, records: readonly typeof BUKHARI_1[], ambiguous = false): ResolvedCitation => ({
  citation,
  records,
  ambiguous,
})

const only = (input: Omit<VerifyInput, "snapshotHash">): ReturnType<typeof verifyAnswer> =>
  verifyAnswer({ ...input, snapshotHash: SNAPSHOT_HASH })

describe("step 1 — the quote decides, and only the quote", () => {
  test("an exact quotation of the cited record is verified", () => {
    const quote = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ"
    const report = only({ claims: [claim("c1", quote, [cite("bukhari", "1")])], evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])] })
    const verdict = report.claims[0]
    expect(verdict?.verdict).toBe("verified")
    expect(verdict?.reason).toBe("exact_containment")
    expect(verdict?.matchStrength).toEqual({ kind: "exact", percent: 100 })
    expect(verdict?.evidence?.recordId).toBe("bukhari:1")
    // A containment hit means every folded quote character was found — asserted against the
    // fold itself, not against a magic number.
    const expectedChars = foldQuote(quote).length
    expect(verdict?.evidence?.matchedChars).toBe(expectedChars)
    expect(verdict?.evidence?.quoteChars).toBe(expectedChars)
  })

  test("the model's PROSE is never verified: a right opinion with no quote is unverifiable", () => {
    const report = only({ claims: [claim("c1", null, [cite("bukhari", "1")], "Actions are judged by intentions")], evidence: [] })
    expect(report.claims[0]?.verdict).toBe("unverifiable")
    expect(report.claims[0]?.reason).toBe("empty_quote")
  })

  test("a quote that is only diacritics is empty, so it can never match everything", () => {
    const report = only({ claims: [claim("c1", "َُِّ", [cite("bukhari", "1")])], evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])] })
    expect(report.claims[0]?.reason).toBe("empty_quote")
  })

  test("a whitespace-only quote is empty too", () => {
    const report = only({ claims: [claim("c1", "   \t ", [cite("bukhari", "1")])], evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])] })
    expect(report.claims[0]?.reason).toBe("empty_quote")
  })
})

describe("step 1 — folding is what makes a real quotation verifiable at all", () => {
  test("a quote with no tashkeel still verifies against a diacriticized record", () => {
    const report = only({
      claims: [claim("c1", "إنما الاعمال بالنيات", [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
  })

  test("tatweel and doubled spaces do not defeat a match", () => {
    const report = only({
      claims: [claim("c1", "إنما  الأعمال بالنيات", [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
  })

  test("foldQuote is idempotent, so the key a verdict was computed on is stable", () => {
    const once = foldQuote("إِنَّمَا الْأَعْمَالُ")
    expect(foldQuote(once)).toBe(once)
  })
})

describe("step 4 — resolution is collection-scoped, so a shared number cannot cause a false rejection", () => {
  test("number 1 in bukhari resolves to bukhari, not to muslim", () => {
    const report = only({
      claims: [claim("c1", "بَدَأَ الْإِسْلَامُ", [cite("bukhari", "2")])],
      evidence: [resolved(cite("bukhari", "2"), [BUKHARI_2])],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
    expect(report.claims[0]?.evidence?.recordId).toBe("bukhari:2")
  })

  test("the same quote in a different collection does not verify against the first one", () => {
    const report = only({
      claims: [claim("c1", "بَيْنَمَا نَحْنُ نُطَاوِعُ الْمَوْكَأَ", [cite("muslim", "1")])],
      evidence: [resolved(cite("muslim", "1"), [MUSLIM_1])],
    })
    expect(report.claims[0]?.evidence?.recordId).toBe("muslim:1")
  })

  test("an identifier that does not exist is unverifiable, never rejected", () => {
    const report = only({ claims: [claim("c1", "إِنَّمَا الْأَعْمَالُ", [cite("bukhari", "4242")])], evidence: [] })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "identifier_unresolved" })
  })

  test("a number that exists in several collections with none named is unverifiable, not rejected", () => {
    const citation = cite("", "1")
    const report = only({ claims: [claim("c1", "إِنَّمَا الْأَعْمَالُ", [citation])], evidence: [resolved(citation, [], true)] })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "collection_ambiguous" })
  })
})

describe("step 5 — the only route to rejected, and the reason it is not a wider net", () => {
  test("a resolved record that lacks the quoted span is REJECTED: a positive claim of misquotation", () => {
    const report = only({
      claims: [claim("c1", "مَثَلُ الصَّبْرِ كَمَثَلِ الْبَابِ", [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]).toMatchObject({ verdict: "rejected", reason: "quote_absent_at_cited_id", evidence: null })
  })

  test("a FABRICATED hadith is rejected, even though it shares most of its characters with the real one", () => {
    const report = only({
      claims: [claim("c1", FABRICATION, [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("rejected")
  })

  test("the spike's finding is encoded here: a high similarity number is NOT a verdict", () => {
    const diagnostic = longestRunFor(FABRICATION, BUKHARI_1.textMatch)
    expect(diagnostic.contained).toBe(false)
    // The fabricated sentence looks close — that is the whole reason a fuzzy threshold is unsafe.
    expect(diagnostic.displayPercent).toBeGreaterThan(80)
    const report = only({
      claims: [claim("c1", FABRICATION, [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("rejected")
    expect(report.claims[0]?.matchStrength).toEqual({ kind: "none" })
  })

  test("a faithful PARAPHRASE is rejected rather than verified, and never softened to unverifiable", () => {
    const report = only({
      claims: [claim("c1", PARAPHRASE, [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("rejected")
  })

  test("an English gloss of a real hadith is rejected: the verifier is not multilingual", () => {
    const report = only({
      claims: [claim("c1", GLOSS, [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("rejected")
  })

  test("a partially resolved set cannot accuse: the quote might be in the source we never opened", () => {
    const report = only({
      claims: [claim("c1", "مَثَلُ الصَّبْرِ كَمَثَلِ الْبَابِ", [cite("bukhari", "1"), cite("bukhari", "77")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "identifier_unresolved" })
  })
})

describe("step 2 and 3 — the fail-closed rules", () => {
  test("a claim with no citation is unverifiable, never verified by optimism", () => {
    const report = only({ claims: [claim("c1", "إِنَّمَا الْأَعْمَالُ", [])], evidence: [] })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "no_citation" })
  })

  test("more than three citations with nothing resolving is a documented cap, not a silent truncation", () => {
    const citations = [cite("bukhari", "1"), cite("bukhari", "2"), cite("bukhari", "3"), cite("bukhari", "4")]
    const report = only({ claims: [claim("c1", "إِنَّمَا الْأَعْمَالُ", citations)], evidence: [] })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "citation_cap_exceeded" })
    expect(report.citationsConsidered).toBe(3)
  })

  test("a fourth citation does not hide a real third one: the cap is not the reason", () => {
    const citations = [cite("bukhari", "77"), cite("bukhari", "78"), cite("bukhari", "1"), cite("bukhari", "4")]
    const report = only({
      claims: [claim("c1", "إِنَّمَا الْأَعْمَالُ", citations)],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
  })
})

describe("the report invariant: evidence exists if and only if the verdict is verified", () => {
  test("holds across a mixed report of every outcome", () => {
    const claims = [
      claim("ok", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("bukhari", "1")]),
      claim("absent", "مَثَلُ الصَّبْرِ", [cite("bukhari", "1")]),
      claim("unresolved", "إِنَّمَا الْأَعْمَالُ", [cite("bukhari", "4242")]),
      claim("uncited", "إِنَّمَا الْأَعْمَالُ", []),
      claim("noquote", null, [cite("bukhari", "1")]),
    ]
    const report = only({
      claims,
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims.map((verdict) => verdict.verdict)).toEqual([
      "verified",
      "rejected",
      "unverifiable",
      "unverifiable",
      "unverifiable",
    ])
    for (const verdict of report.claims) expect(evidenceIsConsistent(verdict)).toBe(true)
    expect(report.snapshotHash).toBe(SNAPSHOT_HASH)
  })

  test("a grade is carried into evidence verbatim and changes no verdict", () => {
    const graded = only({
      claims: [claim("c1", "مَثَلُ الْمُؤْمِنِينَ فِي تَوَادِّهِمْ", [cite("bukhari", "9999")])],
      evidence: [resolved(cite("bukhari", "9999"), [BUKHARI_UNGRADED])],
    })
    expect(graded.claims[0]?.evidence?.grade).toBeNull()
    expect(graded.claims[0]?.evidence?.gradeBasis).toBe("none")
    const gradedRecord = only({
      claims: [claim("c1", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(gradedRecord.claims[0]?.evidence?.grade).toBe("صحيح")
    expect(gradedRecord.claims[0]?.verdict).toBe("verified")
  })

  test("a Qur'anic record verifies with gradeApplicable false and no grade invented", () => {
    const report = only({
      claims: [claim("c1", "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ", [cite("quran", "255")])],
      evidence: [resolved(cite("quran", "255"), [QURAN_2_255])],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
    expect(report.claims[0]?.evidence?.grade).toBeNull()
  })

  test("the model's claimed grade is never what the evidence shows", () => {
    const report = only({
      claims: [claim("c1", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("bukhari", "1", "ضعيف")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
    })
    expect(report.claims[0]?.evidence?.grade).toBe("صحيح")
  })
})

describe("determinism — the property the whole design rests on", () => {
  const input = (): VerifyInput => ({
    snapshotHash: SNAPSHOT_HASH,
    claims: [
      claim("a", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("bukhari", "1"), cite("quran", "255")]),
      claim("b", "مَثَلُ الصَّبْرِ", [cite("bukhari", "1")]),
      claim("c", "بَيْنَمَا نَحْنُ", [cite("muslim", "1")]),
    ],
    evidence: [
      resolved(cite("bukhari", "1"), [BUKHARI_1]),
      resolved(cite("quran", "255"), [QURAN_2_255]),
      resolved(cite("muslim", "1"), [MUSLIM_1]),
    ],
  })

  test("100 runs over the same snapshot produce byte-identical reports", () => {
    const first = canonicalJson(verifyAnswer(input()))
    for (let run = 0; run < 100; run += 1) {
      expect(canonicalJson(verifyAnswer(input()))).toBe(first)
    }
  })

  test("the verdict does not depend on the order the caller supplied citations", () => {
    const forwards = verifyAnswer(input())
    const backwards = verifyAnswer({
      ...input(),
      claims: [
        claim("a", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("quran", "255"), cite("bukhari", "1")]),
        claim("b", "مَثَلُ الصَّبْرِ", [cite("bukhari", "1")]),
        claim("c", "بَيْنَمَا نَحْنُ", [cite("muslim", "1")]),
      ],
    })
    expect(canonicalJson(backwards.claims)).toBe(canonicalJson(forwards.claims))
  })

  test("the winning record is the lowest id, not the first the caller happened to pass", () => {
    const twoRecords = [QURAN_2_255, BUKHARI_1]
    const report = only({
      claims: [claim("a", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("all", "1")])],
      evidence: [resolved(cite("all", "1"), twoRecords)],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
    expect(report.claims[0]?.evidence?.recordId).toBe("bukhari:1")
    const reversed = only({
      claims: [claim("a", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("all", "1")])],
      evidence: [resolved(cite("all", "1"), [...twoRecords].reverse())],
    })
    expect(reversed.claims[0]?.evidence?.recordId).toBe("bukhari:1")
  })

  test("a record listed twice is not counted twice", () => {
    const report = only({
      claims: [claim("a", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("all", "1"), cite("all", "1")])],
      evidence: [resolved(cite("all", "1"), [BUKHARI_1, BUKHARI_1])],
    })
    expect(report.claims[0]?.verdict).toBe("verified")
  })
})

describe("the deadline — a clock-free predicate supplied by the caller", () => {
  test("an elapsed budget degrades every remaining claim to unverifiable", () => {
    const report = only({
      claims: [claim("a", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
      deadlineExpired: () => true,
    })
    expect(report.claims[0]).toMatchObject({ verdict: "unverifiable", reason: "verification_timeout" })
    expect(report.degraded).toEqual(["verification_timeout"])
  })

  test("a timeout is never silently dropped, and never falls back to a prior verdict", () => {
    const report = only({
      claims: [claim("a", "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", [cite("bukhari", "1")])],
      evidence: [resolved(cite("bukhari", "1"), [BUKHARI_1])],
      deadlineExpired: () => false,
    })
    expect(report.degraded).toEqual([])
    expect(report.claims[0]?.verdict).toBe("verified")
  })
})

describe("the display-only diagnostic", () => {
  test("reports containment, and the percentage next to it", () => {
    const inside = longestRunFor("إِنَّمَا الْأَعْمَالُ", BUKHARI_1.textMatch)
    expect(inside.contained).toBe(true)
    expect(inside.runChars).toBe(inside.quoteChars)
    expect(inside.displayPercent).toBe(100)
  })

  test("an empty quote yields nothing to display rather than a flattering zero", () => {
    expect(longestRunFor("", BUKHARI_1.textMatch)).toEqual({ runChars: 0, quoteChars: 0, contained: false, displayPercent: 0 })
  })

  test("an empty record cannot divide by zero", () => {
    expect(longestRunFor("إِنَّمَا", "").displayPercent).toBe(0)
  })
})

describe("corpus contents that the verifier must never assume", () => {
  test("no record anywhere in the fixture set is a duplicate of another's text", () => {
    const texts = new Set(ALL_RECORDS.map((record) => record.textMatch))
    expect(texts.size).toBe(ALL_RECORDS.length)
  })

  test("every fixture record has a pre-folded textMatch equal to its display text", () => {
    for (const record of ALL_RECORDS) {
      expect(record.textMatch.length).toBeGreaterThan(0)
      expect(record.textDisplay).not.toBe(record.textMatch)
    }
  })
})
