import { longestRunFor } from "./longest-run.ts"

/**
 * DISPLAY-ONLY closeness floor for the nearest-quote list. NOT part of verification.
 * Do not import from `verify.ts` — gate G-1 fails the build if you do.
 *
 * ## What this file decides
 *
 * Which records the suggestion list is *allowed to print*. Nothing else. It reads one integer — the
 * length of the longest contiguous run of shared folded characters — and answers a boolean. ADR-12 is
 * the decision it implements: precision before cardinality, so a list may return fewer than K rows and
 * one strong row is a success rather than a thin list.
 *
 * ## Why the floor is stated in RUN characters and not in window types
 *
 * The narrowing floor in `@mizan/suggest` is stated in 3-gram types, and the reader has never seen a
 * 3-gram. A live run on the committed corpus put the correct record at rank 1 sharing 35 of 60 folded
 * characters and ranks 2–5 at 6, 8, 5 and 5 of 60 — four unrelated hadiths in the same authoritative
 * numbered format, admitted because a long Arabic text clears eight shared windows with a fifty
 * character quote almost by accident. A floor in a unit the reader cannot see is how that happened:
 * the numbers on screen and the numbers the list was admitted on were in different units, so the
 * screen could not contradict itself and did not have to.
 *
 * So the floor below is stated in exactly the integers printed beside every candidate, and
 * `sharedRunOf` returns precisely the two of them. There is no third measurement to drift from.
 *
 * ## Why `displayPercent` does not appear here, and cannot reach a caller
 *
 * `LongestRun` carries a ratio for the report's own `run:` line. It is deliberately not re-exported:
 * `sharedRunOf` reads the measurement and returns two integers, so no consumer of this file ever holds
 * a value it could divide, and gate G-7.4 would reject a `percent`-shaped property key on the display
 * path anyway. Two integers in a sentence, no quotient (AGENTS.md §10).
 *
 * ## The measurement that chose 12, and what it does NOT prove
 *
 * `bun run eval:suggestions` sweeps the run floors `{4, 8, 10, 12, 16, 20}` over the same 40 cases
 * every run and prints, for each, how many of those cases still show their adjudicated anchor
 * anywhere in the list. On the committed corpus the cost is **zero at every floor in the range** —
 * 40 of 40 anchors shown at 4 and still 40 of 40 at 20.
 *
 * That is a real result and it is not an argument for any particular number, so here is what the
 * value actually rests on, stated rather than dressed up as a measurement:
 *
 *  - The sweep bounds the risk. No floor in this range costs the anchor a single case, so the choice
 *    cannot be "too high" on the recorded set, and the harness reprints the table every run so a
 *    re-ingested corpus that made the floor costly would show it immediately rather than in a
 *    document nobody re-reads.
 *  - The floor's BENEFIT is visible one table above it, in the precision table: at 12 characters
 *    rank 1 holds 37 of 40 anchors while ranks 3 to 5 hold 0, 1 and 0 of denominators that have
 *    already fallen to 29, 24 and 22 — those rows were dropped, and they were the noise.
 *  - The margin is set by the live run on this corpus, where the correct record shared 35 of 60
 *    folded characters and ranks 2 to 5 shared 6, 8, 5 and 5. Twelve sits above every one of those
 *    with room to spare and far below 35.
 *
 * So 12 is chosen from the margin and the precision table, with the sweep proving the downside is
 * currently nil. If a future corpus makes the cost non-zero, the table is where the argument
 * changes — not this comment, which cannot see that corpus.

/**
 * Shared folded characters of CONTIGUOUS overlap a record must reach to be displayed.
 *
 * One constant, one module, one unit — and the unit is the one printed on the candidate's own line
 * (AGENTS.md §17). Containment bypasses it, because the record that holds the quote outright is the
 * answer to "what did they mean?" whether or not the run is long.
 */
export const MIN_SHARED_RUN_CHARS = 12

/**
 * The two integers a reader is shown, and nothing else.
 *
 * `contained` is here because it is a fact about the pair and not a number a caller could divide; it
 * is not exported onto the display contract, where it would be a fourth thing to keep in step.
 */
export type SharedRun = {
  /** Length of the longest common contiguous run, in folded characters — the numerator. */
  readonly sharedRunChars: number
  /** Length of the folded quote — the denominator. Identical for every row of one block. */
  readonly quoteChars: number
  /** True when the folded quote is contained outright in this record. */
  readonly contained: boolean
}

/**
 * Measure the shared run for the display floor, in the reader's own units.
 *
 * Bounds and folding are inherited from `longestRunFor` rather than reimplemented, so the number
 * printed by this file and the number printed beside a badge are the same measurement of the same
 * thing (AGENTS.md §17).
 */
export const sharedRunOf = (rawQuote: string, foldedRecordText: string): SharedRun => {
  const run = longestRunFor(rawQuote, foldedRecordText)
  return { sharedRunChars: run.runChars, quoteChars: run.quoteChars, contained: run.contained }
}

/**
 * The predicate, at an explicit floor.
 *
 * Exported so the coverage harness can sweep floors without reimplementing the rule — and a
 * reimplemented rule is exactly how a harness and a product end up measuring two different things
 * (AGENTS.md §17). The product never calls this: it calls {@link runClearsFloor}, which is this with
 * the shipped floor already applied, because a caller that supplied its own floor would be a second
 * place to change what a reader is shown.
 */
export const runClearsFloorAt = (run: SharedRun, floor: number): boolean => {
  // A floor below one is not a floor. Without this, a sweep that swept `[0, 4, 8, 12]` would admit
  // every record on its first rung and report "no cost at any floor", which is the shape of a green
  // measurement that measured nothing (AGENTS.md §14).
  if (floor < 1) return false
  return run.contained || run.sharedRunChars >= floor
}

/**
 * The one predicate the product uses: may this record be printed?
 *
 * Total. An empty quote yields zero shared characters and does not clear a floor of twelve, so a
 * quote too short to measure produces an honest empty list rather than an exception. `contained`
 * bypasses the floor because containment is the relation the verifier itself decides by — and the
 * record that holds the quote is the nearest record there is, by definition rather than by measurement.
 */
export const runClearsFloor = (run: SharedRun): boolean => runClearsFloorAt(run, MIN_SHARED_RUN_CHARS)

export * as NearestFloor from "./nearest-floor.ts"