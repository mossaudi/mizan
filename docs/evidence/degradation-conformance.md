# Degradation conformance: the matrix vs the code that must implement it (SB-003)

**Recorded by:** SB-003 (CEO sprint plan). **Tags:** degradation, conformance, audit, evidence.

This file is the conformance audit behind the claim *"the honest degradation matrix is a document
that the code implements, row by row."* Each of its four tables pairs a row of
`docs/degradation-matrix.md` with the exact code site that must say the matrix's words, and with the
exit code the CLI exports for it. The line references were captured by grep against the working
tree on the day this document was written; `packages/mizan-gate/test/docs-degradation-conformance.test.ts`
asserts the same four tables by parsing the matrix fresh, so a row that drifts from its code site
fails in CI rather than in a reviewer's memory.

## 1. The seven failure modes

| # | matrix surface (`degradation-matrix.md:11-19`) | code owner | anchor |
| --- | --- | --- | --- |
| 1 | `model unavailable` | agent spine | `packages/mizan-agent/src/spine.ts:59` — `model_unavailable: "model unavailable"` |
| 2 | `no sources found` | agent spine | `packages/mizan-agent/src/spine.ts:100` — `message: "no sources found"` |
| 3 | `unverifiable` | verifier | `packages/mizan-verify/src/verify.ts:97` — `verdict: "unverifiable"`; the 10s budget is the deadline hook at :257/:275 (`verification_timeout`) |
| 4 | run marked untrusted | run ledger | `packages/mizan-provenance/src/run-store.ts:325` — `The run is UNTRUSTED: it happened but was not recorded.` (and the :247-301 append-failure family) |
| 5 | loud integrity error, no verdict | attestation | `packages/mizan-corpus/src/attest.ts:105` — `_tag: "attestation_mismatch"` (a project of the corpus state, not a verdict) |
| 6 | `unavailable` | retrieval tools | `packages/mizan-retrieval/src/tools.ts:47` — `_tag: "backend_unavailable"` (typed, "never `[]`", :41) |
| 7 | `semanticRanking: "unavailable"` | retrieval search | `packages/mizan-retrieval/src/search.ts:172` — `ranking: lists.length > 1 ? "fused" : "unavailable"`; the vocabulary sentence at `packages/mizan-core/src/schema/degradation.ts:105` |

## 2. The exit codes

| code | matrix meaning (`degradation-matrix.md:23-28`) | CLI constant (`apps/cli/src/exit-codes.ts`) |
| --- | --- | --- |
| 0 | run completed, every claim reached its declared verdict | `EXIT_OK = 0` (:27) |
| 1 | degraded: pipeline ran honestly but could not deliver a full answer | `EXIT_DEGRADED = 1` (:34); five of the seven per-mode aliases at :63-81 resolve to 1 — provider down (:63), corpus miss (:66), verification timeout (:69), tafsir unreachable (:78), second ranker down (:81) |
| 2 | usage: command line or committed input was unusable | `EXIT_USAGE = 2` (:37) |
| 3 | untrusted: run happened but cannot be trusted | `EXIT_UNTRUSTED = 3` (:44); the remaining two aliases resolve to 3 — `EXIT_LEDGER_WRITE_FAILURE = 3` (:72) and `EXIT_ATTESTATION_MISMATCH = 3` (:75) are the same refusal |

## 3. The nearest-quote suggestion states

| state (matrix `degradation-matrix.md:54-58`) | constructed at (`apps/cli/src/suggestions.ts`) |
| --- | --- |
| `candidates` — one to five lines, `shared: N of M folded characters` | state constructed at :246; the `shared:` line itself is emitted by `apps/cli/src/render.ts:281` (`renderSuggestionLine`, :275), fed `quoteChars` from `suggestions.ts:245`, with the scope list and the disclaimer the matrix names |
| `no_candidates` — the reason first | :220, `state: "no_candidates"` |
| `unavailable` — the failure's `_tag` alone, never its payload | :123, with the fixed sentence at :124: `the corpus could not be searched for nearby records (${reason})` |

The matrix's own paragraph on counts (:68-72) describes the two integers beside each record; the
pass emits them under `shared: N of M folded characters` at `apps/cli/src/render.ts:281` **after**
every verdict is printed (ADR-07), so a suggestion failure is never a verdict failure (:74-77).

## 4. The clean-clone states

| state (matrix `degradation-matrix.md:101-106`) | schema literal (`packages/mizan-core/src/schema/degradation.ts`) | surfaces |
| --- | --- | --- |
| `corpus_absent` | `Schema.Literal("corpus_absent")` (:60) | CLI and MCP name the same word; `apps/cli/test/clean-clone.test.ts` and `packages/mizan-mcp/test/clean-clone.test.ts` both assert it, and the command-level suite `scripts/accept-customer.clean-clone.test.ts` runs the same claim |
| `corpus_unusable` | :61 | the same two suites |
| `attestation_unreadable` | :62 | the same two suites |
| `attestation_mismatch` | :68 | the same two suites |

The wording table `CONDITION_SENTENCE` (:99-107) shares one sentence per condition across every
surface, because two surfaces describing the same absence in different words is the failure the
schema exists to prevent (its own header comment).

## What this audit deliberately does not claim

It does not restate any measured figure: which collections the matrix's red-team context covers,
and what the coverage figure is measured over, are recorded in
`docs/evidence/quran-tirmidhi-coverage.md` and owned by the artefact rules — this document is about
the *words and exit codes*, and nothing else.