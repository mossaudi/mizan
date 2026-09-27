import { describe, expect, test } from "bun:test"
import { normalize, normalizeForMatch, normalizeForRender } from "../src/normalize/normalize.ts"

/**
 * Story 7: "Normalization is idempotent — given ANY string, including Arabic,
 * English, digits, RTL marks and mixed script, normalize(normalize(s)) === normalize(s)."
 *
 * The generator deliberately produces the nasty classes: bidi embedding controls,
 * combining marks, tatweel, both Arabic digit blocks, join controls, every letter
 * variant, whitespace soup, and mixed Latin. Seeded so a failure is reproducible.
 */

const SEED = 20261004

const lcg = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const ALPHABETS = [
  ["a", "b", "z", " ", "\n", "\t", " ", "1", "9", "0"],
  ["ب", "س", "م", "ا", "ي", "ه", "ة", "ء", " ", "٤", "٢", "٦", "۴", "۲", "۶"],
  ["\u064B", "\u064E", "\u0650", "\u0652", "\u0670", "\u06E9", "ب", "ا", " "],
  ["\u0640", "ب", "س", "م", " "],
  ["\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2066", "\u2069", "\u200E", "\u200F", "\u061C", "S", "a", "h"],
  ["\u200C", "\u200D", "ب", "ر", " "],
  ["آ", "أ", "إ", "ٱ", "ى", "ی", "ؤ", "ئ", "ة", "ۃ", " ", "م"],
  ["\u06DD", "\u06DE", "ا", "ل", "ح", "م", " "],
  ["\uFF21", "\uFF41", "\u3000", "あ", "ア", "x"],
]

const generate = (length: number, random: () => number): string => {
  let out = ""
  for (let i = 0; i < length; i += 1) {
    const alphabet = ALPHABETS[Math.floor(random() * ALPHABETS.length)]
    if (alphabet === undefined) continue
    const char = alphabet[Math.floor(random() * alphabet.length)]
    if (char !== undefined) out += char
  }
  return out
}

describe("property: normalization is idempotent", () => {
  test("over 4000 generated mixed-script, RTL-mark, digit and whitespace strings", () => {
    const random = lcg(SEED)
    for (let i = 0; i < 4000; i += 1) {
      const input = generate(1 + Math.floor(random() * 40), random)
      for (const form of [normalize, normalizeForMatch, normalizeForRender]) {
        const once = form(input)
        const twice = form(once)
        if (once !== twice) {
          throw new Error(`not idempotent for input ${JSON.stringify(input)}: ${JSON.stringify(once)} vs ${JSON.stringify(twice)}`)
        }
      }
    }
  })

  test("normalizeForMatch output contains no mark, tatweel or bidi control", () => {
    const random = lcg(SEED + 1)
    for (let i = 0; i < 2000; i += 1) {
      const folded = normalizeForMatch(generate(1 + Math.floor(random() * 40), random))
      if (/[\p{Mn}\p{Mc}\p{Me}]/u.test(folded)) throw new Error(`mark survived: ${JSON.stringify(folded)}`)
      if (folded.includes("\u0640")) throw new Error(`tatweel survived: ${JSON.stringify(folded)}`)
      if (/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(folded)) throw new Error(`bidi control survived: ${JSON.stringify(folded)}`)
      if (/[\u0660-\u0669\u06F0-\u06F9]/.test(folded)) throw new Error(`arabic-indic digit survived: ${JSON.stringify(folded)}`)
      if (/\s\s/.test(folded)) throw new Error(`whitespace run survived: ${JSON.stringify(folded)}`)
    }
  })

  test("a quote and its noisiest variant produce the same containment key", () => {
    const random = lcg(SEED + 2)
    for (let i = 0; i < 500; i += 1) {
      const text = generate(8 + Math.floor(random() * 30), random)
      if (normalizeForMatch(text).length === 0) continue
      const noisy = text
        .split("")
        .map((char) => (random() < 0.3 ? `\u0640${char}` : char))
        .join("")
        .replace(/ /g, random() < 0.5 ? "  " : " \t")
      expect(normalizeForMatch(noisy)).toBe(normalizeForMatch(text))
    }
  })
})

describe("performance: linear time, no catastrophic backtracking", () => {
  test("a 1 MB single-token string is folded in linear time and clears the 50k chars/s budget", () => {
    const megabyte = "ب".repeat(1_000_000)
    const started = performance.now()
    const folded = normalizeForMatch(megabyte)
    const elapsed = performance.now() - started

    expect(folded.length).toBe(1_000_000)
    const charsPerSecond = 1_000_000 / (elapsed / 1000)
    // Requirement: >= 50k chars/s per core. Measured expectation is three orders of
    // magnitude above that; the assertion is set at the requirement, not at the
    // measurement, so a regression has to be catastrophic to fail.
    expect(charsPerSecond).toBeGreaterThan(50_000)
  })

  test("a 1 MB string of alternating marks and letters does not blow up", () => {
    const alternating = "ب\u0651".repeat(500_000)
    const started = performance.now()
    normalizeForMatch(alternating)
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(5_000)
  })

  test("a long run of leading whitespace does not backtrack", () => {
    const pathological = `${" ".repeat(100_000)}بسم`
    expect(normalizeForMatch(pathological)).toBe("بسم")
  })
})
