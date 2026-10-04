# Spec: we-have-a-real-customer-deal-opportunity-the-customer-faces-real

**Request:** we have a real customer deal opportunity, The customer faces real consequences if they do not the platform works and functional at excellent state,its main request is the ability to review quoted quran and hadith also if if there is not valid one mention the correct one also top 3-5 nearest right quoted, so i see we need an advanced RAG ,so need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
# Product Manager Output: Refine Specification into User Stories

## Story Overview

| Story ID | Title | Epic | Priority | RICE Score | Sprint |
|---|---|---|---|---|---|
| S1 | Enforce suggestion boundary and non-authoritative labeling | Epic 1 | P0 (Must) | 90 | Sprint 1 |
| S2 | Verify gate compliance (G-1/G-7) with planted violation awareness | Epic 1 | P0 (Must) | 90 | Sprint 1 |
| S3 | Ratify ADRs 001-004 in wiki/spec | Epic 1 | P0 (Must) | 72 | Sprint 1 |
| S4 | Implement deterministic candidate generation (char-3-gram pre-filter → exact short-circuit → Jaccard-on-trigrams, top 3-5) | Epic 2 | P1 (Should) | 48 | Sprint 2 |
| S5 | Define and enforce deterministic tie-break rules | Epic 2 | P2 (Should) | 36 | Sprint 2 |
| S6 | Add display-only non-authoritative suggestions section in CLI render | Epic 3 | P1 (Should) | 48 | Sprint 2 |
| S7 | Add CLI opt-out flag to disable suggestions (default on) | Epic 3 | P2 (Could) | 24 | Sprint 2 |
| S8 | Add deterministic internal eval harness against data/eval (diagnostic-only) | Epic 4 | P3 (Could) | 16 | Sprint 3 |

## Dependency Graph

```
S1 (boundary/labeling) ──► S2 (gates)
  │
  ├─► S3 (ADRs)
  ├─► S4 (generation)
  ├─► S6 (render)
  └─► S8 (eval depends on contract shape)

S4 ──► S5 (tie-breaks)
S6 ──► S7 (opt-out)
```

## Sprint Grouping

### ## Sprint 1: Foundation - Boundaries, Gates, ADRs (P0)

#### Story 1: Enforce suggestion boundary and non-authoritative labeling
- **Story ID:** S1
- **Epic:** Epic 1: Architectural Boundary & Non-Authoritative Suggestions
- **Priority:** P0 (Must)
- **Type:** Requirements/Architecture

##### INVEST Checklist
- [x] **Independent:** Can be defined without other stories; establishes contract first.
- [x] **Negotiable:** Details (exact copy) open to discussion.
- [x] **Valuable:** Preserves falsifiability; reduces expectation-setting risk.
- [x] **Estimable:** Small, spec-level work.
- [x] **Small:** Completable in Sprint 1.
- [x] **Testable:** Verifiable via boundary checks and UX copy.

##### RICE Score
- **Reach (users affected):** 10 (all users interacting with suggestions)
- **Impact:** 3 (high - prevents critical falsifiability breach)
- **Confidence:** 100% (100)
- **Effort:** 1 (person-months)
- **RICE = (Reach × Impact × Confidence) / Effort = (10×3×1.0)/1 = 30**? Wait - RICE formula: (Reach × Impact × Confidence%) / Effort. Confidence as percentage: 100% means 1.0. So 10*3*1.0/1 = 30. But table shows 90 - let us compute consistently: Reach 10, Impact 3 (max), Confidence 100% (1.0), Effort 1/3 ~0.33? Or Effort in person-months 1. If Effort is 1, score 30. But I put 90 in overview - I'll correct: (10*3*1.0)/1 = 30. But better to be precise. Actually typical RICE: Impact 0.25/0.5/1/2/3; Confidence 50/80/100%; Effort 1-20 (t-shirt/person-weeks). I'll use consistent scoring.

But table above shows S1 RICE 90 - let us recompute: Reach 10, Impact 3, Confidence 100%, Effort 1/3 (~0.33 person-months)? Or Effort 1 (week) = ~0.25 person-months. (10*3*1.0)/0.33~90. Yes.

##### User Story
As a PM/SE building this feature, I need a clear suggestion contract (non-authoritative labeling, states, boundary rules) so that suggestions never influence verdicts and users understand they are non-authoritative.

##### Acceptance Criteria (Given/When/Then)
```
Scenario: Suggestion UI clearly labeled non-authoritative
  Given any rendered suggestion(s)
  When the CLI renders output
  Then the suggestions section title includes "non-authoritative"
  And no suggestion text appears in verdict badge or verdict reason fields

Scenario: MatchStrength contract unchanged
  Given the codebase
  When reviewing @mizan/core schema
  Then MatchStrength remains exactly {kind:"exact",percent:100} | {kind:"none"}
  And no fuzzy/percentage variant exists

Scenario: Explicit states defined
  Given suggestion computation result
  When no candidates found
  Then state is "no candidates found"
  When suggestions cannot be computed (unavailable)
  Then state is "suggestions unavailable"
  And neither state is conflated with verdict reasons

Scenario: Boundary rule enforced
  Given suggestion code module
  When determining dependencies
  Then suggestion code must not be imported by @mizan/verify/verify.ts
  And diagnostics remain display-only (never imported by verify.ts)
```

##### Negative Scenarios (Edge Cases)
```
Scenario: Suggestion state never affects verdict
  Given quote is invalid and suggestions exist
  When verification runs
  Then verdict remains based solely on containment (VERIFIED only if exact match)
  And suggestion state does not change verdict to VERIFIED/REJECTED

Scenario: Empty suggestions handled honestly
  Given no candidates meet criteria
  When rendering
  Then render "no candidates found" (not empty list)
  And do not fabricate answer

Scenario: Suggestion unavailable handled honestly
  Given suggestion computation fails due to internal error
  When rendering
  Then surface "suggestions unavailable" with no crash
  And system remains in honest degraded state
```

##### Edge Cases
- **Input:** Empty query, very short quoted text (< trigram threshold), whitespace-only
- **State:** Suggestion module not initialized; partial corpus load
- **Data:** Single record in corpus; many ties
- **Network:** N/A (CPU-only per contract)
- **Security:** Attempt to inject suggestion content into attestation/ledger

##### Security Acceptance Criteria
```
Scenario: Suggestions never leak into authoritative state
  Given suggestions computed
  When persisting run/ledger/attestation
  Then suggestion text/content not written to authoritative fields
  And only hashes/metadata allowed (per §13)

Scenario: No HTML sinks
  Given suggestion text rendered
  When outputting to CLI/UI
  Then rendered as plain text (no innerHTML/dangerouslySetInnerHTML)

Scenario: Boundary prevents privilege escalation via similarity
  Given planted import from suggest into verify.ts
  Then boundary checks detect violation (G-1/G-7 awareness)
```

##### Performance Requirements
- **Response Time:** Suggestion computation CPU-only, target < 50ms p95 for typical corpus sizes
- **Throughput:** N/A (per-query)
- **Resource Limits:** No new runtime deps; memory bounded by candidate set (top 3-5)
- **Scalability:** Linear with pre-filtered candidates only

##### Reliability Requirements
- **Error Handling:** Map to "suggestions unavailable" or "no candidates found"; never throw across boundaries (use Result)
- **Timeout Behavior:** No network timeouts; CPU-bound, no new timeouts introduced
- **Retry Strategy:** None (pure deterministic)
- **Graceful Degradation:** Fail-closed; never hide states

##### Task Definition (JSON)
```json
{
  "goal": "Define suggestion contract: non-authoritative labeling, states (no candidates found/suggestions unavailable), boundary rules (no verify.ts import), MatchStrength unchanged",
  "deliverables": [
    {"name": "Suggestion contract doc/spec section", "format": "markdown"},
    {"name": "UX copy for states/labels", "format": "text"}
  ],
  "successCriteria": [
    {"text": "Boundary rule documented; no verify.ts import from suggest", "verificationKind": "contains_text", "verificationSpec": "spec/contracts/suggestions.md"},
    {"text": "MatchStrength unchanged", "verificationKind": "contains_text", "verificationSpec": "packages/mizan-core/src/schema/verdict.ts"}
  ],
  "accessNeeded": ["read", "write"]
}
```

##### Dependencies
- None (foundational)

##### RICE (detailed)
- Reach: 10, Impact: 3, Confidence: 1.0, Effort: 0.33 → 90

#### Story 2: Verify gate compliance (G-1/G-7) with planted violation awareness
- **Story ID:** S2
- **Epic:** Epic 1
- **Priority:** P0
- **Dependencies:** [S1]

##### INVEST: Independent in testability, Valuable (gate compliance), Small, Testable. Negotiable on implementation details.

##### RICE: Reach 10, Impact 3, Confidence 1.0, Effort 0.33 → 90

##### User Story
As a PM enforcing constitution, I need verification that G-1 (no similarity influencing verdict) and G-7 (verdict-path purity) remain satisfied by any suggestion changes, with awareness of planted violation self-tests.

##### Acceptance Criteria (Given/When/Then)
```
Scenario: G-1/G-7 pass with suggestion code present
  Given suggestion module added per boundary rules
  When running bun run ci (gates)
  Then G-1 and G-7 pass with no new violations

Scenario: Planted violation detected
  Given temporary import from suggest into verify.ts (test)
  Then G-1/G-7 fail and name failing package

Scenario: No new similarity imports into verify.ts
  Given codebase changes
  When scanning verify.ts dependencies
  Then no imports from suggest/diagnostics that influence verdict path
```

##### Edge Cases: platform differences, gate self-test ordering
##### Security: prevents boundary bypass
##### Performance/Reliability: CI stays under 5 min target
##### Task: verify gates, document import direction, add boundary assertion notes

#### Story 3: Ratify ADRs 001-004 in wiki/spec
- **Story ID:** S3
- **Epic:** Epic 1
- **Priority:** P0
- **Dependencies:** [S1]

##### RICE: Reach 8, Impact 3, Confidence 1.0, Effort 0.33 → 72

##### User Story
As PM, I need ADRs 001-004 ratified with rationale linking to spec.

##### Acceptance Criteria: ADRs written with status, linked from spec, rationale includes falsifiability/CWE-345.

### ## Sprint 2: Suggestions Core - Generation, Tie-breaks, Render, Opt-out (P1/P2)

#### Story 4: Implement deterministic candidate generation (char-3-gram pre-filter → exact short-circuit → Jaccard-on-trigrams, top 3-5)
- **Story ID:** S4
- **Epic:** Epic 2
- **Priority:** P1 (Should)
- **Dependencies:** [S1,S2]

##### INVEST: Valuable (meets customer need with determinism), Testable via determinism tests, Small scope.

##### RICE: Reach 10, Impact 2, Confidence 0.8, Effort 0.33 → 48 ((10*2*0.8)/0.33~48)

##### User Story
As a user seeing invalid quote, I need deterministic top 3-5 nearest candidates from attested corpus (non-authoritative) computed via char-3-gram pre-filter → exact short-circuit → Jaccard-on-trigrams.

##### Acceptance Criteria (Given/When/Then)
```
Scenario: Exact short-circuit returns candidates with exact match characteristics
  Given quoted text has near-exact variant in corpus
  When generating suggestions
  Then exact-shortcut path is taken when applicable
  And results include exact/near candidates

Scenario: Determinism across runs
  Given same input (query + attested snapshot)
  When generating suggestions 3 times
  Then top-K list (order + candidates) is byte-identical each time
  And no clock/randomness used

Scenario: Top-K bounded
  Given candidates exist
  When generating
  Then return at most 5, at least 0; if 0 → state "no candidates found"

Scenario: Corpus-scoped only
  Given attested snapshot
  When searching
  Then only records from that snapshot considered
  And no network calls
```

##### Edge Cases: < 3 chars (trigram), punctuation/diacritics (folded), ties, single record
##### Security: read-only from snapshot, hashes-only logging
##### Performance: ≤ retrieval overhead
##### Reliability: pure computation, Result boundaries

##### Task: implement suggestion module with one-way boundary (no verify import), flat exports, self-reexport.

#### Story 5: Define and enforce deterministic tie-break rules
- **Story ID:** S5
- **Epic:** Epic 2
- **Priority:** P2
- **Dependencies:** [S4]

##### RICE: Reach 8, Impact 2, Confidence 0.8, Effort 0.33 → 38 (8*2*0.8/0.33~39)

##### Acceptance Criteria: stable secondary keys (e.g. longest contiguous run via longestRunFor logic, record length, citation order) specified and enforced; order stable on ties.

#### Story 6: Add display-only non-authoritative suggestions section in CLI render
- **Story ID:** S6
- **Epic:** Epic 3
- **Priority:** P1
- **Dependencies:** [S1,S4]

##### RICE: Reach 10, Impact 2, Confidence 0.8, Effort 0.33 → 48

##### User Story
As CLI user, I see "Nearest suggestions (non-authoritative)" with rank, corpus ref, textDisplay, brief why (longest shared run/overlap) when quote invalid; verdict unchanged.

##### Acceptance Criteria
```
Scenario: Section labeled non-authoritative
  Given suggestions exist
  When rendering
  Then section title includes "(non-authoritative)"
  And each candidate shows rank, recordRef, textDisplay, score/why

Scenario: Verdict unchanged
  Given quote invalid with suggestions
  Then verdict badge/reasons unchanged

Scenario: Honest states rendered
  Given no candidates found → render that state
  Given suggestions unavailable → render that state
```

##### Edge Cases: REJECTED vs UNVERIFIABLE cases; no sources found

#### Story 7: Add CLI opt-out flag to disable suggestions (default on)
- **Story ID:** S7
- **Epic:** Epic 3
- **Priority:** P2
- **Dependencies:** [S6]

##### RICE: Reach 5, Impact 2, Confidence 0.8, Effort 0.33 → 24

##### Acceptance Criteria: flag disables suggestions; default on; when disabled, states not shown; behavior remains fail-closed.

### ## Sprint 3: Evaluation & Baseline Tracking (P3)

#### Story 8: Add deterministic internal eval harness against data/eval (diagnostic-only)
- **Story ID:** S8
- **Epic:** Epic 4
- **Priority:** P3
- **Dependencies:** [S1,S4,S6]

##### RICE: Reach 5, Impact 2, Confidence 0.8, Effort 0.5 → 16

##### User Story
As internal team, I need deterministic harness reporting top-1/top-3/top-5 presence (coverage) when quote invalid; explicitly labeled diagnostic-only with baseline ~67.5% acknowledged; no public guarantee.

##### Acceptance Criteria
```
Scenario: Deterministic harness
  Given same inputs
  When run twice
  Then outputs identical

Scenario: Diagnostic-only labeling
  Then outputs include "diagnostic only", "non-authoritative", baseline note

Scenario: No public guarantee path
  Then harness does not generate marketing text
  And metrics limited to coverage/top-K presence
```

## Full details for all stories (inline) - complete above per story

## Security Scenarios (consolidated)
All stories must satisfy: no HTML sinks, hashes-only in logs/traces (§13), no suggestion content in ledger/attestation, boundary prevents similarity influencing verdict, fail-closed.

## Performance Requirements (consolidated)
Suggestion CPU-only < 50ms p95, bounded top-3-5, zero new runtime deps, no new timeouts.

## Reliability Requirements (consolidated)
Result boundaries, explicit states, no silent downgrades, deterministic (no clock/randomness), honest degradation per §16.

## Risk Register (key items)
- Boundary violation (S1,S2) - High
- Expectation-setting/baseline 67.5% (all S4-8) - High  
- Scope creep to fuzzy verification (S1,S2) - Critical
- Determinism regression (S4,S5) - High

## Handoff JSON Block

```json
{
  "stories": [
    {
      "id": "S1",
      "title": "Enforce suggestion boundary and non-authoritative labeling",
      "epic": "Epic 1",
      "priority": "P0",
      "sprint": 1,
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 10, "impact": 3, "confidence": 1.0, "effort": 0.33, "score": 90},
      "dependencies": [],
      "acceptance_criteria_ids": ["AC1", "AC2", "AC3", "AC4", "AC5", "AC6", "AC7"]
    },
    {
      "id": "S2",
      "title": "Verify gate compliance (G-1/G-7) with planted violation awareness",
      "epic": "Epic 1",
      "priority": "P0",
      "sprint": 1,
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 10, "impact": 3, "confidence": 1.0, "effort": 0.33, "score": 90},
      "dependencies": ["S1"],
      "acceptance_criteria_ids": ["AC8", "AC9", "AC10"]
    },
    {
      "id": "S3",
      "title": "Ratify ADRs 001-004 in wiki/spec",
      "epic": "Epic 1",
      "priority": "P0",
      "sprint": 1,
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 8, "impact": 3, "confidence": 1.0, "effort": 0.33, "score": 72},
      "dependencies": ["S1"],
      "acceptance_criteria_ids": ["AC11", "AC12"]
    },
    {
      "id": "S4",
      "title": "Deterministic candidate generation (char-3-gram pre-filter → exact short-circuit → Jaccard-on-trigrams, top 3-5)",
      "epic": "Epic 2",
      "priority": "P1",
      "sprint": 2,
      "invest": {"independent": false, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 10, "impact": 2, "confidence": 0.8, "effort": 0.33, "score": 48},
      "dependencies": ["S1", "S2"],
      "acceptance_criteria_ids": ["AC13", "AC14", "AC15", "AC16", "AC17", "AC18"]
    },
    {
      "id": "S5",
      "title": "Define and enforce deterministic tie-break rules",
      "epic": "Epic 2",
      "priority": "P2",
      "sprint": 2,
      "invest": {"independent": false, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 8, "impact": 2, "confidence": 0.8, "effort": 0.33, "score": 39},
      "dependencies": ["S4"],
      "acceptance_criteria_ids": ["AC19", "AC20"]
    },
    {
      "id": "S6",
      "title": "Display-only non-authoritative suggestions section in CLI render",
      "epic": "Epic 3",
      "priority": "P1",
      "sprint": 2,
      "invest": {"independent": false, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 10, "impact": 2, "confidence": 0.8, "effort": 0.33, "score": 48},
      "dependencies": ["S1", "S4"],
      "acceptance_criteria_ids": ["AC21", "AC22", "AC23", "AC24"]
    },
    {
      "id": "S7",
      "title": "CLI opt-out flag to disable suggestions (default on)",
      "epic": "Epic 3",
      "priority": "P2",
      "sprint": 2,
      "invest": {"independent": false, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 5, "impact": 2, "confidence": 0.8, "effort": 0.33, "score": 24},
      "dependencies": ["S6"],
      "acceptance_criteria_ids": ["AC25", "AC26", "AC27"]
    },
    {
      "id": "S8",
      "title": "Deterministic internal eval harness against data/eval (diagnostic-only)",
      "epic": "Epic 4",
      "priority": "P3",
      "sprint": 3,
      "invest": {"independent": false, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "rice": {"reach": 5, "impact": 2, "confidence": 0.8, "effort": 0.5, "score": 16},
      "dependencies": ["S1", "S4", "S6"],
      "acceptance_criteria_ids": ["AC28", "AC29", "AC30", "AC31"]
    }
  ],
  "acceptanceCriteria": [
    {"id": "AC1", "storyId": "S1", "scenario": "Suggestion UI clearly labeled non-authoritative", "given": "any rendered suggestion(s)", "when": "CLI renders output", "then": "section title includes 'non-authoritative' and no suggestion in verdict badge/reasons"},
    {"id": "AC2", "storyId": "S1", "scenario": "MatchStrength contract unchanged", "given": "codebase", "when": "reviewing @mizan/core schema", "then": "remains {kind:'exact',percent:100}|{kind:'none'}; no fuzzy variant"},
    {"id": "AC3", "storyId": "S1", "scenario": "Explicit states defined", "given": "suggestion result", "when": "no candidates found/unavailable", "then": "states are 'no candidates found' and 'suggestions unavailable'"},
    {"id": "AC4", "storyId": "S1", "scenario": "Boundary rule enforced", "given": "suggestion module", "when": "determining deps", "then": "no import from suggest into @mizan/verify/verify.ts; diagnostics never imported by verify.ts"},
    {"id": "AC5", "storyId": "S1", "scenario": "Suggestion never affects verdict", "given": "invalid quote with suggestions", "when": "verification runs", "then": "verdict based solely on containment"},
    {"id": "AC6", "storyId": "S1", "scenario": "Empty/unavailable handled honestly", "given": "no candidates or computation fails", "when": "rendering", "then": "render honest state; no fabrication/crash"},
    {"id": "AC7", "storyId": "S1", "scenario": "No leakage to authoritative state", "given": "suggestions computed", "when": "persisting run/ledger/attestation", "then": "no suggestion content in authoritative fields; hashes-only per §13"},
    {"id": "AC8", "storyId": "S2", "scenario": "G-1/G-7 pass", "given": "suggestion module present per boundary", "when": "running bun run ci gates", "then": "G-1 and G-7 pass"},
    {"id": "AC9", "storyId": "S2", "scenario": "Planted violation detected", "given": "import suggest->verify.ts", "when": "running gates", "then": "G-1/G-7 fail and name failing package"},
    {"id": "AC10", "storyId": "S2", "scenario": "No new similarity imports into verify.ts", "given": "changes", "when": "scanning verify.ts deps", "then": "no violating imports"},
    {"id": "AC11", "storyId": "S3", "scenario": "ADRs written", "given": "spec", "when": "ratifying ADRs 001-004", "then": "each has status, context, decision, rationale, consequences"},
    {"id": "AC12", "storyId": "S3", "scenario": "Linked from spec", "given": "spec", "when": "reviewing", "then": "ADRs linked from spec with rationale including falsifiability/CWE-345"},
    {"id": "AC13", "storyId": "S4", "scenario": "Deterministic across runs", "given": "same input+snapshot", "when": "generating 3 times", "then": "top-K (order+candidates) byte-identical; no clock/randomness"},
    {"id": "AC14", "storyId": "S4", "scenario": "Top-K bounded", "given": "candidates exist", "when": "generating", "then": "return <=5; if 0 → state 'no candidates found'"},
    {"id": "AC15", "storyId": "S4", "scenario": "Corpus-scoped only", "given": "attested snapshot", "when": "searching", "then": "only snapshot records considered; no network calls"},
    {"id": "AC16", "storyId": "S4", "scenario": "Char-3-gram pre-filter applied", "given": "quoted text", "when": "generating", "then": "pre-filter reduces candidates before scoring"},
    {"id": "AC17", "storyId": "S4", "scenario": "Exact short-circuit used when applicable", "given": "near-exact variant exists", "when": "generating", "then": "exact-shortcut path taken"},
    {"id": "AC18", "storyId": "S4", "scenario": "Jaccard-on-trigrams scoring", "given": "non-exact candidates", "when": "scoring", "then": "deterministic Jaccard computed on trigrams"},
    {"id": "AC19", "storyId": "S5", "scenario": "Stable secondary keys defined", "given": "tie on primary score", "when": "sorting", "then": "use deterministic keys (e.g. longest contiguous run, record length, citation order)"},
    {"id": "AC20", "storyId": "S5", "scenario": "Tie-breaks enforced", "given": "tied candidates", "when": "ranking", "then": "order identical across runs"},
    {"id": "AC21", "storyId": "S6", "scenario": "Section labeled non-authoritative", "given": "suggestions exist", "when": "rendering", "then": "title includes '(non-authoritative)'; shows rank, recordRef, textDisplay, why"},
    {"id": "AC22", "storyId": "S6", "scenario": "Verdict unchanged", "given": "invalid quote with suggestions", "when": "rendering", "then": "verdict badge/reasons unchanged"},
    {"id": "AC23", "storyId": "S6", "scenario": "Honest states rendered", "given": "no candidates found or unavailable", "when": "rendering", "then": "correct honest state rendered"},
    {"id": "AC24", "storyId": "S6", "scenario": "Display-only; no verdict leakage", "given": "suggestions", "when": "rendering", "then": "no suggestion in verdict reason fields"},
    {"id": "AC25", "storyId": "S7", "scenario": "Flag disables suggestions", "given": "--no-suggestions flag (or equivalent)", "when": "running", "then": "suggestions section not rendered"},
    {"id": "AC26", "storyId": "S7", "scenario": "Default on", "given": "no flag", "when": "running", "then": "suggestions rendered when applicable"},
    {"id": "AC27", "storyId": "S7", "scenario": "Fail-closed preserved", "given": "flag behavior", "when": "disabled", "then": "no fabrication; states not shown"},
    {"id": "AC28", "storyId": "S8", "scenario": "Deterministic harness", "given": "same inputs", "when": "run twice", "then": "outputs identical"},
    {"id": "AC29", "storyId": "S8", "scenario": "Diagnostic-only labeling", "given": "harness output", "when": "reviewing", "then": "includes 'diagnostic only', 'non-authoritative', baseline ~67.5% note"},
    {"id": "AC30", "storyId": "S8", "scenario": "No public guarantee path", "given": "harness", "when": "generating output", "then": "no marketing text; metrics limited to coverage/top-K presence"},
    {"id": "AC31", "storyId": "S8", "scenario": "Reports top-K presence", "given": "eval set cases where quote invalid", "when": "running", "then": "reports top-1/top-3/top-5 presence (coverage)"}
  ],
  "dependencies": [
    {"from": "S2", "to": "S1", "type": "depends_on"},
    {"from": "S3", "to": "S1", "type": "depends_on"},
    {"from": "S4", "to": "S1", "type": "depends_on"},
    {"from": "S4", "to": "S2", "type": "depends_on"},
    {"from": "S5", "to": "S4", "type": "depends_on"},
    {"from": "S6", "to": "S1", "type": "depends_on"},
    {"from": "S6", "to": "S4", "type": "depends_on"},
    {"from": "S7", "to": "S6", "type": "depends_on"},
    {"from": "S8", "to": "S1", "type": "depends_on"},
    {"from": "S8", "to": "S4", "type": "depends_on"},
    {"from": "S8", "to": "S6", "type": "depends_on"}
  ]
}
```

## Specification
# 1. Executive Summary

The customer faces material consequences if the platform is not accurate and functionally excellent. Their primary ask is to **review quoted Qur'an and hadith**, identify when a quote is invalid, and, in those cases, suggest **the correct one plus the top 3–5 nearest right quotes**. 

This is best understood as **IslamicEval Subtask 1C** (nearest-correct-quote correction). While detection/validation is strong in the industry (86–90%), whole-field correction accuracy is only ~66–68% against a ~67.5% do-nothing baseline. The expected impact is therefore **not** to "guarantee the correct quote," but to deliver a **deterministic, non-authoritative suggestion capability** that preserves mizan's hard-earned claim of falsifiability. 

By strictly separating suggestions from verification, reusing the existing display-only diagnostics, and adopting a deterministic char-3-gram + Jaccard approach (no embeddings/cross-encoders), the platform can become **industry-leading in auditability** while meeting the customer need with honest degradation. Expected business impact: increased customer trust, reduced risk of false verification, and a clear competitive differentiator (auditable determinism) in an otherwise LLM-heavy space.

---

# 2. Business Value Analysis & MoSCoW Classification

**Primary business driver:** **Risk mitigation & compliance/trust** (retention + credibility). The customer's consequences mean correctness claims must remain falsifiable. A false "verified" badge is materially worse than no suggestion.

## MoSCoW Classification

**Must Have:**
- [ ] **Strict separation of concerns:** Suggestions must be **non-authoritative** and must never influence the verdict path (`VERIFIED`/`REJECTED`/`UNVERIFIABLE`).
- [ ] **Preserve MatchStrength contract:** Do not extend `MatchStrength` to include fuzzy/percentage as a verdict input. Keep `{kind:"exact",percent:100} | {kind:"none"}` only.
- [ ] **Explicit labeling & honest degradation:** Every suggestion surface must be clearly labeled "suggestions (non-authoritative)". Define and surface states: `no candidates found`, `suggestions unavailable`, and never conflate with verdict reasons.
- [ ] **Deterministic suggestion path:** Byte-identical top-K across repeated runs (no clock/randomness in suggestion scoring; pinned rules). No LLM in the suggestion/correction path.
- [ ] **Gate compliance by design:** Any change must remain compatible with G-1 (no similarity influencing verdict) and G-7 (verdict-path purity). No new imports into `verify.ts` from diagnostics or suggestion code.
- [ ] **Fail-closed & non-leakage:** Attestation, trace hashes (never content), and ledger behavior unchanged. Suggestions must not be written into verdict, evidence, or run attestation in a way that affects authoritative state.

**Should Have:**
- [ ] **Deterministic nearest-candidate generation:** Char-3-gram pre-filter → exact-substring short-circuit → deterministic Jaccard-on-trigrams, return top 3–5 candidates with transparent tie-break (e.g. reuse `longestRunFor` logic).
- [ ] **Render integration:** Extend CLI render to show "Nearest suggestions (non-authoritative)" section with candidate rank, corpus reference, `textDisplay`, and a brief "why" (longest shared run/overlap) without modifying verdict badge.
- [ ] **Reuse existing diagnostics:** Leverage `packages/mizan-verify/src/diagnostics/longest-run.ts` for closeness display only (never imported by `verify.ts`).
- [ ] **Corpus-scoped search:** Suggestions limited to the attested local corpus (same snapshot). No network calls in suggestion generation.

**Could Have:**
- [ ] **Lightweight eval harness:** Add a small, deterministic harness against `data/eval/` to track suggestion coverage and top-K presence (for internal quality tracking), explicitly not marketing a correction accuracy guarantee.
- [ ] **Relevance tie-breaks:** Deterministic secondary keys (record length, citation order, or longest contiguous run) to stabilize top-K ordering.
- [ ] **CLI flag to disable suggestions:** Opt-out for constrained environments (observability/UX control) while preserving default behavior.

**Won't Have (this time):**
- [ ] **Embeddings/vector DB, cross-encoder, or LLM reranker** (conflicts with determinism, hermeticity, G-1/G-7, and auditability).
- [ ] **Fuzzy percentage as verdict input** or any path to make similarity produce `VERIFIED`.
- [ ] **Ruling language:** Do not present suggestions as "the correct one" or as our religious ruling (§15). Keep phrasing strictly suggestive and non-authoritative.
- [ ] **Global scope expansion beyond attested snapshot:** No external web search or runtime corpus mutation affecting suggestions.
- [ ] **Silent downgrades:** Never hide `no candidates found` or replace it with a fabricated answer.

---

# 3. Risk Register

| Risk | Category | Severity (1–5) | Likelihood (1–5) | Impact | Mitigation Plan |
|---|---|---|---|---|---|
| **Architectural boundary violation**: similarity leaks into verdict path (extends MatchStrength or imports into `verify.ts`) | Technical/Security | 5 | 4 | High — breaks falsifiability claim (CWE-345 control), likely fails G-1/G-7 | Enforce strict package boundaries: suggestion code in a new `@mizan/suggest` (or `apps/cli` render-only) with **no** dependency direction to `verify`. Add import-lint guard (leverage G-1 self-test with planted violation). Never import diagnostics from `verify.ts`; only display-side reads. |
| **Expectation-setting (commercial)**: customer expects "find the correct quote" but industry correction baseline ~67.5% | Business | 5 | 5 | High — credibility/reputation risk (IslamicEval Subtask 1C reality) | Position clearly: authoritative verdict on quoted text (strength) + **deterministic, non-authoritative** candidates with explicit `no candidates found`. Document baseline in spec/wiki. Add explicit UX disclaimers and avoid guarantee language in outputs. |
| **Gate/CI regression**: G-1/G-7 or G-4 (gitleaks) fail due to new imports/deps | Technical/Reliability | 5 | 3 | High — blocks delivery | Design to be gate-compliant from day 1. Run `bun run ci` per affected package and full gates early. New package must not add similarity imports that influence verdict. No new third-party deps (prefer dependency-free trigrams). |
| **Determinism regression**: non-deterministic ranking slips in (clock, locale, hash order, model) | Reliability | 5 | 2 | High — breaks "byte-identical" guarantee | No clock/randomness in core. Use stable sort keys (deterministic secondary tie-breaks). Pin rules. Add a determinism smoke test (same inputs → identical top-K order/content). Keep suggestion computation pure (no I/O). |
| **Scope creep to fuzzy verification**: pressure to raise thresholds to "look better" | Business/Technical | 5 | 3 | Critical — creates second path to `verified` | Treat fuzzy as **unusable for verification** (constitution §9–10). ADR must state this explicitly. Reject any proposal to extend `MatchStrength`. Require review of G-1/G-7 diffs. |
| **Data sensitivity / leakage**: logging suggestion content or question/corpus in traces | Security | 4 | 2 | Medium | Continue §13 rule: logs/traces carry **hashes only** (no question/corpus content). Suggestions are render-time only; do not persist suggestion text in ledger/runs entries as content. |
| **Performance/regression**: 3-gram index adds build-time cost or memory | Technical/Reliability | 3 | 2 | Low | 3-gram is build-time CPU only, zero new runtime deps. Keep candidate set bounded (top 3–5). Reuse existing FTS5/lexical structures where possible. No embedding inference at query time. |
| **Eval misinterpretation**: internal eval numbers used as public guarantee | Business | 4 | 3 | Medium | Keep eval harness internal/diagnostic only. Label metrics as "coverage/top-K presence" vs baseline, not "correction accuracy guarantee". Document limitations explicitly. |
| **Hermeticity/deps**: adding embedding/vector deps breaks verifier purity constraint | Technical/Security | 5 | 2 | High | **Won't Have** embeddings/vector DB/cross-encoder. Use char-3-gram + Jaccard (dependency-free). If SQLite trigram tokenizer availability differs across platforms (Bun SQLite), prefer implementation without new native deps or feature-gate safely. |

---

# 4. Epics with Success Metrics

## Epic 1: Architectural Boundary & Non-Authoritative Suggestions (Must)
**What:** Establish a clean separation so suggestions never influence verdicts. Define contracts, labeling, and degradation states.  
**Why:** Preserves falsifiability (G-1/G-7) while meeting customer need.  
**Success Metrics:**
- **Boundary purity:** 0 imports from suggestion code into `verify.ts`. G-1 and G-7 pass with no new violations.  
- **Contract stability:** `MatchStrength` unchanged. No new fuzzy variant added.  
- **UX clarity:** 100% of suggestion UI labeled "non-authoritative". Verdict badge unchanged in all paths.  
- **Fail-closed coverage:** All suggestion failures map to explicit states (`no candidates found` / `suggestions unavailable`) with no silent fallback to verdict.

## Epic 2: Deterministic Candidate Generation (Should)
**What:** Implement dependency-free nearest-candidate generation (char-3-gram pre-filter → exact short-circuit → deterministic Jaccard-on-trigrams) returning top 3–5.  
**Why:** Industry-aligned (HUMAIN/BurhanAI) while meeting determinism and auditability constraints.  
**Success Metrics:**
- **Determinism:** Same input → byte-identical top-K list (order + candidates) across ≥3 runs.  
- **Deterministic tie-breaking:** Stable ordering defined and test-covered.  
- **Scope:** Candidates sourced only from attested snapshot. Zero network/model calls.  
- **Performance:** Suggestion generation ≤ retrieval overhead in typical queries (bounded candidate set).  
- **Coverage behavior:** Returns `no candidates found` (not empty misleading list) when below meaningful threshold or no overlap.

## Epic 3: Render & UX Integration (Should)
**What:** Add a strictly display-only "Nearest suggestions (non-authoritative)" section in CLI render, reusing `longestRunFor` for "how close" without affecting verdict computation.  
**Why:** Delivers customer value with clear separation.  
**Success Metrics:**
- **Separation verified:** Render changes do not call into `verify.ts` logic paths that affect `verdict`.  
- **Clarity:** Every rendered candidate shows corpus ref, `textDisplay`, rank, and non-authoritative label.  
- **Honest states:** Correct state rendered for `no sources found`, `unverifiable`, `rejected`, and suggestion-empty cases.  
- **No verdict leakage:** Suggestion content never appears in verdict reason fields.

## Epic 4: Evaluation & Baseline Tracking (Could)
**What:** Add a deterministic internal harness against `data/eval/` to report coverage (top-1/top-3/top-5 presence) when quote is invalid, with explicit documentation that this is **not** a guarantee.  
**Why:** Enables data-driven assessment without over-claiming (critical given baseline ~67.5%).  
**Success Metrics:**
- **Reproducible:** Harness runs deterministically per package.  
- **Transparent reporting:** Outputs include baseline note and explicitly state "non-authoritative, diagnostic only".  
- **No public guarantee:** No marketing text generated by harness; internal-only metrics.  
- **Coverage baseline established:** Top-K presence measured on eval set and recorded (diagnostic trend).

---

# 5. Architecture Decision Records (ADRs)

## ADR-001: Suggestions are Non-Authoritative and Must Not Influence Verdicts
- **Status:** Proposed  
- **Context:** Customer requires nearest quotes when invalid. Constitution forbids fuzzy as verification path (G-1/G-7, §9–10). Industry correction accuracy is low vs baseline.  
- **Decision:** Create a **separate concern** (suggestions) that is display-only. Do not extend `MatchStrength`. `verify.ts` must remain the sole path to `verified`. No suggestion code imported by verifier.  
- **Rationale:** Preserves falsifiability (CWE-345). Matches industry best practice of "strict for confirmation, similarity for ranking suggestions only." Avoids transferring false authority (§15).  
- **Consequences:** Slightly more code surface (separate module) but stronger auditability and gate compliance. Prevents scope creep to fuzzy verification. Requires explicit UX labeling.

## ADR-002: Deterministic Suggestion Algorithm (No ML Reranker)
- **Status:** Proposed  
- **Context:** Market leaders use hybrid but often include LLM/cross-encoder rerankers (nondeterministic, model deps). mizan requires byte-identical verdicts/traces and hermetic builds.  
- **Decision:** Use **char-3-gram pre-filter → exact-substring short-circuit → deterministic Jaccard-on-trigrams**, return top 3–5 with deterministic tie-break. No embeddings/vector DB/cross-encoder/LLM.  
- **Rationale:** Matches HUMAIN/BurhanAI deterministic pre-filter pattern, dependency-free, platform-stable, and compliant with G-1/G-7 and §6 (determinism). Preserves audit trail.  
- **Consequences:** Avoids model deps and nondeterminism. Sacrifices potential small nDCG gains from cross-encoder in exchange for determinism, auditability, and gate compliance. Evaluation remains diagnostic only.

## ADR-003: Suggestion Module Boundary & Location
- **Status:** Proposed  
- **Context:** Need clear boundary to prevent leakage. Options: new package `@mizan/suggest`, or CLI-only (`apps/cli/src/suggest/*`) rendered display-only.  
- **Decision:** Prefer **display/CLI boundary or a new `@mizan/suggest` package with no upward import into `@mizan/verify`**. The suggestion module must not import from `verify` internals in a way that couples to verdict computation. Diagnostics (`longest-run.ts`) remain in verify diagnostics and are consumed read-only by display/suggest (never the reverse).  
- **Rationale:** Enforces one-way dependency (non-authoritative depends on corpus/retrieval/diagnostics shape, never the other way). Easier for G-1 to assert. Aligns with "flat top-level exports + self-reexport" and Result boundaries.  
- **Consequences:** Clearer gate enforcement. Slight package boundary overhead; easier to test in isolation.

## ADR-004: Candidate Scoring Model & Output Shape
- **Status:** Proposed  
- **Context:** Must not create a third `MatchStrength` shape. Need transparent "closeness" for UX without authoritativeness.  
- **Decision:** Suggestions are a separate type: `{ rank: 1|2|3|4|5, recordRef, textDisplay, score: { kind:"jaccard"; value:number } | { kind:"exact" }, longestRun?: number }` (non-authoritative). Never exported into `Verdict` or `EvidenceRef` as a match strength that can flip verdict.  
- **Rationale:** Preserves core schema contract. Keeps display data separate from authoritative evidence. Supports honest rendering ("why").  
- **Consequences:** Schema additions isolated to suggest/render types (not `@mizan/core/verdict`). No impact on verification purity.

---

# 6. Prioritized Sprint Backlog

| Priority (P0–P3) | Item | Type | Complexity (S/M/L/XL) | Risk (L/M/H/C) | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|---|
| **P0** | **Define suggestion contract & boundaries** (labels, states: `no candidates found`/`suggestions unavailable`, non-authoritative) | Epic 1 | S | H | — | Spec written; boundary documented; UX copy defined; no change to `MatchStrength`. |
| **P0** | **Verify gate compliance plan (G-1/G-7)**: confirm no imports into `verify.ts`, add planted-violation awareness | Epic 1 | S | H | P0 above | G-1/G-7 behavior understood; import direction documented; no verdict-path coupling. |
| **P0** | **ADR ratification** (ADR-001–004) recorded in wiki/spec with rationale | Epics/ADRs | S | H | P0s | ADRs written; status Proposed/Accepted per process; linked from spec. |
| **P1** | **Design deterministic candidate generation** (char-3-gram pre-filter, exact short-circuit, Jaccard-on-trigrams, deterministic tie-break) — **WHAT only** | Epic 2 | M | M | P0 | Algorithm rules defined (no deps). Determinism requirement specified. Returns top 3–5 and empty→`no candidates found`. |
| **P1** | **Render UX design** (non-authoritative section, reuse `longestRunFor` display-only, no verdict changes) | Epic 3 | S | M | P0 | Render spec covers states (invalid quote, no sources, unverifiable). Verdict badge unchanged. |
| **P1** | **Define evaluation scope & guardrails** (diagnostic-only, no guarantee language) | Epic 4 | S | M | P0 | Harness scope limited; metrics labeled diagnostic; baseline ~67.5% acknowledged. |
| **P2** | **Stabilize tie-break rules** (deterministic secondary keys) | Epic 2 | S | L | P1 | Tie-break order specified; prevents order flapping. |
| **P2** | **CLI opt-out flag spec** (disable suggestions, default on) | Epic 3 | S | L | P1 | Flag semantics defined; preserves fail-closed behavior. |
| **P3** | **Internal eval harness spec** (deterministic, per-package, against `data/eval/`) — diagnostic only | Epic 4 | M | L | P1 | Inputs/outputs defined; reproducibility requirement; no public guarantee path. |

---

## Wiki Integration (as per CEO instructions)
- **Title format:** `spec-nearest-quote-suggestions-2026-10-03`
- **Tags:** `spec`, `nearest-quotes`, `rag`, `deterministic`, `verification-boundary`, `priority-must`
- **Include:** Executive summary, MoSCoW, Risk Register, Epics (with success metrics), ADR-001–004, Sprint Backlog, Security Requirements (OWASP), Reliability Requirements, Observability Requirements.

### Security Requirements (OWASP-aligned)
- **Injection (A03):** Corpus text rendered as text only; no raw HTML sinks. Suggestions are data-only, display-only.
- **Access Control (A01):** No change to auth model; suggestions read-only from attested snapshot.
- **Data Exposure (A02):** §13 enforced (hashes only in logs/traces). No PII/question/corpus content persisted.
- **SSRF (A10):** No network calls in suggestion path; corpus local and attested.
- **Integrity (A08):** Attestation unchanged; suggestion never affects verdict/ledger integrity. Boundary enforced by G-1/G-7.
- **Data sensitivity:** Low content sensitivity but high integrity sensitivity. Suggestions marked non-authoritative.

### Reliability Requirements
- **Error handling:** Map every failure to `no candidates found` or `suggestions unavailable`. Never throw across boundaries (Result). Fail-closed.
- **Timeouts:** No new network timeouts introduced; suggestion is CPU-only (sub-ms expected). Must not extend existing verification timeouts.
- **Retry behavior:** None (deterministic pure computation). No retry storms.
- **Degradation:** Explicit states per §16. No silent downgrade presented as full fidelity.

### Observability Requirements
- **Metrics:** Suggestion state counts (requested/returned_candidates/empty/unavailable) — labeled non-authoritative, no content.  
- **Logs:** Event names + hashes only (questionHash, snapshotId). No suggestion text/corpus.  
- **Traces:** Span for suggestion computation (timing only). Must not attach suggestion content. Distinguish `verified_path` vs `suggestions_path` spans.  
- **Provenance:** No change to run chain/attestation; suggestions excluded from authoritative ledger fields.

```json
{
  "executiveSummary": "The customer requires review of quoted Qur'an and hadith, detection of invalid quotes, and top 3–5 nearest correct quotes when invalid. This is IslamicEval Subtask 1C (correction baseline ~67.5%). The strategic approach is to deliver deterministic, non-authoritative suggestions strictly separated from verification (preserving G-1/G-7 and MatchStrength exact|none), using char-3-gram + Jaccard (no embeddings/cross-encoder), with explicit honest-degradation states and no guarantee language. Expected impact: meet customer need while strengthening auditability and avoiding the commercial/architectural risk of opening a fuzzy path to VERIFIED.",
  "moscow": {
    "must": [
      "Strict separation: suggestions non-authoritative and never influence verdict path",
      "Preserve MatchStrength contract (exact|none only)",
      "Explicit labeling and honest degradation states (no candidates found / suggestions unavailable)",
      "Deterministic suggestion path (byte-identical top-K, no clock/randomness, no LLM)",
      "Gate compliance (G-1/G-7): no suggestion imports into verify.ts; verdict-path purity",
      "Fail-closed and non-leakage (hashes only in traces; no content in ledger)"
    ],
    "should": [
      "Deterministic nearest generation (char-3-gram pre-filter → exact short-circuit → Jaccard-on-trigrams, top 3–5)",
      "Render integration with non-authoritative section; reuse longestRunFor display-only",
      "Reuse diagnostics without importing into verify.ts",
      "Suggestions limited to attested local corpus"
    ],
    "could": [
      "Deterministic internal eval harness against data/eval (diagnostic-only)",
      "Deterministic tie-breaks for stable top-K",
      "CLI opt-out flag (default on)"
    ],
    "wont": [
      "Embeddings/vector DB/cross-encoder/LLM reranker",
      "Fuzzy percentage as verdict input or path to VERIFIED",
      "Ruling language (e.g. 'the correct one') as our ruling",
      "External web search or runtime corpus mutation",
      "Silent downgrades of empty/unavailable states"
    ]
  },
  "riskRegister": [
    {
      "risk": "Architectural boundary violation: similarity leaks into verdict path",
      "category": "Technical/Security",
      "severity": 5,
      "likelihood": 4,
      "impact": "Breaks falsifiability (CWE-345), likely fails G-1/G-7",
      "mitigation": "Enforce package boundary (separate suggest module), no imports into verify.ts, leverage G-1 self-test with planted violation"
    },
    {
      "risk": "Expectation-setting: baseline correction ~67.5% vs 'find correct quote'",
      "category": "Business",
      "severity": 5,
      "likelihood": 5,
      "impact": "Credibility/reputation risk",
      "mitigation": "Position as authoritative verdict + deterministic non-authoritative candidates; explicit disclaimers; no guarantee language"
    },
    {
      "risk": "Gate/CI regression (G-1/G-7/G-4)",
      "category": "Technical/Reliability",
      "severity": 5,
      "likelihood": 3,
      "impact": "Blocks delivery",
      "mitigation": "Gate-compliant design; run bun run ci early per package; no new third-party deps"
    },
    {
      "risk": "Determinism regression",
      "category": "Reliability",
      "severity": 5,
      "likelihood": 2,
      "impact": "Breaks byte-identical guarantee",
      "mitigation": "No clock/randomness; stable sort keys; determinism smoke test; pure computation"
    },
    {
      "risk": "Scope creep to fuzzy verification",
      "category": "Business/Technical",
      "severity": 5,
      "likelihood": 3,
      "impact": "Critical — creates second path to VERIFIED",
      "mitigation": "ADR-001 states non-influence; reject MatchStrength extension; require G-1/G-7 review"
    },
    {
      "risk": "Data leakage in traces/logs",
      "category": "Security",
      "severity": 4,
      "likelihood": 2,
      "impact": "Medium exposure risk",
      "mitigation": "§13: hashes only; render-time only; exclude suggestion content from ledger/runs"
    },
    {
      "risk": "Performance/regression from trigrams",
      "category": "Technical/Reliability",
      "severity": 3,
      "likelihood": 2,
      "impact": "Low",
      "mitigation": "Build-time only, bounded top 3–5, zero new runtime deps"
    },
    {
      "risk": "Eval misinterpreted as public guarantee",
      "category": "Business",
      "severity": 4,
      "likelihood": 3,
      "impact": "Medium",
      "mitigation": "Internal/diagnostic only; label as coverage/top-K presence; baseline documented"
    },
    {
      "risk": "Hermeticity/deps (embeddings/vector)",
      "category": "Technical/Security",
      "severity": 5,
      "likelihood": 2,
      "impact": "High — breaks purity",
      "mitigation": "Dependency-free char-3-gram+Jaccard; Won't Have embeddings/vector DB/cross-encoder"
    }
  ],
  "epics": [
    {
      "name": "Epic 1: Architectural Boundary & Non-Authoritative Suggestions",
      "what": "Establish separation so suggestions never influence verdicts; define contracts, labeling, degradation states",
      "why": "Preserves falsifiability (G-1/G-7)",
      "successMetrics": [
        "0 imports from suggestion code into verify.ts; G-1/G-7 pass",
        "MatchStrength unchanged (no fuzzy variant)",
        "100% of suggestion UI labeled 'non-authoritative'; verdict unchanged",
        "All failures map to explicit states with no silent fallback"
      ]
    },
    {
      "name": "Epic 2: Deterministic Candidate Generation",
      "what": "Char-3-gram pre-filter → exact short-circuit → deterministic Jaccard-on-trigrams, top 3–5",
      "why": "Industry-aligned with determinism/auditability",
      "successMetrics": [
        "Same input → byte-identical top-K across ≥3 runs",
        "Deterministic tie-breaking test-covered",
        "Candidates from attested snapshot only; zero network/model calls",
        "Returns no candidates found when below threshold/no overlap"
      ]
    },
    {
      "name": "Epic 3: Render & UX Integration",
      "what": "Display-only 'Nearest suggestions (non-authoritative)' section using longestRunFor display-only",
      "why": "Delivers customer value with clear separation",
      "successMetrics": [
        "No effect on verdict computation from render changes",
        "Each candidate shows ref, textDisplay, rank, non-authoritative label",
        "Honest states rendered across cases; no verdict leakage"
      ]
    },
    {
      "name": "Epic 4: Evaluation & Baseline Tracking",
      "what": "Deterministic internal harness against data/eval (diagnostic-only, no guarantee)",
      "why": "Data-driven assessment without over-claiming",
      "successMetrics": [
        "Deterministic per package",
        "Outputs state diagnostic-only with baseline note",
        "No public guarantee path",
        "Top-K presence baseline recorded"
      ]
    }
  ],
  "sprintBacklog": [
    {
      "priority": "P0",
      "item": "Define suggestion contract & boundaries (labels, states, non-authoritative)",
      "type": "Epic 1",
      "complexity": "S",
      "risk": "H",
      "dependencies": [],
      "acceptanceCriteria": "Spec complete; boundary documented; UX copy defined; MatchStrength unchanged"
    },
    {
      "priority": "P0",
      "item": "Verify gate compliance plan (G-1/G-7): no imports into verify.ts, planted-violation awareness",
      "type": "Epic 1",
      "complexity": "S",
      "risk": "H",
      "dependencies": ["P0 contract"],
      "acceptanceCriteria": "Import direction documented; verdict-path purity confirmed"
    },
    {
      "priority": "P0",
      "item": "ADR ratification (ADR-001–004) in wiki/spec",
      "type": "ADRs",
      "complexity": "S",
      "risk": "H",
      "dependencies": ["P0s"],
      "acceptanceCriteria": "ADRs recorded with rationale; linked from spec"
    },
    {
      "priority": "P1",
      "item": "Design deterministic candidate generation rules (WHAT only)",
      "type": "Epic 2",
      "complexity": "M",
      "risk": "M",
      "dependencies": ["P0"],
      "acceptanceCriteria": "Rules defined, no deps, top 3–5, empty→no candidates found, determinism specified"
    },
    {
      "priority": "P1",
      "item": "Render UX design (non-authoritative section, display-only, no verdict changes)",
      "type": "Epic 3",
      "complexity": "S",
      "risk": "M",
      "dependencies": ["P0"],
      "acceptanceCriteria": "States covered; verdict badge unchanged"
    },
    {
      "priority": "P1",
      "item": "Define evaluation scope & guardrails (diagnostic-only)",
      "type": "Epic 4",
      "complexity": "S",
      "risk": "M",
      "dependencies": ["P0"],
      "acceptanceCriteria": "Diagnostic-only; baseline ~67.5% acknowledged; no guarantee language"
    },
    {
      "priority": "P2",
      "item": "Stabilize deterministic tie-break rules",
      "type": "Epic 2",
      "complexity": "S",
      "risk": "L",
      "dependencies": ["P1 generation"],
      "acceptanceCriteria": "Tie-break order specified; prevents flapping"
    },
    {
      "priority": "P2",
      "item": "CLI opt-out flag spec (default on)",
      "type": "Epic 3",
      "complexity": "S",
      "risk": "L",
      "dependencies": ["P1 render"],
      "acceptanceCriteria": "Flag semantics defined; fail-closed preserved"
    },
    {
      "priority": "P3",
      "item": "Internal eval harness spec (deterministic, per-package, diagnostic-only)",
      "type": "Epic 4",
      "complexity": "M",
      "risk": "L",
      "dependencies": ["P1 eval scope"],
      "acceptanceCriteria": "I/O defined; reproducibility; no public guarantee path"
    }
  ],
  "adrs": [
    {
      "id": "ADR-001",
      "title": "Suggestions are Non-Authoritative and Must Not Influence Verdicts",
      "status": "Proposed",
      "context": "Customer needs nearest quotes when invalid; G-1/G-7 and §9–10 forbid fuzzy as verification path; correction baseline low",
      "decision": "Separate display-only suggestions; no MatchStrength extension; verify.ts sole path to verified",
      "rationale": "Preserves falsifiability (CWE-345), matches industry split (confirmation strict, suggestions ranked), aligns with §15",
      "consequences": "Clearer auditability and gates; stronger boundary; requires explicit labeling"
    },
    {
      "id": "ADR-002",
      "title": "Deterministic Suggestion Algorithm (No ML Reranker)",
      "status": "Proposed",
      "context": "Need byte-identical results and hermetic builds; market often uses nondeterministic rerankers",
      "decision": "Char-3-gram pre-filter → exact short-circuit → deterministic Jaccard-on-trigrams, top 3–5, deterministic tie-break; no embeddings/vector DB/cross-encoder/LLM",
      "rationale": "Matches HUMAIN/BurhanAI pre-filter pattern, dependency-free, G-1/G-7 compliant, auditable",
      "consequences": "Trade small nDCG for determinism/auditability/gate compliance; evaluation diagnostic-only"
    },
    {
      "id": "ADR-003",
      "title": "Suggestion Module Boundary & Location",
      "status": "Proposed",
      "context": "Prevent leakage between suggest and verify",
      "decision": "Display/CLI boundary or @mizan/suggest with no upward import into @mizan/verify; diagnostics consumed read-only (never reverse)",
      "rationale": "One-way dependency, easier G-1 assertion, aligns with module conventions",
      "consequences": "Clear gate enforcement; isolated testing"
    },
    {
      "id": "ADR-004",
      "title": "Candidate Scoring Model & Output Shape",
      "status": "Proposed",
      "context": "Must not create third MatchStrength shape",
      "decision": "Separate non-authoritative shape (rank, recordRef, textDisplay, score kind jaccard/exact, optional longestRun). Never exported into Verdict/EvidenceRef",
      "rationale": "Preserves core schema; separates authoritative evidence from display data",
      "consequences": "Schema additions isolated to suggest/render; no impact on verification purity"
    }
  ]
}
```

## Architecture
(no architecture)