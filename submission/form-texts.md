# mizan — paste-ready submission texts

Copy the blocks below into the challenge portal form. Line lengths are deliberate: the
corpus-scope rules read public surfaces line by line, and each name that needs a negation
keeps its negation on the same line.

---

## 1. Project name

```
mizan (ميزان)
```

## 2. Short description (English)

```
mizan (ميزan, "the balance") answers a question about the Qur'an and hadith and then verifies its own citations, per claim, before anything is shown. Each quoted span is checked by strict normalized containment against the exact corpus record the answer cited: VERIFIED means the quote is literally contained in that record; REJECTED means the record exists and does not contain the quote; UNVERIFIABLE means the system cannot decide. There is no similarity score and no embedding path to a verdict — a feasibility spike showed that fuzzy matching scores invented-but-plausible hadith highly, which is exactly the failure this product exists to prevent. Verdicts are computed by a six-step, dependency-minimal procedure with no network, no clock and no LLM judge, and machine-checked invariants keep the route to VERIFIED unique in CI. Grades are stored exactly as the source dataset asserts them, together with who asserted them and on what basis; the product never invents a grade and presents none as its own ruling. The CLI runs offline in about a second with no API key (`bun run demo`), and a hosted server-rendered demo form is included. Honest degradation is the default: model down, corpus miss, timeout, or mismatch each produce one specific refusal — never a fabricated confirmation.
```

## 3. Short description (Arabic)

```
ميزان (mizan) يجيب عن سؤال عن القرآن والحديث ثم يتحقق من الاستشهاد، لكل ادعاء على حدة، قبل عرض أي شيء. يُقارن كل مقطع مقتبس بالحقل النصي للسجل المصدر المُستشهَد به عبر تضمين حازم بعد التطبيع: «موثّق» تعني أن النص موجود حرفياً في ذلك السجل؛ «مرفوض» تعني أن السجل موجود ولا يحتوي النص؛ «لا يمكن التحقق» تعني أن النظام لا يستطيع الحكم. لا يوجد درجة تشابه ولا مسار تضمين يؤدي إلى حكم، لأن التشابه العشوائي يمنح الحديث المختلَقَ درجات مرتفعة — وهذا هو العطب الذي يمنعه هذا المنتج. تُحتسب الأحكام عبر إجراء من ست خطوات بلا شبكة ولا ساعة ولا نموذج لغوي يحكم، وتفرض فحوص آلية في خط الإنتاج أن مسار التوثيق فريد. تُخزَّن الدرجات تماماً كما تدّعيها البيانات المصدرية مع بيان مصدرها وأساسها؛ لا يخترع ميزان درجة ولا يعرض درجته كحكمٍ له. يعمل سطر الأوامر دون إنترنت في نحو ثانية بلا مفتاح API (bun run demo)، ويتوفر استمارة تحقق مستضافة من نوع تُعرض الصفحات من الخادم. الانكسار الصادق هو الأصل: تعذّر النموذج أو غابت المصدريّة أو انتهت المهلة أو اختلط النص كلٌّ منها ينتج رفضاً محدداً — لا تأكيداً مُختلَقاً.
```

## 4. Track note

```
Track 04 — Knowledge & verification tools, confirmed in the portal. The pipeline is also reachable from Track 01 Q&A: any conversational answer inherits the same per-claim badges.
```

## 5. Presentation / deliverables checklist

```
Presentation: submission/mizan-idea-10slides.pptx (10 slides, includes a continuation-plan slide). PDF mirror generated with Arabic-capable fonts: submission/mizan-idea-10slides.pdf. Arabic deck: submission/mizan-idea-7slides-ar.pptx. Terminal capture for the video: submission/demo-terminal.png. Video script: submission/video-script.md.
GitHub: https://github.com/mossaudi/mizan (public)
Live demo: static exhibit on GitHub Pages via .github/workflows/pages.yml (computed badges from the committed transcript); interactive playground from the same Dockerfile on SnapDeploy free tier (no credit card) or locally via bun run demo-server (docs/live-demo.md).
Offline proof for any judge: bun install --frozen-lockfile && bun run demo — no key, no network, ~1s.
```

## 6. Live demo description (portal "Live demo" field)

```
A hosted server-rendered HTML form over the same CLI judges run locally. POST /verify builds one claim, resolves its citation against an attested two-record demo corpus, and shows the computed badge with full evidence — including a one-word fabrication (redteam-005) that reaches REJECTED at the cited identifier. POST /ask sample buttons replay the committed transcript labelled PRECOMPUTED (deterministic replay); every badge in that output is computed by the verifier on the run. No client JavaScript runs in the browser. Deployment: the interactive playground is a Dockerfile on a free container host that needs no credit card, and it also runs locally with bun run demo-server; the static exhibit page is published on GitHub Pages, Cloudflare Pages or Netlify. Degradation is honest: without a configured key the page states model unavailable and offers the samples; there is no canned answer and no guessed one.
```

## 7. Scientific Appendix reconciliation note

```
Sources served in this submission: Qur'an text from Tanzil (Uthmani script, verbatim under Tanzil's terms of use) and hadith rows with grades from QuranLab (quranlab/hadith on Hugging Face). The challenge's approved-source list names dorar.net, shamela.ws, quranpedia.net and the King Fahd Complex; Tanzil and QuranLab are third-party sources whose licences, per-row attribution and grade provenance are recorded in the repository registry, and their text is used under their own published terms. Sahih al-Bukhari and Sahih Muslim are not in the served corpus of this submission; the README records this as an absence, never a substitution — their absence is disclosed rather than filled with a different collection, and adding them is on the post-challenge roadmap. Content level D (fatwa / personal ruling) is not served: claims that fail verification print refer_to_scholar, and the product never issues a religious-legal ruling of its own. Grade policy: stored exactly as the dataset asserts, with gradeSource and gradeBasis on every row; null means the dataset asserts no grade for that row and the product says so.
```

## 8. Criteria-to-evidence mapping (for the scoring sheet, if free text is accepted)

```
Technical & AI (25%): six-step per-claim verification with strict normalized containment; Effect Schema decode at every trust boundary; deterministic fold table; SQLite FTS5 retrieval; OpenAI-compatible model port with host allowlist.
Reliability & scientific safety (15%): fail-closed everywhere — zero evidence blocks approval, timeout yields unverifiable, attestation mismatch aborts, ledger write failure marks the run untrusted; red-team set where fabricated quotes must not reach VERIFIED; grades never invented.
Innovation (15%): no similarity path to VERIFIED (shown by feasibility spike); exact|none match strength instead of a fuzzy percentage; machine-checked structural gates that fail CI if a second route to VERIFIED appears.
Benefit vs track criterion (20%): instant takhrij-check for scholars and du'at with grading provenance and referral for anything unverified; any conversational answer inherits the badges (Track 01 fit).
UX & communication (10%): evidence beside every badge — quoted text, source row, URL; honest degradation states named on screen; Arabic-first UI in the terminal and the deck.
Operational realism & continuation (10%): offline demo with no key and no network; static exhibit on GitHub Pages; interactive playground as a Dockerfile on a free container host (no credit card) or run locally; FTS5 fallback if retrieval degrades; public repo, Apache-2.0 code, per-source corpus licences; continuation plan on slide 10.
Presentation clarity & verifiability (5%): one command reproduces the money shot; every number in the deck is re-runnable from the repo; the badge is computed, not asserted — stated on every surface.
```
