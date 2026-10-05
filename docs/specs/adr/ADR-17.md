# ADR-17 - Recall is a precondition; latency is the only figure an index could improve

- **Status:** Accepted

## Context

ADR-08 rejected the SQLite FTS5 trigram sidecar. The reason was not that it was slow — it was the
only option that met the sub-50 ms target, at ~116 ms p95 against ~1.44 s for the exhaustive scan.
It was rejected because it returned **nothing at all for three of ten adversarial quotes**, including
a fabricated hadith derived from the very record it should have matched. Trading recall for latency
would have made the search look excellent and the product dishonest at the same time, and the
product's entire claim is that its citations are computed rather than asserted.

That left a gap, and the gap is what this ADR is about. ADR-08 says an index "may be revisited with
that fixture, never without one." That is the right instinct and it is not a rule: nothing in the
repository refuses a change that drops recall, and the recall figure and the latency figure live in
the same `bun run eval:suggestions` run, side by side, with nothing making the reader weigh them.

Two ways this has already gone wrong, and neither was a bug in the harness:

- **The spike's numbers were not the product's numbers.** ADR-08's table was taken on an earlier
  corpus revision with an earlier harness at approximate figures. It is the record of *why the
  sidecar was rejected*, not a measurement of the shipped path.
- **A latency figure can be published over data nobody can compare.** `vs-search.json` compares
  today's number against a committed baseline and reports a delta. If the underlying eval set is
  regenerated, the denominator moves, the aggregate can stay identical, and the comparison reports a
  pass over evidence that was never comparable. That failure is invisible in the output — which is
  what makes it the dangerous one.

So the question this ADR answers is not "should we add an index." It is: **what has to be true
before a search change is allowed to be judged on latency at all?**

## Decision

**Recall is a precondition, not a figure. A search change may only be recorded once the
suggestion harness has demonstrated it did not lose recall against the currently shipped path, on
the same corpus, under the same conditions.**

1. **Recall is measured before latency, and a recall regression blocks the record.** `bun run
   eval:suggestions` already prints the presence table, the per-rank precision table and the display
   floor sweep ahead of the latency figure, and `--record` writes only after the end-of-run
   attestation re-read. The floor it must clear is the shipped path's own number, read from
   `vs-search.json` — `suggestionRecallGatedTop5` and `suggestionPresenceTop5`, currently 40 of 40.
   A change that drops either may not be recorded, no matter how much it improves p95. There is no
   tolerance band on recall, and there never should be: the band in ADR-08's `LATENCY_BAND_MULTIPLIER`
   exists because wall clock is a property of the machine, whereas a record that is no longer found
   is a property of the code. Recall figures are still **printed** when the gate refuses, because a
   measurement anyone may read is not the same as one published as the shipped baseline — what is
   refused is recording a latency number over a search that lost a record.
2. **Identity before comparison, and identity before recall.** A relative gate asks "did the number
   move?" only after "are these two numbers about the same data?". `schemaVersion` 3 gives every eval
   set a `datasetDigest` and `packages/mizan-core/src/hash/dataset-identity.ts` owns it.
   `identityMismatch` returns `Result<never, string>` — there is no success channel carrying a delta,
   so no caller can compute one across incomparable evidence and merely print a warning beside it. An
   absent digest is a refusal, never a match. `vs-search.json` records the digest it was measured over
   as `suggestionEvalSetDigest`, and `recallRegression` checks it **before** the recall floors rather
   than alongside them: 40 of 40 against a 40-case set and 40 of 40 against a 41-case set are not the
   same measurement, and only the digest can tell them apart. A changed set is refused as a
   denominator shift, not as a regression, because the two send a reader to different files.
3. **The record belongs to the harness, not to the author.** `--record` is the only path that writes,
   it is operator-only, and it owns the whole `suggestion*` namespace in `vs-search.json` so no
   orphaned key survives a renamed cut-off. A number in prose has nothing to contradict it, which is
   how a published p95 drifted away from its measurement once already.

## Consequences

- The shipped exhaustive scan remains. **No index is introduced by this ADR.** It changes what may be
  proposed, not what is built, and the recorded p95 stays within a second of wall clock — an order of
  magnitude above the architecture's target, recorded rather than engineered around for the reason
  ADR-08 gives.
- A future sidecar proposal must arrive with a recall table measured by `bun run eval:suggestions`
  on the same corpus, compared against 40/40. "It was faster on my machine" is not an argument this
  repository accepts, and the 7/10 the spike actually scored is the number a proposal is arguing
  against.
- Every eval set now carries a digest, and the two committed sets publish theirs: golden
  `ds1:0c16dda2…39cb` and red-team `ds1:c9b35dd9…88e5`. A regeneration that changes a set changes its
  identity, so a comparison across the two is refused by construction rather than by review.
- `docs/specs/measurements.md` must publish recall and latency from the same run, with the conditions
  block, or the ordering this ADR depends on is not visible to a reader.
- The 30-second MCP request timeout in ADR-08's path is unaffected: one scan already fits inside it,
  and a search change that made recall depend on a *second* store would add a second thing that can
  be stale — the reason ADR-08 keeps one truth is a correctness argument, not a simplicity one.

## What this ADR does not decide

Whether a recall-preserving index is ever worth building. It sets the bar for arguing it, and records
that the bar has not been cleared. Clearing it is a separate decision requiring its own ADR and its
own measurements, and until one exists the exhaustive scan is the honest answer to a latency target
this product does not meet.
