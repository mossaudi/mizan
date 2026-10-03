import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { MAX_CITATIONS_PER_CLAIM as VERIFY_MAX_CITATIONS_PER_CLAIM } from "@mizan/verify"
import { buildSnapshot, type Attestation, type SnapshotIdentity } from "@mizan/corpus"
import type { Claim, ClaimVerdict, CorpusRecord } from "@mizan/core"
import {
  createDispatcher,
  createServer,
  decodeVerifyArgs,
  executeVerify,
  framing,
  handleRequest,
  parseMessage,
  parseRequest,
  MAX_CITATIONS_PER_CALL,
  MAX_CITATIONS_PER_CLAIM,
  MAX_CLAIMS_PER_CALL,
  MAX_QUESTION_LENGTH,
  TOOLS,
  type JsonRpcResponse,
} from "../src/server.ts"
import { MAX_LINE_CODE_UNITS, serve, type Port } from "../src/transport.ts"
import {
  describeCorpusProblem,
  openCorpusVerifier,
  type CorpusProblem,
  type Verifier,
} from "../src/verifier.ts"

/**
 * MCP server tests.
 *
 * ## The test that matters most
 *
 * `the server returns whatever the verifier decided` is a PLANTED-VIOLATION test, and it exists
 * because the first version of this server passed every other test in this file while being
 * unable to answer anything: it called `verifyAnswer` with `evidence: []`, so every client got
 * the same verdict and no request could ever be `verified`. Nothing in "the tool accepts a
 * question and returns a verdict" would have noticed. A server whose failure mode looks like its
 * answer is the CWE-345 shape one process boundary out, and the only thing that catches it is a
 * test that changes the verifier's output and insists the server's output follows.
 *
 * ## What these tests do not do
 *
 * They never open `data/corpus.db`. The snapshot is gitignored and rebuilt by `bun run ingest`, so
 * a test that needed it would pass on this machine and fail on a clean clone — a flaky-by-
 * environment guard, which is worse than no guard. `openCorpusVerifier`'s refusals are tested
 * against paths that cannot exist, and its ACCEPT path against a planted snapshot built in a temp
 * directory by `plantedSnapshot` below: a real SQLite file, real `snapshot_meta` rows, and a real
 * `attestation.json`. That is what lets the gate be tested in both directions without depending on
 * a build step.
 */

const CITATION = { collection: "tirmidhi", number: "1", grade: null, raw: "tirmidhi:1" } as const

/** A fixed list of chunks as a stream, so a test can say exactly where a request was split. */
const chunksOf = (chunks: readonly string[]): AsyncIterable<string> =>
  (async function* (): AsyncGenerator<string> {
    for (const chunk of chunks) yield chunk
  })()

/** Poll until `ready`, so a test never depends on how many microtasks a transport needs. */
const until = async (ready: () => boolean, ms: number = 2_000): Promise<void> => {
  const deadline = Date.now() + ms
  while (!ready()) {
    if (Date.now() > deadline) throw new Error("the transport never became ready")
    await Bun.sleep(1)
  }
}

/** Resolve with `work`, or fail legibly rather than hanging until the test runner's timeout. */
const within = async (work: Promise<number>, ms: number): Promise<number> => {
  const expired = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("the loop never returned: stop did not interrupt the read")), ms),
  )
  return await Promise.race([work, expired])
}

/**
 * The one record the planted snapshot holds, quoted from the public Tirmidhi entry on "the key of
 * the prayer".
 *
 * Arabic corpus text, not Latin, and that is the whole reason this fixture can tell a verifier that
 * works from one that does not: `verifyAnswer` answers `verified` only when the quote is CONTAINED
 * in the cited record after normalisation, so a Latin record holding a Latin quote would verify
 * while proving nothing about the folding path. The one thing this repository exists to prevent is a
 * false `verified`, so the fixture that exercises `verified` should be the one that is hardest to
 * pass by accident.
 */
const PLANTED_TEXT = "مفتاح الصلاه الطهور وتحريمها التكبير وتحليلها التسليم"

const plantedClaim = (): Claim => ({ id: "planted-1", text: "a claim", quote: PLANTED_TEXT, citations: [CITATION] })

const plantedRecord = (): CorpusRecord => ({
  id: "planted:tirmidhi:1",
  collection: "tirmidhi",
  number: "1",
  grade: null,
  gradeApplicable: false,
  gradeSource: "planted",
  gradeBasis: "none",
  attribution: "planted",
  license: "planted",
  licenseUrl: "https://example.invalid/licence",
  sourceUrl: "https://example.invalid/hadith",
  textDisplay: PLANTED_TEXT,
  textMatch: PLANTED_TEXT,
  translation: undefined,
})
type PlantedSnapshot = {
  readonly corpusPath: string
  readonly attestationPath: string
  readonly absentAttestationPath: string
  /** What the snapshot on disk actually says about itself. */
  readonly identity: SnapshotIdentity
  /** Delete everything this helper wrote. Safe to call twice. */
  readonly dispose: () => void
}

/**
 * Build a real snapshot and a matching attestation in a temp directory, so the gate has something
 * to compare.
 *
 * Built with the production `buildSnapshot`, not with hand-written DDL and a hand-written hash. The
 * first version of this fixture did neither dependency and failed twice in ways that had nothing to
 * do with the gate: a `records` table missing the ten columns `resolveCitations` selects, and an
 * attestation key (`builtAt`) that is not in `AttestationSchema`. Both failures arrived as
 * `attestation_unreadable`, the same tag as a genuinely corrupt file, so they read as a broken
 * security control rather than a broken fixture. A fixture built by the same code that builds the
 * real corpus cannot drift from it.
 *
 * The `overrides` corrupt the ATTESTATION only, never the snapshot, which is the only way the gate
 * can actually be observed failing: a snapshot that agrees with itself proves nothing about the
 * comparison.
 */
const plantedSnapshot = (overrides: { readonly snapshotHash?: string; readonly recordCount?: number } = {}): PlantedSnapshot => {
  const dir = mkdtempSync(join(tmpdir(), "mizan-mcp-planted-"))
  const corpusPath = join(dir, "corpus.db")
  const attestationPath = join(dir, "attestation.json")

  const snapshot = buildSnapshot(corpusPath, [plantedRecord()])
  snapshot.close()

  // Typed as `Attestation` so the compiler, not the decoder, is what catches a renamed field.
  const attested: Attestation = {
    schemaVersion: "1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    snapshotHash: overrides.snapshotHash ?? snapshot.snapshotHash,
    recordCount: overrides.recordCount ?? snapshot.recordCount,
    quarantinedRows: 0,
    collectionCounts: { tirmidhi: 1 },
    sources: [],
    chainHead: "planted",
    chainLength: 1,
  }
  writeFileSync(attestationPath, `${JSON.stringify(attested)}\n`)

  return {
    corpusPath,
    attestationPath,
    absentAttestationPath: join(dir, "not-written.json"),
    identity: { snapshotHash: snapshot.snapshotHash, recordCount: snapshot.recordCount },
    dispose: () => {
      // Best effort, and deliberately not asserted on. Bun on Windows keeps a file lock until the
      // Database is collected, so `rmSync` can return EBUSY even though every handle was closed
      // properly - `bun:sqlite` is the reason, not a leak in the code under test. The directory is
      // in the OS temp dir so a leftover cannot dirty the repository, and a retry makes the common
      // case clean without turning a platform quirk into a red build.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          rmSync(dir, { recursive: true, force: true })
          return
        } catch {
          continue
        }
      }
    },
  }
}
const claimArgs = (id: string, quote: string | null = "quote"): unknown => ({
  claimId: id,
  text: `prose for ${id}`,
  quote,
  citations: [CITATION],
})

const callArgs = (claims: readonly unknown[]): unknown => ({ name: "verify", arguments: { claims } })

/** A `ClaimVerdict` shaped by what the verifier should return for a given claim. */
const verdictFor = (claimId: string, verdict: ClaimVerdict["verdict"] = "verified"): ClaimVerdict => ({
  claimId,
  verdict,
  reason: verdict === "verified" ? "exact_containment" : "identifier_unresolved",
  matchStrength: verdict === "verified" ? { kind: "exact", percent: 100 } : { kind: "none" },
  evidence: null,
})

/** A verifier that echoes a decision per claim and records what it was asked. */
const stubVerifier = (seen: Claim[][] = [], decide: (claim: Claim) => ClaimVerdict["verdict"] = () => "verified"): Verifier => {
  return (input): readonly ClaimVerdict[] => {
    seen.push([...input.claims])
    return input.claims.map((claim) => verdictFor(claim.id, decide(claim)))
  }
}

/**
 * A verifier that throws the way `bun:sqlite` does.
 *
 * This stands in for the real fault: a `corpus.db` that rots on disk AFTER `openCorpusVerifier`
 * succeeded, so `resolveCitations` raises `SQLITE_CORRUPT: database disk image is malformed` out of
 * the query rather than returning a `Result`. It is the one failure mode no pre-flight check can
 * see, which is exactly why it needs a surface of its own.
 */
const throwingVerifier = (message: string): Verifier => () => {
  throw new Error(message)
}

const readJson = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>
type McpToolResultOfResponse = { content: readonly { readonly text: string }[]; isError?: boolean }
const resultOf = (response: JsonRpcResponse): McpToolResultOfResponse => response.result as McpToolResultOfResponse
const verdictsOf = (result: McpToolResultOfResponse): readonly { claimId: string; verdict: string }[] => {
  const parsed = readJson(result.content[0]!.text) as { verdicts?: readonly { claimId: string; verdict: string }[] }
  return parsed.verdicts ?? []
}

/**
 * Read the claim schema off the published tool, so a drift between the docs and the tool is a
 * failing test rather than a client discovering it.
 */
const publishedClaimSchema = (): {
  readonly required: readonly string[]
  readonly properties: Record<string, unknown>
} => {
  const tool = TOOLS[0]!
  const claims = tool.inputSchema.properties["claims"] as { readonly items: { readonly required: readonly string[]; readonly properties: Record<string, unknown> } }
  return claims.items
}

describe("parseRequest — a line that is not a JSON-RPC request is refused, not guessed at", () => {
  test("accepts a well-formed request", () => {
    expect(parseRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }))?.method).toBe("tools/list")
  })

  test("refuses invalid JSON", () => {
    expect(parseRequest("not json")).toBeNull()
  })

  test("refuses a non-object", () => {
    expect(parseRequest("42")).toBeNull()
    expect(parseRequest("null")).toBeNull()
  })

  test("refuses a request with no `jsonrpc: \"2.0\"`", () => {
    expect(parseRequest(JSON.stringify({ id: 1, method: "tools/list" }))).toBeNull()
  })

  test("refuses a request with no method", () => {
    expect(parseRequest(JSON.stringify({ jsonrpc: "2.0", id: 1 }))).toBeNull()
  })

  test("refuses an id that is not a string, number or null", () => {
    expect(parseRequest(JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" }))).toBeNull()
  })
})

describe("parseMessage — a request, a notification, or neither", () => {
  test("a notification is recognised as a notification, not refused as malformed", () => {
    // The lifecycle's `notifications/initialized` has no `id`. Treating that as garbage produced a
    // `-32700` line with `id: null`, which the official MCP SDKs treat as a protocol violation and
    // answer by dropping the session — so the handshake every real host performs failed.
    const message = parseMessage(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))
    expect(message).not.toBeNull()
    expect(message?.method).toBe("notifications/initialized")
  })

  test("`parseRequest` returns null for a notification, because a notification has nothing to answer", () => {
    expect(parseRequest(JSON.stringify({ jsonrpc: "2.0", method: "ping" }))).toBeNull()
  })

  test("a request with an explicit null id is still a request, and is still answered", () => {
    // `"id": null` is a request that chose to null its id; it is not the absence of an id. Reading
    // the two as the same thing would leave a client that nulls its ids unable to get answers.
    expect(parseRequest(JSON.stringify({ jsonrpc: "2.0", id: null, method: "ping" }))?.method).toBe("ping")
  })

  test("malformed input is still `null` from `parseMessage`, so it can still be answered with a parse error", () => {
    for (const raw of ["not json", "42", "null", "[]", JSON.stringify({ id: 1, method: "ping" }), JSON.stringify({ jsonrpc: "2.0", id: 1 })]) {
      expect(parseMessage(raw)).toBeNull()
    }
  })

  test("an id that is not a string, number or null is refused", () => {
    expect(parseMessage(JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" }))).toBeNull()
  })
})

describe("the MCP lifecycle — initialize, notifications/initialized, tools/list", () => {
  /** The three lines a real MCP host sends, dispatched. `null` in the middle is the whole point. */
  const lifecycle = (): readonly (string | null)[] => {
    const dispatch = createDispatcher(stubVerifier())
    return [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ].map((line) => dispatch(line))
  }

  test("the notification is answered with nothing at all", () => {
    expect(lifecycle()[1]).toBeNull()
  })

  test("every request around it is answered, so the session survives", () => {
    const answers = lifecycle()
    expect(answers.filter((answer) => answer !== null)).toHaveLength(2)
    expect((JSON.parse(answers[0]!) as { id: number }).id).toBe(1)
    expect((JSON.parse(answers[2]!) as { id: number }).id).toBe(2)
  })

  test("the whole handshake over real stdio framing writes exactly two lines, in order", async () => {
    // The reproduction of the defect this closes: the notification must produce NO line, so a client
    // reading one line per request sees `initialize` then `tools/list` and nothing between them.
    const written: string[] = []
    const lines = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ]
    const port: Port = {
      chunks: (async function* (): AsyncGenerator<string> {
        yield `${lines.join("\n")}\n`
      })(),
      write: (line) => {
        written.push(line)
      },
    }
    const served = await serve(port, createDispatcher(stubVerifier()))
    expect(served).toBe(2)
    expect(written).toHaveLength(2)
    const answers = written.map((line) => JSON.parse(line) as { id: string | number | null })
    expect(answers.map((answer) => answer.id)).toEqual([1, 2])
    // The defect being closed, asserted on the property itself: no response carries `id: null`.
    for (const answer of answers) expect(answer.id).not.toBeNull()
  })

  test("a malformed line is still answered, so the notification case did not make the transport silent", async () => {
    const written: string[] = []
    const port: Port = {
      chunks: (async function* (): AsyncGenerator<string> {
        yield `not json\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })}\n`
      })(),
      write: (line) => {
        written.push(line)
      },
    }
    await serve(port, createDispatcher(stubVerifier()))
    expect(written).toHaveLength(2)
    expect((JSON.parse(written[0]!) as { error: { code: number } }).error.code).toBe(-32700)
    expect((JSON.parse(written[1]!) as { id: number }).id).toBe(9)
  })
})

describe("tool discovery", () => {
  test("initialize names the server and the protocol revision", () => {
    const response = handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, stubVerifier(), 0, 30_000)
    expect(response.error).toBeUndefined()
    const result = response.result as { serverInfo: { name: string }; protocolVersion: string }
    expect(result.serverInfo.name).toBe("mizan-verify")
    expect(result.protocolVersion).toBe("2024-11-05")
  })

  test("the initialize result is byte-identical across 100 calls, because discovery is deterministic", () => {
    const bodies = Array.from({ length: 100 }, () =>
      JSON.stringify(handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, stubVerifier(), 0, 30_000).result),
    )
    expect(new Set(bodies).size).toBe(1)
  })

  test("tools/list returns exactly the verify tool", () => {
    const response = handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, stubVerifier(), 0, 30_000)
    const result = response.result as { tools: readonly { name: string }[] }
    expect(result.tools.map((tool) => tool.name)).toEqual(["verify"])
  })

  test("the published schema marks every citation field required, so a client cannot omit `raw`", () => {
    const item = publishedClaimSchema()
    expect(item.required).toEqual(["claimId", "text", "citations"])
    const citation = item.properties["citations"] as { items: { required: readonly string[] } }
    expect(citation.items.required).toEqual(["collection", "number", "grade", "raw"])
  })

  test("discovery is served well inside the 100ms budget, on 100 consecutive calls", () => {
    const started = Date.now()
    for (let i = 0; i < 100; i += 1) handleRequest({ jsonrpc: "2.0", id: i, method: "tools/list" }, stubVerifier(), 0, 30_000)
    expect(Date.now() - started).toBeLessThan(100)
  })
})

describe("the verify tool", () => {
  test("returns the verdict the verifier decided", () => {
    const result = executeVerify(stubVerifier(), { claims: [claimArgs("c-1")] }, 0, 30_000)
    expect(result.isError).toBeUndefined()
    expect(verdictsOf(result).map((verdict) => [verdict.claimId, verdict.verdict])).toEqual([["c-1", "verified"]])
  })

  test("returns whatever the verifier decided — the planted violation this server once failed", () => {
    // The two answers differ in every field. A server that computed its own verdict, or shipped
    // a fixed one, would give the same response for both and this assertion would fail.
    const verified = executeVerify(stubVerifier([], () => "verified"), { claims: [claimArgs("c-1")] }, 0, 30_000)
    const rejected = executeVerify(stubVerifier([], () => "rejected"), { claims: [claimArgs("c-1")] }, 0, 30_000)
    expect(verdictsOf(verified)[0]?.verdict).toBe("verified")
    expect(verdictsOf(rejected)[0]?.verdict).toBe("rejected")
  })

  test("hands the verifier the claims the client sent, unedited", () => {
    const seen: Claim[][] = []
    executeVerify(stubVerifier(seen), { claims: [claimArgs("c-1"), claimArgs("c-2")] }, 0, 30_000)
    expect(seen[0]?.map((claim) => claim.id)).toEqual(["c-1", "c-2"])
    expect(seen[0]?.[0]?.citations[0]?.raw).toBe("tirmidhi:1")
  })

  test("passes the caller's budget to the verifier as a deadline predicate, not as a second error surface", () => {
    const budgets: number[] = []
    const verifier: Verifier = (input) => {
      if (input.deadlineExpired?.() === true) budgets.push(1)
      return input.claims.map((claim) => verdictFor(claim.id, "unverifiable"))
    }
    // `startedAt` is already older than the budget, so the predicate the verifier saw was expired.
    executeVerify(verifier, { claims: [claimArgs("c-1")] }, 0, 1)
    expect(budgets).toEqual([1])
  })

  test("a request inside its budget is not reported as expired", () => {
    const seen: boolean[] = []
    const verifier: Verifier = (input) => {
      seen.push(input.deadlineExpired?.() ?? false)
      return input.claims.map((claim) => verdictFor(claim.id, "verified"))
    }
    executeVerify(verifier, { claims: [claimArgs("c-1")] }, Date.now(), 30_000)
    expect(seen).toEqual([false])
  })

  test("an empty quote is normalised to null, so an empty span cannot be verified", () => {
    const seen: Claim[][] = []
    executeVerify(stubVerifier(seen), { claims: [claimArgs("c-1", "")] }, 0, 30_000)
    expect(seen[0]?.[0]?.quote).toBeNull()
  })

  test("a 10,000-character question is accepted, which is the documented cap", () => {
    const args = [{ claimId: "c-1", text: "a".repeat(MAX_QUESTION_LENGTH), quote: "q", citations: [CITATION] }]
    expect(executeVerify(stubVerifier(), { claims: args }, 0, 30_000).isError).toBeUndefined()
  })

  test("a question one character past the cap is refused, and the message names the field", () => {
    const result = executeVerify(stubVerifier(), { claims: [{ claimId: "c-1", text: "a".repeat(MAX_QUESTION_LENGTH + 1), citations: [CITATION] }] }, 0, 30_000)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain("text")
  })

  test("an unbounded quote is refused — an uncapped span is a denial of service with no motive needed", () => {
    const result = executeVerify(stubVerifier(), { claims: [{ claimId: "c-1", text: "t", quote: "q".repeat(1_000_000), citations: [CITATION] }] }, 0, 30_000)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain("quote")
  })

  test("a call with more claims than the cap is refused", () => {
    const claims = Array.from({ length: MAX_CLAIMS_PER_CALL + 1 }, (_, i) => claimArgs(`c-${i}`))
    expect(executeVerify(stubVerifier(), { claims }, 0, 30_000).isError).toBe(true)
  })

  test("a claim carrying more citations than the cap is refused, because each one costs a SQL statement", () => {
    // The reproduction of the uncontrolled-cost defect: 5,000 citations on one claim is 5,000 queries
    // in `createCorpusVerifier`, and `@mizan/verify`'s cap of 3 runs after those queries have been
    // paid for. Measured against the real 27,234-record snapshot, 32 claims x 5,000 citations took
    // 26.9 s — inside the 30 s budget the verifier could not interrupt, because `deadlineExpired` is
    // only consulted downstream of resolution.
    const citations = Array.from({ length: MAX_CITATIONS_PER_CLAIM + 1 }, () => CITATION)
    const result = executeVerify(stubVerifier(), { claims: [{ claimId: "c-1", text: "t", citations }] }, 0, 30_000)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain(String(MAX_CITATIONS_PER_CLAIM))
  })

  test("a claim carrying exactly the cap is accepted, so the bound is a bound and not a rejection", () => {
    const citations = Array.from({ length: MAX_CITATIONS_PER_CLAIM }, () => CITATION)
    expect(executeVerify(stubVerifier(), { claims: [{ claimId: "c-1", text: "t", citations }] }, 0, 30_000).isError).toBeUndefined()
  })

  test("a claim with an empty citations array is refused rather than verified with no citation at all", () => {
    const decoded = decodeVerifyArgs({ claims: [{ claimId: "c", text: "t", citations: [] }] })
    if ("claims" in decoded) throw new Error("a claim with no citations was accepted")
    expect(decoded.error).toContain("at least one citation")
  })

  test("the per-call citation cap is derived from the two per-claim bounds, so the three cannot drift", () => {
    expect(MAX_CITATIONS_PER_CALL).toBe(MAX_CITATIONS_PER_CLAIM * MAX_CLAIMS_PER_CALL)
  })

  test("the citation cap equals the verifier's own, so the client is held to the number the verdict uses", () => {
    // `@mizan/verify` is the authority; this boundary mirrors it. If the two were allowed to differ,
    // a client could be told it had sent three citations while the verifier considered a different
    // number, and the verdict would silently depend on which layer answered first.
    expect(MAX_CITATIONS_PER_CLAIM).toBe(VERIFY_MAX_CITATIONS_PER_CLAIM)
  })

  test("a whole call at the citation cap is accepted, so the derived per-call cap is reachable", () => {
    const claims = Array.from({ length: MAX_CLAIMS_PER_CALL }, (_, i) => ({
      claimId: `c-${i}`,
      text: "t",
      citations: Array.from({ length: MAX_CITATIONS_PER_CLAIM }, () => CITATION),
    }))
    const decoded = decodeVerifyArgs({ claims })
    if ("error" in decoded) throw new Error(`a call at the documented cap was refused: ${decoded.error}`)
    expect(decoded.claims).toHaveLength(MAX_CLAIMS_PER_CALL)
  })

  test("an empty claims array is refused rather than answered with an empty verdict list", () => {
    expect(executeVerify(stubVerifier(), { claims: [] }, 0, 30_000).isError).toBe(true)
  })
})

/**
 * A verifier that throws is a refusal, not a transport failure.
 *
 * ## Why this block exists
 *
 * `createCorpusVerifier` is pre-flight gated: a missing, unattested or mismatched corpus is refused
 * before a client is answered, so those four tags were already covered and this path was not. A
 * `corpus.db` that is fine at startup and rotted by the third request raises `SQLITE_CORRUPT` from
 * inside `resolveCitations`, and that throw used to unwind `serve()` entirely — `main.ts` printed it
 * as `mcp transport failed` and exited 3. A *transport* label on a *corpus* fault, reported by the
 * one component that has no business diagnosing a corpus, on a session that one unreadable record
 * had no business ending (AGENTS.md section 16).
 *
 * ## What is asserted, and what deliberately is not
 *
 * Each test states one property: the throw is caught, the reason is `verifier_unavailable` rather
 * than `invalid_arguments`, the payload carries no verdict, and the session survives. None of them
 * asserts a specific wording of the driver's message, because a client pinned to this library's
 * error string would break on a Bun upgrade for no gain.
 */
describe("a verifier that throws is answered as a tool error, and the session survives", () => {
  const CORRUPT = "database disk image is malformed"

  test("the throw is contained, so the caller never sees an exception", () => {
    expect(() => executeVerify(throwingVerifier(CORRUPT), { claims: [claimArgs("c-1")] }, 0, 30_000)).not.toThrow()
  })

  test("the refusal is `verifier_unavailable`, because the call was well-formed and the fault is ours", () => {
    // The distinction that matters: `invalid_arguments` sends a client off to fix its own request,
    // which would be wrong advice. The verifier is what failed, and the reason has to say so.
    const result = executeVerify(throwingVerifier(CORRUPT), { claims: [claimArgs("c-1")] }, 0, 30_000)
    expect(result.isError).toBe(true)
    const parsed = readJson(result.content[0]!.text) as { error: { reason: string; detail: string } }
    expect(parsed.error.reason).toBe("verifier_unavailable")
    expect(parsed.error.detail).toContain(CORRUPT)
  })

  test("the refusal carries no verdict at all, so a client cannot read a failure as an answer", () => {
    const result = executeVerify(throwingVerifier(CORRUPT), { claims: [claimArgs("c-1")] }, 0, 30_000)
    expect(result.content[0]!.text).not.toContain("verified")
    expect(result.content[0]!.text).not.toContain("verdicts")
  })

  test("a throw that is not an `Error` is still contained, because a thrown value is untyped", () => {
    // `bun:sqlite` throws an `SQLiteError` today; nothing promises it will tomorrow, and a refusal
    // path that only handles `Error` is a refusal path with an unhandled branch in it.
    const throwing = (): Verifier => () => {
      throw "not an Error instance"
    }
    const result = executeVerify(throwing(), { claims: [claimArgs("c-1")] }, 0, 30_000)
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toContain("verifier_unavailable")
  })

  test("the next request is answered normally, because one bad record is not a reason to end the session", async () => {
    // The regression that made this worth a guard: the throw killed the whole loop, so a client that
    // retried got nothing at all and had to assume the server was gone.
    const written: string[] = []
    const verifyCall = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: callArgs([claimArgs("c-1")]) })
    const pingCall = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })
    const server = createServer(throwingVerifier(CORRUPT))
    const served = await serve({ chunks: chunksOf([`${verifyCall}\n`, `${pingCall}\n`]), write: (line) => written.push(line) }, server.dispatch)
    expect(served).toBe(2)
    expect(written).toHaveLength(2)
    expect(readJson(written[1]!).id).toBe(2)
  })
})

describe("decodeVerifyArgs — every refusal names the field, so a client can fix its call", () => {
  const cases: readonly { readonly label: string; readonly args: unknown; readonly named: string }[] = [
    { label: "not an object", args: "nope", named: "arguments" },
    { label: "claims absent", args: {}, named: "claims" },
    { label: "claims not an array", args: { claims: {} }, named: "claims" },
    { label: "claim not an object", args: { claims: ["x"] }, named: "each claim" },
    { label: "claimId missing", args: { claims: [{ text: "t", citations: [CITATION] }] }, named: "claimId" },
    { label: "text missing", args: { claims: [{ claimId: "c", citations: [CITATION] }] }, named: "text" },
    { label: "text not a string", args: { claims: [{ claimId: "c", text: 7, citations: [CITATION] }] }, named: "text" },
    { label: "quote not a string", args: { claims: [{ claimId: "c", text: "t", quote: 7, citations: [CITATION] }] }, named: "quote" },
    { label: "citations missing", args: { claims: [{ claimId: "c", text: "t" }] }, named: "citations" },
    { label: "citation not an object", args: { claims: [{ claimId: "c", text: "t", citations: ["x"] }] }, named: "citations" },
    { label: "collection missing", args: { claims: [{ claimId: "c", text: "t", citations: [{ number: "1", grade: null, raw: "r" }] }] }, named: "citations" },
    { label: "number wrong type", args: { claims: [{ claimId: "c", text: "t", citations: [{ collection: "t", number: 1, grade: null, raw: "r" }] }] }, named: "citations" },
    { label: "grade wrong type", args: { claims: [{ claimId: "c", text: "t", citations: [{ collection: "t", number: "1", grade: {}, raw: "r" }] }] }, named: "citations" },
    { label: "raw missing", args: { claims: [{ claimId: "c", text: "t", citations: [{ collection: "t", number: "1", grade: null }] }] }, named: "citations" },
    { label: "collection empty", args: { claims: [{ claimId: "c", text: "t", citations: [{ collection: "", number: "1", grade: null, raw: "r" }] }] }, named: "citations" },
  ]

  for (const { label, args, named } of cases) {
    test(`refuses ${label}, naming \`${named}\``, () => {
      const decoded = decodeVerifyArgs(args)
      if ("claims" in decoded) throw new Error(`refused case was accepted: ${label}`)
      expect(decoded.error).toContain(named)
    })
  }

  test("accepts a null number and grade, which is how a corpus with no grade is cited", () => {
    const decoded = decodeVerifyArgs({ claims: [{ claimId: "c", text: "t", citations: [{ collection: "t", number: null, grade: null, raw: "t:1" }] }] })
    if ("error" in decoded) throw new Error(`a legitimately nullable citation was refused: ${decoded.error}`)
    expect(decoded.claims[0]?.citations[0]?.number).toBeNull()
  })
})

describe("dispatch", () => {
  test("an unknown tool is refused, and the refusal names it", () => {
    const response = handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "write", arguments: {} } }, stubVerifier(), 0, 30_000)
    expect(response.error?.code).toBe(-32602)
    expect(response.error?.message).toContain("write")
  })

  test("a tools/call with no tool name is refused", () => {
    expect(handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { arguments: {} } }, stubVerifier(), 0, 30_000).error?.code).toBe(-32602)
  })

  test("an unknown method is refused with the method-not-found code", () => {
    const response = handleRequest({ jsonrpc: "2.0", id: 1, method: "resources/read" }, stubVerifier(), 0, 30_000)
    expect(response.error?.code).toBe(-32601)
    expect(response.error?.message).toContain("resources/read")
  })

  test("ping answers with an empty result", () => {
    expect(handleRequest({ jsonrpc: "2.0", id: 1, method: "ping" }, stubVerifier(), 0, 30_000).result).toEqual({})
  })

  test("the dispatcher answers a malformed line with a parse error rather than silence", () => {
    const response = JSON.parse(createDispatcher(stubVerifier())("{ not json")!) as { error: { code: number } }
    expect(response.error.code).toBe(-32700)
  })

  test("the dispatcher emits one JSON object per line, which is what a line-framed client needs", () => {
    const line = createDispatcher(stubVerifier())(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }))
    expect(line).not.toContain("\n")
    expect((JSON.parse(line!) as { id: number }).id).toBe(7)
  })
})

describe("read-only — the surface has no write path", () => {
  test("the only tool exposed is `verify`", () => {
    const names = TOOLS.map((tool) => tool.name)
    expect(names).toEqual(["verify"])
    for (const forbidden of ["write", "ingest", "delete", "append", "update", "modify"]) {
      expect(names).not.toContain(forbidden)
    }
  })

  test("no method that could mutate the corpus or the ledger is dispatched", () => {
    for (const method of ["tools/write", "corpus/ingest", "ledger/append", "resources/write"]) {
      expect(handleRequest({ jsonrpc: "2.0", id: 1, method }, stubVerifier(), 0, 30_000).error?.code).toBe(-32601)
    }
  })

  test("the server never opens the corpus itself — `openCorpusVerifier` is the only door, and it is read-only", () => {
    // Stated as a check on the module surface rather than on the filesystem: the server module
    // imports no database constructor at all, so there is no path from a request to a write.
    expect(handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: callArgs([claimArgs("c-1")]) }, stubVerifier(), 0, 30_000).error).toBeUndefined()
  })
})

describe("no corpus content in the response", () => {
  const withEvidence: Verifier = (input) =>
    input.claims.map((claim) => ({
      ...verdictFor(claim.id, "verified"),
      evidence: {
        recordId: "tirmidhi:1",
        collection: "tirmidhi",
        number: "1",
        sourceUrl: "https://example.org/secret-source",
        license: "secret-licence-string",
        attribution: "secret-attribution-string",
        grade: null,
        gradeSource: "dataset",
        gradeBasis: "collection",
        matchedChars: 5,
        quoteChars: 5,
      },
    }))

  test("evidence is dropped even when the verdict carries it", () => {
    const text = executeVerify(withEvidence, { claims: [claimArgs("c-1")] }, 0, 30_000).content[0]!.text
    expect(text).not.toContain("evidence")
    expect(text).not.toContain("example.org")
    expect(text).not.toContain("secret-licence-string")
    expect(text).not.toContain("secret-attribution-string")
  })

  test("the response carries the four published fields and nothing else", () => {
    const verdicts = verdictsOf(executeVerify(withEvidence, { claims: [claimArgs("c-1")] }, 0, 30_000))
    expect(Object.keys(verdicts[0]!).sort()).toEqual(["claimId", "matchStrength", "reason", "verdict"])
  })

  test("match strength travels whole, as the constrained `{ kind, percent }` pair", () => {
    const parsed = readJson(executeVerify(withEvidence, { claims: [claimArgs("c-1")] }, 0, 30_000).content[0]!.text) as {
      verdicts: readonly { matchStrength: { kind: string; percent: number } }[]
    }
    expect(parsed.verdicts[0]?.matchStrength).toEqual({ kind: "exact", percent: 100 })
  })

  test("a non-verified verdict's match strength is `{ kind: \"none\" }` with no percent", () => {
    const parsed = readJson(executeVerify(stubVerifier([], () => "unverifiable"), { claims: [claimArgs("c-1")] }, 0, 30_000).content[0]!.text) as {
      verdicts: readonly { matchStrength: Record<string, unknown> }[]
    }
    expect(parsed.verdicts[0]?.matchStrength).toEqual({ kind: "none" })
  })
})

describe("concurrent clients — each response is that client's", () => {
  /** Ten interleaved requests through one dispatcher, as a server handling ten clients would. */
  const interleave = (): JsonRpcResponse[] => {
    const dispatch = createDispatcher(stubVerifier())
    const requests = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, claimId: `client-${i}` }))
    const lines = requests.map((request) =>
      JSON.stringify({ jsonrpc: "2.0", id: request.id, method: "tools/call", params: callArgs([claimArgs(request.claimId)]) }),
    )
    // Interleave with a discovery call from an eleventh client, so the answers cannot be
    // positional: each response has to be matched to its request by id.
    const noisy = [...lines, JSON.stringify({ jsonrpc: "2.0", id: "tools", method: "tools/list" })]
    return noisy.map((line) => JSON.parse(dispatch(line)!) as JsonRpcResponse)
  }

  test("every one of ten simultaneous requests gets its own id back, and the eleventh call is answered too", () => {
    // Eleven lines in one burst: ten verification clients plus one discovery client. Matching each
    // answer to its request by id is what rules out a positional read of the responses.
    expect(interleave().map((response) => response.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "tools"])
  })

  test("no verdict is answered with another client's claim id", () => {
    const responses = interleave().filter((response) => response.id !== "tools")
    for (let i = 0; i < responses.length; i += 1) {
      expect(verdictsOf(resultOf(responses[i]!))[0]?.claimId).toBe(`client-${i}`)
    }
  })

  test("a failing request does not disturb its neighbours", () => {
    const dispatch = createDispatcher(stubVerifier())
    const good = JSON.parse(
      dispatch(JSON.stringify({ jsonrpc: "2.0", id: "a", method: "tools/call", params: callArgs([claimArgs("good")]) }))!,
    ) as JsonRpcResponse
    const bad = JSON.parse(
      dispatch(JSON.stringify({ jsonrpc: "2.0", id: "b", method: "tools/call", params: callArgs([{ claimId: "bad" }]) }))!,
    ) as JsonRpcResponse
    expect(verdictsOf(resultOf(good))[0]?.claimId).toBe("good")
    expect(resultOf(bad).isError).toBe(true)
  })

  test("no state leaks across requests: the same request twice gives the same answer", () => {
    const dispatch = createDispatcher(stubVerifier())
    const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: callArgs([claimArgs("c-1")]) })
    expect(dispatch(request)).toBe(dispatch(request))
  })
})

describe("transport framing", () => {
  const capturingPort = (chunks: readonly string[], written: string[]): Port => ({
    chunks: chunksOf(chunks),
    write: (line) => {
      written.push(line)
    },
  })

  test("several requests in one chunk are each answered, in order", async () => {
    const written: string[] = []
    const port = capturingPort(
      [`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`],
      written,
    )
    const served = await serve(port, createDispatcher(stubVerifier()))
    expect(served).toBe(2)
    expect(written.map((line) => (JSON.parse(line) as { id: number }).id)).toEqual([1, 2])
  })

  test("a request split across two chunks is answered once it is complete", async () => {
    const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })
    const written: string[] = []
    const served = await serve(capturingPort([request.slice(0, 10), `${request.slice(10)}\n`], written), createDispatcher(stubVerifier()))
    expect(served).toBe(1)
    expect(written).toHaveLength(1)
  })

  test("a client that disconnects mid-request gets no answer, because no complete request arrived", async () => {
    // The partial line is discarded rather than completed. Dispatching it would mean guessing
    // where the client meant to stop, and the guess is decided by whichever side closed first.
    const written: string[] = []
    const port = capturingPort(
      [`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n{"jsonrpc":"2.0","id":2,"met`],
      written,
    )
    const served = await serve(port, createDispatcher(stubVerifier()))
    expect(served).toBe(1)
    expect(written).toHaveLength(1)
    expect((JSON.parse(written[0]!) as { id: number }).id).toBe(1)
  })

  test("blank lines between requests are ignored, not answered", async () => {
    const written: string[] = []
    const port = capturingPort([`\n\n${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n   \n`], written)
    await serve(port, createDispatcher(stubVerifier()))
    expect(written).toHaveLength(1)
  })

  test("a CRLF-terminated request is answered, because the line is trimmed", async () => {
    const written: string[] = []
    const port = capturingPort([`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\r\n`], written)
    await serve(port, createDispatcher(stubVerifier()))
    expect(written).toHaveLength(1)
  })

  test("a malformed line among well-formed ones is answered with a parse error and does not stop the loop", async () => {
    const written: string[] = []
    const port = capturingPort([`not json\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`], written)
    await serve(port, createDispatcher(stubVerifier()))
    expect(written).toHaveLength(2)
    expect((JSON.parse(written[0]!) as { error: { code: number } }).error.code).toBe(-32700)
    expect((JSON.parse(written[1]!) as { id: number }).id).toBe(2)
  })

  test("an empty stream serves nothing and closes cleanly", async () => {
    const written: string[] = []
    const served = await serve(capturingPort([], written), createDispatcher(stubVerifier()))
    expect(served).toBe(0)
    expect(written).toHaveLength(0)
  })

  test("ten interleaved clients over one transport each get their own answer", async () => {
    const written: string[] = []
    const lines = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: callArgs([claimArgs(`client-${i}`)]) }),
    )
    // One chunk per request, in one burst: the framing loop sees ten clients arrive together.
    const served = await serve(capturingPort(lines.map((line) => `${line}\n`), written), createDispatcher(stubVerifier()))
    expect(served).toBe(10)
    expect(
      written.map((line) => verdictsOf(resultOf(JSON.parse(line) as JsonRpcResponse))[0]?.claimId),
    ).toEqual(Array.from({ length: 10 }, (_, i) => `client-${i}`))
  })

  test("a client disconnect ends the loop and leaves the server not running", async () => {
    const server = createServer(stubVerifier())
    const served = await server.start(capturingPort([`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`], []))
    expect(served).toBe(1)
    expect(server.isRunning).toBe(false)
  })
})

/**
 * `stop()` — the regression: a flag the loop ignores stops nothing.
 *
 * The first version set `running = false` and returned. The loop never read the flag, so the server
 * kept answering requests from a caller that believed it had been shut down: measured, it served 4
 * requests when stopped and 16 more in the 150 ms after the stop. Silence after a stop is the
 * property that matters, and only an interrupted read produces it.
 */
describe("stop interrupts the read, so a stopped server goes quiet", () => {
  const ping = (id: number): string => `${JSON.stringify({ jsonrpc: "2.0", id, method: "ping" })}\n`

  /**
   * A port that keeps offering lines and only stops when cancelled.
   *
   * The generator parks on a promise between the two requests, which is the condition a real client
   * creates by being idle: the loop has nothing to dispatch and is waiting on the next read. Only
   * `cancel` can end that wait.
   */
  const idlePort = (written: string[]): Port => {
    let open: (() => void) | null = null
    const chunks = (async function* (): AsyncGenerator<string> {
      yield ping(1)
      await new Promise<void>((resolve) => {
        open = resolve
      })
      yield ping(2)
    })()
    return {
      chunks,
      write: (line) => {
        written.push(line)
      },
      cancel: () => {
        open?.()
      },
    }
  }

  test("stop returns, and nothing is served after it", async () => {
    const written: string[] = []
    const server = createServer(stubVerifier())
    const running = server.start(idlePort(written))
    await until(() => written.length === 1)
    server.stop()
    const served = await within(running, 2_000)
    expect(served).toBe(1)
    expect(written).toHaveLength(1)
    expect(server.isRunning).toBe(false)
  })

  test("awaiting start is how a caller learns the port is closed", async () => {
    // Without the interrupted read this never settles, which is the failure mode being guarded: a
    // caller that awaits `start()` to confirm shutdown would wait forever on a stop that did nothing.
    const server = createServer(stubVerifier())
    const running = server.start(idlePort([]))
    server.stop()
    await within(running, 2_000)
    expect(server.isRunning).toBe(false)
  })

  test("a stop before the first request stops the loop without answering anything", async () => {
    const server = createServer(stubVerifier())
    const running = server.start(idlePort([]))
    server.stop()
    expect(await within(running, 2_000)).toBe(0)
    expect(server.isRunning).toBe(false)
  })

  test("isRunning reports the loop, so it is true until the loop actually returns", async () => {
    // The flag is the LOOP's state, not the stop request's. Reporting `false` the instant `stop()`
    // is called would claim the port is closed while it is still open.
    const written: string[] = []
    const server = createServer(stubVerifier())
    const running = server.start(idlePort(written))
    await until(() => written.length === 1)
    server.stop()
    await within(running, 2_000)
    expect(server.isRunning).toBe(false)
  })
})

describe("an over-long request line is refused, and the session survives it", () => {
  test("a line with no terminator is refused once, and never grows without bound", async () => {
    // The regression this block exists for: `pending += chunk` with no ceiling, so a client that
    // never sends a newline grew the buffer until the process died. It grew to ~97 MB on a 96 MB
    // send and the loop was still running, with nothing written back to the client.
    const written: string[] = []
    const refusals: string[] = []
    const chunks = (async function* (): AsyncGenerator<string> {
      // One megabyte at a time, so the accumulation is exercised rather than a single huge chunk.
      for (let sent = 0; sent < MAX_LINE_CODE_UNITS + 1_048_576; sent += 1_048_576) yield "x".repeat(1_048_576)
    })()
    const served = await serve({ chunks, write: (line) => written.push(line) }, createDispatcher(stubVerifier()), {
      refuse: (message) => {
        refusals.push(message)
        return `refused: ${message}`
      },
    })
    expect(served).toBe(0)
    expect(refusals).toHaveLength(1)
    expect(refusals[0]).toContain(String(MAX_LINE_CODE_UNITS))
    expect(written).toEqual(["refused: " + refusals[0]])
  })

  test("the tail of the refused line is discarded, and the next request is still answered", async () => {
    // Resuming matters: a host that mis-measured one request is not disconnected for it. The tail is
    // DROPPED rather than buffered, because buffering it would put the buffer back on the same
    // unbounded path one chunk at a time.
    const written: string[] = []
    const overflow = "y".repeat(MAX_LINE_CODE_UNITS + 10)
    const next = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" })
    const chunks = (async function* (): AsyncGenerator<string> {
      yield overflow
      yield "tail-of-the-refused-line"
      yield `\n${next}\n`
    })()
    const served = await serve({ chunks, write: (line) => written.push(line) }, createDispatcher(stubVerifier()), {
      refuse: (message) => `refused: ${message}`,
    })
    expect(served).toBe(1)
    expect(written).toHaveLength(2)
    expect((JSON.parse(written[1]!) as { id: number }).id).toBe(7)
  })

  test("a request below the cap is never refused, because the cap is above the protocol's own ceiling", async () => {
    // The cap has to reconcile two bounds, and only the upper one is visible in a test: a line the
    // protocol permits must not be refused for framing. This asserts the relation rather than
    // building a 4 MB request, because the relation is what the constant is derived from.
    const escapedClaim = "\\u".repeat(5_000)
    const legalWorstCase = 32 * (escapedClaim.length + escapedClaim.length + 128 + 3 * 768)
    expect(MAX_LINE_CODE_UNITS).toBeGreaterThan(legalWorstCase)
  })

  test("the server's own refusal is a JSON-RPC invalid-request envelope, not raw text", async () => {
    // The protocol layer owns the wire format, so the transport takes the renderer as an argument
    // rather than importing `errorResponse` — that would close an import cycle between the two.
    const written: string[] = []
    const server = createServer(stubVerifier())
    const overflow = "z".repeat(MAX_LINE_CODE_UNITS + 1)
    await within(server.start({ chunks: chunksOf([overflow]), write: (line) => written.push(line) }), 20_000)
    expect(written).toHaveLength(1)
    const envelope = JSON.parse(written[0]!) as { id: null; error: { code: number; message: string } }
    expect(envelope.id).toBeNull()
    expect(envelope.error.code).toBe(-32600)
    expect(envelope.error.message).toContain(String(MAX_LINE_CODE_UNITS))
  })

  test("the refusal names the unit it measured, because the two are not the same size", async () => {
    // The constant was called `MAX_LINE_BYTES` while the measurement is `pending.length`, which
    // counts UTF-16 code units. A client sizing a request against a byte figure is wrong by up to 3x
    // in either direction: an Arabic request of 2.8M code units is 8.4M UTF-8 bytes, so "under
    // 8MiB" and "accepted" are not the same statement. This asserts the message states the unit
    // that is actually measured, so the name and the refusal cannot drift apart again.
    const written: string[] = []
    const server = createServer(stubVerifier())
    const overflow = "z".repeat(MAX_LINE_CODE_UNITS + 1)
    await within(server.start({ chunks: chunksOf([overflow]), write: (line) => written.push(line) }), 20_000)
    const envelope = JSON.parse(written[0]!) as { error: { message: string } }
    expect(envelope.error.message).toContain("UTF-16 code units")
    expect(envelope.error.message).not.toContain(" bytes")
  })
})

/**
 * The framing loop survives a dispatcher that throws.
 *
 * ## Why this is a second guard rather than a duplicate
 *
 * `executeVerify` catches a throwing verifier and names it `verifier_unavailable`, so nothing in the
 * production path reaches the guard tested here. This one exists for the throw nobody anticipated:
 * a defect anywhere else under `dispatch` used to unwind `serve()`, and `main.ts` reported it as
 * `mcp transport failed` with exit 3 — which is a transport label on an unknown fault, from a process
 * whose only job is framing.
 *
 * The tests below therefore drive `serve` with a dispatcher that throws directly, not with a
 * throwing verifier. Using the real path here would assert the `executeVerify` guard twice and leave
 * the framing guard untested.
 */
describe("a dispatcher that throws is contained by the framing loop", () => {
  test("the throw does not unwind serve, so the loop returns a served count instead of a rejection", async () => {
    // The exact defect: `port.write(dispatch(trimmed))` with no `try`/`catch` anywhere in the file.
    const written: string[] = []
    const throwing = (): string => {
      throw new Error("database disk image is malformed")
    }
    const chunks = chunksOf([`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`])
    const served = await serve({ chunks, write: (line) => written.push(line) }, throwing, {
      refuse: (message) => `refused: ${message}`,
    })
    expect(served).toBe(1)
    expect(written[0]).toContain("database disk image is malformed")
  })

  test("the refusal counts as served, because the client now has a line to match the request against", async () => {
    // `served` is documented as the number a client can match responses against. Counting a thrown
    // request as unanswered would leave that id pending forever, which is the same hang as no reply.
    let attempted = 0
    const throwing = (): string => {
      attempted += 1
      throw new Error("boom")
    }
    const chunks = chunksOf([`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`])
    const served = await serve({ chunks, write: () => undefined }, throwing, { refuse: (message) => message })
    expect(attempted).toBe(1)
    expect(served).toBe(1)
  })

  test("a throw on one request does not stop the next one being answered", async () => {
    const written: string[] = []
    // The stub answers id 2 with a real envelope built by `JSON.stringify`, not a hand-escaped
    // literal, so the test asserts the loop's behaviour and not my quoting.
    const next = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })
    const dispatch = (line: string): string => {
      if (line.includes("\"id\":1")) throw new Error("boom")
      return next
    }
    const chunks = chunksOf([
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`,
      `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`,
    ])
    const served = await serve({ chunks, write: (line) => written.push(line) }, dispatch, { refuse: (message) => `refused: ${message}` })
    expect(served).toBe(2)
    expect(written).toHaveLength(2)
  })

  test("a throw with no `refuse` renderer still yields a line, because the fallback is the identity", async () => {
    // `serve` is exported and usable without the server wiring, so the default renderer has to be
    // safe on its own: a refusal nobody can format is not a refusal.
    const written: string[] = []
    const throwing = (): string => {
      throw new Error("boom")
    }
    const chunks = chunksOf([`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`])
    const served = await serve({ chunks, write: (line) => written.push(line) }, throwing)
    expect(served).toBe(1)
    expect(written[0]).toContain("boom")
  })

  test("an end-to-end throw surfaces as a JSON-RPC envelope, so a client reads a refusal rather than a dead pipe", async () => {
    const written: string[] = []
    const server = createServer(stubVerifier())
    // `server.dispatch` answers `ping` without touching the verifier, so the throw is injected
    // through a wrapper — the only way to exercise the guard from the protocol layer's side.
    const guarded = (line: string): string => {
      if (line.includes("tools/call")) throw new Error("database disk image is malformed")
      return server.dispatch(line) ?? ""
    }
    const call = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: callArgs([claimArgs("c-1")]) })
    const ping = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })
    const chunks = chunksOf([`${call}\n`, `${ping}\n`])
    const served = await serve({ chunks, write: (line) => written.push(line) }, guarded, framing(() => false))
    expect(served).toBe(2)
    expect(written).toHaveLength(2)
    const envelope = JSON.parse(written[0]!) as { id: null; error: { code: number; message: string } }
    expect(envelope.error.code).toBe(-32600)
    expect(envelope.error.message).toContain("database disk image is malformed")
    expect(readJson(written[1]!).id).toBe(2)
  })
})

/**
 * A real file that exists, is readable, and is emphatically not a SQLite database.
 *
 * In a fresh temp directory, deliberately NOT at a repository-relative path. The test used to pass
 * `"package.json"`, which resolves against whatever working directory the runner happened to have:
 * it asserted on a file that existed only by coincidence of where it was launched from, and
 * `bun test` in this package would have disagreed with a root-level run about whether it was testing
 * anything at all.
 */
const notADatabase = (): string => {
  const corpusPath = join(mkdtempSync(join(tmpdir(), "mizan-mcp-scratch-")), "not-a-snapshot.db")
  writeFileSync(corpusPath, "this is not a SQLite file\n", "utf8")
  return corpusPath
}

/**
 * Open a planted snapshot and return the refusal, disposing the temp directory either way.
 *
 * Every assertion in the refusal block wants the same shape — "the gate refused, and here is its
 * tag" — and every one of them would otherwise have to repeat the throw-on-success line and forget
 * to clean up. A temp directory left behind by a passing test is the kind of litter that makes the
 * next run fail for an unrelated reason.
 */
const refuseOn = (snapshot: PlantedSnapshot, attestationPath: string, message: string): CorpusProblem => {
  const opened = openCorpusVerifier({ corpusPath: snapshot.corpusPath, attestationPath })
  if (!("error" in opened)) {
    snapshot.dispose()
    throw new Error(message)
  }
  snapshot.dispose()
  return opened.error
}

describe("openCorpusVerifier — fail closed before any client is answered", () => {
  test("a missing corpus is refused, and the refusal names the path", () => {
    const opened = openCorpusVerifier({ corpusPath: "does/not/exist/corpus.db", attestationPath: "does/not/exist/attestation.json" })
    if (!("error" in opened)) throw new Error("a missing corpus produced a verifier")
    expect(opened.error._tag).toBe("corpus_missing")
    expect(describeCorpusProblem(opened.error)).toContain("does/not/exist/corpus.db")
  })

  test("a file that exists but is not a database is refused as unusable rather than as missing", () => {
    // A real file that exists, is readable, and is not a SQLite database, in a fresh temp directory.
    // The path used to be the relative string `"package.json"`, which resolves against whatever
    // working directory the runner happened to have: the test asserted on a file that existed only
    // by coincidence of where it was launched from, and `bun test` in this package would have
    // disagreed with `bun test` from the root about whether it was testing anything at all.
    //
    // The path check and the read must report DIFFERENT problems, because an operator fixes them
    // differently: a missing corpus means "never ingested", an unusable one means "ingested
    // something that is not a snapshot". A harness that collapses the two sends the operator to
    // re-run an ingest that would produce the same file.
    const opened = openCorpusVerifier({ corpusPath: notADatabase(), attestationPath: "does/not/exist/attestation.json" })
    if (!("error" in opened)) throw new Error("a non-database produced a verifier")
    expect(opened.error._tag).toBe("corpus_unusable")
  })

  test("a missing corpus file is reported as missing, not as unusable", () => {
    const opened = openCorpusVerifier({ corpusPath: "does/not/exist/corpus.db", attestationPath: "does/not/exist/attestation.json" })
    if (!("error" in opened)) throw new Error("a missing path produced a verifier")
    expect(opened.error._tag).toBe("corpus_missing")
  })

  test("a missing attestation is named as an unreadable attestation, not as a missing corpus", () => {
    const snapshot = plantedSnapshot()
    const opened = refuseOn(snapshot, snapshot.absentAttestationPath, "a verifier was served without an attestation")
    // The corpus is right there. What is absent is the statement of WHICH corpus it is, and that
    // has the opposite fix: re-ingesting the corpus you already have produces the same file.
    expect(opened._tag).toBe("attestation_unreadable")
    expect(describeCorpusProblem(opened)).toContain("attestation.json")
  })

  test("an attestation describing a different corpus is a mismatch, and no verifier is served", () => {
    const snapshot = plantedSnapshot({ snapshotHash: "b".repeat(64) })
    const opened = refuseOn(snapshot, snapshot.attestationPath, "a mismatched attestation produced a verifier")
    expect(opened._tag).toBe("attestation_mismatch")
    expect(describeCorpusProblem(opened)).toContain("snapshotHash")
  })

  test("an attestation whose record count disagrees is refused too, naming the count", () => {
    const snapshot = plantedSnapshot({ recordCount: 2 })
    const opened = refuseOn(snapshot, snapshot.attestationPath, "a mismatched record count produced a verifier")
    expect(opened._tag).toBe("attestation_mismatch")
    expect(describeCorpusProblem(opened)).toContain("recordCount")
  })

  test("an attested snapshot serves a verifier that verifies against it", () => {
    const snapshot = plantedSnapshot()
    const opened = openCorpusVerifier({ corpusPath: snapshot.corpusPath, attestationPath: snapshot.attestationPath })
    if ("error" in opened) {
      snapshot.dispose()
      throw new Error(`a matching attestation was refused: ${opened.error.detail}`)
    }
    const open = opened.value
    try {
      expect(open.identity).toEqual(snapshot.identity)
      expect(open.verifier({ claims: [plantedClaim()] }).map((verdict) => verdict.verdict)).toEqual(["verified"])
      // The handle is read-only, so the strongest available statement that the tool does not write
      // is that a write through it fails rather than succeeding.
      expect(() => open.db.run("DELETE FROM records")).toThrow()
    } finally {
      open.db.close()
      snapshot.dispose()
    }
  })

  test("an unattested corpus cannot be made to serve by pointing the attestation somewhere else", () => {
    // The failure mode this guards: a client that cannot find `attestation.json` next to the corpus
    // and tries a path that exists. An unrelated JSON file must not satisfy the gate.
    const snapshot = plantedSnapshot()
    const opened = refuseOn(snapshot, "package.json", "an unrelated JSON file satisfied the attestation gate")
    expect(opened._tag).toBe("attestation_unreadable")
  })

  test("every refusal message names its own tag, so an operator can branch without reading English", () => {
    const problems: CorpusProblem[] = [
      { _tag: "corpus_missing", detail: "x" },
      { _tag: "corpus_unusable", detail: "y" },
      { _tag: "attestation_unreadable", detail: "z" },
      { _tag: "attestation_mismatch", detail: "w" },
    ]
    for (const problem of problems) {
      expect(describeCorpusProblem(problem)).toContain(problem._tag)
    }
  })

  test("a refusal never reads as a verdict: there is no `verdict` field anywhere in the message", () => {
    for (const problem of [
      { _tag: "corpus_missing", detail: "x" },
      { _tag: "attestation_mismatch", detail: "y" },
    ] as const) {
      expect(describeCorpusProblem(problem)).not.toContain("verified")
    }
  })

  test("a missing corpus tells the operator the one command that fixes it", () => {
    expect(describeCorpusProblem({ _tag: "corpus_missing", detail: "x" })).toContain("bun run ingest")
  })
})