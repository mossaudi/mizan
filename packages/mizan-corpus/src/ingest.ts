import { err, isErr, isOk, ok, sha256Hex, toRecordMeta, type CorpusRecord, type Result, type SourceDescriptor } from "@mizan/core"
import { computeSnapshotHash, toCorpusRecord } from "./adapters/record.ts"
import { quranlabAdapter } from "./adapters/quranlab.ts"
import { ENABLED_SOURCES, SOURCE_CATALOGUE, findSource, type SourceMeta } from "./adapters/source-meta.ts"
import { tanzilAdapter } from "./adapters/tanzil.ts"
import type { AdapterFailure, SourceAdapter } from "./adapters/types.ts"
import { describeFetchFailure, httpFetch, type Fetcher } from "./http.ts"
import { appendEntry, chainHead, type Attestation, type LedgerEntry } from "./ledger.ts"
import { buildSnapshot, findDuplicateIds, SNAPSHOT_SCHEMA_VERSION, type Snapshot } from "./snapshot.ts"
import { partitionQuarantined, type QuarantinedRecord } from "./quarantine.ts"

/**
 * The ingest: fetch every enabled source, build the snapshot, write the registry, extend the
 * ledger, write the attestation.
 *
 * ## Ordering, and why it matters
 *
 * Adapters run first and independently; the records are merged and **sorted by id** before
 * anything is written. Two facts follow from that and both are load-bearing:
 *
 *  - the snapshot is byte-stable across ingests of the same upstream bytes, so `snapshotHash`
 *    is a meaningful identity rather than a build timestamp;
 *  - a source that fails cannot leave a half-written database, because the file is only
 *    created after every record is in hand. A partial corpus that looks complete is the worst
 *    possible outcome for a tool whose entire claim is integrity.
 *
 * ## A failing source fails the run
 *
 * `strict` is the default and the only mode CI uses. An enabled source that errors is an
 * error, because a corpus that silently lost a collection would still verify cleanly and would
 * be wrong. `--allow-partial` exists for a local rebuild and writes the exclusion into the
 * registry as a *disabled* source with a reason, so the partial state is visible in a diff
 * rather than living only in a log line.
 */

export const ADAPTERS: readonly SourceAdapter[] = [tanzilAdapter, quranlabAdapter]

export type IngestOptions = {
  readonly root: string
  /** `Infinity` for a full ingest. Tests and quick runs pass a small number. */
  readonly limit?: number
  /** Only these source slugs. Empty means every enabled source. */
  readonly only?: readonly string[]
  readonly fetcher?: Fetcher
  /** Allow a source failure and record it as a disabled source instead. Never used in CI. */
  readonly allowPartial?: boolean
  /** ISO timestamp for the ledger and the attestation. The caller owns the clock. */
  readonly now: string
}

export type IngestFailure = {
  readonly _tag: "ingest_failed"
  readonly source: string
  readonly detail: string
}

export type IngestResult = {
  readonly records: readonly CorpusRecord[]
  readonly quarantined: readonly QuarantinedRecord[]
  readonly snapshot: Snapshot
  readonly registry: { readonly schemaVersion: string; readonly generatedBy: string; readonly sources: readonly SourceDescriptor[] }
  readonly ledger: readonly LedgerEntry[]
  readonly attestation: Attestation
  readonly failures: readonly IngestFailure[]
}

const adapterFor = (slug: string): SourceAdapter | null => ADAPTERS.find((adapter) => adapter.slug === slug) ?? null

/** The per-row metadata registry: one JSONL line per record, no text. */
export const buildRegistryJsonl = (records: readonly CorpusRecord[]): string => {
  const ordered = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return `${ordered.map((record) => JSON.stringify(toRecordMeta(record, sha256Hex))).join("\n")}\n`
}

const buildRegistry = (
  rows: ReadonlyMap<string, { readonly rows: number; readonly sha256: string }>,
  failures: readonly IngestFailure[],
): { readonly schemaVersion: string; readonly generatedBy: string; readonly sources: readonly SourceDescriptor[] } => {
  const sources = SOURCE_CATALOGUE.map((source: SourceMeta): SourceDescriptor => {
    const ingested = rows.get(source.descriptor.source)
    // A source that failed while `allowPartial` was set is recorded as DISABLED with the
    // failure as its reason. The alternative — leaving it enabled with a stale row count — is
    // how a registry ends up claiming 7563 rows it does not have.
    const failed = failures.find((failure) => failure.source === source.descriptor.source)
    if (failed !== undefined) {
      return { ...source.descriptor, sha256: "", records: 0, enabled: false, exclusionReason: `ingest failed: ${failed.detail}` }
    }
    if (!source.enabled) {
      return { ...source.descriptor, sha256: "", records: 0, enabled: false, exclusionReason: source.exclusionReason }
    }
    return {
      ...source.descriptor,
      sha256: ingested?.sha256 ?? "",
      records: ingested?.rows ?? 0,
      enabled: true,
      exclusionReason: null,
    }
  })
  return { schemaVersion: SNAPSHOT_SCHEMA_VERSION, generatedBy: "bun run ingest", sources }
}

export const runIngest = async (options: IngestOptions): Promise<Result<IngestResult, IngestFailure>> => {
  const fetcher = options.fetcher ?? httpFetch
  const limit = options.limit ?? Number.POSITIVE_INFINITY
  const selected = ENABLED_SOURCES.filter((source) => {
    if (options.only !== undefined && options.only.length > 0) return options.only.includes(source.descriptor.source)
    return true
  })

  const records: CorpusRecord[] = []
  const rows = new Map<string, { readonly rows: number; readonly sha256: string }>()
  const failures: IngestFailure[] = []
  const payloadParts: LedgerEntry[] = []

  for (const meta of selected) {
    const adapter = adapterFor(meta.descriptor.source)
    if (adapter === null) {
      const failure: IngestFailure = { _tag: "ingest_failed", source: meta.descriptor.source, detail: "no adapter is registered" }
      if (options.allowPartial !== true) return err(failure)
      failures.push(failure)
      continue
    }

    const get = async (url: string) => {
      const body = await fetcher(url)
      if (isOk(body)) return { ok: true as const, body: body.value }
      return { ok: false as const, detail: describeFetchFailure(body.error) }
    }

    const result = await adapter.fetchRecords({ get, limit })
    if (isErr(result)) {
      const failure = toIngestFailure(meta.descriptor.source, result.error)
      if (options.allowPartial !== true) return err(failure)
      failures.push(failure)
      continue
    }

    const built = result.value.records.map((raw) => toCorpusRecord(raw, { meta, gradeSource: meta.descriptor.source }))
    records.push(...built)
    rows.set(meta.descriptor.source, { rows: built.length, sha256: result.value.sha256 })
  }

  const duplicates = findDuplicateIds(records)
  if (duplicates.length > 0) {
    return err({ _tag: "ingest_failed", source: "corpus", detail: `duplicate ids across sources: ${duplicates.slice(0, 5).join(", ")}` })
  }

  // Quarantine happens after the duplicate check, so a quarantined id can never mask a genuine
  // collision between two served records.
  const { served, quarantined } = partitionQuarantined(records)
  const snapshot = buildSnapshot(`${options.root}/data/corpus.db`, served)

  let seq = 1
  for (const meta of selected) {
    const ingested = rows.get(meta.descriptor.source)
    if (ingested === undefined) continue
    payloadParts.push(
      appendEntry(chainHead(payloadParts), seq, {
        source: meta.descriptor.source,
        rows: ingested.rows,
        artefactSha256: ingested.sha256,
        snapshotHash: snapshot.snapshotHash,
        at: options.now,
      }),
    )
    seq += 1
  }

  const registry = buildRegistry(rows, failures)
  const attestation: Attestation = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: options.now,
    snapshotHash: snapshot.snapshotHash,
    recordCount: snapshot.recordCount,
    quarantinedRows: quarantined.length,
    collectionCounts: snapshot.collectionCounts,
    sources: registry.sources
      .filter((source) => source.enabled)
      .map((source) => ({
        source: source.source,
        licenceClass: source.licenceClass,
        enabled: true,
        rows: source.records,
        artefactSha256: source.sha256,
      })),
    chainHead: chainHead(payloadParts),
    chainLength: payloadParts.length,
  }

  return ok({
    records: served,
    quarantined,
    snapshot,
    registry,
    ledger: payloadParts,
    attestation,
    failures,
  })
}

const toIngestFailure = (source: string, error: AdapterFailure): IngestFailure => ({
  _tag: "ingest_failed",
  source,
  detail: `${error.reason}: ${error.detail}`,
})

/** The snapshot hash a caller can compute without building a database. Exported for tests. */
export { computeSnapshotHash, findSource }
