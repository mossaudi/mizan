# ADR: we-have-a-real-customer-deal-opportunity-the-customer-faces-real v5

**Status:** proposed
**Date:** 2026-10-04

## Context
# 1. Executive Summary

The customer faces material consequences if the platform is not accurate and functionally excellent. Their primary ask is to **review quoted Qur'an and hadith**, identify when a quote is invalid, and, in those cases, suggest **the correct one plus the top 3–5 nearest right quotes**. 

This is best understood as **IslamicEval Subtask 1C** (nearest-correct-quote correction). While detection/validation is strong in the industry (86–90%), whole-field correction accuracy is only ~66–68% against a ~67.5% do-nothing baseline. The expected impact is therefore **not** to "guarantee the correct quote," but to deliver a **deterministic, non-authoritative suggestion capability** that preserves mizan's hard-earned claim of falsifiability. 

By strictly separating suggestions from verification, reusing the existing display-only diagnostics, and adopting a deterministic char-3-gram + Jaccard approach (no embeddings/cross-encoders), the platform can become **industry-leading in auditability** while meeting the customer need with honest degradation. Expected business impact: increased customer trust, reduced risk of false verification, and a clear competitive differentiator (auditable determinism) in an otherwise LLM-heavy space.

---

# 2. Business Value Analysis & MoSCoW Classification

**Primary business driver:** **Risk mitigation & compliance/trust** (retention + credibility). The customer's consequences mean correctness claims must remain falsifiable. A false "verified" badge is materially worse than no suggestion.

## MoSCoW Classification

**Must Have:**
- [ ] **Strict separation of concerns:** Suggestions must be **non-authoritative** and must never influence the verdict path (`VERIFIED`/`REJECTED`/`UNVERIFIABLE`).
- [ ] **Preserve MatchStrength contract:** Do not extend `MatchStrength` to include fuzzy/percentage as a verdict input. Keep `{kind:"exact",percent:100} | {kind:"none"}` only.
- [ ] **Explicit labeling & honest degradation:** Every sugges

## Decision
# Architecture Plan — Nearest-Quote Suggestions (display-only, deterministic)

**Wiki:** `arch-nearest-quote-suggestions-2026-10-04` · **Spec:** `spec-nearest-quote-suggestions-2026-10-03` · **Research:** `research-nearest-quote-suggestions-2026-10-03` · **Related:** ADR-03, ADR-06, AGENTS.md §1 §3 §9 §10 §16 §17

---

## 1. Executive Summary

Deterministic nearest-quote suggestions land as a **display-only surface on the far side of gate G-7**, implemented as a new leaf package `@mizan/suggest` whose only dependency is `@mizan/core`. Candidates come from **one ordered streaming scan of the attested snapshot** (`SELECT id, textMatch … ORDER BY id`), not from the FTS5 ranker, because `search()` caps at `MAX_LIMIT = 32` and BM25 token overlap degrades exactly when suggestions matter most — a fabrication shares few tokens with the record that holds the truth. Ranking is char-3-gram set overlap (Jaccard) with an exact-containment short-circuit and a total, code-unit tie-break. Three decisions carry the risk: **(a)** the exported contract deliberately carries **no number a reader could divide** — a required deviation from the spec's `{kind:"jaccard",value}` shape, because AGENTS.md §10, `schema/display.ts`, and gate G-7.4 all forbid it and closeness is instead explained by the display-only `longestRunFor` diagnostic the renderer already calls; **(b)** two **new G-7 sub-rules** rather than a G-8, because `GateId`/`GATE_IDS`/`docs-gates.ts` machine-check the published count of seven; **(c)** a **measured latency spike before the scan is committed**, because the whole design is one pass over 27,234 rows. No corpus schema change, no snapshot rebuild, no attestation churn, no new dependency.

---

## 2. Codebase Impact

### Create

| Path | Why |
|---|---|
| `packages/mizan-suggest/package.json` | New leaf package. `dependencies: { "@mizan/core": "workspace:*" }` only. |
| `packages/mizan-suggest/tsconfig.json` | Mirrors an existing package tsconfig. |
| `packages/mizan-suggest/src/trigrams.ts` | char-3-gram set extraction over already-folded text. |
| `packages/mizan-suggest/src/rank.ts` | Total ordering: containment → shared desc → record trigrams asc → `recordId` asc. |
| `packages/mizan-suggest/src/suggest.ts` | `rankNeighbours`, top-K, short-circuit decision, `MIN_SHARED`, `DEFAULT_TOP_K`, `MAX_TOP_K`. |
| `packages/mizan-suggest/src/index.ts` | Flat named exports + namespace self-reexports (§7). |
| `packages/mizan-suggest/test/{trigrams,rank,suggest,determinism}.test.ts` | See §9. |
| `packages/mizan-corpus/src/rows.ts` | **Extracted** `RECORD_SELECT` / `RawRow` / `toRecord` / `rowsToRecords` out of `resolve.ts` — one row decoder, §17. |
| `packages/mizan-corpus/src/candidates.ts` | Streaming scan + winner fetch. I/O lives where I/O lives. |
| `packages/mizan-corpus/test/candidates.test.ts` | Scan order, exclusion, winner fetch. |
| `apps/cli/src/suggestions.ts` | Composition + rendering. **Added to G-7 `DISPLAY_PATH`.** |
| `apps/cli/test/suggestio

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.