# ADR: we-have-a-real-customer-deal-opportunity-the-customer-faces-real v6

**Status:** proposed
**Date:** 2026-10-05

## Context
# CEO Review — Customer Deal Production Readiness

**Spec:** `spec-customer-deal-production-readiness-2026-10-05` · **Research:** `research-customer-verification-claims-2026-10-05`

---

## 1. Executive Summary

The customer deal converts one known, findable credibility defect into this cycle's gating deliverable. I independently verified the critical finding by counting `citation.collection` in the committed eval sets: **`redteam-fabricated.json` covers 3 of 6 served collections** (abudawud 22, ibnmajah 16, malik 2 = 40 entries), while `golden-normalization.json` already carries the data to close it (quran 20, tirmidhi 16, nasai 25). The cause is structural — `scripts/eval/build.ts:180-216` walks collections name-ascending into one 30-entry anchor list and takes contiguous `.slice()` prefixes, so the alphabetically-last collections receive nothing. Qur'an (6,236 rows) has zero fabrication measurement, and per the market scan Qur'anic verification is the *hard* case. A customer engineer finds this in ten minutes. Until the per-collection table exists, **no figure may be quoted to the customer**. The competitive answer is not a faster number: it is a **per-collection table that publishes its zeros, pinned in code so a zero cannot silently disappear** — a table no competitor ships, because every competitor markets an aggregate "0% hallucination" and nobody discloses which collections they skipped. Impact: the 37% exclusion becomes a published, gated, honest number; every customer-facing figure becomes derived rather than retyped; the verdict path stays model-free, which the published Type I false-accept bias of the IslamicEval ST1 winners independently justifies.

## 2. Business Value Analysis

**Primary driver:** credibility/retention risk on a live deal — revenue is downstream of a technical audit passing. **Secondary:** sales enablement (a customer-runnable acceptance report converts a demo into due-diligence evidence) and reduced MTTR on claim drift.

**Must:**6/6

## Decision
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.