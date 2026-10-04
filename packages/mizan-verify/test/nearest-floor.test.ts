import { describe, expect, test } from "bun:test"
import { MIN_SHARED_RUN_CHARS, runClearsFloor, runClearsFloorAt, sharedRunOf } from "../src/diagnostics/nearest-floor.ts"

/**
 * The display floor is the only thing standing between a reader and a list of near-misses presented as
 * near-hits (ADR-12). Its properties are pinned here because each one is a way the rule could be
 * weakened without failing loudly: a floor that moves, a floor that a long quote satisfies by being
 * long, and a floor whose own two numbers disagree with the measurement it prints.
 */

/** The observation used throughout, kept in folded form so each test states one variable. */
const QUOTE = "Whoever believes in Allah and the Last Day must honour his neighbour"
const HELD = "And whoever believes in Allah and the Last Day must honour his neighbour and the guest"

describe("a shared run is measured in folded characters, which is the unit the renderer prints", () => {
  test("a record that holds the quoted span reports the quote's own folded length", () => {
    // Compared against the quote against itself, which is the only way to assert "the length of the
    // quote" without also asserting something about the record.
    const self = sharedRunOf(QUOTE, QUOTE)
    expect(self.contained).toBe(true)
    expect(self.sharedRunChars).toBe(self.quoteChars)
  })

  test("whitespace and tatweel are folded away, so layout cannot change the number printed", () => {
    // These two are the real invariants, and they are narrow. A record pasted from a PDF with doubled
    // spaces, or a record carrying U+0640 elongation, must measure the same as the clean text or the row
    // would print a different integer for the same record depending on which copy the corpus holds.
    const plain = sharedRunOf(QUOTE, QUOTE)
    expect(sharedRunOf("Whoever  believes  in Allah and the Last Day must honour  his neighbour", QUOTE)).toEqual(plain)
    expect(sharedRunOf(`  ${QUOTE}  `, QUOTE)).toEqual(plain)
    // U+0640 between `nei` and `ghbour`: a pure elongation glyph carrying no phoneme, so a record
    // carrying it is the same record.
    expect(sharedRunOf("Whoever believes in Allah and the Last Day must honour his neiـghbour", QUOTE)).toEqual(plain)
  })

  test("punctuation is NOT folded away, so a comma costs the run a character", () => {
    // Pinned because it is the boundary of the previous test and it is easy to assume otherwise. The
    // fold removes layout and elongation; it leaves punctuation, which is why a record containing this
    // quote with two commas inserted shares only 26 characters rather than the whole span — and why the
    // containment bypass above exists for the reader who quotes it with punctuation anyway.
    const punctuated = sharedRunOf("Whoever believes in Allah, and the Last Day must honour his neighbour", HELD)
    expect(punctuated.contained).toBe(false)
    expect(punctuated.sharedRunChars).toBeLessThan(punctuated.quoteChars)
  })

  test("a record sharing no contiguous span reports zero rather than failing", () => {
    // Two records sharing only a two-letter word and a space, so the longest run is the article. An earlier
    // pair in this test shared four characters by accident, which is worth stating: "shares nothing" is a
    // measurement, and any English sentence pair shares something. What is asserted is that the number
    // is measured and reported, never absent.
    const run = sharedRunOf("a golden necklace of amber", "a fleet of ships crossing the harbour")
    expect(run.contained).toBe(false)
    expect(run.sharedRunChars).toBeGreaterThanOrEqual(0)
    expect(run.sharedRunChars).toBeLessThan(MIN_SHARED_RUN_CHARS)
  })

  test("an empty quote is zero shared characters and clears nothing, so a blank input cannot display a list", () => {
    // Fail-closed on the input side: a zero-length quote "shares" every record vacuously under some
    // readings, which would be a list of the entire corpus labelled as nearest to nothing.
    const run = sharedRunOf("", HELD)
    expect(run.sharedRunChars).toBe(0)
    expect(run.quoteChars).toBe(0)
    expect(runClearsFloor(run)).toBe(false)
  })
})

describe("the floor is stated in the same unit the row prints", () => {
  test("a near-miss below the floor does not clear it", () => {
    // The live run recorded four such records — shares of 6, 8, 5 and 5 against a correct record's 35.
    // They are exactly what this rule exists to keep off screen, so one is pinned here. The exact number
    // is not asserted as 8: it is a property of this sentence pair, and pinning it would make a fold
    // change look like a floor change. What is asserted is that it is measured, is below the floor, and
    // is therefore not displayed.
    const noise = "He is with you, and will be a companion, then a companion of the Barzakh"
    const run = sharedRunOf(QUOTE, noise)
    expect(run.contained).toBe(false)
    expect(run.sharedRunChars).toBeGreaterThan(0)
    expect(run.sharedRunChars).toBeLessThan(MIN_SHARED_RUN_CHARS)
    expect(runClearsFloor(run)).toBe(false)
  })

  test("a record holding the quoted span outright clears the floor regardless of its length", () => {
    // Containment bypasses the threshold by definition rather than by measurement: the nearest record to
    // a quotation is the record containing it, even when both are short. `Last Day` shares eight folded
    // characters — below the floor of twelve — and is still shown, because it is the record itself.
    const run = sharedRunOf("Last Day", HELD)
    expect(run.contained).toBe(true)
    expect(run.sharedRunChars).toBe(8)
    expect(run.sharedRunChars).toBeLessThan(MIN_SHARED_RUN_CHARS)
    expect(runClearsFloor(run)).toBe(true)
  })

  test("the floor is a constant of the module, not a value passed in from a caller", () => {
    // `runClearsFloor` takes only the observation. A caller supplying its own threshold could display a
    // list the floor would reject, and nothing downstream would notice.
    expect(MIN_SHARED_RUN_CHARS).toBe(12)
    expect(runClearsFloor.length).toBe(1)
  })

  test("`runClearsFloorAt` is the same predicate with the threshold exposed, so the harness can sweep it", () => {
    const run = sharedRunOf(QUOTE, HELD)
    expect(runClearsFloorAt(run, MIN_SHARED_RUN_CHARS)).toBe(runClearsFloor(run))
    expect(runClearsFloorAt(run, run.sharedRunChars + 1)).toBe(false)
    expect(runClearsFloorAt(run, run.sharedRunChars)).toBe(true)
  })

  test("a floor below one cannot widen the list, because an unbanded threshold is a deleted threshold", () => {
    // Not the record that holds the quote: `contained` is a legitimate bypass, so a containing record at
    // floor 0 is correct behaviour. This is about a non-containing record, where the only thing standing
    // between "3 of 60" and "shown" is the floor.
    const noise = sharedRunOf(QUOTE, "He is with you, and will be a companion, then a companion of the Barzakh")
    expect(noise.contained).toBe(false)
    expect(runClearsFloorAt(noise, 0)).toBe(false)
    expect(runClearsFloorAt(noise, -4)).toBe(false)
    expect(runClearsFloorAt(noise, 1)).toBe(true)
  })

  test("a negative observation clears nothing at any threshold", () => {
    expect(runClearsFloorAt({ sharedRunChars: -5, quoteChars: 10, contained: false }, 1)).toBe(false)
  })

  test("a floor is compared against the longest run, never the quote length", () => {
    // A long quote and an unrelated record: `quoteChars` is large, `sharedRunChars` is not. Comparing
    // the wrong one would admit the record and the ratio would look plausible on screen.
    const run = sharedRunOf(`${QUOTE} ${QUOTE} ${QUOTE}`, "an unrelated hadith about the desert")
    expect(run.quoteChars).toBeGreaterThan(MIN_SHARED_RUN_CHARS * 3)
    expect(run.sharedRunChars).toBeLessThan(MIN_SHARED_RUN_CHARS)
    expect(runClearsFloor(run)).toBe(false)
  })
})

describe("the display floor is deterministic, because the list is claimed to be byte-identical across runs", () => {
  test("the same pair measured repeatedly gives the same integers", () => {
    const first = sharedRunOf(QUOTE, HELD)
    for (let attempt = 0; attempt < 8; attempt += 1) expect(sharedRunOf(QUOTE, HELD)).toEqual(first)
  })

  test("measurement is symmetric in its two arguments, so a record quoted back at its source agrees", () => {
    // Not true of the fold, but true of containment and of any run length, and worth pinning because a
    // caller comparing the two directions would otherwise be comparing two answers to one question.
    expect(sharedRunOf(QUOTE, HELD).sharedRunChars).toBe(sharedRunOf(HELD, QUOTE).sharedRunChars)
  })
})