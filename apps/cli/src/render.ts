import type { Claim, ClaimVerdict, VerdictReport } from "@mizan/core"
import type { TranscriptSource } from "@mizan/agent"
import { longestRunFor, resolutionKey } from "@mizan/verify"

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
 * Keyed by the verdict union rather than by `string`, so adding a verdict to `@mizan/core` is
 * a compile error here instead of a claim that silently renders as `UNVERIFIABLE`.
 */
type Verdict = VerdictReport["claims"][number]["verdict"]

const VERDICT_GLYPH: Readonly<Record<Verdict, string>> = {
  verified: "VERIFIED",
  rejected: "REJECTED",
  unverifiable: "UNVERIFIABLE",
}

/**
 * The badge is shown only when the report can back it up.
 *
 * `verified` is permitted only with evidence attached, and the verifier never emits that
 * combination. This is therefore not a fix for an observable bug: it is the renderer refusing
 * to be the last component that would print a verified claim whose source it cannot show. A
 * report assembled by hand in a future refactor would lose its badge here rather than gain one.
 */
const displayVerdict = (claim: VerdictReport["claims"][number]): string =>
  claim.verdict === "verified" && claim.evidence === null ? VERDICT_GLYPH.unverifiable : VERDICT_GLYPH[claim.verdict]

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
 * One claim: the badge, then the evidence for it.
 *
 * `claim` is looked up positionally and may be absent, because `verifyAnswer` preserves order
 * but a hand-built report is not guaranteed to. A missing claim prints "no quotation to check"
 * rather than throwing, so a renderer bug can never be the reason a demo fails on screen.
 */
const renderClaim = (verdict: ClaimVerdict, claim: Claim | undefined, sources: SourceTable): string[] => {
  const lines = [`[${displayVerdict(verdict)}] ${verdict.claimId} — ${verdict.reason} (match: ${verdict.matchStrength.kind})`]

  const quote = claim?.quote ?? null
  if (quote === null || quote.trim().length === 0) {
    lines.push(`${INDENT}quoted:  (none — there was no quotation to check)`)
    return lines
  }
  lines.push(`${INDENT}quoted:  ${quote}`)

  if (claim === undefined) return lines
  const source = resolveSource(verdict, claim, sources)
  if (source === null) {
    lines.push(`${INDENT}source:  ${unresolvedLine(claim)}`)
    return lines
  }

  lines.push(`${INDENT}source:  ${source.label} — ${source.sourceUrl}`)
  lines.push(`${CONTINUATION}${displayed(source.textDisplay)}`)

  // Display-only. See the module comment: this number cannot reach `verify.ts`, and the badge
  // above was printed from `ClaimVerdict`, not from anything computed on this line.
  const run = longestRunFor(quote, source.textMatch)
  lines.push(`${INDENT}run:     ${run.runChars} of ${run.quoteChars} folded characters shared — display only, never a verdict`)
  return lines
}

export const renderHeader = (options: {
  readonly transcript: TranscriptSource
  readonly model: string
  readonly snapshotHash: string
  readonly sourceCount: number
}): string =>
  [
    bar(64),
    `sources       ${options.sourceCount} from the local snapshot`,
    `model         ${options.model}`,
    // The transcript kind is on its own line, in capitals, because a replay presented as a
    // live generation is the failure this project cannot afford.
    `transcript    ${options.transcript === "precomputed" ? "PRECOMPUTED (deterministic replay)" : "LIVE"}`,
    `snapshot      ${options.snapshotHash.slice(0, 16)}…`,
    bar(64),
  ].join("\n")

export const renderReport = (options: {
  readonly prose: string
  readonly report: VerdictReport
  /** The claims the report was computed from, in the order it computed them. */
  readonly claims: readonly Claim[]
  /** Resolved records to show as evidence, keyed for lookup. See `SourceTable`. */
  readonly sources: SourceTable
  readonly transcript: TranscriptSource
  readonly model: string
  readonly sourceCount: number
  readonly snapshotHash: string
}): string => {
  const sections: string[] = [renderHeader({ transcript: options.transcript, model: options.model, snapshotHash: options.snapshotHash, sourceCount: options.sourceCount })]
  sections.push(options.prose)
  sections.push("")
  // `verifyAnswer` preserves the caller's claim order, so index `i` of the report is the verdict
  // for index `i` of the claims. A report whose lengths disagree still renders: the extra
  // verdicts print their badge, and the missing evidence prints "no quotation to check".
  options.report.claims.forEach((verdict, index) => {
    sections.push(...renderClaim(verdict, options.claims[index], options.sources))
  })
  if (options.report.degraded.length > 0) sections.push(`\ndegraded: ${options.report.degraded.join(", ")}`)
  return sections.join("\n")
}

export * as Render from "./render.ts"
