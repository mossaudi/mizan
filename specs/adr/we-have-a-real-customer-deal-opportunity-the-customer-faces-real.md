# ADR: we-have-a-real-customer-deal-opportunity-the-customer-faces-real v1

**Status:** proposed
**Date:** 2026-10-01

## Context
---

## 1. Executive Summary

A real customer deal opportunity requires mizan to be not just "production-ready" but "industry-leading." This plan bridges internal needs with external best practices by harvesting global best-in-class patterns and integrating them into the existing architecture. The core thesis: **mizan's deterministic verification + cryptographic attestation is a market differentiator that no competitor combines.** The plan focuses on three adoption-ready improvements — Merkle-chain ledger (TRACE Gov pattern), IETF VRO-aligned attestation (regulatory alignment), and HALLMARK benchmark coverage — while explicitly rejecting patterns that would compromise determinism (LLM-as-judge, fuzzy matching). Expected impact: a defensible, auditable, customer-deployable platform that exceeds competitor CiteCheck (88.7 macro-F1, non-deterministic) and CITEVERIFIER (88% false positive rate) on the dimension that matters most for religious content: **zero false positives on fabricated citations.**

---

## 2. Business Value Analysis

**Primary Value Driver:** Trust and compliance. In Islamic AI, a false `verified` on a fabricated hadith is a religious harm, not a bug. The customer deal hinges on mizan's ability to prove, cryptographically and deterministically, that its verdicts are computed, not asserted.

### MoSCoW Classification

| Priority | Requirement | Rationale |
|---|---|---|
| **Must** | Merkle-chain prev-hash linking in runs.jsonl | Industry standard; tamper-evidence is a customer requirement |
| **Must** | IETF VRO-aligned attestation.json | Regulatory alignment (EU AI Act, NIST AI RMF); customer compliance gate |
| **Must** | HALLMARK 14-type hallucination taxonomy coverage | Benchmark completeness; customer evaluation criterion |
| **Must** | Zero false `verified` on red-team set (G-6) | Non-negotiable release gate; core differentiator |
| **Must** | Deterministic verifier with no fuzzy/embedding matching | Core differentiator; CWE-345 control |
| **Sh

## Decision
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.