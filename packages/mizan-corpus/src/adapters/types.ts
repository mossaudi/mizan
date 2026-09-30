import type { GradeBasis, Result } from "@mizan/core"

/**
 * The adapter contract, and the one place a `textMatch` is ever created.
 *
 * ## Why adapters emit `RawRecord`, not `CorpusRecord`
 *
 * An adapter's job is to describe what a source SAYS. Turning that into a `CorpusRecord`
 * requires decisions that are the same for every source — the fold, the id shape, the
 * attribution string, the grade policy — and if each adapter made them, two adapters would
 * eventually make them differently. `toCorpusRecord` makes them once. A licence or id bug
 * then has one location, and a test.
 *
 * ## The grade policy, encoded
 *
 * `grade` is whatever the dataset asserted, and `gradeBasis` says at what granularity:
 *
 *  - `"row"`       this row carries its own grade.
 *  - `"collection"`the whole collection has one stated status, applied to every row.
 *  - `"none"`      the dataset asserts NO grade. `grade` is `null` and the product says so.
 *
 * The third case is the one that is usually implemented wrong, and it matters here. A Qur'an
 * row has no grade because grading does not apply to it; a Bukhari row may have none because
 * the dataset declines to grade a collection it considers uniformly authentic. Neither is a
 * data defect, so neither is quarantined and neither gets a default. **A null grade is a
 * statement, not a hole** (AGENTS.md section 15, ADR-06). `gradeApplicable` exists so the UI
 * can say "grades do not apply here" instead of showing an empty column.
 */

export type RawRecord = {
  /** `"{collection}:{number}"`, or `"{collection}:{seq}"` when the source numbers nothing. */
  readonly id: string
  readonly collection: string
  /** Hadith number or ayah number as a STRING. Never parsed to a number: editions disagree. */
  readonly number: string | null
  /** The source text, verbatim. Never normalised, never trimmed of meaning. */
  readonly textDisplay: string
  /** Per-row source URL when the dataset publishes one. */
  readonly sourceUrl: string | null
  /** Exactly as the dataset asserts it, or null. */
  readonly grade: string | null
  readonly gradeBasis: GradeBasis
  /** Optional translation, never used for a verdict. */
  readonly translation: string | null
}

export type AdapterResult = {
  readonly records: readonly RawRecord[]
  /** Digest of the concatenated response bodies, in fetch order. Reproduced by a re-fetch. */
  readonly sha256: string
  /** Rows dropped, with the reason. Never silently: a dropped row is a licence or format decision. */
  readonly dropped: readonly { readonly reason: string; readonly count: number }[]
}

/**
 * Why an adapter could not produce records.
 *
 * A `Result`, not a throw (AGENTS.md section 2). An upstream outage or a changed file format
 * is a BUSINESS outcome of the ingest, and the registry has to be able to record "this source
 * was not ingested, and here is why" without the process dying. A format change in particular
 * must not be swallowed — it is exactly the case where a silent partial corpus is most
 * dangerous.
 */
export type AdapterFailure = {
  readonly _tag: "adapter_failed"
  readonly reason: "fetch_failed" | "format_changed" | "schema_mismatch"
  readonly detail: string
}

export type FetchContext = {
  /** The allowlisted fetcher from `../http.ts`, wrapped so an adapter cannot bypass it. */
  readonly get: (url: string) => Promise<{ readonly ok: true; readonly body: string } | { readonly ok: false; readonly detail: string }>
  /** Stop after this many rows. Tests and quick runs use it; a full ingest passes `Infinity`. */
  readonly limit: number
  /**
   * How many rows this adapter has accepted so far, for the caller's progress line.
   *
   * Optional, and deliberately the ONLY thing an adapter may say about its own progress. A
   * 36,024-row hadith fetch is minutes of HTTP against an upstream, and a run that prints nothing
   * until it finishes cannot distinguish a slow fetch from a hung one - so the instinct to kill a
   * working run is the expensive mistake, and a caller that wants a heartbeat needs a way to get
   * one that does not involve a second round trip.
   *
   * It is a count and nothing else: no clock, no elapsed time, no bytes, no text. An adapter that
   * reported a duration would be reporting a fact only it can observe, and one it would have to
   * take a clock to observe - the same thing AGENTS.md section 16 lists as a fail-open risk when it
   * appears in a decision module. `runIngest` owns the cadence and the caller owns the clock.
   */
  readonly report?: (rows: number) => void
}

export type SourceAdapter = {
  readonly slug: string
  readonly fetchRecords: (context: FetchContext) => Promise<Result<AdapterResult, AdapterFailure>>
}
