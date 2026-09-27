import { Database } from "bun:sqlite"
import { isOk, sha256Hex } from "@mizan/core"
import { hadithSearch, quranSearch } from "@mizan/retrieval"
import type { RetrievedContext } from "@mizan/agent"
import { citationLabel } from "./render.ts"
import type { ToolCall } from "./trace-build.ts"

/**
 * The agent's `Retriever` port, plus what retrieval actually cost.
 *
 * ## Why this module returns the calls as well as the contexts
 *
 * `Retriever` is a port whose whole signature is `queries -> contexts`, so the answers it
 * produced — which rankers contributed, how many rows came back, how long it took — were
 * unreachable from the composition root. The trace therefore could not report them, and the
 * earlier version reported constants instead: `ranking: "fused"`, `elapsedMs: 0`, hardcoded in
 * the trace builder while the real values sat one call away and were discarded.
 *
 * That is the failure this repository exists to prevent, applied to itself. A run ledger of 274
 * entries that each claim fused ranking and zero latency documents a system that did not run, and
 * a trace a judge is invited to read is worthless the moment it is known to be synthesised. So the
 * calls are collected HERE, at the only place they exist, and carried into the trace unchanged.
 *
 * ## What `ranking` actually reports
 *
 * `SearchResult.ranking` is the retrieval package's own answer to "did more than one lexical pass
 * contribute to this ordering". `fused` means at least two did; `unavailable` means the ordering is
 * a single ranker's opinion, and the caller is entitled to know that before building a prompt on
 * it. Both values are passed through verbatim, including `"unavailable"` — a silent downgrade
 * presented as full fidelity is exactly what AGENTS.md section 16 forbids, and the trace is where
 * a reader would otherwise be misled.
 */

/** How many results per tool. Small, because the agent length-caps the context anyway. */
export const RESULT_LIMIT = 3

/** One retrieval call, in the exact shape the trace records. Re-exported for the trace builder. */
export type { ToolCall }

/**
 * Both tools, in a fixed order, each with the name it is recorded under.
 *
 * A fixed order rather than an object literal iteration so the trace's `toolsCalled` is a function
 * of the query set alone: a trace whose order varied between two runs of the same question would
 * chain to a different digest for no reason.
 */
const RETRIEVAL_TOOLS = [
  ["quranSearch", quranSearch],
  ["hadithSearch", hadithSearch],
] as const

/** Read one record's text out of the snapshot. Retrieval returns metadata only, by design. */
const readText = (db: Database, id: string): string => {
  // `textDisplay`, not `textDisplay`/`textMatch` chosen by taste: the model is shown the same
  // wording a human is shown beside the badge, and quoting from it still verifies, because
  // the verifier folds diacritics away before containment. A column named `text` never
  // existed in this schema — querying it threw, and the throw only escaped on the happy path.
  const row = db.query<{ readonly textDisplay: string }, [string]>("SELECT textDisplay FROM records WHERE id = ?").get(id)
  return row?.textDisplay ?? ""
}

export type InstrumentedRetriever = {
  readonly retrieve: (queries: readonly string[]) => readonly RetrievedContext[]
  /** Every call made, in order, with the ranking it reported and the time it took. */
  readonly calls: readonly ToolCall[]
  /** Sum of the measured per-call elapsed times. The trace's `retrievalMs`. */
  readonly totalMs: number
}

/**
 * Build the retriever for one run.
 *
 * Both tools are run for every query — a question about hadith often needs the Qur'an verse for
 * context, and vice versa. `tafsirLookup` is deliberately NOT called: it returns a typed
 * `backend_unavailable`, and the honest surfacing of that is the product's job, not a retrieval
 * that pretends it looked.
 *
 * The clock is read here and only here. `this` is the composition root's single concession to
 * `performance.now()`, and it is a measurement of our own latency, not an input to any verdict —
 * nothing downstream of `elapsedMs` can change what `verifyAnswer` decides.
 */
export const makeRetriever = (db: Database): InstrumentedRetriever => {
  const calls: ToolCall[] = []

  const retrieve = (queries: readonly string[]): readonly RetrievedContext[] => {
    const contexts: RetrievedContext[] = []
    for (const query of queries) {
      for (const [tool, search] of RETRIEVAL_TOOLS) {
        const startedAt = performance.now()
        const found = search(db, { text: query, limit: RESULT_LIMIT })
        const elapsedMs = Math.round(performance.now() - startedAt)
        const queryHash = sha256Hex(query)

        if (!isOk(found)) {
          // Recorded, not skipped. The call happened and produced no ordering, so it carries the
          // honest ranking: a trace that omits a tool call which ran is the same class of lie as
          // one that invents a ranking for a call which did not.
          calls.push({ tool, queryHash, resultCount: 0, ranking: "unavailable", elapsedMs })
          continue
        }

        calls.push({ tool, queryHash, resultCount: found.value.count, ranking: found.value.ranking, elapsedMs })

        for (const chunk of found.value.chunks) {
          const text = readText(db, chunk.id)
          if (text.trim().length === 0) continue
          contexts.push({ tool, text, citationLabel: citationLabel(chunk.collection, chunk.number) })
        }
      }
    }
    return contexts
  }

  // `totalMs` is a getter, and it has to be. It was a plain field computed here, in the object
  // literal, which meant it was summed over an EMPTY `calls` array and froze at 0: the trace said
  // retrieval cost nothing while the SQL ran. A number computed before the thing it measures has
  // happened is a wrong number, and a wrong number in a trace is worse than a missing one.
  //
  // The getter keeps the public shape (`readonly totalMs: number`) and reads the live array at the
  // moment the composition root asks, which is after `retrieve` has returned.
  return {
    retrieve,
    calls,
    get totalMs(): number {
      return calls.reduce((total, call) => total + call.elapsedMs, 0)
    },
  }
}

export * as Retriever from "./retriever.ts"
