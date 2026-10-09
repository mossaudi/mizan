import { Schema } from "effect"
import { decodeOrFail, decodeSync, type DecodeFailure } from "./decode.ts"
import { err, ok, type Result } from "../result.ts"

/**
 * The degradation vocabulary of AGENTS.md section 16, as a declared contract.
 *
 * ## Why prose needed a schema
 *
 * The seven-row table in `AGENTS.md` and the seven rows of `docs/degradation-matrix.md` were the
 * only statement of what an honest failure looks like, and each shipped surface had its own local
 * enum for it: `CorpusProblem` in `packages/mizan-mcp/src/verifier.ts`, and bare strings and exit
 * codes in `apps/cli`. "Both surfaces name the same degradation condition" was therefore a claim
 * maintained by hand across three files — the same defect class as the gate-count prose, one layer
 * down, and with a sharper consequence: a customer comparing a CLI run against an MCP call could be
 * told two different reasons for the same absence.
 *
 * So the vocabulary lives here, once, and is the set every surface must project into.
 *
 * ## What is wired today, stated exactly
 *
 * Consumed: `scripts/accept-customer.ts` types its skip reasons with `DegradationCondition`;
 * `packages/mizan-mcp/src/verifier.ts` projects every `CorpusProblem` tag through
 * `conditionOfCorpusProblem` and prints `describeCondition`; `apps/cli/src/degradation.ts` projects the
 * CLI's corpus states the same way. `test/degradation-vocabulary.test.ts` proves every row is named,
 * described, and rejected when it is not in the set, and each surface's `test/clean-clone.test.ts`
 * proves that surface's own vocabulary decodes into it.
 *
 * ## Why `corpus_unusable` and `attestation_unreadable` are in the set
 *
 * They were deliberately absent, with the question left open: what is the degradation of a corpus that
 * is *present and cannot be opened*, and of an attestation that is *present and cannot be read*? The
 * answer is that they are not `corpus_absent` and not `attestation_mismatch`, and projecting them
 * there would tell a client the corpus is missing when it is on disk and corrupt — two states with
 * opposite remedies behind one name. An earlier version of this module said the set was short of them
 * "until the question is answered", and the question has now been answered by adding the two names.
 * `CorpusProblem` then maps one to one, so the projection is total and nothing is guessed; a client
 * comparing a CLI run with an MCP call gets the same word for the same absence.
 *
 * Like `corpus_absent`, neither appears in `docs/degradation-matrix.md`'s seven rows: that table is
 * about the seven *runtime* failure modes of a completed pipeline, and these three are states the
 * pipeline never entered. They are conditions a surface reports instead of entering it.
 *
 * ## Why `unmeasured` is in the set
 *
 * It is the one state that is not a failure. A corpus miss is `no_sources_found`; a corpus that
 * was never built is `corpus_absent`; and a figure nobody could produce because the evidence
 * artefact is not in this checkout is neither of those. It is representable here so that
 * `unmeasured` can never be rendered as `0` — the two are different claims, and conflating them is
 * how an unmeasured collection becomes a published zero (Story 3).
 *
 * ## Why a literal set and not free strings
 *
 * Every row is adjudicated in `test/degradation.test.ts`, and a condition name that is not in this
 * set is a decode failure rather than a silent pass. A degradation vocabulary that accepts a typo
 * would let a surface report a state nobody documented, which is the "assertively fine" outcome
 * section 16 forbids.
 */
export const DegradationCondition = Schema.Union([
  Schema.Literal("corpus_absent"),
  Schema.Literal("corpus_unusable"),
  Schema.Literal("attestation_unreadable"),
  Schema.Literal("no_sources_found"),
  Schema.Literal("model_unavailable"),
  Schema.Literal("unverifiable"),
  Schema.Literal("semantic_ranking_unavailable"),
  Schema.Literal("ledger_write_failed"),
  Schema.Literal("attestation_mismatch"),
  Schema.Literal("unmeasured"),
  /**
   * The document is larger than the declared cap, so the run refused before segmenting it.
   *
   * A condition rather than a reason on a verdict, because no span ever reached the verifier: this
   * is what a surface reports *instead of entering* the pipeline, like `corpus_absent`. It is a
   * distinct name rather than a reuse of `unmeasured` because the two carry opposite remedies — a
   * document that was too long is retried in more chunks, whereas an unproduced figure is not
   * retried at all — and folding them together would send an integrator round the wrong loop.
   */
  Schema.Literal("document_too_large"),
])
export type DegradationCondition = Schema.Schema.Type<typeof DegradationCondition>

/**
 * Exactly one sentence per condition, shared by every surface.
 *
 * One function rather than a lookup table beside each surface, so that the wording of a condition is
 * one thing in the repository instead of one thing per surface that can drift. A surface projects onto
 * the condition and calls this; it does not hold its own copy of the sentence, because the failure this
 * is for is two surfaces describing the same condition in words that differ in the part a user reads.
 * The wording is a report line, so it carries the condition's own name for a client that branches on
 * the tag and reads no English, and the forbidden alternative in the same line, because a sentence
 * saying only what did not happen leaves the reader to guess what did (AGENTS.md section 16).
 *
 * ## Why a `Record` and not a chain of `if`s
 *
 * This was a nine-branch `if` chain ending in a fallthrough `return`. A chain is not total by
 * construction: add a tenth literal to `DegradationCondition` and the function still compiles, still
 * typechecks, and silently reports the new condition as `unmeasured` — a state that means "nobody
 * produced this figure", which is the one reading a report line must never give a fault. That is
 * fail-open prose, and it is exactly the class AGENTS.md section 3 and section 17 exist to prevent:
 * the vocabulary and its wording were two things, one of them unenforced.
 *
 * A `Record<DegradationCondition, string>` makes the omission a type error, so "every condition is
 * described" is checked by `tsc --noEmit` rather than by a reviewer reading nine branches for a
 * tenth. The keys are the derived union, never a hand-written list, so there is no second copy of the
 * set to drift.
 */
const CONDITION_SENTENCE: Readonly<Record<DegradationCondition, string>> = {
  corpus_absent: "corpus_absent: no attested corpus is present, so nothing was retrieved and no verdict was computed. Run `bun run ingest`.",
  corpus_unusable: "corpus_unusable: the corpus file is present but could not be opened, or records no snapshot identity, so nothing was retrieved and no verdict was computed. This is not the same as an absent corpus; run `bun run ingest` to rebuild it.",
  attestation_unreadable: "attestation_unreadable: the corpus is present but attestation.json is missing or could not be read, so no verdict computed against it could be attributed to an authorised corpus. Warn-and-proceed is forbidden; run `bun run ingest`.",
  no_sources_found: "no_sources_found: the question was understood and the corpus was consulted, and it returned nothing that could be cited. No answer was composed.",
  model_unavailable: "model_unavailable: the language model provider could not be reached inside its 30s budget, so no answer was composed and no verdict was computed.",
  unverifiable: "unverifiable: a claim reached the verifier and the evidence was incomplete, so the honest answer is that it could not be decided. Never `verified`, and never a cached prior verdict.",
  semantic_ranking_unavailable: 'semantic_ranking_unavailable: the second ranker is down, so run metadata records semanticRanking: "unavailable". A silent downgrade to lexical-only is forbidden.',
  ledger_write_failed: "ledger_write_failed: the run could not be recorded, so the run is marked untrusted. Proceeding as if it had been recorded is forbidden.",
  attestation_mismatch: "attestation_mismatch: the corpus on disk is not the corpus attestation.json authorises, so no verdict was computed. Warn-and-proceed is forbidden.",
  unmeasured: "unmeasured: this figure was not produced in this checkout, which is not the same as a figure of zero. No number is published for it.",
  document_too_large:
    "document_too_large: the document is longer than the declared cap, so it was refused whole rather than shortened. Silent truncation into a partial report is forbidden; submit it in bounded chunks.",
}

export const describeCondition = (condition: DegradationCondition): string => CONDITION_SENTENCE[condition]

/**
 * Every condition this build describes, sorted.
 *
 * Exported so that a test can compare the wording table against the vocabulary in BOTH directions:
 * the vocabulary must have no undescribed condition, and the wording table must describe no condition
 * that has left the vocabulary. A one-directional test passes happily when a name is deleted from the
 * schema and its sentence is left behind, which is how a stale surface keeps reporting a condition
 * the repository has stopped admitting exists.
 */
export const describedConditions = (): readonly DegradationCondition[] =>
  (Object.keys(CONDITION_SENTENCE) as DegradationCondition[]).toSorted()

/**
 * Narrow an untrusted payload to a condition, or refuse.
 *
 * ## Why a string is accepted and nothing else
 *
 * A surface arrives with a condition it chose from its own wire shape, and the only thing this
 * function must guarantee is that the name is one of ours. Accepting an object, an array or a
 * number would widen the decode without narrowing anything, and accepting a longer string with the
 * right prefix would let `corpus_absent_but_really_fine` through — so the decode is exact.
 */
export const decodeCondition = (payload: unknown): Result<DegradationCondition, DecodeFailure> => {
  const decoded = decodeOrFail(decodeSync(DegradationCondition), payload, "DegradationCondition")
  if (decoded.ok) return ok(decoded.value)
  return err(decoded.error)
}

/**
 * Narrow a projection's name to a condition, or refuse.
 *
 * This is the seam a surface projects through, and it is the only place a name enters the set — so
 * "a surface cannot invent a degradation name" is a property of this function rather than of a
 * reviewer's memory. Both shipped surfaces route through it: `packages/mizan-mcp` maps each
 * `CorpusProblem` tag here, and `apps/cli` maps its own corpus states here, which is what makes
 * "both surfaces name the same degradation condition" an import-graph fact rather than a promise in
 * a comment (AGENTS.md section 12).
 */
export const conditionOf = (value: string): Result<DegradationCondition, DecodeFailure> => decodeCondition(value)

export * as Degradation from "./degradation.ts"
