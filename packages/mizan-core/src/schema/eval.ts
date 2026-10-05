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
 *
 * ## `schemaVersion` 3 added `datasetDigest` and `coverageRows`
 *
 * Both required, for the same reason the header fields above are: they are what make a set auditable
 * as *evidence about a particular corpus* rather than as a list of cases. A set that could omit them
 * would let a regenerated set be compared against a baseline it has nothing in common with, and the
 * comparison would read green.
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

/**
 * One collection's slice of a set, published so a reader sees the shape without counting.
 *
 * ## Why this is a claim and not the evidence
 *
 * `packages/mizan-gate/src/docs-coverage.ts` deliberately recomputes these counts from `cases` and
 * ignores this field. A published row is therefore something a rule can contradict — which is the
 * only reason it is worth publishing at all. A row the rule trusted would be a number agreeing with
 * itself, and `redTeamMovement` would learn from a count the set wrote about its own coverage.
 *
* `caseCount` and `anchorCount` are separate because they answer different questions. Six cases may
 * quote one record, which is the re-rendering design of the golden set; a reader checking how many
 * *books* were touched needs the first, and one asking how much *text* was checked needs the second,
 * * and conflating them is how a 200-case set reads as 200 independent subjects.
 *
 * `collection` is the CITATION's collection, verbatim — so a set carrying `ambiguous_collection` cases
 * publishes one row whose name is the empty string. That is not a defect and is not normalised away:
 * those twenty cases deliberately cite number 1 with no collection, so the empty name is the accurate
 * record of what they did, and renaming it to something like `"(none)"` would be a label the corpus
 * has never heard of. `packages/mizan-gate/src/docs-coverage.ts` refuses to count it, which is why the
 * golden set's rows sum to more than its served collections and its red-team rows sum to exactly its
 * forty.
 */
export const CollectionCoverageRow = Schema.Struct({
  collection: Schema.String,
  caseCount: Schema.Number,
  anchorCount: Schema.Number,
})
export type CollectionCoverageRow = Schema.Schema.Type<typeof CollectionCoverageRow>

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
  /**
   * The identity of this set's content: a versioned `ds1:<64 hex>` digest.
   *
   * ## Why required as of `schemaVersion` 3
   *
   * A relative gate comparing today's number against a baseline number has two ways to be wrong, and
   * only one is visible. The visible one is the number moving. The invisible one is the *data*
   * moving underneath a number that did not: the aggregate can stay identical, the comparison reports
   * a pass, and the evidence was never comparable. Requiring the field makes "same data?" answerable
   * before "did it move?" — `scripts/eval/identity.ts` owns which fields are the material.
   *
   * Computed with this key REMOVED, which is the only self-consistent reading available: a digest
   * over a document containing itself has no fixed point to converge on. The consequence is that the
   * check is available to any reader with no private knowledge — read the file, drop the one key,
   * digest the rest, compare.
   */
  datasetDigest: Schema.String,
  /**
   * Per-collection slices, sorted by collection.
   *
   * Required rather than optional for the same reason `datasetDigest` is: a set that could be
   * published without them would be a set whose coverage could not be cited without re-running a
   * script, and "the artefact does not say" is how a collection quietly stops being tested.
   */
  coverageRows: Schema.Array(CollectionCoverageRow),
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
