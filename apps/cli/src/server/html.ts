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

export const page = (title: string, bodyHtml: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${encodeText(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; margin: 0; background: #F7F4EB; color: #1A1A1A; line-height: 1.45; }
  header { background: #0E5A43; color: #fff; padding: 1.1rem 1.5rem; }
  header h1 { margin: 0; font-size: 1.45rem; }
  header p { margin: 0.3rem 0 0; opacity: 0.92; font-size: 0.95rem; }
  main { max-width: 54rem; margin: 0 auto; padding: 1.25rem; }
  section { background: #fff; border: 1px solid #E2DCCB; border-radius: 8px; padding: 1.15rem 1.25rem; margin-bottom: 1.15rem; }
  h2 { margin: 0 0 0.4rem; color: #0E5A43; font-size: 1.15rem; }
  h3 { margin: 1rem 0 0.35rem; font-size: 1rem; color: #1A1A1A; }
  label { display: block; font-weight: 600; margin: 0.7rem 0 0.2rem; }
  input[type="text"], textarea { width: 100%; box-sizing: border-box; padding: 0.5rem; border: 1px solid #C9C2AE; border-radius: 4px; font: inherit; }
  textarea { min-height: 4.5rem; resize: vertical; }
  button { margin-top: 0.85rem; margin-right: 0.5rem; background: #0E5A43; color: #fff; border: 0; border-radius: 4px; padding: 0.5rem 1.05rem; font: inherit; font-weight: 600; cursor: pointer; }
  button.secondary { background: #5A5A5A; }
  .badge { display: inline-block; padding: 0.12rem 0.5rem; border-radius: 3px; font-weight: 700; font-size: 0.92rem; letter-spacing: 0.02em; }
  .badge-verified { background: #D8EFE4; color: #0E5A43; border: 1px solid #0E5A43; }
  .badge-rejected { background: #F8E0DC; color: #8A2B21; border: 1px solid #8A2B21; }
  .badge-unverifiable { background: #EFEAE0; color: #5A5A5A; border: 1px solid #8A7F66; }
  pre { background: #141414; color: #E8E4D8; padding: 0.9rem 1rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 0.84rem; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
  .note { color: #5A5A5A; font-size: 0.9rem; margin: 0.4rem 0 0; }
  .samples { margin-top: 0.75rem; }
  dl { margin: 0.5rem 0 0; }
  dt { font-weight: 600; margin-top: 0.55rem; }
  dd { margin: 0.1rem 0 0; word-break: break-word; }
  footer { text-align: center; color: #5A5A5A; font-size: 0.84rem; padding: 0.9rem 1rem 1.4rem; }
</style>
</head>
<body>
<header>
  <h1>mizan (ميزان) — the balance</h1>
  <p>Per-claim citation verification for Qur'an and hadith answers. The badge you see was computed, not asserted.</p>
</header>
<main>
${bodyHtml}
</main>
<footer>mizan · Apache-2.0 code · corpus per-source licences · islamicaich.org</footer>
</body>
</html>`

export const scriptFree = (html: string): boolean => !html.includes("<script")

export * as Html from "./html.ts"
