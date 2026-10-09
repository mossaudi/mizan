# ADR-20 — The document-level coverage report is the unit of accountability

- **Status:** Accepted
- **Accepted:** 2026-10-08
- **Namespace:** continues the numeric namespace from ADR-19
- **Extends:** ADR-06 (a label is never ours to improve on), ADR-12 (legibility without a pathway to a false result)

## Context

The competitive gap in this feature is not retrieval quality. It is that **a component which
selects which spans get checked can hide a fabrication by not emitting it.** CITE-CONTROL reports
that models under-generate citations; the same failure holds for any extractor, deterministic or
not. A document report that printed verdicts alone would therefore be fail-open in the most
expensive direction available to us: a fabricated span the selector skipped would be absent, and
absent reads exactly like "there was nothing there to find".

Three further facts make the same point from different angles. IslamicEval judges span detection
separately from the content a span attests to, with children inheriting the parent's failure. The
anchor protocol in this repository already counts a sentence as supported only by a verified
citation, which means an un-extracted sentence simply vanishes from SSR's numerator. And the
HALLMARK work measures trust as governed by the order-of-magnitude spread in false-positive rates
rather than by recall — so the number that governs whether a reader trusts the report is the one
about the spans we did not look at.

## Decision

**The report publishes `segments`, `extracted` and `checked` beside every verdict count, and names
every segment that did not reach the verifier. No renderer may state a completeness claim without
the `extracted`-of-`segments` denominator beside it.**

The concrete shape, in `packages/mizan-core/src/schema/article-coverage.ts`:

- `counts` carries `segments`, `extracted`, `checked`, `verified`, `unverifiable`, `rejected` — six
  integers, no quotient.
- `notExtracted` and `notChecked` are **derived** at render time from the `gaps` list. They are not
  fields, because a stored count beside the list it summarises is two declarations of one fact and
  two declarations are where two runs legitimately disagree (AGENTS.md section 17).
- `gaps` carries `{ segmentIndex, stage, reason }`. `stage` separates `not_extracted` ("we never
  looked") from `not_checked` ("we looked and could not decide") because they are different
  sentences, and a reader given the first when the truth was the second has been told we checked a
  span we never checked.
- `reason` is a closed union, projected onto the shared degradation vocabulary through a total
  `Record`, so a new reason cannot be added without deciding what it means product-wise.
- The counts are computed by one function from the outcomes rather than supplied by a caller, so a
  caller cannot pass a count that disagrees with the list printed beside it.

## Consequences

- Reports are more verbose, and they will show gaps in documents that are genuinely clean. That is
  the intended behaviour: a selector that is deterministic and narrow WILL leave sentences
  un-extracted, and a report that hid them would be the defect.
- The completeness sentence has exactly one construction site, `coverageSentenceOf` in
  `apps/cli/src/coverage-render.ts`. Gate **G-7.13** fails the build when a completeness phrase
  appears in any other display module, or appears on a line that does not carry both denominator
  words, or when the coverage renderer exists without that export — the last being the fail-closed
  case, where a renderer the rule cannot analyse must not pass because the rule had nothing to read.
- No gate count moves. `GATE_IDS` is the single declaration of the gate set and the documentation
  check fails any file stating a different number, so a new feature's mechanical control belongs as
  a new RULE inside an existing gate. ADR-C11 records that pattern and ADR-19 extends the set of
  things a rule may police.
- `extracted / segments` exists as a number a reader can compute from two integers. It is
  deliberately not a field, not a percentage and not a printed ratio: `Relevance`'s rejected
  `{matched, total}`, G-7.4 and G-7.12 already refuse the quotient, and a rate printed beside a
  religious verdict is the CWE-345 hole wearing a nicer hat (AGENTS.md section 10).

## Rejected

- A verdict-only report.
- A `clean` / `no issues found` summary line.
- A stored `notExtracted` count beside the gap list.
- Treating selection recall as a footnote or a tooltip.
- A new gate for the completeness rule.
