/**
 * `@mizan/retrieval` — bounded, deterministic, metadata-first lexical retrieval.
 *
 * What this package is allowed to be: an ordered list of record ids per ranker, fused by
 * Reciprocal Rank Fusion, projected to citation metadata.
 *
 * What it is not allowed to be, and why the restriction is the point:
 *
 *  - **Not an LLM caller.** Routing is the agent's job, and a model in the retrieval path would
 *    make result sets non-reproducible.
 *  - **Not a similarity scorer.** There is no threshold, no embedding, and no "close enough".
 *    A ranker here outputs POSITIONS, never a score that could be compared to a cut-off. The one
 *    similarity question in this product is asked by the verifier, which accepts exact
 *    containment and nothing else.
 *  - **Not an arbitrary fetcher.** The only network client in the system lives in
 *    `@mizan/corpus/http.ts` behind a host allowlist. Retrieval reads a local snapshot.
 *  - **Not a text carrier.** Results are metadata; the caller reads record text by id from the
 *    same snapshot, which is what keeps prompt length-capping in one place (the agent) instead
 *    of smeared across a ranker.
 *
 * The FTS5 query language is a real injection surface, so `query.ts` is a security boundary and
 * not a string helper.
 */

export {
  Query,
  RankedChunk,
  RankingMode,
  RetrievalSchema,
  SearchResult,
} from "./schema.ts"

export { RRF_K, fuse, type FusedHit, type RankedList } from "./rrf.ts"

export {
  FtsQuery,
  MAX_QUERY_CHARS,
  assertQuotable,
  broadExpression,
  phraseExpression,
  prefixExpression,
  prepareQuery,
} from "./query.ts"

export { Search, search } from "./search.ts"

export { TOOL_BUDGET_MS, Tools, hadithSearch, quranSearch, tafsirLookup } from "./tools.ts"
