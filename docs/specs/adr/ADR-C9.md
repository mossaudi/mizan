# ADR-C9 — The corpus is frozen at this snapshot, and a surface may not renounce a collection it serves

- **Status:** Accepted
- **Accepted:** 2026-10-01
- **Source:** the corpus-scope decision of the CEO strategic review of 2026-10-01

## Context

The specification names six collections. Six are not what is served. What is served is what
`attestation.json.collectionCounts` records: the Qur'an, four Sunan and Muwatta, 27,234 rows. The two
named by the specification and *absent* from that record are present in the tree and
**quarantined, not served**, which is a different statement and one the previous documents did not
make.

Two decisions had to be taken about those two, and the honest one is neither of the convenient
answers.

Both were fetched and are sitting in `quranlab/hadith` right now. The specification asks for them to
be "included in the corpus". They cannot be, and the reason is a mismatch between two flags rather
than a licence at all. On the licence this record states what the registry carries and nothing more:
`quranlab/hadith` is recorded `content-only` — redistribution of the text permitted, derived works
restricted — under a dataset card declaring a per-row mixed licence, so the commercial-use question
is **not established either way and is not claimed here**. The blocker is not licensing. The
**dataset** marks Sahih al-Bukhari not graded at the collection level (`graded: false`), so its rows
arrive with an empty `grades` list and the adapter stores `grade: null, gradeBasis: "none"` rather
than inventing one. Our own **registry** records `gradeApplicable: true` for `quranlab/hadith` — that field is
per-*source*, and one source holds both the graded and the ungraded collections. So
`quarantineReason` sees "a grade was required" and "no grade was supplied" and returns
`missing_required_grade`, which is the correct response to the data it is given and the wrong outcome
for these two books. 15,026 rows are in that state, and the served hadith total is *exactly* the sum
of the five graded collections, so Bukhari, Muslim and an-Nawawi are not served at all.

The per-collection identity of those 15,026 rows is **not recorded**: the attestation carries the count
and the reason, not a per-collection breakdown. It is *derivable* — the partition is total, so a
collection with no served rows has all its rows held back, and the served total leaves exactly the three
unserved collections — and this record still declines to print it, because an inference that requires
four committed artefacts and a total-partition argument is not what a disclosure document should be
resting its per-collection claims on. The surfaces therefore state the served set, read from the
attestation by name, and say plainly that no row-level attribution is claimed.

Making `gradeApplicable` per-collection is the correct long-term fix and is deliberately **not** this
cycle's. `corpusRecordCount` lives in `data/benchmark/vs-search.json`, so any corpus change
invalidates the committed artefact and every benchmark figure in this document until the arm is
re-runs — and 15,026 extra rows change FTS5 competition, so `baselineTop1HitRate` could move in
either direction. Moving the headline number inside a change sold as a documentation fix would be the
wrong trade. Adding a second rule to serve them today would mean overriding a dataset's own grading
claim with ours, which is the one thing ADR-06 forbids and the one thing this product must never do.

Meanwhile the documents say "no Bukhari, no Muslim — recorded as absent", which reads as a licence
decision. It is not. It is a grading decision wearing a licence decision's clothes, and a judge who
checks the licence finds nothing wrong and concludes the disclosure was decorative.

There is a third problem, and it is the reason this record exists rather than an edit. Rule fifteen
stops a document claiming to cover a collection that is absent. Its mirror did not exist: nothing
stopped a document continuing to renounce a collection after the snapshot started serving it. Rule
fifteen is half of an invariant, and the half that was missing is the half that catches a stale
disclosure.

## Decision

The corpus is **frozen at this snapshot**. This cycle adds no collection. The collections that are
fetched but not served are disclosed by name in every surface that states scope, against the served set
in `attestation.json`, with the reason stated at the level the attestation records it: 15,026 rows are
held back because the dataset asserted no grade, so the quarantine is `missing_required_grade`. No
surface attributes those rows to a named collection, because the attestation does not carry that
breakdown and a disclosure that outruns its evidence is the defect class this repository exists to
prevent.

`packages/mizan-gate/src/docs-corpus.ts` adds rule eighteen. The served set is read from
`attestation.json.collectionCounts`, never from a document. A clause fails the build when it names a
served collection **and** gives that collection up — either by carrying a renunciation word
(`excluded`, `absent`, `missing`, `omitted`, `renounced`, `deferred`, `unavailable`, `out of scope`) or
by attaching a negation to a coverage verb ("does not serve", "is not served", "never shipped", "no
Sunan is included"). Both halves are required.

## Rationale

Freezing is a scope decision with a security property attached. Every collection added is a new
licence to check, a new grade vocabulary to reconcile and a new quarantine class to explain, and the
specification's own value argument needs none of them: the judges score citation verification, not
corpus breadth. A fifth Sunan is invisible to every acceptance criterion and would be visible only in
the time it takes to get wrong.

Rule eighteen reads the served set from the attestation because that is the only file that is a
committed record rather than a quotation. A rule that let a document define the served set would be
auditing the document by its own testimony, which is the circularity the whole repository is built to
exclude.

The rule reads a **coverage** vocabulary rather than the general negation vocabulary rule fifteen
uses, and that difference is deliberate rather than incidental. Rule fifteen's markers may match too
much, because a marker that matches too much only ever lets a covering claim through — a missed
warning. Rule eighteen's markers may not: a marker that matches too much reports a false claim on a
true document, five times over on the day it landed. It fired on "the oneness of God directly and
without qualification", on a `no-derivatives` licence column, and on a deck string, and a rule that
cries wolf five times before noon is a rule that gets switched off by the next person to touch it.

A coverage word alone turned out to be the same mistake in the other direction, and it was found by a
fixture rather than by review. "Tanzil - Qur'an is served verbatim" is the sentence a disclosure uses
to state what it holds, and requiring only a coverage word reported it as renouncing the Qur'an — the
false positive that gets a fail-closed rule switched off just as surely as a missed violation. So a
coverage word is *necessary and not sufficient*: the clause has to give the collection up as well.
Renunciation words are the half that can only appear in a sentence surrendering something; negation is
the half that has to be attached to the coverage verb, with a two-word window. Both bounds are tested
rather than assumed. At four words the negation window matched "there is no doubt that the Qur'an is
served", a sentence asserting the opposite of a renunciation. And a clause-wide marker search reported
this very paragraph, because one clause here names a served collection while a marker in it describes
the coverage *vocabulary* rather than the collection. So the marker is now searched for within six
words of the name.

Two residuals are stated rather than hidden, and both have a planted test in `docs-corpus.test.ts`.
A renunciation phrased only as "the Sunan are not in the corpus" is not caught at all, because
`corpus` is deliberately absent from the coverage vocabulary. And within the six-word window a marker
belonging to a different subject is still reported: a clause that names a served collection and, within
six words, says `absent` or `missing` about something else is a true sentence this rule reads as a
false one. The concrete example is planted in `docs-corpus.test.ts` rather than quoted here, because
quoting it in this file would make `check:docs` fail on this file — the most direct demonstration
available that the finding is wrong. Closing the second needs
sentence-level parsing of what the marker modifies, and closing the first needs the alias-and-phrase
table this rule refuses to maintain; a rule that grew either would be a rule a judge could no longer
predict.

## Consequences

- The served set is quoted from one file. `docs/value-proof.md` and `README.md` cannot drift from
  `attestation.json` on which collections exist, because `check:docs` fails if they do.
- An honest disclosure of a quarantine is still allowed, and is now *required* to name the reason. A
  sentence that renounces a collection this snapshot does not serve passes today, and the same
  sentence becomes a failure the day it is served — which is the point: the rule's job is to be ready
  for that snapshot without anyone remembering this file.
- The residual is written down instead of hidden: a renunciation phrased only as "not in the corpus"
  is not caught, because `corpus` is ordinary prose that contrasts two collections. Closing it would
  need an alias-and-phrase table, which is the drift-prone artefact this rule declines to maintain.
  The `NAMES` table in `docs-corpus.ts` is the opposite trade and is deliberately small: it maps each
  served collection to the ways documents *legitimately* spell it, and it carries no phrase table and no
  aliases beyond those spellings. A miss there was found and closed — `Muwattah`, the ordinary
  transliteration of الموطأ beside `Muwatta`, was unwatched while `Muwatta` was — and that is the
  boundary written down: a spelling is admitted, a rename is not, and the difference between them is
  whether a judge's document could honestly contain the word.
- 15,026 quarantined rows are attributed to `missing_required_grade` in the quarantine table, and to
  the grade gate. Rule six checks that arithmetic; this rule checks that no document misreports what
  is being served. The attribution is at row level: the quarantine table names a reason and a count, and
  the surface documents name the unserved collections from the attestation's served set rather than
  attributing the count to them.
- The licence question stays open and unclaimed. `sources.json` records `content-only` for
  `quranlab/hadith`, whose dataset card declares a per-row mixed licence: redistribution permitted,
  derivatives restricted, commercial use undetermined. No document asserts a conclusion the registry
  does not carry, and an earlier draft of both this ADR and `README.md` claiming the licence "permits
  commercial use" was removed rather than softened — nothing in the registry established it.