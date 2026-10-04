import type { Database } from "bun:sqlite"
import { errorTag, type Claim, type ClaimVerdict, type CorpusRecord, type NearbyRecord, type Suggestion, type SuggestionScope } from "@mizan/core"
import { fetchSuggestionRecords, scanSuggestionCandidates } from "@mizan/corpus"
import { MAX_TOP_K, rankNeighbours, rankNeighboursInCollection, type RankedNeighbour, type ScannedNeighbour } from "@mizan/suggest"

/**
 * Nearest-quote suggestions: the composition, and the two rules that decide when it happens.
 *
 * ADR-07 records why this feature is display-only and why the package that judges nearness cannot
 * name an outcome; ADR-08 records the scan this module drives and the latency it costs; ADR-09 and
 * ADR-10 record the order this module applies and the deduplication it inherits.
 *
 * ## What this feature is for
 *
 * A judge asks a question, the model answers with a quotation, and the verifier says
 * `REJECTED — not_contained`. That verdict is correct and nearly useless on its own: the reader now
 * knows the quote is not in the record the model cited, and has no idea what the model was probably
 * reaching for. So this feature prints the records that ARE near the quote — "you may have meant
 * these" — labelled as non-authoritative, in the same report, with the badge untouched.
 *
 * ## The three rules, and why each is a rule rather than a preference
 *
 *  1. **Only for a rejection.** A `verified` claim has no problem to locate, and an
 *     `unverifiable` one has no quote to search with. Offering suggestions beside either would be
 *     noise; worse, beside a `verified` badge it would read as the reason for the badge.
 *  2. **Never a badge, never a trace, never an exit code.** This module returns data and the
 *     renderer prints it. It cannot change `ClaimVerdict` because it does not hold one, and
 *     `main.ts` records the trace from `report.claims` — not from anything computed here.
 *  3. **`unavailable` rather than an empty list when the search could not run.** "We looked and
 *     found nothing near your quote" and "we could not look" are different sentences, and a reader
 *     given the first when the truth was the second has been told something false in the one place
 *     this feature exists to be careful (AGENTS.md §16).
 *  4. **Scoped to the cited collection, and widened only on the record.** A citation names a
 *     collection, and answering one with a record from another book answers a different question. The
 *     cited collection is therefore the default scope; the whole snapshot is searched only when that
 *     collection had nothing at all, and then the returned block says so in `scope`, so the reader is
 *     never handed a whole-corpus list wearing a scoped list's clothes.
 *
 * ## Where the cost is
 *
 * One scan of the whole snapshot per rejected claim, measured on the committed corpus at
 * 27,234 records: p50 594 ms, p95 709 ms, max 715 ms, single-threaded, with one row in memory at a
 * time (ADR-08). That is the slowest of five consecutive runs; `docs/specs/measurements.md` is where
 * the figure and the conditions it was measured under are recorded, and
 * `bun run eval:suggestions` prints both together. This is the price of an honest, exhaustive search
 * with no sidecar index — the alternative, an FTS trigram table, was measured at 46 MB for a query p95
 * of 116 ms and it returned nothing at all for three of ten adversarial quotes, because phrase matching
 * over folded Arabic is stricter than the thing it was standing in for.
 *
 * ## Why the texts are carried beside the contract and not inside it
 *
 * `Suggestion` carries metadata; `texts` carries the two text columns, keyed by record id. Corpus
 * text in a shared schema would make every consumer of the contract a potential display of folded
 * Arabic, and `textMatch` must never be printed — it is a matching key, not a transcription
 * (see `SourceExcerpt` in `render.ts`, which states the product rule: render `textDisplay`,
 * compare `textMatch`). One map, one reader, one place that decides which of the two reaches a
 * screen.
 */

/** The two text columns of a nearby record, keyed by `recordId`. */
export type NearbyText = {
  readonly recordId: string
  /** The verbatim text, as the licence requires it to be stored and as the renderer prints it. */
  readonly textDisplay: string
  /** The folded matching key. MEASURED, NEVER DISPLAYED. */
  readonly textMatch: string
}

/** One claim's suggestion pass: the contract, and the texts its candidates were read from. */
export type SuggestionBlock = {
  readonly suggestion: Suggestion
  readonly texts: readonly NearbyText[]
}

/** The metadata a ranked neighbour becomes, from the record the ranking pointed at. */
const nearbyFor = (ranked: RankedNeighbour, record: CorpusRecord): NearbyRecord => ({
  rank: ranked.rank,
  recordId: record.id,
  collection: record.collection,
  number: record.number,
  sourceUrl: record.sourceUrl,
  attribution: record.attribution,
  license: record.license,
  grade: record.grade,
  gradeApplicable: record.gradeApplicable,
  gradeSource: record.gradeSource,
  gradeBasis: record.gradeBasis,
})

const textFor = (record: CorpusRecord): NearbyText => ({
  recordId: record.id,
  textDisplay: record.textDisplay,
  textMatch: record.textMatch,
})

/**
 * Why the search did not run, in one word the reader can act on.
 *
 * The `_tag`, never the error's payload: a decode failure detail can quote the offending value, and
 * corpus text belongs in no log line (AGENTS.md §13).
 */
const unavailable = (reason: string): Suggestion => ({
  state: "unavailable",
  reason: `the corpus could not be searched for nearby records (${reason})`,
})

/**
 * Rank within the cited collection, and widen to the snapshot only when that came up empty.
 *
 * ## Why the widened scope is returned rather than hidden
 *
 * Two failures sit behind one output here, and only one of them is a finding. "There is nothing near
 * this quote in Bukhari" is information: a citation into the wrong collection, or a fabrication that
 * resembles nothing. "There is nothing in Bukhari, but here are three records from other books that
 * share a few windows" is a *different* answer, and it is only useful if the reader knows which one
 * they are reading. So the pair travels as data — `scope` says which was done — and the renderer
 * prints it. A block that quietly widened would be the one place in this product where a reader is
 * told a scoped fact and gets an unscoped one.
 */
const rankForQuote = (quoteFolded: string, rows: readonly ScannedNeighbour[], collection: string | null): { readonly ranked: readonly RankedNeighbour[]; readonly scope: SuggestionScope } => {
  const scoped = collection === null ? [] : rankNeighboursInCollection({ quote: quoteFolded, rows, collection, topK: MAX_TOP_K })
  if (collection !== null && scoped.length > 0) return { ranked: scoped, scope: { kind: "collection", collection } }
  return { ranked: rankNeighbours({ quote: quoteFolded, rows, topK: MAX_TOP_K }), scope: { kind: "snapshot", widenedFrom: collection } }
}

/**
 * Search the corpus for the records nearest a quote.
 *
 * The product asks for `MAX_TOP_K` rather than the default because a judge reading a rejection
 * wants the whole short list, and two extra lines of labelled, non-authoritative context cost
 * nothing next to the answer already on screen. The library default stays at three.
 *
 * @param collection the cited collection, or `null` when the claim named none — which widens the
 *   search to the whole snapshot and says so, rather than guessing a lineage.
 * @returns `null` when there is no quote to be near — which is not a failure and not a search, and
 *   is why the caller renders nothing rather than an apology. Otherwise one of the three states,
 *   with the texts its candidates were read from.
 */
export const suggestionFor = (db: Database, quote: string, collection: string | null = null): SuggestionBlock | null => {
  if (quote.trim().length === 0) return null

  const scan = scanSuggestionCandidates(db, quote)
  if (!scan.ok) return { suggestion: unavailable(errorTag(scan.error)), texts: [] }

  // The scan's own fold is handed to the ranker rather than folding the quote a second time.
  // `foldQuote` is idempotent, so this changes nothing about the result — it keeps the scan's
  // "folded once" contract true instead of leaving the reader to wonder which fold was used.
  const source = scan.value
  const { ranked, scope } = rankForQuote(source.quoteFolded, source.rows, collection ?? null)
  if (ranked.length === 0) {
    return {
      suggestion: {
        state: "no_candidates",
        considered: source.considered,
        scope,
        reason: `no record is close to this quotation (${source.considered} records searched)`,
      },
      texts: [],
    }
  }

  const records = fetchSuggestionRecords(db, ranked.map((entry) => entry.recordId))
  if (!records.ok) return { suggestion: unavailable(errorTag(records.error)), texts: [] }

  const byId = new Map(records.value.map((record) => [record.id, record]))
  const candidates: NearbyRecord[] = []
  const texts: NearbyText[] = []
  for (const entry of ranked) {
    const record = byId.get(entry.recordId)
    if (record === undefined) return { suggestion: unavailable("a nearby record could not be re-read"), texts: [] }
    candidates.push(nearbyFor(entry, record))
    texts.push(textFor(record))
  }

  return { suggestion: { state: "candidates", considered: source.considered, scope, candidates }, texts }
}

/**
 * The collection a citation named, for the search's default scope.
 *
 * The FIRST citation, always, and never a merge over several. A claim may cite up to three records
 * and they need not share a collection; "search everything any citation touched" would be a scope
 * chosen by the model, and a model-chosen scope is not a scope. One collection or none, chosen by a
 * rule a reader can hold in their head — the same rule a citation chip already implies.
 */
const citedCollection = (claim: Claim): string | null => claim.citations[0]?.collection ?? null

/**
 * One pass per claim, positional, so the renderer cannot pair a suggestion with the wrong quote.
 *
 * `null` for every claim that gets no pass — not rejected, or no quotation — and `null` is a
 * statement the renderer prints as nothing at all, because the honest surface for "we did not look"
 * is not printing. A rejected claim with a quotation always produces one of the three states, so a
 * reader is never left guessing whether silence meant "nothing near it" or "no attempt was made".
 */
export const suggestionsFor = (
  db: Database,
  claims: readonly Claim[],
  verdicts: readonly ClaimVerdict[],
): readonly (SuggestionBlock | null)[] =>
  claims.map((claim, index) => {
    if (verdicts[index]?.verdict !== "rejected") return null
    return suggestionFor(db, claim.quote ?? "", citedCollection(claim))
  })

export * as Suggestions from "./suggestions.ts"