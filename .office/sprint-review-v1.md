# Sprint Review

Verdict: **verified**

## Summary
Sprint 1 fully delivered (9/9 stories) with all tests passing, CI green, check:docs OK, accept:customer green on clean clone. Sprint 2 (4 stories) explicitly not yet delivered — MS2-1 blocked on CorpusRecord schema, MS2-2/3/4 dependent. Market comparison confirms mizan is the ONLY system with deterministic per-claim citation verification; competitors use semantic RAG with no verifier. Key differentiators: coverage report denominator, fail-closed degradation, no similarity pathway to false verified, grade-null companions.

## Claims
- Sprint 1 delivered all 9 planned stories (MS1-1 through MS1-9)
  - evidence: git commit 6639708: 53 files changed, +6096/-122 lines
  - evidence: bun run ci: all 13 packages pass types + tests, all 7 gates pass
  - evidence: bun run check:docs: OK — 10 audited documents, 47 corpus surfaces, 9 evidence artefacts
  - evidence: bun run accept:customer: green on clean clone (corpus-free lane)
- Article chunk contract is bounded, resumable, stateless with caps unchanged
  - evidence: packages/mizan-mcp/src/article-contract.ts: MAX_SPANS_PER_CHUNK = MAX_CLAIMS_PER_CALL (32)
  - evidence: packages/mizan-mcp/test/article-contract.test.ts: 48 tests pass including stateless, byte-identical resume, cap enforcement
  - evidence: ADR-19: records 32,000 citations = 5.8s, 160,000 = 26.9s as measurement rationale
- Selection recall (segments - extracted) published as committed artefact
  - evidence: data/eval/article-coverage.json: totals {segments:7, extracted:3, notExtracted:4}
  - evidence: packages/mizan-verify/test/select-spans.test.ts: 'selection recall = segments - extracted is published in a committed artefact'
  - evidence: packages/mizan-verify/src/select-spans.ts: deterministic delimited-quotation + speech-introduced selection
- Seeded skip of fabrication renders as visible gap, not clean report
  - evidence: packages/mizan-verify/test/select-spans.test.ts: 'a segment the selector does not emit comes back as a NAMED gap, never as an absence'
  - evidence: packages/mizan-core/src/schema/article-coverage.ts: gaps carry stage='not_extracted' with segmentIndex
- No completeness claim without extracted/segments denominator (G-7.13)
  - evidence: packages/mizan-gate/src/gates/g7-verdict-path-purity.ts: G-7.13 rule with planted violation tests
  - evidence: packages/mizan-gate/test/gates.test.ts: 'planted: a completeness claim with NO denominator is caught, naming the line'
  - evidence: ADR-20: 'No renderer may state a completeness claim without the extracted-of-segments denominator beside it'
- Closest-in-words is display-only integers (sharedRunChars/quoteChars), no semantic matching
  - evidence: apps/cli/src/article-suggestions.ts: candidates carry only rank, considered, sharedRunChars, quoteChars
  - evidence: apps/cli/test/article-suggestions.test.ts: 'the display contract carries no third number', 'sharedRunChars never confers a verdict'
  - evidence: ADR-21: 'No semantic, embedding, edit-distance or percentage-shaped nearest-match ships in any surface'
  - evidence: Gate tests: G-1.2, G-6.3, G-7.2, G-7.4, G-7.12 all catch planted similarity/percent violations
- Incomplete quotes handled by anchor locator → only unverifiable, never verified
  - evidence: packages/mizan-verify/src/steps/anchor.ts: ordered 3-8 word fragment locator
  - evidence: ADR-21: 'anchor locator… can only ever yield unverifiable'
  - evidence: G-7.1 gate forbids anchor.ts from containing 'verdict' word
- Companion/athar licence decision recorded with grade-null, no quarantine
  - evidence: packages/mizan-corpus/src/adapters/source-meta.ts: two excluded rows with exclusionReason
  - evidence: data/registry/sources.json and DISCLOSURE.md regenerated with decision
  - evidence: packages/mizan-corpus/test/registry-decision.test.ts: 'a companion attribution is GRADE-NULL, so no sahih or daif vocabulary is borrowed', 'neither row is a quarantine'
- 10 runs byte-identical, falseVerifiedDelta = 0 against committed baseline
  - evidence: scripts/article-determinism.test.ts: 15 tests pass including 'ten runs of the article path are byte-identical… covers ordering, verdict reasons and the counts'
  - evidence: data/eval/article-coverage.json: baseline artefact with conditions block
  - evidence: scripts/article-determinism.test.ts: 'falseVerifiedDelta is zero against the committed baseline… the baseline is an ARTEFACT, not a number in this test file'
- Market comparison: mizan is the only system with deterministic per-claim citation verification
  - evidence: Websearch: UmmahAPI, islamic.app, hadith.to — content APIs with zero verification
  - evidence: Websearch: Zubda AI — 'no hallucination policy' with no verifier (Cloudflare Workers + Llama 3.3 70B)
  - evidence: Websearch: Noor, QuranRAG, Quranic RAG — embedding-based semantic search (Recall@30 ~0.445 IslamicEval 2025)
  - evidence: ADR-03 spike table in packages/mizan-verify/src/steps/containment.ts: faithful paraphrase = no-match, fabrication = high similarity
- Sprint 2 stories (MS2-1 through MS2-4) not yet delivered
  - evidence: docs/specs/impl-cr-round-scanner-resolution.md:95: 'MS2-1 (root-coverage artefact over 1,651 roots) remains not executable: CorpusRecord has no root/stem/lemma field'
  - evidence: No MS2- references in any .ts implementation files
  - evidence: ADR-21 written but demo refusal block not implemented

## Risk Notes
Customer explicitly asked for 'closest in meaning' — ADR-21 refusal must be demo-visible with spike table evidence. Customer asked for 'advanced RAG by root' — MS2-1 measurement artefact answers credibly but requires CorpusRecord schema extension. Companion corpus request answered by ADR-23 licence decision (grade-null, no quarantine). Article flow requires client-side chunking — provide reference implementation.

## PO / Sales Impact
Sprint 1 delivers the industry's ONLY deterministic article-scale verification with published accountability (segments/extracted/checked). Every claim is backed by a committed artefact and failing gate. The 'meaning' matching request is refused with measured evidence (ADR-03 spike table: faithful paraphrase scores worse than fabrication). Root indexing is answered by measurement (MS2-1 planned). Companion quotes: no open licence found; decision recorded honestly. Ready for customer demo with seeded document (MS2-3) once MS2-2 refusal surface lands. Competitive moat: verification + accountability denominator + fail-closed degradation — no competitor has this combination.