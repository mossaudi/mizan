import type { Database } from "bun:sqlite"
import {
  err,
  isOk,
  MAX_QUOTE_CHARS,
  noMatchStrength,
  normalizeForMatch,
  normalizeQuote,
  ok,
  type Citation,
  type Claim,
  type ClaimVerdict,
  type NearbyRecord,
  type Result,
  type SuggestionScope,
} from "@mizan/core"
import { resolveCitations } from "@mizan/corpus"
import { verifyAnswer } from "@mizan/verify"
import { suggestionFor } from "../suggestions.ts"
import { COLLECTION_PATTERN, MAX_TEXT_CHARS } from "./playground.ts"
import { VERIFICATION_BUDGET_MS } from "../instructions.ts"

/**
 * One text, and the records it might belong to.
 *
 * ## Why the search and the verdict are two separate steps
 *
 * The request behind this module is "paste a quote and tell me where it is". Answering it in one
 * step would mean a ranker that emits a verdict, and that is the CWE-345 hole the whole repository
 * is built around: a fuzzy matcher that scores an invented but plausible hadith highly is precisely
 * the fabrication-acceptance path (ADR-03, gate G-1). So the two halves are kept apart and the
 * ordering is what makes them safe:
 *
 *  1. **The search only decides what to look at.** `@mizan/suggest` ranks by shared 3-gram types and
 *     returns real record ids. It is forbidden from the vocabulary a decision is made of, holds no
 *     clock and no randomness, and cannot name an outcome (ADR-07).
 *  2. **Every candidate is then verified on its own merits.** Each row below carries a
 *     `ClaimVerdict` produced by `verifyAnswer` — the same call, the same six steps and the same
 *     budget as `bun run ask` — with the candidate's own citation. A row is VERIFIED only when
 *     strict normalised substring containment says so.
 *
 * So the search can widen, reorder and truncate the list of records the reader is shown, and the
 * list that survives is still decided by containment. A candidate that is nearest by trigrams and
 * does not contain the text is REJECTED, which is the truthful answer and is also the red-team case
 * the demo exists to show.
 *
 * ## Why a scope is a stated input and never a guess
 *
 * `collection: null` means the whole snapshot and the result says so in `scope`. A scope is never
 * inferred from the text: narrowing to "the collection this looks like" would be a model-chosen
 * scope, and a model-chosen scope is not a scope (AGENTS.md section 12, and the same rule the
 * suggestion pass states about the first citation).
 */
export type SearchFormInput = {
  readonly quote: string
  /** The collection to scope to, or `null` for every collection in the corpus. */
  readonly collection: string | null
}

/** A folded text with a letter in it. `\p{L}` is the whole of "has letters", for every script. */
const LETTER = /\p{L}/u

/**
 * Decode the one-field form.
 *
 * `text` is the field name the page posts, and `quote` is accepted as well so the same boundary
 * handles a caller that already speaks the verifier's vocabulary. Both are decoded here and nowhere
 * else (AGENTS.md section 1); the cap is `MAX_QUOTE_CHARS`, which is the verifier's own bound and
 * not a second number.
 */
export const parseSearchForm = (form: Readonly<Record<string, string>>): Result<SearchFormInput, string> => {
  const raw = (form.text ?? form.quote ?? "").trim()
  if (raw.length === 0) {
    return err("paste the text to look for — an empty span cannot be located in the corpus.")
  }
  if (raw.length > MAX_QUOTE_CHARS) {
    return err(`text exceeds ${MAX_QUOTE_CHARS} characters.`)
  }

  const collectionRaw = (form.collection ?? "").trim()
  if (collectionRaw.length > MAX_TEXT_CHARS) {
    return err("collection name is too long.")
  }
  if (collectionRaw.length > 0 && !COLLECTION_PATTERN.test(collectionRaw)) {
    return err("collection must be letters and digits only, starting with a letter.")
  }

  const quote = normalizeQuote(raw)
  if (quote === null) {
    return err("paste the text to look for — an empty span cannot be located in the corpus.")
  }

  // The verifier's own first step treats a diacritics-and-punctuation span as having nothing
  // falsifiable in it, and `normalizeQuote` only rejects whitespace, so the fold has to be asked
  // here rather than inferred from the trimmed length. Refusing is the honest surface: the search
  // would otherwise return `no_candidates` for a span that was never searchable, and a reader cannot
  // tell "we looked and found nothing" from "there was nothing to look for".
  if (!LETTER.test(normalizeForMatch(quote))) {
    return err("that text has no letters left after folding — there is nothing in it to look for.")
  }

  return ok({ quote, collection: collectionRaw.length === 0 ? null : collectionRaw })
}

/** One searched record, with the verdict the verifier computed against it. */
export type CandidateResult = {
  /** Dense from 1 after the display floor. A position in THIS list, never a measurement. */
  readonly rank: number
  readonly recordId: string
  readonly collection: string
  readonly number: string | null
  readonly sourceUrl: string
  readonly attribution: string
  readonly license: string
  readonly grade: string | null
  readonly gradeApplicable: boolean
  readonly gradeSource: string | null
  readonly gradeBasis: string | null
  /** The record's own transcription, which is what the licence requires and what a reader checks. */
  readonly textDisplay: string
  /** Display-only: two integers in the same unit, never a percentage (AGENTS.md section 10). */
  readonly sharedRunChars: number
  /** Computed by `verifyAnswer` for this record, never by the ranker that found it. */
  readonly verdict: ClaimVerdict
}

/**
 * The three states a search can end in, which are three different sentences for a reader.
 *
 * `candidates` means rows are shown. `no_candidates` means the scan ran and the display floor
 * stopped everything. `unavailable` means the scan could not run at all — a different fact, and one
 * that must never be printed as an empty list (AGENTS.md section 16).
 */
export type SearchState = "candidates" | "no_candidates" | "unavailable"

export type SearchVerifyResult = {
  readonly state: SearchState
  /** The reason, in the vocabulary of the suggestion contract, when the state is not `candidates`. */
  readonly reason: string | null
  /** Every row the scan read. Printed, because a recall figure nobody can check is not a figure. */
  readonly considered: number
  readonly scope: SuggestionScope | null
  readonly quoteChars: number
  readonly rows: readonly CandidateResult[]
}

const EMPTY: SearchVerifyResult = {
  state: "no_candidates",
  reason: null,
  considered: 0,
  scope: null,
  quoteChars: 0,
  rows: [],
}

/** One citation naming the candidate, so the verifier resolves the record the ranker pointed at. */
const citationFor = (nearby: NearbyRecord): Citation => ({
  collection: nearby.collection,
  number: nearby.number,
  grade: null,
  raw: nearby.number === null ? nearby.collection : `${nearby.collection}:${nearby.number}`,
})

/** One claim per candidate, each citing exactly the record it is being checked against. */
const claimFor = (quote: string, nearby: NearbyRecord, claimId: string): Claim => ({
  id: claimId,
  // The prose field is never verified and is not what the reader asked about; the quoted span is the
  // whole question, so the two are the same string here rather than one being invented.
  text: quote,
  quote,
  citations: [citationFor(nearby)],
})

/**
 * Verify one candidate, on the same path `bun run ask` uses.
 *
 * `verifyAnswer` is handed a single claim and the evidence for that claim's single citation, so the
 * result is the verdict that citation deserves — `exact_containment` when the record holds the text,
 * `quote_absent_at_cited_id` when it resolves to a real row that does not. Nothing about the ranker
 * reaches this call: the candidate enters as a citation, which is the only shape the verifier
 * accepts.
 */
const verifyCandidate = (
  db: Database,
  snapshotHash: string,
  quote: string,
  nearby: NearbyRecord,
  textDisplay: string,
  index: number,
): CandidateResult => {
  const claim = claimFor(quote, nearby, `search-${index + 1}`)
  const { resolved } = resolveCitations(db, claim.citations)
  const startedAt = performance.now()
  const report = verifyAnswer({
    claims: [claim],
    evidence: resolved,
    snapshotHash,
    deadlineExpired: () => performance.now() - startedAt > VERIFICATION_BUDGET_MS,
  })
  const verdict =
    report.claims[0] ??
    // `verifyAnswer` returns one entry per claim, so this is unreachable for a single-claim report.
    // The honest value is the abstention rather than a throw, because a missing verdict is a
    // degradation the page can state and a crash is not.
    ({ claimId: claim.id, verdict: "unverifiable", reason: "decomposition_failed", matchStrength: noMatchStrength, evidence: null } satisfies ClaimVerdict)

  return {
    rank: index + 1,
    recordId: nearby.recordId,
    collection: nearby.collection,
    number: nearby.number,
    sourceUrl: nearby.sourceUrl,
    attribution: nearby.attribution,
    license: nearby.license,
    grade: nearby.grade,
    gradeApplicable: nearby.gradeApplicable,
    gradeSource: nearby.gradeSource,
    gradeBasis: nearby.gradeBasis,
    textDisplay,
    sharedRunChars: nearby.sharedRunChars,
    verdict,
  }
}

/**
 * Search every collection for `input.quote` and verify each record the search returns.
 *
 * @param scope `null` widens to the whole corpus. `suggestionFor` still prefers the named collection
 *   and widens itself when it is empty, and reports which it did in `scope`, so the reader is never
 *   handed a whole-corpus list wearing a scoped list's clothes.
 */
export const searchAndVerify = (db: Database, snapshotHash: string, input: SearchFormInput): SearchVerifyResult => {
  const block = suggestionFor(db, input.quote, input.collection)
  if (block === null) return EMPTY

  const { suggestion } = block
  if (suggestion.state === "unavailable") {
    // The `unavailable` state carries no counters by construction: the scan failed before it could
    // read anything, so a number beside it would be a figure for work that did not happen.
    return { state: "unavailable", reason: suggestion.reason, considered: 0, scope: null, quoteChars: 0, rows: [] }
  }
  if (suggestion.state === "no_candidates") {
    return {
      state: "no_candidates",
      reason: suggestion.reason,
      considered: suggestion.considered,
      scope: suggestion.scope,
      quoteChars: 0,
      rows: [],
    }
  }

  const textById = new Map(block.texts.map((entry) => [entry.recordId, entry.textDisplay]))
  const rows: CandidateResult[] = []
  for (const [index, nearby] of suggestion.candidates.entries()) {
    const textDisplay = textById.get(nearby.recordId)
    // A candidate whose text cannot be re-read is a corpus failure, not a row to render with a blank
    // transcription — a blank next to a source URL is a claim about the record that was never read.
    if (textDisplay === undefined) {
      return {
        state: "unavailable",
        reason: "a candidate record could not be re-read, so no badge is shown for it",
        considered: suggestion.considered,
        scope: suggestion.scope,
        quoteChars: suggestion.quoteChars,
        rows: [],
      }
    }
    rows.push(verifyCandidate(db, snapshotHash, input.quote, nearby, textDisplay, index))
  }

  return {
    state: "candidates",
    reason: null,
    considered: suggestion.considered,
    scope: suggestion.scope,
    quoteChars: suggestion.quoteChars,
    rows,
  }
}

/** True when at least one record verified the text outright. The only thing the page calls a match. */
export const anyVerified = (result: SearchVerifyResult): boolean =>
  result.rows.some((row) => row.verdict.verdict === "verified")

export * as SearchVerify from "./search-verify.ts"
