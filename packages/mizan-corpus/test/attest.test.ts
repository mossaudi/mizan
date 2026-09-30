import { describe, expect, test } from "bun:test"
import { isErr, isOk } from "@mizan/core"
import {
  attestSnapshot,
  attestSnapshotUnchanged,
  attestationUnreadable,
  describeAttestationProblem,
  type SnapshotIdentity,
} from "../src/attest.ts"
import { decodeAttestationText, describeReadFailure } from "../src/ledger.ts"

/**
 * `attest.ts` in unit form, and the reason this file exists.
 *
 * ## Why these needed their own file
 *
 * `attestSnapshot` had **no direct test at all** before this file. It was exercised only end to end,
 * through `apps/cli/test/benchmark-refusal.test.ts` and the CLI, which covers two of its branches —
 * a hash mismatch and a record-count mismatch — and says nothing about `attestationUnreadable`'s
 * own constructor, about `describeAttestationProblem`'s wording per tag, or about
 * `attestSnapshotUnchanged`. A module on the repository's integrity path whose failure vocabulary
 * had never been read by a test is a module whose vocabulary can drift silently.
 *
 * ## What "log-safe" is asserted to mean
 *
 * `describeAttestationProblem`'s contract is that it names FIELDS and COUNTS and never content,
 * because its output goes to stderr on a path that also prints a snapshot hash. The assertions here
 * check the shape of that sentence rather than pinning it exactly: pinning a full English string
 * makes every rewording a test failure, and a rewording is not a defect. What would be a defect is
 * the tag disappearing, because that is the part callers key on.
 */

const HASH = "a".repeat(64)
const OTHER_HASH = "b".repeat(64)

const identity = (overrides: Partial<SnapshotIdentity> = {}): SnapshotIdentity => ({
  snapshotHash: HASH,
  recordCount: 27234,
  ...overrides,
})

/** A decodable `Attestation` whose identity is `id`. Never hand-rolled half a shape. */
const attestationText = (id: SnapshotIdentity): string =>
  JSON.stringify({
    schemaVersion: "1.0.0",
    generatedAt: "2026-01-01T00:05:00.000Z",
    snapshotHash: id.snapshotHash,
    recordCount: id.recordCount,
    quarantinedRows: 0,
    collectionCounts: { quran: 6236 },
    sources: [],
    chainHead: HASH,
    chainLength: 2,
  })

describe("attestSnapshot — the corpus on disk against the corpus we authorised", () => {
  test("an agreement is accepted and hands back the decoded attestation", () => {
    const decoded = attestSnapshot(attestationText(identity()), identity())
    if (isErr(decoded)) throw new Error(`unexpected: ${describeAttestationProblem(decoded.error)}`)
    expect(decoded.value.snapshotHash).toBe(HASH)
  })

  test("a different hash is a mismatch, and the message names the field", () => {
    const decoded = attestSnapshot(attestationText(identity()), identity({ snapshotHash: OTHER_HASH }))
    if (isOk(decoded)) throw new Error("a hash disagreement was accepted")
    expect(decoded.error._tag).toBe("attestation_mismatch")
    // The operator's next action is to open `attestation.json` and look at one named field, so the
    // sentence has to carry the field's own name rather than the English word for it.
    expect(describeAttestationProblem(decoded.error)).toContain("snapshotHash")
  })

  test("a matching hash with a different count is still a mismatch, and names the count", () => {
    // The hash covers the records, so this pair cannot arise from a healthy write. It is exactly
    // what a partially-applied one looks like, and reporting only the hash would leave an operator
    // looking at a file whose digest is right.
    const decoded = attestSnapshot(attestationText(identity()), identity({ recordCount: 3 }))
    if (isOk(decoded)) throw new Error("a record-count disagreement was accepted")
    expect(decoded.error._tag).toBe("attestation_mismatch")
    expect(describeAttestationProblem(decoded.error)).toContain("recordCount")
  })

  test("an unreadable file is refused before any comparison is attempted", () => {
    const decoded = attestSnapshot("{ not json", identity())
    if (isOk(decoded)) throw new Error("an unparseable attestation was accepted")
    expect(decoded.error._tag).toBe("attestation_unreadable")
  })

  test("valid JSON that is not an Attestation is refused too, not coerced", () => {
    const decoded = attestSnapshot(JSON.stringify({ snapshotHash: HASH, recordCount: 27234 }), identity())
    if (isOk(decoded)) throw new Error("a partial attestation was accepted")
    expect(decoded.error._tag).toBe("attestation_unreadable")
  })

  test("an empty file is a refusal, not an attestation with no fields", () => {
    const decoded = attestSnapshot("", identity())
    if (isOk(decoded)) throw new Error("an empty attestation was accepted")
    expect(decoded.error._tag).toBe("attestation_unreadable")
  })

  test("an on-disk identity with an unusable count is refused, not accepted", () => {
    // The count is the only field whose TYPE the caller can get wrong, because `readSnapshotMeta`
    // hands back whatever the column holds and each surface applies `Number()` itself. `NaN`
    // compares unequal to everything, so this fails closed — which is the property that matters
    // here — and it fails as a mismatch rather than as an unreadable file, because the committed
    // attestation WAS read successfully and the disagreement is with the database.
    //
    // The callers do not depend on that: `scripts/benchmark/run.ts` rejects a non-integer count
    // before it ever calls here. This assertion exists so that if that guard is ever removed, the
    // failure is still a refusal rather than a silent pass.
    const decoded = attestSnapshot(attestationText(identity()), identity({ recordCount: Number.NaN }))
    if (isOk(decoded)) throw new Error("a NaN record count was accepted")
    expect(decoded.error._tag).toBe("attestation_mismatch")
  })
})

describe("describeAttestationProblem — one sentence per tag, and the tag survives", () => {
  test("each tag prints itself, so a caller can key on it without reading English", () => {
    const tags = [
      attestationUnreadable("attestation.json does not exist"),
      { _tag: "attestation_mismatch", detail: "field x" } as const,
      { _tag: "corpus_replaced_during_read", detail: "field y" } as const,
    ]
    for (const problem of tags) {
      expect(describeAttestationProblem(problem)).toContain(problem._tag)
    }
  })

  test("an unreadable file is named as a file, not as a comparison failure", () => {
    const sentence = describeAttestationProblem(attestationUnreadable("attestation.json does not exist"))
    expect(sentence).toContain("attestation.json")
  })

  test("a mismatch names only the difference, so it does not imply the file was unreadable", () => {
    const sentence = describeAttestationProblem({ _tag: "attestation_mismatch", detail: "recordCount 3 was 27234" })
    expect(sentence).not.toContain("could not be read")
  })
})

describe("attestSnapshotUnchanged — the corpus must survive its own long read", () => {
  /**
   * What these tests do and do not prove, stated before the assertions rather than after.
   *
   * They prove the DECISION: which of the two fields is compared, in what order, what each
   * disagreement says, and that an unchanged corpus passes. They do not provoke a real concurrent
   * write, because doing so needs a second writer winning a race against the benchmark's 40 queries
   * — timing-dependent, different on POSIX and Windows, and therefore a flaky CI job, which
   * AGENTS.md section 14 calls a defect rather than noise. The runner's call to this function is one
   * line and is covered by `benchmark-refusal.test.ts` for the sibling refusals; the race itself is
   * covered by construction rather than by timing, and this comment is where that is said out loud.
   */
  test("an unchanged corpus passes and hands back the identity it was given", () => {
    const before = identity()
    const checked = attestSnapshotUnchanged(before, { snapshotHash: HASH, recordCount: 27234 })
    if (isErr(checked)) throw new Error(`unexpected: ${describeAttestationProblem(checked.error)}`)
    expect(checked.value).toEqual(before)
  })

  test("a replaced corpus is refused under its OWN tag, not as a mismatch", () => {
    // The distinction is load-bearing: a mismatch points an operator at `attestation.json`, and here
    // `attestation.json` is innocent — the file it describes is the one that was there. A caller
    // that pattern-matched on `_tag` and was handed "mismatch" would send someone to fix the wrong
    // file.
    const checked = attestSnapshotUnchanged(identity(), identity({ snapshotHash: OTHER_HASH }))
    if (isOk(checked)) throw new Error("a replaced corpus was accepted")
    expect(checked.error._tag).toBe("corpus_replaced_during_read")
  })

  test("a replaced hash is named, so the two digests can be told apart", () => {
    const checked = attestSnapshotUnchanged(identity(), identity({ snapshotHash: OTHER_HASH }))
    if (isOk(checked)) throw new Error("a replaced corpus was accepted")
    expect(checked.error.detail).toContain("snapshotHash")
  })

  test("a moved record count alone is a drift, which is what a half-applied write looks like", () => {
    const checked = attestSnapshotUnchanged(identity(), identity({ recordCount: 27233 }))
    if (isOk(checked)) throw new Error("a changed record count was accepted")
    expect(checked.error._tag).toBe("corpus_replaced_during_read")
    expect(checked.error.detail).toContain("recordCount")
  })

  test("the hash is checked first, so a run with both fields moved is told about the digest", () => {
    // One message, one thing to act on. Reporting the count as well would produce a sentence an
    // operator has to disambiguate, and the digest is the one that identifies which corpus they are
    // now holding.
    const checked = attestSnapshotUnchanged(identity(), identity({ snapshotHash: OTHER_HASH, recordCount: 3 }))
    if (isOk(checked)) throw new Error("a replaced corpus was accepted")
    expect(checked.error.detail).toContain("snapshotHash")
  })

  test("two different corpora with the same count are still caught, because the hash is compared", () => {
    const checked = attestSnapshotUnchanged(identity({ recordCount: 27234 }), identity({ snapshotHash: OTHER_HASH }))
    if (isOk(checked)) throw new Error("a replaced corpus with an unchanged count was accepted")
  })

  test("an empty second identity is a drift, not a pass — a missing hash is not a matching hash", () => {
    // The failure mode this rules out: a re-read that finds no `snapshot_meta` row yields `""`,
    // and a comparison written as "does the new hash differ from the old" is the only thing standing
    // between that and a figure published against a corpus that may not exist.
    const checked = attestSnapshotUnchanged(identity(), { snapshotHash: "", recordCount: 27234 })
    if (isOk(checked)) throw new Error("an empty re-read identity was accepted")
    expect(checked.error._tag).toBe("corpus_replaced_during_read")
  })
})

describe("the two readers of attestation share one decoder", () => {
  test("decodeAttestationText and attestSnapshot agree on what a usable file is", () => {
    // `attestSnapshot` delegates to this decoder, so a case the decoder accepts and the comparison
    // rejects — or the reverse — is a bug in one of them rather than a disagreement about policy.
    const parsed = decodeAttestationText(attestationText(identity()))
    if (isErr(parsed)) throw new Error(`the decoder refused a file attestSnapshot accepts: ${describeReadFailure(parsed.error)}`)
    const compared = attestSnapshot(attestationText(identity()), identity())
    if (isErr(compared)) throw new Error(`the comparison refused a file the decoder accepts: ${describeAttestationProblem(compared.error)}`)
    expect(compared.value.recordCount).toBe(parsed.value.recordCount)
  })
})
