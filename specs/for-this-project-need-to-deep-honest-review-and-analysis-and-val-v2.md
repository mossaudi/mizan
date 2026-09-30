# Spec: for-this-project-need-to-deep-honest-review-and-analysis-and-val

**Request:** for this project need to deep honest review and analysis and validate its real value as I received a feedback that the project value is not strong and seems useless as it can be achieved by any search tool 
also the below gaps  aLoad-bearing weaknesses you must handle :
No Bukhari / Muslim. The two most-cited collections are absent. A judge will ask. Keep it on slide 7, and either add a licenced source or frame scope as "4 Sunan + Muwatta + Qur'an, 27,234 records".
No UI. Requirement: "منتج متكامل قابل للتشغيل". CLI qualifies but loses to interactive demos. Add a minimal web page that renders the three badge lines as text nodes (no innerHTML — rule §11) before submission.
Default = replay, not live AI. bun run ask without a key prints PRECOMPUTED. Judges may read this as "not real". Demo with a key set, and label clearly.
Paraphrase divergence is open. Spec wants paraphrase → UNVERIFIABLE; code gives REJECTED (26 cases, docs/anchor-protocol.md). Decide + mechanise the locator or you will be scored on inconsistency.
Golden 100% is vs. itself, not vs. human labels — don't overclaim it orally.
No tafsir, no multilingual 

so deep honest verify then need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
# PM Phase — Specification Refined into User Stories (mizan Value Validation)

All stories are delivered **inline below** (per task instruction 7). Wiki deferral is not used as the source of truth; this response is the complete artefact for the SE phase.

---

## 1. Story Overview (RICE)

| # | Story | Epic | MoSCoW | Sprint | Size | Risk | Reach | Impact | Conf. | Effort | **RICE** |
|---|-------|------|--------|--------|------|------|-------|--------|-------|--------|-----------|
| 1 | Commit working tree + clean-HEAD CI green | E4 | Must | 1 | S | Critical | 9 | 3 | 100% | 1 | **27.0** |
| 2 | Mechanise paraphrase/elision → `UNVERIFIABLE` + 26-case regression + docs sweep | E2 | Must | 1 | M | High | 7 | 3 | 80% | 3 | **5.6** |
| 3 | Static text-node web page from shared verdict map (G-2 safe) | E3 | Must | 1 | M | Medium | 8 | 2 | 80% | 3 | **4.3** |
| 4 | Live-vs-replay (`PRECOMPUTED`) labelling in CLI + page + demo runbook | E3 | Must | 1 | S | Medium | 8 | 1 | 80% | 1 | **6.4** |
| 5 | Corpus-scope honesty sweep (slide 7, README, docs-claims) | E5 | Must | 1 | S | Medium | 6 | 2 | 100% | 1 | **12.0** |
| 6 | Value-proof pack: executed system-arm + one-sentence claim + comparison table | E1 | Must | 1 | M | High | 9 | 3 | 80% | 3 | **7.2** |
| 7 | Write ADR-C1..C5 files resolving dangling citations | E4 | Must | 1 | S | Low | 5 | 1 | 100% | 0.5 | **10.0** |
| 8 | External credibility arm (IslamicEval/HUMAIN norms or third-party run) | E1 | Should | 2 | M | Medium | 5 | 2 | 50% | 3 | **1.7** |
| 9 | Licensed Bukhari/Muslim ingestion with licence gate (fallback: honest framing) | E5 | Should | 2 | L | High | 6 | 2 | 50% | 6 | **1.0** |
| 10 | Golden-100% qualifier sweep + oral one-pager | E4 | Should | 2 | S | Low | 6 | 1 | 100% | 0.5 | **12.0** |

Stories 8–10 are ordered by RICE within Sprint 2 (10 → 8 → 9), but Story 9 blocks on Story 5 and Story 8/10 block on Story 6, so execution order inside Sprint 2 is: **10 → 8 → 9** (or 8 → 10 → 9).

---

## 2. Dependency Graph

```
Story 1 (commit + clean CI)  ── BLOCKS ──> Stories 2, 3, 5, 6, 7
Story 3 (static page)        ── BLOCKS ──> Story 4 (UI half of labelling)
Story 1 + Story 3            ── BLOCKS ──> Story 4 (CLI half needs Story 1)
Story 6 (value-proof pack)   ── BLOCKS ──> Stories 8, 10
Story 5 (corpus honesty)     ── BLOCKS ──> Story 9 (ingestion must start from honest baseline)
```

Text adjacency list:

- `1 → 2` (paraphrase code change must land on committed HEAD so regression is judge-runnable)
- `1 → 3` (page is new files; must not be another untracked surprise)
- `1,3 → 4` (page half of labelling renders on Story 3's page)
- `1 → 5`, `1 → 6`, `1 → 7`
- `6 → 8`, `6 → 10` (external arm and qualifier sweep both extend the proof pack)
- `5 → 9` (ingestion only after the honest-framing baseline is consistent everywhere)

Shared dependencies: `bun run ci` + gates G-1…G-7 (all stories), `render.ts` verdict map (3, 4), `scripts/check-docs-claims.ts` (5, 6, 10), `data/eval/adjudication.json` (2), `scripts/benchmark/system-arm.ts` (6, 8).
External dependencies: UmmahAPI/Sunnah.com licence (9), provider host allowlist (4), IslamicEval/HUMAIN publications (8).

---

## Sprint 1: Must-Have Gap Closure (Stories 1–7)

---

### Story 1: Commit the entire working tree and prove clean-HEAD CI green

**RICE: 27.0** · Priority: Must · Size: S · Risk: Critical · Epic: E4 · Deps: none

**INVEST checklist**
- **Independent:** Yes — no other story can start until this lands; it needs nothing.
- **Negotiable:** Commit granularity/message wording open; the invariant (clean tree, CI green) is not.
- **Valuable:** A judge who clones HEAD finally receives the system we claim (risk R1, #1 credibility risk).
- **Estimable:** S — a commit plus one CI run.
- **Small:** Single sprint, no feature work.
- **Testable:** `git status` empty; `bun run ci` exits 0 under 5 min on ubuntu + windows.

**Description:** Stage and commit all 57 changed + 38 tracked-intended files (including `scripts/benchmark/system-arm.ts` and the executed system-arm artefact), confirm ignore rules keep `data/corpus.db` and `.env*` out, then prove `bun run ci` green on a fresh clone of HEAD.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Working tree fully committed
  Given the repository has 57 modified and 38 untracked files including the executed system-arm artefact
  When every intended artefact is staged and committed
  Then `git status` reports a clean tree
  And HEAD contains the executed system-arm output with systemArmSource "executed-verifier"

Scenario: Clean-HEAD CI is green and bounded
  Given a fresh clone of the committed HEAD on ubuntu and on windows
  When `bun run ci` runs
  Then it exits 0
  And it completes in under 5 minutes
  And gates G-1…G-7 plus docs-claims all report pass

Scenario: CI failure names the failing package (negative)
  Given a planted failure in one package
  When `bun run ci` runs
  Then the command exits non-zero
  And the output names the failing package
  And no gate reports pass for that package

Scenario: Ignored artefacts stay ignored (negative)
  Given data/corpus.db and .env* exist locally
  When the commit is created
  Then neither file is present in the commit
  And G-4 gitleaks reports zero findings on tree and history
```

**Edge cases:** untracked files that must *stay* untracked (gitignored DB, `.env`); accidental commit of a secret inside a new file; large binary artefacts bloating the repo; CRLF/LF divergence breaking the windows matrix; partial commit that leaves stale system-arm numbers on HEAD (exactly the R1 failure); `bun.lock` drift making CI nondeterministic.

**Security:** no API keys or `.env` contents enter history (A05/A07); `.env*` remains gitignored; gitleaks green on tree + history before handoff.

**Performance:** full CI ≤ 5 minutes (p95, ubuntu and windows matrix); 15-minute job timeout respected.

**Reliability:** CI must be deterministic — a flaky gate is a defect, not noise; a gate that cannot fail is not a gate (planted-violation self-tests must still run); failure mode = non-zero exit with package name, never a silent pass.

**Task definition**
```json
{
  "goal": "Make HEAD equal the claimed system and prove it with a green clean-tree CI run",
  "deliverables": [
    {"name": "git commit(s) containing all intended working-tree changes", "format": "commit"},
    {"name": "CI run record on clean HEAD (ubuntu + windows)", "format": "log"},
    {"name": "confirmation .env* and data/corpus.db excluded", "format": "checklist"}
  ],
  "successCriteria": [
    {"text": "git status is clean after commit", "verificationKind": "command_exit_0", "verificationSpec": "git status --porcelain"},
    {"text": "bun run ci exits 0 on clean HEAD", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"},
    {"text": "CI completes under 5 minutes", "verificationKind": "command_exit_0", "verificationSpec": "timing around bun run ci < 300000ms"},
    {"text": "gitleaks finds no secrets in tree and history", "verificationKind": "command_exit_0", "verificationSpec": "gitleaks detect --history"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 2: Mechanise paraphrase/elision → `UNVERIFIABLE` with 26-case regression and docs sweep

**RICE: 5.6** · Priority: Must · Size: M · Risk: High · Epic: E2 · Deps: **1**

**INVEST checklist**
- **Independent:** Yes within Sprint 1 once HEAD is committed (dep is hygiene, not logic).
- **Negotiable:** Where exactly the anchor step sits and reason-string wording are open to SE judgement; the verdict value is not.
- **Valuable:** Closes risk R2 — code, spec, README and 26 human rulings currently disagree, which a judge can score as inconsistency.
- **Estimable:** M — one insertion in `verify.ts`, one regression suite, one docs sweep.
- **Small:** Single bounded behaviour change plus tests; no new package.
- **Testable:** 26/26 adjudicated cases; verdict-map test covers all three badge strings.

**Description:** Align code to ADR-C1: a resolved anchor id whose record lacks the quote must return `unverifiable` with reason `no_matching_evidence`, mechanised at the anchor step between step 5b and step 6. Remove divergence language from README and `docs/anchor-protocol.md`.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Elided paraphrase resolves to UNVERIFIABLE
  Given an answer whose citation id resolves but whose record does not contain the quoted span (an elision)
  When verification runs
  Then the verdict is "unverifiable" with reason "no_matching_evidence"
  And the verdict is never "verified" and never "rejected" for this case

Scenario: All 26 adjudicated elision cases match
  Given data/eval/adjudication.json with 26 elision rulings of "unverifiable"
  When the regression suite runs
  Then 26 of 26 cases match the code behaviour
  And the suite fails if any case diverges

Scenario: True disproof still REJECTED (negative)
  Given a resolved record that contains the quote region but the quote contradicts the record
  When verification runs
  Then the verdict remains "rejected"
  And the elision branch does not capture it

Scenario: Zero evidence still fails closed (negative)
  Given no resolvable citation at all
  When verification runs
  Then the verdict is "unverifiable"
  And no path returns "verified"
  And no throw crosses the package boundary

Scenario: Docs no longer publish a divergence
  Given README and docs/anchor-protocol.md
  When the docs sweep completes
  Then no file states that code returns REJECTED for elision while rulings say UNVERIFIABLE
  And check:docs passes
```

**Edge cases:** empty or whitespace-only span; Unicode/normalization variants of the quote; multiple anchors where only one is elided (per-claim verdicts, not per-answer); anchor `located: false` vs `located: true` with missing quote; duplicated quotes across collections; 60-char-plus elisions; malformed anchor payload decoded through the schema seam (`Result`, never `throw`); an unknown verdict string must remain a compile error, not a silent `UNVERIFIABLE`.

**Security:** fail-closed preserved — malicious or model-invented corpus text can never steer an elision into `verified` (CWE-345); `mizan-verify` still declares exactly one dependency (`@mizan/core`) — gate G-1 enforced; no fuzzy/percentage threshold introduced (ADR-03).

**Performance:** verification stays deterministic and offline; no measurable runtime regression (target: suite adds < 10 s to package CI); zero network calls in the verify path.

**Reliability:** malformed model/anchor output → `unverifiable`, never a crash; verification never retries into a different verdict; failure surfaces as `Result` error, honest degradation per §16.

**Task definition**
```json
{
  "goal": "Make elision/paraphrase return unverifiable per ADR-C1 and prove it against the 26 human rulings",
  "deliverables": [
    {"name": "packages/mizan-verify/src/verify.ts", "format": "TypeScript (anchor-step verdict branch)"},
    {"name": "packages/mizan-verify test file for the 26 adjudicated elision cases", "format": "test suite"},
    {"name": "docs/anchor-protocol.md + README divergence sweep", "format": "documentation"}
  ],
  "successCriteria": [
    {"text": "26/26 elision cases return unverifiable/no_matching_evidence", "verificationKind": "test_passes", "verificationSpec": "bun test (mizan-verify package dir)"},
    {"text": "verify.ts contains no rejected-on-elision path", "verificationKind": "contains_text", "verificationSpec": "grep verify.ts for no_matching_evidence"},
    {"text": "mizan-verify still has exactly one dependency", "verificationKind": "contains_text", "verificationSpec": "gate G-1 via bun run ci"},
    {"text": "No divergence language remains in README or anchor-protocol", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 3: Static text-node web page rendering the three badge lines from the shared verdict map

**RICE: 4.3** · Priority: Must · Size: M · Risk: Medium (security-adjacent) · Epic: E3 · Deps: **1**

**INVEST checklist**
- **Independent:** Yes — depends only on committed HEAD, not on Stories 2/4/5.
- **Negotiable:** Page location (`apps/web/` vs static route), markup structure, styling open; text-node-only rendering and shared-map reuse are fixed by ADR-C3.
- **Valuable:** Satisfies "منتج متكامل قابل للتشغيل" (runnable integrated product) — closes risk R3.
- **Estimable:** M — one static page, no bundler, no framework.
- **Small:** Single page, no backend, no interactivity beyond display.
- **Testable:** G-2 green, badge strings match `render.ts` map byte-for-byte, loads offline.

**Description:** Add one framework-free static page that renders `VERIFIED` / `UNVERIFIABLE` / `REJECTED` as DOM **text nodes** drawn from the same verdict map as `apps/cli/src/render.ts`, with no bundler and no UI framework (ADR-C3).

**Acceptance criteria (Given/When/Then)**

```
Scenario: Page renders the three badge lines from the shared map
  Given the shared verdict map in apps/cli/src/render.ts
  When the static page is opened
  Then all three badge lines appear
  And each string is identical to the map's value
  And every value is inserted as a DOM text node, not HTML

Scenario: Page loads offline
  Given no network connectivity
  When the page is opened in a browser
  Then it renders completely
  And zero network requests are made

Scenario: Corpus/model text cannot inject markup (security, negative)
  Given retrieved corpus text containing "<script>alert(1)</script>" and an onerror payload
  When the text is rendered on the page
  Then it appears literally as text
  And no script executes
  And gates G-2 passes with its planted-violation self-test intact

Scenario: Unknown verdict fails at compile time (negative)
  Given a verdict value outside the three known strings
  When the build runs
  Then tsc --noEmit fails
  And the page never renders a silent fallback badge
```

**Edge cases:** empty verdict list; extremely long corpus quotes (wrap/truncation without HTML); RTL Arabic text direction; unescaped quotes and `<`, `>`, `&` in corpus text; page opened from `file://` vs local server; missing JS runtime (page must still show text); any printed number must enter the docs-claims gate.

**Security:** OWASP A03 — zero `innerHTML` / `dangerouslySetInnerHTML` / `{@html` / `document.write` anywhere in the new files; G-2 scans the whole tree including the new page; no framework sinks introduced (ADR-C3); no secrets or `.env` references in page assets (A05/A07); hash-only data in any trace shown (A09).

**Performance:** static page, no bundler; first render < 1 s offline; zero third-party assets; adds < 5 s to CI (docs-claims + G-2 scan only).

**Reliability:** missing data degrades to an honest empty/unavailable state per §16 — never a fabricated badge; page failure must not affect the CLI (CLI is primary); browser with JS disabled still shows badge text if feasible, otherwise honest "unavailable" note.

**Task definition**
```json
{
  "goal": "Ship a runnable static product surface that proves the badge is computed, G-2 safe",
  "deliverables": [
    {"name": "static web page (apps/web/ or equivalent static route)", "format": "HTML/TS rendered as text nodes"},
    {"name": "shared verdict-map import/reuse of apps/cli/src/render.ts mapping", "format": "module reference"},
    {"name": "test asserting badge strings match the shared map", "format": "test suite"}
  ],
  "successCriteria": [
    {"text": "Page exists and renders three badge lines", "verificationKind": "file_exists", "verificationSpec": "path to the new page file"},
    {"text": "Zero raw-HTML sinks in new files", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci (gate G-2)"},
    {"text": "Badge strings equal render.ts map values", "verificationKind": "test_passes", "verificationSpec": "bun test (package dir containing page tests)"},
    {"text": "No network calls required to load page", "verificationKind": "contains_text", "verificationSpec": "grep new page for http(s):// fetch/XHR usage"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 4: Live-vs-replay (`PRECOMPUTED`) labelling in CLI, page and demo runbook

**RICE: 6.4** · Priority: Must · Size: S · Risk: Medium · Epic: E3 · Deps: **1, 3**

**INVEST checklist**
- **Independent:** Yes (within Sprint 1) — CLI half depends on Story 1, page half on Story 3.
- **Negotiable:** Exact label wording and placement open; presence and unambiguity are not.
- **Valuable:** Kills risk R10 ("PRECOMPUTED read as not real") — the #1 demo misread.
- **Estimable:** S — label plumbing in known files + one runbook page.
- **Small:** No behaviour change to the pipeline; display and documentation only.
- **Testable:** Label present in CLI output, page, runbook; keyed demo path documented first.

**Description:** Ensure every surface states whether output is live or replay: keyless `hosted` mode prints `PRECOMPUTED` in CLI and on the page; `.env.example`, `DISCLOSURE.md` §4 and a demo runbook describe the keyed live path first with labelled replay as fallback.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Keyless run is labelled PRECOMPUTED
  Given no MIZAN_LLM_API_KEY is set
  When the user runs the CLI ask/demo command
  Then the output is explicitly labelled PRECOMPUTED
  And no canned output is presented as live

Scenario: Keyed run is labelled live
  Given a valid key and an allowlisted provider host
  When the CLI runs against the live path
  Then the output is labelled as live
  And the label appears on the page too when that result is rendered

Scenario: Provider failure degrades honestly (negative)
  Given a keyed run where the provider times out at 30 seconds
  When the run completes
  Then the surface shows "model unavailable"
  And the labelled PRECOMPUTED replay fallback is offered
  And nothing canned is shown as live (§16)

Scenario: Runbook orders live-first
  Given the demo runbook
  When an operator follows it with a key set
  Then step 1 is the live keyed path
  And replay is documented as the labelled fallback
```

**Edge cases:** key present but invalid/wrong model → honest failure label, not silent replay; key present but base URL outside allowlist → refused (A10); partially downloaded transcript → labelled incomplete, never shown as complete; env var typo (exactly 4 vars documented in `.env.example`); transcript file missing → replay unavailable, stated plainly; label must never echo the key or base URL credentials.

**Security:** no key material in CLI output, page, runbook, traces or ledger (A09/§13); env surface remains exactly 4 variables; provider host allowlist stays in code — https, no redirects (A10); G-4 gitleaks covers any new runbook copy.

**Performance:** labelling adds no measurable latency (< 10 ms display-only); provider timeout stays at 30 s.

**Reliability:** replay path must be byte-deterministic; live path failure never corrupts a stored verdict; a failure to label is itself a failure — if the mode cannot be determined, the surface must not claim live.

**Task definition**
```json
{
  "goal": "Make live-vs-replay mode unmistakable on every surface",
  "deliverables": [
    {"name": "apps/cli/src/main.ts + demo.ts + provider-config.ts label output", "format": "TypeScript"},
    {"name": "page-side PRECOMPUTED/live label", "format": "static page update"},
    {"name": "demo runbook (live-first, replay-fallback)", "format": "documentation"},
    {"name": ".env.example / DISCLOSURE.md §4 cross-check", "format": "documentation"}
  ],
  "successCriteria": [
    {"text": "Keyless CLI output contains PRECOMPUTED", "verificationKind": "contains_text", "verificationSpec": "bun run ask with no key, grep output for PRECOMPUTED"},
    {"text": "Page shows provider-mode label", "verificationKind": "contains_text", "verificationSpec": "grep page source for label string"},
    {"text": "Runbook documents live path before replay", "verificationKind": "contains_text", "verificationSpec": "read demo runbook"},
    {"text": "No key appears in any labelled output", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci (G-4 + docs gates)"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 5: Corpus-scope honesty sweep across slide 7, README and docs-claims

**RICE: 12.0** · Priority: Must · Size: S · Risk: Medium · Epic: E5 · Deps: **1**

**INVEST checklist**
- **Independent:** Yes — documentation-only, needs only committed HEAD.
- **Negotiable:** Exact phrasing of the framing sentence open; the numbers (27,234 and its composition) are not.
- **Valuable:** Prevents a judge finding a false Bukhari/Muslim claim (ADR-C4); closes gap 6 partially.
- **Estimable:** S — sweep + gate check.
- **Small:** Copy edits plus one gate run.
- **Testable:** `check:docs` finds no contradicting corpus claim.

**Description:** Make every public surface state the arithmetically verified truth: "4 Sunan + Muwatta + Qur'an, 27,234 records" (quran 6236 + nasai 5672 + abudawud 5272 + ibnmajah 4336 + tirmidhi 3889 + malik 1829). Correct slide 7; never claim Bukhari/Muslim unless ingested and attested.

**Acceptance criteria (Given/When/Then)**

```
Scenario: All surfaces carry the honest framing
  Given slide 7 (make_deck.py / make_deck_ar.py), README, and docs
  When the sweep completes
  Then each states "4 Sunan + Muwatta + Qur'an, 27,234 records"
  And the counts sum to 27,234 from data/registry

Scenario: Contradicting claim fails the docs gate (negative)
  Given any doc claiming Bukhari or Muslim coverage
  When bun run check:docs runs
  Then the gate exits non-zero
  And names the offending file

Scenario: Counts stay machine-verified
  Given data/registry/records.jsonl
  When the corpus is regrouped by collection
  Then per-collection counts equal the published numbers
```

**Edge cases:** Arabic deck carrying a different claim than the English deck; a number printed in a slide image not covered by text gates (flag for manual review); future Story 9 ingestion changing counts — the sweep must not hard-code a claim that Story 9 invalidates; `sources.json` enable/disable drift; commas vs no-commas in "27,234".

**Security:** integrity protection — the docs-claims gate prevents fabricated/unbacked numbers (the reputational asset is credibility); no secrets in deck scripts (A05).

**Performance:** `check:docs` runs within the < 5 min CI budget (< 10 s).

**Reliability:** gate failure is fail-closed (build breaks) rather than warn-and-proceed; if the registry is unreadable, the gate must not silently pass.

**Task definition**
```json
{
  "goal": "Make corpus-scope claims uniform, arithmetic-backed and gate-enforced",
  "deliverables": [
    {"name": "submission/make_deck.py and make_deck_ar.py slide 7 copy", "format": "documentation/deck source"},
    {"name": "README corpus-scope section", "format": "documentation"},
    {"name": "docs-claims coverage for the framing sentence", "format": "gate rule"}
  ],
  "successCriteria": [
    {"text": "bun run check:docs passes with no contradicting corpus claim", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"},
    {"text": "Published counts equal registry grouping", "verificationKind": "test_passes", "verificationSpec": "registry count assertion test"},
    {"text": "No surface claims Bukhari or Muslim", "verificationKind": "command_exit_0", "verificationSpec": "grep -ri bukhari README.md docs/ submission/ (expect only explicit 'not included' statements)"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 6: Value-proof pack — executed system-arm, one-sentence claim, red-team set, ledger, comparison table

**RICE: 7.2** · Priority: Must · Size: M · Risk: High · Epic: E1 · Deps: **1**

**INVEST checklist**
- **Independent:** Yes — depends only on committed HEAD (Story 1) so numbers come from artefacts on HEAD.
- **Negotiable:** Wording of the one-sentence claim and table layout open; every number must be artefact-backed.
- **Valuable:** This *is* the response to "value is weak, any search tool can do this" — the headline deliverable of the spec.
- **Estimable:** M — benchmark re-run, artefact commit, copy, gate alignment.
- **Small:** No new product behaviour; evidence assembly only.
- **Testable:** docs-claims green for every printed number; `systemArmSource: "executed-verifier"` present in committed artefact.

**Description:** Assemble the pack: (a) one-sentence negative-space claim — "search attaches citations; mizan adjudicates them, fail-closed, with a hash-chained receipt"; (b) committed executed system-arm benchmark artefact (`scripts/benchmark/system-arm.ts` → `systemArmSource: "executed-verifier"`); (c) red-team fabricated set results; (d) hash-chained ledger demonstration; (e) competitor comparison table (Ansari, Fanar-Sadiq, UmmahAPI, Perplexity/Elicit) sourced from the market research.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Headline number is backed by a committed executed artefact
  Given the executed system-arm run
  When its output is committed to HEAD
  Then the artefact records systemArmSource "executed-verifier"
  And every number printed in the pack is traceable to that artefact
  And check:docs passes

Scenario: One-sentence claim is judge-legible in 60 seconds
  Given the value-proof pack
  When a judge reads the first claim
  Then it states the negative space (computed fail-closed per-claim verdict) in one sentence
  And it makes no answer-quality or retrieval-quality claim (ADR-C2)

Scenario: Unbacked number fails the gate (negative)
  Given a number added to the pack without a committed artefact
  When check:docs runs
  Then the gate exits non-zero and names the claim

Scenario: Ledger demonstration is hash-chained and content-free
  Given the ledger excerpt shown in the pack
  When inspected
  Then entries carry questionHash and verdict only
  And no question text, corpus text, PII or key appears (§13/A09)
```

**Edge cases:** label-derived tautology at `score.ts:99` resurfacing (must be replaced by the executed arm); benchmark run performed on a dirty tree (forbidden — Story 1 first); red-team set empty or reduced; comparison numbers cited without a source; a number that changes between runs (determinism: score must be reproducible); partial artefact committed without its inputs.

**Security:** hash-only ledger/trace content (A09); no secrets in benchmark scripts or artefacts (A05/A07); comparison table cites public research only — no scraped proprietary data; gitleaks green.

**Performance:** system-arm benchmark completes within the CI/reproducibility budget and is deterministic run-to-run; pack adds < 30 s to `check:docs`.

**Reliability:** if the benchmark cannot execute, the pack must not print a stale number — degrade to "not run" rather than an old figure (fail closed); artefact mismatch with the printed claim aborts the docs gate (attestation-style abort).

**Task definition**
```json
{
  "goal": "Prove (not assert) the negative-space claim with committed, gate-checked evidence",
  "deliverables": [
    {"name": "committed executed system-arm artefact", "format": "JSON (data/benchmark)"},
    {"name": "value-proof pack document (one-sentence claim + comparison table)", "format": "documentation"},
    {"name": "red-team set result summary", "format": "JSON/document"},
    {"name": "hash-chained ledger excerpt (hashes only)", "format": "documentation"}
  ],
  "successCriteria": [
    {"text": "Artefact records systemArmSource executed-verifier on HEAD", "verificationKind": "contains_text", "verificationSpec": "grep committed benchmark artefact for executed-verifier"},
    {"text": "All printed numbers pass docs-claims", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"},
    {"text": "No answer-quality claim appears in the pack", "verificationKind": "command_exit_0", "verificationSpec": "grep pack for forbidden fluency/retrieval claims"},
    {"text": "Ledger excerpt contains hashes only", "verificationKind": "contains_text", "verificationSpec": "grep excerpt for questionHash with no raw question text"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 7: Write ADR-C1..C5 files resolving the ~30 dangling ADR citations

**RICE: 10.0** · Priority: Must · Size: S · Risk: Low · Epic: E4 · Deps: **1**

**INVEST checklist**
- **Independent:** Yes — documentation only.
- **Negotiable:** File naming/layout within `docs/specs/adr/` open; IDs and Accepted status are fixed by the spec.
- **Valuable:** Removes an easy docs-credibility dismissal (R15): ~30 citations to non-existent files.
- **Estimable:** S — five short ADR documents whose content is already decided.
- **Small:** No code.
- **Testable:** every cited ADR ID resolves to a file.

**Description:** Materialise ADR-C1…ADR-C5 (content as recorded in the CEO spec §7) under `docs/specs/adr/`, and wire an ID-resolution check so future citations cannot dangle.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Every cited ADR ID resolves
  Given ~30 source sites citing ADR-0x / ADR-Cx
  When the docs check runs
  Then each cited ID maps to a file in docs/specs/adr/
  And ADR-C1..C5 exist with status Accepted

Scenario: Dangling citation fails the gate (negative)
  Given a document citing ADR-C99 that does not exist
  When check:docs runs
  Then the command exits non-zero and names the citation

Scenario: ADR content matches recorded decisions
  Given ADR-C1..C5 in the source specification
  When each file is read
  Then context/decision/consequences/status fields are present
  And ADR-C1 states elision verdict = UNVERIFIABLE
```

**Edge cases:** legacy `ADR-03` style citations (different ID namespace from `ADR-C*`) — must also resolve or be explicitly mapped; duplicate ADR IDs; ADR written but status left draft; case-sensitivity of IDs on the windows CI matrix.

**Security:** no secrets or key material inside ADR prose (gitleaks); ADRs must not claim capabilities that do not exist on HEAD (docs-claims integrity).

**Performance:** resolution check < 5 s inside `check:docs`.

**Reliability:** fail-closed — a missing ADR breaks docs CI rather than being skipped with a warning.

**Task definition**
```json
{
  "goal": "Make every ADR citation resolvable and record ADR-C1..C5 as Accepted",
  "deliverables": [
    {"name": "docs/specs/adr/ADR-C1.md … ADR-C5.md", "format": "documentation"},
    {"name": "ADR ID resolution check", "format": "gate/script"}
  ],
  "successCriteria": [
    {"text": "Five ADR files exist", "verificationKind": "file_exists", "verificationSpec": "docs/specs/adr/ directory listing"},
    {"text": "check:docs passes with zero dangling ADR citations", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"},
    {"text": "Planted dangling citation fails the gate", "verificationKind": "command_exit_0", "verificationSpec": "gate self-test with fake ADR-C99 reference"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

## Sprint 2: Should-Have Credibility Extensions (Stories 8–10)

*Planned only after Sprint 1 delivery is verified (clean-HEAD CI green, 26/26 regression, page renders).*

---

### Story 8: External credibility arm — cited IslamicEval/HUMAIN norms or a third-party run through our verifier

**RICE: 1.7** (execute as 8 after 10 or before) · Priority: Should · Size: M · Risk: Medium · Epic: E1 · Deps: **6**

**INVEST checklist**
- **Independent:** Yes once the proof pack exists.
- **Negotiable:** Choose citation-arm (cite norms) vs execution-arm (run a third-party system) — team may pick the cheaper.
- **Valuable:** Answers the "self-referential" critique with externally grounded norms (LCS 0.90 / strict substring), matching 2026 external-benchmark trend.
- **Estimable:** M — either research writing + gate coverage, or one benchmark integration.
- **Small:** One arm, one artefact, one doc section.
- **Testable:** cited norms carry sources; or committed third-party run artefact passes docs-claims.

**Description:** Either (a) document IslamicEval 2025 / HUMAIN norms (LCS 0.90 for Qur'an, strict substring for hadith) as external validation of mizan's strict-containment design with full citations, or (b) run a third-party system (e.g., an Ansari-style arm) through `system-arm.ts` and commit the result. Explicitly note the IslamicEval 2026 submission deadline passed 2026-08-01 — we cite, not submit.

**Acceptance criteria (Given/When/Then)**

```
Scenario: External norms are cited with sources
  Given the credibility doc
  When it claims LCS 0.90 / strict-substring norms
  Then each claim carries a resolvable citation (IslamicEval 2025 / HUMAIN paper)
  And check:docs passes

Scenario: Third-party run is committed and reproducible (execution arm)
  Given a third-party system run through our verifier
  When the artefact is committed
  Then it records the system, dataset and verdict distribution
  And no unbacked number is printed (negative: gate fails if artefact missing)

Scenario: Deadline non-submission is disclosed (negative)
  Given IslamicEval 2026 submission closed 2026-08-01
  When the doc is written
  Then it never claims submission
  And states the task is cited instead
```

**Edge cases:** third-party system unavailable or ToS-restricted → fall back to the citation arm and record the decision; external norm numbers change between editions; citation URLs rot (prefer stable identifiers); a third-party run that yields zero verifiable claims (report honestly, do not suppress); combining both arms — each number must be artefact-backed.

**Security:** running an external system must not require network inside `mizan-verify` (G-1: exactly one dependency); no external API keys committed (A05/A07); external corpus text passes through the same fence/length-cap before any prompt (R7).

**Performance:** third-party arm runs within the benchmark budget and does not push CI over 5 min (run offline, commit result); report generation < 30 s.

**Reliability:** external service timeout → arm marked `unavailable`, not zero-filled (§16); verifier verdicts on third-party output remain fail-closed; deterministic scoring.

**Task definition**
```json
{
    "goal": "Ground mizan's strict-containment design in external norms or an externally run system",
  "deliverables": [
    {"name": "external credibility section (cited norms)", "format": "documentation"},
    {"name": "committed third-party run artefact (if execution arm chosen)", "format": "JSON"},
    {"name": "decision note: cite vs run, with fallback exercised", "format": "documentation"}
  ],
  "successCriteria": [
    {"text": "Every external number carries a citation", "verificationKind": "contains_text", "verificationSpec": "bun run check:docs"},
    {"text": "No claim of IslamicEval 2026 submission", "verificationKind": "command_exit_0", "verificationSpec": "grep docs for submission claims"},
    {"text": "mizan-verify dependency count unchanged", "verificationKind": "command_exit_0", "verificationSpec": "gate G-1 via bun run ci"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 9: Licensed Bukhari/Muslim ingestion gated by a licence check (fallback: honest framing)

**RICE: 1.0** · Priority: Should · Size: L · Risk: High · Epic: E5 · Deps: **5**

**INVEST checklist**
- **Independent:** Partially — starts from Story 5's honest baseline; the licence-check gate itself is independent.
- **Negotiable:** Source choice (UmmahAPI vs Sunnah.com), collection scope, schedule — all open; attestation requirement is not.
- **Valuable:** Closes the corpus-scope competitive gap (UmmahAPI offers 36k hadiths incl. Bukhari+Muslim) while preserving ADR-C4.
- **Estimable:** L — hence its own story with a hard licence gate and an accepted fallback.
- **Small:** Fits one sprint only because the fallback is a legitimate completion state.
- **Testable:** licence gate passes/fails mechanically; if ingested, records attested and counts consistent across `sources.json`, deck and README.

**Description:** First execute a licence check; only if the licence is clean, ingest Bukhari + Muslim from a licensed source with attestation and ledger integration, updating all corpus-scope claims. If licence terms are unclear, stop, record the decision, and keep the honest framing as the accepted outcome (ADR-C4).

**Acceptance criteria (Given/When/Then)**

```
Scenario: Licence gate passes → licensed ingest lands
  Given a source with verified licence terms permitting ingestion
  When the ingest runs
  Then every record carries attestation
  And counts are consistent across sources.json, deck and README
  And check:docs passes with the updated framing

Scenario: Licence unclear → honest framing retained (fallback, negative)
  Given ambiguous or restrictive licence terms
  When the gate runs
  Then ingestion is refused
  And the decision is recorded in a doc
  And all claims remain "4 Sunan + Muwatta + Qur'an, 27,234 records"

Scenario: Attestation mismatch aborts (security/negative)
  Given an ingested batch whose attestation does not match
  When verification of the batch runs
  Then the run aborts with a loud integrity error
  And no verdict or count is published from that batch

Scenario: Unattested record never reaches the registry (negative)
  Given a fetched record without a valid source attestation
  When the registry write is attempted
  Then the record is rejected
  And the registry total changes only by attested records
```

**Edge cases:** API pagination returning duplicates; partial ingest interrupted midway (must not publish partial counts); source API down/timeout → abort honestly, no fabricated totals; RTL/encoding corruption in Arabic text; record counts shifting after re-ingest (all claims must update atomically); source licence changes after ingest (re-check); URL fetch must respect host allowlist/https/no-redirect (A10 — SSRF); volume/throughput limits of the free API.

**Security:** SSRF control on any fetch — code-side host allowlist, https-only, no redirects (A10); attestation enforced before registry visibility; ledger write failure → run marked untrusted (§3); no API keys in logs/traces/ledger (A09); gitleaks on new config (A05/A07).

**Performance:** ingest throughput stated and measured (records/min against the source's limits); registry write batched to stay within CI/reproducibility budgets; count verification over the full corpus < 60 s.

**Reliability:** source timeout → abort with honest state, never partial-as-complete (§16); retries must not duplicate records; ledger failure marks the run untrusted rather than fail-open; fallback path (no ingest) must leave every existing number untouched and valid.

**Task definition**
```json
{
  "goal": "Add Bukhari/Muslim only via a licence-clean, attested path — or formally keep honest framing",
  "deliverables": [
    {"name": "licence-check gate/decision record", "format": "documentation + gate"},
    {"name": "ingest integration with attestation (if gate passes)", "format": "script/module"},
    {"name": "updated sources.json + counts + deck/README framing", "format": "data + documentation"}
  ],
  "successCriteria": [
    {"text": "Licence gate produces a pass or refuse decision", "verificationKind": "test_passes", "verificationSpec": "bun test (corpus package)"},
    {"text": "No unattested record in registry", "verificationKind": "test_passes", "verificationSpec": "attestation regression test"},
    {"text": "check:docs consistent for whichever outcome landed", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

### Story 10: Golden-100% qualifier sweep + oral one-pager aligned with DISCLOSURE.md

**RICE: 12.0** · Priority: Should · Size: S · Risk: Low · Epic: E4 · Deps: **6**

**INVEST checklist**
- **Independent:** Yes once the proof pack (Story 6) defines the headline number.
- **Negotiable:** One-pager layout open; the qualifier wording rule is fixed by ADR-C5.
- **Valuable:** Eliminates R11 — an unqualified oral "100%" is a scoring risk by 2026 norms.
- **Estimable:** S — docs sweep plus one page.
- **Small:** Copy only.
- **Testable:** every printed golden figure carries the self-referential qualifier; gate enforces it.

**Description:** Sweep all copy so the golden 100% never appears without its self-referential qualifier ("measured against itself, not human labels"), make the executed system-arm the headline, and produce an oral one-pager aligned with `DISCLOSURE.md` §4.

**Acceptance criteria (Given/When/Then)**

```
Scenario: Every golden figure is qualified
  Given README, deck, pack and one-pager
  When each "100%" golden claim is inspected
  Then the self-referential qualifier appears alongside it
  And the headline metric is the executed system-arm number

Scenario: Unqualified claim fails the gate (negative)
  Given a new document printing golden 100% without the qualifier
  When check:docs runs
  Then the command exits non-zero and names the file

Scenario: One-pager matches DISCLOSURE.md
  Given DISCLOSURE.md §4 on replay disclosure
  When the one-pager is read
  Then it repeats the same disclosure without contradiction
  And it contains no answer-quality claim (ADR-C2)
```

**Edge cases:** the number appearing inside a slide image (not gate-scannable → manual checklist item); percentages written as "100", "100.0", "100 percent" (gate must catch variants); oral delivery drift — one-pager must be the single script; golden figure appearing in table headers where the qualifier sits in a footnote (forbidden — qualifier must be adjacent).

**Security:** one-pager contains no secrets, no PII, no question text (A05/A09); only artefact-backed numbers.

**Performance:** gate check < 5 s; no runtime impact.

**Reliability:** fail-closed gate (breaks build rather than warns); if the system-arm artefact is missing, the one-pager must not fall back to the golden number as headline.

**Task definition**
```json
{
  "goal": "Guarantee the golden number is never overclaimed and the oral script is disclosure-aligned",
  "deliverables": [
    {"name": "docs/deck sweep for qualified golden claims", "format": "documentation"},
    {"name": "oral one-pager", "format": "documentation"},
    {"name": "docs-claims rule for golden-100% qualifier", "format": "gate rule"}
  ],
  "successCriteria": [
    {"text": "All golden 100% mentions carry the qualifier", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"},
    {"text": "One-pager exists and references DISCLOSURE.md §4", "verificationKind": "contains_text", "verificationSpec": "grep one-pager for disclosure reference"},
    {"text": "Headline metric is the system-arm number", "verificationKind": "contains_text", "verificationSpec": "grep one-pager for executed-verifier headline"}
  ],
  "accessNeeded": ["read", "write", "shell"]
}
```

---

## Cross-Cutting: Security Scenarios Summary (per story, minimum one each)

| Story | Security scenario (Given/When/Then) |
|---|---|
| 1 | Given secrets present locally, when committed → gitleaks finds none in tree/history; `.env*` ignored (A05/A07). |
| 2 | Given model/corpus text designed to force a `verified`, when verification runs → elision fails closed to `unverifiable`; no new dependency enters `mizan-verify` (A03/CWE-345, G-1). |
| 3 | Given `<script>`/event-handler payloads in corpus text, when rendered → literal text, no execution, G-2 green (A03). |
| 4 | Given a keyed run, when output is produced → no key in CLI/page/runbook/trace/ledger; env surface exactly 4 vars; allowlisted https host only (A09/A10). |
| 5 | Given a doc claiming unearned corpus coverage, when gate runs → build fails (integrity); no secrets in deck scripts (A05). |
| 6 | Given the ledger excerpt, when inspected → `questionHash` only, no question/corpus text or keys (A09/§13). |
| 7 | Given an ADR file, when scanned → no secrets inside prose (gitleaks); no unbacked capability claims (docs-claims). |
| 8 | Given external corpus/system output, when verified → fence/length-cap applied; verifier stays dependency-clean and offline (R7, G-1). |
| 9 | Given an attacker-influenced source URL, when fetched → allowlist/https/no-redirect enforced; attestation mismatch aborts; untrusted ledger on write failure (A10/§3). |
| 10 | Given the one-pager, when read → no PII/secrets/question text; only gate-backed numbers (A05/A09). |

## Cross-Cutting: Performance & Reliability Targets

| Story | Response / throughput | Reliability (error, timeout, retry, degradation) |
|---|---|---|
| 1 | `bun run ci` < 5 min (p95, ubuntu+windows) | Flaky CI = defect; failure names package; self-tests must be able to fail |
| 2 | Verify path offline, deterministic; suite < +10 s | Malformed anchor → `unverifiable` (Result, no throw); no retry-into-different-verdict |
| 3 | Render < 1 s offline; zero network; CI +<5 s | Missing data → honest empty state; page failure never affects CLI; unknown verdict = compile error |
| 4 | Label overhead < 10 ms; provider timeout 30 s | Timeout → `model unavailable` + labelled replay; never canned-as-live; undeterminable mode ≠ "live" |
| 5 | `check:docs` < 10 s | Registry unreadable → gate fails, never silent pass |
| 6 | Benchmark deterministic run-to-run; docs +<30 s | Benchmark not executed → print "not run", never a stale number; artefact/claim mismatch → abort |
| 7 | Resolution check < 5 s | Missing ADR breaks docs CI (fail closed) |
| 8 | Third-party arm within benchmark budget; CI stays <5 min | External timeout → `unavailable`, not zero-fill; verdicts remain fail-closed |
| 9 | Ingest throughput measured vs source limits; full count check < 60 s | Source timeout → abort honestly; partial ingest never published; ledger failure → untrusted |
| 10 | Gate < 5 s | Missing system-arm artefact → one-pager must not headline golden |

---

## Competitive Feature Comparison (research-driven coverage)

| Feature / expectation | Ansari | Fanar-Sadiq | UmmahAPI / Sunnah.com | Perplexity / Elicit | IslamicEval / HUMAIN | **mizan (this plan)** |
|---|---|---|---|---|---|---|
| Retrieval / answer generation | ✔ strong | ✔ strong | ✖ (data only) | ✔ strong | n/a | **Out of scope (Won't — ADR-C2)** |
| Computed fail-closed per-claim verdict | ✖ | ✖ | ✖ | ✖ | detection ≠ abstention | **✔ core — Stories 2, 6** |
| Hash-chained ledger receipt | ✖ | ✖ | ✖ | ✖ | ✖ | **✔ Story 6 (hash-only, A09)** |
| Red-team fabricated set | ✖ | ✖ | ✖ | partial | shared task | **✔ Story 6** |
| Interactive UI (demo-grade) | ✔ | ✔ (API+web) | ✔ docs | ✔ best-in-class | n/a | **✔ Story 3 (static, G-2-safe)** |
| Live-vs-replay transparency | n/a | n/a | n/a | n/a | n/a | **✔ Story 4** |
| Layered trust chips (Perplexity-style) | — | — | — | ✔ | — | **Could — deferred with disclosure** |
| MCP / OpenAPI endpoint | — | API | ✔ | ✔ (Elicit MCP) | — | **Could — table-stakes gap, deferred with explicit disclosure** |
| Arabic UI | ✔ | — | ✔ | — | ✔ | **Could — Arabic deck exists; page deferred** |
| Bukhari + Muslim corpus | partial | partial | **✔ 36k incl. both** | — | — | **Story 9 (licence-gated) or honest framing** |
| Multilingual (25+) | — | — | — | ✔ | — | **Won't this cycle — disclosed** |
| Tafsir | — | — | ✔ 3 tafsirs | — | — | **Won't without backend — typed `unavailable` (§16)** |
| External benchmark citation | ✔ IslamicMMLU | — | — | ✔ | ✔ norms | **Story 8** |
| Self-referential golden qualified | — | — | — | — | — | **Story 10** |

**Table-stakes flagged and explicitly deferred (Must be disclosed, not hidden):** MCP/OpenAPI read-only endpoint, Arabic web UI, 25+ languages, Perplexity-style chips. All are in the CEO's Could/Won't list — the plan covers the *differentiators* (verdict, ledger, red-team, runnable surface, honesty) first, which is where the negative-space claim lives.

---

## Risk Register (mapped to stories)

| # | Risk | Severity | Mitigating story(s) |
|---|------|----------|---------------------|
| R1 | Dirty tree: HEAD ≠ claimed system | Critical | **Story 1** (blocks all) |
| R2 | Paraphrase `REJECTED` vs `UNVERIFIABLE` divergence | High | **Story 2** |
| R3 | No UI fails "runnable integrated product" | High | **Story 3** |
| R4 | XSS on new page (A03) | High | **Story 3** (text nodes + G-2) |
| R5 | SSRF via provider/source URL (A10) | Medium | **Stories 4, 9** |
| R6 | Secret leakage in history/deck (A05/A07) | Medium | **Stories 1, 6, 7, 10** (gitleaks) |
| R7 | Prompt injection via corpus (A03) | Medium | **Stories 2, 8** (verifier sole authority) |
| R8 | Live provider fails during demo | Medium | **Story 4** (30 s → `model unavailable` + labelled replay) |
| R9 | Verify path crashes / passes without evidence | High | **Stories 2, 9** (fail-closed regression) |
| R10 | `PRECOMPUTED` misread as fake | High | **Story 4** |
| R11 | Golden 100% overclaimed | Medium | **Story 10** |
| R12 | Bukhari/Muslim licensing unclear | Medium | **Story 9** (licence gate + fallback) |
| R13 | Scope vs capacity (13.5 pm vs 3-person cycle) | High | ≤10 stories, 2 sprints, fallback slice enforced by this plan |
| R14 | Effect beta API drift | Low | Decode adapter seam unchanged (Stories 2/9 must use `decodeOrFail`) |
| R15 | ~30 dangling ADR citations | Medium | **Story 7** |

**Highest-uncertainty stories (Risk Register additions):** Story 9 (licence + external API — 50% confidence, high effort); Story 8 (third-party execution arm may be blocked by ToS/availability — 50%); Story 3 (G-2 compatibility unknown until the first page file lands — mitigated by text-node-only design from ADR-C3).

```json
{
  "stories": [
    {
      "id": 1,
      "title": "Commit the entire working tree and prove clean-HEAD CI green",
      "epic": "E4",
      "priority": "must",
      "sprint": 1,
      "size": "S",
      "risk": "critical",
      "dependencies": [],
      "rice": {"reach": 9, "impact": 3, "confidence": 1.0, "effort": 1, "score": 27.0},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Make HEAD equal the claimed system and prove it with green clean-tree CI under 5 minutes",
      "description": "Stage and commit all 57 modified and 38 untracked files including the executed system-arm artefact; keep data/corpus.db and .env* ignored; run bun run ci on ubuntu and windows and confirm gates G-1..G-7 plus docs-claims pass.",
      "scenarios": [
        {"id": "s1-ac1", "name": "Working tree fully committed", "given": "the repository has 57 modified and 38 untracked files including the executed system-arm artefact", "when": "every intended artefact is staged and committed", "then": "git status reports a clean tree", "and": "HEAD contains the executed system-arm output with systemArmSource executed-verifier"},
        {"id": "s1-ac2", "name": "Clean-HEAD CI green and bounded", "given": "a fresh clone of committed HEAD on ubuntu and windows", "when": "bun run ci runs", "then": "it exits 0 in under 5 minutes", "and": "gates G-1..G-7 plus docs-claims all report pass"},
        {"id": "s1-ac3", "name": "CI failure names the failing package (negative)", "given": "a planted failure in one package", "when": "bun run ci runs", "then": "the command exits non-zero and names the failing package", "and": "no gate reports pass for that package"},
        {"id": "s1-ac4", "name": "Ignored artefacts stay ignored (negative)", "given": "data/corpus.db and .env* exist locally", "when": "the commit is created", "then": "neither file is present in the commit", "and": "gitleaks reports zero findings on tree and history"}
      ],
      "edgeCases": ["gitignored DB and .env must remain untracked", "secret accidentally staged inside a new file", "large binary artefacts bloating the repo", "CRLF/LF divergence breaking windows matrix", "partial commit leaving stale system-arm numbers on HEAD", "bun.lock drift making CI nondeterministic"],
      "security": "No keys or .env contents enter history (A05/A07); .env* gitignored; gitleaks green on tree + history.",
      "performance": "bun run ci completes in under 5 minutes (p95) on ubuntu and windows; 15-minute job timeout respected.",
      "reliability": "Deterministic CI; flaky gate is a defect; planted-violation self-tests must run; failure exits non-zero naming the package, never a silent pass.",
      "taskDefinition": {"goal": "Make HEAD equal the claimed system and prove it with green clean-tree CI", "deliverables": [{"name": "git commits containing all intended changes", "format": "commit"}, {"name": "CI run record on clean HEAD (ubuntu + windows)", "format": "log"}, {"name": "confirmation that .env* and data/corpus.db excluded", "format": "checklist"}], "successCriteria": [{"text": "git status clean after commit", "verificationKind": "command_exit_0", "verificationSpec": "git status --porcelain"}, {"text": "bun run ci exits 0 on clean HEAD", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"}, {"text": "CI under 5 minutes", "verificationKind": "command_exit_0", "verificationSpec": "timing around bun run ci < 300000ms"}, {"text": "gitleaks clean on tree and history", "verificationKind": "command_exit_0", "verificationSpec": "gitleaks detect --history"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 2,
      "title": "Mechanise paraphrase/elision to UNVERIFIABLE with 26-case regression and docs sweep",
      "epic": "E2",
      "priority": "must",
      "sprint": 1,
      "size": "M",
      "risk": "high",
      "dependencies": [1],
      "rice": {"reach": 7, "impact": 3, "confidence": 0.8, "effort": 3, "score": 5.6},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Align code with ADR-C1 and the 26 human rulings: elision returns unverifiable/no_matching_evidence",
      "description": "Insert the elision branch at the anchor step between step 5b and step 6 in packages/mizan-verify/src/verify.ts using AnchorSpan {located, span}; add a 26-case regression suite from data/eval/adjudication.json; sweep README and docs/anchor-protocol.md to remove divergence language; mizan-verify keeps exactly one dependency.",
      "scenarios": [
        {"id": "s2-ac1", "name": "Elided paraphrase resolves to UNVERIFIABLE", "given": "an answer whose citation id resolves but whose record lacks the quoted span", "when": "verification runs", "then": "the verdict is unverifiable with reason no_matching_evidence", "and": "the verdict is never verified and never rejected for this case"},
        {"id": "s2-ac2", "name": "All 26 adjudicated elision cases match", "given": "data/eval/adjudication.json with 26 elision rulings of unverifiable", "when": "the regression suite runs", "then": "26 of 26 cases match code behaviour", "and": "the suite fails if any case diverges"},
        {"id": "s2-ac3", "name": "True disproof still REJECTED (negative)", "given": "a resolved record whose quote region contradicts the record", "when": "verification runs", "then": "the verdict remains rejected", "and": "the elision branch does not capture it"},
        {"id": "s2-ac4", "name": "Zero evidence fails closed (negative)", "given": "no resolvable citation at all", "when": "verification runs", "then": "the verdict is unverifiable", "and": "no path returns verified and no throw crosses the package boundary"},
        {"id": "s2-ac5", "name": "Docs no longer publish a divergence", "given": "README and docs/anchor-protocol.md", "when": "the docs sweep completes", "then": "no file states code returns REJECTED for elision while rulings say UNVERIFIABLE", "and": "check:docs passes"}
      ],
      "edgeCases": ["empty or whitespace-only span", "Unicode normalization variants of the quote", "multiple anchors with only one elided (per-claim verdicts)", "located:false vs located:true with missing quote", "duplicate quotes across collections", "long elisions (60+ chars)", "malformed anchor payload decoded via decodeOrFail Result", "unknown verdict string must remain a compile error"],
      "security": "Fail-closed preserved: malicious corpus/model text can never steer elision into verified (CWE-345); G-1 enforces exactly one dependency on @mizan/core; no fuzzy/percentage threshold introduced (ADR-03).",
      "performance": "Verification stays offline and deterministic; regression suite adds less than 10 s to package CI; zero network calls in the verify path.",
      "reliability": "Malformed model/anchor output yields unverifiable, never a crash; no retry into a different verdict; failures surface as Result errors per sections 2 and 16.",
      "taskDefinition": {"goal": "Mechanise elision to unverifiable and prove it against the 26 human rulings", "deliverables": [{"name": "packages/mizan-verify/src/verify.ts anchor-step verdict branch", "format": "TypeScript"}, {"name": "26-case elision regression suite", "format": "test suite"}, {"name": "README and docs/anchor-protocol.md sweep", "format": "documentation"}], "successCriteria": [{"text": "26/26 elision cases return unverifiable/no_matching_evidence", "verificationKind": "test_passes", "verificationSpec": "bun test in packages/mizan-verify"}, {"text": "verify.ts contains no_matching_evidence handling", "verificationKind": "contains_text", "verificationSpec": "grep packages/mizan-verify/src/verify.ts for no_matching_evidence"}, {"text": "G-1 passes (exactly one dependency)", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"}, {"text": "No divergence language remains", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 3,
      "title": "Static text-node web page rendering the three badge lines from the shared verdict map",
      "epic": "E3",
      "priority": "must",
      "sprint": 1,
      "size": "M",
      "risk": "medium",
      "dependencies": [1],
      "rice": {"reach": 8, "impact": 2, "confidence": 0.8, "effort": 3, "score": 4.3},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Ship a runnable static product surface proving the badge is computed, G-2 safe",
      "description": "Add one framework-free static page rendering VERIFIED/UNVERIFIABLE/REJECTED as DOM text nodes from the same verdict map as apps/cli/src/render.ts (ADR-C3); no bundler, no UI framework; any printed number enters the docs-claims gate.",
      "scenarios": [
        {"id": "s3-ac1", "name": "Page renders three badge lines from shared map", "given": "the shared verdict map in apps/cli/src/render.ts", "when": "the static page is opened", "then": "all three badge lines appear identical to the map values", "and": "every value is inserted as a DOM text node, not HTML"},
        {"id": "s3-ac2", "name": "Page loads offline", "given": "no network connectivity", "when": "the page is opened", "then": "it renders completely", "and": "zero network requests are made"},
        {"id": "s3-ac3", "name": "Corpus text cannot inject markup (security, negative)", "given": "retrieved corpus text containing a script tag and an onerror payload", "when": "the text is rendered", "then": "it appears literally as text", "and": "no script executes and gate G-2 passes with its planted-violation self-test intact"},
        {"id": "s3-ac4", "name": "Unknown verdict fails at compile time (negative)", "given": "a verdict value outside the three known strings", "when": "the build runs", "then": "tsc --noEmit fails", "and": "the page never renders a silent fallback badge"}
      ],
      "edgeCases": ["empty verdict list", "extremely long corpus quotes wrapping without HTML", "RTL Arabic text direction", "unescaped quotes and angle brackets in corpus text", "file:// vs local server loading", "JS disabled still showing text or an honest unavailable note", "any printed number must be artefact-backed"],
      "security": "OWASP A03: zero innerHTML/dangerouslySetInnerHTML/{@html/document.write in new files; G-2 scans the whole tree; no framework sinks (ADR-C3); no secrets in page assets (A05/A07); hash-only data in any shown trace (A09).",
      "performance": "Static, unbundled; first render under 1 s offline; zero third-party assets; adds under 5 s to CI (G-2 + docs-claims only).",
      "reliability": "Missing data degrades to an honest empty/unavailable state per section 16, never a fabricated badge; page failure never affects the CLI (CLI is primary); unknown verdict is a compile error.",
      "taskDefinition": {"goal": "Ship a runnable static G-2-safe product surface", "deliverables": [{"name": "static web page", "format": "HTML/TS with text-node rendering"}, {"name": "reuse of apps/cli/src/render.ts verdict map", "format": "module reference"}, {"name": "badge-string parity test", "format": "test suite"}], "successCriteria": [{"text": "Page file exists", "verificationKind": "file_exists", "verificationSpec": "path to new page file"}, {"text": "Zero raw-HTML sinks (G-2)", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"}, {"text": "Badge strings equal render.ts values", "verificationKind": "test_passes", "verificationSpec": "bun test in the package containing page tests"}, {"text": "No network usage in page", "verificationKind": "contains_text", "verificationSpec": "grep page source for fetch/http(s)://"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 4,
      "title": "Live-vs-replay (PRECOMPUTED) labelling in CLI, page and demo runbook",
      "epic": "E3",
      "priority": "must",
      "sprint": 1,
      "size": "S",
      "risk": "medium",
      "dependencies": [1, 3],
      "rice": {"reach": 8, "impact": 1, "confidence": 0.8, "effort": 1, "score": 6.4},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Make live-vs-replay mode unmistakable on every surface so PRECOMPUTED is never misread as fake",
      "description": "Keyless hosted mode prints PRECOMPUTED in CLI and on the page; keyed runs are labelled live; demo runbook leads with the keyed live path and documents replay as the labelled fallback; DISCLOSURE.md section 4 stays consistent.",
      "scenarios": [
        {"id": "s4-ac1", "name": "Keyless run is labelled PRECOMPUTED", "given": "no MIZAN_LLM_API_KEY is set", "when": "the user runs the CLI ask/demo command", "then": "the output is explicitly labelled PRECOMPUTED", "and": "no canned output is presented as live"},
        {"id": "s4-ac2", "name": "Keyed run is labelled live", "given": "a valid key and an allowlisted provider host", "when": "the CLI runs against the live path", "then": "the output is labelled live", "and": "the page shows the same label for that result"},
        {"id": "s4-ac3", "name": "Provider failure degrades honestly (negative)", "given": "a keyed run where the provider times out at 30 seconds", "when": "the run completes", "then": "the surface shows model unavailable", "and": "the labelled PRECOMPUTED replay fallback is offered and nothing canned is shown as live"},
        {"id": "s4-ac4", "name": "Runbook orders live-first", "given": "the demo runbook", "when": "an operator follows it with a key set", "then": "step 1 is the live keyed path", "and": "replay is documented as the labelled fallback"}
      ],
      "edgeCases": ["key present but invalid or wrong model", "base URL outside allowlist (refused, A10)", "partially downloaded transcript labelled incomplete", "env typo across the exactly-4 env vars", "transcript file missing (replay unavailable, stated plainly)", "label must never echo key or credentials", "mode undeterminable (must not claim live)"],
      "security": "No key material in CLI output, page, runbook, traces or ledger (A09/section 13); env surface exactly 4 vars; host allowlist in code, https, no redirects (A10); gitleaks covers new runbook copy (A05/A07).",
      "performance": "Labelling overhead under 10 ms; provider timeout remains 30 s.",
      "reliability": "Replay path byte-deterministic; live failure never corrupts a stored verdict; missing label is itself a failure (fail closed on mode determination).",
      "taskDefinition": {"goal": "Make live-vs-replay mode unmistakable on CLI, page and runbook", "deliverables": [{"name": "label output in apps/cli/src/main.ts, demo.ts, provider-config.ts", "format": "TypeScript"}, {"name": "page-side PRECOMPUTED/live label", "format": "static page update"}, {"name": "demo runbook live-first", "format": "documentation"}, {"name": ".env.example and DISCLOSURE.md section 4 cross-check", "format": "documentation"}], "successCriteria": [{"text": "Keyless CLI output contains PRECOMPUTED", "verificationKind": "contains_text", "verificationSpec": "bun run ask with no key, grep output for PRECOMPUTED"}, {"text": "Page shows provider-mode label", "verificationKind": "contains_text", "verificationSpec": "grep page source for label string"}, {"text": "Runbook documents live path before replay", "verificationKind": "contains_text", "verificationSpec": "read demo runbook"}, {"text": "No key in any labelled output", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 5,
      "title": "Corpus-scope honesty sweep across slide 7, README and docs-claims",
      "epic": "E5",
      "priority": "must",
      "sprint": 1,
      "size": "S",
      "risk": "medium",
      "dependencies": [1],
      "rice": {"reach": 6, "impact": 2, "confidence": 1.0, "effort": 1, "score": 12.0},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Make corpus-scope claims uniform, arithmetic-backed and gate-enforced",
      "description": "Every public surface states '4 Sunan + Muwatta + Qur'an, 27,234 records' (quran 6236 + nasai 5672 + abudawud 5272 + ibnmajah 4336 + tirmidhi 3889 + malik 1829); correct slide 7 in both decks; never claim Bukhari/Muslim unless ingested and attested (ADR-C4).",
      "scenarios": [
        {"id": "s5-ac1", "name": "All surfaces carry the honest framing", "given": "slide 7 of make_deck.py and make_deck_ar.py, README and docs", "when": "the sweep completes", "then": "each states 4 Sunan + Muwatta + Qur'an, 27,234 records", "and": "the per-collection counts sum to 27,234 from data/registry"},
        {"id": "s5-ac2", "name": "Contradicting claim fails the docs gate (negative)", "given": "any doc claiming Bukhari or Muslim coverage", "when": "bun run check:docs runs", "then": "the gate exits non-zero", "and": "it names the offending file"},
        {"id": "s5-ac3", "name": "Counts stay machine-verified", "given": "data/registry/records.jsonl", "when": "the corpus is regrouped by collection", "then": "per-collection counts equal the published numbers", "and": "the total equals 27,234"}
      ],
      "edgeCases": ["Arabic deck diverging from English deck", "numbers baked into slide images outside text gates (manual review)", "Story 9 ingestion later changing counts (sweep must not hard-code an invalidated claim)", "sources.json enable/disable drift", "comma formatting variants of 27,234"],
      "security": "Integrity protection: docs-claims gate prevents fabricated or unbacked numbers; no secrets in deck scripts (A05).",
      "performance": "check:docs runs within CI budget, under 10 s.",
      "reliability": "Gate failure is fail-closed (build breaks), never warn-and-proceed; unreadable registry must not silently pass.",
      "taskDefinition": {"goal": "Uniform, gate-enforced corpus-scope claims", "deliverables": [{"name": "slide 7 copy in submission/make_deck.py and make_deck_ar.py", "format": "documentation/deck source"}, {"name": "README corpus-scope section", "format": "documentation"}, {"name": "docs-claims coverage for the framing sentence", "format": "gate rule"}], "successCriteria": [{"text": "check:docs passes with no contradicting claim", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}, {"text": "Published counts equal registry grouping", "verificationKind": "test_passes", "verificationSpec": "registry count assertion test"}, {"text": "No surface claims Bukhari or Muslim coverage", "verificationKind": "command_exit_0", "verificationSpec": "grep -ri bukhari README.md docs/ submission/"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 6,
      "title": "Value-proof pack: committed executed system-arm, one-sentence claim, competitor comparison",
      "epic": "E1",
      "priority": "must",
      "sprint": 1,
      "size": "M",
      "risk": "high",
      "dependencies": [1],
      "rice": {"reach": 9, "impact": 3, "confidence": 0.8, "effort": 3, "score": 7.2},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Prove (not assert) the negative-space claim with committed, gate-checked evidence",
      "description": "Assemble: one-sentence claim 'search attaches citations; mizan adjudicates them, fail-closed, with a hash-chained receipt'; committed executed system-arm artefact (systemArmSource executed-verifier); red-team fabricated-set results; hash-chained ledger demonstration (hashes only); competitor comparison table (Ansari, Fanar-Sadiq, UmmahAPI, Perplexity/Elicit).",
      "scenarios": [
        {"id": "s6-ac1", "name": "Headline number backed by committed executed artefact", "given": "the executed system-arm run", "when": "its output is committed to HEAD", "then": "the artefact records systemArmSource executed-verifier", "and": "every printed number traces to that artefact and check:docs passes"},
        {"id": "s6-ac2", "name": "One-sentence claim judge-legible in 60 seconds", "given": "the value-proof pack", "when": "a judge reads the first claim", "then": "it states the negative space (computed fail-closed per-claim verdict) in one sentence", "and": "it makes no answer-quality or retrieval-quality claim (ADR-C2)"},
        {"id": "s6-ac3", "name": "Unbacked number fails the gate (negative)", "given": "a number added without a committed artefact", "when": "check:docs runs", "then": "the gate exits non-zero and names the claim", "and": "CI fails closed"},
        {"id": "s6-ac4", "name": "Ledger demonstration is hash-chained and content-free", "given": "the ledger excerpt shown in the pack", "when": "inspected", "then": "entries carry questionHash and verdict only", "and": "no question text, corpus text, PII or key appears (section 13/A09)"}
      ],
      "edgeCases": ["label-derived tautology at score.ts:99 resurfacing (must be replaced by executed arm)", "benchmark run on a dirty tree (forbidden)", "red-team set empty or reduced", "comparison numbers cited without a source", "non-deterministic scores between runs", "partial artefact committed without inputs"],
      "security": "Hash-only ledger and traces (A09); no secrets in benchmark scripts or artefacts (A05/A07); comparison cites public research only; gitleaks green.",
      "performance": "System-arm benchmark deterministic run-to-run and within reproducibility budget; pack adds under 30 s to check:docs.",
      "reliability": "Benchmark not executed prints 'not run', never a stale number; artefact/claim mismatch aborts the docs gate; no fail-open.",
      "taskDefinition": {"goal": "Prove the negative-space claim with committed gate-checked evidence", "deliverables": [{"name": "committed executed system-arm artefact", "format": "JSON"}, {"name": "value-proof pack document with one-sentence claim and comparison table", "format": "documentation"}, {"name": "red-team set result summary", "format": "JSON/document"}, {"name": "hash-chained ledger excerpt (hashes only)", "format": "documentation"}], "successCriteria": [{"text": "Artefact records executed-verifier on HEAD", "verificationKind": "contains_text", "verificationSpec": "grep committed artefact for executed-verifier"}, {"text": "All printed numbers pass docs-claims", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}, {"text": "No answer-quality claim in pack", "verificationKind": "command_exit_0", "verificationSpec": "grep pack for forbidden fluency/retrieval claims"}, {"text": "Ledger excerpt hashes only", "verificationKind": "contains_text", "verificationSpec": "grep excerpt for questionHash with no raw question text"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 7,
      "title": "Write ADR-C1..C5 files resolving the dangling ADR citations",
      "epic": "E4",
      "priority": "must",
      "sprint": 1,
      "size": "S",
      "risk": "low",
      "dependencies": [1],
      "rice": {"reach": 5, "impact": 1, "confidence": 1.0, "effort": 0.5, "score": 10.0},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Make every ADR citation resolvable and record ADR-C1..C5 as Accepted",
      "description": "Materialise ADR-C1..C5 (content from spec section 7) under docs/specs/adr/ and add an ID-resolution check so future citations cannot dangle (~30 source sites currently cite non-existent files).",
      "scenarios": [
        {"id": "s7-ac1", "name": "Every cited ADR ID resolves", "given": "about 30 source sites citing ADR-0x and ADR-Cx", "when": "the docs check runs", "then": "each cited ID maps to a file in docs/specs/adr/ and ADR-C1..C5 exist with status Accepted", "and": "check:docs passes"},
        {"id": "s7-ac2", "name": "Dangling citation fails the gate (negative)", "given": "a document citing ADR-C99 that does not exist", "when": "check:docs runs", "then": "the command exits non-zero and names the citation", "and": "CI fails closed"},
        {"id": "s7-ac3", "name": "ADR content matches recorded decisions", "given": "ADRs from the source specification", "when": "each file is read", "then": "context/decision/consequences/status fields are present", "and": "ADR-C1 states elision verdict equals UNVERIFIABLE"}
      ],
      "edgeCases": ["legacy ADR-03 style IDs in a different namespace (must resolve or be mapped)", "duplicate ADR IDs", "status left as draft", "case-sensitivity of IDs on the windows matrix"],
      "security": "No secrets inside ADR prose (gitleaks); no capability claims beyond what exists on HEAD (docs-claims integrity).",
      "performance": "Resolution check under 5 s inside check:docs.",
      "reliability": "Fail-closed: a missing ADR breaks docs CI rather than being skipped with a warning.",
      "taskDefinition": {"goal": "Record ADR-C1..C5 and enforce citation resolution", "deliverables": [{"name": "docs/specs/adr/ADR-C1.md through ADR-C5.md", "format": "documentation"}, {"name": "ADR ID resolution check", "format": "gate/script"}], "successCriteria": [{"text": "Five ADR files exist", "verificationKind": "file_exists", "verificationSpec": "docs/specs/adr directory listing"}, {"text": "Zero dangling ADR citations", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}, {"text": "Planted dangling citation fails the gate", "verificationKind": "command_exit_0", "verificationSpec": "gate self-test with fake ADR-C99 reference"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 8,
      "title": "External credibility arm: cited IslamicEval/HUMAIN norms or third-party run through our verifier",
      "epic": "E1",
      "priority": "should",
      "sprint": 2,
      "size": "M",
      "risk": "medium",
      "dependencies": [6],
      "rice": {"reach": 5, "impact": 2, "confidence": 0.5, "effort": 3, "score": 1.7},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Ground strict containment in external norms or an externally run system",
      "description": "Either (a) document IslamicEval 2025 / HUMAIN norms (LCS 0.90 for Qur'an, strict substring for hadith) with full citations as external validation, or (b) run a third-party system through scripts/benchmark/system-arm.ts and commit the result. Disclose that the IslamicEval 2026 submission deadline (2026-08-01) passed: cite the task, do not claim submission.",
      "scenarios": [
        {"id": "s8-ac1", "name": "External norms cited with sources", "given": "the credibility doc", "when": "it claims LCS 0.90 / strict-substring norms", "then": "each claim carries a resolvable citation to IslamicEval 2025 or the HUMAIN paper", "and": "check:docs passes"},
        {"id": "s8-ac2", "name": "Third-party run committed and reproducible (execution arm)", "given": "a third-party system run through our verifier", "when": "the artefact is committed", "then": "it records system, dataset and verdict distribution", "and": "a missing artefact makes the docs gate fail (negative)"},
        {"id": "s8-ac3", "name": "Deadline non-submission disclosed (negative)", "given": "IslamicEval 2026 submission closed 2026-08-01", "when": "the doc is written", "then": "it never claims submission", "and": "it states the task is cited instead"}
      ],
      "edgeCases": ["third-party unavailable or ToS-restricted (fall back to citation arm and record the decision)", "external norm numbers changing between editions", "rotting citation URLs (prefer stable identifiers)", "third-party run yielding zero verifiable claims (report honestly)", "both arms combined (each number artefact-backed)"],
      "security": "No network inside mizan-verify (G-1, exactly one dependency); no external API keys committed (A05/A07); external corpus text fenced, length-capped and data-only before any prompt (R7).",
      "performance": "Third-party arm runs offline with committed result so CI stays under 5 min; report generation under 30 s.",
      "reliability": "External service timeout marks the arm unavailable, never zero-filled (section 16); verdicts on third-party output remain fail-closed and deterministic.",
      "taskDefinition": {"goal": "Ground strict containment in external norms or an externally run system", "deliverables": [{"name": "external credibility section with cited norms", "format": "documentation"}, {"name": "committed third-party run artefact (if execution arm chosen)", "format": "JSON"}, {"name": "decision note cite-vs-run with fallback exercised", "format": "documentation"}], "successCriteria": [{"text": "Every external number carries a citation", "verificationKind": "contains_text", "verificationSpec": "bun run check:docs"}, {"text": "No claim of IslamicEval 2026 submission", "verificationKind": "command_exit_0", "verificationSpec": "grep docs for submission claims"}, {"text": "mizan-verify dependency count unchanged", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci (gate G-1)"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 9,
      "title": "Licensed Bukhari/Muslim ingestion gated by a licence check (fallback: honest framing)",
      "epic": "E5",
      "priority": "should",
      "sprint": 2,
      "size": "L",
      "risk": "high",
      "dependencies": [5],
      "rice": {"reach": 6, "impact": 2, "confidence": 0.5, "effort": 6, "score": 1.0},
      "invest": {"independent": false, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Add Bukhari/Muslim only via a licence-clean attested path, or formally keep honest framing",
      "description": "Run a licence check first; only if clean, ingest Bukhari + Muslim from a licensed source (UmmahAPI or Sunnah.com) with attestation and ledger integration and update all corpus-scope claims. If licence terms are unclear, stop, record the decision, and keep the honest framing as the accepted outcome (ADR-C4).",
      "scenarios": [
        {"id": "s9-ac1", "name": "Licence gate passes then licensed ingest lands", "given": "a source with verified licence terms permitting ingestion", "when": "the ingest runs", "then": "every record carries attestation", "and": "counts are consistent across sources.json, deck and README and check:docs passes"},
        {"id": "s9-ac2", "name": "Licence unclear then honest framing retained (negative)", "given": "ambiguous or restrictive licence terms", "when": "the gate runs", "then": "ingestion is refused", "and": "the decision is recorded and all claims remain 4 Sunan + Muwatta + Qur'an, 27,234 records"},
        {"id": "s9-ac3", "name": "Attestation mismatch aborts (security, negative)", "given": "an ingested batch whose attestation does not match", "when": "verification of the batch runs", "then": "the run aborts with a loud integrity error", "and": "no verdict or count is published from that batch"},
        {"id": "s9-ac4", "name": "Unattested record never reaches the registry (negative)", "given": "a fetched record without valid source attestation", "when": "the registry write is attempted", "then": "the record is rejected", "and": "the registry total changes only by attested records"}
      ],
      "edgeCases": ["API pagination returning duplicates", "partial ingest interrupted (never publish partial counts)", "source API down or timeout (abort honestly)", "RTL/encoding corruption in Arabic text", "count shifts requiring atomic claim updates", "licence changed after ingest (re-check)", "fetch URL must satisfy host allowlist, https, no redirects (A10)", "free-API rate limits"],
      "security": "SSRF control on every fetch (code-side allowlist, https-only, no redirects, A10); attestation enforced before registry visibility; ledger write failure marks run untrusted (section 3); no keys in logs/traces/ledger (A09); gitleaks on new config (A05/A07).",
      "performance": "Ingest throughput measured against source limits (records/min); batched registry writes; full-corpus count verification under 60 s.",
      "reliability": "Source timeout aborts with honest state, never partial-as-complete (section 16); retries must not duplicate records; ledger failure marks run untrusted rather than fail-open; fallback leaves every existing number untouched and valid.",
      "taskDefinition": {"goal": "Add Bukhari/Muslim only via licence-clean attested path or keep honest framing", "deliverables": [{"name": "licence-check gate and decision record", "format": "documentation + gate"}, {"name": "ingest integration with attestation (if gate passes)", "format": "script/module"}, {"name": "updated sources.json, counts, deck and README framing", "format": "data + documentation"}], "successCriteria": [{"text": "Licence gate produces pass or refuse decision", "verificationKind": "test_passes", "verificationSpec": "bun test in packages/mizan-corpus"}, {"text": "No unattested record in registry", "verificationKind": "test_passes", "verificationSpec": "attestation regression test"}, {"text": "check:docs consistent for whichever outcome landed", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}], "accessNeeded": ["read", "write", "shell"]}
    },
    {
      "id": 10,
      "title": "Golden-100% qualifier sweep and oral one-pager aligned with DISCLOSURE.md",
      "epic": "E4",
      "priority": "should",
      "sprint": 2,
      "size": "S",
      "risk": "low",
      "dependencies": [6],
      "rice": {"reach": 6, "impact": 1, "confidence": 1.0, "effort": 0.5, "score": 12.0},
      "invest": {"independent": true, "negotiable": true, "valuable": true, "estimable": true, "small": true, "testable": true},
      "goal": "Guarantee the golden number is never overclaimed and the oral script is disclosure-aligned",
      "description": "Sweep all copy so golden 100% never appears without its self-referential qualifier, make the executed system-arm the headline metric (ADR-C5), and produce an oral one-pager aligned with DISCLOSURE.md section 4.",
      "scenarios": [
        {"id": "s10-ac1", "name": "Every golden figure is qualified", "given": "README, deck, pack and one-pager", "when": "each 100% golden claim is inspected", "then": "the self-referential qualifier appears alongside it", "and": "the headline metric is the executed system-arm number"},
        {"id": "s10-ac2", "name": "Unqualified claim fails the gate (negative)", "given": "a new document printing golden 100% without the qualifier", "when": "check:docs runs", "then": "the command exits non-zero and names the file", "and": "CI fails closed"},
        {"id": "s10-ac3", "name": "One-pager matches DISCLOSURE.md", "given": "DISCLOSURE.md section 4 on replay disclosure", "when": "the one-pager is read", "then": "it repeats the same disclosure without contradiction", "and": "it contains no answer-quality claim (ADR-C2)"}
      ],
      "edgeCases": ["golden number inside slide images (manual checklist item)", "written as 100, 100.0 or 100 percent (gate must catch variants)", "qualifier in a footnote rather than adjacent (forbidden)", "oral drift (one-pager is the single script)", "missing system-arm artefact (must not fall back to golden as headline)"],
      "security": "One-pager contains no secrets, PII or question text (A05/A09); only artefact-backed numbers.",
      "performance": "Gate check under 5 s; no runtime impact.",
      "reliability": "Fail-closed gate (breaks build rather than warns); if the system-arm artefact is missing the one-pager must not headline the golden number.",
      "taskDefinition": {"goal": "Never overclaim golden 100%; align oral script with disclosures", "deliverables": [{"name": "docs and deck sweep for qualified golden claims", "format": "documentation"}, {"name": "oral one-pager", "format": "documentation"}, {"name": "docs-claims rule for golden-100% qualifier", "format": "gate rule"}], "successCriteria": [{"text": "All golden 100% mentions carry the qualifier", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs"}, {"text": "One-pager exists and references DISCLOSURE.md section 4", "verificationKind": "contains_text", "verificationSpec": "grep one-pager for disclosure reference"}, {"text": "Headline metric is the system-arm number", "verificationKind": "contains_text", "verificationSpec": "grep one-pager for executed-verifier headline"}], "accessNeeded": ["read", "write", "shell"]}
    }
  ],
  "acceptanceCriteria": [
    {"id": "s1-ac1", "storyId": 1, "scenario": "Working tree fully committed", "given": "the repository has 57 modified and 38 untracked files including the executed system-arm artefact", "when": "every intended artefact is staged and committed", "then": "git status reports a clean tree and HEAD contains systemArmSource executed-verifier", "and": "data/corpus.db and .env* remain untracked"},
    {"id": "s1-ac2", "storyId": 1, "scenario": "Clean-HEAD CI green and bounded", "given": "a fresh clone of committed HEAD on ubuntu and windows", "when": "bun run ci runs", "then": "it exits 0 in under 5 minutes with gates G-1..G-7 plus docs-claims passing", "and": "gitleaks reports zero findings on tree and history"},
    {"id": "s1-ac3", "storyId": 1, "scenario": "CI failure names the failing package", "given": "a planted failure in one package", "when": "bun run ci runs", "then": "the command exits non-zero naming the failing package", "and": "no gate reports pass for that package"},
    {"id": "s2-ac1", "storyId": 2, "scenario": "Elided paraphrase resolves to UNVERIFIABLE", "given": "an answer whose citation id resolves but whose record lacks the quoted span", "when": "verification runs", "then": "the verdict is unverifiable with reason no_matching_evidence", "and": "the verdict is never verified and never rejected for this case"},
    {"id": "s2-ac2", "storyId": 2, "scenario": "All 26 adjudicated elision cases match", "given": "data/eval/adjudication.json with 26 elision rulings of unverifiable", "when": "the regression suite runs", "then": "26 of 26 cases match code behaviour", "and": "the suite fails if any case diverges"},
    {"id": "s2-ac3", "storyId": 2, "scenario": "True disproof still REJECTED", "given": "a resolved record whose quote region contradicts the record", "when": "verification runs", "then": "the verdict remains rejected", "and": "the elision branch does not capture it"},
    {"id": "s2-ac4", "storyId": 2, "scenario": "Zero evidence fails closed", "given": "no resolvable citation at all", "when": "verification runs", "then": "the verdict is unverifiable", "and": "no path returns verified and no throw crosses the package boundary"},
    {"id": "s2-ac5", "storyId": 2, "scenario": "Docs no longer publish a divergence", "given": "README and docs/anchor-protocol.md", "when": "the docs sweep completes", "then": "no file states code returns REJECTED for elision while rulings say UNVERIFIABLE", "and": "check:docs passes"},
    {"id": "s3-ac1", "storyId": 3, "scenario": "Page renders three badge lines from shared map", "given": "the shared verdict map in apps/cli/src/render.ts", "when": "the static page is opened", "then": "all three badge lines appear identical to the map values as DOM text nodes", "and": "no HTML injection is used"},
    {"id": "s3-ac2", "storyId": 3, "scenario": "Page loads offline", "given": "no network connectivity", "when": "the page is opened", "then": "it renders completely", "and": "zero network requests are made"},
    {"id": "s3-ac3", "storyId": 3, "scenario": "Corpus text cannot inject markup", "given": "retrieved corpus text containing a script tag and an onerror payload", "when": "the text is rendered", "then": "it appears literally as text and no script executes", "and": "gate G-2 passes with its planted-violation self-test intact"},
    {"id": "s3-ac4", "storyId": 3, "scenario": "Unknown verdict fails at compile time", "given": "a verdict value outside the three known strings", "when": "the build runs", "then": "tsc --noEmit fails", "and": "the page never renders a silent fallback badge"},
    {"id": "s4-ac1", "storyId": 4, "scenario": "Keyless run is labelled PRECOMPUTED", "given": "no MIZAN_LLM_API_KEY is set", "when": "the CLI ask or demo command runs", "then": "the output is explicitly labelled PRECOMPUTED", "and": "no canned output is presented as live"},
    {"id": "s4-ac2", "storyId": 4, "scenario": "Keyed run is labelled live", "given": "a valid key and an allowlisted provider host", "when": "the CLI runs the live path", "then": "the output is labelled live", "and": "the page shows the same label for that result"},
    {"id": "s4-ac3", "storyId": 4, "scenario": "Provider failure degrades honestly", "given": "a keyed run where the provider times out at 30 seconds", "when": "the run completes", "then": "the surface shows model unavailable", "and": "the labelled PRECOMPUTED replay fallback is offered and nothing canned is shown as live"},
    {"id": "s4-ac4", "storyId": 4, "scenario": "Runbook orders live-first", "given": "the demo runbook", "when": "an operator follows it with a key set", "then": "step 1 is the live keyed path", "and": "replay is documented as the labelled fallback"},
    {"id": "s5-ac1", "storyId": 5, "scenario": "All surfaces carry the honest framing", "given": "slide 7 of both decks, README and docs", "when": "the sweep completes", "then": "each states 4 Sunan + Muwatta + Qur'an, 27,234 records", "and": "per-collection counts sum to 27,234 from data/registry"},
    {"id": "s5-ac2", "storyId": 5, "scenario": "Contradicting claim fails the docs gate", "given": "any doc claiming Bukhari or Muslim coverage", "when": "bun run check:docs runs", "then": "the gate exits non-zero naming the offending file", "and": "CI fails closed"},
    {"id": "s5-ac3", "storyId": 5, "scenario": "Counts stay machine-verified", "given": "data/registry/records.jsonl", "when": "the corpus is regrouped by collection", "then": "per-collection counts equal the published numbers", "and": "the total equals 27,234"},
    {"id": "s6-ac1", "storyId": 6, "scenario": "Headline number backed by committed executed artefact", "given": "the executed system-arm run", "when": "its output is committed to HEAD", "then": "the artefact records systemArmSource executed-verifier", "and": "every printed number traces to that artefact and check:docs passes"},
    {"id": "s6-ac2", "storyId": 6, "scenario": "One-sentence claim judge-legible in 60 seconds", "given": "the value-proof pack", "when": "a judge reads the first claim", "then": "it states the negative space in one sentence", "and": "it makes no answer-quality or retrieval-quality claim"},
    {"id": "s6-ac3", "storyId": 6, "scenario": "Unbacked number fails the gate", "given": "a number added without a committed artefact", "when": "check:docs runs", "then": "the gate exits non-zero naming the claim", "and": "CI fails closed"},
    {"id": "s6-ac4", "storyId": 6, "scenario": "Ledger demonstration is hash-chained and content-free", "given": "the ledger excerpt shown in the pack", "when": "inspected", "then": "entries carry questionHash and verdict only", "and": "no question text, corpus text, PII or key appears"},
    {"id": "s7-ac1", "storyId": 7, "scenario": "Every cited ADR ID resolves", "given": "about 30 source sites citing ADR-0x and ADR-Cx", "when": "the docs check runs", "then": "each cited ID maps to a file in docs/specs/adr/ and ADR-C1..C5 exist with status Accepted", "and": "check:docs passes"},
    {"id": "s7-ac2", "storyId": 7, "scenario": "Dangling citation fails the gate", "given": "a document citing ADR-C99 that does not exist", "when": "check:docs runs", "then": "the command exits non-zero naming the citation", "and": "CI fails closed"},
    {"id": "s7-ac3", "storyId": 7, "scenario": "ADR content matches recorded decisions", "given": "ADRs from the source specification", "when": "each file is read", "then": "context, decision, consequences and status fields are present", "and": "ADR-C1 states elision verdict equals UNVERIFIABLE"},
    {"id": "s8-ac1", "storyId": 8, "scenario": "External norms cited with sources", "given": "the credibility doc", "when": "it claims LCS 0.90 or strict-substring norms", "then": "each claim carries a resolvable citation", "and": "check:docs passes"},
    {"id": "s8-ac2", "storyId": 8, "scenario": "Third-party run committed and reproducible", "given": "a third-party system run through our verifier", "when": "the artefact is committed", "then": "it records system, dataset and verdict distribution", "and": "a missing artefact makes the docs gate fail"},
    {"id": "s8-ac3", "storyId": 8, "scenario": "Deadline non-submission disclosed", "given": "IslamicEval 2026 submission closed 2026-08-01", "when": "the doc is written", "then": "it never claims submission", "and": "it states the task is cited instead"},
    {"id": "s9-ac1", "storyId": 9, "scenario": "Licence gate passes then licensed ingest lands", "given": "a source with verified licence terms permitting ingestion", "when": "the ingest runs", "then": "every record carries attestation", "and": "counts are consistent across sources.json, deck and README"},
    {"id": "s9-ac2", "storyId": 9, "scenario": "Licence unclear then honest framing retained", "given": "ambiguous or restrictive licence terms", "when": "the gate runs", "then": "ingestion is refused and the decision is recorded", "and": "all claims remain 4 Sunan + Muwatta + Qur'an, 27,234 records"},
    {"id": "s9-ac3", "storyId": 9, "scenario": "Attestation mismatch aborts", "given": "an ingested batch whose attestation does not match", "when": "verification of the batch runs", "then": "the run aborts with a loud integrity error", "and": "no verdict or count is published from that batch"},
    {"id": "s9-ac4", "storyId": 9, "scenario": "Unattested record never reaches the registry", "given": "a fetched record without valid source attestation", "when": "the registry write is attempted", "then": "the record is rejected", "and": "the registry total changes only by attested records"},
    {"id": "s10-ac1", "storyId": 10, "scenario": "Every golden figure is qualified", "given": "README, deck, pack and one-pager", "when": "each golden 100% claim is inspected", "then": "the self-referential qualifier appears alongside it", "and": "the headline metric is the executed system-arm number"},
    {"id": "s10-ac2", "storyId": 10, "scenario": "Unqualified claim fails the gate", "given": "a new document printing golden 100% without the qualifier", "when": "check:docs runs", "then": "the command exits non-zero naming the file", "and": "CI fails closed"},
    {"id": "s10-ac3", "storyId": 10, "scenario": "One-pager matches DISCLOSURE.md", "given": "DISCLOSURE.md section 4 on replay disclosure", "when": "the one-pager is read", "then": "it repeats the same disclosure without contradiction", "and": "it contains no answer-quality claim"}
  ],
  "dependencies": [
    {"storyId": 1, "dependsOn": [], "type": "root", "rationale": "Commit hygiene is the #1 credibility risk (R1) and blocks every other story"},
    {"storyId": 2, "dependsOn": [1], "type": "blocking", "rationale": "Paraphrase code change must land on committed HEAD so the 26-case regression is judge-runnable"},
    {"storyId": 3, "dependsOn": [1], "type": "blocking", "rationale": "New page files must not create another untracked/stale-HEAD surprise"},
    {"storyId": 4, "dependsOn": [1, 3], "type": "blocking", "rationale": "CLI labelling needs committed HEAD; page labelling renders on Story 3's page"},
    {"storyId": 5, "dependsOn": [1], "type": "blocking", "rationale": "Docs sweep must run against committed files so the gate proves HEAD, not disk"},
    {"storyId": 6, "dependsOn": [1], "type": "blocking", "rationale": "System-arm numbers may only be claimed from committed artefacts"},
    {"storyId": 7, "dependsOn": [1], "type": "blocking", "rationale": "ADR files must be committed with the rest of the tree"},
    {"storyId": 8, "dependsOn": [6], "type": "blocking", "rationale": "External arm extends the value-proof pack and reuses its comparison table"},
    {"storyId": 9, "dependsOn": [5], "type": "blocking", "rationale": "Ingestion changes counts only after the honest-framing baseline is consistent everywhere"},
    {"storyId": 10, "dependsOn": [6], "type": "blocking", "rationale": "Qualifier sweep depends on the pack defining the system-arm headline"},
    {"storyId": 3, "dependsOn": [], "type": "shared", "rationale": "Shares render.ts verdict map and G-2 gate with Stories 1 and 4"},
    {"storyId": 2, "dependsOn": [], "type": "shared", "rationale": "Shares adjudication.json fixture and G-1 dependency gate with Story 9's attestation work"},
    {"storyId": 6, "dependsOn": [], "type": "shared", "rationale": "Shares scripts/benchmark/system-arm.ts with Story 8"},
    {"storyId": 4, "dependsOn": [], "type": "external", "rationale": "External provider host allowlist and exactly-4 env vars (A10)"},
    {"storyId": 9, "dependsOn": [], "type": "external", "rationale": "UmmahAPI/Sunnah.com licensing and availability (R12)"},
    {"storyId": 8, "dependsOn": [], "type": "external", "rationale": "IslamicEval/HUMAIN publications and any third-party system availability"}
  ]
}
```

## Specification
# CEO Strategic Review — mizan Value Validation & Gap Closure

## 1. Executive Summary

The feedback ("value is weak, any search tool can do this") conflates **retrieval** with **verification**. Market evidence confirms retrieval/answering is table stakes — but citation accuracy across search-class products is ~74% industry-wide (Tow Center: 8 engines wrong on >60% of 1,600 queries; Islamic citation scores 1.82–3.38/5), and **no competitor (Ansari, Fanar-Sadiq, UmmahAPI, Perplexity/Elicit) emits a computed, fail-closed, per-claim verdict**. That negative-space claim is mizan's real value — yet today it is *asserted in prose, not demonstrated*, and six load-bearing gaps give a judge legitimate grounds to dismiss it: (1) 57 changed + 38 untracked files mean HEAD ≠ what we claim; (2) paraphrase divergence — code says `REJECTED`, spec and 26 human rulings say `UNVERIFIABLE`; (3) zero UI against the "منتج متكامل قابل للتشغيل" requirement; (4) keyless `PRECOMPUTED` replay misread as "not real"; (5) golden 100% is self-referential; (6) no Bukhari/Muslim, no tafsir, no multilingual. This plan ships a **value-proof pack** plus gap closures in two sprints, scoped to the realistic fallback slice. **Expected impact:** a judge *sees* the badge computed on a page, *runs* the verdict path in CI, and hears one defensible sentence — "search attaches citations; mizan adjudicates them, fail-closed, with a hash-chained receipt" — backed by artefacts on HEAD, not on disk.

## 2. Business Value Analysis

**Primary driver:** credibility/defensibility (competition scoring, judge trust). **Secondary:** demonstration quality. Not revenue. **Thesis accepted:** we win on verification, never on fluency or retrieval — answer-quality claims are permanently out of scope.

### MoSCoW Classification

**Must Have**
1. Commit the entire working tree so HEAD equals what is claimed (R-5, #1 credibility risk); clean-tree CI green.
2. Mechanise paraphrase/elision → `UNVERIFIABLE`; code, spec, README and 26 adjudicated rulings must agree.
3. Minimal web page rendering the three badge lines as **text nodes** from the shared verdict map (G-2 safe) — satisfies "منتج متكامل قابل للتشغيل".
4. Honest corpus scope everywhere: "4 Sunan + Muwatta + Qur'an, 27,234 records"; slide 7 corrected; never claim Bukhari/Muslim unless actually ingested and attested.
5. Unambiguous live-vs-replay labelling (`PRECOMPUTED`) in CLI, page and demo runbook; demo with a key set.
6. Value-proof pack: one-sentence negative-space claim + committed executed-system-arm benchmark + red-team set + hash-chained ledger.
7. Golden 100% always qualified as self-referential; headline number is the executed system arm.
8. `bun run ci` green on clean HEAD (<5 min) including gates G-1…G-7 and docs-claims over all new copy.

**Should Have**
1. Licensed Bukhari + Muslim ingestion with attestation — or an explicit licence-clean decision to keep framing (fallback is honest and acceptable).
2. ADR files resolving the ~30 dangling `ADR-0x` citations (`docs/specs/adr/` = 0 files).
3. External credibility arm: cite IslamicEval/HUMAIN norms (LCS 0.90 / strict substring) or run a third party through our verifier.
4. Demo runbook: live keyed path first, labelled replay as fallback.

**Could Have**
1. Perplexity-style layered trust chips beyond the three lines (text nodes, G-2 safe).
2. Read-only MCP/OpenAPI endpoint (table stakes, not needed for judging this cycle).
3. Arabic web UI (Arabic deck exists; extend to the page).
4. Hash-only transcript/trace view in the UI.

**Won't Have (this time)**
1. Answer/retrieval-quality claims or competing with Ansari/Fanar on generation.
2. Fuzzy/embedding verification thresholds (ADR-03 fabrication hole).
3. Tafsir display without a real backend (§16 — typed `unavailable` stays).
4. 25+ language support.
5. IslamicEval 2026 submission (deadline passed 2026-08-01) — cite the task instead.
6. Any corpus collection beyond the Should-1 licensed scope.

## 3. Risk Register

| # | Risk | Category | Severity | Mitigation |
|---|------|----------|----------|------------|
| R1 | Dirty tree (57 changed/38 untracked): judge clones HEAD, sees stale system-arm numbers or missing features | Business/Credibility | **Critical** | Commit first; `bun run ci` on clean tree; claim numbers only from committed artefacts |
| R2 | Paraphrase divergence: code `REJECTED` vs spec + 26 rulings `UNVERIFIABLE` | Product integrity | High | Mechanise at anchor step; 26-case regression; docs sweep removes "decided, not yet mechanised" |
| R3 | No UI fails "runnable integrated product"; CLI loses to interactive demos | Business | High | One static text-node page reusing `render.ts` map; demo on it |
| R4 | XSS via corpus/model text on the new page | **Security (A03)** | High | Text nodes only; G-2 gate already scans tree in CI; planted-violation self-test kept; no framework sinks |
| R5 | SSRF via provider base URL | **Security (A10/R13)** | Medium | Host allowlist stays in code (https, no redirects); regression test; exactly 4 env vars |
| R6 | Secret leakage in demo/deck/history | **Security (A05/A07)** | Medium | G-4 gitleaks on tree + history pre-submission; `.env*` gitignored; no key in logs/traces/ledger (§13) |
| R7 | Prompt injection through retrieved corpus text | **Security (A03)** | Medium | Prompt advisory only (§12); corpus fenced, length-capped, data-only; verifier is sole authority |
| R8 | Live provider fails during demo | **Reliability** | Medium | 30s timeout → `model unavailable`; labelled `PRECOMPUTED` fallback; never canned-as-live |
| R9 | Verification path crashes or passes without evidence | **Reliability** | High | Fail closed (§3): timeout/malformed → `unverifiable`; ledger failure → untrusted; attestation mismatch → abort; regression tests for new paraphrase path |
| R10 | `PRECOMPUTED` read as "not real" | Business | High | Explicit labels in CLI + page + runbook; DISCLOSURE.md §4; demo with key set |
| R11 | Golden 100% overclaimed (self-referential) | Business | Medium | Docs-claims gate + oral one-pager; system-arm number is the headline |
| R12 | Bukhari/Muslim licensing unclear | Dependency/Legal | Medium | Licence check before ingest; fallback = honest 27,234 framing (arithmetically verified) |
| R13 | Scope vs capacity (spec v4 Sprint 1 ≈13.5 person-months) | Business | High | Fallback slice 1.1→1.2→1.3→1.6→1.8; ≤10 stories; 2 sprints |
| R14 | Effect 4.0.0-beta.83 API drift | Technical | Low | Pinned version; single decode adapter (§1) |
| R15 | ~30 dangling ADR citations undermine docs credibility | Documentation | Medium | Write ADR files this cycle; docs gate covers new claims |

## 4. Epics

- **E1 — Value Repositioning & Proof.** One-sentence claim + evidence pack (executed system-arm, red-team set, ledger, industry comparison). *Metrics:* docs-claims green for every number; executed-verifier artefact committed; zero overclaim findings; claim answerable by a judge in ≤60s.
- **E2 — Verdict Consistency (paraphrase).** Mechanise elision → `UNVERIFIABLE`. *Metrics:* 26/26 adjudicated cases match code; README/anchor-protocol no longer state a divergence; verdict-map test covers all three badge strings; `mizan-verify` still has exactly one dependency.
- **E3 — Runnable Product Surface.** Static text-node page + live/replay labelling. *Metrics:* page renders three badge lines from the shared map; G-2 green with self-test intact; zero raw-HTML sinks; CLI+page both label `PRECOMPUTED` vs live; page loads offline.
- **E4 — Credibility Hardening.** Commit, clean CI, resolvable ADRs, benchmark honesty. *Metrics:* clean-HEAD `bun run ci` <5 min green on ubuntu+windows; every cited ADR ID resolves; golden claim carries the qualifier wherever printed.
- **E5 — Corpus Scope Resolution.** Licensed Bukhari/Muslim *or* uniform honest framing. *Metrics:* `check:docs` finds no contradicting corpus claim; if ingested — attested records, counts consistent across sources.json, deck, README.

## 5. Security Requirements

- **A03 Injection:** corpus/model text as DOM text nodes only; no `innerHTML`/`dangerouslySetInnerHTML`/`{@html`/`document.write` — enforced by G-2 with planted-violation self-test.
- **A10 SSRF:** provider host allowlist in code, https-only, no redirects; env surface exactly 4 vars.
- **A05/A07:** no auth system (local CLI + static read-only page, single user); G-4 gitleaks tree+history; `.env*` gitignored.
- **A09 Logging:** traces/logs/ledger carry hashes only (`questionHash`), never question/corpus text (§13).
- **Data sensitivity:** low PII, high integrity/reputational — the protected asset is the verdict's credibility. **Auth model:** none; single-user local surface.

## 6. Reliability Requirements

- **Fail closed (§3):** zero evidence blocks `verified`; resolved id with no matching quote → `unverifiable` (`no_matching_evidence`); attestation mismatch aborts; ledger write failure → run untrusted.
- **Timeouts:** provider 30s → `model unavailable`; verification timeout → `unverifiable`. No path returns a fabricated state.
- **Retry:** verification never retries into a different verdict (determinism); provider failure degrades per §16 with labelled replay fallback.
- **Blast radius:** page failure doesn't affect CLI (CLI is primary); provider failure affects only live mode; unknown verdict is a compile error, not a silent `UNVERIFIABLE`.

## 7. ADRs (recorded)

- **ADR-C1 — Elision verdict = `UNVERIFIABLE`.** *Context:* spec + 26 human rulings say unverifiable; code says rejected. *Decision:* align code to adjudicated rulings at the anchor step. *Rationale:* an elided paraphrase has no matching evidence, not disproof; consistency is scored. *Consequences:* divergence language removed from docs/README; one regression suite owns the 26 cases. *Status:* **Accepted**.
- **ADR-C2 — Value = computed per-claim verdict, not answer quality.** *Rationale:* retrieval is table stakes (~74% citation accuracy industry-wide); verification-with-abstention is the unsolved gap. *Consequences:* no fluency/answer-quality claims, ever. *Status:* **Accepted**.
- **ADR-C3 — UI is a static, framework-free, text-node page consuming the shared verdict map.** *Rationale:* G-2 compatibility, no bundler, CI budget, YAGNI — frameworks reintroduce HTML sinks. *Consequences:* rich interactivity deferred to Could. *Status:* **Accepted**.
- **ADR-C4 — Corpus scope: honest framing first; collections only via licensed, attested sources.** *Rationale:* unlicensed/unattested imports would break attestation and ledger guarantees. *Consequences:* slide 7 claims "4 Sunan + Muwatta + Qur'an, 27,234 records" until ingestion lands. *Status:* **Accepted**.
- **ADR-C5 — Headline metric = executed system-arm; golden 100% always qualified.** *Rationale:* self-referential golden reads weak by 2026 external-benchmark norms. *Consequences:* oral script and docs carry the qualifier. *Status:* **Accepted**.

## 8. Sprint Backlog (2 sprints, 10 stories)

**Sprint 1 (Must):**

| # | Story | Size | Risk | Deps |
|---|-------|------|------|------|
| 1 | Commit working tree + clean-tree CI green | S | Critical | — |
| 2 | Mechanise paraphrase → `UNVERIFIABLE` + 26-case regression + docs sweep | M | High | 1 |
| 3 | Static text-node web page from shared verdict map (G-2 safe) | M | Medium | 1 |
| 4 | Live-vs-replay labelling in CLI + page + demo runbook | S | Medium | 1 (UI half: 3) |
| 5 | Corpus-scope honesty sweep: slide 7, README, docs-claims | S | Medium | 1 |
| 6 | Value-proof pack: committed executed system-arm + one-sentence claim + comparison table | M | High | 1 |
| 7 | Write ADR-C1..C5 files resolving dangling citations | S | Low | 1 |

**Sprint 2 (Should/Could):**

| # | Story | Size | Risk | Deps |
|---|-------|------|------|------|
| 8 | External credibility arm (IslamicEval/HUMAIN norms cited, or third-party run through verifier) | M | Medium | 6 |
| 9 | Licensed Bukhari/Muslim ingestion with attestation (licence check gate first) | L | High | 5 — fallback: honest framing |
| 10 | Golden-100% qualifier sweep + oral one-pager | S | Low | 6 |

---

**Wiki spec written:** `spec-value-validation-2026-09-29` (tags: spec, value-validation, priority-must) — includes full risk register, success metrics, ADR-C1..C5; linked to `research-market-value-review-2026-09-29`.

**Delegation to PM:**
- **Request & value:** Answer the "useless vs any search tool" critique by proving (not asserting) the computed fail-closed verdict, and close six load-bearing gaps (commit hygiene, paraphrase consistency, UI, replay labelling, overclaim framing, corpus scope).
- **Wiki:** `spec-value-validation-2026-09-29`.
- **MoSCoW order:** all 8 Must stories in Sprint 1 (priority 1→7 as listed); Should in Sprint 2; Could/Won't deferred with explicit disclosure.
- **Top risks:** R1 uncommitted HEAD (Critical — commit is story 1, blocks everything), R2 paraphrase inconsistency (High), R4 XSS on new page (High — text nodes only, G-2 enforced), R9 fail-closed regression (High), R13 capacity (High — ≤10 stories, 2 sprints).
- **Success thresholds:** 26/26 elision cases match; clean-HEAD CI <5 min green; every ADR citation resolves; every printed number passes docs-claims; page renders three badge lines offline; zero raw-HTML sinks.
- **NFRs:** performance (static page, <5 min CI), security (A03/A05/A07/A09/A10 above), scalability (N/A — single user), reliability (§6 fail-closed table), observability (hash-only traces with `questionHash` + verdict + provider mode; ledger per run; per-package gate results; UI provider-mode label).
- **Security:** OWASP A03 (text-node rendering), A10 (code-side host allowlist), A05/A07 (no auth, gitleaks), A09 (hash-only logs); data sensitivity low-PII/high-integrity; auth model: none (local read-only surface).
- **Reliability:** fail-closed everywhere; 30s provider timeout → `model unavailable`; verification timeout → `unverifiable`; no retry-into-different-verdict; labelled `PRECOMPUTED` fallback for demos.
- **Observability:** run traces (hash-only), verdict distribution, provider mode indicator, ledger write status, CI gate reporting per package.

```json
{
  "executiveSummary": "The 'value is weak, any search tool can do this' feedback conflates retrieval with verification: market evidence shows search-class products attach citations at ~74% accuracy (Tow Center: 8 engines wrong on >60% of 1,600 queries; Islamic citation scores 1.82-3.38/5) and no competitor (Ansari, Fanar-Sadiq, UmmahAPI, Perplexity/Elicit) emits a computed fail-closed per-claim verdict - mizan's defensible value is exactly that negative-space claim, currently asserted in prose rather than demonstrated. This plan (a) ships a value-proof pack (one-sentence claim + committed executed-system-arm benchmark + red-team set + hash-chained ledger) and (b) closes the six load-bearing gaps that let a judge dismiss the project: uncommitted 57-file working tree so HEAD does not match claims, paraphrase REJECTED-vs-UNVERIFIABLE inconsistency with 26 adjudicated rulings, zero UI against the 'integrated runnable product' requirement, PRECOMPUTED replay misread as fake, self-referential golden 100%, and absent Bukhari/Muslim plus out-of-scope tafsir/multilingual. Expected impact: a judge sees the badge computed on a static text-node page, runs the same verdict path in clean CI, and hears one defensible sentence backed by artefacts on HEAD - converting the critique from a fatal objection into the product's headline.",
  "moscow": {
    "must": [
      "Commit the entire working tree so HEAD equals what is claimed (R-5 #1 credibility risk); clean-tree bun run ci green",
      "Mechanise paraphrase/elision to UNVERIFIABLE at the anchor step so code, spec, README and the 26 adjudicated human rulings agree",
      "Ship a minimal web page rendering the three badge lines as DOM text nodes from the shared render.ts verdict map (G-2 safe), satisfying 'منتج متكامل قابل للتشغيل'",
      "Honest corpus scope everywhere: '4 Sunan + Muwatta + Qur'an, 27,234 records'; slide 7 corrected; never claim Bukhari/Muslim unless actually ingested and attested",
      "Unambiguous live-vs-replay labelling (PRECOMPUTED) in CLI, web page and demo runbook; demo runs with a key set on the live path",
      "Value-proof pack: one-sentence negative-space claim plus committed executed-system-arm benchmark (systemArmSource executed-verifier), red-team set and hash-chained ledger demonstration",
      "Golden 100% always qualified as self-referential; headline metric is the executed system arm, never the golden number alone",
      "bun run ci green on clean HEAD under 5 minutes including gates G-1..G-7 and docs-claims over all new copy"
    ],
    "should": [
      "Licensed Bukhari + Muslim ingestion with attestation (UmmahAPI/Sunnah.com) OR an explicit licence-clean decision to keep honest framing as the accepted fallback",
      "ADR files written into docs/specs/adr/ resolving the ~30 dangling ADR-0x citations",
      "External credibility arm: cite IslamicEval 2025 / HUMAIN norms (LCS 0.90 strict substring) or run a third-party system through our verifier",
      "Demo runbook: live keyed provider path first, labelled PRECOMPUTED replay as fallback"
    ],
    "could": [
      "Perplexity-style layered trust chips beyond the three badge lines (text nodes, G-2 safe)",
      "Read-only MCP/OpenAPI endpoint (table stakes but not required for judging this cycle)",
      "Arabic web UI extending the existing Arabic deck to the page",
      "Hash-only transcript/trace view inside the UI"
    ],
    "wont": [
      "Answer-quality or retrieval-quality claims; competing with Ansari/Fanar on generation",
      "Fuzzy or embedding-similarity verification thresholds (ADR-03 fabrication-acceptance hole)",
      "Tafsir display without a real backend (section 16; typed unavailable stays)",
      "25+ language support this cycle",
      "IslamicEval 2026 submission (deadline passed 2026-08-01) - cite the task instead",
      "Any corpus collection beyond the licensed Bukhari/Muslim scope in Should-1"
    ]
  },
  "riskRegister": [
    {"id": "R1", "risk": "Working tree dirty (57 changed, 38 untracked): a judge clones HEAD and sees stale system-arm numbers or missing features", "category": "Business/Credibility", "severity": "Critical", "mitigation": "Commit first; run bun run ci on the clean tree; claim numbers only from committed artefacts"},
    {"id": "R2", "risk": "Paraphrase divergence: code emits REJECTED while spec and 26 human rulings say UNVERIFIABLE", "category": "Product integrity", "severity": "High", "mitigation": "Mechanise at the anchor step between step 5b and 6; 26-case regression test; docs sweep removes 'decided, not yet mechanised'"},
    {"id": "R3", "risk": "No UI fails the integrated-runnable-product requirement; CLI loses to interactive competitor demos", "category": "Business", "severity": "High", "mitigation": "One static framework-free text-node page reusing the shared verdict map; demo on it"},
    {"id": "R4", "risk": "XSS via corpus or model text on the new web page", "category": "Security", "severity": "High", "mitigation": "Text nodes only; existing G-2 gate scans the tree in CI with planted-violation self-test; no framework or innerHTML sinks (OWASP A03)"},
    {"id": "R5", "risk": "SSRF via attacker-influenced provider base URL", "category": "Security", "severity": "Medium", "mitigation": "Host allowlist stays in code (https, no redirects, R13); regression test retained; exactly 4 env vars (OWASP A10)"},
    {"id": "R6", "risk": "Secret leakage in demo, deck or git history", "category": "Security", "severity": "Medium", "mitigation": "G-4 gitleaks on working tree and history pre-submission; .env* gitignored; no key in logs/traces/ledger per section 13 (OWASP A05/A07/A09)"},
    {"id": "R7", "risk": "Prompt injection through retrieved corpus text", "category": "Security", "severity": "Medium", "mitigation": "Prompt treated as advisory only (section 12); corpus fenced, length-capped, data-only; verifier is the sole authority (OWASP A03)"},
    {"id": "R8", "risk": "Live provider fails during the demo", "category": "Reliability", "severity": "Medium", "mitigation": "30s timeout yields model unavailable; labelled PRECOMPUTED replay fallback; never present canned output as live per section 16"},
    {"id": "R9", "risk": "Verification path crashes or returns verified without evidence", "category": "Reliability", "severity": "High", "mitigation": "Fail closed: timeout/malformed yields unverifiable; ledger write failure marks run untrusted; attestation mismatch aborts; regression tests cover the new paraphrase path"},
    {"id": "R10", "risk": "PRECOMPUTED default read by judges as 'not real AI'", "category": "Business", "severity": "High", "mitigation": "Explicit labels in CLI, page and runbook; DISCLOSURE.md section 4; run the demo with a key set"},
    {"id": "R11", "risk": "Golden 100% overclaimed orally or in copy (self-referential vs itself)", "category": "Business", "severity": "Medium", "mitigation": "Docs-claims gate plus oral one-pager discipline; executed system-arm number is the headline (ADR-C5)"},
    {"id": "R12", "risk": "Bukhari/Muslim licensing terms unclear before ingest", "category": "Dependency/Legal", "severity": "Medium", "mitigation": "Licence check gates ingestion; fallback is the verified honest framing '4 Sunan + Muwatta + Qur'an, 27,234 records' (ADR-C4)"},
    {"id": "R13", "risk": "Scope exceeds capacity (spec v4 Sprint 1 is ~13.5 person-months)", "category": "Business", "severity": "High", "mitigation": "Fallback slice 1.1 to 1.2 to 1.3 to 1.6 to 1.8; max 10 stories; 2 sprints only"},
    {"id": "R14", "risk": "Effect 4.0.0-beta.83 API drift breaking decode seam", "category": "Technical", "severity": "Low", "mitigation": "Version pinned in deps and CI; single adapter in src/schema/decode.ts per section 1"},
    {"id": "R15", "risk": "About 30 dangling ADR citations undermine documentation credibility", "category": "Documentation", "severity": "Medium", "mitigation": "Write ADR-C1..C5 files this cycle (Should-2); docs gates cover every new claim"}
  ],
  "epics": [
    {"id": "E1", "title": "Value Repositioning and Proof", "goal": "Answer the 'useless vs any search tool' critique with a one-sentence negative-space claim backed by committed evidence: executed system-arm benchmark, red-team set, hash-chained ledger, industry comparison table", "successMetrics": ["docs-claims gate green for every printed number", "executed-verifier artefact committed to HEAD", "zero overclaim findings in docs audit", "judge can grasp the claim in 60 seconds"]},
    {"id": "E2", "title": "Verdict Consistency (paraphrase)", "goal": "Mechanise elision/resolved-anchor-without-quote to UNVERIFIABLE so code, spec, README and human adjudication agree", "successMetrics": ["26/26 adjudicated elision cases match code behaviour", "README and anchor-protocol no longer publish a divergence", "verdict-map test covers all three badge strings", "mizan-verify still declares exactly one dependency"]},
    {"id": "E3", "title": "Runnable Product Surface", "goal": "Static text-node web page rendering the three badge lines plus unambiguous live-vs-replay labelling in CLI, page and runbook", "successMetrics": ["page renders three badge lines from the shared verdict map", "G-2 green with planted-violation self-test intact", "zero raw-HTML sinks in the tree", "CLI and page both label PRECOMPUTED vs live", "page loads offline with no network calls"]},
    {"id": "E4", "title": "Credibility Hardening", "goal": "Commit hygiene, clean CI on HEAD, resolvable ADR citations, benchmark honesty", "successMetrics": ["clean-HEAD bun run ci under 5 min green on ubuntu and windows matrix", "every cited ADR ID resolves to a file", "golden claim carries the self-referential qualifier wherever printed"]},
    {"id": "E5", "title": "Corpus Scope Resolution", "goal": "Either licensed and attested Bukhari/Muslim ingestion or uniform honest framing across slide 7, README and docs", "successMetrics": ["check:docs finds no contradicting corpus claim", "if ingested: records attested and counts consistent across sources.json, deck and README"]}
  ],
  "sprintBacklog": [
    {"id": 1, "title": "Commit the entire working tree and get clean-tree CI green", "sprint": 1, "priority": "must", "complexity": "S", "risk": "Critical", "dependencies": []},
    {"id": 2, "title": "Mechanise paraphrase/elision to UNVERIFIABLE with 26-case regression and docs sweep", "sprint": 1, "priority": "must", "complexity": "M", "risk": "High", "dependencies": [1]},
    {"id": 3, "title": "Static text-node web page consuming the shared verdict map (G-2 safe)", "sprint": 1, "priority": "must", "complexity": "M", "risk": "Medium", "dependencies": [1]},
    {"id": 4, "title": "Live-vs-replay labelling in CLI, web page and demo runbook", "sprint": 1, "priority": "must", "complexity": "S", "risk": "Medium", "dependencies": [1, 3]},
    {"id": 5, "title": "Corpus-scope honesty sweep: slide 7, README, docs-claims for the 27,234 framing", "sprint": 1, "priority": "must", "complexity": "S", "risk": "Medium", "dependencies": [1]},
    {"id": 6, "title": "Value-proof pack: committed executed system-arm, one-sentence claim, competitor comparison table", "sprint": 1, "priority": "must", "complexity": "M", "risk": "High", "dependencies": [1]},
    {"id": 7, "title": "Write ADR-C1..C5 files resolving the dangling ADR citations", "sprint": 1, "priority": "must", "complexity": "S", "risk": "Low", "dependencies": [1]},
    {"id": 8, "title": "External credibility arm: cite IslamicEval/HUMAIN norms or run a third-party system through our verifier", "sprint": 2, "priority": "should", "complexity": "M", "risk": "Medium", "dependencies": [6]},
    {"id": 9, "title": "Licensed Bukhari/Muslim ingestion with attestation, gated by a licence check (fallback: honest framing)", "sprint": 2, "priority": "should", "complexity": "L", "risk": "High", "dependencies": [5]},
    {"id": 10, "title": "Golden-100% qualifier sweep and oral one-pager aligned with DISCLOSURE.md", "sprint": 2, "priority": "should", "complexity": "S", "risk": "Low", "dependencies": [6]}
  ],
  "adrs": [
    {"id": "ADR-C1", "title": "Elision verdict is UNVERIFIABLE, not REJECTED", "context": "The spec and 26 adjudicated human rulings in data/eval/adjudication.json say paraphrase/elision is unverifiable, while verify.ts still returns rejected between step 5 and step 6", "decision": "Align code to the adjudicated human rulings: a resolved id whose record lacks the quote returns UNVERIFIABLE with reason no_matching_evidence, mechanised at the anchor step", "rationale": "An elision has no matching evidence, not a disproof; verdict consistency between spec, docs and code is directly scored and the human rulings are the ground truth", "consequences": "Divergence language removed from README and docs/anchor-protocol.md; the 26 cases become an owned regression suite; verdict mapping stays a compile-time-complete function", "status": "Accepted"},
    {"id": "ADR-C2", "title": "Value proposition is the computed per-claim verdict, never answer quality", "context": "Feedback claims the project is achievable by any search tool; market research shows retrieval is table stakes while verification-with-abstention is unsolved", "decision": "Position and scope mizan exclusively on the computed, fail-closed, hash-chained per-claim verdict plus the red-team set; answer and retrieval quality claims are permanently out of scope", "rationale": "Industry citation accuracy is ~74% and Islamic citation scores run 1.82-3.38/5; no competitor emits a computed fail-closed verdict, and competing on generation would lose", "consequences": "No fluency, benchmark-of-answers or scale claims in deck, README or demo; benchmark comparisons must use the verifier path only", "status": "Accepted"},
    {"id": "ADR-C3", "title": "Web UI is a static framework-free text-node page consuming the shared verdict map", "context": "There is no HTML anywhere in the repo; gate G-2 already bans innerHTML, dangerouslySetInnerHTML, {@html and document.write across the tree", "decision": "Add one static page that renders the three badge lines as text nodes from the same verdict map as apps/cli/src/render.ts, with no bundler and no UI framework", "rationale": "G-2 compatibility, no new dependency surface, CI budget under 5 minutes, YAGNI - frameworks reintroduce the HTML sinks the gate exists to forbid", "consequences": "Rich interactivity deferred to the Could list; any number printed on the page enters the docs-claims gate", "status": "Accepted"},
    {"id": "ADR-C4", "title": "Corpus scope: honest framing first; collections added only via licensed attested sources", "context": "All 27,234 records are quran 6236 + nasai 5672 + abudawud 5272 + ibnmajah 4336 + tirmidhi 3889 + malik 1829; Bukhari and Muslim are absent at record level; UmmahAPI/Sunnah.com offer them", "decision": "All public claims state '4 Sunan + Muwatta + Qur'an, 27,234 records' until a licensed, attested Bukhari/Muslim ingest actually lands", "rationale": "An unlicensed or unattested import would break the attestation and ledger guarantees that are the product's whole claim; the honest framing is arithmetically verified", "consequences": "Slide 7 and README carry the honest framing; Should-9 owns ingestion with a licence gate and honest-framing fallback", "status": "Accepted"},
    {"id": "ADR-C5", "title": "Headline metric is the executed system-arm benchmark; golden 100% always qualified", "context": "Golden 100% is measured against itself rather than human labels; README discloses this but oral delivery may overclaim; executed system-arm results exist only in the uncommitted tree", "decision": "Commit the executed-verifier system-arm artefact and make it the headline number; the golden figure may never appear without its self-referential qualifier", "rationale": "By 2026 norms leaders lean on externally run evals; a self-referential golden reads weak and an unqualified claim is a scoring risk", "consequences": "Docs-claims gate and oral one-pager enforce the qualifier; E1/E4 own the committed benchmark artefact", "status": "Accepted"}
  ]
}
```

## Architecture
The architecture plan is written to the wiki as **`arch-value-validation-impl-2026-09-30`** (tags: architecture, value-validation, implementation-plan, ready-for-development), linked to `spec-value-validation-2026-09-29` and `research-market-value-review-2026-09-29`. Summary:

## 1. Executive Summary
The working tree is already fully green (`bun run ci` = **152.6s**, all gates + docs + ledger + runs + ingest checks pass on HEAD `cdc34c5`), so Sprint 1 is activation/packaging/docs of mechanisms that exist — not new verification logic. Three decisions: **(D1)** Story 2 completes by wiring the eval harness to the existing inert step-5b anchor arm — 66 human-drawn spans in the guarded literals module, new optional `EvalCase.anchorText`, flip the 26 `elide_middle` expectations to `unverifiable/no_matching_evidence`, retire `knownDivergence`, and rewrite eval tests to the **movement contract** (26/26 three-way agreement; observed 40-case `rejected→unverifiable` movement must equal the published `redTeamMovement{40,0}`), while the benchmark stays anchorless so `systemDetectionRate: 1` survives with the anchored-path cost disclosed beside it. **(D2)** Story 3 ships `apps/web` as hermetic codegen — committed fixture decoded via `decodeOrFail`, static HTML from a badge map moved verbatim to `@mizan/core/src/badges.ts`, no framework/client JS (ADR-C3), gates widened to `.html` (safe: G-2 matches sink tokens, not tags; zero legacy HTML). **(D3)** No new gate IDs (machine-checked claim) — every new check is a pure docs rule (R9…R14) or planted-violation test; Story 7 writes the **11 ADR files** that make every citation outside `specs/` resolve.

## 2–5. Codebase / Modules / APIs / Data
Sprint 1 touches: `schema/eval.ts` (+`anchorText`, optional `knownDivergence`, v2), `scripts/eval/{adjudication,build,plan}.ts`, regenerated eval sets (golden counts → 94/40/66), `eval.test.ts` rewrites, `badges.ts` move, new `apps/web` workspace (encoder/page/build/fixture/tests), gate `scan.ts`/`docs-gates.ts`/`g7-DISPLAY_PATH`/`docs-claims.ts`, `docs/demo-runbook.md`, `docs/value-proof.md`, `docs/specs/adr/ADR-{02,03,04,05,06,11,C1..C5}.md`, deck/README framing. Sprint 2: credibility doc, licence-gated adapters (or honest-framing fallback), qualifier sweep + oral one-pager. APIs specified with signatures in §4 of the wiki; `adjudication.json` is never modified.

## 6–10. Errors / Security / Patterns / Tests / Performance
Fail-closed tables mapped to §16 (staleness → named red, bad anchor → arm skipped → `rejected`, movement mismatch → fail naming cases, fixture decode → build fails). OWASP A03/A05/A07/A09/A10 + CWE-345 addressed architecturally (one encoder, hashes-only ledger strip, 4 env vars unchanged, no outbound calls in Sprint 1, arm type admits only `unverifiable|null`). Patterns: single-source-of-truth map move, codegen-over-framework, adapter registry, planted self-test pairs, structural impossibility over convention. Testing: movement contract, byte-staleness both layers, XSS/offline/parity suites, R9…R14 planted pairs with fragment-concat trap tokens, full-CI timing per story. CI budget: 152.6s baseline, ≤+25s estimated, 300s gate.

## 11–12. Risks / Trends
Top risks: eval regen lockstep, movement≠40 (human redraw, never code adjust), `.html` widening (self-tested), ADR legacy content sourcing, capacity (fallback slice `1→2→6→7→5→4→3→10`, must-keep 1/2/3). Trends applied: external-eval norms (HUMAIN strict-substring), LLM-as-judge distrust, Perplexity-style trust layering as text nodes, evidence-gated docs inside the existing rule engine, MCP deferred-and-disclosed, zero new dependencies.

```json
{"office_fact_memory":[{"fact":"The anchor arm at packages/mizan-verify/src/verify.ts step 5b (anchoredOutcome) is implemented but inert: Claim.anchor is optional and no producer emits it. Activation per verify.ts/comments and docs/anchor-protocol.md needs 66 human-drawn anchor spans (26 golden elisions + 40 red-team), a new EvalCase.anchorText field stamped by scripts/eval/build.ts, flipping plan.ts elide_middle expectations to unverifiable/no_matching_evidence, retiring EvalSet.knownDivergence, and asserting observed movement against the published redTeamMovement {rejectedToUnverifiable:40, falseVerifiedDelta:0} in data/eval/adjudication.json. The benchmark (scripts/benchmark/system-arm.ts SystemCase) has no anchor field and must stay anchorless so systemDetectionRate:1 survives.","phase":"at","evidence":"verify.ts lines 36-41 + anchoredOutcome 240-250; schema/anchor.ts RedTeamMovement docs; eval.test.ts claimsOf line 124-125; adjudication.json inspected","confidence":0.95},{"fact":"Gate count G-1..G-7 is a published machine-checked claim (GATE_IDS in packages/mizan-gate/src/run-gates.ts + docs-gates.ts rule R8), so new checks must be docs-claims rules or tests, never an 8th gate. G-2/scan.ts CODE_EXTENSIONS is [\".ts\",\".tsx\"] so .html is currently invisible to all gates, and G-2 matches sink tokens (innerHTML etc.), not html tags, making a .html extension safe; GATE_CLAIM_EXTENSIONS = [.md,.mdx,.txt,.yml,.yaml,.json,.ts,.tsx].","phase":"at","evidence":"run-gates.ts GATES table; docs-gates.ts exports; g2-no-raw-html.ts HTML_SINKS token rules","confidence":0.93},{"fact":"Full CI baseline on the working tree (HEAD cdc34c5, 57 modified + 38 untracked, branch main, remote github.com/mossaudi/mizan) is GREEN in 152.6s including check:docs, verify:runs, verify:ledger and ingest:check; data/corpus.db (81MB) and .env are gitignored while .env.example, data/eval/*, data/benchmark/vs-search.json and specs/ are tracked/untracked-pending-commit.","phase":"at","evidence":"bun run ci executed end-to-end this session; git status and git check-ignore inspected","confidence":0.9}]}
```

```json
{
  "moduleStructure": [
    {"path": "packages/mizan-core/src/badges.ts", "action": "create", "responsibility": "VERDICT_GLYPH + badgeFor moved verbatim from apps/cli/src/render.ts:83; single source of truth for glyph strings (S3)"},
    {"path": "packages/mizan-core/src/schema/eval.ts", "action": "modify", "responsibility": "EvalCase.anchorText?: string (present iff adjudicated, 66 cases); EvalSet.knownDivergence -> optional; schemaVersion 1->2 (S2)"},
    {"path": "packages/mizan-core/src/schema/web-example.ts", "action": "create", "responsibility": "WebExample fixture contract decoded via decodeOrFail at the web build boundary (S3/S4)"},
    {"path": "scripts/eval/adjudication.ts", "action": "modify", "responsibility": "CLAIM_ANCHOR_TEXTS: 66 human-drawn 3-8 word spans as literals; stays under the existing no-@mizan/verify textual guard (S2)"},
    {"path": "scripts/eval/build.ts", "action": "modify", "responsibility": "join spans by caseId -> EvalCase.anchorText iff adjudicated; regenerate sets via bun run build:eval (S2)"},
    {"path": "scripts/eval/plan.ts", "action": "modify", "responsibility": "elide_middle expectedVerdict -> unverifiable / expectedReason -> no_matching_evidence; delete KNOWN_DIVERGENCE (S2)"},
    {"path": "data/eval/{golden-normalization,redteam-fabricated}.json", "action": "regenerate", "responsibility": "golden verdictCounts -> {verified:94,rejected:40,unverifiable:66}, stamps null, header knownDivergence omitted; red-team expectations stay rejected:40; adjudication.json NEVER modified"},
    {"path": "apps/cli/test/eval.test.ts", "action": "modify", "responsibility": "claimsOf attaches anchor: entry.anchorText; replace divergence block/DIVERGENCE_TARGET with movement contract: 26/26 three-way agreement, observed movement == redTeamMovement(40), observed verified == falseVerifiedDelta(0) (S2)"},
    {"path": "packages/mizan-verify/test/*", "action": "extend", "responsibility": "planted regression: anchorless elision still rejected (arm stays opt-in); verifier source untouched, dep list stays exactly @mizan/core"},
    {"path": "apps/cli/src/render.ts", "action": "modify", "responsibility": "re-import glyph map from @mizan/core; byte-identical CLI output guarded by existing cli.test/demo.test"},
    {"path": "apps/web/{package.json,tsconfig.json,src/encoder.ts,src/page.ts,build.ts,test/page.test.ts}", "action": "create", "responsibility": "workspace @mizan/web (dep @mizan/core only): total escapeText entity encoder, renderPage(text-nodes only, badgeFor from core), deterministic build -> public/index.html, tests for staleness/payload/parity/offline/XSS/PRECOMPUTED label (S3/S4)"},
    {"path": "apps/web/{data/example-report.json,public/index.html}", "action": "create (generated, committed)", "responsibility": "PRECOMPUTED-labelled fixture + static page; both byte-staleness tested, CI never overwrites them"},
    {"path": "apps/cli/scripts/make-web-fixture.ts + apps/cli/test/web-fixture.test.ts", "action": "create", "responsibility": "runs the offline demo pipeline (make-transcript.ts precedent) -> writes fixture; freshness test regenerates and compares bytes (S3)"},
    {"path": "packages/mizan-gate/src/{scan.ts,docs-gates.ts}", "action": "modify", "responsibility": "CODE_EXTENSIONS += .html (G-2 sink-token scan reaches the page) and GATE_CLAIM_EXTENSIONS += .html; self-test plants an .html file containing innerHTML that must fail"},
    {"path": "packages/mizan-gate/src/gates/g7-verdict-path-purity.ts", "action": "modify", "responsibility": "DISPLAY_PATH += apps/web/src/page.ts (display rules cover the new surface; missing-file check enforces presence)"},
    {"path": "packages/mizan-gate/src/{docs-claims.ts,docs-check.ts}", "action": "modify", "responsibility": "DocsRule union += corpus-scope-claim, benchmark-claim-unbacked, golden-claim-unqualified, adr-citation-unresolved, runbook-order, answer-quality-claim; pure injected rules + wiring reading sources.json/vs-search.json/eval sets/docs/specs/adr; new judge-facing docs added to AUDITED_DOCUMENTS; GATE_IDS untouched"},
    {"path": "docs/{demo-runbook,value-proof,external-credibility,oral-one-pager}.md", "action": "create", "responsibility": "live-first runbook (S4), one-sentence negative-space claim + executed-arm figures + comparison table (S6), HUMAIN/IslamicEval norms cited (S8), golden-100 qualifier + MCP-deferred disclosure (S10)"},
    {"path": "docs/specs/adr/ADR-{02,03,04,05,06,11,C1..C5}.md", "action": "create (11 files)", "responsibility": "filename = exact citation ID so resolution is filename equality; content from specs/*.md JSON blocks (C1-C5) and code comments (legacy IDs) (S7)"},
    {"path": "README.md, docs/anchor-protocol.md, verify.ts header, submission/make_deck.py (+_ar), DISCLOSURE.md", "action": "modify", "responsibility": "remove 'not yet mechanised' divergence language (S2), corpus framing '4 Sunan + Muwatta + Qur'an, 27,234 records' (S5), golden-100 qualifiers (S10)"},
    {"path": "root package.json", "action": "modify", "responsibility": "scripts build:web, make:web-fixture; workspaces apps/* already discovers @mizan/web via discoverPackages"},
    {"path": "packages/mizan-corpus/src/{adapters/bukhari.ts,adapters/muslim.ts,ingest.ts,http.ts} + data/registry/sources.json", "action": "create/modify (Sprint 2, story 9)", "responsibility": "existing ADAPTERS/SourceAdapter pattern + licence-fields-first gate + code allowlist hosts (https/no-redirect); fallback if licence fails = keep honest framing per ADR-C4; ingest:check extended"},
    {"path": "scripts/benchmark/* + data/benchmark/vs-search.json", "action": "invariants-test only", "responsibility": "executor keeps SystemCase without anchor field; new test asserts systemArmSource=executed-verifier, falseVerifiedCount=0, delta arithmetic; anchorless-mode disclosure in value-proof.md"}
  ],
  "apiInterfaces": [
    {"name": "badgeFor", "module": "packages/mizan-core/src/badges.ts", "signature": "badgeFor(verdict: Verdict): string; VERDICT_GLYPH: Readonly<Record<Verdict, string>>", "notes": "exhaustive by type; glyphs moved verbatim; CLI byte-parity asserted by existing tests"},
    {"name": "escapeText", "module": "apps/web/src/encoder.ts", "signature": "escapeText(raw: string): string", "notes": "total entity encoder for & < > \" '; single implementation; XSS payload suite"},
    {"name": "renderPage", "module": "apps/web/src/page.ts", "signature": "renderPage(model: PageModel): string", "notes": "PageModel = WebExample; text nodes only, no sinks (G-2), offline by construction"},
    {"name": "WebExample", "module": "packages/mizan-core/src/schema/web-example.ts", "signature": "{ snapshotHash, sourceCount, transcript: \"live\"|\"precomputed\", claims: [{claimId, verdict, reason, badge, quote, sourceName}], ledgerStrip: [{questionHash, entryHash}] }", "notes": "decoded with decodeOrFail before render; badge cross-checked against badgeFor; ledger hashes only (§13)"},
    {"name": "EvalCase.anchorText", "module": "packages/mizan-core/src/schema/eval.ts", "signature": "anchorText?: string  // Claim.anchor mirror; 3-8 words, <=160 folded, normalized substring of the case quote", "notes": "present iff adjudication present (1:1 test over 66 rows); EvalSet.knownDivergence becomes optional; schemaVersion 2"},
    {"name": "CLAIM_ANCHOR_TEXTS", "module": "scripts/eval/adjudication.ts", "signature": "Readonly<Record<caseId, string>> (66 entries)", "notes": "human-drawn literals; generator files stay banned from importing @mizan/verify (existing textual guard)"},
    {"name": "claimsOf", "module": "apps/cli/test/eval.test.ts", "signature": "(cases) => Claim[] with ...(entry.anchorText === undefined ? {} : { anchor: entry.anchorText })", "notes": "only producer of anchored claims in the harness; verifier contract unchanged: anchoredOutcome returns unverifiable|null only"},
    {"name": "docs rules R9-R14", "module": "packages/mizan-gate/src/docs-claims.ts", "signature": "checkCorpusScopeClaim(text,file,registry) | checkBenchmarkClaimUnbacked(text,file,artefact) | checkGoldenClaimUnqualified(text,file) | checkAdrCitationUnresolved(text,file,adrDir) | checkRunbookOrder(text,file) | checkAnswerQualityClaim(text,file) : DocsClaim[]", "notes": "pure + injected inputs (same pattern as R1-R8); DocsRule union extended; every rule ships pass+fail planted tests using fragment-concat trap tokens (ADR-0x/0N/nn/C99 noise)"},
    {"name": "SourceAdapter/ADAPTERS", "module": "packages/mizan-corpus/src/adapters + src/ingest.ts", "signature": "existing contract; registry += bukhari/muslim", "notes": "no new interface (S9); licence fields required before enabled; http allowlist extended in code"}
  ],
  "dataModels": [
    "EvalCase (schema v2): + anchorText?: string; divergence stays NullOr generated as null; adjudication untouched",
    "EvalSet (schema v2): knownDivergence optional (retired by activation); required headers expectationSource/determinism/licenceNotice unchanged",
    "golden-normalization.json (regenerated): verdictCounts {verified:94, rejected:40, unverifiable:66}; 26 stamps -> null; 200 cases",
    "redteam-fabricated.json: expectations unchanged {rejected:40}; observed-vs-expected movement asserted against published redTeamMovement {rejectedToUnverifiable:40, falseVerifiedDelta:0}",
    "data/eval/adjudication.json: NO CHANGE - 66 human rulings + published movement are the authority",
    "WebExample fixture (apps/web/data/example-report.json): transcript precomputed, hashes+verdicts+public corpus quotes only, no PII/secrets",
    "public/index.html: committed codegen output, <50KB, no script/external refs, byte-staleness tested",
    "docs/specs/adr/ADR-*.md (11 files): filename = citation ID for exact resolution",
    "data/benchmark/vs-search.json: unchanged; invariants asserted (executed-verifier, falseVerifiedCount 0)",
    "data/registry/sources.json + ledger/attestation: unchanged in Sprint 1; Sprint 2 grows with licenceClass/licenceUrl first (G-5)"
  ],
  "testingStrategy": "Unit: encoder roundtrip incl. RTL/U+202E, badgeFor exhaustiveness, every docs rule with planted pass+fail pairs (fragment-concat for trap tokens), anchor guards (3-8 words, <=160 folded, substring of quote, present iff adjudicated), anchorless-elision-stays-rejected plant. Integration: full hermetic eval runs - golden 200/200 exact verdict+reason and 100% accuracy, elisions 26/26 expected==adjudicated==observed, red-team movement contract (observed rejected->unverifiable count equals published 40, observed verified equals falseVerifiedDelta 0, adjudicated rows stay rejected, zero other disagreements across 66 rows); fixture byte-staleness (regenerate->identical) and HTML byte-staleness; regen idempotence (second build:eval = zero diff); benchmark artefact invariants. Security: G-1..G-7 self-tests untouched (full bun run ci after each story), new G-2 .html plant (innerHTML must fail), DISPLAY_PATH presence + planted violation, XSS payload suite through escapeText, gitleaks G-4, no-new-deps/no-star-import structural culture. Performance: record wall time per story against 300s budget (baseline 152.6s, estimated +15-25s), all new tests in-process (no subprocess spawns per PM V-4/V-5), page offline/payload<50KB assertions. Coverage convention = planted pairs per rule, no coverage tool introduced."
}
```