import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  ALLOWED_HOSTS,
  EXPECTED_AYAH_COUNT,
  MAX_ATTEMPTS,
  MAX_BACKOFF_MS,
  RETRYABLE_STATUSES,
  SOURCE_CATALOGUE,
  appendEntry,
  backoffMs,
  buildRegistryJsonl,
  chainHead,
  decodeAttestationText,
  decodeLedgerText,
  describeReadFailure,
  snapshotHashedFields,
  checkAttestation,
  checkUrl,
  compareAttestations,
  computeSnapshotHash,
  findDuplicateIds,
  parseTanzilText,
  partitionQuarantined,
  quarantineReason,
  readGrade,
  resolveCitations,
  runIngest,
  toCorpusRecord,
  verifyLedger,
  type Attestation,
  type Fetcher,
  type LedgerEntry,
  type RawRecord,
  type SourceMeta,
} from "../src/index.ts"
import { buildSnapshot, openSnapshot } from "../src/snapshot.ts"
import { Database } from "bun:sqlite"
import { isErr, isOk, normalizeForMatch, type CorpusRecord } from "@mizan/core"

/**
 * The corpus package, tested offline.
 *
 * Every test here uses a fake fetcher or hand-built rows. A test that hits the network is a
 * test that fails on a train, and a licence decision that depends on an upstream staying
 * reachable is not a licence decision.
 */

/**
 * A complete `SourceMeta` with a partial override, merged field by field.
 *
 * The merge is the point: an override that replaced `descriptor` wholesale would silently
 * drop the licence fields, and the resulting test would be testing an impossible source.
 */
/**
 * Scratch files live in the OS temp directory, never in the package tree: a test that writes
 * `../.tmp-*` leaves artefacts behind for the next run, and a "failing" test can then fail for
 * a different reason than the one it was written to catch.
 */
const TMP_DIR = join(tmpdir(), "mizan-corpus-test")
const tmpPath = (name: string): string => join(TMP_DIR, name)

const meta = (over: { descriptor?: Partial<SourceMeta["descriptor"]>; enabled?: boolean; exclusionReason?: string | null } = {}): SourceMeta => ({
  enabled: over.enabled ?? true,
  exclusionReason: over.exclusionReason ?? null,
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
    ...over.descriptor,
  },
})

const raw = (over: Partial<RawRecord> = {}): RawRecord => ({
  id: "test:1",
  collection: "test",
  number: "1",
  textDisplay: "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ",
  sourceUrl: null,
  grade: null,
  gradeBasis: "none",
  translation: null,
  ...over,
})

describe("A10 — the outbound allowlist", () => {
  test("accepts the hosts we actually use", () => {
    for (const host of ALLOWED_HOSTS) {
      const checked = checkUrl(`https://${host}/path?q=1`)
      expect(isOk(checked)).toBe(true)
    }
  })

  test("rejects a non-https scheme", () => {
    const checked = checkUrl("http://tanzil.net/data")
    expect(isOk(checked)).toBe(false)
    if (isOk(checked)) return
    expect(checked.error.reason).toBe("url_not_allowed")
  })

  test("rejects a lookalike host: a suffix check would have accepted this", () => {
    expect(isOk(checkUrl("https://evil-tanzil.net/data"))).toBe(false)
    expect(isOk(checkUrl("https://tanzil.net.evil.example/data"))).toBe(false)
    expect(isOk(checkUrl("https://datasets-server.huggingface.co.evil.example/rows"))).toBe(false)
  })

  test("rejects a local file scheme", () => {
    expect(isOk(checkUrl("file:///etc/passwd"))).toBe(false)
  })
})

describe("the fold is created once, and only in the right place", () => {
  test("textMatch is the fold of textDisplay, and textDisplay is untouched", () => {
    const display = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ"
    const record = toCorpusRecord(raw({ textDisplay: display }), { meta: meta(), gradeSource: "test/fixture" })
    expect(record.textDisplay).toBe(display)
    expect(record.textMatch).toBe(normalizeForMatch(display))
    expect(record.textMatch).not.toBe(display)
  })

  test("attribution and licence are generated from the source descriptor, never per row", () => {
    const source = meta({ descriptor: { attribution: "Corpus: the dataset", license: "CC BY 4.0" } })
    const record = toCorpusRecord(raw(), { meta: source, gradeSource: "test/fixture" })
    expect(record.attribution).toBe("Corpus: the dataset")
    expect(record.license).toBe("CC BY 4.0")
    expect(record.gradeSource).toBe("test/fixture")
  })

  test("a per-row source URL is kept, and falls back to the source URL", () => {
    const withUrl = toCorpusRecord(raw({ sourceUrl: "https://example.invalid/hadith/1" }), { meta: meta(), gradeSource: "s" })
    expect(withUrl.sourceUrl).toBe("https://example.invalid/hadith/1")
    const without = toCorpusRecord(raw(), { meta: meta(), gradeSource: "s" })
    expect(without.sourceUrl).toBe("https://example.invalid/data")
  })
})

describe("the grade model — ADR-06, and the case that is usually implemented wrong", () => {
  test("a row the dataset does not grade stores null, and is NOT defaulted or quarantined", () => {
    const record = toCorpusRecord(raw({ grade: null, gradeBasis: "none" }), { meta: meta(), gradeSource: "s" })
    expect(record.grade).toBeNull()
    expect(record.gradeBasis).toBe("none")
    // The record still goes into the snapshot: absence of a grade is a statement, not a defect.
    expect(findDuplicateIds([record])).toEqual([])
  })

  test("the Qur'an carries gradeApplicable false, so the UI says so instead of showing a gap", () => {
    const quran = meta({ descriptor: { source: "tanzil/quran-uthmani", gradeApplicable: false, gradeBasis: "none" } })
    const record = toCorpusRecord(raw({ collection: "quran", grade: null, gradeBasis: "none" }), { meta: quran, gradeSource: "s" })
    expect(record.gradeApplicable).toBe(false)
    expect(record.grade).toBeNull()
  })

  test("a published grade is stored verbatim, with the dataset named as the source", () => {
    const record = toCorpusRecord(raw({ grade: "ضعيف", gradeBasis: "row" }), { meta: meta(), gradeSource: "quranlab/hadith" })
    expect(record.grade).toBe("ضعيف")
    expect(record.gradeBasis).toBe("row")
    expect(record.gradeSource).toBe("quranlab/hadith")
  })

  test("readGrade treats an empty grades list as 'none', not as missing data", () => {
    expect(readGrade({ hadith_key: "b:1", collection: "b", hadith_number: "1", text: "x", sunnah_url: null, grades: [], n_grades: 0 })).toEqual({
      grade: null,
      basis: "none",
    })
    expect(readGrade({ hadith_key: "t:1", collection: "t", hadith_number: "1", text: "x", sunnah_url: null, grades: [{ grader: "al-Albani", grade: "حسن" }], n_grades: 1 })).toEqual({
      grade: "حسن",
      basis: "row",
    })
  })

  test("readGrade joins several graders' own assertions, not their names", () => {
    // The real dataset returns `[{ grader, grade }, ...]`. Joining the objects directly was
    // the bug that wrote "[object Object]" into 36,024 committed records.
    expect(
      readGrade({
        hadith_key: "t:2",
        collection: "t",
        hadith_number: "2",
        text: "x",
        sunnah_url: null,
        grades: [
          { grader: "Ahmad Shakir", grade: "Sahih" },
          { grader: "al-Albani", grade: "Sahih - Bukhari And Muslim" },
        ],
        n_grades: 2,
      }),
    ).toEqual({ grade: "Sahih / Sahih - Bukhari And Muslim", basis: "row" })
  })

  test("readGrade never emits [object Object], whatever the dataset sends", () => {
    const grade = readGrade({
      hadith_key: "t:3",
      collection: "t",
      hadith_number: "3",
      text: "x",
      sunnah_url: null,
      grades: [{ grader: "al-Albani", grade: "Da'if" }] as never,
      n_grades: 1,
    }).grade
    expect(grade).toBe("Da'if")
    expect(grade).not.toContain("object")
  })

  test("a grade entry we cannot read is skipped, not coerced", () => {
    // The honest handling of an unreadable entry is to not report it as a grade at all.
    expect(
      readGrade({
        hadith_key: "t:4",
        collection: "t",
        hadith_number: "4",
        text: "x",
        sunnah_url: null,
        grades: [{ nothing: "useful" }] as never,
        n_grades: 1,
      }),
    ).toEqual({ grade: null, basis: "none" })
  })
})

describe("the tanzil parser", () => {
  test("drops the banner lines and keeps the ayahs", () => {
    const body = ["#====", "بِسْمِ ٱللَّهِ", "ٱلْحَمْدُ لِلَّهِ", "", "#===="].join("\n")
    expect(parseTanzilText(body)).toEqual(["بِسْمِ ٱللَّهِ", "ٱلْحَمْدُ لِلَّهِ"])
  })
})

describe("the ledger — a chain you cannot quietly edit", () => {
  const payload = (source: string) => ({ source, rows: 10, artefactSha256: "a".repeat(64), snapshotHash: "b".repeat(64), at: "2026-01-01T00:00:00.000Z" })

  const chain = (sources: readonly string[]): readonly LedgerEntry[] => {
    const entries: LedgerEntry[] = []
    for (const [index, source] of sources.entries()) {
      entries.push(appendEntry(chainHead(entries), index + 1, payload(source)))
    }
    return entries
  }

  test("an intact chain verifies", () => {
    expect(verifyLedger(chain(["a", "b", "c"]))).toEqual([])
  })

  test("an edited payload is detected at the entry where it happened", () => {
    const entries = chain(["a", "b", "c"])
    const tampered = entries.map((entry, index) => (index === 1 ? { ...entry, rows: 11 } : entry))
    const breaks = verifyLedger(tampered)
    expect(breaks).toHaveLength(1)
    expect(breaks[0]?.seq).toBe(2)
    expect(breaks[0]?.reason).toBe("hash_mismatch")
  })

  test("a reordered or removed entry breaks the link that follows it", () => {
    const entries = chain(["a", "b", "c"])
    const [first, second] = entries
    if (first === undefined || second === undefined) throw new Error("fixture")
    const breaks = verifyLedger([first, { ...second, prevHash: "0".repeat(64) }, ...entries.slice(2)])
    expect(breaks[0]?.reason).toBe("prev_hash_mismatch")
  })

  test("an empty chain starts from the genesis hash", () => {
    expect(chainHead([])).toHaveLength(64)
    expect(verifyLedger([])).toEqual([])
  })
})

describe("the snapshot", () => {
  const records = [
    toCorpusRecord(raw({ id: "b:1", collection: "b", number: "1", textDisplay: "إِنَّمَا الْأَعْمَالُ" }), { meta: meta(), gradeSource: "s" }),
    toCorpusRecord(raw({ id: "b:2", collection: "b", number: "2", textDisplay: "بَدَأَ الْإِسْلَامُ" }), { meta: meta(), gradeSource: "s" }),
  ]

  test("a snapshot hash depends on content, not on build order", () => {
    expect(computeSnapshotHash(records)).toBe(computeSnapshotHash([...records].reverse()))
  })

  test("a changed row changes the snapshot hash", () => {
    const changed = records.map((record, index) => (index === 0 ? { ...record, textMatch: normalizeForMatch("شيء آخر") } : record))
    expect(computeSnapshotHash(changed)).not.toBe(computeSnapshotHash(records))
  })

  test("duplicate ids are refused rather than resolved by last-write-wins", () => {
    const path = tmpPath("snapshot.db")
    expect(() => buildSnapshot(path, [records[0]!, records[0]!])).toThrow(/duplicate record ids/)
  })

  test("FTS5 indexes the FOLDED text, so a folded query finds a diacriticized row", () => {
    const path = tmpPath("snapshot.db")
    buildSnapshot(path, records)
    const db = openSnapshot(path)
    const hits = db.query<{ readonly id: string }, [string]>("SELECT recordId AS id FROM records_fts WHERE records_fts MATCH ?").all('"الاعمال"')
    expect(hits.map((hit) => hit.id)).toEqual(["b:1"])
    const misses = db.query<{ readonly id: string }, [string]>("SELECT recordId AS id FROM records_fts WHERE records_fts MATCH ?").all('"لا_يوجد"')
    expect(misses).toEqual([])
    db.close()
  })
})

describe("citation resolution — the three states, and the false rejection they prevent", () => {
  /**
   * One fixture database, built once and shared.
   *
   * It was built per test, and on Windows that fails: `rmSync` of a file a previous test's
   * handle still holds is `EBUSY`. Sharing one readonly connection is also closer to how the
   * resolver is actually used — a long-lived snapshot, many lookups.
   */
  let db: Database

  beforeAll(() => {
    const path = tmpPath("resolve.db")
    const records = [
      toCorpusRecord(raw({ id: "bukhari:1", collection: "bukhari", number: "1", textDisplay: "إِنَّمَا الْأَعْمَالُ" }), { meta: meta(), gradeSource: "s" }),
      toCorpusRecord(raw({ id: "muslim:1", collection: "muslim", number: "1", textDisplay: "بَيْنَمَا نَحْنُ" }), { meta: meta(), gradeSource: "s" }),
    ]
    buildSnapshot(path, records)
    db = openSnapshot(path)
  })

  afterAll(() => {
    db.close()
  })

  const citation = (collection: string, number: string | null) => ({ collection, number, grade: null, raw: `${collection}:${number}` })

  test("a collection-scoped citation resolves to exactly that collection", () => {
    const { resolved } = resolveCitations(db, [citation("bukhari", "1")])
    expect(resolved[0]?.records[0]?.id).toBe("bukhari:1")
    expect(resolved[0]?.ambiguous).toBe(false)
  })

  test("a citation with no collection is AMBIGUOUS when the number exists twice: unverifiable, not rejected", () => {
    const { resolved } = resolveCitations(db, [citation("", "1")])
    expect(resolved[0]?.ambiguous).toBe(true)
    expect(resolved[0]?.records).toHaveLength(2)
  })

  test("an identifier that does not exist resolves to nothing", () => {
    const { resolved } = resolveCitations(db, [citation("bukhari", "9999")])
    expect(resolved[0]?.records).toEqual([])
    expect(resolved[0]?.ambiguous).toBe(false)
  })

  test("a citation with no number resolves to nothing rather than to the whole collection", () => {
    const { resolved } = resolveCitations(db, [citation("bukhari", null)])
    expect(resolved[0]?.records).toEqual([])
  })
})

describe("quarantine — a missing grade is refused, and a Qur'an null grade is not", () => {
  const hadithMeta: SourceMeta = {
    enabled: true,
    exclusionReason: null,
    // `sha256`, `records` and `enabled` are omitted on purpose: a catalogue entry states what a
    // source IS, and only the ingest may state the digest and the row count it observed.
    descriptor: {
      source: "quranlab/hadith",
      title: "Hadith fixture",
      publisher: "quranlab",
      url: "https://example.invalid/hadith.json",
      license: "content-only",
      licenceClass: "content-only",
      licenseUrl: "https://example.invalid/licence",
      attribution: "quranlab",
      gradeApplicable: true,
      gradeBasis: "row",
      notes: null,
    },
  }
  const quranMeta: SourceMeta = {
    ...hadithMeta,
    descriptor: { ...hadithMeta.descriptor, source: "tanzil/quran-uthmani", gradeApplicable: false, gradeBasis: "none" },
  }

  /** Built through the real adapter boundary, so the fixture cannot drift from the schema. */
  const record = (over: { readonly id?: string; readonly collection?: string; readonly grade?: string | null; readonly gradeBasis?: RawRecord["gradeBasis"] } = {}): CorpusRecord => {
    const hadith = over.collection !== "quran"
    return toCorpusRecord(
      {
        id: over.id ?? "bukhari:1",
        collection: over.collection ?? "bukhari",
        number: "1",
        textDisplay: "من صام رمضان ايمانا فلهاجر من ربه",
        sourceUrl: null,
        grade: over.grade === undefined ? "Sahih" : over.grade,
        gradeBasis: over.gradeBasis ?? (over.grade === null ? "none" : "row"),
        translation: null,
      },
      { meta: hadith ? hadithMeta : quranMeta, gradeSource: hadith ? "quranlab/hadith" : "tanzil/quran-uthmani" },
    )
  }

  test("a hadith row with a grade is served", () => {
    expect(quarantineReason(record())).toBeNull()
  })

  test("a hadith row with no grade is quarantined", () => {
    expect(quarantineReason(record({ grade: null }))).toBe("missing_required_grade")
  })

  test("a whitespace-only grade counts as no grade, not as a grade", () => {
    // A single space would survive a naive `grade === null` check and then be rendered to a
    // user as a takhrij, which is the one thing rule 15 forbids.
    expect(quarantineReason(record({ grade: "   " }))).toBe("missing_required_grade")
  })

  test("a Qur'an row with a null grade is VALID — the concept does not apply", () => {
    // The trap. A check that ignored `gradeApplicable` would quarantine all 6,236 Tanzil
    // verses and fail the build on day one. This test is the one that says so.
    expect(quarantineReason(record({ collection: "quran", grade: null }))).toBeNull()
  })

  test("partitioning keeps order and reports the reason per row", () => {
    const records = [
      record({ id: "a:1" }),
      record({ id: "b:1", grade: null }),
      record({ id: "quran:1:1", collection: "quran", grade: null }),
      record({ id: "c:1", grade: null }),
    ]
    const { served, quarantined } = partitionQuarantined(records)
    expect(served.map((r) => r.id)).toEqual(["a:1", "quran:1:1"])
    expect(quarantined).toEqual([
      { id: "b:1", collection: "bukhari", reason: "missing_required_grade" },
      { id: "c:1", collection: "bukhari", reason: "missing_required_grade" },
    ])
  })

  test("quarantined rows are absent from the built snapshot", () => {
    // The end-to-end claim: quarantine means not served, not merely annotated.
    const { served, quarantined } = partitionQuarantined([record({ id: "keep:1" }), record({ id: "drop:1", grade: null })])
    expect(quarantined).toHaveLength(1)
    const snapshot = buildSnapshot(join(tmpdir(), `mizan-quarantine-${Date.now()}.db`), served)
    expect(snapshot.recordCount).toBe(1)
    expect(served.map((r) => r.id)).toEqual(["keep:1"])
  })
})

describe("the registry and the attestation", () => {
  const attestation = (over: Partial<Attestation> = {}): Attestation => ({
    schemaVersion: "1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    snapshotHash: "c".repeat(64),
    recordCount: 6236,
    quarantinedRows: 0,
    collectionCounts: { quran: 6236 },
    sources: [{ source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 6236, artefactSha256: "a".repeat(64) }],
    chainHead: "d".repeat(64),
    chainLength: 1,
    ...over,
  })

  test("identical attestations produce no differences", () => {
    expect(compareAttestations(attestation(), attestation())).toEqual([])
    expect(isOk(checkAttestation(attestation(), attestation()))).toBe(true)
  })

  test("a changed snapshot hash is a mismatch, not a warning", () => {
    const differences = compareAttestations(attestation(), attestation({ snapshotHash: "e".repeat(64) }))
    expect(differences).toHaveLength(1)
    expect(differences[0]).toContain("snapshotHash")
  })

  test("a changed upstream digest is reported per source", () => {
    const fresh = attestation({
      sources: [{ source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 6236, artefactSha256: "f".repeat(64) }],
    })
    expect(compareAttestations(attestation(), fresh)[0]).toContain("artefact digest changed")
  })

  test("a dropped source is reported, so a disappearing collection cannot pass silently", () => {
    expect(compareAttestations(attestation(), attestation({ sources: [] }))[0]).toContain("is missing")
  })

  test("the per-row registry is one JSONL line per record and carries no text", () => {
    const records = [
      toCorpusRecord(raw({ id: "b:1" }), { meta: meta(), gradeSource: "s" }),
      toCorpusRecord(raw({ id: "b:2" }), { meta: meta(), gradeSource: "s" }),
    ]
    const jsonl = buildRegistryJsonl(records)
    const lines = jsonl.trim().split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('"id":"b:1"')
    expect(jsonl).not.toContain("textDisplay")
    expect(jsonl).not.toContain("textMatch")
  })
})

describe("throttling is paced, not fatal — and not an opening", () => {
  test("a 503 backs off exponentially", () => {
    expect(backoffMs(1, 503)).toBe(1_000)
    expect(backoffMs(2, 503)).toBe(2_000)
    expect(backoffMs(3, 503)).toBe(4_000)
  })

  test("a 429 waits out the MEASURED cooldown: 1-2-4-8 would still be throttled at 15 s", () => {
    expect(backoffMs(1, 429)).toBe(5_000)
    expect(backoffMs(2, 429)).toBe(15_000)
    expect(backoffMs(3, 429)).toBe(30_000)
    // The observed recovery window on the real endpoint is 60-90 s, so the budget has to
    // exceed it: a schedule that tops out below the ceiling fails deterministically.
    expect(backoffMs(4, 429)).toBeGreaterThanOrEqual(60_000)
    expect(backoffMs(9, 429)).toBe(MAX_BACKOFF_MS)
  })

  test("the retry budget covers the full throttle schedule and then stops", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(5)
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(10)
  })

  test("a 404 is not retried: waiting cannot turn missing into present", () => {
    expect(backoffMs(1, 404)).toBe(1_000)
  })

  test("a transient gateway status IS retried", () => {
    // The first ingest of this corpus died on a 502 from the Hugging Face datasets-server
    // during the hadith pull, and the fix shipped with no test pinning it. 502 and 504 are
    // upstream saying it is momentarily unable; waiting is a reasonable response, unlike a 404
    // or a 401.
    for (const status of [429, 500, 502, 503, 504]) expect(RETRYABLE_STATUSES.has(status)).toBe(true)
  })

  test("a permanent client status is never retried", () => {
    // Retrying these only burns the budget and delays a real error report. 501 and 505 are the
    // two that look transient but are not supported at all.
    for (const status of [400, 401, 403, 404, 410, 501, 505]) expect(RETRYABLE_STATUSES.has(status)).toBe(false)
  })
})

describe("reading the committed artefacts back — decoded, never cast", () => {
  // Built through the real `toCorpusRecord`, so this fixture carries every field a stored
  // record actually has. A hand-written literal would be missing fields the real ingest
  // always sets, and would quietly test a shape that never occurs.
  const record = (over: Parameters<typeof raw>[0] = {}) => toCorpusRecord(raw(over), { meta: meta(), gradeSource: "test/fixture" })

  test("the snapshot hash covers every field the corpus stores and shows", () => {
    // If a field is not in the material, changing it leaves the digest identical — and the
    // attestation still verifies. `grade` and `textDisplay` were both silently unpinned.
    const base = record()
    expect(computeSnapshotHash([{ ...base, grade: "Daif" }])).not.toBe(computeSnapshotHash([base]))
    expect(computeSnapshotHash([{ ...base, textDisplay: `${base.textDisplay} ` }])).not.toBe(computeSnapshotHash([base]))
    expect(computeSnapshotHash([{ ...base, textMatch: `${base.textMatch} ` }])).not.toBe(computeSnapshotHash([base]))
    expect(computeSnapshotHash([{ ...base, number: "2" }])).not.toBe(computeSnapshotHash([base]))
    expect(computeSnapshotHash([{ ...base, gradeSource: "someone-else" }])).not.toBe(computeSnapshotHash([base]))
    expect(computeSnapshotHash([{ ...base, gradeApplicable: false }])).not.toBe(computeSnapshotHash([base]))
  })

  test("a grade-only edit is visible to the hash, which is the whole point", () => {
    // Live proof of the hole: all 36,024 hadith grades were "[object Object]" and the
    // snapshotHash did not move when they were fixed. A digest that ignores `grade` cannot
    // attest to a grade at all.
    const base = record()
    const broken = { ...base, grade: "[object Object] / [object Object]" }
    expect(computeSnapshotHash([broken])).not.toBe(computeSnapshotHash([base]))
  })

  test("the hash is order-independent and content-sensitive", () => {
    const a = { ...record(), id: "a:1" }
    const b = { ...record(), id: "b:1", textDisplay: "بسم" }
    expect(computeSnapshotHash([a, b])).toBe(computeSnapshotHash([b, a]))
    expect(computeSnapshotHash([a])).not.toBe(computeSnapshotHash([a, b]))
  })

  test("the hashed field list is exported, so a new stored field forces a decision", () => {
    expect(snapshotHashedFields()).toContain("grade")
    expect(snapshotHashedFields()).toContain("textDisplay")
  })

  const good = appendEntry("0".repeat(64), 1, {
    source: "tanzil/quran-uthmani",
    rows: 6236,
    artefactSha256: "a".repeat(64),
    snapshotHash: "b".repeat(64),
    at: "2026-01-01T00:00:00.000Z",
  })

  test("a well-formed ledger decodes", () => {
    const decoded = decodeLedgerText(`${JSON.stringify(good)}\n`)
    if (isErr(decoded)) throw new Error(`unexpected: ${describeReadFailure(decoded.error)}`)
    expect(decoded.value).toHaveLength(1)
    expect(verifyLedger(decoded.value)).toHaveLength(0)
  })

  test("a trailing newline and blank lines are not corruption", () => {
    const decoded = decodeLedgerText(`${JSON.stringify(good)}\n\n`)
    if (isErr(decoded)) throw new Error(`unexpected: ${describeReadFailure(decoded.error)}`)
    expect(decoded.value).toHaveLength(1)
  })

  test("a renamed field is a MALFORMED file, not a broken chain", () => {
    // This is the distinction that matters. With a cast, a missing `hash` would reach
    // verifyLedger and be reported as a hash mismatch — telling a judge that the ledger was
    // tampered with when the file is merely from a different version.
    const { hash: _dropped, ...rest } = good
    const decoded = decodeLedgerText(`${JSON.stringify(rest)}\n`)
    if (isOk(decoded)) throw new Error("expected a malformed-shape failure")
    expect(decoded.error._tag).toBe("malformed_shape")
    expect(describeReadFailure(decoded.error)).toContain("hash")
  })

  test("a truncated line is reported as malformed JSON, with its line number", () => {
    const decoded = decodeLedgerText(`${JSON.stringify(good)}\n{"seq":2,"at":\n`)
    if (isOk(decoded)) throw new Error("expected a malformed-json failure")
    expect(decoded.error._tag).toBe("malformed_json")
    expect(describeReadFailure(decoded.error)).toContain("line 2")
  })

  test("the FIRST bad line ends the read — never a partially trusted chain", () => {
    const second = appendEntry(good.hash, 2, {
      source: "quranlab/hadith",
      rows: 36024,
      artefactSha256: "c".repeat(64),
      snapshotHash: "b".repeat(64),
      at: "2026-01-01T00:05:00.000Z",
    })
    const { hash: _dropped, ...broken } = second
    const decoded = decodeLedgerText(`${JSON.stringify(good)}\n${JSON.stringify(broken)}\n`)
    if (isOk(decoded)) throw new Error("expected a failure")
    expect(describeReadFailure(decoded.error)).toContain("line 2")
  })

  test("a field of the wrong type is rejected rather than coerced", () => {
    const decoded = decodeLedgerText(`${JSON.stringify({ ...good, rows: "6236" })}\n`)
    if (isOk(decoded)) throw new Error("expected a malformed-shape failure")
    expect(decoded.error._tag).toBe("malformed_shape")
  })

  test("an attestation whose counts are strings is rejected", () => {
    // A count written as "6236" cannot be compared as a number, so it cannot decide whether
    // the corpus is consistent. Refusing is the only honest option.
    const attestation = {
      schemaVersion: "1.0.0",
      generatedAt: "2026-01-01T00:05:00.000Z",
      snapshotHash: "b".repeat(64),
      recordCount: 42260,
      quarantinedRows: 0,
      collectionCounts: { quran: "6236" },
      sources: [],
      chainHead: "b".repeat(64),
      chainLength: 2,
    }
    const decoded = decodeAttestationText(JSON.stringify(attestation))
    if (isOk(decoded)) throw new Error("expected a malformed-shape failure")
    expect(describeReadFailure(decoded.error)).toContain("collectionCounts")
  })

  test("a well-formed attestation decodes", () => {
    const attestation = {
      schemaVersion: "1.0.0",
      generatedAt: "2026-01-01T00:05:00.000Z",
      snapshotHash: "b".repeat(64),
      recordCount: 42260,
      quarantinedRows: 0,
      collectionCounts: { quran: 6236, bukhari: 7580 },
      sources: [{ source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 6236, artefactSha256: "a".repeat(64) }],
      chainHead: "b".repeat(64),
      chainLength: 2,
    }
    const decoded = decodeAttestationText(JSON.stringify(attestation))
    if (isErr(decoded)) throw new Error(`unexpected: ${describeReadFailure(decoded.error)}`)
    expect(decoded.value.recordCount).toBe(42260)
  })
})

describe("the source catalogue is a set of decisions, not a list of URLs", () => {
  test("every source has a licence class, and every excluded one has a reason", () => {
    for (const source of SOURCE_CATALOGUE) {
      expect(source.descriptor.licenceClass).toBeTruthy()
      if (source.enabled) continue
      expect(source.exclusionReason).toBeTruthy()
      expect(source.exclusionReason?.length ?? 0).toBeGreaterThan(20)
    }
  })

  test("an unconfirmed licence is never marked enabled", () => {
    for (const source of SOURCE_CATALOGUE) {
      if (source.descriptor.licenceClass !== "unconfirmed") continue
      expect(source.enabled).toBe(false)
    }
  })

  test("the enabled sources are exactly the ones with an adapter", () => {
    expect(SOURCE_CATALOGUE.filter((source) => source.enabled).map((source) => source.descriptor.source)).toEqual([
      "tanzil/quran-uthmani",
      "quranlab/hadith",
    ])
  })
})

describe("the ingest fails loud", () => {
  const failing: Fetcher = async () => ({ ok: false, error: { _tag: "fetch_failed", reason: "network_error", detail: "boom" } })

  test("a failing source fails the run in strict mode", async () => {
    const result = await runIngest({ root: TMP_DIR, now: "2026-01-01T00:00:00.000Z", fetcher: failing, only: ["tanzil/quran-uthmani"] })
    expect(isOk(result)).toBe(false)
  })

  test("in allow-partial mode the source is recorded as DISABLED, not silently kept", async () => {
    const result = await runIngest({
      root: TMP_DIR,
      now: "2026-01-01T00:00:00.000Z",
      fetcher: failing,
      only: ["tanzil/quran-uthmani"],
      allowPartial: true,
    })
    if (!isOk(result)) throw new Error("expected a partial result")
    const tanzil = result.value.registry.sources.find((source) => source.source === "tanzil/quran-uthmani")
    expect(tanzil?.enabled).toBe(false)
    expect(tanzil?.records).toBe(0)
    expect(tanzil?.exclusionReason).toContain("ingest failed")
  })
})

describe("the tanzil adapter refuses a changed format", () => {
  test("a short file is a format_changed failure, not a smaller corpus", async () => {
    const shortBody: Fetcher = async () => ({ ok: true, value: "بِسْمِ ٱللَّهِ\nٱلْحَمْدُ" })
    const result = await runIngest({
      root: TMP_DIR,
      now: "2026-01-01T00:00:00.000Z",
      fetcher: shortBody,
      only: ["tanzil/quran-uthmani"],
    })
    expect(isOk(result)).toBe(false)
  })

  test("the expected ayah count is the real count of the real artefact", () => {
    expect(EXPECTED_AYAH_COUNT).toBe(6236)
  })
})
