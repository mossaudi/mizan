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
| Tanzil.net Qur'an text | Data source (public-domain text, reproduced verbatim) | Text only, with attribution |
| `quranlab/hadith` (Hugging Face) | Data source (public-domain Arabic matn, grader-attributed grades) | Text only, with attribution and per-row licence |
| `mhashim6/Open-Hadith-Data` | Data source referenced by `quranlab/hadith` for digitisation | Text only, with attribution |
| `effect` 4.0.0-beta.83 | Runtime dependency for schema decoding at untrusted boundaries | Yes, MIT, pinned exactly |
| `typescript` 5.6.3, `@types/bun` 1.1.14 | Build-time only | Yes, no runtime code |

### The four contract shapes that were studied, and how they were reimplemented

These are *ideas*, not code. Each was reimplemented from scratch against mizan's own
types, and each reimplementation is stricter than the shape it came from:

| Shape studied | Where it appears in mizan | What mizan does differently |
| --- | --- | --- |
| claim → citation → evidence → verdict | `packages/mizan-verify/src/verify.ts` | Three verdicts (`verified` / `unverifiable` / `rejected`) instead of two, and the verdict is computed **only** by strict normalized substring containment. There is no path from similarity to `verified`. |
| confidence threshold → escalate to a human | `packages/mizan-gate/src/evaluate.ts` | Escalation is additionally blocked by the claim verdicts: a single `rejected` claim escalates regardless of the model's stated confidence. |
| source / licence registry (`supply-chain.ts`) | `packages/mizan-corpus/src/registry.ts` | The registry is **generated** from source metadata and hash-checksummed; a licence field that is empty fails CI (gate G-5). |
| honest capability disclosure (`websearch-capability.ts`) | `packages/mizan-agent/src/provider/port.ts`, `packages/mizan-gate/src/capability.ts` | A no-web model is disclosed in the answer itself, not just in a log line. |

## 3. Data and privacy disclosure

* **No real user data was collected, used, stored, or seen.** The committed question set
  (`data/questions/synthetic.json`) is synthetic and was written by us. mizan has no
  accounts, no authentication, no multi-tenancy and no analytics.
* **No question text is ever logged or traced.** A run trace records `questionHash`
  (SHA-256) and nothing else about the question. There is no PII to protect because none
  is collected.
* **The ledger records decisions, not content.** One JSONL line per run: question hash,
  corpus snapshot hash, tools called, per-claim verdict and reason, escalation reasons,
  timings, degradation markers. Never the question, never the answer prose, never corpus
  text.
* **No secrets are committed.** `.env` and every `.env.*` except `.env.example` are
  gitignored, and gitleaks (gate G-4) fails the build if a secret is ever tracked.

## 4. Inference disclosure (ADR-04)

The demo default is a **hosted** model reached through the `LlmProvider` port. The
local `llama.cpp` / Ollama path is implemented and documented as offline mode. This is a
deliberate, disclosed choice, not a hidden one:

* The competition's synthetic-data rule governs **data provenance**, not egress. We have
  no users, we ship a committed synthetic question set, and we persist no logs.
* A locally hosted 7–8B model visibly underperforms a frontier model on Arabic religious
  questions, and judges type their own questions during evaluation. A weak demo is a
  worse outcome than a disclosed dependency.
* Inference cost for an entire event is a rounding error against the prize.

If the hosted provider is unreachable, mizan prints **"model unavailable"**. It never
falls back to a canned answer, and it never silently substitutes a mock. When
`MIZAN_PROVIDER=scripted` is set explicitly, the answer catalogue is committed,
deterministic, and labelled `precomputed (deterministic)` in both stdout and the trace.

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
`gradeBasis` model in `packages/mizan-corpus/src/grade.ts`.

## 6. What a judge can check in 60 seconds

```bash
bun install
bun run ingest          # rebuild the corpus from pinned URLs (or see "already present")
bun run verify:ledger   # verify the hash chain, prints the exact broken index if any
bun run ci              # typecheck + per-package tests + gates G-1..G-6
```

No credentials are needed for any of the above, and none of them touch the network except
`bun run ingest`'s fetch step.
