# Measurement conditions — the nearest-quote search cost

This file is the **one place** a figure from `bun run eval:suggestions` is recorded. Every other
document that states it quotes this one. Two documents holding the same number is a defect waiting to
happen, so the number lives here once and the rest are citations (AGENTS.md section 17).

The rule this file exists to enforce is ADR-C10: a published performance figure is a measured artefact,
not prose. It has already been violated once — a document said `p95 634 ms` while the harness printed
`p95 1121 ms`, and `check:docs` passed — so the figure, the conditions and the tolerance are recorded
together or not at all.

## Figure of record

**p50 594 ms, p95 709 ms, max 715 ms** per rejected claim, for the product path: one exhaustive scan
of the snapshot plus one ranking, on the corpus named below, for the 40 adversarial fabricated quotes
in `data/eval/redteam-fabricated.json`.

It is the **slowest of five consecutive runs** of the harness on the machine below. A published budget
that is flattered is the defect this file removes, so the figure of record is the one no observed run
beat. Measured on 2026-10-04.

## The conditions that figure was measured under

Copied from the `## conditions` section the harness prints in the same run. Re-run
`bun run eval:suggestions` and this block is regenerated; if the corpus is re-ingested the `snapshotHash`
below changes and the figure of record is no longer a measurement of anything.

```
command            bun run eval:suggestions
corpus             snapshotHash=7b3b66fbca7fb9df471b49524f31409391addea87f8d0f262d84f7812a48240d recordCount=27234
cases              40 adversarial fabricated quotes from data/eval/redteam-fabricated.json
clocked work       one scan + one ranking at floor 8 — the product path. The recall table's three floors is this harness's own work and is outside the clock.
quantile rule      p50 and p95 are the values at index floor(cases x fraction) of the ascending times, clamped; max is the slowest case. Nothing is interpolated between cases.
cache state        cold process: no warm-up scan, the snapshot opened read-only, and nothing written to the corpus
runtime            bun 1.3.14
platform           win32 x64
cpu                Intel(R) Xeon(R) CPU           X5675  @ 3.07GHz
tolerance band     a rerun may differ from a published figure by up to 1.5x on p95 and max. A figure published without this block is meaningless (ADR-C10).
```

## Observed variance on that machine

Five consecutive runs, same commit, same corpus:

| run | p50 | p95 | max |
|---|---|---|---|
| 1 | 570 ms | 632 ms | 658 ms |
| 2 | 584 ms | 668 ms | 671 ms |
| 3 | 576 ms | 669 ms | 670 ms |
| 4 | 586 ms | 669 ms | 670 ms |
| 5 | 594 ms | 709 ms | 715 ms |

The widest observed p95 spread is **1.12x** (632 ms to 709 ms). That number is the reason the tolerance
is 1.5x and not 1.05x: a band narrower than a machine's own spread would report this repository's
normal jitter as a regression, and a rule nobody trusts is a rule nobody runs.

## What the tolerance does and does not cover

- **Catches** a number retyped into a document, a number deleted, and a regression of 40% or more.
  The drift that actually happened here was 1.77x — published 634 ms against a measured 1121 ms — and
  1.5x fails it.
- **Does not catch** hardware two or three times slower than the machine above, and cannot. No
  multiplier can: a band wide enough to accept any hardware also accepts a real regression. The
  conditions block is the answer, not a wider number — a reader on other hardware compares against
  their own run of `bun run eval:suggestions`, not against ours.
- **Does not cover** the recall figures. Those are deterministic over the committed corpus and need no
  tolerance: the same commit and the same snapshot produce the same table byte for byte.

## The target, and its status

The architecture's target was **< 50 ms p95** for this path. It is **not reproduced**, by more than an
order of magnitude, and no configuration of the recall-preserving approach reaches it. ADR-08 records
why: the only implementation that met it — a 46 MB FTS5 trigram sidecar — returned nothing at all for
three of ten adversarial quotes, including a fabricated hadith that should have matched the record it
was derived from. A search that misses the record is worse than a slow one, so the target stays unmet
and is stated as unmet wherever it appears.

## What this file does not do

It does not check anything, and saying so is the point. A figure here is not machine-verified against
the harness. `check:docs` audits six documents — `DISCLOSURE.md`, `README.md`, `INTEGRITY.md`,
`.env.example`, `docs/value-proof.md` and `docs/demo-runbook.md` — and this file is not one of them,
so a stale figure here is invisible to the build. That is true of `ADR-08` and of
`docs/degradation-matrix.md` as well, and it is why the figure that was wrong survived
`check:docs` in the first place: the gate that would have caught it does not read these three
documents. ADR-C8 names the same limit from the other direction, holding exactly one document to its
own sourcing promise because exactly one document makes it.

The rules that would close it are not written yet: a latency figure in an audited document would have
to resolve to a figure recorded here, within the 1.5x band above. Until then the enforcement is
`bun run eval:suggestions` plus a reader who compares the two numbers, and this file records that
rather than implying a gate that does not exist.
