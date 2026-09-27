#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { decodeOrFail, decodeSync, describeDecodeFailure, err, isErr, ok, SourceRegistry, type Decodable, type Result } from "@mizan/core"
import {
  AttestationSchema,
  auditCommittedCorpus,
  decodeAttestationText,
  decodeLedgerText,
  describeReadFailure,
  formatAudit,
  type Attestation,
  type CommittedCorpus,
} from "@mizan/corpus"
import { requireRepositoryRoot } from "@mizan/gate"

/**
 * `bun run ingest` / `bun run ingest:check`.
 *
 * Two modes, and the difference matters:
 *
 *  - **default** re-runs the real ingest, which fetches from the network and rewrites the
 *    corpus. The logic is `packages/mizan-corpus/bin/mizan-ingest.ts`; this wrapper exists so
 *    the command is available from the root, where nobody has to know package layouts.
 *  - **`--check`** audits the *committed* artefacts against each other and touches no network.
 *    This is what CI runs. It must be fast, hermetic, and must not depend on an upstream being
 *    up — a CI gate that can fail because a third party is down is a gate people learn to
 *    re-run, and a re-run gate is not a gate.
 *
 * ## Skipping is not passing
 *
 * On a fresh clone the corpus is absent by design (it is gitignored; the registry and
 * attestation are what is committed). `--check` says so and exits 0, because there is nothing
 * false to report. It never exits 0 on a *malformed* or *inconsistent* artefact — those are
 * red, loudly.
 */

const paths = (root: string) => ({
  attestation: `${root}/attestation.json`,
  registry: `${root}/data/registry/sources.json`,
  ledger: `${root}/data/ledger.jsonl`,
})

/**
 * Read a whole-document JSON artefact and decode it, or say precisely why not.
 *
 * The decode is not ceremony. `ingest:check` exists to decide whether a committed corpus is
 * internally consistent, and an audit that casts its inputs can be handed a malformed
 * attestation and still produce a confident answer. A malformed artefact is a finding, not a
 * reason to skip the audit.
 */
const readDecoded = async <A>(path: string, decode: Decodable<A>, name: string): Promise<Result<A, string>> => {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (cause) {
    return err(`${path}: ${cause instanceof Error ? cause.message : "unreadable"}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (cause) {
    return err(`${path}: not valid JSON: ${cause instanceof Error ? cause.message : "unparseable"}`)
  }
  const decoded = decodeOrFail(decode, parsed, name)
  if (isErr(decoded)) return err(`${path}: ${describeDecodeFailure(decoded.error)}`)
  return ok(decoded.value)
}

const readAttestation = async (path: string): Promise<Result<Attestation, string>> => {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (cause) {
    return err(`${path}: ${cause instanceof Error ? cause.message : "unreadable"}`)
  }
  const decoded = decodeAttestationText(raw)
  if (isErr(decoded)) return err(`${path}: ${describeReadFailure(decoded.error)}`)
  return ok(decoded.value)
}

const readLedger = async (path: string): Promise<Result<CommittedCorpus["ledger"], string>> => {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (cause) {
    return err(`${path}: ${cause instanceof Error ? cause.message : "unreadable"}`)
  }
  const decoded = decodeLedgerText(raw)
  if (isErr(decoded)) return err(`${path}: ${describeReadFailure(decoded.error)}`)
  return ok(decoded.value)
}

const check = async (root: string): Promise<number> => {
  const files = paths(root)
  if (!existsSync(files.attestation)) {
    console.log("ingest:check — no committed attestation; the corpus has not been ingested in this checkout.")
    console.log("Nothing to audit. Run `bun run ingest` to build it, or see the committed registry for what ships.")
    return 0
  }

  const [attestation, registry] = await Promise.all([
    readAttestation(files.attestation),
    readDecoded(files.registry, decodeSync(SourceRegistry), "SourceRegistry"),
  ])
  if (isErr(attestation)) return reportUnreadable([attestation.error])
  if (isErr(registry)) return reportUnreadable([registry.error])

  const ledger = await readLedger(files.ledger)
  if (isErr(ledger)) return reportUnreadable([ledger.error])

  const corpus: CommittedCorpus = {
    attestation: attestation.value,
    registry: registry.value,
    ledger: ledger.value,
  }

  const findings = auditCommittedCorpus(corpus)
  if (findings.length === 0) {
    console.log(`ingest:check OK — ${corpus.attestation.recordCount} records, chain of ${corpus.ledger.length} intact`)
    // Surfaced here as well as at ingest time: `ingest:check` is the command a judge runs, and
    // a number of rows that were fetched and then refused is a fact about the corpus they are
    // entitled to, not a detail of one operator's terminal scrollback.
    console.log(`  quarantined  ${corpus.attestation.quarantinedRows} (fetched, grade required and empty, not served)`)
    console.log(`  snapshotHash ${corpus.attestation.snapshotHash.slice(0, 16)}…`)
    return 0
  }
  console.error("ingest:check FAILED — the committed corpus artefacts are inconsistent:\n")
  console.error(formatAudit(findings))
  return 1
}

const reportUnreadable = (errors: readonly string[]): number => {
  console.error("ingest:check FAILED — a committed artefact could not be read:\n")
  for (const error of errors) console.error(`  ${error}`)
  return 1
}

const runIngest = async (root: string): Promise<number> => {
  const child = Bun.spawn(["bun", "run", "packages/mizan-corpus/bin/mizan-ingest.ts", "--root", root], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  })
  return await child.exited
}

const main = async (): Promise<number> => {
  const found = requireRepositoryRoot(import.meta.dir)
  if (isErr(found)) {
    console.error(`ingest could not start: ${found.error}`)
    return 2
  }
  if (process.argv.includes("--check")) return check(found.value)
  return runIngest(found.value)
}

process.exit(await main())
