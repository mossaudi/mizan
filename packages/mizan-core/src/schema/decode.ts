import { Schema } from "effect"
import { err, ok, type Result } from "../result.ts"

/**
 * The untrusted-boundary decode seam.
 *
 * `effect@4.0.0-beta.83` is a beta, and ADR-02 confines its exposure to exactly this
 * file: every other module reaches schema decoding through `decodeOrFail`, and a
 * CI gate asserts that `Schema.decodeUnknownSync` is bound nowhere else. If the beta
 * changes shape in a patch release, this module is the only thing that has to move.
 *
 * Nothing here throws. A decode failure becomes a `Result` error carrying the schema
 * name and the first line of the issue — never the offending payload, which is
 * untrusted and may be enormous.
 */

export type DecodeFailure = { readonly _tag: "decode_failed"; readonly schema: string; readonly detail: string }

export type Decodable<A> = (input: unknown) => A

/**
 * The single binding of the beta decode function.
 *
 * Re-exported so that `Schema.decodeUnknownSync` appears in exactly one file in the
 * whole repository. Gate G-1 asserts that.
 */
export const decodeSync = Schema.decodeUnknownSync

/**
 * Pull the first human-readable message out of a `SchemaError`.
 *
 * In this beta the decoder throws a `SchemaError` whose `issue` is a JSON-serialisable tree,
 * not an `Error` with a `message`. A `catch` that only understands `Error` therefore reports
 * "non-error value thrown by the decoder", which tells a person debugging a malformed
 * committed file nothing at all — and the one place this message is shown to a human is
 * `bun run verify:ledger` and `ingest:check`. So the issue tree is searched for the deepest
 * concrete complaint ("Expected array, got \"nope\"").
 *
 * Bounded depth and no recursion into arrays of primitives: this runs on untrusted input, and
 * an issue tree from a hostile payload must not be able to make us walk forever.
 */
const MAX_ISSUE_DEPTH = 8

const issueMessage = (issue: unknown, depth = 0): string | null => {
  if (depth >= MAX_ISSUE_DEPTH) return null
  if (typeof issue !== "object" || issue === null) return null
  const record = issue as Record<string, unknown>

  const own = record.message
  if (typeof own === "string" && own.length > 0) return own

  for (const key of ["issue", "issues", "problems"]) {
    const nested = record[key]
    if (nested === undefined) continue
    if (Array.isArray(nested)) {
      for (const child of nested) {
        const found = issueMessage(child, depth + 1)
        if (found !== null) return found
      }
      continue
    }
    const found = issueMessage(nested, depth + 1)
    if (found !== null) return found
  }
  return null
}

const firstLine = (cause: unknown): string => {
  if (cause instanceof Error) {
    const line = cause.message.split("\n")[0]
    if (line === undefined) return "unknown decode failure"
    return line.length > 200 ? `${line.slice(0, 200)}.` : line
  }
  const fromIssue = issueMessage(cause)
  if (fromIssue !== null) return fromIssue.length > 200 ? `${fromIssue.slice(0, 200)}.` : fromIssue
  return "non-error value thrown by the decoder"
}

/**
 * Decode `input` through `schema`, or return a typed failure.
 *
 * @param schemaName a stable identifier used in traces and error messages, never a
 *   generated type string.
 */
export const decodeOrFail = <A>(schema: Decodable<A>, input: unknown, schemaName: string): Result<A, DecodeFailure> => {
  try {
    return ok(schema(input))
  } catch (cause) {
    return err({ _tag: "decode_failed", schema: schemaName, detail: firstLine(cause) })
  }
}

/** A short, log-safe rendering of a decode failure. */
export const describeDecodeFailure = (failure: DecodeFailure): string => `${failure.schema}: ${failure.detail}`

export * as Decode from "./decode.ts"
