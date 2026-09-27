import type { CorpusRecord } from "@mizan/core"

/**
 * Which records never reach the snapshot, and why.
 *
 * ## The rule, and the trap in it
 *
 * A hadith row whose grade is empty is **quarantined**: it is not served, it is counted, and the
 * count is reported. The trap is that the same emptiness is *valid* for the Qur'an, which has no
 * Sahih/Da'if grade because the concept does not apply to it. A naive "empty grade is a defect"
 * check quarantines all 6,236 Tanzil verses and fails the build on day one — the rule is
 * therefore keyed on `gradeApplicable`, which is the field that distinguishes "the source should
 * have said and did not" from "there is nothing to say".
 *
 * ## Why quarantine and not default
 *
 * The forbidden alternative is filling the gap with a plausible grade. A grade is a religious
 * ruling (ADR-06); inventing one and showing it to someone making a decision is the specific
 * harm this project exists to avoid, and it is indistinguishable from a correct one once it is in
 * the database. Refusing to serve the row is the only honest option, so `no sources found` is
 * the answer a user gets instead of a fabricated takhrij.
 */
export type QuarantineReason = "missing_required_grade"

export type QuarantinedRecord = {
  readonly id: string
  readonly collection: string
  readonly reason: QuarantineReason
}

/** The reason this record is quarantined, or `null` if it may be served. */
export const quarantineReason = (record: CorpusRecord): QuarantineReason | null => {
  if (!record.gradeApplicable) return null
  if (record.grade !== null && record.grade.trim().length > 0) return null
  return "missing_required_grade"
}

export type QuarantinePartition = {
  readonly served: readonly CorpusRecord[]
  readonly quarantined: readonly QuarantinedRecord[]
}

/**
 * Split records into those that may be served and those that may not.
 *
 * Order is preserved on both sides, so a record's position in the snapshot stays a function of
 * the source rather than of this function's internals.
 */
export const partitionQuarantined = (records: readonly CorpusRecord[]): QuarantinePartition => {
  const served: CorpusRecord[] = []
  const quarantined: QuarantinedRecord[] = []
  for (const record of records) {
    const reason = quarantineReason(record)
    if (reason === null) {
      served.push(record)
      continue
    }
    quarantined.push({ id: record.id, collection: record.collection, reason })
  }
  return { served, quarantined }
}

export * as Quarantine from "./quarantine.ts"
