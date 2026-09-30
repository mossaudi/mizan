# ADR-C1 — Elision verdict is `UNVERIFIABLE`, not `REJECTED`

- **Status:** Accepted
- **Accepted:** 2026-09-29
- **Source:** `specs/for-this-project-need-to-deep-honest-review-and-analysis-and-val.md` §7
- **Supersedes:** the `knownDivergence` record retired at eval schema v2

## Context

The specification and the 26 hand-adjudicated rulings in `data/eval/adjudication.json` both say
that a paraphrase or an elision of a real quote is **unverifiable**, while `verify.ts` returned
`rejected` for the same claim. Two authorities disagreed about one verdict, and the disagreement
was stamped into the eval artefact as a known divergence rather than resolved.

## Decision

A citation whose identifier resolves to a real record but whose quoted span does not occur in that
record returns `UNVERIFIABLE` with reason `no_matching_evidence`, mechanised at the anchor step
(step 5b of `verify.ts`). Code, specification, documentation and the 26 rulings now agree, and the
regression that owns the 26 cases is the arbiter of the agreement.

## Rationale

An elided paraphrase has **no matching evidence** — it is not a disproof. `REJECTED` asserts that
the claim was checked and found absent; `UNVERIFIABLE` states that the check could not be
completed against the evidence given, which is what actually happened. Verdict consistency between
the spec, the docs and the code is scored, and the human rulings are the ground truth, so the code
moves rather than the rulings.

## Consequences

- Divergence language is removed from `README.md` and `docs/anchor-protocol.md`.
- The 26 cases become an owned regression suite (`packages/mizan-verify/test/adjudicated-elisions.test.ts`).
- The badge map stays a compile-time-complete function; no new verdict was introduced.
- The arm is **opt-in**: with no anchor supplied the path is unchanged and still `rejected`, which
  is asserted by a planted test rather than assumed.
