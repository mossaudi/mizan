import { claim, type DocsClaim } from "./docs-claims.ts"
import type { SourceFile } from "./scan.ts"

/**
 * D-1, rule seven — a document must not deny, or under-state, the model egress the product source
 * actually builds.
 *
 * ## The defect class
 *
 * Two of the three defects this rule exists for are in the file the quick start tells a judge to
 * copy, and both cut the dangerous way: a reader who believed them would conclude that no question
 * ever leaves the machine, which is false the moment `MIZAN_LLM_API_KEY` is set.
 *
 * 1. **"There is no live model provider… A provider is a seam, not an integration."** False, and
 *    `DISCLOSURE.md` §4 says the opposite in detail. `apps/cli/src/provider-config.ts` builds a real
 *    `fetch` POST to an allowlisted `api.openai.com` and `hosted` is the default mode.
 * 2. **"With no provider configured the CLI prints the honest degradation `model unavailable` rather
 *    than falling back to a mock."** Also false. `provider-config.ts` resolves a *keyless* `hosted`
 *    run to the committed transcript, so the route the file denies is the route a fresh checkout
 *    actually takes.
 *
 * Neither was visible to R1..R5, because the comparison needs the product source.
 *
 * ## What it compares
 *
 * Every `fetch(` outside the corpus package counts as a live egress site. That is structural and
 * structural in the fail-closed direction: renaming `hostedProvider`, or adding a second provider
 * site, cannot switch the rule off, and a corpus client that moved out of its package is *reported*
 * rather than missed. The product source reaches the rule only after `productionFiles`, so the gate
 * package's own fixtures cannot satisfy it.
 *
 * ## Five denial kinds, and the fifth is the one most likely to be written next
 *
 * The first four — provider, egress, seam, degradation — are each pinned to the exact wording of a
 * real defect, which meant the rule recognised those four sentences and nothing else. A rule like
 * that is a transcription of its own history, and a judge-facing disclosure does not arrive in the
 * four wordings that were caught.
 *
 * `no_egress` is the fifth kind, and it covers the claim that is worse than any of the other four:
 * a **categorical** no-egress statement. "mizan runs fully offline", "no outbound network access",
 * "mizan never contacts OpenAI" and "egress is zero" are not under-statements of an egress, they are
 * assertions that none exists — and they are the phrasings an author reaches for precisely because
 * they read as reassuring. Each is caught by a shape rather than by a sentence, so a rewording is
 * still caught.
 *
 * ## A limitation, stated rather than discovered
 *
 * The denial patterns read one line at a time and will not join a line break to find their noun.
 * That is deliberate, not an oversight: "asserts that no IP-rotation, router-restart or\n
 * provider-limit-evasion identifier exists" is one sentence containing a negation and the word
 * *provider* in unrelated positions, and a rule that joined them would fail a correct document in
 * this repository today. The cost is that a denial split across a line break is missed. Every pattern
 * here is short enough that a writer rarely breaks them, and the README wraps at a width that would
 * split "no live model provider" only at a space the author chose.
 */

/** A categorical denial: a negation within one clause of the noun it denies. */
const PROVIDER_DENIAL = /\b(?:no|not|never|without)\b[^.\n]{0,40}\b(?:live |hosted |openai )?(?:model|llm|api)?\s*provider\b/i

/** A provider described as a placeholder rather than as something that talks to a model. */
const PROVIDER_IS_A_PLACEHOLDER =
  /\bprovider\b[^.\n]{0,24}\b(?:is|as|remains|looks like)\s+(?:just\s+)?(?:an?\s+)?(?:seam|stub|placeholder|interface|abstraction|shim)\b|\bseam,? not an integration\b/i

/** The harmful inference in its purest form: no egress at all, rather than an undisclosed one. */
const NOTHING_LEAVES = /\bnothing\b[^.\n]{0,30}\b(?:leaves|exits|leaks?)\b[^.\n]{0,20}\b(?:the )?machine\b/i

/**
 * A categorical no-egress claim — the fifth kind, and the most harmful one a judge could read.
 *
 * Four independent shapes rather than one, because the claim has four ordinary spellings and the
 * previous version of this rule recognised none of them. Each alternative is a *whole* claim, so a
 * rewording lands on another one: an adverb with `offline`, a negation of the network, a negation of
 * the API call, a negation of the contact, and `egress` quantified at zero.
 */
const NO_EGRESS =
  /\b(?:fully|entirely|completely|purely)\s+offline\b|\bno\s+(?:outbound|external|network|egress)\b|\bmakes?\s+no\s+(?:api|http|network)\s+calls?\b|\bnever\s+contact(?:s)?\b|\bzero\s+egress\b|\begress\s+is\s+zero\b/i

/**
 * A degradation *route* claimed where the code takes the other one.
 *
 * Not a denial of the capability but of the shape of the degradation, which is the same false egress
 * disclosure in the file the quick start points at. `[^.]` rather than `[^.\n]` because a contrastive
 * clause is one grammatical unit and the line break inside it is typographic: a rule that stopped at
 * the newline would pass a sentence merely because somebody wrapped it.
 */
const DEGRADATION_ROUTE = /\bunavailable\b[^.]*\b(?:rather than|instead of|never)\b[^.]*\b(?:mock|fall ?(?:ing|s)? ?back)\b/i

/** Which of the five claims a line makes. */
type Denial = "provider" | "egress" | "seam" | "degradation" | "no_egress"

/**
 * The denial a line makes, or null.
 *
 * The degradation route is tested first because it is the one whose fix differs: a reader told the
 * CLI never falls back has to be told about the transcript, not about the hosted provider.
 * `no_egress` is tested next, ahead of the narrower kinds, because it is the strongest claim on the
 * line and therefore the one whose correction message the author most needs.
 */
const denialKind = (line: string): Denial | null => {
  if (DEGRADATION_ROUTE.test(line)) return "degradation"
  if (NO_EGRESS.test(line)) return "no_egress"
  if (PROVIDER_DENIAL.test(line)) return "provider"
  if (NOTHING_LEAVES.test(line)) return "egress"
  if (PROVIDER_IS_A_PLACEHOLDER.test(line)) return "seam"
  return null
}

/**
 * Six honest phrasings this rule must not fail, and every one of them occurs in this repository
 * today. A gate that blocks them leaves the author with exactly one option, which is to delete the
 * disclosure — so these are as much a part of the rule as the patterns above.
 *
 *  - a *local* path is absent, which is true: there is no llama.cpp and no Ollama here;
 *  - a checkout is not configured for one: `in the default checkout, because no API key ships`;
 *  - a credential is absent, not the capability: `no provider key` (`INTEGRITY.md` §6);
 *  - a provider's *rate limits* are not being evaded, which is a different subject entirely and the
 *    subject of `INTEGRITY.md` §1;
 *  - a past claim is being corrected: `said "…", which was false`;
 *  - a *scoped* subject is offline, which is what the README's own sentence does: the eval sets
 *    "run in about a second on a clean checkout with no corpus and no network". That is a true
 *    statement about two hermetic test fixtures, and it is the one phrasing in this repository that
 *    `no outbound network access` would otherwise catch — so the clean-checkout scope is what keeps
 *    the fifth kind from failing the document that made it necessary.
 */
const DENIAL_SCOPED_OR_CORRECTED =
  /\blocal\b|\bprovider[-\s]?(?:limit|quota|rate)\b|\bprovider (?:key|api key|token|credential|configuration)\b|\b(?:in|on|by) (?:a|the|this) (?:default|fresh|clean) (?:checkout|clone|repo\w*)\b|\b(?:that|which) was (?:false|wrong|incorrect|removed)\b/i

/** The one outbound `fetch(` in this repository that is not egress to a model. */
const CORPUS_PACKAGE = "packages/mizan-corpus/"

/**
 * The files that open a socket to a model API.
 *
 * Structural, and structural in the fail-closed direction: every `fetch(` outside the corpus package
 * counts, rather than a literal constructor name in one file that has to be named. Renaming
 * `hostedProvider`, or adding a second provider site, cannot switch the rule off; and a corpus client
 * that moved out of its package is *reported* rather than missed, which is the direction AGENTS.md §3
 * wants even when the report is wrong.
 */
const liveProviderSites = (sources: readonly SourceFile[]): readonly string[] =>
  sources.filter((file) => /\bfetch\s*\(/.test(file.text) && !file.path.startsWith(CORPUS_PACKAGE)).map((file) => file.path)

const DENIAL_FIX = {
  provider: (sites: string): string =>
    `this document denies that mizan reaches a model, but ${sites} opens an allowlisted HTTPS POST to one. Point the reader at the inference disclosure instead of denying it`,
  egress: (sites: string): string =>
    `this document says nothing leaves the machine, but ${sites} sends the question to an allowlisted host. Say where the question goes, and on which condition`,
  seam: (sites: string): string =>
    `this document calls a provider a seam rather than an integration, and ${sites} is the integration: an allowlisted HTTPS request carrying a real credential`,
  degradation: (): string =>
    "this document says the honest degradation is `model unavailable` with no mock or fallback, but a keyless `hosted` run resolves to the committed transcript. State both routes and label the replay; `model unavailable` is what a *configured* provider prints when the request fails",
  no_egress: (sites: string): string =>
    `this document states there is no egress at all, but ${sites} sends the question to an allowlisted host whenever \`MIZAN_LLM_API_KEY\` is set. A categorical no-egress claim is the most harmful version of this defect: a judge who believes it concludes nothing ever leaves the machine. State the condition under which egress happens instead of denying it`,
} as const

/**
 * R7: a document must not deny, or under-state, the egress the product source builds.
 *
 * @param sources the product's TypeScript sources. Empty — a repository with no `apps/` or
 *   `packages/` tree — means there is nothing to contradict, so the document is not second-guessed.
 */
export const checkLiveProviderClaim = (documentText: string, file: string, sources: readonly SourceFile[]): readonly DocsClaim[] => {
  const sites = liveProviderSites(sources)
  if (sites.length === 0) return []
  const named = sites.map((path) => `\`${path}\``).join(" and ")

  const claims: DocsClaim[] = []
  for (const line of documentText.split("\n")) {
    const kind = denialKind(line)
    if (kind === null) continue
    if (DENIAL_SCOPED_OR_CORRECTED.test(line)) continue
    claims.push(claim("live-provider-denied", file, DENIAL_FIX[kind](named)))
  }
  return claims
}

export * as DocsEgress from "./docs-egress.ts"
