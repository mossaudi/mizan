import { verifyLedger, type Attestation, type LedgerEntry } from "./ledger.ts"
import type { SourceRegistry } from "@mizan/core"

/**
 * Auditing the committed corpus artefacts against each other. No network, no clock, no writes.
 *
 * ## Why a separate module
 *
 * `ingest:check` is a CI gate, so it has to be testable with planted violations and no
 * fixtures on disk. The logic therefore takes already-parsed artefacts and returns a list of
 * differences; `scripts/ingest.ts` is the shim that reads the three files and prints them.
 * A check that can only be exercised by running a full ingest is a check nobody runs.
 *
 * ## What it does NOT do
 *
 * It does not re-fetch anything. `ingest:check` must finish in seconds and must not depend on
 * an upstream being up: the claim being audited is "the artefacts that are committed are
 * mutually consistent and the chain is intact", which is a property of the repository, not of
 * Tanzil's mood today. Reproducibility against a live upstream is proven by re-running
 * `bun run ingest` and diffing the attestation, which is the human's job, not the gate's.
 *
 * It also does not check licence fields. That is G-5, it runs on the same `sources.json` in
 * the very next CI step, and duplicating the rules here would create a second place for them
 * to drift (AGENTS.md section 17).
 */

/** The three committed artefacts, as parsed JSON. */
export type CommittedCorpus = {
  readonly attestation: Attestation
  readonly registry: SourceRegistry
  readonly ledger: readonly LedgerEntry[]
}

export type AuditFinding = { readonly rule: string; readonly detail: string }

const finding = (rule: string, detail: string): AuditFinding => ({ rule, detail })

/** Sum the per-collection counts. Must equal `recordCount`, or the attestation is miscounted. */
const totalCollections = (attestation: Attestation): number =>
  Object.values(attestation.collectionCounts).reduce((sum, count) => sum + count, 0)

/** I-1: the ingest chain must be intact, and the break must be named by sequence. */
const auditChain = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  const breaks = verifyLedger(corpus.ledger)
  if (breaks.length === 0) return []
  const [first] = breaks
  return [finding("I-1 chain-broken", `data/ledger.jsonl entry ${first?.seq} is the first break: ${first?.reason} — ${first?.detail}`)]
}

/** I-2: the chain head recorded in the attestation must be the chain's actual head. */
const auditChainHead = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  const last = corpus.ledger[corpus.ledger.length - 1]
  if (last === undefined) return [finding("I-2 chain-empty", "data/ledger.jsonl has no entries, so no ingest was ever recorded")]
  if (last.hash === corpus.attestation.chainHead) return []
  return [finding("I-2 chain-head-mismatch", `attestation.json records head ${corpus.attestation.chainHead.slice(0, 12)}… but the ledger's last link is ${last.hash.slice(0, 12)}…`)]
}

/** I-3: the chain length must match too. A head alone does not prove no entry was dropped. */
const auditChainLength = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  if (corpus.ledger.length === corpus.attestation.chainLength) return []
  return [finding("I-3 chain-length-mismatch", `attestation.json records ${corpus.attestation.chainLength} entries but the ledger has ${corpus.ledger.length}`)]
}

/**
 * I-4: every enabled source's row count and digest must agree between the registry and the
 * attestation.
 *
 * This is the check that catches a corpus that was re-ingested from a changed upstream and
 * only half the artefacts were committed — the registry updated, the attestation left stale.
 * A partial update must be loud, because "the registry says 6236 and the attestation says
 * 6100" is a corpus whose provenance nobody can state.
 */
const auditSources = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  const findings: AuditFinding[] = []
  for (const source of corpus.registry.sources) {
    if (!source.enabled) continue
    const attested = corpus.attestation.sources.find((entry) => entry.source === source.source)
    if (attested === undefined) {
      findings.push(finding("I-4 source-not-attested", `registry enables ${source.source} but attestation.json does not list it`))
      continue
    }
    if (attested.rows !== source.records) {
      findings.push(finding("I-4 row-count-mismatch", `${source.source}: registry says ${source.records} rows, attestation says ${attested.rows}`))
    }
    if (attested.artefactSha256 !== source.sha256) {
      findings.push(finding("I-4 digest-mismatch", `${source.source}: registry digest ${source.sha256.slice(0, 12)}… vs attestation ${attested.artefactSha256.slice(0, 12)}…`))
    }
  }
  return findings
}

/**
 * I-5: an enabled source with zero rows is a partial corpus wearing a complete corpus's
 * attestation.
 *
 * This is the single most important check here, and it is why a "successful" ingest that
 * silently fetched nothing cannot pass. `allowPartial` exists for local convenience, and this
 * is what stops its output from ever being committed.
 */
const auditNoEmptyEnabledSource = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  const findings: AuditFinding[] = []
  for (const source of corpus.registry.sources) {
    if (!source.enabled) continue
    if (source.records > 0) continue
    findings.push(finding("I-5 empty-enabled-source", `${source.source} is enabled with 0 rows; the corpus is partial and the attestation claims otherwise`))
  }
  return findings
}

/** I-6: at least one source must actually be enabled, or this is not a corpus. */
const auditHasContent = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  const enabled = corpus.registry.sources.filter((source) => source.enabled)
  if (enabled.length > 0) return []
  return [finding("I-6 no-enabled-source", "no source is enabled, so the corpus is empty")]
}

/** I-7: the collection counts must add up to the record count. */
const auditCounts = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  const total = totalCollections(corpus.attestation)
  if (total === corpus.attestation.recordCount) return []
  return [finding("I-7 collection-count-sum", `collection counts total ${total} but recordCount is ${corpus.attestation.recordCount}`)]
}

/**
 * I-8: every row a source shipped is either served or quarantined, and none is unaccounted for.
 *
 * The registry counts what each source *shipped*; `recordCount` counts what we *serve*; the
 * difference is the quarantine. Stating that equality turns a quarantine from a claim into a
 * check: a row that vanished from the corpus for any other reason — a dropped collection, a
 * silently skipped record, a partial ingest written over a good one — breaks the arithmetic and
 * fails the audit, because the two committed numbers no longer reconcile.
 */
const auditQuarantineAccounts = (corpus: CommittedCorpus): readonly AuditFinding[] => {
  const shipped = corpus.registry.sources.filter((source) => source.enabled).reduce((sum, source) => sum + source.records, 0)
  const accounted = corpus.attestation.recordCount + corpus.attestation.quarantinedRows
  if (shipped === accounted) return []
  return [
    finding(
      "I-8 quarantine-accounting",
      `enabled sources shipped ${shipped} rows but the corpus accounts for ${accounted} (${corpus.attestation.recordCount} served + ${corpus.attestation.quarantinedRows} quarantined)`,
    ),
  ]
}

/** Run every check. An empty list means the committed artefacts are mutually consistent. */
export const auditCommittedCorpus = (corpus: CommittedCorpus): readonly AuditFinding[] => [
  ...auditChain(corpus),
  ...auditChainHead(corpus),
  ...auditChainLength(corpus),
  ...auditSources(corpus),
  ...auditNoEmptyEnabledSource(corpus),
  ...auditHasContent(corpus),
  ...auditCounts(corpus),
  ...auditQuarantineAccounts(corpus),
]

/** One line per finding, for the CLI. */
export const formatAudit = (findings: readonly AuditFinding[]): string =>
  findings.map((entry) => `  ${entry.rule}: ${entry.detail}`).join("\n")

export * as Audit from "./audit.ts"
