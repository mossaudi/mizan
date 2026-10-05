# ADR: we-have-a-real-customer-deal-opportunity-the-customer-faces-real v7

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
The plan is complete and grounded in the tree. Delivering it now.

---

# arch — customer-deal production readiness (2026-10-05)

**Spec:** `spec-customer-deal-production-readiness-2026-10-05` · **Wiki:** `arch-customer-deal-production-readiness-2026-10-05` · **Baseline:** `5f3509d` (working tree clean apart from the two untracked spec files)

Every claim below was read against the tree, not the spec. **Six spec corrections (§13) are recorded, and two of them change what Story 1 is allowed to touch** — flagging those before anything else.

## 1. Executive summary

Make every published figure a **derived property of committed evidence**, and make the two ways that can go wrong — an unmeasured collection, an unmeasured corpus — **machine-refusable before a human quotes them**. Derivation lands in one new pure module (`scripts/eval/selection.ts`) and one new generator (`scripts/gen-comparative.ts`); the assertions land in `check:docs` as pure rules beside the twenty it already runs, **not** in `GATE_IDS`, because the served set is available offline from the committed `attestation.json` and a gate that needs `data/corpus.db` cannot fail closed on a clean clone. Three headline decisions: **(1)** the coverage assertion is a docs rule, not `G-8` — the served set comes from `attestation.json:collectionCounts`, so the rule runs with no corpus and no key, and "seven gates" stays a true published number; **(2)** ADR-15's per-collection derivation is **scoped to the fabrication classes** — three of the four `.slice()` sites feed the *golden* set exclusively, whose case ids are the keys of `data/eval/adjudication.json` and whose 200/30 shape is hard-pinned in `apps/cli/test/eval.test.ts`, so applying the rule there re-keys human adjudications for zero coverage gain; **(3)** the shared degradation vocabulary moves into `@mizan/core` as a declared schema, which makes Story 7's "both surfaces agree on the state name" true *by construction* instead of by string comparison. No new dependency, no new gate id, no change to `mizan-verify`.

## 2. Findings that change the stories

| # | Finding | Evidence | Consequence |
| --- | --- | --- | --- |
| F1 | The coverage rule can be **offline and clean-clone-safe**: `attestation.json` is committed and carries `collectionCounts` for exactly the 6 served collections | `abudawud 5272, ibnmajah 4336, malik 1829, nasai 5672, quran 6236, tirmidhi 3889` | Rule belongs in `check:docs`. `docs-check.ts:servedCollections()` already reads it with a fail-closed `usable` flag — reuse that shape |
| F2 | **Three of the four `.slice()` sites feed the golden set only.** `buildMainClasses` is called only from `buildGolden`; `buildElide`/`buildInjection` are `redTeamCount: 0` classes | `build.ts:414-435`; `plan.ts:99-107,156-161` | Only `buildSimple:341` (letter_transposed, word_inserted) is on the fabrication path. **ADR-15 applies there only** |
| F3 | The golden set's shape is **hard-pinned**: `expect(golden.cases).toHaveLength(200)`, `ex

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.