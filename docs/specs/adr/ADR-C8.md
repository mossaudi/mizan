# ADR-C8 — A third-party support-gap figure is cited through a registry, never printed from memory

- **Status:** Accepted
- **Accepted:** 2026-10-01
- **Source:** the CEO strategic review of 2026-10-01, which asks for a published support-gap figure

## Context

The strongest criticism of this project is that "any search tool can do it". The rebuttal needs a
number, and the number is not ours: the finding is that a cited answer is usually not *supported* by
its citation, measured by somebody else.

`docs/value-proof.md` opens by promising that every number printed in it comes from a file committed
to this repository. Rules ten and fourteen keep that promise honest — a benchmark figure the artefact
does not publish fails the build, and so does any answer-quality claim. A third-party figure had
nowhere to go. The only detection rate the committed artefact publishes is 100.0%, which answers
nothing about the market.

So the specification's headline was a support-gap line. The figures it named could not be traced to a
source: the two percentages it paired are not published together by anyone, and one of them matches
an unrelated industry survey. Printing a number a judge cannot open would have been the exact defect
class this repository exists to prevent, in the document whose whole purpose is to be believed.

The verifiable version of the same claim is stronger anyway, because it can be cited: a study of
eight AI search tools found more than 60% of 1,600 citation queries returned the wrong source, and a
peer-reviewed audit of seven LLMs found between 50% and 90% of responses are not fully supported by
the sources they cite. Both are registered in `data/registry/external-claims.json` with a URL, a
retrieval date and a scope.

## Decision

A third-party figure may be printed in an audited document if, and only if, it resolves to an entry
in `data/registry/external-claims.json`. The entry records the figure, the sentence it supports, the
publishing organisation, a URL, the date it was retrieved, what it measures and for whom, and
`ownsVerdict: false`.

A document attributes a figure by writing `external-claim:<id>` beside it. `packages/mizan-gate/src/docs-external.ts`
reports a marker that resolves to no entry, and reports a cited entry with no `url`, no `retrievedOn`
or no `scope` — the three fields that turn a remembered number into a checkable citation.

## Rationale

The alternative was to weaken the opening promise: "every number below is either measured here or
cited". That sentence is true and unfalsifiable at a glance, which is the property this repository
refuses. Admitting a second class costs a registry, a marker and a rule, and it leaves the promise
literally true: a registry entry *is* a file committed to this repository, and a figure with no entry
is a build failure.

`ownsVerdict: false` is present on every row for a reason that is not decoration. A registry that
could record a figure this project measured would collapse the boundary ADR-C2 draws between a
computed verdict and a cited opinion, and the field makes the boundary machine-readable rather than a
sentence in a document.

The scoping decision that keeps this honest: rule ten's `SECTION_TOPIC` was **not** widened. It is a
heading pattern, and a figure can be made to pass by renaming a heading, so the external class is
marked in the text instead. A cited third-party figure inside a benchmark-titled section passes rule
ten because a second committed authority publishes it, and the citation is required by this rule — so
the two changes are one change.

That left a hole, and it was reported as one during review: rule ten's heading scope means a figure
printed *above* the benchmark section, or under a heading that does not match `SECTION_TOPIC`, is
policed by nothing. `93%` typed into a comparison table passes while the document's opening sentence
is false. A published invariant that is not the enforced one is the defect class this repository is
about, so the decision above was amended rather than left aspirational.

The amendment is scoped by **document**, not by section, and to one document. `docs/value-proof.md` is
the only audited document that asserts every figure in it comes from a committed file, so it is the
only one where an unsourced percentage falsifies something the document claims about itself. Every
percentage anywhere in its body must resolve, **on the line that states it**, to a **rate** that
document attributes there to a named field of the artefact, or to a registry entry; a percentage that
resolves to a registry entry is left to the marker rule above, which reports the more specific defect.

Attribution, not the artefact's whole number space, is the amendment inside the amendment. Asking only
"does the artefact publish a figure that renders as this one?" admitted every numeric field, and the
artefact publishes counts: `40%`, `27,234%` and `2%` all passed on the strength of `caseCount`,
`corpusRecordCount` and `schemaVersion`. The sharper hole was arithmetic coincidence — `65` is
`baselineTop1HitRate`'s whole-number rendering, so "the incumbent misses 65% of its citations" passed
on the strength of a figure measured **here**, which is the unsourced market claim this ADR exists to
refuse. So a rendering is credited only where the document names the rate it belongs to, by the two
shapes rule ten already reads: a table row labelled `` `Artefact field` ``, and a sentence naming the
quantity beside the figure. The row that prints `65.0%` beside `` `baselineTop1HitRate` `` credits
`65.0`; a sentence printing `` `baselineTop1HitRate` is 65% `` credits `65`; a `65%` that names neither
fails. `caseCount`, `corpusRecordCount` and `schemaVersion` are not rates and are never credited, and
`delta` is a difference published in percentage points, which every document here prints as `pp`.

That credit is then **positional**, which is the amendment inside that one, and it was the third
version of this hole to be found — each by a probe rather than by reading. The credit was collected
into one document-wide set, so it carried no position: a rendering the document attributed *somewhere*
vouched for the same digits *everywhere*. Three sentences were appended to the shipped
`docs/value-proof.md`, `100.0% of the corpus text is Arabic.`, `0.0% of sources are English
translations.` and `100.0 percent of sources are translations.`, and each passed with `check:docs`
green — the benchmark table prints `100.0%` and `0.0%`, so the borrowing was spelling-exact, which is
worse than an open hole because it looks like a rule working. So `statementBacking` is keyed by line
and a percentage is admitted only where *its own line* makes the attribution. Per line is the right
unit rather than the cheap one: rule ten's own attribution is already read per line by `rowClaims` and
`proseClaims`, so the promise reuses the notion rule ten enforces rather than inventing a second one
(AGENTS.md §17). The limit is named rather than hidden: a claim hard-wrapped across lines must keep
the field name with its figure, and a percentage in the same sentence on another line is uncredited —
a window would have closed that at the price of a second, unverifiable notion of "near".

The same defect then appeared in the **registry** path, and it is the fourth version rather than a new
one. Scoping the marker rule to the whole body had been implemented as a single run spanning the
document, with the attribution read out of that run — so a registry figure was credited by a marker
*anywhere* in the file. The probe was one line: `60% of the corpus text is Arabic.` appended to
`docs/value-proof.md` passed `check:docs` green, on the strength of the Tow Center marker eleven lines
above a sentence fabricating a different statistic; `50%` and `90%` did the same against the two range
entries. A fabricated number backed by a real citation is worse than an unreported one, because the
citation is what a judge stops reading at.

So this ADR distinguishes two things that had been one. **Scope says which lines are examined; credit
says which lines are attributed.** Scope is unchanged by this amendment — the whole body of a document
that promises its figures, benchmark sections otherwise — because scope decides how much of a document
the rule reaches. Credit is per line, for both paths: a rate is admitted only where its own line names
the field it belongs to, and a registry figure only where its own line carries a marker for a matching
entry. One notion of position, the one rule ten already enforced, rather than one per path (§17). The
document pays for it in formatting: `docs/value-proof.md` wraps a figure together with its citation,
and the rule says in its own finding that a marker one line away attributes nothing, so the cost is
visible in the diagnostic rather than discovered later. Each registry figure now has exactly one
owning check as well — the marker rule reports it, and the promise rule delegates rather than reporting
a second finding for the same line.

Three limits are named here rather than left implicit, because a rule whose boundaries are unwritten is
the thing this ADR is correcting:

- **The other nine audited documents are not held to the promise**, because none of them makes it.
  `README.md`'s `41.7%` and `99%`, `INTEGRITY.md`'s `8%` and `DISCLOSURE.md`'s `19%` are heterogeneous
  figures from unrelated commits. A rule demanding all ten source every percentage would be satisfied
  by registering more numbers or switched off; the document that actually promises something is the one
  worth holding to it. `FIGURE_PROMISE_DOCUMENTS` in `packages/mizan-gate/src/docs-check.ts` is the one
  list that says which documents those are.
- **A percentage is a figure followed by `%` or by `percent`.** A figure written `0·6`, or a share
  expressed as `1 in 3`, is invisible to this rule. The shape is mechanical and no amount of
  diligence makes it total.
- **Attribution is a name, not a context.** The rule reads the quantity a figure is stated *for*, never
  who the sentence is about. A percentage that names a rate passes even if the surrounding prose is
  about a competitor — "the incumbent misses 65% of its citations, and our own `baselineTop1HitRate` is
  65%" satisfies it — while a competitor's figure that matches none of our rates and cites nothing
  fails. Reading the subject of a sentence would need a list of the ways this document refers to
  itself and to other products, which is the phrase list that made an earlier rule in this repository
  wrong the first time.

## Consequences

- The market claim is a *cited* figure with a retrieval date, not a headline. It is attributed, not
  owned, and the registry's `scope` field says which domain was measured: neither study is about
  religious text, and the document says so.
- `value-proof.md` no longer claims that every figure in it is measured here. It says which class
  each figure belongs to, and the opening sentence survives the change.
- URLs in the registry are data. No build step, test or gate fetches them, `check:docs` runs fully
  offline, and G-4 sweeps the file like any other committed JSON, so recording a source cannot
  introduce an outbound request.
- A fork that prints no third-party figure needs no registry, and the rule stays silent. A fork that
  prints one and ships no registry fails the build, which is the fail-closed direction.
- The anti-gaming guard is testable: the planted violation is a registry figure printed inside a
  benchmark-titled section with no marker, and it must fail because of this rule and not because a
  heading was renamed.
- A document can print both ends of a published range. `stanford-unsupported-share` and
  `stanford-unsupported-share-upper` are two entries sharing one `source` and one `url`, because one
  published measurement has two ends and the promise rule reports any percentage no entry vouches for.
  One entry per measurement would have meant printing `90%` from a registry that only published `50`.
- **The promise rule has a planted violation per shape it refuses: a count written as a percentage, a
  difference written as a percentage, a rate's rendering this document never attributes, and a
  rendering borrowed from an attributed line somewhere else in the document. All four are asserted to
  fail, because a rule stated only by the prose above it is the defect this ADR keeps correcting. The
  fourth is asserted against the *shipped* file rather than a fixture, since the evidence was that the
  shipped spellings were the borrowed ones.
- **The registry path has its own planted violation, run against the shipped file too.** One line per
  registry figure — `60`, `50` and `90` — is inserted into `docs/value-proof.md` and each must fail with
  the marker's finding naming the planted line, and with no second finding for the same defect. The
  non-finding is asserted beside it: the same digits with their marker on the same line pass, because
  the rule is about position and not about the numbers.
