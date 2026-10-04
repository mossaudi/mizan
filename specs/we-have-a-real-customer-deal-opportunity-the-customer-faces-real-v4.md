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
# Architecture Plan — Nearest-Quote Suggestions (display-only, deterministic)

**Wiki:** `arch-nearest-quote-suggestions-2026-10-04` · **Spec:** `spec-nearest-quote-suggestions-2026-10-03` · **Research:** `research-nearest-quote-suggestions-2026-10-03` · **Related:** ADR-03, ADR-06, AGENTS.md §1 §3 §9 §10 §16 §17

---

## 1. Executive Summary

Deterministic nearest-quote suggestions land as a **display-only surface on the far side of gate G-7**, implemented as a new leaf package `@mizan/suggest` whose only dependency is `@mizan/core`. Candidates come from **one ordered streaming scan of the attested snapshot** (`SELECT id, textMatch … ORDER BY id`), not from the FTS5 ranker, because `search()` caps at `MAX_LIMIT = 32` and BM25 token overlap degrades exactly when suggestions matter most — a fabrication shares few tokens with the record that holds the truth. Ranking is char-3-gram set overlap (Jaccard) with an exact-containment short-circuit and a total, code-unit tie-break. Three decisions carry the risk: **(a)** the exported contract deliberately carries **no number a reader could divide** — a required deviation from the spec's `{kind:"jaccard",value}` shape, because AGENTS.md §10, `schema/display.ts`, and gate G-7.4 all forbid it and closeness is instead explained by the display-only `longestRunFor` diagnostic the renderer already calls; **(b)** two **new G-7 sub-rules** rather than a G-8, because `GateId`/`GATE_IDS`/`docs-gates.ts` machine-check the published count of seven; **(c)** a **measured latency spike before the scan is committed**, because the whole design is one pass over 27,234 rows. No corpus schema change, no snapshot rebuild, no attestation churn, no new dependency.

---

## 2. Codebase Impact

### Create

| Path | Why |
|---|---|
| `packages/mizan-suggest/package.json` | New leaf package. `dependencies: { "@mizan/core": "workspace:*" }` only. |
| `packages/mizan-suggest/tsconfig.json` | Mirrors an existing package tsconfig. |
| `packages/mizan-suggest/src/trigrams.ts` | char-3-gram set extraction over already-folded text. |
| `packages/mizan-suggest/src/rank.ts` | Total ordering: containment → shared desc → record trigrams asc → `recordId` asc. |
| `packages/mizan-suggest/src/suggest.ts` | `rankNeighbours`, top-K, short-circuit decision, `MIN_SHARED`, `DEFAULT_TOP_K`, `MAX_TOP_K`. |
| `packages/mizan-suggest/src/index.ts` | Flat named exports + namespace self-reexports (§7). |
| `packages/mizan-suggest/test/{trigrams,rank,suggest,determinism}.test.ts` | See §9. |
| `packages/mizan-corpus/src/rows.ts` | **Extracted** `RECORD_SELECT` / `RawRow` / `toRecord` / `rowsToRecords` out of `resolve.ts` — one row decoder, §17. |
| `packages/mizan-corpus/src/candidates.ts` | Streaming scan + winner fetch. I/O lives where I/O lives. |
| `packages/mizan-corpus/test/candidates.test.ts` | Scan order, exclusion, winner fetch. |
| `apps/cli/src/suggestions.ts` | Composition + rendering. **Added to G-7 `DISPLAY_PATH`.** |
| `apps/cli/test/suggestions.test.ts` | Four rendered states, golden output. |
| `docs/specs/adr/ADR-07.md` … `ADR-10.md` | Four decisions, numbered to the free IDs (§6). |
| `scripts/eval/suggest-coverage.ts` | Diagnostic coverage + latency harness over `data/eval/*.json`. |
| `scripts/eval/suggest-coverage.test.ts` | Harness self-test, like the existing `scripts/*.test.ts`. |

### Modify

| Path | Change |
|---|---|
| `packages/mizan-core/src/schema/display.ts` | Add `SuggestionState`, `NearbyRecord`, `Suggestion`. **No numeric field.** |
| `packages/mizan-core/src/index.ts` | Export the three new contracts beside `Correction` / `Relevance`. |
| `packages/mizan-corpus/src/resolve.ts` | Delete the local row decoder; import from `./rows.ts`. |
| `packages/mizan-corpus/src/index.ts` | Export the candidate scan. |
| `apps/cli/src/render.ts` | `renderReport` takes `suggestions?`; `renderClaim` appends the section. |
| `apps/cli/src/main.ts` | Compose after `verifyAnswer`; `--no-suggestions`. |
| `apps/cli/src/demo.ts` | Parity: the demo is the judged path and must show the feature. |
| `apps/cli/package.json` | Add `@mizan/suggest`. |
| `packages/mizan-gate/src/gates/g7-verdict-path-purity.ts` | `DISPLAY_PATH` entry + G-7.8 + G-7.9. |
| `packages/mizan-gate/src/gates/g1-no-similarity.ts` | Extract `checkImportAllowlist(files, prefix, allowed)`; G-1.1 and G-7.8 both call it. |
| `packages/mizan-gate/test/gates.test.ts` | Planted violations for G-7.8, G-7.9, new `DISPLAY_PATH` entry. |
| `package.json` | `@mizan/suggest` in root `dependencies` (for the eval script); `eval:suggestions` script. |
| `docs/degradation-matrix.md` | A **separate** display-only degradations section — do not renumber the 7 authoritative modes (DISCLOSURE states them). |
| `README.md` | New package in the layout list; the flag in usage. |

### Deliberately untouched

`packages/mizan-verify/**` (all of it), `packages/mizan-core/src/schema/verdict.ts` (`MatchStrength`, `DegradeReason`, `VerdictReport`), `packages/mizan-core/src/schema/trace.ts`, `packages/mizan-retrieval/**`, `packages/mizan-corpus/src/snapshot.ts`, `data/corpus.db`, `INTEGRITY.md`, `DISCLOSURE.md`, `attestation.json`, `apps/web/src/page.ts`.

**No corpus schema change.** Adding an FTS5 trigram index would not change `snapshotHash` (that hashes ordered records, not file bytes), but it would require re-running ingest, relies on Bun's bundled SQLite exposing the `trigram` tokenizer, and duplicates work one pure pass already does. Rejected this round; recorded in ADR-10.

---

## 3. Module Design

```
packages/mizan-suggest/            deps: @mizan/core. Pure. No I/O, no clock, no env.
  src/trigrams.ts                  gramsOf(folded): ReadonlySet<string>
  src/rank.ts                      compareNeighbours(a, b): number  (the total order)
  src/suggest.ts                   rankNeighbours(quote, candidates, options): RankedNeighbours
  src/index.ts                     flat exports

packages/mizan-corpus/src/
  rows.ts                          row -> CorpusRecord, decoded (§1). Extracted from resolve.ts.
  candidates.ts                    scanNeighbourKeys(db, opts): Iterable<NeighbourKey>
                                   fetchRecordsById(db, ids): Result<readonly CorpusRecord[], CorpusError>
  resolve.ts                       imports rows.ts; no longer owns a decoder

apps/cli/src/
  suggestions.ts                   suggestionsFor(input): Suggestion   (composition)
                                   renderSuggestions(s): readonly string[]
  render.ts                        renders the section; calls longestRunFor per candidate
  main.ts                          composes; --no-suggestions
```

**Dependency direction:** `apps/cli → {mizan-corpus, mizan-suggest, mizan-verify} → mizan-core`. `@mizan/verify` and `@mizan/suggest` never see each other, in either direction. `discoverPackages(root, ["packages/*", "apps/*"])` picks the new package up with no `scripts/ci.ts` change.

---

## 4. API Design

### 4.1 `@mizan/suggest` (pure, total)

```ts
type NeighbourKey = { readonly recordId: string; readonly textMatch: string }

type RankedNeighbour = {
  readonly recordId: string
  readonly contained: boolean     // folded quote is a substring of this record's textMatch
  readonly shared: number         // shared 3-gram TYPES — a count, never a rate
  readonly grams: number          // this record's 3-gram TYPE count
}

rankNeighbours(
  rawQuote: string,
  candidates: Iterable<NeighbourKey>,
  options: { readonly topK?: number; readonly excludeRecordIds?: readonly string[] },
): RankedNeighbours
```

`RankedNeighbours = { exact: readonly RankedNeighbour[]; ranked: readonly RankedNeighbour[]; scanned: number; skippedLong: number }`.

- **Total, not fallible** — no I/O, so no `Result`. Same convention as `correctionFor` / `assessRelevance`, which are also total and return their union directly (§2 reserves `Result` for business failures).
- No `throw`; bounded input (`MAX_QUOTE_CHARS = 4_096`, `MAX_CANDIDATE_RECORD_CHARS = 65_536` — the same bounds `diagnostics/longest-run.ts` already declares, for the same DoS reason).
- Quote folded with `normalizeForMatch` from `@mizan/core`. Verified: `foldQuote` in `steps/containment.ts` **is** `normalizeForMatch(rawQuote)`, so this package folds byte-identically to the verifier with a core-only dependency.
- `excluded` ids are dropped before scoring.

### 4.2 `@mizan/corpus` (I/O)

```ts
scanNeighbourKeys(db: Database, opts: { readonly excludeRecordIds?: readonly string[] }): Iterable<NeighbourKey>
fetchRecordsById(db: Database, ids: readonly string[]): Result<readonly CorpusRecord[], CorpusError>
```

- `scanNeighbourKeys` streams `SELECT id, textMatch FROM records ORDER BY id` via `.iterate()` — **never `.all()`**, which would materialise ~30 MB of folded text. `ORDER BY id` is the reproducibility guarantee; the caller cannot reorder it.
- `fetchRecordsById` reuses the extracted `rows.ts` decoder and its `CorpusError` (`§1` — a row is still crossing a boundary).
- Empty `id` list returns before a query is built (`IN ()` is a syntax error — the precedent is `toChunks` in `search.ts`).

### 4.3 `apps/cli/src/suggestions.ts` (composition + display)

```ts
type SuggestionInput = {
  readonly verdict: Verdict        // decides offering; mirrors correction.ts exactly
  readonly quote: string
  readonly excludeRecordIds: readonly string[]
}

suggestionsFor(db: Database, input: SuggestionInput): Suggestion
renderSuggestions(suggestion: Suggestion, lookup: (recordId: string) => SourceExcerpt | undefined): readonly string[]
```

- Offered for `rejected` and nothing else. Mirrors `correctionFor`'s stated rule ("a correction is offered for a rejection and for nothing else") so a reader who has learned one surface has learned the other.
- `renderSuggestions` reuses `SourceExcerpt` + `citationLabel` + `displayed()` + `normalizeForTerminal` from `render.ts`, so a candidate line is formatted exactly like a source line (§17).
- **Vocabulary constraint:** this file is in `DISPLAY_PATH`, so G-7.2 forbids `similarity, similar, fuzzy, levenshtein, jaro, jaccard, trigram, ngram, dice, cosine, embed*, vector, tfidf, bm25, sbert, rapidfuzz, fuse, tokenOverlap, scoreThreshold, threshold` in code **and** strings, and G-7.4 forbids `percent|confidence|score|trustScore` as property keys. It also cannot use `fetch(`, `process.env`, `setTimeout`, or `import(`. Hence: `shared` / `grams` / `nearest`, never `overlap score` or `threshold`.

### 4.4 CLI surface

- `--no-suggestions` opt-out. `questionOf` already filters `--`-prefixed argv out of the question text, so the flag is excluded from the question by construction.
- Exit codes unchanged: a suggestion failure is display-only and must never move the exit code.

---

## 5. Data Design

Added to `packages/mizan-core/src/schema/display.ts` (contract; **not** persisted, **not** in the ledger):

```ts
SuggestionState = "candidates" | "no_candidates" | "unavailable"

NearbyRecord = {
  rank: number            // 1-based, stable
  recordId: string
  label: string           // citationLabel(collection, number)
  sourceUrl: string
  attribution: string
  license: string
  grade: string | null    // exactly as stored — never inferred, never upgraded (§15)
  gradeApplicable: boolean
  gradeSource: string
  gradeBasis: GradeBasis
}

Suggestion =
  | { state: "candidates",    considered: number, candidates: readonly NearbyRecord[] }
  | { state: "no_candidates", considered: number, reason: string }
  | { state: "unavailable",   reason: string }
```

Invariants:

- **No field is a rate.** There is nothing in this contract a caller can divide into a strength — the same reason `Relevance` carries `located`/`missing` lists instead of `{matched,total}` (`display.ts` header) and `MatchStrength` has two members (§10).
- `considered` is the number of records actually scanned. A length bound or a floor that excluded records is therefore **visible on screen**, never silent (§16).
- `NearbyRecord` carries no corpus text: the heavy, licence-sensitive `textDisplay`/`textMatch` stay in the CLI's `SourceExcerpt`, which already documents `textMatch` as *measured, never displayed*.
- `grade`/`gradeSource`/`gradeBasis`/`gradeApplicable` are copied verbatim; the renderer prints a grade only when `gradeApplicable` (§15).

**No migration.** `data/corpus.db` (83,427,308 bytes, 27,234 records) is untouched, so `snapshotHash`, `attestation.json`, `DISCLOSURE.md` arithmetic, `recordCount`, and every committed evidence artefact stay valid. That is a design goal, not a side effect.

---

## 6. Error Strategy

| Failure | Surface | Forbidden |
|---|---|---|
| Quote folds to empty | `no_candidates`, `reason: "the quotation folds to nothing, so there is nothing to look near"` | any candidate list; `verified` |
| All records share < `MIN_SHARED` grams | `no_candidates` with `considered` | a weak list presented as nearest |
| Snapshot unreadable / query throws | `unavailable`, reason string | fallback list, cached prior result, crash |
| A row fails `CorpusRecord` decode | that record is skipped **and counted**; the section prints the count | a half-decoded record |
| `fetchRecordsById` returns fewer ids than winners | `unavailable` with the mismatch named | rendering a candidate with no text |
| Verdict is not `rejected` | section absent | suggesting against a `verified` claim |

- **Propagation:** every failure is a state in the union. Nothing throws; `fetchRecordsById` returns `Result<…, CorpusError>` like `resolveCitations` consumers expect; `suggestionsFor` never propagates an exception (§2).
- **Timeout:** none inside the package — no clock is reachable (G-7.8 makes that structural). The only bound is the scan itself; if it overruns, the caller may abandon it and render `unavailable` (documented escape hatch, not the default path).
- **Degradation:** exactly §16's shape. A missing suggestion pass is a **less** informative screen, never a **wrong** badge.
- **Not extended:** `DegradeReason`. Adding `suggestions_unavailable` would put a display concern inside `VerdictReport.degraded` and the hash-chained `RunTrace`. Rejected.

---

## 7. Security Architecture

| Concern | Control |
|---|---|
| **A03 injection** | All output is text nodes (CLI strings) passed through `normalizeForTerminal`. No raw-HTML sink exists or is added (§11). Candidate text comes from the same trusted snapshot as every other displayed record. |
| **A08 / CWE-345 integrity** | No path from an overlap number to a verdict. Enforced four ways: `@mizan/suggest` is not in the verdict closure (**G-7.9**); the contract has no number to divide; the renderer may not declare a `score` field (**G-7.4**); `MatchStrength` keeps exactly two members (type-level test). |
| **A10 SSRF** | The package may import only `@mizan/core` (**G-7.8**), so `fetch(` is unreachable; the scanner's `fetch(` ban is inherited by construction. Corpus access is `openSnapshot` read-only. |
| **A02 / §13 leakage** | Suggestions are computed after the answer exists and are never written to `RunTraceDraft`, the ledger, or any log. A test asserts `buildDraft` output is byte-identical with and without the suggestion pass. |
| **A01 authz** | Unchanged. No new endpoint, no new credential, no new env var. `--no-suggestions` is a local display flag, not an authority. |
| **Prompt boundary** | Suggestions are computed **after** `verifyAnswer` and are **never** fed into a prompt. The generator cannot see them, so no incentive to fabricate-contain can be created by them. `apps/cli/src/instructions.ts` is untouched. |
| **Trust boundaries** | Two new ones: (a) SQLite rows → `CorpusRecord`, via the extracted decoder (§1); (b) model output quote → folded string, via `normalizeForMatch` + the length bound. Both fail closed. |
| **Secrets** | None. No new env var, no key, no network. |

---

## 8. Design Patterns

- **Pure function + thin shell.** All ranking is a total pure function over already-decoded data; all I/O sits in `@mizan/corpus`; all formatting sits in the CLI. This is the repo's existing shape (`verifyAnswer` pure, `resolveCitations` impure, `renderReport` formatting) and it is what makes the ranking testable without a snapshot, a clock, or a network.
- **Repository-free, iterator-based stream.** `scanNeighbourKeys` returns an `Iterable`, so `@mizan/corpus` owns SQL and `@mizan/suggest` owns the fold, and neither knows the other's type beyond `NeighbourKey`.
- **Total order as a comparator.** `compareNeighbours` is one exported comparator, which is what makes determinism testable in isolation and keeps the tie-break in one place (§17).
- **Explicit union states, never a nullable field.** Precedent: `Correction`, `Relevance`, `RelevanceState.undetermined`, `SearchResult.ranking`.
- **Reuse, not reinvention.** `SourceExcerpt`, `citationLabel`, `displayed()`, `normalizeForTerminal`, `longestRunFor`, `toRecord`/`rowsToRecords`, `checkDependencyIsolation` — all extended, none replaced.
- **Rejected:** Strategy/Factory/Observer. One algorithm, one call site shape, no variation axis to inject.

---

## 9. Testing Strategy

**Unit — `@mizan/suggest`:** trigram extraction under the fold (tashkeel, tatweel, doubled spaces); input shorter than 3 folded chars → empty set; containment short-circuit wins over any overlap; tie-break totality (equal `shared`, then shorter record, then `recordId`); `MIN_SHARED` boundary (7 → excluded, 8 → included); excluded ids dropped; `topK` clamped to `MAX_TOP_K`; no input throws.

**Determinism:** three runs over the same input → byte-identical `canonicalJson`; and an explicit assertion that sorting uses code-unit comparison, not `localeCompare` (the same discipline `docs-gates.ts` and `g7` use).

**Type-level:** `MatchStrength` still has exactly two members; `Suggestion` has no numeric field other than `rank` and `considered` (a `forbid`-style assertion so a future `score:` fails typecheck).

**Unit — `@mizan/corpus`:** `scanNeighbourKeys` yields ids in ascending order; `fetchRecordsById` on an empty list does not build a query; a malformed row is reported, not silently accepted.

**Integration — CLI:** golden output for all four states (`candidates`, `no_candidates`, `unavailable`, absent); the `--no-suggestions` flag produces byte-identical output to a build with the section removed; **the load-bearing test** — a `rejected` claim rendered with candidates produces byte-identical badge, reason, evidence, source, relevance and `run:` lines as the same report rendered without them.

**Gate:** planted violations for G-7.8 (a `@mizan/suggest` file importing `@mizan/agent`), G-7.9 (a `mizan-verify` file importing `@mizan/suggest`), and the new `DISPLAY_PATH` entry (rename the file → G-7.6 fires). Each must fail; a guard that cannot fail is not a guard (§14).

**Security tests:** no `fetch`/`process.env`/timer reachable from the package (mechanically enforced by G-7.8, asserted anyway); `buildDraft` output identical with and without suggestions; `normalizeForTerminal` applied to every rendered corpus string.

**Performance:** `scripts/eval/suggest-coverage.ts` measures p50/p95 latency and reports the scanned count over `data/eval/golden-normalization.json` + `redteam-fabricated.json`, plus top-1/3/5 coverage at floors 4/8/12. The perf assertion in CI is a generous ceiling (250 ms) — the 50 ms target is a measurement gate before commit, not a flaky unit test (§14: a flaky CI job is a defect).

**Commands:** `bun run typecheck && bun test` in `packages/mizan-suggest`, `packages/mizan-corpus`, `apps/cli`, `packages/mizan-gate`; then `bun run ci`; then `bun run check:docs`.

---

## 10. Performance Plan

- **Cost model:** one pass, 27,234 rows, ~8M folded characters. Native `includes` per row (fast path); on a miss, one character pass building the record's 3-gram `Set`. Then one indexed `WHERE id IN (…)` for the ≤5 winners' full rows.
- **Memory:** O(1) beyond the quote set and ≤5 accumulated winners. `.iterate()`, never `.all()`.
- **Spike first.** Task 1 of implementation is a measurement of the real snapshot, because the entire candidate-pool decision rests on it. If p95 > 50 ms, the documented ladder is: (1) bound record length at the diagnostics' 65,536 chars and report `skippedLong`; (2) narrow the scan scope and say so in `considered`; (3) only then an FTS5 trigram index — which needs Bun's bundled tokenizer verified first and is rejected this round.
- **No new index, no cache, no new dependency.** A persisted trigram index would trade a one-off 80 ms for permanent schema, ingest and attestation surface.
- **CI budget:** a new package is auto-discovered; the added typecheck + test keeps the full run well under the 300 s ceiling.

---

## 11. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Full scan exceeds 50 ms p95 | Medium | Spike before commit; explicit ladder; `skippedLong`/`considered` keep every bound visible |
| A fabrication with almost no shared grams → `no_candidates` | High, and **correct** | The state is explicit and says it locates nothing nearby — not that the quote is authentic |
| Short quotes produce many ties | Medium | Total order ends at `recordId`; the count is printed; no stability dependence on row order |
| A candidate list read as authority | Medium | Header carries "non-authoritative"; the reused `run:` line carries "never a verdict"; no candidates for `verified`; G-7.4 forbids a `score` field |
| Quote fold differs from the verifier's | **Zero** | Verified: `foldQuote` **is** `normalizeForMatch`; same function, same fold table (§17) |
| Docs-claim churn breaks `check:docs` | Medium | R1 backticked paths, R12 citations resolve, R13 ADR sections, R8 gate count unchanged — `bun run check:docs` is a required step |
| Feature invisible in the demo | Medium if skipped | `apps/cli/src/demo.ts` wired explicitly, not left to the optional parameter |
| Scope creep into MCP/web/prompts | Medium | Listed out of scope; the suggestion pass has no consumer other than the CLI renderer |

---

## 12. Technology Trends

- **Grounding in the dependency-zero direction.** The market answer to "find the nearest hadith" is an embedding store plus a vector index. That is precisely the shape ADR-03's spike proved unsafe, and it would make the suggestion surface the second authority in the product. Character n-gram overlap is the classical, dependency-free IR baseline; adopting it here is not a compromise, it is the decision the integrity claim requires.
- **Determinism as a feature, not a limitation.** Ranking by a precomputed lexical index rather than a model makes byte-identical output a property of the design (§14's determinism claim extends to suggestions for free).
- **Streaming, not materialising.** Iterator-based row consumption is the current Bun/SQLite idiom and matches the repo's no-clock, no-materialisation style.
- **Policy in the gate, not in review.** Extending an existing gate's sub-rules (G-7.8/G-7.9) instead of adding G-8 follows the established pattern here: the property is machine-checked with a planted violation, and the published gate count stays true.
- **Honest degradation as a first-class state.** Discrete, named, always-rendered states (`candidates` / `no_candidates` / `unavailable`) follow the repo's §16 table and the `Relevance.undetermined` precedent; the industry norm of a silent empty list is rejected outright.
- **Deliberately deferred:** reranking, MCP surface, persisted suggestion traces, FTS5 trigram tokenizer. Each is recorded with the reason it was deferred, so the next reader inherits a decision rather than a gap.

---

```json
{
  "moduleStructure": [
    {
      "name": "@mizan/suggest",
      "path": "packages/mizan-suggest",
      "kind": "package",
      "dependsOn": ["@mizan/core"],
      "responsibilities": "Pure, dependency-free deterministic nearest-quote ranking. No I/O, no clock, no environment, no randomness, no network. Machine-checked as a leaf by gate G-7.8.",
      "files": [
        { "path": "packages/mizan-suggest/src/trigrams.ts", "responsibility": "char-3-gram TYPE-set extraction over already-folded text; short input yields an empty set" },
        { "path": "packages/mizan-suggest/src/rank.ts", "responsibility": "compareNeighbours: the single total order — containment, shared desc, record grams asc, recordId asc by code unit" },
        { "path": "packages/mizan-suggest/src/suggest.ts", "responsibility": "rankNeighbours(quote, candidates, options); exact-containment short-circuit; MIN_SHARED, DEFAULT_TOP_K, MAX_TOP_K, MAX_QUOTE_CHARS, MAX_CANDIDATE_RECORD_CHARS" },
        { "path": "packages/mizan-suggest/src/index.ts", "responsibility": "Flat named exports plus namespace self-reexports per AGENTS.md section 7" }
      ]
    },
    {
      "name": "@mizan/corpus candidate scan",
      "path": "packages/mizan-corpus/src",
      "kind": "module",
      "dependsOn": ["@mizan/core"],
      "responsibilities": "Owns snapshot I/O and row decoding. Streams neighbour keys in ascending id order and fetches the winning rows by id.",
      "files": [
        { "path": "packages/mizan-corpus/src/rows.ts", "responsibility": "Shared SQLite row to CorpusRecord decoder, extracted from resolve.ts so one rule has one home (AGENTS.md section 17)" },
        { "path": "packages/mizan-corpus/src/candidates.ts", "responsibility": "scanNeighbourKeys via .iterate() over SELECT id, textMatch FROM records ORDER BY id; fetchRecordsById returning Result<readonly CorpusRecord[], CorpusError>" }
      ]
    },
    {
      "name": "CLI suggestion surface",
      "path": "apps/cli/src",
      "kind": "module",
      "dependsOn": ["@mizan/corpus", "@mizan/suggest", "@mizan/verify", "@mizan/core"],
      "responsibilities": "Composition, offering policy, and rendering. Downstream of every decision; upstream of nothing.",
      "files": [
        { "path": "apps/cli/src/suggestions.ts", "responsibility": "suggestionsFor and renderSuggestions; reuses SourceExcerpt, citationLabel, displayed, normalizeForTerminal, longestRunFor. Declared in gate G-7 DISPLAY_PATH. Must avoid every SIMILARITY_TOKENS word and every percent-shaped property key" },
        { "path": "apps/cli/src/render.ts", "responsibility": "renderReport gains an optional suggestions parameter; renderClaim appends the section; verdict, evidence and source lines byte-identical either way" },
        { "path": "apps/cli/src/main.ts", "responsibility": "Composes after verifyAnswer; reads --no-suggestions from argv; exit codes unchanged" },
        { "path": "apps/cli/src/demo.ts", "responsibility": "Demo parity so the judged path exercises the feature" }
      ]
    },
    {
      "name": "@mizan/core display contracts",
      "path": "packages/mizan-core/src/schema/display.ts",
      "kind": "schema",
      "dependsOn": ["effect"],
      "responsibilities": "Owns SuggestionState, NearbyRecord and Suggestion beside Correction and Relevance. Contains no field a caller could divide into a match strength."
    },
    {
      "name": "gate G-7 extension",
      "path": "packages/mizan-gate/src",
      "kind": "gate",
      "dependsOn": ["@mizan/core"],
      "responsibilities": "Extends an existing gate rather than adding an eighth, because GateId, GATE_IDS and docs-gates.ts machine-check the published count of seven.",
      "files": [
        { "path": "packages/mizan-gate/src/gates/g7-verdict-path-purity.ts", "responsibility": "Add apps/cli/src/suggestions.ts to DISPLAY_PATH; add G-7.8 (suggestion package is a leaf over @mizan/core) and G-7.9 (the verdict closure contains no suggestion module)" },
        { "path": "packages/mizan-gate/src/gates/g1-no-similarity.ts", "responsibility": "Extract checkImportAllowlist(files, prefix, allowed) so G-1.1 and G-7.8 share one implementation at two scopes" },
        { "path": "packages/mizan-gate/test/gates.test.ts", "responsibility": "Planted violations for G-7.8, G-7.9 and the new DISPLAY_PATH entry" }
      ]
    },
    {
      "name": "diagnostic coverage and latency harness",
      "path": "scripts/eval",
      "kind": "script",
      "dependsOn": ["@mizan/suggest", "@mizan/corpus", "@mizan/core"],
      "responsibilities": "Measures top-1/3/5 coverage at floors 4/8/12 over data/eval/golden-normalization.json and redteam-fabricated.json, plus p50/p95 scan latency and the scanned-record count. Diagnostic only; never a gate, never a published number without a backing artefact."
    },
    {
      "name": "decision records",
      "path": "docs/specs/adr",
      "kind": "documentation",
      "dependsOn": [],
      "responsibilities": "ADR-07 through ADR-10, renumbered from the spec's ADR-001..004 because ADR_PATTERN matches only two or more digits and a dangling citation fails bun run check:docs. Each needs ## Context, ## Decision, ## Consequences and - **Status:** Accepted."
    }
  ],
  "apiInterfaces": [
    {
      "name": "rankNeighbours",
      "module": "@mizan/suggest",
      "signature": "rankNeighbours(rawQuote: string, candidates: Iterable<NeighbourKey>, options: { topK?: number; excludeRecordIds?: readonly string[] }): RankedNeighbours",
      "returns": "RankedNeighbours = { exact: readonly RankedNeighbour[]; ranked: readonly RankedNeighbour[]; scanned: number; skippedLong: number }",
      "errors": "None. Total function: no I/O means no business failure, so no Result. Never throws. Quote folded with normalizeForMatch, bounded at 4096 chars; records bounded at 65536 chars.",
      "determinism": "Total order: exact containment first, then shared 3-gram types descending, then record 3-gram types ascending, then recordId ascending by UTF-16 code unit. No locale, no clock, no randomness, no iteration-order dependence."
    },
    {
      "name": "scanNeighbourKeys",
      "module": "@mizan/corpus",
      "signature": "scanNeighbourKeys(db: Database, options: { excludeRecordIds?: readonly string[] }): Iterable<NeighbourKey>",
      "returns": "Lazy iterable of { recordId, textMatch } in ascending id order",
      "errors": "SQLite failures surface to the caller as a thrown driver error caught once in apps/cli/src/suggestions.ts and mapped to Suggestion state unavailable. Row text is never decoded here; only ids and the pre-folded key are read.",
      "determinism": "ORDER BY id is the reproducibility guarantee. Streams via .iterate(); never .all()."
    },
    {
      "name": "fetchRecordsById",
      "module": "@mizan/corpus",
      "signature": "fetchRecordsById(db: Database, ids: readonly string[]): Result<readonly CorpusRecord[], CorpusError>",
      "returns": "ok: decoded CorpusRecords in id order; err: a CorpusError describing a row that failed CorpusRecord decoding",
      "errors": "Empty id list returns ok([]) before a query is built, because IN () is a SQL syntax error. A short result set is a mismatch the caller must surface as unavailable rather than render around.",
      "determinism": "Same decoder as resolve.ts; one row-to-record rule for the whole repository."
    },
    {
      "name": "suggestionsFor",
      "module": "apps/cli/src/suggestions.ts",
      "signature": "suggestionsFor(db: Database, input: { verdict: Verdict; quote: string; excludeRecordIds: readonly string[] }): Suggestion",
      "returns": "Suggestion — offered for rejected and nothing else, mirroring correctionFor's stated rule",
      "errors": "Never throws. Every failure is a state: no_candidates for an empty fold or a sub-floor overlap, unavailable for a read failure or a short winner fetch. Exit codes and the verdict report are untouched.",
      "determinism": "Pure composition of two total functions over an ordered scan."
    },
    {
      "name": "renderSuggestions",
      "module": "apps/cli/src/suggestions.ts",
      "signature": "renderSuggestions(suggestion: Suggestion, lookup: (recordId: string) => SourceExcerpt | undefined): readonly string[]",
      "returns": "Display lines headed by 'nearest suggestions (non-authoritative)', each candidate reusing the source-line format and the display-only 'run: N of M folded characters shared' line",
      "errors": "A candidate whose record cannot be looked up renders an explicit unavailable line rather than a partial candidate.",
      "determinism": "All output passes normalizeForTerminal; no raw corpus HTML sink exists anywhere in the product."
    }
  ],
  "dataModels": [
    {
      "name": "SuggestionState",
      "module": "@mizan/core/src/schema/display.ts",
      "fields": ["candidates", "no_candidates", "unavailable"],
      "invariants": "Exactly three rendered states, all named and all reachable. An absent parameter renders nothing, which is honest because that surface never computed a suggestion pass."
    },
    {
      "name": "NearbyRecord",
      "module": "@mizan/core/src/schema/display.ts",
      "fields": ["rank", "recordId", "label", "sourceUrl", "attribution", "license", "grade", "gradeApplicable", "gradeSource", "gradeBasis"],
      "invariants": "No field is a rate and none is a percentage, so no caller can divide one into a match strength (AGENTS.md section 10, and the Relevance module header). grade is copied exactly as the source dataset asserts it, with gradeSource and gradeBasis beside it; it is never inferred, upgraded, or presented as our own ruling (AGENTS.md section 15). The renderer prints a grade only when gradeApplicable. Carries no corpus text: textDisplay and textMatch stay in the CLI's SourceExcerpt, which documents textMatch as measured and never displayed."
    },
    {
      "name": "Suggestion",
      "module": "@mizan/core/src/schema/display.ts",
      "fields": ["state", "considered", "candidates", "reason"],
      "invariants": "A tagged union on state. considered is the number of records actually scanned, so any floor or length bound is visible on screen instead of silent (AGENTS.md section 16). reason is never empty and states why this state and not another, the same requirement Relevance.reason carries."
    },
    {
      "name": "NeighbourKey",
      "module": "@mizan/suggest",
      "fields": ["recordId", "textMatch"],
      "invariants": "The only shape that crosses from the corpus package into the ranking package. textMatch is the ingest-folded key, so ranking folds the quote with the identical function (foldQuote is literally normalizeForMatch) and the two cannot disagree."
    },
    {
      "name": "RankedNeighbour",
      "module": "@mizan/suggest",
      "fields": ["recordId", "contained", "shared", "grams"],
      "invariants": "Never leaves the package: it carries no licence, attribution, grade or display text, so ranking cannot leak corpus metadata and the display path cannot receive a number to render. shared and grams are counts of 3-gram types, not rates."
    },
    {
      "name": "corpus.db records table",
      "module": "@mizan/corpus/src/snapshot.ts",
      "fields": ["id", "collection", "number", "textMatch", "textDisplay", "grade", "gradeApplicable", "gradeSource", "gradeBasis", "attribution", "license", "licenseUrl", "sourceUrl", "translation"],
      "invariants": "UNCHANGED. No migration, no new index, no new table, no ingest change. snapshotHash, attestation.json, DISCLOSURE arithmetic and recordCount therefore all remain valid, which is a design goal rather than a side effect. An FTS5 trigram index is rejected this round and recorded in ADR-10."
    }
  ],
  "testingStrategy": {
    "unit": [
      "trigram extraction under the Arabic fold: tashkeel, tatweel and doubled spaces collapse as normalizeForMatch dictates; input shorter than three folded characters yields an empty set",
      "exact-containment short-circuit beats any overlap, and a contained record skips trigram work",
      "tie-break totality: equal shared, then shorter record, then recordId; sorting uses code-unit comparison and never localeCompare",
      "MIN_SHARED boundary: seven shared grams excluded, eight included",
      "excluded record ids are dropped before scoring; topK clamps to MAX_TOP_K; no input throws",
      "type-level assertion that MatchStrength still has exactly two members and that Suggestion carries no numeric field beyond rank and considered"
    ],
    "determinism": [
      "three runs over the same input produce byte-identical canonicalJson",
      "scanNeighbourKeys yields ids in ascending order and fetchRecordsById preserves that order"
    ],
    "integration": [
      "CLI golden output for all four states: candidates, no_candidates, unavailable, absent",
      "load-bearing: a rejected claim rendered with candidates produces byte-identical badge, reason, evidence, source, relevance and run lines as the same report rendered without them",
      "--no-suggestions produces output byte-identical to a build with the section removed",
      "fetchRecordsById on an empty list does not build a query; a malformed row is reported rather than silently accepted"
    ],
    "gate": [
      "G-7.8 planted violation: a @mizan/suggest file importing @mizan/agent must fail",
      "G-7.9 planted violation: a mizan-verify file importing @mizan/suggest must fail",
      "renaming apps/cli/src/suggestions.ts must fail G-7.6 display-path-present",
      "each new rule ships a self-test whose planted violation must fail; a guard that cannot fail is not a guard"
    ],
    "security": [
      "no fetch, process.env, timer or dynamic import reachable from @mizan/suggest, asserted mechanically by G-7.8",
      "buildDraft output byte-identical with and without the suggestion pass, proving no suggestion content or question text reaches the hash-chained trace",
      "normalizeForTerminal applied to every rendered corpus string; no raw-HTML sink introduced"
    ],
    "performance": [
      "latency harness reports p50 and p95 scan latency plus the scanned-record count over data/eval/golden-normalization.json and redteam-fabricated.json",
      "coverage reported as top-1, top-3 and top-5 at floors 4, 8 and 12 so the single tunable is measured rather than asserted",
      "the CI assertion is a generous 250 ms ceiling; the 50 ms target is a pre-commit measurement gate, because a flaky CI job is a defect"
    ],
    "commands": [
      "bun run typecheck && bun test in packages/mizan-suggest, packages/mizan-corpus, apps/cli and packages/mizan-gate",
      "bun run ci from the repository root, which iterates packages explicitly and names the failing one",
      "bun run check:docs for the ADR citations, backticked paths and the unchanged seven-gate count"
    ]
  },
  "office_auto_approve": {
    "confidence": 0.88,
    "evidence": "Every structural claim was read from source this session: foldQuote is normalizeForMatch, G-1.1/G-7.2 token lists and PERCENT_KEY_RULE, DISPLAY_PATH and G-7.1..G-7.7, MatchStrength, DegradeReason, ADR_PATTERN, discoverPackages, search() MAX_LIMIT of 32, and render.ts's source-excerpt reuse. Confidence is held below 0.95 for two real unknowns: the single-pass scan latency over 27,234 rows is unmeasured and the spike may force the documented fallback ladder, and the exported contract deliberately drops the spec's jaccard score field, which is a visible deviation the spec owner should ratify rather than inherit."
  }
}
```

```json
{"office_fact_memory":[{"fact":"`SIMILARITY_TOKENS` in packages/mizan-gate/src/gates/g1-no-similarity.ts is re-applied by G-7.2 to the verdict import closure AND to every file in `DISPLAY_PATH` (apps/cli/src/render.ts, correction.ts, relevance.ts, apps/web/src/page.ts), in code+strings mode. It bans the words similarity, similar, fuzzy, jaccard, trigram, ngram, cosine, embed*, vector, tfidf, bm25, sbert, rapidfuzz, fuse, tokenOverlap, scoreThreshold and threshold — so any display-path module must name its work in vocabulary outside that list (e.g. shared/grams/nearest, never 'overlap score' or 'threshold'). G-7.4 additionally bans percent|confidence|score|trustScore as property keys there.","phase":"at","evidence":"Read g1-no-similarity.ts:41-85 and g7-verdict-path-purity.ts:89-94,132-158 in this session.","confidence":0.97},{"fact":"`foldQuote` exported from @mizan/verify is literally `normalizeForMatch(rawQuote)` from @mizan/core (packages/mizan-verify/src/steps/containment.ts:57). Any new package therefore folds a quote byte-identically to the verifier while depending only on @mizan/core — no need to depend on @mizan/verify for fold parity.","phase":"at","evidence":"Read containment.ts in full this session; confirmed normalizeForMatch is exported from @mizan/core's index.","confidence":0.99},{"fact":"Two docs-gate traps in this repo: `docs-gates.ts` GATE_CLAIM_EXCLUDES contains the prefix `specs/` but NOT `docs/specs/`, so ADRs are scanned; and `docs-adr.ts` ADR_PATTERN matches only 2+ digits after `ADR-`, so the spec's `ADR-001`..`ADR-004` are read as citations to non-existent files and fail `bun run check:docs` (R12). Free ADR ids are ADR-07..ADR-10. Adding an eighth gate id would also break R8 across the audited docs, so extend G-7 sub-rules instead.","phase":"at","evidence":"Read docs-adr.ts:33-48 and docs-gates.ts GATE_CLAIM_EXCLUDES/GATE_TOKEN, plus the ADR filename glob (ADR-02..06, ADR-11, ADR-C1..C9 exist).","confidence":0.96}]}
```