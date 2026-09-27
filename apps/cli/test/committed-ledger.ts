import { afterAll, beforeAll } from "bun:test"
import { existsSync } from "node:fs"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * Keeping a test that spawns the real CLI from dirtying the committed run ledger.
 *
 * ## The defect this exists to stop
 *
 * The CLI resolves its paths from `process.cwd()`, so a spawned run appends its trace to
 * `<cwd>/data/runs.jsonl` — which, for any test that runs the binary from the repository root, is
 * the **committed, hash-chained** ledger. Three separate consequences, all of which bit:
 *
 *  1. `bun test` left the working tree dirty, so `git status` was noise and a review could not
 *     tell a real edit from a test artefact.
 *  2. `bun run verify:runs` then audited a chain the test suite had extended, so the number it
 *     printed depended on how many times the tests had been run.
 *  3. A test that failed *between* the append and the assertion left the entry behind, and the
 *     next run tripped over it. The corpus tests avoid this by writing only to the OS temp
 *     directory; the corpus is not what gets written here.
 *
 * ## Why restore rather than redirect
 *
 * A temp `cwd` would be the cleaner answer, and it is not available: the CLI needs
 * `attestation.json`, the large snapshot and the transcript to agree with each other, and a
 * faithful mirror of those is either a large copy per test or a set of symlinks that need Windows
 * developer mode. So the real ledger is used and then restored.
 *
 * ## Why this is one shared module
 *
 * Two test files spawn the binary — `demo.test.ts` for every committed question and
 * `happy-path.test.ts` for the exit-code contract. The first version of this fix was applied to
 * one of them, and the ledger still grew by 65 entries per full CI run, which is exactly how the
 * "restored" claim could have been believed while being false. One definition, used by both.
 *
 * ## Why `afterAll` and not `afterEach`
 *
 * A restore that only runs on the happy path is not a restore. `afterAll` runs when the block
 * fails too, which is the case that matters.
 */

export const ROOT = join(import.meta.dir, "..", "..", "..")
export const LEDGER = join(ROOT, "data", "runs.jsonl")

export type LedgerGuard = {
  /** The entry the CLI appended since `preserveCommittedLedger` was called, or null. */
  readonly appendedTrace: () => Promise<unknown | null>
}

/**
 * Call once, inside a `describe` block that spawns the real CLI.
 *
 * Registers the capture and restore hooks and returns a reader for whatever the runs appended,
 * so a test can assert on the trace while it is still on disk.
 */
export const preserveCommittedLedger = (): LedgerGuard => {
  let before: string | null = null

  beforeAll(async () => {
    before = existsSync(LEDGER) ? await readFile(LEDGER, "utf8") : null
  })

  afterAll(async () => {
    if (before === null) {
      // The ledger was not there to begin with, so anything present now was written by the runs
      // this block spawned and removing it leaves the tree exactly as we found it. Returning early
      // here — which is what this used to do — is the one failure mode this module's own header
      // lists as reason 1: a `bun test` that leaves the working tree dirty. It was unreachable
      // only because the ledger is committed, which is not a property worth relying on.
      if (existsSync(LEDGER)) await rm(LEDGER, { force: true })
      return
    }
    await writeFile(LEDGER, before, "utf8")
  })

  const appendedTrace = async (): Promise<unknown | null> => {
    if (before === null || !existsSync(LEDGER)) return null
    const after = await readFile(LEDGER, "utf8")
    const added = after.slice(before.length).split("\n").filter((line) => line.trim().length > 0)
    const last = added[added.length - 1]
    return last === undefined ? null : (JSON.parse(last) as unknown)
  }

  return { appendedTrace }
}

/** Spawn the real CLI from the repository root, which is where its committed inputs live. */
export const spawnCli = async (
  question: string,
  env: Readonly<Record<string, string>> = { MIZAN_LLM_API_KEY: "" },
): Promise<{ readonly code: number; readonly output: string }> => {
  const proc = Bun.spawn(["bun", "run", join(ROOT, "apps", "cli", "src", "main.ts"), question], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  return { code: await proc.exited, output: `${stdout}${stderr}` }
}
