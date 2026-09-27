import { normalizeForMatch, type Citation, type Claim, type CorpusRecord } from "@mizan/core"

/**
 * Test fixtures — a tiny hand-built corpus, deliberately NOT fetched.
 *
 * Tests that read the network are tests that fail on a train. These records are the real
 * openings of well-known texts, stored with a grade exactly as a dataset would assert it, so
 * the verifier's behaviour can be pinned without a snapshot, a network, or a clock.
 *
 * The grade values are the point of including them: a `verified` verdict must be identical
 * whether the record is graded, ungraded, or Qur'anic, because `grade` never participates in
 * the decision. A test that asserts that explicitly is a test against ADR-06.
 */

const record = (over: Partial<CorpusRecord> & Pick<CorpusRecord, "id" | "collection" | "textDisplay">): CorpusRecord => {
  const collection = over.collection
  const isQuran = collection === "quran"
  return {
    id: over.id,
    collection,
    number: over.number ?? null,
    grade: over.grade ?? null,
    gradeApplicable: over.gradeApplicable ?? !isQuran,
    gradeSource: over.gradeSource ?? "quranlab/hadith",
    gradeBasis: over.gradeBasis ?? "none",
    attribution: over.attribution ?? "Hadith: quranlab/hadith via sunnah.com",
    license: over.license ?? "CC BY-SA 4.0",
    licenseUrl: over.licenseUrl ?? "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: over.sourceUrl ?? "https://example.invalid/hadith",
    textDisplay: over.textDisplay,
    textMatch: normalizeForMatch(over.textDisplay),
    translation: over.translation,
  }
}

export const BUKHARI_1 = record({
  id: "bukhari:1",
  collection: "bukhari",
  number: "1",
  grade: "صحيح",
  gradeBasis: "collection",
  textDisplay: "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى",
})

export const BUKHARI_2 = record({
  id: "bukhari:2",
  collection: "bukhari",
  number: "2",
  grade: "صحيح",
  gradeBasis: "collection",
  textDisplay: "بَدَأَ الْإِسْلَامُ بِالْفَرِيضَتَيْنِ وَالشَّهَادَتَيْنِ",
})

/** Same number 1, different collection — the case that must not produce a false `rejected`. */
export const MUSLIM_1 = record({
  id: "muslim:1",
  collection: "muslim",
  number: "1",
  attribution: "Hadith: quranlab/hadith via sunnah.com",
  textDisplay: "بَيْنَمَا نَحْنُ نُطَاوِعُ الْمَوْكَأَ فَقَالَ لَنَا رَسُولُ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ",
})

export const QURAN_2_255 = record({
  id: "quran:2:255",
  collection: "quran",
  number: "255",
  gradeApplicable: false,
  gradeBasis: "none",
  gradeSource: "tanzil/quran-uthmani",
  attribution: "Qur'an text: Tanzil",
  license: "Tanzil terms — no derivatives",
  licenseUrl: "https://tanzil.net/",
  sourceUrl: "https://tanzil.net/quran/",
  textDisplay: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
})

/** An ungraded record: the dataset asserts no grade, and the product says so rather than defaulting one. */
export const BUKHARI_UNGRADED = record({
  id: "bukhari:9999",
  collection: "bukhari",
  number: "9999",
  textDisplay: "مَثَلُ الْمُؤْمِنِينَ فِي تَوَادِّهِمْ وَتَرَاحُمِهِمْ كَمَثَلِ الْجَسَدِ",
})

export const ALL_RECORDS: readonly CorpusRecord[] = [BUKHARI_1, BUKHARI_2, MUSLIM_1, QURAN_2_255, BUKHARI_UNGRADED]

export const SNAPSHOT_HASH = "f".repeat(64)

/** A citation as a model would write it. */
export const cite = (collection: string, number: string | null, grade: string | null = null): Citation => ({
  collection,
  number,
  grade,
  raw: `${collection}:${number ?? "—"}`,
})

/** A claim as a model would write it: prose opinion plus a falsifiable quoted span. */
export const claim = (id: string, quote: string | null, citations: readonly Citation[], text = "prose"): Claim => ({
  id,
  text,
  quote,
  citations: [...citations],
})

/**
 * A model that paraphrases instead of quoting. It is a faithful, correct, well-meaning answer
 * — and there is nothing to verify, so the honest verdict is not "wrong".
 */
export const PARAPHRASE = "الأعمال تُبنى على النوايا"

/** An English gloss of the same hadith. The verifier does not read English, and says so. */
export const GLOSS = "The reward of deeds depends upon the intentions"

/**
 * A fabricated hadith: it *sounds* right, shares most of its characters with the real record,
 * and is not in the corpus. The last line is the highest-entropy change in the sentence.
 */
export const FABRICATION = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا رَجَى"
