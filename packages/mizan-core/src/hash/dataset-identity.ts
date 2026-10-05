import { canonicalJson } from "../json.ts"
import { sha256Hex } from "../hash.ts"
import { err, ok, type Result } from "../result.ts"
import type { DecodeFailure } from "../schema/decode.ts"

/**
 * Dataset identity — the digest that answers "are these two numbers about the same data?"
 * before anybody asks "did the numbers move?" (ADR-17, Story 4).
 *
 * ## Why this is its own module and not another key in `vs-search.json`
 *
 * A relative gate that compares a current artefact against a baseline has exactly two ways to be
 * wrong, and only one of them is visible to the naked eye. The visible one is the number moving.
 * The invisible one is the DATA moving underneath a number that did not: a regenerated eval set
 * changes the denominator, the aggregate rate can stay identical, and the comparison reports a
 * pass. That is a gate reading green over evidence that was never comparable, which is worse than
 * no gate — it converts a missing check into a present-looking one.
 *
 * So identity is a first-class value with three properties, none of which a bare hash string has:
 *
 *  1. **Versioned.** `ds1:` is a prefix, not decoration. When the canonical form changes, the
 *     prefix changes with it, and every artefact written under the old rule becomes *unknown*
 *     rather than *matching*. An identity that silently keeps meaning something new is the failure
 *     mode a version number exists to prevent.
 *  2. **Order-independent.** `canonicalJson` is applied first, so re-serialising the same logical
 *     dataset with its keys in a different order yields the same digest. Without this, a
 *     `JSON.stringify` that happened to emit `{"a":1,"b":2}` once and `{"b":2,"a":1}` the next run
 *     would report a corpus change where none happened.
 *  3. **Fail-closed.** `identityMismatch` returns `Result<never, string>`: it cannot produce a
 *     delta at all, so there is no code path where a caller computes one anyway and only *warns*.
 *     An absent identity is a refusal, never a match — treating "unknown" as "equal" is the
 *     single most dangerous line this repository could contain, because every relative gate would
 *     read green on a baseline committed before digests existed.
 *
 * ## What this digest is NOT
 *
 * It is an integrity identity, not a confidentiality claim. It is one-way over content, and the
 * report publishes the digest and never the content it covers — so a published digest lets a reader
 * confirm two reports describe the same artefact and cannot let them recover a row, a quote or a
 * question from it (AGENTS.md section 13).
 *
 * ## Why the environment is not an input
 *
 * Nothing here reads the ambient environment. A digest whose material included it would change
 * when a key was set, which would make "same data?" answer "no" for a reason that has nothing to
 * do with the data. `packages/mizan-core/test/dataset-identity.test.ts` pins this twice: the
 * module source is asserted to contain no environment read at all, and a digest is computed with
 * the API key variable set and unset and asserted equal.
 *
 * ## One definition (AGENTS.md section 17)
 *
 * The canonical form is `canonicalJson` in `json.ts` and the hash primitive is `sha256Hex` in
 * `hash.ts`; this module composes them and declares nothing of its own except the version prefix
 * and the refusal rule. A second `sha256` over `JSON.stringify` would be a second answer to "what
 * is this artefact's identity", and two answers is how a repository ends up comparing digests that
 * were never computed the same way.
 */

/** The rule version, prefixed onto every digest this module produces. */
export const DATASET_DIGEST_VERSION = "ds1"

/** The separator between the version prefix and the hex body. Never a control character. */
const VERSION_SEPARATOR = ":"

/**
 * `ds1:<64 hex>`, anchored.
 *
 * A digest that fails this is *unknown*, never *mismatched* — the distinction is the whole reason
 * `identityMismatch` refuses rather than compares. Anchored so a string carrying a valid digest
 * inside prose (`"see ds1:abc... for details"`) does not pass as an identity.
 */
const DATASET_DIGEST = /^ds1:[0-9a-f]{64}$/

/** Whether a string is a digest this module's rule could have produced. */
export const isDatasetDigest = (value: string): boolean => DATASET_DIGEST.test(value)

/**
 * The canonical identity of a decoded dataset.
 *
 * `Result`, not a string, because `canonicalJson` genuinely can fail — a non-finite number has no
 * canonical form and `json.ts` throws a `TypeError` rather than inventing one. Letting that escape
 * would put a raw `TypeError` at a report boundary (AGENTS.md section 2), so it is converted here
 * into the same typed shape every other untrusted-value refusal in this package uses.
 */
export const digestOf = (value: unknown): Result<string, DecodeFailure> => {
  let serialised: string
  try {
    serialised = canonicalJson(value)
  } catch (cause) {
    return err({
      _tag: "decode_failed",
      schema: "DatasetIdentity",
      detail: cause instanceof Error ? cause.message : String(cause),
    })
  }
  return ok(`${DATASET_DIGEST_VERSION}${VERSION_SEPARATOR}${sha256Hex(serialised)}`)
}

/** One wording for every identity, so a refusal never prints `undefined` or an empty string. */
const describeIdentity = (value: string | null | undefined): string =>
  typeof value !== "string" || value.length === 0 ? "(none)" : value.length > 80 ? `${value.slice(0, 77)}...` : value

/**
 * The success value of `identityMismatch`: a value of type `never`.
 *
 * `never` is the point rather than an inconvenience. `Result<void, E>` would let `flatMap` run its
 * continuation on a success, and a caller that computed a delta across two identities and merely
 * printed the refusal beside it would typecheck. With `never` there is no value to continue on, so
 * the only compiling code path after a match is the one that treats the comparison as permitted.
 */
const NEVER_RESULT: never = undefined as never

/**
 * A refusal to compare, naming BOTH identities.
 *
 * `Result<never, string>` is the load-bearing part of the type: there is no success channel to
 * return a delta on, so a caller cannot compute one and merely print a warning beside it. The
 * message names both digests because "the identities differ" sends the next engineer looking in
 * the wrong place, while `baseline ds1:aaa... vs current ds1:bbb...` sends them to the two artefacts.
 *
 * ## Three refusals, not two
 *
 *  - **absent** — a baseline written before digests existed. Treated as a mismatch, never as a
 *    match, because "I cannot tell" and "they are the same" are not the same answer.
 *  - **unknown-version** — a digest whose prefix is not `ds1`. Also a mismatch: the two digests
 *    were computed by different rules, so they are not comparable regardless of their bodies.
 *  - **mismatch** — two well-formed `ds1` digests that differ.
 *
 * All three are refusals and all three name what they were compared with, so one code path in the
 * caller covers all of them and no caller has to re-derive the taxonomy.
 */
export const identityMismatch = (baseline: string | null | undefined, current: string | null | undefined): Result<never, string> => {
  if (typeof baseline !== "string" || baseline.length === 0 || typeof current !== "string" || current.length === 0) {
    return err(`dataset identity absent — baseline ${describeIdentity(baseline)}, current ${describeIdentity(current)}; absent identity is a refusal, never a match`)
  }
  if (!isDatasetDigest(baseline) || !isDatasetDigest(current)) {
    return err(`dataset identity not comparable — baseline ${describeIdentity(baseline)}, current ${describeIdentity(current)}; only ${DATASET_DIGEST_VERSION}:<64 hex> can be compared, and two identities from different rules are never equal`)
  }
  if (baseline === current) return ok(NEVER_RESULT)
  return err(`dataset identity mismatch — baseline ${baseline}, current ${current}; no delta is computed across two identities`)
}

export * as DatasetIdentity from "./dataset-identity.ts"
