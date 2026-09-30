# ADR: for-this-project-need-to-deep-honest-review-and-analysis-and-val v2

**Status:** proposed
**Date:** 2026-09-29

## Context
# CEO Strategic Review — mizan Value Validation & Gap Closure

## 1. Executive Summary

The feedback ("value is weak, any search tool can do this") conflates **retrieval** with **verification**. Market evidence confirms retrieval/answering is table stakes — but citation accuracy across search-class products is ~74% industry-wide (Tow Center: 8 engines wrong on >60% of 1,600 queries; Islamic citation scores 1.82–3.38/5), and **no competitor (Ansari, Fanar-Sadiq, UmmahAPI, Perplexity/Elicit) emits a computed, fail-closed, per-claim verdict**. That negative-space claim is mizan's real value — yet today it is *asserted in prose, not demonstrated*, and six load-bearing gaps give a judge legitimate grounds to dismiss it: (1) 57 changed + 38 untracked files mean HEAD ≠ what we claim; (2) paraphrase divergence — code says `REJECTED`, spec and 26 human rulings say `UNVERIFIABLE`; (3) zero UI against the "منتج متكامل قابل للتشغيل" requirement; (4) keyless `PRECOMPUTED` replay misread as "not real"; (5) golden 100% is self-referential; (6) no Bukhari/Muslim, no tafsir, no multilingual. This plan ships a **value-proof pack** plus gap closures in two sprints, scoped to the realistic fallback slice. **Expected impact:** a judge *sees* the badge computed on a page, *runs* the verdict path in CI, and hears one defensible sentence — "search attaches citations; mizan adjudicates them, fail-closed, with a hash-chained receipt" — backed by artefacts on HEAD, not on disk.

## 2. Business Value Analysis

**Primary driver:** credibility/defensibility (competition scoring, judge trust). **Secondary:** demonstration quality. Not revenue. **Thesis accepted:** we win on verification, never on fluency or retrieval — answer-quality claims are permanently out of scope.

### MoSCoW Classification

**Must Have**
1. Commit the entire working tree so HEAD equals what is claimed (R-5, #1 credibility risk); clean-tree CI green.
2. Mechanise paraphrase/elision → `UNVERIFIABLE`; code, spec, README and 2

## Decision
The architecture plan is written to the wiki as **`arch-value-validation-impl-2026-09-30`** (tags: architecture, value-validation, implementation-plan, ready-for-development), linked to `spec-value-validation-2026-09-29` and `research-market-value-review-2026-09-29`. Summary:

## 1. Executive Summary
The working tree is already fully green (`bun run ci` = **152.6s**, all gates + docs + ledger + runs + ingest checks pass on HEAD `cdc34c5`), so Sprint 1 is activation/packaging/docs of mechanisms that exist — not new verification logic. Three decisions: **(D1)** Story 2 completes by wiring the eval harness to the existing inert step-5b anchor arm — 66 human-drawn spans in the guarded literals module, new optional `EvalCase.anchorText`, flip the 26 `elide_middle` expectations to `unverifiable/no_matching_evidence`, retire `knownDivergence`, and rewrite eval tests to the **movement contract** (26/26 three-way agreement; observed 40-case `rejected→unverifiable` movement must equal the published `redTeamMovement{40,0}`), while the benchmark stays anchorless so `systemDetectionRate: 1` survives with the anchored-path cost disclosed beside it. **(D2)** Story 3 ships `apps/web` as hermetic codegen — committed fixture decoded via `decodeOrFail`, static HTML from a badge map moved verbatim to `@mizan/core/src/badges.ts`, no framework/client JS (ADR-C3), gates widened to `.html` (safe: G-2 matches sink tokens, not tags; zero legacy HTML). **(D3)** No new gate IDs (machine-checked claim) — every new check is a pure docs rule (R9…R14) or planted-violation test; Story 7 writes the **11 ADR files** that make every citation outside `specs/` resolve.

## 2–5. Codebase / Modules / APIs / Data
Sprint 1 touches: `schema/eval.ts` (+`anchorText`, optional `knownDivergence`, v2), `scripts/eval/{adjudication,build,plan}.ts`, regenerated eval sets (golden counts → 94/40/66), `eval.test.ts` rewrites, `badges.ts` move, new `apps/web` workspace (encoder/page/build/fixture/tests), gate `scan.ts`/`docs-gates.ts`/`g7-DISPLAY_PATH`/`docs-claims.ts`, `docs/demo-runbook.md`, `docs/value-proof.md`, `docs/specs/adr/ADR-{02,03,04,05,06,11,C1..C5}.md`, deck/README framing. Sprint 2: credibility doc, licence-gated adapters (or honest-framing fallback), qualifier sweep + oral one-pager. APIs specified with signatures in §4 of the wiki; `adjudication.json` is never modified.

## 6–10. Errors / Security / Patterns / Tests / Performance
Fail-closed tables mapped to §16 (staleness → named red, bad anchor → arm skipped → `rejected`, movement mismatch → fail naming cases, fixture decode → build fails). OWASP A03/A05/A07/A09/A10 + CWE-345 addressed architecturally (one encoder, hashes-only ledger strip, 4 env vars unchanged, no outbound calls in Sprint 1, arm type admits only `unverifiable|null`). Patterns: single-source-of-truth map move, codegen-over-framework, adapter registry, planted self-test pairs, structural impossibility over convention. Testing: movement contract, byte-staleness both 

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.