# ADR-04 — Inference is disclosed, never implied

- **Status:** Accepted

## Context

An earlier draft of `DISCLOSURE.md` claimed a local 7-8B path was "implemented and documented as
offline mode". It was not: there is no `llama.cpp`, no Ollama and no offline mode in this
repository. The claim was removed rather than softened, because a judge reading the old document
would have believed a capability they could not find — and once one capability claim is false, the
badge beside it is next.

## Decision

mizan ships exactly **two** provider modes, both disclosed, selected by `MIZAN_PROVIDER`:

- **`hosted`** (default) — a model reached over HTTPS through the `LlmProvider` port. The endpoint
  host must be in the hard-coded allowlist, the scheme must be `https`, and redirects are refused
  rather than followed. The API key is read from the environment, passed to the transport in
  memory, and never written to a trace, a log line or a ledger entry.
- **`scripted`** (set explicitly) — answers come from the committed, deterministic transcript and
  are labelled `PRECOMPUTED` on stdout and `precomputed` in the trace, so a replay can never be
  mistaken for live inference.

If the hosted provider is unreachable or exceeds its timeout, mizan prints **`model unavailable`**.
It never falls back to a canned answer and never silently substitutes a mock.

## Rationale

Disclosure is cheap and re-derivation is not: a reader who has to work out whether an answer was
live will not do it, and will assume the flattering version. Labelling the mode at the point of
display makes the honest reading the effortless one. The refusal on provider failure is the same
principle applied to availability — an honest "unavailable" is a state, a canned answer presented
as a result is a lie with a timestamp on it.

## Consequences

- `DISCLOSURE.md` section 4 is the authority for the mode list; a third mode is a documentation
  change first and a code change second.
- The environment surface stays at exactly four variables, and no key material appears anywhere in
  output, logs, traces or the ledger.
- Live-versus-replay labelling appears in the CLI, the web page and the demo runbook, so no single
  surface can omit it.
- Provider failure degrades to `model unavailable` with a labelled replay as the fallback — never a
  partial answer shown as complete.
