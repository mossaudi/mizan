import { findMatchingLines, importClosure, productionFiles, type Finding, type SourceFile } from "../scan.ts"
import { tokenPattern } from "../token-pattern.ts"
import { AMBIENT_AUTHORITY_TOKENS, SIMILARITY_TOKENS } from "./g1-no-similarity.ts"
import { PERCENT_OWNERS, VERDICT_PATH, VERDICT_PATH_ENTRY, inAny } from "./g6-no-false-verified.ts"

/**
 * G-7 — the verdict path stays pure as it grows.
 *
 * ## The gap G-7 exists to close
 *
 * G-1 is a whole-PACKAGE rule over `packages/mizan-verify/`. It answers "does the verifier
 * contain similarity machinery anywhere?" — which, on the day it was written, was the same
 * question as "can the decision path reach similarity machinery?", because the decision path
 * *was* essentially the package. MIZ-106 changed that. `steps/anchor.ts` is a second module on
 * the path from a claim to its outcome, and it is a module whose entire job is to notice a
 * relationship between two pieces of text. That is the exact shape the CWE-345 spike proved
 * cannot be done safely, so the property needs re-asserting at the new granularity.
 *
 * So G-1 keeps answering its question — it still scans the package, and widening it would
 * make it a worse rule — and G-7 answers the *path* question: the transitive closure of
 * `verify.ts`, plus the display modules that reuse its relation.
 *
 * ## Ten rules
 *
 *  - **G-7.1 the anchor module has no opinion.** `steps/anchor.ts` may not contain the token
 *    `verdict` at all. This is the cheap version of "the anchor can only ever produce
 *    `unverifiable`", and it is cheap precisely because it is a word ban: a locator that says
 *    `if (span.length > 3) return verified` cannot be written in that file. The word is banned
 *    in STRINGS too (`code+strings` mode), so returning the literal from a constant does not
 *    help either. Comments are stripped, which is what lets the file explain itself at length
 *    without tripping its own rule.
 *  - **G-7.2 no similarity on the path.** G-1.2's vocabulary, re-applied to the closure and
 *    the display modules. Duplicated on purpose rather than refactored: G-1's rule is scoped
 *    to a path prefix and G-7's to a closure, so they cannot be one function. What IS shared
 *    is the token LIST, imported from G-1 — one vocabulary, one module, AGENTS.md section 17.
 *  - **G-7.3 no ambient authority on the path.** G-1.3's vocabulary, same scoping rationale.
 *  - **G-7.4 no percentage-shaped key on the path.** `percent`, `confidence`, `score` and
 *    `trustScore` may not appear as PROPERTY KEYS anywhere in the closure. G-6.3 already bans
 *    `percent:`; this is the general form, and the reason it is a property-key rule rather
 *    than a token ban is that a local variable named `score` is a rename away from being
 *    meaningful, whereas a field named `score` is a decision someone can read out of.
 *    `verify.ts` and `schema/verdict.ts` are exempt because they are the two files that own
 *    the two legitimate match shapes.
 *  - **G-7.5 no application code on the path.** Nothing reachable from `verify.ts` may live
 *    under `apps/`. The CLI is where display concerns, provider configuration and the phrase
 *    index live; the dependency direction is the other way, always.
 *  - **G-7.6 the display path exists.** Every declared display path is present in the scanned
 *    tree. This is a rename guard: `render.ts` becoming `render/format.ts` would otherwise
 *    silently remove three rules from scope, and a path-keyed list that quietly stops applying
 *    is a guard that protects nothing.
 *  - **G-7.7 the relevance module names no outcome.** `apps/cli/src/relevance.ts` may not
 *    contain `verdict` or `verified` at all. Sprint 2 added a second, separate statement —
 *    "does this answer address the question" — beside the first, and the whole safety argument
 *    for adding it is that it CANNOT touch a badge. A relevance check that suppressed a `verified`
 *    would be a heuristic overruling a computed fact, and one that granted one would be the
 *    back door to `verified` that Sprint 2's security note names. A word ban settles both: the
 *    capability is not present in the file, so neither mistake is available to make. This is the
 *    same shape as G-7.1, for the same reason, and it is checked in `code+strings` mode so a
 *    constant cannot smuggle the word in.
 *  - **G-7.8 the suggestion package is a leaf.** `packages/mizan-suggest/` may import only
 *    relative modules and `@mizan/core`. Sprint 1 added the one module in this repository whose
 *    entire job is to compute a similarity between two pieces of text, and its safety argument is
 *    that it is a *pure ranking function*: no I/O, no corpus, no provider, no network, no clock,
 *    nothing to depend on. Every one of those properties is a property of the dependency list,
 *    and a dependency list is exactly what a well-meaning performance PR changes — `fastest-
 *    levenshtein`, a SQLite handle, a cache. AGENTS.md section 9 states the rule for the verifier
 *    in prose; ADR-07 states it for the module one door away, and this rule makes it
 *    machine-checkable.
 *  - **G-7.9 the suggestion package names no outcome.** `verdict` and `verified` may not appear
 *    anywhere in `packages/mizan-suggest/`, in code or in a string. G-7.8 already forbids it
 *    importing the verifier, so this is not about the import; it is about the *shape of the
 *    answer*. A `rankNeighbours` that returned `{ order, verdict }` would be the CWE-345 hole
 *    with a friendly name, and the cheapest way to make that unwritable is to forbid the words in
 *    the one file that produces the list. Same shape and same reasoning as G-7.1 and G-7.7, and
 *    for the same reason: the capability is absent rather than merely unused.
 *  - **G-7.12 the display contract carries exactly the two integers, and no third number.**
 *    `NearbyRecord` declares `sharedRunChars` and `SuggestionCandidates` declares `quoteChars`, and
 *    every number on a rendered candidate row traces to one of them or to `considered`. This is the
 *    rule that keeps ADR-12's reversal of the no-number rule honest. `display.ts` used to say in its
 *    own header that it carried no number at all, so a retyped field would have been a third
 *    measurement with nothing checking it — and the cheapest way to make that unwritable is to
 *    enumerate the keys rather than to forbid a class of shapes that could grow. A quotient is the
 *    specific hole: `displayPercent` exists in `longest-run.ts` and is deliberately not re-exported,
 *    so a percentage on this path would be a number computed from the same pair and shown to a reader
 *    as a figure of precision. Same shape and reasoning as G-7.4, one level up: G-7.4 forbids
 *    percentage-*shaped keys* on the verdict path, this forbids a third measurement on the display
 *    contract that a renderer could reach.
 *  - **G-7.11 the suggestion package has no ambient authority.** No clock, no randomness, no
 *    network, no environment, no timer, no dynamic import anywhere in `packages/mizan-suggest/`.
 *    This is the rule G-7.8 cannot express. A dependency list is what a well-meaning PR changes,
 *    and a dependency list is exactly what G-7.8 reads — but `fetch("https://…")`, `Date.now()` and
 *    `process.env.X` need no import at all. They are globals, so an import-allowlist rule is blind to
 *    them by construction: the vector this feature would be attacked with is a "cache the nearest
 *    results" call, and that call is one bare identifier wide. The determinism claim the package
 *    exists to extend — the same list, byte for byte, on every run and every machine — is a
 *    property of its reachable globals, so the globals are what is checked. G-1.3 already asserts
 *    this over the verifier; this asserts it over the module one door away, reusing the same
 *    vocabulary from the same place (AGENTS.md §17).
 *
 * ## What G-7 does not check, stated rather than discovered
 *
 * G-7.6 catches a display module that was RENAMED. It does not catch one that was ADDED
 * without being declared — nothing can, short of a convention that every display module must
 * be listed somewhere, which would be a second registry with the same failure mode. The
 * residual exposure is small: a new display module has to be WIRED into `render.ts` to affect
 * anything a user sees, and that wiring is a diff somebody reads. The list is exported so that
 * review, not the gate, is the primary control, and so the next person adding a display module
 * finds the list in the same file as the rule that reads it.
 */

/** The module that must not be able to express an outcome. */
export const ANCHOR_MODULE = "packages/mizan-verify/src/steps/anchor.ts"

/**
 * Display modules that deliberately reuse a relation from the verdict path.
 *
 * Sprint 2 added two: `correction.ts`, which places a located span, and `relevance.ts`, which
 * states whether an answer addresses the question. Both are on the same side of the same line as
 * `render.ts` — display, downstream of the decision — and both are here so that G-7.2, G-7.3 and
 * G-7.4 keep applying to them. A correction module that could reach a clock, or a relevance
 * module with a `confidence:` field, is the CWE-345 hole wearing a product surface.
 *
 * Story 3 added a third: `apps/web/src/page.ts` renders the badge map to the static page. It is
 * declared rather than left out because it is a display surface a user opens directly and it is
 * NOT wired into `render.ts` — which is precisely the residual exposure the header below names
 * as being covered by review. Putting it in the list means the gate covers it instead.
 *
 * Story 4 of Sprint 1 added `apps/cli/src/suggestions.ts`: the composition half of the
 * nearest-quote feature. It reads the corpus and the verdicts and hands `render.ts` a block of
 * real record ids and texts — and it is the first display module that *imports* rather than
 * merely formatting, so it is exactly where a display-only helper could start reaching for a
 * provider or a network call. Declaring it keeps G-7.2, G-7.3 and G-7.4 applying to it; G-7.8 and
 * G-7.9 cover the package it calls.
 */
export const DISPLAY_PATH = [
  "apps/cli/src/render.ts",
  "apps/cli/src/correction.ts",
  "apps/cli/src/relevance.ts",
  "apps/cli/src/suggestions.ts",
  "apps/web/src/page.ts",
] as const

/**
 * The pure ranking package, whose two rules are about what it may import and what it may name.
 *
 * A path prefix rather than an exact file, because the property is a property of the PACKAGE: every
 * module in it computes the same kind of relation, so a helper module added next week inherits the
 * rule without anyone remembering to list it.
 */
export const SUGGEST_PATH = "packages/mizan-suggest/"

/** The only non-relative specifier the suggestion package may import. */
export const SUGGEST_ALLOWED_SPECIFIER = "@mizan/core"

/** The module that may not name an outcome, for the reason given in G-7.7. */
export const RELEVANCE_MODULE = "apps/cli/src/relevance.ts"

/**
 * The words `relevance.ts` is forbidden.
 *
 * Exported for the same reason `ANCHOR_BANNED_WORD` is: so the self-test plants exactly these and
 * not a paraphrase, and so a caller that needs the list has a named import rather than a re-typed
 * literal. It is a *list* rather than one word because the two-word form is the one that matters —
 * a module can avoid writing `verdict` by writing `verified` instead, and the second is the one
 * that grants the badge.
 */
export const RELEVANCE_BANNED_WORDS = ["verdict", "verified"] as const

/**
 * The one word `steps/anchor.ts` is forbidden.
 *
 * Exported so the self-test plants exactly this and not a paraphrase of it, and so the
 * whitelist that a caller needs (if it ever needs one) is a named import rather than a
 * re-typed string literal.
 */
export const ANCHOR_BANNED_WORD = "verdict"

/** Property-key-shaped names that would let a number ride along inside a decision. */
export const PERCENT_KEY_TOKENS = ["percent", "confidence", "score", "trustScore"] as const

/**
 * The G-7.4 pattern: one of the tokens in a property-key position.
 *
 * `[:?]` rather than `:` so that a TYPE member (`readonly confidence: number`) is caught too.
 * That is deliberate: a type declaration is the first place such a field gets added, and
 * catching it there is cheaper than catching it at the call site that reads it. A bare
 * `score = 1` is not matched, because a local variable is not a field on anything.
 */
export const PERCENT_KEY_RULE = new RegExp(`(?<![\\w$])["']?\\b(?:${PERCENT_KEY_TOKENS.join("|")})\\b["']?\\s*[:?]`)

/** The closure plus the display modules — the set the similarity and authority rules read. */
const pathAndDisplay = (files: readonly SourceFile[]): readonly SourceFile[] => {
  const closure = importClosure(productionFiles(files), VERDICT_PATH_ENTRY)
  const display = productionFiles(files).filter((file) => inAny(file.path, DISPLAY_PATH))
  const merged = new Map([...closure, ...display].map((file) => [file.path, file]))
  return [...merged.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** G-7.1 — the anchor module may not name an outcome. */
export const checkAnchorModuleHasNoOpinion = (files: readonly SourceFile[]): readonly Finding[] => {
  const anchor = productionFiles(files).filter((file) => file.path === ANCHOR_MODULE)
  return findMatchingLines("G-7", "G-7.1 anchor-module-has-no-opinion", anchor, tokenPattern([ANCHOR_BANNED_WORD]), "code+strings")
}

/** G-7.2 — no similarity machinery reachable from the verdict path, nor in the display modules. */
export const checkNoSimilarityOnPath = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-7", "G-7.2 no-similarity-on-path", pathAndDisplay(files), tokenPattern(SIMILARITY_TOKENS))

/** G-7.3 — no clock, randomness, network, env or dynamic import on the path. */
export const checkNoAmbientAuthorityOnPath = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-7", "G-7.3 no-ambient-authority-on-path", pathAndDisplay(files), tokenPattern(AMBIENT_AUTHORITY_TOKENS))

/** G-7.4 — no percentage-shaped property key on the path. */
export const checkNoPercentKeyOnPath = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-7", "G-7.4 no-percent-key-on-path", pathAndDisplay(files), PERCENT_KEY_RULE).filter(
    (finding) => !inAny(finding.path, PERCENT_OWNERS),
  )

/** G-7.5 — no application code reachable from the verdict path. */
export const checkNoAppCodeOnPath = (files: readonly SourceFile[]): readonly Finding[] => {
  const findings: Finding[] = []
  for (const file of importClosure(productionFiles(files), VERDICT_PATH_ENTRY)) {
    if (!file.path.startsWith("apps/")) continue
    findings.push({
      gate: "G-7",
      rule: "G-7.5 no-app-code-on-path",
      path: file.path,
      line: 1,
      excerpt: `${file.path} is reachable from ${VERDICT_PATH_ENTRY}. The dependency direction is apps -> packages, never the reverse.`,
    })
  }
  return findings
}

/**
 * G-7.6 — every declared display path is in the scanned tree.
 *
 * Reported against the missing path, not against a real file, so there is no line to point at.
 */
export const checkDisplayPathPresent = (files: readonly SourceFile[]): readonly Finding[] => {
  const present = new Set(productionFiles(files).map((file) => file.path))
  return DISPLAY_PATH.filter((path) => !present.has(path)).map((path) => ({
    gate: "G-7" as const,
    rule: "G-7.6 display-path-present",
    path,
    line: 1,
    excerpt: `${path} is declared in DISPLAY_PATH but was not found. A renamed display module silently removes these rules from scope.`,
  }))
}

/**
 * G-7.8's pattern: an import specifier that is neither relative nor the one allowed package.
 *
 * Written as a negative lookahead over the specifier rather than as "list the forbidden ones", so
 * that adding a dependency fails the gate by default instead of passing until somebody remembers
 * to update a list. `from\s*["']` (not `import\s`) catches a re-export too, which matters: a
 * package that only forwards another package's symbols still depends on it, and an index barrel is
 * exactly where that hides. The relative alternative is `\.\.?/`, so a specifier that merely
 * *contains* `core` — `@mizan/core-plus` — is not mistaken for the allowed one.
 */
export const SUGGEST_IMPORT_RULE = new RegExp(
  `from\\s*["'](?!\\.{1,2}/|${SUGGEST_ALLOWED_SPECIFIER}["'])[^"']+["']`,
)

/** G-7.7 — the relevance module may not name an outcome, in code or in a string. */
export const checkRelevanceModuleHasNoOutcome = (files: readonly SourceFile[]): readonly Finding[] => {
  const relevance = productionFiles(files).filter((file) => file.path === RELEVANCE_MODULE)
  return findMatchingLines("G-7", "G-7.7 relevance-module-has-no-outcome", relevance, tokenPattern(RELEVANCE_BANNED_WORDS), "code+strings")
}

/** G-7.8 — the suggestion package imports only relative modules and `@mizan/core`. */
export const checkSuggestPackageIsLeaf = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines(
    "G-7",
    "G-7.8 suggest-package-is-leaf",
    productionFiles(files).filter((file) => file.path.startsWith(SUGGEST_PATH)),
    SUGGEST_IMPORT_RULE,
    "code+strings",
  )

/** G-7.9 — the suggestion package may not name an outcome, in code or in a string. */
export const checkSuggestPackageNamesNoOutcome = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines(
    "G-7",
    "G-7.9 suggest-package-names-no-outcome",
    productionFiles(files).filter((file) => file.path.startsWith(SUGGEST_PATH)),
    tokenPattern(RELEVANCE_BANNED_WORDS),
    "code+strings",
  )

/**
 * G-7.11 — no clock, randomness, network, environment, timer or dynamic import in the suggestion
 * package.
 *
 * ## Why this rule exists when G-7.8 already reads the dependency list
 *
 * Because the interesting calls need no import. `fetch("https://…")`, `Date.now()`, `Math.random()`
 * and `process.env.MODEL` are globals — an import allowlist is blind to all four *by construction*,
 * and the vector this feature would realistically be attacked with is a "cache the nearest results"
 * call, which is one bare identifier wide. G-7.8 makes a new dependency a build failure; this makes
 * a new *global* one a build failure too. The determinism the package exists to extend — the same
 * list, byte for byte, on every run and every machine — is a property of its reachable globals, so
 * the globals are what get checked.
 *
 * Code and strings, like G-7.9, so that a stringified call is caught too — a cached response kept as
 * text is still a network call, and the vocabulary is imported from G-1 rather than retyped, because
 * "what counts as ambient authority" is one fact with one owner (AGENTS.md §17).
 */
export const checkSuggestPackageHasNoAmbientAuthority = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines(
    "G-7",
    "G-7.11 suggest-package-has-no-ambient-authority",
    productionFiles(files).filter((file) => file.path.startsWith(SUGGEST_PATH)),
    tokenPattern(AMBIENT_AUTHORITY_TOKENS),
    "code+strings",
  )

/** The display schema module, which is where the declared contract lives. */
export const DISPLAY_SCHEMA_MODULE = "packages/mizan-core/src/schema/display.ts"

/**
 * G-7.12 — the numbers on a rendered candidate row, enumerated.
 *
 * ## Why an allowlist rather than G-7.4's ban
 *
 * G-7.4 reads property keys and asks "does this name a percentage?". That is the right question for the
 * verdict path, where the answer to an unexpected key is to forbid it outright. Here the answer has to
 * be "it must be one of these", because the failure this rule pins is not a percentage — it is a
 * *legitimately named* third number. `suggestions.ts` computing `similarity: 0.83` would satisfy
 * G-7.4, G-7.9 and G-7.12-as-ban, and would be exactly the ADR-03 hole wearing a neutral name. A
 * classifier cannot see that; an enumeration can, because the honest fields are known.
 *
 * `considered` is on the list because it is a real count the renderer already prints, and excluding it
 * would make the rule complain about correct code and train its readers to ignore it (AGENTS.md §14).
 */
export const DISPLAY_CONTRACT_NUMBERS = ["rank", "considered", "sharedRunChars", "quoteChars"] as const

/** A number on the display contract that is not one of the declared four. */
/**
 * Case-insensitive on the suffix, because a field is as likely to be `similarity` as `similarityRatio`
 * and a rule that only caught the capitalised spelling would be catching a naming style rather than a
 * defect. The declared four are excluded by whole word, so `quoteChars` cannot trip the `Chars` suffix.
 */
/**
 * The prefix is optional, which is what catches a bare `similarity`. A required prefix would match
 * `closenessScore` and quietly miss `similarity` itself — a rule that only catches the qualified spelling
 * is catching a naming style, not a defect.
 *
 * The declared four are excluded by whole word, so `quoteChars` cannot trip the `Chars` suffix, and
 * `recordsSimilarTo` is out of range because it does not end in a measurement name.
 */
const DISPLAY_NUMBER_RULE = new RegExp(`\\b(?!(?:${DISPLAY_CONTRACT_NUMBERS.join("|")})\\b)(?:[A-Za-z_]\\w*)?(?:chars|percent|ratio|share|probability|confidence|score|similarity)\\b`, "i")

/** G-7.12 — no undeclared measurement on the display contract. */
export const checkDisplayContractNumbers = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines(
    "G-7",
    "G-7.12 display-contract-numbers",
    productionFiles(files).filter((file) => file.path === DISPLAY_SCHEMA_MODULE),
    DISPLAY_NUMBER_RULE,
    "code+strings",
  )

/** The whole gate. */
export const gateVerdictPathPurity = (files: readonly SourceFile[]): readonly Finding[] => [
  ...checkAnchorModuleHasNoOpinion(files),
  ...checkNoSimilarityOnPath(files),
  ...checkNoAmbientAuthorityOnPath(files),
  ...checkNoPercentKeyOnPath(files),
  ...checkNoAppCodeOnPath(files),
  ...checkDisplayPathPresent(files),
  ...checkRelevanceModuleHasNoOutcome(files),
  ...checkSuggestPackageIsLeaf(files),
  ...checkSuggestPackageNamesNoOutcome(files),
  ...checkSuggestPackageHasNoAmbientAuthority(files),
  ...checkDisplayContractNumbers(files),
]

/** Re-exported so a caller building an overlay does not have to remember two entry points. */
export { VERDICT_PATH, VERDICT_PATH_ENTRY }

export * as G7 from "./g7-verdict-path-purity.ts"
