# ADR-05 — The verdict is computed on the quote, never on the model's prose

- **Status:** Accepted

## Context

A claim carries two texts: `Claim.text`, the model's *prose* — its interpretation of what the
source says — and `Claim.quote`, the *quoted span*, which is the falsifiable artefact. They are
different evidence with different properties, and the schema had to say which one the verdict
consumes before anyone could reason about what `verified` meant.

## Decision

The verdict is computed on **`quote` only**. `Claim.text` is never evidence: it is displayed, it is
hashed into the run trace as part of the claim's identity, and it is never tested against a
record. A citation's `grade` field is likewise never used for the verdict — it is whatever the
model said the grade was, recorded as a statement and never as a ruling.

The citation cap is applied **at verification time**, not at decode time, so a model that emits six
citations produces the documented `citation_cap_exceeded` rather than a silently truncated claim.

## Rationale

Verifying prose means verifying the model's opinion of the source, which is circular: the model
asserts a paraphrase, and we check that the record agrees with the model's own summary of it. A
quote is checkable because it is either present in the record or it is not — a binary that needs no
threshold, and therefore cannot be tuned (ADR-03).

Silent truncation at the boundary would be the same defect one layer earlier: an input the system
did not accept, reported as though it had.

## Consequences

- A claim with no quote cannot reach `verified`; it degrades to an honest state with a reason code
  that says why.
- Reason codes distinguish "the record does not contain this" from "no quote was given", so a
  reader is never told the same thing by two names.
- The display shows prose and quote as different fields, so a reader can see which one was checked.
- Nothing in the verdict path may read `text`, which is what keeps the containment check the whole
  of the decision.
