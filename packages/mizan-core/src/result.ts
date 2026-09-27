/**
 * `Result<T, E>` — the only failure channel that crosses a package boundary.
 *
 * Why a hand-rolled union instead of the Effect runtime: ADR-02 adopts Effect
 * `Schema` (the high-value, low-risk part) and rejects the runtime (fibers, `Layer`,
 * `Effect`) because `4.0.0-beta.83` is a beta on a three-day critical path. A tagged
 * union also forces the caller to handle failure in the type system, which is what
 * makes "degrade to an honest state" a compile-time obligation rather than a review
 * comment. See AGENTS.md sections 2 and 3.
 */

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const isOk = <T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } => result.ok

export const isErr = <T, E>(result: Result<T, E>): result is { readonly ok: false; readonly error: E } => !result.ok

/** `map` over the success channel. Errors pass through untouched. */
export const mapResult = <T, E, U>(result: Result<T, E>, f: (value: T) => U): Result<U, E> => {
  if (isErr(result)) return result
  return ok(f(result.value))
}

/** `map` over the failure channel. Success passes through untouched. */
export const mapError = <T, E, F>(result: Result<T, E>, f: (error: E) => F): Result<T, F> => {
  if (isOk(result)) return result
  return err(f(result.error))
}

/** `flatMap` — the composition operator for a pipeline of fallible stages. */
export const flatMap = <T, E, U>(result: Result<T, E>, f: (value: T) => Result<U, E>): Result<U, E> => {
  if (isErr(result)) return result
  return f(result.value)
}

/**
 * Unwrap or throw.
 *
 * Restricted to test helpers and CLI/script entry points, where a non-zero exit is
 * the correct behaviour for an unusable state. Never call this inside a library
 * function: a throw that crosses a package boundary becomes a crash somewhere
 * unrelated, and crashing is one of the states the degradation matrix forbids.
 */
export const unwrapOrThrow = <T, E>(result: Result<T, E>, context: string): T => {
  if (isOk(result)) return result.value
  const detail = typeof result.error === "object" && result.error !== null && "_tag" in result.error
    ? JSON.stringify(result.error)
    : String(result.error)
  throw new Error(`${context}: ${detail}`)
}

/** The error's `_tag`, or a readable stand-in when the error carries none. */
export const errorTag = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return String(error)
  if ("_tag" in error && typeof error._tag === "string") return error._tag
  return "unknown_error"
}

/** A one-line, log-safe rendering of an error. Never includes input payloads. */
export const describeError = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return String(error)
  if ("_tag" in error && typeof error._tag === "string") return error._tag
  if (error instanceof Error) return error.name
  return "unknown_error"
}

export * as Result_ from "./result.ts"
