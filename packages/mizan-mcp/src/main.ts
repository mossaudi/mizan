import { join, resolve } from "node:path"
import { isErr } from "@mizan/core"
import { createServer } from "./server.ts"
import { describeCorpusProblem, openCorpusVerifier, refusingVerifier, type Verifier } from "./verifier.ts"

/**
 * MCP server entry point.
 *
 * ## Why a missing corpus still starts a server
 *
 * A server that answers with a verdict while its corpus is missing is a server whose every answer is
 * unearned, and that part has not changed: `refusingVerifier` computes nothing and returns no verdict,
 * so `verified` is unreachable when there is no corpus. What changed is where the refusal is *said*.
 *
 * It used to be said by exiting, before a single JSON-RPC line was read, because a process that died at
 * startup cannot be mistaken for one that is serving. But an MCP client cannot distinguish that from a
 * server that failed to start for any other reason: both are "no response", and neither carries the word
 * `corpus_absent`. Story 7 asks for a completed `tools/call` round-trip carrying the degradation
 * condition, so an integrator can branch on it — which requires the transport, because the protocol is
 * how a client learns anything at all.
 *
 * So the refusal moved inside the protocol rather than being replaced by it. `initialize` and
 * `tools/list` are answered normally, because a client that can see which tools exist can also see that
 * every one of them refuses; `tools/call` answers `isError: true` with the shared condition as its
 * machine-readable `reason` and no verdict anywhere in the payload. The operator still gets the reason on
 * stderr at startup, once, unprompted.
 *
 * ## Paths
 *
 * Overridable through the environment so the same build serves a corpus at another location
 * without a code change. There is no default of convenience that reads a database the operator
 * did not name: `MIZAN_CORPUS_PATH` and `MIZAN_ATTESTATION_PATH` both have to resolve, and the
 * attestation has to agree with what is on disk.
 *
 * The defaults are resolved from this file's own location, so the server behaves the same from any
 * working directory — `bun run mcp` from the repository root, `bun run --filter @mizan/mcp start`
 * from anywhere, and a client that spawns the binary with `cwd` set to its own install directory.
 * A default resolved from `process.cwd()` is a server that reads whatever corpus happens to sit
 * beside the caller's shell, which is a *different* corpus on a developer's machine and on a judge's.
 *
 * ## Exit codes
 *
 * - 0 — stdin closed cleanly (the client disconnected), whether the session served verdicts or refusals
 * - 2 — unused; kept out of the list because nothing exits on a corpus problem any more
 * - 3 — the transport failed
 *
 * ## Why `main` is guarded, and why the resolvers are exported
 *
 * `process.exit(await main())` at module scope is why no test could ever import this file: importing
 * it started a server and killed the test runner. Guarding on `import.meta.main` — the same guard
 * `scripts/benchmark.ts` uses, and the same reason it exports its paths resolver — is what makes the
 * path resolution below testable at all. The test asserts the resolved default against committed
 * files at the root, which is the only way to catch a miscounted `..`.
 */
export const REPOSITORY_ROOT = resolve(import.meta.dir, "..", "..", "..")

/** The corpus to serve, from the environment when named and from this checkout otherwise. */
export const defaultCorpusPath = (): string => process.env["MIZAN_CORPUS_PATH"] ?? join(REPOSITORY_ROOT, "data", "corpus.db")

/** The attestation that must authorise `defaultCorpusPath`, by the same rule. */
export const defaultAttestationPath = (): string =>
  process.env["MIZAN_ATTESTATION_PATH"] ?? join(REPOSITORY_ROOT, "attestation.json")

/**
 * Serve one session on stdio, closing whatever the session owned.
 *
 * One function for both the corpus-backed and the refusing server, because the only thing that differs is
 * the `Verifier` and whether there is a handle to close — and a second copy of the transport's exit code
 * would be a second thing to get wrong.
 */
const serveSession = async (verifier: Verifier, release: () => void): Promise<number> => {
  const server = createServer(verifier)
  try {
    await server.start()
    return 0
  } catch (cause) {
    console.error(`mcp transport failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 3
  } finally {
    release()
  }
}

export const main = async (): Promise<number> => {
  const corpusPath = defaultCorpusPath()
  const attestationPath = defaultAttestationPath()
  const opened = openCorpusVerifier({ corpusPath, attestationPath })
  if (isErr(opened)) {
    console.error(`mcp server cannot serve: ${describeCorpusProblem(opened.error)}`)
    // The refusal text an MCP client receives has every absolute path stripped from it, because a
    // client is a different trust domain from the operator. stderr is not: it is the one surface the
    // operator alone reads, and a filesystem layout is the first thing they need. So the two paths
    // are named here, once, in full, and nowhere else.
    console.error(`mcp server looked for the corpus at: ${corpusPath}`)
    console.error(`mcp server looked for the attestation at: ${attestationPath}`)
    return serveSession(refusingVerifier(opened.error), () => undefined)
  }
  return serveSession(opened.value.verifier, () => opened.value.db.close())
}

if (import.meta.main) {
  process.exit(await main())
}