import { Schema } from "effect"

/**
 * Which part of the corpus a search may look in.
 *
 * ## Why this replaced a `collection` filter, and what that bug was
 *
 * `Query` used to carry `collection?: string`, and `hadithSearch` passed `"hadith"` — a string
 * that names no collection, because `collection` holds a per-source slug (`abudawud`, `nasai`,
 * `tirmidhi`) and hadith is a family of books rather than one. So the filter matched zero of the
 * corpus's 27 234 rows: hadith retrieval returned nothing, ever, and every hadith question
 * degraded to `no sources found` while the tool reported having run. Nothing failed loudly,
 * which is the worst way for it to fail.
 *
 * The fix is not `"hadith"` written down differently, and it is not a hardcoded list of the
 * five hadith slugs — that list would be the same class of assumption, one release behind the
 * data. The two parts of this corpus are the Qur'an and everything else, so that is what the
 * scope names, and `QURAN_COLLECTION` from `@mizan/core` is the single place the boundary is
 * written. A new hadith book is searchable the moment it is ingested.
 *
 * `any` exists for the unscoped case: `bm25Order` and the fusion tests use it, and it is what a
 * `Query` with no scope means.
 */
export const CorpusScope = Schema.Union([
  Schema.Literal("quran"),
  Schema.Literal("hadith"),
  Schema.Literal("any"),
])
export type CorpusScope = Schema.Schema.Type<typeof CorpusScope>

/**
 * The retrieval contract.
 *
 * One `Query` shape for all three tools, so every boundary decode goes through one contract and
 * an empty query is rejected the same way whichever tool was called.
 */
export const Query = Schema.Struct({
  text: Schema.String,
  limit: Schema.optional(Schema.Number),
  /** Absent means `any`. See `CorpusScope` for why this is not a collection name. */
  scope: Schema.optional(CorpusScope),
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
