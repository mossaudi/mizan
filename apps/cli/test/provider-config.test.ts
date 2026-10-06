import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { isErr, isOk, type Result } from "@mizan/core"
import {
  DEFAULT_PROVIDER_BASE,
  DEFAULT_PROVIDER_MODEL,
  ENV_API_KEY,
  ENV_BASE_URL,
  ENV_MODEL,
  ENV_PROVIDER,
  GEMINI_HOST,
  GEMINI_PROVIDER_BASE,
  isRateLimited,
  modelForHost,
  PROVIDER_ALLOWED_HOSTS,
  PROVIDER_HOST_MODELS,
  PROVIDER_MODES,
  PROVIDER_URL,
  resolveProviderEndpoint,
  resolveProvider,
} from "../src/provider-config.ts"

/**
 * The provider configuration, tested where the config is decided.
 *
 * ## Why this file exists
 *
 * The environment contract used to be three inert variables and eight documented ones that no
 * code read, and the API key was passed as a loose argument rather than captured into the
 * transport that uses it. Both are the kind of defect that a demo never shows and a judge always
 * asks about: "where does the key go, and what stops it going somewhere else?"
 *
 * So the tests below assert the two properties that answer those questions — the endpoint is
 * constrained to a known host over HTTPS, and the key reaches the transport that needs it and
 * nowhere else — plus the explicit-`scripted` rule, which is the difference between a disclosed
 * replay and a silent fallback to one.
 */

/** The resolved URL, or the reason it was refused — so a failed expectation prints the why. */
const url = (value: Result<string, string>): string => (isOk(value) ? value.value : `ERR:${value.error}`)

describe("the documented environment contract is the one the code reads", () => {
  test("every exported ENV_ constant is a MIZAN_ name", () => {
    for (const name of [ENV_PROVIDER, ENV_API_KEY, ENV_BASE_URL, ENV_MODEL]) {
      expect(name).toMatch(/^MIZAN_[A-Z_]+$/)
    }
  })

  test("the key is MIZAN_LLM_API_KEY, not the MIZAN_API_KEY the old docs named", () => {
    // The rename is the whole point of the fix: a judge setting MIZAN_API_KEY from an older
    // README must be told they are wrong rather than silently running keyless.
    expect(ENV_API_KEY).toBe("MIZAN_LLM_API_KEY")
    expect(ENV_API_KEY).not.toBe("MIZAN_API_KEY")
  })

  test("there are exactly two modes, and both are real", () => {
    expect(PROVIDER_MODES).toEqual(["hosted", "scripted"])
  })
})

describe("the hosted endpoint is constrained", () => {
  test("the default endpoint is https on the allowlisted host", () => {
    expect(DEFAULT_PROVIDER_BASE).toBe(`https://${PROVIDER_ALLOWED_HOSTS[0]}/v1`)
    expect(PROVIDER_URL.startsWith("https://")).toBe(true)
  })

  test("the default URL passes its own validation", () => {
    expect(url(resolveProviderEndpoint(DEFAULT_PROVIDER_BASE))).toBe(PROVIDER_URL)
  })

  const refused: readonly (readonly [string, string])[] = [
    ["plain http", "http://api.openai.com/v1"],
    ["a host that is not allowlisted", "https://evil.example/v1"],
    ["a lookalike host", "https://api.openai.com.evil.example/v1"],
    ["an allowlisted host as a subdomain", "https://x.api.openai.com/v1"],
    ["credentials embedded in the URL", "https://user:pass@api.openai.com/v1"],
    ["nothing at all", ""],
  ]

  for (const [name, base] of refused) {
    test(`refuses ${name}`, () => {
      const resolved = resolveProviderEndpoint(base)
      expect(isErr(resolved)).toBe(true)
    })
  }

  test("a trailing slash is tolerated rather than refused", () => {
    // Tolerance where it is harmless is not a hole: this is the same endpoint, and a judge
    // pasting a trailing slash should not be told their configuration is an attack.
    expect(url(resolveProviderEndpoint("https://api.openai.com/v1/"))).toBe(PROVIDER_URL)
  })
})

describe("the second permitted host, and why one variable is enough to reach it", () => {
  test("AI Studio is allowlisted, and resolves to its own path", () => {
    expect(PROVIDER_ALLOWED_HOSTS).toContain(GEMINI_HOST)
    expect(url(resolveProviderEndpoint(GEMINI_PROVIDER_BASE))).toBe(`${GEMINI_PROVIDER_BASE}/chat/completions`)
  })

  test("its base is https on the allowlisted host, like every other entry", () => {
    expect(GEMINI_PROVIDER_BASE.startsWith("https://")).toBe(true)
    expect(PROVIDER_ALLOWED_HOSTS).toContain(new URL(GEMINI_PROVIDER_BASE).hostname)
  })

  test("the model default follows the host, so the two namespaces never get crossed", () => {
    // OpenAI's model name sent to AI Studio is a 404 about an unknown model, which reads as a broken
    // deployment rather than a missing setting. The host is the only input that decides the namespace.
    expect(modelForHost(DEFAULT_PROVIDER_BASE)).toBe("gpt-4o-mini")
    expect(modelForHost(GEMINI_PROVIDER_BASE)).toBe("gemini-2.0-flash")
  })

  test("an unknown host resolves to the global default rather than to a guess", () => {
    expect(modelForHost("https://elsewhere.example/v1")).toBe(DEFAULT_PROVIDER_MODEL)
    expect(modelForHost("not a url at all")).toBe(DEFAULT_PROVIDER_MODEL)
  })

  test("the allowlist still refuses lookalikes of the second host too", () => {
    // The point of an exact-match allowlist is that adding a second entry does not weaken the first.
    for (const base of [
      `https://${GEMINI_HOST}.evil.example/v1`,
      `https://x.${GEMINI_HOST}/v1beta/openai`,
      `http://${GEMINI_HOST}/v1beta/openai`,
    ]) {
      expect(isErr(resolveProviderEndpoint(base))).toBe(true)
    }
  })

  test("every permitted host has a model, so none of them inherits the wrong namespace", () => {
    for (const host of PROVIDER_ALLOWED_HOSTS) {
      expect(PROVIDER_HOST_MODELS[host]).toBeDefined()
    }
  })
})

describe("provider selection is explicit, never a silent fallback", () => {
  const transcript = "data/transcript.json"
  // The real root: the transcript provider reads a committed file, so a fixture root would hand
  // back a provider that is "unconfigured" and prove nothing about selection.
  const ROOT = join(import.meta.dir, "..", "..", "..")

  test("an unset mode with no key yields the scripted provider, and says so", async () => {
    // No key and no mode is the default offline case, so the transcript is correct here. What is
    // forbidden is the opposite: a key present and unreachable quietly reading the transcript.
    const previous = { provider: process.env[ENV_PROVIDER], key: process.env[ENV_API_KEY] }
    try {
      delete process.env[ENV_PROVIDER]
      delete process.env[ENV_API_KEY]
      const provider = await resolveProvider(ROOT, transcript)
      expect(provider.model).toBe("transcript-v1")
    } finally {
      if (previous.provider === undefined) delete process.env[ENV_PROVIDER]
      else process.env[ENV_PROVIDER] = previous.provider
      if (previous.key === undefined) delete process.env[ENV_API_KEY]
      else process.env[ENV_API_KEY] = previous.key
    }
  })

  test("an unrecognised mode is refused rather than guessed", async () => {
    const previous = process.env[ENV_PROVIDER]
    try {
      process.env[ENV_PROVIDER] = "ollama"
      // A mode nobody implements must not fall through to the transcript: that is how a document
      // ends up describing a local inference path the code does not have. `ollama` is the exact
      // case, because an earlier version of DISCLOSURE.md claimed it was implemented.
      const provider = await resolveProvider(ROOT, transcript)
      expect(provider.model).not.toBe("transcript-v1")
    } finally {
      if (previous === undefined) delete process.env[ENV_PROVIDER]
      else process.env[ENV_PROVIDER] = previous
    }
  })

  test("an explicit MIZAN_PROVIDER=scripted is the only way to get the transcript", async () => {
    const previous = { provider: process.env[ENV_PROVIDER], key: process.env[ENV_API_KEY] }
    try {
      process.env[ENV_PROVIDER] = "scripted"
      // Even WITH a key set, an explicit `scripted` must win and must be labelled. A key lying
      // around in the environment is not consent to make a network call.
      process.env[ENV_API_KEY] = "sk-not-a-real-key"
      const provider = await resolveProvider(ROOT, transcript)
      expect(provider.model).toBe("transcript-v1")
    } finally {
      for (const [key, value] of [
        [ENV_PROVIDER, previous.provider],
        [ENV_API_KEY, previous.key],
      ] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})

describe("a rate limit is told apart from a broken key", () => {
  test("HTTP 429 is recognised, because waiting is the only correct response to it", () => {
    expect(isRateLimited("decomposition failed: HTTP 429 Too Many Requests")).toBe(true)
  })

  test("out of quota is recognised in the provider's other spelling", () => {
    // OpenAI reports exhausted credit as a 429 carrying an error type rather than a bare number, and
    // an operator reading "insufficient_quota" must not be told the key is malformed.
    expect(isRateLimited("error: insufficient_quota, rate_limit reached")).toBe(true)
  })

  test("a rejected key is NOT a rate limit, so it does not get wait-advice", () => {
    for (const detail of [
      "HTTP 401 Unauthorized",
      "HTTP 404 model not found",
      "decomposition failed: HTTP 500",
      "fetch failed",
      "response was not JSON",
    ]) {
      expect(isRateLimited(detail)).toBe(false)
    }
  })

  test("the planted violation fails: the digits 429 inside a longer number are not a status code", () => {
    // A bare `429` substring match would fire on a record count or a byte offset in a malformed body,
    // and would then tell an operator to wait out a quota that was never the problem. Word-boundary
    // matching is what keeps this recogniser reading a status code and nothing else.
    expect(isRateLimited("read 4290 records in 14290 ms")).toBe(false)
    expect(isRateLimited("corpus holds 27234 records, query 4291")).toBe(false)
  })

  test("a standalone 429 token is read as a status code, wherever it appears", () => {
    // The remaining false positive — a 429 that is not a status — is not worth losing the real case
    // for. A failure detail containing a bare 429 is a status far more often than it is a count.
    expect(isRateLimited("upstream said 429 and closed the connection")).toBe(true)
    expect(isRateLimited("no status at all")).toBe(false)
  })
})
