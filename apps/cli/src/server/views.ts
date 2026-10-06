import { badgeFor, transcriptLabel, type Verdict, type VerdictReason } from "@mizan/core"
import { VERIFICATION_BUDGET_MS } from "../instructions.ts"
import { badgeHtml, encodeText, note, section } from "./html.ts"
import { VERIFY_SAMPLES, type PlaygroundResult } from "./playground.ts"

const BADGE_MEANING = {
  verified: "the quoted span is contained in the record the claim cites, after deterministic folding.",
  unverifiable: "mizan cannot decide: no citation, an unresolvable identifier, an empty quote, a paraphrase, a timeout or malformed model output.",
  rejected: "the citation resolved to a real record and that record does not contain the quote.",
} as const satisfies Readonly<Record<Verdict, string>>

const REASON_MEANING = {
  exact_containment: "the folded quote is contained in the folded cited record — the only route to VERIFIED.",
  empty_quote: "the quoted span was empty or diacritics-only; nothing falsifiable to compare.",
  no_citation: "the claim carried no citation; zero evidence blocks approval.",
  citation_cap_exceeded: "more citations than the per-claim cap and none survived.",
  identifier_unresolved: "the cited identifier does not resolve to any record; a negative cannot be proven.",
  collection_ambiguous: "the number exists in more than one collection and the citation named none.",
  quote_absent_at_cited_id: "the citation resolved to a real record and that record does not contain the quote — the only route to REJECTED.",
  no_matching_evidence: "a verified verdict carried no matching evidence and was coerced down to UNVERIFIABLE.",
  verification_timeout: "the verification budget elapsed; never a cached prior verdict.",
  decomposition_failed: "claim decomposition produced unusable output.",
} as const satisfies Readonly<Record<VerdictReason, string>>

const badgeLegend = (): string => {
  const rows = (Object.keys(BADGE_MEANING) as readonly (keyof typeof BADGE_MEANING)[]).map(
    (verdict) =>
      `<li>${badgeHtml(badgeFor(verdict))} <span>${encodeText(BADGE_MEANING[verdict])}</span></li>`,
  )
  return [`<ul class="plain">`, ...rows, "</ul>"].join("\n")
}

const hero = (liveRoute: boolean, corpusAvailable: boolean, corpusDetail: string, recordCount: number, collectionCounts: Readonly<Record<string, number>>, snapshotHash: string): string => {
  const collections = Object.entries(collectionCounts)
    .map(([name, count]) => `${encodeText(name)} ${count}`)
    .join(" · ")
  const corpusValue = corpusAvailable
    ? `${recordCount} attested demo records${collections.length > 0 ? ` (${collections})` : ""}`
    : `unavailable — ${encodeText(corpusDetail)}`
  return [
    `<div class="hero">`,
    `<h1>mizan <span class="ar" lang="ar" dir="rtl">ميزان</span> — the balance</h1>`,
    `<p class="lede">Per-claim citation verification for Qur&#39;an and hadith answers. Every badge on this site was computed by strict normalised containment against an attested corpus — never asserted by a model, never a similarity score.</p>`,
    `<p class="claim">The badge you see was computed, not asserted.</p>`,
    `<div class="badge-row">${badgeHtml(badgeFor("verified"))}${badgeHtml(badgeFor("rejected"))}${badgeHtml(badgeFor("unverifiable"))}</div>`,
    `<div class="status-grid">`,
    `<div class="status-item"><span class="k">Demo corpus</span><span class="v">${corpusValue}</span></div>`,
    `<div class="status-item"><span class="k">Snapshot hash</span><span class="v">${encodeText(snapshotHash.length > 0 ? snapshotHash : "—")}</span></div>`,
    `<div class="status-item"><span class="k">Live model route</span><span class="v">${liveRoute ? "configured on this server" : "not configured — replay samples only"}</span></div>`,
    `<div class="status-item"><span class="k">Verification budget</span><span class="v">${VERIFICATION_BUDGET_MS} ms per claim</span></div>`,
    `<div class="status-item"><span class="k">Client JavaScript</span><span class="v">none — pages carry no script tags</span></div>`,
    `</div>`,
    `</div>`,
  ].join("\n")
}

const askSection = (liveRoute: boolean): string => {
  const liveNote = liveRoute
    ? "A live model route is configured on this server: typed questions run through the full pipeline."
    : "This deployment has no live model key. The sample questions replay the committed transcript; the verifier still computes every badge live."
  const sampleForms = [
    { id: "ikhlas", label: "Sample: oneness of God (replay)" },
    { id: "fabricated-hadith", label: "Sample: fabricated hadith (replay)" },
  ]
    .map(
      (sample) =>
        `<form method="post" action="/ask"><input type="hidden" name="sample" value="${encodeText(sample.id)}">` +
        `<button type="submit" class="secondary">${encodeText(sample.label)}</button></form>`,
    )
    .join("\n")
  return section(
    "ask",
    "Ask a question",
    [
      `<p>The samples run <code>bun run demo</code> on this machine — the same offline demonstration a judge runs from the repository. Answers replay a committed transcript and are labelled PRECOMPUTED on screen; every badge in the output was computed by the verifier on that run.</p>`,
      `<form method="post" action="/ask">`,
      `<label for="question">Question</label>`,
      `<textarea id="question" name="question" maxlength="10000" placeholder="What does the Qur&#39;an say about the oneness of God?"></textarea>`,
      `<button type="submit">Run</button>`,
      `</form>`,
      `<div class="samples">${sampleForms}</div>`,
      note(liveNote),
      note("Run traces carry a hash of the question, never the question text. This server writes no question text to any log."),
    ].join("\n"),
  )
}

const verifySection = (verifyReady: boolean, verifyDetail: string): string => {
  const sampleButtons = VERIFY_SAMPLES.map(
    (sample) =>
      `<form method="post" action="/verify"><input type="hidden" name="sample" value="${encodeText(sample.id)}">` +
      `<button type="submit" class="secondary">${encodeText(sample.label)}</button></form>`,
  ).join("\n")
  const unavailable = verifyReady ? "" : `<p><strong>Unavailable:</strong> ${encodeText(verifyDetail)}</p>`
  return section(
    "verify",
    "Verify a quote",
    [
      `<p>Build one claim and run the six-step verifier against the demo corpus — the same procedure that gates this repository. The prose field is never verified; only the quoted span is falsifiable.</p>`,
      unavailable,
      `<form method="post" action="/verify">`,
      `<label for="claimText">Claim text <span class="hint">prose — never verified</span></label>`,
      `<textarea id="claimText" name="claimText" maxlength="4000"></textarea>`,
      `<label for="quote">Quoted span <span class="hint">the falsifiable artefact</span></label>`,
      `<textarea id="quote" name="quote" dir="rtl" maxlength="4000" required placeholder="قُلْ هُوَ ٱللَّهُ أَحَدٌ"></textarea>`,
      `<label for="collection">Collection</label>`,
      `<input type="text" id="collection" name="collection" maxlength="32" required placeholder="quran or abudawud">`,
      `<label for="number">Number <span class="hint">digits, or empty for an unnumbered row</span></label>`,
      `<input type="text" id="number" name="number" maxlength="64" placeholder="6222">`,
      `<button type="submit">Verify</button>`,
      `</form>`,
      `<div class="samples">${sampleButtons}</div>`,
      note("Zero evidence blocks approval. A quote that is not contained in the record the citation resolves to is REJECTED; anything that cannot be decided is UNVERIFIABLE. There is no similarity score and no third state."),
    ].join("\n"),
  )
}

const badgesSection = (): string =>
  section(
    "badges",
    "The three badges",
    [
      `<p>These are the only verdicts the verifier can emit. There is no fourth state and no default badge.</p>`,
      badgeLegend(),
      note("A display-only longest-run diagnostic exists for human reading; it is not a verdict, and the verifier cannot import it."),
    ].join("\n"),
  )

const procedureSection = (): string =>
  section(
    "procedure",
    "How a badge is computed",
    [
      `<p>Per claim, in order. Each step fails closed and returns early; the happy path is the last line. The procedure lives in <code>packages/mizan-verify/src/verify.ts</code>.</p>`,
      `<ol class="steps">`,
      `<li><strong>the quote.</strong> An empty or diacritics-only quoted span is UNVERIFIABLE. Only a quoted span is falsifiable; the model&#39;s prose is never verified.</li>`,
      `<li><strong>a citation.</strong> A claim with none is UNVERIFIABLE. Zero evidence blocks approval.</li>`,
      `<li><strong>the cap.</strong> More than three citations are capped; the cap becomes the recorded reason only when it is the reason.</li>`,
      `<li><strong>resolution.</strong> If no cited record exists the claim is UNVERIFIABLE; a number that exists in several collections with none named is UNVERIFIABLE as ambiguous.</li>`,
      `<li><strong>containment.</strong> The folded quote is compared to the folded cited record by strict normalised substring containment. A hit is VERIFIED, with evidence. This is the only route to VERIFIED in the repository.</li>`,
      `<li><strong>coercion.</strong> A VERIFIED carrying no evidence is coerced down to UNVERIFIABLE, and the evidence is cleared so nothing downstream can render a confident badge with no provenance.</li>`,
      `</ol>`,
      note("Between containment and accusation sits the anchor arm: an abridgement that a hand-drawn anchor locates in the cited record yields UNVERIFIABLE — never VERIFIED and never REJECTED. System instructions tell the model to quote verbatim; that hint improves output quality, never the verdict."),
      `<h3>What the fold is</h3>`,
      `<p>One table, in <code>packages/mizan-core/src/normalize/fold-table.ts</code>, applied once at ingest. It normalises alef and hamza forms, the wasla, ta-marbuta, diacritics, tatweel, digit forms and punctuation. It never rewrites, adds or removes a letter — which is exactly why a fabrication cannot be folded into a match.</p>`,
      note("The folded column is a matching key, not a text. Every user surface renders the original; only the verifier compares the key."),
      `<h3>Grades are never ours</h3>`,
      `<p>A grade is stored exactly as the source dataset asserts it, together with who published it and on what basis. Rows the dataset declines to grade carry an explicit &#8220;no grade&#8221; state rather than a default. The product never infers, upgrades or presents a grade as its own ruling.</p>`,
    ].join("\n"),
  )

const degradationSection = (): string =>
  section(
    "degradation",
    "Honest degradation",
    [
      `<p>Each failure has one correct surface. These are the words the product prints; a different spelling of the same absence is a defect, not a style choice.</p>`,
      `<ul class="plain">`,
      `<li>provider unreachable inside its 30s budget → <code>model unavailable</code> — never a canned answer, never a silent mock.</li>`,
      `<li>corpus consulted, nothing citable → <code>no sources found</code> — never a guess, never a cached answer.</li>`,
      `<li>verification timeout or malformed model output → <code>unverifiable</code> — never <code>verified</code>, never a cached prior verdict.</li>`,
      `<li>attestation mismatch or ledger write failure → loud integrity error, no verdict — never warn-and-proceed.</li>`,
      `<li>corpus absent or unreadable → the pipeline is not entered; the CLI names the state and exits.</li>`,
      `<li>not every claim verified → the run action is <code>refer_to_scholar</code>, not a composite yes.</li>`,
      `</ul>`,
      note("Second-ranker absence is reported in run metadata as semanticRanking: unavailable, never as a silent downgrade presented as full fidelity. Tafsir backends report unavailable rather than fabricating tafsir."),
    ].join("\n"),
  )

const provenanceSection = (): string =>
  section(
    "provenance",
    "Provenance you can check",
    [
      `<ul class="plain">`,
      `<li>The corpus snapshot is attested; a mismatch between the database and its attestation aborts the run rather than producing a badge.</li>`,
      `<li>Every ledger row is hash-chained — each row carries the hash of the row before it. <code>bun run verify:chain</code> re-checks the chain from the committed file.</li>`,
      `<li>Run traces carry a hash of the question, never the question text.</li>`,
      `<li>Every badge is computed against a snapshot whose hash is shown beside it in the CLI report and on this site&#39;s verdict pages.</li>`,
      `<li>Match strength is a constrained type — <code>exact</code> or <code>none</code> — not a percentage we computed.</li>`,
      `</ul>`,
    ].join("\n"),
  )

const sourcesSection = (): string =>
  section(
    "sources",
    "Sources and licences",
    [
      `<p>Corpus text is not covered by the code&#39;s Apache-2.0 licence. Per-source terms live in <code>data/registry/sources.json</code>, and gate G-5 fails the build on an empty licence field.</p>`,
      `<table class="data">`,
      `<tr><th>Source</th><th>Role</th><th>Terms</th></tr>`,
      `<tr><td>Tanzil Project</td><td>Qur&#39;an, Uthmani script, 6,236 records</td><td>Distributed unmodified under the Tanzil terms of use (no-derivatives class in the registry).</td></tr>`,
      `<tr><td>QuranLab</td><td>Hadith and per-row grades, 36,024 records ingested</td><td>Arabic matn public domain per the dataset card. Grades stored exactly as published.</td></tr>`,
      `</table>`,
      `<p>Served collections in the full snapshot: the Qur&#39;an, Sunan Abi Dawud, Sunan an-Nasa&#39;i, Sunan Ibn Majah, Jami&#39; at-Tirmidhi, and Malik&#39;s Muwatta — 27,234 rows, as recorded in <code>docs/value-proof.md</code>. Bukhari, Muslim and an-Nawawi are not served; the registry says so rather than implying a wider coverage than the snapshot holds.</p>`,
      note("This demo server rebuilds a small attested corpus from committed anchors (data/eval/demo-anchors.json) so the playground can compute real verdicts offline. The figures above describe the full snapshot, not this demo corpus."),
    ].join("\n"),
  )

const runSection = (): string =>
  section(
    "run",
    "Where to run it",
    [
      `<ul class="plain">`,
      `<li><code>bun run demo</code> — the offline demonstration. No API key, labelled replay, full report with each source&#39;s URL and the snapshot hash beside every badge.</li>`,
      `<li><code>bun run ask</code> — the CLI question path. With a key set it runs the live model against an allowlisted OpenAI-compatible endpoint; without one it replays the committed transcript and labels every line precomputed.</li>`,
      `<li><code>bun run demo-server</code> — this server. Server-rendered HTML, no client-side script: an ask form, a verify playground, and <code>GET /health</code> for the platform. Badges are computed in the server process.</li>`,
      `<li><code>bun run mcp</code> — mizan verification as a read-only MCP tool (server name <code>mizan-verify</code>) for other AI applications, over stdio.</li>`,
      `<li><code>bun run ci</code> — typecheck, per-package tests, then the structural gates G-1 through G-7.</li>`,
      `</ul>`,
      note("The repository is at github.com/mossaudi/mizan. Deployment notes for the static exhibit and this hosted demo are in docs/live-demo.md; the offline command walkthrough is docs/demo-runbook.md."),
    ].join("\n"),
  )

export const homeBody = (
  corpusAvailable: boolean,
  corpusDetail: string,
  liveRoute: boolean,
  recordCount: number,
  collectionCounts: Readonly<Record<string, number>>,
  snapshotHash: string,
): string =>
  [
    hero(liveRoute, corpusAvailable, corpusDetail, recordCount, collectionCounts, snapshotHash),
    askSection(liveRoute),
    verifySection(corpusAvailable, corpusDetail),
    badgesSection(),
    procedureSection(),
    degradationSection(),
    provenanceSection(),
    sourcesSection(),
    runSection(),
  ].join("\n")

export const reasonMeaning = (reason: VerdictReason): string => REASON_MEANING[reason]

export const badgeMeaning = (verdict: Verdict): string => BADGE_MEANING[verdict]

export const askOutputBody = (title: string, output: string, noteText: string): string =>
  [
    `<section class="card">`,
    `<h2>${encodeText(title)}</h2>`,
    note(noteText),
    `<h3>Terminal output</h3>`,
    `<pre>${encodeText(output)}</pre>`,
    `<form method="get" action="/"><button type="submit" class="secondary">Back</button></form>`,
    `</section>`,
  ].join("\n")

export const verifyResultBody = (result: PlaygroundResult, sampleLabel: string | null): string => {
  const verdict = result.verdict.verdict
  const badge = badgeFor(verdict)
  const evidence = result.verdict.evidence
  const evidenceHtml =
    evidence === null
      ? `<p class="note">No evidence record: the verdict is not a containment hit. A REJECTED carries no evidence because the quote is absent from the cited record — the absence is the finding.</p>`
      : [
          `<dl class="kv">`,
          `<dt>Record</dt><dd><code>${encodeText(evidence.recordId)}</code></dd>`,
          `<dt>Collection</dt><dd>${encodeText(evidence.collection)}</dd>`,
          `<dt>Number</dt><dd>${encodeText(evidence.number ?? "—")}</dd>`,
          `<dt>Grade</dt><dd>${encodeText(evidence.grade ?? "this dataset asserts no grade for this row")}</dd>`,
          `<dt>Grade source</dt><dd>${encodeText(evidence.gradeSource)}</dd>`,
          `<dt>Source</dt><dd>${encodeText(evidence.sourceUrl)}</dd>`,
          `<dt>Licence</dt><dd>${encodeText(evidence.license)}</dd>`,
          `<dt>Attribution</dt><dd>${encodeText(evidence.attribution)}</dd>`,
          `<dt>Folded match</dt><dd>${evidence.matchedChars} / ${evidence.quoteChars} characters</dd>`,
          `</dl>`,
        ].join("\n")
  const problemsHtml =
    result.problems.length === 0
      ? ""
      : [
          `<h3>Resolution problems</h3>`,
          `<pre>${encodeText(result.problems.map((p) => `${p.citation.raw}: ${p.detail}`).join("\n"))}</pre>`,
        ].join("\n")
  const resolvedRows = result.resolved
    .map((entry) => {
      const ids = entry.records.map((record) => record.id).join(", ")
      const flag = entry.ambiguous ? " — ambiguous: number exists in more than one collection and none was named" : ""
      return `${entry.citation.raw} → ${ids.length > 0 ? ids : "unresolved"}${flag}`
    })
    .join("\n")
  const sampleLine = sampleLabel === null ? "" : `<p>${encodeText(sampleLabel)}</p>`
  return [
    `<section class="card">`,
    `<h2>Verdict</h2>`,
    `<div class="verdict-hero">`,
    badgeHtml(badge),
    `<p class="verdict-meaning">${encodeText(badgeMeaning(verdict))}</p>`,
    `</div>`,
    sampleLine,
    `<dl class="kv">`,
    `<dt>Reason</dt><dd><code>${encodeText(result.verdict.reason)}</code> — ${encodeText(reasonMeaning(result.verdict.reason))}</dd>`,
    `<dt>Match strength</dt><dd><code>${encodeText(result.verdict.matchStrength.kind)}</code>${result.verdict.matchStrength.kind === "exact" ? " — a containment hit at 100%; there is no partial credit" : " — no containment match is claimed"}</dd>`,
    `<dt>Snapshot hash</dt><dd><code>${encodeText(result.snapshotHash)}</code></dd>`,
    `<dt>Claim text</dt><dd>${encodeText(result.claim.text)} <span class="note">(not verified)</span></dd>`,
    `<dt>Quoted span</dt><dd dir="rtl">${encodeText(result.claim.quote ?? "")}</dd>`,
    `</dl>`,
    `<h3>Citation resolution</h3>`,
    `<pre>${encodeText(resolvedRows)}</pre>`,
    `<h3>Evidence</h3>`,
    evidenceHtml,
    problemsHtml,
    note("Grades shown above are the dataset&#39;s own, never mizan&#39;s. A grade of null means the dataset asserts none for this row."),
    `<form method="get" action="/"><button type="submit" class="secondary">Back</button></form>`,
    `</section>`,
  ].join("\n")
}

export const errorBody = (title: string, detail: string): string =>
  [
    `<section class="card">`,
    `<h2>${encodeText(title)}</h2>`,
    `<p>${encodeText(detail)}</p>`,
    `<form method="get" action="/"><button type="submit" class="secondary">Back</button></form>`,
    `</section>`,
  ].join("\n")

export const MODE_PRECOMPUTED_NOTE =
  "Answers replay the committed transcript and are labelled PRECOMPUTED on screen; every badge was computed by the verifier on this run. The run appends nothing to the committed ledger."

export const MODE_LIVE_NOTE =
  "A live run through the full pipeline. The run header states whether the model was LIVE or a PRECOMPUTED replay."

export const MODE_REPLAY_NOTE =
  "A replay run. The run header states whether the model was LIVE or a PRECOMPUTED replay."

export const transcriptModeLabel = (): string => transcriptLabel("precomputed")

export * as Views from "./views.ts"
