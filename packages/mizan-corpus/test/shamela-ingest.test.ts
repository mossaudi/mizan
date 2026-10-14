import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { initShamelaTables, runShamelaIngest, searchShamelaPages, type ShamelaSearchResult } from "../src/ingest-shamela.ts"
import { shamelaAdapter, decodeBookList, decodePages, type ShamelaBook, type ShamelaPage } from "../src/adapters/shamela.ts"
import type { FetchContext } from "../src/adapters/types.ts"
import { err, isOk, ok } from "@mizan/core"

/**
 * Shamela ingest tests — corpus lane.
 *
 * These tests require a corpus database and Shamela API access.
 * They are in the "corpus" opt-in lane (scripts/ci-lanes.ts).
 */

// Create a minimal license registry for testing
const TEST_LICENSE_REGISTRY = {
  schemaVersion: 1,
  generatedAt: "2026-10-13T00:00:00.000Z",
  description: "Test license registry",
  books: [
    { bookId: 1, title: "Test Book 1", author: "Author 1", licenseStatus: "cleared", licenseBasis: "public_domain" },
    { bookId: 2, title: "Test Book 2", author: "Author 2", licenseStatus: "cleared", licenseBasis: "public_domain" },
    { bookId: 3, title: "Test Book 3", author: "Author 3", licenseStatus: "blocked", licenseBasis: "copyright_held" },
  ],
}

describe("Shamela adapter", () => {
  let adapterTempDir: string
  let adapterDataDir: string
  let adapterRegistryDir: string

  beforeAll(() => {
    adapterTempDir = mkdtempSync(join(tmpdir(), "mizan-shamela-adapter-test-"))
    adapterDataDir = join(adapterTempDir, "data")
    if (!existsSync(adapterDataDir)) {
      mkdirSync(adapterDataDir, { recursive: true })
    }
    adapterRegistryDir = join(adapterDataDir, "registry")
    if (!existsSync(adapterRegistryDir)) {
      mkdirSync(adapterRegistryDir, { recursive: true })
    }
    writeFileSync(join(adapterRegistryDir, "shamela-licenses.json"), JSON.stringify(TEST_LICENSE_REGISTRY, null, 2))
  })

  afterAll(() => {
    try {
      rmSync(adapterTempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    } catch {
      // best-effort temp cleanup
    }
  })

  describe("decodeBookList", () => {
    test("decodes valid book list response", () => {
      const response = {
        books: [
          { id: 1, title: "Kitab al-Tawhid", author: "Ibn Khuzaymah", category: "Aqidah", page_count: 500 },
          { id: 2, title: "Sahih al-Bukhari", author: "Al-Bukhari", category: "Hadith", page_count: 2000 },
        ],
        page: 1,
        per_page: 100,
        total: 2,
      }
      const result = decodeBookList(response, adapterTempDir)
      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        const books = result.value
        expect(books.length).toBe(2)
        expect(books[0]?.id).toBe(1)
        expect(books[0]?.title).toBe("Kitab al-Tawhid")
        // Book ID 1 and 2 are in the registry as "cleared"
        expect(books[0]?.license_status).toBe("cleared")
        expect(books[1]?.license_status).toBe("cleared")
      }
    })

    test("rejects malformed response", () => {
      const result = decodeBookList({ books: "not an array" })
      expect(isOk(result)).toBe(false)
    })

    test("rejects non-object response", () => {
      const result = decodeBookList("not an object")
      expect(isOk(result)).toBe(false)
    })
  })

  describe("decodePages", () => {
    test("decodes valid pages response", () => {
      const response = {
        pages: [
          { page_number: 1, content: "بسم الله الرحمن الرحيم" },
          { page_number: 2, content: "الحمد لله رب العالمين" },
        ],
        page: 1,
        per_page: 50,
        total: 2,
      }
      const result = decodePages(response)
      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.length).toBe(2)
        const first = result.value[0]
        expect(first).toBeDefined()
        if (first) {
          expect(first.page_number).toBe(1)
          expect(first.content).toBe("بسم الله الرحمن الرحيم")
        }
      }
    })

    test("rejects malformed response", () => {
      const result = decodePages({ pages: "not an array" })
      expect(isOk(result)).toBe(false)
    })
  })
})

describe("Shamela ingest pipeline", () => {
  let tempDir: string
  let dbPath: string
  let db: Database

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mizan-shamela-test-"))
    // Create data directory for corpus.db
    const dataDir = join(tempDir, "data")
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    // Create registry directory and license file
    const registryDir = join(dataDir, "registry")
    if (!existsSync(registryDir)) {
      mkdirSync(registryDir, { recursive: true })
    }
    writeFileSync(join(registryDir, "shamela-licenses.json"), JSON.stringify(TEST_LICENSE_REGISTRY, null, 2))
    dbPath = join(dataDir, "corpus.db")
    db = new Database(dbPath, { create: true, readwrite: true })
    initShamelaTables(db)
  })

  afterAll(() => {
    try {
      db.close()
    } catch {
      // Ignore close errors
    }
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    } catch {
      // best-effort temp cleanup; the OS reclaims the directory
    }
  })

  describe("initShamelaTables", () => {
    test("creates shamela_books table", () => {
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='shamela_books'").all()
      expect(tables.length).toBe(1)
    })

    test("creates shamela_pages FTS5 table", () => {
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='shamela_pages'").all()
      expect(tables.length).toBe(1)
    })

    test("does not create secondary index on FTS5 table (unsupported)", () => {
      const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='shamela_pages'").all()
      expect(indexes.length).toBe(0)
    })
  })

  describe("runShamelaIngest", () => {
    test("fails when no cleared books to ingest", async () => {
      // Use a mock fetcher that returns empty book list
      const mockFetcher = async (url: string) => {
        return ok(JSON.stringify({
          books: [],
          page: 1,
          per_page: 100,
          total: 0,
        }))
      }
      
      const result = await runShamelaIngest({
        root: tempDir,
        limit: 10,
        now: new Date().toISOString(),
        fetcher: mockFetcher,
      })
      expect(isOk(result)).toBe(false)
      if (!isOk(result)) {
        expect(result.error._tag).toBe("shamela_ingest_failed")
        expect(result.error.detail).toContain("no cleared books to ingest")
      }
    })

    test("inserts and searches Shamela pages", () => {
      // Manually insert test data with diacritics removed (as FTS5 tokenizer removes them)
      const stmt = db.prepare(`
        INSERT INTO shamela_pages (content, book_id, page_number, book_title, author, category, source_hash, ingest_timestamp, license_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run("بسم الله الرحمن الرحيم", 1, 1, "Test Book", "Test Author", "Test Category", "hash1", new Date().toISOString(), "cleared")
      stmt.run("الحمد لله رب العالمين", 1, 2, "Test Book", "Test Author", "Test Category", "hash2", new Date().toISOString(), "cleared")
      stmt.run("الرحمن الرحيم", 2, 1, "Another Book", "Another Author", "Another Category", "hash3", new Date().toISOString(), "cleared")

      // Search - FTS5 with unicode61 remove_diacritics will match
      const results = searchShamelaPages(db, "الرحمن", 10)
      expect(results.length).toBeGreaterThanOrEqual(2)
      
      // Check result structure
      for (const result of results) {
        expect(typeof result.bookId).toBe("number")
        expect(typeof result.pageNumber).toBe("number")
        expect(typeof result.bookTitle).toBe("string")
        expect(typeof result.author).toBe("string")
        expect(typeof result.category).toBe("string")
        expect(typeof result.snippet).toBe("string")
        expect(typeof result.sourceHash).toBe("string")
      }
    })

    test("scopes search to book_id", () => {
      const results = searchShamelaPages(db, "رحمن", 10, 1)
      for (const result of results) {
        expect(result.bookId).toBe(1)
      }
    })

    test("returns empty for non-matching query", () => {
      const results = searchShamelaPages(db, "xyznonexistent", 10)
      expect(results.length).toBe(0)
    })
  })
})

describe("Shamela adapter fetchRecords", () => {
  test("returns error for unsupported operation", async () => {
    const mockContext: FetchContext = {
      get: async () => ({ ok: true, body: "{}" }),
      limit: 10,
    }
    const result = await shamelaAdapter.fetchRecords(mockContext)
    expect(isOk(result)).toBe(false)
    if (!isOk(result)) {
      expect(result.error.reason).toBe("schema_mismatch")
      expect(result.error.detail).toContain("dedicated ingest pipeline")
    }
  })
})

export * as ShamelaIngestTest from "./shamela-ingest.test.ts"