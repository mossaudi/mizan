import { readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * The wall-clock budget for a test that waits on a process it spawned.
 *
 * ## What the flake was
 *
 * Bun gives every `test(...)` a five-second default. A test that spawns `bun run demo.ts` — which
 * transpiles the workspace, rebuilds a corpus, replays a transcript and runs the verifier over it —
 * is at the mercy of that number whenever the machine is loaded, and `windows-latest` in particular
 * loses to it regularly. The observed symptom was `[5044.77ms] ^ this test timed out after 5000ms`:
 * a red line that says nothing about the code under test, because the code was fine and the runner
 * was slow. A test that fails for a reason unrelated to its subject trains its reader to ignore it,
 * which is worse than not having the test.
 *
 * ## The annotation is the ceiling; `boundedExit` is the enforcement
 *
 * Writing `}, SUBPROCESS_TIMEOUT_MS)` raises the ceiling. It does not stop a child that never exits,
 * and a spawn inside `beforeAll` has no annotation to raise at all. So the bound also lives where the
 * wait is: `boundedExit` kills the child at the same budget and throws a named error carrying
 * whatever the child managed to print. That second half is what makes the guarantee mechanical
 * rather than a convention — a helper that forgets to opt in fails `unguardedSpawns` below, and a
 * helper that opts in cannot hang.
 *
 * ## Why the budget is the acceptance command's step budget
 *
 * `scripts/accept-customer.ts` declares `STEP_TIMEOUT_MS = 60_000` for one acceptance step, chosen so a
 * customer watching a console sees a wedged step within a minute. The same number is the right ceiling
 * for a spawned demo here: both are "one real command, on a loaded machine, judged by a human waiting".
 * Two numbers for one idea is a place they can disagree, so `declaredStepTimeoutMs` reads the script's
 * own declaration and the guard asserts the two are equal — the pin fails if somebody raises one.
 *
 * ## Why these helpers are a rule and not a comment
 *
 * Every rule below has a self-test in `subprocess-budget.test.ts` carrying a planted violation that
 * must fail. A guard nobody has watched fail is a comment with a runtime cost (AGENTS.md section 14).
 */

/** The repository root, derived from this file rather than imported, so the helpers cannot form a cycle. */
export const ROOT = join(import.meta.dir, "..", "..", "..")

/** The wall-clock budget for a spawned child. See the module header for why this number is this number. */
export const SUBPROCESS_TIMEOUT_MS = 60_000

/**
 * The annotation for a test that waits on `children` sequentially, as `SUBPROCESS_TIMEOUT_MS * children`.
 *
 * ## Why a test ceiling is not one budget
 *
 * `boundedExit` bounds each child; `test(..., timeout)` bounds the whole test. Those are different
 * quantities, and a test that awaits two children one after the other has a floor of two budgets —
 * annotate it with one and the ceiling fires *before* the second child has had any time at all, which
 * manufactures precisely the "timed out after 60000ms" flake this module exists to remove, now with a
 * green rationale attached to it.
 *
 * So the multiplier is written as a call rather than as `120_000`. It keeps one number in the
 * repository, and it makes the test say what it actually does: "two commands, two budgets". A test that
 * grows a third child and forgets to bump this fails at the second child's budget, in the child that
 * is genuinely wedged — which is the diagnosis, not a mystery.
 */
export const subprocessBudgetFor = (children: number): number => children * SUBPROCESS_TIMEOUT_MS

/**
 * A child that outlived its budget, reported rather than waited on.
 *
 * Carries what the child printed, because the reason a clean-clone surface hangs is almost always
 * something the child said on the way there — and a timeout error that discards the output sends the
 * reader back to the step that produced none.
 */
export class SubprocessBudgetExceeded extends Error {
  readonly label: string
  readonly budgetMs: number
  readonly output: string

  constructor(label: string, budgetMs: number, output: string) {
    super(`${label} did not finish within ${budgetMs}ms and was killed; it had printed:\n${output}`)
    this.name = "SubprocessBudgetExceeded"
    this.label = label
    this.budgetMs = budgetMs
    this.output = output
  }
}

/**
 * Wait for a child to exit, or kill it at the budget and refuse.
 *
 * ## Why this is not `await proc.exited`
 *
 * `proc.exited` resolves when the child exits and not one nanosecond before, so awaiting it bare turns
 * any hang into an indefinite wait for whoever is waiting — the test runner here, and `accept:customer`
 * in the shape this was copied from. The budget has to interrupt the wait, and killing the child is
 * what makes the refusal meaningful: a killed process releases its handle on `data/corpus.db`, so the
 * next test's temp directory is not fighting a survivor.
 *
 * `readOutput` is a closure rather than a string because the caller is still collecting bytes at the
 * moment the timer fires; passing the text by value would capture whatever it held when the call was
 * written, which is nothing.
 */
export const boundedExit = async (
  exited: Promise<number>,
  kill: () => void,
  label: string,
  readOutput: () => string,
  budgetMs: number = SUBPROCESS_TIMEOUT_MS,
): Promise<number> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      kill()
      reject(new SubprocessBudgetExceeded(label, budgetMs, readOutput()))
    }, budgetMs)
  })
  try {
    return await Promise.race([exited, expiry])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * The spawn call shapes a test file can reach a child through.
 *
 * ## Why the list is a declaration rather than a detection
 *
 * A detector that missed a spelling would report a clean tree over a file that does spawn, which is
 * the fail-open this repository has already had to undo in two other modules. So the shapes are named
 * here, `isSpawningFile` compares a file against the list, and `SPAWNING_TEST_FILES` is the list of
 * files that matched — and `everyTestFileIsAccountedFor` fails if a file matches and is not on it.
 *
 * `spawn(` on its own covers `node:child_process`; the four callables are this repository's own
 * spawn wrappers, which spawn on their callers' behalf and so belong in their callers' obligations.
 */
export const SPAWN_CALLS = [
  "Bun.spawn(",
  "spawn(",
  "spawnCli(",
  "runDemoCommand(",
  "runBenchmark(",
  "askIn(",
] as const

/** Whether `source` can reach a spawned child, by any of the declared shapes. */
export const isSpawningFile = (source: string): boolean => SPAWN_CALLS.some((call) => source.includes(call))

const numericLiteral = (text: string | undefined): number => Number((text ?? "").replace(/_/g, ""))

/**
 * Numeric timeout arguments in a spawning test file, which is to say every budget typed by hand.
 *
 * ## What this rule is actually for
 *
 * It does **not** prove each spawning test is annotated — matching a `test(...)` to the spawn inside
 * its body needs brace counting, and a scan that guessed wrong would be a worse guard than none.
 * `boundedExit` is what makes the hang impossible; this rule makes the *number* singular, so a second
 * budget cannot appear beside the shared one and quietly become the real limit. A file that declares
 * `}, 120_000)` next to `}, 60_000)` is telling two different stories about how long a demo may take,
 * and only one of them is the budget anybody agreed to.
 *
 * The pattern requires the argument to open a line of its own, which is how a multi-line `test(...)`
 * closes and how nothing else in this package does. Separators are stripped rather than rejected
 * because `120_000` is how this repository writes every large number, and a rule that read
 * `Number("120_000")` would report no violations at all — fail open, from a typo in the guard.
 */
export const literalTimeoutArguments = (source: string): readonly number[] =>
  [...source.matchAll(/^\s*\},?\s*([0-9][0-9_]*)\s*\)/gm)]
    .map((match) => numericLiteral(match[1]))
    .filter(Number.isFinite)

/**
 * The spawns in `source` with no `boundedExit` beside them.
 *
 * ## Why the count and not the position
 *
 * Pairing a spawn with the guard by offset would need the same brace matching this module declines
 * above, and would report a false negative the moment a file grew a second helper. What *is* exact and
 * what actually matters is that every spawn is inside a file that opted in: one `boundedExit` per
 * spawn, counted. A file that adds a spawn and forgets the guard has two spawns and one guard, and
 * fails.
 */
export const unguardedSpawns = (source: string): number => {
  const spawns = [...source.matchAll(/Bun\.spawn\(|spawn\(process\.execPath/g)].length
  const guards = [...source.matchAll(/\bboundedExit\(/g)].length
  return Math.max(spawns - guards, 0)
}

/**
 * Every `*.test.ts` in `dir`, by file name, so the completeness rule can walk the directory itself.
 *
 * Reading the directory rather than holding a list is the point: a hand-maintained list of test files
 * is correct on the day it is written and silently incomplete the day a file is added.
 */
export const testFilesIn = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => entry.name)
    .sort()

/**
 * `STEP_TIMEOUT_MS` as `scripts/accept-customer.ts` declares it, or `null` when it declares none.
 *
 * Read from the source rather than imported: the acceptance command loads its step table, its corpus
 * helpers and its surface probes at module scope, and a test budget is not a reason to pull that
 * graph into a package that otherwise does not reach it. A regex over one assignment is the smaller
 * edge, and it fails closed — `null` is "cannot confirm the budget", which the guard reports rather
 * than treats as agreement.
 */
export const declaredStepTimeoutMs = (source: string): number | null => {
  const declared = /^export const STEP_TIMEOUT_MS = ([0-9][0-9_]*)$/m.exec(source)
  if (declared === null) return null
  return numericLiteral(declared[1])
}

export * as SubprocessBudget from "./subprocess-budget.ts"
