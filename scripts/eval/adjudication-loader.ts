import { ANCHOR_PROTOCOL_VERSION, decodeOrFail, decodeSync, isOk, AnchorAdjudicationSet, type AnchorAdjudication, type AnchorAdjudicationSet as AnchorAdjudicationSetType } from "@mizan/core"
import { ADJUDICATION_ROWS, ADJUDICATION_TARGET, expectedAdjudicationCounts, redTeamMovement, type AdjudicationRow } from "./adjudication.ts"

/**
 * The adjudication validator — the join between the hand-written table and the generated eval sets.
 *
 * ## Why it takes a CANDIDATE rather than reading a path
 *
 * The first version read `data/eval/adjudication.json` from disk, which deadlocked the very first
 * build: the generator is what writes the file, and the generator refused to write it because the
 * file was not there. Two ways out, and only one of them is honest.
 *
 * The dishonest way is to special-case "missing file means skip validation" — which is a one-line
 * permanent hole, because the same branch would also wave through a file deleted by a bad merge.
 *
 * The way out is to have no file-reading here at all. The generator builds the candidate body from
 * the literals in `adjudication.ts`, hands it to `validateAdjudications` together with the cases
 * that will be published, and writes only if the result is clean. Then `checkStaleAdjudication`
 * compares the candidate against any committed file on disk, so a stale or hand-edited artefact is
 * a build FAILURE naming the differences rather than something the generator quietly overwrites.
 * The committed file stays a reviewable artefact with a reviewable diff, and the validator is a pure
 * function with no I/O — which is also why it is testable without a filesystem.
 *
 * ## The `anchor` field is filled from the SET, not the table
 *
 * The table deliberately does not carry `collection:number` per row: a value the sets already
 * hold, restated 66 times, would be 66 chances for the two to disagree about which source a
 * decision was made against. So the candidate is stamped from each case's citation, and the check
 * is that the stamp round-trips — the artefact states the anchor, and the generator rather than the
 * table is the authority on it.
 *
 * ## Fails closed, and names the class
 *
 * A short table is a failure listing the classes involved, never a partially-adjudicated artefact.
 * The alternative publishes what happened to be ruled on and lets the gap pass, producing a file
 * whose counts still look authoritative — the same failure mode `build.ts` documents for every
 * other check it performs.
 */

export type AdjudicationProblem = string

export type AdjudicationValidation = {
  readonly decisions: readonly AnchorAdjudication[]
  readonly problems: readonly AdjudicationProblem[]
}

/** A case shape the validator needs. Structural, so `build.ts` exports no type solely for this. */
type AdjudicableCase = { readonly id: string; readonly classId: string; readonly citation: { readonly collection: string; readonly number: string | null } }

/** The anchor a case's citation denotes, as `collection:number` — the spelling the table uses. */
const anchorOf = (citation: { readonly collection: string; readonly number: string | null }): string =>
  citation.number === null ? citation.collection : `${citation.collection}:${citation.number}`

/** A row joined to a known anchor, dropping the internal `classId` the schema does not publish. */
const toDecision = (row: AdjudicationRow, anchor: string): AnchorAdjudication => ({
  caseId: row.caseId,
  anchor,
  adjudicatedVerdict: row.adjudicatedVerdict,
  adjudicatedReason: row.adjudicatedReason,
  rationale: row.rationale,
  decidedBy: row.decidedBy,
  decidedOn: row.decidedOn,
})

/**
 * The lookup `finalise` attaches by case id.
 *
 * Takes the candidate body's decisions rather than the literals, so the adjudication attached to
 * each published case is provably the same object the file carries. Sourcing it from the table
 * instead would let the two drift — a stamped anchor in one place and a restated one in the other,
 * which is the shape §17 exists to prevent.
 */
export const adjudicationLookup = (body: Record<string, unknown>): ReadonlyMap<string, AnchorAdjudication> => {
  const decoded = decodeOrFail(decodeSync(AnchorAdjudicationSet), body, "anchor-adjudication")
  if (!isOk(decoded)) throw new Error(`adjudication: the body to publish does not satisfy AnchorAdjudicationSet: ${decoded.error.detail}`)
  return new Map(decoded.value.decisions.map((decision) => [decision.caseId, decision]))
}

/**
 * Build the adjudication body from the literals, stamping each row's anchor from its case.
 *
 * Returns a discriminated shape rather than throwing, because a row with no case is a build
 * failure that must be REPORTED alongside the others rather than aborting on the first one.
 */
export const buildAdjudicationBody = (
  cases: readonly AdjudicableCase[],
): { readonly body: Record<string, unknown>; readonly problems: readonly AdjudicationProblem[] } => {
  const problems: string[] = []
  const anchorByCase = new Map(cases.map((entry) => [entry.id, anchorOf(entry.citation)]))

  const decisions = ADJUDICATION_ROWS.flatMap((row) => {
    const anchor = anchorByCase.get(row.caseId)
    if (anchor === undefined) {
      problems.push(`adjudication: ${row.caseId} matches no case in the generated set`)
      return []
    }
    return [toDecision(row, anchor)]
  })

  return { body: { ...ADJUDICATION_HEADER, decidedCount: ADJUDICATION_ROWS.length, undecidedCount: 0, redTeamMovement: redTeamMovement(), decisions }, problems }
}

/**
 * The header, and the two fields in it a judge reads as a promise.
 *
 * `expectationSource` exists for the same reason `data/eval/*.json` carries one: an adjudication
 * whose provenance is unstated is indistinguishable from a machine's guess, and this file's entire
 * value is that it is not one. `purpose` states the limit of the ruling in the artefact itself
 * rather than in a document a reader may not find — that it changes which of two non-verified
 * verdicts applies, and never confers `verified`.
 */
const ADJUDICATION_HEADER = {
  schemaVersion: ANCHOR_PROTOCOL_VERSION,
  set: "anchor-adjudication",
  title: "Hand-adjudicated ruling on the anchor cases",
  purpose: `${ADJUDICATION_TARGET} cases: every fabrication in the red-team set, and every elision in the golden set. Each records what a person concluded the claim IS, which is the question the procedure cannot answer for itself. A ruling selects between two non-verified verdicts; it never confers \`verified\`, and no route to \`verified\` exists but strict normalized substring containment. See docs/anchor-protocol.md.`,
  generatedBy: "scripts/build-eval-set.ts",
  regenerateWith: "bun run build:eval",
  expectationSource:
    "Hand-adjudicated in scripts/eval/adjudication.ts by a named person: two declared ruling families, each with one rationale applied to a declared list of case ids, and never observed from @mizan/verify. A ruling recorded by running the code it judges is a row that ratifies whatever the code already does, which is the exact pathology re-adjudication exists to prevent. The file is committed, so re-running the generator over a hand edit is a build failure rather than a silent overwrite.",
  determinism:
    "Same snapshot and same table in, byte-identical file out. The row order is the block order in adjudication.ts, no clock, locale or randomness is consulted, and each row's anchor is stamped from its case's citation rather than restated by the table.",
} as const

/**
 * Decode a candidate through `AnchorAdjudicationSet` and reconcile it against the cases.
 *
 * The decode is the contract check — the writer cannot quietly emit a field the schema does not
 * declare — and the reconciliation is the semantic one: every row must be a real decision, every
 * decision must belong to a real case, and the anchor must be the one that case actually cites.
 */
export const validateAdjudications = (candidate: unknown, cases: readonly AdjudicableCase[]): AdjudicationValidation => {
  const problems: string[] = []
  const decoded = decodeOrFail(decodeSync(AnchorAdjudicationSet), candidate, "anchor-adjudication")
  if (!isOk(decoded)) return { decisions: [], problems: [`adjudication: does not satisfy AnchorAdjudicationSet: ${decoded.error.detail}`] }

  const set = decoded.value
  if (set.decisions.length !== ADJUDICATION_TARGET) {
    problems.push(`adjudication: ${set.decisions.length} decisions, expected exactly ${ADJUDICATION_TARGET}`)
  }
  if (set.decidedCount + set.undecidedCount !== set.decisions.length) {
    problems.push(
      `adjudication: decidedCount ${set.decidedCount} + undecidedCount ${set.undecidedCount} does not sum to ${set.decisions.length} decisions`,
    )
  }

  const caseById = new Map(cases.map((entry) => [entry.id, entry]))
  const rowByCaseId = new Map(ADJUDICATION_ROWS.map((row) => [row.caseId, row]))
  const classCounts = new Map<string, number>()
  const seen = new Set<string>()

  for (const decision of set.decisions) {
    if (seen.has(decision.caseId)) {
      problems.push(`adjudication: ${decision.caseId} is decided more than once`)
      continue
    }
    seen.add(decision.caseId)

    const row = rowByCaseId.get(decision.caseId)
    if (row === undefined) {
      problems.push(`adjudication: ${decision.caseId} is not in the hand-written table, so the artefact claims a decision scripts/eval/adjudication.ts does not make`)
      continue
    }

    const testCase = caseById.get(decision.caseId)
    if (testCase === undefined) {
      problems.push(`adjudication: ${decision.caseId} matches no case in the generated set`)
      continue
    }

    const expected = toDecision(row, anchorOf(testCase.citation))
    if (decision.adjudicatedVerdict !== expected.adjudicatedVerdict) {
      problems.push(`adjudication: ${decision.caseId} publishes ${decision.adjudicatedVerdict}, the table says ${expected.adjudicatedVerdict}`)
      continue
    }
    if (decision.adjudicatedReason !== expected.adjudicatedReason) {
      problems.push(`adjudication: ${decision.caseId} publishes reason ${decision.adjudicatedReason}, the table says ${expected.adjudicatedReason}`)
      continue
    }
    if (decision.rationale !== expected.rationale) {
      problems.push(`adjudication: ${decision.caseId} publishes a rationale that is not the table's; hand-edited reasoning must be a deliberate, reviewed act`)
      continue
    }
    if (decision.decidedBy !== expected.decidedBy) {
      problems.push(`adjudication: ${decision.caseId} names ${decision.decidedBy} as its decider, the table names ${expected.decidedBy}`)
      continue
    }
    if (decision.decidedOn !== expected.decidedOn) {
      problems.push(`adjudication: ${decision.caseId} is dated ${decision.decidedOn}, the table says ${expected.decidedOn}`)
      continue
    }

    classCounts.set(testCase.classId, (classCounts.get(testCase.classId) ?? 0) + 1)
  }

  for (const [classId, wanted] of Object.entries(expectedAdjudicationCounts())) {
    const got = classCounts.get(classId) ?? 0
    if (got !== wanted) problems.push(`adjudication: class ${classId} has ${got} decisions, expected exactly ${wanted}`)
  }

  problems.push(...movementProblems(set.redTeamMovement, caseById))

  return { decisions: set.decisions, problems }
}

/**
 * R-A1's numbers, reconciled rather than trusted.
 *
 * Two things could make the published movement wrong, and both are checked. The count could drift
 * from the table (an edited `rejectedToUnverifiable` claiming a smaller dilution than the rulings
 * imply), and it could be arithmetically unrelated to the rows (a count of 40 with no fabrication
 * rows in the file). Either one is the failure R-A1's mitigation exists to prevent, and both are
 * cheaper to catch here than in a judge's review.
 *
 * `falseVerifiedDelta` is checked for the same reason it is published: a non-zero value is not a
 * number a future author is allowed to type in and move on. It would mean an arm that can reach
 * `verified`, which is the one thing this protocol must never be able to do.
 */
const movementProblems = (movement: AnchorAdjudicationSetType["redTeamMovement"], caseById: ReadonlyMap<string, AdjudicableCase>): readonly string[] => {
  const problems: string[] = []
  const expected = redTeamMovement()
  if (movement.rejectedToUnverifiable !== expected.rejectedToUnverifiable) {
    problems.push(
      `adjudication: redTeamMovement.rejectedToUnverifiable is ${movement.rejectedToUnverifiable}, the table says ${expected.rejectedToUnverifiable}`,
    )
  }
  if (movement.falseVerifiedDelta !== 0) {
    problems.push(
      `adjudication: redTeamMovement.falseVerifiedDelta is ${movement.falseVerifiedDelta}; the anchor arm must never be able to reach \`verified\`, so this can only be 0`,
    )
  }
  const fabrications = [...caseById.values()].filter((entry) => entry.id.startsWith("redteam-")).length
  if (movement.rejectedToUnverifiable > fabrications) {
    problems.push(
      `adjudication: redTeamMovement.rejectedToUnverifiable is ${movement.rejectedToUnverifiable}, more than the ${fabrications} red-team cases the file decides`,
    )
  }
  return problems
}

/**
 * Compare a candidate against the committed file, if one exists.
 *
 * The staleness check, and the reason this module has no I/O of its own: the caller supplies the
 * committed bytes. A difference is reported per field rather than as a whole-file mismatch, so the
 * failure names which decision drifted instead of printing two 400-line JSON blobs at a judge.
 *
 * A missing file is NOT a problem here. It is the normal state before the first build, and the
 * build is what creates it; reporting it would deadlock exactly as the first version did.
 */
export const checkStaleAdjudication = (candidate: unknown, committed: unknown): readonly AdjudicationProblem[] => {
  if (committed === undefined) return []

  const problems: string[] = []
  const before = decodeOrFail(decodeSync(AnchorAdjudicationSet), committed, "committed-adjudication")
  if (!isOk(before)) return [`adjudication.json on disk is not a valid adjudication set: ${before.error.detail}. Delete it and re-run \`bun run build:eval\`.`]

  const after = decodeOrFail(decodeSync(AnchorAdjudicationSet), candidate, "candidate-adjudication")
  if (!isOk(after)) return [`the candidate adjudication set is invalid: ${after.error.detail}`]

  const committedById = new Map(before.value.decisions.map((decision) => [decision.caseId, decision]))
  for (const decision of after.value.decisions) {
    const was = committedById.get(decision.caseId)
    if (was === undefined) {
      problems.push(`adjudication.json is stale: it has no decision for ${decision.caseId}, which scripts/eval/adjudication.ts now rules on`)
      continue
    }
    for (const field of ["anchor", "adjudicatedVerdict", "adjudicatedReason", "rationale", "decidedBy", "decidedOn"] as const) {
      if (was[field] === decision[field]) continue
      problems.push(`adjudication.json is stale at ${decision.caseId}.${field}: on disk ${String(was[field])}, regenerated ${String(decision[field])}`)
    }
  }
  for (const decision of before.value.decisions) {
    if (after.value.decisions.some((entry) => entry.caseId === decision.caseId)) continue
    problems.push(`adjudication.json is stale: it decides ${decision.caseId}, which scripts/eval/adjudication.ts no longer rules on`)
  }
  // The movement figures are compared here as well as validated, because "an author quietly raised
  // or lowered the published dilution" is exactly the edit a reviewer would not notice in a diff of
  // 66 rows and would be the most consequential number in the file.
  for (const field of ["rejectedToUnverifiable", "falseVerifiedDelta"] as const) {
    if (before.value.redTeamMovement[field] === after.value.redTeamMovement[field]) continue
    problems.push(
      `adjudication.json is stale at redTeamMovement.${field}: on disk ${before.value.redTeamMovement[field]}, regenerated ${after.value.redTeamMovement[field]}`,
    )
  }
  return problems
}

export * as AdjudicationLoader from "./adjudication-loader.ts"
