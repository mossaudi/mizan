# ADR: deep-honest-review-and-analysis-the-office-mode-at-project-c-use v1

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
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.