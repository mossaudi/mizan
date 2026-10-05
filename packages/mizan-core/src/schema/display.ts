import { Schema } from "effect"

/**
 * The two discrete display states of Sprint 2, and the spans they point at.
 *
 * ## The constraint these shapes exist to satisfy
 *
 * Sprint 2's standing constraint: a correction and a relevance assessment each emit **a discrete
 * state plus a located span** — never a percentage, a confidence bucket, a severity, or a weighted
 * trust score. That constraint is not a style preference; it is the finding from the feasibility
 * spike in ADR-03, where a fuzzy 0.89 scored an invented hadith above a faithful paraphrase. A
 * number on these surfaces is the fabrication-acceptance hole wearing a nicer hat (AGENTS.md §10).
 *
 * So both shapes are tagged unions with a `state` discriminant, and **neither contains a number that
 * is not a position**. The only numbers in `CorrectionSpan` are `startChar` and `endChar`, which
 * are indices into the folded record: a location, not a measurement.
 *
 * ## `Relevance` has no counts either
 *
 * The obvious design is `{ matched, total }` and then a renderer that divides. That was rejected
 * because the quotient is a score, and a score is the thing being banned. `Relevance` carries the
 * located question terms and the missing ones, as lists, so a reader is told *which words* the
 * answer does and does not use without anything in the repository ever computing a rate.
 */

/**
 * A located run of the cited record, in FOLDED coordinates.
 *
 * `text` is the canonical form, not a transcription. A folded Arabic string is not what the source
 * published, and showing it beside a badge would be both an offence to the reader and a licence
 * problem; the renderer labels it as canonical for exactly that reason.
 */
export const CorrectionSpan = Schema.Struct({
  /** Index into the folded record where the located run begins. */
  startChar: Schema.Number,
  /** Index just past the end of the located run. */
  endChar: Schema.Number,
  /** The canonical text of the run. */
  text: Schema.String,
  /** `true` when `text` is the first `MAX_SPAN_CHARS` of a longer run, and says so on screen. */
  capped: Schema.Boolean,
})
export type CorrectionSpan = Schema.Schema.Type<typeof CorrectionSpan>

/**
 * A rejected claim has a located canonical span to point at.
 *
 * Never a match strength. Nothing in this union is reachable from `verify.ts`, so the badge above
 * the span was computed by containment and the span below it was computed by a different module,
 * and gate G-7 re-asserts that they are separate code paths.
 */
export const LocatedCorrection = Schema.Struct({
  state: Schema.Literal("located"),
  span: CorrectionSpan,
})
export type LocatedCorrection = Schema.Schema.Type<typeof LocatedCorrection>

/**
 * No span. The reason is part of the state, because "no span" and "we did not look" are different
 * facts and a reader who cannot tell them apart is back to trusting a badge they cannot check.
 *
 * `unverifiable` is the spelling Sprint 2 fixes for this case: an absent span must never be
 * rendered as an empty string beside a location marker, which reads as "the match is here, and it
 * is empty".
 */
export const UnverifiableCorrection = Schema.Struct({
  state: Schema.Literal("unverifiable"),
  reason: Schema.String,
})
export type UnverifiableCorrection = Schema.Schema.Type<typeof UnverifiableCorrection>

export const Correction = Schema.Union([LocatedCorrection, UnverifiableCorrection])
export type Correction = Schema.Schema.Type<typeof Correction>

/**
 * The three relevance states, and no fourth.
 *
 *  - `answers`         every content term of the question occurs in the answer's canonical form
 *  - `doesNotAnswer`   no content term of the question occurs in it
 *  - `undetermined`    the checker cannot decide, and says why
 *
 * `undetermined` is the load-bearing one. It is never collapsed into `answers` — a checker that
 * cannot decide is not a checker that found nothing wrong — and it is rendered distinctly, because
 * a reader who sees `undetermined` and a reader who sees `answers` must be able to tell which
 * question was asked.
 */
export const RelevanceState = Schema.Union([
  Schema.Literal("answers"),
  Schema.Literal("doesNotAnswer"),
  Schema.Literal("undetermined"),
])
export type RelevanceState = Schema.Schema.Type<typeof RelevanceState>

/**
 * A relevance assessment: the state, the terms it located, and the terms it could not.
 *
 * There is no `matched: 3, total: 7` here, and that omission is deliberate — see the module
 * header. The lists are in the question's own order so two runs over the same question produce
 * byte-identical output.
 */
export const Relevance = Schema.Struct({
  state: RelevanceState,
  /** Content terms of the question found in the answer's canonical form. */
  located: Schema.Array(Schema.String),
  /** Content terms of the question absent from the answer's canonical form. */
  missing: Schema.Array(Schema.String),
  /** A sentence saying why this state and not another. Never empty. */
  reason: Schema.String,
})
export type Relevance = Schema.Schema.Type<typeof Relevance>

/**
 * One nearby record, as a suggestion may name it.
 *
 * ## Why a `nearby` is not an `EvidenceRef`
 *
 * `EvidenceRef` is what a verdict rests on: it is inside `VerdictReport`, it feeds the badge, and
 * it is hash-chained into the run trace. This type is not. It is display-only, it carries no text,
 * and it is reachable only from `render.ts` — so a renderer cannot read a `nearby` as though it were
 * the evidence a `verified` badge was computed from, because it is not evidence and the badge was
 * already decided before this was built.
 *
 * ## Why there is no number in here
 *
 * There is no `score`, no `percent`, no `confidence`, no quotient, and no field a caller could divide
 * to manufacture one. The ranking value stays inside `@mizan/suggest`, and the closeness a reader
 * wants is two whole numbers in a sentence — `sharedRunChars` of `quoteChars`, measured once by the
 * display-only `longestRunFor` diagnostic and carried here. That is the same discipline as
 * `Relevance` above and `MatchStrength` itself (AGENTS.md §10), and gate G-7.4 enforces it:
 * `percent`, `confidence`, `score` and `trustScore` are banned property keys on every display module.
 *
 * ## The two integers, and why they are on the contract at all
 *
 * `sharedRunChars` and `quoteChars` are a deliberate reversal of the paragraph above, written down
 * here rather than smuggled in. This schema used to carry no number at all precisely so that the
 * renderer could not hold one, and the renderer reached back into `@mizan/verify` to compute
 * `longestRunFor` per candidate instead. That worked, and it had two defects.
 *
 * First, the measurement was made twice, in two modules, from two spellings of the same inputs, so a
 * badge and the line under it could describe different overlaps. Second — and this is the one that
 * put four unrelated hadiths in a judge's crosshair — **the list was filtered by a number that was not
 * on it**. `MIN_SHARED_TRIGRAMS` is in 3-gram types, a unit the reader has never seen, so nothing on
 * screen could contradict the threshold that admitted a row. A reader saw four unrelated records and
 * no reason why, because the reason was expressed in a unit that is not printed anywhere.
 *
 * So the integers that decide display travel with the row that is displayed, the admission threshold
 * is stated in one of them (`MIN_SHARED_RUN_CHARS`), and G-7.12 fails the build if a third number or
 * any quotient appears here. Two integers, one denominator shared by the whole block, no percent —
 * which keeps the sentence legible without reintroducing the thing that would let a closeness figure
 * influence anything (ADR-12).
 *
 * `collection` and `number` are stored separately rather than as a pre-joined label because the
 * label is a *formatting* decision and belongs to the renderer that already owns it for evidence
 * (`citationLabel` in `render.ts`). One owner per rule, AGENTS.md §17.
 *
 * `grade` is carried exactly as the dataset stores it, with `gradeApplicable`, `gradeSource` and
 * `gradeBasis`, and the renderer prints it only when applicable (AGENTS.md §15). A grade is never
 * ours, and a suggestion is never a ruling.
 */
export const NearbyRecord = Schema.Struct({
  /** Dense from 1. Position in a list, not a measurement. */
  rank: Schema.Number,
  recordId: Schema.String,
  collection: Schema.String,
  number: Schema.NullOr(Schema.String),
  /**
   * Length of the longest contiguous run of folded characters this record shares with the quote.
   *
   * One of the two integers on the line beside the record, and the unit the display floor
   * (`MIN_SHARED_RUN_CHARS`) is stated in — so the threshold that admitted this row is readable on
   * the row. Whole characters, never divided; see the header for why the no-number rule was reversed.
   */
  sharedRunChars: Schema.Number,
  /** The record's own URL, never one reconstructed from the id. */
  sourceUrl: Schema.String,
  attribution: Schema.String,
  license: Schema.String,
  grade: Schema.NullOr(Schema.String),
  gradeApplicable: Schema.Boolean,
  gradeSource: Schema.String,
  gradeBasis: Schema.String,
})
export type NearbyRecord = Schema.Schema.Type<typeof NearbyRecord>

/**
 * The three states a suggestion search can be in, and no fourth.
 *
 *  - `candidates`      one to five nearby records were found, in rank order.
 *  - `no_candidates`   the corpus was searched and nothing cleared the **display** floor
 *                      (`MIN_SHARED_RUN_CHARS` shared folded characters of contiguous overlap). This is
 *                      a fact about proximity, never a fact about authenticity.
 *  - `unavailable`     the search could not be run, and says why.
 *
 * ## The distinction that is load-bearing
 *
 * `no_candidates` and `unavailable` are different claims, and collapsing them is the failure this
 * union exists to prevent: "we looked and found nothing near your quote" and "we could not look"
 * are opposite sentences, and a reader given the first when the truth was the second has been told
 * the corpus has no near record when in fact the program never ran. `considered` appears on both
 * searched states so the scope is visible on screen rather than assumed, and `unavailable` carries
 * no count because there was no search to count.
 *
 * ## An absent `Suggestion` is a fourth state, and it is not in this union
 *
 * When suggestions were never computed — the feature is off, the claim was not a rejection, the
 * quote was absent — there is no `Suggestion` at all, and the renderer prints nothing. That is
 * honest, because the surface genuinely did not compute anything, and it is why this union has
 * three members and not five: `not_applicable` and `disabled` would both be claims about *why*
 * nothing was computed, and the caller that knows the why is the caller that omits the value.
 */
/**
 * Where a suggestion search looked, stated rather than implied.
 *
 * ## Why widening has to be in the contract
 *
 * A citation names a collection, and a search that answers it with records from a different book has
 * answered a different question. So the default scope is the cited collection. But a list that quietly
 * fell back to the whole snapshot when that came up empty reads exactly like a scoped one, and the
 * reader cannot tell — which is the silent downgrade AGENTS.md §16 exists to prevent. So the scope is
 * a field, and `widenedFrom` is what makes the widening legible: "nothing was close within bukhari"
 * is a statement the reader can act on, and it is a different statement from "nothing was close".
 *
 * The collection name is the one the CITATION gave, never a name invented here, and it is printed as
 * it is stored — no normalisation, no aliasing, no second source of truth for a collection's identity
 * (AGENTS.md §17).
 */
export const SuggestionScope = Schema.Union([
  /** Records were ranked from this collection alone. */
  Schema.Struct({ kind: Schema.Literal("collection"), collection: Schema.String }),
  /** The whole snapshot was searched. `widenedFrom` names the collection that came up empty. */
  Schema.Struct({ kind: Schema.Literal("snapshot"), widenedFrom: Schema.NullOr(Schema.String) }),
])
export type SuggestionScope = Schema.Schema.Type<typeof SuggestionScope>

export const SuggestionCandidates = Schema.Struct({
  state: Schema.Literal("candidates"),
  /** Records the search examined. Printed, so a bound is visible rather than silent. */
  considered: Schema.Number,
  scope: SuggestionScope,
  /**
   * Length of the folded quote — the denominator of every `sharedRunChars` on every row below.
   *
   * Carried once on the block because it is one fact about the quote rather than one per record: the
   * same quote cannot have two lengths, and a reader comparing "35 of 60" to "8 of 62" on two rows
   * of one list would be comparing two different questions.
   */
  quoteChars: Schema.Number,
  candidates: Schema.Array(NearbyRecord),
})
export type SuggestionCandidates = Schema.Schema.Type<typeof SuggestionCandidates>

export const SuggestionNoCandidates = Schema.Struct({
  state: Schema.Literal("no_candidates"),
  /** Records the search examined. */
  considered: Schema.Number,
  scope: SuggestionScope,
  reason: Schema.String,
})
export type SuggestionNoCandidates = Schema.Schema.Type<typeof SuggestionNoCandidates>

export const SuggestionUnavailable = Schema.Struct({
  state: Schema.Literal("unavailable"),
  reason: Schema.String,
})
export type SuggestionUnavailable = Schema.Schema.Type<typeof SuggestionUnavailable>

export const Suggestion = Schema.Union([SuggestionCandidates, SuggestionNoCandidates, SuggestionUnavailable])
export type Suggestion = Schema.Schema.Type<typeof Suggestion>

/** The state discriminant, for a caller that switches on it. */
export type SuggestionState = Suggestion["state"]

/**
 * The disclaimer that travels with every rendered suggestion.
 *
 * One owner, one spelling, imported by every surface that prints a candidate — AGENTS.md §17. A
 * disclaimer retyped per surface is a disclaimer that will eventually be retyped wrong, and this
 * one is the load-bearing sentence of the whole feature: it is what stops a list of real records
 * beside a `REJECTED` badge from reading as a correction, a ruling, or an upgrade.
 */
export const SUGGESTION_DISCLAIMER = "nearest suggestions (non-authoritative) — not a verification result"

/**
 * The collections the shared-character floor was measured over.
 *
 * ## Why this list exists rather than prose
 *
 * The sentence below used to be a hand-written string saying the floor "was measured on hadith cases
 * only — quran and tirmidhi are unmeasured". That sentence was true when every anchor in
 * `data/eval/redteam-fabricated.json` was a hadith, and it became **false the moment the red-team set was
 * derived across all six served collections** — a stale over-claim in the one product whose asset is
 * integrity, printed under every suggestion block in the CLI.
 *
 * Declaring the set as a value fixes the part that rots. A named list cannot quietly disagree with
 * itself, and the count in the sentence is read off the list rather than typed beside it, so adding a
 * seventh served collection makes the sentence wrong loudly (one collection short) instead of quietly
 * (still saying "all six"). `SUGGESTION_THIN_COLLECTIONS` being a subset of this list is asserted by a
 * test in `@mizan/core`, so the two declarations cannot drift apart either.
 *
 * ## Why no case COUNT appears in the sentence
 *
 * The counts are the artefact's job — `suggestionCoverageCases<Key>` in `data/benchmark/vs-search.json`,
 * published by `bun run eval:suggestions --record` and judged by `checkPresenceCollectionNamed` — and a
 * number typed into product copy is a number nothing can contradict. So the sentence names the two
 * collections that rest on a minimal sample and points at the file for the counts. A judge who wants the
 * denominator has one command; a judge who is told "four" by a string literal has a wrong figure nobody
 * will ever correct.
 */
export const SUGGESTION_MEASURED_COLLECTIONS = [
  "abudawud",
  "ibnmajah",
  "malik",
  "nasai",
  "quran",
  "tirmidhi",
] as const

/**
 * The measured collections whose sample is too small to call generous.
 *
 * `quran` and `tirmidhi` carry the floor per served collection and no more. Naming them is the honest
 * half of the sentence: a reader who is told the floor was measured over six collections would otherwise
 * reasonably assume every one of them was measured well, and two cases is not "well". Their exact counts
 * live in the artefact for the reason given above.
 */
export const SUGGESTION_THIN_COLLECTIONS = ["quran", "tirmidhi"] as const

/**
 * What the number printed beside each candidate was measured over, and what was not.
 *
 * ## Why this is a second sentence rather than a longer `SUGGESTION_DISCLAIMER`
 *
 * They are two different facts about two different things, and merging them would make one of them
 * false:
 *
 *  - `SUGGESTION_DISCLAIMER` is about AUTHORITY. Nothing here is a verdict, and nothing here can
 *    change the badge above it.
 *  - This is about COVERAGE. The display floor — the number of shared folded characters a row needs
 *    before it is printed — was chosen from `data/eval/redteam-fabricated.json`, and that set is derived
 *    across every served collection.
 *
 * ## The distinction this line exists to keep, stated precisely
 *
 * The SEARCH is not restricted to any collection. The scan reads every served record, so a quranic record
 * can and does appear in the list. What the sentence is about is the MEASUREMENT that chose the floor those
 * rows are filtered by — and that measurement now covers the same six collections the search serves. So the
 * line has changed from naming a gap to naming a thin sample, which is a different claim and needed a
 * different sentence: "measured over all six" without the thinness note would be the over-claiming
 * AGENTS.md §12 warns about, in the one product whose asset is integrity.
 *
 * A reader on other hardware is told the same thing by `docs/specs/measurements.md`: the band is the
 * spread of five runs on the recorded machine, and the right response to a machine that disagrees is to
 * run the harness, not to widen the number.
 */
export const SUGGESTION_MEASUREMENT_SCOPE =
  `the shared-character floor was measured over all ${SUGGESTION_MEASURED_COLLECTIONS.length} served ` +
  `collections (${SUGGESTION_MEASURED_COLLECTIONS.join(", ")}); ${SUGGESTION_THIN_COLLECTIONS.join(" and ")} ` +
  "are in that set on a minimal sample — per-collection case counts are in `data/benchmark/vs-search.json`"

export * as DisplaySchema from "./display.ts"
