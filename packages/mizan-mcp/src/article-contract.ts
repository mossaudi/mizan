import {
  ARTICLE_PROTOCOL_VERSION,
  ArticleChunkCounts,
  ArticleChunkRequest,
  ArticleChunkResponse,
  ArticleCursor,
  canonicalJson,
  decodeOrFail,
  decodeSync,
  err,
  isSha256Hex,
  ok,
  summariseVerdict,
  type Claim,
  type CoverageGap,
  type DegradationCondition,
  type Result,
  type SpanOutcome,
} from "@mizan/core"
import { checkDocumentCap, chunkWindow, documentDigestOf, MAX_SPANS_PER_CHUNK, segmentDocument, selectSpans, type SelectedSpan } from "@mizan/verify"
import { conditionOfCorpusProblem, describeCorpusProblem, type Verifier } from "./verifier.ts"

/**
 * The bounded, resumable, STATELESS article chunk contract (ADR-19).
 *
 * ## The problem this shape solves without raising a cap
 *
 * The boundary caps at `MAX_CLAIMS_PER_CALL` (32) claims of `MAX_CITATIONS_PER_CLAIM` (3) citations,
 * and that cap exists because of a measurement: against the real 27,234-record snapshot, 32 citations
 * took 13 ms, 3,200 took 600 ms, 32,000 took 5.8 s and 160,000 took 26.9 s against a 30 s budget the
 * verifier cannot interrupt, because the expensive phase is already paid for by the time the deadline
 * is consulted. Article scale is two to three orders of magnitude beyond that.
 *
 * The tempting fix is to raise the cap, and it is refused for the reason that is the whole of
 * ADR-19: raising a cap whose rationale is a MEASUREMENT deletes the measurement. The correct shape
 * is that the CHUNK is the budget unit rather than the document — 32 spans x 3 citations is 96
 * citations, inside the measured 3,200-citation ~600 ms band by a factor of 33 — and the existing
 * caps keep applying to every chunk unchanged. Both constants stay exactly where they are and the
 * equality assertions in `test/server.test.ts` keep passing unmodified.
 *
 * ## Why the client re-sends the document on EVERY chunk
 *
 * Because a client-supplied digest cannot be CHECKED. If the client sent the digest beside a
 * pre-sliced chunk, the server would never see the whole document, never segment it, and the only
 * available "check" would be the client asserting that two strings it chose are equal — which is the
 * assertion a client being lied to would make. Re-sending lets the server re-run deterministic
 * segmentation and derive the digest itself, so "a cursor whose documentDigest does not match the
 * submitted document is refused" is a real check rather than a promise. The cost is a re-send per
 * chunk, which is bandwidth, not correctness.
 *
 * ## Stateless means there is nothing to leak
 *
 * There is no job table, no handle, no cache keyed by a document, no temp file and no cursor signing —
 * because there is no state. "No state is leaked between clients" was already a published property of
 * this server (`server.ts`), and it was testable precisely because there was none. A stateful job table
 * would add a stored asset, a cross-client enumeration path and a signing secret, in exchange for a
 * convenience the client gets for free by keeping the document it already has.
 *
 * ## The cursor is a BINDING, not a credential
 *
 * There is no secret in it. A client can construct any cursor; constructing a CORRECT one only makes
 * that cursor address its own document. That is the entire guarantee, and it must never be described as
 * authentication. The digest binding exists so a cursor carried over from one document to another is
 * refused rather than silently restarting at index zero — which would present a partial report as the
 * whole document.
 *
 * ## Why the refusals run before any work
 *
 * Order is schema, then cap, then cursor, then the corpus. The 5.8 s and 26.9 s measurements above are
 * all corpus queries, and the budget that cannot interrupt them is precisely why the cap sits at this
 * boundary. An over-cap or malformed call therefore costs no query at all.
 */

/**
 * Re-exported so the boundary's own cap stays visible AT the boundary.
 *
 * `MAX_SPANS_PER_CHUNK` is declared once, in `packages/mizan-verify/src/document-segments.ts`, because
 * `apps/cli` also budgets per chunk and a second copy there would be a second definition of the chunk
 * size that could disagree with this one (AGENTS.md section 17). The value remains `MAX_CLAIMS_PER_CALL`, and
 * `test/article-contract.test.ts` asserts the equality rather than assuming it.
 */
export { MAX_SPANS_PER_CHUNK }

/**
 * The cap on a cursor as a client string, in characters.
 *
 * Every client string at this boundary is length-capped — an unbounded field is a denial-of-service
 * with no other motive needed. A canonical cursor occupies about 110 characters, so 512 is far above
 * the real shape and far below anything worth treating as a document index.
 */
export const MAX_CURSOR_CHARS = 512

/**
 * The refusal reasons this module owns, as a closed set.
 *
 * Each is a fact a caller must be able to act on, and each is distinct from every other: a malformed
 * REQUEST is a client bug in the call itself, a malformed CURSOR is a client bug in the resume token,
 * a mismatch is a wrong document, an out-of-range cursor is a client bug with a different remedy, and
 * an over-cap document is retried in more chunks. Collapsing any two of them sends an integrator round
 * the wrong loop (AGENTS.md section 16).
 *
 * ## Why `malformed_request` is separate from `malformed_cursor`, and why it had to be
 *
 * Because the remedy is different and the two are different mistakes. A malformed request fails before
 * a cursor is even looked at — `{document: 42}`, an absent `document`, a `chunkSpans` of `0` — and
 * retrying the same request, or repairing the cursor and resending, both fail identically forever.
 * Reporting those as `malformed_cursor` tells an integrator that the resume token is corrupt when the
 * document field is the problem, which is the one class of bug where the obvious fix (re-encode the
 * cursor) provably does nothing.
 *
 * It was reported as `malformed_cursor` until a reviewer ran four request defects through the boundary
 * and got the same word for all four, which is what the header's "distinct from every other" claim
 * made checkable and failed. The split is not cosmetic: the word a client branches on is the contract.
 */
export const ARTICLE_REFUSALS = {
  malformedRequest: "malformed_request",
  malformedCursor: "malformed_cursor",
  cursorDocumentMismatch: "cursor_document_mismatch",
  cursorOutOfRange: "cursor_out_of_range",
  documentTooLarge: "document_too_large",
  documentEmpty: "document_empty",
} as const

export type ArticleRefusal = (typeof ARTICLE_REFUSALS)[keyof typeof ARTICLE_REFUSALS]

/**
 * The shared degradation condition for each refusal, or `null`.
 *
 * A `Record<ArticleRefusal, …>` for the reason `CONDITION_SENTENCE` gives in
 * `packages/mizan-core/src/schema/degradation.ts`: the key type is the derived union, so adding a
 * refusal without deciding whether it is a shared condition is a `tsc` error rather than a name one
 * surface invents and another cannot read.
 *
 * Only `document_too_large` has one. The request and cursor refusals are about the CALL, not about a
 * run, and `document_empty` is a client bug — reporting `unmeasured` for any of them would publish
 * "nobody produced this figure" about a document that was never read.
 */
export const CONDITION_OF_REFUSAL: Readonly<Record<ArticleRefusal, DegradationCondition | null>> = {
  malformed_request: null,
  malformed_cursor: null,
  cursor_document_mismatch: null,
  cursor_out_of_range: null,
  document_too_large: "document_too_large",
  document_empty: null,
}

/** One refusal, carrying the shared condition when it has one. */
export type ArticleRefusalResult = {
  readonly reason: ArticleRefusal
  readonly detail: string
  readonly condition: DegradationCondition | null
}

const refused = (reason: ArticleRefusal, detail: string): ArticleRefusalResult => ({
  reason,
  detail,
  condition: CONDITION_OF_REFUSAL[reason],
})

/** The typed cursor a response carries. The base64url form is the WIRE form, produced by `encodeCursor`. */
export const cursorOf = (digest: string, next: number): ArticleCursor => ({
  v: ARTICLE_PROTOCOL_VERSION,
  digest,
  next,
})

/**
 * The cursor's WIRE FORM: canonical JSON, as a string.
 *
 * ## Why it is plain JSON and not an opaque blob
 *
 * Two reasons, and the first is the constitutional one. A cursor here is a BINDING, not a credential —
 * there is no secret in it and a client can construct any it likes — so presenting it as an opaque
 * handle would be claiming an authority it does not have, which is the over-claiming AGENTS.md
 * section 12 exists to stop. A judge reading `{"v":1,"digest":"…","next":4}` learns exactly what the
 * resume is asserting, which is the point.
 *
 * The second is gate G-3.2, which bans `Buffer.from(` and the rest of the base64 round-trip vocabulary
 * as encoding-based obfuscation. That rule is right and this is exactly the shape it describes, so the
 * encoding is removed rather than the rule relaxed: there is nothing to hide, and a repository whose
 * gate says base64 only ever conceals something should not be the one to start encoding cursors.
 *
 * `canonicalJson` is what makes the string byte-stable, which is what lets two runs of one document
 * produce the same cursor and lets the resume test compare bytes.
 */
export const encodeCursor = (cursor: ArticleCursor): string => canonicalJson(cursor)

/** `unknown` rather than `any`, and never a throw: a malformed payload is a refusal, not a crash. */
const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * Decode a cursor, or name why it cannot be decoded.
 *
 * Through `decodeOrFail`, never by reading fields off an object: this string arrived from a client and
 * AGENTS.md section 1 is unconditional about that. The LENGTH check runs first because a cursor is a
 * client string like every other, and decoding an unbounded payload is the denial-of-service the cap
 * exists to stop — a document smuggled through one would land in a log line.
 */
export const decodeCursor = (raw: string): Result<ArticleCursor, ArticleRefusalResult> => {
  if (raw.length > MAX_CURSOR_CHARS) {
    return err(refused(ARTICLE_REFUSALS.malformedCursor, `the cursor is ${raw.length} characters and the cap is ${MAX_CURSOR_CHARS}`))
  }
  const decoded = decodeOrFail(decodeSync(ArticleCursor), safeJson(raw), "ArticleCursor")
  if (!decoded.ok) return err(refused(ARTICLE_REFUSALS.malformedCursor, decoded.error.detail))
  if (!isSha256Hex(decoded.value.digest)) {
    return err(refused(ARTICLE_REFUSALS.malformedCursor, "the cursor's documentDigest is not a sha256 digest"))
  }
  if (!Number.isInteger(decoded.value.next) || decoded.value.next < 0) {
    return err(refused(ARTICLE_REFUSALS.malformedCursor, "the cursor's next is not a non-negative integer"))
  }
  return ok(decoded.value)
}

/** What one chunk covers, after the refusals have all been ruled out. */
export type ArticlePlan = {
  readonly segments: readonly string[]
  readonly digest: string
  readonly from: number
  readonly chunkSpans: number
}

/**
 * Where a cursor says the run resumes, after it has been bound to this document.
 *
 * The cursor is an OPTIONAL key on the request, so `undefined` means "no cursor" exactly as `null`
 * does. Both spellings are accepted because the tool's published `inputSchema` admits both, and a
 * decoder that honoured only one of them would refuse a call its own schema allows.
 *
 * A digest mismatch is refused, never corrected. Restarting at zero because the cursor did not match
 * would produce a report covering the document from the beginning and label it a resume — presenting a
 * fresh partial run as a continuation, and, if the client holds a cursor for a different document,
 * producing a confident answer about the wrong document.
 *
 * An out-of-range `next` is refused from the other side: a cursor past the end is a client bug, and
 * clamping it to the last segment would silently drop the tail of the document.
 */
const cursorStart = (
  raw: string | null | undefined,
  digest: string,
  segmentCount: number,
): Result<number, ArticleRefusalResult> => {
  if (raw === null || raw === undefined) return ok(0)
  const decoded = decodeCursor(raw)
  if (!decoded.ok) return err(decoded.error)
  if (decoded.value.digest !== digest) {
    return err(
      refused(
        ARTICLE_REFUSALS.cursorDocumentMismatch,
        `the cursor names document ${decoded.value.digest} and the submitted document is ${digest}`,
      ),
    )
  }
  if (decoded.value.next > segmentCount) {
    return err(
      refused(ARTICLE_REFUSALS.cursorOutOfRange, `the cursor resumes at segment ${decoded.value.next} of ${segmentCount}`),
    )
  }
  return ok(decoded.value.next)
}

/**
 * Decode the arguments, apply the cap, bind the cursor, and size the chunk.
 *
 * `chunkSpans` is CLAMPED rather than refused above `MAX_SPANS_PER_CHUNK`: a client asking for more
 * spans than a chunk can carry has made an arithmetic request, not a hostile one, and the answer it
 * gets is simply the chunk. Zero is different — it would return nothing forever — so that is a refusal.
 *
 * Both refusals below are `malformed_request`, not `malformed_cursor`: neither has read the cursor, so
 * calling either a cursor defect would send the client to repair the one field that was not the problem.
 */
export const planArticleChunk = (params: unknown): Result<ArticlePlan, ArticleRefusalResult> => {
  const decoded = decodeOrFail(decodeSync(ArticleChunkRequest), params, "ArticleChunkRequest")
  if (!decoded.ok) return err(refused(ARTICLE_REFUSALS.malformedRequest, decoded.error.detail))
  const request = decoded.value

  const capped = checkDocumentCap(request.document)
  if (!capped.ok) return err(refused(capped.error._tag, capped.error.detail))

  const segments = segmentDocument(request.document)
  if (segments.length === 0) {
    return err(refused(ARTICLE_REFUSALS.documentEmpty, "the document has no segments, so there is nothing to examine"))
  }

  // Hoisted because the cursor binds to it and the plan carries it: two calls over a 145,000-character
  // document measured 2.2 ms against a 30 s budget, which is immaterial but is still the same hash twice.
  const digest = documentDigestOf(request.document)

  const from = cursorStart(request.cursor, digest, segments.length)
  if (!from.ok) return err(from.error)

  const asked = request.chunkSpans ?? MAX_SPANS_PER_CHUNK
  if (asked <= 0) {
    return err(refused(ARTICLE_REFUSALS.malformedRequest, `chunkSpans must be at least 1, and ${asked} was requested`))
  }
  return ok({ segments, digest, from: from.value, chunkSpans: Math.min(asked, MAX_SPANS_PER_CHUNK) })
}

/**
 * The claims one chunk verifies.
 *
 * ## Why these carry NO citations, and what that honestly means
 *
 * Sprint 1's selector is deterministic and finds quotation-shaped spans; it resolves no citation,
 * because resolving a citation is a different extraction with a different failure mode and no story
 * authorises it. The verifier therefore answers `unverifiable (no_citation)` for every emitted span —
 * which is the FAIL-CLOSED verdict, is vocabulary the verifier already owns, and is a strictly better
 * outcome than a citation guessed at. It is stated here rather than left to be discovered, because a
 * caller seeing zero `verified` on a clean document needs to know why.
 *
 * The blast radius of being wrong is bounded by construction: `unverifiable` can never become
 * `verified`, and the only route to `verified` is containment against a RESOLVED record — and nothing
 * here resolves one.
 */
const claimsForChunk = (spans: readonly SelectedSpan[]): readonly Claim[] =>
  spans.map((span) => ({ id: `seg-${span.segmentIndex}`, text: `segment ${span.segmentIndex}`, quote: span.quote, citations: [] }))

/** `seg-<index>` back to the number, and `NaN` is impossible because the ids are built here. */
const segmentIndexOf = (claimId: string): number => Number(claimId.slice("seg-".length))

/** The per-chunk counts, accumulated in one pass. Never supplied by the caller. */
const chunkCountsOf = (windowSegments: number, outcomes: readonly SpanOutcome[]): ArticleChunkCounts => {
  let verified = 0
  let unverifiable = 0
  let rejected = 0
  for (const outcome of outcomes) {
    if (outcome.summary.verdict === "verified") verified += 1
    if (outcome.summary.verdict === "unverifiable") unverifiable += 1
    if (outcome.summary.verdict === "rejected") rejected += 1
  }
  return { segments: windowSegments, extracted: outcomes.length, checked: outcomes.length, verified, unverifiable, rejected }
}

/**
 * The gaps for one chunk: what the selector did not emit, plus what the verifier could not finish.
 *
 * The second list is why a timeout is a GAP rather than a bare `unverifiable` count: the report has to
 * be able to say "this span was emitted and we could not decide it", which is a different sentence
 * from "we never looked at it".
 */
const gapsForChunk = (
  selection: { readonly gaps: readonly { readonly segmentIndex: number; readonly reason: CoverageGap["reason"] }[] },
  outcomes: readonly SpanOutcome[],
  end: number,
): readonly CoverageGap[] => [
  ...selection.gaps
    .filter((gap) => gap.segmentIndex < end)
    .map((gap) => ({ segmentIndex: gap.segmentIndex, stage: "not_extracted" as const, reason: gap.reason })),
  ...outcomes
    .filter((outcome) => outcome.summary.reason === "verification_timeout")
    .map((outcome) => ({ segmentIndex: outcome.segmentIndex, stage: "not_checked" as const, reason: "verification_timeout" as const })),
]

/** A chunk's answer, or one refusal. The corpus problem is projected onto the shared vocabulary. */
export type ArticleChunkOutcome =
  | { readonly refusal: ArticleRefusalResult }
  | { readonly corpusProblem: string; readonly detail: string }
  | { readonly response: ArticleChunkResponse }

/**
 * Run one chunk.
 *
 * @param startedAt when the request arrived. The clock reaches the deadline predicate here rather than
 *   being read inside the verifier, which is forbidden a clock (AGENTS.md section 9).
 * @param budgetMs the per-request budget — `REQUEST_TIMEOUT_MS`, reused and never redefined.
 */
export const executeVerifyDocument = (
  verifier: Verifier,
  params: unknown,
  startedAt: number,
  budgetMs: number,
): ArticleChunkOutcome => {
  const planned = planArticleChunk(params)
  if (!planned.ok) return { refusal: planned.error }
  const { segments, digest, from, chunkSpans } = planned.value

  const window = chunkWindow(segments.length, from, chunkSpans)
  const selection = selectSpans(segments, window.start)
  const scoped = selection.spans.filter((span) => span.segmentIndex < window.end)

  const asked = verifier({
    claims: claimsForChunk(scoped),
    deadlineExpired: () => Date.now() - startedAt >= budgetMs,
  })
  if (!asked.ok) {
    return { corpusProblem: conditionOfCorpusProblem(asked.error) ?? "verifier_unavailable", detail: describeCorpusProblem(asked.error) }
  }

  const outcomes: SpanOutcome[] = asked.value.map((verdict) => ({
    segmentIndex: segmentIndexOf(verdict.claimId),
    state: "checked" as const,
    summary: summariseVerdict(verdict),
    suggestion: null,
  }))
  const gaps = gapsForChunk(selection, outcomes, window.end)

  // No chunk ordinal, deliberately: a stateless server cannot know one, so any field it published would
  // be a per-call computation dressed as a run position. `outcomes` and `gaps` already carry every
  // segment index this window covered, which is what a client needed the ordinal for.
  return {
    response: {
      protocolVersion: ARTICLE_PROTOCOL_VERSION,
      documentDigest: digest,
      segmentCount: segments.length,
      counts: chunkCountsOf(window.end - window.start, outcomes),
      outcomes,
      gaps,
      cursor: window.finished ? null : encodeCursor(cursorOf(digest, window.end)),
      degradation: gaps.some((gap) => gap.reason === "verification_timeout") ? "unverifiable" : null,
    },
  }
}

export * as ArticleContract from "./article-contract.ts"
