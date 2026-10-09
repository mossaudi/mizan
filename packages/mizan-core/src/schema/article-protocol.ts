import { Schema } from "effect"
import { ArticleCoverageReport, CoverageGap, SpanOutcome } from "./article-coverage.ts"
import { DegradationCondition } from "./degradation.ts"

/**
 * The wire shapes of the `verify_document` chunk contract.
 *
 * ## Why these live in core and not in the MCP package
 *
 * Every value here crosses a trust boundary, and AGENTS.md section 1 says the decode happens through
 * a declared schema, never by reading fields off an object that arrived from a client. `@mizan/mcp`
 * imports these and decodes with `decodeOrFail`; a client that wanted the same decoding had to be
 * able to import the same declaration, and two declarations of a wire shape is the drift
 * AGENTS.md section 17 exists to prevent.
 *
 * ## The cursor is a BINDING, not a capability
 *
 * There is no secret anywhere in this file. A client can construct any cursor it likes, and doing so
 * only makes that cursor address its own document. It is not authentication and this module must
 * never be described as though it were — the digest binding exists so that a cursor carried over
 * from one document to another is REFUSED rather than silently restarting the run at index zero,
 * which would present a partial report as the whole document.
 */

/** Bumped only when the wire shape changes incompatibly. */
export const ARTICLE_PROTOCOL_VERSION = 1

/**
 * The document digest, as a plain string.
 *
 * Deliberately NOT a refined string. The shape (64 lowercase hex) is checked by `isSha256Hex`, the
 * one place this repository declares it, and re-declaring it as a schema filter would be a second
 * answer to "what is a digest" — which is the drift AGENTS.md section 17 exists to prevent. A caller
 * that needs the shape asserted calls `isSha256Hex`; the schema only fixes the type.
 */
const DigestHex = Schema.String

/**
 * The stateless cursor: which document, and which segment index comes next.
 *
 * `next` is the NEXT segment index rather than the last processed one, so a caller resuming at 0 and
 * a caller resuming at N use the same field and no caller has to know which of the two a value is.
 */
export const ArticleCursor = Schema.Struct({
  v: Schema.Literal(ARTICLE_PROTOCOL_VERSION),
  digest: DigestHex,
  /** The next segment index to process. Monotone non-decreasing across a run. */
  next: Schema.Number,
})
export type ArticleCursor = Schema.Schema.Type<typeof ArticleCursor>

/**
 * The arguments of one chunk call.
 *
 * `document` is REQUIRED on every call, never only on the first. That is the shape the digest check
 * needs: with a client-supplied digest the server never sees the whole document, so it cannot CHECK
 * the digest, and MS1-1's "a cursor whose digest does not match the submitted document is refused"
 * becomes an assertion the client makes about itself. Re-sending the document lets the server
 * re-segment deterministically and derive the digest itself, which is what makes the check real.
 */
export const ArticleChunkRequest = Schema.Struct({
  document: Schema.String,
  /**
   * The cursor, as canonical JSON — the wire form. Decoded by the boundary through `decodeOrFail`, never
   * by reading fields off it.
   *
   * Plain JSON rather than an opaque blob: this is a BINDING, not a credential, there is no secret in
   * it, and a shape that looks like a handle claims an authority it does not have.
   *
   * Optional KEY as well as a nullable value, because the tool's published `inputSchema` marks only
   * `document` required. A decoder that demanded all three keys present would refuse the minimal call
   * its own schema advertises — and a published schema that disagrees with the code reading it is the
   * defect this repository exists to catch, in the one place it would be hardest for a reader to see.
   */
  cursor: Schema.optional(Schema.NullOr(Schema.String)),
  /** How many segments this chunk may carry. Absent or `null` means the boundary's own cap. */
  chunkSpans: Schema.optional(Schema.NullOr(Schema.Number)),
})
export type ArticleChunkRequest = Schema.Schema.Type<typeof ArticleChunkRequest>

/**
 * The per-chunk counts. Deliberately NOT `ArticleCounts`: this is one chunk's slice, so
 * `segments` here means "segments in this chunk" while `segments` on the assembled report means "the
 * whole document". Reusing the report's type would let a reader confuse the two, which is the exact
 * confusion the denominator exists to prevent.
 */
export const ArticleChunkCounts = Schema.Struct({
  /** Segments this chunk covered. */
  segments: Schema.Number,
  /** Spans the selector emitted from them. */
  extracted: Schema.Number,
  /** Emitted spans that reached the verifier. */
  checked: Schema.Number,
  verified: Schema.Number,
  unverifiable: Schema.Number,
  rejected: Schema.Number,
})
export type ArticleChunkCounts = Schema.Schema.Type<typeof ArticleChunkCounts>

/** One chunk's answer. Every field is a computed value; nothing here is asserted. */
export const ArticleChunkResponse = Schema.Struct({
  protocolVersion: Schema.Literal(ARTICLE_PROTOCOL_VERSION),
  /** The sha256 of the submitted document. Never the document. */
  documentDigest: DigestHex,
  /** The WHOLE-document segment count, so the denominator is on every chunk rather than only the last. */
  segmentCount: Schema.Number,
  // There is deliberately NO chunk-ordinal field here, and the absence is the design.
  //
  // A chunk ordinal is a counter, and a counter needs STATE: to call itself chunk 1 the server has to
  // know that some earlier chunk of this document was chunk 0. The server does not and must not, because
  // the whole contract is stateless — there is no job table, no handle, no cache keyed by a document
  // (ADR-19). `chunkSpans` is a PER-CALL argument, so a client may size two chunks differently, and a
  // stateless counter computed from the call would then report 0 twice in one run: an ordinal that is
  // neither unique nor monotone, which is worse than absent because a client would sort and de-duplicate
  // on it.
  //
  // Nothing is lost by omitting it. `outcomes[].segmentIndex` and `gaps[].segmentIndex` already name
  // every segment this chunk covered, so the client has both the position and the contents of the window
  // without the server keeping a counter.
  counts: ArticleChunkCounts,
  outcomes: Schema.Array(SpanOutcome),
  gaps: Schema.Array(CoverageGap),
  /** The cursor, or `null` only on the final chunk: the run is complete and there is nothing left to resume. */
  cursor: Schema.NullOr(Schema.String),
  degradation: Schema.NullOr(DegradationCondition),
})
export type ArticleChunkResponse = Schema.Schema.Type<typeof ArticleChunkResponse>

/** Re-exported so a consumer can decode an assembled report with one import of this module. */
export { ArticleCoverageReport }

export * as ArticleProtocol from "./article-protocol.ts"
