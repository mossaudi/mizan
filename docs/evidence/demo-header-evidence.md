# Demo header evidence: the transcript label is rendered, never asserted (SB-002)

**Recorded by:** SB-002 (CEO sprint plan). **Tags:** demo, replay, transcript-label, evidence.

This file is the capture for the claim *"the demo header prints `LIVE` for a live run and
`PRECOMPUTED (deterministic replay)` for a replay, computed from one label table."* Every excerpt
below was produced by re-running one command against this repository in its current state. The
horizontal frame bars the renderer also prints above and below the block (`bar(64)` at
`apps/cli/src/render.ts:528` and `:538`) are elided for width; no captured line was altered,
reordered or reworded.

## Excerpt 1 — observed

Captured by running the CLI with no key configured (`MIZAN_LLM_API_KEY` unset) and no
`MIZAN_PROVIDER`, so the provider that resolves is the committed transcript:

```text
$ bun run ask "What does the Qur'an say about the oneness of God?"

sources       6 from the local snapshot
model         transcript-v1
transcript    PRECOMPUTED (deterministic replay)
snapshot      7b3b66fbca7fb9df…
language     en (ltr, detected)

[VERIFIED] ikhlas-1 — exact_containment (match: exact)
```

Tagged: **observed**. Validates: the keyless route prints exactly `transcriptLabel("precomputed")`
on the transcript line — the label the schema table defines, not a sentence a reviewer wrote. The
excerpt is the header block and the verdict line only; the answer body and the quoted corpus text
were omitted from this document by design (AGENTS.md section 13: corpus text travels through
documents only where it is the subject of the document).

## Excerpt 2 — rendered

Captured by calling the header renderer directly with the same shape of input a live run would
produce (`transcript: "live"`):

```text
$ bun -e "import { renderHeader } from './apps/cli/src/render.ts'; …
  renderHeader({ transcript: 'live', model: 'gpt-4o-mini', snapshotHash: '7b3b66fbca7fb9df', sourceCount: 6 })"

sources       6 from the local snapshot
model         gpt-4o-mini
transcript    LIVE
snapshot      7b3b66fbca7fb9df…
```

Tagged: **rendered**. Validates: the same renderer that printed Excerpt 1 prints
`transcriptLabel("live")` for the live kind. This excerpt is a pure function call — no network, no
provider, no clock — so the label is a property of the renderer, not of whichever provider happens
to be available.

## The one label table both excerpts draw from

The transcript line is `transcript    ${transcriptLabel(options.transcript)}` inside `renderHeader`
(`apps/cli/src/render.ts:519`, label line :535). `TRANSCRIPT_LABEL` and `transcriptLabel` live in
`packages/mizan-core/src/schema/trace.ts` (table at :61-67) beside `TranscriptKind = "live" |
"precomputed"` (:41). The mapping is exhaustive by type, so a third mode stops the repository
compiling instead of inventing a third label:

| kind | printed label |
| --- | --- |
| `live` | `LIVE` |
| `precomputed` | `PRECOMPUTED (deterministic replay)` |

Excerpt 1 and Excerpt 2 are the two rows of that table, observed through the CLI and rendered
directly. `apps/cli/test/header-invariant.test.ts` asserts the same mapping byte for byte against
`transcriptLabel`, and `apps/cli/test/runbook-label.test.ts` checks the runbook's printed labels
against the table in both directions — a label the runbook prints that the schema does not define,
or a defined label the runbook never shows, each fails a test.

## The host-knower grep: which files ever name a model host

Command, run against the working tree:

```text
$ git grep -n -E "api\.openai\.com|localhost:11434" -- "*.ts" "*.md" "*.example"
```

Every match falls into one of five groups, and the classification is the point — because a remote
model host is the one place the single-hop allowlist can leak:

| group | what it is | lines |
| --- | --- | --- |
| 1 | the remote model host, code-owned once | `apps/cli/src/provider-config.ts`: `PROVIDER_HOST` (:69), `PROVIDER_ALLOWED_HOSTS` (:77), `DEFAULT_PROVIDER_BASE` (:80), the transport re-check is https-only with `redirect: "error"` (:179, :193). Documented in `.env.example:39` (`MIZAN_LLM_BASE_URL`), `DISCLOSURE.md:74`, `README.md:512` |
| 2 | the loopback model adapter, shipped but orphaned | `packages/mizan-agent/src/providers/ollama.ts`: `DEFAULT_OLLAMA_HOST` (:30), `kind: "live"` (:69), `fetch` that opens the socket (:83). Cli route to it is `resolveProviderWithFallback` (`provider-config.ts:282`), which no caller in this repository invokes (grep verified), and `MIZAN_PROVIDER=ollama` is refused rather than guessed (`apps/cli/test/provider-config.test.ts:111-124`) |
| 3 | the model-host tests and fixtures | `apps/cli/test/provider-config.test.ts:65-84` (refused shapes: plain http, lookalike host, subdomain, embedded credentials) and `packages/mizan-agent/test/provider.test.ts` (endpoint fixtures with `test-key`) |
| 4 | prose that describes group 1 | `packages/mizan-gate/src/docs-egress.ts:16`, and the plan documents under `specs/` (thirty-odd lines repeating the same allowlist statement) |
| 5 | nothing else | a second remote model host appears nowhere in `*.ts`, `*.md` or `*.example` |

## The `.env.example` Ollama claim, and the shipped adapter (open question)

`.env.example:48-53` states, verbatim:

```text
# ── What is deliberately NOT configurable ─────────────────────────────────────
# The corpus location, the attestation file, the run ledger and the transcript
# are all fixed repo-relative paths in apps/cli/src/main.ts. There is no
# MIZAN_CORPUS_DB, no MIZAN_CORPUS_ATTESTATION, no MIZAN_TAFSIR_URL and no local
# inference mode: this build has no tafsir backend and no Ollama adapter, and
# documenting a variable for either would promise a feature that does not exist.
```

That sentence is true of the *configurability* (there is no `MIZAN_OLLAMA` variable to document)
but not of the *code*: `packages/mizan-agent/src/providers/ollama.ts` is shipped and exported
(`packages/mizan-agent/src/index.ts`), and it is a live provider that fetches. Both facts are
recorded here and in `docs/specs/v7-reconciliation.md`'s open questions, because which one is the
intended truth — remove the adapter, or wire it deliberately — is a product decision this sprint
does not make. Nothing in this document resolves it in code; the file states what is there.

## Scripted wins, and proves it without a socket

The selection rule is tested in `apps/cli/test/provider-config.test.ts:126-144`: an *explicit*
`MIZAN_PROVIDER=scripted` wins even with a key set — "a key lying around in the environment is not
consent to make a network call" — and the default keyless/mode-less case yields the transcript too
(:94-109). `apps/cli/test/header-invariant.test.ts` adds the network half: it replaces
`globalThis.fetch` with a guard that rejects, resolves the provider under `MIZAN_PROVIDER=scripted`
with a key set, and asserts the model is `transcript-v1` and the guard was never called. "A replay
opens no socket" is therefore a failing-test-able property, not a description.