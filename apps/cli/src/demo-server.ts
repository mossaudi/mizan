#!/usr/bin/env bun
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { isOk, transcriptLabel } from "@mizan/core"
import { buildDemoCorpus, describeDemoCorpusFailure, type DemoCorpus } from "./demo-corpus.ts"
import { VERIFICATION_BUDGET_MS } from "./instructions.ts"
import { page, scriptFree } from "./server/html.ts"
import { parseVerifyForm, sampleById, verifyPlayground, type VerifyFormInput } from "./server/playground.ts"
import { liveAskAvailable, runAskForRoot, runDemoSubprocess } from "./server/demo-runner.ts"
import {
  askOutputBody,
  errorBody,
  homeBody,
  MODE_LIVE_NOTE,
  MODE_PRECOMPUTED_NOTE,
  MODE_REPLAY_NOTE,
  verifyResultBody,
} from "./server/views.ts"

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

const homeDocument = (corpus: DemoCorpus | null, corpusDetail: string, liveRoute: boolean): string =>
  page(
    "mizan — the balance",
    homeBody(
      corpus !== null,
      corpusDetail,
      liveRoute,
      corpus?.recordCount ?? 0,
      corpus?.collectionCounts ?? {},
      corpus?.snapshotHash ?? "",
    ),
    { modeLabel: transcriptLabel("precomputed"), modeNote: "verdicts computed live in this server process" },
  )

const askOutputDocument = (title: string, output: string, noteText: string): string =>
  page(title, askOutputBody(title, output, noteText))

const verifyResultDocument = (input: VerifyFormInput, corpus: DemoCorpus, sampleLabel: string | null): string => {
  const result = verifyPlayground(corpus.db, corpus.snapshotHash, input)
  return page("mizan — verification playground", verifyResultBody(result, sampleLabel))
}

const errorDocument = (title: string, detail: string): string => page(title, errorBody(title, detail))

const textResponse = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  })

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
      if (demo.error.kind === "busy") return textResponse(429, errorDocument("mizan — demo busy", demo.error.detail))
      return textResponse(500, errorDocument("mizan — demo unavailable", demo.error.detail))
    }
    return textResponse(200, askOutputDocument("bun run demo", demo.value, MODE_PRECOMPUTED_NOTE))
  }

  if (question.length === 0) {
    return textResponse(400, errorDocument("mizan — question required", "Enter a question, or press one of the sample buttons."))
  }

  const ask = await runAskForRoot(ROOT, question)
  if (!ask.ok) {
    if (ask.error.kind === "live_route_unavailable") {
      return textResponse(503, errorDocument(
        "mizan — model unavailable",
        "This deployment has no live model key. The sample questions on the home page replay the committed transcript instead; the verifier still computes every badge live. There is no canned answer and no guessed one.",
      ))
    }
    if (ask.error.kind === "invalid_question") return textResponse(400, errorDocument("mizan — question rejected", ask.error.detail))
    if (ask.error.kind === "busy") return textResponse(429, errorDocument("mizan — run busy", ask.error.detail))
    return textResponse(500, errorDocument("mizan — run failed", ask.error.detail))
  }
  return textResponse(200, askOutputDocument(
    "bun run ask",
    ask.value,
    liveAskAvailable(ROOT) ? MODE_LIVE_NOTE : MODE_REPLAY_NOTE,
  ))
}

const handleVerify = async (fields: Record<string, string>, corpus: DemoCorpus | null, corpusDetail: string): Promise<Response> => {
  if (corpus === null) {
    return textResponse(503, errorDocument("mizan — verifier corpus unavailable", corpusDetail))
  }
  const sampleId = (fields.sample ?? "").trim()
  if (sampleId.length > 0) {
    const sample = sampleById(sampleId)
    if (sample === null) {
      return textResponse(400, errorDocument("mizan — unknown sample", "That sample id is not one this server knows."))
    }
    return textResponse(200, verifyResultDocument(sample.input, corpus, sample.label))
  }
  const parsed = parseVerifyForm(fields)
  if (!parsed.ok) {
    return textResponse(400, errorDocument("mizan — form rejected", parsed.error))
  }
  return textResponse(200, verifyResultDocument(parsed.value, corpus, null))
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
    hostname: "0.0.0.0",
    fetch: async (request) => {
      const url = new URL(request.url)
      if (request.method === "GET" && url.pathname === "/health") return healthResponse()
      if (request.method === "GET" && url.pathname === "/") {
        return textResponse(200, homeDocument(corpus, corpusDetail, liveRoute))
      }
      if (request.method === "POST" && url.pathname === "/ask") {
        const fields = await readForm(request)
        return handleAsk(fields)
      }
      if (request.method === "POST" && url.pathname === "/verify") {
        const fields = await readForm(request)
        return handleVerify(fields, corpus, corpusDetail)
      }
      return textResponse(404, errorDocument("mizan — not found", "That path is not part of this demo."))
    },
  })

  const corpusState = corpus === null ? `unavailable (${corpusDetail})` : `${corpus.recordCount} records, hash ${corpus.snapshotHash}`
  console.log(`mizan demo server listening on http://0.0.0.0:${port}`)
  console.log(`  health        http://127.0.0.1:${port}/health`)
  console.log(`  transcript    ${transcriptLabel("precomputed")} — verdicts computed live`)
  console.log(`  verify corpus ${corpusState}`)
  console.log(`  live ask      ${liveRoute ? "configured" : "not configured — sample replays only"}`)
  console.log(`  logging       this server writes no question text to any log or trace`)
  const home = homeDocument(corpus, corpusDetail, liveRoute)
  console.log(`  client js     ${scriptFree(home) ? "none — pages carry no script tags" : "DEFECT: a page contained a script tag"}`)
  console.log(`  budget        ${VERIFICATION_BUDGET_MS} ms per claim`)
  console.log(`  badge rule    system instructions are a hint; containment decides every badge`)
}

await start()
