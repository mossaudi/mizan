# ADR: deep-honest-review-and-analysis-the-office-mode-at-project-c-use v2

**Status:** proposed
**Date:** 2026-10-05

## Context
# CEO Strategic Plan — mizan Enrichment

## 1. Executive Summary

The request asks mizan to absorb ideas from `opencode-office` and `hister`. Both prior analyses produced the same ranked plan, and its #1 item — *"adopt hybrid retrieval: BM25 + dense second ranker + RRF, ~120× headroom"* — is the one recommendation this plan **declines**. mizan refused that change twice already on correctness grounds (ADR-08: the FTS5 sidecar returned *nothing* for 3/10 adversarial quotes; ADR-17: recall is a precondition, not a figure), and the dense form is the CWE-345 fabrication hole G-1 exists to close, merely relocated. Meanwhile the **highest-severity finding is not a missing feature**: a large, fully passing body of governance work — degradation vocabulary, dataset-identity hashing, the coverage gate, round-robin anchor selection, the acceptance command, ADRs 15 and 17 — is **green but uncommitted**. Sprint 1 therefore lands and hardens what exists, and spends the credibility budget on the gap `docs/value-proof.md` itself calls *"the weakest link in this document"*.

I verified the load-bearing claims myself: `bun run ci` → **GREEN** (13/13 packages, 7/7 gates); `check:docs` → **GREEN**.

## 2. Business Value Analysis

**Primary value driver: credibility, not accuracy.** Competitors top out at 50–89 % probabilistic verification (CiteGuard 68.1 % vs 69.2 % human; FaithBench SOTA ≈ 50 %). mizan has no accuracy ceiling — so the claim to sell is determinism and auditability.

**The decisive correction.** The BEIR "120× headroom" figure is English, on SciFact, and says nothing about the property ADR-08 measured directly: **in Arabic a quote shares a 3-gram with 26,655 of 27,234 records**, so the ranking floor is nearly inert and a learned ranker has no headroom to exploit. G-1's similarity ban is scoped to `mizan-verify`, so dense retrieval in `mizan-retrieval` is *permitted* — but permitted is not wise. Note `mizan-retrieval/src/rrf.ts` exports `fuse` and `RRF_K = 60` with **zero

## Decision
I verified the spec's load-bearing claims first-hand and found five material corrections. Plan written to the wiki.

## 1. Executive Summary

Sprint 1 lands the dirty tree and hardens the governance body already in it. I confirmed the framing: `bun run ci` is **GREEN** (13 packages, 7/7 gates), `check:docs` is **GREEN**, and the tree has **47 entries** (spec said 30+) including a deleted `served.ts`. The highest-severity finding really is uncommitted work.

Five corrections follow. Two invalidate spec text:

**The `rrf.ts` claim is false.** The spec says it has "zero importers: dormant, not a mandate." `search.ts:3` imports `fuse` and line 167 calls `fuse(lists)` on the shipped path, fusing every non-empty BM25 pass. ADR-18 as drafted says "keep `rrf.ts` dormant by design" — committing that would put a **false description of the shipped system into an accepted ADR**, the exact defect class this repo exists to prevent. The dense-ranker refusal stands; the framing must be struck.

**M4's two levers are mutually exclusive.** "Allocation reduction *and* a stricter ranking floor" — raising `MIN_SHARED_TRIGRAMS` above 8 is recall loss by construction, and it's what ADR-08 already rejected. M4 is scoped to allocation reduction only.

Three more: the docs-coverage hole is narrower than reported but is a *deliberate* fail-open; M2 needs a figure extractor, not an ADR-aware engine; and two §2 `throw`s sit on M3's exact code path.

## 2. Codebase Impact

| Action | Files |
|---|---|
| **Land** (M1) | 7 ordered commits: core → gate → scripts → data → docs → README/package/cli tests |
| **Triage, do not commit** | `specs/` (6 office scratch files), `pm_overview.md` (1 byte) |
| **Create** | `docs-facts.ts`, `docs-holdout.ts`, `schema/holdout.ts`, `schema/record-id.ts`, `schema/load.ts`, `eval/holdout.ts`, `bench/src/calibration.ts`, `retrieval/src/query-grammar.ts`, `mcp/src/query-tool.ts`, `suggest/test/rank-golden.test.ts`, `load/*.ts` |
| **Modify** | `docs-check.ts` (×2), `index.ts`, `score.ts` (§2 fix), `trigrams.ts`/`rank.ts`/`suggest.ts`, `server.ts`, `office_facts_research.json` |

## 3–4. Module Design & API

Follows existing patterns: rules as pure functions `(document, file, artefact) => readonly DocsClaim`; table + pure decision (`accept-customer.ts`'s shape) for the hold-out harness; named projections (`RecordIdList`, mirroring `VerdictSummary`).

Two deliberate non-patterns: **no Strategy** for the S4 grammar (one grammar; a strategy is ceremony), **no new gate number** for M2 — a docs rule avoids the `GATE_IDS` → `docs-gates.ts` blast radius across ~10 files.

## 5–7. Data, Errors, Security

`HoldoutResult` is a **new artefact**, keeping `BenchmarkResult` v2 and its 70 keys untouched. `fpr`/`deltaFpr` are optional and their absence means *unmeasured* — a schema that keeps "0" and "absent" apart.

No Sprint-1 story adds a trust boundary. M3 adds *sensitive data*: adversarial fabrications of religious text, repo-internal, never prompted, never re

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.