# ADR: we-have-a-real-customer-deal-opportunity-the-customer-faces-real v3

**Status:** proposed
**Date:** 2026-10-03

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
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.