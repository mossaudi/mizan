#!/usr/bin/env bun
/**
 * The repository-root `test` script, which REFUSES.
 *
 * ## Why a script whose entire job is to fail
 *
 * AGENTS.md section 8: `bun test` at the repository root globs every package's tests,
 * silently skips any package that fails to load, and can exit 0 having collected nothing. A
 * green tick from a run that tested nothing is the most expensive kind of lie in a project
 * whose whole claim is that its results are computed rather than asserted.
 *
 * So `bun run test` at the root does not run tests. It explains why, and exits non-zero, so
 * nobody "fixes" it into a misleading pass by editing the line away. The only supported way
 * to run the suite is `bun run ci`, which iterates packages explicitly and names the one
 * that failed.
 *
 * Exit code 1, deliberately, and the message says the useful command rather than only
 * saying no.
 */

const MESSAGE = [
  "",
  "Refusing to run `bun test` from the repository root.",
  "",
  "At the root, bun globs every package's tests, skips any package that fails to load, and",
  "can exit 0 having collected nothing. A green tick that tested nothing is worse than no",
  "tick at all.",
  "",
  "Run the suite the supported way instead — it iterates packages and names the one that failed:",
  "",
  "    bun run ci              typecheck + test per package, then gates G-1..G-7",
  "    bun typecheck           types only (same run as `bun run ci:typecheck`)",
  "    bun run ci:test         tests only",
  "    bun run ci:gates        structural gates only",
  "",
  "To work on one package, cd into it first:",
  "",
  "    cd packages/mizan-verify && bun test",
  "",
  "See AGENTS.md section 8.",
  "",
].join("\n")

console.error(MESSAGE)
process.exit(1)
