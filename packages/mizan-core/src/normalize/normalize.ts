import {
  ALEF_CANONICAL,
  ALEF_FORMS,
  ARABIC_INDIC_DIGITS,
  BIDI_CONTROL_MARKS,
  COMBINING_MARKS,
  EXTENDED_ARABIC_INDIC_DIGITS,
  FOLD_PIPELINE,
  HA_CANONICAL,
  JOIN_CONTROLS,
  TA_MARBUTA_FORMS,
  TATWEEL,
  WAW_CANONICAL,
  WAW_WITH_HAMZA,
  WHITESPACE_RUN,
  YEH_CANONICAL,
  YEH_FORMS,
  YEH_WITH_HAMZA,
  foldDigit,
  type FoldStage,
} from "./fold-table.ts"
import { stripTerminalControls } from "./terminal.ts"

/**
 * The three normalization functions. Pure: no I/O, no clock, no locale, no
 * randomness, no configuration, no state. A normalization difference must never be
 * able to change a verdict, and the only way to guarantee that is for the function to
 * have nothing to be different from.
 *
 *  - `normalize`            structural canonical form (ids, numbers, keys)
 *  - `normalizeForMatch`    the containment key - the verifier's whole vocabulary
 *  - `normalizeForRender`   the render-time integrity control (R12)
 *
 * There is intentionally no `similarity`, `fuzzyMatch`, `levenshtein` or `embed`
 * export in this file, and gate G-1 asserts it.
 */

const collapseAndTrim = (value: string): string => value.replace(WHITESPACE_RUN, " ").trim()

/** The render-time bidi strip, named so the render and terminal forms cannot drift apart. */
const stripBidi = (value: string): string => value.replace(BIDI_CONTROL_MARKS, "")

const foldDigits = (value: string): string => value.replace(ARABIC_INDIC_DIGITS, foldDigit).replace(EXTENDED_ARABIC_INDIC_DIGITS, foldDigit)

const foldLetterForms = (value: string): string =>
  value
    .replace(ALEF_FORMS, ALEF_CANONICAL)
    .replace(YEH_WITH_HAMZA, YEH_CANONICAL)
    .replace(WAW_WITH_HAMZA, WAW_CANONICAL)
    .replace(YEH_FORMS, YEH_CANONICAL)
    .replace(TA_MARBUTA_FORMS, HA_CANONICAL)

/**
 * The match fold, as a stage table keyed by the declared stage names.
 *
 * ## This table is the reason the declared order and the real order cannot differ
 *
 * `FOLD_PIPELINE` in `fold-table.ts` is documented as "the pipeline, in the order
 * `normalizeForMatch` applies it", and it is exported to the CLI and the registry so a
 * reader can see the pipeline without reading this file. That claim was not true. The
 * implementation below used to be a straight-line chain of local variables whose real
 * order was: bidi, NFKC, **collapse whitespace**, join controls, tatweel, marks,
 * **fold digits**, letter forms, collapse whitespace. Digit folding was declared third
 * and actually ran seventh, and whitespace collapsing ran twice — once, early, as a side
 * effect of calling `normalize()`.
 *
 * Nothing measured the difference, and that is the point: the two orders happen to produce
 * byte-identical output, because the Arabic-Indic digit blocks are disjoint from every
 * other stage's characters. So the bug was invisible in behaviour and visible only to a
 * reader auditing the table against the code — which is precisely the review this project
 * is built to support, and precisely the review that would have found nothing was wrong.
 * A published pipeline that does not describe the code is worse than no published pipeline,
 * because it is trusted.
 *
 * `normalizeForMatch` now reduces over `FOLD_PIPELINE`, so this table is exhaustive by
 * construction: adding a stage to the declaration without adding it here is a type error,
 * and reordering the declaration reorders the code. `Record<FoldStage, …>` is what makes
 * that true — a partial table is a compile failure, not a silently skipped stage.
 *
 * The idempotency property that the ordering argument exists to protect is unchanged and
 * still tested in `normalize.test.ts`, including the U+202E case that motivated
 * bidi-before-NFKC.
 */
const MATCH_STAGES: Readonly<Record<FoldStage, (value: string) => string>> = {
  "strip-bidi-controls": (value) => value.replace(BIDI_CONTROL_MARKS, ""),
  nfkc: (value) => value.normalize("NFKC"),
  "fold-arabic-indic-digits": foldDigits,
  "strip-join-controls": (value) => value.replace(JOIN_CONTROLS, ""),
  "strip-tatweel": (value) => value.replace(TATWEEL, ""),
  "strip-combining-marks": (value) => value.replace(COMBINING_MARKS, ""),
  "fold-letter-forms": foldLetterForms,
  "collapse-whitespace": collapseAndTrim,
}

/**
 * Structural canonical form: bidi controls removed, NFKC, whitespace collapsed.
 *
 * Used where identity is about *structure* rather than about Arabic spelling —
 * record ids, hadith numbers, collection names, cache keys. Deliberately does NOT
 * fold letters or strip tashkeel, because a display string that lost its diacritics
 * would be a lie about what the source said.
 *
 * ## Why the bidi strip runs BEFORE `normalize("NFKC")`
 *
 * This ordering is load-bearing for idempotency, and the property test found it.
 * U+202E has canonical combining class 0, so it acts as a *starter* and splits a
 * combining sequence in two. Consider `ب` + U+0654 + U+202E + U+0650: the first
 * NFKC sees two separate sequences and leaves the marks in source order; stripping
 * U+202E afterwards leaves `ب` U+0654 U+0650, whose marks (classes 230 and 35) are
 * now adjacent and out of canonical order — so the *second* call re-sorts them and
 * returns a different string. Removing the bidi controls first makes the string that
 * NFKC sees on pass 1 identical to the one it sees on pass 2.
 */
export const normalize = (input: string): string => collapseAndTrim(input.replace(BIDI_CONTROL_MARKS, "").normalize("NFKC"))

/**
 * The containment key.
 *
 * `normalizeForMatch(quote)` is contained in `record.textMatch` - and
 * `textMatch` is `normalizeForMatch(textDisplay)` computed once at ingest - exactly
 * when the quote really is that record's text. This is the ONLY relation that can
 * produce a `verified` verdict (ADR-03, AGENTS.md sections 9 and 10).
 *
 * Applied by reducing over `FOLD_PIPELINE`, so the published order in `fold-table.ts`
 * IS the order - see `MATCH_STAGES` above for why that is enforced rather than assumed.
 */
export const normalizeForMatch = (input: string): string =>
  FOLD_PIPELINE.reduce((value, stage) => MATCH_STAGES[stage](value), input)

/**
 * The render-time integrity control.
 *
 * Deliberately the narrowest transform that defeats bidi spoofing: remove the
 * embedding controls, fold Arabic-Indic digits so a stored `4` cannot be rendered as
 * something the reader would read as a different number, and do nothing else. No
 * NFKC, no tashkeel stripping, no letter folding — display text stays exactly as the
 * source published it, which is also what the no-derivatives terms require.
 */
export const normalizeForRender = (input: string): string => foldDigits(stripBidi(input))

/**
 * What a terminal may be shown, and the only form a judge-facing report should print.
 *
 * Terminal-control neutralisation and nothing else. `ESC [ 2 J` in a record's text would clear
 * the screen the badge is printed on, and an OSC title sequence would rewrite the window a judge
 * is reading — in a product whose claim is "the badge you see was computed", text that can erase
 * its own badge is a spoofing primitive. See `terminal.ts` for the sequence grammar and for the
 * newline/tab carve-out.
 *
 * ## Why the render fold is NOT composed in here
 *
 * It is tempting to write `stripTerminalControls(normalizeForRender(input))` — a terminal-safe
 * *and* bidi-safe form in one call, and composing them keeps the order argument in one place. It
 * is wrong here, and the reason is the corpus contract rather than the fold.
 *
 * `normalizeForRender` strips `BIDI_CONTROL_MARKS`, which is
 * `U+061C U+200E U+200F U+202A–U+202E U+2066–U+2069`. A record's `textDisplay` contains `U+200F`
 * — Sunan Abi Dawud publishes its quoted matn wrapped in right-to-left marks, and a dozen
 * committed anchors carry them. `textDisplay` is stored verbatim because the no-derivatives licence
 * terms require it, and the display path prints it verbatim, which the CLI's own tests assert
 * (`toContain(record.textDisplay)`). Composing the render fold in would delete marks the source
 * published, in a product whose licence terms forbid a derivative rendering.
 *
 * So the two controls stay separate and the honest one is the narrower one: this function claims
 * only that no byte here can move a cursor or clear a screen.
 *
 * ## Stated residual
 *
 * A bidi override or isolate (`U+202E`, `U+2066`) in corpus text is therefore *not* removed on the
 * display path, because removing it would also remove the legitimate marks around it. That is the
 * pre-existing R12 posture of `textDisplay` — the corpus ships as published, and the reader
 * compares it against a source they can open — and changing it is a corpus-contract decision, not
 * a renderer one. It is named here rather than left implied by a function name that says "for
 * terminal".
 */
export const normalizeForTerminal = stripTerminalControls

/** True when a value is usable as a citation identifier after structural folding. */
export const isNonBlank = (input: string): boolean => normalize(input).length > 0

/**
 * True when two spans are the same quotation under the match fold.
 *
 * Exported for the UI's "this is the same text" affordance and for tests. It is NOT a
 * similarity function: it is exact equality of the canonical form, which is why a
 * one-letter change or a one-digit change fails it.
 */
export const matchesExactly = (quote: string, recordText: string): boolean => {
  const foldedQuote = normalizeForMatch(quote)
  if (foldedQuote.length === 0) return false
  return normalizeForMatch(recordText).includes(foldedQuote)
}

export * as Normalize from "./normalize.ts"
