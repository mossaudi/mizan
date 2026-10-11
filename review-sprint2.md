# Sprint 2 Code Review — mizan Article Verification

**Review Date**: 2026-10-10  
**Reviewer**: Code Reviewer (CR)  
**Scope**: Sprint 2 implementation (MS2-1 through MS2-4)

---

## Executive Summary

| Category | Findings | Status |
|----------|----------|--------|
| Security | 0C / 0H / 2M / 1L | ⚠️ |
| Code Quality | 0C / 1H / 3M / 2L | ⚠️ |
| Performance | 0C / 0H / 0M / 0L | ✅ |
| Reliability | 0C / 0H / 2M / 1L | ⚠️ |

**Critical Findings**: 0 (must fix before merge)  
**High Findings**: 1 (should fix before merge)  
**Medium Findings**: 7 (fix in this sprint)  
**Low Findings**: 4 (fix when convenient)

**Files Reviewed**: 12  
**Lines Reviewed**: ~2,500

**Verdict**: `request_changes` — One High finding (single source of truth violation for MIN_QUOTE_CHARS) and multiple Medium findings require resolution before merge.

---

## Previous Findings — Resolution Status

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| 1 | Scope Violation (Sprint 1 vs Sprint 2) | **Resolved** | Implementation summary correctly states "Sprint Coverage: Sprint 2" |
| 2 | Path Traversal in root-coverage.ts | **Fixed** | `realpathSync` validation at lines 81-99 |
| 3 | SSRF Bypass in provider.ts | **Fixed** | Proper domain hierarchy validation at lines 168-196 |
| 4 | Simulated Stemmers (50.33% delta) | **Partially Addressed** | Prominent "SIMULATED" warnings in artefact; invalid roots still present |
| 5 | Invalid Stemmer Logic | **Partially Addressed** | Documented as simulated; no production claim |
| 6 | Snapshot Hash Excludes New Fields | **Fixed** | `root`, `stem`, `lemma` added to `SNAPSHOT_HASHED_FIELDS` (record.ts:110-112) |
| 7 | Magic Numbers in Extract Provider | **Fixed** | Documented constants: `MAX_CHUNK_CHARS`, `MAX_INNER_JSON_SIZE`, `EXTRACT_PROVIDER_TIMEOUT_MS` |
| 8 | Duplicate Code in root-coverage.ts | **Fixed** | `buildBaseArtefact()` shared function |
| 9 | Retry Jitter Non-Deterministic | **Fixed** | Deterministic exponential backoff (model-span-selector.ts:40-42, 122-124) |
| 10 | Spike Table JSON.parse at Boundary | **Fixed (CLI)** | Schema-first decoding in CLI refusal-block.ts:65-66; **Web still lacks full schema validation** |
| 11 | Arabic Schemas Too Permissive | **Fixed** | Length constraints added: root 2-5, stem 2-20, lemma 2-30 (record.ts:8,14,20) |
| 12 | Article Coverage Report (test harness) | **Partially Addressed** | Artefact states "corpus: none" but self-check presents as validation |
| 13 | Hardcoded URL in Web Refusal Block | **Unresolved** | `/docs/artefacts/spike-table.json` at line 14 |
| 14 | No Validation at Ingest Boundary | **Unresolved** | `toCorpusRecord` passes through root/stem/lemma without schema validation |
| 15 | MIN_QUOTE_CHARS in Multiple Places | **Unresolved** | **4 copies** exist — violates AGENTS.md §17 |
| 16 | Web Auto-Init Double Initialization | **Low Risk** | Standard pattern; guard flag would be more robust |

---

## New Findings

### Finding 1: MIN_QUOTE_CHARS Violates Single Source of Truth (AGENTS.md §17)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **File** | `packages/mizan-core/src/render/refusal-block.ts`, `apps/cli/src/render/refusal-block.ts`, `apps/web/refusal-block.js`, `packages/mizan-extract/src/model-span-selector.ts` |
| **Line(s)** | Core:13, CLI:22, Web:14, Extract:69 |
| **Category** | Code Quality |
| **OWASP** | N/A |

**Issue**: The constant `MIN_QUOTE_CHARS = 15` (minimum Arabic characters for a quote to be verifiable) is defined in **four separate locations**, violating AGENTS.md §17: "The fold table, the citations allowlist, the grade basis vocabulary, the canonical-JSON key order and the digest rules each live in exactly one module. Other modules import them."

- `@mizan/core/src/render/refusal-block.ts:13` — Local constant, **not exported**
- `apps/cli/src/render/refusal-block.ts:22` — Own copy
- `apps/web/refusal-block.js:14` — Own copy (ES module, cannot import from core)
- `packages/mizan-extract/src/model-span-selector.ts:69` — Hardcoded `15` in validation logic

**Current Code (core):**
```typescript
const MIN_QUOTE_CHARS = 15  // Not exported!
export function isQuoteTooShort(quote: string): boolean { ... }
```

**Current Code (CLI):**
```typescript
const MIN_QUOTE_CHARS = 15  // Duplicate!
```

**Current Code (Extract):**
```typescript
if (foldedQuote.length < 15) continue  // Magic number!
```

**Recommended Fix**:
1. Export `MIN_VERIFIABLE_QUOTE_CHARS` from `@mizan/core/src/normalize/bounds.ts` (the existing home for `MAX_QUOTE_CHARS`/`MAX_RECORD_CHARS`)
2. Update `@mizan/core/src/render/refusal-block.ts` to import and use the shared constant
3. Update `apps/cli/src/render/refusal-block.ts` to import from `@mizan/core`
4. Update `packages/mizan-extract/src/model-span-selector.ts` to import from `@mizan/core`
5. For `apps/web/refusal-block.js` (browser ES module), inject the value via a `data-` attribute on the container element or a global config object

**Priority**: Must Fix

---

### Finding 2: Web Refusal Block Lacks Schema-First Decoding at Trust Boundary

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `apps/web/refusal-block.js` |
| **Line(s)** | 17-43 |
| **Category** | Security / Code Quality |
| **OWASP** | A03:2021-Injection, A08:2021-Software and Data Integrity Failures |

**Issue**: The web refusal block fetches `spike-table.json` via `fetch()` and only performs basic structure validation (checking for `data?.results?.semanticSimilarity?.falseVerifiedRate`). It does **not** use schema-first decoding via `decodeOrFail` as required by AGENTS.md §1: "Every value crossing a trust boundary is decoded through a declared schema before any code touches it. `JSON.parse` on untrusted input is a defect."

While the spike table is served from the same origin, the network boundary is still a trust boundary. A compromised build or CDN could serve malicious JSON.

**Current Code:**
```javascript
const data = await response.json()
if (!data?.results?.semanticSimilarity?.falseVerifiedRate) {
  return null
}
```

**Recommended Fix**: 
- Define a SpikeTable schema in `@mizan/core` (mirroring the CLI's `SpikeTableSchema`)
- Compile the schema to a JSON schema or use a lightweight validation function that can run in the browser
- Validate the fetched data against the schema before use
- Alternatively, embed the spike table data directly in the HTML at build time (since it's static)

**Priority**: Should Fix

---

### Finding 3: Root-Coverage Artefact Contains Linguistically Invalid Roots

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `docs/artefacts/root-coverage.json`, `packages/mizan-bench/src/root-coverage.ts` |
| **Line(s)** | Artefact:43-64, 65-86; Source:96-249 |
| **Category** | Reliability / Code Quality |
| **OWASP** | N/A |

**Issue**: The disagreement patterns in the root-coverage artefact contain linguistically impossible Arabic "roots" produced by the simulated stemmers:
- Custom-only: `ريي`, `اغغ`, `رقق`, `يفف`, `وكك`, `حاا`, `راا`, `يرر`, `سمم`, `احح`, `يخخ`, `اصص`, `تقق`, `تعع`, `عكك`, `اخخ`, `تزز`, `نسس`, `يحح`, `يظظ`
- AlKhalil-only: `رحن`, `يون`, `يقم`, `رزن`, `ينق`, `ميق`, `وقم`, `ءتن`, `امو`, `قاو`, `ارو`, `مون`, `بنم`, `حجب`, `ناو`, `يخو`, `تقء`, `يفن`, `عنم`, `الء`

While the artefact prominently warns "Stemmers are rule-based approximations (SIMULATED)" and "Output is methodological transparency exercise ONLY", publishing invalid roots as "disagreement patterns" risks misleading a reader who doesn't read the warnings. The 50.33% delta is already acknowledged as too high for production use.

**Recommended Fix**:
1. Filter disagreement patterns to only include roots that pass basic morphological validity (e.g., no triple-geminated consonants like `ممم`, valid root patterns)
2. Add a "methodology limitations" section to the artefact explaining why these patterns appear
3. Consider publishing only the *counts* of disagreement, not the invalid patterns themselves
4. Add a CI gate that fails if `productionReady: true` is ever accidentally set

**Priority**: Should Fix

---

### Finding 4: No Test Asserting Snapshot Hash Changes When Root/Stem/Lemma Change

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `packages/mizan-corpus/test/corpus.test.ts` |
| **Line(s)** | N/A (missing test) |
| **Category** | Reliability / Integrity |
| **OWASP** | A08:2021-Software and Data Integrity Failures |

**Issue**: Finding 6 was fixed by adding `root`, `stem`, `lemma` to `SNAPSHOT_HASHED_FIELDS`. However, there is **no test** asserting that changing one of these fields actually changes the snapshot hash. The comment at record.ts:124-127 says "The exact field list the snapshot digest covers, exported so a test can assert that a changed field MOVES the hash. A hash nobody has seen react to a tamper is decorative." — but the test doesn't exist.

**Recommended Fix**: Add a test in `packages/mizan-corpus/test/corpus.test.ts`:
```typescript
test("snapshot hash changes when root/stem/lemma change", () => {
  const records = [...]
  const hash1 = computeSnapshotHash(records)
  records[0].root = "new-root"
  const hash2 = computeSnapshotHash(records)
  expect(hash1).not.toBe(hash2)
})
```

**Priority**: Should Fix

---

### Finding 5: Article Coverage Report Presented as Validation Despite "corpus: none"

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `data/eval/article-coverage.json`, Implementation Summary |
| **Line(s)** | Artefact:61; Summary: Self-check claims |
| **Category** | Reliability / Delivery |
| **OWASP** | N/A |

**Issue**: The `article-coverage.json` artefact explicitly states in its conditions block (line 61): `"corpus: none - data/corpus.db is gitignored and this artefact was produced without it, so every span is unverifiable (no_citation) and verified is 0"`. This is a **test harness report**, not a validation of the verification pipeline. However, the implementation summary's "Self-Check Commands Run" section presents the article coverage report as validation evidence.

**Recommended Fix**: 
1. Update the implementation summary to clearly label this as "test-harness-only artefact, not a verification pipeline validation"
2. Consider renaming the artefact to `article-coverage-test-harness.json` to avoid confusion
3. Ensure the conditions block is the first thing a reader sees (move to top of JSON)

**Priority**: Should Fix

---

### Finding 6: No Validation of root/stem/lemma at Ingest Boundary

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `packages/mizan-corpus/src/adapters/record.ts` |
| **Line(s)** | 50-52 |
| **Category** | Reliability / Code Quality |
| **OWASP** | A08:2021-Software and Data Integrity Failures |

**Issue**: The `toCorpusRecord` function passes through `raw.root`, `raw.stem`, `raw.lemma` directly without schema validation. These fields cross a trust boundary (adapter input → corpus record) and should be decoded via `decodeOrFail` with the Arabic schemas from `@mizan/core` (AGENTS.md §1).

**Current Code:**
```typescript
root: raw.root,
stem: raw.stem,
lemma: raw.lemma,
```

**Recommended Fix**:
```typescript
import { decodeOrFail, decodeSync, ArabicRoot, ArabicStem, ArabicLemma } from "@mizan/core"

const root = raw.root ? decodeOrFail(decodeSync(ArabicRoot), raw.root, "ArabicRoot").value : undefined
const stem = raw.stem ? decodeOrFail(decodeSync(ArabicStem), raw.stem, "ArabicStem").value : undefined
const lemma = raw.lemma ? decodeOrFail(decodeSync(ArabicLemma), raw.lemma, "ArabicLemma").value : undefined

return {
  // ...
  root,
  stem,
  lemma,
}
```

**Priority**: Should Fix

---

### Finding 7: Web Refusal Block Hardcoded Artefact URL

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `apps/web/refusal-block.js` |
| **Line(s)** | 14 |
| **Category** | Reliability / Code Quality |
| **OWASP** | N/A |

**Issue**: The spike table URL is hardcoded as `/docs/artefacts/spike-table.json`. This assumes a specific deployment structure and breaks if the site is served from a subpath (e.g., `https://example.com/mizan/`).

**Current Code:**
```javascript
const SPIKE_TABLE_URL = "/docs/artefacts/spike-table.json"
```

**Recommended Fix**: 
- Read the base path from a `data-mizan-base-path` attribute on the container element
- Or inject the URL via a build-time template variable

**Priority**: Could Fix

---

### Finding 8: Web Refusal Block Auto-Init Lacks Initialization Guard

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `apps/web/refusal-block.js` |
| **Line(s)** | 183-189 |
| **Category** | Reliability |
| **OWASP** | N/A |

**Issue**: The auto-initialization runs on both `DOMContentLoaded` and immediately if `document.readyState !== "loading"`. While this is a standard pattern, if the script is loaded twice (e.g., via a bundler error or manual inclusion), `initRefusalBlocks()` could run twice.

**Current Code:**
```javascript
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRefusalBlocks)
  } else {
    initRefusalBlocks()
  }
}
```

**Recommended Fix**: Add a module-level initialization guard:
```javascript
let _initialized = false
export function initRefusalBlocks() {
  if (_initialized) return
  _initialized = true
  // ... rest of function
}
```

**Priority**: Could Fix

---

## Positive Observations

1. **Security fixes properly applied**: Path traversal (realpathSync), SSRF (domain hierarchy validation), schema-first decoding at CLI boundary
2. **Determinism preserved**: Retry logic uses fixed exponential backoff; all 673 tests pass including determinism tests
3. **G-1 compliance maintained**: `@mizan/extract` depends only on `@mizan/core` and `@mizan/retrieval` — no `@mizan/verify` import
4. **Companion licence decision properly recorded**: Both athar sources excluded with detailed `exclusionReason` and `gradeApplicable: false`
5. **Coverage report accountability**: Segments/extracted/checked denominators published; gaps distinguish `not_extracted` vs `not_checked`
6. **Refusal blocks implement ADR-21**: Spike table displayed side-by-side; no semantic suggestions offered
7. **All 7 CI gates pass**: Typecheck, tests, and structural gates all green
8. **Article chunk contract well-designed**: Bounded, resumable, stateless with caps unchanged per ADR-19

---

## Summary of Required Fixes Before Merge

### Must Fix (High)
1. **Finding 1**: Export `MIN_VERIFIABLE_QUOTE_CHARS` from `@mizan/core` and eliminate 3 duplicate copies

### Should Fix (Medium)
2. **Finding 2**: Add schema-first decoding for spike table in web refusal block
3. **Finding 3**: Filter or remove linguistically invalid roots from root-coverage disagreement patterns
4. **Finding 4**: Add test asserting snapshot hash changes when root/stem/lemma change
5. **Finding 5**: Clarify article-coverage.json is test-harness-only in implementation summary
6. **Finding 6**: Validate root/stem/lemma at ingest boundary using `decodeOrFail`

### Could Fix (Low)
7. **Finding 7**: Make web refusal block URL configurable
8. **Finding 8**: Add initialization guard to web refusal block auto-init

---

## Verdict

## Verdict
request_changes