import { ArabicRoot, ArabicStem, ArabicLemma, decodeOrFail, decodeSync } from "@mizan/core"
import { isQuranicRoot, validateRoot, DECLARED_QURANIC_ROOT_COUNT } from "./roots.ts"

/**
 * Arabic Morphological Analyzer — Dual-Stemmer Cross-Check
 *
 * This module provides display-only morphological analysis for Arabic text.
 * It is NOT in the verdict path (G-1.1: @mizan/verify cannot import this).
 *
 * ## Dual-Stemmer Architecture
 *
 * Two independent stemmers produce candidate roots:
 *
 * 1. **Pattern Stemmer** (algorithmic): Strips known Arabic prefixes/suffixes
 *    following standard morphological patterns to derive a candidate root.
 *    Handles: definite article "الـ", form prefixes (استـ، انـ، اتـ، تـ،
 *    متـ، مستـ), subject/object pronouns, plural markers.
 *    Note: This is an affix stripper, not a full awzan-based morphological
 *    analyzer. It does not reduce derived forms to triliteral roots
 *    (e.g., "عالم" -> "علم" requires pattern recognition not implemented).
 *
 * 2. **Dictionary Stemmer** (lookup): Validates the pattern stemmer's output
 *    against the tool's Quranic root dictionary (272 roots; ~1,651 per
 *    classical scholarship). Only roots present in the dictionary are accepted.
 *
 * A root is returned ONLY when both stemmers agree. The delta (cases where
 * they disagree) is recorded and published in the measurement artefact.
 * The current agreement rate is ~0% due to dictionary size and stemmer limitations.
 *
 * ## Display-Only Guarantee
 *
 * This module's output populates `CorpusRecord.root`/`stem`/`lemma` fields
 * for coverage reporting. It never influences a verdict. The verifier
 * (@mizan/verify) uses strict normalized substring containment only.
 */

// Arabic letters regex
const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

// Arabic punctuation to strip from tokens
const ARABIC_PUNCTUATION = /[\u060C\u061B\u061F\u066A-\u066D\u06D4\u002C\u002E\u003A\u003B\u003F\u0021\u0028\u0029\u005B\u005D\u007B\u007D\u0022\u0027\u0060]/

// Common Arabic prefixes (ordered by length, longest first)
// Note: "م" is REMOVED - it is part of form VII/X patterns (مفعول، مستفعل), not a standalone prefix
const PREFIXES = [
  "ال",           // definite article
  "بال", "فال", "كال", "وال", "لل", // preposition + al
  "واست", "فاست", "باست", "كاست", // wa/fa/bi/ka + ist
  "وان", "فان", "بان", "كان", // wa/fa/bi/ka + an
  "وات", "فات", "بات", "كات", // wa/fa/bi/ka + at
  "است", "ان", "ات", "افت", // form prefixes
  "مت", "مست",     // passive/participle prefixes (form VIII, X)
  "ي", "ت", "ن", "أ", // imperfect prefixes
  "س", "فس", "ول", "فل", // future/emphatic
  "ف", "ب", "ك", "و", "ل", // prepositions
]

// Common Arabic suffixes (ordered by length, longest first) - deduplicated
// Note: "ة" (ta marbuta) and "ت" as feminine markers are NOT stripped here -
// they are part of the word's morphology and require form-aware handling
const SUFFIXES = [
  "ون", "ين", "ان", // sound masculine/dual plural
  "ات", // feminine plural
  "هما", "هم", "هن", "كم", "كن", "نا", // attached pronouns
  "ه", "ها", "ي", "ني", // singular pronouns (includes nisba ي)
  "ية", "يات", // additional noun suffixes
]

/**
 * Pattern Stemmer: algorithmic root extraction by stripping affixes.
 * Iteratively strips all matching prefixes and suffixes (longest first).
 * This is a simplified implementation; a full version would handle all 15 awzan.
 */
function patternStemmer(word: string): string | null {
  let candidate = word.trim()

  // Strip ALL matching prefixes (longest first, iteratively)
  let prefixStripped = true
  while (prefixStripped) {
    prefixStripped = false
    for (const prefix of PREFIXES) {
      if (candidate.startsWith(prefix) && candidate.length > prefix.length + 1) {
        candidate = candidate.slice(prefix.length)
        prefixStripped = true
        break // Restart from longest prefix
      }
    }
  }

  // Strip ALL matching suffixes (longest first, iteratively)
  let suffixStripped = true
  while (suffixStripped) {
    suffixStripped = false
    for (const suffix of SUFFIXES) {
      if (candidate.endsWith(suffix) && candidate.length > suffix.length + 1) {
        candidate = candidate.slice(0, -suffix.length)
        suffixStripped = true
        break // Restart from longest suffix
      }
    }
  }

  // Must have 2-5 Arabic letters to be a valid root candidate
  if (candidate.length < 2 || candidate.length > 5) return null
  if (!ARABIC_LETTER.test(candidate)) return null

  return candidate
}

/**
 * Dictionary Stemmer: validates candidate against authoritative root list.
 */
function dictionaryStemmer(candidate: string): string | null {
  if (isQuranicRoot(candidate)) {
    return candidate
  }
  return null
}

/**
 * Result of the dual-stemmer cross-check.
 */
export type DualStemmerResult = {
  /** The agreed-upon root, or null if stemmers disagree. */
  readonly root: string | null
  /** Pattern stemmer's candidate. */
  readonly patternCandidate: string | null
  /** Dictionary stemmer's validation. */
  readonly dictionaryMatch: boolean
  /** Whether the two stemmers agreed. */
  readonly agreed: boolean
}

/**
 * Run the dual-stemmer cross-check on a single word.
 */
export const extractRoot = (word: string): DualStemmerResult => {
  const patternCandidate = patternStemmer(word)
  const dictionaryMatch = patternCandidate !== null && isQuranicRoot(patternCandidate)
  const agreed = dictionaryMatch
  const root = agreed ? patternCandidate : null

  return {
    root,
    patternCandidate,
    dictionaryMatch,
    agreed,
  }
}

/**
 * Extract stem from a word (the form after removing inflectional affixes only).
 * The stem retains derivational morphology but removes inflectional endings.
 */
export const extractStem = (word: string): string | null => {
  let candidate = word.trim()

  // Remove only inflectional suffixes (case, mood, pronoun)
  const inflectionalSuffixes = ["ون", "ين", "ان", "هما", "هم", "هن", "كم", "كن", "نا", "ه", "ها", "ي", "ني"]
  for (const suffix of inflectionalSuffixes) {
    if (candidate.endsWith(suffix) && candidate.length > suffix.length + 1) {
      candidate = candidate.slice(0, -suffix.length)
      break
    }
  }

  if (candidate.length < 2 || candidate.length > 20) return null
  if (!ARABIC_LETTER.test(candidate)) return null

  return candidate
}

/**
 * Extract lemma (dictionary/citation form).
 * For verbs: 3rd person masculine singular past (fa'ala).
 * For nouns: singular nominative indefinite.
 *
 * LIMITATION: This is a stub implementation that returns the stem.
 * A full implementation would require a comprehensive Arabic morphological
 * analyzer with form-specific mappings (e.g., fa'ala -> fa'il for active participle).
 * This limitation is documented per ADR-22 (measurement artefact only).
 */
export const extractLemma = (word: string): string | null => {
  // Stub: return the stem as lemma
  // A full implementation would map to citation forms per Arabic morphology
  const stem = extractStem(word)
  return stem
}

/**
 * Analyze a full text string and extract morphology for each word.
 * Returns arrays of roots/stems/lemmas aligned with word positions.
 */
export const analyzeText = (text: string): {
  readonly roots: readonly (string | null)[]
  readonly stems: readonly (string | null)[]
  readonly lemmas: readonly (string | null)[]
  readonly dualStemmerStats: { readonly agreed: number; readonly disagreed: number; readonly total: number }
} => {
  // Split on whitespace and punctuation, keep Arabic words
  // Strip leading/trailing Arabic punctuation from each token
  const words = text
    .split(/[\s\p{P}]+/u)
    .map((w) => w.replace(ARABIC_PUNCTUATION, ""))
    .filter((w) => w.length > 0 && ARABIC_LETTER.test(w))

  const roots: (string | null)[] = []
  const stems: (string | null)[] = []
  const lemmas: (string | null)[] = []
  let agreed = 0
  let disagreed = 0

  for (const word of words) {
    const rootResult = extractRoot(word)
    const stem = extractStem(word)
    const lemma = extractLemma(word)

    roots.push(rootResult.root)
    stems.push(stem)
    lemmas.push(lemma)

    if (rootResult.agreed) agreed += 1
    else if (rootResult.patternCandidate !== null) disagreed += 1
  }

  return {
    roots,
    stems,
    lemmas,
    dualStemmerStats: { agreed, disagreed, total: words.length },
  }
}

/**
 * Measurement artefact for root coverage.
 * Published by `bun run eval:roots` (to be created).
 */
export type RootCoverageArtefact = {
  readonly schemaVersion: 1
  readonly generatedBy: string
  readonly corpusFingerprint: string
  readonly declaredRootCount: number
  readonly rootsFound: number
  readonly coveragePercent: string
  readonly dualStemmer: {
    readonly totalWords: number
    readonly agreed: number
    readonly disagreed: number
    readonly agreementRate: string
  }
  readonly conditions: {
    readonly corpus: string
    readonly stemmerVersion: string
    readonly dictionaryVersion: string
  }
  readonly note: string
}

/**
 * Build the root coverage measurement artefact.
 * This is a MEASUREMENT ONLY - no index ships (ADR-22).
 */
export const buildRootCoverageArtefact = (
  corpusFingerprint: string,
  stats: { readonly totalWords: number; readonly agreed: number; readonly disagreed: number },
  rootsFound: number
): RootCoverageArtefact => {
  const coveragePercent = DECLARED_QURANIC_ROOT_COUNT > 0
    ? `${Math.round((rootsFound / DECLARED_QURANIC_ROOT_COUNT) * 1000) / 10}%`
    : "0%"

  const agreementRate = stats.totalWords > 0
    ? `${Math.round((stats.agreed / stats.totalWords) * 1000) / 10}%`
    : "0%"

  return {
    schemaVersion: 1,
    generatedBy: "bun run eval:roots",
    corpusFingerprint,
    declaredRootCount: DECLARED_QURANIC_ROOT_COUNT,
    rootsFound,
    coveragePercent,
    dualStemmer: {
      totalWords: stats.totalWords,
      agreed: stats.agreed,
      disagreed: stats.disagreed,
      agreementRate,
    },
    conditions: {
      corpus: corpusFingerprint,
      stemmerVersion: "pattern+dictionary:v1",
      dictionaryVersion: `quranic-roots-${DECLARED_QURANIC_ROOT_COUNT}`,
    },
    note: "MEASUREMENT ARTEFACT ONLY. No index ships. Root coverage is a measurement of dictionary alignment, not a retrieval feature (ADR-22).",
  }
}

export * as Analyzer from "./analyzer.ts"