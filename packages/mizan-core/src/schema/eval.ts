import { Schema } from "effect"
import { AnchorAdjudication } from "./anchor.ts"
import { Citation } from "./claim.ts"
import { CorpusRecordMeta } from "./record.ts"
import { Verdict, VerdictReason } from "./verdict.ts"

/**
 * The eval sets - `data/eval/*.json` - as a declared contract.
 *
 * ## Why a committed artefact needs a schema at all
 *
 * These files are hand-editable, reviewable data, which makes them a trust boundary in exactly
 * the way AGENTS.md section 1 means: a commit that edits `textDisplay`, `expectedVerdict` or a
 * `textHash` can turn a set that proves the verifier works into one that agrees with it. The
 * generator writes them and `apps/cli/test/eval.test.ts` reads them, so declaring the shape once
 * here means neither side can drift, and neither has to import `effect` itself.
 *
 * ## The header fields are REQUIRED, not optional
 *
 * `expectationSource`, `determinism` and `licenceNotice` are what make a set auditable rather
 * than merely executable. If they were optional, a future set could be published without saying
 * where its expectations came from, and a judge would have no way to tell a hand-adjudicated set
 * from one that recorded whatever the code did. Requiring them makes the provenance a
 * precondition of publication instead of a convention.
 *
 * `knownDivergence` became optional at `schemaVersion` 2 because the divergence it recorded —
 * the story asking for `unverifiable` while the procedure returned `rejected` — was closed by
 * activating the anchor arm. The ruling itself was never in that field: it lives in
 * `EvalCase.adjudication` and in `data/eval/adjudication.json`, both unchanged. The type stays
 * so a set carrying the historical record still decodes, and the field is simply no longer a
 * precondition of publication.
 *
 * ## `textMatch` is deliberately absent from the anchor
 *
 * The anchor is the corpus row a case quotes, minus the pre-folded column. The test re-derives it
 * with the real normalizer. A fixture that shipped its own folded text could make a fabrication
 * verify itself by editing one string, which is the single most damaging edit to this artefact.
 * What remains is `textHash`, so editing `textDisplay` is still detected.
 */
export const EvalAnchor = Schema.Struct({
  ...CorpusRecordMeta.fields,
  textDisplay: Schema.String,
  translation: Schema.optional(Schema.String),
})
export type EvalAnchor = Schema.Schema.Type<typeof EvalAnchor>

/**
 * The ruling on a divergence, in the shape a reader needs to audit it: when, by whom, how many
 * cases it covered, and why. `decidedCount` / `undecidedCount` let a reader confirm the ruling was
 * applied to every affected case rather than to a convenient subset.
 *
 * Declared before `KnownDivergence` because that struct's `resolution` field references it: a
 * top-level `const` cannot be read while the initialiser that reads it is still running.
 */
export const DivergenceResolution = Schema.Struct({
  decidedOn: Schema.String,
  decidedBy: Schema.String,
  decidedCount: Schema.Number,
  undecidedCount: Schema.Number,
  why: Schema.String,
})
export type DivergenceResolution = Schema.Schema.Type<typeof DivergenceResolution>

/**
 * A disagreement between the user story and the implemented procedure, published with the set.
 *
 * Retired at `schemaVersion` 2. The live divergence was the paraphrase case: the story asked for
 * `unverifiable`, step 5 of the six-step procedure delivered `rejected`, and telling the two
 * apart appeared to need the similarity measurement ADR-03 forbids. Step 5b's anchor arm closed
 * it without any measurement, so `scripts/eval/plan.ts` no longer defines a `KNOWN_DIVERGENCE`
 * and no set carries one. The type and the optional header field survive so a set written while
 * the gap was open still decodes — deleting the field outright would make that history
 * unreadable rather than resolved.
 */
export const KnownDivergence = Schema.Struct({
  id: Schema.String,
  affectsClasses: Schema.Array(Schema.String),
  /** What the user story asks for. */
  storyRequires: Schema.String,
  /** What the implemented procedure actually produces. */
  procedureDelivers: Schema.String,
  /** Why the two cannot both hold. */
  why: Schema.String,
  /** Who has to decide. This changes the product's most safety-sensitive label. */
  whoDecides: Schema.String,
  /**
   * Present once a human has ruled on the divergence.
   *
   * Optional, and that is the point: before the ruling the divergence is an open question, and an
   * artefact that could only record closed ones would pressure a reader into treating it as
   * settled. `resolution` records the DECISION; whether the procedure has been changed to match
   * it is a separate question, answered by the code rather than by this field. A decision that
   * names a future story is still a decision, and recording it is how a gap stays visible instead
   * of quietly widening.
   */
  resolution: Schema.optional(DivergenceResolution),
})
export type KnownDivergence = Schema.Schema.Type<typeof KnownDivergence>

/**
 * One case: a quote, the citation it is checked against, and the verdict both are declared to
 * produce. `expectedRationale` is required so a judge can check the expectation against the fold
 * table without running anything.
 */
export const EvalCase = Schema.Struct({
  id: Schema.String,
  classId: Schema.String,
  /** The named transformation that produced the quote. Never a free-text description. */
  mutation: Schema.String,
  /** One sentence on what this case is for. */
  note: Schema.String,
  quote: Schema.String,
  citation: Citation,
  expectedVerdict: Verdict,
  expectedReason: VerdictReason,
  expectedRationale: Schema.String,
  anchorId: Schema.String,
  /**
   * The claim's `anchor` — 3-8 words of REAL source text a human drew from this case's own quote
   * so the arm at step 5b can be exercised. Named `anchorText` because this file already uses
   * `anchorId` (the record) and `AnchorAdjudication.anchor` (the citation).
   *
   * Optional, and present on exactly the cases the table in `scripts/eval/anchor-texts.ts` rules
   * on: attaching an anchor anywhere else would move a verdict nobody adjudicated. Absence means
   * "the claim carried no anchor", which is the pre-activation state and still a legal answer.
   */
  anchorText: Schema.optional(Schema.String),
  /**
   * The human ruling on this case, when one exists. Absent for every unadjudicated case.
   *
   * Attached, not merged: `expectedVerdict` stays what the procedure must produce, so a case
   * whose adjudication differs from the expectation shows BOTH on its face rather than hiding one
   * behind the other. See `schema/anchor.ts`.
   */
  adjudication: Schema.optional(AnchorAdjudication),
})
export type EvalCase = Schema.Schema.Type<typeof EvalCase>

/** A count map: class name to case count, or verdict to case count. */
const CountMap = Schema.Record(Schema.String, Schema.Number)

export const EvalSet = Schema.Struct({
  schemaVersion: Schema.Number,
  set: Schema.String,
  title: Schema.String,
  purpose: Schema.String,
  generatedBy: Schema.String,
  regenerateWith: Schema.String,
  determinism: Schema.String,
  /** Must state that the expectations are hand-adjudicated, not observed from the verifier. */
  expectationSource: Schema.String,
  /** Optional as of `schemaVersion` 2: the divergence it recorded has been mechanised away. */
  knownDivergence: Schema.optional(KnownDivergence),
  digitFacts: CountMap,
  classCounts: CountMap,
  verdictCounts: CountMap,
  anchorCount: Schema.Number,
  licenceNotice: Schema.String,
  anchors: Schema.Array(EvalAnchor),
  cases: Schema.Array(EvalCase),
})
export type EvalSet = Schema.Schema.Type<typeof EvalSet>

export * as EvalSchema from "./eval.ts"
