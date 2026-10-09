import { afterEach, describe, expect, test } from "bun:test"
import { articleCountsOf, isErr, isOk, type ArticleChunkResponse } from "@mizan/core"
import { executeVerifyDocument, MAX_SPANS_PER_CHUNK, openCorpusVerifier, type Verifier } from "@mizan/mcp"
import { corpusIsPresent, releaseScratchCorpora, repositoryBenchmarkPaths } from "./benchmark-test-paths.ts"
import { laneOf } from "./ci-lanes.ts"
import { HARNESS_DOCUMENTS, posix } from "./article-harness.ts"

/**
 * The snapshot-backed half of the article determinism harness — the `ci:corpus` lane.
 *
 * ## Why this is not in the default lane
 *
 * `data/corpus.db` is gitignored and absent from a clean clone, and `bun run ci` is a step
 * `accept:customer` declares corpus-independent. The corpus-free half —
 * `scripts/article-determinism.test.ts` — is what the default lane runs; this file measures the same
 * properties with a corpus actually present, and is therefore in the lane whose reason says so.
 *
 * The corpus is opened through the SAME factory the MCP server uses, so this measures the verifier the
 * product serves rather than a hand-built one. `createCorpusVerifier` fails closed before any client is
 * answered, which is what makes "the corpus is absent" a named refusal rather than a fabricated zero.
 *
 * ## What this adds that the corpus-free half cannot
 *
 * With a corpus, a span whose quote IS a record can reach `verified` — so the byte-identical claim is
 * made about a report that carries a real verdict, and the `falseVerifiedDelta` assertion is made
 * against verdicts the verifier actually computed rather than against `no_citation`. That is the half of
 * the claim that says the report is reproducible over real evidence, not only over honest zeroes.
 *
 * ## Why an absent corpus is a SKIP here and not a failure
 *
 * `bun test` collects this file by glob from a clean clone even though `bun run ci` does not, and a
 * file that throws on a missing `data/corpus.db` reports a green repository as red for a reason that has
 * nothing to do with the code under test. A skip states the opposite of a fabricated zero: *we could not
 * look*, printed with its reason, next to the lane entry that says why. It is the degradation the
 * specification asks for (`no sources found`, never `0 fabrications`), applied to the harness itself.
 *
 * The probe is one `existsSync`, and it is asserted against the opener below, because a probe that said
 * "absent" while the corpus was openable would skip this lane forever and nobody would notice: the one
 * shape that is worse than a failure is a lane that has quietly stopped measuring anything.
 */

afterEach(releaseScratchCorpora)

/** The committed corpus's own paths. Resolved once so the probe and the opener cannot disagree. */
const CORPUS_PATHS = repositoryBenchmarkPaths()

/**
 * Whether `data/corpus.db` is on disk. One filesystem check, read once at module load.
 *
 * The declaration lives in `benchmark-test-paths.ts` because `scripts/benchmark.corpus.test.ts` gates
 * on the same question, and two spellings of "do we have the corpus" is two answers to one (AGENTS.md
 * section 17). Its doc comment carries the reason the probe is `existsSync` and not the opener: the
 * probe may only decide a SKIP, and the unskipped agreement test below is what turns a present-but-
 * unreadable corpus into a failure instead of a green lane.
 */
const NEEDS_CORPUS = corpusIsPresent()
if (!NEEDS_CORPUS) {
  console.warn(
    "[article-determinism.corpus] data/corpus.db is absent — the snapshot-backed tests are SKIPPED. " +
      "Run `bun run ingest` (or `bun run ci:corpus`) to measure them.",
  )
}

/**
 * The committed corpus, opened the way the server opens it.
 *
 * `openCorpusVerifier` rather than `new Database(...)`, because the attestation gate is part of what
 * is under test: a corpus on disk that does not match `attestation.json` must REFUSE, and a harness
 * that opened the file directly would measure against a corpus the product would not serve.
 *
 * The handle is cached because every chunk needs it and each open is a file lock; `afterEach` closes it
 * so a stale handle cannot outlive the suite. It still FAILS CLOSED rather than returning a stub: the
 * `skipIf` has already handled the absent case, so reaching this line without a corpus means the corpus
 * vanished mid-run, and a stub verifier there would measure a fake report.
 */
let opened: { readonly verifier: Verifier; readonly db: { close: () => void } } | null = null

const corpusVerifier = (): Verifier => {
  if (opened !== null) return opened.verifier
  const result = openCorpusVerifier({ corpusPath: CORPUS_PATHS.corpusPath, attestationPath: CORPUS_PATHS.attestationPath })
  if (isErr(result)) {
    throw new Error(`this test needs ${CORPUS_PATHS.corpusPath} and its attestation: ${result.error.detail}. Run \`bun run ingest\` first — this is the corpus lane.`)
  }
  opened = { verifier: result.value.verifier, db: result.value.db }
  return result.value.verifier
}

afterEach(() => {
  opened?.db.close()
  opened = null
})

/** One chunk of `document`, at `cursor`. The clock arguments mirror the server's own request budget. */
const chunkOf = (document: string, cursor: string | null = null, chunkSpans: number | null = null): ArticleChunkResponse => {
  const outcome = executeVerifyDocument(corpusVerifier(), { document, cursor, chunkSpans }, 0, 30_000)
  if (!("response" in outcome)) throw new Error(`expected a response, got ${JSON.stringify(outcome)}`)
  return outcome.response
}

/** This file's path relative to the repository root, in the spelling `ci-lanes.ts` keys the table by. */
const SELF = (): string => `scripts/${posix(import.meta.path).split("/").pop() ?? ""}`

/** Drive a whole run by following the cursors, which is the resume path a client takes. */
const runAll = (document: string, chunkSpans: number): readonly ArticleChunkResponse[] => {
  const chunks: ArticleChunkResponse[] = []
  let cursor: string | null = null
  for (let step = 0; step < 512; step += 1) {
    const response = chunkOf(document, cursor, chunkSpans)
    chunks.push(response)
    if (response.cursor === null) return chunks
    cursor = response.cursor
  }
  throw new Error("the run never finished, so the cursor contract is broken against a real corpus")
}

/** Everything a report is made of, as one comparable string. */
const assembled = (chunks: readonly ArticleChunkResponse[]): string =>
  JSON.stringify({
    segmentCount: chunks[0]?.segmentCount ?? 0,
    outcomes: chunks.flatMap((chunk) => chunk.outcomes),
    gaps: chunks.flatMap((chunk) => chunk.gaps),
    counts: articleCountsOf(chunks[0]?.segmentCount ?? 0, chunks.flatMap((chunk) => chunk.outcomes)),
  })

describe("with a corpus present", () => {
  test("this file is in the corpus lane, with the reason stated", () => {
    // The lane table is the only thing keeping this file out of the default run, and a file that drifted
    // back into it would fail every clean clone with a corpus error dressed as a test failure.
    //
    // `posix` BEFORE the split, because a Windows path carries no `/` to split on: taking the last
    // segment first would return the whole absolute path, prefix `scripts/` onto it, and look up a lane
    // entry that cannot exist — which fails identically on every platform and so reads as a lane table
    // problem rather than a path-spelling one. This is the defect `ci-lanes.test.ts` exists to catch,
    // and it is the same one `benchmark.corpus.test.ts` had already solved.
    expect(laneOf(SELF())?.id).toBe("corpus")
    expect(laneOf(SELF())?.reason).toContain("data/corpus.db")
  })

  test("the probe and the opener agree, so a skip never hides a corpus that is really there", () => {
    // The one failure shape worse than a red lane: a lane that has quietly stopped measuring. If the
    // `existsSync` probe disagreed with `openCorpusVerifier`, every assertion below would skip on a
    // checkout that HAS the corpus and the suite would report green forever without running.
    const probe = corpusIsPresent()
    const result = openCorpusVerifier({ corpusPath: CORPUS_PATHS.corpusPath, attestationPath: CORPUS_PATHS.attestationPath })
    expect(probe).toBe(isOk(result))
    if (isOk(result)) result.value.db.close()
  })

  test.skipIf(!NEEDS_CORPUS)("ten runs of the whole document are byte-identical, verdicts included", () => {
    for (const fixture of HARNESS_DOCUMENTS) {
      const first = assembled(runAll(fixture.document, MAX_SPANS_PER_CHUNK))
      for (let run = 1; run < 10; run += 1) {
        expect(assembled(runAll(fixture.document, MAX_SPANS_PER_CHUNK))).toBe(first)
      }
    }
  })

  test.skipIf(!NEEDS_CORPUS)("no fabricated span is verified, and the failure names the case", () => {
    // The corpus-free lane asserts the same property over `no_citation`; this asserts it over real
    // evidence, which is where a false `verified` would actually be reachable.
    for (const fixture of HARNESS_DOCUMENTS) {
      const chunks = runAll(fixture.document, MAX_SPANS_PER_CHUNK)
      const outcomes = chunks.flatMap((chunk) => chunk.outcomes)
      const verified = outcomes.filter((outcome) => outcome.summary.verdict === "verified")
      expect({ id: fixture.id, verified: verified.length }).toEqual({ id: fixture.id, verified: 0 })
    }
  })

  test.skipIf(!NEEDS_CORPUS)("a resumed run is byte-identical to an uninterrupted one, against the same corpus", () => {
    for (const fixture of HARNESS_DOCUMENTS) {
      expect(assembled(runAll(fixture.document, 3))).toBe(assembled(runAll(fixture.document, MAX_SPANS_PER_CHUNK)))
    }
  })

  test.skipIf(!NEEDS_CORPUS)("a chunk carries at most the published span cap, so its citation volume stays bounded", () => {
    for (const fixture of HARNESS_DOCUMENTS) {
      for (const chunk of runAll(fixture.document, 1_000)) {
        expect(chunk.counts.segments).toBeLessThanOrEqual(MAX_SPANS_PER_CHUNK)
      }
    }
  })
})
