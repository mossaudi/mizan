import { Schema } from "effect"

/**
 * The published comparison: a declared baseline, the hypothesis stated before the run, and the
 * figures.
 *
 * ## This module holds a CONTRACT, and the contract is deliberately small
 *
 * Every field here is produced by `scripts/benchmark/run.ts` and consumed by
 * `scripts/benchmark/report.ts` and `apps/cli/test/benchmark.test.ts`. Nothing is declared that a
 * writer does not emit: a schema field with no producer is a promise the artefact cannot keep, and
 * a benchmark schema is the worst place for one, because a reader trusts the shape before they
 * read the numbers.
 */

/**
 * Bumped only when the published shape changes incompatibly; a reader decodes with it.
 *
 * Version 2: the system arm became a measurement. `systemAgreementRate` and `systemArmSource` were
 * added as required fields, and the per-case `BenchmarkOutcome` shed its system fields — a version-1
 * artefact's `systemVerdict` rows cannot even be expressed in the current shape, so a reader seeing
 * version 1 knows the detection rate was declared, not executed.
 */
export const BENCHMARK_SCHEMA_VERSION = 2

/**
 * The claim, stated before the numbers, and stored beside them so a later reader can check that it
 * is the claim the run actually tested.
 *
 * Two things it deliberately does NOT say. It does not name a margin — the point of a
 * pre-registered hypothesis is to be falsified by whatever the run produced, and a number chosen
 * after seeing the result is a description of the result. And it does not claim a magnitude of
 * correctness for the system arm, because "detection rate" on a red-team set is 1.0 for a perfect
 * verifier and for an inverted one alike. What makes the figure interpretable is published beside it
 * as `systemAgreementRate`, which is 0.0 for an inverted verifier, and the report prints both.
 *
 * The string is frozen: the committed artefact stores it and a test asserts the report prints it
 * above the first figure, so editing the wording silently rewrites what a judge read as the claim.
 */
export const PRE_REGISTERED_HYPOTHESIS =
  "On the 40-case red-team set, a plain FTS5 top-k search returns the cited record at rank 1 for a substantial majority of fabrications, and mizan's detection rate exceeds it by a margin that is not explainable by abstention."

/**
 * The baseline's configuration, as published beside its figures.
 *
 * ## Why the levers are in the ARTEFACT
 *
 * A baseline number is only interpretable against the configuration that produced it, and the
 * configuration is where rigging lives. `collectionFilter: true` means the baseline was told which
 * collection to look in — a reader who already knows the answer. `usesGoldRecordId: true` means it
 * was handed the answer. `rerunBudget > 0` means it re-asked until the cited record turned up. Each
 * raises the baseline's hit rate, and each makes mizan's margin look smaller, so a rigged baseline
 * could only ever flatter the comparison — which is precisely why the levers are printed and
 * compared field by field against `HONEST_BASELINE` rather than left in the harness.
 *
 * The field set is closed: `strategy` and `column` are unions, not strings, so a new arm cannot be
 * introduced by widening a type. The other two strategies and the second column exist so
 * `scripts/benchmark/rigged.ts` can plant a defect that the honesty check is proven to catch.
 */
export const BaselineDeclaration = Schema.Struct({
  /** The one honest strategy is `fts5-bm25`. The others exist so a defect can be planted. */
  strategy: Schema.Union([Schema.Literal("fts5-bm25"), Schema.Literal("id-order"), Schema.Literal("rerun-until-found")]),
  /** `textMatch` is the folded index. `textDisplay` queries the raw, undiacriticized column. */
  column: Schema.Union([Schema.Literal("textMatch"), Schema.Literal("textDisplay")]),
  collectionFilter: Schema.Boolean,
  usesGoldRecordId: Schema.Boolean,
  k: Schema.Number,
  rerunBudget: Schema.Number,
})
export type BaselineDeclaration = Schema.Schema.Type<typeof BaselineDeclaration>

/**
 * The one configuration the benchmark is allowed to publish.
 *
 * The single source of truth for "honest" (AGENTS.md §17): `scripts/benchmark/baseline.ts` declares
 * the options it runs, `score.ts` projects them, `rigged.ts` plants deviations, and the self-test
 * asserts a projection of the running options equals this object. A field added to
 * `BaselineDeclaration` and forgotten here is caught by the same test that checks the rigged
 * catalogue, because it compares the field lists.
 */
export const HONEST_BASELINE: BaselineDeclaration = Object.freeze({
  strategy: "fts5-bm25",
  column: "textMatch",
  collectionFilter: false,
  usesGoldRecordId: false,
  k: 1,
  rerunBudget: 0,
})

/**
 * One case, on the BASELINE arm.
 *
 * The system arm's verdicts are not in here. They arrive as measurements from
 * `scripts/benchmark/system-arm.ts` and are joined to the set's declarations in
 * `scripts/benchmark/compare.ts`, so the two arms are stored apart rather than interleaved per row:
 * a reader can see that the baseline number and the system number were produced by different code
 * reading different inputs.
 *
 * `baselineTopRecordId` is null when the baseline returned nothing, which is a different outcome from
 * returning the wrong record and is kept distinct rather than collapsed into a miss: a baseline that
 * crashes on a grammar character must not be scored as a baseline that retrieved something else.
 */
export const BenchmarkOutcome = Schema.Struct({
  caseId: Schema.String,
  baselineTopRecordId: Schema.NullOr(Schema.String),
  baselineTopHit: Schema.Boolean,
})
export type BenchmarkOutcome = Schema.Schema.Type<typeof BenchmarkOutcome>

/**
 * How the system arm's verdicts were obtained.
 *
 * ONE value, and that is the point. A union with a `declared-expectations` member would let the
 * artefact record that the system arm never ran the verifier and still satisfy the schema — which is
 * precisely the defect this replaced, where a detection rate of 1.0 was a restatement of the fixture.
 * There is no spelling of "the system arm did not execute the verifier", so an artefact claiming
 * otherwise cannot be written.
 *
 * ## What this schema does not do
 *
 * It pins the ARTEFACT's claim, which is the claim a reader checks. It cannot pin the other half —
 * that the executor cannot read the labels it would otherwise be restating — and no gate pins it
 * either: there is no `B-1` in `GATE_IDS` and no `packages/mizan-gate/src/benchmark-provenance.ts`,
 * because that scan is specified and unshipped. `scripts/benchmark/system-arm.ts` holds it by type
 * and by review. Read the single literal as "this file cannot lie about how it ran", which is
 * strictly narrower than "this benchmark cannot be a tautology".
 */
export const SystemArmSource = Schema.Literal("executed-verifier")
export type SystemArmSource = Schema.Schema.Type<typeof SystemArmSource>


/**
 * The committed artefact, `data/benchmark/vs-search.json`.
 *
 * ## Every figure is a fraction with its denominator beside it
 *
 * `caseCount` is stored next to the rates so a reader never has to infer the denominator, and the
 * self-test checks `rate * caseCount` against the integer the report prose quotes — a rate without
 * a denominator is the easiest claim in a repository to make unfalsifiable.
 *
 * ## `falseVerifiedCount` is the release blocker
 *
 * A single `verified` on a fabrication is a false positive on invented religious text, which is the
 * one outcome this repository exists to prevent. It is COUNTED rather than asserted so that a run
 * violating it still writes an artefact recording the violation instead of leaving no evidence.
 */
export const BenchmarkResult = Schema.Struct({
  schemaVersion: Schema.Number,
  preRegisteredHypothesis: Schema.String,
  corpusFingerprint: Schema.String,
  corpusRecordCount: Schema.Number,
  setName: Schema.String,
  caseCount: Schema.Number,
  /** The share of cases the verifier did NOT call `verified`. 1.0 on a red-team set, so see below. */
  systemDetectionRate: Schema.Number,
  /**
   * The share of cases where the verifier's verdict EQUALS the set's declared verdict.
   *
   * The number that makes the detection rate mean something. Detection is 1.0 for a perfect
   * verifier, an inverted one, and a tautology that never ran, so on its own it cannot distinguish
   * them; agreement is 0.0 for an inverted verifier and 1.0 only for one that reproduces the declared
   * behaviour case for case. Publishing the first without the second is how a tautology gets read as
   * a result.
   */
  systemAgreementRate: Schema.Number,
  /** Published so a high detection rate cannot hide behind declining to judge. */
  systemAbstentionRate: Schema.Number,
  baselineTop1HitRate: Schema.Number,
  delta: Schema.Number,
  falseVerifiedCount: Schema.Number,
  /** The only value the schema admits; see `SystemArmSource`. */
  systemArmSource: SystemArmSource,
  declaration: BaselineDeclaration,
})
export type BenchmarkResult = Schema.Schema.Type<typeof BenchmarkResult>

/* ------------------------------------------------------------------ peer figures */

/** Bumped only when the peer register's published shape changes incompatibly. */
export const PEER_REGISTER_VERSION = 1

/**
 * What a peer's number was measured on, published beside the number.
 *
 * A percentage without these four fields is not comparable to anything, and publishing it beside a
 * mizan figure is the specific failure this register exists to prevent: 66% on a fabrication set
 * and 66% on a paraphrase set are the same characters and different measurements. So the method is
 * part of the record, not a footnote — and `published` is a field rather than an absence, because
 * "the method was not published" is itself the finding a reader needs.
 */
export const PeerMethod = Schema.Struct({
  /** The corpus the peer measured on, named. */
  corpus: Schema.String,
  /** The task, named. "detect fabrication" and "score answer quality" are different tasks. */
  task: Schema.String,
  /** The metric's definition, not its name. "accuracy" means nothing without it. */
  metric: Schema.String,
  /** The measured or reported human ceiling, or a sentence saying it is unknown. */
  humanCeiling: Schema.String,
})
export type PeerMethod = Schema.Schema.Type<typeof PeerMethod>

/**
 * One published peer figure.
 *
 * `figure` is `null` when this repository has not measured or verified the peer, and a row with a
 * null figure is still worth keeping in the register: it is how "we looked and could not verify
 * this" is recorded, which is different from the figure never having been mentioned.
 *
 * `method` is `null` when the peer published no method. That combination is *legal and inert* — see
 * `peerStatesAFigure` — and it is what the table renders as `method not published`.
 */
export const PeerFigure = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  figure: Schema.NullOr(Schema.Number),
  /** The metric the figure is expressed in. A peer measuring F1 and mizan measuring containment are two rows, not one. */
  metric: Schema.String,
  /** The method, or `null`. A figure may not be published without one. */
  method: Schema.NullOr(PeerMethod),
  /** Where the figure came from: a paper, a repository, or a sentence saying it is unverified. */
  source: Schema.String,
})
export type PeerFigure = Schema.Schema.Type<typeof PeerFigure>

/** The committed register, `data/benchmark/peers.json`. */
export const PeerRegister = Schema.Struct({
  schemaVersion: Schema.Number,
  peers: Schema.Array(PeerFigure),
})
export type PeerRegister = Schema.Schema.Type<typeof PeerRegister>

/**
 * Whether a row may put a number on the page.
 *
 * **A figure without a method is not publishable.** This is the rule that makes the table worth
 * reading, and it is a predicate rather than a schema refinement because the failure it prevents is
 * a *composition* of two legal field values, which a per-field schema cannot express. The renderer
 * and the documentation check both call it, so a row cannot slip past one of them (AGENTS.md §17).
 */
export const peerStatesAFigure = (peer: PeerFigure): boolean => peer.figure !== null && peer.method !== null

/** Why a row prints `method not published`, in the exact words the table cell uses. */
export const METHOD_NOT_PUBLISHED = "method not published"

export * as BenchmarkSchema from "./benchmark.ts"
