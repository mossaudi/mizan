import type { Claim, ClaimVerdict, DetectionBasis, NearbyRecord, Relevance, ResolvedCitation, SuggestionScope, VerdictReport } from "@mizan/core"
import { SUGGESTION_DISCLAIMER, badgeFor, normalizeForTerminal, transcriptLabel } from "@mizan/core"
import type { TranscriptSource } from "@mizan/agent"
import { longestRunFor, resolutionKey } from "@mizan/verify"
import { correctionFor, renderCorrection } from "./correction.ts"
import { relevanceLabel } from "./relevance.ts"
import type { NearbyText, SuggestionBlock } from "./suggestions.ts"

/**
 * Rendering. Text nodes only, no markup — AGENTS.md section 11.
 *
 * ## What a judge sees, and what they must be able to check
 *
 * The header states the transcript kind, the model, and the snapshot hash. A reader who
 * suspects a `verified` badge was asserted rather than computed should be able to take that
 * snapshot hash, re-run the corpus, and land on the same text. Without it in the output, the
 * central claim is unfalsifiable from the outside, which would make it decoration.
 *
 * ## The match badge
 *
 * `exact` or `none` — never a percentage (AGENTS.md section 10). The `MatchStrength` the
 * verifier produced is rendered through the label it already carries, so this module cannot
 * invent a number even by accident: there is no arithmetic here at all.
 *
 * ## The quote beside the source
 *
 * A badge on its own asserts a disagreement and shows none of the evidence: `REJECTED` is
 * equally consistent with "the model invented this hadith" and "the model dropped a clause".
 * So every claim now prints the quoted span and the text of the record it was checked against,
 * with the record's id and URL so the comparison can be redone from outside this program. That
 * is the difference between a verdict and a claim about a verdict.
 *
 * They are stacked under explicit `quoted:` / `source:` labels rather than aligned in two
 * columns. Arabic is right-to-left, and a terminal's idea of column width is measured in
 * characters, so a two-column Arabic table renders as visual nonsense in most terminals. A
 * labelled stack is unambiguous in every one of them.
 *
 * ## Two statements, printed side by side
 *
 * The badge answers "is this quote in that record". It does not answer "does this answer address
 * the question", and Sprint 2 added the second statement without disturbing the first:
 *
 *  - **correction**, for a `rejected` claim, locates the run the record does share, so the reader
 *    can see dropped-clause against invented-sentence. It is a *location* — see `correction.ts`,
 *    which explains why the span type has no number in it that could be divided.
 *  - **relevance**, per claim, states whether the quoted span addresses the question, as one of
 *    three discrete words. `undetermined` is printed as itself, never softened into `answers`.
 *
 * Neither can change a badge. Gate G-7 re-asserts the separation at every run, and G-7.7 forbids
 * the relevance module from naming an outcome at all, so this is structural rather than a promise
 * in a comment.
 *
 * ## Corpus text is neutralised before it reaches a terminal
 *
 * `normalizeForTerminal` is applied to every piece of record text and model prose this file prints.
 * A record came from the internet; a string carrying an escape sequence can clear the screen or set
 * the window title, and in a product whose claim is "the badge you see was computed", text that can
 * erase its own badge is a spoofing primitive. The stored `textDisplay` is untouched — it is
 * verbatim because the licence terms require it, and this file's own tests assert the report
 * contains it verbatim — and the transform is applied at the moment of display only.
 *
 * The function removes terminal control sequences and *nothing else*. In particular it does not
 * compose in the render bidi fold, because that fold also removes the `U+200F` marks Sunan Abi
 * Dawud publishes around its quoted matn; see `normalizeForTerminal` in `@mizan/core` for the
 * residual it states instead.
 *
 * ## The `run:` line is a diagnostic, and this module cannot change a verdict with it
 *
 * `longestRunFor` lives in `packages/mizan-verify/src/diagnostics/` precisely so this file can
 * render it and `verify.ts` cannot see it. Gate G-2.2 enforces that separation over the import
 * closure of `verify.ts`, so the number printed here provably had no hand in the badge printed
 * above it. It is rendered for EVERY claim, verified ones included, so the reader can see the
 * number is always present and is plainly not what decided anything. The integers `runChars` and
 * `quoteChars` are printed; the module's `displayPercent` is deliberately not, so no number on
 * screen can be mistaken for a match score.
 */

/**
 * The badge is shown only when the report can back it up.
 *
 * `verified` is permitted only with evidence attached, and the verifier never emits that
 * combination. This is therefore not a fix for an observable bug: it is the renderer refusing
 * to be the last component that would print a verified claim whose source it cannot show. A
 * report assembled by hand in a future refactor would lose its badge here rather than gain one.
 *
 * The badge strings themselves come from `badgeFor` in `@mizan/core`, which is keyed by the
 * verdict union and is the same map the static page reads — so the terminal and the page cannot
 * disagree about what a verdict is called, and adding a verdict to the schema is a compile error
 * in both rather than a claim that silently renders as `UNVERIFIABLE`.
 */
const displayVerdict = (claim: VerdictReport["claims"][number]): string =>
  claim.verdict === "verified" && claim.evidence === null ? badgeFor("unverifiable") : badgeFor(claim.verdict)

const bar = (width: number): string => "─".repeat(width)

const INDENT = "    "
const CONTINUATION = `${INDENT}         `

/**
 * How much of a record's text reaches the screen.
 *
 * Long records exist, and a report that printed all of them would scroll the evidence it exists
 * to present out of view. Truncation is announced rather than silent, and it says plainly that
 * the verdict was computed over the whole record — a clipped display must never be mistakable
 * for a clipped decision.
 */
const MAX_SOURCE_CHARS = 1200

const displayed = (text: string): string =>
  text.length <= MAX_SOURCE_CHARS ? text : `${text.slice(0, MAX_SOURCE_CHARS)}… (display truncated; the verdict was computed over the whole record)`

/**
 * The one place a citation becomes a human label.
 *
 * It lives here rather than in `main.ts` because both the retrieval context labels and these
 * evidence lines need it, and two spellings of `collection number` is exactly the kind of
 * disagreement AGENTS.md section 17 exists to prevent.
 */
export const citationLabel = (collection: string, number: string | null): string =>
  number === null ? collection : `${collection} ${number}`

/**
 * One resolved record, as the renderer needs it.
 *
 * `textMatch` is the pre-folded matching key and is MEASURED, NEVER DISPLAYED — a folded Arabic
 * string is not a faithful transcription of anything, and showing it would be both an offence
 * and a licence problem. It is carried here solely to be handed to the display-only diagnostic.
 * `schema/record.ts` states the product rule: render `textDisplay`, compare `textMatch`.
 */
export type SourceExcerpt = {
  readonly recordId: string
  readonly label: string
  readonly sourceUrl: string
  readonly textDisplay: string
  readonly textMatch: string
}

/**
 * The evidence table, keyed twice on purpose.
 *
 * A citation looks up by `resolutionKey(citation)` — the same key the verifier resolves with, so
 * this module cannot disagree with it about which record a citation means. A `verified` verdict
 * looks up by `recordId`, because it names the exact record that matched and the verifier picked
 * the lowest id among candidates; showing any other candidate would be showing the wrong text.
 * The two key shapes cannot collide: resolution keys join on `|`, record ids join on `:`.
 */
export type SourceTable = ReadonlyMap<string, SourceExcerpt>

/**
 * Build the evidence table the renderer reads, keyed twice.
 *
 * Once by `resolutionKey(citation)` — the same key the verifier resolves with, so the renderer
 * cannot disagree with it about which record a citation means — and once by record id, because a
 * `verified` verdict names the exact record that matched and the verifier picks the lowest id
 * among candidates. Showing any other candidate would be showing the wrong text beside a badge.
 *
 * An ambiguous or unresolved citation contributes no entry at all, which precisely makes the
 * renderer say "no record in this snapshot matches …" for those cases instead of inventing a
 * source to sit next to the badge. No extra I/O: `textMatch` came back with the resolution.
 *
 * ## Why it lives here and not in `main.ts`
 *
 * It is the renderer's input, and it is a `SourceExcerpt` producer — the same concern as
 * `citationLabel` directly above, which is here for the same reason. When `demo.ts` needed the
 * identical table, keeping it in `main.ts` would have meant either an import of an entry point
 * (a script that calls `process.exit` at module scope) or a second copy that could drift and
 * quietly disagree with the verifier about which record a citation means. Two spellings of that
 * key is precisely the failure AGENTS.md section 17 exists to prevent.
 */
export const buildSourceTable = (resolved: readonly ResolvedCitation[]): SourceTable => {
  const table = new Map<string, SourceExcerpt>()
  for (const entry of resolved) {
    for (const record of entry.records) {
      const excerpt: SourceExcerpt = {
        recordId: record.id,
        label: citationLabel(record.collection, record.number),
        sourceUrl: record.sourceUrl,
        textDisplay: record.textDisplay,
        textMatch: record.textMatch,
      }
      table.set(resolutionKey(entry.citation), excerpt)
      table.set(record.id, excerpt)
    }
  }
  return table
}

/** The record a verdict was decided against, or null when the citation resolved to nothing. */
const resolveSource = (verdict: ClaimVerdict, claim: Claim, sources: SourceTable): SourceExcerpt | null => {
  if (verdict.evidence !== null) return sources.get(verdict.evidence.recordId) ?? null
  for (const citation of claim.citations) {
    const found = sources.get(resolutionKey(citation))
    if (found !== undefined) return found
  }
  return null
}

/** What to print when the citation points at nothing, which is the `unverifiable` case. */
const unresolvedLine = (claim: Claim): string => {
  const cited = claim.citations.map((citation) => citationLabel(citation.collection, citation.number))
  if (cited.length === 0) return "the claim cited nothing, so there is no record to show"
  return `no record in this snapshot matches ${cited.join(", ")}`
}

/**
 * The relevance line, and why it is a line rather than a badge.
 *
 * Relevance is a *second* statement, printed next to the first. The badge is a computed fact about
 * a quote and a record, and a lexical heuristic must not overrule it — `relevance.ts` is forbidden
 * from naming an outcome by gate G-7.7, so it could not if it tried. What a reader must not be
 * left with is a green badge and no notice that the quote was off-topic, so the state is printed
 * in its own words, on every claim, with `undetermined` shown as itself.
 */
const renderRelevance = (relevance: Relevance | undefined): string => {
  if (relevance === undefined) return `${INDENT}relevance: not assessed — this report was built without a question to compare against`
  const located = relevance.located.length === 0 ? "none" : relevance.located.join(", ")
  return `${INDENT}relevance: ${relevanceLabel(relevance)} — ${relevance.reason} (question terms in this quote: ${located})`
}

/**
 * The nearest-suggestion block, printed under the correction.
 *
 * ## Why this is here and not in `suggestions.ts`
 *
 * The feature module owns the composition and the contract; this module owns every string a person
 * reads. `citationLabel`, `displayed()` and `INDENT` all already live here, and a second copy of the
 * truncation announcement or of the `collection number` spelling would be exactly the drift
 * AGENTS.md section 17 exists to prevent.
 *
 * ## Why the disclaimer is mandatory and comes first
 *
 * `SUGGESTION_DISCLAIMER` is imported from `@mizan/core`, so the terminal, the static page and any
 * future surface cannot describe this list three different ways. It is printed on EVERY state
 * including `unavailable`, because the failure mode of this feature is a list of real records from a
 * real corpus sitting under a `REJECTED` badge and reading as a correction — or worse, as the reason
 * for the badge. Nothing here can change the badge: the badge above was printed from
 * `ClaimVerdict`, and this function is handed a `Suggestion` with no verdict in it.
 *
 * ## The grade line is conditional
 *
 * `gradeApplicable` decides whether a grade is printed at all, and the grade is shown as the
 * dataset's own attribution (`gradeSource`, `gradeBasis`) rather than as our ruling (AGENTS.md
 * §15). A hadith collection with no grade concept prints nothing rather than printing `none`.
 */
const renderSuggestionLine = (record: NearbyRecord, text: NearbyText | undefined, quote: string): string[] => {
  const label = citationLabel(record.collection, record.number)
  const lines = [`${INDENT}${record.rank}. ${normalizeForTerminal(label)} — ${normalizeForTerminal(record.sourceUrl)}`]
  if (text !== undefined) lines.push(`${CONTINUATION}${normalizeForTerminal(displayed(text.textDisplay))}`)
  // Display-only, exactly like the `run:` line above: two integers, no quotient, and no path to
  // `verify.ts` from this file's imports (G-2.2).
  if (text !== undefined) {
    const run = longestRunFor(quote, text.textMatch)
    lines.push(`${INDENT}        shared: ${run.runChars} of ${run.quoteChars} folded characters — display only, never a verdict`)
  }
  if (!record.gradeApplicable || record.grade === null) return lines
  return [...lines, `${INDENT}        grade: ${normalizeForTerminal(record.grade)} (dataset's own grade; ${record.gradeSource}/${record.gradeBasis}, not ours)`]
}

/**
 * How the search was scoped, in one sentence, for every state that searched.
 *
 * ## Why this is a function and not three format strings at three call sites
 *
 * Because the widening is the whole point of having the scope at all. A list drawn from the whole
 * snapshot after the cited collection came up empty is only *half* as useful as a scoped one, and it
 * is actively misleading if the reader is not told — so the one thing this line may never do is omit
 * `widenedFrom`. `SuggestionScope` makes it structurally impossible to omit: a `snapshot` scope
 * carries the collection name as a field, so there is nothing to forget.
 */
const scopeLine = (scope: SuggestionScope): string => {
  if (scope.kind === "collection") return `within ${normalizeForTerminal(scope.collection)}`
  if (scope.widenedFrom === null) return "whole snapshot"
  return `whole snapshot — nothing was close within ${normalizeForTerminal(scope.widenedFrom)}`
}

/**
 * One claim's suggestion pass, in every state it can be in.
 *
 * `block === null` renders nothing at all, and that is the honest surface: the pass was not run
 * because the claim was not rejected or carried no quotation. A rejected claim always gets a block,
 * so a reader is never left inferring "nothing near it" from silence.
 */
const renderSuggestion = (block: SuggestionBlock | undefined | null, quote: string): string[] => {
  if (block === undefined || block === null) return []
  const { suggestion } = block
  const header = `${INDENT}${SUGGESTION_DISCLAIMER}:`

  if (suggestion.state === "unavailable") {
    return [header, `${CONTINUATION}${normalizeForTerminal(suggestion.reason)}`]
  }
  if (suggestion.state === "no_candidates") {
    return [header, `${CONTINUATION}${normalizeForTerminal(suggestion.reason)}`]
  }

  const texts = new Map(block.texts.map((text) => [text.recordId, text]))
  const lines = [
    `${INDENT}${SUGGESTION_DISCLAIMER}: ${suggestion.candidates.length} of ${suggestion.considered} records searched, ${scopeLine(suggestion.scope)}`,
  ]
  for (const record of suggestion.candidates) lines.push(...renderSuggestionLine(record, texts.get(record.recordId), quote))
  return lines
}

/**
 * The evidence lines: the record the claim was decided against, or the reason there is none.
 *
 * Returned rather than pushed in place so that `renderClaim` has no early return between the badge
 * and the suggestion block. It used to `return` here when a citation resolved to nothing, which
 * meant a caller that handed it a block had the block silently dropped — a swallow that looks
 * identical to "there was nothing to show", the one failure this feature must never have.
 */
const sourceLines = (source: SourceExcerpt | null, claim: Claim, quote: string, outcome: ClaimVerdict["verdict"]): string[] => {
  if (source === null) return [`${INDENT}source:  ${unresolvedLine(claim)}`]
  const lines = [
    `${INDENT}source:  ${normalizeForTerminal(source.label)} — ${normalizeForTerminal(source.sourceUrl)}`,
    `${CONTINUATION}${normalizeForTerminal(displayed(source.textDisplay))}`,
  ]
  // Display-only. See the module header: this number cannot reach `verify.ts`, and the badge above
  // was printed from `ClaimVerdict`, not from anything computed on this line.
  const run = longestRunFor(quote, source.textMatch)
  lines.push(`${INDENT}run:     ${run.runChars} of ${run.quoteChars} folded characters shared — display only, never a verdict`)
  // A correction is offered for a rejection and for nothing else. `correctionFor` is total, so a
  // rejected claim whose citation resolved to nothing degrades to a stated reason rather than
  // silently printing nothing — which would read as "there is no correction to make" rather than
  // "we could not look".
  lines.push(...renderCorrection(correctionFor({ verdict: outcome, quote, recordTextMatch: source.textMatch })))
  return lines
}

/**
 * One claim: the badge, then the evidence for it.
 *
 * `claim` is looked up positionally and may be absent, because `verifyAnswer` preserves order
 * but a hand-built report is not guaranteed to. A missing claim prints "no quotation to check"
 * rather than throwing, so a renderer bug can never be the reason a demo fails on screen.
 *
 * `relevance` is positional for the same reason and is likewise allowed to be absent; an absent
 * assessment prints as *not assessed*, which is a different statement from any of the three states
 * and is the honest one.
 */
const renderClaim = (
  verdict: ClaimVerdict,
  claim: Claim | undefined,
  sources: SourceTable,
  relevance: Relevance | undefined,
  suggestion: SuggestionBlock | null,
): string[] => {
  const lines = [`[${displayVerdict(verdict)}] ${verdict.claimId} — ${verdict.reason} (match: ${verdict.matchStrength.kind})`]
  lines.push(renderRelevance(relevance))

  const quote = claim?.quote ?? null
  if (quote === null || quote.trim().length === 0) {
    lines.push(`${INDENT}quoted:  (none — there was no quotation to check)`)
    return lines
  }
  lines.push(`${INDENT}quoted:  ${normalizeForTerminal(quote)}`)
  if (claim === undefined) return lines

  lines.push(...sourceLines(resolveSource(verdict, claim, sources), claim, quote, verdict.verdict))

  // The suggestion block comes last, and it is offered for a rejection and for nothing else. It
  // reads the quote and the corpus; it cannot read `verdict.matchStrength`, and the badge above was
  // already decided. `--no-suggestions` simply leaves `suggestions` null, so the block disappears
  // without any branch here knowing the flag exists.
  lines.push(...renderSuggestion(suggestion, quote))
  return lines
}

/**
 * The detected question language, as the boundary reported it.
 *
 * Carried into the header so US-13's support is observable rather than asserted: a reader can see
 * which language the program decided it was asked in, and which direction that language runs. The
 * native language NAME is never printed, because the header is the one part of the report a judge
 * screenshots and a language tag is enough to check the detection without printing the question
 * anywhere it did not have to be (AGENTS.md section 13).
 *
 * `basis` is present because a marker heuristic cannot always tell two languages apart, and "we
 * detected Malay" is not something this program is entitled to say when Malay and Indonesian scored
 * the same. A tag guessed at the table's whim and a tag from a marker only one language has must not
 * read the same on the line a judge screenshots.
 */
export type QuestionLanguage = {
  readonly language: string
  readonly rtl: boolean
  /**
   * How the language was decided. Absent renders no qualifier, which is the right behaviour for the
   * only basis that needs no caveat and for any caller that has not been taught to pass one — an
   * absent qualifier must never be read as a confident one, so `detected` is the default word rather
   * than `unknown`.
   */
  readonly basis?: DetectionBasis
}

/** The basis word for a detection, and the qualifier to print when it is not the confident case. */
const BASIS_QUALIFIER: Readonly<Record<DetectionBasis, string>> = {
  marker: "detected",
  "sole-script-language": "sole script language",
  "script-default": "script default, no marker matched",
  "ambiguous-markers": "ambiguous: several languages matched equally",
}

/**
 * The language line, with its evidence.
 *
 * The qualifier appears only where the evidence is weaker than the word "detected" would imply, so a
 * screenshot of a Persian question does not carry a caveat the reader has to decode, and a screenshot
 * of an Arabic question with no marker carries one it cannot miss.
 */
const languageLine = (question: QuestionLanguage): string => {
  const direction = question.rtl ? "rtl" : "ltr"
  const qualifier = question.basis === undefined ? "detected" : BASIS_QUALIFIER[question.basis]
  return `language     ${question.language} (${direction}, ${qualifier})`
}

export const renderHeader = (options: {
  readonly transcript: TranscriptSource
  readonly model: string
  readonly snapshotHash: string
  readonly sourceCount: number
  /** Absent for a report assembled without a question, which renders no language line at all. */
  readonly question?: QuestionLanguage
}): string =>
  [
    bar(64),
    `sources       ${options.sourceCount} from the local snapshot`,
    `model         ${options.model}`,
    // The transcript kind is on its own line, in capitals, because a replay presented as a
    // live generation is the failure this project cannot afford. The wording is `transcriptLabel`
    // in `@mizan/core` rather than a ternary here, so the static page and this header cannot
    // drift apart (AGENTS.md section 17).
    `transcript    ${transcriptLabel(options.transcript)}`,
    `snapshot      ${options.snapshotHash.slice(0, 16)}…`,
    ...(options.question === undefined ? [] : [languageLine(options.question)]),
    bar(64),
  ].join("\n")

export const renderReport = (options: {
  readonly prose: string
  readonly report: VerdictReport
  /** The claims the report was computed from, in the order it computed them. */
  readonly claims: readonly Claim[]
  /** Resolved records to show as evidence, keyed for lookup. See `SourceTable`. */
  readonly sources: SourceTable
  /**
   * One relevance assessment per claim, in the same order. `null` for a report assembled without a
   * question, which renders as *not assessed* — a fourth, visible state, not a default.
   */
  readonly relevance: readonly Relevance[] | null
  /**
   * One suggestion pass per claim, in the same order. `null` entries are claims the pass does not
   * apply to — a verified claim, or one with no quotation — and they render as nothing at all.
   * Omitted entirely is the same as all-`null`, so a report assembled by hand needs no change.
   */
  readonly suggestions?: readonly (SuggestionBlock | null)[] | null
  readonly transcript: TranscriptSource
  readonly model: string
  readonly sourceCount: number
  readonly snapshotHash: string
  /** The language the boundary detected. Omitted when there was no question to detect. */
  readonly question?: QuestionLanguage
}): string => {
  const sections: string[] = [
    renderHeader({
      transcript: options.transcript,
      model: options.model,
      snapshotHash: options.snapshotHash,
      sourceCount: options.sourceCount,
      question: options.question,
    }),
  ]
  sections.push(normalizeForTerminal(options.prose))
  sections.push("")
  // `verifyAnswer` preserves the caller's claim order, so index `i` of the report is the verdict
  // for index `i` of the claims. A report whose lengths disagree still renders: the extra
  // verdicts print their badge, and the missing evidence prints "no quotation to check".
  options.report.claims.forEach((verdict, index) => {
    const assessed = options.relevance === null ? undefined : options.relevance[index]
    const suggested = options.suggestions === undefined || options.suggestions === null ? null : (options.suggestions[index] ?? null)
    sections.push(...renderClaim(verdict, options.claims[index], options.sources, assessed, suggested))
  })
  if (options.report.degraded.length > 0) sections.push(`\ndegraded: ${options.report.degraded.join(", ")}`)
  return sections.join("\n")
}

export * as Render from "./render.ts"
