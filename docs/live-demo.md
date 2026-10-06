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
body `ok`.

| Endpoint | What it does |
| --- | --- |
| `GET /` | Home page: ask form, verify playground, sample buttons |
| `POST /ask` | Sample questions spawn `bun run demo`; typed questions use the live route when a key is configured, otherwise an honest degradation page |
| `POST /verify` | Builds one claim from the form, resolves its citation against the demo corpus, runs `verifyAnswer`, shows the computed badge with evidence |
| `GET /health` | `200 ok` for the hosting platform's health check |

## What "live" means here

Two different things share the word, and the page keeps them apart:

- **Live verdicts.** Every badge on the site is computed by `mizan-verify` in the server's
  process, against a demo corpus rebuilt from committed, attested anchors. Nothing is cached
  and nothing is asserted.
- **Live model.** The sample questions replay the committed transcript and are labelled
  `PRECOMPUTED (deterministic replay)` on screen. A typed question runs the live model only
  when a key and a corpus are configured on the deployment. Without them the page says
  `model unavailable` and offers the samples. There is no canned answer and no guessed one.

## Deploy

- **Render (primary).** `render.yaml` declares a Docker web service with a `/health`
  check. Point Render at the repository root; the `Dockerfile` installs the workspace and
  starts `bun run demo-server`. The free web service sleeps after inactivity; the first
  request after sleep waits for the container to boot.
- **Netlify (fallback).** `netlify.toml` builds the static exhibit in `apps/web` and
  serves it. The static page cannot compute verdicts; it says so.

`PORT` is honoured when set; otherwise the server listens on `3000`.

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
