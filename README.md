# mizan (ميزان)

**Per-claim citation verification for Qur'an and hadith answers.**

`mizan` answers a question about the Qur'an or hadith, then **checks its own citations against a
local corpus and shows its work**. Every quotation is labelled `VERIFIED`, `UNVERIFIABLE` or
`REJECTED`, and that label is computed — not asserted, not scored, not asked of a model.

```
$ bun run ingest                              # once, on a fresh clone: builds the local snapshot
$ bun run ask "What does the Qur'an say about the oneness of God?"

────────────────────────────────────────────────────────────────
sources       3 from the local snapshot
model         transcript-v1
transcript    PRECOMPUTED (deterministic replay)
snapshot      7b3b66fbca7fb9df…
────────────────────────────────────────────────────────────────
The Qur'an states the oneness of God directly and without qualification. Surah al-Ikhlas opens
by commanding the Prophet to say that He is one, and the surah then denies any likeness to Him.

[VERIFIED] ikhlas-1 — exact_containment (match: exact)
    quoted:  قُلْ هُوَ ٱللَّهُ أَحَدٌ
    source:  quran 6222 — https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt&agree=true
             بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ
    run:     14 of 14 folded characters shared — display only, never a verdict
```

The label on that line is the product. A system that *looks* verified but is not is the single
most likely way to lose trust in an Islamic-content tool, so the engineering effort here went into
the negative space: proving that `VERIFIED` cannot be reached except by strict containment.

The three indented lines are the other half of it. A badge on its own asserts a disagreement and
shows none of the evidence, so the quote that was checked, the record it was checked against, and
the record's own URL all reach the screen beside it. The `run:` line is a display-only diagnostic
that `packages/mizan-verify` cannot see — gate **G-2** enforces that separation over the verifier's
import closure, so the number printed there provably had no hand in the badge printed above it.
Ask it a question whose citation is a fabrication and the same three lines appear under a
`REJECTED` badge, with the invented quote and the genuine text side by side.

Under a `REJECTED` badge there is one more block, and it is the only thing this repository adds to the
badge that the badge does not already say:

```
    nearest suggestions (non-authoritative) — not a verification result for knowledge-fading-1: 1 returned of 2 records scanned, within abudawud
             the shared-character floor was measured on hadith cases only — quran and tirmidhi are unmeasured
    1. abudawud 4255 — https://sunnah.com/abudawud:4255
             حَدَّثَنَا أَحْمَدُ بْنُ صَالِحٍ، حَدَّثَنَا عَنْبَسَةُ، حَدَّثَنِي يُونُسُ، عَنِ ابْنِ شِهَابٍ، قَالَ حَدَّثَنِي حُمَيْدُ بْنُ عَبْدِ الرَّحْمَنِ، أَنَّ أَبَا هُرَيْرَةَ، قَالَ قَالَ رَسُولُ اللَّهِ صلى الله عليه وسلم ‏"‏ يَتَقَارَبُ الزَّمَانُ وَيَنْقُصُ الْعِلْمُ وَتَظْهَرُ الْفِتَنُ وَيُلْقَى الشُّحُّ وَيَكْثُرُ الْهَرْجُ ‏"‏ ‏.‏ قِيلَ يَا رَسُولَ اللَّهِ أَيَّةُ هُوَ قَالَ ‏"‏ الْقَتْلُ الْقَتْلُ ‏"‏ ‏.‏
            shared: 35 of 60 folded characters — display only, never a verdict
            grade: Sahih / Sahih / Sahih Muslim (157 After 2672) (dataset's own grade; quranlab/hadith/row, not ours)
```

That is the real output of `bun run demo`, whose two-record corpus is built from
`data/eval/demo-anchors.json` rather than from the 81 MB snapshot, which is why the count is `2` and
not `27,234`. On the full corpus the same block reads `1 returned of 27234 records scanned, within
<the cited collection>`. Four things in it are deliberate:

- **Returned of scanned, never "searched".** A count of records *searched* reads as a measure of how
  hard we looked, and it is the number that flatters a retriever most. `1 returned of 27234` says
  what the reader actually got and what it cost, in that order, and it cannot be quoted as a recall
  claim.
- **The scope is on the block.** `within abudawud` says which collections the rows came from. When the
  cited collection has nothing close, the list widens to the whole snapshot and the line says so —
  a whole-corpus list wearing a scoped list's clothes is worse than no list.
- **The measurement disclosure.** The shared-character floor below was measured on hadith cases only,
  so the block says which parts of the corpus the number describes and which parts are unmeasured.
  A floor with no stated measurement scope is a floor nobody can argue with.
- **Integers, never a percentage.** `shared: 35 of 60 folded characters` is two numbers a reader can
  check. A similarity percentage would be a verdict in disguise, which is the one thing this block is
  not allowed to be.

A `REJECTED` badge tells a reader that the quote is wrong. It does not tell them what the model *meant*,
and the answer to that question is already in the corpus. Those lines are the nearest records by exact
containment first and then by shared character 3-grams — an **order of real record ids**, never a
percentage, never a confidence, and never anything a badge could be built from. They appear only for
rejected claims, they are switched off with `--no-suggestions`, and when the search finds nothing it
says so in words rather than rendering an empty block. See ADR-07, ADR-08, ADR-09 and ADR-10.

---

## The one idea

> A claim may be `VERIFIED` only if the quoted span, after deterministic normalisation, is
> **literally contained** in the specific corpus record the answer cited. Nothing else.

There is no similarity score, no embedding, no edit distance, no LLM judge, no fuzzy fallback.
`packages/mizan-verify` declares exactly one dependency (`@mizan/core`), does no I/O, reads no
clock, and gate **G-1** fails CI if that stops being true.

The reason is a measurement, not a preference. A feasibility spike found that a fuzzy or
embedding-similarity verifier scores an **invented but plausible** hadith as a high match — the
fabrication-acceptance hole (CWE-345) that every retrieval-augmented generator is one threshold
away from. So the fallback everyone reaches for is precisely the one that accepts invented
religious text. See ADR-03.

---

## Quick start

Requires [Bun](https://bun.sh) `1.3.14`.

**Two commands, and that is the whole evaluation path.** `bun run demo` reads no environment
variable, opens no socket, and needs no corpus download.

```bash
bun install --frozen-lockfile
bun run demo
```

`bun run demo` prints a computed `VERIFIED` badge and a computed `REJECTED` badge from the same
run, in about a second. It rebuilds a two-record snapshot from the committed anchors in
`data/eval/demo-anchors.json` — the Qur'anic record the demo verifies and the hadith record it
rejects — re-derives every row's fold from the stored text rather than trusting a stored fold, and
prints the corpus fingerprint the verdicts were computed against. The answers are a committed
transcript and the output says so on every line; the badges above them are computed live. A
tampered anchor, a mismatched `textHash` or a missing anchors file stops the demo with no verdict
at all rather than falling back to something it found.

The rest of the surface needs the full corpus, which is 27,234 records and about 80 MB:

```bash
bun run ingest                 # fetch sources, build the snapshot and the registry (gitignored)
bun run ask "your question"
bun run benchmark              # every eval set and the HALLMARK fixtures: one report, one exit code
bun run benchmark:vs-search    # the red-team set through plain FTS5 search and through mizan
bun run eval:suggestions       # nearest-quote recall at three floors, and the cost of the real path
bun run mcp                    # the read-only verifier as a Model Context Protocol server on stdio
bun run ci                     # typecheck + tests + the seven structural gates
```

`bun run ingest` writes `attestation.json`, and every surface that publishes a number now refuses
to publish one until that attestation matches the snapshot on disk — the benchmark exits 3 and
prints zero figures, and a disagreement names both digests in full. The published snapshot is
`7b3b66fbca7fb9df…` over 27,234 records.

`data/benchmark/vs-search.json` carries the benchmark's measured figures and the baseline
configuration they were produced under, and `bun run benchmark:vs-search` prints them. This README
deliberately restates none of them: until a check compares a number in prose against that
artefact, a quoted figure is an unchecked claim, and the point of the benchmark is that its number
can be re-run.

`bun run benchmark` runs every suite in `data/benchmark/benchmark-report.json`: the golden claims
measured against the shipped snapshot, both committed eval sets from `data/eval/` — the normalization
cases and the fabrications — and the HALLMARK fixtures, plus a per-type roll-up marked as derived so
it cannot be counted twice. The committed eval sets build their own snapshot from their own anchors,
so those suites are hermetic and still run on a checkout with no corpus downloaded.

Each row in that report names the bar its case was held to, and the fabrication suite is held to the
published one: no fabrication may come back `verified`. That is deliberately not the same thing as
the per-case verdict written in `data/eval/`, which the adjudication record publishes as moved from
`rejected` to `unverifiable` for all of them — a human ruling that a text is fabricated, measured by a
verifier that cannot locate the anchor and says so. The report prints what the verifier returned as
well as what the case was held to, so the difference is visible rather than summarised away.

The report is a record, not a claim: `bun run benchmark` writes it, and `scripts/benchmark.test.ts`
fails if the file on disk is not byte-identical to a fresh run of the same corpus.

With no API key configured — the state of a fresh checkout — `bun run ask` replays a committed
transcript and says so on every line. It never presents a precomputed answer as a live generation.
`docs/demo-runbook.md` is the whole demo in writing: a live keyed run first, the replay second and
labelled, and the `model unavailable` degradation in between. A docs rule fails the build if the
order or either label changes.

### Try the verifier directly

```bash
# A real span of a real record: verified.
# An invented span cited to that same record: rejected.
# A number that does not exist: unverifiable, because you cannot prove a negative.
bun test --cwd apps/cli
```

### Or over MCP, read-only

`bun run mcp` starts the verifier as a Model Context Protocol server on stdio. It exposes one tool,
`verify`, takes a list of claims each carrying its own quotes and citations, and returns one verdict
per claim — `verified`, `rejected` or `unverifiable` — together with the match strength. It has no
tool that writes, and no tool that returns corpus text: a client learns *whether* a quote is in the
record it was cited to and nothing about what else is in it.

The transcript is reproducible, so the server is checkable rather than described:

```bash
$ printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"verify","arguments":{"claims":[{"claimId":"c-1","text":"لا تقبل صلاه بغير طهور ولا صدقه من غلول","quote":"لا تقبل صلاه بغير طهور ولا صدقه من غلول","citations":[{"collection":"tirmidhi","number":"1","raw":"tirmidhi:1"}]}]}}}' \
  | bun run mcp
```

A request that exceeds the frame limit is refused by name rather than truncated. The framing is
newline-delimited JSON-RPC - one request per line - and the reader buffers a partial line until its
terminator arrives, so a value split across two TCP chunks is reassembled rather than misread. The
server reads the corpus read-only: it cannot modify the snapshot it is attesting against. Malformed
requests get a JSON-RPC error, never a verdict.

---

## The eval sets

Two committed, self-contained sets in `data/eval/`. They ship the corpus rows they quote, so
they run in about a second on a clean checkout with no corpus and no network.

| Set | Cases | Bar | What it measures |
| --- | --- | --- | --- |
| `golden-normalization.json` | 200 | **100%** (architecture floor: 99%) | Four renderings of a correct quotation that must all verify, then the ways a text stops being a quotation |
| `redteam-fabricated.json` | 40 | **exactly zero** `VERIFIED` | Fabrications of real spans: one word changed, two words changed, letters transposed, a digit changed, a word inserted |

Run them with `bun test --cwd apps/cli` (see `test/eval.test.ts`). Regenerate with
`bun run build:eval` after an ingest that changes the quoted rows.

**The expectations are hand-adjudicated, not observed.** `scripts/eval/plan.ts` declares every
expected verdict as a literal derived from the documented behaviour of the fold table. The
generator is forbidden from importing `@mizan/verify`, and a test asserts that it still is not.
A set whose expectations were recorded by running the code under test is a regression test of the
code against itself and would prove nothing.

**The red-team bar is zero, not a percentage.** Every case in it is a fabrication, so one
`VERIFIED` is a false positive on invented religious text. There is no accuracy figure to trade
against it.

Three properties make the sets harder to fool than they look:

- **Breadth, stated exactly.** The 200 golden cases draw on 56 records, not 200 texts, and
  the 40 red-team cases draw on 38 records. Neither set is a sample of independent texts, and the
  golden set quotes some of its records more than once on purpose: the three normalization classes
  quote the *same* spans three ways — exact, undiacriticized, tatweel-spaced — so a fold too weak to
  strip combining marks is caught on a text the exact class already verified, not only on text
  shaped to defeat it. Two classes lean on a small pool for a measured reason: only two records
  in the corpus yield a clean digit span, which is why the digit classes are 4 and 4.
  `scripts/eval/plan.ts` is the authority on class sizes. `bun run check:docs` checks the two
  record counts above against `data/eval/*.json`; the class sizes and the digit-span fact are
  stated here from `digitFacts` and `classCounts` in the same files, and are not gated.
- **Global absence.** Every case labelled `REJECTED` is checked to be absent from the *entire*
  27,234-row corpus, not merely from the record it cites. A fabrication that happened to be a real
  quotation elsewhere would be a fixture asserting the verifier is wrong when it is right.
- **No pre-folded text.** Anchors ship `textDisplay` and a `textHash`, and the test re-derives
  `textMatch` with the real normalizer. A fixture cannot make a fabrication verify itself by
  editing a folded string, and editing the source text is caught by the hash.

### Paraphrase → `UNVERIFIABLE`: decided, mechanised, and its cost published

**The specification and the procedure disagreed, and the disagreement was recorded rather than
hidden.** The user story asks that a faithful paraphrase be `UNVERIFIABLE` and "never rejected,
because a paraphrase is not a lie". Containment cannot honour that: step 5 routes a *resolved*
identifier whose record lacks the quote to `REJECTED`, and telling a paraphrase apart from a
fabrication would require exactly the similarity measurement ADR-03 forbids. Inside containment the
two requirements cannot both hold.

**The decision was made by a person, published, and is now executed by the code.** A person read
each of the 26 affected cases against its cited source and recorded what the claim *is*; the table is
`data/eval/adjudication.json` and the protocol, with its reasoning and its rejected alternatives,
is `docs/anchor-protocol.md`. The ruling: a faithful re-rendering of a cited source is
`UNVERIFIABLE`, not `REJECTED`, because re-rendering is not misquotation and accusing a correct
answer of lying is the worse error. 26 cases decided, 0 undecided.

The answer does not come from containment, which cannot give it. It comes from the anchor arm —
step 5b of the verifier, reachable only after containment has already failed, carrying one
human-drawn span per adjudicated case. Two properties are what make it safe rather than merely
strict:

- **A bad anchor can only ever yield `UNVERIFIABLE` or `REJECTED`. Never `VERIFIED`.** The arm's
  return type admits only `unverifiable` or `null`; every route to `VERIFIED` still terminates in
  strict normalized substring containment.
- **The arm stays opt-in.** Remove the span from any of those 26 cases and the verdict falls back
  to `REJECTED`, which is asserted by a planted regression. An anchor is a decision a human made
  for a case, never a default applied to text nobody ruled on.

**One sentence carries the whole mapping, because two different things are easy to confuse here: the
human ruling and the procedure's output.** A person ruled the 40 fabrications `REJECTED` — they assert
something the source does not say — and the procedure emits `UNVERIFIABLE` for all 40, because an
anchor drawn from a largely real span *locates*. Both are true, they answer different questions, and
`docs/anchor-protocol.md` carries the full argument; `docs/specs/adr/ADR-C7.md` is the record that
fixes the mapping, and the code is the authority for it.

Two things about that ruling are worth more than the ruling itself, because both are the kind of
detail a product is built to hide:

- **The 40 red-team fabrications are adjudicated `REJECTED` too**, and they are the harder half of
  the argument. A `one_word_changed` case is eleven twelfths of a real span, which makes it
  *tempting* to call faithful; recording 40 fabrications as faithful would be a misdescription of
  the artefact, so they keep `REJECTED` and are not in dispute.
- **The locator costs signal on exactly the hardest cases, and the bill is measured rather than
  argued away.** Because those spans are largely real text, an anchor drawn from one locates, so
  all 40 move `REJECTED` → `UNVERIFIABLE` in observed output. That is a real loss of detection on
  the cases most likely to fool a reader, and it is published as `redTeamMovement` in the
  artefact and asserted by a test that fails if the observed count ever differs from it.
  `falseVerifiedDelta` sits beside it at 0, and that is the bar that does not move: no branch of
  the protocol can reach `VERIFIED`.

The divergence stamp that used to sit on those 26 cases is retired at `schemaVersion` 2 — a stamp
is how you record an open conflict, and this one is closed. What remains beside each expectation is
`EvalCase.adjudication`, the ruling itself, and `adjudication.json` is unchanged: an authority that
moves when the code moves is not an authority.

---

## The corpus

**4 Sunan + Muwatta + Qur'an, 27,234 records.** **No Bukhari, no Muslim and no an-Nawawi is served** —
`attestation.json.collectionCounts` names exactly six collections, and those three are not among them,
so none of the three is served. All three are fetched: they are listed in `QURANLAB_COLLECTIONS`, so
they are present in the tree, and calling them "not ingested" was wrong in a way that flattered us.
What actually holds their rows back is grading, not licensing. The source is recorded `content-only`
under a dataset card declaring a per-row mixed licence, so redistribution of the text is permitted,
derived works are restricted, and the commercial-use question is **not established either way** — this
repository makes no determination about it. On grading, our registry records `gradeApplicable: true`
for the whole source, and every one of the 15,026 held-back rows is a row whose dataset asserts no
grade at all, so `quarantineReason` returns `missing_required_grade`. Under ADR-06 a row the dataset
declines to grade is held back rather than served with a `null` grade we invented (ADR-C9).

**Which collections those 15,026 rows belong to is not recorded, and this document does not guess.**
The attestation carries the count and the reason, not a per-collection breakdown — so the per-collection
statement made above is the served set, read from the attestation by name, and no claim is made about
which collection any held-back row came from.

| Collection | Records | Licence class |
| --- | --- | --- |
| Qur'an (Tanzil, Uthmani) | 6,236 | no-derivatives |
| Sunan an-Nasa'i | 5,672 | content-only |
| Sunan Abi Dawud | 5,272 | content-only |
| Sunan Ibn Majah | 4,336 | content-only |
| Jami' at-Tirmidhi | 3,889 | content-only |
| Muwatta' (Malik) | 1,829 | content-only |

Every quote in the eval sets is reproduced under its own collection's licence with its
attribution intact, in `data/registry/sources.json` and per-anchor in the artefacts. Qur'an text
is stored verbatim and never rewritten, because the terms require it and because rewriting a sacred
text to suit a normaliser would be wrong on its own terms.

**15,026 of the 36,024 rows the hadith source shipped are quarantined, not served.** Every one is a row
whose dataset asserts no grade, and the rule is that a grade is never ours: we store exactly what the
dataset asserts, or `null`, and we never default, infer or upgrade one. What a dataset declines to grade
is held back rather than served with a `null` we invented. That costs us 41.7% of the hadith source. We
took the cost. This is a statement about rows, and it is kept as one: `attestation.json` records
`quarantinedRows` and no per-collection attribution of it, so nothing here assigns those rows to a named
collection.

---

## Provenance

- `attestation.json` — content hash, per-source SHA-256 digests, record counts, the
  hash-chained ledger head, and the quarantine count.
- `data/ledger.jsonl` — a hash chain. A write failure marks a run untrusted; a mismatch is a loud
  error, never a warning.
- `data/registry/sources.json` — every source with its publisher, licence, licence URL and
  attribution. A source whose licence could not be established is recorded as **disabled with a
  reason**, not quietly used.
- `data/runs.jsonl` — run traces carrying `questionHash`, never question text. No PII, no corpus
  text, no secrets.
- `docs/value-proof.md` — the one-page claim: the executed system-arm figures, the adjudicated
  movement, an excerpt of the run chain, and what is *not* claimed. Every figure in it is printed
  from a committed artefact, and `bun run check:docs` fails the build when one is not.

Two candidate sources are recorded and **excluded**, with reasons:

- **Open Hadith Data** — no explicit licence could be established from the repository. It is
  recorded as the upstream of the quranlab collections so the question is not re-derived from
  scratch. No adapter is written for a source we may not ship.
- **Hadith API (mirror)** — supplies the numbering origin for the Kutub al-Sittah but is not a
  citable edition, and states no per-row terms.

---

## Architecture

```
apps/cli              composition root: the only place the parts are wired together
apps/web              the static page: a framework-free render of the shared badge map
packages/
  mizan-core          contracts, Result, the Arabic fold table, the decode seam
  mizan-corpus        ingest, snapshot, citation resolution, quarantine, audit
  mizan-retrieval     FTS5 lexical rankers over the folded column
  mizan-agent         claim decomposition, transcript replay, the 10s budget
  mizan-verify        THE SIX-STEP PROCEDURE — offline, total, clock-free
  mizan-provenance    ledger, attestation, run traces
  mizan-gate          the seven structural gates
```

`apps/web/index.html` is a **committed build output**: open it from disk and it makes no
request, carries no script and renders corpus text as characters. `bun run build` regenerates it from
`apps/web/fixtures/page.json`, and `bun test` in `apps/web` fails if the committed bytes differ from
a fresh render or if any field in that fixture differs from `data/demo-questions.json`,
`data/transcript.json` or `data/eval/demo-anchors.json`.

`bun run build` is the whole build surface here, and that is a fact about this repository rather than
a gap in it. There is no bundler and no compiler output — the typecheck CI runs is `tsc --noEmit` — so
the page is the only artefact a build has to produce, and it is hermetic: one committed fixture, no
socket, no corpus, and byte-identical output on every run. The committed artefacts that *do* need the
snapshot are reached through their own named commands instead — `bun run build:eval` for the two eval
sets and `bun run make:transcript` for the replay — because both open `data/corpus.db`, which
`bun run ingest` produces and this repository deliberately does not ship. Putting them behind
`bun run build` would turn the build red on a correct fresh checkout, which is how a build command
ends up deleted rather than fixed.

### The six-step procedure

Per claim, in order. Each step is a fail-closed early return; the happy path is the last line.

1. **The quote.** Empty or diacritics-only → `UNVERIFIABLE (empty_quote)`. Only a *quoted span* is
   falsifiable — never the model's prose, which is its opinion of the source.
2. **A citation.** None → `UNVERIFIABLE (no_citation)`. Zero evidence blocks approval.
3. **The cap.** More than three citations → capped. A cap that is not the reason does not become
   the reason recorded in the trace.
4. **Resolution.** No candidate records → `UNVERIFIABLE (identifier_unresolved)`, or
   `collection_ambiguous` when the number exists in several collections and the answer named none.
   You may only accuse a citation of misquotation if the thing it points at demonstrably exists.
5. **Containment.** Strict normalised substring containment of the folded quote in the folded
   cited record → `VERIFIED`, with evidence. This is the only route to `VERIFIED` in the
   repository, and gate **G-6** fails CI if a second one appears.
6. **Coercion.** A `VERIFIED` carrying no evidence is coerced *down* to `UNVERIFIABLE`, and the
   evidence is cleared so nothing downstream can render a confident badge with no provenance.

### The fold

One table, in `packages/mizan-core/src/normalize/fold-table.ts`, applied once at ingest. Stages
cover alef and hamza forms, the wasla, ta-marbuta, diacritics, tatweel, digit forms (Arabic-Indic
and Eastern Arabic fold to ASCII), punctuation and whitespace. It never rewrites, adds or removes
a **letter** — which is exactly why a fabrication cannot be folded into a match.

`textMatch` is a matching key, not a text. It is never displayed. Every user surface renders
`textDisplay`; only the verifier compares `textMatch`.

### The gates

The differentiator is not the verifier's code, it is a set of machine-checked invariants. Every
gate has a self-test with a planted violation that must fail.

| Gate | Enforces |
| --- | --- |
| **G-1** | `mizan-verify` depends only on `@mizan/core`; no similarity, embedding, edit distance, network, clock or randomness; containment is its only match authority |
| **G-2** | no raw-HTML sinks; verdict construction is isolated from rendering |
| **G-3** | no dynamic eval, obfuscation, anti-analysis or donor-code workarounds |
| **G-4** | `gitleaks` finds no secrets — including the deliberately planted `AKIA…EXAMPLE` in the injection fixture, so the check is proven rather than lucky |
| **G-5** | every enabled source carries publisher, licence, licence URL and attribution, and an artefact digest |
| **G-6** | exactly one `VERIFIED` construction site, one match-strength owner, no computed percentage, no ad-hoc match strength, and evidence iff `VERIFIED` |

---

## Security posture

Mapped to OWASP, in the places that matter here.

- **A01 Broken access control** — corpus text is untrusted input. Retrieval is fenced,
  length-capped and marked data-only before entering any prompt. The prompt is a hint that improves
  output quality, never a control; only the verifier is authoritative.
- **A02/A06** — no secrets in code or history; the corpus is content, not a credential store.
  Dependencies are pinned and the lockfile is frozen in CI.
- **A03 / A10 injection** — the 10 `injection_appended` cases append a real English prompt
  injection to a genuine Arabic hadith span. The text before the comma is real, so the case cannot
  be waved away as "obviously not from the corpus". It is rejected, and G-4 proves the secret
  scanner tolerates the fixture it contains.
- **A04 Insecure design** — the design refuses `VERIFIED` by default. Zero evidence blocks
  approval; a timeout yields `UNVERIFIABLE`; an attestation mismatch yields a loud error and no
  verdict.
- **A09** — structured logging, hashes not content, no question text in any trace.

Every failure mode has one honest surface. `model unavailable`, `no sources found`,
`unverifiable`, `semanticRanking: "unavailable"`. Never a canned answer, a guess, a cached
verdict, or a silent downgrade presented as full fidelity.

---

## Not done, and not claimed

Stated plainly, because an over-claim in this domain is a correctness problem rather than a
marketing one.

- **Registration status and Track 4 selection are unconfirmed.** The engineering work does not
  depend on them; the submission does.
- **The official guide, participant guide, judging criteria and scientific appendix have not been
  read by a human.** Nothing here should be read as compliance with them.
- **The anchor spans are hand-drawn**, one per adjudicated case across both sets, so the anchored
  path is only as good as the ruling table behind it. A case nobody ruled on receives no span and
  falls back to `REJECTED`, by design — the arm cannot be talked into abstaining about text a
  person has not looked at.
- **Nothing judged here was produced by a live model.** Every expected verdict is hand-adjudicated
  in `scripts/eval/plan.ts`, and a test fails if the generator ever imports the verifier. A default
  checkout ships no API key, so `bun run ask` replays the committed transcript and labels every line
  a precomputed replay. A hosted provider does ship, and `hosted` is the default mode: with
  `MIZAN_LLM_API_KEY` set, `apps/cli/src/provider-config.ts` POSTs the question and the fenced
  context to an allowlisted `api.openai.com` over HTTPS, refusing redirects. `DISCLOSURE.md` §4 is
  the full disclosure.
- **The golden set asserts 100% against itself, not against a human-labelled corpus.** The
  expectations are hand-derived from the fold table's documented behaviour. A judge who disagrees
  with a rationale in `plan.ts` should treat the disagreement as a finding.

## Licence

Apache-2.0 for the code. Corpus text is **not** covered by it: see `data/registry/sources.json` for
per-source terms, and each eval anchor for its own attribution.
