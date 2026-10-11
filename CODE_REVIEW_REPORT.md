# Code Review Report: Sprint 1 Implementation

## Executive Summary

**Files Reviewed**: 15 (new + modified)
**Lines Reviewed**: ~2,500

| Category | Findings | Status |
|----------|----------|--------|
| Security | 0/0/1/0 | ✅ |
| Code Quality | 0/0/3/2 | ⚠️ |
| Performance | 0/0/0/0 | ✅ |
| Reliability | 0/0/1/0 | ✅ |

**Critical Findings**: 0 (must fix before merge)
**High Findings**: 0 (should fix before merge)
**Medium Findings**: 5 (fix in this sprint)
**Low Findings**: 2 (fix when convenient)

---

## Findings

### Finding 1: Unused Dependency Declaration in `@mizan/extract`

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `packages/mizan-extract/package.json` |
| **Line(s)** | 18 |
| **Category** | Code Quality |
| **OWASP** | N/A |

**Issue**: The `package.json` declares `@mizan/agent` as a dependency, but the source code in `src/provider.ts` and `src/model-span-selector.ts` does not import anything from `@mizan/agent`. The transport type `ExtractTransport` is defined locally in `provider.ts` (lines 18-24). This creates a false dependency that could confuse auditors and gate checks.

**Current Code**:
```json
// package.json line 18
"@mizan/agent": "workspace:*",
```

**Recommended Fix**:
```json
// Remove the unused dependency
{
  "dependencies": {
    "@mizan/core": "workspace:*",
    "@mizan/retrieval": "workspace:*",
    "effect": "4.0.0-beta.83"
  }
}
```

**Priority**: Should Fix

---

### Finding 2: Mixed ESM/CommonJS in Test File

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `apps/cli/test/refusal-block.test.ts` |
| **Line(s)** | 117-122 |
| **Category** | Code Quality |
| **OWASP** | N/A |

**Issue**: The test uses `require("node:fs")` and `require("node:path")` (CommonJS) in an ESM test file, and relies on `__dirname` which is not available in native ESM. While this works in Bun due to its CommonJS compatibility layer, it's a code smell and not portable.

**Current Code**:
```typescript
// lines 117-122
const fs = require("node:fs")
const path = require("node:path")
const fixturePath = path.join(__dirname, "..", "fixtures", "demo-document.md")
```

**Recommended Fix**:
```typescript
// Use ESM imports and import.meta.url for path resolution
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(__dirname, "..", "fixtures", "demo-document.md")
const content = readFileSync(fixturePath, "utf8")
```

**Priority**: Could Fix

---

### Finding 3: Inline Arabic Quote Detection Uses Broad Pattern

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `apps/cli/src/main.ts` |
| **Line(s)** | 370-380 |
| **Category** | Code Quality / Reliability |
| **OWASP** | N/A |

**Issue**: The `inlinePattern` regex `/[\u0600-\u06FF\s]{10,}/g` matches any sequence of 10+ Arabic characters/whitespace, which will produce many false positives (matching random Arabic words in prose, not just quotes). This is documented as "demo-only" but the pattern is too permissive.

**Current Code**:
```typescript
// lines 370-380
const inlinePattern = /([\u0600-\u06FF\s]{10,})/g
for (const section of sections) {
  if (section === undefined) continue
  let inlineMatch
  while ((inlineMatch = inlinePattern.exec(section)) !== null) {
    const text = inlineMatch[1]?.trim()
    if (text !== undefined && text.length >= 10 && !quotes.some(q => q.quote === text)) {
      quotes.push({ quote: text, segmentIndex: 0 })
    }
  }
}
```

**Recommended Fix**: Either remove the inline pattern (since the demo document uses explicit quote markers) or make it more specific to quote-like contexts (e.g., preceded by speech verbs, colons, or quotation marks).

```typescript
// Option A: Remove for demo (the explicit quote pattern covers the demo doc)
const quotePattern = /[「"]([^」"]+)[」"]/g
// ... existing logic only

// Option B: More specific pattern if needed
const inlinePattern = /(?:قال|روى|ذكر|انظر|انظرى|قَالُوا|رَوَى)\s*[:\-]\s*([\u0600-\u06FF\s]{15,})/g
```

**Priority**: Should Fix

---

### Finding 4: `fenceChunkText` Export Not Used in `model-span-selector.ts`

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `packages/mizan-extract/src/model-span-selector.ts` |
| **Line(s)** | 3, 40-43 |
| **Category** | Code Quality |
| **OWASP** | N/A |

**Issue**: `fenceChunkText` is imported from `./model-span-selector.ts` in `provider.ts` (line 3), but it's defined in the same file. This creates a circular import appearance. The function is also exported from `index.ts` but the import in `provider.ts` works because it's a relative import within the same file (TypeScript allows this). However, it's cleaner to define it in a shared utility or keep it in one place.

**Current Code**:
```typescript
// provider.ts line 3
import { fenceChunkText } from "./model-span-selector.ts"

// model-span-selector.ts lines 40-43
export function fenceChunkText(text: string): string {
  const capped = text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) : text
  return `<<<ARTICLE_CHUNK_DATA_ONLY>>>\n${capped}\n<<<END_ARTICLE_CHUNK>>>`
}
```

**Recommended Fix**: Move `fenceChunkText` and `MAX_CHUNK_CHARS` to a shared utility file (e.g., `src/utils.ts`) or define them in `provider.ts` where they're primarily used.

```typescript
// provider.ts - define locally
const MAX_CHUNK_CHARS = 2000
function fenceChunkText(text: string): string { ... }
```

**Priority**: Could Fix

---

### Finding 5: Retry Logic Uses Fixed Delay Without Jitter

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `packages/mizan-extract/src/model-span-selector.ts` |
| **Line(s)** | 120-122 |
| **Category** | Reliability |
| **OWASP** | N/A |

**Issue**: The exponential backoff uses a fixed delay (`BASE_RETRY_DELAY_MS * Math.pow(2, attempt)`) without jitter. In production with multiple concurrent requests, this can cause thundering herd problems when a provider recovers.

**Current Code**:
```typescript
// lines 120-122
const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt)
await new Promise(resolve => setTimeout(resolve, delay))
```

**Recommended Fix**:
```typescript
// Add jitter: random value between 0 and delay
const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt)
const jitter = Math.random() * delay
await new Promise(resolve => setTimeout(resolve, delay + jitter))
```

**Priority**: Should Fix

---

### Finding 6: Schema Allows Confidence > 1.0 Without Validation

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `packages/mizan-extract/src/schema/span-candidate.ts` |
| **Line(s)** | 22-23 |
| **Category** | Code Quality / Security |
| **OWASP** | A03:2021-Injection (input validation) |

**Issue**: The `confidence` field uses `Schema.Number` which accepts any number, including values > 1.0, NaN, Infinity, and negative numbers. While the test at line 48-50 notes "validation is in the selector", no such validation exists in `model-span-selector.ts`. The `validateCandidates` function only checks quote length and offsets.

**Current Code**:
```typescript
// span-candidate.ts lines 22-23
confidence: Schema.Number,
```

**Recommended Fix**: Add a bounded number schema or validate in `validateCandidates`:
```typescript
// Option A: Schema-level (preferred)
confidence: Schema.Number.pipe(Schema.between(0, 1))

// Option B: In validateCandidates function (defense in depth)
if (candidate.confidence < 0 || candidate.confidence > 1 || Number.isNaN(candidate.confidence)) continue
```

**Priority**: Should Fix

---

### Finding 7: Demo Document Processor Uses Hardcoded Segment Index 0 for Inline Matches

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `apps/cli/src/main.ts` |
| **Line(s)** | 377 |
| **Category** | Code Quality |
| **OWASP** | N/A |

**Issue**: Inline Arabic quote matches are all assigned `segmentIndex: 0`, which loses the section context. This makes the refusal blocks less useful for locating the problematic quote in the document.

**Current Code**:
```typescript
// line 377
quotes.push({ quote: text, segmentIndex: 0 })
```

**Recommended Fix**:
```typescript
// Track which section the inline match came from
for (let i = 0; i < sections.length; i++) {
  const section = sections[i]
  if (section === undefined) continue
  let inlineMatch
  while ((inlineMatch = inlinePattern.exec(section)) !== null) {
    const text = inlineMatch[1]?.trim()
    if (text !== undefined && text.length >= 10 && !quotes.some(q => q.quote === text)) {
      quotes.push({ quote: text, segmentIndex: i })  // Use actual section index
    }
  }
}
```

**Priority**: Should Fix

---

### Finding 8: Security - Article Text Sent to Model Without Sanitization of Control Characters

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `packages/mizan-extract/src/provider.ts` |
| **Line(s)** | 71-78 |
| **Category** | Security |
| **OWASP** | A03:2021-Injection |

**Issue**: The article chunk text is fenced and length-capped but not sanitized for terminal control sequences (ANSI escape codes, OSC sequences, etc.). If article text contains malicious control sequences, they could affect the model's behavior or, if the model echoes them back, could cause terminal injection when logged. The `@mizan/core` package has `stripTerminalControls` in `normalize/terminal.ts` which should be applied.

**Current Code**:
```typescript
// lines 71-78
function buildExtractRequestBody(chunkText: string, chunkIndex: number, maxCandidates: number, model: string): string {
  const fenced = fenceChunkText(chunkText)
  const userPrompt = `Extract verbatim Qur'an/Hadith quotes from chunk ${chunkIndex} (max ${maxCandidates} candidates).
Minimum quote length: 15 Arabic characters.

${fenced}

Return JSON only.`

  return JSON.stringify({ ... })
}
```

**Recommended Fix**:
```typescript
import { stripTerminalControls } from "@mizan/core"

function buildExtractRequestBody(chunkText: string, chunkIndex: number, maxCandidates: number, model: string): string {
  const sanitized = stripTerminalControls(chunkText)
  const fenced = fenceChunkText(sanitized)
  // ... rest unchanged
}
```

**Priority**: Should Fix

---

### Finding 9: Root Coverage Artefact Uses Simulated Stemmers with High Delta

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `packages/mizan-bench/src/root-coverage.ts` |
| **Line(s)** | 80-211, 377 |
| **Category** | Code Quality |
| **OWASP** | N/A |

**Issue**: The dual-stemmer cross-check reports a 42.80% delta (disagreement rate), which is very high. The note in the artefact acknowledges "rule-based approximations" and that "actual Quranic triliteral root count is approximately 1,651 per established morphological studies". The simulated stemmers produce 4,132 and 4,253 unique roots respectively (union 5,334), far exceeding the established ~1,651. This is documented honestly but should be flagged as a known limitation.

**Current Code**: Simulated stemmers in `customStemmer` (lines 80-146) and `alkhalilStyleAnalyzer` (lines 152-211).

**Recommended Fix**: The current approach is acceptable as a measurement artefact per ADR-22 ("Root coverage = measurement artefact first"). However, add a more prominent warning in the artefact and documentation that this is NOT a production stemmer and the delta indicates the methodology is not yet reliable for indexing.

```json
// In the artefact, strengthen the note
"note": "WARNING: This measurement uses RULE-BASED APPROXIMATIONS (simulated stemmers). The 42.80% delta indicates significant disagreement between stemmers. The declared ~1,651 Quranic roots reflects established morphological studies; this tool's output is a methodological transparency exercise ONLY. No index is built or shipped from this data."
```

**Priority**: Should Fix

---

### Finding 10: Refusal Block Spike Table Path Resolution Depends on File Structure

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `apps/cli/src/render/refusal-block.ts` |
| **Line(s)** | 21-24 |
| **Category** | Reliability |
| **OWASP** | N/A |

**Issue**: The spike table path is resolved by traversing 4 directory levels up from the module (`apps/cli/src/render/` → repo root). This is fragile to refactoring (moving the file) and assumes a fixed repository structure.

**Current Code**:
```typescript
// lines 21-24
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..", "..", "..", "..")
const SPIKE_TABLE_PATH = join(REPO_ROOT, "docs", "artefacts", "spike-table.json")
```

**Recommended Fix**: Use a build-time constant or environment variable for the artefact path, or resolve from a known repository root marker (e.g., `package.json` at root).
```typescript
// Option: Use a find-root approach
function findRepoRoot(start: string): string {
  let current = start
  while (current !== dirname(current)) {
    if (existsSync(join(current, "package.json"))) return current
    current = dirname(current)
  }
  throw new Error("Repository root not found")
}
const REPO_ROOT = findRepoRoot(__dirname)
```

**Priority**: Could Fix

---

## Verification of Sprint 1 Acceptance Criteria

### MS2-1: Root-Coverage Measurement Artefact ✅
- [x] Artefact committed to `docs/artefacts/root-coverage.json` with 1,651 declared roots, dual-stemmer method, delta published (42.80%)
- [x] Artefact contains no index reference (`indexShipped: false`, `indexReference: null`)
- [x] CorpusRecord schema includes optional `root`, `stem`, `lemma` fields (record.ts lines 86-90)
- [x] G-5 gate passes (CI green)
- [x] Dual-stemmer cross-check runs without error (`bun run root-coverage` succeeds)

### MS2-2: Model-Assisted Span Selector Variant ✅
- [x] Selector variant imports do not include `@mizan/verify` (G-1.1 passes)
- [x] Model output decoded via `decodeOrFail` with declared `ModelSpanSelectorOutput` schema (provider.ts line 164)
- [x] Recall measurement published at `docs/specs/measurements/span-selector-recall.md` using MS2-1 denominator
- [x] Seeded fabrication document processes without false verified (demo document: 4 refusals, 0 verified)

### MS2-4: Demo Refusal Block for Incomplete Quotes ✅
- [x] Refusal block renders for quotes < 15 chars with ADR-21 citation (refusal-block.ts line 69)
- [x] Spike table artefact committed at `docs/artefacts/spike-table.json` and referenced
- [x] Demo document processes end-to-end with refusal visible (`bun run src/main.ts --demo fixtures/demo-document.md`)
- [x] No semantic suggestion offered for incomplete quotes (explicitly denied in refusal block)

---

## Test Results Summary

```
CI GREEN - All 14 packages pass typecheck + tests + 7 gates (G-1 through G-7)
- packages/mizan-extract: 9 pass
- apps/cli: 467 pass
- apps/web: 43 pass
- packages/mizan-mcp: 187 pass
- packages/mizan-verify: 207 pass
- packages/mizan-core: 228 pass
- packages/mizan-gate: 644 pass (2 skipped)
- All other packages: pass
```

---

## Verdict

## Verdict
request_changes

---

## Severity Summary
critical: 0
high: 0
medium: 5
low: 2