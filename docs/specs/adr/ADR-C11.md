# ADR-C11 — Stay on the pinned Effect beta; a migration is a change to the decode seam, not a version bump

- **Status:** Accepted
- **Accepted:** 2026-10-04
- **Source:** the Sprint 1 precision cycle, which raised the question while the pinned beta was in use
- **Namespace:** continues the `C` namespace from ADR-C6; the numeric namespace is closed

## Context

`effect` is pinned to `4.0.0-beta.83` in the workspace manifest. A beta of a library whose `Schema`
module is the untrusted-boundary decode seam is a standing invitation to "just bump it", and the
question belongs in a decision record rather than in a pull request: the next person to hit an API
break in `Schema` will find this file and should read a ruling, not a shrug.

The exposure is already confined, and that confinement is the whole substance of the argument.
ADR-02 confines `Schema.decodeUnknownSync` to `packages/mizan-core/src/schema/decode.ts`; every other
module reaches decoding through `decodeOrFail`, which returns a `Result` carrying the schema name and
the first line of the issue and never the offending payload. A CI gate asserts the binding exists in
exactly one file. So the blast radius of a beta API change is one adapter of roughly forty lines, in a
package that nothing else imports for its schema behaviour.

What a migration is *not* is a version bump. Stable Effect renames and reshapes the `Schema` surface,
which means the one file the whole repository depends on for boundary decoding is the file that moves,
and the move is only verifiable by re-running every decode test in every package. The determinism claim
(`100%` byte-identical verdicts across repeated runs) is unaffected by the library version but is
affected by anything that changes how a payload is narrowed before it is read, and that narrowing
lives in the seam being rewritten.

## Decision

**Stay on `effect@4.0.0-beta.83`. No migration to stable Effect this cycle, and no opportunistic bump.**

The pin is exact rather than caret-ranged, and it stays exact. When a stable release is adopted, the
adoption is its own story with its own diff, and the acceptance criterion is that the whole repository's
tests pass with no test changed — a migration that requires editing a decode expectation has changed
behaviour, and that is a defect to investigate rather than a fixture to update.

## Rationale

The general rule in `AGENTS.md` §14 is that typecheck and tests are the deliverable, and the specific
rule in §17 is one source of truth per fact. Both point the same way here: the version pin is a fact
that lives in one manifest field, and a change to it is a change to what every other module is compiled
against. Spending the last precision cycle of a submission cycle on a library migration buys no
measurable improvement to the thing the submission is judged on — whether a fabricated quote is caught
— and spends the entire review budget of the diff that fixes a published figure.

The deferral is also the honest position rather than the comfortable one: the reason is not that the
beta is fine. It is that a beta is a cost this repository has already paid down to one file, and
revisiting the decision while that containment holds would spend effort to make the cost larger for
the sake of a version string.

## Consequences

- Nothing in this record changes code. It records why the pin exists, so the next beta-breaking upgrade
  attempt reads a decision instead of repeating the analysis.
- The single-file containment is the thing that makes the deferral cheap, and it is machine-checked. If
  a future change widens the beta's surface past `decode.ts`, this record's argument no longer holds and
  the migration becomes the smaller job.
- No gate count moves. A docs decision is not an eighth gate (`AGENTS.md` §14), and the ADR-document
  rules already enforce this file's own shape.
- The recorded follow-up is narrow: revisit when a stable release exists **and** the decision is made
  against a diff, not against a version number. Nothing else about this cycle is waiting on it.