#!/usr/bin/env bun
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { isOk, transcriptLabel } from "@mizan/core"
import { describeCorpusFailure, openServerCorpus, type ServerCorpus } from "./server/corpus.ts"
import { VERIFICATION_BUDGET_MS } from "./instructions.ts"
import { page, scriptFree } from "./server/html.ts"
import {
  DEMO_QUESTIONS,
  LANG_COOKIE,
  langCookieHeader,
  readCookie,
  resolveLang,
  strings,
  type Lang,
} from "./server/i18n.ts"
import { sampleById, verifyPlayground, type VerifyFormInput } from "./server/playground.ts"
import { parseSearchForm, searchAndVerify, type SearchFormInput } from "./server/search-verify.ts"
import { liveRouteStatus, runAskForRoot, runDemoSubprocess } from "./server/demo-runner.ts"
import {
  askOutputBody,
  errorBody,
  homeBody,
  liveMissingReasons,
  methodBody,
  modeNoteFor,
  searchResultBody,
  verifyResultBody,
} from "./server/views.ts"

const ROOT = resolve(import.meta.dir, "..", "..", "..")
const DEFAULT_PORT = 3000

const readPort = (): number => {
  const raw = process.env.PORT
  if (raw === undefined) return DEFAULT_PORT
  const parsed = Number(raw.trim())
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return DEFAULT_PORT
  return parsed
}

const homeDocument = (
  lang: Lang,
  corpus: ServerCorpus | null,
  corpusDetail: string,
  liveAvailable: boolean,
  liveMissing: readonly string[],
): string => {
  const t = strings(lang)
  return page(
    lang === "ar" ? "ميزان — الميزان" : "mizan — the balance",
    homeBody({
      lang,
      corpusAvailable: corpus !== null,
      corpusDetail,
      corpusKind: corpus?.kind ?? "none",
      liveAvailable,
      liveMissing,
      recordCount: corpus?.recordCount ?? 0,
      collectionCounts: corpus?.collectionCounts ?? {},
      snapshotHash: corpus?.snapshotHash ?? "",
    }),
    { modeLabel: transcriptLabel("precomputed"), modeNote: t.modeVerdictsLive, lang },
  )
}

const askOutputDocument = (lang: Lang, title: string, output: string, noteText: string): string =>
  page(title, askOutputBody(lang, title, output, noteText), { lang })

const verifyResultDocument = (
  lang: Lang,
  input: VerifyFormInput,
  corpus: ServerCorpus,
  sampleLabel: string | null,
): string => {
  const result = verifyPlayground(corpus.db, corpus.snapshotHash, input)
  const title = lang === "ar" ? "ميزان — ساحة التحقّق" : "mizan — verification playground"
  return page(title, verifyResultBody(lang, result, sampleLabel), { lang })
}

const searchDocument = (lang: Lang, corpus: ServerCorpus, parsed: SearchFormInput): string => {
  const result = searchAndVerify(corpus.db, corpus.snapshotHash, parsed)
  const title = lang === "ar" ? "ميزان — نتائج البحث" : "mizan — search results"
  return page(title, searchResultBody(lang, result, { kind: corpus.kind, recordCount: corpus.recordCount }), { lang })
}

const methodDocument = (lang: Lang): string => {
  const t = strings(lang)
  return page(lang === "ar" ? "ميزان — الأسلوب" : "mizan — how it works", methodBody(lang), {
    lang,
    nav: [
      { href: `/?lang=${lang}#ask`, label: t.navAsk },
      { href: `/?lang=${lang}#verify`, label: t.navVerify },
      { href: `/?lang=${lang}`, label: lang === "ar" ? "الصفحة الرئيسية" : "Home" },
    ],
  })
}

const errorDocument = (lang: Lang, title: string, detail: string): string =>
  page(title, errorBody(lang, title, detail), { lang })

const textResponse = (status: number, body: string, lang: Lang): Response => {
  const explicit = lang
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
      "set-cookie": langCookieHeader(explicit),
    },
  })
}

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

const langFrom = (request: Request, fields: Record<string, string> | null, url: URL): Lang => {
  const query = url.searchParams.get("lang")
  const field = fields === null ? null : (fields.lang ?? null)
  const cookie = readCookie(request.headers.get("cookie"), LANG_COOKIE)
  const acceptLanguage = request.headers.get("accept-language")
  return resolveLang({ query, field, cookie, acceptLanguage })
}

const handleAsk = async (
  lang: Lang,
  fields: Record<string, string>,
  liveAvailable: boolean,
): Promise<Response> => {
  const t = strings(lang)
  const sampleId = fields.sample ?? ""
  const sampleKnown = sampleId === "ikhlas" || sampleId === "fabricated-hadith"
  const question = (fields.question ?? "").trim()
  const wantsDemo = sampleKnown || DEMO_QUESTIONS.includes(question)

  if (wantsDemo) {
    const demo = await runDemoSubprocess(ROOT)
    if (!demo.ok) {
      if (demo.error.kind === "busy") {
        return textResponse(429, errorDocument(lang, t.errDemoBusyTitle, demo.error.detail), lang)
      }
      return textResponse(500, errorDocument(lang, t.errDemoUnavailableTitle, demo.error.detail), lang)
    }
    return textResponse(200, askOutputDocument(lang, "bun run demo", demo.value, modeNoteFor(lang, "precomputed")), lang)
  }

  if (question.length === 0) {
    return textResponse(
      400,
      errorDocument(lang, t.errQuestionRequiredTitle, t.errQuestionRequiredDetail),
      lang,
    )
  }

  const ask = await runAskForRoot(ROOT, question)
  if (!ask.ok) {
    if (ask.error.kind === "live_route_unavailable") {
      return textResponse(
        503,
        errorDocument(lang, t.errModelUnavailableTitle, `${t.errModelUnavailableDetail} ${ask.error.detail}`),
        lang,
      )
    }
    if (ask.error.kind === "invalid_question") {
      return textResponse(400, errorDocument(lang, t.errQuestionRejectedTitle, ask.error.detail), lang)
    }
    if (ask.error.kind === "busy") {
      return textResponse(429, errorDocument(lang, t.errRunBusyTitle, ask.error.detail), lang)
    }
    return textResponse(500, errorDocument(lang, t.errRunFailedTitle, ask.error.detail), lang)
  }
  return textResponse(
    200,
    askOutputDocument(lang, "bun run ask", ask.value, modeNoteFor(lang, liveAvailable ? "live" : "replay")),
    lang,
  )
}

const handleVerify = async (
  lang: Lang,
  fields: Record<string, string>,
  corpus: ServerCorpus | null,
  corpusDetail: string,
): Promise<Response> => {
  const t = strings(lang)
  if (corpus === null) {
    return textResponse(503, errorDocument(lang, t.errCorpusUnavailableTitle, corpusDetail), lang)
  }
  const sampleId = (fields.sample ?? "").trim()
  if (sampleId.length > 0) {
    const sample = sampleById(sampleId)
    if (sample === null) {
      return textResponse(400, errorDocument(lang, t.errUnknownSampleTitle, t.errUnknownSampleDetail), lang)
    }
    const label = sampleId === "quran-6222" ? t.verifySampleA : t.verifySampleB
    return textResponse(200, verifyResultDocument(lang, sample.input, corpus, label), lang)
  }
  const parsed = parseSearchForm(fields)
  if (!parsed.ok) {
    return textResponse(400, errorDocument(lang, t.errFormRejectedTitle, `${t.verifyResultFormError} ${parsed.error}`), lang)
  }
  return textResponse(200, searchDocument(lang, corpus, parsed.value), lang)
}

const start = async (): Promise<void> => {
  const corpusDir = mkdtempSync(join(tmpdir(), "mizan-demo-server-"))
  const built = await openServerCorpus(ROOT, corpusDir)
  const corpus: ServerCorpus | null = isOk(built) ? built.value : null
  const corpusDetail: string = isOk(built) ? "" : describeCorpusFailure(built.error)
  const port = readPort()
  const liveStatus = liveRouteStatus(ROOT)
  const liveMissingEn = liveMissingReasons("en", liveStatus)

  Bun.serve({
    port,
    hostname: "0.0.0.0",
    fetch: async (request) => {
      const url = new URL(request.url)
      if (request.method === "GET" && url.pathname === "/health") return healthResponse()
      if (request.method === "GET" && url.pathname === "/") {
        const lang = langFrom(request, null, url)
        return textResponse(200, homeDocument(lang, corpus, corpusDetail, liveStatus.available, liveMissingEn), lang)
      }
      if (request.method === "GET" && url.pathname === "/method") {
        const lang = langFrom(request, null, url)
        return textResponse(200, methodDocument(lang), lang)
      }
      if (request.method === "POST" && url.pathname === "/ask") {
        const fields = await readForm(request)
        const lang = langFrom(request, fields, url)
        return handleAsk(lang, fields, liveStatus.available)
      }
      if (request.method === "POST" && url.pathname === "/verify") {
        const fields = await readForm(request)
        const lang = langFrom(request, fields, url)
        return handleVerify(lang, fields, corpus, corpusDetail)
      }
      const lang = langFrom(request, null, url)
      return textResponse(404, errorDocument(lang, strings(lang).errNotFoundTitle, strings(lang).errNotFoundDetail), lang)
    },
  })

  const corpusState =
    corpus === null
      ? `unavailable (${corpusDetail})`
      : `${corpus.kind === "snapshot" ? "attested snapshot" : "demo anchors"} — ${corpus.recordCount} records, hash ${corpus.snapshotHash}`
  const liveLine = liveStatus.available
    ? "configured"
    : `not configured — ${liveMissingEn.length > 0 ? liveMissingEn.join("; ") : "sample replays only"}`
  console.log(`mizan demo server listening on http://0.0.0.0:${port}`)
  console.log(`  health        http://127.0.0.1:${port}/health`)
  console.log(`  languages     en, ar (?lang= or cookie ${LANG_COOKIE})`)
  console.log(`  transcript    ${transcriptLabel("precomputed")} — verdicts computed live`)
  console.log(`  verify corpus ${corpusState}`)
  console.log(`  live ask      ${liveLine}`)
  console.log(`  logging       this server writes no question text to any log or trace`)
  const home = homeDocument("en", corpus, corpusDetail, liveStatus.available, liveMissingEn)
  console.log(`  client js     ${scriptFree(home) ? "none — pages carry no script tags" : "DEFECT: a page contained a script tag"}`)
  console.log(`  budget        ${VERIFICATION_BUDGET_MS} ms per claim`)
  console.log(`  badge rule    system instructions are a hint; containment decides every badge`)
}

await start()
