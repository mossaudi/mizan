import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Database } from "bun:sqlite"
import { isErr, isOk } from "@mizan/core"
import { resolveCitations } from "@mizan/corpus"
import { renderReport } from "@mizan/bench"
import { RED_TEAM_FIXTURES } from "@mizan/verify"
import {
  EXIT_FAILURES,
  EXIT_OK,
  EXIT_UNTRUSTED,
  identityOf,
  main,
  openCorpus,
  repositoryPaths,
  runBenchmark,
  type BenchmarkPaths,
} from "./benchmark.ts"

/**
 * Benchmark harness tests — the degradation half of US-12.
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
* ## The real corpus is used for the happy path, and only for it
 *
 * `runBenchmark(REPO_PATHS())` is the published run and it must pass, because a benchmark whose own
 * correctness test is skipped is a benchmark that reports a green tick for nothing. The degradation
 * cases build a scratch corpus in a temp directory, so no test can damage the committed one — every
 * write goes to a path created by `mkdtemp` and removed in `afterEach`.
 *
 * ## No test writes the committed report
 *
 * Four tests here used to measure the published run with `REPO_PATHS()`, which writes
 * `data/benchmark/benchmark-report.json` on the way. That made `bun test` rewrite a committed
 * artefact, so `git status` was dirty after a test run — which tells a reader that something in the
 * run *changed* the answer rather than checking it — and it hid the fact that nothing anywhere
 * compared the committed report with a fresh one. Every test now measures into `measureIntoScratch()`,
 * and the committed artefact is read and diffed rather than written. A committed report nothing
 * diffs against is a claim, not a record.
 *
 * ## The red-team fixtures are checked against the real corpus
 *
 * `describe("the red-team fixtures exercise the corpus they claim to")` is here for the same
 * reason. A red-team case whose identifier the snapshot does not hold passes by measuring an
 * identifier refusal, whatever its name suggests. That is not hypothetical: 11 of the 14 fixtures
 * cited `bukhari`/`muslim` collections this corpus does not ship, so the suite read 14/14 while its
 * containment arm never ran once. Only a test that opens the corpus can catch that, which is why it
 * is here and not in `packages/mizan-verify/test`, where the snapshot is deliberately never opened.
 */

/** The committed report's path, relative to the repository root. Read by tests; written by none. */
const COMMITTED_REPORT = "data/benchmark/benchmark-report.json"

const scratch: string[] = []

/** The repository's own paths. A helper throw is the one place `throw` is allowed (AGENTS.md §2). */
const REPO_PATHS = (): BenchmarkPaths => {
  const found = repositoryPaths()
  if (isErr(found)) throw new Error(`the test could not locate the repository root: ${found.error}`)
  return found.value
}

/** A paths record inside a fresh temp directory. `corpusPath` is not created — a case may create it. */
const scratchPaths = (): BenchmarkPaths => {
  const dir = mkdtempSync(join(tmpdir(), "mizan-benchmark-"))
  scratch.push(dir)
  return {
    corpusPath: join(dir, "corpus.db"),
    attestationPath: join(dir, "attestation.json"),
    // The committed eval sets, read from the repository: the suites are hermetic and must keep
    // measuring the 240 committed cases even when the corpus under test is a scratch stub. Pointing
    // this at a temp directory instead would make every degradation case below report the eval sets
    // as broken too, and the fault under test would be indistinguishable from a missing fixture.
    evalDir: REPO_PATHS().evalDir,
    outPath: join(dir, "report", "benchmark-report.json"),
  }
}

/** A file that exists, is readable, and is emphatically not a database. */
const notADatabase = (corpusPath: string): void => {
  writeFileSync(corpusPath, "this is not a SQLite file\n", "utf8")
}

/**
 * The committed corpus and attestation, with the report written to scratch.
 *
 * This is what "measure the published fixture set without touching its published artefact" means.
 * The inputs are the committed ones, because a benchmark run against a scratch corpus would be
 * measuring nothing real; the output is not, because that is the file a judge reads and a test run
 * has no business editing it.
 */
const measureIntoScratch = (): BenchmarkPaths => ({ ...REPO_PATHS(), outPath: scratchPaths().outPath })

afterEach(() => {
  while (scratch.length > 0) {
    rmSync(scratch.pop()!, { recursive: true, force: true })
  }
})

describe("the published run", () => {
  /** 3 live golden + 200 committed golden + 40 committed fabrications + 14 HALLMARK. The roll-up is derived. */
  const PUBLISHED_CASES = 257

  test("the repository corpus is measured, and every case agrees with its expectation", () => {
    // The one assertion that would catch a harness that passes because it measured nothing. It reads
    // the committed corpus, so this test and `bun run benchmark` cannot disagree about the fixture
    // set, and writes to scratch, so neither can leave the committed report looking like it changed.
    const measured = runBenchmark(measureIntoScratch())
    if (isErr(measured)) throw new Error(`the published run failed: ${measured.error}`)
    expect(measured.value.outcome).toBe("pass")
    expect(measured.value.counts.totalCases).toBe(PUBLISHED_CASES)
    expect(measured.value.counts.passedCases).toBe(PUBLISHED_CASES)
    expect(measured.value.counts.falseVerdicts).toBe(0)
  })

  test("every committed eval set is a suite of this harness, which is what README claims", () => {
    // US-12's first acceptance criterion names all three. Before this, `bun run benchmark` measured 17
    // of the 240 committed cases while README published "every eval set through one harness", and the
    // other 223 were only reachable through `bun test apps/cli`. Naming the suites is what makes the
    // published sentence checkable, and the counts come from the sets' own `cases` arrays so a suite
    // that silently dropped cases could not pass.
    const measured = runBenchmark(measureIntoScratch())
    if (isErr(measured)) throw new Error(`the published run failed: ${measured.error}`)
    const byName = new Map(measured.value.suites.map((suite) => [suite.name, suite]))
    expect([...byName.keys()]).toEqual(["golden-live", "golden-eval", "redteam-eval", "hallmark-red-team", "hallmark"])
    for (const [name, count] of [
      ["golden-live", 3],
      ["golden-eval", 200],
      ["redteam-eval", 40],
      ["hallmark-red-team", 14],
    ] as const) {
      expect(byName.get(name)?.metrics.counts.totalCases).toBe(count)
    }
    // The roll-up must stay out of the totals, or 14 cases are counted twice and the headline total
    // is a number no fixture set contains.
    expect(byName.get("hallmark")?.derivedFrom).toBe("hallmark-red-team")
    expect(measured.value.counts.totalCases).toBe(PUBLISHED_CASES)
  })

  test("the committed fabrications are held to the published bar, and the bar is visible in the report", () => {
    // The report has to be honest about WHICH bar each case was held to. A `redteam-eval` suite whose
    // 40 rows all read like exact matches would be a claim this repository cannot make, so the mode is
    // asserted on the rows AND printed by `renderReport`.
    const measured = runBenchmark(measureIntoScratch())
    if (isErr(measured)) throw new Error(`the published run failed: ${measured.error}`)
    const redTeam = measured.value.suites.find((suite) => suite.name === "redteam-eval")
    expect(redTeam?.cases.every((entry) => entry.scoredBy === "never_verified")).toBe(true)
    expect(redTeam?.cases.every((entry) => entry.expectedVerdict === "rejected")).toBe(true)
    // And they still did not verify: the mode relaxes which verdict is acceptable, never whether a
    // fabrication was accepted.
    expect(redTeam?.cases.every((entry) => entry.verdict !== "verified")).toBe(true)
    const goldenEval = measured.value.suites.find((suite) => suite.name === "golden-eval")
    expect(goldenEval?.cases.every((entry) => entry.scoredBy === "exact")).toBe(true)
    expect(renderReport(measured.value)).toContain("[scored: never_verified]")
  })

  test("the eval-set suites report no SSR, because they ship no generated sentences", () => {
    // An `EvalCase` has a `note` and no answer prose. Using the note as prose would have put SSR at
    // 47% on a suite scoring 200/200 — arithmetically true, and about nothing a reader would call
    // grounding. `null` is what `report.ts` reserves "undefined here" for, and the suites must use it.
    const measured = runBenchmark(measureIntoScratch())
    if (isErr(measured)) throw new Error(`the published run failed: ${measured.error}`)
    for (const name of ["golden-eval", "redteam-eval"]) {
      const suite = measured.value.suites.find((entry) => entry.name === name)
      expect(suite?.metrics.ssr).toBeNull()
      expect(suite?.cases.every((entry) => entry.contributesSentences === false)).toBe(true)
    }
    // The headline still comes from the only suite that carries prose, unchanged.
    expect(measured.value.ssr).toBe(1)
  })

  test("the harness exits 0 on the published run, because nothing failed", async () => {
    expect(await main(measureIntoScratch())).toBe(EXIT_OK)
  })

  test("the harness finds the repository itself, so the working directory cannot hide the corpus", () => {
    // `bun test` runs from `scripts/` and `bun run benchmark` runs from the root. Resolving from the
    // caller's cwd made a good checkout report a missing corpus depending on where you stood, so
    // resolution is asserted from a directory that has nothing to do with the repository.
    //
    // This test used to call `main()` with no paths, because a full run was the only way to observe
    // the resolution — and `main()` with no paths writes the committed report, so the one test
    // asserting that the committed report was not being written was the test writing it. Resolution
    // is now asserted directly, from a foreign cwd, which is a strictly sharper claim: it says the
    // corpus resolves *there*, not merely that a run succeeded from where the runner happened to be.
    const fromRoot = REPO_PATHS()
    const elsewhere = dirname(scratchPaths().corpusPath)
    const restore = process.cwd()
    try {
      process.chdir(elsewhere)
      expect(REPO_PATHS()).toEqual(fromRoot)
    } finally {
      process.chdir(restore)
    }
    expect(existsSync(fromRoot.corpusPath)).toBe(true)
    expect(fromRoot.outPath.endsWith(COMMITTED_REPORT)).toBe(true)
  })

  test("the headline SSR is the sentence-support rate over the golden prose, not a pass rate", () => {
    const measured = runBenchmark(measureIntoScratch())
    if (isErr(measured)) throw new Error(`the published run failed: ${measured.error}`)
    const { counts, ssr } = measured.value
    expect(counts.supportedSentences).toBe(3)
    expect(counts.totalSentences).toBe(3)
    expect(ssr).toBe(1)
  })

  test("the report is written where the story says it is, and it exists afterwards", () => {
    // US-12 names `benchmark-report.json` as the artefact a judge reads. The harness wrote
    // `unified-report.json` instead, which is the same bytes under a name nobody was told about —
    // and a report that exists is the only thing that makes the run checkable by a third party. The
    // path is asserted from the repository's own resolution and the write is asserted on a scratch
    // copy of it, so this test cannot be what dirties the committed report.
    expect(REPO_PATHS().outPath.endsWith(COMMITTED_REPORT)).toBe(true)
    const paths = measureIntoScratch()
    const measured = runBenchmark(paths)
    if (isErr(measured)) throw new Error(`the published run failed: ${measured.error}`)
    expect(existsSync(paths.outPath)).toBe(true)
  })
})

describe("the committed report is a record of a run, not a claim about one", () => {
  test("the committed report is byte-identical to a fresh run of the same corpus", () => {
    // The guard that makes the committed report a record. It is the artefact a judge reads without
    // running anything, and before this assertion nothing compared it with a fresh run — while
    // running the tests rewrote it, which made a stale or hand-edited file indistinguishable from a
    // current one. A drift here means the published figure and the code that produces it disagree.
    const paths = measureIntoScratch()
    const measured = runBenchmark(paths)
    if (isErr(measured)) throw new Error(`the published run failed: ${measured.error}`)
    const committed = readFileSync(REPO_PATHS().outPath, "utf8")
    expect(committed).toBe(`${JSON.stringify(measured.value, null, 2)}\n`)
  })

  test("the committed report records a pass, so the file a judge opens is not a failure record", () => {
    const committed = JSON.parse(readFileSync(REPO_PATHS().outPath, "utf8")) as { readonly outcome: string }
    expect(committed.outcome).toBe("pass")
  })
})

describe("the red-team fixtures exercise the corpus they claim to", () => {
  /** How many records each red-team identifier resolves to, read from the committed snapshot. */
  const resolvedRedTeam = (): ReadonlyMap<string, number> => {
    const opened = openCorpus(REPO_PATHS().corpusPath)
    if (isErr(opened)) throw new Error(`the corpus could not be opened: ${opened.error}`)
    const { resolved } = resolveCitations(
      opened.value.db,
      RED_TEAM_FIXTURES.flatMap((fixture) => fixture.claim.citations),
    )
    opened.value.db.close()
    return new Map(resolved.map((entry) => [entry.citation.raw, entry.records.length]))
  }

  const named = (fixtures: readonly (typeof RED_TEAM_FIXTURES)[number][]): string[] =>
    fixtures.map((fixture) => `${fixture.id} (${fixture.claim.citations[0]?.raw ?? "no citation"})`)

  test("every containment-arm fixture cites an identifier the snapshot actually holds", () => {
    // A fixture that declares `rejected` earned that verdict because its citation resolved and the
    // record lacks the quote. One that declares `rejected` and cites an identifier the corpus does
    // not hold is not testing the containment arm at all — it measures an identifier refusal while
    // claiming a misquotation. 11 of the 14 fixtures did exactly that and the suite still read 14/14.
    const records = resolvedRedTeam()
    const unresolved = RED_TEAM_FIXTURES.filter(
      (fixture) =>
        fixture.expectedVerdict === "rejected" &&
        (records.get(fixture.claim.citations[0]?.raw ?? "") ?? 0) === 0,
    )
    expect(named(unresolved)).toEqual([])
  })

  test("every resolution-arm fixture names an identifier the snapshot does not hold", () => {
    // The other direction, and it matters for the same reason: a fixture that declares
    // `unverifiable` but cites a record that resolves is no longer measuring resolution, so the
    // benchmark scores it against the wrong expectation.
    const records = resolvedRedTeam()
    const resolvedAnyway = RED_TEAM_FIXTURES.filter(
      (fixture) =>
        fixture.expectedVerdict === "unverifiable" &&
        (records.get(fixture.claim.citations[0]?.raw ?? "") ?? 0) > 0,
    )
    expect(named(resolvedAnyway)).toEqual([])
  })

  test("no two fixtures cite the same identifier, so coverage is not one record restated", () => {
    // 11 of 14 once pointed at `tirmidhi:1`. Cases that share a source measure one record repeatedly,
    // and a defect in how the corpus is read then passes as a dozen agreeing verdicts.
    const identifiers = RED_TEAM_FIXTURES.flatMap((fixture) => fixture.claim.citations.map((c) => c.raw))
    expect(new Set(identifiers).size).toBe(RED_TEAM_FIXTURES.length)
  })

  test("the containment arm spans several collections, not one", () => {
    const collections = new Set(
      RED_TEAM_FIXTURES.filter((fixture) => fixture.expectedVerdict === "rejected").map(
        (fixture) => fixture.claim.citations[0]?.collection ?? "",
      ),
    )
    expect(collections.size).toBeGreaterThanOrEqual(4)
  })
})

describe("a corpus that cannot be trusted is refused, not measured", () => {
  test("a missing corpus names the path and the command that fixes it", () => {
    const paths = scratchPaths()
    const opened = openCorpus(paths.corpusPath)
    if (isOk(opened)) throw new Error("a corpus that does not exist was opened")
    expect(opened.error).toContain(paths.corpusPath)
    expect(opened.error).toContain("bun run ingest")
  })

  test("a file that exists but is not a database is refused, not thrown", () => {
    // The regression this whole file exists for. `existsSync` is satisfied; `new Database` is
    // satisfied; only the first query raises. The assertion is on the REFUSAL, so a version that
    // let the throw escape would fail here rather than pass by never reaching this line.
    const paths = scratchPaths()
    notADatabase(paths.corpusPath)
    const opened = openCorpus(paths.corpusPath)
    if (isOk(opened)) throw new Error("a file that is not a database was opened as one")
    expect(opened.error).toContain("not a readable snapshot")
    expect(opened.error).toContain(paths.corpusPath)
  })

  test("a refused corpus is not exit 1, because exit 1 means a case failed", async () => {
    // The distinction the judge acts on. A corrupt corpus and a failing fixture are different
    // problems with different fixes, and collapsing them sends the reader to the wrong one.
    const paths = scratchPaths()
    notADatabase(paths.corpusPath)
    expect(await main(paths)).toBe(EXIT_UNTRUSTED)
  })

  test("a corpus with no usable identity is refused, naming what it recorded", () => {
    const paths = scratchPaths()
    writeFileSync(paths.corpusPath, "", "utf8")
    const opened = openCorpus(paths.corpusPath)
    if (isOk(opened)) throw new Error("an empty file was opened as a corpus")
    // An empty file is a valid SQLite database holding no tables, so the query fails rather than
    // returning nothing — either way the refusal names the file, which is the property asserted.
    expect(opened.error).toContain(paths.corpusPath)
  })

  test("a missing attestation is refused, because nothing on disk says which corpus it is", () => {
    const paths = scratchPaths()
    const measured = runBenchmark({ ...paths, corpusPath: REPO_PATHS().corpusPath })
    if (isOk(measured)) throw new Error("a corpus with no attestation was measured")
    expect(measured.error).toContain(paths.attestationPath)
  })

  test("an attestation that describes a different corpus is refused", () => {
    const paths = scratchPaths()
    writeFileSync(paths.attestationPath, JSON.stringify({ schemaVersion: "1", snapshotHash: "0".repeat(64), recordCount: 1 }), "utf8")
    const measured = runBenchmark({ ...paths, corpusPath: REPO_PATHS().corpusPath })
    if (isOk(measured)) throw new Error("an unattested corpus was measured")
    expect(measured.error).toBeTruthy()
  })

  test("identityOf reports a query failure as a value, so no caller has to catch anything", () => {
    // The seam itself, rather than the open path around it. `identityOf` is the only place the
    // snapshot identity is read, so if it could throw, both `openCorpus` and the post-run re-attest
    // would need their own guard and one of them would eventually be forgotten.
    const paths = scratchPaths()
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

describe("a suite that fails to load is reported, and the others still run", () => {
  test("an eval directory with no sets breaks only the eval suites", () => {
    // US-12 names this case: "if a suite fails to load, report the error and continue with other
    // suites". Nothing else in this file could observe it — every other degradation test fails at the
    // corpus, which is before any suite is built, so before this the suite-level handler was a claim
    // with no test behind it.
    //
    // The corpus is the committed one on purpose: the point is that a missing FIXTURE costs the two
    // eval suites and nothing else. A scratch corpus would have made all four suites disappear and
    // proved nothing about isolation.
    const paths = { ...measureIntoScratch(), evalDir: join(dirname(scratchPaths().corpusPath), "no-eval-here") }
    const measured = runBenchmark(paths)
    if (isErr(measured)) throw new Error(`the harness refused a corpus it should have accepted: ${measured.error}`)
    const byName = new Map(measured.value.suites.map((suite) => [suite.name, suite]))
    for (const [name, file] of [
      ["golden-eval", "golden-normalization.json"],
      ["redteam-eval", "redteam-fabricated.json"],
    ] as const) {
      // Each error names the file that was missing, so an operator who moved a fixture knows which
      // one — not merely that "the eval suite failed".
      expect(byName.get(name)?.error).toContain("does not exist, so the suite cannot be measured")
      expect(byName.get(name)?.error).toContain(file)
      expect(byName.get(name)?.metrics.counts.totalCases).toBe(0)
    }
    // The suites that need no eval fixture are untouched, and the report is RED rather than a pass
    // with two broken suites quietly inside it.
    expect(byName.get("golden-live")?.metrics.counts.totalCases).toBe(3)
    expect(byName.get("hallmark-red-team")?.metrics.counts.totalCases).toBe(14)
    expect(measured.value.outcome).toBe("fail")
  })

  test("a set that will not decode is reported, and the run continues", () => {
    // A malformed fixture and an absent one are the two ways a committed set can be unusable. Both are
    // suite-local: neither may take the other 240 cases with it, and neither may be swallowed into a
    // suite that silently measured nothing. The corpus is the committed one so the only fault under
    // test is the fixture.
    const dir = scratchPaths()
    const evalDir = dirname(dir.corpusPath)
    writeFileSync(join(evalDir, "golden-normalization.json"), "{ not json", "utf8")
    const measured = runBenchmark({ ...measureIntoScratch(), evalDir })
    if (isErr(measured)) throw new Error(`the harness refused a corpus it should have accepted: ${measured.error}`)
    const byName = new Map(measured.value.suites.map((suite) => [suite.name, suite]))
    expect(byName.get("golden-eval")?.error).toBeDefined()
    expect(byName.get("golden-eval")?.error).not.toContain("does not exist")
    expect(byName.get("redteam-eval")?.error).toContain("does not exist")
    // The suites that need no eval fixture measured their full case counts anyway.
    expect(byName.get("golden-live")?.metrics.counts.totalCases).toBe(3)
    expect(byName.get("hallmark-red-team")?.metrics.counts.passedCases).toBe(14)
    expect(measured.value.outcome).toBe("fail")
    expect(renderReport(measured.value)).toContain("error:")
  })

  test("a suite error is a failure, so the exit code says so", async () => {
    const paths = { ...measureIntoScratch(), evalDir: join(dirname(scratchPaths().corpusPath), "no-eval-here") }
    expect(await main(paths)).toBe(EXIT_FAILURES)
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