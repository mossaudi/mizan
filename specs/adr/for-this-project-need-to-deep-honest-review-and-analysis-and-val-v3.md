# ADR: for-this-project-need-to-deep-honest-review-and-analysis-and-val v3

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
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.