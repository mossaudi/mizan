#!/usr/bin/env bun
import { readFile } from "node:fs/promises"
import { isErr, type Result } from "@mizan/core"
import { chainHead, decodeLedgerText, describeReadFailure, verifyLedger, type LedgerEntry } from "@mizan/corpus"
import { requireRepositoryRoot } from "@mizan/gate"

/**
 * `bun run verify:ledger` — the command a judge runs to check our provenance claim.
 *
 * ## The exact requirement
 *
 * It must exit 0 on an intact chain and **name the exact broken entry index** otherwise. Not
 * "the ledger is invalid". "Ledger entry 7 does not match" is a fact a person can act on; the
 * boolean is not, and a boolean is all the hash chain would give you without a decision about
 * which link to blame.
 *
 * ## Why the FIRST break only
 *
 * Everything after the first break is unverifiable — its `prevHash` is a value we can no
 * longer trust, because the value it was supposed to chain from is the one that was altered.
 * Reporting a list of breaks would imply the later ones are independently meaningful, and they
 * are not. `verifyLedger` therefore returns at most one.
 *
 * ## No arguments, no options
 *
 * Deliberately. A verification command with flags invites `--skip` and `--fix`, and a
 * verifier that can be told to skip is not the artefact a judge needs. It reads the committed
 * chain and it tells the truth about it.
 */

const readChain = async (path: string): Promise<Result<readonly LedgerEntry[], string>> => {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch {
    return { ok: false, error: `${path} is missing or unreadable` }
  }
  // Decoded by the corpus package, not cast here. A judge-facing verifier that trusted a cast
  // would report a renamed or truncated field as a *hash* break, sending an investigator after
  // tampering that never happened. Decoding first means a malformed file is called malformed.
  const decoded = decodeLedgerText(raw)
  if (isErr(decoded)) return { ok: false, error: describeReadFailure(decoded.error) }
  return { ok: true, value: decoded.value }
}

const main = async (): Promise<number> => {
  const found = requireRepositoryRoot(import.meta.dir)
  if (isErr(found)) {
    console.error(`verify:ledger could not start: ${found.error}`)
    return 2
  }
  const root = found.value
  const path = `${root}/data/ledger.jsonl`

  const chain = await readChain(path)
  if (isErr(chain)) {
    console.error(`verify:ledger FAILED — ${chain.error}.`)
    console.error("  A corpus with no recorded ingest has no provenance, so there is nothing to verify.")
    console.error("  This is a malformed ledger, not a broken one: the entries could not be read as")
    console.error("  ledger entries at all, so no statement is made about whether the chain is intact.")
    console.error("  Run `bun run ingest` to rebuild it.")
    return 1
  }

  const entries = chain.value

  if (entries.length === 0) {
    console.error(`verify:ledger FAILED — ${path} is empty. The chain has no entries.`)
    return 1
  }

  const breaks = verifyLedger(entries)
  const first = breaks[0]
  if (first !== undefined) {
    console.error(`verify:ledger FAILED at entry ${first.seq} (${first.reason}).`)
    console.error(`  ${first.detail}`)
    console.error("")
    console.error("  The chain is append-only. The entry at that index was altered, removed, or")
    console.error("  reordered after it was written. Do not repair it by re-running the ingest —")
    console.error("  that would hide the alteration. Investigate what changed it.")
    return 1
  }

  const head = chainHead(entries)
  console.log(`verify:ledger OK — ${entries.length} entries, chain intact.`)
  console.log(`  head ${head}`)
  for (const entry of entries) {
    console.log(`  #${entry.seq}  ${entry.source.padEnd(22)} ${String(entry.rows).padStart(6)} rows  snapshot ${entry.snapshotHash.slice(0, 12)}…`)
  }
  return 0
}

process.exit(await main())
