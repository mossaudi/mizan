import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { executeSearchShamela, executeReadShamelaPage, SHAMELA_TOOLS } from "../src/tools/shamela-tools.ts"
import { initShamelaTables } from "@mizan/corpus"
import { sha256Hex } from "@mizan/core"

const initMainTables = (db: Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      number TEXT,
      textDisplay TEXT NOT NULL,
      textMatch TEXT NOT NULL,
      grade TEXT,
      gradeApplicable INTEGER NOT NULL DEFAULT 0,
      gradeSource TEXT,
      attribution TEXT,
      license TEXT,
      sourceUrl TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
      textMatch,
      recordId UNINDEXED,
      collection UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 1'
    )
  `)
}

/**
 * Shamela MCP tools tests — corpus lane.
 *
 * These tests require a corpus database with Shamela tables populated.
 * They are in the "corpus" opt-in lane (scripts/ci-lanes.ts).
 */

describe("Shamela MCP tools", () => {
  let tempDir: string
  let dbPath: string
  let db!: Database
  const questionHash = sha256Hex("test question")

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mizan-shamela-mcp-test-"))
    const dataDir = join(tempDir, "data")
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
    dbPath = join(dataDir, "corpus.db")
    db = new Database(dbPath, { create: true, readwrite: true })
    initShamelaTables(db)
    initMainTables(db)

    // Insert test data into Shamela
    const shamelaStmt = db.prepare(`
      INSERT INTO shamela_pages (content, book_id, page_number, book_title, author, category, source_hash, ingest_timestamp, license_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const content1 = "بسم الله الرحمن الرحيم"
    const content2 = "الحمد لله رب العالمين"
    const content3 = "الرحمن الرحيم"
    shamelaStmt.run(content1, 1, 1, "تفسير الطبري", "الطبري", "تفسير", sha256Hex(content1), new Date().toISOString(), "cleared")
    shamelaStmt.run(content2, 1, 2, "تفسير الطبري", "الطبري", "تفسير", sha256Hex(content2), new Date().toISOString(), "cleared")
    shamelaStmt.run(content3, 1, 3, "تفسير الطبري", "الطبري", "تفسير", sha256Hex(content3), new Date().toISOString(), "cleared")

    // Insert test data into main corpus (Quran + Hadith)
    const mainStmt = db.prepare(`
      INSERT INTO records (id, collection, number, textDisplay, textMatch, grade, gradeApplicable, gradeSource, attribution, license, sourceUrl)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const records = [
      { id: "quran:1:1", collection: "quran", number: "1:1", textDisplay: "بسم الله الرحمن الرحيم", textMatch: "بسم الله الرحمن الرحيم", grade: null, gradeApplicable: 0, gradeSource: "tanzil/quran-uthmani", attribution: "Qur'an", license: "no-derivatives", sourceUrl: "https://tanzil.net" },
      { id: "quran:2:255", collection: "quran", number: "2:255", textDisplay: "الله لا إله إلا هو الحي القيوم", textMatch: "الله لا إله إلا هو الحي القيوم", grade: null, gradeApplicable: 0, gradeSource: "tanzil/quran-uthmani", attribution: "Qur'an", license: "no-derivatives", sourceUrl: "https://tanzil.net" },
      { id: "bukhari:1", collection: "bukhari", number: "1", textDisplay: "إنما الأعمال بالنيات", textMatch: "انما الاعمال بالنيات", grade: "sahih", gradeApplicable: 1, gradeSource: "quranlab/hadith", attribution: "Sahih al-Bukhari", license: "content-only", sourceUrl: "https://sunnah.com/bukhari:1" },
      { id: "muslim:1", collection: "muslim", number: "1", textDisplay: "بنى الإسلام على خمس", textMatch: "بنى الاسلام على خمس", grade: "sahih", gradeApplicable: 1, gradeSource: "quranlab/hadith", attribution: "Sahih Muslim", license: "content-only", sourceUrl: "https://sunnah.com/muslim:1" },
    ]
    for (const r of records) {
      mainStmt.run(r.id, r.collection, r.number, r.textDisplay, r.textMatch, r.grade, r.gradeApplicable, r.gradeSource, r.attribution, r.license, r.sourceUrl)
      db.prepare(`INSERT INTO records_fts (textMatch, recordId, collection) VALUES (?, ?, ?)`).run(r.textMatch, r.id, r.collection)
    }
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

  describe("SHAMELA_TOOLS", () => {
    test("exports two tools: search_shamela and read_shamela_page", () => {
      expect(SHAMELA_TOOLS.length).toBe(2)
      expect(SHAMELA_TOOLS[0].name).toBe("search_shamela")
      expect(SHAMELA_TOOLS[1].name).toBe("read_shamela_page")
    })

    test("each tool has inputSchema with required fields", () => {
      for (const tool of SHAMELA_TOOLS) {
        expect(tool.inputSchema.type).toBe("object")
        expect(tool.inputSchema.properties).toBeDefined()
        expect(tool.inputSchema.required).toBeDefined()
        expect(Array.isArray(tool.inputSchema.required)).toBe(true)
      }
    })
  })

  describe("executeSearchShamela", () => {
    test("rejects missing query", () => {
      const result = executeSearchShamela(db, {}, questionHash)
      expect(result.isError).toBe(true)
      const error = JSON.parse(result.content[0]!.text).error
      expect(error.reason).toBe("invalid_arguments")
      expect(error.detail).toContain("query is required")
    })

    test("rejects empty query", () => {
      const result = executeSearchShamela(db, { query: "" }, questionHash)
      expect(result.isError).toBe(true)
    })

    test("rejects query too long", () => {
      const longQuery = "ا".repeat(501)
      const result = executeSearchShamela(db, { query: longQuery }, questionHash)
      expect(result.isError).toBe(true)
    })

    test("rejects invalid bookId", () => {
      const result = executeSearchShamela(db, { query: "الرحمن", bookId: -1 }, questionHash)
      expect(result.isError).toBe(true)
    })

    test("rejects invalid limit", () => {
      const result = executeSearchShamela(db, { query: "الرحمن", limit: -5 }, questionHash)
      expect(result.isError).toBe(true)
    })

    test("returns results for valid query", () => {
      const result = executeSearchShamela(db, { query: "الرحمن", limit: 10 }, questionHash)
      expect(result.isError).not.toBe(true)
      const data = JSON.parse(result.content[0]!.text)
      expect(data.questionHash).toBe(questionHash)
      expect(Array.isArray(data.results)).toBe(true)
      expect(typeof data.count).toBe("number")
    })

    test("scopes to bookId when provided", () => {
      const result = executeSearchShamela(db, { query: "الرحمن", bookId: 1, limit: 10 }, questionHash)
      expect(result.isError).not.toBe(true)
      const data = JSON.parse(result.content[0]!.text)
      for (const r of data.results) {
        expect(r.collection).toBe("shamela")
        expect(r.ref.startsWith("1:")).toBe(true)
      }
    })

    test("accepts custom weights", () => {
      const result = executeSearchShamela(db, { 
        query: "الرحمن", 
        limit: 10, 
        weights: { quran: 0.5, hadith: 0.5, shamela: 1.5 } 
      }, questionHash)
      expect(result.isError).not.toBe(true)
    })
  })

  describe("executeReadShamelaPage", () => {
    test("rejects missing bookId", () => {
      const result = executeReadShamelaPage(db, { pageNumber: 1 }, questionHash)
      expect(result.isError).toBe(true)
      const error = JSON.parse(result.content[0]!.text).error
      expect(error.reason).toBe("invalid_arguments")
    })

    test("rejects missing pageNumber", () => {
      const result = executeReadShamelaPage(db, { bookId: 1 }, questionHash)
      expect(result.isError).toBe(true)
    })

    test("rejects invalid bookId", () => {
      const result = executeReadShamelaPage(db, { bookId: 0, pageNumber: 1 }, questionHash)
      expect(result.isError).toBe(true)
    })

    test("rejects invalid pageNumber", () => {
      const result = executeReadShamelaPage(db, { bookId: 1, pageNumber: -1 }, questionHash)
      expect(result.isError).toBe(true)
    })

    test("returns page metadata with content hash for valid request", () => {
      const result = executeReadShamelaPage(db, { bookId: 1, pageNumber: 1 }, questionHash)
      expect(result.isError).not.toBe(true)
      const data = JSON.parse(result.content[0]!.text)
      expect(data.questionHash).toBe(questionHash)
      expect(data.bookId).toBe(1)
      expect(data.pageNumber).toBe(1)
      expect(typeof data.bookTitle).toBe("string")
      expect(typeof data.author).toBe("string")
      expect(typeof data.category).toBe("string")
      expect(typeof data.contentHash).toBe("string")
      expect(typeof data.sourceHash).toBe("string")
      // Verify contentHash is a valid sha256 hex (64 chars)
      expect(data.contentHash).toHaveLength(64)
      expect(data.contentHash).toMatch(/^[a-f0-9]{64}$/)
    })

    test("returns not_found for non-existent page", () => {
      const result = executeReadShamelaPage(db, { bookId: 999, pageNumber: 1 }, questionHash)
      expect(result.isError).toBe(true)
      const error = JSON.parse(result.content[0]!.text).error
      expect(error.reason).toBe("not_found")
    })
  })
})

export * as ShamelaToolsTest from "./shamela-tools.test.ts"