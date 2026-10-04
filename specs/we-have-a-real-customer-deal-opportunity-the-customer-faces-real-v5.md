# Spec: we-have-a-real-customer-deal-opportunity-the-customer-faces-real

**Request:** we have a real customer deal opportunity, The customer faces real consequences if they do not the platform works and functional at excellent state,its main request is the ability to review quoted quran and hadith also if if there is not valid one mention the correct one also top 3-5 nearest right quoted, so i see we need an advanced RAG ,so need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
I grounded these stories in the actual gates, the actual corpus, and a measured spike. Three findings materially change the CEO's plan, so I'll lead with them.

## 0. What I verified before writing a single story

**Read-only probes against this repo (no files changed):**

| Finding | Evidence |
|---|---|
| Bun 1.3.14 ships SQLite **3.53.0** with FTS5 **and** a working `tokenize='trigram'` | probe: `create virtual table t using fts5(x, tokenize='trigram')` → query returned 1 row |
| Corpus is **27,234 records**; `records_fts` is `tokenize='unicode61'` on folded `textMatch`; **no trigram index exists** | `data/corpus.db` schema + `packages/mizan-corpus/src/snapshot.ts:72` |
| `computeSnapshotHash` digests the **records, not the file** — attestation compares only `snapshotHash` + `recordCount` | `snapshot.ts:160`, `attest.ts:98` |
| Fabrication set = 40 cases, **hadith only** (abudawud 22, ibnmajah 16, malik 2); mutations: one-word 12, two-word 8, transposed 8, inserted 8, digit 4 | `data/eval/redteam-fabricated.json` |
| Corpus has **112 duplicate folded-text groups / 307 rows**, largest = **31 identical records** (quran:4914, 4917, 4919…) | probe over `records.textMatch` |

**The measurement that decides the architecture** — top-K presence of the adjudicated source record (`anchorId`), 40 cases:

| Pre-filter strategy | top-1 | top-3 | top-5 | pool | ms/case |
|---|---|---|---|---|---|
| Existing `unicode61` lexical retrieval + Jaccard re-rank | 14/40 | **15/40** | 15/40 | ~400 | — |
| Full in-memory trigram scan + Jaccard | 15/40 | 28/40 | — | 27,234 | 156 |
| Trigram index, single 24-char phrase | 15/40 | **16/40** | 16/40 | **9** | 11 |
| **Trigram index, OR of 2×24-char segments** | **33/40** | **37/40** | **37/40** | 16 | **19** |
| Trigram index, OR of 3×28-char segments | 32/40 | 37/40 | 37/40 | 44 | 38 |

Index build cost: 3,134 ms over 27,234 records. Residual misses are consistently `two_word_changed` (redteam-017/018).

**Three places this evidence contradicts the CEO's spec — the stories below are corrected accordingly:**

1. **"Reuse the existing lexical retrieval as pre-filter" fails.** Top-3 collapses from 37/40 to 15/40. The BM25/`unicode61` path tokenises on word boundaries; a mutated Arabic quote loses its token match, which is exactly the case the feature exists for. A trigram index is not an optimisation here, it is the feature.
2. **"char-3-gram pre-filter" as literally specified (one phrase) fails.** A single 24-char phrase yields a pool of **9 records** and top-3 of 16/40 — it hard-filters out the answer whenever the mutation lands inside that window. The pre-filter must be an **OR of several evenly-spaced segments**; the measured winner is 2×24.
3. **ADR-004's `score: { kind:"jaccard"; value:number }` is both gate-unsafe and strategically wrong.** G-7.4 bans `score:` as a property key in `render.ts`/`correction.ts`/`relevance.ts`/`page.ts`, and exporting a float creates exactly the tunable number the CEO's own risk register fears. **The ranking value must not be exported at all.**

Also: a top-5 list can print the same quote five times (31 identical quran records exist). Dedup by folded-text identity is a table-stakes requirement the spec omits.

---

# 1. Story Overview

Effort in **person-months** (fractional). RICE = (R × I × C) / E.

| # | Story | Epic | Priority | R | I | C | E | **RICE** | Risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Suggestion contract + five honest states | 1 | Must | 8 | 3 | 0.95 | 0.25 | **91.2** | Low |
| 2 | Boundary gate with planted violations | 1 | Must | 8 | 3 | 0.90 | 0.50 | **43.2** | High |
| 3 | ADR ratification + two measured amendments | 1 | Must | 7 | 2 | 1.00 | 0.15 | **93.3** | Low |
| 4 | Trigram pre-filter as a derived sidecar | 2 | **Must*** | 8 | 3 | 0.70 | 1.50 | **11.2** | High |
| 5 | Deterministic top-K ranking + dedup | 2 | **Must*** | 8 | 3 | 0.80 | 1.50 | **12.8** | High |
| 6 | Coverage harness inside `@mizan/bench` | 4 | Should | 5 | 2 | 0.90 | 1.00 | **9.0** | Low |
| 7 | CLI "Nearest suggestions" section | 3 | Should | 8 | 2 | 0.85 | 1.00 | **13.6** | Medium |
| 8 | Verdict × state routing matrix, end to end | 3 | Should | 8 | 2 | 0.90 | 0.50 | **28.8** | Medium |
| 9 | Nothing about suggestions enters trace or ledger | 1 | Should | 6 | 2 | 0.85 | 0.50 | **20.4** | Medium |
| 10 | Opt-out flag + surface-parity ruling | 3 | Could | 4 | 1 | 0.90 | 0.25 | **14.4** | Low |

\* **Deliberate deviation from the CEO's MoSCoW.** Stories 4–5 are marked *Should* ("deterministic nearest-candidate generation"). The measurement says they are the feature: without a trigram-indexed pre-filter there is no suggestion capability at all (top-3 15/40 ≈ guessing). Promoting them to Must is the single most important re-prioritisation in this refinement.

**What I am explicitly *not* doing:** no story adds an eighth gate. `docs-gates.ts` machine-checks the gate count against `GATE_IDS` in every file in the repository, so adding `G-8` is a repo-wide documentation change (AGENTS.md §14/§17). Story 2 extends **G-7** instead — same enforcement, no prose churn.

---

# 2. Dependency Graph

```
                    ┌─────────────────────────────┐
                    │ Story 3  ADR ratification   │  (no code; unblocks nothing technically)
                    │  + measured amendments      │
                    └──────────────┬──────────────┘
                                   │ records the recipe
                                   ▼
┌────────────────────────────┐   ┌───────────────────────────────┐
│ Story 1  Contract + states │──▶│ Story 4  Trigram sidecar index │
│ (vocabulary, one owner)    │   │ (derived, rebuildable, absent  │
└─────────────┬──────────────┘   │  ⇒ suggestions unavailable)   │
              │                  └──────────────┬────────────────┘
              │                                 │ candidate pool
              │                  ┌──────────────▼────────────────┐
              │                  │ Story 5  Deterministic top-K   │
              │                  │  + folded-text dedup          │
              │                  └───────┬───────────────┬────────┘
              │                          │               │
              │                          ▼               ▼
              │                  ┌──────────────┐  ┌──────────────────┐
              │                  │ Story 6      │  │ Story 2  GATE    │
              │                  │ Coverage     │  │ planted          │
              │                  │ harness      │  │ violations       │
              │                  │ (regression  │  │ (rules must      │
              │                  │  floor)      │  │  exist BEFORE    │
              │                  └──────────────┘  │  code lands)  ◀─┘
              │                                 │ └──────────────────┘
              ├──────────────────────────────────┤  (gates the 5 → 7 chain)
              ▼                                  ▼
     ┌──────────────────┐              ┌────────────────────────┐
     │ Story 9  Trace/  │              │ Story 7  CLI render    │
     │ ledger exclusion │              │  section               │
     └────────┬─────────┘              └───────────┬────────────┘
              └──────────────┬─────────────────────┘
                             ▼
                  ┌────────────────────┐      ┌──────────────────────┐
                  │ Story 8  State     │─────▶│ Story 10 Opt-out +   │
                  │  routing matrix    │      │  parity ruling       │
                  └────────────────────┘      └──────────────────────┘
```

**Blocking / shared / external**

- **Blocking:** 1 → 4, 5, 7. 4 → 5. 5 → 6, 7. 7 → 8, 10. 3 must land before 4 (the recipe is ratified, not improvised).
- **Sequencing hazard (must be stated):** Story 2's rules scope to `packages/mizan-suggest/`, which does not exist until Story 4. A gate rule over an absent path passes **vacuously**. Per AGENTS.md §14, "a guard that cannot fail is not a guard" — so Story 2's self-test must plant violations in a **fixture tree** and prove each rule fires, independently of the real package existing. Story 2 therefore ships *first* in CI terms and is safe to land green.
- **Shared:** `@mizan/core` fold table (Stories 4, 5 — one source of truth, §17); `citationLabel` in `render.ts` (Stories 7, 8 — one spelling); `badgeFor` (unchanged, but asserted by 7 and 8); `Rate` discipline in `@mizan/bench` (Story 6).
- **External:** none. Zero new third-party dependencies. The trigram tokenizer is *already compiled into* Bun's SQLite (verified). No network at build or query time.
- **Mitigation:** if the sidecar cannot be built in the CI environment, Story 4 degrades to `suggestions unavailable` and every downstream story still ships and tests green — the feature is absent, the product is honest. That is the fail-closed path, not a blocker.

---

## Sprint 1: The boundary, the contract, and the measured recipe

### Story 1: Suggestion contract with five honest states

**Epic** 1 · **Priority** Must · **RICE** 91.2 · **Risk** Low · **Estimate** 0.25 person-months

> As a judge reading a report, I want every suggestion surface to declare its own authority and its own failure mode, so that no suggestion can ever be mistaken for a verdict.

**INVEST**

| | |
|---|---|
| **I**ndependent | No dependencies. Declares vocabulary only; no code consumes it yet. |
| **N**egotiable | The five state names and the candidate field list are proposals, not hardcoded. |
| **V**aluable | It is the artefact that makes ADR-001 enforceable rather than aspirational. |
| **E**stimable | One module, one schema, one test file. |
| **S**mall | Half a day. |
| **T**estable | Every criterion below is a failing-then-passing test. |

**The contract (proposal — SE owns the exact syntax)**

```
SuggestionState =
  | { kind: "candidates";     candidates: readonly SuggestionCandidate[] }   -- 1..5
  | { kind: "no_candidates" }                                                -- searched, nothing cleared the floor
  | { kind: "unavailable";    reason: UnavailableReason }                    -- could not search; sidecar absent/stale/corrupt
  | { kind: "not_applicable" }                                               -- nothing to correct (quote absent, or already contained)
  | { kind: "disabled" }                                                     -- user opted out

SuggestionCandidate = {
  rank: 1 | 2 | 3 | 4 | 5,
  recordId, collection, number: string | null, sourceUrl, textDisplay,
  closeness: { kind: "exact" }
           | { kind: "shared_run"; sharedChars: number; quoteChars: number },
  distinctFromRankAbove: boolean    -- false ⇒ same folded text as a higher rank (see Story 5 dedup)
}
```

**Two deliberate deviations from ADR-004, both load-bearing:**

- **No `score` field, no numeric ranking value exported at all.** The value that orders candidates stays internal to the ranking module. There is no number a caller can threshold, print, or tune. This satisfies G-7.4 (`score:`/`percent:`/`confidence:` are banned property keys on every display module) *and* removes the CWE-345 gradient the CEO's own risk register names as severity 5.
- **`closeness` carries two integers, never a ratio** — `sharedChars` and `quoteChars`, exactly as `longest-run.ts` already does, whose header states there is "no number in this file that could be divided". The ratio is never materialised in a field, so the display copy is the existing, proven sentence: `"34 of 61 folded characters shared"`.

**Acceptance criteria**

```
Scenario: the state vocabulary has exactly five members
  Given the suggestion state module
  When the union is declared
  Then it has exactly the five declared members
  And a renderer switching over it has no default branch, so a sixth state is a compile error

Scenario: candidates are labelled non-authoritative wherever they appear
  Given a report rendering a "candidates" state
  When the section is printed
  Then the non-authoritative disclaimer constant appears in the section header
  And the disclaimer is imported from the single owning module, not spelled out per surface

Scenario: an empty result is named, never shown as an empty list
  Given a rejected verdict where no candidate cleared the floor
  When the section renders
  Then it prints the "no candidates found" state
  And it prints no ranked rows at all
  And it does not print a rank 1 placeholder

Scenario: an unavailable search is distinguished from an empty one
  Given the trigram sidecar is absent
  When the suggestion state is produced
  Then the state is "unavailable" with a coded reason
  And the rendered text says suggestions were unavailable
  And it does not read as "we looked and found nothing"

Scenario: MatchStrength is untouched
  Given the existing MatchStrength union
  When the suggestion contract is added anywhere in the repository
  Then MatchStrength still has exactly two members, { kind:"exact"; percent:100 } and { kind:"none" }
  And no fuzzy or percentage variant of it exists anywhere

Scenario: a candidate cannot carry a tunable number
  Given the candidate type
  When its fields are enumerated
  Then no field carries the ranking value, a percentage, or a threshold
  And the only numeric fields are sharedChars and quoteChars

Scenario: an unavailable reason cannot smuggle corpus text into a log
  Given an unavailable state built from a filesystem error
  When the reason is encoded
  Then it is drawn from a closed vocabulary of codes
  And no part of the underlying error string, record text, or question text is embedded
```

**Edge cases:** empty candidate array in a `candidates` state is unrepresentable (the state requires 1–5); `rank` must be dense from 1; a candidate whose `number` is `null` renders via the existing `citationLabel`; `textDisplay` is never `textMatch`; `sourceUrl` must come from the record, never be reconstructed.

**Performance:** zero runtime cost — a type and a constant. **Reliability:** every failure path is a state, never a throw; `Result<T, UnavailableReason>` at the boundary, no exception crosses a package (§2).

---

### Story 2: Boundary enforcement for the suggestion path, with planted violations

**Epic** 1 · **Priority** Must · **RICE** 43.2 · **Risk** High · **Estimate** 0.5 person-months

> As the repository, I want the suggestion boundary machine-checked, so that "suggestions cannot influence verdicts" is a build failure rather than a review comment.

**INVEST:** Independent of Story 1's *code* (it names paths, not types) · Negotiable (rule set is a proposal) · Valuable (this is the project's actual differentiator) · Estimable (one gate file + one self-test block) · Small · Testable (every rule has a planted violation that must fail).

**What is already closed — do not duplicate it.** G-6.5 requires the import closure of `verify.ts` to **equal** `VERDICT_PATH` (5 files), so *any* new import from `verify.ts` — including one to a suggest package — is already a build failure in both directions of the list. G-6.1/6.3/6.4 already scan the tree for `verdict: "verified"`, `percent:`, and ad-hoc `matchStrength:`.

**What is genuinely new — six rules to add to G-7:**

| Rule | Statement | Why it is not already covered |
|---|---|---|
| **G-7.8** | No module in the suggest package's import closure may be a verdict-path file (`verify.ts` or anything under `steps/`) | The existing rule is one-directional (G-2.2: verdict path must not reach diagnostics). Nothing stops suggestions reaching *computation*. |
| **G-7.9** | No file in `packages/mizan-suggest/` may contain the token `verdict` or `verified`, in `code+strings` mode | Same shape as G-7.7 for `relevance.ts`. Makes it *impossible* for suggestions to branch on or construct an outcome — not merely forbidden by comment. |
| **G-7.10** | The suggest package's non-relative imports may only be `@mizan/core` and `@mizan/corpus` | Mirrors G-1.1 for the verifier. Prevents an embedding library being reached "accidentally". |
| **G-7.11** | No ambient-authority token (`fetch(`, `Date.now`, `Math.random`, `process.env`, `setTimeout`, …) in the suggest package | The spec's SSRF/no-network requirement, enforced rather than promised. Reuses `AMBIENT_AUTHORITY_TOKENS` — one vocabulary (§17). |
| **G-7.12** | Any new display module that renders suggestions is listed in `DISPLAY_PATH` | Extends the existing rename guard so G-7.2/7.3/7.4 keep applying to it. |
| **G-7.13** | No similarity token (`jaccard`, `trigram`, `threshold`, …) in a display module, **including `render.ts`** | Already true of `render.ts` today via G-7.2 — stated here because it is a live constraint on the UX design (Story 7): the renderer may not name the metric it is displaying. |

**Acceptance criteria**

```
Scenario: the gate fires on a suggestion reaching verdict computation
  Given a fixture tree where the suggest module imports steps/containment.ts
  When G-7 runs
  Then G-7.8 reports a finding naming both files
  And the finding is reported by rule id, not only by path

Scenario: the gate fires on a suggestion module naming an outcome
  Given a fixture tree where the suggest module contains the literal "verified"
  When G-7 runs in code+strings mode
  Then G-7.9 reports a finding
  And returning the word from a module-level constant is reported too

Scenario: the gate fires on a network call in the suggestion path
  Given a fixture tree where the suggest module calls fetch(
  When G-7 runs
  Then G-7.11 reports a finding

Scenario: the gate fires on a third-party dependency
  Given a fixture tree where the suggest package imports an embedding library
  When G-7 runs
  Then G-7.10 reports a finding naming the specifier

Scenario: every new rule has a planted violation that fails
  Given one fixture per rule
  When the gate self-test runs each
  Then every fixture produces at least one finding
  And a rule with no failing fixture fails the self-test   -- §14: a guard that cannot fail is not a guard

Scenario: the real tree passes with the package absent
  Given a tree where packages/mizan-suggest/ does not exist
  When the gates run
  Then G-7 passes
  And the self-test separately proves each rule fires on a fixture  -- no vacuous green

Scenario: adding the suggest package does not change the verdict path
  Given the suggest package exists and is fully wired
  When G-6.5 runs
  Then the import closure of verify.ts still equals VERDICT_PATH exactly
```

**Edge cases:** a display module renamed rather than added (G-7.12's whole purpose); a violation hidden in a `*.test.ts` (production-file rules skip tests — a stated limitation, covered by `tsc` + review); the gate package's own source is out of token-rule scope by design, so the new rule lists live in `g1-no-similarity.ts` where the vocabulary already is.

**Performance:** one extra closure resolution per run; gates must stay under the 5-minute full-CI budget (§14). **Reliability:** the gate is pure over the file list; a new rule must not depend on filesystem state beyond the tree.

---

### Story 3: Ratify ADR-001–004 and amend ADR-002 and ADR-004 with the measurements

**Epic** 1 / ADRs · **Priority** Must · **RICE** 93.3 · **Risk** Low · **Estimate** 0.15 person-months

> As the next engineer, I want the decision record to carry the measurements that justify it, so that the algorithm is not re-litigated from memory and the recorded numbers cannot drift from the code.

**INVEST:** Independent · Negotiable · Valuable (cheapest story in the plan, highest leverage) · Estimable · Small · Testable.

**Acceptance criteria**

```
Scenario: every ADR has the four required sections and a status
  Given ADR-001 through ADR-004
  When each is read
  Then each states Context, Decision, Rationale, Consequences and a status
  And each is linked from the specification page

Scenario: ADR-002 carries the pre-filter measurement, not just the name
  Given ADR-002 (deterministic suggestion algorithm)
  When it is read
  Then it records the measured top-3 presence for each pre-filter strategy tried
  And it records that the existing lexical retrieval as pre-filter measured 15/40
  And it records that a single-phrase trigram pre-filter measured 16/40 with a pool of 9
  And it pins the chosen segment rule as 2 evenly-spaced 24-character segments
  And it states that the segment shape is a pinned rule in exactly one module

Scenario: ADR-004 is amended to remove the exported ranking value
  Given ADR-004 (candidate scoring model)
  When it is read
  Then it states that no numeric ranking value crosses the module boundary
  And it gives the gate reason: score/percent/confidence are banned property keys on every display module
  And it gives the strategic reason: an exported float is a tunable number on the road to a threshold

Scenario: the accuracy wording is machine-checked
  Given any file in the repository that states a suggestion accuracy figure
  When bun run check:docs runs
  Then the figure must name the evaluation set and that set's construction
  And the words "guarantee", "correction accuracy" and "the correct quote" are rejected in a suggestion context
  And a missing or undated baseline fails the check rather than passing silently

Scenario: no guarantee language reaches a user-visible surface
  Given the CLI render module and the static page
  When their strings are scanned
  Then neither contains a claim that the system finds the correct quote
```

**Edge cases:** a figure quoted without its set (rejected); a figure quoted from the literature without attribution to the shared task (must name the baseline and the do-nothing figure); an ADR whose status is `Proposed` but which code already implements (status must match reality).

**Performance/reliability:** documentation-only; no runtime effect. Reliability requirement: the recorded baseline must be reproducible by Story 6's harness, or the ADR is wrong.

---

### Story 4: Trigram pre-filter as a derived, rebuildable sidecar

**Epic** 2 · **Priority** **Must** (promoted) · **RICE** 11.2 · **Risk** High · **Estimate** 1.5 person-months

> As a user with a misquoted hadith, I want the system to search the whole attested corpus for near neighbours, so that I am shown real alternatives rather than the three records a word-boundary index happens to match.

**INVEST:** Independent of Story 5 (produces an index, not suggestions) · Negotiable (storage strategy is a proposal) · Valuable (this is the feature; measured) · Estimable · Small for a sprint · Testable.

**Options considered, with the evidence:**

| Option | Cost | Failure mode | Verdict |
|---|---|---|---|
| (a) Add `records_tri` **inside** `corpus.db` | 3.1 s build | The committed 83 MB attested artefact must be regenerated — `bun run ingest` is a **network** fetch; `ingest:check` runs in CI | Rejected: turns a CPU change into a network-hours change |
| (b) **Sidecar** SQLite file built from the attested snapshot | 3.1 s build, ~19 ms query | Absent or stale ⇒ `suggestions unavailable` | **Recommended** |
| (c) In-memory trigram sets per process | 1.5 s startup, 156 ms/query | Pays 1.5 s on every CLI invocation; 3× slower per query | Rejected |

**Why (b) is also the honest one:** its absence is a *recoverable, nameable state* — exactly `unavailable` from Story 1. Attestation is untouched, because `computeSnapshotHash` digests records and `attestSnapshot` compares only `snapshotHash` and `recordCount` — adding a derived index changes neither.

**Acceptance criteria**

```
Scenario: the sidecar is built from the attested snapshot only
  Given an attested snapshot with a known snapshotHash
  When the build runs
  Then the sidecar records the snapshotHash it was built from
  And the build performs no network call
  And the build reads only the attested snapshot file

Scenario: the build is deterministic
  Given the same snapshot built twice into two sidecars
  When both are queried with the same segments
  Then they return identical candidate id sets in identical order
  And repeated runs of the build produce the same row order

Scenario: a sidecar from a different snapshot is refused, not used
  Given a sidecar whose recorded snapshotHash does not match the attested snapshot
  When a suggestion is requested
  Then the state is "unavailable" with a reason naming snapshotHash
  And no candidate is returned from the stale index
  And the message tells the operator which field diverged

Scenario: an absent sidecar degrades honestly
  Given no sidecar file
  When a suggestion is requested
  Then the state is "unavailable"
  And the verdict, the badge, the exit code and the ledger entry are all unchanged
  And the run does not report itself as degraded

Scenario: a corrupt or truncated sidecar degrades honestly
  Given a sidecar that fails to open or fails a schema read
  When a suggestion is requested
  Then the state is "unavailable"
  And no partial candidate list is returned
  And nothing throws across the package boundary

Scenario: a quote shorter than the tokenizer's reach cannot match
  Given a folded quote of fewer than 3 characters
  When the pre-filter runs
  Then no trigram query is issued
  And the state is "no_candidates"
  And this is documented as a property of the tokenizer, not a bug

Scenario: the verifier never sees the index
  Given the sidecar exists and is fully populated
  When the verifier's import closure is computed
  Then the sidecar is not in it
  And G-1.1 and G-6.5 both pass unchanged

Scenario: the build is reproducible from a clean checkout
  Given a clean clone with the committed corpus and no sidecar
  When the documented build command runs offline
  Then it produces a working sidecar
  And the command is named in the same place the sidecar's location is named
```

**Edge cases:** sidecar for a different snapshot (refused); sidecar truncated mid-write (unavailable); sidecar present but empty (unavailable, not `no_candidates` — the distinction matters: zero rows means the build failed, not that nothing matched); Windows file locking while the CLI holds `corpus.db` open; concurrent CLI invocations racing to build; quote of exactly 3 characters; a folded quote containing characters the tokenizer treats specially.

**Security:** the sidecar contains folded corpus text only — no question text, no PII, no secrets (G-4 gitleaks must stay green). Build reads no credentials. **A03:** the sidecar is never rendered; `textDisplay` reaches the terminal through the existing `normalizeForTerminal` path only.

**Performance:** build ≤ 30 s for 27,234 records (measured 3.1 s here; generous for slower CI runners, Ubuntu + Windows). Query p95 ≤ 50 ms per claim (measured 19 ms). Sidecar file size reported and bounded.

**Reliability:** no retry (pure CPU build); a failed build leaves no partial file (write-then-rename); the snapshot is opened **read-only** — the build must never write to `corpus.db`; timeout: the build is a separate command, so it cannot extend the CLI's runtime budget or the 10 s verification budget.

---

### Story 5: Deterministic top-K ranking with folded-text dedup

**Epic** 2 · **Priority** **Must** (promoted) · **RICE** 12.8 · **Risk** High · **Estimate** 1.5 person-months

> As a user whose quote was rejected, I want the five nearest real records ranked the same way every time, with no duplicates and no invented text, so that I can check each one myself.

**INVEST:** Depends on Stories 1 and 4 · Negotiable (tie-break order is a proposal) · Valuable · Estimable · Small for a sprint · Testable.

**Ordering rules (WHAT, not HOW — the SE owns the mechanism):**

1. **Scope:** default to the cited record's collection. Widening is a **declared, separately-measured policy**, not a fallback — a citation into the wrong collection must be able to say `no_candidates`.
2. **Exact short-circuit first.** A candidate whose folded text contains the folded quote gets `closeness.kind: "exact"` and ranks above every graded candidate — mirroring the verifier's own precedence, so the suggestion surface never ranks a near-match above a containment.
3. **Graded order:** more shared trigrams first.
4. **Tie-breaks, declared in one module and applied in order:** longer longest shared run → lower `recordId` in **UTF-16 code-unit order**. Never `localeCompare` — `scan.ts:75` already documents that ICU collation makes the same gate report two orders on two machines.
5. **Floor:** a candidate must share at least one declared minimum overlap to be listed. Below it, `no_candidates`.
6. **Dedup:** at most one candidate per distinct folded text. The corpus contains **112 duplicate groups covering 307 rows, the largest being 31 identical records** — without this rule a "top 5" can be one quote printed five times.
7. **Cardinality:** 5 when 5 distinct candidates clear the floor, fewer otherwise, and the true count is reported rather than padded.
8. **Purity:** no I/O beyond the sidecar read; no clock, no randomness, no locale.

**Acceptance criteria**

```
Scenario: byte-identical results across repeated runs
  Given the same folded quote and the same sidecar
  When the ranking runs three times
  Then all three runs return the same candidate ids in the same order
  And the same closeness values
  And this holds on both the Linux and Windows CI runners

Scenario: a contained candidate outranks a closer-looking near match
  Given a quote that is contained in candidate A and shares more trigrams with candidate B
  When the ranking runs
  Then A is rank 1 with closeness kind "exact"
  And the rule is a declared ordering rule, not an accident of the score

Scenario: ties are broken deterministically and the order is declared
  Given two candidates with identical shared trigram counts
  When the ranking runs
  Then the one with the longer shared run ranks first
  And if those also tie, the lower recordId in code-unit order ranks first
  And the tie-break order is written down in the one module that owns it

Scenario: the same quote is never suggested twice
  Given a corpus region containing 31 records with identical folded text
  When a top-5 is produced from within that region
  Then at most one of them appears
  And the remaining slots are filled by distinct records
  And any suppressed duplicate is marked rather than silently dropped

Scenario: below the floor is an honest state
  Given a folded quote sharing no trigram with any record in scope
  When the ranking runs
  Then the state is "no_candidates"
  And no candidate is returned
  And no record outside the corpus is invented to fill the list

Scenario: the floor is one declared constant with its measurement beside it
  Given the module that owns the floor
  When it is read
  Then the floor is declared once
  And the measured coverage at that floor is recorded next to it
  And changing the floor without updating the recorded measurement fails the regression test in Story 6

Scenario: quote text cannot become FTS5 syntax
  Given a quote containing a double quote, a caret, an asterisk, or the word OR
  When the pre-filter builds its match expression
  Then those characters are treated as literal text, using the same quoting discipline as the existing retrieval query helper
  And the candidate set cannot be widened beyond the intended segments

Scenario: suggestions are scoped to the attested corpus
  Given a snapshotHash
  When candidates are produced
  Then every candidate resolves to a record in that snapshot
  And no external source, web result, or cached prior run contributes a candidate

Scenario: no clock, no randomness, no network
  Given the ranking module
  When it is inspected by G-7.11
  Then it contains no ambient-authority token
  And its output is a pure function of its inputs
```

**Edge cases:** folded quote shorter than 3 characters; folded quote longer than the sidecar's longest indexed run; quote identical to a whole record (dedup collapses to one); every candidate tied on all keys; record ids differing only by case or by digit form; a collection with a single record; `number` is `null`; a quote containing bidi control marks or zero-width characters (folding must neutralise them — `BIDI_CONTROL_MARKS`/`ZERO_WIDTH` exist in `@mizan/core`); a record whose folded text is empty.

**Security:** FTS5 `MATCH` is a query language, so the quote is **untrusted input to a query parser** — this is the sharpest injection surface in the feature and the reason the existing `assertQuotable` helper is the precedent to follow rather than reinvent. No raw interpolation of user text into SQL. **A02:** nothing about a candidate is written to a log. **A08:** candidates cannot alter attestation, ledger payload, or run chain.

**Performance:** p95 ≤ 50 ms per claim; ≤ 200 ms for a five-claim report; candidate pool hard-capped (measured pools 16–172, cap 400) so a pathological quote cannot scan the corpus; memory bounded — no full-corpus in-memory trigram sets.

**Reliability:** every failure is a `Result`, never a throw across a package (§2); fail-closed — an error yields `unavailable`, never a partial or unranked list; no retry (pure computation, so a retry would only repeat a deterministic answer); degradation is exactly the five states.

---

### Story 6: Coverage measurement inside `@mizan/bench`

**Epic** 4 · **Priority** Should · **RICE** 9.0 · **Risk** Low · **Estimate** 1.0 person-months

> As the team, we want suggestion quality measured by the harness that already scores the verifier, so that coverage is tracked and regression is caught without a second reporting system.

**INVEST:** Depends on Story 5 · Negotiable · Valuable · Estimable · Small · Testable.

**Note the reuse, not the duplication:** `packages/mizan-bench` already provides `BenchCase`, `buildSuite`, `buildReport`, `renderReport`, the `Rate = number | null` discipline, and `CaseScoring`. A new harness would be a second answer to "what does a benchmark report" (§17). This story **extends** it with a suggestion-coverage suite.

**Provisional baseline to record (measured by me, on this machine):**

| Metric | Value |
|---|---|
| Set | `data/eval/redteam-fabricated.json`, 40 cases |
| Collections covered | abudawud 22, ibnmajah 16, malik 2 — **quran and tirmidhi: not measured** |
| Construction | **mutation-derived** — each quote is a deliberate mutation of a real record |
| top-1 presence | 33/40 (82.5%) |
| top-3 presence | 37/40 (92.5%) |
| top-5 presence | 37/40 (92.5%) |
| Query latency | 19 ms/case mean |

**Acceptance criteria**

```
Scenario: the harness reports top-K presence with named denominators
  Given the fabrication suite
  When the report is rendered
  Then it states top-1, top-3 and top-5 presence as Rates with their counts
  And a suite with no cases prints n/a rather than 0.0%

Scenario: the report cannot be read as a correction-accuracy claim
  Given the rendered report
  When a reader reads it
  Then it states the metric is presence of the adjudicated source record in the candidate list
  And it names the set and that the set is mutation-derived
  And it prints the words diagnostic and non-authoritative
  And it prints the literature baseline and the do-nothing figure alongside, so the two are never confused

Scenario: coverage outside the measured collections is stated as unmeasured
  Given the report
  When the collections covered are printed
  Then quran and tirmidhi are named as not measured
  And no figure is presented as covering the whole corpus

Scenario: a regression fails the build
  Given the recorded baseline of 37/40 at top-3
  When the harness runs and top-3 presence drops below 36/40
  Then the run fails
  And the failure names the metric, the baseline, and the observed value

Scenario: the harness is deterministic
  Given the same sidecar and the same set
  When the harness runs three times
  Then the three reports are byte-identical

Scenario: the harness cannot manufacture a verdict or a candidate
  Given the harness source
  When it is inspected
  Then it constructs no verdict and no suggestion candidate
  And it scores outcomes handed to it, as the existing package header already requires

Scenario: the metric cannot be silently redefined
  Given the floor constant in Story 5
  When it is changed
  Then the regression test fails until the recorded baseline is updated with a new measurement
```

**Edge cases:** a suite with zero cases (`n/a`, never 0%); a case whose anchor is absent from the corpus (counted as a miss, and reported separately); a sidecar absent during a harness run (report says so; it does not report zero coverage); a top-K list padded with duplicates inflating presence (dedup rule from Story 5 makes this impossible, and the harness must assert distinctness).

**Performance:** full 40-case suite ≤ 30 s (measured ~0.8 s of query time plus trigram set construction). **Reliability:** runs per package, never from the repository root (§8).

---

## Sprint 2: The surfaces a judge actually reads

### Story 7: "Nearest suggestions (non-authoritative)" in the CLI report

**Epic** 3 · **Priority** Should · **RICE** 13.6 · **Risk** Medium · **Estimate** 1.0 person-months

> As a judge, I want the nearest real records printed beside a rejected quote with their references, so that I can open each source and check it myself.

**INVEST:** Depends on 1, 5 · Negotiable (visual layout is a proposal) · Valuable (this is where the customer sees the feature) · Estimable · Small · Testable.

**Hard gate constraint the design must respect:** `render.ts` is in `DISPLAY_PATH`, so **G-7.2 forbids the words `jaccard`, `trigram`, `similarity`, `threshold` and their compounds in that file**, and **G-7.4 forbids `score:`, `percent:`, `confidence:` as property keys**. String *bodies* are blanked in `"code"` scan mode, so a display label is fine — but the renderer must not name or re-key the metric. It reads `candidate.closeness.sharedChars`; it never constructs `{ score: … }`.

**Acceptance criteria**

```
Scenario: each candidate is checkable from outside the program
  Given a rejected claim with candidates
  When the section renders
  Then each row shows its rank, the citation label from the one existing helper, the source URL, and the display text
  And the section header carries the non-authoritative disclaimer from the single owning module

Scenario: the badge is byte-identical to before this feature
  Given a verified, a rejected and an unverifiable report
  When they are rendered
  Then the badge line for each is byte-identical to the pre-feature output
  And no candidate text appears in any badge or reason line

Scenario: no similarity vocabulary reaches the renderer
  Given the render module source
  When G-7.2 runs
  Then it reports no finding
  And the module names no metric it is displaying, only the two integers it prints

Scenario: Arabic is stacked, not tabled
  Given Arabic candidate text
  When the section renders
  Then rows are labelled stacks, matching the existing quoted/source layout
  And the layout is unambiguous in a right-to-left terminal

Scenario: corpus text is neutralised exactly as elsewhere
  Given a candidate record whose display text carries terminal control sequences
  When the section renders
  Then the sequences are removed by the same helper that protects the source line
  And the stored display text is unchanged

Scenario: truncation is announced
  Given a candidate whose display text exceeds the display limit
  When the section renders
  Then the truncation is stated in the same words used for the source line
  And the same limit constant is used rather than a second one

Scenario: a long candidate cannot flood the report
  Given five candidates each with a very long record
  When the section renders
  Then the same truncation applies to every one
  And the verdict and evidence remain visible without scrolling past them
```

**Edge cases:** five candidates for a claim with no citation; a candidate identical to the cited record (possible when the quote is contained elsewhere); suggestion text containing the disclaimer string; a candidate whose `number` is `null`; a report where claims and verdicts disagree in length (existing tolerance must extend); a candidate list arriving out of order from a hand-built report.

**Security:** **A03** — text nodes only, no raw-HTML sink, G-2 stays green. **A02** — nothing printed here reaches a log. **A08** — the section is rendered from `ClaimVerdict` and the suggestion state; it never writes back.

**Performance:** adds ≤ 50 ms per claim to render time (measured query cost). **Reliability:** a render-time fault prints the `unavailable` line and never suppresses the rest of the report.

---

### Story 8: Verdict × suggestion-state routing, end to end

**Epic** 3 · **Priority** Should · **RICE** 28.8 · **Risk** Medium · **Estimate** 0.5 person-months

> As a user, I want the report to say plainly why there are no suggestions, so that an empty section is never mistaken for a verdict I should act on.

**INVEST:** Depends on 7 · Negotiable (wording is a proposal) · Valuable (this is the honest-degradation requirement, which is where the product's credibility lives) · Estimable · Small · Testable.

**The routing matrix — every cell defined, none blank:**

| Verdict | Situation | State | Rendered as |
|---|---|---|---|
| `verified` | quote contained | `not_applicable` | no section (nothing to correct) |
| `verified` | — | — | suggestions never computed for a contained quote |
| `rejected` | candidates exist | `candidates` | the ranked section |
| `rejected` | none clear the floor | `no_candidates` | "no candidates found" |
| `unverifiable` (`empty_quote`) | no quote | `not_applicable` | no section |
| `unverifiable` (identifier unresolved) | quote present | `no_candidates` | "no candidates found" |
| `unverifiable` (timeout / malformed) | quote present | `unavailable` | "suggestions unavailable" |
| any | sidecar absent/stale/corrupt | `unavailable` | "suggestions unavailable" |
| any | user passed the opt-out flag | `disabled` | no section (Story 10) |

**Acceptance criteria**

```
Scenario: every cell of the matrix has a defined rendering
  Given the matrix above
  When each row is exercised
  Then each produces its stated state and its stated text
  And no combination renders an empty section with no explanation

Scenario: an undefined combination is a compile error
  Given the routing function
  When it is switched over the verdict and the state
  Then it has no default branch
  And a fourth verdict or a sixth state is a typecheck failure

Scenario: suggestion state never changes the run's exit code
  Given two identical runs, one with a healthy sidecar and one without
  When both complete
  Then both exit with the same code
  And neither adds an entry to the report's degraded list
  And no new degrade reason is introduced for suggestions

Scenario: suggestion state never reaches the ledger
  Given runs with and without suggestions
  When the ledger is verified
  Then both chains verify
  And the payloads are identical in shape
  And no degrade reason, trace field, or claim field mentions suggestions

Scenario: unavailable is never dressed as empty
  Given a run where the sidecar could not be opened
  When the report is read
  Then the text says suggestions were unavailable
  And it does not contain the no-candidates wording
  And the two are distinguishable by a reader with no other context

Scenario: the rejected and unverifiable boundary is preserved
  Given an unresolvable identifier with a quoted span
  When the report renders
  Then the verdict remains unverifiable and its reason remains identifier_unresolved
  And the absence of candidates does not change it to rejected
```

**Edge cases:** a claim with multiple citations (the routing uses the same citation the verdict used); a claim whose citation resolved to several records; `no sources found` for the whole run (every claim routes to a no-candidate or not-applicable state, and the run-level degradation is unchanged); suggestions computed for a claim the verifier never reached because the budget expired.

**Performance:** no measurable cost — the routing is a switch. **Reliability:** this story *is* the reliability story for the feature; every row is a §16 degradation entry.

---

### Story 9: Nothing about suggestions enters the trace, the ledger, or a log line

**Epic** 1 · **Priority** Should · **RICE** 20.4 · **Risk** Medium · **Estimate** 0.5 person-months

> As a judge auditing a run, I want the run trace to be identical whether or not suggestions were computed, so that I can be sure no suggestion state reached the authoritative record.

**INVEST:** Depends on 1, 5 · Negotiable · Valuable (it is the falsifiability claim, applied to the new feature) · Estimable · Small · Testable.

**Decision (deviates from the CEO's observability section, deliberately):** the spec asks for a `suggestions_path` trace span and state-count metrics inside the run trace. **Do not add them to `RunTraceDraft`.** `RunTraceDraft` is a hash-chained, schema-versioned, ledger-bound artefact; `toolsCalled`, `claims`, `degraded` and `timings` are the whole vocabulary. Putting non-authoritative display state into an authoritative artefact is precisely the leak the spec forbids elsewhere, a timing number invites a reader to correlate it with the verdict, and any new field means a `TRACE_SCHEMA_VERSION` bump plus a docs-claims sweep. Instead: **suggestion state counts are a separate, counts-only diagnostic surface** (harness metrics in Story 6, plus an opt-in stderr line), and `timings` gains nothing.

**Acceptance criteria**

```
Scenario: the run trace is byte-identical with and without suggestions
  Given the same question and snapshot, run once with suggestions and once with the opt-out flag
  When both traces are compared
  Then they are byte-identical
  And neither carries a suggestion field, a suggestion count, or a suggestion timing

Scenario: no suggestion content reaches any artefact
  Given a run that produced five candidates
  When the trace, the ledger, and every log line are searched
  Then no candidate text, no record text, no quote text and no question text appear
  And only hashes, ids, counts and reasons appear

Scenario: the ledger chain still verifies
  Given a sequence of runs with suggestions enabled
  When bun run verify:ledger and bun run verify:chain run
  Then both pass
  And no entry's payload shape differs from a run without suggestions

Scenario: the recorded run still decodes against the current schema
  Given a run recorded before this feature
  When it is decoded with the current schema
  Then it decodes without error
  And the schema version is unchanged by this feature

Scenario: state counts are available without becoming authoritative
  Given the opt-in diagnostic output
  When it runs
  Then it prints counts per state — requested, returned, empty, unavailable — and no content
  And it writes nothing to the trace, the ledger, or stdout of the report

Scenario: a red-team scan asserts the absence
  Given a fixture run with known candidate text
  When every persisted artefact is scanned for that text
  Then no match is found

Scenario: the question is still hashed, never printed
  Given a run with a question
  When the trace is inspected
  Then it carries questionHash and no question text
```

**Edge cases:** a candidate whose text happens to equal the question (the scan must not be fooled by a hash-only trace); a stderr line captured into CI logs (it must carry counts only); a state count that could be mistaken for a verdict count (naming must make the distinction explicit); a candidate record id that is itself sensitive (ids are already public corpus identifiers).

**Security:** **A02** — the whole story. **A08** — attestation, ledger and chain untouched. **G-4** gitleaks stays green; no secret can enter a file this feature writes.

**Performance:** zero measurable cost; the diagnostic line is opt-in.

---

### Story 10: Opt-out flag and a ruling on surface parity

**Epic** 3 · **Priority** Could · **RICE** 14.4 · **Risk** Low · **Estimate** 0.25 person-months

> As an operator in a constrained environment, I want to turn suggestions off in one flag, so that the feature costs nothing and can fail nothing where it is not wanted.

**INVEST:** Depends on 8 · Negotiable · Valuable (low) · Estimable · Small · Testable.

**Acceptance criteria**

```
Scenario: the flag short-circuits before any index work
  Given the opt-out flag
  When a run starts
  Then the sidecar is never opened and no candidate query is issued
  And the added cost over a run without the feature is indistinguishable from zero

Scenario: disabling suggestions changes nothing else
  Given the same question run with and without the flag
  When the reports are compared
  Then the verdict, the badge, the evidence, the run line, the relevance line, the exit code and the ledger entry are identical
  And the only difference is the absence of the suggestions section

Scenario: disabled is a choice, not a degradation
  Given a run with the flag
  When the report is read
  Then it prints nothing about suggestions
  And it does not add a degrade reason
  And the flag is discoverable in the CLI's own help output

Scenario: the web page and the MCP tool are unchanged
  Given the static page and the MCP tool result
  When they are inspected after this feature
  Then neither carries a suggestions field
  And the MCP wire schema is unchanged
  And the ruling is recorded in an ADR amendment with its reasons

Scenario: the CLI is the only surface this round
  Given the parity ruling
  When it is read
  Then it states that the CLI shows suggestions
  And it states why the MCP projection and the static badge map do not
  And it names the condition under which the ruling should be revisited
```

**Edge cases:** flag passed twice; flag with an equals-form value; flag combined with `--list-questions` (which must not open the snapshot at all); a run where the flag is set but the report is also being recorded to the ledger; an unknown flag (existing `EXIT_USAGE` behaviour unchanged).

**Performance:** a disabled run must not regress the enabled path — a test asserting the disabled run opens no database beyond the attested snapshot. **Reliability:** a flag cannot mask a failure, because a disabled run never reaches suggestion code at all.

---

## 3. Security Scenarios (consolidated, per story)

| Story | Threat | Required control |
|---|---|---|
| 1 | A display string carries corpus content into a log via an error detail | `UnavailableReason` is a closed code vocabulary; no free-text error embedded |
| 2 | Similarity machinery reaching the verdict path (CWE-345) | G-7.8/7.9/7.10/7.11 with planted violations; G-7.13 keeps the metric vocabulary out of display modules |
| 3 | An accuracy figure published as a guarantee | `check:docs` claim sweep; wording machine-checked |
| 4 | Sidecar leaks question text or secrets | Sidecar holds folded corpus text only; build is offline; G-4 stays green |
| 5 | **FTS5 `MATCH` injection via the quote** | Quote is untrusted input to a query parser; reuse the existing `assertQuotable` quoting discipline; no SQL string interpolation |
| 5 | A candidate from outside the attested snapshot | Candidates resolve only to records in the attested snapshot |
| 6 | Eval numbers quoted as accuracy | Report names the set, its mutation-derived construction, the unmeasured collections, and the literature baseline |
| 7 | Corpus text as an HTML/raw sink (A03) | Text nodes only; G-2 green; `normalizeForTerminal` on every printed candidate |
| 8 | Suggestion state altering the verdict or the run's trust | Exit code, degrade list, ledger payload all unchanged; verified/unverifiable boundary preserved |
| 9 | Suggestion or corpus content in trace/ledger/logs (A02) | Traces byte-identical with and without the feature; red-team scan for candidate text |
| 10 | Flag used to mask a failure | Disabled runs never reach suggestion code |

## 4. Performance Requirements

| Story | Latency target | Throughput / resource | Measured basis |
|---|---|---|---|
| 1 | none | none | type only |
| 2 | gates stay inside the <5 min full-CI budget | one extra closure resolution | AGENTS.md §14 |
| 3 | none | none | documentation |
| 4 | build ≤ 30 s; query p95 ≤ 50 ms | sidecar size reported and bounded | **measured 3.1 s build, 19 ms query** |
| 5 | p95 ≤ 50 ms/claim; ≤ 200 ms per 5-claim report | pool hard-capped at 400; no full-corpus in-memory sets | **measured 19 ms, pool 16–172** |
| 6 | full 40-case suite ≤ 30 s | deterministic, per-package | measured ~0.8 s of query time |
| 7 | ≤ 50 ms/claim added to render | truncation keeps the report readable | derived from Story 5 |
| 8 | none | none | a switch |
| 9 | none | none | nothing persisted |
| 10 | disabled run ≈ zero added cost | sidecar never opened | verified by test, not asserted |

**Scalability:** the pre-filter is a single indexed query whose cost is independent of corpus size; pool size is capped, so 10× corpus growth does not multiply per-query latency. There is no embedding inference at query time, by decision.

## 5. Reliability Requirements

| Story | Error handling | Timeout | Retry | Degradation |
|---|---|---|---|---|
| 1 | five states, exhaustive switch | n/a | none | is the degradation vocabulary |
| 2 | gate failure names gate, rule, file, line | none | none | CI red, named package |
| 3 | n/a | n/a | none | n/a |
| 4 | stale/corrupt/empty sidecar → `unavailable` | build is a separate command, so it cannot extend the CLI budget | none — a deterministic build | `suggestions unavailable`, verdict untouched |
| 5 | `Result` at every boundary, no throw crossing a package | within the per-claim budget | none — a retry would repeat a deterministic answer | `no_candidates` / `unavailable`; never a partial list |
| 6 | a missing sidecar reports "not measured", never 0% | suite-level | none | `n/a` rates |
| 7 | a render fault prints one line and keeps the report | none | none | section omitted with its state |
| 8 | every verdict × state cell defined | inherits the verification budget | none | §16 table, one row per cell |
| 9 | n/a | none | none | not applicable — nothing persisted |
| 10 | unknown flag → existing `EXIT_USAGE` | none | none | not applicable |

## 6. Task Definitions

```json
[
  {
    "id": "S1",
    "goal": "Declare the non-authoritative suggestion contract: five honest states, a candidate shape with no exported ranking number, and one non-authoritative label constant.",
    "deliverables": [
      { "name": "packages/mizan-suggest/src/suggestion-schema.ts", "format": "TypeScript" },
      { "name": "packages/mizan-suggest/package.json (typecheck + test scripts)", "format": "JSON" },
      { "name": "packages/mizan-suggest/src/suggestion-schema.test.ts", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "Exactly five states, exhaustive switch with no default branch", "verificationKind": "test_passes", "verificationSpec": "bun test src/suggestion-schema.test.ts" },
      { "text": "MatchStrength still has exactly two members and no fuzzy variant exists", "verificationKind": "contains_text", "verificationSpec": "packages/mizan-core/src/schema/verdict.ts" },
      { "text": "No candidate field carries a percentage, threshold, or the ranking value", "verificationKind": "test_passes", "verificationSpec": "bun test src/suggestion-schema.test.ts" },
      { "text": "UnavailableReason is a closed code vocabulary", "verificationKind": "test_passes", "verificationSpec": "bun test src/suggestion-schema.test.ts" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S2",
    "goal": "Extend G-7 with six suggestion-boundary rules, each proven by a planted violation in a fixture tree.",
    "deliverables": [
      { "name": "packages/mizan-gate/src/gates/g7-verdict-path-purity.ts (rules G-7.8..G-7.13)", "format": "TypeScript" },
      { "name": "packages/mizan-gate/test/gates.test.ts (one failing fixture per rule)", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "G-7.8 fires on a suggest module importing a verdict-path file", "verificationKind": "test_passes", "verificationSpec": "bun test test/gates.test.ts" },
      { "text": "G-7.9 fires on the token verdict/verified in code+strings mode", "verificationKind": "test_passes", "verificationSpec": "bun test test/gates.test.ts" },
      { "text": "G-7.10 fires on a third-party import; G-7.11 fires on fetch(", "verificationKind": "test_passes", "verificationSpec": "bun test test/gates.test.ts" },
      { "text": "Every new rule has a fixture that fails, and the self-test fails if one has none", "verificationKind": "test_passes", "verificationSpec": "bun test test/gates.test.ts" },
      { "text": "The real tree passes green with the suggest package absent", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S3",
    "goal": "Ratify ADR-001..004 and amend ADR-002 and ADR-004 with the measured pre-filter numbers and the decision not to export the ranking value.",
    "deliverables": [
      { "name": "specs/adr/ nearest-quote-suggestions (ADR-001..004, amended)", "format": "Markdown" },
      { "name": "docs claim check for suggestion accuracy wording", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "ADR-002 records the measured top-3 for every pre-filter strategy and pins the segment rule", "verificationKind": "contains_text", "verificationSpec": "specs/adr/" },
      { "text": "ADR-004 states that no numeric ranking value crosses the module boundary", "verificationKind": "contains_text", "verificationSpec": "specs/adr/" },
      { "text": "check:docs rejects an accuracy figure that does not name its set and construction", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" },
      { "text": "The documented gate count still matches GATE_IDS", "verificationKind": "command_exit_0", "verificationSpec": "bun run check:docs" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S4",
    "goal": "Build a deterministic FTS5 trigram pre-filter as a derived sidecar over the attested snapshot, with absence, staleness and corruption all degrading to suggestions unavailable.",
    "deliverables": [
      { "name": "sidecar build module (offline, reads only the attested snapshot)", "format": "TypeScript" },
      { "name": "build command + location documented together", "format": "TypeScript + Markdown" },
      { "name": "sidecar tests: determinism, staleness, absence, corruption, sub-3-char quote", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "Two builds of the same snapshot produce identical query results and row order", "verificationKind": "test_passes", "verificationSpec": "bun test (sidecar test file)" },
      { "text": "A sidecar whose snapshotHash differs is refused with a reason naming snapshotHash", "verificationKind": "test_passes", "verificationSpec": "bun test (sidecar test file)" },
      { "text": "Absent, truncated and empty sidecars all yield unavailable, never no_candidates", "verificationKind": "test_passes", "verificationSpec": "bun test (sidecar test file)" },
      { "text": "Build performs no network call and never writes to corpus.db", "verificationKind": "test_passes", "verificationSpec": "bun test (sidecar test file)" },
      { "text": "Build over 27,234 records completes within 30 s", "verificationKind": "command_exit_0", "verificationSpec": "the documented build command" },
      { "text": "G-1, G-6.5 and G-7 pass with the sidecar present and populated", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S5",
    "goal": "Produce a deterministic, deduplicated top-5 of nearest records with declared ordering rules and a pinned floor, and export no numeric ranking value.",
    "deliverables": [
      { "name": "candidate generation module (scope, short-circuit, order, tie-breaks, floor, dedup)", "format": "TypeScript" },
      { "name": "one module owning the pinned segment rule and the floor", "format": "TypeScript" },
      { "name": "tests: determinism x3, tie-breaks, exact precedence, dedup, floor, injection, purity", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "Three runs return byte-identical candidate lists on Linux and Windows", "verificationKind": "test_passes", "verificationSpec": "bun test (ranking test file)" },
      { "text": "A contained candidate outranks a higher-trigram-overlap near match", "verificationKind": "test_passes", "verificationSpec": "bun test (ranking test file)" },
      { "text": "Ties break by shared run then by recordId in code-unit order, never localeCompare", "verificationKind": "contains_text", "verificationSpec": "the ordering module" },
      { "text": "No duplicate folded text appears twice in one top-K", "verificationKind": "test_passes", "verificationSpec": "bun test (ranking test file)" },
      { "text": "A quote containing a double quote, caret, asterisk or OR is treated as literal text", "verificationKind": "test_passes", "verificationSpec": "bun test (ranking test file)" },
      { "text": "p95 <= 50 ms per claim and the candidate pool is capped", "verificationKind": "test_passes", "verificationSpec": "bun test (ranking test file)" },
      { "text": "The module contains no ambient-authority token", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S6",
    "goal": "Add a suggestion-coverage suite to @mizan/bench reporting top-1/3/5 presence as Rates, with the set's construction and unmeasured collections stated, and a regression floor.",
    "deliverables": [
      { "name": "suggestion coverage metrics + suite in the existing bench package", "format": "TypeScript" },
      { "name": "recorded baseline with set name, construction and measurement conditions", "format": "Markdown" },
      { "name": "regression test asserting the recorded baseline", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "Report states presence of the adjudicated source record, names the set, and marks it mutation-derived", "verificationKind": "test_passes", "verificationSpec": "bun test (bench report test file)" },
      { "text": "quran and tirmidhi are named as not measured", "verificationKind": "contains_text", "verificationSpec": "bench report renderer" },
      { "text": "A drop below the recorded top-3 baseline fails and names metric, baseline and observed", "verificationKind": "test_passes", "verificationSpec": "bun test (bench regression test)" },
      { "text": "Three runs produce byte-identical reports", "verificationKind": "test_passes", "verificationSpec": "bun test (bench report test file)" },
      { "text": "An empty suite prints n/a, never 0.0%", "verificationKind": "test_passes", "verificationSpec": "bun test (bench report test file)" },
      { "text": "The harness constructs no verdict and no candidate", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S7",
    "goal": "Render a nearest-suggestions section in the CLI report that is checkable from outside the program and leaves the verdict badge byte-identical.",
    "deliverables": [
      { "name": "suggestions section in the CLI report renderer", "format": "TypeScript" },
      { "name": "rendered-output tests for all three verdicts and all five states", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "Each row shows rank, citation label, source URL, display text and the disclaimer header", "verificationKind": "test_passes", "verificationSpec": "bun test (render test file)" },
      { "text": "Badge lines for verified, rejected and unverifiable are byte-identical to the pre-feature output", "verificationKind": "test_passes", "verificationSpec": "bun test (render test file)" },
      { "text": "The render module contains no similarity token and no score/percent/confidence property key", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" },
      { "text": "Terminal control sequences in candidate text are neutralised and truncation is announced", "verificationKind": "test_passes", "verificationSpec": "bun test (render test file)" },
      { "text": "No raw HTML sink is introduced", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci:gates" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S8",
    "goal": "Define and test the full verdict x suggestion-state routing matrix so every combination renders a stated state and no combination changes the exit code, the degrade list or the ledger.",
    "deliverables": [
      { "name": "routing function with an exhaustive switch", "format": "TypeScript" },
      { "name": "matrix test covering every cell", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "Every matrix cell renders its stated state and text", "verificationKind": "test_passes", "verificationSpec": "bun test (routing test file)" },
      { "text": "A sixth state or fourth verdict is a typecheck failure", "verificationKind": "command_exit_0", "verificationSpec": "bun run typecheck" },
      { "text": "Exit code, degrade list and ledger payload are unchanged by suggestion state", "verificationKind": "test_passes", "verificationSpec": "bun test (routing test file)" },
      { "text": "unavailable wording is distinguishable from no_candidates wording", "verificationKind": "test_passes", "verificationSpec": "bun test (routing test file)" },
      { "text": "rejected and unverifiable are not blurred by an absent candidate list", "verificationKind": "test_passes", "verificationSpec": "bun test (routing test file)" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S9",
    "goal": "Prove that no suggestion state, count, timing or content enters the run trace, the ledger or any log line, and expose counts only through a separate opt-in diagnostic.",
    "deliverables": [
      { "name": "trace/ledger equivalence tests with and without suggestions", "format": "TypeScript" },
      { "name": "opt-in counts-only diagnostic output", "format": "TypeScript" }
    ],
    "successCriteria": [
      { "text": "Traces are byte-identical with and without suggestions", "verificationKind": "test_passes", "verificationSpec": "bun test (provenance test file)" },
      { "text": "verify:ledger and verify:chain pass on runs produced with suggestions enabled", "verificationKind": "command_exit_0", "verificationSpec": "bun run verify:ledger" },
      { "text": "A scan of every persisted artefact finds no candidate, record, quote or question text", "verificationKind": "test_passes", "verificationSpec": "bun test (provenance test file)" },
      { "text": "A pre-feature run still decodes against the current schema; the schema version is unchanged", "verificationKind": "test_passes", "verificationSpec": "bun test (provenance test file)" },
      { "text": "The diagnostic prints counts only and writes nothing to the trace or stdout", "verificationKind": "test_passes", "verificationSpec": "bun test (provenance test file)" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  },
  {
    "id": "S10",
    "goal": "Add an opt-out flag that short-circuits before any index work, and record a ruling that the CLI is the only suggestion surface this round.",
    "deliverables": [
      { "name": "CLI opt-out flag, default on, discoverable in help", "format": "TypeScript" },
      { "name": "ADR amendment recording the surface-parity ruling and its revisit condition", "format": "Markdown" }
    ],
    "successCriteria": [
      { "text": "A disabled run never opens the sidecar", "verificationKind": "test_passes", "verificationSpec": "bun test (cli flag test file)" },
      { "text": "Reports with and without the flag differ only by the suggestions section", "verificationKind": "test_passes", "verificationSpec": "bun test (cli flag test file)" },
      { "text": "A disabled run adds no degrade reason and does not change the exit code", "verificationKind": "test_passes", "verificationSpec": "bun test (cli flag test file)" },
      { "text": "The MCP wire schema and the static page are unchanged", "verificationKind": "command_exit_0", "verificationSpec": "bun run ci" },
      { "text": "The parity ruling and its revisit condition are recorded", "verificationKind": "contains_text", "verificationSpec": "specs/adr/" }
    ],
    "accessNeeded": ["read", "write", "shell"]
  }
]
```

---

## 7. Competitive Feature Comparison

| Capability | HUMAIN | BurhanAI | TCE / ElKoumy | Isnad AI | **mizan today** | **mizan after** |
|---|---|---|---|---|---|---|
| Detection / validation | 86.14% | 88.60% | 89.82% | rule-based | containment-verified, audited | unchanged |
| Correction (whole field) | 68.18% ≈ baseline | 66.56% ≈ baseline | — | none | **absent** | top-3 presence 37/40 on a mutation set |
| LLM in the correction path | yes | yes | yes (judge) | no | — | **no — differentiator** |
| Determinism (byte-identical repeats) | no | no | no | yes (trivially) | yes | **yes, including suggestions** |
| Third-party / model deps in scoring | yes | yes | yes | none | none | **none** |
| Explicit "no candidates" state | no (floats reported) | no | no | n/a | n/a | **yes** |
| Orthographic-variant handling | fuzzy needed it | normalized stage | — | — | **fold table absorbs it, no fuzzy path** | unchanged advantage |
| Hadith validation strictness | proved strict substring optimal | — | — | — | **strict containment, the strongest published bar** | unchanged |

**Table-stakes features the spec omits — flagged:**

1. **Duplicate suppression.** Measured: **112 duplicate folded-text groups, 307 rows, largest group = 31 identical records.** A "top 5 nearest quotes" that prints the same verse five times is a worse product than no list. No competitor in the research addresses it. → Story 5, Story 7.
2. **Collection-scope honesty.** IslamicEval 2026 splits fragments into Ayah / matn / **isnad** / claimed source. A nearest-quote suggestion that ignores the isnad boundary can offer a matn from a different chain — a *correctness* hazard, not a ranking one. Minimum viable: the harness must report whether each candidate shares the cited collection. → Story 5 (scope policy), Story 6 (reporting).
3. **Coverage disclosure by collection.** The only committed fabrication set is hadith-only; 6,236 quran records are unmeasured. Publishing one figure for the corpus would be exactly the over-claim the risk register forbids. → Story 6.
4. **Near-duplicate vs. exact-duplicate distinction.** 31 identical quran records may be the same verse indexed at several positions; the harness should say whether duplicates are *identical text* or *near-identical text*, because the two need different fixes. → Story 6.

**Explicitly confirmed as table-stakes and already covered:** answer-relevance (Sprint 2's `relevance.ts`, ≈ Subtask 4), strict hadith validation, orthographic normalisation.

---

## 8. Risk Register (refined with evidence)

| Risk | Sev | Likelihood | Evidence / change | Mitigation |
|---|---|---|---|---|
| Architectural boundary violation (CWE-345) | 5 | 4 | G-6.5 already closes the import direction; **G-7.9's word ban is the new control** | Story 2 rules + planted fixtures |
| Expectation-setting vs 67.5% baseline | 5 | 5 | My 92.5% top-3 is **not comparable** — it is presence on a mutation-derived set, not whole-field accuracy | Story 3 claim sweep; Story 6 discloses construction |
| Determinism regression | 5 | 2 | Tie-break must use code-unit order — `scan.ts:75` documents the ICU hazard | Declared tie-break order; 3-run byte-identity test on both OSes |
| **Lexical pre-filter reused** | 5 | 3 | **Measured: top-3 collapses 37/40 → 15/40** | Story 4 mandates a trigram index; Story 3 records the negative result |
| **Naive single-phrase pre-filter** | 5 | 4 | **Measured: pool of 9, top-3 16/40** | Story 4/5 pin the 2×24 OR-segment rule |
| **Duplicate suggestions** | 3 | 5 | **Measured: 31 identical records in one group** | Story 5 dedup + Story 7 assertion |
| Snapshot mutation / re-ingest | 4 | 3 | Sidecar avoids mutating the attested 83 MB artefact; attestation compares records digest + count only | Story 4 sidecar decision |
| FTS5 `MATCH` injection via the quote | 4 | 3 | `MATCH` is a query language; `assertQuotable` is the existing precedent | Story 5 literal-text requirement |
| Suggestion state leaking into trace/ledger | 4 | 2 | CEO's spec asked for a trace span; **I am refusing that** | Story 9 byte-identity tests |
| Gate/CI regression | 5 | 3 | Adding `G-8` would churn every doc that states the gate count | Extend G-7 instead; no new gate id |
| Gate false positives on the new package | 3 | 4 | G-6.1/6.3/6.4 already scan the whole tree: no `verdict: "verified"`, no `percent:`, no ad-hoc `matchStrength:` may appear in `packages/mizan-suggest/` | Story 1 keeps the vocabulary clean; Story 2 pins the rest |
| Corpus growth | 2 | 3 | Per-query cost is one indexed query + a capped pool; no embedding inference | Story 5 pool cap |
| CI environment lacks the sidecar | 3 | 2 | Degrades to `unavailable`; the whole chain still tests green | By design |

---

## 9. Sprint Summary

| Sprint | Stories | Theme | Exit condition |
|---|---|---|---|
| **Sprint 1** | 1–6 | Boundary, vocabulary, the measured recipe, and the regression floor | A trigram-indexed top-5 exists, is byte-identical across runs, is measured at ≥ the recorded baseline, and six new gate rules each fail on a planted violation |
| **Sprint 2** | 7–10 | The surfaces a judge reads, honest degradation, provenance silence, operator control | Every verdict × state cell renders a stated state; the trace is byte-identical with and without the feature; the CLI is the only surface, by recorded ruling |

Sprint 3 is deliberately **not** planned: whether a quran-side fabrication set, an isnad-aware scope policy, or a second surface is warranted is a decision that should be made with Sprint 1's measured coverage in hand, not before it.

```json
{
  "stories": [
    {
      "id": "S1",
      "title": "Suggestion contract with five honest states",
      "sprint": 1,
      "epic": "Epic 1: Architectural Boundary & Non-Authoritative Suggestions",
      "priority": "must",
      "rice": 91.2,
      "riceInputs": { "reach": 8, "impact": 3, "confidence": 0.95, "effortPersonMonths": 0.25 },
      "risk": "low",
      "statement": "As a judge reading a report, I want every suggestion surface to declare its own authority and its own failure mode, so that no suggestion can ever be mistaken for a verdict.",
      "dependsOn": [],
      "blocks": ["S4", "S5", "S7", "S8", "S9"],
      "keyDecisions": [
        "Five states: candidates | no_candidates | unavailable | not_applicable | disabled",
        "No exported ranking number; closeness carries sharedChars and quoteChars only, never a ratio",
        "UnavailableReason is a closed code vocabulary so no corpus text can reach a log"
      ],
      "verification": "bun test (package-local, per AGENTS.md section 8)"
    },
    {
      "id": "S2",
      "title": "Boundary enforcement for the suggestion path, with planted violations",
      "sprint": 1,
      "epic": "Epic 1",
      "priority": "must",
      "rice": 43.2,
      "riceInputs": { "reach": 8, "impact": 3, "confidence": 0.9, "effortPersonMonths": 0.5 },
      "risk": "high",
      "statement": "As the repository, I want the suggestion boundary machine-checked, so that suggestions cannot influence verdicts is a build failure rather than a review comment.",
      "dependsOn": [],
      "blocks": ["S5", "S7"],
      "keyDecisions": [
        "Extend G-7 rather than add G-8, because docs-gates machine-checks the gate count across every file",
        "New rules: G-7.8 no verdict-path import, G-7.9 verdict/verified word ban in code+strings, G-7.10 dependency allowlist, G-7.11 no ambient authority, G-7.12 display-path rename guard, G-7.13 no similarity token in display modules",
        "Every rule needs a planted fixture that fails; a rule with no failing fixture fails the self-test"
      ],
      "verification": "bun run ci:gates"
    },
    {
      "id": "S3",
      "title": "Ratify ADR-001 to ADR-004 and amend ADR-002 and ADR-004 with the measurements",
      "sprint": 1,
      "epic": "Epic 1 / ADRs",
      "priority": "must",
      "rice": 93.3,
      "riceInputs": { "reach": 7, "impact": 2, "confidence": 1.0, "effortPersonMonths": 0.15 },
      "risk": "low",
      "statement": "As the next engineer, I want the decision record to carry the measurements that justify it, so the algorithm is not re-litigated from memory.",
      "dependsOn": [],
      "blocks": ["S4", "S5"],
      "keyDecisions": [
        "ADR-002 amended with the measured negative results, not only the chosen recipe",
        "ADR-004 amended to remove the exported ranking value entirely",
        "Accuracy wording machine-checked by the docs claim sweep"
      ],
      "verification": "bun run check:docs"
    },
    {
      "id": "S4",
      "title": "Trigram pre-filter as a derived, rebuildable sidecar",
      "sprint": 1,
      "epic": "Epic 2: Deterministic Candidate Generation",
      "priority": "must (promoted from should)",
      "rice": 11.2,
      "riceInputs": { "reach": 8, "impact": 3, "confidence": 0.7, "effortPersonMonths": 1.5 },
      "risk": "high",
      "statement": "As a user with a misquoted hadith, I want the whole attested corpus searched for near neighbours, so I see real alternatives rather than what a word-boundary index happens to match.",
      "dependsOn": ["S1", "S3"],
      "blocks": ["S5"],
      "keyDecisions": [
        "Sidecar SQLite file, not a table inside the committed attested corpus.db, so no re-ingest and no network are required",
        "Absence, staleness and corruption all degrade to suggestions unavailable",
        "Bun 1.3.14 ships SQLite 3.53.0 with a working FTS5 trigram tokenizer, verified read-only"
      ],
      "verification": "bun test (package-local) plus the documented build command"
    },
    {
      "id": "S5",
      "title": "Deterministic top-K ranking with folded-text dedup",
      "sprint": 1,
      "epic": "Epic 2",
      "priority": "must (promoted from should)",
      "rice": 12.8,
      "riceInputs": { "reach": 8, "impact": 3, "confidence": 0.8, "effortPersonMonths": 1.5 },
      "risk": "high",
      "statement": "As a user whose quote was rejected, I want the nearest real records ranked identically every time, with no duplicates and no invented text, so I can check each one myself.",
      "dependsOn": ["S1", "S3", "S4"],
      "blocks": ["S6", "S7", "S8", "S9"],
      "keyDecisions": [
        "Pre-filter is an OR of 2 evenly-spaced 24-character segments, pinned in one module; measured top-3 37/40 vs 15/40 for the existing lexical retrieval",
        "Exact containment short-circuits above every graded candidate",
        "Tie-breaks: longer shared run, then lower recordId in UTF-16 code-unit order, never localeCompare",
        "At most one candidate per distinct folded text; the corpus contains 31 identical records in one group",
        "The quote is untrusted input to the FTS5 MATCH parser and must be treated as literal text"
      ],
      "verification": "bun test (package-local)"
    },
    {
      "id": "S6",
      "title": "Suggestion coverage measurement inside @mizan/bench",
      "sprint": 1,
      "epic": "Epic 4: Evaluation & Baseline Tracking",
      "priority": "should",
      "rice": 9.0,
      "riceInputs": { "reach": 5, "impact": 2, "confidence": 0.9, "effortPersonMonths": 1.0 },
      "risk": "low",
      "statement": "As the team, we want suggestion coverage measured by the harness that already scores the verifier, so coverage is tracked and regressions are caught without a second reporting system.",
      "dependsOn": ["S5"],
      "blocks": [],
      "keyDecisions": [
        "Extend @mizan/bench; never a second harness (AGENTS.md section 17)",
        "Metric is presence of the adjudicated source record, not correction accuracy",
        "Provisional baseline on data/eval/redteam-fabricated.json: top-1 33/40, top-3 37/40, top-5 37/40, 19 ms per case",
        "quran and tirmidhi are named as not measured; the set is named as mutation-derived"
      ],
      "verification": "bun test (package-local, bench package)"
    },
    {
      "id": "S7",
      "title": "Nearest suggestions section in the CLI report",
      "sprint": 2,
      "epic": "Epic 3: Render & UX Integration",
      "priority": "should",
      "rice": 13.6,
      "riceInputs": { "reach": 8, "impact": 2, "confidence": 0.85, "effortPersonMonths": 1.0 },
      "risk": "medium",
      "statement": "As a judge, I want the nearest real records printed beside a rejected quote with their references, so I can open each source and check it myself.",
      "dependsOn": ["S1", "S5"],
      "blocks": ["S8", "S10"],
      "keyDecisions": [
        "render.ts may not name jaccard, trigram, similarity or threshold (G-7.2) nor use score/percent/confidence as property keys (G-7.4)",
        "Labeled stack layout, never a two-column table, matching the existing quoted/source layout",
        "Badge lines stay byte-identical for all three verdicts"
      ],
      "verification": "bun test (apps/cli, package-local)"
    },
    {
      "id": "S8",
      "title": "Verdict x suggestion-state routing matrix, end to end",
      "sprint": 2,
      "epic": "Epic 3",
      "priority": "should",
      "rice": 28.8,
      "riceInputs": { "reach": 8, "impact": 2, "confidence": 0.9, "effortPersonMonths": 0.5 },
      "risk": "medium",
      "statement": "As a user, I want the report to say plainly why there are no suggestions, so an empty section is never mistaken for a verdict I should act on.",
      "dependsOn": ["S7"],
      "blocks": ["S10"],
      "keyDecisions": [
        "Every verdict x state cell is defined; the switch has no default branch",
        "Suggestion state never changes the exit code, the degrade list or the ledger payload",
        "No new DegradeReason is introduced for suggestions",
        "unavailable wording is distinguishable from no_candidates wording to a reader with no other context"
      ],
      "verification": "bun test (apps/cli, package-local)"
    },
    {
      "id": "S9",
      "title": "Nothing about suggestions enters the trace, the ledger or a log line",
      "sprint": 2,
      "epic": "Epic 1",
      "priority": "should",
      "rice": 20.4,
      "riceInputs": { "reach": 6, "impact": 2, "confidence": 0.85, "effortPersonMonths": 0.5 },
      "risk": "medium",
      "statement": "As a judge auditing a run, I want the run trace to be identical whether or not suggestions were computed, so I can be sure no suggestion state reached the authoritative record.",
      "dependsOn": ["S1", "S5"],
      "blocks": [],
      "keyDecisions": [
        "Deliberately refuses the spec's requests for a suggestions_path trace span and trace state metrics",
        "RunTraceDraft, TRACE_SCHEMA_VERSION, timings and the ledger payload are all unchanged",
        "Counts exposed only through a separate opt-in counts-only diagnostic",
        "A red-team scan asserts candidate text appears in no persisted artefact"
      ],
      "verification": "bun run verify:ledger; bun run verify:chain; bun run verify:runs"
    },
    {
      "id": "S10",
      "title": "Opt-out flag and a ruling on surface parity",
      "sprint": 2,
      "epic": "Epic 3",
      "priority": "could",
      "rice": 14.4,
      "riceInputs": { "reach": 4, "impact": 1, "confidence": 0.9, "effortPersonMonths": 0.25 },
      "risk": "low",
      "statement": "As an operator in a constrained environment, I want to turn suggestions off in one flag, so the feature costs nothing and can fail nothing where it is not wanted.",
      "dependsOn": ["S8"],
      "blocks": [],
      "keyDecisions": [
        "Flag short-circuits before the sidecar is opened, so a disabled run has zero added cost",
        "Disabled prints nothing and adds no degrade reason; it is a user choice, not a degradation",
        "CLI is the only suggestion surface this round; the MCP wire schema and the static page are unchanged, with the revisit condition recorded"
      ],
      "verification": "bun run ci"
    }
  ],
  "acceptanceCriteria": [
    { "id": "S1-AC1", "storyId": "S1", "scenario": "The state vocabulary has exactly five members", "given": "The suggestion state module", "when": "The union is declared and a renderer switches over it", "then": "There are exactly five members and no default branch, so a sixth state is a compile error" },
    { "id": "S1-AC2", "storyId": "S1", "scenario": "Candidates are labelled non-authoritative wherever they appear", "given": "A report rendering a candidates state", "when": "The section is printed", "then": "The disclaimer constant appears in the header and is imported from the single owning module" },
    { "id": "S1-AC3", "storyId": "S1", "scenario": "An empty result is named, never shown as an empty list", "given": "A rejected verdict where nothing cleared the floor", "when": "The section renders", "then": "It prints no ranked rows and no rank-1 placeholder, and names the state" },
    { "id": "S1-AC4", "storyId": "S1", "scenario": "An unavailable search is distinguished from an empty one", "given": "The trigram sidecar is absent", "when": "The suggestion state is produced", "then": "The state is unavailable with a coded reason and does not read as 'we looked and found nothing'" },
    { "id": "S1-AC5", "storyId": "S1", "scenario": "MatchStrength is untouched", "given": "The existing MatchStrength union", "when": "The suggestion contract is added anywhere in the repository", "then": "MatchStrength still has exactly two members and no fuzzy or percentage variant exists" },
    { "id": "S1-AC6", "storyId": "S1", "scenario": "A candidate cannot carry a tunable number", "given": "The candidate type", "when": "Its fields are enumerated", "then": "No field carries the ranking value, a percentage or a threshold; the only numerics are sharedChars and quoteChars" },
    { "id": "S1-AC7", "storyId": "S1", "scenario": "An unavailable reason cannot smuggle corpus text into a log", "given": "An unavailable state built from a filesystem error", "when": "The reason is encoded", "then": "It comes from a closed code vocabulary and embeds no error string, record text or question text" },
    { "id": "S2-AC1", "storyId": "S2", "scenario": "The gate fires on a suggestion reaching verdict computation", "given": "A fixture where the suggest module imports steps/containment.ts", "when": "G-7 runs", "then": "G-7.8 reports a finding naming both files" },
    { "id": "S2-AC2", "storyId": "S2", "scenario": "The gate fires on a suggestion module naming an outcome", "given": "A fixture where the suggest module contains the literal verified", "when": "G-7 runs in code+strings mode", "then": "G-7.9 reports a finding, including when returned from a module-level constant" },
    { "id": "S2-AC3", "storyId": "S2", "scenario": "The gate fires on a network call in the suggestion path", "given": "A fixture where the suggest module calls fetch(", "when": "G-7 runs", "then": "G-7.11 reports a finding" },
    { "id": "S2-AC4", "storyId": "S2", "scenario": "The gate fires on a third-party dependency", "given": "A fixture where the suggest package imports an embedding library", "when": "G-7 runs", "then": "G-7.10 reports a finding naming the specifier" },
    { "id": "S2-AC5", "storyId": "S2", "scenario": "Every new rule has a planted violation that fails", "given": "One fixture per rule", "when": "The self-test runs each", "then": "Every fixture produces a finding, and a rule with no failing fixture fails the self-test" },
    { "id": "S2-AC6", "storyId": "S2", "scenario": "The real tree passes with the suggest package absent", "given": "A tree without packages/mizan-suggest", "when": "The gates run", "then": "G-7 passes and the self-test separately proves each rule fires, so there is no vacuous green" },
    { "id": "S2-AC7", "storyId": "S2", "scenario": "Adding the suggest package does not change the verdict path", "given": "The suggest package fully wired", "when": "G-6.5 runs", "then": "The import closure of verify.ts still equals VERDICT_PATH exactly" },
    { "id": "S3-AC1", "storyId": "S3", "scenario": "Every ADR has the four required sections and a status", "given": "ADR-001 to ADR-004", "when": "Each is read", "then": "Each states Context, Decision, Rationale, Consequences and a status, and each is linked from the specification" },
    { "id": "S3-AC2", "storyId": "S3", "scenario": "ADR-002 carries the measurement, not just the name", "given": "ADR-002", "when": "It is read", "then": "It records 15/40 for the existing lexical pre-filter, 16/40 for a single-phrase trigram pre-filter with a pool of 9, and pins the 2x24 segment rule" },
    { "id": "S3-AC3", "storyId": "S3", "scenario": "ADR-004 is amended to remove the exported ranking value", "given": "ADR-004", "when": "It is read", "then": "It states that no numeric ranking value crosses the boundary, with the gate reason and the strategic reason" },
    { "id": "S3-AC4", "storyId": "S3", "scenario": "The accuracy wording is machine-checked", "given": "Any file stating a suggestion accuracy figure", "when": "bun run check:docs runs", "then": "The figure must name the set and its construction, and guarantee language in a suggestion context is rejected" },
    { "id": "S3-AC5", "storyId": "S3", "scenario": "No guarantee language reaches a user-visible surface", "given": "The CLI render module and the static page", "when": "Their strings are scanned", "then": "Neither claims the system finds the correct quote" },
    { "id": "S4-AC1", "storyId": "S4", "scenario": "The sidecar is built from the attested snapshot only", "given": "An attested snapshot with a known snapshotHash", "when": "The build runs", "then": "The sidecar records that hash, performs no network call and reads only the attested snapshot" },
    { "id": "S4-AC2", "storyId": "S4", "scenario": "The build is deterministic", "given": "The same snapshot built twice", "when": "Both are queried with the same segments", "then": "They return identical candidate id sets in identical order and the row order matches" },
    { "id": "S4-AC3", "storyId": "S4", "scenario": "A sidecar from a different snapshot is refused, not used", "given": "A sidecar whose snapshotHash does not match", "when": "A suggestion is requested", "then": "The state is unavailable with a reason naming snapshotHash, no candidate is returned, and the operator is told which field diverged" },
    { "id": "S4-AC4", "storyId": "S4", "scenario": "An absent sidecar degrades honestly", "given": "No sidecar file", "when": "A suggestion is requested", "then": "The state is unavailable and the verdict, badge, exit code and ledger entry are all unchanged and the run is not marked degraded" },
    { "id": "S4-AC5", "storyId": "S4", "scenario": "A corrupt or truncated sidecar degrades honestly", "given": "A sidecar that fails to open or fails a schema read", "when": "A suggestion is requested", "then": "The state is unavailable, no partial list is returned and nothing throws across the package boundary" },
    { "id": "S4-AC6", "storyId": "S4", "scenario": "A quote shorter than the tokenizer's reach cannot match", "given": "A folded quote of fewer than 3 characters", "when": "The pre-filter runs", "then": "No trigram query is issued, the state is no_candidates, and this is documented as a tokenizer property" },
    { "id": "S4-AC7", "storyId": "S4", "scenario": "The verifier never sees the index", "given": "The sidecar exists and is populated", "when": "The verifier's import closure is computed", "then": "The sidecar is not in it and G-1.1 and G-6.5 pass unchanged" },
    { "id": "S4-AC8", "storyId": "S4", "scenario": "The build is reproducible from a clean checkout", "given": "A clean clone with the committed corpus and no sidecar", "when": "The documented build command runs offline", "then": "It produces a working sidecar and the command is named where the sidecar's location is named" },
    { "id": "S5-AC1", "storyId": "S5", "scenario": "Byte-identical results across repeated runs", "given": "The same folded quote and the same sidecar", "when": "The ranking runs three times on Linux and on Windows", "then": "All runs return the same candidate ids in the same order with the same closeness values" },
    { "id": "S5-AC2", "storyId": "S5", "scenario": "A contained candidate outranks a closer-looking near match", "given": "A quote contained in candidate A but sharing more trigrams with candidate B", "when": "The ranking runs", "then": "A is rank 1 with closeness kind exact, by a declared ordering rule" },
    { "id": "S5-AC3", "storyId": "S5", "scenario": "Ties are broken deterministically by a declared order", "given": "Two candidates with identical shared trigram counts", "when": "The ranking runs", "then": "The longer shared run wins, then the lower recordId in code-unit order, and the order is written down in the one owning module" },
    { "id": "S5-AC4", "storyId": "S5", "scenario": "The same quote is never suggested twice", "given": "A corpus region containing 31 records with identical folded text", "when": "A top-5 is produced from it", "then": "At most one appears, the remaining slots hold distinct records, and a suppressed duplicate is marked rather than silently dropped" },
    { "id": "S5-AC5", "storyId": "S5", "scenario": "Below the floor is an honest state", "given": "A folded quote sharing no trigram with any record in scope", "when": "The ranking runs", "then": "The state is no_candidates, no candidate is returned and nothing is invented to fill the list" },
    { "id": "S5-AC6", "storyId": "S5", "scenario": "The floor is one declared constant with its measurement beside it", "given": "The module owning the floor", "when": "It is read and then changed without updating the measurement", "then": "The declared coverage sits beside it and the Story 6 regression test fails" },
    { "id": "S5-AC7", "storyId": "S5", "scenario": "Quote text cannot become FTS5 syntax", "given": "A quote containing a double quote, caret, asterisk or the word OR", "when": "The pre-filter builds its match expression", "then": "Those characters are literal text using the existing quoting discipline and the candidate set cannot be widened" },
    { "id": "S5-AC8", "storyId": "S5", "scenario": "Suggestions are scoped to the attested corpus", "given": "A snapshotHash", "when": "Candidates are produced", "then": "Every candidate resolves to a record in that snapshot and no external or cached source contributes one" },
    { "id": "S5-AC9", "storyId": "S5", "scenario": "No clock, no randomness, no network", "given": "The ranking module", "when": "G-7.11 inspects it", "then": "No ambient-authority token is present and the output is a pure function of its inputs" },
    { "id": "S6-AC1", "storyId": "S6", "scenario": "The harness reports top-K presence with named denominators", "given": "The fabrication suite", "when": "The report is rendered", "then": "Top-1, top-3 and top-5 appear as Rates with counts and an empty suite prints n/a rather than 0.0%" },
    { "id": "S6-AC2", "storyId": "S6", "scenario": "The report cannot be read as a correction-accuracy claim", "given": "The rendered report", "when": "A reader reads it", "then": "It states the metric is presence of the adjudicated source record, names the set and its mutation-derived construction, prints diagnostic and non-authoritative, and prints the literature baseline with the do-nothing figure" },
    { "id": "S6-AC3", "storyId": "S6", "scenario": "Coverage outside the measured collections is stated as unmeasured", "given": "The report", "when": "The collections covered are printed", "then": "quran and tirmidhi are named as not measured and no figure claims corpus-wide coverage" },
    { "id": "S6-AC4", "storyId": "S6", "scenario": "A regression fails the build", "given": "The recorded baseline of 37/40 at top-3", "when": "The harness runs and top-3 drops below 36/40", "then": "The run fails naming the metric, the baseline and the observed value" },
    { "id": "S6-AC5", "storyId": "S6", "scenario": "The harness is deterministic", "given": "The same sidecar and set", "when": "The harness runs three times", "then": "The three reports are byte-identical" },
    { "id": "S6-AC6", "storyId": "S6", "scenario": "The harness cannot manufacture a verdict or a candidate", "given": "The harness source", "when": "It is inspected", "then": "It constructs no verdict and no candidate and scores outcomes handed to it" },
    { "id": "S7-AC1", "storyId": "S7", "scenario": "Each candidate is checkable from outside the program", "given": "A rejected claim with candidates", "when": "The section renders", "then": "Each row shows rank, the one citation label, the source URL and the display text under a disclaimer header" },
    { "id": "S7-AC2", "storyId": "S7", "scenario": "The badge is byte-identical to before this feature", "given": "A verified, a rejected and an unverifiable report", "when": "They are rendered", "then": "Each badge line is byte-identical to the pre-feature output and no candidate text appears in any badge or reason line" },
    { "id": "S7-AC3", "storyId": "S7", "scenario": "No similarity vocabulary reaches the renderer", "given": "The render module source", "when": "G-7.2 runs", "then": "No finding is reported and the module names no metric it displays, only the two integers it prints" },
    { "id": "S7-AC4", "storyId": "S7", "scenario": "Corpus text is neutralised exactly as elsewhere", "given": "A candidate record carrying terminal control sequences", "when": "The section renders", "then": "The same helper removes them and the stored display text is unchanged" },
    { "id": "S7-AC5", "storyId": "S7", "scenario": "Truncation is announced with the existing wording", "given": "A candidate exceeding the display limit", "when": "The section renders", "then": "The same announcement and the same limit constant are used rather than a second pair" },
    { "id": "S7-AC6", "storyId": "S7", "scenario": "A long candidate cannot flood the report", "given": "Five candidates each with a very long record", "when": "The section renders", "then": "Truncation applies to every one and the verdict stays visible without scrolling past it" },
    { "id": "S8-AC1", "storyId": "S8", "scenario": "Every cell of the matrix has a defined rendering", "given": "The verdict x state matrix", "when": "Each row is exercised", "then": "Each produces its stated state and text and no combination renders an unexplained empty section" },
    { "id": "S8-AC2", "storyId": "S8", "scenario": "An undefined combination is a compile error", "given": "The routing function", "when": "It is switched over verdict and state", "then": "It has no default branch and a sixth state or fourth verdict fails typecheck" },
    { "id": "S8-AC3", "storyId": "S8", "scenario": "Suggestion state never changes the run's exit code", "given": "Two identical runs, one healthy sidecar and one without", "when": "Both complete", "then": "Both exit with the same code, neither adds a degrade entry and no new degrade reason is introduced" },
    { "id": "S8-AC4", "storyId": "S8", "scenario": "Suggestion state never reaches the ledger", "given": "Runs with and without suggestions", "when": "The ledger is verified", "then": "Both chains verify, payload shapes are identical and no field mentions suggestions" },
    { "id": "S8-AC5", "storyId": "S8", "scenario": "Unavailable is never dressed as empty", "given": "A run where the sidecar could not be opened", "when": "The report is read", "then": "It says suggestions were unavailable, does not contain the no-candidates wording and the two are distinguishable without other context" },
    { "id": "S8-AC6", "storyId": "S8", "scenario": "The rejected and unverifiable boundary is preserved", "given": "An unresolvable identifier with a quoted span", "when": "The report renders", "then": "The verdict stays unverifiable with reason identifier_unresolved and is not changed to rejected" },
    { "id": "S9-AC1", "storyId": "S9", "scenario": "The run trace is byte-identical with and without suggestions", "given": "The same question and snapshot, run with suggestions and with the opt-out flag", "when": "The traces are compared", "then": "They are byte-identical and neither carries a suggestion field, count or timing" },
    { "id": "S9-AC2", "storyId": "S9", "scenario": "No suggestion content reaches any artefact", "given": "A run that produced five candidates", "when": "The trace, ledger and every log line are searched", "then": "No candidate, record, quote or question text appears and only hashes, ids, counts and reasons do" },
    { "id": "S9-AC3", "storyId": "S9", "scenario": "The ledger chain still verifies", "given": "A sequence of runs with suggestions enabled", "when": "verify:ledger and verify:chain run", "then": "Both pass and no payload shape differs from a run without suggestions" },
    { "id": "S9-AC4", "storyId": "S9", "scenario": "Pre-feature runs still decode and the schema version is unchanged", "given": "A run recorded before this feature", "when": "It is decoded with the current schema", "then": "It decodes without error and the trace schema version is unchanged by this feature" },
    { "id": "S9-AC5", "storyId": "S9", "scenario": "State counts are available without becoming authoritative", "given": "The opt-in diagnostic output", "when": "It runs", "then": "It prints counts per state and no content, and writes nothing to the trace, the ledger or report stdout" },
    { "id": "S9-AC6", "storyId": "S9", "scenario": "A red-team scan asserts the absence", "given": "A fixture run with known candidate text", "when": "Every persisted artefact is scanned for that text", "then": "No match is found" },
    { "id": "S10-AC1", "storyId": "S10", "scenario": "The flag short-circuits before any index work", "given": "The opt-out flag", "when": "A run starts", "then": "The sidecar is never opened and the added cost is indistinguishable from zero" },
    { "id": "S10-AC2", "storyId": "S10", "scenario": "Disabling suggestions changes nothing else", "given": "The same question run with and without the flag", "when": "The reports are compared", "then": "Verdict, badge, evidence, run line, relevance line, exit code and ledger entry are identical and only the section is absent" },
    { "id": "S10-AC3", "storyId": "S10", "scenario": "Disabled is a choice, not a degradation", "given": "A run with the flag", "when": "The report is read", "then": "It prints nothing about suggestions, adds no degrade reason and the flag appears in the CLI help" },
    { "id": "S10-AC4", "storyId": "S10", "scenario": "The web page and the MCP tool are unchanged", "given": "The static page and the MCP tool result", "when": "They are inspected after this feature", "then": "Neither carries a suggestions field and the MCP wire schema is unchanged" },
    { "id": "S10-AC5", "storyId": "S10", "scenario": "The CLI is the only surface this round", "given": "The parity ruling", "when": "It is read", "then": "It states the CLI shows suggestions, why the MCP projection and static badge map do not, and the revisit condition" }
  ],
  "dependencies": [
    { "from": "S3", "to": "S4", "type": "blocking", "note": "The 2x24 segment recipe is ratified before it is implemented" },
    { "from": "S1", "to": "S4", "type": "blocking", "note": "The sidecar's failure modes must already be named as states" },
    { "from": "S1", "to": "S5", "type": "blocking", "note": "Candidate shape and the no-exported-number decision" },
    { "from": "S4", "to": "S5", "type": "blocking", "note": "Ranking needs the candidate pool from the index" },
    { "from": "S5", "to": "S6", "type": "blocking", "note": "The harness measures what the ranking produces" },
    { "from": "S5", "to": "S7", "type": "blocking", "note": "Render consumes candidates" },
    { "from": "S2", "to": "S5", "type": "soft", "note": "The gate rules must exist before the package they police; self-tests keep CI green in between" },
    { "from": "S1", "to": "S7", "type": "blocking", "note": "The disclaimer constant and state names" },
    { "from": "S7", "to": "S8", "type": "blocking", "note": "Routing renders through the section" },
    { "from": "S8", "to": "S10", "type": "blocking", "note": "The disabled state is a cell in the routing matrix" },
    { "from": "S1", "to": "S9", "type": "shared", "note": "The closed unavailable-reason vocabulary is what keeps content out of logs" },
    { "from": "S1+S5", "to": "S9", "type": "blocking", "note": "Provenance tests need real candidates to scan for" },
    { "from": "S5", "to": "S4", "type": "reverse-of-blocker", "note": "Not a real edge; S4 must not depend on S5. The segment rule lives in one module owned by S5 and consumed by S4's query construction - resolve ownership explicitly during S3 ratification" },
    { "from": "S6", "to": "S5", "type": "feedback", "note": "The regression floor is the control that keeps the floor constant honest" },
    { "from": "ALL", "to": "@mizan/core fold table", "type": "shared-dependency", "note": "One source of truth for folding (AGENTS.md section 17)" },
    { "from": "S7,S8", "to": "citationLabel in render.ts", "type": "shared-dependency", "note": "One spelling of 'collection number'" },
    { "from": "S6", "to": "@mizan/bench", "type": "shared-dependency", "note": "Extend the existing harness; never a second one" },
    { "from": "S4,S5", "to": "SQLite FTS5 trigram tokenizer", "type": "external", "note": "Verified available in Bun 1.3.14 / SQLite 3.53.0; zero new third-party dependencies" }
  ]
}
```

```json
{"office_fact_memory":[{"fact":"Measured on this repo (2026-10-04): top-K presence of the adjudicated source record over data/eval/redteam-fabricated.json (40 hadith cases) is 33/40 top-1 and 37/40 top-3 using an FTS5 trigram index with an OR of 2 evenly-spaced 24-char segments (19ms/case, pool 16). The existing unicode61 lexical retrieval as pre-filter scores only 15/40 top-3, and a single-phrase trigram pre-filter scores 16/40 with a pool of 9. Reuse of the BM25 path is therefore not viable for this feature.","phase":"pm","evidence":"Read-only Bun probes over data/corpus.db (27,234 records) and the committed fabrication set","confidence":0.92},{"fact":"G-7.2 and G-7.4 constrain the CLI render module by token, not by import: apps/cli/src/render.ts is in DISPLAY_PATH, so it may not contain similarity tokens (jaccard, trigram, similarity, threshold) in code and may not use score/percent/confidence as property keys. ADR-004's proposed `score: { kind:\"jaccard\"; value:number }` would therefore fail CI if declared or re-keyed in any display module - the ranking value must not cross the module boundary at all.","phase":"pm","evidence":"packages/mizan-gate/src/gates/g7-verdict-path-purity.ts DISPLAY_PATH + PERCENT_KEY_RULE; findMatchingLines runs in 'code' mode which blanks string bodies","confidence":0.93},{"fact":"Adding a derived trigram index does not break attestation: computeSnapshotHash digests the records, not the file, and attestSnapshot compares only snapshotHash and recordCount. A sidecar index file is therefore the cheap path, whereas a table inside the committed 83MB corpus.db would force a network re-ingest.","phase":"pm","evidence":"packages/mizan-corpus/src/snapshot.ts:160 and packages/mizan-corpus/src/attest.ts:98","confidence":0.9},{"fact":"The corpus contains 112 duplicate folded-text groups covering 307 rows, the largest being 31 identical records (quran:4914, 4917, 4919...). Any top-5 nearest-quote list must deduplicate by folded text or it can print one verse five times. No competitor in the IslamicEval 2025 research addresses this.","phase":"pm","evidence":"Read-only count over data/corpus.db records.textMatch; research wiki research-nearest-quote-suggestions-2026-10-03","confidence":0.9}]}
```

## Specification
# 1. Executive Summary

The customer faces material consequences if the platform is not accurate and functionally excellent. Their primary ask is to **review quoted Qur'an and hadith**, identify when a quote is invalid, and, in those cases, suggest **the correct one plus the top 3–5 nearest right quotes**. 

This is best understood as **IslamicEval Subtask 1C** (nearest-correct-quote correction). While detection/validation is strong in the industry (86–90%), whole-field correction accuracy is only ~66–68% against a ~67.5% do-nothing baseline. The expected impact is therefore **not** to "guarantee the correct quote," but to deliver a **deterministic, non-authoritative suggestion capability** that preserves mizan's hard-earned claim of falsifiability. 

By strictly separating suggestions from verification, reusing the existing display-only diagnostics, and adopting a deterministic char-3-gram + Jaccard approach (no embeddings/cross-encoders), the platform can become **industry-leading in auditability** while meeting the customer need with honest degradation. Expected business impact: increased customer trust, reduced risk of false verification, and a clear competitive differentiator (auditable determinism) in an otherwise LLM-heavy space.

---

# 2. Business Value Analysis & MoSCoW Classification

**Primary business driver:** **Risk mitigation & compliance/trust** (retention + credibility). The customer's consequences mean correctness claims must remain falsifiable. A false "verified" badge is materially worse than no suggestion.

## MoSCoW Classification

**Must Have:**
- [ ] **Strict separation of concerns:** Suggestions must be **non-authoritative** and must never influence the verdict path (`VERIFIED`/`REJECTED`/`UNVERIFIABLE`).
- [ ] **Preserve MatchStrength contract:** Do not extend `MatchStrength` to include fuzzy/percentage as a verdict input. Keep `{kind:"exact",percent:100} | {kind:"none"}` only.
- [ ] **Explicit labeling & honest degradation:** Every suggestion surface must be clearly labeled "suggestions (non-authoritative)". Define and surface states: `no candidates found`, `suggestions unavailable`, and never conflate with verdict reasons.
- [ ] **Deterministic suggestion path:** Byte-identical top-K across repeated runs (no clock/randomness in suggestion scoring; pinned rules). No LLM in the suggestion/correction path.
- [ ] **Gate compliance by design:** Any change must remain compatible with G-1 (no similarity influencing verdict) and G-7 (verdict-path purity). No new imports into `verify.ts` from diagnostics or suggestion code.
- [ ] **Fail-closed & non-leakage:** Attestation, trace hashes (never content), and ledger behavior unchanged. Suggestions must not be written into verdict, evidence, or run attestation in a way that affects authoritative state.

**Should Have:**
- [ ] **Deterministic nearest-candidate generation:** Char-3-gram pre-filter → exact-substring short-circuit → deterministic Jaccard-on-trigrams, return top 3–5 candidates with transparent tie-break (e.g. reuse `longestRunFor` logic).
- [ ] **Render integration:** Extend CLI render to show "Nearest suggestions (non-authoritative)" section with candidate rank, corpus reference, `textDisplay`, and a brief "why" (longest shared run/overlap) without modifying verdict badge.
- [ ] **Reuse existing diagnostics:** Leverage `packages/mizan-verify/src/diagnostics/longest-run.ts` for closeness display only (never imported by `verify.ts`).
- [ ] **Corpus-scoped search:** Suggestions limited to the attested local corpus (same snapshot). No network calls in suggestion generation.

**Could Have:**
- [ ] **Lightweight eval harness:** Add a small, deterministic harness against `data/eval/` to track suggestion coverage and top-K presence (for internal quality tracking), explicitly not marketing a correction accuracy guarantee.
- [ ] **Relevance tie-breaks:** Deterministic secondary keys (record length, citation order, or longest contiguous run) to stabilize top-K ordering.
- [ ] **CLI flag to disable suggestions:** Opt-out for constrained environments (observability/UX control) while preserving default behavior.

**Won't Have (this time):**
- [ ] **Embeddings/vector DB, cross-encoder, or LLM reranker** (conflicts with determinism, hermeticity, G-1/G-7, and auditability).
- [ ] **Fuzzy percentage as verdict input** or any path to make similarity produce `VERIFIED`.
- [ ] **Ruling language:** Do not present suggestions as "the correct one" or as our religious ruling (§15). Keep phrasing strictly suggestive and non-authoritative.
- [ ] **Global scope expansion beyond attested snapshot:** No external web search or runtime corpus mutation affecting suggestions.
- [ ] **Silent downgrades:** Never hide `no candidates found` or replace it with a fabricated answer.

---

# 3. Risk Register

| Risk | Category | Severity (1–5) | Likelihood (1–5) | Impact | Mitigation Plan |
|---|---|---|---|---|---|
| **Architectural boundary violation**: similarity leaks into verdict path (extends MatchStrength or imports into `verify.ts`) | Technical/Security | 5 | 4 | High — breaks falsifiability claim (CWE-345 control), likely fails G-1/G-7 | Enforce strict package boundaries: suggestion code in a new `@mizan/suggest` (or `apps/cli` render-only) with **no** dependency direction to `verify`. Add import-lint guard (leverage G-1 self-test with planted violation). Never import diagnostics from `verify.ts`; only display-side reads. |
| **Expectation-setting (commercial)**: customer expects "find the correct quote" but industry correction baseline ~67.5% | Business | 5 | 5 | High — credibility/reputation risk (IslamicEval Subtask 1C reality) | Position clearly: authoritative verdict on quoted text (strength) + **deterministic, non-authoritative** candidates with explicit `no candidates found`. Document baseline in spec/wiki. Add explicit UX disclaimers and avoid guarantee language in outputs. |
| **Gate/CI regression**: G-1/G-7 or G-4 (gitleaks) fail due to new imports/deps | Technical/Reliability | 5 | 3 | High — blocks delivery | Design to be gate-compliant from day 1. Run `bun run ci` per affected package and full gates early. New package must not add similarity imports that influence verdict. No new third-party deps (prefer dependency-free trigrams). |
| **Determinism regression**: non-deterministic ranking slips in (clock, locale, hash order, model) | Reliability | 5 | 2 | High — breaks "byte-identical" guarantee | No clock/randomness in core. Use stable sort keys (deterministic secondary tie-breaks). Pin rules. Add a determinism smoke test (same inputs → identical top-K order/content). Keep suggestion computation pure (no I/O). |
| **Scope creep to fuzzy verification**: pressure to raise thresholds to "look better" | Business/Technical | 5 | 3 | Critical — creates second path to `verified` | Treat fuzzy as **unusable for verification** (constitution §9–10). ADR must state this explicitly. Reject any proposal to extend `MatchStrength`. Require review of G-1/G-7 diffs. |
| **Data sensitivity / leakage**: logging suggestion content or question/corpus in traces | Security | 4 | 2 | Medium | Continue §13 rule: logs/traces carry **hashes only** (no question/corpus content). Suggestions are render-time only; do not persist suggestion text in ledger/runs entries as content. |
| **Performance/regression**: 3-gram index adds build-time cost or memory | Technical/Reliability | 3 | 2 | Low | 3-gram is build-time CPU only, zero new runtime deps. Keep candidate set bounded (top 3–5). Reuse existing FTS5/lexical structures where possible. No embedding inference at query time. |
| **Eval misinterpretation**: internal eval numbers used as public guarantee | Business | 4 | 3 | Medium | Keep eval harness internal/diagnostic only. Label metrics as "coverage/top-K presence" vs baseline, not "correction accuracy guarantee". Document limitations explicitly. |
| **Hermeticity/deps**: adding embedding/vector deps breaks verifier purity constraint | Technical/Security | 5 | 2 | High | **Won't Have** embeddings/vector DB/cross-encoder. Use char-3-gram + Jaccard (dependency-free). If SQLite trigram tokenizer availability differs across platforms (Bun SQLite), prefer implementation without new native deps or feature-gate safely. |

---

# 4. Epics with Success Metrics

## Epic 1: Architectural Boundary & Non-Authoritative Suggestions (Must)
**What:** Establish a clean separation so suggestions never influence verdicts. Define contracts, labeling, and degradation states.  
**Why:** Preserves falsifiability (G-1/G-7) while meeting customer need.  
**Success Metrics:**
- **Boundary purity:** 0 imports from suggestion code into `verify.ts`. G-1 and G-7 pass with no new violations.  
- **Contract stability:** `MatchStrength` unchanged. No new fuzzy variant added.  
- **UX clarity:** 100% of suggestion UI labeled "non-authoritative". Verdict badge unchanged in all paths.  
- **Fail-closed coverage:** All suggestion failures map to explicit states (`no candidates found` / `suggestions unavailable`) with no silent fallback to verdict.

## Epic 2: Deterministic Candidate Generation (Should)
**What:** Implement dependency-free nearest-candidate generation (char-3-gram pre-filter → exact short-circuit → deterministic Jaccard-on-trigrams) returning top 3–5.  
**Why:** Industry-aligned (HUMAIN/BurhanAI) while meeting determinism and auditability constraints.  
**Success Metrics:**
- **Determinism:** Same input → byte-identical top-K list (order + candidates) across ≥3 runs.  
- **Deterministic tie-breaking:** Stable ordering defined and test-covered.  
- **Scope:** Candidates sourced only from attested snapshot. Zero network/model calls.  
- **Performance:** Suggestion generation ≤ retrieval overhead in typical queries (bounded candidate set).  
- **Coverage behavior:** Returns `no candidates found` (not empty misleading list) when below meaningful threshold or no overlap.

## Epic 3: Render & UX Integration (Should)
**What:** Add a strictly display-only "Nearest suggestions (non-authoritative)" section in CLI render, reusing `longestRunFor` for "how close" without affecting verdict computation.  
**Why:** Delivers customer value with clear separation.  
**Success Metrics:**
- **Separation verified:** Render changes do not call into `verify.ts` logic paths that affect `verdict`.  
- **Clarity:** Every rendered candidate shows corpus ref, `textDisplay`, rank, and non-authoritative label.  
- **Honest states:** Correct state rendered for `no sources found`, `unverifiable`, `rejected`, and suggestion-empty cases.  
- **No verdict leakage:** Suggestion content never appears in verdict reason fields.

## Epic 4: Evaluation & Baseline Tracking (Could)
**What:** Add a deterministic internal harness against `data/eval/` to report coverage (top-1/top-3/top-5 presence) when quote is invalid, with explicit documentation that this is **not** a guarantee.  
**Why:** Enables data-driven assessment without over-claiming (critical given baseline ~67.5%).  
**Success Metrics:**
- **Reproducible:** Harness runs deterministically per package.  
- **Transparent reporting:** Outputs include baseline note and explicitly state "non-authoritative, diagnostic only".  
- **No public guarantee:** No marketing text generated by harness; internal-only metrics.  
- **Coverage baseline established:** Top-K presence measured on eval set and recorded (diagnostic trend).

---

# 5. Architecture Decision Records (ADRs)

## ADR-001: Suggestions are Non-Authoritative and Must Not Influence Verdicts
- **Status:** Proposed  
- **Context:** Customer requires nearest quotes when invalid. Constitution forbids fuzzy as verification path (G-1/G-7, §9–10). Industry correction accuracy is low vs baseline.  
- **Decision:** Create a **separate concern** (suggestions) that is display-only. Do not extend `MatchStrength`. `verify.ts` must remain the sole path to `verified`. No suggestion code imported by verifier.  
- **Rationale:** Preserves falsifiability (CWE-345). Matches industry best practice of "strict for confirmation, similarity for ranking suggestions only." Avoids transferring false authority (§15).  
- **Consequences:** Slightly more code surface (separate module) but stronger auditability and gate compliance. Prevents scope creep to fuzzy verification. Requires explicit UX labeling.

## ADR-002: Deterministic Suggestion Algorithm (No ML Reranker)
- **Status:** Proposed  
- **Context:** Market leaders use hybrid but often include LLM/cross-encoder rerankers (nondeterministic, model deps). mizan requires byte-identical verdicts/traces and hermetic builds.  
- **Decision:** Use **char-3-gram pre-filter → exact-substring short-circuit → deterministic Jaccard-on-trigrams**, return top 3–5 with deterministic tie-break. No embeddings/vector DB/cross-encoder/LLM.  
- **Rationale:** Matches HUMAIN/BurhanAI deterministic pre-filter pattern, dependency-free, platform-stable, and compliant with G-1/G-7 and §6 (determinism). Preserves audit trail.  
- **Consequences:** Avoids model deps and nondeterminism. Sacrifices potential small nDCG gains from cross-encoder in exchange for determinism, auditability, and gate compliance. Evaluation remains diagnostic only.

## ADR-003: Suggestion Module Boundary & Location
- **Status:** Proposed  
- **Context:** Need clear boundary to prevent leakage. Options: new package `@mizan/suggest`, or CLI-only (`apps/cli/src/suggest/*`) rendered display-only.  
- **Decision:** Prefer **display/CLI boundary or a new `@mizan/suggest` package with no upward import into `@mizan/verify`**. The suggestion module must not import from `verify` internals in a way that couples to verdict computation. Diagnostics (`longest-run.ts`) remain in verify diagnostics and are consumed read-only by display/suggest (never the reverse).  
- **Rationale:** Enforces one-way dependency (non-authoritative depends on corpus/retrieval/diagnostics shape, never the other way). Easier for G-1 to assert. Aligns with "flat top-level exports + self-reexport" and Result boundaries.  
- **Consequences:** Clearer gate enforcement. Slight package boundary overhead; easier to test in isolation.

## ADR-004: Candidate Scoring Model & Output Shape
- **Status:** Proposed  
- **Context:** Must not create a third `MatchStrength` shape. Need transparent "closeness" for UX without authoritativeness.  
- **Decision:** Suggestions are a separate type: `{ rank: 1|2|3|4|5, recordRef, textDisplay, score: { kind:"jaccard"; value:number } | { kind:"exact" }, longestRun?: number }` (non-authoritative). Never exported into `Verdict` or `EvidenceRef` as a match strength that can flip verdict.  
- **Rationale:** Preserves core schema contract. Keeps display data separate from authoritative evidence. Supports honest rendering ("why").  
- **Consequences:** Schema additions isolated to suggest/render types (not `@mizan/core/verdict`). No impact on verification purity.

---

# 6. Prioritized Sprint Backlog

| Priority (P0–P3) | Item | Type | Complexity (S/M/L/XL) | Risk (L/M/H/C) | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|---|
| **P0** | **Define suggestion contract & boundaries** (labels, states: `no candidates found`/`suggestions unavailable`, non-authoritative) | Epic 1 | S | H | — | Spec written; boundary documented; UX copy defined; no change to `MatchStrength`. |
| **P0** | **Verify gate compliance plan (G-1/G-7)**: confirm no imports into `verify.ts`, add planted-violation awareness | Epic 1 | S | H | P0 above | G-1/G-7 behavior understood; import direction documented; no verdict-path coupling. |
| **P0** | **ADR ratification** (ADR-001–004) recorded in wiki/spec with rationale | Epics/ADRs | S | H | P0s | ADRs written; status Proposed/Accepted per process; linked from spec. |
| **P1** | **Design deterministic candidate generation** (char-3-gram pre-filter, exact short-circuit, Jaccard-on-trigrams, deterministic tie-break) — **WHAT only** | Epic 2 | M | M | P0 | Algorithm rules defined (no deps). Determinism requirement specified. Returns top 3–5 and empty→`no candidates found`. |
| **P1** | **Render UX design** (non-authoritative section, reuse `longestRunFor` display-only, no verdict changes) | Epic 3 | S | M | P0 | Render spec covers states (invalid quote, no sources, unverifiable). Verdict badge unchanged. |
| **P1** | **Define evaluation scope & guardrails** (diagnostic-only, no guarantee language) | Epic 4 | S | M | P0 | Harness scope limited; metrics labeled diagnostic; baseline ~67.5% acknowledged. |
| **P2** | **Stabilize tie-break rules** (deterministic secondary keys) | Epic 2 | S | L | P1 | Tie-break order specified; prevents order flapping. |
| **P2** | **CLI opt-out flag spec** (disable suggestions, default on) | Epic 3 | S | L | P1 | Flag semantics defined; preserves fail-closed behavior. |
| **P3** | **Internal eval harness spec** (deterministic, per-package, against `data/eval/`) — diagnostic only | Epic 4 | M | L | P1 | Inputs/outputs defined; reproducibility requirement; no public guarantee path. |

---

## Wiki Integration (as per CEO instructions)
- **Title format:** `spec-nearest-quote-suggestions-2026-10-03`
- **Tags:** `spec`, `nearest-quotes`, `rag`, `deterministic`, `verification-boundary`, `priority-must`
- **Include:** Executive summary, MoSCoW, Risk Register, Epics (with success metrics), ADR-001–004, Sprint Backlog, Security Requirements (OWASP), Reliability Requirements, Observability Requirements.

### Security Requirements (OWASP-aligned)
- **Injection (A03):** Corpus text rendered as text only; no raw HTML sinks. Suggestions are data-only, display-only.
- **Access Control (A01):** No change to auth model; suggestions read-only from attested snapshot.
- **Data Exposure (A02):** §13 enforced (hashes only in logs/traces). No PII/question/corpus content persisted.
- **SSRF (A10):** No network calls in suggestion path; corpus local and attested.
- **Integrity (A08):** Attestation unchanged; suggestion never affects verdict/ledger integrity. Boundary enforced by G-1/G-7.
- **Data sensitivity:** Low content sensitivity but high integrity sensitivity. Suggestions marked non-authoritative.

### Reliability Requirements
- **Error handling:** Map every failure to `no candidates found` or `suggestions unavailable`. Never throw across boundaries (Result). Fail-closed.
- **Timeouts:** No new network timeouts introduced; suggestion is CPU-only (sub-ms expected). Must not extend existing verification timeouts.
- **Retry behavior:** None (deterministic pure computation). No retry storms.
- **Degradation:** Explicit states per §16. No silent downgrade presented as full fidelity.

### Observability Requirements
- **Metrics:** Suggestion state counts (requested/returned_candidates/empty/unavailable) — labeled non-authoritative, no content.  
- **Logs:** Event names + hashes only (questionHash, snapshotId). No suggestion text/corpus.  
- **Traces:** Span for suggestion computation (timing only). Must not attach suggestion content. Distinguish `verified_path` vs `suggestions_path` spans.  
- **Provenance:** No change to run chain/attestation; suggestions excluded from authoritative ledger fields.

```json
{
  "executiveSummary": "The customer requires review of quoted Qur'an and hadith, detection of invalid quotes, and top 3–5 nearest correct quotes when invalid. This is IslamicEval Subtask 1C (correction baseline ~67.5%). The strategic approach is to deliver deterministic, non-authoritative suggestions strictly separated from verification (preserving G-1/G-7 and MatchStrength exact|none), using char-3-gram + Jaccard (no embeddings/cross-encoder), with explicit honest-degradation states and no guarantee language. Expected impact: meet customer need while strengthening auditability and avoiding the commercial/architectural risk of opening a fuzzy path to VERIFIED.",
  "moscow": {
    "must": [
      "Strict separation: suggestions non-authoritative and never influence verdict path",
      "Preserve MatchStrength contract (exact|none only)",
      "Explicit labeling and honest degradation states (no candidates found / suggestions unavailable)",
      "Deterministic suggestion path (byte-identical top-K, no clock/randomness, no LLM)",
      "Gate compliance (G-1/G-7): no suggestion imports into verify.ts; verdict-path purity",
      "Fail-closed and non-leakage (hashes only in traces; no content in ledger)"
    ],
    "should": [
      "Deterministic nearest generation (char-3-gram pre-filter → exact short-circuit → Jaccard-on-trigrams, top 3–5)",
      "Render integration with non-authoritative section; reuse longestRunFor display-only",
      "Reuse diagnostics without importing into verify.ts",
      "Suggestions limited to attested local corpus"
    ],
    "could": [
      "Deterministic internal eval harness against data/eval (diagnostic-only)",
      "Deterministic tie-breaks for stable top-K",
      "CLI opt-out flag (default on)"
    ],
    "wont": [
      "Embeddings/vector DB/cross-encoder/LLM reranker",
      "Fuzzy percentage as verdict input or path to VERIFIED",
      "Ruling language (e.g. 'the correct one') as our ruling",
      "External web search or runtime corpus mutation",
      "Silent downgrades of empty/unavailable states"
    ]
  },
  "riskRegister": [
    {
      "risk": "Architectural boundary violation: similarity leaks into verdict path",
      "category": "Technical/Security",
      "severity": 5,
      "likelihood": 4,
      "impact": "Breaks falsifiability (CWE-345), likely fails G-1/G-7",
      "mitigation": "Enforce package boundary (separate suggest module), no imports into verify.ts, leverage G-1 self-test with planted violation"
    },
    {
      "risk": "Expectation-setting: baseline correction ~67.5% vs 'find correct quote'",
      "category": "Business",
      "severity": 5,
      "likelihood": 5,
      "impact": "Credibility/reputation risk",
      "mitigation": "Position as authoritative verdict + deterministic non-authoritative candidates; explicit disclaimers; no guarantee language"
    },
    {
      "risk": "Gate/CI regression (G-1/G-7/G-4)",
      "category": "Technical/Reliability",
      "severity": 5,
      "likelihood": 3,
      "impact": "Blocks delivery",
      "mitigation": "Gate-compliant design; run bun run ci early per package; no new third-party deps"
    },
    {
      "risk": "Determinism regression",
      "category": "Reliability",
      "severity": 5,
      "likelihood": 2,
      "impact": "Breaks byte-identical guarantee",
      "mitigation": "No clock/randomness; stable sort keys; determinism smoke test; pure computation"
    },
    {
      "risk": "Scope creep to fuzzy verification",
      "category": "Business/Technical",
      "severity": 5,
      "likelihood": 3,
      "impact": "Critical — creates second path to VERIFIED",
      "mitigation": "ADR-001 states non-influence; reject MatchStrength extension; require G-1/G-7 review"
    },
    {
      "risk": "Data leakage in traces/logs",
      "category": "Security",
      "severity": 4,
      "likelihood": 2,
      "impact": "Medium exposure risk",
      "mitigation": "§13: hashes only; render-time only; exclude suggestion content from ledger/runs"
    },
    {
      "risk": "Performance/regression from trigrams",
      "category": "Technical/Reliability",
      "severity": 3,
      "likelihood": 2,
      "impact": "Low",
      "mitigation": "Build-time only, bounded top 3–5, zero new runtime deps"
    },
    {
      "risk": "Eval misinterpreted as public guarantee",
      "category": "Business",
      "severity": 4,
      "likelihood": 3,
      "impact": "Medium",
      "mitigation": "Internal/diagnostic only; label as coverage/top-K presence; baseline documented"
    },
    {
      "risk": "Hermeticity/deps (embeddings/vector)",
      "category": "Technical/Security",
      "severity": 5,
      "likelihood": 2,
      "impact": "High — breaks purity",
      "mitigation": "Dependency-free char-3-gram+Jaccard; Won't Have embeddings/vector DB/cross-encoder"
    }
  ],
  "epics": [
    {
      "name": "Epic 1: Architectural Boundary & Non-Authoritative Suggestions",
      "what": "Establish separation so suggestions never influence verdicts; define contracts, labeling, degradation states",
      "why": "Preserves falsifiability (G-1/G-7)",
      "successMetrics": [
        "0 imports from suggestion code into verify.ts; G-1/G-7 pass",
        "MatchStrength unchanged (no fuzzy variant)",
        "100% of suggestion UI labeled 'non-authoritative'; verdict unchanged",
        "All failures map to explicit states with no silent fallback"
      ]
    },
    {
      "name": "Epic 2: Deterministic Candidate Generation",
      "what": "Char-3-gram pre-filter → exact short-circuit → deterministic Jaccard-on-trigrams, top 3–5",
      "why": "Industry-aligned with determinism/auditability",
      "successMetrics": [
        "Same input → byte-identical top-K across ≥3 runs",
        "Deterministic tie-breaking test-covered",
        "Candidates from attested snapshot only; zero network/model calls",
        "Returns no candidates found when below threshold/no overlap"
      ]
    },
    {
      "name": "Epic 3: Render & UX Integration",
      "what": "Display-only 'Nearest suggestions (non-authoritative)' section using longestRunFor display-only",
      "why": "Delivers customer value with clear separation",
      "successMetrics": [
        "No effect on verdict computation from render changes",
        "Each candidate shows ref, textDisplay, rank, non-authoritative label",
        "Honest states rendered across cases; no verdict leakage"
      ]
    },
    {
      "name": "Epic 4: Evaluation & Baseline Tracking",
      "what": "Deterministic internal harness against data/eval (diagnostic-only, no guarantee)",
      "why": "Data-driven assessment without over-claiming",
      "successMetrics": [
        "Deterministic per package",
        "Outputs state diagnostic-only with baseline note",
        "No public guarantee path",
        "Top-K presence baseline recorded"
      ]
    }
  ],
  "sprintBacklog": [
    {
      "priority": "P0",
      "item": "Define suggestion contract & boundaries (labels, states, non-authoritative)",
      "type": "Epic 1",
      "complexity": "S",
      "risk": "H",
      "dependencies": [],
      "acceptanceCriteria": "Spec complete; boundary documented; UX copy defined; MatchStrength unchanged"
    },
    {
      "priority": "P0",
      "item": "Verify gate compliance plan (G-1/G-7): no imports into verify.ts, planted-violation awareness",
      "type": "Epic 1",
      "complexity": "S",
      "risk": "H",
      "dependencies": ["P0 contract"],
      "acceptanceCriteria": "Import direction documented; verdict-path purity confirmed"
    },
    {
      "priority": "P0",
      "item": "ADR ratification (ADR-001–004) in wiki/spec",
      "type": "ADRs",
      "complexity": "S",
      "risk": "H",
      "dependencies": ["P0s"],
      "acceptanceCriteria": "ADRs recorded with rationale; linked from spec"
    },
    {
      "priority": "P1",
      "item": "Design deterministic candidate generation rules (WHAT only)",
      "type": "Epic 2",
      "complexity": "M",
      "risk": "M",
      "dependencies": ["P0"],
      "acceptanceCriteria": "Rules defined, no deps, top 3–5, empty→no candidates found, determinism specified"
    },
    {
      "priority": "P1",
      "item": "Render UX design (non-authoritative section, display-only, no verdict changes)",
      "type": "Epic 3",
      "complexity": "S",
      "risk": "M",
      "dependencies": ["P0"],
      "acceptanceCriteria": "States covered; verdict badge unchanged"
    },
    {
      "priority": "P1",
      "item": "Define evaluation scope & guardrails (diagnostic-only)",
      "type": "Epic 4",
      "complexity": "S",
      "risk": "M",
      "dependencies": ["P0"],
      "acceptanceCriteria": "Diagnostic-only; baseline ~67.5% acknowledged; no guarantee language"
    },
    {
      "priority": "P2",
      "item": "Stabilize deterministic tie-break rules",
      "type": "Epic 2",
      "complexity": "S",
      "risk": "L",
      "dependencies": ["P1 generation"],
      "acceptanceCriteria": "Tie-break order specified; prevents flapping"
    },
    {
      "priority": "P2",
      "item": "CLI opt-out flag spec (default on)",
      "type": "Epic 3",
      "complexity": "S",
      "risk": "L",
      "dependencies": ["P1 render"],
      "acceptanceCriteria": "Flag semantics defined; fail-closed preserved"
    },
    {
      "priority": "P3",
      "item": "Internal eval harness spec (deterministic, per-package, diagnostic-only)",
      "type": "Epic 4",
      "complexity": "M",
      "risk": "L",
      "dependencies": ["P1 eval scope"],
      "acceptanceCriteria": "I/O defined; reproducibility; no public guarantee path"
    }
  ],
  "adrs": [
    {
      "id": "ADR-001",
      "title": "Suggestions are Non-Authoritative and Must Not Influence Verdicts",
      "status": "Proposed",
      "context": "Customer needs nearest quotes when invalid; G-1/G-7 and §9–10 forbid fuzzy as verification path; correction baseline low",
      "decision": "Separate display-only suggestions; no MatchStrength extension; verify.ts sole path to verified",
      "rationale": "Preserves falsifiability (CWE-345), matches industry split (confirmation strict, suggestions ranked), aligns with §15",
      "consequences": "Clearer auditability and gates; stronger boundary; requires explicit labeling"
    },
    {
      "id": "ADR-002",
      "title": "Deterministic Suggestion Algorithm (No ML Reranker)",
      "status": "Proposed",
      "context": "Need byte-identical results and hermetic builds; market often uses nondeterministic rerankers",
      "decision": "Char-3-gram pre-filter → exact short-circuit → deterministic Jaccard-on-trigrams, top 3–5, deterministic tie-break; no embeddings/vector DB/cross-encoder/LLM",
      "rationale": "Matches HUMAIN/BurhanAI pre-filter pattern, dependency-free, G-1/G-7 compliant, auditable",
      "consequences": "Trade small nDCG for determinism/auditability/gate compliance; evaluation diagnostic-only"
    },
    {
      "id": "ADR-003",
      "title": "Suggestion Module Boundary & Location",
      "status": "Proposed",
      "context": "Prevent leakage between suggest and verify",
      "decision": "Display/CLI boundary or @mizan/suggest with no upward import into @mizan/verify; diagnostics consumed read-only (never reverse)",
      "rationale": "One-way dependency, easier G-1 assertion, aligns with module conventions",
      "consequences": "Clear gate enforcement; isolated testing"
    },
    {
      "id": "ADR-004",
      "title": "Candidate Scoring Model & Output Shape",
      "status": "Proposed",
      "context": "Must not create third MatchStrength shape",
      "decision": "Separate non-authoritative shape (rank, recordRef, textDisplay, score kind jaccard/exact, optional longestRun). Never exported into Verdict/EvidenceRef",
      "rationale": "Preserves core schema; separates authoritative evidence from display data",
      "consequences": "Schema additions isolated to suggest/render; no impact on verification purity"
    }
  ]
}
```

## Architecture
# Architecture Plan — Nearest-Quote Suggestions (display-only, deterministic)

**Wiki:** `arch-nearest-quote-suggestions-2026-10-04` · **Spec:** `spec-nearest-quote-suggestions-2026-10-03` · **Research:** `research-nearest-quote-suggestions-2026-10-03` · **Related:** ADR-03, ADR-06, AGENTS.md §1 §3 §9 §10 §16 §17

---

## 1. Executive Summary

Deterministic nearest-quote suggestions land as a **display-only surface on the far side of gate G-7**, implemented as a new leaf package `@mizan/suggest` whose only dependency is `@mizan/core`. Candidates come from **one ordered streaming scan of the attested snapshot** (`SELECT id, textMatch … ORDER BY id`), not from the FTS5 ranker, because `search()` caps at `MAX_LIMIT = 32` and BM25 token overlap degrades exactly when suggestions matter most — a fabrication shares few tokens with the record that holds the truth. Ranking is char-3-gram set overlap (Jaccard) with an exact-containment short-circuit and a total, code-unit tie-break. Three decisions carry the risk: **(a)** the exported contract deliberately carries **no number a reader could divide** — a required deviation from the spec's `{kind:"jaccard",value}` shape, because AGENTS.md §10, `schema/display.ts`, and gate G-7.4 all forbid it and closeness is instead explained by the display-only `longestRunFor` diagnostic the renderer already calls; **(b)** two **new G-7 sub-rules** rather than a G-8, because `GateId`/`GATE_IDS`/`docs-gates.ts` machine-check the published count of seven; **(c)** a **measured latency spike before the scan is committed**, because the whole design is one pass over 27,234 rows. No corpus schema change, no snapshot rebuild, no attestation churn, no new dependency.

---

## 2. Codebase Impact

### Create

| Path | Why |
|---|---|
| `packages/mizan-suggest/package.json` | New leaf package. `dependencies: { "@mizan/core": "workspace:*" }` only. |
| `packages/mizan-suggest/tsconfig.json` | Mirrors an existing package tsconfig. |
| `packages/mizan-suggest/src/trigrams.ts` | char-3-gram set extraction over already-folded text. |
| `packages/mizan-suggest/src/rank.ts` | Total ordering: containment → shared desc → record trigrams asc → `recordId` asc. |
| `packages/mizan-suggest/src/suggest.ts` | `rankNeighbours`, top-K, short-circuit decision, `MIN_SHARED`, `DEFAULT_TOP_K`, `MAX_TOP_K`. |
| `packages/mizan-suggest/src/index.ts` | Flat named exports + namespace self-reexports (§7). |
| `packages/mizan-suggest/test/{trigrams,rank,suggest,determinism}.test.ts` | See §9. |
| `packages/mizan-corpus/src/rows.ts` | **Extracted** `RECORD_SELECT` / `RawRow` / `toRecord` / `rowsToRecords` out of `resolve.ts` — one row decoder, §17. |
| `packages/mizan-corpus/src/candidates.ts` | Streaming scan + winner fetch. I/O lives where I/O lives. |
| `packages/mizan-corpus/test/candidates.test.ts` | Scan order, exclusion, winner fetch. |
| `apps/cli/src/suggestions.ts` | Composition + rendering. **Added to G-7 `DISPLAY_PATH`.** |
| `apps/cli/test/suggestions.test.ts` | Four rendered states, golden output. |
| `docs/specs/adr/ADR-07.md` … `ADR-10.md` | Four decisions, numbered to the free IDs (§6). |
| `scripts/eval/suggest-coverage.ts` | Diagnostic coverage + latency harness over `data/eval/*.json`. |
| `scripts/eval/suggest-coverage.test.ts` | Harness self-test, like the existing `scripts/*.test.ts`. |

### Modify

| Path | Change |
|---|---|
| `packages/mizan-core/src/schema/display.ts` | Add `SuggestionState`, `NearbyRecord`, `Suggestion`. **No numeric field.** |
| `packages/mizan-core/src/index.ts` | Export the three new contracts beside `Correction` / `Relevance`. |
| `packages/mizan-corpus/src/resolve.ts` | Delete the local row decoder; import from `./rows.ts`. |
| `packages/mizan-corpus/src/index.ts` | Export the candidate scan. |
| `apps/cli/src/render.ts` | `renderReport` takes `suggestions?`; `renderClaim` appends the section. |
| `apps/cli/src/main.ts` | Compose after `verifyAnswer`; `--no-suggestions`. |
| `apps/cli/src/demo.ts` | Parity: the demo is the judged path and must show the feature. |
| `apps/cli/package.json` | Add `@mizan/suggest`. |
| `packages/mizan-gate/src/gates/g7-verdict-path-purity.ts` | `DISPLAY_PATH` entry + G-7.8 + G-7.9. |
| `packages/mizan-gate/src/gates/g1-no-similarity.ts` | Extract `checkImportAllowlist(files, prefix, allowed)`; G-1.1 and G-7.8 both call it. |
| `packages/mizan-gate/test/gates.test.ts` | Planted violations for G-7.8, G-7.9, new `DISPLAY_PATH` entry. |
| `package.json` | `@mizan/suggest` in root `dependencies` (for the eval script); `eval:suggestions` script. |
| `docs/degradation-matrix.md` | A **separate** display-only degradations section — do not renumber the 7 authoritative modes (DISCLOSURE states them). |
| `README.md` | New package in the layout list; the flag in usage. |

### Deliberately untouched

`packages/mizan-verify/**` (all of it), `packages/mizan-core/src/schema/verdict.ts` (`MatchStrength`, `DegradeReason`, `VerdictReport`), `packages/mizan-core/src/schema/trace.ts`, `packages/mizan-retrieval/**`, `packages/mizan-corpus/src/snapshot.ts`, `data/corpus.db`, `INTEGRITY.md`, `DISCLOSURE.md`, `attestation.json`, `apps/web/src/page.ts`.

**No corpus schema change.** Adding an FTS5 trigram index would not change `snapshotHash` (that hashes ordered records, not file bytes), but it would require re-running ingest, relies on Bun's bundled SQLite exposing the `trigram` tokenizer, and duplicates work one pure pass already does. Rejected this round; recorded in ADR-10.

---

## 3. Module Design

```
packages/mizan-suggest/            deps: @mizan/core. Pure. No I/O, no clock, no env.
  src/trigrams.ts                  gramsOf(folded): ReadonlySet<string>
  src/rank.ts                      compareNeighbours(a, b): number  (the total order)
  src/suggest.ts                   rankNeighbours(quote, candidates, options): RankedNeighbours
  src/index.ts                     flat exports

packages/mizan-corpus/src/
  rows.ts                          row -> CorpusRecord, decoded (§1). Extracted from resolve.ts.
  candidates.ts                    scanNeighbourKeys(db, opts): Iterable<NeighbourKey>
                                   fetchRecordsById(db, ids): Result<readonly CorpusRecord[], CorpusError>
  resolve.ts                       imports rows.ts; no longer owns a decoder

apps/cli/src/
  suggestions.ts                   suggestionsFor(input): Suggestion   (composition)
                                   renderSuggestions(s): readonly string[]
  render.ts                        renders the section; calls longestRunFor per candidate
  main.ts                          composes; --no-suggestions
```

**Dependency direction:** `apps/cli → {mizan-corpus, mizan-suggest, mizan-verify} → mizan-core`. `@mizan/verify` and `@mizan/suggest` never see each other, in either direction. `discoverPackages(root, ["packages/*", "apps/*"])` picks the new package up with no `scripts/ci.ts` change.

---

## 4. API Design

### 4.1 `@mizan/suggest` (pure, total)

```ts
type NeighbourKey = { readonly recordId: string; readonly textMatch: string }

type RankedNeighbour = {
  readonly recordId: string
  readonly contained: boolean     // folded quote is a substring of this record's textMatch
  readonly shared: number         // shared 3-gram TYPES — a count, never a rate
  readonly grams: number          // this record's 3-gram TYPE count
}

rankNeighbours(
  rawQuote: string,
  candidates: Iterable<NeighbourKey>,
  options: { readonly topK?: number; readonly excludeRecordIds?: readonly string[] },
): RankedNeighbours
```

`RankedNeighbours = { exact: readonly RankedNeighbour[]; ranked: readonly RankedNeighbour[]; scanned: number; skippedLong: number }`.

- **Total, not fallible** — no I/O, so no `Result`. Same convention as `correctionFor` / `assessRelevance`, which are also total and return their union directly (§2 reserves `Result` for business failures).
- No `throw`; bounded input (`MAX_QUOTE_CHARS = 4_096`, `MAX_CANDIDATE_RECORD_CHARS = 65_536` — the same bounds `diagnostics/longest-run.ts` already declares, for the same DoS reason).
- Quote folded with `normalizeForMatch` from `@mizan/core`. Verified: `foldQuote` in `steps/containment.ts` **is** `normalizeForMatch(rawQuote)`, so this package folds byte-identically to the verifier with a core-only dependency.
- `excluded` ids are dropped before scoring.

### 4.2 `@mizan/corpus` (I/O)

```ts
scanNeighbourKeys(db: Database, opts: { readonly excludeRecordIds?: readonly string[] }): Iterable<NeighbourKey>
fetchRecordsById(db: Database, ids: readonly string[]): Result<readonly CorpusRecord[], CorpusError>
```

- `scanNeighbourKeys` streams `SELECT id, textMatch FROM records ORDER BY id` via `.iterate()` — **never `.all()`**, which would materialise ~30 MB of folded text. `ORDER BY id` is the reproducibility guarantee; the caller cannot reorder it.
- `fetchRecordsById` reuses the extracted `rows.ts` decoder and its `CorpusError` (`§1` — a row is still crossing a boundary).
- Empty `id` list returns before a query is built (`IN ()` is a syntax error — the precedent is `toChunks` in `search.ts`).

### 4.3 `apps/cli/src/suggestions.ts` (composition + display)

```ts
type SuggestionInput = {
  readonly verdict: Verdict        // decides offering; mirrors correction.ts exactly
  readonly quote: string
  readonly excludeRecordIds: readonly string[]
}

suggestionsFor(db: Database, input: SuggestionInput): Suggestion
renderSuggestions(suggestion: Suggestion, lookup: (recordId: string) => SourceExcerpt | undefined): readonly string[]
```

- Offered for `rejected` and nothing else. Mirrors `correctionFor`'s stated rule ("a correction is offered for a rejection and for nothing else") so a reader who has learned one surface has learned the other.
- `renderSuggestions` reuses `SourceExcerpt` + `citationLabel` + `displayed()` + `normalizeForTerminal` from `render.ts`, so a candidate line is formatted exactly like a source line (§17).
- **Vocabulary constraint:** this file is in `DISPLAY_PATH`, so G-7.2 forbids `similarity, similar, fuzzy, levenshtein, jaro, jaccard, trigram, ngram, dice, cosine, embed*, vector, tfidf, bm25, sbert, rapidfuzz, fuse, tokenOverlap, scoreThreshold, threshold` in code **and** strings, and G-7.4 forbids `percent|confidence|score|trustScore` as property keys. It also cannot use `fetch(`, `process.env`, `setTimeout`, or `import(`. Hence: `shared` / `grams` / `nearest`, never `overlap score` or `threshold`.

### 4.4 CLI surface

- `--no-suggestions` opt-out. `questionOf` already filters `--`-prefixed argv out of the question text, so the flag is excluded from the question by construction.
- Exit codes unchanged: a suggestion failure is display-only and must never move the exit code.

---

## 5. Data Design

Added to `packages/mizan-core/src/schema/display.ts` (contract; **not** persisted, **not** in the ledger):

```ts
SuggestionState = "candidates" | "no_candidates" | "unavailable"

NearbyRecord = {
  rank: number            // 1-based, stable
  recordId: string
  label: string           // citationLabel(collection, number)
  sourceUrl: string
  attribution: string
  license: string
  grade: string | null    // exactly as stored — never inferred, never upgraded (§15)
  gradeApplicable: boolean
  gradeSource: string
  gradeBasis: GradeBasis
}

Suggestion =
  | { state: "candidates",    considered: number, candidates: readonly NearbyRecord[] }
  | { state: "no_candidates", considered: number, reason: string }
  | { state: "unavailable",   reason: string }
```

Invariants:

- **No field is a rate.** There is nothing in this contract a caller can divide into a strength — the same reason `Relevance` carries `located`/`missing` lists instead of `{matched,total}` (`display.ts` header) and `MatchStrength` has two members (§10).
- `considered` is the number of records actually scanned. A length bound or a floor that excluded records is therefore **visible on screen**, never silent (§16).
- `NearbyRecord` carries no corpus text: the heavy, licence-sensitive `textDisplay`/`textMatch` stay in the CLI's `SourceExcerpt`, which already documents `textMatch` as *measured, never displayed*.
- `grade`/`gradeSource`/`gradeBasis`/`gradeApplicable` are copied verbatim; the renderer prints a grade only when `gradeApplicable` (§15).

**No migration.** `data/corpus.db` (83,427,308 bytes, 27,234 records) is untouched, so `snapshotHash`, `attestation.json`, `DISCLOSURE.md` arithmetic, `recordCount`, and every committed evidence artefact stay valid. That is a design goal, not a side effect.

---

## 6. Error Strategy

| Failure | Surface | Forbidden |
|---|---|---|
| Quote folds to empty | `no_candidates`, `reason: "the quotation folds to nothing, so there is nothing to look near"` | any candidate list; `verified` |
| All records share < `MIN_SHARED` grams | `no_candidates` with `considered` | a weak list presented as nearest |
| Snapshot unreadable / query throws | `unavailable`, reason string | fallback list, cached prior result, crash |
| A row fails `CorpusRecord` decode | that record is skipped **and counted**; the section prints the count | a half-decoded record |
| `fetchRecordsById` returns fewer ids than winners | `unavailable` with the mismatch named | rendering a candidate with no text |
| Verdict is not `rejected` | section absent | suggesting against a `verified` claim |

- **Propagation:** every failure is a state in the union. Nothing throws; `fetchRecordsById` returns `Result<…, CorpusError>` like `resolveCitations` consumers expect; `suggestionsFor` never propagates an exception (§2).
- **Timeout:** none inside the package — no clock is reachable (G-7.8 makes that structural). The only bound is the scan itself; if it overruns, the caller may abandon it and render `unavailable` (documented escape hatch, not the default path).
- **Degradation:** exactly §16's shape. A missing suggestion pass is a **less** informative screen, never a **wrong** badge.
- **Not extended:** `DegradeReason`. Adding `suggestions_unavailable` would put a display concern inside `VerdictReport.degraded` and the hash-chained `RunTrace`. Rejected.

---

## 7. Security Architecture

| Concern | Control |
|---|---|
| **A03 injection** | All output is text nodes (CLI strings) passed through `normalizeForTerminal`. No raw-HTML sink exists or is added (§11). Candidate text comes from the same trusted snapshot as every other displayed record. |
| **A08 / CWE-345 integrity** | No path from an overlap number to a verdict. Enforced four ways: `@mizan/suggest` is not in the verdict closure (**G-7.9**); the contract has no number to divide; the renderer may not declare a `score` field (**G-7.4**); `MatchStrength` keeps exactly two members (type-level test). |
| **A10 SSRF** | The package may import only `@mizan/core` (**G-7.8**), so `fetch(` is unreachable; the scanner's `fetch(` ban is inherited by construction. Corpus access is `openSnapshot` read-only. |
| **A02 / §13 leakage** | Suggestions are computed after the answer exists and are never written to `RunTraceDraft`, the ledger, or any log. A test asserts `buildDraft` output is byte-identical with and without the suggestion pass. |
| **A01 authz** | Unchanged. No new endpoint, no new credential, no new env var. `--no-suggestions` is a local display flag, not an authority. |
| **Prompt boundary** | Suggestions are computed **after** `verifyAnswer` and are **never** fed into a prompt. The generator cannot see them, so no incentive to fabricate-contain can be created by them. `apps/cli/src/instructions.ts` is untouched. |
| **Trust boundaries** | Two new ones: (a) SQLite rows → `CorpusRecord`, via the extracted decoder (§1); (b) model output quote → folded string, via `normalizeForMatch` + the length bound. Both fail closed. |
| **Secrets** | None. No new env var, no key, no network. |

---

## 8. Design Patterns

- **Pure function + thin shell.** All ranking is a total pure function over already-decoded data; all I/O sits in `@mizan/corpus`; all formatting sits in the CLI. This is the repo's existing shape (`verifyAnswer` pure, `resolveCitations` impure, `renderReport` formatting) and it is what makes the ranking testable without a snapshot, a clock, or a network.
- **Repository-free, iterator-based stream.** `scanNeighbourKeys` returns an `Iterable`, so `@mizan/corpus` owns SQL and `@mizan/suggest` owns the fold, and neither knows the other's type beyond `NeighbourKey`.
- **Total order as a comparator.** `compareNeighbours` is one exported comparator, which is what makes determinism testable in isolation and keeps the tie-break in one place (§17).
- **Explicit union states, never a nullable field.** Precedent: `Correction`, `Relevance`, `RelevanceState.undetermined`, `SearchResult.ranking`.
- **Reuse, not reinvention.** `SourceExcerpt`, `citationLabel`, `displayed()`, `normalizeForTerminal`, `longestRunFor`, `toRecord`/`rowsToRecords`, `checkDependencyIsolation` — all extended, none replaced.
- **Rejected:** Strategy/Factory/Observer. One algorithm, one call site shape, no variation axis to inject.

---

## 9. Testing Strategy

**Unit — `@mizan/suggest`:** trigram extraction under the fold (tashkeel, tatweel, doubled spaces); input shorter than 3 folded chars → empty set; containment short-circuit wins over any overlap; tie-break totality (equal `shared`, then shorter record, then `recordId`); `MIN_SHARED` boundary (7 → excluded, 8 → included); excluded ids dropped; `topK` clamped to `MAX_TOP_K`; no input throws.

**Determinism:** three runs over the same input → byte-identical `canonicalJson`; and an explicit assertion that sorting uses code-unit comparison, not `localeCompare` (the same discipline `docs-gates.ts` and `g7` use).

**Type-level:** `MatchStrength` still has exactly two members; `Suggestion` has no numeric field other than `rank` and `considered` (a `forbid`-style assertion so a future `score:` fails typecheck).

**Unit — `@mizan/corpus`:** `scanNeighbourKeys` yields ids in ascending order; `fetchRecordsById` on an empty list does not build a query; a malformed row is reported, not silently accepted.

**Integration — CLI:** golden output for all four states (`candidates`, `no_candidates`, `unavailable`, absent); the `--no-suggestions` flag produces byte-identical output to a build with the section removed; **the load-bearing test** — a `rejected` claim rendered with candidates produces byte-identical badge, reason, evidence, source, relevance and `run:` lines as the same report rendered without them.

**Gate:** planted violations for G-7.8 (a `@mizan/suggest` file importing `@mizan/agent`), G-7.9 (a `mizan-verify` file importing `@mizan/suggest`), and the new `DISPLAY_PATH` entry (rename the file → G-7.6 fires). Each must fail; a guard that cannot fail is not a guard (§14).

**Security tests:** no `fetch`/`process.env`/timer reachable from the package (mechanically enforced by G-7.8, asserted anyway); `buildDraft` output identical with and without suggestions; `normalizeForTerminal` applied to every rendered corpus string.

**Performance:** `scripts/eval/suggest-coverage.ts` measures p50/p95 latency and reports the scanned count over `data/eval/golden-normalization.json` + `redteam-fabricated.json`, plus top-1/3/5 coverage at floors 4/8/12. The perf assertion in CI is a generous ceiling (250 ms) — the 50 ms target is a measurement gate before commit, not a flaky unit test (§14: a flaky CI job is a defect).

**Commands:** `bun run typecheck && bun test` in `packages/mizan-suggest`, `packages/mizan-corpus`, `apps/cli`, `packages/mizan-gate`; then `bun run ci`; then `bun run check:docs`.

---

## 10. Performance Plan

- **Cost model:** one pass, 27,234 rows, ~8M folded characters. Native `includes` per row (fast path); on a miss, one character pass building the record's 3-gram `Set`. Then one indexed `WHERE id IN (…)` for the ≤5 winners' full rows.
- **Memory:** O(1) beyond the quote set and ≤5 accumulated winners. `.iterate()`, never `.all()`.
- **Spike first.** Task 1 of implementation is a measurement of the real snapshot, because the entire candidate-pool decision rests on it. If p95 > 50 ms, the documented ladder is: (1) bound record length at the diagnostics' 65,536 chars and report `skippedLong`; (2) narrow the scan scope and say so in `considered`; (3) only then an FTS5 trigram index — which needs Bun's bundled tokenizer verified first and is rejected this round.
- **No new index, no cache, no new dependency.** A persisted trigram index would trade a one-off 80 ms for permanent schema, ingest and attestation surface.
- **CI budget:** a new package is auto-discovered; the added typecheck + test keeps the full run well under the 300 s ceiling.

---

## 11. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Full scan exceeds 50 ms p95 | Medium | Spike before commit; explicit ladder; `skippedLong`/`considered` keep every bound visible |
| A fabrication with almost no shared grams → `no_candidates` | High, and **correct** | The state is explicit and says it locates nothing nearby — not that the quote is authentic |
| Short quotes produce many ties | Medium | Total order ends at `recordId`; the count is printed; no stability dependence on row order |
| A candidate list read as authority | Medium | Header carries "non-authoritative"; the reused `run:` line carries "never a verdict"; no candidates for `verified`; G-7.4 forbids a `score` field |
| Quote fold differs from the verifier's | **Zero** | Verified: `foldQuote` **is** `normalizeForMatch`; same function, same fold table (§17) |
| Docs-claim churn breaks `check:docs` | Medium | R1 backticked paths, R12 citations resolve, R13 ADR sections, R8 gate count unchanged — `bun run check:docs` is a required step |
| Feature invisible in the demo | Medium if skipped | `apps/cli/src/demo.ts` wired explicitly, not left to the optional parameter |
| Scope creep into MCP/web/prompts | Medium | Listed out of scope; the suggestion pass has no consumer other than the CLI renderer |

---

## 12. Technology Trends

- **Grounding in the dependency-zero direction.** The market answer to "find the nearest hadith" is an embedding store plus a vector index. That is precisely the shape ADR-03's spike proved unsafe, and it would make the suggestion surface the second authority in the product. Character n-gram overlap is the classical, dependency-free IR baseline; adopting it here is not a compromise, it is the decision the integrity claim requires.
- **Determinism as a feature, not a limitation.** Ranking by a precomputed lexical index rather than a model makes byte-identical output a property of the design (§14's determinism claim extends to suggestions for free).
- **Streaming, not materialising.** Iterator-based row consumption is the current Bun/SQLite idiom and matches the repo's no-clock, no-materialisation style.
- **Policy in the gate, not in review.** Extending an existing gate's sub-rules (G-7.8/G-7.9) instead of adding G-8 follows the established pattern here: the property is machine-checked with a planted violation, and the published gate count stays true.
- **Honest degradation as a first-class state.** Discrete, named, always-rendered states (`candidates` / `no_candidates` / `unavailable`) follow the repo's §16 table and the `Relevance.undetermined` precedent; the industry norm of a silent empty list is rejected outright.
- **Deliberately deferred:** reranking, MCP surface, persisted suggestion traces, FTS5 trigram tokenizer. Each is recorded with the reason it was deferred, so the next reader inherits a decision rather than a gap.

---

```json
{
  "moduleStructure": [
    {
      "name": "@mizan/suggest",
      "path": "packages/mizan-suggest",
      "kind": "package",
      "dependsOn": ["@mizan/core"],
      "responsibilities": "Pure, dependency-free deterministic nearest-quote ranking. No I/O, no clock, no environment, no randomness, no network. Machine-checked as a leaf by gate G-7.8.",
      "files": [
        { "path": "packages/mizan-suggest/src/trigrams.ts", "responsibility": "char-3-gram TYPE-set extraction over already-folded text; short input yields an empty set" },
        { "path": "packages/mizan-suggest/src/rank.ts", "responsibility": "compareNeighbours: the single total order — containment, shared desc, record grams asc, recordId asc by code unit" },
        { "path": "packages/mizan-suggest/src/suggest.ts", "responsibility": "rankNeighbours(quote, candidates, options); exact-containment short-circuit; MIN_SHARED, DEFAULT_TOP_K, MAX_TOP_K, MAX_QUOTE_CHARS, MAX_CANDIDATE_RECORD_CHARS" },
        { "path": "packages/mizan-suggest/src/index.ts", "responsibility": "Flat named exports plus namespace self-reexports per AGENTS.md section 7" }
      ]
    },
    {
      "name": "@mizan/corpus candidate scan",
      "path": "packages/mizan-corpus/src",
      "kind": "module",
      "dependsOn": ["@mizan/core"],
      "responsibilities": "Owns snapshot I/O and row decoding. Streams neighbour keys in ascending id order and fetches the winning rows by id.",
      "files": [
        { "path": "packages/mizan-corpus/src/rows.ts", "responsibility": "Shared SQLite row to CorpusRecord decoder, extracted from resolve.ts so one rule has one home (AGENTS.md section 17)" },
        { "path": "packages/mizan-corpus/src/candidates.ts", "responsibility": "scanNeighbourKeys via .iterate() over SELECT id, textMatch FROM records ORDER BY id; fetchRecordsById returning Result<readonly CorpusRecord[], CorpusError>" }
      ]
    },
    {
      "name": "CLI suggestion surface",
      "path": "apps/cli/src",
      "kind": "module",
      "dependsOn": ["@mizan/corpus", "@mizan/suggest", "@mizan/verify", "@mizan/core"],
      "responsibilities": "Composition, offering policy, and rendering. Downstream of every decision; upstream of nothing.",
      "files": [
        { "path": "apps/cli/src/suggestions.ts", "responsibility": "suggestionsFor and renderSuggestions; reuses SourceExcerpt, citationLabel, displayed, normalizeForTerminal, longestRunFor. Declared in gate G-7 DISPLAY_PATH. Must avoid every SIMILARITY_TOKENS word and every percent-shaped property key" },
        { "path": "apps/cli/src/render.ts", "responsibility": "renderReport gains an optional suggestions parameter; renderClaim appends the section; verdict, evidence and source lines byte-identical either way" },
        { "path": "apps/cli/src/main.ts", "responsibility": "Composes after verifyAnswer; reads --no-suggestions from argv; exit codes unchanged" },
        { "path": "apps/cli/src/demo.ts", "responsibility": "Demo parity so the judged path exercises the feature" }
      ]
    },
    {
      "name": "@mizan/core display contracts",
      "path": "packages/mizan-core/src/schema/display.ts",
      "kind": "schema",
      "dependsOn": ["effect"],
      "responsibilities": "Owns SuggestionState, NearbyRecord and Suggestion beside Correction and Relevance. Contains no field a caller could divide into a match strength."
    },
    {
      "name": "gate G-7 extension",
      "path": "packages/mizan-gate/src",
      "kind": "gate",
      "dependsOn": ["@mizan/core"],
      "responsibilities": "Extends an existing gate rather than adding an eighth, because GateId, GATE_IDS and docs-gates.ts machine-check the published count of seven.",
      "files": [
        { "path": "packages/mizan-gate/src/gates/g7-verdict-path-purity.ts", "responsibility": "Add apps/cli/src/suggestions.ts to DISPLAY_PATH; add G-7.8 (suggestion package is a leaf over @mizan/core) and G-7.9 (the verdict closure contains no suggestion module)" },
        { "path": "packages/mizan-gate/src/gates/g1-no-similarity.ts", "responsibility": "Extract checkImportAllowlist(files, prefix, allowed) so G-1.1 and G-7.8 share one implementation at two scopes" },
        { "path": "packages/mizan-gate/test/gates.test.ts", "responsibility": "Planted violations for G-7.8, G-7.9 and the new DISPLAY_PATH entry" }
      ]
    },
    {
      "name": "diagnostic coverage and latency harness",
      "path": "scripts/eval",
      "kind": "script",
      "dependsOn": ["@mizan/suggest", "@mizan/corpus", "@mizan/core"],
      "responsibilities": "Measures top-1/3/5 coverage at floors 4/8/12 over data/eval/golden-normalization.json and redteam-fabricated.json, plus p50/p95 scan latency and the scanned-record count. Diagnostic only; never a gate, never a published number without a backing artefact."
    },
    {
      "name": "decision records",
      "path": "docs/specs/adr",
      "kind": "documentation",
      "dependsOn": [],
      "responsibilities": "ADR-07 through ADR-10, renumbered from the spec's ADR-001..004 because ADR_PATTERN matches only two or more digits and a dangling citation fails bun run check:docs. Each needs ## Context, ## Decision, ## Consequences and - **Status:** Accepted."
    }
  ],
  "apiInterfaces": [
    {
      "name": "rankNeighbours",
      "module": "@mizan/suggest",
      "signature": "rankNeighbours(rawQuote: string, candidates: Iterable<NeighbourKey>, options: { topK?: number; excludeRecordIds?: readonly string[] }): RankedNeighbours",
      "returns": "RankedNeighbours = { exact: readonly RankedNeighbour[]; ranked: readonly RankedNeighbour[]; scanned: number; skippedLong: number }",
      "errors": "None. Total function: no I/O means no business failure, so no Result. Never throws. Quote folded with normalizeForMatch, bounded at 4096 chars; records bounded at 65536 chars.",
      "determinism": "Total order: exact containment first, then shared 3-gram types descending, then record 3-gram types ascending, then recordId ascending by UTF-16 code unit. No locale, no clock, no randomness, no iteration-order dependence."
    },
    {
      "name": "scanNeighbourKeys",
      "module": "@mizan/corpus",
      "signature": "scanNeighbourKeys(db: Database, options: { excludeRecordIds?: readonly string[] }): Iterable<NeighbourKey>",
      "returns": "Lazy iterable of { recordId, textMatch } in ascending id order",
      "errors": "SQLite failures surface to the caller as a thrown driver error caught once in apps/cli/src/suggestions.ts and mapped to Suggestion state unavailable. Row text is never decoded here; only ids and the pre-folded key are read.",
      "determinism": "ORDER BY id is the reproducibility guarantee. Streams via .iterate(); never .all()."
    },
    {
      "name": "fetchRecordsById",
      "module": "@mizan/corpus",
      "signature": "fetchRecordsById(db: Database, ids: readonly string[]): Result<readonly CorpusRecord[], CorpusError>",
      "returns": "ok: decoded CorpusRecords in id order; err: a CorpusError describing a row that failed CorpusRecord decoding",
      "errors": "Empty id list returns ok([]) before a query is built, because IN () is a SQL syntax error. A short result set is a mismatch the caller must surface as unavailable rather than render around.",
      "determinism": "Same decoder as resolve.ts; one row-to-record rule for the whole repository."
    },
    {
      "name": "suggestionsFor",
      "module": "apps/cli/src/suggestions.ts",
      "signature": "suggestionsFor(db: Database, input: { verdict: Verdict; quote: string; excludeRecordIds: readonly string[] }): Suggestion",
      "returns": "Suggestion — offered for rejected and nothing else, mirroring correctionFor's stated rule",
      "errors": "Never throws. Every failure is a state: no_candidates for an empty fold or a sub-floor overlap, unavailable for a read failure or a short winner fetch. Exit codes and the verdict report are untouched.",
      "determinism": "Pure composition of two total functions over an ordered scan."
    },
    {
      "name": "renderSuggestions",
      "module": "apps/cli/src/suggestions.ts",
      "signature": "renderSuggestions(suggestion: Suggestion, lookup: (recordId: string) => SourceExcerpt | undefined): readonly string[]",
      "returns": "Display lines headed by 'nearest suggestions (non-authoritative)', each candidate reusing the source-line format and the display-only 'run: N of M folded characters shared' line",
      "errors": "A candidate whose record cannot be looked up renders an explicit unavailable line rather than a partial candidate.",
      "determinism": "All output passes normalizeForTerminal; no raw corpus HTML sink exists anywhere in the product."
    }
  ],
  "dataModels": [
    {
      "name": "SuggestionState",
      "module": "@mizan/core/src/schema/display.ts",
      "fields": ["candidates", "no_candidates", "unavailable"],
      "invariants": "Exactly three rendered states, all named and all reachable. An absent parameter renders nothing, which is honest because that surface never computed a suggestion pass."
    },
    {
      "name": "NearbyRecord",
      "module": "@mizan/core/src/schema/display.ts",
      "fields": ["rank", "recordId", "label", "sourceUrl", "attribution", "license", "grade", "gradeApplicable", "gradeSource", "gradeBasis"],
      "invariants": "No field is a rate and none is a percentage, so no caller can divide one into a match strength (AGENTS.md section 10, and the Relevance module header). grade is copied exactly as the source dataset asserts it, with gradeSource and gradeBasis beside it; it is never inferred, upgraded, or presented as our own ruling (AGENTS.md section 15). The renderer prints a grade only when gradeApplicable. Carries no corpus text: textDisplay and textMatch stay in the CLI's SourceExcerpt, which documents textMatch as measured and never displayed."
    },
    {
      "name": "Suggestion",
      "module": "@mizan/core/src/schema/display.ts",
      "fields": ["state", "considered", "candidates", "reason"],
      "invariants": "A tagged union on state. considered is the number of records actually scanned, so any floor or length bound is visible on screen instead of silent (AGENTS.md section 16). reason is never empty and states why this state and not another, the same requirement Relevance.reason carries."
    },
    {
      "name": "NeighbourKey",
      "module": "@mizan/suggest",
      "fields": ["recordId", "textMatch"],
      "invariants": "The only shape that crosses from the corpus package into the ranking package. textMatch is the ingest-folded key, so ranking folds the quote with the identical function (foldQuote is literally normalizeForMatch) and the two cannot disagree."
    },
    {
      "name": "RankedNeighbour",
      "module": "@mizan/suggest",
      "fields": ["recordId", "contained", "shared", "grams"],
      "invariants": "Never leaves the package: it carries no licence, attribution, grade or display text, so ranking cannot leak corpus metadata and the display path cannot receive a number to render. shared and grams are counts of 3-gram types, not rates."
    },
    {
      "name": "corpus.db records table",
      "module": "@mizan/corpus/src/snapshot.ts",
      "fields": ["id", "collection", "number", "textMatch", "textDisplay", "grade", "gradeApplicable", "gradeSource", "gradeBasis", "attribution", "license", "licenseUrl", "sourceUrl", "translation"],
      "invariants": "UNCHANGED. No migration, no new index, no new table, no ingest change. snapshotHash, attestation.json, DISCLOSURE arithmetic and recordCount therefore all remain valid, which is a design goal rather than a side effect. An FTS5 trigram index is rejected this round and recorded in ADR-10."
    }
  ],
  "testingStrategy": {
    "unit": [
      "trigram extraction under the Arabic fold: tashkeel, tatweel and doubled spaces collapse as normalizeForMatch dictates; input shorter than three folded characters yields an empty set",
      "exact-containment short-circuit beats any overlap, and a contained record skips trigram work",
      "tie-break totality: equal shared, then shorter record, then recordId; sorting uses code-unit comparison and never localeCompare",
      "MIN_SHARED boundary: seven shared grams excluded, eight included",
      "excluded record ids are dropped before scoring; topK clamps to MAX_TOP_K; no input throws",
      "type-level assertion that MatchStrength still has exactly two members and that Suggestion carries no numeric field beyond rank and considered"
    ],
    "determinism": [
      "three runs over the same input produce byte-identical canonicalJson",
      "scanNeighbourKeys yields ids in ascending order and fetchRecordsById preserves that order"
    ],
    "integration": [
      "CLI golden output for all four states: candidates, no_candidates, unavailable, absent",
      "load-bearing: a rejected claim rendered with candidates produces byte-identical badge, reason, evidence, source, relevance and run lines as the same report rendered without them",
      "--no-suggestions produces output byte-identical to a build with the section removed",
      "fetchRecordsById on an empty list does not build a query; a malformed row is reported rather than silently accepted"
    ],
    "gate": [
      "G-7.8 planted violation: a @mizan/suggest file importing @mizan/agent must fail",
      "G-7.9 planted violation: a mizan-verify file importing @mizan/suggest must fail",
      "renaming apps/cli/src/suggestions.ts must fail G-7.6 display-path-present",
      "each new rule ships a self-test whose planted violation must fail; a guard that cannot fail is not a guard"
    ],
    "security": [
      "no fetch, process.env, timer or dynamic import reachable from @mizan/suggest, asserted mechanically by G-7.8",
      "buildDraft output byte-identical with and without the suggestion pass, proving no suggestion content or question text reaches the hash-chained trace",
      "normalizeForTerminal applied to every rendered corpus string; no raw-HTML sink introduced"
    ],
    "performance": [
      "latency harness reports p50 and p95 scan latency plus the scanned-record count over data/eval/golden-normalization.json and redteam-fabricated.json",
      "coverage reported as top-1, top-3 and top-5 at floors 4, 8 and 12 so the single tunable is measured rather than asserted",
      "the CI assertion is a generous 250 ms ceiling; the 50 ms target is a pre-commit measurement gate, because a flaky CI job is a defect"
    ],
    "commands": [
      "bun run typecheck && bun test in packages/mizan-suggest, packages/mizan-corpus, apps/cli and packages/mizan-gate",
      "bun run ci from the repository root, which iterates packages explicitly and names the failing one",
      "bun run check:docs for the ADR citations, backticked paths and the unchanged seven-gate count"
    ]
  },
  "office_auto_approve": {
    "confidence": 0.88,
    "evidence": "Every structural claim was read from source this session: foldQuote is normalizeForMatch, G-1.1/G-7.2 token lists and PERCENT_KEY_RULE, DISPLAY_PATH and G-7.1..G-7.7, MatchStrength, DegradeReason, ADR_PATTERN, discoverPackages, search() MAX_LIMIT of 32, and render.ts's source-excerpt reuse. Confidence is held below 0.95 for two real unknowns: the single-pass scan latency over 27,234 rows is unmeasured and the spike may force the documented fallback ladder, and the exported contract deliberately drops the spec's jaccard score field, which is a visible deviation the spec owner should ratify rather than inherit."
  }
}
```

```json
{"office_fact_memory":[{"fact":"`SIMILARITY_TOKENS` in packages/mizan-gate/src/gates/g1-no-similarity.ts is re-applied by G-7.2 to the verdict import closure AND to every file in `DISPLAY_PATH` (apps/cli/src/render.ts, correction.ts, relevance.ts, apps/web/src/page.ts), in code+strings mode. It bans the words similarity, similar, fuzzy, jaccard, trigram, ngram, cosine, embed*, vector, tfidf, bm25, sbert, rapidfuzz, fuse, tokenOverlap, scoreThreshold and threshold — so any display-path module must name its work in vocabulary outside that list (e.g. shared/grams/nearest, never 'overlap score' or 'threshold'). G-7.4 additionally bans percent|confidence|score|trustScore as property keys there.","phase":"at","evidence":"Read g1-no-similarity.ts:41-85 and g7-verdict-path-purity.ts:89-94,132-158 in this session.","confidence":0.97},{"fact":"`foldQuote` exported from @mizan/verify is literally `normalizeForMatch(rawQuote)` from @mizan/core (packages/mizan-verify/src/steps/containment.ts:57). Any new package therefore folds a quote byte-identically to the verifier while depending only on @mizan/core — no need to depend on @mizan/verify for fold parity.","phase":"at","evidence":"Read containment.ts in full this session; confirmed normalizeForMatch is exported from @mizan/core's index.","confidence":0.99},{"fact":"Two docs-gate traps in this repo: `docs-gates.ts` GATE_CLAIM_EXCLUDES contains the prefix `specs/` but NOT `docs/specs/`, so ADRs are scanned; and `docs-adr.ts` ADR_PATTERN matches only 2+ digits after `ADR-`, so the spec's `ADR-001`..`ADR-004` are read as citations to non-existent files and fail `bun run check:docs` (R12). Free ADR ids are ADR-07..ADR-10. Adding an eighth gate id would also break R8 across the audited docs, so extend G-7 sub-rules instead.","phase":"at","evidence":"Read docs-adr.ts:33-48 and docs-gates.ts GATE_CLAIM_EXCLUDES/GATE_TOKEN, plus the ADR filename glob (ADR-02..06, ADR-11, ADR-C1..C9 exist).","confidence":0.96}]}
```