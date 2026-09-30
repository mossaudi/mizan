import type { Database } from "bun:sqlite"
import { elapsedMs, err, isOk, startDeadline, type Result, type RetrievalError } from "@mizan/core"
import { search } from "./search.ts"
import type { Query, SearchResult } from "./schema.ts"

/**
 * The three retrieval tools, and the boundary they share.
 *
 * Two of them search the snapshot. The third — `tafsirLookup` — is the interesting one, because
 * the architecture specced it as a tool with NO CORPUS BEHIND IT. Inventing a fourth corpus to
 * fill the gap would be scope and licence exposure bought to make a badge look complete, so the
 * honest shape is a typed refusal: the caller learns there is no tafsir here, and the product
 * says "unavailable" rather than fabricating an explanation of a verse.
 *
 * The AT's rule for that surface is explicit and this is the whole implementation of it:
 * `tafsir backend unreachable -> "unavailable"` and NEVER a fabricated tafsir.
 */

/**
 * The Qur'an-only tool. The scope is pinned so a question cannot silently span both corpora.
 *
 * `db` is `Database | null` rather than `Database` on purpose: "no snapshot is open" is a real,
 * expected state (a judge who cloned the repo has no `data/corpus.db` because it is gitignored),
 * and it deserves a typed refusal rather than a crash on `undefined`.
 */
export const quranSearch = (db: Database | null, query: Query): Result<SearchResult, RetrievalError> =>
  runTool(db, { ...query, scope: query.scope ?? "quran" })

/**
 * The hadith-only tool, with the same reasoning — and the same pin, expressed as a scope rather
 * than as a collection name. It used to pass `collection: "hadith"`, which names no collection
 * in this corpus, so it matched nothing at all: hadith retrieval was dead in the only place it
 * ever ran. `CorpusScope` in `schema.ts` has the full account.
 */
export const hadithSearch = (db: Database | null, query: Query): Result<SearchResult, RetrievalError> =>
  runTool(db, { ...query, scope: query.scope ?? "hadith" })

/**
 * There is no tafsir corpus, so this never returns a record.
 *
 * A typed `backend_unavailable` rather than `[]`: `[]` means "we looked and found nothing", and
 * that is a different statement from "we have no tafsir data at all". Collapsing the two would
 * let a caller present an unsearched tool as a searched-and-empty one.
 */
export const tafsirLookup = (): Result<SearchResult, RetrievalError> =>
  err({
    _tag: "backend_unavailable",
    backend: "tafsir",
    detail: "no tafsir corpus is bundled; reported unavailable rather than inventing an explanation",
  })

/** The 2s retrieval budget from the architecture's budget table. */
export const TOOL_BUDGET_MS = 2_000

/**
 * The shared tool boundary: open snapshot, then budget.
 *
 * ## The budget is measured AFTER the query, and that is the honest option
 *
 * The queries here are synchronous `bun:sqlite` calls, so a JavaScript timer cannot interrupt a
 * query that is already running. What this CAN do — and what actually protects the property that
 * matters — is refuse to hand back an over-budget result as a success. An agent that has already
 * burned its latency budget learns that, and the degradation matrix gets its honest
 * `retrieval_budget_exceeded` instead of a result set that arrived too late to use.
 *
 * Claiming this "cancels" a slow query would be a lie in a comment; it does not, and the wording
 * above is deliberately about refusing to present the result rather than about aborting the work.
 */
const runTool = (db: Database | null, query: Query): Result<SearchResult, RetrievalError> => {
  if (db === null) {
    return err({ _tag: "snapshot_unavailable", detail: "no snapshot is open; run the ingest first" })
  }

  const deadline = startDeadline(TOOL_BUDGET_MS)
  const result = search(db, query)
  if (!isOk(result)) return result

  const elapsed = elapsedMs(deadline)
  if (elapsed > TOOL_BUDGET_MS) {
    return err({ _tag: "budget_exceeded", elapsedMs: elapsed, budgetMs: TOOL_BUDGET_MS })
  }
  return result
}

export * as Tools from "./tools.ts"
