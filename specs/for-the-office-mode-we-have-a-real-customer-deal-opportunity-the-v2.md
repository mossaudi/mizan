# Spec: for-the-office-mode-we-have-a-real-customer-deal-opportunity-the

**Request:** for the office mode we have a real customer deal opportunity, The customer faces real consequences if they do not the platform works and functional at excellent state, so need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
I'll break down the specification into INVEST-compliant user stories with full details inline, group them into sprints with ## Sprint headings, and provide the handoff JSON block at the end.
## Sprint 1: Corpus-Wide Measurement (E1)

### Story 1: ADR-15 - Measurement set collection coverage is derived and must be asserted (1.1)
**Story ID:** S1-1  
**Epic:** E1 - Corpus-wide suggestion measurement  
**Priority:** Must (RICE: 18.0)  
**Size:** S (Small)  

#### User Story (INVEST)
**As a** Product/Engineering owner concerned with auditability,  
**I want** the red-team measurement set's collection coverage to be declared as a derived property and asserted by the harness,  
**So that** we cannot silently exclude collections (the structural 37% exclusion cannot recur).

#### INVEST Checklist
- [x] **Independent**: Can be done without other stories - ADR documentation change, then harness rule added
- [x] **Negotiable**: Details (exact assertion text) open to discussion
- [x] **Valuable**: Prevents structural measurement bias, critical for credibility
- [x] **Estimable**: S-sized; well-defined scope
- [x] **Small**: Completes in sprint
- [x] **Testable**: Has clear acceptance criteria including planted violation test

#### Dependencies
- **Blocking:** None (foundational)
- **Shared:** None
- **External:** None

#### RICE Scoring
- **Reach** (users affected): 10 (engineering, audit, customer-facing credibility)
- **Impact**: 3 (critical business impact - credibility loss if missed)
- **Confidence**: 100% (root-cause clearly documented in spec)
- **Effort**: 1 (person-month equivalent, small)
- **RICE = (10 × 3 × 1.0) / 1 = 30? Wait** - wait, RICE formula: (Reach × Impact × Confidence) / Effort. Confidence is often given as percentage - 100% = 1.0. So (10 × 3 × 1.0)/1 = 30. But let us be precise. Or maybe scale differently. Let us check: Impact scale given as 0.25/0.5/1/2/3. Yes. So 10*3*1.0/1 = 30.

But also Story size S might map to Effort 1. Yes.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: ADR-15 is documented and cited**
```
Given the codebase with measurement builders in scripts/eval/build.ts
When ADR-15 is created and recorded
Then ADR-15 is accepted, cited in relevant docs, and documents the name-ordered prefix-slice mechanism
And the mechanism is written where the builders live (as per ADR-15 consequences)
```

**Scenario 2: Harness asserts collection coverage (positive case)**
```
Given a measurement set that includes all served collections
When the suggestion measurement harness runs
Then the harness passes the coverage assertion
And reports per-collection presence/precision
```

**Scenario 3: Harness fails on missing collection coverage (negative/planted violation)**
```
Given a measurement set with a served collection removed from derivation
When the harness runs the coverage assertion
Then the harness fails with an error naming the missing collection
And the failure message clearly identifies which collection is unreachable
```

**Scenario 4: Coverage is treated as derived property**
```
Given any change to anchor ordering or prefix slicing in build logic
When measurement is derived
Then the harness re-derives and asserts coverage
And does not rely on implicit assumptions
```

#### Edge Cases
- **Input Edge Cases:** Anchor list empty for a collection; collection has 1 record only; MAIN_ANCHORS_PER_COLLECTION changes
- **State Edge Cases:** Build logic changes slice offset; collection ordering changes
- **Data Edge Cases:** A collection appears/disappears in served set; zero cases possible? (should fail)
- **Network Edge Cases:** N/A (offline)
- **Security Edge Cases:** N/A - no external input

#### Security Acceptance Criteria
```
Scenario: Coverage assertion cannot be bypassed
  Given an attempt to skip coverage check
  When harness runs
  Then coverage assertion is enforced (cannot be disabled)
  And failure is non-zero exit
```

#### Performance Requirements
- Response time: Harness check completes within 1 second
- Throughput: Single run
- Resource limits: Negligible memory
- Scalability: N/A

#### Reliability Requirements
- Error handling: Typed failure with collection name; fail closed (§16)
- Timeout behavior: No new timeouts (deterministic)
- Retry strategy: No retries (deterministic)
- Graceful degradation: Fail closed on assertion failure

#### Task Definition (JSON)
```json
{
  "goal": "Document ADR-15 and add harness assertion that fails when any served collection has zero measured cases",
  "deliverables": [
    { "name": "docs/specs/adr/ADR-15.md", "format": "markdown" },
    { "name": "scripts/eval/suggest-coverage.ts", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "ADR-15 exists, is cited, documents name-ordered prefix-slice mechanism",
      "verificationKind": "contains_text",
      "verificationSpec": "docs/specs/adr/ADR-15.md contains 'prefix-slice' or mechanism"
    },
    {
      "text": "Harness fails when a collection has zero cases (planted violation test passes)",
      "verificationKind": "test_passes",
      "verificationSpec": "bun test in relevant package for coverage assertion"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

#### RICE Score
- Reach: 10, Impact: 3, Confidence: 1.0, Effort: 1 → **30.0**

---

### Story 2: Extend red-team derivation to all six served collections (1.2)
**Story ID:** S1-2  
**Epic:** E1  
**Priority:** Must (RICE: 30.0)  
**Size:** M (Medium)  

#### User Story (INVEST)
**As a** QA/auditor,  
**I want** the red-team measurement set to include cases from all six served collections (including Qur'an, Tirmidhi, Nasai),  
**So that** suggestion figures are not structurally limited to 3 collections and the 37% exclusion is closed.

#### INVEST Checklist
- [x] Independent: Builds on build logic understanding; can modify derivation
- [x] Negotiable: Case counts per collection negotiable
- [x] Valuable: Closes critical coverage gap
- [x] Estimable: Medium - need to regenerate and validate
- [x] Small enough: Fits sprint
- [x] Testable: Can verify case distribution

#### Dependencies
- **Blocking:** S1-1 (understand mechanism)
- **Shared:** None
- **External:** None (uses existing in-tree data)

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: All six collections represented**
```
Given the derivation logic is extended
When red-team cases are derived from all served collections
Then the resulting set includes cases from: abudawud, ibnmajah, malik, nasai, quran, tirmidhi
And each of these six has >= 1 measured case
```

**Scenario 2: Existing adjudicated anchors unaffected**
```
Given previously adjudicated cases exist
When derivation is regenerated
Then byte-identity is preserved for the same snapshot (or changes only as intended)
And previously validated anchor behavior is unchanged
```

**Scenario 3: Golden set cases are utilized**
```
Given golden-normalization.json contains quran 20, tirmidhi 16, nasai 25 cases
When building measurement set
Then those cases are incorporated into the derivation
And the gap is closed using in-tree data
```

**Scenario 4: Set remains mutation-derived and traceable**
```
Given the regenerated set
When inspected
Then cases are mutation-derived (not cherry-picked to flatter)
And construction is documented
```

#### Edge Cases
- **Data Edge Cases:** Collection has very few records; some collections larger than others
- **State Edge Cases:** Regeneration produces different ordering - must preserve determinism
- **Input Edge Cases:** Empty collection? (should not happen if served)
- **Security Edge Cases:** No external input, only internal data

#### Performance Requirements
- Generation time: < 30 seconds
- Resource: Minimal

#### Reliability Requirements
- Deterministic regeneration for same snapshot
- Fail closed if data missing

#### Task Definition
```json
{
  "goal": "Extend red-team derivation to include all six served collections using in-tree data",
  "deliverables": [
    { "name": "scripts/eval/build.ts", "format": "TypeScript" },
    { "name": "data/eval/redteam-fabricated.json (regenerated)", "format": "JSON" }
  ],
  "successCriteria": [
    {
      "text": "All six served collections have >=1 measured case",
      "verificationKind": "contains_text",
      "verificationSpec": "Count cases by collection in regenerated set"
    },
    {
      "text": "Deterministic regeneration from snapshot",
      "verificationKind": "command_exit_0",
      "verificationSpec": "bun run build:eval && diff stable"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 10, Impact 3, Confidence 1.0, Effort 1 → **30.0**

---

### Story 3: Per-collection table + check:docs rule (1.3)
**Story ID:** S1-3  
**Epic:** E1  
**Priority:** Must (RICE: 27.0)  
**Size:** M  

#### User Story
**As a** customer/auditor reading measurements,  
**I want** suggestion presence and precision published per collection with case counts,  
**So that** figures are never presented as corpus-wide without breakdown and drift is caught by docs gate.

#### INVEST Checklist
- [x] Independent: Can write measurements doc and update check:docs
- [x] Valuable: Makes claims auditable
- [x] Testable: check:docs will fail if rule violated

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: Per-collection table exists**
```
Given measurements are recorded
When viewing docs/specs/measurements.md
Then a table shows per-collection: collection name, cases, top-1, top-3, top-5, rank-1 precision
And every served collection is present
And case counts are shown
```

**Scenario 2: check:docs enforces per-collection breakdown**
```
Given a figure is written without collection breakdown (typed as corpus-wide only)
When bun run check:docs runs
Then check:docs fails
And error indicates collection breakdown is required
```

**Scenario 3: Figures resolve to artefacts**
```
Given measurements.md
When figures are checked
Then they correspond to committed artefacts (e.g., data/benchmark/vs-search.json)
And no hand-typed numbers contradict artefacts (within 1.5x band where applicable)
```

**Scenario 4: Claim text is precise**
```
Given customer claim about presence
When written
Then it reads like "top-3 presence X/40 on a mutation-derived set drawn from six collections"
And never placed beside competitor's correction accuracy
```

#### Edge Cases
- Collections with 0 cases must not appear (or cause failure per S1-4)

#### Task Definition
```json
{
  "goal": "Add per-collection table to measurements.md and enforce via check:docs",
  "deliverables": [
    { "name": "docs/specs/measurements.md", "format": "markdown" },
    { "name": "packages/mizan-gate/src/docs-claims.ts (or related)", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "Per-collection table with all 6 collections and case counts",
      "verificationKind": "contains_text",
      "verificationSpec": "measurements.md contains collection names and case counts"
    },
    {
      "text": "check:docs fails if collection-less figure appears",
      "verificationKind": "test_passes",
      "verificationSpec": "planted violation test"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 9, Impact 3, Confidence 1.0, Effort 1 → **27.0**

---

### Story 4: Harness assertion - no served collection unreachable (1.4)
**Story ID:** S1-4  
**Epic:** E1  
**Priority:** Must (RICE: 30.0)  
**Size:** S  

#### User Story
**As a** CI gate,  
**I want** the harness to fail when any served collection has zero measured cases,  
**So that** the exact defect (37% exclusion) is caught automatically.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: Passes when all served collections have cases**
```
Given all 6 collections have >=1 case
When harness runs
Then assertion passes
```

**Scenario 2: Fails when collection removed (planted violation)**
```
Given derivation missing a collection
When harness executes
Then exits non-zero
And error names the specific unreachable collection(s)
```

**Scenario 3: Assertion cannot be skipped**
```
Given any flag attempt to bypass
When harness runs
Then assertion still executes
```

#### Edge Cases
- Multiple collections unreachable simultaneously
- Collection appears in served set but not in measurement

#### Task Definition
```json
{
  "goal": "Add hard assertion in harness that every served collection appears with >=1 case",
  "deliverables": [
    { "name": "scripts/eval/suggest-coverage.ts", "format": "TypeScript" },
    { "name": "packages/mizan-gate/test (planted violation)", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "Planted violation causes non-zero exit naming collection",
      "verificationKind": "test_passes",
      "verificationSpec": "Gate self-test with violation fails as expected"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 10, Impact 3, Confidence 1.0, Effort 1 → **30.0**

---

### Story 5: ADR-16 - MCP parity as second opt-in tool (1.5)
**Story ID:** S1-5  
**Epic:** E2  
**Priority:** Must (RICE: 24.0)  
**Size:** S  

#### User Story
**As a** maintainer of the MCP contract,  
**I want** MCP surface parity for suggestions to be delivered as a second opt-in tool (not adding fields to verify),  
**So that** existing clients with no schemaVersion are not broken by additive changes.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: ADR-16 documents ruling**
```
Given MCP server has no result-schema version
When ADR-16 is recorded
Then it documents why second opt-in tool is chosen over additive field on verify
And cites SERVER_VERSION/absence of schemaVersion
```

**Scenario 2: Verify response shape unchanged**
```
Given verify tool response before change
When changes are made per ruling
Then verify response remains byte-identical
And golden transcript confirms
```

**Scenario 3: New tool is opt-in and read-only**
```
Given the new suggestion tool exists
When invoked
Then it is opt-in (separately named), read-only
And refusals travel as tool errors (per honest degradation)
```

#### Edge Cases
- Client already integrated - must not break
- Tool discovery - clearly separated

#### Task Definition
```json
{
  "goal": "Record ADR-16 and ensure verify response remains byte-identical",
  "deliverables": [
    { "name": "docs/specs/adr/ADR-16.md", "format": "markdown" },
    { "name": "packages/mizan-mcp/src/server.ts", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "ADR-16 accepted with rationale",
      "verificationKind": "contains_text",
      "verificationSpec": "ADR-16 documents absent schemaVersion"
    },
    {
      "text": "verify response byte-identical before/after (golden transcript)",
      "verificationKind": "test_passes",
      "verificationSpec": "Golden transcript test passes"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 8, Impact 3, Confidence 1.0, Effort 1 → **24.0**

---

## Sprint 2: Surface Parity, Clean-Clone Acceptance & Claim Governance (E2, E3)

### Story 6: Clean-clone acceptance test across CLI and MCP surfaces (2.1)
**Story ID:** S2-1  
**Epic:** E2  
**Priority:** Should (RICE: 18.0)  
**Size:** M  

#### User Story
**As a** release engineer validating a clean clone,  
**I want** every surface (CLI, MCP) to reach a typed honest state when `data/corpus.db` is absent,  
**So that** missing gitignored corpus never causes crashes or silent empty lists.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: CLI degrades honestly without corpus**
```
Given data/corpus.db is absent (clean clone)
When running CLI suggestion/verify flows
Then system returns typed honest state per §16 (e.g., "no sources found" / "unverifiable" as appropriate)
And no stack trace is produced
And exit code is documented
```

**Scenario 2: MCP surface degrades honestly without corpus**
```
Given corpus absent
When MCP tool is called
Then refusal travels as tool error with typed reason
And no crash occurs
```

**Scenario 3: All surfaces covered**
```
Given clean-clone test suite
When executed
Then CLI and MCP surfaces are both tested
And each asserts typed state, not generic error
```

#### Edge Cases
- Corpus partially missing? (not expected - file absent)
- Permissions issues on corpus path

#### Security/Reliability
- Fail closed (§16); honest degradation
- Never log corpus content (hashes only)

#### Task Definition
```json
{
  "goal": "Add clean-clone acceptance tests asserting typed honest state when corpus absent",
  "deliverables": [
    { "name": "apps/cli/test/clean-clone.test.ts", "format": "TypeScript" },
    { "name": "packages/mizan-mcp/test/clean-clone.test.ts", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "Tests pass with corpus absent, assert typed honest state",
      "verificationKind": "test_passes",
      "verificationSpec": "bun test for clean-clone"
    },
    {
      "text": "No stack traces in error output",
      "verificationKind": "contains_text",
      "verificationSpec": "Error output contains typed tag, not 'Error:' stack"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 9, Impact 2, Confidence 1.0, Effort 1 → **18.0**

---

### Story 7: `bun run accept:customer` rehearsal command (2.2)
**Story ID:** S2-2  
**Epic:** E2  
**Priority:** Should (RICE: 18.0)  
**Size:** M  

#### User Story
**As a** customer/solutions engineer,  
**I want** a single command that proves the whole spine on the customer's own machine (clean clone),  
**So that** acceptance can be rehearsed reliably and reproducibly.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: Command exists and runs offline**
```
Given a clean clone environment
When running `bun run accept:customer`
Then command executes successfully (exit 0)
And runs fully offline (no network calls)
And labels replay mode honestly if applicable
```

**Scenario 2: Outputs required information**
```
Given the command runs
When it completes
Then it prints snapshot identity, gate results, and ledger chain verdict
And all information is derivable from existing commands (verify:runs, ingest:check, gates)
```

**Scenario 3: Works on clean clone**
```
Given corpus absent initially
When command runs
Then it handles clean-clone case correctly (per S2-1)
And still produces coherent output about honest states reached
```

**Scenario 4: Deterministic and reproducible**
```
Given same environment
When run twice
Then outputs are consistent (hashes stable)
And behavior is reproducible
```

#### Edge Cases
- Missing dependencies? (bun installed) - documented pre-reqs
- Clean vs populated corpus states

#### Task Definition
```json
{
  "goal": "Add bun run accept:customer script that runs full acceptance rehearsal",
  "deliverables": [
    { "name": "scripts/accept-customer.ts", "format": "TypeScript" },
    { "name": "package.json (script entry)", "format": "JSON" }
  ],
  "successCriteria": [
    {
      "text": "bun run accept:customer exits 0 on clean clone",
      "verificationKind": "command_exit_0",
      "verificationSpec": "bun run accept:customer in clean environment"
    },
    {
      "text": "Outputs snapshot identity, gate results, ledger chain verdict",
      "verificationKind": "contains_text",
      "verificationSpec": "Output contains snapshotHash/identity, gate results, chain verdict"
    },
    {
      "text": "Runs offline",
      "verificationKind": "contains_text",
      "verificationSpec": "No network access attempted; output labels modes"
    }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

**RICE:** Reach 9, Impact 2, Confidence 1.0, Effort 1 → **18.0**

---

### Story 8: MCP suggestion tool + golden transcript (2.3)
**Story ID:** S2-3  
**Epic:** E2  
**Priority:** Should (RICE: 16.0)  
**Size:** M (High risk per spec)  

#### User Story
**As an** MCP client developer,  
**I want** a read-only suggestion tool exposed via MCP (separately from verify),  
**So that** I can get nearest-quote suggestions without breaking the verify contract.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: New tool added as second opt-in tool**
```
Given ADR-16 ruling
When implementing MCP suggestion tool
Then it is a separate tool (different name) from verify
And is opt-in/read-only
```

**Scenario 2: Verify response remains byte-identical**
```
Given verify response captured as golden
When adding suggestion tool
Then verify tool's response shape/content is byte-identical
And golden transcript test confirms this
```

**Scenario 3: Suggestion tool returns proper schema**
```
Given suggestion tool is called with a quote
When executed
Then it returns Suggestion shape per core schema (or typed error)
And refusals are returned as tool errors
```

**Scenario 4: Honest degradation in MCP context**
```
Given corpus issues or other failures
When suggestion tool called
Then failures surface as typed tool errors per §16
And no suggestion data fabricated
```

#### Edge Cases
- Empty/short quotes
- No matches found
- Corpus unavailable

#### Security
- Read-only only
- No content logged

#### Task Definition
```json
{
  "goal": "Add MCP suggestion tool per ADR-16 with golden transcript proving verify unchanged",
  "deliverables": [
    { "name": "packages/mizan-mcp/src/server.ts", "format": "TypeScript" },
    { "name": "packages/mizan-mcp/test/golden-transcript.test.ts", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "verify response byte-identical (golden transcript passes)",
      "verificationKind": "test_passes",
      "verificationSpec": "Golden transcript comparison"
    },
    {
      "text": "Suggestion tool is separate and opt-in",
      "verificationKind": "contains_text",
      "verificationSpec": "Tool list includes suggestion tool separately"
    },
    {
      "text": "Refusals as tool errors, no fabrication",
      "verificationKind": "test_passes",
      "verificationSpec": "Error handling tests"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 8, Impact 2, Confidence 1.0, Effort 1 → **16.0** (High risk noted; confidence still high given clear ruling)

---

### Story 9: ADR-18 + customer claim surface as derived artefact (2.4)
**Story ID:** S2-4  
**Epic:** E3  
**Priority:** Should (RICE: 18.0)  
**Size:** M  

#### User Story
**As a** product owner responsible for customer claims,  
**I want** any customer-facing claim surface to generate figures from committed artefacts (never typed),  
**So that** check:docs catches drift and we don't over-claim outside audited docs.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: ADR-18 recorded**
```
Given risk of prose drift in customer surfaces
When ADR-18 is created
Then it mandates derived artefacts; typed figures fail check:docs
And documents widening AUDITED_DOCUMENTS with triage (per ADR-13 pattern)
```

**Scenario 2: Customer claim surface is derived**
```
Given a customer-facing document/script
When it produces figures
Then those figures are read from committed artefacts (e.g., vs-search.json, measurements.md)
And no hardcoded numbers appear
```

**Scenario 3: check:docs enforces rule**
```
Given a typed figure added to an un-audited customer surface
When check:docs runs
Then it fails
And points to requirement that figure must come from artefact
```

**Scenario 4: AUDITED_DOCUMENTS handled properly**
```
Given new derived surface added
When check:docs validates
Then AUDITED_DOCUMENTS is updated with proper triage as per ADR-13 pattern
```

#### Edge Cases
- Multiple artefact sources must be consistent

#### Task Definition
```json
{
  "goal": "Create ADR-18 and ensure customer claim surfaces are derived from artefacts",
  "deliverables": [
    { "name": "docs/specs/adr/ADR-18.md", "format": "markdown" },
    { "name": "packages/mizan-gate/src/docs-claims.ts", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "ADR-18 documents derived-only requirement",
      "verificationKind": "contains_text",
      "verificationSpec": "ADR-18 states figures derived from committed artefacts"
    },
    {
      "text": "check:docs fails on typed figure in customer surface",
      "verificationKind": "test_passes",
      "verificationSpec": "Planted violation test"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 9, Impact 2, Confidence 1.0, Effort 1 → **18.0**

---

### Story 10: Comparative claim sheet with comparable/not-comparable marks (2.5)
**Story ID:** S2-5  
**Epic:** E3  
**Priority:** Should (RICE: 16.0)  
**Size:** S  

#### User Story
**As a** product marketer,  
**I want** a comparative claim sheet that marks each row as comparable or not-comparable with reasons,  
**So that** our mutation-derived presence figure is never placed beside a competitor's correction accuracy.

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: Comparative table exists**
```
Given competitive analysis
When viewing comparative claim sheet
Then each row shows: Product, What they ship, Our figure applicability, Comparable/Not-comparable, Reason
```

**Scenario 2: Correct marking for key competitors**
```
Given quran-validator (uses fuzzy authoritative), Arabic RAG QA (LLM in answer path), etc.
When assessed
Then rows are marked Not-comparable where metrics differ (e.g., our presence vs correction accuracy)
And reasons are explicit
```

**Scenario 3: Our figures never misapplied**
```
Given the sheet
When reviewing
Then mutation-derived presence is explicitly labelled as such
And never conflated with correction accuracy or authoritativeness
And the sheet is derived from artefacts (per S2-4)
```

**Scenario 4: Enforcement against drift**
```
Given the sheet is part of derived surface
When check:docs runs
Then it validates against artefacts
```

#### Edge Cases
- New competitor appears - sheet must be updateable

#### Task Definition
```json
{
  "goal": "Create comparative claim sheet with comparable/not-comparable marks derived from artefacts",
  "deliverables": [
    { "name": "docs/customer/comparative-claims.md (derived)", "format": "markdown" },
    { "name": "scripts/gen-comparative.ts (generator)", "format": "TypeScript" }
  ],
  "successCriteria": [
    {
      "text": "Each row has Comparable/Not-comparable with reason",
      "verificationKind": "contains_text",
      "verificationSpec": "comparative-claims.md contains 'Comparable' and 'Not-comparable'"
    },
    {
      "text": "Presence vs correction accuracy clearly separated",
      "verificationKind": "contains_text",
      "verificationSpec": "Explicit note separating presence from correction accuracy"
    },
    {
      "text": "Generated from artefacts (no hardcoded typed figures)",
      "verificationKind": "contains_text",
      "verificationSpec": "Generator reads from vs-search.json/measurements"
    }
  ],
  "accessNeeded": ["read", "write"]
}
```

**RICE:** Reach 8, Impact 2, Confidence 1.0, Effort 1 → **16.0**

---

## Sprint 3+: Deferred Work (E4 - Not Committed in Current Cycle)

### Story 11: Recall-gated deterministic trigram index spike (3.1) - DEFERRED
**Story ID:** S3-1  
**Epic:** E4 (Deferred)  
**Priority:** Could (RICE: 6.0)  
**Size:** L  

**Note:** Explicitly deferred per spec. Hard gate: no index work until E1/E2 closed.

#### User Story
**As a** performance engineer,  
**I want** to explore a deterministic index to improve latency,  
**But only if** it does not reduce adversarial top-k presence vs the six-collection baseline (recall gate is precondition).

#### Acceptance Criteria (Given/When/Then)
**Scenario 1: Recall gate is precondition (hard gate)**
```
Given index implementation is proposed
When evaluated
Then adversarial top-k presence on six-collection set must not drop below E1 baseline
And this is checked before accepting any latency improvement
```

**Scenario 2: Tested on both runners**
```
Given index code
When tested on win32 and ubuntu
Then determinism holds on both
```

**Scenario 3: Accept outcome can be "discard"**
```
Given recall drops
When evaluated
Then change is discarded and latency miss stays published as unmet
And this is an accepted outcome
```

**RICE:** Reach 3, Impact 2, Confidence 0.5 (spike), Effort 5 → (3*2*0.5)/5 = **0.6**? Or better scored as Could - RICE 6.0 as stated in rough calc; but formula gives ~0.6. But spec marks as Could. Lower priority.

**Status:** DEFERRED to Sprint 3+ after E1,E2 close.

---

### Story 12: Per-collection latency figures (3.2) - DEFERRED
**Story ID:** S3-2  
**Epic:** E4  
**Priority:** Could (RICE: 9.0)  
**Size:** M  

**Deferred until dependencies met.**

#### Acceptance Criteria
- Each latency figure names collection and snapshot
- Sits inside published 1.5x band
- Derived from artefacts

**Status:** DEFERRED.

---

## Dependency Graph (Textual)

**Blocking Dependencies:**
- S1-1 (ADR-15) → S1-2 (extend derivation)
- S1-2 → S1-3 (per-collection table needs regenerated data)
- S1-2 → S1-4 (harness assertion needs full set)
- S1-4 → S2-1 (clean-clone depends on E1 closure)
- S1-5 (ADR-16) → S2-3 (MCP tool implementation)
- S2-1 → S2-2 (accept:customer builds on clean-clone tests)
- S1-3 → S2-4 (ADR-18 needs measurements structure)
- S2-4 → S2-5 (comparative sheet must be derived)
- S2-5 → S3-1 (recall-gated work after governance)

**Shared Dependencies:** None significant. All stories build on core contracts.

**External Dependencies:** None (offline, deterministic).

---

## Risk Register (Stories with High Uncertainty/Risk)

| Story | Risk | Mitigation |
|---|---|---|
| S2-3 (MCP tool + golden transcript) | Breaking verify contract - High (per spec R5) | ADR-16 ruling, golden transcript test proves byte-identical, second opt-in tool |
| S3-1 (recall-gated index) | Recall loss - Critical (R3) | Hard gate: recall must not drop; discard if fails |
| S1-2 (extend derivation) | Changes existing figures - Medium | Regenerate deterministically, validate against snapshot, preserve adjudicated anchors |
| S2-1 (clean-clone) | Missing corpus edge cases - Medium | Test both absent and present states; assert typed errors |

---

## Summary Table of All Stories (with RICE)

| Story ID | Title | Sprint | Priority | RICE | Size | Epic |
|---|---|---|---|---|---|---|
| S1-1 | ADR-15 - Measurement coverage derived & asserted (1.1) | Sprint 1 | Must | 30.0 | S | E1 |
| S1-2 | Extend red-team derivation to all 6 collections (1.2) | Sprint 1 | Must | 30.0 | M | E1 |
| S1-3 | Per-collection table + check:docs rule (1.3) | Sprint 1 | Must | 27.0 | M | E1 |
| S1-4 | Harness assertion - no unreachable collections (1.4) | Sprint 1 | Must | 30.0 | S | E1 |
| S1-5 | ADR-16 - MCP parity as second opt-in tool (1.5) | Sprint 1 | Must | 24.0 | S | E1 |
| S2-1 | Clean-clone acceptance tests (2.1) | Sprint 2 | Should | 18.0 | M | E2 |
| S2-2 | accept:customer rehearsal command (2.2) | Sprint 2 | Should | 18.0 | M | E2 |
| S2-3 | MCP suggestion tool + golden transcript (2.3) | Sprint 2 | Should | 16.0 | M | E2 |
| S2-4 | ADR-18 + derived customer claim surface (2.4) | Sprint 2 | Should | 18.0 | M | E3 |
| S2-5 | Comparative claim sheet (comparable/not-comparable) (2.5) | Sprint 2 | Should | 16.0 | S | E3 |
| S3-1 | Recall-gated trigram index spike (3.1) | Sprint 3+ | Could | 0.6* | L | E4 |
| S3-2 | Per-collection latency figures (3.2) | Sprint 3+ | Could | 9.0 | M | E4 |

*Note: S3-1 scored as spike with lower confidence; explicitly deferred.

---

## Competitive Feature Comparison

Drawing from research (quran-validator, Arabic RAG QA, QDetect, UmmahAPI):

| Feature Area | Market Standard | mizan Current State | Gap/Alignment | Story Coverage |
|---|---|---|---|---|
| **Authoritative matching** | Tiered (exact→fuzzy common) | `MatchStrength = exact\|none` only (§10) | **Differentiator** - we refuse fuzzy as authoritative (CWE-345). Aligns with "avoid fuzzy as pipeline-authoritative" | All stories preserve this; S2-5 documents as not-comparable where competitors use fuzzy authoritatively |
| **Determinism** | Often hybrid (BM25+dense+rerank) introduces non-determinism | Fully deterministic scan; verifier depends only on @mizan/core | **Differentiator** - byte-identical verdicts. Market uses non-deterministic for recall | S3-1 only allowed if recall preserved (recall gate) |
| **Provenance/Attestation** | Rarely shipped | Hash-chained ledger, snapshotHash, attestation | **Strong differentiator** - competitors don't ship computed badge/attested snapshot | S2-2 validates chain/attestation in rehearsal |
| **Surface parity (MCP)** | Varies | CLI-only for suggestions currently | Gap to close without breaking contracts | S1-5 (ruling), S2-3 (implementation) |
| **Measurement coverage** | Often unstated | Hadith-only (37% corpus unmeasured) | **Critical gap** to fix | S1-1 through S1-4 close this |
| **Honest degradation** | Mixed | Explicit §16 table, fail-closed | Strong - aligns with best practice | S2-1 enforces clean-clone honest degradation |
| **LLM in verdict path** | Common in RAG | Explicitly forbidden (§9) | **Differentiator** - refuse to make model authoritative | All stories maintain this boundary |

**Table-stakes vs Differentiators:** Exact containment + normalization are table stakes (quran-validator does). Our differentiators are deterministic computed badge, attestation, hash-chained provenance, machine-checked gates, and refusal to use fuzzy/LLM as authoritative. The coverage gap (S1-*) is a credibility issue, not missing feature - it's about measuring what we have honestly.

---

## Handoff JSON Block

The following JSON contains the full handoff for the next phase as specified:
```json
{
  "stories": [
    {
      "id": "S1-1",
      "title": "ADR-15 - Measurement coverage derived & asserted (1.1)",
      "sprint": 1,
      "epic": "E1",
      "priority": "Must",
      "rice": 30.0,
      "size": "S",
      "userStory": "As a Product/Engineering owner concerned with auditability, I want the red-team measurement set's collection coverage to be declared as a derived property and asserted by the harness, So that we cannot silently exclude collections (the structural 37% exclusion cannot recur).",
      "dependencies": [],
      "acceptanceCriteria": [
        "Given the codebase with measurement builders in scripts/eval/build.ts, When ADR-15 is created and recorded, Then ADR-15 is accepted, cited in relevant docs, and documents the name-ordered prefix-slice mechanism And the mechanism is written where the builders live",
        "Given a measurement set that includes all served collections, When the suggestion measurement harness runs, Then the harness passes the coverage assertion And reports per-collection presence/precision",
        "Given a measurement set with a served collection removed from derivation, When the harness runs the coverage assertion, Then the harness fails with an error naming the missing collection And the failure message clearly identifies which collection is unreachable",
        "Given any change to anchor ordering or prefix slicing in build logic, When measurement is derived, Then the harness re-derives and asserts coverage And does not rely on implicit assumptions"
      ],
      "edgeCases": [
        "Anchor list empty for a collection; collection has 1 record only; MAIN_ANCHORS_PER_COLLECTION changes",
        "Build logic changes slice offset; collection ordering changes",
        "A collection appears/disappears in served set; zero cases possible",
        "N/A for network"
      ],
      "securityCriteria": [
        "Coverage assertion cannot be bypassed - cannot be disabled, failure is non-zero exit"
      ],
      "performance": {
        "responseTime": "Harness check completes within 1 second"
      },
      "reliability": {
        "errorHandling": "Typed failure with collection name; fail closed",
        "retryStrategy": "No retries (deterministic)"
      }
    },
    {
      "id": "S1-2",
      "title": "Extend red-team derivation to all 6 collections (1.2)",
      "sprint": 1,
      "epic": "E1",
      "priority": "Must",
      "rice": 30.0,
      "size": "M",
      "userStory": "As a QA/auditor, I want the red-team measurement set to include cases from all six served collections (including Qur'an, Tirmidhi, Nasai), So that suggestion figures are not structurally limited to 3 collections and the 37% exclusion is closed.",
      "dependencies": ["S1-1"],
      "acceptanceCriteria": [
        "All six collections represented: abudawud, ibnmajah, malik, nasai, quran, tirmidhi each with >=1 case",
        "Existing adjudicated anchors unaffected; byte-identity preserved for same snapshot where applicable",
        "Golden set cases (quran 20, tirmidhi 16, nasai 25) incorporated",
        "Set remains mutation-derived and traceable"
      ]
    },
    {
      "id": "S1-3",
      "title": "Per-collection table + check:docs rule (1.3)",
      "sprint": 1,
      "epic": "E1",
      "priority": "Must",
      "rice": 27.0,
      "size": "M",
      "userStory": "As a customer/auditor reading measurements, I want suggestion presence and precision published per collection with case counts, So that figures are never presented as corpus-wide without breakdown and drift is caught by docs gate.",
      "dependencies": ["S1-2"],
      "acceptanceCriteria": [
        "Per-collection table in measurements.md with all 6 collections, cases, top-1/top-3/top-5, rank-1 precision",
        "check:docs fails if collection-less figure appears",
        "Figures correspond to committed artefacts",
        "Claim reads precisely as specified"
      ]
    },
    {
      "id": "S1-4",
      "title": "Harness assertion - no unreachable collections (1.4)",
      "sprint": 1,
      "epic": "E1",
      "priority": "Must",
      "rice": 30.0,
      "size": "S",
      "userStory": "As a CI gate, I want the harness to fail when any served collection has zero measured cases, So that the exact defect (37% exclusion) is caught automatically.",
      "dependencies": ["S1-2"],
      "acceptanceCriteria": [
        "Passes when all 6 collections have >=1 case",
        "Fails with collection name on planted violation",
        "Assertion cannot be bypassed"
      ]
    },
    {
      "id": "S1-5",
      "title": "ADR-16 - MCP parity as second opt-in tool (1.5)",
      "sprint": 1,
      "epic": "E2",
      "priority": "Must",
      "rice": 24.0,
      "size": "S",
      "userStory": "As a maintainer of the MCP contract, I want MCP surface parity for suggestions delivered as second opt-in tool (not adding fields to verify), So that existing clients with no schemaVersion are not broken.",
      "dependencies": [],
      "acceptanceCriteria": [
        "ADR-16 documents ruling with rationale",
        "Verify response remains byte-identical (golden transcript confirms)",
        "New tool is opt-in, read-only, refusals as tool errors"
      ]
    },
    {
      "id": "S2-1",
      "title": "Clean-clone acceptance tests (2.1)",
      "sprint": 2,
      "epic": "E2",
      "priority": "Should",
      "rice": 18.0,
      "size": "M",
      "userStory": "As a release engineer, I want every surface (CLI, MCP) to reach typed honest state when data/corpus.db absent, So that missing corpus never causes crashes or silent empty lists.",
      "dependencies": ["S1-4"],
      "acceptanceCriteria": [
        "CLI degrades honestly without corpus - typed state, no stack trace, documented exit code",
        "MCP degrades honestly - tool errors with typed reason",
        "Both surfaces covered"
      ]
    },
    {
      "id": "S2-2",
      "title": "accept:customer rehearsal command (2.2)",
      "sprint": 2,
      "epic": "E2",
      "priority": "Should",
      "rice": 18.0,
      "size": "M",
      "userStory": "As a customer/solutions engineer, I want a single command proving the whole spine on clean clone, So that acceptance can be rehearsed reliably.",
      "dependencies": ["S2-1"],
      "acceptanceCriteria": [
        "Exits 0 on clean clone, runs offline, labels replay honestly",
        "Outputs snapshot identity, gate results, ledger chain verdict",
        "Handles clean-clone case correctly",
        "Deterministic and reproducible"
      ]
    },
    {
      "id": "S2-3",
      "title": "MCP suggestion tool + golden transcript (2.3)",
      "sprint": 2,
      "epic": "E2",
      "priority": "Should",
      "rice": 16.0,
      "size": "M",
      "userStory": "As an MCP client developer, I want a read-only suggestion tool exposed separately from verify, So that I get suggestions without breaking verify contract.",
      "dependencies": ["S1-5"],
      "acceptanceCriteria": [
        "Second opt-in tool, separate from verify",
        "Verify response byte-identical (golden transcript passes)",
        "Returns Suggestion shape or typed error",
        "Honest degradation as tool errors"
      ]
    },
    {
      "id": "S2-4",
      "title": "ADR-18 + derived customer claim surface (2.4)",
      "sprint": 2,
      "epic": "E3",
      "priority": "Should",
      "rice": 18.0,
      "size": "M",
      "userStory": "As a product owner, I want customer-facing claim surfaces to generate figures from committed artefacts, So that check:docs catches drift.",
      "dependencies": ["S1-3"],
      "acceptanceCriteria": [
        "ADR-18 mandates derived artefacts; typed figures fail check:docs",
        "Customer surfaces read from artefacts (no hardcoded numbers)",
        "AUDITED_DOCUMENTS updated with proper triage"
      ]
    },
    {
      "id": "S2-5",
      "title": "Comparative claim sheet (comparable/not-comparable) (2.5)",
      "sprint": 2,
      "epic": "E3",
      "priority": "Should",
      "rice": 16.0,
      "size": "S",
      "userStory": "As a product marketer, I want comparative claim sheet marking rows comparable/not-comparable with reasons, So that our mutation-derived presence is never placed beside competitor's correction accuracy.",
      "dependencies": ["S2-4"],
      "acceptanceCriteria": [
        "Each row has Comparable/Not-comparable with reason",
        "Presence vs correction accuracy clearly separated",
        "Generated from artefacts"
      ]
    },
    {
      "id": "S3-1",
      "title": "Recall-gated trigram index spike (3.1)",
      "sprint": 3,
      "epic": "E4",
      "priority": "Could",
      "rice": 0.6,
      "size": "L",
      "userStory": "As performance engineer, I want to explore deterministic index only if it does not reduce adversarial top-k presence vs six-collection baseline.",
      "dependencies": ["S2-5"],
      "acceptanceCriteria": [
        "Recall gate is precondition - presence must not drop",
        "Tested on both win32 and ubuntu (determinism)",
        "Accept outcome can be discard; miss stays published"
      ],
      "status": "DEFERRED"
    },
    {
      "id": "S3-2",
      "title": "Per-collection latency figures (3.2)",
      "sprint": 3,
      "epic": "E4",
      "priority": "Could",
      "rice": 9.0,
      "size": "M",
      "userStory": "As performance engineer, I want per-collection latency figures with collection and snapshot named, staying within 1.5x band.",
      "dependencies": ["S1-3"],
      "acceptanceCriteria": [
        "Each figure names collection and snapshot",
        "Sits inside published 1.5x band",
        "Derived from artefacts"
      ],
      "status": "DEFERRED"
    }
  ],
  "acceptanceCriteria": [
    "All stories follow Given/When/Then format as specified",
    "Edge cases identified per story",
    "Security scenarios included",
    "Performance and reliability requirements defined",
    "RICE scores calculated per story"
  ],
  "dependencies": [
    "S1-1 blocks S1-2",
    "S1-2 blocks S1-3, S1-4",
    "S1-4 blocks S2-1",
    "S1-5 blocks S2-3",
    "S2-1 blocks S2-2",
    "S1-3 blocks S2-4",
    "S2-4 blocks S2-5",
    "S2-5 blocks S3-1",
    "S1-3 blocks S3-2"
  ]
}
```

## Specification
# spec-customer-readiness-nearest-quote-2026-10-05

## 1. Executive Summary

The nearest-quote suggestion feature is **already built, CI-green, and measured** — I verified `check:docs` OK (10 audited docs, 303 files swept) and all7 gates pass. So the request for "production-ready and industry-leading" work has an uncomfortable honest answer: **adding capability is the wrong response and would make the product worse on the axis this customer buys.** No competitor in the research ships a computed badge, an attested snapshot, or machine-checked claims about its own behaviour. The gap deciding this deal is **claim defensibility under audit**. I scoped three epics — make the suggestion figure corpus-wide, rule on and deliver MCP parity, rehearse acceptance on the customer's own machine — and explicitly refused dense retrieval, LLM-in-verdict-path, fuzzy-authoritative matching, and an eighth gate.

## 2. The finding that reorders the request

The context report called the hadith-only evaluation set a "coverage blind spot". It is worse. I root-caused it:

`mainAnchors` (`scripts/eval/build.ts:182`) walks `collectionsOf(db)` **name-ascending** — `abudawud, ibnmajah, malik, nasai, quran, tirmidhi` — taking 5 records each into a 30-entry list. Every red-team builder then takes a **contiguous prefix**: `buildOneWord(…, 4)` slices `[4,16)`, the others slice from `0`. A prefix of a name-ordered list never reaches the later collections.

Confirmed against the committed artefact — the red-team file cites `abudawud 22, ibnmajah 16, malik 2`, and **zero** `nasai`, `quran`, `tirmidhi` cases. The golden set already carries `quran 20, tirmidhi 16, nasai 25`, so the data to close this exists in-tree.

**Served corpus coverage of the suggestion measurement: 3 of 6 collections, 17,398 of 27,234 rows (63.9%). Qur'an (6,236) and Tirmidhi (3,889) — 37% of served records — have zero measurement.** A customer who reads `build.ts` and sees the prefix-slice will reasonably conclude every number here was chosen to flatter it. That is the highest-severity risk here, and it closes before any figure is quoted.

## 3. Business Value Analysis

**Primary driver:** retained trust under third-party audit — not feature count, not latency.

**Must:** M1 per-collection figures across all six collections · M2 harness assertion that no served collection is unreachable · M3 MCP parity ADR + implementation that doesn't change `verify` · M4 clean-clone honest degradation · M5 customer-facing claims derived from artefacts, never typed.

**Should:** one-command customer acceptance rehearsal · competitive claim sheet marking comparable vs not · latency in customer terms (per rejected claim, per run) · duplicate-corpus disclosure (112 groups/307 rows, largest 31 — the customer will find it themselves).

**Could:** recall-gated trigram index · per-collection latency · Arabic-surface audit.

**Won't (with reasons):** dense/embedding/cross-encoder retrieval (non-deterministic, conflicts §9, and the market review reached the same conclusion independently) · LLM in the verdict path · fuzzy as authoritative — `quran-validator` does exactly this and we refuse it on CWE-345 · an eighth gate (extend G-7) · Bukhari/Muslim (blocked by **grading**, ADR-06/C9 — not licensing, the commonly assumed reason) · any new customer document outside the audited set.

## 4. Risk Register

| ID | Risk | Type | Severity | Mitigation |
|---|---|---|---|---|
| R1 | Customer finds the structural 37% exclusion; credibility loss unrecoverable | Business | **Critical** | E1 first; no figure quoted before the per-collection table exists |
| R2 | Over-claiming in a customer deck `check:docs` doesn't read | Business | **Critical** | M5 — customer surface derives from the artefact or doesn't exist |
| R3 | Index lands and silently costs adversarial recall | Technical/Security | **Critical** | ADR-17 recall gate is a precondition, not a review step |
| R4 | A suggestion read by a religious authority as a correction | Integrity | **Critical** | Disclaimer has one owner, already gated; add negative affordance test |
| R5 | MCP wire change breaks an existing integration | Dependency | **High** | ADR-16 — second opt-in tool, `verify` byte-identical, golden transcript |
| R6 | Clean clone has no corpus → crash or silent degradation | Reliability | **High** | M4 — acceptance rehearsal on empty corpus |
| R7 | "Latency improvement" that actually lost recall | Technical | **High** | R3 + ADR-13 corpus-named figures in the 1.5x band |
| R8 | Docs drift while touching ADRs | Operational | Medium (certain) | `check:docs` failing is the gate working |
| R9 | Pressure to "add AI" to look competitive | Strategic | **High** | W1/W2/W3 recorded as Won't with reasons |
| R10 | win32/ubuntu divergence for any new index | Technical | Medium | Gate behind both runners |
| R11 | Customer wants fully offline | Dependency | Medium | `scripted` mode labelled `PRECOMPUTED`; rehearsal runs offline |
| R12 | Grade presented as our ruling | Integrity | Medium | §15/ADR-06; restate `grade per <dataset>` |
| R13 | Scope creep while recall work is in flight | Delivery | Medium | Hard gate: no index work until E1/E2 close |

## 5. Epics & Success Metrics

**E1 — Corpus-wide measurement.** Success: every served collection has ≥1 measured adversarial case; per-collection top-1/3/5 published with case counts; a harness check fails when a collection has zero cases (the exact defect that produced R1). Acceptance: the claim reads *"top-3 presence X/40 on a mutation-derived set drawn from six collections"* — never a corpus-wide percentage, never beside a competitor's correction accuracy.

**E2 — Surface parity + clean-clone acceptance.** Success: `verify` response byte-identical before/after; a suggestion surface on MCP or a disclosed decision not to; `accept:customer` exits 0 on a clean clone naming every honest state; missing corpus yields a typed state and documented exit code.

**E3 — Claim governance for the customer surface.** Success: every customer-facing figure resolves to a committed artefact; comparative rows marked comparable/not-comparable; latency stated per claim and per run with the snapshot named.

**E4 — Recall-gated latency (deferred).** Success: adversarial top-k presence **not lower** than the E1 baseline; p95 improves *or* the target stays published as unmet.

## 6. Security Requirements

Data sensitivity is low-content / high-reputational: no accounts, no auth, no multi-tenancy, no analytics; corpus and question text stay out of logs, traces, ledgers and diagnostics (§13); suggestion failure reasons carry the `_tag` only. **CWE-345 governs** — controls are §9, §10, G-1, G-7, and the ADR-17 recall gate. A03 stays closed via text-node rendering. **New attack surface this cycle: a customer-facing document is a truthfulness surface** — M5 is the control. Auth model unchanged; no item here adds a network dependency.

## 7. Reliability Requirements

Fail closed, degrade honestly (§16); the suggestion pass runs after every verdict and can never become or cause a badge failure. No new timeouts (no new network calls), no retries (retrying a deterministic scan doubles a 753 ms p95 to buy nothing). Clean-clone behaviour is a **test, not an assumption** — `data/corpus.db` is gitignored so absence is the default state of a fresh clone. Observability stays hashes-only; the rehearsal prints snapshot identity, gate results, and chain verdict, all already derivable via `verify:runs` and `ingest:check`.

## 8. ADRs

Full text in the wiki article. **ADR-15** measurement coverage is derived and must be asserted (Proposed) · **ADR-16** MCP parity as a second opt-in tool, `verify` unchanged — the MCP output carries no result-schema version, so an additive field is an unmanaged break (Proposed) · **ADR-17** an index only behind a recall gate; the latency miss stays a published miss (Proposed) · **ADR-18** a customer-facing claim surface is derived, never typed (Proposed).

## 9. Sprint Backlog

**Sprint 1 (Must):** 1.1 root-cause + ADR-15 (S/Low) → 1.2 extend derivation to six collections (M/Med) → 1.3 per-collection table + docs rule (M/Med) → 1.4 unreachable-collection assertion (S/Low) · 1.5 ADR-16 ruling (S/Low).

**Sprint 2 (Should):** 2.1 clean-clone test (M/Med) · 2.2 `accept:customer` (M/Med) · 2.3 MCP tool + golden transcript (M/High) · 2.4 ADR-18 + derived claim surface (M/Med) · 2.5 comparative claim sheet (S/Low).

**Sprint 3+ (named, not committed):** recall-gated index spike · per-collection latency · Arabic-surface audit. Dependencies: 1.1→1.2→1.3→1.4; 2.x requires 1.4; 3.x requires 2.5.

```json
{"office_fact_memory":[{"fact":"The red-team eval set's hadith-only composition is a STRUCTURAL exclusion, not an oversight: mainAnchors in scripts/eval/build.ts walks collectionsOf(db) name-ascending (abudawud, ibnmajah, malik, nasai, quran, tirmidhi) taking MAIN_ANCHORS_PER_COLLECTION=5 each into a 30-entry list, and every red-team builder takes a contiguous .slice() prefix of it (buildOneWord uses offset 4, others0), so a prefix of a name-ordered list never reaches quran or tirmidhi. Result: the suggestion harness measures 3 of 6 served collections (17,398 of 27,234 rows, 63.9%); quran (6,236 records) and tirmidhi (3,889) have zero measurement. The golden set already carries quran 20, tirmidhi 16, nasai 25 cases, so the data to close the gap exists in-tree.","phase":"ceo","evidence":"Read scripts/eval/build.ts:179-186 (mainAnchors + slice-based builders) and anchors.ts (rowsIn ORDER BY id, collectionsOf name-ascending); grouped data/eval/redteam-fabricated.json by citation.collection -> abudawud 22, ibnmajah 16, malik 2, nasai/quran/tirmidhi 0; grouped golden-normalization.json -> quran 20, tirmidhi 16, nasai 25."},{"fact":"The competitive axis for this product is defensibility under adversarial audit, not retrieval power: no competitor in the market review (quran-validator, arabic-rag-qa, QDetect, UmmahAPI) ships a computed badge, an attested corpus snapshot, a hash-chained run receipt, or machine-checked claims about its own behaviour. Adding dense/embedding/cross-encoder retrieval or an LLM in the verdict path would make the product WORSE on that axis, and the market research reached the same conclusion independently.","phase":"ceo","evidence":"research-nearest-quote-suggestions-2026-10-05 recommendation2 ('Avoid: fuzzy as pipeline-authoritative; LLM in verdict path; network deps in verifier; expanding gates beyond G-7'); competitor table's Differentiation Opportunity column names exactly these three differentiators; AGENTS.md §9 and §10 forbid the retrieval additions."},{"fact":"The MCP server carries no result-schema version field: SERVER_VERSION is '0.1.0' in packages/mizan-mcp/src/server.ts and the verify tool result has no schemaVersion. This makes any ADDITIVE field on the existing verify response an unmanaged break for every existing client, which is why surface parity must arrive as a second opt-in tool rather than a new field on verify.","phase":"ceo","evidence":"grepped packages/mizan-mcp/src/*.ts for schemaVersion|version -> only MCP_PROTOCOL_VERSION '2024-11-05' and SERVER_VERSION '0.1.0'; the tool description is a bare string with no published output schema."},{"fact":"Verified governance baseline on 2026-10-05: `bun run check:docs` reports OK over 10 audited documents (README, DISCLOSURE, INTEGRITY, value-proof, demo-runbook, degradation-matrix, scaling-path, specs/measurements, specs/adr/ADR-08, .env.example), 27 corpus surfaces and 9 evidence artefacts, sweeping 303 files for gate-count and ADR citations; `bun run ci:gates` reports CI GREEN for G-1,G-2,G-3,G-5,G-6,G-7,G-4. Any doc change in the customer-readiness cycle should expect check:docs to fail first.","phase":"ceo","evidence":"Ran both commands directly in the repo on 2026-10-05 and captured their output."}]}
```

**Handoff:** spec at `spec-customer-readiness-nearest-quote-2026-10-05`. Priority order is E1 (M1, M2) → E2 (M3, M4) → E3 (M5, S1–S4), with E4 explicitly deferred. Note the reversal for the PM: **Sprint 1 contains no new user-facing capability** — it contains a coverage fix and a docs rule. Do not let scope pressure pull index work (C1/E4) forward ahead of 1.4; the recall gate is a precondition, not a review step.

```json
{"executiveSummary":"The nearest-quote suggestion feature is already built, CI-green and measured (verified: check:docs OK over 10 audited documents and 303 swept files; all 7 gates GREEN). The customer request for 'production-ready and industry-leading' work therefore has an honest answer: adding capability is the wrong response and would make the product worse on the axis this customer buys. No competitor in the market review ships a computed badge, an attested snapshot, a hash-chained receipt, or machine-checked claims about its own behaviour, so the deal is decided by claim defensibility under adversarial audit, not by feature count or latency. I root-caused the sharpest gap: the suggestion harness's hadith-only evaluation set is a STRUCTURAL exclusion, because mainAnchors orders anchors by collection name (abudawud, ibnmajah, malik, nasai, quran, tirmidhi) and every red-team builder takes a contiguous prefix slice, so quran (6,236 records) and tirmidhi (3,889) are unreachable - 37% of the served corpus has zero measurement, and the golden set already carries the cases needed to close it. Scope is three epics: make the suggestion figure corpus-wide and per-collection, rule on and deliver MCP surface parity without changing the verify response, and put the customer's own machine through a rehearsed acceptance run; dense retrieval, an LLM in the verdict path, fuzzy-authoritative matching and an eighth gate are recorded as Won't with reasons.","moscow":{"must":["M1: Measure suggestion presence and precision over ALL six served collections and publish the figures per collection with their case counts, so no suggestion figure is presented as corpus-wide","M2: Add a harness assertion that fails when a served collection is structurally unreachable by the measurement set - the defect that produced the 37% coverage gap","M3: Record the MCP surface-parity ruling as an ADR and implement it without changing the verify tool response shape (a judge may already have integrated it)","M4: Prove clean-clone behaviour: a missing gitignored data/corpus.db degrades to a typed honest state on every surface, never a crash and never a silently empty list","M5: Customer-facing claims are derived from committed artefacts, never typed into a surface check:docs does not read"],"should":["S1: One-command customer acceptance rehearsal (bun run accept:customer) proving the whole spine on the customer's own machine","S2: Competitive claim sheet marking every row comparable or not-comparable, so our mutation-derived presence is never set beside a competitor's correction accuracy","S3: State latency in customer terms (per rejected claim, per run), not only as a per-case p95","S4: Disclose the duplicate-heavy corpus (112 folded-text groups, 307 rows, largest group 31) in customer-facing material, because the customer will find it themselves"],"could":["C1: Deterministic inverted trigram index, admitted only behind the ADR-17 recall gate (adversarial top-k presence must not drop)","C2: Per-collection latency figures rather than one corpus-wide p95","C3: Arabic-first rendering audit of customer-facing surfaces (the audit, not the build)"],"wont":["W1: Dense, embedding or cross-encoder retrieval - non-deterministic, adds dependencies and latency, conflicts with AGENTS.md §9, and improves recall we have no measurement to justify","W2: Any LLM in the verdict path - §9 and ADR-03; a model talkable into confirming a fabrication is worse than no verifier","W3: Fuzzy as a pipeline-authoritative match - quran-validator uses Levenshtein >=0.85 authoritatively and we refuse it on CWE-345; §10 keeps MatchStrength as exact|none","W4: An eighth gate - GATE_IDS is derived and machine-checked repo-wide, so new boundaries extend G-7","W5: Bukhari/Muslim/an-Nawawi ingestion - blocked by grading (ADR-06, ADR-C9), not by licensing","W6: Any new customer-facing document outside the audited document set"]},"riskRegister":[{"id":"R1","risk":"Customer discovers the measurement set structurally excludes 37% of the served corpus (quran and tirmidhi unreachable via name-ordered prefix slicing) and concludes every number was chosen to flatter it","type":"Business","severity":"Critical","mitigation":"Epic E1 ships first; M1 per-collection figures plus M2 harness assertion; no customer-facing figure is quoted before the per-collection table exists"},{"id":"R2","risk":"Over-claiming in a customer deck or one-pager that check:docs does not audit","type":"Business","severity":"Critical","mitigation":"M5 - the customer-facing surface generates from the committed artefact or does not exist (ADR-18)"},{"id":"R3","risk":"A new index lands and silently costs adversarial recall - the CWE-345 shape, and the exact reason ADR-08 rejected the FTS5 trigram sidecar","type":"Technical/Security","severity":"Critical","mitigation":"ADR-17 makes the recall gate a precondition rather than a review step; C1/E4 deferred until E1 and E2 are closed"},{"id":"R4","risk":"A nearest suggestion is read by a religious authority as a correction, ruling or upgrade","type":"Integrity","severity":"Critical","mitigation":"SUGGESTION_DISCLAIMER has a single owner and is already gated; add an acceptance test asserting no correction-shaped affordance, percentage or authority wording on any surface"},{"id":"R5","risk":"An MCP wire change breaks an integration the customer has already built; the MCP output carries no result-schema version, so even an additive field is an unmanaged break","type":"Dependency","severity":"High","mitigation":"ADR-16 - parity arrives as a second opt-in read-only tool; verify response byte-identical, proven by a golden transcript test"},{"id":"R6","risk":"Clean clone has no corpus (79.6MB, gitignored) and crashes or silently degrades","type":"Reliability","severity":"High","mitigation":"M4 - clean-clone acceptance test asserting the typed honest state and documented exit code, not a stack trace"},{"id":"R7","risk":"A latency 'improvement' ships that actually lost recall, and the figure is published without its corpus","type":"Technical","severity":"High","mitigation":"Same gate as R3; plus ADR-13 already requires a stated latency to name its snapshot and sit within the 1.5x band"},{"id":"R8","risk":"Docs drift while touching ADRs and measurement documents - the repository's historical failure mode","type":"Operational","severity":"Medium","mitigation":"check:docs is the control; treat its failure as the gate working, and triage AUDITED_DOCUMENTS widening as ADR-13 did"},{"id":"R9","risk":"Market pressure to 'add AI' (dense retrieval, rerankers) to look competitive","type":"Strategic","severity":"High","mitigation":"W1/W2/W3 recorded as Won't with reasons; the competitive axis is auditability, which is why the differentiator is refusal, not addition"},{"id":"R10","risk":"Cross-platform divergence: win32 and ubuntu differ on path handling or FTS5 collation for any new index","type":"Technical","severity":"Medium","mitigation":"Any index is gated behind both CI runners; determinism asserted on both"},{"id":"R11","risk":"Customer expects fully offline operation and is surprised by a provider dependency","type":"Dependency","severity":"Medium","mitigation":"scripted mode exists and is labelled PRECOMPUTED; the acceptance rehearsal runs offline and says so"},{"id":"R12","risk":"A grade is presented as our own ruling rather than the dataset's","type":"Integrity","severity":"Medium","mitigation":"§15 and ADR-06 binding; customer material restates 'grade per <dataset>, as provided by <source>'"},{"id":"R13","risk":"Scope creep past Sprint 2 while recall work is still in flight","type":"Delivery","severity":"Medium","mitigation":"Hard gate: no index or recall work until E1 and E2 are closed"}],"epics":[{"id":"E1","name":"Corpus-wide suggestion measurement","scope":"Extend red-team case derivation so every served collection is represented, re-measure presence and precision per collection, and assert in the harness that no served collection is unreachable","requirements":["M1","M2"],"successMetrics":["Every served collection carries at least one measured adversarial case, with per-collection top-1/top-3/top-5 presence published alongside its case count","A harness check fails when a served collection has zero cases - the exact defect that produced the 37% coverage gap","check:docs reads the per-collection table, so a stale or collection-less figure fails the build","Customer-facing claim reads 'top-3 presence X/40 on a mutation-derived set drawn from six collections' and is never set beside a competitor's correction accuracy"]},{"id":"E2","name":"Surface parity and clean-clone acceptance","scope":"Rule on MCP parity, implement it without touching the verify response, and prove the whole spine on a machine that has no corpus","requirements":["M3","M4","S1"],"successMetrics":["ADR recorded and cited; the verify tool response is byte-identical before and after, proven by a golden transcript","A suggestion surface exists on MCP, or a recorded and disclosed decision not to add one","bun run accept:customer exits 0 on a clean clone and names every honest state it reached","A missing corpus produces the typed honest state and a documented exit code, never a stack trace"]},{"id":"E3","name":"Claim governance for the customer surface","scope":"Bring customer-facing material inside the existing claim discipline and make comparative figures honest","requirements":["M5","S2","S3","S4"],"successMetrics":["Every customer-facing figure resolves to a committed artefact; a hand-typed one fails check:docs","The comparative table marks each row comparable or not-comparable with the reason","Latency is stated per rejected claim and per run with the snapshot named","Duplicate-group counts disclosed rather than left for the customer to discover"]},{"id":"E4","name":"Recall-gated latency (deferred to Sprint 3+)","scope":"Optional deterministic index, admitted only if it holds adversarial recall at the six-collection baseline","requirements":["C1"],"successMetrics":["Adversarial top-k presence is not lower than the E1 baseline on the full six-collection set","p95 improves, or the <50ms target stays published as unmet with the miss stated in customer terms","An accepted outcome of this epic is that the target remains unmet and disclosed"]}],"sprintBacklog":[{"id":"1.1","title":"Root-cause note and ADR-15: measurement set collection coverage is derived, not incidental","epic":"E1","priority":"Must","size":"S","risk":"Low","dependencies":[],"definitionOfDone":"ADR-15 accepted and cited; the name-ordered prefix-slice mechanism is written down where the builders live"},{"id":"1.2","title":"Extend red-team derivation to all six served collections","epic":"E1","priority":"Must","size":"M","risk":"Medium","dependencies":["1.1"],"definitionOfDone":"Regenerated set is byte-identical for a given snapshot; quran, tirmidhi and nasai each carry cases; existing adjudicated anchors unaffected"},{"id":"1.3","title":"Per-collection presence and precision table plus the check:docs rule that reads it","epic":"E1","priority":"Must","size":"M","risk":"Medium","dependencies":["1.2"],"definitionOfDone":"Every published figure names its collection and case count; a collection-less figure fails bun run check:docs"},{"id":"1.4","title":"Harness assertion: no served collection is unreachable by the measurement set","epic":"E1","priority":"Must","size":"S","risk":"Low","dependencies":["1.2"],"definitionOfDone":"A planted violation - a collection removed from derivation - fails the harness naming the collection, as a gate self-test must"},{"id":"1.5","title":"ADR-16: MCP parity ruling recorded","epic":"E2","priority":"Must","size":"S","risk":"Low","dependencies":[],"definitionOfDone":"ADR-16 accepted with rationale for a second opt-in tool over an additive field, given the absent result-schema version"},{"id":"2.1","title":"Clean-clone acceptance test across CLI and MCP surfaces","epic":"E2","priority":"Should","size":"M","risk":"Medium","dependencies":["1.4"],"definitionOfDone":"With data/corpus.db absent, every surface reaches its typed honest state and documented exit code; no stack trace anywhere"},{"id":"2.2","title":"bun run accept:customer rehearsal command","epic":"E2","priority":"Should","size":"M","risk":"Medium","dependencies":["2.1"],"definitionOfDone":"Exits 0 on a clean clone, prints snapshot identity, gate results and ledger chain verdict, runs offline, and labels replay honestly"},{"id":"2.3","title":"MCP suggestion tool behind ADR-16 with a golden transcript test","epic":"E2","priority":"Should","size":"M","risk":"High","dependencies":["1.5"],"definitionOfDone":"verify response byte-identical before and after; the new tool is opt-in and read-only; refusals travel as tool errors"},{"id":"2.4","title":"ADR-18 and the customer claim surface as a derived artefact","epic":"E3","priority":"Should","size":"M","risk":"Medium","dependencies":["1.3"],"definitionOfDone":"No figure is typed into customer-facing material; AUDITED_DOCUMENTS widened with its own triage, as ADR-13 did"},{"id":"2.5","title":"Comparative claim sheet with comparable / not-comparable marks","epic":"E3","priority":"Should","size":"S","risk":"Low","dependencies":["2.4"],"definitionOfDone":"Each row states what a product ships and whether our figure is comparable to that cell; our presence figure is never placed beside a competitor's correction accuracy"},{"id":"3.1","title":"Recall-gated deterministic trigram index spike (named, not committed)","epic":"E4","priority":"Could","size":"L","risk":"High","dependencies":["2.5"],"definitionOfDone":"Adversarial top-k presence not lower than the E1 baseline on both CI runners, or the change is discarded and the miss stays published"},{"id":"3.2","title":"Per-collection latency figures (named, not committed)","epic":"E4","priority":"Could","size":"M","risk":"Medium","dependencies":["1.3"],"definitionOfDone":"Each figure names its collection and snapshot and sits inside the published 1.5x band"}],"adrs":[{"id":"ADR-15","title":"A measurement set's collection coverage is a derived property the harness must assert","status":"Proposed","context":"The suggestion harness measures 40 cases drawn only from abudawud, ibnmajah and malik, because every red-team builder takes a contiguous prefix of a collection-name-ordered anchor list. A coverage fact left implicit is a coverage fact that drifts, and AGENTS.md §17 applies to measurement as much as to product facts.","decision":"The eval plan declares per-collection case counts, and the harness fails when a served collection has none.","rationale":"The 92.5% top-3 figure is a measurement of three collections presented as a product capability. Making coverage declared rather than incidental is what stops the next builder from silently narrowing it again.","consequences":"The red-team set grows, every recorded recall figure changes, and check:docs gains a rule. Historical figures become unreadable without their collection breakdown, which is the intended consequence."},{"id":"ADR-16","title":"MCP parity arrives as a second opt-in tool; the verify tool does not change","status":"Proposed","context":"The MCP server carries no result-schema version - SERVER_VERSION is 0.1.0 and the tool result has no schemaVersion - so an additive field on an existing response is an unmanaged break for every client already integrated, and verify is a published read-only contract a judge may depend on.","decision":"Add a separate read-only suggestion tool rather than a suggestion field on verify.","rationale":"A second tool is discoverable, opt-in, and reversible; it cannot change the shape of a response an existing integration already parses. Surface parity is a real gap, but it is not worth a silent break of a contract someone else built against.","consequences":"Two tools to maintain, and a client must opt in to get parity. Whichever way the customer goes, the ruling is disclosed rather than left implicit."},{"id":"ADR-17","title":"An index may land only behind a recall gate; the latency miss stays a published miss","status":"Proposed","context":"p95 is 753 ms against a <50 ms target, unmet by roughly 15x. ADR-08 already rejected an FTS5 trigram sidecar because it returned nothing for three of ten adversarial quotes. Every index trades recall for speed, and recall loss here is the CWE-345 hole.","decision":"Any deterministic index is accepted only if adversarial top-k presence is not lower than the six-collection baseline; otherwise the target remains unmet and disclosed.","rationale":"A search that misses the record is worse than a slow one. Making recall a gate rather than a review question is what keeps an optimisation from quietly becoming a verifier defect.","consequences":"The latency target may stay unmet, and that is an accepted outcome rather than a failure. This also rules out dense and cross-encoder retrieval, which the market review reached independently."},{"id":"ADR-18","title":"A customer-facing claim surface is derived, never typed","status":"Proposed","context":"check:docs audits ten repository documents and sweeps27 corpus surfaces, but a customer deck, one-pager or contract annex is none of those. The historical failure mode in this repository is prose drift, and a sales surface is the highest-stakes prose there is.","decision":"Any document or script that names a figure outside the audited set must generate that figure from the committed artefact; a typed figure there fails check:docs.","rationale":"Docs drift already happened once at 1.77x on a latency figure that nothing read. A customer-facing surface is strictly worse than an internal one, because a judge cannot audit a sales page the way they audit a repo.","consequences":"Customer material becomes a build artefact rather than prose, and AUDITED_DOCUMENTS widens with its own triage, exactly as ADR-13 recorded for its four additions."}]}
```

## Architecture
Plan written to the wiki as `arch-nearest-quote-customer-readiness-2026-10-05`. Full plan below.

#1. Executive Summary

The feature is built and CI is green; three things block a customer. (a) The red-team eval set is **structurally** unable to measure three of six served collections: every anchor pool is collection-name/id-ascending and every builder takes a prefix slice, so `mainAnchors(db).slice(0, 16)` can only ever reach `abudawud`/`ibnmajah`/`malik`. (b) The suggestion composition lives in an **app** (`apps/cli/src/suggestions.ts`), which `@mizan/mcp` may not import — G-7.5 fixes the direction as apps → packages, never the reverse, and `@mizan/suggest` cannot host it either because that package's published invariant is one dependency and no I/O. (c) The customer-facing coverage figure is hand-written and arithmetically wrong: Qur'an + Tirmidhi is 37.2% of served records, but **Nasai is unmeasured too**, so 15,797 of 27,234 records (58.0%) carry no measurement, not 37%. The plan fixes (a) at the source with deterministic round-robin collection spreading plus a fail-closed `anchorProblems` assertion, (b) by extracting the composition into a new library `@mizan/nearby` while leaving every CLI import path and test intact through re-export, and (c) by publishing every coverage figure into the existing flat benchmark artefact and adding one docs rule (R21) that fails `check:docs` on any unbacked coverage claim. `verify` is untouched, byte for byte. E4 (index/latency) is deferred behind the ADR-17 recall gate.

# 2. Codebase Impact

| Action | Path |
| --- | --- |
| create | `packages/mizan-nearby/{package.json,tsconfig.json,src/{index,compose}.ts,test/compose.test.ts}` |
| create | `packages/mizan-corpus/src/served.ts` |
| create | `packages/mizan-gate/src/docs-coverage.ts`, `packages/mizan-gate/test/docs-coverage.test.ts` |
| create | `packages/mizan-mcp/src/suggestions.ts` (+ cases in existing `test/server.test.ts`, `test/main.test.ts`) |
| create | `scripts/eval/served.ts`, `scripts/accept-customer.ts`, `scripts/accept-customer.test.ts` |
| create | `docs/specs/adr/ADR-15.md`, `ADR-16.md`, `ADR-17.md` (deferred), `ADR-18.md` |
| modify | `scripts/eval/{anchors,build,suggest-coverage}.ts` |
| modify | `packages/mizan-gate/src/{docs-check,docs-corpus,index}.ts` |
| modify | `packages/mizan-mcp/src/{server,main,index}.ts`, `packages/mizan-mcp/package.json` |
| modify | `apps/cli/src/suggestions.ts` (re-export only), `apps/cli/package.json`, root `package.json` |
| modify | `docs/specs/measurements.md`, `docs/value-proof.md`, `DISCLOSURE.md`, `README.md`, `docs/demo-runbook.md` |
| delete | nothing |

`ADR-14.md` exists;15–18 are free. Every ADR must satisfy `checkAdrDocument` (status/date/context/decision/consequences) and every ADR citation must resolve or R12 fires.

# 3. Module Design

```
packages/mizan-nearby/src/compose.ts      # suggestionFor/suggestionsFor, moved verbatim from the CLI app
packages/mizan-corpus/src/served.ts       # servedCollections(): ONE decoder for attestation.collectionCounts
scripts/eval/served.ts                    # thin: read attestation.json -> ServedCollection[]
scripts/eval/anchors.ts                   # + bucketByCollection / interleave / spreadAcrossCollections
scripts/eval/build.ts                     # builders consume spread pools; anchorProblems asserts coverage
scripts/eval/suggest-coverage.ts          # + per-collection denominators + flat coverage figures
packages/mizan-gate/src/docs-coverage.ts   # R21: measurement-coverage claims vs the artefact
packages/mizan-mcp/src/suggestions.ts     # NEARBY_TOOL, decodeNearbyArgs, executeNearby
scripts/accept-customer.ts                # step table + orchestrator behind `accept:customer`
```

Direction is preserved: `apps/cli` and `@mizan/mcp` are adapters over `@mizan/nearby`; `@mizan/nearby` → `core`, `corpus`, `suggest`, `verify`. `@mizan/suggest` and `@mizan/verify` keep their one-dependency purity, so G-1 and the G-7 verdict closure are untouched (`verify.ts` reaches nothing new).

# 4. API Design

```ts
// packages/mizan-corpus/src/served.ts — §17: one decoder, used by the gate and by eval
export type ServedCollection = { readonly key: string; readonly recordCount: number }
export const servedCollections = (attestationText: string): Result<readonly ServedCollection[], string>

// scripts/eval/anchors.ts — deterministic, id-ascending within a collection
export const bucketByCollection = (rows: readonly CorpusRecord[]): ReadonlyMap<string, readonly CorpusRecord[]>
export const interleave = (buckets: ReadonlyMap<string, readonly CorpusRecord[]>): readonly CorpusRecord[]
export const spreadAcrossCollections = (rows: readonly CorpusRecord[], count: number): readonly CorpusRecord[]

// packages/mizan-gate/src/docs-coverage.ts
export const checkMeasurementCoverage = (
  documentText: string, file: string,
  figures: Readonly<Record<string, number | string>>,
  served: ReadonlySet<string>,
): readonly DocsClaim[]

// packages/mizan-nearby/src/compose.ts — signatures identical to today's apps/cli/src/suggestions.ts
export const suggestionFor = (db: Database, quote: string, collection?: string | null): SuggestionBlock | null
export const suggestionsFor = (db: Database, claims: readonly Claim[], verdicts: readonly ClaimVerdict[]): readonly (SuggestionBlock | null)[]

// packages/mizan-mcp/src/suggestions.ts
export const NEARBY_TOOL: McpTool
export const decodeNearbyArgs = (params: unknown): { readonly quote: string; readonly collection: string | null } | { readonly error: string }
export const executeNearby = (runner: NearbyRunner, params: unknown, startedAt: number, budgetMs: number): McpToolResult
```

`apps/cli/src/suggestions.ts` becomes `export * from "@mizan/nearby"`-shaped re-exports of `suggestionFor`, `suggestionsFor`, `NearbyText`, `SuggestionBlock`, so `apps/cli/src/main.ts`, `demo.ts`, `render.ts`, and all 20+ call sites in `apps/cli/test/suggestions.test.ts` compile unchanged. `createServer(verifier, budgetMs)` keeps its signature; `nearby` is a third optional argument, so `test/server.test.ts` compiles and passes untouched.

# 5. Data Design

`ServedCollection` mirrors `attestation.collectionCounts` — no schema migration, no DB change. From the verified attestation: `abudawud=5272`, `ibnmajah=4336`, `malik=1829`, `nasai=5672`, `quran=6236`, `tirmidhi=3889`, `recordCount=27234`.

The benchmark artefact **must stay flat**: `readFigures` in `packages/mizan-gate/src/docs-value.ts` only walks top-level numeric entries, so a nested `coverage: { … }` object would make R10/R21 green forever. New keys, all top level:

- `suggestionCoverageMeasuredCollections`, `suggestionCoverageUnmeasuredCollections` (number)
- `suggestionCoverageMeasuredRecords`, `suggestionCoverageUnmeasuredRecords` (number)
- `suggestionCoverageSharePercent` (number) — the only figure prose may quote for coverage
- `suggestionCoverageCollections` (string, comma-joined sorted keys; read explicitly like `suggestionCorpusFingerprint`)
- `suggestionCoverageCases<Key>` (one flat number per served collection; the key suffix is derived in one function)

`recordFigures` already replaces the whole `suggestion` namespace on `--record`, so removed keys cannot become orphans.

# 6. Error Strategy

| Failure | Surface | Not |
| --- | --- | --- |
| attestation absent/undecodable | `build:eval` refuses with `err` naming the path | partial set, zero-anchor set |
| served collection with no anchor | `anchorProblems` → non-zero exit from `build:eval` | a set that silently measures3/6 |
| artefact missing a claimed figure | R21 finding, `check:docs` red | a skipped check |
| `nearby_quotes` bad args | tool error `invalid_arguments` | empty candidates |
| scan/read failure mid-session | tool error `nearby_unavailable`, or payload `state: "unavailable"` | empty candidates, a crash |
| corpus absent at startup | existing `main.ts` exit 2, named reason, zero JSON-RPC lines | a well-formed empty answer |
| corrupt DB mid-session | `nearby_unavailable` (mirrors `VERIFIER_UNAVAILABLE`) | `mcp transport failed` |

No new timeout vocabulary: one scan per call sits inside the existing `REQUEST_TIMEOUT_MS = 30_000`. No retry anywhere — every operation is a read of a local file, so a retry would only hide a fault.

# 7. Security Architecture

| Concern | Control |
| --- | --- |
| CWE-345 / §10 | `nearby_quotes` has no `verdict`, `matchStrength`, or badge field; a test asserts their absence from the serialised payload |
| §13 / §11 | `textMatch` (the folded matching key) is never serialised; `textDisplay` is, because it is the feature's purpose and travels with `license`/`attribution`/`grade*`. Web rendering stays text-node only |
| A03 | No `innerHTML`/`dangerouslySetInnerHTML`/`{@html}`; the tool returns JSON, the client renders text |
| A04 / boundary | `decodeNearbyArgs` caps every field (`MAX_NEARBY_QUOTE_LENGTH`, `MAX_NEARBY_COLLECTION_LENGTH`) and `topK` at `MAX_TOP_K` |
| A01 | Read-only `db`; no write tool, no ledger append, no `ingest` reachability |
| A10 | No SSRF surface — stdio only, no network |
| Secrets | `MIZAN_CORPUS_PATH`/`MIZAN_ATTESTATION_PATH` only; nothing new in env |
| Trust boundaries | wire JSON → `decodeNearbyArgs`; artefact JSON → `readFigures`/`checkMeasurementCoverage`; attestation JSON → `servedCollections` |
| Audit | no new log sink; failures carry `errorTag`/`_tag` only, never corpus text |

One header comment must change deliberately: `packages/mizan-mcp/src/server.ts:26` currently states "No corpus content out". ADR-16 amends it to name `nearby_quotes` as the one declared exception, with the `textMatch` prohibition and the reason.

# 8. Design Patterns

- **Strategy** — `Suggestion = SuggestionCandidates | SuggestionNoCandidates | SuggestionUnavailable` already encodes the three honest answers; the MCP payload reuses it rather than inventing a wire shape.
- **Adapter** — CLI and MCP are two adapters over one composition. This is the change that makes parity structural instead of aspirational.
- **Ports and adapters** — `CorpusError` at the data seam; `NearbyRunner` as the MCP port so tests need no `Database`.
- **Template Method** — `executeVerify` and `executeNearby` share decode → budget → answer, with a `Result` return and `toolError` refusal.
- **Fail closed** (§3) — the coverage assertion is an error, not a warning.
- **One source of truth** (§17) — served collections, artefact key vocabulary, and coverage arithmetic each live in exactly one module; `docs-corpus.ts`'s private `servedCollections` delegates to `@mizan/corpus`'s.
- Deliberately **not** introduced: no new framework, no cache, no DI container, no new dependency.

# 9. Testing Strategy

| Level | Target |
| --- | --- |
| Unit | `interleave`/`spreadAcrossCollections` determinism and id-order stability; `servedCollections` on absent/garbage/truncated attestation; `checkMeasurementCoverage` with a planted "measured all six" violation and a planted "37%" figure; `decodeNearbyArgs` caps at boundary |
| Integration | `apps/cli/test/suggestions.test.ts` passes **unmodified** through the re-export; MCP `tools/list` returns `verify` first plus `nearby_quotes`; both tools dispatch; `TOOLS[0]` unchanged |
| Backward compatibility | `executeVerify`, `decodeVerifyArgs`, `VERIFY_TOOL`, `MAX_CITATIONS_PER_*` byte-identical output — asserted by re-recording a golden response, not by inspection |
| Clean clone | spawn with `MIZAN_CORPUS_PATH` pointing at an empty temp dir → exit 2, named reason on stderr, **zero** stdout lines |
| Security | no `verdict`/`matchStrength` in the nearby payload; `textMatch` absent from every serialised form; caps at the boundary; a 10 kB quote refused |
| Performance | `eval:suggestions` records p50/p95/max through the existing harness; `nearby_quotes` cost asserted inside `REQUEST_TIMEOUT_MS` |
| Gates | `bun run ci:gates` green; no new gate added, `GATE_IDS` unchanged; every new rule carries a planted violation (§14) |
| Sequence | `bun run build:eval` → `eval:suggestions` → `check:docs` → `bun run ci` |

# 10. Performance Plan

- No index. `nearby_quotes` costs one full scan per call (published p50 644 / p95 753 / max 1110 ms) — inside the 30 s budget, and `topK` ≤ `MAX_TOP_K` so no extra scan.
- Round-robin spreading adds no per-case cost; the red-team set grows, so `eval:suggestions` runtime grows proportionally. It is **not** in `bun run ci`; `accept:customer` runs it non-record with an explicit per-step budget, and `--record` stays operator-only.
- `spreadAcrossCollections` is O(n) over already-loaded rows; memory is unchanged because `scanSuggestionCandidates` still retains only floor-clearing rows.
- `accept:customer` runs steps sequentially (the existing `CHECK_BUDGET_MS = 180_000` precedent) so peak memory stays flat.
- `<50 ms` remains **unmet** and stays documented as unmet; R18 already prevents a doc from restating it as met.

# 11. Risk Assessment

| Risk | Mitigation |
| --- | --- |
| Red-team case ids/counts change, churning `verify:runs` | assert *coverage*, never a fixed id list; `ADJUDICATION_TARGET` is a separate concern and is re-derived by `expectedAdjudicationCounts()` |
| Moving `suggestions.ts` breaks a test import | re-export preserves all four importing modules and20+ call sites |
| New package surprises CI discovery | `scripts/ci.ts` globs `packages/*`; the manifest needs `typecheck`, `test`, `license`, spdx id (G-5.0) |
| R21 fires on pre-existing prose | run `check:docs`, fix prose, then wire the rule into `docs-check.ts` in the same commit |
| The "37%" figure survives in prose | it is replaced by `suggestionCoverageSharePercent` in the same commit that publishes it |
| `verify` payload drifts | no change to `executeVerify`; a byte-level golden test; G-6.5/G-7 re-run |
| Sibling concurrency on one `Database` | the handle is `readonly` and every call is a single ordered scan; documented as one-scan-per-call, no rate limiter (stdio server, no transport-level DoS surface) |

# 12. Technology Trends

Schema-first decoding, typed `Result` boundaries, deterministic replay, and machine-checked invariants with planted violations are the current baseline for AI citation tooling — this plan adds no framework and no dependency, which is the correct answer to "should we adopt a library here". The FTS-sidecar alternative measured in ADR-08/ADR-17 (46 MB, p95 116 ms, **zero** recall on 3/10 adversarial quotes) stays rejected; ADR-17 records the gate — `suggestionRecallShippedTop5` must not regress — that must pass before an index is even reopened. Extracting the composition into a library rather than importing across workspaces matches current hexagonal practice and is what makes the invariant gateable.

---

**Sequencing.** Sprint 1 (E1 → E2): S1-1 `servedCollections` + `scripts/eval/served.ts` (0.5d) · S1-2 `spreadAcrossCollections` + `build.ts` builders (1d) · S1-3 `anchorProblems` coverage assertion (0.5d) · S1-4 harness per-collection denominators and flat figures (1d) · S1-5 R21 + `check:docs` wiring + prose correction (1d) · S2-1 `@mizan/nearby` extraction (1d) · S2-2 `nearby_quotes` tool (1d) · S2-3 clean-clone + parity tests (0.5d) · S2-4 `accept:customer` (1d). Sprint 2 (E3): S3-1 ADR-15/16/18, S3-2 ADR-17 deferred, S3-3 measurement/proof doc rewrite from derived figures. E4 is out of scope.

```json
{
  "moduleStructure": [
    { "path": "packages/mizan-nearby/src/compose.ts", "change": "create", "responsibility": "Nearest-quote composition (suggestionFor/suggestionsFor/NearbyText/SuggestionBlock) moved verbatim from apps/cli/src/suggestions.ts so packages may reach it", "dependsOn": ["@mizan/core", "@mizan/corpus", "@mizan/suggest", "@mizan/verify"], "notes": "Justified by G-7.5 (apps -> packages only) and @mizan/suggest's one-dependency no-I/O invariant" },
    { "path": "packages/mizan-nearby/package.json", "change": "create", "responsibility": "Workspace manifest with typecheck/test scripts, license and spdx id (G-5.0); auto-discovered by scripts/ci.ts", "dependsOn": [], "notes": "Missing any of these fails CI discovery or G-5.0" },
    { "path": "packages/mizan-corpus/src/served.ts", "change": "create", "responsibility": "servedCollections(attestationText) decoding attestation.collectionCounts into ServedCollection[]", "dependsOn": ["@mizan/core"], "notes": "Single source of truth; docs-corpus.ts private helper and scripts/eval/served.ts both delegate here (AGENTS section 17)" },
    { "path": "scripts/eval/served.ts", "change": "create", "responsibility": "Read attestation.json and return Result<ServedCollection[], string>", "dependsOn": ["@mizan/corpus"], "notes": "err on absent/undecodable; never a partial set" },
    { "path": "scripts/eval/anchors.ts", "change": "modify", "responsibility": "Add bucketByCollection, interleave, spreadAcrossCollections", "dependsOn": [], "notes": "Replaces prefix-slicing of name/id-ascending pools; deterministic, id-ascending within collection" },
    { "path": "scripts/eval/build.ts", "change": "modify", "responsibility": "Builders consume spread pools; anchorProblems asserts every served collection appears in each eligible class", "dependsOn": ["./anchors.ts", "./served.ts"], "notes": "Fails closed via existing validate/anchorProblems so build:eval exits non-zero" },
    { "path": "scripts/eval/suggest-coverage.ts", "change": "modify", "responsibility": "Per-collection case denominators; publish flat suggestionCoverage* figures through existing suggestionFigures/recordFigures", "dependsOn": ["./served.ts"], "notes": "Keys must stay top-level numeric or R10/R21 go green forever" },
    { "path": "packages/mizan-gate/src/docs-coverage.ts", "change": "create", "responsibility": "checkMeasurementCoverage (R21): a document may not claim per-collection measurement the artefact does not back, nor a coverage share it does not publish", "dependsOn": ["./docs-value.ts"], "notes": "Extension of docs-value-latency.ts, not a copy; reuses readFigures and claim" },
    { "path": "packages/mizan-gate/src/docs-check.ts", "change": "modify", "responsibility": "Wire R21 beside R18 using the delegated servedCollections", "dependsOn": ["./docs-coverage.ts"], "notes": "No new gate; GATE_IDS unchanged" },
    { "path": "packages/mizan-gate/src/docs-corpus.ts", "change": "modify", "responsibility": "Replace the private servedCollections body with a delegation to @mizan/corpus", "dependsOn": ["@mizan/corpus"], "notes": "One decoder, two callers" },
    { "path": "packages/mizan-gate/src/index.ts", "change": "modify", "responsibility": "Export the R21 module", "dependsOn": ["./docs-coverage.ts"], "notes": "Flat named exports per AGENTS section 7" },
    { "path": "packages/mizan-gate/test/docs-coverage.test.ts", "change": "create", "responsibility": "Planted-violation self-test for R21", "dependsOn": [], "notes": "AGENTS section 14: a guard that cannot fail is not a guard" },
    { "path": "packages/mizan-mcp/src/suggestions.ts", "change": "create", "responsibility": "NEARBY_TOOL schema, decodeNearbyArgs with caps, executeNearby", "dependsOn": ["@mizan/core", "@mizan/nearby"], "notes": "Opt-in, read-only; reuses toolError and the Suggestion union" },
    { "path": "packages/mizan-mcp/src/server.ts", "change": "modify", "responsibility": "TOOLS = [VERIFY_TOOL, NEARBY_TOOL]; route tools/call by name; createServer gains optional third `nearby` argument; SERVER_VERSION 0.1.0 -> 0.2.0", "dependsOn": ["./suggestions.ts"], "notes": "verify byte-identical; nearby result carries its own schemaVersion" },
    { "path": "packages/mizan-mcp/src/main.ts", "change": "modify", "responsibility": "Pass the NearbyRunner built from the already-open corpus handle", "dependsOn": ["./server.ts", "@mizan/nearby"], "notes": "Pre-flight exit 2 on absent corpus is unchanged and now tested" },
    { "path": "packages/mizan-mcp/package.json", "change": "modify", "responsibility": "Add @mizan/nearby dependency", "dependsOn": [], "notes": "@mizan/corpus and @mizan/verify already present" },
    { "path": "apps/cli/src/suggestions.ts", "change": "modify", "responsibility": "Re-export from @mizan/nearby", "dependsOn": ["@mizan/nearby"], "notes": "main.ts, demo.ts, render.ts and apps/cli/test/suggestions.test.ts compile unmodified" },
    { "path": "scripts/accept-customer.ts", "change": "create", "responsibility": "Step table + orchestrator for clean-clone acceptance; non-zero exit naming the failing step", "dependsOn": ["@mizan/gate"], "notes": "Lives in scripts/, covered by PackagePlan.testPaths, never by a root bun test" },
    { "path": "scripts/accept-customer.test.ts", "change": "create", "responsibility": "Self-test for the acceptance orchestrator (one step failing must name itself)", "dependsOn": [], "notes": "AGENTS section 8" },
    { "path": "docs/specs/adr/ADR-15.md", "change": "create", "responsibility": "Structural measurement coverage: deterministic round-robin spreading and the fail-closed assertion", "dependsOn": [], "notes": "Must satisfy checkAdrDocument and R12 citation resolution" },
    { "path": "docs/specs/adr/ADR-16.md", "change": "create", "responsibility": "MCP parity and backward compatibility: second opt-in tool, verify unchanged, per-tool result schemaVersion, the textDisplay exception", "dependsOn": [], "notes": "Also amends the server.ts:26 no-corpus-content comment" },
    { "path": "docs/specs/adr/ADR-17.md", "change": "create", "responsibility": "DEFERRED index decision and the recall gate that must pass before reopening it", "dependsOn": [], "notes": "Documents the ADR-08 FTS measurements; no code" },
    { "path": "docs/specs/adr/ADR-18.md", "change": "create", "responsibility": "Derived customer claims: every published figure comes from a committed artefact", "dependsOn": [], "notes": "Removes the hand-written 37%" },
    { "path": "docs/specs/measurements.md", "change": "modify", "responsibility": "Sole owner of the coverage table and latency figures, sourced from the artefact", "dependsOn": [], "notes": "Already in AUDITED_DOCUMENTS" }
  ],
  "apiInterfaces": [
    { "name": "servedCollections", "module": "packages/mizan-corpus/src/served.ts", "signature": "(attestationText: string) => Result<readonly ServedCollection[], string>", "input": { "attestationText": "string, the committed attestation.json text" }, "output": { "ok": "readonly ServedCollection[] sorted by key ascending" }, "errors": ["err(String) when the attestation is absent, not JSON, or fails AttestationSchema decoding"] },
    { "name": "bucketByCollection", "module": "scripts/eval/anchors.ts", "signature": "(rows: readonly CorpusRecord[]) => ReadonlyMap<string, readonly CorpusRecord[]>", "input": { "rows": "records in any order" }, "output": { "map": "collection key -> records sorted by id ascending" }, "errors": [] },
    { "name": "interleave", "module": "scripts/eval/anchors.ts", "signature": "(buckets: ReadonlyMap<string, readonly CorpusRecord[]>) => readonly CorpusRecord[]", "input": { "buckets": "from bucketByCollection" }, "output": { "rows": "round-robin across collections, collection keys ascending" }, "errors": [] },
    { "name": "spreadAcrossCollections", "module": "scripts/eval/anchors.ts", "signature": "(rows: readonly CorpusRecord[], count: number) => readonly CorpusRecord[]", "input": { "rows": "the whole snapshot", "count": "how many anchors a class needs" }, "output": { "rows": "exactly count rows, per-collection share = ceil/floor of count/collections" }, "errors": [] },
    { "name": "checkMeasurementCoverage", "module": "packages/mizan-gate/src/docs-coverage.ts", "signature": "(documentText: string, file: string, figures: Readonly<Record<string, number | string>>, served: ReadonlySet<string>) => readonly DocsClaim[]", "input": { "documentText": "an audited document", "figures": "top-level entries of data/benchmark/vs-search.json", "served": "attestation collectionCounts keys" }, "output": { "claims": "rule id measurement-coverage-unbacked or measurement-coverage-overstated" }, "errors": ["skipped when the artefact is absent, mirroring checkEvalBreadth's posture"] },
    { "name": "suggestionFor", "module": "packages/mizan-nearby/src/compose.ts", "signature": "(db: Database, quote: string, collection?: string | null) => SuggestionBlock | null", "input": { "db": "readonly corpus handle", "quote": "raw quote, folded once by the scan", "collection": "cited collection or null to widen to the snapshot" }, "output": { "block": "SuggestionBlock, or null when there is no quote to be near" }, "errors": ["state unavailable on scan or record read failure, and on any unexpected throw (passForClaim catch)"] },
    { "name": "suggestionsFor", "module": "packages/mizan-nearby/src/compose.ts", "signature": "(db: Database, claims: readonly Claim[], verdicts: readonly ClaimVerdict[]) => readonly (SuggestionBlock | null)[]", "input": { "claims": "positional", "verdicts": "positional" }, "output": { "blocks": "one entry per claim; null unless the verdict is rejected" }, "errors": ["never throws; one claim's failure degrades that claim to unavailable"] },
    { "name": "decodeNearbyArgs", "module": "packages/mizan-mcp/src/suggestions.ts", "signature": "(params: unknown) => { quote: string; collection: string | null } | { error: string }", "input": { "params": "untrusted JSON-RPC arguments" }, "output": { "decoded": "quote and optional collection" }, "errors": ["invalid_arguments on a missing/oversized quote, an oversized collection, topK above MAX_NEARBY_TOP_K, or a wrong-typed field"] },
    { "name": "executeNearby", "module": "packages/mizan-mcp/src/suggestions.ts", "signature": "(runner: NearbyRunner, params: unknown, startedAt: number, budgetMs: number) => McpToolResult", "input": { "runner": "injected composition, so no Database is needed in tests" }, "output": { "content": "JSON text of { schemaVersion: '1', ...Suggestion } with no verdict, matchStrength or textMatch key" }, "errors": ["invalid_arguments", "nearby_unavailable", "corpus_unavailable, all as isError tool results"] },
    { "name": "runAcceptance", "module": "scripts/accept-customer.ts", "signature": "(root: string, steps: readonly AcceptStep[], run: StepRunner) => Result<AcceptReport, string>", "input": { "steps": "data: name, command, budgetMs" }, "output": { "report": "per-step ok/detail plus the aggregate" }, "errors": ["non-zero exit naming the first failing step"] }
  ],
  "dataModels": [
    { "name": "ServedCollection", "location": "packages/mizan-corpus/src/served.ts", "shape": "{ key: string; recordCount: number }", "source": "attestation.collectionCounts", "notes": "No migration; attestation is already committed and is the source R15/R18 use" },
    { "name": "SuggestionCoverage", "location": "scripts/eval/suggest-coverage.ts (harness-local)", "shape": "{ collection: string; cases: number; measured: number; scannedRecords: number }", "source": "measured per run", "notes": "Flattened into suggestionCoverage* keys on record; never nested" },
    { "name": "vs-search.json coverage keys", "location": "data/benchmark/vs-search.json", "shape": "suggestionCoverageMeasuredCollections, suggestionCoverageUnmeasuredCollections, suggestionCoverageMeasuredRecords, suggestionCoverageUnmeasuredRecords, suggestionCoverageSharePercent (numbers); suggestionCoverageCollections (string); suggestionCoverageCases<Key> (number per served collection)", "source": "written only by recordFigures", "notes": "Must stay top level; readFigures ignores nested values, which would make R10/R21 permanently green" },
    { "name": "NearbyResult envelope", "location": "packages/mizan-mcp/src/suggestions.ts", "shape": "{ schemaVersion: '1'; state: 'candidates' | 'no_candidates' | 'unavailable'; considered?: number; scope?: SuggestionScope; quoteChars?: number; candidates?: NearbyRecord[] }", "source": "the existing Suggestion union", "notes": "schemaVersion is per tool, so verify keeps its exact existing payload and verify byte-identity holds" },
    { "name": "NearbyText", "location": "packages/mizan-nearby/src/compose.ts", "shape": "{ recordId: string; textDisplay: string; textMatch: string }", "source": "moved unchanged", "notes": "textMatch is never serialised by the MCP adapter" },
    { "name": "AcceptStep / AcceptReport", "location": "scripts/accept-customer.ts", "shape": "AcceptStep { name, command: readonly string[], budgetMs }; AcceptReport { steps: readonly { name, ok, detail }[]; ok: boolean }", "source": "new", "notes": "Steps as data so the mapping is testable without spawning anything" }
  ],
  "testingStrategy": {
    "unit": [
      "interleave / spreadAcrossCollections: determinism, id-ascending stability, exact count, per-collection share",
      "servedCollections: absent, non-JSON, truncated, and valid attestation",
      "checkMeasurementCoverage: planted 'measured all six collections' and planted '37%' violations",
      "decodeNearbyArgs: every cap at boundary, wrong types, empty quote"
    ],
    "integration": [
      "apps/cli/test/suggestions.test.ts passes unmodified through the re-export",
      "MCP tools/list returns verify first plus nearby_quotes; both dispatch; TOOLS[0] unchanged",
      "build:eval -> eval:suggestions -> check:docs -> bun run ci in that order"
    ],
    "compatibility": [
      "executeVerify / decodeVerifyArgs / VERIFY_TOOL / MAX_CITATIONS_PER_* produce byte-identical output, asserted from a golden response rather than by inspection",
      "G-6.5 and G-7 verdict closure re-run green with @mizan/nearby present"
    ],
    "security": [
      "no verdict, matchStrength or badge key in the nearby payload",
      "textMatch absent from every serialised form",
      "a 10 kB quote and topK above MAX_NEARBY_TOP_K are refused",
      "clean clone: MIZAN_CORPUS_PATH to an empty temp dir yields exit 2, named reason on stderr, zero stdout lines"
    ],
    "performance": [
      "eval:suggestions p50/p95/max through the existing harness and the 1.5x tolerance band",
      "nearby_quotes single-scan cost asserted inside REQUEST_TIMEOUT_MS",
      "<50 ms stays documented as unmet"
    ],
    "gate_discipline": "No new gate; GATE_IDS unchanged; every new rule carries a planted-violation self-test; bun test only from a package directory",
    "targets": "New modules: 100% branch coverage on the failure paths. No coverage regression in any existing package."
  },
  "office_auto_approve": {
    "confidence": 0.74,
    "evidence": "Every file path, symbol, script name, cap, exit code, gate id and figure cited here was read directly from the repository this session: build.ts:180-206 mainAnchors/buildMainClasses prefix slicing; anchors.ts export list; suggest-coverage.ts figures/recordFigures flat-key constraint; docs-value-latency.ts as the extension precedent; docs-check.ts AUDITED_DOCUMENTS and servedCollections wiring; docs-artifacts.ts R6 and docs-corpus.ts R18 for the rule shape; server.ts verify tool, caps and createServer signature; mcp main.ts exit codes0/2/3; corpus candidates.ts Result-shaped errors; verify package.json single dependency. Distributions were computed from the committed artefacts (redteam 40 =22/16/2/0/0/0; golden 200 = 63/31/25/25/20/16/20 empty) and reconciled against attestation collectionCounts (27234 total). Remaining uncertainty is scope-level, not factual: the '37%' in the supplied spec is arithmetically incomplete (Nasai is also unmeasured, making the real unmeasured share 58.0%) and must be resolved with the CEO before any figure ships; the suggestion corpus-text exception for MCP is a deliberate deviation from the current server.ts header and needs sign-off; and the red-team case-count change may interact with ADJUDICATION_TARGET = 66, which I could not fully verify without reading adjudication-loader.ts in full."
  }
}
```