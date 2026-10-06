import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { decodeCondition } from "@mizan/core"
import { conditionOfCorpusProblem, describeCorpusProblem, openCorpusVerifier, type CorpusProblem } from "../src/verifier.ts"

/**
 * The MCP server on a checkout with no corpus — Story 7's "a clean clone exits with a typed reason".
 *
 * ## What is being asserted
 *
 * That every `CorpusProblem` tag projects onto a **word from the shared vocabulary**, so a client
 * comparing an MCP call with a CLI run is told the same reason for the same absence. Before this,
 * `CorpusProblem` carried four tags of its own and `describeCorpusProblem` wrote its own sentences —
 * and two of the four (`corpus_unusable`, `attestation_unreadable`) had no honest name in the shared
 * set, so the obvious projection would have reported a corpus that is present and corrupt as a
 * corpus that is absent. The vocabulary grew the two names instead, and this file is what proves the
 * projection is total. A fifth tag, `verifier_faulted`, was added when the catch-all in `server.ts`
 * stopped claiming a corpus diagnosis it could not establish; it projects onto `unverifiable`, and
 * the tests below assert that projection is distinct from `corpus_unusable`, so the two words cannot
 * be merged back into one name later by someone tidying the map.
 *
 * ## Why this server starts without a corpus, and what is therefore load-bearing
 *
 * `main.ts` serves a session even when there is no corpus, and every `tools/call` in that session is
 * refused with `isError: true` and the shared condition as its `reason`. That is a deliberate change
 * from refusing to start, and the reason it is safe is that `refusingVerifier` never reaches the
 * verifier: it reads no corpus, calls no `verifyAnswer`, and has no path that can produce a
 * `ClaimVerdict`. The property that matters is therefore not "the server exits", it is
 * **`verified` is unreachable on a clean clone** — which the round-trip test below asserts on the
 * wire, and which `scripts/acceptance/surface-state.ts` asserts from the outside.
 *
 * What the change buys is the only thing an MCP client can act on. A process that died before its
 * first byte says "no response", which is indistinguishable from a spawn failure, a wrong command,
 * or a crashed toolchain; none of those carry the word `corpus_absent`. The protocol is how a client
 * learns anything at all, so the refusal moved *into* the protocol rather than being replaced by it.
 * Refusing at the process boundary and refusing at the request boundary are the same verdict —
 * none — and only one of them can be read by the thing that has to branch on it.
 *
 * The reason is still said on stderr, once, at startup, unprompted: an operator reading the console
 * is not a JSON-RPC client and should not have to be one.
 */

const TAGS: readonly CorpusProblem["_tag"][] = [
  "corpus_missing",
  "corpus_unusable",
  "verifier_faulted",
  "attestation_unreadable",
  "attestation_mismatch",
]

const problem = (tag: CorpusProblem["_tag"]): CorpusProblem => ({ _tag: tag, detail: "detail for the test" })

describe("the MCP server's own vocabulary", () => {
  test("every tag projects onto the shared vocabulary, so no client is told an unnamed state", () => {
    // The planted violation fails: a tag added to `CorpusProblem` with no entry in the projection
    // table returns `null`, and `apps/cli/test/clean-clone.test.ts` asserts the CLI's states the same
    // way — so one surface cannot grow a word the other has never heard of.
    for (const tag of TAGS) {
      const condition = conditionOfCorpusProblem(problem(tag))
      expect(condition).not.toBeNull()
      if (condition === null) continue
      expect(decodeCondition(condition).ok).toBe(true)
    }
  })

  test("the missing and unusable corpora are different words, because they are different remedies", () => {
    // The projection this module used to refuse to make. `corpus_missing` is "run ingest on a clone
    // that has none"; `corpus_unusable` is "the file is there and broken". One word for both sends an
    // integrator to check whether they cloned the repository.
    expect(conditionOfCorpusProblem(problem("corpus_missing"))).toBe("corpus_absent")
    expect(conditionOfCorpusProblem(problem("corpus_unusable"))).toBe("corpus_unusable")
    expect(conditionOfCorpusProblem(problem("attestation_unreadable"))).toBe("attestation_unreadable")
    expect(conditionOfCorpusProblem(problem("attestation_mismatch"))).toBe("attestation_mismatch")
  })

  test("a verifier fault projects onto `unverifiable` and NOT onto `corpus_unusable`", () => {
    // The second half of the same argument, for the tag the catch-all produces. Projecting it onto
    // `corpus_unusable` would tell a client the corpus file cannot be opened and send an operator to
    // re-ingest — the wrong remedy when the fault is downstream of the query, and a claim the catch
    // has no evidence for. `unverifiable` is what the product can honestly say either way.
    expect(conditionOfCorpusProblem(problem("verifier_faulted"))).toBe("unverifiable")
    expect(conditionOfCorpusProblem(problem("verifier_faulted"))).not.toBe("corpus_unusable")
    expect(describeCorpusProblem(problem("verifier_faulted"))).toContain("verifier_faulted:")
  })

  test("the refusal message carries the shared sentence, so the two surfaces read alike", () => {
    // `detail` names a role and a driver message, never corpus text (AGENTS.md section 13), so
    // appending it after the shared sentence leaks nothing the sentence does not already say. Any
    // absolute path it does carry is stripped on the way to the wire — asserted in `server.test.ts`,
    // where the redaction is tested as a property rather than through one refusal.
    const described = describeCorpusProblem(problem("corpus_missing"))
    expect(described).toContain("corpus_missing:")
    expect(described).toContain("corpus_absent:")
    expect(described).toContain("no verdict was computed")
  })
})

describe("the MCP server on a checkout with no corpus", () => {
  test("the planted violation fails: a missing corpus is refused with the shared word", async () => {
    // `openCorpusVerifier` is called directly rather than through `main`, so the refusal is observed
    // as a value — which is what a server that could not start actually has. The spawned half is the
    // next test, because the exit code is only observable across a process boundary.
    const root = mkdtempSync(join(tmpdir(), "mizan-clean-clone-mcp-"))
    try {
      const opened = openCorpusVerifier({
        corpusPath: join(root, "corpus.db"),
        attestationPath: join(root, "attestation.json"),
      })
      expect(opened.ok).toBe(false)
      if (opened.ok) return
      expect(opened.error._tag).toBe("corpus_missing")
      expect(conditionOfCorpusProblem(opened.error)).toBe("corpus_absent")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("a corpus that is present but unreadable is refused as `corpus_unusable`", () => {
    // `bun:sqlite` opens lazily, so a text file opens without complaint and fails on the identity
    // read. That is a corpus that is present and broken, and it must not be reported as absent.
    const root = mkdtempSync(join(tmpdir(), "mizan-clean-clone-mcp-"))
    try {
      const corpusPath = join(root, "corpus.db")
      writeFileSync(corpusPath, "this is not a SQLite file\n", "utf8")
      const opened = openCorpusVerifier({ corpusPath, attestationPath: join(root, "attestation.json") })
      expect(opened.ok).toBe(false)
      if (opened.ok) return
      expect(opened.error._tag).toBe("corpus_unusable")
      expect(conditionOfCorpusProblem(opened.error)).toBe("corpus_unusable")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("the process starts and answers a `tools/call` round-trip with the condition named", async () => {
    // The literal Story 7 acceptance criterion, observed the way a client observes it: a spawned
    // process, real stdin, real stdout. `MIZAN_CORPUS_PATH` and `MIZAN_ATTESTATION_PATH` are already
    // the documented overrides, so pointing them at a directory with neither is a clean-clone
    // condition reached without moving the committed corpus.
    const root = mkdtempSync(join(tmpdir(), "mizan-clean-clone-mcp-"))
    try {
      const written = [request(1, "initialize"), request(2, "tools/list"), request(3, "tools/call", callArgs([claimArgs("c-1")]))].join("")

      const spawned = await spawnServer(root, written)
      expect(spawned.code).toBe(0)

      const responses = spawned.stdout.trim().split("\n").map((line) => readJson(line, spawned.stderr))
      expect(responses).toHaveLength(3)
      expect(responses.map((response) => response["id"])).toEqual([1, 2, 3])

      // `initialize` and `tools/list` are answered normally: a client that can see the tool exists can
      // also see that every call to it refuses. Refusing those too would only make the client guess.
      expect(responses[0]?.["result"]).toBeDefined()
      expect(responses[1]?.["result"]).toBeDefined()

      const result = responses[2]?.["result"]
      if (typeof result !== "object" || result === null) throw new Error("the refusal carried no result object")
      // `isError` is what a client branches on, so it is asserted on the narrowed object rather than
      // through a cast: a wire frame that carried the condition but forgot the flag would otherwise pass.
      expect((result as { readonly isError?: unknown }).isError).toBe(true)
      const content = (result as { readonly content?: unknown }).content
      if (!Array.isArray(content)) throw new Error("the refusal carried no content array")
      const first = content[0] as { readonly text?: unknown } | undefined
      if (typeof first?.text !== "string") throw new Error("the refusal carried no text block to read")
      const payload = readJson(first.text, spawned.stderr)
      const error = payload["error"] as { readonly reason?: unknown; readonly detail?: unknown }
      expect(error.reason).toBe("corpus_absent")
      expect(String(error.detail)).toContain("corpus_absent:")

      // The operator's copy of the same reason, said once, without being asked for it.
      expect(spawned.stderr).toContain("corpus_absent")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  test("no verdict is written anywhere on a refusal, so a client cannot read the answer as a result", async () => {
    // The load-bearing negative claim, and the one a reviewer should check before believing any of the
    // rest: the server is up, the round-trip completed, and the word `verified` is not on the wire.
    const root = mkdtempSync(join(tmpdir(), "mizan-clean-clone-mcp-"))
    try {
      const spawned = await spawnServer(root, request(1, "tools/call", callArgs([claimArgs("c-1")])))
      expect(spawned.stdout).toContain("corpus_absent")
      expect(spawned.stdout).not.toContain("verified")
      expect(spawned.stdout).not.toContain("verdicts")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  test("a malformed call is still `invalid_arguments`, so the condition is not a catch-all", async () => {
    // The distinction that keeps the previous test honest. A degraded verifier that answered
    // `corpus_absent` to *everything* would pass it, and would also tell a client to go and fix a
    // request that was fine. The refusal has to be the last word, not the only word.
    const root = mkdtempSync(join(tmpdir(), "mizan-clean-clone-mcp-"))
    try {
      const malformed = request(1, "tools/call", callArgs([{ claimId: "c-1", text: "t", citations: [] }]))
      const spawned = await spawnServer(root, malformed)
      expect(spawned.stdout).toContain("invalid_arguments")
      expect(spawned.stdout).not.toContain("corpus_absent")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 60_000)

  test("readJson refuses what the old cast would have typed, and reports the child's stderr", () => {
    // The planted violations for `readJson` itself. Both are the line this helper used to be:
    //
    //   * a JSON array or a bare string, which `as Record<string, unknown>` typed as an object and
    //     which would then have failed three assertions later as `undefined` on a property — the
    //     failure would have pointed at the test rather than at the wire;
    //   * a line that is not JSON at all, where the old error named the line and discarded the one
    //     piece of output that explains it. `corpus_absent` below is the child's own refusal notice,
    //     so an assertion that the message carries it is asserting the diagnosis survives.
    expect(() => readJson("[1,2,3]", "corpus_absent: no corpus")).toThrow(/expected a JSON object/)
    expect(() => readJson('"corpus_absent"', "corpus_absent: no corpus")).toThrow(/expected a JSON object/)
    expect(() => readJson("not json at all", "corpus_absent: no corpus")).toThrow(/corpus_absent: no corpus/)
    // The line itself is quoted too, because "the child said X" is not actionable without "it sent Y".
    expect(() => readJson("not json at all", "corpus_absent: no corpus")).toThrow(/"not json at all"/)
    // And the happy path still narrows, rather than passing the parsed value through unexamined.
    expect(readJson('{"id":1}', "")).toEqual({ id: 1 })
  })
})

/**
 * Narrow one line of the child's stdout to a JSON object, or throw something a reader can act on.
 *
 * ## Why the child's stderr is a required argument
 *
 * This helper used to be `JSON.parse(text) as Record<string, unknown>`, and the two defects in that
 * line compound. The cast asserts a shape nothing checked, so a child that answered `[1,2,3]` or
 * `"corpus_absent"` was typed as an object and the failure surfaced three assertions later as
 * `undefined` on a property — pointing at the test rather than at the wire. And a parse failure threw
 * `Unexpected token`, a message that says the *line* was malformed while saying nothing about the
 * other half of the output: the reason the child emitted that line instead of a JSON-RPC frame is
 * almost always on its stderr, which was collected a few lines above and then dropped on the floor.
 *
 * So the two are coupled here rather than at each call site. `stderr` is a parameter because the caller
 * is the only one holding it, and making it optional would have preserved the defect rather than fixed
 * it.
 *
 * ## Why a guard rather than a declared schema
 *
 * There is no wire schema to decode through: `JsonRpcResponse` in `server.ts` is a hand-written type,
 * and this file deliberately asserts the *shape a client sees* rather than the one the server believes
 * it is — asserting the server's own type here would be circular, since it would pass whatever the
 * server sent. So the honest narrowing is `unknown` plus an explicit object guard (AGENTS.md section 2),
 * which at minimum refuses the shapes that made the old cast a lie.
 */
const readJson = (text: string, stderr: string): Record<string, unknown> => {
  const parsed = parseLine(text, stderr)
  if (!isJsonObject(parsed)) {
    throw new Error(`expected a JSON object from the MCP server, got ${JSON.stringify(parsed)}; the child said:\n${stderr}`)
  }
  return parsed
}

const parseLine = (text: string, stderr: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    const because = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`the MCP server wrote a line that is not JSON (${because}); the line was ${JSON.stringify(text)} and the child said:\n${stderr}`)
  }
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A citation that satisfies the tool's own schema, so a refusal here can only be about the corpus. */
const CITATION = { collection: "tirmidhi", number: "1", grade: null, raw: "tirmidhi:1" } as const

const claimArgs = (id: string): unknown => ({ claimId: id, text: `prose for ${id}`, quote: "quote", citations: [CITATION] })

const callArgs = (claims: readonly unknown[]): unknown => ({ name: "verify", arguments: { claims } })

const request = (id: number, method: string, params?: unknown): string =>
  `${JSON.stringify(params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params })}\n`

/**
 * Spawn the real entry point against an empty root, write `stdin` to it, and close stdin.
 *
 * Closing stdin is how the session ends, and it is what makes the exit code meaningful: the server
 * cannot exit 0 for having refused everything if it never got to a clean close. Asserting on the
 * child's output rather than calling `main()` in-process is deliberate — `main()` reads
 * `process.stdin`, so calling it in a test runner would hang the suite rather than test it.
 */
const spawnServer = async (root: string, stdin: string): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(import.meta.dir, "..", "src", "main.ts")], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        MIZAN_CORPUS_PATH: join(root, "corpus.db"),
        MIZAN_ATTESTATION_PATH: join(root, "attestation.json"),
      },
    })
    let out = ""
    let err = ""
    child.stdout?.on("data", (chunk: Buffer | string) => {
      out += typeof chunk === "string" ? chunk : chunk.toString()
    })
    child.stderr?.on("data", (chunk: Buffer | string) => {
      err += typeof chunk === "string" ? chunk : chunk.toString()
    })
    child.on("close", (closed) => resolve({ code: closed ?? 0, stdout: out, stderr: err }))
    child.stdin?.end(stdin, "utf8")
  })
