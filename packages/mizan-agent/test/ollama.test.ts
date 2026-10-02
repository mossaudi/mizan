import { describe, expect, test } from "bun:test"
import type { Answer } from "@mizan/core"
import { ollamaProvider, DEFAULT_OLLAMA_MODEL } from "../src/providers/ollama.ts"
import type { GenerationRequest } from "../src/provider.ts"

/**
 * Ollama provider tests.
 *
 * ## What these tests verify
 *
 * 1. The Ollama adapter implements the provider trait.
 * 2. It can be selected via configuration.
 * 3. It handles Ollama not running (returns `provider_unavailable`).
 * 4. It normalizes responses to the common internal type.
 * 5. It does not expose the local file system.
 *
 * ## Testing strategy
 *
 * These tests use a mock fetch to avoid requiring a real Ollama instance. The
 * mock returns a valid Ollama response shape, and the test asserts that the
 * provider normalizes it correctly.
 */

const request: GenerationRequest = {
  question: "What did the Prophet say about intentions?",
  stage: "answer",
  contexts: [],
  instructions: "Quote verbatim from the corpus.",
}

const validAnswer: Answer = {
  questionHash: "abc123",
  prose: "The Prophet said: actions are judged by intentions.",
  claims: [],
  provider: "ollama",
  model: "llama3.2",
  transcript: "live",
}

/** A mock fetch that returns a given response. */
const mockFetch = (response: Response): typeof fetch => {
  return (async () => response) as unknown as typeof fetch
}

/** A mock fetch that throws an error. */
const mockFetchError = (message: string): typeof fetch => {
  return (async () => {
    throw new Error(message)
  }) as unknown as typeof fetch
}

describe("ollamaProvider", () => {
  test("implements the provider trait", () => {
    const provider = ollamaProvider()
    expect(provider.name).toBe("ollama")
    expect(provider.model).toBe(DEFAULT_OLLAMA_MODEL)
    expect(provider.kind).toBe("live")
    expect(typeof provider.generate).toBe("function")
  })

  test("uses the default host and model", () => {
    const provider = ollamaProvider()
    expect(provider.model).toBe(DEFAULT_OLLAMA_MODEL)
  })

  test("can be configured with a custom host and model", () => {
    const provider = ollamaProvider({ host: "http://localhost:11435", model: "mistral" })
    expect(provider.model).toBe("mistral")
  })

  test("returns provider_unavailable when Ollama is not running", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetchError("Connection refused")

    try {
      const provider = ollamaProvider()
      const result = await provider.generate(request)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error._tag).toBe("provider_failed")
        expect(result.error.reason).toBe("provider_unavailable")
        expect(result.error.detail).toContain("ollama")
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("normalizes a valid Ollama response", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetch(
      new Response(
        JSON.stringify({ message: { role: "assistant", content: JSON.stringify(validAnswer) } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )

    try {
      const provider = ollamaProvider()
      const result = await provider.generate(request)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.answer.prose).toBe(validAnswer.prose)
        expect(result.value.provider).toBe("ollama")
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("returns provider_malformed_output for invalid JSON", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetch(new Response("not json", { status: 200 }))

    try {
      const provider = ollamaProvider()
      const result = await provider.generate(request)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.reason).toBe("provider_malformed_output")
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("returns provider_unavailable for HTTP errors", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetch(new Response("Internal Server Error", { status: 500 }))

    try {
      const provider = ollamaProvider()
      const result = await provider.generate(request)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.reason).toBe("provider_unavailable")
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("the request contains only the prompt (no local file paths)", async () => {
    let capturedBody: string | null = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedBody = typeof init?.body === "string" ? init.body : null
      return new Response(
        JSON.stringify({ message: { role: "assistant", content: JSON.stringify(validAnswer) } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as unknown as typeof fetch

    try {
      const provider = ollamaProvider()
      await provider.generate(request)
      expect(capturedBody).not.toBeNull()
      const body = JSON.parse(capturedBody!) as { messages: { content: string }[] }
      const allContent = body.messages.map((m) => m.content).join(" ")
      expect(allContent).not.toContain("C:\\")
      expect(allContent).not.toContain("/home/")
      expect(allContent).not.toContain("/Users/")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
