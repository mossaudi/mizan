---
name: impl-cr-round-request-vocabulary
description: CR round on the article sprint — a malformed request reported as a malformed cursor, a speech-introduced span that carried its own attribution, and two declarations of one chunk cap
tags:
  - implementation
  - mizan-verify
  - mizan-mcp
  - AGENTS-16
  - CR-fix
---

# CR round: request vocabulary, span boundaries, one declaration

Seven findings across two review passes. Four change behaviour a judge can observe; two are §17 drift a
reader auditing the code would have been misled by; one is a log line carrying an OS account name. The
round's own artefact was also wrong about its scope, which is recorded in Finding 1 rather than corrected
silently.

## Finding 1 (Should Fix, Scope) — the G-4 rewrite was owned by no Sprint 1 story

`g4-scanner-resolution.ts` (189 new lines) and 588 lines of gate self-tests landed in the same commit as
the article sprint, and none of MS1-1…MS1-9 mentions secret scanning or scanner resolution. The plan
names R-9 as the scope authority, so a security gate's resolution order has to be findable under a
story rather than only in a diff.

**Recorded here, and the plan is NOT reconciled — that is stated rather than papered over.** `6639708`
is published and `ci:clean-clone` reproduces it, so splitting it would trade a documentation gap for a
force-pushed branch. The work is therefore owned by this record, under the identifier below:

> **MS1-10 — G-4 binary resolution and secret-gate hardening.** *Independent · negotiable (which probes
> are on by default) · Must · S.* `probeOnDisk` returns an absolute path; the containment check resolves
> against the `cwd` it was handed rather than `process.cwd()`; anything still unresolved fails closed;
> and a relative PATH entry is probed under both readings. Success: a planted relative entry fails the
> gate with `spawned === 0`, and a relative entry resolving outside the tree is still honoured, so the
> rule is a check and not a blanket refusal.

**The reconciliation is a PM action, not an SE one, and it has not happened.** Two consequences a reader
must not be misled about:

- The scope-authority plan `spec-article-verification-deal-2026-10-08` sizes Sprint 1 at **eight**
  stories, `S1-1…S1-8`. This document, and the implementation it describes, work in the `MS1-*`
  namespace and reach **ten**. There is no `specs/` directory in this repository — `.gitignore` anchors
  `/specs/` — so `Select-String` over the tree finds no `MS1-10` outside this file, and the wiki article
  is the only plan.
- `MS1-3` (span selection with a published selection-recall denominator) was likewise promoted out of
  the CEO's eight, for the reason its own INVEST block gives: R-1's only mitigation is a tripwire, and
  a tripwire is untestable while selection and reporting ship as one unit.

So: **ownership of `MS1-3` and `MS1-10` is recorded in this document, and the plan is unreconciled.** The
previous version of this file claimed `MS1-10` "is therefore added to the plan and to the sprint table",
which was false — the step asserted was the one step not taken, and asserting it is the defect this
round exists to remove.

## Finding 2 (Should Fix, Reliability §16) — four request defects reported `malformed_cursor`

`{document: 42}`, `{}`, `{document:'x', chunkSpans: 0}` and `{document:'x', cursor: 7}` all returned
`malformed_cursor`, while the header claimed each reason "is distinct from every other". Three of the
four never read the cursor at all. An integrator whose `document` is a number was sent round the
cursor-retry loop forever, repairing the one field that was not the problem.

Added `malformed_request` to `ARTICLE_REFUSALS` and `malformed_request: null` to `CONDITION_OF_REFUSAL`
— the derived `Record` key type is what makes omitting it a `tsc` error rather than a review comment.
`planArticleChunk`'s two request-shaped refusals route to it; the cursor path is unchanged, so
`{document:'x', cursor: 7}` is a request defect (the field has the wrong TYPE) while a cursor that is a
well-formed string of nonsense is still a cursor defect. `test/article-contract.test.ts` asserts both
sides, because the obvious regression of this fix is the collapse the reviewer originally found.

## Finding 3 (Should Fix, Correctness) — the speech-introduced span carried its own introducer

`"He said, the believing servant is like a mountain of faith"` emitted the whole sentence INCLUDING
`He said,`. Containment can never match that — `He said,` appears in no record — so the span was
structurally unverifiable while still being counted in `extracted`, which is the NUMERATOR of the
published selection-recall figure R-1 is graded on. `sharedRunChars` was additionally crediting the
corpus with attribution words the corpus never contained.

The introducer and the punctuation separating it from the quote are now trimmed.

## Finding 3a (Must Fix, Correctness) — `SPEECH_INTRODUCERS` claimed a word boundary it did not have

`lower.indexOf(verb)` has none, and the header said "matched on a word boundary" — which made the claim
checkable and it failed. `قال` matched at index 1 of `مقالة` and index 2 of `القالون`, so the published
span was `ة جميلة جدا`: text the author never wrote, cut mid-token. In English, `reported` matched inside
`unreported` and the span became `facts are not evidence` — **the difference is a negation**, which is the
whole reason a span has to be the author's words rather than a substring resembling them.

Anchored with `isWordBoundary` over `\p{L}\p{M}`. The marks are in the class so a vocalised `قَالَ` is not
read as `قال` followed by a boundary and trimmed out of the middle of a word. Each verb now scans forward
past a rejected mid-word hit, so a real introducer later in the same segment is still found.
`مقالة`, `القالون`, `unreported` and a vocalised verb are pinned as regression tests, each with a control
asserting the selector still emits a span when it should.

This also removed the longest-verb tie-break: `قال` at index 0 of `قالوا` is followed by the letter `و`,
so the boundary rule rejects it outright and `قالوا` is the only candidate. One rule rather than a rule
plus a tie-break a later edit could get wrong.

## Finding 4 (Should Fix, §17) — `MAX_SPANS_SUGGESTED_PER_CHUNK` restated `MAX_SPANS_PER_CHUNK`

The comment said the budget "is the chunk's span count, deliberately"; the code said `= 32`, and the test
pinned the literal on both sides. Raising `MAX_SPANS_PER_CHUNK` to 64 left the budget at 32 with its
comment still asserting they were one number — a reader checking the comment would have been told
something false by the code.

`MAX_SPANS_PER_CHUNK` now has one declaration, in `packages/mizan-verify/src/document-segments.ts`, and
`@mizan/mcp` re-exports it so the boundary's cap stays visible at the boundary. `apps/cli` derives its
budget from it. The boundary's equality with `MAX_CLAIMS_PER_CALL` remains an assertion in
`article-contract.test.ts` rather than a comment.

**The fix's own comment claimed a property the code did not have, and a reviewer caught that too.** It
said the constant is "declared once, beside `chunkWindow` — the function that consumes it", but
`chunkWindow(segmentCount, from, chunkSpans)` takes the span count as a *parameter* and never reads the
constant; the real consumers are `planArticleChunk` here and `MAX_SPANS_SUGGESTED_PER_CHUNK` in `apps/cli`.
This is the fourth comment in this repository that asserted a code-level property and was false when
written, so all three sites now name the actual consumers.

## Finding 5 (Should Fix, Correctness) — the comma terminator truncated a quotation and recorded no gap

`/[.!?۔؟،,;:]/` — added in this round to make the rule script-independent — cuts the speech span at the
first comma and keeps only the prefix:

```
"He said, the believing servant is like a mountain, and whoever does not follow it is astray."
   spans: ["the believing servant is like a mountain"]
   gaps : []                       considered: 1
```

The delimited rule handles the identical sentence whole. 58 characters of quotation-shaped text were
dropped, **not** recorded as a `SelectionGap`, and the segment therefore read as fully examined while half
of it was never checked and never named as unchecked. That is R-1's exact shape — material hidden by not
emitting it — arriving through a *precision* change rather than a selector omission, and the comment
defending it as "fail-closed" was true of the verdict and false of the coverage count.

**Fixed by removing the mid-span cut, not by recording a gap for it.** The sentence splitter in
`./ssr.ts` has already decided where sentences end, so the text after an introducer is one sentence and
cutting it further is a second splitter disagreeing with the first. A selector may emit a span the
verifier will reject; what it may not do is emit part of one and say nothing about the other part. The
comma is now only ever a LEADING separator (`LEADING_SEPARATOR`), and the only punctuation trimmed at all
is a trailing sentence terminator (`TRAILING_SENTENCE_END`).

`MAX_SPEECH_TAIL_CHARS` is gone with it: a 120-character cap truncated a long tail into something that
looked checked, and `MAX_QUOTE_CHARS` — imported from core, so it is the one bound the verifier also
applies — is enforced by `bounded` as a REFUSAL that `gapReasonFor` names. The dead ternary in `bounded`
(`return segment.length > MAX_QUOTE_CHARS ? [] : kept`, where both arms are `[]` at that point) went with
it, and `bounded` no longer takes the segment it never used.

Tests: the 58-character sentence above now yields one span and no gap; a three-segment document asserts
`accounted(result) === 3`; and the Arabic `،` case asserts the same rule rather than a matched pair of
terminators that could drift apart again.

## Finding 6 (Should Fix, §17) — a private `posix` contradicted "one declaration"

`scripts/benchmark.corpus.test.ts` carried its own copy of the separator helper while `ci-lanes.ts`
exported one and documented that "the spelling is one declaration and both callers import it" — a
sentence that was false at the moment it was written. Both copies computed the same string, so no
assertion was wrong; the cost was that an audit of the separator had to find two definitions to be sure
there was one. The copy is gone; the file already imported from `ci-lanes.ts` for `laneOf`.

## Finding 7 (Should Fix, §13) — the green G-4 verdict printed an absolute path

`probeOnDisk` returns `resolvePath(...)`, and the green line interpolated `resolution.ignored.join(", ")`
straight into it, so a passing run read `no leaks found (refused to run C:\Users\Saudi\…\gitleaks.exe)`.
AGENTS.md §13 forbids PII in a log line and a green CI log is the most public surface this program has.

`candidateLabels(paths, root)` now names a candidate relative to the tree under audit when it is inside
it and by file name alone when it is not, and both G-4 messages go through it. The tree-relative form is
kept rather than reducing everything to a basename because `node_modules/.bin/gitleaks.exe` is the
evidence a reader needs and `gitleaks.exe` is only a word; the full absolute paths stay in
`resolution.ignored`, which a reader on the machine can print for themselves. Three tests pin it: the
planted-auditor message names the relative path, a green verdict contains no absolute prefix, and an
outside-the-tree candidate is named by basename.

Also in the same pass, because a reviewer had already flagged both as Low: `documentDigestOf` is hoisted
to one `const` per chunk in `planArticleChunk`, and the dead ternary in `directoriesAtRunTime` is gone
(`resolvePath` on a relative always returns absolute, so the guard could never be false).

## Verification

`bun run ci` → CI GREEN, 13/13 packages, G-1…G-7, gate count unchanged at seven. `bun run check:docs` →
OK. `bun run accept:customer` → ACCEPTED. `MAX_SPANS_SUGGESTED_PER_CHUNK` identity is asserted against
`MAX_SPANS_PER_CHUNK` rather than against a literal.

Two figures in this file are environment-dependent and stated as such rather than quoted as absolutes:
the installed runtime is **bun 1.4.2** while `package.json` pins `engines.bun` to **1.3.14**, and that
drift is unresolved.
