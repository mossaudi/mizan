# Honest Degradation Matrix

## Purpose

This matrix documents exactly how mizan degrades for each of the 7 failure modes.
Each failure mode has exactly one correct surface and a list of forbidden surfaces.
The system never fabricates a result when a component fails.

## The 7 Failure Modes

| # | Failure Mode | Trigger | Correct Surface | Forbidden Surfaces | Exit Code |
|---|---|---|---|---|---|
| 1 | Provider down | LLM provider unreachable | `model unavailable` | canned answer, silent mock, partial answer shown as complete | 1 |
| 2 | Corpus miss | No matching sources in corpus | `no sources found` | a guess, a cached answer | 1 |
| 3 | Verification timeout | Verification exceeds 10s budget | `unverifiable` | `verified`, a cached prior verdict, a crash | 1 |
| 4 | Ledger write failure | Disk full, permissions | run marked untrusted | fail-open, "as if recorded" | 3 |
| 5 | Attestation mismatch | Corpus hash does not match committed attestation | loud integrity error, no verdict | warn-and-proceed | 3 |
| 6 | Tafsir backend unreachable | Tafsir backend not responding | `unavailable` | fabricated tafsir | 1 |
| 7 | Second ranker down | Semantic ranking service unavailable | `semanticRanking: "unavailable"` in metadata | silent downgrade to less accurate method | 1 |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Run completed and every claim reached the verdict it was declared to reach |
| 1 | Pipeline ran honestly but could not deliver a full answer (degraded) |
| 2 | Command line or committed input file was not usable (usage error) |
| 3 | Run happened but cannot be trusted (attestation failed, ledger write failed) |

## Design Principles

### Fail closed

Where a check can fail, the default action is refusal. Zero evidence blocks approval.
An attestation mismatch aborts the run. A ledger write error marks the run untrusted.
A verification timeout yields `unverifiable`.

### Honest degradation

Each failure has exactly one correct surface. The system never returns a precomputed
or canned response, never silently substitutes a mock response, and never shows a
partial answer as complete.

### No bypass

A failure mode in any component never bypasses the verification step. A `verified`
verdict is never produced without actual verification.

### Nearest-quote suggestions cannot fail into a badge

The suggestion pass is display-only and runs **after** every verdict is printed (ADR-07). It has three
states, and each has one correct surface:

| Suggestion state | Trigger | Correct surface | Forbidden surfaces |
|---|---|---|---|
| `candidates` | One or more records cleared the **display** floor of 12 shared folded characters (ADR-12) | one to five lines, each reading `shared: N of M folded characters - display only, never a verdict`, under `nearest suggestions (non-authoritative) - not a verification result`, followed on the header line by `X returned of Y records scanned` and the scope in words | any wording that reads as a correction, a grade, or a second opinion; a percentage |
| `no_candidates` | The scan read every record and none cleared the floor | the reason first — which distinguishes *nothing was near enough to rank* from *something ranked and was not close enough to show* — then `0 returned of Y records scanned` and the scope, on one line | a guess, a cached list, an empty section with no explanation |
| `unavailable` | The scan or the winners' re-read failed, so there is no count to report | `unavailable`, naming the failure by its `_tag` alone and never its payload — a decode failure's detail can quote the offending row, and corpus text belongs in no output of this program | a partial list presented as the whole search; a failure detail; any count, because there was no search to count |

The three `unavailable` reasons are exactly `the corpus could not be searched for nearby records (<tag>)`,
where `<tag>` is the failure's own name — `row_undecodable`, `parse_failed`, or the fixed phrase
`a nearby record could not be re-read` for a winner that vanished between the scan and the re-read.
Naming the tag and nothing else is deliberate: `row_undecodable` carries a record id and a detail in
the error object, and a decode detail can quote the offending value, so both are dropped at the
boundary. Corpus text belongs in no output of this program (AGENTS.md §13), and a failure detail is
the one place a corpus row would otherwise reach a terminal.

The counts are not decoration. `Y` is the number of records the scan actually read and `X` is what
survived the floor, so a bound on the list is visible rather than implied — and `0 returned of 27,234
records scanned` is a statement a reader can weigh, where an empty section is not. The two integers
beside each record are the same measurement the floor was applied to, which is what lets a reader check
the threshold rather than take it on trust.

A suggestion failure is **never** a verdict failure: an undecodable row makes the *suggestions*
unavailable, while the verdict that was already printed stands unchanged. The converse is also enforced —
no suggestion can change, upgrade or block a verdict, and the flag `--no-suggestions` skips the pass
entirely rather than silently degrading it.

The cost is stated rather than hidden: one exhaustive scan of the snapshot per rejected claim, measured
at **p50 686 ms / p95 1156 ms / max 1555 ms** on the committed 27,234-record corpus
`snapshotHash=7b3b66fbca7fb9df.` against a `< 50 ms` target that this architecture does not meet
(ADR-08). That is the slowest of five consecutive runs;
`docs/specs/measurements.md` is the one place the figure and the conditions it was measured under are
recorded — corpus identity, case count, quantile rule, cache state, runtime, platform, CPU, and the
1.5x band a rerun may differ by — and `bun run eval:suggestions` prints both in the same run.

## Testing

Each failure mode has a test that triggers it and asserts the correct surface. The
tests are in `packages/mizan-core/test/degradation.test.ts`. The suggestion states above are tested in
`apps/cli/test/suggestions.test.ts` against a real snapshot, a real verifier and the real renderer.

### The two states a checkout without a corpus hits

A clean clone never enters the pipeline, so two surfaces have a refusal with no run behind it, and the
matrix needs words for them. `apps/cli/test/clean-clone.test.ts` and
`packages/mizan-mcp/test/clean-clone.test.ts` trigger each state and assert that the CLI and the MCP
server name it with the *same word* — the CLI prints `corpus_absent: …` and the MCP server prints
`corpus_missing: … — corpus_absent: …`, so a client comparing the two surfaces reads one reason.

| state | condition | why it is not the row above it |
| --- | --- | --- |
| `data/corpus.db` does not exist | `corpus_absent` | nothing was retrieved; `bun run ingest` is the fix |
| it exists and is not a snapshot | `corpus_unusable` | the file is present and corrupt, so "absent" would send an operator looking for a clone that does not exist |
| it exists, and `attestation.json` cannot be read | `attestation_unreadable` | nothing disagrees yet — there is no verdict to disagree |
| it exists, and the attestation names another snapshot | `attestation_mismatch` | loud, and never a verdict computed against the wrong corpus |

The MCP server starts and refuses every call: on a missing corpus it serves the session, answers
`initialize` and `tools/list` normally, and answers each `tools/call` with `isError: true` and
`reason: "corpus_absent"`, so a client can branch on the same word it would branch on from the CLI
while never reading a verdict. Nothing is written to stdout that contains `verified` or `verdicts`, and
the reason is also printed once on stderr at startup for an operator who is not an MCP client.
`scripts/accept-customer.clean-clone.test.ts` is the same claim at the command level, and
`bun run ci:clean-clone` runs it.

## The article surface's own failure modes

The seven rows above are the failures of a RUN. A document ingested through `verify_document` adds
five more, and each has exactly one surface and one forbidden alternative. They are a separate table
rather than rows 8 to 12 of the table above because the seven above are the answer-side contract
`packages/mizan-core/test/degradation.test.ts` pins by name, and renumbering them would change a
test that is not about this surface.

| Failure | Correct surface | Forbidden surface | Owner |
|---|---|---|---|
| Document longer than the declared cap | `document_too_large`, naming the cap | silent truncation into a partial report presented as complete | `document-segments.ts` |
| Cursor naming a different document | `cursor_document_mismatch`, naming both digests | restarting at index zero, which labels a partial run a continuation | `article-contract.ts` |
| Request budget expired mid-chunk | `unverifiable (verification_timeout)` for that chunk's spans, with the chunk named as a gap | `verified`, a cached prior verdict, a clean-looking document | `article-contract.ts` |
| A span the selector never emitted | a named `not_extracted` gap with its segment index | an empty list, which reads as "there was nothing there to find" | `select-spans.ts` |
| Per-span suggestion budget spent | `unavailable`, naming the budget | a truncated candidate list shown as the whole search | `article-suggestions.ts` |

Two of these are states a surface reports instead of entering the pipeline, and one is a state inside a
run that a single verdict cannot express. `document_too_large` is a `DegradationCondition` — it is what
a caller reads when the run was refused before segmenting — while `cursor_document_mismatch` is a
boundary refusal with no shared condition, because it is about the CALL rather than about a run and
reporting a pipeline condition for it would tell a client its document had degraded when its cursor
was simply wrong. `packages/mizan-core/test/degradation-vocabulary.test.ts` asserts the condition set
in both directions, so neither can be added in one file.

**The completeness claim is not in this table because it is not a failure.** It is a control: gate
G-7.13 fails the build when a display module emits a completeness phrase without the
`extracted`-of-`segments` denominator on the same line, and when `apps/cli/src/coverage-render.ts`
exports no analysable claim site at all. A rule that could not fail would be the switch, and a switch
that could be deleted by a refactor is not a control.
