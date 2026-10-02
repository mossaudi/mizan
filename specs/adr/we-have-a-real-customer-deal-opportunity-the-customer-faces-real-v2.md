# ADR: we-have-a-real-customer-deal-opportunity-the-customer-faces-real v2

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
The architecture plan has been written to the wiki. Here is the complete implementation plan:

---

## 1. Executive Summary

This plan bridges mizan's existing deterministic verification architecture with three adoption-ready improvements: IETF VRO-aligned attestation, HALLMARK 14-type benchmark coverage, and provider resilience with local fallback. **Key finding from codebase analysis:** the run ledger already implements prev-hash chaining (`sealTrace`, `traceDigest`, `verifyRunChain` in `mizan-provenance/src/run-ledger.ts`), so US-01 is already satisfied — the gap is the judge-runnable verify script (US-02). The plan adds missing pieces: VRO attestation schema, HALLMARK coverage matrix, red-team fixtures, Ollama fallback, degradation matrix, and per-claim SSR metric. No competitor combines deterministic verification + cryptographic attestation.

## 2. Codebase Impact

**Create (17 files):** `attestation-schema.ts`, `ssr.ts`, `red-team-fixtures.ts`, `red-team.test.ts`, `hallmark-coverage.test.ts`, `ollama.ts`, `ollama.test.ts`, `provider.test.ts`, `degradation.test.ts`, `verify-chain.ts`, `test-verify-chain.ts`, `benchmark.ts`, `hallmark-coverage-matrix.md`, `degradation-matrix.md`, `data/precomputed/`, `ssr.test.ts`, `attestation.test.ts`

**Modify (6 files):** `attestation.json` (regenerate VRO-aligned), `mizan-core/src/index.ts` (export SSR types), `mizan-agent/src/provider.ts` (failover), `apps/cli/src/provider-config.ts` (Ollama), `apps/cli/src/exit-codes.ts` (7 named codes), root `package.json` (new scripts)

**NOT modified (already sufficient):** `run-ledger.ts`, `run-store.ts`, `trace.ts`, `hash.ts`, `verify.ts`, `g6-no-false-verified.ts`

## 3. Module Design

```
packages/mizan-core/src/schema/ssr.ts          [NEW] SSR metric types
packages/mizan-verify/src/ssr.ts               [NEW] Per-claim SSR computation
packages/mizan-verify/test/red-team-fixtures.ts [NEW] 14 HALLMARK-type fixtures
packages/mizan-agent/src/providers/ollama.ts   [NEW] Ollama local fallback
packages/mizan-corpus/src/attestation-schema.ts [NEW] IETF VRO-aligned schema
scripts/verify-chain.ts                        [NEW] Judge-runnable chain verify
scripts/benchmark.ts                           [NEW] Unified benchmark harness
```

**Design Patterns:** Port/Adapter (provider), Strategy (SSR), Observer (trace), Fail-Closed (all paths), Merkle Chain (ledger). **Rejected:** LLM-as-judge, fuzzy matching, embedding similarity.

## 4. API Design

- **Chain Verify Script:** `bun run scripts/verify-chain.ts [--json]` → exit 0 (valid), 1 (tampered), 2 (file error), 3 (decode error)
- **SSR Metric:** `computeSsr(response, verdicts) → SsrResult { totalSentences, supportedSentences, rate, perSentence }`
- **Ollama Provider:** `ollamaProvider(config: OllamaConfig) → Provider`
- **VRO Attestation:** 8 control areas, 3 maturity levels, determinism evidence

## 5. Data Design

- **HALLMARK Coverage Matrix:** 14 types → 14 test cases (RT-001 to RT-014), each with expected verdict and d

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.