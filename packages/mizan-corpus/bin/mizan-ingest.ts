#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises"
import { isErr, isOk, nowIso } from "@mizan/core"
import { canonicalJson } from "@mizan/core"
import { buildRegistryJsonl, runIngest } from "../src/index.ts"

/**
 * `bun run ingest` — build the snapshot, the registry, the ledger and the attestation.
 *
 * ## What gets written, and what is committed
 *
 *   data/corpus.db              generated, gitignored. Reproducible from the registry.
 *   data/registry/records.jsonl generated, gitignored. One provenance line per row.
 *   data/registry/sources.json  COMMITTED. The licence and provenance decisions, in a diff.
 *   data/ledger.jsonl           COMMITTED. The hash chain of every ingest.
 *   attestation.json            COMMITTED. Counts, digests, chain head — small enough to read.
 *
 * The split is the point: the corpus is large and reproducible, its provenance is small and
 * reviewable. A reviewer should never have to run this script to know what is in the product.
 *
 * ## Flags
 *
 *   --limit=N          stop after N rows per source. For a quick local run; NEVER in CI,
 *                      because a truncated ingest that passes the gates is the failure mode
 *                      the gates cannot see.
 *   --only=a,b         restrict to source slugs.
 *   --allow-partial    continue past a failing source, recording it as DISABLED with the
 *                      failure as its exclusionReason. Local convenience only; CI uses strict
 *                      mode, where a failing source fails the run.
 */

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const found = args.find((argument) => argument.startsWith(`--${name}=`))
  return found?.slice(name.length + 3)
}
const has = (name: string): boolean => args.includes(`--${name}`)

const limitArgument = flag("limit")
const onlyArgument = flag("only")
const limit = limitArgument === undefined ? Number.POSITIVE_INFINITY : Number(limitArgument)
if (Number.isNaN(limit)) {
  console.error(`--limit must be a number, got ${JSON.stringify(limitArgument)}`)
  process.exit(2)
}

const only = onlyArgument === undefined ? undefined : onlyArgument.split(",").map((slug) => slug.trim()).filter(Boolean)
const root = flag("root") ?? process.cwd()

await mkdir(`${root}/data/registry`, { recursive: true })

const result = await runIngest({ root, limit, only, allowPartial: has("allow-partial"), now: nowIso() })

if (isErr(result)) {
  // Fail loud. A partially-ingested corpus that looks complete is the worst outcome here.
  console.error(`INGEST FAILED  source=${result.error.source}\n  ${result.error.detail}`)
  process.exit(1)
}

const { snapshot, registry, ledger, attestation, failures, records, quarantined } = result.value

await writeFile(`${root}/data/registry/sources.json`, `${canonicalJson(registry)}\n`, "utf8")
await writeFile(`${root}/data/registry/records.jsonl`, buildRegistryJsonl(records), "utf8")
await writeFile(`${root}/data/ledger.jsonl`, `${ledger.map((entry) => canonicalJson(entry)).join("\n")}\n`, "utf8")
await writeFile(`${root}/attestation.json`, `${canonicalJson(attestation)}\n`, "utf8")

console.log(`records        ${snapshot.recordCount}`)
console.log(`quarantined    ${quarantined.length}`)
if (quarantined.length > 0) {
  // Named by collection, because a raw number does not tell a reviewer whether 15,026 lost
  // rows is one broken source or one source that simply does not grade part of itself.
  const byCollection = new Map<string, number>()
  for (const record of quarantined) byCollection.set(record.collection, (byCollection.get(record.collection) ?? 0) + 1)
  console.log(`  reason       missing_required_grade (gradeApplicable source, grade empty)`)
  for (const [collection, count] of [...byCollection].sort()) console.log(`  ${collection.padEnd(28)} ${String(count).padStart(6)} rows`)
}
console.log(`snapshotHash   ${snapshot.snapshotHash}`)
console.log(`collections    ${Object.entries(snapshot.collectionCounts).map(([name, count]) => `${name}=${count}`).join(" ")}`)
console.log(`chain          ${attestation.chainLength} entries, head ${attestation.chainHead.slice(0, 16)}…`)
for (const source of registry.sources) {
  const state = source.enabled ? `enabled  ${String(source.records).padStart(6)} rows  ${source.sha256.slice(0, 12)}…` : `EXCLUDED  ${source.exclusionReason ?? "no reason recorded"}`
  console.log(`  ${source.source.padEnd(28)} ${source.licenceClass.padEnd(15)} ${state}`)
}
for (const failure of failures) console.log(`  FAILED ${failure.source}: ${failure.detail}`)

if (failures.length > 0 && !has("allow-partial")) {
  console.error("\npartial ingest written; re-run without --allow-partial once the source is reachable")
  process.exit(1)
}

if (isOk(result)) console.log("\ningest complete")
