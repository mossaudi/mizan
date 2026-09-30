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

/**
 * What an operator is told while a network-bound ingest runs.
 *
 * ## Why this exists, and why it is a value rather than a printed line
 *
 * Acquisition is minutes of HTTP against two upstreams, and it has no runtime SLO to be measured
 * against — so the only question worth answering during it is "is it alive, and on what". A run
 * that prints nothing until it finishes cannot answer either: a slow fetch and a hung one look
 * identical from a terminal, and the natural response to that is to kill a working ingest and start
 * over. MIZ-101 asks for "a progress line so an operator can tell stall from hang", and the only
 * version of that which works is a line emitted BEFORE the blocking call naming the source it is
 * about to block on.
 *
 * It is a plain data value with no clock and no formatting, so the library stays free of both (the
 * caller owns time — see `IngestOptions.now`) and the same event stream is reproducible between
 * runs. `detail` carries the failure text a caller already prints and never corpus content.
 */
export type IngestProgress = {
  /** The source slug, exactly as the registry spells it. */
  readonly source: string
  /**
   * `started` — emitted before the first network call, which is the whole point of the type.
   * `rows` — the adapter accepted this many rows so far. `completed` / `failed` — the last event
   * for this source, always, so a source that dies mid-stream is never silent.
   */
  readonly stage: "started" | "rows" | "completed" | "failed"
  /** Rows so far, or `null` for the stages that have no count. Never a placeholder number. */
  readonly rows: number | null
  /** The failure reason, on `failed` only. Never fetched text. */
  readonly detail: string | null
}

export type IngestOptions = {
  readonly root: string
  /** `Infinity` for a full ingest. Tests and quick runs pass a small number. */
  readonly limit?: number
  /** Only these source slugs. Empty means every enabled source. */
  readonly only?: readonly string[]
  readonly fetcher?: Fetcher
  /** Allow a source failure and record it as a disabled source instead. Never used in CI. */
  readonly allowPartial?: boolean
  /**
   * Progress sink. Omit it and this module says nothing at all — every existing caller and test
   * keeps the silent behaviour, and silence stays the default rather than becoming something a
   * caller has to opt out of.
   */
  readonly onProgress?: (event: IngestProgress) => void
  /** ISO timestamp for the ledger and the attestation. The caller owns the clock. */
  readonly now: string
}

export type IngestFailure = {
  readonly _tag: "ingest_failed"
  readonly source: string
  readonly detail: string
}

/**
 * Hand one event to the caller's sink, and let nothing the sink does reach the corpus.
 *
 * A progress line is a display concern; the corpus is not, and the ingest's own result is the
 * authority on what happened. So a sink that throws — a closed stderr pipe being the realistic
 * case — must not turn a completed fetch into a failed run, and a sink that writes to the event
 * must not be able to reach anything downstream of it. The event is therefore built here, frozen,
 * and the failure is absorbed deliberately rather than by accident.
 *
 * The catch is the one swallow in this module, and it is bounded on purpose: a display sink
 * cannot cause, prevent or alter a fetch, a record or a failure, because it is only ever called
 * after the fact with a value it did not produce.
 */
const emit = (onProgress: ((event: IngestProgress) => void) | undefined, event: IngestProgress): void => {
  if (onProgress === undefined) return
  try {
    onProgress(Object.freeze({ ...event }))
  } catch {
    // Deliberate, and the comment above is the justification. Reporting this upward would mean
    // failing a run over a stderr write, which is the one outcome worse than a missing line.
  }
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

    const source = meta.descriptor.source
    // Before the adapter is called, and therefore before any network request. This is the line an
    // operator reads to learn WHICH source a stalled run is stalled on; emitting it afterwards
    // would be a progress line that is silent for exactly the interval it exists to cover.
    emit(options.onProgress, { source, stage: "started", rows: null, detail: null })

    const get = async (url: string) => {
      const body = await fetcher(url)
      if (isOk(body)) return { ok: true as const, body: body.value }
      return { ok: false as const, detail: describeFetchFailure(body.error) }
    }

    const result = await adapter.fetchRecords({
      get,
      limit,
      report: (rows) => emit(options.onProgress, { source, stage: "rows", rows, detail: null }),
    })
    if (isErr(result)) {
      const failure = toIngestFailure(source, result.error)
      // In both modes. Strict mode returns on the next line, so without this the operator's last
      // line would be `started` and would carry no reason at all.
      emit(options.onProgress, { source, stage: "failed", rows: null, detail: failure.detail })
      if (options.allowPartial !== true) return err(failure)
      failures.push(failure)
      continue
    }

    const built = result.value.records.map((raw) => toCorpusRecord(raw, { meta, gradeSource: source }))
    records.push(...built)
    rows.set(source, { rows: built.length, sha256: result.value.sha256 })
    emit(options.onProgress, { source, stage: "completed", rows: built.length, detail: null })
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
