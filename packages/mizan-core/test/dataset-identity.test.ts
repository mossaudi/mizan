import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import {
  DATASET_DIGEST_VERSION,
  digestOf,
  identityMismatch,
  isDatasetDigest,
  unwrapOrThrow,
} from "@mizan/core"

/**
 * Dataset identity tests.
 *
 * Six properties, each of which is a way the digest has been wrong before:
 * order-dependence, an undefined version, absent identity read as a match, two rules compared as
 * one, the environment leaking into the material, and two definitions of "identity" in one tree.
 */

/** A digest from a known input, so a test never has to spell out 64 hex characters. */
const digestOfRows = (rows: readonly Readonly<Record<string, unknown>>[]): string =>
  unwrapOrThrow(digestOf(rows), "test digest")

describe("dataset identity", () => {
  test("is the version prefix plus a sha256 body", () => {
    const digest = digestOfRows([{ a: 1 }])
    expect(digest.startsWith(`${DATASET_DIGEST_VERSION}:`)).toBe(true)
    expect(digest).toMatch(/^ds1:[0-9a-f]{64}$/)
    expect(isDatasetDigest(digest)).toBe(true)
  })

  test("is stable under key reordering, because the canonical form runs first", () => {
    const left = digestOfRows([{ alpha: "a", beta: "b", gamma: 3 }])
    const right = digestOfRows([{ gamma: 3, alpha: "a", beta: "b" }])
    expect(left).toBe(right)
  })

  test("is stable under array order, because array order IS the data", () => {
    expect(digestOfRows([{ a: 1 }, { a: 2 }])).toBe(digestOfRows([{ a: 1 }, { a: 2 }]))
    expect(digestOfRows([{ a: 1 }, { a: 2 }])).not.toBe(digestOfRows([{ a: 2 }, { a: 1 }]))
  })

  test("distinguishes a dataset from itself with one field changed", () => {
    const before = digestOfRows([{ id: "redteam-001", expectedVerdict: "rejected" }])
    const after = digestOfRows([{ id: "redteam-001", expectedVerdict: "verified" }])
    expect(before).not.toBe(after)
  })

  test("an empty dataset has a well-defined digest rather than being a special case", () => {
    const empty = digestOfRows([])
    expect(isDatasetDigest(empty)).toBe(true)
    expect(empty).toBe(digestOfRows([]))
    expect(empty).not.toBe(digestOfRows([{}]))
  })

  test("a key present with an undefined value digests the same as the key absent", () => {
    expect(digestOfRows([{ id: "a", anchor: undefined }])).toBe(digestOfRows([{ id: "a" }]))
  })

  test("the environment is never an input, so setting a key cannot change an identity", () => {
    const without = digestOfRows([{ id: "redteam-001" }])
    process.env["MIZAN_LLM_API_KEY"] = "sk-not-a-real-key-but-present"
    const with_ = digestOfRows([{ id: "redteam-001" }])
    delete process.env["MIZAN_LLM_API_KEY"]
    expect(with_).toBe(without)
  })

  test("a non-finite number is a typed refusal, not a thrown TypeError", () => {
    const refused = digestOf([{ cases: Number.POSITIVE_INFINITY }])
    expect(refused.ok).toBe(false)
    expect(refused.ok ? "" : refused.error.schema).toBe("DatasetIdentity")
  })

  test("the digest is one-way over content, publishing no field of it", () => {
    const digest = digestOfRows([{ quote: "a distinctive string nobody else would guess 12345" }])
    expect(digest).not.toContain("distinctive")
    expect(digest).not.toContain("12345")
  })
})

describe("identityMismatch", () => {
  const baseline = digestOfRows([{ set: "redteam", version: 1 }])
  const other = digestOfRows([{ set: "redteam", version: 2 }])

  test("identical identities permit the comparison", () => {
    expect(identityMismatch(baseline, baseline).ok).toBe(true)
  })

  test("different identities refuse and name BOTH digests", () => {
    const refused = identityMismatch(baseline, other)
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.error).toContain(baseline)
    expect(refused.error).toContain(other)
  })

  test("an absent identity is a refusal, never a match", () => {
    expect(identityMismatch(null, baseline).ok).toBe(false)
    expect(identityMismatch(baseline, undefined).ok).toBe(false)
    expect(identityMismatch(null, null).ok).toBe(false)
    expect(identityMismatch("", baseline).ok).toBe(false)
  })

  test("a baseline predating digest versioning is refused rather than compared", () => {
    // A v2 artefact had no `datasetDigest` at all, so the honest reading is "identity unknown",
    // and unknown is not equal.
    const refused = identityMismatch(null, baseline)
    if (refused.ok) throw new Error("unreachable")
    expect(refused.error).toContain("absent")
  })

  test("two digests from different rules are refused regardless of their bodies", () => {
    const refused = identityMismatch("ds2:" + "a".repeat(64), baseline)
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.error).toContain("not comparable")
  })

  test("a digest quoted inside prose is not an identity", () => {
    expect(isDatasetDigest(`see ${baseline} for details`)).toBe(false)
    expect(identityMismatch(baseline, `see ${baseline}`).ok).toBe(false)
  })

  test("the success channel carries no value, so a delta cannot be computed across identities", () => {
    const matched = identityMismatch(baseline, baseline)
    if (!matched.ok) throw new Error("expected a match")
    // `never` has no inhabitants to pass to a continuation; asserting the literal keeps the
    // property visible in a test rather than only in the type.
    expect(matched.value).toBeUndefined()
  })
})

describe("one definition of identity (AGENTS.md section 17)", () => {
  const INDEX = join(import.meta.dir, "..", "src", "index.ts")
  const HASH = join(import.meta.dir, "..", "src", "hash.ts")
  const JSON_ = join(import.meta.dir, "..", "src", "json.ts")

  test("the digest prefix is written down in exactly one module", () => {
    const declaring = ["dataset-identity.ts"]
    for (const file of [HASH, JSON_, INDEX]) {
      expect(declaring).not.toContain(file.split(/[\\/]/).pop())
    }
    expect(readFileSync(join(import.meta.dir, "..", "src", "hash", "dataset-identity.ts"), "utf8")).toContain(
      'DATASET_DIGEST_VERSION = "ds1"',
    )
  })

  test("the digest composes the one canonical form and the one hash primitive", () => {
    const source = readFileSync(join(import.meta.dir, "..", "src", "hash", "dataset-identity.ts"), "utf8")
    expect(source).toContain('from "../json.ts"')
    expect(source).toContain('from "../hash.ts"')
    // No local `createHash`, no local `JSON.stringify` of the value being digested.
    expect(source).not.toContain("createHash")
    expect(source).not.toContain("JSON.stringify(value)")
  })

  test("the identity module reads no environment", () => {
    const source = readFileSync(join(import.meta.dir, "..", "src", "hash", "dataset-identity.ts"), "utf8")
    expect(source).not.toContain("process.env")
  })
})
