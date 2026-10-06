import { VERDICT_BADGE } from "@mizan/core"

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

export const badgeHtml = (label: string): string =>
  `<span class="badge ${badgeClass(label)}">${encodeText(label)}</span>`

export const note = (text: string): string => `<p class="note">${encodeText(text)}</p>`

export const noteHtml = (html: string): string => `<p class="note">${html}</p>`

export const section = (id: string, title: string, body: string): string =>
  [`<section class="card" id="${encodeText(id)}">`, `<h2>${encodeText(title)}</h2>`, body, "</section>"].join("\n")

export type NavItem = { readonly href: string; readonly label: string }

export const nav = (items: readonly NavItem[]): string =>
  [
    '<nav class="site-nav" aria-label="Sections">',
    ...items.map((item) => `<a href="#${encodeText(item.href)}">${encodeText(item.label)}</a>`),
    "</nav>",
  ].join("\n")

export type PageOptions = {
  readonly modeLabel?: string
  readonly modeNote?: string
}

const modeBand = (options: PageOptions): string => {
  if (options.modeLabel === undefined) return ""
  const noteLine = options.modeNote === undefined ? "" : ` <span class="mode-note">${encodeText(options.modeNote)}</span>`
  return `<p class="mode-band"><span class="mode-label">${encodeText(options.modeLabel)}</span>${noteLine}</p>`
}

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f4f1e8;
  --surface: #fffdf8;
  --surface-2: #f7f4eb;
  --ink: #1a1a1a;
  --ink-soft: #3d3d3d;
  --muted: #5f5f5f;
  --line: #e2dccb;
  --line-strong: #c9c2ae;
  --brand: #0e5a43;
  --brand-ink: #ffffff;
  --brand-soft: #e7f2ec;
  --ok-bg: #d8efe4;
  --ok-ink: #0e5a43;
  --ok-line: #0e5a43;
  --bad-bg: #f8e0dc;
  --bad-ink: #8a2b21;
  --bad-line: #8a2b21;
  --warn-bg: #efeae0;
  --warn-ink: #5a5a5a;
  --warn-line: #8a7f66;
  --term-bg: #141414;
  --term-ink: #e8e4d8;
  --shadow: 0 1px 2px rgba(26, 26, 26, 0.06), 0 8px 24px rgba(26, 26, 26, 0.05);
  --radius: 12px;
  --radius-sm: 8px;
  --measure: 46rem;
  --page: 58rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #12140f;
    --surface: #1a1c16;
    --surface-2: #22251c;
    --ink: #ece8dc;
    --ink-soft: #d4cfc0;
    --muted: #a8a294;
    --line: #3a3d30;
    --line-strong: #555848;
    --brand: #6fbf9d;
    --brand-ink: #0c1a14;
    --brand-soft: #1c2e24;
    --ok-bg: #1a3328;
    --ok-ink: #8fd4b0;
    --ok-line: #3d7a5c;
    --bad-bg: #3a201c;
    --bad-ink: #e8a094;
    --bad-line: #8a4036;
    --warn-bg: #2a2820;
    --warn-ink: #c4bca8;
    --warn-line: #6a6450;
    --term-bg: #0c0c0c;
    --term-ink: #e8e4d8;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.35);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
body {
  margin: 0;
  font-family: system-ui, "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: var(--ink);
  background:
    radial-gradient(1200px 480px at 50% -240px, rgba(14, 90, 67, 0.08), transparent 70%),
    var(--bg);
}
a { color: var(--brand); }
a:focus-visible,
button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--brand);
  color: var(--brand-ink);
  padding: 0.5rem 0.9rem;
  z-index: 20;
}
.skip-link:focus { left: 0.75rem; top: 0.75rem; }
.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.site-header .inner {
  max-width: var(--page);
  margin: 0 auto;
  padding: 0.85rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1.25rem;
}
.brand {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--ink);
  text-decoration: none;
}
.brand .ar { font-weight: 600; color: var(--brand); margin-inline-start: 0.35rem; }
.tagline {
  margin: 0;
  font-size: 0.86rem;
  color: var(--muted);
}
.site-nav {
  max-width: var(--page);
  margin: 0 auto;
  padding: 0.55rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.9rem;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}
.site-nav a {
  font-size: 0.86rem;
  text-decoration: none;
  color: var(--ink-soft);
}
.site-nav a:hover { color: var(--brand); text-decoration: underline; }
main {
  max-width: var(--page);
  margin: 0 auto;
  padding: 1.25rem 1.25rem 2.5rem;
}
.hero {
  background: linear-gradient(145deg, var(--brand-soft), var(--surface));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.35rem 1.4rem;
  margin-bottom: 1.15rem;
  box-shadow: var(--shadow);
}
.hero h1 {
  margin: 0 0 0.35rem;
  font-size: clamp(1.45rem, 2.5vw, 1.8rem);
  line-height: 1.25;
}
.hero h1 .ar { color: var(--brand); font-weight: 600; }
.hero .lede { margin: 0; max-width: var(--measure); color: var(--ink-soft); }
.hero .claim {
  margin: 0.75rem 0 0;
  font-weight: 600;
  color: var(--ink);
}
.badge-row { margin-top: 0.85rem; display: flex; flex-wrap: wrap; gap: 0.45rem; }
.mode-band {
  margin: 0.75rem 0 0;
  padding: 0.55rem 0.75rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: 0.9rem;
}
.mode-label { font-weight: 700; letter-spacing: 0.03em; }
.mode-note { color: var(--muted); }
.status-grid {
  margin: 0.9rem 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.55rem;
}
.status-item {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.65rem;
  font-size: 0.86rem;
}
.status-item .k { display: block; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.status-item .v { font-weight: 600; word-break: break-all; }
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.1rem 1.25rem;
  margin-bottom: 1.1rem;
  box-shadow: var(--shadow);
  scroll-margin-top: 5.5rem;
}
.card h2 {
  margin: 0 0 0.45rem;
  color: var(--brand);
  font-size: 1.12rem;
}
.card h3 {
  margin: 1rem 0 0.35rem;
  font-size: 0.98rem;
  color: var(--ink);
}
.card p { max-width: var(--measure); }
.note { color: var(--muted); font-size: 0.9rem; }
.label { font-weight: 600; }
label {
  display: block;
  font-weight: 600;
  margin: 0.75rem 0 0.25rem;
}
label .hint { font-weight: 400; color: var(--muted); font-size: 0.85rem; }
input[type="text"],
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  font: inherit;
  color: var(--ink);
  background: var(--surface);
}
textarea { min-height: 4.75rem; resize: vertical; }
textarea[dir="rtl"] { font-family: "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif; }
button {
  margin-top: 0.9rem;
  margin-inline-end: 0.45rem;
  background: var(--brand);
  color: var(--brand-ink);
  border: 0;
  border-radius: var(--radius-sm);
  padding: 0.55rem 1.1rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button:hover { filter: brightness(1.06); }
button.secondary { background: var(--surface-2); color: var(--ink); border: 1px solid var(--line-strong); }
button.secondary:hover { border-color: var(--brand); color: var(--brand); filter: none; }
.samples { margin-top: 0.65rem; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.samples form { margin: 0; }
.samples button { margin-top: 0; }
.badge {
  display: inline-block;
  padding: 0.14rem 0.55rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.88rem;
  letter-spacing: 0.03em;
  border: 1px solid;
}
.badge-verified { background: var(--ok-bg); color: var(--ok-ink); border-color: var(--ok-line); }
.badge-rejected { background: var(--bad-bg); color: var(--bad-ink); border-color: var(--bad-line); }
.badge-unverifiable { background: var(--warn-bg); color: var(--warn-ink); border-color: var(--warn-line); }
.verdict-hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 0.9rem;
  margin-bottom: 0.75rem;
}
.verdict-hero .badge { font-size: 1rem; padding: 0.25rem 0.75rem; }
.verdict-hero .verdict-meaning { margin: 0; color: var(--ink-soft); max-width: var(--measure); }
ol.steps, ul.plain { margin: 0.4rem 0 0; padding-inline-start: 1.25rem; }
ol.steps li, ul.plain li { margin: 0.35rem 0; max-width: var(--measure); }
dl.kv { margin: 0.5rem 0 0; display: grid; grid-template-columns: minmax(7rem, 12rem) 1fr; gap: 0.3rem 0.75rem; }
dl.kv dt { font-weight: 600; color: var(--ink-soft); }
dl.kv dd { margin: 0; word-break: break-word; }
dl.kv dd[dir="rtl"] { font-family: "Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif; }
code, .mono {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: 0.9em;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  word-break: break-all;
}
pre {
  background: var(--term-bg);
  color: var(--term-ink);
  padding: 0.9rem 1rem;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.84rem;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
}
pre code { background: none; border: 0; padding: 0; color: inherit; }
table.data {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0 0;
  font-size: 0.92rem;
}
table.data th, table.data td {
  text-align: start;
  border-bottom: 1px solid var(--line);
  padding: 0.4rem 0.45rem;
  vertical-align: top;
}
table.data th { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
blockquote.prose {
  margin: 0.5rem 0 0;
  padding: 0.55rem 0.85rem;
  border-inline-start: 3px solid var(--brand);
  background: var(--surface-2);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  max-width: var(--measure);
}
.site-footer {
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.84rem;
  padding: 1rem 1.25rem 1.6rem;
  text-align: center;
}
.site-footer .inner { max-width: var(--page); margin: 0 auto; }
`

export const page = (title: string, bodyHtml: string, options: PageOptions = {}): string => `<!doctype html>
<html lang="en">
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
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="inner">
    <p class="brand">mizan<span class="ar" lang="ar" dir="rtl">ميزان</span></p>
    <p class="tagline">Per-claim citation verification for Qur&#39;an and hadith — the badge was computed, not asserted.</p>
  </div>
</header>
${nav([
  { href: "ask", label: "Ask" },
  { href: "verify", label: "Verify" },
  { href: "badges", label: "Badges" },
  { href: "procedure", label: "Procedure" },
  { href: "degradation", label: "Degradation" },
  { href: "provenance", label: "Provenance" },
  { href: "sources", label: "Sources" },
  { href: "run", label: "Run it" },
])}
<main id="main">
${modeBand(options)}
${bodyHtml}
</main>
<footer class="site-footer">
  <div class="inner">
    mizan · Apache-2.0 code · corpus per-source licences · islamicaich.org
  </div>
</footer>
</body>
</html>`

export const scriptFree = (html: string): boolean => !html.includes("<script")

export * as Html from "./html.ts"
