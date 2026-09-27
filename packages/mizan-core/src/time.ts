import { err, ok, type Result } from "./result.ts"

/**
 * Time budgets.
 *
 * The clock lives here, in core, and **no verdict-path module may import it** — gate
 * G-1 asserts that. The verifier is pure: it has no clock, no randomness and no locale,
 * which is what makes its verdicts byte-identical across repeated runs.
 *
 * Every timeout in the degradation matrix is *caller-side* for that reason: a pure
 * function cannot time itself out, and it does not need to, because it is O(claims ×
 * resolved records) over pre-folded strings.
 */

export type Deadline = { readonly startedAtMs: number; readonly budgetMs: number }

/** ISO-8601 UTC. Trace metadata only — timestamps are never hashed (see provenance). */
export const nowIso = (): string => new Date().toISOString()

export const startDeadline = (budgetMs: number): Deadline => ({ startedAtMs: Date.now(), budgetMs })

export const elapsedMs = (deadline: Deadline): number => Date.now() - deadline.startedAtMs

export const isExpired = (deadline: Deadline): boolean => elapsedMs(deadline) > deadline.budgetMs

/**
 * Race `work` against the budget.
 *
 * The timer is always cleared, including on the success path, so a long CI run does
 * not accumulate pending timers. `onTimeout` returns the honest degraded value; it
 * must never return a success-shaped value that did not happen.
 */
export const withDeadline = async <T>(budgetMs: number, work: () => Promise<T>, onTimeout: () => T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), budgetMs)
  })
  try {
    return await Promise.race([work(), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * `withDeadline` for a fallible body, converting a timeout into a typed error.
 * Used by the agent, which needs the `Result` channel rather than a value.
 */
export const withDeadlineResult = async <T, E>(
  budgetMs: number,
  work: () => Promise<Result<T, E>>,
  onTimeout: (elapsed: number) => Result<T, E>,
): Promise<Result<T, E>> =>
  withDeadline(
    budgetMs,
    work,
    () => onTimeout(budgetMs),
  )

/** Re-exported so callers do not reach into `result.ts` for the timeout branch. */
export const timedOut = <E>(error: E): Result<never, E> => err(error)

/** `ok` re-exported for the same reason. */
export const succeeded = <T>(value: T): Result<T, never> => ok(value)

export * as Time from "./time.ts"
