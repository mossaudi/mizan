# ADR-13 — A published latency figure is checked against the recorded artefact, and its corpus is named

- **Status:** Accepted
- **Accepted:** 2026-10-04
- **Namespace:** the numeric namespace continues after ADR-12
- **Closes:** the gap recorded as open in ADR-C10
- **Supersedes:** nothing. ADR-C10 published the conditions block; this ADR makes the figure beside it
  machine-checked, which is the half it explicitly left unwritten.

## Context

ADR-C10 recorded the conditions block and closed one half of the problem: a latency figure now travels
with the corpus identity, the command, the case count, what the clock covered, the quantile rule, the
cache state, the runtime, the platform, the CPU and the declared tolerance, all emitted by the harness
rather than written by hand.

It also recorded, in its own words, the half it did not close. `check:docs` did not read ADR-08, the
degradation matrix or `docs/specs/measurements.md`, so a stale figure in any of them passed. The rule
that would close it — a latency figure in an audited document resolving to a recorded figure, within
the band — was described there as unwritten rather than as under way, which was the correct thing to
say at the time.

Two properties of that gap made it worse than a missing feature.

The first is where the documents were. `AUDITED_DOCUMENTS` was a closed six-element list, and every
per-document rule ran only over it. ADR-08 and the degradation matrix — the two documents holding the
figure that had drifted — were **not on the list**. A rule written as designed would have been green
forever while the numbers it targeted sat unchanged. This is the same shape of defect as a figure rule
scoped to a document list that excludes the documents holding the defect, and it is the reason this
ADR names the list rather than assuming it.

The second is where the numbers would have lived. `readFigures` in `docs-value.ts` collects
top-level numeric keys from the parsed artefact, so an artefact shaped `latency: { p95: 754 }` would
have produced a permanently green rule that never had anything to compare. The existing
`vs-search.json` is flat for exactly this reason.

Widening `AUDITED_DOCUMENTS` was budgeted as its own step with its own triage, because adding a dense
prose document switches on seven further rules over it. The triage found nothing: `docs/degradation-matrix.md`,
`docs/scaling-path.md`, `docs/specs/measurements.md` and `docs/specs/adr/ADR-08.md` were all added and
`check:docs` stayed green. The finding burst this ADR was warned about did not happen, and the four
documents are audited rather than reachable by a special case.

## Decision

**A latency figure stated in an audited document must agree with the recorded artefact within a
published tolerance band, and must name the corpus it was measured on.** Two rules, `checkLatencyFigureUnbacked`
and `checkLatencyCorpusNamed`, in `packages/mizan-gate/src/docs-value-latency.ts`.

**The rules extend `checkBenchmarkClaimUnbacked`; they do not reimplement it.** Rule ten already answers
"is this figure in the artefact, and is it attributed to the quantity it belongs to" over every
benchmark section in every audited document. Duplicating that would give the repository two answers to
one question, and the copy would be the one that drifted. Both read the same artefact. The only things
added are the two rule ten has no opinion about:

- **A tolerance**, because exact equality on a wall clock is a coin flip, and a rule that fails at
  random gets deleted. A deleted rule is a green build.
- **The corpus identity**, because a latency figure without the snapshot it was measured on is a number
  about nothing, and a figure can agree with the artefact and still describe a corpus this repository
  no longer serves — invisible to the comparison precisely because the artefact was re-recorded after
  the re-ingest.

**The artefact stays flat and top-level.** Every key the rules read — `suggestionLatencyP50Ms`,
`suggestionLatencyP95Ms`, `suggestionLatencyMaxMs`, `suggestionLatencyBandMultiplier` and the
`suggestionCorpusFingerprint` string — is a top-level member of `data/benchmark/vs-search.json`, and a
missing key is reported rather than defaulted.

**`bun run eval:suggestions --record` is the only writer, and it replaces the whole `suggestion`
namespace rather than merging into it.** A merge left an orphan when the recorded key set changed: an
earlier iteration keyed the presence columns by array index, and the merged artefact kept a
`suggestionPresenceTop2` holding top-3's number, plausible-looking and owned by nothing. The retrieval
keys above the namespace are untouched.

**p50 and p95 are checked both ways within the band. `max` is checked one-sidedly, in the direction that
can hide a defect.** Measured on the recorded machine over five consecutive runs: p50 spanned 632–655 ms
(1.04x), p95 spanned 736–773 ms (1.05x), and `max` spanned 743 ms to 2,110 ms (2.84x). A single sample
has no noise suppression, so no symmetric band on `max` is honest — 1.5x would reject four of the five
runs the figure was derived from. A stated `max` **below** the recorded one is flattery and fails; a
stated `max` above it is the conservative direction and is reachable only by a slower machine, which the
conditions block already tells a reader to compare against their own run. This is a judgement about
which error matters, written down here so a reader who disagrees can disagree with the argument rather
than guess at it.

**The figure of record is the slowest of the runs it summarises, never the best and never a mean.**
ADR-C10 chose that rule before this one needed it. The measured `max` it produces is an outlier — one
case in one of five runs took 2,110 ms while the other four maxima were between 743 ms and 815 ms — and
that is published rather than trimmed, because a trimmed maximum is exactly the flattering figure this
repository exists to refuse. A mean would be tidier and would accept understatement, which is the drift
that actually happened here.

## Consequences

- **A published latency figure is no longer prose.** `docs/specs/measurements.md` is the figure of
  record; ADR-08 and the degradation matrix cite it, and all three are audited documents, so a retyped
  number now fails `bun run check:docs` naming the document, the stated value and the measured value.
- **A document stating a latency must name the snapshot** — as the full `snapshotHash` or as the
  16-character short form `README.md` already prints. The short form is adopted rather than minted here,
  so the rule matches a convention the repository already had; 64 hex characters repeated in three prose
  documents would be three copies of a fact that lives in one file (AGENTS.md §17), and a 64-character
  string in a table cell is a row nobody reads. Both spellings pass, because a document already carrying
  the full hash has said strictly more and must not be told it said too little.
- **A latency figure and its corpus identity now travel together in every document that prints one.**
  `docs/degradation-matrix.md` and `docs/specs/adr/ADR-08.md` carried the figure without the identity,
  which is the drift this ADR was written about; both now name the recorded snapshot.
- **The recorded figure is a snapshot of one machine.** No multiplier covers hardware two or three times
  slower than the one named in the conditions block; a band wide enough to accept any hardware also
  accepts a real regression. The answer is unchanged from ADR-C10: the conditions travel with the
  figure, so a reader on other hardware compares against their own run rather than against ours. What is
  new is that the disagreement is now *detected* rather than merely described.
- **The rule is only as good as its pattern.** `checkLatencyFigureUnbacked` recognises a figure written
  as `p95 773 ms` and the close spellings of that, because a bare `773 ms` with no quantity beside it
  does not say which of the three figures it is. A latency figure written in some other shape is not
  judged. That is stated in the module rather than left as a silent gap, and the documents in this
  repository were written against the pattern rather than the pattern written to fit the documents.
- **ADR-C10's "unwritten" paragraph is now wrong and says so.** It was left in place with an amendment
  pointing here, rather than edited into something it never said — rewriting an accepted ADR's history
  to make it look prescient is worse than the error it corrects.
- **The gate count is unchanged at seven.** `GATE_IDS` is derived from the `GATES` array, so adding
  rules inside G-7 and inside the docs sweep does not change the published number, and `docs-gates.ts`
  still fails `check:docs` if any document states a different one.
- Nothing here fetches anything, re-measures anything, or opens the corpus. The rules read two
  committed files, so `check:docs` stays offline and G-4's secret sweep has no new surface to read.
  Agreement between a document and an artefact is not agreement between a document and reality; the
  artefact is what the harness measured, and the harness is what a reader can re-run.