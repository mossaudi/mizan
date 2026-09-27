import { Schema } from "effect"
import { GENESIS_PREV_HASH, chainHash } from "../hash.ts"
import { DegradeReason, Verdict, VerdictReason, matchStrengthLabel, type ClaimVerdict } from "./verdict.ts"

/**
 * `RunTrace` — one run, one artefact, and the single thing a judge can read to understand
 * what the system did and why.
 *
 * ## Three properties that are structural, not aspirational
 *
 *  1. **No question text, no prose, no corpus text, no PII, ever.** The trace carries
 *     `questionHash` and per-claim `reason` codes. AGENTS.md section 13: log and trace
 *     hashes, never content. A trace is something a judge will read in 60 seconds, and its
 *     credibility depends on it being provably incapable of leaking what a user asked.
 *  2. **The trace is emitted AFTER the verdicts are computed and cannot influence them.**
 *     It is an observer, not an input. Every field here is either a hash, a count, a timing,
 *     or a value the verdict already produced.
 *  3. **The verdict vocabulary is re-used, never re-invented.** `Verdict`, `VerdictReason`
 *     and `DegradeReason` are imported from `verdict.ts`, so a trace cannot disagree with the
 *     report it summarises about which reasons exist.
 *
 * ## Why `match` and not `matchStrength`
 *
 * The trace carries a LABEL, produced by the single named mapping in `verdict.ts`, rather than
 * a copy of the `MatchStrength` object. Copying the object would put a second construction site
 * for a match strength in the repository, which is exactly what gate G-6.4 exists to prevent;
 * and a trace that printed the number next to a `verified` would put a judge-facing percentage
 * one refactor away from the verdict. The label is total, so there is nothing to compute here.
 */

/** Bumped only on a breaking change to the shape below, so an old ledger line is recognisable. */
export const TRACE_SCHEMA_VERSION = "1"

/**
 * Whether the answer was generated live or replayed from a committed transcript.
 *
 * A committed transcript is how a demo survives a provider outage, and a transcript that
 * could be mistaken for a live generation is how a demo loses its credibility — so the
 * distinction is a schema-level value on the trace, not a string someone remembers to print.
 */
export const TranscriptKind = Schema.Union([Schema.Literal("live"), Schema.Literal("precomputed")])
export type TranscriptKind = Schema.Schema.Type<typeof TranscriptKind>

/**
 * Whether the rankers that produced a result set were fused or degraded.
 *
 * A silent downgrade is a lie about fidelity (AGENTS.md section 16): if only one lexical
 * ranker answered, the trace has to say so, because "fused" over one list is not fusion.
 */
export const RankingMode = Schema.Union([Schema.Literal("fused"), Schema.Literal("unavailable")])
export type RankingMode = Schema.Schema.Type<typeof RankingMode>

/** Wall-clock cost per stage, in milliseconds. A budget breach is also a `degraded` entry. */
export const Timings = Schema.Struct({
  retrievalMs: Schema.Number,
  generationMs: Schema.Number,
  verificationMs: Schema.Number,
  totalMs: Schema.Number,
})
export type Timings = Schema.Schema.Type<typeof Timings>

/** One retrieval call. `queryHash`, never the query: rule 13 applies to tool calls too. */
export const ToolCall = Schema.Struct({
  tool: Schema.String,
  queryHash: Schema.String,
  resultCount: Schema.Number,
  ranking: RankingMode,
  elapsedMs: Schema.Number,
})
export type ToolCall = Schema.Schema.Type<typeof ToolCall>

/**
 * The per-claim line a judge reads.
 *
 * `match` is the badge label, and it is deliberately lossy: the trace explains the DECISION
 * and does not re-publish the evidence. `evidence` is reachable through the verdict report;
 * duplicating the quoted span into the ledger would put corpus text in the chain, which
 * rule 13 forbids and which would make the ledger large enough that nobody reads it.
 */
export const ClaimSummary = Schema.Struct({
  claimId: Schema.String,
  verdict: Verdict,
  reason: VerdictReason,
  match: Schema.Union([Schema.Literal("exact"), Schema.Literal("none")]),
})
export type ClaimSummary = Schema.Schema.Type<typeof ClaimSummary>

/**
 * What the confidence policy decided to do with the answer.
 *
 * The POLICY that fills this is a separate, pure package; Sprint 1 only needs the contract,
 * because the trace is a mandatory deliverable and a run that cannot say what it decided to
 * do is not auditable. `refer_to_scholar` is the fail-closed default and is what a run gets
 * whenever any claim is not `verified`.
 */
export const Escalation = Schema.Struct({
  action: Schema.Union([Schema.Literal("answer"), Schema.Literal("refer_to_scholar")]),
  reasons: Schema.Array(Schema.String),
})
export type Escalation = Schema.Schema.Type<typeof Escalation>

/** The chain position a trace was appended at. Returned to the caller so it can be cited. */
export const ChainHead = Schema.Struct({
  index: Schema.Number,
  entryHash: Schema.String,
})
export type ChainHead = Schema.Schema.Type<typeof ChainHead>

/**
 * A trace before it is chained: everything that is content, and none of the three fields
 * that are chain bookkeeping. Kept as its own schema so the ledger cannot be handed an
 * entry that already carries a `prevHash` and quietly re-parent itself.
 *
 * ## It is PERMISSIVE about excess keys, and that is deliberate
 *
 * `Schema.Struct` in the pinned beta strips unknown properties rather than rejecting the
 * payload, and this schema leans on that. A decoded draft provably cannot carry `prevHash` or
 * `entryHash`, so `sealTrace` is the only thing in the repository that can set a chain
 * position — a caller that hands in a fully-formed entry cannot smuggle a position through
 * the trust boundary. Rejecting the payload instead would buy nothing: the chain fields are
 * already unrepresentable in the draft's type, and strictness here would make a future
 * additive field a decoding failure rather than something the ledger can ignore.
 */
export const RunTraceDraft = Schema.Struct({
  schemaVersion: Schema.Literal(TRACE_SCHEMA_VERSION),
  runId: Schema.String,
  questionHash: Schema.String,
  corpusSnapshotHash: Schema.String,
  transcript: TranscriptKind,
  toolsCalled: Schema.Array(ToolCall),
  claims: Schema.Array(ClaimSummary),
  escalation: Escalation,
  timings: Timings,
  degraded: Schema.Array(DegradeReason),
  /** ISO-8601. Carried for the human reader, and NOT part of the digest — see `hashMaterial`. */
  timestamp: Schema.String,
})
export type RunTraceDraft = Schema.Schema.Type<typeof RunTraceDraft>

export const RunTrace = Schema.Struct({
  ...RunTraceDraft.fields,
  prevHash: Schema.String,
  entryHash: Schema.String,
})
export type RunTrace = Schema.Schema.Type<typeof RunTrace>

/**
 * The digest projection, and the one place the "what is hashed" decision is written down.
 *
 * ## `timestamp` is metadata and is EXCLUDED
 *
 * A wall clock is not a fact about the content of a run, and a machine whose clock steps
 * backwards — an NTP correction, a VM resumed from a snapshot — would otherwise produce an
 * entry that verifies against nothing. The `timestamp` is still on the trace, so a human can
 * order the ledger; it is simply not what the chain is made of.
 *
 * ## This DIFFERS from the ingest ledger, deliberately and temporarily
 *
 * `mizan-corpus/src/ledger.ts` includes its `at` field in the digest, so the corpus chain has
 * the same backwards-clock exposure this function exists to remove. That is pre-existing and
 * outside the Sprint 1 stories, so it is not being changed here to avoid an unrequested
 * change to a passing, hash-pinned artefact. Reconciled in S12, when the run ledger lands and
 * both chains are verified by the same judge-facing script.
 * TODO(S12): hash `mizan-corpus`'s `LedgerPayload.at` out of its digest, reusing `chainHash`.
 */
const hashMaterial = (draft: RunTraceDraft): Omit<RunTraceDraft, "timestamp"> => ({
  schemaVersion: draft.schemaVersion,
  runId: draft.runId,
  questionHash: draft.questionHash,
  corpusSnapshotHash: draft.corpusSnapshotHash,
  transcript: draft.transcript,
  toolsCalled: draft.toolsCalled,
  claims: draft.claims,
  escalation: draft.escalation,
  timings: draft.timings,
  degraded: draft.degraded,
})

/** The digest of `draft` as a link following `prevHash`. Total and pure: no clock, no I/O. */
export const traceDigest = (prevHash: string, draft: RunTraceDraft): string => chainHash(prevHash, hashMaterial(draft))

/**
 * Close a draft into a chain entry.
 *
 * Total and pure, like `appendEntry` in the ingest ledger: the caller has already decoded the
 * draft through `RunTraceDraft` at the trust boundary, so re-validating here would be a second
 * source of truth about the same shape.
 */
export const sealTrace = (draft: RunTraceDraft, prevHash: string): RunTrace => ({
  ...draft,
  prevHash,
  entryHash: traceDigest(prevHash, draft),
})

/**
 * Project one verdict onto its trace line.
 *
 * Asks `verdict.ts` for the label rather than computing one — see the note on `match` above,
 * and the reason `matchStrengthLabel` exists.
 */
export const summariseClaim = (verdict: ClaimVerdict): ClaimSummary => ({
  claimId: verdict.claimId,
  verdict: verdict.verdict,
  reason: verdict.reason,
  match: matchStrengthLabel(verdict.matchStrength),
})

/**
 * The head of a trace chain: the last entry, or genesis for an empty ledger.
 *
 * Named for its chain rather than bare `chainHead` because `mizan-corpus/src/ledger.ts`
 * already owns a `chainHead` over `LedgerEntry` — same concept, different entry type, and two
 * exports with one name in a flat export surface is a collision waiting to be made.
 */
export const traceChainHead = (traces: readonly RunTrace[]): string => {
  const last = traces[traces.length - 1]
  return last?.entryHash ?? GENESIS_PREV_HASH
}

export * as Trace from "./trace.ts"
