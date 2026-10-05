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

import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { isOk, type DegradationCondition } from "@mizan/core"
import { requireRepositoryRoot } from "@mizan/gate"

/** The corpus this command checks for. Absent on a clean clone, and that is a stated state, not a failure. */
export const CORPUS_PATH = "data/corpus.db"

/** Wall-clock budget for one step. Generous, because a step that times out is not a verdict. */
export const STEP_TIMEOUT_MS = 600_000

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
    id: "corpus-attested",
    purpose: "the corpus this repository would search is present and matches its committed attestation",
    argv: ["bun", "run", "ingest:check"],
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
 * The report as the operator reads it: one line per step, then the verdict.
 *
 * A line names the step and its outcome, and nothing else. No corpus text, no claim text, no duration —
 * AGENTS.md section 13 applies to an acceptance report too, because a report is a thing people paste
 * into a ticket.
 */
export const renderReport = (
  steps: readonly AcceptanceStep[],
  results: readonly StepResult[],
  decision: AcceptanceDecision,
): string => {
  const byId = new Map(results.map((result) => [result.id, result]))
  const lines = steps.map((step) => {
    const result = byId.get(step.id)
    if (result === undefined) return `  MISSING  ${step.id} — this check never ran`
    if (result.outcome === "passed") return `  pass     ${step.id}`
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
  return ["customer acceptance", ...lines, "", verdict].join("\n")
}

/** How a step's process actually ran. Injected so the orchestrator can be tested without a corpus. */
export type Spawned = { readonly outcome: StepOutcome; readonly reason: string }

/** Runs one command, turning a non-zero exit and a timeout into values rather than exceptions. */
export const runStep = (argv: readonly string[], cwd: string): Promise<Spawned> =>
  new Promise((resolve) => {
    const child = spawn(argv[0] as string, argv.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer | string) => {
      // Kept only as the LAST lines: a step's output can be long, and the report carries a reason, not a
      // transcript. A refusal is useless without the line that refused it.
      const text = typeof chunk === "string" ? chunk : chunk.toString()
      stderr = `${stderr}${text}`.trim().split("\n").slice(-3).join(" ")
    })
    const timer = setTimeout(() => {
      child.kill()
      resolve({ outcome: "timedOut", reason: `no result within ${STEP_TIMEOUT_MS}ms` })
    }, STEP_TIMEOUT_MS)
    child.on("error", (cause: Error) => {
      clearTimeout(timer)
      resolve({ outcome: "failed", reason: `could not start: ${cause.message}` })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ outcome: "passed", reason: "" })
        return
      }
      resolve({ outcome: "failed", reason: `exited ${code ?? "with no code"}${stderr === "" ? "" : `: ${stderr}`}` })
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
    const spawned = await runStep(step.argv, cwd)
    results.push({ id: step.id, outcome: spawned.outcome, reason: spawned.reason })
  }
  return results
}

/** Exit 0 accepted, 1 not accepted. The report is printed either way — a silent red exit helps nobody. */
const main = async (): Promise<number> => {
  const root = requireRepositoryRoot(process.cwd())
  if (!isOk(root)) {
    console.error(`FAIL ${root.error}`)
    return 1
  }
  const results = await orchestrate(root.value)
  const decision = decide(results)
  console.log(renderReport(ACCEPTANCE_STEPS, results, decision))
  if (!decision.accepted) {
    console.error(`\n${decision.skipped.length} step(s) did not run: ${decision.skipped.map((entry) => `${entry.id} (${entry.condition})`).join(", ")}`)
  }
  return decision.accepted ? 0 : 1
}

if (import.meta.main) process.exit(await main())

export * as AcceptCustomer from "./accept-customer.ts"
