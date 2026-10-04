# ADR-09 — Rank by exact containment, then by trigram overlap with a floor, and never by a score

- **Status:** Accepted

## Context

ADR-03 established that the verifier admits a quote only on exact normalized substring containment,
because the feasibility spike found that a fuzzy or embedding-similarity verifier scores an invented
but plausible hadith as a high match. The nearest-quote feature needs the opposite property from the
same comparison: it must be *able* to surface a near miss, which is the entire point, and it must not
be able to conclude anything from one.

That leaves one uncomfortable question: what does "near" mean, and does the answer become a score?

## Decision

Ranking is a **total order over discrete facts**, never a number that a reader could read as a
strength:

1. Fold both texts with `normalizeForMatch` — the fold table is the verifier's, not a second one.
2. If the quote is **contained** in the record, containment wins over every other candidate,
   regardless of any other comparison.
3. Otherwise, count **shared distinct character 3-gram types**. At least `MIN_SHARED_TRIGRAMS = 8`
   are required; below the floor the record is not a candidate at all.
4. Break ties on the record's own trigram-type count ascending, then `recordId` ascending by UTF-16
   code unit.

The counts are **not** part of the display contract. Nothing is divided by anything, no percentage
exists, and the only numbers printed are the two integers of a longest-shared-run diagnostic, beside
the words "display only, never a verdict".

The floor is a **library parameter**. The product passes `MIN_SHARED_TRIGRAMS` explicitly and does not
vary it per call; the evaluation harness varies it over 4, 8 and 12 to record what each costs.

Ranking an eligible set narrows it first: at most `MAX_ROWS_RANKED = 1_024` rows reach the type counts,
and the cut is taken on whole tie groups. That is not a heuristic prefilter — a row is dropped only when
its `contained` and `shared` keys are strictly worse than every kept row's, so it sorts below all of them
whatever its type count turns out to be, and the full order's top five is therefore the reduced order's
top five. Splitting a tie group *would* change the answer, so the cut never splits one. ADR-08 records
why the narrowing was necessary: the floor admits a median of 20,796 of 27,234 rows.

## Rationale

A percentage is a claim about how right something is, and this repository's spike is the reason to
refuse that claim on any surface. A floor is different in kind: it is a yes/no admission test, it
is the same shape as the verifier's containment test, and it produces no output a reader could
mistake for a strength.

Trigrams are chosen because they are language-agnostic and cheap, and shared *types* rather than
shared occurrences because a repeated phrase must not inflate a record's standing. Containment
bypassing the floor is the one asymmetry, and it is the asymmetry a reader would expect: the record
that literally contains the words is the answer to "what did they mean?" more often than not.

Latency is never allowed to buy a different answer. Every speed-up on this path is required to return
the same list of record ids as the naive implementation, and `suggest.test.ts` asserts exactly that on
a corpus-sized crowd, because an order that changed with the input size would be an order that changed
with the machine.

## Consequences

- A paraphrase of a real quotation can appear in the list while scoring nothing. That is the feature
  working, not a leak — nothing it produces can reach a badge (ADR-07).
- `topK` is clamped to `MAX_TOP_K = 5` and a blank quote returns nothing. There is no padding and no
  filler: fewer than the floor produces `no_candidates`, stated in words.
- Bounds are explicit — `MAX_QUOTE_CHARS`, `MAX_RECORD_CHARS` — so one pathological row cannot turn
  a scan into an allocation failure.
- The fold is the verifier's, imported from `@mizan/core`, because two folds would be two verdicts.
- Measured on the committed corpus, the floor is **nearly inert**: recall at top-1 and top-5 is
  identical at floors 4, 8 and 12 (36/40 and 40/40). The floor is therefore not what finds the
  neighbour; containment and shared-type ordering are. A stricter floor is the obvious next lever for
  latency and has to be justified with `bun run eval:suggestions`, not with a preference.
- The two evaluation orders of the same count (`trigrams.ts`) exist because 254 ms beats 2,613 ms on a
  real quote, and exist in the same function because one rule with two costs is a rule; above
  `SUBSTRING_SEARCH_MAX_QUOTE_GRAMS` the bounded order wins back, so a pathological quote cannot turn
  the fast path into a stall.