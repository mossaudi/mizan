# ADR-19 — Article ingest is a bounded, resumable, stateless chunk contract; per-call caps are not raised

- **Status:** Accepted
- **Accepted:** 2026-10-08
- **Namespace:** continues the numeric namespace from ADR-18
- **Extends:** ADR-13 (latency figures need a recorded artefact), ADR-17 (recall is a precondition)

## Context

The MCP boundary caps one `tools/call` at `MAX_CLAIMS_PER_CALL = 32` claims of
`MAX_CITATIONS_PER_CLAIM = 3` citations, and those numbers exist because of a measurement rather
than a preference. Measured against the real 27,234-record snapshot, a call costing 32 citations
took 13 ms, 3,200 took 600 ms, **32,000 took 5.8 s and 160,000 took 26.9 s** — against a 30-second
budget the verifier cannot interrupt, because `deadlineExpired` is only consulted downstream of
resolution and the corpus read has already been paid for. The cap sits at the boundary because the
boundary is where that work is decided.

Article scale is two to three orders of magnitude beyond the largest number anyone has actually
measured. There are three shapes available for reaching it, and two of them are wrong for reasons
that are not about taste:

- **Raise the cap.** This deletes the measurement. Once `MAX_CLAIMS_PER_CALL` is 512 the 5.8 s and
  26.9 s figures describe a configuration nobody runs, the comment above the constant is a historical
  artefact, and the next person to raise it again has no numbers to consult. A cap whose rationale
  is a measurement is worth exactly as much as the measurement.
- **Store the document server-side and hand back a job id.** This adds a persisted asset, a
  cross-client enumeration path, a signing secret, a retention story for untrusted third-party
  religious content, and a cleanup path that fails. It also gives up a property this server already
  publishes and can currently TEST: `server.ts` states that no state is leaked between clients, and
  that claim is testable precisely because there is no state. A job table converts a testable
  absence into an unstated promise.
- **Make the CHUNK the budget unit.** The client keeps the document and drives the loop. Each call
  carries at most 32 spans, so each call costs at most 32 x 3 = 96 citations — inside the measured
  3,200-citation ~600 ms band by a factor of 33 — and the existing caps apply unchanged to every
  chunk.

## Decision

**A document is processed as a bounded sequence of chunks, addressed by a stateless cursor. The
existing per-call caps are unchanged and continue to apply to every chunk.**

Four properties, which are the contract:

1. **Bounded.** One chunk is at most `MAX_CLAIMS_PER_CALL` spans. `MAX_SPANS_PER_CHUNK` in
   `packages/mizan-mcp/src/article-contract.ts` is that constant, assigned from it rather than
   restated, so the two cannot drift.
2. **Resumable.** A chunk's response carries a cursor naming `documentDigest` and the next segment
   index. A run interrupted after chunk *k* resumes from that cursor and the assembled report is
   byte-identical to an uninterrupted run.
3. **Stateless.** There is no job id, handle, table, cache or temp file. The cursor is a binding
   between a document digest and an index, nothing more.
4. **Server-derivable.** The client re-sends the document on every chunk, so the server re-runs
   deterministic segmentation and computes the digest itself.

### Why the client re-sends the document

Because a client-supplied digest cannot be checked. If the client sent a pre-sliced chunk plus its
own digest, the server never sees the whole document, and the only available verification is the
client asserting that two strings it chose are equal — which is precisely what a client being lied
to would do. Re-sending makes the digest check real. The cost is bandwidth; the alternative is a
promise.

### Why the cursor is a binding and not a credential

There is no secret in it. A client can construct any cursor it likes, and constructing a correct one
only makes that cursor address its own document. Stating that plainly matters more than making the
shape look like a capability: an opaque handle implies an authority this design does not have, and
over-claiming is the failure AGENTS.md section 12 exists to stop. The wire form is therefore plain
canonical JSON — readable, declared, and length-capped like every other client string. It is not
base64 for the same reason, and because gate G-3.2 bans encoding round-trips as obfuscation.

## Consequences

- `MAX_CLAIMS_PER_CALL` and `MAX_CITATIONS_PER_CLAIM` are untouched. Their equality assertions in
  `packages/mizan-mcp/test/server.test.ts` pass unmodified, and `packages/mizan-mcp/test/article-contract.test.ts`
  restates them so the change that would make raising them look reasonable carries its own tripwire.
- The client retains the document and drives the loop. That is the honest cost of not storing
  untrusted third-party content, and it is a cost the client already pays — it sent the bytes.
- There is no cursor to revoke and nothing to expire, because there is no server-side authority to
  revoke.
- A rejected shape stays rejected in the direction that matters: a cursor whose digest does not match
  the submitted document is REFUSED and does not restart at index zero, because a silent restart
  would present a partial report as the whole document.
- The document-length cap (`MAX_DOCUMENT_CHARS`) is ARITHMETIC rather than measured, and says so:
  4,096 quote characters x 32 spans is one chunk of maximum-size segments. Raising it requires a
  measurement of what a larger document costs before it is raised, for the reason in the first
  section. An unmeasured number in a file whose neighbours are measured is the defect this
  repository exists to catch, so it is labelled rather than dressed up.
- A document one character over that cap is refused whole with `document_too_large`, carrying the cap
  in the message, and no partial segment list comes back with it. The refusal is the shared
  `DegradationCondition` rather than a reason on a verdict, because no span ever reached the
  verifier: it is a state a surface reports *instead of entering* the pipeline, like `corpus_absent`.
  Silent truncation is the forbidden alternative — a shortened document produces a shorter denominator
  and every accountability figure on it is quietly wrong, which is the fail-open direction this whole
  decision exists to close.

## Rejected

- Raising `MAX_CLAIMS_PER_CALL` or `MAX_CITATIONS_PER_CLAIM`.
- A stateful job table, a document cache, or any server-side progress record.
- Overloading `verify` to accept a whole document.
- A client-supplied document digest.
- An opaque, signed cursor.
