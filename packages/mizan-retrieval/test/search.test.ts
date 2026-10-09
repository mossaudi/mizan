import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isOk, normalizeForMatch, type CorpusRecord } from "@mizan/core"
import { buildSnapshot, openSnapshot } from "@mizan/corpus"
import { bm25Order, expressionsFor, search } from "../src/search.ts"
import { broadExpression, phraseExpression, prefixExpression, prepareQuery } from "../src/query.ts"
import { hadithSearch, quranSearch, tafsirLookup, TOOL_BUDGET_MS } from "../src/tools.ts"

/**
 * The integration half: real SQLite, real FTS5, real BM25.
 *
 * The unit tests prove the fusion arithmetic and that the query language is unreachable from user
 * text. Neither of those proves the SQL actually runs — the `MATCH` with a join, the collection
 * filter, and the `bm25()` ordering are all untested by arithmetic, and an FTS5 table referenced
 * through an alias is exactly the kind of detail that fails at runtime and not at compile time.
 */

const record = (overrides: Partial<CorpusRecord> & Pick<CorpusRecord, "id" | "collection" | "textDisplay">): CorpusRecord => ({
  number: null,
  grade: null,
  gradeApplicable: true,
  gradeSource: "fixture",
  gradeBasis: "none",
  attribution: "Fixture",
  license: "CC0-1.0",
  licenseUrl: "https://example.invalid/licence",
  sourceUrl: "https://example.invalid/record",
  // Ingest is the only place a `textMatch` is created, and it folds the display text. Doing the
  // same here is what makes this a realistic fixture rather than a convenient one.
  textMatch: normalizeForMatch(overrides.textDisplay),
  ...overrides,
})

/**
 * A tiny two-corpus fixture, folded exactly the way ingest folds it.
 *
 * `quran:2` carries `gradeApplicable: false` on purpose: it is the case where a null grade has a
 * MEANING, and a projection that loses the flag would make it indistinguishable from a record the
 * dataset simply declines to grade.
 *
 * ## Why the hadith rows are `bukhari`, and why that detail is load-bearing
 *
 * They used to be `collection: "hadith"`, and that is the bug the fixture was hiding. A real
 * corpus has no `hadith` collection — `collection` is a per-source slug, and the hadith side is
 * five books (`abudawud`, `bukhari`, `malik`, `nasai`, `tirmidhi`). Naming a fixture collection
 * `"hadith"` made `hadithSearch`'s equally wrong `collection = 'hadith'` filter look correct: the
 * filter and the fixture agreed with each other and neither agreed with the data. A fixture that
 * invents a shape the corpus does not have cannot catch a filter that assumes one, so this one
 * now uses the slugs `data/corpus.db` actually contains.
 */
const fixture = (): readonly CorpusRecord[] => [
  record({ id: "quran:1", collection: "quran", number: "1", textDisplay: "بسم الله الرحمن الرحيم" }),
  record({ id: "quran:2", collection: "quran", number: "2", textDisplay: "الحمد لله رب العالمين", gradeApplicable: false }),
  // "مسجدا" against a "مسجد" query is what proves the prefix pass is reachable at all.
  record({ id: "bukhari:1", collection: "bukhari", number: "1", textDisplay: "من بنى مسجدا لله بنى الله له بيتا في الجنة" }),
  record({ id: "bukhari:2", collection: "bukhari", number: "2", textDisplay: "قال رسول الله صلى الله عليه وسلم" }),
]

/**
 * Delete a temp directory holding a snapshot, on Windows.
 *
 * One snapshot for the whole file, built once, after the fixture exists. Per-test temp directories
 * were the obvious shape and they are wrong on Windows: SQLite keeps the file locked briefly after
 * `close()`, so `rmSync` fails with EBUSY and the test reports a filesystem error instead of a
 * retrieval result. A single fixture plus retrying cleanup is both faster and honest about what is
 * being measured.
 *
 * The first version was `Bun.gc(true)` followed by one `rmSync` with `maxRetries`, and it failed about
 * one run in five. Both halves of it were wrong, in ways that hid each other:
 *
 *  - `maxRetries` retries the SYSCALL. It never re-runs the collection, and the handle is released by
 *    the collector, not by the retry — so every retry re-issued a syscall against a lock that could
 *    not lift, and `EBUSY` came back at the end of it.
 *  - `Bun.gc(true)` is a collection REQUEST. It collects what is already UNREACHABLE, and a module-level
 *    `const db` is reachable until the module itself is torn down — which happens after `afterAll`.
 *    So the one handle this cleanup exists to release was the one handle it could never collect, and
 *    no retry budget would have fixed it; only making the handle unreachable fixes it.
 *
 * Measured on this machine, 25 open/close/remove cycles: `rmSync(maxRetries: 10)` with no collection
 * failed 12/12; a single `Bun.gc(true)` first failed 0/12 but the retry-only variant still hit EBUSY
 * roughly 1 run in 25 once the handle stayed reachable; dropping the reference AND interleaving a
 * forced collection between attempts succeeded 25/25 at 2.0 attempts on average.
 *
 * The budget is then a SAFETY NET rather than the mechanism, and it is sized by the HOOK TIMEOUT
 * rather than by how long release takes. A 200-attempt budget removed the EBUSY failure entirely and
 * then cost 6.5s, which is over `bun test`'s 5s `afterAll` limit — so the suite went red with "a
 * beforeEach/afterEach hook timed out", a strictly worse message about the same directory. 40 attempts
 * is ~1s worst case and ~50ms typical: the mechanism (drop the reference, collect between attempts)
 * does the work and the budget only absorbs the residue, so a smaller budget loses nothing.
 *
 * Exhaustion warns and names the directory instead of throwing. `buildSnapshot` and the search path
 * both prepare statements, and on Windows a statement can outlive `close()` indefinitely, so there is
 * no budget that makes this certain — and a leftover temp directory may not fail a retrieval suite.
 */
const removeSnapshotDir = (root: string, attempts = 40, delayMs = 25): void => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rmSync(root, { recursive: true, force: true })
      return
    } catch {
      if (attempt === attempts) break
      Bun.gc(true)
      Bun.sleepSync(delayMs)
    }
  }
  // A leftover temp directory is noise, not a defect, and the temptation to throw here is exactly the
  // defect this file's own history records: the suite reported a filesystem error where the thing
  // under test is a retrieval result. So it warns and names the path — visible, actionable, and not
  // able to turn a green retrieval suite red for a reason that has nothing to do with retrieval.
  console.warn(`[search.test] could not remove ${root}; a temp directory will be left behind (EBUSY)`)
}

const root = mkdtempSync(join(tmpdir(), "mizan-retrieval-"))
const snapshotPath = join(root, "corpus.db")
buildSnapshot(snapshotPath, fixture())

/**
 * The one snapshot handle, in a box rather than a bare `const`.
 *
 * This is the other half of the Windows cleanup, and it is the half that actually mattered: a
 * module-level `const db` is reachable until the module is torn down, so `Bun.gc(true)` inside
 * `afterAll` can never collect it, and the lock it holds survives every retry. A binding the
 * teardown can clear makes the handle unreachable at the moment it matters — see the measurement in
 * `removeSnapshotDir`'s comment.
 *
 * `snapshot()` is the read path and throws rather than returning null, so no test has to handle the
 * "cleaned up early" state that `withSnapshot` used to imply was impossible.
 */
const opened: { db: ReturnType<typeof openSnapshot> | null } = { db: openSnapshot(snapshotPath) }

const snapshot = (): ReturnType<typeof openSnapshot> => {
  if (opened.db === null) throw new Error("the snapshot was closed during teardown")
  return opened.db
}

afterAll(() => {
  opened.db?.close()
  opened.db = null
  removeSnapshotDir(root)
})

const withSnapshot = (fn: (db: ReturnType<typeof openSnapshot>) => void): void => fn(snapshot())

const foundIds = (result: ReturnType<typeof search>): readonly string[] =>
  result.ok ? result.value.chunks.map((chunk) => chunk.id) : []

describe("search against a real FTS5 index", () => {
  test("a matching query returns records, not bare strings", () => {
    withSnapshot((db) => {
      const result = search(db, { text: "مسجد" })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.chunks.length).toBeGreaterThan(0)
      const chunk = result.value.chunks[0]
      expect(chunk?.id).toBe("bukhari:1")
      expect(chunk?.collection).toBe("bukhari")
      expect(chunk?.sourceUrl).toBe("https://example.invalid/record")
      expect(chunk?.attribution).toBe("Fixture")
      expect(chunk?.license).toBe("CC0-1.0")
    })
  })

  test("an inflected word is reachable only through the prefix pass", () => {
    withSnapshot((db) => {
      // "مسجد" is a prefix of "مسجدا". unicode61 does no stemming, so the OR and phrase passes
      // both return nothing and the prefix pass is the entire reason this is a hit at all.
      const tokens = prepareQuery("مسجد")
      if (!isOk(tokens)) throw new Error("expected tokens")
      expect(bm25Order(db, broadExpression(tokens.value), undefined, 10)).toEqual([])
      expect(bm25Order(db, phraseExpression(tokens.value), undefined, 10)).toEqual([])
      expect(bm25Order(db, prefixExpression(tokens.value), undefined, 10)).toEqual(["bukhari:1"])
      expect(foundIds(search(db, { text: "مسجد" }))).toEqual(["bukhari:1"])
    })
  })

  test("a one-word query does not count the OR and phrase passes as two opinions", () => {
    withSnapshot((db) => {
      // With one token the two expressions are identical, so only two DISTINCT passes exist and
      // `ranking` must not claim a fusion of three.
      const tokens = prepareQuery("مسجد")
      if (!isOk(tokens)) throw new Error("expected tokens")
      expect(expressionsFor(tokens.value).length).toBe(2)
    })
  })

  test("grade applicability survives the projection", () => {
    withSnapshot((db) => {
      const result = search(db, { text: "العالمين" })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const chunk = result.value.chunks[0]
      expect(chunk?.id).toBe("quran:2")
      expect(chunk?.grade).toBeNull()
      expect(chunk?.gradeApplicable).toBe(false)
    })
  })

  test("a folded query finds a diacriticized record, because the index holds textMatch", () => {
    withSnapshot((db) => {
      const result = search(db, { text: "الرَّحْمَن" })
      expect(foundIds(result)).toContain("quran:1")
    })
  })

  test("a query that matches nothing returns an empty list, never a fallback", () => {
    withSnapshot((db) => {
      const result = search(db, { text: "زيتница" })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.chunks).toEqual([])
      expect(result.value.count).toBe(0)
    })
  })

  test("an empty query is a typed rejection", () => {
    withSnapshot((db) => {
      const result = search(db, { text: "   " })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error._tag).toBe("empty_query")
    })
  })

  test("the scope filter is applied, not merely passed through", () => {
    withSnapshot((db) => {
      const quran = search(db, { text: "الله", scope: "quran" })
      expect(foundIds(quran).every((id) => id.startsWith("quran:"))).toBe(true)
      // The half of the fix that no previous test could have caught: `hadith` is an EXCLUSION of
      // the one non-hadith collection, so a hadith search is non-empty and contains no quran row.
      // Written against `collection: "hadith"`, this tool matched nothing at all.
      const hadith = search(db, { text: "الله", scope: "hadith" })
      expect(foundIds(hadith).length).toBeGreaterThan(0)
      expect(foundIds(hadith).some((id) => id.startsWith("quran:"))).toBe(false)
    })
  })

  test("the ordering is reproducible across repeated identical queries", () => {
    withSnapshot((db) => {
      const first = JSON.stringify(search(db, { text: "الله" }))
      const second = JSON.stringify(search(db, { text: "الله" }))
      expect(first).toBe(second)
    })
  })

  test("the limit is honoured, and a silly limit is clamped rather than trusted", () => {
    withSnapshot((db) => {
      const one = search(db, { text: "الله", limit: 1 })
      expect(foundIds(one).length).toBeLessThanOrEqual(1)
      const silly = search(db, { text: "الله", limit: 10_000 })
      if (!silly.ok) throw new Error("expected a result")
      expect(silly.value.chunks.length).toBeLessThanOrEqual(32)
    })
  })
})

describe("the tools", () => {
  /**
   * Both scope tests below assert NON-EMPTINESS first, and that is the whole point.
   *
   * The previous versions asked only that every returned id carry the right prefix, which
   * `[].every(...) === true` satisfies — so they passed while `hadithSearch` matched nothing at
   * all, and while its query matched no fixture record either. A scope filter that returns zero
   * rows is indistinguishable from a correct one when the assertion is vacuous, which is why these
   * use words that are really in the fixtures (`BUKHARI_1` and `QURAN_2_255`) and check the count.
   */
  test("quranSearch is pinned to the Qur'an, and finds the Qur'an", () => {
    withSnapshot((db) => {
      const result = quranSearch(db, { text: "العالمين" })
      expect(foundIds(result)).toContain("quran:2")
      expect(foundIds(result).every((id) => id.startsWith("quran:"))).toBe(true)
    })
  })

  test("hadithSearch is pinned to hadith, and finds hadith", () => {
    withSnapshot((db) => {
      const result = hadithSearch(db, { text: "مسجد" })
      // Non-empty is the assertion the old test could not make. `bukhari:1` contains this word
      // and lives in a hadith collection, so the scope has to let it through — and it could not
      // before, because the filter named a collection that does not exist.
      expect(foundIds(result)).toContain("bukhari:1")
      expect(foundIds(result).some((id) => id.startsWith("quran:"))).toBe(false)
    })
  })

  test("a missing snapshot is a typed refusal, not a crash", () => {
    const result = quranSearch(null, { text: "الله" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error._tag).toBe("snapshot_unavailable")
  })

  test("tafsirLookup refuses with a typed error rather than an empty list", () => {
    const result = tafsirLookup()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error._tag).toBe("backend_unavailable")
  })

  test("an in-budget query succeeds, so the budget check is not refusing everything", () => {
    withSnapshot((db) => {
      const result = hadithSearch(db, { text: "مسجد" })
      expect(result.ok).toBe(true)
    })
  })

  test("the budget is the documented 2s", () => {
    expect(TOOL_BUDGET_MS).toBe(2_000)
  })
})
