"""Build mizan 10-slide deck: PPTX + PDF, same content."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

GREEN = RGBColor(0x0E, 0x5A, 0x43)
GOLD = RGBColor(0xC4, 0x9A, 0x2B)
DARK = RGBColor(0x1A, 0x1A, 0x1A)
GREY = RGBColor(0x5A, 0x5A, 0x5A)
BG = RGBColor(0xF7, 0xF4, 0xEB)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

try:
    from arabic_reshaper import reshape as _reshape
    from bidi.algorithm import get_display as _get_display
    from reportlab.pdfbase import pdfmetrics as _pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont as _TTFont
    _pdfmetrics.registerFont(_TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
    _pdfmetrics.registerFont(_TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))
    HAS_ARABIC = True
except Exception:
    HAS_ARABIC = False


def _contains_arabic(s):
    return any("\u0600" <= ch <= "\u06FF" for ch in s)


def pdf_text(s):
    if not HAS_ARABIC or not _contains_arabic(s):
        return s
    return _get_display(_reshape(s))


def pdf_font(bold=False):
    if not HAS_ARABIC:
        return "Helvetica-Bold" if bold else "Helvetica"
    return "Arial-Bold" if bold else "Arial"


SLIDES = [
 ("مِيزَان  mizan — the balance",
  "Computed citation verification for Qur'an & hadith answers",
  ["Track 04: Knowledge & verification tools  (+ Track 01 Q&A)",
   "The badge you see was computed, not asserted.",
   "bun run demo  →  VERIFIED + REJECTED in ~1s, offline, no key",
   "Islamic AI Challenge 2026 — islamicaich.org"]),
 ("1  The problem",
  "LLMs hallucinate Islamic text with confidence",
  ["• Western models dominate; Arabic religious data is scarce and unverified",
   "• A fluent fabrication looks identical to a real quote to a non-specialist",
   "• Measured: LLM hadith-verification accuracy ≈ 8% (2026 study)",
   "• Fuzzy / embedding verifiers score invented-but-plausible hadith HIGH — CWE-345",
   "• Cost of error is not UX: false religious authority for worship & belief"]),
 ("2  The solution",
  "Answer, then prove every quotation — per claim",
  ["• [VERIFIED] quoted span literally contained in the cited record — nothing else",
   "• [REJECTED] cited record exists but does not contain the quote, and no anchor locates",
   "• [UNVERIFIABLE] no citation / empty quote / unresolved ID / timeout / anchor located",
   "• Every badge ships with evidence: quoted text + source row + source URL",
   "• Fail closed: zero evidence blocks approval; timeout → unverifiable; mismatch → no verdict"]),
 ("3  How it works",
  "Six-step procedure · one Arabic fold · one route to VERIFIED",
  ["1 quote?  2 citation?  3 cap (≤3)?  4 resolve ID?  5 strict containment?  6 evidence?",
   "Fold table (one module): alef/hamza, wasla, ta-marbuta, diacritics, tatweel,",
   "Arabic-Indic digits → ASCII, punctuation/whitespace. Never adds/removes a letter.",
   "textMatch = matching key (never displayed) · textDisplay = what the user sees",
   "Verifier: 1 dependency (@mizan/core), no network, no clock, no randomness, no LLM judge"]),
 ("4  Why strict — the key innovation",
  "No similarity path to VERIFIED. Proven, not promised.",
  ["• Feasibility spike: invented hadith ≈ high fuzzy match → similarity IS the hole",
   "• So: no embedding, no edit-distance, no threshold, no percentage to tune",
   "• MatchStrength = exact|100  or  none — a fuzzy 97% lives only in a display diagnostic",
   "• Gates enforce it: G-1 dependency closure · G-6 single VERIFIED site · verify.ts",
   "  cannot import diagnostics — CI fails if a second route appears"]),
 ("5  Corpus & provenance",
   "4 Sunan + Muwatta + Qur'an, 27,234 records · every number re-runnable",
  ["• Qur'an Tanzil Uthmani 6,236 (verbatim, no-derivatives) + 4 Sunan + Muwatta",
   "• Grades never invented: stored as dataset asserts + source + basis, else null",
   "• 15,026 / 36,024 hadith rows quarantined (no grade) — served 20,998 + 6,236 verses",
   "• No Bukhari / Muslim — recorded as ABSENT, never substituted",
   "• attestation.json + hash-chained ledger · runs carry questionHash, never text"]),
 ("6  Evidence it works",
  "200 golden · 40 red-team · demo in 60 seconds",
  ["• golden-normalization 200/200: exact, undiacriticized, tatweel-spaced, digits must verify",
   "• red-team fabricated 40/40: one-word change, transpose, digit change → ZERO verified",
   "• Expectations hand-adjudicated in scripts/eval/plan.ts — generator cannot import verifier",
   "• bun install → bun run demo → bun run ci (typecheck + tests + gates G-1..G-7)",
   "• Benchmark vs plain FTS5 search re-runnable: bun run benchmark:vs-search"]),
 ("7  Honest limits",
  "What we do NOT claim",
  ["• No Sahih al-Bukhari / Sahih Muslim yet — biggest recall gap, stated upfront",
   "• Paraphrase: 26 elisions ruled UNVERIFIABLE via human-drawn anchors, not similarity",
   "  Cost disclosed: all 40 fabrications move to UNVERIFIABLE; false verified stays 0",
   "• Default checkout = labelled PRECOMPUTED replay; live = hosted HTTPS allowlisted API",
   "• CLI + server-rendered demo forms (no client JS) · no tafsir backend (returns unavailable, never fabricated)",
   "• Golden bar is vs. fold-table behaviour, not vs. human-labelled corpus"]),
 ("8  Track fit & impact",
  "Built for Track 04, usable from Track 01",
  ["• Track 04: scholars & du'at get instant takhrij-check + grading provenance + referral",
   "• Track 01: any conversational answer inherits badges; non-verified → refer_to_scholar",
   "• Never a fatwa: verdict = containment fact, not truth/authenticity ruling",
   "• Impact: kill fabricated quotes at the source; make trust auditable in 60 seconds",
   "• Tech: Bun monorepo + TypeScript + Effect Schema decode + SQLite FTS5 + OpenAI-compat LLM port"]),
 ("9  Reproduce it now",
  "One command. No key. No network.",
  ["• bun install --frozen-lockfile  →  bun run demo",
   "• Hosted demo: bun run demo-server → server-rendered verify playground, badges computed live",
   "• Full: bun run ingest → bun run ask \"…\" → bun run ci",
   "• Deliverables: public GitHub repo + hosted live demo + 2-min video + runbook + sources/licence registry",
   "• Synthetic data only · no PII · no secrets (gitleaks G-4) · Apache-2.0 code",
   "• Contact + repo QR here.  نُعلّم الآلة.. لتخدم الرسالة — with proof."]),
 ("10  Continuation plan",
  "Hosting, roles, fallbacks, adoption, milestones",
   ["• Hosting: static exhibit on GitHub Pages; interactive demo = Dockerfile on a",
    "  free container host (no credit card); a model API is optional, operator-funded",
    "• Dependency fallback: FTS5 lexical baseline (bun run benchmark:vs-search) —",
   "  retrieval can degrade; the verifier never can",
   "• Roles: maintainers own corpus ingest + gates; users file issues on the public repo;",
   "  no private knowledge required to operate",
   "• Adoption: du'at & institutions use the CLI today; an MCP tool meets chat surfaces",
   "• Milestones: Bukhari & Muslim planned as graded ingest (not held today),",
   "  Arabic UI, tafsir backend kept unavailable until a licensed source exists"]),
]

def add_slide(prs, title, subtitle, bullets, idx, total):
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    # background
    fill = slide.background.fill
    fill.solid(); fill.fore_color.rgb = BG
    # top bar
    shape = slide.shapes.add_shape(1, 0, 0, Inches(13.333), Inches(0.09))
    shape.fill.solid(); shape.fill.fore_color.rgb = GREEN
    shape.line.fill.background()
    # gold rule
    rule = slide.shapes.add_shape(1, Inches(0.7), Inches(1.55), Inches(1.1), Pt(4))
    rule.fill.solid(); rule.fill.fore_color.rgb = GOLD
    rule.line.fill.background()
    # slide number
    tx = slide.shapes.add_textbox(Inches(12.2), Inches(0.25), Inches(0.6), Inches(0.4)).text_frame
    tx.text = f"{idx+1}/{total}"
    for p in tx.paragraphs:
        p.alignment = PP_ALIGN.RIGHT
        for r in p.runs: r.font.size = Pt(11); r.font.color.rgb = GREY
    # title
    tb = slide.shapes.add_textbox(Inches(0.7), Inches(0.35), Inches(11.5), Inches(0.7)).text_frame
    tb.word_wrap = True
    p = tb.paragraphs[0]; p.text = title
    p.font.size = Pt(34); p.font.bold = True; p.font.color.rgb = GREEN
    # subtitle
    sb = slide.shapes.add_textbox(Inches(0.7), Inches(1.0), Inches(11.5), Inches(0.55)).text_frame
    sb.word_wrap = True
    p = sb.paragraphs[0]; p.text = subtitle
    p.font.size = Pt(18); p.font.color.rgb = DARK
    # bullets
    bb = slide.shapes.add_textbox(Inches(0.7), Inches(2.0), Inches(11.9), Inches(5.0)).text_frame
    bb.word_wrap = True
    for i, b in enumerate(bullets):
        p = bb.paragraphs[0] if i == 0 else bb.add_paragraph()
        p.text = b; p.space_after = Pt(12); p.level = 0
        p.font.size = Pt(19); p.font.color.rgb = DARK
    # footer
    fb = slide.shapes.add_textbox(Inches(0.7), Inches(6.9), Inches(11.5), Inches(0.4)).text_frame
    p = fb.paragraphs[0]; p.text = "mizan (ميزان)  ·  Apache-2.0 code  ·  corpus per-source licences  ·  islamicaich.org — Track 04"
    p.font.size = Pt(11); p.font.color.rgb = GREY

prs = Presentation()
prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
for i, (t, s, b) in enumerate(SLIDES):
    add_slide(prs, t, s, b, i, len(SLIDES))
prs.save("submission/mizan-idea-10slides.pptx")
print("pptx saved")

# ---- PDF mirror ----
W, H = landscape(A4)
c = canvas.Canvas("submission/mizan-idea-10slides.pdf", pagesize=landscape(A4))
for i, (t, s, b) in enumerate(SLIDES):
    # bg
    c.setFillColor(HexColor("#F7F4EB")); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(HexColor("#0E5A43")); c.rect(0, H - 22, W, 22, fill=1, stroke=0)
    c.setFillColor(HexColor("#C49A2B")); c.rect(48, H - 108, 90, 5, fill=1, stroke=0)
    c.setFillColor(HexColor("#5A5A5A")); c.setFont("Helvetica", 10)
    c.drawRightString(W - 40, H - 40, f"{i+1}/{len(SLIDES)}")
    c.setFillColor(HexColor("#0E5A43")); c.setFont(pdf_font(bold=True), 24)
    c.drawString(48, H - 70, pdf_text(t)[:95])
    c.setFillColor(HexColor("#1A1A1A")); c.setFont(pdf_font(), 14)
    c.drawString(48, H - 95, pdf_text(s)[:120])
    y = H - 140
    c.setFont(pdf_font(), 12.5)
    for bullet in b:
        for line in [bullet[j:j+105] for j in range(0, len(bullet), 105)]:
            c.setFillColor(HexColor("#1A1A1A"))
            c.drawString(60, y, ("• " if line is bullet[:105] else "   ") + pdf_text(line))
            y -= 19
        y -= 6
    c.setFillColor(HexColor("#5A5A5A")); c.setFont(pdf_font(), 8.5)
    c.drawString(48, 28, pdf_text("mizan (ميزان)  ·  Apache-2.0 code  ·  corpus per-source licences  ·  islamicaich.org — Track 04"))
    c.showPage()
c.save()
print("pdf saved")
