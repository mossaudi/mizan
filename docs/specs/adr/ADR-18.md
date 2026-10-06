# ADR-18 - The customer claim surface this cycle: artefact-backed, not derived

- **Status:** Accepted

## Context

The v7 baseline (`specs/we-have-a-real-customer-deal-opportunity-the-customer-faces-real-v7.md`,
section 5, line 2216) recorded ADR-18 as *Proposed*: the Python deck generators are read by the
corpus-scope rules but sit outside the audited-document list, so a typed figure inside them escapes
the claim rules, and `ADR-C10` already records a retyped latency figure that drifted 1.77x across
three documents. The proposal: one generator becomes the only producer of customer-facing
comparative claims, the decks and the audited documents render from its output, and a gate sweeps
generators for typed figure literals bound to claim words.

The reconciliation log (`docs/specs/v7-reconciliation.md`) disposes that proposal as **reject** for
this cycle: no generator ships, no `gen:comparative` script exists in package.json, and the plan of
record carries neither the generator story nor its gate sweep. What *is* accepted is the honest
interim state below, so that "rejected" means a recorded alternative rather than an unchecked gap.

## Decision

This cycle publishes customer-facing figures through the audited documents whose figures are
compared against committed artefacts by the `check:docs` rules — `checkMeasuredSetDigest` against
the benchmark artefact, `checkLatencyFigureUnbacked` against the recorded run, `checkCollectionCoverage`
against the red-team set — and does not build a derivation pipeline:

1. figures stay where a rule already reads them back against a file (AGENTS.md section 17: one
   owner per fact, other modules import it);
2. the deck generators remain corpus-scope surfaces, carrying no customer figure of their own that
   this cycle has promised anywhere;
3. the derivation proposal is preserved above as a recorded direction, reopened by a new ADR if a
   later cycle takes it.

## Consequences

- No generator, no generated claims file, and no gate over generator literals exist — so no document
  in this repository claims they do.
- Every figure the customer-facing documents publish today owes its defensibility to an
  artefact-comparison rule, not to derivation. That is a weaker property than ADR-18 proposed, and
  it is stated here rather than left for a reader to discover: derivation would close the
  retyping class of drift outright, while the rules only catch it in the documents they read.
- A later cycle that takes the proposal reopens this record with the generator, the sweep and a
  planted violation that proves the sweep can fail — the three things the proposal called for and
  this cycle deliberately does not ship.
