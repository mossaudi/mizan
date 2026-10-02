# Spec: we-have-a-real-customer-deal-opportunity-the-customer-faces-real

**Request:** we have a real customer deal opportunity, The customer faces real consequences if they do not the platform works and functional at excellent state, need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
# Mizan Production Readiness — User Stories

## Story Overview

| ID | Title | Epic | Priority | RICE | Sprint |
|---|---|---|---|---|---|
| US-01 | Merkle-Chain Prev-Hash Linking in runs.jsonl | E1 | Must | 12.0 | 1 |
| US-02 | Chain Verify Script (Judge-Runnable) | E1 | Must | 14.0 | 1 |
| US-03 | IETF VRO-Aligned attestation.json Schema | E2 | Must | 10.8 | 1 |
| US-04 | HALLMARK 14-Type Coverage Matrix | E3 | Must | 6.4 | 1 |
| US-05 | Red-Team Set Expansion to All 14 Types | E3 | Must | 9.6 | 1 |
| US-06 | Provider Abstraction (Trait + 2 Adapters) | E4 | Must | 7.2 | 1 |
| US-07 | Precomputed Transcripts Shipped and Labelled | E4 | Must | 14.0 | 1 |
| US-08 | Honest Degradation Matrix (7 Failure Modes) | E5 | Must | 12.0 | 1 |
| US-09 | Per-Claim SSR Evaluation Metric | E6 | Should | 5.6 | 1 |
| US-10 | Local Fallback (Ollama) Functional | E4 | Should | 2.7 | 1 |
| US-11 | MCP Server Framework | E4 | Could | 2.0 | 2 |
| US-12 | Full Benchmark Harness | E3/E6 | Should | 5.6 | 2 |
| US-13 | 25+ Language Support | — | Could | 0.3 | 2 |
| US-14 | Horizontal Scaling Path | — | Could | 0.2 | 2 |

---

## Dependency Graph

```
US-01 (Merkle-chain) ──→ US-02 (Chain verify)
US-04 (HALLMARK matrix) ──→ US-05 (Red-team expansion)
US-06 (Provider abstraction) ──→ US-07 (Precomputed transcripts)
US-06 (Provider abstraction) ──→ US-10 (Ollama fallback)
US-04 + US-05 ──→ US-12 (Benchmark harness)
US-01 ──→ US-08 (Degradation matrix — ledger write failure mode)
US-03 ──→ US-08 (Degradation matrix — attestation mismatch mode)
```

**Blocking dependencies:** US-02 cannot start until US-01 completes. US-05 cannot start until US-04 completes. US-07 and US-10 cannot start until US-06 completes.

**Shared dependencies:** US-07 and US-10 both depend on US-06. US-12 depends on both US-04 and US-05.

**External dependencies:** US-10 requires Ollama runtime. US-06 requires at least one external LLM provider API.

---

## Sprint 1: Core Production Readiness

### Story US-01: Merkle-Chain Prev-Hash Linking in runs.jsonl

**Epic:** E1 — Tamper-Evident Ledger
**Priority:** Must
**RICE:** 12.0 (Reach=8, Impact=3, Confidence=100%, Effort=2)

**User Story:** As a compliance auditor, I want each entry in runs.jsonl to include a `prevHash` field linking it to the SHA-256 hash of the previous entry, so that any tampering with historical traces is cryptographically detectable.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — hash algorithm, genesis handling, and field naming are open
- [x] Valuable — tamper-evidence is a customer compliance requirement
- [x] Estimable — well-understood pattern, ~2 person-weeks
- [x] Small — single sprint scope
- [x] Testable — property-based tests can verify chain integrity

**Acceptance Criteria:**

```
Scenario: Genesis entry is written with prevHash of 64 zeros
  Given a fresh runs.jsonl file with no prior entries
  When the first run trace is appended
  Then the entry's prevHash field is "0000000000000000000000000000000000000000000000000000000000000000"
  And the entry's own hash is computed from its canonical JSON content

Scenario: Subsequent entries link to previous entry's hash
  Given runs.jsonl contains N entries with valid chain
  When a new run trace is appended
  Then the new entry's prevHash equals the hash of entry N
  And the chain remains verifiable from genesis to head

Scenario: Chain detects tampering at exact index
  Given runs.jsonl contains 100 valid chained entries
  When an attacker modifies the content of entry 42
  Then verification fails at index 42
  And the error message identifies the exact tampered index
  And entries 0-41 still verify as valid

Scenario: Chain detects insertion of forged entry
  Given runs.jsonl contains 100 valid chained entries
  When an attacker inserts a forged entry at position 50
  Then verification fails at index 50
  And the forged entry's prevHash does not match entry 49's hash

Scenario: Chain detects deletion of entry
  Given runs.jsonl contains 100 valid chained entries
  When an attacker deletes entry 75
  Then verification fails at index 75 (now containing old entry 76)
  And the prevHash mismatch is detected

Scenario: Empty file is valid chain of length 0
  Given an empty runs.jsonl file
  When chain verification is run
  Then verification passes with 0 entries
  And no error is raised

Scenario: Single entry file is valid chain of length 1
  Given runs.jsonl contains exactly 1 entry
  When chain verification is run
  Then verification passes with 1 entry
  And the entry's prevHash is the genesis value

Scenario: Concurrent appends are serialized
  Given two processes attempt to append to runs.jsonl simultaneously
  When both appends complete
  Then the file contains both entries in a valid chain
  And no entries are lost or corrupted
```

**Edge Cases:**
- Empty file (0 entries)
- Single entry (genesis only)
- Very large file (10k+ entries) — verification must complete <60s
- Entry with special characters in content (hash must be computed on canonical JSON, not raw bytes)
- File with trailing newline vs. no trailing newline
- Corrupted JSON in one entry (decode failure, not hash mismatch)
- File permissions prevent reading

**Security Scenarios:**

```
Scenario: Tamper detection is cryptographically strong
  Given an attacker with full filesystem access
  When they modify any byte in any entry
  Then the SHA-256 hash chain breaks at that entry
  And the tamper is detected with no false negative

Scenario: Hash computation is deterministic
  Given the same entry content
  When the hash is computed twice
  Then both hashes are byte-identical
  And no randomness or clock is used in hash computation
```

**Performance Requirements:**
- Append operation: <5ms per entry (hash computation + file write)
- Chain verification: <60s for 10,000 entries
- Memory: O(1) — verify by streaming, not loading entire file

**Reliability Requirements:**
- Error handling: `Result<T,E>` — returns `ChainVerifyError` with index and reason
- Timeout: N/A (local file operation)
- Retry: 0 (permanent failure — tamper is not transient)
- Graceful degradation: If file is unreadable, return `unverifiable` chain status, never `valid`

---

### Story US-02: Chain Verify Script (Judge-Runnable)

**Epic:** E1 — Tamper-Evident Ledger
**Priority:** Must
**RICE:** 14.0 (Reach=7, Impact=2, Confidence=100%, Effort=1)

**User Story:** As a judge or customer auditor, I want a standalone script that verifies the entire runs.jsonl chain and reports pass/fail with the exact tamper location, so that I can independently confirm ledger integrity without reading any code.

**INVEST Checklist:**
- [x] Independent — depends on US-01 but is a thin verification layer
- [x] Negotiable — output format (JSON, text, exit codes) is open
- [x] Valuable — judge-runnable proof of tamper-evidence
- [x] Estimable — ~1 person-week
- [x] Small — single sprint scope
- [x] Testable — exit code 0 = valid, non-zero = tampered at index N

**Acceptance Criteria:**

```
Scenario: Valid chain exits 0 with success message
  Given runs.jsonl contains 50 valid chained entries
  When the chain verify script is run
  Then exit code is 0
  And stdout contains "VALID" or equivalent success indicator
  And the entry count is reported

Scenario: Tampered chain exits non-zero with index
  Given runs.jsonl contains 50 entries with entry 30 tampered
  When the chain verify script is run
  Then exit code is non-zero
  And stderr identifies index 30 as the tamper location
  And the error message includes the expected vs actual hash

Scenario: Script handles missing file gracefully
  Given runs.jsonl does not exist
  When the chain verify script is run
  Then exit code is non-zero
  And the error message states the file was not found
  And no stack trace is shown to the user

Scenario: Script handles empty file
  Given runs.jsonl exists but is empty (0 bytes)
  When the chain verify script is run
  Then exit code is 0
  And the output reports 0 entries verified

Scenario: Script output is machine-parseable
  Given the chain verify script is run with a --json flag
  When verification completes
  Then stdout is valid JSON
  And the JSON contains: valid (boolean), entriesVerified (number), tamperIndex (number|null)

Scenario: Script completes within 60 seconds for large ledger
  Given runs.jsonl contains 10,000 entries
  When the chain verify script is run
  Then it completes in under 60 seconds
  And reports the correct entry count
```

**Edge Cases:**
- Missing file
- Empty file
- File with only whitespace
- File with invalid JSON on one line
- Very large file (10k+ entries)
- File with CRLF vs LF line endings
- File with BOM (byte order mark)

**Security Scenarios:**

```
Scenario: Script does not leak entry content
  Given a tampered chain
  When the script reports the tamper
  Then the error message contains only hashes and indices
  And no entry content (question text, corpus text) is displayed

Scenario: Script is read-only
  Given the chain verify script
  When it runs
  Then it does not modify runs.jsonl
  And it does not create any temporary files
```

**Performance Requirements:**
- Verification of 10,000 entries: <60s
- Memory: O(1) streaming verification
- Startup: <500ms

**Reliability Requirements:**
- Error handling: Named exit codes (0=valid, 1=tampered, 2=file error, 3=decode error)
- Timeout: N/A
- Retry: 0
- Graceful degradation: If file is unreadable, exit with code 2 and clear message

---

### Story US-03: IETF VRO-Aligned attestation.json Schema

**Epic:** E2 — IETF VRO Attestation
**Priority:** Must
**RICE:** 10.8 (Reach=9, Impact=3, Confidence=80%, Effort=2)

**User Story:** As a compliance officer, I want attestation.json to explicitly map its fields to IETF VRO's 8 control areas and 3 maturity levels, so that our attestation is recognizable to regulators and auditors familiar with the standard.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — exact field names and mapping granularity are open
- [x] Valuable — regulatory alignment is a customer compliance gate
- [x] Estimable — ~2 person-weeks
- [x] Small — single sprint scope
- [x] Testable — schema validation + 100x byte-identical determinism test

**Acceptance Criteria:**

```
Scenario: attestation.json contains all 8 IETF VRO control areas
  Given the attestation.json file
  When it is parsed
  Then it contains fields mapping to all 8 IETF VRO control areas
  And each control area has at least one concrete field

Scenario: attestation.json declares maturity level
  Given the attestation.json file
  When it is parsed
  Then it contains a maturityLevel field with value 1, 2, or 3
  And the maturity level is justified by accompanying documentation

Scenario: attestation.json is 100x byte-identical across runs
  Given the attestation generation process
  When it is run 100 times
  Then all 100 outputs are byte-identical
  And no timestamps, randomness, or environment-dependent values are included

Scenario: attestation.json includes corpus snapshot hash
  Given the attestation.json file
  When it is parsed
  Then it contains the corpus snapshot SHA-256 hash
  And the hash matches the committed corpus.db

Scenario: attestation.json includes determinism evidence
  Given the attestation.json file
  When it is parsed
  Then it contains evidence of the 100x byte-identical determinism gate
  And the evidence includes the gate name and pass/fail status

Scenario: Unknown fields are rejected
  Given an attestation.json with an unrecognized field
  When it is validated against the schema
  Then validation fails with a clear error
  And the error identifies the unknown field

Scenario: Missing control area fails validation
  Given an attestation.json missing one of the 8 control areas
  When it is validated against the schema
  Then validation fails
  And the error names the missing control area
```

**Edge Cases:**
- Empty attestation.json
- attestation.json with extra unknown fields
- attestation.json with wrong types (string instead of number)
- attestation.json with null values where strings expected
- Corpus DB modified after attestation (hash mismatch)
- Concurrent attestation generation (determinism must hold)

**Security Scenarios:**

```
Scenario: Attestation fails closed on hash mismatch
  Given the corpus.db has been modified since attestation was generated
  When a query is attempted
  Then the system refuses to process the query
  And reports an attestation mismatch error
  And no verdict is returned

Scenario: Attestation contains no sensitive data
  Given the attestation.json file
  When it is inspected
  Then it contains no API keys, no question text, no corpus content
  And it contains only hashes, version identifiers, and control area mappings
```

**Performance Requirements:**
- Attestation generation: <100ms
- Attestation validation: <50ms
- Schema validation: <10ms

**Reliability Requirements:**
- Error handling: `Result<T,E>` — returns `AttestationError` with reason
- Timeout: N/A (local file operation)
- Retry: 0 (permanent failure)
- Graceful degradation: If attestation is invalid, system refuses to process queries (fail closed)

---

### Story US-04: HALLMARK 14-Type Coverage Matrix

**Epic:** E3 — HALLMARK Benchmark Coverage
**Priority:** Must
**RICE:** 6.4 (Reach=8, Impact=2, Confidence=80%, Effort=2)

**User Story:** As an evaluator, I want a committed coverage matrix mapping all 14 HALLMARK hallucination types to specific test cases, so that I can verify mizan's verifier handles every known hallucination category.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — test case format and coverage depth per type are open
- [x] Valuable — benchmark completeness is a customer evaluation criterion
- [x] Estimable — ~2 person-weeks
- [x] Small — single sprint scope
- [x] Testable — each type has at least one test case that exercises it

**Acceptance Criteria:**

```
Scenario: All 14 HALLMARK types are mapped
  Given the coverage matrix document
  When it is reviewed
  Then all 14 HALLMARK hallucination types are listed
  And each type has at least one associated test case
  And each test case has a unique identifier

Scenario: Coverage matrix is committed to repository
  Given the coverage matrix
  When the repository is cloned
  Then the coverage matrix file is present
  And it is in a human-readable format (Markdown or CSV)

Scenario: Each type has a defined expected verdict
  Given a test case for HALLMARK type N
  When the verifier processes it
  Then the expected verdict is documented (verified, unverifiable, or no sources found)
  And the test asserts the expected verdict

Scenario: Coverage matrix includes difficulty tier
  Given the HALLMARK taxonomy defines 3 difficulty tiers
  When the coverage matrix is created
  Then each test case is tagged with its difficulty tier
  And at least one test case exists for each tier

Scenario: Coverage matrix is citable
  Given the coverage matrix
  When a customer or judge requests benchmark coverage
  Then the matrix can be referenced by file path and commit hash
  And the matrix clearly states the HALLMARK paper reference
```

**Edge Cases:**
- A HALLMARK type that is not applicable to religious content (document why)
- A type that maps to multiple test cases
- A type where the expected verdict is "unverifiable" (honest degradation, not failure)
- Overlapping types (a test case may exercise multiple types)

**Security Scenarios:**

```
Scenario: Test cases contain no real hadith content
  Given the test cases for HALLMARK types
  When they are created
  Then they use clearly fabricated/synthetic text
  And no real hadith or Qur'an text is used in red-team test cases
  And fabricated text is obviously synthetic (e.g., "FABRICATED_HADITH_001")
```

**Performance Requirements:**
- Coverage matrix generation: N/A (static document)
- Test case execution: <5s per type

**Reliability Requirements:**
- Error handling: If a test case fails, the coverage matrix must be updated (not the test silently changed)
- Timeout: N/A
- Retry: 0
- Graceful degradation: N/A

---

### Story US-05: Red-Team Set Expansion to All 14 Types

**Epic:** E3 — HALLMARK Benchmark Coverage
**Priority:** Must
**RICE:** 9.6 (Reach=8, Impact=3, Confidence=80%, Effort=2)

**User Story:** As a red-team evaluator, I want a comprehensive set of fabricated citations covering all 14 HALLMARK hallucination types, so that I can prove mizan's verifier returns zero false `verified` verdicts on fabricated input.

**INVEST Checklist:**
- [x] Independent — depends on US-04 but is a distinct deliverable
- [x] Negotiable — number of test cases per type, exact fabrication patterns
- [x] Valuable — zero false `verified` is the core differentiator and release gate
- [x] Estimable — ~2 person-weeks
- [x] Small — single sprint scope
- [x] Testable — each fabricated citation must NOT produce a `verified` verdict

**Acceptance Criteria:**

```
Scenario: Red-team set contains at least one case per HALLMARK type
  Given the red-team test set
  When it is executed against the verifier
  Then at least one fabricated citation exists for each of the 14 HALLMARK types
  And the total red-team set has at least 14 cases

Scenario: Zero false verified verdicts on red-team set
  Given the complete red-team set
  When every case is processed by the verifier
  Then no case receives a `verified` verdict
  And all cases receive either `unverifiable` or `no sources found`

Scenario: Red-team cases are clearly labelled as fabricated
  Given a red-team test case
  When it is created
  Then it is labelled with its HALLMARK type
  And it is labelled as fabricated/synthetic
  And it is never confused with real corpus content

Scenario: Red-team set is executable as a test suite
  Given the red-team set
  When the test suite is run
  Then it reports pass/fail for each case
  And the overall suite passes only if zero false verified verdicts occur
  And the suite exits non-zero if any false verified is detected

Scenario: Red-team set includes adversarial variations
  Given a HALLMARK type involving near-miss citations
  When the red-team set is created
  Then it includes variations with subtle character changes
  And it includes variations with word reordering
  And it includes variations with partial quotes
```

**Edge Cases:**
- Fabricated citation that is a substring of a real citation (must still fail)
- Fabricated citation with Unicode lookalikes (Arabic letter substitutions)
- Fabricated citation with extra whitespace
- Fabricated citation with mixed Arabic/English
- Empty citation string
- Very long fabricated citation (1000+ characters)

**Security Scenarios:**

```
Scenario: Red-team set cannot be mistaken for real corpus
  Given the red-team test cases
  When they are stored
  Then they are in a separate directory from the real corpus
  And they are never loaded into corpus.db
  And they are clearly marked as test fixtures

Scenario: Red-team execution does not modify the ledger
  Given a red-team test run
  When it completes
  Then no entries are appended to runs.jsonl
  And the ledger is unchanged
```

**Performance Requirements:**
- Full red-team suite execution: <30s for 14+ cases
- Per-case verification: <5s

**Reliability Requirements:**
- Error handling: If a red-team case crashes the verifier, that is a test failure (not a pass)
- Timeout: 10s per case (verification timeout)
- Retry: 0
- Graceful degradation: If a case produces an unexpected error, the test fails loudly

---

### Story US-06: Provider Abstraction (Trait + 2 Adapters)

**Epic:** E4 — Provider Resilience
**Priority:** Must
**RICE:** 7.2 (Reach=9, Impact=3, Confidence=80%, Effort=3)

**User Story:** As a system operator, I want the LLM provider to be abstracted behind a trait/interface with at least two concrete adapters, so that a single provider outage does not cause full system degradation.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — trait method signatures, adapter selection logic
- [x] Valuable — eliminates single-provider outage risk
- [x] Estimable — ~3 person-weeks
- [x] Small — single sprint scope
- [x] Testable — mock provider can be substituted; failover can be tested

**Acceptance Criteria:**

```
Scenario: Provider trait defines a common interface
  Given the provider abstraction
  When it is defined
  Then it defines a method for generating a response given a prompt
  And it returns a Result type (success or named error)
  And it does not expose provider-specific types in the interface

Scenario: At least two provider adapters implement the trait
  Given the provider abstraction
  When the system is configured
  Then at least two concrete providers are available
  And each adapter implements the same trait
  And each adapter can be selected via configuration

Scenario: Provider failover occurs within 5 seconds
  Given the primary provider is unavailable (timeout or error)
  When a request is made
  Then the system fails over to the secondary provider
  And the failover completes within 5 seconds
  And the user receives a response from the secondary provider

Scenario: Provider selection is configurable
  Given the system configuration
  When the operator sets a preferred provider
  Then the system uses that provider as primary
  And the configuration is read from environment or config file

Scenario: Provider errors are honest
  Given a provider returns an error
  When the error is handled
  Then the error is surfaced as `model unavailable`
  And no partial or canned response is returned
  And the error includes the provider name for debugging

Scenario: Provider adapter normalizes responses
  Given two different providers return different response formats
  When the responses are processed
  Then both are normalized to a common internal type
  And downstream code does not need to know which provider was used
```

**Edge Cases:**
- Both providers unavailable (must return `model unavailable`, not crash)
- Provider returns malformed JSON (must return decode error, not crash)
- Provider returns empty string (must handle gracefully)
- Provider timeout at exactly the timeout boundary
- Provider returns partial response then disconnects
- API key missing or invalid for one provider

**Security Scenarios:**

```
Scenario: API keys are not logged
  Given a provider request fails with an auth error
  When the error is logged
  Then the API key is never included in the log
  And the error message contains only the provider name and error type

Scenario: Provider adapter does not follow redirects to internal networks
  Given a provider returns a redirect
  When the adapter processes it
  Then the redirect is not followed
  And an error is returned
```

**Performance Requirements:**
- Provider selection: <1ms
- Failover: <5s (including timeout of primary)
- Response normalization: <10ms

**Reliability Requirements:**
- Error handling: `Result<T,E>` — returns `ProviderError` with provider name and reason
- Timeout: 30s per provider attempt
- Retry: 1 (single retry on primary before failover)
- Graceful degradation: If all providers fail, return `model unavailable`

---

### Story US-07: Precomputed Transcripts Shipped and Labelled

**Epic:** E4 — Provider Resilience
**Priority:** Must
**RICE:** 14.0 (Reach=7, Impact=2, Confidence=100%, Effort=1)

**User Story:** As a demo operator, I want precomputed transcripts for common queries to be shipped with the product and clearly labelled as precomputed, so that demos can proceed even when the LLM provider is completely unavailable.

**INVEST Checklist:**
- [x] Independent — depends on US-06 but is a distinct deliverable
- [x] Negotiable — which queries to precompute, storage format
- [x] Valuable — demo resilience during provider outage
- [x] Estimable — ~1 person-week
- [x] Small — single sprint scope
- [x] Testable — transcripts are labelled and retrievable

**Acceptance Criteria:**

```
Scenario: Precomputed transcripts are shipped with the product
  Given the product distribution
  When it is unpacked
  Then precomputed transcript files are present
  And they are in a clearly named directory (e.g., data/precomputed/)

Scenario: Each transcript is labelled as precomputed
  Given a precomputed transcript file
  When it is opened
  Then it contains a field indicating it is precomputed
  And it contains the provider name that generated it
  And it contains a timestamp of when it was generated

Scenario: Precomputed transcripts are clearly distinguished from live results
  Given a precomputed transcript is displayed
  When the user views it
  Then it is visually or textually marked as precomputed
  And the user is informed that live verification was not performed

Scenario: Precomputed transcripts include verification results
  Given a precomputed transcript
  When it is used in a demo
  Then it includes the verification verdicts that were computed at generation time
  And the verdicts are clearly marked as historical

Scenario: Precomputed transcripts can be invalidated
  Given a precomputed transcript
  When the corpus is updated
  Then the transcript is marked as stale
  And the system warns that results may not reflect current corpus
```

**Edge Cases:**
- No precomputed transcripts available (directory empty)
- Transcript file corrupted
- Transcript references corpus content that no longer exists
- Multiple transcripts for the same question

**Security Scenarios:**

```
Scenario: Precomputed transcripts contain no API keys
  Given a precomputed transcript
  When it is inspected
  Then it contains no API keys or credentials
  And it contains no provider-specific tokens
```

**Performance Requirements:**
- Transcript lookup: <10ms
- Transcript loading: <50ms

**Reliability Requirements:**
- Error handling: If transcript is corrupted, return error (do not fall back to live)
- Timeout: N/A
- Retry: 0
- Graceful degradation: If no transcript exists for a query, proceed with live provider

---

### Story US-08: Honest Degradation Matrix (7 Failure Modes)

**Epic:** E5 — Honest Degradation
**Priority:** Must
**RICE:** 12.0 (Reach=8, Impact=3, Confidence=100%, Effort=2)

**User Story:** As a customer operator, I want a documented matrix showing exactly how the system degrades for each of the 7 failure modes, so that I can trust the system will never fabricate a result when a component fails.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — matrix format, level of detail per mode
- [x] Valuable — customer operational confidence; product integrity
- [x] Estimable — ~2 person-weeks
- [x] Small — single sprint scope
- [x] Testable — each mode has a test that triggers it and asserts the correct surface

**Acceptance Criteria:**

```
Scenario: All 7 failure modes are documented
  Given the degradation matrix
  When it is reviewed
  Then it contains exactly 7 failure modes
  And each mode has: name, trigger condition, correct surface, forbidden surfaces, exit code

Scenario: Each failure mode has a named exit code
  Given a failure mode
  When it is triggered in the CLI
  Then the process exits with a unique non-zero exit code
  And the exit code is documented in the matrix

Scenario: No failure mode produces a canned answer
  Given any failure mode
  When it is triggered
  Then the system never returns a precomputed/canned response
  And the system never returns a partial answer shown as complete

Scenario: No failure mode produces a silent mock
  Given any failure mode
  When it is triggered
  Then the system never silently substitutes a mock response
  And the user is always informed of the degradation

Scenario: Provider down produces `model unavailable`
  Given the LLM provider is unreachable
  When a query is attempted
  Then the system returns `model unavailable`
  And the exit code matches the documented code for this mode

Scenario: Corpus miss produces `no sources found`
  Given the corpus contains no matching sources for a query
  When retrieval completes
  Then the system returns `no sources found`
  And the exit code matches the documented code for this mode

Scenario: Verification timeout produces `unverifiable`
  Given the verification step exceeds its timeout
  When the timeout fires
  Then the system returns `unverifiable`
  And the system never returns `verified` for this case
  And the exit code matches the documented code for this mode

Scenario: Ledger write failure marks run untrusted
  Given the ledger write fails (disk full, permissions)
  When a run completes
  Then the run is marked as untrusted
  And the chain refuses further appends
  And the exit code matches the documented code for this mode

Scenario: Attestation mismatch produces loud error
  Given the corpus hash does not match the committed attestation
  When a query is attempted
  Then the system produces a loud integrity error
  And no verdict is returned
  And the exit code matches the documented code for this mode

Scenario: Tafsir backend unreachable produces `unavailable`
  Given the tafsir backend is unreachable
  When tafsir is requested
  Then the system returns `unavailable`
  And no fabricated tafsir is returned
  And the exit code matches the documented code for this mode

Scenario: Second ranker down produces `semanticRanking: unavailable`
  Given the semantic ranking service is down
  When ranking is needed
  Then the system returns `semanticRanking: "unavailable"` in metadata
  And the system does not silently downgrade to a less accurate method
  And the exit code matches the documented code for this mode
```

**Edge Cases:**
- Multiple failure modes occurring simultaneously
- Failure mode during a failure mode (e.g., ledger write fails while reporting provider down)
- Recovery from a failure mode (provider comes back online)
- Failure mode in a long-running batch process

**Security Scenarios:**

```
Scenario: Error messages do not leak sensitive data
  Given any failure mode
  When the error is displayed
  Then the error message contains no API keys, no corpus content, no question text
  And the error message contains only the failure type and a correlation ID

Scenario: Degradation does not bypass verification
  Given a failure mode in any component
  When the system degrades
  Then the verification step is never skipped
  And a `verified` verdict is never produced without actual verification
```

**Performance Requirements:**
- Failure detection: <100ms
- Error surfacing: <50ms
- Exit code mapping: <1ms

**Reliability Requirements:**
- Error handling: Each failure mode has exactly one correct surface
- Timeout: Per-mode timeouts as defined in spec (2s-30s)
- Retry: Per spec (0-1 per path)
- Graceful degradation: Each mode degrades to its documented surface, never to a fabricated result

---

### Story US-09: Per-Claim SSR Evaluation Metric

**Epic:** E6 — Per-Claim SSR Evaluation
**Priority:** Should
**RICE:** 5.6 (Reach=7, Impact=2, Confidence=80%, Effort=2)

**User Story:** As an evaluator, I want a per-claim Sentence-Support Rate (SSR) metric that measures whether each generated sentence is verifiably grounded, so that we can align with TREC 2025 RAG Track evaluation standards.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — SSR computation method, sentence segmentation rules
- [x] Valuable — TREC 2025 alignment; emerging standard
- [x] Estimable — ~2 person-weeks
- [x] Small — single sprint scope
- [x] Testable — golden set ≥99% correct; red-team 0 false verified

**Acceptance Criteria:**

```
Scenario: SSR is computed per generated sentence
  Given a generated response with N sentences
  When SSR is computed
  Then each sentence is evaluated independently
  And the SSR is the ratio of supported sentences to total sentences

Scenario: A sentence is supported only if it contains a verified citation
  Given a sentence in a generated response
  When it is evaluated for support
  Then it is supported only if it contains at least one citation that received a `verified` verdict
  And sentences with only `unverifiable` or `no sources found` citations are not supported

Scenario: Golden set achieves at least 99% SSR
  Given the golden test set
  When SSR is computed
  Then the SSR is at least 99%
  And any sentence below 99% is investigated

Scenario: Red-team set achieves 0% SSR
  Given the red-team test set (all fabricated citations)
  When SSR is computed
  Then the SSR is 0%
  And no sentence is supported (since no citation is verified)

Scenario: SSR is published in benchmark results
  Given a benchmark run
  When results are reported
  Then the SSR is included in the output
  And it is clearly labelled as a per-claim metric

Scenario: SSR handles edge cases in sentence segmentation
  Given a response with abbreviations, decimals, or Arabic text
  When sentences are segmented
  Then segmentation is deterministic
  And the same input always produces the same sentence count
```

**Edge Cases:**
- Response with 0 sentences (empty response)
- Response with 1 sentence
- Response with 100+ sentences
- Sentence with multiple citations (one verified, one not)
- Arabic sentence with no clear sentence boundary
- Response with only citations and no prose

**Security Scenarios:**

```
Scenario: SSR computation does not modify verdicts
  Given a set of verdicts
  When SSR is computed
  Then the verdicts are not modified
  And SSR is a read-only metric
```

**Performance Requirements:**
- SSR computation: <100ms per response
- Sentence segmentation: <50ms per response

**Reliability Requirements:**
- Error handling: If sentence segmentation fails, return `unverifiable` SSR
- Timeout: N/A
- Retry: 0
- Graceful degradation: If SSR cannot be computed, report as `unavailable` (not 0%)

---

### Story US-10: Local Fallback (Ollama) Functional

**Epic:** E4 — Provider Resilience
**Priority:** Should
**RICE:** 2.7 (Reach=8, Impact=2, Confidence=50%, Effort=3)

**User Story:** As a demo operator, I want a local Ollama provider as a fallback when all remote providers are unavailable, so that demos can proceed fully offline.

**INVEST Checklist:**
- [x] Independent — depends on US-06 but is a distinct deliverable
- [x] Negotiable — model selection, Ollama configuration
- [x] Valuable — offline demo capability
- [x] Estimable — ~3 person-weeks
- [x] Small — single sprint scope
- [x] Testable — Ollama adapter can be tested with a local Ollama instance

**Acceptance Criteria:**

```
Scenario: Ollama adapter implements the provider trait
  Given the provider abstraction from US-06
  When the Ollama adapter is implemented
  Then it implements the same trait as other providers
  And it can be selected via configuration

Scenario: Ollama adapter connects to local Ollama instance
  Given a local Ollama instance is running on the default port
  When the Ollama adapter is used
  Then it sends requests to the local instance
  And it receives responses in the expected format

Scenario: Ollama adapter handles Ollama not running
  Given Ollama is not running on the expected port
  When a request is made
  Then the adapter returns `model unavailable`
  And the error message indicates Ollama was not reachable

Scenario: Ollama adapter normalizes responses
  Given Ollama returns a response in its format
  When the response is processed
  Then it is normalized to the common internal type
  And downstream code can process it without knowing it came from Ollama

Scenario: Ollama fallback is automatic
  Given all remote providers are unavailable
  When a query is attempted
  Then the system falls back to Ollama
  And the failover is transparent to the user
```

**Edge Cases:**
- Ollama running but model not loaded
- Ollama returns empty response
- Ollama returns malformed JSON
- Ollama timeout (model taking too long to load)
- Ollama on non-default port

**Security Scenarios:**

```
Scenario: Ollama adapter does not expose local file system
  Given the Ollama adapter
  When it sends a request
  Then the request contains only the prompt
  And no local file paths or system information is sent
```

**Performance Requirements:**
- Ollama connection: <1s
- Ollama response: variable (depends on model), but timeout at 30s
- Failover to Ollama: <5s

**Reliability Requirements:**
- Error handling: `Result<T,E>` — returns `ProviderError` with "Ollama" provider name
- Timeout: 30s
- Retry: 1
- Graceful degradation: If Ollama fails, return `model unavailable`

---

## Sprint 2: Extended Capabilities

### Story US-11: MCP Server Framework

**Epic:** E4 — Provider Resilience
**Priority:** Could
**RICE:** 2.0 (Reach=6, Impact=2, Confidence=50%, Effort=3)

**User Story:** As an integrator, I want mizan to expose an MCP (Model Context Protocol) server, so that other AI systems can use mizan's verification as a tool.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — which tools to expose, MCP SDK choice
- [x] Valuable — both competitors ship MCP; table-stakes feature
- [x] Estimable — ~3 person-weeks
- [x] Small — single sprint scope
- [x] Testable — MCP client can call verification tool and receive verdict

**Acceptance Criteria:**

```
Scenario: MCP server exposes a verification tool
  Given the MCP server is running
  When an MCP client connects
  Then the client can discover a verification tool
  And the tool accepts a question and returns a verdict

Scenario: MCP server is read-only
  Given the MCP server
  When it receives a request
  Then it only performs verification
  And it does not modify the corpus or ledger
  And it does not expose write operations

Scenario: MCP server handles multiple concurrent clients
  Given the MCP server is running
  When multiple clients connect simultaneously
  Then each client receives correct responses
  And no state is leaked between clients
```

**Edge Cases:**
- Client sends malformed MCP request
- Client disconnects mid-request
- Very long question (10k+ characters)
- Concurrent verification requests

**Security Scenarios:**

```
Scenario: MCP server does not expose corpus content
  Given an MCP client
  When it calls the verification tool
  Then the response contains only verdicts and match strength
  And no corpus text is returned to the client
```

**Performance Requirements:**
- Tool discovery: <100ms
- Verification via MCP: same as direct verification (<5s p50)
- Concurrent clients: support at least 10 simultaneous

**Reliability Requirements:**
- Error handling: MCP errors returned as tool errors
- Timeout: 30s per request
- Retry: 0
- Graceful degradation: If verification fails, return honest error via MCP

---

### Story US-12: Full Benchmark Harness

**Epic:** E3/E6 — HALLMARK Coverage + Per-Claim SSR
**Priority:** Should
**RICE:** 5.6 (Reach=7, Impact=2, Confidence=80%, Effort=2)

**User Story:** As an evaluator, I want a single benchmark harness that runs all test suites (golden set, red-team set, HALLMARK types) and produces a unified report, so that I can assess mizan's overall performance in one command.

**INVEST Checklist:**
- [x] Independent — depends on US-04 and US-05 but is a distinct deliverable
- [x] Negotiable — report format, which suites to include
- [x] Valuable — unified evaluation in one command
- [x] Estimable — ~2 person-weeks
- [x] Small — single sprint scope
- [x] Testable — harness runs and produces a report

**Acceptance Criteria:**

```
Scenario: Benchmark harness runs all test suites
  Given the benchmark harness
  When it is executed
  Then it runs the golden set, red-team set, and HALLMARK type tests
  And it produces a unified report

Scenario: Report includes key metrics
  Given a benchmark run
  When the report is generated
  Then it includes: total cases, pass count, fail count, SSR, false positive rate
  And it includes per-suite breakdowns

Scenario: Benchmark harness exits non-zero on failure
  Given a test case fails
  When the benchmark harness completes
  Then it exits with a non-zero code
  And the failing cases are listed in the report
```

**Edge Cases:**
- Empty test suite
- All tests pass
- All tests fail
- Test suite with only one case

**Security Scenarios:**

```
Scenario: Benchmark report does not include sensitive data
  Given a benchmark run
  When the report is generated
  Then it contains only metrics and case IDs
  And no question text or corpus content is included
```

**Performance Requirements:**
- Full benchmark suite: <5 minutes
- Report generation: <1s

**Reliability Requirements:**
- Error handling: If a suite fails to load, report the error and continue with other suites
- Timeout: 5 minutes total
- Retry: 0
- Graceful degradation: If one suite fails, others still run

---

### Story US-13: 25+ Language Support

**Epic:** —
**Priority:** Could
**RICE:** 0.3 (Reach=5, Impact=1, Confidence=50%, Effort=8)

**User Story:** As a non-Arabic speaker, I want to ask questions in my own language and receive verified answers, so that mizan is accessible to a global audience.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — which languages to support first, translation approach
- [x] Valuable — gap vs Ansari competitor
- [x] Estimable — ~8 person-weeks (XL)
- [ ] Small — exceeds single sprint; needs phasing
- [x] Testable — each supported language has test cases

**Note:** This story is XL effort and may need to be split into per-language sub-stories if pursued.

**Acceptance Criteria:**

```
Scenario: System accepts questions in multiple languages
  Given the system supports 25+ languages
  When a question is submitted in a supported language
  Then the system processes it and returns a verdict
  And the verdict is language-agnostic (based on corpus content)

Scenario: UI displays in the user's language
  Given the user selects a language
  When the UI is displayed
  Then labels and messages are in the selected language
  And RTL languages are rendered correctly
```

**Edge Cases:**
- Mixed-language questions
- Unsupported language (graceful error)
- RTL language rendering
- Language detection failure

**Security Scenarios:**

```
Scenario: Language input is validated
  Given a question in any language
  When it is processed
  Then it is validated against injection attempts
  And malicious payloads are rejected regardless of language
```

**Performance Requirements:**
- Language detection: <100ms
- Translation (if used): <2s

**Reliability Requirements:**
- Error handling: Unsupported language returns clear error
- Timeout: N/A
- Retry: 0
- Graceful degradation: If translation fails, return `unavailable`

---

### Story US-14: Horizontal Scaling Path

**Epic:** —
**Priority:** Could
**RICE:** 0.2 (Reach=4, Impact=1, Confidence=50%, Effort=10)

**User Story:** As a system architect, I want a documented path for horizontal scaling beyond single-node SQLite, so that mizan can handle increased load if the customer base grows.

**INVEST Checklist:**
- [x] Independent — can be implemented without other stories
- [x] Negotiable — scaling strategy, target architecture
- [x] Valuable — future-proofing
- [x] Estimable — ~10 person-weeks (XL)
- [ ] Small — exceeds single sprint; needs phasing
- [x] Testable — scaling path is documented and benchmarked

**Note:** This story is XL effort and is explicitly a "Won't" in the current spec (local SQLite is zero-ops; customer accepts single-node). Included for completeness but likely deferred.

**Acceptance Criteria:**

```
Scenario: Scaling path is documented
  Given the scaling path document
  When it is reviewed
  Then it describes the current single-node architecture
  And it identifies bottlenecks
  And it proposes a scaling strategy

Scenario: Scaling path is benchmarked
  Given the proposed scaling strategy
  When it is benchmarked
  Then throughput and latency are measured
  And results are documented
```

**Edge Cases:**
- N/A (documentation story)

**Security Scenarios:**

```
Scenario: Scaling does not compromise determinism
  Given a scaled deployment
  When verification is performed
  Then the 100x byte-identical determinism gate still passes
  And no node-specific state affects verdicts
```

**Performance Requirements:**
- N/A (documentation story)

**Reliability Requirements:**
- N/A (documentation story)

---

## Competitive Feature Comparison

| Feature | mizan (post-Sprint 1) | CiteCheck | CITEVERIFIER | HALLMARK | TRACE Gov | IETF VRO |
|---|---|---|---|---|---|---|
| Deterministic verification | ✅ Strict substring | ❌ LLM-as-judge | ❌ Probabilistic | N/A (benchmark) | N/A | N/A |
| Zero false positives | ✅ Design goal | ❌ Unknown | ❌ 88% FPR | N/A | N/A | N/A |
| Cryptographic attestation | ✅ VRO-aligned | ❌ None | ❌ None | N/A | ✅ Merkle-chain | ✅ Full VRO |
| Tamper-evident ledger | ✅ Merkle-chain | ❌ None | ❌ None | N/A | ✅ Merkle-chain | ✅ Hash-chained |
| Provider resilience | ✅ 2+ providers + local | ❌ Single LLM | ❌ Unknown | N/A | N/A | N/A |
| Honest degradation | ✅ 7 modes | ❌ Unknown | ❌ Unknown | N/A | N/A | N/A |
| Benchmark coverage | ✅ HALLMARK 14-type | ❌ Own benchmark | ❌ Own benchmark | ✅ 14-type taxonomy | N/A | N/A |
| Per-claim SSR | ✅ TREC 2025 aligned | ❌ Unknown | ❌ Unknown | ❌ Unknown | N/A | N/A |
| MCP server | ✅ Sprint 2 | ✅ Yes | ❌ Unknown | N/A | N/A | N/A |
| Language support | ⚠️ Arabic-first | ❌ Unknown | ❌ Unknown | N/A | N/A | N/A |

**Table-stakes features mizan now covers:** Deterministic verification, cryptographic attestation, tamper-evident ledger, provider resilience, honest degradation, benchmark coverage, per-claim SSR.

**Differentiators mizan uniquely combines:** Deterministic substring-only verification + cryptographic attestation + Merkle-chain ledger + honest degradation matrix. No competitor combines all four.

**Missing table-stakes:** MCP server (deferred to Sprint 2), multi-language support (deferred, Track 2 not targeted).

---

## Risk Register

| Story | Risk | Severity | Likelihood | Mitigation | Residual |
|---|---|---|---|---|---|
| US-01 | Merkle-chain bugs break existing ledger | MEDIUM | Low | Property-based tests; genesis migration path | Low |
| US-02 | Chain verify too slow for large ledger | LOW | Low | Streaming verification; O(1) memory | Low |
| US-03 | IETF VRO draft changes | MEDIUM | Low | Pin to draft-02; document version | Low |
| US-04 | HALLMARK taxonomy misinterpreted | MEDIUM | Medium | Map to paper directly; commit matrix | Low |
| US-05 | Red-team set incomplete | MEDIUM | Medium | All 14 types mandatory; coverage matrix | Low |
| US-06 | Provider API drift | HIGH | Medium | Pin SDK version; adapter isolation | Low |
| US-07 | Precomputed transcripts stale | LOW | Low | Labelled with timestamp; staleness warning | Low |
| US-08 | Degradation mode not triggered correctly | MEDIUM | Low | Test each mode; named exit codes | Low |
| US-09 | SSR segmentation non-deterministic | MEDIUM | Low | Deterministic segmentation rules | Low |
| US-10 | Ollama not available in customer env | MEDIUM | Medium | Optional dependency; graceful skip | Medium |
| US-11 | MCP SDK breaking changes | MEDIUM | Low | Pin SDK version; isolate adapter | Low |
| US-12 | Benchmark harness flaky | LOW | Low | Deterministic tests; no network dependency | Low |
| US-13 | Translation quality poor | HIGH | Medium | Human evaluation; fallback to English | Medium |
| US-14 | Scaling compromises determinism | HIGH | Low | Architecture review; determinism gate | Low |

---

## Task Definitions

### US-01: Merkle-Chain Prev-Hash Linking
```json
{
  "goal": "Add prev-hash linking to runs.jsonl entries for tamper-evidence",
  "deliverables": [
    { "name": "packages/mizan-core/src/chain.ts", "format": "TypeScript module" },
    { "name": "packages/mizan-core/test/chain.test.ts", "format": "Test file" },
    { "name": "data/runs.jsonl", "format": "Ledger file (migrated)" }
  ],
  "successCriteria": [
    { "text": "Genesis entry has prevHash of 64 zeros", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-core/test/chain.test.ts" },
    { "text": "Chain detects tamper at exact index", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-core/test/chain.test.ts" },
    { "text": "Property-based test: append N, verify, tamper K, detect at K", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-core/test/chain.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-02: Chain Verify Script
```json
{
  "goal": "Create standalone script that verifies runs.jsonl chain integrity",
  "deliverables": [
    { "name": "scripts/verify-chain.ts", "format": "TypeScript script" },
    { "name": "scripts/test-verify-chain.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "Valid chain exits 0", "verificationKind": "command_exit_0", "verificationSpec": "bun run scripts/verify-chain.ts" },
    { "text": "Tampered chain exits non-zero with index", "verificationKind": "command_exit_0", "verificationSpec": "bun run scripts/verify-chain.ts --expect-tamper" },
    { "text": "10,000 entries verify in <60s", "verificationKind": "command_exit_0", "verificationSpec": "bun run scripts/verify-chain.ts --benchmark" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-03: IETF VRO-Aligned attestation.json
```json
{
  "goal": "Map attestation.json to IETF VRO 8 control areas and 3 maturity levels",
  "deliverables": [
    { "name": "packages/mizan-corpus/src/attestation-schema.ts", "format": "TypeScript module" },
    { "name": "attestation.json", "format": "JSON file" },
    { "name": "packages/mizan-corpus/test/attestation.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "attestation.json contains all 8 control areas", "verificationKind": "contains_text", "verificationSpec": "attestation.json" },
    { "text": "100x byte-identical determinism test passes", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-corpus/test/attestation.test.ts" },
    { "text": "Schema validation rejects unknown fields", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-corpus/test/attestation.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-04: HALLMARK 14-Type Coverage Matrix
```json
{
  "goal": "Create coverage matrix mapping all 14 HALLMARK types to test cases",
  "deliverables": [
    { "name": "docs/hallmark-coverage-matrix.md", "format": "Markdown document" },
    { "name": "packages/mizan-verify/test/hallmark-coverage.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "All 14 types are mapped", "verificationKind": "contains_text", "verificationSpec": "docs/hallmark-coverage-matrix.md" },
    { "text": "Each type has at least one test case", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-verify/test/hallmark-coverage.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-05: Red-Team Set Expansion
```json
{
  "goal": "Create red-team test set covering all 14 HALLMARK types with zero false verified",
  "deliverables": [
    { "name": "packages/mizan-verify/test/red-team-fixtures.ts", "format": "TypeScript fixtures" },
    { "name": "packages/mizan-verify/test/red-team.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "At least 14 red-team cases exist", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-verify/test/red-team.test.ts" },
    { "text": "Zero false verified verdicts", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-verify/test/red-team.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-06: Provider Abstraction
```json
{
  "goal": "Implement provider trait with at least 2 concrete adapters",
  "deliverables": [
    { "name": "packages/mizan-agent/src/provider.ts", "format": "TypeScript module" },
    { "name": "packages/mizan-agent/src/providers/", "format": "Provider adapters directory" },
    { "name": "packages/mizan-agent/test/provider.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "Provider trait is defined", "verificationKind": "contains_text", "verificationSpec": "packages/mizan-agent/src/provider.ts" },
    { "text": "At least 2 adapters implement the trait", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-agent/test/provider.test.ts" },
    { "text": "Failover test passes", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-agent/test/provider.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-07: Precomputed Transcripts
```json
{
  "goal": "Ship precomputed transcripts labelled with metadata",
  "deliverables": [
    { "name": "data/precomputed/", "format": "Directory of transcript files" },
    { "name": "packages/mizan-agent/src/precomputed.ts", "format": "TypeScript module" }
  ],
  "successCriteria": [
    { "text": "Precomputed transcripts are present", "verificationKind": "file_exists", "verificationSpec": "data/precomputed/" },
    { "text": "Each transcript is labelled as precomputed", "verificationKind": "contains_text", "verificationSpec": "data/precomputed/" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-08: Honest Degradation Matrix
```json
{
  "goal": "Document and test all 7 failure modes with correct surfaces and exit codes",
  "deliverables": [
    { "name": "docs/degradation-matrix.md", "format": "Markdown document" },
    { "name": "packages/mizan-core/test/degradation.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "All 7 failure modes documented", "verificationKind": "contains_text", "verificationSpec": "docs/degradation-matrix.md" },
    { "text": "Each mode has a test", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-core/test/degradation.test.ts" },
    { "text": "No canned answers or silent mocks", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-core/test/degradation.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-09: Per-Claim SSR Metric
```json
{
  "goal": "Implement per-claim Sentence-Support Rate evaluation metric",
  "deliverables": [
    { "name": "packages/mizan-verify/src/ssr.ts", "format": "TypeScript module" },
    { "name": "packages/mizan-verify/test/ssr.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "SSR is computed per sentence", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-verify/test/ssr.test.ts" },
    { "text": "Golden set achieves >=99% SSR", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-verify/test/ssr.test.ts" },
    { "text": "Red-team set achieves 0% SSR", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-verify/test/ssr.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-10: Local Fallback (Ollama)
```json
{
  "goal": "Implement Ollama as local fallback provider",
  "deliverables": [
    { "name": "packages/mizan-agent/src/providers/ollama.ts", "format": "TypeScript module" },
    { "name": "packages/mizan-agent/test/ollama.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "Ollama adapter implements provider trait", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-agent/test/ollama.test.ts" },
    { "text": "Ollama not running returns model unavailable", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-agent/test/ollama.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-11: MCP Server Framework
```json
{
  "goal": "Expose mizan verification as an MCP server tool",
  "deliverables": [
    { "name": "packages/mizan-mcp/src/server.ts", "format": "TypeScript module" },
    { "name": "packages/mizan-mcp/test/server.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "MCP server exposes verification tool", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-mcp/test/server.test.ts" },
    { "text": "Server is read-only", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-mcp/test/server.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-12: Full Benchmark Harness
```json
{
  "goal": "Create unified benchmark harness running all test suites",
  "deliverables": [
    { "name": "scripts/benchmark.ts", "format": "TypeScript script" },
    { "name": "scripts/test-benchmark.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "Harness runs all suites", "verificationKind": "command_exit_0", "verificationSpec": "bun run scripts/benchmark.ts" },
    { "text": "Report includes SSR and false positive rate", "verificationKind": "contains_text", "verificationSpec": "benchmark-report.json" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-13: 25+ Language Support
```json
{
  "goal": "Support questions in 25+ languages",
  "deliverables": [
    { "name": "packages/mizan-core/src/i18n.ts", "format": "TypeScript module" },
    { "name": "packages/mizan-core/test/i18n.test.ts", "format": "Test file" }
  ],
  "successCriteria": [
    { "text": "System accepts questions in 25+ languages", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-core/test/i18n.test.ts" },
    { "text": "Unsupported language returns clear error", "verificationKind": "test_passes", "verificationSpec": "bun test packages/mizan-core/test/i18n.test.ts" }
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

### US-14: Horizontal Scaling Path
```json
{
  "goal": "Document horizontal scaling path for mizan",
  "deliverables": [
    { "name": "docs/scaling-path.md", "format": "Markdown document" }
  ],
  "successCriteria": [
    { "text": "Scaling path is documented", "verificationKind": "file_exists", "verificationSpec": "docs/scaling-path.md" },
    { "text": "Determinism is preserved under scaling", "verificationKind": "contains_text", "verificationSpec": "docs/scaling-path.md" }
  ],
  "accessNeeded": ["read", "write"]
}
```

---

```json
{"stories":[{"id":"US-01","title":"Merkle-Chain Prev-Hash Linking in runs.jsonl","epic":"E1","priority":"Must","rice":12.0,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["Genesis entry is written with prevHash of 64 zeros","Subsequent entries link to previous entry's hash","Chain detects tampering at exact index","Chain detects insertion of forged entry","Chain detects deletion of entry","Empty file is valid chain of length 0","Single entry file is valid chain of length 1","Concurrent appends are serialized"],"edgeCases":["Empty file (0 entries)","Single entry (genesis only)","Very large file (10k+ entries)","Entry with special characters","File with trailing newline vs no trailing newline","Corrupted JSON in one entry","File permissions prevent reading"],"performance":{"append":"<5ms per entry","verify":"<60s for 10000 entries","memory":"O(1) streaming"},"reliability":{"errorHandling":"Result<T,E> with ChainVerifyError","timeout":"N/A","retry":0,"degradation":"If file unreadable, return unverifiable chain status"}},{"id":"US-02","title":"Chain Verify Script (Judge-Runnable)","epic":"E1","priority":"Must","rice":14.0,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["Valid chain exits 0 with success message","Tampered chain exits non-zero with index","Script handles missing file gracefully","Script handles empty file","Script output is machine-parseable with --json flag","Script completes within 60 seconds for large ledger"],"edgeCases":["Missing file","Empty file","File with only whitespace","File with invalid JSON on one line","Very large file (10k+ entries)","File with CRLF vs LF line endings","File with BOM"],"performance":{"verify":"<60s for 10000 entries","memory":"O(1) streaming","startup":"<500ms"},"reliability":{"errorHandling":"Named exit codes (0=valid, 1=tampered, 2=file error, 3=decode error)","timeout":"N/A","retry":0,"degradation":"If file unreadable, exit with code 2"}},{"id":"US-03","title":"IETF VRO-Aligned attestation.json Schema","epic":"E2","priority":"Must","rice":10.8,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["attestation.json contains all 8 IETF VRO control areas","attestation.json declares maturity level 1 2 or 3","attestation.json is 100x byte-identical across runs","attestation.json includes corpus snapshot hash","attestation.json includes determinism evidence","Unknown fields are rejected","Missing control area fails validation"],"edgeCases":["Empty attestation.json","attestation.json with extra unknown fields","attestation.json with wrong types","attestation.json with null values","Corpus DB modified after attestation","Concurrent attestation generation"],"performance":{"generation":"<100ms","validation":"<50ms","schemaValidation":"<10ms"},"reliability":{"errorHandling":"Result<T,E> with AttestationError","timeout":"N/A","retry":0,"degradation":"If attestation invalid system refuses to process queries"}},{"id":"US-04","title":"HALLMARK 14-Type Coverage Matrix","epic":"E3","priority":"Must","rice":6.4,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["All 14 HALLMARK types are mapped","Coverage matrix is committed to repository","Each type has a defined expected verdict","Coverage matrix includes difficulty tier","Coverage matrix is citable"],"edgeCases":["A HALLMARK type not applicable to religious content","A type that maps to multiple test cases","A type where expected verdict is unverifiable","Overlapping types"],"performance":{"matrixGeneration":"N/A","testExecution":"<5s per type"},"reliability":{"errorHandling":"If test case fails coverage matrix must be updated","timeout":"N/A","retry":0,"degradation":"N/A"}},{"id":"US-05","title":"Red-Team Set Expansion to All 14 Types","epic":"E3","priority":"Must","rice":9.6,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["Red-team set contains at least one case per HALLMARK type","Zero false verified verdicts on red-team set","Red-team cases are clearly labelled as fabricated","Red-team set is executable as a test suite","Red-team set includes adversarial variations"],"edgeCases":["Fabricated citation that is substring of real citation","Fabricated citation with Unicode lookalikes","Fabricated citation with extra whitespace","Fabricated citation with mixed Arabic/English","Empty citation string","Very long fabricated citation"],"performance":{"fullSuite":"<30s for 14+ cases","perCase":"<5s"},"reliability":{"errorHandling":"If red-team case crashes verifier that is a test failure","timeout":"10s per case","retry":0,"degradation":"If case produces unexpected error test fails loudly"}},{"id":"US-06","title":"Provider Abstraction (Trait + 2 Adapters)","epic":"E4","priority":"Must","rice":7.2,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["Provider trait defines a common interface","At least two provider adapters implement the trait","Provider failover occurs within 5 seconds","Provider selection is configurable","Provider errors are honest","Provider adapter normalizes responses"],"edgeCases":["Both providers unavailable","Provider returns malformed JSON","Provider returns empty string","Provider timeout at exactly the timeout boundary","Provider returns partial response then disconnects","API key missing or invalid for one provider"],"performance":{"selection":"<1ms","failover":"<5s","normalization":"<10ms"},"reliability":{"errorHandling":"Result<T,E> with ProviderError","timeout":"30s per provider attempt","retry":1,"degradation":"If all providers fail return model unavailable"}},{"id":"US-07","title":"Precomputed Transcripts Shipped and Labelled","epic":"E4","priority":"Must","rice":14.0,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["Precomputed transcripts are shipped with the product","Each transcript is labelled as precomputed","Precomputed transcripts are clearly distinguished from live results","Precomputed transcripts include verification results","Precomputed transcripts can be invalidated"],"edgeCases":["No precomputed transcripts available","Transcript file corrupted","Transcript references corpus content that no longer exists","Multiple transcripts for the same question"],"performance":{"lookup":"<10ms","loading":"<50ms"},"reliability":{"errorHandling":"If transcript corrupted return error","timeout":"N/A","retry":0,"degradation":"If no transcript exists proceed with live provider"}},{"id":"US-08","title":"Honest Degradation Matrix (7 Failure Modes)","epic":"E5","priority":"Must","rice":12.0,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["All 7 failure modes are documented","Each failure mode has a named exit code","No failure mode produces a canned answer","No failure mode produces a silent mock","Provider down produces model unavailable","Corpus miss produces no sources found","Verification timeout produces unverifiable","Ledger write failure marks run untrusted","Attestation mismatch produces loud error","Tafsir backend unreachable produces unavailable","Second ranker down produces semanticRanking unavailable"],"edgeCases":["Multiple failure modes occurring simultaneously","Failure mode during a failure mode","Recovery from a failure mode","Failure mode in a long-running batch process"],"performance":{"detection":"<100ms","surfacing":"<50ms","exitCodeMapping":"<1ms"},"reliability":{"errorHandling":"Each failure mode has exactly one correct surface","timeout":"Per-mode timeouts as defined in spec","retry":"Per spec (0-1 per path)","degradation":"Each mode degrades to its documented surface"}},{"id":"US-09","title":"Per-Claim SSR Evaluation Metric","epic":"E6","priority":"Should","rice":5.6,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["SSR is computed per generated sentence","A sentence is supported only if it contains a verified citation","Golden set achieves at least 99% SSR","Red-team set achieves 0% SSR","SSR is published in benchmark results","SSR handles edge cases in sentence segmentation"],"edgeCases":["Response with 0 sentences","Response with 1 sentence","Response with 100+ sentences","Sentence with multiple citations","Arabic sentence with no clear sentence boundary","Response with only citations and no prose"],"performance":{"computation":"<100ms per response","segmentation":"<50ms per response"},"reliability":{"errorHandling":"If sentence segmentation fails return unverifiable SSR","timeout":"N/A","retry":0,"degradation":"If SSR cannot be computed report as unavailable"}},{"id":"US-10","title":"Local Fallback (Ollama) Functional","epic":"E4","priority":"Should","rice":2.7,"sprint":1,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["Ollama adapter implements the provider trait","Ollama adapter connects to local Ollama instance","Ollama adapter handles Ollama not running","Ollama adapter normalizes responses","Ollama fallback is automatic"],"edgeCases":["Ollama running but model not loaded","Ollama returns empty response","Ollama returns malformed JSON","Ollama timeout","Ollama on non-default port"],"performance":{"connection":"<1s","response":"variable timeout at 30s","failover":"<5s"},"reliability":{"errorHandling":"Result<T,E> with ProviderError Ollama","timeout":"30s","retry":1,"degradation":"If Ollama fails return model unavailable"}},{"id":"US-11","title":"MCP Server Framework","epic":"E4","priority":"Could","rice":2.0,"sprint":2,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["MCP server exposes a verification tool","MCP server is read-only","MCP server handles multiple concurrent clients"],"edgeCases":["Client sends malformed MCP request","Client disconnects mid-request","Very long question","Concurrent verification requests"],"performance":{"toolDiscovery":"<100ms","verification":"same as direct verification","concurrentClients":"support at least 10"},"reliability":{"errorHandling":"MCP errors returned as tool errors","timeout":"30s per request","retry":0,"degradation":"If verification fails return honest error via MCP"}},{"id":"US-12","title":"Full Benchmark Harness","epic":"E3/E6","priority":"Should","rice":5.6,"sprint":2,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":true,"testable":true},"acceptanceCriteria":["Benchmark harness runs all test suites","Report includes key metrics","Benchmark harness exits non-zero on failure"],"edgeCases":["Empty test suite","All tests pass","All tests fail","Test suite with only one case"],"performance":{"fullSuite":"<5 minutes","reportGeneration":"<1s"},"reliability":{"errorHandling":"If suite fails to load report error and continue","timeout":"5 minutes total","retry":0,"degradation":"If one suite fails others still run"}},{"id":"US-13","title":"25+ Language Support","epic":"","priority":"Could","rice":0.3,"sprint":2,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":false,"testable":true},"acceptanceCriteria":["System accepts questions in multiple languages","UI displays in the user's language"],"edgeCases":["Mixed-language questions","Unsupported language","RTL language rendering","Language detection failure"],"performance":{"detection":"<100ms","translation":"<2s"},"reliability":{"errorHandling":"Unsupported language returns clear error","timeout":"N/A","retry":0,"degradation":"If translation fails return unavailable"}},{"id":"US-14","title":"Horizontal Scaling Path","epic":"","priority":"Could","rice":0.2,"sprint":2,"invest":{"independent":true,"negotiable":true,"valuable":true,"estimable":true,"small":false,"testable":true},"acceptanceCriteria":["Scaling path is documented","Scaling path is benchmarked"],"edgeCases":["N/A documentation story"],"performance":{"N/A":"documentation story"},"reliability":{"N/A":"documentation story"}}],"acceptanceCriteria":[{"storyId":"US-01","criteria":["Genesis entry is written with prevHash of 64 zeros","Subsequent entries link to previous entry's hash","Chain detects tampering at exact index","Chain detects insertion of forged entry","Chain detects deletion of entry","Empty file is valid chain of length 0","Single entry file is valid chain of length 1","Concurrent appends are serialized"]},{"storyId":"US-02","criteria":["Valid chain exits 0 with success message","Tampered chain exits non-zero with index","Script handles missing file gracefully","Script handles empty file","Script output is machine-parseable with --json flag","Script completes within 60 seconds for large ledger"]},{"storyId":"US-03","criteria":["attestation.json contains all 8 IETF VRO control areas","attestation.json declares maturity level 1 2 or 3","attestation.json is 100x byte-identical across runs","attestation.json includes corpus snapshot hash","attestation.json includes determinism evidence","Unknown fields are rejected","Missing control area fails validation"]},{"storyId":"US-04","criteria":["All 14 HALLMARK types are mapped","Coverage matrix is committed to repository","Each type has a defined expected verdict","Coverage matrix includes difficulty tier","Coverage matrix is citable"]},{"storyId":"US-05","criteria":["Red-team set contains at least one case per HALLMARK type","Zero false verified verdicts on red-team set","Red-team cases are clearly labelled as fabricated","Red-team set is executable as a test suite","Red-team set includes adversarial variations"]},{"storyId":"US-06","criteria":["Provider trait defines a common interface","At least two provider adapters implement the trait","Provider failover occurs within 5 seconds","Provider selection is configurable","Provider errors are honest","Provider adapter normalizes responses"]},{"storyId":"US-07","criteria":["Precomputed transcripts are shipped with the product","Each transcript is labelled as precomputed","Precomputed transcripts are clearly distinguished from live results","Precomputed transcripts include verification results","Precomputed transcripts can be invalidated"]},{"storyId":"US-08","criteria":["All 7 failure modes are documented","Each failure mode has a named exit code","No failure mode produces a canned answer","No failure mode produces a silent mock","Provider down produces model unavailable","Corpus miss produces no sources found","Verification timeout produces unverifiable","Ledger write failure marks run untrusted","Attestation mismatch produces loud error","Tafsir backend unreachable produces unavailable","Second ranker down produces semanticRanking unavailable"]},{"storyId":"US-09","criteria":["SSR is computed per generated sentence","A sentence is supported only if it contains a verified citation","Golden set achieves at least 99% SSR","Red-team set achieves 0% SSR","SSR is published in benchmark results","SSR handles edge cases in sentence segmentation"]},{"storyId":"US-10","criteria":["Ollama adapter implements the provider trait","Ollama adapter connects to local Ollama instance","Ollama adapter handles Ollama not running","Ollama adapter normalizes responses","Ollama fallback is automatic"]},{"storyId":"US-11","criteria":["MCP server exposes a verification tool","MCP server is read-only","MCP server handles multiple concurrent clients"]},{"storyId":"US-12","criteria":["Benchmark harness runs all test suites","Report includes key metrics","Benchmark harness exits non-zero on failure"]},{"storyId":"US-13","criteria":["System accepts questions in multiple languages","UI displays in the user's language"]},{"storyId":"US-14","criteria":["Scaling path is documented","Scaling path is benchmarked"]}],"dependencies":[{"from":"US-01","to":"US-02","type":"blocking","description":"Chain verify script requires Merkle-chain implementation"},{"from":"US-04","to":"US-05","type":"blocking","description":"Red-team expansion requires HALLMARK coverage matrix"},{"from":"US-06","to":"US-07","type":"blocking","description":"Precomputed transcripts require provider abstraction"},{"from":"US-06","to":"US-10","type":"blocking","description":"Ollama fallback requires provider abstraction"},{"from":"US-04","to":"US-12","type":"shared","description":"Benchmark harness requires HALLMARK coverage matrix"},{"from":"US-05","to":"US-12","type":"shared","description":"Benchmark harness requires red-team set"},{"from":"US-01","to":"US-08","type":"shared","description":"Degradation matrix includes ledger write failure mode"},{"from":"US-03","to":"US-08","type":"shared","description":"Degradation matrix includes attestation mismatch mode"}]}
```

## Specification
---

## 1. Executive Summary

A real customer deal opportunity requires mizan to be not just "production-ready" but "industry-leading." This plan bridges internal needs with external best practices by harvesting global best-in-class patterns and integrating them into the existing architecture. The core thesis: **mizan's deterministic verification + cryptographic attestation is a market differentiator that no competitor combines.** The plan focuses on three adoption-ready improvements — Merkle-chain ledger (TRACE Gov pattern), IETF VRO-aligned attestation (regulatory alignment), and HALLMARK benchmark coverage — while explicitly rejecting patterns that would compromise determinism (LLM-as-judge, fuzzy matching). Expected impact: a defensible, auditable, customer-deployable platform that exceeds competitor CiteCheck (88.7 macro-F1, non-deterministic) and CITEVERIFIER (88% false positive rate) on the dimension that matters most for religious content: **zero false positives on fabricated citations.**

---

## 2. Business Value Analysis

**Primary Value Driver:** Trust and compliance. In Islamic AI, a false `verified` on a fabricated hadith is a religious harm, not a bug. The customer deal hinges on mizan's ability to prove, cryptographically and deterministically, that its verdicts are computed, not asserted.

### MoSCoW Classification

| Priority | Requirement | Rationale |
|---|---|---|
| **Must** | Merkle-chain prev-hash linking in runs.jsonl | Industry standard; tamper-evidence is a customer requirement |
| **Must** | IETF VRO-aligned attestation.json | Regulatory alignment (EU AI Act, NIST AI RMF); customer compliance gate |
| **Must** | HALLMARK 14-type hallucination taxonomy coverage | Benchmark completeness; customer evaluation criterion |
| **Must** | Zero false `verified` on red-team set (G-6) | Non-negotiable release gate; core differentiator |
| **Must** | Deterministic verifier with no fuzzy/embedding matching | Core differentiator; CWE-345 control |
| **Should** | Provider abstraction with local fallback | Single-provider outage = full degradation; customer SLA |
| **Should** | Honest degradation matrix (all 7 failure modes) | Customer operational confidence |
| **Should** | Per-claim SSR-style evaluation metric | TREC 2025 RAG Track alignment |
| **Could** | MCP server framework | Both leaders ship MCP; deferred per R18 |
| **Could** | 25+ language support | Gap vs Ansari; Track 2 not targeted |
| **Won't** | LLM-as-judge verification | Non-deterministic; violates core architecture |
| **Won't** | Fuzzy/embedding similarity matching | G-1 forbids; CWE-345 vulnerability |
| **Won't** | External API dependencies for verification | Network non-determinism |
| **Won't** | Horizontal scaling via distributed corpus | Local SQLite is zero-ops; customer accepts single-node |

---

## 3. Risk Register

| # | Risk | Severity | Likelihood | Mitigation | Residual |
|---|---|---|---|---|---|
| R1 | Single LLM provider outage during customer demo | **HIGH** | Medium | Provider abstraction + precomputed transcripts + local fallback | Low |
| R2 | Effect `4.0.0-beta.83` API drift | **HIGH** | Medium | Pin exact; 60-min spike; architectural containment to boundary seam | Low |
| R3 | Merkle-chain bugs break existing ledger | **MEDIUM** | Low | Property-based tests; chain verify script; genesis migration path | Low |
| R4 | HALLMARK taxonomy coverage gaps | **MEDIUM** | Medium | Map all 14 types to test cases; commit coverage matrix | Low |
| R5 | Customer requires beyond Track 4 scope | **MEDIUM** | Medium | MoSCoW discipline; explicit Won't-Have list | Medium |
| R6 | Corpus licence compliance (Open-Hadith-Data) | **HIGH** | Low | Drop source if unconfirmed; verifier is source-agnostic | Low |
| R7 | Web app minimal UI insufficient for demo | **MEDIUM** | Medium | Arabic-first RTL; 3 badge states; injection-inert | Low |
| R8 | p50 <5s is provider-bound | **MEDIUM** | High | Report honestly; do not let architecture metric be missed by model latency | Medium |
| R9 | Attestation mismatch in customer environment | **MEDIUM** | Low | Committed attestation.json; ingest fails closed | Low |
| R10 | Team capacity: 6 new packages in 3 days | **MEDIUM** | Medium | Bun workspaces; no turbo; kill-gate sequencing | Medium |

### Security Risks (OWASP)

| Threat | Category | Control | Gate |
|---|---|---|---|
| Fabricated data accepted | CWE-345 | One dependency; containment-only | G-1 |
| Prompt injection via corpus | LLM01/A03 | Fenced, capped, data-only | S13 |
| Corpus tampering | A08 | Hash-pinned; fail-closed | S8 |
| Forgeable badge | A04 | Zero false `verified` gate | G-6 |
| XSS via corpus text | A03 | Text-only rendering | G-2 |
| SSRF | A10 | Allowlisted URLs only | S8/S9 |
| Secrets exposure | A05 | `.env*` gitignored; gitleaks | G-4 |
| Bidi spoofing | — | `normalizeForRender` strips bidi | S15 |

### Reliability Risks

| Failure | Surface | Recovery | Retry |
|---|---|---|---|
| Provider down | `model unavailable` | Precomputed transcripts | 1 |
| Corpus miss | `no sources found` | Honest empty state | 1 |
| Verification timeout | `unverifiable` | Never `verified` | 0 |
| Ledger write failure | Run untrusted | Chain refuses | 0 |
| Attestation mismatch | Loud error | No verdict | 0 |
| Tafsir unreachable | `unavailable` | No fabricated tafsir | 1 |

---

## 4. Epics

| Epic | Why | Success Metrics |
|---|---|---|
| **E1: Tamper-Evident Ledger** | Industry standard; customer compliance | Chain verify <60s; tamper detection at exact index; genesis migration tested |
| **E2: IETF VRO Attestation** | Regulatory alignment; compliance gate | 8 control areas mapped; 100x byte-identical; 3 maturity levels self-assessed |
| **E3: HALLMARK Coverage** | Benchmark completeness; evaluation criterion | All 14 types mapped; coverage matrix committed; rejection rate per type |
| **E4: Provider Resilience** | Single-provider outage = full degradation | ≥2 providers; local fallback; failover <5s; transcripts shipped |
| **E5: Honest Degradation** | Customer operational confidence | 7 failure modes tested; named exit codes; judge-readable matrix |
| **E6: Per-Claim SSR** | TREC 2025 alignment | SSR computed; golden ≥99%; red-team 0 false `verified` |

---

## 5. Security Requirements

- **OWASP:** A03, A04, A05, A08, A10, CWE-345, LLM01
- **Data Sensitivity:** Low PII, high reputational sensitivity (integrity is the asset)
- **Auth Model:** None (local read-only demo); API key via env var; no hardcoded credentials

---

## 6. Reliability Requirements

- **Error Handling:** `Result<T,E>` at every boundary; no `throw` crosses packages
- **Timeouts:** Retrieval 2s, Generation 30s, Verification 10s, Gate <50ms, Trace <100ms
- **Retry:** Retrieval 1, Generation 1, Verification 0, Trace 0, Tafsir 1

---

## 7. ADRs

| ADR | Decision | Rationale | Status |
|---|---|---|---|
| ADR-001 | Adopt Merkle-chain for runs.jsonl | Industry standard; customer compliance | Proposed |
| ADR-002 | Align attestation.json to IETF VRO | Regulatory alignment; deterministic VRO | Proposed |
| ADR-003 | Reject LLM-as-judge verification | Non-deterministic; CWE-345 risk | Accepted |
| ADR-004 | Reject fuzzy/embedding matching | G-1 forbids; fabrication-acceptance hole | Accepted |
| ADR-005 | Provider abstraction + local fallback | Single-provider outage = full degradation | Proposed |

---

## 8. Sprint Backlog

### Sprint 1 (Must-Have)

| # | Item | Est. | Risk |
|---|---|---|---|
| 1 | Merkle-chain prev-hash linking | M | Low |
| 2 | Chain verify script | S | Low |
| 3 | IETF VRO attestation schema | M | Low |
| 4 | HALLMARK 14-type coverage matrix | M | Medium |
| 5 | Red-team expansion to 14 types | M | Medium |
| 6 | Provider abstraction (trait + 2 adapters) | L | Medium |
| 7 | Precomputed transcripts shipped | S | Low |
| 8 | Honest degradation matrix | M | Low |
| 9 | Per-claim SSR metric | M | Low |
| 10 | Local fallback (Ollama) | L | Medium |

### Sprint 2 (Should/Could)

| # | Item | Est. | Risk |
|---|---|---|---|
| 11 | MCP server framework | L | Medium |
| 12 | Full benchmark harness | M | Low |
| 13 | 25+ language support | XL | High |
| 14 | Horizontal scaling path | XL | High |

---

## Wiki Integration

Full specification written to wiki: **spec-mizan-production-readiness-2026-10-02** (tags: spec, mizan, production-readiness, deal-readiness, priority-must).

---

## Delegation to PM

- **Summary:** Customer deal opportunity requires industry-leading production readiness. Core differentiator is deterministic verification + cryptographic attestation.
- **Wiki:** spec-mizan-production-readiness-2026-10-02
- **MoSCoW:** 5 Must, 3 Should, 2 Could, 4 Won't (see §2)
- **Risk Register:** 10 risks (3 HIGH, 6 MEDIUM, 1 LOW) with mitigations (see §3)
- **Success Metrics:** Per-epic metrics defined (see §4)
- **NFRs:** Performance (normalize ≥50k chars/s, retrieval p95 <2s, verify p50 <50ms), Security (7 gates, schema-first, no raw-HTML), Scalability (single-node SQLite), Observability (RunTrace, chain verify, degradation matrix)
- **Security:** OWASP A03/A04/A05/A08/A10/CWE-345/LLM01; low PII; no auth model
- **Reliability:** Result<T,E> everywhere; timeouts 2s-30s; retry 0-1 per path
- **Observability:** RunTrace per run (hash-only), chain verify script, degradation matrix, per-claim verdict + matchStrength

```json
{"executiveSummary":"A real customer deal opportunity requires mizan to be not just production-ready but industry-leading. This plan bridges internal needs with external best practices by harvesting global best-in-class patterns. Core thesis: mizan's deterministic verification + cryptographic attestation is a market differentiator that no competitor combines. The plan focuses on three adoption-ready improvements — Merkle-chain ledger (TRACE Gov pattern), IETF VRO-aligned attestation (regulatory alignment), and HALLMARK benchmark coverage — while explicitly rejecting patterns that would compromise determinism (LLM-as-judge, fuzzy matching). Expected impact: a defensible, auditable, customer-deployable platform that exceeds competitor CiteCheck (88.7 macro-F1, non-deterministic) and CITEVERIFIER (88% false positive rate) on the dimension that matters most for religious content: zero false positives on fabricated citations.","moscow":{"must":["Merkle-chain prev-hash linking in runs.jsonl","IETF VRO-aligned attestation.json schema","HALLMARK 14-type hallucination taxonomy coverage matrix","Zero false verified on red-team set (G-6 release gate)","Deterministic verifier with no fuzzy/embedding matching"],"should":["Provider abstraction with local fallback (Ollama)","Honest degradation matrix (all 7 failure modes tested)","Per-claim SSR-style evaluation metric"],"could":["MCP server framework","25+ language support"],"wont":["LLM-as-judge verification (non-deterministic, violates core architecture)","Fuzzy/embedding similarity matching (G-1 forbids, CWE-345 vulnerability)","External API dependencies for verification (network non-determinism)","Horizontal scaling via distributed corpus (local SQLite is zero-ops)"]},"riskRegister":[{"id":"R1","risk":"Single LLM provider outage during customer demo","severity":"HIGH","likelihood":"Medium","mitigation":"Provider abstraction + precomputed transcripts + local fallback (Ollama)","residual":"Low"},{"id":"R2","risk":"Effect 4.0.0-beta.83 API drift on critical path","severity":"HIGH","likelihood":"Medium","mitigation":"Pin exact version; 60-min spike on 3 APIs; architectural containment to boundary decode seam","residual":"Low"},{"id":"R3","risk":"Merkle-chain implementation bugs break existing ledger","severity":"MEDIUM","likelihood":"Low","mitigation":"Property-based tests; chain verify script; genesis hash migration path","residual":"Low"},{"id":"R4","risk":"HALLMARK taxonomy coverage gaps","severity":"MEDIUM","likelihood":"Medium","mitigation":"Map all 14 types to test cases; commit coverage matrix","residual":"Low"},{"id":"R5","risk":"Customer requires features beyond Track 4 scope","severity":"MEDIUM","likelihood":"Medium","mitigation":"MoSCoW discipline; explicit Won't-Have list; post-submission roadmap","residual":"Medium"},{"id":"R6","risk":"Corpus licence compliance (Open-Hadith-Data no explicit licence)","severity":"HIGH","likelihood":"Low","mitigation":"Drop source if unconfirmed by deadline; verifier is source-count-agnostic","residual":"Low"},{"id":"R7","risk":"Web app minimal UI insufficient for customer demo","severity":"MEDIUM","likelihood":"Medium","mitigation":"Arabic-first RTL; 3 badge states; injection-inert rendering","residual":"Low"},{"id":"R8","risk":"p50 <5s to first verdict is provider-bound","severity":"MEDIUM","likelihood":"High","mitigation":"Report honestly with provider name; do not let architecture metric be missed by model latency","residual":"Medium"},{"id":"R9","risk":"Attestation mismatch fails customer environment","severity":"MEDIUM","likelihood":"Low","mitigation":"Committed attestation.json; ingest fails closed; baseline count check","residual":"Low"},{"id":"R10","risk":"Team capacity: 6 new packages in 3 days","severity":"MEDIUM","likelihood":"Medium","mitigation":"Bun workspaces; no turbo; story 6 hard-boxed; kill-gate sequencing","residual":"Medium"}],"epics":[{"id":"E1","name":"Tamper-Evident Ledger (Merkle-Chain)","why":"Industry standard for audit trails; customer compliance requirement","successMetrics":["Chain verify script confirms 100% of entries in <60s","Tamper detection: any modified entry breaks chain at exact index","Genesis hash migration path tested","Property-based test: append N entries, verify chain, tamper entry K, detect at K"]},{"id":"E2","name":"IETF VRO-Aligned Attestation","why":"Regulatory alignment; customer compliance gate","successMetrics":["attestation.json contains all IETF VRO control areas","Determinism requirement: 100x byte-identical output verified","8 control areas mapped to concrete fields","3 maturity levels self-assessed and documented"]},{"id":"E3","name":"HALLMARK Benchmark Coverage","why":"Benchmark completeness; customer evaluation criterion","successMetrics":["All 14 hallucination types mapped to test cases","Coverage matrix committed and citable","Red-team set includes all 14 types","Rejection rate published per type"]},{"id":"E4","name":"Provider Resilience","why":"Single-provider outage = full degradation; customer SLA","successMetrics":["Provider abstraction supports at least 2 providers","Local fallback (Ollama) functional","Precomputed transcripts shipped and labelled","Provider failover <5s"]},{"id":"E5","name":"Honest Degradation Matrix","why":"Customer operational confidence; product integrity","successMetrics":["All 7 failure modes tested with named exit codes","No canned answers, no silent mocks, no partial answers shown as complete","Degradation matrix documented and judge-readable","Each failure mode has exactly one correct surface"]},{"id":"E6","name":"Per-Claim SSR Evaluation","why":"TREC 2025 RAG Track alignment; emerging standard","successMetrics":["Per-claim verdict implements SSR-style evaluation","Sentence-support rate computed and published","Golden set at least 99% correct","Red-team set 0 false verified"]}],"sprintBacklog":[{"sprint":1,"items":[{"id":1,"name":"Merkle-chain prev-hash linking in runs.jsonl","priority":"Must","estimate":"M","risk":"Low","dependsOn":[]},{"id":2,"name":"Chain verify script (judge-runnable, <60s)","priority":"Must","estimate":"S","risk":"Low","dependsOn":[1]},{"id":3,"name":"IETF VRO-aligned attestation.json schema","priority":"Must","estimate":"M","risk":"Low","dependsOn":[]},{"id":4,"name":"HALLMARK 14-type coverage matrix","priority":"Must","estimate":"M","risk":"Medium","dependsOn":[]},{"id":5,"name":"Red-team set expansion to all 14 types","priority":"Must","estimate":"M","risk":"Medium","dependsOn":[4]},{"id":6,"name":"Provider abstraction (trait + 2 adapters)","priority":"Must","estimate":"L","risk":"Medium","dependsOn":[]},{"id":7,"name":"Precomputed transcripts shipped and labelled","priority":"Must","estimate":"S","risk":"Low","dependsOn":[6]},{"id":8,"name":"Honest degradation matrix (7 failure modes)","priority":"Must","estimate":"M","risk":"Low","dependsOn":[]},{"id":9,"name":"Per-claim SSR evaluation metric","priority":"Should","estimate":"M","risk":"Low","dependsOn":[]},{"id":10,"name":"Local fallback (Ollama) functional","priority":"Should","estimate":"L","risk":"Medium","dependsOn":[6]}]},{"sprint":2,"items":[{"id":11,"name":"MCP server framework","priority":"Should","estimate":"L","risk":"Medium","dependsOn":[]},{"id":12,"name":"Full benchmark harness","priority":"Should","estimate":"M","risk":"Low","dependsOn":[]},{"id":13,"name":"25+ language support","priority":"Could","estimate":"XL","risk":"High","dependsOn":[]},{"id":14,"name":"Horizontal scaling path","priority":"Could","estimate":"XL","risk":"High","dependsOn":[]}]}],"adrs":[{"id":"ADR-001","title":"Merkle-Chain Ledger","context":"runs.jsonl appends hash-only traces but lacks explicit Merkle chaining. TRACE Gov and IETF draft both use hash-chained tamper-evident logs.","decision":"Adopt prev-hash linking (Merkle-chain pattern) for runs.jsonl.","rationale":"Industry standard for audit trails; customer compliance requirement; tamper-evidence is provable.","consequences":"Slightly more complex append logic; genesis hash migration path needed; chain verify script required.","status":"Proposed"},{"id":"ADR-002","title":"IETF VRO-Aligned Attestation","context":"attestation.json implements a lightweight VRO concept but does not explicitly align with IETF draft-hillier-certisyn control areas.","decision":"Map attestation.json fields to IETF VRO's 8 control areas and 3 maturity levels.","rationale":"Regulatory alignment (EU AI Act, NIST AI RMF); customer compliance gate; deterministic VRO mirrors our 100x byte-identical gate.","consequences":"attestation.json schema expansion; documentation update; maturity self-assessment required.","status":"Proposed"},{"id":"ADR-003","title":"Reject LLM-as-Judge Verification","context":"CiteCheck uses LLM-as-judge (88.7 macro-F1); this is non-deterministic and introduces CWE-345 risk.","decision":"Do NOT adopt LLM-as-judge verification. Deterministic substring-only verification is the core differentiator.","rationale":"Non-determinism is incompatible with our 100x byte-identical gate; CWE-345 vulnerability; a verifier that can be talked into confirming a fabrication is worse than no verifier.","consequences":"Lower recall than fuzzy approaches; zero false positives; strict verbatim quotation mandate.","status":"Accepted"},{"id":"ADR-004","title":"Reject Fuzzy/Embedding Matching","context":"Fuzzy matching would improve recall but introduces CWE-345 vulnerability. A feasibility spike proved that a fuzzy verifier scores an invented but plausible hadith as a high match.","decision":"Do NOT adopt fuzzy/embedding matching. G-1 gate enforces this structurally.","rationale":"The fabrication-acceptance hole is exactly the fallback everyone reaches for; a fuzzy 97% is the CWE-345 vulnerability wearing a nicer hat.","consequences":"Paraphrase yields unverifiable (honest but reads as broken); demo must mandate verbatim quotation.","status":"Accepted"},{"id":"ADR-005","title":"Provider Abstraction with Local Fallback","context":"Single external provider dependency means outage = full degradation. Customer SLA requires resilience.","decision":"Implement provider abstraction with at least 2 providers and local fallback (Ollama).","rationale":"Precomputed transcripts shipped and labelled; local provider as second fallback; provider failover <5s.","consequences":"Additional provider adapter code; Ollama dependency for local fallback; precomputed transcript storage.","status":"Proposed"}]}
```

## Architecture
The architecture plan has been written to the wiki. Here is the complete implementation plan:

---

## 1. Executive Summary

This plan bridges mizan's existing deterministic verification architecture with three adoption-ready improvements: IETF VRO-aligned attestation, HALLMARK 14-type benchmark coverage, and provider resilience with local fallback. **Key finding from codebase analysis:** the run ledger already implements prev-hash chaining (`sealTrace`, `traceDigest`, `verifyRunChain` in `mizan-provenance/src/run-ledger.ts`), so US-01 is already satisfied — the gap is the judge-runnable verify script (US-02). The plan adds missing pieces: VRO attestation schema, HALLMARK coverage matrix, red-team fixtures, Ollama fallback, degradation matrix, and per-claim SSR metric. No competitor combines deterministic verification + cryptographic attestation.

## 2. Codebase Impact

**Create (17 files):** `attestation-schema.ts`, `ssr.ts`, `red-team-fixtures.ts`, `red-team.test.ts`, `hallmark-coverage.test.ts`, `ollama.ts`, `ollama.test.ts`, `provider.test.ts`, `degradation.test.ts`, `verify-chain.ts`, `test-verify-chain.ts`, `benchmark.ts`, `hallmark-coverage-matrix.md`, `degradation-matrix.md`, `data/precomputed/`, `ssr.test.ts`, `attestation.test.ts`

**Modify (6 files):** `attestation.json` (regenerate VRO-aligned), `mizan-core/src/index.ts` (export SSR types), `mizan-agent/src/provider.ts` (failover), `apps/cli/src/provider-config.ts` (Ollama), `apps/cli/src/exit-codes.ts` (7 named codes), root `package.json` (new scripts)

**NOT modified (already sufficient):** `run-ledger.ts`, `run-store.ts`, `trace.ts`, `hash.ts`, `verify.ts`, `g6-no-false-verified.ts`

## 3. Module Design

```
packages/mizan-core/src/schema/ssr.ts          [NEW] SSR metric types
packages/mizan-verify/src/ssr.ts               [NEW] Per-claim SSR computation
packages/mizan-verify/test/red-team-fixtures.ts [NEW] 14 HALLMARK-type fixtures
packages/mizan-agent/src/providers/ollama.ts   [NEW] Ollama local fallback
packages/mizan-corpus/src/attestation-schema.ts [NEW] IETF VRO-aligned schema
scripts/verify-chain.ts                        [NEW] Judge-runnable chain verify
scripts/benchmark.ts                           [NEW] Unified benchmark harness
```

**Design Patterns:** Port/Adapter (provider), Strategy (SSR), Observer (trace), Fail-Closed (all paths), Merkle Chain (ledger). **Rejected:** LLM-as-judge, fuzzy matching, embedding similarity.

## 4. API Design

- **Chain Verify Script:** `bun run scripts/verify-chain.ts [--json]` → exit 0 (valid), 1 (tampered), 2 (file error), 3 (decode error)
- **SSR Metric:** `computeSsr(response, verdicts) → SsrResult { totalSentences, supportedSentences, rate, perSentence }`
- **Ollama Provider:** `ollamaProvider(config: OllamaConfig) → Provider`
- **VRO Attestation:** 8 control areas, 3 maturity levels, determinism evidence

## 5. Data Design

- **HALLMARK Coverage Matrix:** 14 types → 14 test cases (RT-001 to RT-014), each with expected verdict and difficulty tier
- **Degradation Matrix:** 7 failure modes, each with trigger, correct surface, forbidden surfaces, named exit code
- **Precomputed Transcripts:** `data/precomputed/*.json` with schemaVersion, generatedAt, provider, model, precomputed flag

## 6. Error Strategy

All errors flow through `Result<T,E>`. No `throw` crosses package boundaries. Each failure mode has exactly one correct surface. Retry: 0-1 per path. Timeout: 2s-30s per dependency. Graceful degradation: never fabricate.

## 7. Security Architecture

OWASP: A03 (text-only rendering), A4 (zero false verified), A5 (.env gitignored), A8 (hash-pinned corpus), A10 (allowlisted hosts), CWE-345 (one dependency), LLM01 (fenced prompts). Validation at API boundary, service boundary, and data layer.

## 8. Testing Strategy

Unit: SSR, red-team, HALLMARK coverage, Ollama, provider failover, degradation, attestation VRO, chain verify. Integration: end-to-end pipeline, provider failover, ledger append+verify. Security: 14 fabricated citations, prompt injection, SSRF, secrets. Performance: chain verify <60s, SSR <100ms, failover <5s, red-team <30s.

## 9. Performance Plan

Streaming O(1) memory chain verification, single-pass SSR, parallel provider health check, FIFO decomposition cache, SQLite indexes for corpus retrieval.

## 10. Risk Assessment

10 risks (3 HIGH, 6 MEDIUM, 1 LOW). Top risks: provider outage (mitigated by abstraction + transcript + Ollama), Effect beta drift (pinned + boundary seam), team capacity (Bun workspaces + kill-gate sequencing).

## 11. Technology Trends

Adopts: IETF VRO control areas, TREC 2025 SSR, judge-runnable chain verify, provider abstraction. Rejects: LLM-as-judge, fuzzy matching, external API dependencies for verification.

---

```json
{
  "moduleStructure": [
    { "name": "mizan-core", "path": "packages/mizan-core", "role": "Contracts, schemas, Result, hashing, normalization", "action": "modify", "files": ["src/schema/ssr.ts (NEW)", "src/index.ts (MODIFY: export SSR types)", "test/degradation.test.ts (NEW)"] },
    { "name": "mizan-verify", "path": "packages/mizan-verify", "role": "Deterministic per-claim verification + SSR metric", "action": "extend", "files": ["src/ssr.ts (NEW)", "test/ssr.test.ts (NEW)", "test/red-team-fixtures.ts (NEW)", "test/red-team.test.ts (NEW)", "test/hallmark-coverage.test.ts (NEW)"] },
    { "name": "mizan-agent", "path": "packages/mizan-agent", "role": "Provider abstraction + spine orchestration", "action": "extend", "files": ["src/provider.ts (MODIFY: failover)", "src/providers/ollama.ts (NEW)", "test/provider.test.ts (NEW)", "test/ollama.test.ts (NEW)"] },
    { "name": "mizan-corpus", "path": "packages/mizan-corpus", "role": "Corpus attestation + ingest ledger", "action": "extend", "files": ["src/attestation-schema.ts (NEW)", "test/attestation.test.ts (NEW)"] },
    { "name": "mizan-provenance", "path": "packages/mizan-provenance", "role": "Run ledger chain verification + durable append", "action": "no-change", "files": ["src/run-ledger.ts (EXISTING: already has prev-hash chaining)", "src/run-store.ts (EXISTING)"] },
    { "name": "scripts", "path": "scripts", "role": "Judge-runnable verification + benchmark", "action": "create", "files": ["verify-chain.ts (NEW)", "test-verify-chain.ts (NEW)", "benchmark.ts (NEW)"] },
    { "name": "docs", "path": "docs", "role": "Coverage matrix + degradation matrix", "action": "create", "files": ["hallmark-coverage-matrix.md (NEW)", "degradation-matrix.md (NEW)"] },
    { "name": "data/precomputed", "path": "data/precomputed", "role": "Precomputed transcripts for demo resilience", "action": "create", "files": ["*.json (NEW)"] }
  ],
  "apiInterfaces": [
    { "name": "computeSsr", "package": "mizan-verify", "signature": "(response: string, verdicts: readonly ClaimVerdict[]) => SsrResult", "description": "Per-claim Sentence-Support Rate metric", "inputSchema": "string response, ClaimVerdict[] verdicts", "outputSchema": "SsrResult { totalSentences, supportedSentences, rate, perSentence[] }" },
    { "name": "ollamaProvider", "package": "mizan-agent", "signature": "(config: OllamaConfig) => Provider", "description": "Local Ollama fallback provider adapter", "inputSchema": "OllamaConfig { host, model, timeoutMs }", "outputSchema": "Provider { name, model, kind, generate }" },
    { "name": "verifyChain", "package": "scripts", "signature": "(path: string, options?: { json?: boolean }) => Promise<number>", "description": "Judge-runnable chain verification script", "inputSchema": "string path, optional --json flag", "outputSchema": "exit code (0=valid, 1=tampered, 2=file error, 3=decode error)" },
    { "name": "VROAttestation", "package": "mizan-corpus", "signature": "Schema.Struct({...})", "description": "IETF VRO-aligned attestation schema", "inputSchema": "JSON attestation file", "outputSchema": "VROAttestation { schemaVersion, maturityLevel, controlAreas, snapshotHash, recordCount, determinismEvidence, corpusSnapshotHash }" },
    { "name": "Provider", "package": "mizan-agent", "signature": "{ name, model, kind, generate }", "description": "Provider port with failover", "inputSchema": "GenerationRequest { question, stage, contexts, instructions }", "outputSchema": "GenerationResult = Result<GenerationSuccess, ProviderFailure>" }
  ],
  "dataModels": [
    { "name": "HALLMARK Coverage Matrix", "type": "static-document", "fields": ["typeId (1-14)", "testCaseId (RT-001 to RT-014)", "expectedVerdict", "difficultyTier (Easy/Medium/Hard)", "fabricatedText"], "location": "docs/hallmark-coverage-matrix.md" },
    { "name": "Degradation Matrix", "type": "static-document", "fields": ["failureMode (1-7)", "trigger", "correctSurface", "forbiddenSurfaces", "exitCode"], "location": "docs/degradation-matrix.md" },
    { "name": "Precomputed Transcript", "type": "json-file", "fields": ["schemaVersion", "generatedAt", "provider", "model", "precomputed (boolean)", "entries[]"], "location": "data/precomputed/*.json" },
    { "name": "VRO Attestation", "type": "json-file", "fields": ["schemaVersion", "maturityLevel (1-3)", "controlAreas (8)", "snapshotHash", "recordCount", "determinismEvidence", "corpusSnapshotHash"], "location": "attestation.json" },
    { "name": "SsrResult", "type": "typescript-type", "fields": ["totalSentences", "supportedSentences", "rate", "perSentence[]"], "location": "packages/mizan-verify/src/ssr.ts" }
  ],
  "testingStrategy": {
    "unit": ["ssr.test.ts: golden >=99%, red-team 0%", "red-team.test.ts: 14 HALLMARK types, zero false verified", "hallmark-coverage.test.ts: all 14 types mapped", "ollama.test.ts: provider trait, not-running handling", "provider.test.ts: failover <5s, honest errors", "degradation.test.ts: 7 failure modes, correct surfaces", "attestation.test.ts: 8 control areas, 100x determinism", "test-verify-chain.ts: exit codes, tamper detection"],
    "integration": ["end-to-end pipeline", "provider failover", "ledger append + verify"],
    "security": ["14 fabricated citations must NOT produce verified", "prompt injection via fenced corpus", "SSRF: non-allowlisted hosts refused", "gitleaks scan"],
    "performance": ["chain verify: 10k entries <60s", "SSR: <100ms per response", "provider failover: <5s", "red-team suite: <30s for 14+ cases"],
    "testData": ["golden set: committed synthetic questions", "red-team set: 14 HALLMARK-type fabricated citations", "precomputed transcripts: committed, labelled"]
  },
  "office_auto_approve": {
    "confidence": 0.82,
    "evidence": "Well-understood spec with clear user stories; existing codebase already has prev-hash chaining, attestation, and provider abstraction; plan extends rather than replaces; main uncertainty is team capacity for 6 new packages in sprint 1"
  }
}
```

```json
{"office_fact_memory":[{"fact":"The run ledger (data/runs.jsonl) already implements prev-hash chaining via sealTrace/traceDigest/verifyRunChain in mizan-provenance/src/run-ledger.ts — US-01 is already satisfied, only the judge-runnable verify script (US-02) is missing","phase":"at","evidence":"Codebase analysis: run-ledger.ts has verifyRunChain, auditRunLedger, ChainBreak with index/reason/detail; run-store.ts has appendRunTrace with post-write verification","confidence":0.95},{"fact":"The provider abstraction already exists as a Port/Adapter pattern in mizan-agent/src/provider.ts with hosted and transcript adapters — US-06 needs a second remote adapter (Ollama) and failover logic, not a new abstraction","phase":"at","evidence":"provider.ts defines Provider type with generate() returning GenerationResult; live.ts implements hostedProvider; transcript.ts implements transcriptProvider","confidence":0.9},{"fact":"The attestation system already exists in mizan-corpus with attest.ts (query-time check) and ledger.ts (ingest-time check + AttestationSchema) — US-03 needs IETF VRO alignment, not new attestation logic","phase":"at","evidence":"attest.ts has attestSnapshot comparing snapshotHash+recordCount; ledger.ts has AttestationSchema, compareAttestations, checkAttestation","confidence":0.9}]}
```