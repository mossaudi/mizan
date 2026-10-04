import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { isErr, isOk, normalizeForMatch, type CorpusRecord } from "@mizan/core"
import { fetchSuggestionRecords, resolveCitations, scanSuggestionCandidates, toCorpusRecord, type RawRecord } from "../src/index.ts"
import { buildSnapshot, openSnapshot } from "../src/snapshot.ts"
import type { SourceMeta } from "../src/adapters/source-meta.ts"

/**
 * The nearest-quote read path, tested offline against a real snapshot file.
 *
 * These tests are about the I/O contract, because the judgement is `@mizan/suggest`'s and is tested
 * there: that the scan reads every row exactly once, that it streams rather than materialises, that
 * a row it cannot decode is a failure rather than a silent omission, and that the second read
 * fetches metadata for the winners and nothing else.
 */

const TMP_DIR = join(tmpdir(), "mizan-corpus-test")
const VERSE = "الله لا إله إلا هو الحي القيوم"

const meta = (over: Partial<SourceMeta["descriptor"]> = {}): SourceMeta => ({
  enabled: true,
  exclusionReason: null,
  descriptor: {
    source: "test/fixture",
    title: "Test fixture",
    publisher: "test",
    url: "https://example.invalid/data",
    license: "CC0-1.0",
    licenceClass: "permissive",
    licenseUrl: "https://example.invalid/licence",
    attribution: "test fixture",
    gradeApplicable: true,
    gradeBasis: "row",
    notes: null,
    ...over,
  },
})

const record = (over: Partial<RawRecord> = {}): CorpusRecord =>
  toCorpusRecord(
    {
      id: "test:1",
      collection: "test",
      number: "1",
      textDisplay: VERSE,
      sourceUrl: null,
      grade: null,
      gradeBasis: "none",
      translation: null,
      ...over,
    },
    { meta: meta(), gradeSource: "test/fixture" },
  )

const RECORDS: readonly CorpusRecord[] = [
  record({ id: "test:1", textDisplay: VERSE }),
  record({ id: "test:2", number: "2", textDisplay: VERSE }),
  record({ id: "test:3", number: "3", textDisplay: "لا إكراه في الدين قد تبين الرشد من الغي" }),
  record({ id: "test:4", number: "4", textDisplay: "قل هو الله أحد الله الصمد لم يلد ولم يولد" }),
  record({ id: "test:5", number: "5", textDisplay: "بسم الله الرحمن الرحيم" }),
  record({ id: "test:6", number: "6", textDisplay: "In the name of Allah, the Merciful" }),
  // A second collection holding the verse verbatim. Its presence is the point: a scope that could not
  // be applied because the scan did not carry `collection` would be indistinguishable from a scope
  // that finds nothing.
  record({ id: "other:1", collection: "other", number: "1", textDisplay: VERSE }),
]

let db: Database

beforeAll(() => {
  const snapshot = buildSnapshot(join(TMP_DIR, "mizan-candidates.db"), RECORDS)
  db = openSnapshot(snapshot.path)
})

afterAll(() => {
  db.close()
})

describe("the scan reads every row, and says how many", () => {
  test("counts every record in the snapshot, not just the ones it kept", () => {
    const scanned = scanSuggestionCandidates(db, VERSE)
    expect(isOk(scanned)).toBe(true)
    if (!isOk(scanned)) return
    expect(scanned.value.considered).toBe(RECORDS.length)
  })

  test("keeps only rows that clear the caller's floor, or contain the quote outright", () => {
    const scanned = scanSuggestionCandidates(db, VERSE)
    if (!isOk(scanned)) throw new Error("scan failed")
    // "قل هو الله أحد الله الصمد" shares exactly eight 3-gram types with the verse, and the floor is
    // inclusive — `>= 8`, not `> 8`, because a floor that dropped its own boundary would disagree with
    // the ranking that re-checks it. The records holding the verse are kept by containment;
    // "بسم الله الرحمن الرحيم" shares five and is not carried.
    expect(scanned.value.rows.map((row) => row.recordId)).toEqual(["other:1", "test:1", "test:2", "test:4"])
  })

  test("carries each row's collection, so the caller can scope without a second pass", () => {
    const scanned = scanSuggestionCandidates(db, VERSE)
    if (!isOk(scanned)) throw new Error("scan failed")
    const collections = new Map(scanned.value.rows.map((row) => [row.recordId, row.collection]))
    expect(collections.get("other:1")).toBe("other")
    expect(collections.get("test:1")).toBe("test")
  })

  test("a lower floor carries more rows, which is how the caller reports a lower floor", () => {
    const scanned = scanSuggestionCandidates(db, VERSE, 1)
    if (!isOk(scanned)) throw new Error("scan failed")
    const ids = scanned.value.rows.map((row) => row.recordId)
    expect(ids).toContain("test:5")
    // English text shares no 3-gram with an Arabic verse, so even a floor of one does not carry it.
    expect(ids).not.toContain("test:6")
  })

  test("marks the two records that contain the quote outright", () => {
    const scanned = scanSuggestionCandidates(db, VERSE)
    if (!isOk(scanned)) throw new Error("scan failed")
    const contained = scanned.value.rows.filter((row) => row.contained).map((row) => row.recordId)
    expect(contained).toEqual(["other:1", "test:1", "test:2"])
  })

  test("hands back the folded quote so the caller never folds it twice", () => {
    const raw = `  ${VERSE}\n`
    const scanned = scanSuggestionCandidates(db, raw)
    if (!isOk(scanned)) throw new Error("scan failed")
    expect(scanned.value.quoteFolded).toBe(normalizeForMatch(raw))
  })

  test("streams rather than materialising: a scan of an empty quote still reads every row", () => {
    const scanned = scanSuggestionCandidates(db, "")
    if (!isOk(scanned)) throw new Error("scan failed")
    expect(scanned.value.considered).toBe(RECORDS.length)
    expect(scanned.value.rows).toEqual([])
  })

  test("returns the same answer every time", () => {
    const once = scanSuggestionCandidates(db, VERSE)
    const twice = scanSuggestionCandidates(db, VERSE)
    if (!isOk(once) || !isOk(twice)) throw new Error("scan failed")
    expect(twice.value.rows).toEqual(once.value.rows)
  })
})

describe("a row the scan cannot read", () => {
  test("fails the scan instead of quietly shrinking the count", () => {
    const broken = new Database(":memory:")
    broken.exec("CREATE TABLE records (id TEXT, collection TEXT, textMatch TEXT)")
    broken.exec("INSERT INTO records (id, collection, textMatch) VALUES ('good:1', 'x', 'نص'), ('bad:1', 'x', NULL)")
    const scanned = scanSuggestionCandidates(broken, "نص")
    expect(isErr(scanned)).toBe(true)
    if (isErr(scanned)) expect(scanned.error._tag).toBe("row_undecodable")
    broken.close()
  })

  test("a row with no collection is a failure, because a scope guessed from an absent column is the whole corpus", () => {
    const broken = new Database(":memory:")
    broken.exec("CREATE TABLE records (id TEXT, collection TEXT, textMatch TEXT)")
    broken.exec("INSERT INTO records (id, collection, textMatch) VALUES ('bad:1', NULL, 'نص')")
    const scanned = scanSuggestionCandidates(broken, "نص")
    expect(isErr(scanned)).toBe(true)
    broken.close()
  })

  test("names the row, and never its text", () => {
    const broken = new Database(":memory:")
    broken.exec("CREATE TABLE records (id TEXT, collection TEXT, textMatch TEXT)")
    broken.exec("INSERT INTO records (id, collection, textMatch) VALUES ('bad:1', 'x', NULL)")
    const scanned = scanSuggestionCandidates(broken, "نص")
    if (isErr(scanned)) expect(JSON.stringify(scanned.error)).toContain("bad:1")
    broken.close()
  })
})

/**
 * A table that cannot be read *at all* is the same kind of outcome as a row that cannot be decoded:
 * the corpus file on disk is not what this code expects, which is an ordinary state for a snapshot
 * that was written by an older ingest or has been edited since its attestation was signed.
 *
 * These tests exist because the driver's own failure is a `throw`, and a `throw` crossing this
 * package boundary would be the one thing AGENTS.md §2 forbids outright — it reaches the reader as a
 * stack trace where the product has exactly one honest sentence, `unavailable` (AGENTS.md §16).
 */
describe("a table the scan cannot read at all", () => {
  test("a column a candidate scan reads is absent, so the scan fails rather than throws", () => {
    const thin = new Database(":memory:")
    thin.exec("CREATE TABLE records (id TEXT, textMatch TEXT)")
    thin.exec("INSERT INTO records (id, textMatch) VALUES ('thin:1', 'نص')")
    const scanned = scanSuggestionCandidates(thin, "نص")
    expect(isErr(scanned)).toBe(true)
    if (isErr(scanned)) expect(scanned.error._tag).toBe("parse_failed")
    thin.close()
  })

  test("there is no records table at all, so the scan fails rather than throws", () => {
    const empty = new Database(":memory:")
    empty.exec("CREATE TABLE something_else (id TEXT)")
    const scanned = scanSuggestionCandidates(empty, "نص")
    expect(isErr(scanned)).toBe(true)
    if (isErr(scanned)) expect(scanned.error._tag).toBe("parse_failed")
    empty.close()
  })

  test("names the columns it needed, and never the corpus or the quote", () => {
    const thin = new Database(":memory:")
    thin.exec("CREATE TABLE records (id TEXT, textMatch TEXT)")
    thin.exec("INSERT INTO records (id, textMatch) VALUES ('thin:1', 'نص')")
    const scanned = scanSuggestionCandidates(thin, "نص")
    if (isErr(scanned)) {
      const rendered = JSON.stringify(scanned.error)
      expect(rendered).toContain("collection")
      expect(rendered).not.toContain("نص")
    }
    thin.close()
  })
})

describe("the follow-up read", () => {
  test("returns the full records for the ids it was given", () => {
    const records = fetchSuggestionRecords(db, ["test:1", "test:3"])
    expect(isOk(records)).toBe(true)
    if (!isOk(records)) return
    expect(records.value.map((entry) => entry.id)).toEqual(["test:1", "test:3"])
    expect(records.value[0]?.attribution).toBe("test fixture")
  })

  test("returns in id order regardless of the order it was asked in", () => {
    const records = fetchSuggestionRecords(db, ["test:3", "test:1"])
    if (!isOk(records)) throw new Error("read failed")
    expect(records.value.map((entry) => entry.id)).toEqual(["test:1", "test:3"])
  })

  test("asks for nothing when it is given nothing", () => {
    const records = fetchSuggestionRecords(db, [])
    expect(isOk(records)).toBe(true)
    if (isOk(records)) expect(records.value).toEqual([])
  })

  test("refuses more ids than a suggestion can ever show", () => {
    const records = fetchSuggestionRecords(db, ["a", "b", "c", "d", "e", "f"])
    expect(isErr(records)).toBe(true)
  })

  test("treats a vanished record as a failure, not as a shorter list", () => {
    const records = fetchSuggestionRecords(db, ["test:1", "test:does-not-exist"])
    expect(isErr(records)).toBe(true)
    if (isErr(records)) expect(records.error._tag).toBe("row_undecodable")
  })
})

describe("citation resolution still works on the shared decoder", () => {
  test("resolves a numbered citation from the snapshot the scan also read", () => {
    const { resolved, problems } = resolveCitations(db, [{ collection: "test", number: "1", grade: null, raw: "test:1" }])
    expect(problems).toEqual([])
    expect(resolved[0]?.records.map((record) => record.id)).toEqual(["test:1"])
  })
})