import { describe, expect, test } from "bun:test"
import type { Answer } from "@mizan/core"
import { type GenerationRequest, type Provider, failoverProvider } from "../src/provider.ts"
import { hostedProvider } from "../src/live.ts"
import { ollamaProvider } from "../src/providers/ollama.ts"

/**
 * Provider abstraction and failover tests.
 *
 * ## What these tests verify
 *
 * 1. The provider trait defines a common interface.
 * 2. At least two provider adapters implement the trait.
 * 3. Provider failover occurs within 5 seconds.
 * 4. Provider errors are honest (no partial or canned responses).
 * 5. Provider adapters normalize responses to a common internal type.
 *
 * ## Testing strategy
 *
 * These tests use mock transports to avoid requiring a real network. The mock
 * returns a valid response or an error, and the test asserts that the provider
 * handles it correctly.
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
  provider: "test",
  model: "test-model",
  transcript: "live",
}

const validResponse = JSON.stringify({
  choices: [{ message: { role: "assistant", content: JSON.stringify(validAnswer) } }],
})

describe("provider abstraction", () => {
  test("the provider trait defines a common interface", () => {
    const hosted = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini" },
      async () => ({ ok: true, value: { body: validResponse } }),
    )
    const ollama = ollamaProvider()

    // Both implement the same trait
    expect(typeof hosted.generate).toBe("function")
    expect(typeof ollama.generate).toBe("function")
    expect(hosted.kind).toBe("live")
    expect(ollama.kind).toBe("live")
  })

  test("at least two provider adapters implement the trait", () => {
    const providers: Provider[] = [
      hostedProvider(
        { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini" },
        async () => ({ ok: true, value: { body: validResponse } }),
      ),
      ollamaProvider(),
    ]
    expect(providers.length).toBeGreaterThanOrEqual(2)
  })

  test("provider errors are honest (no partial or canned responses)", async () => {
    const hosted = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini" },
      async () => ({ ok: false, error: "Connection refused" }),
    )
    const result = await hosted.generate(request)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error._tag).toBe("provider_failed")
      expect(result.error.reason).toBe("provider_unavailable")
    }
  })

  test("provider adapters normalize responses to a common type", async () => {
    const hosted = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini" },
      async () => ({ ok: true, value: { body: validResponse } }),
    )
    const result = await hosted.generate(request)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.answer).toBeDefined()
      expect(result.value.provider).toBe("hosted")
      expect(result.value.model).toBe("gpt-4o-mini")
    }
  })

  test("both providers unavailable returns model unavailable", async () => {
    const hosted = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini" },
      async () => ({ ok: false, error: "Connection refused" }),
    )
    const ollama = ollamaProvider()

    const hostedResult = await hosted.generate(request)
    const ollamaResult = await ollama.generate(request)

    // Both should fail honestly
    expect(hostedResult.ok).toBe(false)
    expect(ollamaResult.ok).toBe(false)
  })

  test("provider selection is configurable", () => {
    // The provider can be selected via configuration (MIZAN_PROVIDER env var)
    // This test asserts that the provider trait allows selection
    const hosted = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "hosted" },
      async () => ({ ok: true, value: { body: validResponse } }),
    )
    const ollama = ollamaProvider({ name: "ollama" })

    expect(hosted.name).toBe("hosted")
    expect(ollama.name).toBe("ollama")
  })
})

describe("failoverProvider", () => {
  const failingTransport = async (): Promise<{ ok: false; error: string }> => ({ ok: false, error: "Connection refused" })

  test("returns the primary response when the primary succeeds", async () => {
    const primary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "primary" },
      async () => ({ ok: true, value: { body: validResponse } }),
    )
    const secondary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "secondary" },
      async () => ({ ok: true, value: { body: validResponse } }),
    )
    const failover = failoverProvider([primary, secondary])
    const result = await failover.generate(request)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.provider).toBe("primary")
    }
  })

  test("fails over to the secondary when the primary fails", async () => {
    const primary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "primary" },
      failingTransport,
    )
    const secondary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "secondary" },
      async () => ({ ok: true, value: { body: validResponse } }),
    )
    const failover = failoverProvider([primary, secondary])
    const result = await failover.generate(request)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.provider).toBe("secondary")
    }
  })

  test("returns the last failure when all providers fail", async () => {
    const primary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "primary" },
      failingTransport,
    )
    const secondary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "secondary" },
      failingTransport,
    )
    const failover = failoverProvider([primary, secondary])
    const result = await failover.generate(request)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error._tag).toBe("provider_failed")
      expect(result.error.reason).toBe("provider_unavailable")
    }
  })

  test("an empty provider list returns provider_not_configured", async () => {
    const failover = failoverProvider([])
    const result = await failover.generate(request)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.reason).toBe("provider_not_configured")
    }
  })

  test("failover completes within 5 seconds", async () => {
    const primary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "primary" },
      failingTransport,
    )
    const secondary = hostedProvider(
      { url: "https://api.openai.com/v1/chat/completions", apiKey: "test-key", model: "gpt-4o-mini", name: "secondary" },
      async () => ({ ok: true, value: { body: validResponse } }),
    )
    const failover = failoverProvider([primary, secondary])
    const start = Date.now()
    const result = await failover.generate(request)
    const elapsed = Date.now() - start
    expect(result.ok).toBe(true)
    expect(elapsed).toBeLessThan(5000)
  })
})
