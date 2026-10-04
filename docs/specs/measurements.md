# Measurement conditions — the nearest-quote search cost

This file is the **one place** a figure from `bun run eval:suggestions` is recorded. Every other
document that states it quotes this one. Two documents holding the same number is a defect waiting to
happen, so the number lives here once and the rest are citations (AGENTS.md section 17).

The rule this file exists to enforce is ADR-C10: a published performance figure is a measured artefact,
not prose. It has already been violated once — a document understated the harness's own p95 by a factor
of 1.77, and `check:docs` passed, because nothing read any of the files that held it — so the figure, the
conditions and the tolerance are recorded together or not at all.

The historical figures are given as **ratios, never as absolutes**, and that is not a stylistic
preference. This file is audited, so an absolute `p95 <N> ms` written here is a claim the rule judges
against the *current* recorded figure: a past measurement quoted as history would be measured as if it
were today's, and would start failing the moment today's number moved. A ratio cannot go stale without
the figure beside it going stale too.

## Figure of record

**p50 644 ms, p95 753 ms, max 1110 ms** per rejected claim, for the product path: one exhaustive scan
of the snapshot plus one ranking plus the display filter, on the corpus named below, for the 40
adversarial fabricated quotes in `data/eval/redteam-fabricated.json`.

It is the **slowest of five consecutive runs**, componentwise. A published budget that is flattered is
the defect this file removes, so the figure of record is the one no observed run beat — and
`bun run eval:suggestions --record` now chooses it in the tool rather than leaving a person to read
five p95s off a screen and type the largest one (ADR-13). Measured on 2026-10-04.

The three figures come from three different runs, which is the point of taking them componentwise: on
this machine the worst p50, the worst p95 and the worst max were not in one run, so publishing any
single run would describe a run that never happened.

## The conditions that figure was measured under

Copied from the `## conditions` section the harness prints in the same run. Re-run
`bun run eval:suggestions` and this block is regenerated; if the corpus is re-ingested the `snapshotHash`
below changes and the figure of record is no longer a measurement of anything.

```
command            bun run eval:suggestions
corpus             snapshotHash=7b3b66fbca7fb9df471b49524f31409391addea87f8d0f262d84f7812a48240d recordCount=27234
cases              40 adversarial fabricated quotes from data/eval/redteam-fabricated.json
clocked work       one scan + one ranking at ranker floor 8 + the shared-run measurement and display filter on the rows that ranking returned — the product path. The ranker floor sweep and the display floor sweep are this harness's own work and are outside the clock.
quantile rule      p50 and p95 are the values at index floor(cases x fraction) of the ascending times, clamped; max is the slowest case. Nothing is interpolated between cases.
cache state        cold process: no warm-up scan, the snapshot opened read-only, and nothing written to the corpus
runtime            bun 1.3.14
platform           win32 x64
cpu                Intel(R) Xeon(R) CPU           X5675  @ 3.07GHz
tolerance band     a rerun may differ from a published figure by up to 1.5x on p95 and max. A figure published without this block is meaningless (ADR-C10).
```

## Observed variance on that machine

The five runs behind the figure of record, printed by `--record` in the run that recorded it:

| run | p50 | p95 |
|---|---|---|
| 1 | 644 ms | 753 ms |
| 2 | 633 ms | 745 ms |
| 3 | 616 ms | 714 ms |
| 4 | 614 ms | 720 ms |
| 5 | 620 ms | 703 ms |

The p95 spread across those runs is **1.07x** (703 ms to 753 ms). Across a longer sample on this machine,
including runs of earlier commits of this harness, the slowest p95 observed was **1.44x** the fastest
(705 ms to 1011 ms) — and on one occasion a single run reached **2.84x** its own five-run figure, which
is why `max` is treated separately below.

That wider spread is why the tolerance is 1.5x and not 1.05x, and why `max` is the figure that
disagrees most: a single sample has no noise suppression, so one slow case *is* the maximum. A band
narrower than a machine's own spread would report this repository's normal jitter as a regression, and
a rule nobody trusts is a rule nobody runs.

Every number in this section is a `max` the rule checks, which is why the historical observations are
described as ratios against the slowest observed run rather than as absolute figures: a stale absolute
`max` would fail `check:docs`, and a ratio cannot go stale without the slowest run beside it going
stale too.

## What the tolerance does and does not cover

- **Catches** a number retyped into a document, a number deleted, and a regression of 40% or more.
  The drift that actually happened here was 1.77x — a published p95 understating the harness's own by
  that factor — and 1.5x fails it.
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

It does not check itself, and saying so is the point. A figure here is verified against the *harness*,
never against the corpus: `check:docs` compares a stated latency with `data/benchmark/vs-search.json`,
which `--record` wrote, so a figure that agrees with the artefact agrees with a measurement rather than
with reality. That is the strongest claim available without a timing oracle, and it is stated rather
than implied.

What is now checked, and was not when this file was written: this file, `ADR-08` and
`docs/degradation-matrix.md` are all in `AUDITED_DOCUMENTS`, and two rules read them. A latency figure
in any audited document must resolve to the recorded figure within the band above, and must name the
snapshot it was measured on (ADR-13). Both rules were written against the drift this file opened by
recording — the wrong figure surviving a green build because nothing read these three documents.

The tolerance is deliberately one-sided on `max`: a stated `max` below the recorded one fails, and a
stated `max` above it passes. A single sample has no noise suppression, so no symmetric band on `max`
is honest — a band tight enough to catch a regression there would reject most of the runs the figure
was derived from. The reasoning is in ADR-13 so a reader can disagree with the argument rather than
guess at it.
