import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { DocsClaim } from "../src/docs-claims.ts"
import { runDocsClaimChecks } from "../src/docs-check.ts"
import { CORPUS_SURFACE_EXTENSIONS, CORPUS_SURFACE_ROOTS, checkCorpusAbsenceUnstated } from "../src/docs-corpus.ts"
import { groupFigure } from "../src/docs-value.ts"

/**
 * Story 5 — the corpus-scope honesty sweep.
 *
 * The rule and the two acceptance criteria that are not the rule: every public surface states the
 * framing, and the published counts are the registry's own grouping rather than a number someone
 * typed. The framing is derived from `attestation.json` inside this file rather than written out,
 * so a Story 9 ingest that changes the count fails here instead of leaving a stale sentence behind.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const read = (relative: string): string => readFileSync(join(ROOT, relative), "utf8")

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((found) => found.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((found) => `${found.rule}: ${found.detail}`).join("\n")

/** Write `files` into a fresh temp directory and return its path. */
const tree = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "mizan-corpus-"))
  for (const [relative, body] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body, "utf8")
  }
  return root
}

type StatedAttestation = {
  readonly recordCount: number
  readonly collectionCounts: Readonly<Record<string, number>>
}

/**
 * Narrow rather than cast: a committed artefact is still a value this file has not verified, and a
 * `recordCount` that arrived as a string would make every assertion below compare a number to text.
 */
const readAttestation = (): StatedAttestation => {
  const parsed: unknown = JSON.parse(read("attestation.json"))
  if (typeof parsed !== "object" || parsed === null) throw new Error("attestation.json is not an object")
  const { recordCount, collectionCounts } = parsed as Record<string, unknown>
  if (typeof recordCount !== "number") throw new Error("attestation.json states no numeric recordCount")
  if (typeof collectionCounts !== "object" || collectionCounts === null) throw new Error("attestation.json states no collectionCounts")
  const counts: Record<string, number> = {}
  for (const [collection, value] of Object.entries(collectionCounts as Record<string, unknown>)) {
    if (typeof value !== "number") throw new Error(`attestation.json collectionCounts.${collection} is not a number`)
    counts[collection] = value
  }
  return { recordCount, collectionCounts: counts }
}

/** The registry regrouped by collection — the AC's "regrouped", computed rather than restated. */
const groupRegistry = (): { readonly counts: Readonly<Record<string, number>>; readonly total: number } => {
  const counts: Record<string, number> = {}
  let total = 0
  for (const line of read("data/registry/records.jsonl").split("\n")) {
    if (line === "") continue
    const row: unknown = JSON.parse(line)
    if (typeof row !== "object" || row === null) throw new Error("a registry row is not an object")
    const { collection } = row as Record<string, unknown>
    if (typeof collection !== "string") throw new Error("a registry row states no collection")
    counts[collection] = (counts[collection] ?? 0) + 1
    total += 1
  }
  return { counts, total }
}

describe("R15 — a public surface names an absent collection only to renounce it", () => {
  test("a line that states the absence passes, in either language", () => {
    expect(details(checkCorpusAbsenceUnstated("27,234 records. No Bukhari, no Muslim — recorded as absent.", "README.md"))).toBe("")
    expect(details(checkCorpusAbsenceUnstated("البخاري ومسلم مسجّلان «غائبَين» ولا يُعوَّضان.", "submission/deck.py"))).toBe("")
  })

  test("a line that claims coverage fails and names the file and the line", () => {
    const claims = checkCorpusAbsenceUnstated("We hold Bukhari and Muslim alongside the Sunan.\n", "README.md")
    expect(rules(claims)).toEqual(["corpus-absence-unstated"])
    expect(claims[0]?.file).toBe("README.md")
    expect(details(claims)).toContain("line 1")
  })

  test("the renunciation has to sit on the same line as the name", () => {
    // A document-level rule would pass this file: an absence *is* stated, three lines earlier.
    const document = "Bukhari is absent at record level.\n\nWe also ship Muslim.\n"
    const claims = checkCorpusAbsenceUnstated(document, "DISCLOSURE.md")
    expect(claims).toHaveLength(1)
    expect(details(claims)).toContain("line 3")
  })

  test("one finding per offending line, so the fix list is the file", () => {
    expect(checkCorpusAbsenceUnstated("Bukhari.\nMuslim.\n", "docs/notes.md")).toHaveLength(2)
  })

  test("the Arabic letters inside an ordinary word are not a mention at all", () => {
    // `المسلمين` contains `مسلم`; a rule that reported a sentence about the Muslims as a coverage
    // claim would be wrong often enough that somebody would switch it off (AGENTS.md §3).
    expect(checkCorpusAbsenceUnstated("خدمة المسلمين أولوية.\n", "docs/notes.md")).toEqual([])
  })

  test("an Arabic line that claims coverage without renouncing it fails", () => {
    expect(checkCorpusAbsenceUnstated("نغطي البخاري في مجموعتنا.\n", "submission/deck_ar.py")).toHaveLength(1)
  })
})

describe("the runner reads the surfaces a judge reads", () => {
  const corpusFindings = (root: string): readonly DocsClaim[] =>
    runDocsClaimChecks(root).claims.filter((found) => found.rule === "corpus-absence-unstated")

  test("the surface set is docs and submission, and it reads decks as well as markdown", () => {
    expect([...CORPUS_SURFACE_ROOTS]).toEqual(["docs", "submission"])
    expect([...CORPUS_SURFACE_EXTENSIONS]).toContain(".py")
    expect([...CORPUS_SURFACE_EXTENSIONS]).toContain(".md")
  })

  test("a deck under submission/ is a surface even though the gate sweep skips .py", () => {
    const claims = corpusFindings(tree({ "submission/make_deck.py": "slides = ['Covers Bukhari and Muslim']\n" }))
    expect(claims.map((found) => found.file)).toContain("submission/make_deck.py")
    expect(details(claims)).toContain("line 1")
  })

  test("a document under docs/ is a surface", () => {
    expect(corpusFindings(tree({ "docs/notes.md": "We ship Muslim.\n" }))).toHaveLength(1)
  })

  test("a fixture outside the surface set is not reported", () => {
    // This is why the rule does not ride the whole-tree sweep: the verifier's own fixtures cite
    // `bukhari:1` by the hundred, and every one of them is a true fact rather than a defect.
    expect(corpusFindings(tree({ "packages/mizan-verify/test/fixtures.ts": 'id: "bukhari:1",\n' }))).toEqual([])
  })

  test("the repository's own surfaces carry no covering claim, and all four are audited", () => {
    const result = runDocsClaimChecks(ROOT)
    expect(rules(result.claims).filter((rule) => rule === "corpus-absence-unstated")).toEqual([])
    for (const surface of ["README.md", "docs/specs/adr/ADR-C4.md", "submission/make_deck.py", "submission/make_deck_ar.py"]) {
      expect(result.checked).toContain(surface)
    }
  })
})

describe("every surface states the framing, derived from the attestation (Story 5, AC1)", () => {
  const attestation = readAttestation()
  const framing = `4 Sunan + Muwatta + Qur'an, ${groupFigure(attestation.recordCount)} records`

  test("README states the framing the attestation backs", () => {
    expect(read("README.md")).toContain(framing)
  })

  test("the English deck's corpus slide states the same framing", () => {
    expect(read("submission/make_deck.py")).toContain(framing)
  })

  test("the Arabic deck states the same figure with every collection named", () => {
    const line = read("submission/make_deck_ar.py").split("\n").find((text) => text.includes("سنن")) ?? ""
    expect(line).toContain(groupFigure(attestation.recordCount))
    for (const collection of ["القرآن", "النسائي", "أبو داود", "ابن ماجه", "الترمذي", "موطأ"]) {
      expect(line).toContain(collection)
    }
  })
})

describe("the published counts are the registry's own grouping (Story 5, AC3)", () => {
  test("regrouping the registry by collection reproduces the attested counts exactly", () => {
    const registry = groupRegistry()
    expect(registry.counts).toEqual(readAttestation().collectionCounts)
  })

  test("the grouped total is the attested recordCount", () => {
    expect(groupRegistry().total).toBe(readAttestation().recordCount)
  })

  test("neither absent collection appears as a collection of the corpus", () => {
    const collections = Object.keys(groupRegistry().counts)
    expect(collections).not.toContain("bukhari")
    expect(collections).not.toContain("muslim")
  })
})
