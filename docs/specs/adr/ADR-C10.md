# ADR-C10 — A published performance figure is a measured artefact, published with its conditions

- **Status:** Accepted
- **Accepted:** 2026-10-04
- **Source:** the Sprint 1 precision cycle, which found `p95 634 ms` in three documents while
  `bun run eval:suggestions` printed `p95 1121 ms` on the same commit
- **Namespace:** continues the `C` namespace from ADR-C6; the numeric namespace is closed

## Context

`docs/specs/adr/ADR-08.md` stated `p50 570 ms, p95 634 ms, max 662 ms` for the shipped suggestion path.
`docs/degradation-matrix.md` stated `p50 570 ms / p95 634 ms`. Neither number was in any file the
harness writes, and `check:docs` was green while both were wrong. The harness measured the same path
on the same committed corpus at `p95 1121 ms` — a ratio of 1.77.

Two things went wrong, and only one of them is the number.

The first is that a performance figure was recorded **in prose**. Prose has no owner to contradict it:
nothing re-derives the sentence, so the sentence survives whatever happens to the code, and the
corpus it described is re-ingested underneath it. The number was stale twice over, because the corpus
the figure was measured on is not the corpus that is committed now.

The second is that a figure was published **without conditions**, which is what made the drift
possible in the first place even had the number been correct. p95 is a property of the machine as much
as of the code. The `634 ms` and the `1121 ms` were both real measurements of the same function; what
differed was the hardware and the corpus revision, and neither was recorded, so the two numbers looked
like a disagreement about the code when they were a disagreement about the conditions.

The existing claim machinery could not see any of this. `AUDITED_DOCUMENTS` held six files, none of
them ADR-08 or the degradation matrix, and the figure rules that did run - rule ten's artefact
attribution and the promise rule of ADR-C8 - were scoped to `docs/value-proof.md`, the one document that
promises its figures are sourced. Widening that list would switch on seven further rules over documents
written without them, which was assessed as a different piece of work with a much larger blast radius
than the defect it would be chasing.

**Amendment, 2026-10-04 (ADR-13).** That assessment was recorded here as "not written yet" and it was
correct at the time. The widening has since been done: `AUDITED_DOCUMENTS` holds ten documents, the
triage found no drift in the four newly audited ones, and the rule that was missing here is written —
a stated latency must resolve to a recorded figure within a published band, and must name the snapshot
it was measured on. What is now enforced is the second half of this ADR's own decision: the conditions
block is not decoration, because the figure beside it is checked.

## Decision

**A latency figure is published only with the conditions it was measured under, and the conditions are
emitted by the harness rather than written by hand.**

`bun run eval:suggestions` now prints, in the same run as the figure, a `## conditions` block: the
command, the corpus identity (`snapshotHash` and `recordCount`), the case count and the case file, what
the clock covered and what it deliberately excluded, the quantile rule, the cache state, the runtime,
the platform, the CPU, and the declared tolerance. `docs/specs/measurements.md` is the one place a
figure from that harness is recorded, and every other document cites it. The block is an artefact in
the shape `AGENTS.md` §13 requires: an identity, three integers, three strings, no quote and no corpus
text, so a document may quote it verbatim.

**The declared tolerance is 1.5x on p95 and max, chosen from measurement rather than from taste.**
Five consecutive runs of the harness on the recorded machine spanned `p95 632 ms` to `709 ms` — a
widest spread of 1.12x. The drift that reached a document was 1.77x. The band sits above this machine's
own jitter and below the drift that actually happened, which is the only interval in which it does
useful work: it fails a retyped number, a deleted number and a 40% regression, while not reporting
normal machine variance as a regression.

**The figure of record is the slowest of the runs it summarises, not the best.** A published budget
that is flattered is the defect this decision removes.

**Two limits are recorded rather than left implicit, because a rule whose boundaries are unwritten is the
thing this ADR corrects.** First, no multiplier can cover hardware two or three times slower than the
machine named in the block; a band wide enough to accept any hardware also accepts a real regression, so
the answer is the conditions themselves and a reader compares against their own run. Second, the band
cannot catch a figure stated in a shape the rule does not recognise: a bare `709 ms` with no quantity
beside it says which of the three figures it is not, so it is not a claim the rule can judge. The
recognised spellings are enumerated in ADR-13, and a figure written in any other shape is not silently
accepted — it is simply not read, which is a narrower failure than being wrong and is bounded by the
second rule: a document that states *no* recognised latency is out of this rule's business, so a
repository could write its figure in a shape this rule ignores. That limit is stated here rather than
left for a reader to discover.

**What was unwritten and is now written (2026-10-04).** This ADR originally closed by recording that
nothing enforced the block: `check:docs` did not read ADR-08, the degradation matrix or
`docs/specs/measurements.md`, so a stale figure in any of them passed. That gap is closed. Those four
documents are audited, and two rules judge them — a stated latency must resolve to a recorded figure
within the band above, and must name the snapshot it was measured on (ADR-13). The rule reports the
file, the rule name, the stated figure and the measured figure; it never echoes a document's prose into
a build log.

## Consequences

- A re-ingested snapshot changes the `snapshotHash` the harness prints, which makes a quoted copy of the
  block visibly a copy of an older run. The drift is detectable by reading two lines, which is what
  caught the version this ADR corrects.
- `docs/specs/measurements.md` is a document under `docs/`, so the corpus-surface rules apply to it and
  it carries no collection name it does not also renounce.
- The tolerance is a published number rather than a private one, so widening it is a visible change to
  `scripts/eval/suggest-coverage.ts` and its test, not a silent loosening of a check.
- The recall figures deliberately get no tolerance. They are deterministic over the committed corpus, so
  the same commit and snapshot produce the same table byte for byte and a tolerance would only add room
  for a wrong number to hide in.
- Nothing here fetches anything. The block is derived from `node:os` and the committed corpus, so
  `check:docs` stays offline and G-4's secret sweep has no new surface to read.
- The gap this ADR opened with is closed, and the closure is itself checkable: the widened
  `AUDITED_DOCUMENTS` list is what makes it so, and a document added to that list is audited by seven
  further rules written without it. Widening it was therefore a step with its own triage, and the
  triage found no drift in the four documents added.