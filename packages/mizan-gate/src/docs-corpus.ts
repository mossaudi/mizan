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

/* ------------------------------------------------------------------ the mirror */

/**
 * R18: a line that names a collection the snapshot **does** serve may not renounce it.
 *
 * ## Why a rule keyed on absence cannot see staleness
 *
 * Rule fifteen is one-sided by construction: it fires when a line names Bukhari or Muslim and does
 * not say we lack them. That closes the easy direction — the covering claim. It cannot see the
 * other one. The day the corpus starts serving Bukhari, every line that says "no Bukhari" becomes
 * false, and a one-sided rule reads it as a *satisfied* renunciation, so the build stays green
 * through exactly the change that made the documents wrong. Nine renunciation lines across five
 * files were carrying that risk, and none of them could report it.
 *
 * A rule keyed on absence therefore has to be paired with one keyed on presence, and the pair is
 * cheap: the served set is `attestation.collectionCounts`, a committed artefact, so "we serve this"
 * is data rather than a declaration a document makes about itself.
 *
 * ## Why the unit is a clause and not a line
 *
 * A line may name two collections with two different standing — and the shipped corpus table does
 * exactly that in `docs/specs/adr/ADR-C4.md`, where Malik is listed as served and Bukhari is
 * renounced in the same sentence. A per-line rule would read that line as a stale renunciation of
 * Malik and report a true document, and a rule that is wrong on the ADR that records the corpus
 * scope is a rule that gets switched off on day one. So the line is split at sentence boundaries and
 * each clause is judged on its own: the negation must belong to the collection it sits beside.
 *
 * ## Why the collection names come from the attestation, and what the name table is not
 *
 * *Which* collections are served is read from `attestation.json.collectionCounts` and from nowhere
 * else — that is a fact about the corpus and this rule does not get to have an opinion about it. A
 * key is also turned into a separator-tolerant pattern, so `nasai` matches `an-Nasa'i`.
 *
 * But the attestation keys are slugs, and no document writes slugs: the README says "4 Sunan +
 * Muwatta + Qur'an", the Arabic deck says "القرآن ... ٤ سنن + الموطأ", and no slug appears in either.
 * A rule that matched keys only would therefore have caught almost nothing, and it would have looked
 * like it was working.
 *
 * So `NAMES` below says how each served collection is written in a document. It is a *documentation
 * vocabulary*, not a corpus fact: it adds no collection and removes none, and the attestation remains
 * the only authority on what is served. That distinction is what keeps this from being the second
 * source of truth AGENTS.md section 17 forbids.
 *
 * ## The table polices itself, which is the part that matters
 *
 * A served collection with no entry in `NAMES` is a collection this rule cannot watch, so it is
 * reported rather than skipped. Ingesting a seventh Sunan therefore fails `check:docs` until someone
 * writes down how documents will name it — the same fail-closed shape as a missing executor file, and
 * for the same reason: a rule that is silently blind to a new collection is a rule that reads as
 * coverage.
 *
 * The residual, stated: a document may rename a served collection into a form absent from the table
 * and go unwatched. Closing that needs the full alias set this rule declines to grow.
 */

/**
 * What may sit between two letters of one collection name: apostrophes, spaces, hyphens, and the
 * Arabic diacritics and tatweel a writer may include or leave out with no change of meaning —
 * «غير مقدَّم» and «غير مقدم» are the same sentence.
 *
 * One class, both scripts, because a name is spelled the way it is spelled and the two are not
 * separate problems.
 */
const SEPARATOR = "['’\\s\\-\\u064B-\\u0652\\u0670\\u0640]"

/**
 * The words a *coverage* claim is made of — holding, serving, shipping or omitting a collection.
 *
 * This is deliberately not `RENOUNCED`. That list is a general English negation vocabulary, which is
 * the right trade for rule fifteen: a marker that matches too much only ever *lets a claim through*,
 * and a rule that reports every honest sentence gets switched off. Rule eighteen is the other way
 * round — a marker that matches too much reports a false claim on a true document, five times over
 * on the day it landed. So the two rules read different vocabularies: R15 asks "is this an absence
 * statement?", and R18 asks "is this a statement about what we hold?".
 *
 * The list is words that can only appear in a coverage claim. `corpus` is deliberately absent: "X
 * is in the corpus but Y is not" is ordinary prose that contrasts two collections, and reading the
 * `not` as renouncing X is exactly the false positive this set exists to avoid. The residual is
 * stated rather than hidden — a renunciation phrased *only* as "not in the corpus" is not caught
 * here — and closing it would need the alias-and-phrase table this rule refuses to maintain.
 *
 * ## This vocabulary is necessary here and NOT sufficient — the fix in this revision
 *
 * Requiring a *coverage word* is what rule eighteen originally did, and it reports a false claim on a
 * true document: "Tanzil - Qur'an is served verbatim" is an affirmative coverage claim, and it was
 * reported as renouncing the Qur'an. A rule that reports the sentence a disclosure uses to state what
 * it holds is a rule that gets switched off by the next person to touch it, which is the failure this
 * module's header names as the reason for a separate vocabulary. The words below are therefore only
 * half the pattern: a clause has to carry a *renunciation* — one of three shapes below — as well as a
 * served name. The three shapes are exported separately because each has a false positive of its own
 * that a test has to plant.
 *
 * The Arabic half is here for the same reason R15's markers are: `submission/make_deck_ar.py` is a
 * public surface, and a rule that watches the English deck and not the Arabic one watches half the
 * submission. Diacritics and tatweel are optional between letters, because a document writes
 * «غير مقدَّم» and «غير مقدم» for the same sentence and both are the same claim.
 */
export const COVERAGE = new RegExp(
  String.raw`(?:\b(?:serv(?:e|es|ed|ing)|hold(?:s|ing)?|held|includ(?:e|es|ed|ing)|ingest(?:s|ed|ing)?|carried?|ship(?:s|ped|ping)?|present|excluded?|absent|missing|omitted|renounced|deferred|unavailable|out\s+of\s+scope)\b|غائب|مُقصًى|مقصوص|مُستبعَد|مؤجَّل|مؤجل|مُخفَّى|مُخفى|أُخفيت|لم\s+يُ?ضمَّ?ن|لا\s+نُ?قدّم|غير\s+مُ?قدَّ?م|لا\s+نشم?ل|لا\s+نملك|غير\s+متاح|غير\s+موجود)`,
  "iu",
)

/**
 * Grouped, and grouping is load-bearing rather than decorative: this alternation has top-level `|`,
 * and interpolating it unparenthesised into a larger pattern makes each verb its own alternative for
 * the *whole* regex. That bug reported `reposi|ship` and `are held in` as renunciations, because `ship`
 * and `held` matched on their own with no negation anywhere near them.
 */
const COVERAGE_VERB = String.raw`(?:serv(?:e|es|ed|ing)|hold(?:s|ing)?|held|includ(?:e|es|ed|ing)|ingest(?:s|ed|ing)?|carried?|ship(?:s|ped|ping)?)`

/**
 * The negation that turns a coverage claim into a *renunciation*.
 *
 * `COVERAGE` alone cannot tell "Tanzil - Qur'an is served verbatim" from "the Qur'an is not served",
 * because both make a statement about what is held and only the second is a lie. This is the whole
 * difference between a rule that catches stale disclosures and one that reports honest ones.
 *
 * ## Why not the general negation vocabulary
 *
 * `RENOUNCED` is the right trade for rule fifteen — a marker that matches too much there only ever
 * lets a claim *through* — and the wrong trade here, which is why this module reads two vocabularies.
 * But this list is narrower than `RENOUNCED` for a second reason: `no` and `not` appear in ordinary
 * prose about collections constantly ("the Qur'an is not a book of jurisprudence"), so a bare `not`
 * beside a collection name would fire on a true sentence. The shapes below each require the negation
 * to be *attached to the coverage verb*, which is the construction a renunciation actually uses.
 *
 * Four alternatives are the four ways that attachment is written in English: `does not serve`,
 * `is not served`, `never served`, and the inverted `no Sunan is served`. A window rather than
 * adjacency is needed because the negation and the verb are separated by the subject in the passive
 * ("is not currently included") and by the collection itself in the inverted form. The window is two
 * words, and that bound is tested rather than assumed: at four words `no doubt that the Qur'an is
 * served` matched, which is a sentence asserting the *opposite* of a renunciation.
 */

export const NEGATED_COVERAGE = new RegExp(
  String.raw`(?:\b(?:does|do|did|is|are|was|were|has|have|had|will|would|can|could|should|must)\s+not\s+(?:\w+\s+){0,1}?${COVERAGE_VERB}\b|\bnever\s+(?:\w+\s+){0,1}?${COVERAGE_VERB}\b|\bnot\s+(?:\w+\s+){0,1}?${COVERAGE_VERB}\b|\bno\b(?:\s+[\w’']+){0,2}?\s+${COVERAGE_VERB}\b|غائب|مُقصًى|مقصوص|مُستبعَد|مؤجَّل|مؤجل|مُخفَّى|مُخفى|أُخفيت|لم\s+يُ?ضمَّ?ن|لا\s+نُ?قدّم|غير\s+مُ?قدَّ?م|لا\s+نشم?ل|لا\s+نملك|غير\s+متاح|غير\s+موجود)`,
  "iu",
)

/**
 * A coverage word that is *itself* a renunciation — no negation required.
 *
 * The half of `COVERAGE` that can only appear in a sentence giving something up: `excluded`,
 * `absent`, `missing`, `omitted`, `renounced`, `deferred`, `unavailable`, `out of scope`. These
 * cannot honestly describe a collection that *is* served, so a clause carrying one beside a served
 * name is a renunciation with no `not` in it — which is the most common way the sentence is actually
 * written ("the Sunan are excluded, by design").
 *
 * `present`, `serve` and `hold` are absent here and that is the fix: they are the affirmative half of
 * the vocabulary, and treating them as renunciations is what reported "is served verbatim".
 */
export const RENUNCIATION = new RegExp(
  String.raw`(?:\b(?:excluded?|absent|missing|omitted|renounced|deferred|unavailable|out\s+of\s+scope|excluded\s+from\s+the\s+corpus)\b|غائب|مُقصًى|مقصوص|مُستبعَد|مؤجَّل|مؤجل|مُخفَّى|مُخفى|أُخفيت|لم\s+يُ?ضمَّ?ن|لا\s+نُ?قدّم|غير\s+مُ?قدَّ?م|لا\s+نشم?ل|لا\s+نملك|غير\s+متاح|غير\s+موجود)`,
  "iu",
)

/**
 * How each served collection is written in a document, in the languages the surfaces use.
 *
 * Both decks are public surfaces and both are read, so a collection named only in Latin would be
 * watched in one language and not the other. The key is the attestation's, and it is repeated here
 * only as the table's row label — the set of keys is the attestation's, and a served key missing from
 * this table is reported.
 *
 * `sunan` is listed for each of the four Sunan because the framing every surface prints names them
 * as a family — "4 Sunan + Muwatta + Qur'an" — so a renunciation of the family renounces all four,
 * and no single key appears in the sentence.
 *
 * `sunnah` is deliberately absent, and the shipped comparison table is why. `docs/value-proof.md`
 * names a competitor as "UmmahAPI / Sunnah.com", and the transliteration of the family is a word that
 * competitor put in its domain. A name list that watched every spelling a third party might use is not
 * a name list, it is a search index; the entry that catches a brand name is an entry that reports the
 * comparison table as renouncing our own corpus.
 *
 * A misspelling is not a name either, and one was removed for exactly that reason. `موطّن` reads
 * *muwaṭṭan* — "made firm" — which is a different word from the collection's name, `الموطأ`,
 * *Muwattaʾ*: it swaps the final `أ` for a tanwīn-marked `ن` and drops the article. It is not a
 * transliteration, a variant or a typo of anything, so it could match no honest document; it widened
 * no pattern and misreported the table, which is the one artefact here a judge is likely to check by
 * reading it.
 *
 * `muwattah` is the other end of that decision and was added for the mirror reason. The final *h* is
 * an ordinary English transliteration of the same final `أ` that `nasa'i` and `qur'an` already carry
 * in this table, and *al-Muwattaʾ* and *Muwattah* are how two surfaces here can write the same
 * collection. Without it the rule watched `Muwatta` and went blind to `Muwattah`, so the residual
 * below — a document may rename a served collection and go unwatched — covered an ordinary spelling
 * rather than only a deliberate disguise. The apostrophe needs no entry: `SEPARATOR` already admits
 * it *between* letters and the trailing boundary only excludes a letter or a digit, so `al-Muwatta'`
 * has always matched `muwatta`.
 */
export const NAMES: Readonly<Record<string, readonly string[]>> = {
  abudawud: ["abu dawud", "abudawud", "sunan", "أبو داود", "السنن"],
  ibnmajah: ["ibn majah", "ibnmajah", "sunan", "ابن ماجه", "السنن"],
  malik: ["muwatta", "muwattah", "malik", "الموطأ"],
  nasai: ["nasa'i", "nasai", "sunan", "النسائي", "السنن"],
  quran: ["qur'an", "quran", "القرآن", "القران"],
  tirmidhi: ["tirmidhi", "sunan", "الترمذي", "السنن"],
}

const escapeForLiteral = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The letters of one name, spelled as a writer might: `nasa'i`, `an-Nasa'i` and `an nasa i` all match,
 * and `annasai` does not.
 *
 * Each letter may be followed by {@link SEPARATOR}, and the caller wraps the whole sequence in
 * Unicode-aware boundaries rather than `\b` — which is why this is one pattern for both scripts: `\b`
 * is defined against ASCII word characters, so it does not fire between an Arabic letter and the space
 * beside it, and a `\b`-bounded Arabic name would match only at the start of a line. `[\p{L}\p{N}]` is
 * "a letter or a digit" in every script, which is what a reader means by "the end of the name".
 */
const nameLetters = (name: string): string => [...name].map((letter) => `${escapeForLiteral(letter)}${SEPARATOR}*`).join("")

/**
 * Every served name in **one** pattern, as a `probe` for membership and a `scan` for occurrences.
 *
 * They differ only in flags, and they have to differ. `matchAll` requires `g`, and a `g` pattern
 * carries `lastIndex` between calls, so a `g` pattern cannot answer a membership question without a
 * state bug: `test` would advance `lastIndex` and the next call would start mid-line, making this
 * rule's answer depend on which line it had read before.
 *
 * One alternation rather than one pattern per name, and the sharing is the point: the Unicode
 * lookarounds are paid once per position instead of once per name. Scanning the corpus with 27
 * separate name patterns costs 262 ms; the combined pattern costs 72 ms, and
 * {@link canRenounce} keeps even that off the hot path. Compiling a 27-alternative Unicode pattern
 * once per surface would be the same cost paid for nothing, so the compiled pair is cached by the
 * served set's own keys — sorted, so two callers naming the same set in a different order share one
 * compiled pattern and therefore one answer.
 */
type NamePatterns = { readonly probe: RegExp; readonly scan: RegExp }

const PATTERN_CACHE: Map<string, NamePatterns> = new Map()

const servedNamePatterns = (served: ReadonlySet<string>): NamePatterns => {
  const key = [...served].sort().join(",")
  const cached = PATTERN_CACHE.get(key)
  if (cached !== undefined) return cached
  const alternatives = [...served].flatMap((collection) => NAMES[collection] ?? []).map(nameLetters)
  const body = `(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`
  const built: NamePatterns = { probe: new RegExp(body, "iu"), scan: new RegExp(body, "giu") }
  PATTERN_CACHE.set(key, built)
  return built
}

/** The served collections this rule has no name for, which are the ones it cannot watch. */
export const unnamedCollections = (served: ReadonlySet<string>): readonly string[] => [...served].filter((collection) => (NAMES[collection] ?? []).length === 0)

/**
 * The clauses of a line: a sentence boundary ends a claim, and so does a semicolon or a colon.
 *
 * The trailing character class is the load-bearing part and it exists because of markdown. The
 * shipped `README.md` writes "**4 Sunan + Muwatta + Qur'an, 27,234 records.** No Bukhari, no Muslim"
 * on one line, and a split that required whitespace immediately after the full stop would not see
 * the sentence boundary at all — the emphasis markers sit in between. A rule that cannot find the
 * boundary is a rule that reads the first clause as renouncing the collection named in it, which is
 * the false positive on a true document this whole clause unit exists to prevent.
 */
const clausesOf = (line: string): readonly string[] => line.split(/(?<=[.;:!?])[*_`)\]"'’”\s]+/)

/**
 * How far from a collection name a renunciation marker may sit and still count as being about it.
 *
 * Six words either side covers every construction the vocabulary accepts — "the Sunan are excluded, by
 * design", "Muwatta is not ingested", "An-Nasa'i is not currently included" — and is narrow enough that
 * a marker about the *vocabulary*, several clauses away from the collection it names, is left alone. It
 * is not narrow enough to tell what the marker modifies, so a marker about a different subject *inside*
 * the window is still reported; ADR-C9 states that as a residual and `docs-corpus.test.ts` pins it, so
 * the limit is recorded behaviour rather than a surprise.
 *
 * This bound is a number in a rule a judge reads, which is why it is a named constant and not a literal
 * buried in a regex: changing it is a decision with a documented consequence on both sides.
 */
const MARKER_WINDOW_WORDS = 6

/**
 * The text within {@link MARKER_WINDOW_WORDS} of one occurrence of a served collection's name.
 *
 * The name itself is included, because the inverted form puts it between the negation and the verb
 * ("no Sunan is served") and dropping it would break the very construction it is here to support.
 */
const around = (clause: string, from: number, to: number): string => {
  const before = clause.slice(0, from).split(/\s+/).filter((word) => word !== "").slice(-MARKER_WINDOW_WORDS)
  const after = clause.slice(to).split(/\s+/).filter((word) => word !== "").slice(0, MARKER_WINDOW_WORDS)
  return [...before, clause.slice(from, to), ...after].join(" ")
}

/**
 * Whether this clause gives up a served collection.
 *
 * Both halves, per occurrence of a served name: the neighbourhood has to make a statement about what
 * is held, and that statement has to be a renunciation. Either alone produces a false claim on a true
 * document, which is the failure this module's header calls out as the reason rule eighteen reads a
 * vocabulary of its own.
 */
const renounces = (clause: string, patterns: NamePatterns): boolean => {
  for (const match of clause.matchAll(patterns.scan)) {
    const start = match.index ?? 0
    const window = around(clause, start, start + match[0].length)
    if (!COVERAGE.test(window)) continue
    if (RENUNCIATION.test(window) || NEGATED_COVERAGE.test(window)) return true
  }
  return false
}

/**
 * Whether a line can possibly renounce anything, answered before its clauses are cut.
 *
 * Three gates, cheapest first, and each is a gate rather than the rule: a window is a substring of the
 * clause and a clause is a substring of the line, so a pattern that matches no part of the line
 * matches no window in it. That makes every gate sound in the direction that matters — it can only
 * skip a line that had no finding waiting — and it puts the expensive name scan last, on the 81 lines
 * that carry both a coverage word and a renunciation rather than on all 2,779. This is the difference
 * between 370 ms and a rule that costs nothing.
 */
const canRenounce = (line: string, patterns: NamePatterns): boolean => {
  if (!COVERAGE.test(line)) return false
  if (!RENUNCIATION.test(line) && !NEGATED_COVERAGE.test(line)) return false
  return patterns.probe.test(line)
}

/**
 * R18: a public surface may not renounce a collection the attested snapshot serves.
 *
 * A coverage word is *necessary and not sufficient*: the clause also has to give the collection up,
 * and the marker has to be about that collection rather than about something else in the same
 * sentence. Both halves are load-bearing and both halves have a false positive that a planted test
 * pins. Requiring a coverage word alone reported "Tanzil - Qur'an is served verbatim" — the sentence
 * a disclosure uses to state what it holds — as renouncing the Qur'an. Searching the whole clause for
 * a marker then reported "the Sunan are not in the corpus" beside "`corpus` is deliberately absent",
 * where `absent` was about the vocabulary and not about the Sunan.
 *
 * @param served the collection keys in `attestation.collectionCounts`. An empty set means the
 *   repository ships no attestation, so no document can be contradicting a served set that does not
 *   exist — the rule has nothing to falsify and is skipped rather than failed, which is the same
 *   posture `checkSnapshotArithmetic` takes.
 */
export const checkCorpusPresenceContradiction = (document: string, file: string, served: ReadonlySet<string>): readonly DocsClaim[] => {
  if (served.size === 0) return []
  const patterns = servedNamePatterns(served)
  const claims: DocsClaim[] = []
  for (const [index, line] of document.split("\n").entries()) {
    if (!canRenounce(line, patterns)) continue
    for (const clause of clausesOf(line)) {
      if (!renounces(clause, patterns)) continue
      claims.push(claim("corpus-absence-stated-for-served-collection", file, `line ${index + 1} renounces a collection this snapshot serves; attestation.collectionCounts is the record of what is served, so a renunciation of it is a false claim rather than a scope boundary`))
      break
    }
  }
  return claims
}

/**
 * R18's own completeness check: every collection the attestation serves has a name this rule can
 * watch it by.
 *
 * Reported against the attestation rather than against a document, because the defect is in the
 * repository's naming vocabulary and not in anything a judge reads. A surface that renounces the
 * collection is *also* reported by `checkCorpusPresenceContradiction`; this one fires the moment the
 * corpus grows, which is earlier.
 */
export const checkServedCollectionsNamed = (file: string, served: ReadonlySet<string>): readonly DocsClaim[] =>
  unnamedCollections(served).map((collection) =>
    claim("corpus-absence-stated-for-served-collection", file, `this snapshot serves \`${collection}\`, and NAMES in docs-corpus.ts has no way a document spells it, so no surface can be checked for renouncing it; add the names or the rule is blind to that collection`),
  )

export * as DocsCorpus from "./docs-corpus.ts"
