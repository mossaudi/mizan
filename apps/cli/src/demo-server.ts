#!/usr/bin/env bun
import { mkdtempSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { badgeFor, isOk, transcriptLabel } from "@mizan/core"
import { buildDemoCorpus, describeDemoCorpusFailure, type DemoCorpus } from "./demo-corpus.ts"
import { VERIFICATION_BUDGET_MS } from "./instructions.ts"
import { badgeHtml, encodeText, page, scriptFree } from "./server/html.ts"
import { parseVerifyForm, sampleById, verifyPlayground, VERIFY_SAMPLES, type VerifyFormInput } from "./server/playground.ts"
import { liveAskAvailable, runAskForRoot, runDemoSubprocess } from "./server/demo-runner.ts"

const ROOT = resolve(import.meta.dir, "..", "..", "..")
const DEFAULT_PORT = 3000

const DEMO_QUESTION_TEXTS: readonly string[] = [
  "What does the Qur'an say about the oneness of God?",
  "What does the hadith say about the end of the world and knowledge diminishing?",
]

const readPort = (): number => {
  const raw = process.env.PORT
  if (raw === undefined) return DEFAULT_PORT
  const parsed = Number(raw.trim())
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return DEFAULT_PORT
  return parsed
}

const homeBody = (verifyReady: boolean, verifyDetail: string, liveRoute: boolean): string => {
  const sampleButtons = VERIFY_SAMPLES.map(
    (sample) =>
      `<form method="post" action="/verify" style="display:inline;margin-right:0.5rem;margin-top:0.4rem;">` +
      `<input type="hidden" name="sample" value="${encodeText(sample.id)}">` +
      `<button type="submit" class="secondary">${encodeText(sample.label)}</button></form>`,
  ).join("\n")
  const liveNote = liveRoute
    ? "A live model route is configured on this server: typed questions run through the full pipeline."
    : "This deployment has no live model key. The sample questions below replay the committed transcript; the verifier still computes every badge live."
  return [
    `<section>`,
    `<h2>Ask a question</h2>`,
    `<p class="note">The two samples below run <code>bun run demo</code> on this machine — the same offline demonstration a judge runs from the repository. Answers are replayed from a committed transcript and labelled PRECOMPUTED; every badge in the output was computed by the verifier on that run.</p>`,
    `<form method="post" action="/ask">`,
    `<label for="question">Question</label>`,
    `<textarea id="question" name="question" placeholder="What does the Qur'an say about the oneness of God?"></textarea>`,
    `<button type="submit">Run</button>`,
    `</form>`,
    `<div class="samples">`,
    `<form method="post" action="/ask"><input type="hidden" name="sample" value="ikhlas"><button type="submit" class="secondary">Sample: oneness of God (replay)</button></form>`,
    `<form method="post" action="/ask"><input type="hidden" name="sample" value="fabricated-hadith"><button type="submit" class="secondary">Sample: fabricated hadith (replay)</button></form>`,
    `</div>`,
    `<p class="note">${encodeText(liveNote)}</p>`,
    `</section>`,
    `<section>`,
    `<h2>Verify a quote</h2>`,
    `<p class="note">Build a single claim and run the six-step verifier against the demo corpus — the same procedure that gates this repository. ${verifyReady ? "" : `<strong>Unavailable:</strong> ${encodeText(verifyDetail)}`}</p>`,
    `<form method="post" action="/verify">`,
    `<label for="claimText">Claim text (prose — never verified)</label>`,
    `<textarea id="claimText" name="claimText"></textarea>`,
    `<label for="quote">Quoted span (the falsifiable artefact)</label>`,
    `<textarea id="quote" name="quote" dir="rtl"></textarea>`,
    `<label for="collection">Collection</label>`,
    `<input type="text" id="collection" name="collection" placeholder="quran or abudawud">`,
    `<label for="number">Number</label>`,
    `<input type="text" id="number" name="number" placeholder="6222">`,
    `<button type="submit">Verify</button>`,
    `</form>`,
    `<div class="samples">${sampleButtons}</div>`,
    `<p class="note">Zero evidence blocks approval. A quote that is not contained in the record the citation resolves to is REJECTED; anything that cannot be decided is UNVERIFIABLE. There is no similarity score and no third state.</p>`,
    `</section>`,
    `<section>`,
    `<h2>What this page is</h2>`,
    `<p class="note">A server-rendered HTML form over the existing CLI. No client JavaScript runs in your browser: every badge on this site was computed by mizan-verify in the server's process, and the page carries no path that could assert a verdict by itself.</p>`,
    `</section>`,
  ].join("\n")
}

const askOutputPage = (title: string, output: string, note: string): string => {
  const body = [
    `<section>`,
    `<h2>${encodeText(title)}</h2>`,
    `<p class="note">${encodeText(note)}</p>`,
    `<pre>${encodeText(output)}</pre>`,
    `<form method="get" action="/"><button type="submit" class="secondary">Back</button></form>`,
    `</section>`,
  ].join("\n")
  return page(title, body)
}

const verifyResultPage = (input: VerifyFormInput, corpus: DemoCorpus, sampleLabel: string | null): string => {
  const result = verifyPlayground(corpus.db, corpus.snapshotHash, input)
  const badge = badgeFor(result.verdict.verdict)
  const evidence = result.verdict.evidence
  const evidenceHtml = evidence === null
    ? `<p class="note">No evidence record: the verdict is not a containment hit.</p>`
    : `<dl>` +
      `<dt>Record</dt><dd>${encodeText(evidence.recordId)}</dd>` +
      `<dt>Collection</dt><dd>${encodeText(evidence.collection)}</dd>` +
      `<dt>Number</dt><dd>${encodeText(evidence.number ?? "—")}</dd>` +
      `<dt>Grade (dataset's own, never ours)</dt><dd>${encodeText(evidence.grade ?? "this dataset asserts no grade for this row")}</dd>` +
      `<dt>Grade source</dt><dd>${encodeText(evidence.gradeSource)}</dd>` +
      `<dt>Source</dt><dd><a href="${encodeText(evidence.sourceUrl)}">${encodeText(evidence.sourceUrl)}</a></dd>` +
      `<dt>Licence</dt><dd>${encodeText(evidence.license)}</dd>` +
      `<dt>Attribution</dt><dd>${encodeText(evidence.attribution)}</dd>` +
      `<dt>Matched characters</dt><dd>${evidence.matchedChars} / ${evidence.quoteChars} (folded)</dd>` +
      `</dl>`
  const problemsHtml = result.problems.length === 0
    ? ""
    : `<h3>Resolution problems</h3><pre>${encodeText(result.problems.map((p) => `${p.citation.raw}: ${p.detail}`).join("\n"))}</pre>`
  const resolvedRows = result.resolved
    .map((entry) => {
      const ids = entry.records.map((record) => record.id).join(", ")
      const flag = entry.ambiguous ? " (ambiguous — number exists in more than one collection and none was named)" : ""
      return `${entry.citation.raw} → ${ids.length > 0 ? ids : "unresolved"}${flag}`
    })
    .join("\n")
  const body = [
    `<section>`,
    `<h2>Verdict ${badgeHtml(badge)}</h2>`,
    sampleLabel === null ? "" : `<p class="note">${encodeText(sampleLabel)}</p>`,
    `<dl>`,
    `<dt>Reason</dt><dd>${encodeText(result.verdict.reason)}</dd>`,
    `<dt>Match strength</dt><dd>${encodeText(result.verdict.matchStrength.kind)}</dd>` +
    `<dt>Snapshot hash</dt><dd><code>${encodeText(corpus.snapshotHash)}</code></dd>`,
    `<dt>Claim text (not verified)</dt><dd>${encodeText(result.claim.text)}</dd>`,
    `<dt>Quoted span</dt><dd dir="rtl">${encodeText(result.claim.quote ?? "")}</dd>`,
    `</dl>`,
    `<h3>Citation resolution</h3>`,
    `<pre>${encodeText(resolvedRows)}</pre>`,
    `<h3>Evidence</h3>`,
    evidenceHtml,
    problemsHtml,
    `<form method="get" action="/"><button type="submit" class="secondary">Back</button></form>`,
    `</section>`,
  ].join("\n")
  return page("mizan — verification playground", body)
}

const errorPage = (title: string, detail: string): string => {
  const body = [
    `<section>`,
    `<h2>${encodeText(title)}</h2>`,
    `<p class="note">${encodeText(detail)}</p>`,
    `<form method="get" action="/"><button type="submit" class="secondary">Back</button></form>`,
    `</section>`,
  ].join("\n")
  return page(title, body)
}

const textResponse = (status: number, body: string): Response =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } })

const healthResponse = (): Response =>
  new Response("ok\n", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } })

const readForm = async (request: Request): Promise<Record<string, string>> => {
  const form = await request.formData()
  const fields: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value
  }
  return fields
}

const handleAsk = async (fields: Record<string, string>): Promise<Response> => {
  const sampleId = fields.sample ?? ""
  const sampleKnown = sampleId === "ikhlas" || sampleId === "fabricated-hadith"
  const question = (fields.question ?? "").trim()
  const wantsDemo = sampleKnown || DEMO_QUESTION_TEXTS.includes(question)

  if (wantsDemo) {
    const demo = await runDemoSubprocess(ROOT)
    if (!demo.ok) {
      if (demo.error.kind === "busy") return textResponse(429, errorPage("mizan — demo busy", demo.error.detail))
      return textResponse(500, errorPage("mizan — demo unavailable", demo.error.detail))
    }
    return textResponse(200, askOutputPage(
      "bun run demo",
      demo.value,
      "Answers replay the committed transcript and are labelled PRECOMPUTED on screen; every badge was computed by the verifier on this run. The run appends nothing to the committed ledger.",
    ))
  }

  if (question.length === 0) {
    return textResponse(400, errorPage("mizan — question required", "Enter a question, or press one of the sample buttons."))
  }

  const ask = await runAskForRoot(ROOT, question)
  if (!ask.ok) {
    if (ask.error.kind === "live_route_unavailable") {
      return textResponse(503, errorPage(
        "mizan — model unavailable",
        "This deployment has no live model key. The sample questions on the home page replay the committed transcript instead; the verifier still computes every badge live. There is no canned answer and no guessed one.",
      ))
    }
    if (ask.error.kind === "invalid_question") return textResponse(400, errorPage("mizan — question rejected", ask.error.detail))
    if (ask.error.kind === "busy") return textResponse(429, errorPage("mizan — run busy", ask.error.detail))
    return textResponse(500, errorPage("mizan — run failed", ask.error.detail))
  }
  return textResponse(200, askOutputPage(
    "bun run ask",
    ask.value,
    liveAskAvailable(ROOT)
      ? "A live run through the full pipeline. The run header states whether the model was LIVE or a PRECOMPUTED replay."
      : "A replay run. The run header states whether the model was LIVE or a PRECOMPUTED replay.",
  ))
}

const handleVerify = async (fields: Record<string, string>, corpus: DemoCorpus | null, corpusDetail: string): Promise<Response> => {
  if (corpus === null) {
    return textResponse(503, errorPage("mizan — verifier corpus unavailable", corpusDetail))
  }
  const sampleId = (fields.sample ?? "").trim()
  if (sampleId.length > 0) {
    const sample = sampleById(sampleId)
    if (sample === null) {
      return textResponse(400, errorPage("mizan — unknown sample", "That sample id is not one this server knows."))
    }
    return textResponse(200, verifyResultPage(sample.input, corpus, sample.label))
  }
  const parsed = parseVerifyForm(fields)
  if (!parsed.ok) {
    return textResponse(400, errorPage("mizan — form rejected", parsed.error))
  }
  return textResponse(200, verifyResultPage(parsed.value, corpus, null))
}

const start = async (): Promise<void> => {
  const corpusDir = mkdtempSync(join(tmpdir(), "mizan-demo-server-"))
  const built = await buildDemoCorpus(ROOT, corpusDir)
  const corpus: DemoCorpus | null = isOk(built) ? built.value : null
  const corpusDetail: string = isOk(built) ? "" : describeDemoCorpusFailure(built.error)
  const port = readPort()
  const liveRoute = liveAskAvailable(ROOT)

  Bun.serve({
    port,
    fetch: async (request) => {
      const url = new URL(request.url)
      if (request.method === "GET" && url.pathname === "/health") return healthResponse()
      if (request.method === "GET" && url.pathname === "/") {
        return textResponse(200, page(
          "mizan — the balance",
          homeBody(corpus !== null, corpusDetail, liveRoute),
        ))
      }
      if (request.method === "POST" && url.pathname === "/ask") {
        const fields = await readForm(request)
        return handleAsk(fields)
      }
      if (request.method === "POST" && url.pathname === "/verify") {
        const fields = await readForm(request)
        return handleVerify(fields, corpus, corpusDetail)
      }
      return textResponse(404, errorPage("mizan — not found", "That path is not part of this demo."))
    },
  })

  const corpusState = corpus === null ? `unavailable (${corpusDetail})` : `${corpus.recordCount} records, hash ${corpus.snapshotHash}`
  console.log(`mizan demo server listening on http://127.0.0.1:${port}`)
  console.log(`  health        http://127.0.0.1:${port}/health`)
  console.log(`  transcript    ${transcriptLabel("precomputed")} — verdicts computed live`)
  console.log(`  verify corpus ${corpusState}`)
  console.log(`  live ask      ${liveRoute ? "configured" : "not configured — sample replays only"}`)
  console.log(`  logging       this server writes no question text to any log or trace`)
  const home = homeBody(corpus !== null, corpusDetail, liveRoute)
  console.log(`  client js     ${scriptFree(home) ? "none — pages carry no script tags" : "DEFECT: a page contained a script tag"}`)
  console.log(`  budget        ${VERIFICATION_BUDGET_MS} ms per claim`)
  console.log(`  badge rule    system instructions are a hint; containment decides every badge`)
}

await start()
