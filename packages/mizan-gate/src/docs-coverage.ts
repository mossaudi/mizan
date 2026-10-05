import { EvalSet, decodeOrFail, decodeSync, isOk } from "@mizan/core"
import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * Does the fabrication set actually exercise every collection the product serves?
 *
 * ## The defect this rule exists to catch
 *
 * The committed red-team set held forty fabrications and covered three of the six served
 * collections. `attestation.json` serves six. Every other check passed: the declared class counts
 * matched, each case was genuinely absent from the whole corpus, and the verifier produced the
 * declared verdict for all forty. A fabricator is only shown to be contained if it was *asked about
 * that collection*, and three books were never asked about anything — so `falseVerifiedCount: 0` was
 * a true statement about a set that had never tried to falsify half the corpus.
 *
 * That is why the property is per collection and not a total. A total is what the set already
 * published and what it already satisfied.
 *
 * ## Why the counts are recomputed rather than read from the set
 *
 * `schemaVersion` 3 gives `EvalSet` a `coverageRows` field, so each set publishes its own
 * per-collection figures. This rule deliberately ignores it and counts `cases` itself. A gate that
 * read the artefact's own account of its coverage would be checking that a number agrees with
 * itself; recomputing is what makes the published row a *claim* rather than the *evidence*.
 *
 * ## Absent is not zero
 *
 * Four states, because they mean four different things and three of them are not defects:
 *
 *  - **no attestation** — a repository that ships no corpus serves nothing, so it makes no coverage
 *    claim. Skipped, for the same reason `checkSnapshotArithmetic` skips: a fork must not be failed
 *    for not shipping a file it never claimed to carry.
 *  - **no artefact** — a repository with no fabrication set makes no claim about coverage. Skipped.
 *  - **unusable attestation** — a claim that could be checked and was not made. A finding, because
 *    a served set nobody can enumerate cannot be shown to be covered, and silence here would let a
 *    repository make the rule disappear by editing one field out of its attestation.
 *  - **below floor** — the finding this rule exists for.
 *
 * The first and the third are the pair that must not share a branch, and they arrive through the same
 * `served`/`usable` pair R18 reads: `servedCollections` returns `{served: empty, usable: true}` only
 * for an ABSENT attestation (nothing is claimed) and `{served: empty, usable: false}` for one that is
 * PRESENT but cannot enumerate its collections (a claim that failed to be kept). This rule draws its
 * line at claiming on the same boundary R18 documents — "an attestation that exists is a claim about
 * the corpus, and one that cannot answer the question has failed to keep it" (`docs-check.ts`).
 */
export const FABRICATION_COVERAGE_FLOOR = 2

/** The set whose per-collection counts are the coverage. Named so a finding can point at the file. */
export const COVERAGE_SET = "data/eval/redteam-fabricated.json"

/** Collection names are ingest-sourced, so one is matched strictly before it is counted. */
const COLLECTION_NAME = /^[a-z][a-z0-9_]*$/

/**
 * The published coverage keys, as one owner for the names (AGENTS.md §17).
 *
 * These are read by `checkPresenceCollectionNamed` below and written by
 * `scripts/eval/coverage-tables.ts`. That is the split that matters: the gate judges prose against the
 * artefact, and the harness produces the artefact, so a key named in both places has to come from one
 * declaration or the two drift into a rule that is permanently green.
 *
 * `collections` is a comma-joined string rather than a nested object because `readFigures` walks
 * top-level entries only — the module header's "flat or invisible" trap, which is why the per-collection
 * figures below are flat too and the collection list travels as one readable string.
 */
export const COVERAGE_KEYS = {
  collections: "suggestionCoverageCollections",
  measuredCollections: "suggestionCoverageMeasuredCollections",
  unmeasuredCollections: "suggestionCoverageUnmeasuredCollections",
  measuredRecords: "suggestionCoverageMeasuredRecords",
  unmeasuredRecords: "suggestionCoverageUnmeasuredRecords",
  sharePercent: "suggestionCoverageSharePercent",
  /** The aggregate case count, which is also a legitimate denominator for a corpus-wide claim. */
  totalCases: "suggestionCaseCount",
} as const

/**
 * The suffix a collection contributes to its per-collection keys.
 *
 * Upper-cases the first character and changes nothing else, which is **injective over
 * `COLLECTION_NAME`'s alphabet**: every key part begins with a lowercase letter and every suffix begins
 * with an uppercase one, so two distinct collections cannot produce one suffix. A `replaceAll`-style
 * normaliser would not have that property — `quran_uthmani` and `quran-uthmani` would fold together —
 * and a per-collection figure that silently named another book is the one error this whole rule exists
 * to make impossible.
 */
const keySuffix = (collection: string): string => collection.charAt(0).toUpperCase() + collection.slice(1)

/** `suggestionCoverageCases<Collection>` — the case count, flat and top level. */
export const coverageCaseKey = (collection: string): string => `suggestionCoverageCases${keySuffix(collection)}`

/** `suggestionCoveragePresenceTop<N><Collection>` — the hit count at one cut-off. */
export const coveragePresenceKey = (collection: string, cutoff: number): string =>
  `suggestionCoveragePresenceTop${cutoff}${keySuffix(collection)}`

/**
 * The two outcomes of a containment check, as the figures that carry them.
 *
 * ## Why a coverage table without these columns was a hole rather than an omission
 *
 * `cases` and `top-N` are retrieval numbers: they say where the adjudicated record *ranked*. The
 * question a due-diligence reader actually asks is per book, *how many fabrications were caught* —
 * which is a verdict, not a rank, and which no column published anywhere in the repository answered.
 * `falseVerifiedCount: 0` is the aggregate answer; the aggregate is exactly the reading that hid the
 * three never-asked-about books in the first place.
 *
 * The counts are **derived from the set's own hand-adjudicated expectations**, not from a run of the
 * verifier — a set that expected `verified` would be a fixture judging itself, which is why
 * `checkCollectionCoverage` fails a fabrication case that does not expect `rejected`. With that rule
 * green, `Rejected<C> == Cases<C>` and `Verified<C> == 0` are consequences of a checked invariant
 * rather than two more retyped constants.
 */
export const VERDICT_KEY_PREFIX = { rejected: "suggestionCoverageRejected", verified: "suggestionCoverageVerified" } as const

/** `suggestionCoverageRejected<Collection>` / `suggestionCoverageVerified<Collection>`. */
export const coverageVerdictKey = (collection: string, verdict: keyof typeof VERDICT_KEY_PREFIX): string =>
  `${VERDICT_KEY_PREFIX[verdict]}${keySuffix(collection)}`

/**
 * The committed set, decoded through the contract `@mizan/core` declares.
 *
 * `null` for anything that is not a decodable, non-empty set. A hand-editable committed artefact is
 * the trust boundary AGENTS.md section 1 means, so the decode is not optional here — and a set that
 * does not decode is reported as `unmeasured`, never counted as zero cases, because a published zero
 * is a claim about evidence nobody read (Story 3).
 */
const readSet = (text: string, path: string): EvalSet | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const decoded = decodeOrFail(decodeSync(EvalSet), parsed, path)
  if (!isOk(decoded)) return null
  return decoded.value.cases.length === 0 ? null : decoded.value
}

/**
 * Per-collection case counts, keyed by the citation's collection.
 *
 * The citation, not the anchor. A case's `anchorId` is the record it quotes, which for
 * `identifier_unresolved` and `collection_ambiguous` is not the collection the citation names, and
 * `collection_ambiguous` names none at all — so counting anchors would answer "which records are
 * quoted" while this rule must answer "which book was this fabrication attempted against".
 *
 * Returned as a `Map` and read by key rather than as an object, so a collection named `constructor`
 * or `toString` is an ordinary key. Collection names arrive from an ingest source, so they are
 * untrusted input (AGENTS.md section 1) and a plain object would have turned one name into a
 * prototype lookup.
 */
export const collectionCountsOf = (set: EvalSet): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const entry of set.cases) {
    const collection = entry.citation.collection
    if (!COLLECTION_NAME.test(collection)) continue
    counts.set(collection, (counts.get(collection) ?? 0) + 1)
  }
  return counts
}

/** `collection count` for the finding message, so one report names the numbers and not just the names. */
const detailOf = (counts: ReadonlyMap<string, number>, below: readonly string[]): string =>
  below.map((collection) => `${collection} ${counts.get(collection) ?? 0}`).join(", ")

/**
 * The cases in a fabrication set that do not expect `rejected`.
 *
 * ## Why this is asserted rather than assumed
 *
 * Every case in `redteam-fabricated.json` is a quote the set was built by mutating a real span, and
 * every one of them declares `expectedVerdict: "rejected"`. Nothing in the *schema* requires that: a
 * hand-editable artefact could carry a case expecting `verified`, and then the per-collection
 * `Rejected<C>` / `Verified<C>` figures would be reporting a fixture's own wish rather than a
 * measurement — a case whose expectation the verifier was developed against, which is the
 * self-fulfilling shape AGENTS.md section 1 exists to prevent.
 *
 * So the invariant is a finding. `Rejected<C> == Cases<C>` and `Verified<C> == 0` are then derived
 * from a check that ran, which is the only difference between a derived figure and a retyped one.
 *
 * Ids, not quotes, in the message (AGENTS.md section 13).
 */
const fabricationsNotRejected = (set: EvalSet): readonly string[] =>
  set.cases.filter((entry) => entry.expectedVerdict !== "rejected").map((entry) => entry.id)

/**
 * The coverage finding, or nothing.
 *
 * @param served the collections `attestation.json` authorises, from `servedCollections`.
 * @param usable whether that attestation exists AND names its collections; `false` means a corpus
 *   was claimed and cannot be enumerated.
 * @param text the committed set's text, or `null` when the repository has none.
 */
export const checkCollectionCoverage = (
  served: ReadonlySet<string>,
  usable: boolean,
  text: string | null,
  path: string = COVERAGE_SET,
): readonly DocsClaim[] => {
  // A present-but-unusable attestation is a claim that failed to be kept, so it fails closed. An
  // ABSENT attestation (`usable: true`, no served collections) has claimed no corpus and is skipped,
  // which is why this reads `!usable` and not `served.size === 0`: the latter is also true for a
  // repository that ships no corpus, and failing that would punish a fork for a file it never
  // claimed to carry — the same line R18 and `checkSnapshotArithmetic` draw at *claiming*.
  if (!usable) {
    return [claim("eval-coverage-unmeasured", path, `${COVERAGE_SET} cannot be checked: attestation.json records no usable collection, so coverage of the served set is unmeasured, not satisfied`)]
  }
  if (served.size === 0 || text === null) return []
  const set = readSet(text, path)
  if (set === null) {
    return [claim("eval-artefact-unreadable", path, `${path} could not be decoded as an EvalSet with cases, so its per-collection coverage is unmeasured rather than zero`)]
  }
  const counts = collectionCountsOf(set)
  // The other direction, and the one that used to have no rule at all.
  //
  // Above floor answers "is every served book asked about". This answers "is every book the set asks
  // about one this corpus serves". A case naming a collection the attestation does not list is a case
  // that cannot have been checked against anything: the verifier resolves against served records, so the
  // case either verified for the wrong reason or was never validated. Either way `40/40` over the set
  // would be counting an experiment nobody ran, and reporting it as zero cases — which is what a
  // served-only sweep naturally does with it — would publish a number about nothing as if it were
  // evidence. Fail closed and say which collection.
  const unserved = [...counts.keys()].filter((collection) => !served.has(collection)).sort()
  const below = [...served].filter((collection) => (counts.get(collection) ?? 0) < FABRICATION_COVERAGE_FLOOR).sort()
  const notRejected = fabricationsNotRejected(set)
  // Both are collected rather than returned from the first test that fires, because a set can be wrong
  // in both directions at once — a case for a book this corpus does not serve *and* a served book never
  // asked about — and a single early return would hide the second defect until the first was fixed. One
  // run through the gate, both facts. `unserved` is ordered first because it is the more severe: a case
  // that was never resolved against anything is not a thin measurement, it is not a measurement.
  const findings: DocsClaim[] = []
  if (unserved.length > 0) {
    findings.push(
      claim(
        "eval-coverage-unserved-collection",
        path,
        `${path} carries cases for ${unserved.join(", ")}, which ${"attestation.json"} does not list among the served collections, so those cases cannot have been resolved against served records and a coverage rate over them measures nothing`,
      ),
    )
  }
  if (notRejected.length > 0) {
    findings.push(
      claim(
        "eval-fabrication-not-rejected",
        path,
        `${path} carries ${notRejected.length} case(s) that do not declare \`rejected\` (${notRejected.slice(0, 5).join(", ")}), so this is a set of fabrications only if every one of them does; a case the verifier is expected to confirm cannot measure containment`,
      ),
    )
  }
  if (below.length === 0) return findings
  findings.push(
    claim(
      "eval-coverage-below-floor",
      path,
      `${path} carries ${detailOf(counts, below)} against a floor of ${FABRICATION_COVERAGE_FLOOR} cases per served collection; a fabricator is only shown to be contained if it was asked about that collection`,
    ),
  )
  return findings
}

/** The measurement artefact, as text, or `null` when the repository ships none. */
export type CoverageArtefact = {
  readonly path: string
  readonly text: string | null
}

/**
 * What the artefact records about coverage: which collections it names, and a `column -> figure` map
 * for each of them.
 *
 * `cells` is keyed by the **markdown header** a table column would carry (`cases`, `top-5`, `rejected`,
 * `verified`), which is what lets `checkCoverageTableRows` compare a document's cell against the
 * artefact without either side owning a second copy of the key vocabulary. `readFigures` in the gate
 * walks top-level numbers only, so these are flat top-level keys by construction (AGENTS.md §17).
 *
 * `null` when the artefact cannot answer, which is a finding rather than a skip: the documents audited
 * here carry presence figures, so "the file that would have told us which collection this number is
 * about is missing" is a statement about the repository (AGENTS.md §3).
 *
 * ## Why per-collection cells are kept apart from the total
 *
 * Because the two denominators mean different things, and `checkPresenceCollectionNamed` treats them
 * differently. `2 of 2` is a claim about quran and about tirmidhi and about nothing else;
 * `40 of 40` is a claim about the whole measured set. Folding them into one list of numbers would let
 * the rule see only "a denominator the artefact knows" and lose the ability to tell an aggregate sentence
 * that names one collection from a per-collection sentence that names its own.
 */
type RecordedCoverage = {
  readonly collections: readonly string[]
  readonly cells: ReadonlyMap<string, ReadonlyMap<string, number>>
  readonly total: number | null
}

/** The three count families `--record` writes per collection. Order is the declaration order. */
const FIGURE_FAMILIES = [
  ["suggestionCoverageCases", "cases"],
  [VERDICT_KEY_PREFIX.rejected, "rejected"],
  [VERDICT_KEY_PREFIX.verified, "verified"],
] as const

/** `suggestionCoveragePresenceTop<N><Collection>` — the cut-off is a number, the name starts uppercase. */
const PRESENCE_FIGURE_KEY = /^suggestionCoveragePresenceTop(\d+)([A-Z][a-z0-9_]*)$/

/**
 * The column and collection a recorded key names, or `null` when it names neither.
 *
 * The collection comes back lower-cased. The artefact capitalises the first letter because
 * `suggestionCoverageCasesQuran` reads better in JSON than `...casesquran`, while a document writes
 * collection names the way the corpus does, in lower case — so without folding the suffix here the
 * ownership comparison below would ask whether a document saying "quran" contains the string "Quran",
 * which is never true, and every per-collection figure would be reported as unnamed. Collection names
 * are lowercase identifiers (`COLLECTION_NAME`), so this is exact rather than a guess about a spelling.
 */
const columnOf = (key: string): { readonly column: string; readonly collection: string } | null => {
  for (const [prefix, column] of FIGURE_FAMILIES) {
    if (!key.startsWith(prefix) || key.length === prefix.length) continue
    return { column, collection: key.slice(prefix.length).toLowerCase() }
  }
  const presence = PRESENCE_FIGURE_KEY.exec(key)
  if (presence === null) return null
  return { column: `top-${presence[1] ?? ""}`, collection: (presence[2] ?? "").toLowerCase() }
}

const readCoverageRecorded = (text: string | null): RecordedCoverage | null => {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const fields = parsed as Readonly<Record<string, unknown>>
  const collections = fields[COVERAGE_KEYS.collections]
  if (typeof collections !== "string" || collections.length === 0) return null
  const names = collections.split(",").filter((entry) => entry.length > 0)
  if (names.length === 0) return null
  const cells = new Map<string, Map<string, number>>()
  for (const [key, value] of Object.entries(fields)) {
    const named = columnOf(key)
    if (named === null || typeof value !== "number" || !Number.isFinite(value)) continue
    const row = cells.get(named.collection) ?? new Map<string, number>()
    row.set(named.column, value)
    cells.set(named.collection, row)
  }
  const rawTotal = fields[COVERAGE_KEYS.totalCases]
  const total = typeof rawTotal === "number" && Number.isFinite(rawTotal) ? rawTotal : null
  return { collections: names, cells, total }
}

/** One collection's recorded figure for one column, or `null` when nothing was recorded under it. */
const recordedCell = (recorded: RecordedCoverage, collection: string, column: string): number | null =>
  recorded.cells.get(collection)?.get(column) ?? null

/** One collection's case count — the denominator `checkPresenceCollectionNamed` reasons about. */
const recordedCases = (recorded: RecordedCoverage, collection: string): number | null =>
  recordedCell(recorded, collection, "cases")

/** Every collection's case count, for a message that names the numbers it cannot otherwise check. */
const recordedCaseCounts = (recorded: RecordedCoverage): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const [collection, row] of recorded.cells) {
    const cases = row.get("cases")
    if (cases !== undefined) counts.set(collection, cases)
  }
  return counts
}

/**
 * The word that makes a fraction a presence claim.
 *
 * Deliberately not a bare `\d+/\d+`: rule ten already judges every benchmark figure in the document by
 * quantity, and a second rule that fired on any fraction in the file would double-report the same
 * sentence and train its readers to skip it.
 */
const PRESENCE_WORD = /\b(?:presence|recall)\b/i

/** One stated fraction on one line. `matchAll` clones the pattern, so a module-level `g` regex is safe here. */
const PRESENCE_FRACTION = /(\d+)\s*(?:of|\/)\s*(\d+)/g

/**
 * R21b, artefact half — the artefact records which set a presence figure could be over.
 *
 * ## Why this is a separate rule rather than a branch inside the document rule
 *
 * The first version of `checkPresenceCollectionNamed` returned the "cannot be checked" finding itself,
 * which meant a repository whose `vs-search.json` predates this rule produced **ten identical findings**,
 * one per audited document — and each of them named the *document* as the thing at fault. Both halves of
 * that are wrong. The ten documents were fine; `data/benchmark/vs-search.json` had stopped being the
 * record of anything. And a gate that reports one defect ten times teaches its reader to look for the
 * one line that matters, which is the opposite of a gate.
 *
 * So the artefact question is asked once, here, against the artefact, and the document rule answers only
 * what it can answer. `checkCollectionCoverage` above splits the same way: one finding naming the missing
 * evidence, one rule naming the document that over-claimed.
 *
 * ## Why it takes the audited documents, and what that changed
 *
 * The first version asserted its own premise — "the audited documents state presence and recall figures"
 * — without reading them. It was wrong, and the fixture trees proved it: a tree whose documents state no
 * such figure was told it had an unattributable figure, which is a finding about a document that does not
 * exist. A rule that invents its premise is a rule that cannot be trusted to report what it found, and the
 * cost is not the false finding — it is that every other finding from the same run inherits the doubt.
 *
 * So `documents` goes in, and `statesPresenceFigure` — the same predicate the document rule scans with,
 * in this same module, so there is one definition of what a presence figure *is* (AGENTS.md §17) rather
 * than a second regex somewhere that could agree until the day it did not.
 */
export const checkPresenceCoverageRecorded = (
  artefact: CoverageArtefact,
  documents: readonly { readonly document: string; readonly text: string }[],
): readonly DocsClaim[] => {
  if (readCoverageRecorded(artefact.text) !== null) return []
  const naming = documents.filter((entry) => statesPresenceFigure(entry.text)).map((entry) => entry.document)
  if (naming.length === 0) return []
  return [
    claim(
      "presence-coverage-unrecorded",
      artefact.path,
      `${artefact.path} records no \`${COVERAGE_KEYS.collections}\`, so the collection each figure in ${naming.join(", ")} is over cannot be named or checked; run \`bun run eval:suggestions --record\``,
    ),
  ]
}

/**
 * Whether this text states a presence or recall figure at all.
 *
 * Exported because the artefact rule needs to know whether there is anything to attribute before it
 * demands that the artefact record attribution. One predicate, two callers, no second definition.
 */
export const statesPresenceFigure = (text: string): boolean => {
  for (const line of text.split("\n")) {
    if (!PRESENCE_WORD.test(line)) continue
    if (line.match(PRESENCE_FRACTION) !== null) return true
  }
  return false
}

/**
 * R21b, document half — a presence or recall figure names the collection it is over, and a denominator
 * that exists.
 *
 * ## Why this is not arithmetic
 *
 * `checkBenchmarkClaimUnbacked` (rule ten) already compares stated figures to the artefact. This rule
 * asks a question arithmetic cannot: **which set is the number about?** `40 of 40` is true of the
 * 40-case set and equally true of a 4,000-case set, so no comparison can tell a reader whether the
 * denominator is the whole corpus or three books. The corpus is 27,234 records across six collections
 * and the case set is 40 fabrications across the same six; a figure that reads as the first while
 * measuring the second is the over-claim this repository exists to prevent, and it is invisible to every
 * other rule here because it is not a wrong number.
 *
 * ## What it requires, and why both halves
 *
 * A collection the artefact recorded, and a denominator equal to a case count the artefact published —
 * `suggestionCoverageCases<Collection>` or the aggregate `suggestionCaseCount`. Both halves, because each
 * alone is satisfied by a sentence that means nothing: naming `quran` beside a `40 of 40` measured
 * over all six is still corpus-wide, and `quran: 2 of 2` names a real denominator the corpus does not
 * have. Requiring a recorded case count is also the edge case the story names — three cases cannot carry
 * a percentage sentence, and a denominator no committed set has is the mechanical form of that.
 *
 * ## Why an unanswerable artefact skips rather than fires here
 *
 * Because `checkPresenceCoverageRecorded` has already reported the missing artefact, once, against the
 * file that lacks it. Firing per document as well would say the same thing ten times and bury the one
 * finding that names the cause.
 *
 * ## What it does not do, stated rather than implied
 *
 * It does not verify that a per-collection sentence's hit count matches the artefact; rule ten owns figure
 * comparison and this rule adds no second arithmetic. And a document that names one collection per line
 * with an aggregate figure beside it satisfies the rule — the table underneath is what carries the rest,
 * and a mechanical rule cannot tell a table row from a sentence without becoming a markdown parser.
 */
export const checkPresenceCollectionNamed = (
  document: string,
  file: string,
  artefact: CoverageArtefact,
): readonly DocsClaim[] => {
  const recorded = readCoverageRecorded(artefact.text)
  if (recorded === null) return []
  const findings: DocsClaim[] = []
  for (const line of document.split("\n")) {
    if (!PRESENCE_WORD.test(line)) continue
    for (const match of line.matchAll(PRESENCE_FRACTION)) {
      const finding = attributionFinding(file, line, match[0].trim(), Number(match[2]), recorded, artefact.path)
      if (finding !== null) findings.push(finding)
    }
  }
  return findings
}

/**
 * What one stated fraction is missing, or `null` when it is fully attributed.
 *
 * ## The two denominator kinds, and why they are not the same check
 *
 * `40 of 40` has `40` as its denominator, and `40` is the aggregate `suggestionCaseCount` — the whole
 * measured set. `2 of 2` has `2`, which is quran's count and tirmidhi's. So the denominator alone tells
 * the rule which kind of sentence it is looking at, and each kind has one honest spelling:
 *
 *  - **Aggregate.** Every recorded collection must be named. Naming one beside an aggregate is worse than
 *    naming none, because `40 of 40 … quran` reads as a claim about quran while being a claim about six
 *    books, and that is the over-claim this rule was written for.
 *  - **Per-collection.** A collection whose recorded count *is* that denominator must be named. `quran` and
 *    `tirmidhi` both recorded 2 cases, so either name is an honest attribution and requiring both would
 *    fail a true sentence. Requiring *some* recorded collection instead — the obvious weaker rule — is
 *    what lets `15 of 15 … tirmidhi` through, attributing a figure to a collection that has 2 cases.
 *
 * This is attribution, not arithmetic: which set the number is about. Rule ten compares quantities and is
 * not re-run here (AGENTS.md §17 — one owner per fact).
 */
const attributionFinding = (
  file: string,
  line: string,
  stated: string,
  denominator: number,
  recorded: RecordedCoverage,
  path: string,
): DocsClaim | null => {
  if (denominator === recorded.total) {
    const unnamed = recorded.collections.filter((collection) => !line.includes(collection))
    if (unnamed.length === 0) return null
    return claim(
      "presence-claim-unbacked",
      file,
      `states "${stated}" over the whole measured set but names no collection for ${unnamed.length} of the ${recorded.collections.length} recorded collections (${unnamed.join(", ")}), so the figure reads as corpus-wide`,
    )
  }
  const counts = recordedCaseCounts(recorded)
  const owners = [...counts].filter(([, count]) => count === denominator).map(([collection]) => collection)
  if (owners.length === 0) {
    const known = [...counts.values()]
    return claim(
      "presence-claim-unbacked",
      file,
      `states recall or presence "${stated}" over a denominator no committed case set has; ${path} records per-collection case counts ${known.join(", ")} and a total of ${recorded.total ?? "none"}`,
    )
  }
  if (owners.some((collection) => line.includes(collection))) return null
  return claim(
    "presence-claim-unbacked",
    file,
    `states "${stated}", a denominator that belongs to ${owners.join(" and ")}, without naming either; ${path} records those case counts`,
  )
}

/* ------------------------------------------------------------------ *
 * R21d — the table half: a published coverage table row agrees with the artefact.
 *
 * The gap `checkPresenceCollectionNamed` cannot close, stated as the shape of the hole:
 * it scans for a line carrying BOTH a presence/recall word and a fraction. A markdown table row
 * carries neither — `| quran | 2 | 2 | 2 | 2 | 2 |` is bare integers in cells, with the word
 * "presence" in the header and the slash in the header too. So every figure in the per-collection
 * table that was supposed to make the case counts attributable was, to the sentence rule, invisible.
 *
 * The consequence was not a missing finding. It was a table nobody checked: the row could state
 * `15` for tirmidhi — whose 15 was abudawud's count — and the aggregate `40 of 40` above it would
 * still verify, still name all six collections, still be true. The one place a reader can see which
 * book a number belongs to was the one place with no rule on it.
 * ------------------------------------------------------------------ */

/** One `|`-delimited row's cells, or `null` when the line is not a table row at all. */
const tableCells = (line: string): readonly string[] | null => {
  const trimmed = line.trim()
  if (!trimmed.startsWith("|")) return null
  return trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim())
}

/**
 * A stated figure in one cell: a bare count, or a count over a denominator.
 *
 * A cell that is not a figure — `measured`, `measured zero — no figure published`, `—` — matches
 * nothing and is skipped by the row check. That is deliberate and is the whole reason this rule can
 * be applied to a table that documents its own unmeasured rows honestly: a word is a statement that
 * no number was published, and a word has nothing to disagree with. Only digits make a claim.
 */
const STATED_FIGURE = /^(\d+)(?:\s*(?:\/|of)\s*(\d+))?$/

type CoverageTable = {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

/**
 * Every table in `document` whose header row names a `collection` column.
 *
 * ## Why the header has to be read rather than guessed
 *
 * Cell positions are not stable across the two documents that publish this table, and neither one
 * should have to match the other's column order for a gate to work: `docs/value-proof.md` carries
 * `collection | cases | served records | coverage`, `docs/specs/measurements.md` carries
 * `collection | cases | top-1 | top-3 | top-5 | served records`. Matching on a header *name* means the
 * rule states what a column means; matching on an index means every reordering of a document silently
 * turns six checks into six skipped ones, which is the ADR-10 shape again.
 *
 * ## Why the separator row cannot be mistaken for data
 *
 * Because it is all `---` and `-`, and `STATED_FIGURE` matches neither: `COLLECTION_NAME` rejects
 * `---` as a first cell, so the separator and every `| --- |` filler row in either document is
 * skipped by the collection test before any cell is read.
 */
const coverageTables = (document: string): readonly CoverageTable[] => {
  const tables: CoverageTable[] = []
  let headers: readonly string[] | null = null
  let rows: string[][] = []
  const close = (): void => {
    if (headers === null) return
    tables.push({ headers, rows })
    headers = null
    rows = []
  }
  for (const line of document.split("\n")) {
    const cells = tableCells(line)
    if (cells === null) {
      close()
      continue
    }
    if (headers === null) {
      if ((cells[0] ?? "").toLowerCase() !== "collection") continue
      headers = cells.map((cell) => cell.toLowerCase())
      continue
    }
    rows.push([...cells])
  }
  close()
  return tables
}

/**
 * R21d, artefact half — a coverage table's rows agree with the figures `--record` wrote.
 *
 * ## What it checks, and what it deliberately does not
 *
 * Per row, per column that states a number:
 *
 *  - the **numerator** against the artefact's figure for that column;
 *  - the **denominator** of a `n/m` cell against that collection's recorded case count;
 *  - a **row naming a collection the artefact never recorded**, which is a stale row left behind by a
 *    removed collection — the one direction that needs the served set to distinguish from a collection
 *    that is served and honestly unmeasured.
 *
 * It does not check the `coverage` column's prose, does not require every recorded collection to have a
 * row (that is `presence-claim-unbacked`'s aggregate half, and a missing row is a different defect from
 * a wrong one), and does not compute a coverage rate. Rule ten owns figure comparison for the *text* of
 * a document; this rule owns the table because a table is not text the text rules can read (AGENTS.md §17).
 *
 * ## Why an unrecorded collection is a finding rather than a skip
 *
 * The document is publishing a per-collection table, and this rule's premise — stated rather than
 * asserted, the way `checkPresenceCoverageRecorded` had to learn it — is that every row in it names a
 * collection this repository measured. If that premise fails, the reader is looking at a number in a
 * column headed `cases` for a book nobody asked about, and every other figure in the table inherits the
 * doubt. When the served set is known (`servedCounts` non-empty) a row naming an unserved collection is
 * reported as a stale row; when it is not known, the rule says the collection is unrecorded rather than
 * guessing *why*, because a fork that ships no attestation has not claimed a corpus (AGENTS.md §3).
 *
 * @param servedCounts collection -> served record count, from `attestation.json`. Empty means the
 *   served set could not be enumerated, which disables only the stale-row distinction above.
 */
export const checkCoverageTableRows = (
  document: string,
  file: string,
  artefact: CoverageArtefact,
  servedCounts: ReadonlyMap<string, number> = new Map(),
): readonly DocsClaim[] => {
  const recorded = readCoverageRecorded(artefact.text)
  if (recorded === null) return []
  const findings: DocsClaim[] = []
  for (const table of coverageTables(document)) {
    for (const row of table.rows) {
      findings.push(...rowFindings(file, table.headers, row, recorded, servedCounts, artefact.path))
    }
  }
  return findings
}

const rowFindings = (
  file: string,
  headers: readonly string[],
  row: readonly string[],
  recorded: RecordedCoverage,
  servedCounts: ReadonlyMap<string, number>,
  path: string,
): readonly DocsClaim[] => {
  const collection = row[0] ?? ""
  // `---` and every other filler cell fails this, which is how a separator row is skipped.
  if (!COLLECTION_NAME.test(collection)) return []
  if (recorded.cells.has(collection)) return cellFindings(file, headers, row, recorded, servedCounts, path, collection)
  return unrecordedRowFindings(file, headers, row, recorded, servedCounts, path, collection)
}

/** A row whose collection the artefact did record: compare every cell that states a number. */
const cellFindings = (
  file: string,
  headers: readonly string[],
  row: readonly string[],
  recorded: RecordedCoverage,
  servedCounts: ReadonlyMap<string, number>,
  path: string,
  collection: string,
): readonly DocsClaim[] => {
  const cases = recordedCases(recorded, collection)
  const findings: DocsClaim[] = []
  for (const [index, header] of headers.entries()) {
    if (index === 0) continue
    const stated = STATED_FIGURE.exec(row[index] ?? "")
    if (stated === null) continue
    const figure = columnFigure(recorded, servedCounts, collection, header)
    if (figure === null) continue
    const numerator = Number(stated[1])
    const denominator = stated[2]
    const wrongNumerator = numerator === figure ? [] : [
      claim(
        "presence-row-stale",
        file,
        `states ${numerator} for \`${collection}\` in its \`${header}\` column; ${path} records ${figure}`,
      ),
    ]
    // `served records` is not over a case count, so a denominator beside it is not this rule's business.
    const wrongDenominator = denominator === undefined || cases === null || header === SERVED_RECORDS_COLUMN
      ? []
      : Number(denominator) === cases
        ? []
        : [
            claim(
              "presence-row-stale",
              file,
              `states "${stated}" for \`${collection}\`; ${path} records ${cases} cases in that collection, so the denominator of that column is ${cases}`,
            ),
          ]
    findings.push(...wrongNumerator, ...wrongDenominator)
  }
  return findings
}

/** `served records` reads from the attestation rather than the artefact — see `columnFigure`. */
const SERVED_RECORDS_COLUMN = "served records"

/** The `cases` column, whose header is `FIGURE_FAMILIES`' first entry rather than a bare literal. */
const CASES_COLUMN = "cases"

/**
 * The figure a column's header names, from whichever source owns it.
 *
 * `served records` is a corpus size, not a measurement of ours, so it comes from the attestation's
 * collection counts — the same source `checkCollectionCoverage` uses to decide which collections exist,
 * and therefore the same number a reader would recompute from the corpus itself. Everything else is a
 * recorded measurement. A header this table does not publish a figure for (`coverage`) resolves to
 * `null` and is skipped, so adding a column to a document cannot invent a finding.
 */
const columnFigure = (
  recorded: RecordedCoverage,
  servedCounts: ReadonlyMap<string, number>,
  collection: string,
  header: string,
): number | null => {
  if (header === SERVED_RECORDS_COLUMN) return servedCounts.get(collection) ?? null
  return recordedCell(recorded, collection, header)
}

/**
 * A row for a collection the artefact never recorded.
 *
 * Two findings are possible and they mean different things:
 *
 *  - the row states a **measurement** number, which no artefact supports — the defect CR-1 was about,
 *    and the one that cannot be explained away by a missing attestation;
 *  - the row states only **words**, for a collection the served set does not include — a stale row
 *    whose collection was removed. Reported only when the served set is actually known, because an
 *    unknown served set is not evidence that a collection was removed.
 *
 * A row of words for a served-but-unmeasured collection is the honest form, and is the shape
 * `coverageTables`'s `STATED_FIGURE` skip exists to let through.
 *
 * `cases` and `served records` are excluded from the digit test, and that exclusion is a correctness
 * requirement rather than a convenience. `renderCoverage` prints `| nasai | 0 | zero | ... |` for a
 * served-but-unmeasured collection, so the `cases` cell of an unrecorded row is definitionally `0` and
 * comparing it against a recorded figure it does not have would fail the very row that documents its
 * own absence honestly. `served records` is a corpus size owned by the attestation rather than a
 * measurement of ours; including it would make a repository that ships no attestation fail every
 * unmeasured row for the corpus size it legitimately knows. What is left — `top-N`, `rejected`,
 * `verified` — is where a fabricated number would actually be pasted.
 */
const unrecordedRowFindings = (
  file: string,
  headers: readonly string[],
  row: readonly string[],
  recorded: RecordedCoverage,
  servedCounts: ReadonlyMap<string, number>,
  path: string,
  collection: string,
): readonly DocsClaim[] => {
  const stated = headers
    .slice(1)
    .map((header, offset) => ({ header, cell: row[offset + 1] ?? "" }))
    .filter((entry) => entry.header !== SERVED_RECORDS_COLUMN && entry.header !== CASES_COLUMN)
  const known = recorded.collections.length === 0 ? "no collection" : recorded.collections.join(", ")
  if (stated.some((entry) => STATED_FIGURE.test(entry.cell))) {
    return [
      claim(
        "presence-row-stale",
        file,
        `states figures for \`${collection}\`, which no committed run measured; ${path} records ${known}, so every figure in that row is unsupported`,
      ),
    ]
  }
  if (servedCounts.size === 0 || servedCounts.has(collection)) return []
  return [
    claim(
      "presence-row-stale",
      file,
      `carries a row for \`${collection}\`, which attestation.json does not list among the served collections, so it is a stale row from a collection this repository no longer serves`,
    ),
  ]
}

export * as DocsCoverage from "./docs-coverage.ts"