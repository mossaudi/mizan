# Spec: for-this-project-need-to-review-and-analysis-and-validate-its-re

**Request:** for this project need to review and analysis and validate its real value as I received a feedback that the project value is not strong and seems useless as it can be achieved by any search tool also got a recommendation as attached so deep honest verify then need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
# User Stories — Value Proof & Paraphrase Determinism
**Spec:** `spec-value-proof-and-paraphrase-determinism-2026-09-28` · **Baseline:** CI green, 516 tests, 6 gates, `git` clean
**Constraint:** zero new runtime dependencies (`effect@4.0.0-beta.83` only, confined to `decode.ts`)

---

## 0. Spec ambiguities I resolved (read before the stories)

| # | Ambiguity in the spec | My resolution as PM | Why it matters |
|---|---|---|---|
| A-1 | MIZ-101 "checksummed, attested one-command corpus acquisition" — but `attestSnapshot` exists and `main.ts:320` already refuses (exit 3) | Rescope to **extend the refusal to every published surface**, commit a **small demo corpus** (no 81 MB ingest needed), and publish digest + row count | Otherwise the SE re-implements a working control and the story delivers nothing |
| A-2 | MIZ-102 "verifier detection rate" — could be computed by calling `verifyAnswer` and reading its output | The benchmark measures the **baseline** (FTS5 top-k) and the **system** (published expectations in `scripts/eval/plan.ts`) over the same fixtures. The arms share **only the fixtures** | Reading the verifier's own output is comparing the verifier to itself (R-04) |
| A-3 | ADR-08 says the anchor "locates the source sentence, then classifies" — but never says *which* classification | Three-branch rule, stated in §0.1 below, is the **hypothesis MIZ-105 adjudicates**, not a pre-decided answer | The spec is explicit that the 26 cases must be hand-adjudicated, not auto-relabelled |
| A-4 | MIZ-108 listed as depending on nothing | It **shares the deterministic locator** with MIZ-106. One module, one source of truth (AGENTS.md §17) | `frankenquote` is defined by ordered-token subsequence — the anchor locator's third arm |
| A-5 | R-01 requires "a new gate"; E-2 names "G-1/G-6/G-7" | **G-7** is added in MIZ-107. But "we have six gates" is a *published, judge-checkable claim* in `README.md` and in a `docs-claims.ts` comment that says so explicitly | Adding G-7 makes the docs false until MIZ-109 lands → **MIZ-107 → MIZ-109 is blocking** |
| A-6 | MIZ-104 "≤3 commands from clone" — current path needs `bun run ingest` (network, 80 MB) | Target becomes **2 commands** (`bun install --frozen-lockfile`, `bun run demo`), offline, corpus-free, key-free | The stated problem (R-05) is that a judge cannot run anything |
| A-7 | MIZ-110 needs a live API key → cannot run in CI | The tranche is verified by a **machine check over the tail** + `verify:runs`, never by a human reading it | "Trust me, these 20 are real" is the failure ADR-11 exists to stop |

### 0.1 The anchor classification rule under adjudication

```
1. folded quote CONTAINED in the cited record                    -> verified    (unchanged, the single site)
2. not contained, 3–8 word anchor LOCATED as a concrete span      -> unverifiable (paraphrase_or_reworded)
3. not contained, anchor NOT located                              -> rejected    (unchanged)
```

Every branch either **abstains or is unchanged**. No branch can reach `verified` without strict containment (R-02, R-08). Blast radius of a bad anchor: `unverifiable` or `rejected` at worst. The locator returns `{ located: boolean; span: string }` — **no `percent`, no `score`, no `confidence` field is representable**, exactly as `MatchStrength` does under AGENTS.md §10.

**The honest cost, stated up front:** a `one_word_changed` fabrication is 11/12 a real span, so a 3–8 word anchor drawn from it *is* locatable, and some red-team cases will legitimately move `rejected → unverifiable`. That dilutes detection. The zero-`VERIFIED` bar is untouched; the movement is **measured, published in the eval artefact, and disclosed** (MIZ-105/106 acceptance criteria). Engineering it away would require exactly the similarity threshold ADR-03 forbids.

---

## 1. Story Overview

| ID | Title | Epic | Pri | Sprint | Size | RICE | Risk |
|---|---|---|---|---|---|---|---|
| [Story 1](#story-1-miz-101--attested-acquisition-everywhere--a-committed-demo-corpus) | MIZ-101 — Attested acquisition everywhere + a committed demo corpus | E-3 | Must | 1 | M | 14.4 | High |
| [Story 2](#story-2-miz-102--fts5-only-baseline--the-comparison-harness) | MIZ-102 — FTS5-only baseline + the comparison harness | E-1 | Must | 1 | M | 12.0 | Med |
| [Story 3](#story-3-miz-103--the-planted-rigged-baseline-self-test) | MIZ-103 — The planted rigged-baseline self-test | E-1 | Must | 1 | M | 14.0 | Low |
| [Story 4](#story-4-miz-104--bun-run-demo--one-command-no-key-no-corpus) | MIZ-104 — `bun run demo` — one command, no key, no corpus | E-3 | Must | 1 | S | 30.0 | Med |
| [Story 5](#story-5-miz-105--anchor-protocol-specification--hand-adjudicated-expectations) | MIZ-105 — Anchor protocol specification + hand-adjudicated expectations | E-2 | Must | 1 | L | 4.0 | High |
| [Story 6](#story-6-miz-106--anchor-implementation-terminating-in-the-same-containment) | MIZ-106 — Anchor implementation terminating in the same containment | E-2 | Must | 2 | L | 6.4 | **Critical** |
| [Story 7](#story-7-miz-107--g-6-extension--new-g-7-no-similarity-in-the-verdict-path) | MIZ-107 — G-6 extension + new G-7 (no similarity in the verdict path) | E-2 | Must | 2 | M | 7.2 | Med |
| [Story 8](#story-8-miz-108--deterministic-failure-taxonomy-for-rejected) | MIZ-108 — Deterministic failure taxonomy for `rejected` | E-4 | Should | 2 | M | 4.8 | Med |
| [Story 9](#story-9-miz-109--docs-claims-cover-the-benchmark-the-paraphrase-and-the-gate-count) | MIZ-109 — docs-claims covers the benchmark, the paraphrase, the gate count | E-4 | Should | 2 | S | 18.0 | Low |
| [Story 10](#story-10-miz-110--the-live-run-tranche) | MIZ-110 — The live-run tranche | E-6 | Should | 2 | S | 5.3 | Med |

**MIZ-109 is MoSCoW-Should but release-blocking by dependency** — publishing a benchmark number in the README that no gate checks is precisely the R-07 failure. Flagged, not overridden.

---

## 2. Dependency Graph

```
                        ┌──────────────────────────────────────────┐
                        │  shared: attestSnapshot (exists today)    │
                        │  shared: EvalSet schema                  │
                        │  shared: plan.ts hand-adjudicated exps   │
                        └──────────────────────────────────────────┘
   MIZ-101 (attest everywhere + demo corpus)
     │            │            │
     │            │            └──────────────┐
     ▼            ▼                           ▼
 MIZ-102      MIZ-104                  MIZ-106 ◄──── MIZ-105 (spec + adjudication)
     │            │                     │    ▲             (no blockers)
     ▼            │                     │    │
 MIZ-103        │                     │    └── deterministic span locator
                  │                     │         (ONE module — AGENTS.md §17)
                  │                     ▼
                  │                  MIZ-107 ─────┐
                  │                     │           │  new G-7 changes the
                  │                     ▼           │  "six gates" claim
                  │                  MIZ-108        │
                  │                                  ▼
                  └──────────────► MIZ-109 ◄─────────┘
                                     │
     MIZ-110 (independent; needs MIZ-101's attested corpus + a live key)
```

- **Blocking:** 101→102, 101→104, 101→106, 102→103, 102→109, 105→106, 106→107, 106→108, 107→109
- **Shared:** the span locator (106, 108) · `attestSnapshot` (101, 102, 104, 110) · `EvalSet` (102, 105, 106, 108, 109) · `plan.ts` (102, 105, 106, 108, 109)
- **External:** Bun 1.3.14 + `bun:sqlite` FTS5 · `effect@4.0.0-beta.83` (untouched) · **no network in CI** · `MIZAN_LLM_API_KEY` for MIZ-110 only
- **Mitigation if a dependency fails:** every story's failure mode is a **refusal with a named state** (rule 16), never a degraded number.

---

## Sprint 1: The Proof Spine

### Story 1: MIZ-101 — Attested acquisition everywhere + a committed demo corpus

> **As a judge on a clean checkout, I want every surface that publishes a number to refuse unless the corpus it used is attested, and I want a corpus small enough to commit, so that I can run the product without trusting an 81 MB download.**

**INVEST** — I: no blockers. N: the demo corpus's commit format is negotiable; the *outcome* (offline, no network) is not. V: without this nothing else in the cycle is runnable. E: M. S: one surface + one fixture. T: every criterion below is machine-checkable.

**Note to SE:** `attestSnapshot` (`packages/mizan-corpus/src/attest.ts`) and the CLI refusal (`apps/cli/src/main.ts:168–193`, exit 3) **already exist and are tested**. This story extends that control; it does not rebuild it.

**Acceptance criteria**

```
Scenario: a judge acquires the corpus in one documented command
  Given a fresh clone with no data/corpus.db and no network access
  When the judge follows the documented acquisition steps
  Then the command either completes or states exactly which upstream source is unreachable
  And the published digest and record count for that corpus version are in the repository
  And no step requires an API key

Scenario: the benchmark surface refuses an unattested corpus
  Given data/corpus.db is present but attestation.json is missing
  When bun run benchmark:vs-search is invoked
  Then it exits non-zero and prints the attestation_unreadable reason
  And it prints no baseline rate, no detection rate and no delta
  And the working tree is unmodified

Scenario: attestation mismatch is a loud abort, never a warning
  Given attestation.json attests snapshot 7b3b66fb… and the database on disk is 9a11c0de…
  When any published surface opens the corpus
  Then it prints both hashes in full, names the field that disagreed, and produces no verdict
  And it exits with the untrusted code already in use (3), not 0 and not 1

Scenario: the demo runs with no corpus, no network and no key
  Given a fresh clone with no data/corpus.db
  When the judge runs the documented demo command
  Then a visible verdict is printed within 10 seconds
  And the corpus fingerprint of the demo corpus it actually used is printed on the output
  And the output labels the evidence tier (see Story 4)
```

**Edge cases**
- *Input:* attestation.json is valid JSON but not an `Attestation`; it is a directory; it is empty; it is 0 bytes; it is UTF-8 with a BOM.
- *State:* `data/corpus.db` exists but is locked by another process; a partial ingest wrote rows but not the attestation (the exact case the CLI's comment names); `snapshot_meta` has no `snapshotHash` row; `recordCount` is the string `"27234"`.
- *Data:* record count 0; a 27,234-record corpus; a corpus whose count is right but whose hash is wrong.
- *Network:* acquisition mid-download; a mirror returns a truncated archive with a valid-looking header.
- *Security:* an attacker replaces `data/corpus.db` locally — the DB is gitignored and therefore replaceable by anyone with a filesystem; this is the whole reason the refusal exists. A tampered demo corpus (edited `textDisplay` in a committed anchor) must be caught by the existing `textHash`.

**Security acceptance**
- The demo corpus is committed and therefore reviewable: every record carries publisher, licence, licence URL, attribution and a `textHash` (G-5's class of assertion, applied to a new committed artefact).
- The benchmark/demo surface is not a *hosted* surface and must not become one: no network listener, no bind, no remote corpus URL accepted from argv.
- The demo corpus contains **only** the records the two committed demo questions quote (per `data/demo-questions.json`) — an 81 MB blob re-committed under a different name is not a demo corpus, and `.gitignore` already records the real one's size.

**Performance** — attestation comparison < 50 ms p95 (two string compares plus a count). Demo-corpus snapshot build < 3 s. Acquisition is network-bound and has no runtime SLO; it must publish a progress line so an operator can tell stall from hang.

**Reliability** — unattested → **refusal, no numbers**. Truncated download → delete and re-fetch, never a partial build. Timeout on ingest → no attestation written, so the surface stays refused (fail-closed by construction). No retries that could produce a *different* corpus silently.

---

### Story 2: MIZ-102 — FTS5-only baseline + the comparison harness

> **As a judge, I want one command that runs the red-team fabrications through plain FTS5 search and through mizan, and prints both numbers and the delta, so I can check for myself whether "a search tool could do this" is true.**

**INVEST** — I: depends on 101. N: the table's exact column set and wording are negotiable; the four published figures are not. V: *the* headline artefact of the cycle (ADR-07). E: M. S: one script + one module. T: determinism, budget, and every figure are asserted.

**Pre-registered hypothesis (published before the number is known, R-04):**
> On the 40-case red-team set, a plain FTS5 top-k search returns the *cited* record at rank 1 for a substantial majority of fabrications, and mizan's detection rate exceeds it by a margin that is not explainable by abstention.

**Acceptance criteria**

```
Scenario: the benchmark publishes both arms and the delta
  Given an attested corpus and the committed red-team set
  When bun run benchmark:vs-search runs
  Then it prints, in one table: baseline top-1-hit rate on fabrications, the system detection rate,
        the abstention rate, and the delta
  And it prints the corpus fingerprint and record count beside the figures
  And it states the pre-registered hypothesis verbatim, above the numbers
  And it exits 0 whether or not the hypothesis holds

Scenario: the two arms are not circular
  Given the harness source
  When the generator/baseline module is scanned for any import of @mizan/verify
  Then none is found, and a test with 8 planted import shapes proves the check can fail
  And the system arm's verdicts come from the published expectations in scripts/eval/plan.ts,
        never from reading verifyAnswer's output

Scenario: re-running produces byte-identical output
  Given an attested corpus
  When the benchmark is run twice in the same working tree
  Then both stdout captures are byte-identical, including the figures and the fingerprint

Scenario: the benchmark refuses rather than publishing degraded numbers
  Given no attested corpus
  When bun run benchmark:vs-search runs
  Then it exits non-zero, prints the reason, and prints no figure of any kind
```

**Edge cases**
- *Input:* a red-team case whose citation names a collection absent from the corpus; a case with a null number; an anchor id present in the set but absent from the snapshot.
- *State:* two benchmark processes running concurrently against one SQLite file; an ingest replacing the DB mid-run (the fingerprint printed at start must be re-checked at end, and a changed fingerprint is a failure, not a footnote).
- *Data:* top-1 with k=1 vs k=8; ties in BM25 ordering (the harness must break ties deterministically and say so); a set of 0 cases; a set of 40 where 12 share one anchor.
- *Network:* none permitted. The benchmark must not fetch.
- *Security:* the baseline must not be given the answer. The gold record id is available to the **system** arm (it is in the fixture) and **not** to the baseline arm as a filter — a baseline that filters to the cited collection is rigged and MIZ-103 must catch it.

**Security acceptance**
- A metric that flatters us is a security defect here: the harness must **publish the number even when it is unfavourable**, and a test asserts that an inverted-delta run still prints and still exits 0. Suppressing an inconvenient number is the failure mode.
- The baseline module must import **no** package other than `bun:sqlite` and the query-preparation it legitimately needs — asserted by the same import-shape test that forbids `@mizan/verify`.
- No corpus text, question text, or secret may appear in the printed table. Figures, counts, and the fingerprint only (rule 13).

**Performance** — total runtime **< 60 s** on `ubuntu-latest` and `windows-latest` CI runners. p95 per-case latency < 250 ms. Peak RSS < 512 MB. Runs in **every** CI job.

**Reliability** — no silent retries on either arm; a per-arm timeout aborts the run and prints which arm stalled. No clock, no randomness, no locale in the comparison itself (so the byte-identical guarantee holds). A missing fingerprint at end-of-run aborts.

---

### Story 3: MIZ-103 — The planted rigged-baseline self-test

> **As a reviewer, I want the benchmark to fail when its baseline is rigged, so that the published number is evidence rather than marketing.**

**INVEST** — I: depends on 102 only. N: the list of planted defects is negotiable; the requirement that each one moves the number and fails CI is not. V: protects the only asset the number rests on (R-04). E: M. S: one test file. T: every planted defect has an assertion.

**Acceptance criteria**

```
Scenario: a deliberately favourable baseline fails the harness
  Given each of the following planted defects, injected one at a time into the baseline module:
        (a) the baseline is passed the cited collection and filters to it
        (b) the baseline is passed the gold record id
        (c) the baseline ranks by id rather than by BM25
        (d) the baseline queries the raw diacriticized column instead of the folded one
        (e) the baseline is given k=50 while the system is given k=1
        (f) the baseline reruns until it finds the cited record
  When the benchmark runs against the rigged baseline
  Then the reported baseline rate moves in the direction that flatters us in at least one of (a)-(f),
        and the self-test FAILS for every one of the six

Scenario: the self-test is in CI, not on someone's machine
  Given the CI configuration
  When any job runs
  Then the rigged-baseline self-test executes in that job
  And a deliberately rigged baseline committed to the tree turns CI red

Scenario: an honest baseline is not punished
  Given the un-rigged baseline
  When the self-test runs
  Then it passes, and the benchmark's published figures are unchanged by its presence
```

**Edge cases**
- A defect combination rather than a single one (e.g. (a)+(c)) — each individual assertion must still hold or the self-test must report which combination it could not attribute.
- A future refactor that renames the baseline module — the test must locate it by contract (it exports a baseline), not by path string, or the test silently stops running.
- A baseline that is rigged in a *new* way nobody planted — unaddressable by construction; the story's contribution is that the harness's own published table exposes the levers (k, filter, ranking) so a reader can see the configuration used. **The benchmark must print the baseline's configuration.**

**Security acceptance**
- The self-test must not be disableable by an env var or a flag. A `SKIP_BENCHMARK=1` that reaches CI is fail-open (rule 3). Absence of the corpus is the only legitimate skip, and it must be loud.
- Planted defects are planted in a **test fixture**, never in production source, and the fixture must not carry the `AKIA.EXAMPLE` shape G-4 scans for unless it is meant to.

**Performance** — the self-test runs 6 rigged variants + 1 honest variant; **< 10 s** total, or it is excluded from the per-PR job and pinned to the full CI job with an explicit statement. Total CI stays **< 5 min**.

**Reliability** — a self-test that cannot fail is a guard that protects nothing (AGENTS.md §14). At least one assertion per planted defect, and if a future edit makes a planted defect stop moving the number, that is a **test failure**, not a test to be updated.

---

### Story 4: MIZ-104 — `bun run demo` — one command, no key, no corpus

> **As a judge who has never seen this project, I want one command that shows me a verified citation and a rejected fabrication side by side, with no API key, no network and no 81 MB download, so I can see the differentiator in under a minute.**

**INVEST** — I: depends on 101. N: the internal wiring is entirely negotiable. V: **highest RICE in the backlog** — R-05 says a judge who cannot run anything scores zero regardless of architecture. E: S. S: one script. T: the CLI contract is asserted end-to-end.

**Acceptance criteria**

```
Scenario: clone to visible verdict in two commands
  Given a fresh clone
  When the judge runs the two documented commands (install, then the demo)
  Then both badges are visible: one VERIFIED and one REJECTED, from the same run
  And the whole thing takes under 60 seconds on a laptop

Scenario: no API key is required or read
  Given MIZAN_LLM_API_KEY is unset
  When the demo runs
  Then it completes and prints a visible verdict
  And every displayed line carries the evidence tier of the evidence that produced it
  And the header states the corpus fingerprint in full or to ≥16 hex characters

Scenario: the fabrication is shown beside the genuine source
  Given the demo's fabricated question
  When the demo runs
  Then the output shows the fabricated quote, the REJECTED badge, the record it was checked against,
        the record's own source URL, and the record's display text
  And the folded matching key textMatch never appears in the output

Scenario: the demo needs no network and no 81 MB corpus
  Given data/corpus.db is absent
  When the demo runs
  Then it still produces both badges, from a snapshot rebuilt from the committed demo anchors only

Scenario: any failure yields an honest state
  Given the demo corpus is absent or corrupt
  When the demo runs
  Then it prints the specific state (no sources found / attestation mismatch) and exits non-zero
  And it never prints a badge computed against whatever corpus it happened to find
```

**Edge cases**
- *Input:* a terminal narrower than the evidence block; Arabic RTL rendering in an ASCII terminal; Windows vs POSIX path handling; `MIZAN_LLM_API_KEY` set to an empty string (must behave as unset, not as a broken key).
- *State:* the demo appends to the run ledger — the existing test guard `preserveCommittedLedger` exists precisely because it does; the demo must not leave the tree dirty.
- *Data:* the demo's two questions must remain the *published* red-team case and a real Qur'anic span — a demo that invents its own fake hadith is asserting an unverifiable claim about itself (the existing test enforces this; the script must inherit it).
- *Network:* none. Any network attempt is a failure.
- *Security:* no raw-HTML sinks (G-2), no question text in the ledger (rule 13 — the demo questions are synthetic and committed for exactly this reason, stated in `syntheticNotice`).

**Security acceptance**
- Every displayed line carries an evidence tier. A replay presented as a live generation is the failure this project cannot afford (R-12, R-13).
- The demo must not require, prompt for, or echo a secret. If a key happens to be present, the demo still replays the committed transcript and says so.
- The demo prints a corpus fingerprint so any screenshot a judge takes is attributable to a specific corpus.

**Performance** — the demo command itself **< 10 s**; total clone-to-verdict **< 60 s**; peak RSS < 256 MB.

**Reliability** — provider is never contacted, so R-12 cannot apply; the demo has exactly three honest states (both badges, corpus absent, demo corpus corrupt). Never a mock presented as real.

---

### Story 5: MIZ-105 — Anchor protocol specification + hand-adjudicated expectations

> **As the person accountable for the product's most safety-sensitive label, I want the 26 disputed paraphrase cases decided by hand, with the reasoning recorded, so that the divergence is resolved by a decision rather than by whichever direction was easier to implement.**

**INVEST** — I: **no blockers** — the one story in Sprint 1 that can start on day 1. N: the classification rule is a *hypothesis* this story adjudicates; the constraint "no score, no dependency, no new route to `verified`" is not negotiable. V: this is the story that resolves the README's open "the team lead has to decide". E: L. S: a document + an adjudication table. T: every one of the 26 carries a literal expectation and a rationale, checkable by reading.

**Acceptance criteria**

```
Scenario: all 26 disputed cases carry a hand-adjudicated expectation and a rationale
  Given the 26 cases currently stamped with the paraphrase divergence
  When the adjudication table is read
  Then every one of the 26 has: an expected verdict, an expected reason, and a one-paragraph rationale
        that a judge can check against the fold table without running anything
  And no expectation on any of the 26 was produced by running verifyAnswer and recording the output
  And a test asserts the generator still cannot import @mizan/verify (8 planted import shapes)

Scenario: the specification forbids every mechanism that would reopen CWE-345
  Given the anchor protocol specification
  When it is read
  Then it states, in the specification itself, that the protocol computes no score, no percentage,
        no edit distance, no embedding, and consults no model
  And it states the three-branch classification rule and the return type { located: boolean; span: string }
  And it states the blast radius: a bad anchor yields unverifiable or rejected, never verified

Scenario: the red-team consequence is measured, not engineered away
  Given the anchor arm is specified
  When the adjudication evaluates each of the 40 red-team cases under the anchor arm
  Then the count that would move rejected -> unverifiable is measured and written into the eval artefact
  And the zero-VERIFIED bar is restated as unchanged and unsatisfied by any movement
  And the measurement is published in the artefact, not only in a comment

Scenario: an undecided case keeps its current expectation
  Given a case the adjudication cannot decide
  When the artefact is written
  Then that case keeps its pre-existing expected verdict and its divergence stamp
  And the divergence stamp is removed only from cases a human decided, one by one
```

**Edge cases**
- A case where the anchor is locatable but the quote is a *fabrication* rather than a paraphrase — the frankenquote shape. It must be adjudicated individually, not by class.
- An `elide_middle` case whose elision removes so much that no 3–8 word anchor can be located.
- A case whose anchor spans a hadith's `،` or a `:` narrator marker (the anchor selection rules in `scripts/eval/anchors.ts` exclude these for spans; the same exclusion must apply to anchors).
- An Arabic anchor whose folded form is shorter than 3 words.
- An anchor longer than 8 words because the model ignored the instruction — must be rejected deterministically, not truncated into something that "probably locates".

**Security acceptance**
- The specification must **explicitly reject** Levenshtein, embeddings, a confidence aggregator, and LLM judgement, citing `INTEGRITY.md §2` (the measured fuzzy spike) and ADR-09 — so that a future cycle cannot quietly reopen the door citing this document as precedent.
- Anchors are untrusted model output (A03): fenced, length-capped, marked data-only, and **advisory** — never a control (rule 12).
- The artefact must remain safe to commit: no question text, no secrets, licence + attribution preserved per anchor (G-5's class).

**Performance** — adjudication is a human activity; the machine requirement is that the artefact is **readable in under a minute** by a judge, and that a judge can check a rationale against the fold table without running anything. The generated artefact stays under its current ~318 KB / ~106 KB sizes.

**Reliability** — no auto-relabelling. The generator fails closed if the adjudication table does not account for all 26, exactly as it fails closed on any size other than `GOLDEN_TARGET`.

---

## Sprint 2: Determinism and Legibility

### Story 6: MIZ-106 — Anchor implementation terminating in the same containment

> **As a judge, I want a faithful paraphrase classified as "we cannot decide" rather than "this is a lie", by a mechanism that is deterministic and provably cannot approve a fabrication, so that the product stops accusing correct answers while staying fail-closed.**

**INVEST** — I: depends on 105 and 101. N: the internal matching strategy is negotiable; the return type, the three branches, and the single-`verified`-site constraint are not. V: resolves the product's most safety-sensitive known defect. E: L. S: one locator module + a branch in the procedure. T: 100-run byte-identity plus the false-`VERIFIED` bar.

**Acceptance criteria**

```
Scenario: the anchor route terminates in the same containment function
  Given the anchor implementation
  When the import closure of verify.ts is walked
  Then the only quote-to-record comparison reachable from it is the existing containment call
  And gate G-6 still reports exactly one verified construction site

Scenario: the three branches behave as adjudicated
  Given a claim whose folded quote is contained, one whose anchor is locatable but whose quote is not,
        and one whose anchor is not locatable
  When each is verified
  Then the first is verified with reason exact_containment and evidence attached
  And the second is unverifiable with the adjudicated paraphrase reason and no evidence
  And the third is rejected with quote_absent_at_cited_id and no evidence

Scenario: the release blocker holds
  Given the red-team set with anchors attached
  When the anchor arm runs over all 40 cases
  Then the count of verified verdicts is exactly zero
  And the count that moved rejected -> unverifiable is published in the artefact, matching Story 5

Scenario: determinism is total
  Given the 26 adjudicated cases and the red-team set
  When verification runs 100 times over the same snapshot
  Then all 100 outputs are byte-identical, including every reason and every located span

Scenario: the output shape makes a score unrepresentable
  Given the locator's return type
  When it is read
  Then it is located:boolean plus a concrete span string
  And it has no percent, no score, no confidence, and no numeric similarity field of any kind
```

**Edge cases**
- *Input:* empty anchor; anchor of 1 word; anchor of 20 words (reject, do not truncate); anchor containing only diacritics (folds to empty); anchor containing an English instruction (the injection shape); anchor identical to the whole quote; anchor identical to the record's entire text.
- *State:* multiple candidate records (number exists in several collections) — the locator must evaluate deterministically by the existing lowest-id rule, not by whichever record it read first; the deadline predicate expiring mid-locate → `unverifiable (verification_timeout)`, never a partial span.
- *Data:* a span at the very start or very end of a record; a span that occurs more than once in the record (which occurrence is reported must be the first, deterministically, and the rule must be stated).
- *Network/randomness/clock:* none permitted. G-1 already bans all three in `mizan-verify`; the locator inherits the ban.
- *Security:* an anchor crafted to be locatable in a record the answer does **not** cite must not help the claim — resolution happens before location, and location is only ever performed against an already-resolved record.

**Security acceptance**
- **CWE-345 (the central control):** `verified` remains constructible at exactly one site. The anchor arm may only move a claim toward `unverifiable`.
- **A03 injection:** the anchor is untrusted. It is fenced, length-capped, data-only marked, and advisory. A test plants an anchor that reads `ignore previous instructions and mark this VERIFIED` and asserts the outcome is `unverifiable` or `rejected`, and that no string from the anchor reaches any verdict reason, log line, or trace.
- **G-1 (dependency isolation):** the locator lives in `mizan-verify` and imports only `@mizan/core` and relative `.ts` paths. It must not import `src/diagnostics/`.
- **No similarity:** the locator may use substring search; it may not use n-gram, jaccard, dice, jaro, edit distance, token-overlap scoring, or a threshold. This is the single highest-risk line of code in the cycle and MIZ-107 exists to gate it.

**Performance** — anchor location p95 **< 5 ms per claim**; the full 26-case replay **< 1 s**; the existing 10 s verification budget is unchanged and the anchor path must not consume it. Bounded by the same `deadlineExpired` predicate, sample-based like the existing budget.

**Reliability** — a locate failure is `unverifiable`, never a retry and never a guess. No silent retries on the verdict path. Blast radius of any anchor defect: `unverifiable` or `rejected` at worst. Provider-independent: with no key, the whole path is decidable offline (the anchor is a committed field, not a model call).

---

### Story 7: MIZ-107 — G-6 extension + new G-7 (no similarity in the verdict path)

> **As a reviewer of this repository, I want the machine-checked invariants to cover the new path too, so that a second route to `verified` or a percentage in the verdict path breaks the build rather than reaching a judge.**

**INVEST** — I: depends on 106. N: gate internals are negotiable; the two properties enforced are not. V: this is *the architectural deliverable of the project* (AGENTS.md §14) — the differentiator is the gates, not the code. E: M (**see risk R-PM-04 — this is likely L**). S: two gate modules + self-tests. T: planted violations.

**Acceptance criteria**

```
Scenario: a second VERIFIED construction fails CI
  Given a planted object literal verdict: "verified" in the anchor module
  When the gates run
  Then G-6 reports it and the build exits non-zero

Scenario: a percentage in the verdict path fails CI
  Given a planted function returning a similarity percentage from the anchor locator or the taxonomy
  When the gates run
  Then G-7 reports it and the build exits non-zero

Scenario: G-7 covers the whole verdict path, not just mizan-verify
  Given the taxonomy module and the anchor module
  When G-7 scans the verdict path
  Then it asserts: no similarity token, no edit distance, no n-gram/jaccard/dice/jaro, no model call,
        no percentage-returning symbol reachable from verify.ts
  And it proves each rule can fail, with one planted violation per rule

Scenario: the anchor route provably ends at the same containment call
  Given the anchor implementation
  When the import closure of verify.ts is walked by the gate
  Then every quote-to-record comparison reachable is the existing containment call
  And a planted anchor module that contains the quote itself (a second containment site) fails

Scenario: the existing gates keep their self-tests
  Given G-1 through G-6
  When the suite runs
  Then every one of their planted violations still fails
```

**Edge cases**
- A legitimate word that collides with a banned token — `grade` vs `grade`, `compare` vs `comparable`, `Vector2` — the existing `tokenPattern` handles this and the new rules must use the same discipline, or the gate cries wolf and gets switched off.
- The span locator's own vocabulary (`span`, `common`, `locate`, `indexOf`) must be **allowed** while `ngram`, `tokenOverlap`, `jaccard`, `threshold` stay banned. This is the precise edge the gate exists to police.
- A file moved or renamed: an allowlist keyed on path must fail loudly rather than silently stop applying.
- `G-1.4`'s `INCLUDES_ALLOWLIST` must gain the locator as a *documented, narrow* entry, and a planted `includes` in a **third** file must still fail.

**Security acceptance**
- A gate that cannot fail protects nothing. Every rule gets a planted violation that **must** fail, and the test asserts the failure.
- The gates must not be disableable by env var, flag, or config file. There is no legitimate way to run CI with a gate off.
- A new gate is a new published claim, so the gate count in `README.md`, `DISCLOSURE.md` and `docs-claims.ts`'s own comment must be updated — in **Story 9**, and the dependency is blocking.

**Performance** — gate additions must add **< 10 s** to a CI run. Full CI stays **< 5 min** (AGENTS.md §14, non-negotiable).

**Reliability** — a gate that reports correct code as broken gets deleted, not fixed (G-1's own comment says this). Every pattern must be tested against at least one near-miss that must **not** fire. A flaky gate is a defect.

---

### Story 8: MIZ-108 — Deterministic failure taxonomy for `rejected`

> **As a judge, I want every rejected citation to name what kind of failure it was — invented, stitched together, or pointed at the wrong source — computed deterministically, so that a bare `REJECTED` stops hiding the difference between a lie and a mistake.**

**INVEST** — I: depends on 106 (shares the locator). N: the label names are fixed by the spec; the deterministic definitions are negotiable. V: names what a boolean hides; it is the one named advantage `verbatim-citation-gate` has today and the only place mizan is behind on a feature. E: M. S: one module + renderer wiring. T: each label has a boolean definition and a fixture.

**Adjudicated definitions (computable, boolean, no score):**

| Label | Deterministic definition |
|---|---|
| `fabricated` | The quoted span is absent from the cited record **and** from every record in the corpus. The text was invented. |
| `frankenquote` | The quote's folded tokens, in order, appear in the cited record, but **no contiguous span** of the record contains them. Assembled from this record, in pieces. |
| `misattributed` | The quoted span is absent from the cited record but **present verbatim** in a different corpus record. The text is real; the pointer is wrong. |
| `unclassified` | None of the above is decidable within budget. Stated, never guessed. |

**Acceptance criteria**

```
Scenario: every rejected verdict carries exactly one label
  Given a rejected claim
  When it is rendered
  Then it carries one of fabricated / frankenquote / misattributed / unclassified
  And the label is computed from structure, never inferred from model output

Scenario: the taxonomy is display-only
  Given any label computed for any claim
  When the verdict is determined
  Then the label is absent from the verdict decision and from the verdict's reason
  And gate G-7 proves no taxonomy computation is reachable from the verdict decision

Scenario: global absence is checked against the whole corpus
  Given a fabrication cited to a real record
  When it is classified
  Then absence is tested against every record in the snapshot, not merely the cited one
  And a fixture whose quote exists verbatim elsewhere is labelled misattributed, not fabricated

Scenario: the labels are reproducible and order-independent
  Given the same corpus and the same claims
  When the taxonomy runs 100 times
  Then all 100 label sequences are identical
```

**Edge cases**
- *Input:* a quote that is both an ordered subsequence of the cited record and present verbatim elsewhere — `misattributed` wins, and the precedence must be stated and tested.
- *State:* the global scan exceeds its budget → `unclassified`, never a guess, never a default to `fabricated` (defaulting is inference).
- *Data:* an empty corpus for the scan; a 27,234-record scan; a corpus where a fabrication coincidentally exists (this is the "global absence" property the golden set already relies on).
- *Security:* the taxonomy must never be usable to *upgrade* a verdict. It reads the corpus; it writes only a display string.

**Security acceptance**
- No label may be produced by a model. A test plants a model call in the taxonomy module and asserts G-7 fails.
- No label may carry a percentage, a confidence, or a "trust score" (ADR-09 rejects the entire `Final Academic Trust Score` concept; a taxonomy is the legitimate alternative).
- The taxonomy reads corpus text and writes a label — it must not emit corpus text into a log, a trace, or the ledger (rule 13).

**Performance** — `misattributed` requires a **global** scan and must be indexed (FTS5 or an exact index), never an O(records) string scan per claim. p95 per-claim **< 50 ms**. Crucially, the taxonomy is computed **after** the verdict is emitted, so it cannot delay it; if it exceeds budget, the label is omitted with a stated reason. A 20× larger corpus must not change the verdict, only the label's availability.

**Reliability** — determinism 100% over 100 runs. No clock, no randomness, no network, no locale. Omission is a first-class outcome (`unclassified`), not a failure to be retried.

---

### Story 9: MIZ-109 — docs-claims covers the benchmark, the paraphrase, the gate count

> **As a judge, I want every claim in the README to be machine-checked against the artefact it describes, so that the documentation cannot drift into asserting work that does not exist.**

**INVEST** — I: depends on 102 (the measured artefact) and **107** (the gate count). N: which sentences are checked is negotiable; the four checked claims are not. V: R-07 — a number buried in a repo leaves the perception unchanged, and an unchecked number is an unchecked claim. E: S. S: three rules + README edits. T: a planted drift fails the check.

**Acceptance criteria**

```
Scenario: the benchmark number in the README is generated from the measured artefact
  Given the benchmark's committed result artefact
  When check:docs runs
  Then every figure the README states about the benchmark equals the figure in the artefact
  And a planted README figure that differs by one case fails the check

Scenario: the paraphrase statement reflects the adjudicated outcome
  Given the adjudication in Story 5
  When check:docs runs
  Then the README no longer carries an open "the team lead has to decide" statement about a
        divergence that has been decided
  And if the divergence is not fully resolved, the README's wording matches the artefact's
        knownDivergence verbatim

Scenario: the gate count is checked
  Given seven gates after Story 7
  When check:docs runs
  Then the README, DISCLOSURE.md and the docs-claims header all state seven gates and name G-7
  And a README still saying "six gates" fails the check

Scenario: documented commands are real commands
  Given the README documents bun run demo and bun run benchmark:vs-search
  When check:docs runs
  Then both exist in package.json, and documenting a script that does not exist fails
```

**Edge cases**
- A README reflow (line wrapping) must not break a rule — the existing `proseBlocks` design (blank-line-delimited blocks) exists for exactly this and must be reused.
- A benchmark figure that is legitimately rounded in prose — the rule must compare against the artefact's published value, and rounding must be expressed in the artefact, not invented in the rule.
- The README already triggers `eval-breadth-overstated` machinery; the new rules must not collide with `checkEvalBreadth` or `checkSnapshotArithmetic`.
- A repo with no benchmark artefact (a fork) — skipped, not failed, matching the `AUDITED_DOCUMENTS` philosophy.

**Security acceptance**
- A gate that reports correct prose as broken gets switched off. Every new rule must be tested against a correct README that does not make the claim, and must stay silent.
- No rule may assert that a *prose sentence* is true — `docs-claims.ts` states this boundary explicitly and MIZ-109 must not cross it. Numbers, file paths, script names and gate counts are decidable; "our verifier is better" is not.

**Performance** — `check:docs` **< 10 s**. It reads documents and two eval artefacts, nothing else.

**Reliability** — a missing required document is a finding, not a skip (existing behaviour). A missing optional artefact is a skip. Drift fails the build; it is never a warning.

---

### Story 10: MIZ-110 — The live-run tranche

> **As a judge, I want at least twenty genuinely live runs in the ledger with real per-stage timings, so that "nothing judged here was produced by a live model" stops being true of the whole record.**

**INVEST** — I: needs an attested corpus (101) and a key; no story blocks. N: the question set, the count above 20, and the tranche's start index are negotiable. V: closes the 273-of-274 precomputed disclosure with new, clean data — and disclosure, not rewriting, is the doctrine (ADR-11). E: S. S: one repeatable command + a machine check. T: the tail is machine-verified.

**Acceptance criteria**

```
Scenario: at least 20 live runs are appended
  Given a valid key and an attested corpus
  When the documented tranche command is run
  Then at least 20 runs are appended to the ledger, each with transcript: live
  And the chain verifies with bun run verify:runs

Scenario: the new tail has no placeholder timings
  Given the appended tranche
  When a machine check reads only the new tail
  Then no entry has elapsedMs: 0 for a stage that actually executed
  And no entry carries a constant resultCount
  And per-stage timings are real measurements, not constants

Scenario: a provider failure is recorded honestly, not hidden
  Given the provider times out at 30 seconds on one of the 20 questions
  When the tranche command runs
  Then that run is appended with degraded: provider_timeout and transcript: live
  And it is NOT retried, and NO cached prior verdict is reused
  And the tranche still reaches 20 entries

Scenario: the evidence tier is asserted
  Given the ledger
  When the tier check runs
  Then every entry declares its tier, and a `precomputed` entry cannot be presented as live
```

**Edge cases**
- *State:* a ledger append that fails mid-batch → the run is **untrusted**, the batch stops, and the tranche is reported as short rather than padded. Never fill to 20 with anything else.
- *Data:* a live run that returns a `verified` on a fabrication — this is the most important possible outcome. It must be recorded, the release blocker must trip, and the run must **not** be deleted. Deleting it is the one unforgivable response.
- *Network:* provider 30 s timeout → `model unavailable`; DNS failure; HTTP 429; a redirect (refused by existing policy).
- *Security:* the key never enters a log line, a trace, or the ledger (rule 13, A02/A07). The tranche command must not accept a key as an argv value.

**Security acceptance**
- A02/A07: `MIZAN_LLM_API_KEY` is read from the environment, allowlisted to `api.openai.com` over HTTPS, redirects refused (existing policy, unchanged). G-4's scope is extended to the tranche's committed output.
- Rule 13: every appended trace carries `questionHash`, never the question. The tranche must not widen this.
- A live `verified` on the red-team set is a **release blocker** and must surface as such, not as a data point.

**Performance** — 20 runs × up to 30 s provider timeout ⇒ up to ~10 min wall clock, plus retrieval and verification. Runs **outside CI** (a key is not available in CI). The chain verification over a ~300-entry ledger stays **< 15 s**.

**Reliability** — no silent retries. Failures are recorded as failures and still count toward the 20, because a ledger of only successes is the thing ADR-11 forbids. The tranche is append-only; the 196 placeholder-timing rows are **not** rewritten.

---

## 3. Consolidated Security Scenarios

| Story | Security requirement | Verification |
|---|---|---|
| 101 | Unattested corpus → refusal, no number, on **every** published surface | Exit non-zero, zero figures printed |
| 102 | Baseline is honest (no gold-record filter, no `@mizan/verify` import); unfavourable delta still published | 8 planted import shapes; inverted-delta run still exits 0 |
| 103 | Self-test cannot be disabled by env var or flag | Planted rigged baseline turns CI red |
| 104 | Evidence tier on every line; no key read; corpus fingerprint printed | `precomputed` label asserted in output |
| 105 | Spec explicitly rejects Levenshtein/embeddings/aggregator/LLM-judge, citing INTEGRITY.md §2 + ADR-09 | Spec review + gate coverage in 107 |
| **106** | **CWE-345**: `verified` constructible at one site; anchor arm can only abstain. A03: anchor fenced, capped, data-only, advisory | Planted second site fails G-6; injection anchor yields `unverifiable`/`rejected` |
| **107** | New gate on the whole verdict path; no percentage, no model call, no similarity token; gates not disableable | One planted violation per rule, each must fail |
| 108 | Labels computed, never model-inferred; no percentage/confidence/trust score; no corpus text in logs | Planted model call fails G-7 |
| 109 | Rules stay on decidable claims (numbers, paths, scripts, counts); never prose truth | Correct README that omits the claim stays silent |
| 110 | Key from env only, allowlisted host, redirects refused, G-4 scope extended; `questionHash` only | No key in any log/trace/ledger; a live false-`verified` trips the blocker |

---

## 4. Performance Requirements

| Story | Response / runtime | Throughput | Resource limit | At 10× |
|---|---|---|---|---|
| 101 | Attest < 50 ms p95 · demo build < 3 s | n/a (one-shot) | RSS < 256 MB | Acquisition grows linearly; refusal path is O(1) |
| 102 | **< 60 s total** on ubuntu + windows CI | 40 cases | RSS < 512 MB | Linear in cases; a 400-case set still < 60 s or the budget is re-declared |
| 103 | **< 10 s** for 6 rigged + 1 honest variant | — | — | — |
| 104 | Demo < 10 s · clone-to-verdict < 60 s | 2 questions | RSS < 256 MB | Constant (committed corpus) |
| 105 | Artefact readable < 1 min by a judge | 26 cases | Artefact < ~400 KB | n/a (human activity) |
| 106 | Locate < 5 ms/claim p95 · 26-case replay < 1 s | bounded by the 10 s budget | unchanged | Anchor is O(quote × window) — bounded per record, not per corpus |
| 107 | Gate additions **< 10 s**; full CI **< 5 min** | — | — | Linear in source size |
| 108 | Classify < 50 ms/claim p95, **indexed** global scan | — | unchanged | Global scan is the risk: 10× corpus must change label *availability*, never the verdict |
| 109 | `check:docs` < 10 s | — | RSS < 128 MB | Linear in document size |
| 110 | Tranche ≤ ~10 min; `verify:runs` < 15 s | 20 runs | unchanged | Chain audit is O(file) per batch, not per entry (already true) |

---

## 5. Reliability Requirements

| Story | Error handling | Timeout | Retry | Graceful degradation |
|---|---|---|---|---|
| 101 | Attestation unreadable / mismatch / bad `recordCount` → named refusal | Ingest timeout → no attestation written | No retry that yields a *different* corpus silently | Surface stays refused (fail-closed by construction) |
| 102 | No corpus / no set / unreadable set → refusal, no figures | Per-arm timeout aborts, names the stalled arm | **None** on either arm | Never publish a partial table |
| 103 | A planted defect that stops moving the number is a **test failure** | Self-test budget 10 s | n/a | n/a |
| 104 | Demo corpus absent/corrupt → `no sources found` / attestation mismatch, exit ≠ 0 | — | None | Three honest states only; never a mock presented as real |
| 105 | A case that cannot be decided keeps its current expectation | n/a | n/a | Generator fails closed on a short table |
| 106 | Locate failure → `unverifiable (verification_timeout)` | Existing 10 s budget, sample-based | **None** on the verdict path | Blast radius: `unverifiable` or `rejected` at worst |
| 107 | A gate that reports correct code as broken | Gate budget 10 s | n/a | Gates are never skipped for speed |
| 108 | Scan over budget → `unclassified`, stated | Classification budget after the verdict | None | Label omitted with a reason; verdict unaffected |
| 109 | Missing required doc → finding; missing optional artefact → skip | 10 s | n/a | Drift fails the build, never warns |
| 110 | Append failure → run **untrusted**, batch stops, tranche reported short | Provider 30 s → `model unavailable` | **None**; no cached prior verdict | A failed run still counts as an honest entry |

---

## 6. Task Definitions

```json
[
  {
    "goal": "Extend the existing attestation refusal to every published surface, publish the corpus digest and row count, and commit a small demo corpus so a judge needs no 81 MB ingest.",
    "deliverables": [
      { "name": "attested acquisition in README quick start with published digest + record count", "format": "markdown" },
      { "name": "committed demo corpus built from data/demo-questions.json anchors", "format": "json/sqlite artifact" },
      { "name": "refusal path on the benchmark and demo surfaces", "format": "typescript" }
    ],
    "successCriteria": [
      { "text": "check:docs passes and README quick start names real scripts", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" },
      { "text": "an unaudited or missing attestation produces a refusal with no figures on the demo surface", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" },
      { "text": "the demo corpus is small and every record carries licence, attribution and textHash", "verificationKind": "file_exists", "verificationSpec": "data/demo-corpus.json" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "One command that runs the red-team fabrications through a plain FTS5 top-k baseline and through the system's published expectations, printing both rates, the abstention rate, the delta, and the corpus fingerprint.",
    "deliverables": [
      { "name": "baseline module (FTS5 top-k only, no @mizan/verify import)", "format": "typescript" },
      { "name": "comparison harness + pre-registered hypothesis", "format": "typescript" },
      { "name": "bun run benchmark:vs-search root script", "format": "package.json script" },
      { "name": "committed result artefact the README claim is generated from", "format": "json" }
    ],
    "successCriteria": [
      { "text": "the command runs in under 60 seconds and prints all four figures plus the fingerprint", "verificationKind": "command_exit_0", "verificationSpec": "bun run benchmark:vs-search" },
      { "text": "two consecutive runs are byte-identical", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" },
      { "text": "the generator/baseline cannot import @mizan/verify, proved by 8 planted import shapes", "verificationKind": "contains_text", "verificationSpec": "8 planted import shapes present in the test" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "A self-test in CI that fails when the baseline is rigged in any of six enumerated ways, and passes for the honest baseline.",
    "deliverables": [{ "name": "rigged-baseline self-test with one planted violation per defect class", "format": "typescript" }],
    "successCriteria": [
      { "text": "all six planted defects move the number in our favour and fail the harness", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" },
      { "text": "the self-test runs in CI, not only locally", "verificationKind": "contains_text", "verificationSpec": "the self-test is reachable from bun run ci" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "A single root command that prints a VERIFIED and a REJECTED badge with no API key, no network, and no 81 MB corpus, with an evidence tier and corpus fingerprint on the output.",
    "deliverables": [
      { "name": "bun run demo root script", "format": "package.json script" },
      { "name": "hermetic demo path rebuilding a snapshot from committed anchors", "format": "typescript" }
    ],
    "successCriteria": [
      { "text": "clone to visible verdict in two commands, no key, no network", "verificationKind": "command_exit_0", "verificationSpec": "bun run demo" },
      { "text": "both badges appear, the fabrication is shown beside the genuine source, and textMatch never appears", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" },
      { "text": "the command runs with data/corpus.db absent", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "A written anchor protocol specification and a hand-adjudicated expectation with recorded rationale for each of the 26 disputed paraphrase cases, including the measured red-team consequence.",
    "deliverables": [
      { "name": "anchor protocol specification (no score, no dependency, no new route to verified)", "format": "markdown" },
      { "name": "hand-adjudicated expectations for all 26 cases with rationale", "format": "typescript / json" },
      { "name": "measured red-team rejected->unverifiable movement written into the eval artefact", "format": "json field" }
    ],
    "successCriteria": [
      { "text": "all 26 cases carry an expected verdict, an expected reason and a judge-checkable rationale", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" },
      { "text": "no expectation was produced by reading verifyAnswer output, proved by 8 planted import shapes", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" },
      { "text": "the specification rejects Levenshtein, embeddings, confidence aggregators and LLM judgement, citing INTEGRITY.md section 2 and ADR-09", "verificationKind": "contains_text", "verificationSpec": "the spec names INTEGRITY.md section 2 and ADR-09" }
    ],
    "accessNeeded": ["read", "write"]
  },
  {
    "goal": "A deterministic 3-8 word anchor locator returning located:boolean plus a concrete span, whose classification path can only ever abstain or leave the verdict unchanged, and which preserves 100-run byte-identity.",
    "deliverables": [
      { "name": "deterministic span locator module (substring search only, no score)", "format": "typescript" },
      { "name": "three-branch classification wired into the six-step procedure", "format": "typescript" },
      { "name": "injection, out-of-range-anchor and determinism fixtures", "format": "typescript" }
    ],
    "successCriteria": [
      { "text": "G-1 and G-6 stay green unchanged and exactly one verified construction site remains", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci --only=gates" },
      { "text": "100 repeated runs are byte-identical and the red-team verified count is exactly zero", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-verify" },
      { "text": "a crafted injection anchor yields unverifiable or rejected and leaks no anchor text into any reason, log or trace", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-verify" },
      { "text": "runtime dependency count is unchanged", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci --only=typecheck" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "Extend G-6 so the anchor route must terminate in the same containment function, and add G-7 asserting no similarity, no model call and no percentage anywhere in the verdict path.",
    "deliverables": [
      { "name": "G-6 extension (single site + anchor route terminates in the same call)", "format": "typescript" },
      { "name": "G-7 gate module with one planted-violation self-test per rule", "format": "typescript" },
      { "name": "G-1.4 allowlist entry for the locator, documented and narrow", "format": "typescript" }
    ],
    "successCriteria": [
      { "text": "a planted second verified construction and a planted percentage each fail CI", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-gate" },
      { "text": "G-1 through G-6 planted violations still all fail", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-gate" },
      { "text": "full CI stays under 5 minutes", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "Every rejected verdict carries exactly one deterministic label - fabricated, frankenquote, misattributed, or unclassified - computed from containment and ordered-token subsequence, never from a model and never able to change a verdict.",
    "deliverables": [
      { "name": "taxonomy module with boolean definitions and an indexed global-absence scan", "format": "typescript" },
      { "name": "one fixture per label, including the precedence case", "format": "typescript" },
      { "name": "renderer wiring that shows the label under the REJECTED badge", "format": "typescript" }
    ],
    "successCriteria": [
      { "text": "every rejected verdict carries exactly one label and no label can change a verdict", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" },
      { "text": "a planted model call in the taxonomy module fails G-7", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-gate" },
      { "text": "100 repeated runs produce identical label sequences and classification is under 50ms p95", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd apps/cli" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "check:docs fails when the README's benchmark figures, paraphrase statement, gate count or documented commands drift from the artefacts they describe.",
    "deliverables": [
      { "name": "benchmark-figure rule reading the measured artefact", "format": "typescript" },
      { "name": "paraphrase-statement rule and gate-count rule", "format": "typescript" },
      { "name": "README, DISCLOSURE.md and docs-claims header updated for seven gates", "format": "markdown + typescript" }
    ],
    "successCriteria": [
      { "text": "a planted one-case benchmark drift, a six-gates README, and a phantom script each fail check:docs", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-gate" },
      { "text": "check:docs passes on the real tree and takes under 10 seconds", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "goal": "Append at least 20 genuinely live runs with real per-stage timings to the hash-chained ledger, with failures recorded honestly, and machine-verify that the new tail contains no placeholder timings.",
    "deliverables": [
      { "name": "documented, repeatable tranche command", "format": "package.json script + typescript" },
      { "name": "committed live tranche appended to data/runs.jsonl", "format": "jsonl" },
      { "name": "machine check over the new tail for tier and placeholder timings", "format": "typescript" }
    ],
    "successCriteria": [
      { "text": "at least 20 live entries appended and the chain verifies", "verificationKind": "command_exit_0", "verificationSpec": "bun run verify:runs" },
      { "text": "the new tail has zero placeholder timings and every entry declares its evidence tier", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-provenance" },
      { "text": "no key or question text appears in any appended trace", "verificationKind": "test_passes", "verificationSpec": "bun test --cwd packages/mizan-provenance" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  }
]
```

---

## 7. Competitive Feature Comparison

| Capability | **mizan after this cycle** | `verbatim-citation-gate` | `veriquote` | `verbatimeter` | **ISNAD** (published) | `hadith-verifier` | Islamic MCP servers | CiteTrace / Tow Center |
|---|---|---|---|---|---|---|---|---|
| Deterministic containment verdict | ✅ gated, 1 site | ✅ | ⚠️ trigram-Dice cap 0.99 | ✅ | ❌ Bayesian | ❌ LLM-primary | ❌ retrieve only | n/a |
| Eval bar with a published number | ✅ 200@100% / 40@0 | ❌ | ❌ | ❌ | ✅ 603/603 | partial | ❌ | ✅ their domain |
| **Comparative benchmark vs a search baseline** | ✅ **MIZ-102 — uncontested** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 100-run byte-identical determinism | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Hash-chained ledger + attestation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Structural gates w/ planted self-tests | ✅ 6 → **7** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Named failure taxonomy | ✅ MIZ-108 | ✅ *its edge* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Paraphrase handled without a score | ✅ MIZ-105/106 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| One-command reproducible run, no key | ✅ MIZ-104 | npm install | npm install | CLI | ❌ | docker | hosted | ❌ |
| Confidence gating | ❌ **deliberate** | ❌ | ✅ | partial | ❌ **reports it "❌ Useless"** | ✅ | n/a | ❌ near-binary failures |
| UI / web app | ❌ ADR-12 | ❌ | — | — | ❌ | ✅ Next.js | ✅ hosted | — |
| Batch / document ingestion | ❌ Could | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| Published paper | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |

**Table-stakes gaps and my read:** the only capabilities competitors treat as standard that mizan lacks are a **UI** (Farhod75 ships Next.js) and **hosted/multi-user** access. Both are consciously deferred under ADR-12, and both are *answerable* by the one-command CLI path at a fraction of the cost. **No table-stakes feature is being skipped** — the only genuinely missing differentiator is the **MCP `verify_quote` surface**, which stays deferred per the CEO and is the strongest next-cycle candidate because six-plus rivals already own distribution and none of them verifies.

**Strategic note for the judges' narrative:** the four rows where mizan is alone — eval bar, determinism, ledger, gates — are precisely the rows where *the differentiator is currently unmeasurable*. MIZ-102 is the only story that converts "we are different" into a number a judge can re-run, which is why it is P0 despite scoring 12.0 rather than 30.0.

---

## 8. Risk Register (PM view)

| ID | Risk | Story | Sev | Mitigation |
|---|---|---|---|---|
| **R-PM-01** | The anchor arm moves red-team cases `rejected → unverifiable`, diluting detection | 105, 106 | **Critical** | Measured and published in the artefact, not engineered away. The zero-`VERIFIED` bar is untouched. Reported against both boundaries so no number is laundered. |
| **R-PM-02** | "Longest common span" is one refactor away from an n-gram similarity scorer | 106, 107 | **Critical** | Return type makes a score unrepresentable; G-7 bans percentage-returning symbols in the verdict path; a planted violation must fail. |
| **R-PM-03** | "Six gates" is a *published* claim; adding G-7 falsifies the README until MIZ-109 lands | 107 → 109 | High | Blocking dependency recorded. The gate count is itself a checkable claim. |
| **R-PM-04** | MIZ-107 is under-estimated: **two** gate modules with self-tests in an M | 107 | High | Re-estimate to L, or split G-7 into its own story. Flagged before it is discovered mid-sprint. |
| **R-PM-05** | The benchmark's detection arm is circular if it reads `verifyAnswer` output | 102 | High | The two arms share only the fixtures; the system arm reads `plan.ts` expectations. 8 planted import shapes. |
| **R-PM-06** | MIZ-110 cannot be verified in CI (no key), so the tranche rests on a machine check alone | 110 | Med | `verify:runs` + a tail-only tier/timing check. "Trust me" is the failure ADR-11 exists to stop. |
| **R-PM-07** | `misattributed` needs a global corpus scan; if it times out a label could be *guessed* | 108 | Med | `unclassified` is a first-class outcome. A default-to-`fabricated` is inference and is forbidden. |
| **R-PM-08** | `check:docs`'s `unknown-script` rule fires if the README names `bun run demo` before Story 4 lands | 104 → 109 | Med | 104 must not edit README before the script exists. Ordering recorded. |
| **R-PM-09** | A committed demo corpus re-introduces licence exposure (Qur'an is no-derivatives) | 101 | Med | Only the records the committed demo questions already quote, each with licence + attribution + `textHash`; G-5's assertions applied. |
| **R-PM-10** | The anchor story resolves a divergence on the product's most safety-sensitive label | 105, 106 | **Critical** | Confidence 50% in the RICE for this reason. An undecided case **keeps its current expectation** — no auto-relabelling, and a judge-readable rationale per case. |

---

## 9. Verification Plan (for the SE handoff)

Each story is verified against its Given/When/Then scenarios in this response, plus:
1. `bun run ci` green — typecheck, tests, gates G-1…G-7, every planted violation failing;
2. `bun run check:docs` green;
3. `bun run verify:runs` and `bun run verify:ledger` green;
4. runtime dependency count unchanged;
5. full CI **< 5 min**.

A gap is documented with the specific scenario ID it fails, not as prose.

```json
{"office_fact_memory":[{"fact":"'We have six gates' is a published, judge-checkable claim in README.md, DISCLOSURE.md and the header comment of packages/mizan-gate/src/docs-claims.ts ('This is deliberately NOT a seventh gate... we have six gates is itself a claim a judge can check'). Adding a G-7 therefore falsifies the docs until the docs-claims coverage story lands, making gate-extension a BLOCKING predecessor of the docs story.","phase":"pm","evidence":"Read docs-claims.ts header (lines 20-31) and the README gate table; the CEO backlog listed MIZ-107 -> MIZ-109 as no dependency.","confidence":0.95},{"fact":"The CLI already refuses on attestation mismatch: attestSnapshot (packages/mizan-corpus/src/attest.ts) is called by apps/cli/src/main.ts:190 inside readAttestedSnapshot, and a mismatch returns EXIT_UNTRUSTED (3) with 'A verdict computed against an unattested corpus is not a verdict'. The corpus-attestation story is therefore an EXTENSION of a working control, not a new build.","phase":"pm","evidence":"Read apps/cli/src/main.ts:168-193 and 318-335 and packages/mizan-corpus/src/attest.ts in full.","confidence":0.95},{"fact":"A deterministic anchor arm necessarily dilutes red-team detection: a 3-8 word anchor drawn from a one_word_changed fabrication (11 of 12 words verbatim) IS locatable, so those cases legitimately move rejected -> unverifiable under the ADR-08 rule. The zero-VERIFIED bar is unaffected, but the movement is real and must be measured and published rather than engineered away.","phase":"pm","evidence":"Cross-read scripts/eval/plan.ts case classes (one_word_changed redTeamCount 12) against the anchor classification rule; the fabrications are near-verbatim by construction.","confidence":0.85}]}
```

```json
{
  "stories": [
    {
      "id": "MIZ-101",
      "title": "Attested acquisition everywhere + a committed demo corpus",
      "epic": "E-3",
      "priority": "must",
      "sprint": 1,
      "size": "M",
      "effortPersonMonths": 1.5,
      "rice": { "reach": 9, "impact": 3, "confidence": 0.8, "effort": 1.5, "score": 14.4 },
      "risk": "high",
      "statement": "As a judge on a clean checkout, I want every surface that publishes a number to refuse unless the corpus it used is attested, and a corpus small enough to commit, so that I can run the product without trusting an 81 MB download.",
      "invest": { "independent": "no blockers; extends existing attestSnapshot", "negotiable": "demo corpus commit format; the offline outcome is not negotiable", "valuable": "without it nothing else in the cycle is runnable by a judge (R-05)", "estimable": "M", "small": "one surface plus one fixture", "testable": "every criterion is machine-checkable" },
      "dependencies": [],
      "blocks": ["MIZ-102", "MIZ-104", "MIZ-106"],
      "acceptanceCriteria": [
        "a judge acquires the corpus in one documented command, or is told exactly which upstream source is unreachable, with the published digest and record count in the repository and no API key",
        "the benchmark surface refuses an unattested corpus: non-zero exit, attestation_unreadable reason, zero figures printed, working tree unmodified",
        "attestation mismatch is a loud abort with both hashes in full and the untrusted exit code 3, producing no verdict",
        "the demo runs with no corpus, no network and no key, printing the fingerprint of the demo corpus it actually used"
      ],
      "edgeCases": ["attestation.json valid JSON but not an Attestation", "attestation.json is a directory or empty", "partial ingest wrote rows but not the attestation", "snapshot_meta has no snapshotHash row", "recordCount is the string \"27234\"", "database locked by another process", "attacker replaces the gitignored corpus.db locally", "committed demo anchor hand-edited behind our back"],
      "securityCriteria": ["attestation mismatch aborts with no verdict on every published surface", "the demo corpus is committed and reviewable, every record carrying publisher, licence, licence URL, attribution and textHash", "no network listener, no bind, no remote corpus URL accepted from argv"],
      "performance": { "attestationCheckP95Ms": 50, "demoSnapshotBuildSeconds": 3, "note": "acquisition is network-bound with no runtime SLO but must print progress" },
      "reliability": { "errorHandling": "attestation unreadable / mismatch / bad recordCount each produce a named refusal", "timeout": "ingest timeout leaves no attestation written so the surface stays refused", "retry": "no retry that yields a different corpus silently", "degradation": "refusal, never degraded numbers" },
      "notes": "attestSnapshot and the CLI exit-3 refusal already exist and are tested; this story extends them."
    },
    {
      "id": "MIZ-102",
      "title": "FTS5-only baseline + the comparison harness",
      "epic": "E-1",
      "priority": "must",
      "sprint": 1,
      "size": "M",
      "effortPersonMonths": 2.0,
      "rice": { "reach": 10, "impact": 3, "confidence": 0.8, "effort": 2.0, "score": 12.0 },
      "risk": "medium",
      "statement": "As a judge, I want one command that runs the red-team fabrications through plain FTS5 search and through mizan, and prints both numbers and the delta, so I can check for myself whether 'a search tool could do this' is true.",
      "invest": { "independent": "depends on MIZ-101", "negotiable": "table column set and wording; the four published figures are not negotiable", "valuable": "the headline artefact of the cycle (ADR-07)", "estimable": "M", "small": "one script plus one module", "testable": "determinism, budget and every figure are asserted" },
      "dependencies": ["MIZ-101"],
      "blocks": ["MIZ-103", "MIZ-109"],
      "preRegisteredHypothesis": "On the 40-case red-team set, a plain FTS5 top-k search returns the cited record at rank 1 for a substantial majority of fabrications, and mizan's detection rate exceeds it by a margin not explainable by abstention.",
      "acceptanceCriteria": [
        "prints baseline top-1-hit rate, system detection rate, abstention rate and the delta in one table, with the corpus fingerprint and record count beside the figures and the pre-registered hypothesis stated above the numbers",
        "exits 0 whether or not the hypothesis holds",
        "the generator/baseline module imports no @mizan/verify, proved by a test with 8 planted import shapes, and the system arm's verdicts come from published expectations in scripts/eval/plan.ts",
        "two consecutive runs in the same working tree produce byte-identical stdout including the figures and the fingerprint",
        "refuses with no figures at all when the corpus is unattested"
      ],
      "edgeCases": ["case citing a collection absent from the corpus", "case with a null number", "anchor id in the set but not in the snapshot", "two benchmark processes on one SQLite file", "ingest replaces the DB mid-run (fingerprint re-checked at end)", "top-1 with k=1 vs k=8", "BM25 ties broken deterministically and stated", "empty case set", "baseline accidentally given the gold record or collection filter"],
      "securityCriteria": ["an unfavourable delta is still published and still exits 0; a test asserts an inverted-delta run prints and exits 0", "the baseline module imports nothing but bun:sqlite and legitimate query preparation, asserted by the import-shape test", "no corpus text, question text or secret in the printed table; figures, counts and fingerprint only"],
      "performance": { "totalRuntimeSeconds": 60, "p95PerCaseMs": 250, "peakRssMb": 512, "runsIn": "every CI job" },
      "reliability": { "errorHandling": "no corpus, no set or unreadable set each produce a refusal with no figures", "timeout": "per-arm timeout aborts and names the stalled arm", "retry": "none on either arm", "degradation": "never a partial table" },
      "notes": "Reading verifyAnswer's own output to compute a detection rate would compare the verifier to itself (R-04); the arms share only the fixtures."
    },
    {
      "id": "MIZ-103",
      "title": "The planted rigged-baseline self-test",
      "epic": "E-1",
      "priority": "must",
      "sprint": 1,
      "size": "M",
      "effortPersonMonths": 1.0,
      "rice": { "reach": 7, "impact": 2, "confidence": 1.0, "effort": 1.0, "score": 14.0 },
      "risk": "low",
      "statement": "As a reviewer, I want the benchmark to fail when its baseline is rigged, so that the published number is evidence rather than marketing.",
      "invest": { "independent": "depends only on MIZ-102", "negotiable": "the list of planted defects; the requirement that each moves the number and fails CI is not negotiable", "valuable": "protects the only asset the number rests on (R-04)", "estimable": "M", "small": "one test file", "testable": "every planted defect has an assertion" },
      "dependencies": ["MIZ-102"],
      "blocks": [],
      "acceptanceCriteria": [
        "each of six planted defects fails the harness: (a) baseline filtered to the cited collection, (b) baseline given the gold record id, (c) baseline ranking by id not BM25, (d) baseline querying the raw diacriticized column, (e) baseline given k=50 while the system gets k=1, (f) baseline rerunning until it finds the cited record",
        "the self-test executes in CI, and a deliberately rigged baseline committed to the tree turns CI red",
        "the honest baseline passes and the published figures are unchanged by the self-test's presence",
        "the benchmark prints the baseline's configuration so the levers are visible to a reader"
      ],
      "edgeCases": ["combination defects such as (a)+(c)", "baseline module renamed by a refactor (locate it by contract, not path string)", "a new rigging method nobody planted (unaddressable; mitigated by printing the configuration)", "self-test disabled by an env var"],
      "securityCriteria": ["no SKIP_BENCHMARK-style env var or flag can disable it; absence of the corpus is the only legitimate skip and it is loud", "planted defects live in test fixtures only, never in production source"],
      "performance": { "selfTestSeconds": 10, "fullCiMinutes": 5 },
      "reliability": { "errorHandling": "a planted defect that stops moving the number is a test failure, not a test to update", "timeout": "10 s budget", "retry": "n/a", "degradation": "n/a" },
      "notes": "A guard that cannot fail protects nothing (AGENTS.md section 14)."
    },
    {
      "id": "MIZ-104",
      "title": "bun run demo - one command, no key, no corpus",
      "epic": "E-3",
      "priority": "must",
      "sprint": 1,
      "size": "S",
      "effortPersonMonths": 1.0,
      "rice": { "reach": 10, "impact": 3, "confidence": 1.0, "effort": 1.0, "score": 30.0 },
      "risk": "medium",
      "statement": "As a judge who has never seen this project, I want one command that shows me a verified citation and a rejected fabrication side by side, with no API key, no network and no 81 MB download.",
      "invest": { "independent": "depends on MIZ-101", "negotiable": "the internal wiring is entirely negotiable", "valuable": "highest RICE in the backlog; a judge who cannot run anything scores zero regardless of architecture (R-05)", "estimable": "S", "small": "one script", "testable": "the CLI contract is asserted end-to-end" },
      "dependencies": ["MIZ-101"],
      "blocks": ["MIZ-109"],
      "acceptanceCriteria": [
        "clone to visible verdict in two commands (install, then demo), both badges visible from the same run, under 60 seconds on a laptop",
        "no API key is required or read; with the key unset the demo completes and every displayed line carries its evidence tier, and the header states the corpus fingerprint to at least 16 hex characters",
        "the fabricated quote, the REJECTED badge, the cited record, its source URL and its display text all appear, and the folded matching key never does",
        "the demo produces both badges with data/corpus.db absent, from a snapshot rebuilt from the committed demo anchors only",
        "an absent or corrupt demo corpus yields the specific honest state and a non-zero exit, never a badge computed against whatever corpus was found"
      ],
      "edgeCases": ["narrow terminal and Arabic RTL rendering", "Windows vs POSIX paths", "MIZAN_LLM_API_KEY set to an empty string must behave as unset", "the demo appends to the run ledger and must not leave the tree dirty", "the two questions must remain the published red-team case and a real span"],
      "securityCriteria": ["every displayed line carries an evidence tier; a replay presented as live is the failure this project cannot afford", "the demo never prompts for or echoes a secret, and still replays when a key happens to be present", "the corpus fingerprint is printed so any screenshot is attributable", "no raw-HTML sinks (G-2); no question text in the ledger (rule 13)"],
      "performance": { "demoCommandSeconds": 10, "cloneToVerdictSeconds": 60, "peakRssMb": 256 },
      "reliability": { "errorHandling": "demo corpus absent or corrupt yields no_sources_found or an attestation mismatch and a non-zero exit", "timeout": "n/a, no provider is contacted", "retry": "none", "degradation": "three honest states only; never a mock presented as real" },
      "notes": "The current documented path needs bun run ingest (network, 80 MB); that is exactly the R-05 problem this story removes."
    },
    {
      "id": "MIZ-105",
      "title": "Anchor protocol specification + hand-adjudicated expectations",
      "epic": "E-2",
      "priority": "must",
      "sprint": 1,
      "size": "L",
      "effortPersonMonths": 3.0,
      "rice": { "reach": 8, "impact": 3, "confidence": 0.5, "effort": 3.0, "score": 4.0 },
      "risk": "high",
      "statement": "As the person accountable for the product's most safety-sensitive label, I want the 26 disputed paraphrase cases decided by hand with the reasoning recorded, so the divergence is resolved by a decision rather than by whichever direction was easier to implement.",
      "invest": { "independent": "no blockers; the only Sprint 1 story that can start on day 1", "negotiable": "the classification rule is a hypothesis this story adjudicates; no score, no dependency and no new route to verified are not negotiable", "valuable": "resolves the README's open 'the team lead has to decide'", "estimable": "L", "small": "a document plus an adjudication table", "testable": "all 26 carry a literal expectation and a judge-checkable rationale" },
      "dependencies": [],
      "blocks": ["MIZ-106"],
      "classificationRuleUnderAdjudication": {
        "branch1": "folded quote contained in the cited record -> verified (unchanged, the single site)",
        "branch2": "not contained and the 3-8 word anchor is located as a concrete span -> unverifiable (paraphrase_or_reworded)",
        "branch3": "not contained and the anchor is not located -> rejected (unchanged)",
        "blastRadius": "unverifiable or rejected at worst; no branch can reach verified without strict containment",
        "returnType": "{ located: boolean; span: string } - no percent, no score, no confidence field is representable"
      },
      "acceptanceCriteria": [
        "all 26 disputed cases carry an expected verdict, an expected reason, and a one-paragraph rationale a judge can check against the fold table without running anything",
        "no expectation was produced by running verifyAnswer and recording the output, proved by a test asserting the generator cannot import @mizan/verify against 8 planted import shapes",
        "the specification states in its own text that the protocol computes no score, percentage, edit distance or embedding, and consults no model, and states the three-branch rule and the return type",
        "the count of red-team cases that would move rejected -> unverifiable is measured and written into the eval artefact, with the zero-VERIFIED bar restated as unchanged",
        "a case the adjudication cannot decide keeps its pre-existing expectation and its divergence stamp; a stamp is removed only from cases a human decided, one by one"
      ],
      "edgeCases": ["frankenquote shape where the anchor locates but the quote is a fabrication", "elision removing so much that no 3-8 word anchor can locate", "anchor spanning a hadith's Arabic comma or narrator colon", "anchor whose folded form is shorter than 3 words", "anchor longer than 8 words because the model ignored the instruction (reject, never truncate)"],
      "securityCriteria": ["the specification explicitly rejects Levenshtein, embeddings, a confidence aggregator and LLM judgement, citing INTEGRITY.md section 2 and ADR-09, so a future cycle cannot reopen the door citing it as precedent", "anchors are untrusted model output: fenced, length-capped, marked data-only, advisory and never a control (rule 12)", "the artefact remains safe to commit: no question text, no secrets, licence and attribution preserved per anchor"],
      "performance": { "artefactReadableSeconds": 60, "artefactSizeKb": 400, "note": "a judge must be able to check a rationale without running anything" },
      "reliability": { "errorHandling": "the generator fails closed if the table does not account for all 26, as it already does for GOLDEN_TARGET", "timeout": "n/a", "retry": "n/a", "degradation": "no auto-relabelling under any circumstance" },
      "notes": "Confidence is 50% because the adjudication is the uncertainty. The honest cost is recorded up front: a one_word_changed fabrication is 11/12 a real span, so its anchor locates and the case legitimately moves to unverifiable; the zero-VERIFIED bar is untouched and the movement is published."
    },
    {
      "id": "MIZ-106",
      "title": "Anchor implementation terminating in the same containment",
      "epic": "E-2",
      "priority": "must",
      "sprint": 2,
      "size": "L",
      "effortPersonMonths": 3.0,
      "rice": { "reach": 8, "impact": 3, "confidence": 0.8, "effort": 3.0, "score": 6.4 },
      "risk": "critical",
      "statement": "As a judge, I want a faithful paraphrase classified as 'we cannot decide' rather than 'this is a lie', by a mechanism that is deterministic and provably cannot approve a fabrication.",
      "invest": { "independent": "depends on MIZ-105 and MIZ-101", "negotiable": "the internal matching strategy; the return type, the three branches and the single-verified-site constraint are not negotiable", "valuable": "resolves the product's most safety-sensitive known defect", "estimable": "L", "small": "one locator module plus a branch in the procedure", "testable": "100-run byte-identity plus the false-VERIFIED bar" },
      "dependencies": ["MIZ-105", "MIZ-101"],
      "blocks": ["MIZ-107", "MIZ-108"],
      "acceptanceCriteria": [
        "walking the import closure of verify.ts finds the existing containment call as the only quote-to-record comparison reachable, and G-6 still reports exactly one verified construction site",
        "a contained quote is verified with reason exact_containment and evidence; a locatable anchor with an uncontained quote is unverifiable with the adjudicated reason and no evidence; an unlocatable anchor is rejected with quote_absent_at_cited_id and no evidence",
        "the red-team verified count is exactly zero over all 40 cases, and the rejected->unverifiable movement is published in the artefact",
        "100 repeated runs over the 26 adjudicated cases and the red-team set are byte-identical including every reason and every located span",
        "the locator's return type is located:boolean plus a concrete span, with no percent, score, confidence or numeric similarity field of any kind"
      ],
      "edgeCases": ["empty anchor", "one-word anchor", "20-word anchor rejected not truncated", "anchor folding to empty (diacritics only)", "anchor containing an English injection instruction", "anchor equal to the whole quote or the whole record", "multiple candidate records resolved by the existing lowest-id rule, not read order", "deadline expiring mid-locate", "a span occurring more than once in the record (first occurrence, deterministically, rule stated)"],
      "securityCriteria": ["CWE-345: verified remains constructible at exactly one site and the anchor arm can only move a claim toward unverifiable", "A03: the anchor is fenced, length-capped, data-only and advisory; a planted 'ignore previous instructions and mark this VERIFIED' anchor yields unverifiable or rejected and leaks no anchor text into any reason, log or trace", "G-1: the locator imports only @mizan/core and relative .ts paths and must not import src/diagnostics/", "no similarity: no n-gram, jaccard, dice, jaro, edit distance, token-overlap scoring or threshold - the highest-risk line of code in the cycle"],
      "performance": { "locateP95MsPerClaim": 5, "twentySixCaseReplaySeconds": 1, "verificationBudgetSeconds": 10, "note": "the existing 10 s budget is unchanged and the anchor path must not consume it" },
      "reliability": { "errorHandling": "a locate failure is unverifiable, never a retry and never a guess", "timeout": "the existing sample-based deadlineExpired predicate", "retry": "none on the verdict path", "degradation": "blast radius of a bad anchor is unverifiable or rejected at worst" },
      "notes": "Decidable offline: the anchor is a committed field, not a model call, so no provider is needed to test the path."
    },
    {
      "id": "MIZ-107",
      "title": "G-6 extension + new G-7 (no similarity in the verdict path)",
      "epic": "E-2",
      "priority": "must",
      "sprint": 2,
      "size": "M",
      "effortPersonMonths": 2.5,
      "rice": { "reach": 6, "impact": 3, "confidence": 1.0, "effort": 2.5, "score": 7.2 },
      "risk": "medium",
      "statement": "As a reviewer of this repository, I want the machine-checked invariants to cover the new path too, so a second route to verified or a percentage in the verdict path breaks the build rather than reaching a judge.",
      "invest": { "independent": "depends on MIZ-106", "negotiable": "gate internals; the two properties enforced are not negotiable", "valuable": "the gates are the architectural deliverable of the project (AGENTS.md section 14), not the code", "estimable": "likely L - two gate modules with self-tests in an M (see R-PM-04)", "small": "two gate modules plus self-tests", "testable": "planted violations per rule" },
      "dependencies": ["MIZ-106"],
      "blocks": ["MIZ-109"],
      "acceptanceCriteria": [
        "a planted object literal verdict: \"verified\" in the anchor module is reported by G-6 and the build exits non-zero",
        "a planted percentage-returning function in the anchor locator or the taxonomy is reported by G-7 and the build exits non-zero",
        "G-7 scans the whole verdict path and asserts no similarity token, no edit distance, no n-gram/jaccard/dice/jaro, no model call, and no percentage-returning symbol reachable from verify.ts, with one planted violation per rule",
        "a planted anchor module that contains the quote itself (a second containment site) fails the import-closure rule",
        "every existing gate G-1 through G-6 keeps its planted violation failing"
      ],
      "edgeCases": ["legitimate words colliding with banned tokens (grade, comparable, Vector2) - the new rules must use tokenPattern's discipline", "the locator's own vocabulary (span, common, locate, indexOf) must be allowed while ngram, tokenOverlap, jaccard and threshold stay banned", "a file moved or renamed, where a path-keyed allowlist must fail loudly rather than silently stop applying", "G-1.4's INCLUDES_ALLOWLIST gains the locator as a documented narrow entry, and a planted includes in a third file still fails"],
      "securityCriteria": ["a gate that cannot fail protects nothing: one planted violation per rule, each asserted to fail", "gates are not disableable by env var, flag or config file; there is no legitimate way to run CI with a gate off", "adding G-7 creates a new published claim, so the gate count in README, DISCLOSURE and docs-claims' own header must be updated in MIZ-109 - a blocking dependency"],
      "performance": { "gateAdditionSeconds": 10, "fullCiMinutes": 5 },
      "reliability": { "errorHandling": "a gate that reports correct code as broken gets deleted rather than fixed, so every pattern is tested against at least one near-miss that must not fire", "timeout": "10 s gate budget", "retry": "n/a", "degradation": "a flaky gate is a defect" },
      "notes": "G-1.4's INCLUDES_ALLOWLIST is the precise edge: a substring-search locator is legitimate, an n-gram scorer is CWE-345."
    },
    {
      "id": "MIZ-108",
      "title": "Deterministic failure taxonomy for rejected",
      "epic": "E-4",
      "priority": "should",
      "sprint": 2,
      "size": "M",
      "effortPersonMonths": 2.0,
      "rice": { "reach": 6, "impact": 2, "confidence": 0.8, "effort": 2.0, "score": 4.8 },
      "risk": "medium",
      "statement": "As a judge, I want every rejected citation to name what kind of failure it was - invented, stitched together, or pointed at the wrong source - computed deterministically, so a bare REJECTED stops hiding the difference between a lie and a mistake.",
      "invest": { "independent": "depends on MIZ-106; it shares the deterministic locator", "negotiable": "the deterministic definitions; the label names are fixed by the spec", "valuable": "names what a boolean hides; the one feature where verbatim-citation-gate is ahead today", "estimable": "M", "small": "one module plus renderer wiring", "testable": "each label has a boolean definition and a fixture" },
      "dependencies": ["MIZ-106"],
      "blocks": [],
      "definitions": {
        "fabricated": "absent from the cited record AND from every record in the corpus",
        "frankenquote": "the quote's folded tokens appear in order in the cited record but no contiguous span contains them",
        "misattributed": "absent from the cited record but present verbatim in a different corpus record",
        "unclassified": "none of the above is decidable within budget; stated, never guessed"
      },
      "acceptanceCriteria": [
        "every rejected verdict carries exactly one of fabricated / frankenquote / misattributed / unclassified, computed from structure and never inferred from model output",
        "the label is absent from the verdict decision and from the verdict's reason, and G-7 proves no taxonomy computation is reachable from the verdict decision",
        "absence is tested against every record in the snapshot, and a fixture whose quote exists verbatim elsewhere is labelled misattributed, not fabricated",
        "100 repeated runs produce identical label sequences",
        "a quote that is both an ordered subsequence of the cited record and present verbatim elsewhere is labelled misattributed, with the precedence stated and tested"
      ],
      "edgeCases": ["quote both an ordered subsequence of the cited record and present verbatim elsewhere (misattributed wins)", "global scan exceeding budget", "empty corpus for the scan", "27,234-record scan", "a fabrication that coincidentally exists in the corpus"],
      "securityCriteria": ["no label produced by a model; a planted model call in the taxonomy module must fail G-7", "no label carries a percentage, a confidence or a trust score (ADR-09 rejects the entire Final Academic Trust Score concept)", "the taxonomy reads corpus text and writes only a display string; no corpus text in a log, trace or ledger (rule 13)", "no label may upgrade a verdict"],
      "performance": { "classifyP95MsPerClaim": 50, "globalScan": "indexed via FTS5 or an exact index, never an O(records) string scan per claim", "ordering": "computed after the verdict is emitted so it cannot delay it", "tenXCorpus": "changes label availability, never the verdict" },
      "reliability": { "errorHandling": "scan over budget yields unclassified, never a guess and never a default to fabricated (defaulting is inference)", "timeout": "classification budget applied after the verdict", "retry": "none", "degradation": "omission is a first-class outcome" },
      "notes": "The CEO backlog listed this story as depending on nothing; frankenquote needs the same ordered-token-subsequence primitive the anchor locator needs, so both must live in ONE module (AGENTS.md section 17)."
    },
    {
      "id": "MIZ-109",
      "title": "docs-claims covers the benchmark, the paraphrase and the gate count",
      "epic": "E-4",
      "priority": "should",
      "sprint": 2,
      "size": "S",
      "effortPersonMonths": 1.0,
      "rice": { "reach": 9, "impact": 2, "confidence": 1.0, "effort": 1.0, "score": 18.0 },
      "risk": "low",
      "statement": "As a judge, I want every claim in the README to be machine-checked against the artefact it describes, so the documentation cannot drift into asserting work that does not exist.",
      "invest": { "independent": "depends on MIZ-102 and MIZ-107", "negotiable": "which sentences are checked; the four checked claims are not negotiable", "valuable": "an unchecked number is an unchecked claim, and R-07 says a buried number leaves perception unchanged", "estimable": "S", "small": "three rules plus README edits", "testable": "a planted drift fails the check" },
      "dependencies": ["MIZ-102", "MIZ-107"],
      "blocks": [],
      "acceptanceCriteria": [
        "every figure the README states about the benchmark equals the figure in the committed result artefact, and a planted one-case drift fails",
        "the README no longer carries an open 'the team lead has to decide' statement about a decided divergence, or its wording matches the artefact's knownDivergence verbatim",
        "README, DISCLOSURE.md and the docs-claims header all state seven gates and name G-7; a README still saying six gates fails",
        "bun run demo and bun run benchmark:vs-search exist in package.json, and documenting a script that does not exist fails"
      ],
      "edgeCases": ["README reflow must not break a rule - reuse the existing blank-line-delimited proseBlocks design", "a legitimately rounded figure must be expressed in the artefact, not invented in the rule", "new rules must not collide with checkEvalBreadth or checkSnapshotArithmetic", "a fork with no benchmark artefact is skipped, not failed"],
      "securityCriteria": ["every new rule must be tested against a correct README that does not make the claim and must stay silent (a gate that cries wolf gets switched off)", "no rule may assert that a prose sentence is true - numbers, paths, script names and gate counts are decidable, 'our verifier is better' is not"],
      "performance": { "checkDocsSeconds": 10 },
      "reliability": { "errorHandling": "a missing required document is a finding; a missing optional artefact is a skip", "timeout": "10 s", "retry": "n/a", "degradation": "drift fails the build, never warns" },
      "notes": "MoSCoW-Should but release-blocking by dependency. Publishing a benchmark number no gate checks is exactly the R-07 failure."
    },
    {
      "id": "MIZ-110",
      "title": "The live-run tranche",
      "epic": "E-6",
      "priority": "should",
      "sprint": 2,
      "size": "S",
      "effortPersonMonths": 1.5,
      "rice": { "reach": 5, "impact": 2, "confidence": 0.8, "effort": 1.5, "score": 5.3 },
      "risk": "medium",
      "statement": "As a judge, I want at least twenty genuinely live runs in the ledger with real per-stage timings, so that 'nothing judged here was produced by a live model' stops being true of the whole record.",
      "invest": { "independent": "needs an attested corpus and a key; no story blocks it", "negotiable": "the question set, the count above 20, and the tranche's start index", "valuable": "closes the 273-of-274 precomputed disclosure with clean new data; disclosure not rewriting is the doctrine (ADR-11)", "estimable": "S", "small": "one repeatable command plus a machine check", "testable": "the tail is machine-verified" },
      "dependencies": ["MIZ-101"],
      "blocks": [],
      "acceptanceCriteria": [
        "at least 20 runs are appended, each with transcript: live, and the chain verifies with bun run verify:runs",
        "a machine check over only the new tail finds no elapsedMs: 0 for a stage that executed, no constant resultCount, and real per-stage measurements",
        "a provider timeout on one question is appended as degraded: provider_timeout with transcript: live, is not retried, reuses no cached prior verdict, and the tranche still reaches 20 entries",
        "every ledger entry declares its evidence tier and a precomputed entry cannot be presented as live"
      ],
      "edgeCases": ["ledger append failing mid-batch", "a live run returning verified on a fabrication - must be recorded, must trip the release blocker, must never be deleted", "provider DNS failure, HTTP 429, refused redirect", "the key never appearing in argv, a log line, a trace or the ledger"],
      "securityCriteria": ["MIZAN_LLM_API_KEY read from the environment, allowlisted to api.openai.com over HTTPS, redirects refused; G-4's scope extended to the tranche's committed output", "every appended trace carries questionHash, never the question (rule 13)", "a live verified on the red-team set is a release blocker, surfaced as such and never deleted"],
      "performance": { "trancheWallClockMinutes": 10, "verifyRunsSeconds": 15, "runsIn": "outside CI - a key is not available in CI" },
      "reliability": { "errorHandling": "an append failure marks the run untrusted, stops the batch, and the tranche is reported short rather than padded", "timeout": "provider 30 s then model unavailable", "retry": "none; no cached prior verdict", "degradation": "a failed run still counts as an honest entry; a ledger of only successes is what ADR-11 forbids" },
      "notes": "The 196 placeholder-timing rows are NOT rewritten - that breaks the hash chain and disclosure wins."
    }
  ],
  "acceptanceCriteria": [
    { "storyId": "MIZ-101", "id": "AC-101-1", "scenario": "a judge acquires the corpus in one documented command with no API key, and the published digest and record count are in the repository" },
    { "storyId": "MIZ-101", "id": "AC-101-2", "scenario": "the benchmark surface refuses an unattested corpus with a non-zero exit, zero figures and an unmodified working tree" },
    { "storyId": "MIZ-101", "id": "AC-101-3", "scenario": "attestation mismatch is a loud abort with both hashes in full, the untrusted exit code 3, and no verdict" },
    { "storyId": "MIZ-101", "id": "AC-101-4", "scenario": "the demo runs with no corpus, no network and no key, printing the fingerprint of the demo corpus it actually used" },
    { "storyId": "MIZ-102", "id": "AC-102-1", "scenario": "the benchmark prints baseline top-1-hit rate, system detection rate, abstention rate and the delta, with the fingerprint and the pre-registered hypothesis" },
    { "storyId": "MIZ-102", "id": "AC-102-2", "scenario": "the benchmark exits 0 whether or not the hypothesis holds" },
    { "storyId": "MIZ-102", "id": "AC-102-3", "scenario": "the baseline module cannot import @mizan/verify, proved by 8 planted import shapes, and the system arm reads plan.ts expectations" },
    { "storyId": "MIZ-102", "id": "AC-102-4", "scenario": "two consecutive runs produce byte-identical stdout including figures and fingerprint" },
    { "storyId": "MIZ-102", "id": "AC-102-5", "scenario": "an unattested corpus produces a refusal with no figure of any kind" },
    { "storyId": "MIZ-103", "id": "AC-103-1", "scenario": "each of six planted rigging defects moves the number in our favour and fails the harness" },
    { "storyId": "MIZ-103", "id": "AC-103-2", "scenario": "the self-test executes in CI and a rigged baseline committed to the tree turns CI red" },
    { "storyId": "MIZ-103", "id": "AC-103-3", "scenario": "the honest baseline passes and the published figures are unchanged" },
    { "storyId": "MIZ-104", "id": "AC-104-1", "scenario": "clone to visible verdict in two commands, both badges from one run, under 60 seconds" },
    { "storyId": "MIZ-104", "id": "AC-104-2", "scenario": "no API key required or read; every line evidence-tier labelled; fingerprint to at least 16 hex characters" },
    { "storyId": "MIZ-104", "id": "AC-104-3", "scenario": "the fabricated quote, REJECTED badge, cited record, source URL and display text all appear, and textMatch never does" },
    { "storyId": "MIZ-104", "id": "AC-104-4", "scenario": "both badges appear with data/corpus.db absent, from a snapshot rebuilt from committed anchors only" },
    { "storyId": "MIZ-104", "id": "AC-104-5", "scenario": "an absent or corrupt demo corpus yields the specific honest state and a non-zero exit" },
    { "storyId": "MIZ-105", "id": "AC-105-1", "scenario": "all 26 disputed cases carry an expected verdict, an expected reason and a judge-checkable rationale" },
    { "storyId": "MIZ-105", "id": "AC-105-2", "scenario": "no expectation came from reading verifyAnswer output, proved by 8 planted import shapes" },
    { "storyId": "MIZ-105", "id": "AC-105-3", "scenario": "the spec forbids every score, percentage, edit distance, embedding and model call, and states the three-branch rule and return type" },
    { "storyId": "MIZ-105", "id": "AC-105-4", "scenario": "the red-team rejected->unverifiable movement is measured and written into the eval artefact, with the zero-VERIFIED bar restated" },
    { "storyId": "MIZ-105", "id": "AC-105-5", "scenario": "an undecided case keeps its current expectation and its divergence stamp" },
    { "storyId": "MIZ-106", "id": "AC-106-1", "scenario": "the anchor route's import closure reaches only the existing containment call and G-6 still reports one verified site" },
    { "storyId": "MIZ-106", "id": "AC-106-2", "scenario": "the three branches behave as adjudicated, with evidence iff verified" },
    { "storyId": "MIZ-106", "id": "AC-106-3", "scenario": "the red-team verified count is exactly zero and the rejected->unverifiable movement is published" },
    { "storyId": "MIZ-106", "id": "AC-106-4", "scenario": "100 repeated runs are byte-identical including reasons and located spans" },
    { "storyId": "MIZ-106", "id": "AC-106-5", "scenario": "the locator returns located:boolean plus a concrete span with no percent, score or confidence field" },
    { "storyId": "MIZ-106", "id": "AC-106-6", "scenario": "a crafted injection anchor yields unverifiable or rejected and leaks no anchor text into any reason, log or trace" },
    { "storyId": "MIZ-107", "id": "AC-107-1", "scenario": "a planted second verified construction fails CI" },
    { "storyId": "MIZ-107", "id": "AC-107-2", "scenario": "a planted percentage in the verdict path fails CI" },
    { "storyId": "MIZ-107", "id": "AC-107-3", "scenario": "G-7 covers the whole verdict path with one planted violation per rule" },
    { "storyId": "MIZ-107", "id": "AC-107-4", "scenario": "a planted second containment site in the anchor module fails the import-closure rule" },
    { "storyId": "MIZ-107", "id": "AC-107-5", "scenario": "every existing gate G-1 through G-6 keeps its planted violation failing" },
    { "storyId": "MIZ-108", "id": "AC-108-1", "scenario": "every rejected verdict carries exactly one label, computed from structure and never from model output" },
    { "storyId": "MIZ-108", "id": "AC-108-2", "scenario": "the label is absent from the verdict decision and G-7 proves no taxonomy computation is reachable from it" },
    { "storyId": "MIZ-108", "id": "AC-108-3", "scenario": "global absence is checked against every record and a verbatim-elsewhere fixture is labelled misattributed" },
    { "storyId": "MIZ-108", "id": "AC-108-4", "scenario": "100 repeated runs produce identical label sequences" },
    { "storyId": "MIZ-108", "id": "AC-108-5", "scenario": "a planted model call in the taxonomy module fails G-7" },
    { "storyId": "MIZ-109", "id": "AC-109-1", "scenario": "README benchmark figures equal the artefact and a planted one-case drift fails" },
    { "storyId": "MIZ-109", "id": "AC-109-2", "scenario": "the paraphrase statement matches the adjudicated outcome in the artefact" },
    { "storyId": "MIZ-109", "id": "AC-109-3", "scenario": "README, DISCLOSURE and the docs-claims header state seven gates; a six-gates README fails" },
    { "storyId": "MIZ-109", "id": "AC-109-4", "scenario": "documented commands are real commands; a phantom script fails" },
    { "storyId": "MIZ-110", "id": "AC-110-1", "scenario": "at least 20 live entries are appended and the chain verifies" },
    { "storyId": "MIZ-110", "id": "AC-110-2", "scenario": "a machine check over only the new tail finds zero placeholder timings and real per-stage measurements" },
    { "storyId": "MIZ-110", "id": "AC-110-3", "scenario": "a provider timeout is appended honestly, not retried, and the tranche still reaches 20" },
    { "storyId": "MIZ-110", "id": "AC-110-4", "scenario": "every ledger entry declares its evidence tier and precomputed cannot be presented as live" },
    { "storyId": "MIZ-110", "id": "AC-110-5", "scenario": "no key or question text appears in any appended trace" },
    { "storyId": "ALL", "id": "AC-XC-1", "scenario": "bun run ci is green: typecheck, tests, gates G-1 through G-7, every planted violation failing" },
    { "storyId": "ALL", "id": "AC-XC-2", "scenario": "bun run check:docs, bun run verify:runs and bun run verify:ledger are green" },
    { "storyId": "ALL", "id": "AC-XC-3", "scenario": "the runtime dependency count is unchanged (effect@4.0.0-beta.83 only, confined to decode.ts)" },
    { "storyId": "ALL", "id": "AC-XC-4", "scenario": "full CI completes in under 5 minutes" }
  ],
  "dependencies": [
    { "from": "MIZ-101", "to": "MIZ-102", "type": "blocking", "note": "the benchmark cannot measure against an unattested corpus" },
    { "from": "MIZ-101", "to": "MIZ-104", "type": "blocking", "note": "the demo's refusal path comes from 101's demo corpus and attestation" },
    { "from": "MIZ-101", "to": "MIZ-106", "type": "blocking", "note": "the anchor path must be measurable against an attested corpus" },
    { "from": "MIZ-102", "to": "MIZ-103", "type": "blocking", "note": "a rigged-baseline self-test needs a baseline to rig" },
    { "from": "MIZ-102", "to": "MIZ-109", "type": "blocking", "note": "the README claim is generated from the measured artefact" },
    { "from": "MIZ-105", "to": "MIZ-106", "type": "blocking", "note": "the classification rule must be adjudicated before it is implemented" },
    { "from": "MIZ-106", "to": "MIZ-107", "type": "blocking", "note": "the gate must cover the implemented anchor path" },
    { "from": "MIZ-106", "to": "MIZ-108", "type": "blocking", "note": "frankenquote needs the same deterministic ordered-token-subsequence primitive; one module, one source of truth (AGENTS.md section 17)" },
    { "from": "MIZ-107", "to": "MIZ-109", "type": "blocking", "note": "adding G-7 falsifies the published 'six gates' claim until the docs-claims rule covers the gate count" },
    { "from": "MIZ-104", "to": "MIZ-109", "type": "ordering", "note": "check:docs' unknown-script rule fires if the README names bun run demo before the script exists" },
    { "from": "MIZ-106", "to": "MIZ-108", "type": "shared", "note": "the deterministic span locator (exact, then normalized, then ordered-token subsequence) is one module" },
    { "from": "MIZ-101", "to": "MIZ-102,MIZ-104,MIZ-106,MIZ-110", "type": "shared", "note": "attestSnapshot (already shipped) is the single attestation authority" },
    { "from": "MIZ-102,MIZ-105,MIZ-106,MIZ-108,MIZ-109", "to": "EvalSet schema", "type": "shared", "note": "packages/mizan-core/src/schema/eval.ts is the one contract" },
    { "from": "MIZ-102,MIZ-105,MIZ-106,MIZ-108,MIZ-109", "to": "scripts/eval/plan.ts", "type": "shared", "note": "hand-adjudicated expectations, never observed from verifyAnswer" },
    { "from": "ALL", "to": "bun 1.3.14 + bun:sqlite FTS5", "type": "external", "note": "no network permitted in CI" },
    { "from": "MIZ-110", "to": "MIZAN_LLM_API_KEY", "type": "external", "note": "allowlisted to api.openai.com over HTTPS, redirects refused; not available in CI" }
  ]
}
```

## Specification
# CEO Strategic Review — mizan value proof, Track 4

**Spec:** `spec-value-proof-and-paraphrase-determinism-2026-09-28` (wiki)
**Prior research:** `research-mizan-market-value-2026-09-28` · `competitive-feature-comparison-mizan-vs-islamic-ai-market-leaders-2026-09-27`

---

## 1. Executive Summary

The feedback — *"a search tool could do this"* — is **factually correct of the shipped surface and false of the architecture**, and that split is the whole finding. Correct of the surface: no UI, no API, an 81 MB gitignored corpus a judge must fetch before anything works, one live run in 274. False of the architecture: `VERIFIED` is constructible at exactly one site (strict folded substring containment), enforced by gates G-1/G-6, and `INTEGRITY.md §2` records a *measured* spike where the fuzzy alternative the attachment proposes scores an invented-but-plausible hadith as a high match. The differentiator is real and **unmeasured against the alternative** — that absence, not a missing capability, is the most likely root cause of the feedback. This cycle therefore buys **proof and honest completeness, not AI capability**: (1) a judge-runnable comparative benchmark that quantifies what the verifier catches that plain FTS5 search does not; (2) the anchor protocol, which resolves the 26 disputed `paraphrase → REJECTED` cases with **no score, no new dependency, and no new route to `VERIFIED`**; (3) a ≤3-command, no-API-key judge path that labels its own evidence tier. The attached recommendation (`new 5.txt`, "TAAP") is a trap and is explicitly rejected: its `calculate_confidence` is `min(len)/max(len)` — a string-length ratio, not similarity — it returns `VERIFIED` on any HTTP 200, `json.loads` model output, and hardcodes a fallback hadith. Adopting it would destroy the only defensible asset in the repository.

## 2. Business Value Analysis

**Primary driver:** defensible differentiation in a judged competition — the asset is *credible integrity*, not features. Market grounding: Tow Center found >60% citation failure across 8 AI search engines (best 37%, worst 94%); CiteTrace (arXiv:2605.28565) found 30.6% of citations distort their source, failures are **near-binary**, and **88–96% of variance is retrieval-driven** — which independently supports `exact | none` over a percentage. ISNAD, the only competitor with a published paper, reports confidence-gating as **"❌ Useless"**. The nearest libraries (`verbatim-citation-gate`, `veriquote`, `verbatimeter`) ship **no eval bar, no ledger, no gates**; the Islamic MCP servers only *retrieve*.

**MoSCoW**

- **Must** — `benchmark:vs-search` (judge-runnable, must be able to fail); one-command demo with no API key; checksummed/attested corpus acquisition (benchmark refuses otherwise); anchor protocol with zero score and G-1/G-6 green + hand-adjudicated expectations for the 26 disputed cases; determinism preserved; false-`VERIFIED` stays at exactly zero (release blocker); **zero new runtime deps**.
- **Should** — MCP `verify_quote`; deterministic failure taxonomy (`fabricated` / `frankenquote` / `misattributed`); ≥20 live runs appended; evidence-tier labels; Bukhari/Muslim corpus sourcing with provenance; docs-claims gate over the new claims.
- **Could** — batch/document ingestion; dense second ranker **only if** the benchmark shows a retrieval bottleneck; benchmark JSON artifact; static HTML report.
- **Won't** — embeddings (AraBERT / jina) in or near the verdict path; Levenshtein / any fuzzy tier; a "Confidence Aggregator" or "Trust Score"; LLM-as-primary-judge; hardcoded fallback snippets; isnād/rijāl, poetry attribution, plagiarism mapping; any grade we did not receive; rewriting the 196 placeholder-timing rows; a web app this cycle (ADR-12).

## 3. Risk Register

| ID | Risk | Class | Sev | Mitigation |
|---|---|---|---|---|
| R-01 | Attachment's confidence/embedding design adopted; CWE-345 reopened | Security/Correctness | **Critical** | INTEGRITY.md §2 spike is precedent; ADR-09 binding; new gate asserts no similarity/LLM in the verdict path |
| R-02 | Anchor path becomes a second route to `VERIFIED` | Security | **Critical** | G-6 extended — must terminate in the *same* containment fn; planted-violation self-test must fail |
| R-03 | A wrong `VERIFIED` reaches a judge making a religious decision | Reliability/Reputational | **Critical** | Fail-closed, abstain-by-default, hand-adjudicated bars, exactly-zero false-`VERIFIED` blocks release |
| R-04 | Benchmark is self-serving (rigged baseline) | Business | High | Independently written FTS5 top-k baseline; generator forbidden to import `@mizan/verify`; pre-registered hypothesis; publish even if it fails |
| R-05 | Judge can't run anything (gitignored 81 MB corpus) | Business | High | Checksummed one-command acquisition + attestation + small committed demo corpus |
| R-06 | Partial/failed ingest silently skews every number | Reliability | High | Benchmark refuses on unattested corpus; corpus fingerprint printed with results |
| R-07 | Number buried in a repo; perception unchanged | Business | High | Benchmark output *is* the headline artifact; README claim machine-generated from it |
| R-08 | Anchor drifts into a disguised fuzzy matcher | Security | High | Output is `located: boolean` + concrete span, never a percentage; gate plants a percentage |
| R-09 | Prompt injection via corpus text through the new anchor field | Security (A03) | Medium | Keep fencing/length-caps/data-only; anchor 3–8 words, capped, advisory only |
| R-10 | MCP adds network attack surface (A01/A10) | Security | Medium | Deferred; read-only, loopback, no URL fetch, no corpus write |
| R-11 | Secrets in new committed fixtures | Security (A02/A07) | Medium | Extend G-4 scope; gitleaks-over-history job exists |
| R-12 | Live provider flakiness contaminates evidence | Reliability | Medium | Demo never needs a live provider; 30 s → `model unavailable`; no cached verdict reuse |
| R-13 | `precomputed` presented as `live` | Integrity | Medium | Explicit tier on every line; `verify:runs` asserts it |
| R-14 | Effect beta drift (`4.0.0-beta.83`) | Technical | Low | Contained in `decode.ts`; untouched |
| R-15 | Dependency creep toward "industry-leading" | Technical | Medium | ADR-10: zero new runtime deps; review question is "does this weaken a gate?" |

## 4. Epics & Success Metrics

- **E-1 Proof benchmark** — one command, <60 s, table of baseline top-1-hit rate on fabrications vs verifier detection rate, abstention, and delta; identical on re-run; rigged-baseline self-test fails CI; corpus fingerprint printed; published regardless of outcome.
- **E-2 Anchor protocol (paraphrase)** — 26 disputed cases hand-adjudicated with recorded rationale; zero fabricated/frankenquote becomes `VERIFIED`; `UNVERIFIABLE` vs `REJECTED` byte-identical over 100 runs; G-1/G-6 green; deps unchanged.
- **E-3 Judge-runnable access** — clone → visible verdict in ≤3 commands, no API key; every line tier-labelled; fingerprint visible; any failure yields an honest state.
- **E-4 Legibility + honest docs** — every `rejected` carries a deterministic reason; `check:docs` fails on drift from the measured artifact.
- **E-5 MCP `verify_quote` (Should)** — ≤2 MCP calls, read-only, zero new deps, verdict path byte-identical.
- **E-6 Live evidence tranche (Should)** — ≥20 live runs appended with real per-stage timings; `verify:runs` green.
- **Cross-cutting** — CI < 5 min · determinism 100% · false-`VERIFIED` = 0 · runtime deps +0 · every gate keeps its planted-violation self-test.

## 5. Security Requirements

**CWE-345** is the central control — `VERIFIED` constructible at exactly one site, every new path terminating in it. **A03**: corpus/anchor text untrusted, fenced, length-capped, data-only; prompts stay advisory. **A01/A10** only if MCP ships (read-only, loopback, no URL fetch). **A08**: ledger/attestation are the proof asset — append-only, mismatch is a loud abort. **A02/A07**: key allowlisted to `api.openai.com` over HTTPS, redirects refused, G-4 extended to new fixtures. **Data sensitivity**: corpus = public religious text (low sensitivity, high reputational sensitivity); question text = user content → `questionHash` only (rule 13). **Auth**: none this cycle; local CLI, no hosted surface, no accounts.

## 6. Reliability Requirements

Fail-closed everywhere with exactly one honest surface per failure (rule 16). Provider 30 s → `model unavailable`; verification timeout → `unverifiable`; never a cached prior verdict, never a crash. **Unattested corpus → benchmark does not run.** Blast radius of a bad anchor: `unverifiable` or `rejected` at worst — it cannot yield `VERIFIED` without strict containment. No silent retries on the verdict path. Determinism contract extended to the anchor path (100% byte-identical over 100 runs). Observability: verdict distribution by kind, abstention rate, evidence-tier counts, benchmark TPR/delta, attestation status, prospective per-stage timings.

## 7. Architecture Decision Records

Recorded in the wiki article (ADR-07…ADR-12): demonstrate the differentiator rather than assert it; the anchor protocol is the paraphrase fix (no score); TAAP not adopted; zero new runtime deps; evidence tiered not laundered; defer the UI one cycle.

## 8. Sprint Backlog (10 stories, 2 sprints — full detail in the wiki)

**Sprint 1 — the proof spine:** `MIZ-101` attested corpus acquisition (M/High) → `MIZ-102` benchmark harness (M/Med) → `MIZ-103` rigged-baseline self-test (M/Low) → `MIZ-104` one-command demo (S/Med) → `MIZ-105` anchor spec + hand-adjudicated expectations (L/High).
**Sprint 2 — determinism and legibility:** `MIZ-106` anchor implementation in the same containment (L/Critical) → `MIZ-107` gate extension (M/Med) → `MIZ-108` failure taxonomy (M/Med) → `MIZ-109` docs-claims coverage (S/Low) → `MIZ-110` live-run tranche (S/Med).
**Deferred (next cycle, deliberately unplanned):** MCP surface, batch ingestion, Bukhari/Muslim sourcing, HTML report.

```json
{"office_fact_memory":[{"fact":"mizan already ships a hermetic demo/eval path that rebuilds a corpus snapshot from the eval sets' own shipped anchors (apps/cli/test/demo.test.ts, scripts/eval/anchors.ts, packages/mizan-core/src/schema/demo.ts), but there is no root package.json script exposing it — scripts are ci, ingest, ingest:check, build:eval, make:transcript, ask, verify:ledger, verify:runs, check:docs. So `bun run demo` and `bun run benchmark:vs-search` are genuinely missing surfaces, not renamed ones.","phase":"ceo","evidence":"Read root package.json scripts block (16-25) and grep for benchmark/baseline across all .ts — no demo or benchmark script exists; the demo currently lives only in a test file.","confidence":0.92},{"fact":"This cycle's defining constraint is zero new runtime dependencies: the value proof (comparative benchmark), the paraphrase fix (anchor protocol), and the judge path must all be achievable with the current dep set (effect@4.0.0-beta.83 only), because every rival AI addition touches the CWE-345 control that is the project's sole defensible asset.","phase":"ceo","evidence":"Market research ranks anchor-instead-of-quote as a no-dependency, G-1-safe adoption and explicitly recommends not buying embeddings; AGENTS.md §9 makes mizan-verify's single dependency a gate-enforced invariant.","confidence":0.9}]}
```

```json
{
  "executiveSummary": "The 'a search tool could do this' feedback is factually correct of mizan's shipped surface (no UI, no API, an 81MB gitignored corpus requiring a network ingest, and 1 live run in 274) and false of its architecture, where VERIFIED is constructible at exactly one site — strict folded substring containment — enforced by gates G-1/G-6 and backed by a measured spike in INTEGRITY.md §2 showing the fuzzy alternative scores an invented hadith as a high match. The differentiator is real but unmeasured against the alternative, which is the most likely root cause of the feedback. This cycle buys proof and honest completeness, not AI capability: (1) a judge-runnable comparative benchmark quantifying what the verifier catches that plain FTS5 search does not; (2) the anchor protocol, which resolves the 26 disputed paraphrase->REJECTED cases with no score, no new dependency and no new route to VERIFIED; (3) a <=3-command, no-API-key judge path that labels its own evidence tier. The attached 'TAAP' recommendation is rejected outright: its calculate_confidence is min(len)/max(len) — a string-length ratio, not similarity — it returns VERIFIED on any HTTP 200, json.loads model output, and hardcodes a fallback hadith. Adopting it would destroy the only defensible asset in the repository.",
  "moscow": {
    "must": [
      "Judge-runnable comparative benchmark (bun run benchmark:vs-search) running the red-team set through a plain FTS5 top-k baseline versus the verifier, publishing detection uplift — and able to fail (rigged-baseline self-test must break CI).",
      "One-command judge path (bun run demo) producing a visible verdict with no API key, <=3 commands from clone, every displayed line labelled with its evidence tier and the corpus fingerprint.",
      "Checksummed, documented, attested corpus acquisition; the benchmark must refuse to run on an unattested corpus.",
      "Anchor protocol for paraphrase classification: 3-8 word anchor, deterministic longest-common-span location, then classify — zero score, zero new dependencies, gates G-1/G-6 green.",
      "Hand-adjudicated, recorded expectations for the 26 disputed paraphrase cases; no fabricated or frankenquote case may become VERIFIED.",
      "Determinism preserved: the anchor path is 100% byte-identical across 100 repeated runs.",
      "Release blocker: false-VERIFIED count on the red-team set stays at exactly zero.",
      "Zero new runtime dependencies this cycle."
    ],
    "should": [
      "MCP verify_quote surface over the local DB — an unoccupied surface, since six-plus Islamic MCP rivals all only retrieve.",
      "Deterministic failure taxonomy for rejected: fabricated / frankenquote / misattributed, computed rather than model-inferred.",
      "Live-run evidence tranche: >=20 genuinely live runs with real per-stage timings, appended to the hash chain.",
      "Evidence-tier labelling (live / precomputed / placeholder-timing) in ledger and CLI output, asserted by verify:runs.",
      "Corpus sourcing for Bukhari/Muslim and grades with per-source provenance, never inventing a grade (rule 15).",
      "Extend the docs-claims gate to cover the benchmark number and the paraphrase statement so README cannot drift."
    ],
    "could": [
      "Batch/document ingestion — the attachment's genuine differentiator, deferred because it adds surface rather than proof.",
      "Dense second ranker behind the existing semanticRanking:\"unavailable\" seam, only if the benchmark demonstrates a retrieval-recall bottleneck, and never in the verdict path.",
      "Machine-readable benchmark JSON artifact committed alongside the human-readable table.",
      "Static HTML report of the benchmark, deferred behind the raw-HTML / A03 posture."
    ],
    "wont": [
      "Dense embeddings (AraBERT, jina-embeddings-v3-arabic) in or near the verdict path — violates gate G-1 and is the documented CWE-345 hole.",
      "Token-level Levenshtein or any fuzzy tier in the verdict path.",
      "A Confidence Aggregator or 'Final Academic Trust Score'; min(len)/max(len) is a length ratio, not similarity.",
      "LLM-as-primary-judge, unconditional VERIFIED on HTTP 200, or json.loads on model output.",
      "Hardcoded fallback hadith snippets.",
      "Isnad/rijāl analytics, poetry attribution and plagiarism mapping (3 of the attachment's 4 UVPs) — wrong product.",
      "Any grade the dataset did not supply, or any grade inferred or upgraded by us (rule 15 / ADR-06).",
      "Rewriting the 196 placeholder-timing ledger rows — it breaks the hash chain; disclosure is preferred to migration.",
      "A web app or UI this cycle (ADR-12); proof on the judge-runnable CLI first."
    ]
  },
  "riskRegister": [
    {"id": "R-01", "risk": "The attached confidence/embedding design is adopted and CWE-345 is reopened", "category": "security", "severity": "critical", "mitigation": "INTEGRITY.md §2 measured spike is the standing precedent; ADR-09 binds any verdict-path change to adversarial review; a new gate asserts no similarity scoring, embedding or model call exists in the verdict path."},
    {"id": "R-02", "risk": "The anchor path becomes a second route to a VERIFIED construction", "category": "security", "severity": "critical", "mitigation": "Gate G-6 extended so the anchor route must terminate in the same containment function; a planted-violation self-test must fail CI."},
    {"id": "R-03", "risk": "A wrong VERIFIED reaches a judge making a religious decision", "category": "reliability", "severity": "critical", "mitigation": "Fail-closed defaults, abstain-by-default, hand-adjudicated eval bars, and exactly-zero false-VERIFIED as a hard release blocker."},
    {"id": "R-04", "risk": "The benchmark is self-serving — a rigged or strawman baseline", "category": "business", "severity": "high", "mitigation": "Baseline is an independently written, honest FTS5 top-k search; the generator is forbidden from importing @mizan/verify using the already-tested pattern; hypothesis pre-registered; the number is published even if it contradicts us."},
    {"id": "R-05", "risk": "A judge cannot run anything: 81MB gitignored corpus, ingest needs network", "category": "business", "severity": "high", "mitigation": "Checksummed one-command acquisition with a documented digest, a small committed demo corpus, and a fully offline path."},
    {"id": "R-06", "risk": "A failed or partial ingest silently skews every published number", "category": "reliability", "severity": "high", "mitigation": "Benchmark refuses to run on an unattested corpus (fail closed); the corpus fingerprint is printed with every result."},
    {"id": "R-07", "risk": "Value perception is unchanged because the number is buried in a repository", "category": "business", "severity": "high", "mitigation": "The benchmark output is the headline artifact; the README claim is machine-generated from it and drift fails check:docs."},
    {"id": "R-08", "risk": "Anchor resolution drifts into a disguised fuzzy matcher", "category": "security", "severity": "high", "mitigation": "Output is located:boolean plus a concrete span, never a percentage; a gate plants a percentage and must fail."},
    {"id": "R-09", "risk": "Prompt injection via corpus or model text carried through the new anchor field", "category": "security", "severity": "medium", "mitigation": "Retrieved text and anchors stay fenced, length-capped and marked data-only; the anchor is 3-8 words and advisory, never a control (rule 12)."},
    {"id": "R-10", "risk": "An MCP surface introduces network attack surface (A01 broken access control, A10 SSRF)", "category": "security", "severity": "medium", "mitigation": "Deferred to Should-have; when built: read-only, loopback bind by default, no arbitrary URL fetch, no corpus write."},
    {"id": "R-11", "risk": "Secrets leak into new committed fixtures or demo artefacts", "category": "security", "severity": "medium", "mitigation": "Gate G-4 scope extended to the new artefacts; the gitleaks-over-history CI job already covers the full history."},
    {"id": "R-12", "risk": "Live provider flakiness contaminates the evidence base", "category": "reliability", "severity": "medium", "mitigation": "The demo never depends on a live provider; 30s timeout yields model unavailable; no cached prior verdict is ever reused; failures are recorded honestly."},
    {"id": "R-13", "risk": "precomputed evidence is presented as live", "category": "business", "severity": "medium", "mitigation": "Explicit evidence tier on every displayed line and ledger row, asserted by verify:runs."},
    {"id": "R-14", "risk": "Effect 4.0.0-beta.83 API drift", "category": "technical", "severity": "low", "mitigation": "Already contained in the single decode.ts adapter; untouched this cycle."},
    {"id": "R-15", "risk": "Dependency creep toward 'industry-leading' erodes a gate", "category": "technical", "severity": "medium", "mitigation": "ADR-10 fixes zero new runtime deps; the standing review question becomes 'does this weaken a machine-checked invariant?'."}
  ],
  "epics": [
    {"id": "E-1", "name": "Proof — benchmark against a search baseline", "description": "One judge-runnable command that runs the red-team set through a plain FTS5 top-k search and through the verifier, and publishes detection uplift.", "successMetrics": ["Runs in one command in under 60 seconds", "Reports baseline top-1-hit rate on fabrications, verifier detection rate, abstention rate and the delta", "Byte-identical on repeat runs", "A rigged-baseline self-test fails CI", "Corpus fingerprint printed with the result", "The number is published whether or not it supports the hypothesis"]},
    {"id": "E-2", "name": "Deterministic paraphrase classification via the anchor protocol", "description": "Replace the disputed paraphrase->REJECTED behaviour with a 3-8 word anchor resolved to a deterministic longest common span, then classified by the existing strict containment.", "successMetrics": ["All 26 disputed cases hand-adjudicated with recorded rationale", "Zero fabricated or frankenquote cases become VERIFIED", "UNVERIFIABLE vs REJECTED split is byte-identical across 100 repeated runs", "Gates G-1 and G-6 stay green unchanged", "Runtime dependency count unchanged"]},
    {"id": "E-3", "name": "Judge-runnable access and honest evidence", "description": "Clone to visible verdict in three commands with no API key, every line labelled with its evidence tier and the corpus fingerprint.", "successMetrics": ["<=3 commands from clone to a visible verdict, no API key required", "Every displayed line carries an evidence-tier label", "Corpus fingerprint visible in the output", "Any failure yields an honest state, never a mock presented as real"]},
    {"id": "E-4", "name": "Verdict legibility and honest documentation", "description": "Name what a boolean hides, and machine-check the claims the README makes.", "successMetrics": ["Every rejected verdict carries a deterministic reason label", "check:docs fails when the README claim drifts from the measured artifact"]},
    {"id": "E-5", "name": "Distribution — MCP verify_quote surface (Should)", "description": "Expose deterministic quote verification to MCP clients over the local database.", "successMetrics": ["A quote verified in <=2 MCP calls", "Read-only, zero new runtime deps", "Verdict path byte-identical to the CLI"]},
    {"id": "E-6", "name": "Live evidence tranche (Should)", "description": "Replace the effective absence of live generation evidence with a real, appended tranche.", "successMetrics": [">=20 live runs appended with real per-stage timings", "Placeholder-timing count in the new tail is zero", "bun run verify:runs green"]}
  ],
  "sprintBacklog": [
    {"id": "MIZ-101", "title": "Checksummed, attested one-command corpus acquisition", "sprint": 1, "priority": "P0", "size": "M", "risk": "high", "dependencies": [], "epic": "E-3", "acceptanceCriteria": ["Documented digest and row-count attestation for corpus.db", "Benchmark and demo refuse on an unattested corpus", "Small committed demo corpus for an offline path"]},
    {"id": "MIZ-102", "title": "FTS5-only search baseline plus verifier comparison harness", "sprint": 1, "priority": "P0", "size": "M", "risk": "medium", "dependencies": ["MIZ-101"], "epic": "E-1", "acceptanceCriteria": ["Generator forbidden from importing @mizan/verify, proved by a test with 8 planted import shapes", "Publishes baseline top-1-hit rate, verifier detection rate, abstention and delta", "Under 60 seconds, identical on re-run"]},
    {"id": "MIZ-103", "title": "Planted rigged-baseline self-test", "sprint": 1, "priority": "P0", "size": "M", "risk": "low", "dependencies": ["MIZ-102"], "epic": "E-1", "acceptanceCriteria": ["A deliberately favourable baseline fails the harness", "The self-test itself runs in CI"]},
    {"id": "MIZ-104", "title": "bun run demo — one command, no API key, tier-labelled", "sprint": 1, "priority": "P0", "size": "S", "risk": "medium", "dependencies": ["MIZ-101"], "epic": "E-3", "acceptanceCriteria": ["<=3 commands from clone to a visible verdict", "No API key required, uses the committed precomputed trace", "Evidence tier and corpus fingerprint on every line"]},
    {"id": "MIZ-105", "title": "Anchor-protocol specification and hand-adjudicated expectations", "sprint": 1, "priority": "P0", "size": "L", "risk": "high", "dependencies": [], "epic": "E-2", "acceptanceCriteria": ["The 26 disputed cases carry hand-adjudicated expectations with recorded rationale", "Spec forbids any score, embedding or LLM judgement on the path"]},
    {"id": "MIZ-106", "title": "Anchor implementation terminating in the same strict containment", "sprint": 2, "priority": "P0", "size": "L", "risk": "critical", "dependencies": ["MIZ-105", "MIZ-101"], "epic": "E-2", "acceptanceCriteria": ["located:boolean plus a concrete span, never a percentage", "Terminates in the single existing VERIFIED construction site", "Byte-identical verdicts over 100 repeated runs"]},
    {"id": "MIZ-107", "title": "Gate extension — single VERIFIED site including the anchor route", "sprint": 2, "priority": "P0", "size": "M", "risk": "medium", "dependencies": ["MIZ-106"], "epic": "E-2", "acceptanceCriteria": ["A planted second VERIFIED construction fails CI", "A planted percentage in the verdict path fails CI"]},
    {"id": "MIZ-108", "title": "Deterministic failure taxonomy for rejected", "sprint": 2, "priority": "P1", "size": "M", "risk": "medium", "dependencies": [], "epic": "E-4", "acceptanceCriteria": ["Labels fabricated / frankenquote / misattributed computed from structure, never model-inferred", "Every rejected verdict carries one label"]},
    {"id": "MIZ-109", "title": "Docs-claims gate covers the benchmark number and paraphrase statement", "sprint": 2, "priority": "P1", "size": "S", "risk": "low", "dependencies": ["MIZ-102"], "epic": "E-4", "acceptanceCriteria": ["README claim generated from the measured artifact", "check:docs fails on drift"]},
    {"id": "MIZ-110", "title": "Live-run evidence tranche", "sprint": 2, "priority": "P1", "size": "S", "risk": "medium", "dependencies": [], "epic": "E-6", "acceptanceCriteria": [">=20 live runs appended with real per-stage timings", "Placeholder-timing count in the new tail is zero", "bun run verify:runs green"]}
  ],
  "adrs": [
    {"id": "ADR-07", "title": "Demonstrate the differentiator, do not assert it", "context": "The feedback was that a search tool could do this. mizan's property is real but nothing in the repository quantifies it against the alternative, and there is no judge-runnable command that shows it.", "decision": "The comparative benchmark is the headline deliverable of this cycle and takes precedence over any new AI capability.", "rationale": "The only way to answer a perception problem is with a number a judge can reproduce; more features without the number leave the perception unchanged.", "consequences": "Effort shifts from capability to proof; a flattering or rigged benchmark becomes a defect rather than a win; retrieval improvements are deferred until measurement justifies them.", "status": "accepted"},
    {"id": "ADR-08", "title": "The anchor protocol is the paraphrase fix", "context": "Paraphrase currently yields REJECTED where UNVERIFIABLE is correct, stamped on 26 eval cases, with an unresolved spec/implementation conflict.", "decision": "The model supplies a 3-8 word anchor; deterministic code locates the longest common span (exact, then normalized, then ordered-token subsequence) and the existing strict containment classifies it.", "rationale": "Verbatim quoting yields a character-exact span only 64-73% of the time even when instructed; the anchor arm reaches 91-100% with every span guaranteed a real substring. It adds no score, no dependency and leaves G-1/G-6 unchanged — unlike Levenshtein, embeddings or a confidence aggregator.", "consequences": "The 26 cases must be hand-adjudicated, not auto-relabelled; a new gate must prove the anchor route terminates in the same containment function; the determinism contract extends to the new path.", "status": "accepted"},
    {"id": "ADR-09", "title": "The attached TAAP recommendation is not adopted", "context": "new 5.txt proposes AraBERT/jina embeddings, token-level Levenshtein, a Confidence Aggregator and a 'Final Academic Trust Score'; its calculate_confidence is min(len)/max(len), a string-length ratio rather than similarity, it returns VERIFIED unconditionally on any HTTP 200 with data, json.loads model output, and it hardcodes a fallback hadith snippet.", "decision": "Nothing from it that touches the verdict path is adopted. Three of its four UVPs — isnad analytics, poetry attribution, plagiarism mapping — are permanently out of scope.", "rationale": "INTEGRITY.md §2 documents a measured spike where fuzzy matching scores an invented but plausible hadith as a high match (CWE-345); a competitor with a published paper reports confidence-gating as useless. Adopting it would destroy the only defensible asset.", "consequences": "The temptation to look 'AI-modern' is declined permanently; embeddings cannot be bought later without reopening this ADR; a gate must assert the absence of similarity and model judgement in the verdict path.", "status": "accepted"},
    {"id": "ADR-10", "title": "Zero new runtime dependencies this cycle", "context": "The mission asks for industry-leading features, which conventionally means adding models, vector stores or network clients.", "decision": "Every deliverable in this cycle is achievable with the current dependency set — effect@4.0.0-beta.83 only, confined to decode.ts.", "rationale": "Each of the three headline items (benchmark, anchor protocol, judge path) is achievable with zero new dependencies; the market research explicitly recommends not buying embeddings because they are strictly worse for containment and break G-1.", "consequences": "Cost stays near zero tokens, determinism and G-1 are preserved, and the standing review question becomes whether a change weakens a machine-checked invariant; retrieval improvements wait for benchmark evidence.", "status": "accepted"},
    {"id": "ADR-11", "title": "Evidence is tiered, not laundered", "context": "196 of 274 ledger rows carry placeholder timings (elapsedMs 0, constant resultCount 3) from a trace-builder bug, and 273 of 274 runs are precomputed rather than live.", "decision": "Do not rewrite history. Disclose the tier explicitly on every displayed line and in the ledger, and append a clean live tranche.", "rationale": "Rewriting breaks the hash chain and destroys the auditability that is itself the product's proof asset; disclosure is the honest state and is already the project's stated doctrine.", "consequences": "A disclosed weakness remains in the record; a machine check now asserts the evidence tier so nothing can be presented as live when it is not; new data is recorded with real per-stage timings.", "status": "accepted"},
    {"id": "ADR-12", "title": "Defer the UI; prove value on the judge-runnable CLI first", "context": "The critique that there is no UI, no web app and no HTTP API is factually true, and a UI is the conventional answer to it.", "decision": "No web app or UI this cycle; spend the cycle on the measured proof and the one-command judge path instead.", "rationale": "A UI on top of an unmeasured differentiator is decoration that makes the product look more shippable without making it more trustworthy; the same investment in a benchmark answers the feedback directly.", "consequences": "The 'no UI' critique stays partially open for one cycle, knowingly; an MCP surface is the cheaper distribution answer and is scoped as Should-have; a UI decision is revisited after the benchmark publishes.", "status": "accepted"}
  ]
}
```

## Architecture
(no architecture)