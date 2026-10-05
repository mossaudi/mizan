/**
 * Served collections - the single source of truth for what the attested corpus contains.
 *
 * This module reads ttestation.collectionCounts and returns the served collections
 * in a deterministic, typed form. It is used by the gate rules and eval scripts to
 * ensure coverage assertions are derived from the same source (AGENTS.md §17).
 */

import { decodeOrFail, err, isErr, ok, type Result } from "@mizan/core"
import { AttestationSchema } from "./ledger.ts"

export type ServedCollection = {
  readonly key: string
  readonly recordCount: number
}

/**
 * Decode served collections from the attestation JSON text.
 * Returns sorted by key ascending for determinism.
 */
export const servedCollections = (attestationText: string): Result<readonly ServedCollection[], string> => {
  const decoded = decodeOrFail(AttestationSchema, JSON.parse(attestationText))
  if (isErr(decoded)) {
    return err("Attestation is not decodable: " + decoded.value)
  }

  const attestation = decoded.value
  const counts = attestation.collectionCounts as Record<string, unknown>

  const served: ServedCollection[] = []
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      served.push({ key, recordCount: value })
    }
  }

  served.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
  return ok(served)
}
