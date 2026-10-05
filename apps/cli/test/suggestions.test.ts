import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { SUGGESTION_DISCLAIMER, SUGGESTION_MEASUREMENT_SCOPE, normalizeForMatch, normalizeQuote, type Claim, type ClaimVerdict, type VerdictReport } from "@mizan/core"
import { buildSnapshot, openSnapshot, resolveCitations, toCorpusRecord } from "@mizan/corpus"
import { MIN_SHARED_RUN_CHARS, verifyAnswer } from "@mizan/verify"
import { buildSourceTable, renderReport } from "../src/render.ts"
import { suggestionFor, suggestionsFor, type SuggestionBlock } from "../src/suggestions.ts"

/**
 * The nearest-quote suggestions, end to end through the real pipeline.
 *
 * Nothing here is mocked: a real SQLite snapshot, the real resolver, the real verifier, and the real
 * renderer. The feature's whole claim is that the badge was computed and the suggestions were not
 * invented, so a test with a stubbed corpus would be testing the stub — and the most important
 * assertion in this file is the negative one: that the badge line is byte-identical with and without
 * suggestions.
 */

const SNAPSHOT_HASH = "a".repeat(64)

const VERSE = "الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم"

/** The fabricated quotation the demo's rejection uses: the verse with one word changed. */
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
  dir = mkdtempSync(join(tmpdir(), "mizan-suggest-test-"))
  const path = join(dir, "corpus.db")
  buildSnapshot(path, [
    build({ id: "quran:2:255", collection: "quran", number: "2:255", textDisplay: VERSE, sourceUrl: "https://example.invalid/2:255", grade: null, gradeBasis: "none", translation: null }),
    build({ id: "quran:2:255:2", collection: "quran", number: "2:255", textDisplay: VERSE, sourceUrl: "https://example.invalid/2:255", grade: null, gradeBasis: "none", translation: null }),
    build({ id: "quran:112:1", collection: "quran", number: "112:1", textDisplay: "قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد", sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
    // A second collection holding the verse verbatim, and a near neighbour of it. Without these two
    // rows a scope could not be distinguished from a search that simply finds nothing.
    build({ id: "bukhari:1", collection: "bukhari", number: "1", textDisplay: VERSE, sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
    build({ id: "bukhari:2", collection: "bukhari", number: "2", textDisplay: `${VERSE} ولا نوم`, sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
    // A third collection that EXISTS but holds nothing near the fabricated quote. This row is load
    // bearing for the widening tests, and the distinction it encodes is the whole point of them: a
    // citation into a collection that is absent from the snapshot resolves to nothing and the verifier
    // answers `unverifiable`, so no block is ever offered; only a citation into a collection that
    // resolves and comes up EMPTY reaches a widened list. Without this row the widening label would
    // be tested only through a direct call to `suggestionFor`, which is not a path a claim can take.
    // Latin script, so it can never clear the Arabic quote's floor and the ranked lists above are
    // unaffected by its presence.
    build({ id: "tirmidhi:1", collection: "tirmidhi", number: "1", textDisplay: "In the name of Allah, the Most Merciful", sourceUrl: null, grade: null, gradeBasis: "none", translation: null }),
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

const citation = (collection: string, number: string) => ({ collection, number, grade: null, raw: `${collection}:${number}` })

const claimOf = (quote: string): Claim => ({ id: "c1", text: "the model's prose", quote: normalizeQuote(quote), citations: [citation("quran", "2:255")] })

const verify = (claims: readonly Claim[]): VerdictReport => {
  const { resolved } = resolveCitations(db, claims.flatMap((claim) => claim.citations))
  return verifyAnswer({ claims, evidence: resolved, snapshotHash: SNAPSHOT_HASH })
}

const badgeLine = (text: string): string => text.split("\n").find((line) => line.startsWith("[")) ?? ""

const screen = (claims: readonly Claim[], suggestions: readonly (SuggestionBlock | null)[] | null): string => {
  const { resolved } = resolveCitations(db, claims.flatMap((claim) => claim.citations))
  return renderReport({
    prose: "answer",
    report: verify(claims),
    claims,
    sources: buildSourceTable(resolved),
    relevance: null,
    suggestions,
    transcript: "live",
    model: "test",
    sourceCount: 0,
    snapshotHash: SNAPSHOT_HASH,
  })
}

describe("a rejection is offered the records near its quote", () => {
  test("the real verifier rejects it, and the block names a real record", () => {
    const claims = [claimOf(FABRICATED)]
    const report = verify(claims)
    expect(report.claims[0]?.verdict).toBe("rejected")
    const block = suggestionFor(db, FABRICATED)
    expect(block).not.toBeNull()
    if (block === null) return
    if (block.suggestion.state !== "candidates") throw new Error(`expected candidates, got ${block.suggestion.state}`)
    // The fabricated verse is offered the real ones first, and the unrelated verse last: the floor
    // is on shared trigram TYPES, and Surah 112 genuinely shares several (`الله`, `ولم`, …) while
    // sharing almost none of its characters. Both are here because the display says "nearest", not
    // "related", and the run-length line tells the reader which is which.
    const ids = block.suggestion.candidates.map((candidate) => candidate.recordId)
    // The order of the two records holding the verse verbatim is deliberately NOT pinned. They are the
    // same text in two collections, so they tie on every key the ranker compares except `recordId`, and
    // ADR-10 fixes that tie by id — a rule `rank.test.ts` in `@mizan/suggest` owns and this file would
    // only restate. What matters to a reader is the claim the line is making: both verbatim holders
    // precede the verse that shares almost nothing with them.
    expect(ids.slice(0, 3).sort()).toEqual(["bukhari:1", "bukhari:2", "quran:2:255"])
    // Surah 112 is what this assertion is FOR, and it is now not returned at all. It cleared eight
    // shared 3-gram types — `الله`, `ولم` and friends are everywhere in Arabic — while sharing almost
    // no contiguous characters, so the reader was shown four unrelated records with no way to tell
    // that from four relevant ones. The display floor drops it, the list shortens rather than being
    // padded, and the reason is a unit the reader can check on the line it would have been printed on.
    expect(ids).not.toContain("quran:112:1")
    expect(block.suggestion.candidates.length).toBeLessThan(5)
    for (const candidate of block.suggestion.candidates) {
      expect(candidate.sharedRunChars).toBeGreaterThanOrEqual(MIN_SHARED_RUN_CHARS)
    }
  })

  test("the returned rows are dense from 1 after the floor drops some, because rank is a line number", () => {
    // A floor that filtered would otherwise leave the ranker's own numbers on screen: 1, 3, 4 —
    // positions in a list the reader never saw. A rank that is not the line number misdirects the
    // correction it would support, which points a caret at a specific record.
    const block = suggestionFor(db, FABRICATED)
    if (block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    expect(block.suggestion.candidates.map((candidate) => candidate.rank)).toEqual(
      block.suggestion.candidates.map((_candidate, index) => index + 1),
    )
  })

  test("the quote's own length rides the block once, and every row is measured against it", () => {
    const block = suggestionFor(db, FABRICATED)
    if (block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    // One denominator for the whole list: the same quote cannot have two lengths, and "35 of 60"
    // beside "8 of 62" would be two different questions.
    expect(block.suggestion.quoteChars).toBeGreaterThan(0)
    for (const candidate of block.suggestion.candidates) {
      expect(candidate.sharedRunChars).toBeLessThanOrEqual(block.suggestion.quoteChars)
    }
  })

  test("the two identical verses produce one line, not two", () => {
    // The snapshot holds the same verse under two ids. Listing it twice would read as two
    // independent sources for a fabrication, which is the opposite of the truth.
    const block = suggestionFor(db, FABRICATED)
    if (block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    const ids = block.suggestion.candidates.map((candidate) => candidate.recordId)
    expect(ids).toContain("quran:2:255")
    expect(ids).toContain("bukhari:1")
    expect(ids).toContain("bukhari:2")
    expect(ids).not.toContain("quran:2:255:2")
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("how many records were returned out of how many were scanned is printed, so the scope is visible", () => {
    // "N of M records searched" implied that the N on screen was what the search kept. What a reader
    // needs to see is the pair: what they got, and what was read to get it. A list of two out of six
    // is a deliberate answer to a narrow question; "2 records searched" is the same two numbers
    // describing a search that found two things and stopped.
    const block = suggestionFor(db, FABRICATED)
    if (block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    expect(block.suggestion.considered).toBe(6)
    const claims = [claimOf(FABRICATED)]
    const text = screen(claims, suggestionsFor(db, claims, verify(claims).claims))
    // Scoped to the collection the citation named, so the six scanned records are answered by the one
    // in that book. `2` here is the count that actually cleared the display floor, not the count the
    // ranker produced — that distinction is the whole point of the header line.
    expect(text).toContain("1 returned of 6 records scanned")
  })

  test("the disclaimer is printed, in the shared spelling", () => {
    const claims = [claimOf(FABRICATED)]
    const text = screen(claims, suggestionsFor(db, claims, verify(claims).claims))
    expect(text).toContain(SUGGESTION_DISCLAIMER)
  })
})

/**
 * What the floor under every printed row was measured over, stated on screen.
 *
 * `data/eval/redteam-fabricated.json` — the set `bun run eval:suggestions` chose
 * `MIN_SHARED_RUN_CHARS` from — has forty anchors and every one is a hadith (`abudawud`,
 * `ibnmajah`, `malik`). A reader who sees `shared: 11 of 60` beside a quranic record has no way to
 * know the threshold was never checked against a quranic case, and the honest surface for a
 * measurement nobody took is to say so (AGENTS.md §16).
 *
 * These tests pin the disclosure AND its boundary: it must not claim the SEARCH was hadith-only,
 * because the scan reads every served collection and a quranic record is in the list above it.
 */
describe("the measurement coverage is disclosed, and is not confused with the search scope", () => {
  const textFor = (claims: readonly Claim[]): string => screen(claims, suggestionsFor(db, claims, verify(claims).claims))

  test("a candidate list says the floor was measured on hadith cases only", () => {
    expect(textFor([claimOf(FABRICATED)])).toContain(SUGGESTION_MEASUREMENT_SCOPE)
  })

  test("the disclosure names the collections that are unmeasured, rather than implying the list is narrow", () => {
    const text = textFor([claimOf(FABRICATED)])
    expect(text).toContain("hadith cases only")
    expect(text).toContain("quran and tirmidhi are unmeasured")
  })

  test("a quranic record in the list does not make the search hadith-only, and the copy must not say it is", () => {
    // The distinction the line exists to keep. The scope line already states the truth about the
    // search — `whole snapshot` — and a disclosure that contradicted it would be a worse defect than
    // the silence it replaced. `suggestionFor(..., null)` is what a claim citing nothing produces.
    const claims = [claimOf(FABRICATED)]
    const text = screen(claims, [suggestionFor(db, FABRICATED, null)])
    expect(text).toContain(SUGGESTION_MEASUREMENT_SCOPE)
    expect(text).toContain("whole snapshot")
  })

  test("no_candidates is disclosed too, because the floor is what decided it", () => {
    const nothing: readonly Claim[] = [
      { id: "c1", text: "prose", quote: normalizeQuote("نص لا يوجد في هذه المجموعة إطلاقا أبدا"), citations: [citation("bukhari", "1")] },
    ]
    const text = screen(nothing, suggestionsFor(db, nothing, verify(nothing).claims))
    expect(text).toContain(SUGGESTION_MEASUREMENT_SCOPE)
  })

  test("a state where no floor was applied makes no measurement claim", () => {
    // `unavailable` means the corpus could not be searched. A coverage disclosure there would describe
    // a measurement that never happened, which is the same over-claiming as an invented count.
    const broken = new Database(":memory:")
    broken.exec("CREATE TABLE records (id TEXT, collection TEXT, textMatch TEXT)")
    broken.exec("INSERT INTO records (id, collection, textMatch) VALUES ('bad:1', 'x', NULL)")
    const claims = [claimOf(FABRICATED)]
    const text = renderReport({
      prose: "answer",
      report: verify(claims),
      claims,
      sources: new Map(),
      relevance: null,
      suggestions: [suggestionFor(broken, FABRICATED)],
      transcript: "live",
      model: "test",
      sourceCount: 0,
      snapshotHash: SNAPSHOT_HASH,
    })
    expect(text).toContain(SUGGESTION_DISCLAIMER)
    expect(text).not.toContain(SUGGESTION_MEASUREMENT_SCOPE)
    broken.close()
  })
})

describe("scoping to the collection the citation named", () => {
  const claimCiting = (collection: string, number: string, quote: string): readonly Claim[] => [
    { id: "c1", text: "prose", quote: normalizeQuote(quote), citations: [citation(collection, number)] },
  ]

  test("a cited collection is answered from its own records, never from another book's", () => {
    const block = suggestionFor(db, FABRICATED, "bukhari")
    if (block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    expect(block.suggestion.scope).toEqual({ kind: "collection", collection: "bukhari" })
    expect(block.suggestion.candidates.map((candidate) => candidate.collection)).toEqual(["bukhari", "bukhari"])
  })

  test("the scope is printed, so a reader can see which book the lines came from", () => {
    const claims = claimCiting("bukhari", "1", FABRICATED)
    const text = screen(claims, suggestionsFor(db, claims, verify(claims).claims))
    expect(text).toContain("2 returned of 6 records scanned, within bukhari")
  })

  test("a collection with nothing near the quote widens, and says which collection came up empty", () => {
    // `tirmidhi` is not in the fixture snapshot at all. Returning whole-snapshot lines here is a
    // finding — a fabrication resembling nothing in the book that was cited — but it is only useful
    // if the reader is told the cited book had nothing, which is what `widenedFrom` is for.
    const block = suggestionFor(db, FABRICATED, "tirmidhi")
    if (block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    expect(block.suggestion.scope).toEqual({ kind: "snapshot", widenedFrom: "tirmidhi" })
  })

  test("a widened list is labelled as widened, never printed as if it were scoped", () => {
    const claims = claimCiting("tirmidhi", "1", FABRICATED)
    const text = screen(claims, suggestionsFor(db, claims, verify(claims).claims))
    expect(text).toContain("whole snapshot — nothing was close within tirmidhi")
    expect(text).not.toContain("within tirmidhi:")
  })

  test("a claim with no citation at all searches the snapshot and says so", () => {
    const orphan: readonly Claim[] = [{ id: "c1", text: "prose", quote: normalizeQuote(FABRICATED), citations: [] }]
    const block = suggestionFor(db, FABRICATED, null)
    if (block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    expect(block.suggestion.scope).toEqual({ kind: "snapshot", widenedFrom: null })
    expect(suggestionsFor(db, orphan, [])).toEqual([null])
  })

  test("only the FIRST citation sets the scope, because a model-chosen scope is not a scope", () => {
    const twoCollections: readonly Claim[] = [
      {
        id: "c1",
        text: "prose",
        quote: normalizeQuote(FABRICATED),
        citations: [citation("quran", "2:255"), citation("bukhari", "1")],
      },
    ]
    // `evidence: null` is filled, not omitted: the schema requires the field and it means "no
    // record resolved", which is exactly what a hand-built verdict for this shape asserts. Omitting
    // it would make a missing field indistinguishable from a resolved one (E1.2).
    const blocks = suggestionsFor(db, twoCollections, [{ claimId: "c1", verdict: "rejected", reason: "quote_absent_at_cited_id", matchStrength: { kind: "none" }, evidence: null }])
    const block = blocks[0]
    // `blocks[0]` is `SuggestionBlock | null | undefined` under noUncheckedIndexedAccess: the
    // array is indexed and the index can be out of range, so the element is narrowed before any
    // property of it is read (E1.3).
    if (block === undefined || block === null || block.suggestion.state !== "candidates") throw new Error("expected candidates")
    expect(block.suggestion.scope).toEqual({ kind: "collection", collection: "quran" })
  })
})

describe("the badge is untouched by every state of the feature", () => {
  // Resolved lazily inside each test: a `describe` body runs while the suite is being collected,
  // which is before `beforeAll`, and calling the resolver there dereferences a `db` that does not
  // exist yet. Two errors between tests, zero failures — the kind of green that is not green.
  const claimsOf = () => [claimOf(FABRICATED)]
  const reportOf = (claims: readonly Claim[]) => verify(claims)

  test("the badge line is byte-identical with and without suggestions", () => {
    const claims = claimsOf()
    const report = reportOf(claims)
    const without = screen(claims, null)
    const withSuggestions = screen(claims, suggestionsFor(db, claims, report.claims))
    expect(badgeLine(withSuggestions)).toBe(badgeLine(without))
    expect(badgeLine(without)).toContain("REJECTED")
  })

  test("the verdict report object is the same object either way", () => {
    // The strongest form of the claim: the suggestions pass receives the report and returns it
    // unchanged. A pass that mutated a verdict could not pass this.
    const claims = claimsOf()
    const report = reportOf(claims)
    const before = JSON.stringify(report)
    suggestionsFor(db, claims, report.claims)
    expect(JSON.stringify(report)).toBe(before)
  })

  test("a verified claim is offered nothing at all", () => {
    const contained = [claimOf(VERSE)]
    const report = reportOf(contained)
    expect(report.claims[0]?.verdict).toBe("verified")
    expect(suggestionsFor(db, contained, report.claims)).toEqual([null])
    expect(screen(contained, suggestionsFor(db, contained, report.claims))).not.toContain(SUGGESTION_DISCLAIMER)
  })

  test("a claim with no quotation is offered nothing", () => {
    const empty = [claimOf("   ")]
    expect(suggestionsFor(db, empty, reportOf(empty).claims)).toEqual([null])
  })

  test("a citation that resolves to nothing gets no suggestions, because it produced no evidence", () => {
    // The verifier answers an unresolvable citation `unverifiable`, not `rejected`: there was no
    // record to compare the quote against, so there is no rejection to sit under. Offering
    // neighbours here would put a list of records under a claim that no evidence ever touched —
    // the feature would be answering a question nobody asked. The renderer's own ability to print a
    // block it is handed is covered by the `unavailable` test above; this pins the POLICY.
    const claims: readonly Claim[] = [{ id: "c9", text: "prose", quote: normalizeQuote(FABRICATED), citations: [citation("quran", "999:999")] }]
    const report = reportOf(claims)
    expect(report.claims[0]?.verdict).toBe("unverifiable")
    expect(suggestionsFor(db, claims, report.claims)).toEqual([null])
    const text = screen(claims, suggestionsFor(db, claims, report.claims))
    expect(text).toContain("no record in this snapshot matches quran 999:999")
    expect(text).not.toContain(SUGGESTION_DISCLAIMER)
    // The badge is still the badge: the absence of a block changed nothing above it.
    expect(badgeLine(text)).toContain("UNVERIFIABLE")
  })
})

describe("the honest failure states", () => {
  test("a quote nothing resembles says which of the two failures it was, and the block counts what it scanned", () => {
    // Surah 1, which shares less than the floor of eight shared trigram types with anything in this
    // fixture — checked rather than assumed, because "nothing resembles this" is a claim about the
    // snapshot and the snapshot grows. The English sentence this used to name is no longer an example
    // of anything: it is now near `tirmidhi:1`, which is the fixture agreeing that it is close.
    //
    // The reason names WHICH floor produced nothing. "Nothing was near enough to rank" and "nothing
    // ranked was close enough to show" are different facts about a reader's quote, and one string for
    // both would tell someone their fabrication matched nothing when five records matched it a little.
    const block = suggestionFor(db, "الحمد لله رب العالمين")
    if (block === null || block.suggestion.state !== "no_candidates") throw new Error("expected no_candidates")
    expect(block.suggestion.reason).toBe("nothing in the corpus was near enough to rank")

    // And the counts and the scope are on the block, which is where the renderer reads them from.
    expect(block.suggestion.considered).toBe(6)
    const claims = [claimOf("الحمد لله رب العالمين")]
    const text = screen(claims, suggestionsFor(db, claims, verify(claims).claims))
    expect(text).toContain("0 returned of 6 records scanned, whole snapshot")
  })

  test("an empty quote is not a search and not a failure", () => {
    expect(suggestionFor(db, "  ")).toBeNull()
  })

  test("a corpus row that cannot be read is `unavailable`, never an empty list", () => {
    // The three columns a candidate scan actually reads, so this fixture exercises the failure its name
    // claims — a ROW that will not decode. A table too thin to query at all is a different failure with
    // a different tag, and `packages/mizan-corpus` covers it as `parse_failed`.
    const broken = new Database(":memory:")
    broken.exec("CREATE TABLE records (id TEXT, collection TEXT, textMatch TEXT)")
    broken.exec("INSERT INTO records (id, collection, textMatch) VALUES ('good:1', 'x', 'نص'), ('bad:1', 'x', NULL)")
    const block = suggestionFor(broken, "نص")
    if (block === null || block.suggestion.state !== "unavailable") throw new Error("expected unavailable")
    expect(block.suggestion.reason).toContain("row_undecodable")
    // The reason names the failure, never the row's text.
    expect(block.suggestion.reason).not.toContain("نص")
    broken.close()
  })

  test("`unavailable` still prints the disclaimer, because silence would read as a search", () => {
    const broken = new Database(":memory:")
    broken.exec("CREATE TABLE records (id TEXT, collection TEXT, textMatch TEXT)")
    broken.exec("INSERT INTO records (id, collection, textMatch) VALUES ('bad:1', 'x', NULL)")
    const claims = [claimOf(FABRICATED)]
    const text = renderReport({
      prose: "answer",
      report: verify(claims),
      claims,
      sources: new Map(),
      relevance: null,
      suggestions: [suggestionFor(broken, FABRICATED)],
      transcript: "live",
      model: "test",
      sourceCount: 0,
      snapshotHash: SNAPSHOT_HASH,
    })
    expect(text).toContain(SUGGESTION_DISCLAIMER)
    expect(text).toContain("row_undecodable")
    // The two things the degradation matrix promises about this surface, asserted on the rendered
    // string rather than on the reason alone. `bad:1` is the record id the failure carries and `نص` is
    // the row's text; a matrix that documented "the tag alone" while the renderer printed either would
    // be the same drift the cycle exists to remove, and the only way to notice is to pin both.
    expect(text).not.toContain("bad:1")
    expect(text).not.toContain("نص")
    // No count either: there was no search to count, so a number on this line would describe nothing.
    expect(text).not.toContain("records scanned")
    broken.close()
  })
})

describe("the rendered block says nothing a reader could turn into a verdict", () => {
  // One lazily built screen, because the assertions below are about absence: what a reader CANNOT
  // read off the screen is only observable by inspecting the whole screen at once. The lazy getter
  // matters — a `describe` body runs before `beforeAll`, so building this eagerly would dereference
  // a `db` that does not exist yet. It cost two errors between tests and zero failed assertions.
  let cached: string | null = null
  const text = (): string => {
    cached ??= (() => {
      const claims = [claimOf(FABRICATED)]
      return screen(claims, suggestionsFor(db, claims, verify(claims).claims))
    })()
    return cached
  }

  test("prints no percentage, no score word and no quotient", () => {
    expect(text()).not.toContain("%")
    expect(text()).not.toContain("percent")
    expect(text()).not.toContain("confidence")
    expect(text()).not.toContain("score")
    expect(text()).not.toMatch(/\b\d+\s*(out of|\/)\s*\d+\s*%/)
  })

  test("prints the folded character counts as two integers, labelled display-only", () => {
    expect(text()).toContain("folded characters — display only, never a verdict")
  })

  test("prints the record's own transcription, not its folded matching key", () => {
    // `textMatch` is a key, not a transcription. The suggestion block must show `textDisplay`.
    // Scoped to the block after the disclaimer because the Sprint-2 correction above it
    // deliberately prints a folded run and says so on the line under it.
    const block = text().slice(text().indexOf(SUGGESTION_DISCLAIMER))
    expect(block).toContain(VERSE)
    expect(block).not.toContain(normalizeForMatch(VERSE))
  })

  test("names the record's own collection and number, and its source URL", () => {
    expect(text()).toContain("quran 2:255")
    expect(text()).toContain("https://example.invalid/2:255")
  })

  test("carries no grade for a record whose dataset asserts none", () => {
    // AGENTS.md §15: a grade is never ours, and a collection that has no grade concept prints
    // nothing rather than printing "none".
    expect(text()).not.toContain("grade:")
  })

  // The three forbidden affordances of a suggestion block, as one test because they are one failure:
  // a block that leans on any of them stops being evidence and becomes advice. Each probe is matched
  // on a word boundary, so a legitimate citation that happens to contain a substring does not trip.
  const FORBIDDEN = {
    // Assertiveness: the block's whole value is that it shows a record instead of vouching for one.
    assertiveness: /\b(verified|authentic|genuine|correct|true|accurate|confirmed|valid|proves?|proven)\b/i,
    // Chatty openers: the register of a reading assistant, not of a citation.
    chattiness: /\b(it (looks|seems|appears)|you (might|should|may|could)|perhaps|maybe|great question|let me|i (think|believe|suggest))\b/i,
    // Question echo: the block locates the claim's quotation in the corpus. Restating the question
    // beside it would put the model's framing in front of the reader as if it were the finding.
    questionEcho: /\b(your question|the question|you asked|as you asked|in response to)\b/i,
  } as const
  const hits = (subject: string): readonly string[] => Object.entries(FORBIDDEN).filter(([, pattern]) => pattern.test(subject)).map(([name]) => name)

  test("the three forbidden affordances are absent: assertiveness, chatty openers, question echo", () => {
    const block = text().slice(text().indexOf(SUGGESTION_DISCLAIMER))
    expect(hits(block)).toEqual([])
  })

  test("that probe is not vacuous: it fires on a block carrying all three", () => {
    // A negative assertion over a word list is worth nothing if the list never matches anything, and a
    // regex that silently stopped matching is the exact inert-rule failure this repository treats as a
    // defect. So the detector is checked against a positive control before it is trusted to report the
    // absence above: a block that does all three forbidden things must trip all three probes.
    const control = `${SUGGESTION_DISCLAIMER}\nit looks like this is verified and accurate\nyou might find your question answered here`
    expect(hits(control)).toEqual(["assertiveness", "chattiness", "questionEcho"])
  })

  test("a suggested record is shown, never quoted back as the reader's own question", () => {
    // The positive half of "question echo": the corpus text IS on the block, because that is the whole
    // feature. What must not happen is the block presenting it as an answer to a question the reader is
    // never shown having asked - so the verse is present and the model's own prose is not.
    const block = text().slice(text().indexOf(SUGGESTION_DISCLAIMER))
    expect(block).toContain(VERSE)
    expect(block).not.toContain("the model's prose")
  })
})

describe("the pass is positional", () => {
  test("a mixed report gives a block only to the rejected claim", () => {
    const claims = [claimOf(VERSE), claimOf(FABRICATED)]
    const report = verify(claims)
    const blocks = suggestionsFor(db, claims, report.claims)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toBeNull()
    expect(blocks[1]?.suggestion.state).toBe("candidates")
  })

  test("a report with no verdicts renders without a block and without crashing", () => {
    const empty: readonly Claim[] = []
    expect(suggestionsFor(db, empty, [])).toEqual([])
    const claims: readonly Claim[] = [claimOf(FABRICATED)]
    // A report SHORTER than the claims list: the positional contract must tolerate it. The empty
    // array is already a well-typed `readonly ClaimVerdict[]`, so this case needs no cast — the
    // `any` cast that used to stand here was a hole in the positional-contract typecheck rather than
    // a description of the case (E1.1, AGENTS.md §2).
    const verdicts: readonly ClaimVerdict[] = []
    expect(suggestionsFor(db, claims, verdicts)).toEqual([null])
  })
})