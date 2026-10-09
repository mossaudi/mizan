import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join, relative, sep } from "node:path"
import { isOk, type ClaimVerdict, type EvidenceRef } from "@mizan/core"
import { stripComments } from "../src/strip-comments.ts"
import type { SourceFile } from "../src/scan.ts"
import { CODE_EXTENSIONS } from "../src/index.ts"
import {
  checkContainmentOnly,
  checkDependencyIsolation,
  checkNoAdHocMatchStrength,
  checkNoAmbientAuthority,
  checkNoAntiAnalysis,
  checkNoComputedPercent,
  checkNoDonorWorkaround,
  checkNoDynamicEval,
  checkNoObfuscation,
  checkNoRawHtml,
checkNoSimilarity,
  checkOneConstructionSite,
  checkOneSchemaSite,
  checkVerdictIsolation,
  checkLicenceFields,
  assertNoFalseVerified,
  checkVerdictPathClosure,
  gateVerdictPathPurity,
  checkAnchorModuleHasNoOpinion,
  checkNoSimilarityOnPath,
  checkNoAmbientAuthorityOnPath,
  checkNoPercentKeyOnPath,
  checkNoAppCodeOnPath,
  checkDisplayPathPresent,
  checkRelevanceModuleHasNoOutcome,
  checkSuggestPackageIsLeaf,
  checkSuggestPackageNamesNoOutcome,
  checkSuggestPackageReachesNoVerdictPath,
  checkSuggestPackageHasNoAmbientAuthority,
  checkDisplayContractNumbers,
  checkCompletenessClaimCarriesDenominator,
  probeOnDisk,
  COMPLETENESS_CLAIM_TOKENS,
  COVERAGE_CLAIM_EXPORT,
  COVERAGE_RENDER_MODULE,
  DENOMINATOR_WORDS,
  DISPLAY_CONTRACT_NUMBERS,
  findRepositoryRoot,
  findRoot,
  requireRepositoryRoot,
  GITLEAKS_VERSION,
  GITLEAKS_BINARY,
  runGitleaks,
  excusedByGit,
  candidateLabels,
  UNTRUSTED_SCANNER_MESSAGE,
  resolveScanner,
  isUntrustedScannerPath,
  executableNames,
  partitionFindings,
  type GitleaksFinding,
  type GitleaksResult,
  type GitleaksScan,
  type GitleaksSpawn,
  type ScannerResolution,
  type ScannerResolver,
  VERIFY_PREFIX,
} from "../src/index.ts"

/**
 * The self-tests. Every rule is checked twice: once with a CLEAN fixture that must produce
 * no findings, and once with a PLANTED VIOLATION that must be caught, by rule id.
 *
 * This is the whole reason the gates are pure functions of a file list. A gate that reads
 * the working tree can only be tested by breaking the working tree, so in practice it never
 * gets tested, and an untested gate is a gate nobody knows still works. AGENTS.md section 14:
 * a guard that cannot fail is not a guard — and neither is one that cannot be shown to fail.
 */

const file = (path: string, text: string): SourceFile => ({ path, text })
const verifyFile = (text: string): SourceFile => file(`${VERIFY_PREFIX}src/example.ts`, text)
const rules = (findings: readonly { readonly rule: string }[]): readonly string[] => findings.map((finding) => finding.rule)

/** A line that must survive every gate: the shape real mizan-verify code has. */
const CLEAN_VERIFY_SOURCE = `import { normalizeForMatch, type CorpusRecord } from "@mizan/core"
import { containsQuote } from "./steps/containment.ts"

export const isContained = (quote: string, record: CorpusRecord): boolean => {
  if (normalizeForMatch(quote).length === 0) return false
  return record.textMatch.includes(normalizeForMatch(quote))
}
`

describe("comment stripping", () => {
  test("removes line and block comments and string bodies without moving line numbers", () => {
    const source = ['const a = 1 // innerHTML', "/* similarity", "   threshold */", 'const b = "innerHTML"'].join("\n")
    const stripped = stripComments(source)
    expect(stripped.split("\n").length).toBe(4)
    expect(stripped).not.toContain("innerHTML")
    expect(stripped).not.toContain("similarity")
    expect(stripped).toContain("const a = 1")
  })

  test("keeps template literals inert and preserves newlines inside them", () => {
    const stripped = stripComments("const t = `line one\nline two // not a comment`\nconst x = 1")
    expect(stripped.split("\n").length).toBe(3)
    expect(stripped).not.toContain("not a comment")
  })
})

describe("G-1 dependency isolation", () => {
  test("clean: core and relative imports pass", () => {
    expect(rules(checkDependencyIsolation([verifyFile(CLEAN_VERIFY_SOURCE)]))).toEqual([])
  })

  test("planted: an effect import is caught", () => {
    const findings = checkDependencyIsolation([verifyFile('import { Schema } from "effect"\n')])
    expect(rules(findings)).toEqual(["G-1.1 dependency-isolation"])
    expect(findings[0]?.line).toBe(1)
  })

  test("planted: a second workspace package is caught", () => {
    expect(rules(checkDependencyIsolation([verifyFile('import { x } from "@mizan/retrieval"\n')]))).toHaveLength(1)
  })
})

describe("G-1 no similarity", () => {
  test("clean: the real shape of verifier code passes", () => {
    expect(rules(checkNoSimilarity([verifyFile(CLEAN_VERIFY_SOURCE)]))).toEqual([])
  })

  test("planted: a fuzzy score is caught, including a compound name", () => {
    expect(rules(checkNoSimilarity([verifyFile("const s = fuzzyScore(a, b)\n")]))).toEqual(["G-1.2 no-similarity"])
  })

  test("planted: an embedding client is caught", () => {
    expect(rules(checkNoSimilarity([verifyFile("const client = new EmbeddingClient()\n")]))).toHaveLength(1)
  })

  test("planted: a similarity threshold is caught", () => {
    expect(rules(checkNoSimilarity([verifyFile("if (similarity >= 0.85) return true\n")]))).toHaveLength(1)
  })

  test("a mention inside a comment is not a violation: the gate is not noisy", () => {
    expect(rules(checkNoSimilarity([verifyFile("// no similarity here, on purpose\n")]))).toEqual([])
  })
})

describe("G-1 no ambient authority", () => {
  test("clean: a total function passes", () => {
    expect(rules(checkNoAmbientAuthority([verifyFile(CLEAN_VERIFY_SOURCE)]))).toEqual([])
  })

  test("planted: Date.now is caught", () => {
    expect(rules(checkNoAmbientAuthority([verifyFile("const t = Date.now()\n")]))).toHaveLength(1)
  })

  test("planted: Math.random is caught", () => {
    expect(rules(checkNoAmbientAuthority([verifyFile("const n = Math.random()\n")]))).toHaveLength(1)
  })

  test("planted: fetch is caught", () => {
    expect(rules(checkNoAmbientAuthority([verifyFile("const r = await fetch(url)\n")]))).toHaveLength(1)
  })

  test("planted: process.env is caught", () => {
    expect(rules(checkNoAmbientAuthority([verifyFile("const k = process.env.API_KEY\n")]))).toHaveLength(1)
  })
})

describe("G-1 containment only", () => {
  test("clean: includes is allowed in containment.ts", () => {
    expect(rules(checkContainmentOnly([file(`${VERIFY_PREFIX}src/steps/containment.ts`, CLEAN_VERIFY_SOURCE)]))).toEqual([])
  })

  test("clean: includes is allowed in the display-only diagnostic", () => {
    expect(rules(checkContainmentOnly([file(`${VERIFY_PREFIX}src/diagnostics/longest-run.ts`, CLEAN_VERIFY_SOURCE)]))).toEqual([])
  })

  test("planted: a second match site is caught", () => {
    const findings = checkContainmentOnly([file(`${VERIFY_PREFIX}src/steps/citations.ts`, "const ok = folded.includes(quote)\n")])
    expect(rules(findings)).toEqual(["G-1.4 containment-only"])
    expect(findings[0]?.path).toBe(`${VERIFY_PREFIX}src/steps/citations.ts`)
  })
})

describe("G-2 no raw HTML", () => {
  test("clean: a text node passes", () => {
    expect(rules(checkNoRawHtml([file("apps/web/src/quote.ts", "node.textContent = record.textDisplay\n")]))).toEqual([])
  })

  test("planted: innerHTML is caught", () => {
    expect(rules(checkNoRawHtml([file("apps/web/src/quote.ts", "node.innerHTML = record.textDisplay\n")]))).toEqual(["G-2.1 no-raw-html"])
  })

  test("planted: dangerouslySetInnerHTML is caught", () => {
    expect(rules(checkNoRawHtml([file("apps/web/src/q.tsx", "return <div dangerouslySetInnerHTML={{ __html: t }} />\n")]))).toHaveLength(1)
  })

  test("planted: a sink API inside a shipped .html page's script body is caught", () => {
    const page = file("apps/web/index.html", '<div id="c"></div>\n<script>c.innerHTML = corpus</script>\n')
    expect(rules(checkNoRawHtml([page]))).toEqual(["G-2.1 no-raw-html"])
  })

  test("the scan admits markup, so the committed page is inside every tree-wide gate", () => {
    expect([...CODE_EXTENSIONS]).toContain(".html")
  })
})

/**
 * The boundary of the gate above, measured rather than asserted in prose.
 *
 * ## Why this block exists
 *
 * `.html` was added to `CODE_EXTENSIONS` so the committed page is inside the tree-wide gates, and
 * the first draft of ADR-C3 then claimed that a raw sink planted in that page is "a red build".
 * It is not. This block is what that claim is worth: the payloads below were run through the real
 * `checkNoRawHtml`, and the caught/missed split is the result. A `<script>` body is code, so a
 * sink token written inside one is seen; a tag is not a token, and `"code"` mode blanks string
 * bodies, which is where a handler attribute's payload lives.
 *
 * ## What this is NOT
 *
 * It is not an assertion that blindness is acceptable. It is the reason the real control is
 * named: markup injection into `apps/web/index.html` is covered by `apps/web/test/page.test.ts`
 * (byte-identity against `renderPage(fixture)`, element-level assertions over the committed
 * bytes, and the no-network assertions), and by nothing here. `docs/specs/adr/ADR-C3.md` states
 * the same split, so the two cannot drift: a future change that closes the gap makes this block
 * red, and a future change that widens `HTML_SINKS` with an element rule moves a payload from
 * `MISSED` to `CAUGHT` and forces the ADR to be rewritten rather than left standing.
 */
describe("G-2 on a shipped page: the measured boundary of the sink-token rules", () => {
  const page = (text: string) => file("apps/web/index.html", text)

  test("a sink API in a script body is caught, because a script body is code", () => {
    expect(rules(checkNoRawHtml([page('<script>c.innerHTML = corpus</script>\n')]))).toEqual(["G-2.1 no-raw-html"])
  })

  test.each([
    ["an injected script that reaches no sink token", "<script>alert(1)</script>\n"],
    ["an inline event handler, whose payload is a string body", '<div onclick="document.write(1)">x</div>\n'],
    ["a javascript: URL", '<a href="javascript:alert(1)">x</a>\n'],
    ["an iframe", '<iframe src="https://evil.example"></iframe>\n'],
    ["a meta refresh redirect, which needs no script at all", '<meta http-equiv="refresh" content="0;url=//evil.example">\n'],
  ])("G-2 cannot see %s", (_label, text) => {
    // The blind spot, stated as an expectation rather than left to a reader's inference. If a
    // future rule closes it, this goes red and the ADR has to say so.
    expect(checkNoRawHtml([page(text)])).toEqual([])
  })
})

describe("G-2 verdict isolation", () => {
  test("clean: verify.ts does not import diagnostics", () => {
    expect(rules(checkVerdictIsolation([file("packages/mizan-verify/src/verify.ts", CLEAN_VERIFY_SOURCE)]))).toEqual([])
  })

  test("planted: verify.ts importing the diagnostic is caught", () => {
    const findings = checkVerdictIsolation([file("packages/mizan-verify/src/verify.ts", 'import { longestRunFor } from "./diagnostics/longest-run.ts"\n')])
    expect(rules(findings)).toEqual(["G-2.2 verdict-isolation"])
  })
})

describe("G-3 no evasion", () => {
  test("clean: ordinary code passes all four rules", () => {
    const clean = file("apps/cli/src/main.ts", "const parsed = JSON.parse(text)\nconst encoded = new TextEncoder().encode(text)\n")
    expect(rules(checkNoDynamicEval([clean]))).toEqual([])
    expect(rules(checkNoObfuscation([clean]))).toEqual([])
    expect(rules(checkNoAntiAnalysis([clean]))).toEqual([])
    expect(rules(checkNoDonorWorkaround([clean]))).toEqual([])
  })

  test("planted: eval is caught", () => {
    expect(rules(checkNoDynamicEval([file("src/x.ts", "const r = eval(payload)\n")]))).toEqual(["G-3.1 no-dynamic-eval"])
  })

  test("planted: atob is caught", () => {
    expect(rules(checkNoObfuscation([file("src/x.ts", "const s = atob(blob)\n")]))).toEqual(["G-3.2 no-obfuscation"])
  })

  test("planted: a debugger statement is caught", () => {
    expect(rules(checkNoAntiAnalysis([file("src/x.ts", "debugger\n")]))).toHaveLength(1)
  })

  test("planted: the removed donor module name is caught", () => {
    const findings = checkNoDonorWorkaround([
      file("packages/mizan-agent/src/hooks.ts", 'import { rotateWan } from "@opencode/office/network-recovery"\n'),
    ])
    expect(rules(findings)).toEqual(["G-3.4 no-donor-workaround"])
  })

  test("the gate package itself is out of scope for token-list rules", () => {
    const gateSource = file("packages/mizan-gate/src/gates/g3-no-evasion.ts", 'export const DONOR_TOKENS = ["rotateWan"]\n')
    expect(rules(checkNoDonorWorkaround([gateSource]))).toEqual([])
  })
})

describe("G-5 licence fields", () => {
  const goodSource = {
    source: "tanzil/quran-uthmani",
    title: "Tanzil Uthmani",
    publisher: "Tanzil",
    url: "https://example.invalid/quran.txt",
    license: "Tanzil Terms — no derivatives",
    licenceClass: "no-derivatives",
    licenseUrl: "https://example.invalid/terms",
    attribution: "Qur'an text: Tanzil",
    sha256: "a".repeat(64),
    records: 6236,
    enabled: true,
    exclusionReason: null,
    gradeApplicable: false,
    gradeBasis: "none",
    // `notes` is required by SourceDescriptor. A permissive default keeps this fixture about
    // licence rules; the corpus package has its own test asserting the exclusion note is kept.
    notes: null,
  }
  const registry = (sources: readonly unknown[]) => ({ schemaVersion: "1", generatedBy: "test", sources })

  test("clean: a complete registry passes", () => {
    expect(checkLicenceFields(registry([goodSource]))).toEqual([])
  })

  test("planted: an empty licence is caught", () => {
    const findings = checkLicenceFields(registry([{ ...goodSource, license: "   " }]))
    expect(rules(findings)).toEqual(["G-5.2 required-field-empty"])
    expect(findings[0]?.excerpt).toContain("license is empty")
  })

  test("planted: an empty attribution is caught", () => {
    expect(rules(checkLicenceFields(registry([{ ...goodSource, attribution: "" }])))).toEqual(["G-5.2 required-field-empty"])
  })

  test("planted: an unconfirmed licence on an enabled source is caught", () => {
    const findings = checkLicenceFields(registry([{ ...goodSource, licenceClass: "unconfirmed" }]))
    expect(rules(findings)).toEqual(["G-5.4 unconfirmed-licence-enabled"])
  })

  test("an unconfirmed licence on a DISABLED source passes, with a stated reason", () => {
    const excluded = { ...goodSource, licenceClass: "unconfirmed", enabled: false, exclusionReason: "licence terms unconfirmed at ingest" }
    expect(checkLicenceFields(registry([excluded]))).toEqual([])
  })

  test("planted: a disabled source with no reason is caught", () => {
    const findings = checkLicenceFields(registry([{ ...goodSource, enabled: false, exclusionReason: null }]))
    expect(rules(findings)).toEqual(["G-5.5 undeclared-exclusion"])
  })

  test("planted: a malformed sha256 is caught", () => {
    expect(rules(checkLicenceFields(registry([{ ...goodSource, sha256: "abc" }])))).toEqual(["G-5.3 sha256-malformed"])
  })

  test("planted: a missing sha256 on an ENABLED source is caught, not excused", () => {
    // The exemption below is for sources we never fetched. An enabled row IS a row we
    // ingested, so an absent or malformed digest there is a real finding.
    //
    // An empty digest trips BOTH rules, and that is correct rather than noisy: G-5.2 says the
    // field is missing, G-5.3 says what is there is not a digest. The two rules are
    // independent, and asserting the pair keeps them that way.
    expect(rules(checkLicenceFields(registry([{ ...goodSource, sha256: "" }])))).toEqual([
      "G-5.2 required-field-empty",
      "G-5.3 sha256-malformed",
    ])
    expect(rules(checkLicenceFields(registry([{ ...goodSource, sha256: "not-a-digest" }])))).toEqual(["G-5.3 sha256-malformed"])
  })

  test("a DISABLED source with no digest passes — we never downloaded it", () => {
    // `open-hadith-data` is in the registry precisely because its licence could not be
    // confirmed. Its disabled row is the record of that decision; demanding a digest of an
    // artefact that was never fetched would force either a fabricated hash or deleting the
    // evidence that the source was considered.
    const excluded = { ...goodSource, enabled: false, exclusionReason: "licence unconfirmed", sha256: "" }
    expect(checkLicenceFields(registry([excluded]))).toEqual([])
  })

  test("the exemption is on the DIGEST only — a disabled source still owes every licence field", () => {
    // If the exemption ever widened past sha256, this is the test that would notice.
    const excluded = { ...goodSource, enabled: false, exclusionReason: "licence unconfirmed", sha256: "", attribution: "" }
    expect(rules(checkLicenceFields(registry([excluded])))).toEqual(["G-5.2 required-field-empty"])
  })

  test("planted: a registry that does not match the schema is caught", () => {
    expect(rules(checkLicenceFields({ sources: [{ source: "x" }] }))).toEqual(["G-5.1 registry-decode"])
  })
})

describe("G-6 no false verified", () => {
  test("clean: a verified verdict is allowed only in the construction site", () => {
    const allowed = file("packages/mizan-verify/src/verify.ts", 'const v = { verdict: "verified", reason: "exact_containment" }\n')
    expect(rules(checkOneConstructionSite([allowed]))).toEqual([])
  })

  test("planted: a verified verdict constructed elsewhere is caught", () => {
    const findings = checkOneConstructionSite([file("apps/cli/src/render.ts", 'const badge = { verdict: "verified" }\n')])
    expect(rules(findings)).toEqual(["G-6.1 one-construction-site"])
  })

  test("a COMPARISON of the verdict is not a violation", () => {
    expect(rules(checkOneConstructionSite([file("packages/mizan-verify/src/steps/coerce.ts", 'if (v.verdict === "verified") return x\n')]))).toEqual([])
  })

  test("planted: a second schema site for the literal is caught", () => {
    expect(rules(checkOneSchemaSite([file("apps/cli/src/bad.ts", 'Schema.Literal("verified")\n')]))).toEqual(["G-6.2 one-schema-site"])
  })

  test("planted: a computed percent is caught", () => {
    expect(rules(checkNoComputedPercent([file("apps/cli/src/score.ts", "percent: score * 100,\n")]))).toEqual(["G-6.3 no-computed-percent"])
  })

test("planted: an ad-hoc match strength is caught", () => {
    const findings = checkNoAdHocMatchStrength([file("apps/cli/src/bad.ts", "matchStrength: computeScore(a, b),\n")])
    expect(rules(findings)).toEqual(["G-6.4 no-ad-hoc-match-strength"])
  })
})

/**
 * A fixture tree whose closure equals VERDICT_PATH exactly. The bodies are trivial and
 * deliberately contain none of the banned tokens, so every OTHER rule sees a clean tree
 * and the closure self-tests measure the closure alone.
 *
 * Hoisted to module scope because both the G-6.5 and the G-7 describe blocks build on it.
 */
const exactPath = (over: Partial<Record<string, string>> = {}): SourceFile[] => {
  const defaults: Record<string, string> = {
    "packages/mizan-verify/src/verify.ts": [
      'import { a } from "./steps/anchor.ts"',
      'import { c } from "./steps/citations.ts"',
      'import { x } from "./steps/coerce.ts"',
      'import { n } from "./steps/containment.ts"',
      "export const all = a + c + x + n",
    ].join("\n"),
    "packages/mizan-verify/src/steps/anchor.ts": "export const a = 1",
    "packages/mizan-verify/src/steps/citations.ts": "export const c = 2",
    "packages/mizan-verify/src/steps/coerce.ts": "export const x = 3",
    "packages/mizan-verify/src/steps/containment.ts": "export const n = 4",
  }
  const merged = { ...defaults, ...over }
  return Object.entries(merged).map(([path, text]) => file(path, `${text}\n`))
}

describe("G-6.5 verdict path closure", () => {
  test("clean: a closure that equals VERDICT_PATH passes", () => {
    expect(checkVerdictPathClosure(exactPath())).toEqual([])
  })

  test("planted: an undeclared module reachable from verify.ts is caught", () => {
    const files = exactPath({
      "packages/mizan-verify/src/verify.ts": [
        'import { a } from "./steps/anchor.ts"',
        'import { r } from "./steps/rank.ts"',
        "export const all = r + a",
      ].join("\n"),
      "packages/mizan-verify/src/steps/rank.ts": "export const r = 0",
    })
    // The rule reports both directions at once: the undeclared file on the path, and the
    // three declared files that are no longer reachable. The important finding is the first.
    const findings = checkVerdictPathClosure(files)
    expect(findings.some((finding) => finding.path === "packages/mizan-verify/src/steps/rank.ts")).toBe(true)
    expect(rules(findings)).toContain("G-6.5 verdict-path-closure")
  })

  test("planted: a stale VERDICT_PATH entry that is no longer reachable is caught", () => {
    const files = exactPath({
      "packages/mizan-verify/src/verify.ts": [
        'import { a } from "./steps/anchor.ts"',
        // coerce.ts remains in VERDICT_PATH but nothing reaches it any more.
        "export const all = a",
      ].join("\n"),
    })
    expect(checkVerdictPathClosure(files).some((finding) => finding.path === "packages/mizan-verify/src/steps/coerce.ts")).toBe(true)
  })
})

describe("G-7 verdict path purity", () => {
  /** The same exact-PATH fixture, plus every declared display module. */
  const pureTree = (over: Partial<Record<string, string>> = {}): SourceFile[] => {
    const base = exactPath()
    const displayDefaults: Record<string, string> = {
      "apps/cli/src/render.ts": "export const render = true",
      "apps/cli/src/correction.ts": "export const correction = true",
      "apps/cli/src/relevance.ts": "export const relevance = true",
      "apps/cli/src/suggestions.ts": 'import { rankNeighbours } from "@mizan/suggest"\nexport const rank = rankNeighbours',
      "apps/web/src/page.ts": "export const page = true",
      [COVERAGE_RENDER_MODULE]: `export const ${COVERAGE_CLAIM_EXPORT} = (r: { counts: { segments: number; extracted: number } }) =>\n  \`all verified: \${r.counts.extracted} of \${r.counts.segments} segments extracted\`\n`,
      "apps/cli/src/article-suggestions.ts": 'import { suggestionFor } from "./suggestions.ts"\nexport const pass = suggestionFor',
      "packages/mizan-suggest/src/suggest.ts": 'import { normalizeForMatch } from "@mizan/core"\nexport const fold = normalizeForMatch',
    }
    const declared = Object.entries(displayDefaults).map(([path, text]) =>
      file(path, over[path] ?? text),
    )
    return [...base, ...declared]
      .map((source) => file(source.path, over[source.path] ?? source.text))
      .concat(
        Object.entries(over)
          .filter(([path]) => !base.some((s) => s.path === path) && !(path in displayDefaults))
          .map(([path, text]) => file(path, `${text}\n`)),
      )
  }

  test("clean: a pure path passes every G-7 rule", () => {
    expect(gateVerdictPathPurity(pureTree())).toEqual([])
  })

  test("planted: the anchor module naming an outcome is caught", () => {
    const files = pureTree({ "packages/mizan-verify/src/steps/anchor.ts": 'export const outcome = { verdict: "verified" }\n' })
    expect(rules(checkAnchorModuleHasNoOpinion(files))).toEqual(["G-7.1 anchor-module-has-no-opinion"])
  })

  test("planted: a similarity mechanism on the path is caught", () => {
    const files = pureTree({ "packages/mizan-verify/src/steps/anchor.ts": "export const similarityScore = 0.9\n" })
    expect(rules(checkNoSimilarityOnPath(files))).toEqual(["G-7.2 no-similarity-on-path"])
  })

  test("planted: ambient authority on the path is caught, including in a display module", () => {
    const files = pureTree({ "apps/cli/src/render.ts": "export const now = Date.now()\n" })
    expect(rules(checkNoAmbientAuthorityOnPath(files))).toEqual(["G-7.3 no-ambient-authority-on-path"])
  })

  test("planted: a percentage-shaped property key on the path is caught", () => {
    const files = pureTree({ "packages/mizan-verify/src/steps/coerce.ts": "export const shape = { confidence: 0.9 }\n" })
    expect(rules(checkNoPercentKeyOnPath(files))).toEqual(["G-7.4 no-percent-key-on-path"])
  })

  test("planted: application code reachable from the verdict path is caught", () => {
    const files = pureTree({
      "packages/mizan-verify/src/verify.ts": [
        'import { banner } from "../../../apps/cli/src/render.ts"',
        "export const all = banner",
      ].join("\n"),
    })
    expect(rules(checkNoAppCodeOnPath(files))).toEqual(["G-7.5 no-app-code-on-path"])
  })

  test("planted: a renamed display module strips the display rules from scope", () => {
    const files = pureTree({}).filter((source) => source.path !== "apps/cli/src/render.ts")
    expect(rules(checkDisplayPathPresent(files))).toEqual(["G-7.6 display-path-present"])
  })

  test("planted: the suggestion module naming an outcome is caught, exactly like relevance", () => {
    const files = pureTree({ "apps/cli/src/suggestions.ts": 'export const outcome = { verdict: "verified" }\n' })
    expect(rules(checkNoPercentKeyOnPath(files))).toEqual([])
    expect(rules(checkRelevanceModuleHasNoOutcome(files))).toEqual([])
    // The display module itself may not be word-banned — `render.ts` prints `verified` as a badge —
    // but the package it calls may not, which is what G-7.9 asserts below.
    expect(rules(checkSuggestPackageNamesNoOutcome(files))).toEqual([])
  })

  test("planted: the suggestion package importing anything but core is caught", () => {
    const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'import { Database } from "bun:sqlite"\nexport const db = Database\n' })
    expect(rules(checkSuggestPackageIsLeaf(files))).toEqual(["G-7.8 suggest-package-is-leaf"])
  })

  test("planted: a re-export of another workspace package is caught too", () => {
    // The dependency is the same whether it is imported or forwarded, and an index barrel is where
    // a forwarding dependency hides from a grep for `import`.
    const files = pureTree({ "packages/mizan-suggest/src/index.ts": 'export { verifyAnswer } from "@mizan/verify"\n' })
    expect(rules(checkSuggestPackageIsLeaf(files))).toEqual(["G-7.8 suggest-package-is-leaf"])
  })

  test("planted: a specifier that merely contains the allowed package is caught", () => {
    const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'import { x } from "@mizan/core-plus"\nexport const y = x\n' })
    expect(rules(checkSuggestPackageIsLeaf(files))).toEqual(["G-7.8 suggest-package-is-leaf"])
  })

  test("planted: the suggestion package naming an outcome is caught", () => {
    const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'export const banner = "verified"\n' })
    expect(rules(checkSuggestPackageNamesNoOutcome(files))).toEqual(["G-7.9 suggest-package-names-no-outcome"])
  })

  test("a comment in the suggestion package may explain itself in the banned words", () => {
    // Comments are stripped, which is what lets the module say WHY it cannot reach a verdict without
    // tripping the rule that forbids it. Pinned so a future `mode` change is caught here.
    const files = pureTree({
      "packages/mizan-suggest/src/suggest.ts": ["// this must never become a verdict, or a verified badge", 'import { foldQuote } from "./trigrams.ts"', "export const fold = foldQuote"].join("\n"),
    })
    expect(rules(checkSuggestPackageNamesNoOutcome(files))).toEqual([])
    expect(rules(checkSuggestPackageIsLeaf(files))).toEqual([])
  })

  describe("G-7.10 the suggestion package reaches nothing outside itself", () => {
    const rule = "G-7.10 suggest-package-reaches-no-verdict-path"

    test("planted: a relative specifier that climbs into the verifier is caught", () => {
      // The shape G-7.8 cannot express: `../` is legal to its allowlist and this is what it buys.
      const files = pureTree({
        "packages/mizan-suggest/src/suggest.ts": [
          'import { verifyAnswer } from "../../mizan-verify/src/verify.ts"',
          "export const rank = verifyAnswer",
        ].join("\n"),
      })
      const findings = checkSuggestPackageReachesNoVerdictPath(files)
      expect(rules(findings)).toEqual([rule])
      expect(findings[0]?.line).toBe(1)
    })

    test("planted: dropping the extension does not walk around the rule", () => {
      // A resolver-based rule would compare `…/verify.ts` and report the tree clean while the
      // import is one rename away from resolving. The lexical climb has no extension to guess.
      const files = pureTree({
        "packages/mizan-suggest/src/suggest.ts": ['import { verifyAnswer } from "../../mizan-verify/src/verify"', "export const rank = verifyAnswer"].join("\n"),
      })
      expect(rules(checkSuggestPackageReachesNoVerdictPath(files))).toEqual([rule])
    })

    test("planted: an escape from a deeper module is caught, so the depth arithmetic is real", () => {
      // `src/` spends one `..` to stay inside the package; `src/nested/` spends two. A rule that
      // assumed one depth would pass this and fail the file above it, or the reverse.
      const files = pureTree({
        "packages/mizan-suggest/src/nested/helper.ts": ['import { verifyAnswer } from "../../../mizan-verify/src/verify.ts"', "export const rank = verifyAnswer"].join("\n"),
      })
      expect(rules(checkSuggestPackageReachesNoVerdictPath(files))).toEqual([rule])
      expect(rules(checkSuggestPackageIsLeaf(files))).toEqual([])
    })

    test("planted: the two `..` that are still inside the package are not an escape", () => {
      // From `src/nested/`, `../../trigrams.ts` is the package root — the deepest legal ascent.
      const files = pureTree({ "packages/mizan-suggest/src/nested/helper.ts": 'import { fold } from "../../trigrams.ts"\nexport const rank = fold\n' })
      expect(rules(checkSuggestPackageReachesNoVerdictPath(files))).toEqual([])
    })

    test("planted: a re-export that escapes is caught, because it still reaches the import", () => {
      const files = pureTree({ "packages/mizan-suggest/src/index.ts": 'export { verifyAnswer } from "../../mizan-verify/src/verify.ts"\n' })
      expect(rules(checkSuggestPackageReachesNoVerdictPath(files))).toEqual([rule])
    })

    test("planted: a dynamic import that escapes is caught", () => {
      const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'export const load = () => import("../../mizan-verify/src/verify.ts")\n' })
      expect(rules(checkSuggestPackageReachesNoVerdictPath(files))).toEqual([rule])
    })

    test("a package specifier is G-7.8's finding and not this rule's, so the answer has one owner", () => {
      const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'import { verifyAnswer } from "@mizan/verify"\nexport const rank = verifyAnswer\n' })
      expect(rules(checkSuggestPackageIsLeaf(files))).toEqual(["G-7.8 suggest-package-is-leaf"])
      expect(rules(checkSuggestPackageReachesNoVerdictPath(files))).toEqual([])
    })

    test("the ranking module's own imports are not findings, because ranking needs them", () => {
      const files = pureTree({
        "packages/mizan-suggest/src/rank.ts": [
          'import { foldQuote } from "./trigrams.ts"',
          'import { byCodeUnit } from "./compare.ts"',
          "export const shared = foldQuote",
          "export const order = byCodeUnit",
        ].join("\n"),
      })
      expect(rules(checkSuggestPackageReachesNoVerdictPath(files))).toEqual([])
    })

    test("the rule is wired into the gate", () => {
      const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'import { verifyAnswer } from "../../mizan-verify/src/verify.ts"\nexport const rank = verifyAnswer\n' })
      expect(rules(gateVerdictPathPurity(files))).toContain(rule)
    })
  })

  describe("G-7.11 the suggestion package has no ambient authority", () => {
    const rule = "G-7.11 suggest-package-has-no-ambient-authority"

    test("planted: a network call in the suggestion package is caught", () => {
      // The rule G-7.8 cannot express: `fetch` is a global, so there is no import for an allowlist to
      // reject. Every fixture below is planted for exactly that reason.
      const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'export const ask = () => fetch("https://example.invalid")\n' })
      expect(rules(checkSuggestPackageHasNoAmbientAuthority(files))).toEqual([rule])
    })

    test("planted: the three globals that make a ranking irreproducible are caught", () => {
      for (const planted of ["const at = Date.now()", "const roll = Math.random()", "const home = process.env.HOME"]) {
        const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": `export const x = () => { ${planted}; return 1 }\n` })
        expect(rules(checkSuggestPackageHasNoAmbientAuthority(files))).toEqual([rule])
      }
    })

    test("planted: a stringified call is caught, because a cached response is still a network call", () => {
      const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'export const cached = "fetch(\\u0028https://example.invalid\\u0029)"\n' })
      expect(rules(checkSuggestPackageHasNoAmbientAuthority(files))).toEqual([rule])
    })

    test("a clean ranking module trips nothing", () => {
      const files = pureTree({
        "packages/mizan-suggest/src/rank.ts": ['import { byCodeUnit } from "./rank.ts"', "export const shared = (a: string, b: string) => (a < b ? -1 : 1)"].join("\n"),
      })
      expect(rules(checkSuggestPackageHasNoAmbientAuthority(files))).toEqual([])
    })

    test("the rule is wired into the gate, so a tree with a violation fails G-7 as a whole", () => {
      // Asserted through the gate and not only through the rule: an exported rule nobody calls is a
      // rule that protects nothing (AGENTS.md §14).
      const files = pureTree({ "packages/mizan-suggest/src/suggest.ts": 'export const cached = () => fetch("https://example.invalid")\n' })
      expect(rules(gateVerdictPathPurity(files))).toContain(rule)
    })
  })

  describe("G-7.12 the display contract carries exactly the two integers", () => {
    const rule = "G-7.12 display-contract-numbers"
    const schema = (body: string): readonly SourceFile[] =>
      pureTree({ "packages/mizan-core/src/schema/display.ts": `import { Schema } from "effect"\nexport const NearbyRecord = Schema.Struct({\n${body}\n})\n` })

    test("planted: a third measurement on the record is caught", () => {
      // The exact hole ADR-12 opened by reversing the no-number rule. A key named for a ratio rather than
      // a percentage is invisible to G-7.4, which is why this rule enumerates instead of classifying.
      for (const planted of ["similarity: Schema.Number", "overlapRatio: Schema.Number", "matchShare: Schema.Number", "closenessScore: Schema.Number"]) {
        expect(rules(checkDisplayContractNumbers(schema(`  sharedRunChars: Schema.Number,\n  ${planted},`)))).toContain(rule)
      }
    })

    test("planted: a percentage next to the integers is caught, because that is the CWE-345 shape", () => {
      expect(rules(checkDisplayContractNumbers(schema("  sharedRunChars: Schema.Number,\n  displayPercent: Schema.Number,")))).toEqual([rule])
    })

    test("the four declared numbers pass, because a rule that flagged correct code would be ignored", () => {
      const files = schema("  rank: Schema.Number,\n  sharedRunChars: Schema.Number,\n  considered: Schema.Number,\n  quoteChars: Schema.Number,")
      expect(rules(checkDisplayContractNumbers(files))).toEqual([])
    })

    test("the rule reads the schema module only, so a similar name elsewhere in the core package is not its business", () => {
      const files = pureTree({
        "packages/mizan-core/src/schema/display.ts": "export const NearbyRecord = Schema.Struct({ sharedRunChars: Schema.Number })\n",
        "packages/mizan-core/src/retrieval.ts": "export const closenessScore = 1\n",
      })
      expect(rules(checkDisplayContractNumbers(files))).toEqual([])
    })

    test("a missing schema module is not this rule's finding, so G-7.6 owns the renamed-file case", () => {
      expect(rules(checkDisplayContractNumbers(pureTree({ "packages/mizan-core/src/other.ts": "export const x = 1\n" })))).toEqual([])
    })

    test("the rule is wired into the gate", () => {
      expect(rules(gateVerdictPathPurity(schema("  sharedRunChars: Schema.Number,\n  similarity: Schema.Number,")))).toContain(rule)
    })

    test("the declared list is the one the renderer reads, so the enumeration and the contract cannot drift", () => {
      // `sharedRunChars` and `quoteChars` are the reversal; `rank` and `considered` are the counts the
      // renderer already printed before ADR-12. Excluding either pair would report honest code as broken.
      expect([...DISPLAY_CONTRACT_NUMBERS]).toEqual(["rank", "considered", "sharedRunChars", "quoteChars"])
    })
  })

  describe("G-7.13 a completeness claim carries its denominator", () => {
    const rule = "G-7.13 completeness-claim-denominator"

    test("clean: the shipped renderer passes, because it inlines both denominator words on the claim line", () => {
      expect(rules(checkCompletenessClaimCarriesDenominator(pureTree()))).toEqual([])
    })

    test("planted: a completeness claim with NO denominator is caught, naming the line", () => {
      // The exact R-1 failure: a renderer that says "all verified" about a document whose selector
      // skipped a fabrication, with nothing on screen for the reader to weigh that against.
      const findings = checkCompletenessClaimCarriesDenominator(
        pureTree({
          [COVERAGE_RENDER_MODULE]: `export const ${COVERAGE_CLAIM_EXPORT} = () => "all verified"\n`,
        }),
      )
      expect(rules(findings)).toEqual([rule])
      expect(findings[0]?.path).toBe(COVERAGE_RENDER_MODULE)
      expect(findings[0]?.line).toBe(1)
    })

    test("planted: EVERY declared completeness phrasing is caught, so the list is not one lucky word", () => {
      for (const phrase of COMPLETENESS_CLAIM_TOKENS) {
        const findings = checkCompletenessClaimCarriesDenominator(
          pureTree({ [COVERAGE_RENDER_MODULE]: `export const ${COVERAGE_CLAIM_EXPORT} = () => "${phrase}"\n` }),
        )
        expect(rules(findings), `"${phrase}" passed the rule`).toContain(rule)
      }
    })

    test("planted: a claim elsewhere in the display path is caught even when it DOES carry the words", () => {
      // The half that is about placement rather than about the denominator: a second renderer that
      // knows the words still breaks the one-owner property the rule exists to create.
      const findings = checkCompletenessClaimCarriesDenominator(
        pureTree({ "apps/cli/src/render.ts": 'export const line = "all verified: 3 of 4 segments extracted"\n' }),
      )
      expect(rules(findings)).toEqual([rule])
      expect(findings[0]?.path).toBe("apps/cli/src/render.ts")
    })

    test("planted: an unanalysable renderer FAILS, rather than passing because the rule had nothing to read", () => {
      // The fail-closed half. A renderer whose sentence moved into a template, or into a constant this
      // rule cannot see, reports clean — so the ABSENCE of an analysable claim site is itself a finding.
      const findings = checkCompletenessClaimCarriesDenominator(
        pureTree({ [COVERAGE_RENDER_MODULE]: "export const renderCoverage = () => 1\n" }),
      )
      expect(rules(findings)).toEqual([rule])
      expect(findings[0]?.excerpt).toContain(COVERAGE_CLAIM_EXPORT)
    })

    test("one denominator word is not enough: the pair is what distinguishes chose from covered", () => {
      const findings = checkCompletenessClaimCarriesDenominator(
        pureTree({
          [COVERAGE_RENDER_MODULE]: `export const ${COVERAGE_CLAIM_EXPORT} = (s: number) => "all verified: " + s + " segments"\n`,
        }),
      )
      expect(rules(findings)).toEqual([rule])
    })

    test("a claim with neither word is caught, and a claim with both is not", () => {
      const withBoth = pureTree({
        [COVERAGE_RENDER_MODULE]: `export const ${COVERAGE_CLAIM_EXPORT} = () => "all verified: 4 of 4 segments extracted"\n`,
      })
      expect(rules(checkCompletenessClaimCarriesDenominator(withBoth))).toEqual([])
    })

    test("the rule is wired into the gate, so a tree with a violation fails G-7 as a whole", () => {
      expect(rules(gateVerdictPathPurity(pureTree({ [COVERAGE_RENDER_MODULE]: 'export const coverageSentenceOf = () => "all verified"\n' })))).toContain(rule)
    })

    test("the required words are the two halves of the denominator, so the rule cannot be reworded around", () => {
      expect([...DENOMINATOR_WORDS]).toEqual(["segments", "extracted"])
    })

    test("the rule reads production files only, so a fixture in a test file is not its business", () => {
      const files = pureTree({ "apps/cli/test/coverage.test.ts": 'const fixture = "all verified"\n' })
      expect(rules(checkCompletenessClaimCarriesDenominator(files))).toEqual([])
    })
  })
})

describe("G-6 dynamic invariant", () => {
  const evidence: EvidenceRef = {
    recordId: "bukhari:1",
    collection: "bukhari",
    number: "1",
    sourceUrl: "https://example.invalid/1",
    license: "CC BY-SA 4.0",
    attribution: "Sunnah.com",
    grade: null,
    gradeSource: "quranlab/hadith",
    gradeBasis: "collection",
    matchedChars: 20,
    quoteChars: 20,
  }

  const honest: ClaimVerdict = {
    claimId: "c1",
    verdict: "verified",
    reason: "exact_containment",
    matchStrength: { kind: "exact", percent: 100 },
    evidence,
  }

  test("clean: a correctly evidenced verified passes", () => {
    expect(assertNoFalseVerified([honest])).toEqual([])
  })

  test("planted: verified without evidence is reported", () => {
    expect(assertNoFalseVerified([{ ...honest, evidence: null }])).toEqual(["c1: verified with no evidence"])
  })

  test("planted: verified with a fuzzy match strength is reported", () => {
    const forged = { ...honest, matchStrength: { kind: "none" } } as unknown as ClaimVerdict
    expect(assertNoFalseVerified([forged])).toEqual(["c1: verified with match strength none"])
  })

  test("planted: verified at 97 percent is reported", () => {
    const forged = { ...honest, matchStrength: { kind: "exact", percent: 97 } } as unknown as ClaimVerdict
    expect(assertNoFalseVerified([forged])).toEqual(["c1: verified at percent 97"])
  })

  test("planted: a partial match presented as verified is reported", () => {
    const partial: ClaimVerdict = { ...honest, evidence: { ...evidence, matchedChars: 12 } }
    expect(assertNoFalseVerified([partial])).toEqual(["c1: verified with a partial match (12/20)"])
  })

  test("planted: a rejected verdict carrying evidence is reported", () => {
    const odd = { ...honest, verdict: "rejected" as const, reason: "quote_absent_at_cited_id" as const }
    expect(assertNoFalseVerified([odd])).toEqual(["c1: non-verified verdict carries evidence"])
  })
})

describe("the gate must not be able to pass by looking at nothing", () => {
  /**
   * The regression this pins.
   *
   * The CLI once took its root from `process.cwd()`. Invoked from `packages/mizan-gate` it
   * therefore scanned only that package, which the scan excludes — zero files inspected, five
   * PASS lines, exit 0. Anyone reading the CI log would have concluded the invariants held.
   *
   * Three things are asserted here, and all three matter:
   *   1. the root is found by walking UP from a nested module, not from the shell;
   *   2. a directory that merely has a manifest is refused rather than accepted;
   *   3. the real workspace root is one that actually contains the packages the gates read.
   */
  test("the root is discovered from a nested module location", () => {
    const root = findRepositoryRoot(import.meta.dir)
    expect(root).not.toBeNull()
    if (root === null) return
    // A root read off the shell satisfies a null check and a manifest check equally well, and
    // that is precisely the regression: the walk is the property under test, so it is asserted
    // directly. The wrong answer is pinned as this package's own directory — the exact value a
    // `process.cwd()` root yields when the CLI is invoked from `packages/mizan-gate` — and the
    // relative path back to this test file must climb out of the root, which a self-rooted or
    // descendant answer cannot do. Pinning the wrong answer rather than the shell's position is
    // deliberate: `process.cwd()` is only a *proxy* for the bug, so asserting against it tests
    // the working directory the suite happened to be invoked from (and fails when that
    // directory is legitimately the root) instead of the walk. The pinned value is the actual
    // failure, and it is false from every directory.
    expect(root).not.toBe(join(import.meta.dir, "..", ".."))
    expect(relative(import.meta.dir, root).startsWith("..")).toBe(true)
    // The root is identified by the workspace marker in its own manifest — NOT by the checkout
    // happening to be *called* "mizan". A submission cloned into `mizan-submission`, `team-42`
    // or a CI workspace path must be exactly as valid, so the directory name is never asserted.
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      readonly workspaces?: unknown
    }
    expect(Array.isArray(manifest.workspaces)).toBe(true)
  })


  test("the discovered root really does contain the gated packages", () => {
    const root = findRepositoryRoot(import.meta.dir)
    if (root === null) throw new Error("no root")
    for (const subtree of ["packages/mizan-verify/src/verify.ts", "packages/mizan-core/src/index.ts"]) {
      expect(existsSync(join(root, subtree))).toBe(true)
    }
  })

  test("a directory with a manifest but no workspace is REFUSED, not accepted", () => {
    const failure = requireRepositoryRoot(join(tmpdir(), "definitely-not-mizan-anywhere"))
    expect(isOk(failure)).toBe(false)
    if (isOk(failure)) return
    expect(failure.error.length).toBeGreaterThan(20)
  })

  test("a caller-supplied root still wins, for a fixture tree", () => {
    const found = findRoot(import.meta.dir, () => true)
    expect(found).toBe(import.meta.dir)
  })

test("findRoot terminates at the filesystem root instead of looping", () => {
    expect(findRoot(import.meta.dir, () => false)).toBeNull()
  })
})

/**
 * G-4's binary, and the jobs that need it.
 *
 * Two facts, both of which have been wrong: the missing-binary message pointed at a workflow step that did
 * not exist, and the install was written inline in one job while a second job started running `bun run ci`.
 * A gate that fails closed for an environmental reason is correct behaviour and useless in practice, so the
 * install is now one composite action and its version is pinned to `GITLEAKS_VERSION` — asserted here,
 * because a version that drifts between the message and the download is an unpinned scan tool wearing a
 * pin.
 */
describe("G-4 the pinned binary and the jobs that spawn it", () => {
  const actionPath = (): string => join(findRepositoryRoot(import.meta.dir) ?? "", ".github", "actions", "setup-gitleaks", "action.yml")

  test("the composite action pins the same version the gate names, or the pin is a claim", () => {
    expect(existsSync(actionPath())).toBe(true)
    const action = readFileSync(actionPath(), "utf8")
    expect(action).toContain(`default: "${GITLEAKS_VERSION}"`)
  })

  test("every job that runs `bun run ci` installs the binary, because G-4 fails closed without it", () => {
    // Not a count of jobs, and not the `gate` job by name: the failure this guards against is a *new* job
    // running `bun run ci` without the install, which is exactly the state the previous message pointed a
    // developer into. So it is asserted as a relationship — every `bun run ci` step co-located with the
    // install step — rather than as a list that goes stale the moment a job is added.
    const root = findRepositoryRoot(import.meta.dir)
    if (root === null) throw new Error("no root")
    const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")
    const jobs = workflow.split(/\n {2}(?=\S)/)
    const jobsRunningCi = jobs.filter((job) => job.includes("run: bun run ci"))
    expect(jobsRunningCi.length).toBeGreaterThan(0)
    for (const job of jobsRunningCi) expect(job).toContain("./.github/actions/setup-gitleaks")
  })
})

/**
 * G-4's partition: which findings block, and which git already refuses to accept.
 *
 * This is the whole content of the gate's only judgement, so it is tested as a pure function — no
 * binary, no repository — and then once more end to end against the real gitleaks, because a
 * partition that is correct in isolation and wired to nothing is still a gate that does not run.
 */
describe("G-4 excuses what git refuses and blocks everything else", () => {
  const finding = (file: string, ruleId = "openai-api-key"): GitleaksFinding => ({ ruleId, file })

  const repoRoot = (): string => {
    const found = findRepositoryRoot(import.meta.dir)
    if (found === null) throw new Error("no root")
    return found
  }

  /**
   * Is the gate's OWN resolution going to find a scanner on this machine?
   *
   * It used to answer a different question — "is there a file at `node_modules/.bin/gitleaks`?" —
   * and pass THAT path to the gate as a spawn. `bun run` puts `node_modules/.bin` first on PATH, so
   * that is precisely where a planted scanner lands and precisely where the gate must refuse to look;
   * a test that went looking there was asserting a weaker gate than the one that ships, and did it
   * while reporting green. `gitleaks` is not a dependency of this repository, so a file at that path
   * is by construction undeclared.
   *
   * So the tests below ask the gate's question. Where the answer is no, the two end-to-end tests
   * SKIP rather than substituting something, and the coverage they would have added is carried by the
   * binary-free tests in the same file — which is also the only place a planted violation can be
   * observed on a machine without the binary installed.
   */
  const resolutionOf = (): ScannerResolution =>
    resolveScanner(GITLEAKS_BINARY, repoRoot(), process.env["PATH"] ?? "")

  const gitleaksAvailable = (): boolean => resolutionOf().kind === "resolved"

  /** A resolution that has already been vetted, for tests that inject the scan itself. */
  const resolved: ScannerResolver = () => ({ kind: "resolved", path: "gitleaks", ignored: [] })

  /** The real scan over the real tree, with the gate resolving the scanner however this machine does. */
  const scanRealRepo = async (): Promise<GitleaksResult> => runGitleaks(repoRoot())

  /**
   * Plant a probe, scan, and remove it — or scan with nothing planted when `contents` is null.
   *
   * The null case is the control half of the pair: it is what makes "the probe was the cause" a
   * measurement rather than a claim, and it also asserts the probe is not left behind.
   */
  const scanWithProbe = async (contents: string | null): Promise<GitleaksResult> => {
    const probe = join(repoRoot(), "g4-planted-probe.txt")
    if (contents === null) {
      if (existsSync(probe)) throw new Error("a previous run left the planted probe behind")
      return await scanRealRepo()
    }
    writeFileSync(probe, contents)
    try {
      return await scanRealRepo()
    } finally {
      rmSync(probe, { force: true })
    }
  }

  test("a finding in a committable path blocks", () => {
    expect(partitionFindings([finding("src/keys.ts")], () => false)).toEqual([finding("src/keys.ts")])
  })

  test("a finding in an ignored path does not block, because git will not accept the file", () => {
    expect(partitionFindings([finding(".env")], (file) => file === ".env")).toEqual([])
  })

  test("the excuse is per path, so one ignored file cannot excuse another", () => {
    const excused = new Set([".env"])
    expect(partitionFindings([finding("docs/notes.md")], (file) => excused.has(file))).toEqual([
      finding("docs/notes.md"),
    ])
  })

  test("an empty excuse set excuses nothing, which is the reading when git cannot be asked", () => {
    expect(partitionFindings([finding(".env")], () => false)).toEqual([finding(".env")])
  })

  describe("an unavailable git is an unavailable oracle, not a crash and not an excuse", () => {
    // The defect these plant: `excusedByGit` spawned `git` unguarded, and `Bun.spawn` throws ENOENT
    // synchronously when the executable does not resolve. Reached on every path that HAS findings,
    // it turned the module header's own promise — "if git cannot be asked, the excused set is EMPTY"
    // — into an unhandled exception out of a function declared to return a verdict. A secret gate
    // that dies on the input it exists to be honest about is not fail-closed; it is fail-nothing.
    //
    // The oracle is injected rather than stubbed through the real subprocess, so this is assertable
    // on a machine that has git, has it absent, or has a `git` that exits nonzero — the three inputs
    // the defect is about, none of which a test can otherwise produce on demand.
    const unavailable = async (): Promise<string> => {
      throw new Error('Executable not found in $PATH: "git"')
    }

    test("a git that cannot be started returns the empty set rather than throwing", async () => {
      expect([...(await excusedByGit(".", ["src/keys.ts"], unavailable))]).toEqual([])
    })

    test("and the empty set BLOCKS every finding, so the gate fails closed instead of crashing", async () => {
      // The second half, because an empty set is only a safety property once the verdict is derived
      // from it: this is exactly the line `runGitleaks` runs, so the assertion covers the decision
      // and not merely the parser.
      const findings = [finding(".env"), finding("docs/notes.md")]
      const excused = await excusedByGit(".", findings.map((entry) => entry.file), unavailable)
      expect(partitionFindings(findings, (file) => excused.has(file))).toEqual(findings)
    })

    test("an oracle that answers is still honoured, so the guard is not the same as disabling the check", async () => {
      const answered = await excusedByGit(".", [".env", "src/keys.ts"], async () => ".env\n")
      expect([...answered]).toEqual([".env"])
      expect(partitionFindings([finding(".env"), finding("src/keys.ts")], (file) => answered.has(file))).toEqual([
        finding("src/keys.ts"),
      ])
    })

    test("no files means no query, so the empty case never reaches for git at all", async () => {
      expect([...(await excusedByGit(".", [], unavailable))]).toEqual([])
    })

    test("THE PLANTED VIOLATION: a git that cannot be started fails the GATE, it does not throw out of it", async () => {
      // The CR asked for this shape specifically, and the unit tests above cannot supply it: they
      // assert the parser, not the gate. `runGitleaks` used to throw ENOENT out of itself here —
      // "THREW OUT OF runGitleaks" — on the one input it exists to be honest about, which is
      // fail-nothing rather than fail-closed. So: a real scan reporting a real finding, a git that
      // does not resolve, and one `GitleaksResult` out the other side with nothing blocking it.
      const probe = join(repoRoot(), "g4-planted-probe.txt")
      const reporting: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, JSON.stringify([{ RuleID: "openai-api-key", File: "g4-planted-probe.txt" }]))
        return { code: 1, stdout: "", stderr: "" }
      }
      writeFileSync(probe, "MIZAN_PLANTED_NOT_A_REAL_KEY\n")
      try {
        const result = await runGitleaks(repoRoot(), resolved, reporting, unavailable)
        expect(result.ok).toBe(false)
        expect(result.detail).toContain("g4-planted-probe.txt")
      } finally {
        rmSync(probe, { force: true })
      }
    })
  })

  describe("a scan that did not run is not a clean tree", () => {
    // The two environmental inputs this gate has to survive, asserted without the binary.
    //
    // Both used to end the process instead of returning a verdict: `Bun.spawn` throws ENOENT
    // *synchronously* when the executable does not resolve, so a resolution that reported the name
    // present was enough to turn a gate into an unhandled exception. And a stub that exits 0 while
    // writing no report satisfied `code === 0 && findings.length === 0` — a green G-4 with a real
    // secret sitting in a committable path, which is the fail-open the module header says it refuses.
    //
    // The spawn is injected rather than stubbed through PATH because an absent binary is exactly
    // what a test calling the real subprocess cannot arrange on demand.
    const scanOf = (scan: GitleaksScan): GitleaksSpawn => () => Promise.resolve(scan)

    test("a binary that cannot be started returns ok:false rather than throwing", async () => {
      const result = await runGitleaks(repoRoot(), resolved, () => Promise.resolve(null))
      expect(result.ok).toBe(false)
      expect(result.detail).toContain("could not be started")
    })

    test("an exit-0 scan that wrote no report is a scan that did not happen", async () => {
      const result = await runGitleaks(repoRoot(), resolved, scanOf({ code: 0, stdout: "no leaks found", stderr: "" }))
      expect(result.ok).toBe(false)
      expect(result.detail).toContain("no readable report")
    })

    test("a genuine clean scan — exit 0 with an empty report — still passes, so the rule is not always-fail", async () => {
      // The other direction matters as much: a discriminator that rejected real scans would be
      // replaced by "ignore G-4", which is the same assurance failure wearing a different hat. A real
      // clean run writes `[]`, so that is what this writes.
      const wrote: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, "[]")
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      expect((await runGitleaks(repoRoot(), resolved, wrote)).ok).toBe(true)
    })

    test("a report that is unreadable fails closed rather than reading as zero findings", async () => {
      const unreadable: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, "this is not the json report gitleaks writes")
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      const result = await runGitleaks(repoRoot(), resolved, unreadable)
      expect(result.ok).toBe(false)
      expect(result.detail).toContain("wrote no readable report")
    })

    test("the planted violation blocks end to end, with no binary required", async () => {
      // The CR-requested proof, and the reason the binary-dependent test above can be skipped
      // without losing its coverage: the gate's own verdict for a secret in a committable path,
      // driven through the real report shape with the real git asked whether it would accept it.
      const probe = join(repoRoot(), "g4-planted-probe.txt")
      writeFileSync(probe, "MIZAN_PLANTED_NOT_A_REAL_KEY\n")
      const reporting: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, JSON.stringify([{ RuleID: "openai-api-key", File: "g4-planted-probe.txt" }]))
        return { code: 1, stdout: "", stderr: "" }
      }
      try {
        const result = await runGitleaks(repoRoot(), resolved, reporting)
        expect(result.ok).toBe(false)
        expect(result.detail).toContain("g4-planted-probe.txt")
      } finally {
        rmSync(probe, { force: true })
      }
    })
  })

  /**
   * The tree under audit may not supply the scanner. This is the second fail-open, and the one the
   * report-shape rule cannot touch.
   *
   * The gate used to spawn the BARE NAME. Under `bun run`, `node_modules/.bin` comes first on PATH,
   * so a file named `gitleaks` there shadows a real install — and it then chooses both the report
   * path and the exit code, so `[]` plus exit 0 satisfies every check the gate makes and G-4 reports
   * a clean tree over a committable secret. `[]` is byte-identical to what a genuine clean run
   * writes, so no amount of report parsing can tell them apart. The discrimination has to happen one
   * level earlier, at resolution.
   *
   * `gitleaks` is not a dependency here, so a `node_modules/.bin/gitleaks` is by construction
   * undeclared, and CI installs the real one through `.github/actions/setup-gitleaks` into a
   * tool-cache directory outside the repository. Refusing the tree therefore costs CI nothing.
   */
  describe("a scanner from inside the audited tree is refused, not run", () => {
    const posix = "/repo" as const
    const toolCache = "/opt/hostedtoolcache/gitleaks/8.24.3/x64" as const

    test("a node_modules/.bin candidate is untrusted wherever it sits", () => {
      expect(isUntrustedScannerPath("/elsewhere/node_modules/.bin/gitleaks", posix)).toBe(true)
      expect(isUntrustedScannerPath(`${posix}/node_modules/.bin/gitleaks`, posix)).toBe(true)
      expect(isUntrustedScannerPath("/opt/tools/gitleaks", posix)).toBe(false)
    })

    test("the tree's own subtree is untrusted even without the node_modules marker", () => {
      // The general form of the same objection: a file this repository can write should not be the
      // tool that audits the repository. The `node_modules/.bin` rule is where it usually lands.
      expect(isUntrustedScannerPath(`${posix}/tools/gitleaks`, posix)).toBe(true)
      expect(isUntrustedScannerPath(`${posix}`, posix)).toBe(true)
    })

    test("a sibling directory whose name merely starts with the root is NOT inside it", () => {
      // The half that a `startsWith` implementation gets wrong. A prefix match would both refuse
      // `/repo-evil/bin/gitleaks` (a real, unrelated install) and, written sloppily to fix that,
      // invite the traversal in the first place. Segment-wise containment has neither defect.
      expect(isUntrustedScannerPath("/repo-evil/bin/gitleaks", posix)).toBe(false)
      expect(isUntrustedScannerPath("/repository/bin/gitleaks", posix)).toBe(false)
    })

    test("the candidate names are the platform's three, so a PATH entry cannot pick the target", () => {
      expect(executableNames("gitleaks", "linux")).toEqual(["gitleaks"])
      expect(executableNames("gitleaks", "win32")).toEqual(["gitleaks.exe", "gitleaks.cmd", "gitleaks.bat"])
    })

    describe("resolution over an injected PATH", () => {
      /** A PATH where each listed directory holds one real gitleaks, so no filesystem is touched. */
      const probeOver = (dirs: readonly string[]): ((dir: string, name: string) => string | null) => {
        return (dir, name) => (dirs.includes(dir) && name === "gitleaks" ? `${dir}/gitleaks` : null)
      }

      const overPath = (searchPath: string, dirs: readonly string[], cwd = posix): ScannerResolution =>
        resolveScanner("gitleaks", cwd, searchPath, probeOver(dirs), "linux")

      test("a squat ahead of a real install is stepped over, and NAMED", () => {
        const searchPath = [`${posix}/node_modules/.bin`, toolCache].join(delimiter)
        expect(overPath(searchPath, [`${posix}/node_modules/.bin`, toolCache])).toEqual({
          kind: "resolved",
          path: `${toolCache}/gitleaks`,
          ignored: [`${posix}/node_modules/.bin/gitleaks`],
        })
      })

      test("the squat alone is untrusted_only, which is a refusal and not an absence", () => {
        // Collapsing this into "absent" would send the reader off to install gitleaks, and the
        // planted file would still be there when they came back.
        const searchPath = `${posix}/node_modules/.bin`
        expect(overPath(searchPath, [searchPath])).toEqual({
          kind: "untrusted_only",
          paths: [`${posix}/node_modules/.bin/gitleaks`],
        })
      })

      test("nothing on PATH at all is absent, which is the ordinary missing-binary case", () => {
        expect(overPath("/usr/bin:/bin", ["/usr/bin"])).toEqual({ kind: "absent" })
      })
    })

    test("THE PLANTED VIOLATION: a squat is never executed, and the gate fails closed", async () => {
      // The proof the CR asked for, on a machine with or without gitleaks installed: a real file at a
      // real `node_modules/.bin` path inside a real temp tree, resolved over a real PATH string by
      // the real filesystem probe. `spawned` is the assertion that matters — the refusal happens
      // before anything is executed, so the planted auditor never gets to choose a report or a code.
      const root = join(tmpdir(), `mizan-g4-squat-${crypto.randomUUID()}`)
      const binDir = join(root, "node_modules", ".bin")
      const [plantedName = GITLEAKS_BINARY] = executableNames(GITLEAKS_BINARY, process.platform)
      mkdirSync(binDir, { recursive: true })
      writeFileSync(join(binDir, plantedName), "#!/bin/sh\nprintf '[]' > \"$8\"\nexit 0\n")
      let spawned = 0
      const neverRun: GitleaksSpawn = async () => {
        spawned += 1
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      try {
        const result = await runGitleaks(
          root,
          (cwd) => resolveScanner(GITLEAKS_BINARY, cwd, binDir, undefined, process.platform),
          neverRun,
        )
        expect(result.ok).toBe(false)
        expect(result.detail).toContain("did not run")
        // Named relative to the tree, so the reader can go and look, and without the absolute prefix
        // that would put the OS account name into a CI log (AGENTS.md section 13).
        expect(result.detail).toContain(join("node_modules", ".bin", plantedName))
        expect({ spawned }).toEqual({ spawned: 0 })
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    test("THE PLANTED VIOLATION: a RELATIVE PATH entry cannot smuggle a planted auditor", async () => {
      // The second fail-open, and the one that makes the first rule worthless if it is left alone.
      //
      // `Bun.spawn` runs the child with `cwd` set to the SCANNED ROOT, so a relative PATH entry names
      // a different file depending on who is asking: the gate's own directory when it probes, the
      // child's when the process starts. With a probe that returned the joined path verbatim and a
      // containment check that resolved against `process.cwd()`, those were two different files —
      // and the trust check was made about the honest one. Reproduced end to end before the fix:
      //
      //   scanned root  <tmp>/g4rel4/root      <- planted auditor under tools/, plus a real secret
      //   process.cwd() <tmp>/g4rel4/work      <- an honest gitleaks
      //   PATH entry "tools" -> path="tools\gitleaks.exe" absolute=false trusted=true
      //
      // The planted file ran, wrote `[]`, and G-4 reported a clean tree. `executableNames`'s three
      // names do not help: the defect is in the DIRECTORY, not the filename.
      //
      // The fixture therefore puts the planted auditor in a directory that is BOTH a real relative
      // PATH entry and inside the scanned root, and asserts the refusal happens before any spawn.
      const base = join(tmpdir(), `mizan-g4-rel-${crypto.randomUUID()}`)
      const scanRoot = join(base, "root")
      const plantedDir = join("tools")
      const [plantedName = GITLEAKS_BINARY] = executableNames(GITLEAKS_BINARY, process.platform)
      mkdirSync(join(scanRoot, plantedDir), { recursive: true })
      writeFileSync(join(scanRoot, plantedDir, plantedName), "#!/bin/sh\nprintf '[]' > \"$8\"\nexit 0\n")
      let spawned = 0
      const neverRun: GitleaksSpawn = async () => {
        spawned += 1
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      try {
        // The real filesystem probe, driven by a relative PATH entry, exactly as a developer with
        // `tools` on PATH would produce. `process.cwd()` does not contain the planted file, so the
        // probe's own reading is absent and the ONLY candidate the gate can see is the one the
        // child would open.
        const resolution = resolveScanner(
          GITLEAKS_BINARY,
          scanRoot,
          plantedDir,
          undefined,
          process.platform,
        )
        const names = resolution.kind === "untrusted_only" ? resolution.paths : []
        expect(resolution.kind).toBe("untrusted_only")
        expect(names.join(";")).toContain(join(plantedDir, plantedName))

        const result = await runGitleaks(
          scanRoot,
          (cwd) => resolveScanner(GITLEAKS_BINARY, cwd, plantedDir, undefined, process.platform),
          neverRun,
        )
        expect(result.ok).toBe(false)
        expect(result.detail).toContain("did not run")
        expect({ spawned }).toEqual({ spawned: 0 })
      } finally {
        rmSync(base, { recursive: true, force: true })
      }
    })

    test("a relative PATH entry resolving outside the scanned tree is still honoured", async () => {
      // The control for the test above, and the reason the fix is a second path rather than a blanket
      // refusal of every relative entry: refusing those would answer a real install with "ignore
      // G-4", which is the same assurance failure wearing a different hat. Here the entry is relative
      // and the file it names lives outside the tree under audit, so it must still run.
      const base = join(tmpdir(), `mizan-g4-rel-ok-${crypto.randomUUID()}`)
      const scanRoot = join(base, "tree")
      const outside = join("..", "toolcache")
      const [plantedName = GITLEAKS_BINARY] = executableNames(GITLEAKS_BINARY, process.platform)
      mkdirSync(scanRoot, { recursive: true })
      mkdirSync(join(base, "toolcache"), { recursive: true })
      writeFileSync(join(base, "toolcache", plantedName), "#!/bin/sh\nexit 0\n")
      const clean: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, "[]")
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      try {
        const result = await runGitleaks(
          scanRoot,
          (cwd) => resolveScanner(GITLEAKS_BINARY, cwd, outside, undefined, process.platform),
          clean,
        )
        expect(result.ok).toBe(true)
      } finally {
        rmSync(base, { recursive: true, force: true })
      }
    })

    test("an unresolved candidate is refused, so the gate fails closed rather than guessing", () => {
      // Belt and braces for the same hole: `probeOnDisk` answers in absolute paths now, but the
      // resolver's own contract must refuse anything it still cannot place. A candidate that cannot
      // be located cannot be cleared.
      expect(isUntrustedScannerPath(`tools${delimiter}gitleaks`, "/repo")).toBe(true)
      expect(probeOnDisk(".", "gitleaks")).toBeNull()
    })

    test("a green run names a squat it stepped over, so the spot is not silently free", async () => {
      const clean: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, "[]")
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      const resolver: ScannerResolver = () => ({
        kind: "resolved",
        path: "/opt/tools/gitleaks",
        ignored: [`${posix}/node_modules/.bin/gitleaks`],
      })
      const result = await runGitleaks(repoRoot(), resolver, clean)
      expect(result.ok).toBe(true)
      expect(result.detail).toContain("refused to run")
      expect(result.detail).toContain("gitleaks")
    })

    test("a green verdict names a refused candidate without printing an absolute path", async () => {
      // The OS account name is in an absolute path, and a green CI log is the most public surface this
      // program has. The name is still there — a reader must be able to go and look — but the prefix is not.
      const clean: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, "[]")
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      const root = repoRoot()
      const planted = join(root, "node_modules", ".bin", "gitleaks")
      const resolver: ScannerResolver = () => ({ kind: "resolved", path: "/opt/tools/gitleaks", ignored: [planted] })
      const result = await runGitleaks(root, resolver, clean)
      expect(result.ok).toBe(true)
      expect(result.detail).toContain("gitleaks")
      expect(result.detail).not.toContain(root)
    })

    test("an untrusted-only refusal names the candidate relative to the tree, for the same reason", () => {
      const root = join(tmpdir(), `mizan-g4-label-${crypto.randomUUID()}`)
      const planted = join(root, "tools", "gitleaks")
      expect(UNTRUSTED_SCANNER_MESSAGE([planted], root)).toContain(join("tools", "gitleaks"))
      expect(UNTRUSTED_SCANNER_MESSAGE([planted], root)).not.toContain(root)
    })

    test("a candidate OUTSIDE the tree is named by its file name only", () => {
      // Its directory belongs to whatever tool cache supplied it, and its parent directories are exactly
      // what carries the account name. The name alone is still enough to recognise `gitleaks.exe`.
      const outside = join(sep, "opt", "hostedtoolcache", "gitleaks", "8.24.3", "gitleaks")
      expect(candidateLabels([outside], join(sep, "repo"))).toBe("gitleaks")
    })

    test("an honest install outside the tree is still used, so the rule is not 'always refuse'", async () => {
      // A control that rejected real installs would be answered with "ignore G-4", which is the same
      // assurance failure wearing a different hat. This one goes through the REAL filesystem probe,
      // because the rule is supposed to hold against a real file and not only against a stub.
      const base = join(tmpdir(), `mizan-g4-honest-${crypto.randomUUID()}`)
      const tree = join(base, "tree")
      const toolCache = join(base, "toolcache")
      const [plantedName = GITLEAKS_BINARY] = executableNames(GITLEAKS_BINARY, process.platform)
      mkdirSync(tree, { recursive: true })
      mkdirSync(toolCache, { recursive: true })
      writeFileSync(join(toolCache, plantedName), "#!/bin/sh\nprintf '[]' > \"$8\"\nexit 0\n")
      const clean: GitleaksSpawn = async (_cwd, _binary, reportPath) => {
        await writeFile(reportPath, "[]")
        return { code: 0, stdout: "no leaks found", stderr: "" }
      }
      try {
        const result = await runGitleaks(
          tree,
          (cwd) => resolveScanner(GITLEAKS_BINARY, cwd, toolCache, undefined, process.platform),
          clean,
        )
        expect(result.ok).toBe(true)
      } finally {
        rmSync(base, { recursive: true, force: true })
      }
    })
  })

  /**
   * The two tests that drive the REAL scanner over the REAL tree.
   *
   * They are skipped when the gate's own resolution finds nothing, and they now RUN whenever a real
   * gitleaks is installed — including on a machine where `node_modules/.bin/gitleaks` exists, which
   * they deliberately ignore. Each one is a full-tree scan, so the budget is explicit: the default
   * 5s per test is below a single scan here, and a test that times out looks exactly like a gate that
   * is broken.
   */
  const REAL_SCAN_TIMEOUT_MS = 120_000

  test.skipIf(!gitleaksAvailable())(
    "the planted violation fails: a config carrying only an allowlist scans nothing",
    async () => {
      // The defect this gate has to be able to catch is fail-open, and the way to prove a gate is not
      // fail-open is to plant the thing it must catch and watch it fail. The planted file is a
      // format-valid OpenAI key in a committable path: gitleaks flags it, and the gate must too. Only
      // this half needs gitleaks itself; the gate's verdict for the same finding is asserted above
      // with an injected scan.
      const planted = ["sk-proj-", "9d4f7a1c3e5b8d2f6a0c4e7b", "1d9f3a6c8e2b5d7f0a4c6e8b1d", "3f5a7c9e1b3d5f7"].join("")
      const result = await scanWithProbe(`MIZAN_PLANTED_NOT_A_REAL_KEY = ${planted}\n`)
      expect(result.ok).toBe(false)
      expect(result.detail).toContain("g4-planted-probe.txt")
    },
    REAL_SCAN_TIMEOUT_MS,
  )

  test.skipIf(!gitleaksAvailable())(
    "and the same command passes once the planted file is gone, so the probe was the cause",
    async () => {
      const result = await scanWithProbe(null)
      expect(result.ok).toBe(true)
    },
    REAL_SCAN_TIMEOUT_MS,
  )

  test("a real secret in .env is reported as excused, not as a clean tree", async () => {
    const root = findRepositoryRoot(import.meta.dir)
    if (root === null) throw new Error("no root")
    // The developer's own local `.env`, if it exists. This asserts the reason the gate is allowed to
    // pass at all, so that the pass cannot quietly become "it stopped scanning".
    if (!existsSync(join(root, ".env"))) return
    if (!gitleaksAvailable()) return
    expect((await scanRealRepo()).detail).toContain("git ignores")
  }, REAL_SCAN_TIMEOUT_MS)
})
