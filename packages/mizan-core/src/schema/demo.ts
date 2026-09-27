import { Schema } from "effect"
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
  expectations: Schema.Array(DemoExpectation),
})
export type DemoQuestion = Schema.Schema.Type<typeof DemoQuestion>

/**
 * The header fields are required for the reason `EvalSet` requires them: they are what make the
 * set auditable rather than merely executable. A future question set published without saying
 * where its expectations came from would leave a judge unable to tell a hand-adjudicated
 * expectation from one that merely recorded whatever the verifier last did.
 */
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
