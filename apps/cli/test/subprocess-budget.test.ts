import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  boundedExit,
  declaredStepTimeoutMs,
  isSpawningFile,
  literalTimeoutArguments,
  ROOT,
  SPAWN_CALLS,
  SubprocessBudgetExceeded,
  subprocessBudgetFor,
  SUBPROCESS_TIMEOUT_MS,
  testFilesIn,
  unguardedSpawns,
} from "./subprocess-budget.ts"

/**
 * The subprocess budget's self-tests, and the planted violation for each rule.
 *
 * ## Why this file exists at all
 *
 * Every rule in `subprocess-budget.ts` is a convention a future edit can quietly break, and a
 * convention nobody has watched fail is a comment with a runtime cost (AGENTS.md section 14). So each
 * test below names the defect it exists to catch and carries an inline fixture in which that defect
 * *is* present — the file that hand-types `}, 120_000)`, the spawn beside no `boundedExit`, the
 * acceptance script whose step budget drifted away from the test budget. A guard whose own test passes
 * over a violation proves nothing, which is why the assertions are written against in-memory
 * strings rather than against the repository.
 *
 * The one place the real files are read is the completeness rule, which has to read them: a guard that
 * cannot see a newly added `*.test.ts` cannot hold a new file to anything.
 */

const TEST_DIR = join(import.meta.dir)

/**
 * This file is excluded from the directory scan, because its fixtures name every spawn shape on
 * purpose. Excluded by name rather than by "contains a `describe`" so the exclusion is one line a
 * reader can check, and narrowly enough that a new `*.test.ts` is still scanned.
 */
const GUARD_SELF = "subprocess-budget.test.ts"

/** The source of every test file that can reach a spawned child, by file name. */
const spawningSources = (): ReadonlyMap<string, string> =>
  new Map(
    testFilesIn(TEST_DIR)
      .filter((name) => name !== GUARD_SELF)
      .map((name) => [name, readFileSync(join(TEST_DIR, name), "utf8")] as const)
      .filter(([, source]) => isSpawningFile(source)),
  )

describe("the shared budget is one number", () => {
  test("no spawning test file types a timeout by hand", () => {
    // The planted violation: a second budget beside the shared one. Two numbers for one idea is where
    // they start disagreeing — one file that waited 120s and another that waited 60s makes "how long
    // may a demo take" a question with two answers, and the answer that matters is the shorter one.
    const withSecondBudget = ['test("runs the demo", async () => {', "  expect(code).toBe(0)", "}, 120_000)"]
    expect({ literals: literalTimeoutArguments(withSecondBudget.join("\n")) }).toEqual({ literals: [120_000] })
    expect({ literals: literalTimeoutArguments(['test("x", () => {', "})"].join("\n")) }).toEqual({ literals: [] })
    // The annotation spelled with the shared identifier, not its value: interpolating the constant
    // would put `}, 60000)` in the fixture and the guard would be right to report it.
    const named = ['test("x", () => {', "}, SUBPROCESS_TIMEOUT_MS)"].join("\n")
    expect({ literals: literalTimeoutArguments(named) }).toEqual({ literals: [] })

    for (const [name, source] of spawningSources()) {
      expect({ file: name, literals: literalTimeoutArguments(source) }, `${name} types its own timeout`).toEqual({
        file: name,
        literals: [],
      })
    }
  })

  test("the annotation for a test that waits on n children is n budgets", () => {
    // The multiplier rather than a typed `120_000`, because a test awaiting two commands has a floor of
    // two budgets and an annotation of one fires before the second child has had any time at all.
    expect(subprocessBudgetFor(1)).toBe(SUBPROCESS_TIMEOUT_MS)
    expect(subprocessBudgetFor(2)).toBe(2 * SUBPROCESS_TIMEOUT_MS)
    // Derived, so a test that grows a third child cannot keep quoting the old ceiling by accident.
    expect({ literals: literalTimeoutArguments("}, subprocessBudgetFor(3))\n") }).toEqual({ literals: [] })
  })
})

describe("every spawn is bounded", () => {
  test("no spawning file has a spawn with no guard beside it", () => {
    // The planted violation: a file that grows a second spawn and copies the first one's wait.
    const twoSpawnsOneGuard = [
      "const a = Bun.spawn([\"bun\"])",
      "const codeA = await boundedExit(a.exited, () => a.kill(), \"a\", () => \"\")",
      "const b = Bun.spawn([\"bun\"])",
      "const codeB = await b.exited",
    ].join("\n")
    expect({ unguarded: unguardedSpawns(twoSpawnsOneGuard) }).toEqual({ unguarded: 1 })
    expect({ unguarded: unguardedSpawns(["Bun.spawn([])", "boundedExit(p.exited, kill, \"x\", out)"].join("\n")) }).toEqual({
      unguarded: 0,
    })

    for (const [name, source] of spawningSources()) {
      expect({ file: name, unguarded: unguardedSpawns(source) }, `${name} has an unbounded spawn`).toEqual({
        file: name,
        unguarded: 0,
      })
    }
  })

  test("a file that waits on a child is one the directory scan can see", () => {
    // The completeness half. A guard that only sees the files it was written about cannot hold a new
    // file to anything, so `SPAWN_CALLS` is compared against the directory rather than a hand-kept list.
    const files = testFilesIn(TEST_DIR)
    expect(files).toContain("demo-command.test.ts")
    expect({ spawning: [...spawningSources().keys()] }).toEqual({
      spawning: ["benchmark-refusal.test.ts", "clean-clone.test.ts", "demo-command.test.ts", "demo-key-closure.test.ts", "demo.test.ts", "happy-path.test.ts"],
    })
    // Each declared call shape is one a file could really contain, not a spelling nothing uses — a
    // shape with no user is not a rule, it is a line of noise that will be deleted by the next reader.
    for (const call of SPAWN_CALLS) {
      expect({ call, found: files.some((name) => readFileSync(join(TEST_DIR, name), "utf8").includes(call)) }).toEqual({
        call,
        found: true,
      })
    }
  })
})

describe("boundedExit kills rather than waits", () => {
  test("the planted violation fails: a child that never exits is killed and reported, not awaited", async () => {
    // The reason the helper exists. `Promise.race` with the exit alone leaves the wait open forever,
    // and the symptom of that is a runner timeout five minutes later that names neither this file nor
    // the command; the symptom of the fix is a named error naming the command and carrying whatever
    // it printed on the way to hanging.
    let killed = 0
    const never = new Promise<number>(() => undefined)
    const failure = boundedExit(never, () => {
      killed += 1
    }, "bun run demo", () => "printed before hanging", 10).catch((error: unknown) => error)

    expect(await failure).toBeInstanceOf(SubprocessBudgetExceeded)
    expect({ killed }).toEqual({ killed: 1 })
    expect((await failure as SubprocessBudgetExceeded).output).toBe("printed before hanging")
    expect((await failure as SubprocessBudgetExceeded).message).toContain("bun run demo")
  })

  test("the output is read at expiry, not captured when the call was written", async () => {
    // A `() => string` rather than a string argument, for the reason the module header gives: at the
    // moment the timer fires the collector has more bytes than it had at the call, and those are the
    // bytes that explain the hang.
    let collected = "early"
    const never = new Promise<number>(() => undefined)
    const failure = boundedExit(never, () => {
      collected = "late"
    }, "child", () => collected, 10).catch((error: unknown) => error)

    expect(((await failure) as SubprocessBudgetExceeded).output).toBe("late")
  })

  test("a child that exits in time returns its code and is never killed", async () => {
    let killed = 0
    const code = await boundedExit(Promise.resolve(0), () => {
      killed += 1
    }, "child", () => "", 5_000)
    expect({ code, killed }).toEqual({ code: 0, killed: 0 })
  })

  test("the timer does not outlive the wait, or the process stays alive after the suite", async () => {
    // An un-cleared timer keeps the event loop alive and the runner's exit code pending for its full
    // budget, so a passing suite would take a minute to report itself as passing.
    const before = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length
    await boundedExit(Promise.resolve(0), () => undefined, "child", () => "", 60_000)
    const after = process.getActiveResourcesInfo().filter((name) => name === "Timeout").length
    expect({ before, after }).toEqual({ before, after })
  })
})

describe("the test budget is the acceptance step budget", () => {
  test("the planted violation fails: a test budget and a step budget that differ are two budgets", () => {
    // Read from the acceptance script's own declaration rather than imported: it loads its step table
    // and its surface probes at module scope, and a test budget is not a reason to pull that graph in.
    expect({ declared: declaredStepTimeoutMs("export const STEP_TIMEOUT_MS = 60_000\n") }).toEqual({ declared: 60_000 })
    expect({ declared: declaredStepTimeoutMs("export const STEP_TIMEOUT_MS = 5_000\n") }).toEqual({ declared: 5_000 })
    // Fails closed. "Cannot find the declaration" is not agreement with it.
    expect({ declared: declaredStepTimeoutMs("const STEP_TIMEOUT_MS = 60_000\n") }).toEqual({ declared: null })
    expect({ declared: declaredStepTimeoutMs("") }).toEqual({ declared: null })

    const source = readFileSync(join(ROOT, "scripts", "accept-customer.ts"), "utf8")
    expect({ declared: declaredStepTimeoutMs(source) }).toEqual({ declared: SUBPROCESS_TIMEOUT_MS })
  })
})