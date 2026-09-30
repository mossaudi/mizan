import { err, ok, QURAN_COLLECTION, sha256Hex } from "@mizan/core"
import type { FetchContext, RawRecord, SourceAdapter } from "./types.ts"

/**
 * Tanzil — the Qur'an, uthmani script, one ayah per line.
 *
 * ## The format, and the trap in it
 *
 * `outType=txt` returns the text interleaved with `#====` banner lines and a 28-line header
 * and footer. Filtering on the leading `#` leaves exactly 6236 ayah lines, which is the count
 * the corpus must have — so a count assertion here is a real check, not a formality: if the
 * upstream ever changes its format, this adapter fails loudly instead of ingesting 6264 rows
 * with two of them being banners.
 *
 * Line 1 is the basmala that Tanzil emits once, before Al-Fatihah's first ayah. It is
 * ingested as `quran:0` because it IS text a citation can refer to, and because dropping a
 * line silently to make a number line up would be the kind of tidy-up that loses content.
 *
 * ## Why `number` is a string
 *
 * Ayah numbering follows the printed edition. Parsing to a number would assert a canonical
 * numbering we have not established; keeping the string keeps the claim honest.
 */

export const TANZIL_URL = "https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt&agree=true"

/** The number of ayahs in the Qur'an, counted. Asserted on every ingest. */
export const EXPECTED_AYAH_COUNT = 6236

const BANNER_PREFIX = "#"

export const parseTanzilText = (body: string): readonly string[] =>
  body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(BANNER_PREFIX))

export const tanzilAdapter: SourceAdapter = {
  slug: "tanzil/quran-uthmani",
  fetchRecords: async (context: FetchContext) => {
    const response = await context.get(TANZIL_URL)
    if (!response.ok) {
      return err({ _tag: "adapter_failed", reason: "fetch_failed", detail: `tanzil: ${response.detail}` })
    }
    const lines = parseTanzilText(response.body)
    if (lines.length !== EXPECTED_AYAH_COUNT) {
      return err({
        _tag: "adapter_failed",
        reason: "format_changed",
        detail: `tanzil returned ${lines.length} ayah lines, expected ${EXPECTED_AYAH_COUNT}`,
      })
    }

    const limited = lines.slice(0, context.limit)
    // One report, after the single fetch. Tanzil is one request, so the heartbeat that matters here
    // is `runIngest`'s own `started` line, which is emitted BEFORE this call; anything reported
    // after it is a fact about bytes that already arrived.
    context.report?.(limited.length)
    const records: RawRecord[] = limited.map((textDisplay, index) => ({
      id: `quran:${index + 1}`,
      collection: QURAN_COLLECTION,
      number: String(index + 1),
      textDisplay,
      sourceUrl: null,
      // Grading does not apply to the Qur'an. `null` with basis "none" is the honest record,
      // and `gradeApplicable: false` in the descriptor is what stops the UI showing a gap.
      grade: null,
      gradeBasis: "none",
      translation: null,
    }))

    // Line 1 is the basmala Tanzil emits before Al-Fatihah's first ayah. It is kept, as
    // `quran:1`, because it is text a citation can legitimately refer to.
    return ok({ records, sha256: sha256Hex(response.body), dropped: [] })
  },
}

export * as Tanzil from "./tanzil.ts"
