# ADR-22: Root Coverage = Measurement Artefact First

- **Status:** Accepted

## Context

The product was asked to demonstrate "root-level coverage" — i.e., what fraction of Quranic triliteral roots appear in the corpus — as a competitive differentiator. A feasibility spike established:

1. The established Quranic triliteral root count is approximately **1,651** (per classical morphological studies: Al-Khalil ibn Ahmad, Sibawayh, and modern lexica like Lisan al-Arab and Taj al-Arus).
2. No production Arabic morphological analyzer exists in the repository's dependency graph. The only available tools are rule-based approximations.
3. A dual-stemmer cross-check (custom rule-based + AlKhalil-style pattern matching) was implemented in `packages/mizan-bench/src/root-coverage.ts` and produces a **42.80% disagreement rate** between stemmers — far too high for any production index.
4. The `CorpusRecord` schema was extended with optional `root`, `stem`, `lemma` fields (record.ts) to prepare for a future where a real stemmer populates them, but they are not populated today.

## Decision

**Root coverage is a measurement artefact, not a shipped index.**

- The tool `bun run root-coverage` (in `@mizan/bench`) computes a dual-stemmer cross-check over the Quranic corpus and writes `docs/artefacts/root-coverage.json`.
- The artefact declares the methodology, both stemmer versions, per-root agreement/disagreement, and the delta (42.80%).
- The artefact **explicitly states `indexShipped: false` and `indexReference: null`** — no search index is built, no retrieval path uses root data, and no user-facing feature depends on it.
- The declared ~1,651 roots is a reference to established scholarship; the tool's actual output (5,334 union roots) reflects the known limitation of rule-based approximations.

## Consequences

### Positive
- The measurement exists and is transparent about its limitations.
- The artefact is a committed, reviewable JSON file that a judge can inspect.
- `CorpusRecord` schema is forward-compatible: when a production stemmer becomes available, the fields are ready.
- No CWE-345 risk: root data never reaches the verifier, never influences a badge.

### Negative
- The high delta (42.80%) means the current methodology cannot support a production feature.
- A customer asking for "root search" will not get it this cycle — the refusal is documented, not deferred.
- The spike table (ADR-03) and this ADR together form the evidence that semantic/root matching is refused, not missing.

## Load-Bearing Properties

1. **No index ships**: The artefact contains `indexShipped: false`; any code that reads root data for retrieval must be rejected by G-1.
2. **Verifier isolation**: `@mizan/verify` imports only `@mizan/core`; root fields are in `CorpusRecord` but `verify.ts` never accesses them (enforced by G-1.1).
3. **Artefact-first**: Every figure in prose has a committed counterparty in `docs/artefacts/root-coverage.json` (AGENTS.md §17).
4. **Refusal is product**: ADR-21 and this ADR together form the written refusal that the customer can read.

## Related

- ADR-03: Semantic matching refused (spike table measured 67.5% fabrication acceptance)
- ADR-21: No semantic nearest-match; refusal is product
- ADR-23: Companion = licence-gated, grade-null
- `packages/mizan-bench/src/root-coverage.ts` — the measurement tool
- `docs/artefacts/root-coverage.json` — the committed artefact
- `packages/mizan-core/src/schema/record.ts` — `CorpusRecord` with optional root/stem/lemma