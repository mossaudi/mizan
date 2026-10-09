import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { DISPLAY_CONTRACT_NUMBERS } from "@mizan/gate"
import { normalizeForMatch, type NearbyRecord, type Suggestion } from "@mizan/core"
import { buildSnapshot, openSnapshot, toCorpusRecord } from "@mizan/corpus"
import { MAX_SPANS_PER_CHUNK } from "@mizan/verify"
import {
  MAX_SPANS_SUGGESTED_PER_CHUNK,
  articleSuggestionWord,
  articleSuggestionsFor,
  type ArticleSuggestionTarget,
} from "../src/article-suggestions.ts"

/**
 * Article-scale closest-in-words suggestions, against a REAL snapshot.
 *
 * Nothing here is mocked, for the same reason `suggestions.test.ts` mocks nothing: the feature's claim
 * is that the candidate list was found by an exhaustive scan and that the badge beside it was computed
 * by containment, and a stubbed corpus would be testing the stub.
 *
 * The two assertions that matter most are the NEGATIVE ones. A `verified` span must be offered nothing,
 * and a span past the budget must be told `unavailable` rather than shown a shortened list — because a
 * truncated list presented as the whole search is the silent downgrade AGENTS.md section 16 forbids.
 */

const VERSE = "الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم"
/** The verse with one word changed: the case a nearest-in-words pass is most likely to answer. */
const FABRICATED = "الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم العظيم"

let dir: string
let db: Database

const meta = {
  enabled: true,
  exclusionReason: null,
  descriptor: {
    source: "test/fixture",
    title: "Test fixture",
    publisher: "test",
    url: "https://example.invalid/data",
    license: "CC0-1.0",
    licenceClass: "permissive" as const,
    licenseUrl: "https://example.invalid/licence",
    attribution: "test fixture",
    sha256: "a".repeat(64),
    records: 3,
    gradeApplicable: true,
    gradeBasis: "row" as const,
    notes: null,
  },
}

const build = (raw: Parameters<typeof toCorpusRecord>[0]) => toCorpusRecord(raw, { meta, gradeSource: "test/fixture" })

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "mizan-article-suggest-"))
  const path = join(dir, "corpus.db")
  buildSnapshot(path, [
    build({ id: "quran:2:255", collection: "quran", number: "2:255", textDisplay: VERSE, sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
    build({ id: "tirmidhi:1", collection: "tirmidhi", number: "1", textDisplay: VERSE, sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
    // Latin script, so it can never clear an Arabic quote's display floor. Its presence is what makes
    // an empty candidate list a real outcome rather than an artefact of a one-row corpus.
    build({ id: "abudawud:1", collection: "abudawud", number: "1", textDisplay: "In the name of Allah, the Most Merciful", sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
  ])
  db = openSnapshot(path)
})

afterAll(() => {
  if (db !== undefined) db.close()
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  } catch {
    // best-effort temp cleanup; the OS reclaims the directory
  }
})

const target = (segmentIndex: number, quote: string, verdict: ArticleSuggestionTarget["verdict"] = "unverifiable"): ArticleSuggestionTarget => ({
  segmentIndex,
  quote,
  verdict,
})

const searched = (index: number, results: ReturnType<typeof articleSuggestionsFor>) => {
  const found = results[index]
  if (found === undefined || found.state !== "searched") throw new Error(`span ${index} was not searched`)
  return found.suggestion
}

const candidatesOf = (suggestion: Suggestion): readonly NearbyRecord[] =>
  suggestion.state === "candidates" ? suggestion.candidates : []

describe("every non-verified span is offered in-words candidates", () => {
  test("a rejected span's candidates are found, and each row carries only whole numbers", () => {
    const results = articleSuggestionsFor(db, [target(0, FABRICATED)])
    const rows = candidatesOf(searched(0, results))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Number.isInteger(row.sharedRunChars)).toBe(true)
      expect(Number.isInteger(row.rank)).toBe(true)
    }
  })

  test("there are at most MAX_TOP_K rows, and the list is never padded", () => {
    const rows = candidatesOf(searched(0, articleSuggestionsFor(db, [target(0, FABRICATED)])))
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  test("the denominator travels once on the block, so every row's quote length is the same question", () => {
    const suggestion = searched(0, articleSuggestionsFor(db, [target(0, FABRICATED)]))
    if (suggestion.state !== "candidates") throw new Error("expected candidates")
    expect(suggestion.quoteChars).toBe(normalizeForMatch(FABRICATED).length)
  })

  test("a verified span is offered NO suggestion, because a list beside a badge reads as its reason", () => {
    const results = articleSuggestionsFor(db, [target(0, FABRICATED, "verified")])
    expect(results[0]?.state).toBe("not_attempted")
  })

  test("the results are positional, so a caller cannot pair a list with the wrong span", () => {
    const results = articleSuggestionsFor(db, [target(7, FABRICATED), target(3, FABRICATED, "verified"), target(9, FABRICATED)])
    expect(results.map((result) => result.segmentIndex)).toEqual([7, 3, 9])
  })
})

describe("sharedRunChars never confers a verdict", () => {
  test("a fabricated quote equal in words to a real record still yields no verdict on this surface", () => {
    // The ADR-03 spike case: the containment check says no, and the two integers a reader can see are
    // characters, not agreement. There is no field on the block a caller could read as a verdict.
    const suggestion = searched(0, articleSuggestionsFor(db, [target(0, FABRICATED)]))
    expect(Object.keys(suggestion).indexOf("verdict")).toBe(-1)
    expect(Object.keys(suggestion).indexOf("badge")).toBe(-1)
  })

  test("an exact-length overlap renders as characters and nothing else", () => {
    const suggestion = searched(0, articleSuggestionsFor(db, [target(0, VERSE)]))
    if (suggestion.state !== "candidates") throw new Error("expected candidates")
    const rows = suggestion.candidates
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.sharedRunChars).toBeLessThanOrEqual(suggestion.quoteChars)
  })
})

describe("budget exhaustion has its own surface", () => {
  test("a span past the budget is `unavailable`, never a shortened list shown as complete", () => {
    const targets = Array.from({ length: 5 }, (_, index) => target(index, FABRICATED))
    const results = articleSuggestionsFor(db, targets, 2)
    expect(results.slice(0, 2).map((result) => result.state)).toEqual(["searched", "searched"])
    for (const result of results.slice(2)) {
      if (result.state !== "unavailable") throw new Error(`span ${result.segmentIndex} was not unavailable`)
      expect(result.reason).toContain(String(2))
    }
  })

  test("the budget reason names the bound, because an invisible bound cannot be weighed", () => {
    const results = articleSuggestionsFor(db, [target(0, FABRICATED), target(1, FABRICATED)], 1)
    expect(results[1]?.state).toBe("unavailable")
    expect(articleSuggestionWord(results[1] ?? { segmentIndex: 1, state: "unavailable", reason: "" })).toBe("unavailable")
  })

  test("a VERIFIED span does not spend the budget, so it cannot starve the spans that need looking up", () => {
    const targets = [target(0, FABRICATED, "verified"), target(1, FABRICATED)]
    const results = articleSuggestionsFor(db, targets, 1)
    expect(results[0]?.state).toBe("not_attempted")
    expect(results[1]?.state).toBe("searched")
  })

  test("the default budget IS the chunk's span count, the same unit the request budget is", () => {
    // Asserted as an IDENTITY, not as a literal. Pinning `toBe(32)` on both sides is what let the chunk
    // cap move to 64 while this budget stayed at 32 with a comment claiming they were the same number;
    // the value now has one declaration and this is a check that the derivation survives an edit.
    expect(MAX_SPANS_SUGGESTED_PER_CHUNK).toBe(MAX_SPANS_PER_CHUNK)
    expect(MAX_SPANS_PER_CHUNK).toBe(32)
  })
})

describe("a span with nothing near it says so, and distinguishes it from a search that could not run", () => {
  test("a Latin-script quote against an Arabic corpus is `no_candidates`, not `unavailable`", () => {
    const suggestion = searched(0, articleSuggestionsFor(db, [target(0, "a wholly unrelated sentence of english")]))
    expect(suggestion.state).toBe("no_candidates")
  })

  test("the word a renderer prints is the state's own word, so two surfaces cannot disagree", () => {
    const withCandidates = articleSuggestionsFor(db, [target(0, FABRICATED)])
    const without = articleSuggestionsFor(db, [target(0, "a wholly unrelated sentence of english")])
    expect(articleSuggestionWord(withCandidates[0] ?? { segmentIndex: 0, state: "unavailable", reason: "" })).toMatch(/^\d+ candidates$/)
    expect(articleSuggestionWord(without[0] ?? { segmentIndex: 0, state: "unavailable", reason: "" })).toBe("no_candidates")
    expect(articleSuggestionWord({ segmentIndex: 0, state: "not_attempted", reason: "" })).toBe("not attempted")
  })
})

describe("the display contract carries no third number", () => {
  test("only the four enumerated names exist on a displayed candidate row", () => {
    // G-7.12's enumeration, read from the gate rather than retyped, so the renderer and the rule cannot
    // disagree about which numbers are permitted.
    const row = candidatesOf(searched(0, articleSuggestionsFor(db, [target(0, FABRICATED)])))[0]
    expect(row).toBeDefined()
    const permitted: readonly string[] = DISPLAY_CONTRACT_NUMBERS
    for (const key of Object.keys(row ?? {})) {
      const numeric = typeof (row as unknown as Record<string, unknown>)[key] === "number"
      if (!numeric) continue
      expect(permitted).toContain(key)
    }
  })

  test("the module declares no similarity-shaped name, so the CWE-345 vocabulary has nothing to match", () => {
    const source = readFileSync(join(import.meta.dir, "..", "src", "article-suggestions.ts"), "utf8")
    for (const banned of ["percent", "similarity", "confidence", "threshold", "fuzzy"]) {
      expect(source).not.toContain(banned)
    }
  })

  test("candidate text is carried beside the contract and is the DISPLAY column, never the matching key", () => {
    const results = articleSuggestionsFor(db, [target(0, FABRICATED)])
    const found = results[0]
    if (found === undefined || found.state !== "searched") throw new Error("unreachable")
    for (const text of found.texts) {
      expect(text.textDisplay.length).toBeGreaterThan(0)
      expect(text.textMatch).not.toBe("")
    }
  })
})

describe("the scan streams and never loads the corpus", () => {
  test("the module imports the shared scan rather than opening a query of its own", () => {
    const source = readFileSync(join(import.meta.dir, "..", "src", "article-suggestions.ts"), "utf8")
    expect(source).toContain('from "./suggestions.ts"')
    expect(source).not.toContain("select ")
    expect(source).not.toContain(".all()")
  })
})
