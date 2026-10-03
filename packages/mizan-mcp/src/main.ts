import { join, resolve } from "node:path"
import { isErr } from "@mizan/core"
import { createServer } from "./server.ts"
import { describeCorpusProblem, openCorpusVerifier } from "./verifier.ts"

/**
 * MCP server entry point.
 *
 * ## Why the corpus is opened before stdio is touched
 *
 * A server that answers with a verdict while its corpus is missing, or while the corpus does not
 * match the committed attestation, is a server whose every answer is unearned. So the corpus is
 * opened and attested FIRST, and a refusal exits before a single JSON-RPC line is read. The client
 * sees a process that died with a named reason on stderr rather than a well-formed response that
 * means nothing.
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
 * - 0 — stdin closed cleanly (the client disconnected)
 * - 2 — the corpus is absent, unreadable, or not the one `attestation.json` authorises
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

export const main = async (): Promise<number> => {
  const opened = openCorpusVerifier({ corpusPath: defaultCorpusPath(), attestationPath: defaultAttestationPath() })
  if (isErr(opened)) {
    console.error(`mcp server cannot serve: ${describeCorpusProblem(opened.error)}`)
    return 2
  }

  const { verifier, db } = opened.value
  const server = createServer(verifier)
  try {
    await server.start()
    return 0
  } catch (cause) {
    console.error(`mcp transport failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 3
  } finally {
    db.close()
  }
}

if (import.meta.main) {
  process.exit(await main())
}