# ADR: for-this-project-need-to-deep-honest-review-and-analysis-and-val v1

**Status:** proposed
**Date:** 2026-09-29

## Context
# CEO Strategic Review — mizan Value Validation & Gap Closure

## 1. Executive Summary

The feedback ("value is weak, any search tool can do this") conflates **retrieval** with **verification**. Market evidence confirms retrieval/answering is table stakes — but citation accuracy across search-class products is ~74% industry-wide (Tow Center: 8 engines wrong on >60% of 1,600 queries; Islamic citation scores 1.82–3.38/5), and **no competitor (Ansari, Fanar-Sadiq, UmmahAPI, Perplexity/Elicit) emits a computed, fail-closed, per-claim verdict**. That negative-space claim is mizan's real value — yet today it is *asserted in prose, not demonstrated*, and six load-bearing gaps give a judge legitimate grounds to dismiss it: (1) 57 changed + 38 untracked files mean HEAD ≠ what we claim; (2) paraphrase divergence — code says `REJECTED`, spec and 26 human rulings say `UNVERIFIABLE`; (3) zero UI against the "منتج متكامل قابل للتشغيل" requirement; (4) keyless `PRECOMPUTED` replay misread as "not real"; (5) golden 100% is self-referential; (6) no Bukhari/Muslim, no tafsir, no multilingual. This plan ships a **value-proof pack** plus gap closures in two sprints, scoped to the realistic fallback slice. **Expected impact:** a judge *sees* the badge computed on a page, *runs* the verdict path in CI, and hears one defensible sentence — "search attaches citations; mizan adjudicates them, fail-closed, with a hash-chained receipt" — backed by artefacts on HEAD, not on disk.

## 2. Business Value Analysis

**Primary driver:** credibility/defensibility (competition scoring, judge trust). **Secondary:** demonstration quality. Not revenue. **Thesis accepted:** we win on verification, never on fluency or retrieval — answer-quality claims are permanently out of scope.

### MoSCoW Classification

**Must Have**
1. Commit the entire working tree so HEAD equals what is claimed (R-5, #1 credibility risk); clean-tree CI green.
2. Mechanise paraphrase/elision → `UNVERIFIABLE`; code, spec, README and 2

## Decision
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.