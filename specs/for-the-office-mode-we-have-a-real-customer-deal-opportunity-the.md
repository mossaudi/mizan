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
(no architecture)