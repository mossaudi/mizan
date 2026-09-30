# ADR: for-this-project-need-to-review-and-analysis-and-validate-its-re v4

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
# Architecture & Implementation Plan — Project Value Validation & Competitive Hardening

**Spec:** `spec-project-value-validation-2026-09-29` · **Sprints:** 1 + 2 · **Repo:** `mizan` (Bun monorepo, CLI-only)

---

## 1. Executive Summary

The sprint converts the benchmark's headline from a tautology into a measurement, un-reds CI, and ships the gates. Three structural findings — established by reading the code, not by assumption — drive every decision:

**F-A. The tautology is a *type* defect, not a coding mistake.** `ScoredCase` (which carries `expectedVerdict`) and the produced verdict are computed in the same object literal at `scripts/benchmark/score.ts:99`. No caller *can* score a run without holding the labels. Grepping for the bad expression would therefore be an insufficient control — the fix must make the tautology **unrepresentable**, by splitting the executor from the comparator into two modules with disjoint input types, and then gating that separation structurally.

**F-B. `apps/cli` suite time is six redundant `buildSnapshot` calls in hooks.** I measured per-file: demo 7.9s, demo-command 7.4s, benchmark-refusal 5.7s, happy-path 4.2s — no file dominates; the *sum* is 26.6s. Under CI load each crosses Bun's 13.2s default per-hook timeout. A retry is forbidden (§14); the fix is a shared content-keyed snapshot fixture plus a declared, enforced budget.

**F-C. G-7.2/G-7.4 already scan `apps/cli/src/render.ts`.** It is in `DISPLAY_PATH` (`g7-verdict-path-purity.ts:67`). Story 9's correction surface **cannot** be implemented in `render.ts` without tripping a live gate. Correction must live in a sibling module, and `DISPLAY_PATH` must be *extended* so the gate keeps its teeth. This is a plan-level constraint the PM stories did not state.

**Key risks:** R-15 capacity (13.5 person-months against ~3 available) is the live one; R-9 (a hard baseline beats mizan) is committed in advance as a publish-anyway outcome. **Confidence 0.62** — the design is well-grounded and the central change is unusually safe, but capacity is short ~4× and three decisions remain open.

---

## 2. Codebase Impact

### Sprint 1

| File | Action | Why |
|---|---|---|
| `packages/mizan-core/src/schema/benchmark.ts` | **modify** | v2 contract: `arms[]`, `perClass[]`, `RateEstimate`, `provenance`. Frozen here so 4 stories have one writer (§17, R-16) |
| `packages/mizan-core/src/schema/eval.ts` | **modify** | add `failureClass`. It is the *fabrication* taxonomy; `expectedReason` stays the verifier's reason vocabulary. Conflating them is the R-4 defect |
| `scripts/benchmark/system-arm.ts` | **create** | executes `verifyAnswer`; structurally cannot see `expectedVerdict` |
| `scripts/benchmark/compare.ts` | **create** | pure join of produced verdicts against expectations |
| `scripts/benchmark/intervals.ts` | **create** | Wilson score interval; refuses a zero denominator |
| `scripts/benchmark/score.ts` | **modify** | delete label-derived `detected`; `assertBaselineIsHonest` 

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.