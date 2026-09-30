import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  AnchorAdjudicationSet,
  EvalSet as EvalSetSchema,
  decodeOrFail,
  decodeSync,
  isOk,
  normalizeForMatch,
  type AnchorAdjudicationSet as AdjudicationSet,
  type Claim,
  type CorpusRecord,
  type EvalCase,
  type EvalSet,
  type ResolvedCitation,
} from "@mizan/core"
import { verifyAnswer } from "../src/index.ts"
import { SNAPSHOT_HASH } from "./fixtures.ts"

/**
 * The 26 adjudicated elisions, run against the code that is supposed to agree with them — MIZ-106.
 *
 * ## Why this suite lives in the verifier package
 *
 * The success criterion is "26 of 26 cases match the code behaviour", and a match is only
 * evidence if the code under test is the real one. So nothing here is mocked: the claims, the
 * quotes, the anchors and the rulings all come from the two committed artefacts, and the verdict
 * comes from the exported `verifyAnswer`. A comment claiming parity would be worth nothing; this
 * fails loudly the day parity breaks.
 *
 * ## What it proves, and the pair that stops it proving too much
 *
 * The first test is the claim: every ruling in `adjudication.json` that classifies an elision as
 * `unverifiable` is reproduced by the verifier, 26 of them, with no tolerance. The second is the
 * mirror image — the SAME 26 claims with the anchor removed come back `rejected`, which is what
 * the procedure did before this story. Together they say the branch is what changed the answer,
 * not a quiet edit to the expectation. A test that only ran the first would pass just as happily
 * against a verifier that always answers `unverifiable`.
 *
 * ## Why the fabrications in this file stay `rejected`
 *
 * A third group — the golden set's `one_word_changed` cases — carries no anchor by construction
 * (only the 66 adjudicated cases do), so they fall through to step 6 and are accused. That is the
 * "true disproof is still rejected" negative: the elision branch must not swallow it.
 *
 * The package declares exactly one dependency and this file imports nothing but Node's `fs`,
 * `path` and that dependency; `packages/mizan-gate/src/scan.ts`'s `productionFiles` excludes
 * `test/`, so G-1's isolation rules are unaffected by a suite that reads the repository's own
 * fixtures.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..", "..")
const GOLDEN_PATH = join(REPO_ROOT, "data", "eval", "golden-normalization.json")
const ADJUDICATION_PATH = join(REPO_ROOT, "data", "eval", "adjudication.json")

/** The one class this suite is about, and the exact number of rulings the human table holds. */
const ELISION_CLASS = "elide_middle"
const ELISION_RULINGS = 26

type Observed = { readonly verdict: string; readonly reason: string }

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown

const goldenSet = (): EvalSet => {
  const decoded = decodeOrFail(decodeSync(EvalSetSchema), readJson(GOLDEN_PATH), GOLDEN_PATH)
  if (!isOk(decoded)) throw new Error(`cannot decode ${GOLDEN_PATH}: ${decoded.error.detail}`)
  return decoded.value
}

const rulings = (): AdjudicationSet => {
  const decoded = decodeOrFail(decodeSync(AnchorAdjudicationSet), readJson(ADJUDICATION_PATH), ADJUDICATION_PATH)
  if (!isOk(decoded)) throw new Error(`cannot decode ${ADJUDICATION_PATH}: ${decoded.error.detail}`)
  return decoded.value
}

/**
 * Rebuild a shipped anchor as a full `CorpusRecord`, deriving `textMatch` with the real normalizer.
 *
 * Derived rather than shipped, for the same reason `apps/cli/test/eval.test.ts` derives it: a
 * fixture carrying its own folded column could be edited to make anything contain anything.
 */
const recordOf = (set: EvalSet, anchorId: string): CorpusRecord => {
  const anchor = set.anchors.find((entry) => entry.id === anchorId)
  if (anchor === undefined) throw new Error(`elision suite: ${anchorId} is not an anchor the golden set ships`)
  return {
    id: anchor.id,
    collection: anchor.collection,
    number: anchor.number,
    grade: anchor.grade,
    gradeApplicable: anchor.gradeApplicable,
    gradeSource: anchor.gradeSource,
    gradeBasis: anchor.gradeBasis,
    attribution: anchor.attribution,
    license: anchor.license,
    licenseUrl: anchor.licenseUrl,
    sourceUrl: anchor.sourceUrl,
    textDisplay: anchor.textDisplay,
    textMatch: normalizeForMatch(anchor.textDisplay),
    translation: anchor.translation,
  }
}

/** One case as a claim. `withAnchor: false` is the pre-MIZ-106 behaviour and the negative control. */
const claimOf = (entry: EvalCase, withAnchor: boolean): Claim => ({
  id: entry.id,
  text: entry.note,
  quote: entry.quote,
  citations: [entry.citation],
  anchor: withAnchor ? entry.anchorText : undefined,
})

/** The citation resolved by hand: the set ships the row, so no database and no resolver is needed. */
const evidenceOf = (entries: readonly EvalCase[], set: EvalSet): readonly ResolvedCitation[] =>
  entries.map((entry) => ({ citation: entry.citation, records: [recordOf(set, entry.anchorId)], ambiguous: false }))

const run = (entries: readonly EvalCase[], set: EvalSet, withAnchor: boolean): ReadonlyMap<string, Observed> => {
  const report = verifyAnswer({ claims: entries.map((entry) => claimOf(entry, withAnchor)), evidence: evidenceOf(entries, set), snapshotHash: SNAPSHOT_HASH })
  return new Map(report.claims.map((claim) => [claim.claimId, { verdict: claim.verdict, reason: claim.reason }]))
}

const elisionsOf = (set: EvalSet): readonly EvalCase[] => set.cases.filter((entry) => entry.classId === ELISION_CLASS)

const golden = goldenSet()
const adjudications = rulings()
const elisions = elisionsOf(golden)
const elisionById = new Map(elisions.map((entry) => [entry.id, entry]))
const elisionRulings = adjudications.decisions.filter((decision) => elisionById.has(decision.caseId))

describe("the 26 adjudicated elisions are reproduced by the code", () => {
  test("the artefacts hold exactly 26 elision rulings, all unverifiable", () => {
    expect(elisions).toHaveLength(ELISION_RULINGS)
    expect(elisionRulings).toHaveLength(ELISION_RULINGS)
    for (const decision of elisionRulings) {
      expect({ caseId: decision.caseId, verdict: decision.adjudicatedVerdict }).toEqual({
        caseId: decision.caseId,
        verdict: "unverifiable",
      })
      expect(decision.adjudicatedReason).toBe("no_matching_evidence")
    }
  })

  test("every one of the 26 returns unverifiable/no_matching_evidence", () => {
    const observed = run(elisions, golden, true)
    const diverging = elisionRulings
      .map((decision) => {
        const got = observed.get(decision.caseId)
        if (got === undefined) return `${decision.caseId}: no verdict`
        if (got.verdict === decision.adjudicatedVerdict && got.reason === decision.adjudicatedReason) return null
        return `${decision.caseId}: ruled ${decision.adjudicatedVerdict}/${decision.adjudicatedReason}, code returned ${got.verdict}/${got.reason}`
      })
      .filter((problem): problem is string => problem !== null)
    expect(diverging).toEqual([])
  })

  test("not one elision is verified, and not one carries evidence", () => {
    const report = verifyAnswer({
      claims: elisions.map((entry) => claimOf(entry, true)),
      evidence: evidenceOf(elisions, golden),
      snapshotHash: SNAPSHOT_HASH,
    })
    expect(report.claims.filter((claim) => claim.verdict === "verified")).toEqual([])
    expect(report.claims.filter((claim) => claim.evidence !== null)).toEqual([])
  })

  /**
   * The planted negative. Without this, the first test would pass against a verifier that answers
   * `unverifiable` to everything, and the suite would be measuring nothing.
   */
  test("the same 26 with the anchor withdrawn are rejected: the branch is what changed the answer", () => {
    const observed = run(elisions, golden, false)
    for (const entry of elisions) {
      expect({ id: entry.id, got: observed.get(entry.id) }).toEqual({ id: entry.id, got: { verdict: "rejected", reason: "quote_absent_at_cited_id" } })
    }
  })

  test("every elision case actually ships the anchor the branch needs", () => {
    for (const entry of elisions) expect({ id: entry.id, hasAnchor: entry.anchorText !== undefined }).toEqual({ id: entry.id, hasAnchor: true })
  })
})

describe("the elision branch does not capture what it must not", () => {
  /** A true disproof: a changed word, resolved, with no anchor to argue from. It stays an accusation. */
  test("anchorless fabrications in the golden set are still rejected", () => {
    const fabrications = golden.cases.filter((entry) => entry.classId === "one_word_changed" && entry.anchorText === undefined)
    expect(fabrications.length).toBeGreaterThan(0)
    const observed = run(fabrications, golden, false)
    for (const entry of fabrications) {
      expect({ id: entry.id, got: observed.get(entry.id) }).toEqual({ id: entry.id, got: { verdict: "rejected", reason: "quote_absent_at_cited_id" } })
    }
  })

  test("no resolvable citation at all is unverifiable, never verified and never a crash", () => {
    const entry = elisions[0]
    expect(entry).toBeDefined()
    if (entry === undefined) return
    const report = verifyAnswer({ claims: [claimOf(entry, true)], evidence: [], snapshotHash: SNAPSHOT_HASH })
    expect(report.claims[0]?.verdict).toBe("unverifiable")
    expect(report.claims[0]?.reason).toBe("identifier_unresolved")
  })

  test("a quote that IS contained verifies even when the claim carries an anchor", () => {
    const entry = elisions[0]
    expect(entry).toBeDefined()
    if (entry === undefined) return
    const record = recordOf(golden, entry.anchorId)
    const verbatim: Claim = { id: "contained", text: "prose", quote: record.textDisplay, citations: [entry.citation], anchor: entry.anchorText }
    const report = verifyAnswer({ claims: [verbatim], evidence: [{ citation: entry.citation, records: [record], ambiguous: false }], snapshotHash: SNAPSHOT_HASH })
    expect(report.claims[0]).toMatchObject({ verdict: "verified", reason: "exact_containment" })
  })
})
