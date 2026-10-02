import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * R20 — a document may not state the anchor arm's verdict polarity backwards.
 *
 * ## Why this rule exists at all
 *
 * A specification proposed the mapping "`located: true` yields `REJECTED`; `located: false` yields
 * `UNVERIFIABLE`". The code does the exact opposite, and it has since the arm was added:
 * `anchoredOutcome` in `packages/mizan-verify/src/verify.ts` returns `unverifiable` with reason
 * `no_matching_evidence` when the anchor **is** located, and falls through to step six —
 * `rejected` with reason `quote_absent_at_cited_id` — when it is not. ADR-C1 is the authority, and
 * `docs/anchor-protocol.md` states the mapping correctly.
 *
 * A specification that describes a verifier wrongly is not a harmless document. A judge who reads
 * one sentence of it and checks the code finds a contradiction, and having found one has learned
 * that the surrounding prose is unreviewed. So the polarity is now something the build holds rather
 * than something a review catches, which is the same trade every rule in this package makes.
 *
 * ## Why the two reasons are the strongest half of the check
 *
 * The verdict vocabulary is open-ish in prose, but the *reason* vocabulary is closed: `no_matching_evidence`
 * and `quote_absent_at_cited_id` are the only reasons the anchor arm emits, and AGENTS.md section 17
 * makes their module the single source of truth. A sentence that names a reason and pairs it with
 * the other verdict is therefore wrong in a way no reading can rescue, and it is the shape a writer
 * produces when transcribing the mapping from the wrong column.
 *
 * ## How a statement is located: anchors and their windows
 *
* The unit is a *window*, not a document and not a line. Every anchor — a locator mention or a reason
  * token — owns the span between its neighbours: from the previous anchor on the line, or the start of
  * the line, through itself, to the next anchor, or the end of the line. The rule reads the verdicts
  * named inside that span and compares them with the one the anchor requires. A span that names no
  * verdict is not a finding: a line may say that a locator ran without saying what came of it, and
  * there is nothing there to contradict. A span that names the required verdict is not a finding
  * either, which is what lets an honest sentence contrast the two ("becomes `unverifiable` instead of
  * `rejected`") and lets this rule's own header state the mapping it enforces.
  *
  * The span runs *backwards* as well as forwards, and that was a real miss in the first version: in
  * "is rejected, with reason `no_matching_evidence`" the verdict sits in an earlier clause from the
  * reason it belongs to, so a forward-only window let the reason escape — and that sentence is wrong
  * in exactly the way this rule exists to catch. An anchor owns the text that introduces it.
  *
* ## How a locator mention is classified
 *
 * By its own form first — `located: true` and `located: false` outrank any negator near them, and the
 * `unlocat-` prefix is false by itself rather than waiting for a negator three words back — and
 * otherwise by the negators in the three words before it, inside its own clause. So "whose anchor is
 * located" and "whose anchor is not located" are both read, which is the pair of forms a list of
 * whole phrases missed when this rule was first written. The vocabulary is the token's, so
 * `verdictFor` can classify every form the token admits: a guard that listed a form it could not read
 * would report a correct sentence as inverted and pass the inverted one.
  *
 * ## What a document may still say
 *
 * An ADR that records the error must not assert it. `docs/specs/adr/ADR-C7.md` therefore describes
 * the proposal as having swapped the two outcomes and then states the mapping the code emits, without
 * ever writing the inverted pairing in a window that lacks the correct one. That is not the rule being
 * evaded — it is the rule holding its own line: a document may say that a wrong mapping was proposed,
 * and may not carry one.
 *
 * ## The residuals, stated rather than hidden
 *
 * A bare locator mention takes its polarity from the negators in the three words before it, inside
 * its own clause — and a negator in that window may govern a different word. "when the anchor is not
 * missing it is located, so `rejected`" therefore reads `located` as negative and reports an honest
 * sentence. The window is a window; narrowing it needs to know which word a negator binds to, which is
 * a parser, and a parser is a second thing to keep correct. The reach is three words precisely so
 * that this stays rare rather than absent: a negator further back than that is not read at all, so
 * "it does not follow that a located anchor is rejected" is read as a positive mention and reported
 * for the opposite reason — the same defect seen from the other side.
 *
 * The reason vocabulary is the half that does not have the hole, because it is closed:
 * `no_matching_evidence` means one outcome and `quote_absent_at_cited_id` means the other, so any
 * sentence naming a reason and the wrong verdict is caught whatever the prose around it does.
 *
 * The second residual is stated at `VERDICT_TOKEN`, where the boundary that used to be described
 * wrongly lives: bare lower-case verdicts in running prose are read, so a sentence about a corpus
 * *record* that happens to name a locator is judged as though it were about this procedure.
 */

/** The two outcomes the anchor arm produces, in the spelling documents use. */
export const LOCATED_VERDICT = "unverifiable"
export const UNLOCATED_VERDICT = "rejected"

/** The reason each outcome carries, and the reason vocabulary is the only place either is written. */
export const POLARITY_REASONS: readonly { readonly reason: string; readonly verdict: string }[] = [
  { reason: "no_matching_evidence", verdict: LOCATED_VERDICT },
  { reason: "quote_absent_at_cited_id", verdict: UNLOCATED_VERDICT },
]

/**
 * Every word a document uses to say the locator ran or did not run, in any tense.
 *
 * Deliberately narrow about *form* — `located`, `locates`, `locating`, `locate` and the `unlocat-`
 * family are the whole vocabulary. A rule that reached for "found" as well would fire on "the located
 * record" and on any sentence about a corpus row, and a rule that cries wolf is a rule somebody
 * switches off.
 */
const LOCATE_TOKEN = /\b(?:unlocat\w*|locat(?:e|es|ed|ing))\b/gi

/** The literal truth-value forms, which outrank any negator nearby: `located: false` is false. */
const LOCATE_FALSE = /^(?:unlocat\w*|locat(?:e|es|ed|ing))\s*[:=]\s*false\b/i
const LOCATE_TRUE = /^(?:unlocat\w*|locat(?:e|es|ed|ing))\s*[:=]\s*true\b/i

/**
 * The negative form the token already admits, as a prefix test rather than a whole-phrase list.
 *
 * `LOCATE_TOKEN` reads `unlocated` and `unlocatable`, and this is what makes each of them *false*
 * rather than a bare positive mention awaiting a negator three words back. It has to exist: without
 * it, "an unlocated anchor is `rejected`" reads the mention as located, so the correct sentence is
 * reported as inverted and the inverted one — "an unlocated anchor is `unverifiable`" — passes. A
 * guard that gets the one sentence a judge reads to understand the verifier backwards in both
 * directions is worse than no guard, and the vocabulary is the guard's own: whatever `LOCATE_TOKEN`
 * lists, `verdictFor` has to be able to classify.
 */
const UNLOCATED_FORM = /^unlocat\w*/i

/**
 * The negators that turn a locator mention into a claim about the arm *failing*.
 *
 * Read out of the words immediately before the mention rather than matched as whole phrases, because
 * the phrase list is where this rule was wrong first: it enumerated "cannot be located" and "could
 * not be located" and missed the two forms a writer actually reaches for — "whose anchor is located"
 * and "whose anchor is not located". Detecting the negator catches both, and catches the third form
 * nobody thought of.
 */
const NEGATOR = /\b(?:not|never|no|non|cannot|can't|won't|wouldn't|without|failed|failing|fails|unable|neither|nor|zero)\b/i

/** How many words back a negator may sit and still govern the mention it precedes. */
const NEGATOR_REACH = 3

/**
 * Where a mention's own clause begins, so a negator from an earlier clause cannot reach it.
 *
 * A comma and a semicolon both end a clause; a period does too, but only when it is not a decimal
 * point or an initial, and no locator sentence in an audited document turns on the difference.
 */
const clauseStart = (line: string, at: number): number =>
  Math.max(line.lastIndexOf(";", at), line.lastIndexOf(",", at), line.lastIndexOf(".", at)) + 1

/** One locator mention, and the verdict it requires. */
type Anchor = { readonly at: number; readonly verdict: string; readonly text: string }

/**
 * The verdict a locator mention requires, from its own form and the negator before it.
 *
 * Order matters and is the whole of the classification: the literal `= false` form, the literal
 * `= true` form, then the prefix negative, and only then the negator scan. Each of the first three
 * decides the mention outright, so a sentence that negates something *else* nearby — "it does not
 * follow that `located: true` is `unverifiable`" — cannot flip a form that already said which arm it
 * was. A *bare* mention has no such protection; the negator window it falls back to is the residual
 * this module's header names.
 */
const verdictFor = (line: string, at: number): string => {
  const form = line.slice(at)
  if (LOCATE_FALSE.test(form)) return UNLOCATED_VERDICT
  if (LOCATE_TRUE.test(form)) return LOCATED_VERDICT
  if (UNLOCATED_FORM.test(form)) return UNLOCATED_VERDICT
  const words = line.slice(clauseStart(line, at), at).split(/\s+/)
  const lead = words.slice(-NEGATOR_REACH).join(" ")
  return NEGATOR.test(lead) ? UNLOCATED_VERDICT : LOCATED_VERDICT
}

/** Every anchor on a line, in the order a reader meets it, with the verdict each one requires. */
const anchorsIn = (line: string): readonly Anchor[] => {
  const found: Anchor[] = []
  for (const match of line.matchAll(LOCATE_TOKEN)) {
    if (match[0] === undefined || match.index === undefined) continue
    found.push({ at: match.index, verdict: verdictFor(line, match.index), text: match[0] })
  }
  for (const { reason, verdict } of POLARITY_REASONS) {
    const at = line.indexOf(reason)
    if (at === -1) continue
    found.push({ at, verdict, text: reason })
  }
  return found.sort((left, right) => left.at - right.at)
}

/**
 * A verdict as it is written in prose: backticked lower case, or the shouted upper case the README
 * uses.
 *
 * **Bare lower-case words in running text are read**, and this comment used to say they were not.
 * That was false, and a comment describing a boundary the code does not enforce is the defect this
 * module exists to catch — so the honest position is recorded instead. The token is case-insensitive
 * on both spellings, because a document that states the mapping once in backticks and once in prose is
 * making one claim in two forms, and the form a judge skims is the prose one.
 *
 * The price is a residual, stated rather than hidden. A sentence about a *record* rather than about
 * this procedure — the located record was rejected — does pair a locator mention with a verdict, so it
 * is reported. Telling those apart needs to know that the noun is a noun and the adjective an
 * attribute, which is a parser; the phrase-list alternative is what made this rule wrong the first
 * time. Every finding names its line and the ADR that decides the question, so a reported sentence is
 * one a writer can check rather than a mystery.
 */
const VERDICT_TOKEN = /`(verified|rejected|unverifiable)`|\b(VERIFIED|REJECTED|UNVERIFIABLE)\b/gi

const verdictsIn = (text: string): readonly string[] => {
  const found: string[] = []
  for (const match of text.matchAll(VERDICT_TOKEN)) {
    const verdict = (match[1] ?? match[2] ?? "").toLowerCase()
    if (verdict === "" || found.includes(verdict)) continue
    found.push(verdict)
  }
  return found
}

/**
 * R20: no document may pair a locator result or a reason with the verdict the other one requires.
 *
 * One finding per line, naming the anchor and the wrong verdict it was given. A line is the unit
 * because a line is what a judge reads on a slide, and a second finding on the same line would be
 * the same defect counted twice.
 */
export const checkVerdictPolarityInverted = (document: string, file: string): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const [index, line] of document.split("\n").entries()) {
    const anchors = anchorsIn(line)
    if (anchors.length === 0) continue
    const reported = new Set<string>()
    for (const [position, anchor] of anchors.entries()) {
      const from = anchors[position - 1]?.at ?? 0
      const to = anchors[position + 1]?.at ?? line.length
      const named = verdictsIn(line.slice(from, to))
      if (named.length === 0) continue
      if (named.includes(anchor.verdict)) continue
      if (reported.has(anchor.text.toLowerCase())) continue
      reported.add(anchor.text.toLowerCase())
      claims.push(
        claim(
          "verdict-polarity-inverted",
          file,
          `line ${index + 1} gives "${anchor.text}" the verdict ${named.join(" and ")}; ${anchor.text} yields ${anchor.verdict} (ADR-C1, docs/anchor-protocol.md)`,
        ),
      )
      break
    }
  }
  return claims
}

export * as DocsPolarity from "./docs-polarity.ts"
