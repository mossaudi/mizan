# ADR-11 — Evidence is tiered, not laundered

- **Status:** Accepted

## Context

A trace-builder bug stamped **196 of 274** ledger rows with placeholder timings (`elapsedMs` 0 and a
constant `resultCount`), and **273 of 274** runs in the committed ledger are precomputed rather than
live. Both facts are on HEAD, in a file whose whole purpose is to be checked.

The tempting repair is a rewrite: correct the timings, drop the synthetic rows, re-attest. That
repairs the appearance and destroys the substance — the ledger is a hash chain, and editing an
entry invalidates every hash after it.

## Decision

**Do not rewrite history.** Disclose the evidence tier explicitly on every displayed line and in
the ledger, and append a clean tranche of genuinely live runs. A machine check runs over the tail
of the ledger and asserts what the tranche claims: every entry declares its transcript tier, no
stage that executed reports zero milliseconds, no entry carries a constant result count across the
tail, and no entry contains a question string or a key-shaped token.

## Rationale

Rewriting breaks the hash chain and destroys the auditability that is itself the product's proof
asset. Disclosure is the honest state and is already this project's doctrine: a ledger of only
successes is the thing the check exists to forbid, and a human reading twenty rows and saying
"yes, looks real" is the exact failure it is meant to stop. Tiering the evidence lets a reader weight
it; laundering it asks the reader to trust the editor.

## Consequences

- The disclosed weakness stays in the record, and the record stays verifiable end to end.
- The machine check is tail-only: entries before the declared start index are the disclosed past
  and are irrelevant to whether the tranche is honest.
- Failures are still appended and still count — a truncated tranche is reported short, never padded.
- Live and replayed evidence are never presented under one label; the tier travels with the row.
