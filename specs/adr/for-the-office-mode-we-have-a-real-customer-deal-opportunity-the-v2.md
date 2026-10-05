# ADR: for-the-office-mode-we-have-a-real-customer-deal-opportunity-the v2

**Status:** proposed
**Date:** 2026-10-05

## Context
# spec-customer-readiness-nearest-quote-2026-10-05

## 1. Executive Summary

The nearest-quote suggestion feature is **already built, CI-green, and measured** — I verified `check:docs` OK (10 audited docs, 303 files swept) and all7 gates pass. So the request for "production-ready and industry-leading" work has an uncomfortable honest answer: **adding capability is the wrong response and would make the product worse on the axis this customer buys.** No competitor in the research ships a computed badge, an attested snapshot, or machine-checked claims about its own behaviour. The gap deciding this deal is **claim defensibility under audit**. I scoped three epics — make the suggestion figure corpus-wide, rule on and deliver MCP parity, rehearse acceptance on the customer's own machine — and explicitly refused dense retrieval, LLM-in-verdict-path, fuzzy-authoritative matching, and an eighth gate.

## 2. The finding that reorders the request

The context report called the hadith-only evaluation set a "coverage blind spot". It is worse. I root-caused it:

`mainAnchors` (`scripts/eval/build.ts:182`) walks `collectionsOf(db)` **name-ascending** — `abudawud, ibnmajah, malik, nasai, quran, tirmidhi` — taking 5 records each into a 30-entry list. Every red-team builder then takes a **contiguous prefix**: `buildOneWord(…, 4)` slices `[4,16)`, the others slice from `0`. A prefix of a name-ordered list never reaches the later collections.

Confirmed against the committed artefact — the red-team file cites `abudawud 22, ibnmajah 16, malik 2`, and **zero** `nasai`, `quran`, `tirmidhi` cases. The golden set already carries `quran 20, tirmidhi 16, nasai 25`, so the data to close this exists in-tree.

**Served corpus coverage of the suggestion measurement: 3 of 6 collections, 17,398 of 27,234 rows (63.9%). Qur'an (6,236) and Tirmidhi (3,889) — 37% of served records — have zero measurement.** A customer who reads `build.ts` and sees the prefix-slice will reasonably conclude every number 

## Decision
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
packages/mizan-corpus/src/served.ts       # serve

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.