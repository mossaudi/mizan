# ADR-12 — Precision before cardinality: the suggestion list may be short

- **Status:** Accepted
- **Accepted:** 2026-10-04
- **Namespace:** the numeric namespace continues after ADR-11
- **Source:** the Sprint 1 precision cycle, which measured a live run on the committed corpus and found
  the correct record at rank 1 sharing 35 of 60 folded characters and ranks 2 to 5 sharing 6, 8, 5
  and 5 of 60

## Context

The nearest-quote list is offered beside a `REJECTED` badge. It is display-only — ADR-07 fixed that,
and gate G-7 keeps it fixed — so the question of what it contains is a question about a human's time
and trust rather than about correctness.

A live run on the committed snapshot answered it badly. The list was ordered by shared 3-gram *types*
(`MIN_SHARED_TRIGRAMS = 8`), a unit the reader has never seen and cannot check. Four unrelated hadiths
in the same authoritative numbered format cleared eight shared windows with a fifty-character quote
almost by accident, and all four were printed beside the quote, in the same font, with the same
disclaimer, under a real record's real source URL. The correct record was rank 1 — the ordering was
right — but the reader could not tell it from rows 2 to 5, because **the number that admitted a row
was not printed anywhere**.

Two properties of that failure matter more than the failure itself.

The first is the missing unit. A list filtered by a threshold the reader cannot see is a list whose
filter cannot be argued with. "Why is this here?" had no answer available even in principle, and a
person deciding whether to trust a religious citation deserves better than a list that cannot be
questioned.

The second is what fixing it naively would have cost. The obvious response — raise the 3-gram floor —
trades list length for closeness in a unit that still does not reach the screen, and it would have
re-tuned a *cost* decision (how many rows ranking is allowed to spend a sort key on) in order to fix a
*display* decision (which rows a reader is shown). Those are different jobs. `MAX_ROWS_RANKED` already
records what the first one costs: eight shared types admits 20,796 of 27,234 rows for a fabricated
hadith.

So there were two floors to keep apart, and one of them had no name.

## Decision

**A record is displayed only when it clears a floor stated in the folded characters printed beside it,
and the list may return fewer rows than the cut-off and is never padded to fill it.**

`MIN_SHARED_RUN_CHARS` in `packages/mizan-verify/src/diagnostics/nearest-floor.ts` is the floor. It is
`12`. It is measured as `LongestRun.runChars` — the longest *contiguous* run of shared folded
characters — against `LongestRun.quoteChars`, and those are the two integers the renderer prints on
the row itself. The unit is the unit on the screen, so a reader can compute whether a row they are
looking at should have been printed.

Two integers and no quotient. The `LongestRun` module also carries a `displayPercent`, and it is
deliberately not re-exported: the value is a ratio and a ratio on the display path is the CWE-345
vulnerability wearing a nicer hat (ADR-03). `sharedRunOf` reads the measurement and returns two whole
numbers, so no consumer of this file ever holds a value it could divide.

Containment bypasses the floor. The record that holds the quoted span outright is the nearest record
there is, by definition rather than by measurement, and the floor exists to separate "resembles a
phrase" from "is a different record".

**Precision is reported per rank, with the denominator stated.** `bun run eval:suggestions` prints, for
each rank from 1 to `MAX_TOP_K`, how many cases held the adjudicated anchor at that rank, out of how
many cases displayed a row there, and how many cases were too short to reach it. The denominator is
`displayed`, never the case count. "Nearest-quote suggestions are 94% correct" is not a sentence this
repository is able to publish, and the per-rank table is the replacement: on the committed corpus rank
1 holds 37 of 40 while rank 3 holds 0 of 29.

**The floor is swept on every run of the harness.** The sweep prints, for each candidate floor, how
many of the forty cases still show their anchor anywhere in the list. On the recorded corpus the cost
is zero at every floor from 4 to 20.

**The value 12 rests on the margin and the precision table, and the sweep bounds the downside — not on
a measurement that chose it.** The sweep cannot choose: every candidate floor in the range costs
nothing, because every case in this eval set is a mutation of its own anchor and therefore always shares
a very long run with it. What the sweep establishes is that no floor in the range is too high. What
sets 12 is the margin over the noise rows the live run observed — 6, 8, 5 and 5 shared characters,
against 35 for the correct record — together with the precision table showing ranks 3 to 5 holding
almost nothing. Stating that plainly matters more than claiming a table chose the number.

## Consequences

- A list of one is a success, not a defect. `no_candidates` names which of two failures produced it —
  nothing was near enough to *rank*, or something ranked and was not close enough to *show* — because
  collapsing those two tells a reader their fabrication matched nothing when five records matched it a
  little.
- `NearbyRecord` carries an integer where the schema header previously said it carried no number at all.
  That reversal is written into `display.ts`'s header rather than made quietly, and gate **G-7.12**
  fails the build if a third number, a percentage or a quotient appears beside it.
- The renderer no longer measures anything. It reads `sharedRunChars` and `quoteChars` off the contract.
  The previous arrangement measured the same pair in two modules from two spellings of the inputs, which
  meant the number under a candidate and the decision that admitted it were computed independently —
  and nothing on screen could contradict the threshold.
- Ranks are renumbered after the filter. `NearbyRecord.rank` is documented as dense from 1, and after a
  filter the ranker's own numbers would read 1, 3, 4 — positions in a list the reader never saw. A rank
  that is not the line number misdirects the correction that points a caret at a record.
- The measurement is taken on at most `MAX_TOP_K` rows, inside the clock, and its cost is now part of
  the published latency figure rather than excluded from it. The bound is structural: `sharedRunOf`
  inherits `MAX_QUOTE_CHARS` of 4,096 and `MAX_RECORD_CHARS` of 65,536 from `longestRunFor`, so the
  worst case is five bounded longest-common-substring computations per rejected claim. This is the same
  measurement the renderer previously made per candidate, so no new cost is introduced — but it is now
  inside the number a document publishes, which is where it belongs.
- `MIN_SHARED_TRIGRAMS` keeps its value of 8 and loses its false citation. `suggest.ts`'s header had
  claimed the floor was "anchored to the verifier's `MIN_SPAN_CHARS = 8`", a constant that does not
  exist anywhere in the repository. It now says what it decides: a narrowing and cost floor, reachable
  for measurement through `rankNeighboursAtFloor`, and not a display decision.
- Nothing here can reach a verdict. The floor lives in `diagnostics/`, which gate G-1 keeps out of
  `verify.ts`'s import closure, and `runClearsFloor` is a comparison of two integers against a constant
  that no verdict path reads.