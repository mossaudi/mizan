# ADR-C4 — Corpus scope: honest framing first, licensed and attested sources only

- **Status:** Accepted
- **Accepted:** 2026-09-29
- **Source:** `specs/for-this-project-need-to-deep-honest-review-and-analysis-and-val.md` §7

## Context

The attested corpus is 27,234 records: Qur'an 6,236, an-Nasa'i 5,672, Abi Dawud 5,272, Ibn Majah
4,336, at-Tirmidhi 3,889 and Malik's Muwatta 1,829. Bukhari and Muslim are **absent at record
level**, and UmmahAPI / Sunnah.com could supply them. Claiming a collection we do not hold is the
cheapest credibility error available, and importing one without a clear licence would break the
attestation and ledger guarantees that are the product's whole claim.

## Decision

Every public claim states **"4 Sunan + Muwatta + Qur'an, 27,234 records"** and nothing else.
Bukhari and Muslim are not held, so no surface may name them as covered; that changes only when a
licensed, attested ingest actually lands. Collections are added only through a source whose licence
could be established, recorded in `data/registry/sources.json`, and attested.

## Rationale

- An unlicensed or unattested import would break attestation and the hash-chained ledger — the two
  properties the submission is scored on — for a collection nobody has asked for yet.
- The honest framing is arithmetically verified: the six collection counts above sum to the
  attested `recordCount`, and `bun run ingest:check` re-derives it.
- A source whose licence could not be established is recorded as **disabled with a reason**, not
  quietly used. Silence would be the same defect as a false claim.

## Consequences

- Slide 7 and the README carry the honest framing; a silent downgrade or upgrade of the count is a
  build failure rather than a wording preference.
- Story 9 owns ingestion with a licence gate first and **honest framing as the spec-sanctioned
  fallback** if the licence check fails. The fallback is a success state, not a partial delivery.
- `docs/value-proof.md` and the registry are the two sources of truth for the count; nothing
  restates it a third time.
