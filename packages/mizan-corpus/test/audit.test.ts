import { describe, expect, test } from "bun:test"
import { auditCommittedCorpus, formatAudit, type AuditFinding, type CommittedCorpus } from "../src/audit.ts"
import { appendEntry, chainHead, entryHash, type Attestation, type LedgerEntry } from "../src/ledger.ts"
import type { SourceRegistry } from "@mizan/core"

/**
 * The `ingest:check` self-test.
 *
 * Every rule has a planted violation that must be caught, because `ingest:check` is what
 * stands between a reviewer and a corpus whose provenance cannot be stated. A check nobody
 * has seen fail is a check nobody should trust.
 *
 * The fixtures are built by CONSTRUCTING the artefacts, not by copying the real committed
 * ones, so a planted break cannot be accidentally repaired by a re-ingest and so the tests do
 * not depend on the 140 MB corpus existing.
 */

const SHA_A = "a".repeat(64)
const SHA_B = "b".repeat(64)

const buildChain = (): readonly LedgerEntry[] => {
  const first = appendEntry("0".repeat(64), 1, { source: "tanzil/quran-uthmani", rows: 6236, artefactSha256: SHA_A, snapshotHash: SHA_B, at: "2026-01-01T00:00:00.000Z" })
  const second = appendEntry(first.hash, 2, { source: "quranlab/hadith", rows: 36024, artefactSha256: SHA_B, snapshotHash: SHA_B, at: "2026-01-01T00:05:00.000Z" })
  return [first, second]
}

/**
 * A source descriptor, built from the full schema shape.
 *
 * These fixtures are NOT casts of a partial literal. An earlier version of this file asserted
 * `as SourceRegistry` over a literal missing four required fields, which is precisely how a
 * fixture drifts away from the schema it claims to test: the cast silences the compiler
 * instead of the compiler catching the drift. Every field is written out here, so if
 * `SourceDescriptor` gains a field this file stops compiling and gets fixed.
 */
type SourceDescriptor = SourceRegistry["sources"][number]

const tanzilSource = (overrides: Partial<SourceDescriptor> = {}): SourceDescriptor => ({
  source: "tanzil/quran-uthmani",
  title: "Tanzil Uthmani",
  publisher: "Tanzil",
  url: "https://tanzil.net",
  license: "no-derivatives",
  licenceClass: "no-derivatives",
  licenseUrl: "https://tanzil.net/page/terms",
  attribution: "Tanzil.net",
  sha256: SHA_A,
  records: 6236,
  enabled: true,
  exclusionReason: null,
  // The Qur'an carries no grading scheme, and saying so is required (AGENTS.md section 15).
  gradeApplicable: false,
  gradeBasis: "none",
  notes: "test fixture",
  ...overrides,
})

const hadithSource = (overrides: Partial<SourceDescriptor> = {}): SourceDescriptor => ({
  source: "quranlab/hadith",
  title: "quranlab/hadith",
  publisher: "Hugging Face",
  url: "https://huggingface.co/datasets/quranlab/hadith",
  license: "content-only",
  licenceClass: "content-only",
  licenseUrl: "https://huggingface.co/datasets/quranlab/hadith",
  attribution: "quranlab/hadith",
  sha256: SHA_B,
  records: 36024,
  enabled: true,
  exclusionReason: null,
  gradeApplicable: true,
  gradeBasis: "row",
  notes: "test fixture",
  ...overrides,
})

const registry = (overrides: readonly Partial<SourceDescriptor>[] = []): SourceRegistry => ({
  schemaVersion: "1.0.0",
  generatedBy: "mizan-corpus/test/audit.test.ts",
  sources: [tanzilSource(overrides[0] ?? {}), hadithSource(overrides[1] ?? {})],
})

const attestation = (overrides: Partial<Attestation> = {}): Attestation => ({
  schemaVersion: "1.0.0",
  generatedAt: "2026-01-01T00:05:00.000Z",
  snapshotHash: SHA_B,
  recordCount: 42260,
  quarantinedRows: 0,
  // The real ingest's per-collection counts, which must sum to recordCount.
  collectionCounts: { quran: 6236, bukhari: 7580, muslim: 7360, abudawud: 5272, tirmidhi: 3924, nasai: 5679, ibnmajah: 4338, malik: 1829, nawawi: 42 },
  sources: [
    { source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 6236, artefactSha256: SHA_A },
    { source: "quranlab/hadith", licenceClass: "content-only", enabled: true, rows: 36024, artefactSha256: SHA_B },
  ],
  chainHead: chainHead(buildChain()),
  chainLength: 2,
  ...overrides,
})

const corpus = (overrides: { readonly attestation?: Attestation; readonly registry?: SourceRegistry; readonly ledger?: readonly LedgerEntry[] } = {}): CommittedCorpus => ({
  attestation: overrides.attestation ?? attestation(),
  registry: overrides.registry ?? registry(),
  ledger: overrides.ledger ?? buildChain(),
})

const rules = (findings: readonly AuditFinding[]): readonly string[] => findings.map((finding) => finding.rule)

describe("auditCommittedCorpus — the intact case", () => {
  test("passes a consistent corpus with no findings", () => {
    expect(auditCommittedCorpus(corpus())).toEqual([])
  })

  test("passes a corpus where an excluded source has zero rows", () => {
    // An excluded source legitimately has no rows. Only an ENABLED one at zero is a defect.
    const withExcluded = registry()
    const sources = [
      ...withExcluded.sources,
      { ...withExcluded.sources[0]!, source: "excluded/one", enabled: false, records: 0, exclusionReason: "licence unconfirmed" },
    ]
    expect(auditCommittedCorpus(corpus({ registry: { ...withExcluded, sources } }))).toEqual([])
  })
})

describe("auditCommittedCorpus — I-1, a broken chain", () => {
  test("names the exact entry index that was altered", () => {
    const chain = buildChain()
    const tampered: LedgerEntry = { ...chain[1]!, rows: 99999 }
    const findings = auditCommittedCorpus(corpus({ ledger: [chain[0]!, tampered] }))
    expect(rules(findings)).toContain("I-1 chain-broken")
    expect(findings[0]?.detail).toContain("entry 2")
  })

  test("catches a removed middle entry, and names the surviving entry that no longer chains", () => {
    // Deleting an entry is the classic tamper that a per-entry digest cannot see, because each
    // surviving entry still hashes correctly — only the link between them moved.
    //
    // The break is reported at the entry AFTER the deletion, not at the missing one: a missing
    // entry has no index left to report, and the one link we CAN prove is broken is the one
    // whose prevHash no longer matches. The seq is still exact and actionable.
    const chain = buildChain()
    const findings = auditCommittedCorpus(corpus({ ledger: [chain[1]!] }))
    expect(rules(findings)).toContain("I-1 chain-broken")
    expect(findings[0]?.detail).toContain("entry 2")
  })

  test("catches a reordered chain", () => {
    const chain = buildChain()
    const findings = auditCommittedCorpus(corpus({ ledger: [chain[1]!, chain[0]!] }))
    expect(rules(findings)).toContain("I-1 chain-broken")
  })

  test("reports the first break only, because later ones are unverifiable", () => {
    const chain = buildChain()
    const broken = [
      { ...chain[0]!, rows: 1 },
      { ...chain[1]!, rows: 2, prevHash: "f".repeat(64) },
    ]
    const findings = auditCommittedCorpus(corpus({ ledger: broken, attestation: attestation({ chainHead: chainHead(buildChain()) }) }))
    expect(findings.filter((finding) => finding.rule === "I-1 chain-broken")).toHaveLength(1)
    expect(findings.find((finding) => finding.rule === "I-1 chain-broken")?.detail).toContain("entry 1")
  })

  test("an empty chain is a defect, not a trivially intact one", () => {
    expect(rules(auditCommittedCorpus(corpus({ ledger: [] })))).toContain("I-2 chain-empty")
  })
})

describe("auditCommittedCorpus — I-2 and I-3, attestation versus chain", () => {
  test("catches a chain head that does not match the ledger", () => {
    const findings = auditCommittedCorpus(corpus({ attestation: attestation({ chainHead: SHA_A }) }))
    expect(rules(findings)).toContain("I-2 chain-head-mismatch")
  })

  test("catches a dropped entry via the chain length", () => {
    // The head still matches the last surviving entry, so only the count reveals the deletion.
    const chain = buildChain()
    const findings = auditCommittedCorpus(corpus({ ledger: chain, attestation: attestation({ chainLength: 3, chainHead: chainHead(chain) }) }))
    expect(rules(findings)).toContain("I-3 chain-length-mismatch")
  })
})

describe("auditCommittedCorpus — I-4, registry versus attestation", () => {
  test("catches a row count that disagrees", () => {
    const drifted = attestation({
      sources: [
        { source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 6100, artefactSha256: SHA_A },
        { source: "quranlab/hadith", licenceClass: "content-only", enabled: true, rows: 36024, artefactSha256: SHA_B },
      ],
    })
    const findings = auditCommittedCorpus(corpus({ attestation: drifted }))
    expect(rules(findings)).toContain("I-4 row-count-mismatch")
    expect(findings[0]?.detail).toContain("6236")
    expect(findings[0]?.detail).toContain("6100")
  })

  test("catches a digest that disagrees, which is what a changed upstream looks like", () => {
    const drifted = attestation({
      sources: [
        { source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 6236, artefactSha256: SHA_A },
        { source: "quranlab/hadith", licenceClass: "content-only", enabled: true, rows: 36024, artefactSha256: "c".repeat(64) },
      ],
    })
    const findings = auditCommittedCorpus(corpus({ attestation: drifted }))
    expect(rules(findings)).toContain("I-4 digest-mismatch")
  })

  test("catches an enabled source the attestation never mentions", () => {
    const findings = auditCommittedCorpus(
      corpus({ attestation: attestation({ sources: [{ source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 6236, artefactSha256: SHA_A }] }) }),
    )
    expect(rules(findings)).toContain("I-4 source-not-attested")
  })
})

describe("auditCommittedCorpus — I-5, a partial corpus that looks complete", () => {
  test("an enabled source with zero rows is a loud failure", () => {
    // This is the check that `allowPartial` must never be able to slip past into a commit.
    const empty = registry([{ records: 0 }])
    const findings = auditCommittedCorpus(
      corpus({ registry: empty, attestation: attestation({ sources: [{ source: "tanzil/quran-uthmani", licenceClass: "no-derivatives", enabled: true, rows: 0, artefactSha256: SHA_A }, { source: "quranlab/hadith", licenceClass: "content-only", enabled: true, rows: 36024, artefactSha256: SHA_B }] }) }),
    )
    expect(rules(findings)).toContain("I-5 empty-enabled-source")
  })
})

describe("auditCommittedCorpus — I-6 and I-7", () => {
  test("a corpus with no enabled source is a defect", () => {
    const allOff = registry().sources.map((source) => ({ ...source, enabled: false, records: 0, exclusionReason: "not used" }))
    expect(rules(auditCommittedCorpus(corpus({ registry: { ...registry(), sources: allOff } })))).toContain("I-6 no-enabled-source")
  })

  test("collection counts must add up to the record count", () => {
    const findings = auditCommittedCorpus(corpus({ attestation: attestation({ collectionCounts: { quran: 6236, bukhari: 7580 } }) }))
    expect(rules(findings)).toContain("I-7 collection-count-sum")
  })
})

describe("auditCommittedCorpus — I-8, a quarantine is accounted for, not just asserted", () => {
  /**
   * The real shape of this corpus, to the row: tanzil ships 6,236 Quranic verses and
   * quranlab/hadith ships 36,024 hadith, so 42,260 rows are fetched; 15,026 of them have no
   * grade and are quarantined, leaving 27,234 served. The audit has to reconcile all of those
   * numbers or a reviewer has to take the quarantine on trust.
   */
  const QURAN_ROWS = 6_236
  const HADITH_SHIPPED = 36_024
  const QUARANTINED = 15_026
  const SERVED = QURAN_ROWS + HADITH_SHIPPED - QUARANTINED

  const quarantinedCorpus = (over: { readonly recordCount?: number; readonly quarantinedRows?: number } = {}): CommittedCorpus => {
    const quarantinedRows = over.quarantinedRows ?? QUARANTINED
    const recordCount = over.recordCount ?? SERVED
    return corpus({
      attestation: attestation({
        recordCount,
        quarantinedRows,
        collectionCounts: { quran: QURAN_ROWS, bukhari: recordCount - QURAN_ROWS },
      }),
      registry: registry([{ records: QURAN_ROWS }, { records: HADITH_SHIPPED }]),
    })
  }

  test("a quarantine that reconciles passes", () => {
    expect(auditCommittedCorpus(quarantinedCorpus())).toEqual([])
  })

  test("a row that vanished without a quarantine record fails the audit", () => {
    // 42,260 shipped, 27,234 served, but the attestation claims nothing was quarantined. This
    // is the partial-ingest-over-a-good-corpus failure, and the arithmetic is what catches it.
    const findings = auditCommittedCorpus(quarantinedCorpus({ quarantinedRows: 0 }))
    expect(rules(findings)).toContain("I-8 quarantine-accounting")
  })

  test("an inflated quarantine count is also a finding", () => {
    // The mirror image: claiming rows were quarantined when the arithmetic says they were not
    // is as much a miscount as dropping them, so the rule is an equality and not a lower bound.
    const findings = auditCommittedCorpus(quarantinedCorpus({ quarantinedRows: 99_999 }))
    expect(rules(findings)).toContain("I-8 quarantine-accounting")
  })

  test("the finding names both sides of the arithmetic so it is diagnosable", () => {
    const findings = auditCommittedCorpus(quarantinedCorpus({ quarantinedRows: 0 }))
    const finding = findings.find((entry) => entry.rule === "I-8 quarantine-accounting")
    expect(finding?.detail).toContain("42260")
    expect(finding?.detail).toContain("0 quarantined")
  })
})

describe("formatAudit", () => {
  test("one line per finding, rule first", () => {
    const printed = formatAudit([{ rule: "I-1 chain-broken", detail: "entry 2 does not match" }])
    expect(printed).toBe("  I-1 chain-broken: entry 2 does not match")
  })

  test("an empty finding list prints nothing", () => {
    expect(formatAudit([])).toBe("")
  })
})

describe("the digest rule is the one from @mizan/core, not a restatement", () => {
  test("entryHash agrees with the shared chainHash", () => {
    const payload = { source: "tanzil/quran-uthmani", rows: 6236, artefactSha256: SHA_A, snapshotHash: SHA_B, at: "2026-01-01T00:00:00.000Z" }
    expect(entryHash("0".repeat(64), payload)).toBe(buildChain()[0]!.hash)
  })
})
