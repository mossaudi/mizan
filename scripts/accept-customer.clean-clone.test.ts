import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isErr } from "@mizan/core"
import { requireRepositoryRoot } from "@mizan/gate"
import { ACCEPTANCE_STEPS, CORPUS_PATH, decide, disclosureFrom, exitCodeFor, orchestrate, renderReport, type AcceptanceStep } from "./accept-customer.ts"

/**
 * The acceptance table, run for real — the CR's Finding 1.
 *
 * ## What the CR found
 *
 * `accept:customer` declares `types-and-gates` as corpus-independent and runs `bun run ci` as it,
 * while `bun run ci` collected `scripts/benchmark.test.ts`, which measured `data/corpus.db`. On a
 * clean clone the step failed, the report said `NOT ACCEPTED — 1 of 5 checks did not pass`, and the
 * reason printed was a benchmark failure. The clean clone this repository ships to a judge could not
 * pass its own acceptance, and the message pointed at the wrong thing.
 *
 * ## Why this test is in an opt-in lane
 *
 * Because it runs the real table, and the table's first step is `bun run ci`, a lane `bun run ci`
 * collects would recurse into itself. `ci-lanes.ts` excludes this file and states why, and the
 * partition assertion in `ci-lanes.test.ts` is what keeps the exclusion honest. Run it with
 * `bun run ci:clean-clone`.
 *
 * ## The two halves, and why both are here
 *
 * The CR asks for the run to exit 0 *with `data/corpus.db` absent*, and that specific precondition is
 * not reproducible from the table alone: on a machine that has the corpus, the corpus steps RUN, so a
 * test that merely asserted "the table accepts" would pass for the wrong reason and a reviewer would
 * be unable to tell which half regressed. So both are asserted:
 *
 * 1. `corpus-absent` — the real `orchestrate` against a **directory that genuinely has no corpus**, so
 *    the real `existsSync` probe decides, with a step table whose corpus-dependent rows exit 3 if they
 *    are ever spawned. Nothing is mocked: if the skip logic breaks, the canary fails the run.
 * 2. `with a corpus` — the real table over the real root, where the corpus steps run for real. A fix
 *    that made acceptance pass by *hiding* the corpus would break this half, which is why it is here
 *    and not deleted as redundant.
 */

const ROOT = (): string => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) throw new Error(`the test could not locate the repository root: ${root.error}`)
  return root.value
}

/** The steps that are not allowed to need a corpus, by id. */
const CORPUS_FREE_IDS = ACCEPTANCE_STEPS.filter((step) => !step.needsCorpus).map((step) => step.id)

/**
 * A directory that `requireRepositoryRoot` never sees — only `existsSync` does — and that therefore
 * holds no corpus. Deliberately empty rather than a synthetic checkout: the orchestrator only probes
 * for the corpus and spawns relative to the root, so an empty directory is the most honest stand-in
 * for a fresh clone and cannot accidentally contain a database.
 */
const corpusFreeRoot = (): string => mkdtempSync(join(tmpdir(), "mizan-clean-clone-accept-"))

/**
 * A step table whose corpus-dependent rows would FAIL LOUDLY if the orchestrator ever ran them.
 *
 * `bun -e "process.exit(3)"` exits 3 with no output, so a corpus step that ran on a corpus-free root
 * would surface as `failed` and take `accepted` to false — the assertion fails, and it fails because
 * the defect was real rather than because a mock said so.
 */
const CANARY_STEPS: readonly AcceptanceStep[] = [
  { id: "corpus-free-canary", purpose: "runs on any checkout", argv: ["bun", "-e", "process.exit(0)"], needsCorpus: false, whenCorpusAbsent: "unmeasured" },
  { id: "ingest-canary", purpose: "must not run without a corpus", argv: ["bun", "-e", "process.exit(3)"], needsCorpus: true, whenCorpusAbsent: "corpus_absent" },
  { id: "recall-canary", purpose: "must not run without a corpus either", argv: ["bun", "-e", "process.exit(3)"], needsCorpus: true, whenCorpusAbsent: "corpus_absent" },
]

describe("the acceptance table against a checkout with no corpus", () => {
  test("the planted violation fails: the run accepts with exit 0 and names `corpus_absent`", async () => {
    const root = corpusFreeRoot()
    try {
      // The precondition the CR names, established rather than assumed. If a future change put a
      // corpus here, this assertion is what would say so — instead of the test quietly becoming the
      // corpus-present half and proving nothing about the clean clone.
      expect(existsSync(join(root, "data", "corpus.db"))).toBe(false)

      const results = await orchestrate(root, CANARY_STEPS)
      const decision = decide(results, CANARY_STEPS)

      // Every corpus-dependent row was skipped, not run and not reported as a pass.
      expect(results.filter((result) => result.outcome === "skipped").map((result) => result.id)).toEqual([
        "ingest-canary",
        "recall-canary",
      ])
      // And each skip is a shared-vocabulary word, which is the typed half of "typed `corpus_absent`
      // degradation". `corpus_absent` is what `decide` hands a client; `renderReport` is what an
      // operator reads, and it must not collapse the skip into a bare "skipped".
      expect(decision.skipped.map((entry) => entry.condition)).toEqual(["corpus_absent", "corpus_absent"])
      expect(results.every((result) => result.outcome === "passed" || result.outcome === "skipped")).toBe(true)
      expect(decision.accepted).toBe(true)
      expect(exitCodeFor(decision)).toBe(0)
      expect(renderReport(CANARY_STEPS, results, decision, disclosureFrom(root, results))).toContain("ACCEPTED WITH 2 CHECK(S) NOT RUN")
      // And the figures block on a synthetic checkout says `unmeasured` rather than printing nothing.
      // There is no attestation and no eval set under this root, so a disclosure that rendered silently
      // would be indistinguishable from a disclosure that had figures to show — the ambiguity Story 3
      // exists to remove.
      const report = renderReport(CANARY_STEPS, results, decision, disclosureFrom(root, results))
      expect(report).toContain("unmeasured")
      expect(report).not.toContain("| abudawud |")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 120_000)

  test("a corpus that appears in the empty root is the only thing that changes the outcome", async () => {
    // The control for the test above, and the half that stops it from being a tautology: with a
    // corpus present at the very same path, the same orchestrator RUNS the two canaries, they exit 3,
    // and acceptance is refused. So the absence in the first test is what produced its skips — not the
    // step table, not the decision function, and not a hardcoded corpus-free assumption.
    const root = corpusFreeRoot()
    try {
      mkdirSync(join(root, "data"), { recursive: true })
      writeFileSync(join(root, "data", "corpus.db"), "", "utf8")
      expect(existsSync(join(root, CORPUS_PATH))).toBe(true)
      const results = await orchestrate(root, CANARY_STEPS)
      const decision = decide(results, CANARY_STEPS)
      expect(results.filter((result) => result.outcome === "failed").map((result) => result.id)).toEqual([
        "ingest-canary",
        "recall-canary",
      ])
      expect(decision.skipped).toEqual([])
      expect(exitCodeFor(decision)).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 120_000)
})

describe("the acceptance table, run for real", () => {
  test("the whole table accepts, and every step that did not run says why in words", async () => {
    // The other half of the CR's assertion, over the real table on the real root: every check that can
    // run here did run and passed. On a machine with a corpus the three dependent steps run for real;
    // on one without, they skip and the table still accepts. Neither outcome is asserted as the other.
    const steps = ACCEPTANCE_STEPS
    const results = await orchestrate(ROOT(), steps)
    const decision = decide(results)
    expect(decision.accepted).toBe(true)
    expect(decision.failed).toEqual([])
    expect(renderReport(steps, results, decision, disclosureFrom(ROOT(), results))).toContain("ACCEPTED")
    for (const entry of decision.skipped) {
      // A skip with no condition is the silent skip AGENTS.md section 16 forbids, and `skipped`
      // reported as `passed` would be worse: a demo would make the corpus claim anyway.
      expect(CORPUS_FREE_IDS).not.toContain(entry.id)
      expect(entry.condition.length).toBeGreaterThan(0)
    }
    // Every step either passed or was skipped with a reason — never `failed`, never missing.
    expect(results.length).toBe(steps.length)
    expect(results.filter((result) => result.outcome === "failed").map((result) => result.id)).toEqual([])
    // The test's own budget is the sum of the step budgets, not a round number chosen once: a `bun test`
    // timeout below `FULL_CI_TIMEOUT_MS` would abort a run the table itself would still have allowed, and
    // report it as a test failure — the harness disagreeing with the thing it is testing.
  }, 1_500_000)

  test("the corpus-free steps are the ones whose commands are in the default lane", () => {
    // The split, asserted as data rather than as a run. `types-and-gates` runs `bun run ci`; the
    // benchmark lives in `ci:corpus`; if the default lane ever takes a corpus-dependent test again,
    // this is where the reader learns it, without waiting for a clean clone to fail.
    const typesAndGates = ACCEPTANCE_STEPS.find((step) => step.id === "types-and-gates")
    expect(typesAndGates?.argv).toEqual(["bun", "run", "ci"])
    expect(typesAndGates?.needsCorpus).toBe(false)
    const benchmark = ACCEPTANCE_STEPS.find((step) => step.id === "published-benchmark-run")
    expect(benchmark?.argv).toEqual(["bun", "run", "ci:corpus"])
    expect(benchmark?.needsCorpus).toBe(true)
  })

  test("a step that did not run is never counted as a step that passed", () => {
    // The failure mode of the whole table, as a pure function of the results: drop one step's result
    // and the decision must refuse rather than accept on the strength of the ones that ran.
    const complete = ACCEPTANCE_STEPS.map((step) => ({ id: step.id, outcome: "passed" as const, reason: "" }))
    expect(decide(complete).accepted).toBe(true)
    const short = complete.slice(1)
    const decision = decide(short)
    expect(decision.accepted).toBe(false)
    expect(decision.failed).toEqual([ACCEPTANCE_STEPS[0]?.id ?? ""])
  })

  test("the corpus a clean clone does not have is the one every corpus-dependent step is about", () => {
    // One corpus, one path, one place it is spelled. Two steps probing `data/corpus.db` and one
    // probing something else is a table where a skip would be silent for one row.
    const dependent = ACCEPTANCE_STEPS.filter((step) => step.needsCorpus)
    expect(dependent.length).toBeGreaterThan(1)
    for (const step of dependent) expect(step.whenCorpusAbsent).toBe("corpus_absent")
    expect(CORPUS_PATH).toBe("data/corpus.db")
    // And a corpus-dependent step is never a step whose command tolerates absence. The published
    // benchmark's correctness test needs the real corpus — that is the whole reason it lives in
    // `ci:corpus` rather than in the default lane — so the table has to reach it, or a clean clone
    // would report the corpus as checked when the benchmark was never measured.
    expect(dependent.some((step) => step.argv.includes("ci:corpus"))).toBe(true)
  })
})
