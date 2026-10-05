# Spec: deep-honest-review-and-analysis-the-office-mode-at-project-c-use

**Request:** deep honest review and analysis the office mode at project C:\Users\Saudi\Desktop\opencode-office also the hister project at https://github.com/asciimoo/hister and find how we can enhance this project (mizan) and enrich it from the both projects , so need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
I need to break down the CEO specification into INVEST-compliant user stories with all required elements. Let me create the stories systematically based on the backlog (M1-M4, S1-S4).

# Refined User Stories

## Sprint 1

### Story 1: Land the uncommitted governance work as reviewed commits

**Epic**: E1 - Land the tree  
**Priority**: Must (Critical)  
**RICE Score**: Reach=10, Impact=3, Confidence=1.0, Effort=2 → (30)/2 = **15.0**

**As a** technical lead,  
**I want** to land the completed governance body (30+ modified/untracked files including ADR-15, ADR-17, degradation vocab, dataset identity hashing, coverage gate, accept-customer) in reviewed commits,  
**so that** the working tree is clean and the fully-passing CI state is recorded.

**INVEST Checklist:**
- [x] **Independent**: Can be done without other stories once CI is green
- [x] **Negotiable**: Commit message format can be refined
- [x] **Valuable**: Prevents loss of reviewed work and establishes a clean baseline
- [x] **Estimable**: Effort is clear (review + commit)
- [x] **Small**: Single commit set, completable in sprint
- [x] **Testable**: git status + CI verification

**Dependencies**: None (blocking for others)  
**Blocking Dependencies**: None

**Acceptance Criteria (Given/When/Then):**

```
Scenario: Working tree becomes clean after landing
  Given a dirty working tree with 30+ modified/untracked files
  When all changes are committed in a reviewed commit set
  Then git status --short returns empty
  And the deletion of packages/mizan-corpus/src/served.ts is justified in the commit message

Scenario: CI remains green at landed commit
  Given the commit set is prepared
  When bun run ci executes at the landed commit
  Then all 13 packages pass typecheck
  And all 7 gates pass with self-tests
  And exit code is 0
```

**Security Scenarios:**

```
Scenario: No secrets introduced in commit set
  Given the commit set contains only tracked file modifications
  When gitleaks/G-4 checks run as part of CI
  Then no secrets are detected
  And the planted secret self-test still fails appropriately

Scenario: Licence posture preserved
  Given new files include ADRs and code
  When G-5 licence fields gate executes
  Then all enabled sources have valid licence metadata
  And no AGPL lines from external sources are introduced
```

**Edge Cases:**

- **State Edge Case**: Partial commit - ensure atomic change set or revert
- **Data Edge Case**: Binary files - none expected, verify via git diff --name-only
- **Input Edge Case**: Large diff - ensure reviewable, consider split only if necessary
- **Reliability**: If CI fails mid-land, do not amend - create fix commit

**Performance Requirements:**
- **Response Time**: CI completes within 5 minutes (repo constraint)
- **Throughput**: N/A
- **Resource Limits**: Standard CI resources
- **Scalability**: One-off operation

**Reliability Requirements:**
- **Error Handling**: If CI fails, abort landing, fix issues, retry
- **Timeout Behavior**: CI must not timeout under normal conditions; if timeout, treat as failure
- **Retry Strategy**: No retry without fixing root cause
- **Graceful Degradation**: Do not proceed if git status still dirty after commit attempt

---

### Story 2: Fact-memory contradiction gate plus repair of four stale facts

**Epic**: E3 - Honest memory  
**Priority**: Must (Medium)  
**RICE Score**: Reach=8, Impact=2, Confidence=0.95, Effort=2 → (15.2)/2 = **7.6**

**As a** system maintainer,  
**I want** a build gate that fails when a durable fact contradicts committed artifacts,  
**so that** fact memory never asserts claims contradicted by the codebase (e.g., office_facts_research.json fact 4 vs ADR-15).

**INVEST Checklist:**
- [x] Independent: Can be added as gate once tree is clean
- [x] Negotiable: Contradiction detection strategy can be tuned
- [x] Valuable: Prevents integrity drift in durable memory
- [x] Estimable: Known scope (4 facts + gate logic)
- [x] Small: Fits single sprint
- [x] Testable: Has planted-violation self-test

**Dependencies**: Story 1 (land tree)  
**Blocking Dependencies**: None for this story, but Story 1 must complete first

**Acceptance Criteria:**

```
Scenario: Gate detects contradiction between fact and artifact
  Given a durable fact asserts "Quran and Tirmidhi unmeasured" 
  And committed artifacts (vs-search.json) show 6 measured, 0 unmeasured
  When the contradiction gate runs
  Then the build fails with a clear error message
  And the message identifies the conflicting fact and artifact

Scenario: Gate passes when facts are consistent
  Given all durable facts are validated against committed artifacts
  And no contradictions exist
  When the contradiction gate runs
  Then the gate passes

Scenario: Stale facts are repaired or superseded
  Given office_facts_research.json fact 4 contradicts ADR-15
  When the fact is corrected or superseded with a reason code
  Then the contradiction is resolved
  And the fact includes evidence and reason

Scenario: Planted-violation self-test fails appropriately
  Given a test injects a deliberate contradiction
  When the gate's self-test executes
  Then the test fails if contradiction not detected
  And passes only when detection works
```

**Security Scenarios:**

```
Scenario: Facts never contain secrets
  Given facts are written to durable memory
  When fact memory is serialized
  Then no credentials, tokens, or PII appear
  And confidence values remain in valid range
```

**Edge Cases:**

- **Data Edge Case**: "unmeasured" is never rendered as `0` - enforce as first-class vocabulary
- **State Edge Case**: Missing artifact file - treat as contradiction or fail closed with clear error
- **Input Edge Case**: Malformed JSON in fact memory - fail closed
- **Logic Edge Case**: Multiple contradictions - report all of them
- **Reliability**: Corrupted fact file uses salvage-on-corrupt per office patterns

**Performance Requirements:**
- **Response Time**: Gate execution < 1 second
- **Resource Limits**: Minimal I/O
- **Scalability**: Small fact set

**Reliability Requirements:**
- **Error Handling**: Fail closed on any parsing/validation error
- **Timeout Behavior**: No external calls, immediate completion
- **Retry Strategy**: Not applicable
- **Graceful Degradation**: "unavailable is first-class outcome, never empty set" - apply to fact memory

---

### Story 3: Held-out set with authoring protocol, digest, and published FPR delta

**Epic**: E2 - Held-out credibility  
**Priority**: Must (High)  
**RICE Score**: Reach=10, Impact=3, Confidence=0.9, Effort=3 → (27)/3 = **9.0**

**As a** credibility owner,  
**I want** a contamination-resistant held-out fabrication set authored under a strict protocol (forbidding reading scripts/eval/plan.ts), with dataset digest and published dev-vs-holdout FPR delta,  
**so that** the weakest link in docs/value-proof.md becomes the strongest evidence.

**INVEST Checklist:**
- [x] Independent: Can be created once baseline is stable
- [x] Negotiable: Protocol wording/details negotiable
- [x] Valuable: Directly addresses "systemDetectionRate = 1.0 over 40 self-authored cases"
- [x] Estimable: Known structure from HALLMARK
- [x] Small: Focused set, not massive
- [x] Testable: falseVerifiedCount == 0, delta published, check:docs enforced

**Dependencies**: Story 1  
**Blocking Dependencies**: None

**Acceptance Criteria:**

```
Scenario: Authoring protocol committed
  Given a need for held-out set
  When protocol is written
  Then it explicitly forbids reading scripts/eval/plan.ts
  And it defines authorship by "who wrote it and what they could read" (not directory)
  And it is committed as an artifact

Scenario: Held-out set has verifiable identity
  Given the held-out set is created
  When dataset digest is computed
  Then digest covers the protocol and set contents
  And identity is verifiable via dataset-identity hashing

Scenario: Held-out set has zero false verifications
  Given the held-out fabrication set
  When evaluated against the verifier
  Then hold-out falseVerifiedCount == 0

Scenario: FPR delta published and enforced
  Given dev set and held-out set results
  When dev-vs-holdout FPR delta is computed
  Then delta is published in docs/value-proof.md
  And check:docs machine-checks the published delta
  And delta is published even if it widens the gap

Scenario: check:docs enforces the claim
  Given the delta is published
  When bun run check:docs executes
  Then it validates the delta against computed values
  And fails if values don't match
```

**Security Scenarios:**

```
Scenario: Held-out set never enters prompts
  Given adversarial fabrications in the set
  When system runs normally
  Then the set is never seeded into any LLM prompt
  And never returned by MCP
  And stored as repo-internal data only

Scenario: Traces contain only hashes
  Given evaluation runs on held-out set
  When traces/logs are generated
  Then only questionHash appears, never question text or fabrication content
```

**Edge Cases:**

- **Data Edge Case**: Set contains adversarial religious text - treat as sensitive internal data
- **State Edge Case**: Delta calculation with division by zero - handle fail-closed
- **Input Edge Case**: Contamination detected - protocol violation, reject set
- **Reliability**: If falseVerifiedCount > 0, fail the build - cannot publish with false verification

**Performance Requirements:**
- **Response Time**: Evaluation runs complete within CI time budget
- **Resource Limits**: Standard
- **Scalability**: Small held-out set

**Reliability Requirements:**
- **Error Handling**: Fail closed if any verification of held-out set produces unexpected result
- **Timeout Behavior**: Per-test timeouts
- **Retry Strategy**: Deterministic - no retry needed
- **Graceful Degradation**: Never silently accept contamination

---

### Story 4: Recall-preserving latency pass on the shipped exhaustive scan

**Epic**: E4 - Recall-preserving latency  
**Priority**: Must (High)  
**RICE Score**: Reach=10, Impact=3, Confidence=0.95, Effort=2 → (28.5)/2 = **14.25**

**As a** performance engineer,  
**I want** to reduce nearest-quote suggestion latency using only ADR-08's answer-preserving levers (allocation reduction, stricter ranking floor),  
**so that** p50 drops below 686ms while recall remains unchanged at 40/40 top-5.

**INVEST Checklist:**
- [x] Independent: Optimization work isolated to retrieval/suggest
- [x] Negotiable: Which levers to apply, how much
- [x] Valuable: Addresses worst user-visible latency
- [x] Estimable: Clear baseline (686ms p50, 40/40 top-5)
- [x] Small: Targeted changes
- [x] Testable: Recall regression gate blocks record if recall drops

**Dependencies**: Story 1  
**Blocking Dependencies**: None

**Acceptance Criteria:**

```
Scenario: Recall remains unchanged
  Given baseline recall is 40/40 top-5 (recorded in vs-search.json)
  When optimized code runs via bun run eval:suggestions
  Then recall at top-5 remains exactly 40/40
  And suggestionPresenceTop5 equals the recorded baseline
  And no recall regression is detected

Scenario: Latency improves
  Given baseline p50 is 686ms
  When optimized code runs
  Then p50 is below 686ms
  And latency measurements are recorded in vs-search.json (with normal run-to-run variance)

Scenario: Recall regression blocks the record
  Given an optimization that would drop recall
  When bun run eval:suggestions --record executes
  Then recallRegression returns failure
  And the record is NOT written
  And the build/process fails
  And refusal to publish ungated number is treated as success

Scenario: Only answer-preserving levers used
  Given optimizations applied
  When changes are reviewed
  Then no second store, no dense/vector ranker added to verifier path
  Then only ADR-08's levers (allocation reduction, stricter ranking floor) are used
  And G-1 scope unchanged
```

**Security Scenarios:**

```
Scenario: No new trust boundary introduced
  Given retrieval optimizations
  When code changes
  Then no network calls, no randomness, no clock dependencies added
  And verifier path remains pure (exact|none only)
```

**Edge Cases:**

- **State Edge Case**: Non-record mode must not bypass recall check - verify via scripts/accept-customer.ts behavior
- **Data Edge Case**: Run-to-run latency variance - use p50 trend, not single run
- **Input Edge Case**: Edge cases in query set - all 40 cases must maintain recall
- **Reliability**: Latency may not improve - if recall only preserved with no gain, that's acceptable as long as recall gate passes

**Performance Requirements:**
- **Response Time**: p50 < 686ms (target improvement)
- **Throughput**: No degradation in throughput
- **Resource Limits**: Memory allocation reduced vs baseline
- **Scalability**: Improvement holds for 27,234 records

**Reliability Requirements:**
- **Error Handling**: If recall check fails, abort with clear error
- **Timeout Behavior**: eval:suggestions has appropriate timeout
- **Retry Strategy**: Deterministic - single run sufficient
- **Graceful Degradation**: Refusing to publish ungated number is success (explicit in requirements)

---

## Sprint 2

### Story 5: Load generator and measured throughput rows

**Epic**: E5 - Measured scale  
**Priority**: Should (Medium)  
**RICE Score**: Reach=7, Impact=2, Confidence=0.9, Effort=3 → (12.6)/3 = **4.2**

**As a** reliability engineer,  
**I want** a load generator that drives concurrent verification against a real corpus snapshot,  
**so that** read/write throughput rows in docs/scaling-path.md move from "untested" to measured with conditions blocks.

**INVEST Checklist:**
- [x] Independent: Can build generator independently
- [x] Negotiable: Test scenarios and concurrency levels negotiable
- [x] Valuable: Fills documented gap
- [x] Estimable: Clear requirements
- [x] Small: Focused harness
- [x] Testable: Produces measurable, reproducible numbers

**Dependencies**: Story 1  
**Blocking Dependencies**: None

**Acceptance Criteria:**

```
Scenario: Load generator drives concurrent verification
  Given a real corpus snapshot
  When load generator runs with configurable concurrency
  Then it drives concurrent verification requests
  And measures throughput (ops/sec) and latency distribution
  And produces reproducible results under controlled conditions

Scenario: Throughput rows published with conditions
  Given measurements from load generator
  When docs/scaling-path.md is updated
  Then read throughput row includes measured value and conditions block
  Or if not measurable in test env, row remains "untested" with stated reason

Scenario: Results are deterministic in structure
  Given same snapshot and concurrency params
  When run multiple times
  Then measurement structure is consistent
  And conditions block fully documents environment

Scenario: No external network in load test
  Given load generator
  When executing
  Then all verification uses local corpus only
  And no external dependencies
```

**Security Scenarios:**

```
Scenario: Load test doesn't expose data
  Given load generator produces reports
  When reports are written
  Then no corpus text, questions, or secrets in reports
  And only aggregated metrics
```

**Edge Cases:**

- **State Edge Case**: Insufficient resources - document in conditions block
- **Data Edge Case**: Empty corpus snapshot - fail closed with error
- **Input Edge Case**: Invalid concurrency (negative/zero) - reject
- **Reliability**: "untested with stated reason" is acceptable outcome if environment doesn't support

**Performance Requirements:**
- **Response Time**: Generator runs to completion in reasonable time
- **Throughput**: Measures actual ops/sec under load
- **Resource Limits**: Documented per run
- **Scalability**: Tests concurrency levels relevant to scaling-path

**Reliability Requirements:**
- **Error Handling**: Fail closed on invalid inputs
- **Timeout Behavior**: Configurable timeouts
- **Retry Strategy**: Deterministic measurement - avoid retries that mask issues
- **Graceful Degradation**: Explicit "untested" state with reason code

---

### Story 6: Brier calibration on retrieval suggestion usefulness

**Epic**: E3 - Honest memory  
**Priority**: Should (Low)  
**RICE Score**: Reach=5, Impact=1.5, Confidence=0.9, Effort=2 → (6.75)/2 = **3.375**

**As a** metrics engineer,  
**I want** rolling Brier calibration applied to retrieval suggestion usefulness (not verdict confidence),  
**so that** suggestion quality is calibrated with MIN_SAMPLES=100, DRIFT_THRESHOLD=0.25, and explicit "insufficient-samples" state.

**INVEST Checklist:**
- [x] Independent: Can add calibration module
- [x] Negotiable: Thresholds can be adjusted per requirements
- [x] Valuable: Improves measurement quality
- [x] Estimable: Known from office-mode patterns
- [x] Small: Focused
- [x] Testable: Has insufficient-samples state, respects constraints

**Dependencies**: Story 2 (fact contradiction gate) - leverages similar governance  
**Blocking Dependencies**: None

**Acceptance Criteria:**

```
Scenario: Rolling Brier with proper parameters
  Given suggestion usefulness outcomes
  When calibration runs
  Then uses MIN_SAMPLES = 100
  And DRIFT_THRESHOLD = 0.25
  And CALIBRATION_MAX_ENTRIES = 10000 ring buffer
  And maintains rolling window correctly

Scenario: Explicit insufficient-samples state
  Given fewer than MIN_SAMPLES observations
  When calibration state is queried
  Then state is "insufficient-samples"
  And no score is fabricated or reported as zero
  And reason code explains why

Scenario: Applied only to suggestion usefulness
  Given calibration implementation
  When code is reviewed
  Then calibration applies only to retrieval suggestion usefulness
  And NO confidence scalar exists anywhere on the verdict path
  And MatchStrength remains exactly {exact,100} | {none}

Scenario: Drift detection works
  Given calibration score exceeds DRIFT_THRESHOLD
  When drift is detected
  Then appropriate action taken per fail-closed policy
  And drift is logged with reason codes
```

**Security Scenarios:**

```
Scenario: Calibration data contains no sensitive content
  Given outcome labels
  When stored in ring buffer
  Then only numeric/boolean outcome data
  And no question text, corpus text, or PII
```

**Edge Cases:**

- **Data Edge Case**: Exactly MIN_SAMPLES boundary - transition correctly
- **State Edge Case**: Ring buffer overflow - oldest entries dropped (correct)
- **Input Edge Case**: Invalid outcomes - fail closed
- **Logic Edge Case**: "unavailable is first-class outcome" - never render as 0

**Performance Requirements:**
- **Response Time**: O(1) per update
- **Memory**: Bounded by ring buffer size
- **Scalability**: Handles streaming updates

**Reliability Requirements:**
- **Error Handling**: Fail closed on invalid state
- **Timeout Behavior**: No external calls
- **Retry Strategy**: Stateless operations
- **Graceful Degradation**: insufficient-samples is explicit degraded state

---

### Story 7: Resolve the ADR-16 numbering hole

**Epic**: E1 - Land the tree  
**Priority**: Should (Low)  
**RICE Score**: Reach=3, Impact=1, Confidence=0.95, Effort=1 → (2.85)/1 = **2.85**

**As a** documentation maintainer,  
**I want** the ADR sequence to be contiguous,  
**so that** ADR-15 and ADR-17 are not separated by a missing ADR-16 (indicating a dropped decision).

**INVEST Checklist:**
- [x] Independent: Purely documentation
- [x] Negotiable: Write record or renumber
- [x] Valuable: Fixes governance artifact consistency
- [x] Estimable: Trivial effort
- [x] Small: Very small
- [x] Testable: Sequence check passes

**Dependencies**: Story 1  
**Blocking Dependencies**: None

**Acceptance Criteria:**

```
Scenario: ADR sequence becomes contiguous
  Given ADRs 02..15 and 17 exist, 16 missing
  When ADR-16 is written as explicit record OR renumbering occurs
  Then the ADR sequence is contiguous (no gaps)
  And any dropped decision is recorded with its reason

Scenario: ADR numbering is consistent
  Given the resolution
  When checking ADR files
  Then all sequential numbers exist or renumbering is documented
  And cross-references are updated if renumbered

Scenario: Decision rationale captured
  Given a drafted-then-dropped decision
  When ADR-16 is written
  Then it records what was considered and why it was dropped
  Or explicitly states "no decision recorded" if appropriate
```

**Security Scenarios:**

```
Scenario: No sensitive info in ADR
  Given ADR-16 content
  When written
  Then contains only architectural decisions
  And no secrets or sensitive operational details
```

**Edge Cases:**

- **State Edge Case**: Multiple interpretations of dropped decision - capture explicitly
- **Data Edge Case**: Historical context - preserve accuracy
- **Reliability**: Sequence validation is enforced by gates/docs checks

**Performance Requirements:**
- **Response Time**: N/A (docs only)
- **Resource Limits**: None
- **Scalability**: N/A

**Reliability Requirements:**
- **Error Handling**: If renumbered, ensure all references updated
- **Timeout Behavior**: N/A
- **Retry Strategy**: N/A
- **Graceful Degradation**: N/A

---

### Story 8: Read-only declarative query surface on MCP

**Epic**: E5 - Measured scale  
**Priority**: Could (Medium)  
**RICE Score**: Reach=5, Impact=1.5, Confidence=0.8, Effort=3 → (6)/3 = **2.0**

**As a** judge/researcher,  
**I want** a read-only declarative query language over the corpus (collection, grade, quoted phrases, negation, sorting) exposed as a second MCP tool,  
**so that** the corpus is explorable without weakening the verifier.

**INVEST Checklist:**
- [x] Independent: Additive feature
- [x] Negotiable: Grammar details negotiable
- [x] Valuable: Improves usability for exploration
- [x] Estimable: Grammar scope defined
- [x] Small: Read-only, constrained
- [x] Testable: Grammar is total (unparseable refuses), returns ids only

**Dependencies**: Story 1  
**Blocking Dependencies**: None

**Acceptance Criteria:**

```
Scenario: Grammar is total - unparseable input refuses
  Given malformed query string
  When second MCP tool processes it
  Then it refuses rather than partially matching
  And returns appropriate error (no silent degradation)
  And never falls back to returning arbitrary results

Scenario: Returns record ids only
  Given a valid query
  When results are returned
  Then only record ids are returned
  And NO corpus text, evidence, sourceUrl, or license text
  And reuses summariseVerdict's strip list if needed

Scenario: Read-only and stdio-only preserved
  Given MCP server with second tool
  When tool is invoked
  Then it performs only reads
  And server remains stdio-only
  And single-tool read-only posture is preserved where required

Scenario: Supports declarative query features
  Given query like collection:abudawud, grade:"Sahih", "exact phrase", -collection:tirmidhi, sort:
  When parsed and executed
  Then correct records returned by id
  And filtering/sorting works as specified

Scenario: Corpus text never leaves
  Given any query
  When results are serialized
  Then corpus text is never included
  And sensitive fields are stripped per §13
```

**Security Scenarios:**

```
Scenario: No data leakage via second tool
  Given second MCP tool
  When invoked with various inputs
  Then response never contains corpus content
  And only ids (non-sensitive references)
  And questionHash only in traces

Scenario: Input validation prevents injection
  Given malicious query payload
  When parsed
  Then grammar parser rejects
  And no code injection into query execution
  And fail closed
```

**Edge Cases:**

- **Input Edge Case**: Empty query - refuse or define behavior explicitly
- **Input Edge Case**: Very long query - bounded
- **Data Edge Case**: No results match - return empty list of ids (not error)
- **State Edge Case**: Corpus unavailable - degrade to "unavailable" per reliability rules
- **Reliability**: Grammar must be total - every input maps to accept/refuse, no third case

**Performance Requirements:**
- **Response Time**: Query returns within reasonable bounds for local corpus
- **Throughput**: Comparable to existing search
- **Resource Limits**: Bounded
- **Scalability**: Works with 27,234 records

**Reliability Requirements:**
- **Error Handling**: Fail closed on parse errors (refuse)
- **Timeout Behavior**: Query timeout if needed
- **Retry Strategy**: Read-only, idempotent - safe to retry if appropriate
- **Graceful Degradation**: If backend unavailable, return unavailable per §16

---

## Story Overview

| Story | Title | Epic | Priority | RICE | Dependencies |
|---|---|---|---|---|---|
| Story 1 | Land uncommitted governance work | E1 | Must | 15.0 | None |
| Story 2 | Fact-memory contradiction gate + repair facts | E3 | Must | 7.6 | Story 1 |
| Story 3 | Held-out set with protocol/digest/FPR delta | E2 | Must | 9.0 | Story 1 |
| Story 4 | Recall-preserving latency pass | E4 | Must | 14.25 | Story 1 |
| Story 5 | Load generator + measured throughput | E5 | Should | 4.2 | Story 1 |
| Story 6 | Brier calibration on suggestion usefulness | E3 | Should | 3.375 | Story 2 |
| Story 7 | Resolve ADR-16 numbering hole | E1 | Should | 2.85 | Story 1 |
| Story 8 | Read-only declarative query surface on MCP | E5 | Could | 2.0 | Story 1 |

## Dependency Graph

```
Story 1 (Must, blocks all)
  ├─► Story 2 (Must)
  │   └─► Story 6 (Should)
  ├─► Story 3 (Must)
  ├─► Story 4 (Must)
  ├─► Story 5 (Should)
  ├─► Story 7 (Should)
  └─► Story 8 (Could)
```

**Blocking Dependencies**: Story 1 is the only hard blocker (cleans tree, establishes baseline).
**Shared Dependencies**: None beyond Story 1.

## Competitive Feature Comparison (Research-Driven)

Based on the market research provided:

| Feature | mizan (current) | Competitors | Gap | Addressed By |
|---|---|---|---|---|
| Deterministic verification | Yes (exact\|none) | 50-89% probabilistic | **Differentiator** (keep) | All stories preserve this |
| Containment-only (no confidence scalar) | Yes (§10) | CiteCheck uses 0-10 | **Differentiator** | Story 6 explicitly prevents scalar |
| Auditability/reproducibility | Strong (gates, checks) | Weak/absent | **Differentiator** | Stories 1-4 strengthen |
| Latency (p50 686ms) | Needs improvement | Hybrid achieves p99<6ms | Implementation gap | Story 4 |
| Held-out benchmark | 40 self-authored | HALLMARK emphasizes held-out | Table-stakes gap | Story 3 |
| Throughput measurement | "untested" | Measured | Documentation gap | Story 5 |
| Corpus exploration | Limited (single tool) | hister has rich query lang | Nice-to-have | Story 8 |
| Fact memory integrity | Can drift | Office has gates | Governance gap | Story 2 |
| ADR sequence hygiene | Has gap (ADR-16) | Good practice | Minor | Story 7 |

**Table-stakes vs Differentiators**: Determinism + exact\|none are true differentiators (nobody else does). Held-out benchmark (Story 3) is becoming table-stakes for credibility. Latency (Story 4) is UX gap.

## Risk Register (Consolidated)

| Risk | Stories | Severity | Mitigation |
|---|---|---|---|
| Dirty tree lost | Story 1 | Critical | Land as one reviewed commit set |
| Fact memory contradiction | Story 2 | High | Build gate with planted violation |
| Benchmark contamination | Story 3 | High | Protocol forbids reading plan.ts; digest-chain |
| Recall regression in latency work | Story 4 | High | Recall gate blocks record (no tolerance) |
| Unmeasured throughput claims | Story 5 | Medium | Accept "untested with reason" |
| Porting confidence scalar | Story 6 | High | Explicit constraint (only suggestion usefulness) |
| ADR drift | Story 7 | Low | Enforce contiguous sequence |
| Corpus text leakage via MCP | Story 8 | Medium | Return ids only; reuse strip list |

## Handoff JSON Block

```json
{
  "stories": [
    {
      "id": "Story 1",
      "title": "Land the uncommitted governance work as reviewed commits",
      "epic": "E1",
      "priority": "Must",
      "rice": 15.0,
      "dependencies": [],
      "acceptanceCriteria": [
        "Scenario: Working tree becomes clean after landing - Given dirty tree with 30+ files, When committed, Then git status --short returns empty and served.ts deletion justified",
        "Scenario: CI remains green at landed commit - Given commit set, When bun run ci, Then all 13 packages and 7 gates pass"
      ]
    },
    {
      "id": "Story 2",
      "title": "Fact-memory contradiction gate plus repair of four stale facts",
      "epic": "E3",
      "priority": "Must",
      "rice": 7.6,
      "dependencies": ["Story 1"],
      "acceptanceCriteria": [
        "Scenario: Gate detects contradiction - Given fact contradicts artifact, When gate runs, Then build fails with clear message",
        "Scenario: Facts repaired - Given fact 4 contradicts ADR-15, When corrected with reason code, Then contradiction resolved"
      ]
    },
    {
      "id": "Story 3",
      "title": "Held-out set with authoring protocol, digest, and published FPR delta",
      "epic": "E2",
      "priority": "Must",
      "rice": 9.0,
      "dependencies": ["Story 1"],
      "acceptanceCriteria": [
        "Scenario: Protocol committed - Forbids reading scripts/eval/plan.ts; defines authorship by who/what read",
        "Scenario: Held-out falseVerifiedCount == 0",
        "Scenario: Delta published in docs/value-proof.md and enforced by check:docs even if widens"
      ]
    },
    {
      "id": "Story 4",
      "title": "Recall-preserving latency pass on the shipped exhaustive scan",
      "epic": "E4",
      "priority": "Must",
      "rice": 14.25,
      "dependencies": ["Story 1"],
      "acceptanceCriteria": [
        "Scenario: Recall unchanged at 40/40 top-5",
        "Scenario: p50 below 686ms",
        "Scenario: Recall regression blocks record; refusal to publish ungated number is success"
      ]
    },
    {
      "id": "Story 5",
      "title": "Load generator and measured throughput rows",
      "epic": "E5",
      "priority": "Should",
      "rice": 4.2,
      "dependencies": ["Story 1"],
      "acceptanceCriteria": [
        "Scenario: Load generator drives concurrent verification against real snapshot",
        "Scenario: Throughput rows have conditions block or marked untested with stated reason"
      ]
    },
    {
      "id": "Story 6",
      "title": "Brier calibration on retrieval suggestion usefulness",
      "epic": "E3",
      "priority": "Should",
      "rice": 3.375,
      "dependencies": ["Story 2"],
      "acceptanceCriteria": [
        "Scenario: Rolling Brier with MIN_SAMPLES=100, DRIFT_THRESHOLD=0.25, 10k buffer",
        "Scenario: Explicit insufficient-samples state (never fabricate 0)",
        "Scenario: Applied only to suggestion usefulness; no verdict confidence scalar"
      ]
    },
    {
      "id": "Story 7",
      "title": "Resolve the ADR-16 numbering hole",
      "epic": "E1",
      "priority": "Should",
      "rice": 2.85,
      "dependencies": ["Story 1"],
      "acceptanceCriteria": [
        "Scenario: ADR sequence contiguous; dropped decision recorded with reason"
      ]
    },
    {
      "id": "Story 8",
      "title": "Read-only declarative query surface on MCP",
      "epic": "E5",
      "priority": "Could",
      "rice": 2.0,
      "dependencies": ["Story 1"],
      "acceptanceCriteria": [
        "Scenario: Grammar total - unparseable refuses (no partial match)",
        "Scenario: Returns record ids only (no corpus text); reuses strip list",
        "Scenario: Read-only and stdio-only preserved"
      ]
    }
  ],
  "acceptanceCriteria": [
    "Every story has Given/When/Then scenarios",
    "Security scenarios included for each story",
    "Edge cases identified (input/state/data/network/security)",
    "Performance and reliability requirements defined per story"
  ],
  "dependencies": [
    "Story 1 blocks all others",
    "Story 2 blocks Story 6"
  ]
}
```

## Specification
# CEO Strategic Plan — mizan Enrichment

## 1. Executive Summary

The request asks mizan to absorb ideas from `opencode-office` and `hister`. Both prior analyses produced the same ranked plan, and its #1 item — *"adopt hybrid retrieval: BM25 + dense second ranker + RRF, ~120× headroom"* — is the one recommendation this plan **declines**. mizan refused that change twice already on correctness grounds (ADR-08: the FTS5 sidecar returned *nothing* for 3/10 adversarial quotes; ADR-17: recall is a precondition, not a figure), and the dense form is the CWE-345 fabrication hole G-1 exists to close, merely relocated. Meanwhile the **highest-severity finding is not a missing feature**: a large, fully passing body of governance work — degradation vocabulary, dataset-identity hashing, the coverage gate, round-robin anchor selection, the acceptance command, ADRs 15 and 17 — is **green but uncommitted**. Sprint 1 therefore lands and hardens what exists, and spends the credibility budget on the gap `docs/value-proof.md` itself calls *"the weakest link in this document"*.

I verified the load-bearing claims myself: `bun run ci` → **GREEN** (13/13 packages, 7/7 gates); `check:docs` → **GREEN**.

## 2. Business Value Analysis

**Primary value driver: credibility, not accuracy.** Competitors top out at 50–89 % probabilistic verification (CiteGuard 68.1 % vs 69.2 % human; FaithBench SOTA ≈ 50 %). mizan has no accuracy ceiling — so the claim to sell is determinism and auditability.

**The decisive correction.** The BEIR "120× headroom" figure is English, on SciFact, and says nothing about the property ADR-08 measured directly: **in Arabic a quote shares a 3-gram with 26,655 of 27,234 records**, so the ranking floor is nearly inert and a learned ranker has no headroom to exploit. G-1's similarity ban is scoped to `mizan-verify`, so dense retrieval in `mizan-retrieval` is *permitted* — but permitted is not wise. Note `mizan-retrieval/src/rrf.ts` exports `fuse` and `RRF_K = 60` with **zero importers**: dormant, not a mandate.

MoSCoW: **Must** — land the tree; held-out set + published ∆FPR; fact-memory contradiction gate; recall-preserving latency. **Should** — load generator; Brier on retrieval usefulness; resolve the ADR-16 hole. **Could** — query surface on MCP; ledger `Flock` durability; `/metrics`. **Won't** — dense/vector on any verdict path; hister code (AGPL vs Apache-2.0, G-5 enforced); confidence scalars (§10); Arabic UI/tafsir/Bukhari/multilingual.

## 3. Risk Register

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | 30+ uncommitted files incl. 2 ADRs + deleted `served.ts` lost or half-reviewed | **Critical** | One reviewed commit set; deletion justified in-message (ADR-15 reads a `served`/`usable` pair) |
| R2 | A team-authored hold-out stays contaminated — ∆FPR becomes theatre | **High** | Protocol forbids reading `scripts/eval/plan.ts`; digest-chain the set |
| R3 | Latency work trades recall for speed | **High** | ADR-17 enforces it: recall floor checked *before* latency; regression blocks the record |
| R4 | Silent dense downgrade reads as full fidelity | **High** | `semantic_ranking_unavailable` already in `DegradationCondition` |
| R5 | Memory asserts claims artefacts contradict — **live: fact 4 asserts the opposite of ADR-15** | **High** | Contradiction gate fails the build; `unmeasured` never renders as `0` |
| R6 | sqlite-vec pre-v1 × 4 platform triples; Bun/macOS needs `setCustomSQLite` | Medium | Optional accelerator behind a probe, never a hard dep |
| R7 | Throughput stays `untested` in `scaling-path.md` | Medium | Load generator before any measured row |
| R8 | An AGPL line enters as "just a reference implementation" | **Critical** | G-5 licence fields; design-ideas-only, recorded in ADR-18 |
| R9 | A second MCP tool leaks corpus text | Medium | Return **ids** only; reuse `summariseVerdict`'s strip list |
| R10 | ADR-16 hole signals a dropped decision | Low | Write ADR-16 as a record, or renumber |

**Security (OWASP):** no Must item adds a trust boundary. The query surface (Could) adds **A01/A03** — the grammar must be total (unparseable ⇒ refusal) and never emit corpus text. The hold-out set is *new sensitive data*: adversarial fabrications of religious text, so repo-internal, never seeded into a prompt, never returned by MCP. G-4 already has a planted-secret self-test.

**Reliability:** every Must item is a measurement-or-refusal path, so the dominant failure is a **false pass**, not a crash. `recallRegression` returns `Result<never, string>` — no success channel carries a delta. `identityMismatch` refuses an absent digest; absent is never a match. `decide` refuses to treat a missing step as passing.

## 4. Epics & Success Metrics

- **E1 Land the tree** — `git status --short` empty; CI green at landed commit; `served.ts` deletion carries written justification.
- **E2 Held-out credibility** — set authored under a published protocol forbidding `plan.ts`; ∆FPR published and `check:docs`-machine-checked. Threshold: hold-out `falseVerifiedCount == 0`; ∆FPR published **even if it widens the gap**.
- **E3 Honest memory** — a fact contradicting an artefact fails the build; 4 stale facts repaired or superseded with a reason code.
- **E4 Recall-preserving latency** — recall **unchanged at 40/40 top-5** with lower p50. A recall regression blocks the record regardless of latency. Refusing to publish an ungated number is success.
- **E5 Measured scale** — throughput rows move from `untested` to measured-with-conditions, or stay `untested` with a stated reason.

## 5. Security & Reliability Requirements

Auth model unchanged: stdio-only MCP, read-only, `MIZAN_LLM_API_KEY` only, provider allowlisted to `api.openai.com` refusing redirects. Data sensitivity is *reputational* — traces carry `questionHash` only. Reliability posture is fail-closed everywhere; no retry may convert `unverifiable` into a cached prior verdict.

## 6. ADR**ADR-18 (proposed) — One store, and the third refusal of an index.** Reaffirms ADR-08/ADR-17; refuses dense/vector. Consequence: latency work confined to ADR-08's answer-preserving levers, and `rrf.ts` is documented as dormant-by-design rather than deleted.

**ADR-19 (proposed) — A hold-out is a different authorship, not a different directory.** Codifies that the set is defined by *who wrote it and what they could read*.

## 7. Sprint Backlog

**Sprint 1** — M1 land uncommitted work (Must, M, High) · M2 fact contradiction gate + repair 4 facts (Must, M, Med) · M3 held-out protocol/authoring/digest/∆FPR (Must, L, High) · M4 recall-preserving latency pass (Must, M, High).

**Sprint 2** — S1 load generator + measured throughput (Should, M, Med) · S2 Brier on retrieval usefulness (Should, S, Low) · S3 resolve ADR-16 hole (Should, S, Low) · S4 read-only query surface, ids only (Could, L, Med).

8 stories, 2 sprints. Sprint 3+ deferred.

## Fact Memory

```json
[{"fact":"ALWAYS run `bun run ci` and `git status --short` before planning on mizan: a dirty tree is not a broken tree. The 2026-10-05 tree had 30+ modified/untracked files (ADR-15, ADR-17, degradation vocabulary, dataset-identity hashing, coverage gate, accept-customer) that were fully green — the correct CEO action was 'land the work', not 'add features'.","confidence":0.93,"evidence":"`bun run ci` → CI GREEN with 13/13 packages and 7/7 gates while `git status --short` showed 20 M, 1 D, 20 ?? entries."},{"fact":"mizan's English-language retrieval benchmarks do not transfer, because ADR-08 measured that a quote shares a 3-gram with 26,655 of 27,234 Arabic records — the ranking floor is nearly inert and recall@40/40 already holds. This is the causal reason to reject 'hybrid dense retrieval, ~120x headroom' from BEIR/SciFact data.","confidence":0.9,"evidence":"ADR-08: 'A quote shares some 3-gram with 26,655 of 27,234 records, so \"shares something\" carried the corpus'; vs-search.json suggestionRecallShippedTop5 = 40."},{"fact":"G-1's similarity ban is scoped to packages/mizan-verify/ only, so adding dense/vector ranking to mizan-retrieval would NOT trip any gate — meaning gate-passing is NOT evidence that a change is safe. Judge retrieval changes against ADR-17's recall precondition, not against the gate set.","confidence":0.92,"evidence":"g1-no-similarity.ts exports VERIFY_PREFIX = 'packages/mizan-verify/' and documents the rules as 'checked over packages/mizan-verify/ only'."},{"fact":"Durable fact memory can assert the exact OPPOSITE of an accepted ADR, not merely drift: office_facts_research.json fact 4 claimed Quran/Tirmidhi were unmeasured suggestion collections, while accepted ADR-15 exists specifically to fix that and vs-search.json records 6 measured / 0 unmeasured. Facts must be re-validated against artefacts and ADRs before being repeated.","confidence":0.94,"evidence":"office_facts_research.json fact 4 'Quran (6236) and Tirmidhi unmeasured'; vs-search.json suggestionCoverageMeasuredCollections = 6, UnmeasuredCollections = 0; ADR-15 table shows quran 0->2 and tirmidhi 0->2."},{"fact":"mizan-retrieval/src/rrf.ts exports `fuse` and RRF_K=60 with ZERO importers — dormant capability, not an in-progress feature. Do not read its existence as a signal that hybrid retrieval was already sanctioned.","confidence":0.95,"evidence":"Repository-wide search for rrf importers returned no matches; only rrf.ts's own exports matched."},{"fact":"Check for an ADR sequence hole as a standard health probe: docs/specs/adr had ADR-02..ADR-15 and ADR-17 but no ADR-16, both 15 and 17 untracked — suggesting a drafted-then-dropped decision, the same drift class as the gate-count prose §14's checkGateCountClaim guards.","confidence":0.88,"evidence":"Directory listing of docs/specs/adr showed ADR-15.md and ADR-17.md present, ADR-16.md absent; git status marked both as untracked."}]
```

```json
{"executiveSummary":"The enrichment request asks mizan to harvest from opencode-office and hister. Both prior analyses ranked 'hybrid retrieval: BM25 + dense + RRF (~120x headroom)' as item #1; this plan declines it, because mizan already refused it twice on correctness grounds (ADR-08's FTS5 sidecar returned nothing for 3/10 adversarial quotes; ADR-17 makes recall a precondition) and the dense form is the CWE-345 fabrication hole G-1 exists to close, merely relocated into mizan-retrieval. The BEIR headroom figure is English/SciFact and does not transfer: ADR-08 measured that in Arabic a quote shares a 3-gram with 26,655 of 27,234 records, leaving a learned ranker no headroom. The highest-severity finding is not a missing feature at all — a large, fully passing governance body (degradation vocabulary, dataset-identity hashing, coverage gate, round-robin anchor selection, acceptance command, ADR-15 and ADR-17) is green but uncommitted. Sprint 1 therefore lands and hardens what exists, and spends the credibility budget on the one gap docs/value-proof.md itself calls its weakest link: the missing held-out fabrication set. Verified first-hand: bun run ci GREEN (13/13 packages, 7/7 gates) and check:docs GREEN.","moscow":{"must":["Land the uncommitted green governance work as reviewed commits, justifying the deleted packages/mizan-corpus/src/served.ts","Author a held-out fabrication set under a published protocol that forbids reading scripts/eval/plan.ts, with a published dev-vs-holdout FPR delta machine-checked by check:docs","Add a fact-memory contradiction gate that fails the build when a durable fact conflicts with a committed artefact; repair the four stale facts in office_facts_research.json","A recall-preserving latency pass on the shipped exhaustive scan using ADR-08's own answer-preserving levers (allocation reduction and a stricter ranking floor), with recall held at 40/40 top-5"],"should":["Build the load generator docs/scaling-path.md names as missing, then publish read/write throughput as measured rows with a conditions block","Apply office-mode's rolling Brier calibration with MIN_SAMPLES and an explicit insufficient-samples state to retrieval suggestion usefulness, never to verdict confidence","Resolve the ADR-16 numbering hole by writing it as a record or renumbering, keeping the ADR sequence contiguous"],"could":["Expose a read-only declarative query surface (collection:, grade:, \"phrase\", -negation, sort:) as a second MCP tool returning record ids only, never text","Adopt office-mode's Flock file locks and renameOverwrite atomic writes for ledger appends before any Phase-2 sharding","Add authenticated Prometheus-style /metrics with storage gauges to the MCP server"],"wont":["Any dense, embedding, or vector ranker on any path reaching a verified verdict (CWE-345; G-1 relocation loophole)","Any hister source code or vendored snippet — AGPL-3.0 versus Apache-2.0 with gate G-5 enforced per source","Any numeric confidence scalar on the verdict path (AGENTS.md section 10; CiteCheck's 0-10 and office's confidence.ts are the same failure mode)","Arabic UI, tafsir, Bukhari/Muslim, and multilingual answers — converting mizan's strongest asset, what it refuses to claim, into its weakest","sqlite-vec or any native extension as a hard dependency; treat only as an optional accelerator behind a probe"]},"riskRegister":[{"id":"R1","risk":"30+ uncommitted files including two ADRs and a deleted packages/mizan-corpus/src/served.ts are lost or half-reviewed before landing","severity":"Critical","category":"Operational","mitigation":"Commit as one reviewed change set on a clean CI run; the served.ts deletion carries a written justification because ADR-15 reads a served/usable pair elsewhere in docs-coverage.ts"},{"id":"R2","risk":"A hold-out set authored by the same team remains contaminated, making the published FPR delta theatre rather than evidence","severity":"High","category":"Credibility","mitigation":"Publish an authoring protocol that forbids reading scripts/eval/plan.ts; hash-chain the set so its identity is verifiable; publish the delta even when it widens the gap"},{"id":"R3","risk":"Latency work trades recall for speed, publishing a faster search that cannot find the record it exists to find","severity":"High","category":"Correctness","mitigation":"ADR-17 already enforces it — recall floors are checked before latency and a recall regression blocks the record entirely; no tolerance band on recall"},{"id":"R4","risk":"A silently degraded dense ranker is presented as full fidelity","severity":"High","category":"Reliability","mitigation":"semantic_ranking_unavailable already exists in DegradationCondition; a missing second ranker must emit semanticRanking: \"unavailable\" and never a silent lexical-only fallback"},{"id":"R5","risk":"Durable fact memory carries claims contradicted by committed artefacts — live: office_facts_research.json fact 4 asserts the opposite of accepted ADR-15","severity":"High","category":"Integrity","mitigation":"Add a contradiction gate that fails the build; treat unmeasured as a first-class vocabulary member that is never rendered as 0; supersede stale facts with a reason code"},{"id":"R6","risk":"Native-extension supply chain: sqlite-vec is pre-v1 across four platform triples and Bun on macOS requires Database.setCustomSQLite because the Apple build disables extension loading","severity":"Medium","category":"Technical","mitigation":"Any dense ranker stays behind an optional probe with an explicit unavailable degradation path, never a hard dependency; if it is ever attempted, FTS5-only must be proven not to be a degraded mode"},{"id":"R7","risk":"Throughput claims in docs/scaling-path.md stay 'untested' with no load generator and no multi-node harness","severity":"Medium","category":"Operational","mitigation":"Build the load generator first, then publish a measured row with its conditions block; a row that stays untested with a stated reason is an acceptable outcome"},{"id":"R8","risk":"An AGPL line from hister enters via 'just a reference implementation', destroying the Apache-2.0 posture","severity":"Critical","category":"Legal","mitigation":"Gate G-5 enforces licence fields on every enabled source and the registry; ADR-18 records design-ideas-only as a decision, not a preference"},{"id":"R9","risk":"A second MCP tool leaks corpus text to a client","severity":"Medium","category":"Security","mitigation":"Return record ids only; reuse summariseVerdict's strip list for evidence, sourceUrl and licence; keep the server stdio-only and read-only"},{"id":"R10","risk":"The ADR-16 hole signals a drafted-then-dropped decision, the same drift class as gate-count prose","severity":"Low","category":"Governance","mitigation":"Write ADR-16 as an explicit record or renumber, keeping the sequence contiguous as AGENTS.md section 14 does for gates"},{"id":"R11","risk":"The hold-out set is new sensitive data — adversarial fabrications of religious text — and leaks into a prompt or an MCP response","severity":"Medium","category":"Security","mitigation":"Keep the set repo-internal and never seeded into any prompt; MCP stays single-tool read-only until a separate decision; questionHash only in traces"},{"id":"R12","risk":"Office-mode's Brier calibration is ported onto verdict confidence rather than retrieval usefulness","severity":"High","category":"Correctness","mitigation":"AGENTS.md section 10 constrains MatchStrength to exact|none with no third shape; calibration applies only to suggestion usefulness, where an outcome label already exists"}],"epics":[{"id":"E1","title":"Land the tree","goal":"Move the completed governance body out of the dirty working tree into reviewed commits","successMetrics":["git status --short returns empty","bun run ci green at the landed commit","the deleted packages/mizan-corpus/src/served.ts carries a written justification"],"dependencies":[],"riskLevel":"High"},{"id":"E2","title":"Held-out credibility","goal":"Replace the self-authored-only benchmark with a genuinely held-out fabrication set and publish the dev-vs-holdout FPR delta","successMetrics":["a fabrication set exists authored under a published protocol forbidding reading scripts/eval/plan.ts","delta FPR dev-vs-holdout published in docs/value-proof.md and machine-checked by check:docs","hold-out falseVerifiedCount == 0","the delta is published even when it widens the gap"],"dependencies":["E1"],"riskLevel":"High"},{"id":"E3","title":"Honest memory","goal":"Stop durable fact memory from asserting claims that committed artefacts contradict","successMetrics":["a fact contradicting a committed artefact fails the build","the four stale facts in office_facts_research.json are repaired or superseded with a reason code","unmeasured is never rendered as 0"],"dependencies":["E1"],"riskLevel":"Medium"},{"id":"E4","title":"Recall-preserving latency","goal":"Reduce the 686 ms p50 suggestion latency using only ADR-08's answer-preserving levers, never a second store","successMetrics":["bun run eval:suggestions shows recall unchanged at 40/40 top-5","p50 below the current 686 ms","a recall regression blocks the record regardless of latency gain","refusing to publish an ungated number counts as success"],"dependencies":["E1"],"riskLevel":"High"},{"id":"E5","title":"Measured scale","goal":"Turn the untested throughput rows in docs/scaling-path.md into measured figures with conditions blocks","successMetrics":["a load generator drives concurrent verification against a real corpus snapshot","read and write throughput rows move from untested to measured, or stay untested with a stated reason"],"dependencies":["E1"],"riskLevel":"Medium"}],"adrs":[{"id":"ADR-18","title":"One store, and the third refusal of an index","context":"Both prior analyses recommended hybrid BM25 + dense + RRF retrieval citing ~120x latency headroom from English BEIR/SciFact benchmarks, while mizan has twice refused an index on correctness grounds and ADR-17 makes recall a precondition.","decision":"Reaffirm ADR-08 and ADR-17 and refuse the dense/vector third option. Confine latency work to ADR-08's answer-preserving levers. Keep mizan-retrieval/src/rrf.ts dormant by design.","rationale":"The headroom figure does not transfer: ADR-08 measured that in Arabic a quote shares a 3-gram with 26,655 of 27,234 records, so the ranking floor is nearly inert and recall@40/40 already holds — a learned ranker has no headroom to exploit. A second store also creates two truths, which the gates have no vocabulary to adjudicate. G-1's ban being scoped to mizan-verify means this change would pass CI while reintroducing CWE-345, so passing gates is not evidence of safety.","consequences":"The p50 686 ms stays recorded rather than engineered around; latency improvement is bounded by what is provably answer-preserving; the 46 MB sidecar question stays closed absent a recall-preserving fixture; rrf.ts is documented as dormant rather than deleted.","status":"Proposed"},{"id":"ADR-19","title":"A hold-out is a different authorship, not a different directory","context":"docs/value-proof.md calls the self-authored 40-case set its weakest link, and HALLMARK identifies the contamination-resistant held-out split as its central contribution.","decision":"Define a held-out set by who authored it and what source they could read, not by where the file lives. The authoring protocol is a committed artefact and the set's digest covers it.","rationale":"A hold-out authored by the same team from the same plan.ts inherits the same blind spots regardless of its filename; contamination scales with capability per PostTrainBench discipline.","consequences":"The delta FPR column becomes real evidence rather than a formality; the FPR must be published even when it widens the gap; third-party participation becomes a natural extension point.","status":"Proposed"},{"id":"ADR-20","title":"A dense ranker may never reach a verified construction site","context":"G-1's similarity ban is scoped to packages/mizan-verify/ only, so dense or vector ranking in mizan-retrieval would pass every gate while reintroducing the fabrication-acceptance hole.","decision":"Record that gate-passing is not evidence of safety: retrieval-layer changes are judged against ADR-17's recall precondition and section 10's MatchStrength constraint, not against the gate set.","rationale":"The permissive gate scope is deliberate and correct — retrieval legitimately needs similarity — but it means the invariant is enforced by ADR discipline rather than by CI, which is a governance risk worth naming.","consequences":"Every retrieval change ships with a recall table; the second-ranker degradation path uses semantic_ranking_unavailable; the loophole is documented so a future contributor does not mistake permissibility for endorsement.","status":"Proposed"}],"sprintBacklog":[{"id":"M1","title":"Land uncommitted governance work as reviewed commits","priority":"Must","epic":"E1","size":"M","risk":"High","dependencies":[],"acceptanceCriteria":["git status --short empty","CI green at landed commit","served.ts deletion justified in the commit message"]},{"id":"M2","title":"Fact-memory contradiction gate plus repair of four stale facts","priority":"Must","epic":"E3","size":"M","risk":"Medium","dependencies":["M1"],"acceptanceCriteria":["a fact contradicting a committed artefact fails the build with a planted-violation self-test","office_facts_research.json fact 4 corrected or superseded with a reason code","unmeasured never renders as 0"]},{"id":"M3","title":"Held-out set: authoring protocol, authorship, digest, published FPR delta","priority":"Must","epic":"E2","size":"L","risk":"High","dependencies":["M1"],"acceptanceCriteria":["protocol committed and forbids reading scripts/eval/plan.ts","set carries a dataset digest covered by the protocol","hold-out falseVerifiedCount == 0","dev-vs-holdout delta published in docs/value-proof.md and enforced by check:docs"]},{"id":"M4","title":"Recall-preserving latency pass on the shipped exhaustive scan","priority":"Must","epic":"E4","size":"M","risk":"High","dependencies":["M1"],"acceptanceCriteria":["recall unchanged at 40/40 top-5 in bun run eval:suggestions","p50 below 686 ms","a recall regression blocks the record regardless of latency gain"]},{"id":"S1","title":"Load generator and measured throughput rows","priority":"Should","epic":"E5","size":"M","risk":"Medium","dependencies":["M1"],"acceptanceCriteria":["load generator drives concurrent verification against a real snapshot","read and write throughput published with a conditions block, or left untested with a stated reason"]},{"id":"S2","title":"Brier calibration on retrieval suggestion usefulness","priority":"Should","epic":"E3","size":"S","risk":"Low","dependencies":["M2"],"acceptanceCriteria":["rolling Brier with MIN_SAMPLES and an explicit insufficient-samples state","applied only to suggestion usefulness, never to verdict confidence","no confidence scalar exists anywhere on the verdict path"]},{"id":"S3","title":"Resolve the ADR-16 numbering hole","priority":"Should","epic":"E1","size":"S","risk":"Low","dependencies":["M1"],"acceptanceCriteria":["ADR sequence contiguous or ADR-16 written as an explicit record","any dropped decision is recorded with its reason"]},{"id":"S4","title":"Read-only declarative query surface on MCP","priority":"Could","epic":"E5","size":"L","risk":"Medium","dependencies":["M1"],"acceptanceCriteria":["grammar is total — unparseable input refuses rather than partially matching","returns record ids only, never corpus text","read-only and stdio-only preserved; corpus text never leaves"]}]}
```

## Architecture
I verified the spec's load-bearing claims first-hand and found five material corrections. Plan written to the wiki.

## 1. Executive Summary

Sprint 1 lands the dirty tree and hardens the governance body already in it. I confirmed the framing: `bun run ci` is **GREEN** (13 packages, 7/7 gates), `check:docs` is **GREEN**, and the tree has **47 entries** (spec said 30+) including a deleted `served.ts`. The highest-severity finding really is uncommitted work.

Five corrections follow. Two invalidate spec text:

**The `rrf.ts` claim is false.** The spec says it has "zero importers: dormant, not a mandate." `search.ts:3` imports `fuse` and line 167 calls `fuse(lists)` on the shipped path, fusing every non-empty BM25 pass. ADR-18 as drafted says "keep `rrf.ts` dormant by design" — committing that would put a **false description of the shipped system into an accepted ADR**, the exact defect class this repo exists to prevent. The dense-ranker refusal stands; the framing must be struck.

**M4's two levers are mutually exclusive.** "Allocation reduction *and* a stricter ranking floor" — raising `MIN_SHARED_TRIGRAMS` above 8 is recall loss by construction, and it's what ADR-08 already rejected. M4 is scoped to allocation reduction only.

Three more: the docs-coverage hole is narrower than reported but is a *deliberate* fail-open; M2 needs a figure extractor, not an ADR-aware engine; and two §2 `throw`s sit on M3's exact code path.

## 2. Codebase Impact

| Action | Files |
|---|---|
| **Land** (M1) | 7 ordered commits: core → gate → scripts → data → docs → README/package/cli tests |
| **Triage, do not commit** | `specs/` (6 office scratch files), `pm_overview.md` (1 byte) |
| **Create** | `docs-facts.ts`, `docs-holdout.ts`, `schema/holdout.ts`, `schema/record-id.ts`, `schema/load.ts`, `eval/holdout.ts`, `bench/src/calibration.ts`, `retrieval/src/query-grammar.ts`, `mcp/src/query-tool.ts`, `suggest/test/rank-golden.test.ts`, `load/*.ts` |
| **Modify** | `docs-check.ts` (×2), `index.ts`, `score.ts` (§2 fix), `trigrams.ts`/`rank.ts`/`suggest.ts`, `server.ts`, `office_facts_research.json` |

## 3–4. Module Design & API

Follows existing patterns: rules as pure functions `(document, file, artefact) => readonly DocsClaim`; table + pure decision (`accept-customer.ts`'s shape) for the hold-out harness; named projections (`RecordIdList`, mirroring `VerdictSummary`).

Two deliberate non-patterns: **no Strategy** for the S4 grammar (one grammar; a strategy is ceremony), **no new gate number** for M2 — a docs rule avoids the `GATE_IDS` → `docs-gates.ts` blast radius across ~10 files.

## 5–7. Data, Errors, Security

`HoldoutResult` is a **new artefact**, keeping `BenchmarkResult` v2 and its 70 keys untouched. `fpr`/`deltaFpr` are optional and their absence means *unmeasured* — a schema that keeps "0" and "absent" apart.

No Sprint-1 story adds a trust boundary. M3 adds *sensitive data*: adversarial fabrications of religious text, repo-internal, never prompted, never returned. S4's id-only shape makes corpus-text leakage structurally impossible.

## 11. Risk Assessment — the blocking finding

**M3's held-out set cannot be authored by the implementing agent.** A hold-out is defined by *who wrote it and what they could read* (ADR-19). An agent that has read `scripts/eval/plan.ts` cannot produce one. So M3 splits:

- **M3a** — protocol, schema, harness, enforcement. Agent-buildable and verifiable now.
- **M3b** — authorship. Human. Not an engineering deliverable.

Acceptance criterion `hold-out falseVerifiedCount == 0` is **not something an implementing agent can satisfy**. Publishing a self-authored set as held-out would convert the document's self-declared weakest link into a fabricated strength — the exact failure this repository exists to prevent. That is why confidence is set below the approval threshold rather than rounded up.

```json
{"office_fact_memory":[{"fact":"rrf.ts is NOT dormant — packages/mizan-retrieval/src/search.ts:3 imports fuse and line 167 calls fuse(lists) on the shipped search path, fusing every non-empty BM25 pass from expressionsFor(). search.ts:172 already reports ranking: 'fused'|'unavailable'. Any ADR or plan claiming RRF is unused is factually wrong about the shipped system.","phase":"at","confidence":0.97,"evidence":"grep for `fuse\\(` returned search.ts:3 (import) and search.ts:167 (call); earlier analyses and the CEO spec both asserted zero importers."},{"fact":"mizan's docs-coverage table rule has a deliberate fail-open: checkCoverageTableRows validates only recognised column headers. Probed live — headers 'cases' and 'top-5' catch a wrong numerator, but 'recall@5', 'presence', 'top5' and any unknown header return zero findings. The module comment calls this intentional ('adding a column to a document cannot invent a finding'), which is a fail-open default AGENTS.md §3 forbids. Any NEW numeric column published in an audited doc must be read explicitly by a rule, not trusted to a header match.","phase":"at","confidence":0.96,"evidence":"Direct probe of exported checkCoverageTableRows against data/benchmark/vs-search.json: cases->presence-row-stale, top-5->presence-row-stale, recall@5/presence/top5/nonsense->[]. checkPresenceCollectionNamed returns [] for table rows (PRESENCE_WORD requires the literal words presence|recall on the line)."},{"fact":"office_facts_research.json is a TRACKED, COMMITTED repo file (git ls-files --error-unmatch succeeds; not gitignored), so a fact-contradiction gate can be hermetic — it does not need the office workflow's external memory. Fact 4's three per-collection counts are ALL wrong (claims abudawud 22/ibnmajah 16/malik 2; artefact says 15/13/5, plus nasai 3, quran 2, tirmidhi 2), and two are checkable against vs-search.json with no ADR parsing at all.","phase":"at","confidence":0.95,"evidence":"git ls-files --error-unmatch office_facts_research.json returned the path; fact 4 text vs vs-search.json suggestionCoverageCases* keys."},{"fact":"scripts/benchmark/score.ts lines 129 and 132 both `throw new Error` inside figuresOf — an AGENTS.md §2 violation ('a raw throw may escape a test helper and nowhere else') on the exact function that computes delta and falseVerifiedCount. Any work extending that function must convert these to Result refusals first or it propagates the violation into a new artefact.","phase":"at","confidence":0.93,"evidence":"Select-String on scripts/benchmark/score.ts returned two throw new Error at lines 129 and 132, inside figuresOf which returns Figures {delta, falseVerifiedCount}."},{"fact":"Verify a spec's claims against the code before planning on them — this run found the spec's load-bearing 'rrf.ts has zero importers' claim false, and its M4 lever list self-contradictory. A cheap live probe of exported rule functions (calling them directly with a synthetic document) settles in seconds what reading a 40KB gate source cannot.","phase":"at","confidence":0.94,"evidence":"Three of five corrections came from direct execution rather than reading; one CR finding was found already-fixed (accept-customer.ts:124 now passes --check)."}]}
```

```json
{
  "moduleStructure": [
    { "id": "M1", "name": "Land the tree as seven ordered CI-green commits", "layer": "process", "creates": [], "modifies": ["packages/mizan-core/{src/index.ts,src/schema/display.ts,src/schema/eval.ts}", "packages/mizan-gate/{src/docs-check.ts,src/docs-claims.ts,src/index.ts}", "scripts/{accept-customer.ts,build-eval-set.ts}", "scripts/eval/{build.ts,anchor-texts.ts,suggest-coverage.ts,identity.ts,selection.ts,coverage-tables.ts}", "data/eval/*.json", "data/benchmark/vs-search.json", "docs/**", "README.md", "package.json"], "deletes": ["packages/mizan-corpus/src/served.ts"], "order": "core -> gate -> scripts -> data -> docs -> readme/package/cli-tests", "triageNotCommit": ["specs/ (6 office scratch files)", "pm_overview.md (1 byte)", "pm_stories_full.md (66 bytes)"], "rationale": "Dependency order forces this sequence: gate consumes core's new schemas, scripts consumes both. Each commit must leave CI green, which is what makes the partition non-trivial.", "gates": ["bun run ci green at each commit", "git status --short empty", "served.ts deletion justified in-message"] },
    { "id": "M2", "name": "Fact-consistency rule (docs rule, NOT gate G-8)", "layer": "governance", "creates": ["packages/mizan-gate/src/docs-facts.ts", "packages/mizan-gate/test/docs-facts.test.ts"], "modifies": ["packages/mizan-gate/src/docs-check.ts", "packages/mizan-gate/src/index.ts", "office_facts_research.json"], "rationale": "docs-check.ts is already 'check numeric claims against committed artefacts' — the same shape. A new numbered gate forces GATE_IDS -> docs-gates.ts to reject a stale gate count in ~10 files: large blast radius for a claim rule.", "scopeLimit": "Numeric claims only. Whether a prose sentence is TRUE is not a gate's business (docs-claims.ts states this). A non-numeric fact is out of scope, proven by a negative test.", "pattern": "checkFactFiguresUnbacked: (document, file, artefact) => readonly DocsClaim — reuses docs-value.ts readFigures/renderingsOf/groupFigure" },
    { "id": "M3", "name": "Held-out set (split into agent-buildable M3a + human M3b)", "layer": "governance", "creates": ["docs/eval/holdout-protocol.md", "packages/mizan-core/src/schema/holdout.ts", "scripts/eval/holdout.ts", "packages/mizan-gate/src/docs-holdout.ts", "data/benchmark/holdout.json"], "modifies": ["scripts/benchmark/score.ts", "packages/mizan-gate/src/docs-check.ts"], "rationale": "HoldoutResult is a NEW artefact so BenchmarkResult v2 and vs-search.json's 70 keys and digests stay untouched — no digest invalidation, no blast radius.", "M3a": "protocol, schema, harness, enforcement — agent-buildable and verifiable now", "M3b": "authorship of the cases — HUMAN ONLY. An agent that read scripts/eval/plan.ts cannot produce a hold-out (ADR-19). Not an engineering deliverable.", "hardRequirement": "docs-holdout.ts must read its own published column EXPLICITLY, because checkCoverageTableRows silently skips unrecognised column headers (verified: recall@5/presence/top5 return zero findings)" },
    { "id": "M4", "name": "Recall-preserving latency pass (allocation reduction ONLY)", "layer": "performance", "creates": ["packages/mizan-suggest/test/rank-golden.test.ts"], "modifies": ["packages/mizan-suggest/src/trigrams.ts", "packages/mizan-suggest/src/rank.ts", "packages/mizan-suggest/src/suggest.ts"], "correctionApplied": "Dropped the spec's 'stricter ranking floor' lever — raising MIN_SHARED_TRIGRAMS above 8 is recall loss by construction and is what ADR-08 already rejected. The spec's two levers contradict its own acceptance criterion.", "hotSpot": "trigrams.ts:84 trigramsOf allocates a fresh ReadonlySet<string> per candidate row across 27,234 records; suggest.ts:103 groups by cheap keys", "frozen": ["MIN_SHARED_TRIGRAMS = 8 (suggest.ts:44)", "MAX_ROWS_RANKED = 1024 (suggest.ts:72)", "ranked output byte-for-byte"] },
    { "id": "S1", "name": "Load generator with gated conditions block", "layer": "observability", "creates": ["scripts/load/verify-load.ts", "scripts/load/conditions.ts", "scripts/load/scenarios.ts", "packages/mizan-core/src/schema/load.ts"], "modifies": [], "rationale": "LoadConditions lives in @mizan/core so a measured scaling-path row is gated by the same figure machinery as every other published number.", "safety": "Ledger writes redirect to a scratch path under the OS temp dir — a measurement run must never mutate runs.jsonl evidence.", "legitimateOutcome": "'untested with a stated reason' as a DECLARED state, never a blank cell; reuses unmeasured from DegradationCondition" },
    { "id": "S2", "name": "Brier calibration on suggestion usefulness", "layer": "metrics", "creates": ["packages/mizan-bench/src/calibration.ts", "packages/mizan-bench/test/calibration.test.ts"], "modifies": [], "constants": { "MIN_SAMPLES": 100, "CALIBRATION_MAX_ENTRIES": 10000, "DRIFT_THRESHOLD": 0.25 }, "stateUnion": "CalibrationState = insufficient-samples | calibrated | drift, in the bench package", "constraint": "insufficient-samples must NOT be added to the 8-member DegradationCondition union — that is a published contract and widening it for a metrics state is the wrong trade.", "section10Safe": "Input is a BOOLEAN outcome label (suggestionPresenceTop5 hit/miss). No confidence scalar enters the verdict path." },
    { "id": "S3", "name": "Resolve the ADR-16 hole", "layer": "governance", "creates": ["docs/specs/adr/ADR-16.md"], "modifies": [], "rationale": "checkAdrDocument requires Context/Decision/Consequences/**Status:** Accepted. A 'nothing was decided' ADR cannot honestly be Accepted, and relaxing the rule would weaken every other ADR. Record the dropped decision as DECLINED — a declined decision IS a decision. No rule change needed.", "safe": "ADR_PATTERN matches ADR-\\d{2,} and nothing currently cites ADR-16; the hole is a missing file, not a dangling citation." },
    { "id": "S4", "name": "Read-only id-only query surface", "layer": "interface", "creates": ["packages/mizan-retrieval/src/query-grammar.ts", "packages/mizan-core/src/schema/record-id.ts", "packages/mizan-mcp/src/query-tool.ts"], "modifies": ["packages/mizan-mcp/src/server.ts"], "totality": "Every byte string is accepted or refused. No partial match, no fallback, no silent degradation.", "structuralSafety": "RecordIdList is the ONLY return type, so the response shape cannot carry text — the VerdictSummary discipline applied to ids.", "preserved": ["stdio-only", "read-only"] }
  ],
  "apiInterfaces": [
    { "name": "checkFactFiguresUnbacked", "module": "packages/mizan-gate/src/docs-facts.ts", "signature": "(document: string, file: string, artefact: CoverageArtefact) => readonly DocsClaim[]", "input": "office_facts_research.json fact strings + vs-search.json coverage figures", "output": "Findings naming the fact, the stated figure, and the recorded figure", "errors": ["contradiction -> presence-claim-unbacked finding (build fails)", "non-numeric fact -> out of scope, no finding, proven by negative test"], "invariants": ["never judges prose truth", "every finding names both the fact and the artefact key"] },
    { "name": "checkHoldoutFprUnbacked", "module": "packages/mizan-gate/src/docs-holdout.ts", "signature": "(document: string, file: string, holdout: HoldoutResult) => readonly DocsClaim[]", "input": "the published delta-FPR column in docs/value-proof.md", "output": "Findings, or [] when the published figures agree", "errors": ["published figure disagrees with holdout.json -> finding", "figure absent from both -> unmeasured, never 0", "column header unrecognised -> STILL CHECKED (reads its column explicitly, closing the verified fail-open)"], "invariants": ["reads its own column explicitly rather than relying on header recognition", "does not reuse checkCoverageTableRows' header dispatch"] },
    { "name": "holdoutFigures", "module": "scripts/eval/holdout.ts", "signature": "(outcomes: readonly Comparison[], dev: ComparisonFigures) => Result<HoldoutResult, string>", "input": "system-arm comparisons over the held-out set + the dev-set figures", "output": "HoldoutResult carrying caseCount, falseVerifiedCount, fpr, deltaFpr, datasetDigest, protocolDigest", "errors": ["caseCount === 0 -> err refusal naming the set (NEVER 0.0%)", "datasetDigest absent -> identityMismatch refusal, never a match", "falseVerifiedCount > 0 -> err, so nothing is published"], "invariants": ["no success channel carries an uncomputed delta", "identityMismatch's Result<never,string> property is inherited unchanged"] },
    { "name": "figuresOf (REVISED)", "module": "scripts/benchmark/score.ts", "signature": "(outcomes, system) => Result<Figures, string>", "change": "The two existing `throw new Error` calls at lines 129 and 132 become Result refusals", "why": "AGENTS.md §2: a raw throw may escape a test helper and nowhere else. These sit inside the function computing delta and falseVerifiedCount — exactly what M3 extends. Converting first prevents M3 propagating the violation into a new committed artefact." },
    { "name": "parseQuery", "module": "packages/mizan-retrieval/src/query-grammar.ts", "signature": "(input: string) => Result<ParsedQuery, QueryParseError>", "input": "a declarative query string (field:value, quoted phrase, -negation, sort:)", "output": "ParsedQuery on success", "errors": ["unparseable -> err naming the offending token", "empty -> err", "over-long -> err (bounded)"], "invariants": ["TOTAL: every byte string maps to accept or refuse; there is no third case", "no partial match", "no fallback to arbitrary results"], "notUsed": "Strategy pattern — one grammar, no interchangeable algorithms; a strategy here would be ceremony" },
    { "name": "TOOLS (EXTENDED)", "module": "packages/mizan-mcp/src/server.ts", "change": "A second read-only tool added alongside `verify`", "returnType": "RecordIdList — ids only", "preserved": ["stdio-only transport", "read-only capability", "single-tool verify unchanged"], "errors": ["corpus absent -> corpus_absent degradation", "unparseable query -> refusal"] },
    { "name": "calibrationState", "module": "packages/mizan-bench/src/calibration.ts", "signature": "() => CalibrationState", "output": "insufficient-samples | calibrated | drift", "invariants": ["no state renders as a bare number", "insufficient-samples is a declared state, never 0", "never widens the 8-member DegradationCondition union"] }
  ],
  "dataModels": [
    { "name": "HoldoutResult", "location": "data/benchmark/holdout.json (new artefact)", "rationale": "Kept separate from BenchmarkResult v2 so vs-search.json's 70 keys and dataset digests stay untouched — no digest invalidation, no blast radius on the existing benchmark.", "fields": { "schemaVersion": "number — mirrors BENCHMARK_SCHEMA_VERSION convention", "setName": "string — must not read as the dev set", "caseCount": "number — the denominator; ZERO IS A REFUSAL, never 0.0%", "falseVerifiedCount": "number — the count the whole design is judged on", "fpr": "number, OPTIONAL — falseVerifiedCount/caseCount; absent means UNMEASURED", "deltaFpr": "number, OPTIONAL — holdout FPR minus dev FPR; absent means UNMEASURED", "datasetDigest": "ds1:<64 hex> — required at schemaVersion 3 per identity.ts", "protocolDigest": "ds1:<64 hex> — the authoring protocol is part of the material", "authoredBy": "string — the authorship record ADR-19 turns on", "corpusFingerprint": "string — matched against attestation.json snapshotHash" }, "criticalProperty": "fpr and deltaFpr are OPTIONAL and their absence means 'unmeasured', which AGENTS.md §16 requires never render as 0. A 0 FPR and an absent FPR are different claims and the schema keeps them structurally apart." },
    { "name": "office_fact_memory entry (EXTENDED)", "location": "office_facts_research.json — TRACKED and COMMITTED, not gitignored", "verifiedFinding": "git ls-files --error-unmatch succeeds, so a hermetic gate IS possible; the office workflow's external memory is not needed", "addedFields": { "supersedes": "string, optional — the exact prior `fact` body being replaced", "reason": "string, optional — a reason code for the supersession" }, "rationale": "Bi-temporal, minimal, and expressed in mizan's idiom — the same shape office uses, without importing any office module.", "repairTarget": "Fact 4: claims 'hadith-only (abudawud 22, ibnmajah 16, malik 2); Quran and Tirmidhi unmeasured'. Artefact says abudawud 15, ibnmajah 13, malik 5, nasai 3, quran 2, tirmidhi 2, with 6 measured / 0 unmeasured. ALL THREE per-collection counts are wrong (22->15, 16->13, 2->5) plus the unmeasured claim — not merely 'the opposite of ADR-15'. Two are checkable against vs-search.json with no ADR parsing at all." },
    { "name": "LoadConditions", "location": "packages/mizan-core/src/schema/load.ts (new)", "fields": { "corpusFingerprint": "string", "corpusRecordCount": "number", "concurrency": "number", "durationMs": "number", "hostClass": "string" }, "rationale": "Lives in @mizan/core so a measured docs/scaling-path.md row is gated by the same figure machinery as every other published number. A row that stays untested carries unmeasured plus a stated reason." },
    { "name": "RecordIdList", "location": "packages/mizan-core/src/schema/record-id.ts (new)", "definition": "Schema.Array(Schema.String)", "rationale": "The ONLY return type of the S4 tool, so the response shape structurally cannot carry corpus text. This is the VerdictSummary discipline applied to ids rather than verdicts.", "security": "Makes A03 leakage from query text to corpus text structurally impossible, not merely checked-for" },
    { "name": "ADR-16", "location": "docs/specs/adr/ADR-16.md (new)", "requiredShape": ["## Context", "## Decision", "## Consequences", "**Status:** Accepted"], "contentDecision": "Record the dropped decision as DECLINED. A declined decision IS a decision, which keeps the file honestly Accepted without weakening checkAdrDocument for every other ADR.", "noSchemaChange": true }
  ],
  "testingStrategy": {
    "principle": "A guard that cannot fail is not a guard (AGENTS.md §14). Every new rule ships a planted violation that must fail, plus a negative test proving its scope limit.",
    "gateSelfTests": [
      "docs-facts.test.ts: plant fact 4's stale counts -> rule must fail; ALSO a non-numeric fact must produce no finding (scope-limit negative test)",
      "docs-holdout.test.ts: plant a wrong published delta-FPR -> must fail; plant the SAME table under an UNRECOGNISED header (recall@5) -> must STILL fail, proving the verified fail-open is closed",
      "mizan-gate/test/gates.test.ts: extend the existing planted-violation suite"
    ],
    "byteIdentityGolden": "M4: packages/mizan-suggest/test/rank-golden.test.ts asserts the ranked output is byte-identical over a fixed fixture. This is what makes 'answer-preserving' MACHINE-CHECKED rather than a review opinion — the single most important test in Sprint 1.",
    "refusalTests": [
      "holdout caseCount === 0 -> err naming the set, never 0.0%",
      "datasetDigest absent -> identityMismatch refusal, never a match",
      "hold-out falseVerifiedCount > 0 -> build failure, nothing published",
      "recallRegression -> err and nothing recorded",
      "unparseable query -> refusal, no partial match, no arbitrary results",
      "corpus absent -> corpus_absent, never a fabricated rate"
    ],
    "leakTest": "S4: assert no response field matches the summariseVerdict strip list (evidence, sourceUrl, license, attribution). Corpus text must never leave.",
    "regenerationTests": "bun run build:eval stays byte-identical; holdout.json writable ONLY by --record.",
    "securityTests": "G-4's planted AKIA…EXAMPLE fixture must still fail its own self-test, proving the gate can fail. No story adds a trust boundary; no story adds a secret.",
    "coverageTarget": "100% branch coverage on new pure functions, matching the repo's existing bar for gate logic.",
    "ciBudget": "Full bun run ci under 5 minutes (AGENTS.md §14). Two new rules must use single-pass scans. The hold-out run belongs in accept:customer, NOT in the default ci lane — it must not add a multi-minute step."
  },
  "office_auto_approve": { "confidence": 0.58, "evidence": "Baseline verified first-hand (CI GREEN 13/13 + 7/7 gates, check:docs GREEN, 47 dirty entries) and five material spec corrections found by execution, including a false 'rrf.ts is dormant' claim that would have committed a false description of the shipped system into an ADR. But M3's core acceptance criterion (hold-out falseVerifiedCount == 0) is NOT an agent-producible deliverable: a hold-out is defined by who authored it and what they could read, and an agent that has read scripts/eval/plan.ts cannot produce one — so M3b requires a human. M1 requires human review of a 47-entry diff, and M4's headline lever had to be cut as self-contradictory. Two of eight stories therefore cannot be completed as specified by the implementing agent." }
}
```