import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * D-1, rules ten and fourteen — a value-proof document may only print figures a committed
 * artefact publishes, and no audited document may claim answer or retrieval quality (ADR-C2).
 *
 * ## Rule ten
 *
 * The benchmark's claim is that its number was *measured*. A figure typed into the prose beside it
 * is a second source of truth that nothing checks — the same defect the executed system arm
 * removed, one layer up: `score.ts` derived "detection" from the fixture's own labels, so the
 * number was a restatement of the input. Two checks, because neither implies the other:
 * **backing** (every figure in a benchmark section is one the artefact publishes) and
 * **attribution** (a figure stated for a named quantity equals the artefact's value for it — a
 * section can be full of artefact numbers and still attach one to the wrong row). Both are pure,
 * so both are proved by planting a violation rather than by reading a correct document.
 *
 * ## Rule fourteen
 *
 * ADR-C2 puts retrieval and answer generation out of scope: mizan adjudicates citations, it does
 * not produce answers, and claiming otherwise is the over-claiming AGENTS.md §12 forbids in a
 * product whose credibility rests on never over-claiming. The list is assertive shapes only, so a
 * sentence *declining* to make the claim cannot trip the rule that enforces it; `best-in-class` is
 * absent because the plan's own comparison table uses it for a competitor's interface, and a rule
 * that fires there is a rule that gets switched off.
 *
 * ## The rate rule, which is what the promise half rests on
 *
 * `docs/value-proof.md` promises that every figure it prints comes from a file committed here, and
 * `docs-external.ts` holds it to that across its whole body rather than inside a benchmark section.
 * Answering "may this document state `40%`" needs more than "does the artefact publish `40`",
 * because `40` is `caseCount`: a legitimate figure, and a nonsensical percentage. So the promise half
 * admits exactly two things — a registry figure, and a rendering this document **attributes to a
 * named rate** of the artefact — and the attribution is rule ten's own, read once and shared rather
 * than reimplemented (§17).
 *
 * `65%` is the case that proves the difference is worth having. It is a rendering of
 * `baselineTop1HitRate`, so an un-attributed `65%` is precisely the unsourced market claim ADR-C8
 * exists to refuse, while the table row that prints `65.0%` beside `` `baselineTop1HitRate` `` passes
 * because the row names the field the figure belongs to. Admitting a rate's renderings *by their
 * number* instead of by their attribution is what let both through.
 *
 * ## Why the credit is keyed by line, and not merely collected
 *
 * The first version collected every attributed rendering in the document into one set, and the
 * promise half tested that set against every percentage in the whole body. Attribution therefore
 * carried no position: a rendering credited *somewhere* vouched for the same digits *everywhere*.
 * The review's probes were the same sentence with three spellings, appended to the shipped
 * `docs/value-proof.md`, and each passed with `check:docs` green — `100.0% of the corpus text is
 * Arabic.`, `0.0% of sources are English translations.`, `100.0 percent of sources are
 * translations.` The benchmark table prints `100.0%` and `0.0%`, so those renderings were on the
 * list, and an unsourced statistic about the corpus borrowed them. A differently-spelled borrowing
 * (`100%`, `65%`) failed, so the hole was spelling-exact rather than open — which is worse in a way,
 * because it looks like a working rule and is a lookup keyed on a coincidence.
 *
 * Per *line* is the fix, and it is the right unit rather than the cheap one: rule ten's own
 * attribution is already read per line by {@link rowClaims} and {@link proseClaims}, so a positional
 * promise reuses the notion rule ten already enforces instead of inventing a second one, and the
 * document-wide keying was the only place the two disagreed. Two limits follow and are stated rather
 * than hidden: a claim hard-wrapped across lines must keep the field name with the figure, and a
 * percentage in the same *sentence* but a different line is still uncredited — a window would have
 * closed that at the price of a second notion of "near", and a hole a few words wide is a hole.
 */

/* ------------------------------------------------------------------ the committed artefact */

/** The system-arm artefact and its text, or null when the repository ships none. */
export type StatedBenchmark = {
  readonly path: string
  readonly text: string | null
}

/** Thousands grouping for an integer figure, so `27,234` is backed by `27234` rather than reported. */
export const groupFigure = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")

/**
 * Every way a document may legitimately write this figure. Rates are `0..1` in the artefact and
 * percentages in prose, so accepting only one rendering would report every correct document as
 * broken; the whole-number percentage is here because "100 percent" and "100.0%" are one claim.
 *
 * Exported because the external registry in `docs-external.ts` publishes figures under exactly the
 * same rules — one number, many spellings — and a second copy of this function would be a second
 * answer to "which strings may stand for this figure" (AGENTS.md section 17).
 */
export const renderingsOf = (value: number): readonly string[] => {
  const raw = String(value)
  if (value < 0 || value > 1) return [raw, groupFigure(value)]
  return [raw, (Math.round(value * 1000) / 10).toFixed(1), String(Math.round(value * 100)), groupFigure(value)]
}

/** Numeric fields only: a figure rule judged against a string field would have nothing to judge. */
const readFigures = (text: string): Readonly<Record<string, number>> | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  const figures: Record<string, number> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "number" && Number.isFinite(value)) figures[key] = value
  }
  return Object.keys(figures).length === 0 ? null : figures
}

/**
 * The renderings of every figure the artefact publishes, which is the vocabulary rule ten allows
 * inside a benchmark section.
 *
 * A count belongs here. `27,234 records` and `40 fabricated cases` are the claims that section makes,
 * and a rule that refused them would report the honest table as broken — which is why this is the
 * *section* scope and not the promise scope below.
 *
 * @param external the external-claim registry, as a second authority a figure may be backed by. Its
 *   entries are `{ id, figure }` pairs rather than a numeric field map, so they are folded in by the
 *   caller that has already narrowed them. A document may therefore print a *cited* third-party figure
 *   in a benchmark section without rule ten reporting it as unbacked — and `docs-external.ts` is what
 *   requires that citation, so the leniency here is not a hole: it is a second registry.
 */
const backedRenderings = (values: readonly number[], external: readonly ExternalFigure[] = []): ReadonlySet<string> => {
  const backed = new Set<string>()
  for (const value of [...values, ...external.map((entry) => entry.figure)]) {
    for (const rendering of renderingsOf(value)) backed.add(rendering)
  }
  return backed
}

/** One external figure, already narrowed: the id a document must cite, and the number it may print. */
export type ExternalFigure = { readonly id: string; readonly figure: number }

/* ------------------------------------------------------------------ what a document states */

/**
 * One figure, never a fragment of one.
 *
 * The lookarounds are the whole of the precision. Inside `FTS5`, `bm25` or a sha256 the digit is
 * preceded and followed by a word character, so a section that names its corpus fingerprint or its
 * query grammar produces no figure at all — which is what keeps the rule from crying wolf over
 * tokens that were never claims. The leading guard excludes the tail of `1.2.3`; the trailing one
 * excludes `.` and `,` only when a digit follows, so `false-verified was 0, and …` states `0`
 * rather than swallowing the comma, and `65.0.` at the end of a sentence still states `65.0`.
 * Thousands grouping is a real shape here (`27,234`), so a comma is consumed only as part of one.
 *
 * Exported because the *percentage* rule in `docs-external.ts` is this pattern plus a percent sign,
 * and a second definition of "what shape is a number in prose" would be a second answer to a
 * question AGENTS.md section 17 reserves exactly one place for.
 */
export const FIGURE_PATTERN = "(?<![\\w.,])\\d+(?:,\\d{3})*(?:\\.\\d+)?(?![\\w]|[.,]\\d)"
const FIGURE_ALL = new RegExp(FIGURE_PATTERN, "g")

const HEADING = /^(#{1,6})\s+(.*)$/
const FENCE = /^\s*(?:```|~~~)/

/** The headings that open a benchmark section. Deliberately narrow: a heading, never a keyword. */
const SECTION_TOPIC = /\bbenchmark\b|\bsystem arm\b/i

/**
 * The zero-based indexes of every line in a benchmark section, headings and fences included.
 *
 * A section is a heading naming the benchmark plus everything under it until a heading at the same
 * or a higher level, so a `###` subsection stays in scope and the next `##` leaves it. Scoped by
 * heading rather than keyword because a keyword test firing anywhere in the file would report the
 * comparison table's sourced numbers as unbacked benchmark claims. Fences are tracked so a `# comment`
 * inside a block cannot end the section it documents; figures inside a fence are still checked,
 * because a quoted JSON block is where a hand-edited number would hide most easily.
 *
 * Indexes rather than the lines themselves, because `docs-external.ts` needs to know *which line* a
 * figure sits on — its finding names a line number — and deriving that from a list of strings would
 * mean walking the headings a second time. One walk, one answer, two readers.
 */
export const benchmarkScope = (document: string): ReadonlySet<number> => {
  const inScope = new Set<number>()
  let inFence = false
  let inSection = false
  let sectionLevel = 0
  for (const [index, line] of document.split("\n").entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence
      if (inSection) inScope.add(index)
      continue
    }
    const heading = inFence ? null : line.match(HEADING)
    if (heading !== null) {
      const level = (heading[1] ?? "#").length
      // Annotated: `inSection` is assigned from this, and an inferred `nested` would close a
      // circular type dependency between the two rather than resolve to `boolean`.
      const nested: boolean = inSection && level > sectionLevel
      inSection = nested || SECTION_TOPIC.test(heading[2] ?? "")
      if (!nested) sectionLevel = level
    }
    if (inSection) inScope.add(index)
  }
  return inScope
}

/** The lines of every benchmark section. The same scope as `benchmarkScope`, as text. */
const benchmarkLines = (document: string): readonly string[] => {
  const rows = document.split("\n")
  return [...benchmarkScope(document)].map((index) => rows[index] ?? "")
}

/** The distinct figures a set of lines states, in the order a reader meets them. */
export const figuresIn = (lines: readonly string[]): readonly string[] => {
  const found: string[] = []
  for (const line of lines) {
    for (const match of line.matchAll(FIGURE_ALL)) {
      const figure = match[0]
      if (figure !== undefined && !found.includes(figure)) found.push(figure)
    }
  }
  return found
}

/**
 * Backing, for a section that states figures. Returns early rather than comparing against nothing.
 * `covered` holds the figures attribution has already reported: one broken number is one finding,
 * and the attribution message — which names the field and the right value — is the better one.
 */
const sectionClaims = (document: string, file: string, artefact: StatedBenchmark, figures: Readonly<Record<string, number>> | null, covered: ReadonlySet<string>, external: readonly ExternalFigure[]): readonly DocsClaim[] => {
  const stated = figuresIn(benchmarkLines(document))
  if (stated.length === 0) return []
  if (figures === null && external.length === 0) {
    return [claim("benchmark-claim-unbacked", file, `this document's benchmark section states ${stated.join(", ")}, but ${artefact.path} is missing or unreadable, so not one of them is backed`)]
  }
  const backed = backedRenderings(Object.values(figures ?? {}), external)
  return stated.filter((figure) => !backed.has(figure) && !covered.has(figure)).map((figure) => claim("benchmark-claim-unbacked", file, `${artefact.path} publishes no figure that renders as ${figure}, and no entry in the external-claim registry does either, yet this document's benchmark section states it`))
}

/* ------------------------------------------------------------------ attribution */

/**
 * The quantities rule ten attributes, and how each is written in running prose. Each pattern
 * carries both spellings — the phrase a sentence uses and the field name a table label uses —
 * because they are one claim, and a rule that checked only one would leave the other free to drift.
 *
 * `unit` is what the promise half reads, and it is here rather than in that module because it is a
 * fact about the artefact's quantities, not about the promise. Only a `rate` may be written as a
 * percentage: `caseCount` of 40 and `corpusRecordCount` of 27,234 are figures this repository prints
 * and percentages it must never publish, and `delta` is a difference published in percentage points,
 * which every document here prints as `pp`. A new quantity has to say which it is rather than being
 * admitted or refused by accident.
 */
export type Quantity = { readonly field: string; readonly prose: string; readonly unit: "rate" | "count" | "difference" }

export const QUANTITIES: readonly Quantity[] = [
  { field: "baselineTop1HitRate", prose: "baseline\\s+top-1\\s+hit\\s+rate|baselineTop1HitRate", unit: "rate" },
  { field: "systemDetectionRate", prose: "system\\s+detection\\s+rate|systemDetectionRate", unit: "rate" },
  { field: "systemAgreementRate", prose: "system\\s+agreement\\s+rate|systemAgreementRate", unit: "rate" },
  { field: "systemAbstentionRate", prose: "system\\s+abstention\\s+rate|systemAbstentionRate", unit: "rate" },
  { field: "falseVerifiedCount", prose: "false[-\\s]verified(?:\\s+count)?|falseVerifiedCount", unit: "count" },
  { field: "delta", prose: "\\bdelta\\b", unit: "difference" },
]

/** Whether the artefact publishes this quantity as a rate, the only unit a percentage may stand for. */
export const isRate = (field: string): boolean => QUANTITIES.some((quantity) => quantity.field === field && quantity.unit === "rate")

/**
 * What may sit between a quantity and the figure that states it. Restricting this to a connector
 * rather than a window is the difference between catching an asserted figure and reporting "the
 * detection rate, measured over 40 cases, is 100%" as a detection rate of 40: a figure reached
 * only through `of`, `is`, `was`, `at`, `by`, `:` or `=` is the figure the sentence is stating,
 * and anything else is a different number in the same sentence. A sign is allowed because `+35.0`
 * is one figure written with a plus, not a number sitting behind a stray character.
 *
 * A backtick is allowed for the same reason the camelCase spelling is in `QUANTITIES` at all: every
 * document here writes a quantity as `` `systemDetectionRate` ``, and a connector vocabulary that
 * stopped at the closing backtick would read a labelled row and miss the sentence that says the same
 * thing in prose — so the attribution would depend on which of the two shapes a writer happened to
 * use. It widens the gap, never past a connector, so the sentence above is still not read as a rate.
 */
const CONNECTORS = "[`\\s*_]*(?::|=|\\b(?:of|is|was|at|by)\\b)?[\\s*_]*[+-]?"

const QUANTITY_PATTERNS: readonly { readonly field: string; readonly pattern: RegExp }[] = QUANTITIES.map((quantity) => ({
  field: quantity.field,
  pattern: new RegExp(`(?:${quantity.prose})${CONNECTORS}(${FIGURE_PATTERN})`, "i"),
}))

/** The non-empty cells of a markdown table row, or null when the line is not one. */
const cellsOf = (line: string): readonly string[] | null => {
  if (!line.trimStart().startsWith("|")) return null
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
}

/** One figure a document states, and the quantity it states it for. */
type Said = { readonly field: string; readonly stated: string }

/** One labelled table row, as the quantity its label names and every figure its other cells state. */
type LabelledRow = { readonly field: string; readonly stated: readonly string[] }

/**
 * The two shapes attribution is read from, and the single place each is defined.
 *
 * Both readers — rule ten's mismatch check and the promise half's backing set — need the same two
 * shapes, and answering them twice is how the two would come to disagree about which sentences are
 * attributed. A table row is attributed by its label carrying the backticked field name; a sentence is
 * attributed by naming the quantity beside a figure through `CONNECTORS`.
 */
const labelledRow = (cells: readonly string[]): readonly LabelledRow[] => {
  const label = cells[0] ?? ""
  return QUANTITIES.flatMap((quantity): readonly LabelledRow[] => {
    if (!label.includes(`\`${quantity.field}\``)) return []
    const stated = cells.slice(1).flatMap((cell): readonly string[] => [...cell.matchAll(FIGURE_ALL)].flatMap((match) => (match[0] === undefined ? [] : [match[0]])))
    return [{ field: quantity.field, stated }]
  })
}

const saidInProse = (line: string): readonly Said[] =>
  QUANTITY_PATTERNS.flatMap((quantity): readonly Said[] => {
    const stated = quantity.pattern.exec(line)?.[1]
    return stated === undefined ? [] : [{ field: quantity.field, stated }]
  })

/** A table row whose label names a quantity: every figure in the row must be that quantity's. */
const rowClaims = (line: string, file: string, artefact: StatedBenchmark, figures: Readonly<Record<string, number>>, covered: Set<string>): readonly DocsClaim[] => {
  const cells = cellsOf(line)
  if (cells === null) return []
  const claims: DocsClaim[] = []
  for (const row of labelledRow(cells)) {
    const published = figures[row.field]
    if (published === undefined) {
      claims.push(claim("benchmark-claim-unbacked", file, `this document labels a row \`${row.field}\`, but ${artefact.path} publishes no such figure`))
      continue
    }
    const allowed = new Set(renderingsOf(published))
    for (const stated of row.stated) {
      if (allowed.has(stated)) continue
      claims.push(claim("benchmark-claim-unbacked", file, `this document states ${stated} in the \`${row.field}\` row, but ${artefact.path} publishes ${String(published)}`))
      covered.add(stated)
    }
  }
  return claims
}

/** A sentence that states a figure for a named quantity: that figure must be the artefact's. */
const proseClaims = (line: string, file: string, artefact: StatedBenchmark, figures: Readonly<Record<string, number>>, covered: Set<string>): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const said of saidInProse(line)) {
    const published = figures[said.field]
    if (published === undefined) {
      claims.push(claim("benchmark-claim-unbacked", file, `this document states a figure for \`${said.field}\`, but ${artefact.path} publishes no such figure`))
      continue
    }
    if (new Set(renderingsOf(published)).has(said.stated)) continue
    claims.push(claim("benchmark-claim-unbacked", file, `this document states ${said.stated} as the ${said.field}, but ${artefact.path} publishes ${String(published)}`))
    covered.add(said.stated)
  }
  return claims
}

/**
 * The renderings each line of this document attributes to a rate the artefact publishes, keyed by
 * line number.
 *
 * **Per rendering, and per line.** Per rendering because a table row that prints `65.0%` beside
 * `` `baselineTop1HitRate` `` credits `65.0` and leaves `65` uncredited, so a percentage elsewhere
 * that merely *equals* the baseline rate is still the unsourced claim ADR-C8 refuses. Per line
 * because the credit is a property of where the document made the attribution: an aggregated set
 * vouched for a rendering it had seen credited somewhere, which is how `100.0% of the corpus text is
 * Arabic.` passed a document that had printed `100.0%` in its benchmark table. Lines are 1-based so
 * the key is the number a finding quotes.
 *
 * A lost artefact is not a skip: `readFigures("")` yields null and is folded in as `{}`, so a
 * repository that has deleted `vs-search.json` has fewer things it may say, never more (§3).
 */
const rateAttributionsByLine = (document: string, figures: Readonly<Record<string, number>>): ReadonlyMap<number, ReadonlySet<string>> => {
  const byLine = new Map<number, Set<string>>()
  const credit = (line: number, said: Said): void => {
    if (!isRate(said.field)) return
    const published = figures[said.field]
    if (published === undefined) return
    if (!new Set(renderingsOf(published)).has(said.stated)) return
    const attributed = byLine.get(line) ?? new Set<string>()
    attributed.add(said.stated)
    byLine.set(line, attributed)
  }
  for (const [index, row] of document.split("\n").entries()) {
    const line = index + 1
    const cells = cellsOf(row)
    if (cells === null) {
      for (const said of saidInProse(row)) credit(line, said)
      continue
    }
    for (const labelled of labelledRow(cells)) for (const stated of labelled.stated) credit(line, { field: labelled.field, stated })
    for (const said of saidInProse(row)) credit(line, said)
  }
  return byLine
}

/**
 * What a promising document has shown it may state, read at each line rather than pooled across it.
 *
 * The registry's figures are deliberately *not* in here. They are a second committed authority, so
 * they back a percentage wherever it is printed, and `docs-external.ts` requires the citation
 * separately — which is the more specific finding, and two findings for one defect would train the
 * reader to ignore both.
 */
export type StatementBacking = { readonly byLine: ReadonlyMap<number, ReadonlySet<string>> }

/**
 * Every line's own backing, for the document that promises its figures are sourced.
 *
 * A set of sets would have read the same and been the defect: the promise half asks "may *this*
 * percentage stand", and a pooled set can only answer "does this spelling appear anywhere in a claim
 * we attributed", which is a different and weaker question (§17).
 */
export const statementBacking = (document: string, artefact: StatedBenchmark): StatementBacking => ({
  byLine: rateAttributionsByLine(document, readFigures(artefact.text ?? "") ?? {}),
})

/**
 * R10: every benchmark figure a document prints is backed by the committed artefact, and is
 * attributed to the quantity the artefact says it belongs to.
 *
 * @param artefact the committed system-arm artefact, with `text: null` when the repository has
 *   none. A missing artefact is not a licence to print figures: where a section states them, that
 *   is reported rather than skipped (AGENTS.md §3).
 * @param external the external-claim registry's figures, when the document cites any. A *cited*
 *   third-party figure is backed here and required to be cited by `docs-external.ts`, which is the
 *   half that keeps a number from being smuggled in unlabelled. The default is no entries, so a
 *   three-argument call is exactly the check that existed before the registry did.
 */
export const checkBenchmarkClaimUnbacked = (document: string, file: string, artefact: StatedBenchmark, external: readonly ExternalFigure[] = []): readonly DocsClaim[] => {
  const figures = artefact.text === null ? null : readFigures(artefact.text)
  const covered = new Set<string>()
  if (figures === null) return sectionClaims(document, file, artefact, null, covered, external)
  const attributed: DocsClaim[] = []
  for (const line of document.split("\n")) {
    attributed.push(...rowClaims(line, file, artefact, figures, covered))
    attributed.push(...proseClaims(line, file, artefact, figures, covered))
  }
  return [...sectionClaims(document, file, artefact, figures, covered, external), ...attributed]
}

/* ------------------------------------------------------------------ rule fourteen */

/**
 * The assertive shapes an answer- or retrieval-quality claim takes. Case-insensitive and
 * non-global, so each `exec` is independent: a leftover `lastIndex` would silently skip the
 * second match on a line.
 */
export const ANSWER_QUALITY_PHRASES: readonly RegExp[] = [
  /\bout[-\s]?perform\w*\b/i,
  /\bbetter answers?\b/i,
  /\bmore accurate answers?\b/i,
  /\bsuperior answers?\b/i,
  /\bmore reliable answers?\b/i,
  /\b(?:higher|better|improved)\s+(?:answer|retrieval)\s+quality\b/i,
  /\b(?:answer|retrieval)\s+quality\s+(?:is|was|are|were)\s+(?:better|higher|improved)\b/i,
  /\banswers?\s+are\s+(?:better|more accurate|superior)\b/i,
]

/**
 * R14: no audited document may assert that mizan's answers or retrieval are better.
 *
 * The finding names the line, because "a document somewhere claims answer quality" is not a
 * sentence anyone can act on.
 */
export const checkAnswerQualityClaim = (document: string, file: string): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const [index, line] of document.split("\n").entries()) {
    for (const phrase of ANSWER_QUALITY_PHRASES) {
      const match = phrase.exec(line)
      if (match === null) continue
      claims.push(claim("answer-quality-claim", file, `line ${index + 1} asserts "${match[0]}", which is an answer- or retrieval-quality claim; ADR-C2 puts generation out of scope`))
    }
  }
  return claims
}

export * as DocsValue from "./docs-value.ts"
