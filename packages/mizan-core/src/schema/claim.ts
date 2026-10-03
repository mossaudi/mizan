import { Schema } from "effect"

/**
 * `Answer` and `Claim` — the model-facing contract, decoded at the trust boundary.
 *
 * ADR-05 is load-bearing here: `text` is the model's *prose* (its interpretation) and
 * `quote` is the *quoted span* (the falsifiable artefact). The verdict is computed on
 * `quote` and never on `text`, because verifying prose means verifying the model's
 * opinion of the source, which is circular.
 *
 * `citations` is capped at 3 by the verifier (ADR D5). The cap is applied at
 * verification time, not here, so that a model emitting six citations produces a
 * documented `citation_cap_exceeded` rather than a silently truncated claim.
 */

export const Citation = Schema.Struct({
  /** Required. Resolution is collection-scoped by design: a hadith number that exists in several collections must not produce a false `rejected`. */
  collection: Schema.String,
  number: Schema.NullOr(Schema.String),
  /** Whatever the model claimed the grade was. NEVER used for the verdict, and never rendered as our ruling. */
  grade: Schema.NullOr(Schema.String),
  /** The citation exactly as the model wrote it, for the citation chip. */
  raw: Schema.String,
})
export type Citation = Schema.Schema.Type<typeof Citation>

export const Claim = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  quote: Schema.NullOr(Schema.String),
  /**
   * A 3-8 word fragment of REAL source text that appears in the cited record, used when the
   * claim abridges the source instead of quoting it. Absent by default, and absence is the
   * overwhelmingly common case: it means "the answer carried no anchor", not "the anchor
   * failed", and the answer it gets is the one it got before anchors existed.
   *
   * Optional rather than `NullOr`-required so that every existing fixture, transcript and
   * ledger entry stays decodable without a migration — a field that must be backfilled is a
   * field that will be backfilled wrong.
   */
  anchor: Schema.optional(Schema.String),
  citations: Schema.Array(Citation),
})
export type Claim = Schema.Schema.Type<typeof Claim>

export const Answer = Schema.Struct({
  /** SHA-256 of the normalized question. The question text itself is never stored or traced. */
  questionHash: Schema.String,
  prose: Schema.String,
  claims: Schema.Array(Claim),
  /** Optional and deliberately so: a MISSING confidence must block at the gate, never default high. */
  confidence: Schema.optional(Schema.Number),
  provider: Schema.String,
  model: Schema.String,
  /** `"live"` or `"precomputed (deterministic)"` — a transcript must never be mistakable for a live generation. */
  transcript: Schema.String,
})
export type Answer = Schema.Schema.Type<typeof Answer>

/** A claim with no quote and no citation: the shape a bare assertion takes. */
export const emptyClaim = (id: string, text: string): Claim => ({ id, text, quote: null, citations: [] })

/**
 * One claim's quote, with "there is no quote" collapsed to `null`.
 *
 * ## Why the rule lives here rather than at each call site
 *
 * The verifier answers a quote-less claim `unverifiable (empty_quote)` — `verifyClaim` folds the
 * quote and returns at step 1 when the fold is empty. But that is a *verdict*, and a caller that
 * has not yet reached the verifier has to decide what to put in the `Claim` it is about to build.
 * Two boundaries do that: the MCP server's argument decoder and the benchmark harness's case
 * construction. They had each grown their own copy of the rule, one written `quote === "" ? null`
 * and one written `fixture.claim.quote ?? ""` — the second of which does not apply the rule at
 * all, so a case carrying no quote would reach the verifier as an empty STRING.
 *
 * That is AGENTS.md section 17 exactly: a duplicated rule is a place where two runs can
 * legitimately disagree. It is here, beside `Claim`, because it is a fact about a `Claim`'s
 * `quote` field and about nothing else.
 *
 * ## Why trimming, when the fold already trims
 *
 * `normalizeForMatch` collapses whitespace and trims, so trimming here changes nothing a verdict
 * can see. What it buys is a single definition of "no quote": without it, `"   "` is a quote
 * here and an empty fold there, so the value means one thing at the boundary and another at the
 * verifier. `null` is the only representation of "this claim asserted no falsifiable span", and
 * the type says so.
 */
export const normalizeQuote = (quote: string | null | undefined): string | null => {
  if (typeof quote !== "string") return null
  const trimmed = quote.trim()
  return trimmed.length === 0 ? null : trimmed
}

export * as ClaimSchema from "./claim.ts"
