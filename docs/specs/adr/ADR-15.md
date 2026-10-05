# ADR-15 - Per-collection anchor derivation, and a floor under the fabrication set

- **Status:** Accepted

## Context

`buildSimple` — the builder for the two red-team classes that need no substitution pool,
`letter_transposed` and `word_inserted` — read its cases with `mainAnchors(db).slice(0, count)`.

`mainAnchors` is `collectionsOf(db).flatMap(...)`, so it arrives **grouped by collection**: five
abudawud anchors, then five ibnmajah, then malik, and so on. Slicing the front of a collection-grouped
list is the same operation as slicing its first collection. With `MAIN_ANCHORS_PER_COLLECTION = 5` and
`count = 8`, both classes drew from abudawud alone and into ibnmajah.

The committed set therefore covered three of the six collections `attestation.json` serves:

| Collection | Red-team cases before | After |
| --- | --- | --- |
| abudawud | 22 | 15 |
| ibnmajah | 16 | 13 |
| malik | 2 | 5 |
| nasai | 0 | 3 |
| quran | 0 | 2 |
| tirmidhi | 0 | 2 |

**Nothing else noticed.** Every other check on that set passed, and that is the reason this was
worth an ADR rather than a bug fix:

- the declared class counts matched, because the counts were the thing the slice honoured;
- all forty fabrications were genuinely absent from the whole corpus, the check that exists to catch a
  fixture asserting the verifier is wrong;
- the verifier returned the declared verdict for all forty, so `falseVerifiedCount: 0` was a true
  statement;
- `anchorProblems`, the adjudication staleness check and `apps/cli/test/eval.test.ts` were all green.

The defect was that a fabricator is only shown to be contained if it was *asked about that
collection*. Half the served corpus had never been asked to be falsified by a pool-free mutation, and
every artefact reporting on the set reported only totals — which is precisely the number the defect
leaves unchanged. This is the AGENTS.md section 16 failure mode in a form no honesty rule covers: not
a fabricated answer, but an unfalsified one.

Two things were tempting and both are wrong. **Widening the pool** would have produced more abudawud
cases, because the slice is positional — the missing property was the *order* cases are drawn in, not
the number available. And **raising the anchor count** per collection would not have helped either,
for the same reason.

## Decision

Fabrication anchors are drawn **round-robin across collections**, and a docs rule requires every
served collection to appear in the red-team set.

1. `scripts/eval/selection.ts` owns the order. `interleaveByCollection` takes a pool and a count and
   returns one candidate from each collection in turn before any collection yields a second. It is
   pure: no corpus, no clock, no environment, no sort. `scripts/eval/selection.test.ts` asserts the
   whole rule against a twelve-element array, with the old `slice` behaviour planted as the failing
   case.
2. Only `buildSimple` uses it. `buildMainClasses`, `buildElide` and `buildInjection` keep their
   offsets, because the golden set's 200 cases and their `golden-NNN` ids are load-bearing —
   `data/eval/adjudication.json` is keyed by those ids, and reordering the golden set to fix a defect
   that does not exist there would invalidate forty human rulings for nothing.
3. Each pool-free class takes a disjoint window of the interleaved sequence (offsets 0 and 8), so
   `letter_transposed` and `word_inserted` do not quote the same twelve words twice.
4. The floor is `FABRICATION_COVERAGE_FLOOR = 2`, declared once in
   `packages/mizan-gate/src/docs-coverage.ts` and imported by the generator. Two is what the
   construction guarantees — one case from each of the two pool-free classes, per collection. A
   number above it would be a number the pipeline cannot currently meet, and a gate correct code
   cannot satisfy is a gate that gets disabled, which is how the original absence of any coverage
   check happened.
5. It is checked by `runDocsClaimChecks`, **not** by an eighth gate. `GATE_IDS` is a published claim
   (`checkGateCountClaim` fails `bun run check:docs` when any file states a different count), and a
   per-collection property about one artefact does not belong beside the seven repository-wide
   invariants.

The rule has four states, and the distinction is the point:

- **no attestation** — a repository that ships no corpus serves nothing and claims nothing about
  coverage. Skipped, for the same reason `checkSnapshotArithmetic` skips: a fork must not be failed for
  not shipping a file it never claimed to carry.
- **no set** — a repository with no fabrication set makes no claim. Skipped.
- **unusable attestation** — a claim that could be checked and was not made. A finding, so deleting
  `collectionCounts` from `attestation.json` cannot make the rule disappear.
- **below floor** — the finding the rule exists for.

The first and third are the pair that must not share a branch. `servedCollections` already draws that
line for R18 — an attestation that *exists* is a claim about the corpus, and one that cannot answer the
question has failed to keep it — so this rule reads the same `served`/`usable` pair rather than
re-deriving the distinction from an empty set. An earlier version read `served.size === 0 || !usable`
and reported a finding for both, which failed a repository shipping no corpus: an absent attestation and
an attestation stripped of its `collectionCounts` are the same empty set and two different claims.

An artefact that cannot be decoded is reported **unmeasured, never zero**: a published zero is a claim
about evidence nobody read.

### The rule recomputes the counts rather than reading `coverageRows`

`schemaVersion` 3 gives `EvalSet` a `coverageRows` field, so each set publishes its own per-collection
figures. `docs-coverage.ts` deliberately ignores it and counts `cases`. A gate that read the
artefact's own account of its coverage would be checking that a number agrees with itself; recomputing
is what makes the published row a **claim** rather than the **evidence**. The rows are still part of
the dataset digest, so editing one changes the set's identity.

## Consequences

- The red-team set's per-collection coverage is now a published, machine-checked property. Raising the
  floor is a separate change and must raise the anchors per collection at the same time.
- Fifteen anchor spans in `scripts/eval/anchor-texts.ts` (`redteam-022`..`028`,
  `redteam-033`..`040`) were redrawn, because those cases now quote different records. They were
  redrawn to the rule the table already states — 3-8 words cut verbatim from the case's own quote,
  contiguous in the cited record — and `anchorProblems` rejects any span that is not a folded substring
  of both, so a span carried over from the old case fails the build rather than locating in the wrong
  book.
- Fifteen `anchor` pointers in `data/eval/adjudication.json` moved with them. The **rulings did not**:
  `adjudicatedVerdict`, `adjudicatedReason`, `rationale`, `decidedBy` and `decidedOn` are untouched,
  because the ruling is about what kind of claim the case is and the pointer is about which record it
  was drawn from. `checkStaleAdjudication` is what forced the two to be distinguished: it refuses to
  write until the file on disk agrees with the table, which is the only way a human sees the move.
- The red-team set's `anchorCount` rises from 30 to 38. The README's breadth figure follows it, and
  `checkEvalBreadth` fails the build until it does — the drift this ADR records was real, so the figure
  was corrected rather than the claim deleted.
- `interleaveByCollection` returns what exists when the pool is thinner than the request, and never
  repeats a candidate. Padding with a re-used anchor would raise the count to satisfy a quota while
  lowering the evidence — the `silent mock` row of AGENTS.md section 16.
- A collection that legitimately cannot yield a pool-free fabrication is not exempt. It would have to
  be added to the rule as a declared exemption with a reason, which is a decision someone has to make
  in writing rather than a property the code assumes.
