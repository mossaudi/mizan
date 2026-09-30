import { describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  ADR_DIRECTORY,
  checkAdrCitationUnresolved,
  checkAdrDocument,
  runDocsClaimChecks,
  type DocsClaim,
} from "../src/index.ts"

/**
 * Tests for Story 7's two rules: an ADR citation must resolve, and a file in the ADR directory
 * must record a decision someone can read back.
 *
 * Every identifier below is assembled from fragments. `docs-check.ts` sweeps this file like any
 * other, so a planted `ADR-` citation written as a literal would be reported by the very rule the
 * test is exercising — a self-inflicted finding that would either fail CI or force the rule to be
 * loosened. `docs-gates.test.ts` established the technique for gate ids; this is the same move.
 */

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((claim) => claim.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((claim) => `${claim.rule}: ${claim.detail}`).join("\n")

const TOKEN = "ADR" + "-"
const RESOLVED = `${TOKEN}C1`
const DANGLING = `${TOKEN}C99`
const LEGACY_OK = `${TOKEN}03`
const LEGACY_DANGLING = `${TOKEN}42`
const LOWER_CASE = `${TOKEN}c1`

/** The placeholder forms a writer reaches for before the number is decided. None is a citation. */
const PLACEHOLDERS = [`${TOKEN}0x`, `${TOKEN}0N`, `${TOKEN}nn`]

/** The identifier the runner fixtures cite, chosen so the pattern above actually reads it. */
const SAMPLE = `${TOKEN}C7`

const available = new Set([RESOLVED, LEGACY_OK])

/** Write `files` into a fresh temp directory and return its path. */
const tree = (files: Readonly<Record<string, string>>): string => {
  const root = join(tmpdir(), `mizan-adr-${crypto.randomUUID()}`)
  for (const [relative, body] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body, "utf8")
  }
  return root
}

/** A complete ADR body: the four fields `checkAdrDocument` requires, and nothing it does not. */
const adrBody = (status = "Accepted"): string =>
  [`# ${SAMPLE} — a decision`, "", `- **Status:** ${status}`, "", "## Context", "Why this came up.", "", "## Decision", "What was decided.", "", "## Consequences", "What follows from it.", ""].join("\n")

/** The body of one `##` section, so an assertion can be about a decision rather than a whole file. */
const section = (body: string, heading: string): string => {
  const start = body.indexOf(heading)
  if (start === -1) return ""
  const rest = body.slice(start)
  const end = rest.indexOf("\n## ", 1)
  return end === -1 ? rest : rest.slice(0, end)
}

describe("R12 — an ADR citation must resolve to a document", () => {
  test("passes a file whose citations all have documents, in both namespaces", () => {
    const text = `The rule is ${RESOLVED}; the historic one is ${LEGACY_OK}.`
    expect(details(checkAdrCitationUnresolved(text, "README.md", available))).toBe("")
  })

  test("names a citation with no document, and says where the document belongs", () => {
    // The remediation is in the message: which identifier, and which directory is missing it.
    const claims = checkAdrCitationUnresolved(`The authority is ${DANGLING}.`, "README.md", available)
    expect(rules(claims)).toEqual(["adr-citation-unresolved"])
    expect(details(claims)).toContain(DANGLING)
    expect(details(claims)).toContain(ADR_DIRECTORY)
  })

  test("reports the same missing identifier once, however many times it is cited", () => {
    // Eleven citations of one missing ADR are one defect. Eleven findings for it are a reason to
    // skim the report rather than act on it.
    const text = `${DANGLING}\nand again ${DANGLING}\nand once more ${DANGLING}`
    const claims = checkAdrCitationUnresolved(text, "README.md", available)
    expect(claims).toHaveLength(1)
    expect(details(claims)).toContain(DANGLING)
  })

  test("reports every distinct missing identifier, so one pass names them all", () => {
    const claims = checkAdrCitationUnresolved(`${DANGLING} and ${LEGACY_DANGLING}`, "README.md", available)
    expect(claims).toHaveLength(2)
    expect(details(claims)).toContain(LEGACY_DANGLING)
  })

  test("a repository with no ADR directory fails closed rather than skipping", () => {
    // An empty set means "nothing resolves", not "nothing to check". Skipping here would make the
    // worst case — the documents were never written — the one case that passes.
    const claims = checkAdrCitationUnresolved(`See ${RESOLVED}.`, "README.md", new Set())
    expect(rules(claims)).toEqual(["adr-citation-unresolved"])
  })

  test("ignores the placeholder forms, which are not citations of anything", () => {
    // A rule that reports a placeholder trains its reader to skim, which is how a real dangling
    // citation gets past it.
    for (const placeholder of PLACEHOLDERS) {
      expect(details(checkAdrCitationUnresolved(placeholder, "README.md", new Set()))).toBe("")
    }
  })

  test("matches identifiers case-sensitively, so a lower-cased citation is still dangling", () => {
    // On the Windows CI matrix an `existsSync` check would resolve this and a Linux run would not,
    // which means the green run is the one nobody re-checks.
    const claims = checkAdrCitationUnresolved(`See ${LOWER_CASE}.`, "README.md", available)
    expect(rules(claims)).toEqual(["adr-citation-unresolved"])
    expect(details(claims)).toContain(LOWER_CASE)
  })
})

describe("R13 — an ADR records a decision someone can read back", () => {
  const label = `${ADR_DIRECTORY}/${SAMPLE}.md`

  test("passes a document with a context, a decision, consequences and an accepted status", () => {
    expect(details(checkAdrDocument(adrBody(), label))).toBe("")
  })

  test("names the section a document is missing", () => {
    const stub = "# A decision record\n\n- **Status:** Accepted\n\n## Context\nOnly this.\n"
    const claims = checkAdrDocument(stub, label)
    expect(rules(claims)).toEqual(["adr-document-incomplete", "adr-document-incomplete"])
    expect(details(claims)).toContain("## Decision")
    expect(details(claims)).toContain("## Consequences")
  })

  test("a status left at draft is a decision not made, and is reported as one", () => {
    // The file exists and the citation resolves — which is exactly why resolution alone is not
    // enough. An ADR that answers nothing is the defect behind "status left as draft".
    const claims = checkAdrDocument(adrBody("Draft"), label)
    expect(rules(claims)).toEqual(["adr-document-incomplete"])
    expect(details(claims)).toContain("Accepted")
  })
})

describe("the runner wires both rules, so neither is a function nothing calls", () => {
  const clean = {
    "DISCLOSURE.md": "Two disclosed provider modes.\n",
    "README.md": "Run `bun run verify`.\n",
    "INTEGRITY.md": "The snapshot is attested.\n",
    "package.json": JSON.stringify({ scripts: { verify: "bun run scripts/verify-ledger.ts" } }),
    [`${ADR_DIRECTORY}/${SAMPLE}.md`]: adrBody(),
    "docs/notes.md": `The decision follows ${SAMPLE}.\n`,
  }

  test("a document citing an ADR that exists produces no finding from either rule", () => {
    const result = runDocsClaimChecks(tree(clean))
    expect(rules(result.claims).filter((rule) => rule.startsWith("adr-"))).toEqual([])
  })

  test("a citation with no document fails the build and names it", () => {
    const result = runDocsClaimChecks(tree({ ...clean, "docs/notes.md": `The decision follows ${DANGLING}.\n` }))
    expect(result.ok).toBe(false)
    expect(rules(result.claims)).toContain("adr-citation-unresolved")
    expect(details(result.claims)).toContain(DANGLING)
  })

  test("an ADR left at draft fails the build even though its citation resolves", () => {
    const result = runDocsClaimChecks(tree({ ...clean, [`${ADR_DIRECTORY}/${SAMPLE}.md`]: adrBody("Draft") }))
    expect(result.ok).toBe(false)
    expect(rules(result.claims)).toContain("adr-document-incomplete")
  })
})

/** The repository's own ADR directory, read rather than declared. */
const ADR_ROOT = join(import.meta.dir, "..", "..", "..", ADR_DIRECTORY)

describe("the repository's own ADRs — the acceptance criteria, against the real files", () => {
  test("every identifier cited anywhere in the tree resolves to a document", () => {
    // s7-ac1 and s7-ac2 in one assertion: the runner walks the whole tree, and a dangling citation
    // anywhere makes it fail. This is the same walk `bun run check:docs` performs, asserted here so
    // the acceptance criterion has a test name rather than only a CI step.
    const result = runDocsClaimChecks(join(import.meta.dir, "..", "..", ".."))
    const adrFindings = result.claims.filter((claim) => claim.rule === "adr-citation-unresolved")
    expect(details(adrFindings)).toBe("")
    expect(result.swept).toBeGreaterThan(0)
  })

  test("every document in the directory records a complete, accepted decision", () => {
    const files = readdirSync(ADR_ROOT)
      .filter((name) => name.startsWith("ADR" + "-") && name.endsWith(".md"))
      .sort()
    // Six legacy identifiers and the five recorded this cycle — the set the citations name.
    expect(files).toHaveLength(11)
    const incomplete: string[] = []
    for (const name of files) {
      const claims = checkAdrDocument(readFileSync(join(ADR_ROOT, name), "utf8"), `${ADR_DIRECTORY}/${name}`)
      const found = details(claims)
      // One entry per defective file, so a failure names it rather than printing a wall of text.
      if (found !== "") incomplete.push(`${name}: ${found}`)
    }
    expect(incomplete).toEqual([])
  })

  test("the elision ADR records the verdict the rulings and the code now agree on", () => {
    // s7-ac3: content, not just shape. A complete-looking file whose *decision* still said
    // `rejected` would satisfy every structural check above and contradict the 26 adjudicated
    // rulings — which is the whole defect this ADR exists to record.
    const body = readFileSync(join(ADR_ROOT, `${TOKEN}C1.md`), "utf8")
    const decision = section(body, "## Decision")
    expect(decision).toContain("UNVERIFIABLE")
    expect(decision).toContain("no_matching_evidence")
    expect(decision).not.toContain("REJECTED")
  })
})
