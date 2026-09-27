import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  checkBacktickedPaths,
  checkDocumentedScripts,
  checkEnvVars,
  checkEvalBreadth,
  checkLiveProviderClaim,
  checkRegistryClaims,
  checkSnapshotArithmetic,
  runDocsClaimChecks,
  type DocsClaim,
  type SourceFile,
} from "../src/index.ts"

/**
 * Tests for D-1, the documentation-claims check.
 *
 * ## Why this file is shaped the way it is
 *
 * Every test here plants a violation and requires the check to fail. That is the standard the
 * constitution sets (AGENTS.md §14) and it is the whole point: a rule that only ever runs against
 * correct input has never been shown to detect anything. The runner's positive test is the same
 * idea from the other side — a synthetic tree with nothing wrong must pass, or the rules are not
 * proving anything either.
 *
 * The pure functions take their collaborators as arguments — an `exists` predicate, the script
 * map, the two file texts — so none of these tests touches the filesystem or the real
 * repository. That is what makes them fast, order-independent, and safe to read without knowing
 * what is on disk.
 */

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((c) => c.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((c) => `${c.rule}: ${c.detail}`).join("\n")

/** `exists` stub that answers from a set, so each test states exactly which paths it claims exist. */
const only = (...paths: readonly string[]): ((path: string) => boolean) => {
  const known = new Set(paths)
  return (path) => known.has(path)
}

describe("R1 — backticked repository paths must exist", () => {
  test("passes when every path exists", () => {
    const claims = checkBacktickedPaths(
      "see `packages/mizan-verify/src/verify.ts` and `data/registry/sources.json`",
      "DISCLOSURE.md",
      only("packages/mizan-verify/src/verify.ts", "data/registry/sources.json"),
    )
    expect(claims).toEqual([])
  })

  test("catches the exact defect that motivated this rule: six paths that do not exist", () => {
    // The real drift, transcribed. If this stops failing, R1 has stopped working.
    const drift = [
      "packages/mizan-gate/src/evaluate.ts",
      "packages/mizan-corpus/src/registry.ts",
      "packages/mizan-agent/src/provider/port.ts",
      "packages/mizan-gate/src/capability.ts",
      "packages/mizan-corpus/src/grade.ts",
      "data/questions/synthetic.json",
    ]
    const claims = checkBacktickedPaths(drift.map((p) => `see \`${p}\``).join(" and "), "DISCLOSURE.md", only())
    expect(claims).toHaveLength(drift.length)
    for (const path of drift) {
      expect(details(claims)).toContain(path)
    }
  })

  test("does not treat commands, URLs or prose as paths", () => {
    const claims = checkBacktickedPaths(
      "run `bun run ingest` then read `https://example.com/x` and see `no/raw/html` sinks",
      "README.md",
      only(),
    )
    expect(claims).toEqual([])
  })

  test("a glob is checked as its directory, because `data/eval/*.json` is not a file", () => {
    // The false positive that this encodes: `existsSync("data/eval/*.json")` is always false, so
    // the naive rule reported a correct document as broken. The claim being made is that the
    // directory is where those files live.
    const real = checkBacktickedPaths("`**/*.json` lives in `data/eval`", "INTEGRITY.md", only("data/eval"))
    expect(real).toEqual([])

    const ghost = checkBacktickedPaths("see `data/eval/*.json`", "INTEGRITY.md", only())
    expect(rules(ghost)).toEqual(["missing-path"])
    expect(details(ghost)).toContain("data/eval")
  })
})

describe("R2 — .env.example and the code must name the same variables", () => {
  const provider = (names: readonly string[]): string =>
    names.map((name) => `export const ENV_${name} = "MIZAN_${name}"`).join("\n")

  test("passes when both sides agree", () => {
    const claims = checkEnvVars("MIZAN_PROVIDER=hosted\nMIZAN_LLM_API_KEY=\n", provider(["PROVIDER", "LLM_API_KEY"]))
    expect(claims).toEqual([])
  })

  test("catches the eight documented variables that no code read", () => {
    const documented = [
      "MIZAN_PROVIDER",
      "MIZAN_OLLAMA_URL",
      "MIZAN_OLLAMA_MODEL",
      "MIZAN_LLM_MODEL",
      "MIZAN_EMBEDDING_URL",
      "MIZAN_CORPUS_DIR",
      "MIZAN_TAFSIR_BACKEND",
      "MIZAN_CITATION_STYLE",
    ]
      .map((name) => `${name}=`)
      .join("\n")
    const claims = checkEnvVars(documented, provider(["PROVIDER"]))
    expect(claims).toHaveLength(7)
    for (const name of ["MIZAN_OLLAMA_URL", "MIZAN_TAFSIR_BACKEND", "MIZAN_CITATION_STYLE"]) {
      expect(details(claims)).toContain(name)
    }
    expect(rules(claims)).not.toContain("env-var-undocumented")
  })

  test("catches a variable the code reads but nobody documented", () => {
    const claims = checkEnvVars("MIZAN_PROVIDER=hosted\n", provider(["PROVIDER", "LLM_API_KEY"]))
    expect(rules(claims)).toEqual(["env-var-undocumented"])
    expect(details(claims)).toContain("MIZAN_LLM_API_KEY")
  })

  test("compares the value, not the constant's name", () => {
    // The code calls it ENV_API_KEY and the document calls it MIZAN_LLM_API_KEY. Only the string
    // literal is comparable, which is the whole reason the rule reads values.
    const claims = checkEnvVars("MIZAN_LLM_API_KEY=\n", `export const ENV_API_KEY = "MIZAN_LLM_API_KEY"`)
    expect(claims).toEqual([])
  })

  test("ignores a variable mentioned in a comment saying it is not configurable", () => {
    // `.env.example` explains that MIZAN_TAFSIR_BACKEND is NOT read. An assignment line is what
    // counts, not the word appearing.
    const env = "# MIZAN_TAFSIR_BACKEND is intentionally not configurable\nMIZAN_PROVIDER=hosted\n"
    const claims = checkEnvVars(env, provider(["PROVIDER"]))
    expect(claims).toEqual([])
  })
})

describe("R3 — the registry and the disclosure must agree", () => {
  const registry = (entries: readonly Record<string, unknown>[]): string =>
    JSON.stringify({
      sources: entries.map((e) => ({
        title: "Tanzil - Qur'an",
        enabled: true,
        licenceClass: "no-derivatives",
        exclusionReason: null,
        ...e,
      })),
    })

  test("passes on a consistent pair", () => {
    const claims = checkRegistryClaims(registry([{ records: "1" }]), "we use Tanzil - Qur'an verbatim")
    expect(claims).toEqual([])
  })

  test("catches an enabled source the disclosure never names", () => {
    const claims = checkRegistryClaims(registry([{}]), "## Sources\nNone disclosed.")
    expect(rules(claims)).toEqual(["enabled-source-not-disclosed"])
  })

  test("catches a disabled source with no exclusion reason", () => {
    const claims = checkRegistryClaims(
      registry([{ enabled: false, exclusionReason: null, title: "Some Mirror" }]),
      "we use Tanzil - Qur'an",
    )
    expect(rules(claims)).toEqual(["disabled-source-without-reason"])
  })

  test("a disabled source WITH a reason is fine", () => {
    const claims = checkRegistryClaims(
      registry([{ enabled: false, exclusionReason: "licence unverifiable", title: "Some Mirror" }]),
      "we use Tanzil - Qur'an",
    )
    expect(claims).toEqual([])
  })

  test("catches a licence class the schema does not admit", () => {
    const claims = checkRegistryClaims(registry([{ licenceClass: "public-domain" }]), "we use Tanzil - Qur'an")
    expect(rules(claims)).toEqual(["unknown-licence-class"])
  })

  test("an empty exclusionReason is treated as no reason", () => {
    const claims = checkRegistryClaims(registry([{ enabled: false, exclusionReason: "   " }]), "we use Tanzil - Qur'an")
    expect(rules(claims)).toEqual(["disabled-source-without-reason"])
  })

  test("a title survives a dash or quote being normalised", () => {
    // The registry title carries a real em-dash. A document that typed a plain hyphen, or a
    // curly apostrophe, has still named the source and must not fail the build.
    const em = registry([{ title: "Tanzil \u2014 Qur'an, Uthmani script" }])
    expect(checkRegistryClaims(em, "Tanzil - Qur'an, Uthmani script")).toEqual([])
    expect(checkRegistryClaims(em, "tanzil \u2014 qur\u2019an, uthmani script")).toEqual([])
  })

  test("a keyword is not enough; the title must be there", () => {
    const claims = checkRegistryClaims(registry([{ title: "QuranLab - Hadith & Sunnah" }]), "we have some Tanzil data")
    expect(rules(claims)).toEqual(["enabled-source-not-disclosed"])
  })

  test("malformed JSON is reported, not thrown", () => {
    const claims = checkRegistryClaims("{ not json", "anything")
    expect(rules(claims)).toEqual(["unknown-licence-class"])
    expect(details(claims)).toContain("not valid JSON")
  })

  test("a registry with no sources array is reported", () => {
    const claims = checkRegistryClaims(JSON.stringify({ nothing: true }), "anything")
    expect(rules(claims)).toEqual(["unknown-licence-class"])
  })
})

describe("R4 — a documented command must be a real script", () => {
  const scripts = { ingest: "bun run bin/mizan-ingest.ts", "verify:ledger": "bun run scripts/verify-ledger.ts" }

  test("passes when the scripts exist", () => {
    const claims = checkDocumentedScripts("run `bun run ingest` and `bun run verify:ledger`", "README.md", scripts)
    expect(claims).toEqual([])
  })

  test("catches a renamed script", () => {
    const claims = checkDocumentedScripts("run `bun run verify`", "README.md", scripts)
    expect(rules(claims)).toEqual(["unknown-script"])
    expect(details(claims)).toContain("verify")
  })

  test("catches check:docs being referenced before it exists", () => {
    const claims = checkDocumentedScripts("`bun run check:docs`", "DISCLOSURE.md", scripts)
    expect(rules(claims)).toEqual(["unknown-script"])
  })
})

describe("R5 — the quarantine table must equal the attested snapshot", () => {
  const attestation = (overrides: Readonly<Record<string, unknown>> = {}): string =>
    JSON.stringify({
      recordCount: 27234,
      quarantinedRows: 15026,
      sources: [
        { source: "tanzil/quran-uthmani", rows: 6236 },
        { source: "quranlab/hadith", rows: 36024 },
      ],
      ...overrides,
    })

  const table = (overrides: Readonly<Record<string, string>> = {}): string => {
    const cells = {
      enabled: "| Enabled in the registry (6236 Qur'an + 36024 hadith) | 42260 |",
      quarantined: "| **Quarantined: grade required, none asserted** | **15026** |",
      served: "| Served — 6236 verses plus 20998 hadith | 27234 |",
      ...overrides,
    }
    return `| | Records |\n| --- | --- |\n${cells.enabled}\n${cells.quarantined}\n${cells.served}\n`
  }

  test("passes when the table states the attested numbers", () => {
    expect(checkSnapshotArithmetic(table(), attestation())).toEqual([])
  })

  test("catches the exact defect that motivated this rule: the inverted composition", () => {
    // The three figures were right; the row describing what they *are* was wrong, claiming the
    // 15026 were the Qur'anic verses plus 8790 ungraded hadith when all 15026 are hadith and the
    // 6236 verses are served. The arithmetic rule cannot see that prose, and does not pretend to.
    // What it does catch is a table whose numbers move when the attestation moves.
    const claims = checkSnapshotArithmetic(table({ quarantined: "| **Quarantined** | **15025** |" }), attestation())
    expect(rules(claims)).toEqual(["snapshot-count-mismatch"])
    expect(details(claims)).toContain("15025")
    expect(details(claims)).toContain("15026")
  })

  test("catches a served count that disagrees with recordCount", () => {
    const claims = checkSnapshotArithmetic(table({ served: "| Served | 27235 |" }), attestation())
    expect(details(claims)).toContain("served as 27235")
    expect(details(claims)).toContain("27234")
  })

  test("catches an enabled total that disagrees with the sum of sources[].rows", () => {
    // Summed from the attestation rather than compared to a stored constant, so the table is also
    // checked against the registry: a source cannot be added without the document moving.
    const claims = checkSnapshotArithmetic(table({ enabled: "| Enabled in the registry | 40000 |" }), attestation())
    expect(details(claims)).toContain("enabled as 40000")
    expect(details(claims)).toContain("42260")
  })

  test("a table that stops stating a figure is itself the finding", () => {
    // Silent deletion would otherwise pass: a rule that only compares numbers finds nothing to
    // compare. "The disclosure no longer states the quarantined total" is the honest report.
    const withoutQuarantine = "| | Records |\n| --- | --- |\n| Enabled in the registry | 42260 |\n| Served | 27234 |\n"
    const claims = checkSnapshotArithmetic(withoutQuarantine, attestation())
    expect(rules(claims)).toEqual(["snapshot-count-mismatch"])
    expect(details(claims)).toContain("no longer has a row stating the quarantined total")
  })

  test("derivation prose is not mistaken for the claim", () => {
    // The disclosure explains the arithmetic in prose that quotes the same digits and a fourth
    // number, 34393, which is nobody's total. A rule that scanned the whole document would report
    // a correct document as broken, and a gate that cries wolf gets disabled.
    const withProse = `${table()}\nSo 36024 − 20998 = 15026, and read strictly 42260 − 7867 = 34393.\n`
    expect(checkSnapshotArithmetic(withProse, attestation())).toEqual([])
  })

  test("a thousand separators in the table are read as one number", () => {
    expect(checkSnapshotArithmetic(table({ quarantined: "| Quarantined | 15,026 |" }), attestation())).toEqual([])
  })

  test("no attestation means nothing to check, and nothing is claimed", () => {
    expect(checkSnapshotArithmetic(table({ quarantined: "| Quarantined | 1 |" }), null)).toEqual([])
  })

  test("an unreadable attestation is reported, not silently ignored", () => {
    // A gate that goes quiet when its input is broken is the fail-open default AGENTS.md §3 forbids.
    const claims = checkSnapshotArithmetic(table(), "{ not json")
    expect(rules(claims)).toEqual(["snapshot-count-mismatch"])
    expect(details(claims)).toContain("attestation.json")

    const partial = checkSnapshotArithmetic(table(), JSON.stringify({ recordCount: 1 }))
    expect(rules(partial)).toEqual(["snapshot-count-mismatch"])
  })
})

/**
 * A committed set that satisfies the `EvalSet` contract.
 *
 * Every field is spelled out rather than stubbed, and that is the point of Finding 8: the rule
 * decodes the artefact through the schema `@mizan/core` declares, so a fixture that did not
 * satisfy it would be testing nothing. `anchorCount` is the count the rule judges documents
 * against, so the builder takes it explicitly rather than deriving it.
 */
const artefact = (
  cases: readonly { readonly id: string; readonly anchorId: string; readonly quote: string }[],
  anchorCount = new Set(cases.map((entry) => entry.anchorId)).size,
): string =>
  JSON.stringify({
    schemaVersion: 1,
    set: "fixture",
    title: "fixture",
    purpose: "fixture",
    generatedBy: "fixture",
    regenerateWith: "fixture",
    determinism: "fixture",
    expectationSource: "hand-adjudicated",
    knownDivergence: {
      id: "fixture",
      affectsClasses: [],
      storyRequires: "a",
      procedureDelivers: "b",
      why: "c",
      whoDecides: "the team lead",
    },
    digitFacts: {},
    classCounts: {},
    verdictCounts: {},
    anchorCount,
    licenceNotice: "fixture",
    anchors: [],
    cases: cases.map((entry) => ({
      id: entry.id,
      classId: "verbatim",
      mutation: "verbatim",
      note: "fixture",
      quote: entry.quote,
      citation: { collection: "abudawud", number: "1", grade: null, raw: entry.anchorId },
      expectedVerdict: "verified",
      expectedReason: "exact_containment",
      expectedRationale: "fixture",
      anchorId: entry.anchorId,
      divergence: null,
    })),
  })

describe("R6 — the eval sets' breadth must be described as the artefacts are", () => {
  /**
   * `bidi` and `plain` are the same span written twice — one with marks, one without — which is what
   * the real normaliser collapses and what makes the disjointness claim false. `elided` is a third
   * case on the same record quoting a different window, so the fixture also proves the rule does not
   * fire merely because a record is reused.
   */
  const overlapping = artefact([
    { id: "golden-001", anchorId: "abudawud:1", quote: "أَنَّ النَّبِيَّ" },
    { id: "golden-031", anchorId: "abudawud:1", quote: "أن النبي" },
    { id: "golden-095", anchorId: "abudawud:1", quote: "النبي ... المذهب" },
  ])

  const disjoint = artefact([
    { id: "golden-001", anchorId: "abudawud:1", quote: "أَنَّ النَّبِيَّ" },
    { id: "golden-002", anchorId: "abudawud:10", quote: "قال نهي رسول الله" },
  ])

  const both = [
    { name: "golden", path: "data/eval/golden-normalization.json", text: overlapping },
    { name: "redteam", path: "data/eval/redteam-fabricated.json", text: disjoint },
  ]

  test("catches the exact claim that motivated this rule: two cases never share a span", () => {
    // The real drift, transcribed. If this stops failing, R6 has stopped working.
    const claims = checkEvalBreadth("**Disjoint spans.** Two cases never share a span, so 200 cases are 200 texts.", "README.md", both)
    expect(rules(claims)).toEqual(["eval-breadth-overstated"])
    expect(details(claims)).toContain("1 of the golden set's 1 anchor records")
    expect(details(claims)).toContain("normalizeForMatch")
  })

  test("the reuse must survive the real normaliser, not just string equality", () => {
    // The two quotes are different byte strings. A rule comparing raw text would pass, which is the
    // whole reason `normalizeForMatch` is the comparison: the marks are what `undiacriticized` removes.
    expect(checkEvalBreadth("no two cases share a span", "README.md", both)).toHaveLength(1)
    const raw = artefact([
      { id: "a", anchorId: "abudawud:1", quote: "أَنَّ النَّبِيَّ" },
      { id: "b", anchorId: "abudawud:1", quote: "أَنَّ النَّبِيَّ" },
    ])
    expect(rules(checkEvalBreadth("disjoint spans", "README.md", [{ name: "golden", path: "g.json", text: raw }]))).toEqual(["eval-breadth-overstated"])
  })

  test("a set whose records are not reused passes", () => {
    expect(checkEvalBreadth("Two cases never share a span.", "README.md", [{ name: "golden", path: "g.json", text: disjoint }])).toEqual([])
  })

  test("a document that says nothing about the sets is not second-guessed", () => {
    // Silence is not a claim. A rule that fired here would report every correct document as broken.
    const claims = checkEvalBreadth("The corpus is 27,234 records and no Bukhari.", "DISCLOSURE.md", both)
    expect(claims).toEqual([])
  })

  test("each of the three phrasings counts as the claim", () => {
    for (const phrasing of ["disjoint spans", "Two cases never share a span.", "no two cases share a span"]) {
      expect(rules(checkEvalBreadth(phrasing, "README.md", both))).toEqual(["eval-breadth-overstated"])
    }
  })

  test("a stated record count must be the count the artefact publishes", () => {
    // One line per set, which is how a document has to write it: a line naming both sets carries two
    // figures and no mechanical way to pair them, and the rule declines rather than guessing.
    const good = checkEvalBreadth("The 200 golden cases draw on 1 records.\nThe 40 red-team cases draw on 2 records.\n", "README.md", both)
    expect(good).toEqual([])

    const drifted = checkEvalBreadth("The 200 golden cases draw on 200 records.\n", "README.md", [{ name: "golden", path: "g.json", text: overlapping }])
    expect(rules(drifted)).toEqual(["eval-breadth-overstated"])
    expect(details(drifted)).toContain("200")
    expect(details(drifted)).toContain("1")
  })

  test("a bolded or qualified figure is still read, not silently skipped", () => {
    // Finding 2, planted. Every one of these was a fail-open form: `**56**` and `56 anchor records`
    // are how this repository already writes these numbers (`DISCLOSURE.md` writes `**15026**`), and
    // the second is the exact phrase the rule's own error message emits.
    for (const line of [
      "The 200 golden cases draw on **200** records.",
      "The 200 golden cases draw on 200 anchor records.",
      "The 200 golden cases draw on 200 record.",
      "The 200 golden cases draw on **200** anchor records.",
    ]) {
      expect(rules(checkEvalBreadth(line, "README.md", [{ name: "golden", path: "g.json", text: overlapping }]))).toEqual(["eval-breadth-overstated"])
    }
    // And the honest bolded figure is not reported, which is the other half of the same change.
    expect(checkEvalBreadth("The 200 golden cases draw on **1** records.", "README.md", [{ name: "golden", path: "g.json", text: overlapping }])).toEqual([])
  })

  test("the breadth nouns and word-chains a writer actually uses are read, not just `records`", () => {
    // Finding 3, planted. Five shapes that each stated a false breadth and none of which the rule
    // could see: the noun is `anchors` or `sources` rather than `records`; the figure sits three words
    // from its noun; and the figure is a table cell with no noun in front of it at all — the form the
    // sibling rule R5 already reads. Measured before the fix: all five were missed, silently.
    const one = [{ name: "golden", path: "g.json", text: overlapping }]
    for (const line of [
      "The golden set draws on 999 records.",
      "The golden set draws on **999** records.",
      "The golden set draws on 1,000 records.",
      "The golden set draws on 999 anchors.",
      "The golden set draws on 999 sources.",
      "The golden set draws on 999 unique anchor source records.",
      "| Golden set records | 999 |",
    ]) {
      expect(rules(checkEvalBreadth(line, "README.md", one))).toEqual(["eval-breadth-overstated"])
    }
    // The honest table row this repository actually ships: 200 is a case count and 100% is an
    // accuracy bar, so the rule must not read either as a claim about anchorCount.
    expect(checkEvalBreadth("| `golden-normalization.json` | 200 | **100%** (architecture floor: 99%) |\n", "README.md", one)).toEqual([])
  })

  test("a reflowed paragraph is still checked, because the unit is the block and not the line", () => {
    // Finding 3, and the sharpest half of it. The README's honest 56 and 30 passed only because of
    // where the editor happened to wrap: the line naming `golden` carried the 56. Reflow the
    // paragraph so no line carries its own figure and *both* figures went unchecked with no
    // diagnostic — a rewrap silently disabling a safety rule. Here each figure is two lines away
    // from its own set name and closer to the *other* one, which is why the pairing compares against
    // every set the paragraph names instead of guessing which is which.
    const honest =
      "- **Breadth, stated exactly.** The golden set quotes shared spans on purpose, and it\n" +
      "  draws on 1 records across its cases. The red-team set fabricates every case, and it\n" +
      "  draws on 2 records across its cases.\n"
    expect(checkEvalBreadth(honest, "README.md", both)).toEqual([])

    const drifted = honest.replace("draws on 1 records", "draws on 999 records").replace("draws on 2 records", "draws on 888 records")
    const claims = checkEvalBreadth(drifted, "README.md", both)
    expect(rules(claims)).toEqual(["eval-breadth-overstated", "eval-breadth-overstated"])
    // Neither finding blames the wrong set, which is the point of comparing against both.
    expect(details(claims)).toContain("999")
    expect(details(claims)).toContain("888")
    expect(details(claims)).toContain("golden publishes 1")
    expect(details(claims)).toContain("redteam publishes 2")
  })

  test("a figure the sentence renounces is not this rule's business", () => {
    // The guard is load-bearing, and the shape is the repository's own. "not 200 texts" is the
    // honest half of the corrected breadth sentence: adding `texts` as a breadth noun without this
    // guard reports the sentence that *fixed* the defect as the defect. The real README says 56 and
    // 30 here; the fixture publishes 1 and 2, so these carry the fixture's figures.
    const honest = [
      "The 200 golden cases draw on 1 records, not 200 texts, and the 40 red-team cases draw on 2 records.",
      "The golden set draws on 1 records rather than 999 records.",
    ]
    for (const line of honest) {
      expect(checkEvalBreadth(line, "README.md", both)).toEqual([])
    }
    // A bound is still a claim: the word before the digits is `than`, not a renouncer.
    expect(rules(checkEvalBreadth("The golden set draws on no more than 999 records.", "README.md", [{ name: "golden", path: "g.json", text: overlapping }]))).toEqual([
      "eval-breadth-overstated",
    ])
  })

  test("the published anchorCount is the number, not a count re-derived from the cases", () => {
    // Finding 8, planted. `apps/cli/test/eval.test.ts` ties `anchorCount` to `anchors.length`; this
    // rule must not quietly invent a second derivation that the artefact can contradict. Here the
    // three cases quote one record, so a re-derivation would judge every document against 1.
    const published = artefact(
      [
        { id: "a", anchorId: "abudawud:1", quote: "أَنَّ النَّبِيَّ" },
        { id: "b", anchorId: "abudawud:1", quote: "أن النبي" },
        { id: "c", anchorId: "abudawud:2", quote: "قال نهي رسول الله" },
      ],
      7,
    )
    expect(checkEvalBreadth("The golden cases draw on 7 records.\n", "README.md", [{ name: "golden", path: "g.json", text: published }])).toEqual([])
    expect(rules(checkEvalBreadth("The golden cases draw on 1 records.\n", "README.md", [{ name: "golden", path: "g.json", text: published }]))).toEqual([
      "eval-breadth-overstated",
    ])
  })

  test("one line naming both sets is split by which count it matches, not declined", () => {
    // Finding 3, planted the other way. The old rule skipped a line naming two sets, which made the
    // one place a writer states both figures together the one place neither was checked. A figure is
    // now judged against every set its own line names, so this stays a pass — but for a mechanism
    // rather than a refusal, and the two wrong figures below are both caught.
    expect(checkEvalBreadth("The golden set draws on 1 records and the red-team set on 2 records.\n", "README.md", both)).toEqual([])

    const claims = checkEvalBreadth("The 200 golden cases draw on 999 records and the 40 red-team cases draw on 888 records.\n", "README.md", both)
    expect(rules(claims)).toEqual(["eval-breadth-overstated", "eval-breadth-overstated"])
    // Both are reported, and each names both sets rather than the nearest one: the line is ambiguous
    // about which figure belongs to which set, so the finding quotes the counts it does have instead
    // of picking a culprit the writer never wrote.
    expect(details(claims)).toContain("999")
    expect(details(claims)).toContain("888")
    expect(details(claims)).toContain("golden publishes 1")
    expect(details(claims)).toContain("redteam publishes 2")
  })

  test("a record count on a line that names no set is somebody else's number", () => {
    // The disclosure says "6236 records" and "36024 records" about the registry, and "42260 records"
    // about the corpus. None of those lines names an eval set, so a rule that scanned the whole
    // document would report a correct disclosure as broken, and a gate that cries wolf gets disabled.
    const claims = checkEvalBreadth("| Tanzil - Qur'an, Uthmani script | Enabled, 6236 records |", "DISCLOSURE.md", both)
    expect(claims).toEqual([])
  })

  test("a missing artefact is skipped, but an unreadable one is named by its own rule", () => {
    // No set in the repository: nothing is claimed about it, so nothing is checked.
    expect(checkEvalBreadth("disjoint spans", "README.md", [{ name: "golden", path: "g.json", text: null }])).toEqual([])

    // Finding 9, planted. A present artefact that cannot be decoded is a *gate* failure, not a
    // documentation failure, and the finding has to say so: `eval-breadth-overstated` sends the next
    // engineer to edit a document that may be perfectly correct.
    for (const broken of ["{ not json", JSON.stringify({ cases: [{ quote: "x" }] }), JSON.stringify({ cases: [] })]) {
      const claims = checkEvalBreadth("disjoint spans", "README.md", [{ name: "golden", path: "data/eval/perturbation.json", text: broken }])
      expect(rules(claims)).toEqual(["eval-artefact-unreadable"])
      expect(claims[0]?.file).toBe("data/eval/perturbation.json")
    }
  })

  test("a stated figure on an unreadable artefact is unchecked, and is reported as such", () => {
    // A gate that skips this silently is fail-open: the author gets a clean run from a document
    // whose number was never compared with anything. Naming the artefact is the only honest outcome.
    const claims = checkEvalBreadth("The golden set draws on 12 records.", "README.md", [{ name: "golden", path: "data/eval/perturbation.json", text: "{ not json" }])
    expect(rules(claims)).toEqual(["eval-artefact-unreadable"])
    expect(claims[0]?.file).toBe("data/eval/perturbation.json")
  })

  test("a finding names the artefact it actually read, not one inferred from the set name", () => {
    // Finding 5, planted. A third set is the whole case: `set.name === "golden" ? … : REDTEAM_EVAL`
    // reports `redteam-fabricated.json` for anything that is not golden, so the audit report names a
    // file it never opened.
    const claims = checkEvalBreadth("disjoint spans", "README.md", [{ name: "perturbation", path: "data/eval/perturbation.json", text: "{ not json" }])
    expect(claims[0]?.file).toBe("data/eval/perturbation.json")
    expect(details(claims)).toContain("data/eval/perturbation.json")
    expect(details(claims)).not.toContain("redteam-fabricated.json")
  })
})

describe("R7 — a document must not deny the egress the code builds", () => {
  const file = (path: string, text: string): SourceFile => ({ path, text })
  const liveProvider = file(
    "apps/cli/src/provider-config.ts",
    'export const ENV_PROVIDER = "MIZAN_PROVIDER"\nconst transport = async (r) => fetch(r.url, { method: "POST" })\nreturn buildTransport(transport)\n',
  )
  const corpusClient = file("packages/mizan-corpus/src/http.ts", "export const get = async (url) => await fetch(url, { redirect: \"error\" })\n")

  test("catches the exact denial that motivated this rule", () => {
    const claims = checkLiveProviderClaim("**There is no live model provider.** A provider is a seam, not an integration.", "README.md", [liveProvider])
    // One finding per offending line, carrying the message that fixes it. The line states two
    // denials and either one is enough to condemn it.
    expect(rules(claims)).toEqual(["live-provider-denied"])
    expect(details(claims)).toContain("apps/cli/src/provider-config.ts")
  })

  test("catches the exact degradation claim in .env.example, transcribed", () => {
    // Finding 1, planted. The sentence survived the two-literal denial rule because it names neither
    // "live model provider" nor "seam", and it is in the file the quick start tells a judge to copy.
    const claims = checkLiveProviderClaim(
      '# with no provider configured the CLI prints the honest degradation "model unavailable" rather than falling back to a mock.',
      ".env.example",
      [liveProvider],
    )
    expect(rules(claims)).toEqual(["live-provider-denied"])
    expect(details(claims)).toContain("committed transcript")
  })

  test("catches the phrasings a future author reaches for, not only the one that was written", () => {
    // Finding 3, planted. All four were silent under a match pinned to the wording of the defect:
    // the last of them is the exact harmful inference, and the first three are the ordinary ways to
    // say the same false thing.
    for (const line of [
      "mizan does not ship a hosted model provider.",
      "No model provider is wired up.",
      "The provider is a stub, not an integration.",
      "Nothing ever leaves the machine.",
    ]) {
      expect(rules(checkLiveProviderClaim(line, "README.md", [liveProvider]))).toEqual(["live-provider-denied"])
    }
  })

  test("the counterparty is a `fetch(` outside the corpus package, not a named constructor", () => {
    // The other half of Finding 3. `hostedProvider` was the only literal that counted, in one hardcoded
    // path, so renaming it or adding a second provider site disabled the rule silently.
    const renamed = file("apps/cli/src/llm-transport.ts", "export const send = async (r) => fetch(r.url, { method: \"POST\" })\n")
    expect(rules(checkLiveProviderClaim("There is no live model provider.", "README.md", [renamed]))).toEqual(["live-provider-denied"])
    // The corpus client legitimately fetches, and saying so in a document is not a finding.
    expect(checkLiveProviderClaim("There is no live model provider.", "README.md", [corpusClient])).toEqual([])
  })

  test("the corrected wording passes, which is what makes the fix possible", () => {
    // A rule that also rejected the honest sentence would leave the document with nowhere to go but
    // deleting the disclosure. This is the sentence that replaced the denial.
    const corrected =
      "A hosted provider does ship, and `hosted` is the default mode: with `MIZAN_LLM_API_KEY` set, " +
      "`apps/cli/src/provider-config.ts` POSTs the question to an allowlisted `api.openai.com` over HTTPS."
    expect(checkLiveProviderClaim(corrected, "README.md", [liveProvider])).toEqual([])
  })

  test("a denial that is quoted, scoped, corrected or about a local path passes", () => {
    // Finding 3, planted the other way: the two phrasings the narrow rule blocked are both TRUE, and
    // so are the two that occur in this repository today. A gate that fails these is a gate that gets
    // switched off, and then it stops catching the real thing.
    const honest = [
      'An earlier draft said "There is no live model provider". That was false.',
      "There is no live model provider in the default checkout, because no API key ships.",
      "`bun run ask --list-questions` works on a clean checkout with no provider key and no network.",
      "mizan has **no local inference path**. There is no Ollama here.",
    ]
    for (const line of honest) {
      expect(checkLiveProviderClaim(line, "DISCLOSURE.md", [liveProvider])).toEqual([])
    }
  })

  test("a categorical no-egress claim is caught, which is worse than any of the four above", () => {
    // Finding 4, planted. All five were measured as missed before the fix, and they are the phrasings
    // an author reaches for *because* they read as reassuring: not an under-statement of an egress
    // but an assertion that none exists. A judge who believed the first of these concludes nothing
    // ever leaves the machine, which is false the moment `MIZAN_LLM_API_KEY` is set.
    for (const line of [
      "mizan runs fully offline.",
      "There is no outbound network access in this product.",
      "mizan makes no API calls.",
      "mizan never contacts OpenAI.",
      "Egress is zero.",
    ]) {
      expect(rules(checkLiveProviderClaim(line, "README.md", [liveProvider]))).toEqual(["live-provider-denied"])
    }
    // And the finding names the site, so the message is actionable rather than a bare refusal.
    expect(details(checkLiveProviderClaim("mizan runs fully offline.", "README.md", [liveProvider]))).toContain("apps/cli/src/provider-config.ts")
  })

  test("a scoped no-network statement about hermetic fixtures still passes", () => {
    // The other half of Finding 4, and the constraint the fifth kind had to be built under. This is
    // the README's own sentence: two committed test sets ship the rows they quote, so they genuinely
    // need no network. `no outbound network access` would catch it — and failing it would fail the
    // document that made the rule necessary, which is how gates get switched off.
    const honest = [
      "They ship the corpus rows they quote, so they run in about a second on a clean checkout with no corpus and no network.",
      "mizan has **no local inference path**. There is no Ollama here.",
    ]
    for (const line of honest) {
      expect(checkLiveProviderClaim(line, "README.md", [liveProvider])).toEqual([])
    }
  })

  test("a denial in a repository that fetches nothing is not a finding", () => {
    // Nothing to contradict. A gate must not require a capability to exist in order to be honest
    // about it.
    const inert = file("apps/cli/src/provider-config.ts", 'export const ENV_PROVIDER = "MIZAN_PROVIDER"')
    expect(checkLiveProviderClaim("There is no live model provider.", "README.md", [inert])).toEqual([])
    expect(checkLiveProviderClaim("There is no live model provider.", "README.md", [])).toEqual([])
  })
})

/** Write `files` into a fresh temp directory and return its path. */
const tree = (files: Readonly<Record<string, string>>): string => {
  const root = join(tmpdir(), `mizan-docs-${crypto.randomUUID()}`)
  for (const [relative, body] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body, "utf8")
  }
  return root
}

describe("runDocsClaimChecks — the runner, end to end", () => {
  const goodRegistry = JSON.stringify({
    sources: [{ title: "Tanzil - Qur'an", enabled: true, licenceClass: "no-derivatives", exclusionReason: null }],
  })
  const providerSource = 'export const ENV_PROVIDER = "MIZAN_PROVIDER"\nexport const ENV_API_KEY = "MIZAN_LLM_API_KEY"'

  const clean = {
    // The disclosure is the document the registry rule is checked against, so it is the one that
    // must name every enabled source.
    "DISCLOSURE.md": "Uses `data/registry/sources.json`. Tanzil - Qur'an is served verbatim.\n\n```bash\nbun run verify\n```\n",
    "README.md": "Run `bun run verify`.\n",
    "INTEGRITY.md": "The snapshot is attested.\n",
    ".env.example": "MIZAN_PROVIDER=hosted\nMIZAN_LLM_API_KEY=\n",
    "package.json": JSON.stringify({ scripts: { verify: "bun run scripts/verify-ledger.ts" } }),
    "apps/cli/src/provider-config.ts": providerSource,
    "data/registry/sources.json": goodRegistry,
  }

  test("passes a consistent tree and names what it audited", () => {
    const result = runDocsClaimChecks(tree(clean))
    expect(details(result.claims)).toBe("")
    expect(result.ok).toBe(true)
    expect(result.checked).toContain("DISCLOSURE.md")
    expect(result.checked).toContain("data/registry/sources.json")
  })

  test("fails a tree whose disclosure names a file that is absent", () => {
    const result = runDocsClaimChecks(tree({ ...clean, "DISCLOSURE.md": "See `packages/mizan-gate/src/evaluate.ts`.\n" }))
    expect(result.ok).toBe(false)
    expect(rules(result.claims)).toContain("missing-path")
  })

  test("a missing DISCLOSURE.md is a failure, not a pass", () => {
    const without: Record<string, string> = { ...clean }
    delete without["DISCLOSURE.md"]
    const result = runDocsClaimChecks(tree(without))
    expect(result.ok).toBe(false)
    expect(details(result.claims)).toContain("DISCLOSURE.md is required")
  })

  test("reports every break, not the first", () => {
    const result = runDocsClaimChecks(
      tree({
        ...clean,
        "DISCLOSURE.md":
          "Tanzil - Qur'an. See `packages/mizan-gate/src/evaluate.ts` and `packages/mizan-corpus/src/grade.ts`, then `bun run nope`.",
      }),
    )
    // Two absent paths and one command that does not exist, all in one run.
    expect(rules(result.claims)).toEqual(["missing-path", "missing-path", "unknown-script"])
  })

  test("a tree with an attestation is checked for quarantine arithmetic, and a wrong table fails", () => {
    // The wiring, not the rule: proves `runDocsClaimChecks` reads `attestation.json` and passes
    // the disclosure through, so the R5 self-test above is not testing a function nothing calls.
    const attestation = JSON.stringify({
      recordCount: 27234,
      quarantinedRows: 15026,
      sources: [{ rows: 6236 }, { rows: 36024 }],
    })
    const disclosure = `${clean["DISCLOSURE.md"] ?? ""}\n| | Records |\n| --- | --- |\n| Enabled in the registry | 42260 |\n| Quarantined | 15026 |\n| Served | 27234 |\n`

    const consistent = runDocsClaimChecks(tree({ ...clean, "DISCLOSURE.md": disclosure, "attestation.json": attestation }))
    expect(details(consistent.claims)).toBe("")
    expect(consistent.ok).toBe(true)

    const drifted = runDocsClaimChecks(
      tree({ ...clean, "DISCLOSURE.md": disclosure.replace("| Quarantined | 15026 |", "| Quarantined | 8790 |"), "attestation.json": attestation }),
    )
    expect(drifted.ok).toBe(false)
    expect(rules(drifted.claims)).toEqual(["snapshot-count-mismatch"])
  })

  test("a tree with no attestation does not invent a failure", () => {
    // `clean` has no `attestation.json`, and the table is absent from its disclosure. If the rule
    // ran anyway it would report the missing table and fail a tree that has made no such claim.
    const result = runDocsClaimChecks(tree(clean))
    expect(rules(result.claims)).not.toContain("snapshot-count-mismatch")
  })

  test("a tree with eval sets is checked for the claims its documents make about them", () => {
    // The wiring, not the rule: proves `runDocsClaimChecks` reads `data/eval/*.json` and the product
    // source, so R6 and R7 are not testing functions nothing calls.
    const golden = artefact([
      { id: "golden-001", anchorId: "abudawud:1", quote: "أَنَّ النَّبِيَّ" },
      { id: "golden-031", anchorId: "abudawud:1", quote: "أن النبي" },
    ])
    const redteam = artefact([{ id: "redteam-001", anchorId: "tirmidhi:1", quote: "عن النبي" }])
    const honest = {
      ...clean,
      "apps/cli/src/provider-config.ts": `${providerSource}\nconst transport = async (r) => fetch(r.url)\n`,
      "data/eval/golden-normalization.json": golden,
      "data/eval/redteam-fabricated.json": redteam,
      "README.md": "The 2 golden cases draw on 1 records. A hosted provider ships in `apps/cli/src/provider-config.ts`.\n",
    }

    const consistent = runDocsClaimChecks(tree(honest))
    expect(details(consistent.claims)).toBe("")
    expect(consistent.checked).toContain("data/eval/golden-normalization.json")
    expect(consistent.checked).toContain("data/eval/redteam-fabricated.json")

    const drifted = runDocsClaimChecks(
      tree({ ...honest, "README.md": "Two cases never share a span. The 2 golden cases draw on 200 records.\nThere is no live model provider.\n" }),
    )
    expect(rules(drifted.claims)).toEqual(["eval-breadth-overstated", "eval-breadth-overstated", "live-provider-denied"])
  })

  test("the report names each input once, and .env.example is audited", () => {
    // Finding 1 and 11. `.env.example` is read by R2 as an env-var list and, separately, as a
    // document making claims about the repository — so it has to appear in the report exactly once
    // and be checked by both.
    const result = runDocsClaimChecks(tree(clean))
    expect(result.checked.filter((entry) => entry === ".env.example")).toHaveLength(1)
    expect(result.checked).toContain(".env.example")
  })

  test("a false egress claim in .env.example fails the build, which is what the file is for", () => {
    // The wiring for Finding 1: the defect was in a file `AUDITED_DOCUMENTS` did not list, so no rule
    // could have seen it regardless of how good the rule was. The sentence is the shipped one,
    // transcribed.
    const drift = 'MIZAN_PROVIDER=hosted\nMIZAN_LLM_API_KEY=\n# with no provider configured the CLI prints the honest degradation "model unavailable" rather than falling back to a mock.\n'
    const result = runDocsClaimChecks(
      tree({ ...clean, ".env.example": drift, "apps/cli/src/provider-config.ts": `${providerSource}\nconst t = async (r) => fetch(r.url)\n` }),
    )
    expect(result.ok).toBe(false)
    expect(rules(result.claims)).toEqual(["live-provider-denied"])
    expect(result.claims[0]?.file).toBe(".env.example")
  })

  test("a tree with no .env.example passes, because audited is not the same as required", () => {
    // Finding 6, planted. Adding `.env.example` to `AUDITED_DOCUMENTS` also made it *mandatory*, so a
    // fork that ships no env example failed the build on a non-defect and was told the file "is
    // required by the submission" — which was never true of it. It is audited when present and its
    // absence is silent.
    const without: Record<string, string> = { ...clean }
    delete without[".env.example"]
    const result = runDocsClaimChecks(tree(without))
    expect(details(result.claims)).toBe("")
    expect(result.ok).toBe(true)
    // And it is not in the report, because it was not read.
    expect(result.checked).not.toContain(".env.example")
  })

  test("a missing judge-facing deliverable is still a failure", () => {
    // The other half: splitting the two concepts must not have softened the requirement it was
    // carved out of. `DISCLOSURE.md` is required by the submission, so its absence still fails.
    for (const document of ["README.md", "INTEGRITY.md"]) {
      const without: Record<string, string> = { ...clean }
      delete without[document]
      const result = runDocsClaimChecks(tree(without))
      expect(result.ok).toBe(false)
      expect(details(result.claims)).toContain(`${document} is required`)
    }
  })

  test("a tree with no eval sets and no egress is not failed for saying nothing", () => {
    // `clean` is the same tree the earlier positive test uses, and it has neither artefact. R6 and R7
    // must go quiet rather than report the absence of a claim nobody made.
    const result = runDocsClaimChecks(tree(clean))
    expect(rules(result.claims)).not.toContain("eval-breadth-overstated")
    expect(rules(result.claims)).not.toContain("live-provider-denied")
  })

  test("the real repository passes today", () => {
    // Not a unit test of a fixture: the actual check on the actual documents. This is the test
    // that would have failed before D-1 existed.
    const root = join(import.meta.dir, "..", "..", "..")
    const result = runDocsClaimChecks(root)
    expect(details(result.claims)).toBe("")
    expect(result.ok).toBe(true)
    // And the snapshot arithmetic was among the things audited, not skipped for want of a fixture.
    expect(result.checked).toContain("attestation.json")
  })
})
