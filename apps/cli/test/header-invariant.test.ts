import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { TRANSCRIPT_LABEL, transcriptLabel } from "@mizan/core"
import { renderHeader } from "../src/render.ts"
import { ENV_API_KEY, ENV_PROVIDER, resolveProvider } from "../src/provider-config.ts"

/**
 * The transcript line, and the promise that a replay never opens a socket (SB-002).
 *
 * The header line is asserted against `transcriptLabel` rather than against a literal copied
 * here, so this test fails if stdout and the schema table ever disagree — which is exactly
 * the drift the label table was introduced to prevent (AGENTS.md section 17).
 */

const header = (transcript: "live" | "precomputed"): string =>
  renderHeader({ transcript, model: "gpt-4o-mini", snapshotHash: "7b3b66fbca7fb9df0000", sourceCount: 6 })

const transcriptLines = (text: string): string[] =>
  text.split("\n").filter((line) => line.startsWith("transcript"))

describe("the rendered transcript line is the label table, byte for byte", () => {
  test("the live header line is transcriptLabel('live')", () => {
    expect(transcriptLines(header("live"))).toEqual([`transcript    ${transcriptLabel("live")}`])
    expect(header("live")).toContain("transcript    LIVE")
  })

  test("the precomputed header line is transcriptLabel('precomputed')", () => {
    expect(transcriptLines(header("precomputed"))).toEqual([
      `transcript    ${transcriptLabel("precomputed")}`,
    ])
    expect(header("precomputed")).toContain("transcript    PRECOMPUTED (deterministic replay)")
  })

  test("there is no third label, and no header without one", () => {
    expect(Object.values(TRANSCRIPT_LABEL).sort()).toEqual(
      ["LIVE", "PRECOMPUTED (deterministic replay)"].sort(),
    )
    for (const kind of ["live", "precomputed"] as const) {
      expect(transcriptLines(header(kind))).toHaveLength(1)
    }
  })
})

describe("an explicit scripted run resolves without touching the network", () => {
  test("scripted wins over a key lying in the environment, and fetch is never called", async () => {
    // The companion to provider-config.test.ts: that test proves selection; this one proves the
    // selection opens no socket. A key in the environment is not consent to make a call, so the
    // fetch guard is what turns "should not network" into something a failure can disprove.
    const transcript = "data/transcript.json"
    const ROOT = join(import.meta.dir, "..", "..", "..")
    const previous = { provider: process.env[ENV_PROVIDER], key: process.env[ENV_API_KEY] }
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      fetchCalls += 1
      return Promise.reject(new Error(`network access attempted: ${String(args[0])}`))
    }) as typeof fetch
    try {
      process.env[ENV_PROVIDER] = "scripted"
      process.env[ENV_API_KEY] = "sk-not-a-real-key"
      const provider = await resolveProvider(ROOT, transcript)
      expect(provider.model).toBe("transcript-v1")
      expect(fetchCalls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
      if (previous.provider === undefined) delete process.env[ENV_PROVIDER]
      else process.env[ENV_PROVIDER] = previous.provider
      if (previous.key === undefined) delete process.env[ENV_API_KEY]
      else process.env[ENV_API_KEY] = previous.key
    }
  })
})
