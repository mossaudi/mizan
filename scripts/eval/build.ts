import { createHash } from "node:crypto"
import {
  normalizeForMatch,
  toRecordMeta,
  type AnchorAdjudication,
  type Citation,
  type CorpusRecord,
  type CorpusRecordMeta,
  type Verdict,
  type VerdictReason,
} from "@mizan/core"
import type { Database } from "bun:sqlite"
import {
  anchorsWithSpans,
  collectionsOf,
  collectionsUsingNumber,
  containsAsciiDigit,
  containsWord,
  findSpans,
  maxNumberIn,
  recordsContaining,
  recordsWithDigits,
  rowsIn,
  type CorpusIndex,
} from "./anchors.ts"
import { arabic_indic_digits, digit_substituted, elide_middle, injection_appended, letter_transposed, replaceWord, tatweel_spacing, undiacriticized, word_inserted, SUBSTITUTIONS, type Mutation } from "./mutations.ts"
import { CASE_CLASSES, expectedCounts, type CaseClass } from "./plan.ts"

/**
 * Builds the golden and red-team case lists from the real corpus.
 *
 * Nothing in this file asks the verifier what the answer would be. Every `expectedVerdict` is
 * copied from the hand-adjudicated table in `plan.ts`, which is derived from the fold table's
 * documented behaviour. That separation is the whole reason these files are evidence rather
 * than a snapshot of current behaviour — see the header of `plan.ts`.
 */

/** A case before ids are assigned. Carries its own record so anchors can be collected as we go. */
type Built = {
  readonly classId: string
  readonly mutation: Mutation
  readonly note: string
  readonly quote: string
  readonly citation: Citation
  readonly record: CorpusRecord
  readonly expectedVerdict: Verdict
  readonly expectedReason: VerdictReason
  readonly expectedRationale: string
}

export type EvalCase = {
  readonly id: string
  readonly classId: string
  readonly mutation: Mutation
  readonly note: string
  readonly quote: string
  readonly citation: Citation
  readonly expectedVerdict: Verdict
  readonly expectedReason: VerdictReason
  readonly expectedRationale: string
  readonly anchorId: string
  /**
   * The claim's `anchor`, stamped from `CLAIM_ANCHOR_TEXTS` in `scripts/eval/anchor-texts.ts`.
   *
   * Omitted rather than null: `schema/eval.ts` declares it optional, so a case with no span would
   * be 1 line asserting the absence of a thing the reader already knows is absent. The count of
   * cases that DO carry one is what a reader is checking, and it is printed by `build:eval`.
   */
  readonly anchorText?: string
  /**
   * The human ruling from `data/eval/adjudication.json`, when one exists for this case.
   *
   * Attached beside `expectedVerdict` and never merged into it. The two answer different
   * questions — `expectedVerdict` is what the procedure must produce, `adjudicatedVerdict` is
   * what a person concluded is true of the case — and merging them would hide one behind the
   * other.
   */
  readonly adjudication?: AnchorAdjudication
}

/**
 * The corpus row a case quotes, minus `textMatch`, plus its `textHash`.
 *
 * `textMatch` is omitted on purpose and the test recomputes it with the real normalizer. If the
 * fixture shipped a pre-folded string, a tampered `textMatch` could make a fabrication verify
 * itself; deriving it at test time means the only way to fake a containment hit is to change
 * `textDisplay`, which `textHash` then catches. `toRecordMeta` is reused rather than re-declared
 * so the hash convention has one definition (AGENTS.md section 17).
 */
export type EvalAnchor = CorpusRecordMeta & { readonly textDisplay: string; readonly translation?: string }

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex")

type SpanRef = { readonly record: CorpusRecord; readonly span: string }

/* ------------------------------------------------------------------ small helpers */

const cite = (collection: string, number: string): Citation => ({ collection, number, grade: null, raw: `${collection}:${number}` })

const classById = (id: string): CaseClass => {
  const found = CASE_CLASSES.find((klass) => klass.id === id)
  if (found === undefined) throw new Error(`no case class named ${id} in plan.ts`)
  return found
}

/** The declared size of a class in one of the two sets. The two sets differ, so the set is named. */
const goldenCountOf = (id: string): number => classById(id).goldenCount
const redTeamCountOf = (id: string): number => classById(id).redTeamCount

const from = (klass: CaseClass): { expectedVerdict: Verdict; expectedReason: VerdictReason; expectedRationale: string } => ({
  expectedVerdict: klass.expectedVerdict,
  expectedReason: klass.expectedReason,
  expectedRationale: klass.rationale,
})

/**
 * Assign `golden-001`-style ids in build order, and stamp each case's adjudication and anchor.
 *
 * The adjudications and the anchor spans arrive as lookups because the case ids they are keyed by
 * do not exist until this function has assigned them: the table names `golden-095`, and `095` is
 * decided by being the 95th case `buildGolden` produced. Joining after the fact is what lets both
 * sides be written independently and still be checked against each other.
 */
export const finalise = (
  built: readonly Built[],
  prefix: string,
  adjudications: ReadonlyMap<string, AnchorAdjudication> = new Map(),
  anchorTexts: ReadonlyMap<string, string> = new Map(),
): readonly EvalCase[] =>
  built.map((entry, index) => {
    const id = `${prefix}-${String(index + 1).padStart(3, "0")}`
    const anchorText = anchorTexts.get(id)
    const adjudication = adjudications.get(id)
    return {
      id,
      classId: entry.classId,
      mutation: entry.mutation,
      note: entry.note,
      quote: entry.quote,
      citation: entry.citation,
      expectedVerdict: entry.expectedVerdict,
      expectedReason: entry.expectedReason,
      expectedRationale: entry.expectedRationale,
      anchorId: entry.record.id,
      // OMITTED rather than null when a case carries neither. `"anchorText": null` on 134 of 200
      // cases would be 134 lines asserting nothing, and a reader scanning the file would learn to
      // skip the field — the wrong instinct for the two fields on a case that record human work.
      ...(anchorText === undefined ? {} : { anchorText }),
      ...(adjudication === undefined ? {} : { adjudication }),
    }
  })

/** Deduplicate by record id, id-ascending. */
export const anchorsOf = (built: readonly Built[]): readonly EvalAnchor[] => {
  const byId = new Map<string, CorpusRecord>()
  for (const entry of built) if (!byId.has(entry.record.id)) byId.set(entry.record.id, entry.record)
  return [...byId.values()]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((record) => ({ ...toRecordMeta(record, sha256Hex), textDisplay: record.textDisplay, translation: record.translation }))
}

/**
 * How many words two spans disagree about, position by position.
 *
 * This is the check that makes `one_word_changed` mean what it says. A substitution can silently
 * become a no-op — the needle absent, the shadda not where the corpus puts it, the word written
 * with a different combining-mark order — and then the "fabrication" is a verbatim quotation
 * carrying a `rejected` label, which is a fixture that fails the verifier for the wrong reason.
 * Comparing word counts is enough to catch it, and it stays honest when the replacement is a
 * different length from the original, which it usually is.
 */
export const countDifferingWords = (left: string, right: string): number => {
  const a = left.split(" ")
  const b = right.split(" ")
  if (a.length !== b.length) return Math.max(a.length, b.length)
  return a.reduce((total, word, index) => (word === b[index] ? total : total + 1), 0)
}

/** Five records from each of the six collections, so no class is drawn from one collection only. */
const MAIN_ANCHORS_PER_COLLECTION = 5

const mainAnchors = (db: Database): readonly SpanRef[] =>
  collectionsOf(db).flatMap((collection) => anchorsWithSpans(rowsIn(db, collection), MAIN_ANCHORS_PER_COLLECTION).map(([record, span]) => ({ record, span })))

/** Hadith only: an English injection appended to a Qur'anic verse would be a category error. */
const hadithAnchors = (db: Database): readonly SpanRef[] => mainAnchors(db).filter((entry) => entry.record.collection !== "quran")

/**
 * The six usable digit spans, from the two records that have one.
 *
 * Both digit classes draw from this one pool, so the size of each class is bounded by what the
 * corpus actually contains. See `DIGIT_FACTS` in `plan.ts` for the measurement. The per-record
 * cap is deliberately larger than either class needs, because the two classes take disjoint
 * slices of the pool and a cap of 3 would starve the second of them.
 */
const DIGIT_SPANS_PER_RECORD = 4

const digitAnchors = (db: Database): readonly SpanRef[] =>
  recordsWithDigits(db).flatMap((record) => findSpans(record.textDisplay, DIGIT_SPANS_PER_RECORD, containsAsciiDigit).map((span) => ({ record, span })))

/* ------------------------------------------------------------------ per-class builders */

const buildMainClasses = (db: Database, classId: string, mutate: (span: string) => string, note: (entry: SpanRef) => string, fromOffset: number, count: number): readonly Built[] => {
  const klass = classById(classId)
  return mainAnchors(db)
    .slice(fromOffset, fromOffset + count)
    .map((entry) => ({
      classId,
      mutation: klass.mutation,
      note: note(entry),
      quote: mutate(entry.span),
      citation: cite(entry.record.collection, entry.record.number ?? ""),
      record: entry.record,
      ...from(klass),
    }))
}

const buildElide = (db: Database, count: number): readonly Built[] => {
  const klass = classById("elide_middle")
  return mainAnchors(db)
    .slice(0, count)
    .map((entry) => ({
      classId: klass.id,
      mutation: klass.mutation,
      note: `Middle of ${entry.record.id} elided with an Arabic ellipsis. A faithful summary of the source, and not a contiguous quotation of it.`,
      quote: elide_middle(entry.span),
      citation: cite(entry.record.collection, entry.record.number ?? ""),
      record: entry.record,
      ...from(klass),
    }))
}

const buildInjection = (db: Database, count: number): readonly Built[] => {
  const klass = classById("injection_appended")
  return hadithAnchors(db)
    .slice(0, count)
    .map((entry) => ({
      classId: klass.id,
      mutation: klass.mutation,
      note: `A genuine span of ${entry.record.id} with an English instruction appended. The text before the comma is real, so the case cannot be waved away as "obviously not the source".`,
      quote: injection_appended(entry.span),
      citation: cite(entry.record.collection, entry.record.number ?? ""),
      record: entry.record,
      ...from(klass),
    }))
}

const buildDigit = (db: Database, classId: string, mutate: (span: string) => string, fromOffset: number, count: number): readonly Built[] => {
  const klass = classById(classId)
  return digitAnchors(db)
    .slice(fromOffset, fromOffset + count)
    .map((entry) => ({
      classId,
      mutation: klass.mutation,
      note: `Footnote digit in ${entry.record.id} re-rendered. ${klass.id === "arabic_indic_digits" ? "Arabic-Indic form of a real digit." : "Value changed, so the text is no longer the source."}`,
      quote: mutate(entry.span),
      citation: cite(entry.record.collection, entry.record.number ?? ""),
      record: entry.record,
      ...from(klass),
    }))
}

/** A span containing BOTH words of a substitution pair, so two real words can be replaced. */
const spanHasBoth = (left: string, right: string) => (span: string): boolean => span.includes(left) && span.includes(right)

/**
 * The one-word class, round-robin over the substitution table.
 *
 * `perWordOffset` lets the red-team set skip the records the golden set already used, so the
 * two files are not the same twelve sentences with a different label. Round-robin rather than
 * exhausting the first word, because 30 consecutive cases quoting the word `messenger` would
 * be 30 tests of one substitution and nine tests of the others.
 *
 * Every substitution is confirmed to have changed exactly one word before the case is accepted.
 * A silent no-op here would produce a fabrication class containing verbatim quotations, and the
 * global containment check would then reject the whole set — so it is caught either way, but
 * here it is caught with the class name in the message.
 */
const buildOneWord = (db: Database, classId: string, count: number, perWordOffset: number): readonly Built[] => {
  const klass = classById(classId)
  const perWord = Math.ceil(count / SUBSTITUTIONS.length)
  const built: Built[] = []
  for (const [from_, to] of SUBSTITUTIONS) {
    if (built.length >= count) break
    const pool = anchorsWithSpans(recordsContaining(db, from_), perWord + perWordOffset, containsWord(from_)).slice(perWordOffset)
    for (const [record, span] of pool) {
      if (built.length >= count) break
      const quote = replaceWord(span, from_, to)
      if (countDifferingWords(span, quote) !== 1) continue
      built.push({
        classId,
        mutation: klass.mutation,
        note: `One word of twelve replaced in ${record.id}: ${from_} to ${to}. The other eleven words are verbatim, which is what makes this the hardest case in either set.`,
        quote,
        citation: cite(record.collection, record.number ?? ""),
        record,
        ...from(klass),
      })
    }
  }
  return built
}

/** Every distinct pair of substitution words, in a fixed order. Built structurally, not by index arithmetic. */
const substitutionPairs = (): readonly { readonly left: readonly [string, string]; readonly right: readonly [string, string] }[] =>
  SUBSTITUTIONS.flatMap((left, index) => SUBSTITUTIONS.slice(index + 1).map((right) => ({ left, right })))

/** The two-word class. Rarer than the one-word class, so it is sourced from record-level pairs. */
const buildTwoWord = (db: Database, count: number): readonly Built[] => {
  const klass = classById("two_word_changed")
  const built: Built[] = []
  for (const { left, right } of substitutionPairs()) {
    if (built.length >= count) break
    const [fromLeft, toLeft] = left
    const [fromRight, toRight] = right
    const pool = anchorsWithSpans(recordsContaining(db, fromLeft), count, spanHasBoth(fromLeft, fromRight)).filter(([, span]) =>
      span.includes(fromRight),
    )
    for (const [record, span] of pool) {
      if (built.length >= count) break
      const quote = replaceWord(replaceWord(span, fromLeft, toLeft), fromRight, toRight)
      if (countDifferingWords(span, quote) !== 2) continue
      built.push({
        classId: klass.id,
        mutation: klass.mutation,
        note: `Two words replaced in ${record.id}: ${fromLeft} to ${toLeft}, and ${fromRight} to ${toRight}.`,
        quote,
        citation: cite(record.collection, record.number ?? ""),
        record,
        ...from(klass),
      })
    }
  }
  return built
}

/** Transposition and insertion need no substitution, so they run off the main pool. */
const buildSimple = (db: Database, classId: string, mutate: (span: string) => string, count: number): readonly Built[] => {
  const klass = classById(classId)
  return mainAnchors(db)
    .slice(0, count)
    .map((entry) => ({
      classId,
      mutation: klass.mutation,
      note:
        classId === "letter_transposed"
          ? `Two adjacent letters swapped in ${entry.record.id}. One edit from the source under a Damerau metric; a different string under containment.`
          : `One extra word inserted into a span of ${entry.record.id}, lengthening it past the source.`,
      quote: mutate(entry.span),
      citation: cite(entry.record.collection, entry.record.number ?? ""),
      record: entry.record,
      ...from(klass),
    }))
}

/** How far past a collection's highest number an `identifier_unresolved` citation is placed. */
const UNRESOLVED_NUMBER_OFFSET = 1000

const buildUnresolved = (db: Database, count: number): readonly Built[] => {
  const klass = classById("unresolved_identifier")
  const built: Built[] = []
  for (const entry of mainAnchors(db)) {
    if (built.length >= count) break
    const absent = String(maxNumberIn(db, entry.record.collection) + UNRESOLVED_NUMBER_OFFSET)
    built.push({
      classId: klass.id,
      mutation: klass.mutation,
      note: `A genuine, correctly quoted span of ${entry.record.id}, cited to a number that collection does not have. The text is right and the pointer is wrong.`,
      quote: entry.span,
      citation: cite(entry.record.collection, absent),
      record: entry.record,
      ...from(klass),
    })
  }
  return built
}

/**
 * The ambiguous class cites number 1 with no collection, so the resolver cannot choose a row.
 *
 * Only six records in the corpus are numbered 1, and the class needs twenty distinct quotes, so
 * several disjoint spans are drawn from each. Round-robin over the records rather than
 * exhausting one: twenty cases all quoting tirmidhi:1 would test the ambiguity once and the
 * span picker nineteen times.
 */
const buildAmbiguous = (db: Database, count: number): readonly Built[] => {
  const NUMBER = "1"
  const klass = classById("ambiguous_collection")
  const records = collectionsUsingNumber(db, NUMBER).flatMap((collection) => rowsIn(db, collection).filter((record) => record.number === NUMBER))
  const pools = records.map((record) => findSpans(record.textDisplay, count))
  const depth = Math.max(0, ...pools.map((pool) => pool.length))
  const built: Built[] = []
  for (let round = 0; round < depth && built.length < count; round += 1) {
    for (const [index, record] of records.entries()) {
      if (built.length >= count) break
      const span = pools[index]?.[round]
      if (span === undefined) continue
      built.push({
        classId: klass.id,
        mutation: klass.mutation,
        note: `Number ${NUMBER} exists in several collections and this citation names none. The quote is an elision of ${record.id}, so no candidate could match it either — the ambiguity, not the text, is what is under test.`,
        quote: elide_middle(span),
        citation: cite("", NUMBER),
        record,
        ...from(klass),
      })
    }
  }
  return built
}

/* ------------------------------------------------------------------ the two sets */

export const buildGolden = (db: Database): readonly Built[] => [
  ...buildMainClasses(db, "verbatim", (span) => span, (entry) => `Twelve consecutive words of ${entry.record.id}, quoted exactly.`, 0, goldenCountOf("verbatim")),
  ...buildMainClasses(db, "undiacriticized", undiacriticized, (entry) => `The same span of ${entry.record.id} with every combining mark stripped.`, 0, goldenCountOf("undiacriticized")),
  ...buildMainClasses(db, "tatweel_spacing", tatweel_spacing, (entry) => `The same span of ${entry.record.id} with tatweel inserted and every space doubled.`, 0, goldenCountOf("tatweel_spacing")),
  ...buildDigit(db, "arabic_indic_digits", arabic_indic_digits, 0, goldenCountOf("arabic_indic_digits")),
  ...buildElide(db, goldenCountOf("elide_middle")),
  ...buildOneWord(db, "one_word_changed", goldenCountOf("one_word_changed"), 0),
  ...buildInjection(db, goldenCountOf("injection_appended")),
  ...buildUnresolved(db, goldenCountOf("unresolved_identifier")),
  ...buildAmbiguous(db, goldenCountOf("ambiguous_collection")),
]

export const buildRedTeam = (db: Database): readonly Built[] => [
  // Offset 4 so the red-team file draws different records from the golden file's one-word cases.
  ...buildOneWord(db, "one_word_changed", redTeamCountOf("one_word_changed"), 4),
  ...buildTwoWord(db, redTeamCountOf("two_word_changed")),
  ...buildSimple(db, "letter_transposed", letter_transposed, redTeamCountOf("letter_transposed")),
  // Offset 2: the digit pool holds six spans, four cases per class, and the classes must not
  // be the same four sentences twice.
  ...buildDigit(db, "digit_substituted", digit_substituted, 2, redTeamCountOf("digit_substituted")),
  ...buildSimple(db, "word_inserted", word_inserted, redTeamCountOf("word_inserted")),
]

/* ------------------------------------------------------------------ validation */

export type Problem = string

/**
 * Refuse to publish a set that is mislabelled, miscounted or unverifiable.
 *
 * Four families of check, all fatal:
 *
 *  1. Class counts, against `expectedCounts` rather than against what the builders produced.
 *  2. No duplicate case ids, and no case that folds to an empty quote.
 *  3. Citation-shape cases are actually unresolvable. A case labelled `identifier_unresolved`
 *     whose number exists, or `collection_ambiguous` whose number is unique, is a silent
 *     mislabel: the verifier would return a confident verdict and the case would call it a bug.
 *  4. Every case labelled `rejected` is absent from the ENTIRE corpus, not merely from the
 *     record it cites. This is the one that matters most: a fabrication that happened to be a
 *     real quotation elsewhere would be a fixture asserting the verifier is wrong when it is
 *     right — a "correct" test that fails for the wrong reason, which is worse than no test.
 */
export const validate = (
  name: "golden" | "redteam",
  cases: readonly EvalCase[],
  foldedCorpus: readonly string[],
  index: CorpusIndex,
): readonly Problem[] => {
  const problems: string[] = []
  const wanted = expectedCounts(name)
  const counts = new Map<string, number>()
  for (const entry of cases) counts.set(entry.classId, (counts.get(entry.classId) ?? 0) + 1)

  for (const [classId, expected] of Object.entries(wanted)) {
    const got = counts.get(classId) ?? 0
    if (got !== expected) problems.push(`${name}: class ${classId} has ${got} cases, expected ${expected}`)
  }
  for (const classId of counts.keys()) {
    if (wanted[classId] === undefined) problems.push(`${name}: class ${classId} is not declared in plan.ts`)
  }

  const seen = new Set<string>()
  for (const entry of cases) {
    if (seen.has(entry.id)) problems.push(`${name}: duplicate case id ${entry.id}`)
    seen.add(entry.id)
    if (normalizeForMatch(entry.quote).length === 0) problems.push(`${name}: case ${entry.id} has an empty folded quote`)
    problems.push(...shapeProblems(name, entry, index))
  }

  for (const entry of cases) {
    if (entry.expectedVerdict !== "rejected") continue
    const folded = normalizeForMatch(entry.quote)
    if (foldedCorpus.some((text) => text.includes(folded))) {
      problems.push(`${name}: case ${entry.id} is labelled rejected but its quote is contained in a real corpus record`)
    }
  }
  return problems
}

/** Per-case citation-shape checks, split out to keep `validate` readable. */
const shapeProblems = (name: "golden" | "redteam", entry: EvalCase, index: CorpusIndex): readonly string[] => {
  const key = `${entry.citation.collection}|${entry.citation.number ?? ""}`
  if (entry.expectedReason === "identifier_unresolved" && index.existingKeys.has(key)) {
    return [`${name}: case ${entry.id} expects identifier_unresolved but ${key} resolves in the corpus`]
  }
  if (entry.expectedReason === "collection_ambiguous" && !index.ambiguousNumbers.has(entry.citation.number ?? "")) {
    return [`${name}: case ${entry.id} expects collection_ambiguous but ${entry.citation.number ?? ""} is not ambiguous in the corpus`]
  }
  return []
}

/**
 * Every stamped anchor must be a normalized substring of BOTH the claim it sits on and the record
 * it cites, or step 5b can never locate it and the published movement figures would be a wish.
 *
 * The 3-word minimum, the 8-word maximum and the 160-character cap are NOT checked here. They are
 * properties of `anchorFrom`'s own bounds, and restating them beside the real implementation would
 * be a second place the rule is written down (AGENTS.md section 17) that can silently disagree with
 * the first. `apps/cli/test/eval.test.ts` asserts `anchorFrom(anchorText) !== null`, which is the
 * check the runtime performs, against the runtime's own numbers.
 */
export const anchorProblems = (name: "golden" | "redteam", cases: readonly EvalCase[], anchors: readonly EvalAnchor[]): readonly Problem[] => {
  const textById = new Map(anchors.map((anchor) => [anchor.id, anchor.textDisplay]))
  const problems: string[] = []
  for (const entry of cases) {
    if (entry.anchorText === undefined) continue
    const span = normalizeForMatch(entry.anchorText)
    if (span.length === 0) {
      problems.push(`${name}: case ${entry.id} carries an anchor that folds to an empty string`)
      continue
    }
    if (!normalizeForMatch(entry.quote).includes(span)) {
      problems.push(`${name}: case ${entry.id} carries an anchor that is not a substring of its own quote`)
    }
    const record = textById.get(entry.anchorId)
    if (record === undefined) {
      problems.push(`${name}: case ${entry.id} carries an anchor but cites ${entry.anchorId}, which is not an anchor of this set`)
      continue
    }
    if (!normalizeForMatch(record).includes(span)) {
      problems.push(`${name}: case ${entry.id} carries an anchor that is not a substring of ${entry.anchorId}, so no locator could ever find it`)
    }
  }
  return problems
}

export type { Built }

/**
 * The cases of a set BEFORE ids exist, in the same order `finalise` will number them.
 *
 * Exists so the adjudication loader can be handed the id a row names and the citation a row is
 * checked against, without `finalise` having to run first. Running it first would be a circular
 * dependency: `finalise` attaches the decisions, and the loader needs the ids to find them. This
 * is the join key spelled out — `{ id, classId, citation }` is exactly what
 * `loadAdjudications` reads, and nothing else about a case matters to a decision about it.
 */
export const unassigned = (built: readonly Built[], prefix: string): readonly { id: string; classId: string; citation: Citation }[] =>
  built.map((entry, index) => ({
    id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    classId: entry.classId,
    citation: entry.citation,
  }))
