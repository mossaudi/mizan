# ADR-C6 — ADR identifiers are assigned in the `C` namespace, and a reaffirmation is a new document

- **Status:** Accepted
- **Accepted:** 2026-10-01
- **Source:** the CEO strategic review of 2026-10-01, and the specification decisions it restates

## Context

`docs/specs/adr/` holds ADR-02, ADR-03, ADR-04, ADR-05, ADR-06 and ADR-11 in a legacy numeric
namespace, and ADR-C1 through ADR-C5 in a `C` namespace. Both are read by rules twelve and thirteen
in `packages/mizan-gate/src/docs-adr.ts`: rule twelve requires every identifier cited anywhere in the
tree to resolve to a file, and rule thirteen requires every file in the directory to record a context,
a decision, consequences and an accepted status.

A specification then arrived carrying six decisions and proposing, for each, one of the two-digit
numeric identifiers already in use. Four of those names are already files, and they name something
else: ADR-03 here is the strict-containment decision, not a corpus-scope decision, and ADR-05 is the
quote-not-prose decision, not a verdict-polarity one. The lowest identifier in the sequence names no
file at all, and citing it would leave a judge a reference that resolves to nothing. Roughly two
hundred citations already resolve to the files the colliding identifiers name, so this is not a
naming inconvenience: it is a set of references that would silently change meaning, in a repository
whose entire claim is that a citation means one specific thing.

There is a second defect in the same place. One of the six decisions restates ADR-03 exactly — the
feasibility spike it cites is the spike ADR-03 was written from, and the conclusion is the same one.
The tempting move is to edit ADR-03 to add the newer argument. That is the failure mode this
repository is built against: an authority that moves when the argument moves is not an authority, and
the two hundred citations pointing at it would then resolve to a document that has changed.

## Decision

New decisions take identifiers in the `C` namespace, continuing from the highest one in use. The six
decisions of this cycle are recorded as ADR-C6, ADR-C7, ADR-C8 and ADR-C9, and the two that restate an
existing decision record **which** one they restate in their Context rather than editing it.

ADR-03, ADR-05 and the rest are byte-unchanged. A decision that reaffirms an earlier one is a new
document that cites the earlier one by identifier; the earlier document is never rewritten to carry
the newer argument.

## Rationale

The identifier space *is* the deliverable here. `docs-adr.ts` exists because a judge who greps
`ADR-03` and finds the wrong document has been handed a reason to stop trusting every other citation
beside it, and that argument applies with equal force to the writing half. Two files for one decision
is a smaller problem than one file whose contents depend on when you read it.

The `C` namespace is the one already in use for decisions taken in this cycle, it is unambiguous
against the legacy digits, and continuing it costs no renumbering. The specific numbers are not
load-bearing; the constraint that they do not collide is.

## Consequences

- ADR-C6 through ADR-C9 are four documents, not six: the strict-containment reaffirmation and the
  static-UI reaffirmation are Context in this record, and the runbook-ordering reaffirmation is a
  documented rule rather than a decision still to be made.
- Rule thirteen is what holds the rest of this: a document that records only what was considered
  resolves every citation pointing at it and answers nothing, so `check:docs` fails on the missing
  `## Decision` section and on a status left below Accepted.
- Writing a specification's identifier into a document without a matching file fails rule twelve
  rather than waiting to be noticed, so a collision in the *next* specification is a build failure
  and not a review comment.
- No identifier is invented in a source comment to make a rule quiet. The gate package assembles its
  own examples from fragments, so a test cannot cite a document that does not exist.
