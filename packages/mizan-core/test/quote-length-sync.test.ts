import { describe, it, expect } from "bun:test"
import { normalizeForMatch, MIN_VERIFIABLE_QUOTE_CHARS, isQuoteTooShort as coreIsQuoteTooShort } from "@mizan/core"

/**
 * Quote length sync test - ensures web and core implementations produce identical results.
 * 
 * This test verifies that the browser implementation in apps/web/refusal-block.js
 * matches the Node.js implementation in @mizan/core/src/render/refusal-block.ts.
 * 
 * Both implementations MUST:
 * 1. Apply Arabic normalization (fold)
 * 2. Remove whitespace and diacritics
 * 3. Count remaining Arabic characters
 * 4. Compare against MIN_VERIFIABLE_QUOTE_CHARS (15)
 * 
 * If you modify one implementation, you MUST update the other and verify this test passes.
 */

// Replicate the NEW web implementation logic here for testing
// This MUST match apps/web/refusal-block.js:normalizeForMatchWeb exactly
function webIsQuoteTooShort(quote: string, minChars: number = MIN_VERIFIABLE_QUOTE_CHARS): boolean {
  const folded = normalizeForMatchWeb(quote);
  // Count non-whitespace characters (matching core: .replace(/[\s\p{M}]/gu, ""))
  // After normalizeForMatch, no combining marks remain, so just remove whitespace
  const arabicChars = folded.replace(/\s+/gu, "");
  return arabicChars.length < minChars
}

/** Test copy of apps/web/refusal-block.js:normalizeForMatchWeb - MUST stay in sync. */
function normalizeForMatchWeb(input: string): string {
  let value = input;
  
  // Stage 1: strip-bidi-controls (MUST run before NFKC for idempotency)
  value = value.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, "");
  
  // Stage 2: nfkc - NFKC compatibility composition
  value = value.normalize("NFKC");
  
  // Stage 3: fold-arabic-indic-digits
  value = value.replace(/[\u0660-\u0669]/gu, (d: string) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30));
  value = value.replace(/[\u06F0-\u06F9]/gu, (d: string) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 0x30));
  
  // Stage 4: strip-join-controls - ZWNJ (U+200C) and ZWJ (U+200D)
  value = value.replace(/[\u200C\u200D]/gu, "");
  
  // Stage 5: strip-tatweel - U+0640 kashida
  value = value.replace(/\u0640/gu, "");
  
  // Stage 6: strip-combining-marks - all Unicode combining marks (category M)
  value = value.replace(/[\p{Mn}\p{Mc}\p{Me}]+/gu, "");
  
  // Stage 7: fold-letter-forms
  value = value.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/gu, "\u0627");
  value = value.replace(/[\u0649\u06CC\u06CD\u06D0\u06D2]/gu, "\u064A");
  value = value.replace(/\u0624/gu, "\u0648");
  value = value.replace(/\u0626/gu, "\u064A");
  value = value.replace(/[\u0629\u06C3]/gu, "\u0647");
  
  // Stage 8: collapse-whitespace - collapse runs to single space and trim
  value = value.replace(/\s+/gu, " ").trim();
  
  return value;
}

function coreIsQuoteTooShortDirect(quote: string): boolean {
  const folded = normalizeForMatch(quote)
  const arabicChars = folded.replace(/[\s\p{M}]/gu, "")
  return arabicChars.length < MIN_VERIFIABLE_QUOTE_CHARS
}

describe("Quote Length Sync - Web vs Core parity", () => {
const testCases: readonly [string, boolean, string][] = [
    // (quote, expectedResult, description)
    // Note: expectedResult = true means "too short" (isQuoteTooShort returns true)
    // Core normalizeForMatch produces folded strings; we count non-whitespace chars
    ["إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ", false, "Valid hadith quote (well above 15 chars)"],
    ["قُلْ هُوَ اللَّهُ أَحَدٌ", true, "Quran quote - folds to 11 chars (below 15)"],
    ["إِنَّمَا", true, "Too short - only 6 Arabic chars"],
    ["الْأَعْمَالُ", true, "Too short - only 9 Arabic chars (with diacritics)"],
    ["بِسْمِ اللَّهِ", true, "Too short - 9 Arabic chars"],
    ["", true, "Empty string"],
    ["   ", true, "Whitespace only"],
    ["إِنَّمَا الْأَعْمَالُ", true, "Folds to 11 chars (below 15)"],
    ["قُلْ هُوَ اللَّهُ أَحَدٌ اللَّهُ الصَّمَدُ", false, "Longer Quran quote (folds to 17+)"],
    ["أَحَدٌ", true, "Very short - 4 Arabic chars"],
    ["مُحَمَّدٌ رَسُولُ اللَّهِ", true, "Folds to 12 chars (below 15)"],
    ["اللَّهَ", true, "Too short - 5 Arabic chars"],
    ["اللَّهُ أَكْبَرُ", true, "Folds to 8 chars (below 15)"],
    // Add more edge cases
    ["\u064E\u064F\u0650", true, "Only diacritics"],
    ["ا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا", true, "14 alifs with diacritics (folds to 14, below 15)"],
    ["ا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا\u064Eا", true, "13 alifs with diacritics (below 15)"],
  ]

  for (const [quote, expected, description] of testCases) {
    it(`matches for: ${description} - "${quote.slice(0, 30)}${quote.length > 30 ? "..." : ""}"`, () => {
      const coreResult = coreIsQuoteTooShortDirect(quote)
      const webResult = webIsQuoteTooShort(quote)
      expect(coreResult).toBe(expected)
      expect(webResult).toBe(expected)
      expect(coreResult).toBe(webResult)
    })
  }

  it("core isQuoteTooShort export matches direct implementation", () => {
    const testQuote = "إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ"
    expect(coreIsQuoteTooShort(testQuote)).toBe(coreIsQuoteTooShortDirect(testQuote))
  })

  it("MIN_VERIFIABLE_QUOTE_CHARS is 15", () => {
    expect(MIN_VERIFIABLE_QUOTE_CHARS).toBe(15)
  })

  // Boundary test: exactly 15 folded Arabic chars should be valid (not too short)
  it("exactly 15 folded Arabic chars is verifiable", () => {
    // 15 alifs without diacritics
    const quote = "ااااااااااااااا"
    const folded = normalizeForMatch(quote)
    const arabicChars = folded.replace(/[\s\p{M}]/gu, "")
    expect(arabicChars.length).toBe(15)
    expect(coreIsQuoteTooShortDirect(quote)).toBe(false)
    expect(webIsQuoteTooShort(quote)).toBe(false)
  })

  // Boundary test: 14 folded Arabic chars should be too short
  it("14 folded Arabic chars is too short", () => {
    const quote = "اااااااااااااا"
    const folded = normalizeForMatch(quote)
    const arabicChars = folded.replace(/[\s\p{M}]/gu, "")
    expect(arabicChars.length).toBe(14)
    expect(coreIsQuoteTooShortDirect(quote)).toBe(true)
    expect(webIsQuoteTooShort(quote)).toBe(true)
  })
})

export * as QuoteLengthSyncTest from "./quote-length-sync.test.ts"