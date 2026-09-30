import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { badgeFor, isErr, isOk, transcriptLabel, VERDICT_BADGE, type TranscriptKind, type Verdict } from "@mizan/core"
import { decodeFixture, encodeText, renderPage, PageExample, type PageFixture } from "../src/page.ts"

/**
 * Story 3's acceptance criteria, and the provenance that makes the page believable.
 *
 * Three groups, in the order the story states them: the badge strings come from the shared map,
 * untrusted text cannot become markup, and an unknown verdict never reaches the page. A fourth
 * group the story does not name but the page depends on: the committed `index.html` is exactly
 * what a fresh render produces, and the fixture it was rendered from is the committed demo and
 * nothing a hand typed.
 */

const PACKAGE_DIR = join(import.meta.dir, "..")
const REPO_ROOT = join(PACKAGE_DIR, "..", "..")

const readText = (path: string): string => readFileSync(path, "utf8")
const readJson = (relative: string): unknown => JSON.parse(readText(join(REPO_ROOT, relative)))

/** A test helper may throw — AGENTS.md section 2 exempts test helpers and nothing else. */
const loadFixture = (): PageFixture => {
  const decoded = decodeFixture(readJson(join("apps", "web", "fixtures", "page.json")))
  if (!isOk(decoded)) throw new Error(`the committed page fixture did not decode: ${decoded.error.detail}`)
  return decoded.value
}

const committedPage = (): string => readText(join(PACKAGE_DIR, "index.html"))

/** The mode label, read back out of the rendered bytes rather than assumed from the renderer. */
const pageFixtureLabelOf = (page: string): string | null => page.match(/class="mode-label">([^<]+)</)?.[1] ?? null

/** The mode line's own sentence, for the assertion that covers both halves of what the label means. */
const modeNoteOf = (page: string): string => page.match(/class="mode-note">([^<]+)</)?.[1] ?? ""

/**
 * The tags an attacker reaches for and the page never legitimately emits.
 *
 * Bare names rather than `<script`-shaped literals, because `INJECTABLE_ELEMENT` matches
 * case-insensitively and a substring list cannot: HTML tag names are case-insensitive, so
 * `<SCRIPT>alert(1)</SCRIPT>` executes in a browser while `not.toContain("<script")` does not see
 * it. A lowercase literal list is a list that quietly misses the capitalisation a person actually
 * types, and the arming test below now plants both spellings of every entry so that cannot return.
 *
 * `style` and `div` are absent on purpose: the page ships its own stylesheet, so asserting they
 * are absent would either fail on correct output or force a narrowing that hides a real tag.
 *
 * Module scope because the same list is asserted against two different things: a fresh render
 * with a payload planted in it, and the committed `index.html` a judge opens. The second is the
 * one that ships.
 */
const INJECTABLE_TAGS = ["script", "img", "svg", "iframe", "object", "embed", "b", "a"] as const

/**
 * An opening tag for any name on the list, in any case.
 *
 * The `(?=[\s/>])` lookahead is what makes a name complete rather than a prefix: without it, the
 * `a` entry would fire on the page's own `<article>` and on any `<abbr>`-shaped tag, which is the
 * kind of false positive that gets a real rule deleted rather than fixed.
 */
const INJECTABLE_ELEMENT = new RegExp(`<\\s*(?:${INJECTABLE_TAGS.join("|")})(?=[\\s/>])`, "i")

/**
 * The two injection shapes an element matcher cannot express.
 *
 * An event handler and a `javascript:` URL are attributes, not elements, so `INJECTABLE_ELEMENT`
 * never sees them — and both are what a hand edit or a compromised build step would reach for in a
 * page that has no script element to hide in. `on` plus a word boundary is the whole of the HTML
 * handler set, so the pattern is exact rather than a list that grows with every new attribute.
 *
 * ## Why quoted attribute values are consumed as units
 *
 * A `>` inside a quoted attribute value does NOT close the tag, so `[^>]*` stops at it and every
 * handler placed after such an attribute was invisible: `<div data-x=">" onmouseover="alert(1)">`
 * passed every assertion in `assertNoInjection` and executes on hover in the committed `file://`
 * page. Consuming `"…"` and `'…'` as units is what makes the expression exact, which is the claim
 * the previous one could not support.
 *
 * Note also what the character class forbids: `>` is excluded, so an unquoted run can never cross a
 * tag boundary and a handler in one element cannot be matched by a `<` belonging to another. A
 * quoted run *may* contain a `>`, which is the point; it is bounded by its own closing quote, so
 * it cannot escape the tag either. An unterminated quote defeats the match — that is the fail-open
 * direction, and byte-identity against `renderPage(fixture)` is what bounds it.
 */
const INLINE_HANDLER = /<(?:[^>"']|"[^"]*"|'[^']*')*\son[a-z]+\s*=/i
const JAVASCRIPT_URL = /javascript:/i

/**
 * A `meta` refresh redirects the page without executing a line of script.
 *
 * `<meta http-equiv="refresh" content="0;url=//evil.example">` carries no `on*=` attribute, no
 * `javascript:` URL and no element on `INJECTABLE_TAGS` — and `meta` CANNOT join that list, because
 * `index.html` ships its own `<meta charset>` and `<meta name="viewport">`, so a bare-name rule for
 * it would red the committed bytes. The redirect is named instead of the tag, which is why this rule
 * exists rather than a tenth entry in the list above.
 *
 * The unquoted run is `(?:[^>"']|"[^"]*"|'[^']*')*` for the same reason `INLINE_HANDLER` uses it: a
 * `>` inside a quoted value does not close the tag, so a `[^>]*` here would stop short of an
 * `http-equiv` hidden behind `<meta title="a > b">` and miss the redirect it is written to catch.
 */
const META_REFRESH = /<meta(?:[^>"']|"[^"]*"|'[^']*')*\bhttp-equiv\s*=\s*["']?\s*refresh/i

/** Every injection shape above, applied to one document. */
const assertNoInjection = (page: string): void => {
  expect(page).not.toMatch(INJECTABLE_ELEMENT)
  expect(page).not.toMatch(INLINE_HANDLER)
  expect(page).not.toMatch(JAVASCRIPT_URL)
  expect(page).not.toMatch(META_REFRESH)
}

/* ------------------------------------------------------------------ AC1 — the badge comes from the map */

describe("the three badge lines come from the shared verdict map", () => {
  const page = renderPage(loadFixture())

  test.each(["verified", "unverifiable", "rejected"] as const)("%s is rendered as the map's string", (verdict) => {
    expect(page).toContain(`<span class="badge">${badgeFor(verdict)}</span>`)
  })

  test("all three badges appear, and no fourth does", () => {
    const badges = [...page.matchAll(/class="badge">([^<]+)</g)].map((match) => match[1])
    expect(new Set(badges)).toEqual(new Set(["VERIFIED", "UNVERIFIABLE", "REJECTED"]))
  })

  test("the CLI reads the same map instead of keeping a copy", () => {
    const renderSource = readText(join(REPO_ROOT, "apps", "cli", "src", "render.ts"))
    expect(renderSource).toContain("badgeFor(")
    expect(renderSource).not.toMatch(/["'](VERIFIED|REJECTED|UNVERIFIABLE)["']/)
  })
})

/* ------------------------------------------------------------------ AC3 — untrusted text stays text */

describe("corpus and model text cannot inject markup", () => {
  const PAYLOAD = `<script>alert(1)</script><img src=x onerror=alert(1)>"quoted" & <b>bold</b>`

  /**
   * The fixture fields `exampleBlock` interpolates, each paired with how the page reads it.
   *
   * ## Why the list and not two fields
   *
   * A test that plants a payload in `quote` and `recordText` proves the encoder works on two of the
   * seven strings a reader can see. The other five reach the same template through a different
   * expression — `question` and `prose` alone, `sourceLabel` alone, and `claimId` and `reason`
   * concatenated together in one interpolation — and a concatenated interpolation is exactly where
   * an encoder call gets dropped during an edit, because deleting it looks like a tidy-up. So every
   * interpolated field is planted, and the assertion is that *no* tag survives anywhere in the
   * document rather than that the expected characters appear somewhere in it.
   *
   * `verdict` is absent by construction: it is a member of a three-value union decoded at the
   * boundary, so a payload cannot reach it without the decode failing first, which the AC4 block
   * proves.
   */
  const UNTRUSTED_FIELDS: ("claimId" | "reason" | "question" | "prose" | "quote" | "sourceLabel" | "recordText")[] = [
    "claimId",
    "reason",
    "question",
    "prose",
    "quote",
    "sourceLabel",
    "recordText",
  ]

  test("the fixture's every untrusted field reaches the document, and no field is left unplanted", () => {
    // Completeness, from the schema rather than from a hand-typed list: a new `PageExample` field
    // appears here as an unplanted field and fails, so it cannot reach the document untested. The
    // one excluded is `verdict`, which the union makes unreplantable.
    const unplantable = new Set<string>(["verdict"])
    const derived = Object.keys(PageExample.fields).filter((field) => !unplantable.has(field))
    expect(derived.sort()).toEqual([...UNTRUSTED_FIELDS].sort())
    // And the renderer really reads each one, so "the field exists" is not mistaken for "the field
    // is displayed". Matched on the bare name: `claimId` and `reason` are interpolated together
    // inside one template literal, so requiring the exact `encodeText(example.claimId` spelling
    // would fail on correct code and pass on a field that is rendered but unencoded.
    const source = readText(join(PACKAGE_DIR, "src", "page.ts"))
    for (const field of derived) expect(source).toContain(`example.${field}`)
  })

  test.each(UNTRUSTED_FIELDS)("a payload planted in %s is encoded into characters, never into tags", (field) => {
    const base = loadFixture()
    const page = renderPage({ ...base, examples: [{ ...base.examples[0]!, [field]: PAYLOAD }] })
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(page).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(page).toContain("&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;")
    // The whole-document check, because "the payload is encoded" and "the payload did not become
    // markup somewhere else" are different claims and only the second is the security property.
    assertNoInjection(page)
  })

  test("a payload in every field at once still yields no injectable tag anywhere in the document", () => {
    const base = loadFixture()
    const poisoned = Object.fromEntries(UNTRUSTED_FIELDS.map((field) => [field, PAYLOAD]))
    const page = renderPage({ ...base, examples: [{ ...base.examples[0]!, ...poisoned }] })
    assertNoInjection(page)
    // The page's own markup is still there, so the loop above is not passing because the document
    // is empty or because the example was dropped.
    expect(page).toContain("<h1>mizan</h1>")
    expect(page).toContain('<article class="example">')
    expect(page).toContain("&lt;script&gt;")
  })

  test("the encoder is total over the five characters that matter", () => {
    expect(encodeText("&< >\"'")).toBe("&amp;&lt; &gt;&quot;&#39;")
    expect(encodeText("قُلْ هُوَ ٱللَّهُ أَحَدٌ")).toBe("قُلْ هُوَ ٱللَّهُ أَحَدٌ")
  })

  test("a very long quotation is emitted whole — wrapped by CSS, never truncated", () => {
    const base = loadFixture()
    const long = "بِسْمِ ٱللَّهِ ".repeat(400)
    const page = renderPage({ ...base, examples: [{ ...base.examples[0]!, quote: long }] })
    expect(page).toContain(`<pre dir="auto">${long}</pre>`)
    expect(page).not.toContain("…")
  })

  test("an empty example list renders the legend and no example, rather than a fallback badge", () => {
    const page = renderPage({ ...loadFixture(), examples: [] })
    expect(page).not.toContain('class="example"')
    expect(new Set([...page.matchAll(/class="badge">([^<]+)</g)].map((match) => match[1]))).toEqual(
      new Set(["VERIFIED", "UNVERIFIABLE", "REJECTED"]),
    )
  })

  test("every quotation block declares auto direction, so Arabic lays out RTL", () => {
    const quotes = [...committedPage().matchAll(/<pre[^>]*>/g)].map((match) => match[0])
    expect(quotes).toHaveLength(loadFixture().examples.length * 2)
    expect(quotes.every((tag) => tag.includes('dir="auto"'))).toBe(true)
  })
})

/* ------------------------------------------------------------------ AC4 — an unknown verdict never renders */

describe("an unknown verdict fails the build rather than rendering", () => {
  test("a verdict outside the union is refused at the boundary", () => {
    const good = loadFixture().examples[0]!
    const refused = decodeFixture({ examples: [{ ...good, verdict: "madeUp" }] })
    expect(isErr(refused)).toBe(true)
  })

  // The compile-time half: this line must be a type error. `@ts-expect-error` reports an
  // UNUSED directive, so `tsc --noEmit` fails if `Verdict` ever widens to accept it — which is
  // the acceptance criterion's "the build runs, then tsc fails", checked by every typecheck.
  // @ts-expect-error "madeUp" is not a member of the verdict union.
  const unknownVerdict: Verdict = "madeUp"

  test("the compile-time assertion above is armed", () => {
    expect(String(unknownVerdict)).toBe("madeUp")
  })

  test("the map holds exactly the union's three keys — there is no fallback entry to fall back to", () => {
    expect(Object.keys(VERDICT_BADGE).sort()).toEqual(["rejected", "unverifiable", "verified"])
  })
})

/* ------------------------------------------------------------------ offline + byte-identical committed page */

/**
 * The committed `index.html` is the artefact a judge opens, and it is the ONLY control over its own
 * markup — see the boundary block in `packages/mizan-gate/test/gates.test.ts`, which measures that
 * G-2's sink-token rules cannot see an injected element, a handler attribute or a `javascript:`
 * URL, and `docs/specs/adr/ADR-C3.md`, which states the same split. So every claim in this block is
 * asserted against the committed BYTES, not against a fresh render of the fixture: byte-identity
 * proves nobody hand-edited the file, and the element-level assertions prove that what a hand edit
 * would put there is the shape the file does not have.
 */
describe("the committed page", () => {
  test("is byte-identical to a fresh render of the fixture", () => {
    expect(committedPage()).toBe(renderPage(loadFixture()))
  })

  test("carries no injected element, event handler or javascript: URL", () => {
    assertNoInjection(committedPage())
  })

  test("the injection guard is armed: it rejects every shape it claims to catch", () => {
    // A list of patterns that match nothing is a list that has stopped checking anything, and the
    // only way to know is to feed it what it forbids. Each entry below is planted, so a tag added
    // to `INJECTABLE_TAGS` and an expression narrowed into uselessness both fail here rather than
    // passing silently for the life of the file.
    for (const tag of INJECTABLE_TAGS) {
      expect(() => assertNoInjection(`<div><${tag}></${tag}></div>`)).toThrow()
      // Every entry, in upper case as well. The lowercase-only list this replaced proved its own
      // literals were non-empty and never that it was case-insensitive, so a matcher that lost the
      // `i` flag would have gone on passing the line above forever. One uppercase plant for a
      // single shape would not stop that recurring for the other seven entries.
      expect(() => assertNoInjection(`<div><${tag.toUpperCase()}></${tag.toUpperCase()}></div>`)).toThrow()
    }
    // The two payloads a hand edit reaches for, in the casing a person types when not thinking
    // about the test that catches them.
    expect(() => assertNoInjection("<SCRIPT>alert(1)</SCRIPT>")).toThrow()
    expect(() => assertNoInjection("<IMG SRC=x ONERROR=alert(1)>")).toThrow()
    expect(() => assertNoInjection('<div onclick="x()">y</div>')).toThrow()
    expect(() => assertNoInjection('<div ONERROR="x()">y</div>')).toThrow()
    expect(() => assertNoInjection('<a href="javascript:x()">y</a>')).toThrow()
    // The two escapes the character class in `INLINE_HANDLER` exists for. `[^>]*` stopped at the
    // `>` inside the quoted value and both of these ran past every assertion above — a hover-to-
    // execute payload in a shipped `file://` page, not a theoretical one. Each is planted here so a
    // future simplification of that class back to `[^>]*` fails rather than passing quietly.
    expect(() => assertNoInjection('<div data-x=">" onmouseover="alert(1)">y</div>')).toThrow()
    expect(() => assertNoInjection('<div title="a > b" onclick="alert(1)">y</div>')).toThrow()
    expect(() => assertNoInjection("<div data-x='>' onmouseover='alert(1)'>y</div>")).toThrow()
    // The redirect that needs no script at all. The URL is protocol-relative and the attribute is
    // neither `src` nor `href`, so both the no-network suite and the three patterns above pass it —
    // and the page still ships its own `charset` and `viewport` metas, so `meta` cannot simply join
    // `INJECTABLE_TAGS` to close the gap. Planted here because a rule nothing plants is a rule that
    // can rot into matching nothing while the suite stays green.
    expect(() => assertNoInjection('<meta http-equiv="refresh" content="0;url=//evil.example">')).toThrow()
    // Upper case, single-quoted value, no quotes at all, and a `>` inside a quoted attribute before
    // the `http-equiv` — the four spellings a `[^>]*` class would have let through.
    expect(() => assertNoInjection('<META HTTP-EQUIV="REFRESH" CONTENT="0">')).toThrow()
    expect(() => assertNoInjection("<meta http-equiv='refresh' content='0;url=//evil.example'>")).toThrow()
    expect(() => assertNoInjection("<meta http-equiv=refresh content=0>")).toThrow()
    expect(() => assertNoInjection('<meta title="a > b" http-equiv="refresh" content="0">')).toThrow()
    // And the boundary the class draws: `>` is excluded from the unquoted run, so a handler-shaped
    // word of ordinary prose — or a handler-shaped attribute on a LATER element — is unreachable.
    expect(() => assertNoInjection('<div><p>only once</p><p class="x">on the one hand</p></div>')).not.toThrow()
    // And the boundary `META_REFRESH` draws: the rule names the redirect, not the tag. A narrowing
    // that reached for a bare `<meta` would red the page's own `<meta charset>` and
    // `<meta name="viewport">`, so both are planted as the non-findings that keep the rule honest.
    expect(() => assertNoInjection('<meta charset="utf-8">')).not.toThrow()
    expect(() => assertNoInjection('<meta name="viewport" content="width=device-width">')).not.toThrow()
    // And the committed bytes are not rejected, so the guard is a check rather than a refusal
    // that would fail for reasons unrelated to injection — this is also what proves the lookahead
    // did not turn `<article>` and `<body>` into findings.
    expect(() => assertNoInjection(committedPage())).not.toThrow()
  })

  test("requires no network: no http URL, no fetch, no external resource", () => {
    const page = committedPage()
    expect(page).not.toMatch(/https?:\/\//)
    expect(page).not.toMatch(/\bfetch\s*\(/)
    expect(page).not.toMatch(/XMLHttpRequest/)
    expect(page).not.toMatch(/<link\b/i)
    expect(page).not.toMatch(/\bsrc\s*=/i)
    expect(page).not.toMatch(/\shref\s*=/i)
  })

  test("carries no secret, no key reference and no configuration (A05/A07)", () => {
    const page = committedPage()
    for (const forbidden of [".env", "API_KEY", "apiKey", "MIZAN_", "Authorization", "Bearer "]) {
      expect(page).not.toContain(forbidden)
    }
  })
})

/* ------------------------------------------------------------------ Story 4 — the page says which mode it is in */

describe("the page states whether its answers were generated or replayed", () => {
  const fixture = loadFixture()

  test("the committed page prints the shared mode label, not a local wording", () => {
    expect(pageFixtureLabelOf(committedPage())).toBe(transcriptLabel(fixture.transcript))
  })

  test("the label is the one the CLI header prints", () => {
    // The same source-level check the badge map gets above: two surfaces, one string, verified by
    // both reading `transcriptLabel` rather than by a comment promising they will.
    const renderSource = readText(join(REPO_ROOT, "apps", "cli", "src", "render.ts"))
    expect(renderSource).toContain("transcriptLabel(")
    expect(renderSource).not.toMatch(/["']PRECOMPUTED\b/)
    expect(pageFixtureLabelOf(committedPage())).toBe(transcriptLabel(fixture.transcript))
  })

  test("a live fixture prints LIVE, so a live run is never shown as a replay", () => {
    const page = renderPage({ ...fixture, transcript: "live" })
    expect(pageFixtureLabelOf(page)).toBe(transcriptLabel("live"))
    expect(page).not.toContain("PRECOMPUTED")
  })

  test("a mode outside the two the trace admits is refused at the boundary", () => {
    // Fail closed rather than default: an unrecognised mode is a fixture this build cannot describe.
    const refused = decodeFixture({ ...fixture, transcript: "cached" })
    expect(isErr(refused)).toBe(true)
  })

  test("the mode line states that the verdicts are computed on both paths", () => {
    // The half a reader is most likely to collapse: replayed sentences, computed badges. The page
    // has to say both, or the label reads as a disclaimer covering the whole report — including the
    // badges, which it is not.
    const note = modeNoteOf(committedPage())
    expect(note).toContain("replayed from a committed transcript")
    expect(note).toContain("computed by the verifier")
  })

  test("a live fixture's note says the answers were generated, not replayed", () => {
    const note = modeNoteOf(renderPage({ ...fixture, transcript: "live" }))
    expect(note).toContain("generated live")
    expect(note).not.toContain("replayed")
  })

  test("no example is needed for the label to be on the page", () => {
    expect(pageFixtureLabelOf(renderPage({ ...fixture, examples: [] }))).toBe(transcriptLabel(fixture.transcript))
  })
})

/* ------------------------------------------------------------------ provenance — the fixture is the demo */

type DeclaredExpectation = {
  readonly claimId: string
  readonly expectedVerdict: string
  readonly expectedReason: string
  readonly recordId: string
}
type DeclaredQuestion = { readonly question: string; readonly expectations: readonly DeclaredExpectation[] }
type DeclaredQuestions = { readonly questions: readonly DeclaredQuestion[] }
type TranscriptClaim = { readonly id: string; readonly quote: string | null }
type TranscriptEntry = { readonly stage: string; readonly answer: { readonly prose: string; readonly transcript: TranscriptKind; readonly claims: readonly TranscriptClaim[] } }
type Transcript = { readonly entries: readonly TranscriptEntry[] }
type Anchor = { readonly recordId: string; readonly collection: string; readonly number: string; readonly textDisplay: string }
type Anchors = { readonly anchors: readonly Anchor[] }

/** Fail loudly when a fixture field has no committed counterpart, instead of comparing `undefined`. */
const mustFind = <T>(found: T | undefined, what: string): T => {
  if (found === undefined) throw new Error(`the committed demo does not declare ${what}`)
  return found
}

const declaredExpectations = (): Map<string, { question: string; expectation: DeclaredExpectation }> => {
  const declared = readJson(join("data", "demo-questions.json")) as DeclaredQuestions
  const byClaim = new Map<string, { question: string; expectation: DeclaredExpectation }>()
  for (const question of declared.questions) {
    for (const expectation of question.expectations) byClaim.set(expectation.claimId, { question: question.question, expectation })
  }
  return byClaim
}

describe("every example on the page is the committed demo, not a hand-typed string", () => {
  const fixture = loadFixture()

  test("the page shows every claim the demo declares — and no claim it does not", () => {
    const declared = declaredExpectations()
    expect(new Set(fixture.examples.map((example) => example.claimId))).toEqual(new Set(declared.keys()))
  })

  test("the verdict and reason are the ones data/demo-questions.json declares", () => {
    const declared = declaredExpectations()
    for (const example of fixture.examples) {
      const entry = mustFind(declared.get(example.claimId), `claim ${example.claimId} in data/demo-questions.json`)
      expect(entry.expectation.expectedVerdict).toBe(example.verdict)
      expect(entry.expectation.expectedReason).toBe(example.reason)
      expect(entry.question).toBe(example.question)
    }
  })

  test("the prose and quotation are the committed transcript's, verbatim", () => {
    const transcript = readJson(join("data", "transcript.json")) as Transcript
    const answers = new Map<string, { prose: string; claim: TranscriptClaim }>()
    for (const entry of transcript.entries) {
      if (entry.stage !== "answer") continue
      for (const claim of entry.answer.claims) answers.set(claim.id, { prose: entry.answer.prose, claim })
    }
    for (const example of fixture.examples) {
      const answer = mustFind(answers.get(example.claimId), `claim ${example.claimId} in data/transcript.json`)
      expect(answer.prose).toBe(example.prose)
      expect(answer.claim.quote ?? "").toBe(example.quote)
    }
  })

  test("the page's mode label is the committed transcript's own mode, not a typed assumption", () => {
    // The label is the claim most likely to be wrong in the direction that costs the demo: a
    // replayed answer labelled live. So the fixture's mode is read out of `data/transcript.json`,
    // whose every answer entry states its own `transcript`, rather than being trusted as written.
    const transcript = readJson(join("data", "transcript.json")) as Transcript
    const modes = new Set(transcript.entries.filter((entry) => entry.stage === "answer").map((entry) => entry.answer.transcript))
    expect(modes.size).toBeGreaterThan(0)
    for (const mode of modes) expect(fixture.transcript).toBe(mode)
  })

  test("the record text and label are the attested anchor's, verbatim", () => {
    const anchors = readJson(join("data", "eval", "demo-anchors.json")) as Anchors
    const declared = declaredExpectations()
    for (const example of fixture.examples) {
      const recordId = mustFind(declared.get(example.claimId)?.expectation.recordId, `a record id for claim ${example.claimId}`)
      const anchor = mustFind(
        anchors.anchors.find((candidate) => candidate.recordId === recordId),
        `anchor ${recordId} in data/eval/demo-anchors.json`,
      )
      expect(anchor.textDisplay).toBe(example.recordText)
      expect(`${anchor.collection} ${anchor.number}`).toBe(example.sourceLabel)
    }
  })
})
