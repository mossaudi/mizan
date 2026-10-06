# ADR-16 - MCP era support: one era this cycle, dual era recorded for later

- **Status:** Accepted

## Context

The v7 baseline (`specs/we-have-a-real-customer-deal-opportunity-the-customer-faces-real-v7.md`,
section 5, line 2198) recorded ADR-16 as *Proposed*: `MCP_PROTOCOL_VERSION` is `2024-11-05`, the
Legacy initialize-handshake era, while the 2026-07-28 specification is stateless — initialize
retired, a per-request protocol version in `_meta`, `server/discover` a MUST,
`UnsupportedProtocolVersion` carried on `-32022`, and a 12-month deprecation window. The verify
response carries no schemaVersion of its own, so additive fields would break existing clients.
The proposal: support both eras behind one factory, land any new capability as a second opt-in tool
through the formal extensions framework, and keep one golden transcript per era so a spec bump
surfaces as a diff.

The reconciliation log (`docs/specs/v7-reconciliation.md`) disposes that proposal as **reject** for
this cycle: the shipped server serves the Legacy era only, the plan of record carries no dual-era
story, and a rejected proposal still deserves its context written down where a citation lands — a
gap where `ADR-16` resolves would be the folklore failure `docs-adr.ts` exists to prevent.

## Decision

This cycle does not adopt dual-era MCP support, and that refusal is the decision this record
accepts:

1. `MCP_PROTOCOL_VERSION = "2024-11-05"` in `packages/mizan-mcp/src/server.ts` remains the single
   pinned era. There is no second factory, no era detection and no `server/discover` handler.
2. The `verify` tool's response shape is untouched by this decision — it was never in scope to
   change it, and byte-stability of that response is the property any future era work must preserve.
3. The proposal's shape (one factory, capability as a second opt-in tool, one golden transcript per
   era) is the recorded direction **if** dual era is reopened. Reopening is a new ADR in this
   directory referencing this one, not an edit to these lines: a decision record that changes with
   the mood of the cycle is not a record.

## Consequences

- A client speaking the 2026-07-28 stateless era is not served, and nothing pretends otherwise. No
  compatibility shim, no partial stateless path, and no response field advertising an era that is
  not implemented.
- The plan of record's Sprint 2 carries no dual-era story, so no test, fixture or golden transcript
  for a second era exists — and the absence is visible here rather than in a reader's inference.
- When the deprecation window makes the Legacy era untenable, this file is the starting point: the
  context above is written, the decision above is the one being reversed, and the reversal gets its
  own record with its own status.
