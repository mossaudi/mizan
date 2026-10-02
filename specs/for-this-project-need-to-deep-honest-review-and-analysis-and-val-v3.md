# Spec: for-this-project-need-to-deep-honest-review-and-analysis-and-val

**Request:** for this project need to deep honest review and analysis and validate its real value as I received a feedback that the project value is not strong and seems useless as it can be achieved by any search tool also the below gaps  aLoad-bearing weaknesses you must handle :

No Bukhari / Muslim. The two most-cited collections are absent. A judge will ask. Keep it on slide 7, and either add a licenced source or frame scope as "4 Sunan + Muwatta + Qur'an, 27,234 records".
No UI. Requirement: "منتج متكامل قابل للتشغيل". CLI qualifies but loses to interactive demos. Add a minimal web page that renders the three badge lines as text nodes (no innerHTML — rule §11) before submission.
Default = replay, not live AI. bun run ask without a key prints PRECOMPUTED. Judges may read this as "not real". Demo with a key set, and label clearly.
Paraphrase divergence is open. Spec wants paraphrase → UNVERIFIABLE; code gives REJECTED (26 cases, docs/anchor-protocol.md). Decide + mechanise the locator or you will be scored on inconsistency.
Golden 100% is vs. itself, not vs. human labels — don't overclaim it orally.
No tafsir, no multilingual 


so deep honest verify then need to deep honest review against latest market lead and production tips and tricks Your mission is to ensure that every new feature is not only "production-ready" but "industry-leading." You bridge the gap between internal needs and external best practices , Integrate a [New Feature/Update] by first harvesting global "Best-in-Class"

## Stories
# Specification Analysis → User Stories

I verified the CEO specification against the actual tree before decomposing it. That verification changed the plan materially: **four of the nine proposed stories are already implemented, one is factually inverted relative to the code, one is not implementable as written, and one would repoint 208 existing citations.**

### Findings that change the plan

| # | CEO spec says | Verified reality on HEAD | Consequence |
|---|---|---|---|
| **F1** | Introduce ADRs `ADR-01`…`ADR-06` | Repo ships ADR-02…06, ADR-11, ADR-C1…C5, all `Accepted`. **208 citations** of ADR-02…06 (ADR-03 ×108, ADR-06 ×42, ADR-02 ×38, ADR-05 ×18, ADR-04 ×2). `ADR-01.md` does not exist. | Executed literally, spec ADR-03 ("Bukhari/Muslim") **overwrites the repo's ADR-03** ("No similarity in the verdict path") — the most-cited architectural claim in the project. R12 fails CI on the dangling `ADR-01`. **Blocking.** |
| **F2** | S1: publish 91% vs 39% in `value-proof.md` | `value-proof.md:19` — *"Every number printed below comes from a file committed to this repository."* Collides with R10 (`benchmark-claim-unbacked`), R14 (`answer-quality-claim`, **document-wide**, 6 audited docs), and **ADR-C2** (Accepted): *"Value is the computed per-claim verdict, never answer quality."* Figures confirmed **absent** from the repo. | The headline Must is not a doc edit. It requires admitting a **third claim class** (external) with its own rule, and an ADR amending ADR-C2's scope. |
| **F3** | ADR-05: REJECTED = located; UNVERIFIABLE = cannot locate | `anchor-protocol.md:133-134` and step 5b of `verify.ts` say the **inverse**: `located:true` → **`unverifiable`**/`no_matching_evidence`; `located:false` → **`rejected`**/`quote_absent_at_cited_id`. **ADR-C1 (Accepted)** is titled *"Elision verdict is `UNVERIFIABLE`, not `REJECTED`"*. | Implementing S4 as written would **introduce the exact doc-vs-behaviour inconsistency it claims to remove.** The spec also misses the two-level distinction (40 fabrications are *ruled* `rejected`, *emit* `unverifiable`). |
| **F4** | S2: rewrite `demo-runbook.md` for live-first | **Already implemented and gated.** R16 in `docs-runbook.ts` fails on order and on missing labels. Runbook §1 = live keyed, prints `LIVE`; §2 = replay, prints `PRECOMPUTED`. | Story closes as already-satisfied. Only residual is the no-key perception path, folded into Story 1's ADR record. |
| **F5** | S4: "26 cases show REJECTED vs UNVERIFIABLE inconsistency" | `anchor-protocol.md` already carries the full, correct, two-level account (26 elisions → `unverifiable`; 40 fabrications ruled `rejected`, observed `unverifiable`, cost published as `rejectedToUnverifiable: 40`). | Not a terminology gap. The gap is that **README has no sentence** — and the spec's proposed sentence is wrong. |
| **F6** | S7: add ≤10 lines to `apps/web/index.html` | `apps/web/test/page.test.ts` asserts **byte-identity**: committed `index.html` == `renderPage(fixture)`. `ADR-C3` names this as the *general* control that bounds both residual gaps. | A hand edit fails the test immediately. Must go through `apps/web/src/page.ts` + `bun run build:web`. |
| **F7** | S3 Path A: ingest CC0 Arabic Bukhari/Muslim | `ADR-C4` (Accepted) already frames it. 5 renunciation lines exist. R15 requires negation **on the same line**. | Path A has an unflagged cascade: it falsifies 5 renunciation sentences **and R15 cannot catch that** (it fires only on *absence* of a negation — fail-open in the new direction, §3); and `corpusRecordCount` 27,234 lives in `vs-search.json`, so a corpus change invalidates every headline benchmark figure under R10. |
| **F8** | S6: document tafsir/multilingual | `tafsirLookup()` returns typed `unavailable`; `.env.example` documents that naming `MIZAN_TAFSIR_URL` would promise a nonexistent feature; `value-proof.md:142,156` already disclose it. | Disclosed but **not enforced** — a disclosure that cannot be violated proves less than it claims. |
| **F9** | S5: add benchmark transparency notes | `value-proof.md:32-40` is **already more honest than the spec asks**: one half is a compile error, the other is *"reviewed rather than checked"* and no gate exists. | The valuable refinement is closing the unchecked half, not adding more prose. |

**Verified baseline:** `bun run ci:gates` → G-1…G-7 all PASS, CI GREEN. `bun run check:docs` → OK (6 audited docs, 14 corpus surfaces, 7 evidence artefacts, 218 files swept), **1105 ms**.

---

## 1. Story Overview

| ID | Story | Epic | Pri | Reach | Impact | Conf | Effort | **RICE** | Risk |
|---|---|---|---|---|---|---|---|---|---|
| **S1** | ADR namespace integrity | E1 | Must | 9 | 2 | 95% | 0.5 | **34.2** | High |
| **S3** | Paraphrase verdict polarity correction | E3 | Must | 7 | 2 | 95% | 0.5 | **26.6** | Med |
| **S4** | Bukhari/Muslim decision + symmetric absence check | E2 | Must | 9 | 2 | 90% | 1.0 | **16.2** | High |
| **S7** | Static web note via renderer | E6 | Could | 5 | 1 | 95% | 0.25 | **19.0** | Low |
| **S2** | Support-gap claim as a checked external class | E1 | Must | 10 | 3 | 80% | 2.0 | **12.0** | High |
| **S8** | Tafsir/multilingual boundaries become checked | E5 | Could | 4 | 1 | 90% | 0.5 | **7.2** | Med |
| **S5** | Anti-tautology half becomes checkable | E4 | Should | 6 | 2 | 80% | 1.5 | **6.4** | Med |
| **S6** | Reproducibility checklist | E7 | Could | 8 | 2 | 95% | 0.5 | **30.4** | Low |

*Sequenced by dependency, not by score. S1 gates S2/S3/S4 because all three need a citable ADR that does not repoint 208 existing citations.*

**S2's RICE is lowest of the Musts not because it matters least — it is the highest-value claim in the plan — but because Confidence is 80% and effort is 2 PM: the ADR-C2 tension (F2) is a genuine open question, not a drafting task.** That is why it is Sprint 1 and sequenced behind the cheap decisions.

---

## 2. Dependency Graph

```
                    ┌─────────────────────────────────────────┐
                    │ S1  ADR namespace integrity   (BLOCKER) │
                    │  ADR-01..06 collide w/ 208 citations    │
                    └───────────────┬─────────────────────────┘
                                    │ every other story cites a new ADR
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌──────────────────┐        ┌──────────────────┐
│ S3 Paraphrase │         │ S4 Bukhari/Muslim│        │ S2 Support-gap   │
│ polarity (F3) │         │ decision (F7)    │        │ external class   │
│ + ADR-C1      │         │ + symmetric R15  │        │ + ADR-C2 amend   │
└───────┬───────┘         └────────┬─────────┘        └────────┬─────────┘
        │                          │                           │
        │                   ┌──────┴───────────────────────────┴──────┐
        │                   │  BLOCKED PATH (not this sprint):        │
        │                   │  Path A ingest → registry + DISCLOSURE  │
        │                   │  + re-run system arm → ALL benchmark    │
        │                   │  figures change (R10 blast radius)       │
        │                   └─────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ Sprint 2                                                     │
│  S5 anti-tautology guard ──┐                                  │
│  S6 reproducibility ───────┤ all write docs/value-proof.md    │
│  S7 web note (renderer) ───┤ → sequence them, one file        │
│  S8 tafsir boundary ───────┘                                  │
└──────────────────────────────────────────────────────────────┘

External dependencies: none for Sprint 1. S6 needs no key. S2 needs a
named external citation (Tow Center 2025 / AI-Overviews 2026 audit)
supplied by the CEO — that is a *content* input, not a code one.
```

**Critical-path note:** S2, S5, S6, S8 all edit `docs/value-proof.md`. `check:docs` is one whole-file read, so concurrent edits conflict mechanically. Sequence them within the sprint; do not parallelise.

---

## Sprint 1: Decisions that unblock honest claims

### Story 1: ADR namespace integrity — resolve the specification's ADR collisions before any citation lands

**As a judge-facing product whose deliverable is machine-checked invariants, the identifier space *is* the product.** `docs-adr.ts` states it: a judge who greps `ADR-03` and finds the wrong document "has just been handed a reason to stop trusting every other citation beside it."

**INVEST**
- **I** — No other story may cite a new ADR until this lands. Fully deliverable alone.
- **N** — Identifier *scheme* is open (numeric continuation vs `ADR-C6+` vs `ADR-B1` for corpus). Only the constraint "must not collide" is fixed.
- **V** — Protects 208 existing citations and keeps `check:docs` green.
- **E** — 0.5 PM; no code beyond ADR files.
- **S** — Four ADR documents + one reconciliation note.
- **T** — Every criterion below is a `check:docs` exit code.

**Scenario: no proposed identifier collides with an existing Accepted ADR**
```
Given docs/specs/adr/ holds ADR-02, ADR-03, ADR-04, ADR-05, ADR-06,
      ADR-11, ADR-C1..ADR-C5, all with Status: Accepted
  And ADR-01.md does not exist
When each of the six specification decisions is assigned an identifier
  Then no identifier names a file that already exists
  And ADR-01 is cited in no file, because no ADR-01.md exists
  And check:docs reports zero adr-citation-unresolved findings
```

**Scenario: a reaffirmation is recorded as a new document, never as a replacement**
```
Given the specification's strict-containment decision restates the
      repository's existing ADR-03
When the decision is recorded
  Then it is a new document whose Context cites ADR-03 by identifier
  And ADR-03.md is byte-unchanged
  And the 108 existing ADR-03 citations still resolve to the strict-
      containment decision
```

**Scenario: an ADR that exists but decides nothing fails the build**
```
Given a new ADR file records only what was considered
When R13 reads it
  Then check:docs fails with adr-document-incomplete, naming the
       missing "## Decision" section
  And the build exits non-zero
```

**Edge cases**
| Class | Case | Expected |
|---|---|---|
| Platform | Citation resolves on Windows, dangles on Linux | Must fail on **both**; `available` set built from filenames, compared case-sensitively |
| Syntax | Bare `ADR-01` placeholder in prose | Still read as a citation (2+ digits) → dangling → fails. Intended |
| Namespace | `ADR-C6` vs `ADR-06` | Distinct namespaces; must not resolve to each other |
| Fenced | ADR citation inside a ``` block | Resolved; ADR-C3 precedent — a quoted citation is still a citation |
| Structural | Non-ADR `.md` file in the directory | Must not enter the `available` set |
| Idempotence | Run `check:docs` twice | Identical findings; no state carried between runs |

**Security** — ADR documents are public surfaces swept by the gate-count and ADR rules. No secret, key, or unreleased endpoint in an ADR; an ADR naming a hostname is a config claim under `docs-artifacts.ts`. Fail-closed: a missing directory is a missing answer, never a skip.

**Performance** — Pure string functions over ≤10 files. Budget ≤20 ms added to `check:docs` (measured baseline **1105 ms**); full CI stays under the §14 5-minute ceiling.

**Reliability** — Failure mode is *loud*, not silent: a renamed file stops matching, reports `runbook-no-live-path`-class silence, and R2 fails separately on the same rename. No retry, no degradation — this is a build-time invariant.

---

### Story 3: Paraphrase verdict polarity — correct the mapping and reconcile ADR-C1

**The CEO's ADR-05 is inverted relative to the implemented code.** This is the highest-substance correction in the plan: shipping S4 as written would put a false statement about the verifier's behaviour into the document a judge reads to understand it — the precise defect class `docs-claims.ts` exists to prevent.

| | Spec ADR-05 proposes | Code actually does (step 5b, `anchor-protocol.md:133-134`) |
|---|---|---|
| `located: true` | `REJECTED` (divergent span) | **`unverifiable`** / `no_matching_evidence` |
| `located: false` | `UNVERIFIABLE` (cannot locate) | **`rejected`** / `quote_absent_at_cited_id` |

**INVEST**
- **I** — Depends only on Story 1 (needs a citable identifier).
- **N** — Wording is open; the polarity is not.
- **V** — Removes a contradiction that a hostile judge would find in one grep.
- **E** — 0.5 PM; documentation plus one reconciliation record.
- **S** — One README sentence, one ADR, one `check:docs` pass.
- **T** — Polarity is assertable against a live run.

**Scenario: the documented polarity matches an observed run**
```
Given the locator returns located: true for a claim
When the docs describe the resulting verdict
  Then they name "unverifiable" with reason "no_matching_evidence"
Given the locator returns located: false
  Then they name "rejected" with reason "quote_absent_at_cited_id"
  And no document states the inverse pairing
```

**Scenario: README carries the mapping a reader needs**
```
Given README carries one sentence on paraphrase outcomes
When a judge reads it
  Then it distinguishes the human ruling from the procedure output,
       naming both
  And it states that the 40 fabrications are ruled "rejected" and emit
       "unverifiable", because an anchor drawn from a largely-real span
       locates
  And it cites the doc that carries the full argument
```

**Scenario: the inverted mapping cannot survive a real run**
```
Given a document states "located but divergent yields rejected"
When the published redTeamMovement figure is re-derived from a real run
  Then the figure cannot reconcile with the stated polarity
  And the check fails naming the file and the line
```

**Scenario: ADR-C1 is reconciled, not silently contradicted**
```
Given ADR-C1 is Accepted and titled "Elision verdict is UNVERIFIABLE,
      not REJECTED"
When the polarity is documented
  Then ADR-C1 is cited as the authority
  Or a new ADR records explicitly that it supersedes ADR-C1
  And R13 passes on whichever document is produced
```

**Edge cases**
| Class | Case | Expected |
|---|---|---|
| Semantic | "Which verdict does paraphrase produce?" | Two answers valid; docs

## Specification
# CEO Strategic Review and Plan

## 1. Executive Summary (what, why, expected impact)
This is a monorepo for a judged competition whose product is not an answer generator but a **citation verifier**. The core differentiator is the verifier’s fail-closed posture and the fact that every step of adjudication is machine-checked by structural gates (G-1..G-7). The request is for an honest deep review against feedback that the value is weak (“any search tool can do it”) and six listed gaps.

**What we reviewed:** current codebase on HEAD (working tree clean, 13 commits), tests/gates status, project conventions (AGENTS.md 17 rules), and market/industry research.

**Why this matters:** the feedback hits both perception (live AI vs replay, UI, missing two canonical collections, paraphrase semantics) and substance (benchmark self-referentiality, multilingual/tafsir deferred). If not reframed credibly, a judge will see “demo theater” rather than a verifiable artifact.

**Expected impact:**
- **Reframe value clearly**: 2025–26 citation studies show 8 major tools have **>60% mis-cited queries** and only **~39% of answers are both correct and fully supported** by cited sources. That’s a **~60-point support-gap** mizan is positioned to address. Framing as “verification, not answering” converts “useless” into a measurable market gap.
- **Close perception gaps**: default is already `hosted` (live) but demos need a labeled live path; UI is already static and compliant, though no interactive input (ADR-C3 constraint). 
- **Address real content gaps**: add Bukhari/Muslim via **licence-clean** (public-domain Arabic, English unavailable until open licence) or explicitly maintain the disclosed scope. Add tafsir as a **declared feature boundary** (return `unavailable`, no backend) and avoid scope creep.
- **Harden weakest link**: keep self-authored 40-case benchmark **fully disclosed**; do not claim third-party parity. Publish 91%-vs-39% support gap as the value claim; document the anti-tautology half explicitly.

## 2. Business Value Analysis
**Primary value driver:** **Trust and Integrity (Compliance/Verification)** — this is a judge-facing product in a religious domain. The key currency is **false verification rate** (CWE-345) which is published as 0 on the red team.

**MoSCoW classification:**

**Must Have**:
- **Explicitly frame value** as verification vs answering and publish the 91% vs 39% fully-supported citation gap as the value proof (from market research). Without this, external feedback continues.
- **Fix demo perception**: ensure live-keyed demo is clearly labeled and default ask in a demo environment makes the live/replay distinction unmistakable (currently `hosted` is default but first run without key still prints PRECOMPUTED — that’s honest but needs clearer labeling).
- **Handle Bukhari/Muslim honestly**: either add **licence-clean public-domain Arabic Bukhari/Muslim** (e.g. CC0 Arabic from i-muslim-style sources) and return English as `unavailable` with reason, or **formally keep the disclosed scope** as “4 Sunan + Muwatta + Qur’an” (27,234 records) and present it as a scope boundary (not laziness). Market expects this answer.
- **Treat paraphrase as already mechanized but document**: anchor arm exists (step 5b) producing `unverifiable/rejected` on paraphrase divergence; ensure `anchor-protocol.md`/runbook state “decided + mechanised locator.”
- **Document tafsir boundary**: tafsirLookup returns `unavailable` (correct). Treat as **feature boundary** (no backend) and ensure demos/disclosure say so clearly.

**Should Have**:
- **Harden benchmark disclosures**: add an explicit line in README/docs/value-proof about the anti-tautology half (benchmark executor does not read verifier-produced labels in a self-circular way) and that 40-case set is self-authored (no hold-out). Also publish that third-party arm run is planned.
- **Improve web demo clarity** (without breaking ADR-C3/static posture): add a short static note on `apps/web/index.html` explaining “static renderer only; no input (see CLI)” — minimal, compliant.
- **Consistency polish**: ensure “REJECTED” vs “UNVERIFIABLE” terminology is explained in docs (26 cases in anchor-protocol.md) and mapped clearly.
- **Golden set disclaimer** is already there; reinforce in demo script.

**Could Have**:
- **Publish span-level examples** in docs/value-proof to strengthen span-output credibility (matches industry direction). 
- **Third-party rerun preparation**: checklist for independent adjudication (even if planned).
- **Multilingual readiness**: document boundary (no multilingual UI now; only Arabic canonical text).

**Won't Have (this time):**
- **Adding fuzzy/semantic verification** — ADR-03 explicitly forbids (validated by 66.56% field accuracy). Not aligned with “industry-leading” in integrity.
- **Converting web to interactive with JS** — ADR-C3 and §11; would introduce script surface and breaks static guarantees. 
- **Embedding/LLM-as-judge paths in verifier** — violates G-1/§9. 
- **Tafsir backend implementation** — scope creep; declare boundary.

## 3. Risk Register (with severity and mitigation; includes Security and Reliability)

| Risk | Category | Severity (L/M/H/Critical) | Likelihood (L/M/H) | Impact (L/M/H) | Description | Mitigation |
|---|---|---|---|---|---|---|
| **Reviewer argument: “any search tool does it” persists** | Business | High | High | High | Judges may miss support-gap. | **Mitigate:** Update README, `docs/value-proof.md` and demo script to state “91% of AIO answers are correct but only 39% fully supported” (Tow/AI-Overviews 2025–26) and position mizan as verifier (support-gap). Show that search tools don’t produce adjudicated per-claim verdict with published false-verify rate. |
| **Bukhari/Muslim gap remains visible** | Business/Technical | High | High | High | Canonical Sunni collections missing; will be asked. | **Mitigate:** Choose path: (A) Add **public-domain Arabic** Bukhari/Muslim (CC0) to corpus ingest; set English fields to `unavailable` with documented licence reason; update `docs/value-proof.md` scope line. (B) Keep scope as-is and **amend docs to state translation-licence conflict explicitly** as the reason (not omission) — this is honest and defensible. Pick (A) if ingest/size manageable; (B) if faster to defend. |
| **Demo perception (replay vs live)** | Product/Reliability | High | High | High | Without key, `bun run ask` prints PRECOMPUTED — honest but judges may read as “not real.” | **Mitigate:** In live demo, **pre-set `MIZAN_LLM_API_KEY`** in environment; run a short live query and explicitly label outputs as **LIVE (hosted provider)**. Update `docs/demo-runbook.md` to put “Live demo with key set” as step 1 and call out both modes labeled. Add CLI banner note? No. Just labeling + setup. |
| **Paraphrase/locator inconsistency perception** | Technical/Reliability | Medium-High | Medium | High | Docs say “paraphrase → UNVERIFIABLE”; code gives REJECTED in 26 cases (anchor-protocol.md). Perception of inconsistency. | **Mitigate:** Decide final terminology. Mechanism exists (anchoredOutcome). Update docs to say: **“Paraphrase that prevents exact normalized containment yields REJECTED (no matching evidence) via anchor arm; when evidence cannot be located, outcome is UNVERIFIABLE.”** Make mapping explicit in `docs/anchor-protocol.md` and README. |
| **Benchmark self-referentiality (golden 100% is vs itself)** | Technical/Reliability | High | High | Medium | Weakest link; overclaimed orally. | **Mitigate:** **Keep disclosure strong**: README “Not done, and not claimed.” Add a short note in `docs/value-proof.md` under Benchmark: “Golden set is self-derived from plan/spec logic (200 cases, self-consistency bar) — not human-labeled ground truth. Anti-tautology: the benchmark executor does not import or reuse verifier verdicts as inputs; labels are restated, and a test enforces verifier≠generator separation where applicable.” Do not present as external parity. |
| **Tafsir/multilingual deferred** | Product | Medium | High | Medium | Gaps listed. | **Mitigate:** Treat as **declared boundaries**. Update docs to say “Tafsir: backend unavailable by design in this release; API returns `unavailable`. Multilingual UI not implemented.” No backend added. |
| **Security surface increase if UI becomes interactive** | Security | Critical (if violated) | Low | High | ADR-C3 forbids script. Adding JS/input would reintroduce XSS/supply chain considerations. | **Mitigate:** **Do not** add interactive JS. If a minimal input is desired for demo, keep as a **separate static CLI-focused demo** or add a static form that posts to CLI? Not feasible. Stick to static renderer only; add explanatory text instead. |
| **SSRF/Provider config** | Security | Medium | Low | High | 4 env vars only; `PROVIDER_ALLOWED_HOSTS` is code. Already gated. | **Mitigate:** Preserve this posture; any new endpoint must stay allowlisted (code, not env). |
| **Third-party reproducibility claim** | Business/Reliability | High | Medium | High | “No third-party run yet…” is disclosed. | **Mitigate:** Publish a short “Reproducibility checklist” in `docs/value-proof.md`: exact commit, corpus SHA (or build steps), `bun run ci` result, gate PASS, and how to rerun red team. This prepares third-party validation without overclaiming. |
| **Adding real corpus (Bukhari/Muslim Arabic)** increases size/licensing burden** | Technical/Security (licensing) | High | Medium | High | Licensing risk if non-licence-clean added. | **Mitigate:** **Only add CC0/public-domain Arabic editions**. Do not include English translations without explicit open licence. Record licence per collection in ingestion metadata; enforce via G-5 (licence + reason if disabled). |
| **Effect beta pin** | Technical | Medium | Medium | Medium | `4.0.0-beta.83` contained in one adapter (`src/schema/decode.ts`). | **Mitigate:** Keep seam tight; document pin in ADR; avoid spreading beta API. No runtime Effect adoption. |
| **No embeddings/vector store (good)** | Cost/Security | Low | Low | Low | Aligned with LLM09; cheaper. | **Mitigate:** Maintain §9 constraint (verify has no deps except `@mizan/core`). Do not introduce fuzzy/semantic paths. |

## 4. Epics with Success Metrics
| Epic | Goal | Scope (MoSCoW) | Success Metrics | Dependencies | Risk Level |
|---|---|---|---|---|---|
| **E1: Value Framing & Demo Clarity** | Make the “verification, not answering” value proposition unambiguous to judges; fix live-demo perception. | Must | - README `docs/value-proof.md` updated with **91% vs 39% support-gap** line (cited). - `docs/demo-runbook.md` states live-keyed demo first, clearly labels LIVE vs PRECOMPUTED. - Demo setup shows pre-set key in env. | None | High |
| **E2: Corpus Scope (Bukhari/Muslim) — Honest Resolution** | Close the two most-asked canonical gaps with a **licence-clean** path or a defensible disclosed scope. | Must | - Decision recorded (A or B) in an **ADR**. - If (A): Bukhari+Muslim Arabic public-domain added; English = `unavailable` with reason; ingest passes; corpus size/licence documented. G-5 satisfied. - If (B): README/value-proof state **translation-licence conflict** explicitly; scope line reads “4 Sunan + Muwatta + Qur’an (27,234 records); Bukhari/Muslim excluded due to English translation licensing constraints; Arabic public-domain editions may be considered if a clean ingest path exists.” | None | High |
| **E3: Paraphrase Terminology Alignment** | Document the already-mechanized locator and remove terminology inconsistency between “UNVERIFIABLE” and “REJECTED” for paraphrase cases. | Must | - `docs/anchor-protocol.md` updated with explicit mapping: exact-normalized containment fail → anchoredOutcome produces **REJECTED (no matching evidence)** when located but span differs; produces **UNVERIFIABLE** when evidence cannot be located. - `README.md` has one clear sentence. - No code change (mechanism exists). | E1 | Medium |
| **E4: Benchmark Hardening & Transparency** | Strengthen weakest link without overclaiming; add anti-tautology disclosure and third-party-readiness notes. | Should | - `docs/value-proof.md` adds: (a) **golden set is self-derived** (not human labels), (b) **anti-tautology note** (executor does not import verifier verdicts as input; separation enforced), (c) **n=40 self-authored** red team, (d) **third-party run planned**. - README disclaimer unchanged/strengthened. | E1 | Medium |
| **E5: Tafsir/Multilingual Boundary Documentation** | Make boundaries explicit and testable in docs. | Should | - `docs/value-proof.md` and `docs/demo-runbook.md` state: **tafsirLookup returns `unavailable` (no backend in release)**; multilingual UI not implemented. - No runtime change. | None | Medium |
| **E6: Minimal Static Web Clarity** | Add a tiny explanatory note to `apps/web/index.html` (compliant with ADR-C3). | Could | - `index.html` adds ≤10 lines: “Static renderer only (no input). Use CLI: `bun run ask`. See README for demo.” — no script, no innerHTML. - 29 web tests still pass. | None | Low |
| **E7: Third-Party Reproducibility Kit** | Publish a concrete checklist so anyone can reproduce results. | Could | - `docs/value-proof.md` adds **Reproducibility checklist**: commit SHA, corpus build (`bun run ingest`), `bun run ci:gates` PASS, `bun run check:docs` OK, red team counts, how to run live vs replay. | E1,E4 | Low |

## 5. Security Requirements (explicit)
**Relevant OWASP categories** (LLM context + classic): 
- **LLM07 Misinformation** — primary; fail-closed (`unverifiable`/`rejected`), no fabricated verdicts. Single verified route (§9). 
- **CWE-345 Insufficient Verification of Data Authenticity** — addressed by strict containment + anchor arm + gates G-6 (one construction site). 
- **A03 Injection (server-side)** — CLI only, no server; corpus ingestion is file-based, schemas at boundaries. gitleaks G-4 enforced. 
- **SSRF (A10)** — `PROVIDER_ALLOWED_HOSTS` is **code-only** (`api.openai.com`), https required, redirects refused; no user-controlled URLs to external fetchers. 
- **Data Exposure** — logs/traces/ledger carry **only hashes** (§13), never question/corpus text/PII. 
- **Access Control/Auth** — provider key via env only (4 vars); `.env` ignored. No auth surface in web (static). 

**Data sensitivity:** low (canonical Islamic texts, public/open where used). Licensing sensitivity **high** if corpus expanded. 

**Auth model:** n/a (local CLI; provider uses bearer key via env). 

## 6. Reliability Requirements (explicit)
- **Error handling strategy:** `Result<T,E>` at every boundary; no `throw` crosses packages. Early returns, no `else`. Fail-closed default. 
- **Timeout expectations:** provider 30s timeout; verification timeouts yield `unverifiable`. CLI/demo timeouts documented. 
- **Retry behavior:** **none** in verifier (deterministic). Provider calls: not specified in verifier; retries are provider/host layer concern; never retry in a way that masks verification failures. 
- **Honest degradation table (must follow §16):** provider down → `model unavailable`; corpus miss → `no sources found`; verification timeout/malformed → `unverifiable`; anchor uncertainty → `unverifiable`/`rejected` as specified; ledger write failure → untrusted; attestation mismatch → integrity error (no verdict). 
- **Determinism:** byte-identical verdicts across runs (G-6 enforces). 

## 7. Observability Requirements
- **Metrics:** run outcomes counts by verdict (`verified/unverifiable/rejected`), red-team false-verified delta, benchmark hit rates, anchor arm activation counts (26 cases published), gate PASS/FAIL per package, CI duration. 
- **Logs:** structured, only hashes (questionHash), no content. Provider errors logged as codes/types only. 
- **Traces:** run trace carries hashes; attestation chain hashes only. Ledger entries hash-based. 
- **Operational visibility:** `bun run ci:gates` and `bun run check:docs` are the health checks; `bun run benchmark` produces committed artefacts with machine-backed figures. 

## 8. Architecture Decision Records (ADRs)
Record key decisions (Proposed/Accepted as appropriate). 

**ADR-01: Keep strict containment as sole verified route (ADR-03 preserved)**
- **Context:** Field trend toward fuzzy/embedding (BurhanAI 66.56% correction accuracy) creates fabrication-acceptance risk.
- **Decision:** Retain `MatchStrength = {kind:"exact",percent:100} | {kind:"none"}`; no third shape. Fuzzy only in display-only diagnostics.
- **Rationale:** Fail-closed; matches CWE-345 control. External research validates this choice.
- **Consequences:** Lower recall on heavy paraphrase, offset by **honest refusal** and published trade-off. 
- **Status:** Accepted (existing).

**ADR-02: Static web UI (no script) — ADR-C3 preserved**
- **Context:** Interactive UI would improve demo perception but introduces script surface and conflicts with §11.
- **Decision:** Keep `apps/web/index.html` as static text-node renderer (no `<script>`, no innerHTML). Add minimal explanatory text only.
- **Rationale:** Security posture, simplicity, passes 29 tests, G-2 enforced.
- **Consequences:** No live input in web; demos must use CLI (live-keyed). 
- **Status:** Accepted (existing, reaffirmed).

**ADR-03: Bukhari/Muslim corpus scope — licence-clean path**
- **Context:** Two canonical collections absent; user wants answer. Market expects Bukhari/Muslim.
- **Decision (Proposed):** Implement **Path A**: ingest **public-domain Arabic** editions of Bukhari/Muslim (CC0); for each record, populate Arabic text; set `englishText`, `englishGrade` etc. to `unavailable` (typed) with `license` = “public-domain” and `licenseNote = "English translation not included due to licensing; only Arabic public-domain edition ingested"`. Do **not** ingest English translations without open licence.
- **Alternatives:** (B) Keep scope as-is and document translation-licence conflict (honest, lower effort, no size/licence work).
- **Rationale:** Closes judge question while respecting licensing; matches i-muslim/sunnah.com observed pattern. 
- **Consequences:** Corpus grows; G-5 must validate per-collection licence; tests updated for new counts; `value-proof.md` scope updated. English remains `unavailable` in product (product behavior unchanged for English surface except scope disclosure). 
- **Status:** Proposed (choose A or B in E2).

**ADR-04: Demo live/replay labeling**
- **Context:** Perception gap: default `hosted` but no key → PRECOMPUTED.
- **Decision (Proposed):** In all demo scripts, **require `MIZAN_LLM_API_KEY` set** before live demo step; `docs/demo-runbook.md` labels both modes explicitly and puts live first. 
- **Rationale:** Removes ambiguity; honest. 
- **Consequences:** Demo environment needs key (documented). Replay remains fallback. 
- **Status:** Proposed.

**ADR-05: Paraphrase outcome terminology**
- **Context:** 26 cases show REJECTED vs UNVERIFIABLE inconsistency.
- **Decision (Proposed):** Codify mapping: **REJECTED = located but no matching evidence under containment+anchor rules** (divergent span/quote); **UNVERIFIABLE = cannot locate evidence / malformed/insufficient**. Update docs accordingly (no code change needed; mechanism is anchoredOutcome).
- **Rationale:** Consistency, defensible. 
- **Consequences:** Docs-only; tests unchanged. 
- **Status:** Proposed.

**ADR-06: Benchmark transparency (preserve self-referential disclosure)**
- **Context:** Golden 100% self-referential; red team 40 self-authored.
- **Decision (Proposed):** **Do not change benchmark logic**; add explicit anti-tautology and provenance notes in `docs/value-proof.md` and keep README disclaimer. Do not overstate external validity.
- **Rationale:** Honest; changing logic risks invalidating gates; cannot fix without human labels. 
- **Consequences:** Weakest link remains disclosed; value claim shifts to 91%-vs-39% support-gap (external). 
- **Status:** Proposed.

## 9. Sprint Backlog (prioritized, estimated, risk-assessed)
Constraints: ≤10 user stories, 1–2 sprints max.

| ID | Story | Type | Priority | Est (S/M/L/XL) | Risk | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|---|---|
| **S1** | Update `docs/value-proof.md` with **91% vs 39% support-gap** (Tow/AI-Overviews 2025–26) and citation. | Docs | Must | S | Low | None | Line added with sources; `bun run check:docs` still OK. |
| **S2** | Update `docs/demo-runbook.md`: live-keyed demo first; explicit **LIVE (hosted)** vs **PRECOMPUTED (replay)** labeling; demo setup requires key. | Docs | Must | S | Low | None | Runbook matches new flow; `check:docs` OK. |
| **S3** | Decide Bukhari/Muslim path (ADR-03) and implement choice in docs + (if A) corpus ingest/licence notes. | Feature+Docs | Must | M | High | None | ADR-03 finalized with chosen path; scope line updated in README+value-proof; G-5 passes; if (A) counts documented. |
| **S4** | Align paraphrase terminology in `docs/anchor-protocol.md` and README per ADR-05 (mapping REJECTED vs UNVERIFIABLE). | Docs | Must | S | Low | None | Mapping explicit; consistent across both docs; `check:docs` OK. |
| **S5** | Add benchmark transparency notes (self-derived, anti-tautology, n=40, third-party planned) per ADR-06 in `docs/value-proof.md`. | Docs | Should | S | Low | S1 | Notes present; no benchmark logic changed; tests pass. |
| **S6** | Document tafsir/multilingual boundaries in `docs/value-proof.md` and `docs/demo-runbook.md`. | Docs | Should | S | Low | None | States tafsir returns `unavailable` (no backend), multilingual UI not implemented. |
| **S7** | Add minimal static explanatory note to `apps/web/index.html` (≤10 lines, no script, no innerHTML). | UI (static) | Could | XS | Low | None | 29 web tests still pass; compliant with ADR-C3. |
| **S8** | Add “Reproducibility checklist” to `docs/value-proof.md`. | Docs | Could | S | Low | S5 | Checklist complete; `check:docs` OK. |
| **S9** | (Optional guard) Add README cross-reference noting anchor mechanism is step 5b and published movement numbers (already true) — reinforce clarity. | Docs | Could | XS | Low | S4 | Readable, no duplication. |

**Sprint assignment:** **Sprint 1** = S1–S4 (Musts). **Sprint 2** (if time) = S5–S9 (Should/Could). Total 9 stories ≤10.

## Final Answer (structured)
I’ve kept implementation details out (no code), focused on WHAT/WHY, included Security/Reliability explicitly, and written ADRs plus prioritized backlog. The weakest link (benchmark self-referentiality) is preserved but **transparently disclosed**; the strongest value claim (support-gap) is now externally grounded. 

Here is the full handoff: 

---

# 10. Handoff Summary (next phase)
Next phase (PM/SE planning) should execute Sprint 1 (S1–S4) first. Choose ADR-03 path (A or B) early — that’s the highest business risk item. Demo environment must be prepared with a live key for E1. No code changes required for S4–S9; S3 may involve ingest/licence work if Path A.

(See handoff JSON block below.)

--- 

Here is the fact memory block (up to 3 durable facts): 

```json
{"office_fact_memory":[{"fact":"mizan's value is best framed as citation verification addressing a ~60-point support gap: external audits show 91% of answers correct but only ~39% fully supported (Tow/AI-Overviews 2025-26), while the verifier enforces fail-closed strict containment with published false-verify 0 on red team (40 cases).","phase":"ceo","evidence":"Tow Center 2025 citation study (>60% mis-cited across 8 tools), AI-Overviews claim-fidelity 2025-26 (91% vs 39%), BurhanAI field accuracy 66.56% validating strict containment choice.","confidence":0.93},{"fact":"Bukhari/Muslim absence is a translation-licence constraint, not omission: Arabic editions are public domain (CC0) but common English translations are copyrighted; licence-clean path is Arabic-only ingest with English marked unavailable, or explicitly disclose scope as 4 Sunan + Muwatta + Qur'an (27,234).","phase":"ceo","evidence":"i-muslim CC0 Arabic model pattern; sunnah.com API/licence considerations; fawazahmed0 hadith-api mirror excluded for licensing reasons (G-5).","confidence":0.90},{"fact":"Paraphrase handling is already mechanized via anchoredOutcome (step 5b) producing REJECTED vs UNVERIFIABLE by locator outcome; documentation inconsistency (26 cases) is the remaining fix (no code change required).","phase":"ceo","evidence":"packages/mizan-verify/src/verify.ts:245 anchoredOutcome; docs/anchor-protocol.md redTeamMovement counts (rejectedToUnverifiable 40).","confidence":0.95}]}
``` 

Here is the required handoff JSON block:# Final Handoff Block

```json
{
  "executiveSummary": "This is a Bun 1.3.14 monorepo whose product is a citation verifier (not answer generator) enforced by 7 machine-checked structural gates (G-1..G-7). External audits show 8 major tools have >60% mis-cited queries and only ~39% of answers fully supported; mizan addresses that ~60-point support-gap with fail-closed strict containment (published false-verify 0 on 40-case red team). Current state on HEAD: web UI static/compliant, provider defaults to hosted, paraphrase divergence mechanized via anchor arm, golden-100% self-referentiality is disclosed. Two real gaps remain: Bukhari/Muslim (translation-licence conflict) and tafsir/multilingual (declared boundaries). The plan reframes value as verification (not answering), fixes demo perception with live-keyed labeling, resolves Bukhari/Muslim via licence-clean Arabic-only ingest or explicit scope disclosure, aligns paraphrase terminology (docs-only), hardens benchmark transparency (no logic change), documents boundaries, and keeps web static. Sprint 1 (Musts: S1–S4), Sprint 2 (Should/Could). No code changes for most; potential ingest if Path A chosen.",
  "moscow": {
    "must": [
      "Explicitly frame value as verification vs answering and publish 91% vs 39% support-gap in docs/value-proof.md (Tow/AI-Overviews 2025–26).",
      "Fix demo perception: require live-keyed demo first in docs/demo-runbook.md with explicit LIVE (hosted) vs PRECOMPUTED (replay) labeling.",
      "Handle Bukhari/Muslim honestly: choose licence-clean Path A (Arabic-only public-domain Bukhari/Muslim, English unavailable) or Path B (disclose translation-licence conflict and keep scope as 4 Sunan + Muwatta + Qur'an).",
      "Align paraphrase terminology in docs/anchor-protocol.md and README (REJECTED when located but divergent under rules; UNVERIFIABLE when cannot locate/insufficient) — mechanism already exists."
    ],
    "should": [
      "Add benchmark transparency notes in docs/value-proof.md (self-derived golden set, anti-tautology, n=40 self-authored red team, third-party run planned).",
      "Document tafsir/multilingual boundaries (tafsir returns unavailable with no backend in release; multilingual UI not implemented)."
    ],
    "could": [
      "Add minimal static explanatory note to apps/web/index.html (≤10 lines, no script, no innerHTML).",
      "Add Reproducibility checklist to docs/value-proof.md.",
      "Add README cross-reference reinforcing anchor arm (step 5b) and published movement numbers."
    ],
    "wont": [
      "Add fuzzy/semantic verification (ADR-03 preserved).",
      "Convert web to interactive with JS (ADR-C3 preserved; §11).",
      "Add embeddings/LLM-as-judge paths in verifier (G-1/§9).",
      "Implement tafsir backend (declare boundary)."
    ]
  },
  "riskRegister": [
    {
      "risk": "Reviewer argument: “any search tool does it” persists",
      "category": "Business",
      "severity": "High",
      "likelihood": "High",
      "impact": "High",
      "mitigation": "Update README/docs/value-proof.md with 91% vs 39% support-gap and position as verifier (support-gap) + adjudicated per-claim verdict."
    },
    {
      "risk": "Bukhari/Muslim gap remains visible",
      "category": "Business/Technical",
      "severity": "High",
      "likelihood": "High",
      "impact": "High",
      "mitigation": "Path A: Arabic-only CC0 Bukhari/Muslim ingest, English marked unavailable with reason; G-5 enforces. Path B: explicit translation-licence conflict disclosure in docs."
    },
    {
      "risk": "Demo perception (replay vs live)",
      "category": "Product/Reliability",
      "severity": "High",
      "likelihood": "High",
      "impact": "High",
      "mitigation": "docs/demo-runbook.md requires live-keyed demo first; labels LIVE (hosted) vs PRECOMPUTED (replay) clearly."
    },
    {
      "risk": "Paraphrase/locator inconsistency perception",
      "category": "Technical/Reliability",
      "severity": "Medium-High",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Document mapping: REJECTED = located but no matching evidence under rules; UNVERIFIABLE = cannot locate evidence/insufficient (docs-only)."
    },
    {
      "risk": "Benchmark self-referentiality",
      "category": "Technical/Reliability",
      "severity": "High",
      "likelihood": "High",
      "impact": "Medium",
      "mitigation": "Disclose self-derived golden set (not human labels), anti-tautology (executor doesn’t import verifier verdicts), n=40 self-authored red team, third-party run planned. No logic change."
    },
    {
      "risk": "Tafsir/multilingual deferred",
      "category": "Product",
      "severity": "Medium",
      "likelihood": "High",
      "impact": "Medium",
      "mitigation": "Declare boundaries: tafsirLookup returns unavailable with no backend in release; multilingual UI not implemented."
    },
    {
      "risk": "UI becomes interactive (security violation)",
      "category": "Security",
      "severity": "Critical",
      "likelihood": "Low",
      "impact": "High",
      "mitigation": "Do not add interactive JS. Only minimal static explanatory text if added."
    },
    {
      "risk": "SSRF/Provider config drift",
      "category": "Security",
      "severity": "Medium",
      "likelihood": "Low",
      "impact": "High",
      "mitigation": "Preserve 4 env vars; PROVIDER_ALLOWED_HOSTS code-only (api.openai.com), https required, redirects refused."
    },
    {
      "risk": "Third-party reproducibility unproven",
      "category": "Business/Reliability",
      "severity": "High",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Add Reproducibility checklist (commit, corpus build, ci:gates/check:docs PASS, red team counts, live/replay run)."
    },
    {
      "risk": "Corpus expansion licensing (Bukhari/Muslim)",
      "category": "Technical/Security",
      "severity": "High",
      "likelihood": "Medium",
      "impact": "High",
      "mitigation": "Only add CC0/public-domain Arabic; no English without open licence. Record per-collection licence in ingest; enforce via G-5."
    }
  ],
  "epics": [
    {
      "id": "E1",
      "goal": "Make verification value proposition unambiguous and fix live-demo perception.",
      "scope": { "must": true },
      "successMetrics": [
        "docs/value-proof.md includes 91% vs 39% support-gap line with citation.",
        "docs/demo-runbook.md puts live-keyed demo first and labels LIVE vs PRECOMPUTED.",
        "Demo setup shows pre-set key in env."
      ],
      "dependencies": [],
      "riskLevel": "High"
    },
    {
      "id": "E2",
      "goal": "Resolve Bukhari/Muslim gap via licence-clean path or defensible disclosed scope.",
      "scope": { "must": true },
      "successMetrics": [
        "ADR-03 finalized (Path A or B).",
        "If A: Arabic Bukhari/Muslim added with English unavailable and licence notes; ingest passes; G-5 satisfied.",
        "If B: README/value-proof state translation-licence conflict explicitly and scope reads as specified."
      ],
      "dependencies": [],
      "riskLevel": "High"
    },
    {
      "id": "E3",
      "goal": "Align paraphrase terminology (docs-only) to match mechanized anchor arm.",
      "scope": { "must": true },
      "successMetrics": [
        "docs/anchor-protocol.md has explicit mapping (REJECTED vs UNVERIFIABLE).",
        "README has one clear sentence.",
        "No code change; check:docs OK."
      ],
      "dependencies": ["E1"],
      "riskLevel": "Medium"
    },
    {
      "id": "E4",
      "goal": "Harden benchmark transparency without overclaiming.",
      "scope": { "should": true },
      "successMetrics": [
        "docs/value-proof.md adds: self-derived golden set, anti-tautology note, n=40 self-authored, third-party run planned.",
        "README disclaimer unchanged/strengthened.",
        "No benchmark logic changed; tests pass."
      ],
      "dependencies": ["E1"],
      "riskLevel": "Medium"
    },
    {
      "id": "E5",
      "goal": "Document tafsir/multilingual boundaries explicitly.",
      "scope": { "should": true },
      "successMetrics": [
        "docs/value-proof.md and docs/demo-runbook.md state tafsir returns unavailable (no backend) and multilingual UI not implemented.",
        "No runtime change."
      ],
      "dependencies": [],
      "riskLevel": "Medium"
    },
    {
      "id": "E6",
      "goal": "Add minimal static explanatory note to apps/web/index.html.",
      "scope": { "could": true },
      "successMetrics": [
        "index.html adds ≤10 lines (no script, no innerHTML).",
        "29 web tests still pass; ADR-C3/G-2 satisfied."
      ],
      "dependencies": [],
      "riskLevel": "Low"
    },
    {
      "id": "E7",
      "goal": "Publish Reproducibility checklist in docs/value-proof.md.",
      "scope": { "could": true },
      "successMetrics": [
        "Checklist present (commit, corpus build, ci:gates PASS, check:docs OK, red team counts, live/replay).",
        "check:docs OK."
      ],
      "dependencies": ["E1", "E4"],
      "riskLevel": "Low"
    }
  ],
  "sprintBacklog": [
    {
      "id": "S1",
      "story": "Update docs/value-proof.md with 91% vs 39% support-gap and citation (Tow/AI-Overviews 2025–26).",
      "type": "Docs",
      "priority": "Must",
      "est": "S",
      "risk": "Low",
      "dependencies": [],
      "acceptanceCriteria": ["Line added with sources; bun run check:docs still OK."]
    },
    {
      "id": "S2",
      "story": "Update docs/demo-runbook.md: live-keyed demo first; explicit LIVE (hosted) vs PRECOMPUTED (replay) labeling; setup requires key.",
      "type": "Docs",
      "priority": "Must",
      "est": "S",
      "risk": "Low",
      "dependencies": [],
      "acceptanceCriteria": ["Runbook matches new flow; check:docs OK."]
    },
    {
      "id": "S3",
      "story": "Decide Bukhari/Muslim path (ADR-03) and implement choice in docs + (if A) corpus ingest/licence notes.",
      "type": "Feature+Docs",
      "priority": "Must",
      "est": "M",
      "risk": "High",
      "dependencies": [],
      "acceptanceCriteria": [
        "ADR-03 finalized with chosen path.",
        "Scope line updated in README+value-proof; G-5 passes.",
        "If A: counts/licence documented."
      ]
    },
    {
      "id": "S4",
      "story": "Align paraphrase terminology in docs/anchor-protocol.md and README per ADR-05 (REJECTED vs UNVERIFIABLE mapping).",
      "type": "Docs",
      "priority": "Must",
      "est": "S",
      "risk": "Low",
      "dependencies": [],
      "acceptanceCriteria": ["Mapping explicit; consistent across both docs; check:docs OK."]
    },
    {
      "id": "S5",
      "story": "Add benchmark transparency notes (self-derived, anti-tautology, n=40, third-party planned) in docs/value-proof.md per ADR-06.",
      "type": "Docs",
      "priority": "Should",
      "est": "S",
      "risk": "Low",
      "dependencies": ["S1"],
      "acceptanceCriteria": ["Notes present; no benchmark logic changed; tests pass."]
    },
    {
      "id": "S6",
      "story": "Document tafsir/multilingual boundaries in docs/value-proof.md and docs/demo-runbook.md.",
      "type": "Docs",
      "priority": "Should",
      "est": "S",
      "risk": "Low",
      "dependencies": [],
      "acceptanceCriteria": ["States tafsir returns unavailable (no backend), multilingual UI not implemented."]
    },
    {
      "id": "S7",
      "story": "Add minimal static explanatory note to apps/web/index.html (≤10 lines, no script, no innerHTML).",
      "type": "UI (static)",
      "priority": "Could",
      "est": "XS",
      "risk": "Low",
      "dependencies": [],
      "acceptanceCriteria": ["29 web tests still pass; compliant with ADR-C3."]
    },
    {
      "id": "S8",
      "story": "Add Reproducibility checklist to docs/value-proof.md.",
      "type": "Docs",
      "priority": "Could",
      "est": "S",
      "risk": "Low",
      "dependencies": ["S5"],
      "acceptanceCriteria": ["Checklist complete; check:docs OK."]
    },
    {
      "id": "S9",
      "story": "Add README cross-reference reinforcing anchor arm (step 5b) and published movement numbers.",
      "type": "Docs",
      "priority": "Could",
      "est": "XS",
      "risk": "Low",
      "dependencies": ["S4"],
      "acceptanceCriteria": ["Readable, no duplication."]
    }
  ],
  "adrs": [
    {
      "id": "ADR-01",
      "title": "Keep strict containment as sole verified route (ADR-03 preserved)",
      "context": "Field trend toward fuzzy/embedding creates fabrication-acceptance risk (66.56% correction accuracy).",
      "decision": "Retain MatchStrength = {kind:'exact',percent:100} | {kind:'none'}; no third shape. Fuzzy only display-only.",
      "rationale": "Fail-closed; CWE-345 control; externally validated.",
      "consequences": "Lower recall on heavy paraphrase offset by honest refusal and published trade-off.",
      "status": "Accepted"
    },
    {
      "id": "ADR-02",
      "title": "Static web UI (no script) — ADR-C3 preserved",
      "context": "Interactive UI improves perception but adds script surface and conflicts with §11.",
      "decision": "Keep apps/web/index.html as static text-node renderer (no script, no innerHTML); add minimal explanatory text only.",
      "rationale": "Security posture, simplicity, passes 29 tests, G-2 enforced.",
      "consequences": "No live input in web; demos use CLI (live-keyed).",
      "status": "Accepted"
    },
    {
      "id": "ADR-03",
      "title": "Bukhari/Muslim corpus scope — licence-clean path",
      "context": "Canonical Sunni collections missing; translation-licence conflict.",
      "decision": "Proposed Path A: ingest CC0 Arabic Bukhari/Muslim only; English marked unavailable with licenceNote. Do not ingest English without open licence.",
      "rationale": "Closes judge question while respecting licensing; matches i-muslim pattern.",
      "consequences": "Corpus grows; G-5 validation; tests updated; scope disclosure updated.",
      "status": "Proposed"
    },
    {
      "id": "ADR-04",
      "title": "Demo live/replay labeling",
      "context": "Default hosted but no key → PRECOMPUTED (perception gap).",
      "decision": "docs/demo-runbook.md requires MIZAN_LLM_API_KEY set before live demo; labels LIVE (hosted) vs PRECOMPUTED (replay); live first.",
      "rationale": "Removes ambiguity; honest.",
      "consequences": "Demo env needs key; replay remains fallback.",
      "status": "Proposed"
    },
    {
      "id": "ADR-05",
      "title": "Paraphrase outcome terminology",
      "context": "26 cases show REJECTED vs UNVERIFIABLE inconsistency.",
      "decision": "REJECTED = located but no matching evidence under containment+anchor rules; UNVERIFIABLE = cannot locate evidence/insufficient (docs-only).",
      "rationale": "Consistency, defensible.",
      "consequences": "Docs-only; tests unchanged.",
      "status": "Proposed"
    },
    {
      "id": "ADR-06",
      "title": "Benchmark transparency (preserve self-referential disclosure)",
      "context": "Golden 100% self-referential; red team 40 self-authored.",
      "decision": "Do not change benchmark logic; add explicit anti-tautology and provenance in docs/value-proof.md; keep README disclaimer; do not overstate external validity.",
      "rationale": "Honest; cannot fix without human labels.",
      "consequences": "Weakest link disclosed; value claim shifts to 91%-vs-39% support-gap.",
      "status": "Proposed"
    }
  ]
}
```

## Architecture
(no architecture)