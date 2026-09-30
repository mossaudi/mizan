# mizan — engineering constitution

`mizan` (ميزان, "the balance") is a thin Bun monorepo that answers a question about
Qur'an and hadith and then **verifies its own citations**, deterministically, before
showing anything to a human being. The whole repository exists to make one claim
falsifiable: *the badge you see was computed, not asserted.*

These rules are the constitution. They are not style preferences. Every rule below has a
security or correctness reason attached, and the reason is part of the rule — if you
disagree with a rule, argue with its reason, not with your editor.

---

## 1. Schema-first decoding, never `JSON.parse`-and-trust

**Rule.** Every value crossing a trust boundary — model output, an HTTP/JSON response, a
CSV row, CLI input — is decoded through a declared schema before any code touches it.
`JSON.parse` on untrusted input is a defect, not a shortcut.

**Why.** Three of the four trust boundaries in this system receive *machine-generated or
attacker-influenceable* text. A model that returns `{"verdict":"verified"}` because it was
told to is exactly the failure the product exists to prevent. Decoding at the boundary is
the only place a malformed value can be rejected without it having already been used.
`src/schema/decode.ts` wraps the pinned Effect `4.0.0-beta.83` `Schema` seam, so beta API
drift is contained in one small adapter instead of spread across the codebase.

**How.** `decodeOrFail(Schema, input)` from `@mizan/core` returns `Result<T, DecodeFailure>`.
Never use `decodeUnknownSync` outside that one module.

---

## 2. `Result` at every boundary; no `throw` crosses a package

**Rule.** Functions that can fail for a *business* reason return `Result<T, E>`. A raw
`throw` may escape a test helper and nowhere else. `any` is forbidden; `unknown` plus a
schema or an explicit guard is the way to narrow.

**Why.** A `Result` forces the caller to handle failure in the type system, which is what
makes "degrade to an honest state" a compile-time obligation rather than a review comment.
A thrown error that crosses a package boundary becomes a crash somewhere unrelated, and
crashing is one of the states the specification forbids — every component must degrade to
an *honest* state (`model unavailable`, `no sources found`, `unverifiable`), never a
fabricated one.

---

## 3. Fail closed

**Rule.** Where a check can fail, the default action is refusal. Zero evidence blocks
approval. An attestation mismatch aborts the run. A ledger write error marks the run
untrusted. A verification timeout yields `unverifiable`.

**Why.** This is the load-bearing pattern of the whole repository. A verifier that can be
talked into confirming a fabrication is *worse than no verifier*, because it transfers
false authority onto someone making a religious decision. Fail-open is the only
unacceptable default here.

---

## 4. No `else`

**Rule.** Early return. One `if` at the top of a function, then the happy path at the
bottom, unindented.

**Why.** Nesting is where fail-open logic hides. A flat function makes the "what happens
when this check fails" question answerable by reading the first two lines.

---

## 5. No star imports, no aliased imports

**Rule.** `import { thing } from "./module.ts"` — always named, always with a path that
ends in `.ts`. Never `import * as`, never `import { thing as t }`, never a bare
`@mizan/...` barrel used for something other than a workspace package root.

**Why.** A grep that answers "does this package import anything forbidden?" only works if
the import list is literally readable. Star imports and aliases defeat the CI gate that is
the actual architectural deliverable of this project (G-1). Traceability beats brevity.

---

## 6. `const` over `let`

**Rule.** `let` appears only where a `for` accumulator or a genuinely stateful binding
requires it. Everything else is `const`.

**Why.** Reassignment is where nondeterminism hides. The verifier's determinism guarantee
(100% byte-identical verdicts across repeated runs) is only credible if the code is
written so that mutation is conspicuous.

---

## 7. Flat top-level exports, self-reexport at the bottom of each file

**Rule.** Every module exports flat named values. At the bottom of a file, a namespace
self-reexport for consumers that prefer it:

```ts
export * as Normalize from "./normalize.ts"
```

**Why.** Call sites read as `Normalize.normalizeForMatch(...)`, which tells a reader which
file owns the behaviour without an import-graph lookup. It also keeps the flat export
surface that the structure gates assert on.

---

## 8. Tests are never run from the repository root

**Rule.** `bun test` runs **from a package directory**. The repository-root `test` script
exits non-zero on purpose, printing why.

**Why.** At the repository root, `bun test` globs every package's tests, packages that
fail to load are skipped silently, and a green run can mean "nothing was collected". The
root script fails loudly instead, so nobody "fixes" it into a misleading pass. Use
`bun run ci`, which iterates packages explicitly and names the one that failed.

---

## 9. The verifier has no dependencies but `@mizan/core`

**Rule.** `packages/mizan-verify` declares exactly one dependency. It contains no
provider, no vector store, no embedding, no edit-distance, no fuzzy matching, no network
call, no clock, no locale, and no randomness. Every route to a `verified` verdict
terminates in strict normalized substring containment.

**Why.** This is ADR-03 and the CWE-345 control in one sentence. A feasibility spike proved
that a fuzzy or embedding-similarity verifier scores an *invented but plausible* hadith as
a high match — the fabrication-acceptance hole is exactly the fallback everyone reaches
for. The property is enforced by gate **G-1** in CI, not by good intentions, and
`verify.ts` is forbidden from importing `src/diagnostics/`, where the display-only
similarity diagnostic lives.

---

## 10. Match strength is a constrained type, not a percentage we computed

**Rule.** `MatchStrength` is `{ kind: "exact"; percent: 100 } | { kind: "none" }`. There
is no third shape. A fuzzy percentage may exist only in a display-only diagnostic module.

**Why.** A judge-facing "97% match" is more legible than a bare boolean — and a *fuzzy*
97% is the CWE-345 vulnerability wearing a nicer hat. Legibility is delivered by the
`exact | none` badge plus a display-only longest-run diagnostic; a pathway to a false
`verified` is not.

---

## 11. No raw-HTML sinks, ever

**Rule.** Retrieved corpus text is rendered as text. No `innerHTML`,
`dangerouslySetInnerHTML`, or `{@html}` anywhere in the product.

**Why.** Corpus text is untrusted input that we fetched from the internet and then hand to
a browser. A03. Text nodes are not a sanitiser we have to keep in sync; they are not a
sanitiser at all.

---

## 12. Prompt boundaries are advisory; the pipeline is authoritative

**Rule.** The system prompt tells the model to quote verbatim and to treat the corpus as
the boundary of assertion. It is treated as a **hint that improves output quality, never
as a control**. Only the verifier's verdicts are authoritative, and retrieved text is
fenced, length-capped and marked data-only before it enters any prompt.

**Why.** Claiming a prompt enforces a rule is over-claiming, and over-claiming in an
Islamic-content product is a correctness and safety issue, not a marketing one. A prompt
is not a security boundary; the containment check is.

---

## 13. Log and trace hashes, never content

**Rule.** A run trace carries `questionHash`, not the question. No PII, no question text,
no corpus text, no secrets — ever — in a log line, a trace, or a ledger entry.

**Why.** The data sensitivity here is low but the reputational sensitivity is not high
either: the asset is integrity. A trace a judge can read in 60 seconds is only credible if
it provably contains nothing to leak.

---

## 14. Typecheck and tests are the gate; the gate is the deliverable

**Rule.** `bun run ci` runs, per package: `tsc --noEmit`, then `bun test`, then the seven
structural gates G-1…G-7. Any failure exits non-zero and **names the failing package**.
Every gate has a self-test with a planted violation that must fail.

**Why.** A guard that cannot fail is not a guard. The differentiator in this project is
not the verifier's code — it is a set of machine-checked invariants. Full CI must stay
under 5 minutes; a flaky CI job is a defect, not noise.

The gate count itself is a published claim, so it is machine-checked too: `GATE_IDS` in
`packages/mizan-gate/src/run-gates.ts` is the only place the set is written down, and
`docs-gates.ts` fails `bun run check:docs` when any file in the repository states a different one.

---

## 15. Grade is never ours

**Rule.** A `grade` is stored exactly as the source dataset asserts it, together with
`gradeSource` and `gradeBasis`. If the dataset carries no grade, the stored grade is
`null` and the product says so. We never default, infer, or upgrade a grade, and we never
present a grade as our own ruling (ADR-06).

**Why.** Our grade would be the dataset's grade. Presenting it as our own judgment is
asserting a religious-legal evaluation we are not qualified to make and have not
performed. The same rule forbids silently quarantining a whole collection because the
concept does not apply to it — see the `gradeApplicable` model in `@mizan/core`.

---

## 16. Honest degradation, always

**Rule.** Each failure has exactly one correct surface and a list of forbidden ones:

| Failure | Say | Never |
| --- | --- | --- |
| provider down / 30 s timeout | `model unavailable` | canned answer, silent mock, partial answer shown as complete |
| corpus miss | `no sources found` | a guess, a cached answer |
| verification timeout / malformed model output | `unverifiable` | `verified`, a cached prior verdict, a crash |
| second ranker down | `semanticRanking: "unavailable"` in metadata | a silent downgrade presented as full fidelity |
| ledger write failure | run marked untrusted | fail-open, "as if recorded" |
| attestation mismatch | loud integrity error, no verdict | warn-and-proceed |
| tafsir backend unreachable | `unavailable` | fabricated tafsir |

**Why.** The single most likely way to lose this competition is shipping something that
looks verified but is not. Reliability and product integrity are the same requirement here,
not two requirements that happen to align.

---

## 17. One source of truth per fact

**Rule.** The fold table, the citations allowlist, the grade basis vocabulary, the
canonical-JSON key order and the digest rules each live in exactly one module. Other
modules import them.

**Why.** In a repository whose entire claim is reproducibility, a duplicated rule is a
place where two runs can legitimately disagree.
