import { describe, expect, test } from "bun:test"
import { decodeAnswer, providerFailure, type GenerationResult, type Provider, type RetrievedContext } from "../src/provider.ts"
import { MAX_CONTEXT_CHARS, MAX_TOTAL_CONTEXT_CHARS, TRUNCATION_MARKER, clip, fence, sanitizeContext, sanitizeContexts, stripInvisible } from "../src/sanitize.ts"
import { buildRequestBody, hostedProvider, readResponseJson, type Transport } from "../src/live.ts"
import { questionKey, transcriptProvider, type TranscriptEntry } from "../src/transcript.ts"
import { CACHE_CAPACITY, MAX_DECOMPOSITION_QUERIES, cacheKey, decompose, fifoCache, readQueries } from "../src/decompose.ts"
import { DEGRADE_MESSAGES, runSpine } from "../src/spine.ts"
import type { Answer } from "@mizan/core"

/**
 * The agent's self-test. The theme is the same throughout: **every failure must be honest.**
 *
 * A test that only proves the happy path would pass for an implementation that silently
 * returns a plausible answer when the provider is down, and that implementation is the single
 * most damaging thing this repository could ship. So each degradation has a planted cause
 * that must produce the right honest state.
 */

const answerWith = (overrides: Partial<Answer> = {}): Answer => ({
  questionHash: questionKey("what is the reward for fasting?"),
  prose: "Fasting is a shield.",
  claims: [{ id: "claim-1", text: "Fasting is a shield.", quote: "الصيام جنة", citations: [{ collection: "bukhari", number: "1894", grade: null, raw: "Bukhari 1894" }] }],
  provider: "fixture",
  model: "fixture-v1",
  transcript: "live",
  ...overrides,
})

const context = (text: string, label = "Bukhari 1894"): RetrievedContext => ({ tool: "hadithSearch", text, citationLabel: label })

/** A provider that returns whatever it is told to, so each failure mode is reachable. */
const stubProvider = (generate: () => Promise<GenerationResult>, kind: "live" | "precomputed" = "live"): Provider => ({
  name: "stub",
  model: "stub-v1",
  kind,
  generate,
})

describe("decodeAnswer", () => {
  test("accepts a well-formed answer", () => {
    const decoded = decodeAnswer(answerWith(), "fixture", "fixture-v1", "live")
    expect(decoded.ok).toBe(true)
  })

  test("refuses prose instead of JSON", () => {
    const decoded = decodeAnswer("Certainly! Here is the answer.", "fixture", "fixture-v1", "live")
    expect(decoded.ok).toBe(false)
    if (decoded.ok) return
    expect(decoded.error.reason).toBe("provider_malformed_output")
  })

  test("an invented verdict field is discarded, not honoured", () => {
    // A model told it is a verifier may return `verdict: "verified"`. The pinned Effect beta
    // strips unknown properties rather than rejecting, so the field does not survive the
    // boundary at all — which is a stronger outcome than refusing: there is nothing left for
    // any downstream code to misread. Asserted as absence, because a schema that merely
    // tolerated the key would still fail this test.
    const decoded = decodeAnswer({ ...answerWith(), verdict: "verified" }, "fixture", "fixture-v1", "live")
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(Object.keys(decoded.value.answer)).not.toContain("verdict")
    expect(JSON.stringify(decoded.value)).not.toContain("verified")
  })

  test("refuses a precomputed payload that claims to be live", () => {
    const decoded = decodeAnswer(answerWith({ transcript: "live" }), "transcript", "t", "precomputed")
    expect(decoded.ok).toBe(false)
    if (decoded.ok) return
    expect(decoded.error.detail).toContain("refusing to present one as the other")
  })
})

describe("sanitize", () => {
  test("removes zero-width and bidi control characters", () => {
    // A record that renders as one thing to a scholar and another to a model is the case that
    // matters; the characters are a normalisation, so there is no heuristic to argue with.
    expect(stripInvisible("الصلاة\u200B\u202E")).toBe("الصلاة")
    expect(stripInvisible("innocence\uFEFF")).toBe("innocence")
  })

  test("removes Unicode tag characters, which can hide a whole instruction", () => {
    const hidden = "innocence\u{E0061}\u{E0062}\u{E0063}"
    expect(stripInvisible(hidden)).toBe("innocence")
  })

  test("leaves ordinary Arabic and text alone", () => {
    const text = "قال النبي صلى الله عليه وسلم: العمل بالنيات"
    expect(stripInvisible(text)).toBe(text)
  })

  test("clips with a visible marker, never silently", () => {
    const clipped = clip("abcdef", 3)
    expect(clipped).toBe(`abc${TRUNCATION_MARKER}`)
  })

  test("does not clip text within budget", () => {
    expect(clip("abc", 3)).toBe("abc")
  })

  test("a single context cannot exceed the per-context cap", () => {
    const sanitized = sanitizeContext(context("x".repeat(MAX_CONTEXT_CHARS * 2)))
    expect(sanitized.text.length).toBe(MAX_CONTEXT_CHARS + TRUNCATION_MARKER.length)
  })

  test("the total budget is enforced across contexts", () => {
    const many = Array.from({ length: 20 }, () => context("y".repeat(MAX_CONTEXT_CHARS)))
    const total = sanitizeContexts(many).reduce((sum, entry) => sum + entry.text.length, 0)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_CONTEXT_CHARS)
  })

  test("the fence labels every context as data-only", () => {
    const fenced = fence([context("some text", "Bukhari 1894")])
    expect(fenced).toContain("[data-only source: Bukhari 1894]")
  })
})

describe("hostedProvider — every failure is model unavailable", () => {
  const config = { url: "https://api.example/v1/chat", apiKey: "k", model: "m" }
  const okTransport: Transport = async () => ({
    ok: true,
    value: { body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(answerWith()) } }] }) },
  })

  test("a missing API key is provider_not_configured, not a 401", async () => {
    // "You did not configure a key" and "the provider is down" are different problems.
    const provider = hostedProvider({ ...config, apiKey: "" }, okTransport)
    const result = await provider.generate({ question: "q", stage: "decompose", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe("provider_not_configured")
  })

  test("a refused connection is provider_unavailable", async () => {
    const provider = hostedProvider(config, async () => ({ ok: false, error: "connect ECONNREFUSED" }))
    const result = await provider.generate({ question: "q", stage: "decompose", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe("provider_unavailable")
  })

  test("a timeout is provider_timeout, distinguished from a refusal", async () => {
    const provider = hostedProvider(config, async () => ({ ok: false, error: "The operation timed out" }))
    const result = await provider.generate({ question: "q", stage: "decompose", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe("provider_timeout")
  })

  test("a non-JSON body is malformed output, not an answer", async () => {
    const provider = hostedProvider(config, async () => ({ ok: true, value: { body: "<html>502</html>" } }))
    const result = await provider.generate({ question: "q", stage: "decompose", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe("provider_malformed_output")
  })

  test("a JSON reply that is not an Answer is malformed output", async () => {
    const provider = hostedProvider(
      config,
      async () => ({ ok: true, value: { body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ claims: "nope" }) } }] }) } }),
    )
    const result = await provider.generate({ question: "q", stage: "decompose", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe("provider_malformed_output")
  })

  test("a successful call returns the decoded answer", async () => {
    const provider = hostedProvider(config, okTransport)
    expect(provider.kind).toBe("live")
    const result = await provider.generate({ question: "q", stage: "decompose", contexts: [], instructions: "i" })
    expect(result.ok).toBe(true)
  })

  test("the request body carries temperature 0 and fences the context", () => {
    const body = buildRequestBody({ question: "q", stage: "answer", contexts: [context("text", "Bukhari 1")], instructions: "be careful" }, "m")
    expect(body).toContain('"temperature":0')
    expect(body).toContain("[data-only source: Bukhari 1]")
  })

  test("the live path length-caps corpus text rather than trusting the caller", () => {
    // The caller is not a trust boundary we can rely on. If buildRequestBody only *labels*
    // text, a caller that skipped the cap would post a 200kB passage to the model, and the cap
    // that exists in sanitize.ts would be decoration.
    const huge = "a".repeat(MAX_CONTEXT_CHARS * 3)
    const body = buildRequestBody({ question: "q", stage: "answer", contexts: [context(huge, "Bukhari 1")], instructions: "i" }, "m")
    expect(body).toContain(TRUNCATION_MARKER.trim())
    expect(body.length).toBeLessThan(MAX_CONTEXT_CHARS * 2)
  })

  test("the question reaches the model, not just the corpus", () => {
    // A fence fix that quietly dropped the question would still pass the "is it fenced?" test.
    const body = buildRequestBody({ question: "What does the verse say?", stage: "answer", contexts: [context("text", "Bukhari 1")], instructions: "i" }, "m")
    expect(body).toContain("What does the verse say?")
  })
})

describe("readResponseJson", () => {
  test("extracts the content string", () => {
    const parsed = readResponseJson(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }))
    expect(parsed).toEqual({ ok: true, value: { a: 1 } })
  })

  test("rejects an empty choices array", () => {
    expect(readResponseJson(JSON.stringify({ choices: [] })).ok).toBe(false)
  })

  test("a model that wrapped its JSON in prose still yields text to decode", () => {
    const parsed = readResponseJson(JSON.stringify({ choices: [{ message: { content: "Sure! {\"a\":1}" } }] }))
    expect(parsed.ok).toBe(true)
  })
})

describe("transcriptProvider", () => {
  const question = "what is the reward for fasting?"
  const decomposeEntry: TranscriptEntry = {
    stage: "decompose",
    questionHash: questionKey(question),
    answer: answerWith({ transcript: "precomputed", claims: [{ id: "c", text: "fasting\nfasting reward", quote: null, citations: [] }] }),
  }
  const answerEntry: TranscriptEntry = { stage: "answer", questionHash: questionKey(question), answer: answerWith({ transcript: "precomputed" }) }
  const entries: readonly TranscriptEntry[] = [decomposeEntry, answerEntry]

  test("replays a matching entry and labels it precomputed", async () => {
    const provider = transcriptProvider({ entries })
    const result = await provider.generate({ question, stage: "answer", contexts: [], instructions: "i" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.answer.transcript).toBe("precomputed")
    expect(provider.kind).toBe("precomputed")
  })

  test("the two stages are keyed separately, so a replay is never a list of search queries", async () => {
    // The spine calls the model twice with the same question. If the transcript were keyed on
    // the question alone, the second entry would shadow the first and the "answer" call would
    // replay the decomposition. That failure is worth a test of its own.
    const provider = transcriptProvider({ entries })
    const decomposed = await provider.generate({ question, stage: "decompose", contexts: [], instructions: "i" })
    const answered = await provider.generate({ question, stage: "answer", contexts: [], instructions: "i" })
    expect(decomposed.ok && decomposed.value.answer.claims[0]?.text).toContain("fasting reward")
    expect(answered.ok && answered.value.answer.prose).toBe("Fasting is a shield.")
  })

  test("a question with no entry is model unavailable, not a guess", async () => {
    const provider = transcriptProvider({ entries })
    const result = await provider.generate({ question: "a different question", stage: "answer", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe("provider_unavailable")
    expect(result.error.detail).toContain("no transcript entry")
  })

  test("a stage with no entry is model unavailable, and says which stage", async () => {
    const provider = transcriptProvider({ entries: [decomposeEntry] })
    const result = await provider.generate({ question, stage: "answer", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.detail).toContain('"answer"')
  })

  test("the transcript key is a hash, so the file holds no question text", () => {
    expect(questionKey(question)).toMatch(/^[0-9a-f]{64}$/)
    expect(questionKey(question)).not.toContain("fasting")
  })

  test("a transcript entry edited to claim live is refused", async () => {
    const forged: readonly TranscriptEntry[] = [{ stage: "answer", questionHash: questionKey(question), answer: answerWith({ transcript: "live" }) }]
    const provider = transcriptProvider({ entries: forged })
    const result = await provider.generate({ question, stage: "answer", contexts: [], instructions: "i" })
    expect(result.ok).toBe(false)
  })
})

describe("decompose", () => {
  const decomposing = (text: string): Provider =>
    stubProvider(async () => ({ ok: true, value: { answer: answerWith({ claims: [{ id: "c", text, quote: null, citations: [] }] }), provider: "stub", model: "stub-v1" } }))

  test("reads one query per line", () => {
    expect(readQueries("quran patience\nhadith patience")).toEqual(["quran patience", "hadith patience"])
  })

  test("rejects an empty reply", () => {
    expect(readQueries("   \n  ")).toBeNull()
  })

  test("caps the number of queries and reports the drop", async () => {
    const provider = decomposing(Array.from({ length: 10 }, (_, index) => `query ${index}`).join("\n"))
    const result = await decompose(provider, fifoCache(), "q", "i")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.queries).toHaveLength(MAX_DECOMPOSITION_QUERIES)
    expect(result.value.dropped).toBe(10 - MAX_DECOMPOSITION_QUERIES)
  })

  test("caches by question hash, so a repeated question does not re-call the model", async () => {
    let calls = 0
    const provider = stubProvider(async () => {
      calls += 1
      return { ok: true, value: { answer: answerWith({ claims: [{ id: "c", text: "q1", quote: null, citations: [] }] }), provider: "stub", model: "s" } }
    })
    const cache = fifoCache()
    await decompose(provider, cache, "same question", "i")
    await decompose(provider, cache, "same question", "i")
    expect(calls).toBe(1)
  })

  test("a provider failure propagates as a provider failure", async () => {
    const provider = stubProvider(async () => providerFailure("provider_unavailable", "down"))
    const result = await decompose(provider, fifoCache(), "q", "i")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.reason).toBe("provider_unavailable")
  })

  test("the cache is bounded", () => {
    const cache = fifoCache(2)
    cache.set("a", ["1"])
    cache.set("b", ["2"])
    cache.set("c", ["3"])
    expect(cache.size()).toBe(2)
    expect(cache.get("a")).toBeUndefined()
  })

  test("the default capacity is a real number", () => {
    expect(CACHE_CAPACITY).toBeGreaterThan(0)
    expect(cacheKey("q")).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("runSpine", () => {
  const retrieving = () => [context("innocence", "Bukhari 1894")]

  test("a healthy run returns the answer and labels the transcript", async () => {
    const provider = transcriptProvider({
      entries: [
        { stage: "decompose", questionHash: questionKey("q"), answer: answerWith({ questionHash: questionKey("q"), transcript: "precomputed", claims: [{ id: "c", text: "q1", quote: null, citations: [] }] }) },
        { stage: "answer", questionHash: questionKey("q"), answer: answerWith({ questionHash: questionKey("q"), transcript: "precomputed" }) },
      ],
    })
    const result = await runSpine({ question: "q", instructions: "i" }, { provider, retrieve: retrieving })
    expect("answer" in result).toBe(true)
    if (!("answer" in result)) return
    expect(result.transcript).toBe("precomputed")
  })

  test("a provider that is down yields model unavailable and no answer", async () => {
    const provider = stubProvider(async () => providerFailure("provider_unavailable", "connect ECONNREFUSED"))
    const result = await runSpine({ question: "q", instructions: "i" }, { provider, retrieve: retrieving })
    expect("answer" in result).toBe(false)
    if ("answer" in result) return
    expect(result.message).toBe(DEGRADE_MESSAGES.model_unavailable)
    expect(result.reason).toBe("provider_unavailable")
  })

  test("a provider timeout yields model unavailable, not a partial answer", async () => {
    const provider = stubProvider(async () => providerFailure("provider_timeout", "timed out after 30000ms"))
    const result = await runSpine({ question: "q", instructions: "i" }, { provider, retrieve: retrieving })
    expect("answer" in result).toBe(false)
    if ("answer" in result) return
    expect(result.reason).toBe("provider_timeout")
  })

  test("a corpus miss is no sources found, which is a different honest state", async () => {
    // A provider that answers BOTH calls, so the run reaches retrieval and the corpus — not
    // the model — is what comes up empty.
    const provider = stubProvider(async () => ({ ok: true, value: { answer: answerWith({ claims: [{ id: "c", text: "q1", quote: null, citations: [] }] }), provider: "stub", model: "s" } }))
    const result = await runSpine({ question: "q", instructions: "i" }, { provider, retrieve: () => [] })
    expect("answer" in result).toBe(false)
    if ("answer" in result) return
    // The model is fine; the corpus had nothing. Conflating this with a model failure would
    // send an operator to debug the wrong component.
    expect(result.reason).toBe("no_sources_found")
    expect(result.message).toBe("no sources found")
  })

  test("blank contexts do not count as sources", async () => {
    const provider = stubProvider(async () => ({ ok: true, value: { answer: answerWith({ claims: [{ id: "c", text: "q1", quote: null, citations: [] }] }), provider: "stub", model: "s" } }))
    const result = await runSpine({ question: "q", instructions: "i" }, { provider, retrieve: () => [context("   ")] })
    expect("answer" in result).toBe(false)
    if ("answer" in result) return
    expect(result.reason).toBe("no_sources_found")
  })
})
