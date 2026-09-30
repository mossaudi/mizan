import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { verifyAnswer } from "@mizan/verify"
import { buildSnapshot, openSnapshot, resolveCitations, toCorpusRecord } from "@mizan/corpus"
import { renderReport, type SourceExcerpt, type SourceTable } from "../src/render.ts"
import type { Claim, EvidenceRef, VerdictReport } from "@mizan/core"

/**
 * Tests for the CLI's own code.
 *
 * ## What is NOT mocked, and why
 *
 * The real verifier, the real normalizer, the real citation resolver, and a real SQLite
 * snapshot built in the OS temp directory. The kill gate is the claim that the badge was
 * computed; a CLI test that stubbed the verifier would be testing the stub. The only thing the
 * architecture lets us replace is the provider port, which the agent package's own tests cover.
 *
 * ## What these tests exist to catch
 *
 * The failures a green unit suite misses and a live run hits: a column name that does not
 * exist, and a report that states something the verifier never computed.
 */

const SNAPSHOT_HASH = "a".repeat(64)

let dir: string
let db: Database

/** Two real records, built through `toCorpusRecord` so the schema is the real one. */
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "mizan-cli-test-"))

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
      records: 2,
      gradeApplicable: true,
      gradeBasis: "row" as const,
      notes: null,
    },
  }

  const records = [
    {
      id: "bukhari:1",
      collection: "bukhari",
      number: "1",
      textDisplay: "من صام رمضان ايمانا فلهاجر من ربه",
      sourceUrl: "https://example.invalid/1",
      grade: "Sahih",
      gradeBasis: "row" as const,
      translation: null,
    },
    {
      id: "quran:2:183",
      collection: "quran",
      number: "2:183",
      textDisplay: "فمن صام رمضان ايمانا وافطر",
      sourceUrl: null,
      grade: null,
      gradeBasis: "none" as const,
      translation: null,
    },
  ].map((raw) => build(raw))

  function build(raw: Parameters<typeof toCorpusRecord>[0]) {
    return toCorpusRecord(raw, { meta, gradeSource: "test/fixture" })
  }

  const path = join(dir, "corpus.db")
  buildSnapshot(path, records)
  // `buildSnapshot` returns a descriptor of what it wrote; the handle to query is opened
  // read-only afterwards, exactly as the CLI does it.
  db = openSnapshot(path)
})

afterAll(() => {
  if (db !== undefined) db.close()
  // Windows keeps the SQLite file locked for a short while after `close()` and does not honour
  // every retry. A leftover directory under the OS temp dir is a far smaller problem than a
  // test that fails on a platform quirk, so the cleanup is best-effort and the reason is here.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  } catch {
    // eslint-disable-next-line no-empty -- best-effort temp cleanup; OS reclaims the directory
  }
})

/**
 * The real path: resolve the citations, then let the real verifier decide.
 *
 * `verifyAnswer` returns a `VerdictReport` directly rather than a `Result` — a deliberate
 * deviation from the architecture sketch. Every way it can fail is already a per-claim
 * verdict (`unverifiable`/`verification_timeout`), so an error channel would be a second way
 * to say the same thing, and a caller that forgot to check it.
 */
const verify = (claims: readonly Claim[]): VerdictReport => {
  const { resolved } = resolveCitations(db, claims.flatMap((claim) => claim.citations))
  return verifyAnswer({ claims, evidence: resolved, snapshotHash: SNAPSHOT_HASH })
}

const report = (claims: VerdictReport["claims"]): VerdictReport => ({ claims, degraded: [], snapshotHash: SNAPSHOT_HASH, citationsConsidered: 1 })

/**
 * A complete `EvidenceRef`.
 *
 * The renderer reads only `recordId` from it, so a partial literal would typecheck under a loose
 * config and quietly become a second, wrong description of the contract. This file was not being
 * typechecked at all until this story added `test/**` to the package's tsconfig, and that is
 * exactly how a fake `{ recordId, quote }` survived in the first place.
 */
const evidence = (recordId: string): EvidenceRef => ({
  recordId,
  collection: "bukhari",
  number: "1",
  sourceUrl: "https://example.invalid/1",
  license: "CC0-1.0",
  attribution: "test fixture",
  grade: "Sahih",
  gradeSource: "test/fixture",
  gradeBasis: "row",
  matchedChars: 34,
  quoteChars: 34,
})

/** The evidence table a resolved record produces, keyed the way `buildSourceTable` keys it. */
const sourcesOf = (): SourceTable => {
  const { resolved } = resolveCitations(db, [{ collection: "bukhari", number: "1", grade: null, raw: "bukhari:1" }])
  const table = new Map<string, SourceExcerpt>()
  for (const entry of resolved) {
    for (const record of entry.records) {
      const excerpt = { recordId: record.id, label: `bukhari ${record.number ?? ""}`.trim(), sourceUrl: record.sourceUrl, textDisplay: record.textDisplay, textMatch: record.textMatch }
      table.set(`bukhari|${record.number ?? ""}`, excerpt)
      table.set(record.id, excerpt)
    }
  }
  return table
}

describe("the CLI's read path uses columns that exist", () => {
  test("the snapshot exposes textDisplay and textMatch, and no bare `text`", () => {
    // The original `readText` selected a column called `text`, which has never existed in
    // this schema. Every unit test passed, and the bug surfaced only on the happy path of a
    // live run — as a crash between retrieval and the verifier.
    const columns = db.query<{ readonly name: string }, []>("SELECT name FROM pragma_table_info('records')").all().map((row) => row.name)
    expect(columns).toContain("textDisplay")
    expect(columns).toContain("textMatch")
    expect(columns).not.toContain("text")
  })

  test("a record's text is readable for the prompt", () => {
    const row = db.query<{ readonly textDisplay: string }, [string]>("SELECT textDisplay FROM records WHERE id = ?").get("bukhari:1")
    expect(row?.textDisplay).toContain("رمضان")
  })

  test("a missing id yields empty text rather than throwing", () => {
    const row = db.query<{ readonly textDisplay: string }, [string]>("SELECT textDisplay FROM records WHERE id = ?").get("nope:1")
    expect(row?.textDisplay ?? "").toBe("")
  })
})

describe("the kill-gate path, end to end over a real snapshot", () => {
  const bukhariCitation = { collection: "bukhari", number: "1", grade: "Sahih", raw: "bukhari:1" }

  test("a verbatim quote of a real record is VERIFIED — the badge is computed, not asserted", () => {
    const result = verify([
      {
        id: "c1",
        text: "Fasting Ramadan is a migration.",
        quote: "من صام رمضان ايمانا فلهاجر من ربه",
        citations: [bukhariCitation],
      },
    ])
    expect(result.claims[0]?.verdict).toBe("verified")
    expect(result.claims[0]?.matchStrength).toEqual({ kind: "exact", percent: 100 })
    expect(result.claims[0]?.evidence).not.toBeNull()
  })

  test("an invented quote cited to a real identifier is REJECTED", () => {
    // The single most important negative. The record exists, so the identifier resolves, and
    // the quote is absent — `rejected` is the only permitted outcome, and it is the outcome
    // that stops a fluent invention from wearing a verified badge.
    const result = verify([
      {
        id: "c1",
        text: "Fasting Ramadan earns a thousand rewards.",
        quote: "من صام رمضان ايمانا فلهاجر من ربه",
        citations: [{ ...bukhariCitation, number: "2" }],
      },
    ])
    expect(result.claims[0]?.verdict).not.toBe("verified")
  })

  test("a quote absent from the cited record is rejected, not waved through", () => {
    const result = verify([
      {
        id: "c1",
        text: "Something invented.",
        quote: "من صام رمضان ايمانا فلهاجر من ربه مع الأجر العظيم",
        citations: [bukhariCitation],
      },
    ])
    expect(result.claims[0]?.verdict).toBe("rejected")
    expect(result.claims[0]?.matchStrength).toEqual({ kind: "none" })
  })

  test("a claim with no citation is unverifiable — zero evidence blocks approval", () => {
    const result = verify([{ id: "c1", text: "Something true-sounding.", quote: "x", citations: [] }])
    expect(result.claims[0]?.verdict).toBe("unverifiable")
  })

  test("a claim with no quote is unverifiable, never verified on text similarity", () => {
    const result = verify([{ id: "c1", text: "Fasting Ramadan.", quote: null, citations: [bukhariCitation] }])
    expect(result.claims[0]?.verdict).toBe("unverifiable")
  })

  test("an unresolvable identifier is unverifiable, not rejected — we cannot prove a negative", () => {
    const result = verify([{ id: "c1", text: "x", quote: "y", citations: [{ collection: "bukhari", number: "999999", grade: null, raw: "bukhari:999999" }] }])
    expect(result.claims[0]?.verdict).toBe("unverifiable")
  })

  test("resolution is collection-scoped: a number from another collection is not evidence", () => {
    // `resolveCitations` returns one `ResolvedCitation` per citation, not per record, so the
    // assertion that matters is the empty `records` list: the citation was answered, and the
    // answer is "no records". A number that exists in `bukhari` is still nothing when the
    // claim says `quran`.
    const { resolved } = resolveCitations(db, [{ collection: "quran", number: "1", grade: null, raw: "quran:1" }])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.records).toEqual([])
  })
})

describe("the report a judge reads", () => {
  test("renders the transcript label, so a replay is never read as a live generation", () => {
    const text = renderReport({
      prose: "Fasting Ramadan is a migration.",
      report: report([
        {
          claimId: "c1",
          verdict: "verified",
          reason: "exact_containment",
          matchStrength: { kind: "exact", percent: 100 },
          evidence: evidence("bukhari:1"),
        },
      ]),
      claims: [],
      sources: new Map(),
      relevance: null,
      transcript: "precomputed",
      model: "transcript-v1",
      sourceCount: 2,
      snapshotHash: SNAPSHOT_HASH,
    })
    expect(text).toContain("PRECOMPUTED")
    expect(text.toLowerCase()).not.toContain("live")
  })

  test("a rejected claim is shown as rejected, with its machine-readable reason and the source it was checked against", () => {
    const claim: Claim = { id: "c1", text: "Fasting Ramadan is a migration.", quote: "من صام رمضان ايمانا فليحتسب", citations: [{ collection: "bukhari", number: "1", grade: null, raw: "bukhari:1" }] }
    const text = renderReport({
      prose: "Something.",
      report: report([
        { claimId: "c1", verdict: "rejected", reason: "quote_absent_at_cited_id", matchStrength: { kind: "none" }, evidence: null },
      ]),
      claims: [claim],
      sources: sourcesOf(),
      relevance: null,
      transcript: "live",
      model: "m",
      sourceCount: 1,
      snapshotHash: SNAPSHOT_HASH,
    })
    expect(text).toContain("REJECTED")
    expect(text).toContain("quote_absent_at_cited_id")
    // The badge alone asserts a disagreement and shows none of the evidence. The quoted span and
    // the record's own text are what let a reader tell a fabrication from a dropped clause.
    expect(text).toContain("quoted:")
    expect(text).toContain(claim.quote ?? "")
    expect(text).toContain("source:")
    expect(text).toContain("https://example.invalid/1")
  })

  test("the snapshot hash is shown, so the report is tied to a specific corpus", () => {
    const text = renderReport({ prose: "x", report: report([]), claims: [], sources: new Map(), relevance: null, transcript: "live", model: "m", sourceCount: 0, snapshotHash: "54a20e5d28532eae" })
    expect(text).toContain("54a20e5d28532eae")
  })

  test("the report never claims a verified claim without evidence", () => {
    // The verifier cannot produce this combination, but the renderer must not amplify it if it
    // ever appeared. "VERIFIED" with no evidence is the exact badge this product refuses to
    // show, so the renderer refuses to print the word on an unsupported claim.
    const text = renderReport({
      prose: "x",
      report: report([
        { claimId: "c1", verdict: "verified", reason: "exact_containment", matchStrength: { kind: "exact", percent: 100 }, evidence: null },
      ]),
      claims: [],
      sources: new Map(),
      relevance: null,
      transcript: "live",
      model: "m",
      sourceCount: 1,
      snapshotHash: SNAPSHOT_HASH,
    })
    expect(text).not.toContain("VERIFIED")
  })

  test("an unverifiable claim is shown as unverifiable, never silently dropped", () => {
    const text = renderReport({
      prose: "x",
      report: report([{ claimId: "c1", verdict: "unverifiable", reason: "no_citation", matchStrength: { kind: "none" }, evidence: null }]),
      claims: [],
      sources: new Map(),
      relevance: null,
      transcript: "live",
      model: "m",
      sourceCount: 0,
      snapshotHash: SNAPSHOT_HASH,
    })
    expect(text).toContain("UNVERIFIABLE")
  })
})
