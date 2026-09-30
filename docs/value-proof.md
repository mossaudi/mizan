# Value proof

> **Search attaches citations; mizan adjudicates them — a computed, fail-closed verdict per claim,
> with a hash-chained receipt.**

That one sentence is the whole claim, and it is the negative space worth stating first: a search
engine attaches a citation and leaves the checking to a reader, while this system reads the quote at
the cited location and returns one of `verified`, `rejected` or `unverifiable`. There is no fourth
verdict. Zero evidence blocks approval, a malformed or timed-out check is `unverifiable`, a ledger
write failure marks the run untrusted, and no branch of the rule reaches `verified` except strict
normalized substring containment (ADR-03).

**Scope, before any number.** Answer generation is out of scope (ADR-C2). This system does not
produce answers, so nothing in this document claims how good an answer or a retrieval is — not for
mizan and not for anyone else. Two rules enforce that, and `bun run check:docs` fails the build on
either: a figure in the benchmark section that the committed artefact does not publish, and any
audited document that asserts answer or retrieval quality.

Every number printed below comes from a file committed to this repository, and each section names
the file it came from.

## The benchmark

Source of every figure in this section: `data/benchmark/vs-search.json`, the committed output of the
executed system arm in `scripts/benchmark/system-arm.ts`.

Rerun that arm with `bun run benchmark:vs-search`. Its own `systemArmSource` field reads
`executed-verifier`: the arm runs the real verifier against the open corpus and never reads the
fixture's expectations, which is the defect that used to make the detection rate a restatement of the
input instead of a measurement.

**What is checked here, and what is only reviewed.** The anti-tautology property has two halves and
they are not equally enforced, so the headline number is stated at the width the code supports. The
`SystemArmSource` literal makes an artefact claiming `declared-expectations` unwritable, and that half
is a compile error. The other half — that the executor cannot read the labels it would be restating —
is **not** held by a gate: no structural scan rejects the token that would name them, and none is
built for this cycle. It holds because `scripts/benchmark/system-arm.ts` receives a case whose type
has no field a label could arrive in, and because that file is read. So the honest description is *an
executed arm whose label-blindness is reviewed rather than checked* — narrower than "cannot be a
tautology by construction", and the only claim the code makes.

| Artefact field | Figure |
| --- | --- |
| `systemDetectionRate` | **100.0%** |
| `systemAgreementRate` | **100.0%** |
| `systemAbstentionRate` | **0.0%** |
| `baselineTop1HitRate` | **65.0%** |
| `delta` | **+35.0 pp** |
| `falseVerifiedCount` | **0** |
| `caseCount` | **40** fabricated cases |
| `corpusRecordCount` | **27,234** |
| `schemaVersion` | **2** |
| `setName` | `redteam-fabricated` |

Read the rows rather than an adjective. The baseline is a plain FTS5 top-1 search — `fts5-bm25`,
`k` of `1`, `rerunBudget` of `0`, no collection filter, and no sight of the record id — so
`baselineTop1HitRate` is the share of fabrications whose own cited record it handed back at rank 1,
wearing the source's own identifier. `systemDetectionRate` is the share of those same fabrications the
verifier did not call `verified`. `systemAgreementRate` is the share where its verdict matched the
set's expectation, and `systemAbstentionRate` is the share it punted on: a detection rate can be bought
by answering `unverifiable` to everything, which is why agreement and abstention are published beside
it instead of left to be inferred. `falseVerifiedCount` is the count the whole design is judged on —
how often the verifier called a fabrication verified — and it is `0`.

**The arm is anchorless, and that matters when you read the rate.** `SystemCase` in
`scripts/benchmark/system-arm.ts` carries an `id`, a `quote` and a `citation` and nothing else, so this
arm never sees an anchor: detection here is strict containment of the quote against the cited record.
The baseline's `anchorId` is used for one purpose only — deciding whether its top hit was the record
the case cites.

The `preRegisteredHypothesis` is committed in the same file as the figures, so they cannot be
explained after the fact.

## Red-team results

The set is `data/eval/redteam-fabricated.json`: quotations that look right and are not. Its committed
`verdictCounts` is `{"rejected":40}`.

| Field in `data/eval/adjudication.json` | Value |
| --- | --- |
| `redTeamMovement.rejectedToUnverifiable` | **40** |
| `redTeamMovement.falseVerifiedDelta` | **0** |

Both values are declared by hand in `scripts/eval/adjudication.ts` rather than observed from the code
they judge, and `apps/cli/test/eval.test.ts` asserts the published figure against the run — so a
locator that stops locating fails a test naming the case instead of quietly shrinking the number.

The movement is between two non-`verified` verdicts. Under the anchor arm a fabrication whose anchor
still locates reports `unverifiable` instead of `rejected`, and that is a property of the locator, not
a finding that the claim became faithful; a locator that fails can only ever yield `unverifiable` or
`rejected`. `falseVerifiedDelta` is the zero-`verified` bar restated as a field, so a change to the
locator has to change a number here in the open.

## The receipt

Every run appends to `data/runs.jsonl`, a hash-chained ledger. An entry carries hashes and verdicts
and nothing else: no question, no answer text, no corpus text, no personal data, no key.

`bun run verify:runs` re-derives each `entryHash` from the one before it, stopping at the first link
that does not reconcile.

Two adjacent entries from the committed ledger, projected onto the four fields that carry the claim:

```json
[
  {
    "questionHash": "506e45bd46e8f59c33f0fb5890064a01b65adc99f602c6a2ec629bcefa54d287",
    "verdict": "rejected",
    "prevHash": "58fbb205aba7c7ea0c6f92524bd4ccb4197b586bddc2437c7ab9db24de862583",
    "entryHash": "99cda5ca0e148699bb2b881c206ce7aaec5c49d0db0056b87ed9feead898c83d"
  },
  {
    "questionHash": "9fd4083645cc80f1f315fac2b7c29159331bbeef4cfee4f0b460d0428e499022",
    "verdict": "verified",
    "prevHash": "99cda5ca0e148699bb2b881c206ce7aaec5c49d0db0056b87ed9feead898c83d",
    "entryHash": "81f7e2a061f79c24dd0cf9a8c49db81d23bfef6a4545f85fc475d5a891a89162"
  }
]
```

The second entry's `prevHash` is the first entry's `entryHash`, so the receipt of the later run
includes the earlier one and neither can be edited without the other showing it.

## How this compares

Categorical, from the project's market review of 2026-09-29. Each cell says what a product ships. No
cell is a score, no number in this table is a measurement made here, and nothing in it is claimed by
this repository on anyone's behalf.

| What a product ships | Ansari | Fanar-Sadiq | UmmahAPI / Sunnah.com | Perplexity / Elicit | IslamicEval / HUMAIN | mizan |
| --- | --- | --- | --- | --- | --- | --- |
| Retrieval and answer generation | yes | yes | data only | yes | not applicable | **out of scope (ADR-C2)** |
| Computed fail-closed verdict per claim | no | no | no | no | detection only | **yes** |
| Hash-chained receipt for each run | no | no | no | no | no | **yes** |
| Committed fabricated set to be caught | no | no | no | partial | shared task | **yes** |
| Interactive demo surface | CLI | app | docs | app | not applicable | static page |
| Live-vs-replay disclosure | not applicable | not applicable | not applicable | not applicable | not applicable | **yes** |
| Read-only API endpoint | no | yes | yes | yes (MCP) | no | **deferred, disclosed** |
| Arabic interface | yes | no | yes | no | yes | **deferred, disclosed** |
| Bukhari and Muslim corpus | partial | partial | yes | no | no | **deferred, disclosed** |
| Multilingual breadth | yes | no | no | yes | no | **deferred, disclosed** |
| Tafsir | no | no | yes | no | no | **deferred, disclosed** |
| Externally run benchmark | yes (IslamicMMLU) | no | no | no | yes (norms) | **not yet claimed** |

## What is not claimed

- **No answer or retrieval quality claim, for anyone.** The generator is out of scope, so there is
  nothing to rank. The comparison above is about what a product ships.
- **No third-party run yet.** The figures in this document are run by this repository over its own
  committed set. An arm run by anyone else is planned, not shipped, and is not claimed here.
- **No corpus we do not hold.** The corpus is Qur'an plus the four Sunan and Muwatta; Bukhari and
  Muslim are not ingested, and a licence-gated ingestion is planned rather than pretended.
- **No grade is ours.** A grade is stored exactly as its source dataset asserts it, with its source
  and basis, or as `null` when the dataset carries none (ADR-06).
- **Deferred, not hidden.** A read-only API endpoint, an Arabic interface, multilingual breadth and
  tafsir are not built. They are listed above as `deferred, disclosed` because an omission a judge
  discovers is worse than one this document admits.
