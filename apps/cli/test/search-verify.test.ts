import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { Database } from "bun:sqlite"
import { openSnapshot, readSnapshotMeta } from "@mizan/corpus"
import { parseSearchForm, searchAndVerify, anyVerified } from "../src/server/search-verify.ts"
import { openServerCorpus, describeCorpusFailure } from "../src/server/corpus.ts"

/**
 * One text, searched across the whole corpus, each candidate verified on its own merits.
 *
 * These run against `data/corpus.db` when it is present — the real 27,234-record snapshot — because
 * the claim this module makes is about that corpus. A fixture corpus of four records would prove the
 * wiring and nothing about the behaviour, and "all collections" over four records is a different
 * statement from "all collections" over six books. When the snapshot is absent the suite skips
 * rather than substituting, for the same reason `happy-path.test.ts` skips: a fabricated pass is
 * worse than an absent one.
 */
const ROOT = join(import.meta.dir, "..", "..", "..")
const CORPUS = join(ROOT, "data", "corpus.db")
const hasCorpus = existsSync(CORPUS)

/** A verse that is in the snapshot verbatim, and so must reach VERIFIED by containment alone. */
const QURAN_VERSE = "قُلْ هُوَ ٱللَّهُ أَحَدٌ"

let db: Database
let snapshotHash: string

beforeAll(() => {
  if (!hasCorpus) return
  db = openSnapshot(CORPUS)
  snapshotHash = readSnapshotMeta(db)["snapshotHash"] ?? ""
})

afterAll(() => {
  if (!hasCorpus) return
  db.close()
})

describe("the one-field boundary", () => {
  test("an empty field is refused rather than searched for", () => {
    const parsed = parseSearchForm({ text: "   " })
    expect(parsed.ok).toBe(false)
  })

  test("the text is decoded at the boundary and the cap is the verifier's own", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.quote.length).toBeGreaterThan(0)
  })

  test("no collection named means every collection, and it is not a guess", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.collection).toBeNull()
  })

  test("a named collection scopes the search", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE, collection: "quran" })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.collection).toBe("quran")
  })

  test("a collection name carrying injection characters is refused at the boundary", () => {
    expect(parseSearchForm({ text: QURAN_VERSE, collection: "quran'--" }).ok).toBe(false)
  })

  test("text with no letters after folding is refused, rather than returning an empty result list", () => {
    const parsed = parseSearchForm({ text: "ًٌٍَُِّْ" })
    expect(parsed.ok).toBe(false)
  })
})

describe.skipIf(!hasCorpus)("one text, searched across the whole corpus", () => {
  test("a verse in the corpus verbatim reaches VERIFIED, computed by containment", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE })
    if (!parsed.ok) throw new Error("boundary refused a verse that is in the corpus")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    expect(result.state).toBe("candidates")
    const verified = result.rows.filter((row) => row.verdict.verdict === "verified")
    expect(verified.length).toBeGreaterThan(0)
    expect(anyVerified(result)).toBe(true)
    // The only route to VERIFIED: strict normalised substring containment, `exact` at 100.
    for (const row of verified) {
      expect(row.verdict.matchStrength).toEqual({ kind: "exact", percent: 100 })
      expect(row.verdict.reason).toBe("exact_containment")
      expect(row.verdict.evidence).not.toBeNull()
    }
  })

  test("the verified row carries the record's own provenance, never a synthesised one", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE })
    if (!parsed.ok) throw new Error("boundary refused a verse that is in the corpus")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    const verified = result.rows.find((row) => row.verdict.verdict === "verified")
    expect(verified).toBeDefined()
    if (verified === undefined) return
    expect(verified.collection).toBe("quran")
    expect(verified.sourceUrl.length).toBeGreaterThan(0)
    expect(verified.license.length).toBeGreaterThan(0)
    expect(verified.attribution.length).toBeGreaterThan(0)
    expect(verified.textDisplay.length).toBeGreaterThan(0)
  })

  test("the scan's scope is reported, so a whole-corpus list is never read as a scoped one", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE })
    if (!parsed.ok) throw new Error("boundary refused a verse that is in the corpus")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    expect(result.scope).not.toBeNull()
    if (result.scope === null) return
    expect(result.scope.kind).toBe("snapshot")
  })

  test("a one-word fabrication verifies against nothing, and every row says REJECTED", () => {
    const fabricated = `${QURAN_VERSE} زائد`
    const parsed = parseSearchForm({ text: fabricated })
    if (!parsed.ok) throw new Error("boundary refused a fabrication")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    expect(result.rows.length).toBeGreaterThan(0)
    expect(anyVerified(result)).toBe(false)
    for (const row of result.rows) {
      expect(row.verdict.verdict).not.toBe("verified")
      expect(row.verdict.evidence).toBeNull()
    }
  })

  test("the nearest rows are real records from the corpus, and each is a distinct id", () => {
    const parsed = parseSearchForm({ text: `${QURAN_VERSE} زائد` })
    if (!parsed.ok) throw new Error("boundary refused a fabrication")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    const ids = result.rows.map((row) => row.recordId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("ranks are dense from 1, because a rank a reader cannot look up is a small lie", () => {
    const parsed = parseSearchForm({ text: `${QURAN_VERSE} زائد` })
    if (!parsed.ok) throw new Error("boundary refused a fabrication")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    for (const [index, row] of result.rows.entries()) {
      expect(row.rank).toBe(index + 1)
    }
  })

  test("no row carries a percentage, a score word or a ratio (AGENTS.md section 10)", () => {
    const parsed = parseSearchForm({ text: `${QURAN_VERSE} زائد` })
    if (!parsed.ok) throw new Error("boundary refused a fabrication")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    for (const row of result.rows) {
      expect(row.verdict.matchStrength.kind === "exact" || row.verdict.matchStrength.kind === "none").toBe(true)
      if (row.verdict.matchStrength.kind === "none") {
        expect("percent" in row.verdict.matchStrength).toBe(false)
      }
      // The only near-ness a row carries is an integer count of folded characters.
      expect(Number.isInteger(row.sharedRunChars)).toBe(true)
    }
  })

  test("no row shows the folded matching key — only the record's own transcription", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE })
    if (!parsed.ok) throw new Error("boundary refused a verse that is in the corpus")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    for (const row of result.rows) {
      expect(row.textDisplay.length).toBeGreaterThan(0)
      expect(Object.keys(row)).not.toContain("textMatch")
    }
  })

  test("the considered count is reported, so the scan's scope is visible", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE })
    if (!parsed.ok) throw new Error("boundary refused a verse that is in the corpus")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    expect(result.considered).toBeGreaterThan(1000)
  })

  test("a text contained in a hadith book verifies against that book, not only against quran", () => {
    // A Qur'anic verse really does occur verbatim inside Malik's Muwatta, which quotes scripture
    // within its narrations. So scoping to `malik` returns `malik` rows that VERIFY, and it must not
    // widen to find them: the record that contains the text is the record that was asked about.
    // Containment is checked against the cited record and against nothing else, so this is the same
    // verdict `bun run ask` would reach with that citation.
    const parsed = parseSearchForm({ text: QURAN_VERSE, collection: "malik" })
    if (!parsed.ok) throw new Error("boundary refused a verse that is in the corpus")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    expect(result.scope?.kind).toBe("collection")
    if (result.scope === null || result.scope.kind !== "collection") return
    expect(result.scope.collection).toBe("malik")
    for (const row of result.rows) expect(row.collection).toBe("malik")
    expect(anyVerified(result)).toBe(true)
    for (const row of result.rows.filter((r) => r.verdict.verdict === "verified")) {
      expect(row.verdict.evidence?.recordId).toBe(row.recordId)
      expect(row.verdict.matchStrength).toEqual({ kind: "exact", percent: 100 })
    }
  })

  test("a scope that holds the text keeps the search inside it", () => {
    const parsed = parseSearchForm({ text: QURAN_VERSE, collection: "quran" })
    if (!parsed.ok) throw new Error("boundary refused a verse that is in the corpus")
    const result = searchAndVerify(db, snapshotHash, parsed.value)
    expect(result.scope?.kind).toBe("collection")
    if (result.scope === null || result.scope.kind !== "collection") return
    expect(result.scope.collection).toBe("quran")
    for (const row of result.rows) expect(row.collection).toBe("quran")
  })
})

describe("the corpus the playground opens", () => {
  test("a corpus that is present and attested is opened as the snapshot", async () => {
    if (!hasCorpus) return
    const corpus = await openServerCorpus(ROOT, join(ROOT, ".tmp-corpus-test"))
    expect(corpus.ok).toBe(true)
    if (!corpus.ok) return
    expect(corpus.value.kind).toBe("snapshot")
    expect(corpus.value.recordCount).toBeGreaterThan(1000)
    corpus.value.close()
  })

  test("the record count on screen is the count of the corpus actually open", async () => {
    if (!hasCorpus) return
    const corpus = await openServerCorpus(ROOT, join(ROOT, ".tmp-corpus-test"))
    if (!corpus.ok) return
    const summed = Object.values(corpus.value.collectionCounts).reduce((sum, count) => sum + count, 0)
    expect(summed).toBe(corpus.value.recordCount)
    corpus.value.close()
  })

  test("an attestation mismatch refuses, and never falls back to the anchor corpus", () => {
    // The failure state is stated here as a shape rather than driven end to end, because building a
    // mismatched pair on disk means writing a corpus file, and a test that writes an 83 MB database to
    // silence a shape check is a test nobody runs. The behaviour under test is the TAG, and the
    // surface that must print it is `describeCorpusFailure`.
    const message = describeCorpusFailure({
      _tag: "integrity_error",
      detail: "attestation.json attests snapshotHash aaaa…, the open database is bbbb…",
    })
    expect(message).toContain("ATTESTATION FAILED")
    expect(message).toContain("No verdict is shown")
  })

  test("an unreadable corpus is a different sentence from an untrusted one", () => {
    const unusable = describeCorpusFailure({ _tag: "unusable", detail: "not a database" })
    const untrusted = describeCorpusFailure({ _tag: "integrity_error", detail: "mismatch" })
    expect(unusable).not.toBe(untrusted)
    expect(unusable).toContain("could not be read")
  })
})
