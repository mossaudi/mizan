#!/usr/bin/env bun
import { readFile } from "node:fs/promises"
import { isErr, type RunTrace } from "@mizan/core"
import { auditRunLedger, describeProblem, headOf } from "@mizan/provenance"
import { requireRepositoryRoot } from "@mizan/gate"

/**
 * `bun run verify:runs` - the audit of the run chain, the one `verify:ledger` did not do.
 *
 * ## The gap this closes
 *
 * `verify:ledger` checks `data/ledger.jsonl`: the short corpus chain that records where the
 * CORPUS came from. There is a second chain in this repository, `data/runs.jsonl` — one entry
 * per run, recording whether each RUN happened the way its trace says it did — and nothing in
 * the repository ever verified it. `auditRunLedger` was written, exported, unit-tested against
 * planted corruption, and then never called by anything a person can run. A gate that no
 * command invokes is a gate nobody is holding, and the run chain is the one that backs the
 * product's central claim: that the `verified` badge you saw was computed and recorded.
 *
 * So the same `auditRunLedger` that the tests exercise is now reachable by a judge and by CI,
 * with the same contract: exit 0 when intact, otherwise name the exact entry index.
 *
 * Both chains are long or short depending on how much the repository has been run, so neither
 * length is written down here. Each of the two commands prints its own entry count; a number
 * frozen into a comment is a number that will be wrong the first time somebody runs the demo,
 * and a stale count in the file explaining the verifier is worse than no count at all.
 *
 * ## What is verified, and what is not
 *
 * The chain: every entry decodes as a `RunTrace`, every `prevHash` is the entry before it, and
 * every `entryHash` matches its own contents. What it is NOT is a check that the recorded
 * verdicts were correct — the chain proves the history was not altered, not that a `verified`
 * verdict was earned. Re-verifying a past run would need the corpus snapshot of that moment,
 * which is a different and much larger claim. The wording of the output says so, because a
 * verification command that overstates what it checked is the same defect as one that
 * understates it.
 *
 * ## No arguments, no options
 *
 * Same reasoning as `verify:ledger`: a verification command with flags invites `--skip`.
 */

/** How many entries to print. The chain is long; a wall of it helps nobody. */
const SHOWN = 5

const label = (trace: RunTrace, index: number): string =>
  `  #${String(index).padStart(4)}  ${trace.runId}  ${String(trace.claims.length).padStart(2)} claim(s)  ` +
  `${trace.transcript.padEnd(11)} ${trace.corpusSnapshotHash.slice(0, 12)}…  ${trace.entryHash.slice(0, 12)}…`

const main = async (): Promise<number> => {
  const found = requireRepositoryRoot(import.meta.dir)
  if (isErr(found)) {
    console.error(`verify:runs could not start: ${found.error}`)
    return 2
  }
  const path = `${found.value}/data/runs.jsonl`

  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch {
    console.error(`verify:runs FAILED - ${path} is missing or unreadable.`)
    console.error("  The run ledger is committed, so its absence is a broken checkout rather than")
    console.error("  a ledger with no runs. A run chain that cannot be read cannot be audited.")
    return 1
  }

  const audited = auditRunLedger(raw)
  if (isErr(audited)) {
    const problem = audited.error
    console.error(`verify:runs FAILED - ${describeProblem(problem)}.`)
    console.error("  The chain is append-only. The entry named above was altered, removed or")
    console.error("  reordered after it was written. Do NOT repair it by re-running the demo -")
    console.error("  that would hide the alteration. Investigate what changed it.")
    if (problem._tag === "torn_tail") {
      console.error("  A torn tail means a process was killed mid-write. The entries before it are")
      console.error("  still verifiable; the fragment is not, and truncating it is a human decision.")
    }
    return 1
  }

  const traces = audited.value.traces
  if (traces.length === 0) {
    console.error(`verify:runs FAILED - ${path} is empty. A committed run chain has entries.`)
    return 1
  }

  console.log(`verify:runs OK - ${traces.length} entries, chain intact.`)
  console.log(`  head ${headOf(traces)}`)
  console.log(`  every entry decodes as a RunTrace, links to the one before it, and matches its own digest.`)
  console.log(`  this proves the run HISTORY was not altered; it does not re-derive past verdicts.`)
  console.log("")
  for (const [index, trace] of traces.slice(-SHOWN).entries()) {
    console.log(label(trace, traces.length - SHOWN + index))
  }
  if (traces.length > SHOWN) console.log(`  ... ${traces.length - SHOWN} earlier entries, all verified`)
  return 0
}

process.exit(await main())
