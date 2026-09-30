# ADR-C5 — Headline metric is the executed system arm; golden 100% always qualified

- **Status:** Accepted
- **Accepted:** 2026-09-29
- **Source:** `specs/for-this-project-need-to-deep-honest-review-and-analysis-and-val.md` §7

## Context

The golden set scores 100% — but it is measured **against the expectations this repository
wrote**, which is self-referential by construction. README discloses this; an oral delivery under
time pressure does not. Meanwhile an executed system-arm result already exists in the tree
(`data/benchmark/vs-search.json`), and by 2026 norms a self-referential evaluation reads weak
beside externally run benchmarks.

## Decision

The committed **executed-verifier** system arm is the headline number. The golden figure may never
appear without its self-reference qualifier, in any document or any spoken answer.

## Rationale

A self-referential 100% is a claim about our own paperwork. The system arm measures the same
verifier path against a fabricated set whose labels the harness cannot see (`scripts/benchmark/` is
structurally forbidden from reading `expectedVerdict`), so it is a measurement rather than a
restatement. Publishing the weaker-looking number that is actually measured is the only version of
this claim that survives a judge checking how it was produced.

## Consequences

- Every document that prints a golden figure carries its self-reference qualifier; a bare golden
  100% is a defect in the document, not a phrasing choice.
- The spoken answer carries the same qualifier, so the oral claim cannot drift from the written one.
- `docs/value-proof.md` prints the artefact's own fields and states the pre-registered hypothesis
  above them, which is what makes the number readable in sixty seconds.
- The benchmark's executor stays structurally unable to read a case's expected verdict, so the
  headline number remains a measurement rather than a restatement.
