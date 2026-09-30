import type { AnchorAdjudication } from "@mizan/core"

/**
 * The hand-adjudicated anchor table — MIZ-105.
 *
 * ## What a ruling is, and what it is not
 *
 * `adjudicatedVerdict` is what a person concluded is TRUE OF THE CLAIM after reading it against its
 * cited source. It is not what the code does today, and it was not what the code did when this
 * table was written. So the table can be right while the golden bar was still red, and that
 * distance was published rather than hidden: `plan.ts` carried it as `KNOWN_DIVERGENCE`, and it
 * was retired at `schemaVersion` 2 once MIZ-106's anchor arm closed it. The span each adjudicated
 * claim carries now lives beside this table in `scripts/eval/anchor-texts.ts`.
 *
 * ## The 66 rows reach TWO conclusions by TWO arguments, and must never be merged
 *
 * The single most important line in this file is the split between the 26 `elide_middle` cases and
 * the 40 red-team fabrications, because an earlier draft of this table gave all 66 one rationale
 * asserting that a human "found the claim faithful in substance". That sentence is FALSE for a
 * fabrication. A case with one word of twelve replaced asserts something the source does not say;
 * calling it faithful is not a judgement call, it is a misdescription of the artefact, and an
 * artefact that misdescribes 40 fabrications cannot be shown to a judge.
 *
 * So the two families are decided separately, with different verdicts, different reasons and
 * different arguments, and the self-test refuses to let them drift together:
 *
 *  - **26 `elide_middle` (golden).** The quote is built from the source's OWN words with the middle
 *    removed. Nothing in it contradicts the source; it is a faithful but non-contiguous rendering.
 *    A human ruling `rejected` here would accuse a correct answer of lying, and containment cannot
 *    confirm it either, so the honest verdict is `unverifiable`. **This is the decision the story
 *    exists to make**, and it is the one the README had left open.
 *
 *  - **40 red-team fabrications.** The quote is a real span with something changed. The claim
 *    therefore asserts what the source does not say, and the correct ruling is `rejected` /
 *    `quote_absent_at_cited_id`. A human reading these rows and writing `unverifiable` would be
 *    recording the anchor arm's behaviour as a judgement about the text, which is the confusion
 *    this file's split exists to prevent: the arm's movement of a fabrication off `rejected` is a
 *    property of the locator, not a finding that the claim became faithful.
 *
 * ## Why the red-team count is a separate PUBLISHED number
 *
 * Under MIZ-106's anchor arm a red-team fabrication whose anchor still locates comes back
 * `unverifiable` instead of `rejected`. R-A1 calls that out as a Critical reputational risk and its
 * mitigation is "measured, not engineered away. Count written into `adjudication.json`, asserted
 * against the observed run." So the movement is published as `redTeamMovement` rather than folded
 * into the rows: the number is stated once, in one field, where a reader can check it — and the
 * zero-`verified` bar is restated next to it, because a movement between two non-`verified` verdicts
 * must never be readable as a licence to reach `verified`. `apps/cli/test/eval.test.ts` asserts the
 * movement the observed run produces against this number, so a locator that stops locating is a
 * failing test naming the case rather than a silent shrinkage of the published figure.
 *
 * Literals and nothing else. No corpus read, no normalizer, no fold, and above all no import of
 * `@mizan/verify` — `apps/cli/test/eval.test.ts` greps this file textually for exactly the reason it
 * greps `plan.ts`. A ruling produced by running the code it judges ratifies whatever that code does
 * today, which for both families is precisely the pathology re-adjudication exists to correct.
 */

/** ISO-8601 date of the ruling, on every row, so a fresh decision is distinguishable from an old one. */
const DECIDED_ON = "2026-09-28"

/**
 * A person, not a tool.
 *
 * `eval.test.ts` asserts this is neither a path nor a command nor the name of any script under
 * `scripts/`, which is the mechanical half of "hand-adjudicated". The load-bearing half is that a
 * person named here accepts responsibility for the reasoning the rows carry.
 */
const DECIDED_BY = "mizan team lead (architecture review)"

/**
 * The shared limit, on every row, in the protocol document's vocabulary.
 *
 * The closing sentence is the design's load-bearing claim rather than a reassurance: neither family
 * of ruling changes which of two NON-VERIFIED verdicts applies, and no outcome of the locator MIZ-106
 * adds can promote anything to `verified`. Every route to `verified` remains strict normalized
 * substring containment, and a table that could argue its way to a `verified` would be the CWE-345
 * hole ADR-03 exists to close. See `docs/anchor-protocol.md`.
 */
const LIMIT = "A bad locator can only ever yield `unverifiable` or `rejected`, never `verified`."

/** The 26 golden elisions. A faithful re-rendering, so the honest verdict is that we cannot decide. */
const PARAPHRASE_RATIONALE =
  "A human read this quote against its cited source and found it faithful in substance while not being a contiguous quotation of it: text was elided, and what remains is the source's own wording rather than an assertion the source does not make. Re-rendering is not misquotation, so `rejected` would accuse a correct answer of lying; nor is a non-contiguous rendering a claim containment can confirm, so `verified` is unavailable. The honest verdict is that we cannot decide on this evidence. This ruling decides the question a human must decide — what the claim IS — and does not by itself change what the procedure returns; MIZ-106 lands the locator that makes the two agree. " +
  LIMIT

/**
 * The 40 fabrications. A changed word asserts what the source does not say, so the claim is rejected.
 *
 * The second sentence is written for the hard class specifically. `one_word_changed` is eleven
 * twelfths of a real span, so an anchor drawn from it locates and MIZ-106's arm will report
 * `unverifiable` for it; that movement is published as `redTeamMovement.rejectedToUnverifiable`
 * rather than anticipated here, because a ruling must record what the text IS, not what a locator
 * will do to it.
 */
const FABRICATION_RATIONALE =
  "A human read this quote against its cited source and found the claim asserts something the source does not say: this is a fabricated span, not a re-rendering of one, so there is no faithful paraphrase to abstain about and `rejected` / `quote_absent_at_cited_id` is the correct answer — which is also the answer today's procedure gives. A close fabrication is not thereby a paraphrase. Note that most of these spans are largely real, so an anchor drawn from one will locate and MIZ-106's arm will report `unverifiable`; that movement is a property of the locator, is published as `redTeamMovement.rejectedToUnverifiable`, and does not make these claims faithful. " +
  LIMIT

/** One row of the table, plus the join key the generator matches on. */
export type AdjudicationRow = Omit<AnchorAdjudication, "anchor"> & { readonly classId: string }

/**
 * The two ruling families, declared once.
 *
 * `adjudicatedVerdict` and `adjudicatedReason` live here rather than at each block so a reader can
 * see the entire shape of the decision in one screen, and so a future edit cannot give one family
 * the other's reasoning by copy-paste.
 */
const PARAPHRASE_FAMILY = {
  adjudicatedVerdict: "unverifiable",
  adjudicatedReason: "no_matching_evidence",
  rationale: PARAPHRASE_RATIONALE,
} as const

const FABRICATION_FAMILY = {
  adjudicatedVerdict: "rejected",
  adjudicatedReason: "quote_absent_at_cited_id",
  rationale: FABRICATION_RATIONALE,
} as const

/** Which ruling family a case's class belongs to. */
type Family = keyof typeof FAMILIES

const FAMILIES = { paraphrase: PARAPHRASE_FAMILY, fabrication: FABRICATION_FAMILY } as const

/**
 * The blocks of the two eval sets this table rules on.
 *
 * `first` and `count` are the case-id ranges, and they are the join. They are declared here rather
 * than derived from the generated sets, because this file is a hand-written artefact that must not
 * import the generator: a table whose contents depended on the machine it audits would be auditing
 * itself. `anchor.test.ts` reconciles these ranges against the committed sets, so a set that grew a
 * case fails a check rather than being silently unadjudicated.
 *
 * The 40 red-team ids are `redteam-001`..`redteam-040` and the 26 elisions are
 * `golden-095`..`golden-120`, both in the order `build.ts` assigns them: classes in `plan.ts` table
 * order, and for the red-team set each class's declared count in sequence.
 */
const ADJUDICATED_BLOCKS: readonly {
  readonly classId: string
  readonly prefix: string
  readonly first: number
  readonly count: number
  readonly family: Family
}[] = [
  { classId: "one_word_changed", prefix: "redteam", first: 1, count: 12, family: "fabrication" },
  { classId: "two_word_changed", prefix: "redteam", first: 13, count: 8, family: "fabrication" },
  { classId: "letter_transposed", prefix: "redteam", first: 21, count: 8, family: "fabrication" },
  { classId: "digit_substituted", prefix: "redteam", first: 29, count: 4, family: "fabrication" },
  { classId: "word_inserted", prefix: "redteam", first: 33, count: 8, family: "fabrication" },
  { classId: "elide_middle", prefix: "golden", first: 95, count: 26, family: "paraphrase" },
]

/** Every case id the table rules on, in block order. */
export const ADJUDICATED_CASE_IDS: readonly string[] = ADJUDICATED_BLOCKS.flatMap((block) =>
  Array.from({ length: block.count }, (_unused, index) => `${block.prefix}-${String(block.first + index).padStart(3, "0")}`),
)

/** The block a case id belongs to, or null when the table does not rule on it. */
const blockOf = (caseId: string) => {
  for (const block of ADJUDICATED_BLOCKS) {
    if (!caseId.startsWith(`${block.prefix}-`)) continue
    const ordinal = Number(caseId.slice(block.prefix.length + 1))
    if (!Number.isInteger(ordinal)) continue
    if (ordinal < block.first || ordinal >= block.first + block.count) continue
    return block
  }
  return null
}

/**
 * The 66 rows, in the order the blocks are declared.
 *
 * A function rather than a constant so the case ids and the ruling family are both derived from the
 * blocks above instead of being transcribed 66 times — a mistyped id would be a ruling attached to
 * nothing, and a mistyped *count* would be a table that silently covers less than it claims.
 */
export const ADJUDICATION_ROWS: readonly AdjudicationRow[] = ADJUDICATED_CASE_IDS.map((caseId) => {
  const block = blockOf(caseId)
  if (block === null) throw new Error(`adjudication.ts: ${caseId} is in a block but resolves to no block`)
  return {
    caseId,
    classId: block.classId,
    ...FAMILIES[block.family],
    decidedBy: DECIDED_BY,
    decidedOn: DECIDED_ON,
  }
})

/** How many rows a complete table holds. The generator and the test both fail closed on any other number. */
export const ADJUDICATION_TARGET = 66

/**
 * What each class must have adjudicated, as a count map.
 *
 * The generator reconciles its own class counts against this, so a class that gains a case
 * produces a build failure that names the class instead of an artefact quietly missing a ruling.
 */
export const expectedAdjudicationCounts = (): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const block of ADJUDICATED_BLOCKS) counts[block.classId] = block.count
  return counts
}

/** How many rows carry each family's ruling, keyed by the verdict a reader can check in the file. */
export const expectedFamilyCounts = (): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const block of ADJUDICATED_BLOCKS) {
    const verdict = FAMILIES[block.family].adjudicatedVerdict
    counts[verdict] = (counts[verdict] ?? 0) + block.count
  }
  return counts
}

/**
 * R-A1's measurement, published as data.
 *
 * `rejectedToUnverifiable` is how many of the 40 fabrications MIZ-106's anchor arm is expected to
 * move off `rejected`. It is stated once, here, rather than spread across 40 rationales where a
 * reader would have to count them. The value is the WHOLE fabrication family, because every one of
 * these spans is largely real text and an anchor drawn from real text locates — which is exactly why
 * the honest thing to do is print `40` and let the reader object to it, rather than quietly leaving
 * 40 rows looking unchanged when they will not be.
 *
 * `falseVerifiedDelta: 0` is the zero-`verified` bar restated as a field. It is zero because no
 * branch of the three-branch rule can return `verified`; it is published so that a future change to
 * the locator has to change a number here, visibly, rather than quietly relaxing the one bar that
 * actually matters.
 */
export const redTeamMovement = (): { readonly rejectedToUnverifiable: number; readonly falseVerifiedDelta: number } => {
  const fabricationRows = ADJUDICATED_BLOCKS.filter((block) => block.family === "fabrication").reduce((total, block) => total + block.count, 0)
  return { rejectedToUnverifiable: fabricationRows, falseVerifiedDelta: 0 }
}

export * as Adjudication from "./adjudication.ts"
