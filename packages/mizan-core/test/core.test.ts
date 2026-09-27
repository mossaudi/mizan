import { describe, expect, test } from "bun:test"
import { canonicalJson } from "../src/json.ts"
import { GENESIS_PREV_HASH, isSha256Hex, sha256Hex, shortHash } from "../src/hash.ts"
import { describeError, err, errorTag, flatMap, isErr, isOk, mapError, mapResult, ok, unwrapOrThrow, type Result } from "../src/result.ts"
import { withDeadline } from "../src/time.ts"
import { decodeOrFail, decodeSync, type DecodeFailure } from "../src/schema/decode.ts"
import { Schema } from "effect"

describe("Result", () => {
  test("ok and err carry values and errors", () => {
    const good: Result<number, string> = ok(1)
    const bad: Result<number, string> = err("nope")
    expect(isOk(good)).toBe(true)
    expect(isErr(bad)).toBe(true)
    expect(good.ok ? good.value : null).toBe(1)
    expect(bad.ok ? null : bad.error).toBe("nope")
  })

  test("map and flatMap only touch the matching channel", () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual({ ok: true, value: 4 })
    expect(mapResult(err<string>("e"), (n: number) => n * 2)).toEqual({ ok: false, error: "e" })
    expect(flatMap(ok(2), (n) => ok(n + 1))).toEqual({ ok: true, value: 3 })
    expect(flatMap(err<string>("e"), (n: number) => ok(n + 1))).toEqual({ ok: false, error: "e" })
    expect(mapError(err<string>("e"), (e) => `${e}!`)).toEqual({ ok: false, error: "e!" })
    expect(mapError(ok(1), (e: string) => `${e}!`)).toEqual({ ok: true, value: 1 })
  })

  test("errorTag and describeError never leak a payload", () => {
    expect(errorTag({ _tag: "attestation_mismatch" })).toBe("attestation_mismatch")
    expect(errorTag(new Error("boom"))).toBe("unknown_error")
    expect(describeError({ _tag: "empty_query" })).toBe("empty_query")
    expect(describeError("plain")).toBe("plain")
  })

  test("unwrapOrThrow is a test/script helper and reports the error tag", () => {
    expect(unwrapOrThrow(ok(5), "ctx")).toBe(5)
    expect(() => unwrapOrThrow(err("bad_thing"), "ctx")).toThrow(/bad_thing/)
  })
})

describe("canonicalJson", () => {
  test("key order is fixed, so two structurally equal objects digest identically", () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } }
    const b = { c: { y: 2, z: 1 }, a: 2, b: 1 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
    expect(canonicalJson(a)).toBe(`{"a":2,"b":1,"c":{"y":2,"z":1}}`)
  })

  test("undefined object values are omitted, array order is preserved", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe(`{"b":1}`)
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]")
  })

  test("a non-finite number has no canonical form and is refused", () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow()
  })
})

describe("hashing", () => {
  test("sha256 is stable, hex, and 64 chars", () => {
    const digest = sha256Hex("mizan")
    expect(isSha256Hex(digest)).toBe(true)
    expect(digest).toBe(sha256Hex("mizan"))
    expect(digest).not.toBe(sha256Hex("mizan "))
  })

  test("the genesis prevHash is 64 zeroes and is not a real digest of anything", () => {
    expect(GENESIS_PREV_HASH).toBe("0".repeat(64))
    expect(isSha256Hex(GENESIS_PREV_HASH)).toBe(true)
  })

  test("shortHash is a prefix of the full digest", () => {
    expect(shortHash("mizan", 8)).toBe(sha256Hex("mizan").slice(0, 8))
  })
})

describe("decode seam", () => {
  const Sample = Schema.Struct({ a: Schema.String, n: Schema.Number, o: Schema.optional(Schema.String) })

  test("a valid payload decodes", () => {
    const decoded = decodeOrFail(decodeSync(Sample), { a: "x", n: 1 }, "Sample")
    expect(isOk(decoded)).toBe(true)
  })

  test("an invalid payload becomes a typed failure, never a throw and never the payload", () => {
    const decoded = decodeOrFail(decodeSync(Sample), { a: 1, n: "y" }, "Sample")
    if (isOk(decoded)) throw new Error("expected a decode failure")
    const failure: DecodeFailure = decoded.error
    expect(failure._tag).toBe("decode_failed")
    expect(failure.schema).toBe("Sample")
    expect(failure.detail.length).toBeGreaterThan(0)
    expect(failure.detail).not.toContain("object")
  })

  test("the failure names what was wrong, not merely that something was", () => {
    // This message is the one a person sees when a committed artefact is malformed, in
    // `verify:ledger` and `ingest:check`. The beta throws a SchemaError, which is not an
    // Error, so a catch that only understands Error used to report "non-error value thrown
    // by the decoder" — technically true and completely useless.
    const wrongType = decodeOrFail(decodeSync(Sample), { a: 1, n: 1 }, "Sample")
    if (isOk(wrongType)) throw new Error("expected a decode failure")
    expect(wrongType.error.detail).toContain("string")
    expect(wrongType.error.detail).not.toContain("non-error value")

    const missingKey = decodeOrFail(decodeSync(Sample), { a: "x" }, "Sample")
    if (isOk(missingKey)) throw new Error("expected a decode failure")
    expect(missingKey.error.detail).toContain("Missing")
    expect(missingKey.error.detail).toContain("n")
  })

  test("a decode failure never echoes the offending payload", () => {
    // A hostile or enormous artefact must not reach a log line or a console.
    const secret = "SECRET-PAYLOAD-".repeat(200)
    const decoded = decodeOrFail(decodeSync(Sample), { a: secret, n: "not a number" }, "Sample")
    if (isOk(decoded)) throw new Error("expected a decode failure")
    expect(decoded.error.detail).not.toContain(secret)
  })
})

describe("withDeadline", () => {
  test("a fast body wins the race and the timer is cleared", async () => {
    const value = await withDeadline(1_000, async () => "done", () => "timeout")
    expect(value).toBe("done")
  })

  test("a slow body degrades to the honest value, never a fabricated success", async () => {
    const value = await withDeadline(
      10,
      () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 200)),
      () => "timeout",
    )
    expect(value).toBe("timeout")
  })
})
