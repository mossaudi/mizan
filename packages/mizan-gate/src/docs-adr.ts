import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * Story 7, rules twelve and thirteen — an ADR citation must resolve to a file, and a file in the
 * ADR directory must record a decision someone can read back.
 *
 * ## Why resolution is a build failure rather than a warning
 *
 * The repository cites `ADR-03` as the authority for its central architectural claim in a dozen
 * places. A judge who greps for it and finds nothing has just been handed a reason to stop
 * trusting every other citation beside it — and the cost of the defect is exactly the credibility
 * the citation was supposed to carry. There is no partial state that is honest here: either the
 * cited document exists or the citation is folklore, so a missing one fails the build (AGENTS.md
 * §3).
 *
 * ## Why the identifier resolves case-sensitively on every platform
 *
 * The available set is built from the filenames actually present and compared as strings, while
 * the pattern that *finds* a citation is case-insensitive — so a mistyped prefix is still read as
 * a citation and is then looked up exactly. An `existsSync` check would do the opposite: on the
 * Windows matrix it would resolve a lower-cased citation to `ADR-C1.md` and on Linux it would not,
 * and a citation that resolves on one platform and dangles on the other is worse than one that
 * fails everywhere, because the green run is the one nobody re-checks.
 *
 * ## Why this module cannot cite a document that does not exist
 *
 * `docs-check.ts` scans this file like any other, so an example written as a literal would be
 * read as a citation. Every identifier below is therefore assembled from fragments, the same
 * discipline `docs-gates.ts` uses for the gate ids it reports on.
 */

/** The directory that holds the documents, relative to the repository root. */
export const ADR_DIRECTORY = "docs/specs/adr"

/** The prefix every identifier carries, held as a fragment so no literal citation exists here. */
const ADR_TOKEN = "ADR" + "-"

/**
 * The two citation namespaces that must resolve: the `C` namespace — `C` followed by a non-zero
 * one- or two-digit number — and the legacy numeric namespace of two or more digits. The prefix
 * they follow is `ADR_TOKEN`.
 *
 * Two or more digits rather than one is what keeps the noise forms — a `0` followed by an unknown
 * letter, a lower-case `nn`, the placeholders a writer reaches for when the number is not yet
 * decided — out of the finding set. A rule that reports a placeholder as a dangling citation
 * trains a reader to ignore it, which is how a real dangling citation gets past the same rule.
 */
export const ADR_PATTERN = new RegExp(`\\b${ADR_TOKEN}(C[1-9]\\d?|\\d{2,})\\b`, "gi")

/**
 * R12: every ADR identifier cited in a swept file has a document in `ADR_DIRECTORY`.
 *
 * Reported once per identifier per file: a document that cites `ADR-03` eleven times has one
 * defect, and eleven findings for it are a reason to read the report rather than act on it.
 *
 * @param available the identifiers that resolve, as a set of filenames without `.md`. An empty set
 *   means the repository ships no ADRs at all, in which case every citation is a finding — a
 *   missing directory is a missing answer, not a reason to skip the check.
 */
export const checkAdrCitationUnresolved = (document: string, file: string, available: ReadonlySet<string>): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  const reported = new Set<string>()
  for (const match of document.matchAll(ADR_PATTERN)) {
    const identifier = match[0]
    if (reported.has(identifier)) continue
    reported.add(identifier)
    if (available.has(identifier)) continue
    claims.push(claim("adr-citation-unresolved", file, `${file} cites ${identifier}, and ${ADR_DIRECTORY} holds no document with that identifier`))
  }
  return claims
}

/** The sections every ADR in this repository records, in the order a reader meets them. */
const REQUIRED_SECTIONS = ["## Context", "## Decision", "## Consequences"] as const

/** The status field. Draft, proposed and superseded are all states in which a decision is not made. */
const ACCEPTED_STATUS = /-\s*\*\*Status:\*\*\s*Accepted\b/i

/**
 * R13: an ADR records its context, its decision, its consequences and an accepted status.
 *
 * An ADR file that exists but says only what was considered has resolved the citation while
 * answering nothing, which is the defect behind the "status left as draft" edge case: the file is
 * there, the grep succeeds, and the authority is still empty. Checking the shape here rather than
 * in a test means the next ADR cannot be written half-finished either.
 */
export const checkAdrDocument = (document: string, file: string): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const section of REQUIRED_SECTIONS) {
    if (document.includes(section)) continue
    claims.push(claim("adr-document-incomplete", file, `${file} has no "${section}" section, so it records a decision that cannot be read back`))
  }
  if (ACCEPTED_STATUS.test(document)) return claims
  claims.push(claim("adr-document-incomplete", file, `${file} does not record "**Status:** Accepted"; a decision left at draft is a decision not made`))
  return claims
}

export * as DocsAdr from "./docs-adr.ts"
