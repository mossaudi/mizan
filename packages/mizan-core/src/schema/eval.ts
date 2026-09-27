import { Schema } from "effect"
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
 * `expectationSource`, `determinism`, `knownDivergence` and `licenceNotice` are what make a set
 * auditable rather than merely executable. If they were optional, a future set could be published
 * without saying where its expectations came from, and a judge would have no way to tell a
 * hand-adjudicated set from one that recorded whatever the code did. Requiring them makes the
 * provenance a precondition of publication instead of a convention.
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
 * A disagreement between the user story and the implemented procedure, published with the set.
 *
 * The paraphrase case is the live one: the story asks for `unverifiable`, and step 5 of the
 * six-step procedure delivers `rejected`, because telling a paraphrase from a fabrication needs
 * the similarity measurement ADR-03 forbids. Rather than resolving that silently in whichever
 * direction was easier to build, it is data: stamped onto the affected cases, and impossible to
 * publish without.
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
  divergence: Schema.NullOr(KnownDivergence),
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
  knownDivergence: KnownDivergence,
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
