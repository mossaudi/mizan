import { describe, expect, test } from "bun:test"
import {
  caseCountsByCollection,
  coverageClaim,
  coverageFigures,
  presenceFor,
  renderCoverage,
  verdictCountsByCollection,
  type PresenceProbe,
} from "./coverage-tables.ts"

/**
 * The per-collection figures, tested without a corpus.
 *
 * These are the numbers a judge reads and the numbers `checkPresenceCollectionNamed` judges a document
 * by. Both were wrong at the same time in this repository — a corpus-wide "40 of 40" over a case set that
 * had never tried to falsify half the served books — so every assertion here is about a figure being
 * attributable rather than about a figure being correct.
 */
const CUTOFFS = [1, 3, 5]

/**
 * `count` probes for one collection, all reaching the given cut-offs.
 *
 * `expected` defaults to `rejected` because every case in `redteam-fabricated.json` is a fabrication,
 * and the gate's `eval-fabrication-not-rejected` rule requires it: a fixture whose default were
 * `verified` would be asserting the one thing this repository must never assert about its own red team.
 * A test that needs a different expectation names it explicitly, so the odd case is visible here rather
 * than buried in a default.
 */
const probesFor = (
  collection: string,
  count: number,
  reached: readonly boolean[] = [true, true, true],
  expected: PresenceProbe["expected"] = "rejected",
): readonly PresenceProbe[] => Array.from({ length: count }, () => ({ collection, reached, expected }))

const SERVED = { abudawud: 5272, ibnmajah: 4336, malik: 1829, nasai: 5672, quran: 6236, tirmidhi: 3889 }

/** The shape the committed set actually has: six collections, two of them on two cases. */
const SIX = [
  ...probesFor("abudawud", 15),
  ...probesFor("ibnmajah", 13),
  ...probesFor("malik", 5),
  ...probesFor("nasai", 3),
  ...probesFor("quran", 2),
  ...probesFor("tirmidhi", 2),
]

describe("per-collection case counts", () => {
  test("counts by the CITATION's collection, not by case order", () => {
    expect([...caseCountsByCollection(SIX)]).toEqual([
      ["abudawud", 15],
      ["ibnmajah", 13],
      ["malik", 5],
      ["nasai", 3],
      ["quran", 2],
      ["tirmidhi", 2],
    ])
  })

  test("keys are sorted, so the rendered table and the recorded keys cannot come apart", () => {
    const shuffled = [...probesFor("tirmidhi", 1), ...probesFor("abudawud", 1)]
    expect([...caseCountsByCollection(shuffled).keys()]).toEqual(["abudawud", "tirmidhi"])
  })

  test("an empty probe list is zero collections, not a crash", () => {
    expect(caseCountsByCollection([]).size).toBe(0)
  })
})

describe("per-collection presence", () => {
  test("counts a case at exactly the cut-off it reached, and not at one it did not", () => {
    // One case reaching top-3 but not top-5: the whole reason `reached` is a row rather than a boolean.
    const probes: readonly PresenceProbe[] = [
      { collection: "quran", reached: [false, true, false], expected: "rejected" },
      { collection: "quran", reached: [true, true, true], expected: "rejected" },
      { collection: "quran", reached: [false, false, false], expected: "rejected" },
    ]
    expect(presenceFor(probes, "quran", 0)).toBe(1)
    expect(presenceFor(probes, "quran", 1)).toBe(2)
    expect(presenceFor(probes, "quran", 2)).toBe(1)
  })

  test("a collection with no probes has no presence, which is not the same as zero presence", () => {
    expect(presenceFor(SIX, "malik", 0)).toBe(5)
    expect(presenceFor(SIX, "bukhari", 0)).toBe(0)
  })
})

describe("the published coverage figures", () => {
  const figures = coverageFigures(SIX, CUTOFFS, SERVED)

  test("every key is TOP LEVEL and numeric, because readFigures walks nothing else", () => {
    // A nested object would make every figure rule in the gate permanently green with nothing to
    // compare. Asserted on the actual object, not on the source, so a refactor that nests cannot pass.
    for (const [key, value] of Object.entries(figures)) {
      expect(typeof key).toBe("string")
      if (typeof value === "number") continue
      expect(key).toBe("suggestionCoverageCollections")
      expect(typeof value).toBe("string")
    }
  })

  test("names the collections it measured, comma-joined, and nothing else", () => {
    expect(figures.suggestionCoverageCollections).toBe("abudawud,ibnmajah,malik,nasai,quran,tirmidhi")
  })

  test("publishes each collection's case count under its own key", () => {
    expect(figures.suggestionCoverageCasesAbudawud).toBe(15)
    expect(figures.suggestionCoverageCasesQuran).toBe(2)
    expect(figures.suggestionCoverageCasesTirmidhi).toBe(2)
  })

  test("publishes presence per collection at every cut-off", () => {
    expect(figures.suggestionCoveragePresenceTop3Quran).toBe(2)
    expect(figures.suggestionCoveragePresenceTop5Abudawud).toBe(15)
  })

  test("publishes the containment figures per collection, which no other column carried", () => {
    // CR-3. `cases` and `top-N` are retrieval numbers: they say where the adjudicated record *ranked*.
    // "How many fabrications did this book catch" is a different question and was answered nowhere in
    // the repository except as the aggregate `falseVerifiedCount: 0` — which is precisely the aggregate
    // reading that hid three never-asked-about books.
    expect(figures.suggestionCoverageRejectedQuran).toBe(2)
    expect(figures.suggestionCoverageRejectedAbudawud).toBe(15)
    expect(figures.suggestionCoverageVerifiedAbudawud).toBe(0)
    expect(figures.suggestionCoverageVerifiedTirmidhi).toBe(0)
  })

  test("rejected equals cases for a fabrication set, because every case in it expects rejected", () => {
    // Not asserted by hand — asserted as the *invariant* the gate enforces, so if a case class ever
    // stopped expecting `rejected` this test and `eval-fabrication-not-rejected` would both change
    // shape together rather than the table quietly publishing a zero.
    for (const [collection, count] of caseCountsByCollection(SIX)) {
      const verdicts = verdictCountsByCollection(SIX).get(collection)
      expect(verdicts?.rejected).toBe(count)
      expect(verdicts?.verified).toBe(0)
    }
  })

  test("a case expecting `verified` is counted as verified, so a red team judging itself cannot pass", () => {
    // The figure is derived from the adjudication, so the test that proves it is derived is that a
    // different adjudication produces a different number. Were these figures a retyped constant, this
    // assertion could not be made.
    const probes = [...probesFor("quran", 2), ...probesFor("quran", 1, [true, true, true], "verified")]
    const verdicts = verdictCountsByCollection(probes).get("quran")
    expect(verdicts).toEqual({ rejected: 2, verified: 1 })
    expect(coverageFigures(probes, CUTOFFS, SERVED).suggestionCoverageVerifiedQuran).toBe(1)
    expect(coverageFigures(probes, CUTOFFS, SERVED).suggestionCoverageRejectedQuran).toBe(2)
  })

  test("an `unverifiable` expectation counts in neither figure", () => {
    // We declined to decide that one. Counting it as "not caught" would misreport the single number a
    // reader uses to ask whether this repository catches fabrications; counting it as caught would be
    // worse. It is absent from both columns and still counted in `cases`.
    const probes = [...probesFor("quran", 2), ...probesFor("quran", 1, [true, true, true], "unverifiable")]
    expect(verdictCountsByCollection(probes).get("quran")).toEqual({ rejected: 2, verified: 0 })
    expect(caseCountsByCollection(probes).get("quran")).toBe(3)
  })

  test("a collection with no cases is UNMEASURED, and its served records are counted as unmeasured", () => {
    // The defect this whole story exists over: three books were never asked about anything, so the
    // share a reader computed from the prose was wrong about most of the corpus.
    const three = [...probesFor("abudawud", 15), ...probesFor("ibnmajah", 13), ...probesFor("malik", 5)]
    const partial = coverageFigures(three, CUTOFFS, SERVED)
    expect(partial.suggestionCoverageMeasuredCollections).toBe(3)
    expect(partial.suggestionCoverageUnmeasuredCollections).toBe(3)
    expect(partial.suggestionCoverageMeasuredRecords).toBe(5272 + 4336 + 1829)
    expect(partial.suggestionCoverageUnmeasuredRecords).toBe(5672 + 6236 + 3889)
    // 11437 of 27234 — the "37.2%" in the old prose counted quran and tirmidhi as measured.
    expect(partial.suggestionCoverageSharePercent).toBe(42)
    expect(partial.suggestionCoverageCollections).toBe("abudawud,ibnmajah,malik")
  })

  test("the share is one decimal, because a share is not a precision the measurement has", () => {
    const one = coverageFigures([...probesFor("quran", 2)], CUTOFFS, SERVED)
    // 6236 of 27234 is 22.9%, and 1000x that is not an integer: a whole-number share would be 23.
    expect(one.suggestionCoverageSharePercent).toBe(22.9)
  })

  test("a served set of zero records is 0.0, not a crash and not a missing key", () => {
    const none = coverageFigures(SIX, CUTOFFS, {})
    expect(none.suggestionCoverageSharePercent).toBe(0)
    expect(none.suggestionCoverageMeasuredCollections).toBe(0)
  })
})

describe("the rendered table", () => {
  const table = renderCoverage(SIX, CUTOFFS, SERVED)

  test("carries the containment columns, because ranking is not containment", () => {
    // The header is the claim that the table answers the question, so it is asserted as a whole rather
    // than per column: a table with the right columns in the wrong order still fails the gate's row
    // check, and a reader reading this line should see the order too.
    expect(table.split("\n")[0]).toBe("| collection | cases | top-1 | top-3 | top-5 | rejected | verified | served records |")
  })

  test("repeats the denominator in every cell, because 2/2 and 2/15 are different claims", () => {
    expect(table).toContain("| quran | 2 | 2/2 | 2/2 | 2/2 | 2 | 0 | 6236 |")
    expect(table).toContain("| abudawud | 15 | 15/15 | 15/15 | 15/15 | 15 | 0 | 5272 |")
  })

  test("says `zero` for a served collection nobody asked about, and not `0/0`", () => {
    // `0` is what a measured-and-missed column prints. A served-but-unasked collection is a different
    // fact, and `0/0` is the sentence a reader cannot interpret.
    const partial = renderCoverage([...probesFor("abudawud", 4)], CUTOFFS, SERVED)
    expect(partial).toContain("| quran | 0 | zero | zero | zero | zero | zero | 6236 |")
    expect(partial).not.toContain("0/0")
  })

  test("names every served collection, so an unmeasured book is a row rather than an absence", () => {
    for (const collection of Object.keys(SERVED)) expect(table).toContain(`| ${collection} |`)
  })
})

describe("the claim sentence", () => {
  test("names every measured collection with its case count, and the thinnest one", () => {
    const sentence = coverageClaim(SIX, SERVED)
    expect(sentence).toContain("measured over all 6 served collections")
    expect(sentence).toContain("abudawud 15")
    expect(sentence).toContain("quran 2")
    // Ties are broken by the reduce's `weakest.cases <= cases` guard, so quran keeps the slot rather
    // than tirmidhi, whichever order the two arrive in.
    expect(sentence).toContain("the thinnest is quran at 2 cases")
  })

  test("an unmeasured collection makes the sentence say `N of M`, never `all N`", () => {
    // The honesty bug this sentence had: "all 3 served collections" while six were being served is the
    // exact corpus-wide reading the table exists to prevent, stated by the sentence summarising it.
    const partial = coverageClaim([...probesFor("abudawud", 15), ...probesFor("quran", 2)], SERVED)
    expect(partial).toContain("measured over 2 of the 6 served collections")
    expect(partial).not.toContain("all 2 served")
    expect(partial).not.toContain("all 6 served")
    expect(partial).toContain("abudawud 15, quran 2")
  })

  test("says so when nothing is measured, rather than printing an empty collection list", () => {
    const sentence = coverageClaim([], SERVED)
    expect(sentence).toContain("nothing to measure")
    expect(sentence).toContain("0 of the 6 served collections")
  })

  test("a single measured case reads as one case, not as ones", () => {
    expect(coverageClaim(probesFor("quran", 1), SERVED)).toContain("the thinnest is quran at 1 case")
    expect(coverageClaim(probesFor("quran", 2), SERVED)).toContain("at 2 cases")
  })
})
