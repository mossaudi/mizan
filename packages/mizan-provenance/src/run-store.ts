import { mkdir, open, readFile } from "node:fs/promises"
import { dirname } from "node:path"
import { sealTrace, type Result, type RunTrace, type RunTraceDraft, err, ok } from "@mizan/core"
import { auditRunLedger, describeProblem, headOf, readRunChain, serialiseEntry, verifyRunChain } from "./run-ledger.ts"

/**
 * Durable, fail-closed appends to the run ledger.
 *
 * ## The one rule: a run that is not recorded is an untrusted run
 *
 * AGENTS.md section 3 and section 16 both land here. If the ledger write fails, the run is
 * marked untrusted — never "as if recorded", never "we'll write it later". The alternative is
 * a ledger with holes in it, and a ledger with holes is indistinguishable from a ledger where
 * somebody removed the entry that mattered. So `appendRunTrace` returns a `Result`, the caller
 * is obliged to branch on it, and the failure carries the reason.
 *
 * ## Why the write is verified after it happens
 *
 * `appendFile` returning successfully means the bytes were handed to the OS, which is not the
 * same as the bytes being on the disk. A full volume, a quota, or a crash between the write
 * and the flush all produce "no error" and no entry. So the sequence is: read, verify, append,
 * `fsync`, re-read, verify the new entry is present and chains. If the re-read disagrees, the
 * append is reported as a failure — because at that point we cannot honestly claim the run was
 * recorded, and the whole point of the artefact is that it can be claimed.
 *
 * ## Why an existing broken chain blocks the append
 *
 * Appending onto a chain that is already broken makes the damage permanent and unauditable: the
 * new entry would chain from a head nobody can trust, and the original break would be buried
 * under a later one. So `appendRunTrace` refuses, and tells the caller which entry broke.
 * Repairing it is a human decision about what happened.
 */

export type AppendFailureReason = "ledger_unreadable" | "ledger_broken" | "torn_tail" | "write_failed" | "verify_failed"

export type AppendResult =
  | { readonly ok: true; readonly index: number; readonly entryHash: string }
  | { readonly ok: false; readonly reason: AppendFailureReason; readonly detail: string }

const writeFailure = (reason: AppendFailureReason, detail: string): { readonly ok: false; readonly reason: AppendFailureReason; readonly detail: string } => ({
  ok: false,
  reason,
  detail,
})

/** The current state of a ledger file, or why it cannot be read. */
export type LedgerState = { readonly traces: readonly RunTrace[]; readonly head: string }

export const readLedger = async (path: string): Promise<Result<LedgerState, AppendResult>> => {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (cause) {
    // A ledger that does not exist yet is an empty ledger, not an error. Anything else is.
    if (isMissing(cause)) return ok({ traces: [], head: headOf([]) })
    return err(writeFailure("ledger_unreadable", `${path}: ${describe(cause)}`))
  }
  const audited = auditRunLedger(raw)
  if (!audited.ok) return err(problemToFailure(audited.error))
  return ok({ traces: audited.value.traces, head: audited.value.head })
}

const isMissing = (cause: unknown): boolean => (cause as { readonly code?: string } | null)?.code === "ENOENT"

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : "unknown error")

const problemToFailure = (problem: Parameters<typeof describeProblem>[0]): AppendResult => {
  if (problem._tag === "torn_tail") return writeFailure("torn_tail", describeProblem(problem))
  return writeFailure("ledger_broken", describeProblem(problem))
}

/**
 * Seal `draft` onto the chain at `path` and durably write it.
 *
 * The returned `index` is the judge-facing number for this run, and is worth keeping: it is
 * what "which run?" resolves to.
 */
export const appendRunTrace = async (path: string, draft: RunTraceDraft): Promise<AppendResult> => {
  const state = await readLedger(path)
  if (!state.ok) return state.error

  const sealed = sealTrace(draft, state.value.head)
  const index = state.value.traces.length

  try {
    await mkdir(dirname(path), { recursive: true })
    const handle = await open(path, "a")
    try {
      await handle.writeFile(serialiseEntry(sealed), "utf8")
      // The flush is what makes the entry durable. Without it a power loss can lose the run
      // we just told the caller was recorded.
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (cause) {
    return writeFailure("write_failed", `${path}: ${describe(cause)}. The run is UNTRUSTED: it happened but was not recorded.`)
  }

  return confirmWrite(path, sealed, index)
}

/**
 * Re-read the ledger and prove the entry landed.
 *
 * A write that cannot be confirmed is a write that did not happen, as far as any claim about
 * this run is concerned. Reporting success here would be the single most damaging thing this
 * package could do.
 */
const confirmWrite = async (path: string, sealed: RunTrace, index: number): Promise<AppendResult> => {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (cause) {
    return writeFailure("verify_failed", `${path}: re-read failed after the write: ${describe(cause)}. The run is UNTRUSTED.`)
  }

  const { traces, breaks, tail } = readRunChain(raw)
  if (tail !== null) return writeFailure("verify_failed", `${path}: the file ended mid-line after the write. The run is UNTRUSTED.`)
  if (breaks.length > 0) return writeFailure("verify_failed", `${path}: ${describeProblem({ _tag: "chain_broken", breaks })}. The run is UNTRUSTED.`)

  const landed = traces[index]
  if (landed === undefined) return writeFailure("verify_failed", `${path}: the entry is not at index ${index} after the write. The run is UNTRUSTED.`)
  if (landed.entryHash !== sealed.entryHash) return writeFailure("verify_failed", `${path}: the entry at index ${index} does not match what was written. The run is UNTRUSTED.`)

  const chainBreaks = verifyRunChain(traces)
  if (chainBreaks.length > 0) return writeFailure("verify_failed", `${path}: the chain broke at index ${chainBreaks[0]?.index}. The run is UNTRUSTED.`)

  return { ok: true, index, entryHash: sealed.entryHash }
}

/** Append several traces in order, stopping at the first failure. */
export const appendRunTraces = async (path: string, drafts: readonly RunTraceDraft[]): Promise<readonly AppendResult[]> => {
  const results: AppendResult[] = []
  for (const draft of drafts) {
    const outcome = await appendRunTrace(path, draft)
    results.push(outcome)
    if (!outcome.ok) return results
  }
  return results
}

export * as RunStore from "./run-store.ts"
