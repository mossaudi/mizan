# Live demo (hosted)

The hosted demo is a server-rendered HTML form over the existing CLI. It answers from the
same pipeline a judge runs locally, and it computes every badge in the server's process.
No client JavaScript runs in the visitor's browser.

## Run it locally

```bash
bun install --frozen-lockfile
bun run demo-server
```

Open `http://127.0.0.1:3000`. The health check is `GET /health`, which returns `200` and the
body `ok`. The UI is available in English and Arabic; pick a language with `?lang=en` or
`?lang=ar` (also honoured from a form field, a cookie, or `Accept-Language`).

| Endpoint | What it does |
| --- | --- |
| `GET /` | Home: what this is, the attested corpus, the Ask and Verify tools, and the three badges |
| `GET /method` | The long-form method — the six verifier steps, the fold, grades, degradation, provenance, sources — behind native `<details>` blocks, so there is no client script |
| `POST /ask` | Sample questions spawn `bun run demo`; typed questions use the live route when a key is configured, otherwise an honest degradation page |
| `POST /verify` | Takes ONE text. Searches every collection of the open corpus for the records it might belong to, verifies each candidate with `verifyAnswer`, and shows each record's computed badge beside its own text and source URL |
| `GET /health` | `200 ok` for the hosting platform's health check |

The two pages are split on purpose: the home page exists to be used and the method page exists to
be read. A visitor pasting a quote no longer scrolls past four sections of prose first, and the
prose is one click away rather than deleted.

## The verify form takes one field

`POST /verify` accepts a single `text` field and an optional `collection` scope. That is the
whole input. The reader pastes the quote as they received it; the server decides where to look.

The two halves are deliberately separate, and the ordering is what makes the feature safe:

- **The search only chooses which records to look at.** `@mizan/suggest` ranks by shared 3-gram
  types across every collection and returns real record ids. It cannot name an outcome (ADR-07).
- **Each candidate is then verified on its own merits.** Every row's badge comes from
  `verifyAnswer` — the same six steps, the same budget, the same strict normalised substring
  containment as `bun run ask` — with that candidate's own citation.

So a text that resembles a real hadith without being contained in it is `REJECTED`, which is
the truthful answer and is also the published red-team case. Near-ness is shown only as two
integers in folded characters, labelled display-only; no row is ever presented as a percentage,
and the folded matching key is never rendered (AGENTS.md section 10, gate G-7).

Leave the scope empty to search all six served collections. Name one collection to search
inside it. When a named collection yields nothing the search widens to the whole corpus, and
the page says so beside the results — a widened list is never printed as a scoped one.

## What "live" means here

Two different things share the word, and the page keeps them apart:

- **Live verdicts.** Every badge on the site is computed by `mizan-verify` in the server's
  process. Nothing is cached and nothing is asserted.
- **Live corpus.** The server opens `data/corpus.db` and checks it against `attestation.json`
  before serving anything, so the record count on the page is the count of the corpus actually
  open — 27,234 records across six collections when the snapshot is present. On a checkout
  without the snapshot it builds the small anchor corpus from `data/eval/demo-anchors.json`
  instead and labels itself as such. A corpus that is present but whose attestation disagrees
  is refused with no verdict at all, never silently swapped for the other one.
- **Live model.** The sample questions replay the committed transcript and are labelled
  `PRECOMPUTED (deterministic replay)` on screen. A typed question runs the live model only
  when a key and a corpus are configured on the deployment. Without them the page says
  `model unavailable` and offers the samples. There is no canned answer and no guessed one.

## Deploy

- **SnapDeploy (interactive demo, no credit card).** Free tier: Docker builds from the
  repository's `Dockerfile`, four containers, 100 hours a month; containers sleep after
  about 15 minutes without traffic and wake in roughly a minute on the next browser
  request. Sign up with an email or a GitHub account — no payment method. Connect the
  public repository and let it build the root `Dockerfile`. The image runs
  `bun run demo-server` with the scripted (replay) provider, so the sample questions and the
  verify form compute every badge in the container without a key, against the anchor corpus.
  Mounting the snapshot (below) turns the verify form into a search over all 27,234 records.
  Typed questions without a key degrade honestly to `model unavailable`.
- **Render (needs a payment method).** `render.yaml` still declares the same Docker web
  service with a `/health` check, but Render's free web services now require a card on
  the account, so this path is documented rather than used.
- **GitHub Pages (static exhibit).** `.github/workflows/pages.yml` installs with a frozen
  lockfile, runs `bun run build:web`, and deploys `apps/web` as the Pages artifact. In
  the repository settings, set Pages source to GitHub Actions. The served bytes are a
  fresh render of the committed fixture at deploy time, not a hand-edited file.
- **Cloudflare Pages (static exhibit).** Create a Pages project from the repository.
  Build command: `bun install --frozen-lockfile && bun run build:web`. Output
  directory: `apps/web`. Root: `/`. Same honest limits as the Netlify build.
- **Netlify (fallback).** `netlify.toml` builds the static exhibit in `apps/web` and
  serves it. The static page cannot compute verdicts; it says so.

`PORT` is honoured when set; otherwise the server listens on `3000`.

## Docker: the real corpus, and the live model route

Two independent switches. The first needs no key at all, because searching and verifying are
offline: the corpus and its attestation.

**1. The full snapshot (no key).** The image is built with `ENV MIZAN_PROVIDER=scripted` and
without `data/corpus.db`, so out of the box it searches the anchor corpus. Mounting the two
files below makes the verify form search all 27,234 records instead:

```bash
docker run -d --name mizan-demo \
  -p 3456:3000 \
  -v "$(pwd)/data/corpus.db:/app/data/corpus.db:ro" \
  -v "$(pwd)/attestation.json:/app/attestation.json:ro" \
  mizan-demo
```

`data/corpus.db` is gitignored — it is reproducible from the pinned URLs in `attestation.json`
via `bun run ingest` — so it must be mounted rather than baked in. This is the exact
combination that was verified: 27,234 records, hash
`7b3b66fbca7fb9df471b49524f31409391addea87f8d0f262d84f7812a48240d`, Arabic page rendering with
no script tags.

**2. The live model route (needs your key).** A `.env` file on the host is **not** visible
inside the container, so it has to be mounted, and the image sets `MIZAN_PROVIDER=scripted`,
which wins over anything in it. Both therefore need overriding:

```bash
docker run -d --name mizan-live \
  -p 3456:3000 \
  -e MIZAN_PROVIDER=hosted \
  -v "$(pwd)/.env:/app/.env:ro" \
  -v "$(pwd)/data/corpus.db:/app/data/corpus.db:ro" \
  -v "$(pwd)/attestation.json:/app/attestation.json:ro" \
  mizan-demo
```

Mounting `.env` read-only keeps the key in the one gitignored file you already maintain, so it
never appears in a command line, a shell history, or an image layer. `bun run` loads it from the
working directory, and `-e MIZAN_PROVIDER=hosted` overrides the image's `ENV` because a real
process environment variable wins over a dotenv entry.

To hand the key over on the command line instead — useful on a host with no `.env` — use
`-e MIZAN_LLM_API_KEY="your-key"` in place of the `.env` mount. Either way no key material reaches
a log line, a trace or a ledger entry (AGENTS.md section 13).

Check it took with `docker logs mizan-live`: the startup line reads
`live ask      configured`. If it still reads `not configured`, the provider is `scripted` or the
key did not arrive; the home page's status panel names which piece is missing.

Without those overrides the home page lists exactly which pieces are missing
(`MIZAN_LLM_API_KEY`, `data/corpus.db`, `attestation.json`, or `MIZAN_PROVIDER=scripted`)
and typed questions degrade honestly to `model unavailable`. Locally, `bun run demo-server`
reads `.env` automatically from the repository root and already finds `data/corpus.db`, so the
verify form searches the full snapshot with no flags at all.

A live run can still fail for reasons that are not configuration — a rate-limited or
out-of-quota key returns HTTP 429 from the provider. That surfaces as `model unavailable` with
the provider's own status in the detail line, which is the honest surface for it, and it clears
on its own rather than being worked around.

## What this deployment does not do

- It writes nothing to the run ledger. A hosted demo that appended to `data/runs.jsonl`
  would dirty the committed hash chain and make `bun run verify:runs` depend on visitor
  traffic.
- It logs no question text. A trace a reader can trust carries hashes, not content.
- It has no route to a verdict the verifier did not compute. Degradation states are
  `model unavailable`, `no sources found`, `unverifiable`, and `rejected` — never a
  fabricated confirmation.

For the offline command a judge can run from the repository itself, see
`docs/demo-runbook.md`.
