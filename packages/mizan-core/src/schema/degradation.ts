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
 * So the vocabulary lives here, once, and both surfaces *decode into* it. They still project onto
 * their own wire shapes (`CorpusProblem` keeps its four tags, the CLI keeps its exit codes), because
 * those are published contracts; what changes is that a projection can no longer invent a name.
 * Agreement becomes structural rather than reviewed.
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
  Schema.Literal("no_sources_found"),
  Schema.Literal("model_unavailable"),
  Schema.Literal("unverifiable"),
  Schema.Literal("semantic_ranking_unavailable"),
  Schema.Literal("ledger_write_failed"),
  Schema.Literal("attestation_mismatch"),
  Schema.Literal("unmeasured"),
])
export type DegradationCondition = Schema.Schema.Type<typeof DegradationCondition>

/**
 * Exactly one sentence per condition, shared by every surface.
 *
 * One function rather than a lookup table beside each surface, because the failure this prevents is
 * two surfaces describing the same condition in words that differ in the part a user reads. The
 * wording is a report line, so it carries the condition's own name for a client that branches on
 * the tag and reads no English, and the forbidden alternative in the same line, because a sentence
 * saying only what did not happen leaves the reader to guess what did (AGENTS.md section 16).
 */
export const describeCondition = (condition: DegradationCondition): string => {
  if (condition === "corpus_absent") {
    return "corpus_absent: no attested corpus is present, so nothing was retrieved and no verdict was computed. Run `bun run ingest`."
  }
  if (condition === "no_sources_found") {
    return "no_sources_found: the question was understood and the corpus was consulted, and it returned nothing that could be cited. No answer was composed."
  }
  if (condition === "model_unavailable") {
    return "model_unavailable: the language model provider could not be reached inside its 30s budget, so no answer was composed and no verdict was computed."
  }
  if (condition === "unverifiable") {
    return "unverifiable: a claim reached the verifier and the evidence was incomplete, so the honest answer is that it could not be decided. Never `verified`, and never a cached prior verdict."
  }
  if (condition === "semantic_ranking_unavailable") {
    return 'semantic_ranking_unavailable: the second ranker is down, so run metadata records semanticRanking: "unavailable". A silent downgrade to lexical-only is forbidden.'
  }
  if (condition === "ledger_write_failed") {
    return "ledger_write_failed: the run could not be recorded, so the run is marked untrusted. Proceeding as if it had been recorded is forbidden."
  }
  if (condition === "attestation_mismatch") {
    return "attestation_mismatch: the corpus on disk is not the corpus attestation.json authorises, so no verdict was computed. Warn-and-proceed is forbidden."
  }
  return "unmeasured: this figure was not produced in this checkout, which is not the same as a figure of zero. No number is published for it."
}

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
 * The condition a projection maps to, or `null` when the projection names something outside the set.
 *
 * A mapping table rather than a hand-written branch per surface, so the refusal is one property
 * ("this value is in the set") instead of one property per surface. `null` rather than a thrown
 * error: a surface that receives an unmapped value has a bug, and a bug must be visible at the
 * call site — a `Result` is what makes the caller handle it, which is AGENTS.md section 2.
 */
export const conditionOf = (value: string): Result<DegradationCondition, DecodeFailure> => decodeCondition(value)

export * as Degradation from "./degradation.ts"
