import { createHash } from "node:crypto"
import { canonicalJson } from "./json.ts"

/**
 * Hashing. SHA-256 only, and only for content identity: the corpus snapshot digest,
 * the registry checksum, the chain entry hash, and the question hash in a trace.
 *
 * Not I/O and not a clock, so this belongs in a package that is forbidden from
 * either (AGENTS.md section 9).
 */

export const sha256Hex = (input: string): string => createHash("sha256").update(input, "utf8").digest("hex")

/** A truncated digest for logs and UI. A full 64-char digest is noise in a badge. */
export const shortHash = (input: string, length: number = 12): string => sha256Hex(input).slice(0, length)

/** The genesis `prevHash` of a hash chain: 64 zeroes, never a real digest. */
export const GENESIS_PREV_HASH = "0".repeat(64)

export const isSha256Hex = (value: string): boolean => /^[0-9a-f]{64}$/.test(value)

/**
 * The chain-digest rule, in one place: `sha256(prevHash + "|" + canonicalJson(payload))`.
 *
 * ## Why the COMBINING rule lives here and not in each chain
 *
 * There are two chains in this repository — the ingest ledger in `mizan-corpus` and the
 * per-run trace ledger — and they hash different payloads. What they must NOT do is invent
 * two different ways of combining `prevHash` with a payload, because the two chains are read
 * by the same judge with the same mental model ("link N carries the digest of link N-1"), and
 * a discrepancy there looks like tampering. AGENTS.md section 17: one source of truth per fact.
 *
 * Three properties are load-bearing:
 *
 *  - `canonicalJson` sorts keys, so the digest does not depend on property order in the
 *    object literal. A refactor that reorders two fields must not look like a corpus change.
 *  - `prevHash` is INSIDE the hashed material. That is what makes a chain a chain: deleting
 *    or reordering an entry changes that entry's digest and every digest after it.
 *  - the separator is a literal `|`, never a control character. A NUL written in place of a
 *    separator is invisible in review and in a diff, and it makes two different payloads
 *    serialise to the same material — a silent collision in the one place where a collision
 *    means "this record was never tampered with". See `CHAIN_SEPARATOR`.
 */
export const CHAIN_SEPARATOR = "|"

export const chainHash = (prevHash: string, payload: unknown): string =>
  sha256Hex(`${prevHash}${CHAIN_SEPARATOR}${canonicalJson(payload)}`)

export * as Hash from "./hash.ts"
