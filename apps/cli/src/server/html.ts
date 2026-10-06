import { VERDICT_BADGE } from "@mizan/core"
import { badgeDisplay, dirOf, langSelfLabel, strings, type Lang } from "./i18n.ts"

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export const encodeText = (value: string): string => {
  let out = ""
  for (const ch of value) {
    const mapped = ENTITIES[ch]
    if (mapped !== undefined) {
      out += mapped
      continue
    }
    out += ch
  }
  return out
}

export const badgeClass = (label: string): string => {
  if (label === VERDICT_BADGE.verified) return "badge-verified"
  if (label === VERDICT_BADGE.rejected) return "badge-rejected"
  return "badge-unverifiable"
}

export const badgeHtml = (label: string, lang: Lang = "en"): string =>
  `<span class="badge ${badgeClass(label)}">${encodeText(badgeDisplay(label, lang))}</span>`

export const note = (text: string): string => `<p class="note">${encodeText(text)}</p>`

export const noteHtml = (html: string): string => `<p class="note">${html}</p>`

export const section = (id: string, title: string, body: string): string =>
  [`<section class="card" id="${encodeText(id)}">`, `<h2>${encodeText(title)}</h2>`, body, "</section>"].join("\n")

export type NavItem = { readonly href: string; readonly label: string }

/** A primary action: filled, for the one thing a visitor is most likely to do. */
export const primaryLink = (href: string, label: string, lang: Lang): string =>
  `<a class="btn btn-primary" href="${encodeText(href)}" lang="${lang}" dir="${dirOf(lang)}">${encodeText(label)}</a>`

const navRow = (items: readonly NavItem[]): string =>
  [
    '<nav class="site-nav" aria-label="Sections">',
    ...items.map((item) => `<a href="${encodeText(item.href)}">${encodeText(item.label)}</a>`),
    "</nav>",
  ].join("\n")

export type PageOptions = {
  readonly modeLabel?: string
  readonly modeNote?: string
  readonly lang?: Lang
  /** Overrides the default three links, so `/method` can point back home. */
  readonly nav?: readonly NavItem[]
}

const modeBand = (options: PageOptions): string => {
  if (options.modeLabel === undefined) return ""
  const noteLine = options.modeNote === undefined ? "" : ` <span class="mode-note">${encodeText(options.modeNote)}</span>`
  return `<p class="mode-band"><span class="mode-label">${encodeText(options.modeLabel)}</span>${noteLine}</p>`
}

const langSwitcher = (lang: Lang): string => {
  const other: Lang = lang === "ar" ? "en" : "ar"
  const current = `<a class="lang-link is-current" href="/?lang=${lang}" hreflang="${lang}" lang="${lang}" dir="${dirOf(lang)}" aria-current="true">${encodeText(langSelfLabel(lang))}</a>`
  const alternate = `<a class="lang-link" href="/?lang=${other}" hreflang="${other}" lang="${other}" dir="${dirOf(other)}">${encodeText(langSelfLabel(other))}</a>`
  return [
    `<nav class="lang-switch" aria-label="${encodeText(strings(lang).langSwitchAria)}">`,
    lang === "ar" ? alternate : current,
    lang === "ar" ? current : alternate,
    "</nav>",
  ].join("\n")
}

/**
 * The stylesheet. Server-rendered, one inline block, no external request and no client script.
 *
 * Two layout decisions carry most of the design. The hero is a two-column grid on a wide screen —
 * the claim on one side, the machine-readable status on the other — so a visitor meets the product's
 * claim and its provenance in one glance instead of scrolling between them. And the two tools sit
 * side by side, because Ask and Verify are the same product seen from two ends and a reader
 * choosing between them should see both, not scroll to find the second.
 *
 * Everything is expressed with logical properties (`margin-inline`, `inset-inline`, `padding-inline`),
 * which is what lets `dir="rtl"` restyle the whole page from one attribute on `<html>` with no
 * mirrored stylesheet and no JavaScript.
 */
const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f7f8f7;
  --surface: #ffffff;
  --surface-2: #f2f5f3;
  --ink: #101613;
  --ink-soft: #33403a;
  --muted: #63706a;
  --line: #e3e8e5;
  --line-strong: #cfd7d2;
  --brand: #0d6b4f;
  --brand-ink: #ffffff;
  --brand-soft: #e6f2ed;
  --ok-bg: #d8f0e2;
  --ok-ink: #0a5c42;
  --ok-line: #8fd0b3;
  --bad-bg: #fbe4e1;
  --bad-ink: #96271c;
  --bad-line: #eeb0a8;
  --warn-bg: #f6efe0;
  --warn-ink: #6b5323;
  --warn-line: #e0cda3;
  --term-bg: #111614;
  --term-ink: #e6eae7;
  --shadow-sm: 0 1px 2px rgba(16, 22, 19, 0.05);
  --shadow: 0 1px 3px rgba(16, 22, 19, 0.06), 0 12px 32px -12px rgba(16, 22, 19, 0.14);
  --radius: 16px;
  --radius-sm: 10px;
  --measure: 44rem;
  --page: 68rem;
  --font-sans: ui-sans-serif, system-ui, "Segoe UI", Roboto, Tahoma, "Noto Naskh Arabic", sans-serif;
  --font-arabic: "Noto Naskh Arabic", "Segoe UI", Tahoma, ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "Cascadia Mono", Consolas, "SF Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d100f;
    --surface: #141917;
    --surface-2: #1b211e;
    --ink: #eef2ef;
    --ink-soft: #cdd6d1;
    --muted: #96a49d;
    --line: #242b27;
    --line-strong: #333c37;
    --brand: #57c99b;
    --brand-ink: #07130e;
    --brand-soft: #163025;
    --ok-bg: #123528;
    --ok-ink: #8fe0b7;
    --ok-line: #2c6b51;
    --bad-bg: #3a1c17;
    --bad-ink: #f0a99e;
    --bad-line: #7d3a30;
    --warn-bg: #2c2517;
    --warn-ink: #d9c493;
    --warn-line: #5e4d2c;
    --term-bg: #080a09;
    --term-ink: #dfe5e1;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.45), 0 12px 32px -12px rgba(0, 0, 0, 0.6);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.65;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}
html[dir="rtl"] body { font-family: var(--font-arabic); }
a { color: var(--brand); }
a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: 4px;
}
.skip-link {
  position: absolute;
  inset-inline-start: -9999px;
  top: 0;
  background: var(--brand);
  color: var(--brand-ink);
  padding: 0.55rem 1rem;
  z-index: 30;
  border-radius: 0 0 var(--radius-sm) 0;
}
.skip-link:focus { inset-inline-start: 0.75rem; top: 0.75rem; }

/* ── header ─────────────────────────────────────────────────────────── */
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--line);
}
.site-header .inner {
  max-width: var(--page);
  margin: 0 auto;
  padding: 0.7rem 1.5rem 0;
}
.head-row {
  display: flex;
  align-items: center;
  gap: 0.75rem 1.25rem;
}
.site-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem;
  margin-top: 0.5rem;
}
.site-nav a {
  display: inline-block;
  padding: 0.3rem 0.1rem 0.5rem;
  margin-inline-end: 1.1rem;
  font-size: 0.87rem;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
}
.site-nav a:hover { color: var(--brand); border-bottom-color: var(--brand); }
.brand {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
}
.brand .ar { color: var(--brand); font-weight: 600; margin-inline-start: 0.4rem; }
.tagline {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lang-switch { display: flex; gap: 0.25rem; flex: 0 0 auto; }
.lang-link {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  font-size: 0.8rem;
  text-decoration: none;
  color: var(--ink-soft);
  background: var(--surface);
  transition: border-color 0.12s, color 0.12s;
}
.lang-link:hover { border-color: var(--brand); color: var(--brand); }
.lang-link.is-current { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); font-weight: 600; }

main { max-width: var(--page); margin: 0 auto; padding: 2rem 1.5rem 4rem; }

/* ── hero ───────────────────────────────────────────────────────────── */
.hero {
  display: grid;
  gap: 1.5rem 2.5rem;
  align-items: start;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 2rem;
  box-shadow: var(--shadow);
}
@media (min-width: 62rem) { .hero { grid-template-columns: 1.35fr 1fr; } }
.hero h1 {
  margin: 0 0 0.6rem;
  font-size: clamp(1.7rem, 3.4vw, 2.4rem);
  line-height: 1.15;
  letter-spacing: -0.022em;
  font-weight: 700;
}
.hero h1 .ar { color: var(--brand); font-weight: 600; }
.hero .lede { margin: 0; max-width: 38rem; color: var(--ink-soft); font-size: 1.02rem; }
.hero .claim {
  margin: 1rem 0 0;
  font-weight: 600;
  color: var(--ink);
  padding-inline-start: 0.85rem;
  border-inline-start: 3px solid var(--brand);
}
.badge-row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 1.1rem; }

/* the status panel: monospace facts, the machine-readable half of the hero */
.status-panel {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 1rem 1.1rem;
  display: grid;
  gap: 0.7rem;
}
.status-row { display: grid; gap: 0.15rem; }
.status-row .k {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted);
  font-weight: 600;
}
.status-row .v {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--ink-soft);
  word-break: break-all;
  line-height: 1.5;
}
.status-row .v.is-missing { color: var(--bad-ink); font-weight: 600; }
.status-row .v.is-ok { color: var(--ok-ink); }

.mode-band {
  margin: 0 0 1.5rem;
  padding: 0.55rem 0.9rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 0.85rem;
  color: var(--ink-soft);
}
.mode-label { font-weight: 700; letter-spacing: 0.02em; }
.mode-note { color: var(--muted); }

/* ── the two tools, side by side ────────────────────────────────────── */
.tools {
  display: grid;
  gap: 1.25rem;
  margin-top: 1.5rem;
  align-items: start;
}
@media (min-width: 62rem) { .tools { grid-template-columns: 1fr 1fr; } }
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.5rem;
  box-shadow: var(--shadow-sm);
  scroll-margin-top: 5rem;
}
.card h2 {
  margin: 0 0 0.4rem;
  font-size: 1.12rem;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.card h3 { margin: 1.35rem 0 0.4rem; font-size: 0.95rem; color: var(--ink); }
.card p { max-width: var(--measure); }
.eyebrow {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--brand);
  margin: 0 0 0.3rem;
}
.note { color: var(--muted); font-size: 0.87rem; max-width: var(--measure); margin: 0.85rem 0 0; }

label { display: block; font-weight: 600; margin: 1rem 0 0.35rem; font-size: 0.92rem; }
label .hint { display: block; font-weight: 400; color: var(--muted); font-size: 0.82rem; margin-top: 0.1rem; }
input[type="text"], textarea {
  width: 100%;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 0.95rem;
  color: var(--ink);
  background: var(--surface);
  transition: border-color 0.12s, box-shadow 0.12s;
}
textarea { min-height: 6.5rem; resize: vertical; line-height: 1.7; }
input[type="text"]:focus, textarea:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent);
  outline: none;
}
textarea[dir="rtl"], input[dir="rtl"] { font-family: var(--font-arabic); }
html[dir="rtl"] input[type="text"], html[dir="rtl"] textarea { font-family: var(--font-arabic); }

.actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.1rem; }
.btn, button {
  display: inline-block;
  padding: 0.62rem 1.15rem;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  text-decoration: none;
  transition: filter 0.12s, border-color 0.12s, background 0.12s;
}
.btn-primary, button:not(.secondary) { background: var(--brand); color: var(--brand-ink); }
.btn-primary:hover, button:not(.secondary):hover { filter: brightness(1.07); }
button.secondary, .btn-secondary {
  background: var(--surface);
  color: var(--ink-soft);
  border-color: var(--line-strong);
}
button.secondary:hover, .btn-secondary:hover { border-color: var(--brand); color: var(--brand); }
.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.9rem; }
.chips form { margin: 0; }
.chips button { padding: 0.45rem 0.85rem; font-size: 0.85rem; font-weight: 500; }

/* ── badges and trust ───────────────────────────────────────────────── */
.badge {
  display: inline-block;
  padding: 0.18rem 0.6rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  border: 1px solid;
  white-space: nowrap;
}
html[dir="rtl"] .badge { letter-spacing: 0; font-family: var(--font-arabic); }
.badge-verified { background: var(--ok-bg); color: var(--ok-ink); border-color: var(--ok-line); }
.badge-rejected { background: var(--bad-bg); color: var(--bad-ink); border-color: var(--bad-line); }
.badge-unverifiable { background: var(--warn-bg); color: var(--warn-ink); border-color: var(--warn-line); }

.badge-key { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }
@media (min-width: 48rem) { .badge-key { grid-template-columns: repeat(3, 1fr); } }
.badge-key li {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0.85rem 1rem;
  font-size: 0.87rem;
  color: var(--ink-soft);
}
.trust {
  display: grid;
  gap: 0.75rem;
  margin: 1.5rem 0 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 48rem) { .trust { grid-template-columns: repeat(3, 1fr); } }
.trust li {
  background: var(--surface);
  border: 1px solid var(--line);
  border-inline-start: 3px solid var(--brand);
  border-radius: var(--radius-sm);
  padding: 0.85rem 1rem;
  font-size: 0.87rem;
  color: var(--ink-soft);
}
.more { text-align: center; margin: 2rem 0 0; }

/* ── progressive disclosure, native, no script ──────────────────────── */
details.disclose {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  margin-top: 0.75rem;
  overflow: hidden;
}
details.disclose > summary {
  cursor: pointer;
  padding: 0.95rem 1.25rem;
  font-weight: 600;
  font-size: 0.97rem;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
details.disclose > summary::-webkit-details-marker { display: none; }
details.disclose > summary::before {
  content: "";
  width: 0.5rem;
  height: 0.5rem;
  border-inline-end: 2px solid var(--brand);
  border-block-end: 2px solid var(--brand);
  transform: rotate(-45deg);
  transition: transform 0.15s;
  flex: 0 0 auto;
}
details.disclose[open] > summary::before { transform: rotate(45deg); }
details.disclose > summary:hover { background: var(--surface-2); }
details.disclose .disclose-body { padding: 0 1.25rem 1.25rem; border-top: 1px solid var(--line); padding-top: 0.5rem; }

/* ── verdicts, results, data ────────────────────────────────────────── */
.verdict-hero { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 0.85rem; margin-bottom: 1rem; }
.verdict-hero .badge { font-size: 1rem; padding: 0.3rem 0.8rem; }
.verdict-meaning { margin: 0; color: var(--ink-soft); flex: 1 1 18rem; }
ol.steps, ul.plain { margin: 0.6rem 0 0; padding-inline-start: 1.2rem; }
ol.steps li, ul.plain li { margin: 0.4rem 0; max-width: var(--measure); color: var(--ink-soft); }
ol.steps { counter-reset: step; list-style: none; padding-inline-start: 0; }
ol.steps li { position: relative; padding-inline-start: 2.1rem; counter-increment: step; }
ol.steps li::before {
  content: counter(step);
  position: absolute;
  inset-inline-start: 0;
  top: 0.15rem;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 700;
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--brand);
}
dl.kv { margin: 0.75rem 0 0; display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr; gap: 0.4rem 1rem; }
dl.kv dt { font-weight: 600; color: var(--muted); font-size: 0.85rem; }
dl.kv dd { margin: 0; word-break: break-word; color: var(--ink-soft); font-size: 0.9rem; }
code, .mono {
  font-family: var(--font-mono);
  font-size: 0.87em;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 0.08rem 0.32rem;
  word-break: break-all;
}
pre {
  background: var(--term-bg);
  color: var(--term-ink);
  padding: 1rem 1.15rem;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.8rem;
  line-height: 1.55;
  font-family: var(--font-mono);
}
pre code { background: none; border: 0; padding: 0; color: inherit; }
table.data { width: 100%; border-collapse: collapse; margin: 0.9rem 0 0; font-size: 0.88rem; }
table.data th, table.data td {
  text-align: start;
  border-bottom: 1px solid var(--line);
  padding: 0.55rem 0.6rem;
  vertical-align: top;
}
table.data th {
  color: var(--muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
html[dir="rtl"] table.data th { letter-spacing: 0; text-transform: none; font-size: 0.85rem; }
blockquote.prose {
  margin: 0 0 0.5rem;
  padding: 0.6rem 0.85rem;
  border-inline-start: 3px solid var(--brand);
  background: var(--surface-2);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  max-width: var(--measure);
  font-size: 0.9rem;
}

/* ── footer ─────────────────────────────────────────────────────────── */
.site-footer { border-top: 1px solid var(--line); color: var(--muted); font-size: 0.83rem; margin-top: 3rem; }
.site-footer .inner {
  max-width: var(--page);
  margin: 0 auto;
  padding: 1.25rem 1.5rem 2.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  align-items: center;
  justify-content: space-between;
}
@media (max-width: 40rem) { .tagline { display: none; } }
`

export const page = (title: string, bodyHtml: string, options: PageOptions = {}): string => {
  const lang: Lang = options.lang ?? "en"
  const t = strings(lang)
  const direction = dirOf(lang)
  const navItems: readonly NavItem[] =
    options.nav ??
    [
      { href: "#ask", label: t.navAsk },
      { href: "#verify", label: t.navVerify },
      { href: "/method", label: t.navMethod },
    ]
  return `<!doctype html>
<html lang="${lang}" dir="${direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${encodeText(title)}</title>
<style>
${STYLE}
</style>
</head>
<body>
<a class="skip-link" href="#main">${encodeText(t.skipToContent)}</a>
<header class="site-header">
  <div class="inner">
    <div class="head-row">
      <p class="brand">mizan<span class="ar" lang="ar" dir="rtl">ميزان</span></p>
      <p class="tagline">${encodeText(t.tagline)}</p>
      ${langSwitcher(lang)}
    </div>
    ${navItems.length > 0 ? navRow(navItems) : ""}
  </div>
</header>
<main id="main">
${modeBand(options)}
${bodyHtml}
</main>
<footer class="site-footer">
  <div class="inner">
    <span>${encodeText(t.footer)}</span>
    ${primaryLink(`/?lang=${lang}`, t.footerHome, lang)}
  </div>
</footer>
</body>
</html>`
}

export const scriptFree = (html: string): boolean => !html.includes("<script")

export * as Html from "./html.ts"