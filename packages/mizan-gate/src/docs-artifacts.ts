import { EvalSet, decodeOrFail, decodeSync, isOk, normalizeForMatch } from "@mizan/core"
import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * D-1, rule six — a document must not describe the eval sets' breadth differently from how the
 * committed artefacts are.
 *
 * ## The defect class
 *
 * **"Two cases never share a span, so 200 cases are 200 texts rather than one long record chopped
 * up."** False, and the committed set says so on its own. Thirty of the golden set's 56 anchor
 * records are quoted by more than one case *after the real normaliser runs*, and on `abudawud:1`
 * four cases carry byte-identical folded text — `verbatim`, `undiacriticized`, `tatweel_spacing` and
 * `unresolved_identifier` all quote the same twelve words. Re-rendering one span three ways is the
 * design of those classes, so the claim was never true; what it bought the reader was an inflated
 * sense of how many independent subjects 200 cases represent.
 *
 * The prose it belonged to also stated the breadth arithmetically — 56 records, 30 records — and
 * that half was true, which is exactly what made the sentence dangerous: a reader who checked the
 * arithmetic found nothing wrong and kept the false part.
 *
 * ## What it compares
 *
 * The figure a document is judged against is the artefact's own published `anchorCount`, decoded
 * through the `EvalSet` contract `@mizan/core` already declares, and never a second derivation that
 * could disagree with it (AGENTS.md §17). The rule decides nothing about whether a prose sentence is
 * true — no gate can, and the header of `docs-claims.ts` says so. It decides whether a *number stated
 * about a named set* is a number one of the sets that paragraph names actually publishes, and whether
 * a *disjointness assertion* survives the real normaliser. Both are decidable because each has a
 * committed counterparty.
 */

/* ------------------------------------------------------------------ the claim shapes */

/**
 * The ways a document asserts that no two eval cases quote the same span.
 *
 * Three phrasings, all narrow, all assertions rather than topics. "Two cases never share a span",
 * "disjoint spans" and "no two cases share" are the only shapes a reader would take the claim from;
 * a document that merely discusses independence without asserting disjointness is not what this
 * rule is for, and matching more loosely would report a correct document as broken.
 */
const DISJOINTNESS_CLAIM = /\bdisjoint spans?\b|\bnever share a span\b|\bno two cases share\b/gi

/** The set name a block must contain for a stated breadth figure to be about an eval set. */
const SET_NAME = /\bgolden\b|\bred-?team\b/gi

/**
 * `N records`, in any thousands convention and with any of the nouns the repository uses for breadth.
 *
 * Deliberately tolerant of what sits between the figure and the noun, because these documents already
 * put things there: markdown emphasis (`**56**`), a qualifier (`56 anchor records`), and a longer
 * chain (`999 unique anchor source records` — the last of which is the exact string a writer reaches
 * for and which a two-word tolerance missed).
 */
const RECORD_FIGURE = /(\d[\d,]*)\s*\**\s*(?:[a-z-]+\s+){0,3}?(?:records?|anchors?|sources?|texts?)\b/gi

/** The nouns that mean breadth, used for the table-row label test. */
const BREADTH_NOUN = /\b(?:records?|anchors?|sources?|texts?)\b/i

/** A number in a table cell, which states a figure as a bare cell with no noun in front of it. */
const CELL_FIGURE = /(\d[\d,]*)/g

/**
 * A figure the sentence renounces, anchored to the end of the text immediately before it.
 *
 * "not 200 texts", "rather than 999 records" — the figure is being rejected, not asserted, so it is
 * not this rule's business. `no more than 999` is deliberately *not* covered: the word before the
 * digits is `than`, so a bound is still read as a claim.
 */
const RENOUNCED = /(?:not|never|nor|neither|rather than|instead of)\s+\**\s*$/i

/** Characters examined for a renouncing word. Long enough for "rather than", short enough to be local. */
const RENOUNCE_LOOKBACK = 32

/* ------------------------------------------------------------------ reading an artefact */

/**
 * The cases out of a committed eval artefact, or null when it is not one.
 *
 * Decoded through the contract `@mizan/core` already declares rather than a local re-statement of
 * it. The artefact is hand-editable, reviewable data, so it is the trust boundary AGENTS.md §1
 * means, and the decode is also what stops this module and `apps/cli/test/eval.test.ts` holding two
 * different ideas of what a case is.
 */
const readEvalSet = (text: string, path: string): EvalSet | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return null
  }
  const decoded = decodeOrFail(decodeSync(EvalSet), parsed, path)
  if (!isOk(decoded)) return null
  // A published set with no cases is a broken artefact, not an empty one. Declining to read it
  // makes the claim about it uncheckable, which is what the unreadable branch below reports.
  if (decoded.value.cases.length === 0) return null
  return decoded.value
}

/**
 * Anchor records that more than one case quotes, once the real normaliser has run.
 *
 * The normaliser is the point, and it is the reason this cannot be done with string equality on the
 * raw quotes: `verbatim` and `undiacriticized` carry different bytes and the same span. Two cases
 * whose folded quotes are equal do share a span, so equality here can only ever report a true
 * finding — which is what makes the rule safe to run against every document rather than a fixture.
 */
const sharedSpanRecords = (set: EvalSet): number => {
  const byAnchor = new Map<string, string[]>()
  for (const entry of set.cases) {
    const quoted = byAnchor.get(entry.anchorId) ?? []
    quoted.push(normalizeForMatch(entry.quote))
    byAnchor.set(entry.anchorId, quoted)
  }
  return [...byAnchor.values()].filter((quotes) => new Set(quotes).size !== quotes.length).length
}

/* ------------------------------------------------------------------ what a paragraph states */

/** A set name with the spelling differences this rule does not care about. */
const canonical = (token: string): string => token.toLowerCase().replace(/-/g, "")

/** The distinct set names a piece of text names, in the order they appear. */
const namesIn = (text: string): readonly string[] =>
  [...new Set([...text.matchAll(SET_NAME)].map((match) => canonical(match[0])))]

/** The breadth figures a piece of text states, renounced ones removed. */
const figuresIn = (text: string): readonly number[] => {
  const found: number[] = []
  for (const match of text.matchAll(RECORD_FIGURE)) {
    const digits = match[1]
    if (digits === undefined) continue
    const before = text.slice(Math.max(0, match.index - RENOUNCE_LOOKBACK), match.index)
    if (RENOUNCED.test(before)) continue
    found.push(Number.parseInt(digits.replace(/,/g, ""), 10))
  }
  return found
}

/** The set names a paragraph names, and the breadth figures it states. */
type Block = { readonly names: readonly string[]; readonly figures: readonly number[] }

const blockOf = (text: string): Block => ({ names: namesIn(text), figures: figuresIn(text) })

/**
 * The paragraphs that make a breadth claim.
 *
 * A **block** is markdown's own unit: consecutive non-blank lines. That choice is the whole of the
 * fix for the sharpest version of this defect class. Line-scoping made the rule's reach a function of
 * where somebody's editor wrapped the paragraph — the README's honest 56 and 30 passed only because
 * the line naming `golden` happened to carry the 56 — so reflowing the paragraph left both figures
 * unchecked with no diagnostic at all. A blank line is the only thing that ends a block, and a blank
 * line also ends the sentence for a human reader, so the two now agree.
 *
 * A block naming no eval set is dropped. "6236 records", "36024 records" and "27,234 records" appear
 * in these documents about the registry and the corpus, and a rule that did not require a set name
 * would report a correct disclosure as broken. A gate that cries wolf gets switched off.
 */
const proseBlocks = (documentText: string): readonly Block[] =>
  documentText
    .split(/\n\s*\n/)
    .map(blockOf)
    .filter((block) => block.names.length > 0)

/**
 * The table rows that make a breadth claim.
 *
 * Read separately because a table states its figure as a bare cell: `| Golden set records | 999 |`
 * has no noun in front of the digits, so the prose pattern cannot see it. The label cell must carry
 * **both** a set name and a breadth noun, which is what keeps the README's own
 * `| \`golden-normalization.json\` | 200 | **100%** |` row out: that label names a set and states a
 * case count and an accuracy bar, and neither is breadth. Every number in a later cell is a figure,
 * because a row has already declared in its label what kind of number it is carrying.
 */
const tableBlocks = (documentText: string): readonly Block[] => {
  const blocks: Block[] = []
  for (const line of documentText.split("\n")) {
    if (!line.trimStart().startsWith("|")) continue
    const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell.length > 0)
    const label = cells[0] ?? ""
    if (!BREADTH_NOUN.test(label)) continue
    const names = namesIn(label)
    if (names.length === 0) continue
    const figures = cells
      .slice(1)
      .flatMap((cell) => [...cell.matchAll(CELL_FIGURE)].map((match) => Number.parseInt((match[1] ?? "0").replace(/,/g, ""), 10)))
    blocks.push({ names, figures })
  }
  return blocks
}

/* ------------------------------------------------------------------ the rule */

/** One committed eval artefact and the set name a document calls it. */
export type StatedSet = { readonly name: string; readonly path: string; readonly text: string | null }

/** Every `anchorCount` the run could read, keyed by canonical set name. */
type Counts = ReadonlyMap<string, number>

/**
 * The finding for a figure that no set in its own paragraph publishes.
 *
 * A figure is judged against *every* set the paragraph names, not against one guessed from position.
 * That is the second half of the fix, and it is what makes the rule independent of wrapping: a
 * paragraph naming both sets carries two figures, and a proximity rule has to pick which is which —
 * but "this number is a count one of the sets named here actually publishes" needs no pick, cannot
 * blame the wrong set, and cannot fail a correct document whose figures are merely wrapped
 * differently. When the paragraph names a single set the test is exactly as strict as before.
 */
const figureFinding = (block: Block, figure: number, counts: Counts): DocsClaim["detail"] => {
  if (block.names.length === 1) {
    const only = block.names[0] ?? ""
    return `this document states the ${only} set as drawing on ${figure} records, but ${only} publishes an anchorCount of ${counts.get(only) ?? 0}`
  }
  const published = block.names.map((name) => `${name} publishes ${counts.get(name) ?? 0}`).join(", ")
  return `this document states a breadth of ${figure} records in a paragraph naming the ${block.names.join(" and ")} sets, but neither publishes that count (${published})`
}

/**
 * R6: the eval sets' breadth must be described the way the committed sets actually are.
 *
 * Two checks, both only when the document makes the claim:
 *
 *  - a disjointness assertion, contradicted when any record is quoted by two cases that fold alike;
 *  - a stated breadth figure, which must be an `anchorCount` published by a set its own paragraph
 *    names.
 *
 * @param setTexts the committed artefacts, or null for a repository that has none. A missing artefact
 *   means the document cannot be making a claim about it, so it is skipped rather than failed — the
 *   same reasoning R5 uses for a repository with no `attestation.json`.
 */
export const checkEvalBreadth = (documentText: string, file: string, setTexts: readonly StatedSet[]): readonly DocsClaim[] => {
  const disjoint = [...documentText.matchAll(DISJOINTNESS_CLAIM)]
  const claims: DocsClaim[] = []
  const counts: Map<string, number> = new Map()
  const unreadable = new Map<string, { readonly name: string; readonly path: string }>()
  const blocks = [...proseBlocks(documentText), ...tableBlocks(documentText)]

  for (const { name, path, text } of setTexts) {
    if (text === null) continue
    const set = readEvalSet(text, path)
    if (set === null) {
      unreadable.set(canonical(name), { name, path })
      continue
    }
    counts.set(canonical(name), set.anchorCount)
    const shared = disjoint.length > 0 ? sharedSpanRecords(set) : 0
    if (shared > 0) {
      claims.push(
        claim(
          "eval-breadth-overstated",
          file,
          `this document claims no two cases share a span, but ${shared} of the ${name} set's ${set.anchorCount} anchor records are quoted by more than one case once \`normalizeForMatch\` has run`,
        ),
      )
    }
  }

  for (const { name, path } of unreadable.values()) {
    // A separate rule id, because the remediation is a different file. A finding named after the
    // document sends the next engineer to edit prose that may be perfectly correct. Both of this
    // rule's claims count, not just the disjointness one: a stated figure on an artefact that cannot
    // be decoded is just as unchecked, and leaving it silent is the fail-open default AGENTS.md §3
    // forbids.
    const asserts = disjoint.length > 0 || blocks.some((block) => block.figures.length > 0 && block.names.includes(canonical(name)))
    if (asserts) {
      claims.push(claim("eval-artefact-unreadable", path, `this document makes a claim about the ${name} set's breadth, but ${path} could not be decoded as an EvalSet, so the claim cannot be checked`))
    }
  }

  for (const block of blocks) {
    // Every set the paragraph names must be one this run could read, or its figures are not
    // checkable. A set that would not decode is already reported above, and a set the repository
    // does not ship has nothing to contradict it — and in neither case may the rule invent a count
    // to judge against, because a finding that quotes a figure it made up is worse than silence: it
    // sends the next engineer to fix a number that was never wrong. Soundness over reach.
    if (!block.names.every((name) => counts.has(name))) continue
    for (const figure of block.figures) {
      if (block.names.some((name) => counts.get(name) === figure)) continue
      claims.push(claim("eval-breadth-overstated", file, figureFinding(block, figure, counts)))
    }
  }
  return claims
}

export * as DocsArtifacts from "./docs-artifacts.ts"
