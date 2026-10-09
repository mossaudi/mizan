import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { MAX_QUOTE_CHARS } from "@mizan/core"
import {
  DOCUMENT_TOO_LARGE,
  MAX_DOCUMENT_CHARS,
  checkDocumentCap,
  chunkWindow,
  documentDigestOf,
  segmentDocument,
} from "../src/document-segments.ts"

/**
 * Deterministic segmentation, the declared cap, and the typed refusal.
 *
 * The two properties the whole article feature rests on are here: the SAME text yields the SAME
 * segments on every run and every machine, and a document over the cap is REFUSED rather than
 * shortened. A silent truncation is the fail-open shape AGENTS.md section 3 forbids — a judge would
 * read a partial report as the whole document — so the cap boundary is tested on both sides.
 */

const REPO = join(import.meta.dir, "..", "..", "..")

const SAMPLE = [
  "The Prophet said, \"faith is the belief of the heart\".",
  "This sentence carries no quotation at all.",
  "Indeed الله لا إله إلا هو!",
].join(" ")

describe("segmentDocument is deterministic", () => {
  test("the same text segments identically, twice in a row", () => {
    expect(segmentDocument(SAMPLE)).toEqual(segmentDocument(SAMPLE))
  })

  test("it reuses segmentSentences, so there is exactly ONE sentence splitter in the repository", () => {
    // The alternative — a second splitter in this module — produces two segment lists for one document,
    // and every denominator downstream becomes a function of which caller ran (AGENTS.md section 17).
    const segments = segmentDocument(SAMPLE)
    expect(segments).toHaveLength(3)
    expect(segments[0]).toBe("The Prophet said, \"faith is the belief of the heart\".")
  })

  test("an Arabic terminator splits, and consecutive terminators do not split mid-word", () => {
    expect(segmentDocument("قال قال؟ ثم؟")).toEqual(["قال قال؟", "ثم؟"])
  })

  test("CRLF and LF produce the same segments, because the splitter trims", () => {
    expect(segmentDocument("one. two.\r\nthree.")).toEqual(segmentDocument("one. two.\nthree."))
  })

  test("a leading BOM is trimmed away rather than becoming segment zero's first character", () => {
    expect(segmentDocument("﻿one. two.")[0]).toBe("one.")
  })

  test("two identical sentences keep distinct indices, because the index is positional", () => {
    const segments = segmentDocument("same. same.")
    expect(segments).toHaveLength(2)
    expect(segments[0]).toBe(segments[1])
  })

  test("it is pure: the module reaches no clock, no randomness, no filesystem and no network", () => {
    const source = readFileSync(join(import.meta.dir, "..", "src", "document-segments.ts"), "utf8")
    for (const banned of ["Date.now", "Math.random", "new Date", "process.env", "fetch(", "require(", "import(", "eval("]) {
      expect(source).not.toContain(banned)
    }
  })

  test("only this module declares the sentence-splitter pattern, so the rule has one owner", () => {
    const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8")
    const splitter = read("packages/mizan-verify/src/ssr.ts")
    expect(splitter).toContain("SENTENCE_END")
    // A second `SENTENCE_END` in the article modules would be a second answer to "what ends a sentence".
    expect(read("packages/mizan-verify/src/document-segments.ts")).not.toContain("SENTENCE_END")
    expect(read("packages/mizan-verify/src/select-spans.ts")).not.toContain("SENTENCE_END")
  })
})

describe("the declared cap", () => {
  test("a document at exactly the cap is accepted", () => {
    const atCap = "a".repeat(MAX_DOCUMENT_CHARS)
    expect(atCap.length).toBe(MAX_DOCUMENT_CHARS)
    const result = checkDocumentCap(atCap)
    expect(result.ok).toBe(true)
  })

  test("one character over is refused with document_too_large, and the cap is in the message", () => {
    const over = "a".repeat(MAX_DOCUMENT_CHARS + 1)
    const result = checkDocumentCap(over)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error._tag).toBe(DOCUMENT_TOO_LARGE)
    expect(result.error.detail).toContain(String(MAX_DOCUMENT_CHARS))
  })

  test("the refusal carries no partial segment list, so a partial document cannot be mistaken for one", () => {
    const result = checkDocumentCap("a".repeat(MAX_DOCUMENT_CHARS + 1))
    if (result.ok) throw new Error("unreachable")
    expect(Object.keys(result.error).toSorted()).toEqual(["_tag", "detail"])
  })

  test("the cap is derived from MAX_QUOTE_CHARS x the boundary's span cap, and says so", () => {
    // 4,096 x 32 = one chunk of maximum-size spans. Stated as arithmetic rather than as a measurement,
    // because no measurement exists and pretending otherwise is the defect this repository exists to catch.
    expect(MAX_DOCUMENT_CHARS).toBe(MAX_QUOTE_CHARS * 32)
  })
})

describe("an empty document is never an empty clean report", () => {
  test("the empty string segments to nothing", () => {
    expect(segmentDocument("")).toEqual([])
  })

  test("a whitespace-only document segments to nothing", () => {
    expect(segmentDocument("   \n\t  ")).toEqual([])
  })

  test("consecutive terminators are ONE segment, because the existing splitter says so", () => {
    // `?` is only a terminator when whitespace or end-of-text follows it, so `?!` never splits. That is
    // the pre-existing rule in `segmentSentences` and this module inherits it rather than re-deciding
    // it — a second splitter would give one document two segment lists.
    expect(segmentDocument("?!")).toEqual(["?!"])
    expect(segmentDocument("one?! two.")).toEqual(["one?!", "two."])
  })
})

describe("a segment longer than the quote bound", () => {
  test("it is segmented, not truncated: the whole run is one segment and it is reported as a gap", () => {
    // The gap itself is asserted by `select-spans.test.ts`; here the point is that segmentation does not
    // shorten it into something that looks checked.
    const run = "x".repeat(MAX_QUOTE_CHARS + 1)
    const segments = segmentDocument(run)
    expect(segments).toHaveLength(1)
    expect(segments[0]?.length).toBe(MAX_QUOTE_CHARS + 1)
  })
})

describe("documentDigestOf", () => {
  test("it is a sha256 of the raw text, so two runs of one document agree", () => {
    expect(documentDigestOf(SAMPLE)).toBe(documentDigestOf(SAMPLE))
    expect(documentDigestOf(SAMPLE)).toMatch(/^[0-9a-f]{64}$/)
  })

  test("trailing whitespace changes the digest, because a document is the bytes the client sent", () => {
    // Normalizing here would be a second declaration of what a document IS; `normalize/` already owns
    // that fold and applies it once at ingest.
    expect(documentDigestOf("one")).not.toBe(documentDigestOf("one "))
  })

  test("it never contains the text, so a document can be named in a log without being quoted in one", () => {
    expect(documentDigestOf("الله لا إله إلا هو")).not.toContain("الله")
  })
})

describe("chunkWindow", () => {
  test("the first window starts at zero and the last one finishes the document", () => {
    expect(chunkWindow(10, 0, 4)).toEqual({ start: 0, end: 4, finished: false })
    expect(chunkWindow(10, 8, 4)).toEqual({ start: 8, end: 10, finished: true })
  })

  test("a window that overruns the document is clamped and reports finished", () => {
    expect(chunkWindow(6, 4, 32)).toEqual({ start: 4, end: 6, finished: true })
  })

  test("a cursor past the end yields an empty finished window rather than a negative start", () => {
    expect(chunkWindow(6, 99, 4)).toEqual({ start: 6, end: 6, finished: true })
  })

  test("a cursor below zero is treated as the start, so a forged cursor cannot read backwards", () => {
    expect(chunkWindow(6, -5, 4)).toEqual({ start: 0, end: 4, finished: false })
  })
})

describe("the repository has no second segmentation module", () => {
  test("exactly one module calls segmentSentences: this one, beside the module that owns it", () => {
    const found: string[] = []
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith(".ts") && statSync(full).isFile()) {
          if (readFileSync(full, "utf8").indexOf("segmentSentences") !== -1) found.push(full)
        }
      }
    }
    walk(join(REPO, "packages", "mizan-verify", "src"))
    const relative = found.map((path) => path.slice(REPO.length + 1).split("\\").join("/")).toSorted()
    // The owner, this module, and the barrel that re-exports both. A FOURTH entry would be a second
    // answer to "what segments a document", and every denominator downstream becomes a function of it.
    expect(relative).toEqual([
      "packages/mizan-verify/src/document-segments.ts",
      "packages/mizan-verify/src/index.ts",
      "packages/mizan-verify/src/ssr.ts",
    ])
  })
})
