import { ADJUDICATED_CASE_IDS } from "./adjudication.ts"

/**
 * The 66 human-drawn anchor spans — the input that makes step 5b of `verify.ts` reachable.
 *
 * ## Why these are literals, and why not inside adjudication.ts
 *
 * `CLAIM_ANCHOR_TEXTS` is data a person accepted responsibility for, exactly like the rulings in
 * `adjudication.ts`, which links to this file rather than re-exporting it — a re-export would make
 * the two modules import each other for the sake of a convenience the pointer already gives. It
 * lives in its own module for one mechanical reason: 66 entries push `adjudication.ts` past the
 * 300-line ceiling, and splitting a decision table across two FILES would be worse than splitting
 * it across two MODULES. `apps/cli/test/eval.test.ts` guards both modules from importing
 * `@mizan/verify`, because a span chosen by running the verifier would be an expectation recorded
 * by the code it measures.
 *
 * ## What a span is, and what it is not
 *
 * Each value is 3-8 words cut verbatim from that case's own `quote`, so it is a normalized
 * substring of the claim by construction. It is accepted only when the folded window is also a
 * CONTIGUOUS substring of the cited record's folded text, which is exactly what arm A of
 * `locateAnchor` searches for — so the span locates by construction while the VERDICT it produces
 * is still measured by the real verifier, never assumed. A window that runs through a mutated word
 * or through an elision's ellipsis is not contiguous in the source and is therefore never chosen,
 * which is why no span crosses either.
 *
 * ## What activating this map costs, published rather than implied
 *
 * Attaching a span moves a fabrication from `rejected` to `unverifiable` — never to `verified`,
 * because `anchoredOutcome`'s return type admits only `unverifiable` or `null`. That movement is
 * the count `redTeamMovement.rejectedToUnverifiable` publishes in
 * `data/eval/adjudication.json`, and `apps/cli/test/eval.test.ts` asserts the observed movement
 * against it. If a span here ever stops locating, the observed count falls short, the test fails
 * naming the case, and the fix is a redrawn span — never a loosened locator or a lowered count.
 *
 * 66 entries: the 40 red-team fabrications and the 26 golden elisions, keyed by case id, and
 * nothing else. `ADJUDICATED_CASE_IDS` is the authority on which ids those are.
 */

/**
 * case id -> 3-8 words of real source text drawn from that case's quote.
 *
 * A record rather than a map so the literal diff is readable line by line, which is the only way
 * a review will ever catch a span drawn from the wrong case.
 */
export const CLAIM_ANCHOR_TEXTS: Readonly<Record<string, string>> = {
  "redteam-001": "الصَّوْتِ لِلذِّكْرِ حِينَ يَنْصَرِفُ النَّاسُ مِنَ الْمَكْتُوبَةِ كَانَ",
  "redteam-002": "اللَّهِ صلى الله عليه وسلم إِحْدَى صَلاَتَىِ الْعَشِيِّ",
  "redteam-003": "فَأَسْبِغِ الْوُضُوءَ ثُمَّ اسْتَقْبِلِ الْقِبْلَةَ",
  "redteam-004": "سَأَلْتُ عُمَرَ بْنَ الْخَطَّابِ قُلْتُ لَيْسَ عَلَيْكُمْ جُنَاحٌ",
  "redteam-005": "وَتَظْهَرُ الْفِتَنُ وَيُلْقَى الشُّحُّ وَيَكْثُرُ الْهَرْجُ",
  "redteam-006": "الرَّجْمَ فَافْتَدَيْتُ مِنْهُ بِمِائَةِ شَاةٍ وَبِجَارِيَةٍ لِي ثُمَّ",
  "redteam-007": "أَلاَ أُخْبِرُكَ بِخَيْرِ مَا يَكْنِزُ الْمَرْءُ",
  "redteam-008": "مِنْ بَيْتِ زَوْجِهَا غَيْرَ مُفْسِدَةٍ كَانَ لَهَا أَجْرُ",
  "redteam-009": "رَأَى حُلَّةً سِيَرَاءَ - يَعْنِي تُبَاعُ عِنْدَ بَابِ",
  "redteam-010": "رَسُولَ اللَّهِ صلى الله عليه وسلم نَهَى عَنِ",
  "redteam-011": "أَبُو لُبَابَةَ فَاتَّبَعْنَاهُ حَتَّى دَخَلَ بَيْتَهُ فَدَخَلْنَا عَلَيْهِ",
  "redteam-012": "إِنَّهُ لَيْسَ لَكَ حَجٌّ فَقَالَ ابْنُ عُمَرَ أَلَيْسَ",
  "redteam-013": "إِبْرَاهِيمُ وَالْوَهْمُ مِنِّي - فَقِيلَ لَهُ يَا",
  "redteam-014": "فَقَالَ لَهُ رَجُلٌ يُقَالُ لَهُ ذُو الْيَدَيْنِ يَا",
  "redteam-015": "رَجُلٌ طَوِيلُ الْيَدَيْنِ يُسَمَّى ذَا الْيَدَيْنِ فَقَالَ يَا",
  "redteam-016": "الْحُجْرَةَ فَقَامَ الْخِرْبَاقُ رَجُلٌ بَسِيطُ الْيَدَيْنِ فَنَادَى يَا",
  "redteam-017": "اللَّهِ ـ صلى الله عليه وسلم ـ يَرْفَعُ",
  "redteam-018": "اللَّهِ ـ صلى الله عليه وسلم ـ فَحَضَرْتُ",
  "redteam-019": "اللَّهِ هَذَا السَّلاَمُ عَلَيْكَ قَدْ عَرَفْنَاهُ فَكَيْفَ",
  "redteam-020": "عَلَيْكَ فَكَيْفَ نُصَلِّي عَلَيْكَ فَقَالَ",
  "redteam-021": "صلى الله عليه وسلم كَانَ إِذَا ذَهَبَ الْمَذْهَبَ",
  "redteam-022": "نَهَى رَسُولُ اللَّهِ صلى الله عليه وسلم أَنْ",
  "redteam-023": "جَاءَنَا رَسُولُ اللَّهِ صلى الله عليه وسلم فَأَخْرَجْنَا",
  "redteam-024": "دَخَلَ عَلَيْنَا رَسُولُ اللَّهِ صلى الله عليه وسلم",
  "redteam-025": "أَمَرَنَا النَّبِيُّ صلى الله عليه وسلم أَنْ نَرُدَّ",
  "redteam-026": "عَنِ الأَعْمَشِ عَنْ أَبِي صَالِحٍ عَنْ أَبِي هُرَيْرَةَ",
  "redteam-027": "يَزَالُ طَائِفَةٌ مِنْ أُمَّتِي عَلَى الْحَقِّ مَنْصُورِينَ لاَ",
  "redteam-028": "أَهْلِ الْجَنَّةِ مِنَ الأَوَّلِينَ وَالآخِرِينَ إِلاَّ النَّبِيِّينَ",
  "redteam-029": "مَوْلَى بَنِي هَاشِمٍ وَطَلْقُ بْنُ حَبِيبٍ عَنِ ابْنِ",
  "redteam-030": "وَكَذَلِكَ رَوَاهُ مَعْقِلٌ الْخَثْعَمِيُّ عَنْ عَلِيٍّ رَضِيَ اللَّهُ",
  "redteam-031": "إِذَا بِيعَتْ. لِأَنَّ ذلِكَ غَرَرٌ. لاَ يُدْرَى أَذَكَرٌ",
  "redteam-032": "بِيعَتْ. لِأَنَّ ذلِكَ غَرَرٌ. لاَ يُدْرَى أَذَكَرٌ هُوَ",
  "redteam-033": "النَّبِيَّ صلى الله عليه وسلم كَانَ إِذَا ذَهَبَ",
  "redteam-034": "نَهَى رَسُولُ اللَّهِ صلى الله عليه وسلم أَنْ",
  "redteam-035": "جَاءَنَا رَسُولُ اللَّهِ صلى الله عليه وسلم فَأَخْرَجْنَا",
  "redteam-036": "دَخَلَ عَلَيْنَا رَسُولُ اللَّهِ صلى الله عليه وسلم",
  "redteam-037": "أَمَرَنَا النَّبِيُّ صلى الله عليه وسلم أَنْ نَرُدَّ",
  "redteam-038": "شَرِيكٌ عَنِ الأَعْمَشِ عَنْ أَبِي صَالِحٍ عَنْ أَبِي",
  "redteam-039": "يَزَالُ طَائِفَةٌ مِنْ أُمَّتِي عَلَى الْحَقِّ مَنْصُورِينَ لاَ",
  "redteam-040": "وَ بَكْرٍ وَعُمَرُ سَيِّدَا كُهُولِ أَهْلِ الْجَنَّةِ مِنَ",
  "golden-095": "أَنَّ النَّبِيَّ صلى الله",
  "golden-096": "قَالَ نَهَى رَسُولُ اللَّهِ صلى",
  "golden-097": "قَالَ جَاءَنَا رَسُولُ اللَّهِ صلى",
  "golden-098": "قَالَ دَخَلَ عَلَيْنَا رَسُولُ اللَّهِ",
  "golden-099": "قَالَ أَمَرَنَا النَّبِيُّ صلى الله",
  "golden-100": "حَدَّثَنَا شَرِيكٌ عَنِ الأَعْمَشِ",
  "golden-101": "لاَ يَزَالُ طَائِفَةٌ مِنْ أُمَّتِي",
  "golden-102": "أَبُو بَكْرٍ وَعُمَرُ سَيِّدَا كُهُولِ",
  "golden-103": "بَيْنَ السَّوَارِي عَلَى عَهْدِ رَسُولِ",
  "golden-104": "عَلِيِّ بْنِ شَيْبَانَ - وَكَانَ",
  "golden-105": "أَخَّرَ الصَّلاَةَ يَوْمًا فَدَخَلَ عَلَيْهِ",
  "golden-106": "أَنَّهُ قَالَ كُنَّا نُصَلِّي الْعَصْرَ",
  "golden-107": "كَانَ إِذَا اغْتَسَلَ مِنَ الْجَنَابَةِ",
  "golden-108": "أَنَّهُ قَالَ الْغَزْوُ غَزْوَانِ فَغَزْوٌ",
  "golden-109": "أَنَّ رَسُولَ اللَّهِ صلى الله",
  "golden-110": "إِذَا اسْتَيْقَظَ أَحَدُكُمْ مِنْ نَوْمِهِ",
  "golden-111": "خَمْسٌ مِنَ الْفِطْرَةِ قَصُّ",
  "golden-112": "سَالِمٌ سَبَلاَنُ قَالَ وَكَانَتْ عَائِشَةُ",
  "golden-113": "قَالَ صَلَّيْتُ مَعَ رَسُولِ اللَّهِ",
  "golden-114": "قَالَ كَانَ رَسُولُ اللَّهِ صلى",
  "golden-115": "ٱلَّذِينَ يُؤْمِنُونَ بِٱلْغَيْبِ وَيُقِيمُونَ",
  "golden-116": "وَإِذْ أَخَذْنَا مِيثَٰقَكُمْ وَرَفَعْنَا فَوْقَكُمُ",
  "golden-117": "وَبَيْنَهُمَا حِجَابٌ وَعَلَى ٱلْأَعْرَافِ رِجَالٌ",
  "golden-118": "وَإِذَا صُرِفَتْ أَبْصَٰرُهُمْ تِلْقَآءَ أَصْحَٰبِ",
  "golden-119": "وَنَادَىٰٓ أَصْحَٰبُ ٱلْأَعْرَافِ رِجَالًا يَعْرِفُونَهُم",
  "golden-120": "وَأَبُو الْمَلِيحِ بْنُ أُسَامَةَ اسْمُهُ",
}

/** The exact set of cases an anchor is attached to. Nothing else may carry one. */
export const ANCHORED_CASE_IDS: readonly string[] = Object.keys(CLAIM_ANCHOR_TEXTS).sort()

/** The table must cover the adjudicated set exactly: no missing span, no span on an unruled case. */
export const anchorCoverageProblems = (): readonly string[] => {
  const ruled = new Set(ADJUDICATED_CASE_IDS)
  const problems: string[] = []
  for (const caseId of ADJUDICATED_CASE_IDS) {
    if (CLAIM_ANCHOR_TEXTS[caseId] === undefined) problems.push(`anchor-texts: no span for ${caseId}, which the ruling table decides`)
  }
  for (const caseId of ANCHORED_CASE_IDS) {
    if (!ruled.has(caseId)) problems.push(`anchor-texts: ${caseId} carries a span but the ruling table does not decide it`)
  }
  return problems
}

export * as AnchorTexts from "./anchor-texts.ts"
