# ADR: for-the-office-mode-we-have-a-real-customer-deal-opportunity-the v1

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
(see spec)

## Consequences
Spec persisted from office workflow. Review architecture plan before implementation.