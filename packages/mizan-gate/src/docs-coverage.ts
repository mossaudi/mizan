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

/** The artefact's record of WHICH set it measured — the digest the documents must publish beside a table. */
const EVAL_SET_DIGEST_KEY = "suggestionEvalSetDigest"

/** A `ds1:` digest, in the one shape `scripts/build-eval-set.ts` writes. */
const DS1_DIGEST = /ds1:[0-9a-f]{64}/g

/** The `ds1:` digests a document states, in order and un-deduplicated. */
const statedDigests = (document: string): readonly string[] => document.match(DS1_DIGEST) ?? []

/** The artefact's recorded set digest, or `null` when the artefact cannot say. */
const recordedEvalSetDigest = (text: string | null): string | null => {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const digest = (parsed as Readonly<Record<string, unknown>>)[EVAL_SET_DIGEST_KEY]
  return typeof digest === "string" && /^ds1:[0-9a-f]{64}$/.test(digest) ? digest : null
}

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
 * The count a figure cell states, with its thousands separators removed.
 *
 * The separators are the reason this is a function rather than `Number(match[1])`. `6,236` is the
 * spelling every one of these documents uses for a corpus size, and a rule that recognised only bare
 * digits would read that cell as *not a figure at all* — which is a silent skip, not a check. The
 * published `collection | … | served records` tables happen to carry unseparated counts today, so the
 * hole is invisible until someone formats a number the way the rest of the prose does.
 */
const parseCount = (digits: string): number => Number(digits.replace(/,/g, ""))

/**
 * A stated figure in one cell: a bare count, or a count over a denominator, separators tolerated.
 *
 * A cell that is not a figure — `measured`, `measured zero — no figure published`, `—` — matches
 * nothing and is skipped by the row check. That is deliberate and is the whole reason this rule can
 * be applied to a table that documents its own unmeasured rows honestly: a word is a statement that
 * no number was published, and a word has nothing to disagree with. Only digits make a claim.
 */
const STATED_FIGURE = /^(\d{1,3}(?:,\d{3})*|\d+)(?:\s*(?:\/|of)\s*(\d{1,3}(?:,\d{3})*|\d+))?$/

/**
 * The numerator a `STATED_FIGURE` match states, or `null` when it carries no first group.
 *
 * ## Why this is a function and not `stated[1] ?? ""`
 *
 * Group 1 of `STATED_FIGURE` is mandatory, so the `undefined` branch is unreachable through the regex
 * today — which is exactly why `?? ""` sat there unexamined, and exactly why it had to go. `Number("")`
 * is `0`, so if the pattern ever gains a group before the numerator, every stale row would have been
 * reported as "states 0 for `quran`": a finding that accuses a committed, reviewed document of
 * publishing a number nobody wrote, in a rule whose entire job is to be right about such documents.
 *
 * Returning `null` lets the caller say the true thing — the rule cannot read the cell — instead of the
 * plausible thing. Exported for the self-test, because a guard nobody can watch fail has not been shown
 * to fail (AGENTS.md section 14), and the branch cannot be reached through the pattern by design.
 */
export const statedNumerator = (stated: RegExpExecArray): string | null => stated[1] ?? null

/**
 * Any digit at all, which is what separates "this cell is prose" from "this cell is a number
 * wearing a spelling no reader recognises".
 *
 * The two are not the same, and the difference is the whole of `unreadCellFindings`. A cell reading
 * `measured` states no number, so there is nothing to disagree with and the rule must stay silent. A
 * cell reading `40 of 40 (checked 2x)` states a number, and a number in a column is a claim whether
 * or not the grammar recognises its shape — so a shape the grammar misses is a finding about the
 * shape, not a reason to look away.
 */
const ANY_DIGIT = /\d/

/** One data row, with the collection it names. */
type CoverageRow = {
  readonly cells: readonly string[]
  /**
   * The corpus identifier this row is about, or `null` when its first cell resolves to no single
   * collection this repository knows.
   *
   * ## Why `null` is a finding and not a skip
   *
   * `null` used to mean "this row is not a per-collection disclosure" and was returned early by every
   * row rule, which made the whole gate removable by editing one cell. Renaming `nasai` to
   * `Sunan an-Nasa'i` — a purely cosmetic edit, the kind that happens when someone tidies a table —
   * left zero keyed rows, and every check on that table silently switched itself off while the
   * numbers stayed published. That is AGENTS.md §3's fail-open, reached through restraint: the rule
   * declining to guess which collection a display name means.
   *
   * So the guess is not made, and the silence is not either. A row resolves by *containment* when its
   * first cell names exactly one known identifier (`nasai` inside `Sunan an-Nasa'i (Nasa'i)`, `malik`
   * inside `Muwatta', Malik`), which keeps a decorated label auditable without a name-mapping. When
   * nothing matches, or two do, the row is `null` and `unkeyedRowFindings` reports it as
   * `presence-row-unkeyed` — so the repair is stated rather than assumed, and a reader who sees a
   * figure in an unkeyed row knows no gate compared it.
   */
  readonly collection: string | null
}

type CoverageTable = {
  readonly headers: readonly string[]
  readonly rows: readonly CoverageRow[]
}

/**
 * The corpus identifier a row's first cell is about, or `null`.
 *
 * ## Why a syntactically valid identifier is a key even when this repository does not serve it
 *
 * Because "unknown collection" and "not a collection" are different defects with different repairs. A
 * row keyed `bukhari` in a repository that serves no Bukhari is a **stale row** — a collection that was
 * removed, which `unrecordedRowFindings` reports against the served set. Collapsing it into `null` would
 * relabel it as unkeyed, and the repair would be "write an identifier", which the row already has.
 *
 * So the grammar decides keyhood and `known` only widens it: a cell matching `COLLECTION_NAME` is keyed
 * whatever it says, and `known` exists solely for the decorated-label case below.
 *
 * ## Why containment, and why only unambiguous containment
 *
 * Exact matching alone is what made the label rename a switch: a display name is not an identifier, so
 * every row of a legitimately decorated table resolves to `null`. Containment recovers those rows without
 * a mapping, because a cell that *contains* an identifier is naming that collection.
 *
 * Two matches is `null` rather than a choice. A cell containing `malik` and `tirmidhi` is either two
 * collections in one row or a label this rule cannot segment, and picking the first is a guess about
 * which book's figure a reader is looking at — the precise failure the old comment refused to risk.
 */
const collectionFor = (first: string, known: readonly string[]): string | null => {
  if (COLLECTION_NAME.test(first)) return first
  const haystack = first.toLowerCase()
  const contained = known.filter((id) => haystack.includes(id.toLowerCase()))
  return contained.length === 1 ? (contained[0] as string) : null
}

/**
 * Every table in `document` whose header row names a `collection` column, keyed against `known`.
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
 * `---` as a first cell and no identifier is contained in `---`, so the separator resolves to `null`
 * — and `unkeyedRowFindings` then asks whether it states a number, which it does not.
 */
const coverageTables = (document: string, known: readonly string[]): readonly CoverageTable[] => {
  const tables: CoverageTable[] = []
  let headers: readonly string[] | null = null
  let rows: CoverageRow[] = []
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
    const first = cells[0] ?? ""
    rows.push({ cells, collection: collectionFor(first, known) })
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
 *
 * ## Why an unreadable artefact no longer returns early
 *
 * This function used to begin `if (recorded === null) return []`. The intent was "no artefact, nothing
 * to compare against", and the effect was that a corrupt `vs-search.json` disarmed **every** check on
 * the document — including `unreadCellFindings`, which needs no artefact at all and only reports that
 * a column nobody reads carries figures. So the most alarming evidence state a customer can produce, a
 * broken artefact, was also the state in which the document was least examined, and the second finding
 * to appear was never a finding about the document at all.
 *
 * Now the artefact is read once, the table rules that need it are skipped when it is unreadable, and
 * the rules that do not need it run regardless. Two independent defects stay two independent findings.
 */
export const checkCoverageTableRows = (
  document: string,
  file: string,
  artefact: CoverageArtefact,
  servedCounts: ReadonlyMap<string, number> = new Map(),
): readonly DocsClaim[] => {
  const findings: DocsClaim[] = []
  // Keying happens before the artefact is read, because it does not depend on it: the served set comes
  // from `attestation.json` and the recorded set from the artefact, and a row is resolvable against
  // either. Reading the artefact first and returning early on a parse failure is what used to silence
  // this function, so the ordering here is load-bearing — see the note on `recorded` below.
  const recorded = readCoverageRecorded(artefact.text)
  const known = [...new Set([...servedCounts.keys(), ...(recorded?.collections ?? [])])].toSorted()
  for (const table of coverageTables(document, known)) {
    // Once per table, not once per row: an unreadable COLUMN is one defect, and six rows of it is the
    // "one finding reported six times" shape this module has already had to undo once (see
    // `checkPresenceCoverageRecorded`). It runs BEFORE and independently of `recorded`, because a
    // malformed artefact is one finding and a column no reader owns is another, and one of them must
    // not be able to hide the other.
    findings.push(...unreadCellFindings(file, table))
    for (const row of table.rows) {
      findings.push(...unkeyedRowFindings(file, row))
      if (recorded === null) continue
      findings.push(...rowFindings(file, table.headers, row, recorded, servedCounts, artefact.path))
    }
  }
  return findings
}

/* ------------------------------------------------------------------ *
 * R21e — fail closed on a number no rule reads.
 *
 * The gap that produced the first version of this rule, stated as a mechanism rather than a
 * mishap: `cellFindings` skipped any header it did not recognise, on the stated grounds that "adding
 * a column to a document cannot invent a finding". Probed live against the committed artefact, that
 * default is a **switch**, and the cheapest kind to flip by accident:
 *
 *   cases / top-5 / rejected / verified  -> a finding   (read)
 *   recall@5 / presence / top5 / nonsense -> NO finding (unread)
 *
 * So renaming a header — `top-5` to `top5`, or writing the metric under a name the artefact does not
 * use — silently disarmed every check on that column, and the table carried on publishing numbers
 * nobody verified. That is the fail-open AGENTS.md §3 forbids, arrived at by the one route that
 * looks like restraint: a rule declining to be wrong. It is worse than no rule, because the column
 * still looks checked.
 *
 * The replacement is one sentence, and it is the constitution's: **a number in a coverage table cell
 * is a claim, and a claim no reader reads is a finding.** Not "a number in a recognised column", and
 * not "a number this grammar happens to parse" — both of those are the same switch with more words.
 * ------------------------------------------------------------------ */

/** `served records` reads from the attestation rather than the artefact — see `columnFigure`. */
const SERVED_RECORDS_COLUMN = "served records"

/** The `cases` column, whose header is `FIGURE_FAMILIES`' first entry rather than a bare literal. */
const CASES_COLUMN = "cases"

/** `top-<N>` — the cut-off is a number, so the column name carries one. Matches the artefact's key. */
const PRESENCE_COLUMN = /^top-\d+$/

/** The headers a reader owns: `FIGURE_FAMILIES`' columns, the attestation's size column, `top-N`. */
const isReadColumn = (header: string): boolean =>
  PRESENCE_COLUMN.test(header) || header === SERVED_RECORDS_COLUMN || FIGURE_FAMILIES.some(([, column]) => column === header)

/**
 * Columns whose cells are words, each with the reason no reader needs one.
 *
 * A declaration rather than an inference, because the alternative is a rule that has to guess whether
 * an unrecognised header is a rate, a label or a figure — and a guess here is the switch. To add a
 * prose column, add its name here with the sentence that explains why it carries no number; to add a
 * *figure* column, add a reader that says which artefact field it is, and the two lists cannot both
 * claim the same header because a name in either is a name checked in neither.
 *
 * ## Why the reasons are exported
 *
 * Because a reason that is written once and never read is a comment with a runtime cost, and this is
 * the one place in the module where a comment does real work: a prose column is an *exemption*, and an
 * exemption nobody can check is how a rule gets switched off one column at a time. So the declaration is
 * exported, `columnFinding` prints the reason whenever a declared prose column turns out to carry a
 * number, and `docs-coverage.test.ts` asserts each reason names the artefact field or constant that
 * grounds it — so an entry cannot be added with an excuse that no artefact backs, and an entry whose
 * grounding is renamed goes red instead of quietly excusing itself forever.
 *
 * ## Why a digit in a declared prose column is a finding rather than a skip
 *
 * The declaration is about the *column*; the digit is in the *cell*, and the two have drifted. Before
 * this, `PROSE_COLUMNS[header] !== undefined` returned `null` before the digit was ever looked at, which
 * made a prose column the one header shape where a number is checked by nothing — the exact inverse of
 * the rule the same function exists to enforce, and the same fail-open the module has had to undo twice.
 * The cell is now read on its own terms: `measured` is prose and stays silent, `measured 90%` is a claim
 * no reader owns, and the finding says so *and* quotes the declaration that would otherwise excuse it,
 * because a person facing that choice needs both halves — whether to reword the cell or to withdraw the
 * exemption.
 */
export const PROSE_COLUMNS: Readonly<Record<string, string>> = {
  coverage:
    "the row's coverage state (`measured`, or the reason it is not), which is prose by construction: a rate has no integer in the artefact to be compared against, and the floor that produces the state is `FABRICATION_COVERAGE_FLOOR`, asserted per collection by `checkCollectionCoverage`",
}

/**
 * Every number in this table that no reader will compare, as one finding per offending column.
 *
 * Two escapes, one rule id, because the repair is the same in both cases: write the cell so a rule can
 * read it. A column no reader owns (`recall@5`, `top5`, `nonsense`) carries numbers nothing checks; a
 * cell whose spelling the grammar misses (`40 of 40, twice`) carries a number the reader is present for
 * but cannot parse. Both were silent before this rule, and both are the same defect seen from two sides.
 *
 * ## Why the scope is the table's keyed rows and not its headers
 *
 * The rule is R21e's own: **a number in a coverage table cell is a claim, and a claim no reader reads is
 * a finding.** Narrowing it to tables that declare a column a reader owns would be a second, quieter
 * version of the switch `CoverageRow.collection` describes — "no recognised header" becomes "no finding",
 * which is the fail-open this module has already had to undo twice.
 *
 * The one condition that does silence this rule is a table in which *no* row resolves to a collection,
 * and that is not a silence: every such row that states a number is reported by `unkeyedRowFindings`
 * instead, with a different and more specific message. So the two halves together leave no edit that
 * turns a populated table unchecked — a label rename moves the finding from "no reader owns that column"
 * to "no rule can tell which collection that is", and both name the repair.
 *
 * Every row is scanned, keyed or not. Leaving unkeyed rows out of the sample would mean a table whose
 * labels are all wrong reports its worst column as clean, which is the one conclusion this module must
 * not reach.
 */
const unreadCellFindings = (file: string, table: CoverageTable): readonly DocsClaim[] => {
  if (table.rows.every((row) => row.collection === null)) return []
  const findings: DocsClaim[] = []
  for (const [index, header] of table.headers.entries()) {
    if (index === 0) continue
    const finding = columnFinding(file, header, table.rows, index)
    if (finding !== null) findings.push(finding)
  }
  return findings
}

/**
 * A row that states a number and resolves to no single collection, as one finding.
 *
 * ## Why an unkeyed row with figures is a finding
 *
 * Because the alternative is the switch this rule exists to remove. A row whose label names no known
 * collection has no collection to compare against, so every per-row check returns `[]` and the row's
 * figures are published unchecked — silently, with no rule even having looked.
 *
 * ## Why there is no header-based exemption here
 *
 * An earlier attempt scoped this to tables declaring a recognised measurement column, on the reasoning
 * that `README.md`'s corpus inventory declares none. That exemption is exactly the thing to be suspicious
 * of: a table can drop its measurement columns one edit at a time and land in the exempt region with all
 * its numbers intact. The inventory turned out to be checkable — its record counts are the attestation's,
 * and it now names the identifiers they are keyed on — so the exemption bought nothing and cost the
 * audit.
 *
 * The separator row is not a false positive: it is `---`, which states no number, which is the same test
 * that keeps a row of honest prose (`measured`, or the reason it is not) quiet.
 */
const unkeyedRowFindings = (file: string, row: CoverageRow): readonly DocsClaim[] => {
  if (row.collection !== null) return []
  const example = row.cells.slice(1).find((cell) => ANY_DIGIT.test(cell)) ?? null
  if (example === null) return []
  return [
    claim(
      "presence-row-unkeyed",
      file,
      `publishes "${example}" in a row whose first cell, "${row.cells[0] ?? ""}", is not a corpus identifier and names no known collection, so no rule can tell which collection those figures belong to; write the identifier the corpus and the attestation key on in the first cell — \`quran\`, \`nasai\`, \`abudawud\`, \`ibnmajah\`, \`tirmidhi\`, \`malik\` — optionally followed by the display name`,
    ),
  ]
}

/**
 * The first cell that states a number in a shape `STATED_FIGURE` cannot parse, or `null`.
 *
 * The pair of tests, not one: `ANY_DIGIT` alone would fire on every prose cell, and `STATED_FIGURE`
 * alone is the switch this rule exists to remove.
 */
const unparsedFigure = (cells: readonly string[]): string | null =>
  cells.find((cell) => ANY_DIGIT.test(cell) && STATED_FIGURE.exec(cell) === null) ?? null

const columnFinding = (
  file: string,
  header: string,
  rows: readonly CoverageRow[],
  index: number,
): DocsClaim | null => {
  const cells = rows.map((row) => row.cells[index] ?? "")
  const read = isReadColumn(header)
  // Read and unread columns fail for different reasons, and only the read one gets to complain about
  // grammar. In a read column the reader is present and the *shape* is wrong (`40 of 40, twice`). In an
  // unread column the reader is absent, so any digit is the finding — and `ANY_DIGIT`, not
  // `STATED_FIGURE`, because the module's own rule above says "a number in a coverage table cell is a
  // claim": `100.0%`, `+35.0 pp`, `0.65`, `-3` and `644 ms` are numbers no reader owns, and matching
  // only bare counts would let a document hide every figure behind a `%` or a unit and still pass
  // `checkEvalBreadth`, which is precisely the fail-open shape R21e was written to close.
  const example = read ? unparsedFigure(cells) : cells.find((cell) => ANY_DIGIT.test(cell)) ?? null
  if (example === null) return null
  if (read) {
    return claim(
      "presence-cell-unread",
      file,
      `states "${example}" in its \`${header}\` column, which carries a number in a shape no rule reads; write it as the bare count the artefact records, because a figure no reader can parse is unchecked exactly as much as a column no reader owns`,
    )
  }
  const prose = PROSE_COLUMNS[header]
  if (prose === undefined) {
    return claim(
      "presence-cell-unread",
      file,
      `publishes figures in its \`${header}\` column, and no rule reads that column: \`${READ_COLUMN_NAMES}\` are read, \`${Object.keys(PROSE_COLUMNS).join("`, `")}\` is declared prose, and anything else is a number this repository will not check. Rename the header to one a rule reads, or state the cell in words`,
    )
  }
  // Declared prose, and a cell carries a number — `example` is non-null here, because the check above
  // returned on silence. That is a real finding, and the reason is quoted in it: a person deciding
  // between rewording the cell and withdrawing the exemption needs to read the exemption, and this
  // module's own documentation says a reason nobody can read is not one.
  return claim(
    "presence-cell-unread",
    file,
    `states "${example}" in its \`${header}\` column, which is declared prose — ${prose}. So either write the cell as the word the column is for, or drop the declaration and add the reader that owns the number; this repository will not check a figure whose column says on its own that nobody needs to`,
  )
}

/** The readable headers, for the message above. One list, so the rule names what it accepts. */
const READ_COLUMN_NAMES = `\`${FIGURE_FAMILIES.map(([, column]) => column).join("`, `")}\`, \`${SERVED_RECORDS_COLUMN}\`, \`top-N\``

const rowFindings = (
  file: string,
  headers: readonly string[],
  row: CoverageRow,
  recorded: RecordedCoverage,
  servedCounts: ReadonlyMap<string, number>,
  path: string,
): readonly DocsClaim[] => {
  // `null` is `---` and every other filler cell, plus any row keyed by a display name rather than a
  // corpus identifier. Both are out of this rule's scope for the same reason: there is no collection
  // to compare the figures against.
  if (row.collection === null) return []
  if (recorded.cells.has(row.collection)) return cellFindings(file, headers, row.cells, recorded, servedCounts, path, row.collection)
  return unrecordedRowFindings(file, headers, row.cells, recorded, servedCounts, path, row.collection)
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
const digits = statedNumerator(stated)
    if (digits === null) {
      // `parseCount(stated[1] ?? "")` is what stood here, and it is the worse of the two: `Number("")`
      // is `0`, so a pattern that ever gains a group before the numerator would have been reported as
      // "states 0 for `quran`" — a stale-row finding accusing a committed, reviewed artefact of
      // publishing a number nobody wrote. The honest claim is the one this module already makes for
      // every figure it cannot read — unread — which fails closed on the rule and says nothing false
      // about the row (AGENTS.md section 3). See `statedNumerator` for why the branch exists at all.
      findings.push(
        claim(
          "presence-cell-unread",
          file,
          `states "${stated[0]}" for \`${collection}\` in its \`${header}\` column, and the rule cannot read the numerator of it; the cell matches the stated-figure grammar but carries no first group, which is a defect in this rule rather than in the document`,
        ),
      )
      continue
    }
    const numerator = parseCount(digits)
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
      : parseCount(denominator) === cases
        ? []
        : [
            claim(
              "presence-row-stale",
              file,
              `states "${stated[0]}" for \`${collection}\`; ${path} records ${cases} cases in that collection, so the denominator of that column is ${cases}`,
            ),
          ]
    findings.push(...wrongNumerator, ...wrongDenominator)
  }
  return findings
}

/**
 * The figure a column's header names, from whichever source owns it.
 *
 * `served records` is a corpus size, not a measurement of ours, so it comes from the attestation's
 * collection counts — the same source `checkCollectionCoverage` uses to decide which collections exist,
 * and therefore the same number a reader would recompute from the corpus itself. Everything else is a
 * recorded measurement, and a header this table does not publish a figure for resolves to `null` and
 * is left to `unreadCellFindings`, which reports a number in it rather than skipping it (AGENTS.md §3).
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
  // `ANY_DIGIT`, for the reason `columnFinding` gives: whether this row states `40` or `0.65` or
  // `644 ms`, it states a number no run measured. Grammar has no vote here — the collection is
  // missing from the artefact either way, so the question is only *what* the row claims, never
  // whether the claim is spelled in a shape this file happens to parse.
  if (stated.some((entry) => ANY_DIGIT.test(entry.cell))) {
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

/**
 * A per-collection table must name the dataset it decomposed, and the name must be the committed one.
 *
 * ## Why a table of per-collection counts is not self-describing
 *
 * `| abudawud | 15 | 15 | 0 | 5272 | measured |` is fifteen cases and no statement of which fifteen. Any
 * 40-case set spread over six collections in a different proportion produces a different table, and a
 * reader has no way to tell from the table whether the numbers came from `redteam-fabricated`, from a
 * local edit to it, or from a set nobody has committed. Every other number in these documents is checked
 * against an artefact; this one was not, because the artefact did not record which set produced it —
 * and a figure whose *provenance* is unchecked is the figure a re-run cannot falsify.
 *
 * `--record` already refuses to write when the case set is not the one the baseline was measured over
 * (`suggestionEvalSetDigest`), so the artefact knows. The documents were simply never asked to say so.
 *
 * ## Why the digest is compared, not merely required
 *
 * Because "state some digest" is satisfiable by stating the wrong one, which is worse than stating
 * none: it looks like provenance while pointing somewhere else. The comparison is against the artefact's
 * own record, so the document and the artefact can only both be right or one be wrong — and which one is
 * wrong is visible in the message.
 *
 * ## Why a document with no per-collection table is silent
 *
 * Because there is nothing to attribute. A digest on a page that publishes no decomposed figure would be
 * decoration, and a rule that fires on decoration teaches its readers to ignore it (the same reasoning
 * `checkPresenceCollectionNamed` uses to stay silent on a document stating no presence figure).
 *
 * ## Why an unreadable artefact is silent here
 *
 * Because it is already somebody else's finding, reported once against the artefact rather than once per
 * document. Inventing a second report of it here would bury the line that names the right culprit — the
 * reasoning `checkPresenceCoverageRecorded` states for the same reason.
 */
export const checkMeasuredSetDigest = (document: string, file: string, artefact: CoverageArtefact): readonly DocsClaim[] => {
  const publishes = coverageTables(document, []).some((table) => table.rows.some((row) => row.collection !== null))
  if (!publishes) return []
  const recorded = recordedEvalSetDigest(artefact.text)
  if (recorded === null) return []
  const stated = statedDigests(document)
  if (stated.length === 0) {
    return [
      claim(
        "presence-set-digest-missing",
        file,
        `publishes a per-collection table of measured counts and names no \`ds1:\` dataset digest, so nothing on the page says which case set it decomposed; state the \`${recorded}\` digest of \`data/eval/redteam-fabricated.json\` beside the table, because a per-collection count without its provenance is a number no re-run can falsify`,
      ),
    ]
  }
  if (stated.includes(recorded)) return []
  return [
    claim(
      "presence-set-digest-stale",
      file,
      `publishes a per-collection table of measured counts beside ${stated.map((entry) => `\`${entry}\``).join(", ")}, and ${artefact.path} records this run's set as \`${recorded}\`; state the recorded digest, because a digest that points at another set is worse than none — it reads as provenance while pointing somewhere else`,
    ),
  ]
}

export * as DocsCoverage from "./docs-coverage.ts"