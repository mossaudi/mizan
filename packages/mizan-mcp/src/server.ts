import { err, isErr, normalizeQuote, summariseVerdict, type Claim, type ClaimVerdict, type Result } from "@mizan/core"
import { executeVerifyDocument, MAX_CURSOR_CHARS, MAX_SPANS_PER_CHUNK } from "./article-contract.ts"
import { conditionOfCorpusProblem, describeCorpusProblem, type CorpusProblem, type Verifier } from "./verifier.ts"
import { serve, stdioPort, type Port, type ServeOptions } from "./transport.ts"

/**
 * MCP (Model Context Protocol) server for mizan verification.
 *
 * ## What this is
 *
 * A read-only MCP server exposing mizan's deterministic verification as one tool. Other AI
 * systems connect over stdio, discover `verify`, and get back a verdict per claim.
 *
 * ## The shape of the protocol layer
 *
 * Everything here is a pure function of its arguments. The evidence comes in as a `Verifier`
 * (see `verifier.ts` for why that is not a hard-coded empty array), the clock is injected as a
 * deadline predicate the verifier owns, and nothing is written but a response line. That is what
 * makes the "no state is leaked between clients" claim testable rather than asserted: there is no
 * state to leak.
 *
 * ## Security
 *
 * - **Read-only.** No write tool, no ingest, no ledger append; the corpus handle is `readonly`.
 * - **No corpus content out.** Results carry the `VerdictSummary` projection — id, verdict,
 *   reason, match strength — never `evidence`, which holds `sourceUrl`, `license` and
 *   `attribution`. See `summariseVerdict` in `@mizan/core`.
 * - **Input validated at the boundary.** Every tool argument is checked before it reaches the
 *   verifier, and every field is length-capped: an unbounded `quote` is a denial-of-service with
 *   no other motive needed.
 * - **No network.** stdio only, so there is no SSRF surface to allowlist.
 * - **CWE-345.** The verifier reachable from here is `@mizan/verify`'s: containment only, one
 *   dependency, no model in the loop.
 */

/** The MCP protocol revision this server implements. */
export const MCP_PROTOCOL_VERSION = "2024-11-05"

export const SERVER_NAME = "mizan-verify"
export const SERVER_VERSION = "0.1.0"

/**
 * The per-request budget.
 *
 * Enforced by handing the verifier a deadline predicate, NOT by timing the response here.
 * A timeout therefore has exactly one surface — `unverifiable (verification_timeout)`, the
 * vocabulary entry `verifyAnswer` already owns — rather than a second, competing "the MCP layer
 * also had a deadline" error. One failure, one surface (AGENTS.md section 16).
 */
export const REQUEST_TIMEOUT_MS = 30_000

/** The cap on any single client-supplied string field. A question longer than this is not a question. */
export const MAX_QUESTION_LENGTH = 10_000

/** How many claims one `tools/call` may carry. Mirrors the verifier's own per-answer work bound. */
export const MAX_CLAIMS_PER_CALL = 32

/**
 * How many citations one claim may carry. Mirrors `@mizan/verify`'s own per-claim cap.
 *
 * ## Why the boundary repeats the verifier's number instead of trusting it
 *
 * `verifyAnswer` caps a claim's citations at three — but it caps them AFTER the corpus read, and
 * the corpus read happens here, in `verifier.ts`, one SQL statement per citation. A client that
 * sent 5,000 citations per claim across 32 claims therefore spent 160,000 queries, and the cap in
 * `@mizan/verify` then discarded the results of 159,904 of them. Measured against the real
 * 27,234-record snapshot: 32 citations → 13 ms, 3,200 → 600 ms, 32,000 → 5.8 s, 160,000 → 26.9 s.
 *
 * So the client controlled the only expensive phase, and the 30-second budget could not bound it
 * either: `deadlineExpired` is consulted by the verifier, which runs after resolution is already
 * paid for. The cap has to be here, where the work is decided.
 *
 * It is spelled out here rather than imported from `@mizan/verify` so that the boundary's limit is
 * visible at the boundary — and `test/server.test.ts` asserts the two are equal, so the copy cannot
 * silently drift from the cap that actually shapes the verdict.
 */
export const MAX_CITATIONS_PER_CLAIM = 3

/** How many citations one `tools/call` may carry in total. Derived, so the two cannot drift. */
export const MAX_CITATIONS_PER_CALL = MAX_CLAIMS_PER_CALL * MAX_CITATIONS_PER_CLAIM

type JsonRpcRequest = {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly method: string
  readonly params?: unknown
}

/**
 * A JSON-RPC notification: a message with a method and NO `id`.
 *
 * `notifications/initialized` is the one the MCP lifecycle sends immediately after `initialize`,
 * and it is the reason this type exists. JSON-RPC 2.0 §4.1: *"The Server MUST NOT reply to a
 * Notification."* A server that answers one emits an unsolicited response carrying `id: null`,
 * which the official TypeScript and Python SDKs treat as a protocol violation and answer by
 * tearing the session down — so the handshake every real MCP host performs would have failed
 * against this server, and no test noticed because the probe skipped straight from `tools/list`
 * to `verify`.
 *
 * The absence of `id` is what makes it a notification. A request with an explicit `"id": null` is
 * still a request and is still answered, so the two cannot be confused by a client that nulls its
 * ids.
 */
export type JsonRpcNotification = {
  readonly jsonrpc: "2.0"
  readonly method: string
  readonly params?: unknown
}

/** Anything that arrived over the wire and is well-formed JSON-RPC 2.0. Exactly one of the two. */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification

type JsonRpcError = { readonly code: number; readonly message: string }

export type JsonRpcResponse = {
  readonly jsonrpc: "2.0"
  readonly id: string | number | null
  readonly result?: unknown
  readonly error?: JsonRpcError
}

/** The single tool this server exposes. Its input schema is published so clients can discover it. */
export type McpTool = {
  readonly name: string
  readonly description: string
  readonly inputSchema: {
    readonly type: "object"
    readonly properties: Record<string, unknown>
    readonly required: readonly string[]
  }
}

/** An MCP tool result. `isError` is how a refusal travels: as a result, never as a thrown error. */
export type McpToolResult = {
  readonly content: readonly { readonly type: "text"; readonly text: string }[]
  readonly isError?: boolean
}

const CITATION_PROPERTIES = {
  type: "object",
  properties: {
    collection: { type: "string" },
    number: { type: ["string", "null"] },
    grade: { type: ["string", "null"] },
    raw: { type: "string" },
  },
  required: ["collection", "number", "grade", "raw"],
} as const

/** @see MAX_CLAIMS_PER_CALL */
export const VERIFY_TOOL: McpTool = {
  name: "verify",
  description:
    "Verify claims against the mizan hadith corpus. Returns one verdict per claim: verified (the quote is contained in the cited record), rejected (the cited record exists and lacks the quote), or unverifiable (we cannot decide). Verdict and match strength only; no corpus text is returned.",
  inputSchema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        description: "The claims to verify. Each needs claimId, text and citations; quote must be a verbatim span.",
        items: {
          type: "object",
          properties: {
            claimId: { type: "string" },
            text: { type: "string" },
            quote: { type: ["string", "null"] },
            citations: { type: "array", items: CITATION_PROPERTIES },
          },
          required: ["claimId", "text", "citations"],
        },
      },
    },
    required: ["claims"],
  },
}

/**
 * The article tool: a bounded, resumable, stateless chunk of a document (ADR-19).
 *
 * ## Why a second tool rather than a wider `verify`
 *
 * Three reasons, and the first is the one that decides it. The published caps stay exactly where they
 * are — `MAX_CLAIMS_PER_CALL` = 32 and `MAX_CITATIONS_PER_CLAIM` = 3, unchanged, with the measured
 * rationale above them and the equality assertions in `test/server.test.ts` still passing — because
 * raising a cap whose rationale is a measurement deletes the measurement. Second, article scale needs
 * a RESUME, and a cursor is meaningless on a stateless per-claim call. Third, the two answer different
 * questions: `verify` asks about claims a caller already extracted, and `verify_document` publishes how
 * much of a document was actually examined — the `segments` / `extracted` / `checked` denominator that
 * makes "we checked and found nothing" distinguishable from "we never looked".
 *
 * The cursor names a document digest and a next segment index and nothing else. There is no job id, no
 * handle and no server-side state of any kind, which is what keeps "no state is leaked between
 * clients" true by construction rather than by policy.
 */
export const VERIFY_DOCUMENT_TOOL: McpTool = {
  name: "verify_document",
  description:
    "Verify a document in bounded chunks. Sends one chunk's spans through the same containment-only verifier and returns the document digest, the whole-document segment count, this chunk's verdict counts, and a gap for every segment the selector did not emit or the verifier could not finish. Stateless: resume by passing the previous response's cursor and the same document.",
  inputSchema: {
    type: "object",
    properties: {
      document: { type: "string", description: "The document text. Re-sent on every chunk, so the server derives the digest itself." },
      cursor: { type: ["string", "null"], description: `The previous response's cursor, as canonical JSON. At most ${MAX_CURSOR_CHARS} characters.` },
      chunkSpans: { type: ["number", "null"], description: `How many segments this chunk may carry, at most ${MAX_SPANS_PER_CHUNK}.` },
    },
    required: ["document"],
  },
}

/** Every tool this server exposes. Both are read-only, and both are deterministic. */
export const TOOLS: readonly McpTool[] = [VERIFY_TOOL, VERIFY_DOCUMENT_TOOL]

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const INVALID_PARAMS = -32602
const METHOD_NOT_FOUND = -32601

/**
 * The JSON-RPC 2.0 envelope, with the `id` deliberately not consulted.
 *
 * Split out so the request/notification decision reads the shape of the message ONCE rather than
 * each branch re-deriving it. A frame that is not JSON, is not a plain object, or does not declare
 * `jsonrpc: "2.0"` is `null` — malformed, and the only correct answer to it is a parse error.
 */
const parseEnvelope = (raw: string): Record<string, unknown> | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const fields = parsed as Record<string, unknown>
  if (fields["jsonrpc"] !== "2.0") return null
  if (typeof fields["method"] !== "string") return null
  return fields
}

/**
 * Parse one JSON-RPC line: a request, a notification, or `null` for anything malformed.
 *
 * `null` rather than a `Result`: the caller has exactly one thing to do with a bad line — answer
 * `-32700` — so a type that could be ignored would be ignored. The ABSENCE of `id` is the whole
 * discriminator, which is why `parseRequest` below is a projection of this function rather than a
 * second parse that could disagree with it.
 */
export const parseMessage = (raw: string): JsonRpcMessage | null => {
  const fields = parseEnvelope(raw)
  if (fields === null) return null
  if (!("id" in fields)) return fields as unknown as JsonRpcNotification
  if (typeof fields["id"] !== "string" && typeof fields["id"] !== "number" && fields["id"] !== null) return null
  return fields as unknown as JsonRpcRequest
}

/**
 * Parse one JSON-RPC line, or `null` if it carries nothing to answer.
 *
 * `null` for a notification is deliberate and is not an error: "there is nothing to reply to" and
 * "this line was garbage" are different facts, and collapsing them is exactly what made the first
 * version of this server answer `notifications/initialized` with a parse error.
 */
export const parseRequest = (raw: string): JsonRpcRequest | null => {
  const message = parseMessage(raw)
  if (message === null || !("id" in message)) return null
  return message
}

/** A refusal, carried as an MCP tool result so a client never has to catch an exception. */
const toolError = (reason: string, detail: string): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ error: { reason, detail } }) }],
  isError: true,
})

/**
 * The `reason` on a tool error whose cause is the verifier or the corpus behind it, not the client's call.
 *
 * The fallback, not the normal answer: a refusal that can be projected onto the shared vocabulary carries
 * the condition itself, so an integrator branches on `corpus_absent` rather than on this. This is what a
 * refusal that is not about the corpus — and it stays in the type because a future problem could be.
 */
export const VERIFIER_UNAVAILABLE = "verifier_unavailable"

/**
 * Ask the verifier, or report that asking it failed.
 *
 * ## Why this catch exists, and why it is here rather than in `verifier.ts`
 *
 * `createCorpusVerifier` is a thin call chain that ends in `resolveCitations`, and `bun:sqlite`
 * throws — a corrupt or truncated `corpus.db` raises `SQLITE_CORRUPT: database disk image is
 * malformed` from the query, not from any `Result`. That escape reached `main.ts`, which printed it
 * as `mcp transport failed` and exited 3: a *transport* label on a *corpus* fault, and one that
 * ends the session a corpus problem had no business ending (AGENTS.md section 16).
 *
 * `verifier.ts` is the wrong place to absorb it, because a file that rots on disk *during* a
 * session is not one of its pre-flight conditions, so it needs its own surface, and this is it.
 *
 * ## Why the tag is `verifier_faulted` and was not `corpus_unusable`
 *
 * This catch cannot tell where the throw came from, so it must not claim it did. `corpus_unusable`
 * asserts a fact about the corpus file — present, but not openable — and it tells an operator to re-run
 * `bun run ingest`. For a throw raised downstream of the query that is both an unproven diagnosis and
 * the wrong remedy: the ingest would produce the same snapshot and the same failure, and the operator
 * would be sent round that loop by a confident label. `verifier_faulted` claims only what is
 * established (our verification faulted) and projects onto `unverifiable`, which is the product-level
 * truth either way — the claim reached the verifier and could not be decided.
 *
 * The concrete corpus diagnosis is not lost, it is moved to where it can be *made*: `openCorpusVerifier`
 * already reports `corpus_unusable` for a corpus that is unopenable at pre-flight, when the cause is
 * actually in hand. Guessing a cause in a catch is the fail-open move AGENTS.md section 3 forbids.
 *
 * ## Why the message may be forwarded
 *
 * §13 forbids corpus text in a response, and a driver's error string is not corpus text: the one
 * query `resolveCitations` builds is parameterised, so what SQLite reports back is the statement
 * class and the failure reason, never a row. Suppressing it would produce a refusal a client
 * cannot diagnose — the exact "unavailable, for reasons we decline to give" surface section 16
 * forbids. `transport.ts` carries the second, coarser guard for a throw raised anywhere else in
 * the dispatch path. A driver that quotes the corpus file path does leak a filesystem layout, so
 * `describeCorpusProblem` strips absolute paths from this detail on its way to the wire.
 */
const askVerifier = (
  verifier: Verifier,
  claims: readonly Claim[],
  startedAt: number,
  budgetMs: number,
): Result<readonly ClaimVerdict[], CorpusProblem> => {
  try {
    return verifier({
      claims,
      deadlineExpired: () => Date.now() - startedAt >= budgetMs,
    })
  } catch (cause) {
    return err({
      _tag: "verifier_faulted",
      detail: `the verifier faulted during the call: ${cause instanceof Error ? cause.message : String(cause)}`,
    })
  }
}

/**
 * A client string within the cap, or `null` when it is absent.
 *
 * `undefined` and `null` both mean "not supplied", which is how an optional `quote` and a
 * nullable `grade` arrive. Treating an absent `quote` as a type error would refuse every call
 * that omitted it, and the published schema does not require it.
 *
 * The returned `undefined` means "supplied, but not a legal value" and is kept distinct from the
 * `null` above, because the caller reports the two differently: absent is fine, malformed is a
 * refusal.
 */
const optionalText = (value: unknown, cap: number): string | null | undefined =>
  value === undefined || value === null ? null : typeof value === "string" && value.length <= cap ? value : undefined

/** A required client string within the cap. `""` is a value here; the caller decides if it is legal. */
const requiredText = (value: unknown, cap: number): string | null =>
  typeof value === "string" && value.length <= cap ? value : null

/** One citation, decoded. `null` means "not a citation this tool can serve". */
const citationOf = (entry: unknown): Claim["citations"][number] | null => {
  if (typeof entry !== "object" || entry === null) return null
  const fields = entry as Record<string, unknown>
  const collection = requiredText(fields["collection"], 128)
  const number = optionalText(fields["number"], 64)
  const grade = optionalText(fields["grade"], 64)
  const raw = requiredText(fields["raw"], 512)
  if (collection === null || collection.length === 0) return null
  if (number === undefined || grade === undefined || raw === null) return null
  return { collection, number, grade, raw }
}

/**
 * Decode one claim, or return the one thing that is wrong with it.
 *
 * Every field is checked here rather than in the verifier: the verifier is a pure function over
 * values it is entitled to trust, so a client string arriving unvalidated is a boundary this
 * module owns. The message names the field, because a client that cannot tell which argument was
 * wrong will retry the same call.
 */
export const decodeVerifyArgs = (params: unknown): { readonly claims: readonly Claim[] } | { readonly error: string } => {
  if (typeof params !== "object" || params === null) return { error: "arguments must be an object" }
  const raw = (params as Record<string, unknown>)["claims"]
  if (!Array.isArray(raw)) return { error: "claims is required and must be an array" }
  if (raw.length === 0) return { error: "claims must contain at least one claim" }
  if (raw.length > MAX_CLAIMS_PER_CALL) return { error: `claims must contain at most ${MAX_CLAIMS_PER_CALL} claims` }

  const claims: Claim[] = []
  let totalCitations = 0
  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null) return { error: "each claim must be an object" }
    const fields = entry as Record<string, unknown>
    const claimId = requiredText(fields["claimId"], 128)
    if (claimId === null || claimId.length === 0) return { error: "each claim needs a non-empty claimId" }
    const text = requiredText(fields["text"], MAX_QUESTION_LENGTH)
    if (text === null) return { error: `each claim needs a text of at most ${MAX_QUESTION_LENGTH} characters` }
    const quote = optionalText(fields["quote"], MAX_QUESTION_LENGTH)
    if (quote === undefined) return { error: `each claim's quote must be a string of at most ${MAX_QUESTION_LENGTH} characters` }
    if (!Array.isArray(fields["citations"])) return { error: "each claim needs citations, each with collection, number, grade and raw" }
    const supplied = fields["citations"] as readonly unknown[]
    if (supplied.length === 0) return { error: "each claim needs at least one citation" }
    if (supplied.length > MAX_CITATIONS_PER_CLAIM) {
      return { error: `each claim may carry at most ${MAX_CITATIONS_PER_CLAIM} citations` }
    }
    const citations: Claim["citations"][number][] = []
    for (const citation of supplied) {
      const decoded = citationOf(citation)
      if (decoded === null) return { error: "each entry of citations needs a non-empty collection, a number or null, a grade or null, and a raw string" }
      citations.push(decoded)
    }
    // Derived backstop, and honest about what that means: claims x MAX_CITATIONS_PER_CLAIM ==
    // MAX_CITATIONS_PER_CALL by construction, so with the current caps this cannot fire. It is kept
    // because it is the only place the TOTAL is enforced as a total, which is the quantity the SQL
    // cost scales with — and because a reader should be able to see the whole-call bound rather
    // than multiply two constants in their head. Do not read it as a third independent limit.
    if (citations.length + totalCitations > MAX_CITATIONS_PER_CALL) {
      return { error: `a call may carry at most ${MAX_CITATIONS_PER_CALL} citations` }
    }
    totalCitations += citations.length
    claims.push({ id: claimId, text, quote: normalizeQuote(quote), citations })
  }
  return { claims }
}

/**
 * Run the `verify` tool.
 *
 * The clock is read here and handed to the verifier as a deadline predicate, so the timeout's
 * surface is `verification_timeout` rather than a second, transport-shaped error.
 *
 * A refusal from the verifier is answered the same way a bad argument is: a tool error the client can
 * read, with `isError: true` so no client mistakes it for verdicts. The `reason` is the shared
 * degradation condition — `corpus_absent` on a clone, `unverifiable` when the verifier itself faulted
 * mid-session — because the client asked a well-formed question and the failure is ours, so
 * `invalid_arguments` would send it off to fix a request that was never wrong.
 */
export const executeVerify = (verifier: Verifier, params: unknown, startedAt: number, budgetMs: number): McpToolResult => {
  const decoded = decodeVerifyArgs(params)
  if ("error" in decoded) return toolError("invalid_arguments", decoded.error)

  const answered = askVerifier(verifier, decoded.claims, startedAt, budgetMs)
  if (isErr(answered)) {
    return toolError(conditionOfCorpusProblem(answered.error) ?? VERIFIER_UNAVAILABLE, describeCorpusProblem(answered.error))
  }

  const summaries = answered.value.map(summariseVerdict)
  return { content: [{ type: "text", text: JSON.stringify({ verdicts: summaries }) }] }
}

/**
 * Run the `verify_document` tool.
 *
 * A refusal from the contract — an over-cap document, a malformed cursor, a cursor naming a different
 * document — is answered as a tool error carrying the shared degradation condition when it has one, and
 * the raw `reason` when it does not. A caller therefore branches on one vocabulary in both directions
 * rather than learning a second set of words for this tool alone.
 *
 * The refusal detail is forwarded for the same reason `describeCorpusProblem` forwards its own: the
 * message names the cap and the digest, both of which are facts about the call, and neither carries
 * document text (AGENTS.md section 13).
 */
export const executeVerifyDocumentTool = (
  verifier: Verifier,
  params: unknown,
  startedAt: number,
  budgetMs: number,
): McpToolResult => {
  const outcome = executeVerifyDocument(verifier, params, startedAt, budgetMs)
  if ("refusal" in outcome) return toolError(outcome.refusal.condition ?? outcome.refusal.reason, outcome.refusal.detail)
  if ("corpusProblem" in outcome) return toolError(outcome.corpusProblem, outcome.detail)
  return { content: [{ type: "text", text: JSON.stringify(outcome.response) }] }
}

/**
 * Dispatch one request.
 *
 * Pure: same request in, same response out, on any machine, at any time. The clock reaches it
 * only as the timestamp it was given, which is why `Date.now()` appears at the call site in
 * `createServer` rather than here.
 */
export const handleRequest = (request: JsonRpcRequest, verifier: Verifier, startedAt: number, budgetMs: number): JsonRpcResponse => {
  const { id, method } = request

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    }
  }

  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} }

  if (method === "tools/call") {
    const params = request.params as Record<string, unknown> | undefined
    const name = params?.["name"]
    const args = params?.["arguments"]
    if (name === VERIFY_TOOL.name) return { jsonrpc: "2.0", id, result: executeVerify(verifier, args, startedAt, budgetMs) }
    if (name === VERIFY_DOCUMENT_TOOL.name) {
      return { jsonrpc: "2.0", id, result: executeVerifyDocumentTool(verifier, args, startedAt, budgetMs) }
    }
    return { jsonrpc: "2.0", id, error: { code: INVALID_PARAMS, message: `unknown tool: ${String(name)}` } }
  }

  return { jsonrpc: "2.0", id, error: { code: METHOD_NOT_FOUND, message: `method not found: ${method}` } }
}

const errorResponse = (id: string | number | null, code: number, message: string): string =>
  JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } } satisfies JsonRpcResponse)

/**
 * Build the line dispatcher for a verifier.
 *
 * `Date.now()` is read once per line, at the moment the request arrives, so a queue of requests
 * each gets its own 30 seconds rather than sharing one clock.
 *
 * ## `null` means "write nothing", and it means exactly one thing
 *
 * A notification returns `null`, and `null` is the transport's signal to skip the write. It is not
 * a second error channel: malformed JSON still returns a `-32700` line, because a client that sent
 * garbage is entitled to be told so. The two cases were indistinguishable in the first version —
 * both produced a line — and that is how `notifications/initialized` came to be answered with a
 * parse error.
 */
export const createDispatcher =
  (verifier: Verifier, budgetMs: number = REQUEST_TIMEOUT_MS) =>
  (line: string): string | null => {
    const message = parseMessage(line)
    if (message === null) return errorResponse(null, PARSE_ERROR, "Parse error")
    if (!("id" in message)) return null
    return JSON.stringify(handleRequest(message, verifier, Date.now(), budgetMs))
  }

/**
 * The framing loop's configuration, including the one renderer that turns a refusal into a wire line.
 *
 * Extracted from `start` so the options are a single declaration rather than a literal buried in a
 * method. That matters for the throw path specifically: when the renderer was inline, the only way
 * to test a dispatched throw through the protocol layer was to reconstruct
 * `errorResponse(null, -32600, message)` inside the test, which asserts the TEST's copy of the
 * format rather than the server's — so it could pass while the server emitted something else
 * entirely. The refusal format is a fact about this server and now lives in one place
 * (AGENTS.md section 17).
 */
export const framing = (cancelled: () => boolean): ServeOptions => ({
  cancelled,
  refuse: (message: string): string => errorResponse(null, INVALID_REQUEST, message),
})

/**
 * The server.
 *
 * `start` is thin on purpose: framing lives in `transport.ts`, protocol in the functions above,
 * and corpus access in `verifier.ts`. Each piece is tested against a real input it can be handed.
 *
 * ## What `stop` does, and how you know it took effect
 *
 * `stop` requests the loop's exit and interrupts the pending read. It does not merely flip a flag:
 * a flag the loop ignores is a flag that stops nothing, which is what the first version did — the
 * loop read until stdin closed, so `stop()` returned while the server went on answering requests
 * from a caller that believed it had been shut down. Silence after a stop is the property that
 * matters, so both halves are used: `stopping` is what the loop checks at every chunk boundary, and
 * `Port.cancel` is what makes an idle session reach that check.
 *
 * `isRunning` reports the LOOP, so it stays `true` for the moment between the stop request and the
 * loop actually returning. That is not lag in the flag, it is the truth about the process, and it
 * is what makes the other half of the property checkable: awaiting the `start()` promise is how a
 * caller learns the port is closed, and a stop that did not interrupt the read would hang it.
 *
 * ## Why the three mutable bindings are module-local
 *
 * `running`, `stopping` and `active` are the only state in this module, and they are per-SERVER
 * rather than per-PROCESS. One process serves one session, and each client gets its own `Verifier`
 * and its own `dispatch`, so there is nothing here for two clients to interleave on — which is what
 * "no state is leaked between clients" means when the answer is "there is no shared state to leak".
 */
export const createServer = (verifier: Verifier, budgetMs: number = REQUEST_TIMEOUT_MS) => {
  let running = false
  let stopping = false
  let active: Port | null = null

  return {
    get isRunning(): boolean {
      return running
    },
    /** Answer one request, without a transport. The same path `start` uses. `null` means write nothing. */
    dispatch: createDispatcher(verifier, budgetMs),
    start: async (port: Port = stdioPort()): Promise<number> => {
      running = true
      stopping = false
      active = port
      try {
        return await serve(port, createDispatcher(verifier, budgetMs), framing(() => stopping))
      } finally {
        running = false
        active = null
      }
    },
    stop: (): void => {
      stopping = true
      active?.cancel?.()
    },
  }
}

export * as McpServer from "./server.ts"