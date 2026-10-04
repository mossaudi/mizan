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

### Nearest-quote suggestions cannot fail into a badge

The suggestion pass is display-only and runs **after** every verdict is printed (ADR-07). It has three
states, and each has one correct surface:

| Suggestion state | Trigger | Correct surface | Forbidden surfaces |
|---|---|---|---|
| `candidates` | One or more records cleared the floor | up to three lines, under `nearest suggestions (non-authoritative) — not a verification result` | any wording that reads as a correction, a grade, or a second opinion |
| `no_candidates` | The scan read every record and none cleared the floor | "no record in this snapshot is close to this quotation (27,234 records searched)" | a guess, a cached list, an empty section with no explanation |
| `unavailable` | A row could not be decoded, so `considered` would be a lie | `unavailable`, naming the row id and never its text | a partial list presented as the whole search |

A suggestion failure is **never** a verdict failure: an undecodable row makes the *suggestions*
unavailable, while the verdict that was already printed stands unchanged. The converse is also enforced —
no suggestion can change, upgrade or block a verdict, and the flag `--no-suggestions` skips the pass
entirely rather than silently degrading it.

The cost is stated rather than hidden: one exhaustive scan of the snapshot per rejected claim, measured
at **p50 594 ms / p95 709 ms / max 715 ms** on the committed 27,234-record corpus against a `< 50 ms`
target that this architecture does not meet (ADR-08). That is the slowest of five consecutive runs;
`docs/specs/measurements.md` is the one place the figure and the conditions it was measured under are
recorded — corpus identity, case count, quantile rule, cache state, runtime, platform, CPU, and the
1.5x band a rerun may differ by — and `bun run eval:suggestions` prints both in the same run.

## Testing

Each failure mode has a test that triggers it and asserts the correct surface. The
tests are in `packages/mizan-core/test/degradation.test.ts`. The suggestion states above are tested in
`apps/cli/test/suggestions.test.ts` against a real snapshot, a real verifier and the real renderer.
