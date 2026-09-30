# ADR: for-this-project-need-to-review-and-analysis-and-validate-its-re v1

**Status:** proposed
**Date:** 2026-09-27

## Context
# CEO Strategic Review — mizan value proof, Track 4

**Spec:** `spec-value-proof-and-paraphrase-determinism-2026-09-28` (wiki)
**Prior research:** `research-mizan-market-value-2026-09-28` · `competitive-feature-comparison-mizan-vs-islamic-ai-market-leaders-2026-09-27`

---

## 1. Executive Summary

The feedback — *"a search tool could do this"* — is **factually correct of the shipped surface and false of the architecture**, and that split is the whole finding. Correct of the surface: no UI, no API, an 81 MB gitignored corpus a judge must fetch before anything works, one live run in 274. False of the architecture: `VERIFIED` is constructible at exactly one site (strict folded substring containment), enforced by gates G-1/G-6, and `INTEGRITY.md §2` records a *measured* spike where the fuzzy alternative the attachment proposes scores an invented-but-plausible hadith as a high match. The differentiator is real and **unmeasured against the alternative** — that absence, not a missing capability, is the most likely root cause of the feedback. This cycle therefore buys **proof and honest completeness, not AI capability**: (1) a judge-runnable comparative benchmark that quantifies what the verifier catches that plain FTS5 search does not; (2) the anchor protocol, which resolves the 26 disputed `paraphrase → REJECTED` cases with **no score, no new dependency, and no new route to `VERIFIED`**; (3) a ≤3-command, no-API-key judge path that labels its own evidence tier. The attached recommendation (`new 5.txt`, "TAAP") is a trap and is explicitly rejected: its `calculate_confidence` is `min(len)/max(len)` — a string-length ratio, not similarity — it returns `VERIFIED` on any HTTP 200, `json.loads` model output, and hardcodes a fallback hadith. Adopting it would destroy the only defensible asset in the repository.

## 2. Business Value Analysis

**Primary driver:** defensible differentiation in a judged competition — the asset is *credible integrity*, not features. Market groundin

## Decision
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.