import type { Citation, Claim } from "@mizan/core"

/**
 * The 14 HALLMARK-type red-team fixtures — one declaration, read by the tests AND by the benchmark
 * harness.
 *
 * ## Why this lives in `src/` and not in `test/`
 *
 * It began as `test/red-team-fixtures.ts`, which is the wrong place for a fact two packages need.
 * `scripts/benchmark.ts` reached into `packages/mizan-verify/test/` to read it, so the harness's
 * definition of "the 14 HALLMARK types" was invisible to `@mizan/verify`'s manifest, unreachable
 * outside this repository, and would die with a fixture rename instead of with a contract change. A
 * test directory is not a dependency: what a consumer imports has to be importable.
 *
 * `test/red-team-fixtures.ts` is kept as a re-export so the Sprint 1 tests that already import that
 * path keep resolving, and there is exactly one `RED_TEAM_FIXTURES` binding in the repository (§17).
 *
 * ## What these are
 *
 * Each fixture is a fabricated citation that must NEVER produce a `verified` verdict. They are
 * adapted from the HALLMARK benchmark's 14 hallucination types to mizan's religious content domain
 * (Qur'an/hadith citation verification).
 *
 * ## Security: no real hadith content
 *
 * All fabricated text is clearly synthetic (prefixed with "FABRICATED_"). No real hadith or Qur'an
 * text is used. The fixtures are never loaded into corpus.db, and `test/red-team.test.ts` asserts
 * the `FABRICATED` marker on every one of them — a fixture that lost the marker fails the suite
 * rather than quietly becoming a real citation in a test corpus.
 *
 * ## DISCLOSURE — the Sprint 1 fixtures cited collections this snapshot does not ship
 *
 * The 14 fixtures were re-pointed at identifiers the corpus actually holds, and that change was not
 * disclosed when it was made. Stating it plainly, because a benchmark whose inputs were quietly
 * re-pointed measures a different thing than the one it was declared to measure:
 *
 * - **Sprint 1**: 11 of the 14 fixtures cited `bukhari:1` or `muslim:1`. `data/corpus.db` ships
 *   `quran`, `nasai`, `abudawud`, `ibnmajah`, `tirmidhi` and `malik` — it does **not** ship
 *   `bukhari` or `muslim`. Every one of those 11 therefore resolved to zero records, so the
 *   containment arm of the suite never ran: the suite reported 14/14 "correct" while 11 of the 14
 *   measured only that an absent identifier is refused.
 * - **Sprint 2**: those 11 cite real records, spread over **11 distinct identifiers across 6
 *   collections**, so each now earns `rejected (quote_absent_at_cited_id)` — the verdict that says
 *   "this source exists and it does not contain this quote", which is the claim the red team exists
 *   to defend.
 *
 * Three fixtures are left on the resolution arm on purpose, because "an identifier we cannot resolve
 * is refused rather than guessed at" is a separate property and deserves its own cases: RT-001 (real
 * collection, number far past its end), RT-002 (no such collection), RT-005 (real collection, number
 * that does not exist).
 *
 * The 11 cases that used to be trivially `unverifiable` are the reason the Sprint 1 suite was weaker
 * than it read. Eleven, not ten: `docs/hallmark-coverage-matrix.md` was corrected in the same pass.
 *
 * ## HALLMARK taxonomy mapping
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

/**
 * The taxonomy, as the single ordered list every reader checks against.
 *
 * Published here rather than declared per reader: `test/hallmark-coverage.test.ts` used to hold its
 * own copy of these 14 strings, which is a second answer to "what are the HALLMARK types" that can
 * agree with the fixtures while being wrong about the paper (AGENTS.md section 17). A coverage test
 * that enumerates the taxonomy from the same place the fixtures are built cannot detect a type that
 * was never implemented — which is precisely the gap it exists to close.
 */
export const HALLMARK_TYPES = [
  "fabricated_doi",
  "nonexistent_venue",
  "placeholder_authors",
  "future_date",
  "chimeric_title",
  "wrong_venue",
  "author_mismatch",
  "preprint_as_published",
  "hybrid_fabrication",
  "merged_citation",
  "partial_author_list",
  "near_miss_title",
  "plausible_fabrication",
  "arxiv_version_mismatch",
] as const

/** One HALLMARK hallucination type. */
export type HallmarkType = (typeof HALLMARK_TYPES)[number]

/** Difficulty tier for each HALLMARK type. */
export type DifficultyTier = "Easy" | "Medium" | "Hard"

/** A red-team fixture: a fabricated claim that must not verify. */
export type RedTeamFixture = {
  /** Unique identifier (RT-001 to RT-014). */
  readonly id: string
  /** The HALLMARK type this fixture exercises. */
  readonly hallmarkType: HallmarkType
  /** The mizan-specific adaptation name. */
  readonly adaptation: string
  /** Difficulty tier from the HALLMARK taxonomy. */
  readonly tier: DifficultyTier
  /** The fabricated claim. */
  readonly claim: Claim
  /**
   * The verdict this fixture earns **against the attested corpus snapshot**, never `verified`.
   *
   * ## Why the field is snapshot-relative, and why that matters
   *
   * The verifier has two distinct refusals, and which one a fixture earns is decided by whether its
   * citation RESOLVES:
   *
   *  - `unverifiable (identifier_unresolved)` — the collection or number is not in the snapshot at
   *    all (RT-001, RT-002, RT-005).
   *  - `rejected (quote_absent_at_cited_id)` — the identifier resolves to a real record and the
   *    fabricated quote is not a span of it (RT-003, RT-004, RT-006 … RT-014).
   *
   * Declaring `unverifiable` across the board — which this file did, and which the coverage matrix
   * then excused as "a `rejected` verdict is also acceptable" — is the metric being looser than its
   * name. `scripts/benchmark.ts` scores a case as passed only when the verdict EQUALS this field, so
   * a permissive declaration is a benchmark that fails on correct behaviour: 11 of 14 red-team cases
   * reported as failures while the verifier was right.
   *
   * `test/red-team.test.ts` deliberately runs with EMPTY evidence, where nothing can resolve, so it
   * observes `unverifiable` for all 14. That is the stricter configuration and it asserts the
   * property that must hold in both: never `verified`. The declared verdict below is what the
   * snapshot-relative measurement must reproduce.
   */
  readonly expectedVerdict: "unverifiable" | "rejected"
  /** Why this fixture must not verify. */
  readonly rationale: string
}

/**
 * A citation to a real collection at a number that does not exist in it.
 *
 * `tirmidhi`, not `bukhari`: the collection resolves and the NUMBER does not, so the case measures
 * the identifier refusal instead of accidentally measuring a collection this snapshot does not ship.
 */
const citeNonexistent = (): Citation => ({
  collection: "tirmidhi",
  number: "999999",
  grade: null,
  raw: "tirmidhi:999999",
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
  collection: "tirmidhi",
  number: "1",
  grade: "Sahih",
  raw: "tirmidhi:1",
})

/** A citation with anachronistic attribution. */
const citeAnachronistic = (): Citation => ({
  collection: "nasai",
  number: "1",
  grade: "صحيح",
  raw: "nasai:1",
})

/** A chimeric citation: real collection + fabricated number. */
const citeChimeric = (): Citation => ({
  collection: "tirmidhi",
  number: "0",
  grade: null,
  raw: "tirmidhi:0",
})

/** A citation to the wrong collection. */
const citeWrongCollection = (): Citation => ({
  collection: "abudawud",
  number: "1",
  grade: null,
  raw: "abudawud:1",
})

/** A citation with misattributed narrator. */
const citeMisattributed = (): Citation => ({
  collection: "ibnmajah",
  number: "1",
  grade: null,
  raw: "ibnmajah:1",
})

/** A citation presenting a weak grade as authentic. */
const citeWeakAsAuthentic = (): Citation => ({
  collection: "malik",
  number: "1",
  grade: "Daif",
  raw: "malik:1",
})

/** A hybrid fabrication: real record + fabricated content. */
const citeHybrid = (): Citation => ({
  collection: "quran",
  number: "1",
  grade: null,
  raw: "quran:1",
})

/** A merged citation: content from multiple sources. */
const citeMerged = (): Citation => ({
  collection: "tirmidhi",
  number: "2",
  grade: null,
  raw: "tirmidhi:2",
})

/** A partial quote presented as complete. */
const citePartial = (): Citation => ({
  collection: "nasai",
  number: "2",
  grade: null,
  raw: "nasai:2",
})

/** A near-miss quote: a real hadith with one word changed. */
const citeNearMiss = (): Citation => ({
  collection: "abudawud",
  number: "2",
  grade: null,
  raw: "abudawud:2",
})

/** A plausible fabrication: entirely invented but realistic. */
const citePlausible = (): Citation => ({
  collection: "ibnmajah",
  number: "2",
  grade: null,
  raw: "ibnmajah:2",
})

/** A version mismatch: mixed metadata from different sources. */
const citeVersionMismatch = (): Citation => ({
  collection: "malik",
  number: "2",
  grade: "Hasan",
  raw: "malik:2",
})

/**
 * All 14 red-team fixtures.
 *
 * Each fixture is a fabricated claim that must NOT produce a `verified` verdict. The fabricated text
 * is clearly synthetic and never contains real hadith content.
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
    rationale: "The hadith number 999999 does not exist in tirmidhi, the collection that does resolve, so the citation cannot resolve.",
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
    expectedVerdict: "rejected",
    rationale:
      "The cited id resolves to a real record and the quote beside it is not a span of that record. A placeholder grade does not make a fabricated quote authentic.",
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
    expectedVerdict: "rejected",
    rationale: "The attribution is anachronistic and the quote is fabricated, so the cited record does not contain it.",
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
    rationale: "Tirmidhi is a collection the snapshot holds, but hadith number 0 does not exist in it. A real collection paired with a fabricated number resolves to nothing.",
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
    expectedVerdict: "rejected",
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
    expectedVerdict: "rejected",
    rationale: "The narrator attribution is fabricated and the quote is synthetic, so the cited record does not contain it.",
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
    expectedVerdict: "rejected",
    rationale: "The grade 'Daif' is presented as authentic but the quote is fabricated and absent at the cited id.",
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
    expectedVerdict: "rejected",
    rationale: "A real Qur'anic record cited with fabricated quote text: the metadata is genuine and the content beside it is not.",
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
    expectedVerdict: "rejected",
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
    expectedVerdict: "rejected",
    rationale: "The quote is partial and presented as complete; the whole span is fabricated.",
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
    expectedVerdict: "rejected",
    rationale: "A near-miss of the cited record (a word changed, so it is not a contiguous span) and marked as fabricated. It is the case a fuzzy matcher is most likely to wave through.",
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
    expectedVerdict: "rejected",
    rationale: "The quote is entirely fabricated but sounds plausible; it is not a span of the cited record.",
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
    expectedVerdict: "rejected",
    rationale: "The metadata is contradictory (grade 'Hasan' on a fabricated quote) and the text is absent at the cited id.",
  },
]

export * as RedTeam from "./red-team.ts"