# ADR: for-this-project-need-to-review-and-analysis-and-validate-its-re v3

**Status:** proposed
**Date:** 2026-09-28

## Context
# Project Value Validation & Competitive Hardening

## 1. Executive Summary

The feedback — *"any search tool could do this"* — is **wrong about the verifier and right about everything a judge sees**. mizan's verification layer is genuinely differentiated: `VERIFIED` is constructed at exactly one site, reachable only by strict folded substring containment, enforced by gates G-1/G-6/G-7. No search box produces a per-claim verdict against a *specific cited record*, cannot abstain honestly, and cannot be byte-deterministic. But the project cannot **prove** that value, and its benchmark contains a defect a field-literate judge will find in five minutes. `scripts/benchmark/score.ts` computes the headline `systemDetectionRate: 1` as `expectedVerdict !== "verified"` over a set where all 40 cases are labelled `rejected` — the figure is **tautologically 1.0 for any input whatsoever**, including a verifier that does not exist. Only the 65% baseline arm is measured. Meanwhile `bun run ci` is red on a flaky 26.6s `apps/cli` suite, ~60 modified files are uncommitted, and the eval set is a single failure class. This cycle converts the real differentiator from an *assertion* into a *measurement* and closes the presentation gap.

## 2. Findings verified by execution (not by reading)

| # | Finding | Evidence |
|---|---|---|
| F-1 | **Headline benchmark is a tautology** — `detected = expectedVerdict !== "verified"`; 40/40 `rejected` → 1.0 by construction, independent of the verifier | `score.ts:27-29,99`; `redteam-fabricated.json` group-by; `vs-search.json:9` |
| F-2 | **CI red** — `apps/cli` passes 217/217 standalone but takes **26.6s**; hook times out at 13.2s under load | `bun test` in `apps/cli` → `217 pass 0 fail, 26.64s` |
| F-3 | **One failure class** — all 40 cases are `quote_absent_at_cited_id`; wrong-number, wrong-collection, truncated all score identically | group-by over the eval set |
| F-4 | **~60 modified files uncommitted** plus a large untracked set — the gates are 

## Decision
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.