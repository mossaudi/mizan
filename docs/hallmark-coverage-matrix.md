# HALLMARK 14-Type Coverage Matrix

## Reference

HALLMARK: Diagnosing Three Failure Modes in LLM Citation Verifiers (arXiv:2607.18360).
2,526 BibTeX entries spanning 14 hallucination types across 3 difficulty tiers.

## Purpose

This matrix maps all 14 HALLMARK hallucination types to mizan's red-team test fixtures.
Each type has at least one test case that exercises it, and each test case has a defined
expected verdict. The matrix is committed to the repository and citable by file path and
commit hash.

## Coverage Matrix

| # | HALLMARK Type | mizan Adaptation | Fixture ID | Difficulty Tier | Expected Verdict | Test File |
|---|---|---|---|---|---|---|
| 1 | fabricated_doi | fabricated_hadith_id | RT-001 | Easy | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 2 | nonexistent_venue | nonexistent_collection | RT-002 | Easy | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 3 | placeholder_authors | placeholder_grade | RT-003 | Easy | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 4 | future_date | anachronistic_attribution | RT-004 | Easy | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 5 | chimeric_title | chimeric_citation | RT-005 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 6 | wrong_venue | wrong_collection | RT-006 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 7 | author_mismatch | misattributed_narrator | RT-007 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 8 | preprint_as_published | weak_grade_as_authentic | RT-008 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 9 | hybrid_fabrication | hybrid_fabrication | RT-009 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 10 | merged_citation | merged_citation | RT-010 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 11 | partial_author_list | partial_quote | RT-011 | Medium | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 12 | near_miss_title | near_miss_quote | RT-012 | Hard | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 13 | plausible_fabrication | plausible_fabrication | RT-013 | Hard | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |
| 14 | arxiv_version_mismatch | version_mismatch | RT-014 | Hard | unverifiable | `packages/mizan-verify/test/red-team.test.ts` |

## Difficulty Tier Summary

| Tier | Count | Types |
|---|---|---|
| Easy | 4 | fabricated_doi, nonexistent_venue, placeholder_authors, future_date |
| Medium | 7 | chimeric_title, wrong_venue, author_mismatch, preprint_as_published, hybrid_fabrication, merged_citation, partial_author_list |
| Hard | 3 | near_miss_title, plausible_fabrication, arxiv_version_mismatch |

## Expected Verdicts

All 14 fixtures are expected to produce `unverifiable` (not `verified`). This is because:

- The fabricated quotes are synthetic text that does not exist in the corpus.
- The citations point to nonexistent or wrong sources.
- The verifier's fail-closed design means any unresolvable or uncontained citation
  produces `unverifiable`, never `verified`.

A `rejected` verdict is also acceptable (the citation resolved to a real record but
the quote was absent), but `verified` is never acceptable.

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
`FABRICATED_`). No real hadith or Qur'an text is used in red-team test cases. The
fixtures are in a separate directory from the real corpus and are never loaded into
corpus.db.
