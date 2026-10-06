/**
 * `bun run accept:customer` — the one command that answers "can this be shown to the customer today?"
 *
 * ## What this is, and why it is a step table and not a script
 *
 * The acceptance question is not a single computation. It is four independent checks — does the
 * repository build, does the verifier still refuse fabrications, do the documentation claims match the
 * artefacts, is the corpus attested — and the honest answer is *per check*, because "everything passed"
 * and "three passed and the corpus is missing" are different facts and a customer demo treats them
 * differently.
 *
 * So the plan is data (`ACCEPTANCE_STEPS`), the decision over it is a pure function (`decide`), and only
 * `main` touches the filesystem. A step is a name and an argv, never a closure — a table can be printed,
 * diffed, and asserted against, and a closure cannot.
 *
 * ## Why it runs in NON-RECORD mode, always
 *
 * Every measurement in this repository has a record mode that rewrites a committed artefact. This
 * command never passes one. An acceptance run is something a person does on a Tuesday to decide whether
 * to demo, and if it could rewrite `vs-search.json` or an eval set, then running it would be a way of
 * *changing* the evidence rather than checking it. The acceptance command is a read-only gate, and the
 * only way it can fail is by refusing.
 *
 * ## Why the corpus is optional
 *
 * A clean clone has no `data/corpus.db`, and `bun run ingest` is a deliberate operator action rather
 * than something a gate does on the caller's behalf. Refusing to accept because of a missing corpus
 * would make the command useless on the machine most likely to run it. Instead the corpus steps report
 * `corpus_absent` and the decision distinguishes *"no corpus, so those two checks did not run"* from
 * *"the corpus is there and its attestation does not match"*. The second is a failure; the first is a
 * stated absence (AGENTS.md section 16).
 *
 * ## Why there is no network and no key here
 *
 * Nothing in this file reads an API key, opens a socket, or reads a clock into a decision. The provider
 * is exercised by the CLI in its own suites; a customer-acceptance command that needed a key would fail
 * on the machine that has no key and call that a product failure. Keys belong to the provider boundary,
 * not to a gate.
 *
 * ## The one thing this command must never do
 *
 * Report success on the strength of steps it did not run. `decide` takes the results it was given and
 * refuses to treat a missing result as a passing one, which is the same reasoning as
 * `recallRegression` refusing to read an absent baseline key as "no regression".
 */

import { existsSync, readFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { isOk, type DegradationCondition } from "@mizan/core"
import { BENCHMARK_ARTEFACT, COVERAGE_SET, requireRepositoryRoot, servedCollections } from "@mizan/gate"
import { figuresFrom, renderFigures, type Evidence, type PublishedFigures } from "./acceptance/figures.ts"
import { scrubbedEnv } from "./acceptance/child-env.ts"
import { SURFACES, conditionIn, surfaceStepId, type Surface } from "./acceptance/surface-state.ts"

/** The corpus this command checks for. Absent on a clean clone, and that is a stated state, not a failure. */
export const CORPUS_PATH = "data/corpus.db"

/**
 * Wall-clock budget for one step, unless the step declares a different one.
 *
 * ## Why a minute
 *
 * A hung step is not a verdict, so the budget has to be short enough that "hung" is distinguishable from
 * "slow" by the time an operator stops watching. The previous budget was ten minutes for *every* step, and
 * that is the same defect as an unbounded one: it cannot fail in a time a person will wait for, so a step
 * that wedges consumes the whole rehearsal before anything says which one. Sixty seconds is above every
 * step measured in this repository except the two with declared budgets below — `bun run check:docs` at
 * 1.2 s, the two surface checks at 1.3 s, `ingest:check` at 0.7 s, the fabrication eval at 1.0 s and
 * `ci:corpus` at 2.9 s — so it separates "hung" from "slow" without endangering a step that is merely
 * cold.
 *
 * ## Why two steps carry their own budget
 *
 * An override is not a licence; each one names a measured reason, because a blanket override is exactly
 * what this constant just stopped being.
 */
export const STEP_TIMEOUT_MS = 60_000

/**
 * `bun run ci` typechecks thirteen packages, runs every suite in the tree and then runs the seven gates.
 * Measured 217 s warm on the development machine, so a sixty-second budget would fail a step that works,
 * and a ten-minute blanket budget would let a wedged typecheck hold the rehearsal for as long as a person
 * would sit and watch it. Nine minutes is the CI job's own `timeout-minutes` for the same command, so the
 * step budget and the pipeline budget cannot disagree about how long this is allowed to take.
 */
export const FULL_CI_TIMEOUT_MS = 900_000

/**
 * `eval:suggestions --check` reads every record in the published snapshot at three recall floors. Measured
 * 56.1 s warm — within four seconds of the default budget, which is a coin toss on a cold runner rather
 * than a budget. Five minutes is the headroom a page-cold snapshot needs; it is still five times shorter
 * than the value this check used to run under.
 */
export const RECALL_TIMEOUT_MS = 300_000

/** How much of a step's stdout the report may echo. Enough for a state name, not enough for a transcript. */
const OBSERVED_CAP = 200

/** What one step is, declared as data. See the file header for why this is not a closure. */
export type AcceptanceStep = {
  /** Stable identifier, printed in the report and asserted in tests. Never localised, never reworded. */
  readonly id: string
  /** What the step establishes, in the reader's words. Carries no number that could drift. */
  readonly purpose: string
  /** The command and its arguments, run from the repository root unless `workdir` says otherwise. */
  readonly argv: readonly string[]
  /** Package-relative directory to run in, for the steps whose tool must not run at the root (§8). */
  readonly workdir?: string
  /**
   * Wall-clock budget, when this step genuinely needs longer than `STEP_TIMEOUT_MS`.
   *
   * Optional on purpose. A step that does not declare one gets the default, so the table cannot grow a
   * silent ten-minute step by forgetting a field, and a step that does declare one has to justify it in
   * the constant's own comment.
   */
  readonly timeoutMs?: number
  /** Whether this step needs `data/corpus.db`. A step that does is skipped, not failed, when it is absent. */
  readonly needsCorpus: boolean
  /** The degradation reported when this step is skipped for want of a corpus. */
  readonly whenCorpusAbsent: DegradationCondition
}

/**
 * The four checks, in the order a reader should hear them.
 *
 * Order is the report's order, and it is deliberate: the build comes first because a failing build makes
 * every later number meaningless, and the corpus-independent checks precede the corpus-dependent ones so
 * that a clean clone still produces a useful report rather than two rows of "skipped".
 */
export const ACCEPTANCE_STEPS: readonly AcceptanceStep[] = [
  {
    id: "types-and-gates",
    purpose: "the whole repository typechecks and every structural gate passes",
    argv: ["bun", "run", "ci"],
    timeoutMs: FULL_CI_TIMEOUT_MS,
    needsCorpus: false,
    whenCorpusAbsent: "unmeasured",
  },
  {
    id: "verifier-refuses-fabrications",
    purpose: "the verifier still rejects every adjudicated fabrication, and only those",
    // Run from the package directory, not the repository root: AGENTS.md section 8 is explicit that
    // `bun test` at the root globs every package, silently skips the ones that fail to load, and can
    // report green while collecting nothing. A gate that inherits that blind spot is not a gate.
    argv: ["bun", "test", "./test/eval.test.ts"],
    workdir: "apps/cli",
    needsCorpus: false,
    whenCorpusAbsent: "unmeasured",
  },
  {
    id: "docs-claims-match-artefacts",
    purpose: "no document states a figure or a count the committed artefacts contradict",
    argv: ["bun", "run", "check:docs"],
    needsCorpus: false,
    whenCorpusAbsent: "unmeasured",
  },
  {
    id: surfaceStepId("cli"),
    purpose: "the CLI on a checkout with no corpus names a shared degradation state and refuses",
    // Story 7's clean-clone promise, checked per surface, because a check that covered both at once could
    // not say which one degraded. The step passes when the script exits 0, which it does when the surface
    // named `corpus_absent` — so a green row here means the CLI said which state it was in, not that it
    // served an answer. The state itself is printed beside the row.
    argv: ["bun", "run", "acceptance:surface-state", "--surface", "cli"],
    needsCorpus: false,
    whenCorpusAbsent: "unmeasured",
  },
  {
    id: surfaceStepId("mcp"),
    purpose: "the MCP server on a checkout with no corpus names a shared degradation state and refuses",
    argv: ["bun", "run", "acceptance:surface-state", "--surface", "mcp"],
    needsCorpus: false,
    whenCorpusAbsent: "unmeasured",
  },
  {
    id: "corpus-attested",
    purpose: "the corpus this repository would search is present and matches its committed attestation",
    argv: ["bun", "run", "ingest:check"],
    needsCorpus: true,
    whenCorpusAbsent: "corpus_absent",
  },
  {
    id: "published-benchmark-run",
    purpose: "the committed corpus still reproduces the published benchmark report byte for byte",
    // `ci:corpus` is the opt-in lane `ci-lanes.ts` names: the benchmark's own correctness test has
    // to measure the real corpus, and the corpus is not on a clean clone, so the test cannot live in
    // `bun run ci` — which this command's first step runs. It sits here rather than nowhere so the
    // exclusion is visible in the one table an operator reads before a demo.
    argv: ["bun", "run", "ci:corpus"],
    needsCorpus: true,
    whenCorpusAbsent: "corpus_absent",
  },
  {
    id: "nearest-quote-recall",
    purpose: "the search still finds every record it was measured against",
    // `--check`, and this is the whole reason that flag exists (CR-2). The bare harness command
    // *measures* and prints: it wrote nothing, compared nothing, and exited 0 — so an acceptance run
    // that pointed at it asserted "every record still found" on the strength of a run that never looked.
    // That is a green check meaning nothing, which is the one outcome a customer-deal gate must not
    // produce. `--check` reads the recorded baseline, refuses a regression or a changed case set, and
    // has no path to the writer; a bare run cannot move the floor either, so pointing the gate at it
    // was harmless to the artefact and useless as evidence.
    argv: ["bun", "run", "eval:suggestions", "--check"],
    timeoutMs: RECALL_TIMEOUT_MS,
    needsCorpus: true,
    whenCorpusAbsent: "corpus_absent",
  },
]

/** How one step ended. `skipped` is a real outcome and is never reported as `passed`. */
export type StepOutcome = "passed" | "failed" | "skipped" | "timedOut"

/** One row of the report. */
export type StepResult = {
  readonly id: string
  readonly outcome: StepOutcome
  /** Why it was skipped or refused, when there is something to say. Never a number that could drift. */
  readonly reason: string
  /** Present only for `skipped`, and only because a skipped step needs an honest label. */
  readonly condition?: DegradationCondition
  /**
   * What a passing step *named*, when it named a value.
   *
   * "pass" is the weakest row in a report: it says a command exited 0 and nothing about what the command
   * found. A check that has an answer — the CLI said `corpus_absent` — should print it, or the reader is
   * left to take the number in the table below on faith, which is the thing this command exists to avoid.
   * Read from stdout, capped at `OBSERVED_CAP`, and never used in the decision: only the outcome is.
   */
  readonly observed?: string
}

/** The overall verdict. `accepted` requires every step to have passed. */
export type AcceptanceDecision = {
  readonly accepted: boolean
  /** Steps that ran and did not pass. Empty for an accepted run. */
  readonly failed: readonly string[]
  /** Steps that did not run, with the degradation each reported. */
  readonly skipped: readonly { readonly id: string; readonly condition: DegradationCondition }[]
}

/**
 * The decision, as a pure function of the results.
 *
 * ## Why an absent result is not a pass
 *
 * `ACCEPTANCE_STEPS.length` is the denominator, and a step with no result contributes nothing to the
 * numerator. A caller that forgets a step therefore gets `accepted: false` rather than a clean run — the
 * same fail-closed reasoning as `recallRegression`, and for the same reason: "I did not check" and "it
 * passed" must never be the same answer in a product whose claim is that its evidence was computed.
 *
 * ## Why a skipped corpus step does not fail the run
 *
 * A clean clone has no corpus and `ingest` is an operator's decision. The run reports `corpus_absent` and
 * says the two dependent checks did not run. Refusing acceptance outright would mean the command only
 * works on the machine that already has the data, and the operator's honest answer — "everything that can
 * be checked here was checked, and the corpus is not here" — is more useful than a red exit.
 */
export const decide = (
  results: readonly StepResult[],
  steps: readonly AcceptanceStep[] = ACCEPTANCE_STEPS,
): AcceptanceDecision => {
  const byId = new Map(results.map((result) => [result.id, result]))
  // A skipped step is NOT a failure. It is neither passed nor failed, which is why it gets its own
  // outcome and its own column in the decision: collapsing it into `failed` would make a clean clone look
  // broken, and collapsing it into `passed` would make a demo claim something nobody checked.
  const failed = steps.filter((step) => {
    const result = byId.get(step.id)
    return result !== undefined && (result.outcome === "failed" || result.outcome === "timedOut")
  }).map((step) => step.id)
  const missing = steps.filter((step) => !byId.has(step.id)).map((step) => step.id)
  const skipped = results.filter((result) => result.outcome === "skipped" && result.condition !== undefined)
    .map((result) => ({ id: result.id, condition: result.condition as DegradationCondition }))
  return {
    accepted: failed.length === 0 && missing.length === 0,
    failed: [...failed, ...missing],
    skipped,
  }
}

/**
 * Everything the report prints that is not a step outcome.
 *
 * ## Why the figures are a parameter and not something `renderReport` reads
 *
 * Because a report that fetches its own evidence is a report whose output depends on when it ran, and the
 * two properties this repository cares about — every number is derived, and every derivation is testable —
 * both die the moment the renderer opens a file. So the caller reads (or, in a test, hands over) the
 * evidence, and the renderer is a pure function of it. It is a required parameter for the same reason the
 * step table is the denominator: a disclosure that a caller can leave out is a disclosure that gets left
 * out, and this one was left out for a sprint before it was written.
 */
export type Disclosure = {
  readonly figures: PublishedFigures
  /** What each shipped surface named on a checkout with no corpus, keyed by its step id. */
  readonly surfaceStates: ReadonlyMap<string, string>
}

/**
 * The report as the operator reads it: one line per step, the figures, the surface states, then the verdict.
 *
 * A line names the step and its outcome, and nothing else. No corpus text, no claim text, no duration —
 * AGENTS.md section 13 applies to an acceptance report too, because a report is a thing people paste
 * into a ticket.
 */
export const renderReport = (
  steps: readonly AcceptanceStep[],
  results: readonly StepResult[],
  decision: AcceptanceDecision,
  disclosure: Disclosure,
): string => {
  const byId = new Map(results.map((result) => [result.id, result]))
  const lines = steps.map((step) => {
    const result = byId.get(step.id)
    if (result === undefined) return `  MISSING  ${step.id} — this check never ran`
    if (result.outcome === "passed") {
      const named = disclosure.surfaceStates.get(step.id)
      return `  pass     ${step.id}${named === undefined ? "" : ` — ${named}`}`
    }
    if (result.outcome === "skipped") return `  skipped  ${step.id} — ${result.reason}`
    return `  ${result.outcome.padEnd(7)} ${step.id} — ${result.reason}`
  })
  // Three distinct verdicts, never one generic pass. "ACCEPTED, everything passed" would be a lie on a
  // clean clone: two checks did not run, and a reader who is told the run was accepted will demo the
  // corpus claims anyway. The skipped cases are named here rather than only on stderr, because stdout is
  // the part people paste (AGENTS.md section 16 — every failure has one correct surface).
  const verdict = !decision.accepted
    ? `NOT ACCEPTED — ${decision.failed.length} of ${steps.length} checks did not pass`
    : decision.skipped.length === 0
      ? "ACCEPTED — every check ran and passed"
      : `ACCEPTED WITH ${decision.skipped.length} CHECK(S) NOT RUN — ${decision.skipped.map((entry) => `${entry.id} (${entry.condition})`).join(", ")}. Everything that could be checked here was checked; these did not run and their claims are unverified.`
  return ["customer acceptance", ...lines, "", ...renderFigures(disclosure.figures), "", verdict].join("\n")
}

/** How a step's process actually ran. Injected so the orchestrator can be tested without a corpus. */
export type Spawned = { readonly outcome: StepOutcome; readonly reason: string; readonly observed: string }

/** Runs one command, turning a non-zero exit and a timeout into values rather than exceptions. */
export const runStep = (argv: readonly string[], cwd: string, timeoutMs: number = STEP_TIMEOUT_MS): Promise<Spawned> =>
  new Promise((resolve) => {
    // `env` is passed explicitly, because `spawn` inherits `process.env` when it is omitted — and an
    // inherited `MIZAN_CORPUS_PATH` or `MIZAN_LLM_API_KEY` would make this report describe the
    // developer's machine instead of the checkout under test. See `acceptance/child-env.ts`.
    const child = spawn(argv[0] as string, argv.slice(1), { cwd, env: scrubbedEnv(process.env), stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    // stdout is kept only for a step that passed, only as its LAST non-empty line, and only up to the cap:
    // a passing check may *name* something worth reporting, and this is the last place that happens without
    // the command having to be told it is being watched. A failing step's transcript still goes through
    // `stderr` below, because a refusal is useless without the line that refused it.
    let stdout = ""
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString()
      stderr = `${stderr}${text}`.trim().split("\n").slice(-3).join(" ")
    })
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = (typeof chunk === "string" ? chunk : chunk.toString()).trim()
      const last = text.split("\n").filter((line) => line.trim().length > 0).slice(-1)[0]
      if (last !== undefined) stdout = last.trim().slice(0, OBSERVED_CAP)
    })
    const timer = setTimeout(() => {
      child.kill()
      resolve({ outcome: "timedOut", reason: `no result within ${timeoutMs}ms`, observed: "" })
    }, timeoutMs)
    child.on("error", (cause: Error) => {
      clearTimeout(timer)
      resolve({ outcome: "failed", reason: `could not start: ${cause.message}`, observed: "" })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ outcome: "passed", reason: "", observed: stdout })
        return
      }
      resolve({ outcome: "failed", reason: `exited ${code ?? "with no code"}${stderr === "" ? "" : `: ${stderr}`}`, observed: "" })
    })
  })

/**
 * Run every step, skipping the corpus-dependent ones when there is no corpus.
 *
 * The corpus check is a plain `existsSync`, and that is the whole of the optionality: one boolean decides
 * whether two steps report `corpus_absent` or run. It is deliberately not an attestation read here — the
 * attestation is what the corpus step itself checks, and reading it twice would give the answer from two
 * places (AGENTS.md section 17).
 */
export const orchestrate = async (
  root: string,
  steps: readonly AcceptanceStep[] = ACCEPTANCE_STEPS,
): Promise<readonly StepResult[]> => {
  const corpusPresent = existsSync(`${root}/${CORPUS_PATH}`)
  const results: StepResult[] = []
  for (const step of steps) {
    if (step.needsCorpus && !corpusPresent) {
      results.push({
        id: step.id,
        outcome: "skipped",
        condition: step.whenCorpusAbsent,
        reason: `${CORPUS_PATH} is not present, so this check did not run`,
      })
      continue
    }
    // A step that runs a test tool declares where it runs from, because AGENTS.md section 8 makes the
    // repository root an invalid cwd for one: `bun test` there globs every package, silently skips the
    // ones that fail to load, and can report green having collected nothing.
    const cwd = step.workdir === undefined ? root : `${root}/${step.workdir}`
    const spawned = await runStep(step.argv, cwd, step.timeoutMs ?? STEP_TIMEOUT_MS)
    results.push({
      id: step.id,
      outcome: spawned.outcome,
      reason: spawned.reason,
      ...(spawned.outcome === "passed" && spawned.observed !== "" ? { observed: spawned.observed } : {}),
    })
  }
  return results
}

/**
 * The committed evidence, read once, for the figures block.
 *
 * Three committed files and nothing else: the attestation for what is served, the fabrication set for what
 * was tested, and the measurement artefact for what came out. No corpus, no database, no network — which is
 * what lets the disclosure survive the clean clone this command is most likely to be run on.
 */
export const evidenceFrom = (root: string): Evidence => {
  const attestation = servedCollections(root)
  const read = (relative: string): string | null => {
    try {
      return readFileSync(`${root}/${relative}`, "utf8")
    } catch {
      // Absent and unreadable reach the same `null` here, and the disclosure prints `unmeasured` for both.
      // The distinction that matters — an attestation that exists and cannot answer — is carried by
      // `servedCollections().usable`, which asks for the file's presence rather than inferring it.
      return null
    }
  }
  return {
    served: attestation.counts,
    servedNames: attestation.served,
    servedUsable: attestation.usable,
    redteam: read(COVERAGE_SET),
    benchmark: read(BENCHMARK_ARTEFACT),
  }
}

/**
 * What each surface row shows, decoded from the check's own output.
 *
 * Decoded rather than echoed: the row prints a word from the shared vocabulary or it prints that no word
 * was named. A row that pasted whatever the subprocess wrote would put an integrator's scraper and this
 * report on the same footing as the subprocess, and this repository's whole claim is that the two agree
 * because something checked it.
 */
export const describeSurfaceState = (result: StepResult | undefined): string => {
  if (result === undefined) return "no state: this check never ran"
  if (result.outcome !== "passed") return `no shared state named — ${result.outcome} (${result.reason})`
  const named = conditionIn(result.observed ?? "")
  if (named === null) return "no shared state named, although the check passed"
  return `${named} on a checkout with no corpus`
}

/** One row's state per surface, keyed by the step that established it. */
export const surfaceStatesFrom = (results: readonly StepResult[]): ReadonlyMap<string, string> => {
  const byId = new Map(results.map((result) => [result.id, result]))
  return new Map(SURFACES.map((surface: Surface) => [surfaceStepId(surface), describeSurfaceState(byId.get(surfaceStepId(surface)))]))
}

/**
 * The disclosure for a completed run: the figures, and what each surface said.
 *
 * One function so `main` cannot print the figures from one checkout and the surface states from another.
 */
export const disclosureFrom = (root: string, results: readonly StepResult[]): Disclosure => ({
  figures: figuresFrom(evidenceFrom(root)),
  surfaceStates: surfaceStatesFrom(results),
})

/**
 * The exit codes, in one place.
 *
 * `0` and `1` are the verdict a caller acts on: the run completed and either every check that ran passed,
 * or at least one did not. `2` is a different fact — the rehearsal never started, so *no* verdict exists.
 * Collapsing that into `1` is the fail-open move AGENTS.md section 3 forbids read from the other side: a
 * script that reported "a check failed" when in fact it could not find the repository would send an
 * operator to debug the acceptance table for a missing `package.json` one directory up.
 */
export const EXIT_ACCEPTED = 0
export const EXIT_NOT_ACCEPTED = 1
export const EXIT_COULD_NOT_START = 2

/**
 * The process exit code, as a pure function of the decision.
 *
 * Exported so a test can assert the code the operator gets without spawning a second full acceptance
 * run — the mapping "accepted is 0, anything else is 1" is a contract with CI and with the README, and
 * a contract asserted only by reading `main` is a contract nobody tested.
 */
export const exitCodeFor = (decision: AcceptanceDecision): number => (decision.accepted ? EXIT_ACCEPTED : EXIT_NOT_ACCEPTED)

/**
 * Exit 0 accepted, 1 not accepted, 2 could not start. The report is printed either way — a silent red
 * exit helps nobody.
 *
 * `from` is a parameter so a test can drive the startup path without changing the working directory of
 * the test runner: `process.cwd()` is read at the default, not captured at module load, because a module
 * that captured it would resolve the root of whoever imported it rather than of whoever ran it.
 */
export const main = async (from: string = process.cwd()): Promise<number> => {
  const root = requireRepositoryRoot(from)
  if (!isOk(root)) {
    console.error(`accept:customer could not start (exit ${EXIT_COULD_NOT_START}): ${root.error}`)
    return EXIT_COULD_NOT_START
  }
  const results = await orchestrate(root.value)
  const decision = decide(results)
  console.log(renderReport(ACCEPTANCE_STEPS, results, decision, disclosureFrom(root.value, results)))
  if (!decision.accepted) {
    console.error(`\n${decision.skipped.length} step(s) did not run: ${decision.skipped.map((entry) => `${entry.id} (${entry.condition})`).join(", ")}`)
  }
  return exitCodeFor(decision)
}

if (import.meta.main) process.exit(await main())

export * as AcceptCustomer from "./accept-customer.ts"
