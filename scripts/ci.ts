#!/usr/bin/env bun
import { isErr, err, ok, type Result } from "@mizan/core"
import {
  discoverPackages,
  requireRepositoryRoot,
  resolveToolchain,
  runCi,
  runGates,
  summariseReport,
  type CheckName,
  type CiReport,
  type ExtraPlan,
  type GateOutcome,
  type PackagePlan,
  type Toolchain,
} from "@mizan/gate"

/**
 * `bun run ci` — the one command that decides whether this repository may ship.
 *
 * ## Why this file is a shim
 *
 * All the logic is in `@mizan/gate`'s `ci.ts`, where it is unit-tested against real broken
 * fixtures. It is not the implementation because AGENTS.md section 8 forbids running tests
 * from the repository root — a runner living in `scripts/` could never be tested without
 * violating the very rule it exists to enforce.
 *
 * ## The flags
 *
 *  - `--only=typecheck` / `--only=test` narrow the run for fast iteration.
 *  - `--only=gates` and `--report-only` both take the gate-only path. `--report-only` backs
 *    the `if: always()` step in ci.yml, so it must stay cheap and must never claim a
 *    typecheck result it did not compute.
 *
 * ## Exit codes
 *
 * 0 green, 1 red, 2 could-not-start. Keeping "could not run" distinct from "ran and failed"
 * matters: conflating them is how a green tick gets recorded for a build that inspected
 * nothing.
 */

type Plan = { readonly root: string; readonly checks: readonly CheckName[]; readonly tools: Toolchain }

/**
 * The repository root, as a typecheck-only target.
 *
 * `scripts/` is where `bun run ci`, `bun run ingest` and `bun run ingest:check` actually live,
 * and `discoverPackages` globs `packages/*` and `apps/*`, so nothing else in this run touches
 * them. That gap was not theoretical: `scripts/ingest.ts` imported `SourceRegistry` from
 * `@mizan/corpus` when the schema lives in `@mizan/core`, and every package typecheck, every
 * gate and the whole test suite were green while `bun run ingest` failed on a missing export.
 * The test check is deliberately omitted — `bun test` at the root is what section 8 forbids.
 */
const rootScripts = (root: string): ExtraPlan => ({
  plan: { name: "@mizan/scripts", dir: root, rel: "scripts" } satisfies PackagePlan,
  checks: ["typecheck"],
})

/** Parse argv once, so `--only` and the gate-only decision cannot disagree. */
const parseArgs = (argv: readonly string[]) => {
  const only = argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length)
  const gatesOnly = only === "gates" || argv.includes("--report-only")
  const checks: readonly CheckName[] = only === "typecheck" || only === "test" ? [only] : ["typecheck", "test"]
  return { gatesOnly, checks }
}

const prepare = async (checks: readonly CheckName[]): Promise<Result<Plan, string>> => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) return err(root.error)
  const tools = resolveToolchain(root.value)
  if (isErr(tools)) return err(tools.error)
  return ok({ root: root.value, checks, tools: tools.value })
}

const gateReport = (gates: readonly GateOutcome[]): CiReport => ({
  packages: [],
  gates,
  ok: gates.every((outcome) => outcome.findings.length === 0),
  reasons: [],
})

const main = async (): Promise<number> => {
  const { gatesOnly, checks } = parseArgs(process.argv.slice(2))

  // The gate-only path does not need a compiler, so it runs even when tsc is missing —
  // which is exactly the case where you most want to know whether the gates are clean.
  if (gatesOnly) {
    const root = requireRepositoryRoot(import.meta.dir)
    if (isErr(root)) {
      console.error(`ci could not start: ${root.error}`)
      return 2
    }
    const report = gateReport(await runGates({ root: root.value }))
    console.log(summariseReport(report))
    console.log("(gate-only run: typecheck and test results, if any, are in the log above)")
    return report.ok ? 0 : 1
  }

  const prepared = await prepare(checks)
  if (isErr(prepared)) {
    console.error(`ci could not start: ${prepared.error}`)
    return 2
  }
  const { root, tools } = prepared.value
  const plans = await discoverPackages(root, ["packages/*", "apps/*"])
  const report = await runCi(plans, checks, tools, () => runGates({ root }), [rootScripts(root)])
  console.log(summariseReport(report))
  return report.ok ? 0 : 1
}

process.exit(await main())
