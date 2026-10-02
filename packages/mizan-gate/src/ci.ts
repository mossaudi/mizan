import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { err, ok, type Result } from "@mizan/core"
import type { GateOutcome } from "./run-gates.ts"

/**
 * The CI runner: per package, typecheck then test, then the structural gates.
 *
 * ## Why this lives in a package and not in `scripts/`
 *
 * Because it is code that decides whether the repository is allowed to ship, and the rule
 * that a guard must be able to fail applies to the guard as much as to the thing it guards.
 * `scripts/ci.ts` is an argv shim over this module; the logic is unit-tested from
 * `packages/mizan-gate`, which is the only place `bun test` is allowed to run from
 * (AGENTS.md section 8).
 *
 * ## Why the toolchain is injected
 *
 * `Toolchain` carries the `bun` and `tsc` executables as data. That is what lets the
 * self-test run a REAL typecheck against a REAL broken fixture in a temp directory, instead
 * of asserting on a mock and trusting that the mock behaves like `tsc`. A gate that cannot
 * fail is not a gate; neither is a test that cannot fail.
 *
 * ## Why each check runs with `cwd` set to the package directory
 *
 * Two reasons, and the second is the one that bites. `bun test` discovers tests by walking
 * upwards from the working directory, so running it from the repository root globs every
 * package's tests, silently skips any package that fails to load, and can report green having
 * collected nothing (AGENTS.md section 8). And `tsc -p .` resolves the *nearest* tsconfig, so
 * the same invocation is a different command in a different directory. Pinning `cwd` makes
 * both of those impossible rather than merely discouraged.
 */

export type CheckName = "typecheck" | "test"

/** Every `bun run` script every package is expected to expose. */
export const CHECK_NAMES: readonly CheckName[] = ["typecheck", "test"]

export type PackagePlan = {
  /** The manifest `name`, used verbatim in every message so the failure names a package. */
  readonly name: string
  /** Absolute path to the package directory. Becomes the child's `cwd`. */
  readonly dir: string
  /** Repo-relative, POSIX-separated. Stable across Windows and Linux. */
  readonly rel: string
  /**
   * Paths handed to `bun test` instead of the bare command. Empty for a workspace package.
   *
   * ## Why the repository-root plan needs this
   *
   * `bun test` walks from the current directory, so running it at the root collects every
   * package's tests — and a package that fails to load is skipped without a word, which is the
   * vacuous-green failure AGENTS.md section 8 forbids. But `scripts/` is outside every workspace
   * glob, so before this field existed the root plan had no test check at all, and
   * `scripts/verify-chain.test.ts` was typechecked on every CI run and executed on none. A guard
   * that cannot fail is not a guard (section 14).
   *
   * Naming the directory keeps the run narrow in both directions: `bun test scripts` discovers
   * only files under `scripts/`, so it cannot silently absorb a package, and a package's own plan
   * keeps the bare command so its coverage is unchanged.
   */
  readonly testPaths?: readonly string[]
}

export type Toolchain = {
  readonly bun: string
  readonly tsc: string
}

export type CheckOutcome = {
  readonly check: CheckName
  readonly ok: boolean
  readonly detail: string
}

export type PackageOutcome = {
  readonly package: PackagePlan
  readonly checks: readonly CheckOutcome[]
  readonly ok: boolean
}

export type CiReport = {
  readonly packages: readonly PackageOutcome[]
  readonly gates: readonly GateOutcome[]
  readonly ok: boolean
  /** Why the run is red, when it is. Empty on green. */
  readonly reasons: readonly string[]
}

/* ------------------------------------------------------------------ discovery */

const readManifestName = async (dir: string, fallback: string): Promise<string> => {
  try {
    const parsed = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as { readonly name?: unknown }
    if (typeof parsed.name === "string" && parsed.name.length > 0) return parsed.name
    return fallback
  } catch {
    // A workspace directory without a readable manifest is not a package. Falling back to the
    // directory name keeps the runner reporting a real path rather than skipping it silently.
    return fallback
  }
}

/**
 * Discover every workspace package, sorted by directory name.
 *
 * Sorting is a precondition for a byte-identical CI log: two runs over the same tree must
 * print the same order, or a diff of two CI logs is noise.
 */
export const discoverPackages = async (root: string, workspaces: readonly string[]): Promise<readonly PackagePlan[]> => {
  const plans: PackagePlan[] = []
  for (const pattern of workspaces) {
    const [parent, child] = pattern.split("/")
    if (child !== "*") {
      const dir = join(root, pattern)
      plans.push({ name: await readManifestName(dir, pattern), dir, rel: pattern })
      continue
    }
    const parentDir = join(root, parent ?? "")
    let entries: string[] = []
    try {
      entries = (await readdir(parentDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch {
      // A workspace that does not exist yet is not an error: `apps/*` is empty before the web
      // app lands, and failing the build for an absent directory would make the scaffold
      // unbuildable in the one commit where that is still true.
      continue
    }
    for (const name of entries) {
      const dir = join(parentDir, name)
      plans.push({ name: await readManifestName(dir, name), dir, rel: `${parent}/${name}` })
    }
  }
  return plans.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
}

/* ------------------------------------------------------------------ execution */

const runCommand = async (command: readonly string[], cwd: string, budgetMs: number): Promise<{ readonly code: number; readonly output: string }> => {
  const child = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => child.kill(), budgetMs)
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  clearTimeout(timer)
  return { code, output: `${stdout}${stderr}`.trim() }
}

/**
 * The two commands, as data, so the mapping is testable without spawning anything.
 *
 * `bunx` is not used for the typecheck: an absolute `tsc` resolved by the caller means the
 * runner never downloads a compiler mid-build, and a build that can silently fetch a
 * different compiler version than the lockfile pins is not a reproducible build.
 *
 * `plan.testPaths` is appended after `test`, which is the only place it can go: it is a filter
 * on discovery, and discovery is what section 8 is about. A plan that names no paths gets the
 * bare command, so a workspace package's coverage is exactly what it was before.
 */
export const checkCommand = (check: CheckName, tools: Toolchain, plan?: PackagePlan): readonly string[] => {
  if (check === "typecheck") return [tools.tsc, "--noEmit", "-p", "."]
  return [tools.bun, "test", ...(plan?.testPaths ?? [])]
}

/**
 * Locate the compilers, or explain why we cannot.
 *
 * Resolution order is deliberate. The workspace's own `node_modules/.bin` is preferred over
 * `PATH` because that is the `tsc` the lockfile pinned; a globally installed `tsc` on the
 * developer's `PATH` may be a different major version, and "it typechecked on my machine"
 * is not a property this repository is willing to claim.
 *
 * The `.cmd` and `.exe` variants are listed because Windows resolves a bare `tsc` to
 * `tsc.cmd`, and spawning `node_modules/.bin/tsc` directly on Windows fails with ENOENT.
 */
const TSC_CANDIDATES = ["tsc", "tsc.cmd", "tsc.exe"] as const

export const resolveToolchain = (root: string): Result<Toolchain, string> => {
  const bun = Bun.which("bun")
  if (bun === null) return err("bun is not on PATH; CI must run under bun")

  const binDir = join(root, "node_modules", ".bin")
  for (const candidate of TSC_CANDIDATES) {
    const local = join(binDir, candidate)
    if (existsSync(local)) return ok({ bun, tsc: local })
  }
  const onPath = Bun.which("tsc")
  if (onPath !== null) return ok({ bun, tsc: onPath })
  return err("tsc was not found in node_modules/.bin or on PATH; run \"bun install\" first")
}

/** A budget per check. Generous for a 40k-record corpus typecheck, short enough to fail fast. */
export const CHECK_BUDGET_MS = 180_000

const tail = (output: string, lines: number): string => output.split("\n").slice(-lines).join("\n")

const runCheck = async (plan: PackagePlan, check: CheckName, tools: Toolchain): Promise<CheckOutcome> => {
  const outcome = await runCommand(checkCommand(check, tools, plan), plan.dir, CHECK_BUDGET_MS)
  if (outcome.code === 0) return { check, ok: true, detail: "ok" }
  const head = tail(outcome.output, 25)
  return { check, ok: false, detail: `exited ${outcome.code}${head.length > 0 ? `\n${head}` : " with no output"}` }
}

/**
 * Run the requested checks for one package, in order, and stop at the first failure.
 *
 * Stopping early is deliberate: a typecheck error makes the test result uninteresting, and
 * running both would bury the actual cause in noise.
 */
export const runPackageChecks = async (
  plan: PackagePlan,
  checks: readonly CheckName[],
  tools: Toolchain,
): Promise<PackageOutcome> => {
  const outcomes: CheckOutcome[] = []
  for (const check of checks) {
    const outcome = await runCheck(plan, check, tools)
    outcomes.push(outcome)
    if (!outcome.ok) return { package: plan, checks: outcomes, ok: false }
  }
  return { package: plan, checks: outcomes, ok: true }
}

/* ------------------------------------------------------------------ reporting */

const ICONS: Readonly<Record<CheckName, string>> = { typecheck: "types", test: "test " }

/**
 * Render a report, and **name every failing package**.
 *
 * This string is the acceptance criterion of Story 6: a CI failure that says only "exit 1"
 * sends the next person hunting through a log with no idea which of six packages broke.
 * Findings are printed under the package that produced them, never aggregated away.
 */
export const summariseReport = (report: CiReport): string => {
  const lines: string[] = []
  for (const outcome of report.packages) {
    const marks = outcome.checks.map((check) => `${ICONS[check.check]} ${check.ok ? "pass" : "FAIL"}`).join("  ")
    lines.push(`${outcome.ok ? "PASS" : "FAIL"}  ${outcome.package.rel.padEnd(26)} ${outcome.package.name.padEnd(18)} ${marks}`)
    for (const check of outcome.checks) {
      if (check.ok) continue
      lines.push(`      ${outcome.package.rel} (${outcome.package.name}) failed ${check.check}: ${check.detail}`)
    }
  }
  for (const gate of report.gates) {
    const count = gate.findings.length
    lines.push(`${count === 0 ? "PASS" : "FAIL"}  gate ${gate.gate}${count === 0 ? "" : ` (${count} findings)`}`)
  }
  lines.push(report.ok ? "\nCI GREEN" : `\nCI RED\n${report.reasons.map((reason) => `  - ${reason}`).join("\n")}`)
  return lines.join("\n")
}

/**
 * Merge package outcomes and gate outcomes into one verdict.
 *
 * **An empty package list is RED, not green.** The vacuous truth of "every one of zero
 * packages passed" is the precise failure mode AGENTS.md section 8 exists to rule out: a
 * green CI run that collected nothing. A workspace glob that matches nothing — a typo in
 * `workspaces`, a directory renamed, a filter that excludes everything — must be a loud
 * failure, because the alternative is a build that certifies an empty repository.
 */
export const buildReport = (packages: readonly PackageOutcome[], gates: readonly GateOutcome[]): CiReport => {
  const failedPackages = packages.filter((outcome) => !outcome.ok).map((outcome) => outcome.package.rel)
  const dirtyGates = gates.filter((gate) => gate.findings.length > 0).map((gate) => gate.gate)
  const reasons: string[] = []
  if (packages.length === 0) reasons.push("no workspace packages were discovered, so nothing was checked")
  reasons.push(...failedPackages.map((rel) => `package ${rel} failed`))
  reasons.push(...dirtyGates.map((gate) => `gate ${gate} has findings`))
  return { packages, gates, ok: reasons.length === 0, reasons }
}

/**
 * A directory that is checked, but not on the same terms as a workspace package.
 *
 * The repository-root `scripts/` directory holds the entrypoints a developer and CI actually
 * invoke, and no package glob reaches it. It is both typechecked and tested, because the test
 * half is scoped to the directory (`PackagePlan.testPaths`) rather than run bare from the root —
 * the exact vacuous-green failure AGENTS.md section 8 forbids. The check list is therefore data
 * rather than a comment, and `scripts/verify-chain.test.ts` is a guard that can fail.
 */
export type ExtraPlan = {
  readonly plan: PackagePlan
  readonly checks: readonly CheckName[]
}

/**
 * Run every package, then the gates. Sequential on purpose: a 15-minute CI budget with six
 * packages does not have room for a parallel fan-out whose peak memory on a 40k-record
 * typecheck is the thing that times the job out.
 */
export const runCi = async (
  plans: readonly PackagePlan[],
  checks: readonly CheckName[],
  tools: Toolchain,
  runGateSuite: () => Promise<readonly GateOutcome[]>,
  extraPlans: readonly ExtraPlan[] = [],
): Promise<CiReport> => {
  const packages: PackageOutcome[] = []
  for (const plan of plans) {
    packages.push(await runPackageChecks(plan, checks, tools))
  }
  for (const extra of extraPlans) {
    packages.push(await runPackageChecks(extra.plan, extra.checks, tools))
  }
  return buildReport(packages, await runGateSuite())
}

export * as Ci from "./ci.ts"
