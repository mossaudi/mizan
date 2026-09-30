# Demo runbook

**A live, keyed run first. The committed replay second, labelled as a replay.** In that order, for a
reason stated in one line: the only way this project can lose a judge's trust is a replayed answer
that reads like a generation, and a runbook that put the replay first would be the most likely place
that mistake starts.

Both routes end in the same place: the same snapshot, the same verifier, the same computed badges.
What differs is where the *sentences* came from, and the run header says which on every single run.

---

## 1. Live, keyed — the real thing

This is the route that calls a model. It needs a key you supply and a corpus you build once.

```bash
bun install --frozen-lockfile
bun run ingest                 # once: fetch the sources, build the snapshot, write the registry
export MIZAN_LLM_API_KEY=...   # your key; never written to a file, never committed (A02, A07)
export MIZAN_LLM_MODEL=gpt-4o-mini
bun run ask "What does the Qur'an say about the oneness of God?"
```

`MIZAN_PROVIDER` is unset here, which means `hosted` — the mode in which a configured key is used
in preference to any transcript. The header of that run reads:

```
transcript    LIVE
```

If it does not read `LIVE`, it was not a live run, whatever else the output says. That is the whole
point of this step: the label is how you tell, before reading a single claim, whether you are looking
at a generation or a recording. `apps/cli/src/provider-config.ts` is the only file in the repository
that knows a model API's hostname, and it will refuse a base URL outside `PROVIDER_ALLOWED_HOSTS`
rather than silently send your key somewhere you did not name (A10).

The question text is what leaves the machine on this route, and nothing else does: no corpus text, no
ledger, no key beyond the one in the `authorization` header. `DISCLOSURE.md` states the same
condition in prose.

## 2. Replay, labelled — the fallback

The state of a fresh checkout, a provider outage, or a rate limit — any of those, and mizan replays
the committed transcript at `data/transcript.json` and **says so in the header**:

```bash
bun run ask "What does the Qur'an say about the oneness of God?"   # MIZAN_LLM_API_KEY unset
MIZAN_PROVIDER=scripted bun run ask "..."                          # ask for the replay explicitly
```

```
transcript    PRECOMPUTED (deterministic replay)
```

`PRECOMPUTED` is not a warning and it is not a caveat about the badges. The sentences above the
badge are replayed; **the badge below them is computed on this run**, by the verifier, against the
committed corpus, exactly as it is on the live route. The label covers the generation and nothing
else. Both routes, and the reason the label is one shared string rather than two wordings, are in
`docs/specs/adr/ADR-C3.md`.

The fastest way to see a complete run on a clean checkout is `bun run demo`, which rebuilds
a two-record snapshot from the committed anchors in `data/eval/demo-anchors.json` and prints a
computed `VERIFIED` and a computed `REJECTED` from the same pass.

The static page at `apps/web/index.html` is the same idea in a browser: no client script, no remote
resource, and its own header line naming the mode. Its verdicts and their reasons are cross-checked
against `data/demo-questions.json` in `apps/web/test/page.test.ts`.

## 3. When the live call fails

A configured provider that is down, rate-limited, or simply wrong prints:

```
model unavailable
  reason: provider_unavailable
  detail: HTTP 401 Unauthorized
  fallback: unset MIZAN_LLM_API_KEY and run again; the header will read "PRECOMPUTED (deterministic replay)"
```

That is the honest degradation for a *configured* provider, and it is not a partially-answered
report: no claim, no badge, no cached answer. The last line offers the fallback and names the label
it will print, so nobody reaches the replay without having been told that is what they are getting.

A run with no key at all says something different, because the same sentence would be false advice
there — the key is already unset, so there is no live route to leave:

```
model unavailable
  reason: provider_unavailable
  detail: decomposition failed: no transcript entry for the "decompose" call on question hash 90c0cf44d6b05ff1…
  fallback: no key is configured, so there is no live route to switch to; `bun run ask --list-questions` lists what this build can answer
```

A missing corpus prints `no sources found` instead, and a malformed model response yields
`unverifiable` rather than a guess — the seven states in `AGENTS.md` §16 have one correct surface
each.

## 4. Never

- **Never commit a key.** Not in `.env`, not in a command in a commit message, not in a slide. The
  key is read from the environment at the moment the run starts and is captured in a closure for
  that run; no log line, trace or ledger entry carries it or any question text (`AGENTS.md` §13).
- **Never present a replay as a generation.** If a run is keyed, its header says `LIVE`; if it is
  not, it says `PRECOMPUTED (deterministic replay)`. There is no third state, and a
  `transcript` value outside those two is refused at the schema boundary rather than defaulted.
- **Never edit a verdict by hand.** A badge is computed or it is absent. `data/ledger.jsonl` and
  `data/runs.jsonl` are append-only records of runs that happened, and `bun run verify:runs` and
  `bun run verify:ledger` re-derive them from the hashes they carry.

## The one sentence true on both routes

> The quotes above are verbatim spans of records in a committed corpus, and the badge beside each one
> was computed by strict normalised containment in this repository — never asserted, never scored,
> never asked of a model.

Which is also the sentence `bun run ci` exists to keep true: gate **G-1** fails the build if
`packages/mizan-verify` ever grows a dependency beyond `@mizan/core`, and a fourth `GATE_IDS` entry
cannot be added without `docs-gates.ts` agreeing with whatever number the documents state.
