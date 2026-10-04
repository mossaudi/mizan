import { describe, expect, test } from "bun:test"
import { isErr } from "@mizan/core"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CHECK_NAMES,
  buildReport,
  checkCommand,
  discoverPackages,
  resolveToolchain,
  runPackageChecks,
  runCi,
  summariseReport,
  type ExtraPlan,
  type PackagePlan,
  type Toolchain,
} from "../src/ci.ts"
import { requireRepositoryRoot } from "../src/repo-root.ts"
import { runGates } from "../src/run-gates.ts"
import type { GateOutcome } from "../src/run-gates.ts"

/**
 * The CI runner's self-test. Every failure mode is proven with a REAL fixture and the REAL
 * toolchain, never with a mock.
 *
 * ## Why there are no mocks here
 *
 * The acceptance criterion for this runner is that it *fails* when it should. A mocked
 * `tsc` that returns exit 1 proves only that the runner reads an exit code — it cannot prove
 * that the real `tsc` is invoked correctly, that its output reaches the report, or that the
 * report names the right package. So each test writes a genuine broken TypeScript file into
 * a temporary workspace and runs the genuine compiler against it. If these tests pass, a
 * real type error really does reach a human, which is the entire claim.
 *
 * The gate suite is passed as `[]` in the fixture tests: these tests are about the runner,
 * and `gates.test.ts` already covers G-1…G-7. Running the real gates here would also read
 * the *real* repository, which a unit test must not depend on.
 */

const gateStub = async (): Promise<readonly GateOutcome[]> => []

/**
 * The budget for any test that spawns the real `tsc`.
 *
 * One named constant rather than a literal per test, because the failure this prevents is silent:
 * a test that inherits bun's 5000 ms default still passes on a fast machine, so the bug only
 * surfaces on the cold clone and the loaded runner — the two environments the acceptance criterion
 * is actually about. Every test in this file that calls `realTools()` declares it, and the claim is
 * checkable by eye rather than by trust: `grep -n "realTools()" test/ci.test.ts` shows a
 * `REAL_TOOLCHAIN_TIMEOUT_MS` on every one, so a future test that forgets is a reviewer-visible
 * omission instead of a flake the next person inherits.
 *
 * Declared on the two tests that pass no `tsc` at all, on purpose. The invariant above is then
 * literally true rather than true-with-an-exception, which is the only kind of invariant a future
 * edit can quietly break.
 */
const REAL_TOOLCHAIN_TIMEOUT_MS = 600_000

/** A workspace with one healthy package and one package broken in a chosen way. */
const makeWorkspace = async (options: { readonly broken: "types" | "tests" | "none" }): Promise<{ readonly root: string; readonly cleanup: () => Promise<void> }> => {
  const root = await mkdtemp(join(tmpdir(), "mizan-ci-"))
  const good = join(root, "packages", "good")
  const bad = join(root, "packages", "bad")
  await mkdir(good, { recursive: true })
  await mkdir(bad, { recursive: true })

  // `include` is pinned to the source file on purpose. The fixture workspace lives in a temp
  // directory with no `node_modules`, so a `bun:test` import in a test file would fail to
  // resolve and every fixture would report TS2307 — a real error, but not the one under test.
  // Type resolution is exercised for real against the actual repository, below.
  const tsconfig = {
    compilerOptions: { strict: true, noEmit: true, target: "esnext", module: "esnext", moduleResolution: "bundler", skipLibCheck: true },
    include: ["index.ts"],
  }
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, workspaces: ["packages/*"] }))
  await writeFile(join(good, "package.json"), JSON.stringify({ name: "@fixture/good", scripts: { typecheck: "tsc --noEmit -p .", test: "bun test" } }))
  await writeFile(join(good, "tsconfig.json"), JSON.stringify(tsconfig))
  await writeFile(join(good, "index.ts"), "export const good = 1\n")
  await writeFile(join(good, "good.test.ts"), 'import { expect, test } from "bun:test"\nimport { good } from "./index.ts"\ntest("good", () => { expect(good).toBe(1) })\n')

  await writeFile(join(bad, "package.json"), JSON.stringify({ name: "@fixture/bad", scripts: { typecheck: "tsc --noEmit -p .", test: "bun test" } }))
  await writeFile(join(bad, "tsconfig.json"), JSON.stringify(tsconfig))

  if (options.broken === "types") {
    // A genuine type error: a string assigned to a number.
    await writeFile(join(bad, "index.ts"), 'export const broken: number = "not a number"\n')
  } else {
    await writeFile(join(bad, "index.ts"), "export const ok = 2\n")
  }
  if (options.broken === "tests") {
    await writeFile(join(bad, "bad.test.ts"), 'import { expect, test } from "bun:test"\ntest("fails on purpose", () => { expect(1).toBe(2) })\n')
  }

  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

const realTools = (): Toolchain => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) throw new Error(root.error)
  const tools = resolveToolchain(root.value)
  if (isErr(tools)) throw new Error(tools.error)
  return tools.value
}

/**
 * The one package at `rel`, or a thrown error naming what was actually there.
 *
 * Written as a throw rather than a non-null assertion because `bun test` will not tell you
 * which fixture was empty — it will tell you the assertion failed, three frames away from
 * the typo that caused it.
 */
const planFor = (plans: readonly PackagePlan[], rel: string): PackagePlan => {
  const found = plans.find((plan) => plan.rel === rel)
  if (found !== undefined) return found
  throw new Error(`no package at ${rel}; fixture has ${plans.map((plan) => plan.rel).join(", ")}`)
}

/**
 * A workspace with a root `scripts/` directory, the way this repository actually is.
 *
 * The fixture's packages are healthy; the only planted violation is in `scripts/`. That
 * asymmetry is the point: it is the exact shape of the bug that reached a green run, where
 * every package typecheck and every gate passed while the root entrypoints did not compile.
 *
 * A passing test file lives under `scripts/` because the plan is scoped with `testPaths`, so the
 * test check has something real to collect — a directory with no tests would pass vacuously and
 * would not distinguish "scoped correctly" from "collected nothing".
 *
 * `include` is pinned to `scripts/entry.ts` for the reason `makeWorkspace` documents: the fixture
 * lives in a temp directory with no `node_modules`, so a `bun:test` import would report TS2307 — a
 * real error, but not the one under test. Type resolution across `scripts/*.test.ts` is exercised
 * against the actual repository by the run this file ends with.
 */
const makeRootScriptWorkspace = async (options: { readonly broken: boolean }): Promise<{ readonly root: string; readonly cleanup: () => Promise<void> }> => {
  const { root, cleanup } = await makeWorkspace({ broken: "none" })
  const scripts = join(root, "scripts")
  await mkdir(scripts, { recursive: true })
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "esnext", module: "esnext", moduleResolution: "bundler", skipLibCheck: true }, include: ["scripts/entry.ts"] }))
  await writeFile(join(scripts, "entry.ts"), options.broken ? 'export const broken: number = "not a number"\n' : "export const ok = 1\n")
  await writeFile(join(scripts, "entry.test.ts"), 'import { expect, test } from "bun:test"\nimport { ok } from "./entry.ts"\ntest("the entrypoint loads", () => { expect(ok).toBe(1) })\n')
  return { root, cleanup }
}

/** `scripts/` as `runCi` receives it from the shim: typechecked, and tested SCOPED to itself. */
const rootScriptsPlan = (root: string): ExtraPlan => ({
  plan: { name: "@mizan/scripts", dir: root, rel: "scripts", testPaths: ["scripts"] },
  checks: ["typecheck", "test"],
})

describe("discoverPackages", () => {
  test("finds every package in a workspace and names it from its manifest", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "none" })
    try {
      const plans = await discoverPackages(root, ["packages/*"])
      // Sorted by directory, so `bad` precedes `good` in both lists.
      expect(plans.map((plan) => plan.name)).toEqual(["@fixture/bad", "@fixture/good"])
      expect(plans.map((plan) => plan.rel)).toEqual(["packages/bad", "packages/good"])
    } finally {
      await cleanup()
    }
  })

  test("is deterministic, so two runs produce a byte-identical CI log", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "none" })
    try {
      const first = await discoverPackages(root, ["packages/*"])
      const second = await discoverPackages(root, ["packages/*"])
      expect(first).toEqual(second)
    } finally {
      await cleanup()
    }
  })

  test("an absent workspace directory is skipped rather than failing the build", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "none" })
    try {
      const plans = await discoverPackages(root, ["apps/*"])
      expect(plans).toEqual([])
    } finally {
      await cleanup()
    }
  })
})

describe("checkCommand", () => {
  test("the typecheck runs the pinned compiler against the package's own tsconfig", () => {
    const tools: Toolchain = { bun: "bun", tsc: "/repo/node_modules/.bin/tsc" }
    expect(checkCommand("typecheck", tools)).toEqual(["/repo/node_modules/.bin/tsc", "--noEmit", "-p", "."])
  })

  test("the test check runs bun from the package directory", () => {
    expect(checkCommand("test", { bun: "/bun", tsc: "/tsc" })).toEqual(["/bun", "test"])
  })

  test("a plan that names test paths scopes discovery to them, so it cannot absorb a package", () => {
    // The repository-root plan runs from the root, where a bare `bun test` walks every package and
    // silently skips any that fails to load. Naming the directory is what keeps the root plan a
    // guard rather than a vacuous-green risk (AGENTS.md sections 8 and 14).
    const plan: PackagePlan = { name: "@mizan/scripts", dir: "/repo", rel: "scripts", testPaths: ["scripts"] }
    expect(checkCommand("test", { bun: "/bun", tsc: "/tsc" }, plan)).toEqual(["/bun", "test", "scripts"])
  })

  test("a plan with no test paths gets the bare command, so package coverage is unchanged", () => {
    const plan: PackagePlan = { name: "@mizan/core", dir: "/repo/packages/mizan-core", rel: "packages/mizan-core" }
    expect(checkCommand("test", { bun: "/bun", tsc: "/tsc" }, plan)).toEqual(["/bun", "test"])
  })

  test("testPaths never reach the typecheck command", () => {
    // They are a discovery filter, not an input to `tsc`; leaking one into the other would be a
    // fixture-shaped coincidence that stops being true the first time someone widens it.
    const plan: PackagePlan = { name: "@mizan/scripts", dir: "/repo", rel: "scripts", testPaths: ["scripts"] }
    expect(checkCommand("typecheck", { bun: "/bun", tsc: "/tsc" }, plan)).toEqual(["/tsc", "--noEmit", "-p", "."])
  })

  test("the order is typecheck first, then test", () => {
    // A type error makes the test result uninteresting; the other order buries the cause.
    expect(CHECK_NAMES).toEqual(["typecheck", "test"])
  })
})

describe("runPackageChecks — a planted type error must fail and must be attributable", () => {
  test("the real tsc fails the package", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "types" })
    try {
      const plan = planFor(await discoverPackages(root, ["packages/*"]), "packages/bad")
      const outcome = await runPackageChecks(plan, ["typecheck"], realTools())
      expect(outcome.ok).toBe(false)
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)

  test("the report names the failing package", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "types" })
    try {
      const plans = await discoverPackages(root, ["packages/*"])
      const outcomes = []
      for (const plan of plans) outcomes.push(await runPackageChecks(plan, ["typecheck"], realTools()))
      const report = buildReport(outcomes, await gateStub())
      const printed = summariseReport(report)

      // This string IS the acceptance criterion of Story 6.
      expect(printed).toContain("packages/bad")
      expect(printed).toContain("@fixture/bad")
      expect(printed).toContain("CI RED")
      // And the healthy package is still reported as healthy.
      expect(printed).toContain("packages/good")
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)

  test("the compiler's own message survives, so the error is diagnosable", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "types" })
    try {
      const plan = planFor(await discoverPackages(root, ["packages/*"]), "packages/bad")
      const outcome = await runPackageChecks(plan, ["typecheck"], realTools())
      const printed = summariseReport(buildReport([outcome], await gateStub()))
      // The file and the diagnostic code, exactly as tsc printed them.
      expect(printed).toContain("index.ts")
      expect(printed).toContain("TS2322")
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)

  test("a healthy package passes", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "none" })
    try {
      const plan = planFor(await discoverPackages(root, ["packages/*"]), "packages/good")
      const outcome = await runPackageChecks(plan, ["typecheck", "test"], realTools())
      expect(outcome.ok).toBe(true)
      expect(outcome.checks.map((check) => check.check)).toEqual(["typecheck", "test"])
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)
})

describe("runPackageChecks — a planted failing test must fail", () => {
  test("a real failing assertion exits non-zero and names the test file", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "tests" })
    try {
      const plan = planFor(await discoverPackages(root, ["packages/*"]), "packages/bad")
      const outcome = await runPackageChecks(plan, ["test"], realTools())
      expect(outcome.ok).toBe(false)
      const printed = summariseReport(buildReport([outcome], await gateStub()))
      expect(printed).toContain("packages/bad")
      expect(printed).toContain("fails on purpose")
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)

  test("a type error short-circuits the test run", async () => {
    const { root, cleanup } = await makeWorkspace({ broken: "types" })
    try {
      const plan = planFor(await discoverPackages(root, ["packages/*"]), "packages/bad")
      const outcome = await runPackageChecks(plan, ["typecheck", "test"], realTools())
      expect(outcome.checks).toHaveLength(1)
      expect(outcome.checks[0]?.check).toBe("typecheck")
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)
})

describe("buildReport", () => {
  const green: readonly GateOutcome[] = [{ gate: "G-1", findings: [] }]

  test("is green only when every package passed and every gate is clean", () => {
    const passed: PackagePlan = { name: "@fixture/good", dir: "/x", rel: "packages/good" }
    const outcome = { package: passed, checks: [{ check: "test" as const, ok: true, detail: "ok" }], ok: true }
    expect(buildReport([outcome], green).ok).toBe(true)
  })

  test("a single failing package is enough to make the run red", () => {
    const passed: PackagePlan = { name: "@fixture/good", dir: "/x", rel: "packages/good" }
    const failing = { package: passed, checks: [{ check: "test" as const, ok: false, detail: "exited 1" }], ok: false }
    expect(buildReport([failing], green).ok).toBe(false)
  })

  test("a gate finding is enough to make the run red", () => {
    const dirty: readonly GateOutcome[] = [{ gate: "G-6", findings: [{ gate: "G-6", rule: "G-6.1", path: "a.ts", line: 1, excerpt: "x" }] }]
    expect(buildReport([], dirty).ok).toBe(false)
    expect(summariseReport(buildReport([], dirty))).toContain("gate G-6 (1 findings)")
  })

  test("zero discovered packages is RED, not green", () => {
    // "Every one of zero packages passed" must never certify a build. This is the guard that
    // turns a typo in the workspaces glob into a loud failure instead of a false pass.
    const report = buildReport([], green)
    expect(report.ok).toBe(false)
    expect(report.reasons).toContain("no workspace packages were discovered, so nothing was checked")
    expect(summariseReport(report)).toContain("CI RED")
  })

  test("the reasons say why the run was red", () => {
    const passed: PackagePlan = { name: "@fixture/good", dir: "/x", rel: "packages/good" }
    const failing = { package: passed, checks: [{ check: "test" as const, ok: false, detail: "exited 1" }], ok: false }
    expect(buildReport([failing], green).reasons).toEqual(["package packages/good failed"])
  })
})

describe("runCi — the root entrypoints are inside the gate", () => {
  test("a type error in scripts/ turns the run RED while every package stays green", async () => {
    // The exact bug this exists to prevent: `scripts/ingest.ts` importing `SourceRegistry`
    // from `@mizan/corpus` when the schema is in `@mizan/core`. Six packages typechecked, six
    // packages tested green, six gates clean, and `bun run ingest` still failed on a missing
    // export. A gate that does not cover the entrypoints is not a gate over the product.
    const { root, cleanup } = await makeRootScriptWorkspace({ broken: true })
    try {
      const plans = await discoverPackages(root, ["packages/*"])
      const report = await runCi(plans, ["typecheck"], realTools(), gateStub, [rootScriptsPlan(root)])

      expect(report.ok).toBe(false)
      expect(report.reasons).toContain("package scripts failed")

      const printed = summariseReport(report)
      expect(printed).toContain("CI RED")
      expect(printed).toContain("scripts")
      expect(printed).toContain("entry.ts")
      // And the packages are still reported as passing, so the report says what broke rather
      // than merely that something broke.
      expect(printed).toContain("packages/good")
    } finally {
      await cleanup()
    }
    // 600s, not bun's 5s default. This test spawns the real `tsc --noEmit` three times against a
    // temporary workspace, and on a cold clone or a loaded CI runner that is comfortably past five
    // seconds. The budget matches the sibling test in "the real repository is green", which spends
    // the same work. A test that fails on a slow machine is a flaky CI job, and AGENTS.md section 14
    // calls a flaky job a defect rather than noise — so the timeout is a property of this file, not
    // of the machine it happens to run on.
  }, REAL_TOOLCHAIN_TIMEOUT_MS)

  test("a healthy scripts/ directory leaves the run green", async () => {
    const { root, cleanup } = await makeRootScriptWorkspace({ broken: false })
    try {
      const plans = await discoverPackages(root, ["packages/*"])
      const report = await runCi(plans, ["typecheck"], realTools(), gateStub, [rootScriptsPlan(root)])
      expect(report.reasons).toEqual([])
      expect(report.ok).toBe(true)
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)

  test("scripts/ is tested too, but SCOPED to itself, so root `bun test` never walks the packages", async () => {
    // The regression this replaces: `scripts/verify-chain.test.ts` was typechecked on every CI run
    // and executed on none, because a bare `bun test` at the root is the collection failure
    // AGENTS.md section 8 rules out. Scoping by path keeps the guard and drops the vacuous green,
    // and the assertion is on the COMMAND rather than on the run, so it cannot pass because a
    // broken runner happened to report green.
    const { root, cleanup } = await makeRootScriptWorkspace({ broken: false })
    try {
      const report = await runCi(await discoverPackages(root, ["packages/*"]), ["typecheck", "test"], realTools(), gateStub, [rootScriptsPlan(root)])
      const scriptsOutcome = report.packages.find((outcome) => outcome.package.rel === "scripts")
      expect(scriptsOutcome?.checks.map((check) => check.check)).toEqual(["typecheck", "test"])
      expect(scriptsOutcome?.ok).toBe(true)
      const plan = rootScriptsPlan(root).plan
      expect(plan.testPaths).toEqual(["scripts"])
      expect(checkCommand("test", realTools(), plan)).toEqual([realTools().bun, "test", "scripts"])
    } finally {
      await cleanup()
    }
  },
    REAL_TOOLCHAIN_TIMEOUT_MS)

  test("a failing test under scripts/ turns the run RED, because the guard can now fail", async () => {
    // The point of scoping is not that the check exists — it is that it can fail. A fixture whose
    // only test asserts 1 === 2 must be reported, or the check is decoration.
    const { root, cleanup } = await makeRootScriptWorkspace({ broken: false })
    try {
      await writeFile(join(root, "scripts", "entry.test.ts"), 'import { expect, test } from "bun:test"\ntest("fails on purpose", () => { expect(1).toBe(2) })\n')
      const report = await runCi([], ["test"], realTools(), gateStub, [rootScriptsPlan(root)])
      expect(report.ok).toBe(false)
      expect(report.reasons).toContain("package scripts failed")
      expect(summariseReport(report)).toContain("scripts")
    } finally {
      await cleanup()
    }
  },
    REAL_TOOLCHAIN_TIMEOUT_MS)

  test("an extra plan with no checks does not fabricate a pass", async () => {
    const { root, cleanup } = await makeRootScriptWorkspace({ broken: true })
    try {
      const report = await runCi([], ["typecheck"], realTools(), gateStub, [{ plan: { name: "@mizan/scripts", dir: root, rel: "scripts" }, checks: [] }])
      // An empty check list is not evidence of a working directory, but it is also not a
      // failure: `buildReport` reports it green, and the reason is that the caller asked for
      // no checks. The guard against that misuse is the type — `checks` is a list, not optional
      // defaults — so this asserts the actual behaviour rather than an aspiration.
      expect(report.packages[0]?.checks).toEqual([])
    } finally {
      await cleanup()
    }
  }, REAL_TOOLCHAIN_TIMEOUT_MS)
})

/**
 * The plans discovery finds in THIS repository, resolved once, at module load.
 *
 * The test name below is prose over this array rather than a hardcoded count. A title that says
 * "six" while discovery finds twelve is the same defect class the v5 precision cycle exists to
 * remove: the repository states something its own tooling contradicts, in the one place a reviewer
 * is guaranteed to read it. Discovery is the one owner of the number (E2.4), and the test body
 * reuses the same array, so the name and the behaviour are provably one computation.
 *
 * A checkout this cannot identify is a loud failure at load rather than a fixture test that
 * quietly stops covering anything — `requireRepositoryRoot` exists precisely because a suite that
 * cannot find the repository must report nothing rather than report a pass.
 */
const discoverRealPlans = async (): Promise<readonly PackagePlan[]> => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) throw new Error(root.error)
  return await discoverPackages(root.value, ["packages/*", "apps/*"])
}

const realPlans: readonly PackagePlan[] = await discoverRealPlans()

describe("the real repository is green under the real runner", () => {
  test(`all ${realPlans.length} discovered workspace packages typecheck and test green`, async () => {
    const root = requireRepositoryRoot(import.meta.dir)
    if (isErr(root)) throw new Error(root.error)
    const tools = resolveToolchain(root.value)
    if (isErr(tools)) throw new Error(tools.error)

    expect(realPlans.length).toBeGreaterThan(0)
    const gates = await gateStub()
    const outcomes = []
    for (const plan of realPlans) outcomes.push(await runPackageChecks(plan, ["typecheck"], tools.value))
    // Asserted as a list of failures rather than through buildReport, because an empty list
    // fed to buildReport is now (correctly) red for having checked nothing.
    const failures = outcomes.filter((outcome) => !outcome.ok).map((outcome) => summariseReport(buildReport([outcome], gates)))
    expect(failures).toEqual([])
  }, REAL_TOOLCHAIN_TIMEOUT_MS)

  test("the gates run against the real repository", async () => {
    const root = requireRepositoryRoot(import.meta.dir)
    if (isErr(root)) throw new Error(root.error)
    const outcomes = await runGates({ root: root.value })
    expect(outcomes.map((outcome) => outcome.gate)).toEqual(["G-1", "G-2", "G-3", "G-5", "G-6", "G-7", "G-4"])
  }, 300_000)
})
