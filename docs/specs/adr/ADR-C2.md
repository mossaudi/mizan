# ADR-C2 — Value is the computed per-claim verdict, never answer quality

- **Status:** Accepted
- **Accepted:** 2026-09-29
- **Source:** `specs/for-this-project-need-to-deep-honest-review-and-analysis-and-val.md` §7

## Context

The feedback that "any search tool can do this" conflates retrieval with verification. Market
research in `research-market-value-review-2026-09-29` shows search-class products attach citations
at roughly 74% accuracy, and no competitor — Ansari, Fanar-Sadiq, UmmahAPI, Perplexity, Elicit —
emits a *computed, fail-closed, per-claim* verdict. Meanwhile the project is exposed to the
temptation of defending itself on fluency, which is the one dimension where it cannot win.

## Decision

mizan is positioned and scoped exclusively on the computed, fail-closed, hash-chained per-claim
verdict plus the red-team set that exercises it. Answer and retrieval quality claims are
**permanently out of scope**: no fluency claim, no benchmark-of-answers, no scale claim, in the
deck, the README or the demo.

## Rationale

Industry citation accuracy runs around 74%, and published Islamic citation scores run 1.82–3.38
out of 5. Verification-with-abstention is the unsolved gap, and no competitor ships it. Competing
on generation would lose on the dimension that is already solved for everyone else, and — worse —
would put a quality claim in the mouth of a product whose entire credibility rests on never
over-claiming.

## Consequences

- `checkAnswerQualityClaim` (rule R14 in `packages/mizan-gate/src/docs-value.ts`) makes an
  answer-quality phrase a build failure rather than a review comment.
- Benchmark comparisons use the verifier path only; the headline number is the executed system arm.
- The "What is not claimed" section of `docs/value-proof.md` states the boundary in prose, and the
  rule guarantees the prose stays the only place it is stated.
- Deferred rather than abandoned: generation is a product decision for a later cycle, not a claim
  this one makes.
