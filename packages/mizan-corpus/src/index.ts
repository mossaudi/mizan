/**
 * `@mizan/corpus` — where the text comes from, and the proof of where it came from.
 *
 * The package answers three questions, in this order:
 *
 *  1. **Is this source allowed?** `adapters/source-meta.ts` holds every licence decision,
 *     including the two sources that are excluded, and gate G-5 reads what it produces.
 *  2. **What exactly did we take?** `adapters/` fetch through one allowlisted HTTP client,
 *     parse, and emit `RawRecord`s. `adapters/record.ts` is the only place a `textMatch` is
 *     ever created.
 *  3. **Can anyone check it?** `ledger.ts` hash-chains every ingest, `snapshot.ts` records a
 *     digest computed from the records rather than from the file, and `attestation.json` is
 *     small enough to read in a diff.
 */

export {
  ALLOWED_HOSTS,
  BASE_BACKOFF_MS,
  MAX_ATTEMPTS,
  MAX_BACKOFF_MS,
  REQUEST_TIMEOUT_MS,
  RETRYABLE_STATUSES,
  backoffMs,
  checkUrl,
  describeFetchFailure,
  fetchArtefact,
  httpFetch,
  type Fetcher,
  type FetchFailure,
  type FetchedArtefact,
} from "./http.ts"

export { ENABLED_SOURCES, SOURCE_CATALOGUE, findSource, shippedLicenceClasses, type SourceMeta } from "./adapters/source-meta.ts"
export { toCorpusRecord, foldText, computeSnapshotHash, snapshotHashedFields, type BuildContext } from "./adapters/record.ts"
export { EXPECTED_AYAH_COUNT, TANZIL_URL, parseTanzilText, tanzilAdapter } from "./adapters/tanzil.ts"
export { QURANLAB_COLLECTIONS, quranlabAdapter, readGrade } from "./adapters/quranlab.ts"
export type { AdapterFailure, AdapterResult, FetchContext, RawRecord, SourceAdapter } from "./adapters/types.ts"

export {
  SNAPSHOT_SCHEMA_VERSION,
  buildSnapshot,
  findDuplicateIds,
  openSnapshot,
  readSnapshotMeta,
  type Snapshot,
} from "./snapshot.ts"

export { resolveCitations, type ResolveProblem } from "./resolve.ts"

export { quarantineReason, partitionQuarantined, type QuarantinePartition, type QuarantineReason, type QuarantinedRecord } from "./quarantine.ts"

export {
  AttestationSchema,
  LedgerEntrySchema,
  appendEntry,
  chainHead,
  checkAttestation,
  compareAttestations,
  decodeAttestationText,
  decodeLedgerText,
  describeReadFailure,
  entryHash,
  verifyLedger,
  type Attestation,
  type AttestationCheck,
  type ChainBreak,
  type CommittedReadFailure,
  type LedgerEntry,
  type LedgerPayload,
} from "./ledger.ts"

export { ADAPTERS, buildRegistryJsonl, runIngest, type IngestFailure, type IngestOptions, type IngestResult } from "./ingest.ts"

export { auditCommittedCorpus, formatAudit, type AuditFinding, type CommittedCorpus } from "./audit.ts"
