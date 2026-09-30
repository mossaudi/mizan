import { afterAll, describe, expect, test } from "bun:test"
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeOrFail, decodeSync, isOk, normalizeForMatch, EvalSet as EvalSetSchema, type CorpusRecord, type EvalAnchor, type EvalSet } from "@mizan/core"
import { buildSnapshot } from "@mizan/corpus"
import { ROOT } from "./committed-ledger.ts"

/**
 * The benchmark's REFUSAL paths, end to end through the real command.
 *
 * ## Why this file exists when `benchmark.test.ts` already exists
 *
 * `benchmark.test.ts` proves the arms, the declaration and the report. Every one of those runs
 * against a hermetic snapshot the test builds, because the attested 27,234-record `data/corpus.db`
 * is a gitignored artefact no test may require. So the one property the whole command exists for —
 * **an unattested corpus produces no figure at all** — was never executed, and the branch that
 * handled a missing `attestation.json` printed a bespoke sentence instead of the
 * `attestation_unreadable` reason the specification names. A guard nobody runs and a vocabulary
 * nobody prints are two halves of the same defect: a benchmark that quietly degraded would still
 * have had a green suite.
 *
 * ## The harness, and why `cwd` is a temp root rather than the repository
 *
 * The command resolves `data/corpus.db`, `attestation.json` and the red-team set from
 * `process.cwd()`. Pointing that at a temp directory is what makes each refusal *isolated*: the
 * repository's real 81 MB corpus and its real attestation stay out of reach, so a case cannot pass
 * by accident on a machine where they exist and fail on a clean clone. The snapshot is rebuilt from
 * the red-team set's own 30 committed anchors — the same hermetic corpus `benchmark.test.ts` uses,
 * so the two files agree about what the red-team set is and disagree about nothing.
 *
 * ## What "no figure" is asserted to mean
 *
 * Not "the summary is absent" — a benchmark could print a table and then a caveat, and a reader in a
 * hurry would quote the table. The assertion is that **no numeric token survives at all**: no rate,
 * no count, no percentage, no record count. That is the property MIZ-101 and MIZ-102 both ask for
 * ("prints no baseline rate, no detection rate and no delta" / "prints no figure of any kind"),
 * stated once, here, as a count rather than as a list of strings nobody has enumerated. A refusal
 * sentence may legitimately mention a field name and a reason; it may not contain a number that
 * could be quoted as a measurement.
 */

const BENCHMARK_RELATIVE = join("scripts", "benchmark", "run.ts")
const REDTEAM_RELATIVE = join("data", "eval", "redteam-fabricated.json")

/** The untrusted code `apps/cli` already uses, so one number means one thing repository-wide. */
const EXIT_UNTRUSTED = 3

/** Scratch roots, removed after the run — including after a failed assertion. */
const TEMP_DIRS: string[] = []

afterAll(() => {
  // Best-effort, and the reason is the sibling file's: Windows releases a SQLite handle
  // asynchronously, so `rmSync` can fail with EBUSY on a directory whose snapshot was read seconds
  // earlier. A leftover directory under the OS temp folder is not a test failure, and a cleanup that
  // can fail the suite trains the reader to ignore a red run — which is the one thing a benchmark
  // self-test must never do.
  for (const dir of TEMP_DIRS) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    } catch {
      // The OS reclaims it.
    }
  }
})

const scratchDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "mizan-bench-refusal-"))
  TEMP_DIRS.push(dir)
  return dir
}

/**
 * An anchor as a full record, with `textMatch` derived by the real normalizer.
 *
 * Derived rather than copied, for the reason `benchmark.test.ts` gives: a fixture carrying its own
 * pre-folded column could make a fabrication retrieve itself, and an assertion describing that would
 * be describing a fiction. Twelve lines of fixture projection, restated rather than exported from the
 * other test file, because a shared helper across two test files turns one of them into an import of
 * the other and couples two suites that exist to fail independently.
 */
const toRecord = (anchor: EvalAnchor): CorpusRecord => ({
  id: anchor.id,
  collection: anchor.collection,
  number: anchor.number,
  grade: anchor.grade,
  gradeApplicable: anchor.gradeApplicable,
  gradeSource: anchor.gradeSource,
  gradeBasis: anchor.gradeBasis,
  attribution: anchor.attribution,
  license: anchor.license,
  licenseUrl: anchor.licenseUrl,
  sourceUrl: anchor.sourceUrl,
  textDisplay: anchor.textDisplay,
  textMatch: normalizeForMatch(anchor.textDisplay),
  translation: anchor.translation,
})

const redTeamSet = (): EvalSet => {
  const path = join(ROOT, REDTEAM_RELATIVE)
  const decoded = decodeOrFail(decodeSync(EvalSetSchema), JSON.parse(readFileSync(path, "utf8")) as unknown, path)
  if (!isOk(decoded)) throw new Error(`cannot decode ${path}: ${decoded.error.detail}`)
  return decoded.value
}

/**
 * Replace the planted set's cases with none, leaving everything else intact.
 *
 * The empty case set is one of the specification's named edge cases, and it is the one that cannot
 * be provoked anywhere else: every other test builds its own case list, and `EvalSet.cases` is a
 * plain array, so nothing in the unit suite ever holds a decodable set with nothing in it. The
 * attestation is written for the real snapshot, so the run reaches the refusal on the fact under
 * test rather than on an attestation complaint — a refusal reached for the wrong reason is one this
 * file would happily pass.
 */
const emptyCaseSet = (dir: string, snapshotHash: string, recordCount: number): void => {
  writeFileSync(join(dir, "attestation.json"), attestationWith(snapshotHash, recordCount), "utf8")
  writeFileSync(join(dir, REDTEAM_RELATIVE), `${JSON.stringify({ ...redTeamSet(), cases: [] }, null, 2)}\n`, "utf8")
}

/**
 * A root holding a real snapshot, the real red-team set, and whatever `plant` writes in its place.
 *
 * `plant` IS the planted violation: pass a function that writes nothing and the root is a corpus with
 * no attestation; pass one that writes a wrong hash and it is a mismatch. Building every case from
 * this one parameter keeps the refusals identical except for the single fact under test, so a test
 * that fails is a failure of that fact and not of the scaffolding.
 */
const isolatedRoot = (plant: (dir: string, snapshotHash: string, recordCount: number) => void): { readonly dir: string; readonly snapshotHash: string; readonly recordCount: number } => {
  const dir = scratchDir()
  mkdirSync(join(dir, "data", "eval"), { recursive: true })
  cpSync(join(ROOT, REDTEAM_RELATIVE), join(dir, REDTEAM_RELATIVE))
  const built = buildSnapshot(join(dir, "data", "corpus.db"), redTeamSet().anchors.map(toRecord))
  plant(dir, built.snapshotHash, built.recordCount)
  return { dir, snapshotHash: built.snapshotHash, recordCount: built.recordCount }
}

/** Run the benchmark with `cwd` pointed at `dir`, and capture everything it said. */
const runBenchmark = async (dir: string): Promise<{ readonly code: number; readonly output: string }> => {
  const proc = Bun.spawn(["bun", "run", join(ROOT, BENCHMARK_RELATIVE)], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  return { code: await proc.exited, output: `${stdout}${stderr}` }
}

/** The five published figure labels, spelled as `report.ts` prints them. */
const FIGURE_LABELS = ["baseline top-1 hit rate", "system detection rate", "system abstention rate", "delta", "false verified"]

/** The first line `renderBenchmarkReport` emits. Its absence proves the report never ran at all. */
const REPORT_HEADER = "mizan vs plain lexical search"

/**
 * The one assertion every refusal shares: no figure was published.
 *
 * Two properties, both narrow on purpose. The five labels are the published figures by name — a
 * benchmark that rendered its table and then added a caveat would still contain them. And no `%`
 * survives, because every rate, detection rate, abstention rate and delta is rendered as a
 * percentage; `false verified` is the one bare integer, and it is named by the label check.
 *
 * What this deliberately does NOT assert is "the output contains no digits at all". A refusal
 * legitimately prints the on-disk record count and two 64-character digests: that is the diagnosis,
 * and a person who has to decide whether to re-ingest needs it. A number that is *provenance* and a
 * number that is a *measurement* are different things, and collapsing them would make this check
 * forbid the evidence it exists to demand.
 */
const expectNoPublishedFigures = (output: string): void => {
  for (const label of FIGURE_LABELS) expect(`${label}: ${output.includes(label)}`).toBe(`${label}: false`)
  expect({ percentages: output.match(/%/g) ?? [] }).toEqual({ percentages: [] })
  expect({ reportRendered: output.includes(REPORT_HEADER) }).toEqual({ reportRendered: false })
  // The hypothesis and the set name are the two other things only the report prints. A refusal that
  // quotes the hypothesis has started making an argument, and an argument is a figure's job.
  expect(output).not.toContain("Pre-registered hypothesis")
  expect(output).not.toContain("redteam-fabricated (")
}

/** Every file the run left behind, so "the working tree is unmodified" is checkable and not asserted. */
const filesUnder = (dir: string): readonly string[] => {
  const found: string[] = []
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = join(current, entry.name)
      const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(next, relative)
      found.push(relative)
    }
  }
  walk(dir, "")
  return found.sort()
}

/**
 * A DECODABLE attestation carrying the given identity.
 *
 * Built from the committed `attestation.json` rather than hand-rolled, because a hand-rolled one
 * omits a required key and is then refused at the DECODE — which is a different failure from the
 * mismatch under test, and a test that reached the wrong refusal would pass while proving nothing.
 * The identity is substituted, and nothing else, so the file is the real one with one field changed.
 */
const attestationWith = (snapshotHash: string, recordCount: number): string => {
  const committed = JSON.parse(readFileSync(join(ROOT, "attestation.json"), "utf8")) as Record<string, unknown>
  return `${JSON.stringify({ ...committed, snapshotHash, recordCount }, null, 2)}\n`
}

describe("a corpus with no attestation publishes no figure", () => {
  test("a missing attestation.json exits untrusted, names attestation_unreadable, and computes nothing", async () => {
    // The specification's own words: "exits non-zero and prints the attestation_unreadable reason".
    // The reason is printed as the TAG, not as a bespoke sentence, because a harness reading this
    // output must be able to key on the vocabulary rather than on English it will eventually reword.
    const { dir } = isolatedRoot(() => undefined)

    const { code, output } = await runBenchmark(dir)

    expect(code).toBe(EXIT_UNTRUSTED)
    expect(output).toContain("attestation_unreadable")
    expectNoPublishedFigures(output)
  })

  test("the refusal is unmodified: nothing is written, and the artefact is not created", async () => {
    // "Prints no figure" is weaker than "writes no figure". A benchmark that refused but still
    // overwrote the committed artefact with a partial object would pass every assertion above.
    const { dir } = isolatedRoot(() => undefined)
    const before = filesUnder(dir)

    await runBenchmark(dir)

    expect(filesUnder(dir)).toEqual(before)
    expect(filesUnder(dir)).not.toContain("data/benchmark/vs-search.json")
  })

  test("an attestation.json that is a DIRECTORY is refused, not a raw EISDIR throw", async () => {
    // One of the named edge cases, and the one a `try`-less read gets wrong: `readFileSync` on a
    // directory throws on Linux and Windows alike, and an uncaught throw on the integrity path is
    // the crash state AGENTS.md section 16 forbids.
    const { dir } = isolatedRoot((root) => {
      mkdirSync(join(root, "attestation.json"), { recursive: true })
    })

    const { code, output } = await runBenchmark(dir)

    expect(output).toContain("attestation_unreadable")
    // The reason it could not be read is the diagnosis and is kept. What must NOT appear is the
    // shape of an unhandled throw — a frame list is what turns an integrity refusal into a crash, and
    // a crash is a state the product is forbidden to show (AGENTS.md section 16).
    expect(output).not.toContain("at <anonymous>")
    expect(output).not.toContain("Traceback")
    expect(output).not.toMatch(/\n\s+at\s/)
    expectNoPublishedFigures(output)
    expect(code).toBe(EXIT_UNTRUSTED)
  })

  test("an attestation.json that is empty is refused, not decoded into a zero", async () => {
    // The other named edge case. A `JSON.parse` that yielded `undefined` and then compared
    // `undefined !== hash` would still refuse — but by accident, and the message would name a
    // mismatch rather than an unreadable file, which is a false statement about what is wrong.
    const { dir } = isolatedRoot((root) => {
      writeFileSync(join(root, "attestation.json"), "", "utf8")
    })

    const { code, output } = await runBenchmark(dir)

    expect(output).toContain("attestation_unreadable")
    expectNoPublishedFigures(output)
    expect(code).toBe(EXIT_UNTRUSTED)
  })
})

describe("a mismatch is a loud abort, and it names what disagreed", () => {
  test("a wrong snapshot hash prints BOTH digests in full and exits 3", async () => {
    // Truncating here would be the convenience of the reader and the uselessness of the operator: the
    // person who has to act is comparing two files, and a 12-character prefix cannot be compared.
    const WRONG = "9a11c0de".repeat(8)
    // The count is threaded through CORRECT, not `30`. `attestSnapshot` compares the hash first and
    // returns before it reaches the count, so a wrong literal here would be inert today and load-bearing
    // the day the comparison order changed — a second planted violation hiding inside a test whose name
    // promises one. Derived from the snapshot, the hash is provably the only thing wrong.
    const { dir, snapshotHash } = isolatedRoot((root, _hash, count) => {
      writeFileSync(join(root, "attestation.json"), attestationWith(WRONG, count), "utf8")
    })

    const { code, output } = await runBenchmark(dir)

    expect(output).toContain(snapshotHash)
    expect(output).toContain(WRONG)
    // The field, not merely "it did not match".
    expect(output).toContain("attestation_mismatch")
    expect(output).toContain("snapshotHash")
    expect(code).toBe(EXIT_UNTRUSTED)
    expectNoPublishedFigures(output)
  })

  test("a right hash with the wrong record count names the count and refuses", async () => {
    // The other direction, and the case a hash-only check would pass: the records are the same, so
    // the digest agrees, and only the field a human reads reveals the wrong build.
    //
    // `count + 1`, and NOT a literal. The obvious literal is the real corpus's 27,234 — which would be
    // the one place in this hermetic file that depends on the 81 MB `data/corpus.db` its own header
    // says no test may require, restated as a second source of truth (AGENTS.md section 17). Worse, it
    // is a trap in both directions: a maintainer grepping `27234` to update the corpus size would land
    // here, "correct" the planted violation into an accurate attestation, and delete the test. `count + 1`
    // is wrong by construction, so no edit can ever make it right and the refusal cannot stop firing.
    const { dir, recordCount } = isolatedRoot((root, hash, count) => {
      writeFileSync(join(root, "attestation.json"), attestationWith(hash, count + 1), "utf8")
    })

    const { code, output } = await runBenchmark(dir)

    expect(output).toContain("attestation_mismatch")
    expect(output).toContain("recordCount")
    expect(output).toContain(String(recordCount))
    // BOTH counts, not just the one on disk. `attest.ts:105` is the reason the field is checked at
    // all — "27,234 records versus 3" is what an investigator acts on, and a message carrying only
    // the open database's number tells them nothing about which file to open. Asserting the pair
    // together is what makes the message's *shape* load-bearing rather than assumed; asserting the
    // planted number bare would be satisfiable by two hex digits inside a digest.
    expect(output).toContain(`recordCount ${recordCount + 1}, the open database holds ${recordCount}`)
    expect(code).toBe(EXIT_UNTRUSTED)
    // The record count IS a number, and it is the one number a refusal is allowed to carry: it is
    // the diagnosis, not a measurement. Every *figure* is still absent.
    for (const label of FIGURE_LABELS) expect(output.includes(label)).toBe(false)
  })

  test("the exit code is 3 and not 0 or 1, so one number means 'do not believe the output'", async () => {
    // Stated as its own assertion because a harness that special-cases 1 would treat a refusal as a
    // failure to run and fall back to whatever figures it cached. That fallback is the defect.
    const { dir } = isolatedRoot(() => undefined)
    const { code } = await runBenchmark(dir)
    expect(code).toBe(EXIT_UNTRUSTED)
  })
})

describe("there is no corpus at all", () => {
  test("it exits non-zero and says which step to run, with no figure and no attestation complaint", async () => {
    // The honest state for a fresh clone. It must NOT be reported as an attestation failure: nothing
    // was attested because nothing was ingested, and telling someone to re-ingest is the wrong advice
    // to a reader who has not ingested yet.
    const dir = scratchDir()
    mkdirSync(join(dir, "data", "eval"), { recursive: true })
    cpSync(join(ROOT, REDTEAM_RELATIVE), join(dir, REDTEAM_RELATIVE))

    const { code, output } = await runBenchmark(dir)

    expect(code).not.toBe(0)
    expect(output).toContain("data/corpus.db")
    expect(output).toContain("bun run ingest")
    expect(output).not.toContain("attestation")
    expectNoPublishedFigures(output)
  })
})

describe("there is nothing to measure", () => {
  test("an empty case set exits untrusted and writes no artefact, rather than scoring 0 of 0", async () => {
    // The specification's declared edge case, and the one figure this harness could most easily have
    // published dishonestly. Every rate is `hits / total`, so an empty set yields a 0.0% detection
    // rate, a 0.0% baseline and a delta of 0.0 — an artefact reading "mizan caught nothing" when the
    // truth is "nothing was run", and a report printing a hypothesis verdict for it. Exit 3 and no
    // artefact is the only surface that says what actually happened (AGENTS.md §16).
    const { dir } = isolatedRoot(emptyCaseSet)

    const { code, output } = await runBenchmark(dir)

    expect(code).toBe(EXIT_UNTRUSTED)
    expect(output).toContain("zero cases")
    expectNoPublishedFigures(output)
    expect(filesUnder(dir)).not.toContain("data/benchmark/vs-search.json")
  })

  test("the refusal is not a crash, and it names the file that is empty", async () => {
    // Same standard as the `EISDIR` case above: an integrity refusal that surfaces as a stack trace
    // is the crash state the constitution forbids, and a reader cannot act on a frame list. The path
    // asserted below is a forward-slash literal rather than a `join`, because `run.ts` names the set
    // with one and the message a reader acts on is the message that was actually printed.
    const { dir } = isolatedRoot(emptyCaseSet)

    const { output } = await runBenchmark(dir)

    expect(output).toContain("data/eval/redteam-fabricated.json")
    expect(output).not.toMatch(/\n\s+at\s/)
    expect(output).not.toContain("Traceback")
  })
})
