import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { badgeFor, isOk, MAX_QUOTE_CHARS } from "@mizan/core"
import { buildDemoCorpus, type DemoCorpus } from "../src/demo-corpus.ts"
import { badgeHtml, encodeText, page, scriptFree } from "../src/server/html.ts"
import { homeBody } from "../src/server/views.ts"
import {
  ar,
  badgeDisplay,
  dirOf,
  en,
  LANGS,
  langCookieHeader,
  readCookie,
  resolveLang,
  strings,
  type Lang,
} from "../src/server/i18n.ts"
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
    expect(encodeText("\"&<>'")) .toBe("&quot;&amp;&lt;&gt;&#39;")
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

  test("an Arabic page is also script-free", () => {
    expect(scriptFree(page("t", "<section>hi</section>", { lang: "ar" }))).toBe(true)
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

  test("Arabic badge text keeps the same CSS class", () => {
    expect(badgeHtml(badgeFor("verified"), "ar")).toContain("badge-verified")
    expect(badgeHtml(badgeFor("verified"), "ar")).toContain("موثَّق")
    expect(badgeHtml(badgeFor("rejected"), "ar")).toContain("badge-rejected")
    expect(badgeHtml(badgeFor("rejected"), "ar")).toContain("مرفوض")
  })
})

describe("the i18n dictionaries are complete in both languages", () => {
  test("en and ar expose exactly the same keys", () => {
    const enKeys = Object.keys(en).sort()
    const arKeys = Object.keys(ar).sort()
    expect(arKeys).toEqual(enKeys)
  })

  test("no dictionary value is an empty string", () => {
    for (const lang of LANGS) {
      const t = strings(lang)
      for (const [key, value] of Object.entries(t)) {
        expect(value.length, `${lang}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  test("G-1 through G-7 appears literally in the English run item", () => {
    expect(en.runItemCi).toContain("G-1 through G-7")
    expect(ar.runItemCi).toContain("G-1 through G-7")
  })

  test("corpus figures stay Western digits in both languages", () => {
    expect(en.sourcesTanzilRole).toContain("6,236")
    expect(ar.sourcesTanzilRole).toContain("6,236")
    expect(en.sourcesQuranLabRole).toContain("36,024")
    expect(ar.sourcesQuranLabRole).toContain("36,024")
    expect(en.sourcesCollections).toContain("27,234")
    expect(ar.sourcesCollections).toContain("27,234")
  })
})

describe("language resolution follows the documented precedence", () => {
  test("query beats field, field beats cookie, cookie beats Accept-Language", () => {
    const source = { query: "ar", field: "en", cookie: "ar", acceptLanguage: "ar-SA" }
    expect(resolveLang(source)).toBe("ar")
    expect(resolveLang({ query: null, field: "ar", cookie: "en", acceptLanguage: "en" })).toBe("ar")
    expect(resolveLang({ query: null, field: null, cookie: "ar", acceptLanguage: "en" })).toBe("ar")
    expect(resolveLang({ query: null, field: null, cookie: null, acceptLanguage: "ar-SA, en;q=0.8" })).toBe("ar")
  })

  test("an unknown value falls through to the next source and finally to en", () => {
    expect(resolveLang({ query: "xx", field: null, cookie: null, acceptLanguage: null })).toBe("en")
    expect(resolveLang({ query: null, field: null, cookie: null, acceptLanguage: null })).toBe("en")
  })

  test("dirOf is rtl exactly for ar", () => {
    expect(dirOf("ar")).toBe("rtl")
    expect(dirOf("en")).toBe("ltr")
  })

  test("badgeDisplay translates only known labels", () => {
    expect(badgeDisplay("VERIFIED", "ar")).toBe(ar.badgeVerified)
    expect(badgeDisplay("VERIFIED", "en")).toBe(en.badgeVerified)
    expect(badgeDisplay("SOMETHING_ELSE", "ar")).toBe("SOMETHING_ELSE")
  })
})

describe("cookies are read and written without a client script", () => {
  test("readCookie extracts the named cookie", () => {
    expect(readCookie("foo=1; mizan_lang=ar; baz=2", "mizan_lang")).toBe("ar")
    expect(readCookie("foo=1", "mizan_lang")).toBeNull()
    expect(readCookie(null, "mizan_lang")).toBeNull()
  })

  test("langCookieHeader is a one-year SameSite=Lax cookie", () => {
    const header = langCookieHeader("ar")
    expect(header).toContain("mizan_lang=ar")
    expect(header).toContain("Path=/")
    expect(header).toContain("Max-Age=31536000")
    expect(header).toContain("SameSite=Lax")
  })
})

describe("Arabic pages are RTL and carry the right chrome", () => {
  test("page with lang ar sets dir=rtl and lang=ar", () => {
    const html = page("t", "<section>hi</section>", { lang: "ar" })
    expect(html).toContain('<html lang="ar" dir="rtl">')
    expect(html).toContain("اسأل")
    expect(html).toContain("تخطَّ إلى المحتوى")
  })

  test("page with default lang stays English LTR", () => {
    const html = page("t", "<section>hi</section>")
    expect(html).toContain('<html lang="en" dir="ltr">')
    expect(html).toContain("Skip to content")
    expect(html).toContain("Ask")
  })

  test("the language switcher offers both languages as plain links", () => {
    const html = page("t", "<section>hi</section>", { lang: "en" })
expect(html).toContain('hreflang="en"')
    expect(html).toContain('hreflang="ar"')
    expect(html).toContain("/?lang=ar")
    expect(html).toContain("/?lang=en")
    expect(scriptFree(html)).toBe(true)
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

/**
 * The one-field verify form, and what the page promises about the corpus it searches.
 *
 * The decision under test is that a reader supplies ONE thing — the text they received — and the
 * server decides where to look. The four-field citation form still exists, but only the two committed
 * samples reach it, and they carry their own citation. So these assertions are about the FORM: that it
 * asks for one text, that the scope is genuinely optional, and that no figure on the page describes a
 * corpus other than the one that is open.
 */
describe("the verify form asks for one text, not a citation", () => {
  const snapshotHome = (): string =>
    homeBody({
      lang: "en",
      corpusAvailable: true,
      corpusDetail: "",
      corpusKind: "snapshot",
      liveAvailable: false,
      liveMissing: [],
      recordCount: 27_234,
      collectionCounts: { quran: 6_236 },
      snapshotHash: "a".repeat(64),
    })

  test("the form posts one text field and one optional scope", () => {
    const html = snapshotHome()
    expect(html).toContain('name="text"')
    expect(html).toContain('name="collection"')
  })

  test("the form no longer asks for a citation number or a claim-text field", () => {
    const html = snapshotHome()
    const section = html.slice(html.indexOf('id="verify"'), html.indexOf('id="badges"'))
    expect(section).not.toContain('name="claimText"')
    expect(section).not.toContain('name="number"')
    expect(section).not.toContain('name="quote"')
  })

  test("the scope is optional, so an empty scope searches every collection", () => {
    const html = snapshotHome()
    const start = html.indexOf('id="scope"')
    expect(start).toBeGreaterThan(0)
    const tag = html.slice(start, html.indexOf(">", start) + 1)
    expect(tag).not.toContain("required")
  })

  test("the page names the corpus that is open, because the record count describes that one only", () => {
    expect(snapshotHome()).toContain(en.corpusKindSnapshot)
    const anchors = homeBody({
      lang: "en",
      corpusAvailable: true,
      corpusDetail: "",
      corpusKind: "anchors",
      liveAvailable: false,
      liveMissing: [],
      recordCount: 4,
      collectionCounts: {},
      snapshotHash: "b".repeat(64),
    })
    expect(anchors).toContain(en.corpusKindAnchors)
    expect(anchors).not.toContain(en.corpusKindSnapshot)
  })

  test("an unusable corpus states the integrity failure instead of showing a zero", () => {
    const html = homeBody({
      lang: "en",
      corpusAvailable: false,
      corpusDetail: "attestation.json attests snapshotHash aaa",
      corpusKind: "none",
      liveAvailable: false,
      liveMissing: [],
      recordCount: 0,
      collectionCounts: {},
      snapshotHash: "",
    })
    expect(html).toContain(en.corpusIntegrityFailed)
    expect(html).toContain("attestation.json attests")
  })

  test("the Arabic page names the same corpus in Arabic, and stays script-free", () => {
    const html = homeBody({
      lang: "ar",
      corpusAvailable: true,
      corpusDetail: "",
      corpusKind: "snapshot",
      liveAvailable: false,
      liveMissing: [],
      recordCount: 27_234,
      collectionCounts: { quran: 6_236 },
      snapshotHash: "a".repeat(64),
    })
    expect(html).toContain(ar.corpusKindSnapshot)
    expect(scriptFree(html)).toBe(true)
  })
})

