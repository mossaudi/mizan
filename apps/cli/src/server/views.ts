import { badgeFor, type Verdict } from "@mizan/core"
import { VERIFICATION_BUDGET_MS } from "../instructions.ts"
import { badgeHtml, encodeText, note, section } from "./html.ts"
import { anyVerified, type CandidateResult, type SearchVerifyResult } from "./search-verify.ts"
import {
  badgeMeaning as badgeMeaningI18n,
  dirOf,
  reasonMeaning as reasonMeaningI18n,
  strings,
  type Lang,
} from "./i18n.ts"
import { VERIFY_SAMPLES, type PlaygroundResult } from "./playground.ts"

const hero = (
  lang: Lang,
  liveAvailable: boolean,
  liveMissing: readonly string[],
  corpusAvailable: boolean,
  corpusDetail: string,
  recordCount: number,
  collectionCounts: Readonly<Record<string, number>>,
  snapshotHash: string,
  corpusKind: "snapshot" | "anchors" | "none",
): string => {
  const t = strings(lang)
  const collections = Object.entries(collectionCounts)
    .map(([name, count]) => `${encodeText(name)} ${count}`)
    .join(" · ")
  const kindNote = corpusKind === "snapshot" ? t.corpusKindSnapshot : corpusKind === "anchors" ? t.corpusKindAnchors : t.corpusIntegrityFailed
  const corpusValue = corpusAvailable
    ? `${recordCount} ${t.corpusYesPrefix} — ${kindNote}${collections.length > 0 ? ` (${collections})` : ""}`
    : `${t.corpusUnavailable} — ${kindNote}. ${encodeText(corpusDetail)}`
  const liveValue = liveAvailable
    ? t.liveRouteYes
    : liveMissing.length > 0
      ? liveMissing.map(encodeText).join(" · ")
      : t.liveRouteNo
  const liveClass = liveAvailable ? "v is-ok" : "v is-missing"
  const row = (key: string, value: string, cls = "v"): string =>
    `<div class="status-row"><span class="k">${encodeText(key)}</span><span class="${cls}">${value}</span></div>`
  return [
    `<div class="hero">`,
    `<div class="hero-copy">`,
    `<h1>${encodeText(t.heroTitleEn)}<span class="ar" lang="ar" dir="rtl">${encodeText(t.heroTitleAr)}</span>${encodeText(t.heroTitleTail)}</h1>`,
    `<p class="lede">${encodeText(t.heroLede)}</p>`,
    `<p class="claim">${encodeText(t.heroClaim)}</p>`,
    `<div class="badge-row">${badgeHtml(badgeFor("verified"), lang)}${badgeHtml(badgeFor("rejected"), lang)}${badgeHtml(badgeFor("unverifiable"), lang)}</div>`,
    `</div>`,
    `<div class="status-panel">`,
    row(t.statusCorpus, corpusValue),
    row(t.statusSnapshotHash, encodeText(snapshotHash.length > 0 ? snapshotHash : "—")),
    row(t.statusLiveRoute, liveValue, liveClass),
    row(t.statusBudget, `${VERIFICATION_BUDGET_MS} ms`),
    row(t.statusClientJs, encodeText(t.clientJsNone)),
    `</div>`,
    `</div>`,
  ].join("\n")
}

const askSection = (lang: Lang, liveAvailable: boolean): string => {
  const t = strings(lang)
  const liveNote = liveAvailable ? t.askLiveConfigured : t.askLiveNoKey
  const sampleForms = [
    { id: "ikhlas", label: t.askSampleIkhlas },
    { id: "fabricated-hadith", label: t.askSampleFabricated },
  ]
    .map(
      (sample) =>
        `<form method="post" action="/ask"><input type="hidden" name="sample" value="${encodeText(sample.id)}">` +
        `<input type="hidden" name="lang" value="${lang}">` +
        `<button type="submit" class="secondary">${encodeText(sample.label)}</button></form>`,
    )
    .join("\n")
  return section(
    "ask",
    t.askTitle,
    [
      `<p class="eyebrow">${encodeText(t.askEyebrow)}</p>`,
      `<p>${encodeText(t.askBody)}</p>`,
      `<form method="post" action="/ask">`,
      `<input type="hidden" name="lang" value="${lang}">`,
      `<label for="question">${encodeText(t.askQuestionLabel)}</label>`,
      `<textarea id="question" name="question" maxlength="10000" placeholder="${encodeText(t.askQuestionPlaceholder)}"></textarea>`,
      `<div class="actions"><button type="submit">${encodeText(t.askRun)}</button></div>`,
      `</form>`,
      `<div class="chips">${sampleForms}</div>`,
      note(liveNote),
      note(t.askPrivacyNote),
    ].join("\n"),
  )
}

const verifySection = (lang: Lang, verifyReady: boolean, verifyDetail: string): string => {
  const t = strings(lang)
  const sampleButtons = VERIFY_SAMPLES.map(
    (sample) => {
      const label = sample.id === "quran-6222" ? t.verifySampleA : t.verifySampleB
      return (
        `<form method="post" action="/verify"><input type="hidden" name="sample" value="${encodeText(sample.id)}">` +
        `<input type="hidden" name="lang" value="${lang}">` +
        `<button type="submit" class="secondary">${encodeText(label)}</button></form>`
      )
    },
  ).join("\n")
  const unavailable = verifyReady ? "" : `<p><strong>${encodeText(t.verifyUnavailable)}:</strong> ${encodeText(verifyDetail)}</p>`
  return section(
    "verify",
    t.verifyTitle,
    [
      `<p class="eyebrow">${encodeText(t.verifyEyebrow)}</p>`,
      `<p>${encodeText(t.verifyBody)}</p>`,
      unavailable,
      `<form method="post" action="/verify">`,
      `<input type="hidden" name="lang" value="${lang}">`,
      `<label for="text">${encodeText(t.verifyTextLabel)} <span class="hint">${encodeText(t.verifyTextHint)}</span></label>`,
      `<textarea id="text" name="text" dir="rtl" maxlength="4000" required placeholder="${encodeText(t.verifyTextPlaceholder)}"></textarea>`,
      `<label for="scope">${encodeText(t.verifyScopeLabel)} <span class="hint">${encodeText(t.verifyScopeHint)}</span></label>`,
      `<input type="text" id="scope" name="collection" maxlength="32" placeholder="${encodeText(t.verifyScopePlaceholder)}">`,
      `<div class="actions"><button type="submit">${encodeText(t.verifyRun)}</button></div>`,
      `</form>`,
      `<div class="chips">${sampleButtons}</div>`,
      note(t.verifyNote),
    ].join("\n"),
  )
}

/**
 * The three badges as a compact key rather than a legend.
 *
 * A three-cell grid, because the badges are parallel and a reader comparing them is the whole point
 * of the section. There is no fourth cell, and the layout says so by having room for exactly three.
 */
const badgesSection = (lang: Lang): string => {
  const t = strings(lang)
  const rows: readonly (readonly [Verdict, string])[] = [
    ["verified", t.badgeMeaningVerified],
    ["rejected", t.badgeMeaningRejected],
    ["unverifiable", t.badgeMeaningUnverifiable],
  ]
  const cells = rows
    .map(([verdict, meaning]) => `<li>${badgeHtml(badgeFor(verdict), lang)}<br><span>${encodeText(meaning)}</span></li>`)
    .join("\n")
  return section(
    "badges",
    t.badgesTitle,
    [`<p>${encodeText(t.badgesBody)}</p>`, `<ul class="badge-key">`, cells, `</ul>`, note(t.badgesDiagnosticNote)].join("\n"),
  )
}

/** A secondary link styled as a button, so it reads as an action without pretending to be a form. */
const linkHtml = (href: string, label: string, lang: Lang): string =>
  `<a class="btn btn-secondary" href="${encodeText(href)}" lang="${lang}" dir="${dirOf(lang)}">${encodeText(label)}</a>`

/** Three short reasons to trust the badge, and the route to the full method. */
const trustSection = (lang: Lang): string => {
  const t = strings(lang)
  return section(
    "trust",
    t.trustTitle,
    [
      `<ul class="trust">`,
      `<li>${t.trustItem1}</li>`,
      `<li>${t.trustItem2}</li>`,
      `<li>${t.trustItem3}</li>`,
      `</ul>`,
      `<div class="actions">${linkHtml(`/method?lang=${lang}`, t.trustMethodLink, lang)}</div>`,
    ].join("\n"),
  )
}


const degradationSection = (lang: Lang): string => {
  const t = strings(lang)
  return section(
    "degradation",
    t.degradationTitle,
    [
      `<p>${t.degradationBody}</p>`,
      `<ul class="plain">`,
      `<li>${t.degradationItem1}</li>`,
      `<li>${t.degradationItem2}</li>`,
      `<li>${t.degradationItem3}</li>`,
      `<li>${t.degradationItem4}</li>`,
      `<li>${t.degradationItem5}</li>`,
      `<li>${t.degradationItem6}</li>`,
      `</ul>`,
      note(t.degradationNote),
    ].join("\n"),
  )
}

const provenanceSection = (lang: Lang): string => {
  const t = strings(lang)
  return section(
    "provenance",
    t.provenanceTitle,
    [
      `<ul class="plain">`,
      `<li>${t.provenanceItem1}</li>`,
      `<li>${t.provenanceItem2}</li>`,
      `<li>${t.provenanceItem3}</li>`,
      `<li>${t.provenanceItem4}</li>`,
      `<li>${t.provenanceItem5}</li>`,
      `</ul>`,
    ].join("\n"),
  )
}

const sourcesSection = (lang: Lang): string => {
  const t = strings(lang)
  return section(
    "sources",
    t.sourcesTitle,
    [
      `<p>${t.sourcesBody}</p>`,
      `<table class="data">`,
      `<tr><th>${encodeText(t.sourcesThSource)}</th><th>${encodeText(t.sourcesThRole)}</th><th>${encodeText(t.sourcesThTerms)}</th></tr>`,
      `<tr><td>Tanzil Project</td><td>${encodeText(t.sourcesTanzilRole)}</td><td>${encodeText(t.sourcesTanzilTerms)}</td></tr>`,
      `<tr><td>QuranLab</td><td>${encodeText(t.sourcesQuranLabRole)}</td><td>${encodeText(t.sourcesQuranLabTerms)}</td></tr>`,
      `</table>`,
      `<p>${t.sourcesCollections}</p>`,
      note(t.sourcesNote),
    ].join("\n"),
  )
}

const runSection = (lang: Lang): string => {
  const t = strings(lang)
  return section(
    "run",
    t.runTitle,
    [
      `<ul class="plain">`,
      `<li>${t.runItemDemo}</li>`,
      `<li>${t.runItemAsk}</li>`,
      `<li>${t.runItemServer}</li>`,
      `<li>${t.runItemMcp}</li>`,
      `<li>${t.runItemCi}</li>`,
      `</ul>`,
      note(t.runNote),
    ].join("\n"),
  )
}

export type HomeInput = {
  readonly lang: Lang
  readonly corpusAvailable: boolean
  readonly corpusDetail: string
  /** Which corpus is actually open, so the record count beside it cannot describe another one. */
  readonly corpusKind: "snapshot" | "anchors" | "none"
  readonly liveAvailable: boolean
  readonly liveMissing: readonly string[]
  readonly recordCount: number
  readonly collectionCounts: Readonly<Record<string, number>>
  readonly snapshotHash: string
}

export const homeBody = (input: HomeInput): string =>
  [
    hero(
      input.lang,
      input.liveAvailable,
      input.liveMissing,
      input.corpusAvailable,
      input.corpusDetail,
      input.recordCount,
      input.collectionCounts,
      input.snapshotHash,
      input.corpusKind,
    ),
    `<div class="tools">`,
    askSection(input.lang, input.liveAvailable),
    verifySection(input.lang, input.corpusAvailable, input.corpusDetail),
    `</div>`,
    badgesSection(input.lang),
    trustSection(input.lang),
  ].join("\n")

/**
 * The long-form explanation, on its own page.
 *
 * ## Why this is a second page rather than more sections on the first
 *
 * The home page exists to be used and the method page exists to be read, and mixing them served
 * neither: a visitor who wanted to paste a quote had to scroll past four sections of prose, and the
 * prose itself was competing with the two forms for attention. Splitting them lets the home page
 * carry exactly what a visitor needs to act — what this is, that the corpus is attested, the two
 * tools, the three badges — and leaves the reasoning intact one click away instead of deleted.
 *
 * Each block is a native `<details>` element rather than a script-driven accordion. That is the only
 * progressive disclosure available under ADR-C3 (no client JavaScript), and it has one property a
 * hand-rolled accordion would not: it still opens, prints and deep-links with scripting disabled,
 * because it is the platform and not this product.
 *
 * ## Why the fold table and the grades get their own blocks
 *
 * Those two are the two questions a scholar actually asks about this system — what counts as the same
 * word, and whose judgement a grade is — so they are the first two disclosed rather than trailing
 * footnotes, and they state the rule rather than linking away to it.
 */
export const methodBody = (lang: Lang): string => {
  const t = strings(lang)
  const fold = `<p>${t.procedureFoldBody}</p>${note(t.procedureFoldNote)}`
  const grades = `<p>${t.procedureGradesBody}</p>`
  const blocks: readonly (readonly [string, string])[] = [
    [
      t.procedureTitle,
      [`<p>${t.procedureBody}</p>`, `<ol class="steps">`, `<li>${t.procedureStep1}</li>`, `<li>${t.procedureStep2}</li>`, `<li>${t.procedureStep3}</li>`, `<li>${t.procedureStep4}</li>`, `<li>${t.procedureStep5}</li>`, `<li>${t.procedureStep6}</li>`, `</ol>`, note(t.procedureAnchorNote)].join("\n"),
    ],
    [t.procedureFoldTitle, fold],
    [t.procedureGradesTitle, grades],
    [t.degradationTitle, degradationSection(lang)],
    [t.provenanceTitle, provenanceSection(lang)],
    [t.sourcesTitle, sourcesSection(lang)],
    [t.runTitle, runSection(lang)],
  ]
  const disclosed = blocks.map(([summary, body], index) => details(summary, body, index === 0)).join("\n")
  return [
    `<div class="hero">`,
    `<div class="hero-copy">`,
    `<p class="eyebrow">${encodeText(t.methodEyebrow)}</p>`,
    `<h1>${encodeText(t.methodTitle)}</h1>`,
    `<p class="lede">${encodeText(t.methodLede)}</p>`,
    `</div>`,
    `</div>`,
    `<div class="method-blocks">`,
    disclosed,
    `</div>`,
    `<div class="actions">${linkHtml(`/?lang=${lang}`, t.methodBackHome, lang)}</div>`,
  ].join("\n")
}

/** One native disclosure block. `open` on the first so the page is never a wall of collapsed rows. */
const details = (summary: string, body: string, open = false): string =>
  [
    `<details class="disclose"${open ? " open" : ""}>`,
    `<summary>${encodeText(summary)}</summary>`,
    `<div class="disclose-body">`,
    body,
    `</div>`,
    `</details>`,
  ].join("\n")

export const reasonMeaning = (reason: string, lang: Lang): string => reasonMeaningI18n(reason, lang)

export const badgeMeaning = (verdict: string, lang: Lang): string => badgeMeaningI18n(verdict, lang)

export const askOutputBody = (lang: Lang, title: string, output: string, noteText: string): string => {
  const t = strings(lang)
  return [
    `<section class="card">`,
    `<h2>${encodeText(title)}</h2>`,
    note(noteText),
    `<h3>${encodeText(t.askOutputTerminal)}</h3>`,
    `<pre>${encodeText(output)}</pre>`,
    `<form method="get" action="/?lang=${lang}"><button type="submit" class="secondary">${encodeText(t.askOutputBack)}</button></form>`,
    `</section>`,
  ].join("\n")
}

export const verifyResultBody = (lang: Lang, result: PlaygroundResult, sampleLabel: string | null): string => {
  const t = strings(lang)
  const verdict = result.verdict.verdict
  const badge = badgeFor(verdict)
  const evidence = result.verdict.evidence
  const evidenceHtml =
    evidence === null
      ? `<p class="note">${encodeText(t.verdictEvidenceNone)}</p>`
      : [
          `<dl class="kv">`,
          `<dt>Record</dt><dd><code>${encodeText(evidence.recordId)}</code></dd>`,
          `<dt>Collection</dt><dd>${encodeText(evidence.collection)}</dd>`,
          `<dt>Number</dt><dd>${encodeText(evidence.number ?? "—")}</dd>`,
          `<dt>Grade</dt><dd>${encodeText(evidence.grade ?? t.verdictGradeNone)}</dd>`,
          `<dt>Grade source</dt><dd>${encodeText(evidence.gradeSource)}</dd>`,
          `<dt>Source</dt><dd>${encodeText(evidence.sourceUrl)}</dd>`,
          `<dt>Licence</dt><dd>${encodeText(evidence.license)}</dd>`,
          `<dt>Attribution</dt><dd>${encodeText(evidence.attribution)}</dd>`,
          `<dt>Folded match</dt><dd>${evidence.matchedChars} / ${evidence.quoteChars}</dd>`,
          `</dl>`,
        ].join("\n")
  const problemsHtml =
    result.problems.length === 0
      ? ""
      : [
          `<h3>${encodeText(t.verdictProblemsTitle)}</h3>`,
          `<pre>${encodeText(result.problems.map((p) => `${p.citation.raw}: ${p.detail}`).join("\n"))}</pre>`,
        ].join("\n")
  const resolvedRows = result.resolved
    .map((entry) => {
      const ids = entry.records.map((record) => record.id).join(", ")
      const flag = entry.ambiguous ? " — ambiguous" : ""
      return `${entry.citation.raw} → ${ids.length > 0 ? ids : "unresolved"}${flag}`
    })
    .join("\n")
  const sampleLine = sampleLabel === null ? "" : `<p>${encodeText(sampleLabel)}</p>`
  const exactNote = result.verdict.matchStrength.kind === "exact" ? t.verdictMatchExact : t.verdictMatchNone
  return [
    `<section class="card">`,
    `<h2>${encodeText(t.verdictTitle)}</h2>`,
    `<div class="verdict-hero">`,
    badgeHtml(badge, lang),
    `<p class="verdict-meaning">${encodeText(badgeMeaning(verdict, lang))}</p>`,
    `</div>`,
    sampleLine,
    `<dl class="kv">`,
    `<dt>${encodeText(t.verdictReason)}</dt><dd><code>${encodeText(result.verdict.reason)}</code> — ${encodeText(reasonMeaning(result.verdict.reason, lang))}</dd>`,
    `<dt>${encodeText(t.verdictMatchStrength)}</dt><dd><code>${encodeText(result.verdict.matchStrength.kind)}</code>${encodeText(exactNote)}</dd>`,
    `<dt>${encodeText(t.verdictSnapshotHash)}</dt><dd><code>${encodeText(result.snapshotHash)}</code></dd>`,
    `<dt>${encodeText(t.verdictClaimText)}</dt><dd>${encodeText(result.claim.text)} <span class="note">${encodeText(t.verdictNotVerified)}</span></dd>`,
    `<dt>${encodeText(t.verdictQuotedSpan)}</dt><dd dir="rtl">${encodeText(result.claim.quote ?? "")}</dd>`,
    `</dl>`,
    `<h3>Citation resolution</h3>`,
    `<pre>${encodeText(resolvedRows)}</pre>`,
    `<h3>${encodeText(t.verdictEvidenceTitle)}</h3>`,
    evidenceHtml,
    problemsHtml,
    note(t.verdictGradeNote),
    `<form method="get" action="/?lang=${lang}"><button type="submit" class="secondary">${encodeText(t.verdictBack)}</button></form>`,
    `</section>`,
  ].join("\n")
}

/**
 * What the search was allowed to look at, stated in words.
 *
 * The widening clause is the one that matters. A reader who asked about one book and is shown rows
 * from another has been handed an answer to a different question unless the page says the scope
 * moved, so `widenedFrom` is rendered as a sentence and not as a field.
 */
const scopeHtml = (lang: Lang, result: SearchVerifyResult): string => {
  const t = strings(lang)
  const scope = result.scope
  if (scope === null) return ""
  if (scope.kind === "collection") {
    return `${encodeText(t.verifyResultScopeCollection)} <code>${encodeText(scope.collection)}</code>`
  }
  if (scope.widenedFrom === null) return encodeText(t.verifyResultScopeAll)
  return `${encodeText(t.verifyResultScopeWidened)} (<code>${encodeText(scope.widenedFrom)}</code>)`
}

/** The headline sentence, which is one of three and never a fourth. */
const summaryFor = (lang: Lang, result: SearchVerifyResult): string => {
  const t = strings(lang)
  if (result.state === "unavailable") return t.verifyResultSummaryUnavailable
  if (result.state === "no_candidates") return t.verifyResultSummaryNoCandidates
  return anyVerified(result) ? t.verifyResultSummaryVerified : t.verifyResultSummaryNone
}

/**
 * One row: the record, the badge the verifier computed for it, and the record's own text.
 *
 * The shared-run integers are the only near-ness a row carries, and they are labelled display-only
 * beside every row — two integers in folded characters, never a percentage and never a ratio a
 * reader could divide (AGENTS.md section 10). `textMatch` is not reachable from this type at all.
 */
const candidateRow = (lang: Lang, row: CandidateResult, quoteChars: number): string => {
  const t = strings(lang)
  const verdict = row.verdict.verdict
  const number = row.number ?? "—"
  return [
    `<tr>`,
    `<td>${row.rank}</td>`,
    `<td>${badgeHtml(badgeFor(verdict), lang)}<br><span class="note">${encodeText(reasonMeaning(row.verdict.reason, lang))}</span></td>`,
    `<td dir="ltr"><code>${encodeText(row.recordId)}</code><br>${encodeText(row.collection)} ${encodeText(number)}</td>`,
    `<td>${row.sharedRunChars} / ${quoteChars}</td>`,
    `<td><blockquote class="prose" dir="rtl">${encodeText(row.textDisplay)}</blockquote><a href="${encodeText(row.sourceUrl)}" rel="noopener noreferrer nofollow">${encodeText(row.sourceUrl)}</a><br><span class="note">${encodeText(row.attribution)} · ${encodeText(row.license)}</span></td>`,
    `</tr>`,
  ].join("\n")
}

/** The search result page: three possible states, each with its own sentence and its own rows. */
export const searchResultBody = (lang: Lang, result: SearchVerifyResult): string => {
  const t = strings(lang)
  const header = [
    `<dl class="kv">`,
    `<dt>${encodeText(t.verifyResultConsidered)}</dt><dd>${result.considered}</dd>`,
    `<dt>${encodeText(t.verifyResultShown)}</dt><dd>${result.rows.length}</dd>`,
    `<dt>${encodeText(t.verifyResultScope)}</dt><dd>${scopeHtml(lang, result)}</dd>`,
    `<dt>${encodeText(t.verifyResultQuoteChars)}</dt><dd>${result.quoteChars}</dd>`,
    `</dl>`,
  ].join("\n")

  if (result.state !== "candidates") {
    return [
      `<section class="card">`,
      `<h2>${encodeText(t.verifyResultTitle)}</h2>`,
      `<p class="lede">${encodeText(summaryFor(lang, result))}</p>`,
      header,
      result.reason === null ? "" : note(result.reason),
      `<form method="get" action="/?lang=${lang}"><button type="submit" class="secondary">${encodeText(t.verdictBack)}</button></form>`,
      `</section>`,
    ].join("\n")
  }

  const rows = result.rows.map((row) => candidateRow(lang, row, result.quoteChars)).join("\n")
  return [
    `<section class="card">`,
    `<h2>${encodeText(t.verifyResultTitle)}</h2>`,
    `<p class="lede">${encodeText(summaryFor(lang, result))}</p>`,
    header,
    note(t.verifyResultSharedRunNote),
    `<table class="data">`,
    `<tr><th>${encodeText(t.verifyResultRank)}</th><th>${encodeText(t.verifyResultBadge)}</th><th>${encodeText(t.verifyResultRecord)}</th><th>${encodeText(t.verifyResultSharedRun)}</th><th>${encodeText(t.verifyResultText)}</th></tr>`,
    rows,
    `</table>`,
    note(t.verdictGradeNote),
    `<form method="get" action="/?lang=${lang}"><button type="submit" class="secondary">${encodeText(t.verdictBack)}</button></form>`,
    `</section>`,
  ].join("\n")
}

export const errorBody = (lang: Lang, title: string, detail: string): string => {
  const t = strings(lang)
  return [
    `<section class="card">`,
    `<h2>${encodeText(title)}</h2>`,
    `<p>${encodeText(detail)}</p>`,
    `<form method="get" action="/?lang=${lang}"><button type="submit" class="secondary">${encodeText(t.errorBack)}</button></form>`,
    `</section>`,
  ].join("\n")
}

export const modeNoteFor = (lang: Lang, mode: "precomputed" | "live" | "replay"): string => {
  const t = strings(lang)
  if (mode === "live") return t.modeLiveNote
  if (mode === "replay") return t.modeReplayNote
  return t.modePrecomputedNote
}

export type LiveStatus = {
  readonly hasApiKey: boolean
  readonly hasCorpus: boolean
  readonly hasAttestation: boolean
  readonly providerMode: string | null
}

export const liveMissingReasons = (lang: Lang, status: LiveStatus): readonly string[] => {
  const t = strings(lang)
  const reasons: string[] = []
  if (!status.hasApiKey) reasons.push(t.liveMissingKey)
  if (!status.hasCorpus) reasons.push(t.liveMissingCorpus)
  if (status.providerMode === "scripted") reasons.push(t.liveProviderScripted)
  if (!status.hasAttestation) reasons.push(t.liveMissingAttestation)
  return reasons
}

export * as Views from "./views.ts"
