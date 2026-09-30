import { normalizeForMatch } from "@mizan/core"
import { Database } from "bun:sqlite"

/**
 * The baseline arm: a plain FTS5 lexical search, and nothing else.
 *
 * ## The import budget is TWO SPECIFIERS, and it is the design
 *
 * `@mizan/core` for `normalizeForMatch`, `bun:sqlite` for everything else. No retrieval package, no
 * corpus package, no provider, no vector store, no edit distance, no ranking model, no clock, no
 * locale, no randomness.
 *
 * That is not asceticism; it is what makes the comparison honest. The question MIZ-102 asks is
 * "does mizan catch fabrications that a plain lexical search hands to the reader?" and the answer is
 * only meaningful if the other arm IS a plain lexical search. Reusing mizan's own retrieval would
 * be measuring mizan against a version of itself, and every one of the six rigging levers is
 * reachable the moment this file is allowed an opinion about what a good search looks like.
 *
 * Note what the verifier's constraint does NOT say. Gate G-1 forbids similarity in
 * `packages/mizan-verify/`, and FTS5's `bm25` is a lexical relevance function over an index — not a
 * similarity measure between two texts. Using it here is the entire point of the comparison. The
 * gate is scoped to the verifier, so this file is outside it, and the import budget above is what
 * keeps it outside in substance and not only in location.
 *
 * ## What "plain" means, precisely
 *
 * The query is the fabricated quote, folded, as an FTS5 **terms-ANY** expression: every token it
 * contains, quoted, OR-ed together. The ranking is FTS5's own `bm25` over the folded `body` column.
 * The answer is the top `k` record id, ties broken by record id. Nothing else is consulted: not the
 * collection the citation names, not the record id the case cites, not a second attempt with
 * different terms.
 *
 * The last of those matters more than it looks. Someone who pastes a fabricated quote into a search
 * box gets exactly this. A comparison that quietly added the citation's collection would be
 * measuring someone who already knows which collection the answer lives in, and that is not the
 * claim anyone makes about lexical search.
 *
 * ## Why terms-ANY and not a phrase — the number this decision moves
 *
 * `MATCH 'a b c'` in FTS5 means the *adjacent phrase* `abc`. Every red-team quote is a real span
 * with words changed, so a phrase query matches nothing at all and the baseline's top-1 hit rate
 * comes out at **0.0**. That number would flatter us, and it would be a fiction: someone who pastes
 * a fabricated hadith into a search box gets the real hadith back at rank 1, because a search box
 * asks for the terms it recognises and ranks by how many of them a document has. Measured on the
 * 40 red-team cases against the attested corpus, the terms-ANY form returns the cited record at
 * rank 1 for 26 of them — "a substantial majority", which is what the pre-registered hypothesis
 * says it expects. The harness therefore asks the question a search box asks, because a comparison
 * whose baseline is too weak to be believed measures nothing.
 *
 * ## That 26 is checked, not remembered
 *
 * It is the one figure in this file that is NOT a function of the SET: it was measured against the
 * attested 27,234-record corpus, a gitignored artefact no unit test may require, which is why the
 * two claims above are derived from a case list and this one is not. It is still checkable, because
 * the RESULT is committed — the 26 is `data/benchmark/vs-search.json`'s `baselineTop1HitRate` over
 * its `caseCount` (`0.65` over `40`), written by `bun run benchmark:vs-search`. The prose claim is
 * spelled as a value in `PUBLISHED_BASELINE_TOP1_HITS` below, for the same reason
 * `FTS5_GRAMMAR_CHARACTERS` is exported, so the self-test checks this paragraph against that file
 * rather than re-asserting it (AGENTS.md §17). Re-measure and the number moves; the test fails and
 * says so, instead of this paragraph going quietly stale.
 *
 * The direction is the point. A query shape chosen to make the baseline look bad is the flattering
 * metric the specification names as a security defect, and 0.0 would have been exactly that.
 */

/** One case, reduced to what the baseline needs. Structural, so no eval type is imported. */
export type BaselineCase = {
  readonly id: string
  readonly quote: string
  /** Present only so `rigged.ts` can plant a defect. NEVER read by the honest path. */
  readonly anchorId: string
  readonly citation: { readonly collection: string; readonly number: string | null }
}

/** What the baseline returned for one case. */
export type BaselineResult = {
  readonly caseId: string
  /** The top record id, or null when the query matched nothing at all. */
  readonly topRecordId: string | null
}

/** What the baseline is allowed to be told to do. Mirrors `BaselineDeclaration` field for field. */
export type BaselineOptions = {
  /** "fts5-bm25" is the honest strategy. The other two exist so a defect can be planted. */
  readonly strategy: "fts5-bm25" | "id-order" | "rerun-until-found"
  readonly column: "textMatch" | "textDisplay"
  readonly collectionFilter: boolean
  readonly usesGoldRecordId: boolean
  readonly k: number
  readonly rerunBudget: number
}

/** The honest options. The one place they are written down, and `run.ts` reads them from here. */
export const HONEST_OPTIONS: BaselineOptions = Object.freeze({
  strategy: "fts5-bm25",
  column: "textMatch",
  collectionFilter: false,
  usesGoldRecordId: false,
  k: 1,
  rerunBudget: 0,
})

/**
 * The FTS5 MATCH expression for a text: every token, quoted, OR-ed.
 *
 * ## Quoting here is a CONTROL, not tidiness
 *
 * A bound parameter stops the text from becoming SQL. It does nothing about FTS5's own query
 * grammar, which lives *inside* the string the parameter carries: `-` is NOT, `:` introduces a
 * column filter, `.` `(` `)` `*` `^` `OR` `NEAR` are all syntax. Unquoted, a corpus span containing
 * ` - ` turns the following word into a column name and the query dies with `no such column: ...`,
 * and a span containing `.` is a bare syntax error. Five of the forty red-team quotes do one or the
 * other, so an unquoted harness did not produce a number — it threw part-way through the set, at
 * `redteam-009`, and a benchmark that dies on its own input is not a benchmark that scored low.
 *
 * Quoting each token, and doubling an embedded `"` because that is how FTS5 escapes one, means the
 * text can only ever arrive as tokens. This is A03 at a text-shaped trust boundary: the quote is
 * untrusted, model-influenced input, and the grammar it reaches is not SQL but is still a grammar.
 *
 * An empty result — a quote that is nothing but punctuation — is returned as an empty expression
 * rather than as `MATCH ''`, which is a syntax error too. The caller reads an empty expression as
 * "nothing to ask", and the case scores as no hit, which is the honest answer.
 *
 * ## The two claims this doc makes are now CHECKABLE, not prose
 *
 * "Five of the forty, and the first is `redteam-009`" is a statement about the SET, not about the
 * corpus, and a claim about the set is a pure function of the set. So the character set it counts is
 * exported as `FTS5_GRAMMAR_CHARACTERS` below rather than restated in the self-test, and the
 * self-test derives both numbers from it. A correction like the one that replaced "the fifth case"
 * with the case's own id can then be re-checked instead of re-asserted (AGENTS.md §17).
 */
const termsAny = (text: string): string =>
  text
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(" OR ")

/**
 * The characters that make FTS5 read a MATCH expression as a query rather than as words.
 *
 * Exported for the one reason above: the number of at-risk quotes is a fact about the set, and this
 * is the single spelling of "at risk". It counts the punctuation that carries grammar meaning —
 * `-` (NOT / column filter context), `:` (explicit column filter), and `.` `(` `)` `*` `^` (phrase,
 * grouping, prefix and first-token syntax). `OR` and `NEAR` are also grammar but only as bare
 * words, and every token this harness builds is quoted, so they cannot survive into the expression.
 */
export const FTS5_GRAMMAR_CHARACTERS = /[-.:()*"^]/u

/**
 * The second checkable claim: the file doc's "26 of them", as a value.
 *
 * Exported for the reason `FTS5_GRAMMAR_CHARACTERS` is — a number written in prose and retyped in a
 * test are two numbers, and AGENTS.md §17 asks for one. The self-test multiplies this by
 * `caseCount` and compares it against the committed artefact's `baselineTop1HitRate`, so the prose
 * above and the published figure are asserted to be the same fact rather than two that happen to
 * agree today.
 *
 * It moves only with the corpus, so a failure here means one of two things and the test names both:
 * the measurement was re-run and the artefact moved, so this constant and the doc comment move with
 * it; or neither moved and something upstream is wrong. What it must never do is be adjusted to make
 * a red test green — that is the flattering-metric move the whole benchmark exists to prevent.
 */
export const PUBLISHED_BASELINE_TOP1_HITS = 26

/**
 * Ask FTS5 and return the top `k` record ids, ranked by its own `bm25`.
 *
 * The join is on `records_fts.recordId`, which the snapshot declares `UNINDEXED` — the id is
 * carried alongside the indexed body so a match can be traced back to a row without the id itself
 * polluting the ranking. `ORDER BY bm25(records_fts)` is FTS5's relevance function with a lower
 * value meaning a better match, so the ordering is ascending. Both facts come from the snapshot's
 * own schema rather than from memory, which is why a schema change here fails loudly instead of
 * silently returning nothing.
 *
 * **`r.id` is the tiebreak, and it is declared rather than left to chance.** `bm25` is a float over
 * a corpus where two records can score identically, and with `k = 1` SQLite would then pick
 * whichever row the query plan reached first. An undeclared tiebreak is the one input a judge
 * cannot reproduce from our repository, and the byte-identical requirement is not worth trading for
 * a clause nobody wrote down.
 */
const searchFts = (db: Database, options: BaselineOptions, expression: string): readonly string[] => {
  if (expression.length === 0) return []
  const rows = db
    .query<{ readonly id: string }, [string, string]>(
      "SELECT r.id FROM records_fts f JOIN records r ON r.id = f.recordId WHERE records_fts MATCH ? ORDER BY bm25(records_fts), r.id LIMIT ?",
    )
    .all(expression, String(options.k))
  return rows.map((row) => row.id)
}

/**
 * The rigged `id-order` strategy: return the corpus in id order, ignoring the query entirely.
 *
 * It exists so the self-test has a baseline that "finds" things with no retrieval at all. Its hit
 * rate ends up low by luck, which is exactly what makes it a useful planted defect: the failure is
 * not that the number looks wrong, it is that the number has stopped measuring retrieval.
 */
const strategyIdOrder = (db: Database, options: BaselineOptions): readonly string[] => {
  const rows = db.query<{ readonly id: string }, [string]>("SELECT id FROM records ORDER BY id LIMIT ?").all(String(options.k))
  return rows.map((row) => row.id)
}

/**
 * The rigged `rerun-until-found` strategy: re-ask with progressively shorter queries until the
 * record the case cites turns up.
 *
 * This is the most seductive of the six, because it is a real technique — someone retrying a search
 * with fewer words does exactly this — and it produces a *plausible* 100%. That plausibility is the
 * danger. A reader sees a perfect score and concludes the lexical baseline is wonderful, when the
 * number describes a system that was told the answer before it started.
 *
 * `usesGoldRecordId` is honoured here too, because this is the strategy where "keep going until the
 * cited record appears" is the whole algorithm rather than a query term.
 */
const strategyRerunUntilFound = (db: Database, options: BaselineOptions, text: string, testCase: BaselineCase): readonly string[] => {
  const words = text.split(/\s+/u).filter((word) => word.length > 0)
  for (let attempt = 0; attempt <= options.rerunBudget; attempt += 1) {
    const shortened = words.slice(0, Math.max(1, words.length - attempt)).join(" ")
    const expression = termsAny(shortened)
    if (expression.length === 0) continue
    const found = db
      .query<{ readonly id: string }, [string, string]>(
        "SELECT r.id FROM records_fts f JOIN records r ON r.id = f.recordId WHERE records_fts MATCH ? AND r.id = ? LIMIT 1",
      )
      .get(expression, testCase.anchorId)
    if (found !== null && found !== undefined) return [found.id]
  }
  return []
}

/**
 * The text the baseline ASKS with, and the one remaining query-level defect.
 *
 * `column` selects the text the query is built from: the folded quote, which is what the index was
 * built from, or `textDisplay` — raw, undiacriticized text. Asking with raw text against a folded
 * index matches almost nothing, so this defect shows up as a near-zero rate rather than a
 * suspiciously high one, which is why it needs planting to be noticed.
 *
 * `usesGoldRecordId` is not here. The most blatant of the six: it makes the baseline's ANSWER the
 * record id the case cites, so the baseline is not searching for anything. It is applied in
 * `runBaseline` before a query is ever built, because `abudawud:1` is not an FTS5 query — handing it
 * to `MATCH` asks FTS5 for a column named `1` and the planted defect dies with an error instead of
 * producing the flattering 100% it is supposed to produce. A guard that only fires by crashing is a
 * guard nobody can read.
 */
const queriedText = (options: BaselineOptions, testCase: BaselineCase): string =>
  options.column === "textMatch" ? normalizeForMatch(testCase.quote) : testCase.quote

/**
 * Run the baseline over every case.
 *
 * One arm, no fallback, no retry beyond the declared budget: the loop is over CASES, and each case
 * gets exactly as many attempts as its declaration allows. `rerunBudget: 0` is the honest value and
 * the `+ 1` is what makes zero mean one attempt rather than none — a budget spelled "extra tries" is
 * the only reading under which `0` and `1` cannot be confused.
 */
export const runBaseline = (db: Database, cases: readonly BaselineCase[], options: BaselineOptions = HONEST_OPTIONS): readonly BaselineResult[] =>
  cases.map((testCase) => {
    // Defect (b), applied first and without building a query: the baseline is handed the answer.
    if (options.usesGoldRecordId) return { caseId: testCase.id, topRecordId: testCase.anchorId }

    const text = queriedText(options, testCase)

    if (options.strategy === "id-order") return { caseId: testCase.id, topRecordId: strategyIdOrder(db, options)[0] ?? null }
    if (options.strategy === "rerun-until-found") {
      return { caseId: testCase.id, topRecordId: strategyRerunUntilFound(db, options, text, testCase)[0] ?? null }
    }

    const found = searchFts(db, options, termsAny(text))
    // `collectionFilter` narrows the results to the cited collection. Rigged because someone
    // following one citation would do it, and a search box would not.
    const inCollection = options.collectionFilter
      ? found.filter((id) => id.startsWith(`${testCase.citation.collection}:`))
      : found
    return { caseId: testCase.id, topRecordId: inCollection[0] ?? found[0] ?? null }
  })

export * as Baseline from "./baseline.ts"
