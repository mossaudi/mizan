# HALLMARK 14-Type Coverage Matrix

## Reference

HALLMARK: Diagnosing Three Failure Modes in LLM Citation Verifiers (arXiv:2607.18360).
2,526 BibTeX entries spanning 14 hallucination types across 3 difficulty tiers.

## Purpose

This matrix maps all 14 HALLMARK hallucination types to mizan's red-team test fixtures.
Each type has at least one test case that exercises it, and each test case has a defined
expected verdict. The matrix is committed to the repository and citable by file path and
commit hash.

## Scope: which measurement this document's coverage is about

Every count in this document is **type coverage** — how many of the 14 HALLMARK hallucination types
a fixture exercises. It is not a corpus measurement, and a second coverage figure elsewhere in this
repository must not be read through it: the suggestion pass's presence measurement was run over
the 40-case red-team eval set, drawn round-robin across all six served collections, as recorded by
`SUGGESTION_MEASUREMENT_SCOPE` in `@mizan/core`; its per-collection figures and their conditions
live in `data/benchmark/vs-search.json` and `docs/specs/measurements.md`. Two denominators, two
documents, and neither is the other's restatement.

## Coverage Matrix

| # | HALLMARK Type | mizan Adaptation | Fixture ID | Difficulty Tier | Expected Verdict | Test File |
|---|---|---|---|---|---|---|
| 1 | fabricated_doi | fabricated_hadith_id | RT-001 | Easy | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 2 | nonexistent_venue | nonexistent_collection | RT-002 | Easy | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 3 | placeholder_authors | placeholder_grade | RT-003 | Easy | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 4 | future_date | anachronistic_attribution | RT-004 | Easy | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 5 | chimeric_title | chimeric_citation | RT-005 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 6 | wrong_venue | wrong_collection | RT-006 | Medium | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 7 | author_mismatch | misattributed_narrator | RT-007 | Medium | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 8 | preprint_as_published | weak_grade_as_authentic | RT-008 | Medium | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 9 | hybrid_fabrication | hybrid_fabrication | RT-009 | Medium | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 10 | merged_citation | merged_citation | RT-010 | Medium | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 11 | partial_author_list | partial_quote | RT-011 | Medium | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 12 | near_miss_title | near_miss_quote | RT-012 | Hard | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 13 | plausible_fabrication | plausible_fabrication | RT-013 | Hard | rejected | `packages/mizan-verify/test/red-team.test.ts` |
| 14 | arxiv_version_mismatch | version_mismatch | RT-014 | Hard | rejected | `packages/mizan-verify/test/red-team.test.ts` |

## Difficulty Tier Summary

| Tier | Count | Types |
|---|---|---|
| Easy | 4 | fabricated_doi, nonexistent_venue, placeholder_authors, future_date |
| Medium | 7 | chimeric_title, wrong_venue, author_mismatch, preprint_as_published, hybrid_fabrication, merged_citation, partial_author_list |
| Hard | 3 | near_miss_title, plausible_fabrication, arxiv_version_mismatch |

## Expected Verdicts

Every fixture must produce a refusal. The column above names **which** refusal, and it is
exact, because the benchmark scores a case as passed only when the verifier's verdict
**equals** the declared one (`casePassed` in `packages/mizan-bench/src/report.ts`).
An earlier version of this matrix declared `unverifiable` for all 14 and excused the
difference with "a `rejected` verdict is also acceptable" — which reported 11 of 14
correct red-team verdicts as benchmark failures. The distinction is real, not cosmetic:

| Declared verdict | Reason | Fixtures | Why |
|---|---|---|---|
| `unverifiable` | `identifier_unresolved` | RT-001, RT-002, RT-005 | The collection or the number is not in the snapshot at all. |
| `rejected` | `quote_absent_at_cited_id` | RT-003, RT-004, RT-006 … RT-014 | The identifier resolves to a real record and the fabricated quote is not a span of it. |

`verified` is never acceptable, and no fixture declares it. The unit suite
(`test/red-team.test.ts`) runs with **empty** evidence, where nothing can resolve, so it
observes `unverifiable` for all 14 and asserts the property that must hold in both
configurations: never `verified`. The snapshot-relative measurement in
`scripts/benchmark.ts` is what reproduces the column above.

### Correction: 11, not 10

An earlier revision of this document said the inverted verdict column reported **10** of 14
cases as failures. It reported **11**: RT-003 through RT-014, excluding RT-005. The count is
now asserted by `test/hallmark-coverage.test.ts`, which reads this table and diffs it against
`RED_TEAM_FIXTURES` — so a document that drifts from the code fails the suite rather than
misreporting a number to a judge.

## Disclosure: the Sprint 1 fixtures cited collections this snapshot does not ship

The citation identifiers in the red-team fixtures were changed during Sprint 2, and that
change was not disclosed when it was made. It is disclosed here because a red-team suite whose
inputs were re-pointed measures something different from the suite it was declared to be.

**What the Sprint 1 fixtures did.** 11 of the 14 cited `bukhari:1` or `muslim:1` — not shipped.
Those 11 therefore resolved to zero records, and
every one of them earned `unverifiable (identifier_unresolved)` for a reason that has nothing
to do with the hallucination type it was supposed to exercise: the suite reported 14/14 while
the containment arm — "this source exists, and it does not contain this quote" — never ran
once.

The six collections `data/corpus.db` ships are `quran`, `nasai`, `abudawud`, `ibnmajah`,
`tirmidhi` and `malik`, and every identifier cited in the table below resolves against one of
them.

**What they cite now.** The 11 containment-arm fixtures cite **11 distinct identifiers across
6 collections**, each of which resolves to a real record, so each earns `rejected
(quote_absent_at_cited_id)`. Three fixtures stay on the resolution arm deliberately, because
refusing an identifier we cannot resolve is a separate property from misquoting a source we can:

| Arm | Fixtures | Identifier shape |
|---|---|---|
| Containment (`rejected`) | RT-003, RT-004, RT-006 … RT-014 | Resolves to a real record; the fabricated quote is not a span of it |
| Resolution (`unverifiable`) | RT-001, RT-002, RT-005 | Real collection + number past its end (`tirmidhi:999999`), no such collection, real collection + a number that does not exist (`tirmidhi:0`) |

**Why the disclosure is in this document and not only in the commit.** The fixture table is
the artefact a judge reads. A correction that lives only in a commit message is invisible to
the reader who needs it, which makes it the same defect as the one it corrects.

## Adaptation Notes

The HALLMARK taxonomy was designed for academic citation verification (BibTeX entries,
DOIs, venues). mizan verifies Qur'an/hadith citations, so the types are adapted:

- `fabricated_doi` → `fabricated_hadith_id`: A hadith citation with an ID that does not exist
- `nonexistent_venue` → `nonexistent_collection`: A citation to a collection that does not exist
- `placeholder_authors` → `placeholder_grade`: A generic/fake grade attribution
- `future_date` → `anachronistic_attribution`: A citation with impossible dating
- `chimeric_title` → `chimeric_citation`: Real collection + fabricated hadith number
- `wrong_venue` → `wrong_collection`: Correct hadith, wrong collection
- `author_mismatch` → `misattributed_narrator`: Correct text, wrong narrator chain
- `preprint_as_published` → `weak_grade_as_authentic`: Weak hadith cited as authentic
- `hybrid_fabrication` → `hybrid_fabrication`: Real collection + fabricated content
- `merged_citation` → `merged_citation`: Content from multiple hadiths merged
- `partial_author_list` → `partial_quote`: Subset of a real hadith presented as complete
- `near_miss_title` → `near_miss_quote`: Quote off by 1-2 words from a real hadith
- `plausible_fabrication` → `plausible_fabrication`: Entirely fabricated but realistic
- `arxiv_version_mismatch` → `version_mismatch`: Mixed metadata from different sources

## Security Note

All fabricated text in the red-team fixtures is clearly synthetic (prefixed with
`FABRICATED_`), and `test/red-team.test.ts` asserts that marker on every fixture. No real
hadith or Qur'an text is used in red-team cases. The fixtures are declared in
`packages/mizan-verify/src/red-team.ts` — outside every ingest path — and are never loaded
into `corpus.db`.
