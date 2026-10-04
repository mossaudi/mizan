# ADR-10 — One line per distinct text, and an order that does not depend on the machine

- **Status:** Accepted

## Context

The committed corpus stores the same Qur'anic text under more than one identifier — 31 records share
one folded text. A list that printed it once per identifier would read as 31 independent sources
under a rejection, which is the opposite of what the corpus says and the most damaging thing this
feature could do to a reader's trust in it.

Separately, a nearest-quote list is the first place in the product where a locale-sensitive
comparison could leak into the output: `localeCompare` is well-behaved on a developer machine and
well-behaved *differently* on a CI runner with different ICU data, and ADR-03's determinism
requirement is a property of the code rather than of the environment.

## Decision

- **Deduplicate by folded text.** Where several records share a folded text, exactly one is listed.
  The survivor is the comparator's winner — highest shared-trigram count, then lowest `recordId` —
  so the choice depends on the ranking and never on scan order, which is also why deduplication runs
  after ranking rather than during the scan.
- **Order by UTF-16 code unit**, never `localeCompare`. Same rule as `packages/mizan-gate/src/scan.ts`,
  for the same reason: collation order is a property of the ICU data on the machine that ran the
  check.
- Ranks are assigned **densely from 1** over the survivors. A rank is a position, not a measurement,
  and nothing divides by it.
- The result is identical across repeated runs and independent of the order rows arrive in. That is
  asserted in `packages/mizan-suggest/test/determinism.test.ts`, not merely intended here.

## Rationale

Duplicates are not a cosmetic problem. A judge counting lines is doing arithmetic we have already
done, and if our arithmetic disagrees with the screen the badge loses the argument it exists to win.
Choosing the survivor by the ranking rather than by "first seen" also means deduplication cannot
change *which* text is presented — only how many times.

Code-unit ordering is the same discipline the gates already use, and it is stated here rather than
inherited silently: the failure mode is a list that reorders between a developer's run and a judge's,
which looks exactly like nondeterminism in the thing we are asking to be trusted.

## Consequences

- `candidates.length` can be smaller than the number of records that passed the floor. `considered`
  reports the search scope, and the header prints both, so the screen never overstates coverage.
- A collection that stores the same text many times cannot inflate a list. `recordId` remains the
  identity used for the second, bounded read, so the metadata printed is the survivor's own.
- Any future ranking change must keep dedup after ranking, or a scan-order dependency returns with
  it.