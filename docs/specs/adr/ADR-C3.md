# ADR-C3 — The web UI is a static, framework-free, text-node page

- **Status:** Accepted
- **Accepted:** 2026-09-29
- **Source:** `specs/for-this-project-need-to-deep-honest-review-and-analysis-and-val.md` §7

## Context

The submission requires a `منتج متكامل قابل للتشغيل` (a complete, runnable product), and the
repository had no HTML anywhere. The obvious answer to "no UI" is a UI framework, and gate G-2
already bans `innerHTML`, `dangerouslySetInnerHTML`, `{@html` and `document.write` across the
whole tree.

## Decision

Ship **one** static, framework-free page that renders the three badge lines as DOM text nodes,
driven by the same verdict map the CLI uses (`badgeFor` in `@mizan/core`). No bundler, no UI
framework, no client runtime, no network request to render.

## Rationale

- **G-2 compatibility:** a framework reintroduces exactly the HTML sinks the gate exists to forbid,
  and the gate would have to be weakened to admit it.
- **Dependency surface:** 2026 supply-chain caution argues against a client toolchain that ships
  thousands of transitive packages to render three lines of text.
- **CI budget:** the page is a build-time render of a committed fixture, so it adds no test time
  and no runtime to debug.
- **YAGNI:** rich interactivity is a Could, and a Could that costs a gate is not a Could.

## Consequences

The decision imposes six requirements, and each is checked rather than trusted:

- One entity encoder, total over `& < > " '`, used by every string the page emits.
- Text nodes only — the badge lines and the corpus quotes are inserted as characters, never as
  markup, so corpus text stays untrusted input by construction.
- The fixture is decoded at the boundary before anything is rendered, so a malformed committed file
  fails the build rather than the browser.
- No `<script>`, no external `<link>` or `src`, no `fetch` — the page renders from `file://`.
- The gates read markup as well as code: `CODE_EXTENSIONS` and `GATE_CLAIM_EXTENSIONS` include
  `.html`, so a raw sink planted in the committed page is a red build rather than something only
  the page's tests would catch, and a gate count printed on the page is checked against the runner
  like a gate count printed anywhere else. Widening an extension is safe here because every gate
  matches sink tokens (`innerHTML`, `document.write`, `eval(`) rather than markup itself.
- **The provider mode is shared, not restated.** The page prints `transcriptLabel(fixture.transcript)`
  from `@mizan/core` — the same function `apps/cli/src/render.ts` calls — so a replay reads
  `PRECOMPUTED (deterministic replay)` in a browser and in a terminal by construction rather than by
  two strings agreeing. The label is required in the fixture schema, so a page cannot describe a mode
  outside the two `RunTrace` admits, and `apps/web/test/page.test.ts` reads the mode back out of
  `data/transcript.json` rather than trusting the fixture to declare its own honestly.
- **The same reasoning governs the runbook, as a docs rule rather than a gate.** `R16` in
  `packages/mizan-gate/src/docs-runbook.ts` fails the build when `docs/demo-runbook.md` offers the
  replay before the keyed live run, documents only one of the two, or shows a step without the label
  that step prints. It is a docs rule and not an eighth `GATE_IDS` entry because the gate count is a
  published claim, and no formatting rule is worth changing what the repository says about itself.

Rich interactivity is deferred to the Could list and disclosed as deferred rather than half-built,
and any number printed on the page enters the docs-claims gate like any other document.
