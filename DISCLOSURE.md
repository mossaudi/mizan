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
state, and AGENTS.md §16 makes it mandatory. The transcript is read in exactly **two**
situations, and in both the answer is labelled `PRECOMPUTED` on stdout and `precomputed` in
the trace, so a replay can never be read as live inference:

1. `MIZAN_PROVIDER=scripted` was asked for.
2. `MIZAN_PROVIDER=hosted` (the default) with **no `MIZAN_LLM_API_KEY` configured**.
   `.env.example` documents this and `apps/cli/src/provider-config.ts` implements it by
   resolving a keyless hosted run to the same scripted provider. A default checkout ships no
   key, so *this* is what an unconfigured run does — it is a labelled replay, not a claim of
   inference.

The third case is the one mizan refuses. A hosted run whose key **is** configured and whose
provider then **fails** records the failure in the trace and exits non-zero (degraded, or
untrusted if the failure also cost it the ledger append). It does not quietly replay the
transcript behind the operator's back. A key that exists plus an outage means something is
wrong, and answering from a recording would hide exactly that.

## 5. Grades are attributed, never asserted

Every `grade` in mizan is stored exactly as the source dataset asserts it, alongside the
dataset that asserted it (`gradeSource`) and on what basis (`gradeBasis`). Where a dataset
carries no grade, mizan stores `null` and says so. **mizan never infers, defaults,
upgrades or asserts a grade of its own** (ADR-06). The in-product wording is "grade per
<dataset>, as provided by <source>".

This is deliberate, and it is a correction to the literal form of the requirement. Applied
literally, "quarantine every record whose grade is not ṣaḥīḥ" would have quarantined all 6236
Tanzil verses, because a Qur'anic verse has no ṣaḥīḥ/ḍa'īf grade at all — the concept does
not apply to it. mizan quarantines **inconsistency**, never absence: a record is quarantined
when a grade **is required** (`gradeApplicable: true`) and the dataset **asserted none**. The
6236 verses are therefore served, and every ungraded hadith row in this build is quarantined
rather than served wearing a grade mizan made up. See `AGENTS.md` §15 and the
`gradeApplicable` / `gradeBasis` model in `packages/mizan-core/src/schema/record.ts`, applied
by `packages/mizan-corpus/src/quarantine.ts`.

### The quarantine arithmetic, exactly

All three numbers below are in `attestation.json`, and `bun run check:docs` fails the build
if this table stops stating them.

| | Records |
| --- | --- |
| Enabled in the registry (6236 Qur'an + 36024 hadith) | 42260 |
| **Quarantined: `gradeApplicable: true` and the dataset asserts no grade** | **15026** |
| Served — 6236 Qur'anic verses (`gradeApplicable: false`, no grade expected) + 20998 hadith | 27234 |

Two of those three numbers are the whole honesty question, so they are worth stating plainly.
**The 15026 quarantined records are not corrupt and not rejected on religious grounds, and all
15026 of them are hadith.** Every one is a row whose source dataset asserts no grade at all.
`quarantineReason` returns `null` — that is, *served* — when `gradeApplicable` is `false`, so
the 6236 Qur'anic verses are served, precisely because ṣaḥīḥ/ḍa'īf does not apply to them and
the `gradeApplicable` model exists to spare them for that reason. The other 20998 served rows
are hadith carrying exactly the grade their own dataset gave them, whatever it was.
36024 − 20998 = 15026.

The literal rule would in fact go further than "quarantine everything ungraded". Of the 20998
graded hadith rows, only **7867** are ṣaḥīḥ at every level of the dataset's own grading chain
— that is, every `/`-separated segment of the stored `grade` begins with `Sahih` — and the
other 13131 carry at least one ḥasan, ḍa'īf or mawḍūʿ level. So "the grade must be ṣaḥīḥ", read
strictly, quarantines 42260 − 7867 = **34393** of 42260 records and serves 19%. mizan
quarantines the 15026 rows where the dataset said nothing, and serves the graded ones with
their source's own words attached — a decision a reader is entitled to disagree with, which is
what the table is for.

## 6. What a judge can check in 60 seconds

```bash
bun install
bun run ingest          # rebuild the corpus from pinned URLs (or see "already present")
bun run verify:ledger   # verify the corpus hash chain, names the exact broken index
bun run verify:runs     # verify the run chain: every trace unaltered, links and digests intact
bun run check:docs      # assert every path/command/env-var/count claim in this document is real
bun run ci              # typecheck + per-package tests + gates G-1..G-6
```

No credentials are needed for any of the above, and none of them touch the network except
`bun run ingest`'s fetch step. Two of them exist specifically to make claims falsifiable.
`verify:runs` proves the run history was not altered, removed or reordered; it does **not**
re-derive past verdicts, which would need the snapshot of that moment. `check:docs` fails
the build when this document says something the repository does not contain — which is how
the false claims in §4 and §5 above were found.

### Exit codes

`bun run ask` is the one command whose exit code a script is expected to branch on, and the
four values are kept distinct on purpose:

| Code | Meaning |
| --- | --- |
| 0 | Answered, and the run is recorded and therefore auditable. |
| 1 | Degraded: the run said something honest and failed — `model unavailable`, or no sources. |
| 2 | Usage, or a missing prerequisite: no question given, or no corpus at `data/corpus.db`. |
| 3 | UNTRUSTED — **no verdict**: the snapshot did not attest, or a full report was produced and could not be recorded. |

Exit 3 is separate from exit 1 because they are not the same kind of bad. A degraded run told
the truth; an untrusted run produced output that cannot be audited afterwards, which is the
state AGENTS.md §16 singles out. Treat exit 3 as *do not rely on anything this run produced*.
