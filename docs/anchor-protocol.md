# The anchor protocol

How a claim that is *not* a contiguous quotation gets decided, and why the mechanism is a human
ruling rather than a number.

## The problem

The golden set's `elide_middle` cases are faithful abridged renderings of real spans, built from
the source's own words. A summariser that drops a middle clause and marks the gap produces exactly
this shape. The claim is **correct in substance** and **not a quotation**, and those two facts pull
the verdict in opposite directions:

- `rejected` asserts the cited record does not contain the text. True, and it accuses a correct
  answer of lying.
- `unverifiable` says we cannot decide on this evidence. True, and it is honest about our position.
- `verified` says the quoted span is contained in the cited record after deterministic folding.
  False, and there is no reading of the evidence that makes it true.

The architecture asks for `unverifiable`. Containment delivers `rejected`, because telling a
paraphrase from a fabrication would need a similarity measurement, and ADR-03 forbids one. The two
requirements cannot both hold *inside containment*, which is why the answer does not come from
containment at all — it comes from the locator specified below, and it now does.

## The decision

A person read each case against its cited source and recorded what the claim **is**. The 66 cases
reach two conclusions, by two arguments, and the split matters:

### The 26 golden elisions — `unverifiable`

An `elide_middle` case quotes a real span with the middle removed, using the source's own words.
Nothing in it contradicts the source; it is a faithful but non-contiguous rendering. `rejected` would
accuse a correct answer of lying, and containment cannot confirm it either, so the honest verdict is
that we cannot decide on this evidence. **This is the decision the story exists to make**, and it is
the question the README left open.

### The 40 red-team fabrications — `rejected`

A red-team case is a real span with something changed: a word replaced, two words replaced, letters
transposed, a digit substituted, a word inserted. The claim therefore **asserts something the source
does not say**, and the correct verdict for what the claim *is* is `rejected` with reason
`quote_absent_at_cited_id`. What the *procedure* returns once an anchor locates is a separate
question with a separate answer, and that answer is published below rather than quietly absorbed.

A close fabrication is not thereby a paraphrase. `one_word_changed` is eleven twelfths of a real
span, and it is still a case that says a word the source does not contain. Recording it as
"faithful in substance" would be a misdescription of the artefact rather than a judgement call, and
an artefact that calls 40 fabrications faithful is one that should not be shown to a judge.

The full table is `data/eval/adjudication.json`; the reasoning behind every row is in
`scripts/eval/adjudication.ts`, which is literals only and is forbidden from importing the verifier —
a ruling recorded by running the code it judges is a row that ratifies whatever the code already
does.

## What the anchor arm costs — measured, not predicted

With the locator specified below, a red-team fabrication whose anchor still locates comes back
`unverifiable` instead of `rejected`. **All 40 of them — observed, not forecast.** The reason is
structural, not a tuning choice: these spans are largely real text, so an anchor drawn from one
locates. The architecture names this as risk R-A1 and its mitigation is "measured, not engineered
away", so the count is a field in the artefact rather than a sentence in the prose, and a test
asserts the observed movement equals it:

```json
"redTeamMovement": { "rejectedToUnverifiable": 40, "falseVerifiedDelta": 0 }
```

Read the two numbers together. A case moving from `rejected` to `unverifiable` stops being a
confident "the source does not say this" and becomes an honest "we cannot decide" — which is a real
loss of signal on fabrications, and it is published rather than suppressed. `falseVerifiedDelta: 0`
sits beside it because that is the bar that does not move: no branch of this protocol can reach
`verified`, and the number is a field so that a future change to the locator has to change it
visibly rather than quietly relaxing the one bar that actually matters.

## What is banned, and why

The locator that implements this ruling — `anchoredOutcome`, step 5b of `verify.ts` — does not
compute, accept, or reason about:

- a **similarity** score of any kind
- a **percentage**, threshold, or match ratio
- **edit distance** — Damerau, Levenshtein, or longest-common-subsequence
- an **embedding** or vector representation, or any nearest-neighbour lookup
- a **confidence** value, or any aggregation of per-signal signals into one
- a model's **judgement** about whether the claim is faithful

This is not a style preference. The feasibility spike that produced ADR-03 tested exactly these
approaches and found that an invented but plausible hadith — a fabrication of the kind the
red-team set is built from — scores HIGH on them. A threshold tuned to let a paraphrase through is
a threshold that lets fabrications through, and the retuning would happen on the cases that
motivated it. The repository's whole claim is that the badge was computed rather than asserted, and
a number in the decision path is the badge becoming asserted.

The shape the locator may return has **no room for a number**:

```ts
{ located: boolean; span: string }
```

`located: false` is an expected outcome, not an error. A claim whose abridgement cannot be found in
its cited record yields `rejected` — exactly the answer that case received before the arm existed,
which is why the mechanism adds no new failure mode.

## The safety property

**A bad anchor can only ever yield `unverifiable` or `rejected`. Never `verified`.**

This is what makes the design safe rather than merely strict. The locator's entire influence on a
verdict is to move a case *out of* `rejected` and into `unverifiable` — a change in which of two
non-verified verdicts applies, both of which block the answer. Every route to `verified` remains
strict normalized substring containment, enforced by gate **G-1** and by the sole `verified`
construction in `packages/mizan-verify/src/verify.ts`. A locator that could be argued into a
`verified` would be the CWE-345 fabrication-acceptance hole wearing a determinism story as a
costume.

It also means the locator cannot be *net* protective. Its worst case is the one published above: it
turns 40 fabrications from "the source does not say this" into "we cannot decide", and it never turns
anything into a confirmation. That asymmetry is why the movement count is printed beside the
zero-`verified` count rather than in a comment: a reader who is told only that the protocol is
"conservative" would draw the wrong conclusion about a mechanism that in fact weakens detection on
exactly the hardest cases in the set.

## The locator contract

The contract, as implemented at step 5b of `verify.ts`:

1. It runs **only** when containment has already failed. A claim that is a contiguous quotation
   never reaches it, so it cannot slow down or perturb the common case.
2. It is consulted **only** on the record the citation already resolved to. It never searches the
   corpus, never re-resolves a citation, and never changes which record a claim is checked against.
3. It returns a **found span** or `located: false`. It returns no score, and nothing downstream may
   read one.
4. On `located: true` the verdict becomes `unverifiable` with reason `no_matching_evidence`. On
   `located: false` the verdict is `rejected` with reason `quote_absent_at_cited_id` — unchanged.
   The mapping is stated in one place and it is not this list: `docs/specs/adr/ADR-C7.md` is its
   authority, it reconciles ADR-C1, and the code is what it records. A specification once proposed
   the inverse of this table, and `packages/mizan-gate/src/docs-polarity.ts` now reports a document
   that pairs a locator result or a reason with the verdict the other one requires.
5. It is **deterministic**: same snapshot, same claim, same output, byte-identical across runs. The
   verifier's determinism guarantee is the repository's central claim, and a probabilistic or
   heuristic locator would break it.
6. The reason is `no_matching_evidence` — the exact value the 66 human rulings already record in
   `EvalCase.adjudication`, and a term already present in `VerdictReason`. The reason vocabulary is
   the single source of truth for why a verdict was reached, and a reason invented anywhere else is a
   second source of truth for it. **This deviates from the architecture plan**, which proposed a new
   `paraphrase_or_reworded` term; the human rulings are the higher authority over what the branch
   emits, and no new vocabulary is added for a branch whose own phrase would be the first user of it.
7. The branch is placed **between step 5 and step 6** of `verify.ts`, so it is reached only after
   containment has already failed. A contiguous quotation never touches it.

## Current status: mechanised, exercised, and its cost published

The procedure now returns what this document says it returns. The arm lives at step 5b of
`packages/mizan-verify/src/verify.ts`, it is reachable only after containment has failed, and it
carries 66 human-drawn spans — one per adjudicated case, none for anything else.

- **The 26 golden elisions** now read `unverifiable` / `no_matching_evidence` in three places that
  must agree: the case's `expectedVerdict`, its `adjudication`, and what the verifier actually
  emits. A test asserts the three-way agreement case by case, and fails naming the ids if any
  drifts.
- **The 40 red-team fabrications** keep their `rejected` ruling, which is a statement about what the
  claims *are*. Their observed output is `unverifiable`, because an anchor drawn from a largely
  real span locates. That movement is exactly the number published in advance, and a test asserts
  the observed count equals `redTeamMovement.rejectedToUnverifiable` rather than trusting it:
  `"rejectedToUnverifiable": 40, "falseVerifiedDelta": 0`.
- **The arm stays opt-in.** The same 26 elisions with `anchorText` removed fall back to `rejected` /
  `quote_absent_at_cited_id`, asserted by a planted regression. An anchor is a decision a human
  made for a case, never a default the code applies to text it has not been told about.
- **Nothing became `verified`.** `falseVerifiedDelta` is 0 and the sole route to `verified` remains
  strict normalized substring containment.

The divergence stamp itself is retired: `EvalCase.divergence` and `EvalSet.knownDivergence` were
dropped at `schemaVersion` 2, and both eval sets regenerate without them. What survives is the
thing worth keeping — `EvalCase.adjudication`, the ruling beside the expectation — plus
`data/eval/adjudication.json`, which is unchanged byte for byte: a ruling table that moves when the
code moves is not an independent authority.

The regression suite is `packages/mizan-verify/test/adjudicated-elisions.test.ts` (the 26 elisions,
both directions), and `apps/cli/test/eval.test.ts` asserts the movement contract over the whole
66-row sweep. MIZ-106 is done; the numbering is kept because the plan and the risk register use it.
