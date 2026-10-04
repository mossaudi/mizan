# ADR-08 — One exhaustive scan per rejection, with no index and no sidecar

- **Status:** Accepted

## Context

Finding the records nearest a fabricated quote means comparing it against the whole corpus. Three
implementations were measured on the committed 27,234-record snapshot:

| Approach | p50 | p95 | Recall |
| --- | --- | --- | --- |
| Bare ordered scan, no comparison | ~90 ms | ~200 ms | n/a (baseline) |
| Streamed trigram probe, per-row set build | ~1.2 s | ~2.0 s | 10/10 |
| Streamed trigram probe, shared-type counting | ~0.9 s | ~1.44 s | 10/10 |
| SQLite FTS5 trigram **sidecar** (46.4 MB) | ~35 ms | ~116 ms | **7/10** |

The sidecar is the only option that meets a sub-50 ms target, and it is the only one that fails:
phrase matching over folded text returned nothing at all for three of ten adversarial quotes,
including a fabricated hadith that should have matched the record it was derived from. It also
introduces a second store that must agree with the first.

These four rows are the **design spike**, taken on an earlier corpus revision with an earlier harness,
at approximate figures. They are the record of why the sidecar was rejected and they are not the
product's cost; the measured cost of the shipped path, with the conditions it was measured under, is
in `docs/specs/measurements.md`.

The architecture's target was `< 50 ms` p95. It is not met by the exhaustive scan, and no
configuration of the recall-preserving approach reaches it.

## Decision

The feature performs **one full ordered scan of the snapshot per rejected claim**, streaming one row
at a time, ranking in memory with no accumulation of per-row state, and then a second **bounded**
read of at most `MAX_TOP_K` rows for the winners' metadata. No sidecar, no FTS table, no index, no
migration, and no `data/corpus.db` change.

The scan runs **after** verification and outside the verification budget, so a suggestion can never
spend the time a verdict was allowed and a timed-out run has already printed its badge.
`--no-suggestions` skips the pass entirely, which is what makes the cost optional rather than
permanent.

Three measurements were taken of the shipped path, each an order change that was required to keep the
exhaustive approach usable at all. None of them touches recall: the recall table in
`bun run eval:suggestions` is identical before and after (40/40 at top-5).

The p95 column below is **spike-time**, taken on a different corpus revision with a different harness.
It is the record of why each change was made and it is deliberately not comparable to the figure of
record below; where it once ended in a second published latency figure, that figure has been removed
rather than restated, because a number quoted here would be quoted by someone.

| Change | Why it was needed | p95 per rejected claim, spike-time |
| --- | --- | --- |
| Count by searching the record for each of the quote's 3-grams | Sliding a window over every row allocates 7.3 M short strings per scan | 5,338 ms → 979 ms |
| Apply the ranking floor during the scan | A quote shares *some* 3-gram with 26,655 of 27,234 records, so "shares something" carried the corpus | (folded into the above) |
| Narrow to reachable rows before ranking | The floor admits a median 20,796 rows, and ranking them all costs a trigram-type set each | 979 ms → superseded |

**Final measured cost: p50 594 ms, p95 709 ms, max 715 ms** per rejected claim, against a `< 50 ms`
target. That is the slowest of five consecutive runs, and the figure of record lives in exactly one
place — `docs/specs/measurements.md` — which also carries the corpus identity it was measured on, the
case count, the quantile rule, the cache state, the runtime, the platform, the CPU and the tolerance
band. The short form: corpus `snapshotHash=7b3b66fb…`, 27,234 records, 40 adversarial fabricated
quotes, `bun run eval:suggestions`, cold process, single run of Bun 1.3.14 on one named CPU, a rerun
may differ by up to **1.5x** on p95 and max. A figure quoted without that block is not a measurement
(ADR-C10).

The target is still missed by more than an order of magnitude, and no configuration of the
recall-preserving approach reaches it. The number is recorded rather than engineered around: an honest
search that takes most of a second is worth more than a fast one that cannot find the record.

## Rationale

The product's claim is that the badge was computed and the citations checked. A search that misses
the record a quotation was derived from would show a judge nothing while appearing to have looked —
the exact "looks verified but is not" failure AGENTS.md section 16 forbids. Recall is the property
that matters; latency is a property we would rather state than fake.

Keeping one store also keeps one truth. A 46 MB index that disagrees with the snapshot is a
snapshot with two answers, and the gates have no vocabulary for adjudicating between them.

The latency work above is bounded by that same reasoning. Each change had to be *provably*
answer-preserving or it was not a change at all: the floor the scan applies is the floor the ranking
re-checks, the two counting orders return the same integer (pinned by `trigrams.test.ts`), and the
narrowing drops only rows that are strictly worse on the two keys that cost nothing to compare. A
faster implementation that found a different fifth line would be a different feature.

## Consequences

- Measured cost is about 0.6 s p95 per rejected claim on the committed corpus; the CLI says so in
  `--help` and the degradation matrix records it. Two or three rejected claims in one answer therefore
  add one to two seconds, which is why `--no-suggestions` exists and why the pass runs after the badge.
- Performance work on this feature must preserve recall **and must be re-measured with
  `bun run eval:suggestions`**, which prints the recall table and the product-path latency together so
  a regression in either is visible in the same run. An index may be revisited with that fixture, never
  without one.
- The corpus scan query is `SELECT id, textMatch FROM records ORDER BY id` with `.iterate()`.
  `.all()` on that query would load the whole corpus into memory; gate G-7 does not check it, and
  the bounded follow-up read in `@mizan/corpus` is what keeps the second query small.
- A claim's own cited record is a candidate like any other: the reader is shown what is nearest, not
  only what is not already on screen.
- The floor of eight shared 3-gram types is nearly inert in Arabic — it admits a median of 20,796 of
  27,234 rows — and the recall table is identical at floors 4, 8 and 12. ADR-09 records what the floor
  is and is not doing; a stricter floor is the obvious next lever and needs the same fixture to justify.