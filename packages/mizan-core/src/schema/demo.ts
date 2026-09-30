import { Schema } from "effect"
import { GradeBasis } from "./record.ts"
import { Verdict, VerdictReason } from "./verdict.ts"

/**
 * `data/demo-questions.json` — the committed synthetic question set, as a declared contract.
 *
 * ## Why the demo needed a committed artefact at all
 *
 * R9 of the architecture ships a synthetic question set so the product is demonstrable with no
 * API key and no network. Until this file existed, the only committed run was whatever a single
 * question happened to produce — and a demo that can only ever show its best case is not a demo.
 * The claim this repository exists to make is that a FABRICATED citation is caught, and that
 * claim is only checkable if a fabrication is committed somewhere a judge can ask about it.
 *
 * ## The fabrication is borrowed, not invented
 *
 * The `rejected` question's quote is copied from `data/eval/redteam-fabricated.json`, which
 * already publishes a real one-word fabrication against a real anchor with a stated rationale.
 * Each expectation therefore carries `sourceCaseId`, so the demo's rejection and the red-team
 * set's rejection are the SAME text judged by the SAME procedure — a judge can cross-check one
 * against the other instead of taking the demo's word for it. Minting a second, private
 * fabrication here would be two sources of truth for one fact (AGENTS.md section 17).
 *
 * ## Where the question text actually is
 *
 * This file declares the shape; `data/demo-questions.json` holds the questions, and
 * `data/transcript.json` and every run trace hold only their SHA-256. Under `data/`, the
 * question set is the one place question text is committed, and it is synthetic — invented
 * strings with no user behind them. That is what makes `syntheticNotice` a load-bearing field
 * rather than a disclaimer bolted on afterwards (AGENTS.md section 13).
 *
 * The claim is scoped to `data/` deliberately. The two questions also appear in the
 * generator's own `Declaration` table, in the README, and in
 * `apps/cli/test/happy-path.test.ts`, and an earlier version of this comment read "the only
 * place in the repository where question text is committed at all". Grep for either question
 * and all three come back. A disclosure that one command refutes is the failure mode this
 * repository exists to prevent (INTEGRITY.md section 9), so the scope is the part that
 * survives being checked.
 *
 * ## `Verdict` and `VerdictReason` are re-used, never re-declared
 *
 * Gate G-6.2 pins `Schema.Literal("verified")` to `schema/verdict.ts`. Importing the unions
 * instead of restating them is what keeps the demo's expectations from becoming a second,
 * drifted copy of the verdict vocabulary.
 */

export const DEMO_QUESTION_SET_VERSION = 1

/** Bumped when the anchors file's shape changes. Recorded in the file itself. */
export const DEMO_ANCHOR_SET_VERSION = 1

/**
 * What one claim of one demo question is DECLARED to produce.
 *
 * Declared, not observed, for the same reason `data/eval/*.json` declares its expectations: an
 * expectation derived by running the code it measures proves nothing. `apps/cli/test/demo.test.ts`
 * reads these and fails when reality differs, which is what makes the demo a test rather than a
 * screenshot.
 */
export const DemoExpectation = Schema.Struct({
  claimId: Schema.String,
  expectedVerdict: Verdict,
  expectedReason: VerdictReason,
  /** The corpus record this claim's citation must resolve to. */
  recordId: Schema.String,
  /** The named transformation that produced this claim's quote. Never a free-text description. */
  mutation: Schema.String,
  /** The `redteam-*` case this quote was taken from, or null when the quote is the record's own text. */
  sourceCaseId: Schema.NullOr(Schema.String),
})
export type DemoExpectation = Schema.Schema.Type<typeof DemoExpectation>

export const DemoQuestion = Schema.Struct({
  id: Schema.String,
  question: Schema.String,
  /** One line: what a judge sees on screen when they run this. */
  demonstrates: Schema.String,
  /**
   * The query the replayed decomposition retrieves with.
   *
   * Pinned here because a demo that retrieves nothing degrades to `no sources found` before it
   * ever reaches the verifier — so the query is part of what the set asserts, not an
   * implementation detail of the transcript that happens to sit beside it.
   */
  query: Schema.String,
  /**
   * The `data/eval/demo-anchors.json` ids this question's corpus rows are rebuilt from.
   *
   * Required and non-empty, because MIZ-101 makes the demo attest its own corpus before it prints
   * anything, and attestation is only meaningful against a corpus the repository can rebuild with
   * no network. `bun run demo` therefore constructs a small snapshot from exactly these anchors
   * rather than opening the 81 MB `data/corpus.db`: the demo's claim is "the badge was computed",
   * and a claim that cannot be checked in ten seconds on a laptop is a claim nobody will check.
   *
   * Every anchor id must be present in the anchors file and every record the expectations cite
   * must come from one of them — `apps/cli/src/demo.ts` checks both, so a demo question cannot
   * quietly start depending on a record the committed anchors no longer contain.
   */
  anchorIds: Schema.Array(Schema.String),
  expectations: Schema.Array(DemoExpectation),
})
export type DemoQuestion = Schema.Schema.Type<typeof DemoQuestion>

/**
 * `data/eval/demo-anchors.json` — the handful of licensed corpus rows the demo is rebuilt from.
 *
 * Separate from `DemoQuestionSet` because it is a different kind of thing: this file carries THIRD
 * PARTY text (Qur'an and hadith, reproduced under each collection's own licence with attribution
 * intact), while the question set carries synthetic strings invented for this repository. Keeping
 * them apart means the licence notice sits on the file it governs, and means deleting the demo
 * cannot be mistaken for deleting someone's licensed text.
 *
 * `textHash` is what makes the file tamper-evident, and it is the hash of `textDisplay` — the
 * `CorpusRecordMeta` convention from `schema/record.ts`, deliberately reused so the field has one
 * definition in the repository. Editing a single diacritic here changes that hash, and the demo
 * refuses to attest — a fingerprint mismatch and a non-zero exit, rather than a demo that quietly
 * verifies a span the upstream source no longer says (AGENTS.md section 3, fail closed). What the
 * hash does *not* do on its own is prove that `textMatch` is the fold of `textDisplay`; that is
 * the second, independent check described below.
 */
/**
 * The stored and folded forms of one anchor's text.
 *
 * Both are committed on purpose, and the pair is what makes the demo attestable. `textMatch` is
 * stored rather than re-derived because the demo must be able to build its snapshot in one pass
 * without importing the fold table into a third composition root — and a stored fold that nobody
 * checks is exactly the fixture weakness `data/eval/*.json` avoids. So `textMatch` is declared
 * OPTIONAL here and the demo re-derives it with the real `normalizeForMatch` and fails closed on
  * a disagreement: the stored copy is a convenience, the re-derived one is the authority, and the
  * two exist to detect a tampered file rather than to be trusted in place of it.
 *
 * This is also the one place a `textMatch` may be committed outside the snapshot, and the
 * narrowness is the point — it is a matching key next to the text it was derived from, in a file
 * whose whole purpose is rebuildable-corpus attestation, and it is never rendered (AGENTS.md
 * section 15's "render `textDisplay`, compare `textMatch`" still holds).
 */
export const DemoAnchor = Schema.Struct({
  /** The `collection:number` this row is. Also the key the demo looks it up by. */
  anchorId: Schema.String,
  recordId: Schema.String,
  collection: Schema.String,
  number: Schema.NullOr(Schema.String),
  /** The source text, verbatim. Never rewritten, and the only text any surface renders. */
  textDisplay: Schema.String,
  /** The fold of `textDisplay`, committed but re-derived and checked by the demo. */
  textMatch: Schema.optional(Schema.String),
  translation: Schema.optional(Schema.String),
  sourceUrl: Schema.String,
  license: Schema.String,
  licenseUrl: Schema.String,
  attribution: Schema.String,
  grade: Schema.NullOr(Schema.String),
  gradeApplicable: Schema.Boolean,
  gradeSource: Schema.String,
  gradeBasis: GradeBasis,
  /** SHA-256 of `textDisplay`, from the shared `toRecordMeta` convention. */
  textHash: Schema.String,
})
export type DemoAnchor = Schema.Schema.Type<typeof DemoAnchor>

/**
 * The header fields are required for the reason `EvalSet` requires them: they are what make the
 * set auditable rather than merely executable. A future question set published without saying
 * where its expectations came from would leave a judge unable to tell a hand-adjudicated
 * expectation from one that merely recorded whatever the verifier last did.
 */
export const DemoAnchorSet = Schema.Struct({
  schemaVersion: Schema.Number,
  set: Schema.String,
  purpose: Schema.String,
  generatedBy: Schema.String,
  regenerateWith: Schema.String,
  determinism: Schema.String,
  licenceNotice: Schema.String,
  /** The `collection:number` ids, so a reader can see coverage without walking the array. */
  anchorIds: Schema.Array(Schema.String),
  anchors: Schema.Array(DemoAnchor),
})
export type DemoAnchorSet = Schema.Schema.Type<typeof DemoAnchorSet>
export const DemoQuestionSet = Schema.Struct({
  schemaVersion: Schema.Number,
  set: Schema.String,
  purpose: Schema.String,
  generatedBy: Schema.String,
  regenerateWith: Schema.String,
  determinism: Schema.String,
  syntheticNotice: Schema.String,
  questions: Schema.Array(DemoQuestion),
})
export type DemoQuestionSet = Schema.Schema.Type<typeof DemoQuestionSet>

export * as DemoSchema from "./demo.ts"
