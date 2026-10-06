import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The degradation matrix's four tables, checked against the code that must implement them
 * (SB-003). `packages/mizan-core/test/degradation.test.ts` already proves the matrix contains
 * the seven mode names and surfaces; the gaps it leaves are the ones this file closes — the
 * surfaces' exit codes must equal the CLI's exported constants, each mode's surface or trigger
 * must actually occur in the module that owns it, the suggestion states must be the `state`
 * values the suggestion pass constructs, and the clean-clone states must be the schema's own
 * literals. Every table is parsed from the document, so a renamed column is a failure, not a
 * silent re-read.
 */

const REPO = join(import.meta.dir, "..", "..", "..")
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8")
const MATRIX = read("docs/degradation-matrix.md")
const EXIT_CODES = read("apps/cli/src/exit-codes.ts")

const sectionBetween = (content: string, heading: string): string => {
  const start = content.indexOf(heading)
  expect(start).toBeGreaterThanOrEqual(0)
  const nextHeading = /\n(?:##|###) /g
  nextHeading.lastIndex = start + heading.length
  const next = nextHeading.exec(content)
  return content.slice(start, next === null ? undefined : next.index)
}

const tableRows = (section: string): readonly string[][] =>
  section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))

/** The seven modes: where the matrix claims a surface lives, and the code that must say it. */
const MODE_ANCHORS: readonly {
  readonly mode: number
  readonly matrixToken: string
  readonly matrixCell: "surface" | "trigger"
  readonly codePath: string
  readonly codeNeedle: string
  readonly exitConst: string
}[] = [
  { mode: 1, matrixToken: "model unavailable", matrixCell: "surface", codePath: "packages/mizan-agent/src/spine.ts", codeNeedle: 'model_unavailable: "model unavailable"', exitConst: "EXIT_DEGRADED" },
  { mode: 2, matrixToken: "no sources found", matrixCell: "surface", codePath: "packages/mizan-agent/src/spine.ts", codeNeedle: 'message: "no sources found"', exitConst: "EXIT_CORPUS_MISS" },
  { mode: 3, matrixToken: "unverifiable", matrixCell: "surface", codePath: "packages/mizan-verify/src/verify.ts", codeNeedle: 'verdict: "unverifiable"', exitConst: "EXIT_VERIFICATION_TIMEOUT" },
  { mode: 4, matrixToken: "untrusted", matrixCell: "surface", codePath: "packages/mizan-provenance/src/run-store.ts", codeNeedle: "The run is UNTRUSTED.", exitConst: "EXIT_LEDGER_WRITE_FAILURE" },
  { mode: 5, matrixToken: "attestation", matrixCell: "trigger", codePath: "packages/mizan-corpus/src/attest.ts", codeNeedle: '"attestation_mismatch"', exitConst: "EXIT_ATTESTATION_MISMATCH" },
  { mode: 6, matrixToken: "unavailable", matrixCell: "surface", codePath: "packages/mizan-retrieval/src/tools.ts", codeNeedle: '"backend_unavailable"', exitConst: "EXIT_TAFSIR_UNREACHABLE" },
  { mode: 7, matrixToken: "unavailable", matrixCell: "surface", codePath: "packages/mizan-retrieval/src/search.ts", codeNeedle: 'ranking: lists.length > 1 ? "fused" : "unavailable"', exitConst: "EXIT_RANKER_DOWN" },
]

const exportedExits = (): ReadonlyMap<string, number> => {
  const map = new Map<string, number>()
  for (const match of EXIT_CODES.matchAll(/export const (EXIT_[A-Z_]+) = (\d+)/g)) {
    const name = match[1]
    const value = match[2]
    if (name !== undefined && value !== undefined) map.set(name, Number(value))
  }
  return map
}

describe("the 7 failure modes", () => {
  const rows = tableRows(sectionBetween(MATRIX, "## The 7 Failure Modes")).slice(1)
  const exits = exportedExits()

  test("the matrix still names all 7 modes, once each, in order", () => {
    expect(rows).toHaveLength(7)
    expect(rows.map((row) => row[0])).toEqual(["1", "2", "3", "4", "5", "6", "7"])
  })

  test("each mode's surface or trigger actually occurs in the module that owns it", () => {
    for (const row of rows) {
      const anchor = MODE_ANCHORS.find((a) => a.mode === Number(row[0]))
      expect(anchor, `no anchor for mode ${row[0]}`).toBeDefined()
      if (anchor === undefined) continue
      const cell = row[anchor.matrixCell === "surface" ? 3 : 2] ?? ""
      expect(cell.toLowerCase()).toContain(anchor.matrixToken.toLowerCase())
      expect(read(anchor.codePath)).toContain(anchor.codeNeedle)
    }
  })

  test("each mode's exit code is the value the CLI exports under its own constant", () => {
    for (const row of rows) {
      const anchor = MODE_ANCHORS.find((a) => a.mode === Number(row[0]))
      expect(anchor, `no anchor for mode ${row[0]}`).toBeDefined()
      if (anchor === undefined) continue
      expect(exits.get(anchor.exitConst), `missing ${anchor.exitConst}`).toBe(Number(row[5]))
    }
  })
})

describe("the exit-code table", () => {
  const rows = tableRows(sectionBetween(MATRIX, "## Exit Codes")).slice(1)
  const exits = exportedExits()
  const BY_MEANING: readonly (readonly [string, string])[] = [
    ["Run completed", "EXIT_OK"],
    ["could not deliver a full answer", "EXIT_DEGRADED"],
    ["not usable", "EXIT_USAGE"],
    ["cannot be trusted", "EXIT_UNTRUSTED"],
  ]

  test("four codes, and each row's code is the exported value for its meaning", () => {
    expect(rows).toHaveLength(4)
    for (const [index, [meaningNeedle, exitConst]] of BY_MEANING.entries()) {
      const row = rows[index]
      expect(row).toBeDefined()
      if (row === undefined) continue
      expect(row[1]?.toLowerCase()).toContain(meaningNeedle.toLowerCase())
      const expected = exits.get(exitConst)
      expect(expected, `missing ${exitConst}`).toBeDefined()
      if (expected === undefined) continue
      expect(Number(row[0])).toBe(expected)
    }
  })
})

describe("the nearest-quote suggestion states", () => {
  const rows = tableRows(sectionBetween(MATRIX, "### Nearest-quote suggestions cannot fail into a badge")).slice(1)
  const SUGGESTIONS = read("apps/cli/src/suggestions.ts")

  test("the matrix names exactly the three states the pass constructs", () => {
    expect(rows).toHaveLength(3)
    const states = rows.map((row) => (row[0] ?? "").replaceAll("`", ""))
    expect(states.sort()).toEqual(["candidates", "no_candidates", "unavailable"].sort())
    for (const state of states) {
      expect(SUGGESTIONS).toContain(`state: "${state}"`)
    }
  })

  test("the fixed unavailable phrase is the one the pass emits", () => {
    expect(SUGGESTIONS).toContain("the corpus could not be searched for nearby records")
  })
})

describe("the clean-clone states", () => {
  const rows = tableRows(sectionBetween(MATRIX, "### The two states a checkout without a corpus hits")).slice(1)
  const DEGRADATION = read("packages/mizan-core/src/schema/degradation.ts")

  test("each state the matrix names is a literal of the degradation schema", () => {
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      // The table's second column carries the state word, backticked; the first describes the
      // condition. The word itself is what the schema and the surfaces must agree on.
      const state = (row[1] ?? "").replaceAll("`", "")
      expect(state, "a state column is empty").toBeDefined()
      if (state === "") continue
      expect(DEGRADATION).toContain(`Schema.Literal("${state}")`)
    }
  })

  test("the two surfaces name each clean-clone state with the same word", () => {
    const cliTests = read("apps/cli/test/clean-clone.test.ts")
    const mcpTests = read("packages/mizan-mcp/test/clean-clone.test.ts")
    for (const row of rows) {
      const state = (row[1] ?? "").replaceAll("`", "")
      expect(state).toBeDefined()
      if (state === "") continue
      expect(cliTests).toContain(state)
      expect(mcpTests).toContain(state)
    }
  })
})