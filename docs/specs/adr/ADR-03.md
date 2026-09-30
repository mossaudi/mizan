# ADR-03 — No similarity in the verdict path: strict normalized substring containment

- **Status:** Accepted

## Context

A feasibility spike tested the fallback every retrieval-augmented generator reaches for: score the
quote against the record and accept it above a threshold. A **fuzzy score of 0.89 ranked an
invented hadith above a faithful paraphrase** of a real one. That is the CWE-345
fabrication-acceptance hole — an invented but plausible religious text scores as a match, and the
product then transfers false authority onto someone making a religious decision.

The alternatives were considered and rejected with it: edit distance, token-level Levenshtein,
embedding similarity, an LLM judge, and any threshold tuned on a handful of cases. A threshold
tuned on the 26 adjudicated cases would be tuned on exactly the data it is meant to be judged
against.

## Decision

Every route to a `verified` verdict terminates in **strict normalized substring containment**: the
quoted span, after deterministic normalisation, must be literally contained in the specific corpus
record the answer cited. Nothing else — no similarity score, no percentage, no edit distance, no
fuzzy fallback, no model judgement — can produce `verified`.

`packages/mizan-verify` declares exactly one dependency (`@mizan/core`) and contains no network
call, no clock, no locale and no randomness. The display-only similarity diagnostic lives in
`src/diagnostics/`, which the verifier is forbidden from importing; gate **G-1** enforces both the
dependency isolation and that separation.

## Rationale

A verifier that can be talked into confirming a fabrication is worse than no verifier, because it
is the only component a reader would believe. The containment property is simple enough to be
checked by reading it, and small enough to be proved by a test — which is what makes the badge a
computation rather than an assertion.

## Consequences

- Paraphrase and elision **fail closed**: no matching evidence is `unverifiable`, never `verified`
  (see ADR-C1).
- `MatchStrength` is a constrained type — exact or none — and a fuzzy percentage may exist only in
  a display-only module. A judge-facing percentage that was computed by similarity is the same
  vulnerability wearing a nicer hat.
- The anchor arm (step 5b) is a *locator*, not a score: its return type admits only `unverifiable`
  or `null`, so it can withhold a badge and never mint one.
- Measured cost of the honest answer is published rather than engineered away: the red-team
  movement is asserted against the published figure, not tuned to it.
