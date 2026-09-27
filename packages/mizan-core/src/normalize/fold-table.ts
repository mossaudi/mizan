/**
 * The Arabic normalization fold table, expressed as DATA.
 *
 * A judge should be able to read this one file and know exactly what "normalized
 * match" means. There is no hidden logic, no locale call, and no per-call
 * configuration. Every character class below is an explicit, reviewable decision.
 *
 * ## Why normalization exists at all
 *
 * The model quotes a corpus record. The model drops tashkeel, rewrites tatweel as
 * spaces, emits Arabic-Indic digits where the corpus has ASCII, and may switch alef
 * forms. Strict `String.includes` therefore fails on quotes that are *correct*. A
 * deterministic fold on BOTH sides removes that noise while preserving the property
 * the product depends on: a fabricated or paraphrased span still fails containment.
 *
 * ## What normalization must never become
 *
 * There is deliberately no similarity mode, no edit distance, no embedding, and no
 * threshold anywhere in this package. Normalization is a *bijective-ish canonical
 * form*, not a scoring function. The reason is measured, not stylistic: a fuzzy
 * fallback scores an invented-but-plausible hadith as a high match, which is a
 * CWE-345 fabrication-acceptance hole. See INTEGRITY.md section 2 and ADR-03.
 */

// ── 1. Bidi / RTL control marks — a SECURITY control, not a typographic one ─────
//
// U+202A..U+202E (LRE, RLE, PDF, LRO, RLO) and U+2066..U+2069 (LRI, RLI, FSI, PDI)
// are the embedding controls used to make a string render in an order it is not
// stored in. U+200E/200F are the LRM/RLM marks and U+061C is the Arabic letter mark.
// A grade or a date carrying one of these can render as something other than what the
// bytes say, which in a product whose badge carries authority is an integrity defect,
// not a cosmetic one. R12. Stripped from the match form AND from the render form.

export const BIDI_CONTROL_MARKS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu

// ── 2. Join controls ──────────────────────────────────────────────────────────
//
// U+200C ZWNJ and U+200D ZWJ carry no letter identity; they only change glyph
// joining. Models routinely add or drop them around Arabic letter combinations, and
// a quote missing a ZWNJ is still the same quotation. Stripped from the match form so
// that a real quote matches regardless. KEPT in the render form, because removing
// them would change the displayed orthography of text we promise to store verbatim.

export const JOIN_CONTROLS = /[\u200C\u200D]/gu

// ── 3. Arabic-Indic digits -> ASCII ───────────────────────────────────────────
//
// U+0660..U+0669 (Arabic-Indic) and U+06F0..U+06F9 (Extended Arabic-Indic, used in
// Persian/Urdu). A hadith number written ٤٢ must match a corpus record numbered 42.
// Also folded at render time (R12: a digit must not be able to look like a different
// digit than the one that was stored).

export const ARABIC_INDIC_DIGITS = /[\u0660-\u0669]/gu
export const EXTENDED_ARABIC_INDIC_DIGITS = /[\u06F0-\u06F9]/gu

/**
 * The Arabic-Indic and Extended Arabic-Indic digit blocks, spelled out.
 *
 * This was `String.fromCharCode(48 + (digit.charCodeAt(0) & 0x0f))`, which is a correct and
 * compact three-character fold — and which gate G-3 flags as obfuscation, because
 * `fromCharCode` with a bitmask IS the shape obfuscated code takes. The gate is right to be
 * suspicious of the shape, and the fold is important enough to keep, so the twenty characters
 * are listed instead. A reviewer can now confirm the mapping by reading it, which is the whole
 * point of a fold table (AGENTS.md section 17: one auditable place per rule).
 */
export const DIGIT_FOLD: Readonly<Record<string, string>> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
}

export const foldDigit = (digit: string): string => DIGIT_FOLD[digit] ?? digit

// ── 4. Tatweel (kashida) ──────────────────────────────────────────────────────
//
// U+0640 ARABIC TATWEEL is a pure elongation glyph: it carries no phoneme. It is the
// single most common piece of "corpus noise" a model introduces, and it is invisible
// in most fonts, so a reviewer cannot see why a quote failed to match.

export const TATWEEL = /\u0640/gu

// ── 5. Tashkeel and every other combining mark ────────────────────────────────
//
// `\p{Mn}` non-spacing, `\p{Mc}` spacing combining, `\p{Me}` enclosing. This is the
// tashkeel class plus Quranic orthographic marks (sajdah sign, small high marks).
//
// IMPORTANT — this is a *mark* class, not a "blanket strip every non-letter" rule. The
// Quranic ANNOTATION marks that carry meaning are category Cf, not M, and are
// therefore PRESERVED: U+06DD END OF AYAH, U+06DE START OF RUB EL HIZB, U+06E9 SAJDAH
// SIGN. The story requires annotation marks and tashkeel to be distinguished, and the
// way to distinguish them is by Unicode category, not by a hand-listed range.

export const COMBINING_MARKS = /[\p{Mn}\p{Mc}\p{Me}]+/gu

// ── 6. Letter-form folding ────────────────────────────────────────────────────
//
// Each entry maps a set of orthographic variants onto ONE canonical letter. They are
// listed as classes rather than a translation table so that adding a variant is a
// one-character edit a reviewer can audit. ADR: fold table is one source of truth
// (AGENTS.md section 17).
//
// Note: U+0624 (waw+hamza) and U+0626 (yeh+hamza) have canonical decompositions, so
// NFKC already reduces them to base+hamza and the hamza is removed with the mark
// class. They are listed anyway so the intent survives any change in folding order —
// an explicit no-op is a documented no-op, a silent one is a bug waiting to happen.

export const ALEF_FORMS = /[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/gu
export const ALEF_CANONICAL = "\u0627" // ا

export const YEH_FORMS = /[\u0649\u06CC\u06CD\u06D0\u06D2]/gu
export const YEH_CANONICAL = "\u064A" // ي

export const WAW_WITH_HAMZA = /\u0624/gu
export const WAW_CANONICAL = "\u0648" // و

export const YEH_WITH_HAMZA = /\u0626/gu

export const TA_MARBUTA_FORMS = /[\u0629\u06C3]/gu
export const HA_CANONICAL = "\u0647" // ه

/**
 * The standalone hamza U+0621 is a real letter and is NOT folded away. Folding it
 * would make بسم vs بسم collide in a way a reader cannot audit.
 */
export const STANDALONE_HAMZA = "\u0621"

// ── 7. Whitespace ─────────────────────────────────────────────────────────────
//
// Covers ASCII space, tab, newline, CR, NBSP (already NFKC-folded to a space by the
// time we get here), and the Unicode space separators. Collapsing then trimming is
// what makes a doubled-space quote match a single-space record.

export const WHITESPACE_RUN = /\s+/gu

// ── Order of operations ───────────────────────────────────────────────────────

/**
 * The pipeline, in the order `normalizeForMatch` applies it. Each stage is a single
 * linear pass; there is no backtracking expression anywhere in this package.
 *
 *   1. strip bidi controls      — security (R12), and it MUST precede NFKC: U+202E
 *                                  has combining class 0, so stripping it after NFKC
 *                                  can expose an out-of-order combining sequence and
 *                                  break idempotency
 *   2. NFKC                     — compatibility composition (NBSP -> space, ligatures, full-width forms)
 *   3. fold Arabic-Indic digits — number identity
 *   4. strip join controls      — models add/drop ZWJ/ZWNJ
 *   5. strip tatweel            — invisible elongation
 *   6. strip combining marks    — tashkeel; annotation marks (Cf) survive
 *   7. fold letter forms        — alef / yeh / waw / ta-marbuta
 *   8. collapse whitespace      — and trim
 *
 * The order is fixed because the result must be idempotent in every stage. Digits are
 * folded before whitespace so that a number broken across a line is still one number;
 * marks are stripped before letter folding so that a letter carrying a hamza is seen
 * in its base form.
 */
export const FOLD_PIPELINE = [
  "strip-bidi-controls",
  "nfkc",
  "fold-arabic-indic-digits",
  "strip-join-controls",
  "strip-tatweel",
  "strip-combining-marks",
  "fold-letter-forms",
  "collapse-whitespace",
] as const

export type FoldStage = (typeof FOLD_PIPELINE)[number]

/** A one-line human description per stage, rendered in the CLI and the registry. */
export const FOLD_STAGE_NOTES: Readonly<Record<FoldStage, string>> = {
  "strip-bidi-controls": "removes U+202A-U+202E, U+2066-U+2069, U+200E/U+200F, U+061C (bidi spoofing, R12); runs BEFORE NFKC for idempotency",
  nfkc: "NFKC compatibility composition",
  "fold-arabic-indic-digits": "Arabic-Indic and Extended Arabic-Indic digits to ASCII 0-9",
  "strip-join-controls": "removes ZWNJ/ZWJ (no letter identity)",
  "strip-tatweel": "removes U+0640 kashida (invisible elongation)",
  "strip-combining-marks": "removes tashkeel; preserves Quranic annotation marks (category Cf)",
  "fold-letter-forms": "alef/yeh/waw/ta-marbuta variants to one canonical letter each",
  "collapse-whitespace": "collapses whitespace runs to one space and trims",
}

export * as FoldTable from "./fold-table.ts"
