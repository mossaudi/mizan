# ADR: lets-efficient-continue v2

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
I stopped to check one thing in my own plan rather than declare victory: whether the rule I designed could actually reach the documents that hold the stale figures. It could not — and checking that surfaced three defects, one of which invalidates a module I told the SE to create.

## What I got wrong

**The artefact shape I specified would have been inert.** `readFigures` (`docs-value.ts:92-105`) collects figures with `Object.entries(parsed)` — **top-level numeric keys only**. My shape was nested (`latency{}`, `presenceAtCutoff[]`, `precisionByRank[]`, `floorRecallCost{}`), so under the existing rule *none of those numbers are figures at all*. `vs-search.json` is flat for exactly this reason: `systemDetectionRate`, `delta`, `corpusRecordCount` — and its nested `declaration` block is deliberately not a figure source. I specified a document the gate would read as nearly empty.

**I proposed a module that already exists.** `checkBenchmarkClaimUnbacked` already does backing *and* attribution, keyed per line, with `renderingsOf` as the shared admissible-spelling vocabulary and `groupFigure` handling `27,234` ↔ `27234`. My plan called `docs-value.ts` "the closest precedent" and then reimplemented it — producing a **second answer to "may this document state this figure"**, which is the precise defect that file documents at length and AGENTS §17 forbids. **`docs-performance.ts` is retracted.** Only the *band* is genuinely new capability: grep found no tolerance, band or epsilon concept anywhere in the docs rules, so attribution is exact equality.

**The rule would never have fired on the defect it was written for.** `AUDITED_DOCUMENTS` (`docs-check.ts:90`) is a closed six-element list, and every per-document rule runs only over it in the loop at `docs-check.ts:360-380`. The stale latency figures live in `docs/specs/adr/ADR-08.md` and `docs/degradation-matrix.md` — **neither is audited.** The tree sweep at line 408 covers gate counts and ADR citations, not figures. My rule would have been green forever while the numbers it targeted sat unchanged.

That last fix has a cost I should not have discovered late: adding documents to `AUDITED_DOCUMENTS` switches on **seven** other rules over them (`docs-check.ts:371-379`). Dense prose documents will produce a findings burst unrelated to this cycle. It needs its own step, its own triage, and — if it proves large — an explicit statement in ADR-13 that figures are reconciled but not yet machine-checked. A stated gap beats a gate nobody can afford to turn on.

Recorded in `arch-v5-precision-cycle-amendment-1`, which supersedes §2, §4 and §5 of the original.

## What stands

The gate, its owner (`verify/diagnostics/nearest-floor.ts`), its post-ranking placement and <1 ms cost, the G-7.2 naming constraint, the flat `sharedRunChars`/`quoteChars` contract, G-7.12, the three ADRs, the determinism and badge-isolation tests, and the finding that the published latency figure **is** reproducible within ~10% on comparable hard

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.