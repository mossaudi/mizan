# ADR-C7 — The anchor arm's verdict polarity, and that the code is the authority for it

- **Status:** Accepted
- **Accepted:** 2026-10-01
- **Source:** the CEO strategic review of 2026-10-01, whose ADR-05 proposes the mapping this record reverses
- **Reconciles:** ADR-C1, which the code already implements

## Context

A specification proposed that a claim whose anchor is located but whose quoted span diverges should
be `REJECTED` as having no matching evidence, and that a claim whose anchor cannot be located should
be `UNVERIFIABLE`. That is the inverse of what the repository does, and the repository has done it
since the arm was added.

`anchoredOutcome` is step 5b of `packages/mizan-verify/src/verify.ts`, reachable only after
containment has failed. When the anchor *is* located, the cited record exists and does not disagree
with the claim — it merely does not contain the abridgement — so absence of evidence, not disproof,
and the verdict is `unverifiable` with reason `no_matching_evidence`. When the anchor is *not*
located the function returns `null`, the claim falls through to step six, and the verdict is
`rejected` with reason `quote_absent_at_cited_id`. ADR-C1 records that decision and the 66 human
rulings behind it; `docs/anchor-protocol.md` states the mapping correctly in prose.

Shipping the specification's wording would therefore have put a false statement about the verifier
into the document a judge reads to understand it. The cost of that is not the wrong sentence: it is
that a judge who checks one sentence and finds it inverted has learned the surrounding prose is
unreviewed, and the rest of the submission inherits that.

## Decision

The mapping is the one the code emits, and this document is its authority:

| Locator result | Verdict | Reason |
| --- | --- | --- |
| anchor located | `unverifiable` | `no_matching_evidence` |
| anchor not located, no deadline fired | `rejected` | `quote_absent_at_cited_id` |

A deadline that fires during the search yields `unverifiable` with reason `verification_timeout` from
step four, before the anchor arm is reached at all. It is not a third arm of the mapping: it is the
same verdict reached by a different route, and it is recorded here because a document that leaves it
out invites a reader to infer that a timeout is a disproof.

ADR-C1 is reaffirmed, not replaced. This record exists because the inverse was written down
somewhere and had to be answered; ADR-C1 exists because the specification and the code disagreed
about one verdict and the code was moved. The second is the substantive decision and it stands.

The distinction the documents must keep visible is between the **human ruling** and the **procedure
output**. The 40 red-team fabrications are ruled `rejected`: a person read each claim against its
source and recorded that it asserts something the source does not say. What the procedure then emits
is `unverifiable`, because an anchor drawn from a largely real span locates. Both are true, they are
different questions, and conflating them is how a document ends up describing a verifier that does
not exist.

The polarity is now checked, not reviewed. `packages/mizan-gate/src/docs-polarity.ts` reports a
document that pairs a locator result or a reason with the verdict the other one requires, naming the
file and the line.

## Rationale

`unverifiable` on a located anchor is not a softened `rejected`. `rejected` asserts the claim was
checked and found absent; `unverifiable` states the check could not be completed against the evidence
given. Only the second is true of an abridgement, and a verdict that accuses a correct answer of
lying is the worse error in a product an audience uses to make a religious decision.

The reason vocabulary is the strongest thing this rule can lean on, because it is closed: two reasons
carry the whole branch, and `VerdictReason` is the single place either is written. A sentence naming
a reason and pairing it with the other verdict is wrong in a way no reading rescues.

## Consequences

- `docs/anchor-protocol.md` and `README.md` state the mapping in one place each, and both cite this
  record. Neither states the inverse anywhere.
- The 40 fabrications keep their `rejected` ruling and their `unverifiable` output, and the movement
  between them stays published as `redTeamMovement.rejectedToUnverifiable` in
  `data/eval/adjudication.json` — the hand-adjudicated set, not `data/benchmark/vs-search.json`, which
  publishes the detection rates — with `apps/cli/test/eval.test.ts` asserting the observed count
  against it.
- The rule is scoped to documents a judge reads, not to the whole `.ts` sweep: the eval generator
  and the adjudication table both name verdicts by design, and a rule that reported them would be a
  rule that gets switched off.
- A document may state that the inverse mapping was *proposed* — this Context does — and may not
  carry it as a mapping. The rule fires on a window that names a verdict and not the required one, so
  recording the error and stating the correction in the same sentence is allowed, and asserting the
  error is not.
- `anchoredOutcome` is unchanged. No branch of the verdict path moved, so the zero-`verified` bar,
  the determinism contract and gate G-6 are untouched.
