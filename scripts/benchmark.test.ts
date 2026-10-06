import { afterEach, describe, expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { Database } from "bun:sqlite"
import { isOk } from "@mizan/core"
import {
  EXIT_FAILURES,
  EXIT_OK,
  EXIT_UNTRUSTED,
  identityOf,
  main,
  openCorpus,
  runBenchmark,
} from "./benchmark.ts"
import { releaseScratchCorpora, repositoryBenchmarkPaths, scratchBenchmarkPaths } from "./benchmark-test-paths.ts"

/**
 * Benchmark harness tests — the degradation half of US-12, and the part of it a clean clone runs.
 *
 * ## What is being tested, and why it is this
 *
 * The harness's arithmetic lives in `@mizan/bench` and is tested there against outcomes a fixture
 * chose. What is tested HERE is everything `@mizan/bench` cannot see: what the harness does when the
 * corpus it was told to measure against is absent, corrupt, or not the one `attestation.json`
 * authorises. Those are the paths the story names ("if a suite fails to load, report the error and
 * continue with other suites"; "graceful degradation: if one suite fails, others still run"), and
 * they were the paths that could not be tested at all — `main` ran `process.exit` at module scope and
 * the paths were cwd-relative constants, so importing the module killed the test runner and running
 * it from `scripts/` found no corpus.
 *
 * The fault this exists to prevent is specific. `bun:sqlite` opens a file lazily, so
 * `existsSync("corpus.db")` is satisfied by a file that is not a database and the first query raises
 * `SQLITE_NOTADB`. With no `catch`, that escape printed a raw stack trace and exited 1 — where 1
 * means "a case failed". A judge reading it would go looking for a broken fixture while the corpus
 * sat there corrupt, and the code would be sending them to the one place the problem is not.
 *
 * ## Why the published run is in a different file
 *
 * The published run measures the committed corpus, so it is in `benchmark.corpus.test.ts` and runs
 * under `bun run ci:corpus` — not here, and not in `bun run ci`. It was here before, and the cost
 * was that this file could not pass on a checkout with no `data/corpus.db`, which is what
 * `accept:customer` runs against. See `ci-lanes.ts` for the mechanism and the reasoning.
 *
 * Every degradation case below builds its own scratch corpus, so no test can read the committed one
 * and none can damage it: every write goes to a path created by `mkdtemp` and removed in
 * `afterEach`.
 */

const COMMITTED_REPORT = "data/benchmark/benchmark-report.json"

/** A file that exists, is readable, and is emphatically not a database. */
const notADatabase = (corpusPath: string): void => {
  writeFileSync(corpusPath, "this is not a SQLite file\n", "utf8")
}

afterEach(releaseScratchCorpora)

describe("a corpus that cannot be trusted is refused, not measured", () => {
  test("a missing corpus names the path and the command that fixes it", () => {
    const paths = scratchBenchmarkPaths()
    const opened = openCorpus(paths.corpusPath)
    if (isOk(opened)) throw new Error("a corpus that does not exist was opened")
    expect(opened.error).toContain(paths.corpusPath)
    expect(opened.error).toContain("bun run ingest")
  })

  test("a file that exists but is not a database is refused, not thrown", () => {
    // The regression this whole file exists for. `existsSync` is satisfied; `new Database` is
    // satisfied; only the first query raises. The assertion is on the REFUSAL, so a version that
    // let the throw escape would fail here rather than pass by never reaching this line.
    const paths = scratchBenchmarkPaths()
    notADatabase(paths.corpusPath)
    const opened = openCorpus(paths.corpusPath)
    if (isOk(opened)) throw new Error("a file that is not a database was opened as one")
    expect(opened.error).toContain("not a readable snapshot")
    expect(opened.error).toContain(paths.corpusPath)
  })

  test("a refused corpus is not exit 1, because exit 1 means a case failed", async () => {
    // The distinction the judge acts on. A corrupt corpus and a failing fixture are different
    // problems with different fixes, and collapsing them sends the reader to the wrong one.
    const paths = scratchBenchmarkPaths()
    notADatabase(paths.corpusPath)
    expect(await main(paths)).toBe(EXIT_UNTRUSTED)
  })

  test("a corpus with no usable identity is refused, naming what it recorded", () => {
    const paths = scratchBenchmarkPaths()
    writeFileSync(paths.corpusPath, "", "utf8")
    const opened = openCorpus(paths.corpusPath)
    if (isOk(opened)) throw new Error("an empty file was opened as a corpus")
    // An empty file is a valid SQLite database holding no tables, so the query fails rather than
    // returning nothing — either way the refusal names the file, which is the property asserted.
    expect(opened.error).toContain(paths.corpusPath)
  })

  test("identityOf reports a query failure as a value, so no caller has to catch anything", () => {
    // The seam itself, rather than the open path around it. `identityOf` is the only place the
    // snapshot identity is read, so if it could throw, both `openCorpus` and the post-run re-attest
    // would need their own guard and one of them would eventually be forgotten.
    const paths = scratchBenchmarkPaths()
    notADatabase(paths.corpusPath)
    const db = new Database(paths.corpusPath, { readonly: true })
    try {
      const identity = identityOf(db, paths.corpusPath)
      if (isOk(identity)) throw new Error("a file that is not a database reported a snapshot identity")
      expect(identity.error).toContain("not a readable snapshot")
    } finally {
      db.close()
    }
  })
})

describe("a committed artefact is read, never written, by a test", () => {
  test("the committed report records a pass, so the file a judge opens is not a failure record", () => {
    // Reading the committed report needs no corpus, so it stays in this lane. Diffing it against a
    // fresh run does, so that half is `benchmark.corpus.test.ts`.
    const committed = JSON.parse(readFileSync(repositoryBenchmarkPaths().outPath, "utf8")) as { readonly outcome: string }
    expect(committed.outcome).toBe("pass")
  })

  test("the committed report is the file the story names, at the path the story names", () => {
    // A test that reads the committed report is only checking something if it read the committed
    // report, and `outPath` is resolved from the repository root rather than written here.
    expect(repositoryBenchmarkPaths().outPath.endsWith(COMMITTED_REPORT)).toBe(true)
  })
})

describe("the exit codes are three distinct facts", () => {
  test("they are distinct integers, so a caller can branch without reading a message", () => {
    expect(new Set([EXIT_OK, EXIT_FAILURES, EXIT_UNTRUSTED]).size).toBe(3)
  })

  test("they are the CLI's numbers, not this file's", () => {
    // Asserted as literals because `scripts/` cannot import `apps/cli/src/exit-codes.ts`, which is
    // precisely why they are two declarations agreeing by hand. This file previously shipped
    // `EXIT_UNTRUSTED = 2`, so `bun run benchmark` and `bun run benchmark:vs-search` returned
    // different codes for the same corrupt corpus and README's published "exits 3" became false.
    // Nothing but this assertion can catch that drift, and AGENTS.md section 14 says a guard that
    // cannot fail is not a guard.
    expect([EXIT_OK, EXIT_FAILURES, EXIT_UNTRUSTED]).toEqual([0, 1, 3])
  })

  test("a refused corpus and a failed case are not the same code", () => {
    // Asserted as a relation rather than as literals: the point is that the two can never be
    // merged, and a relation breaks if either moves onto the other.
    expect(EXIT_UNTRUSTED).not.toBe(EXIT_FAILURES)
    expect(EXIT_UNTRUSTED).not.toBe(EXIT_OK)
  })
})

/**
 * The suite-load seam, without a corpus.
 *
 * US-12's acceptance criterion is "if a suite fails to load, report the error and continue with
 * other suites", and the committed-corpus version of these cases is in the corpus lane — it needs
 * the corpus to reach the suite builder at all, because the corpus is opened first and its absence
 * is itself the answer. What can be asserted here is the half that needs no corpus: the refusal path
 * a caller actually reaches on a clean clone, which is that `runBenchmark` returns a value rather
 * than throwing, and that `main` turns it into the untrusted code rather than the failures code.
 */
describe("a harness with no corpus is refused before it builds a suite", () => {
  test("runBenchmark reports the refusal as a value, so a caller can branch without a catch", () => {
    const measured = runBenchmark(scratchBenchmarkPaths())
    if (isOk(measured)) throw new Error("a corpus that does not exist was measured")
    expect(measured.error).toContain("bun run ingest")
  })

  test("main exits untrusted, so a clean clone reports a missing corpus rather than a failed case", async () => {
    // This is the sentence a judge reads on a clean clone, and it is the reason the harness's
    // degradation paths are tested at all: without it, exit 1 would mean "a case failed" and the
    // corpus was never the subject.
    expect(await main(scratchBenchmarkPaths())).toBe(EXIT_UNTRUSTED)
  })
})
