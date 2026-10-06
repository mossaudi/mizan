import { describe, expect, test } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

/**
 * The v7 reconciliation log, checked structurally (SB-001).
 *
 * The log is the plan of record's evidence that the v7 baseline was read and disposed of —
 * eleven stories and four ADRs, each exactly once, each with one of the four dispositions the
 * plan allows — and that every ADR it cites exists. Sprint 2 (SB-009) extends this log with a
 * delta section; the helpers here are written to keep that extension a matter of adding a
 * section key to a table, not rewriting assertions.
 */

const REPO = join(import.meta.dir, "..", "..", "..")
const LOG = readFileSync(join(REPO, "docs", "specs", "v7-reconciliation.md"), "utf8")

const sectionBetween = (content: string, heading: string): string => {
  const start = content.indexOf(heading)
  expect(start).toBeGreaterThanOrEqual(0)
  const nextHeading = /\n## /g
  nextHeading.lastIndex = start + heading.length
  const next = nextHeading.exec(content)
  return content.slice(start, next === null ? undefined : next.index)
}

const tableRows = (section: string): readonly string[][] =>
  section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))

const rows = (heading: string): readonly string[][] => tableRows(sectionBetween(LOG, heading)).slice(1)

const DISPOSITIONS = ["accept", "adopt", "reject", "unverified"]

describe("Part A — the eleven v7 stories", () => {
  const storyRows = rows("## Part A — v7 story dispositions")

  test("every story 1 through 11 appears exactly once", () => {
    const ids = storyRows.map((row) => (/^Story (\d+):/.exec(row[0] ?? "")?.[1]))
    expect(ids.length).toBe(11)
    for (let n = 1; n <= 11; n += 1) {
      expect(ids.filter((id) => id === String(n))).toHaveLength(1)
    }
  })

  test("every disposition is one the plan allows, and the totals match the prose", () => {
    const dispositions = storyRows.map((row) => row[2])
    for (const disposition of dispositions) {
      if (disposition === undefined) continue
      expect(DISPOSITIONS).toContain(disposition)
    }
    expect(dispositions.filter((d) => d === "adopt")).toHaveLength(7)
    expect(dispositions.filter((d) => d === "reject")).toHaveLength(4)
    expect(LOG).toContain("Seven stories adopt and four reject")
  })

  test("the two Sprint 1 stories the plan ties to this log are adopted here and cited", () => {
    const story6 = storyRows.find((row) => row[0]?.startsWith("Story 6:"))
    const story7 = storyRows.find((row) => row[0]?.startsWith("Story 7:"))
    expect(story6?.[2]).toBe("adopt")
    expect(story6?.[4]).toContain("accept:customer")
    expect(story7?.[2]).toBe("adopt")
    expect(story7?.[4]).toContain("degradation-matrix.md")
  })
})

describe("Part B — the four v7 ADRs", () => {
  const adrRows = rows("## Part B — v7 ADR dispositions")

  test("ADR-15 through 18 each appear exactly once, with the recorded dispositions", () => {
    const ids = adrRows.map((row) => (/^ADR-(\d+) —/.exec(row[0] ?? "")?.[1]))
    expect(ids.length).toBe(4)
    expect(ids.filter((id) => id === "15")).toHaveLength(1)
    expect(ids.filter((id) => id === "16")).toHaveLength(1)
    expect(ids.filter((id) => id === "17")).toHaveLength(1)
    expect(ids.filter((id) => id === "18")).toHaveLength(1)
    const byId = new Map(adrRows.map((row) => [/^ADR-(\d+)/.exec(row[0] ?? "")?.[1], row[2]]))
    expect(byId.get("15")).toBe("adopt")
    expect(byId.get("16")).toBe("reject")
    expect(byId.get("17")).toBe("adopt")
    expect(byId.get("18")).toBe("reject")
  })
})

describe("the story trace and the citations", () => {
  test("SB-001 through SB-010 each appear exactly once in the trace table", () => {
    const traceRows = rows("## Sprint story trace (SB-001 through SB-010)")
    const ids = traceRows.map((row) => {
      const id = /^SB-(\d+)/.exec(row[0] ?? "")?.[1]
      return id === undefined ? undefined : Number(id)
    })
    for (let n = 1; n <= 10; n += 1) {
      expect(ids.filter((id) => id === n)).toHaveLength(1)
    }
  })

  test("every ADR the log cites exists as a decision record", () => {
    const cited = new Set<string>()
    for (const match of LOG.matchAll(/\bADR-(?:C\d+|\d{2,})\b/g)) {
      cited.add(match[0])
    }
    expect(cited.size).toBeGreaterThan(0)
    for (const id of cited) {
      expect(existsSync(join(REPO, "docs", "specs", "adr", `${id}.md`)), `${id} is cited but missing`).toBe(true)
    }
  })

  test("the fail-closed and security sections are present", () => {
    expect(LOG).toContain("## Fail-closed")
    expect(LOG).toContain("## Security")
  })
})