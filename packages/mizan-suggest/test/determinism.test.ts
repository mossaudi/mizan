import { describe, expect, test } from "bun:test"
import { canonicalJson } from "@mizan/core"
import { openSearch, rankNeighbours, type ScannedNeighbour } from "../src/index.ts"

const VERSE = "الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم"

/** A scan of every row of a tiny corpus, done the way the CLI does it: fold once, measure per row. */
const scan = (quote: string, records: readonly (readonly [string, string])[]): readonly ScannedNeighbour[] => {
  const search = openSearch(quote)
  return records.map(([recordId, textMatch]) => {
    const overlap = search.overlapOf(textMatch)
    return { recordId, collection: "test", textMatch, contained: overlap.contained, shared: overlap.shared }
  })
}

const CORPUS: readonly (readonly [string, string])[] = [
  ["qur:2:255:1", VERSE],
  ["qur:2:255:2", VERSE],
  ["qur:2:256:1", "لا إكراه في الدين قد تبين الرشد من الغي"],
  ["qur:112:1", "قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد"],
  ["hadith:muslim:1:1", "بسم الله الرحمن الرحيم"],
  ["hadith:bukhari:1:1", "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى"],
]

describe("the same question, ranked the same way, every time", () => {
  test("twenty runs over the same scan produce byte-identical results", () => {
    const quote = "الله لا إله إلا هو الحي القيوم"
    const first = canonicalJson(rankNeighbours({ quote, rows: scan(quote, CORPUS), topK: 5 }))
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const rows = scan(quote, CORPUS)
      expect(canonicalJson(rankNeighbours({ quote, rows, topK: 5 }))).toBe(first)
    }
  })

  test("row order in the scan does not change the answer", () => {
    const quote = "الله لا إله إلا هو الحي القيوم"
    const forward = canonicalJson(rankNeighbours({ quote, rows: scan(quote, CORPUS), topK: 5 }))
    const reversed = canonicalJson(rankNeighbours({ quote, rows: [...scan(quote, CORPUS)].reverse(), topK: 5 }))
    expect(reversed).toBe(forward)
  })

  test("a paraphrase of the scan yields the same answer as the scan", () => {
    const quote = "الله لا إله إلا هو الحي القيوم"
    const whitespacePadded = `  ${quote}\n`
    const rows = scan(quote, CORPUS)
    const paddedRows = scan(whitespacePadded, CORPUS)
    expect(canonicalJson(rankNeighbours({ quote: whitespacePadded, rows: paddedRows }))).toBe(
      canonicalJson(rankNeighbours({ quote, rows })),
    )
  })

  test("nothing in the result varies between two runs on a different seed of the corpus", () => {
    const quote = "إنما الأعمال بالنيات"
    const rows = scan(quote, CORPUS)
    const once = rankNeighbours({ quote, rows, topK: 5 })
    const twice = rankNeighbours({ quote, rows: scan(quote, CORPUS), topK: 5 })
    expect(canonicalJson(twice)).toBe(canonicalJson(once))
  })
})




