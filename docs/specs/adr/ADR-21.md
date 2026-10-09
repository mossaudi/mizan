# ADR-21 — No semantic nearest-match in any surface; the refusal is the product

- **Status:** Accepted
- **Accepted:** 2026-10-08
- **Namespace:** continues the numeric namespace from ADR-20
- **Extends:** ADR-03 (the feasibility spike), ADR-07 (the ranker is display-only), ADR-12 (two integers and no third)

## Context

The request was for the closest match in **words and meaning**, for incomplete quotes too. The
"meaning" half was measured against a real diacriticized hadith in ADR-03, and the spike table
lives in the header of `packages/mizan-verify/src/steps/containment.ts` because it is the reason
the verifier is built the way it is. The short version: a faithful Arabic paraphrase is a NO-MATCH,
and a fabricated hadith is ALSO a no-match — but under a similarity measure the fabrication scores
HIGH and the faithful paraphrase scores poorly. The measure is worse than useless on precisely the
cases it would be shipped for.

The stakes are named rather than inferred. The customer asked for this because real consequences
follow if the platform does not work. Semantic matching is the highest-probability way to ship a
platform that fails silently on exactly the fabrications, because it produces a number, and a
number gets tuned. The tuning happens on the cases that motivated it: a threshold opened to admit
paraphrases admits fabrications, the fabrications are what the tuning was measured on, and the
measurement then reports the change as an improvement.

## Decision

**No semantic, embedding, edit-distance or percentage-shaped nearest-match ships in any surface,
including the article path. Closest-in-words stays as it is: exact-or-none for a verdict, and
display-only `sharedRunChars` of `quoteChars` for a suggestion. Incomplete quotes are handled by
the anchor locator, which can only ever yield `unverifiable`.**

The refusal is not a deferred feature. It is a written record with a measurement attached, and it
is enforced mechanically:

- Gate **G-1.2** fails the build on `similarity`, `fuzzy`, `levenshtein`, `trigram`, `embed`,
  `vector`, `threshold` and the rest of the vocabulary anywhere in `packages/mizan-verify/`.
- Gate **G-6.3** fails on `percent:` outside the two files that own the two legitimate match shapes.
- Gate **G-7.2** re-applies G-1.2's vocabulary to the verdict path's import closure AND every declared
  display module, so the article surfaces are inside the fence rather than beside it.
- Gate **G-7.4** fails on `percent`, `confidence`, `score` and `trustScore` as property keys on that
  path, in code and in strings.
- Gate **G-7.12** enumerates the only numbers a displayed candidate may carry: `rank`, `considered`,
  `sharedRunChars`, `quoteChars`. A legitimately-named third measurement — `closenessScore`,
  `matchShare` — satisfies G-7.4 and is caught here, because a classifier cannot see that and an
  enumeration can.

### What handles incomplete quotes instead

The anchor locator in `packages/mizan-verify/src/steps/anchor.ts`. It searches for an ordered
3-to-8-word fragment and returns a located span or nothing; gate **G-7.1** forbids that file from
containing the word `verdict` at all, so the arm has no way to express an outcome. Placement in
`verify.ts` is the second half of the safety argument: the anchor arm runs AFTER containment has
failed and BEFORE the code may accuse, so adding anchors can never change a `verified`, and an
abridgement of a source that exists yields `unverifiable (no_matching_evidence)` rather than a
`rejected` accusation against a record that never disagreed.

## Consequences

- We lose a feature that was named in the request, and gain the only defensible answer to "how do you
  know?" plus a documented refusal instead of an unmeasured risk.
- The refusal is evidence, not an assertion: the spike table is a number a judge can check, and the
  gates above mean any attempt to reintroduce a measure — under any of the names it might arrive in
  — fails the build.
- A threshold retuned to admit paraphrases is rejected explicitly, not left open. The retuning path
  is the mechanism by which a measure becomes a fabrication-acceptance hole, and recording that it
  is closed is what stops it being reopened as a tuning question.
- The competitor that markets a no-hallucination policy with no verifier cannot answer "what fraction
  of your document did you examine?", and neither can a content API with zero verification. That gap
  is the one this cycle is built to occupy, and it is reachable without a similarity measure.

## Rejected

- A similarity fallback, an embedding nearest-neighbour, or a match-percentage field.
- A model arbiter for faithfulness.
- A retunable threshold.
- Treating `sharedRunChars` as a route to a badge. It is two whole numbers about characters, and
  nothing on the article path reads it as an outcome.
