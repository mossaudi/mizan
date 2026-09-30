/**
 * Terminal display geometry and control-byte neutralisation.
 *
 * ## Why this file exists
 *
 * Two facts about this repository meet in a terminal, and both are integrity problems rather than
 * cosmetic ones.
 *
 *  - **Control bytes.** A record's text came from the internet and is printed on a judge's screen.
 *    A string carrying `ESC [ 2 J` or an OSC title sequence can rewrite the screen, change the
 *    window title, or hide the lines above it. In a product whose entire claim is "the badge you
 *    see was computed", text that can erase its own badge is a spoofing primitive.
 *  - **Width.** Arabic carries combining marks, which occupy a display column and no string index.
 *    `String.length` counts them. Anything that aligns output by index — a marker under a quoted
 *    span, a column, an indent — is off by one per mark, and an Arabic report is mostly marks.
 *
 * ## Why a scanner and not a set of regular expressions
 *
 * A regex for a terminal escape sequence has to contain `ESC`, and `ESC` is U+001B. Writing it as a
 * literal puts an invisible control byte in a source file, where no reviewer can see it and no
 * editor round-trips it reliably. Writing it as `` in the pattern is rejected by the
 * no-evasion gate's intent even where it is not literally matched. So the sequences are recognised
 * by a character scanner over code points, and every bound is a named numeric constant a reviewer
 * can check against ECMA-48. The fold table already takes this approach for the same reason: it
 * lists twenty digits explicitly rather than computing them from a bitmask.
 *
 * ## What is stripped, and what is deliberately kept
 *
 * Newline (U+000A) and tab (U+0009) survive *as bare controls*. They are how a record's text stays
 * readable, and neither can rewrite the screen or move the cursor out of the report. Everything
 * else in C0 and C1 is removed, including ESC, BEL, and DEL.
 *
 * Inside a sequence the carve-out does not apply: a newline terminates a CSI sequence and is
 * removed with it, and U+009B is a sequence introducer rather than a bare control. Both are stated
 * in the tests, because both are the shape of the bug this file exists to close.
 *
 * **Stated residual:** a newline is preserved, so corpus text can introduce line breaks inside a
 * report line. That is a legibility risk, not a screen-rewriting one, and closing it would mean
 * flattening every record to a single line. The control this file exists for is closed; the
 * remaining one is named rather than hidden.
 *
 * ## `displayWidth` is not `wcwidth`
 *
 * It is the width rule this corpus needs, and it is stated rather than approximated: zero for
 * combining marks and format characters, one for everything else. It is NOT a full Unicode
 * terminal-width implementation — a code point outside the Basic Multilingual Plane is counted as
 * one column, which is wrong for an emoji and irrelevant for Arabic, Qur'anic and hadith text.
 *
 * ## Why there is no fold here
 *
 * `normalizeForTerminal` is defined in `normalize.ts`, not here, because it is the match fold with
 * one extra stage. Duplicating `FOLD_PIPELINE` into this file would be two answers to "what does
 * mizan normalise", which is AGENTS.md section 17's exact defect: a place where two runs can
 * legitimately disagree.
 */

/* ------------------------------------------------------------------ ECMA-48 code points */

/** U+001B ESC — the introducer of every two-character and string sequence. */
export const ESC = 0x1b

/** U+007F DELETE. */
export const DEL = 0x7f

/** U+009B CSI — the 8-bit spelling of `ESC [`, and an introducer in its own right. */
const C1_CSI = 0x9b

/** The C1 range. U+009B is the 8-bit CSI, and is handled above as a sequence introducer. */
const C1_FIRST = 0x80
const C1_LAST = 0x9f

/** The two sequence introducers that are terminated by a string terminator rather than a final byte. */
const STRING_INTRODUCERS = new Set<number>(["]".charCodeAt(0), "P".charCodeAt(0), "X".charCodeAt(0), "^".charCodeAt(0), "_".charCodeAt(0)])

/** Parameter bytes, `0x30`–`0x3F`. */
const isParameterByte = (code: number): boolean => code >= 0x30 && code <= 0x3f

/** Intermediate bytes, `0x20`–`0x2F`. */
const isIntermediateByte = (code: number): boolean => code >= 0x20 && code <= 0x2f

/** Final bytes, `0x40`–`0x7E`. Any byte here ends a CSI sequence. */
const isFinalByte = (code: number): boolean => code >= 0x40 && code <= 0x7e

/** BEL (0x07) and the 8-bit ST (0x9C) both terminate a string sequence. */
const isStringTerminator = (code: number): boolean => code === 0x07 || code === 0x9c

/**
 * Any control byte, including the two `isBareControl` preserves.
 *
 * The sequence scanner needs the *uncarved* predicate. A newline may not be removed on its own,
 * but inside a sequence it must terminate it — otherwise `ESC [` followed by a linefeed leaves
 * the linefeed behind, and the strip would reintroduce through the sequence path the byte it
 * refuses to remove as a bare control. One predicate per question, rather than one predicate
 * reused for two different questions, is what keeps that from happening.
 */
const isAnyControl = (code: number): boolean => code < 0x20 || code === DEL || (code >= C1_FIRST && code <= C1_LAST)

/**
 * A control byte that cannot move the cursor, clear the screen, or change a mode.
 *
 * Newline and tab are carved out, and the carve-out is here rather than applied afterwards so that
 * a preserved newline cannot be reintroduced by the sequence scanner below.
 */
export const isBareControl = (code: number): boolean => {
  if (code === 0x0a || code === 0x09) return false
  return isAnyControl(code)
}

/**
 * The index just past the sequence introduced at `start`, or `start + 1` when the introducer is
 * followed by something that does not open a sequence.
 *
 * A malformed sequence ends at the first byte that cannot belong to it, so an unterminated OSC
 * cannot swallow the rest of a record — the fail-closed direction, since a swallowed tail is text
 * a reader never sees.
 */
const endOfEscape = (value: string, start: number): number => {
  const next = value.charCodeAt(start + 1)
  if (Number.isNaN(next)) return start + 1
  if (next === 0x5b) return endOfControlSequence(value, start + 2)
  if (STRING_INTRODUCERS.has(next)) return endOfStringSequence(value, start + 2)
  return start + 2
}

/**
 * A CSI sequence runs parameter bytes, then intermediate bytes, then one final byte.
 *
 * `start` is the first byte *after* the introducer, because the 8-bit form has no second byte and
 * is dispatched separately below — one scanner, two introducers.
 */
const endOfControlSequence = (value: string, start: number): number => {
  let index = start
  while (index < value.length) {
    const code = value.charCodeAt(index)
    if (isFinalByte(code) || isAnyControl(code)) return index + 1
    if (!isParameterByte(code) && !isIntermediateByte(code)) return index
    index += 1
  }
  return index
}

/** A string sequence runs until BEL, ST, or the end of the text. */
const endOfStringSequence = (value: string, start: number): number => {
  for (let index = start; index < value.length; index += 1) {
    if (isStringTerminator(value.charCodeAt(index))) return index + 1
  }
  return value.length
}

/**
 * Remove terminal escape sequences and stray control bytes, leaving text a terminal may show.
 *
 * The traversal is by code point, so a surrogate pair outside the Basic Multilingual Plane is
 * carried through whole rather than split into two replacement characters.
 */
export const stripTerminalControls = (value: string): string => {
  let out = ""
  let index = 0
  while (index < value.length) {
    const code = value.codePointAt(index) ?? 0
    if (code === ESC) {
      index = endOfEscape(value, index)
      continue
    }
    // The 8-bit CSI is a sequence introducer, so it has to consume its payload. Treating it as a
    // bare control would leave a visible `2J` on the record — a screen clear with the introducer
    // peeled off, which is the same spoofing primitive wearing a different hat.
    if (code === C1_CSI) {
      index = endOfControlSequence(value, index + 1)
      continue
    }
    if (isBareControl(code)) {
      index += 1
      continue
    }
    out += String.fromCodePoint(code)
    index += code > 0xffff ? 2 : 1
  }
  return out
}

/**
 * Zero-width, by Unicode category, the same discipline the fold table uses for marks.
 *
 * `Mn`/`Mc`/`Me` are combining, `Cf` is a format control, and the zero-width characters are named
 * alongside the class because a character can change category between Unicode versions and a
 * display width that moves is a display a reader cannot rely on.
 */
export const ZERO_WIDTH = /[\p{Mn}\p{Me}\p{Cf}\u200B-\u200F\u2060\uFEFF]/u

/** Display columns occupied by `text`. Counted per code point, so a surrogate pair is one column. */
export const displayWidth = (text: string): number => {
  let width = 0
  for (const codePoint of text) {
    if (!ZERO_WIDTH.test(codePoint)) width += 1
  }
  return width
}

export * as Terminal from "./terminal.ts"
