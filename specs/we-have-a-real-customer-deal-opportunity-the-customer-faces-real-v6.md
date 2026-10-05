# Spec: we-have-a-real-customer-deal-opportunity-the-customer-faces-real

**Request:** we have a real customer deal opportunity, The customer faces real consequences if they do not the platform works and functional at excellent state, so need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
# PM Delivery — Customer Deal Production Readiness

**Spec:** `spec-customer-deal-production-readiness-2026-10-05` · **Research:** `research-customer-verification-claims-2026-10-05`
**Scope:** 2 sprints, 11 stories (7 + 4), 7 gates unchanged, ADR-15…18 recorded as Proposed.

**Verified precondition (I re-checked, do not take on faith):** `scripts/eval/build.ts:182-183` `flatMap`s `collectionsOf(db)` into one anchor list and `buildMainClasses` at `:206` plus `buildElide :221`, `buildInjection :236`, `buildOneWord :251` all take contiguous `.slice()` prefixes. Committed `data/eval/redteam-fabricated.json` = `abudawud 22, ibnmajah 16, malik 2` (3 of 6 served collections, 37% excluded). Committed `data/eval/golden-normalization.json` already carries `nasai 25, quran 20, tirmidhi 16`. The closing data is in-tree.

**A PM correction to the CEO plan, stated up front:** the CEO backlog splits Story 1 (derive) from the gate and puts "zeros published" in Story 3. That ordering is wrong. If the table publishes *before* coverage is asserted in code, the customer sees a fixed number that can silently regress. I have therefore split the CEO's item 1 into **Story 1 (derivation + coverage gate)** and kept publication as Story 3, and I have made **the absent-slice gate a hard precondition of the publication freeze lifting**. Sprint 1 ordering below reflects this, not the CEO's numbering.

---

## 1. Story Overview

| # | Story | Epic | Pri | Sprint | Size | Risk | Reach | Impact | Conf | Effort | **RICE** |
|---|-------|------|-----|--------|------|------|-------|--------|------|--------|----------|
| 1 | ADR-15 per-collection anchor derivation + coverage gate | E1 | Must | 1 | L | High | 8 | 3 | 0.95 | 1.5 | **15.2** |
| 2 | Regenerate red-team set, preserve hand-adjudicated anchors | E1 | Must | 1 | M | High | 8 | 2 | 0.90 | 1.0 | **14.4** |
| 3 | Publish per-collection measured table (zeros included) | E1 | Must | 1 | M | Med | 9 | 3 | 0.90 | 1.0 | **24.3** |
| 4 | Dataset identity digest; refuse mismatched run identities | E1 | Must | 1 | M | Med | 7 | 2 | 0.95 | 1.0 | **13.3** |
| 5 | ADR-17 recall gate as precondition of any latency artefact | E5 | Must | 1 | M | High | 6 | 2 | 0.90 | 1.0 | **10.8** |
| 6 | `accept:customer` — one command, exits 0 on a clean clone | E4 | Must | 1 | L | Med | 10 | 3 | 0.85 | 2.0 | **12.8** |
| 7 | Clean-clone typed degradation tests on CLI and MCP | E4 | Must | 1 | M | Med | 7 | 2 | 0.90 | 1.0 | **12.6** |
| 8 | ADR-18 derived claim surface + comparative claims generator | E2 | Must | 2 | L | High | 8 | 2 | 0.80 | 2.0 | **6.4** |
| 9 | Gate sweep: typed figures in `.py` generators + generated artefacts | E2 | Must | 2 | M | Med | 7 | 2 | 0.85 | 1.0 | **11.9** |
| 10 | ADR-16 MCP dual era + second opt-in tool + golden transcripts | E3 | Should | 2 | L | High | 5 | 2 | 0.75 | 2.0 | **3.8** |
| 11 | Per-collection latency table with conditions + tolerance block | E6 | Should | 2 | M | Med | 5 | 1 | 0.85 | 1.0 | **4.3** |

**Scope compliance:** Sprint 1 = 7 stories (limit 10). Sprint 2 = 4 stories (limit 10). No story plans beyond Sprint 2.

---

## 2. Dependency Graph

```
                                  [Story 1] ADR-15 derivation + coverage gate
                                        |
        +---------------+---------------+---------------+----------------+
        |               |               |               |                |
   [Story 2]      [Story 4]        [Story 5]                              |
   regen set      digest+ident    recall-before-latency                   |
        |               |               |                               |
        +-------+-------+               |                               |
                |                       |                               |
        [Story 3] published        (Sprint 2)                            |
        per-collection table          |                               |
                |                 [Story 11]                            |
                |                 latency table                         |
        [Story 8] ADR-18                  |                             |
        derived claims                     |                             |
                |                          |                             |
        [Story 9] .py sweep                 |                             |
                                                |                        |
        [Story 2]+[Story 4] --------------------|                        |
                \                              |                        |
                 [Story 6] accept:customer <----+                        |
                        |                                                 |
                        +--------> [Story 7] clean-clone tests            |
                        |                                                 |
                        +--------> [Story 10] MCP dual era <--------------+
```

**Blocking:** 1 → {2, 4, 5}; 2 → 3; 2+4 → 6; 6 → {7, 10}; 3 → 8; 8 → 9; 5 → 11.
**Shared dependency:** 6 is the sole path to both shipped surfaces' degradation proof; slipping 6 slips E3, E4 and R6 simultaneously.
**External dependencies:** none that reach the network. Corpus (`data/corpus.db`, gitignored) is the only binary input; Bun 1.3.14, TS 5.6.3, `effect@4.0.0-beta.83` are pinned. `data/registry/external-claims.json` is committed data, not a live fetch.
**Critical path:** 1 → 2 → 6 → 10. Stories 3/8/9 form a second chain behind 2.
**Mitigation for the one real external risk:** no third-party API is in the build or verification path, so dependency-failure mitigation is *not applicable* — if that ever changes it is a constitutional breach (ADR-03, G-1), not a story.

---

## Sprint 1: Measurement Integrity (the gating deliverable)

### Story 1: ADR-15 — per-collection anchor derivation with a coverage gate that fails on an absent slice

**Epic** E1 · **Priority** Must · **Size** L · **Risk** High · **Depends on** nothing · **RICE** 15.2

**Story statement.** As the release owner, I want red-team anchors derived as a function of the served set and coverage of every served collection asserted as a gate condition, so that an uncovered collection fails the build instead of quietly shipping an aggregate that hides it.

**INVEST**
- **I** — depends only on `scripts/eval/build.ts`, `scripts/eval/plan.ts`, the gate package and one new ADR. No other story is required.
- **N** — the derivation rule is deliberately left to the SE (round-robin, id-ascending, or quota; all are acceptable). What is *not* negotiable is that it is a pure function of the served set.
- **V** — closes R1, the one Critical business risk, and it is the precondition for quoting any figure at all.
- **E** — 1.5 person-months; the defect site is 4 call sites in one file.
- **S** — one PR: one ADR, one derivation function, one gate rule, one self-test.
- **T** — every criterion below is a pass/fail on `bun run ci`.

**Acceptance criteria**

```
Scenario: Derivation covers every served collection
  Given a corpus whose served set is the 6 collections
  And a served-collection list resolved from that same corpus, not hardcoded
  When anchors are derived for the main classes
  Then every served collection contributes a non-zero number of anchors to every main class
  And a served collection with no usable span is reported by name, not silently given zero

Scenario: Derivation is a pure function of the served set
  Given a corpus snapshot pinned by hash
  When derivation runs twice in the same commit
  Then the two outputs are byte-identical
  And derivation consults no clock, no locale and no randomness
  And the anchor order is total and documented

Scenario: Class sizes stop being slice offsets
  Given a class whose size today comes from a .slice(fromOffset, fromOffset + count) prefix
  When the class is built
  Then its size comes from the documented rule or from plan.ts
  And no contiguous-prefix slice of a flattened multi-collection list remains

Scenario: An ABSENT slice fails the build (not merely a regressed one)
  Given the coverage gate and a served collection missing from the derived set
  When the gate runs
  Then it exits non-zero
  And it names the missing collection and the gate id
  And the wording distinguishes "absent" from "count fell below a floor"

Scenario: The gate can actually fail (planted-violation self-test)
  Given a fixture in which one served collection is dropped from derivation
  When the gate's self-test runs
  Then the self-test fails, proving the gate discriminates
  And a fixture with all 6 collections present passes

Scenario: Anchor expectations never leak from the code under test
  Given the derivation and expectation sources
  When the gate inspects their provenance
  Then expectations trace to plan.ts and adjudication.json
  And no anchor or expectation is observed from @mizan/verify or mizan-verify sources

Scenario: A gate-count change does not leave stale prose
  Given this story adds a gate id to GATE_IDS in packages/mizan-gate/src/run-gates.ts
  When check:docs runs
  Then every prose statement of the gate count matches GATE_IDS
  And if the coverage assertion is added as a rule of an existing gate instead, the gate id set is unchanged
```

**Edge cases**
- *Input:* a served collection whose every candidate row lacks a usable span; a collection name with unusual casing/whitespace; a collection with a single row.
- *State:* two concurrent `build:eval` invocations writing the same output path.
- *Data:* a served collection of size 1; an empty served set; a corpus whose served set shrinks between derivation and gating.
- *Network:* none. Derivation must not reach the network — if it needs to, that is a constitutional breach, not an edge case.
- *Security:* corpus text must never enter a gate report (ids and counts only, AGENTS §13).

**Security scenarios**
```
Scenario: Coverage gate fails closed
  Given the gate cannot resolve the served set (corpus absent)
  When the gate runs
  Then it exits non-zero with a typed "cannot verify coverage" condition
  And it never reports coverage as satisfied

Scenario: No corpus or question text in gate output
  Given a coverage failure report
  When it is rendered
  Then it carries collection names, ids and counts only
  And no anchor text, quote text, question text or absolute filesystem path appears

Scenario: Verdict-path purity preserved
  Given the new derivation lives in scripts/eval
  When G-1 and G-7 run
  Then mizan-verify's single dependency is unchanged and its import set gains nothing
```

**Performance requirements**
- Response time: derivation + gate adds **≤ 20 s** to the CI job.
- Throughput: n/a (build-time, single-run).
- Resource limits: bounded memory — derivation must not materialise all 6,236 Qur'an rows plus spans at once beyond what the existing anchor helpers already do; state the measured peak.
- Scalability: derivation cost is O(served collections × per-collection quota), so adding a collection later must not change the cost class. This is what makes a future Bukhari/Muslim addition cheap.

**Reliability requirements**
- Error handling: `Result` at every boundary; no `throw` crosses a package (AGENTS §2). A missing corpus yields a typed failure, never a crash.
- Timeout behaviour: unchanged 30 s / 10 s / 60 s budgets; derivation adds no network wait.
- Retry: no retry — derivation is deterministic and local; a retry would only mask nondeterminism.
- Graceful degradation: none permitted. Coverage is a gate, so it fails closed (AGENTS §3).

**Task definition**
```json
{
  "goal": "Derive red-team anchors per served collection and assert coverage of every served collection as a gate condition that fails on an absent slice.",
  "deliverables": [
    { "name": "docs/specs/adr/ADR-15.md", "format": "markdown" },
    { "name": "scripts/eval/build.ts", "format": "typescript" },
    { "name": "packages/mizan-gate/src/ (coverage rule + self-test)", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "ADR-15 exists and states the derivation rule and the absent-slice condition", "verificationKind": "file_exists", "verificationSpec": "docs/specs/adr/ADR-15.md" },
    { "text": "No contiguous-prefix slice of a flattened multi-collection anchor list remains", "verificationKind": "test_passes", "verificationSpec": "bun test scripts/eval (from the owning package directory)" },
    { "text": "The coverage gate self-test fails when a served collection is dropped", "verificationKind": "test_passes", "verificationSpec": "bun run ci:gates" },
    { "text": "The gate count stated in prose matches GATE_IDS", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 2: Regenerate the red-team set across all six collections while preserving hand-adjudicated anchors

**Epic** E1 · **Priority** Must · **Size** M · **Risk** High · **Depends on** Story 1 · **RICE** 14.4

**Story statement.** As the release owner, I want the fabricated set regenerated from the per-collection derivation with every hand-adjudicated anchor preserved and every expectation hand-adjudicated, so that the measured coverage is real and not an artefact of a generator that guessed its own answers.

**INVEST**
- **I** — consumes Story 1's derivation; needs nothing else.
- **N** — class sizes, the span-selection heuristic and whether the set grows to 6× are open.
- **V** — the denominator behind every figure the customer will see; also the direct mitigation for R4.
- **E** — 1.0 person-month; the risky part is review, not coding.
- **S** — regenerate, diff, adjudicate, commit.
- **T** — per-collection counts, zero false accepts, adjudication preservation, and the leak invariant are all assertable.

**Acceptance criteria**
```
Scenario: Every served collection is measured after regeneration
  Given a corpus with all 6 served collections
  When the eval set is rebuilt
  Then the generated set contains a non-zero case count for each of the 6 collections
  And the total equals the sum of per-class counts with no case belonging to two classes

Scenario: No fabricated case is verified
  Given every case whose class marks it a fabrication
  When the suite is evaluated
  Then the count of verified verdicts on those cases is 0
  And falseVerifiedDelta stays 0
  And any positive delta exits non-zero

Scenario: Hand-adjudicated anchors survive regeneration
  Given data/eval/adjudication.json entries written by a human
  When the set is regenerated
  Then every adjudication id still resolves to a generated case
  And no adjudication is dropped, re-labelled or re-labelled by the generator
  And the adjudication diff is reviewed and committed in the same commit as the regenerated set

Scenario: Expectations are hand-adjudicated, never observed from the verifier
  Given a case expectation
  When its provenance is inspected
  Then it traces to plan.ts or adjudication.json
  And no expectation in the set was produced by running @mizan/verify
  And the gate fails when this invariant is violated

Scenario: A mutation that is secretly a verbatim quote is not shipped as a fabrication
  Given a case whose mutated text still normalizes equal to its source span
  When the set is built
  Then the case is rejected at build time with its id named
  And no case ships carrying a fabricated label while its text is a faithful quotation

Scenario: Regeneration is idempotent
  Given the same pinned corpus snapshot and the same plan
  When the set is built twice
  Then the two files are byte-identical

Scenario: Denominator changes rewrite published figures in the same commit
  Given this regeneration changes a published count
  When the change is committed
  Then every document stating that count is updated in the same commit
  And check:docs exits 0
```

**Edge cases**
- *Input:* a class whose quota exceeds what a collection can supply; a substitution word absent from the corpus.
- *State:* generator reading a corpus while the snapshot changes under it — pin by `snapshotHash`, refuse on mismatch.
- *Data:* a collection with exactly one fabrication-eligible row; a class landing on 0 entries after per-collection splitting; duplicate `record.id` across classes (dedupe by id-ascending, as `anchorsOf` already does).
- *Network:* none.
- *Security:* fabricated text is derived from committed corpus rows — never from user input, never from a live provider.

**Security scenarios**
```
Scenario: No fabricated case carries prompt-injection payload from a provider
  Given the default checkout has no API key
  When the eval set is built
  Then every fabricated text is derived from the local corpus and a declared mutation
  And no model output contributes fixture text

Scenario: Expectations cannot be self-fulfilling
  Given a reviewer question of "did the generator just ask the verifier what to expect"
  When provenance is checked
  Then no fixture expectation is observed from @mizan/verify
  And the check is a gate, not a review step

Scenario: Fixture text is length-capped and data-only
  Given a fabricated quote
  When it is generated
  Then it is bounded by the existing span bounds and marked data-only
  And it is never interpolated into a prompt as an instruction
```

**Performance requirements**
- Response time: full regeneration completes inside the CI job budget; state the measured wall time on both runners (R8).
- Resource limits: bounded memory over a 6,236-row Qur'an table plus spans; assert a peak rather than assuming.
- Scalability: regeneration cost must scale with the *quota*, not with corpus size, so corpus growth does not silently slow the build.

**Reliability requirements**
- Error handling: untrusted attestation ⇒ existing `exit 3` behaviour preserved; no change.
- Timeout: unchanged budgets; regeneration is local.
- Retry: none. A retry after a partial write must not be able to produce a different file than the first run — the write is atomic or it is refused.
- Graceful degradation: none. A dataset that cannot be built is a build failure, not a smaller dataset.

**Task definition**
```json
{
  "goal": "Regenerate the fabricated eval set so all 6 served collections are measured, preserving hand-adjudicated anchors and the never-observe-expectations-from-verify invariant.",
  "deliverables": [
    { "name": "data/eval/redteam-fabricated.json", "format": "json" },
    { "name": "data/eval/adjudication.json (preserved, diffed)", "format": "json" },
    { "name": "scripts/eval/plan.ts (anchor/expectation provenance)", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "All 6 served collections appear with a non-zero case count", "verificationKind": "contains_text", "verificationSpec": "data/eval/redteam-fabricated.json contains each served collection id" },
    { "text": "Zero verified verdicts on fabricated cases; a positive delta fails", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "No fixture expectation is observed from mizan-verify", "verificationKind": "test_passes", "verificationSpec": "bun run ci:gates" },
    { "text": "check:docs exits 0 after any published-count rewrite", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 3: Publish the per-collection measured table, zeros rendered rather than omitted

**Epic** E1 · **Priority** Must · **Size** M · **Risk** Medium · **Depends on** Story 2 · **RICE** 24.3

**Story statement.** As a customer engineer performing due diligence, I want a table that states, per served collection, how many fabrications were tested and how many were rejected, and that renders a zero rather than dropping the row, so that I can see what was and was not measured instead of taking an aggregate on faith.

**INVEST**
- **I** — needs Story 2's set; writes only to two documents plus the generator seam.
- **N** — table shape, column set and ordering are the SE's call provided a zero row is structurally guaranteed.
- **V** — the highest-RICE item in the plan. This is the differentiator no competitor ships and the artefact that converts a demo into due-diligence evidence.
- **E** — 1.0 person-month including the honesty framing pass.
- **S** — two documents plus a generator hook.
- **T** — row-per-served-collection is mechanically assertable; a missing row fails.

**Acceptance criteria**
```
Scenario: The table states coverage per served collection
  Given a completed eval run over the regenerated set
  When the per-collection table is produced
  Then it carries one row per served collection with: collection, cases tested, rejected count, verified count
  And it states the dataset digest the numbers came from
  And every figure is derived, not retyped

Scenario: A zero is rendered, never omitted (the differentiator)
  Given a served collection with a measured count of 0
  When the table is produced
  Then the row exists and reads "measured 0 — no figure published", naming the reason coverage is absent
  And the row is not silently dropped and not rendered blank
  And a coverage gate (Story 1) explains why the zero is still true

Scenario: The table pairs each zero with cause and control
  Given any zero or low row in the table
  When the document is read
  Then it names the structural cause and the gate that prevents recurrence

Scenario: No stale figure survives a denominator change
  Given a change to the dataset digest
  When check:docs runs
  Then any figure in an audited document that no longer matches its source is reported as a failure naming the document

Scenario: Hand-typed figures in audited documents are rejected
  Given an audited document carrying a numeric figure bound to a claim word
  When check:docs runs
  Then it exits non-zero naming the document, the claim and the figure

Scenario: The publication freeze holds until this story lands
  Given the customer-facing claim surface before this story is merged
  When any figure is inspected
  Then no per-collection or aggregate fabrication figure is published from the pre-fix dataset
  And the freeze is lifted only by this story's merge, not by a decision

Scenario: Unmeasured is a representable state
  Given no corpus and therefore no runnable eval
  When the documents are read
  Then they state "unmeasured" for the affected figures
  And they never carry a number from a previous snapshot presented as current
```

**Edge cases**
- *Input:* a document hand-edited to add a figure; a figure with a thousands separator or a percentage formatting.
- *State:* docs regenerated while a corpus snapshot is unavailable.
- *Data:* 1 row in a collection; a collection with 0 cases; a table with more rows than served collections (a stale row from a removed collection must fail).
- *Network:* external comparison figures resolve through the committed `data/registry/external-claims.json` only — **never fetched at build or gate time**.
- *Security:* citation ids and counts only; no corpus or question text.

**Security scenarios**
```
Scenario: No raw content in a published table
  Given the table in docs/value-proof.md
  When its cells are inspected
  Then they contain ids, counts, ratios and digests
  And no corpus text, question text, model output or secret appears

Scenario: External figures are sourced and dated
  Given a comparative figure attributed to a third party
  When it is rendered
  Then it resolves to an entry in data/registry/external-claims.json carrying a source URL and a date
  And an unattributed external figure fails the gate

Scenario: Percentages cannot be stated without their denominator
  Given a rate stated in an audited document
  When check:docs runs
  Then a rate with no denominator or tolerance context is reported as a failure
```

**Performance requirements**
- Response time: table generation ≤ 5 s; `check:docs` stays within its existing budget across 300+ swept files.
- Throughput: n/a.
- Resource limits: no network, no corpus load beyond the pinned snapshot.
- Scalability: a 7th collection must add a row automatically, not require a hand edit.

**Reliability requirements**
- Error handling: missing evidence artefact ⇒ non-zero naming the artefact; never a blank cell.
- Timeout: unchanged.
- Retry: none; generation is pure.
- Graceful degradation: `unmeasured` is the only permitted degradation, and it must be visibly distinct from `0`.

**Task definition**
```json
{
  "goal": "Publish the per-collection measured coverage table with derived figures, dataset digest, and zeros rendered rather than omitted.",
  "deliverables": [
    { "name": "docs/value-proof.md", "format": "markdown" },
    { "name": "docs/specs/measurements.md", "format": "markdown" }
  ],
  "successCriteria": [
    { "text": "One row per served collection, zeros rendered not dropped", "verificationKind": "contains_text", "verificationSpec": "docs/value-proof.md contains a per-collection coverage table including an explicit zero-state wording" },
    { "text": "Every figure carries the dataset digest it came from", "verificationKind": "contains_text", "verificationSpec": "docs/specs/measurements.md states a dataset digest" },
    { "text": "Hand-typed figures in audited documents fail the gate", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" },
    { "text": "No corpus or question text present in the published tables", "verificationKind": "test_passes", "verificationSpec": "bun run ci:gates" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 4: Dataset identity digest in every report; relative gates refuse mismatched run identities

**Epic** E1 · **Priority** Must · **Size** M · **Risk** Medium · **Depends on** Story 1 · **RICE** 13.3

**Story statement.** As a reviewer comparing two measurement runs, I want each report to carry a dataset identity digest and each relative comparison to refuse when the identities differ, so that missing or regenerated evidence can never read as green.

**INVEST**
- **I** — depends only on Story 1's derivation being settled; no document work.
- **N** — digest composition, canonical-JSON key order and version prefix are negotiable *as long as* they are written down in exactly one module (AGENTS §17).
- **V** — turns "the numbers moved" into "the numbers moved *or the data changed*", which is the difference between a gate and a mood.
- **E** — 1.0 person-month.
- **S** — one digest module, one rule, one test.
- **T** — refusal on mismatch is a pure function test.

**Acceptance criteria**
```
Scenario: Every report carries an identity
  Given any report, table or artefact produced by this cycle
  When it is produced
  Then it carries a versioned dataset digest and, where a corpus is involved, the corpus snapshotHash
  And the digest rule is defined in exactly one module

Scenario: A relative comparison refuses mismatched identities
  Given a baseline artefact and a current artefact with different dataset digests
  When a relative gate compares them
  Then it refuses to compute a delta, exits non-zero, and names both digests
  And it never reports a pass derived from incomparable evidence

Scenario: A missing digest is a refusal, not a pass
  Given a baseline that predates digest versioning
  When a relative gate runs
  Then it exits non-zero naming the missing identity
  And it does not treat absent identity as matching

Scenario: Identical identities permit the comparison
  Given two artefacts with the same digest
  When the relative gate runs
  Then it computes the comparison normally
  And the comparison is within the declared tolerance

Scenario: Denominator drift is visible rather than silent
  Given a dataset change that alters a published denominator
  When reports are produced
  Then the digest changes and the previously published figure is reported stale until rewritten in the same commit

Scenario: Digest is stable under reordering
  Given the same logical dataset serialised with different key order
  When the digest is computed
  Then the digest is identical, because the canonical form is applied first
```

**Edge cases**
- *Input:* a report hand-written rather than generated (no digest).
- *State:* baseline artefact committed from an older commit; a partially written artefact.
- *Data:* an empty dataset (digest of zero items must still be well-defined); a dataset larger than memory of the digest pass.
- *Network:* none.
- *Security:* the digest is one-way over content; the report publishes the digest and never the content it covers.

**Security scenarios**
```
Scenario: The digest does not become a content side channel
  Given a published report
  When its digest is inspected
  Then the digest cannot be used to recover any individual row, quote or question
  And no content-derived identifier is published beyond the aggregate digest

Scenario: Digest inputs exclude secrets
  Given an environment containing an API key
  When a digest is computed over a dataset or report
  Then the key is not an input and never appears in the digest's source material

Scenario: Fail closed on an unverifiable identity
  Given identity cannot be computed (missing artefact, hash mismatch)
  When a gate runs
  Then it exits non-zero with a typed condition
  And it never proceeds to a pass
```

**Performance requirements**
- Response time: digest over ≤ 10⁴ cases **< 1 s**; total added CI time ≤ 5 s.
- Resource limits: streaming hash; bounded memory independent of dataset size.
- Scalability: 10× dataset size must not change the cost class (linear hash pass, no n² comparison).

**Reliability requirements**
- Error handling: `Result` at the digest boundary; no `throw` escapes a package.
- Timeout: unchanged.
- Retry: none.
- Graceful degradation: none. Identity is not degradable — its absence is a refusal.

**Task definition**
```json
{
  "goal": "Carry a versioned dataset identity digest in every report and make relative gates refuse mismatched run identities.",
  "deliverables": [
    { "name": "packages/mizan-core/src/ (single digest + canonical-JSON module)", "format": "typescript" },
    { "name": "packages/mizan-gate/src/ (mismatched-identity rule + self-test)", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "The digest rule is defined in exactly one module", "verificationKind": "test_passes", "verificationSpec": "bun run ci:gates" },
    { "text": "A mismatched-identity comparison exits non-zero naming both digests", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "A missing digest exits non-zero rather than passing", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "Digest is stable under key reordering", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 5: ADR-17 — recall is a precondition of recording any latency artefact

**Epic** E5 · **Priority** Must · **Size** M · **Risk** High · **Depends on** Story 1 · **RICE** 10.8

**Story statement.** As the release owner, I want the recall assertion to execute and pass *before* any latency number is written to a document or artefact, and relative latency gates to refuse mismatched run identities, so that recall can never be traded for speed the way ADR-08's sidecar did.

**INVEST**
- **I** — depends on Story 1 for the coverage assertion; the ordering change is local to the recording path.
- **N** — the recall floor value and whether the assertion is per-collection or aggregate are negotiable; the *ordering* is not.
- **V** — closes R3, the second Critical reliability risk, with a mechanism rather than a discipline.
- **E** — 1.0 person-month.
- **S** — one ordering change plus one rule.
- **T** — a planted recall regression proving no artefact is written is a clean, fast test.

**Acceptance criteria**
```
Scenario: A recall regression blocks the artefact write
  Given a measurement run where the recall assertion fails
  When the recording path is invoked
  Then no latency artefact is written — not a stale one, not a partial one
  And the command exits non-zero naming the failing cases
  And the write is never reached

Scenario: Ordering is enforced, not conventional
  Given the recording path
  When its call order is inspected
  Then the recall assertion strictly precedes any file write of a latency artefact
  And a test asserts the ordering rather than trusting a comment

Scenario: Relative latency gates refuse mismatched run identities
  Given a recall run and a latency run from different dataset identities
  When the relative gate evaluates the latency figure
  Then it refuses and exits non-zero naming both identities

Scenario: The precedent is on the record
  Given ADR-17
  When it is read
  Then it cites ADR-08's trigram-sidecar result (target met, 3 of 10 adversarial cases lost) as the reason this is a gate
  And it states that latency work, if it ever happens, is blocked until recall is green

Scenario: Recording under a green recall run is permitted and annotated
  Given a green recall run and a matching identity
  When a latency figure is recorded
  Then it is written together with its recall run identity and the 1.5x tolerance band
  And the band lives in version control, not in a code comment

Scenario: "Faster" is not an accepted reason to skip the gate
  Given a proposal to record a latency figure without a recall run
  When the change is reviewed by the gate
  Then it is rejected; the gate has no bypass switch
```

**Edge cases**
- *Input:* a latency figure supplied by hand into a document (bypasses the recorder).
- *State:* recall green, latency run interrupted mid-write; recall run interrupted.
- *Data:* a recall run with zero cases (must not vacuously pass — zero cases is a refusal).
- *Network:* none.
- *Security:* the artefact carries run identities and machine *class*, never a hostname, username or absolute path.

**Security scenarios**
```
Scenario: The recall gate cannot be bypassed
  Given an environment variable or flag proposed as an escape hatch
  When the recording path runs
  Then no configuration path skips the recall assertion
  And a test asserts the absence of such a switch

Scenario: Artefacts carry identity, not content
  Given a recorded latency artefact
  When it is inspected
  Then it contains counts, quantiles, digests and machine class
  And no question text, corpus text, hostname, username or secret

Scenario: Vacuous recall is a refusal, not a pass
  Given a recall run that collected zero cases
  When the precondition evaluates
  Then it fails closed
  And it never satisfies itself with an empty sample
```

**Performance requirements**
- Response time: the precondition adds ≤ 10 s to an opt-in measurement run; **zero** cost when no latency is being recorded.
- Throughput: n/a.
- Resource limits: unchanged.
- Scalability: unchanged — this is a gate, not a hot path. It must never be added to the per-query path.

**Reliability requirements**
- Error handling: untrusted attestation ⇒ existing `exit 3` preserved.
- Timeout: 30 s / 10 s / 60 s unchanged; the recall assertion runs inside the existing suggestion budget.
- Retry: bounded retry unchanged; a retry that changes recall results must invalidate the precondition (identity mismatch handles this).
- Graceful degradation: none. Degrading here means trading correctness for speed — the exact failure ADR-08 recorded.

**Task definition**
```json
{
  "goal": "Make the recall assertion a strict precondition of writing any latency artefact, with relative gates refusing mismatched run identities.",
  "deliverables": [
    { "name": "docs/specs/adr/ADR-17.md", "format": "markdown" },
    { "name": "scripts/eval/suggest-coverage.ts", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "ADR-17 exists and cites the ADR-08 precedent", "verificationKind": "contains_text", "verificationSpec": "docs/specs/adr/ADR-17.md mentions ADR-08" },
    { "text": "A planted recall regression leaves no latency artefact written", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "A zero-case recall run fails closed", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "The 1.5x band and recall floors live in version control", "verificationKind": "contains_text", "verificationSpec": "scripts/eval/suggest-coverage.ts declares the tolerance band as a named constant" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 6: `accept:customer` — every published figure re-derived by one command on a clean clone

**Epic** E4 · **Priority** Must · **Size** L · **Risk** Medium · **Depends on** Stories 2, 4 · **RICE** 12.8

**Story statement.** As a customer with a clean clone, no corpus and no API key, I want one command that re-derives every published figure and prints each surface's honest degraded state, so that due diligence becomes a command I run rather than a claim I accept.

**INVEST**
- **I** — reads only committed artefacts and degrades without a corpus; depends on Stories 2 and 4 for the numbers and the identity.
- **N** — output layout and section order are negotiable; exit-code discipline is not.
- **V** — highest Reach in the plan (10). Converts a demo into evidence.
- **E** — 2.0 person-months, the largest Sprint 1 item.
- **S** — one script plus one package.json entry.
- **T** — a clean-clone test *is* the acceptance criterion.

**Acceptance criteria**
```
Scenario: One command, clean clone, exit 0
  Given a fresh clone with no data/corpus.db and no API key
  When the acceptance command is run
  Then it exits 0
  And it does not attempt ingest, does not require a key, and does not reach the network

Scenario: It prints the served set and the coverage table
  Given the committed evidence artefacts
  When the command runs
  Then it prints the served set, and for each collection the measured case count and rejected count
  And each figure is labelled with its dataset digest
  And a figure it could not re-derive prints "unmeasured" rather than a number

Scenario: Latency is printed only with its conditions
  Given latency evidence exists in the tree
  When the command runs
  Then it prints latency only together with quantity, tolerance band and conditions
  And a bare absolute latency number is never printed

Scenario: Each surface's degraded state is printed
  Given no corpus on either surface
  When the command runs
  Then it prints the CLI's typed degraded state and the MCP surface's typed degraded state
  And it distinguishes "expected degradation on a clean clone" from "a check failed"

Scenario: No silent skip
  Given any subsection that cannot run
  When the command runs
  Then it prints a named reason and a typed state
  And the word "skipped" never appears without an adjacent reason
  And the exit code reflects the contract below

Scenario: Exit code contract
  Given all re-derivable checks match their published values and all degradations are the expected typed ones
  When the command finishes
  Then it exits 0
  Given any check fails, or any surface returns an unexpected crash rather than a typed state
  When the command finishes
  Then it exits non-zero and names the failing check id
  And it names only one failing check per run's summary line, deterministically

Scenario: Determinism
  Given two runs on the same commit
  When the commands are compared
  Then the section ordering and the figures are identical
```

**Edge cases**
- *Input:* invoked from a subdirectory; invoked with a stale `data/` left over from another commit.
- *State:* a partially ingested corpus present; a corpus whose snapshotHash does not match the committed evidence.
- *Data:* a committed artefact missing from a shallow clone; a `data/` directory absent entirely.
- *Network:* must be offline-capable. If any step tries to fetch, that is a failure of this story.
- *Security:* must not echo environment secrets; must not require `.env`; must not print absolute paths outside the repository.

**Security scenarios**
```
Scenario: No key required and none printed
  Given an environment with MIZAN_LLM_API_KEY set, and one without
  When the command runs in each
  Then both exit 0 identically
  And no key value, prefix or length appears in output

Scenario: No network egress
  Given a network-disabled environment
  When the command runs
  Then it completes successfully
  And any attempted outbound request is a test failure

Scenario: Absolute paths and host details are not leaked
  Given the command's output
  When inspected
  Then paths are repository-relative
  And no hostname, username or home directory appears

Scenario: Untrusted evidence is refused, not re-derived
  Given a committed artefact whose attestation does not verify
  When the command runs
  Then it prints the typed untrusted condition and exits non-zero
  And it does not present the artefact's figures as re-derived
```

**Performance requirements**
- Response time: **≤ 180 s** wall clock on a clean clone, both runners.
- Throughput: single invocation; no concurrent-run requirement.
- Resource limits: bounded memory; must not attempt to load a full corpus when none is needed for a degraded surface.
- Scalability: with a corpus present, runtime must remain bounded and report progress per section rather than appearing hung.

**Reliability requirements**
- Error handling: per-section isolation — one section's unexpected failure does not abort the run; it is recorded and reflected in the exit code.
- Timeout: per-section bounded timeout; a hung section times out into a typed state, not an indefinite wait.
- Retry: none for local reads; retry only where an existing bounded-retry path already applies, unchanged.
- Graceful degradation: **this is the story.** Degradation is the expected path on a clean clone, and exit 0 is correct only when every degradation is the typed honest state.

**Task definition**
```json
{
  "goal": "Ship one customer-runnable acceptance command that re-derives every published figure on a clean clone with no corpus and no API key, and never skips silently.",
  "deliverables": [
    { "name": "scripts/accept-customer.ts", "format": "typescript" },
    { "name": "package.json (accept:customer script entry)", "format": "json" }
  ],
  "successCriteria": [
    { "text": "accept:customer exits 0 on a clean clone with no corpus and no key", "verificationKind": "command_exit_0", "verificationSpec": "bun run accept:customer" },
    { "text": "No network egress and no secret echoed", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "Latency is printed only with quantity, band and conditions", "verificationKind": "contains_text", "verificationSpec": "scripts/accept-customer.ts prints no bare absolute latency" },
    { "text": "A failing check names itself and exits non-zero", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 7: Typed honest degradation proven by test on both shipped surfaces

**Epic** E4 · **Priority** Must · **Size** M · **Risk** Medium · **Depends on** Story 6 · **RICE** 12.6

**Story statement.** As a customer with no corpus, I want both the CLI and the MCP server to return a typed honest state instead of crashing, so that the clean-clone experience is a disclosed behaviour rather than an accident.

**INVEST**
- **I** — pure test work over existing behaviour plus whatever typed state is missing; depends only on Story 6 for the invocation path.
- **N** — whether the state is an exit code, a Result variant or a JSON-RPC result member is the SE's call.
- **V** — closes R6 (High). Today nothing asserts this at all.
- **E** — 1.0 person-month.
- **S** — two test files plus, at most, the minimal typed state they reveal is missing.
- **T** — the tests are the deliverable; each asserts a decoded typed state.

**Acceptance criteria**
```
Scenario: CLI degrades to a typed state with no corpus
  Given no data/corpus.db
  When the CLI runs a verify-shaped command
  Then it returns the typed corpus-absent / no-sources-found state
  And the exit code matches the documented contract
  And no stack trace, no unhandled rejection and no partial answer presented as complete

Scenario: MCP degrades to a typed state with no corpus
  Given no data/corpus.db
  When an MCP client completes a tools/call verify round-trip
  Then the response is a well-formed JSON-RPC result or error carrying the typed degraded state
  And the process does not crash and the transport does not desynchronise

Scenario: Every degraded state is decoded, not pattern-matched
  Given a degraded response from either surface
  When the test asserts on it
  Then it is narrowed through the declared schema at the boundary
  And the test cannot pass on a string that merely contains a plausible word

Scenario: Every failure mode in the constitution's table has a test
  Given the seven-row degradation table in AGENTS §16
  When the degradation tests run
  Then each row's surface state is covered on at least one shipped surface
  And any row not implemented on a surface is asserted as explicitly unavailable, never as silently fine

Scenario: Fail-closed behaviour holds under the degraded state
  Given the degraded state on either surface
  When a verdict would otherwise be produced
  Then no verdict is produced
  And no cached prior verdict is served as current

Scenario: Both surfaces agree on the state name
  Given the CLI and the MCP server in the same no-corpus condition
  When both respond
  Then they name the same degradation condition, so a customer comparing surfaces is not confused
```

**Edge cases**
- *Input:* a corpus path that exists but is empty; a corpus file that is not a database; a truncated database.
- *State:* concurrent requests to the MCP server while the corpus is absent; a request mid-shutdown.
- *Data:* zero rows; a database with tables but no served collections.
- *Network:* MCP is stdio-only; a client that sends an unexpected method or malformed JSON must get a typed error, not a desync.
- *Security:* the degraded response must not disclose absolute paths; MCP must remain read-only and must return no corpus text.

**Security scenarios**
```
Scenario: Degradation does not become an information leak
  Given a no-corpus MCP response
  When inspected
  Then it names the missing resource, not the absolute path, user or host layout
  And it returns no corpus content, because none exists and none may be inferred

Scenario: MCP remains read-only and stdio-only
  Given the degraded-path test suite
  When it runs
  Then it asserts no network listener is opened
  And no tool returns corpus text, in degraded or healthy state

Scenario: Malformed client input cannot desynchronise the transport
  Given a client sending invalid JSON or an unknown method
  When the server responds
  Then it returns a typed JSON-RPC error and the next request still succeeds
  And no partial line is emitted to stdout

Scenario: No fabricated verdict under stress
  Given a sequence of adversarial no-corpus requests
  When responses are collected
  Then none contains a verdict other than the typed degraded state
```

**Performance requirements**
- Response time: both degradation suites complete in **≤ 10 s** combined.
- Throughput: n/a; these are correctness tests.
- Resource limits: spawn overhead of the MCP stdio child is bounded and measured.
- Scalability: tests must not require a large corpus fixture to prove absence behaviour — the fixture is *absent*, which is the cheap case.

**Reliability requirements**
- Error handling: a `throw` may escape a test helper and nowhere else (AGENTS §2) — these tests are the enforcement point.
- Timeout: each spawned surface has a bounded wait; a hang fails the test rather than blocking CI.
- Retry: none.
- Graceful degradation: the subject of the story, asserted rather than documented.

**Task definition**
```json
{
  "goal": "Add clean-clone tests proving typed honest degradation on both the CLI and the MCP server, with no crash and no fabricated verdict.",
  "deliverables": [
    { "name": "apps/cli/test/clean-clone.test.ts", "format": "typescript" },
    { "name": "packages/mizan-mcp/test/clean-clone.test.ts", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "CLI returns the typed degraded state with no corpus", "verificationKind": "test_passes", "verificationSpec": "bun test (from apps/cli)" },
    { "text": "MCP returns a well-formed typed degraded JSON-RPC response with no corpus", "verificationKind": "test_passes", "verificationSpec": "bun test (from packages/mizan-mcp)" },
    { "text": "Malformed client input cannot desynchronise the stdio transport", "verificationKind": "test_passes", "verificationSpec": "bun test (from packages/mizan-mcp)" },
    { "text": "No absolute path or corpus content in either degraded response", "verificationKind": "test_passes", "verificationSpec": "bun run ci:gates" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

## Sprint 2: Claim Surface and Protocol Compatibility

### Story 8: ADR-18 — the customer claim surface is derived, not typed

**Epic** E2 · **Priority** Must · **Size** L · **Risk** High · **Depends on** Story 3 · **RICE** 6.4

**Story statement.** As a reader of a customer-facing claim, I want every comparative and marketing figure to be generated from committed evidence and rendered by the deck generators, so that a claim I can retype is a claim that will be wrong.

**INVEST**
- **I** — depends on Story 3's published figures; generates into a new document and rewires the decks.
- **N** — the claims file format and the deck rendering mechanism are negotiable; "one producer, everything derived" is not.
- **V** — closes R2 (Critical integrity). ADR-C10 already recorded a retyped latency figure drifting 1.77× across three documents.
- **E** — 2.0 person-months. Flagged as the real cost of this cycle by the research analyst, and I agree.
- **S** — one generator, one generated document, two deck call-sites.
- **T** — byte-determinism and hand-edit detection are both cheap tests.

**Acceptance criteria**
```
Scenario: The generator is byte-deterministic
  Given committed evidence artefacts
  When the generator runs twice in the same commit
  Then the two outputs are byte-identical
  And it consults no clock and no randomness

Scenario: A hand-edit to a generated figure fails the build
  Given a generated claims document whose figure was edited by hand
  When check:docs runs
  Then it exits non-zero naming the file and the drifted figure
  And the committed bytes are restored by regeneration, not by hand

Scenario: Decks render from the generated claims, not from literals
  Given submission/make_deck.py and its Arabic sibling
  When they render
  Then every comparative figure is read from the generated claims file
  And no figure literal exists in the generator source

Scenario: External figures are sourced and dated
  Given a third-party comparative figure
  When it is rendered
  Then it resolves through data/registry/external-claims.json carrying a source URL and a date
  And an entry lacking a URL or a date fails the build

Scenario: Missing evidence fails closed
  Given an evidence artefact the generator needs is absent
  When the generator runs
  Then it exits non-zero naming the artefact
  And it never emits a blank, zero or placeholder figure

Scenario: One source of truth per figure
  Given a figure that appears in more than one surface
  When the surfaces are compared
  Then they resolve to the same generated value
  And there is exactly one module that produces it
```

**Edge cases**
- *Input:* a deck edited by hand between renders; a claims file edited to add an unsourced figure.
- *State:* generator run with a stale evidence artefact; concurrent generator runs.
- *Data:* an evidence artefact with zero records; a claim whose source URL is unreachable (irrelevant — URLs are stored, never fetched).
- *Network:* **must not fetch**. Every URL is a committed string. A fetch at build time is a failure.
- *Security:* the claims file may carry third-party names and URLs (public facts) but must carry no internal path, key or host detail.

**Security scenarios**
```
Scenario: The generator makes no network request
  Given a network-disabled environment
  When the generator runs
  Then it completes and produces identical bytes
  And an outbound request is a test failure

Scenario: No secrets or internal layout reach a customer surface
  Given the generated claims document and the rendered decks
  When inspected
  Then they contain only public comparative facts, ids, digests and relative paths
  And no key, no absolute path, no hostname, no internal hostname-to-service mapping

Scenario: An unsourced or undated external claim is rejected
  Given an external figure without a resolvable registry entry
  When the build runs
  Then it fails naming the figure
  And the claim cannot reach a customer surface

Scenario: Injection-shaped third-party text stays inert
  Given a registry entry whose text contains markup or a script-like payload
  When the document is built
  Then it is emitted as text only, with no raw-HTML sink anywhere in the product
```

**Performance requirements**
- Response time: generator ≤ 10 s; `check:docs` budget unchanged.
- Throughput: n/a.
- Resource limits: reads committed artefacts only; no corpus load.
- Scalability: adding a claim must be a registry entry, not a code change.

**Reliability requirements**
- Error handling: missing artefact ⇒ non-zero naming it; never a silent default.
- Timeout: unchanged.
- Retry: none; generation is pure and local.
- Graceful degradation: none permitted on a claim surface — a degraded claim is a missing claim.

**Task definition**
```json
{
  "goal": "Make every customer-facing comparative figure derived from committed evidence by one generator, with the deck generators rendering from its output.",
  "deliverables": [
    { "name": "docs/specs/adr/ADR-18.md", "format": "markdown" },
    { "name": "scripts/gen-comparative.ts", "format": "typescript" },
    { "name": "docs/customer/comparative-claims.md", "format": "markdown (generated)" },
    { "name": "submission/make_deck.py, submission/make_deck_ar.py (render from generated claims)", "format": "python" }
  ],
  "successCriteria": [
    { "text": "ADR-18 exists", "verificationKind": "file_exists", "verificationSpec": "docs/specs/adr/ADR-18.md" },
    { "text": "Two generator runs are byte-identical", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "A hand-edited generated figure fails the build", "verificationKind": "test_passes", "verificationSpec": "bun run check:docs" },
    { "text": "Every external figure resolves to a URL and date in the registry", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 9: Gate sweep — typed figure literals in `.py` generators and generated artefacts

**Epic** E2 · **Priority** Must · **Size** M · **Risk** Medium · **Depends on** Story 8 · **RICE** 11.9

**Story statement.** As the integrity owner, I want the docs gate to sweep Python deck generators and generated artefacts for hand-typed figure literals bound to claim words, so that the ADR-18 gap cannot reopen silently.

**INVEST**
- **I** — depends on Story 8 existing so the rule has a compliant baseline to pass.
- **N** — the literal/claim-word pairing heuristics are negotiable; the failure is not.
- **V** — this is the mechanism that keeps R2 closed. Without it, ADR-18 is a convention.
- **E** — 1.0 person-month.
- **S** — one rule module plus one self-test.
- **T** — planted violation, following the established pattern.

**Acceptance criteria**
```
Scenario: A typed figure in a Python generator is a failure
  Given a .py generator under the swept roots containing a numeric literal bound to a claim word
  When check:docs runs
  Then it reports a violation naming the file, the line and the literal
  And it exits non-zero

Scenario: The sweep can fail (planted-violation self-test)
  Given a fixture .py file carrying a planted typed figure
  When the rule's self-test runs
  Then the self-test fails, proving the rule discriminates
  And a compliant fixture passes

Scenario: A drifted generated artefact is a failure
  Given a generated document whose committed bytes differ from a fresh render
  When check:docs runs
  Then it exits non-zero naming the file
  And it reports the drifted region rather than only "file differs"

Scenario: The rule does not fire on legitimate numbers
  Given the repository's legitimate numerics — ADR ids, gate ids, years, version numbers, counts that are not claims
  When the sweep runs
  Then it reports no violation
  And the false-positive surface is enumerated in the rule's own self-test so the allowlist is a written list, not an intuition

Scenario: Reporting is deterministic and de-duplicated
  Given a file containing the same typed figure three times
  When the sweep runs
  Then it reports it once per file per claim
  And two runs produce identical report ordering

Scenario: Gate count prose stays truthful
  Given the rule is registered
  When check:docs runs
  Then GATE_IDS remains the single authority and every prose gate-count statement matches it
```

**Edge cases**
- *Input:* a numeric literal in a Python comment; a figure split across string concatenation; a figure written as words ("zero hallucination") rather than digits.
- *State:* a sweep running while a generated file is being rewritten.
- *Data:* a generator with 500 numeric literals, none of them claims (false-positive pressure).
- *Network:* none.
- *Security:* the rule must not be defeatable by moving a figure into an excluded path — the swept roots are the security boundary and are themselves asserted.

**Security scenarios**
```
Scenario: The sweep cannot be evaded by relocating a figure
  Given a typed figure moved outside the swept roots
  When the rule set is inspected
  Then the swept roots are a declared constant and a figure-bearing path outside them is reported
  And changing the roots is a reviewable diff, not a silent exclusion

Scenario: Rule coverage is itself asserted
  Given the swept-root list
  When the self-test runs
  Then it asserts that the known deck generators are inside the swept roots
  And dropping one from the list fails the self-test

Scenario: No figure content is echoed into a report beyond the literal
  Given a violation report
  When rendered
  Then it carries path, line, literal and claim word
  And it never dumps surrounding file content that might carry a secret
```

**Performance requirements**
- Response time: sweep adds ≤ 10 s to `check:docs` across 300+ files.
- Throughput: n/a.
- Resource limits: streaming read; bounded memory independent of file size.
- Scalability: 10× file count must not change the cost class.

**Reliability requirements**
- Error handling: `Result` per file; one unreadable file is reported, not swallowed.
- Timeout: bounded per-file read.
- Retry: none.
- Graceful degradation: none. A sweep that cannot complete must fail closed, or it is an invisible gate.

**Task definition**
```json
{
  "goal": "Extend the docs gate to fail on typed figure literals in Python deck generators and on drifted generated artefacts, proven by a planted violation.",
  "deliverables": [
    { "name": "packages/mizan-gate/src/ (sweep rule + self-test)", "format": "typescript" },
    { "name": "packages/mizan-gate/src/docs-check.ts (AUDITED_DOCUMENTS / swept roots)", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "A planted typed figure in a .py fixture is reported and exits non-zero", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "A drifted generated artefact is reported naming the file", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "Known deck generators are inside the swept roots, asserted", "verificationKind": "test_passes", "verificationSpec": "bun run ci:gates" },
    { "text": "check:docs exits 0 on the compliant tree", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 10: ADR-16 — MCP dual era, a second opt-in tool, and one golden transcript per era

**Epic** E3 · **Priority** Should · **Size** L · **Risk** High · **Depends on** Story 6 · **RICE** 3.8

**Story statement.** As an MCP client author, I want both the Legacy initialize-handshake era and the Modern stateless era served from one server, with any new capability as a second opt-in tool and the existing `verify` response bytes unchanged, so that adoption does not break clients and a spec bump becomes a diff rather than a rewrite.

**INVEST**
- **I** — depends on Story 6 for the invocation path; touches `packages/mizan-mcp/src/server.ts` and adds two transcripts.
- **N** — the second tool's *name and purpose* are negotiable; the opt-in mechanism and byte pinning are not.
- **V** — closes R5/R10. A Modern client currently fails deterministically, which is a lost integration, not a bug.
- **E** — 2.0 person-months, highest uncertainty in the plan (Confidence 0.75).
- **S** — one factory, one second tool, two transcripts.
- **T** — byte-identity against a golden transcript is the cleanest test in the repository (`suggest-coverage.test.ts:565` is the reference).

**Acceptance criteria**
```
Scenario: A Legacy client completes a verify round-trip
  Given a client performing the 2024-11-05 initialize handshake
  When it calls verify
  Then the round-trip completes
  And the response bytes equal the Legacy golden transcript

Scenario: A Modern client completes a verify round-trip
  Given a client sending per-request _meta protocolVersion and calling server/discover
  When it calls verify
  Then the round-trip completes
  And the response bytes equal the Modern golden transcript
  And the bytes equal the Legacy bytes for the same request

Scenario: verify bytes do not change
  Given a pre-existing verify request
  When this story ships
  Then the response bytes are identical to the pre-change bytes
  And no field is added, removed or reordered in the verify response

Scenario: An unsupported era fails deterministically
  Given a client declaring a protocol version outside both supported eras
  When it connects
  Then the server returns UnsupportedProtocolVersion with code -32022
  And the failure is deterministic and typed, never a transport crash

Scenario: The second surface is opt-in
  Given a client that has not opted in
  When it lists tools
  Then only the pre-existing tool is present
  And the second tool is absent, not merely undocumented

Scenario: The second tool declares a real schema
  Given the second tool
  When it is listed
  Then it declares a full JSON Schema 2020-12 outputSchema under the formal extensions _meta prefix
  And its response validates against that schema

Scenario: One golden transcript per era, asserted byte-identically
  Given two committed transcripts
  When the test runs
  Then both are byte-identical to a fresh render
  And a spec bump surfaces as a transcript diff naming the era
```

**Edge cases**
- *Input:* a client omitting `protocolVersion` entirely; a client sending a malformed `_meta`; a request whose `_meta` conflicts with the handshake version.
- *State:* handshake in one era followed by a request in the other (era detected per request, not cached per connection).
- *Data:* a verify request with zero claims or claims over the cap.
- *Network:* stdio only; a client attempting a socket connection must be refused.
- *Security:* input caps derived from the verifier's own bounds must be identical in both eras — a Modern client must not be able to exceed a Legacy client's cap.

**Security scenarios**
```
Scenario: Neither era may exceed the verifier's input bounds
  Given a client on either era
  When it exceeds the per-call claim or citation cap
  Then the request is refused with a typed error
  And the cap is derived from the same verifier bound, not redeclared per era

Scenario: Era is not an authentication or authorisation mechanism
  Given the protocol version field
  When it is inspected
  Then it selects behaviour only and grants no capability
  And no new auth surface is introduced (explicit Won't)

Scenario: No tool returns corpus text in either era
  Given a verify or second-tool response in either era
  When inspected
  Then it contains claims, citations, verdict and diagnostics
  And no corpus body text, no absolute path and no internal diagnostic dump

Scenario: Read-only stdio is preserved
  Given the dual-era server
  When its capabilities are inspected
  Then it declares read-only tools and opens no network listener
```

**Performance requirements**
- Response time: handshake and `server/discover` **p95 < 100 ms**; verify round-trip not slower than the pre-change implementation, asserted by the same golden transcripts plus a bounded latency check.
- Throughput: unchanged from today; dual era must not serialise requests behind era detection.
- Resource limits: one factory shared by both eras — duplicated implementations are a review failure, not a style note.
- Scalability: era detection is per request and O(1); a Modern client joining must not add latency to a Legacy client.

**Reliability requirements**
- Error handling: unknown era ⇒ typed `-32022`, never a crash.
- Timeout: stdio read timeout bounded; a client that opens a channel and sends nothing times out into a typed state.
- Retry: unchanged; the transport is idempotent for verify.
- Graceful degradation: **none permitted for `verify`.** It is byte-pinned precisely so that no degradation is possible. The second tool may be absent for a non-opted-in client, which is the intended behaviour.

**Task definition**
```json
{
  "goal": "Serve both MCP protocol eras behind one factory, add any new capability as a second opt-in tool, and pin verify response bytes with one golden transcript per era.",
  "deliverables": [
    { "name": "docs/specs/adr/ADR-16.md", "format": "markdown" },
    { "name": "packages/mizan-mcp/src/server.ts (era factory + second tool)", "format": "typescript" },
    { "name": "packages/mizan-mcp/test/golden-transcript.test.ts", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "ADR-16 exists and rules on era, not only on a response schemaVersion", "verificationKind": "contains_text", "verificationSpec": "docs/specs/adr/ADR-16.md" },
    { "text": "A Legacy and a Modern client each complete a verify round-trip", "verificationKind": "test_passes", "verificationSpec": "bun test (from packages/mizan-mcp)" },
    { "text": "verify response bytes are unchanged", "verificationKind": "test_passes", "verificationSpec": "bun test (from packages/mizan-mcp)" },
    { "text": "An unsupported version returns -32022 deterministically", "verificationKind": "test_passes", "verificationSpec": "bun test (from packages/mizan-mcp)" },
    { "text": "The second tool is absent unless opted in and declares a 2020-12 outputSchema", "verificationKind": "test_passes", "verificationSpec": "bun test (from packages/mizan-mcp)" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 11: Per-collection latency table with recorded conditions and the tolerance block

**Epic** E6 · **Priority** Should · **Size** M · **Risk** Medium · **Depends on** Story 5 · **RICE** 4.3

**Story statement.** As a customer reading a performance claim, I want per-collection p50/p95/max with the machine class, the corpus snapshot and the tolerance band stated, so that no bare absolute latency number can be quoted without the conditions that make it true.

**INVEST**
- **I** — depends on Story 5's precondition; writes to `docs/specs/measurements.md` only.
- **N** — sample sizes and the machine-class taxonomy are negotiable; the conditions block is not.
- **V** — converts the "not reproduced, off by an order of magnitude" disclosure into a measured per-collection table, which is a Should with real customer value.
- **E** — 1.0 person-month.
- **S** — one document plus one measurement mode.
- **T** — "no bare absolute" is an existing gate rule extended per collection.

**Acceptance criteria**
```
Scenario: Per-collection quantiles with full conditions
  Given a measurement run over a pinned corpus
  When the table is recorded
  Then it carries per collection: p50, p95, max, sample size
  And it records the machine class, the corpus snapshotHash, and the 1.5x tolerance block
  And every entry names the digest of the dataset it was measured against

Scenario: No bare absolute
  Given a latency figure anywhere in the audited documents
  When check:docs runs
  Then a figure lacking its quantity, tolerance and conditions context is reported as a failure

Scenario: Recall must be green before anything is recorded
  Given a measurement run where recall did not pass
  When the table is written
  Then the write is refused by Story 5's precondition
  And no table row is produced

Scenario: Unmeasured stays unmeasured
  Given a collection with insufficient samples
  When the table is recorded
  Then its row states the insufficiency with the sample size that caused it
  And it never interpolates a number from a neighbouring collection

Scenario: Optimisation targets are not claimed
  Given the scaling-path Phase 1-3 targets
  When documents are read
  Then they remain labelled unmeasured
  And no figure in this story implies the sub-50 ms target was met
```

**Edge cases**
- *Input:* a latency figure hand-typed into a document; a figure expressed as a ratio without its baseline.
- *State:* a measurement run interrupted mid-table.
- *Data:* a collection with fewer samples than the quantile needs; a single-sample collection; an outlier max far from p95.
- *Network:* none; measurement is local.
- *Security:* machine identity recorded as a **class** (OS, arch, core count, storage class) — never a hostname, username or home path.

**Security scenarios**
```
Scenario: Machine identity is a class, not an identifier
  Given a recorded latency table
  When it is inspected
  Then it names a machine class and a digest of the environment
  And it contains no hostname, username, home path or MAC address

Scenario: No content-derived leakage via measurement
  Given a per-collection latency row
  When inspected
  Then it carries quantiles, sample sizes and digests
  And no question text, no corpus text and no claim content

Scenario: The table cannot be used to smuggle an unsourced claim
  Given a comparative performance statement added to the table's document
  When check:docs runs
  Then it is held to the same claim rules as any other audited document
```

**Performance requirements**
- Response time: the measurement run is **opt-in and excluded from the default CI path**; it must not threaten the < 5 min full-CI budget (AGENTS §14).
- Throughput: sample count per collection must be sufficient for p95 to be meaningful — state the minimum and refuse below it.
- Resource limits: bounded memory; FTS5 collation differences between win32 and ubuntu must be measured on both runners (R8) or the table is not published.
- Scalability: 10× corpus size must not invalidate the per-collection quantiles; state whether it does.

**Reliability requirements**
- Error handling: untrusted attestation ⇒ `exit 3`, preserved; a failed measurement never produces a partial table presented as complete.
- Timeout: existing per-query budget unchanged; `slowestOf` handling preserved.
- Retry: bounded retry unchanged.
- Graceful degradation: the only permitted degradation is an explicit `unmeasured` row with its reason. A missing collection row is a failure, not a degradation.

**Task definition**
```json
{
  "goal": "Record a per-collection latency table with quantiles, machine class, corpus snapshotHash and the 1.5x tolerance block, and reject any bare absolute latency figure.",
  "deliverables": [
    { "name": "docs/specs/measurements.md", "format": "markdown" },
    { "name": "scripts/eval/suggest-coverage.ts (per-collection recording mode)", "format": "typescript" }
  ],
  "successCriteria": [
    { "text": "Per-collection p50/p95/max with sample size, machine class and snapshotHash", "verificationKind": "contains_text", "verificationSpec": "docs/specs/measurements.md contains a per-collection latency table" },
    { "text": "A bare absolute latency figure fails the docs gate", "verificationKind": "test_passes", "verificationSpec": "bun run ci --only=test" },
    { "text": "No hostname, username or absolute path in the table", "verificationKind": "test_passes", "verificationSpec": "bun run ci:gates" },
    { "text": "Full CI stays under 5 minutes on both runners with the measurement excluded by default", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

## 3. Competitive Feature Comparison

**Table stakes (competitors ship these; absence is a loss):**

| Capability | Competitor | mizan today | This plan |
| --- | --- | --- | --- |
| MCP server surface | Ansari (MCP + Agent Skill) | stdio, one tool, Legacy era only | Story 10: both eras + opt-in second tool |
| Independent grading | TheoAI/IPSC | Grades stored, never ours (ADR-06) | Kept — already a published differentiator |
| Human-review escape hatch | hadith-verifier | Not present; deliberately so | **Not planned.** Our claim is computed, not queued. Stated as a conscious divergence. |
| Documented divergence rate | TheoAI publishes 4.1% | No equivalent published | Deferred (Could) — genuine gap, not in this cycle |
| Broken-citation tooling | urlhealth/DRBench deterministic | Deterministic by constitution | Kept |

**Differentiators (nobody ships these):**

| Differentiator | Evidence | Story |
| --- | --- | --- |
| **Per-collection measurement table that publishes its zeros** | No competitor discloses skipped collections; all market an aggregate "0% hallucination" | **1, 2, 3** |
| **A zero cannot silently disappear** (absent-slice gate) | Industry per-slice gate pattern; aggregates hide the regressed slice | **1** |
| **Dataset identity pinning** | Research pattern: a metric gate answers "did the numbers move", not "were these the same numbers" | **4** |
| **Recall as a precondition of any speed figure** | ADR-08 precedent in our own record | **5** |
| **Derived, not typed, claim surface** | ADR-C10 recorded a 1.77× drift from a retyped figure | **8, 9** |
| **One-command customer acceptance on a clean clone** | No competitor ships re-derivation | **6, 7** |
| **A published weakness as the product argument** | IslamicEval ST1 winners documented Type I false-accept bias | Constrains 10; cited in the claim surface |

**Missing table-stakes feature I am flagging, not planning:** TheoAI publishes a *divergence* figure against a majority view. Our analogue would be a published disagreement rate with the classical corpus. It is a **Could** for a later cycle because it requires a methodology decision that is not this cycle's problem; adding it now would also collide with R11 (scope creep). Logged for Sprint 3 planning.

**Competitive answer to "we have embeddings and you do not":** the ST1 winners' own published Type I false-accept bias, plus a per-collection table showing Qur'an measured rather than a single aggregate. Note honestly that this argument is only available *after* Story 3 lands — which is precisely why the publication freeze exists.

---

## 4. Risk Register (delivery view)

| ID | Risk | Sev | Stories carrying it | Mitigation is an AC, not a note |
| --- | --- | --- | --- | --- |
| R1 | 37% exclusion discoverable in `build.ts`; pre-table figures exposed | Critical | 1, 3, 6 | Story 1 absent-slice gate; Story 3 freeze-lift AC |
| R2 | `.py` decks swept but not audited; typed figures escape claim rules | Critical | 8, 9 | Story 9 planted violation + swept-root self-test |
| R3 | Latency work trades recall for speed | Critical | 5, 11 | Story 5 ordering test + no bypass switch |
| R4 | Regeneration loses hand-adjudicated anchors; expectation leakage | High | 1, 2 | Story 2 adjudication-resolution + provenance gate |
| R5 | No `schemaVersion`; stateless spec; `-32022`; 12-month window | High | 10 | Two transcripts + byte pinning |
| R6 | Clean clone has no corpus; no degradation test | High | 6, 7 | Story 7 two-surface typed-state tests |
| R7 | Pressure for embeddings/LLM parity | Critical | 1, 10 | G-1 + G-7 machine-enforced; cite ST1 bias in the claim surface |
| R8 | win32/ubuntu divergence | High | 1, 11 | Both runners are a success criterion on every new measurement |
| R9 | Publishing zeros reads as weakness | Medium | 3 | Story 3 cause+control AC; differentiator framing |
| R10 | MCP spec churn in the deprecation window | Medium | 10 | Era seam + transcript diff |
| R11 | Scope creep into latency optimisation | Medium | 5, 11 | Story 11 "no optimisation claimed" AC |
| R12 | Gate/ADR prose drift | Medium | 1, 9 | `GATE_IDS` authority AC in both stories |
| R13 | Denominator change invalidates published figures | Medium | 2, 3, 4, 8 | Story 4 digest + Story 2 same-commit rewrite AC |

**Highest-uncertainty story:** Story 10 (Confidence 0.75). Mitigation: it is `Should` and sits behind Story 6, so if the spec shifts mid-sprint the deliverable degrades to "one golden transcript for the era we already serve" rather than blocking anything. Stories 1, 2 and 6 form the critical path and are all `Must` — if any slips, the publication freeze holds and the customer conversation pauses. That is the correct failure mode: an honest delay beats a wrong number.

---

## 5. Explicitly out of scope this cycle (carried verbatim from the CEO Won't list)

No LLM, embedding, reranker or network in the verdict path · no new collections (Bukhari/Muslim blocked by **grading**, ADR-06/C9, not licensing) · no latency optimisation · no Arabic UI, tafsir or multilingual · no load generator or multi-node harness · no third-party benchmark arm · no new auth.

**Also deferred (Could, for Sprint 3 planning):** expanding `external-claims.json` into a sourced competitor-figure registry · machine-readable acceptance JSON · the coverage vocabulary refinement ("measured" vs "declared covered") · the published divergence-rate analogue to TheoAI.

---

## 6. Durable facts established this phase

- The evaluation-set defect is **four** `.slice()` call sites in one file (`build.ts:206, 221, 236, 251`), not a tuning problem — this makes Story 1 a same-file change rather than a redesign, and it is why I hold Story 1's estimate at 1.5 person-months rather than higher.
- `scripts/eval/build.ts` already sources class sizes from `plan.ts` via `goldenCountOf(classId)`; only the *anchor selection* is offset-based. The SE therefore has a natural place to put a per-collection rule without inventing a new concept.
- The repository's `test` script already refuses to run from the root by design (`scripts/root-test-refuses.ts`). Any new story's verification command must be run from a package directory or through `bun run ci` — a task definition that says `bun test` at the root is a broken task definition, and I have written all eleven accordingly.
- `mizan-bench` and `scripts/eval/suggest-coverage.ts` are distinct harnesses; Story 5 and Story 11 both land in the latter, so their ordering constraint (5 before 11) is intra-file, which lowers its cost.

```json
{
  "stories": [
    {
      "id": 1,
      "key": "story-1",
      "title": "ADR-15 per-collection anchor derivation with a coverage gate that fails on an absent slice",
      "sprint": 1,
      "epic": "E1",
      "priority": "must",
      "size": "L",
      "risk": "high",
      "rice": { "reach": 8, "impact": 3, "confidence": 0.95, "effortMonths": 1.5, "score": 15.2 },
      "description": "As the release owner, I want red-team anchors derived as a function of the served set and coverage of every served collection asserted as a gate condition, so an uncovered collection fails the build instead of shipping inside an aggregate that hides it. Closes R1.",
      "dependsOn": [],
      "blocks": [2, 4, 5],
      "invest": { "independent": true, "negotiable": "the derivation rule itself is the SE's choice; its purity and the absent-slice failure are not", "valuable": "unblocks quoting any figure at all", "estimable": "4 slice call sites in one file plus one gate rule", "small": "one PR", "testable": "absent-slice planted violation" },
      "edgeCases": {
        "input": ["a served collection whose rows yield no usable span", "collection-name casing or whitespace", "a collection with a single row"],
        "state": ["two concurrent build:eval invocations writing the same output", "corpus snapshot changing mid-derivation"],
        "data": ["served set of size 1", "empty served set", "served set shrinking between derivation and gating"],
        "network": ["none permitted; a network need here is a constitutional breach, not an edge case"],
        "security": ["corpus text must never appear in a gate report", "ids and counts only per AGENTS section 13"]
      },
      "security": ["coverage gate fails closed when the served set cannot be resolved", "gate reports carry collection names, ids and counts only, never anchor text or absolute paths", "G-1 and G-7 still pass; mizan-verify gains no dependency"],
      "performance": { "addedCiSeconds": 20, "fullCiBudgetMinutes": 5, "bothRunners": ["ubuntu-latest", "windows-latest"], "scalability": "cost is O(served collections x per-collection quota), independent of corpus size" },
      "reliability": { "errorHandling": "Result at boundaries, no throw across a package; typed failure when the corpus is absent", "timeout": "unchanged 30s/10s/60s", "retry": "none; a retry would mask nondeterminism", "degradation": "none permitted; coverage fails closed" },
      "deliverables": ["docs/specs/adr/ADR-15.md", "scripts/eval/build.ts", "packages/mizan-gate/src coverage rule and self-test"],
      "verification": ["docs/specs/adr/ADR-15.md exists", "bun run ci:gates exits 0 with the planted-violation self-test failing when a collection is dropped", "bun run check:docs exits 0 so gate-count prose matches GATE_IDS"]
    },
    {
      "id": 2,
      "key": "story-2",
      "title": "Regenerate the red-team set across all six collections while preserving hand-adjudicated anchors",
      "sprint": 1,
      "epic": "E1",
      "priority": "must",
      "size": "M",
      "risk": "high",
      "rice": { "reach": 8, "impact": 2, "confidence": 0.9, "effortMonths": 1.0, "score": 14.4 },
      "description": "As the release owner, I want the fabricated set regenerated from the per-collection derivation with every hand-adjudicated anchor preserved and every expectation hand-adjudicated, so the measured coverage is real rather than produced by a generator that guessed its own answers. Closes R4.",
      "dependsOn": [1],
      "blocks": [3, 6],
      "invest": { "independent": "needs only Story 1's derivation", "negotiable": "class sizes, span heuristic, and whether the set grows to 6x are open", "valuable": "supplies the denominator behind every published figure", "estimable": "1 person-month; the cost is adjudication review", "small": "regenerate, diff, adjudicate, commit", "testable": "per-collection counts, zero false accepts, adjudication resolution" },
      "edgeCases": {
        "input": ["a class quota exceeding what a collection can supply", "a substitution word absent from the corpus"],
        "state": ["generator reading a corpus whose snapshot changed; pin by snapshotHash and refuse on mismatch"],
        "data": ["a collection with exactly one eligible row", "a class landing on zero entries after per-collection splitting", "duplicate record ids across classes"],
        "network": ["none"],
        "security": ["fixture text derived from committed corpus rows only, never from a provider", "length-capped and marked data-only"]
      },
      "security": ["no fabricated case carries provider output when no key is present", "no fixture expectation is ever observed from @mizan/verify", "a mutation that still normalizes equal to its source is rejected at build time"],
      "performance": { "addedCiSeconds": 60, "fullCiBudgetMinutes": 5, "bothRunners": ["ubuntu-latest", "windows-latest"], "scalability": "cost must scale with quota, not corpus size" },
      "reliability": { "errorHandling": "untrusted attestation preserves exit 3", "timeout": "unchanged; regeneration is local", "retry": "none; the write must be atomic so a partial write cannot differ from a clean run", "degradation": "none; a dataset that cannot be built is a build failure" },
      "deliverables": ["data/eval/redteam-fabricated.json", "data/eval/adjudication.json preserved and diffed", "scripts/eval/plan.ts provenance"],
      "verification": ["all 6 served collections present with non-zero counts", "zero verified verdicts on fabricated cases; a positive falseVerifiedDelta exits non-zero", "bun run ci:gates exits 0 proving the never-observe-expectations-from-verify invariant", "bun run check:docs exits 0 after same-commit figure rewrites"]
    },
    {
      "id": 3,
      "key": "story-3",
      "title": "Publish the per-collection measured table, zeros rendered rather than omitted",
      "sprint": 1,
      "epic": "E1",
      "priority": "must",
      "size": "M",
      "risk": "medium",
      "rice": { "reach": 9, "impact": 3, "confidence": 0.9, "effortMonths": 1.0, "score": 24.3 },
      "description": "As a customer engineer doing due diligence, I want a per-collection table stating how many fabrications were tested and rejected per served collection, with zeros rendered rather than dropped, so I can see what was and was not measured. This is the differentiator no competitor ships, and merging it is what lifts the publication freeze.",
      "dependsOn": [2],
      "blocks": [8],
      "invest": { "independent": "needs Story 2's set; writes two documents plus the generator seam", "negotiable": "table shape and ordering, provided a zero row is structurally guaranteed", "valuable": "highest RICE in the plan; converts a demo into due-diligence evidence", "estimable": "1 person-month including the honesty framing pass", "small": "two documents plus a generator hook", "testable": "row-per-served-collection is mechanically assertable" },
      "edgeCases": {
        "input": ["a hand-edited document figure", "thousands separators or percentage formatting"],
        "state": ["documents regenerated with no corpus snapshot available"],
        "data": ["a 1-row collection", "a 0-case collection", "a stale row for a removed collection must fail"],
        "network": ["external figures resolve through the committed registry only and are never fetched at build or gate time"],
        "security": ["ids, counts and digests only; no corpus or question text"]
      },
      "security": ["no raw content in any published table cell", "every external figure resolves to a registry entry with a source URL and date", "a rate with no denominator or tolerance context fails the gate"],
      "performance": { "generationSeconds": 5, "checkDocsBudgetSeconds": 30, "bothRunners": ["ubuntu-latest", "windows-latest"], "scalability": "a 7th collection must add a row automatically" },
      "reliability": { "errorHandling": "a missing evidence artefact exits non-zero naming it, never a blank cell", "timeout": "unchanged", "retry": "none; generation is pure", "degradation": "unmeasured is the only permitted degradation and must be visibly distinct from 0" },
      "deliverables": ["docs/value-proof.md", "docs/specs/measurements.md"],
      "verification": ["docs/value-proof.md contains the per-collection table with explicit zero-state wording", "docs/specs/measurements.md states a dataset digest", "bun run check:docs exits 0", "bun run ci:gates exits 0 proving no corpus or question text in published tables"]
    },
    {
      "id": 4,
      "key": "story-4",
      "title": "Dataset identity digest in every report; relative gates refuse mismatched run identities",
      "sprint": 1,
      "epic": "E1",
      "priority": "must",
      "size": "M",
      "risk": "medium",
      "rice": { "reach": 7, "impact": 2, "confidence": 0.95, "effortMonths": 1.0, "score": 13.3 },
      "description": "As a reviewer comparing two measurement runs, I want each report to carry a dataset identity digest and each relative comparison to refuse when identities differ, so missing or regenerated evidence can never read as green.",
      "dependsOn": [1],
      "blocks": [6],
      "invest": { "independent": "needs Story 1's derivation settled; no document work", "negotiable": "digest composition and canonical key order, provided the rule lives in exactly one module", "valuable": "separates 'the numbers moved' from 'the data changed'", "estimable": "1 person-month", "small": "one digest module, one rule, one test", "testable": "refusal on mismatch is a pure-function test" },
      "edgeCases": {
        "input": ["a hand-written report carrying no digest"],
        "state": ["a baseline artefact from an older commit", "a partially written artefact"],
        "data": ["an empty dataset, whose digest must still be well defined", "a dataset larger than the digest pass can hold"],
        "network": ["none"],
        "security": ["the digest is one-way; the report publishes the digest, never the content"]
      },
      "security": ["the digest is not a content side channel for individual rows", "digest inputs exclude secrets such as MIZAN_LLM_API_KEY", "an unverifiable identity fails closed rather than passing"],
      "performance": { "digestSecondsFor1e4Cases": 1, "addedCiSeconds": 5, "scalability": "10x dataset size must not change the cost class" },
      "reliability": { "errorHandling": "Result at the digest boundary; no throw escapes a package", "timeout": "unchanged", "retry": "none", "degradation": "none; identity is not degradable and its absence is a refusal" },
      "deliverables": ["packages/mizan-core digest and canonical-JSON module", "packages/mizan-gate mismatched-identity rule and self-test"],
      "verification": ["bun run ci:gates exits 0 proving the digest rule is defined in exactly one module", "a mismatched-identity comparison exits non-zero naming both digests", "a missing digest exits non-zero", "digest is stable under key reordering"]
    },
    {
      "id": 5,
      "key": "story-5",
      "title": "ADR-17 recall is a precondition of recording any latency artefact",
      "sprint": 1,
      "epic": "E5",
      "priority": "must",
      "size": "M",
      "risk": "high",
      "rice": { "reach": 6, "impact": 2, "confidence": 0.9, "effortMonths": 1.0, "score": 10.8 },
      "description": "As the release owner, I want the recall assertion to execute and pass before any latency number is written, and relative latency gates to refuse mismatched run identities, so recall can never be traded for speed the way ADR-08's trigram sidecar did. Closes R3.",
      "dependsOn": [1],
      "blocks": [11],
      "invest": { "independent": "needs Story 1's coverage assertion; the ordering change is local to the recording path", "negotiable": "the recall floor and per-collection vs aggregate scope; the ordering is not negotiable", "valuable": "closes a Critical reliability risk with a mechanism, not a discipline", "estimable": "1 person-month", "small": "one ordering change plus one rule", "testable": "a planted recall regression proving no artefact is written" },
      "edgeCases": {
        "input": ["a latency figure hand-typed into a document, bypassing the recorder"],
        "state": ["recall green then latency run interrupted mid-write", "recall run interrupted"],
        "data": ["a recall run with zero cases, which must not vacuously pass"],
        "network": ["none"],
        "security": ["artefacts carry identities and machine class only, never hostname, username or absolute path"]
      },
      "security": ["no configuration or environment switch bypasses the recall assertion", "a zero-case recall run fails closed rather than self-satisfying", "artefacts contain no question text, corpus text or secret"],
      "performance": { "addedSecondsOnOptInRun": 10, "costWhenNoLatencyRecorded": 0, "scalability": "must never enter the per-query path" },
      "reliability": { "errorHandling": "untrusted attestation preserves exit 3", "timeout": "30s/10s/60s unchanged; the assertion runs inside the existing suggestion budget", "retry": "bounded retry unchanged; identity mismatch invalidates the precondition", "degradation": "none; degrading here is exactly the ADR-08 failure" },
      "deliverables": ["docs/specs/adr/ADR-17.md", "scripts/eval/suggest-coverage.ts"],
      "verification": ["docs/specs/adr/ADR-17.md exists and cites ADR-08", "a planted recall regression leaves no latency artefact written", "a zero-case recall run fails closed", "the 1.5x band and recall floors are declared constants in version control"]
    },
    {
      "id": 6,
      "key": "story-6",
      "title": "accept:customer - every published figure re-derived by one command on a clean clone",
      "sprint": 1,
      "epic": "E4",
      "priority": "must",
      "size": "L",
      "risk": "medium",
      "rice": { "reach": 10, "impact": 3, "confidence": 0.85, "effortMonths": 2.0, "score": 12.8 },
      "description": "As a customer with a clean clone, no corpus and no API key, I want one command that re-derives every published figure and prints each surface's honest degraded state, so due diligence becomes a command I run rather than a claim I accept. Closes the R6 blast radius.",
      "dependsOn": [2, 4],
      "blocks": [7, 10],
      "invest": { "independent": "reads committed artefacts and degrades without a corpus", "negotiable": "output layout and section order; exit-code discipline is not negotiable", "valuable": "highest reach in the plan; converts a demo into evidence", "estimable": "2 person-months, largest Sprint 1 item", "small": "one script plus one package.json entry", "testable": "the clean-clone run is the acceptance criterion" },
      "edgeCases": {
        "input": ["invoked from a subdirectory", "a stale data/ directory left from another commit"],
        "state": ["a partially ingested corpus present", "a corpus whose snapshotHash does not match committed evidence"],
        "data": ["a committed artefact missing from a shallow clone", "a data/ directory absent entirely"],
        "network": ["must be fully offline-capable; any fetch attempt is a failure of this story"],
        "security": ["must not echo environment secrets", "must not require .env", "must not print absolute paths outside the repository"]
      },
      "security": ["runs identically with and without MIZAN_LLM_API_KEY set and never prints any part of it", "completes in a network-disabled environment with an attempted request failing the test", "output is repository-relative with no hostname, username or home directory", "an artefact whose attestation does not verify is reported untrusted and exits non-zero rather than re-derived"],
      "performance": { "wallClockSecondsCleanClone": 180, "bothRunners": ["ubuntu-latest", "windows-latest"], "scalability": "per-section progress reporting so a corpus-present run does not appear hung" },
      "reliability": { "errorHandling": "per-section isolation; one section's unexpected failure is recorded and reflected in the exit code", "timeout": "per-section bounded timeout degrading to a typed state", "retry": "none for local reads", "degradation": "the expected path; exit 0 is correct only when every degradation is the typed honest state" },
      "deliverables": ["scripts/accept-customer.ts", "package.json accept:customer script entry"],
      "verification": ["bun run accept:customer exits 0 on a clean clone with no corpus and no key", "no network egress and no secret echoed", "latency printed only with quantity, band and conditions", "a failing check names itself and exits non-zero"]
    },
    {
      "id": 7,
      "key": "story-7",
      "title": "Typed honest degradation proven by test on both shipped surfaces",
      "sprint": 1,
      "epic": "E4",
      "priority": "must",
      "size": "M",
      "risk": "medium",
      "rice": { "reach": 7, "impact": 2, "confidence": 0.9, "effortMonths": 1.0, "score": 12.6 },
      "description": "As a customer with no corpus, I want both the CLI and the MCP server to return a typed honest state instead of crashing, so the clean-clone experience is a disclosed behaviour rather than an accident. Closes R6.",
      "dependsOn": [6],
      "blocks": [],
      "invest": { "independent": "pure test work over existing behaviour plus any typed state revealed missing", "negotiable": "whether the state is an exit code, a Result variant or a JSON-RPC member", "valuable": "nothing asserts this today", "estimable": "1 person-month", "small": "two test files plus minimal typed state", "testable": "each assertion narrows through the declared schema" },
      "edgeCases": {
        "input": ["a corpus path that exists but is empty", "a file that is not a database", "a truncated database"],
        "state": ["concurrent MCP requests while the corpus is absent", "a request arriving mid-shutdown"],
        "data": ["zero rows", "tables present but no served collections"],
        "network": ["a client sending invalid JSON or an unknown method must get a typed error, not a desync"],
        "security": ["no absolute paths in the degraded response", "MCP stays read-only and returns no corpus text"]
      },
      "security": ["the degraded response names the missing resource, not the absolute path, user or host layout", "no network listener is opened", "malformed client input cannot desynchronise stdio and emits no partial stdout line", "a sequence of adversarial no-corpus requests yields no verdict other than the typed degraded state"],
      "performance": { "combinedTestSeconds": 10, "scalability": "tests need no large corpus fixture because absence is the cheap case" },
      "reliability": { "errorHandling": "a throw may escape a test helper and nowhere else; these tests are the enforcement point", "timeout": "bounded wait per spawned surface; a hang fails rather than blocking CI", "retry": "none", "degradation": "the subject of the story, asserted rather than documented" },
      "deliverables": ["apps/cli/test/clean-clone.test.ts", "packages/mizan-mcp/test/clean-clone.test.ts"],
      "verification": ["bun test from apps/cli passes", "bun test from packages/mizan-mcp passes", "malformed client input cannot desynchronise the transport", "no absolute path or corpus content in either degraded response"]
    },
    {
      "id": 8,
      "key": "story-8",
      "title": "ADR-18 the customer claim surface is derived, not typed",
      "sprint": 2,
      "epic": "E2",
      "priority": "must",
      "size": "L",
      "risk": "high",
      "rice": { "reach": 8, "impact": 2, "confidence": 0.8, "effortMonths": 2.0, "score": 6.4 },
      "description": "As a reader of a customer-facing claim, I want every comparative and marketing figure generated from committed evidence and rendered by the deck generators, so a claim I can retype is a claim that will be wrong. Closes R2; ADR-C10 already recorded a 1.77x drift from a retyped figure.",
      "dependsOn": [3],
      "blocks": [9],
      "invest": { "independent": "needs Story 3's published figures; generates into a new document and rewires two decks", "negotiable": "claims-file format and deck rendering mechanism; one-producer-everything-derived is not negotiable", "valuable": "closes a Critical integrity risk", "estimable": "2 person-months, the real cost of this cycle per research", "small": "one generator, one generated document, two deck call sites", "testable": "byte-determinism and hand-edit detection" },
      "edgeCases": {
        "input": ["a deck edited by hand between renders", "a claims file edited to add an unsourced figure"],
        "state": ["generator run against a stale evidence artefact", "concurrent generator runs"],
        "data": ["an evidence artefact with zero records", "a registry URL that is unreachable, which is irrelevant because URLs are stored and never fetched"],
        "network": ["must not fetch; any build-time request is a failure"],
        "security": ["no internal path, key or host detail may reach a customer surface"]
      },
      "security": ["completes with identical bytes in a network-disabled environment", "generated claims and decks contain only public comparative facts, ids, digests and relative paths", "an unsourced or undated external claim fails the build and cannot reach a customer surface", "markup or script-like registry text is emitted as text only with no raw-HTML sink"],
      "performance": { "generatorSeconds": 10, "checkDocsBudgetSeconds": 30, "scalability": "adding a claim is a registry entry, not a code change" },
      "reliability": { "errorHandling": "a missing evidence artefact exits non-zero naming it; never a silent default", "timeout": "unchanged", "retry": "none; generation is pure and local", "degradation": "none permitted; a degraded claim is a missing claim" },
      "deliverables": ["docs/specs/adr/ADR-18.md", "scripts/gen-comparative.ts", "docs/customer/comparative-claims.md", "submission/make_deck.py", "submission/make_deck_ar.py"],
      "verification": ["docs/specs/adr/ADR-18.md exists", "two generator runs are byte-identical", "a hand-edited generated figure fails bun run check:docs", "every external figure resolves to a URL and date in the registry"]
    },
    {
      "id": 9,
      "key": "story-9",
      "title": "Gate sweep for typed figure literals in .py generators and generated artefacts",
      "sprint": 2,
      "epic": "E2",
      "priority": "must",
      "size": "M",
      "risk": "medium",
      "rice": { "reach": 7, "impact": 2, "confidence": 0.85, "effortMonths": 1.0, "score": 11.9 },
      "description": "As the integrity owner, I want the docs gate to sweep Python deck generators and generated artefacts for hand-typed figure literals bound to claim words, so the ADR-18 gap cannot reopen silently.",
      "dependsOn": [8],
      "blocks": [],
      "invest": { "independent": "needs Story 8 so a compliant baseline exists to pass against", "negotiable": "literal and claim-word pairing heuristics; the failure is not negotiable", "valuable": "keeps R2 closed as a mechanism rather than a convention", "estimable": "1 person-month", "small": "one rule module plus one self-test", "testable": "planted violation, following the established pattern" },
      "edgeCases": {
        "input": ["a numeric literal in a Python comment", "a figure split across string concatenation", "a figure written as words such as 'zero hallucination' rather than digits"],
        "state": ["a sweep running while a generated file is being rewritten"],
        "data": ["a generator with 500 numerics, none of them claims"],
        "network": ["none"],
        "security": ["a figure moved outside the swept roots must be reported, so the roots are the asserted boundary"]
      },
      "security": ["swept roots are a declared constant and changing them is a reviewable diff", "the self-test asserts the known deck generators are inside the swept roots", "reports carry path, line, literal and claim word only, never surrounding file content"],
      "performance": { "addedCheckDocsSeconds": 10, "filesSwept": 307, "scalability": "10x file count must not change the cost class" },
      "reliability": { "errorHandling": "Result per file; an unreadable file is reported, not swallowed", "timeout": "bounded per-file read", "retry": "none", "degradation": "none; a sweep that cannot complete fails closed" },
      "deliverables": ["packages/mizan-gate sweep rule and self-test", "packages/mizan-gate/src/docs-check.ts swept-root declaration"],
      "verification": ["a planted typed figure in a .py fixture is reported and exits non-zero", "a drifted generated artefact is reported naming the file", "the self-test fails if a known deck generator is dropped from the swept roots", "bun run check:docs exits 0 on the compliant tree"]
    },
    {
      "id": 10,
      "key": "story-10",
      "title": "ADR-16 MCP dual era, second opt-in tool, and one golden transcript per era",
      "sprint": 2,
      "epic": "E3",
      "priority": "should",
      "size": "L",
      "risk": "high",
      "rice": { "reach": 5, "impact": 2, "confidence": 0.75, "effortMonths": 2.0, "score": 3.8 },
      "description": "As an MCP client author, I want both the Legacy 2024-11-05 initialize-handshake era and the Modern 2026-07-28 stateless era served from one server, with any new capability as a second opt-in tool and verify response bytes unchanged, so adoption does not break clients and a spec bump becomes a diff. Closes R5 and R10.",
      "dependsOn": [6],
      "blocks": [],
      "invest": { "independent": "needs Story 6 for the invocation path; touches one server file and adds two transcripts", "negotiable": "the second tool's name and purpose; the opt-in mechanism and byte pinning are not negotiable", "valuable": "a Modern client currently fails deterministically, which is a lost integration", "estimable": "2 person-months at the lowest confidence in the plan, 0.75", "small": "one factory, one second tool, two transcripts", "testable": "byte-identity against a golden transcript is the cleanest test in the repo" },
      "edgeCases": {
        "input": ["a client omitting protocolVersion", "a malformed _meta", "a per-request _meta conflicting with the handshake version"],
        "state": ["a handshake in one era followed by a request in the other; era is detected per request, not cached per connection"],
        "data": ["a verify request with zero claims", "claims exceeding the per-call cap"],
        "network": ["stdio only; a socket connection attempt must be refused"],
        "security": ["input caps are derived from the verifier's own bounds and must be identical in both eras so a Modern client cannot exceed a Legacy cap"]
      },
      "security": ["neither era may exceed the verifier's input bounds; the cap is derived, not redeclared", "the protocol version selects behaviour only and grants no capability; no new auth surface", "no tool returns corpus text, absolute paths or internal diagnostic dumps in either era", "the server declares read-only tools and opens no network listener"],
      "performance": { "handshakeP95Ms": 100, "discoverP95Ms": 100, "verifyRoundTrip": "not slower than pre-change, asserted via the same golden transcripts", "scalability": "era detection is per request and O(1); a Modern client must not add latency to a Legacy client" },
      "reliability": { "errorHandling": "an unknown era yields a typed -32022, never a crash", "timeout": "bounded stdio read; a silent channel times out into a typed state", "retry": "unchanged; verify is idempotent on this transport", "degradation": "none permitted for verify, which is byte-pinned precisely so degradation is impossible; the second tool being absent for a non-opted-in client is intended" },
      "deliverables": ["docs/specs/adr/ADR-16.md", "packages/mizan-mcp/src/server.ts", "packages/mizan-mcp/test/golden-transcript.test.ts"],
      "verification": ["ADR-16 exists and rules on era, not only a response schemaVersion", "a Legacy and a Modern client each complete a verify round-trip", "verify response bytes are unchanged", "an unsupported version returns -32022 deterministically", "the second tool is absent unless opted in and declares a JSON Schema 2020-12 outputSchema"]
    },
    {
      "id": 11,
      "key": "story-11",
      "title": "Per-collection latency table with recorded conditions and the tolerance block",
      "sprint": 2,
      "epic": "E6",
      "priority": "should",
      "size": "M",
      "risk": "medium",
      "rice": { "reach": 5, "impact": 1, "confidence": 0.85, "effortMonths": 1.0, "score": 4.3 },
      "description": "As a customer reading a performance claim, I want per-collection p50/p95/max with machine class, corpus snapshot and tolerance band stated, so no bare absolute latency number can be quoted without the conditions that make it true.",
      "dependsOn": [5],
      "blocks": [],
      "invest": { "independent": "needs Story 5's precondition; writes one document and one recording mode", "negotiable": "sample sizes and the machine-class taxonomy; the conditions block is not negotiable", "valuable": "converts the not-reproduced disclosure into a measured per-collection table", "estimable": "1 person-month", "small": "one document plus one measurement mode", "testable": "the no-bare-absolute rule is an existing gate rule extended per collection" },
      "edgeCases": {
        "input": ["a hand-typed latency figure", "a ratio stated without its baseline"],
        "state": ["a measurement run interrupted mid-table"],
        "data": ["a collection with too few samples for the requested quantile", "a single-sample collection", "an outlier max far from p95"],
        "network": ["none; measurement is local"],
        "security": ["machine identity recorded as a class, never a hostname, username or home path"]
      },
      "security": ["the table names a machine class and an environment digest, containing no hostname, username, home path or MAC address", "rows carry quantiles, sample sizes and digests only", "comparative performance statements added to the document are held to the same audited claim rules"],
      "performance": { "measurementExcludedFromDefaultCi": true, "fullCiBudgetMinutes": 5, "bothRunners": ["ubuntu-latest", "windows-latest"], "scalability": "10x corpus size must not invalidate per-collection quantiles, and the story states whether it does" },
      "reliability": { "errorHandling": "untrusted attestation preserves exit 3; a failed measurement never yields a partial table presented as complete", "timeout": "existing per-query budget unchanged; slowestOf handling preserved", "retry": "bounded retry unchanged", "degradation": "the only permitted degradation is an explicit unmeasured row with its reason; a missing collection row is a failure" },
      "deliverables": ["docs/specs/measurements.md", "scripts/eval/suggest-coverage.ts per-collection recording mode"],
      "verification": ["docs/specs/measurements.md contains the per-collection latency table with quantiles, machine class and snapshotHash", "a bare absolute latency figure fails the docs gate", "no hostname, username or absolute path in the table", "bun run ci exits 0 within the 5-minute budget on both runners"]
    }
  ],
  "acceptanceCriteria": [
    { "storyId": 1, "scenario": "Derivation covers every served collection", "given": "a corpus whose served set is the 6 collections, resolved from that corpus rather than hardcoded", "when": "anchors are derived for the main classes", "then": "every served collection contributes a non-zero number of anchors to every main class", "and": "a served collection with no usable span is reported by name, not silently given zero" },
    { "storyId": 1, "scenario": "Derivation is a pure function of the served set", "given": "a corpus snapshot pinned by hash", "when": "derivation runs twice in the same commit", "then": "the two outputs are byte-identical", "and": "no clock, locale or randomness is consulted and the anchor order is total and documented" },
    { "storyId": 1, "scenario": "Class sizes stop being slice offsets", "given": "a class whose size today comes from a contiguous prefix slice", "when": "the class is built", "then": "its size comes from the documented rule or from plan.ts", "and": "no contiguous-prefix slice of a flattened multi-collection list remains" },
    { "storyId": 1, "scenario": "An ABSENT slice fails the build, not merely a regressed one", "given": "the coverage gate and a served collection missing from the derived set", "when": "the gate runs", "then": "it exits non-zero naming the missing collection and the gate id", "and": "the wording distinguishes absent from below-floor" },
    { "storyId": 1, "scenario": "The gate can actually fail", "given": "a fixture in which one served collection is dropped from derivation", "when": "the gate's self-test runs", "then": "the self-test fails, proving the gate discriminates", "and": "a fixture with all 6 collections present passes" },
    { "storyId": 1, "scenario": "Anchor expectations never leak from the code under test", "given": "the derivation and expectation sources", "when": "the gate inspects their provenance", "then": "expectations trace to plan.ts and adjudication.json", "and": "no anchor or expectation is observed from @mizan/verify" },
    { "storyId": 1, "scenario": "A gate-count change leaves no stale prose", "given": "a new gate id added to GATE_IDS", "when": "check:docs runs", "then": "every prose statement of the gate count matches GATE_IDS" },
    { "storyId": 1, "scenario": "Coverage gate fails closed", "given": "the gate cannot resolve the served set because the corpus is absent", "when": "the gate runs", "then": "it exits non-zero with a typed cannot-verify-coverage condition", "and": "it never reports coverage as satisfied" },
    { "storyId": 1, "scenario": "No corpus or question text in gate output", "given": "a coverage failure report", "when": "it is rendered", "then": "it carries collection names, ids and counts only", "and": "no anchor text, quote text, question text or absolute path appears" },
    { "storyId": 1, "scenario": "Verdict-path purity preserved", "given": "the new derivation lives in scripts/eval", "when": "G-1 and G-7 run", "then": "mizan-verify's single dependency is unchanged and its import set gains nothing" },
    { "storyId": 2, "scenario": "Every served collection is measured after regeneration", "given": "a corpus with all 6 served collections", "when": "the eval set is rebuilt", "then": "the generated set contains a non-zero case count for each of the 6 collections", "and": "the total equals the sum of per-class counts with no case in two classes" },
    { "storyId": 2, "scenario": "No fabricated case is verified", "given": "every case whose class marks it a fabrication", "when": "the suite is evaluated", "then": "the count of verified verdicts on those cases is 0 and falseVerifiedDelta stays 0", "and": "any positive delta exits non-zero" },
    { "storyId": 2, "scenario": "Hand-adjudicated anchors survive regeneration", "given": "data/eval/adjudication.json entries written by a human", "when": "the set is regenerated", "then": "every adjudication id still resolves and none is dropped or re-labelled by the generator", "and": "the adjudication diff is reviewed and committed in the same commit" },
    { "storyId": 2, "scenario": "Expectations are hand-adjudicated, never observed from the verifier", "given": "a case expectation", "when": "its provenance is inspected", "then": "it traces to plan.ts or adjudication.json", "and": "the gate fails when the invariant is violated" },
    { "storyId": 2, "scenario": "A mutation that is secretly a verbatim quote is not shipped as a fabrication", "given": "a case whose mutated text still normalizes equal to its source span", "when": "the set is built", "then": "the case is rejected at build time with its id named" },
    { "storyId": 2, "scenario": "Regeneration is idempotent", "given": "the same pinned corpus snapshot and the same plan", "when": "the set is built twice", "then": "the two files are byte-identical" },
    { "storyId": 2, "scenario": "Denominator changes rewrite published figures in the same commit", "given": "this regeneration changes a published count", "when": "the change is committed", "then": "every document stating that count is updated in the same commit and check:docs exits 0" },
    { "storyId": 2, "scenario": "No fabricated case carries provider output", "given": "the default checkout has no API key", "when": "the eval set is built", "then": "every fabricated text is derived from the local corpus and a declared mutation" },
    { "storyId": 2, "scenario": "Fixture text is length-capped and data-only", "given": "a fabricated quote", "when": "it is generated", "then": "it is bounded by the existing span bounds and marked data-only", "and": "it is never interpolated into a prompt as an instruction" },
    { "storyId": 3, "scenario": "The table states coverage per served collection", "given": "a completed eval run over the regenerated set", "when": "the per-collection table is produced", "then": "it carries one row per served collection with collection, cases tested, rejected count and verified count", "and": "it states the dataset digest and every figure is derived, not retyped" },
    { "storyId": 3, "scenario": "A zero is rendered, never omitted", "given": "a served collection with a measured count of 0", "when": "the table is produced", "then": "the row exists and reads measured 0 - no figure published, naming why coverage is absent", "and": "the row is not silently dropped or rendered blank" },
    { "storyId": 3, "scenario": "The table pairs each zero with cause and control", "given": "any zero or low row", "when": "the document is read", "then": "it names the structural cause and the gate that prevents recurrence" },
    { "storyId": 3, "scenario": "No stale figure survives a denominator change", "given": "a change to the dataset digest", "when": "check:docs runs", "then": "any figure in an audited document that no longer matches its source is reported naming the document" },
    { "storyId": 3, "scenario": "Hand-typed figures in audited documents are rejected", "given": "an audited document carrying a numeric figure bound to a claim word", "when": "check:docs runs", "then": "it exits non-zero naming the document, the claim and the figure" },
    { "storyId": 3, "scenario": "The publication freeze holds until this story lands", "given": "the customer-facing claim surface before this story merges", "when": "any figure is inspected", "then": "no per-collection or aggregate fabrication figure is published from the pre-fix dataset", "and": "the freeze lifts only by this story's merge, not by a decision" },
    { "storyId": 3, "scenario": "Unmeasured is a representable state", "given": "no corpus and therefore no runnable eval", "when": "the documents are read", "then": "they state unmeasured for the affected figures", "and": "they never present a number from a previous snapshot as current" },
    { "storyId": 3, "scenario": "No raw content in a published table", "given": "the table in docs/value-proof.md", "when": "its cells are inspected", "then": "they contain ids, counts, ratios and digests only", "and": "no corpus text, question text, model output or secret appears" },
    { "storyId": 3, "scenario": "External figures are sourced and dated", "given": "a comparative figure attributed to a third party", "when": "it is rendered", "then": "it resolves to an entry in data/registry/external-claims.json carrying a source URL and a date", "and": "an unattributed external figure fails the gate" },
    { "storyId": 3, "scenario": "Percentages cannot be stated without their denominator", "given": "a rate stated in an audited document", "when": "check:docs runs", "then": "a rate with no denominator or tolerance context is reported as a failure" },
    { "storyId": 4, "scenario": "Every report carries an identity", "given": "any report, table or artefact produced by this cycle", "when": "it is produced", "then": "it carries a versioned dataset digest and, where a corpus is involved, the corpus snapshotHash", "and": "the digest rule is defined in exactly one module" },
    { "storyId": 4, "scenario": "A relative comparison refuses mismatched identities", "given": "a baseline and a current artefact with different dataset digests", "when": "a relative gate compares them", "then": "it refuses to compute a delta, exits non-zero and names both digests", "and": "it never reports a pass from incomparable evidence" },
    { "storyId": 4, "scenario": "A missing digest is a refusal, not a pass", "given": "a baseline that predates digest versioning", "when": "a relative gate runs", "then": "it exits non-zero naming the missing identity" },
    { "storyId": 4, "scenario": "Identical identities permit the comparison", "given": "two artefacts with the same digest", "when": "the relative gate runs", "then": "it computes the comparison and it is within the declared tolerance" },
    { "storyId": 4, "scenario": "Denominator drift is visible rather than silent", "given": "a dataset change altering a published denominator", "when": "reports are produced", "then": "the digest changes and the previously published figure is reported stale until rewritten in the same commit" },
    { "storyId": 4, "scenario": "Digest is stable under reordering", "given": "the same logical dataset serialised with different key order", "when": "the digest is computed", "then": "the digest is identical because the canonical form is applied first" },
    { "storyId": 4, "scenario": "The digest is not a content side channel", "given": "a published report", "when": "its digest is inspected", "then": "it cannot be used to recover any individual row, quote or question" },
    { "storyId": 4, "scenario": "Digest inputs exclude secrets", "given": "an environment containing an API key", "when": "a digest is computed", "then": "the key is not an input and never appears in the digest's source material" },
    { "storyId": 4, "scenario": "Fail closed on an unverifiable identity", "given": "identity cannot be computed due to a missing artefact or hash mismatch", "when": "a gate runs", "then": "it exits non-zero with a typed condition and never proceeds to a pass" },
    { "storyId": 5, "scenario": "A recall regression blocks the artefact write", "given": "a measurement run where the recall assertion fails", "when": "the recording path is invoked", "then": "no latency artefact is written, not a stale or partial one", "and": "the command exits non-zero naming the failing cases and the write is never reached" },
    { "storyId": 5, "scenario": "Ordering is enforced, not conventional", "given": "the recording path", "when": "its call order is inspected", "then": "the recall assertion strictly precedes any file write of a latency artefact", "and": "a test asserts the ordering rather than trusting a comment" },
    { "storyId": 5, "scenario": "Relative latency gates refuse mismatched run identities", "given": "a recall run and a latency run from different dataset identities", "when": "the relative gate evaluates the latency figure", "then": "it refuses and exits non-zero naming both identities" },
    { "storyId": 5, "scenario": "The precedent is on the record", "given": "ADR-17", "when": "it is read", "then": "it cites ADR-08's trigram-sidecar result of target met with 3 of 10 adversarial cases lost" },
    { "storyId": 5, "scenario": "Recording under a green recall run is permitted and annotated", "given": "a green recall run and a matching identity", "when": "a latency figure is recorded", "then": "it is written with its recall run identity and the 1.5x tolerance band", "and": "the band lives in version control" },
    { "storyId": 5, "scenario": "Faster is not an accepted reason to skip the gate", "given": "a proposal to record a latency figure without a recall run", "when": "the gate evaluates it", "then": "it is rejected and the gate has no bypass switch" },
    { "storyId": 5, "scenario": "Artefacts carry identity, not content", "given": "a recorded latency artefact", "when": "it is inspected", "then": "it contains counts, quantiles, digests and machine class", "and": "no question text, corpus text, hostname, username or secret" },
    { "storyId": 5, "scenario": "Vacuous recall is a refusal, not a pass", "given": "a recall run that collected zero cases", "when": "the precondition evaluates", "then": "it fails closed and never satisfies itself with an empty sample" },
    { "storyId": 6, "scenario": "One command, clean clone, exit 0", "given": "a fresh clone with no data/corpus.db and no API key", "when": "the acceptance command is run", "then": "it exits 0", "and": "it does not attempt ingest, does not require a key and does not reach the network" },
    { "storyId": 6, "scenario": "It prints the served set and the coverage table", "given": "the committed evidence artefacts", "when": "the command runs", "then": "it prints the served set and per-collection case and rejected counts labelled with the dataset digest", "and": "a figure it could not re-derdive prints unmeasured rather than a number" },
    { "storyId": 6, "scenario": "Latency is printed only with its conditions", "given": "latency evidence exists in the tree", "when": "the command runs", "then": "latency is printed with quantity, tolerance band and conditions", "and": "a bare absolute latency number is never printed" },
    { "storyId": 6, "scenario": "Each surface's degraded state is printed", "given": "no corpus on either surface", "when": "the command runs", "then": "it prints the CLI's and the MCP surface's typed degraded states", "and": "it distinguishes expected degradation from a check failure" },
    { "storyId": 6, "scenario": "No silent skip", "given": "any subsection that cannot run", "when": "the command runs", "then": "it prints a named reason and typed state, and the word skipped never appears without an adjacent reason" },
    { "storyId": 6, "scenario": "Exit code contract", "given": "all re-derivable checks match and all degradations are the expected typed ones", "when": "the command finishes", "then": "it exits 0", "and": "given any check fails or a surface crashes unexpectedly, it exits non-zero naming the failing check id deterministically" },
    { "storyId": 6, "scenario": "Determinism", "given": "two runs on the same commit", "when": "the commands are compared", "then": "the section ordering and the figures are identical" },
    { "storyId": 6, "scenario": "No key required and none printed", "given": "an environment with MIZAN_LLM_API_KEY set and one without", "when": "the command runs in each", "then": "both exit 0 identically", "and": "no key value, prefix or length appears in output" },
    { "storyId": 6, "scenario": "No network egress", "given": "a network-disabled environment", "when": "the command runs", "then": "it completes successfully", "and": "any attempted outbound request is a test failure" },
    { "storyId": 6, "scenario": "Absolute paths and host details are not leaked", "given": "the command's output", "when": "inspected", "then": "paths are repository-relative", "and": "no hostname, username or home directory appears" },
    { "storyId": 6, "scenario": "Untrusted evidence is refused, not re-derived", "given": "a committed artefact whose attestation does not verify", "when": "the command runs", "then": "it prints the typed untrusted condition and exits non-zero" },
    { "storyId": 7, "scenario": "CLI degrades to a typed state with no corpus", "given": "no data/corpus.db", "when": "the CLI runs a verify-shaped command", "then": "it returns the typed corpus-absent or no-sources-found state with the documented exit code", "and": "no stack trace, no unhandled rejection and no partial answer presented as complete" },
    { "storyId": 7, "scenario": "MCP degrades to a typed state with no corpus", "given": "no data/corpus.db", "when": "an MCP client completes a tools/call verify round-trip", "then": "the response is a well-formed JSON-RPC result or error carrying the typed degraded state", "and": "the process does not crash and the transport does not desynchronise" },
    { "storyId": 7, "scenario": "Every degraded state is decoded, not pattern-matched", "given": "a degraded response from either surface", "when": "the test asserts on it", "then": "it is narrowed through the declared schema at the boundary", "and": "the test cannot pass on a string that merely contains a plausible word" },
    { "storyId": 7, "scenario": "Every row of the degradation table has a test", "given": "the seven-row degradation table in AGENTS section 16", "when": "the degradation tests run", "then": "each row's surface state is covered on at least one shipped surface", "and": "any row not implemented on a surface is asserted as explicitly unavailable" },
    { "storyId": 7, "scenario": "Fail-closed behaviour holds under the degraded state", "given": "the degraded state on either surface", "when": "a verdict would otherwise be produced", "then": "no verdict is produced", "and": "no cached prior verdict is served as current" },
    { "storyId": 7, "scenario": "Both surfaces agree on the state name", "given": "the CLI and the MCP server in the same no-corpus condition", "when": "both respond", "then": "they name the same degradation condition" },
    { "storyId": 7, "scenario": "Degradation does not become an information leak", "given": "a no-corpus MCP response", "when": "inspected", "then": "it names the missing resource, not the absolute path, user or host layout", "and": "it returns no corpus content" },
    { "storyId": 7, "scenario": "MCP remains read-only and stdio-only", "given": "the degraded-path test suite", "when": "it runs", "then": "it asserts no network listener is opened", "and": "no tool returns corpus text in degraded or healthy state" },
    { "storyId": 7, "scenario": "Malformed client input cannot desynchronise the transport", "given": "a client sending invalid JSON or an unknown method", "when": "the server responds", "then": "it returns a typed JSON-RPC error, the next request still succeeds, and no partial line is emitted to stdout" },
    { "storyId": 7, "scenario": "No fabricated verdict under stress", "given": "a sequence of adversarial no-corpus requests", "when": "responses are collected", "then": "none contains a verdict other than the typed degraded state" },
    { "storyId": 8, "scenario": "The generator is byte-deterministic", "given": "committed evidence artefacts", "when": "the generator runs twice in the same commit", "then": "the two outputs are byte-identical", "and": "it consults no clock and no randomness" },
    { "storyId": 8, "scenario": "A hand-edit to a generated figure fails the build", "given": "a generated claims document whose figure was edited by hand", "when": "check:docs runs", "then": "it exits non-zero naming the file and the drifted figure", "and": "the committed bytes are restored by regeneration, not by hand" },
    { "storyId": 8, "scenario": "Decks render from the generated claims, not from literals", "given": "submission/make_deck.py and its Arabic sibling", "when": "they render", "then": "every comparative figure is read from the generated claims file", "and": "no figure literal exists in the generator source" },
    { "storyId": 8, "scenario": "External figures are sourced and dated", "given": "a third-party comparative figure", "when": "it is rendered", "then": "it resolves through data/registry/external-claims.json carrying a source URL and a date", "and": "an entry lacking either fails the build" },
    { "storyId": 8, "scenario": "Missing evidence fails closed", "given": "an evidence artefact the generator needs is absent", "when": "the generator runs", "then": "it exits non-zero naming the artefact", "and": "it never emits a blank, zero or placeholder figure" },
    { "storyId": 8, "scenario": "One source of truth per figure", "given": "a figure appearing on more than one surface", "when": "the surfaces are compared", "then": "they resolve to the same generated value", "and": "exactly one module produces it" },
    { "storyId": 8, "scenario": "The generator makes no network request", "given": "a network-disabled environment", "when": "the generator runs", "then": "it completes and produces identical bytes", "and": "an outbound request is a test failure" },
    { "storyId": 8, "scenario": "No secrets or internal layout reach a customer surface", "given": "the generated claims document and the rendered decks", "when": "inspected", "then": "they contain only public comparative facts, ids, digests and relative paths", "and": "no key, absolute path, hostname or service mapping" },
    { "storyId": 8, "scenario": "Injection-shaped third-party text stays inert", "given": "a registry entry containing markup or a script-like payload", "when": "the document is built", "then": "it is emitted as text only with no raw-HTML sink anywhere in the product" },
    { "storyId": 8, "scenario": "An unsourced or undated external claim is rejected", "given": "an external figure without a resolvable registry entry", "when": "the build runs", "then": "it fails naming the figure and the claim cannot reach a customer surface" },
    { "storyId": 9, "scenario": "A typed figure in a Python generator is a failure", "given": "a .py generator under the swept roots containing a numeric literal bound to a claim word", "when": "check:docs runs", "then": "it reports a violation naming the file, line and literal and exits non-zero" },
    { "storyId": 9, "scenario": "The sweep can fail", "

## Specification
# CEO Review — Customer Deal Production Readiness

**Spec:** `spec-customer-deal-production-readiness-2026-10-05` · **Research:** `research-customer-verification-claims-2026-10-05`

---

## 1. Executive Summary

The customer deal converts one known, findable credibility defect into this cycle's gating deliverable. I independently verified the critical finding by counting `citation.collection` in the committed eval sets: **`redteam-fabricated.json` covers 3 of 6 served collections** (abudawud 22, ibnmajah 16, malik 2 = 40 entries), while `golden-normalization.json` already carries the data to close it (quran 20, tirmidhi 16, nasai 25). The cause is structural — `scripts/eval/build.ts:180-216` walks collections name-ascending into one 30-entry anchor list and takes contiguous `.slice()` prefixes, so the alphabetically-last collections receive nothing. Qur'an (6,236 rows) has zero fabrication measurement, and per the market scan Qur'anic verification is the *hard* case. A customer engineer finds this in ten minutes. Until the per-collection table exists, **no figure may be quoted to the customer**. The competitive answer is not a faster number: it is a **per-collection table that publishes its zeros, pinned in code so a zero cannot silently disappear** — a table no competitor ships, because every competitor markets an aggregate "0% hallucination" and nobody discloses which collections they skipped. Impact: the 37% exclusion becomes a published, gated, honest number; every customer-facing figure becomes derived rather than retyped; the verdict path stays model-free, which the published Type I false-accept bias of the IslamicEval ST1 winners independently justifies.

## 2. Business Value Analysis

**Primary driver:** credibility/retention risk on a live deal — revenue is downstream of a technical audit passing. **Secondary:** sales enablement (a customer-runnable acceptance report converts a demo into due-diligence evidence) and reduced MTTR on claim drift.

**Must:**6/6 collection coverage asserted in code (absent slice fails, not just regressed) · dataset identity digest in every report · zero fabrications verified measured per collection · one customer-runnable acceptance command on a clean clone · typed degradation proven by test on both surfaces · recall assertion as a *precondition* of recording any latency figure · no outbound figure before the table lands · derived claim surface including the Python deck generators.

**Should:** MCP dual-era (Legacy `2024-11-05` + Modern `2026-07-28` stateless) · second opt-in tool with `verify` bytes pinned · gate sweep for typed figures in generators · per-collection latency table.

**Could:** expand `external-claims.json` (3 entries today) into a sourced competitor-figure registry · machine-readable acceptance JSON · coverage-vocabulary refinement.

**Won't (this cycle):** **any LLM/embedding/reranker/network in the verdict path** · new collections (Bukhari/Muslim blocked by *grading*, not licensing; corpus frozen per ADR-C9) · latency optimisation · Arabic UI / tafsir / multilingual · load generator or multi-node harness · third-party benchmark arm.

## 3. Risk Register (summary)

| ID | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | 37% exclusion discoverable in `build.ts`; any pre-table figure exposed | **Critical** (Business) | ADR-15 slice derivation + absent-slice gate; freeze outbound figures |
| R2 | `.py` deck generators swept but not *audited* — typed figures escape claim rules | **Critical** (Security/integrity) | ADR-18 derived claim surface; gate sweeps generators, planted violation |
| R3 | Latency work trades recall for speed (ADR-08: sidecar 7/10) | **Critical** (Reliability) | ADR-17 recall gate as precondition, not review step |
| R7 | Pressure for embeddings/LLM for parity | **Critical** (Technical) | ADR-03 + G-1 machine-enforced; cite ST1 false-accept bias |
| R4 | Regeneration loses hand-adjudicated anchors; expectation leakage | High | Anchors stay hand-adjudicated in `plan.ts`; diff; preserve "never observed from `@mizan/verify`" |
| R5 | No `schemaVersion`; stateless spec, `-32022`, 12-month window | High | ADR-16 dual era + second opt-in tool + golden transcripts |
| R6 | Clean clone has no corpus; no degradation test | High | `accept-customer.ts` + `clean-clone.test.ts` on CLI and MCP |
| R8 | win32/ubuntu divergence | High | Gate new index/measurement on both runners |
| R9 | Publishing zeros reads as weakness | Medium | Frame as the differentiator; pair with cause and gate |
| R10-R13 | Spec churn · scope creep into latency · gate/ADR prose drift · denominator changes | Medium | Era seam · explicit Won't · `GATE_IDS` authority · versioned dataset digest, figures rewritten in the same commit |

## 4. Epics → PM

- **E1 Per-collection measurement coverage** *(gating)* — 6/6 slices, gate fails on an absent slice, `falseVerifiedDelta` 0, published table with zeros.
- **E2 Derived customer claim surface** — deterministic generator, hand-edits fail the build, per-figure source URL + date.
- **E3 MCP era compatibility + opt-in second surface** — both eras green in CI, `verify` bytes unchanged, one golden transcript per era.
- **E4 Customer acceptance as one command** — exits 0 on a clean clone with no corpus and no key; prints served set, coverage table, latency-with-conditions, digests, degraded states; never a silent skip.
- **E5 Recall gate as latency precondition** — recall regression fails before a latency artefact is written; 1.5x band; mismatched run identities refuse green.
- **E6 Honest-baseline evidence** *(Should)* — per-collection p50/p95/max with machine, `snapshotHash`, tolerance block; no bare absolute.

**NFRs to hand to PM:** performance (CI <5 min, both runners) · security (A03/A08/A05/A01-A07 in scope; no new auth; hashes not content) · reliability (Result at boundaries, 30s/10s/60s timeouts, bounded retry unchanged, blast radius = build not product) · observability (per-collection coverage and precision, per-collection latency with run identity, gate pass/fail by id, logs carry counts and digests only).

## 5. ADRs Recorded

**ADR-15** slice derivation replaces contiguous prefix · **ADR-16** MCP dual era, new capability as second opt-in tool · **ADR-17** recall is a precondition of recording latency · **ADR-18** the customer claim surface is derived, not typed. All Proposed; ADR-03, ADR-06/C9, ADR-08/C10, ADR-13 reaffirmed unchanged.

```json
{
  "executiveSummary": "The live customer deal makes one verified, findable credibility defect the gating deliverable of this cycle: data/eval/redteam-fabricated.json measures fabrication rejection on only 3 of 6 served collections (abudawud 22, ibnmajah 16, malik 2), because scripts/eval/build.ts:180-216 walks collections name-ascending into one 30-entry anchor list and takes contiguous .slice() prefixes. Qur'an (6,236 rows) and Tirmidhi (3,889) have zero measurement, and market research shows Qur'anic verification is the hard case. Until a per-collection table exists, no figure may be quoted to the customer. The plan is therefore: derive red-team anchors per served collection and gate on coverage so an ABSENT slice fails the build (ADR-15); publish the per-collection measured table including a stated zero, which is the differentiator no competitor ships; carry a dataset identity digest in every report so a regenerated set cannot be diffed against a stale baseline; make every customer-facing figure derived rather than retyped, closing the Python deck-generator gap (ADR-18); serve both MCP protocol eras with the new capability as a second opt-in tool and verify bytes pinned (ADR-16); make recall a precondition of recording any latency figure (ADR-17, ADR-08 precedent); and ship one customer-runnable acceptance command that re-derives every published figure on a clean clone with no corpus and no key. No LLM, embedding or reranker enters the verdict path, because the IslamicEval 2025 ST1 winners documented consistent Type I false-accept bias. Scope is two sprints, ten items, seven gates unchanged and green on ubuntu and windows inside five minutes.",
  "moscow": {
    "must": [
      "Red-team coverage over all 6 served collections, asserted in code; a MISSING slice fails the gate, not just a regressed one (ADR-15)",
      "Zero fabrications verified, measured per collection, published as a table that includes a stated zero for any uncovered collection",
      "Dataset identity digest carried in every report; relative gates refuse mismatched run identities so missing evidence cannot read as green",
      "One customer-runnable acceptance command that re-derives every published figure on a clean clone with no corpus and no API key",
      "Typed honest degradation proven by test on both shipped surfaces when the corpus is absent (CLI and MCP)",
      "Recall assertion is a PRECONDITION for recording any latency figure, per the ADR-08 trigram-sidecar precedent (ADR-17)",
      "No figure quoted to the customer before the per-collection table lands",
      "Derived customer claim surface: comparative and marketing figures generated from committed evidence, never hand-typed, including submission/make_deck.py and make_deck_ar.py (ADR-18)"
    ],
    "should": [
      "MCP dual-era compatibility: Legacy 2024-11-05 initialize-handshake plus Modern 2026-07-28 stateless with server/discover and -32022 UnsupportedProtocolVersion",
      "Second opt-in MCP tool via the formal extensions framework with the existing verify tool response bytes unchanged",
      "One golden transcript per protocol era, byte-identity asserted",
      "Gate sweep extended so .py generators and generated artefacts cannot carry typed figure literals",
      "Per-collection latency table in docs/specs/measurements.md with recorded machine, snapshotHash and the 1.5x tolerance block"
    ],
    "could": [
      "Expand data/registry/external-claims.json from 3 entries to a sourced competitor-figure registry feeding the comparative page",
      "Machine-readable acceptance report artefact (JSON) alongside the human-readable one",
      "A per-collection coverage vocabulary in the gate so 'measured' and 'declared covered' cannot be confused"
    ],
    "wont": [
      "Any LLM, embedding, reranker or network call in the verdict path - the ST1 winners documented false-accept bias, and ADR-03/G-1 are the control",
      "New corpus collections: Bukhari and Muslim stay deferred because they are blocked by grading (ADR-06/C9), not licensing, and the corpus is frozen at this snapshot",
      "Latency optimisation work; this cycle records measured per-collection latency, it does not chase the <50 ms target",
      "Arabic interface, tafsir and multilingual breadth - remain disclosed as deferred",
      "A load generator or multi-node harness; docs/scaling-path.md Phase 1-3 targets stay explicitly unmeasured",
      "A third-party benchmark arm run - planned, not shipped, not claimed"
    ]
  },
  "riskRegister": [
    {
      "id": "R1",
      "risk": "The 37% collection exclusion is discoverable by a customer reading scripts/eval/build.ts; any figure quoted before the per-collection table exists is exposed.",
      "class": "Business",
      "severity": "Critical",
      "mitigation": "ADR-15 slice derivation plus a gate that fails on an absent slice; freeze all outbound figures until the per-collection table exists.",
      "owner": "CEO"
    },
    {
      "id": "R2",
      "risk": "The Python deck generators (submission/make_deck.py, make_deck_ar.py) are swept by docs-corpus.ts but are not in AUDITED_DOCUMENTS, so typed figures in them escape the full claim rules.",
      "class": "Security / Integrity",
      "severity": "Critical",
      "mitigation": "ADR-18 derived claim surface: decks and audited docs render from one generated claims file; gate sweeps .py for numeric figure literals bound to claim words, with a planted violation.",
      "owner": "SE"
    },
    {
      "id": "R3",
      "risk": "Latency work trades recall for speed; ADR-08 already recorded the FTS5 trigram sidecar meeting the target while losing 3/10 adversarial cases.",
      "class": "Reliability",
      "severity": "Critical",
      "mitigation": "ADR-17 recall gate is a precondition of writing any latency figure or artefact, not a review step.",
      "owner": "SE"
    },
    {
      "id": "R4",
      "risk": "Regenerating the red-team set loses hand-adjudicated anchors in data/eval/adjudication.json, or expectations leak from the code under test.",
      "class": "Correctness",
      "severity": "High",
      "mitigation": "Anchors stay hand-adjudicated in scripts/eval/plan.ts; regenerate and diff; assert the 'never observed from @mizan/verify' invariant in the gate.",
      "owner": "SE"
    },
    {
      "id": "R5",
      "risk": "The MCP verify wire shape carries no schemaVersion, so additive fields break existing clients; the 2026-07-28 spec is stateless with a 12-month deprecation window.",
      "class": "Reliability",
      "severity": "High",
      "mitigation": "ADR-16: dual-era support behind one factory, new capability as a second opt-in tool via the formal extensions framework, one golden transcript per era, verify bytes pinned.",
      "owner": "SE"
    },
    {
      "id": "R6",
      "risk": "A clean clone has no corpus (data/corpus.db is gitignored), so ingest, build:eval, eval:suggestions and benchmark all fail and no test asserts typed degradation for that case.",
      "class": "Reliability",
      "severity": "High",
      "mitigation": "scripts/accept-customer.ts plus clean-clone.test.ts on CLI and MCP asserting the typed honest state rather than a crash.",
      "owner": "SE"
    },
    {
      "id": "R7",
      "risk": "Competitive pressure to add embeddings, rerankers or an LLM in the verdict path for parity with competitors.",
      "class": "Technical / Security",
      "severity": "Critical",
      "mitigation": "ADR-03 and gate G-1 are machine-enforced; cite the IslamicEval ST1 documented Type I false-accept bias as the external argument; the competitive answer is the per-collection table, not a model.",
      "owner": "CEO"
    },
    {
      "id": "R8",
      "risk": "win32/ubuntu divergence (path separators, FTS5 collation) breaks a new index or measurement.",
      "class": "Reliability",
      "severity": "High",
      "mitigation": "Gate every new index and measurement on both runners; hold the 15-minute CI budget.",
      "owner": "SE"
    },
    {
      "id": "R9",
      "risk": "Publishing zeros reads as weakness to a non-technical buyer.",
      "class": "Business",
      "severity": "Medium",
      "mitigation": "Frame as the published differentiator (no competitor discloses skipped collections), pair each zero with the cause and the gate that prevents recurrence.",
      "owner": "PM"
    },
    {
      "id": "R10",
      "risk": "MCP spec churn during the 12-month deprecation window forces rework.",
      "class": "Dependency",
      "severity": "Medium",
      "mitigation": "Era detection behind one seam; one golden transcript per era makes a spec bump a diff rather than a rewrite.",
      "owner": "SE"
    },
    {
      "id": "R11",
      "risk": "Scope creep into latency optimisation because the <50 ms target is a published unmet figure.",
      "class": "Business",
      "severity": "Medium",
      "mitigation": "Explicit Won't; ADR-17 makes the recall precondition the enforcement rather than discipline.",
      "owner": "CEO"
    },
    {
      "id": "R12",
      "risk": "Gate-count or ADR-count prose drifts when new rules are added.",
      "class": "Integrity",
      "severity": "Medium",
      "mitigation": "GATE_IDS in packages/mizan-gate/src/run-gates.ts is the single authority and docs-gates.ts fails check:docs; ADR numbering is checked the same way.",
      "owner": "SE"
    },
    {
      "id": "R13",
      "risk": "A larger red-team set changes the denominators in already-published figures ({\"rejected\": 40}, anchorCount 30).",
      "class": "Business",
      "severity": "Medium",
      "mitigation": "Versioned dataset digest; every published figure states its digest; any change re-runs the docs-claims gate and rewrites value-proof.md in the same commit.",
      "owner": "SE"
    }
  ],
  "epics": [
    {
      "id": "E1",
      "name": "Per-collection measurement coverage",
      "priority": "Must",
      "description": "Close the red-team gap so fabrication rejection is measured on all 6 served collections; coverage is a gate condition and an absent slice fails the build.",
      "successMetrics": [
        "6/6 served collections present in the regenerated red-team set, each with a non-zero count",
        "The gate fails when a served collection loses coverage (planted-violation self-test)",
        "Zero verified verdicts on the set; falseVerifiedDelta stays 0",
        "Per-collection table published in docs/value-proof.md and docs/specs/measurements.md, zeros stated"
      ],
      "dependsOn": [],
      "adr": ["ADR-15"]
    },
    {
      "id": "E2",
      "name": "Derived customer claim surface",
      "priority": "Must",
      "description": "One generator is the only producer of comparative and marketing figures; the deck generators and audited documents render from its output, closing the .py audit gap.",
      "successMetrics": [
        "gen-comparative is byte-deterministic; a hand-edit to a generated figure fails the build",
        "The gate reports a .py generator carrying a typed figure as a failure, proven by a planted violation",
        "Every external figure carries a source URL and date resolved through data/registry/external-claims.json"
      ],
      "dependsOn": ["E1"],
      "adr": ["ADR-18"]
    },
    {
      "id": "E3",
      "name": "MCP era compatibility and opt-in second surface",
      "priority": "Should",
      "description": "Serve both the Legacy 2024-11-05 and Modern 2026-07-28 stateless protocol eras; add any new capability as a second opt-in tool through the formal extensions framework.",
      "successMetrics": [
        "A Legacy client and a Modern client each complete a verify round-trip in CI",
        "verify response bytes are unchanged, asserted against a golden transcript",
        "One golden transcript per era; a spec bump surfaces as a transcript diff"
      ],
      "dependsOn": ["E4"],
      "adr": ["ADR-16"]
    },
    {
      "id": "E4",
      "name": "Customer acceptance as a single command",
      "priority": "Must",
      "description": "A customer on a clean clone runs one command and gets every published figure re-derived, plus each surface's honest degraded state.",
      "successMetrics": [
        "accept:customer exits 0 on a clean clone with no corpus and no API key",
        "Prints the served set, the per-collection coverage table, latency figures with their conditions, digest identity and each surface's degraded state",
        "Any non-zero exit names the failing check; no silent skips"
      ],
      "dependsOn": ["E1"],
      "adr": []
    },
    {
      "id": "E5",
      "name": "Recall gate as a latency precondition",
      "priority": "Must",
      "description": "Recall is asserted before any latency number may be recorded, and relative gates refuse mismatched run identities.",
      "successMetrics": [
        "A recall regression fails the build before a latency artefact is written",
        "The ADR-08 sidecar 7/10 result is cited as the precedent that made this a gate",
        "Latency thresholds live in version control with the 1.5x tolerance band and refuse mismatched run identities"
      ],
      "dependsOn": ["E1"],
      "adr": ["ADR-17"]
    },
    {
      "id": "E6",
      "name": "Honest baseline evidence",
      "priority": "Should",
      "description": "Convert the scaling-path prose into a per-collection measured latency table with recorded conditions, no bare absolutes.",
      "successMetrics": [
        "Per-collection p50/p95/max with recorded machine, corpus snapshotHash and the tolerance block present per ADR-C10",
        "No bare absolute latency figure appears without its quantity and tolerance context"
      ],
      "dependsOn": ["E1", "E5"],
      "adr": []
    }
  ],
  "sprintBacklog": [
    {
      "sprint": 1,
      "id": 1,
      "title": "ADR-15 slice derivation + coverage assertion over all 6 served collections, with planted-violation self-test",
      "priority": "Must",
      "size": "L",
      "risk": "High",
      "dependsOn": []
    },
    {
      "sprint": 1,
      "id": 2,
      "title": "Regenerate data/eval/redteam-fabricated.json; preserve hand-adjudicated anchors; diff adjudication.json",
      "priority": "Must",
      "size": "M",
      "risk": "High",
      "dependsOn": [1]
    },
    {
      "sprint": 1,
      "id": 3,
      "title": "Publish the per-collection measured table in value-proof.md and measurements.md, zeros included",
      "priority": "Must",
      "size": "M",
      "risk": "Medium",
      "dependsOn": [2]
    },
    {
      "sprint": 1,
      "id": 4,
      "title": "Dataset identity digest in every report; relative gate refuses mismatched run identities",
      "priority": "Must",
      "size": "M",
      "risk": "Medium",
      "dependsOn": [1]
    },
    {
      "sprint": 1,
      "id": 5,
      "title": "ADR-17 recall gate as a precondition of any latency artefact",
      "priority": "Must",
      "size": "M",
      "risk": "High",
      "dependsOn": [1]
    },
    {
      "sprint": 1,
      "id": 6,
      "title": "scripts/accept-customer.ts plus package.json entry; exits 0 on a clean clone",
      "priority": "Must",
      "size": "L",
      "risk": "Medium",
      "dependsOn": [2, 4]
    },
    {
      "sprint": 1,
      "id": 7,
      "title": "clean-clone.test.ts on CLI and MCP asserting typed honest degradation",
      "priority": "Must",
      "size": "M",
      "risk": "Medium",
      "dependsOn": [6]
    },
    {
      "sprint": 2,
      "id": 8,
      "title": "ADR-18 derived claim surface: gen-comparative + docs/customer/comparative-claims.md; decks render from it",
      "priority": "Must",
      "size": "L",
      "risk": "High",
      "dependsOn": [3]
    },
    {
      "sprint": 2,
      "id": 9,
      "title": "Gate sweep for typed figures in .py generators and generated artefacts, with planted violation",
      "priority": "Must",
      "size": "M",
      "risk": "Medium",
      "dependsOn": [8]
    },
    {
      "sprint": 2,
      "id": 10,
      "title": "ADR-16 MCP dual era + second opt-in tool + golden transcript per era; verify byte-identical",
      "priority": "Should",
      "size": "L",
      "risk": "High",
      "dependsOn": [6]
    }
  ],
  "adrs": [
    {
      "id": "ADR-15",
      "title": "Slice derivation replaces contiguous prefix selection",
      "status": "Proposed",
      "context": "scripts/eval/build.ts derives anchors by walking collections name-ascending into one 30-entry list and slicing contiguous prefixes, so only 3 of 6 served collections receive anchors and Qur'an has zero fabrication measurement.",
      "decision": "Derive anchors per collection by a rule that is a function of the served set, and assert coverage of every served collection as a gate condition; an absent slice fails rather than warns.",
      "rationale": "The defect is structural, not a tuning problem. Per-slice release gates are the industry pattern because aggregates hide the regressed slice. Determinism is preserved: every selection stays ordered and consults no clock, locale or randomness.",
      "consequences": "The red-team set grows and its denominators change, so every published count naming it must be updated in the same commit. Anchor derivation becomes a documented rule rather than a slice offset."
    },
    {
      "id": "ADR-16",
      "title": "MCP serves both eras; new capability lands as a second opt-in tool",
      "status": "Proposed",
      "context": "MCP_PROTOCOL_VERSION is 2024-11-05, the Legacy initialize-handshake era. Spec 2026-07-28 is stateless: initialize retired, per-request _meta protocolVersion, server/discover is a MUST, UnsupportedProtocolVersion is -32022, 12-month deprecation window. The response carries no schemaVersion, so additive fields break existing clients.",
      "decision": "Support both eras behind one factory detected per request. Any new capability ships as a second opt-in tool through the formal extensions framework with a full JSON Schema 2020-12 outputSchema. The existing verify tool's response bytes do not change.",
      "rationale": "A new surface is safer than a widened one, and the integration story is the differentiator rather than the wire format. Dual-era costs one factory plus one golden transcript per era, and makes a spec bump a diff instead of a rewrite.",
      "consequences": "Two transcripts to maintain; a Modern client that previously failed deterministically now works; no existing client can regress because verify is byte-pinned."
    },
    {
      "id": "ADR-17",
      "title": "Recall is a precondition of recording a latency figure",
      "status": "Proposed",
      "context": "ADR-08 records a trigram sidecar that met the sub-50 ms target and lost 3 of 10 adversarial cases. docs/scaling-path.md is honest that its Phase 1-3 targets are unmeasured.",
      "decision": "No latency number may be written to a document or an artefact unless the recall assertion passed in the same run, and relative gates must refuse mismatched run identities so missing evidence cannot read as green.",
      "rationale": "Recall traded for speed is a correctness regression dressed as a performance win, and the ADR-08 precedent is already in our own record. Prefer the assertion because it is cheaper, faster and cannot hallucinate its own verdict.",
      "consequences": "Latency work, if it ever happens, is blocked until recall is green; 'faster' is not an acceptable reason to skip the gate."
    },
    {
      "id": "ADR-18",
      "title": "The customer claim surface is derived, not typed",
      "status": "Proposed",
      "context": "The Python deck generators are swept by docs-corpus.ts but are not in AUDITED_DOCUMENTS, so typed figures in them escape the full claim rules. ADR-C10 records that a retyped latency figure already drifted 1.77x across three documents.",
      "decision": "One generator produces the customer-facing comparative claims from committed evidence; the deck generators and audited documents render from its output; the gate sweeps generators for typed figure literals bound to claim words.",
      "rationale": "A claim a human can retype is a claim that will be wrong. Derivation makes the figure a property of a tree rather than of a document's care at the moment it was written.",
      "consequences": "Deck regeneration becomes a pipeline step; a planted violation proves the gate can fail; comparative figures gain sources and dates through external-claims.json."
    }
  ]
}
```

```json
{"office_fact_memory":[{"fact":"data/eval/golden-normalization.json carries 200 rows spanning all 6 served collections (abudawud 63, ibnmajah 31, malik 25, nasai 25, quran 20, tirmidhi 16, plus 20 rows with an empty collection field), so the data needed to close the red-team per-collection gap is already committed in-tree.","phase":"ceo","evidence":"counted citation.collection over the committed golden set directly","confidence":0.95},{"fact":"docs/value-proof.md already carries a six-competitor categorical comparison table and a six-step reproduction table, but data/registry/external-claims.json holds only 3 external figures; the comparative table states no measured score, which is the surface ADR-18 must derive.","phase":"ceo","evidence":"read docs/value-proof.md:170-235 and enumerated data/registry/external-claims.json (3 entries)","confidence":0.9},{"fact":"The MCP spec dated 2026-07-28 makes the protocol stateless and retires initialize; mizan-mcp pins 2024-11-05, so ADR-16 must decide era support (Legacy initialize-handshake plus Modern _meta + server/discover) rather than only a response schemaVersion.","phase":"ceo","evidence":"market research 2026-07-28 compat matrix vs packages/mizan-mcp/src/server.ts:36","confidence":0.9}]}
```

## Architecture
(no architecture)