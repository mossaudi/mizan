import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  checkBacktickedPaths,
  checkDocumentedScripts,
  checkEnvVars,
  checkRegistryClaims,
  runDocsClaimChecks,
  type DocsClaim,
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

  test("the real repository passes today", () => {
    // Not a unit test of a fixture: the actual check on the actual documents. This is the test
    // that would have failed before D-1 existed.
    const root = join(import.meta.dir, "..", "..", "..")
    const result = runDocsClaimChecks(root)
    expect(details(result.claims)).toBe("")
    expect(result.ok).toBe(true)
  })
})
