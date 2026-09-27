import { mkdir, open, readFile, stat, type FileHandle } from "node:fs/promises"
import { dirname } from "node:path"
import { sealTrace, traceDigest, type Result, type RunTrace, type RunTraceDraft, err, ok } from "@mizan/core"
import { auditRunLedger, describeProblem, headOf, readRunChain, serialiseEntry } from "./run-ledger.ts"

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
 * ## Why the write is verified over the TAIL, not the whole file
 *
 * The post-write check used to re-read the entire ledger and re-audit the entire chain. That is
 * O(file) work to confirm a fixed-size append, so `appendRunTraces(path, drafts)` — which is how
 * the 274-entry ledger and every ingest batch is written — was O(n²): a 10 MB ledger meant ten
 * full reads and ten full chain walks to add ten entries, all of them re-deriving the same
 * answer about the same prefix.
 *
 * The prefix does not need re-checking, and this is the part worth being precise about rather
 * than just asserting. The argument has three pieces:
 *
 *  1. **The prefix was audited immediately before the write.** `openLedger` reads the whole file
 *     and runs the full `auditRunLedger`, and this module refuses to append to a ledger that is
 *     already broken, so the head we chain from is one we have just proved is the real head of an
 *     intact chain. That check is deliberately NOT weakened here.
 *  2. **The new bytes are compared exactly.** The post-write read starts at the byte offset the
 *     file had before the append and reads to EOF, then requires the result to equal
 *     `serialiseEntry(sealed)` byte for byte, and the file size to have grown by exactly that
 *     many bytes and no more. Byte equality on the appended region is a *stronger* statement
 *     about the new content than the old "the entry at index N has the expected hash", because
 *     it also catches trailing garbage, a doubled write, and a partial line.
 *  3. **The new entry chains from the audited head**, checked by decoding the tail through the
 *     `RunTrace` schema and recomputing its own digest — the same two checks `verifyRunChain`
 *     performs, expressed against the head we know rather than against genesis.
 *
 * ## The one check that is NOT a tail check, and why it exists
 *
 * The old full re-audit incidentally detected a *concurrent* writer: if another process appended
 * between our read and our write, the full walk found two entries claiming the same `prevHash`
 * and reported a break. A tail-only check cannot see that, because our own entry would chain
 * from exactly the head we expected.
 *
 * So the post-write read also fetches the single line immediately BEFORE our append — a bounded
 * backwards read, O(one entry) rather than O(file) — and requires its `entryHash` to be the head
 * we audited. If it is not, somebody else wrote in between and this run is refused rather than
 * recorded onto a chain that has forked. Dropping a safety property to make a benchmark faster
 * is not a trade this repository is allowed to make; replacing it with a cheaper equivalent is.
 *
 * Net effect: one O(file) audit per `appendRunTraces` call regardless of batch size, and
 * O(entry) per entry. A batch of n is O(n) again.
 */

export type AppendFailureReason = "ledger_unreadable" | "ledger_broken" | "torn_tail" | "write_failed" | "verify_failed"

/**
 * The failure shape, split out from the success shape.
 *
 * `Result<T, E>` is `{ok:true, value:T} | {ok:false, error:E}`, so an error position typed with
 * the full `AppendResult` union would admit a success value where only a failure is legal — a
 * caller could be handed `{ok:true}` in its `error` branch and get a `typecheck`-clean read of
 * `error.reason` on something that has none. `AppendFailure` is the honest error type and
 * `AppendResult` is the union a caller of `appendRunTrace` receives.
 */
export type AppendFailure = { readonly ok: false; readonly reason: AppendFailureReason; readonly detail: string }

export type AppendResult = { readonly ok: true; readonly index: number; readonly entryHash: string } | AppendFailure

const writeFailure = (reason: AppendFailureReason, detail: string): AppendFailure => ({
  ok: false,
  reason,
  detail,
})

/** The current state of a ledger file, or why it cannot be read. */
export type LedgerState = { readonly traces: readonly RunTrace[]; readonly head: string }

/** A ledger that has been read, decoded and audited, with the offset it occupies on disk. */
type Audited = { readonly traces: readonly RunTrace[]; readonly head: string; readonly bytes: number }

/**
 * Read, decode and audit the whole ledger once.
 *
 * Shared by the two callers because they want different things from the same work:
 * `readLedger` needs every trace, while an append needs only the head, the count and the byte
 * offset. They used to share one type that carried the array, and the append path then rebuilt
 * it on every entry — see the note on `appendOnto` for what that cost.
 */
const readAndAudit = async (path: string): Promise<Result<Audited, AppendFailure>> => {
  let raw: string
  let bytes: number
  try {
    raw = await readFile(path, "utf8")
    bytes = (await stat(path)).size
  } catch (cause) {
    // A ledger that does not exist yet is an empty ledger, not an error. Anything else is.
    if (isMissing(cause)) return ok({ traces: [], head: headOf([]), bytes: 0 })
    return err(writeFailure("ledger_unreadable", `${path}: ${describe(cause)}`))
  }
  const audited = auditRunLedger(raw)
  if (!audited.ok) return err(problemToFailure(audited.error))
  return ok({ traces: audited.value.traces, head: audited.value.head, bytes })
}

/**
 * Where an append starts: how far the chain goes, its head, and the byte offset it occupies.
 *
 * Note what is NOT here: the traces. An append needs the count for the judge-facing index, the
 * head to chain onto, and the offset to verify its own tail against. Carrying the array as well
 * was a convenience that cost a full copy per entry.
 *
 * `bytes` is what makes the tail read possible. It comes from `stat`, not from
 * `raw.length`, because a JavaScript string length is a count of UTF-16 code units and a file
 * offset is a count of bytes — the two differ for any non-ASCII text, and this ledger is
 * entirely ASCII today, which is exactly the kind of assumption that rots quietly.
 */
type ChainCursor = { readonly count: number; readonly head: string; readonly bytes: number }

export const readLedger = async (path: string): Promise<Result<LedgerState, AppendFailure>> => {
  const audited = await readAndAudit(path)
  if (!audited.ok) return err(audited.error)
  return ok({ traces: audited.value.traces, head: audited.value.head })
}

/** Read, decode and audit the whole ledger, keeping only what an append needs. */
const openLedger = async (path: string): Promise<Result<ChainCursor, AppendFailure>> => {
  const audited = await readAndAudit(path)
  if (!audited.ok) return err(audited.error)
  return ok({ count: audited.value.traces.length, head: audited.value.head, bytes: audited.value.bytes })
}

const isMissing = (cause: unknown): boolean => (cause as { readonly code?: string } | null)?.code === "ENOENT"

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : "unknown error")

const problemToFailure = (problem: Parameters<typeof describeProblem>[0]): AppendFailure => {
  if (problem._tag === "torn_tail") return writeFailure("torn_tail", describeProblem(problem))
  return writeFailure("ledger_broken", describeProblem(problem))
}

/** How far back `readLineBefore` will look for the previous newline before giving up. */
const MAX_LOOKBACK_BYTES = 64 * 1024

/**
 * The last complete line ending at `endOffset`, or null when there is none.
 *
 * Bounded by `MAX_LOOKBACK_BYTES` on purpose: a caller that cannot find a newline in a 64 KB
 * window is looking at a file with a single entry longer than that, and returning null there
 * degrades to the genesis head, which the caller's own check then rejects. Unbounded backwards
 * scanning would reintroduce the O(file) cost this whole design exists to remove.
 */
const readLineBefore = async (handle: FileHandle, endOffset: number): Promise<string | null> => {
  const floor = Math.max(0, endOffset - MAX_LOOKBACK_BYTES)
  const span = endOffset - floor
  if (span <= 0) return null
  const buffer = new Uint8Array(span)
  const { bytesRead } = await handle.read(buffer, 0, span, floor)
  const window = new TextDecoder().decode(buffer.subarray(0, bytesRead))
  const lines = window.split("\n")
  // The final element is "" when the file ended on a newline, and the partial previous line
  // otherwise; in both cases the entry we want is the one before it.
  if (lines.length < 2) return null
  const previous = lines[lines.length - 2] ?? ""
  if (previous.trim().length === 0) return null
  return previous
}

/**
 * Prove the append landed, by reading only what the append wrote.
 *
 * Three checks, in the order that gives the most specific error first: the file grew by exactly
 * the bytes we appended, the bytes at our offset are exactly the bytes we wrote, and the entry
 * they decode to chains from the head we audited. The last is the one that answers the question
 * the caller actually cares about — "is this run on the chain?" — and it goes through the
 * `RunTrace` schema rather than trusting the bytes we just compared against, because a byte
 * comparison cannot tell you the entry is *well formed*, only that it is *unchanged*.
 */
const confirmWrite = async (input: {
  readonly path: string
  readonly sealed: RunTrace
  readonly cursor: ChainCursor
  readonly appended: string
}): Promise<AppendResult> => {
  const { path, sealed, cursor, appended } = input
  const expectedBytes = cursor.bytes + Buffer.byteLength(appended, "utf8")

  let landed: string
  let previousLine: string | null
  let afterBytes: number
  try {
    const handle = await open(path, "r")
    try {
      const statResult = await handle.stat()
      afterBytes = statResult.size
      // A shrink means the file was truncated out from under the write. Read nothing: there is
      // no offset in a shorter file that means what we think it means.
      if (afterBytes < cursor.bytes) {
        return writeFailure("verify_failed", `${path}: the ledger shrank from ${cursor.bytes} to ${afterBytes} bytes during the write. The run is UNTRUSTED.`)
      }
      const buffer = new Uint8Array(afterBytes - cursor.bytes)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, cursor.bytes)
      landed = new TextDecoder().decode(buffer.subarray(0, bytesRead))
      previousLine = await readLineBefore(handle, cursor.bytes)
    } finally {
      await handle.close()
    }
  } catch (cause) {
    return writeFailure("verify_failed", `${path}: re-read failed after the write: ${describe(cause)}. The run is UNTRUSTED.`)
  }

  if (afterBytes !== expectedBytes) {
    return writeFailure("verify_failed", `${path}: the file is ${afterBytes} bytes after the write, expected ${expectedBytes}. The run is UNTRUSTED.`)
  }
  if (landed !== appended) {
    return writeFailure("verify_failed", `${path}: the bytes at the append offset are not the bytes that were written. The run is UNTRUSTED.`)
  }
  if (cursor.bytes > 0 && previousLine === null) {
    return writeFailure("verify_failed", `${path}: could not read the entry preceding the append, so the chain cannot be confirmed. The run is UNTRUSTED.`)
  }

  // Somebody else appended between our audit and our write: the entry before ours is not the head
  // we chained from, so the file has forked and this run would be recorded onto a chain that no
  // longer verifies.
  if (previousLine !== null) {
    const { traces } = readRunChain(`${previousLine}\n`)
    const preceding = traces[0]
    if (preceding === undefined || preceding.entryHash !== cursor.head) {
      return writeFailure("verify_failed", `${path}: another writer appended while this run was being recorded, so the chain has forked. The run is UNTRUSTED.`)
    }
  }

  const { traces, breaks, tail } = readRunChain(landed)
  if (tail !== null) return writeFailure("verify_failed", `${path}: the appended entry has no newline terminator. The run is UNTRUSTED.`)
  if (breaks.length > 0) return writeFailure("verify_failed", `${path}: ${describeProblem({ _tag: "chain_broken", breaks })}. The run is UNTRUSTED.`)

  const entry = traces[0]
  if (entry === undefined) return writeFailure("verify_failed", `${path}: the appended entry did not decode as a RunTrace. The run is UNTRUSTED.`)
  if (entry.prevHash !== cursor.head) {
    return writeFailure("verify_failed", `${path}: the appended entry does not follow the head that was on disk. The run is UNTRUSTED.`)
  }
  if (traceDigest(entry.prevHash, entry) !== entry.entryHash) {
    return writeFailure("verify_failed", `${path}: the appended entry's own digest does not match its contents. The run is UNTRUSTED.`)
  }
  if (entry.entryHash !== sealed.entryHash) {
    return writeFailure("verify_failed", `${path}: the entry on disk is not the entry that was written. The run is UNTRUSTED.`)
  }

  return { ok: true, index: cursor.count, entryHash: sealed.entryHash }
}

/** Append one draft onto an already-audited chain, and return the cursor for the next one. */
const appendOnto = async (path: string, cursor: ChainCursor, draft: RunTraceDraft): Promise<{ readonly result: AppendResult; readonly next: ChainCursor }> => {
  const sealed = sealTrace(draft, cursor.head)
  const appended = serialiseEntry(sealed)

  try {
    await mkdir(dirname(path), { recursive: true })
    const handle = await open(path, "a")
    try {
      await handle.writeFile(appended, "utf8")
      // The flush is what makes the entry durable. Without it a power loss can lose the run
      // we just told the caller was recorded.
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (cause) {
    return {
      result: writeFailure("write_failed", `${path}: ${describe(cause)}. The run is UNTRUSTED: it happened but was not recorded.`),
      next: cursor,
    }
  }

  const result = await confirmWrite({ path, sealed, cursor, appended })
  // The cursor carries a COUNT, not the traces. It only ever needs the length — for the
  // judge-facing index — and an earlier version carried the whole array and rebuilt it with
  // `[...cursor.traces, sealed]` on every append, which is O(n²) over a batch: the exact
  // quadratic the cursor exists to avoid, reintroduced one array spread away. Carrying three
  // numbers makes the batch linear by construction rather than by care.
  const next: ChainCursor = result.ok
    ? { count: cursor.count + 1, head: sealed.entryHash, bytes: cursor.bytes + Buffer.byteLength(appended, "utf8") }
    : cursor
  return { result, next }
}

/**
 * Seal `draft` onto the chain at `path` and durably write it.
 *
 * The returned `index` is the judge-facing number for this run, and is worth keeping: it is
 * what "which run?" resolves to.
 */
export const appendRunTrace = async (path: string, draft: RunTraceDraft): Promise<AppendResult> => {
  const opened = await openLedger(path)
  if (!opened.ok) return opened.error
  const { result } = await appendOnto(path, opened.value, draft)
  return result
}

/**
 * Append several traces in order, stopping at the first failure.
 *
 * One audit for the whole batch, and one tail-verified append per entry. The chain cursor is
 * advanced locally between entries instead of re-reading the file, which is the entire point:
 * re-reading made this quadratic, and the cursor is only trusted because each append proves its
 * own tail before the next one is allowed to chain onto it. A failed append stops the batch and
 * the cursor is left where it was, so a later batch re-audits from disk and sees the real state.
 */
export const appendRunTraces = async (path: string, drafts: readonly RunTraceDraft[]): Promise<readonly AppendResult[]> => {
  if (drafts.length === 0) return []

  const opened = await openLedger(path)
  if (!opened.ok) return [opened.error]

  const results: AppendResult[] = []
  let cursor = opened.value
  for (const draft of drafts) {
    const { result, next } = await appendOnto(path, cursor, draft)
    results.push(result)
    if (!result.ok) return results
    cursor = next
  }
  return results
}

export * as RunStore from "./run-store.ts"
