# Spec: lets-efficient-continue

**Request:** lets efficient continue

## Stories
# v5 Precision Cycle — User Stories

**Cycle thesis: no new capability.** Eight stories, two sprints, every item traced to a measured defect.

---

## 1. Story Overview

| # | Story | Epic | Pri | Size | Reach | Impact | Conf | Effort (p-mo) | **RICE** | Sprint |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `apps/cli` typecheck green, both red packages green | A | Must | S | 10 | 3 | 100% | 0.25 | **120** | 1 |
| 2 | Commit in-flight sprint as one unit; fix stale gate title | A | Must | S | 8 | 2 | 100% | 0.25 | **64** | 1 |
| 3 | Reconcile published latency with a reproducible measurement | C | Must | S | 8 | 3 | 80% | 0.5 | **38.4** | 1 |
| 5 | Publish per-rank precision beside presence | B | Must | M | 9 | 3 | 100% | 1.0 | **27** | 1 |
| 7 | Section copy: returned-of-scanned, scope in words | D | Should | S | 7 | 2 | 100% | 0.5 | **28** | 2 |
| 4 | Extend the docs claim sweep to performance figures | C | Must | M | 8 | 3 | 80% | 1.0 | **19.2** | 1 |
| 6 | Declared closeness gate, variable cardinality, recall disclosed | B | Must | M | 10 | 3 | 80% | 2.0 | **12** | 1 |
| 8 | Qur'an coverage: disclose now, scope the measurement | D | Should | M | 6 | 2 | 80% | 1.0 | **9.6** | 2 |

RICE is ordering assistance only. **Sequence is set by dependency, not by score** — Story 6 (RICE 12) cannot start before Story 5 (RICE 27).

### Scope boundary (what is deliberately absent)

| Deferred | Recorded as |
|---|---|
| Effect 4.0 stable migration | ADR-14 — its own cycle, its own decode measurement |
| Index / sidecar revisit | ADR-08 permits it only with the fixture; fixture exists; waits on a customer-declared SLO |
| `data/transcript.json` refresh | Could — **but see Story 7 edge case E7.3**: copy changes make it stale |
| MCP / web parity | Ruled CLI-only in v5 Story 10 with a revisit condition |
| Any whole-field correction-accuracy claim | Research: field baseline ~66–68% against ~67.5% do-nothing — we publish presence and precision, never accuracy |

---

## 2. Dependency Graph

```
                    ┌─────────────────────────────────────────────┐
                    │ S1  apps/cli typecheck green  (P0, blocks all)│
                    └───┬──────────────┬──────────────┬────────────┘
                        │              │              │
 ┌─────────▼────┐  ┌──────▼───────┐  ┌───▼──────────────┐
              │ S2 commit │  │ S3 latency   │  │ S5 per-rank      │
              │    as one    │  │    reconcile │  │    precision     │
              │    unit      │  └──────┬───────┘  └───┬──────────────┘
              └──────────────┘         │              │
                                        │              │
                                 ┌──────▼───────┐  ┌───▼──────────────┐
                                 │ S4 claim     │  │ S6 closeness │
                                 │    sweep →   │  │    gate + recall │
                                 │    perf      │  │    disclosed     │
                                 └──────────────┘  └──────────────────┘

 S7 copy (Sprint 2) ──depends on── S6   │   S8 Qur'an coverage (Sprint 2) ──depends on── S5
 (changed strings are what S6 shows)   │   (per-rank precision is the template for it)
```

**Blocking:** S1 blocks S2, S3, S5 (and transitively S4, S6, S7, S8).
**Parallelisable after S1:** the `S3→S4` claim-integrity chain and the `S5→S6` precision chain share no files and may run concurrently.
**Shared dependency:** S3, S4 and S5 all consume the same measurement/evidence pipeline. **One owner per fact (AGENTS.md §17):** the recorded measurement artefact is written once by the harness and read by the sweep; the sweep never re-derives a number.

---

## Sprint 1: Green gate, precision, claim integrity

*Blocking stories first. Six stories, ordered S1 → S2 → S3 → S5 → S4 → S6.*

---

### Story 1: `apps/cli` typecheck is green and both red packages pass

**As a** judge evaluating this repository,
**I want** `bun run ci` to exit 0 with every package passing,
**so that** a red gate is never something I have to discover for myself — the gate is the deliverable (AGENTS.md §14).

**INVEST:** I — three errors in one untracked test file, no other change needed. N — the three errors are enumerated, and two ways of silencing them are explicitly banned below. V — every claim in the repo depends on it; a red CI is a claim that the checks were not run. E — S, one file. S — one file, one sprint. T — typecheck exit code plus the two named packages.

#### Acceptance criteria

```
Scenario: apps/cli typechecks
  Given the working tree as committed at cycle start
  When tsc --noEmit runs in apps/cli
  Then it exits 0
  And the ClaimVerdict literal in the test carries every field its schema requires
  And no index access on a possibly-empty array is read without being narrowed first

Scenario: the compiler flag that found the defect is still on
  Given a fix that makes the possibly-undefined diagnostic disappear
  When the tsconfig of apps/cli is read
  Then noUncheckedIndexedAccess is still enabled
  And strict is still enabled
  And no skipLibCheck, no // @ts-expect-error on these lines, and no widened "any" was added
  Because the flag is the control; a green build from a disabled control is a silent downgrade

Scenario: the cascade failure clears with it
  Given the real repository and the real runner
  When packages/mizan-gate's real-repository test runs
  Then it exits 0 and no longer fails as a consequence of apps/cli
  And the test name no longer claims a package count that discovery does not produce (deferred to Story 2 for the rename; this scenario only requires it to pass)

Scenario: the whole gate is green and fast
  Given every package in the workspace
  When bun run ci runs
  Then it exits 0 and names no failing package
  And it completes in under 5 minutes

Scenario: [negative] a suppressed diagnostic is rejected
  Given a future change that silences these three errors by disabling a compiler flag,
 adding a ts-ignore, or casting to any
  When the change is reviewed or gated
  Then it is rejected, because a green build from a weakened control is not a green build
```

#### Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E1.1 | The test already contains `verdicts as any` at line 373 to build a positional mismatch | Narrow it with the schema or an explicit guard. `any` is forbidden (AGENTS.md §2); that cast is a hole in the positional-contract typecheck and it is in the file this story owns |
| E1.2 | The `evidence` field the literal is missing is nullable and semantically "no record resolved" | It is filled, not omitted, and not cast away. A missing `evidence` must not become `undefined`-vs-`null` ambiguity in the verdict contract |
| E1.3 | `blocks[0]` on a `SuggestionBlock \| null` array | Narrow to the element type; an empty or null entry must not reach a property access |
| E1.4 | The failing test file is **untracked** — a fix that is never committed leaves CI red | Story 2's commit is what makes Story 1 durable; the typecheck fix and the file landing are one outcome |
| E1.5 | 12 package plans, not 6 | Discovery is driven by the workspace, so no count is hardcoded in a way that can drift |

#### Security scenarios```
Scenario: no structural guarantee is traded for a green build
  Given the temptation to silence a type error rather than resolve it
  When the fix is applied
  Then no compiler strictness flag is relaxed
  And no verification or gate rule is exempted to make a test pass
  And the typecheck, not an allowlist, is what reports the defect

Scenario: the red-team set is not weakened  Given a test that fails on the real adversarial corpus
  When it is made to pass
  Then the fix is in the production or assertion code under test
  And no case is deleted from data/eval/redteam-fabricated.json to reach green
```

#### Performance
- `bun run ci` < 5 minutes end to end (AGENTS.md §14), unchanged by this story.
- Per-package `tsc --noEmit` adds no measurable step; the fix must not add a build artefact or a second compiler invocation.

#### Reliability
- **Error handling:** CI exits non-zero and **names the failing package**. A failure that cannot be attributed to a package is itself a CI failure.
- **Retry:** none. A typecheck is deterministic.
- **Timeout:** the CI step budget is the 5-minute ceiling; exceeding it fails the job rather than truncating it.
- **Graceful degradation:** none permitted — a skipped package is not a passing package (this is the exact "green that is not green" failure the existing suite comment warns about).

---

### Story 2: The in-flight sprint lands as one reviewed unit, and the stale gate title is corrected

**As a** reviewer,
**I want** the whole suggestion feature committed together with its ADRs, harness and gates,
**so that** I review one coherent change instead of reconstructing it from a dirty tree, and no file is left orphaned.

**INVEST:** I — independent of Stories 3–6 as long as S1 is green. N — one commit or a small recorded series is negotiable; leaving20 modified + 17 untracked paths un-landed is not. V — R5: a half-landed feature is how the next agent reads a different product than the one described. E — S. S — mechanical. T — clean tree, correct title.

#### Acceptance criteria

```
Scenario: nothing is left untracked that is source
  Given the cycle's work in the working tree
  When git status is inspected after the commit
  Then no source file, test, ADR, package or harness script remains untracked
  And @mizan/suggest (a whole new package) is tracked with its package.json, tsconfig and tests
  And ADR-07 through ADR-10 are tracked

Scenario: the gate test title matches what discovery finds
  Given the workspace contains 12 package plans
  When the real-repository test's name is read
  Then it states the discovered count, not a hardcoded "six"
  And the test body still discovers packages from the workspace rather than from a list,
     so the name cannot drift from the behaviour again

Scenario: the landed tree is the tree the gates judged
  Given the commit
  When bun run ci runs on the committed tree  Then it exits 0
  And no file needed by the build is gitignored
```

#### Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E2.1 | `bun.lock` is modified alongside the new workspace package | Committed with it; a lockfile out of step with the workspace is an install-time defect |
| E2.2 | `data/runs.jsonl` is modified | Committed only as a deliberate artefact; a ledger append is a record, not an incidental edit (A08: ledger payload unchanged by the suggestion feature) |
| E2.3 | 6 untracked `specs/` markdown files (v3/v4/v5 × spec+adr) | Either committed as the record they are, or explicitly excluded by a recorded decision. Silently leaving them untracked recreates R5 |
| E2.4 | The rename tempts a hardcoded 12 in the next place | The test must derive the number from discovery; the title is prose over a computed value |
| E2.5 | A partially-merged state is observed mid-cycle | Stop and land one unit; do not commit a tree where a new package exists without its gate entries |

#### Security scenarios
```
Scenario: no secret enters the commit
  Given the tree is about to be committed
  When it is staged
  Then no credential, token, key or .env file is included
  And the existing secret gate (G-4) remains green over the committed tree

Scenario: the suggestion feature did not change the ledger contract
  Given the commit contains the suggestion pass
  When run traces and ledger entries produced with and without suggestions are compared
  Then they are byte-identical
  And no candidate text appears in any of them (AGENTS.md §13, A02)
```

#### Performance
- No runtime change. CI stays under 5 minutes.
- Commit size is bounded by "one sprint of work"; a reviewer must be able to read the diff.

#### Reliability
- **Error handling:** a pre-commit or gate failure blocks the commit; no `--no-verify`, no force push.
- **Retry:** none.
- **Graceful degradation:** none — a dirty tree is not a state the repository may be published in.

---

### Story 3: Every published latency figure is a reproducible measurement

**As a** judge,
**I want** the latency number in ADR-08 and the degradation matrix to be one I can reproduce,
**so that** the repository's claim about performance is a computed fact rather than prose that has already drifted once.

**INVEST:** I — independent of S5/S6 as long as S1 is green. N — the tolerance band and the recording mechanism are negotiable; "a figure that names no conditions" is not. V — R3: this has already happened (published `p95 634 ms`, harness `p95 1121 ms`) and `check:docs` did not catch it. E — S. S — one measurement protocol plus two documents. T — the figure, the conditions, the tolerance, and a rerun.

#### Acceptance criteria

```
Scenario: the two documents carry one figure, and it is the measured one
  Given ADR-08 and docs/degradation-matrix.md
  When each is read
  Then both state the same p50, p95 and max for the product path per rejected claim
  And the figure agrees with a fresh `bun run eval:suggestions` run on the committed corpus
  And the previously published p50 570 ms / p95 634 ms / max 662 ms appears nowhere

Scenario: every stated figure names its conditions inline
  Given a latency number in an audited document
  When a judge reads that sentence
  Then it names the corpus identity it was measured on (snapshot hash and record count),
    the harness command, the number of cases, the operating conditions, and the tolerance
  And it distinguishes the product path (one scan + one ranking) from the harness's own
    measurement work, which is not part of the product's cost

Scenario: variance across machines is bounded and recorded
  Given the measurement was taken on one machine
  When the figure is published
  Then a tolerance band is published with it And the band is wide enough that a rerun on different hardware is not read as a regression
  And the band is narrow enough that the drift that actually occurred would have failed

Scenario: a measurement that cannot be trusted publishes nothing
  Given the corpus attestation disagrees, the snapshot identity is unusable, or the set fails to decode
  When the harness runs
  Then it exits 3, names both identities, and prints no figure at all
  And the documents are left untouched rather than filled with a guess

Scenario: the unreproduced target stays labelled unreproduced
  Given docs/scaling-path.md states a <50 ms target that the exhaustive scan does not meet
  When it is read
  Then it is still labelled as not reproduced, with the honest measured figure beside it
  And no document claims the target is met
```

#### Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E3.1 | Wall-clock is hardware-dependent | The figure must state conditions *and* a tolerance; a bare number is a defect |
| E3.2 | The scan is warm or cold on first read | The conditions must state which, and state the case count; p95 over 40 cases is the38th sorted value, which the harness already defines — that definition must be published with the figure |
| E3.3 | The measurement runs inside the recall sweep's floors | Out of the clock (already the harness's discipline) and the published figure must say so |
| E3.4 | `max` is one outlier case | Published as max, not smoothed into p95; the harness already refuses to interpolate |
| E3.5 | A figure is stated in a document outside the two named ones (e.g. `docs/scaling-path.md`, README, DISCLOSURE.md) | Story 4 must reach it; Story 3 must sweep the audited set, not just the two files the CEO named |
| E3.6 | The corpus is re-ingested after the figure is published | Corpus identity is part of the conditions, so a changed identity invalidates the figure and the check must notice |
| E3.7 | The figure changes while nobody edited the ADR | That is the case this story exists for; Story 4 makes it a build failure |

#### Security scenarios
```
Scenario: the measurement artefact carries no corpus or user text (A02, AGENTS.md §13)
  Given a latency figure is recorded as a durable artefact
  When the artefact is read
  Then it contains case identifiers, integers and hashes only
  And no quote, no question, no corpus text and no credential

Scenario: a document's surrounding prose is never echoed into a build log  Given check:docs fails on a document
  When it reports
  Then it names the file, the rule and the figure
  And it does not print the document's full contents to the console```

#### Performance
- **Response time budget (this story's subject):** the product path per rejected claim must be published with p50/p95/max under named conditions, and any published band must be wide enough for machine variance but narrow enough to catch the observed drift.
- **Throughput:** not applicable; this is a measurement, not a service.
- **Resource limits:** the harness must not write to the corpus (read-only open) and must not accumulate per-case state beyond one row in memory.
- **Scalability:** N runs must fit inside the CI budget; see Story 4 for why the *check* must not re-measure.

#### Reliability
- **Error handling:** attestation mismatch, unusable identity, undecodable eval set → exit 3, zero figures printed (already implemented; this story makes the published documents obey it).
- **Timeout:** a hung scan is a harness failure, not a slow figure.
- **Retry:** none. The measurement is deterministic in content; only the wall clock varies, which is why a tolerance exists.
- **Graceful degradation:** if the harness cannot run in a given environment, the figure is reported **unmeasured** — never back-filled from memory or from a previous document.

---

### Story 5: The harness publishes per-rank precision beside presence

**As a** judge,
**I want** to see, for each rank 1 through 5, how often the row I am shown is the correct record,
**so that** "40 of 40 at top-5" stops being presented as evidence of quality when the floor admits a median20,796 of 27,234 rows.

**INVEST:** I — depends only on S1; the harness already scans once per case and ranks at three floors. N — the precision definition and its denominators are negotiable; "named denominators" is not. V — the whole Precision epic; this is the measurement that makes the gate in S6 a decision rather than a guess. E — M. S — one harness plus its test file. T — a printed table with named denominators, deterministic across runs.

#### Acceptance criteria

```
Scenario: per-rank precision is printed beside presence
  Given `bun run eval:suggestions`
  When it completes on the attested corpus
  Then it prints, for each rank 1..5, how often the row displayed at that rank is the
    adjudicated anchor, expressed with a named denominator
  And the number of cases that displayed a row at that rank is printed as that denominator
  And a case that displayed no row at that rank is excluded from the denominator and counted    separately — never counted as a miss
  And a rank with no rows at all prints an explicit statement, not 0/0

Scenario: the hit relation stays the one the verifier uses
  Given a hit is judged
  When the relation is inspected
  Then it is folded-span containment in the candidate's folded text
  And it is not a record-id equality and not a new similarity judgementScenario: the report cannot be read as a correction-accuracy claim
  Given the report is printed
  When a reader reads it
  Then it names the set, its mutation-derived construction, and the collections it does not cover
  And it states that this measures list quality, not answer correctness
  And no field, heading or sentence reports accuracy, F1, or a whole-field figure

Scenario: the measurement is deterministic
  Given the same corpus, the same set and the same code
  When the harness runs three times
  Then every figure is byte-identical across the three runs
  And the latency figures are reported in a separate section from the quality figures, so a
    wall-clock difference can never be read as a quality regression

Scenario: a case that cannot be measured fails loudly
  Given a scan failure or an undecodable row
  When the harness runs
  Then it fails loudly rather than counting the case as a miss
  And no partial table is printed as if it were complete
```

#### Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E5.1 | Variable cardinality (after S6) shrinks lists | Rank 3 may not exist for some cases. The denominator is per-rank and printed; never a shared denominator across ranks |
| E5.2 | 31 identical verses stored under different ids (ADR-10) | A hit is folded-text containment; duplicates cannot inflate a hit |
| E5.3 | An anchor is a span quoted from inside a longer record | Containment of the span, which is already the harness's rule |
| E5.4 | An `anchorText` absent from a case | Falls back to the folded anchor id, as `casesFrom` already does — and the fallback is visible, not silent |
| E5.5 | A missing entry for a floor in `hits` | Counts as a miss, not as an absent case (already the harness's rule; must survive the edit) |
| E5.6 | 40 cases only | Every figure must name its denominator; 40 is a small sample and a precision of "31/29" style nonsense must be impossible |
| E5.7 | Precision at rank 4 and 5 will be low | That is the finding, not a failure. The report must be able to publish a low number without any incentive to hide it |
| E5.8 | Adding precision must not multiply scan cost | Reuse the single scan per case and the single ranked list already computed for the recall sweep |

#### Security scenarios
```
Scenario: the report prints no corpus text (A02, AGENTS.md §13)
  Given the harness prints a per-case line
  When that line is inspected
  Then it contains the case id and integers only
  And no quote, no anchor text and no corpus text

Scenario: no answer-quality claim is manufactured from a list-quality metric (CWE-345 at the reporting layer)
  Given precision at top-1 is published
  When a downstream reader maps it onto model accuracy
  Then the report's own wording forecloses that reading
  And no accuracy, correction-rate or F1 figure is emitted anywhere in the harness output
```

#### Performance
- **Response time:** the harness's own runtime must not grow materially — one scan per case already serves three floors and three cut-offs; per-rank precision is derived from the same ranked lists.
- **Throughput:** 40 cases × one scan of27,234 records; the clock already covers the product path only.
- **Resource limits:** unchanged from today; no additional corpus reads.
- **Scalability:** at 10× the set size, the harness must remain within the CI budget or be explicitly excluded from it with a recorded decision — it is a measurement, not a gate.

#### Reliability
- **Error handling:** untrusted corpus → exit 3, no figures (inherited).
- **Timeout:** none beyond the harness's own.
- **Retry:** none; deterministic.
- **Graceful degradation:** a floor whose entry is missing is a miss, never a skip. A case that cannot be scanned is a loud failure, never a zero.

---

### Story 6: A declared closeness gate in the reader's own units, with variable cardinality and disclosed recall cost

**As a** judge reading a rejection,
**I want** every suggested record to clear one declared floor expressed in the same integers printed beside it, and I accept fewer than five rows,
**so that** four unrelated hadiths are never dressed as candidates for my quote.

**INVEST:** I — depends on S5 (you cannot pick a floor without its measured cost). N — the floor's value and the exact arrangement of measurement and predicate are negotiable; "one owner per number" is not. V — R6, the highest-likelihood risk in the register: ranks 2–5 currently sit at 6, 8, 5 and 5 of 60 beside a correct rank1 at 35 of 60. E — M. S — one package's ranking, one harness print, one gate check. T — the displayed integers and the gate cannot disagree, and recall cost is printed.

> **The refinement that matters most in this cycle.** The integer the reader sees is `longestRunFor`'s **longest common contiguous run** in folded characters (`runChars` of `quoteChars`), not a count of all shared characters. "35 of 60" is a 35-character run. ADR-12's phrase "shared folded characters" is ambiguous on exactly the point the whole story turns on. The gate is therefore specified here on **the integer the reader actually sees**, and the printed integer must be the same integer the gate tested.

#### Acceptance criteria

```
Scenario: every displayed row clears the declared floor, in the printed units
  Given a rejected claim with suggestions
  When the block is rendered
  Then every displayed candidate clears one declared floor
  And the floor is expressed in the same integers printed on the candidate's own line
  And the gate reads only the integers the reader can see — the floor is never expressed in a
    unit that is not on the screen
  And the floor is one named constant, declared in one module, with its measurement adjacentScenario: the list may be shorter than K, and one row is a success
  Given exactly one record clears the floor
  When the block is rendered
  Then one row is printed
  And the header states one row, with no padding, no placeholder and no invented record
  And the surface presents one strong candidate as a successful result, not as a thin list

Scenario: the printed integers and the gated integers are the same number
  Given any rendered candidate
  When its printed integers are compared with the value the gate tested
  Then they are equal
  And there is exactly one owner of that measurement in the repository — two independent
    computations of the same number is a defect (AGENTS.md §17), because it is precisely how
    the current list came to contradict its own numbers

Scenario: the recall cost of the floor is printed, every run
  Given `bun run eval:suggestions`
  When it completes
  Then it prints the floor it applied and the recall that floor costs, at each cut-off
  And a drop in top-5 presence below the recorded baseline is a reported failure until a new
    baseline is recorded as a decision
  And the harness report names which floor is shipped and which are measurement-only

Scenario: the gate cannot become a route to a verdict (CWE-345)
  Given the new gate
  When the structural gates run
  Then the verdict path is unchanged and byte-identical in behaviour  And G-7.2, G-7.4, G-7.8, G-7.9 and G-7.11 still pass
  And the suggestion package still imports only @mizan/core, names no outcome, and reaches no
    clock, randomness, network, environment or timer
  And no exported field, on any display path, carries a ratio, a percentage or a threshold that
    a caller could turn into one

Scenario: a slow or large scan cannot delay or suppress the badge
  Given the scan that produces candidates
  When it runs
  Then it runs after the verdict has been decided and printed, and outside the verification budget
  And no failure, timeout or size of the scan can change a badge, an exit code, an attestation,
    a ledger payload or the degrade list

Scenario: determinism survives the gate
  Given the same corpus, quote and scope
  When the ranking runs three times, on each operating system CI runs
  Then the ordered list and every printed integer are byte-identical
  And a record that ties with another is broken by the same total order every time
```

#### Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E6.1 | **The displayed unit is a run, not a total** | The floor is stated on the run-length integer. If a second, different measure were used, the block would contradict its own line again — which is the failure this story exists to remove |
| E6.2 | `LongestRun` carries `displayPercent`, a ratio | It must not cross into `render.ts`, `suggestions.ts` or the `Suggestion` contract. G-7.4 bans percentage-shaped keys on display paths; two integers, no quotient |
| E6.3 | `NearbyRecord` deliberately carries no overlap count | If the gated integer enters the shared contract, that deliberate decision is revisited **in writing**, not silently |
| E6.4 | G-7.2 bans the token `trigram` on display modules | The gate's vocabulary in the renderer stays "folded characters"; a helper name carrying a banned token referenced from a display path trips the gate. Naming is a correctness constraint here |
| E6.5 | The floor is applied to all 27,234 scanned rows | Prohibited on cost grounds — see Performance. Apply it after narrowing/ranking, or to bounded work only |
| E6.6 | A very short quote (3 folded characters or fewer) | Fewer runs are measurable; the floor must not make every quote unreachable. Behaviour must be an honest `no_candidates`, not a crash |
| E6.7 | A record containing the quote outright | Containment bypasses the closeness floor exactly as it bypasses the trigram floor. The record that holds the quote is the answer to "what did they mean?" |
| E6.8 | The floor drops top-5 presence from 40/40 | Permitted **only** as a recorded decision with the cost printed; a silent drop fails |
| E6.9 | The gate removes every row | Honest `no_candidates` — never `unavailable`, never a padded list, never a fabricated record |
| E6.10 | `no_candidates` vs `unavailable` | Remains strictly distinguishable: "we looked and nothing was close" is not "we could not look" |
| E6.11 | A widened (whole-snapshot) list | Still labelled widened; the gate does not make a widened list look scoped |
| E6.12 | A `topK` of 5000, `NaN`, `0` or negative | Clamped as `boundTopK` already does; the gate must not be reachable with a floor of 0 by accident |
| E6.13 | CI's OS matrix | "Both CI operating systems" is the stated criterion; if CI runs one OS, the criterion degrades to three runs on that OS **and the degradation is recorded** rather than silently claimed |

#### Security scenarios

```
Scenario: the gate is display-only and provably cannot alter a decision  Given a run with and without the new gate, and with and without suggestions entirely
  When verdicts, badges, traces, ledger entries, exit codes and degrade lists are compared
  Then every one of them is identical
  And the badge line is byte-identical

Scenario: no similarity machinery reaches the gate or the display path (G-7.2)
  Given the new gate
  When the structural gates and their planted-violation self-tests run
  Then no banned similarity token, no edit-distance, embedding, vector or fuzzy machinery is
    reachable from the suggestion path or from any display module
  And the gate's only inputs are integers and strings

Scenario: corpus text reaches only a text node (A03, AGENTS.md §11)
  Given a candidate record whose text contains terminal control sequences
  When it is printed
  Then it is rendered as text with the existing normalizer applied
  And no markup, no raw HTML sink and no unescaped interpolation is introduced

Scenario: no candidate text in traces, logs or the ledger (A02, AGENTS.md §13)
  Given a run that produced suggestions
  When its trace and ledger entries are inspected
  Then they contain hashes, counts and states only
  And the hash-only discipline is unchanged by this story
```

#### Performance
- **Response time budget:** the product path per rejected claim must not regress beyond the band Story 3 publishes. Adding the gate must not push p95 past that band; if it does, either the measurement or the published figure is a recorded decision, never a silent drift.
- **Throughput:** unchanged; the scan remains one streamed pass with one row in memory.
- **Resource limits:** **the gate's measurement must not be computed for all 27,234 rows per claim.** A longest-run computation is materially more expensive than a trigram overlap, so the gate is applied to bounded work (after the existing narrowing, or to the ≤5 rows that would be displayed). Applying it inside the scan loop is out of bounds on cost grounds.
- **Scalability:** at 10× corpus size the display path must still print ≤5 rows and must still be bounded by the narrowing cap; the cost of the gate must be independent of corpus size.

#### Reliability
- **Error handling:** every failure is a state (`candidates | no_candidates | unavailable`), never a `throw` across a package (AGENTS.md §2).
- **Timeout:** the scan runs outside the verification budget, so a slow scan can never delay or suppress a badge.
- **Retry:** none. The computation is deterministic; a retry would produce the same list and hide a real problem.
- **Graceful degradation:** gate removes everything → `no_candidates`; corpus unreadable → `unavailable` with the failure named and never the row's text; the two are never collapsed.

---

## Sprint 2: Deal enablement and disclosure

---

### Story 7: The section states returned-of-scanned, and its scope in words

**As a** customer reading a rejection,
**I want** the header to say how many records were **returned** out of how many were **scanned**, and which book the lines came from,
**so that** "5 of 27234 records searched" cannot be read as "five records were searched".

**INVEST:** I — depends on S6 (the strings describe the list S6 changes). N — the exact wording is negotiable; the ambiguity is not. V — a deal-enablement defect: the current fraction is the sentence a customer reads first. E — S. S — one renderer function plus its tests. T — a string assertion, including a negative one.

#### Acceptance criteria

```
Scenario: the header states returned-of-scanned, in those words
  Given a block with five candidates from a 27,234-record scan
  When the header is printed
  Then it states five records shown, out of 27,234 scanned, with the scope named in words
  And the phrase "records searched" is no longer attached to the returned count

Scenario: the count cannot be misread as the amount searched
  Given any header this feature prints
  When it is read
  Then every record that was examined is described as scanned or examined
  And the returned records are described as returned or shown
  And a reader cannot arrive at "only five records were searched"

Scenario: the scope is stated in words in every searched state
  Given a scoped search, a widened search, and a claim with no citation
  When each is printed
  Then the scope reads as the collection searched, the whole snapshot with the collection that
    came up empty named, or the whole snapshot when no collection was cited
  And the wording never implies corpus-wide coverage of this feature

Scenario: one row reads as a success
  Given exactly one candidate clears the floor
  When the header is printed
  Then it states one record shown, and the non-authoritative disclaimer still precedes it

Scenario: the copy change does not change behaviour
  Given the new copy
  When the full existing test suite runs
  Then every state still renders — candidates, no_candidates, unavailable, and an absent block
  And the disclaimer still prints on every searched state including unavailable
  And no string from the change reaches a trace, a ledger entry or an exit code
```

#### Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E7.1 | `considered` counts rows **read**, which is every row in scope | The number is a scan count, not a search-space count, and the wording must survive that distinction |
| E7.2 | A scope that widened | "Whole snapshot — nothing was close within <collection>" already exists and must survive the rewrite; a widened list must never read as scoped (AGENTS.md §16) |
| E7.3 | **`data/transcript.json` predates this feature** | It contains the old copy. Story 7 makes the committed demo artefact stale prose. Either refresh it or record the decision not to; leaving it silently stale is the exact defect class of this cycle |
| E7.4 | An existing assertion expects `"2 of 5 records searched"` | It is updated to the new wording, **and** a negative assertion is added that the ambiguous phrase cannot return |
| E7.5 | A count of zero candidates | `no_candidates` states what was scanned; it never borrows the candidates header's wording |
| E7.6 | An `unavailable` block | Carries no count, because there was no search to count — and says why |
| E7.7 | Numbers are integers from the contract, never interpolated text | No corpus text passes through the header, so no normalizer gap is opened (A03) |
| E7.8 | The customer-facing surface implies coverage the measurement set does not support | Story 8's disclosure, but Story 7 must not *add* an implication; wording is "the records in scope", never "the corpus" |

#### Security scenarios
```
Scenario: the copy rewrite introduces no markup and no unescaped interpolation (A03)
  Given the new header and scope strings
  When they are rendered
  Then every dynamic value is an integer or a collection name passed through the existing
    normalizer
  And no raw-HTML sink, no template interpolation of corpus text, and no markup syntax appears

Scenario: no copy string becomes a machine-readable claim
  Given a reader parses the header for a count
  When they extract it
  Then they get the returned count and the scanned count as two distinct integers
  And no single integer in the header can be mistaken for the size of the search
```

#### Performance
- Negligible: string formatting only. No added I/O, no added scan.
- No change to the scan's cost or the verification budget.

#### Reliability
- **Error handling:** a missing or absent count renders as a stated limit, never a fabricated `0`.
- **Timeout / retry:** not applicable; pure rendering.
- **Graceful degradation:** `no_candidates` and `unavailable` each keep their own distinct sentence; neither borrows the other's.

---

### Story 8: Qur'an coverage is disclosed now, and its measurement is scoped for the next cycle

**As a** customer whose question covers Qur'an and hadith,
**I want** to know exactly which collections this feature has been measured on,
**so that** I do not read a hadith-only measurement as a corpus-wide correction capability.

**INVEST:** I — depends on S5 (per-rank precision is the template the measurement plan reuses). N — where the disclosure lives is negotiable; that it exists and is specific is not. V — R9: the customer's ask spans both corpora and the only committed fabrication set is hadith-only (abudawud 22, ibnmajah 16, malik 2; **zero Qur'an**, ~6,236 quran records unmeasured). E — M. S — disclosure plus a written plan. T — a coverage statement with named collections, and a recorded plan.

#### Acceptance criteria

```
Scenario: unmeasured collections are named where a customer reads about coverage
  Given a customer-facing surface that describes what this feature has been measured on
  When it is read
  Then it names the collections that were measured
  And it names the collections that were not measured, including quran
  And it states that the measurement is mutation-derived fabrication cases, not a
    whole-field accuracy study

Scenario: no surface implies corpus-wide correction coverage
  Given every customer-facing surface
  When each is read for a claim about what the feature corrects
  Then no claim covers a collection that was not measured
  And any general statement is scoped to the measured collections
  And the field-accuracy vocabulary (accuracy, F1, correction rate) appears nowhere

Scenario: the next measurement is scoped, not started
  Given the cycle closes without a quran-side measurement
  When the plan is read
  Then it states how the quran-side set will be constructed and by what rule And it states the denominators and cut-offs that will be reported
  And it reuses the per-rank precision definition from Story 5 so the two are comparable
  And nothing in the plan is written as a result

Scenario: the deferral is a decision on the record
  Given this cycle ships without quran-side measurement
  When the record is read
  Then the deferral, its reason and its trigger are written down
  And the disclosure points at that record
```

#### Edge cases

| # | Case | Required behaviour |
|---|---|---|
| E8.1 | The corpus contains ~6,236 quran records | "Unmeasured" is a statement about the **measurement set**, not about the corpus; the wording must not imply quran records are absent or unsupported |
| E8.2 | `tirmidhi` is also unmeasured | Named alongside quran; the disclosure is a list, not a single exception |
| E8.3 | The set is mutation-derived from corpus records | The plan states this and states its limits: mutation-derived cases are not the same distribution as a model's real fabrications |
| E8.4 | A reader wants to know what "measured" buys them | Presence and per-rank precision on a named set, with denominators — never accuracy |
| E8.5 | The disclosure is added mid-cycle and a doc sweep reads it | If the disclosure states a count of records or cases, Story 4's sweep must either check it or record it as an exemption with a reason |
| E8.6 | `docs/scaling-path.md` and README also describe coverage | Swept by the same rule; a disclosure that lives in one file while another overstates is not a disclosure |

#### Security scenarios
```
Scenario: the disclosure and the plan carry no corpus text (A02, AGENTS.md §13)
  Given the coverage statement and the measurement plan
  When they are read
  Then they name collections and counts only
  And no record text, no quote and no question text appears

Scenario: no internal path or credential is disclosed to reach the disclosure
  Given the coverage statement is customer-facing
  When it is written
  Then it references artefacts by the same public names the rest of the disclosure uses
  And it exposes no absolute path, token or environment variable
```

#### Performance
- Documentation-only. No runtime effect, no scan, no CI cost beyond the existing docs sweep.
- The plan must not create a CI step that measures anything this cycle.

#### Reliability
- **Error handling:** a collection whose measurement status is unknown is disclosed as unknown, never assumed measured.
- **Timeout / retry:** not applicable.
- **Graceful degradation:** if the plan is never executed, the disclosure still stands on its own — the product makes no claim that depends on the plan existing.

---

## 3. Competitive Feature ComparisonResearch: `research-citation-verification-market-2026-10-04`.

| Capability | HUMAIN | BurhanAI | TCE | IPSC/TheoAI | Consumer RAG apps | **mizan today** | This cycle |
|---|---|---|---|---|---|---|---|
| Citation shown | yes | yes | yes | yes | yes (table stakes) | yes | S7 makes the count honest |
| Badge decided by computed check | fuzzy LCS0.85/0.75 | LLM detector | LLM classifies | — | none | **exact containment only** | preserved, gated by S6 |
| Fuzzy route to `verified` | **yes (CWE-345)** | yes (LLM judge) | yes (LLM is the verifier) | re-embedding | n/a | **none, structurally** | S6 must not create one |
| Honest failure states | no | no | no | no | no | **yes, and a product surface** | preserved (E6.10) |
| Ledger / provenance | no | no | no | provenance disclosure | no | hash-chained run trace | preserved (A08) |
| Negative set published | no | no | no | no | no | 40 adversarial cases | S5 adds per-rank precision |
| Gates that must fail | no | no | no | no | no | G-1…G-7 with planted violations | S4 applies this to **our own documents** |
| Published performance figure verified by the repo | no | no | no | no | no | **no (drifted once)** | **S3 + S4 — this is the differentiator nobody else has** |

**Table stakes we already meet** (no action): citation display, per-claim breakdown, a badge, degradation states.

**Gaps flagged, not in this cycle:**
- **ALCE metric vocabulary** — S5 adopts precision/recall naming deliberately, so our numbers are comparable to the field's rather than bespoke. Applied now.
- **Fabrication-rejection rate** — the recommended lead metric. Blocked this cycle by the WON list: any whole-field correction-accuracy claim is out of scope until a non-Hadith set exists (S8 scopes it).
- **SLSA `reproducible` claim for provenance** — not this cycle; the claim-integrity work in S3/S4 is the prerequisite.
- **MCP / web parity** — deliberately ruled CLI-only.

**Honest statement of the cycle's competitive value:** S3+S4 make the repository the only artefact in this field whose *own performance and coverage claims* are machine-checked against its own harness. That is GroUSE's "does the evaluator lie" property, aimed at ourselves.

---

## 4. Risk Register

Carried from the CEO register, mapped to owners, plus six findings from reading the repository.

| # | Risk | Sev | Owner | Mitigation in these stories |
|---|---|---|---|---|
| R1 | The gate becomes a fuzzy verifier (CWE-345) | Critical | S6 | Display-only; G-7.2/7.4/7.8/7.9/7.11 green; raw integers only; no ratio exported; verdict path byte-identical |
| R2 | The gate cuts recall invisibly (40/40 → 31/40) | Critical | S6 | Harness prints floor and its recall cost every run; drop below the recorded baseline fails until re-recorded |
| R3 | A published figure drifts again — **already happened once** | Critical | S3, S4 | Figures name conditions + tolerance; the sweep makes drift a build failure |
| R4 | CI red gets committed or worked around | Critical | S1 | Story 1 ACs explicitly ban flag-relaxation, ts-ignore and `as any` as fixes |
| R5 | 37 dirty paths lost or half-merged | High | S2 | One reviewed unit; no untracked source remains |
| R6 | A judge reads ranks 2–5 as candidates | High | S6 | Declared floor in printed units, variable cardinality, disclaimer retained |
| R7 | Noise rows replaced by *no* rows — feature looks broken | Medium | S6 | One row is a success; `no_candidates` distinct from `unavailable` |
| R8 | `effect@4.0.0-beta.83` is itself a reproducibility defect | High | Deferred | ADR-14 with trigger conditions; a decision, not drift |
| R9 | Qur'an coverage implied but unmeasured | High | S8 | Unmeasured collections named; measurement scoped, not started |
| R10 | Scope creep back into capability | Medium | All | Sprint 3 unplanned; every story traces to a measured defect |
| R11 | Query-language injection via the quote | Medium | S6 | No `MATCH` path exists; the scan is exhaustive and streamed. If a query path is ever reintroduced, the existing quoting discipline is the precedent |
| R12 | Latency regression unnoticed | Medium | S3, S5 | p50/p95/max printed next to the quality table every run; S6's gate must not push p95 past the published band |
| R13 | Suggestion content leaks into trace/ledger (A02) | Medium | S2, S6 | Traces byte-identical with and without suggestions |
| R14 | Corpus text reaches a raw sink (A03) | Medium | S6, S7 | Text nodes; `normalizeForTerminal` on every printed record; G-2 green |

### New findings from the repository read (mine, not in the CEO register)

| # | Finding | Sev | Owner |
|---|---|---|---|
| **N1** | **The printed integer is a longest common *run*, not total shared characters.** ADR-12's "shared folded characters" is ambiguous on the exact point the gate turns on; an implementation reading it as a total would ship a second list that contradicts its own line | High | S6 |
| **N2** | The tempting typecheck fix is disabling `noUncheckedIndexedAccess` or adding `as any` (already present at `apps/cli/test/suggestions.test.ts:373`) — a green build from a weakened control | High | S1 |
| **N3** | `LongestRun` carries `displayPercent`, a ratio. Harmless today (it lives in the verify diagnostics package, not a declared display path); becomes a G-7.4 failure the moment it crosses into `render.ts` or `suggestions.ts` | Medium | S6 |
| **N4** | Computing the gate measurement for all 27,234 rows would multiply scan cost by the run-computation cost — a latency regression hidden inside a "display-only" story | High | S6 |
| **N5** | `check:docs` re-measuring latency in CI would make CI hardware-dependent and breach the 5-minute budget (AGENTS.md §14). The sweep must compare documents against a **recorded** artefact whose corpus identity is machine-checked | High | S4 |
| **N6** | `docs/scaling-path.md:125` makes a latency-adjacent claim ("claimed <50 ms p50, not reproduced here"). Story 4's sweep will read it — it must be checked or recorded as an exemption | Medium | S3, S4 |
| **N7** | `data/transcript.json` predates the feature; S7's copy change makes the committed demo artefact stale prose | Low | S7 (decision) |
| **N8** | G-7.2 bans the token `trigram` on display modules, while the gate's own vocabulary in the renderer must stay "folded characters" — naming is a correctness constraint, not style | Medium | S6 |

---

## 5. Verification Plan (for the QA/SE handoff)

Each story's scenarios are the acceptance contract. Verification order and the specific checks I will re-run:

1. `bun run ci` exits 0, names no failing package, < 5 min (S1, and re-checked after every subsequent story).
2. `bun run check:docs` exits 0 with zero stale figures (S3, S4).
3. `bun run eval:suggestions` prints per-rank precision with named denominators, floor + recall cost, and p50/p95/max; three runs byte-identical on the quality figures (S3, S5, S6).
4. Planted-violation self-tests exist for the new docs-claims rule: a stale figure **fails** naming document, stated value and measured value; a figure inside tolerance **passes**; a missing evidence artefact **fails closed** (S4).
5. The badge line is byte-identical with and without suggestions, and with the gate at its floor (S6).
6. No candidate text appears in any trace, log or ledger entry (S2, S6).
7. `git status` clean of untracked source after S2; the gate test title matches the discovered package count (S2).

**Reject criteria.** I reject the cycle if: any published figure cannot be reproduced from a clean checkout; any displayed row's printed integers disagree with the gated integers; a recall drop below the recorded baseline is not a recorded decision; a `no_candidates` is ever shown where the truth was `unavailable`; or a `verified` badge can be reached through anything added this cycle.

---

```json
{"office_fact_memory":[{"fact":"The integers a reader sees in a mizan suggestion line are `longestRunFor`'s LONGEST COMMON CONTIGUOUS RUN in folded characters (`runChars` of `quoteChars`), not a count of all shared characters; \"35 of 60\" means a 35-character contiguous run. render.ts prints this from packages/mizan-verify/src/diagnostics/longest-run.ts, which also carries a displayPercent ratio that must never cross into a display module (G-7.4).","phase":"pm","evidence":"apps/cli/src/render.ts:253 prints `shared: ${run.runChars} of ${run.quoteChars} folded characters`; longest-run.ts:113-121 defines runChars as longestCommonSubstring and adds displayPercent; G-7.4 bans percent-shaped property keys on pathAndDisplay.","confidence":0.95},{"fact":"mizan's structural gates constrain WHERE the suggestion floor may be computed and NAMED: packages/mizan-suggest may import only @mizan/core (G-7.8) and may not contain the tokens verdict/verified (G-7.9); G-7.2 bans the token 'trigram' on the verdict-path closure AND the display modules apps/cli/src/render.ts + apps/cli/src/suggestions.ts, so the gate's vocabulary in the renderer must stay 'folded characters' even though the suggest package itself is full of the word trigram.","phase":"pm","evidence":"packages/mizan-gate/src/gates/g7-verdict-path-purity.ts SUGGEST_ALLOWED_SPECIFIER/DISPLAY_PATHS/SUGGEST_PATH; packages/mizan-gate/src/gates/g1-no-similarity.ts SIMILARITY_TOKENS includes 'trigram' and 'ngram'.","confidence":0.9},{"fact":"The committed adversarial set data/eval/redteam-fabricated.json holds exactly 40 cases, all with anchorText, all hadith: abudawud 22, ibnmajah 16, malik 2, and zero quran cases — so per-rank precision denominators are bounded by 40 and no corpus-wide correction claim is supportable.","phase":"pm","evidence":"Parsed the file: cases=40, anchors with text=40, grouped anchorId prefixes abudawud 22/ibnmajah 16/malik 2.","confidence":0.95}]}
```

```json
{
  "stories": [
    {
      "id": "S1",
      "title": "apps/cli typecheck is green and both red packages pass",
      "epic": "A",
      "priority": "must",
      "size": "S",
      "sprint": 1,
      "story": "As a judge, I want `bun run ci` to exit 0 with every package passing, so that a red gate is never something I discover for myself.",
      "invest": {"independent": "yes, blocks all other stories", "negotiable": "the fix shape; relaxing a compiler flag or using ts-ignore/as any is explicitly out of bounds", "valuable": "AGENTS.md section 14: the gate is the deliverable", "estimable": "S - one untracked test file", "small": "one sprint", "testable": "typecheck exit code plus the two named packages"},
      "acceptanceCriteria": [
        "Given the working tree at cycle start, When tsc --noEmit runs in apps/cli, Then it exits 0, And the ClaimVerdict literal carries every required schema field, And no possibly-undefined array element is read without narrowing",
        "Given a fix that silences the diagnostics, When the apps/cli tsconfig is read, Then noUncheckedIndexedAccess is still enabled, And strict is still enabled, And no skipLibCheck or ts-expect-error was added",
        "Given the real repository, When packages/mizan-gate's real-repository test runs, Then it exits 0 and no longer fails as a consequence of apps/cli",
        "Given every package, When bun run ci runs, Then it exits 0, names no failing package, And completes in under 5 minutes",
        "Given the pre-existing `verdicts as any` cast at apps/cli/test/suggestions.test.ts:373, When this story lands, Then it is narrowed with a schema or guard, because `any` is forbidden by AGENTS.md section 2",
        "Negative: a change that silences the type errors by disabling a flag, adding ts-ignore, or casting to any is rejected at review or by the gate"
      ],
      "edgeCases": ["E1.1 pre-existing `as any` at line 373", "E1.2 nullable evidence field must be filled not cast", "E1.3 possibly-undefined blocks[0] must be narrowed", "E1.4 the failing test file is untracked so the fix is not durable until Story 2", "E1.5 12 package plans not 6"],
      "security": ["No structural guarantee traded for a green build: no strictness flag relaxed, no gate exempted", "No adversarial case deleted from data/eval/redteam-fabricated.json to reach green"],
      "performance": ["bun run ci under 5 minutes (AGENTS.md section 14)", "no added build artefact or second compiler invocation"],
      "reliability": {"errorHandling": "CI exits non-zero and names the failing package; an unattributable failure is itself a failure", "retry": "none, deterministic", "timeout": "5-minute job ceiling; exceeding it fails rather than truncates", "gracefulDegradation": "none - a skipped package is not a passing package"},
      "dependencies": [],
      "blocks": ["S2", "S3", "S4", "S5", "S6", "S7", "S8"],
      "rice": {"reach": 10, "impact": 3, "confidence": 1.0, "effortPersonMonths": 0.25, "score": 120},
      "taskDefinition": {
        "goal": "Make apps/cli typecheck clean and unblock the two red packages without weakening any compiler or gate control.",
        "deliverables": [
          {"name": "apps/cli/test/suggestions.test.ts", "format": "typescript-test"},
          {"name": "apps/cli/tsconfig.json (verified unchanged in strictness)", "format": "json"}
        ],
        "successCriteria": [
          {"text": "apps/cli typecheck exits 0", "verificationKind": "command_exit_0", "verificationSpec": "cd apps/cli && bunx tsc --noEmit"},
          {"text": "mizan-gate tests pass", "verificationKind": "command_exit_0", "verificationSpec": "cd packages/mizan-gate && bun test"},
          {"text": "full CI is green", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"},
          {"text": "no `any` remains in the test file", "verificationKind": "contains_text", "verificationSpec": "grep -c 'as any' apps/cli/test/suggestions.test.ts == 0"}
        ],
        "accessNeeded": ["read", "write", "shell"]
      }
    },
    {
      "id": "S2",
      "title": "The in-flight sprint lands as one reviewed unit and the stale gate title is corrected",
      "epic": "A",
      "priority": "must",
      "size": "S",
      "sprint": 1,
      "story": "As a reviewer, I want the whole suggestion feature committed together with its ADRs, harness and gates, so that I review one coherent change and no file is left orphaned.",
      "invest": {"independent": "yes once S1 is green", "negotiable": "one commit or a small recorded series; leaving 20 modified + 17 untracked paths un-landed is not negotiable", "valuable": "R5 - a half-landed feature means the next agent reads a different product", "estimable": "S - mechanical", "small": "one sprint", "testable": "clean tree of untracked source; title matches discovery"},
      "acceptanceCriteria": [
        "Given the cycle's work, When git status is inspected after the commit, Then no source file, test, ADR, package or harness script remains untracked",
        "And @mizan/suggest is tracked with package.json, tsconfig and tests",
        "And ADR-07 through ADR-10 are tracked",
        "Given the workspace has 12 package plans, When the real-repository test name is read, Then it states the discovered count, not a hardcoded six, And the body still derives the count from discovery",
        "Given the commit, When bun run ci runs on the committed tree, Then it exits 0, And no file needed by the build is gitignored",
        "Negative: no credential, token, key or .env file is staged; G-4 remains green",
        "And run traces and ledger entries produced with and without suggestions are byte-identical"
      ],
      "edgeCases": ["E2.1 bun.lock modified with the new workspace package", "E2.2 data/runs.jsonl is a record not an incidental edit", "E2.3 six untracked specs/ markdown files must be committed or explicitly excluded by a recorded decision", "E2.4 rename must not introduce a second hardcoded count", "E2.5 a partially-merged state is not a committable state"],
      "security": ["No secret in the commit; G-4 green over the committed tree", "Traces and ledger entries byte-identical with and without suggestions (A02)"],
      "performance": ["no runtime change; CI stays under 5 minutes", "diff must be reviewable as one sprint of work"],
      "reliability": {"errorHandling": "a pre-commit or gate failure blocks the commit; no --no-verify, no force push", "retry": "none", "timeout": "n/a", "gracefulDegradation": "none - a dirty tree is not a publishable state"},
      "dependencies": ["S1"],
      "blocks": [],
      "rice": {"reach": 8, "impact": 2, "confidence": 1.0, "effortPersonMonths": 0.25, "score": 64},
      "taskDefinition": {
        "goal": "Land the whole in-flight sprint as one reviewed commit and correct the gate test title that hardcodes six packages.",
        "deliverables": [
          {"name": "packages/mizan-gate/test/ci.test.ts", "format": "typescript-test"},
          {"name": "one commit containing 37 dirty paths", "format": "git-commit"}
        ],
        "successCriteria": [
          {"text": "no untracked source remains", "verificationKind": "command_exit_0", "verificationSpec": "git status --porcelain | grep '^??' | grep -v specs/ | wc -l == 0"},
          {"text": "CI green on the committed tree", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"},
          {"text": "the stale title is gone", "verificationKind": "contains_text", "verificationSpec": "grep -c 'all six existing packages' packages/mizan-gate/test/ci.test.ts == 0"}
        ],
        "accessNeeded": ["read", "write", "shell"]
      }
    },
    {
      "id": "S3",
      "title": "Every published latency figure is a reproducible measurement",
      "epic": "C",
      "priority": "must",
      "size": "S",
      "sprint": 1,
      "story": "As a judge, I want the latency number in ADR-08 and the degradation matrix to be one I can reproduce, so that the performance claim is computed rather than prose that has already drifted once.",
      "invest": {"independent": "yes once S1 is green; parallel with the S5/S6 chain", "negotiable": "the tolerance band and recording mechanism; a figure that names no conditions is not negotiable", "valuable": "R3 - published p95 634 ms versus harness p95 1121 ms, and check:docs passed", "estimable": "S - one measurement protocol plus two documents", "small": "one sprint", "testable": "figure, conditions, tolerance, and a rerun"},
      "acceptanceCriteria": [
        "Given ADR-08 and docs/degradation-matrix.md, When each is read, Then both state the same p50, p95 and max for the product path per rejected claim, And the figure agrees with a fresh `bun run eval:suggestions` run on the committed corpus, And the previous p50 570 ms / p95 634 ms / max 662 ms appears nowhere",
        "Given a latency number in an audited document, When a judge reads that sentence, Then it names the corpus identity (snapshot hash and record count), the harness command, the case count, the operating conditions and the tolerance, And it distinguishes the product path from the harness's own measurement work",
        "Given a measurement from one machine, When the figure is published, Then a tolerance band is published with it, wide enough that a rerun on different hardware is not a regression, narrow enough that the observed drift would have failed",
        "Given an attestation disagreement or unusable identity, When the harness runs, Then it exits 3, names both identities, prints no figure, And the documents are left untouched rather than filled with a guess",
        "Given docs/scaling-path.md states a <50 ms target not met, When it is read, Then it is still labelled not reproduced with the honest measured figure beside it"
      ],
      "edgeCases": ["E3.1 wall clock is hardware dependent - conditions plus tolerance are mandatory", "E3.2 warm vs cold scan must be stated; p95 over 40 cases is the 38th sorted value and that definition is published", "E3.3 the floor sweep is outside the clock and the figure must say so", "E3.4 max is published as max, never smoothed", "E3.5 other documents with latency claims must be swept, not just the two named", "E3.6 re-ingestion changes corpus identity and invalidates the figure", "E3.7 the figure changing with no ADR edit is the case this story exists for"],
      "security": ["The measurement artefact carries case ids, integers and hashes only - no quote, question, corpus text or credential (A02, AGENTS.md section 13)", "A failing sweep names file, rule and figure without printing document contents to the console"],
      "performance": ["publish p50/p95/max for the product path under named conditions", "tolerance band must tolerate machine variance yet catch the observed drift", "harness opens the corpus read-only and holds one row in memory"],
      "reliability": {"errorHandling": "attestation mismatch or undecodable set -> exit 3, zero figures", "timeout": "a hung scan is a harness failure, not a slow figure", "retry": "none; only the wall clock varies, which is why a tolerance exists", "gracefulDegradation": "if the harness cannot run, the figure is reported unmeasured - never back-filled"},
      "dependencies": ["S1"],
      "blocks": ["S4"],
      "rice": {"reach": 8, "impact": 3, "confidence": 0.8, "effortPersonMonths": 0.5, "score": 38.4},
      "taskDefinition": {
        "goal": "Replace the stale p50 570 ms / p95 634 ms / max 662 ms figures with one reproducible measurement that names its conditions and tolerance.",
        "deliverables": [
          {"name": "docs/specs/adr/ADR-08.md", "format": "markdown"},
          {"name": "docs/degradation-matrix.md", "format": "markdown"},
          {"name": "docs/scaling-path.md", "format": "markdown"}
        ],
        "successCriteria": [
          {"text": "no stale figure remains in audited docs", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"},
          {"text": "both documents carry the same measured figure", "verificationKind": "contains_text", "verificationSpec": "grep -E 'p95' docs/specs/adr/ADR-08.md docs/degradation-matrix.md returns one identical number"},
          {"text": "the harness reproduces the figure", "verificationKind": "command_exit_0", "verificationSpec": "bun run eval:suggestions"}
        ],
        "accessNeeded": ["read", "write", "shell"]
      }
    },
    {
      "id": "S5",
      "title": "The harness publishes per-rank precision beside presence",
      "epic": "B",
      "priority": "must",
      "size": "M",
      "sprint": 1,
      "story": "As a judge, I want to see for each rank 1 to 5 how often the row shown is the correct record, so that 40/40 at top-5 stops being presented as evidence of quality.",
      "invest": {"independent": "depends only on S1", "negotiable": "the precision definition and denominators; 'named denominators' is not negotiable", "valuable": "the measurement that makes S6's floor a decision rather than a guess", "estimable": "M - one harness and its test file", "small": "one sprint", "testable": "a printed table with named denominators, deterministic across runs"},
      "acceptanceCriteria": [
        "Given `bun run eval:suggestions`, When it completes on the attested corpus, Then it prints per-rank (1..5) how often the displayed row at that rank is the adjudicated anchor, with the number of cases that displayed a row at that rank as the denominator, And a case with no row at that rank is excluded from the denominator and counted separately, never counted as a miss, And a rank with no rows prints an explicit statement, not 0/0",
        "Given a hit is judged, When the relation is inspected, Then it is folded-span containment in the candidate's folded text, And it is not record-id equality and not a new similarity judgement",
        "Given the report is printed, When a reader reads it, Then it names the set, its mutation-derived construction and the collections it does not cover, And it states it measures list quality not answer correctness, And no accuracy, F1 or whole-field figure appears",
        "Given the same corpus, set and code, When the harness runs three times, Then every quality figure is byte-identical, And latency figures are reported in a separate section so a wall-clock difference cannot read as a quality regression",
        "Given a scan failure or undecodable row, When the harness runs, Then it fails loudly rather than counting the case as a miss, And no partial table prints as if complete"
      ],
      "edgeCases": ["E5.1 variable cardinality makes per-rank denominators differ", "E5.2 31 identical verses under different ids cannot inflate a hit", "E5.3 anchor is a span inside a longer record", "E5.4 absent anchorText falls back to the folded anchor id, visibly", "E5.5 a missing floor entry counts as a miss not a skip", "E5.6 only 40 cases, so every figure names its denominator", "E5.7 low precision at ranks 4-5 is the finding and must be publishable", "E5.8 precision must reuse the single scan and single ranked list"],
      "security": ["The report prints case ids and integers only - no quote, anchor text or corpus text (A02)", "No accuracy, correction-rate or F1 figure is emitted anywhere (CWE-345 at the reporting layer)"],
      "performance": ["runtime must not grow materially - one scan per case already serves three floors and three cut-offs", "40 cases x one scan of 27,234 records; clock covers the product path only", "no additional corpus reads", "at 10x set size the harness must stay in budget or be excluded by a recorded decision"],
      "reliability": {"errorHandling": "untrusted corpus -> exit 3 with no figures", "timeout": "harness's own", "retry": "none, deterministic", "gracefulDegradation": "a missing entry is a miss, never a skip; an unmeasurable case is a loud failure, never a zero"},
      "dependencies": ["S1"],
      "blocks": ["S6", "S8"],
      "rice": {"reach": 9, "impact": 3, "confidence": 1.0, "effortPersonMonths": 1.0, "score": 27},
      "taskDefinition": {
        "goal": "Report per-rank precision with named denominators beside the existing presence table.",
        "deliverables": [
          {"name": "scripts/eval/suggest-coverage.ts", "format": "typescript"},
          {"name": "scripts/eval/suggest-coverage.test.ts", "format": "typescript-test"}
        ],
        "successCriteria": [
          {"text": "harness runs and prints the new table", "verificationKind": "command_exit_0", "verificationSpec": "bun run eval:suggestions"},
          {"text": "quality figures are deterministic across three runs", "verificationKind": "command_exit_0", "verificationSpec": "run three times and diff the quality section"},
          {"text": "harness tests pass", "verificationKind": "command_exit_0", "verificationSpec": "bun test scripts/eval"}
        ],
        "accessNeeded": ["read", "write", "shell"]
      }
    },
    {
      "id": "S4",
      "title": "The docs claim sweep covers performance figures",
      "epic": "C",
      "priority": "must",
      "size": "M",
      "sprint": 1,
      "story": "As a judge, I want a stated latency or recall figure to be machine-checked against the recorded measurement, so that this class of drift fails the build instead of surviving review.",
      "invest": {"independent": "depends on S3; shares no files with the S5/S6 chain", "negotiable": "the mechanism; failing closed and reporting the evidence artefact are not negotiable", "valuable": "R3 recurred and check:docs reported OK across 290 swept files", "estimable": "M - one gate rule plus its planted-violation self-test", "small": "one sprint", "testable": "a planted stale figure fails naming document, stated value and measured value"},
      "acceptanceCriteria": [
        "Given an audited document stating a latency or recall figure, When check:docs runs, Then it compares the stated value against the recorded measurement artefact within the published tolerance, And a disagreement beyond tolerance fails the check naming the document, the stated value and the measured value",
        "Given a figure within tolerance, When check:docs runs, Then it passes",
        "Given the evidence artefact, When the sweep judges a document, Then it reports which artefact it judged against, And it reports which documents were exempted and why",
        "Given a missing, unreadable or identity-mismatched artefact, When check:docs runs, Then it fails closed, And a document carrying a number with no artefact is never passed by skipping",
        "Given a new rule, When its self-test runs, Then a planted stale figure fails and a planted in-tolerance figure passes (AGENTS.md section 14: every gate has a planted violation)",
        "Given CI, When check:docs runs there, Then it does not re-measure wall-clock latency, And it does not add more than a documented small number of seconds to the job"
      ],
      "edgeCases": ["E4.1 latency re-measured in CI would be hardware dependent - prohibited", "E4.2 corpus re-ingested invalidates the artefact's identity - detected and failed", "E4.3 a document with no number is untouched by the new rule", "E4.4 docs/scaling-path.md's unreproduced <50 ms claim must be checked or recorded as an exemption", "E4.5 tolerance too tight makes CI flaky on slower hardware; too wide re-admits the observed drift", "E4.6 an artefact that is stale in code but current in corpus identity cannot be machine-detected for latency - that limit is published with the artefact"],
      "security": ["The artefact holds case ids, integers and hashes only - no corpus or user text", "A failure names file, rule and figure without dumping document contents", "The corpus is opened read-only; nothing is written to data/"],
      "performance": ["must not re-measure wall clock in CI", "must fit inside the 5-minute CI budget with a documented overhead", "artefact read cost is a single small file read"],
      "reliability": {"errorHandling": "missing or corrupt artefact -> fail closed, never skip", "timeout": "bounded by file read; no measurement performed", "retry": "none", "gracefulDegradation": "an unmeasurable claim is reported as unchecked and fails the build rather than passing silently"},
      "dependencies": ["S3"],
      "blocks": [],
      "rice": {"reach": 8, "impact": 3, "confidence": 0.8, "effortPersonMonths": 1.0, "score": 19.2},
      "taskDefinition": {
        "goal": "Extend the docs claim sweep so a stated performance or recall figure cannot drift from the recorded measurement without failing the build.",
        "deliverables": [
          {"name": "packages/mizan-gate/src/docs-claims.ts (or sibling rule module)", "format": "typescript"},
          {"name": "packages/mizan-gate/test/docs-claims.test.ts", "format": "typescript-test"}
        ],
        "successCriteria": [
          {"text": "a planted stale figure fails naming document, stated value and measured value", "verificationKind": "test_passes", "verificationSpec": "cd packages/mizan-gate && bun test docs-claims"},
          {"text": "an in-tolerance figure passes", "verificationKind": "test_passes", "verificationSpec": "cd packages/mizan-gate && bun test docs-claims"},
          {"text": "the sweep passes on the real repository", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"},
          {"text": "CI stays under 5 minutes", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"}
        ],
        "accessNeeded": ["read", "write", "shell"]
      }
    },
    {
      "id": "S6",
      "title": "A declared closeness gate in the reader's own units, with variable cardinality and disclosed recall cost",
      "epic": "B",
      "priority": "must",
      "size": "M",
      "sprint": 1,
      "story": "As a judge reading a rejection, I want every suggested record to clear one declared floor expressed in the same integers printed beside it, and I accept fewer than five rows, so that four unrelated hadiths are never dressed as candidates for my quote.",
      "invest": {"independent": "depends on S5 - the floor cannot be chosen before its cost is measured", "negotiable": "the floor value and the arrangement of measurement and predicate; one owner per number is not negotiable", "valuable": "R6, the highest-likelihood risk: ranks 2-5 currently sit at 6, 8, 5 and 5 of 60 beside a correct 35 of 60", "estimable": "M - one package's ranking, one harness print, one gate check", "small": "one sprint", "testable": "printed integers and gated integers are equal; recall cost printed every run"},
      "acceptanceCriteria": [
        "Given a rejected claim with suggestions, When the block is rendered, Then every displayed candidate clears one declared floor, And the floor is expressed in the same integers printed on the candidate's own line, And the floor is one named constant in one module with its measurement adjacent",
        "Given exactly one record clears the floor, When the block is rendered, Then one row prints, And the header states one record with no padding, no placeholder and no invented record, And one strong candidate reads as a success",
        "Given any rendered candidate, When its printed integers are compared with the gated value, Then they are equal, And exactly one owner of that measurement exists in the repository - two independent computations of the same number is a defect under AGENTS.md section 17",
        "Given `bun run eval:suggestions`, When it completes, Then it prints the floor applied and the recall that floor costs at each cut-off, And a drop in top-5 presence below the recorded baseline fails until a new baseline is recorded as a decision, And it names which floor is shipped and which are measurement-only",
        "Given the new gate, When the structural gates run, Then the verdict path is unchanged, And G-7.2, G-7.4, G-7.8, G-7.9 and G-7.11 pass, And the suggestion package imports only @mizan/core, names no outcome, and reaches no clock, randomness, network, environment or timer, And no exported field on any display path carries a ratio, percentage or threshold",
        "Given a run with and without the gate and with and without suggestions, When verdicts, badges, traces, ledger entries, exit codes and degrade lists are compared, Then all are identical, And the badge line is byte-identical",
        "Given the same corpus, quote and scope, When the ranking runs three times on each CI operating system, Then the ordered list and every printed integer are byte-identical, And ties break by the same total order every time",
        "Given the gate removes every row, When the block renders, Then the state is no_candidates - never unavailable, never padded, never fabricated"
      ],
      "edgeCases": ["E6.1 the displayed unit is a longest common RUN, not total shared characters - the floor is stated on the printed integer", "E6.2 LongestRun.displayPercent is a ratio and must not cross into render.ts, suggestions.ts or the Suggestion contract (G-7.4)", "E6.3 NearbyRecord deliberately carries no overlap count - adding one is a written decision", "E6.4 G-7.2 bans the token 'trigram' on display modules - renderer vocabulary stays 'folded characters'", "E6.5 the gate must not be computed for all 27,234 rows on cost grounds", "E6.6 a quote of three folded characters or fewer - honest no_candidates, never a crash", "E6.7 outright containment bypasses the closeness floor", "E6.8 a drop from 40/40 top-5 is permitted only as a recorded decision with the cost printed", "E6.9 an empty result is no_candidates, never unavailable", "E6.10 no_candidates and unavailable stay strictly distinguishable", "E6.11 a widened list stays labelled widened", "E6.12 topK of 5000, NaN, 0 or negative is clamped and the floor is unreachable with 0", "E6.13 if CI runs one OS, the criterion degrades to three runs on that OS and the degradation is recorded"],
      "security": ["The gate is display-only: no route to a verdict exists (CWE-345); G-7.2/7.4/7.8/7.9/7.11 green with planted violations", "No similarity, edit-distance, embedding, vector or fuzzy machinery reachable from the gate or a display module", "Corpus text reaches only a text node with the existing normalizer applied (A03)", "No candidate text in traces, logs or ledger; hash-only discipline unchanged (A02, AGENTS.md section 13)"],
      "performance": ["product-path p95 must not regress beyond the band published by S3; exceeding it is a recorded decision, not silent drift", "one streamed pass, one row in memory", "the gate's measurement must not be computed for all 27,234 rows - applied to bounded work after narrowing or to the <=5 displayed rows", "gate cost must be independent of corpus size"],
      "reliability": {"errorHandling": "every failure is a state (candidates | no_candidates | unavailable), never a throw across a package", "timeout": "the scan runs after the verdict is printed and outside the verification budget, so a slow scan can never delay or suppress a badge", "retry": "none - the computation is deterministic and a retry would hide a real problem", "gracefulDegradation": "gate removes everything -> no_candidates; corpus unreadable -> unavailable naming the failure, never the row's text"},
      "dependencies": ["S1", "S5"],
      "blocks": ["S7"],
      "rice": {"reach": 10, "impact": 3, "confidence": 0.8, "effortPersonMonths": 2.0, "score": 12},
      "taskDefinition": {
        "goal": "Gate displayed candidates on the closeness scale the reader sees, allow fewer than five rows, keep the constant beside its measurement, and disclose the recall cost.",
        "deliverables": [
          {"name": "packages/mizan-suggest/src/suggest.ts", "format": "typescript"},
          {"name": "scripts/eval/suggest-coverage.ts", "format": "typescript"},
          {"name": "apps/cli/src/render.ts (printed integers only)", "format": "typescript"}
        ],
        "successCriteria": [
          {"text": "every printed integer equals the gated integer", "verificationKind": "test_passes", "verificationSpec": "cd packages/mizan-suggest && bun test"},
          {"text": "the floor and its recall cost are printed", "verificationKind": "command_exit_0", "verificationSpec": "bun run eval:suggestions"},
          {"text": "all structural gates pass", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates"},
          {"text": "determinism holds across three runs", "verificationKind": "command_exit_0", "verificationSpec": "three runs of the suggest tests plus eval:suggestions, quality figures byte-identical"},
          {"text": "no ratio on any display path", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates (G-7.4 green)"}
        ],
        "accessNeeded": ["read", "write", "shell"]
      }
    },
    {
      "id": "S7",
      "title": "The section states returned-of-scanned and its scope in words",
      "epic": "D",
      "priority": "should",
      "size": "S",
      "sprint": 2,
      "story": "As a customer reading a rejection, I want the header to say how many records were returned out of how many were scanned and which book the lines came from, so that '5 of 27234 records searched' cannot be read as 'five records were searched'.",
      "invest": {"independent": "depends on S6, whose variable cardinality changes the counts it describes", "negotiable": "exact wording; the ambiguity is not negotiable", "valuable": "the first sentence a customer reads is currently misleading", "estimable": "S - one renderer function plus tests", "small": "one sprint", "testable": "string assertions including a negative one"},
      "acceptanceCriteria": [
        "Given a block with five candidates from a 27,234-record scan, When the header prints, Then it states five records shown out of 27,234 scanned with the scope named in words, And the phrase 'records searched' is no longer attached to the returned count",
        "Given any header, When it is read, Then every examined record is described as scanned or examined, And returned records are described as returned or shown, And a reader cannot arrive at 'only five records were searched'",
        "Given a scoped search, a widened search and a claim with no citation, When each prints, Then the scope reads as the collection searched, the whole snapshot with the empty collection named, or the whole snapshot, And the wording never implies corpus-wide coverage",
        "Given exactly one candidate, When the header prints, Then it states one record shown, And the non-authoritative disclaimer still precedes it",
        "Given the new copy, When the full suite runs, Then candidates, no_candidates, unavailable and an absent block all still render, And the disclaimer prints on every searched state including unavailable, And no new string reaches a trace, ledger entry or exit code",
        "Negative: a regression that re-attaches the returned count to 'records searched' fails a planted assertion"
      ],
      "edgeCases": ["E7.1 considered counts rows read, i.e. every row in scope - the wording must survive that", "E7.2 a widened scope must never read as scoped", "E7.3 data/transcript.json predates the feature and becomes stale prose - refresh it or record the decision not to", "E7.4 the existing assertion expecting '2 of 5 records searched' is updated and a negative assertion added", "E7.5 a zero-candidate state borrows none of the candidates header wording", "E7.6 unavailable carries no count because there was no search to count", "E7.7 all dynamic values are integers or collection names through the existing normalizer", "E7.8 wording is 'the records in scope', never 'the corpus'"],
      "security": ["No markup and no unescaped interpolation introduced (A03)", "Every dynamic value is an integer or a collection name passed through the existing normalizer", "A reader parsing the header gets two distinct integers and cannot mistake either for the search-space size"],
      "performance": ["string formatting only; no added I/O or scan", "no change to scan cost or the verification budget"],
      "reliability": {"errorHandling": "a missing count renders as a stated limit, never a fabricated zero", "timeout": "n/a", "retry": "n/a", "gracefulDegradation": "no_candidates and unavailable keep distinct sentences; neither borrows the other's"},
      "dependencies": ["S6"],
      "blocks": [],
      "rice": {"reach": 7, "impact": 2, "confidence": 1.0, "effortPersonMonths": 0.5, "score": 28},
      "taskDefinition": {
        "goal": "Replace the ambiguous returned-of-scanned fraction with wording a customer cannot misread, and keep the scope stated in words.",
        "deliverables": [
          {"name": "apps/cli/src/render.ts", "format": "typescript"},
          {"name": "apps/cli/test/suggestions.test.ts", "format": "typescript-test"}
        ],
        "successCriteria": [
          {"text": "the ambiguous phrase is gone", "verificationKind": "contains_text", "verificationSpec": "grep -c 'records searched' apps/cli/src/render.ts == 0"},
          {"text": "a negative assertion exists that it cannot return", "verificationKind": "test_passes", "verificationSpec": "cd apps/cli && bun test"},
          {"text": "CLI tests and typecheck pass", "verificationKind": "command_exit_0", "verificationSpec": "cd apps/cli && bunx tsc --noEmit && bun test"}
        ],
        "accessNeeded": ["read", "write", "shell"]
      }
    },
    {
      "id": "S8",
      "title": "Qur'an coverage is disclosed now and its measurement is scoped for the next cycle",
      "epic": "D",
      "priority": "should",
      "size": "M",
      "sprint": 2,
      "story": "As a customer whose question covers Qur'an and hadith, I want to know exactly which collections this feature has been measured on, so that I do not read a hadith-only measurement as a corpus-wide correction capability.",
      "invest": {"independent": "depends on S5, whose per-rank precision definition the plan reuses", "negotiable": "where the disclosure lives; that it exists and is specific is not negotiable", "valuable": "R9 - the only committed fabrication set is hadith-only (abudawud 22, ibnmajah 16, malik 2), zero quran, ~6,236 quran records unmeasured", "estimable": "M - disclosure plus a written plan", "small": "one sprint", "testable": "a coverage statement naming collections and a recorded plan"},
      "acceptanceCriteria": [
        "Given a customer-facing surface describing what was measured, When it is read, Then it names the measured collections, And names the unmeasured collections including quran, And states the measurement is mutation-derived fabrication cases, not a whole-field accuracy study",
        "Given every customer-facing surface, When each is read for a claim about what the feature corrects, Then no claim covers an unmeasured collection, And any general statement is scoped to the measured collections, And the field-accuracy vocabulary appears nowhere",
        "Given the cycle closes without a quran-side measurement, When the plan is read, Then it states how the set will be constructed and by what rule, And the denominators and cut-offs that will be reported, And it reuses S5's per-rank precision definition so the two are comparable, And nothing in the plan is written as a result",
        "Given this cycle ships without quran-side measurement, When the record is read, Then the deferral, its reason and its trigger are written down, And the disclosure points at that record"
      ],
      "edgeCases": ["E8.1 unmeasured is a statement about the measurement set, not the corpus - the wording must not imply quran records are absent or unsupported", "E8.2 tirmidhi is also unmeasured and is named alongside quran", "E8.3 the set is mutation-derived; the plan states that and its limits", "E8.4 'measured' means presence and per-rank precision with denominators, never accuracy", "E8.5 if the disclosure states a count, S4's sweep must check it or record an exemption", "E8.6 README and docs/scaling-path.md are swept by the same rule"],
      "security": ["The coverage statement and plan name collections and counts only - no record text, quote or question text", "No absolute path, token or environment variable is disclosed"],
      "performance": ["documentation only; no runtime effect and no new CI measurement step"],
      "reliability": {"errorHandling": "a collection of unknown measurement status is disclosed as unknown, never assumed measured", "timeout": "n/a", "retry": "n/a", "gracefulDegradation": "the disclosure stands on its own even if the plan is never executed"},
      "dependencies": ["S5"],
      "blocks": [],
      "rice": {"reach": 6, "impact": 2, "confidence": 0.8, "effortPersonMonths": 1.0, "score": 9.6},
      "taskDefinition": {
        "goal": "Name the unmeasured collections in customer-facing copy and record a construction rule for a future quran-side set.",
        "deliverables": [
          {"name": "DISCLOSURE.md (or the owning customer-facing surface)", "format": "markdown"},
          {"name": "recorded quran-side measurement plan", "format": "markdown"}
        ],
        "successCriteria": [
          {"text": "unmeasured collections are named in customer-facing copy", "verificationKind": "contains_text", "verificationSpec": "grep -il 'quran' DISCLOSURE.md returns the file and the unmeasured list includes quran and tirmidhi"},
          {"text": "no accuracy vocabulary appears", "verificationKind": "contains_text", "verificationSpec": "grep -Ei 'accuracy|F1|correction rate' on the disclosure returns nothing"},
          {"text": "docs sweep still passes", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}
        ],
        "accessNeeded": ["read", "write"]
      }
    }
  ],
  "acceptanceCriteria": [
    {"story": "S1", "id": "AC1.1", "given": "the working tree at cycle start", "when": "tsc --noEmit runs in apps/cli", "then": "exits 0 with the ClaimVerdict literal complete and every possibly-undefined array access narrowed"},
    {"story": "S1", "id": "AC1.2", "given": "a fix that makes the diagnostics disappear", "when": "the apps/cli tsconfig is read", "then": "noUncheckedIndexedAccess and strict are still enabled, with no ts-expect-error or any-cast added"},
    {"story": "S1", "id": "AC1.3", "given": "the real repository and runner", "when": "packages/mizan-gate's real-repository test runs", "then": "exits 0 and no longer fails as a consequence of apps/cli"},
    {"story": "S1", "id": "AC1.4", "given": "every package", "when": "bun run ci runs", "then": "exits 0, names no failing package, and completes in under 5 minutes"},
    {"story": "S1", "id": "AC1.5", "given": "the pre-existing `verdicts as any` at apps/cli/test/suggestions.test.ts:373", "when": "this story lands", "then": "it is narrowed with a schema or guard, because any is forbidden by AGENTS.md section 2"},
    {"story": "S2", "id": "AC2.1", "given": "the cycle's work", "when": "git status is inspected after the commit", "then": "no source file, test, ADR, package or harness script remains untracked, and @mizan/suggest and ADR-07..ADR-10 are tracked"},
    {"story": "S2", "id": "AC2.2", "given": "a workspace with 12 package plans", "when": "the real-repository test name is read", "then": "it states the discovered count rather than a hardcoded six, and the body still derives the count from discovery"},
    {"story": "S2", "id": "AC2.3", "given": "the tree is about to be committed", "when": "it is staged", "then": "no credential, token, key or .env file is included and G-4 remains green"},
    {"story": "S2", "id": "AC2.4", "given": "traces and ledger entries with and without suggestions", "when": "they are compared", "then": "they are byte-identical and carry no candidate text"},
    {"story": "S3", "id": "AC3.1", "given": "ADR-08 and docs/degradation-matrix.md", "when": "each is read", "then": "both state the same p50, p95 and max, agreeing with a fresh harness run, and the old p50 570 ms / p95 634 ms / max 662 ms appears nowhere"},
    {"story": "S3", "id": "AC3.2", "given": "a latency number in an audited document", "when": "a judge reads it", "then": "it names corpus identity, harness command, case count, operating conditions and tolerance, and distinguishes the product path from harness measurement work"},
    {"story": "S3", "id": "AC3.3", "given": "a measurement from one machine", "when": "the figure is published", "then": "a tolerance band is published that tolerates machine variance yet would have caught the observed drift"},
    {"story": "S3", "id": "AC3.4", "given": "an attestation disagreement", "when": "the harness runs", "then": "it exits 3, names both identities, prints no figure, and the documents are left untouched"},
    {"story": "S5", "id": "AC5.1", "given": "bun run eval:suggestions on the attested corpus", "when": "it completes", "then": "it prints per-rank precision for ranks 1..5 with the count of cases that displayed a row at that rank as the denominator, excludes absent rows from the denominator and counts them separately, and prints an explicit statement for a rank with no rows instead of 0/0"},
    {"story": "S5", "id": "AC5.2", "given": "the printed report", "when": "a reader reads it", "then": "it names the set, its mutation-derived construction and the collections it does not cover, and no accuracy, F1 or whole-field figure appears anywhere"},
    {"story": "S5", "id": "AC5.3", "given": "the same corpus, set and code", "when": "the harness runs three times", "then": "every quality figure is byte-identical and latency is reported in a separate section"},
    {"story": "S5", "id": "AC5.4", "given": "a scan failure or undecodable row", "when": "the harness runs", "then": "it fails loudly rather than counting the case as a miss, and no partial table prints as complete"},
    {"story": "S4", "id": "AC4.1", "given": "an audited document stating a latency or recall figure", "when": "check:docs runs", "then": "it compares against the recorded measurement within the published tolerance and a disagreement fails naming the document, the stated value and the measured value"},
    {"story": "S4", "id": "AC4.2", "given": "a missing or identity-mismatched evidence artefact", "when": "check:docs runs", "then": "it fails closed and never passes a numbered document by skipping it"},
    {"story": "S4", "id": "AC4.3", "given": "the new rule", "when": "its self-test runs", "then": "a planted stale figure fails and a planted in-tolerance figure passes"},
    {"story": "S4", "id": "AC4.4", "given": "CI", "when": "check:docs runs there", "then": "it does not re-measure wall-clock latency and its overhead is documented and inside the 5-minute budget"},
    {"story": "S4", "id": "AC4.5", "given": "the sweep's report", "when": "it is read", "then": "it names which artefact it judged against and which documents were exempted and why"},
    {"story": "S6", "id": "AC6.1", "given": "a rejected claim with suggestions", "when": "the block renders", "then": "every displayed candidate clears one declared floor expressed in the same integers printed on its own line, and the floor is one named constant with its measurement adjacent"},
    {"story": "S6", "id": "AC6.2", "given": "exactly one record clears the floor", "when": "the block renders", "then": "one row prints, no padding or placeholder appears, and the result reads as a success"},
    {"story": "S6", "id": "AC6.3", "given": "any rendered candidate", "when": "its printed integers are compared with the gated value", "then": "they are equal and exactly one owner of that measurement exists in the repository"},
    {"story": "S6", "id": "AC6.4", "given": "bun run eval:suggestions", "when": "it completes", "then": "it prints the shipped floor and the recall it costs at each cut-off, and a drop below the recorded top-5 baseline fails until a new baseline is recorded as a decision"},
    {"story": "S6", "id": "AC6.5", "given": "the new gate", "when": "the structural gates run", "then": "the verdict path is unchanged, G-7.2/7.4/7.8/7.9/7.11 pass, the suggestion package imports only @mizan/core and names no outcome, and no exported field on any display path carries a ratio or threshold"},
    {"story": "S6", "id": "AC6.6", "given": "a run with and without the gate and with and without suggestions", "when": "verdicts, badges, traces, ledger entries, exit codes and degrade lists are compared", "then": "all are identical and the badge line is byte-identical"},
    {"story": "S6", "id": "AC6.7", "given": "the gate removes every row", "when": "the block renders", "then": "the state is no_candidates, never unavailable, never padded, never a fabricated record"},
    {"story": "S6", "id": "AC6.8", "given": "a very short quote of three or fewer folded characters", "when": "the search runs", "then": "the outcome is an honest no_candidates and never a crash"},
    {"story": "S6", "id": "AC6.9", "given": "a topK of 5000, NaN, zero or negative", "when": "ranking runs", "then": "it is clamped and the floor cannot be reached with a value of zero by accident"},
    {"story": "S7", "id": "AC7.1", "given": "five candidates from a 27,234-record scan", "when": "the header prints", "then": "it states five records shown out of 27,234 scanned with the scope in words, and 'records searched' is no longer attached to the returned count"},
    {"story": "S7", "id": "AC7.2", "given": "a scoped search, a widened search and a claim with no citation", "when": "each prints", "then": "the scope is named in words in every case and the wording never implies corpus-wide coverage"},
    {"story": "S7", "id": "AC7.3", "given": "exactly one candidate", "when": "the header prints", "then": "it states one record shown and the non-authoritative disclaimer still precedes it"},
    {"story": "S7", "id": "AC7.4", "given": "a regression that re-attaches the returned count to 'records searched'", "when": "the suite runs", "then": "a planted assertion fails"},
    {"story": "S8", "id": "AC8.1", "given": "a customer-facing surface describing what was measured", "when": "it is read", "then": "it names the measured collections, names quran and tirmidhi as unmeasured, and states the measurement is mutation-derived fabrication cases"},
    {"story": "S8", "id": "AC8.2", "given": "every customer-facing surface", "when": "each is read for a claim about what the feature corrects", "then": "no claim covers an unmeasured collection and the field-accuracy vocabulary appears nowhere"},
    {"story": "S8", "id": "AC8.3", "given": "the cycle closes without a quran-side measurement", "when": "the plan is read", "then": "it states the construction rule, the denominators and cut-offs, reuses S5's per-rank precision definition, and writes nothing as a result"},
    {"story": "S8", "id": "AC8.4", "given": "the deferral", "when": "the record is read", "then": "the reason and trigger are written down and the disclosure points at that record"}
  ],
  "dependencies": [
    {"from": "S1", "to": "S2", "type": "blocking", "reason": "a red typecheck means the tree cannot be reviewed or committed as a green unit"},
    {"from": "S1", "to": "S3", "type": "blocking", "reason": "measurement requires a green runner"},
    {"from": "S1", "to": "S5", "type": "blocking", "reason": "the harness must run under a green gate"},
    {"from": "S1", "to": "S6", "type": "blocking", "reason": "the gate change must land on a green tree"},
    {"from": "S3", "to": "S4", "type": "blocking", "reason": "the sweep needs a recorded measurement artefact and a published tolerance to judge documents against"},
    {"from": "S5", "to": "S6", "type": "blocking", "reason": "a floor cannot be chosen before its per-rank precision cost is measured"},
    {"from": "S6", "to": "S7", "type": "blocking", "reason": "the copy describes the list S6 makes variable-cardinality"},
    {"from": "S5", "to": "S8", "type": "shared", "reason": "the quran-side plan reuses S5's per-rank precision definition so the two measurements are comparable"},
    {"from": "S3", "to": "S6", "type": "shared", "reason": "S6's gate must not push product-path p95 beyond the band S3 publishes"},
    {"from": "S4", "to": "S8", "type": "shared", "reason": "if the coverage disclosure states counts, S4's sweep must check it or record an exemption"},
    {"from": "S3+S5", "to": "S4", "type": "shared-dependency", "reason": "one owner per fact: the sweep reads the recorded artefact and never re-derives a number"}
  ]
}
```

## Specification
## 1. Executive Summary

The v5 suggestion feature is **~90% built and demonstrably working** — I ran it end-to-end. But the cycle cannot close in its current state, for three measured reasons. **CI is red** (`apps/cli` typecheck, 3 errors, cascading into the gate package's real-repo test — 2 of 12 packages fail). **The displayed list contradicts its own numbers**: on the flagship demo question, the correct record ranks 1 at `35 of 60` shared characters, then ranks 2–5 sit at `6`, `8`, `5`, `5` of 60 — unrelated hadiths rendered in the same authoritative ranked format, because the floor and ordering are stated in 3-gram *types* (a quote shares *something* with 26,655 of 27,234 records) while the reader only ever sees shared *characters*. And **a published number is not reproducible**: ADR-08 and the degradation matrix state `p95 634 ms`; the harness today reports `p50 597 ms / p95 1121 ms / max 1928 ms`, and `check:docs` passes anyway. So this cycle buys **no new capability** — it buys a green gate, a list worth reading, and no figure the repo cannot reproduce.

## 2. Business Value Analysis

**Primary driver:** integrity-driven retention. The customer's ask ("review quoted Qur'an and hadith, name the correct one, top 3–5 nearest") is served *functionally* already. What is not yet served is **trustworthy** delivery of it. The research is blunt: the field's correction accuracy is ~66–68% against a ~67.5% do-nothing baseline, and every competitor reaches `verified` through fuzzy similarity. Our entire differentiator is that the badge was *computed*. Showing a judge four irrelevant hadiths beside the correct one reads as guessing — it is the same failure mode, at a lower-stakes surface.

**MoSCoW** (full lists in the wiki spec):

| Must | Should | Could | Won't (this cycle) |
|---|---|---|---|
| CI green (2 packages) | Copy accuracy: "5 of 27234 records searched" reads as *five were searched* | Refresh `data/transcript.json` (predates the feature) | **Effect 4.0 stable migration** → ADR-14 |
| Commit the 35-file dirty tree as one unit | Qur'an disclosure (6,236 records unmeasured; set is hadith-only) | Customer-facing latency expectation per claim count | **Index/sidecar revisit** — ADR-08 permits it *with the fixture*, and the fixture now exists |
| Per-rank precision measured and published | Fix stale title "all six existing packages" (12 plans) | | MCP/web parity; any whole-field accuracy claim |
| Declared closeness gate, variable cardinality | | | |
| Latency figures reconciled; claim sweep extended to perf figures | | | |

## 3. Risk Register

| # | Risk | Sev | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Closeness gate becomes a fuzzy verifier — the HUMAIN/TCE failure we criticise | 5 | 3 | Display-only, never reaches verdict path; G-7.8/7.9 isolate it; raw integers, no ratio exported |
| R2 | Gate cuts recall invisibly — "40/40" quietly becomes "31/40" | 5 | 4 | Harness prints the floor's recall cost beside the floor; any drop below recorded 40/40 must be a recorded decision |
| R3 | Published figure drifts again (**already happened once**) | 5 | 4 | Claim sweep extended to performance figures with stated conditions + tolerance |
| R4 | CI red gets committed or worked around | 5 | 2 | P0; AGENTS.md §14 — the gate is the deliverable |
| R5 | 35 dirty files lost or half-merged | 4 | 3 | One reviewed commit after P0 |
| R6 | Judge reads ranks 2–5 as candidates for the quote | 4 | 5 | Precision gate, variable cardinality, copy states non-authoritative |
| R7 | Noise rows replaced by *no* rows — feature looks broken | 3 | 3 | Top-1 is 36/40; "1 nearest record" is a success; `no_candidates` stays distinct from `unavailable` |
| R8 | The `effect@4.0.0-beta.83` pin is itself a reproducibility defect | 4 | 5 | Not this cycle — recorded as a deferral (ADR-14) so it is a decision, not drift |
| R9 | Qur'an coverage implied by customer copy but unmeasured | 4 | 4 | Explicit "not measured" in customer-facing copy |
| R10 | Scope creep back into capability work | 3 | 4 | Sprint 3 unplanned; this cycle ships no capability |
| R11 | Query-language injection via the quote | 3 | 2 | No `MATCH` path exists (exhaustive scan); quoting discipline stands if reintroduced |
| R12 | Latency regression unnoticed | 3 | 3 | Harness prints p50/p95/max next to recall every run |

## 4. Epics & Success Metrics

| Epic | Outcome | Threshold |
|---|---|---|
| **A. Green gate** | Trustworthy state restored | 0 failing packages; `bun run ci` exit 0; < 5 min (§14) |
| **B. Precision** | The list is worth reading | Per-rank precision published; every displayed row clears a floor stated in the reader's units; top-5 presence not below recorded 40/40 without a recorded decision |
| **C. Claim integrity** | No unreproducible published number | `check:docs` fails on a latency figure disagreeing with the harness beyond tolerance; zero stale figures in audited docs |
| **D. Deal enablement** | Customer sees what was promised | Unmeasured collections named in customer-facing copy |

## 5. Security Requirements

Sensitivity is low (corpus text is public), **reputational sensitivity is the asset**. **CWE-345** is the named threat of this cycle: the gate must never become a route to `verified` — enforced by G-7.8/7.9 and by keeping the floor out of display modules. **A03**: text nodes only, `normalizeForTerminal` on every printed record. **A02**: no candidate text in trace/ledger/logs; traces byte-identical with and without suggestions. **A08**: suggestions cannot alter attestation, ledger payload, exit code, or the degrade list. Auth model unchanged — offline, local-snapshot, no auth.

## 6. Reliability Requirements

Every failure is a state, never a throw across a package (§2): `candidates | no_candidates | unavailable | not_applicable | disabled`. `unavailable` never reads as `no_candidates`. **The scan runs after the verdict is printed and outside the verification budget**, so a slow scan can never delay or suppress a badge. **No retry** — the computation is deterministic. A precision gate that removes every row yields honest `no_candidates`, never a padded list and never an invented record.

## 7. ADRs

- **ADR-12 — Precision before cardinality.** A suggestion list may return fewer than K rows; inclusion is gated on the closeness scale the reader sees; the floor is one declared constant with its measured recall cost beside it; display-only, exports no ratio.
- **ADR-13 — A published performance figure is a measured artefact.** Any stated latency or recall number names its conditions and is machine-checked against the harness within a stated tolerance.
- **ADR-14 — Defer the Effect 4.0 stable migration to its own cycle.** An unpinned beta in a reproducibility project is a real defect; bundling a cross-cutting schema-seam change with a customer-facing cycle risks both. Recorded as a deferral with a trigger.

## 8. Sprint Backlog

| # | Item | Pri | Epic | Size | Risk | Depends on |
|---|---|---|---|---|---|---|
| 1 | Fix `apps/cli` typecheck; both red packages green | Must | A | S | Low | — |
| 2 | Commit in-flight sprint as one unit; fix stale "six packages" title | Must | A | S | Low | 1 |
| 3 | Reconcile ADR-08 + degradation-matrix latency with a reproducible measurement | Must | C | S | Medium | 1 |
| 4 | Extend claim sweep to performance figures | Must | C | M | Medium | 3 |
| 5 | Harness publishes per-rank precision beside presence | Must | B | M | Low | 1 |
| 6 | Declared closeness gate + variable cardinality, recall cost disclosed | Must | B | M | High | 5 |
| 7 | Section copy: returned-of-scanned, scope in words, unmeasured collections | Should | D | S | Low | 6 |
| 8 | Qur'an coverage: disclose now, measure next cycle | Should | D | M | Medium | 5 |

```json
{"office_fact_memory":[{"fact":"mizan's nearest-quote suggestion ranking gates on 3-gram TYPES (MIN_SHARED_TRIGRAMS=8, admits a median 20,796 of 27,234 rows) while displaying shared CHARACTERS; on the flagship fabricated-hadith demo the correct record ranks 1 at 35 of 60 shared characters and ranks 2-5 are 6, 8, 5 and 5 of 60 — so the displayed list shows four near-noise rows in the same authoritative format.","phase":"ceo","evidence":"Live run of `bun run ask \"What does the hadith say about the end of the world and knowledge diminishing?\"` printed the ranked section; packages/mizan-suggest/src/suggest.ts MIN_SHARED_TRIGRAMS=8; ADR-08 records the floor is nearly inert in Arabic and the recall table is identical at floors 4, 8, 12.","confidence":0.95},{"fact":"A quoted3-gram character share in Arabic is near-meaningless as a closeness measure: one fabricated hadith shares at least one 3-gram with 26,655 of 27,234 corpus records, because Arabic function-word trigrams recur in nearly every text. Any threshold expressed in trigram types on this corpus admits ~76% of rows and cannot discriminate near-misses from noise.","phase":"ceo","evidence":"packages/mizan-corpus/src/candidates.ts header records26,655/27,234; ADR-08 records median 20,796 rows admitted at floor 8 and identical recall at floors 4/8/12.","confidence":0.9},{"fact":"check:docs (scripts/check-docs-claims.ts) does not verify performance figures against harness output — ADR-08 and docs/degradation-matrix.md state p50 570ms/p95 634ms/max 662ms while `bun run eval:suggestions` reports p50 597ms/p95 1121ms/max 1928ms, and the claim sweep still passes.","phase":"ceo","evidence":"Ran `bun run check:docs` (reports OK, 290 files swept) and `bun run eval:suggestions` in the same session; grep of the two docs found the 634ms figure.","confidence":0.95}]}
```

```json
{
  "executiveSummary": "The v5 nearest-quote suggestion feature is ~90% built and works end-to-end, but the cycle cannot be closed as-is. CI is RED in two of twelve packages: apps/cli fails typecheck on three errors in apps/cli/test/suggestions.test.ts (a ClaimVerdict literal missing `evidence`, and two `blocks[0]` possibly-undefined), which cascades into packages/mizan-gate's real-repository test. The displayed list contradicts its own numbers: on the flagship demo question the correct record ranks 1 at 35 of 60 shared characters while ranks 2-5 sit at 6, 8, 5 and 5 of 60 — unrelated hadiths matched on Arabic function-word trigrams, rendered in the same authoritative ranked format, because the floor and ordering are stated in 3-gram TYPES (a quote shares something with 26,655 of 27,234 records) while the reader only ever sees shared CHARACTERS. A published figure is also not reproducible: ADR-08 and docs/degradation-matrix.md state p50 570ms/p95 634ms/max 662ms while `bun run eval:suggestions` today reports p50 597ms/p95 1121ms/max 1928ms, and check:docs passes because the claim sweep does not cover performance numbers. This cycle therefore buys no new capability: a green gate, a suggestion list worth reading, and no published number the repository cannot reproduce. Verified true and not to be rebuilt: @mizan/suggest (one dependency, pure), the streaming scan in @mizan/corpus (no sidecar, ADR-08), the CLI section with --no-suggestions, gates G-1..G-7 green including the G-7 suggestion rules, and recall of 40/40 top-5, 38/40 top-3, 36/40 top-1 on the 40-case adversarial set.",
  "moscow": {
    "must": [
      "CI green: fix the three apps/cli typecheck errors so both red packages pass; zero failing packages and full `bun run ci` under the 5-minute AGENTS.md section 14 budget",
      "Commit the in-flight sprint as one reviewed unit (20+ modified and 15 untracked files are currently dirty), including ADR-07 through ADR-10, @mizan/suggest, corpus candidates/rows, CLI suggestions, and the eval harness",
      "Measure and publish per-rank precision beside presence:40/40 at top-5 is not evidence of quality because the floor of 8 shared trigram types admits a median 20,796 of 27,234 rows, so the list is always full; only top-1 (36/40) is currently meaningful",
      "Introduce a declared, measured closeness gate stated in the reader's own units (shared folded characters) with variable cardinality, so a list may return fewer than 5 rows; the constant lives beside its measurement and its recall cost is disclosed by the harness",
      "Reconcile the published latency figures in ADR-08 and docs/degradation-matrix.md with a reproducible measurement that names its conditions",
      "Extend the docs claim sweep so a stated latency or recall figure cannot drift from harness output without failing"
    ],
    "should": [
      "Fix section copy accuracy: '5 of 27234 records searched' reads as five records searched when all in-scope records are scanned and five are returned",
      "Disclose in customer-facing copy that the committed fabrication set is hadith-only (abudawud 22, ibnmajah 16, malik 2) and that roughly 6,236 quran records are unmeasured, since the customer's ask covers both",
      "Fix the stale gate test title 'all six existing packages typecheck and test green', which now discovers twelve package plans"
    ],
    "could": [
      "Refresh data/transcript.json, which predates the feature and therefore shows no suggestions section in the recorded demo artefact",
      "State a customer-facing latency expectation tied to claim count, given0.6-3.4s for one to three rejected claims"
    ],
    "wont": [
      "Effect 4.0 stable migration: real debt since stable landed 2026-10-01 and beta.83 is pinned across five packages, but cross-cutting on the one schema seam; deferred to its own cycle with its own measurement and recorded as ADR-14",
      "Index or sidecar revisit: ADR-08 permits revisiting only with the fixture, and the fixture now exists (40/40), so this waits for a customer-declared latency SLO rather than the sub-50ms aspiration",
      "MCP and web surface parity: ruled CLI-only in v5 Story10 with a recorded revisit condition",
      "Any whole-field correction-accuracy claim: the field baseline is ~66-68% against a ~67.5% do-nothing figure, so we publish presence and precision, never accuracy",
      "Isnad-aware scope policy and any further Sprint 3 capability work"
    ]
  },
  "riskRegister": [
    {"id":"R1","risk":"The new closeness gate is mistaken for a fuzzy verifier, repeating the HUMAIN/TCE failure this project criticises (CWE-345)","severity":"Critical","likelihood":"Medium","mitigation":"Gate is display-only and never reaches the verdict path; G-7.8/G-7.9 keep the suggest package isolated and ban verdict/verified tokens; raw integers are shown and no ratio is exported, satisfying G-7.4","evidence":"AGENTS.md sections 9 and 10; research: HUMAIN uses 0.85/0.75 thresholds and is named as the hole ADR-03 bans"},
    {"id":"R2","risk":"The gate cuts recall invisibly, so a published 40/40 quietly becomes 31/40","severity":"Critical","likelihood":"High","mitigation":"The harness must print the recall cost of the floor beside the floor; any drop below the recorded 40/40 top-5 requires an explicit recorded decision, and the floor constant carries its measurement beside it","evidence":"ADR-09 already requires the recorded coverage to sit beside the floor"},
    {"id":"R3","risk":"A published performance figure drifts from measurement again — this has already happened once and check:docs did not catch it","severity":"Critical","likelihood":"High","mitigation":"Extend the claim sweep to performance figures with stated conditions and a tolerance band; a stale figure fails the build rather than surviving review","evidence":"ADR-08 and degradation-matrix state p95 634ms; `bun run eval:suggestions` reports p95 1121ms; `bun run check:docs` reports OK across 290 swept files"},
    {"id":"R4","risk":"CI red is committed, or worked around locally","severity":"Critical","likelihood":"Low","mitigation":"P0 in Sprint 1; per AGENTS.md section 14 the gate is the deliverable and a failure must name the failing package","evidence":"`bun run ci` currently reports CI RED with apps/cli and packages/mizan-gate failing"},
    {"id":"R5","risk":"The 35-file dirty working tree is lost or half-merged","severity":"High","likelihood":"Medium","mitigation":"Commit the sprint as one reviewed unit immediately after P0, rather than leaving a partially-landed feature in the tree","evidence":"git status shows 20 modified and 15 untracked paths including a whole new package"},
    {"id":"R6","risk":"A judge reads ranks 2-5 as genuine candidates for the quote, which reads as guessing","severity":"High","likelihood":"High","mitigation":"Precision gate plus variable cardinality, with the non-authoritative disclaimer retained in the section header","evidence":"Live demo run: rank 1 is 35 of 60 shared characters, ranks 2-5 are 6, 8, 5, 5"},
    {"id":"R7","risk":"Removing noise rows yields no rows at all and the feature looks broken to the customer","severity":"Medium","likelihood":"Medium","mitigation":"Top-1 is already 36/40, so one strong candidate is the common case and must be presented as success; no_candidates stays strictly distinct from unavailable so a reader can tell 'nothing was close' from 'we could not search'","evidence":"`bun run eval:suggestions`: top-1 36/40, top-3 38/40, top-5 40/40"},
    {"id":"R8","risk":"The effect@4.0.0-beta.83 pin is itself a reproducibility defect in a project whose thesis is reproducibility","severity":"High","likelihood":"High","mitigation":"Explicitly deferred and recorded as ADR-14 with a trigger, so the deferral is a decision on the record rather than unexamined drift; migration gets its own cycle and its own measurement","evidence":"Research: Effect 4.0 stable 2026-10-01 (PR #8633); beta.83 pinned in mizan-core and four consumer packages"},
    {"id":"R9","risk":"Qur'an coverage is implied by customer copy while remaining unmeasured","severity":"High","likelihood":"High","mitigation":"State the unmeasured collections explicitly in customer-facing copy now; measure the quran side in a later cycle rather than implying corpus-wide coverage","evidence":"The only committed fabrication set is hadith-only across three collections; roughly 6,236 quran records are unmeasured"},
    {"id":"R10","risk":"Scope creep back into capability work instead of finishing the precision cycle","severity":"Medium","likelihood":"High","mitigation":"Sprint 3 left unplanned; this cycle ships no new capability and every backlog item traces to a measured defect","evidence":"v5 spec already declined to plan Sprint 3"},
    {"id":"R11","risk":"Query-language injection via the quote if a MATCH path is ever reintroduced","severity":"Medium","likelihood":"Low","mitigation":"No MATCH path exists — the scan is exhaustive and streamed — so the surface is absent rather than defended; if reintroduced, the existing assertQuotable quoting discipline is the precedent","evidence":"ADR-08: no sidecar, no FTS table, no index"},
    {"id":"R12","risk":"Latency regression goes unnoticed because recall and cost are reported separately","severity":"Medium","likelihood":"Medium","mitigation":"The harness prints product-path p50/p95/max next to the recall table on every run, so a regression in either is visible in the same output","evidence":"`bun run eval:suggestions` already prints both"},
    {"id":"R13","risk":"Suggestion content leaks into trace, ledger or logs (A02)","severity":"Medium","likelihood":"Low","mitigation":"Traces stay byte-identical with and without suggestions; hashes and counts only; the existing G-7 and provenance gates stay green","evidence":"v5 Story 9 acceptance criteria; ADR-07 display-only ruling"},
    {"id":"R14","risk":"Corpus text reaches a raw HTML or terminal sink (A03)","severity":"Medium","likelihood":"Low","mitigation":"Text nodes only; normalizeForTerminal on every printed candidate; G-2 remains green","evidence":"AGENTS.md section 11"}
  ],
  "epics": [
    {"id":"A","name":"Green gate","outcome":"The repository returns to a state where its own claims can be trusted","successMetrics":["bun run ci exits 0 with zero failing packages and names no failing package","Full CI completes in under 5 minutes per AGENTS.md section 14","The in-flight sprint is committed as one reviewed unit with no orphaned untracked source files"]},
    {"id":"B","name":"Precision","outcome":"The suggestion list is worth reading: a judge sees the right record and is not handed four near-noise rows dressed as candidates","successMetrics":["Per-rank precision is measured and published beside presence by the harness, so top-1/top-2/top-3/top-4/top-5 quality is visible","Every displayed candidate clears one declared closeness floor stated in the units the reader sees (shared folded characters), with the constant and its measurement adjacent","Recall cost of the floor is printed by the harness; top-5 presence does not fall below the recorded 40/40 without an explicit recorded decision","A returned list of 1 is presented as a success, and no_candidates stays distinguishable from unavailable"]},
    {"id":"C","name":"Claim integrity","outcome":"No figure the repository publishes can be contradicted by the repository's own harness","successMetrics":["check:docs fails when a latency figure in an audited document disagrees with the harness beyond a stated tolerance","Zero stale performance figures remain in audited documents; ADR-08 and the degradation matrix carry a reproducible measurement with named conditions","The measurement's machine variance is bounded and recorded so a rerun on different hardware does not read as a regression"]},
    {"id":"D","name":"Deal enablement","outcome":"The customer sees exactly what was promised, including what was not measured","successMetrics":["Section copy states returned-of-scanned and the active scope in words rather than an ambiguous fraction","Unmeasured collections (quran, tirmidhi) are named in customer-facing copy","The demo artefact decision (refresh transcript or not) is recorded rather than left implicit"]}
  ],
  "sprintBacklog": [
    {"id":"1","title":"Fix apps/cli typecheck so both red packages are green","priority":"must","epic":"A","size":"S","risk":"Low","dependsOn":[],"description":"Add the missing evidence field to the ClaimVerdict literal and narrow blocks[0] so the possibly-undefined case is handled, in apps/cli/test/suggestions.test.ts. This also clears the cascade failure in packages/mizan-gate's real-repository test.","successCriteria":["apps/cli typecheck passes","packages/mizan-gate test passes","bun run ci exits 0 overall"]},
    {"id":"2","title":"Commit the in-flight sprint as one reviewed unit and fix the stale gate test title","priority":"must","epic":"A","size":"S","risk":"Low","dependsOn":[1],"description":"Land @mizan/suggest, corpus candidates/rows, CLI suggestions, the eval harness and ADR-07..ADR-10 together, and correct the gate test title 'all six existing packages' which now discovers twelve plans.","successCriteria":["Working tree clean of untracked source files","Gate test title matches the discovered package count"]},
    {"id":"3","title":"Reconcile published latency figures with a reproducible measurement","priority":"must","epic":"C","size":"S","risk":"Medium","dependsOn":[1],"description":"ADR-08 and docs/degradation-matrix.md state p50 570ms/p95 634ms/max 662ms; the harness reports p50 597ms/p95 1121ms/max 1928ms. Re-measure under named conditions, record the figure that reproduces, and state the tolerance.","successCriteria":["Both documents carry the same reproducible figure with named hardware and conditions","check:docs passes with no stale figure"]},
    {"id":"4","title":"Extend the docs claim sweep to performance figures","priority":"must","epic":"C","size":"M","risk":"Medium","dependsOn":[3],"description":"Make a stated latency or recall number in an audited document machine-checked against harness output within a stated tolerance, so this class of drift fails the build instead of surviving review.","successCriteria":["A planted stale figure fails check:docs naming the document, the stated value and the measured value","A figure within tolerance passes","The sweep reports which evidence artefact it judged against"]},
    {"id":"5","title":"Publish per-rank precision beside presence in the coverage harness","priority":"must","epic":"B","size":"M","risk":"Low","dependsOn":[1],"description":"Extend scripts/eval/suggest-coverage.ts to report, for each rank 1 through 5, how often the displayed row is the adjudicated anchor. This is the measurement that shows whether the floor is doing any work; today it admits a median20,796 of 27,234 rows, so 40/40 at top-5 is not evidence of quality.","successCriteria":["Report states per-rank precision with named denominators","Report continues to name the set, its mutation-derived construction, and the unmeasured collections","Harness remains deterministic across three runs","Report cannot be read as a correction-accuracy claim"]},
    {"id":"6","title":"Declared closeness gate with variable cardinality and disclosed recall cost","priority":"must","epic":"B","size":"M","risk":"High","dependsOn":[5],"description":"Gate which candidates may be displayed on the closeness scale the reader actually sees, allow fewer than five rows rather than padding, keep the constant beside its measurement, and print the recall cost of the gate. Display-only: no ratio is exported and no path to a verdict is created.","successCriteria":["Ranks 2-5 are shown only when they clear the declared floor in shared folded characters","The harness prints the floor and the recall it costs; any drop below the recorded 40/40 top-5 fails until a new measurement is recorded","The gate is not reachable from the verdict path and G-7.8/G-7.9 still pass","No exported field carries a ratio, percentage or threshold","Determinism holds across three runs on both CI operating systems"]},
    {"id":"7","title":"Section copy accuracy and unmeasured-collection disclosure","priority":"should","epic":"D","size":"S","risk":"Low","dependsOn":[6],"description":"Replace the ambiguous '5 of 27234 records searched' with returned-of-scanned and the active scope in words, and name quran and tirmidhi as unmeasured in customer-facing copy.","successCriteria":["Header states how many were returned out of how many were scanned, and the scope","A reader cannot mistake the count for the amount searched","Unmeasured collections appear in customer-facing copy"]},
    {"id":"8","title":"Quran-side coverage: disclose now, measure next cycle","priority":"should","epic":"D","size":"M","risk":"Medium","dependsOn":[5],"description":"The customer's ask covers Qur'an and hadith, but the only committed fabrication set is hadith-only. Disclose the gap in customer-facing copy this cycle and scope the measurement for the next one.","successCriteria":["No customer-facing surface implies corpus-wide correction coverage","A measurement plan for a quran-side set is recorded with its construction stated, as mutation-derived or otherwise"]}
  ],
  "adrs": [
    {"id":"ADR-12","title":"Precision before cardinality: a suggestion list may return fewer than K rows","status":"Proposed","context":"The feature ranks candidates by raw shared 3-gram types and shows shared characters. On the flagship demo question rank 1 shares 35 of 60 characters while ranks 2-5 share 6, 8, 5 and 5 — unrelated hadiths presented in the same authoritative format. ADR-08 already records that the floor of 8 shared types admits a median 20,796 of 27,234 rows and that recall is identical at floors 4, 8 and 12, so the floor is nearly inert in Arabic and40/40 at top-5 is not evidence of quality.","decision":"Inclusion in the displayed list is gated on the closeness scale the reader sees (shared folded characters), the list may return fewer than five rows rather than padding, the floor is one declared constant with its measurement and its recall cost beside it, and no ratio or score crosses the module boundary.","rationale":"For a judge making a religious decision, one correct record beats the correct record plus four near-noise rows, because the noise reads as guessing — the same failure the project exists to prevent, at a lower-stakes surface. This does not breach ADR-03: the gate decides what is shown, never what is believed, and no fuzzy path to a verdict exists.","consequences":"The displayed list becomes shorter and its recall may fall below the recorded 40/40; that cost is disclosed by the harness and any drop is a recorded decision rather than a silent change. Per-rank precision becomes the headline metric alongside presence."},
    {"id":"ADR-13","title":"A published performance figure is a measured artefact, not prose","status":"Proposed","context":"ADR-08 and docs/degradation-matrix.md state p50 570ms / p95 634ms / max 662ms per rejected claim. `bun run eval:suggestions` reports p50 597ms / p95 1121ms / max 1928ms. `bun run check:docs` reports OK across 290 swept files, because the claim sweep audits gate counts, ADR citations and corpus surfaces but never performance numbers.","decision":"Any latency or recall figure stated in an audited document must name the conditions it was measured under and be machine-checked against the harness output within a stated tolerance band; a figure that disagrees beyond that band fails the build.","rationale":"The repository's thesis is that claims are computed rather than asserted. A documented performance number that the repository's own harness contradicts is the documentary form of the exact failure the product exists to prevent, and it is currently invisible to CI.","consequences":"Measurement variance across hardware must be bounded and recorded, so a rerun on a slower machine does not read as a regression. Audited documents gain one more rule to satisfy, and the claim sweep gains a required evidence artefact to read."},
    {"id":"ADR-14","title":"Defer the Effect 4.0 stable migration to its own cycle","status":"Proposed","context":"Effect 4.0 went stable on 2026-10-01 (PR #8633), replacing the beta line pinned as effect@4.0.0-beta.83 across five packages including the single decodeOrFail schema seam in @mizan/core. The suggestion cycle is mid-flight with CI red and a customer-facing claim drift to repair.","decision":"Do not migrate in this cycle. Record the deferral, the reason and the trigger conditions, so the pin is a decision on the record rather than an unexamined default.","rationale":"The migration is cross-cutting on the one seam every trust boundary in the system decodes through. Bundling it with a customer-facing precision cycle risks the schema seam and the feature at once, and beta API drift is already contained in a single adapter by design — so the exposure is bounded and the sequencing cost of waiting is low.","consequences":"An unpinned beta remains a standing reproducibility defect, owned and dated rather than forgotten. The migration gets its own cycle, its own measurement of decode behaviour, and no concurrent feature work. Revisit when the suggestion cycle is closed or when beta.83 stops resolving."}
  ]
}
```

## Architecture
I stopped to check one thing in my own plan rather than declare victory: whether the rule I designed could actually reach the documents that hold the stale figures. It could not — and checking that surfaced three defects, one of which invalidates a module I told the SE to create.

## What I got wrong

**The artefact shape I specified would have been inert.** `readFigures` (`docs-value.ts:92-105`) collects figures with `Object.entries(parsed)` — **top-level numeric keys only**. My shape was nested (`latency{}`, `presenceAtCutoff[]`, `precisionByRank[]`, `floorRecallCost{}`), so under the existing rule *none of those numbers are figures at all*. `vs-search.json` is flat for exactly this reason: `systemDetectionRate`, `delta`, `corpusRecordCount` — and its nested `declaration` block is deliberately not a figure source. I specified a document the gate would read as nearly empty.

**I proposed a module that already exists.** `checkBenchmarkClaimUnbacked` already does backing *and* attribution, keyed per line, with `renderingsOf` as the shared admissible-spelling vocabulary and `groupFigure` handling `27,234` ↔ `27234`. My plan called `docs-value.ts` "the closest precedent" and then reimplemented it — producing a **second answer to "may this document state this figure"**, which is the precise defect that file documents at length and AGENTS §17 forbids. **`docs-performance.ts` is retracted.** Only the *band* is genuinely new capability: grep found no tolerance, band or epsilon concept anywhere in the docs rules, so attribution is exact equality.

**The rule would never have fired on the defect it was written for.** `AUDITED_DOCUMENTS` (`docs-check.ts:90`) is a closed six-element list, and every per-document rule runs only over it in the loop at `docs-check.ts:360-380`. The stale latency figures live in `docs/specs/adr/ADR-08.md` and `docs/degradation-matrix.md` — **neither is audited.** The tree sweep at line 408 covers gate counts and ADR citations, not figures. My rule would have been green forever while the numbers it targeted sat unchanged.

That last fix has a cost I should not have discovered late: adding documents to `AUDITED_DOCUMENTS` switches on **seven** other rules over them (`docs-check.ts:371-379`). Dense prose documents will produce a findings burst unrelated to this cycle. It needs its own step, its own triage, and — if it proves large — an explicit statement in ADR-13 that figures are reconciled but not yet machine-checked. A stated gap beats a gate nobody can afford to turn on.

Recorded in `arch-v5-precision-cycle-amendment-1`, which supersedes §2, §4 and §5 of the original.

## What stands

The gate, its owner (`verify/diagnostics/nearest-floor.ts`), its post-ranking placement and <1 ms cost, the G-7.2 naming constraint, the flat `sharedRunChars`/`quoteChars` contract, G-7.12, the three ADRs, the determinism and badge-isolation tests, and the finding that the published latency figure **is** reproducible within ~10% on comparable hardware. A2 removed a module; it did not remove a control.

**Two things I still need from you before SE starts** — both are yours, not mine:

1. **ADR status.** The spec says ADR-12/13/14 are `Proposed`; `docs-adr.ts:74,77` requires `## Context`/`## Decision`/`## Consequences` and an **Accepted** status. Writing them as Proposed fails `check:docs`. Does approval of this plan constitute acceptance, or do you want the ADR check amended?
2. **Latency band.** I recommend **1.5×** on p95, declared in the artefact and published with the rule. It catches a retyped or deleted number and a 40% regression; it cannot catch a hardware change, and I would rather state that limit than imply coverage I don't have.

```json
{
  "moduleStructure": [
    {
      "path": "packages/mizan-verify/src/diagnostics/nearest-floor.ts",
      "action": "create",
      "responsibility": "The one declared closeness floor constant and the one predicate over LongestRun. Co-located with the relation it reads.",
      "dependsOn": ["./longest-run.ts"],
      "constraints": ["G-1.2 bans 'threshold'/'similar'/'trigram' over the whole verify package in code+strings", "keeps @mizan/verify's single @mizan/core dependency true"]
    },
    { "path": "packages/mizan-verify/src/index.ts", "action": "modify", "responsibility": "Re-export MIN_SHARED_RUN_CHARS and runClearsFloor." },
    {
      "path": "packages/mizan-core/src/schema/display.ts",
      "action": "modify",
      "responsibility": "NearbyRecord gains sharedRunChars; SuggestionCandidates gains quoteChars. Amend the module header in writing to record the revisit (edge case E6.3).",
      "constraints": ["displayPercent must never cross", "G-7.4 bans percent/confidence/score/trustScore property keys on this file"]
    },
    {
      "path": "packages/mizan-suggest/src/suggest.ts",
      "action": "modify",
      "responsibility": "Re-document MIN_SHARED_TRIGRAMS as the narrowing/cost floor, not the display admission floor; delete the dangling MIN_SPAN_CHARS citation (no such constant exists; the real ones are ANCHOR_MIN_WORDS=3, ANCHOR_MAX_CHARS=160). Value unchanged."
    },
    {
      "path": "apps/cli/src/suggestions.ts",
      "action": "modify",
      "responsibility": "Apply runClearsFloor to ranked rows; PRODUCE the two integers that travel on the contract.",
      "constraints": ["in G-7 DISPLAY_PATH so G-7.2/7.3/7.4 apply", "rendered strings must avoid 'threshold' and 'similar'", "must never accept an integer from a caller"]
    },
    {
      "path": "apps/cli/src/render.ts",
      "action": "modify",
      "responsibility": "Print the contract's sharedRunChars/quoteChars instead of recomputing longestRunFor; replace the ambiguous 'records searched' copy with returned-of-scanned plus scope in words.",
      "constraints": ["printed integer equals the gated integer by construction", "text nodes only, normalizeForTerminal on every printed record"]
    },
    { "path": "scripts/eval/suggest-coverage.ts", "action": "modify", "responsibility": "Publish per-rank precision with named denominators, the shipped floor and the recall it costs, quality and latency in separate sections, and write the artefact under --record.", "constraints": ["attestation first, exit 3 with zero figures on mismatch", "stdout quality, stderr per-case"] },
    { "path": "scripts/eval/suggest-coverage.test.ts", "action": "modify", "responsibility": "Self-tests for per-rank denominators, absent ranks, floor recall cost, quality-section determinism." },
    {
      "path": "data/benchmark/vs-search.json",
      "action": "modify",
      "responsibility": "Add the flat namespaced suggestion keys below. Read by the existing StatedBenchmark path at docs-check.ts:337.",
      "constraints": ["TOP-LEVEL NUMERIC KEYS ONLY - readFigures (docs-value.ts:92-105) collects figures with Object.entries(parsed), so a nested object or array is silently invisible", "one decision recorded: this file or a sibling on the same path"]
    },
    {
      "path": "packages/mizan-gate/src/docs-performance.ts",
      "action": "RETRACTED - do not create",
      "responsibility": "checkBenchmarkClaimUnbacked already answers both questions (backing + attribution, keyed per line, docs-value.ts:43-62, docs-check.ts:376). A new module would be a second answer to 'may this document state this figure', violating AGENTS section 17."
    },
    {
      "path": "packages/mizan-gate/src/docs-value.ts",
      "action": "modify",
      "responsibility": "The ONLY place the figure-backing question is answered. Add the latency band here, or in docs-value-latency.ts called from here into the same claim stream, because no tolerance concept exists anywhere in the docs rules today."
    },
    {
      "path": "packages/mizan-gate/src/docs-check.ts",
      "action": "modify",
      "responsibility": "Add ADR-08, degradation-matrix.md, scaling-path.md and docs/specs/measurements.md (if created) to AUDITED_DOCUMENTS - currently a closed 6-element list at line 90, which is why a rule written as designed could never have fired on the stale figures. Read the artefact's band fields.",
      "constraints": ["audited-when-present, so fork-safe (docs-check.ts:69-90)", "BLAST RADIUS: this switches on seven other rules over those documents (loop body lines 371-379) and will produce a findings burst unrelated to this cycle - dedicated step, own triage, never a silent side effect"]
    },
    { "path": "packages/mizan-gate/src/gates/g7-verdict-path-purity.ts", "action": "modify", "responsibility": "Add G-7.12: the display contract carries no closeness field beyond the two declared integers and no quotient. GATE_IDS is derived from the GATES array, so the published count of 7 does not move." },
    { "path": "packages/mizan-gate/test/ci.test.ts", "action": "modify", "responsibility": "Line 443: derive the package count from discovery instead of hardcoding six." },
    { "path": "apps/cli/test/suggestions.test.ts", "action": "modify", "responsibility": "Fix the 3 typecheck errors (missing evidence field at 201; possibly-undefined blocks[0] at 203, 204) and the as-any at line 373." },
    { "path": "docs/specs/adr/ADR-12.md", "action": "create", "responsibility": "Precision before cardinality.", "constraints": ["docs-adr.ts:74,77 requires ## Context, ## Decision, ## Consequences and an Accepted status - the spec's 'Proposed' conflicts; needs a ruling"] },
    { "path": "docs/specs/adr/ADR-13.md", "action": "create", "responsibility": "A published performance figure is a measured artefact. Must state the band's limit honestly." },
    { "path": "docs/specs/adr/ADR-14.md", "action": "create", "responsibility": "Effect 4.0 stable deferral." },
    { "path": "docs/specs/measurements.md", "action": "create", "responsibility": "The conditions block every figure cites. Must be in AUDITED_DOCUMENTS or the conditions rule can never bite it." },
    { "path": "docs/specs/adr/ADR-08.md, docs/degradation-matrix.md, docs/scaling-path.md", "action": "modify", "responsibility": "Reconcile figures with conditions; keep the <50 ms target labelled unreproduced." }
  ],
  "apiInterfaces": [
    { "name": "MIN_SHARED_RUN_CHARS", "module": "@mizan/verify (diagnostics/nearest-floor.ts)", "signature": "export const MIN_SHARED_RUN_CHARS: number", "contract": "Folded characters of contiguous overlap a displayed record must reach. Value chosen by the S5 sweep from {8,10,12}; its table is written beside the constant." },
    { "name": "runClearsFloor", "module": "@mizan/verify (diagnostics/nearest-floor.ts)", "signature": "(run: LongestRun) => boolean", "input": "The same LongestRun the renderer prints runChars from", "output": "true when run.contained, or run.runChars >= MIN_SHARED_RUN_CHARS", "errors": "Total. An empty quote yields 0 and does not clear; never throws." },
    { "name": "NearbyRecord.sharedRunChars", "module": "@mizan/core (schema/display.ts)", "type": "number", "contract": "Folded characters of contiguous overlap for this record. Produced by composition, read by render, never supplied by a caller." },
    { "name": "SuggestionCandidates.quoteChars", "module": "@mizan/core (schema/display.ts)", "type": "number", "contract": "Folded quote length, once per block. The denominator the reader sees beside every numerator." },
    { "name": "precisionAt", "module": "scripts/eval/suggest-coverage.ts", "signature": "(m: readonly CaseMeasurement[], floor: number, rank: number) => RankPrecision", "contract": "{rank, displayed, hits, absent}. displayed is the named denominator: cases with a row at that rank. absent is excluded and counted separately, never as a miss." },
    { "name": "floorRecallCost", "module": "scripts/eval/suggest-coverage.ts", "signature": "(m: readonly CaseMeasurement[], floor: number) => { shipped: number; gated: number }", "contract": "The recall the shipped run floor costs, at every cutoff, printed every run." },
    { "name": "latency band check", "module": "@mizan/gate (docs-value.ts, or docs-value-latency.ts called from it)", "signature": "(document: string, file: string, artefact: SuggestionLatency | null) => readonly DocsClaim[]", "contract": "A latency figure must agree with the artefact within the artefact's own declared bandMultiplier AND sit beside a conditions block. Missing artefact or identity mismatch fails closed. Reports file, rule, stated and measured - never the document body.", "note": "The only genuinely new capability in this cycle; everything else is served by checkBenchmarkClaimUnbacked." }
  ],
  "dataModels": [
    { "name": "SuggestionCandidates", "location": "packages/mizan-core/src/schema/display.ts", "change": "additive", "fields": "state, considered, scope, candidates, + quoteChars: number" },
    { "name": "NearbyRecord", "location": "packages/mizan-core/src/schema/display.ts", "change": "additive", "fields": "existing provenance + sharedRunChars: number", "note": "displayPercent deliberately does not cross; the header's 'the ranking value stays inside @mizan/suggest' is amended in writing per E6.3" },
    {
      "name": "suggestion measurement keys (flat, top-level, numeric)",
      "location": "data/benchmark/vs-search.json",
      "change": "modify",
      "shape": "suggestionCaseCount, suggestionCorpusRecordCount, suggestionCorpusFingerprint, suggestionFloorRunChars, suggestionFloorNarrowingTrigrams, suggestionPresenceTop1/Top3/Top5, suggestionPresenceDenominatorTop1..Top5, suggestionPrecisionRank1..5Hits, suggestionPrecisionRank1..5Denominator, suggestionRecallShippedTop5, suggestionRecallGatedTop5, suggestionLatencyP50Ms, suggestionLatencyP95Ms, suggestionLatencyMaxMs, suggestionLatencyBandMultiplier",
      "authority": "Written by the harness only; check:docs reads and never re-derives (AGENTS section 17)",
      "hardConstraint": "Every key MUST be top-level and numeric. readFigures uses Object.entries(parsed), so a nested object or array - including the shape specified in the original plan - is silently ignored and the rule checks nothing."
    }
  ],
  "testingStrategy": {
    "runner": "bun test from each package directory (AGENTS section 8); bun run ci for the whole gate",
    "unit": [
      "nearest-floor: runChars === MIN clears, MIN-1 does not, contained bypasses, empty quote does not clear, pure",
      "render: printed 'shared: N of M' equals the contract's sharedRunChars/quoteChars for every row - the test that would have caught the original defect",
      "render: 'records searched' absent with a negative assertion that it cannot return (E7.4); all five states still render; disclaimer precedes the header on every searched state including unavailable",
      "precisionAt: absent ranks excluded from the denominator and counted separately; a rank with no rows prints an explicit statement, never 0/0"
    ],
    "integration": [
      "determinism: three runs, quality section byte-identical, latency in a separate section",
      "badge isolation: verdict, badge line, trace, ledger entry, exit code and degrade list identical with the gate, without the gate, and without suggestions",
      "state distinctness: no_candidates is never shown where the truth was unavailable",
      "S1: grep -c 'as any' == 0; noUncheckedIndexedAccess and strict still on; no skipLibCheck; no case deleted from data/eval/redteam-fabricated.json"
    ],
    "security": [
      "CWE-345: displayPercent never crosses into the contract or the renderer; no exported field carries a ratio, percentage or threshold",
      "G-7.12 self-test: a planted extra closeness-shaped field on NearbyRecord makes the gate fire",
      "G-7.2 naming self-test: a planted 'const threshold = 8' in suggestions.ts makes the gate fire, so the naming constraint is executable rather than folklore",
      "G-7.8/7.9/7.11 stay green: @mizan/suggest imports only @mizan/core and reaches no clock, randomness, network, env or timer",
      "A03: a record containing terminal control sequences renders as text with the normalizer applied",
      "A02: traces and ledger entries byte-identical with and without suggestions"
    ],
    "docsRule": [
      "REACHABILITY is itself a test: a planted stale figure in ADR-08.md and in degradation-matrix.md must both fail. A rule that cannot see the document holding the defect is not a rule.",
      "flat-key test: a figure nested rather than top-level must not be silently accepted as covered",
      "planted stale deterministic figure fails, naming document, stated value and measured value",
      "in-band latency passes; out-of-band latency fails; a latency figure with no conditions block fails",
      "missing artefact fails closed rather than skipping the document",
      "identity-mismatched artefact (suggestionCorpusFingerprint) fails"
    ],
    "vocabulary": [
      "docs-value.ts:468 bans assertive answer-/retrieval-quality claims in audited documents (ADR-C2). Because ADR-08 and degradation-matrix become audited, the per-rank precision table must be worded as a suggestion-list metric, and the passing wording must be DISCOVERED by planting a violation rather than guessed. Do not label it 'retrieval recall'."
    ],
    "performance": [
      "gate applied post-ranking is under 1 ms (mean textMatch 270 chars, max 6,709; ~81k DP cell ops for 5 rows at a 60-char quote)",
      "harness adds no corpus read; per-rank precision reuses ranked lists already in memory",
      "the docs rule adds under 2 s and never re-measures wall clock in CI",
      "adding documents to AUDITED_DOCUMENTS is budgeted as its own step with its own triage (risk A13)",
      "full bun run ci stays under 5 minutes"
    ]
  },
  "office_auto_approve": {
    "confidence": 0.72,
    "evidence": "The gate design is fully grounded - every path, symbol, gate token and corpus statistic was verified by live run, and the latency figure is reproducible within ~10% of published on comparable hardware. But my own plan carried three defects that only surfaced when I checked whether the proposed rule could reach the documents holding the stale figures: a nested artefact shape that readFigures would have ignored entirely, a module reimplementing checkBenchmarkClaimUnbacked, and a rule scoped to a 6-element document list that excluded both documents carrying the defect. The second and third are corrected here and verified against source. What remains genuinely open is not architecture but two rulings only the CEO or PM can give: the ADR Proposed-vs-Accepted conflict with docs-adr.ts, and whether the findings burst from widening AUDITED_DOCUMENTS is affordable now or should be recorded in ADR-13 as a stated gap. Confidence is set below threshold deliberately rather than papered over.",
    "requires_human_ruling": [
      "ADR-12/13/14: the spec says Proposed, docs-adr.ts:74,77 requires Accepted and check:docs fails otherwise. Does approving this plan constitute acceptance?",
      "Latency band: I recommend 1.5x on p95, declared in the artefact and published with the rule's stated limit. Confirm or override."
    ]
  }
}
```

```json
{"office_fact_memory":[{"fact":"packages/mizan-gate's figure rules read a benchmark artefact with readFigures() (docs-value.ts:92-105), which collects TOP-LEVEL numeric keys only via Object.entries(parsed) — a nested object or array is silently invisible. Any key added to data/benchmark/*.json must therefore be flat and top-level; the existing vs-search.json is flat for exactly this reason and its nested `declaration` block is deliberately not a figure source.","phase":"at","evidence":"docs-value.ts:92-105 readFigures implementation; data/benchmark/vs-search.json is flat (systemDetectionRate, delta, corpusRecordCount, caseCount) with a nested `declaration` object at lines 15-22.","confidence":0.95},{"fact":"Every per-document docs rule in mizan runs only over AUDITED_DOCUMENTS, a closed six-element list (DISCLOSURE.md, README.md, INTEGRITY.md, .env.example, docs/value-proof.md, docs/demo-runbook.md), iterated at docs-check.ts:360-380. The tree sweep at docs-check.ts:408-415 covers gate counts and ADR citations only, never figures. So a figure rule added for docs/specs/adr/ADR-08.md or docs/degradation-matrix.md is inert unless those files are added to AUDITED_DOCUMENTS — which is audited-when-present and therefore fork-safe.","phase":"at","evidence":"docs-check.ts:90 AUDITED_DOCUMENTS definition, :69-90 the audited-vs-required reasoning, :360-380 the per-document loop, :408-415 the sweep's narrower scope.","confidence":0.9},{"fact":"Adding a document to AUDITED_DOCUMENTS switches on seven rules over it (checkBacktickedPaths, checkDocumentedScripts, checkEvalBreadth, checkLiveProviderClaim, checkBenchmarkClaimUnbacked, checkAnswerQualityClaim, checkExternalClaimUnbacked), so widening the list on a dense prose document produces a findings burst unrelated to the change that motivated it. Treat list widening as its own triaged step, never as a side effect.","phase":"at","evidence":"docs-check.ts:371-379 is the loop body invoked once per entry of AUDITED_DOCUMENTS.","confidence":0.85}]}
```