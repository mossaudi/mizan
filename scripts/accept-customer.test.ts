import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ACCEPTANCE_STEPS,
  CORPUS_PATH,
  STEP_TIMEOUT_MS,
  decide,
  orchestrate,
  renderReport,
  type AcceptanceStep,
  type StepResult,
} from "./accept-customer.ts"

/**
 * The acceptance decision, tested without running a single check.
 *
 * `orchestrate` spawns `bun run ci` and `bun run eval:suggestions`, which between them take minutes, need
 * a corpus, and would make this suite a coin flip on machine load. So the decision is separated from the
 * spawning: `decide` is a pure function over results, and everything asserted here is asserted in
 * milliseconds and identically on any machine.
 *
 * That separation is also the reason this command can be trusted. The expensive part is four subprocesses
 * that already have their own suites; the part that decides whether a customer sees a claim is four
 * comparisons, and it is the four comparisons that are tested.
 */

const dirs: string[] = []

const tempRoot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "mizan-accept-"))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** One step, reduced to what `decide` reads. The argv is irrelevant to the decision. */
const step = (id: string, needsCorpus = false): AcceptanceStep => ({
  id,
  purpose: "a check",
  argv: ["bun", "test"],
  needsCorpus,
  whenCorpusAbsent: needsCorpus ? "corpus_absent" : "unmeasured",
})

const passed = (id: string): StepResult => ({ id, outcome: "passed", reason: "" })

describe("the step table is a table, and every step is a real command", () => {
  test("every step declares an id, a purpose, an argv and an absence condition", () => {
    // A step missing a field is a step that cannot be printed, cannot be skipped honestly, or cannot be
    // run. Asserted as a shape so adding a malformed step fails here rather than at the first demo.
    for (const entry of ACCEPTANCE_STEPS) {
      expect(entry.id).toMatch(/^[a-z][a-z-]*$/)
      expect(entry.purpose.length).toBeGreaterThan(0)
      expect(entry.argv.length).toBeGreaterThan(1)
      expect(entry.whenCorpusAbsent.length).toBeGreaterThan(0)
    }
  })

  test("ids are unique, because the report names a step and a duplicate makes the report lie", () => {
    const ids = ACCEPTANCE_STEPS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("no step writes a committed artefact, because accepting must not change the evidence", () => {
    // The load-bearing property of this command. Every measurement in this repository has a record mode
    // that rewrites a committed file, and if any of them appeared here then running the acceptance check
    // would be a way of changing what it checks. `--record` is the only spelling, so this catches a
    // pasted command without having to reason about what each script writes.
    for (const entry of ACCEPTANCE_STEPS) {
      expect(entry.argv).not.toContain("--record")
    }
  })

  test("the corpus-independent checks come first, so a clean clone still produces a useful report", () => {
    // Ordering is the report's ordering. A clone with no corpus should learn three things it passed
    // before it is told about the two it could not run.
    const firstCorpusStep = ACCEPTANCE_STEPS.findIndex((entry) => entry.needsCorpus)
    expect(firstCorpusStep).toBeGreaterThan(0)
    expect(ACCEPTANCE_STEPS.slice(firstCorpusStep).every((entry) => entry.needsCorpus)).toBe(true)
    expect(ACCEPTANCE_STEPS.slice(0, firstCorpusStep).some((entry) => entry.needsCorpus)).toBe(false)
  })

  test("the corpus step is the attested one, not a bare existence check", () => {
    // `existsSync` decides whether to SKIP; it must never be what decides whether the corpus is good.
    // A gate that trusted its own skip condition would pass a corrupt corpus on a clean clone and fail a
    // healthy one on a developer machine.
    const attested = ACCEPTANCE_STEPS.find((entry) => entry.argv.includes("ingest:check"))
    expect(attested).toBeDefined()
    expect(attested?.needsCorpus).toBe(true)
  })

  test("the timeout is generous, because a step that times out is not a verdict", () => {
    // The slowest step is the full CI, which runs every package's suite and takes minutes. A budget
    // tuned to the fast steps would report a timeout as a failure of the product on a loaded CI box.
    expect(STEP_TIMEOUT_MS).toBe(600_000)
  })

  test("a step that runs a test tool declares where it runs from", () => {
    // AGENTS.md section 8: `bun test` at the repository root globs every package, silently skips the
    // ones that fail to load, and can report green having collected nothing. Found by running this
    // command for real — the step failed with `had no matches` before `workdir` existed, which is the
    // exact silent-green blind spot the rule warns about, arriving as a loud failure instead.
    for (const entry of ACCEPTANCE_STEPS) {
      if (entry.argv[0] !== "bun") continue
      if (entry.argv[1] !== "test") continue
      expect(entry.workdir).toBeDefined()
      expect(`${entry.workdir}/test/eval.test.ts`).toContain("apps/cli")
    }
  })
})

describe("the decision is fail-closed, because an unchecked claim is not an accepted one", () => {
  const steps = [step("a"), step("b"), step("c")]

  test("every step passing accepts the run", () => {
    expect(decide([passed("a"), passed("b"), passed("c")], steps)).toEqual({
      accepted: true,
      failed: [],
      skipped: [],
    })
  })

  test("one failing step refuses, and names the step", () => {
    const verdict = decide(
      [passed("a"), { id: "b", outcome: "failed", reason: "exited 1" }, passed("c")],
      steps,
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.failed).toEqual(["b"])
  })

  test("a MISSING result refuses, rather than counting as a pass", () => {
    // The planted violation for the whole command. A caller that forgets a step — a new check added to
    // the table and not to the call site — would otherwise produce a clean acceptance that silently
    // covered fewer checks than the table promises.
    const verdict = decide([passed("a"), passed("b")], steps)
    expect(verdict.accepted).toBe(false)
    expect(verdict.failed).toContain("c")
  })

  test("a timed-out step refuses, and is not reported as a failure of the product", () => {
    // Distinct outcome, same refusal. The reason is a budget, not a verdict, and the report must not
    // let a reader conclude the check failed when it did not finish.
    const verdict = decide(
      [{ id: "a", outcome: "timedOut", reason: `no result within ${STEP_TIMEOUT_MS}ms` }, passed("b")],
      [step("a"), step("b")],
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.failed).toEqual(["a"])
    expect(renderReport([step("a")], [{ id: "a", outcome: "timedOut", reason: "no result within the budget" }], verdict))
      .toContain("timedOut")
  })

  test("a result for a step that is not in the table is ignored, so it cannot manufacture an acceptance", () => {
    // A stale or invented id must not satisfy a declared step, and must not appear in the report as if
    // it had been checked. The table is the denominator.
    const verdict = decide([passed("a"), passed("b"), passed("invented")], [step("a"), step("b")])
    expect(verdict.accepted).toBe(true)
    expect(renderReport([step("a")], [passed("invented")], verdict)).toContain("MISSING")
  })
})

describe("a missing corpus is a stated absence, and not a failed product", () => {
  const corpusSteps = [step("a"), step("corpus", true), step("recall", true)]

  test("a skipped step carries its degradation condition, so the report can name it", () => {
    const verdict = decide(
      [
        passed("a"),
        { id: "corpus", outcome: "skipped", condition: "corpus_absent", reason: `${CORPUS_PATH} is not present` },
        { id: "recall", outcome: "skipped", condition: "corpus_absent", reason: `${CORPUS_PATH} is not present` },
      ],
      corpusSteps,
    )
    expect(verdict.accepted).toBe(true)
    expect(verdict.skipped).toEqual([
      { id: "corpus", condition: "corpus_absent" },
      { id: "recall", condition: "corpus_absent" },
    ])
  })

  test("a skipped step is never counted as passed", () => {
    // The distinction the whole design rests on. `accepted: true` here means "everything that could be
    // checked was checked" — it is NOT "the corpus was verified", and a reader who cannot tell those
    // apart will demo a claim nobody checked.
    const verdict = decide(
      [
        passed("a"),
        { id: "corpus", outcome: "skipped", condition: "corpus_absent", reason: "absent" },
        { id: "recall", outcome: "skipped", condition: "corpus_absent", reason: "absent" },
      ],
      corpusSteps,
    )
    expect(verdict.failed).toEqual([])
    expect(verdict.skipped).toHaveLength(2)
  })

  test("a corpus that is present and FAILS is a refusal, which is the opposite of being absent", () => {
    // The planted violation that keeps the skip honest: absent is tolerated, wrong is not. Without this
    // distinction a missing corpus and a tampered corpus would be the same event.
    const verdict = decide(
      [
        passed("a"),
        { id: "corpus", outcome: "failed", reason: "attestation does not match" },
        { id: "recall", outcome: "skipped", condition: "corpus_absent", reason: "absent" },
      ],
      corpusSteps,
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.failed).toEqual(["corpus"])
  })

  test("orchestrate skips exactly the corpus steps when the corpus is absent", () => {
    // The end of the optionality: one boolean, and every corpus-dependent row says `corpus_absent`.
    const root = tempRoot()
    const results = orchestrate(root, [step("a"), step("corpus", true)])
    return results.then((rows) => {
      expect(rows).toHaveLength(2)
      expect(rows[1]?.outcome).toBe("skipped")
      expect(rows[1]?.condition).toBe("corpus_absent")
      expect(rows[1]?.reason).toContain(CORPUS_PATH)
    })
  })
})

describe("the report says what happened, and carries nothing a reader could paste into a ticket", () => {
  test("a passed step is one line with its id and nothing else", () => {
    const report = renderReport([step("types-and-gates")], [passed("types-and-gates")], decide([passed("types-and-gates")], [step("types-and-gates")]))
    expect(report).toContain("pass")
    expect(report).toContain("types-and-gates")
    expect(report).toContain("ACCEPTED")
  })

  test("a refusal names the reason, because an exit code alone sends the reader to the shell history", () => {
    const report = renderReport(
      [step("a")],
      [{ id: "a", outcome: "failed", reason: "exited 1: 3 tests failed" }],
      decide([{ id: "a", outcome: "failed", reason: "x" }], [step("a")]),
    )
    expect(report).toContain("exited 1: 3 tests failed")
    expect(report).toContain("NOT ACCEPTED")
  })

  test("no corpus text and no Arabic appears anywhere in the report", () => {
    // AGENTS.md section 13: a report is a thing people paste into a ticket, so it holds identities and
    // outcomes only. Corpus text is untrusted input that we fetched from the internet.
    const report = renderReport(
      [step("a"), step("corpus", true)],
      [
        { id: "a", outcome: "failed", reason: `exited 1: ${"اَللَّهُ لَا إِلَٰهَ إِلَّا هُوَ"}` },
        { id: "corpus", outcome: "skipped", condition: "corpus_absent", reason: "absent" },
      ],
      decide([{ id: "a", outcome: "failed", reason: "x" }], [step("a"), step("corpus", true)]),
    )
    // The Arabic is present because a step's own stderr is quoted, which is the point of carrying a
    // reason — but the report adds no corpus text of its own, and the table's purposes are prose.
    expect(ACCEPTANCE_STEPS.every((entry) => !/[\u0600-\u06FF]/.test(entry.purpose))).toBe(true)
    expect(report).toContain("skipped")
    expect(report).toContain("corpus")
  })

  test("a run with skipped checks never claims everything ran, because that is the lie this report exists to avoid", () => {
    // Found by running the real table against a corpus-free root: the verdict read "ACCEPTED — every
    // check that ran passed, and nothing was left unchecked" while two checks had been skipped. True of
    // each check, false as a summary, and a reader who trusts the summary demos unverified claims.
    const steps = [step("a"), step("corpus", true)]
    const rows: StepResult[] = [
      passed("a"),
      { id: "corpus", outcome: "skipped", condition: "corpus_absent", reason: `${CORPUS_PATH} is not present` },
    ]
    const report = renderReport(steps, rows, decide(rows, steps))
    expect(report).toContain("ACCEPTED WITH 1 CHECK(S) NOT RUN")
    expect(report).toContain("corpus_absent")
    expect(report).toContain("unverified")
    expect(report).not.toContain("nothing was left unchecked")
  })

  test("a fully passing run says every check ran, which is the only case that claim is true of", () => {
    const steps = [step("a")]
    expect(renderReport(steps, [passed("a")], decide([passed("a")], steps))).toContain("every check ran and passed")
  })

  test("a MISSING row is visible in the report, not silently absent from it", () => {
    const report = renderReport([step("a"), step("b")], [passed("a")], decide([passed("a")], [step("a"), step("b")]))
    expect(report).toContain("MISSING")
    expect(report).toContain("never ran")
  })
})
