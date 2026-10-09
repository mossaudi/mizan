import type { Database } from "bun:sqlite"
import type { Suggestion, Verdict } from "@mizan/core"
import { MAX_TOP_K } from "@mizan/suggest"
import { MAX_SPANS_PER_CHUNK } from "@mizan/verify"
import { suggestionFor, type NearbyText } from "./suggestions.ts"

/**
 * Article-scale closest-in-words suggestions: one pass per NON-VERIFIED span, budgeted, display-only.
 *
 * ## What this reuses, and why nothing was rewritten
 *
 * Three pieces already ship and all three are used unchanged: the pure ranker in `@mizan/suggest`,
 * the `.iterate()` stream scan in `@mizan/corpus`, and the composition plus display contract in
 * `./suggestions.ts`. The article path differs from the per-claim path in exactly two ways — it runs
 * over every non-verified span rather than over rejections only, and it is bounded by an explicit
 * budget — and both differences are here. A second ranker written for articles would be a second
 * definition of "nearest in words" that could disagree with the first.
 *
 * ## The three decisions that are rules, not preferences
 *
 *  1. **Never for a `verified` span.** There is no problem to locate, and a list of records printed
 *     beside a `VERIFIED` badge reads as the reason for the badge. This is also the structural answer
 *     to "an incomplete quote must stay unverifiable": the suggestion block carries no verdict field at
 *     all, so however many shared characters it reports, the badge above it was decided by containment
 *     and is untouched.
 *  2. **Budget exhaustion is `unavailable`, never `no_candidates`.** Those are opposite sentences —
 *     "we looked and found nothing near your quote" versus "we could not look" — and a truncated list
 *     presented as the whole search is the silent downgrade AGENTS.md section 16 forbids. So the spans
 *     past the budget are reported as `unavailable`, naming the budget, while the spans inside it keep
 *     their own states.
 *  3. **No new number.** Every figure on a candidate row is one of the four G-7.12 enumerates —
 *     `rank`, `considered`, `sharedRunChars`, `quoteChars` — because the block is the existing
 *     `Suggestion` contract, reused verbatim. Nothing here computes a closeness figure a reader could
 *     read as agreement.
 */

/**
 * How many spans one chunk may search for.
 *
 * ## It IS `MAX_SPANS_PER_CHUNK`, imported rather than restated
 *
 * The budget has to be the same unit the request budget is, or "we ran out of budget" is a sentence
 * about two different things. It was written here as `= 32` with a comment saying it was the chunk's
 * span count — and the test pinned the literal on both sides, so raising the chunk cap to 64 left this
 * at 32 while the comment still claimed they were the same number. A reader checking the comment would
 * have been told something false by the code.
 *
 * So the equality is now structural rather than asserted in prose: the chunk size has one declaration,
 * in `packages/mizan-verify/src/document-segments.ts`, imported here and at the MCP boundary — which
 * re-exports it so the cap stays visible where it is enforced (AGENTS.md section 17). If the chunk cap
 * moves, this moves with it.
 *
 * A refusal to RAISE it still needs the same evidence as a refusal to raise the citation caps — a
 * measured cost per span. Sprint 1 has no such measurement, so it is not raised.
 */
export const MAX_SPANS_SUGGESTED_PER_CHUNK = MAX_SPANS_PER_CHUNK

/** The number of candidates a span may be offered. The product asks for the whole short list. */
export const CANDIDATES_PER_SPAN = MAX_TOP_K

/**
 * What the pass did for one span.
 *
 * Three states, and the first is the one people forget: `not_attempted` for a span that was never
 * searched. Absence has to be distinguishable from an empty result, or a reader cannot tell "there was
 * nothing near it" from "nothing was looked for".
 */
export type ArticleSuggestionResult =
  | { readonly segmentIndex: number; readonly state: "not_attempted"; readonly reason: string }
  | { readonly segmentIndex: number; readonly state: "searched"; readonly suggestion: Suggestion; readonly texts: readonly NearbyText[] }
  | { readonly segmentIndex: number; readonly state: "unavailable"; readonly reason: string }

/** One span the caller wants searched, and what its verdict was. */
export type ArticleSuggestionTarget = {
  readonly segmentIndex: number
  readonly quote: string
  readonly verdict: Verdict
}

/** Why a span was not searched, in the words a reader needs. */
const VERIFIED_REASON = "the span is already verified, so there is nothing to locate"

/**
 * Why a span past the budget is `unavailable`. Names the budget, because a bound that is invisible is
 * a bound a reader cannot weigh against the span they care about.
 */
const budgetReason = (budget: number): string =>
  `the per-chunk budget of ${budget} spans was already spent, so this span was not searched`

/**
 * One pass per non-verified span, in order, up to the budget.
 *
 * ## Why the budget is spent in segment order and not by nearness
 *
 * Because nothing here knows nearness yet — that is the search's job, and it has not run. Spending the
 * budget by a guess about which spans matter most would make the set of searched spans depend on a
 * relation computed by the module being bounded, which is the recursion the article path refuses.
 * Segment order is the document's own order, so which spans got searched is a property of the document
 * and not of the corpus.
 *
 * Position in the returned array matches `targets`, so a caller cannot pair a suggestion with the
 * wrong span — the same discipline `suggestionsFor` uses for claims.
 */
export const articleSuggestionsFor = (
  db: Database,
  targets: readonly ArticleSuggestionTarget[],
  budget: number = MAX_SPANS_SUGGESTED_PER_CHUNK,
): readonly ArticleSuggestionResult[] => {
  let spent = 0
  return targets.map((target) => {
    if (target.verdict === "verified") {
      return { segmentIndex: target.segmentIndex, state: "not_attempted" as const, reason: VERIFIED_REASON }
    }
    if (spent >= budget) {
      return { segmentIndex: target.segmentIndex, state: "unavailable" as const, reason: budgetReason(budget) }
    }
    spent += 1
    return passFor(db, target)
  })
}

/**
 * One span's pass, with an unexpected failure degraded to `unavailable`.
 *
 * Same reasoning as `passForClaim` in `./suggestions.ts`: a throw from a database layer would end a run
 * whose verdicts were already computed, and that is the worst ratio of harm to cause available — the
 * suggestion block is the least load-bearing output in the program. The message is reduced to the
 * error's own NAME, never its payload, because a decode detail can quote a corpus row and corpus text
 * belongs in no output of this program (AGENTS.md section 13).
 */
const passFor = (db: Database, target: ArticleSuggestionTarget): ArticleSuggestionResult => {
  try {
    const block = suggestionFor(db, target.quote, null)
    if (block === null) {
      return {
        segmentIndex: target.segmentIndex,
        state: "unavailable" as const,
        reason: "there is no quoted span to search with, so no candidate list was produced",
      }
    }
    return { segmentIndex: target.segmentIndex, state: "searched" as const, suggestion: block.suggestion, texts: block.texts }
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : "unknown failure"
    return {
      segmentIndex: target.segmentIndex,
      state: "unavailable" as const,
      reason: `the suggestion pass failed unexpectedly (${name})`,
    }
  }
}

/**
 * The summary line for a span, and the word a reader branches on.
 *
 * Exported so the renderer prints the state's own word rather than a per-surface paraphrase — the same
 * one-owner rule `SUGGESTION_DISCLAIMER` follows, and the same reason a surface comparing two reports
 * must not be given two names for one state.
 */
export const articleSuggestionWord = (result: ArticleSuggestionResult): string => {
  if (result.state === "not_attempted") return "not attempted"
  if (result.state === "unavailable") return "unavailable"
  if (result.suggestion.state === "candidates") return `${result.suggestion.candidates.length} candidates`
  return result.suggestion.state
}

export * as ArticleSuggestions from "./article-suggestions.ts"
