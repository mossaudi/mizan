#!/usr/bin/env bun
import { isOk } from "@mizan/core"
import { requireRepositoryRoot } from "../src/repo-root.ts"
import { runGates, summariseOutcomes } from "../src/index.ts"

/**
 * `bun run gate` — run the six structural gates and exit non-zero on any finding.
 *
 * Deliberately minimal: no colour codes, no spinners, no `--fix`. The output of a gate is
 * evidence, and evidence should be diffable and greppable in a CI log.
 *
 * ## Why the root is derived, not inherited
 *
 * The root comes from this file's location, never from `process.cwd()`. `process.cwd()` made
 * the gate's scope depend on where the shell happened to be: invoked from the package it
 * scanned only the package, which the gate excludes, so it printed five PASS lines having
 * inspected zero files. `--root=` exists for a caller that genuinely wants a different tree.
 */

const rootArgument = process.argv.slice(2).find((argument) => argument.startsWith("--root="))?.slice("--root=".length)

const root = rootArgument ?? unwrapRoot(requireRepositoryRoot(import.meta.dir))

function unwrapRoot(result: ReturnType<typeof requireRepositoryRoot>): string {
  if (isOk(result)) return result.value
  console.error(`gate: ${result.error}`)
  console.error("The gates refuse to run against a tree they cannot identify. Pass --root=<path> if this really is a checkout.")
  process.exit(2)
}

const outcomes = await runGates({ root })

for (const outcome of outcomes) {
  const status = outcome.findings.length === 0 ? "PASS" : `FAIL (${outcome.findings.length})`
  console.log(`${outcome.gate}  ${status}`)
}

const summary = summariseOutcomes(outcomes)
if (summary.length > 0) {
  console.error(`\n${summary}`)
  process.exit(1)
}

console.log(`\nall gates passed (root: ${root})`)
