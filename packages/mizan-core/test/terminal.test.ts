import { describe, expect, test } from "bun:test"
import { DEL, ESC, displayWidth, isBareControl, stripTerminalControls } from "../src/normalize/terminal.ts"
import { normalizeForTerminal } from "../src/normalize/normalize.ts"

/**
 * ## Why every control byte here is written as a number
 *
 * A test that builds its input with `String.fromCharCode(ESC)` is legible; a test that embeds a
 * literal escape byte is a file no reviewer can read and no editor round-trips. The constants
 * `ESC` and `DEL` are imported rather than retyped so the test asserts the *same* numbers the
 * scanner uses — if `terminal.ts` changed a bound, these tests would follow it, and the
 * differential test below is what pins the bound down independently.
 */
const csi = (...codes: readonly number[]): string => String.fromCodePoint(ESC, 0x5b, ...codes)
const oscIntroducer = (): string => String.fromCodePoint(ESC, 0x5d)
const osc = (body: string): string => `${oscIntroducer()}${body}${String.fromCharCode(0x07)}`
const c1Csi = (final: string): string => `${String.fromCharCode(0x9b)}${final}`
const bel = (): string => String.fromCharCode(0x07)

describe("a terminal control sequence is removed whole", () => {
  test("a screen-clear sequence leaves nothing behind", () => {
    expect(stripTerminalControls(`before${csi(0x32, 0x4a)}after`)).toBe("beforeafter")
  })

  test("the clear-screen sequence cannot survive a partial strip of its own bytes", () => {
    // The reason this is a scanner and not `.replace(/csi/, "")`: ESC alone and `[2J` alone are
    // both printable garbage, so a strip that removed only the final byte would leave a visible
    // `[2J` on the record. The whole sequence, introducer included, has to go.
    expect(stripTerminalControls(`x${csi(0x32, 0x4a)}y`)).not.toContain("[2J")
  })

  test("an OSC title sequence is removed with its body, not just its introducer", () => {
    expect(stripTerminalControls(`a${osc("0;title spoofed")}b`)).toBe("ab")
  })

  test("an OSC terminated by ST rather than BEL is also removed", () => {
    expect(stripTerminalControls(`a${oscIntroducer()}0;spoof${String.fromCharCode(0x9c)}b`)).toBe("ab")
  })

  test("an unterminated OSC removes its body rather than swallowing the rest of the record", () => {
    // Fail-closed direction: a swallowed tail is text the reader never sees, so the sequence ends
    // at the end of the input instead of consuming it silently mid-record.
    expect(stripTerminalControls(`a${oscIntroducer()}0;spoof`)).toBe("a")
  })

  test("a two-character escape sequence is removed", () => {
    expect(stripTerminalControls(`a${String.fromCodePoint(ESC, 0x63)}b`)).toBe("ab")
  })

  test("the 8-bit CSI is removed like its 7-bit spelling", () => {
    expect(stripTerminalControls(`x${c1Csi("2J")}y`)).toBe("xy")
  })

  test("parameter and intermediate bytes in a longer sequence are all consumed", () => {
    // `ESC [ ? 1 ; 2 SP q` is a real sequence shape: a private parameter, decimal parameters, an
    // intermediate byte, then one final byte. Asserting on the absence of `?` and the space as
    // well as on the result is the point — a strip that removed only the final byte would leave a
    // visible `?1;2 q` beside the record.
    const stripped = stripTerminalControls(`a${csi(0x3f, 0x31, 0x3b, 0x32, 0x20, 0x71)}b`)
    expect(stripped).toBe("ab")
    expect(stripped).not.toContain("?")
    expect(stripped).not.toContain(" ")
  })

  test("a byte after a sequence's final byte is text, not part of the sequence", () => {
    // The final byte ends the sequence. Reading past it would swallow real corpus text, which is
    // the fail-open direction: a reader would lose a word of the hadith and never know.
    expect(stripTerminalControls(`a${csi(0x32, 0x4a)}Hadiith`)).toBe("aHadiith")
  })
})

describe("a stray control byte is removed, and the two that are not are kept", () => {
  test("BEL alone is removed", () => {
    expect(stripTerminalControls(`a${bel()}b`)).toBe("ab")
  })

  test("DEL is removed", () => {
    expect(stripTerminalControls(`a${String.fromCharCode(DEL)}b`)).toBe("ab")
  })

  test("a newline survives, because a record's text stays readable", () => {
    expect(stripTerminalControls("a\nb")).toBe("a\nb")
  })

  test("a tab survives", () => {
    expect(stripTerminalControls("a\tb")).toBe("a\tb")
  })

  test("the carve-out is stated in the predicate, not applied afterwards", () => {
    // The sequence scanner consumes a newline as a CSI terminator. If `isBareControl` still
    // reported newline as removable, a preserved newline could be reintroduced through `ESC [`
    // followed by a linefeed.
    expect(isBareControl(0x0a)).toBe(false)
    expect(isBareControl(0x09)).toBe(false)
    expect(stripTerminalControls(`a${csi(0x0a)}b`)).toBe("ab")
  })

  test("every C0 byte outside the two carved out is removable", () => {
    const removable = Array.from({ length: 0x20 }, (_, code) => code).filter((code) => isBareControl(code))
    expect(removable).not.toContain(0x09)
    expect(removable).not.toContain(0x0a)
    expect(removable).toHaveLength(0x20 - 2)
  })

  test("the whole C1 range is removable, including the 8-bit CSI", () => {
    const c1 = Array.from({ length: 0x20 }, (_, offset) => 0x80 + offset)
    expect(c1.every((code) => isBareControl(code))).toBe(true)
  })
})

describe("text that is not a control sequence is carried through unchanged", () => {
  test("a diacriticized hadith is byte-identical after the strip", () => {
    const text = "قَالَ رَسُولُ اللَّهِ صلى الله عليه وسلم"
    expect(stripTerminalControls(text)).toBe(text)
  })

  test("the right-to-left marks Sunan Abi Dawud publishes are kept", () => {
    // This is the corpus contract, and it is why `normalizeForTerminal` does not compose in the
    // render bidi fold: `U+200F` appears around the quoted matn in committed anchors, and the
    // no-derivatives licence terms require `textDisplay` to be printed as published.
    const rlm = String.fromCharCode(0x200f)
    const text = `${rlm}"${rlm} يَتَقَارَبُ الزَّمَانُ`
    expect(stripTerminalControls(text)).toBe(text)
  })

  test("a surrogate pair outside the Basic Multilingual Plane is carried whole", () => {
    // Naive per-`charCodeAt` traversal would split this into two lone surrogates and print two
    // replacement characters.
    const astral = "𐤀"
    expect(stripTerminalControls(`a${astral}b`)).toBe(`a${astral}b`)
  })

  test("a combining mark after a control byte is not lost", () => {
    const fatha = String.fromCharCode(0x64e)
    expect(stripTerminalControls(`${String.fromCharCode(0x07)}ب${fatha}`)).toBe(`ب${fatha}`)
  })
})

describe("normalizeForTerminal claims terminal safety and nothing else", () => {
  test("it is the same function the renderer calls, not a second opinion", () => {
    // AGENTS.md section 17: one source of truth per fact. Two spellings of "what a terminal may
    // show" is exactly the place two runs could legitimately disagree.
    expect(normalizeForTerminal).toBe(stripTerminalControls)
  })

  test("it does not fold Arabic-Indic digits, because the render fold is not composed in", () => {
    // `normalizeForRender` folds these. Composing it here would have been convenient and wrong:
    // it also removes the `U+200F` marks a published record carries.
    expect(normalizeForTerminal("٤٢")).toBe("٤٢")
  })

  test("it still removes a screen-clear sequence from model prose", () => {
    expect(normalizeForTerminal(`answer${csi(0x32, 0x4a)}`)).toBe("answer")
  })
})

describe("displayWidth counts columns, not string indices", () => {
  test("a plain ASCII string is its own width", () => {
    expect(displayWidth("verified")).toBe(8)
  })

  test("a combining mark occupies no column", () => {
    // `String.length` counts it. A marker under a quoted span placed by index is then off by one
    // per mark, and an Arabic report is mostly marks.
    const fatha = String.fromCharCode(0x64e)
    expect(displayWidth(fatha)).toBe(0)
    expect(`${"ب"}`.length).toBe(1)
    expect(displayWidth(`ب${fatha}`)).toBe(1)
  })

  test("a format character occupies no column", () => {
    expect(displayWidth(String.fromCharCode(0x200f))).toBe(0)
    expect(displayWidth(String.fromCharCode(0xfeff))).toBe(0)
  })

  test("width is additive over the string", () => {
    const fatha = String.fromCharCode(0x64e)
    const word = `ب${fatha}س`
    expect(displayWidth(word)).toBe(2)
  })

  test("an empty string has no width", () => {
    expect(displayWidth("")).toBe(0)
  })

  test("a space occupies one column", () => {
    expect(displayWidth(" ")).toBe(1)
  })
})
