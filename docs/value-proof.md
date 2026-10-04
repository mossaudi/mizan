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
the file it came from. There is exactly one kind of exception and it is labelled as such: a figure
another organisation measured is *cited* rather than asserted, it lives in
`data/registry/external-claims.json`, and it carries the publishing organisation, a URL, the date it
was retrieved and what it actually measures. `bun run check:docs` fails a cited figure that resolves
to no registry entry, an entry missing any of those fields, and a registry figure printed anywhere
below without a marker saying whose it is **on the line that prints it**. A marker one line away
credits nothing — that is the whole of the rule, and the reason the paragraphs below wrap a figure
together with its citation rather than separating them.

Because this document promises that, it is also the one audited document held to it across its
**whole body** rather than only inside a benchmark-titled section: every percentage printed anywhere
above — not just in the table below — must resolve to a registry entry or to a **rate** this document
attributes to a named `Artefact field` *on the line that states it*, and one that resolves to neither
fails the build. The line is the unit for both paths, and it is the unit for a registry figure too: a
cited figure is credited by a marker on its own line, never by one somewhere else in this file. So
each rate below is stated once,
in the table, and no percentage anywhere in this file may borrow a spelling credited there — which is
why this paragraph names no figure of its own. A count is not a rate, so the `caseCount` and
`corpusRecordCount` rows below may never be written as percentages, and a difference is printed in
percentage points, never as one. The other nine audited documents are not held to that promise,
because none of them makes it; `ADR-C8` names the figures in them that this leaves unpoliced rather
than leaving the limit implicit.

## Why this exists rather than an answer

The gap this product addresses is not that answers are wrong. It is that a citation attached to an
answer is usually never checked. Across eight AI search tools asked to attribute a quoted passage to
its source, **more than 60%** returned the wrong one (`external-claim:tow-miscited-share`), and an
evaluation of seven LLMs over 800 questions found that
**50%** of responses were not fully supported by the sources they cited (`external-claim:stanford-unsupported-share`),
reaching **90%** under the strictest condition (`external-claim:stanford-unsupported-share-upper`).
Both are measurements of other systems, on news and on medical text rather than on religious
text, and neither is a measurement of mizan. They are here because they establish the shape of the
problem: correctness and citation support are different questions, and the second one is the one
nobody was asking.

A search tool answers the first question. This repository does not answer questions at all, and its
contribution is the second: a verdict computed per claim from a fail-closed procedure, with the
failure rate published rather than asserted.

## The benchmark

Source of every figure in this section: `data/benchmark/vs-search.json`, the committed output of the
executed system arm in `scripts/benchmark/system-arm.ts`.

Rerun that arm with `bun run benchmark:vs-search`. Its own `systemArmSource` field reads
`executed-verifier`: the arm runs the real verifier against the open corpus and never reads the
fixture's expectations, which is the defect that used to make the detection rate a restatement of the
input instead of a measurement.

**What is checked here, and what is not.** The anti-tautology property has two halves and they are
enforced differently, so the headline number is stated at the width the code supports. The
`SystemArmSource` literal makes an artefact claiming `declared-expectations` unwritable, and that half
is a compile error. The other half — that the executor cannot read the labels it would be restating —
is now **checked**: `checkExecutorLabelBlindness` in
`packages/mizan-gate/src/docs-benchmark.ts` scans `scripts/benchmark/system-arm.ts` for the identifiers
that carry a verdict expectation, and `bun run check:docs` fails if one appears. The scan is scoped to
that file on purpose, because `scripts/eval/` publishes the sets and holds the hand-adjudicated
rulings, so a repository-wide ban would forbid the generator from expressing what a case is expected
to be. It is a docs rule and not an eighth gate, because `GATE_IDS` is a count this repository
publishes about itself.

What no scan establishes is the half that has to be admitted rather than checked. The 40 cases are
**self-authored**: they were written by this repository, so `systemDetectionRate` of 100.0% is
consistent with a good verifier *and* with a set that was drawn from its own blind spots. There is no
hold-out and no human-labelled ground truth, so the detection rate is not evidence of accuracy on
fabrications this project did not think of. That is the weakest link in this document and it is stated
here rather than in a footnote.

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
| Read-only API endpoint | no | yes | yes | yes (MCP) | no | **yes (MCP, read-only)** |
| Arabic interface | yes | no | yes | no | yes | **deferred, disclosed** |
| Bukhari and Muslim corpus | partial | partial | yes | no | no | **deferred, disclosed** |
| Multilingual breadth | yes | no | no | yes | no | **partial, disclosed** |
| Tafsir | no | no | yes | no | no | **deferred, disclosed** |
| Externally run benchmark | yes (IslamicMMLU) | no | no | no | yes (norms) | **not yet claimed** |

## Reproducing every figure above

Six commands and two committed files. Each step below names what it proves and where the authority for
the claim lives, so a reader can check one figure without reading the whole repository — and so a
reviewer who *does* read the whole repository finds the same numbers this page prints.

| # | Step | Command | What it establishes |
| --- | --- | --- | --- |
| 1 | The commit under test | `git rev-parse HEAD` | Every figure here is a property of a tree, not of the repository in general. Publish this SHA beside the figures; `attestation.json`'s `snapshotHash` is the matching corpus identity, so a re-ingest that produced different rows is detectable rather than silent. |
| 2 | Build the corpus | `bun run ingest` | Fetches the sources, builds the snapshot and writes the registry. `data/corpus.db` and `data/registry/records.jsonl` are gitignored generated artefacts, so a fresh clone has neither and every record count above is re-derived rather than read. `bun run ingest:check` re-checks what is committed without refetching. |
| 3 | The structural gates | `bun run ci:gates` | Every gate, each of which carries a self-test whose planted violation must fail — a guard that cannot fail is not a guard, which is the whole reason this step is on the page. |
| 4 | The documentation itself | `bun run check:docs` | Reads this document, the other audited surfaces, the ADR set and the committed evidence, and fails the build when a claim disagrees with the repository. This is the step that checks the claims on this page, so it is also the step that would catch this page being wrong. |
| 5 | The red-team counts | — (read two files) | `data/eval/redteam-fabricated.json` publishes `verdictCounts` `{"rejected": 40}` and `anchorCount` 30; `data/eval/adjudication.json` publishes `redTeamMovement.rejectedToUnverifiable` 40 and `falseVerifiedDelta` 0. `bun run build:eval` regenerates the set from the snapshot and the regenerated file is byte-identical for a given snapshot. |
| 6 | Live versus replay | `docs/demo-runbook.md` | A keyed run prints `LIVE`; a run with no key prints `PRECOMPUTED (deterministic replay)`. The label covers the *generation* and nothing else — the badge below it is computed on that run either way, against the committed corpus. `bun run demo` gives a complete run on a clean checkout. |

`bun run ci` runs steps 3 and 4 as part of the full per-package gate, and `bun test` is deliberately
refused at the repository root: it globs every package's tests, a package that fails to load is skipped
silently, and a green run there can mean "nothing was collected".

## What is not claimed

- **No answer or retrieval quality claim, for anyone.** The generator is out of scope, so there is
  nothing to rank. The comparison above is about what a product ships.
- **No third-party run yet.** The figures in this document are run by this repository over its own
  committed set. An arm run by anyone else is planned, not shipped, and is not claimed here.
- **No corpus we do not hold, named honestly.** What is served is what
  `attestation.json.collectionCounts` records: Qur'an, the four Sunan and Muwatta, 27,234 rows. That
  record names six collections and Bukhari, Muslim and an-Nawawi are not among them, so none of the
  three is served. All three are fetched — they are in `QURANLAB_COLLECTIONS`, so they are present in
  the tree — and saying "not ingested" was wrong in a way that flattered us. The reason is not
  licensing: the source is recorded `content-only`, redistribution is permitted and derived works are
  restricted, and the commercial-use question is not established either way. It is grading. Our
  registry records `gradeApplicable: true` for the whole source and every one of the 15,026 held-back
  rows is a row whose dataset asserts no grade, so `quarantineReason` returns `missing_required_grade`
  and a row the dataset declines to grade is held back rather than served with a grade we invented
  (ADR-06, ADR-C9). **The 15,026 is a count of rows and nothing more:** the attestation carries no
  per-collection breakdown of it, so no claim is made here or in the README about which collection any
  held-back row came from, and the per-collection statement above is the served set read from the
  attestation by name.
- **No grade is ours.** A grade is stored exactly as its source dataset asserts it, with its source
  and basis, or as `null` when the dataset carries none (ADR-06).
- **Deferred, not hidden.** An Arabic interface, a multilingual interface and tafsir are not built.
  `tafsirLookup` returns a typed `unavailable` refusal rather than a fabricated tafsir, and no
  multilingual UI is implemented. They are listed above as `deferred, disclosed` because an omission
  a judge discovers is worse than one this document admits. The read-only API endpoint is no longer
  in this list: it is the stdio MCP server in `packages/mizan-mcp`, which exposes one tool and no
  way to write. Its transcript is verifiable with `bun run mcp`, and it returns verdicts with match
  strength but no corpus text.
- **Multilingual breadth is partial, not deferred — and the boundary is drawn here.** `processQuestion`
  in `@mizan/core` detects the language of a question across 44 languages, flags right-to-left ones,
  and refuses a payload-shaped question at the boundary. `bun run ask` calls it before it opens the
  corpus, resolves a provider or composes any SQL, and the report header prints the detected language
  tag and direction, so the support is observable rather than asserted. Verification is
  language-agnostic: it compares a folded quote against a corpus record, and neither knows what
  language the question was in. What is **not** built is a translated interface or a translated
  answer — a question in Urdu is answered from an Arabic corpus, so it comes back in Arabic. The
  count is 44, pinned exactly by `packages/mizan-core/test/i18n.test.ts`: an earlier draft of this
  document published 45 against a list of 44, and the only assertion behind it was `>= 25`, which the
  wrong number passed as readily as the right one.

  **What "detects" is worth.** The detector is a script test followed by whole-word markers, and it
  says so on the same header line as the tag: `language  ms (ltr, ambiguous: several languages matched
  equally)`. Nineteen pairs of languages in the table share at least one marker, so a text built from
  only shared markers genuinely cannot be told apart — Malay and Indonesian share sixteen, and Spanish,
  Portuguese, Italian and French share enough that a question can tie across four at once. Where
  candidates tie, the tag is the table-order winner, which is arbitrary among the tied set and is
  labelled `ambiguous` rather than presented as a detection. Where no marker matches at all — the
  common case for Arabic, which carries no markers in the table — the script default is used and the
  line reads `script default, no marker matched`. Nineteen single-language scripts are decided by the
  script alone, and those say `sole script language` instead of `detected`, because nothing was
  detected. What the tag is *not* is a routing decision: nothing downstream branches on it, so a wrong
  tag costs a reader a mislabelled header and the verifier not at all.
