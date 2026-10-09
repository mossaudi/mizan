import { err, ok, sha256Hex, type Result } from "@mizan/core"
import { segmentSentences } from "./ssr.ts"

/**
 * Document segmentation for the article surface: deterministic, capped, and pure.
 *
 * ## What this module is for
 *
 * The article path needs a DENOMINATOR. Every accountability figure downstream divides by "how many
 * segments did this document have", and a denominator that moves between two runs of the same
 * document makes every ratio beside it meaningless. So segmentation is a pure function here, and the
 * segment indices it produces are the index space the MCP chunk cursor addresses.
 *
 * ## There is exactly ONE sentence splitter in this repository
 *
 * `segmentSentences` in `./ssr.ts` already splits on `. ! ? ۔ ؟` followed by whitespace or end of
 * string. This module calls it rather than writing a second one, because two splitters produce two
 * segment lists for one document and the report would then be quoting a count that depends on which
 * caller ran. One splitter, one denominator (AGENTS.md section 17).
 *
 * ## Pure, and that is the security property
 *
 * No clock, no randomness, no locale, no filesystem, no network, no `eval`, no raw-HTML sink. A
 * function with no way to reach an effect cannot become an injection sink or an exfiltration path,
 * and it cannot hold a connection open — so this module is where a document first touches code
 * without any chance of being treated as an instruction.
 *
 * ## Traces carry the DIGEST and a COUNT, never text
 *
 * `documentDigestOf` exists so a document can be named in a log without being quoted in one
 * (AGENTS.md section 13). There is no function here that formats a segment, and the reason is in
 * `scripts/article-determinism.test.ts`, which asserts it.
 */

/**
 * The declared document cap, in characters.
 *
 * ## This number is ARITHMETIC, not a measurement, and the difference is stated rather than glossed
 *
 * Every other cap in this repository carries a measured figure — `MAX_CLAIMS_PER_CALL` exists
 * because 32,000 citations measured 5.8 s and 160,000 measured 26.9 s against a 30 s budget (see
 * `packages/mizan-mcp/src/server.ts`). This one does not, and pretending otherwise would be the
 * defect this repository exists to catch. What backs it is the product's own arithmetic:
 * `MAX_QUOTE_CHARS` is 4,096, a chunk carries at most `MAX_CLAIMS_PER_CALL` (32) spans, and
 * 4,096 x 32 = 131,072. So a document at the cap is at most ONE chunk of maximum-size spans, and the
 * second chunk is guaranteed to exist rather than being a hope.
 *
 * Raising it therefore requires a measurement of what a larger document costs BEFORE it is raised,
 * for the same reason the citation cap cannot be raised: a cap whose rationale is a measurement
 * loses the measurement the moment it is deleted (ADR-19).
 */
export const MAX_DOCUMENT_CHARS = 131_072

/**
 * How many spans one chunk may carry.
 *
 * ## It is `MAX_CLAIMS_PER_CALL`, and it lives HERE rather than at the boundary
 *
 * A chunk's spans BECOME claims at the MCP boundary, so the chunk must refuse exactly the shapes the
 * boundary already refuses, and 33 spans in a chunk has to be refused with the same vocabulary 33 claims
 * are. The number is therefore 32, which is `MAX_CLAIMS_PER_CALL` in `packages/mizan-mcp/src/server.ts`
 * — and `test/article-contract.test.ts` asserts the two are equal, so the copy cannot drift silently.
 *
 * What changed, and why it is not cosmetic: the constant used to be declared in
 * `packages/mizan-mcp/src/article-contract.ts`, which forced every OTHER user of the chunk size to
 * restate the literal. `apps/cli/src/article-suggestions.ts` then carried `= 32` of its own for a
 * budget whose entire stated rationale is "it is the chunk's span count", so raising the chunk cap to
 * 64 would have left the suggestion budget at 32 with its comment still asserting they were the same
 * number. Two declarations of one fact, which is the defect AGENTS.md section 17 exists to prevent.
 *
 * So it is declared once, here, and imported by every user: `planArticleChunk` in
 * `packages/mizan-mcp/src/article-contract.ts` (which re-exports it at the boundary) and
 * `MAX_SPANS_SUGGESTED_PER_CHUNK` in `apps/cli/src/article-suggestions.ts`. `chunkWindow` below does
 * NOT read it — it takes the span count as a parameter, so a comment claiming otherwise would be
 * asserting a code-level property the code does not have, which is the defect this round exists to
 * remove. The boundary copy remains pinned to `MAX_CLAIMS_PER_CALL` by an equality assertion in
 * `packages/mizan-mcp/test/article-contract.test.ts` rather than by a comment.
 */
export const MAX_SPANS_PER_CHUNK = 32

/** The one place a document-size refusal is named, so no caller invents a second word for it. */
export const DOCUMENT_TOO_LARGE = "document_too_large"

/**
 * Why a document was refused before it was segmented.
 *
 * A closed union, because "the document is too long" and "the document has no content" send a
 * caller to different places — the first is retried in chunks, the second is a client bug — and
 * collapsing them would send an integrator round the wrong loop (AGENTS.md section 16).
 */
export type DocumentRefusal =
  | { readonly _tag: typeof DOCUMENT_TOO_LARGE; readonly detail: string }
  | { readonly _tag: "document_empty"; readonly detail: string }

/**
 * The digest a cursor binds to: `sha256Hex` over the RAW submitted text.
 *
 * ## Why raw and not normalized, stated once
 *
 * Normalizing here would be a second declaration of what a document IS: `normalize/normalize.ts`
 * already owns that fold, and it is applied once at ingest to the corpus. A document is the bytes the
 * client sent. Two byte strings that fold to the same matching key are two documents to a client that
 * has to submit the same text again on every chunk, and a digest that treated them as one document
 * would let a cursor for the NFC form address the NFD form.
 *
 * Cost is O(document) per chunk and the client amortizes it by sending the same string every time;
 * the digest is the only thing that has to be stable, not cheap.
 */
export const documentDigestOf = (text: string): string => sha256Hex(text)

/**
 * Whether the document is within the declared cap.
 *
 * At exactly `MAX_DOCUMENT_CHARS` it passes; at `MAX_DOCUMENT_CHARS + 1` it is refused. The boundary
 * is tested on both sides because an off-by-one here is silent truncation for every document that
 * lands on it.
 *
 * The refusal message carries the cap, because a caller that cannot see the number cannot fix the
 * call and will retry the same bytes.
 */
export const checkDocumentCap = (text: string): Result<null, DocumentRefusal> => {
  if (text.length > MAX_DOCUMENT_CHARS) {
    return err({
      _tag: DOCUMENT_TOO_LARGE,
      detail: `the document is ${text.length} characters and the declared cap is ${MAX_DOCUMENT_CHARS}`,
    })
  }
  return ok(null)
}

/**
 * The document's segments: dense, ascending, zero-based, and identical on every run.
 *
 * Pure, and derived from `segmentSentences` alone. A document with no content yields `[]`, which the
 * caller reports as a refusal rather than as a clean document with zero problems — an empty report
 * is the one shape that reads as success.
 */
export const segmentDocument = (text: string): readonly string[] => segmentSentences(text)

/**
 * The segments a chunk covers, and whether the run is finished.
 *
 * Split out from the caller so "where does chunk k stop" is one fact in one module rather than
 * arithmetic at three call sites, and so the final-chunk rule — a cursor of `null` when there is
 * nothing left — is decided once.
 */
export const chunkWindow = (
  segmentCount: number,
  from: number,
  chunkSpans: number,
): { readonly start: number; readonly end: number; readonly finished: boolean } => {
  const start = Math.max(0, Math.min(from, segmentCount))
  const end = Math.min(start + chunkSpans, segmentCount)
  return { start, end, finished: end >= segmentCount }
}

export * as DocumentSegments from "./document-segments.ts"
