# Exact-containment lock: the only route to `verified` (SB-003)

**Recorded by:** SB-003 (CEO sprint plan). **Tags:** containment, verdict, evidence, determinism.

This file records the evidence behind the claim *"every route to a `verified` verdict terminates in
strict normalized substring containment, and there is no fuzzy verdict in the repository."* Four
facts make that claim machine-checkable, each with its owner:

## 1. The verifier has exactly one dependency, and its verdict procedure imports nothing else

`packages/mizan-verify/package.json` declares one dependency: `@mizan/core` (workspace). The
verdict procedure in `packages/mizan-verify/src/verify.ts` imports, in order, `@mizan/core` types
and the two strength constants (lines 1-10), then four modules from `src/steps/` (lines 11-14):
`citations`, `containment`, `coerce`, `anchor`. None of `src/diagnostics/` is among them. The
diagnostics (the display-only longest-run diagnostic and the span formatter it feeds) are exported
at the *package boundary* (`packages/mizan-verify/src/index.ts:34,41`) for the CLI's display layer,
which is why "display-only" is an import-graph property asserted by the structure gate rather than
a sentence in this document.

## 2. The containment step is a strict substring test

The verdict's central arm is `containsQuote` over the folded quote in
`packages/mizan-verify/src/steps/containment.ts` — the step the architecture and the header comment
at `verify.ts:16-22` both call "the differentiator": six steps, no model, no score, no fallback, no
clock. Normalization is shared with the corpus (`normalizeForMatch`), so "substring containment"
means *folded* containment under the same normalization both sides use — not a similarity score in
disguise and not a percentage.

## 3. Match strength is a constrained type with two shapes

`packages/mizan-core/src/schema/verdict.ts` defines exactly two:

| value | definition | line |
| --- | --- | --- |
| `ExactMatchStrength` | `{ kind: "exact"; percent: 100 }` | :69 |
| `NoMatchStrength` | `{ kind: "none" }` | :74 |
| `MatchStrength` | `Schema.Union([Exact, None])` — a third shape fails the *decode*, not a reviewer's judgment | :76 |

the constants `exactMatchStrength` (:80) and `noMatchStrength` (:79) are the only constructors, and
`exactMatchStrength` carries `percent: 100` because an exact containment match is the one strength
for which a percentage is true rather than decorative. The CLI's observed output reflects this —
`[VERIFIED] ikhlas-1 — exact_containment (match: exact)` (captured in `docs/evidence/demo-header-evidence.md`)
— with no fuzzy figure beside the badge.

## 4. What the anchor arm can produce

`verify.ts`'s anchor branch (:23-46) exists so an abridgement reports a named *unverifiable* reason
instead of a false accusation, and the module's own header records the property: the anchor arm can
only ever produce `unverifiable` — never `verified`. The span locator in `src/steps/anchor.ts`
returns a boolean flag and a span string, with no arithmetic over the two, so there is no second
way to reach the badge and no score to tune.

## How this lock is kept

- The single-dependency property is asserted by the structure gate over import graphs (the gate set
  lives in `packages/mizan-gate/src/run-gates.ts`).
- The two-shape union is asserted by the CLI's own decode path: a third shape fails `decodeUnknownSync`
  at the boundary (AGENTS.md section 1), so a fuzzy verdict cannot be constructed, only rejected.
- The 100-run determinism property (`verify.ts:61-63`) runs the verdict function a hundred times
  over one snapshot and requires byte-identical output — "deterministic" is a repeatable test, not
  an adjective.

A fuzzy percentage may exist in the display layer (`src/diagnostics/`), and the conformance work
this sprint records exists precisely so that a reader never has to check whether such a percentage
can reach a verdict. It cannot: the verification procedure has no import path to it, and the badge
type has no slot for it.