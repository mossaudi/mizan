import { findMatchingLines, importClosure, productionFiles, relativeSpecifiers, type Finding, type SourceFile } from "../scan.ts"
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
 * ## Twelve rules
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
 *    anywhere in `packages/mizan-suggest/`, in code or in a string. G-7.8 and G-7.10 already forbid
 *    reaching the verifier — the first by package specifier, the second by relative path — so this is
 *    not about the import; it is about the *shape of the
 *    answer*. A `rankNeighbours` that returned `{ order, verdict }` would be the CWE-345 hole
 *    with a friendly name, and the cheapest way to make that unwritable is to forbid the words in
 *    the one file that produces the list. Same shape and same reasoning as G-7.1 and G-7.7, and
 *    for the same reason: the capability is absent rather than merely unused.
 *  - **G-7.10 the suggestion package reaches no file on the verdict path.** A relative import in
 *    `packages/mizan-suggest/` may not climb out of its own package directory. This is the hole in
 *    G-7.8 that G-7.8's own rule text admits: the allowlist permits relative specifiers, because
 *    ranking a candidate against its neighbour legitimately means importing a sibling, and from
 *    `packages/mizan-suggest/src/suggest.ts` the specifier `../../mizan-verify/src/verify.ts` is
 *    relative, resolves on disk, typechecks, and passes every G-7.8 and G-7.9 check — while
 *    putting the verdict computation inside the one module whose entire safety argument is that
 *    it cannot reach one (ADR-07). G-7.8 guards the package LIST, which a PR edits; this guards
 *    the package BOUNDARY, which a PR crosses by accident. The check is lexical and deliberately
 *    extension-agnostic, so dropping the `.ts` does not walk around it, and it is stated over the
 *    whole package rather than one file, so a helper added next week inherits it.
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
 *  - **G-7.13 a completeness claim carries its denominator.** The document coverage path publishes
 *    `segments`, `extracted` and `checked` because a component that SELECTS which spans get checked
 *    can hide a fabrication by not emitting it — and a report that printed verdicts alone would let
 *    every skipped fabrication read as "nothing was there". The claim "these quotes are verified" is
 *    therefore not printable without the `extracted`-of-`segments` denominator beside it, and this rule
 *    is the mechanical form of that: a completeness phrase may appear in exactly one display module,
 *    and on the line it appears on. No new `GateId` — ADR-C11 records that pattern, and `GATE_IDS` is
 *    the single declaration the documentation check compares against.
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
  "apps/cli/src/coverage-render.ts",
  "apps/cli/src/article-suggestions.ts",
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
 * G-7.10 — how many directories below the package root an importing file sits.
 *
 * `SUGGEST_PATH` is a prefix, so the answer is a function of the prefix's own segments: the
 * directory `packages/mizan-suggest/src` is one level inside the package, which is exactly the one
 * `..` a sibling import spends.
 */
const depthInsideSuggestPackage = (path: string): number =>
  path.split("/").length - 1 - (SUGGEST_PATH.split("/").length - 1)

/**
 * Whether a relative specifier leaves `packages/mizan-suggest/`.
 *
 * ## Why lexical counting rather than path resolution
 *
 * Resolution would have to guess an extension to stay sound: `../../mizan-verify/src/verify`
 * resolves on disk and typechecks, so a rule that compared only `…/verify.ts` would report the
 * package as clean while the import sits one keystroke away from a rename. Counting the `..`
 * segments against the importing file's depth has no extension to guess and no case to miss, and it
 * answers the question the header actually asks — is the boundary crossed — rather than a proxy for
 * it (`../../mizan-core/src/index.ts` is an escape too, and deserves the same finding).
 *
 * Only the LEADING `..`s are counted, because that is the only place a `..` can appear; the first
 * ordinary segment ends the ascent, and a specifier that walks back down into the package has
 * already left by then.
 */
const escapesSuggestPackage = (path: string, specifier: string): boolean => {
  let climbs = 0
  for (const segment of specifier.split("/")) {
    if (segment === "..") climbs += 1
    if (segment !== "..") break
  }
  return climbs > depthInsideSuggestPackage(path)
}

/** The specifier as a pattern, so the finding can point at the line that carries it. */
const specifierPattern = (specifier: string): RegExp =>
  new RegExp(specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

/**
 * G-7.10 — no file in the suggestion package imports anything outside it by a relative path.
 *
 * ## Why this is not G-7.8's job
 *
 * G-7.8 reads the dependency list and rejects every specifier that is neither relative nor
 * `@mizan/core`. That is the right shape for the package LIST, which is what a well-meaning
 * performance PR edits, and relative specifiers must stay legal — a ranker that cannot import its
 * own sibling cannot rank. But "relative" is a SYNTAX, not a location: from
 * `packages/mizan-suggest/src/suggest.ts`, `../../mizan-verify/src/verify.ts` is relative, so it
 * passes G-7.8, and it is also the exact thing ADR-07 forbids. The allowlist's blind spot is the
 * package boundary, and this rule is the boundary.
 *
 * A package specifier (`@mizan/verify`) needs no check here — G-7.8 rejects every one of them, and
 * two rules rejecting the same import is two places for the answer to drift. This one answers only
 * the question G-7.8 structurally cannot.
 *
 * ## Why the whole package, not one file
 *
 * Every module in the prefix computes the same kind of relation, so the escape can be made from any
 * of them — including a helper nobody thought of as a decision path. Scanned by prefix, a new file
 * inherits the rule without a list to remember to extend.
 *
 * Reported per escaping specifier with the line that carries it, so the reader is pointed at the
 * edit rather than at the package.
 */
export const checkSuggestPackageReachesNoVerdictPath = (files: readonly SourceFile[]): readonly Finding[] => {
  const suggest = productionFiles(files).filter((file) => file.path.startsWith(SUGGEST_PATH))
  const escaping = suggest.flatMap((file) =>
    relativeSpecifiers(file.text)
      .filter((specifier) => escapesSuggestPackage(file.path, specifier))
      .map((specifier) => ({ file, specifier })),
  )
  return escaping.flatMap(({ file, specifier }) =>
    findMatchingLines("G-7", "G-7.10 suggest-package-reaches-no-verdict-path", [file], specifierPattern(specifier), "code+strings"),
  )
}

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

/**
 * G-7.12's pattern: a measurement-shaped name that is not one of the declared four.
 *
 * Three deliberate shapes, each closing a hole the obvious spelling leaves:
 *
 *  - **The suffix is optional**, so a bare `similarity` is caught. A required suffix would match
 *    `closenessScore` and quietly miss `similarity` itself — a rule that only catches the qualified
 *    spelling is catching a naming style, not a defect.
 *  - **Case-insensitive**, because a field is as likely to be `similarity` as `Similarity` and a
 *    rule that only caught the capitalised spelling would be the same naming-style rule again.
 *  - **The declared four are excluded by whole word**, so `quoteChars` cannot trip the `Chars`
 *    suffix and `recordsSimilarTo` stays out of range because it does not end in a measurement name.
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

/**
 * The one display module permitted to FORM a completeness claim.
 *
 * Named rather than inferred, because the rule needs an owner to point at in its excerpt: a finding
 * that says "somewhere in the display path" is a finding the next person has to search for, and the
 * whole point is that the claim has one construction site.
 */
export const COVERAGE_RENDER_MODULE = "apps/cli/src/coverage-render.ts"

/**
 * The export that module must provide, so the rule can tell an analysed renderer from an unread one.
 *
 * This is the fail-closed half of G-7.13. A rule that scanned for phrases and reported nothing on a
 * renderer that had none would report a renderer that REPLACED its sentence with a pre-rendered
 * template, or moved the wording into a shared constant, as clean — an unanalysed surface passing
 * because the rule had nothing to read. Requiring the declared export makes the absence of an
 * analysable claim site a finding in its own right.
 */
export const COVERAGE_CLAIM_EXPORT = "coverageSentenceOf"

/**
 * The phrases that assert completeness.
 *
 * ## Why a list and not a pattern
 *
 * Because the failure being prevented is a writer choosing a wording the rule does not read. A pattern
 * for "everything is fine" cannot enumerate every English sentence that claims it, and a rule with a
 * hole here trains its readers to ignore it. A list is the same shape as G-7.12's, and for the same
 * reason: the honest phrasings are knowable, so they are written down rather than guessed at.
 *
 * The list is deliberately not exhaustive of English — it is exhaustive of the phrasings this
 * repository would write, and the residual is named in the rule text below rather than implied.
 */
export const COMPLETENESS_CLAIM_TOKENS = [
  "all verified",
  "all quotes verified",
  "every quote verified",
  "fully verified",
  "completely verified",
  "fully checked",
  "no problems found",
  "nothing was found",
] as const

/** G-7.13's matcher, built from the declared list so the two cannot disagree. */
export const COMPLETENESS_CLAIM_RULE = new RegExp(
  `(?:${COMPLETENESS_CLAIM_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "i",
)

/**
 * The words a completeness claim must carry, which are the two halves of the denominator.
 *
 * `segments` is the document's size and `extracted` is how much of it was selected, and the pair is
 * the minimum that distinguishes "we checked everything" from "we checked something we chose". A
 * claim carrying neither is the fail-open sentence this rule exists to forbid.
 */
export const DENOMINATOR_WORDS = ["segments", "extracted"] as const

/** The one rule id these three findings share, so a report groups them. */
const RULE_ID = "G-7.13 completeness-claim-denominator"

/**
 * G-7.13 — a completeness claim may be formed in one module, and must carry its denominator.
 *
 * ## Why the rule scopes to DISPLAY_PATH and says so
 *
 * A phrase in a TEST fixture, a module header or an ADR is not a claim a reader can be shown. The rule
 * covers production display modules and nothing else, and that limit is stated in the finding text
 * rather than left for a reader to infer from a scan mode.
 *
 * ## The three findings it can produce
 *
 *  1. A completeness phrase in a display module OTHER than `COVERAGE_RENDER_MODULE`.
 *  2. A completeness phrase in `COVERAGE_RENDER_MODULE` whose line does not carry both denominator
 *     words.
 *  3. `COVERAGE_RENDER_MODULE` present with no `COVERAGE_CLAIM_EXPORT` — the unanalysed renderer.
 *
 * `findMatchingLines` reports against the ORIGINAL line so a finding points at code a human reads, and
 * `code+strings` keeps string bodies intact because a claim lives inside a template literal.
 */
export const checkCompletenessClaimCarriesDenominator = (files: readonly SourceFile[]): readonly Finding[] => {
  const display = productionFiles(files).filter((file) => inAny(file.path, DISPLAY_PATH))
  const elsewhere = display.filter((file) => file.path !== COVERAGE_RENDER_MODULE)
  const claimsElsewhere = findMatchingLines("G-7", RULE_ID, elsewhere, COMPLETENESS_CLAIM_RULE, "code+strings")
  const misplaced = claimsElsewhere.map((finding) => ({
    ...finding,
    excerpt:
      `${finding.excerpt} — a completeness claim may only be formed in ${COVERAGE_RENDER_MODULE}, where the ` +
      `${DENOMINATOR_WORDS.join(" and ")} denominator is mandatory. A claim on any other display surface is fail-open by construction.`,
  }))

  const renderer = display.filter((file) => file.path === COVERAGE_RENDER_MODULE)
  const unanalysable = renderer
    .filter((file) => file.text.indexOf(`export const ${COVERAGE_CLAIM_EXPORT}`) === -1)
    .map((finding) => ({
      gate: "G-7" as const,
      rule: RULE_ID,
      path: finding.path,
      line: 1,
      excerpt:
        `${finding.path} is declared as the coverage renderer but exports no ${COVERAGE_CLAIM_EXPORT}, so this rule ` +
        "cannot tell what it claims. An unanalysed renderer fails rather than passing silently.",
    }))

  const bare = findMatchingLines("G-7", RULE_ID, renderer, COMPLETENESS_CLAIM_RULE, "code+strings").filter(
    (finding) => !DENOMINATOR_WORDS.every((word) => finding.excerpt.toLowerCase().indexOf(word) !== -1),
  )

  return [...misplaced, ...unanalysable, ...bare]
}

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
  ...checkSuggestPackageReachesNoVerdictPath(files),
  ...checkSuggestPackageHasNoAmbientAuthority(files),
  ...checkDisplayContractNumbers(files),
  ...checkCompletenessClaimCarriesDenominator(files),
]

/** Re-exported so a caller building an overlay does not have to remember two entry points. */
export { VERDICT_PATH, VERDICT_PATH_ENTRY }

export * as G7 from "./g7-verdict-path-purity.ts"
