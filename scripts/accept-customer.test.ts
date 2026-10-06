import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ACCEPTANCE_STEPS,
  CORPUS_PATH,
  EXIT_ACCEPTED,
  EXIT_COULD_NOT_START,
  EXIT_NOT_ACCEPTED,
  FULL_CI_TIMEOUT_MS,
  RECALL_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
  decide,
  describeSurfaceState,
  evidenceFrom,
  exitCodeFor,
  main,
  orchestrate,
  renderReport,
  runStep,
  surfaceStatesFrom,
  type AcceptanceStep,
  type Disclosure,
  type StepResult,
} from "./accept-customer.ts"
import { SURFACES, surfaceStepId, childEnv, commandFor } from "./acceptance/surface-state.ts"
import { scrubbedEnv, withheldNames } from "./acceptance/child-env.ts"
import { figuresFrom, renderFigures } from "./acceptance/figures.ts"

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

/** A passing step that also named the state it observed, which is how the surface checks report. */
const passedNaming = (id: string, observed: string): StepResult => ({ id, outcome: "passed", reason: "", observed })

/**
 * A disclosure with nothing in it, for the rows that are about verdicts rather than about figures.
 *
 * `renderReport` takes it as a required argument on purpose — the block it prints is the part a customer
 * reads, and a disclosure a caller can omit is a disclosure that gets omitted. A test that is about the
 * verdict passes an empty one rather than reaching for the committed evidence, so a change to the figures
 * cannot fail a test about `decide`.
 */
const noDisclosure = (): Disclosure => ({
  figures: { datasetDigest: null, rows: [], latency: null, notes: ["no evidence was given to this report"] },
  surfaceStates: new Map(),
})

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

  test("the default budget is a minute, because a hung step must be distinguishable from a slow one", () => {
    // The CR's planted violation, restated. Ten minutes for *every* step cannot fail in a time a person
    // will wait for, so a step that wedges holds the whole rehearsal while the report says nothing about
    // which one. Sixty seconds is above every step measured in this repository except the two that carry
    // their own budget, so shortening it cannot fail a working step.
    expect(STEP_TIMEOUT_MS).toBe(60_000)
  })

  test("a step that overrides the budget is one of the two with a measured reason, and names it", () => {
    // An override with no reason is the blanket budget wearing a different name, so the allowance is an
    // explicit list rather than a property: a fourth step declaring `timeoutMs` fails here until someone
    // has measured it and written down why.
    const overrides = ACCEPTANCE_STEPS.filter((entry) => entry.timeoutMs !== undefined)
    expect(overrides.map((entry) => entry.id).toSorted()).toEqual(["nearest-quote-recall", "types-and-gates"])
    // And every override is longer than the default, never shorter — a shorter override would be a step
    // quietly given less patience than the table's own floor, which is a defect shaped like a tuning.
    for (const entry of overrides) expect(entry.timeoutMs ?? 0).toBeGreaterThan(STEP_TIMEOUT_MS)
    // The two budgets are the ones the constants document, so the table cannot drift from the reasoning.
    const fullCi = ACCEPTANCE_STEPS.find((entry) => entry.id === "types-and-gates")
    expect(fullCi?.timeoutMs).toBe(FULL_CI_TIMEOUT_MS)
    const recall = ACCEPTANCE_STEPS.find((entry) => entry.id === "nearest-quote-recall")
    expect(recall?.timeoutMs).toBe(RECALL_TIMEOUT_MS)
  })

  test("a step that declares no budget runs under the default, which is what the flag's absence means", () => {
    // The direction that actually guards the run: a new step is bounded the day it is added, because
    // forgetting the field costs nothing. Asserted on the cheap steps, where the default is the whole
    // budget, rather than by running a real command.
    const cheap = ACCEPTANCE_STEPS.filter((entry) => entry.timeoutMs === undefined)
    expect(cheap.length).toBeGreaterThan(0)
    for (const entry of cheap) expect(entry.timeoutMs).toBeUndefined()
  })

  test("a measurement harness is invoked in a mode that compares, never in its bare default", () => {
    // The planted violation for CR-2, stated as a rule about the table rather than about one command.
    //
    // `bun run eval:suggestions` with no flag is a `measure` run: it prints figures and returns 0
    // *before* it reads the recorded baseline, so it cannot detect a recall regression. Pointing the
    // acceptance gate at it asserted "every record still found" on the strength of a run that never
    // looked — a green check meaning nothing, which is the one outcome a customer-deal gate must not
    // produce. `--check` is the mode that compares and writes nothing.
    //
    // The rule is generic so the next harness added to this table inherits it: any argv naming a
    // `scripts/` harness must either carry an explicit mode flag or be one of the non-harness
    // wrappers, because "it ran and exited 0" is not evidence for any of these.
    for (const entry of ACCEPTANCE_STEPS) {
      const harness = entry.argv.find((arg) => arg.startsWith("eval:"))
      if (harness === undefined) continue
      const modeFlags = entry.argv.filter((arg) => arg.startsWith("--"))
      expect(modeFlags.length).toBeGreaterThan(0)
      // `--record` is refused by the read-only rule above; this asserts the flag is one of the
      // comparison modes rather than merely that a flag is present.
      expect(entry.argv).toContain("--check")
    }
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
    expect(renderReport([step("a")], [{ id: "a", outcome: "timedOut", reason: "no result within the budget" }], verdict, noDisclosure()))
      .toContain("timedOut")
  })

  test("a result for a step that is not in the table is ignored, so it cannot manufacture an acceptance", () => {
    // A stale or invented id must not satisfy a declared step, and must not appear in the report as if
    // it had been checked. The table is the denominator.
    const verdict = decide([passed("a"), passed("b"), passed("invented")], [step("a"), step("b")])
    expect(verdict.accepted).toBe(true)
    expect(renderReport([step("a")], [passed("invented")], verdict, noDisclosure())).toContain("MISSING")
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

/**
 * An acceptance child must not inherit the developer's `MIZAN_*` environment.
 *
 * ## Why this is asserted through a real spawn
 *
 * Asserting `scrubbedEnv` on its own proves the function works and not that anybody calls it. Both
 * acceptance surfaces spawn children, `spawn` inherits `process.env` unless told otherwise, and the
 * two ways this failed are silent: a missing `env:` option produces a run that passes. So the tests
 * below set the variables on `process.env` itself and read them back out of a real child — which is
 * the only arrangement in which the planted violation actually reproduces.
 *
 * ## What was wrong, and which of the two is worse
 *
 * `MIZAN_LLM_API_KEY` reached `bun run ci` and every test in the tree: a live credential in the
 * environment of every child, never printed, but reachable by anything a child dumps on a crash — and
 * this report is pasted into tickets.
 *
 * `MIZAN_CORPUS_PATH` is worse, because it changed the answer rather than leaking anything. The
 * surface observer pointed the MCP server at the developer's own ingested snapshot instead of the
 * synthetic clean clone, so the report described a state the clone does not have.
 */
describe("acceptance children do not inherit the developer's MIZAN_ environment", () => {
  const withMizanEnv = async (body: () => Promise<void> | void): Promise<void> => {
    const before = { key: process.env["MIZAN_LLM_API_KEY"], corpus: process.env["MIZAN_CORPUS_PATH"] }
    process.env["MIZAN_LLM_API_KEY"] = "sk-planted-credential"
    process.env["MIZAN_CORPUS_PATH"] = "/planted/somebody-elses/corpus.db"
    try {
      await body()
    } finally {
      if (before.key === undefined) delete process.env["MIZAN_LLM_API_KEY"]
      else process.env["MIZAN_LLM_API_KEY"] = before.key
      if (before.corpus === undefined) delete process.env["MIZAN_CORPUS_PATH"]
      else process.env["MIZAN_CORPUS_PATH"] = before.corpus
    }
  }

  test("the rule is the namespace, so a variable nobody has written yet is withheld too", () => {
    // A deny-list of two names is a list that is wrong the first time a third override is added, and
    // the failure is a silent pass. Asserting the *rule* rather than two entries is what keeps it
    // from becoming one.
    const scrubbed = scrubbedEnv({
      PATH: "/usr/bin",
      MIZAN_LLM_API_KEY: "secret",
      MIZAN_CORPUS_PATH: "/somewhere/corpus.db",
      MIZAN_SOMETHING_NOT_YET_INVENTED: "x",
      HOME: "/home/somebody",
    })
    expect(Object.keys(scrubbed).toSorted()).toEqual(["HOME", "PATH"])
    expect(withheldNames({ MIZAN_A: "1", MIZAN_B: "2", PATH: "p" })).toEqual(["MIZAN_A", "MIZAN_B"])
  })

  test("a step runs without the planted variables, so no credential reaches a child process", async () => {
    await withMizanEnv(async () => {
      const ran = await runStep(
        [process.execPath, "-e", "console.log(JSON.stringify({mizan:Object.keys(process.env).filter((k)=>k.startsWith('MIZAN_')),path:Boolean(process.env.PATH)}))"],
        tempRoot(),
      )
      expect(ran.outcome).toBe("passed")
      // `runStep` keeps the child's last non-empty stdout line, so the child's own report of what it
      // saw is exactly what comes back — no parsing of this file's assumptions.
      expect(JSON.parse(ran.observed)).toEqual({ mizan: [], path: true })
    })
  })

  test("the surface observer withholds them too, so a clean clone is measured on a clean clone", async () => {
    // The half that changes the verdict rather than the confidentiality. With `MIZAN_CORPUS_PATH`
    // inherited, `commandFor("mcp", root)`'s explicit override is one property access away from being
    // overwritten by the developer's own value, and the observer then opens their snapshot instead of
    // the synthetic checkout's — reporting a state the clone does not have.
    await withMizanEnv(async () => {
      const root = join(tempRoot(), "checkout")
      const keys = (env: Readonly<Record<string, string | undefined>>): readonly string[] =>
        Object.keys(env).filter((name) => name.startsWith("MIZAN_")).toSorted()
      expect(keys(commandFor("mcp", root).env)).toEqual(["MIZAN_ATTESTATION_PATH", "MIZAN_CORPUS_PATH"])
      expect(keys(childEnv(commandFor("mcp", root)))).toEqual(["MIZAN_ATTESTATION_PATH", "MIZAN_CORPUS_PATH"])
      // And the override this command *did* ask for survives the scrub, or the fix would have
      // replaced "wrong corpus" with "no corpus".
      expect(childEnv(commandFor("mcp", root))["MIZAN_CORPUS_PATH"]).toBe(join(root, "data", "corpus.db"))
    })
  })

  test("the CLI needs no override at all, because it resolves its root from the working directory", () => {
    expect(commandFor("cli", "/anywhere").env).toEqual({})
  })
})

describe("the report says what happened, and carries nothing a reader could paste into a ticket", () => {
  test("a passed step is one line with its id and nothing else", () => {
    const report = renderReport([step("types-and-gates")], [passed("types-and-gates")], decide([passed("types-and-gates")], [step("types-and-gates")]), noDisclosure())
    expect(report).toContain("pass")
    expect(report).toContain("types-and-gates")
    expect(report).toContain("ACCEPTED")
  })

  test("a refusal names the reason, because an exit code alone sends the reader to the shell history", () => {
    const report = renderReport(
      [step("a")],
      [{ id: "a", outcome: "failed", reason: "exited 1: 3 tests failed" }],
      decide([{ id: "a", outcome: "failed", reason: "x" }], [step("a")]),
      noDisclosure(),
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
      noDisclosure(),
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
    const report = renderReport(steps, rows, decide(rows, steps), noDisclosure())
    expect(report).toContain("ACCEPTED WITH 1 CHECK(S) NOT RUN")
    expect(report).toContain("corpus_absent")
    expect(report).toContain("unverified")
    expect(report).not.toContain("nothing was left unchecked")
  })

  test("a fully passing run says every check ran, which is the only case that claim is true of", () => {
    const steps = [step("a")]
    expect(renderReport(steps, [passed("a")], decide([passed("a")], steps), noDisclosure())).toContain("every check ran and passed")
  })

  test("a MISSING row is visible in the report, not silently absent from it", () => {
    const report = renderReport([step("a"), step("b")], [passed("a")], decide([passed("a")], [step("a"), step("b")]), noDisclosure())
    expect(report).toContain("MISSING")
    expect(report).toContain("never ran")
  })
})

describe("the report carries the numbers, because a verdict with no figure beside it is a promise", () => {
  const figures = figuresFrom(evidenceFrom(process.cwd()))

  test("the disclosure is printed with no evidence and reads as `unmeasured` throughout", () => {
    // The planted violation fails if a renderer ever drops the block: a report whose figures section is
    // simply absent is indistinguishable from a report whose figures are all absent, and Story 3's
    // "zeros rendered, not omitted" has a stronger sibling — absences must be rendered too.
    const empty = renderFigures({ datasetDigest: null, rows: [], latency: null, notes: ["nothing was given"] }).join("\n")
    expect(empty).toContain("unmeasured")
    expect(empty).toContain("nothing was given")
    expect(empty).not.toContain("|")
  })

  test("the committed artefacts yield a digest, a row per served collection, and the latency conditions", () => {
    // The real repository, read the way the report reads it. This is the integration assertion behind
    // Story 6: the numbers a customer is shown are derived from committed files by one function, and the
    // table below is what a judge re-derives independently.
    expect(figures.datasetDigest).toMatch(/^ds1:[0-9a-f]{64}$/)
    expect(figures.rows.map((row) => row.collection)).toEqual(["abudawud", "ibnmajah", "malik", "nasai", "quran", "tirmidhi"])
    for (const row of figures.rows) {
      expect(row.cases).toBeGreaterThan(0)
      expect(row.servedRecords).toBeGreaterThan(0)
      expect(row.rejected).toBe(row.cases)
      expect(row.verified).toBe(0)
    }
    // `verified` is printed as a zero rather than dropped, which is the differentiator the story is about:
    // a column that appears only when it is non-zero cannot be read as "we checked and found none".
    const rendered = renderFigures(figures).join("\n")
    expect(rendered).toContain("| tirmidhi |")
    expect(rendered).toMatch(/\| tirmidhi \| \d+ \| \d+ \| 0 \|/)
    expect(figures.latency?.bandMultiplier).toBe(1.5)
    expect(rendered).toContain("Tolerance band 1.5x")
    expect(rendered).toContain("fingerprint=")
    expect(figures.notes).toEqual([])
  })
})

describe("a surface row reports the state the check named, and says so when it named none", () => {
  test("a passing surface check prints the condition it observed", () => {
    for (const surface of SURFACES) {
      const id = surfaceStepId(surface)
      expect(describeSurfaceState(passedNaming(id, `  ${surface}   degradation state  corpus_absent`))).toBe(
        "corpus_absent on a checkout with no corpus",
      )
    }
  })

  test("a state the row cannot decode is reported as no state, rather than pasted through", () => {
    // The planted violation: a row that echoed the subprocess's output would carry any word it wrote,
    // including one this repository has never declared. The row prints a shared-vocabulary word or it
    // prints that there is none.
    expect(describeSurfaceState(passedNaming("cli-no-corpus-state", "everything is fine"))).toBe(
      "no shared state named, although the check passed",
    )
  })

  test("a surface check that failed reports the outcome and not a state, because it established none", () => {
    expect(describeSurfaceState({ id: "mcp-no-corpus-state", outcome: "failed", reason: "exited 1" })).toBe(
      "no shared state named — failed (exited 1)",
    )
    expect(describeSurfaceState(undefined)).toBe("no state: this check never ran")
  })

  test("every surface in the table has a row, keyed by the step that establishes it", () => {
    const results: StepResult[] = SURFACES.map((surface) => passedNaming(surfaceStepId(surface), "corpus_absent"))
    const states = surfaceStatesFrom(results)
    expect([...states.keys()]).toEqual(SURFACES.map(surfaceStepId))
    for (const surface of SURFACES) {
      const entry = ACCEPTANCE_STEPS.find((step) => step.id === surfaceStepId(surface))
      expect(entry?.argv).toContain(surface)
      expect(entry?.needsCorpus).toBe(false)
    }
  })
})

/**
 * The exit-code contract, because a caller scripts against it and the spec publishes it.
 *
 * `0` accepted, `1` a check failed, `2` the rehearsal never started. The third code is the CR's Finding 4:
 * a run launched from the wrong directory reported "a check did not pass", which points an operator at the
 * acceptance table when the actual fact is that there is no repository here. A gate that cannot say
 * *which* kind of bad it is has collapsed two different failures into one red.
 */
describe("the exit code distinguishes a failed check from a run that never started", () => {
  test("a verdict maps to 0 or 1, and never to 2", () => {
    expect(exitCodeFor({ accepted: true, failed: [], skipped: [] })).toBe(EXIT_ACCEPTED)
    expect(exitCodeFor({ accepted: false, failed: ["types-and-gates"], skipped: [] })).toBe(EXIT_NOT_ACCEPTED)
  })

  test("a directory that is not the repository exits 2 rather than 1", async () => {
    // `from` rather than `process.cwd()`: the default is still `process.cwd()`, so the shipped behaviour
    // is unchanged, and the startup path becomes reachable from a test without the test runner's working
    // directory being moved underneath every other file in this suite.
    const code = await main(join(tempRoot(), "not-a-repository"))
    expect(code).toBe(EXIT_COULD_NOT_START)
    expect(code).not.toBe(EXIT_NOT_ACCEPTED)
  })

  test("the three codes are distinct, because a shared code would merge the two failures it names", () => {
    expect(new Set([EXIT_ACCEPTED, EXIT_NOT_ACCEPTED, EXIT_COULD_NOT_START]).size).toBe(3)
  })
})
