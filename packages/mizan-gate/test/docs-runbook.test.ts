import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { DocsClaim } from "../src/docs-claims.ts"
import { DEMO_RUNBOOK, runDocsClaimChecks } from "../src/docs-check.ts"
import { checkRunbookOrder, KEYED_LIVE_PATH, REPLAY_PATH } from "../src/docs-runbook.ts"

/**
 * R16 — the demo runbook keeps a live run ahead of a labelled replay (Story 4).
 *
 * Every finding here has a planted violation that must fail, because a rule that cannot fail is a
 * comment (AGENTS.md §14). The two absences are planted too: a runbook documenting only one of the
 * two routes is the defect this rule exists for, and an "order" check that no ordering could trip
 * would be the one thing a reviewer would not think to test.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const RUNBOOK = "docs/demo-runbook.md"
const read = (relative: string): string => readFileSync(join(ROOT, relative), "utf8")

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((found) => found.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((found) => `${found.rule}: ${found.detail}`).join("\n")

/** A runbook that satisfies every rule, assembled from fragments so no fixture reads a real document. */
const GOOD = [
  "# Demo runbook",
  "",
  "## 1. Live, keyed",
  "",
  "Set `MIZAN_LLM_API_KEY` in the environment and the header reads LIVE.",
  "",
  "## 2. Replay, labelled",
  "",
  "With no key, run `MIZAN_PROVIDER=scripted` and the header reads PRECOMPUTED.",
  "",
].join("\n")

describe("R16 — the live keyed run is documented before the replay", () => {
  test("a runbook in the right order with both labels passes", () => {
    expect(details(checkRunbookOrder(GOOD, RUNBOOK))).toBe("")
  })

  test("a replay offered before the keyed run fails, and names both line numbers", () => {
    // The planted violation is a whole reordered runbook, not a fragment, because the defect is a
    // relationship between two places and a rule over one place could not express it.
    const document = [
      "# Demo runbook",
      "",
      "## 1. Replay, labelled",
      "",
      "With no key, run `MIZAN_PROVIDER=scripted` and the header reads PRECOMPUTED.",
      "",
      "## 2. Live, keyed",
      "",
      "Set `MIZAN_LLM_API_KEY` in the environment and the header reads LIVE.",
      "",
    ].join("\n")
    const claims = checkRunbookOrder(document, RUNBOOK)
    expect(rules(claims)).toEqual(["runbook-live-after-replay"])
    expect(details(claims)).toContain("line 5")
    expect(details(claims)).toContain("line 9")
  })

  test("a runbook documenting only the replay fails rather than passing an empty comparison", () => {
    const document = ["# Demo runbook", "", "## Replay", "", "The header reads PRECOMPUTED.", ""].join("\n")
    const claims = checkRunbookOrder(document, RUNBOOK)
    // One finding, not two: with no keyed step anywhere there is no live section to leave unlabelled,
    // and inventing a second finding for it would train a reader to ignore the message.
    expect(rules(claims)).toEqual(["runbook-no-live-path"])
    expect(details(claims)).toContain("never shows a keyed live run")
  })

  test("a runbook documenting only the live run fails, because the fallback is the point", () => {
    const document = ["# Demo runbook", "", "## Live", "", "Set `MIZAN_LLM_API_KEY`; the header reads LIVE.", ""].join("\n")
    const claims = checkRunbookOrder(document, RUNBOOK)
    expect(rules(claims)).toEqual(["runbook-no-replay"])
    expect(details(claims)).toContain("never offers the replay as a labelled fallback")
  })
})

describe("R16 — each step says what the header will read", () => {
  test("a live step that never names LIVE fails, even though a later section does", () => {
    // A document-level rule would pass this: `LIVE` appears, in the wrong section, after the
    // instruction a reader has already followed. The label has to travel with the command.
    const document = [
      "# Demo runbook",
      "",
      "## 1. Live, keyed",
      "",
      "Set `MIZAN_LLM_API_KEY` in the environment and run it.",
      "",
      "## 2. Replay, labelled",
      "",
      "`MIZAN_PROVIDER=scripted` and the header reads PRECOMPUTED.",
      "",
      "## Appendix",
      "",
      "LIVE is what a generated run prints.",
      "",
    ].join("\n")
    const claims = checkRunbookOrder(document, RUNBOOK)
    expect(rules(claims)).toEqual(["runbook-live-unlabelled"])
    expect(details(claims)).toContain("line 5")
  })

  test("a replay step that never names PRECOMPUTED fails", () => {
    const document = [
      "# Demo runbook",
      "",
      "## 1. Live, keyed",
      "",
      "Set `MIZAN_LLM_API_KEY`; the header reads LIVE.",
      "",
      "## 2. Replay",
      "",
      "Run `MIZAN_PROVIDER=scripted` when you have no key.",
      "",
    ].join("\n")
    const claims = checkRunbookOrder(document, RUNBOOK)
    expect(rules(claims)).toEqual(["runbook-replay-unlabelled"])
    expect(details(claims)).toContain("PRECOMPUTED")
  })

  test("a word that merely contains LIVE is not the label", () => {
    // `DELIVERED` contains the letters; without the word boundary the rule would pass a step that
    // never told a reader what to look for, which is the defect itself.
    const document = [
      "# Demo runbook",
      "",
      "## 1. Live, keyed",
      "",
      "Set `MIZAN_LLM_API_KEY`; the answer is DELIVERED to your terminal.",
      "",
      "## 2. Replay",
      "",
      "Run `MIZAN_PROVIDER=scripted` and read PRECOMPUTED.",
      "",
    ].join("\n")
    expect(rules(checkRunbookOrder(document, RUNBOOK))).toEqual(["runbook-live-unlabelled"])
  })

  test("a fragment with no heading is audited as if it were the whole document", () => {
    const document = "Set `MIZAN_LLM_API_KEY` and then `MIZAN_PROVIDER=scripted` for the replay.\n"
    const claims = checkRunbookOrder(document, RUNBOOK)
    expect(rules(claims)).toEqual(["runbook-live-unlabelled", "runbook-replay-unlabelled"])
  })
})

describe("this repository's own runbook satisfies the rule (Story 4, AC1 and AC2)", () => {
  const document = read(RUNBOOK)

  test("the runbook exists, and is the document the rule was written for", () => {
    expect(existsSync(join(ROOT, RUNBOOK))).toBe(true)
    expect(DEMO_RUNBOOK).toBe(RUNBOOK)
  })

  test("it passes the rule that orders it", () => {
    expect(details(checkRunbookOrder(document, RUNBOOK))).toBe("")
  })

  test("the live step is the first of the two, by the line the marker is found on", () => {
    const rows = document.split("\n")
    const keyed = rows.findIndex((row) => KEYED_LIVE_PATH.test(row))
    const replay = rows.findIndex((row) => REPLAY_PATH.test(row))
    expect(keyed).toBeGreaterThan(-1)
    expect(replay).toBeGreaterThan(keyed)
  })

  test("it prints the label the terminal prints, in the step that produces it", () => {
    // Both labels are the strings `transcriptLabel` returns, so a rename in `@mizan/core` breaks
    // this assertion rather than leaving a runbook that describes an older product.
    expect(document).toContain("transcript    LIVE")
    expect(document).toContain("transcript    PRECOMPUTED (deterministic replay)")
  })

  test("it names no key material, and the fallback line it documents is the one main.ts prints", () => {
    expect(document).not.toMatch(/\bsk-[A-Za-z0-9]{8,}/)
    const main = read("apps/cli/src/main.ts")
    expect(main).toContain("the header will read")
    expect(document).toContain("the header will read")
  })

  test("it is audited by the runner as a document, so its paths and commands are checked too", () => {
    // R1 and R4 on a runbook are worth more than on most documents: a renamed script here costs a
    // judge the exact sixty seconds the runbook promised them.
    expect(runDocsClaimChecks(ROOT).checked).toContain(RUNBOOK)
    expect(rules(runDocsClaimChecks(ROOT).claims).filter((rule) => rule.startsWith("runbook-"))).toEqual([])
  })
})
