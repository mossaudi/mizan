import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { badgeFor, isOk, MAX_QUOTE_CHARS } from "@mizan/core"
import { buildDemoCorpus, type DemoCorpus } from "../src/demo-corpus.ts"
import { badgeHtml, encodeText, page, scriptFree } from "../src/server/html.ts"
import {
  buildPlaygroundClaim,
  parseVerifyForm,
  sampleById,
  VERIFY_SAMPLES,
  verifyPlayground,
} from "../src/server/playground.ts"
import { releaseDemoSlot, tryAcquireDemoSlot } from "../src/server/demo-runner.ts"
import { ROOT } from "./committed-ledger.ts"

const SERVER_TIMEOUT_MS = 30_000

let corpus: DemoCorpus | null = null
let corpusDir: string | null = null

beforeAll(async () => {
  corpusDir = mkdtempSync(join(tmpdir(), "mizan-demo-server-test-"))
  const built = await buildDemoCorpus(ROOT, corpusDir)
  corpus = isOk(built) ? built.value : null
})

afterAll(() => {
  if (corpus !== null) corpus.close()
  if (corpusDir !== null) {
    Bun.gc(true)
    rmSync(corpusDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
})

describe("encodeText is total over the dangerous characters", () => {
  test("escapes the five HTML-significant characters", () => {
    expect(encodeText("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#39;")
  })

  test("round-trips ordinary text including Arabic and digits", () => {
    expect(encodeText("قُلْ هُوَ ٱللَّهُ أَحَدٌ 6222")).toBe("قُلْ هُوَ ٱللَّهُ أَحَدٌ 6222")
  })

  test("neutralises a script payload into inert text", () => {
    const encoded = encodeText(`<script>alert("x")</script>`)
    expect(encoded).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
    expect(encoded).not.toContain("<script>")
  })
})

describe("pages carry no client JavaScript", () => {
  test("the page shell is script-free", () => {
    expect(scriptFree(page("t", "<section>hi</section>"))).toBe(true)
  })

  test("a planted script tag is detectable", () => {
    expect(scriptFree("<script>x</script>")).toBe(false)
  })
})

describe("badgeHtml uses the one spelling from @mizan/core", () => {
  test("renders VERIFIED / REJECTED / UNVERIFIABLE with distinct classes", () => {
    expect(badgeHtml(badgeFor("verified"))).toContain("badge-verified")
    expect(badgeHtml(badgeFor("verified"))).toContain("VERIFIED")
    expect(badgeHtml(badgeFor("rejected"))).toContain("badge-rejected")
    expect(badgeHtml(badgeFor("rejected"))).toContain("REJECTED")
    expect(badgeHtml(badgeFor("unverifiable"))).toContain("badge-unverifiable")
  })
})

describe("parseVerifyForm refuses every bad input at the boundary", () => {
  test("empty quote is refused", () => {
    const parsed = parseVerifyForm({ quote: "   ", collection: "quran", number: "6222" })
    expect(parsed.ok).toBe(false)
  })

  test("overlong quote is refused", () => {
    const parsed = parseVerifyForm({ quote: "x".repeat(MAX_QUOTE_CHARS + 1), collection: "quran", number: "1" })
    expect(parsed.ok).toBe(false)
  })

  test("empty collection is refused", () => {
    const parsed = parseVerifyForm({ quote: "abc", collection: "", number: "1" })
    expect(parsed.ok).toBe(false)
  })

  test("collection with injection characters is refused", () => {
    const parsed = parseVerifyForm({ quote: "abc", collection: "quran'; DROP TABLE", number: "1" })
    expect(parsed.ok).toBe(false)
  })

  test("non-digit number is refused", () => {
    const parsed = parseVerifyForm({ quote: "abc", collection: "quran", number: "62a" })
    expect(parsed.ok).toBe(false)
  })

  test("a clean form decodes to a typed input", () => {
    const parsed = parseVerifyForm({ claimText: "prose", quote: "  قُلْ هُوَ ٱللَّهُ أَحَدٌ  ", collection: " quran ", number: "6222" })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.quote).toBe("قُلْ هُوَ ٱللَّهُ أَحَدٌ")
    expect(parsed.value.collection).toBe("quran")
    expect(parsed.value.number).toBe("6222")
  })

  test("empty number decodes to null", () => {
    const parsed = parseVerifyForm({ quote: "abc", collection: "quran", number: "" })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.number).toBeNull()
  })
})

describe("buildPlaygroundClaim shapes one checkable claim", () => {
  test("carries the quote and one collection-scoped citation", () => {
    const claim = buildPlaygroundClaim(
      { claimText: "prose", quote: "abc", collection: "abudawud", number: "4255" },
      "c1",
    )
    expect(claim.id).toBe("c1")
    expect(claim.quote).toBe("abc")
    expect(claim.citations).toHaveLength(1)
    expect(claim.citations[0]?.collection).toBe("abudawud")
    expect(claim.citations[0]?.number).toBe("4255")
    expect(claim.citations[0]?.grade).toBeNull()
  })

  test("empty claim text falls back to the quote rather than an empty prose field", () => {
    const claim = buildPlaygroundClaim({ claimText: "", quote: "abc", collection: "quran", number: "1" }, "c2")
    expect(claim.text).toBe("abc")
  })
})

describe("the playground computes real verdicts on the demo corpus", () => {
  test("sample A reaches VERIFIED by exact containment", () => {
    if (corpus === null) throw new Error("demo corpus failed to build")
    const sample = sampleById("quran-6222")
    expect(sample).not.toBeNull()
    if (sample === null) return
    const result = verifyPlayground(corpus.db, corpus.snapshotHash, sample.input)
    expect(result.verdict.verdict).toBe("verified")
    expect(result.verdict.reason).toBe("exact_containment")
    expect(result.verdict.matchStrength.kind).toBe("exact")
    expect(result.verdict.evidence?.recordId).toBe("quran:6222")
  }, SERVER_TIMEOUT_MS)

  test("sample B reaches REJECTED because the cited record lacks the quote", () => {
    if (corpus === null) throw new Error("demo corpus failed to build")
    const sample = sampleById("abudawud-4255-fabricated")
    expect(sample).not.toBeNull()
    if (sample === null) return
    const result = verifyPlayground(corpus.db, corpus.snapshotHash, sample.input)
    expect(result.verdict.verdict).toBe("rejected")
    expect(result.verdict.reason).toBe("quote_absent_at_cited_id")
    expect(result.verdict.evidence).toBeNull()
  }, SERVER_TIMEOUT_MS)

  test("an unknown identifier is UNVERIFIABLE, never REJECTED", () => {
    if (corpus === null) throw new Error("demo corpus failed to build")
    const parsed = parseVerifyForm({ quote: "abc", collection: "quran", number: "999999" })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const result = verifyPlayground(corpus.db, corpus.snapshotHash, parsed.value)
    expect(result.verdict.verdict).toBe("unverifiable")
    expect(result.verdict.reason).toBe("identifier_unresolved")
  }, SERVER_TIMEOUT_MS)

  test("a quote differing from the source is REJECTED, not softened", () => {
    if (corpus === null) throw new Error("demo corpus failed to build")
    const faithful = VERIFY_SAMPLES.find((sample) => sample.id === "quran-6222")
    expect(faithful).toBeDefined()
    if (faithful === undefined) return
    const parsed = parseVerifyForm({
      quote: faithful.input.quote.replace("أَحَدٌ", "الواحد"),
      collection: "quran",
      number: "6222",
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const result = verifyPlayground(corpus.db, corpus.snapshotHash, parsed.value)
    expect(result.verdict.verdict).toBe("rejected")
  }, SERVER_TIMEOUT_MS)

  test("the two committed samples are distinct inputs", () => {
    expect(VERIFY_SAMPLES).toHaveLength(2)
    const a = sampleById("quran-6222")
    const b = sampleById("abudawud-4255-fabricated")
    expect(a?.input.quote).not.toBe(b?.input.quote)
  })
})

describe("the subprocess concurrency slot is exclusive", () => {
  test("a second acquisition fails until the slot is released", () => {
    releaseDemoSlot()
    expect(tryAcquireDemoSlot()).toBe(true)
    expect(tryAcquireDemoSlot()).toBe(false)
    expect(tryAcquireDemoSlot()).toBe(false)
    releaseDemoSlot()
    expect(tryAcquireDemoSlot()).toBe(true)
    releaseDemoSlot()
  })
})
