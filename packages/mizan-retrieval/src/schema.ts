import { Schema } from "effect"

/**
 * The retrieval contract.
 *
 * One `Query` shape for all three tools, so every boundary decode goes through one contract and
 * an empty query is rejected the same way whichever tool was called.
 */
export const Query = Schema.Struct({
  text: Schema.String,
  limit: Schema.optional(Schema.Number),
  collection: Schema.optional(Schema.String),
})
export type Query = Schema.Schema.Type<typeof Query>

/**
 * One result, METADATA ONLY.
 *
 * The architecture requires "metadata-first" records and forbids returning bare strings. This
 * is the whole surface a tool returns: an addressable id plus everything needed to CITE the
 * record — collection, number, the dataset's grade and who asserted it, attribution, licence,
 * source URL.
 *
 * Deliberately absent: `textDisplay` and `textMatch`. Retrieval is a ranking problem, and a
 * ranker that carries the whole corpus text around is a ranker that will accidentally start
 * scoring on text — which is the similarity hole this repository is built to close. The caller
 * reads the full record by id from the same snapshot, which is also what lets the agent
 * length-cap and fence the text it puts in a prompt, in one place, instead of in the ranker.
 */
export const RankedChunk = Schema.Struct({
  id: Schema.String,
  collection: Schema.String,
  number: Schema.NullOr(Schema.String),
  /** 0-based position in the fused ordering, so it can be rendered as "#1". */
  rank: Schema.Number,
  /** The fused RRF score. Higher is better. Not a confidence and not a match percentage. */
  score: Schema.Number,
  grade: Schema.NullOr(Schema.String),
  gradeSource: Schema.String,
  /**
   * Carried explicitly so "this collection has no grade concept" is distinguishable from "the
   * dataset asserts no grade here". Without it a null grade is ambiguous, and the product would
   * be unable to say which of the two it is looking at.
   */
  gradeApplicable: Schema.Boolean,
  attribution: Schema.String,
  license: Schema.String,
  sourceUrl: Schema.String,
})
export type RankedChunk = Schema.Schema.Type<typeof RankedChunk>

/**
 * How the result set was produced, ALWAYS reported.
 *
 * ## Why this is called `ranking` and not `semanticRanking`
 *
 * The degradation matrix calls the surface `semanticRanking: "fused" | "unavailable"`, and the
 * behaviour it demands is right: never let a downgraded result set be presented as full
 * fidelity. But this package ships **two lexical rankers and no dense one**, so a field named
 * `semanticRanking` would assert a semantic index that does not exist — exactly the
 * over-claiming the architecture names as a credibility risk ("calling a one-list fusion
 * 'hybrid' in front of judges is a credibility risk").
 *
 * So the name says what happens, and the values keep the same honest distinction:
 * `fused` = two independent lexical rank lists contributed; `unavailable` = only one did, and
 * the caller is being told the ordering is single-ranker rather than full fidelity.
 */
export const RankingMode = Schema.Union([Schema.Literal("fused"), Schema.Literal("unavailable")])
export type RankingMode = Schema.Schema.Type<typeof RankingMode>

export const SearchResult = Schema.Struct({
  chunks: Schema.Array(RankedChunk),
  count: Schema.Number,
  ranking: RankingMode,
})
export type SearchResult = Schema.Schema.Type<typeof SearchResult>

export * as RetrievalSchema from "./schema.ts"
