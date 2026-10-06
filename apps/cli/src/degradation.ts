import { conditionOf, describeCondition, type DegradationCondition } from "@mizan/core"

/**
 * The CLI's own vocabulary, projected onto the shared one.
 *
 * ## Why the CLI needed its own module rather than a table inside `main.ts`
 *
 * `apps/cli` reports its degradation states three ways at once: an exit code a shell can branch on,
 * a line on stderr, and — since the missing-corpus and unattested-corpus paths are the ones an
 * integrator hits first — the sentence the reader actually reads. Those were three hand-maintained
 * answers to "what went wrong", in a file with seven exit paths, and the vocabulary a customer
 * compares across surfaces lived in `@mizan/core` with no import edge from here at all.
 *
 * So the states are named here once, and the names go through `conditionOf` — the single seam through
 * which a degradation name enters the vocabulary. A name that is not in the shared set is a
 * `DecodeFailure` at the call site rather than a word the rest of the repository has never heard of.
 *
 * ## Why these three and not more
 *
 * These are the CLI's states that mean *the pipeline could not be entered at all*: no corpus, a
 * corpus that cannot be opened, and an attestation that does not match. The states *inside* a
 * completed run — no sources found, model unavailable, unverifiable — are already reported by the
 * components that detect them, each through this same vocabulary, and re-naming them here would give
 * two homes to one fact (AGENTS.md section 17).
 *
 * ## Why the sentence comes from `describeCondition`
 *
 * Because the wording is the claim. Two surfaces that spell the same absence differently in the part
 * a user reads is the defect `docs/degradation-matrix.md` exists to prevent, and a sentence held in
 * both packages is two sentences that will drift.
 */

/** The CLI's own name for each state that means the pipeline could not be entered. */
export type CliCorpusState = "corpus_absent" | "corpus_unusable" | "attestation_unreadable" | "attestation_mismatch"

/**
 * A refusal, as the CLI reports it: the state it is in and the sentence about this run.
 *
 * Two fields because the state decides which shared sentence is printed and the detail says what
 * happened *here* — a path, a digest. A single string would make the distinction unrepresentable,
 * which is exactly how "the attestation cannot be read" came to be printed as "the attestation
 * disagrees".
 */
export type CliRefusal = {
  readonly condition: CliCorpusState
  readonly detail: string
}

/**
 * The shared condition for a CLI state.
 *
 * `null` for a name the shared vocabulary does not contain, and `test/clean-clone.test.ts` asserts
 * every state projects — so a state added here without a matching literal is caught by a test rather
 * than by a customer.
 */
export const conditionOfCliState = (state: CliCorpusState): DegradationCondition | null => {
  const decoded = conditionOf(state)
  return decoded.ok ? decoded.value : null
}

/**
 * The line the CLI prints for a state it cannot run.
 *
 * The shared sentence, then the local fact. Ordered that way because the condition is what a reader
 * (or a log scraper) matches on, and the path or digest that follows is what the operator acts on.
 * A sentence held here would be a third copy of the wording; this function only chooses the order.
 */
export const describeCliState = (state: CliCorpusState, detail: string): string => {
  const condition = conditionOfCliState(state)
  if (condition === null) return `${state}: ${detail}`
  return `${describeCondition(condition)} (${detail})`
}

export * as CliDegradation from "./degradation.ts"
