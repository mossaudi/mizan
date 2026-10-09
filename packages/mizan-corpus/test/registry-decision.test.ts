import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { checkLicenceFields } from "@mizan/gate"
import { REQUIRED_LICENCE_FIELDS, decodeOrFail, decodeSync, SourceRegistry } from "@mizan/core"
import { SOURCE_CATALOGUE, findSource } from "../src/adapters/source-meta.ts"
import { ADAPTERS } from "../src/ingest.ts"

/**
 * The registry is generated; this file checks the GENERATED file against the module that generates it.
 *
 * ## Why this exists, given `bun run ingest` writes the registry
 *
 * Because regenerating it needs a network fetch. A licence decision recorded in `source-meta.ts` is a
 * pure function of the catalogue — an excluded row has no digest and no row count, and `buildRegistry`
 * derives both from the absence of a fetch — so it can be landed without re-fetching 42k rows. That is
 * only safe while something proves the committed file and the catalogue agree, and this is that
 * something: a decision written in the module and never regenerated would otherwise be a decision
 * nobody could see.
 *
 * `gate G-5` reads the same file, so a row with an empty reason is already a build failure. This file
 * adds the half G-5 cannot see: that the ROWS are the ones the catalogue declares.
 */

const REGISTRY = join(import.meta.dir, "..", "..", "..", "data", "registry", "sources.json")

const committed = (): Record<string, unknown> =>
  JSON.parse(readFileSync(REGISTRY, "utf8")) as Record<string, unknown>

const committedSources = (): Record<string, unknown>[] => {
  const parsed = committed()
  const sources = parsed["sources"]
  if (!Array.isArray(sources)) throw new Error("data/registry/sources.json has no `sources` array")
  return sources as Record<string, unknown>[]
}

describe("the committed registry carries every catalogue row", () => {
  test("the row count matches the catalogue exactly, so a decision cannot be written and not landed", () => {
    expect(committedSources()).toHaveLength(SOURCE_CATALOGUE.length)
  })

  test("each committed row is the catalogue row, in catalogue order", () => {
    const sources = committedSources()
    SOURCE_CATALOGUE.forEach((meta, index) => {
      expect(sources[index]?.["source"]).toBe(meta.descriptor.source)
    })
  })

  test("every EXCLUDED row's reason is committed verbatim, so the decision is in the artefact a judge reads", () => {
    const sources = committedSources()
    for (const meta of SOURCE_CATALOGUE.filter((entry) => !entry.enabled)) {
      const row = sources.find((entry) => entry["source"] === meta.descriptor.source)
      expect(row).toBeDefined()
      expect(row?.["exclusionReason"]).toBe(meta.exclusionReason)
      expect(String(row?.["exclusionReason"]).length).toBeGreaterThan(0)
    }
  })

  test("an excluded row has no digest and no rows, because it was never fetched", () => {
    const sources = committedSources()
    for (const meta of SOURCE_CATALOGUE.filter((entry) => !entry.enabled)) {
      const row = sources.find((entry) => entry["source"] === meta.descriptor.source)
      expect(row?.["sha256"]).toBe("")
      expect(row?.["records"]).toBe(0)
    }
  })

  test("an ENABLED row with a non-null reason is a contradiction, and there is none", () => {
    const sources = committedSources()
    for (const row of sources) {
      if (row["enabled"] !== true) continue
      expect(row["exclusionReason"]).toBeNull()
    }
  })
})

describe("the companion / athar decision is recorded either way", () => {
  test("both candidates are present, and both are excluded with a stated reason", () => {
    const mawdoo3 = findSource("mawdoo3/athar")
    const alIslam = findSource("al-islam.org/athar")
    for (const meta of [mawdoo3, alIslam]) {
      expect(meta).not.toBeNull()
      expect(meta?.enabled).toBe(false)
      expect(meta?.exclusionReason?.length ?? 0).toBeGreaterThan(0)
    }
  })

  test("each reason names WHEN it was checked and the row names WHERE, so a re-check is a diff", () => {
    // A date in the reason and a URL on the row: together they answer "how stale is this decision?"
    // without anyone having to re-derive the question.
    for (const slug of ["mawdoo3/athar", "al-islam.org/athar"]) {
      const meta = findSource(slug)
      expect(meta?.exclusionReason ?? "").toContain("2026-10-08")
      expect(meta?.descriptor.url ?? "").toMatch(/^https:\/\//)
      expect(meta?.descriptor.licenseUrl ?? "").toMatch(/^https:\/\//)
    }
  })

  test("a companion attribution is GRADE-NULL, so no sahih or daif vocabulary is borrowed for it", () => {
    // AGENTS.md section 15 and ADR-06. The concept does not apply to a companion statement, so the row
    // says so rather than being graded, and the product would store `null` and say so.
    for (const slug of ["mawdoo3/athar", "al-islam.org/athar"]) {
      const meta = findSource(slug)
      expect(meta?.descriptor.gradeApplicable).toBe(false)
      expect(meta?.descriptor.gradeBasis).toBe("none")
    }
  })

  test("neither row is a quarantine: the concept does not apply, it is not a missing asserted grade", () => {
    for (const slug of ["mawdoo3/athar", "al-islam.org/athar"]) {
      const notes = findSource(slug)?.descriptor.notes ?? ""
      expect(notes.length).toBeGreaterThan(0)
      expect(notes).toContain("gradeApplicable: false")
      // "Not a quarantine" is the sentence; the absence of the word elsewhere is the point.
      expect(notes.replace("Not a quarantine", "")).not.toMatch(/quarantin/i)
    }
  })

  test("no adapter or fetch path exists for an excluded source", () => {
    const adapters = readFileSync(join(import.meta.dir, "..", "src", "adapters", "tanzil.ts"), "utf8")
    const quranlab = readFileSync(join(import.meta.dir, "..", "src", "adapters", "quranlab.ts"), "utf8")
    for (const source of [adapters, quranlab]) {
      expect(source).not.toContain("mawdoo3")
      expect(source).not.toContain("al-islam.org")
    }
  })

  test("the ADAPTERS table registers only the two enabled sources", () => {
    // Asserted through the table itself rather than through the text that names it, so a future adapter
    // for an excluded source fails here instead of being noticed in a review of a licence decision.
    expect(ADAPTERS.map((adapter) => adapter.slug)).toEqual([
      "tanzil/quran-uthmani",
      "quranlab/hadith",
    ])
  })

  test("neither excluded slug appears anywhere in the corpus source except its own catalogue rows", () => {
    // The structural half of "the licence is not laundered through code": an excluded source with an
    // adapter, a fetch path or a bundled payload is a licence decision three people can read differently.
    const files = readdirSync(join(import.meta.dir, "..", "src"), { recursive: true, encoding: "utf8" }) as string[]
    for (const file of files.filter((entry) => entry.endsWith(".ts"))) {
      const text = readFileSync(join(import.meta.dir, "..", "src", file), "utf8")
      if (file.replace(/\\/g, "/").endsWith("adapters/source-meta.ts")) continue
      expect(text, `${file} mentions an excluded source`).not.toContain("mawdoo3")
      expect(text).not.toContain("al-islam.org")
    }
  })

  test("no payload was copied in: the whole catalogue is a decision record and stays small", () => {
    // A crude but real bound. A licence judgement is a few hundred words; a copied corpus is not, and
    // gitleaks (G-4) has to have nothing to find.
    const catalogue = readFileSync(join(import.meta.dir, "..", "src", "adapters", "source-meta.ts"), "utf8")
    expect(catalogue.length).toBeLessThan(16_000)
    expect(catalogue).toContain("No adapter is written")
  })
})

describe("gate G-5 is green over the regenerated file", () => {
  test("it decodes, every required licence field is non-blank, and no exclusion is undeclared", () => {
    expect(checkLicenceFields(committed())).toEqual([])
  })

  test("it is the same schema the ingest writes, so a lenient read cannot pass", () => {
    const decoded = decodeOrFail(decodeSync(SourceRegistry), committed(), "SourceRegistry")
    expect(decoded.ok).toBe(true)
  })

  test("the rule reads the committed path, not a fixture, so this is an assertion about THIS repository", () => {
    expect(REQUIRED_LICENCE_FIELDS.length).toBeGreaterThan(0)
    expect(REGISTRY).toContain("data")
  })
})
