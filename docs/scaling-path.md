# mizan Horizontal Scaling Path

## Current Architecture

mizan currently runs as a single-node application with:

- **Local SQLite database** (`data/corpus.db`) — zero-ops, no external database server
- **Local file-based ledger** (`data/runs.jsonl`) — append-only, hash-chained
- **Single-process CLI** — no horizontal scaling
- **Deterministic verification** — no node-specific state affects verdicts

### Bottlenecks

1. **SQLite write contention** — SQLite allows only one writer at a time. Under high write load (many concurrent runs), writes serialize.
2. **Single-process verification** — verification is CPU-bound and runs in a single process.
3. **File-based ledger** — `runs.jsonl` is a single file. Under high append load, file I/O becomes a bottleneck.
4. **No caching layer** — every query hits SQLite directly.

## Scaling Strategy

### Phase 1: Read Replicas (Low Effort, High Impact)

**Goal:** Scale read traffic without changing the verification path.

**Approach:**
- Deploy multiple mizan instances, each with a read-only copy of `corpus.db`
- Use a load balancer to distribute queries across instances
- Each instance runs the same deterministic verification

**Determinism preservation:**
- Verification is a pure function of the corpus snapshot. All replicas use the same `corpus.db` (same `snapshotHash`), so verdicts are identical.
- The 100x byte-identical determinism gate still passes because each instance runs the same code against the same corpus.

**Limitations:**
- Writes (ledger appends) still go to a single node.
- Not suitable for high-write workloads.

### Phase 2: Write Sharding (Medium Effort)

**Goal:** Scale write traffic by sharding the ledger.

**Approach:**
- Shard `runs.jsonl` by question hash: `runs-{shard}.jsonl` where `shard = hash(question) % N`
- Each shard is an independent hash chain with its own genesis entry
- A query that needs to verify a specific run looks up the correct shard by question hash

**Determinism preservation:**
- Each shard is independently hash-chained. The chain verify script can verify each shard separately.
- Verification verdicts are unaffected — they depend on the corpus, not the ledger.

**Limitations:**
- Cross-shard queries (e.g., "show all runs") require merging results.
- Increased operational complexity.

### Phase 3: Distributed Corpus (High Effort)

**Goal:** Scale the corpus itself beyond a single SQLite file.

**Approach:**
- Use a distributed database (e.g., PostgreSQL with read replicas, or a distributed SQLite like DQLite)
- Partition the corpus by collection (e.g., one partition per hadith collection)
- Use a distributed cache (e.g., Redis) for frequently accessed records

**Determinism preservation:**
- The verification algorithm is unchanged. It still performs strict normalized containment against the corpus record.
- The `snapshotHash` is computed from the corpus content, not the storage backend. As long as the content is the same, the hash is the same.
- The 100x byte-identical determinism gate still passes because the verification code is unchanged.

**Limitations:**
- Significant operational complexity.
- May introduce network latency for corpus access.
- The determinism guarantee depends on all nodes having the same corpus content.

## Determinism Under Scaling

The key insight is that **mizan's determinism is a property of the verification algorithm, not the deployment topology**.

- Verification is a pure function: `verifyAnswer(claims, evidence, snapshotHash) → VerdictReport`
- No node-specific state (no clock, no randomness, no locale) affects the verdict
- The 100x byte-identical gate runs the same code 100 times and requires identical output
- This property is preserved regardless of how many nodes run the verification

### What must be preserved

1. **Same corpus content** — all nodes must have the same `corpus.db` (same `snapshotHash`)
2. **Same verification code** — all nodes run the same version of `@mizan/verify`
3. **Same fold table** — the Arabic normalization fold table is a constant in `@mizan/core`

### What can vary

1. **Node count** — more nodes for higher throughput
2. **Ledger shard count** — more shards for higher write throughput
3. **Cache configuration** — caching is transparent to verification

## Benchmarking

### Measured: single node, this repository

Reproduce with `bun run verify:chain --benchmark`. The numbers below are one observation on this
machine's hardware; the command re-measures rather than echoing this table. Wall-clock timing varies
by a few percent between runs — a repeat run of the same two rows here printed 435 ms and 1,876 ms —
so the row to check is the **budget**, and the shape to check is the ratio between the two sizes.

| Measurement | Command | Result | Budget |
|---|---|---|---|
| Chain verify, 10,000 synthetic entries | `bun run verify:chain --benchmark` | **444 ms** | 60,000 ms |
| Chain verify, 50,000 synthetic entries | `bun run verify:chain --benchmark 50000` | **1,845 ms** | 60,000 ms |
| Chain verify, committed `data/runs.jsonl` (282 entries) | `bun run verify:chain` | VALID | — |

Linear in entry count, as a streaming O(1)-memory pass should be: 10k → 50k entries cost 4.15x the
time. That is the shape that makes the budget safe, and it is a shape a reader can check by running
the command twice.

### Targets, NOT measurements

**Nothing below has been measured. These are the goals the phases are proposed against, and a goal
printed in a table of numbers reads exactly like a measurement unless it is labelled.** A target
stays a target until a command prints a number for it, which is the same rule the benchmark report
follows when it prints `n/a` for a rate it did not compute.

| Metric | Single Node | Phase 1 (Read Replicas) | Phase 2 (Write Sharding) |
|---|---|---|---|
| Read throughput | measured only for chain verify | untested | untested |
| Write throughput | untested | unchanged by design | untested |
| Verification latency | claimed <50 ms p50 in the spec, not reproduced here | must not regress | must not regress |
| Determinism | asserted by the 100x gate | must still hold | must still hold |

**What is missing before any of this could be measured:** a load generator that drives concurrent
verification against a real corpus snapshot, and a multi-node harness. Neither exists, and inventing
figures for a scaling document is the one thing this document must not do — a scaling path justified
by unmeasured numbers is the same defect as a verdict justified by a prompt, one layer out.

### How each phase would be measured when it is built

1. **Read throughput** — N clients issuing identical `verify` calls against the MCP server; report
   requests/second at p50 and p99, per node and aggregate.
2. **Write throughput** — appends/second to the ledger, measured by `verify:chain` over the result.
3. **Determinism** — the existing 100x gate, re-run against the scaled deployment. This one is
   already automated, so Phase 1 is measurable today and should be the first thing measured.

## Recommendation

**For the current customer deal:** Single-node is sufficient. The customer accepts single-node deployment (per the spec: "local SQLite is zero-ops; customer accepts single-node").

**For future growth:** Phase 1 (read replicas) is the recommended first step. It requires minimal code changes, preserves determinism, and provides immediate read scalability.

**Phase 2 and 3** should be pursued only when write throughput becomes a bottleneck, and only with careful attention to preserving the determinism guarantee.
