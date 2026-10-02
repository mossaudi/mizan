import type { Citation, Claim } from "@mizan/core"

/**
 * Red-team fixtures: 14 HALLMARK-type fabricated citations.
 *
 * ## What these are
 *
 * Each fixture is a fabricated citation that must NEVER produce a `verified` verdict.
 * They are adapted from the HALLMARK benchmark's 14 hallucination types to mizan's
 * religious content domain (Qur'an/hadith citation verification).
 *
 * ## Security: no real hadith content
 *
 * All fabricated text is clearly synthetic (prefixed with "FABRICATED_"). No real
 * hadith or Qur'an text is used in these fixtures. The fixtures are in a separate
 * directory from the real corpus and are never loaded into corpus.db.
 *
 * ## HALLMARK taxonomy mapping
 *
 * The 14 HALLMARK types are adapted as follows:
 *
 * | HALLMARK type | mizan adaptation | Fixture ID |
 * |---|---|---|
 * | fabricated_doi | fabricated_hadith_id | RT-001 |
 * | nonexistent_venue | nonexistent_collection | RT-002 |
 * | placeholder_authors | placeholder_grade | RT-003 |
 * | future_date | anachronistic_attribution | RT-004 |
 * | chimeric_title | chimeric_citation | RT-005 |
 * | wrong_venue | wrong_collection | RT-006 |
 * | author_mismatch | misattributed_narrator | RT-007 |
 * | preprint_as_published | weak_grade_as_authentic | RT-008 |
 * | hybrid_fabrication | hybrid_fabrication | RT-009 |
 * | merged_citation | merged_citation | RT-010 |
 * | partial_author_list | partial_quote | RT-011 |
 * | near_miss_title | near_miss_quote | RT-012 |
 * | plausible_fabrication | plausible_fabrication | RT-013 |
 * | arxiv_version_mismatch | version_mismatch | RT-014 |
 */

/** Difficulty tier for each HALLMARK type. */
export type DifficultyTier = "Easy" | "Medium" | "Hard"

/** A red-team fixture: a fabricated claim that must not verify. */
export type RedTeamFixture = {
  /** Unique identifier (RT-001 to RT-014). */
  readonly id: string
  /** The HALLMARK type this fixture exercises. */
  readonly hallmarkType: string
  /** The mizan-specific adaptation name. */
  readonly adaptation: string
  /** Difficulty tier from the HALLMARK taxonomy. */
  readonly tier: DifficultyTier
  /** The fabricated claim. */
  readonly claim: Claim
  /** The expected verdict: never "verified". */
  readonly expectedVerdict: "unverifiable" | "rejected"
  /** Why this fixture must not verify. */
  readonly rationale: string
}

/** A citation to a hadith ID that does not exist in the corpus. */
const citeNonexistent = (): Citation => ({
  collection: "bukhari",
  number: "999999",
  grade: null,
  raw: "bukhari:999999",
})

/** A citation to a collection that does not exist. */
const citeNonexistentCollection = (): Citation => ({
  collection: "fabricated-collection",
  number: "1",
  grade: null,
  raw: "fabricated-collection:1",
})

/** A citation with a placeholder grade. */
const citePlaceholderGrade = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: "Sahih",
  raw: "bukhari:1",
})

/** A citation with anachronistic attribution. */
const citeAnachronistic = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: "صحيح",
  raw: "bukhari:1",
})

/** A chimeric citation: real collection + fabricated number. */
const citeChimeric = (): Citation => ({
  collection: "bukhari",
  number: "0",
  grade: null,
  raw: "bukhari:0",
})

/** A citation to the wrong collection. */
const citeWrongCollection = (): Citation => ({
  collection: "muslim",
  number: "1",
  grade: null,
  raw: "muslim:1",
})

/** A citation with misattributed narrator. */
const citeMisattributed = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: null,
  raw: "bukhari:1",
})

/** A citation presenting a weak grade as authentic. */
const citeWeakAsAuthentic = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: "Daif",
  raw: "bukhari:1",
})

/** A hybrid fabrication: real collection + fabricated content. */
const citeHybrid = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: null,
  raw: "bukhari:1",
})

/** A merged citation: content from multiple sources. */
const citeMerged = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: null,
  raw: "bukhari:1",
})

/** A partial quote presented as complete. */
const citePartial = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: null,
  raw: "bukhari:1",
})

/** A near-miss quote: off by 1-2 words from a real hadith. */
const citeNearMiss = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: null,
  raw: "bukhari:1",
})

/** A plausible fabrication: entirely invented but realistic. */
const citePlausible = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: null,
  raw: "bukhari:1",
})

/** A version mismatch: mixed metadata from different sources. */
const citeVersionMismatch = (): Citation => ({
  collection: "bukhari",
  number: "1",
  grade: "Hasan",
  raw: "bukhari:1",
})

/**
 * All 14 red-team fixtures.
 *
 * Each fixture is a fabricated claim that must NOT produce a `verified` verdict.
 * The fabricated text is clearly synthetic and never contains real hadith content.
 */
export const RED_TEAM_FIXTURES: readonly RedTeamFixture[] = [
  {
    id: "RT-001",
    hallmarkType: "fabricated_doi",
    adaptation: "fabricated_hadith_id",
    tier: "Easy",
    claim: {
      id: "rt-001",
      text: "FABRICATED_HADITH_001: This citation points to a hadith ID that does not exist.",
      quote: "FABRICATED_QUOTE_001: إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ الْمُخْتَلَقَةُ",
      citations: [citeNonexistent()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The hadith ID 999999 does not exist in the corpus, so the citation cannot resolve.",
  },
  {
    id: "RT-002",
    hallmarkType: "nonexistent_venue",
    adaptation: "nonexistent_collection",
    tier: "Easy",
    claim: {
      id: "rt-002",
      text: "FABRICATED_HADITH_002: This citation points to a collection that does not exist.",
      quote: "FABRICATED_QUOTE_002: هَذَا حَدِيثٌ مُخْتَلَقٌ فِي مَجْمُوعَةٍ غَيْرِ مَوْجُودَةٍ",
      citations: [citeNonexistentCollection()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The collection 'fabricated-collection' does not exist in the corpus.",
  },
  {
    id: "RT-003",
    hallmarkType: "placeholder_authors",
    adaptation: "placeholder_grade",
    tier: "Easy",
    claim: {
      id: "rt-003",
      text: "FABRICATED_HADITH_003: This citation uses a placeholder grade.",
      quote: "FABRICATED_QUOTE_003: حَدِيثٌ مُخْتَلَقٌ بِدَرَجَةٍ وَهْمِيَّةٍ",
      citations: [citePlaceholderGrade()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The grade 'Sahih' is a placeholder and the quote is fabricated.",
  },
  {
    id: "RT-004",
    hallmarkType: "future_date",
    adaptation: "anachronistic_attribution",
    tier: "Easy",
    claim: {
      id: "rt-004",
      text: "FABRICATED_HADITH_004: This citation has anachronistic attribution.",
      quote: "FABRICATED_QUOTE_004: حَدِيثٌ مُخْتَلَقٌ بِإِسْنَادٍ حَدِيثٍ زَائِفٍ",
      citations: [citeAnachronistic()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The attribution is anachronistic and the quote is fabricated.",
  },
  {
    id: "RT-005",
    hallmarkType: "chimeric_title",
    adaptation: "chimeric_citation",
    tier: "Medium",
    claim: {
      id: "rt-005",
      text: "FABRICATED_HADITH_005: This citation pairs a real collection with a fabricated number.",
      quote: "FABRICATED_QUOTE_005: حَدِيثٌ مُخْتَلَقٌ بِرَقْمٍ غَيْرِ مَوْجُودٍ",
      citations: [citeChimeric()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The hadith number 0 does not exist in the bukhari collection.",
  },
  {
    id: "RT-006",
    hallmarkType: "wrong_venue",
    adaptation: "wrong_collection",
    tier: "Medium",
    claim: {
      id: "rt-006",
      text: "FABRICATED_HADITH_006: This citation assigns a hadith to the wrong collection.",
      quote: "FABRICATED_QUOTE_006: حَدِيثٌ مُخْتَلَقٌ فِي مَجْمُوعَةٍ خَاطِئَةٍ",
      citations: [citeWrongCollection()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The quote is fabricated and does not exist in the cited collection.",
  },
  {
    id: "RT-007",
    hallmarkType: "author_mismatch",
    adaptation: "misattributed_narrator",
    tier: "Medium",
    claim: {
      id: "rt-007",
      text: "FABRICATED_HADITH_007: This citation has a misattributed narrator.",
      quote: "FABRICATED_QUOTE_007: حَدِيثٌ مُخْتَلَقٌ بِرَاوٍ مُزَوَّرٍ",
      citations: [citeMisattributed()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The narrator attribution is fabricated and the quote is synthetic.",
  },
  {
    id: "RT-008",
    hallmarkType: "preprint_as_published",
    adaptation: "weak_grade_as_authentic",
    tier: "Medium",
    claim: {
      id: "rt-008",
      text: "FABRICATED_HADITH_008: This citation presents a weak grade as authentic.",
      quote: "FABRICATED_QUOTE_008: حَدِيثٌ مُخْتَلَقٌ بِدَرَجَةٍ ضَعِيفَةٍ",
      citations: [citeWeakAsAuthentic()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The grade 'Daif' is presented as authentic but the quote is fabricated.",
  },
  {
    id: "RT-009",
    hallmarkType: "hybrid_fabrication",
    adaptation: "hybrid_fabrication",
    tier: "Medium",
    claim: {
      id: "rt-009",
      text: "FABRICATED_HADITH_009: This citation combines real and fabricated metadata.",
      quote: "FABRICATED_QUOTE_009: حَدِيثٌ مُخْتَلَقٌ بِمَزْجٍ مِنَ الْحَقِيقِيِّ وَالزَّائِفِ",
      citations: [citeHybrid()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The metadata is hybrid (real collection + fabricated content) and the quote is synthetic.",
  },
  {
    id: "RT-010",
    hallmarkType: "merged_citation",
    adaptation: "merged_citation",
    tier: "Medium",
    claim: {
      id: "rt-010",
      text: "FABRICATED_HADITH_010: This citation merges content from multiple sources.",
      quote: "FABRICATED_QUOTE_010: حَدِيثٌ مُخْتَلَقٌ بِمَزْجِ مَصَادِرَ مُتَعَدِّدَةٍ",
      citations: [citeMerged()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The content is merged from multiple sources and the quote is fabricated.",
  },
  {
    id: "RT-011",
    hallmarkType: "partial_author_list",
    adaptation: "partial_quote",
    tier: "Medium",
    claim: {
      id: "rt-011",
      text: "FABRICATED_HADITH_011: This citation presents a partial quote as complete.",
      quote: "FABRICATED_QUOTE_011: حَدِيثٌ مُخْتَلَقٌ بِاقْتِبَاسٍ نَاقِصٍ",
      citations: [citePartial()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The quote is partial and presented as complete; the text is fabricated.",
  },
  {
    id: "RT-012",
    hallmarkType: "near_miss_title",
    adaptation: "near_miss_quote",
    tier: "Hard",
    claim: {
      id: "rt-012",
      text: "FABRICATED_HADITH_012: This citation is a near-miss quote off by 1-2 words.",
      quote: "FABRICATED_QUOTE_012: إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا رَجَى",
      citations: [citeNearMiss()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The quote is a near-miss (last word changed from نَوَى to رَجَى) and is not in the corpus.",
  },
  {
    id: "RT-013",
    hallmarkType: "plausible_fabrication",
    adaptation: "plausible_fabrication",
    tier: "Hard",
    claim: {
      id: "rt-013",
      text: "FABRICATED_HADITH_013: This citation is entirely fabricated but realistic.",
      quote: "FABRICATED_QUOTE_013: مَثَلُ الْمُؤْمِنِينَ فِي تَوَادِّهِمْ وَتَرَاحُمِهِمْ كَمَثَلِ الْجَسَدِ الْمُخْتَلَقِ",
      citations: [citePlausible()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The quote is entirely fabricated but sounds plausible; it is not in the corpus.",
  },
  {
    id: "RT-014",
    hallmarkType: "arxiv_version_mismatch",
    adaptation: "version_mismatch",
    tier: "Hard",
    claim: {
      id: "rt-014",
      text: "FABRICATED_HADITH_014: This citation has mixed metadata from different sources.",
      quote: "FABRICATED_QUOTE_014: حَدِيثٌ مُخْتَلَقٌ بِتَنَاقُضٍ فِي الْمَعْلُومَاتِ",
      citations: [citeVersionMismatch()],
    },
    expectedVerdict: "unverifiable",
    rationale: "The metadata is contradictory (grade 'Hasan' on a fabricated quote) and the text is synthetic.",
  },
]

export * as RedTeam from "./red-team-fixtures.ts"
