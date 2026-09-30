/**
 * The four exit codes, in one file, because there are two entry points that return them.
 *
 * ## Why this is not a constant repeated inside each entry point
 *
 * `main.ts` and `demo.ts` both end in an exit code, and a CI job that shells out to
 * `bun run demo` has to know what `1` means. The first version of `demo.ts` declared its
 * own `const EXIT_DEGRADED = 1`, which is a promise with two authors: change one and the
 * two entry points disagree, and nothing in the type system notices because a bare integer
 * is a valid exit code in any scheme. AGENTS.md section 17 is the rule this exists to
 * satisfy — one source of truth per fact, and the exit code of a degraded run is a fact a
 * judge-facing script can observe.
 *
 * ## Why `2` is usage and not "any old failure"
 *
 * A shell treats `2` specially enough that reserving it for "you invoked me wrongly" keeps
 * the difference between *the demo did not pass* and *the demo was not run correctly*
 * machine-readable. A reviewer who sees `2` knows the committed inputs are probably fine.
 *
 * ## Why nothing here throws
 *
 * These are plain numbers with plain meanings. A caller decides what to print; this module
 * only says what the process reports, so it has no error channel of its own to open.
 */

/** The run completed and every claim reached the verdict it was declared to reach. */
export const EXIT_OK = 0

/**
 * The pipeline ran honestly and could not deliver a full answer: no sources, or a model
 * output that did not verify. This is a legitimate product state (AGENTS.md section 16),
 * not a crash, and a degraded demo is still a truthful demo.
 */
export const EXIT_DEGRADED = 1

/** The command line or a committed input file was not usable. Distinct from `EXIT_DEGRADED` on purpose. */
export const EXIT_USAGE = 2

/**
 * The run happened but cannot be trusted: attestation failed, or the run ledger refused
 * the write. Never "proceed anyway" — the only response to a failed attestation is to stop
 * (AGENTS.md section 3, fail closed).
 */
export const EXIT_UNTRUSTED = 3

export * as ExitCodes from "./exit-codes.ts"
