---
name: impl-cr-round-scanner-resolution-and-delivery
description: Fixes for the CR round on the G-4 scanner-resolution module — relative-PATH fail-open, uncommitted tree, and undisclosed specs/ directory
tags:
  - implementation
  - security
  - mizan-gate
  - delivery
  - CR-fix
---

# CR round: G-4 scanner resolution + delivery hygiene

Three CR findings, all fixed and verified from a clean clone of the resulting commit.

## Finding 1 (High, Security/A04) — a relative PATH entry defeated the whole resolution rule

`probeOnDisk` returned `join(dir, name)` verbatim, so for a PATH entry of `tools` the candidate was
the relative string `tools\gitleaks.exe`. `isUntrustedScannerPath` then called `resolvePath(path)`,
which resolves against `process.cwd()` — but the child is spawned with `cwd` set to the **scanned
root**. The trust check judged one file and the child opened another. Reproduced end to end before
the fix: `path="tools\gitleaks.exe" absolute=false trusted=true`, the planted auditor ran, wrote `[]`,
and G-4 passed over a committable secret.

Three changes, in `packages/mizan-gate/src/gates/g4-scanner-resolution.ts`:

1. `probeOnDisk` returns `resolvePath(join(dir, name))` — absolute, always.
2. `segmentsOf(path, base)` resolves against the `cwd` it was **handed**, and
   `isUntrustedScannerPath` returns `true` for anything still not absolute (fail closed).
3. `directoriesAtRunTime` probes BOTH readings of a relative PATH entry (gate's own dir, and the
   child's dir under the scanned root), so a planted auditor is visible to the check that exists to
   refuse it.

`executableNames`' three names on win32 do not help here — the defect is in the *directory*.

Self-tests added in `packages/mizan-gate/test/gates.test.ts`: the planted relative-entry violation
(asserts `ok: false` **and** `spawned === 0`), a control where a relative entry resolving *outside*
the tree is still honoured (so the rule is not "always refuse"), and an unresolved-candidate
fail-closed check. Verified the self-test is a real tripwire: reverting only the
`resolvePath(cwd, dir)` line makes both new tests fail.

## Finding 2 (High, Delivery) — nothing was committed

52 modified + untracked paths, including two load-bearing for the **default** lane
(`data/eval/article-coverage.json` is read by `scripts/article-determinism.test.ts`;
`g4-scanner-resolution.ts` is imported by `g4-gitleaks.ts`, so `mizan-gate` did not typecheck on a
clean clone).

Committed as `6639708`. Verified by cloning to a fresh directory, `bun install --frozen-lockfile`,
then `bun run ci` → **CI GREEN**, `bun run accept:customer` → green with the three corpus-attested
steps honestly reported as not-run, `bun run ci:clean-clone` → 6/6, `bun run check:docs` → OK.
Zero untracked files remain.

## Finding 3 (High, Scope) — 382 KB of undisclosed `specs/`

`docs-gates.ts:249` already declares `specs/` in `GATE_CLAIM_EXCLUDES` as a planning-note location,
so it is a *known* directory. Added `/specs/` to `.gitignore`, stating the same decision and
pointing at the declaration that already carries the reason.

**The trap worth recording:** the rule must be **anchored** (`/specs/`, not `specs/`). Unanchored it
also matches `docs/specs/`, and the first version silently un-tracked ADR-19…ADR-23 while
`git status` went quiet — four deliverables on disk and absent from the repository. Both directions
are now asserted in the comment:
- `git check-ignore --no-index -v docs/specs/adr/ADR-19.md` → prints nothing, exits 1
- `git check-ignore --no-index -v specs/adr/<note>.md` → prints the rule, exits 0

## Also fixed: a pre-existing Windows EBUSY flake in `mizan-retrieval`

`bun run ci` was red before any of the above, ~1 run in 5, in `test/search.test.ts`'s `afterAll`.
Root cause was not the retry budget:

- `rmSync(maxRetries: 10)` retries the **syscall**; it never re-runs the collection, and the handle
  is released by the collector. Measured 12/12 failures with no collection.
- `Bun.gc(true)` is a collection **request** over what is already *unreachable* — and a module-level
  `const db` is reachable until the module is torn down, i.e. *after* `afterAll`. So the one handle
  the cleanup existed to release was the one it could never collect.

Fixed at the cause: the handle moved into a mutable box the teardown clears, plus a forced
collection interleaved between attempts (25/25 clean at 2.0 attempts average). Two budgets were then
tuned against measurements rather than picked:

- 200 attempts removed EBUSY entirely but cost **6.5 s**, over `bun test`'s 5 s hook limit, so the
  suite went red with "a beforeEach/afterEach hook timed out" — a worse message about the same
  directory. 40 attempts (~1 s worst case, ~50 ms typical) is the set value, because the *mechanism*
  does the work and the budget only absorbs residue.
- Exhaustion warns and names the directory rather than throwing: `buildSnapshot` and the search path
  both prepare statements, and on Windows a statement can outlive `close()` indefinitely. A leftover
  temp directory may not fail a retrieval suite — which is the exact defect the file's own history
  records ("the test reports a filesystem error instead of a retrieval result").

Result: 40/40 consecutive clean runs.

## Carried forward

`MS2-1` (root-coverage artefact over 1,651 roots) remains **not executable**: `CorpusRecord` has no
root/stem/lemma field and a repo-wide search returns zero hits. Sprint 1 does not claim it.