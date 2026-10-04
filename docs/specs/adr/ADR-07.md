# ADR-07 — The nearest-quote list is display-only, and its module cannot name a verdict

- **Status:** Accepted

## Context

Sprint 1 added a feature that does not exist anywhere else in this repository: a module whose whole
job is to decide which of 27,234 texts is *most like* another text. Every other similarity-shaped
decision was removed from this codebase on purpose — ADR-03 keeps the verifier on exact normalized
substring containment, and the feasibility spike that motivated it found that a fuzzy scorer rated
an invented-but-plausible hadith as a high match. The nearest-quote feature therefore had to be
built next to the one rule that forbids exactly this, and the failure mode it introduces is the
same one the spike found: a plausible-looking list under a badge invites the reader to treat the
list as evidence.

## Decision

Suggestions are **display-only**. A `Suggestion` carries record ids, record texts, citation
metadata, a grade as the dataset asserts it, and the count of records searched. It carries no score,
no percentage, no confidence, no rank value, and no verdict of any kind, and no code path exists by
which it could affect one.

The judgement lives in `@mizan/suggest`, which is a **leaf package**: it may import only relative
modules and `@mizan/core`. It has no database handle, no provider, no network, no clock, no
randomness and no locale, and it may not contain the words `verdict` or `verified` in code or in a
string. Gate **G-7.8** enforces the dependency list and **G-7.9** the vocabulary, because a
similarity module one door away from the verifier is exactly where the CWE-345 hole would reopen.

The CLI runs the pass only for claims the verifier **rejected**, after the verdict is printed, and
it prints the mandatory disclaimer on every state of the list, including `unavailable`.

## Rationale

A display-only feature is safe because of where it sits in the dependency direction, not because of
what it promises: `render.ts` cannot reach a decision, and the decision was already made and printed
before the list exists. Making the capability *absent* rather than merely unused is what keeps it
that way — a module that cannot name an outcome cannot return one, so the "97% match" verdict hole
is unwritable rather than merely discouraged.

Banishing the feature instead would have been the other honest option. We chose it because a judge
holding a fabricated quote and no answer is the exact situation the product exists for, and
"here is the nearest real text" is information, not a verdict.

## Consequences

- `@mizan/suggest` is checked by two new G-7 rules with planted violations, so neither property can
  be dropped quietly.
- A rejected claim with no quotation produces **no list and no line**: absence must not read as
  "nothing near this", which is why `no_candidates` exists as a state.
- The list is absent for `verified` and `unverifiable` claims. Offering neighbours under a claim that
  produced no evidence would answer a question nobody asked.
- A gate finding fails the build by name, so adding a dependency to the ranking package is a red CI
  run rather than a review comment.