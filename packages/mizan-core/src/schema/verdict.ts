import { Schema } from "effect"
import { GradeBasis } from "./record.ts"

/**
 * The verdict contract — the artefact the entire entry exists to produce.
 *
 * ## Three verdicts, not two
 *
 *  - `verified`      the quoted span is contained, after deterministic folding, in the
 *                    specific corpus record the answer cited.
 *  - `unverifiable`  we cannot decide. No citation, unresolvable identifier, empty
 *                    quote, a paraphrase, a timeout, malformed model output.
 *  - `rejected`      the cited identifier RESOLVED to a real record and that record does
 *                    NOT contain the quoted span. This is a positive claim: the source
 *                    exists and the quote is absent from it.
 *
 * The `unverifiable` / `rejected` boundary is the one most systems get wrong, and
 * getting it wrong in either direction is a religious-safety problem:
 * calling a faithful paraphrase "rejected" accuses a correct answer of lying; calling a
 * fabrication "unverifiable" lets it through with a shrug. The procedure in
 * `packages/mizan-verify/src/verify.ts` separates them by whether the identifier
 * resolved — you may only accuse a citation of misquotation if the thing it points at
 * demonstrably exists.
 *
 * ## MatchStrength is a CONSTRAINED type
 *
 * `{ kind: "exact"; percent: 100 } | { kind: "none" }` and nothing else. A judge-facing
 * "97% match" is far more legible than a bare boolean, and a *fuzzy* 97% is precisely
 * the CWE-345 hole: an invented but plausible hadith scores HIGH on similarity. So the
 * badge reports `exact | none`, and the fuzzy number lives in a display-only diagnostic
 * that `verify.ts` is forbidden to import (gate G-1). Legibility without a pathway to a
 * false `verified`. AGENTS.md section 10.
 */

export const Verdict = Schema.Union([
  Schema.Literal("verified"),
  Schema.Literal("unverifiable"),
  Schema.Literal("rejected"),
])
export type Verdict = Schema.Schema.Type<typeof Verdict>

/**
 * The one spelling of each badge, keyed by the union rather than by `string`.
 *
 * ## Why it lives beside the union and not in a renderer
 *
 * `Record<Verdict, string>` is exhaustive: the day a fourth verdict joins the schema, every map
 * keyed this way stops compiling until somebody writes its badge. Two surfaces render badges —
 * `apps/cli/src/render.ts` and the static page `apps/web/src/page.ts` — and a second copy would
 * be a second place for one of them to disagree about what a `verified` claim is labelled. One
 * spelling of "VERIFIED" is an AGENTS.md section 17 requirement, not a convenience.
 *
 * ## Why there is no fallback branch
 *
 * `badgeFor` has no `default` and no `??`. A verdict this repository does not recognise is a
 * compile error, never a badge invented for a state nobody defined — a component that silently
 * renders *something* for an unknown state is exactly the honest-degradation failure AGENTS.md
 * section 16 forbids, one layer down from the failure table.
 */
export const VERDICT_BADGE: Readonly<Record<Verdict, string>> = {
  verified: "VERIFIED",
  rejected: "REJECTED",
  unverifiable: "UNVERIFIABLE",
}

/** @see VERDICT_BADGE */
export const badgeFor = (verdict: Verdict): string => VERDICT_BADGE[verdict]

export const ExactMatchStrength = Schema.Struct({
  kind: Schema.Literal("exact"),
  percent: Schema.Literal(100),
})

export const NoMatchStrength = Schema.Struct({ kind: Schema.Literal("none") })

export const MatchStrength = Schema.Union([ExactMatchStrength, NoMatchStrength])
export type MatchStrength = Schema.Schema.Type<typeof MatchStrength>

export const noMatchStrength: MatchStrength = { kind: "none" }
export const exactMatchStrength: MatchStrength = { kind: "exact", percent: 100 }

/**
 * `MatchStrength` -> the single-word label a trace carries.
 *
 * ## Why this is a named function and not a ternary at the call site
 *
 * `summariseClaim` in `schema/trace.ts` used to write
 * `verdict.matchStrength.kind === "exact" ? "exact" : "none"`, which gate G-6.4 reported as an
 * ad-hoc match strength. The gate was right about the shape and wrong about the risk: a
 * two-valued ternary cannot invent a third value, so it was never a hole. But it WAS a
 * duplicate of a fact that belongs to one place, and AGENTS.md section 17 is explicit that a
 * duplicated rule is where two runs can legitimately disagree — the day a third shape is added,
 * a call-site ternary silently keeps mapping it to "none" while the schema says otherwise.
 *
 * So the mapping is named, total, and exhaustive over the two shapes, and `trace.ts` asks for
 * the label instead of computing one.
 */
export const matchStrengthLabel = (strength: MatchStrength): "exact" | "none" =>
  strength.kind === "exact" ? "exact" : "none"

/**
 * The reason vocabulary. Every verdict carries one, and each reason maps to exactly
 * one verdict — so a trace explains the decision without reading the algorithm.
 */
export const VerdictReason = Schema.Union([
  /** => verified. THE ONLY route to verified: strict normalized containment. */
  Schema.Literal("exact_containment"),
  /** => unverifiable. The quote was empty or whitespace only. */
  Schema.Literal("empty_quote"),
  /** => unverifiable. No citation attached (fail-closed NOT-VERIFIED rule). */
  Schema.Literal("no_citation"),
  /** => unverifiable. More citations than the per-claim cap, none surviving. */
  Schema.Literal("citation_cap_exceeded"),
  /** => unverifiable. The identifier does not resolve. You cannot prove a negative. */
  Schema.Literal("identifier_unresolved"),
  /** => unverifiable. The number exists in more than one collection and none was named. */
  Schema.Literal("collection_ambiguous"),
  /** => rejected. THE ONLY route to rejected: the cited record exists and lacks the quote. */
  Schema.Literal("quote_absent_at_cited_id"),
  /** => unverifiable. A `verified` was coerced down because it carried no matching evidence. */
  Schema.Literal("no_matching_evidence"),
  /** => unverifiable. The 10s verification budget elapsed. Never a cached prior verdict. */
  Schema.Literal("verification_timeout"),
  /** => unverifiable everywhere. Claim decomposition produced unusable output. */
  Schema.Literal("decomposition_failed"),
])
export type VerdictReason = Schema.Schema.Type<typeof VerdictReason>

/**
 * The evidence behind a `verified` verdict. Present if and only if
 * `verdict === "verified"` — the invariant the fail-closed coercion maintains.
 */
export const EvidenceRef = Schema.Struct({
  recordId: Schema.String,
  collection: Schema.String,
  number: Schema.NullOr(Schema.String),
  sourceUrl: Schema.String,
  license: Schema.String,
  attribution: Schema.String,
  grade: Schema.NullOr(Schema.String),
  gradeSource: Schema.String,
  gradeBasis: GradeBasis,
  /** Characters of the FOLDED quote found in the folded record. Equals the folded quote length when `verified`. */
  matchedChars: Schema.Number,
  /** Characters in the folded quote. */
  quoteChars: Schema.Number,
})
export type EvidenceRef = Schema.Schema.Type<typeof EvidenceRef>

export const ClaimVerdict = Schema.Struct({
  claimId: Schema.String,
  verdict: Verdict,
  reason: VerdictReason,
  matchStrength: MatchStrength,
  evidence: Schema.NullOr(EvidenceRef),
})
export type ClaimVerdict = Schema.Schema.Type<typeof ClaimVerdict>

export const DegradeReason = Schema.Union([
  Schema.Literal("provider_unavailable"),
  Schema.Literal("provider_timeout"),
  Schema.Literal("provider_malformed_output"),
  Schema.Literal("provider_not_configured"),
  Schema.Literal("verification_timeout"),
  Schema.Literal("decomposition_failed"),
  Schema.Literal("no_sources_found"),
  Schema.Literal("retrieval_budget_exceeded"),
  Schema.Literal("semantic_ranking_unavailable"),
  Schema.Literal("tafsir_unavailable"),
  Schema.Literal("tool_call_cap_reached"),
  Schema.Literal("tool_repetition_breaker"),
  Schema.Literal("ledger_append_failed"),
])
export type DegradeReason = Schema.Schema.Type<typeof DegradeReason>

export const VerdictReport = Schema.Struct({
  claims: Schema.Array(ClaimVerdict),
  degraded: Schema.Array(DegradeReason),
  /** The content hash of the snapshot the verdicts were computed against. */
  snapshotHash: Schema.String,
  /** Number of citations that survived the per-claim cap across the whole answer. */
  citationsConsidered: Schema.Number,
})
export type VerdictReport = Schema.Schema.Type<typeof VerdictReport>

/** `verified` implies evidence. Used by the fail-closed coercion and asserted in tests. */
export const evidenceIsPresent = (verdict: Verdict, evidence: EvidenceRef | null): boolean =>
  verdict === "verified" ? evidence !== null : evidence === null

export * as VerdictSchema from "./verdict.ts"
