import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ANCHOR_PROTOCOL_VERSION, decodeOrFail, decodeSync, isOk, AnchorAdjudicationSet, type AnchorAdjudication as AnchorAdjudicationType, type AnchorAdjudicationSet as AnchorAdjudicationSetType } from "@mizan/core"
import { stripCommentsOnly } from "@mizan/gate"
import { ADJUDICATION_ROWS, ADJUDICATION_TARGET, expectedAdjudicationCounts } from "../../../scripts/eval/adjudication.ts"
import { CASE_CLASSES } from "../../../scripts/eval/plan.ts"

/** The named decider, taken from the table rather than restated, so the two cannot drift. */
const DECIDED_BY = ADJUDICATION_ROWS[0]?.decidedBy ?? ""

/**
 * MIZ-105's table, read as a JUDGE would read it.
 *
 * ## Why this test reads the committed file and also the literals
 *
 * Both, and the two halves check different things. The committed file is what a judge opens, so
 * its shape, counts and wording are asserted directly — a file that decoded but was published empty
 * would satisfy a pure structural test. The literals in `adjudication.ts` are then reconciled
 * against it, which is the check that makes the file's provenance real: if someone hand-edited
 * `data/eval/adjudication.json`, the committed file would still decode perfectly, and only the
 * comparison against the table would notice.
 *
 * `eval.test.ts` separately proves the table cannot import the verifier, so neither side of this
 * test can have been produced by running the code it judges.
 *
 * ## Why the ban is asserted as PROSE and not just as a schema
 *
 * The `AnchorSpan` struct having two fields and no number is enforced by the type system. What a
 * schema cannot enforce is someone later adding a `similarity` column to the table, or writing a
 * locator that returns one. So the document's ban is read and checked here as text: the words
 * "score", "percent", "edit distance", "embedding" and "judgement" must appear in the ban, and the
 * prohibited API list must not have quietly lost an item. A protocol document that nobody checks
 * is a comment.
 */
const ROOT = join(import.meta.dir, "..", "..", "..")
const ADJUDICATION_PATH = join(ROOT, "data", "eval", "adjudication.json")
const PROTOCOL_PATH = join(ROOT, "docs", "anchor-protocol.md")

const readTable = (): AnchorAdjudicationSetType => {
  const decoded = decodeOrFail(decodeSync(AnchorAdjudicationSet), JSON.parse(readFileSync(ADJUDICATION_PATH, "utf8")) as unknown, ADJUDICATION_PATH)
  if (!isOk(decoded)) throw new Error(`cannot decode ${ADJUDICATION_PATH}: ${decoded.error.detail}`)
  return decoded.value
}

describe("the adjudication table is complete and self-describing", () => {
  test("it decodes through the schema core declares for it", () => {
    expect(readTable().decisions.length).toBe(ADJUDICATION_TARGET)
  })

  test("it has exactly the 66 decisions the architecture names: 40 fabrications and 26 elisions", () => {
    const table = readTable()
    expect(table.decisions).toHaveLength(66)
    expect(table.decidedCount).toBe(66)
    expect(table.undecidedCount).toBe(0)
  })

  test("decided and undecided counts sum to the decisions actually present", () => {
    const table = readTable()
    expect(table.decidedCount + table.undecidedCount).toBe(table.decisions.length)
  })

  test("every case id is unique, so no ruling is counted twice", () => {
    const ids = readTable().decisions.map((decision) => decision.caseId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("it covers every red-team case and every elision, and nothing else", () => {
    const ids = new Set(readTable().decisions.map((decision) => decision.caseId))
    const fabrications = [...Array(40).keys()].map((index) => `redteam-${String(index + 1).padStart(3, "0")}`)
    const elisions = [...Array(26).keys()].map((index) => `golden-${String(95 + index).padStart(3, "0")}`)
    for (const id of [...fabrications, ...elisions]) expect(ids.has(id)).toBe(true)
    expect(ids.size).toBe(66)
  })

  test("each class is ruled on exactly as many times as the plan declares cases of it", () => {
    // Reconciles the TABLE against `plan.ts`, which is the independent statement of the same fact.
    // Two sources for one number is only safe when a test cross-checks them, which is this.
    const redTeam = expectedAdjudicationCounts()
    const declared: Record<string, number> = {}
    for (const klass of CASE_CLASSES) {
      if (klass.redTeamCount > 0 || klass.id === "elide_middle") declared[klass.id] = klass.redTeamCount > 0 ? klass.redTeamCount : klass.goldenCount
    }
    expect(redTeam).toEqual(declared)
  })

  test("the artefact states it is hand-adjudicated and never observed from the verifier", () => {
    const table = readTable()
    expect(table.expectationSource).toContain("adjudication.ts")
    expect(table.expectationSource).toContain("@mizan/verify")
    // The provenance claim must be falsifiable, not decorative: it has to name what it is NOT.
    expect(table.expectationSource.toLowerCase()).toContain("never observed")
  })

  test("it says out loud that a ruling never confers verified", () => {
    expect(readTable().purpose).toContain("never confers `verified`")
  })

  test("it points at the protocol document the ban lives in", () => {
    expect(readTable().purpose).toContain("docs/anchor-protocol.md")
  })

  test("it is schema-versioned and points at the command that regenerates it", () => {
    const table = readTable()
    expect(table.schemaVersion).toBe(ANCHOR_PROTOCOL_VERSION)
    expect(table.regenerateWith).toBe("bun run build:eval")
  })
})

describe("every ruling is a person, a reason and a date", () => {
  test("decidedBy names a person and not a program", () => {
    for (const decision of readTable().decisions) {
      // The mechanical half of "hand-adjudicated": no path, no command, no script name. A row
      // whose decider is a program is a row the machine wrote about itself.
      expect(decision.decidedBy).not.toMatch(/[\\/]/)
      expect(decision.decidedBy).not.toMatch(/\.(ts|js|py|sh)$/)
      expect(decision.decidedBy).toBe(DECIDED_BY)
      expect(decision.decidedBy.length).toBeGreaterThan(0)
    }
  })

  test("decidedOn is an ISO date, so a fresh ruling is distinguishable from an old one", () => {
    for (const decision of readTable().decisions) expect(decision.decidedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test("every ruling carries a rationale long enough to be an argument", () => {
    // A ruling with no reasoning is a label, and a label in an adjudication artefact is
    // indistinguishable from a machine's guess. Two sentences is the floor.
    for (const decision of readTable().decisions) expect(decision.rationale.length).toBeGreaterThan(200)
  })

  test("every rationale states the limit: a bad locator cannot reach verified", () => {
    for (const decision of readTable().decisions) {
      expect(decision.rationale).toContain("never `verified`")
    }
  })

  test("there are two arguments, and the 66 rows cannot disagree within one", () => {
    // One rationale per ruling FAMILY, not one per row and not one per file. 66 copies of a single
    // paragraph is 66 places two of them could drift apart; a single paragraph for all 66 would
    // assert the same claim about a faithful elision and a one-word fabrication, which is false.
    const byRationale = new Map<string, number>()
    for (const decision of readTable().decisions) byRationale.set(decision.rationale, (byRationale.get(decision.rationale) ?? 0) + 1)
    expect(byRationale.size).toBe(2)
    expect([...byRationale.values()].sort()).toEqual([26, 40])
  })
})

describe("a ruling is a decision about text, never a promotion", () => {
  test("no ruling is verified, which is the property the whole protocol turns on", () => {
    for (const decision of readTable().decisions) expect(decision.adjudicatedVerdict).not.toBe("verified")
  })

  test("no ruling uses a reason outside the shared verdict vocabulary", () => {
    // `paraphrase_or_reworded` is NOT in `VerdictReason` today and must not be smuggled in here:
    // the vocabulary is the single source of truth, and a reason invented in the table would be a
    // second one. MIZ-106 adds the member to the vocabulary when the locator can produce it.
    for (const decision of readTable().decisions) {
      expect(["no_citation", "citation_cap_exceeded", "identifier_unresolved", "collection_ambiguous", "no_matching_evidence", "empty_quote", "quote_absent_at_cited_id"]).toContain(
        decision.adjudicatedReason,
      )
    }
  })

  test("the anchor on each row is the collection and number it was decided against", () => {
    for (const decision of readTable().decisions) expect(decision.anchor).toMatch(/^[a-z]+:\d+$/)
  })
})

describe("a fabrication is not a paraphrase, and the file says so", () => {
  /**
   * This is the assertion the previous version of the table could not survive.
   *
   * The old table gave all 66 rows one rationale saying a human "found the claim faithful in
   * substance". For a case with one word of twelve replaced that sentence is a misdescription of the
   * artefact, and an artefact that calls 40 fabrications faithful is one no judge should be shown.
   * So the split is asserted by COUNT and by the argument attached to each side, not by a comment.
   */
  const fabrication = (decision: AnchorAdjudicationType) => decision.caseId.startsWith("redteam-")
  const elision = (decision: AnchorAdjudicationType) => decision.caseId.startsWith("golden-")

  test("the 40 fabrications are rejected, because they assert what the source does not say", () => {
    const rows = readTable().decisions.filter(fabrication)
    expect(rows).toHaveLength(40)
    for (const decision of rows) {
      expect(decision.adjudicatedVerdict).toBe("rejected")
      expect(decision.adjudicatedReason).toBe("quote_absent_at_cited_id")
    }
  })

  test("the 26 elisions are unverifiable, because a re-rendering is not misquotation", () => {
    const rows = readTable().decisions.filter(elision)
    expect(rows).toHaveLength(26)
    for (const decision of rows) {
      expect(decision.adjudicatedVerdict).toBe("unverifiable")
      expect(decision.adjudicatedReason).toBe("no_matching_evidence")
    }
  })

  test("the fabrication rationale does not describe a fabrication as faithful", () => {
    const row = readTable().decisions.find(fabrication)
    expect(row).toBeDefined()
    expect(row?.rationale).toContain("fabricated span, not a re-rendering")
    expect(row?.rationale).not.toContain("found the claim faithful in substance")
  })

  test("the elision rationale is the one that says the claim is faithful", () => {
    const row = readTable().decisions.find(elision)
    expect(row).toBeDefined()
    expect(row?.rationale).toContain("faithful in substance")
  })

  test("a close fabrication is explicitly not thereby a paraphrase", () => {
    // `one_word_changed` is 11/12 real text, so the row that most invites the wrong ruling carries
    // the sentence that refuses it.
    const row = readTable().decisions.find((decision) => decision.caseId === "redteam-001")
    expect(row?.rationale).toContain("not thereby a paraphrase")
  })
})

describe("R-A1's movement is published, not asserted in a comment", () => {
  test("the artefact states how many fabrications the anchor arm will move off rejected", () => {
    // The whole fabrication family: every one of these spans is largely real text, so an anchor
    // drawn from it locates. Printing 40 is the honest cost; leaving the rows looking unchanged
    // would be the defect.
    expect(readTable().redTeamMovement.rejectedToUnverifiable).toBe(40)
  })

  test("the zero-verified bar is restated as a number next to the movement", () => {
    // A reader who sees "40 moved" and "0 became verified" in one object is being told exactly
    // what the movement costs and does not cost.
    expect(readTable().redTeamMovement.falseVerifiedDelta).toBe(0)
  })

  test("the movement cannot exceed the number of red-team cases the file decides", () => {
    const table = readTable()
    const fabrications = table.decisions.filter((decision) => decision.caseId.startsWith("redteam-")).length
    expect(table.redTeamMovement.rejectedToUnverifiable).toBeLessThanOrEqual(fabrications)
  })

  test("the published count matches the count of rows the table actually rules rejected", () => {
    // The figure is derived from the rulings, not typed alongside them, so the two cannot drift.
    const rejectedFabrications = readTable().decisions.filter((decision) => decision.caseId.startsWith("redteam-") && decision.adjudicatedVerdict === "rejected").length
    expect(readTable().redTeamMovement.rejectedToUnverifiable).toBe(rejectedFabrications)
  })
})

describe("the committed file is not a hand-edited divergence from the table", () => {
  test("every published decision matches the table's ruling for that case", () => {
    const byCaseId = new Map(ADJUDICATION_ROWS.map((row) => [row.caseId, row]))
    for (const decision of readTable().decisions) {
      const row = byCaseId.get(decision.caseId)
      if (row === undefined) throw new Error(`no table row for ${decision.caseId}`)
      expect(decision.adjudicatedVerdict).toBe(row.adjudicatedVerdict)
      expect(decision.adjudicatedReason).toBe(row.adjudicatedReason)
      expect(decision.rationale).toBe(row.rationale)
      expect(decision.decidedBy).toBe(row.decidedBy)
      expect(decision.decidedOn).toBe(row.decidedOn)
    }
  })

  test("the table has no ruling for a case the published file lacks", () => {
    expect(readTable().decisions.length).toBe(ADJUDICATION_ROWS.length)
  })
})

describe("the protocol document is checked, not merely written", () => {
  const document = (): string => readFileSync(PROTOCOL_PATH, "utf8")

  test("it exists, so the ban has somewhere to live", () => {
    expect(document().length).toBeGreaterThan(0)
  })

  test("it bans each prohibited technique by name", () => {
    const text = document().toLowerCase()
    for (const banned of ["similarity", "score", "edit distance", "embedding", "confidence", "judgement"]) {
      expect(text).toContain(banned)
    }
  })

  test("it states that a bad anchor can only yield unverifiable or rejected", () => {
    const text = document()
    expect(text).toContain("unverifiable")
    expect(text).toContain("rejected")
    // The sentence that makes the ban a safety property rather than a style preference.
    expect(text.replace(/\s+/g, " ")).toMatch(/only (ever )?(yield|produce|return)[^.]*(unverifiable|rejected)/)
  })

  test("it documents the locator contract as a two-field shape with no score", () => {
    const text = document().replace(/\s+/g, " ")
    expect(text).toContain("located")
    expect(text).toContain("span")
    expect(text).not.toMatch(/located[^.]{0,80}(score|percent|similarity|confidence)\s*[:=]/)
  })

  test("it records that the locator is mechanised, and publishes what activating it cost", () => {
    // The document is the place a reader checks the product's current behaviour, so activation
    // and its published price belong here and not only in the artefact's header. The negative
    // assertion is the one that matters: "decided, not yet mechanised" was the honest sentence
    // while the arm was inert, and it would be a lie the moment it stopped being true.
    const flat = document().replace(/\s+/g, " ")
    expect(document()).toContain("MIZ-106")
    expect(flat).not.toContain("not yet mechanised")
    expect(flat).toMatch(/Current status: mechanised/)
    expect(flat).toContain("no_matching_evidence")
    expect(flat).toContain("\"rejectedToUnverifiable\": 40")
    expect(flat).toContain("\"falseVerifiedDelta\": 0")
  })
})

describe("the guard on the table is the one the plan gets", () => {
  test("the table itself does not import the verifier, by any syntax", () => {
    // Duplicated from `eval.test.ts` rather than exported, and deliberately: this is a second
    // independent statement of the rule about the one file whose whole content is a decision, and
    // sharing a predicate with the other test would mean a bug in it silences both.
    const source = stripCommentsOnly(readFileSync(join(ROOT, "scripts", "eval", "adjudication.ts"), "utf8"))
    expect(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']@mizan\/verify["']/.test(source)).toBe(false)
  })
})
