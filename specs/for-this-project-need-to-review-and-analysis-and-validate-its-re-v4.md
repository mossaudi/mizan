# Spec: for-this-project-need-to-review-and-analysis-and-validate-its-re

**Request:** for this project need to review and analysis and validate its real value as I received a feedback that the project value is not strong and seems useless as it can be achieved by any search tool so deep honest verify then need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
# User Stories — Project Value Validation & Competitive Hardening

**Spec:** `spec-project-value-validation-2026-09-29` · **Repo:** `mizan` (Bun monorepo, CLI-only, Track 4) · **Cycles planned:** Sprint 1 + Sprint 2 only
**Authority:** this response is the deliverable. Wiki pages `sprint-1-prove-the-value-stories` and `sprint-2-convert-the-gap-into-product-stories` are traceability records only; where they differ from this document, this document wins.
**Grounded by inspection, not assumption:** `scripts/benchmark/score.ts:99` (`detected = testCase.expectedVerdict !== "verified"`), `scripts/ci.ts` (exit 0/1/2, `--only=`), `package.json` script names, gate files `g1..g7`, `data/eval/redteam-fabricated.json`, `data/benchmark/vs-search.json`, `specs/adr/` (2 request-spec markdowns, 0 standalone ADRs), `git status --porcelain` = 81 lines.

---

## 1. Story Overview

| # | Title | Epic | Sprint | MoSCoW | Size | R (Reach) | I | C | E (person-mo) | **RICE** | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Commit the uncommitted deliverable tree | E-7 | 1 | Must | S | 10 | 3 | 100% | 0.5 | **60.0** | Low |
| 2 | Budget per-package test duration; deterministically green CI | E-2 | 1 | Must | M | 9 | 3 | 90% | 1.5 | **16.2** | Medium |
| 3 | Record the system arm by executing `verifyAnswer` | E-1 | 1 | Must | L | 10 | 3 | 80% | 3.0 | **24.0** | High |
| 4 | Add a hard baseline arm outside the verifier boundary | E-1 | 1 | Must | L | 8 | 3 | 70% | 4.0 | **4.2** | High |
| 5 | Extend the eval set to ≥3 failure classes | E-4 | 1 | Must | M | 8 | 2 | 80% | 2.0 | **6.4** | Medium |
| 6 | Strip every unmeasured claim from docs and demo output | E-1 | 1 | Must | S | 9 | 2 | 90% | 0.5 | **32.4** | Medium |
| 7 | Standalone `specs/adr/ADR-01..ADR-11.md`, resolvable citations | E-7 | 1 | Must | M | 7 | 1 | 95% | 1.5 | **4.4** | Low |
| 8 | Lead with the badge, demote retrieval (demo reorder) | E-3 | 1 | Must | S | 9 | 2 | 90% | 0.5 | **32.4** | Low |
| 9 | Correction surface ST3 from the longest-run diagnostic | E-5 | 2 | Should | M | 7 | 2 | 80% | 2.0 | **5.6** | Medium |
| 10 | Relevance ST4 — a non-answer cannot badge green | E-6 | 2 | Should | L | 7 | 3 | 60% | 4.0 | **3.15** | High |
| 11 | Publish the comparison table (generated from artefact) | E-1 | 2 | Should | S | 8 | 2 | 85% | 0.75 | **18.1** | Medium |
| 12 | Quarantine-coverage reporting + visible no-sources-found | E-2 | 2 | Should | M | 6 | 1 | 90% | 1.5 | **3.6** | Low |
| 13 | Live run-ledger evaluation (MIZ-110) | E-1 | 2 | Should | M | 5 | 2 | 70% | 2.0 | **3.5** | Medium |
| 14 | Arabic normalisation spec + terminal rendering | E-6 | 2 | Should | M | 8 | 2 | 80% | 2.0 | **6.4** | Medium |

**RICE ranks; dependency + MoSCoW sequences.** Story 4 (RICE 4.2) and Story 10 (RICE 3.15) rank below Story 7 (4.4) and Story 12 (3.6), yet they are placed by the dependency chain and by their direct answer to the received feedback ("any search tool could do this"). This divergence is intentional and recorded, not an error. Story 11 (RICE 18.1) outranks most of Sprint 2 but is blocked on Story 4.

**Capacity reality check.** Sprint 1 as specified totals ≈13.5 person-months of effort. A nominal 2-week cycle with three engineers delivers ≈3. This is a **delivery risk (R-8 sharpened)** and the sprint must be run with an explicit fallback slice, declared now rather than discovered on day 9:

- **Minimum shippable slice (if capacity collapses): 1.1 → 1.2 → 1.3 → 1.6 → 1.8.** That slice alone removes R-1, R-2, and R-5 and answers the received feedback. Stories 1.4, 1.5, 1.7 slip to the front of Sprint 2 with 2.1–2.6 pushed behind them. Do **not** drop 1.1, 1.3, or 1.6 in any scenario: they are the credibility floor.

---

## 2. Dependency Graph

```
                ┌─────────────────────────────────────────────┐
                │ Story 1 (commit tree) — ROOT, no blockers   │
                └───────┬──────────────────────────┬──────────┘
                        │                          │
          ┌─────────────┼──────────────┬───────────┴──────────┐
          ▼             ▼              ▼                      ▼
  Story 2 (CI)   Story 3 (recorded   Story 6 (strip     Story 7 (ADRs)
   budgeted       system arm)  ◄──┐     claims) ◄────┐
          │            │           │      │           │
          │            │           └──────┘           │
          │            │       (6 refines 3's output) │
          │            ├──────────────► Story 4 (hard baseline arm)
          │            │                       │
          │            ├──────────────► Story 5 (≥3 failure classes)
          │            │                       │
          │            │                       └──► Story 10 (relevance ST4)
          │            │
          │            ├──────────────► Story 9  (correction ST3)
          │            ├──────────────► Story 11 (comparison table, also needs 4)
          │            ├──────────────► Story 13 (live ledger eval)
          │            │
          └────────────┴──────────────► Story 12 (quarantine coverage)

  Story 8 (badge-first demo) — no blockers, independent of 1.3 by design
  Story 14 (Arabic spec + rendering) — no hard blocker; shares the normalisation
                        module (Story 2 only if terminal width work touches CI)
```

| Type | Edges |
|---|---|
| **Blocking** | 1 → {2, 3, 6, 7}; 3 → {4, 5, 9, 11, 13}; 4 → 11; 3 + 5 → 10; 2 → 12; 14 → 2 (only if the terminal-rendering change touches the CLI suite's snapshot budget) |
| **Shared dependency** | `@mizan/gate` hosts the CI runner, the test budget table, the docs-claims gate, the ADR citation check, and the baseline-arm boundary check — Stories 2, 4, 6, 7 all edit `packages/mizan-gate`. **This is the most likely source of merge conflict in the sprint and must be sequenced, not parallelised.** |
| **Shared dependency** | `scripts/benchmark/score.ts` `Figures` shape is written by Stories 3, 4, 5, 11 and 13 — one schema in `@mizan/core`, four writers. Contract must land first, in Story 3. |
| **External** | Bun 1.3.14 (pinned) and its 13.2s per-hook timeout; GitHub Actions `ubuntu-latest` / `windows-latest`; a model/embedding runtime for Story 4 (optional, offline-cacheable); a network path for the LLM-judge arm (**key from env only, never committed**). |
| **Mitigation** | Every Story 3+ change to the published artefact is additive-only with a schema decode at the boundary (AGENTS.md §1), so a Story 4 arm that fails to load yields `unavailable`, never a malformed artefact. |

---

## Sprint 1: Make the value provable

### Story 1: Commit the uncommitted deliverable tree

**Epic** E-7 · **Priority** Must · **Size** S · **RICE** 60.0 · **Risk** Low · **Spec ref** backlog 1.1, R-5

**Story statement**
*As* the engineering team shipping the gates that constitute the differentiator, *we want* the entire working tree — including the G-7 gate, `scripts/benchmark/`, and `data/benchmark/` — to exist in the repository history, *so that* a judge cloning the repository finds the machine-checked invariants rather than an empty ADR directory and a clean-looking log.

**Why now:** `git status --porcelain` currently returns **81 lines**. The gates are the product. A gate that exists only in a working tree has never been reviewed and cannot be cited.

**INVEST**
- **I** — nothing blocks it; it is the root of the dependency graph.
- **N** — one commit vs. several logical commits, .gitattributes/CRLF policy, and whether `data/corpus.db` is committed at all are all open to team decision.
- **V** — converts an unshipped differentiator into a reviewable, citable artefact.
- **E** — hours, not days.
- **S** — single Sprint-1 item; the first action of the cycle.
- **T** — objective, command-checkable exit criterion.

**Acceptance criteria (Given/When/Then)**

```
Scenario: The working tree is clean and the deliverable is in history
  Given the repository root of mizan
  When "git status --porcelain" is executed
  Then it prints nothing and exits 0
  And "git log --oneline -1" names a commit whose tree contains
      packages/mizan-gate/src/gates/g7-verdict-path-purity.ts,
      scripts/benchmark/score.ts, and data/benchmark/vs-search.json

Scenario: CI passes on the committed tree, not on the working tree
  Given a fresh clone of HEAD into a clean directory
  When "bun run ci" is executed
  Then it exits 0 and reports typecheck, tests, and gates G-1..G-7 all passing
  And the result is unchanged by any file that exists only in an uncommitted working tree
  And the exit code is 0 (green) or 1 (ran and failed) or 2 (could not start) —
      never a green tick for a run that inspected nothing (scripts/ci.ts)

Scenario: Secrets and corpus text are refused before the commit lands
  Given the modified set contains a file matching a gitleaks pattern, or corpus text
      that the Apache-2.0/licence boundary excludes from the repository
  When the commit is prepared
  Then the offending file is excluded and the exclusion is reported by name
  And G-4 (gitleaks) is run against the STAGED tree before the commit, not only after it
  And the commit message contains no secret, no PII, and no corpus text

Scenario: An untracked deliverable is never silently dropped
  Given a new untracked file under packages/, apps/, scripts/, data/, specs/, or docs/
  When the commit is assembled by staging only tracked modifications
  Then the operation FAILS
  And the tool names every untracked file left behind, with its path
```

**Edge cases**
- **Empty commit** — refused with an explanation, not created (AGENTS.md no-empty-commit posture).
- **CRLF churn on Windows** — if the 81-line diff is dominated by line-ending normalisation, that must not be committed as a substantive change; `.gitattributes` decision required first.
- **`data/corpus.db`** — a binary. Committing it is a licence/size decision; excluding it must not break `ingest:check` in a fresh clone. This is a **named precondition**, not a detail.
- **Non-ASCII paths / Arabic filenames** — must survive checkout on both OSes.
- **Concurrent `index.lock`** — two agents committing in parallel; must fail loudly, never auto-retry into corruption.
- **A pre-commit hook that mutates the tree** — the commit must be rejected, not silently staged.
- **Path-length limits on `windows-latest`** for the newly added `specs/` and `data/benchmark/` paths.

**Security acceptance criteria**
- **Secrets:** no credential, key, or token enters any commit object, staged or committed; G-4 runs pre-commit and in CI.
- **Licence/PII boundary:** corpus text and per-source registry content that the licence excludes are not committed; the commit log is itself a published surface.
- **Data exposure:** no error message from a failed commit prints file *contents* — only paths and categories.

**Performance requirements**
- `git status --porcelain` < 2s on the committed tree; `bun run ci` on a fresh clone < 5 min (the §14 budget, inherited by Story 2).
- No step may introduce a >120s uncosted operation into the commit path.

**Reliability requirements**
- **Error handling:** a failed pre-commit hook or G-4 finding leaves the tree exactly as it was; exit code non-zero.
- **Timeout:** a `git` operation exceeding 120s aborts with a named message rather than hanging CI.
- **Retry:** none automatic for the commit itself; a human re-runs after fixing the cause (retries here would mask a staged-content problem).
- **Graceful degradation:** if `data/corpus.db` must be excluded, `ingest:check` must fail with a named "corpus absent" message, not a stack trace.

**Task definition**
```json
{ "goal": "Commit the uncommitted deliverable so the gates exist in repository history",
  "deliverables": [
    { "name": "Git commit set covering packages/mizan-gate/src/gates/g7-verdict-path-purity.ts", "format": "source" },
    { "name": "scripts/benchmark/ and data/benchmark/vs-search.json", "format": "source+json" },
    { "name": "specs/ and docs/ additions", "format": "markdown" },
    { "name": ".gitattributes line-ending policy (if required)", "format": "config" } ],
  "successCriteria": [
    { "text": "Working tree is clean", "verificationKind": "command_exit_0", "verificationSpec": "git status --porcelain" },
    { "text": "CI is green on the committed tree", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci" },
    { "text": "G-7 gate file is tracked in HEAD", "verificationKind": "file_exists", "verificationSpec": "git ls-files packages/mizan-gate/src/gates/g7-verdict-path-purity.ts" },
    { "text": "G-4 gitleaks is green on the staged tree", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** reformatting, renaming, or refactoring any file being committed; any change to gate logic.

---

### Story 2: Budget per-package test duration and make CI deterministically green

**Epic** E-2 · **Priority** Must · **Size** M · **RICE** 16.2 · **Risk** Medium · **Spec ref** backlog 1.2, R-2

**Story statement**
*As* a judge who arrives at a red build, *we want* `bun run ci` to be deterministically green on both operating systems inside the 5-minute budget, with test duration treated as a budgeted resource, *so that* the claim "the gate is the deliverable" is not contradicted by our own CI before the demo runs.

**Root cause (measured, not guessed):** `apps/cli` passes 217/217 standalone in **26.64s**; Bun's default per-hook timeout of **13.2s** trips under full-CI load. This is a duration problem, not a correctness problem.

**INVEST**
- **I** — depends only on Story 1; no other story needs it first.
- **N** — where the budget table lives, whether to split the suite by file, and how much timeout headroom to grant are all negotiable.
- **V** — removes the single most credibility-damaging observable: a red build.
- **E** — one to three days including measurement across two OSes.
- **S** — one sprint item.
- **T** — 10 consecutive green runs is a countable criterion.

**Acceptance criteria (Given/When/Then)**

```
Scenario: A suite that exceeds its budget fails as a named assertion
  Given apps/cli is running its 217 tests
  When the measured per-package or per-hook duration exceeds the declared budget for apps/cli
  Then the run FAILS
  And the failure message names the package, the measured duration, and the budget
  And the outcome is recorded as a FAILURE — never a skip, a retry-and-pass, or a
      "slow test" warning that does not fail the build

Scenario: Ten consecutive green runs on both operating systems
  Given ubuntu-latest and windows-latest runners on the committed tree
  When "bun run ci" is executed 10 consecutive times per operating system
  Then all 10 runs exit 0 on both operating systems
  And no run records a timeout, a load-induced skip, or an unretried failure
  And the wall time of every full run is under 5 minutes

Scenario: The root test command still refuses (§8)
  Given the repository root
  When "bun test" is executed at the root
  Then it exits non-zero and prints why
  And this behaviour is unchanged by the duration work

Scenario: A timeout is raised only through the budget table
  Given a legitimate need for a longer timeout in one package
  When the timeout is changed
  Then the change is made in exactly one declared budget location
  And the docs gate observes the new budget
  And the change did not consist of raising a global timeout to hide a cost

Scenario: Cold-cache runs are not slower than warm-cache runs beyond the budget
  Given a fresh clone with no Bun build cache and an unbuilt corpus index
  When "bun run ci" is executed
  Then the run still exits 0 within the 5-minute budget
  And any first-run cost is reported as a separate named line, not folded into the suite time
```

**Edge cases**
- **1-core GitHub runner** vs. an 8-core developer machine — a budget that passes locally can fail in CI; the budget must be asserted against the *slowest* target.
- **Cold corpus index build** — first-run index cost must not be attributed to a test hook.
- **`windows-latest` is measurably slower** (~1.3×) — a single shared budget can be simultaneously too loose on Linux and too tight on Windows; either per-OS budgets or a budget with explicit per-OS headroom.
- **Per-file parallelism** — splitting 217 tests across files can make the *sum* smaller while one file stays slow; the budget must be per package, not per file.
- **Test that is slow only in combination** (shared fixture, lock contention) — the budget catches this only if it is measured per package.
- **A test that passes on retry** — a retry here is a flake, and §14 defines a flake as a defect. Retry is forbidden as a fix.
- **Hook-level vs. suite-level timing** — Bun's 13.2s default is per hook; a single slow `beforeEach` covering 217 tests trips it while the suite is only 26.6s.

**Security acceptance criteria**
- **Log hygiene:** the duration fix must not add verbose diagnostics that print question text, corpus text, or SQL rows; a timing line carries package name and duration only (§13).
- **Secret masking:** CI must continue to mask any secret that appears in a failure message; a timing budget failure must not dump environment values.
- **No untrusted data in the timing report:** package names come from `discoverPackages` globs, not from arbitrary input.

**Performance requirements**
- Declared per-package budget in one table; `apps/cli` reduced to **≤ 20s** standalone (from 26.64s).
- Full `bun run ci` **< 5 minutes** on both OSes; gate-only run (`--only=gates`, `--report-only`) remains cheap enough for the `if: always()` step.
- Typecheck and test phases must remain sequential per package; no phase may silently skip work to fit the budget.

**Reliability requirements**
- **Error handling:** a timeout surfaces as a named failure with package, budget, measurement. `scripts/ci.ts` exit semantics (0/1/2) are preserved.
- **Timeout behaviour:** a hook exceeding the budget fails; the *build* is additionally bounded by the CI job timeout, and exceeding it is a job failure, not a cancellation.
- **Retry strategy:** **none** for tests. A human may re-run a job manually, but a re-run must never be recorded as the pass criterion.
- **Graceful degradation:** if a package cannot be measured at all, the run fails with "package did not report a duration" rather than reporting a zero.

**Task definition**
```json
{ "goal": "Eliminate the flaky apps/cli hook by budgeting test duration per package",
  "deliverables": [
    { "name": "Per-package test duration budget table (single source of truth)", "format": "source" },
    { "name": "apps/cli suite restructuring or fixture isolation to reach budget", "format": "source" },
    { "name": "CI workflow timeout/headroom adjustments for both OSes", "format": "config" } ],
  "successCriteria": [
    { "text": "Full CI exits 0", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci" },
    { "text": "10 consecutive green runs per OS are recorded", "verificationKind": "file_exists", "verificationSpec": "recorded CI run list in the PR description" },
    { "text": "A suite over budget fails with a named assertion", "verificationKind": "test_passes", "verificationSpec": "self-test: budget overrun produces a named failure" },
    { "text": "Root bun test still refuses", "verificationKind": "command_exit_0", "verificationSpec": "bun run test" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** deleting or skipping tests to hit the budget; disabling the flaky test; changing test assertions.

---

### Story 3: Record the system arm by executing `verifyAnswer`, and fail the build if it is ever re-derived

**Epic** E-1 · **Priority** Must · **Size** L · **RICE** 24.0 · **Risk** High · **Spec ref** backlog 1.3, R-1 (Critical), ADR-12

**Story statement**
*As* a field-literate judge who greps `score.ts` first, *we want* `systemDetectionRate` to be a recorded execution of the verifier over the eval set, *so that* the headline figure is a measurement that can be wrong, instead of a tautology that holds at 1.0 for any input whatsoever — including a verifier that does not exist.

**The defect, precisely:** `scripts/benchmark/score.ts:99` computes `const detected = testCase.expectedVerdict !== "verified"`, and all 40 red-team cases are labelled `rejected`. Therefore `systemDetectionRate = 1` by construction, and `data/benchmark/vs-search.json:9` ships it as `1` with `delta: +0.35` against a 65% baseline. **A tautology is worse than no number: it cannot be wrong until the verifier is deleted.**

**INVEST**
- **I** — needs only the committed tree; it is the root of the measurement chain.
- **N** — how the arm is wired (in-process call vs. recorded run file), how the CI is computed (Wilson vs. exact), and the artefact schema are negotiable.
- **V** — the single highest-value change in the cycle: it converts the central claim from assertion to measurement.
- **E** — 2–4 weeks of engineering including the planted self-test and the frozen contract.
- **S** — one sprint item, but the largest in Sprint 1.
- **T** — a planted arm that returns a constant **must** fail the build; that is a decidable test.

**Acceptance criteria (Given/When/Then)**

```
Scenario: The detection rate is a measurement
  Given data/eval/redteam-fabricated.json and a corpus snapshot
  When "bun run benchmark:vs-search" is executed
  Then systemDetectionRate is computed by calling verifyAnswer once per case and
      comparing the PRODUCED verdict to the expectation
  And the code path that computes the figure never reads expectedVerdict
  And the artefact records, per case: produced verdict, expected verdict, agreement,
      the anchor/cited record id, and the corpus snapshot hash
  And systemAbstentionRate is published alongside it, so "detect by abstaining" is visible

Scenario: A verifier that does not exist cannot produce a good score (planted self-test)
  Given a planted variant of the system arm that returns "verified" for every case,
      and a second planted variant that returns expectedVerdict verbatim
  When the self-test runs
  Then it FAILS for both
  And the failure message states that a constant arm and a label-derived arm are not
      measurements
  And a third planted assertion specifically rejects the expression
      expectedVerdict !== "verified" as a detection rule

Scenario: The number can move
  Given a deliberately weakened verifier fixture
  When the same scorer runs
  Then systemDetectionRate < 1.0 and the run FAILS the release bar
  And the self-test asserts this monotonicity property, so a future refactor that
      re-hardcodes the figure breaks the build

Scenario: The published rate carries uncertainty and honest scope
  Given a run of N cases with k detections
  When data/benchmark/vs-search.json is written
  Then it publishes the point estimate, a 95% confidence interval, the per-class
      breakdown, the case count, and the interval method by name
  And the report scopes the claim as "the quote is contained in the cited record",
      never "the answer is correct"
  And no percentage appears on the user-facing verdict surface (ADR-16)

Scenario: A verified verdict on a red-team case blocks the release
  Given any case where verifyAnswer returns "verified" while the expectation is not verified
  When figures are computed
  Then falseVerifiedCount increments
  And the run exits non-zero
  And the case is listed by id in the artefact — counted, not merely asserted

Scenario: Malformed verifier output is never read as a verdict
  Given verifyAnswer returns a payload that fails the verdict schema decode
  When the arm scores that case
  Then the case is recorded as "unverifiable", counted separately from detections
  And it is never counted as detected
  And the run reports the decode failure by case id and exits non-zero if unexpected
```

**Negative / abuse scenarios**
```
Scenario: An empty eval set refuses to publish a rate
  Given the eval set contains zero cases
  When figures are computed
  Then the rate helper does NOT return 0.0 and the artefact does NOT publish a rate
  And the artefact states "no cases evaluated" and the run exits non-zero
  (Today rate() returns 0 for a zero denominator, which would publish a 0% detection rate.)

Scenario: One case failing does not lose the other thirty-nine
  Given case 17 throws or times out
  When the run completes
  Then the remaining 39 cases are still scored and recorded
  And the artefact is marked incomplete and the run exits non-zero
  And a partial comparison is never published as if it were complete
```

**Edge cases**
- **Determinism:** 100% byte-identical verdicts and artefact across repeated runs, on both OSes — including JSON key order and line endings.
- **Timeout per case:** a case exceeding its per-case budget yields `unverifiable`, never a silent pass.
- **Abstention accounting:** a system that abstains on everything would "detect" everything; `systemAbstentionRate` must be printed so the claim can be decomposed (the existing scorer's reasoning, preserved).
- **Arm independence:** the baseline arm and the system arm must not share a module, or a bug moves both in the same direction and the delta looks stable while both are wrong.
- **A case id duplicated** in the set → rejected at build time, not silently de-duplicated.
- **Corpus snapshot drift:** the artefact records the snapshot hash; a later run on a different snapshot must not overwrite a figure without recording both.

**Security acceptance criteria**
- **Dependency boundary:** the system arm must not import `src/diagnostics/`, and G-1 must still report exactly one dependency for `packages/mizan-verify`.
- **Network:** the system arm makes no network call. A model or embedding path is forbidden inside the scoring path.
- **Untrusted input:** every artefact field crosses the boundary through a declared schema (`decodeOrFail`); `JSON.parse` on model output is a defect.
- **Data exposure:** the artefact contains case ids, record ids, verdicts, and hashes only — never question text, corpus text, or secrets (§13).
- **Injection:** a fabricated quote containing control sequences or markup must not alter the artefact or the report; the corpus text is never rendered as HTML (Rule 11).

**Performance requirements**
- 40 cases offline **≤ 30s**; a 200-case set **≤ 120s**; p95 per case **≤ 100ms**.
- The benchmark is **not** inside the 5-minute CI budget's critical path; it runs as a separate job or on demand.
- The artefact write must be atomic (write temp → rename) so an interrupted run cannot leave a half-written `vs-search.json`.

**Reliability requirements**
- **Error handling:** per-arm failures are isolated and named; a failing arm never yields a passing run.
- **Timeout behaviour:** per-case timeout → `unverifiable` + recorded; whole-run timeout → non-zero exit, no artefact update.
- **Retry strategy:** none for the verifier (it is deterministic; a retry would only mask a nondeterminism defect). Retry is permitted only for the *harness* (file I/O).
- **Graceful degradation:** if the corpus is unavailable, the arm reports `unavailable` with a reason and the run exits non-zero — it must never fall back to reading expectations.

**Task definition**
```json
{ "goal": "Make systemDetectionRate a recorded verifyAnswer execution with an anti-tautology self-test",
  "deliverables": [
    { "name": "Benchmark outcome contract in @mizan/core (frozen, schema-decoded)", "format": "source" },
    { "name": "Recorded system-arm execution replacing the label-derived path", "format": "source" },
    { "name": "Planted self-test: constant arm, label-derived arm, and the forbidden expression", "format": "test" },
    { "name": "Per-case artefact with CI, class mix, falseVerifiedCount, abstention rate", "format": "json" } ],
  "successCriteria": [
    { "text": "Benchmark runs and produces a measured rate with a 95% CI", "verificationKind": "command_exit_0", "verificationSpec": "bun run benchmark:vs-search" },
    { "text": "Planted self-test fails the build for a constant or label-derived arm", "verificationKind": "test_passes", "verificationSpec": "self-test suite in the benchmark package" },
    { "text": "falseVerifiedCount is 0 and the rate moves when the verifier is weakened", "verificationKind": "test_passes", "verificationSpec": "monotonicity self-test" },
    { "text": "G-1 still passes with exactly one verifier dependency", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** changing verifier logic, changing the containment rule, or touching `verify.ts:107`.

---

### Story 4: Add a hard baseline arm outside the verifier's dependency boundary

**Epic** E-1 · **Priority** Must · **Size** L · **RICE** 4.2 · **Risk** High · **Spec ref** backlog 1.4, R-9, R-12, ADR-13

**Story statement**
*As* a judge who asks "compare against an embedding retriever or an LLM judge", *we want* at least one non-FTS5 baseline measured in the same artefact, *so that* "any search tool could do this" is refuted on the record by a number, not by an argument — and published even if the baseline wins.

**INVEST**
- **I** — depends on Story 3's frozen contract; independent of everything else in Sprint 1.
- **N** — dense retriever vs. LLM judge vs. both; which embedding model; which judge; all negotiable.
- **V** — this is the story that directly answers the received feedback.
- **E** — 3–5 weeks including model plumbing and offline caching.
- **S** — one sprint item; the largest technical risk in the plan.
- **T** — a published arm in the artefact is a decidable condition; the "publish it anyway" clause is tested by a self-test that forbids suppression.

**Acceptance criteria (Given/When/Then)**

```
Scenario: A hard arm appears beside the FTS5 arm
  Given the benchmark harness and the published artefact
  When all arms are enumerated
  Then at least one non-FTS5 arm is present: a dense retriever and/or an LLM judge
  And each arm publishes its model or embedding identifier and version
  And the FTS5 arm is still published with its honest declaration
      (assertBaselineIsHonest must also cover the new arms)

Scenario: The verifier's one-dependency invariant survives
  Given packages/mizan-verify and any new benchmark package
  When gate G-1 runs
  Then it passes and reports exactly one dependency (@mizan/core)
  And no import path exists from the benchmark package into packages/mizan-verify/src
  And verify.ts still cannot import src/diagnostics/

Scenario: The result is published whether or not it favours mizan
  Given the new arm scores higher than the system arm on any class
  When the artefact is written
  Then the higher score is printed next to mizan's, in the same table
  And no filtering, re-running-until-favourable, or cell suppression is permitted
  And the commit that produces the unfavourable result is committed
  And a self-test FAILS if any arm's result is present in one run and absent in another
      for the same corpus snapshot and set hash

Scenario: An arm that cannot load degrades explicitly
  Given the dense arm cannot load its model (no cache, no key, no network)
  When the benchmark runs
  Then that arm's cell is printed as "unavailable" with a named reason
  And the system arm's figure is unchanged
  And the artefact is explicitly marked as missing that arm
  And the run does NOT exit 0 claiming a complete three-way comparison
```

**Negative / abuse scenarios**
```
Scenario: A judge arm's output is not trusted as a verdict
  Given an LLM judge returns the literal string "verified" as free text
  When its output is consumed
  Then it is schema-decoded and a malformed answer becomes an arm failure
  And no judge output ever reaches a mizan verdict (the arms are separate systems)

Scenario: A rigged new arm is named, not scored
  Given the dense arm is configured with k=10 but scored top-1, or rerun until the
      cited record appears
  When the honesty declaration is compared
  Then assertBaselineIsHonest returns named problems and the run FAILS
```

**Edge cases**
- **No API key / no network** — the arm reports `unavailable`; CI must not require a secret to be green.
- **Model download prohibited in CI** — the arm is either offline-cached (checked into a cache dir, hashed) or explicitly optional with a named skip that is visible in the report; silence is forbidden.
- **Embedding dimension mismatch** across arms → a named arm failure, not a silent zero.
- **top-k > 1** — must be declared and scored honestly; the existing DEFECT_NOTES rule for `k` applies verbatim.
- **LLM-judge nondeterminism** — the arm is labelled nondeterministic in the artefact and may never be the basis of a determinism claim; temperature pinned and run count published.
- **Cold model start** — excluded from the reported figure and reported separately, or it dominates the wall clock and the rate is meaningless.

**Security acceptance criteria**
- **Secret handling:** any judge API key is read from the environment only; it is never written to the artefact, a log line, a trace, or a commit (G-4 must stay green).
- **Quarantine:** the new package may not be reachable from the verdict path; G-1 is the machine-checked control (R-12).
- **Untrusted model output:** decoded through a declared schema at the boundary (§1). A model's self-reported "verified" is never a verdict.
- **Network egress:** the system arm stays offline; the new arms' network use is confined to their own package and is documented.
- **Supply chain:** model identifiers and versions are pinned in the artefact so a judge can reproduce or refute.

**Performance requirements**
- Dense arm ≤ **5 min** wall clock; cold model load reported separately from the scoring time.
- Full multi-arm benchmark ≤ **15 min**; runs as a **non-gating** CI job so it can never make the 5-minute gate red.
- p95 per case per arm reported in the artefact.

**Reliability requirements**
- **Error handling:** per-arm isolation; a failing arm is named and does not corrupt the other arms' figures.
- **Timeout behaviour:** per-arm and per-case budgets; a timeout yields `unavailable` for that arm, not a zero.
- **Retry strategy:** none for the system arm; a single documented retry permitted for a network-backed arm, with the retry count published.
- **Graceful degradation:** absent arm → explicit `unavailable` cell + non-zero exit for a "complete comparison" claim, zero exit for a "partial comparison" claim that is labelled partial.

**Task definition**
```json
{ "goal": "Measure at least one hard non-FTS5 baseline arm without touching the verifier's dependency boundary",
  "deliverables": [
    { "name": "Separate benchmark arms package importing nothing from mizan-verify", "format": "source" },
    { "name": "Dense-retriever and/or LLM-judge arm with pinned model ids", "format": "source" },
    { "name": "Extended assertBaselineIsHonest covering the new arms", "format": "test" },
    { "name": "Multi-arm artefact section with commit hash and corpus snapshot hash", "format": "json" } ],
  "successCriteria": [
    { "text": "At least one non-FTS5 arm is measured and published", "verificationKind": "file_exists", "verificationSpec": "data/benchmark/vs-search.json contains a second arm" },
    { "text": "G-1 passes and the verifier still declares one dependency", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" },
    { "text": "A rigged new arm is detected by a named honesty problem", "verificationKind": "test_passes", "verificationSpec": "baseline honesty self-tests" },
    { "text": "An unloadable arm degrades to 'unavailable' with a reason", "verificationKind": "test_passes", "verificationSpec": "arm-degradation self-test" } ],
  "accessNeeded": ["read", "write", "shell", "network"] }
```

**Out of scope:** changing the verifier; making the new arms part of the product; gating CI on them.

---

### Story 5: Extend the eval set to at least three distinct failure classes

**Epic** E-4 · **Priority** Must · **Size** M · **RICE** 6.4 · **Risk** Medium · **Spec ref** backlog 1.5, R-4, ADR-15

**Story statement**
*As* a judge assessing a zero-tolerance integrity claim, *we want* the red-team set to span absent-quote, wrong-number, wrong-collection, and truncated fabrications with per-class rates and confidence intervals, *so that* 0/40 at 95% CI ≈ [89%, 100%] becomes a narrow, credible denominator rather than a regression test wearing an evaluation's label.

**INVEST**
- **I** — depends on Story 3's scoring contract; the new classes are scored by the same arm.
- **N** — case counts per class, the interval method, and the mutation strategy are negotiable.
- **V** — a zero-tolerance claim needs a denominator that can actually detect a fault.
- **E** — 1–2 weeks including construction-time self-checks.
- **S** — one sprint item.
- **T** — group-by over the set returning ≥4 distinct classes is decidable.

**Acceptance criteria (Given/When/Then)**

```
Scenario: The set spans at least three distinct failure classes
  Given data/eval/redteam-fabricated.json after this story
  When cases are grouped by expectedReason
  Then absent-quote, wrong-number, wrong-collection and truncated classes are all present
  And no single class accounts for more than 50% of the set
  And every case carries an expectedVerdict, an expectedReason, a cited record, and a
      classId
  And the published aggregate is accompanied by the class mix

Scenario: Per-class rates are published, not just the aggregate
  Given a benchmark run over the extended set
  When figures are computed
  Then each class has its own detection rate, its own 95% interval, and its own case count
  And an empty class is printed as "no cases in class" rather than 0.0

Scenario: The set is verifiably not the set the verifier was built from
  Given the anchor records and expectations used by scripts/eval/anchors.ts and plan.ts
  When the new cases are compared against that development set
  Then the overlap is computed and published as a number
  And new cases are drawn from records outside the development set where possible
  And where overlap is unavoidable it is disclosed and the published claim is scoped

Scenario: An undecidable case is excluded visibly
  Given an adjudicator (model or human) that cannot decide a case
  When adjudication runs
  Then the case is excluded from the rate
  And the exclusion count and the excluded ids are published
  And exclusions are never silently dropped from the denominator
```

**Negative / abuse scenarios**
```
Scenario: A mutation that is not actually a fabrication
  Given a mutation intended to fabricate a wrong-number case whose folded text
      nonetheless appears verbatim in the cited record (diacritics, tatweel, alef/ya)
  When the set is built
  Then the construction-time containment self-check FAILS
  And the case cannot enter the set
  And the failure names the mutation and the record

Scenario: Duplicate or colliding case ids
  Given two cases with the same id, or the same quote with different citations
  When the set is built
  Then the build FAILS and names the collision
  And the second case is never silently merged
```

**Edge cases**
- **Diacritic-fold equivalence** — a "fabrication" that normalises to the real text is a set-construction defect, not a verifier defect; this is the most likely way a wrong class silently inflates the rate.
- **Truncation length boundaries** — a quote at exactly the cap and one byte over.
- **Class balance after adjudication exclusions** — balance must be re-checked post-exclusion.
- **A class reduced to zero** by exclusions — printed explicitly, not as 0%.
- **Mutation that changes the anchor's identity** — the cited record must still resolve.
- **Large `k`/quote cap** — a mutation producing a quote longer than the cap must be rejected, not truncated into a still-contained string.

**Security acceptance criteria**
- **Data exposure:** the per-class artefact carries ids, class names, counts, and hashes — no question text, no corpus text beyond what is already published, no PII (§13).
- **Adjudicator output** is untrusted and schema-decoded; a model that returns a bare verdict string is a decode failure, not a label.
- **No leakage from the run ledger:** eval cases must not be derived in a way that reveals hashed question content.
- **Independence:** an adjudicator may not be a function of the verifier under test, or the evaluation is circular.

**Performance requirements**
- Eval-set build **≤ 60s**; a 200-case set scores within Story 3's 120s budget.
- Interval computation method named in the artefact (Wilson preferred for small n and 0/40 cases); it must not be chosen silently.

**Reliability requirements**
- **Error handling:** a construction-time self-check failure blocks the set from shipping; a partial set is never published.
- **Timeout behaviour:** adjudication exceeding its budget marks a case undecided → excluded and published, not defaulted to `rejected`.
- **Retry strategy:** none for construction; a mutation generator that produces a colliding id must be fixed, not retried.
- **Graceful degradation:** if adjudication is unavailable, the affected cases are excluded and the exclusion count is published — the set never ships with invented labels.

**Task definition**
```json
{ "goal": "Rebuild the red-team set to span at least three failure classes with per-class rates",
  "deliverables": [
    { "name": "Extended data/eval/redteam-fabricated.json with classId per case", "format": "json" },
    { "name": "Mutation generators for wrong-number, wrong-collection, truncated, near-miss", "format": "source" },
    { "name": "Construction-time containment self-check and duplicate-id check", "format": "test" },
    { "name": "Per-class rate + Wilson interval publication in the artefact", "format": "source" } ],
  "successCriteria": [
    { "text": "Group-by over the set returns >= 4 distinct expectedReason values with no class > 50%", "verificationKind": "command_exit_0", "verificationSpec": "group-by over data/eval/redteam-fabricated.json" },
    { "text": "Per-class rates and intervals appear in the published artefact", "verificationKind": "file_exists", "verificationSpec": "data/benchmark/vs-search.json perClass section" },
    { "text": "A mutation that folds to the real text is rejected at build time", "verificationKind": "test_passes", "verificationSpec": "eval construction self-tests" },
    { "text": "Set carries a content hash recorded in the artefact", "verificationKind": "test_passes", "verificationSpec": "eval hashing self-test" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** changing the verifier; adding a new failure class the verifier has no behaviour for, unless the expectation is `unverifiable`.

---

### Story 6: Strip every unmeasured claim from README, specs, and demo output

**Epic** E-1 · **Priority** Must · **Size** S · **RICE** 32.4 · **Risk** Medium · **Spec ref** backlog 1.6, R-1, R-11

**Story statement**
*As* a judge comparing the README against the committed tree, *we want* every numeric claim to be either produced by a recorded artefact or pinned to a command, *so that* the repository never overstates itself — including the interim period before Story 3 lands, where the honest state is to say nothing.

**INVEST**
- **I** — refines Story 3's output; standalone value as an interim control even if 1.3 slips.
- **N** — whether claims are literals or command-pinned, and which files are in scope, are negotiable.
- **V** — the cheapest structural defence against R-1 recurring.
- **E** — under a day once the checker exists.
- **S** — S.
- **T** — `bun run check:docs` exit code is decidable.

**Acceptance criteria (Given/When/Then)**

```
Scenario: No document asserts a rate that no execution produced
  Given every markdown file, every CLI string, and the demo output
  When "bun run check:docs" runs
  Then it FAILS on any numeric claim about detection rate, accuracy, test count,
      gate count, or dependency count that is not produced by an artefact in the
      COMMITTED tree
  And the failure names the file, the line, the exact claim, and the artefact that
      would back it

Scenario: Interim state before Story 3 lands
  Given the recorded system arm does not yet exist
  When README, specs, and "bun run demo" output are read
  Then no detection rate is stated at all
  And the artefact prints the measured FTS5 baseline only, explicitly labelled as the
      only measured arm
  And the demo prints the measured figure, or prints none

Scenario: A correct-today but unbacked number fails anyway
  Given a hand-maintained claim such as "516 tests" while the committed tree differs
  When the check runs
  Then it FAILS and prints the committed figure beside the stale claim
  And a claim pinned to a command is exempt from the literal ban but NOT from the
      staleness check
```

**Edge cases**
- Numbers inside fenced code blocks vs. prose (code blocks that print a command's output are pinned, not banned).
- ADRs may retain historical numbers **if** marked as-at-date and clearly not a current claim.
- Version strings, hashes, and licence years are exempt.
- Arabic-Indic digits (٠١٢) vs. ASCII must both be detected.
- A claim split across two files (README says X, spec says Y) — the check must catch the disagreement, not each in isolation.
- A claim that is correct but unmeasurable in CI (requires a network arm) — it must be pinned to an artefact with a hash, or removed.

**Security acceptance criteria**
- No secret, token, or internal key appears in any document or CLI string.
- No claim may imply coverage of quarantined corpus records (R-6 honesty).
- The checker's own failure output must not print file contents beyond the offending line.

**Performance requirements**
- `check:docs` **≤ 20s**; it runs on every CI run, so cost matters.
- It must read the **committed** tree (`git show HEAD:<path>` or an equivalent), not the working tree, so an uncommitted edit cannot make the check pass.

**Reliability requirements**
- **Error handling:** failure names the file so the fix is a single edit; the check never auto-modifies documents.
- **Timeout:** a hung file read fails the check by name, not by silence.
- **Retry:** none.
- **Graceful degradation:** if an artefact is missing, the claim is treated as unbacked and fails — the checker never skips a file it cannot read.

**Task definition**
```json
{ "goal": "Make every numeric claim in the repository checkable against a committed artefact",
  "deliverables": [
    { "name": "Claim extraction and backing-artefact verification in the docs gate", "format": "source" },
    { "name": "Interim removal of all unmeasured detection-rate claims", "format": "markdown" },
    { "name": "Demo output printing the measured figure or none", "format": "source" } ],
  "successCriteria": [
    { "text": "check:docs fails on an unbacked numeric claim and names file+line", "verificationKind": "test_passes", "verificationSpec": "docs-claims self-tests with a planted stale claim" },
    { "text": "check:docs passes on the committed tree", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" },
    { "text": "The docs gate count and the committed gate count agree", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** rewriting prose that makes no numeric claim; removing historical context that is clearly dated.

---

### Story 7: Standalone `specs/adr/ADR-01..ADR-11.md` with resolvable citation paths

**Epic** E-7 · **Priority** Must · **Size** M · **RICE** 4.4 · **Risk** Low · **Spec ref** backlog 1.7, R-11

**Story statement**
*As* a judge who greps `ADR-03` — the single most-cited authority in the codebase, *we want* a standalone, resolvable document stating context, decision, rationale, consequences, and status, *so that* our most-cited justification is findable rather than folklore.

**INVEST**
- **I** — depends only on Story 1; no story blocks on it.
- **N** — file naming, whether they are split or one file, and how much prose each carries are negotiable.
- **V** — findability of the authority layer; low cost, permanent credibility.
- **E** — 1–2 days of writing plus a checker.
- **S** — M.
- **T** — a grep-resolves check is decidable.

**Acceptance criteria (Given/When/Then)**

```
Scenario: The most-cited authority resolves
  Given a judge grepping "ADR-03" at the repository root
  When the grep runs
  Then it matches specs/adr/ADR-03.md
  And the file states Context, Decision, Rationale, Consequences, Status, and Date
  And the same holds for ADR-01 through ADR-11

Scenario: Every citation in code resolves to a path
  Given the ~30 source files citing an ADR identifier
  When the citation check enumerates them
  Then every cited identifier has a standalone file
  And every in-code reference names a resolvable path
  And an unresolved citation FAILS the check, naming file and line

Scenario: The ADR set is internally consistent with the tree
  Given the eleven ADRs plus ADR-12..ADR-16
  When "bun run check:docs" runs
  Then no ADR states a gate count, test count, or dependency count that the committed
      tree contradicts
  And no rule is stated with two different wordings in AGENTS.md and an ADR (§17)
```

**Negative / abuse scenarios**
```
Scenario: A citation with no path is rejected
  Given a code comment citing "ADR-01 §3" with no file path
  When the citation check runs
  Then it FAILS
  And the fix required is to add the path, not to relax the check
```

**Edge cases**
- **Supersession:** a superseded decision must say so and link to its successor, and the successor must link back.
- **Renumbering** — a renumber is a breaking change and must be caught by the citation check.
- A rule restated with different wording in two files (§17 violation) must be reported as a duplication, not silently accepted.
- An ADR referencing a file that is later deleted — dangling reference check.
- A citation inside a code block or comment inside a string literal — must still be found.
- ADR-12..16 are already accepted in prose; they must land as files too, or the set is half-resolvable.

**Security acceptance criteria**
- No secret, API key, or internal credential in any ADR.
- No corpus text reproduced in an ADR example beyond what the licence permits.
- No ADR may present a religious ruling or a grade as mizan's own (§15) — an ADR that does so is rejected.

**Performance requirements**
- Citation check **≤ 10s**; it may be folded into `check:docs`.

**Reliability requirements**
- **Error handling:** failure names file and line for every unresolved citation in one pass, not one at a time.
- **Timeout:** a hung filesystem read fails the check by name.
- **Retry:** none.
- **Graceful degradation:** if a cited file is missing, that is a hard failure (an ADR that resolves to nothing is the exact defect being fixed).

**Task definition**
```json
{ "goal": "Make ADR-01..ADR-11 standalone and findable, and make code citations resolvable",
  "deliverables": [
    { "name": "specs/adr/ADR-01.md .. ADR-16.md", "format": "markdown" },
    { "name": "ADR citation checker in the docs gate", "format": "source" },
    { "name": "Repointed code comments citing resolvable paths", "format": "source" } ],
  "successCriteria": [
    { "text": "grep ADR-03 resolves to a standalone file", "verificationKind": "file_exists", "verificationSpec": "specs/adr/ADR-03.md" },
    { "text": "No in-code citation lacks a resolvable path", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" },
    { "text": "A planted dangling citation fails the check", "verificationKind": "test_passes", "verificationSpec": "ADR citation self-test" },
    { "text": "No ADR contradicts the committed tree's gate or dependency count", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** changing any decision; adding new ADRs beyond 12–16.

---

### Story 8: Lead with the badge, demote retrieval

**Epic** E-3 · **Priority** Must · **Size** S · **RICE** 32.4 · **Risk** Low · **Spec ref** backlog 1.8, ADR-14

**Story statement**
*As* a judge who watches for 60 seconds, *we want* the computed `VERIFIED`/`REJECTED` verdict to be the first rendered element with the source text directly beneath it, and retrieval internals demoted behind an explicit opt-in, *so that* the eye lands on the differentiator instead of on "a search box with extra steps".

**INVEST**
- **I** — no blockers by design; explicitly independent of Story 3 so the presentation fix is not hostage to the measurement fix.
- **N** — the exact demotion mechanism (collapse, flag, second screen) is negotiable.
- **V** — cheapest item with the largest effect on the exact feedback received.
- **E** — under a day.
- **S** — S.
- **T** — first rendered line is decidable from a captured transcript.

**Acceptance criteria (Given/When/Then)**

```
Scenario: The verdict is the first thing rendered
  Given "bun run demo" and a captured terminal transcript
  When the first rendered element is inspected
  Then it is the computed verdict (VERIFIED / REJECTED / UNVERIFIABLE) for the answer
  And the cited source record and the quoted text appear directly beneath it
  And retrieval internals (query, candidates, BM25 scores, RRF fusion) appear only in a
      demoted provenance section, behind a deliberate opt-in

Scenario: The 60-second look lands on the differentiator
  Given a field-literate judge who has not read the README
  When they watch a single demo run
  Then within 60 seconds they can state what the product computes and what distinguishes
      it from a search tool
  And the demo names the gates it satisfies (G-1..G-7) as provenance, not decoration
  And no detection rate is printed that is not produced by a recorded artefact

Scenario: Failure modes occupy the same first-line position
  Given the provider is unavailable, or the corpus is missing, or verification times out
  When the demo runs
  Then the honest degradation state is printed in the same first-line position
      ("model unavailable", "no sources found", "unverifiable")
  And it never prints a canned answer, a cached prior verdict, or a mock
  And it never prints a percentage on the verdict surface (ADR-16)
  And the process still exits 0 for an honest degradation, reserving non-zero for an
      integrity failure
```

**Edge cases**
- **80-column terminal** — the badge line must not wrap into the next element's space.
- **`NO_COLOR` / non-TTY** — the badge must remain legible as plain text and must not emit ANSI when piped to a file.
- **`unverifiable` is not `REJECTED`** — the badge must be visually and semantically distinct; a reader must not read abstention as a finding of fabrication.
- **Arabic corpus text in a terminal** — see Story 14; the badge must remain the first line even if the quote renders imperfectly.
- **Multiple claims in one answer** — the top-level verdict is per-claim; the header must state which claim it is reporting and never aggregate two claims into one green badge.
- **Transcript determinism** — repeated runs produce a byte-identical `data/transcript.json` (checked in CI).

**Security acceptance criteria**
- **Terminal escape injection:** corpus text or a question containing ANSI escape sequences must not be able to rewrite the screen, clear lines, or hide the verdict. Control characters must be escaped or stripped, and a test must plant an escape sequence in a quote.
- **§13 log hygiene:** the *persisted* trace and ledger carry `questionHash` only. The *display* may show the quote — that is the product — but nothing displayed may be written back to a log, trace, or ledger.
- **No raw-HTML sink (Rule 11):** any HTML/markdown rendering of the quote is a text node; `innerHTML`-equivalent is forbidden and G-2 must stay green.
- **No secrets** in the banner, and the demo must not print an API key even when one is present in the environment.
- **No unmeasured claim** may appear anywhere in demo output (ties to Story 6).

**Performance requirements**
- Demo completes **≤ 3s warm**, **≤ 10s cold**, with **no network call** and no key.
- Transcript generation ≤ 5s and byte-identical run to run.

**Reliability requirements**
- **Error handling:** the demo degrades to an honest state and exits 0; an integrity failure (ledger write failure, attestation mismatch) exits non-zero loudly and shows no verdict.
- **Timeout behaviour:** provider timeout → `model unavailable` in the first-line position within the 30s contract; the demo must not hang.
- **Retry strategy:** none visible to the user; a retry that would change the verdict is forbidden.
- **Graceful degradation:** every §16 row has a rendered first-line representation, and the transcript fixture covers all seven rows.

**Task definition**
```json
{ "goal": "Render the computed verdict first and demote retrieval below the pipeline",
  "deliverables": [
    { "name": "apps/cli demo render order (verdict → source+quote → provenance)", "format": "source" },
    { "name": "Demoted provenance section behind an opt-in", "format": "source" },
    { "name": "Transcript fixture covering all seven §16 degradation rows", "format": "json" } ],
  "successCriteria": [
    { "text": "The first rendered line of the demo is the verdict", "verificationKind": "test_passes", "verificationSpec": "apps/cli demo render-order tests" },
    { "text": "All seven degradation rows render in the first-line position", "verificationKind": "test_passes", "verificationSpec": "degradation transcript tests" },
    { "text": "An ANSI escape planted in corpus text cannot rewrite the screen", "verificationKind": "test_passes", "verificationSpec": "terminal-escape injection self-test" },
    { "text": "G-2 (no raw HTML) and the §13 log-hygiene gate stay green", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** changing what the verdict *is*; adding new claims to the demo.

---

## Sprint 2: Convert the gap into product

> **Sprint-wide constraint (ADR-16, AGENTS.md §10 and §15):** correction and relevance emit a **discrete state plus a located span** — never a percentage, confidence bucket, severity, or weighted trust score. Any fuzzy figure stays in the display-only diagnostics module that `verify.ts` is forbidden to import; G-1 enforces the boundary. This applies to every story in Sprint 2 without exception.

### Story 9: Correction surface (ST3) from the existing longest-run diagnostic

**Epic** E-5 · **Priority** Should · **Size** M · **RICE** 5.6 · **Risk** Medium · **Spec ref** backlog 2.1, R-14, ADR-16

**Story statement**
*As* a reader who received a `REJECTED` citation, *we want* the product to show where the canonical text probably is, *so that* the answer is actionable instead of a dead end — matching IslamicEval 2026 ST3 and HalluScoring's "find the truth", where the field leader scores 66.56%.

**INVEST**
- **I** — depends on Story 3's contract; uses code that already exists.
- **N** — span selection strategy, length, and presentation are negotiable.
- **V** — nearest and cheapest value-add; the 60-char longest-run span is already computed and deliberately hidden.
- **E** — 1–2 weeks.
- **S** — M.
- **T** — measurable against the 66.56% reference on a stated method.

**Acceptance criteria (Given/When/Then)**

```
Scenario: A rejected claim returns a located canonical span
  Given a claim whose quote is absent from the cited record
  When the verdict is produced
  Then the output includes a located span in the canonical record, identified by
      record id and character offsets
  And the span is labelled as a location, never as a correction guarantee
  And the verdict itself remains REJECTED — correction never upgrades a verdict

Scenario: No number appears on the output surface
  Given any corrected output
  When it is rendered
  Then it contains no percentage, confidence value, severity value, or weighted score
  And the verdict badge remains a discrete exact/none state (AGENTS.md §10)
  And the fuzzy figure, if any, exists only in the display-only diagnostics module

Scenario: Correction is measured against a stated reference
  Given a comparable set of rejected citations
  When the correction surface is evaluated
  Then the result is published beside the 66.56% correction reference (BurhanAI,
      IslamicEval 2025 ST1C) with the method difference stated
  And the measurement uses span containment, not a similarity score, as its metric

Scenario: The diagnostics boundary is intact
  Given packages/mizan-verify
  When gate G-1 runs
  Then it passes and verify.ts still cannot import src/diagnostics/
  And no import path from the verdict path to the diagnostics module exists
```

**Negative / abuse scenarios**
```
Scenario: No overlap at all
  Given a fabricated quote sharing no contiguous run with any candidate record
  When correction runs
  Then no span is emitted and the honest state "no located text" is shown
  And an empty string is never presented as a location
  And the verdict remains REJECTED

Scenario: Multiple equally-long candidate spans
  Given two candidate spans of equal length
  When correction selects one
  Then the tie-break is deterministic and documented
  And the selection is byte-identical across repeated runs
```

**Edge cases**
- **Span at a record boundary** (0..n, n..len) — offsets must be valid or the span is dropped.
- **Span length cap** — a pathological longest run must be capped and the cap stated, not silently truncated into a misleading location.
- **A span that crosses a normalisation fold boundary** — the span must be reported in the canonical (folded) coordinate space, and the mapping back to display text must be defined.
- **Very short overlaps (1–3 chars)** — a 2-character shared run is noise, not a location; a minimum span length must be declared.
- **A quote contained in *multiple* records** — the cited record is the scope; correction must not wander to a different collection without saying so.
- **Truncated/UTF-16 boundary** — Arabic combining marks mean a naive offset split can produce invalid text.

**Security acceptance criteria**
- **No raw-HTML sink (Rule 11):** the span is rendered as a text node; G-2 stays green.
- **§13:** no corpus text enters any log, trace, or ledger entry because of this feature.
- **Untrusted content:** the span originates from fetched corpus text and is rendered as text, never as markup or a terminal escape sequence.
- **No score reintroduced:** any implementation that exposes a similarity percentage on the output surface fails the Story 9 test suite and is a §10 breach.

**Performance requirements**
- Correction adds **≤ 50ms p95** per rejected claim; it must not require a second corpus pass over the whole index.
- Offsets and record lookup are O(1) after retrieval.

**Reliability requirements**
- **Error handling:** correction failure degrades to plain `REJECTED` with a stated reason; it must never surface a partial or guessed span.
- **Timeout behaviour:** correction exceeding 50ms budget is dropped with a named reason, verdict preserved.
- **Retry strategy:** none.
- **Graceful degradation:** the product is fully usable with correction disabled; the verdict path has no dependency on it.

**Task definition**
```json
{ "goal": "Surface a located canonical span on REJECTED without introducing a score",
  "deliverables": [
    { "name": "Correction span computation over the existing longest-run diagnostic", "format": "source" },
    { "name": "CLI rendering of record id + offsets + span as a text node", "format": "source" },
    { "name": "No-score assertion test over the output surface", "format": "test" } ],
  "successCriteria": [
    { "text": "A rejected claim returns a located span", "verificationKind": "test_passes", "verificationSpec": "correction surface tests" },
    { "text": "Output contains no percentage, confidence, or severity value", "verificationKind": "test_passes", "verificationSpec": "no-score self-test" },
    { "text": "G-1 still forbids verify.ts from importing diagnostics", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" },
    { "text": "No span emitted when there is no overlap", "verificationKind": "test_passes", "verificationSpec": "no-overlap negative test" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** changing the verdict rule; word-level matn diffing (deferred, C-1 adjacent); any similarity score on the output.

---

### Story 10: Relevance check (ST4) so a non-answer cannot badge green

**Epic** E-6 · **Priority** Should · **Size** L · **RICE** 3.15 · **Risk** High · **Spec ref** backlog 2.2, **R-3 (Critical)**, ADR-16

**Story statement**
*As* a judge making a religious decision from the output, *we want* a quote that is genuinely contained in the cited record but does not answer the question to be visibly distinguished from one that does, *so that* a confident green on a non-answer — a false `verified` in spirit, the worst failure mode in the system — cannot occur.

**This is the one pathway to a misleading green that is currently unguarded.** Interim rule, in force until this ships: every published claim is scoped to *"the quote is contained in the cited record"*, never *"the answer is correct"*.

**INVEST**
- **I** — needs Story 3 and Story 5 (the relevance cases must be scored in the same artefact).
- **N** — the relevance method (deterministic lexical/structural vs. a second ranker), thresholds, and presentation are negotiable.
- **V** — closes the last known pathway to a misleading green; also a scored market subtask.
- **E** — 3–5 weeks; highest uncertainty in the plan.
- **S** — L.
- **T** — a verified-but-irrelevant case **must fail the suite**; that is decidable.

**Acceptance criteria (Given/When/Then)**

```
Scenario: A verified-but-irrelevant case FAILS the suite
  Given a case whose quote is genuinely contained in the cited record
      but which does not answer the question
  When the pipeline runs
  Then the case FAILS the suite; it does not pass green
  And the published artefact records it in a dedicated relevance class
  And the containment verdict is still reported, with relevance reported separately

Scenario: Relevance is a discrete state, never a score
  Given any run
  When relevance is reported
  Then it is one of {answers, doesNotAnswer, undetermined}
  And no probability, confidence, or percentage accompanies it
  And "undetermined" is never collapsed into "answers" and is rendered as a distinct badge
  And a claim that is contained but undetermined is never presented as a fully green answer

Scenario: A retrieval miss is an honest state
  Given a question for which no source is found
  When the pipeline runs
  Then the output is "no sources found" with a stated reason
  And it is never a silent blank, a guess, or a cached answer

Scenario: A second ranker being unavailable is disclosed
  Given semantic ranking is configured but the backend is unreachable
  When the run completes
  Then metadata contains semanticRanking: "unavailable"
  And the result is never presented as full-fidelity retrieval
  And the verdict path is unaffected

Scenario: The relevance check cannot become a back door to verified
  Given the relevance checker throws, times out, or is disabled
  When the pipeline runs
  Then no claim is presented as a fully answered, fully verified answer
  And the fail-closed default is undetermined, not answers
  And G-1, G-6 and G-7 still pass
```

**Negative / abuse scenarios**
```
Scenario: The relevance checker is unavailable
  Given the checker is disabled or errors
  When a contained quote is verified
  Then the output shows containment + relevance undetermined
  And the absence of relevance is disclosed, not hidden
  And a green-without-caveat is impossible
```

**Edge cases**
- **Empty or whitespace-only question** — relevance is `undetermined`, never `answers`.
- **Arabic question vs Arabic quote** — comparison on folded text, not identity; a question differing only by diacritics is not a mismatch.
- **Negation in the question** ("which is *not*…") — a naive term-overlap check will call this `answers` wrongly; this case must be in the eval set.
- **A quote that answers a *different* question** — must be `doesNotAnswer`.
- **A long claim spanning several records** — relevance is reported per claim, never aggregated into one green.
- **A question whose answer is "not found in this corpus"** — `no sources found`, distinct from `doesNotAnswer`.
- **Multi-language question** — a question in English against an Arabic record must not silently pass.

**Security acceptance criteria**
- **No ML or similarity scorer in the verdict path (W-5, CWE-345):** a learned scorer or a fuzzy similarity in the path to a green badge is a defect, and G-1/G-7 must still pass.
- **Relevance must not construct `verified`:** only `verify.ts:107` may, and relevance is a separate, downstream state.
- **Untrusted input:** question and quote cross the trust boundary through a declared schema; a malformed question is `undetermined`, not a crash.
- **§13:** relevance decisions are reported as states, not as content dumps; no question text in traces.
- **No score surface (ADR-16):** a relevance percentage anywhere on the output fails the suite.

**Performance requirements**
- Relevance adds **≤ 100ms p95** per claim; **no network call, no model** in the default path.
- It must not add a second full-corpus scan per question.

**Reliability requirements**
- **Error handling:** any relevance failure → `undetermined` + disclosure; never a crash, never a green.
- **Timeout behaviour:** a relevance timeout → `undetermined` with a named reason; the containment verdict is preserved and still shown.
- **Retry strategy:** none; a retried relevance call is a nondeterminism defect.
- **Graceful degradation:** the product is fully usable with relevance unavailable, provided every claim is then scoped to containment. **No broader accuracy claim may be published while relevance is unavailable.**

**Task definition**
```json
{ "goal": "Prevent a contained-but-non-answering quote from presenting as a full green answer",
  "deliverables": [
    { "name": "Deterministic relevance state computation (no model, no network)", "format": "source" },
    { "name": "Distinct badge state for undetermined", "format": "source" },
    { "name": "Verified-but-irrelevant case that FAILS the suite", "format": "test" },
    { "name": "Relevance class in the published artefact", "format": "json" } ],
  "successCriteria": [
    { "text": "A verified-but-irrelevant case fails the suite", "verificationKind": "test_passes", "verificationSpec": "relevance eval with a planted non-answer" },
    { "text": "Relevance is a discrete state with no score anywhere on the surface", "verificationKind": "test_passes", "verificationSpec": "no-score self-test" },
    { "text": "Relevance unavailable degrades to undetermined, never to answers", "verificationKind": "test_passes", "verificationSpec": "checker-unavailable negative test" },
    { "text": "G-1, G-6, G-7 still pass after the change", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** ML answer selection (C-3/W-5); matn/isnad decomposition; changing containment.

---

### Story 11: Publish the comparison table against BurhanAI, HUMAIN, and CiteGuard

**Epic** E-1 · **Priority** Should · **Size** S · **RICE** 18.1 · **Risk** Medium · **Spec ref** backlog 2.3, S-5

**Story statement**
*As* a judge comparing mizan to published numbers, *we want* a table that is generated from our own recorded artefact, with each peer's method difference stated beside their figure, *so that* our claim is not read as like-for-like against 88.6% / 68.1% / 66.56% / 54.6–65.9% — and so that an unmeasured 100% is replaced by a measured one.

**INVEST**
- **I** — depends on Story 4 (needs a hard arm) and Story 3 (needs a measured figure).
- **N** — which peers to include, the table format, and the depth of method annotation are negotiable.
- **V** — the artefact the whole cycle exists to produce.
- **E** — under a day once the artefact is stable.
- **S** — S.
- **T** — a CI diff between the generated table and the committed table.

**Acceptance criteria (Given/When/Then)**

```
Scenario: The table is generated, never hand-maintained
  Given the benchmark artefact data/benchmark/vs-search.json
  When the comparison table is produced
  Then mizan's own cells are read from the artefact
  And a CI step diffs the generated table against the committed table
  And a mismatch FAILS the build naming the differing cell

Scenario: Method differences are stated beside every peer number
  Given peer figures (BurhanAI 88.6% span accuracy / 66.56% correction, HUMAIN
      54.6–65.9%, CiteGuard 68.1% with a 69.2% human ceiling, SPECTER2 0% on CiteME)
  When the table is rendered
  Then each figure carries the method difference beside it: corpus, task, metric
      definition, and human ceiling where published
  And no cell invites a like-for-like reading

Scenario: An unmeasured cell is explicit
  Given a metric mizan has not measured, or an arm that was unavailable
  When the table is rendered
  Then the cell reads "not measured" or "unavailable" with a reason
  And it never carries a stale number from a previous run

Scenario: Our own figure is published with its uncertainty
  Given the recorded system arm
  When mizan's cell is rendered
  Then it carries the 95% confidence interval, the case count, the class mix, and the
      scope statement (containment, not answer correctness)
  And falseVerifiedCount is shown beside it
```

**Negative / abuse scenarios**
```
Scenario: A peer figure with no published method
  Given a number that cannot be traced to a method
  When the table is rendered
  Then the cell is marked "method not published" rather than presented as comparable
```

**Edge cases**
- **Metric mismatch** — accuracy vs. macro-F1 vs. label accuracy vs. span accuracy are different quantities; the metric name must appear in the cell, not in a footnote.
- **Artefact unavailable** (Story 4's arm degraded, or the benchmark not run) — the table must print "not measured" for mizan's row, never reuse the last good run silently.
- **Peer number updated** — a hand-entered peer number is pinned to a source URL and a date; a stale peer date is a CI warning at minimum.
- **Task-2-only comparison** — CiteME/CiteGuard are attribution tasks; mizan is per-claim containment. The table must not present the comparison as equivalent.
- **Arabic-Indic digits** in a source figure.

**Security acceptance criteria**
- No cell may imply coverage of quarantined corpus records.
- No unmeasured claim in any cell (Story 6's checker governs the table too).
- Peer figures are cited with a source; no peer number is presented without provenance, and no scraped content is embedded beyond the figure and its citation.

**Performance requirements**
- Table generation **≤ 10s** from the artefact; runs in the docs-check step.

**Reliability requirements**
- **Error handling:** missing artefact → explicit "not measured" table with a non-zero CI signal, never a stale render.
- **Timeout:** the generator fails the step by name rather than emitting a partial table.
- **Retry:** none.
- **Graceful degradation:** the table is documentation; its absence must not affect the pipeline or CI's structural gates.

**Task definition**
```json
{ "goal": "Generate the published comparison table from the recorded artefact with method differences",
  "deliverables": [
    { "name": "Table generator reading data/benchmark/vs-search.json", "format": "source" },
    { "name": "Peer-figure register with source URL, date, and method annotation", "format": "markdown+json" },
    { "name": "CI diff step failing on a stale cell", "format": "source" } ],
  "successCriteria": [
    { "text": "Table regenerates deterministically from the artefact", "verificationKind": "command_exit_0", "verificationSpec": "table generation script" },
    { "text": "A hand-edited cell fails the CI diff", "verificationKind": "test_passes", "verificationSpec": "table staleness self-test" },
    { "text": "Every peer cell carries a method annotation or 'method not published'", "verificationKind": "test_passes", "verificationSpec": "method annotation self-test" },
    { "text": "An unmeasured cell renders as 'not measured', never a stale number", "verificationKind": "test_passes", "verificationSpec": "missing-artefact negative test" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** new measurements of peer systems; claiming comparability we cannot support.

---

### Story 12: Quarantine-coverage reporting and a visible no-sources-found reason

**Epic** E-2 · **Priority** Should · **Size** M · **RICE** 3.6 · **Risk** Low · **Spec ref** backlog 2.4, R-6

**Story statement**
*As* a user whose answer lives in one of the 41.7% quarantined hadith records, *we want* an explicit, per-collection coverage report and a stated reason on every miss, *so that* the quarantine is an honest disclosed integrity boundary rather than a silent recall failure.

**INVEST**
- **I** — depends on Story 2 only; independent of the measurement chain.
- **N** — report format, granularity, and where it is surfaced are negotiable.
- **V** — turns an integrity win into an honest product state, and directly comparable to Sanad's 617k corpus.
- **E** — 1–2 weeks.
- **S** — M.
- **T** — the report's counts are checkable against the ledger.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Per-collection quarantine coverage is published
  Given the corpus ledger and the 15,026 quarantined hadith rows
  When the coverage report is generated
  Then it reports, per collection: total rows, quarantined rows, and coverage percentage
  And the aggregate 41.7% figure is printed with its denominator
  And the report is reproducible from the committed ledger

Scenario: A corpus miss is never a silent blank
  Given a question for which retrieval returns nothing
  When the pipeline reports
  Then the output states "no sources found" with the reason
  And it distinguishes "not in corpus", "in corpus but quarantined", and "retrieval failed"
  And it never presents a miss as evidence of fabrication

Scenario: A 100%-quarantined collection is reported honestly
  Given a collection where every row is quarantined
  When coverage is reported
  Then that collection is listed with 0% coverage
  And questions against it return "no sources found — collection quarantined"
```

**Negative / abuse scenarios**
```
Scenario: The report is computed from a stale index
  Given the committed ledger and the database disagree
  When the coverage report is generated
  Then the run FAILS and names the mismatch
  And no report is published from the stale side
```

**Edge cases**
- A collection with zero rows (0/0 — must not publish 0% or 100%).
- Adjacent rows quarantined for different reasons (the report must group by reason, not just count).
- A row quarantined and later re-admitted (W-3 forbids silent re-admission; the ledger must record the transition).
- A collection present in the registry but absent from the corpus.
- The report itself must not become a full-table scan in the answer path.

**Security acceptance criteria**
- The coverage report carries counts, collection names, and hashes — never corpus text (§13).
- Quarantine decisions must be auditable **by recorded reason**, not by inference from absence.
- No corpus text is emitted in the `no sources found` reason; the reason is a category plus an id.

**Performance requirements**
- Coverage report **≤ 30s** over the corpus, run off the answer path.
- The answer path must not degrade measurably when a collection is 100% quarantined.

**Reliability requirements**
- **Error handling:** a ledger/DB mismatch is a named failure; no partial report.
- **Timeout behaviour:** report generation timing out yields no report and a non-zero exit, never a truncated one.
- **Retry:** none.
- **Graceful degradation:** with the report unavailable, the answer path still returns `no sources found` with the §16 reason; the report is documentation, not a gate on the answer.

**Task definition**
```json
{ "goal": "Publish per-collection quarantine coverage and a visible no-sources-found reason",
  "deliverables": [
    { "name": "Coverage report generator from the committed ledger", "format": "source" },
    { "name": "Typed no-sources-found reasons (not-in-corpus, quarantined, retrieval-failed)", "format": "source" },
    { "name": "Ledger/DB mismatch check", "format": "test" } ],
  "successCriteria": [
    { "text": "Per-collection coverage is published with the aggregate and its denominator", "verificationKind": "file_exists", "verificationSpec": "generated coverage report" },
    { "text": "Each miss category surfaces a distinct stated reason", "verificationKind": "test_passes", "verificationSpec": "no-sources-found reason tests" },
    { "text": "A ledger/DB mismatch fails the report by name", "verificationKind": "test_passes", "verificationSpec": "mismatch negative test" },
    { "text": "Report carries no corpus text", "verificationKind": "test_passes", "verificationSpec": "AGENTS §13 log-hygiene gate" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** re-admitting quarantined rows (W-3); corpus expansion; changing quarantine policy.

---

### Story 13: Live run-ledger evaluation replacing replay and placeholder timings (MIZ-110)

**Epic** E-1 · **Priority** Should · **Size** M · **RICE** 3.5 · **Risk** Medium · **Spec ref** backlog 2.5, S-3

**Story statement**
*As* a judge checking whether the badge on screen was computed and recorded, *we want* ledger rows carrying timings measured from real runs, with a write failure marking the run untrusted, *so that* operational figures are measured rather than asserted — and the chain that backs the central claim is audited by a command a judge can run.

**INVEST**
- **I** — depends on Story 3's contract; independent of the baseline arm.
- **N** — sampling policy, retention, and whether the audit joins CI are negotiable.
- **V** — the run chain is what backs "the badge was computed, not asserted".
- **E** — 1–2 weeks.
- **S** — M.
- **T** — `bun run verify:runs` exit code and message are decidable.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Ledger rows carry measured timings
  Given a real run of the CLI
  When the run completes
  Then the ledger row carries timings measured from that run
  And no row is a replay or a placeholder
  And rows are attributable to a commit hash and a corpus snapshot hash

Scenario: A ledger write failure marks the run untrusted
  Given the ledger cannot be written
  When the run completes
  Then the run is marked untrusted and the failure is loud
  And the system never proceeds as if the run were recorded
  And no verdict is presented as recorded when it was not

Scenario: Traces carry hashes, never content
  Given any run trace, log line, or ledger entry
  When it is inspected
  Then it contains questionHash and no question text, no corpus text, and no secrets
  And the check is a gate, not a convention

Scenario: The chain is auditable by a judge
  Given data/runs.jsonl
  When "bun run verify:runs" is executed
  Then it exits 0 when the chain is intact and prints its entry count
  And on any alteration, removal, or reordering it exits non-zero and names the exact
      entry index
  And it is reachable from CI, not only from a test
```

**Negative / abuse scenarios**
```
Scenario: A torn tail is a human decision
  Given a process killed mid-write leaves a partial final entry
  When the audit runs
  Then it reports torn_tail and states that entries before it are still verifiable
  And it refuses to auto-repair
  And re-running the demo does NOT clear the condition

Scenario: A replay attempt
  Given an operator re-runs to "fix" a failing entry
  When the audit runs
  Then the attempt is detectable and named
  And the instruction "do not repair by re-running" is printed
```

**Edge cases**
- **Torn tail** (partial JSONL entry) — named, not repaired.
- **Out-of-order or removed entry** — `prevHash` chain break names the index.
- **Duplicate run id** — must be detected or explicitly permitted and documented.
- **Clock skew / non-monotonic timings** between runs on different machines — must not corrupt the chain; the chain is hash-linked, not time-ordered.
- **A 1000-entry audit** — must stay within the performance budget.
- **A write interrupted between fsync and rename** — the chain must remain either valid or explicitly torn, never silently short.

**Security acceptance criteria**
- **§13 in full:** no PII, question text, corpus text, or secrets in any log line, trace, or ledger entry.
- **Append-only, atomic:** single write + fsync; the chain cannot be rewritten in place.
- **Key handling:** no credential material in a trace; environment values are never serialised.
- **Audit honesty:** the audit command must not overstate what it checked — it proves history was not altered, not that a recorded verdict was correct, and its output must say so.

**Performance requirements**
- Ledger append **≤ 20ms**; audit of 1000 entries **≤ 5s**.
- The append must not be on the critical path of returning a verdict to the user; it is a post-run write whose failure marks the run untrusted.

**Reliability requirements**
- **Error handling:** write failure → untrusted run, loud, never fail-open.
- **Timeout behaviour:** audit timeout → non-zero exit naming the entry it was processing; never a partial pass.
- **Retry strategy:** a write may be retried once for a transient I/O error, and a retried append must be idempotent by run id; a torn tail is never retried.
- **Graceful degradation:** if the ledger is unavailable the run still produces a verdict on screen but is explicitly marked unrecorded; the §16 contract is preserved.

**Task definition**
```json
{ "goal": "Make the run ledger carry measured timings and be auditable end to end",
  "deliverables": [
    { "name": "Measured-timing ledger rows with commit and snapshot hashes", "format": "source" },
    { "name": "Untrusted-run marking on write failure", "format": "source" },
    { "name": "Audit wired into CI (bun run verify:runs)", "format": "config" } ],
  "successCriteria": [
    { "text": "Ledger rows carry measured timings, never replay or placeholder", "verificationKind": "test_passes", "verificationSpec": "ledger timing tests" },
    { "text": "A write failure marks the run untrusted and does not fail open", "verificationKind": "test_passes", "verificationSpec": "ledger write-failure negative test" },
    { "text": "Traces contain questionHash only", "verificationKind": "command_exit_0", "verificationSpec": "AGENTS §13 hygiene gate" },
    { "text": "verify:runs names the exact index of an altered entry", "verificationKind": "test_passes", "verificationSpec": "run-ledger audit tests with planted corruption" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** hosted ledger, sync between machines, user accounts (W-2).

---

### Story 14: Arabic normalisation specification and terminal rendering

**Epic** E-6 · **Priority** Should · **Size** M · **RICE** 6.4 · **Risk** Medium · **Spec ref** backlog 2.6, **R-13**

**Story statement**
*As* a judge reading Arabic output in the terminal they will actually use, *we want* normalisation specified in one published place with index-time and verify-time folding proven byte-identical, and Arabic rendered legibly, *so that* a divergence between the two never masquerades as a working fail-closed verifier.

**Why this matters more than it looks:** a folding divergence shows up as **false rejections**. The operator reads that as the fail-closed verifier working correctly. It is a bug, and it is invisible.

**INVEST**
- **I** — no hard blocker; may start in Sprint 1 if capacity allows, since it de-risks Stories 5, 9, 10.
- **N** — the exact character policy, the spec's location, and the rendering approach are negotiable.
- **V** — the whole benchmark ecosystem (IslamicEval, HalluScoring) is Arabic-first; this is table stakes for credibility with a field-literate judge.
- **E** — 1–2 weeks.
- **S** — M.
- **T** — a differential test asserting byte-identical folding is decidable.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Normalisation follows a published specification
  Given the published normalisation specification
  When any fold occurs, at index time or verify time
  Then it follows that specification exactly: diacritics and tatweel stripped, alef
      unified, ya unified, and a documented policy for zero-width characters
  And the specification is a document a judge can read and check our output against

Scenario: Exactly one module owns normalisation
  Given the repository
  When the source is searched for folding logic
  Then exactly one module implements it (§17)
  And a second implementation is a build failure, not a review comment
  And both the indexer and the verifier import that module

Scenario: Index-time and verify-time folding are byte-identical
  Given the same Arabic input, including diacritics, tatweel, alef/ya variants,
      quranic annotation marks, and zero-width characters
  When it is folded at index time and at verify time
  Then the two folded outputs are byte-identical
  And the differential test runs in CI and fails the build on any divergence

Scenario: Arabic renders legibly in the judge's terminal
  Given an Arabic quote and a terminal of 80 columns
  When the CLI renders the badge, source, and quote
  Then the badge remains the first line and remains legible
  And the quote is not mangled by naive width calculation over combining marks
  And RTL text in an LTR terminal is delimited so it does not reorder the surrounding
      layout
  And a non-TTY / NO_COLOR run produces a byte-identical, escape-free transcript
```

**Negative / abuse scenarios**
```
Scenario: Zero-width characters must not manufacture a false verified
  Given a quote that differs from the cited record ONLY by inserted zero-width
      characters, and a folding policy that strips them
  When containment is evaluated
  Then the behaviour is the one the published specification mandates, and it is pinned by
      a test
  And the specification explicitly states which direction is fail-closed
  And no policy choice silently creates a false "verified"
```

**Edge cases**
- **NFC vs. NFD input** — canonically equivalent Arabic must fold identically.
- **Quranic annotation marks** (U+06D6–U+06ED) and superscript alef (U+0670).
- **Zero-width space/non-joiner/joiner, BOM** (U+200B–U+200F, U+FEFF) — the dangerous direction is *stripping* them, which can turn a differing quote into a contained one.
- **Control characters and ANSI escapes inside corpus text** — must not reach the terminal unescaped.
- **Tatweel (U+0640)** and maximal elongation.
- **Alef variants** (أ إ آ ٱ ا) and **ya variants** (ى ي ىٰ).
- **Width calculation** with combining marks: naive `string.length` overestimates, causing wrapping and misaligned badges.
- **Mixed RTL/LTR** with a Latin collection id and an Arabic quote on the same line.
- **A 40-character cap applied to a folded string whose display length differs** — the cap must be defined in a single coordinate space.

**Security acceptance criteria**
- **Terminal escape injection:** a quote containing ANSI escape sequences must not be able to clear lines, reposition the cursor, or hide the verdict. Control bytes must be escaped or removed, and a planted-escape test must assert the rendered output contains no escape sequence originating from corpus text.
- **No raw-HTML sink (Rule 11)** for any rendered Arabic.
- **§13:** the rendered quote is a display surface; the trace and ledger still carry `questionHash` only.
- **Supply chain / Unicode version pinning:** the folding must be deterministic across Bun versions and platforms; the Unicode data version used must be declared, or a Bun upgrade could silently change verdicts (R-10).

**Performance requirements**
- Folding **≤ 5µs per 1KB**; differential test suite **< 5s**; zero measurable added latency to the answer path.
- The folding table must be precomputed, not rebuilt per call.

**Reliability requirements**
- **Error handling:** an undecodable byte sequence in the input is `unverifiable`, not a crash and not a silent pass.
- **Timeout behaviour:** folding is bounded; an oversized input is rejected by the declared cap with a named reason.
- **Retry strategy:** none; folding is pure and deterministic.
- **Graceful degradation:** if the terminal cannot render Arabic, the badge, the verdict, and the record id still render correctly — the text may show a documented fallback, but the verdict is never sacrificed.
- **Determinism gate:** any folding change re-runs the canonical digest and the full red-team set; **digest movement is a gate failure** (R-10).

**Task definition**
```json
{ "goal": "Publish the normalisation spec, prove index/verify folding is identical, and render Arabic legibly",
  "deliverables": [
    { "name": "Published normalisation specification (single source of truth)", "format": "markdown" },
    { "name": "Differential test: index-time vs verify-time byte-identical folding", "format": "test" },
    { "name": "Terminal rendering with RTL isolation and escaped control characters", "format": "source" },
    { "name": "Zero-width / combining-mark / control-character fixtures", "format": "test" } ],
  "successCriteria": [
    { "text": "A folding divergence fails the differential test", "verificationKind": "test_passes", "verificationSpec": "normalisation differential tests" },
    { "text": "A second folding implementation fails the build", "verificationKind": "test_passes", "verificationSpec": "§17 one-source-of-truth check" },
    { "text": "A planted ANSI escape in corpus text does not reach the terminal", "verificationKind": "test_passes", "verificationSpec": "terminal injection test" },
    { "text": "Arabic transcript is byte-identical in TTY and NO_COLOR modes", "verificationKind": "test_passes", "verificationSpec": "apps/cli transcript snapshot tests" } ],
  "accessNeeded": ["read", "write", "shell"] }
```

**Out of scope:** changing the containment rule; adopting an external Arabic library that would break the verifier's one-dependency invariant.

---

## Cross-Cutting Verification Summary

| Story | Primary verification | Failure visible as |
|---|---|---|
| 1 | `git status --porcelain` empty; `bun run ci` on a fresh clone | a judge finds no gates in history |
| 2 | 10 consecutive green runs per OS; budget-overrun self-test | a red build at demo time |
| 3 | Planted constant arm **fails**; rate moves when the verifier is weakened | a tautological 1.0 (R-1) |
| 4 | G-1 passes; unloadable arm → `unavailable`; suppression self-test | a strawman baseline, or a secret in a log |
| 5 | Group-by ≥4 classes; per-class CI published | a regression test wearing an eval's label |
| 6 | `bun run check:docs` fails a planted stale claim | the docs overpromise (R-11) |
| 7 | `grep ADR-03` resolves; dangling citation fails | the most-cited authority resolves to nothing |
| 8 | First rendered line is the verdict; 7 degradation fixtures | the eye lands on a search box |
| 9 | No-score assertion over the output; no-overlap negative | CWE-345 reintroduced (R-14) |
| 10 | Verified-but-irrelevant case **fails** the suite | a false green (R-3) |
| 11 | Generated table diffed in CI; missing artefact → "not measured" | a stale or overclaimed number |
| 12 | Coverage reproducible from the ledger; mismatch named | a silent recall failure (R-6) |
| 13 | `verify:runs` names the altered index; write failure → untrusted | an unverifiable provenance claim |
| 14 | Differential folding test; planted ANSI escape neutralised | false rejections read as fail-closed working |

## Competitive Feature Comparison (research-driven)

| Capability | Market requirement | Table stakes? | mizan today | Story | Status |
|---|---|---|---|---|---|
| Per-claim verdict vs. a specific record | Track 4 core | **Differentiator** | Implemented (single containment site, G-1/G-6/G-7) | — | Shipped |
| Honest abstention (`unverifiable`) | 6 typed outcomes (Sanad) | Differentiator | Implemented (§16) | — | Shipped |
| Byte-determinism | no competitor claims it | **Differentiator** | Implemented | 13 | Strengthened |
| Machine-checked invariants as a shipped artefact | none found | **Differentiator** | G-1..G-7 exist, unshipped | 1 | **Gap (uncommitted)** |
| Measured (not declared) detection rate | peers publish real numbers | Table stakes | Tautological 1.0 | 3, 6 | **Gap (Critical)** |
| Hard baseline for comparison | SPECTER2 0%, CiteGuard 34–68% | Table stakes | Strawman FTS5 65% | 4 | **Gap** |
| ≥3 failure classes | IslamicEval 2026 ST2 breadth | Table stakes | 1 class (`quote_absent_at_cited_id` ×40) | 5 | **Gap** |
| Correction (ST3) | BurhanAI 66.56%, HalluScoring "find the truth" | Table stakes | Absent (span already computed, hidden) | 9 | Gap (Sprint 2) |
| Relevance (ST4) | scored subtask | Table stakes | Absent | 10 | Gap (Sprint 2) |
| Fragment decomposition (matn/isnad) | **IslamicEval 2026 ST1 — the stated winning move**; absent from *every* system found | **Highest-value differentiator** | Absent | — | Deferred to Sprint 3+ (C-1) |
| Hybrid BM25+dense (RRF) | 2026 table stakes (arriqaaq/ilm ships it) | Table stakes | Lexical only | — | Deferred (C-2); **a recall gap, not a verification gap** |
| Answer selection | HalluScoring 2.1 (best 0.935) | Nice-to-have | Absent | — | Deferred (C-3) |
| Arabic-first surface | ecosystem is Arabic-first | Table stakes | English ASCII CLI | 14 | Gap (Sprint 2) |
| Live evaluation | MIZ-110 | Internal bar | Replay/placeholder timings | 13 | Gap (Sprint 2) |
| **Confidence / severity / trust score** | hadith-verifier, TasnidChain | *Anti-pattern* | Banned by §10/§15 | 9, 10 (as constraints) | **Deliberate non-feature (W-1)** |

**Judgement on coverage.** Every table-stakes item except fragment decomposition, hybrid retrieval, and answer selection is in a planned story. Fragment decomposition (ST1) remains the sharpest available differentiator against all 13 competing teams and is explicitly **deferred, not forgotten** — it is the first candidate for Sprint 3 and this PM recommends it be scoped immediately after Sprint 1 exit, because every story above produces the substrate it needs (a measured arm, a multi-class eval set, and a badge-first surface).

**On the feedback.** "Any search tool could do this" is refuted by Stories 3, 4, 5, and 8 as a *measurement on the record* rather than an argument. It is worth stating plainly for the demo script: the refutation is currently in the architecture, not the evidence, and Sprint 1 exists to move it into the evidence.

## Risk Register (PM view — deltas from the CEO register)

| ID | Risk | Sev | Stories | Mitigation / owner decision |
|---|---|---|---|---|
| R-1 | Tautological headline reaches a judge | **Critical** | 3, 6 | Story 3's planted self-test; until it lands, no rate is stated anywhere |
| R-2 | Red CI at demo time | **Critical** | 2 | Budgeted per-package timeouts; 10-run gate; no test retry |
| R-3 | Relevance unguarded → false green in spirit | **Critical** | 10 | Interim claim scoping to containment is mandatory **today**, independent of the sprint |
| R-4 | Single failure class, CI [89%, 100%] | High | 5 | ≥4 classes, per-class Wilson intervals, set content hash |
| R-5 | Uncommitted tree = unshipped deliverable | High | 1 | First action; clean `git status` is a sprint exit criterion |
| R-6 | 41.7% quarantine is a recall failure | High | 12 | Per-collection coverage + a distinct `no sources found — collection quarantined` |
| R-9 | **The hard baseline beats mizan** | Medium | 4, 11 | **Committed in advance: publish it anyway.** Relocate the claim to the containment gate and ST-level output. Suppression is a self-test failure |
| R-10 | A dependency/corpus change breaks byte-determinism | High | 13, 14 | Canonical digest re-run on any such change; digest movement is a gate failure; Unicode data version pinned |
| R-11 | Docs overstate the committed repository | Medium | 6, 7, 1 | `check:docs` reads the **committed** tree, not the working tree |
| R-12 | New deps enter a repo whose claim is one dependency | Medium | 4 | Separate package + G-1 as the machine-checked control |
| R-13 | Arabic index/verify folding divergence → false rejections | Medium | 14 | Published spec, one owning module (§17), differential test in CI |
| R-14 | Correction reintroduces a similarity percentage | High | 9, 10 | ADR-16: discrete state + located span only; no-score self-test; G-1 boundary |
| **R-15 (new)** | **Sprint 1 is ≈13.5 person-months — over capacity** | **High** | all of Sprint 1 | Minimum shippable slice declared: **1.1 → 1.2 → 1.3 → 1.6 → 1.8**. Do not drop 1.1, 1.3, or 1.6 |
| **R-16 (new)** | **Four stories write `scripts/benchmark/score.ts`'s contract** | Medium | 3, 4, 5, 11, 13 | Contract freezes in `@mizan/core` in Story 3; later stories are additive and decode at the boundary; sequence the gate/benchmark edits rather than parallelising |
| **R-17 (new)** | Stories 1.6/2.3 delete claims that the demo currently prints, which may make the product look *worse* on a 60-second look | Medium | 6, 8, 11 | Story 8 runs independently of 1.3 by design: the badge still leads even when no rate is printed. The honest surface is the product |

## Deferred (named, not planned — per the two-cycle planning limit)

C-1 matn/isnad/claimed-source decomposition (ST1) · C-2 hybrid BM25+dense via RRF · C-3 Arabic-first answer selection · C-4 gates-as-third-party-artifact · W-1..W-6 as specified.

```json
{
  "stories": [
    { "id": "1.1", "number": 1, "title": "Commit the uncommitted deliverable tree", "sprint": 1, "epic": "E-7", "priority": "must", "size": "S", "risk": "low", "rice": 60.0, "riceInputs": { "reach": 10, "impact": 3, "confidence": 1.0, "effortPersonMonths": 0.5 }, "userStory": "As the engineering team shipping the gates that constitute the differentiator, we want the entire working tree including G-7, scripts/benchmark/ and data/benchmark/ to exist in repository history, so that a judge cloning the repository finds the machine-checked invariants.", "acceptanceCriteriaIds": ["AC-1.1-1", "AC-1.1-2", "AC-1.1-3", "AC-1.1-4"], "keyEdgeCases": ["empty commit refused", "CRLF churn on Windows must not be committed as substantive change", "data/corpus.db licence/exclusion decision is a named precondition", "concurrent index.lock", "pre-commit hook mutating the tree", "windows path length"], "securityRequirement": "G-4 gitleaks on the STAGED tree before commit; no secret, PII, or corpus text in any commit object or message; failure output prints paths, never contents.", "performanceBudget": "git status < 2s; bun run ci on a fresh clone < 5 min", "reliabilityContract": "failed hook leaves tree unchanged; exit 0/1/2 distinct per scripts/ci.ts; no auto-retry of the commit", "dependencies": [], "verification": ["git status --porcelain", "bun run ci"] },
    { "id": "1.2", "number": 2, "title": "Budget per-package test duration and make CI deterministically green", "sprint": 1, "epic": "E-2", "priority": "must", "size": "M", "risk": "medium", "rice": 16.2, "riceInputs": { "reach": 9, "impact": 3, "confidence": 0.9, "effortPersonMonths": 1.5 }, "userStory": "As a judge who arrives at a red build, we want bun run ci to be deterministically green on both operating systems inside the 5-minute budget, with test duration budgeted, so that the claim that the gate is the deliverable is not contradicted by our own CI.", "acceptanceCriteriaIds": ["AC-1.2-1", "AC-1.2-2", "AC-1.2-3", "AC-1.2-4", "AC-1.2-5"], "keyEdgeCases": ["1-core runner vs 8-core dev machine", "cold corpus index build", "windows-latest ~1.3x slower", "per-file parallelism hides a slow file", "test slow only in combination", "forbidden retry-as-fix", "per-hook vs per-suite timing"], "securityRequirement": "no verbose diagnostics that print question or corpus text; CI secret masking preserved; timing lines carry package name and duration only", "performanceBudget": "per-package budget table; apps/cli <= 20s standalone; full ci < 5 min both OSes; gate-only run stays cheap", "reliabilityContract": "budget overrun fails as a named assertion; no test retry; package that reports no duration fails rather than reporting zero", "dependencies": ["1.1"], "verification": ["bun run ci", "bun run test"] },
    { "id": "1.3", "number": 3, "title": "Record the system arm by executing verifyAnswer", "sprint": 1, "epic": "E-1", "priority": "must", "size": "L", "risk": "high", "rice": 24.0, "riceInputs": { "reach": 10, "impact": 3, "confidence": 0.8, "effortPersonMonths": 3.0 }, "userStory": "As a field-literate judge who greps score.ts first, we want systemDetectionRate to be a recorded execution of the verifier over the eval set, so that the headline figure is a measurement that can be wrong instead of a tautology that holds at 1.0 for any input including a deleted verifier.", "acceptanceCriteriaIds": ["AC-1.3-1", "AC-1.3-2", "AC-1.3-3", "AC-1.3-4", "AC-1.3-5", "AC-1.3-6", "AC-1.3-7", "AC-1.3-8"], "keyEdgeCases": ["zero-case set must refuse rather than publish 0.0 (rate() today returns 0)", "byte-identical across runs and OSes including JSON key order and line endings", "per-case timeout yields unverifiable", "abstention rate must be published so detect-by-abstaining is visible", "arm independence so a shared bug cannot move both numbers", "duplicate case id rejected", "corpus snapshot drift records both figures", "one failing case must not lose the other 39"], "securityRequirement": "verifier path must not import src/diagnostics/ (G-1); no network in the scoring path; artefact carries ids/hashes only, never question or corpus text; all artefact fields schema-decoded; corpus text never rendered as HTML", "performanceBudget": "40 cases <= 30s offline; 200 cases <= 120s; p95 per case <= 100ms; atomic artefact write", "reliabilityContract": "per-arm failure isolation by name; partial runs never published as complete; no retry on the deterministic verifier; corpus unavailable reports unavailable and exits non-zero", "dependencies": ["1.1"], "verification": ["bun run benchmark:vs-search", "bun run ci:gates"] },
    { "id": "1.4", "number": 4, "title": "Add a hard baseline arm outside the verifier's dependency boundary", "sprint": 1, "epic": "E-1", "priority": "must", "size": "L", "risk": "high", "rice": 4.2, "riceInputs": { "reach": 8, "impact": 3, "confidence": 0.7, "effortPersonMonths": 4.0 }, "userStory": "As a judge who asks for an embedding retriever or an LLM judge comparison, we want at least one non-FTS5 baseline measured in the same artefact, so that any search tool could do this is refuted on the record by a number, published even if the baseline wins.", "acceptanceCriteriaIds": ["AC-1.4-1", "AC-1.4-2", "AC-1.4-3", "AC-1.4-4", "AC-1.4-5", "AC-1.4-6"], "keyEdgeCases": ["no API key or no network", "model download prohibited in CI so the arm is cached or explicitly optional with a visible named skip", "embedding dimension mismatch", "top-k>1 must be declared and scored top-1", "LLM judge nondeterminism labelled and never a determinism basis", "cold model start excluded from the reported figure"], "securityRequirement": "judge key from env only, never in artefact/log/trace/commit (G-4 green); no import path into packages/mizan-verify/src (G-1); model output schema-decoded and never a mizan verdict; model ids and versions pinned in the artefact", "performanceBudget": "dense arm <= 5 min; cold load reported separately; full multi-arm benchmark <= 15 min as a non-gating job; p95 per case per arm published", "reliabilityContract": "per-arm isolation; unloadable arm prints unavailable with a reason and the run does not claim a complete comparison; one documented retry for network arms with the count published; artefact records commit hash and corpus snapshot hash", "dependencies": ["1.1", "1.3"], "verification": ["bun run ci:gates", "bun run benchmark:vs-search"] },
    { "id": "1.5", "number": 5, "title": "Extend the eval set to at least three distinct failure classes", "sprint": 1, "epic": "E-4", "priority": "must", "size": "M", "risk": "medium", "rice": 6.4, "riceInputs": { "reach": 8, "impact": 2, "confidence": 0.8, "effortPersonMonths": 2.0 }, "userStory": "As a judge assessing a zero-tolerance integrity claim, we want the red-team set to span absent-quote, wrong-number, wrong-collection and truncated fabrications with per-class rates and confidence intervals, so that 0/40 at 95% CI of about 89-100% becomes a narrow credible denominator.", "acceptanceCriteriaIds": ["AC-1.5-1", "AC-1.5-2", "AC-1.5-3", "AC-1.5-4", "AC-1.5-5", "AC-1.5-6", "AC-1.5-7"], "keyEdgeCases": ["a mutation that folds to the real text is a set-construction defect caught at build time", "truncation at the quote cap boundary", "class balance re-checked after adjudication exclusions", "a class reduced to zero printed as no cases in class", "duplicate or colliding case ids fail the build", "same quote with different citations must be distinct cases"], "securityRequirement": "per-class artefact carries ids, class names, counts, hashes only; adjudicator output schema-decoded; adjudicator must not be a function of the verifier under test; no ledger-derived leakage", "performanceBudget": "eval build <= 60s; 200-case set within the 120s scoring budget; interval method named (Wilson preferred)", "reliabilityContract": "construction self-check failure blocks the set; adjudication timeout marks a case undecided and excludes it visibly rather than defaulting to rejected; set carries a content hash and a set change invalidates the previous published rate", "dependencies": ["1.1", "1.3"], "verification": ["group-by over data/eval/redteam-fabricated.json", "bun run benchmark:vs-search"] },
    { "id": "1.6", "number": 6, "title": "Strip every unmeasured claim from README, specs and demo output", "sprint": 1, "epic": "E-1", "priority": "must", "size": "S", "risk": "medium", "rice": 32.4, "riceInputs": { "reach": 9, "impact": 2, "confidence": 0.9, "effortPersonMonths": 0.5 }, "userStory": "As a judge comparing the README against the committed tree, we want every numeric claim to be produced by a recorded artefact or pinned to a command, so that the repository never overstates itself, and so that before the measurement lands the honest state is to say nothing.", "acceptanceCriteriaIds": ["AC-1.6-1", "AC-1.6-2", "AC-1.6-3", "AC-1.6-4"], "keyEdgeCases": ["numbers in fenced code blocks vs prose", "ADRs may keep dated historical numbers", "version strings, hashes, licence years exempt", "Arabic-Indic digits detected", "a claim split across two files", "a claim measurable only with a network arm must be artefact-pinned or removed"], "securityRequirement": "no secret or internal key in any document or CLI string; no claim implying coverage of quarantined records; checker failure output prints the offending line, not file contents", "performanceBudget": "bun run check:docs <= 20s and reads the COMMITTED tree, not the working tree", "reliabilityContract": "failure names file and line so the fix is one edit; the checker never auto-modifies documents; an unreadable file is treated as unbacked and fails", "dependencies": ["1.1", "1.3"], "verification": ["bun run check:docs"] },
    { "id": "1.7", "number": 7, "title": "Standalone specs/adr/ADR-01..ADR-11.md with resolvable citation paths", "sprint": 1, "epic": "E-7", "priority": "must", "size": "M", "risk": "low", "rice": 4.4, "riceInputs": { "reach": 7, "impact": 1, "confidence": 0.95, "effortPersonMonths": 1.5 }, "userStory": "As a judge who greps ADR-03, the single most-cited authority in the codebase, we want a standalone resolvable document stating context, decision, rationale, consequences and status, so that our most-cited justification is findable rather than folklore.", "acceptanceCriteriaIds": ["AC-1.7-1", "AC-1.7-2", "AC-1.7-3", "AC-1.7-4"], "keyEdgeCases": ["supersession links both directions", "renumbering is a breaking change caught by the check", "rule restated with different wording in AGENTS.md and an ADR is a section 17 violation", "dangling reference to a deleted file", "citations inside code blocks or string literals", "ADR-12..16 must land as files or the set is half-resolvable"], "securityRequirement": "no secret, API key or internal credential in any ADR; no corpus text beyond licence; no ADR may present a religious ruling or grade as mizan's own (section 15)", "performanceBudget": "citation check <= 10s, may fold into check:docs", "reliabilityContract": "all unresolved citations reported in one pass naming file and line; missing cited file is a hard failure; no retry", "dependencies": ["1.1"], "verification": ["grep ADR-03", "bun run check:docs"] },
    { "id": "1.8", "number": 8, "title": "Lead with the badge, demote retrieval", "sprint": 1, "epic": "E-3", "priority": "must", "size": "S", "risk": "low", "rice": 32.4, "riceInputs": { "reach": 9, "impact": 2, "confidence": 0.9, "effortPersonMonths": 0.5 }, "userStory": "As a judge who watches for 60 seconds, we want the computed VERIFIED/REJECTED verdict to be the first rendered element with the source text beneath it and retrieval internals demoted behind an explicit opt-in, so that the eye lands on the differentiator instead of a search box with extra steps.", "acceptanceCriteriaIds": ["AC-1.8-1", "AC-1.8-2", "AC-1.8-3", "AC-1.8-4", "AC-1.8-5"], "keyEdgeCases": ["80-column terminal wrapping", "NO_COLOR and non-TTY produce no ANSI", "unverifiable is visually and semantically distinct from REJECTED", "Arabic quote rendering does not displace the badge", "multi-claim answers never aggregate into one green badge", "byte-identical transcript across runs"], "securityRequirement": "ANSI escape sequences in corpus text must not rewrite the screen or hide the verdict; persisted trace and ledger carry questionHash only; no raw-HTML sink (Rule 11, G-2 green); no secret printed even when present in env; no unmeasured claim in demo output", "performanceBudget": "demo <= 3s warm, <= 10s cold, no network, no key; transcript generation <= 5s and byte-identical", "reliabilityContract": "all seven section 16 degradation rows render in the first-line position and exit 0; non-zero exit reserved for an integrity failure; no retry that could change the verdict; transcript diffed in CI", "dependencies": [], "verification": ["bun run demo", "bun run ci:gates"] },
    { "id": "2.1", "number": 9, "title": "Correction surface ST3 from the existing longest-run diagnostic", "sprint": 2, "epic": "E-5", "priority": "should", "size": "M", "risk": "medium", "rice": 5.6, "riceInputs": { "reach": 7, "impact": 2, "confidence": 0.8, "effortPersonMonths": 2.0 }, "userStory": "As a reader who received a REJECTED citation, we want the product to show where the canonical text probably is, so that the answer is actionable instead of a dead end, matching IslamicEval 2026 ST3 and HalluScoring find-the-truth where the field leader scores 66.56%.", "acceptanceCriteriaIds": ["AC-2.1-1", "AC-2.1-2", "AC-2.1-3", "AC-2.1-4", "AC-2.1-5", "AC-2.1-6"], "keyEdgeCases": ["no overlap at all emits no span and never an empty string as a location", "equal-length candidate spans need a documented deterministic tie-break", "span at a record boundary", "span length cap stated not silently truncated", "span crossing a normalisation fold boundary needs a defined coordinate space", "minimum span length so a 2-character run is not a location", "quote contained in multiple records stays scoped to the cited record", "UTF-16 split across a combining mark"], "securityRequirement": "span rendered as a text node, G-2 green; no corpus text in any log, trace or ledger (section 13); corpus text cannot emit terminal escapes; any similarity percentage on the output surface fails the suite (section 10)", "performanceBudget": "correction adds <= 50ms p95 per rejected claim; no second full-corpus pass", "reliabilityContract": "correction failure degrades to plain REJECTED with a stated reason, never a partial guess; the verdict path has no dependency on correction; no retry", "dependencies": ["1.1", "1.3"], "verification": ["bun run ci:gates", "apps/cli correction tests"] },
    { "id": "2.2", "number": 10, "title": "Relevance check ST4 so a non-answer cannot badge green", "sprint": 2, "epic": "E-6", "priority": "should", "size": "L", "risk": "high", "rice": 3.15, "riceInputs": { "reach": 7, "impact": 3, "confidence": 0.6, "effortPersonMonths": 4.0 }, "userStory": "As a judge making a religious decision from the output, we want a quote that is genuinely contained in the cited record but does not answer the question to be visibly distinguished from one that does, so that a confident green on a non-answer, a false verified in spirit, cannot occur.", "acceptanceCriteriaIds": ["AC-2.2-1", "AC-2.2-2", "AC-2.2-3", "AC-2.2-4", "AC-2.2-5", "AC-2.2-6", "AC-2.2-7"], "keyEdgeCases": ["empty or whitespace-only question yields undetermined", "Arabic question vs Arabic quote compared folded not by identity", "negation in the question fools naive term overlap and must be in the eval set", "a quote answering a different question", "a long claim spanning several records reports relevance per claim", "answer-not-in-corpus reported as no sources found, distinct from doesNotAnswer", "cross-language question vs Arabic record"], "securityRequirement": "no ML or fuzzy similarity scorer in the path to a green badge (W-5, CWE-345); only verify.ts:107 may construct verified and relevance is downstream; question and quote schema-decoded at the boundary; no relevance percentage on any surface; no question text in traces", "performanceBudget": "relevance adds <= 100ms p95 per claim; no network and no model in the default path; no second full-corpus scan", "reliabilityContract": "any relevance failure yields undetermined plus disclosure, never a crash and never a green; timeout yields undetermined with the containment verdict preserved; no retry; the product is usable with relevance unavailable, and no broader accuracy claim may be published while it is", "dependencies": ["1.1", "1.3", "1.5"], "verification": ["bun run ci:gates", "relevance eval suite"] },
    { "id": "2.3", "number": 11, "title": "Publish the comparison table against BurhanAI, HUMAIN and CiteGuard", "sprint": 2, "epic": "E-1", "priority": "should", "size": "S", "risk": "medium", "rice": 18.1, "riceInputs": { "reach": 8, "impact": 2, "confidence": 0.85, "effortPersonMonths": 0.75 }, "userStory": "As a judge comparing mizan to published numbers, we want a table generated from our own recorded artefact with each peer's method difference stated beside their figure, so that our claim is not read as like-for-like against 88.6, 68.1, 66.56 and 54.6-65.9 percent.", "acceptanceCriteriaIds": ["AC-2.3-1", "AC-2.3-2", "AC-2.3-3", "AC-2.3-4", "AC-2.3-5"], "keyEdgeCases": ["metric mismatch (accuracy vs macro-F1 vs label accuracy vs span accuracy) named in the cell", "artefact unavailable prints not measured, never a stale number", "peer figures pinned to source URL and date", "task-2 attribution tasks are not equivalent to per-claim containment", "Arabic-Indic digits in a source figure"], "securityRequirement": "no cell may imply coverage of quarantined records; no unmeasured claim in any cell; every peer figure carries a source citation", "performanceBudget": "table generation <= 10s from the artefact, inside the docs-check step", "reliabilityContract": "missing artefact produces an explicit not-measured table and a CI signal, never a stale render; generator timeout fails the step by name; no retry; absence of the table never affects the pipeline or structural gates", "dependencies": ["1.3", "1.4", "1.6"], "verification": ["bun run check:docs", "table generation script"] },
    { "id": "2.4", "number": 12, "title": "Quarantine-coverage reporting and a visible no-sources-found reason", "sprint": 2, "epic": "E-2", "priority": "should", "size": "M", "risk": "low", "rice": 3.6, "riceInputs": { "reach": 6, "impact": 1, "confidence": 0.9, "effortPersonMonths": 1.5 }, "userStory": "As a user whose answer lives in one of the 41.7% quarantined hadith records, we want an explicit per-collection coverage report and a stated reason on every miss, so that the quarantine is an honest disclosed integrity boundary rather than a silent recall failure.", "acceptanceCriteriaIds": ["AC-2.4-1", "AC-2.4-2", "AC-2.4-3", "AC-2.4-4", "AC-2.4-5"], "keyEdgeCases": ["collection with zero rows must publish neither 0% nor 100%", "adjacent rows quarantined for different reasons grouped by reason", "a row quarantined then re-admitted must be a recorded transition (W-3 forbids silent re-admission)", "collection in the registry but absent from the corpus", "the report must not become a full-table scan in the answer path"], "securityRequirement": "coverage report carries counts, collection names and hashes, never corpus text (section 13); quarantine auditable by recorded reason, not by inference from absence; the no-sources-found reason is a category plus an id, never content", "performanceBudget": "report <= 30s over the corpus, off the answer path; no measurable answer-path degradation for a 100%-quarantined collection", "reliabilityContract": "ledger/DB mismatch is a named failure with no partial report; timeout yields no report and a non-zero exit; no retry; with the report unavailable the answer path still returns no sources found with the section 16 reason", "dependencies": ["1.1", "1.2"], "verification": ["coverage report generation", "no-sources-found reason tests"] },
    { "id": "2.5", "number": 13, "title": "Live run-ledger evaluation replacing replay and placeholder timings (MIZ-110)", "sprint": 2, "epic": "E-1", "priority": "should", "size": "M", "risk": "medium", "rice": 3.5, "riceInputs": { "reach": 5, "impact": 2, "confidence": 0.7, "effortPersonMonths": 2.0 }, "userStory": "As a judge checking whether the badge on screen was computed and recorded, we want ledger rows carrying timings measured from real runs with a write failure marking the run untrusted, so that operational figures are measured rather than asserted and the chain backing the central claim is auditable by a command a judge can run.", "acceptanceCriteriaIds": ["AC-2.5-1", "AC-2.5-2", "AC-2.5-3", "AC-2.5-4", "AC-2.5-5", "AC-2.5-6", "AC-2.5-7"], "keyEdgeCases": ["torn tail from a killed process is named, not repaired", "out-of-order or removed entry breaks the prevHash chain and names the index", "duplicate run id detected or explicitly permitted and documented", "clock skew must not corrupt a hash-linked chain", "1000-entry audit within budget", "crash between fsync and rename leaves the chain valid or explicitly torn, never silently short"], "securityRequirement": "no PII, question text, corpus text or secrets in any log line, trace or ledger entry (section 13); append-only atomic single write plus fsync; no credential material in a trace; the audit output must state it proves history was unaltered, not that a recorded verdict was correct", "performanceBudget": "ledger append <= 20ms; audit of 1000 entries <= 5s; append off the critical verdict path", "reliabilityContract": "write failure marks the run untrusted loudly and never fails open; audit timeout exits non-zero naming the entry; one idempotent retry for transient I/O on append; a torn tail is never retried or repaired; unavailable ledger yields a verdict marked explicitly unrecorded", "dependencies": ["1.1", "1.3"], "verification": ["bun run verify:runs", "AGENTS section 13 hygiene gate"] },
    { "id": "2.6", "number": 14, "title": "Arabic normalisation specification and terminal rendering", "sprint": 2, "epic": "E-6", "priority": "should", "size": "M", "risk": "medium", "rice": 6.4, "riceInputs": { "reach": 8, "impact": 2, "confidence": 0.8, "effortPersonMonths": 2.0 }, "userStory": "As a judge reading Arabic output in the terminal they will actually use, we want normalisation specified in one published place with index-time and verify-time folding proven byte-identical and Arabic rendered legibly, so that a divergence between the two never masquerades as a working fail-closed verifier.", "acceptanceCriteriaIds": ["AC-2.6-1", "AC-2.6-2", "AC-2.6-3", "AC-2.6-4", "AC-2.6-5", "AC-2.6-6", "AC-2.6-7"], "keyEdgeCases": ["NFC vs NFD input must fold identically", "quranic annotation marks U+06D6-U+06ED and superscript alef U+0670", "zero-width characters U+200B-U+200F and U+FEFF, where stripping is the dangerous direction that could manufacture a false verified", "control characters and ANSI escapes inside corpus text", "tatweel U+0640 and maximal elongation", "alef variants and ya variants", "width calculation over combining marks overestimates and misaligns the badge", "mixed RTL/LTR with a Latin collection id and an Arabic quote", "quote cap defined in a single coordinate space"], "securityRequirement": "a quote containing ANSI escapes must not clear lines, reposition the cursor or hide the verdict; control bytes escaped or removed with a planted-escape test; no raw-HTML sink (Rule 11); persisted trace still carries questionHash only; Unicode data version declared so a Bun upgrade cannot silently change verdicts (R-10)", "performanceBudget": "folding <= 5us per 1KB; differential suite < 5s; folding table precomputed, zero added answer-path latency", "reliabilityContract": "undecodable byte sequence yields unverifiable, not a crash or a silent pass; oversized input rejected by the declared cap with a named reason; no retry, folding is pure; if the terminal cannot render Arabic the badge, verdict and record id still render; any folding change re-runs the canonical digest and the full red-team set and digest movement is a gate failure", "dependencies": [], "verification": ["bun run ci:gates", "normalisation differential tests", "apps/cli transcript snapshots"] }
  ],
  "acceptanceCriteria": [
    { "id": "AC-1.1-1", "story": "1.1", "type": "positive", "given": "the repository root of mizan", "when": "git status --porcelain is executed", "then": "it prints nothing and exits 0, and git log --oneline -1 names a commit whose tree contains g7-verdict-path-purity.ts, scripts/benchmark/score.ts and data/benchmark/vs-search.json" },
    { "id": "AC-1.1-2", "story": "1.1", "type": "positive", "given": "a fresh clone of HEAD into a clean directory", "when": "bun run ci is executed", "then": "it exits 0 with typecheck, tests and gates G-1..G-7 passing, unaffected by uncommitted files, with exit 0/1/2 kept distinct" },
    { "id": "AC-1.1-3", "story": "1.1", "type": "negative", "given": "the modified set contains a gitleaks pattern or licence-excluded corpus text", "when": "the commit is prepared", "then": "the file is excluded and named, G-4 runs on the STAGED tree before the commit, and the message contains no secret, PII or corpus text" },
    { "id": "AC-1.1-4", "story": "1.1", "

## Specification
# Project Value Validation & Competitive Hardening

## 1. Executive Summary

The feedback — *"any search tool could do this"* — is **wrong about the verifier and right about everything a judge sees**. mizan's verification layer is genuinely differentiated: `VERIFIED` is constructed at exactly one site, reachable only by strict folded substring containment, enforced by gates G-1/G-6/G-7. No search box produces a per-claim verdict against a *specific cited record*, cannot abstain honestly, and cannot be byte-deterministic. But the project cannot **prove** that value, and its benchmark contains a defect a field-literate judge will find in five minutes. `scripts/benchmark/score.ts` computes the headline `systemDetectionRate: 1` as `expectedVerdict !== "verified"` over a set where all 40 cases are labelled `rejected` — the figure is **tautologically 1.0 for any input whatsoever**, including a verifier that does not exist. Only the 65% baseline arm is measured. Meanwhile `bun run ci` is red on a flaky 26.6s `apps/cli` suite, ~60 modified files are uncommitted, and the eval set is a single failure class. This cycle converts the real differentiator from an *assertion* into a *measurement* and closes the presentation gap.

## 2. Findings verified by execution (not by reading)

| # | Finding | Evidence |
|---|---|---|
| F-1 | **Headline benchmark is a tautology** — `detected = expectedVerdict !== "verified"`; 40/40 `rejected` → 1.0 by construction, independent of the verifier | `score.ts:27-29,99`; `redteam-fabricated.json` group-by; `vs-search.json:9` |
| F-2 | **CI red** — `apps/cli` passes 217/217 standalone but takes **26.6s**; hook times out at 13.2s under load | `bun test` in `apps/cli` → `217 pass 0 fail, 26.64s` |
| F-3 | **One failure class** — all 40 cases are `quote_absent_at_cited_id`; wrong-number, wrong-collection, truncated all score identically | group-by over the eval set |
| F-4 | **~60 modified files uncommitted** plus a large untracked set — the gates are the product, and they are unshipped | `git status --porcelain` |
| F-5 | **No standalone ADRs** — ADR-01…11 cited from ~30 files, exist only as prose in two spec markdowns | `specs/adr/` contains 2 files, both request-specs |

**The feedback, decomposed:** verification = genuinely differentiated (this is the product); retrieval = *is* a search tool; generation = not differentiated. Value is real and correctly aimed. **Surging and evidence are the failure** — the badge is line 3 of 5 on screen.

## 3. Risk Register (summary — full table in the wiki)

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Tautological headline figure reaches a judge — destroys credibility *harder* than the original feedback | **Critical** | Measure it; publish a hard baseline; state no rate until measured |
| R-2 | Red CI at demo time kills the gate-is-the-deliverable claim | **Critical** | Isolate the 26.6s hook; treat timeout as a named failure |
| R-3 | Relevance unguarded — a green badge on an irrelevant quote is a false `verified` in spirit | **Critical** | ST4 check before any public claim; scope claims to containment |
| R-4 | 0/40 at 95% ≈ [89%, 100%]; one class is a regression test | High | ≥3 failure classes before publishing a rate |
| R-5 | Uncommitted tree = unshipped deliverable | High | Commit first, Sprint 1 item 1.1 |
| R-6 | 41.7% quarantine is a recall failure made visible | High | Honest degradation; per-collection coverage reporting |
| R-9 | A hard baseline **beats** mizan | Medium | Good outcome — publish honestly, relocate the claim |

## 4. Key ADRs (full text in the wiki)

- **ADR-12 — Measure the system arm; never derive it from labels.** A tautology is worse than no number: it cannot be wrong until the verifier is deleted.
- **ADR-13 — Add a hard baseline outside the verifier's dependency boundary.** Dense (SPECTER2 = 0% on CiteME) and LLM-judge (CiteGuard 34–68%) arms, in a separate package, importing nothing from `mizan-verify` — G-1 keeps the one-dependency invariant.
- **ADR-14 — The badge leads; retrieval is demoted.** Less impressive at a glance, accurate about what the product is.
- **ADR-15 — ≥3 failure classes, never the set the verifier was built from.** The published rate may move below 100%. That is the point.
- **ADR-16 — No confidence/severity/trust score on the verdict surface.** Reaffirms §10/§15; a fuzzy 97% is CWE-345 in a nicer hat.

## 5. Sprint Backlog (top items)

**Sprint 1 — make the value provable:** commit the tree → un-red CI → replace the tautological arm with a recorded `verifyAnswer` run (plus a planted self-test that fails if re-derived) → add a hard baseline arm → extend the eval to ≥3 classes → strip unmeasured claims from every doc → standalone ADRs → badge-first demo.

**Sprint 2 — convert the gap into product:** correction (ST3) from the existing 60-char diagnostic · relevance (ST4) · published comparison table · quarantine-coverage reporting · live ledger eval · Arabic judge surface.

Deferred to Sprint 3+ (not planned): matn/isnad decomposition · hybrid retrieval · answer selection · gates-as-artifact.

**North star:** the objection is answered by a published artefact, not an argument — and the artefact survives a judge checking it.

Full spec: `spec-project-value-validation-2026-09-29`

```json
{"office_fact_memory":[{"fact":"mizan's headline benchmark figure is tautological, not merely unmeasured: scripts/benchmark/score.ts computes systemDetectionRate as `expectedVerdict !== \"verified\"` over a set in which all 40 red-team cases are labelled rejected, so the published 1.0 holds for ANY input including a deleted verifier. Only the 65% FTS5 baselineTop1HitRate is actually measured.","phase":"ceo","evidence":"Read scripts/benchmark/score.ts lines 27-29 and 99; group-by over data/eval/redteam-fabricated.json returned 40/40 rejected, 40/40 quote_absent_at_cited_id; data/benchmark/vs-search.json:9 states systemDetectionRate 1.","confidence":0.97},{"fact":"The red CI flake is a duration problem, not a correctness problem: `bun test` in apps/cli passes 217/217 standalone but takes 26.64s, and the beforeEach/afterEach hook trips Bun's 13.2s default per-hook timeout under full-CI load. Fixing it means reducing suite duration or budgeting per-package timeouts, not changing test logic.","phase":"ceo","evidence":"Ran `bun test` in apps/cli: '217 pass 0 fail, Ran 217 tests across 10 files. [26.64s]'; ci.yml gate job sets timeout-minutes: 15.","confidence":0.93},{"fact":"The red-team eval set has exactly ONE failure class: all 40 cases carry expectedReason 'quote_absent_at_cited_id'. Wrong-number, wrong-collection, truncated and near-miss fabrications are absent, so per-class rates are impossible and the set functions as a regression test rather than an independent evaluation.","phase":"ceo","evidence":"PowerShell group-by over data/eval/redteam-fabricated.json cases on expectedVerdict and on expectedReason.","confidence":0.95},{"fact":"As of 2026-09-29 the mizan working tree carries ~60 modified tracked files plus a large untracked set (specs/, docs/, scripts/benchmark/, packages/mizan-gate/src/gates/g7-verdict-path-purity.ts, data/benchmark/) that are uncommitted. The machine-checked gates — the project's claimed differentiator — are not yet in the repository history.","phase":"ceo","evidence":"`git status --porcelain` output; `git log --oneline -10` shows last commit cdc34c5 predates G-7 and the benchmark scripts.","confidence":0.94}]}
```

```json
{
  "executiveSummary": "The feedback 'any search tool could do this' is wrong about mizan's verifier and right about everything a judge sees. The verification layer is genuinely differentiated — VERIFIED is constructed at exactly one site, reachable only by strict folded substring containment, and machine-enforced by gates G-1/G-6/G-7; no search box can produce a per-claim verdict against a specific cited record, abstain honestly, or be byte-deterministic. But the project cannot currently prove that value, and its own benchmark contains a defect a field-literate judge will find in under five minutes. By execution I confirmed that scripts/benchmark/score.ts computes the headline systemDetectionRate of 1 as `expectedVerdict !== \"verified\"` over a set in which all 40 cases are labelled rejected, so the figure is tautologically 1.0 for any input whatsoever, including a verifier that does not exist; only the 65% FTS5 baseline arm is actually measured. Compounding this, `bun run ci` is red because apps/cli passes 217/217 standalone but takes 26.6s and trips Bun's 13.2s per-hook timeout under load; the entire red-team eval set is a single failure class (quote_absent_at_cited_id x40); and roughly 60 modified files including the G-7 gate and the whole benchmark harness are uncommitted, so the project's claimed differentiator is not even shipped. This cycle converts the real differentiator from an assertion into a measurement, un-reds CI, commits the deliverable, leads the demo with the badge rather than the pipeline, and scopes the three highest-scoring market requirements (ST3 correction, ST4 relevance, ST1 fragment decomposition) with a credible path to leaderboard-grade output. Expected impact: the 'a search tool could do this' objection is refuted on the record by a published artefact rather than by argument, and the artefact survives a judge who checks it.",
  "moscow": {
    "must": [
      "M-1 `bun run ci` is deterministically green on ubuntu-latest and windows-latest, under 5 minutes, with 0 flakes in 10 consecutive runs (AGENTS.md §14 defines a flaky CI job as a defect).",
      "M-2 `systemDetectionRate` becomes a recorded output of `verifyAnswer` over the eval set, with a planted self-test that FAILS if the figure is ever re-derived from expectedVerdict labels.",
      "M-3 At least one hard, non-mizan-selected baseline arm (dense retriever and/or LLM judge) is added to the same published artefact, importing nothing from packages/mizan-verify.",
      "M-4 The demo leads with the VERIFIED/REJECTED badge; retrieval is demoted below the pipeline so a 60-second judge look lands on the differentiator, not on a search box.",
      "M-5 The eval set covers at least 3 distinct failure classes including wrong-number and wrong-collection, with per-class rates and a 95% confidence interval published.",
      "M-6 The ~60 uncommitted modified files and the untracked deliverable set are committed; `git status` is clean, because the gates are the product and must exist in the tree.",
      "M-7 Standalone specs/adr/ADR-01..ADR-11.md files exist and the ~30 code files citing them point at resolvable paths.",
      "M-8 No integrity regression: G-4 gitleaks green, and per §13 no run trace, log line, or ledger entry contains question text, corpus text, or secrets."
    ],
    "should": [
      "S-1 Correction surface (IslamicEval 2026 ST3, HalluScoring 'find the truth'): surface the canonical text is probably here, derived from the existing 60-char longest-run diagnostic, emitting a span and never a percentage.",
      "S-2 Relevance check (ST4): a quote that is genuinely contained in the cited record but does not answer the question must not badge green. This is the one pathway to a false green in spirit and is currently unguarded.",
      "S-3 Live run-ledger evaluation (MIZ-110) replacing the current replay and placeholder timings, so operational figures are measured rather than asserted.",
      "S-4 Arabic normalisation as a published specification plus Arabic terminal rendering for the judge surface, since the entire benchmark ecosystem (IslamicEval, HalluScoring) is Arabic-first.",
      "S-5 A published comparison table against BurhanAI 88.6% span accuracy / 66.56% correction, HUMAIN 54.6-65.9%, and CiteGuard 68.1%, with method differences stated so the numbers are not read as like-for-like."
    ],
    "could": [
      "C-1 Matn / isnad / claimed-source fragment decomposition (IslamicEval 2026 ST1) — the literal ST1 requirement absent from every system found, and the real differentiator versus the 13 competing teams.",
      "C-2 Hybrid BM25+dense retrieval via RRF, the 2026 table-stakes pattern already shipped by arriqaaq/ilm — a recall gap, not a verification gap.",
      "C-3 Arabic-first answer selection (HalluScoring 2026 Task 2.1 second half, best published label accuracy 0.935).",
      "C-4 Promote the gate harness to a publishable, third-party-runnable artifact: no competitor ships a machine-checked invariant that `verified` is constructed at one site."
    ],
    "wont": [
      "W-1 Any confidence percentage, severity score, or weighted trust score on the verdict surface (the TasnidChain consensus-score and hadith-verifier confidence-bucket patterns). Violates §10 and re-opens CWE-345; the market evidence in arXiv 2606.23915 and the Mirage of Hallucination Detection (EMNLP 2025) says score-based attribution is the failure mode, not the fix.",
      "W-2 A hosted service, authentication, multi-tenancy, or user accounts. mizan is CLI-only with no server and no users; introducing a server creates a new attack surface and no competitive value this cycle.",
      "W-3 Corpus expansion across the 41.7% quarantined boundary (15,026 rows) without independent re-verification of those rows. The quarantine is a defensible integrity win; silently re-admitting it is the opposite error.",
      "W-4 Replacing effect@4.0.0-beta.83 this cycle. It is a beta in the trust path, but it is pinned and confined to a single 96-line adapter file, so it is a tracked supply-chain flag rather than an urgent defect.",
      "W-5 Fine-tuned or ML relevance/answer-selection scoring to compete on leaderboard metrics, because the published evidence says that is precisely where the field fails.",
      "W-6 Planning Sprint 3+ in detail; matn/isnad decomposition, hybrid retrieval, answer selection, and gates-as-artifact are named as deferred, not planned."
    ]
  },
  "riskRegister": [
    {
      "id": "R-1",
      "risk": "The tautological headline figure (systemDetectionRate = expectedVerdict !== 'verified' over 40/40 rejected cases) reaches a judge or a README. This is worse than the original feedback: it is a number that cannot be wrong until the verifier is deleted, and it would discredit a genuinely differentiated product.",
      "type": "Business",
      "severity": "Critical",
      "likelihood": "High",
      "mitigation": "M-2: replace with a recorded verifyAnswer run plus a planted self-test that fails on label-derived figures. M-3: add a hard baseline. Until measured, no document states a detection rate at all, and 1.6 strips every unmeasured claim from README, specs and demo output."
    },
    {
      "id": "R-2",
      "risk": "CI is red at demo time. apps/cli takes 26.6s standalone and trips Bun's 13.2s per-hook timeout under CI load. A flaky run contradicts AGENTS.md §14 and destroys the 'the gate is the deliverable' claim before the demo runs.",
      "type": "Reliability",
      "severity": "Critical",
      "likelihood": "High",
      "mitigation": "M-1: isolate the slow hook, reduce suite duration, budget per-package timeouts, and treat a timeout as a named first-class failure rather than flake. Gate on 10 consecutive deterministic green runs."
    },
    {
      "id": "R-3",
      "risk": "Relevance is unguarded. A quote that is genuinely contained in the cited record but does not answer the question still badges green, which is a false 'verified' in spirit even though the containment invariant holds. For a judge making a religious decision, a confident green on a non-answer is the worst failure mode in the system.",
      "type": "Security/Integrity",
      "severity": "Critical",
      "likelihood": "Medium",
      "mitigation": "S-2 before any public accuracy claim. Interim: scope every published claim to 'the quote is contained in the cited record', never 'the answer is correct'. Ship a verified-but-irrelevant case that must FAIL the suite, proving the pathway is closed."
    },
    {
      "id": "R-4",
      "risk": "Evaluation breadth is one failure class: all 40 red-team cases are quote_absent_at_cited_id, so wrong-number, wrong-collection and truncated fabrications are indistinguishable. 0/40 at 95% confidence is roughly [89%, 100%] — too wide to publish as a zero-tolerance claim — and a single-class set is a regression test wearing an eval's label.",
      "type": "Technical",
      "severity": "High",
      "likelihood": "High",
      "mitigation": "M-5: add wrong-number, wrong-collection, truncated and near-miss classes, publish per-class rates and a confidence interval, and set the bar on a set the verifier was not built from."
    },
    {
      "id": "R-5",
      "risk": "The deliverable is unshipped: roughly 60 modified tracked files plus untracked specs/, docs/, scripts/benchmark/, the G-7 verdict-path-purity gate and data/benchmark/ are uncommitted, so the machine-checked gates that constitute the competitive differentiator do not exist in the repository history.",
      "type": "Operational",
      "severity": "High",
      "likelihood": "Certain",
      "mitigation": "M-6, the first action of Sprint 1: commit the tree and require a clean `git status` as a Sprint 1 exit criterion."
    },
    {
      "id": "R-6",
      "risk": "41.7% of the hadith corpus (15,026 rows) is quarantined. Defensible on integrity grounds and honestly disclosed, but a user whose answer lives in one of those records gets nothing — an integrity win that is simultaneously a product recall failure, and one that Sanad's 617k corpus makes directly comparable.",
      "type": "Product",
      "severity": "High",
      "likelihood": "High",
      "mitigation": "S-4: per-collection quarantine-coverage reporting in the artefact plus a visible `no sources found` reason per §16, so a miss is an honest state rather than a silent blank."
    },
    {
      "id": "R-7",
      "risk": "effect@4.0.0-beta.83 is a beta dependency in the trust path. A malicious or breaking beta release in the decode seam propagates into every verdict.",
      "type": "Supply chain",
      "severity": "Medium",
      "likelihood": "Medium",
      "mitigation": "ADR-02 already pins the version and confines beta API drift to one 96-line adapter (schema/decode.ts). Track as a disclosed flag; explicitly out of scope this cycle (W-4) because the blast radius is one file."
    },
    {
      "id": "R-8",
      "risk": "Scope creep into matn/isnad decomposition and hybrid dense retrieval simultaneously. The gap list names seven missing market capabilities and the tempting failure is to attempt all of them, shipping none.",
      "type": "Delivery",
      "severity": "High",
      "likelihood": "High",
      "mitigation": "YAGNI and the two-sprint planning limit: C-1 and C-2 explicitly deferred to Sprint 3+, with only E-1 through E-7 in scope. Sprint 1 is eight items and is entirely about making existing value provable."
    },
    {
      "id": "R-9",
      "risk": "The hard baseline arm beats mizan. If a dense retriever or LLM judge outperforms the system arm on the honest set, the comparison published in the artefact contradicts the product's central claim.",
      "type": "Business",
      "severity": "Medium",
      "likelihood": "Low",
      "mitigation": "This is the good outcome and must be published regardless. Dense retrieval is a recall problem, not a verification problem; if it wins, relocate the claim to the containment gate and ST-level output, which no baseline arm reproduces. Committed in advance so the result is not suppressed."
    },
    {
      "id": "R-10",
      "risk": "Any dependency bump or corpus change breaks the published byte-determinism guarantee (100% identical verdicts across repeated runs), which is the basis of the reproducibility claim.",
      "type": "Reliability",
      "severity": "High",
      "likelihood": "Low",
      "mitigation": "Re-run the canonical digest and the full red-team set on any dependency or corpus change; treat a digest movement as a gate failure. Adding benchmark arms must not import into the verifier path."
    },
    {
      "id": "R-11",
      "risk": "Documented figures overstate the committed repository — the spec header claims 516 tests and 6 gates while the tree has 7 gates and a far smaller committed test set. A judge cloning the repo finds fewer artefacts than the docs promise.",
      "type": "Business",
      "severity": "Medium",
      "likelihood": "High",
      "mitigation": "Commit the uncommitted tree (M-6) and hold docs-claims.ts, which already fails `bun run check:docs` on a stale gate count, to the committed tree rather than the working tree."
    },
    {
      "id": "R-12",
      "risk": "Adding dense-retriever and LLM-judge baseline arms introduces heavy dependencies and a network/model path into a repository whose central architectural claim is that the verifier has exactly one dependency and makes no network call.",
      "type": "Security",
      "severity": "Medium",
      "likelihood": "Low",
      "mitigation": "ADR-13 plus gate G-1: the benchmark arms live in a separate package that imports nothing from mizan-verify, preserving the single-dependency, no-network, no-model invariant of the verdict path. G-1 is the machine-checked control."
    },
    {
      "id": "R-13",
      "risk": "Arabic-first requirements expose a divergence between the index-time and verify-time normalisation of Arabic text (diacritics, kashida, alef/ya unification). A divergence between the two would silently cause false rejections — a correctness failure that would be misread as a working fail-closed verifier.",
      "type": "Security/Correctness",
      "severity": "Medium",
      "likelihood": "Medium",
      "mitigation": "Publish the normalisation spec (per IslamicMMLU) and keep exactly one module owning it per §17; a second copy is a §17 breach. Add a differential test asserting index and verifier produce byte-identical folded output for the same input."
    },
    {
      "id": "R-14",
      "risk": "Correction (ST3) is implemented by exposing a similarity or confidence figure to make it legible, reintroducing the CWE-345 pathway that §10 bans and giving the product a numeric claim it cannot defend.",
      "type": "Security",
      "severity": "High",
      "likelihood": "Medium",
      "mitigation": "ADR-16: correction and relevance emit a discrete state plus a located span, never a percentage. A display-only longest-run diagnostic stays in the diagnostics module that verify.ts is forbidden to import, and G-1 enforces the boundary."
    }
  ],
  "epics": [
    {
      "id": "E-1",
      "name": "Honest Baseline",
      "statement": "Replace the label-derived system arm with a recorded verifyAnswer run, and add at least one hard, non-mizan-selected baseline arm, so the project's central claim is a measurement rather than a tautology.",
      "whyNow": "It is the single highest-value change in the plan: it converts the headline from an assertion into a measurement and directly answers 'is this real, or is it a test rigged to pass?'",
      "successMetrics": [
        "systemDetectionRate is produced by executing verifyAnswer over the eval set, never derived from expectedVerdict",
        "A planted self-test fails the build if the system arm is ever re-derived from labels",
        "At least one hard baseline arm (dense retriever and/or LLM judge) appears in the same artefact",
        "falseVerifiedCount = 0 on every run and every failure class",
        "The published rate carries a 95% confidence interval rather than a bare percentage"
      ],
      "priority": "Must",
      "risks": ["R-1", "R-9", "R-12"]
    },
    {
      "id": "E-2",
      "name": "Green CI",
      "statement": "Make `bun run ci` deterministically green on both operating systems inside the 5-minute budget, with test duration treated as a budgeted resource rather than an accident.",
      "whyNow": "AGENTS.md §14 makes a flaky job a defect, and the red run contradicts the repository's single most-cited claim before any judge sees the product.",
      "successMetrics": [
        "0 flaky runs across 10 consecutive CI runs on ubuntu-latest and windows-latest",
        "Full `bun run ci` completes in under 5 minutes",
        "A per-package test time budget exists and a hook exceeding it fails as a named assertion",
        "Typecheck, tests and gates G-1..G-7 all pass in every package"
      ],
      "priority": "Must",
      "risks": ["R-2", "R-10"]
    },
    {
      "id": "E-3",
      "name": "Evidence Surface",
      "statement": "Lead the demo and the README with the computed verdict and the machine-checked gates, demoting retrieval from the position of first impression to a footnote.",
      "whyNow": "The feedback is a presentation problem as much as a substance problem: a judge's eye currently lands on a search box with extra steps, with the badge on line 3 of 5.",
      "successMetrics": [
        "The VERIFIED/REJECTED badge is the first rendered element of the demo",
        "Retrieval detail is demoted and no longer the first thing on screen",
        "A field-literate judge watching for 60 seconds identifies the verifier as the product",
        "No unmeasured detection-rate claim appears in any document or in demo output"
      ],
      "priority": "Must",
      "risks": ["R-1", "R-11"]
    },
    {
      "id": "E-4",
      "name": "Eval Breadth",
      "statement": "Rebuild the red-team set so it spans multiple distinct failure classes, drawn from data the verifier was not built from, and publish per-class rates.",
      "whyNow": "A zero-tolerance integrity claim cannot rest on 40 cases of a single failure class with a confidence interval as wide as [89%, 100%].",
      "successMetrics": [
        "At least 3 distinct failure classes present, including wrong-number and wrong-collection",
        "Per-class detection rates published alongside the aggregate",
        "A 95% confidence interval accompanies every published rate",
        "The set is verifiably not the set the verifier was developed against"
      ],
      "priority": "Must",
      "risks": ["R-4", "R-3"]
    },
    {
      "id": "E-5",
      "name": "Correction (ST3)",
      "statement": "On a rejected citation, tell the reader where the real text probably is, using the longest-locate span the verifier already computes internally.",
      "whyNow": "It is the nearest and cheapest value-add — the code already exists and is deliberately hidden — and it maps to IslamicEval 2026 ST3 and HalluScoring's 'find the truth' half, where the field leader scores 66.56%.",
      "successMetrics": [
        "A rejected claim returns a located canonical span, not a confidence number",
        "Correction output contains no percentage, score, or severity value",
        "Measured against the published 66.56% correction reference on a comparable set",
        "The span is rendered as a text node, consistent with the no-raw-HTML rule"
      ],
      "priority": "Should",
      "risks": ["R-14", "R-6"]
    },
    {
      "id": "E-6",
      "name": "Relevance (ST4)",
      "statement": "Ensure a quote that is genuinely contained in the cited record but does not answer the question cannot badge green.",
      "whyNow": "It is the one remaining pathway to a misleading green, it is a scored IslamicEval 2026 subtask, and shipping without it would leave a known correctness hole open while making broader accuracy claims.",
      "successMetrics": [
        "A verified-but-irrelevant case FAILS the suite rather than passing green",
        "Relevance is reported as a discrete state, never a score",
        "A retrieval miss reports `no sources found` rather than a silent blank",
        "A second ranker being unavailable yields semanticRanking: 'unavailable' in metadata, never a silent downgrade"
      ],
      "priority": "Should",
      "risks": ["R-3", "R-13"]
    },
    {
      "id": "E-7",
      "name": "Provenance & Findable Authority",
      "statement": "Commit the deliverable and make ADR-01..ADR-11 findable as standalone documents that the code actually cites.",
      "whyNow": "Roughly 60 files including the G-7 gate are uncommitted, and the project's most-cited authority resolves to nothing when a judge greps ADR-03 — a findability and credibility risk on the evidence layer itself.",
      "successMetrics": [
        "`git status --porcelain` returns empty",
        "`grep ADR-03` resolves to a standalone file under specs/adr/",
        "All ~30 code files citing an ADR point at a resolvable path",
        "docs-gates.ts holds every numeric claim in every document to the committed tree"
      ],
      "priority": "Must",
      "risks": ["R-5", "R-11"]
    }
  ],
  "sprintBacklog": [
    {
      "order": 1,
      "id": "1.1",
      "title": "Commit the uncommitted deliverable tree",
      "epic": "E-7",
      "priority": "Must",
      "size": "S",
      "risk": "Low",
      "dependencies": [],
      "acceptanceCriteria": [
        "`git status --porcelain` is empty, including the G-7 gate, scripts/benchmark/ and data/benchmark/",
        "CI still passes on the committed tree"
      ],
      "note": "First action of the cycle. The machine-checked gates are the differentiator and they currently exist only in a working tree."
    },
    {
      "order": 2,
      "id": "1.2",
      "title": "Un-red CI: isolate the 26.6s apps/cli hook and budget per-package timeouts",
      "epic": "E-2",
      "priority": "Must",
      "size": "M",
      "risk": "Medium",
      "dependencies": ["1.1"],
      "acceptanceCriteria": [
        "10 consecutive green CI runs on ubuntu-latest and windows-latest",
        "Full `bun run ci` under 5 minutes",
        "A hook exceeding its package budget fails as a named assertion, not a flake"
      ],
      "note": "Root cause is duration, not logic: apps/cli passes 217/217 standalone in 26.64s and trips Bun's 13.2s default per-hook timeout under CI load."
    },
    {
      "order": 3,
      "id": "1.3",
      "title": "Replace the tautological system arm with a recorded verifyAnswer run",
      "epic": "E-1",
      "priority": "Must",
      "size": "L",
      "risk": "High",
      "dependencies": ["1.1"],
      "acceptanceCriteria": [
        "systemDetectionRate is computed by executing verifyAnswer over the eval set, not from expectedVerdict",
        "A planted self-test fails the build if the system arm is re-derived from labels",
        "The rate is published with a 95% confidence interval",
        "falseVerifiedCount remains 0"
      ],
      "note": "Highest-value item in the cycle. The current figure is 1.0 by construction for any input, including a deleted verifier."
    },
    {
      "order": 4,
      "id": "1.4",
      "title": "Add a hard baseline arm (dense retriever and/or LLM judge)",
      "epic": "E-1",
      "priority": "Must",
      "size": "L",
      "risk": "High",
      "dependencies": ["1.3"],
      "acceptanceCriteria": [
        "At least one non-FTS5 arm appears in the same published artefact",
        "The arm lives outside packages/mizan-verify and gate G-1 confirms the verifier's single-dependency invariant is intact",
        "The result is published whether or not it favours mizan"
      ],
      "note": "Turns 'a search tool could do this' into a measured rebuttal on record. Refs SPECTER2 at 0% on CiteME and CiteGuard at 34-68%."
    },
    {
      "order": 5,
      "id": "1.5",
      "title": "Extend the eval set to at least 3 distinct failure classes",
      "epic": "E-4",
      "priority": "Must",
      "size": "M",
      "risk": "Medium",
      "dependencies": ["1.3"],
      "acceptanceCriteria": [
        "Wrong-number, wrong-collection and truncated classes all present, alongside the existing absent-quote class",
        "Per-class rates published",
        "The set is drawn from data the verifier was not built against"
      ],
      "note": "Today all 40 cases are quote_absent_at_cited_id, so the set is a regression test rather than an evaluation."
    },
    {
      "order": 6,
      "id": "1.6",
      "title": "Strip every unmeasured detection-rate claim from README, specs and demo output",
      "epic": "E-1",
      "priority": "Must",
      "size": "S",
      "risk": "Medium",
      "dependencies": ["1.3"],
      "acceptanceCriteria": [
        "No document asserts a detection rate that is not produced by an execution",
        "docs-gates.ts fails the build on any remaining unbacked numeric claim",
        "The demo prints the measured figure, or prints none"
      ],
      "note": "Interim control for R-1 while 1.3 lands: say nothing rather than say something undefendable."
    },
    {
      "order": 7,
      "id": "1.7",
      "title": "Write standalone specs/adr/ADR-01..11.md and repoint code comments",
      "epic": "E-7",
      "priority": "Must",
      "size": "M",
      "risk": "Low",
      "dependencies": ["1.1"],
      "acceptanceCriteria": [
        "`grep ADR-03` resolves to a standalone file",
        "All ~30 citing code files reference a resolvable path",
        "Each file states context, decision, rationale, consequences and status"
      ],
      "note": "The most-cited authority in the codebase currently resolves to nothing."
    },
    {
      "order": 8,
      "id": "1.8",
      "title": "Reorder the demo: badge first, retrieval last",
      "epic": "E-3",
      "priority": "Must",
      "size": "S",
      "risk": "Low",
      "dependencies": [],
      "acceptanceCriteria": [
        "The VERIFIED/REJECTED badge is the first rendered element",
        "Retrieval detail is demoted below the verdict and the source text",
        "The 60-second judge look lands on the verifier, not on a search box"
      ],
      "note": "Cheapest item with the largest effect on the exact feedback we received. Independent of 1.3."
    },
    {
      "order": 9,
      "id": "2.1",
      "title": "Ship the correction surface (ST3) from the existing longest-run diagnostic",
      "epic": "E-5",
      "priority": "Should",
      "size": "M",
      "risk": "Medium",
      "dependencies": ["1.3"],
      "acceptanceCriteria": [
        "A rejected claim returns a located canonical span",
        "No percentage, confidence or severity value appears on the output surface",
        "Measured against the published 66.56% correction reference",
        "G-1 still forbids verify.ts from importing the diagnostics module"
      ],
      "note": "The span is already computed and deliberately hidden; this is surfacing it under ADR-16's no-score constraint."
    },
    {
      "order": 10,
      "id": "2.2",
      "title": "Add the relevance check (ST4) so a non-answer cannot badge green",
      "epic": "E-6",
      "priority": "Should",
      "size": "L",
      "risk": "High",
      "dependencies": ["1.3", "1.5"],
      "acceptanceCriteria": [
        "A verified-but-irrelevant case FAILS the suite",
        "Relevance is a discrete state, never a score",
        "A retrieval miss reports `no sources found`, never a silent blank"
      ],
      "note": "Closes the last known pathway to a misleading green (R-3). Do not make broader accuracy claims before this lands."
    },
    {
      "order": 11,
      "id": "2.3",
      "title": "Publish the comparison table against BurhanAI, HUMAIN and CiteGuard",
      "epic": "E-1",
      "priority": "Should",
      "size": "S",
      "risk": "Medium",
      "dependencies": ["1.4"],
      "acceptanceCriteria": [
        "Published numbers carry the method difference beside them so they are not read as like-for-like",
        "The table is generated from the benchmark artefact, not hand-maintained"
      ],
      "note": "Peers publish 88.6%, 66.56%, 54.6-65.9% and 68.1%; an unmeasured 100% is worth zero against those."
    },
    {
      "order": 12,
      "id": "2.4",
      "title": "Quarantine-coverage reporting and a visible no-sources-found reason",
      "epic": "E-2",
      "priority": "Should",
      "size": "M",
      "risk": "Low",
      "dependencies": ["1.2"],
      "acceptanceCriteria": [
        "Per-collection quarantine coverage is published in the artefact",
        "A corpus miss surfaces an explicit reason rather than an empty result"
      ],
      "note": "Turns the 41.7% quarantine from a silent recall failure into an honest, disclosed state."
    },
    {
      "order": 13,
      "id": "2.5",
      "title": "Live ledger evaluation replacing replay and placeholder timings (MIZ-110)",
      "epic": "E-1",
      "priority": "Should",
      "size": "M",
      "risk": "Medium",
      "dependencies": ["1.3"],
      "acceptanceCriteria": [
        "Ledger rows carry measured timings from real runs, not replays",
        "A ledger write failure marks the run untrusted rather than failing open",
        "Traces carry questionHash only, never question or corpus text"
      ],
      "note": "Preserves the §16 degradation contract while making operational figures real."
    },
    {
      "order": 14,
      "id": "2.6",
      "title": "Arabic normalisation spec and terminal rendering for the judge surface",
      "epic": "E-6",
      "priority": "Should",
      "size": "M",
      "risk": "Medium",
      "dependencies": ["1.2"],
      "acceptanceCriteria": [
        "Normalisation follows the published spec (strip diacritics and kashida, unify alef and ya)",
        "Exactly one module owns normalisation; a second copy is a §17 breach",
        "A differential test asserts index-time and verify-time folding are byte-identical",
        "Arabic renders legibly in the terminal the judge will use"
      ],
      "note": "The entire benchmark ecosystem is Arabic-first; a divergence between index and verifier folding would show up as false rejections (R-13)."
    }
  ],
  "adrs": [
    {
      "id": "ADR-12",
      "title": "Measure the system arm; never derive it from labels",
      "context": "scripts/benchmark/score.ts computes systemDetectionRate as `expectedVerdict !== \"verified\"`, and all 40 red-team cases are labelled rejected, so the published 1.0 holds for any input whatsoever. data/benchmark/vs-search.json ships this as systemDetectionRate: 1 with a delta of +0.35 against a 65% baseline.",
      "decision": "The system arm becomes a recorded execution of verifyAnswer over the eval set. Any figure derived from expectedVerdict labels is a build failure, enforced by a planted self-test in the same style as the existing rigged-baseline check.",
      "rationale": "A tautology is worse than no number: it is a number that cannot be wrong until the verifier is deleted, and a field-literate judge will find it in the first file they read. Peers publish 88.6%, 68.1% and 66.56% — an unmeasured 100% is worth nothing against them, and a tautological one is worth less than nothing.",
      "consequences": "The benchmark stops being a comparison against the plan and becomes a regression suite over an independent set. It is slower, the published rate may fall below 100%, and that is precisely the point: a number that cannot move is not a measurement. The separate honest-declaration check on the baseline arm is retained — the two arms must stay independent so a shared bug cannot move both in the same direction.",
      "status": "Accepted",
      "date": "2026-09-29"
    },
    {
      "id": "ADR-13",
      "title": "Add a hard baseline outside the verifier's dependency boundary",
      "context": "The 65% comparison arm is a strawman class mizan itself configured: hand-rolled FTS5, k=1, OR-ed tokens, a folded column, no rerun budget. The honest-declaration check proves the harness is not rigged, but it does not make the baseline hard. A field-literate judge will ask for an embedding retriever or a faithfulness scorer.",
      "decision": "Add a dense-retriever arm and an LLM-judge arm as benchmark arms in a separate package that imports nothing from packages/mizan-verify. Gate G-1 continues to enforce that the verifier keeps exactly one dependency and makes no network call.",
      "rationale": "This converts 'a search tool could do this' from an argument into a measured rebuttal on the record, against arms mizan will actually be compared to: SPECTER2 scores 0% on CiteME and CiteGuard with DeepSeek-R1 scores 68.1% against a 69.2% human ceiling, with RAGAS faithfulness correlating only 0.67-0.74 with human labels. arXiv 2605.06635 further shows fact-check accuracy drops about 42% as LLM tool calls scale from 2 to 150, which is the strongest published support for the no-model design.",
      "consequences": "Two new dependencies enter the repository, quarantined from the trust path by G-1. If a baseline wins, we publish that and relocate the claim to the containment gate, which no baseline arm reproduces (R-9). The verification claim itself does not change.",
      "status": "Accepted",
      "date": "2026-09-29"
    },
    {
      "id": "ADR-14",
      "title": "The badge leads; retrieval is demoted",
      "context": "The demo renders retrieval, then generation, then verification, with the VERIFIED/REJECTED badge on line 3 of 5. A judge's eye lands on a search box with extra steps — the exact framing behind the feedback that the project seems useless.",
      "decision": "The computed verdict is the first thing rendered. Retrieval detail is demoted and treated as provenance behind the verdict, not as the product.",
      "rationale": "The differentiated layer is the verdict, and the pipeline is the anti-differentiator. Sanad's evidence-first framing already sells this market; a reviewer looking for the search box will find one if we lead with it.",
      "consequences": "The demo is less impressive at a glance and more accurate about what the product is. Cheap to implement, no measurement changes, and it addresses the reported feedback directly rather than by rebuttal alone.",
      "status": "Accepted",
      "date": "2026-09-29"
    },
    {
      "id": "ADR-15",
      "title": "One eval set, at least three failure classes, never the set the verifier was built from",
      "context": "All 40 red-team cases carry expectedReason quote_absent_at_cited_id. Wrong-number, wrong-collection, truncated and near-miss fabrications are absent, so they would be indistinguishable. A 0/40 result at 95% confidence is roughly [89%, 100%], and a single-class set is a regression test wearing an evaluation's label.",
      "decision": "Build an independent set spanning at least absent-quote, wrong-number, wrong-collection and truncated classes, publish per-class rates with a confidence interval, and set the zero-false-verified bar on that set.",
      "rationale": "A zero-tolerance integrity claim needs a denominator that can actually detect a fault. 40 cases of one failure class cannot distinguish a verifier that catches everything from one that catches only absences.",
      "consequences": "The published aggregate rate will likely fall below 100% and the confidence interval will narrow as the set grows. Both are improvements in the credibility of the claim, not regressions in the product.",
      "status": "Accepted",
      "date": "2026-09-29"
    },
    {
      "id": "ADR-16",
      "title": "No confidence, severity, or trust score on the verdict surface",
      "context": "Competitors ship numeric trust signals: hadith-verifier returns verdict plus confidence plus severity across three source-authority tiers, and TasnidChain returns a T0-T5 weighted composite 'Consensus Verified' score. Mizan's existing 60-char longest-run diagnostic is the temptation: making correction legible could mean exposing a similarity figure.",
      "decision": "Reaffirm AGENTS.md §10 and §15. Correction and relevance emit a discrete state plus a located span, never a percentage, a confidence bucket, or a weighted score. Any fuzzy percentage remains confined to the display-only diagnostics module that verify.ts is forbidden to import, with G-1 enforcing the boundary.",
      "rationale": "The evidence is unusually consistent: 'The Mirage of Hallucination Detection' (EMNLP Findings 2025) finds no metric except GPT-4 aligns with human judgment; arXiv 2606.23915 concludes no single automatic attribution scorer is a reliable fixed default, with LLM judges costing roughly 100x more and remaining non-deterministic. A fuzzy 97% is CWE-345 wearing a nicer hat, and §10 already encodes this.",
      "consequences": "Correction ships less legibly than a rival's '87% confident', and the product is harder to sell on that axis. Accepted deliberately. It is also the sharpest available differentiator against every competitor found: a fail-closed verifier with provably zero false-verified is not a claim a confidence bucket can make.",
      "status": "Accepted",
      "date": "2026-09-29"
    }
  ]
}
```

## Architecture
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
| `scripts/benchmark/score.ts` | **modify** | delete label-derived `detected`; `assertBaselineIsHonest` semantics unchanged |
| `packages/mizan-bench/**` | **create** | separate package for non-FTS5 arms, importing nothing from `mizan-verify` (ADR-13, R-12) |
| `packages/mizan-gate/src/benchmark-provenance.ts` | **create** | structural anti-tautology + arm-suppression scan (B-1, B-4) |
| `packages/mizan-gate/src/adr-citations.ts` | **create** | ADR citation resolution (Story 7) |
| `packages/mizan-gate/src/budgets.ts` | **create** | per-package duration budget — one table |
| `packages/mizan-gate/src/ci.ts` | **modify** | measure duration; fail by name on overrun (B-6) |
| `packages/mizan-gate/src/docs-claims.ts` | **modify** | `benchmark-claim-unbacked`, `adr-citation-dangling` (B-7, B-8) |
| `bunfig.toml` | **create** | explicit `testTimeout`; removes reliance on the 13.2s default |
| `apps/cli/test/fixtures/snapshot.ts` | **create** | shared hermetic snapshot, content-hash keyed |
| `apps/cli/test/{demo,demo-command,benchmark-refusal,happy-path}.test.ts` | **split** | four files over 4s, each re-building a snapshot |
| `specs/adr/ADR-01..ADR-16.md` | **create** | 16 standalone resolvable ADRs |
| `apps/cli/src/render.ts` + `provenance.ts` | **modify/create** | badge first, retrieval demoted (ADR-14) |
| `scripts/eval/mutations.ts`, `plan.ts` | **modify** | new classes; expectations hand-adjudicated, never observed |

### Sprint 2

| File | Action | Why |
|---|---|---|
| `apps/cli/src/correction.ts` | **create** | span computation — **not** `render.ts` (F-C) |
| `packages/mizan-gate/src/gates/g7-*.ts` | **modify** | extend `DISPLAY_PATH`; add G-7.7 (relevance may not name `verified`) |
| `apps/cli/src/relevance.ts` | **create** | discrete relevance state; no model, no similarity |
| `packages/mizan-core/src/normalize/spec.md` | **create** | published normalisation specification (R-13) |
| `scripts/benchmark/peers.ts` | **create** | peer-figure register with method annotations |
| `scripts/coverage-report.ts` | **create** | per-collection quarantine coverage (R-6) |
| `packages/mizan-provenance/src/ledger.ts` | **modify** | measured timings; untrusted-run marking |

---

## 3. Module Design — the Executor/Comparator Split

The central architectural move. Two modules, disjoint types, no shared field the scorer can traverse backwards:

```
scripts/benchmark/
  system-arm.ts   ← imports @mizan/verify, @mizan/corpus
                   ← MUST NOT contain the token "expectedVerdict"   [gate B-1]
  compare.ts      ← imports @mizan/core only
                   ← holds expectedVerdict; produces systemDetected
  intervals.ts    ← pure arithmetic, no I/O
  score.ts        ← figuresOf, assertBaselineIsHonest
  run.ts          ← orchestration, attestation, atomic write
```

`SystemArmRun` = `{ caseId, producedVerdict, producedReason, degraded }`
`SystemArmOutcome` = `{ caseId, producedVerdict, expectedVerdict, agree }`

A planted arm that echoes the label is a **compile error**, not a test failure — strictly stronger than a grep. The `assertBaselineIsHonest` machinery is preserved verbatim; the system arm gains no levers of its own, which is what keeps the two arms independent (a shared bug must not move both numbers).

**Baseline arms** (`packages/mizan-bench/`) use the Strategy pattern behind one `BaselineArm` port: `id`, `status`, `declaration`, `run(cases) → ArmOutcome[]`. The registry composes them; an arm that cannot load returns `status: "unavailable"` with a reason and never a zero.

---

## 4. Data Design — `BenchmarkResult` v2

- `BENCHMARK_SCHEMA_VERSION = 2`; the file records its own version so an old artefact is a decode failure, not a silent misread.
- Fractions in 0..1 everywhere. The word "percent" appears in no schema — existing G-6.3 rule, preserved.
- `RateEstimate = { point, low, high, method: "wilson-score-95", n, k }`. **Wilson**, because 0/40 is exactly the case where a normal approximation misbehaves. The method is a named field, not an implementation detail.
- `ArmStatus = "measured" | "unavailable" | "skipped"` — silence is forbidden.
- `falseVerifiedCount` stays a measured bar, not an assertion, so a violating run leaves an artefact recording the violation.
- `provenance = { commit, corpusSnapshotHash, setHash, toolVersions }` on every run; a run on a different snapshot records both figures rather than overwriting.
- `EvalCase.failureClass ∈ { absent_quote, wrong_number, wrong_collection, truncated, near_miss, non_answering }`, counted in the existing `CountMap` shape.
- `TestBudget = { package, budgetMs, measuredMs }` — one table in `@mizan/gate`.

---

## 5. Error Strategy

| Condition | Behaviour |
|---|---|
| Per-case verifier failure / timeout | `unverifiable`, counted **separately** from detections, never a detection |
| Malformed arm output | `decodeOrFail` failure → named arm failure; never a verdict |
| Arm cannot load (no key, no model) | `unavailable` + reason; system arm unchanged; run does **not** claim a complete comparison |
| **Zero-case eval set** | **Refuses.** Current `rate()` returns `0` for a zero denominator and would publish 0% |
| One case throws | Remaining cases still scored; artefact marked incomplete; exit non-zero |
| Corpus unavailable | `unavailable` + reason, exit non-zero. **Never** falls back to reading expectations |
| Ledger write failure | Run marked untrusted; no fail-open |
| Relevance checker throws/disabled | `undetermined` + disclosure; never `answers`, never a green |
| Budget overrun | Named failure naming package, measurement, budget |

**No retries on the deterministic verifier** — a retry would mask a nondeterminism defect. One documented, count-published retry permitted for network-backed arms only.

---

## 6. Security Architecture

- **OWASP mapping.** A03 (injection): no raw-HTML sinks, G-2 green; corpus text is a text node. A08 (integrity failure): the verifier's containment invariant, G-1/G-6/G-7. A04 (insecure design): the fail-closed default; an empty or undecidable input is `unverifiable`, never `answers`. A09 (logging): §13 — traces carry `questionHash` only. A06 (dependency/supply chain): the `@mizan-bench` boundary; G-1 as the machine-checked control.
- **Validation boundary.** Every artefact field crosses `decodeOrFail`. `JSON.parse` on arm or model output is a defect (§1). `system-arm.ts` is validated by a token ban; `compare.ts` by type separation.
- **Trust boundaries.** Untrusted: model output, arm output, benchmark artefact, eval set files, documents. Trusted: the fold table, the containment rule, the gate table.
- **Data protection.** Artefacts carry ids, hashes, counts, discrete states — never question or corpus text. Keys from env only, never in artefact/log/trace/commit.
- **Secrets.** G-4 gitleaks runs on the staged tree pre-commit and on history in CI.
- **Audit trail.** The docs check reads the **committed** tree via `git show HEAD:<path>`, so an uncommitted edit cannot make an unbacked claim pass (R-11).

---

## 7. Testing Strategy

Every new check carries a **planted violation that must fail** — a guard that cannot fail is not a guard:

| ID | Planted violation | Must |
|---|---|---|
| B-1 | `expectedVerdict` in `system-arm.ts` | gate fails |
| B-2 | constant-`verified` arm | self-test fails |
| B-3 | weakened verifier fixture | rate moves below the bar (monotonicity) |
| B-4 | arm present in run 1, absent in run 2, same hashes | fails (suppression) |
| B-5 | unloadable arm | `unavailable`, not a zero |
| B-6 | budget overrun | named failure, not a flake |
| B-7 | stale numeric claim in a doc | `check:docs` fails naming file+line |
| B-8 | dangling `ADR-03` citation | citation check fails |
| B-9 | relevance unavailable | `undetermined`, never `answers` |
| B-10 | index/verify folding divergence | differential test fails |
| B-11 | ANSI escape in corpus text | neutralised; verdict not hidden |

Coverage targets: 100% of new gate modules (they *are* the tests), 100% branch coverage on `compare.ts` and `intervals.ts`, regression-only on the existing 516.

---

## 8. Performance Plan

- **`apps/cli` ≤ 20s**: the shared snapshot fixture removes ~5 of 6 `buildSnapshot` hook calls. This is the single largest and cheapest win, and it is a *test-infrastructure* change, not a test-logic change (deleting tests is out of scope).
- Full `bun run ci` < 5 min on both OSes; per-OS headroom in the budget table, because `windows-latest` is measurably slower and one shared budget is either too loose or too tight.
- 40 cases offline ≤ 30s; 200 cases ≤ 120s; p95 per case ≤ 100ms. Artefact write is **atomic** (temp → rename).
- The benchmark is a **non-gating** CI job. A 5-minute dense arm must never be able to red the 5-minute gate — that is how a measurement becomes a liability.
- Folding ≤ 5µs/KB with a precomputed table; zero added answer-path latency.

---

## 9. Risk Assessment

- **R-15 capacity (High, live).** Declared minimum shippable slice: **1.1 → 1.2 → 1.3 → 1.6 → 1.8**. Never drop 1.1, 1.3, or 1.6.
- **R-16 merge conflict (Medium).** Four stories write the benchmark contract. The contract freezes in `@mizan/core` in Story 3; later stories are additive and decode at the boundary. Gate edits are **sequenced, not parallelised**.
- **R-9 baseline wins (Medium).** Committed in advance. Suppression is a self-test failure (B-4). Relocate the claim to the containment gate.
- **R-1 tautology (Critical).** Closed by the type split, not by a grep.
- **R-13 folding divergence (Medium).** One owning module (§17), published spec, differential test in CI, Unicode version declared so a Bun upgrade cannot silently move verdicts.

---

## 10. Technology Trends

The plan adopts, rather than reinvents: **Wilson score intervals** (the standard for small-n proportions and 0/n cases); **Schema-first decoding** at every trust boundary, already the house pattern; **Strategy/registry** for pluggable benchmark arms; and a **structural over behavioural** control wherever a type can express a constraint a test can only approximate. It declines, on published evidence, everything the market is converging toward and that §10/§15 forbid: confidence buckets, severity scores, weighted trust composites. arXiv 2605.06635 (fact-check accuracy drops ~42% as tool calls scale 2→150) and 2606.23915 (no reliable fixed attribution scorer) are the strongest published support for keeping the verdict path model-free. The deliberate non-feature is the sharpest differentiator: **a fail-closed verifier with provably zero false-verified is a claim a confidence bucket cannot make.**

```json
{
  "moduleStructure": [
    { "path": "scripts/benchmark/system-arm.ts", "package": "@mizan/scripts", "action": "create", "sprint": 1, "story": "1.3", "responsibility": "Execute verifyAnswer once per eval case. Input is cases; output is SystemArmRun { caseId, producedVerdict, producedReason, degraded }. MUST NOT contain the token expectedVerdict; gate B-1 enforces.", "dependsOn": ["@mizan/verify", "@mizan/corpus"], "forbiddenImports": ["src/diagnostics/"] },
    { "path": "scripts/benchmark/compare.ts", "package": "@mizan/scripts", "action": "create", "sprint": 1, "story": "1.3", "responsibility": "Pure join of SystemArmRun against expectations into SystemArmOutcome. Sole owner of the agreement predicate. Imports @mizan/core only.", "dependsOn": ["@mizan/core"] },
    { "path": "scripts/benchmark/intervals.ts", "package": "@mizan/scripts", "action": "create", "sprint": 1, "story": "1.3", "responsibility": "Wilson score 95% interval. Refuses a zero denominator rather than returning 0. Method name is a published field.", "dependsOn": [] },
    { "path": "scripts/benchmark/score.ts", "package": "@mizan/scripts", "action": "modify", "sprint": 1, "story": "1.3", "responsibility": "Retain figuresOf and assertBaselineIsHonest unchanged; delete the label-derived detected field at line 99 and delegate agreement to compare.ts.", "dependsOn": ["./compare.ts", "./intervals.ts"] },
    { "path": "scripts/benchmark/run.ts", "package": "@mizan/scripts", "action": "modify", "sprint": 1, "story": "1.3", "responsibility": "Orchestration. Runs the arm, the comparator, and any mizan-bench arms; attests before and after; writes the artefact atomically (temp then rename).", "dependsOn": ["./system-arm.ts", "./compare.ts"] },
    { "path": "packages/mizan-bench/src/arm.ts", "package": "@mizan-bench", "action": "create", "sprint": 1, "story": "1.4", "responsibility": "The BaselineArm port: id, status, declaration, run(cases) => ArmOutcome[]. Strategy pattern; an arm cannot construct a mizan verdict.", "dependsOn": ["@mizan/core"] },
    { "path": "packages/mizan-bench/src/arms/{fts5,dense,judge}.ts", "package": "@mizan-bench", "action": "create", "sprint": 1, "story": "1.4", "responsibility": "Three arm implementations. Unloadable arms return status 'unavailable' with a reason. Judge output is schema-decoded; a self-reported 'verified' is never a verdict.", "dependsOn": ["./arm.ts"] },
    { "path": "packages/mizan-bench/src/registry.ts", "package": "@mizan-bench", "action": "create", "sprint": 1, "story": "1.4", "responsibility": "Arm registry and per-arm isolation. Imports NOTHING from packages/mizan-verify; G-1 plus a boundary rule keep the arms off the verdict path.", "dependsOn": ["./arms/*"] },
    { "path": "packages/mizan-gate/src/benchmark-provenance.ts", "package": "@mizan/gate", "action": "create", "sprint": 1, "story": "1.3/1.4", "responsibility": "Structural checks B-1 (label-derived arm) and B-4 (arm suppression across runs at equal hashes). Pure over the scanned tree so it is testable by planting.", "dependsOn": ["./scan.ts"] },
    { "path": "packages/mizan-gate/src/budgets.ts", "package": "@mizan/gate", "action": "create", "sprint": 1, "story": "1.2", "responsibility": "Single per-package test-duration budget table with per-OS headroom. One declared location for any timeout change.", "dependsOn": [] },
    { "path": "packages/mizan-gate/src/ci.ts", "package": "@mizan/gate", "action": "modify", "sprint": 1, "story": "1.2", "responsibility": "Measure per-package duration; on overrun emit a named failure carrying package, measurement and budget. Exit semantics 0/1/2 preserved; no retries.", "dependsOn": ["./budgets.ts"] },
    { "path": "packages/mizan-gate/src/adr-citations.ts", "package": "@mizan/gate", "action": "create", "sprint": 1, "story": "1.7", "responsibility": "Resolve every ADR-NN citation in code to a standalone file; report all unresolved citations in one pass naming file and line. Folds into check:docs.", "dependsOn": ["./docs-gates.ts"] },
    { "path": "packages/mizan-gate/src/docs-claims.ts", "package": "@mizan/gate", "action": "modify", "sprint": 1, "story": "1.6/1.7", "responsibility": "Add rules benchmark-claim-unbacked and adr-citation-dangling. Reads the COMMITTED tree, never the working tree. Never auto-modifies a document.", "dependsOn": ["./adr-citations.ts"] },
    { "path": "apps/cli/test/fixtures/snapshot.ts", "package": "@mizan/cli", "action": "create", "sprint": 1, "story": "1.2", "responsibility": "Shared hermetic snapshot built once per package run and keyed by content hash. Removes ~5 of 6 buildSnapshot hook calls and the 26.6s suite duration.", "dependsOn": ["@mizan/corpus"] },
    { "path": "apps/cli/src/render.ts", "package": "@mizan/cli", "action": "modify", "sprint": 1, "story": "1.8", "responsibility": "Reorder to verdict, then source and quote, then provenance. The verdict badge is the first rendered element. No percentage on the verdict surface.", "dependsOn": ["./provenance.ts"] },
    { "path": "apps/cli/src/provenance.ts", "package": "@mizan/cli", "action": "create", "sprint": 1, "story": "1.8", "responsibility": "Retrieval internals, behind an explicit --provenance opt-in. Demoted from first impression to provenance.", "dependsOn": [] },
    { "path": "apps/cli/src/correction.ts", "package": "@mizan/cli", "action": "create", "sprint": 2, "story": "2.1", "responsibility": "Correction span: record id plus character offsets. NOT render.ts, which is already in G-7 DISPLAY_PATH. render.ts imports the span, never the similarity.", "dependsOn": ["@mizan/verify"], "forbiddenImports": [] },
    { "path": "apps/cli/src/relevance.ts", "package": "@mizan/cli", "action": "create", "sprint": 2, "story": "2.2", "responsibility": "Discrete relevance state {answers | doesNotAnswer | undetermined}. No model, no network, no similarity, no second corpus scan. Fail-closed default is undetermined.", "dependsOn": ["@mizan/core"] },
    { "path": "packages/mizan-core/src/normalize/spec.md", "package": "@mizan/core", "action": "create", "sprint": 2, "story": "2.6", "responsibility": "Published normalisation specification: diacritics and tatweel stripped, alef and ya unified, zero-width policy stated with its fail-closed direction. Unicode data version declared.", "dependsOn": ["./fold-table.ts"] }
  ],
  "apiInterfaces": [
    { "name": "runSystemArm", "location": "scripts/benchmark/system-arm.ts", "input": "{ cases: readonly ScoredCaseInput[]; snapshot: SnapshotHandle; deadlineMs: number }", "output": "Result<readonly SystemArmRun[], ArmFailure>", "errors": ["arm_unavailable", "corpus_unavailable", "budget_exceeded"], "invariants": ["No access to expectedVerdict (gate B-1)", "No network call", "Never imports src/diagnostics/"] },
    { "name": "compareSystemArm", "location": "scripts/benchmark/compare.ts", "input": "{ cases: readonly ScoredCase[]; runs: readonly SystemArmRun[] }", "output": "readonly SystemArmOutcome[]", "errors": ["duplicate_case_id", "missing_run_for_case"], "invariants": ["Pure; no clock, no database, no network", "agreement is producedVerdict vs expectedVerdict, never the reverse"] },
    { "name": "wilsonInterval", "location": "scripts/benchmark/intervals.ts", "input": "{ hits: number; total: number; z: 1.96 }", "output": "Result<RateEstimate, ZeroDenominator>", "errors": ["zero_denominator"], "invariants": ["Refuses total === 0 rather than returning 0 (closes the publish-a-0% hole)", "Fractions in 0..1; no percent field"] },
    { "name": "figuresOf", "location": "scripts/benchmark/score.ts", "input": "readonly SystemArmOutcome[] plus per-arm ArmOutcome[]", "output": "BenchmarkResult (schemaVersion 2)", "errors": ["incomplete_run"], "invariants": ["falseVerifiedCount is measured, not asserted", "systemAbstentionRate published so detect-by-abstaining is visible"] },
    { "name": "assertBaselineIsHonest", "location": "scripts/benchmark/score.ts", "input": "BaselineOptions", "output": "readonly string[]", "errors": [], "invariants": ["Unchanged semantics", "Now also covers @mizan-bench arms; a moved lever returns a named problem, not a boolean"] },
    { "name": "BaselineArm.run", "location": "packages/mizan-bench/src/arm.ts", "input": "readonly ArmCase[]", "output": "Result<readonly ArmOutcome[], ArmFailure>", "errors": ["model_unavailable", "no_api_key", "dimension_mismatch", "timeout"], "invariants": ["Unloadable arm yields status 'unavailable' with a reason, never a zero", "An arm may not construct or read a mizan verdict"] },
    { "name": "checkBenchmarkProvenance", "location": "packages/mizan-gate/src/benchmark-provenance.ts", "input": "readonly SourceFile[]", "output": "readonly Finding[]", "errors": ["B-1 label-derived detection", "B-4 arm suppression at equal hashes"], "invariants": ["Pure over the tree so a planted violation is testable", "Never reads the artefact to decide whether a rule holds"] },
    { "name": "enforceTestBudget", "location": "packages/mizan-gate/src/ci.ts", "input": "{ package: PackagePlan; measuredMs: number }", "output": "Result<void, BudgetOverrun>", "errors": ["budget_exceeded", "no_duration_reported"], "invariants": ["A package reporting no duration FAILS rather than reporting zero", "Failure names package, measurement and budget"] },
    { "name": "checkAdrCitations", "location": "packages/mizan-gate/src/adr-citations.ts", "input": "readonly SourceFile[] plus the ADR directory listing", "output": "readonly DocsClaim[]", "errors": ["adr-citation-dangling", "adr-missing-sections", "adr-supersession-broken"], "invariants": ["Reports every unresolved citation in one pass", "A missing cited file is a hard failure"] },
    { "name": "relevanceState", "location": "apps/cli/src/relevance.ts", "input": "{ question: string; quote: string; citedRecord: CorpusRecord }", "output": "RelevanceState", "errors": ["malformed_question -> undetermined"], "invariants": ["Discrete state only; no probability, confidence or percentage", "Never collapsed from undetermined into answers", "No ML or fuzzy similarity in the path to a green badge"] },
    { "name": "correctionSpan", "location": "apps/cli/src/correction.ts", "input": "{ quote: string; citedRecord: CorpusRecord }", "output": "Result<CorrectionSpan | null, NoOverlap>", "errors": ["no_overlap -> null span, never an empty string as a location"], "invariants": ["No percentage, confidence or severity on the output surface (ADR-16)", "Tie-break deterministic and byte-identical across runs"] }
  ],
  "dataModels": [
    { "name": "SystemArmRun", "file": "scripts/benchmark/system-arm.ts", "fields": ["caseId: string", "producedVerdict: Verdict", "producedReason: VerdictReason", "degraded: readonly string[]"], "purpose": "What the verifier actually did. Deliberately contains no expectedVerdict, so the agreement predicate has nowhere to read a label from." },
    { "name": "SystemArmOutcome", "file": "scripts/benchmark/compare.ts", "fields": ["caseId: string", "producedVerdict: Verdict", "expectedVerdict: Verdict", "agree: boolean", "abstained: boolean"], "purpose": "The join. Held only by compare.ts, which is the sole place a label may meet a measurement." },
    { "name": "RateEstimate", "file": "packages/mizan-core/src/schema/benchmark.ts", "fields": ["point: number", "low: number", "high: number", "method: 'wilson-score-95'", "n: number", "k: number"], "purpose": "Every published rate carries its uncertainty, its method and its denominator. Wilson because 0/40 is precisely the case a normal approximation mishandles." },
    { "name": "BenchmarkArm", "file": "packages/mizan-core/src/schema/benchmark.ts", "fields": ["id: string", "kind: 'fts5-bm25' | 'dense' | 'llm-judge'", "status: 'measured' | 'unavailable' | 'skipped'", "declaration: BaselineDeclaration", "modelId: null | string", "top1HitRate: RateEstimate", "reason: null | string"], "purpose": "One comparable arm in the artefact. 'unavailable' is a first-class value so a missing arm is visible rather than a zero." },
    { "name": "BenchmarkResult (v2)", "file": "packages/mizan-core/src/schema/benchmark.ts", "fields": ["schemaVersion: 2", "preRegisteredHypothesis: string", "provenance: { commit, corpusSnapshotHash, setHash, toolVersions }", "caseCount: number", "classCounts: Record<string, number>", "systemArm: { top1HitRate: RateEstimate, abstentionRate: RateEstimate, falseVerifiedCount: number }", "baselineArms: readonly BenchmarkArm[]", "perClass: readonly { failureClass, n, detected: RateEstimate }[]", "delta: { systemVsBestBaseline: number }"], "purpose": "The published artefact. Fractions only, no percent key, and a version bump so an old artefact is a decode failure rather than a silent misread." },
    { "name": "FailureClass", "file": "packages/mizan-core/src/schema/eval.ts", "fields": ["absent_quote", "wrong_number", "wrong_collection", "truncated", "near_miss", "non_answering"], "purpose": "The fabrication taxonomy, kept separate from expectedReason, which is the verifier's own reason vocabulary. Conflating them is exactly the R-4 defect: wrong-number, wrong-collection and truncated would be indistinguishable." },
    { "name": "TestBudget", "file": "packages/mizan-gate/src/budgets.ts", "fields": ["package: string", "budgetMs: number", "osHeadroom: { linux: number; windows: number }"], "purpose": "One declared location for every test timeout. windows-latest is measurably slower, so a single shared budget is either too loose or too tight." },
    { "name": "RelevanceState", "file": "apps/cli/src/relevance.ts", "fields": ["kind: 'answers' | 'doesNotAnswer' | 'undetermined'", "reason: null | string"], "purpose": "Downstream of the verdict, never upstream. A contained-but-non-answering claim cannot present as a full green." },
    { "name": "CorrectionSpan", "file": "apps/cli/src/correction.ts", "fields": ["recordId: string", "startOffset: number", "endOffset: number", "coordinateSpace: 'folded'", "text: string"], "purpose": "A located span, never a score. Folded coordinate space is stated explicitly because Arabic combining marks make a naive display mapping wrong." },
    { "name": "PeerFigure", "file": "scripts/benchmark/peers.ts", "fields": ["name: string", "value: number", "metric: string", "corpus: string", "task: string", "humanCeiling: null | number", "sourceUrl: string", "asOf: string"], "purpose": "A peer number with its method difference attached, so 88.6 / 68.1 / 66.56 / 54.6-65.9 are never read as like-for-like against a containment metric." },
    { "name": "CoverageReport", "file": "scripts/coverage-report.ts", "fields": ["collection: string", "totalRows: number", "quarantinedRows: number", "coverageFraction: number | null", "reasons: Record<string, number>"], "purpose": "Turns the 41.7% quarantine from a silent recall failure into a disclosed, per-collection boundary. 0/0 publishes neither 0% nor 100%." }
  ],
  "testingStrategy": {
    "principle": "Every gate and every new check ships with a planted violation that must fail. A guard that cannot fail is not a guard (AGENTS.md section 14). The anti-tautology control is structural rather than behavioural: the executor and comparator are separate modules with disjoint types, so a label-echoing arm is a compile error, not merely a failing assertion.",
    "plantedViolations": [
      "B-1: token expectedVerdict in system-arm.ts -> gate fails",
      "B-2: constant-verified arm -> self-test fails",
      "B-3: weakened verifier fixture -> rate moves below the bar (monotonicity)",
      "B-4: arm present in run 1 and absent in run 2 at equal hashes -> fails (suppression)",
      "B-5: unloadable arm -> 'unavailable' with a reason, never a zero",
      "B-6: budget overrun -> named failure, not a flake",
      "B-7: stale numeric claim planted in a document -> check:docs fails naming file and line",
      "B-8: dangling ADR-03 citation -> citation check fails",
      "B-9: relevance checker disabled -> 'undetermined', never 'answers'",
      "B-10: index-time vs verify-time folding divergence -> differential test fails",
      "B-11: ANSI escape planted in corpus text -> neutralised, verdict not hidden"
    ],
    "coverage": "100% of new gate modules (they are the tests); 100% branch coverage on compare.ts and intervals.ts; regression-only on the existing 516.",
    "securityTests": ["B-7, B-8, B-9, B-11 plus G-2 (no raw HTML) and G-4 (gitleaks on staged tree and on history) staying green."],
    "performanceTests": ["apps/cli <= 20s standalone via the shared snapshot fixture; full ci < 5 min on both OSes; 40 eval cases <= 30s offline and 200 <= 120s with p95 <= 100ms per case; check:docs <= 20s; ADR citation check <= 10s; coverage report <= 30s off the answer path; folding <= 5us per 1KB."],
    "ciStrategy": "The benchmark runs as a NON-GATING job so a 5-minute dense arm can never red the 5-minute gate. The per-package budget is a named assertion: a package that reports no duration fails rather than reporting zero. No retries anywhere, on either OS, for ten consecutive runs."
  },
  "office_auto_approve": { "confidence": 0.62, "evidence": "Sprint 1 architecture is grounded in code that was read and measured, not assumed; the executor/comparator type split makes the central fix (Story 1.3) stronger than specified and compile-checkable. Confidence is held below threshold on delivery, not design: PM's own R-15 puts Sprint 1 at 13.5 person-months against roughly 3 available, and three decisions remain open - which hard baseline arm to build first (dense retriever vs LLM judge), whether a model download is permitted in the evaluation environment, and whether data/corpus.db is committed under licence. Story 1.4 alone is 4.0 person-months and the highest technical risk in the plan." }
}
```

```json
{"office_fact_memory":[{"fact":"mizan's benchmark tautology is a TYPE defect, not a coding mistake: ScoredCase carries expectedVerdict and the produced verdict is computed in the same object literal at scripts/benchmark/score.ts:99, so no caller can score a run without holding the labels. The correct fix is to split executor (system-arm.ts, never sees expectedVerdict) from comparator (compare.ts) into separate modules with disjoint types, making a label-echoing arm a compile error rather than a failing test.","phase":"at","evidence":"Read scripts/benchmark/score.ts lines 55-111 and scripts/benchmark/run.ts lines 199-202; SystemArmRun and SystemArmOutcome are separate types with no shared traversable field.","confidence":0.93},{"fact":"G-7's DISPLAY_PATH already includes apps/cli/src/render.ts, so G-7.2 (no similarity) and G-7.4 (no percent-shaped property keys) actively scan it. Sprint 2's correction surface therefore cannot be implemented in render.ts without tripping a live gate; it must live in a sibling module (apps/cli/src/correction.ts) and DISPLAY_PATH must be extended to cover it, which G-7.6 then enforces as present.","phase":"at","evidence":"packages/mizan-gate/src/gates/g7-verdict-path-purity.ts line 67 declares DISPLAY_PATH = ['apps/cli/src/render.ts']; pathAndDisplay merges it into the closure scanned by G-7.2 and G-7.4.","confidence":0.95},{"fact":"apps/cli's 26.6s test duration is six redundant buildSnapshot calls in beforeAll/afterAll hooks across different files, not one slow file. Measured per-file: demo 7.9s, demo-command 7.4s, benchmark-refusal 5.7s, happy-path 4.2s, benchmark 1.5s, cli 0.7s, eval 0.9s, anchor 0.6s, provider-config 0.6s, demo-key-closure 1.4s. Under CI load each crosses Bun's 13.2s default per-hook timeout. The fix is a shared content-hash-keyed hermetic snapshot fixture in apps/cli/test/fixtures/, not a retry.","phase":"at","evidence":"Timed each apps/cli/test/*.test.ts individually with bun test; grep found buildSnapshot in benchmark-refusal, benchmark, cli, demo, eval and happy-path test files.","confidence":0.94}]}
```