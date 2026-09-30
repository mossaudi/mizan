import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * Story 5 — a public surface may name an absent collection only to renounce it.
 *
 * ## The defect
 *
 * `ADR-C4` records that Bukhari and Muslim are not in the corpus. The cheapest way to undo that
 * record is a sentence that lists the collections we *do* hold and quietly adds one we do not: a
 * deck bullet, a README line, a slide a judge reads once. The claim is small, the cost of a judge
 * finding it is not, and nobody re-reads the surfaces at the moment someone edits one. So the
 * absence is machine-checked on every surface a judge can reach, and a covering claim fails the
 * build rather than waiting to be spotted.
 *
 * ## Why the check is per line rather than per document
 *
 * A document-level rule — "somewhere in this file an absence is stated" — is satisfied by one
 * renunciation anywhere and leaves the covering claim free to sit three paragraphs later. The line
 * is the unit a judge actually reads on a slide or a README, so the renunciation has to travel
 * with the name. The cost is that a hard-wrapped sentence must keep its negation on the same line,
 * which is a copy-editing constraint rather than a semantic one, and the finding says exactly that.
 *
 * ## Why the surface set is not the whole tree sweep
 *
 * The gate-count sweep reads every `.ts` in the repository, and the test fixtures there cite
 * `bukhari:1` by the hundred to prove the resolver picks the right row. Running this rule over that
 * sweep would report a few hundred true facts as defects, and a rule that is wrong that often is a
 * rule somebody disables. A public surface is a small, deliberate set: the documents the audit
 * reads, plus `docs/` and `submission/`, which is where the decks live.
 */

/** The trees that are public surfaces in their own right: the docs a judge opens and the decks they watch. */
export const CORPUS_SURFACE_ROOTS = ["docs", "submission"] as const

/**
 * The extensions read inside those roots. `.py` is here and deliberately not in the gate sweep's
 * extension list: the sweep exists for numeric and gate-count claims and was scoped before the
 * decks mattered, while a corpus-scope claim lives in `make_deck.py` more often than anywhere else.
 */
export const CORPUS_SURFACE_EXTENSIONS = [".md", ".py"] as const

/**
 * A line that names a collection the attested corpus does not hold.
 *
 * The lookbehind guards the bare Arabic form only: `المسلمين` contains `مسلم` inside a word that
 * means something else entirely, and a rule that reported a sentence about the Muslims as a
 * coverage claim would be switched off within a week. `بخاري` carries no guard because it appears
 * only in a Bukhari context, with or without the definite article.
 */
export const ABSENT_COLLECTION = /bukhari|muslim|بخاري|(?<![\u0600-\u06FF])مسلم/i

/**
 * What a line that names an absent collection must also carry.
 *
 * Both languages, because both decks are public surfaces. The Arabic entries are words that only
 * appear in a renunciation rather than the general negation particles: `لا` and `غير` sit inside
 * ordinary vocabulary, and a marker that matches too much is a marker that certifies a claim it has
 * not read — the fail-open shape this repository forbids (AGENTS.md §3).
 */
export const RENOUNCED =
  /\b(?:no|not|never|none|absent|missing|without|unless|yet|deferred?|planned?|lacks?|gaps?|unavailable|declined|excluded|not held|not ingested|isn't|aren't|don't|doesn't|haven't)\b|out of scope|غائب|منقوص|ناقص|لا ندّعي|لا نملك|لم يُضمَّن|لا يُعوَّض/i

/**
 * R15: a public surface that names Bukhari or Muslim says on the same line that we do not hold
 * them.
 *
 * Findings carry the line number because "a document somewhere claims coverage" is not a sentence
 * anyone can act on, and the fix is named rather than implied.
 */
export const checkCorpusAbsenceUnstated = (document: string, file: string): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const [index, line] of document.split("\n").entries()) {
    if (!ABSENT_COLLECTION.test(line)) continue
    if (RENOUNCED.test(line)) continue
    claims.push(claim("corpus-absence-unstated", file, `line ${index + 1} names an absent collection without stating the absence on that line; move the negation next to the name`))
  }
  return claims
}

export * as DocsCorpus from "./docs-corpus.ts"
