# Honest Degradation Matrix

## Purpose

This matrix documents exactly how mizan degrades for each of the 7 failure modes.
Each failure mode has exactly one correct surface and a list of forbidden surfaces.
The system never fabricates a result when a component fails.

## The 7 Failure Modes

| # | Failure Mode | Trigger | Correct Surface | Forbidden Surfaces | Exit Code |
|---|---|---|---|---|---|
| 1 | Provider down | LLM provider unreachable | `model unavailable` | canned answer, silent mock, partial answer shown as complete | 1 |
| 2 | Corpus miss | No matching sources in corpus | `no sources found` | a guess, a cached answer | 1 |
| 3 | Verification timeout | Verification exceeds 10s budget | `unverifiable` | `verified`, a cached prior verdict, a crash | 1 |
| 4 | Ledger write failure | Disk full, permissions | run marked untrusted | fail-open, "as if recorded" | 3 |
| 5 | Attestation mismatch | Corpus hash does not match committed attestation | loud integrity error, no verdict | warn-and-proceed | 3 |
| 6 | Tafsir backend unreachable | Tafsir backend not responding | `unavailable` | fabricated tafsir | 1 |
| 7 | Second ranker down | Semantic ranking service unavailable | `semanticRanking: "unavailable"` in metadata | silent downgrade to less accurate method | 1 |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Run completed and every claim reached the verdict it was declared to reach |
| 1 | Pipeline ran honestly but could not deliver a full answer (degraded) |
| 2 | Command line or committed input file was not usable (usage error) |
| 3 | Run happened but cannot be trusted (attestation failed, ledger write failed) |

## Design Principles

### Fail closed

Where a check can fail, the default action is refusal. Zero evidence blocks approval.
An attestation mismatch aborts the run. A ledger write error marks the run untrusted.
A verification timeout yields `unverifiable`.

### Honest degradation

Each failure has exactly one correct surface. The system never returns a precomputed
or canned response, never silently substitutes a mock response, and never shows a
partial answer as complete.

### No bypass

A failure mode in any component never bypasses the verification step. A `verified`
verdict is never produced without actual verification.

## Testing

Each failure mode has a test that triggers it and asserts the correct surface. The
tests are in `packages/mizan-core/test/degradation.test.ts`.
