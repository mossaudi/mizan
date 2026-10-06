# Reconciling the v7 baseline with the plan of record (SB-001)

**Plan of record:** `specs/we-have-a-new-customer-deal-opportunity-this-customer-faces-real.md` — ten
stories `SB-001`..`SB-010` over two sprints, authorized by `ADR-CEO-001` (recorded in that document's
section 5): the v7 baseline is accepted as the baseline, and every deviation from it is an explicit
accept / adopt / reject disposition in this log.

**Baseline:** `specs/we-have-a-real-customer-deal-opportunity-the-customer-faces-real-v7.md`, read in
full for this reconciliation. The references below resolve against it, which is what makes "read in
full" checkable rather than asserted: its `## Stories` section starts at line 5 (Sprint 1 at line 75,
Sprint 2 at line 906), and `## 5. ADRs Recorded` at line 1871, with ADR-15 at line 2189, ADR-16 at
line 2198, ADR-17 at line 2207 and ADR-18 at line 2216 inside its `adrs` array. The six spec
corrections the acceptance review applied are the baseline's own section 13, at line 2475.

## Fail-closed

If the baseline could not be read, this reconciliation could not be completed and would be recorded
as exactly that — a plan inferred from an unread baseline is worse than no plan, because it would
carry the appearance of the review without its content. The baseline was read. A v7 row whose
section cannot be located earns disposition `unverified` and an open question below; no row is
dropped silently, and no disposition is inferred from a title alone.

## Part A — v7 story dispositions

One disposition per story, exactly one: `adopt` (the delivery is the right thing and stays),
`reject` (not carried by the plan of record for this cycle, with the reason), `accept` (the
requirement is taken as written without its delivery), `unverified` (cannot be decided from what is
readable).

| v7 item | source section | disposition | rationale | evidence |
| --- | --- | --- | --- | --- |
| Story 1: ADR-15 — per-collection anchor derivation with a coverage gate that fails on an absent slice | Stories, Sprint 1 (line 77) | adopt | Delivered as written: round-robin anchor selection, and the coverage floor is a docs rule whose self-test plants the violation | `docs/specs/adr/ADR-15.md`; `scripts/eval/selection.ts`; `packages/mizan-gate/src/docs-coverage.ts` |
| Story 2: Regenerate the red-team set across all six collections while preserving hand-adjudicated anchors | Stories, Sprint 1 (line 200) | adopt | Delivered; regeneration runs as `bun run build:eval`, and ADR-15's own table records the per-collection result the story asked for | `data/eval/redteam-fabricated.json`; `scripts/build-eval-set.ts` |
| Story 3: Publish the per-collection measured table, zeros rendered rather than omitted | Stories, Sprint 1 (line 321) | adopt | Delivered: the per-collection table is published with stated zeros, and a docs rule compares it against the committed artefact | `docs/value-proof.md`; `docs/specs/measurements.md`; `checkMeasuredSetDigest` |
| Story 4: Dataset identity digest in every report; relative gates refuse mismatched run identities | Stories, Sprint 1 (line 438) | adopt | The digest is recorded in the benchmark artefact and compared against every document publishing the table; the acceptance command re-derives identity on a clean clone | `data/benchmark/vs-search.json`; `scripts/accept-customer.ts` |
| Story 5: ADR-17 — recall is a precondition of recording any latency artefact | Stories, Sprint 1 (line 547) | adopt | Delivered: `--record` refuses the write when a recall baseline drops, and the ordering is asserted by test rather than by comment | `docs/specs/adr/ADR-17.md`; `scripts/eval/suggest-coverage.ts`; `scripts/eval/suggest-coverage.test.ts` |
| Story 6: `accept:customer` — every published figure re-derived by one command on a clean clone | Stories, Sprint 1 (line 659) | adopt | Delivered as a package script, with a command-level clean-clone test beside it | `scripts/accept-customer.ts`; the `accept:customer` script in package.json |
| Story 7: Typed honest degradation proven by test on both shipped surfaces | Stories, Sprint 1 (line 788) | adopt | Delivered: the matrix is the document, and the CLI and the MCP server each have a clean-clone suite asserting the same reason words | `docs/degradation-matrix.md`; `apps/cli/test/clean-clone.test.ts`; `packages/mizan-mcp/test/clean-clone.test.ts` |
| Story 8: ADR-18 — the customer claim surface is derived, not typed | Stories, Sprint 2 (line 908) | reject | No generator ships and the plan of record does not carry one; customer figures remain artefact-backed through the docs rules, and the proposal is preserved as a decision record rather than dropped | `docs/specs/adr/ADR-18.md`; no `gen:comparative` script exists in package.json |
| Story 9: Gate sweep — typed figure literals in `.py` generators and generated artefacts | Stories, Sprint 2 (line 1028) | reject | The `.py` trees stay corpus surfaces only, which is a documented scope decision in the sweep's own module rather than an omission; figure rules stay on the documents the audit reads | `packages/mizan-gate/src/docs-corpus.ts`, the extension decision above `CORPUS_SURFACE_EXTENSIONS` |
| Story 10: ADR-16 — MCP dual era, a second opt-in tool, and one golden transcript per era | Stories, Sprint 2 (line 1140) | reject | The shipped server serves the Legacy era only, the plan of record does not carry dual-era work, and the proposal is preserved as a decision record below | `packages/mizan-mcp/src/server.ts`; `docs/specs/adr/ADR-16.md` |
| Story 11: Per-collection latency table with recorded conditions and the tolerance block | Stories, Sprint 2 (line 1267) | reject | Latency ships as one aggregate with its full conditions block and tolerance band; per-collection latency is measurement work the plan of record does not carry this cycle | `docs/specs/measurements.md`; `docs/specs/adr/ADR-C10.md` |

Seven stories adopt and four reject. The four rejects are v7's Sprint 2 items: two are replaced by
their decision records (ADR-16, ADR-18), two are scope the plan of record deliberately did not take
(the `.py` figure sweep, per-collection latency). None is dropped silently — that is what this table
exists to prevent.

## Part B — v7 ADR dispositions

| v7 item | source section | disposition | rationale | evidence |
| --- | --- | --- | --- | --- |
| ADR-15 — Slice derivation replaces contiguous prefix selection | 5. ADRs Recorded (line 2189) | adopt | Implemented and enforced by a docs rule with a planted-violation self-test; the ADR file already carries the accepted decision | `docs/specs/adr/ADR-15.md` |
| ADR-16 — MCP serves both eras; new capability lands as a second opt-in tool | 5. ADRs Recorded (line 2198) | reject | Dual-era support is not shipped and is not in the plan of record for this cycle; the record below preserves the context so a later cycle reopens it deliberately | `docs/specs/adr/ADR-16.md`; `MCP_PROTOCOL_VERSION` in `packages/mizan-mcp/src/server.ts` |
| ADR-17 — Recall is a precondition of recording a latency figure | 5. ADRs Recorded (line 2207) | adopt | Implemented: the recorder refuses a write whose recall baseline dropped, tested as a pure function | `docs/specs/adr/ADR-17.md`; `scripts/eval/suggest-coverage.test.ts` |
| ADR-18 — The customer claim surface is derived, not typed | 5. ADRs Recorded (line 2216) | reject | The derivation pipeline is not shipped; the honest interim state is that every published figure is artefact-backed by a docs rule, which is recorded as the accepted decision in the ADR file | `docs/specs/adr/ADR-18.md` |

## Sprint story trace (SB-001 through SB-010)

| Story | Sprint | v7 item addressed | CEO delta, and status |
| --- | --- | --- | --- |
| SB-001 | 1 | All 11 stories and ADR-15..18 above | This log — the reconciliation ADR-CEO-001 requires; delivered |
| SB-002 | 1 | None — hardens ADR-C3's transcript labelling, which the baseline took as given | Header-integrity evidence and a runbook correction; delivered |
| SB-003 | 1 | Story 7 (typed honest degradation) | Conformance audit of the matrix against code, as an evidence document with row parity; delivered |
| SB-004 | 1 | Stories 6-7 adjacent (the acceptance and clean-clone machinery) | Recorded gate/docs/parity evidence log; delivered |
| SB-005 | 1 | Stories 2-3 (the measurement and its table), correcting a stale premise | Coverage-basis rule, scope notes, measurement-basis evidence; delivered |
| SB-006 | 2 | None — hashes-only evidence bundle is a CEO-delta epic | Planned Sprint 2; out of scope for this deliverable |
| SB-007 | 2 | None — risk-based thin-surface hardening | Planned Sprint 2; out of scope for this deliverable |
| SB-008 | 2 | None — external anchoring note, deferred by decision | Planned Sprint 2; out of scope for this deliverable |
| SB-009 | 2 | ADR-15..18 delta list (the cross-reference section this log defers) | The delta section of this document, plus the count-test extension; planned Sprint 2 |
| SB-010 | 2 | None — integrity review of the repository's own `TODO(S12)` items | Planned Sprint 2; out of scope for this deliverable |

**Explicitly rejected v7 items, collected:** Story 8, Story 9, Story 10, Story 11, ADR-16's dual-era
proposal, ADR-18's derivation pipeline. The two ADR rejections keep their documents, so a citation
resolves and a later reader sees the decision instead of a gap.

## Security

This log carries identifiers, dispositions and file paths — no question text, no corpus text, no
ledger content and no secret of any kind (AGENTS.md section 13). Each disposition was decided by
reading the file named in its own evidence cell; none is inferred from a title, and none was
recorded without that read. An item that could not be decided would appear as `unverified` above
with a question below it, never as a quiet `adopt`.

## Open questions

1. `.env.example` states this build has no Ollama adapter, while `packages/mizan-agent` ships one and
   `apps/cli/src/provider-config.ts` exports a fallback route to it that nothing calls. Removal or
   wiring is a product decision nobody has recorded; SB-002's evidence states both facts as they
   stand rather than choosing.
2. The six spec corrections in the baseline's section 13 were applied by the acceptance review; a PM
   sign-off recording them was not found in the wiki when this log was written. The corrections are
   cited here so the next reader can check them against the baseline text.
3. `specs/*-v8.md` and `specs/*-v9.md` describe a later, different request lineage that this plan of
   record does not adopt. Which lineage governs the next cycle is a question for whoever authorizes
   that cycle, not a disposition this log can make.
