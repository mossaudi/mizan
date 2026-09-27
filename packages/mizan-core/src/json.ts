/**
 * Canonical JSON — the single serialisation used for every digest in the system.
 *
 * The registry checksum, the corpus content hash and the ledger `entryHash` must all
 * agree byte-for-byte across two runs on two machines, so key order, number
 * formatting and `undefined` handling are all fixed here rather than left to
 * `JSON.stringify` defaults (AGENTS.md section 17: one source of truth per fact).
 *
 * Rules: object keys sorted by code unit; `undefined` object values omitted; arrays
 * keep their order (order is data); no insignificant whitespace; `undefined` at the
 * top level serialises as `null`.
 */

const serialise = (value: unknown): string => {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number has no canonical form")
    return JSON.stringify(value)
  }
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) {
    const parts: string[] = []
    for (const item of value) parts.push(item === undefined ? "null" : serialise(item))
    return `[${parts.join(",")}]`
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>
    const keys = Object.keys(source).filter((key) => source[key] !== undefined).sort()
    const parts: string[] = []
    for (const key of keys) parts.push(`${JSON.stringify(key)}:${serialise(source[key])}`)
    return `{${parts.join(",")}}`
  }
  return "null"
}

export const canonicalJson = (value: unknown): string => serialise(value)

export * as Json from "./json.ts"
