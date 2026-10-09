import { ARTICLE_RED_TEAM_FIXTURES } from "@mizan/verify"

/**
 * The article fixtures, as one shared harness.
 *
 * ## Why these live in a module and not in either test
 *
 * Two suites need the same documents and they must not disagree about them: the determinism harness,
 * which asserts the same input yields the same bytes ten times, and the red-team harness, which
 * asserts a fabricated span is never verified. A fixture copied into two tests is two fixtures, and
 * the day they differ one suite is measuring a document the other no longer runs.
 *
 * ## Why the corpus is absent
 *
 * These documents are corpus-FREE on purpose. `data/corpus.db` is gitignored, so a harness that
 * needed it would pass on the machine that built it and fail on every clean clone — which is exactly
 * the failure `bun run accept:customer` exists to prevent. The corpus-backed half of the same
 * assertions lives in `scripts/article-determinism.corpus.test.ts`, in the opt-in lane.
 */

/**
 * One red-team fixture's document, by id, failing closed if it is not there.
 *
 * ## Why a throw, and why here
 *
 * `ARTICLE_RED_TEAM_FIXTURES.find(…)?.document ?? ""` is the shape this replaces: a renamed fixture
 * would hand the harness an EMPTY document, an empty document segments to zero segments, and the two
 * suites built on it would then compare reports about a document nobody wrote — quietly, and with
 * counts that still add up. The `?? ""` is fail-open on a guard, which is the one place it must not be.
 *
 * A `throw` is the right tool here because this module is test support: AGENTS.md section 2 allows one
 * to escape a test helper and nowhere else, and this is the helper rather than the product. The
 * message names the id and the ids that do exist, so the failure is the rename rather than a hunt.
 */
export const fixtureDocumentOf = (id: string): string => {
  const fixture = ARTICLE_RED_TEAM_FIXTURES.find((entry) => entry.id === id)
  if (fixture === undefined) {
    throw new Error(
      `no article red-team fixture is called ${id}; ARTICLE_RED_TEAM_FIXTURES holds ` +
        ARTICLE_RED_TEAM_FIXTURES.map((entry) => entry.id).join(", "),
    )
  }
  return fixture.document
}

/** The corpus-free corpus: documents whose spans resolve to nothing, which is the honest Sprint 1 state. */
export const HARNESS_DOCUMENTS: readonly { readonly id: string; readonly document: string }[] = [
  {
    id: "clean-quote",
    document: [
      'The Prophet said, "faith is the belief of the heart" and the narration continues.',
      "This second sentence makes no quotation at all, so it must appear as a named gap.",
      "Indeed الله لا إله إلا هو.",
    ].join(" "),
  },
  {
    id: "adversarial-injection",
    document: fixtureDocumentOf("ART-001"),
  },
  {
    id: "plausible-fabrication",
    document: fixtureDocumentOf("ART-002"),
  },
  {
    id: "no-quotation-like-span",
    document: ["A plain opening sentence.", "A plain closing sentence."].join(" "),
  },
]

/** The one digest a report is compared by when the corpus is absent: the harness, not the corpus. */
export const HARNESS_FINGERPRINT = "article-harness:corpus-free:no-provider:v1"

/**
 * A path spelled the way `ci-lanes.ts` spells it, whatever separator the platform uses.
 *
 * Re-exported from the lane table rather than declared again, because the lane table is keyed in
 * POSIX spelling and a second copy of this one-liner is how a Windows test ends up looking for a lane
 * entry that cannot exist and reporting the corpus lane as undeclared (AGENTS.md section 17).
 */
export { posix } from "./ci-lanes.ts"

export * as Harness from "./article-harness.ts"
