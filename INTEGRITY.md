# INTEGRITY

A short list of things we deliberately did **not** do.

This file exists because in a competition judged by humans on trust, a shortcut that a
competitor or a judge discovers later costs more than a limitation we state up front. Each
entry below is a choice, and each choice is checkable in the repository.

---

## 1. No IP rotation, no provider-limit evasion

The repository this project was designed alongside contained a module that was **armed by
default** and spawned a router-restart launcher to force a new public WAN IP after three
consecutive rate-limit failures. Shipping that, or having it in our submitted history,
would read as circumventing provider limits at an event judged on trust.

It was **deleted, not disabled**, in its own commit, and a grep guard plus a self-test
keep it from returning. Gate **G-3** asserts that no IP-rotation, router-restart or
provider-limit-evasion identifier exists anywhere in this repository.

## 2. No fuzzy, semantic, or embedding-similarity path to `verified`

A feasibility spike measured the thing everyone reaches for. An invented but *plausible*
hadith scores a **high** fuzzy match against a real record, and so does a faithful
paraphrase. A similarity fallback is not a weaker verifier; it is a
**CWE-345 insufficient-verification-of-data-authenticity hole with a confidence
indicator on it**.

So `verified` is reachable by exactly one route: strict normalized substring containment
of the quoted span against a pre-folded corpus record. `packages/mizan-verify` declares
exactly one dependency, `verify.ts` is forbidden from importing the display-only
diagnostics module, and gate **G-1** asserts all of it mechanically. There is no
threshold to tune, because there is no score.

## 3. No LLM is ever used as takhrij

The model does one job: decomposing an answer into atomic claims. That call is cached, and
its output **cannot influence a verdict** — the verifier never sees the model's opinion
about whether a citation is good.

This is not a style preference. A 2026 study measured LLM hadith-verification accuracy at
**8%**. We did not ship a system with a known 8% component in its trust path.

## 4. No paywalled content was scraped, and no licences were guessed

Every source is a public, machine-readable endpoint fetched from a pinned URL through an
allowlist. `Open-Hadith-Data`, which was on the original source list, **states no explicit
licence in its own README**; rather than assume a licence, we excluded it and recorded the
exclusion in `attestation.json` so the decision is visible. `hadith-json` was also
excluded: it has no licence and no grade field, and it is a scrape of sunnah.com, which
`quranlab/hadith` explicitly licenses as "a link only".

Where a licence is ambiguous, the registry says so in words rather than picking the
permissive reading. Licence fields are never hand-typed: they are generated from source
metadata and gate **G-5** fails the build if any row has an empty licence.

## 5. No invented grades, ever

A `grade` is the dataset's grade, not ours. Every stored grade carries the dataset that
asserted it and the basis on which it was recorded. Where a dataset publishes no grade,
we store `null` and the product says "grade not provided by <dataset>". We do not default,
infer, upgrade, or display a grade as our own ruling. Quarantining a whole collection
because the concept does not apply to it would have been a convenient way to look tidy;
it is also wrong, so we did not do it.

## 6. No real user data, no accounts, no telemetry

There is no authentication in this product and we did not add any. There are no users, so
there is no user data — and no user question text is committed anywhere. Nothing is sent
anywhere except the model request the operator configured, and the corpus fetch, both
allowlisted.

Three committed artefacts are worth being precise about, because "we log hashes, not content"
is only a claim once someone can check which file holds what.

**`data/demo-questions.json`** is the only file under `data/` that contains question text. It
holds the two questions the committed demo asks, verbatim, so that
`bun run ask --list-questions` works on a clean checkout with no provider key and no network.
It is safe to commit because we wrote both questions ourselves, and the set carries a
required `syntheticNotice` field that says so — and that also states the fabricated quote is
borrowed from `data/eval/redteam-fabricated.json` rather than invented for the demo. A test
asserts the notice still says both things, so it cannot be quietly emptied.

**`data/transcript.json`** contains no question text. Every entry stores `questionHash` and
never the question, because a trace is the artefact most likely to be read by someone
debugging and the least likely to be read with a schema. A test reads the file as raw text
and asserts that no committed question appears anywhere in it, so the guarantee survives a
careless future field.

The two are bound to each other by hash rather than by convention: the transcript test
re-derives `questionKey` from each question's own text and requires the matching `decompose`
and `answer` entries, so a question edited behind the demo's back produces a hash that
matches nothing and fails the test.

**`data/eval/*.json`** contains no question text either. Each case is a quote, the citation
that quote is checked against, the verdict both are declared to produce, and the corpus row
the quote was derived from. A case without its anchor text is not a test, it is a claim about
a test. The Arabic in these files is corpus text, already committed, already licensed, and
already the subject of section 4.

## 7. No fixture-driven "verified"

The demo path calls the real verifier against the real corpus. The only mock in the test
suite is at the `LlmProvider` port — the single non-deterministic I/O in the system.
Golden-file and red-team tests use no mocks at all.

When `MIZAN_PROVIDER=scripted` is used for an offline demo, the answers are committed,
deterministic, and labelled `precomputed (deterministic)` on stdout **and** in the ledger
entry, so a transcript can never be mistaken for a live generation.

## 8. No unpublishable number

The fabricated-hadith rejection rate is a **release gate**, not a metric we report
alongside favourable ones. If the honest number were poor, the correct response would be to
make the verifier stricter, not to publish a friendlier figure. G-6 blocks the build on a
single false `verified`.

## 9. No claims we cannot falsify

`verified` means one thing: the quoted span appears, after deterministic Arabic
normalization, inside the specific corpus record the answer cited. It does not mean the
answer is true, the interpretation is sound, or the hadith is authentic — those are
scholarly questions, and the product routes to `refer_to_scholar` rather than guessing.

**This is not a fatwa.** The disclaimer ships in the product, at the gate, and in the
documentation.
