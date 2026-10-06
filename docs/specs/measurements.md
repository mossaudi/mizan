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

**p50 686 ms, p95 1156 ms, max 1555 ms** per rejected claim, for the product path: one exhaustive scan
of the snapshot plus one ranking plus the display filter, on the corpus named below, for the 40
adversarial fabricated quotes in `data/eval/redteam-fabricated.json`.

It is the **slowest of five consecutive runs**, componentwise. A published budget that is flattered is
the defect this file removes, so the figure of record is the one no observed run beat — and
`bun run eval:suggestions --record` now chooses it in the tool rather than leaving a person to read
five p95s off a screen and type the largest one (ADR-13). Measured on 2026-10-05.

The three figures come from three different runs, which is the point of taking them componentwise: on
this machine the worst p50, the worst p95 and the worst max were not in one run, so publishing any
single run would describe a run that never happened.

**Recall over the same run: 40 of 40 at top-5 presence, and 40 of 40 gated at the display floor** — measured over every served collection, `abudawud` 15 cases, `ibnmajah` 13, `malik` 5, `nasai` 3, `quran` 2, `tirmidhi` 2, and nothing outside those six. The denominator `40` is that total and not any one book's, so every collection is named on this line: "40 of 40" beside an unstated set is a figure a reader will take for the 27,234-record corpus, and `checkPresenceCollectionNamed` fails any audited document that states that fraction without naming all six. It is recorded here beside the latency rather than in a document of its own because ADR-17 makes it a precondition rather than a figure: a latency number published next to a search that quietly stopped finding the record is the failure the whole verifier exists to prevent. `--record` refuses the write if either recall figure drops below these, and refuses first if the case set is not the one this baseline was measured over — the denominator is recorded as `suggestionEvalSetDigest` in `data/benchmark/vs-search.json`.

## What the 40 cases are, per collection

The recall above is an aggregate over six books, and an aggregate hides which books carried it. This
table is the same run decomposed, from the `## presence per collection` block the harness prints:

| collection | cases | top-1 | top-3 | top-5 | rejected | verified | served records |
|---|---|---|---|---|---|---|---|
| abudawud | 15 | 14/15 | 15/15 | 15/15 | 15 | 0 | 5272 |
| ibnmajah | 13 | 10/13 | 11/13 | 13/13 | 13 | 0 | 4336 |
| malik | 5 | 5/5 | 5/5 | 5/5 | 5 | 0 | 1829 |
| nasai | 3 | 3/3 | 3/3 | 3/3 | 3 | 0 | 5672 |
| quran | 2 | 2/2 | 2/2 | 2/2 | 2 | 0 | 6236 |
| tirmidhi | 2 | 2/2 | 2/2 | 2/2 | 2 | 0 | 3889 |

**Dataset digest: `ds1:c9b35dd9ae7200e1b0152cfcb8afb80205e4500f5b40008c2e77d03ce5cc88e5`** —
the `data/eval/redteam-fabricated.json` every row above decomposes. It is the `ds1` digest of that
document with its own `datasetDigest` key removed, so any reader can recompute it, and it is the same
value `--record` compares against before it will write a new baseline. Without it the table above is
fifteen numbers per row and no statement of *which* fifteen: a 40-case set spread over six collections
in a different proportion produces a different table, and nothing on the page would tell the two apart.
`bun run check:docs` requires this line and requires it to match `data/benchmark/vs-search.json`'s
`suggestionEvalSetDigest`, because a digest pointing at another set reads as provenance while pointing
somewhere else.

The `rejected` and `verified` columns answer a different question from `top-N`. `top-N` is a
**ranking** figure — where the adjudicated record landed. `rejected` is a **containment** figure — how
many of that collection's fabrications the quoted span failed to match at the cited identifier, which is
the thing a customer is actually buying. `rejected` equals `cases` in every row above because every case
in `data/eval/redteam-fabricated.json` is a fabrication and every one of them is adjudicated to
`rejected`; `bun run check:docs` fails if a case in that set ever stops saying so, so the column is a
derived measurement rather than a retyped constant. `verified` is `0` in every row, and its being `0`
per collection is what `falseVerifiedCount: 0` says in aggregate.

Read down the top-1 column and the aggregate stops being one number: **36 of 40 at top-1**, because
`abudawud` and `ibnmajah` account for every miss. A reader who is told "40 of 40" and nothing else
would have concluded the retriever places the cited record first every time, over every book, and it
does not — 90% of cases, not 100%, and the shortfall is concentrated in two books rather than spread
across six.

Two honest caveats, both visible in the table rather than in a footnote. `quran` and `tirmidhi` carry
**two cases each**: measured, above the floor of two, and nowhere near a sample. And the `served
records` column is corpus size, not evidence — 6236 quranic records were served and two of them were
asked about, which is the honest statement of coverage for a table that says `2/2`.

The distinction the whole table exists to keep: **measured** means at least one case ran, while the ADR-15
gate requires **two** per served collection. Both numbers are 2 for `quran` and `tirmidhi`, so this
recording sits exactly on the floor and no lower. The per-collection counts and presence figures are
recorded flat in `data/benchmark/vs-search.json` under `suggestionCoverageCases<Collection>` and
`suggestionCoveragePresenceTop<N><Collection>`, which is where a rerun compares them.

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
| 1 | 686 ms | 1156 ms |
| 2 | 637 ms | 740 ms |
| 3 | 645 ms | 757 ms |
| 4 | 631 ms | 744 ms |
| 5 | 625 ms | 731 ms |

The p95 spread across those runs is **1.58x** (731 ms to 1156 ms) — run 1 was slow on every component,
which is what makes it the figure of record rather than an outlier to discard. Across a longer sample on
this machine, including runs of earlier commits of this harness, the slowest p95 observed was **1.44x**
the fastest (705 ms to 1011 ms) — and on one occasion a single run reached **2.84x** its own five-run
figure, which is why `max` is treated separately below.

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
