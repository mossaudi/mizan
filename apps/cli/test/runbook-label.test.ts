import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { TRANSCRIPT_LABEL } from "@mizan/core"

/**
 * The runbook's printed labels and the schema's label table must be the same two strings
 * (SB-002), checked in both directions: a label the runbook prints that the schema does not
 * define is a runbook that teaches a lie, and a label the schema defines that the runbook
 * never shows is a judge who has never seen the honest one before the demo.
 */

const RUNBOOK_PATH = join(import.meta.dir, "..", "..", "..", "docs", "demo-runbook.md")

/** The lines the runbook presents as real header output: `transcript` plus four spaces. */
const printedLabels = (runbook: string): readonly string[] =>
  [...runbook.matchAll(/^transcript {4}(.+)$/gm)].map((match) => match[1] ?? "")

const schemaLabels: readonly string[] = Object.values(TRANSCRIPT_LABEL)

describe("the demo runbook prints exactly the labels the schema defines", () => {
  const runbook = readFileSync(RUNBOOK_PATH, "utf8")

  test("every label the runbook prints as output is a defined label", () => {
    const printed = printedLabels(runbook)
    expect(printed.length).toBeGreaterThanOrEqual(2)
    for (const label of printed) {
      expect(schemaLabels).toContain(label)
    }
  })

  test("every defined label appears in the runbook as printed output", () => {
    const printed = printedLabels(runbook)
    for (const label of schemaLabels) {
      expect(printed).toContain(label)
    }
  })

  test("the runbook states the rule both labels live under", () => {
    // The two strings are only honest together with the sentence that binds them: a keyed run
    // says LIVE, a replay says PRECOMPUTED, and there is no third state.
    expect(runbook).toContain("If it does not read `LIVE`, it was not a live run")
    expect(runbook).toContain("There is no third state")
  })
})
