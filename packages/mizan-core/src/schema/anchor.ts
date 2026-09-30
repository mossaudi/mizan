import { Schema } from "effect"
import { Verdict, VerdictReason } from "./verdict.ts"

/**
 * The anchor protocol: the hand-adjudicated table, and the one shape the protocol's branch is
 * allowed to return.
 *
 * ## What this module is NOT
 *
 * It declares no search, no scorer, and no similarity. There is no number anywhere in this file,
 * and that is the load-bearing property of MIZ-105 rather than an aesthetic preference: the
 * golden set has 26 `elide_middle` cases — faithful abridged renderings of a real span, built
 * from the source's own words — that today's procedure answers `rejected`. A "clever" fix for
 * that is a similarity threshold, and a threshold tuned on 26 cases is the CWE-345 hole ADR-03
 * exists to close: the feasibility spike proved an invented-but-plausible hadith scores HIGH on
 * exactly such a metric. So the protocol's answer to a near-miss is not a smaller number, it is a
 * different KIND of outcome — `unverifiable` — reachable only when the claim's own cited record
 * is shown to contain a span that the abridgement draws on, and never reachable via a score.
 *
 * `AnchorSpan` therefore has two fields and no third, and the protocol document
 * (`docs/anchor-protocol.md`) states the ban in words the schema then makes unrepresentable.
 *
 * ## Why the table is a SEPARATE ARTEFACT
 *
 * `data/eval/adjudication.json` is not a field on the eval sets, because the judgement and the
 * measurement must be able to disagree. If `expectedVerdict` were overwritten with the adjudicated
 * value, the golden set would report 100% for a procedure that has not been changed — the artefact
 * would be describing the wish. So the table sits beside the sets, `EvalCase.adjudication` carries
 * it as an optional attachment, and the difference between the two stays visible on the face of
 * every case that has one.
 *
 * ## The ban on generating rows from the code under test
 *
 * `decidedBy` is a human string and `scripts/eval/adjudication.ts` is banned from importing
 * `@mizan/verify` by the same textual guard that protects `plan.ts`. An expectation recorded by
 * running the procedure is a regression test of the procedure against itself: it would ratify
 * whatever the procedure currently does, which for the 26 elision cases is precisely the behaviour
 * the table exists to correct. `EvalCase.adjudication` exists so the correction can be stated
 * without the bar being moved early.
 */

/** Bumped when the table's shape changes. Recorded in the file itself. */
export const ANCHOR_PROTOCOL_VERSION = 1

/**
 * The locator's result, and the protocol's whole output surface.
 *
 * `{ located: boolean; span: string }`. No score, no confidence, no ranking, no distance — because
 * a branch that could report "located, 0.87" has reintroduced the number this repository spent a
 * feasibility spike proving cannot be trusted with this decision.
 *
 * `located: false` is a first-class, expected outcome, not an error: a claim that elides nothing
 * findable in its cited record gets `unverifiable`/`no_matching_evidence`, which is an honest
 * state (AGENTS.md §16) rather than a failure to be papered over.
 */
export const AnchorSpan = Schema.Struct({
  located: Schema.Boolean,
  span: Schema.String,
})
export type AnchorSpan = Schema.Schema.Type<typeof AnchorSpan>

/**
 * One human decision about one eval case.
 *
 * The `adjudicated*` prefix is not decoration. `EvalCase.expectedVerdict` is what the procedure
 * must produce; `adjudicatedVerdict` is what a person concluded is true of the case. Two names so
 * a reader can never mistake the second for the first, and so the field name itself is the
 * warning when a diff shows one being written over the other.
 *
 * `anchor` is the `collection:number` the case is decided against, named here rather than looked
 * up so the table is reviewable without opening the corpus, and checkable against the case's own
 * citation by `scripts/eval/adjudication.ts`.
 */
export const AnchorAdjudication = Schema.Struct({
  /** `golden-###` or `redteam-###`. The join key, and unique across the table. */
  caseId: Schema.String,
  /** The `collection:number` this decision is about, e.g. `abudawud:1`. */
  anchor: Schema.String,
  adjudicatedVerdict: Verdict,
  /** Why that verdict, in the shared reason vocabulary — so a trace needs no prose to be legible. */
  adjudicatedReason: VerdictReason,
  /** The argument, in words, for a person who disagrees. Mandatory: a decision with no rationale is not reviewable. */
  rationale: Schema.String,
  /** A person, not a tool. A row whose `decidedBy` names a script has been auto-generated. */
  decidedBy: Schema.String,
  /** ISO-8601 date, so a reader can tell a fresh decision from a three-year-old one. */
  decidedOn: Schema.String,
})
export type AnchorAdjudication = Schema.Schema.Type<typeof AnchorAdjudication>

/**
 * R-A1's measurement, as DATA rather than as a claim in a comment.
 *
 * ## Why this is a field and not a sentence
 *
 * The architecture names R-A1 as a Critical reputational risk: MIZ-106's anchor arm will move a
 * number of red-team fabrications from `rejected` to `unverifiable`, because `one_word_changed` is
 * eleven twelfths of a real span and an anchor drawn from it locates. The specified mitigation is
 * "measured, not engineered away. Count written into `adjudication.json`, asserted against the
 * observed run."
 *
 * A count buried in 40 rationales is not measured, it is asserted forty times. So the two numbers
 * are stated once, in the artefact, where a reader can point at them and disagree.
 *
 * ## `falseVerifiedDelta` is the zero-`verified` bar as a number
 *
 * It is `0` because no branch of the three-branch rule can return `verified` — the locator can only
 * choose between the two non-`verified` outcomes. It is published next to the movement count so that
 * the movement is never readable as a licence to reach `verified`: a reader who sees "40 moved" and
 * "0 became verified" in the same object is being told precisely what the movement costs and does
 * not cost. It is a field rather than a promise so that a future change to the locator has to change
 * this number visibly.
 */
export const RedTeamMovement = Schema.Struct({
  /** How many of the 40 fabrications the anchor arm is expected to move off `rejected`. */
  rejectedToUnverifiable: Schema.Number,
  /** How many fabrications the anchor arm could move to `verified`. Always 0; published, not implied. */
  falseVerifiedDelta: Schema.Number,
})
export type RedTeamMovement = Schema.Schema.Type<typeof RedTeamMovement>

/**
 * The committed table. `decidedCount` / `undecidedCount` are published rather than derived at read
 * time, so the artefact answers "was everything decided?" without a reader having to trust the
 * loader's counting. `redTeamMovement` is required rather than optional, because a table that
 * omitted it would be a table that had measured nothing.
 */
export const AnchorAdjudicationSet = Schema.Struct({
  schemaVersion: Schema.Number,
  set: Schema.String,
  title: Schema.String,
  purpose: Schema.String,
  generatedBy: Schema.String,
  regenerateWith: Schema.String,
  /** The standing reason the rows are human-written, copied into the file so nobody has to ask. */
  expectationSource: Schema.String,
  determinism: Schema.String,
  decidedCount: Schema.Number,
  undecidedCount: Schema.Number,
  redTeamMovement: RedTeamMovement,
  decisions: Schema.Array(AnchorAdjudication),
})
export type AnchorAdjudicationSet = Schema.Schema.Type<typeof AnchorAdjudicationSet>

/**
 * The one honest value for an undecided count, and the reason the generator is allowed to finish
 * at all.
 *
 * A case nobody has ruled on keeps its current expectation and is published as undecided. It is
 * not silently upgraded to a decided row, because an invented expectation is worse than a visible
 * gap: the gap is a to-do item a reader can see, and the invented row would be a claim in an
 * artefact whose entire purpose is to be auditable.
 */
export const UNDECIDED_COUNT_IS_FATAL = true

export * as AnchorSchema from "./anchor.ts"
