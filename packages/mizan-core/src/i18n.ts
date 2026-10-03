import { err, ok, type Result } from "./result.ts"

/**
 * Internationalization (i18n) support for mizan.
 *
 * ## What this module does
 *
 * Provides language detection, validation, and RTL support for questions
 * in 25+ languages. The verification itself is language-agnostic — it
 * operates on the corpus content, not the question language.
 *
 * ## Design decisions
 *
 * - **Script-first language detection.** Every character is mapped to a script via
 *   exclusive Unicode ranges; the dominant script wins. Kana is exclusive to Japanese,
 *   so any kana character means Japanese even when the text also contains kanji.
 * - **Word-boundary marker matching.** Multi-character markers are matched as whole
 *   words: the characters immediately before and after a match must not be letters.
 *   This prevents short markers like "wa" from matching inside "what". Single-character
 *   markers are exclusive script-specific letters (e.g. Urdu "ہ") and are matched as
 *   substrings.
 * - **Verification is language-agnostic.** The verifier checks citations against the
 *   corpus regardless of the question language.
 * - **Input validation.** All input is validated against injection attempts regardless
 *   of language.
 * - **RTL support.** Arabic, Hebrew, and other RTL languages are detected and flagged
 *   for proper rendering.
 *
 * ## Security
 *
 * - A03 (Injection): All input is validated. Malicious payloads are
 *   rejected regardless of language.
 * - No external dependencies. No network calls. No clock.
 */

/** A supported language. */
export type Language = {
  /** ISO 639-1 code. */
  readonly code: string
  /** English name. */
  readonly name: string
  /** Native name. */
  readonly nativeName: string
  /** Whether this language is RTL. */
  readonly rtl: boolean
  /** Unicode character ranges for detection. */
  readonly ranges: readonly (readonly [number, number])[]
  /** Marker characters that distinguish this language from others sharing the same script. */
  readonly markers: readonly string[]
}

/**
 * All supported languages (25+).
 *
 * Marker conventions:
 * - Arabic-script languages use single-character markers: letters that exist ONLY in
 *   that language's orthography (e.g. Urdu "ہ" U+06C1, never used in Persian).
 * - Latin and Cyrillic languages use whole-word markers: function words and
 *   diacritic-distinctive words that disambiguate within the script.
 * - Script-exclusive languages (Bengali, Hindi, Chinese, Japanese, Korean, Thai, ...)
 *   need no markers: the script alone identifies them.
 */
export const SUPPORTED_LANGUAGES: readonly Language[] = [
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true, ranges: [[0x0600, 0x06FF]], markers: [] },
  { code: "en", name: "English", nativeName: "English", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["the", "is", "what", "of", "and", "are", "was", "were", "does", "did", "how", "why", "when", "which", "who", "this", "that", "with", "for", "from", "have", "has", "had", "not", "but", "all", "can", "will", "would", "could", "should", "about", "into", "over", "after", "also", "its", "your", "their", "there", "here", "where"] },
  { code: "ur", name: "Urdu", nativeName: "اردو", rtl: true, ranges: [[0x0600, 0x06FF]], markers: ["ہ", "ڑ", "ں", "کا", "کیا", "کے", "ہے", "ہیں", "یہ", "ایک"] },
  { code: "fa", name: "Persian", nativeName: "فارسی", rtl: true, ranges: [[0x0600, 0x06FF]], markers: ["پاداش", "چیست", "این", "یک", "است"] },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["ve", "bir", "için", "ile", "bu", "da", "de", "mi", "mı", "mu", "mü", "nedir", "çok", "daha", "ama", "fakat", "gibi", "kadar", "sonra", "önce"] },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["yang", "dengan", "untuk", "pada", "adalah", "tidak", "akan", "juga", "apa", "dari", "ini", "itu", "penting", "saya", "kami", "kita", "mereka", "bisa", "ada"] },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["yang", "dengan", "untuk", "pada", "daripada", "adalah", "tidak", "akan", "juga", "boleh", "anda", "kami", "kita", "mereka", "ada", "ini", "itu", "apa", "saya"] },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", rtl: false, ranges: [[0x0980, 0x09FF]], markers: [] },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", rtl: false, ranges: [[0x0900, 0x097F]], markers: ["का", "क्या", "है", "यह", "एक", "महत्वपूर्ण", "प्रश्न", "फल", "और", "के", "की", "से", "में", "हैं"] },
  { code: "mr", name: "Marathi", nativeName: "मराठी", rtl: false, ranges: [[0x0900, 0x097F]], markers: ["चा", "ची", "चे", "काय", "आहे", "हा", "ही", "महत्त्वाचा", "प्रश्न", "आणि", "वर", "कडे", "पासून"] },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", rtl: false, ranges: [[0x0A00, 0x0A7F]], markers: [] },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", rtl: false, ranges: [[0x0B80, 0x0BFF]], markers: [] },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", rtl: false, ranges: [[0x0C00, 0x0C7F]], markers: [] },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", rtl: false, ranges: [[0x0A80, 0x0AFF]], markers: [] },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", rtl: false, ranges: [[0x0C80, 0x0CFF]], markers: [] },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", rtl: false, ranges: [[0x0D00, 0x0D7F]], markers: [] },
  { code: "si", name: "Sinhala", nativeName: "සිංහල", rtl: false, ranges: [[0x0D80, 0x0DFF]], markers: [] },
  { code: "th", name: "Thai", nativeName: "ไทย", rtl: false, ranges: [[0x0E00, 0x0E7F]], markers: [] },
  { code: "lo", name: "Lao", nativeName: "ລາວ", rtl: false, ranges: [[0x0E80, 0x0EFF]], markers: [] },
  { code: "my", name: "Burmese", nativeName: "မြန်မာ", rtl: false, ranges: [[0x1000, 0x109F]], markers: [] },
  { code: "km", name: "Khmer", nativeName: "ខ្មែរ", rtl: false, ranges: [[0x1780, 0x17FF]], markers: [] },
  { code: "zh", name: "Chinese", nativeName: "中文", rtl: false, ranges: [[0x4E00, 0x9FFF]], markers: [] },
  { code: "ja", name: "Japanese", nativeName: "日本語", rtl: false, ranges: [[0x3040, 0x309F], [0x30A0, 0x30FF]], markers: [] },
  { code: "ko", name: "Korean", nativeName: "한국어", rtl: false, ranges: [[0xAC00, 0xD7AF]], markers: [] },
  { code: "ru", name: "Russian", nativeName: "Русский", rtl: false, ranges: [[0x0400, 0x04FF]], markers: [] },
  { code: "fr", name: "French", nativeName: "Français", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["le", "la", "les", "des", "est", "une", "dans", "pour", "qui", "sur", "avec", "plus", "très", "cette", "quelle", "récompense", "question", "important", "importante"] },
  { code: "de", name: "German", nativeName: "Deutsch", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["der", "die", "das", "und", "ist", "ein", "eine", "nicht", "mit", "auf", "was", "von", "zu", "den", "dem", "einer", "einem", "wichtige", "frage"] },
  { code: "es", name: "Spanish", nativeName: "Español", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["el", "la", "los", "las", "es", "una", "con", "por", "para", "qué", "cómo", "pero", "más", "este", "esta", "recompensa", "pregunta", "importante", "cuál"] },
  { code: "pt", name: "Portuguese", nativeName: "Português", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["que", "não", "uma", "com", "para", "como", "mais", "este", "esta", "das", "dos", "qual", "recompensa", "pergunta", "importante", "são", "está"] },
  { code: "it", name: "Italian", nativeName: "Italiano", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["delle", "opere", "domanda", "questo", "questa", "sono", "molto", "più", "dove", "quando", "nella", "nel", "alla", "ricompensa", "importante", "quale"] },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["de", "het", "een", "is", "van", "op", "met", "niet", "dat", "dit", "wat", "voor", "aan", "zijn", "belangrijke", "vraag"] },
  { code: "pl", name: "Polish", nativeName: "Polski", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["jest", "się", "nie", "na", "to", "za", "do", "od", "jak", "tak", "ale", "czy", "gdy", "który", "ważne", "pytanie", "jaka"] },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", rtl: false, ranges: [[0x0400, 0x04FF]], markers: ["яка", "це", "вчинки", "що", "як", "коли", "де", "тут", "є", "ї", "ґ", "і"] },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["na", "ya", "wa", "kwa", "ni", "za", "hii", "hayo", "mwenye", "wenye", "kwenye", "nini", "sana", "hakuna", "kila"] },
  { code: "ha", name: "Hausa", nativeName: "Hausa", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["mai", "yin", "aiki", "mene", "ne", "wannan", "tambaya", "ce", "muhimmi", "da", "ga"] },
  { code: "so", name: "Somali", nativeName: "Soomaali", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["waa", "maxay", "abaalguudka", "camalka", "tani", "su'aal", "muhiim", "ah", "waxaa", "iyo", "waxaan", "jiraa", "sidee"] },
  { code: "am", name: "Amharic", nativeName: "አማርኛ", rtl: false, ranges: [[0x1200, 0x137F]], markers: [] },
  { code: "he", name: "Hebrew", nativeName: "עברית", rtl: true, ranges: [[0x0590, 0x05FF]], markers: [] },
  { code: "ps", name: "Pashto", nativeName: "پښتو", rtl: true, ranges: [[0x0600, 0x06FF]], markers: ["ښ", "ږ", "ځ", "څ", "ډ", "ړ", "ګ", "ڼ"] },
  { code: "sd", name: "Sindhi", nativeName: "سنڌي", rtl: true, ranges: [[0x0600, 0x06FF]], markers: ["ڙ", "ڪ", "ڳ", "ڱ", "ڻ", "ھ", "ڀ", "ٺ", "ٿ", "ٽ", "ٹ", "ڇ", "آهي", "هڪ", "جو"] },
  { code: "ug", name: "Uyghur", nativeName: "ئۇيغۇرچە", rtl: true, ranges: [[0x0600, 0x06FF]], markers: ["ۇ", "ۆ", "ۈ", "ۋ", "ې", "ە", "ڭ"] },
  { code: "kk", name: "Kazakh", nativeName: "Қазақ", rtl: false, ranges: [[0x0400, 0x04FF]], markers: ["қандай", "бұл", "маңызды", "сұрақ", "қалай", "үшін", "бір", "іс-әрекеттердің", "сыйлығы", "болып", "көп", "өте", "қайда", "қашан", "неге", "кім"] },
  { code: "uz", name: "Uzbek", nativeName: "Oʻzbek", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["nima", "muhim", "savol", "amalning", "mukofoti", "uchun", "bilan", "va", "bir", "emas", "qanday", "shu", "qancha"] },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycan", rtl: false, ranges: [[0x0041, 0x005A], [0x0061, 0x007A]], markers: ["nədir", "vacib", "sualdır", "amalin", "mükafatı", "və", "üçün", "ilə", "də", "ki", "bu", "bir", "mı", "mi", "qanday", "hansı"] },
]

/**
 * The number of supported languages.
 *
 * A published figure, and one that has already been published wrong: a Sprint 2 deliverable claimed
 * 45 while the table held 44. `test/i18n.test.ts` pins this to the exact number rather than a floor,
 * so adding a language fails the suite until the published count moves with it.
 */
export const LANGUAGE_COUNT = SUPPORTED_LANGUAGES.length

/** Script names for grouping languages. */
type ScriptName = "arabic" | "latin" | "cyrillic" | "devanagari" | "bengali" | "gurmukhi" | "gujarati" | "tamil" | "telugu" | "kannada" | "malayalam" | "sinhala" | "thai" | "lao" | "burmese" | "khmer" | "chinese" | "japanese" | "korean" | "amharic" | "hebrew" | "other"

/** Map each language to its script. */
const languageScript = (lang: Language): ScriptName => {
  const [start] = lang.ranges[0]!
  if (start >= 0x0600 && start <= 0x06FF) return "arabic"
  if (start >= 0x0041 && start <= 0x007A) return "latin"
  if (start >= 0x0400 && start <= 0x04FF) return "cyrillic"
  if (start >= 0x0900 && start <= 0x097F) return "devanagari"
  if (start >= 0x0980 && start <= 0x09FF) return "bengali"
  if (start >= 0x0A00 && start <= 0x0A7F) return "gurmukhi"
  if (start >= 0x0A80 && start <= 0x0AFF) return "gujarati"
  if (start >= 0x0B80 && start <= 0x0BFF) return "tamil"
  if (start >= 0x0C00 && start <= 0x0C7F) return "telugu"
  if (start >= 0x0C80 && start <= 0x0CFF) return "kannada"
  if (start >= 0x0D00 && start <= 0x0D7F) return "malayalam"
  if (start >= 0x0D80 && start <= 0x0DFF) return "sinhala"
  if (start >= 0x0E00 && start <= 0x0E7F) return "thai"
  if (start >= 0x0E80 && start <= 0x0EFF) return "lao"
  if (start >= 0x1000 && start <= 0x109F) return "burmese"
  if (start >= 0x1780 && start <= 0x17FF) return "khmer"
  if (start >= 0x4E00 && start <= 0x9FFF) return "chinese"
  if (start >= 0x3040 && start <= 0x309F) return "japanese"
  if (start >= 0x30A0 && start <= 0x30FF) return "japanese"
  if (start >= 0xAC00 && start <= 0xD7AF) return "korean"
  if (start >= 0x1200 && start <= 0x137F) return "amharic"
  if (start >= 0x0590 && start <= 0x05FF) return "hebrew"
  return "other"
}

/**
 * Map a Unicode code point to its script.
 *
 * Ranges are exclusive per script: kana maps to Japanese (never Chinese), CJK
 * ideographs map to Chinese, and so on. Returns null for characters outside every
 * tracked script (digits, punctuation, untracked scripts).
 */
const scriptForCode = (code: number): ScriptName | null => {
  if (code >= 0x3040 && code <= 0x30FF) return "japanese"
  if (code >= 0x4E00 && code <= 0x9FFF) return "chinese"
  if (code >= 0xAC00 && code <= 0xD7AF) return "korean"
  if (code >= 0x0600 && code <= 0x06FF) return "arabic"
  if (code >= 0x0590 && code <= 0x05FF) return "hebrew"
  if (code >= 0x0400 && code <= 0x04FF) return "cyrillic"
  if (code >= 0x0900 && code <= 0x097F) return "devanagari"
  if (code >= 0x0980 && code <= 0x09FF) return "bengali"
  if (code >= 0x0A00 && code <= 0x0A7F) return "gurmukhi"
  if (code >= 0x0A80 && code <= 0x0AFF) return "gujarati"
  if (code >= 0x0B80 && code <= 0x0BFF) return "tamil"
  if (code >= 0x0C00 && code <= 0x0C7F) return "telugu"
  if (code >= 0x0C80 && code <= 0x0CFF) return "kannada"
  if (code >= 0x0D00 && code <= 0x0D7F) return "malayalam"
  if (code >= 0x0D80 && code <= 0x0DFF) return "sinhala"
  if (code >= 0x0E00 && code <= 0x0E7F) return "thai"
  if (code >= 0x0E80 && code <= 0x0EFF) return "lao"
  if (code >= 0x1000 && code <= 0x109F) return "burmese"
  if (code >= 0x1780 && code <= 0x17FF) return "khmer"
  if (code >= 0x1200 && code <= 0x137F) return "amharic"
  if (code >= 0x0041 && code <= 0x007A) return "latin"
  return null
}

/**
 * Detect the dominant script of a text.
 *
 * Every character is counted, so a Japanese sentence that begins with a kanji
 * still detects as Japanese when kana appear later. Kana is exclusive to
 * Japanese: any kana character means Japanese, regardless of kanji count.
 */
const detectScript = (text: string): ScriptName | null => {
  const counts = new Map<ScriptName, number>()
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code === undefined) continue
    const script = scriptForCode(code)
    if (script !== null) {
      counts.set(script, (counts.get(script) ?? 0) + 1)
    }
  }
  if (counts.size === 0) return null
  if ((counts.get("japanese") ?? 0) > 0) return "japanese"
  let best: ScriptName | null = null
  let bestCount = 0
  for (const [script, count] of counts) {
    if (count > bestCount) {
      best = script
      bestCount = count
    }
  }
  return best
}

/** The default language for each script. */
const scriptDefaults: Record<ScriptName, string> = {
  arabic: "ar",
  latin: "en",
  cyrillic: "ru",
  devanagari: "hi",
  bengali: "bn",
  gurmukhi: "pa",
  gujarati: "gu",
  tamil: "ta",
  telugu: "te",
  kannada: "kn",
  malayalam: "ml",
  sinhala: "si",
  thai: "th",
  lao: "lo",
  burmese: "my",
  khmer: "km",
  chinese: "zh",
  japanese: "ja",
  korean: "ko",
  amharic: "am",
  hebrew: "he",
  other: "en",
}

/** Check if a character is a letter, for word-boundary matching. */
const isLetterChar = (ch: string | undefined): boolean => {
  if (ch === undefined) return false
  return /\p{L}/u.test(ch)
}

/**
 * Count occurrences of a marker in text.
 *
 * Single-character markers are exclusive script-specific letters (e.g. Urdu "ہ"),
 * so a substring match is correct: the character cannot occur in another
 * language's text. Multi-character markers are whole words: the characters
 * immediately before and after a match must not be letters, so "wa" does not
 * match inside "what" and "ya" does not match inside "yang".
 */
const countMarker = (text: string, marker: string): number => {
  const lowerText = text.toLowerCase()
  const lowerMarker = marker.toLowerCase()
  let count = 0
  let index = 0
  while (true) {
    const found = lowerText.indexOf(lowerMarker, index)
    if (found === -1) break
    const before = found > 0 ? lowerText[found - 1] : undefined
    const after = found + lowerMarker.length < lowerText.length ? lowerText[found + lowerMarker.length] : undefined
    const isWordMatch = lowerMarker.length === 1 || (!isLetterChar(before) && !isLetterChar(after))
    if (isWordMatch) count += 1
    index = found + 1
  }
  return count
}

/**
 * How a language was decided.
 *
 * ## Why this is a value and not a comment
 *
 * The detector is a marker heuristic, and a marker heuristic cannot separate languages whose markers
 * overlap. Malay and Indonesian share "yang", "dan", "di", "ke", "dengan"; a question written in
 * either scores identically, and one written in both scores for both. Arabic and Urdu share "ال",
 * "من", "في"; Persian and Urdu share "از", "و", "که". The old code resolved such a tie by taking
 * whichever language the `SUPPORTED_LANGUAGES` table happened to list first, which is a fact about
 * this file's array order, and printed it with the same confidence as a marker that only one language
 * in the world has.
 *
 * That is the defect §16 names for every other surface in this repository: a value presented as
 * measured when it was defaulted. So the tie is no longer invisible. It is reported, the header says
 * so, and `Detection` returns the code AND the reason for it in one call so the two cannot disagree.
 *
 * - `marker` — one language's markers matched strictly more often than every other candidate's.
 * - `ambiguous-markers` — several candidates tied at the top. The code is the table-order winner,
 *   which is arbitrary among the tied set, and the CLI says so on the same line as the code.
 * - `script-default` — no candidate matched any marker, so the script's default was used. An Arabic
 *   question with no marker is extremely common — `كم عدد الصلوات` has none of "ال" as a whole word —
 *   so this is a frequent case, not an edge case, and calling it a detection would be a lie.
 * - `sole-script-language` — the script has exactly one supported language, so there was nothing to
 *   choose between. Honesty costs one word here and buys an unqualified claim.
 */
export type DetectionBasis = "marker" | "ambiguous-markers" | "script-default" | "sole-script-language"

/** A detected language, and the evidence it was detected from. Both, or neither is useful. */
export type Detection = {
  readonly code: string
  readonly basis: DetectionBasis
}

/** The codes that tied for the highest marker score, in table order. Empty when nothing matched. */
type TiedCandidates = readonly string[]

/**
 * Score every candidate of the script, and report which of them tied.
 *
 * The tie is returned rather than resolved because resolving it is a presentation decision, not a
 * measurement: two languages that scored the same have both been matched equally well, and pretending
 * otherwise is the defect `DetectionBasis` exists to prevent. A tie of zero is not a tie — it is the
 * case where nothing matched, which is the script default's trigger rather than an ambiguity.
 *
 * Order is preserved from `candidates`, so `tied[0]` is the table-order winner among equals without
 * this function having to choose.
 */
const tieCandidates = (text: string, candidates: readonly Language[]): TiedCandidates => {
  const scores = candidates.map((lang) => lang.markers.reduce((total, marker) => total + countMarker(text, marker), 0))
  const top = Math.max(...scores)
  if (top === 0) return []
  return candidates.filter((_, index) => scores[index] === top).map((lang) => lang.code)
}

/**
 * Detect the language of a text, and why that answer and not another.
 *
 * Two stages, unchanged: the dominant script decides which languages are even candidates, and
 * whole-word markers choose among them. What is new is that the second stage no longer reports a
 * table-order accident as a finding.
 *
 * Deterministic, as before: the same input always produces the same output. The `ambiguous-markers`
 * winner is the tied candidate the table lists first, so the output is stable across runs while the
 * `basis` says it is one of several equally supported answers.
 */
export const detectLanguageWithBasis = (text: string): Detection | null => {
  if (text.length === 0) return null

  const detectedScript = detectScript(text)
  if (detectedScript === null) return null

  const candidates = SUPPORTED_LANGUAGES.filter((lang) => languageScript(lang) === detectedScript)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return { code: candidates[0]!.code, basis: "sole-script-language" }

  const tied = tieCandidates(text, candidates)
  if (tied.length === 0) {
    return { code: scriptDefaults[detectedScript] ?? "en", basis: "script-default" }
  }

  // `tied[0]` is the table-order winner among equals: arbitrary, stable, and declared as arbitrary
  // by the basis. Determinism is preserved; over-claiming is not.
  return { code: tied[0]!, basis: tied.length === 1 ? "marker" : "ambiguous-markers" }
}

/**
 * Detect the language of a text.
 *
 * The code alone, for callers that have no surface to declare the basis on. It delegates rather than
 * reimplementing, because two detectors are two answers to "which language is this" (AGENTS.md §17).
 */
export const detectLanguage = (text: string): string | null => detectLanguageWithBasis(text)?.code ?? null

/**
 * Check if a language is supported.
 */
export const isSupportedLanguage = (code: string): boolean =>
  SUPPORTED_LANGUAGES.some((lang) => lang.code === code)

/**
 * Get a language by code.
 */
export const getLanguage = (code: string): Language | null =>
  SUPPORTED_LANGUAGES.find((lang) => lang.code === code) ?? null

/**
 * Check if a language is RTL.
 */
export const isRtlLanguage = (code: string): boolean => {
  const lang = getLanguage(code)
  return lang?.rtl ?? false
}

/**
 * The longest question `processQuestion` will look at, in UTF-16 code units.
 *
 * Declared once, because two literals in two functions are two answers to "how long may a question
 * be" and they were `10_000` and `10_000` written twice — the agreement was luck, not a rule.
 */
export const MAX_QUESTION_LENGTH = 10_000

/**
 * Patterns that mark a question as a payload rather than a question.
 *
 * ## Why none of these is a bare SQL keyword
 *
 * The previous list rejected `\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b` and
 * `\b(eval|exec|system|spawn|child_process)\b` on sight. Those are English words: "Explain the
 * system of prayer in Islam", "What did the Prophet create according to the hadith?" and "How do I
 * delete a bookmark in this app?" are all questions a person might actually type, and all three
 * were refused as injection attempts. A filter that rejects the word "delete" is not a security
 * control, it is a refusal with a security label on it.
 *
 * ## What makes a SQL string a SQL string
 *
 * Vocabulary plus structure. `DROP` alone is a verb; `DROP TABLE users` is a statement. So each SQL
 * pattern below requires the keyword in the position SQL puts it in — the object it acts on, or the
 * clause it belongs to — and the payload classes that need no grammar (`javascript:`, `<script`,
 * `${...}`, `{{...}}`, `<%...%>`) are matched on their own because nothing legitimate produces them.
 *
 * ## Why this stays a defence in depth, not the defence
 *
 * The question never becomes SQL. Retrieval uses parameterised statements against `bun:sqlite`, and
 * `packages/mizan-corpus` builds every query from a constant template with bound values. This list is
 * the outer layer of OWASP A03, and the inner layer is the one that cannot be talked past.
 */
const PAYLOAD_PATTERNS: readonly RegExp[] = [
  // Markup and URL-context payloads: nothing a question legitimately contains.
  /<script/i,
  /javascript:/i,
  /<\/\s*script/i,
  /\bon(?:load|error|click|mouseover|focus|submit)\s*=/i,
  // Template interpolation: `{{…}}`, `${…}`, `<%…%>`.
  /\{\{[^}]*\}\}/,
  /\$\{[^}]*\}/,
  /<%[^%]*%>/,
  // SQL, in the shape SQL puts each keyword in.
  /\bSELECT\b[^;]*\bFROM\b/i,
  /\bSELECT\b[^;]*\bWHERE\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bCREATE\s+TABLE\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bUPDATE\b[^;]*\bSET\b/i,
  /\bUNION\s+(?:ALL\s+)?SELECT\b/i,
  /\b(?:ATTACH|DETACH)\s+DATABASE\b/i,
  /\bPRAGMA\b/i,
  // Command execution, in call position. "The system of prayer" is not a call.
  /\b(?:eval|exec|execSync|spawn|spawnSync|child_process)\s*\(/,
  /\brequire\s*\(\s*['"]child_process['"]/,
  /\bprocess\s*\.\s*env\b/,
]

/**
 * Validate a question for injection attempts.
 *
 * Returns true if the question appears safe, false if it contains
 * potential injection patterns.
 *
 * This is language-agnostic: it checks for common injection patterns
 * regardless of the question language.
 */
export const validateQuestion = (question: string): boolean => {
  if (question.length === 0) return false
  if (question.length > MAX_QUESTION_LENGTH) return false
  return !PAYLOAD_PATTERNS.some((pattern) => pattern.test(question))
}

/**
 * Process a question in any supported language.
 *
 * Returns the detected language code, whether the question is valid, and how the language was
 * decided. The verification itself is language-agnostic — this function decides nothing that reaches
 * a verdict, which is exactly why a heuristic may be its input as long as the heuristic's own
 * uncertainty is passed on rather than dropped here.
 */
export const processQuestion = (question: string): Result<
  { readonly language: string; readonly rtl: boolean; readonly valid: boolean; readonly basis: DetectionBasis },
  string
> => {
  if (question.length === 0) {
    return err("question is empty")
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return err(`question exceeds maximum length of ${MAX_QUESTION_LENGTH} characters`)
  }

  const detected = detectLanguageWithBasis(question)
  if (detected === null) {
    return err("could not detect question language")
  }

  if (!isSupportedLanguage(detected.code)) {
    return err(`unsupported language: ${detected.code}`)
  }

  const valid = validateQuestion(question)
  if (!valid) {
    return err("question contains potential injection patterns")
  }

  const rtl = isRtlLanguage(detected.code)
  return ok({ language: detected.code, rtl, valid, basis: detected.basis })
}

/**
 * Get all RTL language codes.
 */
export const rtlLanguages: readonly string[] = SUPPORTED_LANGUAGES
  .filter((lang) => lang.rtl)
  .map((lang) => lang.code)

/**
 * Get all LTR language codes.
 */
export const ltrLanguages: readonly string[] = SUPPORTED_LANGUAGES
  .filter((lang) => !lang.rtl)
  .map((lang) => lang.code)

export * as I18n from "./i18n.ts"
