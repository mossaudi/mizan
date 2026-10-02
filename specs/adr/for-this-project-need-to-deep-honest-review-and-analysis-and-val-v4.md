# ADR: for-this-project-need-to-deep-honest-review-and-analysis-and-val v4

**Status:** proposed
**Date:** 2026-09-30

## Context
# CEO Strategic Review and Plan

## 1. Executive Summary (what, why, expected impact)
This is a monorepo for a judged competition whose product is not an answer generator but a **citation verifier**. The core differentiator is the verifier’s fail-closed posture and the fact that every step of adjudication is machine-checked by structural gates (G-1..G-7). The request is for an honest deep review against feedback that the value is weak (“any search tool can do it”) and six listed gaps.

**What we reviewed:** current codebase on HEAD (working tree clean, 13 commits), tests/gates status, project conventions (AGENTS.md 17 rules), and market/industry research.

**Why this matters:** the feedback hits both perception (live AI vs replay, UI, missing two canonical collections, paraphrase semantics) and substance (benchmark self-referentiality, multilingual/tafsir deferred). If not reframed credibly, a judge will see “demo theater” rather than a verifiable artifact.

**Expected impact:**
- **Reframe value clearly**: 2025–26 citation studies show 8 major tools have **>60% mis-cited queries** and only **~39% of answers are both correct and fully supported** by cited sources. That’s a **~60-point support-gap** mizan is positioned to address. Framing as “verification, not answering” converts “useless” into a measurable market gap.
- **Close perception gaps**: default is already `hosted` (live) but demos need a labeled live path; UI is already static and compliant, though no interactive input (ADR-C3 constraint). 
- **Address real content gaps**: add Bukhari/Muslim via **licence-clean** (public-domain Arabic, English unavailable until open licence) or explicitly maintain the disclosed scope. Add tafsir as a **declared feature boundary** (return `unavailable`, no backend) and avoid scope creep.
- **Harden weakest link**: keep self-authored 40-case benchmark **fully disclosed**; do not claim third-party parity. Publish 91%-vs-39% support gap as the value claim; document the anti-ta

## Decision
# Architecture Plan — Verification Claims, Corpus Scope, and the ADR Namespace

Baseline verified green on `main` @ `7085390`: `bun run ci:gates` → G-1…G-7 PASS, CI GREEN. `bun run check:docs` → OK (6 audited documents, 14 corpus surfaces, 7 evidence artefacts, 218 files swept). Wiki: `arch-verification-claims-and-corpus-scope-2026-10-01`.

I verified every load-bearing premise in the spec and the user stories against the tree. **Eight did not hold**, and two of them invert the deliverable. I lead with those because they change the plan.

## 1. Executive Summary

This is a documentation-and-invariants cycle, not a feature cycle — which is the correct shape, since the product's deliverable per `AGENTS.md` §14 is machine-checked invariants. Four of the nine proposed stories are already shipped (ADR citation resolution, runbook live-first ordering, the paraphrase mechanism, and a licence-established Bukhari/Muslim fetch). One (spec ADR-05) states the **inverse** of the verifier's implemented polarity; writing it as given would introduce the precise doc-vs-behaviour contradiction the story exists to remove. One (Bukhari/Muslim) is diagnosed as a **translation-licence conflict** when the committed attestation proves it is a `gradeApplicable` defect — the Arabic is already fetched, already licence-checked, and discarded at the last step for the sole reason that this dataset declines to grade those two books. And the headline Must (publish91%-vs-39%) is not a doc edit: it requires admitting a third claim class, because `value-proof.md:19`, R10, R14 and `ADR-C2` collectively assume every printed figure comes from a committed artefact. The approach: assign non-colliding ADR identifiers in the established `C` namespace, record four decisions, introduce one new claim class with its own registry and rule, extend R15 with the mirror it lacks, ship the specified-but-unshipped anti-tautology scan, and close the corpus question by publishing which collections the quarantine actually holds. All new invariants are **docs rules, never gates** — the gate count is a published claim compared across 218 files by `checkGateCountClaim`.

## 2. Codebase Impact

| File | Action | Rationale |
|---|---|---|
| `docs/specs/adr/ADR-C6.md` … `ADR-C9.md` | **create** | Non-colliding namespace. R13 requires `## Context` / `## Decision` / `## Consequences` **and** `- **Status:** Accepted` — the spec's `Proposed` status would red `check:docs` |
| `docs/value-proof.md` | modify | Amend the line-19 universal claim; add the external-claim paragraph; name the quarantined collections. Every R10 figure stays |
| `README.md` | modify | One sentence carrying the real polarity; extend lines 212/229 |
| `docs/anchor-protocol.md` | modify | Cite the polarity authority |
| `data/registry/external-claims.json` | **create** | Makes an external figure *checkable* rather than asserted |
| `packages/mizan-gate/src/docs-external.ts` | **create** | R17 |
| `packages/mizan-gate/src/docs-benchmark.ts` |

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.