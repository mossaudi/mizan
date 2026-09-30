import type { Relevance, RelevanceState } from "@mizan/core"
import { normalizeForMatch } from "@mizan/core"

/**
 * ST4 — relevance. A quotation can be genuinely contained in the record it cites and still not
 * answer the question that was asked.
 *
 * ## The defect this is for
 *
 * R-3, and it is the one place this product can be *spiritually* wrong while being technically
 * right. Every mechanism in the repository answers one question: **is this quote in that record?**
 * It answers that question correctly. A model that retrieves a real hadith and then quotes it beside
 * a question it does not address passes every check here, and a reader who trusts a green badge
 * would conclude the system said something true. The badge is true. The answer is not.
 *
 * So relevance is a **second, separate** statement, made next to the first, never folded into it.
 *
 * ## What relevance is NOT allowed to do
 *
 *  - **It may not touch a badge.** This module is on G-7's display path and gate **G-7.7** forbids
 *    it from naming a verdict in code or in strings, so relevance *cannot* grant, withhold or
 *    alter one. That is a stronger property than review: the word is simply not available here.
 *  - **It is not a score.** The relation is a set relation over folded forms — does this question's
 *    term occur in that answer's canonical text. There is no ratio, no cut-off, no ordering and no
 *    learned model, and `Relevance` in `@mizan/core` has no number in it to divide.
 *  - **It never uses the network, a clock, or a provider.** Three reasons, all decidable: a
 *    relevance figure a model produced could not be reproduced, it would put a model on the path to
 *    a decision, and a 100ms budget is not a budget you can keep a network call inside.
 *
 * ## Why the third state exists and is not collapsible
 *
 * `undetermined` is what the checker returns whenever it cannot decide, and it is the state this
 * design leans on hardest. Collapsing it into `answers` would be the fail-open default AGENTS.md §3
 * forbids; collapsing it into `doesNotAnswer` would be a different lie, accusing a correct answer.
 * It is rendered in its own words, always, and it is what a negated question produces — see
 * `NEGATIONS` below, which is the sharpest limitation in this module and is deliberate.
 */

/**
 * Question words that carry no retrievable content.
 *
 * A short, declared list, in both languages the demo and the CLI are used in. It is data rather
 * than logic so that a reviewer can see exactly which words are being ignored, and it is a list
 * rather than a rule because any rule that decides "is this word contentful" is a language model
 * wearing a regular expression's clothes.
 */
export const QUESTION_STOPWORDS = [
  // Arabic interrogatives, proclitics and conjunctions that appear in a question and name nothing.
  "ما", "ماذا", "من", "كيف", "متى", "اين", "اينما", "لماذا", "هل", "فهل", "التي", "الذي", "الذين", "هذا", "هذه", "ذلك", "التي",
  "هل", "و", "او", "ثم", "قد", "كان", "كانت", "يكون", "ان", "انه", "انها", "في", "من", "على", "الى", "عن", "مع", "كل", "بعض",
  // Question scaffolding of this product's own domain: nearly every question asked here is
  // "what did the Prophet say about X", so "said / the Prophet" name the frame, not the
  // content. Without this, `answers` is unreachable on natural questions and the checker
  // can only ever refuse — a second statement that can never affirm is decoration.
  // Trade-off, stated: a question whose ONLY content is one of these words (e.g. "who is
  // the Prophet?") loses a term. That question still reaches `undetermined`, never `answers`.
  "قال", "قاله", "النبي",
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "is", "are", "was", "were", "be", "been", "do", "does", "did", "what", "which", "who", "whom", "whose", "how", "when", "where", "why", "it", "its", "that", "this", "these", "those", "and", "or", "if",
] as const

const STOPWORDS: ReadonlySet<string> = new Set(QUESTION_STOPWORDS)

/**
 * Negation. A question containing one is `undetermined`, always.
 *
 * This is the module's most important limitation and it is handled by refusing rather than by
 * guessing. "Is it not permissible to lie?" and "Is it permissible to lie?" share every content
 * term, and a checker that reads terms cannot tell them apart — so answering either `answers` or
 * `doesNotAnswer` would be a claim about meaning made by a function that has none. `undetermined`
 * is the only honest state, and it is the fail-closed one.
 *
 * Stated as a limitation rather than a bug: reading negation requires either a model or a
 * hand-written per-language negation model, and the second is a worse answer than no answer.
 */
export const NEGATIONS = [
  "لا", "لم", "لن", "ليس", "لست", "غير", "بدون", "الا",
  "not", "no", "never", "cannot", "without", "isnt", "doesnt", "dont", "didnt", "wont", "aint",
] as const

const NEGATION_TERMS: ReadonlySet<string> = new Set(NEGATIONS)

/**
 * Strip edge punctuation from a folded term.
 *
 * The verifier's fold table deliberately has NO punctuation stage — for containment,
 * punctuation is part of the quotation. But this module splits a question into terms,
 * and a term like `العلم؟` (with the Arabic question mark glued on) would never occur
 * in an answer's folded text, so every natural question ending in ؟ would miss its own
 * last term. Stripping edges here is local to relevance and invisible to the verifier.
 */
const stripEdgePunctuation = (term: string): string =>
  term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")

/** Folded answer characters the checker reads. Bounded so a long claim cannot cost a report. */
export const MAX_ANSWER_CHARS = 4_096

/**
 * The question's content terms, in the question's own order, deduplicated.
 *
 * Split on the folded form's single spaces, which is what `normalizeForMatch`'s
 * `collapse-whitespace` stage guarantees. Deduplicated by first occurrence so two runs over the
 * same question produce byte-identical output regardless of set iteration order — the same
 * determinism requirement the gates' report order has.
 */
export const contentTerms = (question: string): readonly string[] => {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of normalizeForMatch(question).split(" ")) {
    const term = stripEdgePunctuation(raw)
    if (term.length === 0) continue
    if (STOPWORDS.has(term)) continue
    if (seen.has(term)) continue
    seen.add(term)
    terms.push(term)
  }
  return terms
}

/** Whether the question contains a negation term, in any of the folded forms negation takes. */
export const questionIsNegated = (question: string): boolean =>
  normalizeForMatch(question).split(" ").some((raw) => NEGATION_TERMS.has(stripEdgePunctuation(raw)))

/**
 * Assess whether an answer addresses a question.
 *
 * Pure, total, and bounded. The three branches are set relations and nothing else:
 *
 *  - every content term located → `answers`
 *  - no content term located → `doesNotAnswer`
 *  - some but not all → `undetermined`
 *
 * The middle branch is the one that surprises readers, and it is the point: a partial lexical
 * overlap is not evidence either way, and the checker that reports it as `answers` is the checker
 * that made a false `verified` in spirit in the first place.
 */
export const assessRelevance = (question: string, answer: string): Relevance => {
  const foldedAnswer = normalizeForMatch(answer).slice(0, MAX_ANSWER_CHARS)
  if (foldedAnswer.length === 0) {
    return { state: "undetermined", located: [], missing: [], reason: "the answer folds to no text, so nothing can be located in it" }
  }
  if (questionIsNegated(question)) {
    return { state: "undetermined", located: [], missing: [], reason: "the question is negated and this checker reads no negation" }
  }

  const terms = contentTerms(question)
  if (terms.length === 0) {
    return { state: "undetermined", located: [], missing: [], reason: "the question names no content term this checker can look for" }
  }

  const located = terms.filter((term) => foldedAnswer.includes(term))
  const missing = terms.filter((term) => !foldedAnswer.includes(term))
  const state: RelevanceState = missing.length === 0 ? "answers" : located.length === 0 ? "doesNotAnswer" : "undetermined"
  return { state, located, missing, reason: reasonFor(state) }
}

/**
 * Why this state, in one sentence, with **no counts**.
 *
 * The `located` and `missing` lists are already on the record, so writing "3 of 7" here would add
 * nothing except an invitation to divide one by the other — which is a score, and the one thing
 * this module exists not to produce. The lists are the evidence; the sentence names the conclusion.
 */
const reasonFor = (state: RelevanceState): string => {
  if (state === "answers") return "every content term of the question occurs in this answer"
  if (state === "doesNotAnswer") return "no content term of the question occurs in this answer"
  return "some content terms occur and some do not; a partial overlap decides nothing here"
}

/**
 * The single word a report prints, and the only shape of it.
 *
 * Exported so the renderer cannot invent a phrasing, and so `answers` is the one state a caller can
 * reach by accident: everything else is a refusal of some kind.
 */
export const relevanceLabel = (relevance: Relevance): RelevanceState => relevance.state

/**
 * Whether a report may present the answer as responsive.
 *
 * Fail closed by construction: only `answers` is affirmative, so a checker that was never run —
 * and therefore produced no `answers` — cannot be read as a pass. This is the whole of the
 * "relevance checker unavailable" case: there is no unavailable state to handle, because the
 * absence of an affirmative result IS the refusal.
 */
export const isResponsive = (relevance: Relevance): boolean => relevanceLabel(relevance) === "answers"

export * as Relevance_ from "./relevance.ts"
