import { isErr } from "@mizan/core"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { repositoryPaths, type BenchmarkPaths } from "./benchmark.ts"

/**
 * The temp-corpus bookkeeping every benchmark test file needs, in one place — plus the one corpus
 * probe they share (see `corpusIsPresent`).
 *
 * ## Why this is shared rather than duplicated
 *
 * Two test files, one convention. Both build scratch corpora and both must remove every one of
 * them, and the failure this prevents is specific: a `scratch: string[]` written twice means the
 * array and its `afterEach` can drift, and a scratch directory that outlives its test is a
 * directory a later run measures instead of the fixture it meant to.
 *
 * ## Why `evalDir` points at the committed sets
 *
 * The degradation cases measure a scratch *corpus* against the committed *fixtures*, because the
 * fault under test is the corpus and the suites are hermetic. Pointing `evalDir` at a temp
 * directory instead would make every degradation case report the eval sets as broken too, and the
 * fault under test would be indistinguishable from a missing fixture.
 *
 * ## Why the name is this one
 *
 * A module named `benchmark-scratch.ts` reads as a leftover from an experiment, and in a repository
 * whose claim is reproducibility an uncommitted-looking file beside committed ones invites exactly the
 * question it should not need asking. `test-paths` says what it is: the paths both benchmark test files
 * resolve.
 */

/** Directories created by `scratchBenchmarkPaths`, removed by `releaseScratchCorpora`. */
const scratch: string[] = []

/** The repository's own paths. A helper throw is the one place `throw` is allowed (AGENTS.md section 2). */
export const repositoryBenchmarkPaths = (): BenchmarkPaths => {
  const found = repositoryPaths()
  if (isErr(found)) throw new Error(`the test could not locate the repository root: ${found.error}`)
  return found.value
}

/** A paths record inside a fresh temp directory. `corpusPath` is not created — a case may create it. */
export const scratchBenchmarkPaths = (): BenchmarkPaths => {
  const dir = mkdtempSync(join(tmpdir(), "mizan-benchmark-"))
  scratch.push(dir)
  return {
    corpusPath: join(dir, "corpus.db"),
    attestationPath: join(dir, "attestation.json"),
    evalDir: repositoryBenchmarkPaths().evalDir,
    outPath: join(dir, "report", "benchmark-report.json"),
  }
}

/** Remove every scratch directory made so far. Wired to `afterEach` by each test file. */
export const releaseScratchCorpora = (): void => {
  while (scratch.length > 0) {
    rmSync(scratch.pop()!, { recursive: true, force: true })
  }
}

/**
 * Whether the committed snapshot is on disk. One declaration, because both corpus-lane files gate on
 * it and two spellings of "do we have the corpus" is two answers to one question (AGENTS.md 17).
 *
 * `existsSync` and deliberately NOT `openCorpus`, and the asymmetry is the point. `bun:sqlite` opens a
 * file lazily, so `existsSync` is satisfied by a file that is not a database — which means this
 * probe cannot tell "absent" from "corrupt", and the caller must not treat its two answers as one.
 * So this answers only the question a *skip* is allowed to be built on ("is there nothing here to
 * measure?"), and each corpus file pairs it with a separate, unskipped assertion that the probe
 * agrees with the opener. A corpus that is present but unreadable therefore FAILS loudly, where a
 * probe built on the opener would have skipped the lane silently and reported green forever.
 */
export const corpusIsPresent = (): boolean => existsSync(repositoryBenchmarkPaths().corpusPath)

export * as BenchmarkTestPaths from "./benchmark-test-paths.ts"
