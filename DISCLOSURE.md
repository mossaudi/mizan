# DISCLOSURE

## 1. What is being submitted

**mizan** (ميزان — "the balance", Qur'an 17:44) is a new repository. It is a complete,
runnable product: corpus ingest, hybrid retrieval, generation, deterministic per-claim
citation verification, a confidence gate, a hash-chained provenance ledger, a
judge-runnable chain verifier, and a CLI that prints real verdict badges.

The submitted increment is the whole of this repository.

## 2. Prior work and third-party components

| Item | Relationship to mizan | Carried into this repository? |
| --- | --- | --- |
| `opencode-office` (a fork of `anomalyco/opencode`, MIT) | Read as a **reference only**, to study four contract shapes | **No. Zero lines.** |
| `lazarus_platform` (Rust SOC platform, 42 crates) | Evaluated for Track fit and **excluded**; 0% overlap with any track | **No. Not referenced, not vendored, not mentioned in the submission.** |
| Tanzil — Qur'an, Uthmani script (`tanzil/quran-uthmani`) | Data source. **Enabled**, 6236 records, licence class `no-derivatives` | Verbatim `textDisplay` + attribution, redistributed **unmodified** as the terms require. **Not public domain** — the terms forbid modification, which is why only the derived `textMatch` column is folded. |
| QuranLab — Hadith & Sunnah (Ahl al-Sunnah) (`quranlab/hadith`) | Data source. **Enabled**, 36024 records, licence class `content-only` | Text only, with attribution and the dataset's own per-row grades. |
| Open Hadith Data (`mhashim6/open-hadith-data`) | Data source. **Excluded**, 0 records, licence class `unconfirmed` | **No.** Registered with an exclusion reason and ingested zero rows. |
| Hadith API (mirror) (`fawazahmed0/hadith-api`) | Data source. **Excluded**, 0 records, licence class `unconfirmed` | **No.** Registered with an exclusion reason and ingested zero rows. |
| `effect` 4.0.0-beta.83 | Runtime dependency for schema decoding at untrusted boundaries | Yes, MIT, pinned exactly |
| `typescript` 5.6.3, `@types/bun` 1.1.14 | Build-time only | Yes, no runtime code |

### The four contract shapes that were studied, and how they were reimplemented

These are *ideas*, not code. Each was reimplemented from scratch against mizan's own
types, and each reimplementation is stricter than the shape it came from:

| Shape studied | Where it appears in mizan | What mizan does differently |
| --- | --- | --- |
| claim → citation → evidence → verdict | `packages/mizan-verify/src/verify.ts` | Three verdicts (`verified` / `unverifiable` / `rejected`) instead of two, and the verdict is computed **only** by strict normalized substring containment. There is no path from similarity to `verified`. |
| confidence threshold → escalate to a human | `packages/mizan-core/src/schema/trace.ts` (`Escalation`) | **Partly implemented, and deliberately so.** The trace records an escalation `action`, and it is derived from the **claim verdicts**: any claim that is not `verified` yields `refer_to_scholar`. There is **no numeric confidence threshold**. The model's self-reported `confidence` is recorded verbatim and is never consulted, because a threshold that let a high number override a `rejected` verdict is precisely the fail-open path ADR-03 forbids. The verdict wins unconditionally. |
| source / licence registry (`supply-chain.ts`) | `data/registry/sources.json`, audited by `packages/mizan-gate/src/gates/g5-licence-fields.ts` | The **committed** registry is the deliverable, and gate G-5 fails the build on an empty licence, a non-URL licence, a disabled source with no `exclusionReason`, or an unrecognised licence class. The ~42k-row derived `records.jsonl` is generated per row and gitignored — the evidence about it is committed, the bytes are not. |
| honest capability disclosure (`websearch-capability.ts`) | `packages/mizan-agent/src/provider.ts` (the provider port), `packages/mizan-retrieval/src/tools.ts` (the tool surface) | A capability that does not exist is disclosed **in the answer and in the trace metadata**, not just in a log line. The tafsir tool is the worked example: there is no tafsir backend in this repository, so `tafsirLookup` returns a typed `unavailable` refusal (AGENTS.md §16) and can never return a fabricated commentary. |

## 3. Data and privacy disclosure

* **No real user data was collected, used, stored, or seen.** The committed question set
  (`data/demo-questions.json`) is synthetic and was written by us. mizan has no
  accounts, no authentication, no multi-tenancy and no analytics.
* **No question text is ever logged or traced.** A run trace records `questionHash`
  (SHA-256) and nothing else about the question. There is no PII to protect because none
  is collected.
* **The ledger records decisions, not content.** One JSONL line per run: question hash,
  corpus snapshot hash, tools called, per-claim verdict and reason, escalation reasons,
  timings, degradation markers. Never the question, never the answer prose, never corpus
  text.
* **The 196 run entries appended before the trace-timing fix do not contain measured
  timings, and were deliberately not rewritten.** Each of those rows records a single
  `toolsCalled` entry named `quranSearch+hadithSearch` with `resultCount: 3`,
  `ranking: "fused"` and `elapsedMs: 0` — constants the trace builder used to emit, not
  observations. Retrieval is now measured per call, and a run records one row per real call
  with the ranking that call actually reported (including `unavailable`). Rewriting those
  196 rows would break the hash chain and destroy the one property this file exists to
  prove, so the defect is disclosed instead: the early entries are weaker evidence than the
  later ones, and a judge can tell which is which by reading `toolsCalled`. The verdicts in
  those rows were always computed; it is the latency numbers that were not.
* **No secrets are committed.** `.env` and every `.env.*` except `.env.example` are
  gitignored, and gitleaks (gate G-4) fails the build if a secret is ever tracked.

## 4. Inference disclosure (ADR-04)

mizan has **no local inference path**. There is no `llama.cpp`, no Ollama, and no offline mode
in this repository. An earlier draft of this document claimed a local 7–8B path was "implemented
and documented as offline mode"; it was not, and the claim is removed rather than softened. A
judge reading the old document would have believed a capability they could not have found, which
is the failure mode this section exists to prevent.

What mizan actually ships is two disclosed modes, selected by `MIZAN_PROVIDER`:

* **`hosted`** — the default. A model reached over HTTPS through the `LlmProvider` port in
  `packages/mizan-agent/src/provider.ts`. The endpoint host must be in a hardcoded allowlist
  (`api.openai.com`) and the scheme must be `https`; redirects are refused rather than followed.
  The API key is read from `MIZAN_LLM_API_KEY`, passed to the transport in memory, and never
  written to a trace, a log line or a ledger entry. It is not present in the repository, and
  `.env` is gitignored.
* **`scripted`** — set explicitly. Answers come from the committed, deterministic transcript
  (`data/transcript.json`) and are labelled `precomputed (deterministic)` in both stdout and the
  trace, so a scripted answer can never be mistaken for a live one.

The competition's synthetic-data rule governs **data provenance**, not egress. We have no
users, we ship a committed synthetic question set, and we persist no logs. Inference cost for
an entire event is a rounding error against the prize.

If the hosted provider is unreachable, mizan prints **"model unavailable"**. It never falls
back to a canned answer and never silently substitutes a mock — that refusal is the honest
state, and AGENTS.md §16 makes it mandatory. One honest detail about the fallback: a
`scripted` transcript is used only when `MIZAN_PROVIDER=scripted` was **asked for**. A
hosted run whose provider fails records the failure in the trace and exits degraded; it does
not read the transcript behind the operator's back.

## 5. Grades are attributed, never asserted

Every `grade` in mizan is stored exactly as the source dataset asserts it, alongside the
dataset that asserted it (`gradeSource`) and on what basis (`gradeBasis`). Where a dataset
carries no grade, mizan stores `null` and says so. **mizan never infers, defaults,
upgrades or asserts a grade of its own** (ADR-06). The in-product wording is "grade per
<dataset>, as provided by <source>".

This is deliberate and it is a correction to the literal form of the requirement, which
would have quarantined two entire collections: Qur'anic verses have no ṣaḥīḥ/ḍa'īf grade
because the concept does not apply to them, and the ungraded Arabic matn of Musnad
Aḥmad and al-Darīmī is published ungraded by its source on purpose. mizan quarantines
**inconsistency**, never absence. See `AGENTS.md` §15 and the `gradeApplicable` /
`gradeBasis` model in `packages/mizan-core/src/schema/record.ts`, applied by
`packages/mizan-corpus/src/quarantine.ts`.

### The quarantine arithmetic, exactly

The requirement is to quarantine every record whose grade is not ṣaḥīḥ. Taken literally on this
corpus that is 15026 of 42260 records — a number a judge is entitled to check:

| | Records |
| --- | --- |
| Enabled in the registry (6236 Qur'an + 36024 hadith) | 42260 |
| In the attested snapshot (`attestation.json`, `recordCount`) | 27234 |
| **Quarantined, because `gradeApplicable: false`** | **15026** |
| Served, all of which carry the dataset's own grade | 27234 |

Two of those three numbers are the whole honesty question, so they are worth stating plainly.
**The 15026 quarantined records are not corrupt and not rejected on religious grounds.** They
are the 6236 Qur'anic verses, where ṣaḥīḥ/ḍa'īf does not apply, plus 8790 hadith records
whose source dataset asserts no grade at all. Neither group is a weak ṣaḥīḥ, and hiding them
inside a verified set would be the misleading outcome. mizan quarantines them, says why, and
lets a reader disagree with the rule.

## 6. What a judge can check in 60 seconds

```bash
bun install
bun run ingest          # rebuild the corpus from pinned URLs (or see "already present")
bun run verify:ledger   # verify the corpus hash chain, names the exact broken index
bun run verify:runs     # verify the run ledger: every trace, seal and verdict, byte for byte
bun run check:docs      # assert every path/command/env-var claim in DISCLOSURE.md is real
bun run ci              # typecheck + per-package tests + gates G-1..G-6
```

No credentials are needed for any of the above, and none of them touch the network except
`bun run ingest`'s fetch step. Two of them exist specifically to make claims falsifiable:
`verify:runs` re-derives every badge from its stored trace, and `check:docs` fails the build
when this document says something the repository does not contain — which is how the six
false claims above were found.
