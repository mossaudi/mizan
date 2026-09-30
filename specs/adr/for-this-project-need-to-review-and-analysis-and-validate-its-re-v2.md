# ADR: for-this-project-need-to-review-and-analysis-and-validate-its-re v2

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
The draft is complete and saved to the wiki as `arch-value-proof-anchor-determinism-2026-09-28`. Here is the finalized architecture plan and implementation blueprint.

---

# Architecture Plan — Value Proof & Paraphrase Determinism (MIZ-101…MIZ-110)

**Spec:** `spec-value-proof-and-paraphrase-determinism-2026-09-28` · **Status:** ready-for-development · **Sprint fit:** 2 sprints (MIZ-107 re-estimated **L**, see R-PM-04) · **Wiki:** `arch-value-proof-anchor-determinism-2026-09-28`

## 1. Executive Summary

Three headline deliverables, zero new runtime dependencies, and one invariant that must not move: **`verified` remains constructible at exactly one site** in `packages/mizan-verify/src/verify.ts`.

1. **The proof spine (MIZ-101…104).** A `BaselineDeclaration`-gated FTS5 top-k baseline, a comparative harness whose *system* arm reads `scripts/eval/plan.ts` literals rather than `verifyAnswer` output, a `bun run demo` that needs no key, no network and no 81 MB corpus, and an attestation refusal extended to every published surface.
2. **The paraphrase fix (MIZ-105, MIZ-106).** A hand-adjudicated anchor table (66 cases), a deterministic locator returning `{ located: boolean; span: string }`, and a new `unverifiable (paraphrase_or_reworded)` branch placed *between* step 5 and step 6 of `verify.ts`. The branch adds **zero** new `verdict:` literals, so G-6.1 is untouched.
3. **The gates (MIZ-107…109).** G-6.5 makes the verdict path's import graph a published allowlist; G-7 adds six rules over the verdict path's import closure plus the display/classification modules. Adding G-7 falsifies the "six gates" claim, so **MIZ-107 → MIZ-109 is blocking**.

| # | Load-bearing decision | Why this and not the obvious alternative |
|---|---|---|
| **D-1** | Locator uses **`String.prototype.indexOf`**, never `includes` | G-1.4 pins `includes` to `steps/containment.ts` and `src/diagnostics/`. `indexOf` locates; `includes` decides. Keeping them distinct means **G-1.4's allowlist does not grow** and the one-`includes` invariant stays a single-file fact. |
| **D-2** | Benchmark honesty is a **data value** (`BaselineDeclaration`), not a promise | Six levers (column, filter, gold-id, k, rerun budget, ranker) are declared, printed, and checked by a pure function. A rigged baseline fails CI *and* moves the published number. |
| **D-3** | `bun run demo` appends **nothing** to `data/runs.jsonl` | The demo is a deterministic replay; the 274-entry ledger already records those runs. Not appending keeps the tree clean and is literally true; the screen says so. |

**Scope reductions the SE should know before starting.**
- **No new committed demo corpus file.** The demo snapshot is rebuilt at runtime from anchors already committed in `data/eval/*.json`. Re-committing the same rows would be a second source of truth for one fact (AGENTS.md §17) and re-open licence question R-PM-09 closed. One small new artefact is still needed: `data/eval/demo-anchors.json`, holding the demo's *verifie

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.