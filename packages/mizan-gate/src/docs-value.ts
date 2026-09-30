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
 */
const renderingsOf = (value: number): readonly string[] => {
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

/** The renderings of every figure the artefact publishes, which is the whole vocabulary rule ten allows. */
const backedRenderings = (figures: Readonly<Record<string, number>>): ReadonlySet<string> => {
  const backed = new Set<string>()
  for (const value of Object.values(figures)) for (const rendering of renderingsOf(value)) backed.add(rendering)
  return backed
}

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
 */
const FIGURE_PATTERN = "(?<![\\w.,])\\d+(?:,\\d{3})*(?:\\.\\d+)?(?![\\w]|[.,]\\d)"
const FIGURE_ALL = new RegExp(FIGURE_PATTERN, "g")

const HEADING = /^(#{1,6})\s+(.*)$/
const FENCE = /^\s*(?:```|~~~)/

/** The headings that open a benchmark section. Deliberately narrow: a heading, never a keyword. */
const SECTION_TOPIC = /\bbenchmark\b|\bsystem arm\b/i

/**
 * The lines of every benchmark section, headings included. A section is a heading naming the
 * benchmark plus everything under it until a heading at the same or a higher level, so a `###`
 * subsection stays in scope and the next `##` leaves it. Scoped by heading rather than keyword
 * because a keyword test firing anywhere in the file would report the comparison table's sourced
 * numbers as unbacked benchmark claims. Fences are tracked so a `# comment` inside a block cannot
 * end the section it documents; figures inside a fence are still checked, because a quoted JSON
 * block is where a hand-edited number would hide most easily.
 */
const benchmarkLines = (document: string): readonly string[] => {
  const lines: string[] = []
  let inFence = false
  let inSection = false
  let sectionLevel = 0
  for (const line of document.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence
      if (inSection) lines.push(line)
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
    if (inSection) lines.push(line)
  }
  return lines
}

/** The distinct figures a set of lines states, in the order a reader meets them. */
const figuresIn = (lines: readonly string[]): readonly string[] => {
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
const sectionClaims = (document: string, file: string, artefact: StatedBenchmark, figures: Readonly<Record<string, number>> | null, covered: ReadonlySet<string>): readonly DocsClaim[] => {
  const stated = figuresIn(benchmarkLines(document))
  if (stated.length === 0) return []
  if (figures === null) {
    return [claim("benchmark-claim-unbacked", file, `this document's benchmark section states ${stated.join(", ")}, but ${artefact.path} is missing or unreadable, so not one of them is backed`)]
  }
  const backed = backedRenderings(figures)
  return stated.filter((figure) => !backed.has(figure) && !covered.has(figure)).map((figure) => claim("benchmark-claim-unbacked", file, `${artefact.path} publishes no figure that renders as ${figure}, yet this document's benchmark section states it`))
}

/* ------------------------------------------------------------------ attribution */

/**
 * The quantities rule ten attributes, and how each is written in running prose. Each pattern
 * carries both spellings — the phrase a sentence uses and the field name a table label uses —
 * because they are one claim, and a rule that checked only one would leave the other free to drift.
 */
const QUANTITIES: readonly { readonly field: string; readonly prose: string }[] = [
  { field: "baselineTop1HitRate", prose: "baseline\\s+top-1\\s+hit\\s+rate|baselineTop1HitRate" },
  { field: "systemDetectionRate", prose: "system\\s+detection\\s+rate|systemDetectionRate" },
  { field: "systemAgreementRate", prose: "system\\s+agreement\\s+rate|systemAgreementRate" },
  { field: "systemAbstentionRate", prose: "system\\s+abstention\\s+rate|systemAbstentionRate" },
  { field: "falseVerifiedCount", prose: "false[-\\s]verified(?:\\s+count)?|falseVerifiedCount" },
  { field: "delta", prose: "\\bdelta\\b" },
]

/**
 * What may sit between a quantity and the figure that states it. Restricting this to a connector
 * rather than a window is the difference between catching an asserted figure and reporting "the
 * detection rate, measured over 40 cases, is 100%" as a detection rate of 40: a figure reached
 * only through `of`, `is`, `was`, `at`, `by`, `:` or `=` is the figure the sentence is stating,
 * and anything else is a different number in the same sentence. A sign is allowed because `+35.0`
 * is one figure written with a plus, not a number sitting behind a stray character.
 */
const CONNECTORS = "[\\s*_]*(?::|=|\\b(?:of|is|was|at|by)\\b)?[\\s*_]*[+-]?"

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

/** A table row whose label names a quantity: every figure in the row must be that quantity's. */
const rowClaims = (line: string, file: string, artefact: StatedBenchmark, figures: Readonly<Record<string, number>>, covered: Set<string>): readonly DocsClaim[] => {
  const cells = cellsOf(line)
  if (cells === null) return []
  const label = cells[0] ?? ""
  const claims: DocsClaim[] = []
  for (const quantity of QUANTITIES) {
    if (!label.includes(`\`${quantity.field}\``)) continue
    const published = figures[quantity.field]
    if (published === undefined) {
      claims.push(claim("benchmark-claim-unbacked", file, `this document labels a row \`${quantity.field}\`, but ${artefact.path} publishes no such figure`))
      continue
    }
    const allowed = new Set(renderingsOf(published))
    for (const cell of cells.slice(1)) {
      for (const match of cell.matchAll(FIGURE_ALL)) {
        const stated = match[0]
        if (stated === undefined || allowed.has(stated)) continue
        claims.push(claim("benchmark-claim-unbacked", file, `this document states ${stated} in the \`${quantity.field}\` row, but ${artefact.path} publishes ${String(published)}`))
        covered.add(stated)
      }
    }
  }
  return claims
}

/** A sentence that states a figure for a named quantity: that figure must be the artefact's. */
const proseClaims = (line: string, file: string, artefact: StatedBenchmark, figures: Readonly<Record<string, number>>, covered: Set<string>): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const quantity of QUANTITY_PATTERNS) {
    const match = quantity.pattern.exec(line)
    if (match === null) continue
    const stated = match[1]
    if (stated === undefined) continue
    const published = figures[quantity.field]
    if (published === undefined) {
      claims.push(claim("benchmark-claim-unbacked", file, `this document states a figure for \`${quantity.field}\`, but ${artefact.path} publishes no such figure`))
      continue
    }
    if (new Set(renderingsOf(published)).has(stated)) continue
    claims.push(claim("benchmark-claim-unbacked", file, `this document states ${stated} as the ${quantity.field}, but ${artefact.path} publishes ${String(published)}`))
    covered.add(stated)
  }
  return claims
}

/**
 * R10: every benchmark figure a document prints is backed by the committed artefact, and is
 * attributed to the quantity the artefact says it belongs to.
 *
 * @param artefact the committed system-arm artefact, with `text: null` when the repository has
 *   none. A missing artefact is not a licence to print figures: where a section states them, that
 *   is reported rather than skipped (AGENTS.md §3).
 */
export const checkBenchmarkClaimUnbacked = (document: string, file: string, artefact: StatedBenchmark): readonly DocsClaim[] => {
  const figures = artefact.text === null ? null : readFigures(artefact.text)
  const covered = new Set<string>()
  if (figures === null) return sectionClaims(document, file, artefact, null, covered)
  const attributed: DocsClaim[] = []
  for (const line of document.split("\n")) {
    attributed.push(...rowClaims(line, file, artefact, figures, covered))
    attributed.push(...proseClaims(line, file, artefact, figures, covered))
  }
  return [...sectionClaims(document, file, artefact, figures, covered), ...attributed]
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
