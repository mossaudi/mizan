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

The decision imposes these requirements, and each is checked rather than trusted:

- One entity encoder, total over `& < > " '`, used by every string the page emits.
- Text nodes only — the badge lines and the corpus quotes are inserted as characters, never as
  markup, so corpus text stays untrusted input by construction.
- The fixture is decoded at the boundary before anything is rendered, so a malformed committed file
  fails the build rather than the browser.
- No `<script>`, no external `<link>` or `src`, no `fetch` — the page renders from `file://`.
- **`.html` is read by the gate sweep for gate-count and ADR claims, and nothing more.**
  `GATE_CLAIM_EXTENSIONS` includes `.html`, so a number or an ADR citation printed on the page is
  checked like one printed anywhere else.
- **G-2 is NOT the control for this page, and the reason is structural rather than an oversight.**
  Its rules match *sink tokens* (`innerHTML`, `document.write`, …), and an HTML file has no sink
  tokens — it has tags. It also scans in `"code"` mode, which blanks string bodies, so a sink
  written inside an attribute value is invisible to it too.
  `packages/mizan-gate/test/gates.test.ts` measures the boundary rather than asserting it: a sink
  API inside a `<script>` body is caught, and an injected `<script>`, an inline `on*=` handler, a
  `javascript:` URL, an `<iframe>` and a `<meta http-equiv="refresh">` redirect are all missed.
- **The page's own control has two halves, and they are not equally general.**
  *Byte-identity* — the committed `index.html` equals a fresh `renderPage(fixture)` — is the general
  one: it catches ANY hand edit to the file, whatever shape, because the edit is then not what the
  renderer produces. *Shape assertions* over the committed bytes (`INJECTABLE_ELEMENT`,
  `INLINE_HANDLER`, `JAVASCRIPT_URL`, `META_REFRESH`) are the specific one, and they are a **named,
  tested list, not a proof of anything**: they assert that the shapes listed are absent, and every
  entry of that list is planted by the arming test so the list cannot rot into matching nothing.
  - An inline handler is matched only if it is expressed the way `INLINE_HANDLER` expresses it, which
    is why that pattern consumes quoted attribute values as units
    (`<div data-x=">" onmouseover="alert(1)">` is a live handler, and a `[^>]*` class misses it).
    **Residual gap 1: an unterminated quote**, which no browser needs to accept.
  - A `<meta http-equiv="refresh">` redirects the page without executing a line of script, uses
    neither `src` nor `href`, and needs no entry in `INJECTABLE_TAGS` — the page ships its own
    `<meta charset>` and `<meta name="viewport">`, so a bare-name rule for `meta` would red the
    committed bytes. The rule names the redirect instead.
    **Residual gap 2: a `http-equiv` value that is neither quoted nor `refresh`** (for example
    `http-equiv="Refresh"` split across a character reference, or a `content` value a browser treats
    as a URL where the token reads as something else) — again bounded by byte-identity.

  Both residuals are bounded by the same control, which is the general one: a hand edit that introduced
  either shape would not be what `renderPage(fixture)` produces, so byte-identity fails first and
  the gap is unreachable in the artefact as shipped. Neither half is a gate. Widening
  `CODE_EXTENSIONS` was kept because those tests read the file, not because a gate scans it for
  markup. Matching *elements* (`<script`, `<iframe`, `<object`, `<embed`, `on\w+=`, `javascript:`,
  `http-equiv`) would be a new `GATE_IDS` entry, and so a change to a published claim; that is a
  decision for the next ADR, not a consequence of this one.
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
