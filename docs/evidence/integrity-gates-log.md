# Integrity-gates log — SB-004

Captured 2026-10-06, repository root `C:\Users\Saudi\Desktop\mizan`, Windows 10, Bun, working
tree as of the Sprint 1 deliverable. Every command below is reproduced exactly as run; every
timing is a stopwatch measurement of that run, not a prediction. The purpose of this document is
to record, once, what the Sprint 1 acceptance criteria demand and what the repository answered —
so a later reader can re-run the two commands and compare.

## 1. Full CI passes, and exits 0

Command: `bun run ci`

Result:

```
PASS  apps/cli                   @mizan/cli         types pass  test  pass
PASS  apps/web                   @mizan/web         types pass  test  pass
PASS  packages/mizan-agent       @mizan/agent       types pass  test  pass
PASS  packages/mizan-bench       @mizan/bench       types pass  test  pass
PASS  packages/mizan-core        @mizan/core        types pass  test  pass
PASS  packages/mizan-corpus      @mizan/corpus      types pass  test  pass
PASS  packages/mizan-gate        @mizan/gate        types pass  test  pass
PASS  packages/mizan-mcp         @mizan/mcp         types pass  test  pass
PASS  packages/mizan-provenance  @mizan/provenance  types pass  test  pass
PASS  packages/mizan-retrieval   @mizan/retrieval   types pass  test  pass
PASS  packages/mizan-suggest     @mizan/suggest     types pass  test  pass
PASS  packages/mizan-verify      @mizan/verify      types pass  test  pass
PASS  scripts                    @mizan/scripts     types pass  test  pass
PASS  gate G-1
PASS  gate G-2
PASS  gate G-3
PASS  gate G-5
PASS  gate G-6
PASS  gate G-7
PASS  gate G-4
CI GREEN
```

Wall time: 217.8 s, exit code 0. All 12 workspace packages typecheck and test green, plus the
`scripts` runner entry (`@mizan/scripts`) the runner reports alongside them; every listed gate
passes.

Re-run on the same tree before this evidence was submitted: `bun run ci` again exited 0, again
printed `CI GREEN` with the same thirteen `PASS` package lines and the same seven `PASS gate` lines
in the same order, and measured 219.0 s stopwatch — 1.2 s of test-order variance on the same
working tree, which is the reproducibility this section exists to show.

## 2. The gates can fail, and the failure names its package

This is the property the others rest on — a gate that cannot fail is not a gate (`AGENTS.md` §14).
The planted-violation proof lives in `packages/mizan-gate/test/ci.test.ts` (the acceptance
criteria test that runs a real `bun run ci`: a package whose typecheck fails is reported as
`FAIL  packages/<name>` and the run exits non-zero). This document does not replant a violation
to demonstrate it; the test suite asserts it on every `bun run ci`.

During this Sprint the property held three times for real:

- **Typecheck.** `bun run ci` reported `FAIL  packages/mizan-gate` with the two new gate-package
  test files whose index reads were `string | undefined` under `noUncheckedIndexedAccess`. The
  fix (narrow before asserting) landed in `docs-degradation-conformance.test.ts` and
  `docs-v7-reconciliation.test.ts`, and the same run then went green. The failing package was
  named; the exit code was non-zero.
- **Surfaces a judge reads, a live catch.** When the two `submission/` deck sources
  (`make_deck.py`, `make_deck_ar.py`) were removed from the tree, `bun run ci` reported
  `FAIL  packages/mizan-gate` with four failing corpus-surface tests (deck framing, deck name
  table, audited-surface set) and exited non-zero; restoring the two sources from the parent
  commit returned the run to green. The package was named; the exit code was non-zero.
- **G-4, a live catch.** The very first gates-only run of this session failed gate G-4 with one
  finding: the working tree's `.env.example` line 46 carried a credential-shaped value where the
  committed file has an empty assignment. The scan that caught it is the exact invocation the
  gate uses (`gitleaks detect --source . --no-git --redact` — `--no-git` because the working
  tree, not history, is what a commit would ship). The value was uncommitted drift; the fix was
  `git checkout -- .env.example`, restoring the committed baseline. G-4 then passed. This is the
  fail-closed behaviour on purpose: a credential-shaped string is refused, not warned about.

## 3. `check:docs` is fast and catches stale claims

Command: `bun run check:docs`.

Result:

```
check:docs OK — 10 audited documents, 37 corpus surfaces, 9 evidence artefacts read; 347 files swept for gate-count and ADR citations.
  no claim disagrees with the repository.
```

Wall time: 1.3 s (requirement: under a minute). The corpus-surface sweep covers every Sprint 1
addition — `docs/evidence/`, `docs/specs/v7-reconciliation.md`, `docs/specs/adr/ADR-16.md`,
`docs/specs/adr/ADR-18.md` — together with the two `submission/` deck sources the corpus-surface
framing tests read, and reports no claim disagrees. Re-run before submission: 1.2 s, exit 0, same
report text. The negative case (a document naming a gate count the build does not hold) is asserted
in the gate package's own tests rather than re-demonstrated here, for the same reason as section 2.

## 4. `bun test` at the repository root refuses by design

Command: `bun run test` (the root script; section 8 of `AGENTS.md` makes the raw `bun test`
globbing hazard the reason it exists).

Result: exit code 1. The script prints the three legal entry points (`bun run ci`,
`bun run ci:test`, `bun run ci:gates`), says to `cd` into one package and run `bun test` there,
and cites `AGENTS.md` section 8. It does not run, and it does not report a misleading green.

## 5. `.env.example` and the code name the same variables

Rule R2 in the docs-claim suite compares the assignment lines the example file documents against
the `ENV_*` constants `apps/cli/src/provider-config.ts` reads, and `.env.example` is one of the
audited documents in the report above. "no claim disagrees with the repository" is therefore a
parity verdict, not a separate manual audit. The rule's own planted violations live in
`packages/mizan-gate/test/docs-claims.test.ts` ("R2 — .env.example and the code must name the
same variables"): a variable in one and not the other is a red build.

## What this log records

Four of the five Sprint 1 acceptance criteria above were met by running the deliverable and
transcribing its output; the two that require a planted failure are met by the test suites that
plant one (and by the three real failures this Sprint happened to provide). The fifth — G-4 — was
met by the gate catching exactly what it exists to catch, which is the strongest form of the
evidence. The root-refusal check in section 4 was re-run at submission time and again exited 1 with
the same refusal text. Re-running `bun run ci` and `bun run check:docs` on this working tree
reproduces every line printed above.