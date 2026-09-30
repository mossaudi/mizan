# ADR-06 — A grade is the dataset's grade, never ours

- **Status:** Accepted

## Context

Rows arrive from the upstream dataset carrying a grade, a classification or a scholar's label. The
product displays them beside a verdict, to an audience that is making a religious-legal decision.
Three failures are available and all three are the same failure: defaulting a missing grade to
something safe, inferring a grade from the text, or quietly upgrading one because the row looked
stronger than its label.

## Decision

A `grade` is stored **exactly as the source dataset asserts it**, together with its `gradeSource`
and its `gradeBasis`. If the dataset carries no grade, the stored grade is `null` and the product
says so in its own words. We never default, infer or upgrade a grade, and we never present one as
our own ruling.

Collections for which the concept does not apply are marked with the `gradeApplicable` model rather
than being quarantined or dropped — silently removing a whole collection because a field is empty
would be the same over-claim running backwards.

## Rationale

Our grade would in practice *be* the dataset's grade. Presenting it as our own judgment asserts a
religious-legal evaluation we are not qualified to make and have not performed — the exact
over-claiming a product whose credibility rests on never over-claiming cannot afford. Recording the
basis beside the value keeps the question "who says so?" answerable from the row itself, which is
the difference between a citation and an assertion.

## Consequences

- Every adapter writes `gradeSource` and `gradeBasis` alongside the value; a grade with no stated
  basis cannot be rendered as an authority.
- The in-product wording is "grade per …", naming the dataset, so the screen never reads as a
  ruling of ours.
- Tests assert that no code path computes a grade: the field is a passthrough, and a passthrough is
  the only shape that cannot drift.
- Quarantine applies to integrity problems, not to absent concepts; the two are never conflated.
