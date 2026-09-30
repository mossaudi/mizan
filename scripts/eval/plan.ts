import type { Verdict, VerdictReason } from "@mizan/core"
import type { Mutation } from "./mutations.ts"

/**
 * The case classes, and the EXPECTED verdict of each.
 *
 * ## This file is where the sets are adjudicated, and it never imports the verifier
 *
 * Every `expectedVerdict` below is a literal derived from the documented behaviour of the
 * fold table in `packages/mizan-core/src/normalize/fold-table.ts`. None of them was produced
 * by running `verifyAnswer` and recording what came out — that would be a set that agrees with
 * whatever the code does today, which is a regression test of the code against itself and
 * worthless as evidence. The architecture requires that machine-generated expected verdicts be
 * rejected and re-adjudicated; this table is the re-adjudication, and `eval.test.ts` asserts
 * that the generator cannot import `@mizan/verify` even if someone tries to make it.
 *
 * The derivation for each class is the one-line `rationale`, so a judge can check the
 * expectation against the fold table without running anything.
 *
 * ## A divergence the team lead decided, recorded, then mechanised away
 *
 * The user story said a faithful paraphrase must be `unverifiable` and "never rejected, because a
 * paraphrase is not a lie". The six-step procedure could not honour that: step 5 sends a resolved
 * identifier whose record lacks the quote to `rejected`, and separating a paraphrase from a
 * fabrication appeared to need exactly the similarity measurement ADR-03 forbids.
 *
 * This table followed the PROCEDURE, and the disagreement was published as `KNOWN_DIVERGENCE`
 * rather than quietly resolved — a record this file no longer carries, because the gap is closed.
 * Step 5b's anchor arm separates the two without measuring anything: a claim whose anchor is a
 * contiguous substring of the cited record is one a human marked as real source text, so it is
 * `unverifiable` (evidence incomplete), while a claim whose anchor is absent is `rejected`. Hence
 * `elide_middle` is now `unverifiable`, and the 26 cases that carried the stamp match their
 * adjudicated verdict. `schemaVersion` 2 records the change; `anchor-texts.ts` holds the spans.
 */
export type CaseClass = {
  readonly id: string
  readonly mutation: Mutation
  readonly expectedVerdict: Verdict
  readonly expectedReason: VerdictReason
  /** Why the fold table makes this the right answer. One line, no jargon. */
  readonly rationale: string
  /** How many cases of this class the golden set carries. */
  readonly goldenCount: number
  /** How many the red-team set carries. The red-team set is fabrications only. */
  readonly redTeamCount: number
}

/** How the "not in the corpus" classes decide, which is the whole CWE-345 claim. */
const ABSENT = "The fold removes diacritics, tatweel and digit-form noise; it never rewrites, adds or removes a letter. A quote differing from the source in any letter is therefore not a substring of it."

/** A fabricated hadith, cited to a collection and number that do not exist. Cannot prove a negative. */
const UNRESOLVED_RATIONALE = "The cited number does not exist in that collection, so there is no record to compare against and nothing may be accused."

/** Number 1 exists in several collections; naming none of them is not a citation. */
const AMBIGUOUS_RATIONALE =
  "The number exists in more than one collection and the answer named none, so resolving it would be a guess. Guessing here is how a correct answer gets falsely accused of misquoting."

export const CASE_CLASSES: readonly CaseClass[] = [
  {
    id: "verbatim",
    mutation: "verbatim",
    expectedVerdict: "verified",
    expectedReason: "exact_containment",
    rationale: "The quote is a literal span of the cited record, so it is contained in it by definition.",
    goldenCount: 30,
    redTeamCount: 0,
  },
  {
    id: "undiacriticized",
    mutation: "undiacriticized",
    expectedVerdict: "verified",
    expectedReason: "exact_containment",
    rationale: "Stage 6 of the fold strips every combining mark, so the bare letter skeleton is the span's own fold key.",
    goldenCount: 30,
    redTeamCount: 0,
  },
  {
    id: "tatweel_spacing",
    mutation: "tatweel_spacing",
    expectedVerdict: "verified",
    expectedReason: "exact_containment",
    rationale: "Stages 5 and 8 remove tatweel and collapse whitespace runs, so elongation and doubled spaces fold away.",
    goldenCount: 30,
    redTeamCount: 0,
  },
  {
    id: "arabic_indic_digits",
    mutation: "arabic_indic_digits",
    expectedVerdict: "verified",
    expectedReason: "exact_containment",
    rationale: "Stage 3 folds Arabic-Indic digits to ASCII, so ٤ and 4 are the same character to the containment key.",
    // 4, not 6: the corpus contains only 19 ASCII digit occurrences in total, in 4 records,
    // and only 2 of those records yield a clean digit-bearing span. Six cases would have meant
    // three near-identical windows of one narrator's footnote markers. Recorded here so the
    // small number reads as a corpus constraint rather than a coverage gap. See DIGIT_FACTS.
    goldenCount: 4,
    redTeamCount: 0,
  },
  {
    id: "elide_middle",
    mutation: "elide_middle",
    expectedVerdict: "unverifiable",
    expectedReason: "no_matching_evidence",
    rationale: `An elided span drops words and inserts an ellipsis, which no fold stage removes, so it is not a substring and containment cannot confirm it. ${ABSENT} What remains is nevertheless the source's own wording rather than an assertion the source does not make, so accusing the citation of misquotation would be wrong: the honest verdict is that the evidence is incomplete.`,
    goldenCount: 26,
    redTeamCount: 0,
  },
  {
    id: "one_word_changed",
    mutation: "one_word_changed",
    expectedVerdict: "rejected",
    expectedReason: "quote_absent_at_cited_id",
    rationale: `The hardest case in either set: one word of twelve differs, and the other eleven are verbatim. ${ABSENT}`,
    goldenCount: 30,
    redTeamCount: 12,
  },
  {
    id: "two_word_changed",
    mutation: "two_word_changed",
    expectedVerdict: "rejected",
    expectedReason: "quote_absent_at_cited_id",
    rationale: ABSENT,
    goldenCount: 0,
    redTeamCount: 8,
  },
  {
    id: "letter_transposed",
    mutation: "letter_transposed",
    expectedVerdict: "rejected",
    expectedReason: "quote_absent_at_cited_id",
    rationale: "Swapping two adjacent letters reorders the string. An edit-distance metric would call that one edit; containment calls it a different string.",
    goldenCount: 0,
    redTeamCount: 8,
  },
  {
    id: "digit_substituted",
    mutation: "digit_substituted",
    expectedVerdict: "rejected",
    expectedReason: "quote_absent_at_cited_id",
    rationale: "Stage 3 folds the two DIGIT FORMS together but never changes a digit's value, so 3 is not 4.",
    goldenCount: 0,
    redTeamCount: 4,
  },
  {
    id: "word_inserted",
    mutation: "word_inserted",
    expectedVerdict: "rejected",
    expectedReason: "quote_absent_at_cited_id",
    rationale: "An inserted word lengthens the span, and containment is exact and contiguous.",
    goldenCount: 0,
    redTeamCount: 8,
  },
  {
    id: "injection_appended",
    mutation: "injection_appended",
    expectedVerdict: "rejected",
    expectedReason: "quote_absent_at_cited_id",
    rationale: "A real span with an English instruction appended. The span before the comma is genuine and the whole string is not, which is the corpus-poisoning shape (R17).",
    goldenCount: 10,
    redTeamCount: 0,
  },
  /*
   * The two citation-shape classes. They live in this table, with the same declared verdicts as
   * everything else, because "hand-adjudicated in plan.ts" has to be true of EVERY expectation
   * in the artefact — not just the ones about text. An earlier version declared these two inline
   * in the builder, which quietly meant the builder, not the table, was the adjudicator for 40
   * of the 200 cases.
   *
   * They mutate the CITATION rather than the quote, so the `mutation` field records how the
   * quote was produced: verbatim for the unresolved class (the text is right, the pointer is
   * wrong) and elided for the ambiguous class.
   */
  {
    id: "unresolved_identifier",
    mutation: "verbatim",
    expectedVerdict: "unverifiable",
    expectedReason: "identifier_unresolved",
    rationale: UNRESOLVED_RATIONALE,
    goldenCount: 20,
    redTeamCount: 0,
  },
  {
    id: "ambiguous_collection",
    mutation: "elide_middle",
    expectedVerdict: "unverifiable",
    expectedReason: "collection_ambiguous",
    rationale: AMBIGUOUS_RATIONALE,
    goldenCount: 20,
    redTeamCount: 0,
  },
] as const

/** The target total the architecture names for the golden set. The generator fails closed on any other size. */
export const GOLDEN_TARGET = 200

/**
 * Why the digit classes are small, as measured rather than guessed.
 *
 * The corpus carries 19 ASCII digit occurrences, spread over 4 records, and no Arabic-Indic
 * digits at all. Of those 4 records only 2 yield a clean span containing a digit — in the
 * other two every digit sits inside a quotation mark or a colon, and spans containing either
 * are rejected by the cleanliness rules. That leaves 6 usable digit spans, which is why the
 * two digit classes are 4 and 4 rather than something rounder. The generator asserts this
 * and fails closed if a future ingest changes the arithmetic.
 */
export const DIGIT_FACTS = {
  asciiDigitOccurrences: 19,
  recordsContainingDigits: 4,
  recordsYieldingACleanDigitSpan: 2,
  usableDigitSpans: 6,
  arabicIndicDigitsInCorpus: 0,
} as const

/** How many cases of each class one set must contain. The only place that number is written down. */
export const expectedCounts = (name: "golden" | "redteam"): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const klass of CASE_CLASSES) counts[klass.id] = name === "golden" ? klass.goldenCount : klass.redTeamCount
  return counts
}

/** The declared total, so a table edit that no longer sums to the target is caught at build time rather than in CI. */
export const goldenTotal = (): number => CASE_CLASSES.reduce((total, klass) => total + klass.goldenCount, 0)

/**
 * `KNOWN_DIVERGENCE` used to be declared here.
 *
 * It carried the MIZ-105 ruling that a faithful re-rendering is `unverifiable` rather than
 * `rejected`, stamped onto the 26 golden `elide_middle` cases, alongside the observation that the
 * procedure still returned `rejected`. MIZ-106's anchor arm closed that gap without measuring
 * anything, `elide_middle` now declares `unverifiable` directly, and the stamp had nothing left to
 * say — a field that is always `null` is 26 lines teaching a reader to ignore a field.
 *
 * The ruling itself is untouched: it lives in `scripts/eval/adjudication.ts` and in
 * `data/eval/adjudication.json`. The type survives as an optional `EvalSet.knownDivergence`, so a
 * set written while the gap was open still decodes. What the arm now does to the 40 fabrications is
 * published as `redTeamMovement`, which is a measurement of the procedure rather than a
 * disagreement with the story.
 */

export * as Plan from "./plan.ts"
