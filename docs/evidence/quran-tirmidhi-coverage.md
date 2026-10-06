# Coverage basis: what the coverage figures are measured over (SB-005)

**Recorded by:** SB-005 (CEO sprint plan). **Tags:** coverage, basis, red-team, evidence.

This document is the measurement-basis statement for the coverage figures this repository
publishes — the sentence a reader needs before any coverage number is worth weighing, because a
coverage number with a guessed denominator reads as a claim about the whole corpus.

**The basis phrase, verbatim:**

> the 40-case red-team eval set, drawn round-robin across all six served collections

That sentence is the single basis statement of the coverage claim. It is the value of
`COVERAGE_BASIS_PHRASE` in `packages/mizan-gate/src/docs-coverage.ts`, and that module also names
the two documents that must carry it — this one and `docs/hallmark-coverage-matrix.md` — enforcing
the statement by rule (`checkCoverageBasis`, wired into the surface sweep in
`packages/mizan-gate/src/docs-check.ts`). A coverage figure stated in one of those documents
without the basis phrase fails `bun run check:docs`; the rule is tested in
`packages/mizan-gate/test/docs-coverage.test.ts`, including a test that re-reads both committed
documents, so the check cannot pass on a document that stopped saying what it measured.

## What the phrase names, concretely

- **the 40-case red-team eval set** — `data/eval/redteam-fabricated.json`, the 40 hand-adjudicated
  fabricated cases. Its per-collection composition and its floors are recorded once, in
  `docs/specs/adr/ADR-15.md` (the **Per collection composition** table in that ADR is the owner of
  the numbers; AGENTS.md section 17 — one owner per fact — is why this document keeps none of its
  own). The set's identity is machine-checked by the coverage rules against the same file, so
  "40 cases" is a claim about a committed artefact, not about a memory of one.
- **drawn round-robin across all six served collections** — the selection is slice derivation
  (ADR-15), not a swap of a contiguous prefix: each served collection contributes its slice, and
  the coverage floor is that every collection's slice is present in the eval set. "Six served"
  is the same set the benchmark case types list — the collections this build actually serves —
  and the derivation script `scripts/eval/selection.ts` is the one place the round-robin
  selection is implemented.

## Why the basis is documented twice

`docs/hallmark-coverage-matrix.md` states its coverage scope in its own opening section; this
document states the basis again here because the basis is the *shared* fact between the matrix
document and the eval set, and a reader of the dynamic page should not have to follow a link to
learn what a coverage figure was measured over. The rule requires the phrase in both in-scope
documents, so the two cannot drift: one of them falling out of sync with the basis is a CI
failure, not a footnote.

## Known gaps

- **`quran` and `tirmidhi` sit on the floor.** Each carries two cases in the eval set — measured,
  at the ADR-15 floor of two, and nowhere near a sample; the thinnest measurement sits under the
  corpus's largest collection. The full numbers and their context are owned by
  `docs/specs/measurements.md` (the two-caveats paragraph) and `docs/value-proof.md` (the
  exactly-on-the-floor caveat); this document points at them rather than restating them
  (AGENTS.md section 17 — one owner per fact).
- **This is red-team coverage, not corpus coverage.** The basis above describes a 40-case
  hand-adjudicated fabrication set drawn round-robin across the six served collections. It is not
  an evaluation of either collection end to end, and no corpus-wide figure for `quran` or
  `tirmidhi` is published from it anywhere in this repository.
- **The gap is disclosed, not closed.** Expanding either collection's case count would mean
  re-adjudicating new fabrications into `data/eval/redteam-fabricated.json` — a measurement
  campaign, not a documentation fix, and deliberately out of scope for the story that owns this
  document.

## Fails closed when the measurement cannot be made

If the collections or their index cannot be read, the recorded result is exactly
`measurement unavailable` — never a placeholder, never an estimate, and never a figure with the
basis phrase retro-fitted around it. The corpus is local and this repository's rules read it back
against committed artefacts, so the only way to reach that state is a repository that cannot be
read at all; the sentence exists so that a later reader knows the honest shape of the failure
before they meet it.

## What this document deliberately does not publish

No measured presence table, no per-collection measured figures, and no latency numbers. Measured
figures belong to the documents the artefact rules read back against committed files
(`checkMeasuredSetDigest` against the benchmark artefact, `checkLatencyFigureUnbacked` against the
recorded run); this document is the *denominator*, and a denominator that also carried numerators
would be two owners of one fact.