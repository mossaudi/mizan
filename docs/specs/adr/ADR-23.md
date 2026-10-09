# ADR-23 — Ṣaḥābah attributions are licence-gated and grade-null

- **Status:** Accepted
- **Accepted:** 2026-10-08
- **Namespace:** continues the numeric namespace from ADR-21
- **Extends:** ADR-06 (a grade is never ours)

## Context

A companion / athar corpus was asked for. No open-licensed one was found, and the two candidates
fail in the two opposite ways that matter, which is why a single "no" would have been the wrong
answer:

- One publishes **no licence field at all** — no terms page, no dataset card, no redistribution
  grant. A source with no stated terms cannot be classified above `unconfirmed`, and gate G-5.4
  fails the build on an enabled row at that class.
- One publishes its terms, and those terms are **non-commercial only**, which cannot cover a
  redistributed repository entered into a competition.

The open hadith datasets that do exist cover only the graded canonical collections, and inside
those a companion appears as a narrator or a rawi — never as an independently graded hadith. So the
verifiable part of the need (companion attributions resolving, and being checked against what they
actually are) is already served by existing corpus semantics, and the part that is not served is a
corpus whose licence does not permit it.

The second question is separate and easy to get wrong. A companion statement is not ṣaḥīḥ/ḍaʿīf
graded by any dataset examined here. The tempting move is to borrow the vocabulary anyway so the row
looks like the others. AGENTS.md section 15 forbids it: a grade is the dataset's grade, stored
exactly as asserted, and where a dataset asserts none the stored grade is `null` and the product
says so. We never infer, default, upgrade, or present a grade as our own ruling.

## Decision

**No companion collection ships without a written licence decision recorded in
`packages/mizan-corpus/src/adapters/source-meta.ts`, and every source that does not ship carries an
`exclusionReason`. Companion attributions carry `grade: null` and `gradeApplicable: false`, and the
surface states that no grade applies rather than borrowing vocabulary that does not describe them.**

This cycle delivers the **decision and its artefacts**, not a corpus. Both rows are in the
catalogue with `enabled: false` and a written reason naming what was checked and on what date, so a
re-check is a diff against a sentence rather than a re-derivation of the question. The registry
generator turns them into `data/registry/sources.json`, `DISCLOSURE.md` carries them, and gate G-5
reads the result — so a licence decision cannot be made in a commit message and forgotten.

Three consequences follow from that structure, and each is a control rather than a convention:

- **No adapter and no fetch path exists for an excluded source.** An adapter for a source we may not
  ship is code with no purpose, and a licence decision that had to be honoured in code as well as in
  the catalogue would be a decision two people could read differently.
  `packages/mizan-corpus/test/registry-decision.test.ts` walks the corpus source and asserts the
  excluded slugs appear nowhere but the catalogue rows, and asserts `ADAPTERS` still registers only
  the two enabled sources.
- **An exclusion without a reason fails the build.** G-5.5 already requires it; the reason is what
  makes the row a record rather than a deletion.
- **The rows regenerate deterministically.** An excluded row has no digest and no row count, and
  `buildRegistry` derives both from the absence of a fetch, so the committed registry is a pure
  function of the catalogue for those rows.

## Consequences

- The customer's question is answered permanently and honestly rather than deferred vaguely: there is
  no open-licensed companion corpus, and here is what was checked on each candidate and when.
- A companion attribution ingested in future would store `grade: null` and be displayed as having no
  applicable grade. That is **not** a quarantine: the concept not applying is a different fact from a
  dataset asserting no grade where one was required, and the same rule that spares the Qur'anic
  verses spares a companion attribution.
- If a licence is later found, the row becomes an ingest question and **not** a grade question. The
  exclusion is licence-gated on purpose, so it does not have to be revisited to answer a different
  question.

## Rejected

- Ingesting either candidate's content without a written licence decision.
- Assigning a ṣaḥīḥ/ḍaʿīf grade to a companion statement.
- Deleting the excluded rows, which would make the same question look new next quarter.
- Quarantining a whole collection because a grade concept does not apply to it.
