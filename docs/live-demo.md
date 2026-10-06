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

`data/corpus.db` is ~83 MB, gitignored, and reproducible from the pinned URLs and sha256 sums in
`data/registry/sources.json`. A cloud build clones from git, so it has no database to copy — and
before the rebuild step existed, that meant every cloud deployment served the demo anchors while
advertising 27,234 records. The image now builds the corpus itself.

Two independent switches follow. The first needs no key at all, because searching and verifying
are offline: the corpus and its attestation.

### The corpus arrives two ways, and which one runs depends on the build

| Build | What happens | Verified |
| --- | --- | --- |
| Local `docker build` | `.dockerignore` no longer excludes `data/corpus.db`, so the exact attested snapshot is copied in. The rebuild step sees the file and does nothing. | 27,234 records, hash `7b3b66fb…` |
| Cloud build (git clone) | Nothing to copy, so `bun run ingest` fetches the two pinned sources and rebuilds the database. | **Rebuilt from pinned URLs in a clean container and produced the byte-identical hash `7b3b66fbca7fb9df471b49524f31409391addea87f8d0f262d84f7812a48240d`**, which is the attestation's own value — the reproducibility the 2 KB attestation exists to prove |

**Cost:** the cloud path downloads ~42k records and takes roughly **10–15 minutes** on a throttled
connection, so check your platform's build timeout before relying on it. Where that is a problem,
build locally (fast, and it embeds the snapshot) and push the image.

**Opt out** with `--build-arg MIZAN_BUILD_CORPUS=0` for an offline or size-constrained build. That
is a real option with a real cost, and the cost is visible rather than silent: the server then
serves the demo anchors, the home page says "demo anchors only", and **every search result carries a
`NOT THE FULL CORPUS` banner** above the verdict. A four-record answer that says so is preferable
to a 27,234-record claim the deployment cannot honour.

If the rebuild fails, the build fails. Shipping an image whose verify form silently searches four
records is the exact failure mode the step exists to prevent, and an operator who wants the anchors
has an explicit flag rather than an accident.

Two files must therefore reach the image, and both are committed: `attestation.json` (the
authority the snapshot is checked against) and `AGENTS.md` (`requireRepositoryRoot` qualifies a
directory as the workspace only when it holds *both* a workspace `package.json` and `AGENTS.md`;
omitting the second made the rebuild exit 2 with "not a mizan checkout").

**1. Running the built image (no key).** Both build paths above produce an image that already
contains the 27,234-record snapshot, so a plain run needs no mounts at all:

```bash
docker run -d --name mizan-demo -p 3456:3000 mizan-demo
```

That is the deployment that was verified end to end: 27,234 records examined, `quran:6222`
VERIFIED by containment, the one-word fabrication REJECTED at 35/60 shared characters, Arabic
pages rendering with no script tags. Mounting is only needed to substitute a *different* corpus:

```bash
docker run -d --name mizan-demo \
  -p 3456:3000 \
  -v "$(pwd)/data/corpus.db:/app/data/corpus.db:ro" \
  -v "$(pwd)/attestation.json:/app/attestation.json:ro" \
  mizan-demo
```

A mounted corpus is checked against the mounted attestation before a single verdict is served; a
mismatch refuses with no badge rather than showing the wrong one's.

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

### Two permitted hosts, because one key's quota is not a deployment

`MIZAN_LLM_BASE_URL` may name either `api.openai.com` or
`generativelanguage.googleapis.com`; both are in the hardcoded
`PROVIDER_ALLOWED_HOSTS` and both speak OpenAI-compatible `chat/completions`. AI Studio has a
free tier, so a demo does not have to share one account's quota:

```bash
# free tier, no OpenAI account needed — the model default follows the host
MIZAN_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
MIZAN_LLM_API_KEY=<your AI Studio key>
```

Set only `MIZAN_LLM_BASE_URL`. The model defaults to `gemini-2.0-flash` on that host and
`gpt-4o-mini` on OpenAI, because the two do not share a model namespace — sending one host's
model name to the other is a 404 about an unknown model, which reads as a broken deployment
rather than a missing setting. Name `MIZAN_LLM_MODEL` explicitly to override either.

Permitting a second host is not a claim that a free tier is reliable; AI Studio's free quota can
be exhausted too, and that degrades to `model unavailable` in exactly the same way. What it buys
is a second route, not an unlimited one. The egress itself is unchanged and is stated in
`DISCLOSURE.md` §4: in `hosted` mode the question and the retrieved corpus excerpts in the prompt
leave the machine, over HTTPS, on your own key.

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
