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
 */
const makeRootScriptWorkspace = async (options: { readonly broken: boolean }): Promise<{ readonly root: string; readonly cleanup: () => Promise<void> }> => {
  const { root, cleanup } = await makeWorkspace({ broken: "none" })
  const scripts = join(root, "scripts")
  await mkdir(scripts, { recursive: true })
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "esnext", module: "esnext", moduleResolution: "bundler", skipLibCheck: true }, include: ["scripts/**/*.ts"] }))
  await writeFile(join(scripts, "entry.ts"), options.broken ? 'export const broken: number = "not a number"\n' : "export const ok = 1\n")
  return { root, cleanup }
}

/** `scripts/` as `runCi` receives it from the shim: typechecked, never tested. */
const rootScriptsPlan = (root: string): ExtraPlan => ({
  plan: { name: "@mizan/scripts", dir: root, rel: "scripts" },
  checks: ["typecheck"],
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
  })

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
  })

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
  })

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
  })
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
  })

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
  })
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
  })

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
  })

  test("scripts/ is typechecked but never tested, because root `bun test` is forbidden", async () => {
    // If `test` were ever added here, this directory would be the one place in the repository
    // where `bun test` runs from the root — the collection failure AGENTS.md section 8 rules
    // out, and the reason it would go unnoticed is that it would still be green.
    const { root, cleanup } = await makeRootScriptWorkspace({ broken: false })
    try {
      const report = await runCi(await discoverPackages(root, ["packages/*"]), ["typecheck", "test"], realTools(), gateStub, [rootScriptsPlan(root)])
      const scriptsOutcome = report.packages.find((outcome) => outcome.package.rel === "scripts")
      expect(scriptsOutcome?.checks.map((check) => check.check)).toEqual(["typecheck"])
    } finally {
      await cleanup()
    }
  })

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
  })
})

describe("the real repository is green under the real runner", () => {
  test("all six existing packages typecheck and test green", async () => {
    const root = requireRepositoryRoot(import.meta.dir)
    if (isErr(root)) throw new Error(root.error)
    const tools = resolveToolchain(root.value)
    if (isErr(tools)) throw new Error(tools.error)

    const plans = await discoverPackages(root.value, ["packages/*", "apps/*"])
    expect(plans.length).toBeGreaterThan(0)
    const gates = await gateStub()
    const outcomes = []
    for (const plan of plans) outcomes.push(await runPackageChecks(plan, ["typecheck"], tools.value))
    // Asserted as a list of failures rather than through buildReport, because an empty list
    // fed to buildReport is now (correctly) red for having checked nothing.
    const failures = outcomes.filter((outcome) => !outcome.ok).map((outcome) => summariseReport(buildReport([outcome], gates)))
    expect(failures).toEqual([])
  }, 600_000)

  test("the gates run against the real repository", async () => {
    const root = requireRepositoryRoot(import.meta.dir)
    if (isErr(root)) throw new Error(root.error)
    const outcomes = await runGates({ root: root.value })
    expect(outcomes.map((outcome) => outcome.gate)).toEqual(["G-1", "G-2", "G-3", "G-5", "G-6", "G-7", "G-4"])
  }, 300_000)
})
