# mizan — video script (≤ 2 minutes)

**Total: 115 seconds.** Shot list, screen actions, and the one-line narration per shot.
Record at 1080p; crop the terminal to 16:9; burn-in subtitles optional. No music required;
if used, keep it under voice level.

| # | Time | Screen | Action | Narration (EN) |
| --- | --- | --- | --- | --- |
| 0 | 0–5 s | Slide 1 (title) | Hold on mizan title + challenge line | "mizan — the balance: citation verification for Qur'an and hadith answers." |
| 1 | 5–12 s | Slide 2 (problem) | Hold on the problem slide | "LLMs produce fluent Islamic text. Some of it is not in the sources. A fabrication looks exactly like a real quote." |
| 2 | 12–18 s | Terminal (clean) | `bun run demo` — capture from start to first header | "One command. No API key. No network. The corpus is rebuilt from committed anchors and attested on the spot." |
| 3 | 18–32 s | Terminal (demo output) | Scroll through the first question to the VERIFIED badge and the evidence block | "The Qur'an question reaches VERIFIED — the quote is literally contained in the record cited, and the source URL is shown beside it." |
| 4 | 32–48 s | Terminal (demo output) | Scroll to the fabricated-hadith claim: REJECTED badge, quoted vs source side by side | "A hadith with one word changed is REJECTED. The cited record exists; it does not contain that quote. No similarity score decided this." |
| 5 | 48–55 s | Terminal (summary line) | Hold on the closing line: every badge computed, corpus hash printed | "Every badge was computed by the verifier on this run. The corpus fingerprint is printed so you can re-run it yourself." |
| 6 | 55–70 s | Browser: hosted demo home | Open the hosted demo; show ask form + verify playground side by side | "The same procedure, hosted. A server-rendered form — no client JavaScript. Judges can build a claim and watch the badge appear." |
| 7 | 70–85 s | Browser: verify playground | Click Sample A → VERIFIED with evidence; click Sample B → REJECTED at abudawud:4255 | "Sample A verifies. Sample B is the one-word fabrication — rejected at the cited identifier, with the grade stored exactly as the dataset asserts it." |
| 8 | 85–95 s | Browser: typed question, no key | Type an unrelated question; show the honest degradation page | "Without a live key the page says model unavailable. It never guesses and never shows a canned answer." |
| 9 | 95–105 s | Slide 3 or 4 (procedure / innovation) | Hold on six-step procedure, or the "no similarity path" slide | "Six steps, one route to VERIFIED: containment. CI fails if a second route ever appears." |
| 10 | 105–115 s | Slide 10 (continuation plan) + slide 9 (reproduce) | Hold; end on repo URL | "The badge you see was computed, not asserted. Reproduce it: bun run demo." |

## Capture notes

- Terminal capture source: `submission/demo-terminal.png` is the committed still; for the
  video, record a fresh `bun run demo` and let it run in real time — the whole thing
  finishes in about a second, so hold the final frame.
- For the hosted-demo shots, use the locally started server (`bun run demo-server`) so the
  recording is deterministic; the deployed URL is for the portal's live-demo field.
- Keep the PRECOMPUTED (deterministic replay) label visible whenever terminal output is on
  screen — the honest label is part of the product, not a caption to hide.
- Do not paste any API key into the recording. The demo needs none.
