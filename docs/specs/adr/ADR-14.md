# ADR-14 — The Effect 4 migration is deferred, and the seam that makes deferring safe

- **Status:** Accepted
- **Accepted:** 2026-10-04
- **Namespace:** the numeric namespace continues after ADR-13

## Context

The repository pins `effect@4.0.0-beta.83`, a pre-release. A beta is not a defect — it is a version
number — but every property this constitution claims is a claim about determinism, and a beta API is
the most likely thing to move under us. The instinct is therefore to migrate to the stable release,
and that instinct is wrong for this repository, for two reasons that pull in opposite directions.

The first is blast radius. The pinned beta is load-bearing in a way a package manager cannot see: every
package imports it, and `Schema` is the trust boundary of §1 — every value crossing into this system is
decoded through a declared schema before any code touches it. A migration is not a version bump, it is a
re-audit of every decode site in the repository, and it would land in the same change as a user-facing
feature.

The second is that the migration would be untestable. `effect@4.0.0-beta.83` is pinned, so the current
suite runs against exactly the version in `package.json`. There is no stable release to compare against
and no oracle for whether a decode site that passes on the beta would pass on the release. A migration
whose correctness cannot be demonstrated would replace a known, pinned, tested dependency with an
unknown one, in exchange for a stability guarantee nobody has yet measured against this code.

What makes deferring *safe* rather than merely convenient is that the beta's surface is already
contained. `decodeOrFail` in `packages/mizan-core/src/schema/decode.ts` is the only module that calls
`decodeUnknownSync`, and §1 already forbids calling it anywhere else. So the beta API appears in the
repository at one seam, not at one hundred call sites, and the migration is bounded by the size of that
one file — plus the `Result` and `Effect` usage in the corpus and provenance packages.

## Decision

**Stay on `effect@4.0.0-beta.83` for this sprint. The `decode.ts` seam is the whole mitigation, and it
is already required.**

Concretely, three commitments:

1. `decodeOrFail` remains the only entry point to `Schema` decoding anywhere in the repository. This is
   not a new rule invented here — §1 already states it, and gate G-5 already checks the shape of the
   result. This ADR records *why* the rule exists, which §1 states as a reason for correctness rather
   than as a reason for beta containment.
2. The pin stays exact, not a caret range. A range would resolve to a different beta on the next
   install, which is precisely the drift a pin exists to prevent.
3. The migration is triggered by a specific, checkable event rather than by a version number appearing:
   a stable `effect@4` release **and** a green suite against it. Both, not either. A stable release that
   fails a decode site is still a beta as far as this repository is concerned, and a decode site fixed
   to satisfy an unpinned nightly is not a decision anyone can read back.

## Consequences

- `bun run ci` keeps running against exactly the version in `package.json`. No test result in this
  repository describes an Effect version the repository does not use.
- A beta dependency is a disclosed risk rather than a hidden one. `DISCLOSURE.md` is an audited
  document, so stating it there means `check:docs` reads the statement.
- The migration, when it happens, is bounded by `decode.ts` and the `Result`/`Effect` call sites in
  `mizan-corpus` and `mizan-provenance`. That is a real but finite piece of work, and it is not this
  sprint's.
- The consequence to be most careful about is drift: a contributor who finds the beta awkward has a
  shorter path to "just use the stable API here" than to changing the pin. That is why the seam is a
  gate-checked rule rather than a convention, and why this ADR is filed next to the code rather than in
  a backlog.
- Nothing in this decision touches determinism, the verifier, or any verdict path. `mizan-verify` has no
  Effect dependency at all and never will: it depends on `@mizan/core` and nothing else (§9), which is
  why the deferral cannot reach a badge.