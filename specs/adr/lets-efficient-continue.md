# ADR: lets-efficient-continue v1

**Status:** proposed
**Date:** 2026-10-04

## Context
## 1. Executive Summary

The v5 suggestion feature is **~90% built and demonstrably working** — I ran it end-to-end. But the cycle cannot close in its current state, for three measured reasons. **CI is red** (`apps/cli` typecheck, 3 errors, cascading into the gate package's real-repo test — 2 of 12 packages fail). **The displayed list contradicts its own numbers**: on the flagship demo question, the correct record ranks 1 at `35 of 60` shared characters, then ranks 2–5 sit at `6`, `8`, `5`, `5` of 60 — unrelated hadiths rendered in the same authoritative ranked format, because the floor and ordering are stated in 3-gram *types* (a quote shares *something* with 26,655 of 27,234 records) while the reader only ever sees shared *characters*. And **a published number is not reproducible**: ADR-08 and the degradation matrix state `p95 634 ms`; the harness today reports `p50 597 ms / p95 1121 ms / max 1928 ms`, and `check:docs` passes anyway. So this cycle buys **no new capability** — it buys a green gate, a list worth reading, and no figure the repo cannot reproduce.

## 2. Business Value Analysis

**Primary driver:** integrity-driven retention. The customer's ask ("review quoted Qur'an and hadith, name the correct one, top 3–5 nearest") is served *functionally* already. What is not yet served is **trustworthy** delivery of it. The research is blunt: the field's correction accuracy is ~66–68% against a ~67.5% do-nothing baseline, and every competitor reaches `verified` through fuzzy similarity. Our entire differentiator is that the badge was *computed*. Showing a judge four irrelevant hadiths beside the correct one reads as guessing — it is the same failure mode, at a lower-stakes surface.

**MoSCoW** (full lists in the wiki spec):

| Must | Should | Could | Won't (this cycle) |
|---|---|---|---|
| CI green (2 packages) | Copy accuracy: "5 of 27234 records searched" reads as *five were searched* | Refresh `data/transcript.json` (predates the feature) | **Effect 4.0 stable

## Decision
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.