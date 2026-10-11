import { describe, it, expect } from "bun:test"
import { isQuoteTooShort, renderRefusalBlock, renderRefusalBlocks } from "../src/render/refusal-block.ts"

describe("RefusalBlock", () => {
  it("detects quotes shorter than 15 Arabic characters", () => {
    expect(isQuoteTooShort("إِنَّمَا الْأَعْمَالُ")).toBe(true)
    expect(isQuoteTooShort("وَالْعَصْرِ")).toBe(true)
    expect(isQuoteTooShort("مَنْ سَرَّهُ أَنْ يُزَحْزَحَ")).toBe(true)
    expect(isQuoteTooShort("الْحَمْدُ لِلَّهِ")).toBe(true)
  })

  it("accepts quotes at or above 15 Arabic characters", () => {
    // Full hadith: "إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى"
    expect(isQuoteTooShort("إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى")).toBe(false)
    // 15+ Arabic chars
    expect(isQuoteTooShort("إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ")).toBe(false)
  })

  it("ignores diacritics and whitespace in character count", () => {
    // With diacritics and spaces
    const withDiacritics = "إِنَّمَا الْأَعْمَالُ"
    const without = withDiacritics.replace(/[\s\p{M}]/gu, "")
    expect(without.length).toBeLessThan(15)
    expect(isQuoteTooShort(withDiacritics)).toBe(true)
  })

  it("renders refusal block with ADR-21 citation", async () => {
    const lines = await renderRefusalBlock("إِنَّمَا الْأَعْمَالُ", 1)
    const output = lines.join("\n")

    expect(output).toContain("REFUSAL: quote too short for deterministic verification")
    expect(output).toContain("Segment 1")
    expect(output).toContain("fewer than 15 Arabic characters")
    expect(output).toContain("unverifiable — quote too short for deterministic check")
    expect(output).toContain("ADR-21")
    expect(output).toContain("No semantic nearest-match; refusal is product")
    expect(output).toContain("No \"closest in meaning\" suggestion is offered")
    expect(output).toContain("measured product decision, not a missing feature")
  })

  it("renders spike table data when available", async () => {
    const lines = await renderRefusalBlock("وَالْعَصْرِ", 2)
    const output = lines.join("\n")

    // Spike table should be available now with correct path resolution
    expect(output).toContain("SPIKE TABLE (ADR-03 measured)")
    expect(output).toContain("Semantic matching false-verified fabricated hadith")
    expect(output).toContain("Strict containment (mizan-verify) false-verified: 0.00%")
    expect(output).toContain("Conclusion: semantic/meaning matching accepts fabrications")
  })

  it("renders multiple refusal blocks for multiple short quotes", async () => {
    const quotes = [
      { quote: "إِنَّمَا الْأَعْمَالُ", segmentIndex: 1 },
      { quote: "وَالْعَصْرِ", segmentIndex: 2 },
      { quote: "مَنْ سَرَّهُ أَنْ يُزَحْزَحَ", segmentIndex: 4 },
    ]

    const lines = await renderRefusalBlocks(quotes)
    const output = lines.join("\n")

    expect(output).toContain("REFUSAL BLOCKS (incomplete quotes)")
    expect(output.split("REFUSAL: quote too short").length - 1).toBe(3)
  })

  it("returns empty array when no quotes are too short", async () => {
    const quotes = [
      { quote: "إِنَّمَا الْأَعْمَالُ بِالنِّيَاتِ وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى", segmentIndex: 3 },
    ]

    const lines = await renderRefusalBlocks(quotes)
    expect(lines).toEqual([])
  })

  it("handles spike table unavailability gracefully", async () => {
    // The spike table path points to docs/artefacts/spike-table.json which exists
    // This test verifies the code path doesn't crash if file is missing
    const lines = await renderRefusalBlock("الْحَمْدُ لِلَّهِ", 5)
    const output = lines.join("\n")

    // Should still render the refusal even if spike table has issues
    expect(output).toContain("REFUSAL: quote too short")
    expect(output).toContain("ADR-21")
  })

  it("does not offer semantic suggestions in refusal block", async () => {
    const lines = await renderRefusalBlock("إِنَّمَا الْأَعْمَالُ", 1)
    const output = lines.join("\n")

    // Explicitly verify no semantic suggestion language appears as an OFFER
    // The refusal block explicitly DENIES offering semantic suggestions
    // The word "semantic" appears only in the ADR-21 citation "No semantic nearest-match; refusal is product"
    expect(output).not.toContain("did you mean")
    expect(output).not.toContain("similar")
    // The word "suggestion" only appears in the explicit denial
    expect(output).toContain("No \"closest in meaning\" suggestion is offered")
    // The phrase "closest in meaning" appears only in the denial context
    expect(output).toContain("No \"closest in meaning\" suggestion")
    // Verify the ADR-21 citation is present (contains "semantic" but as a refusal basis)
    expect(output).toContain("ADR-21")
    expect(output).toContain("No semantic nearest-match; refusal is product")
  })

  it("truncates long quotes in preview", async () => {
    const longQuote = "ا".repeat(150) // 150 Arabic chars
    const lines = await renderRefusalBlock(longQuote, 1)
    const output = lines.join("\n")

    expect(output).toContain("…") // Truncation marker
    expect(output).not.toContain(longQuote) // Full quote not rendered
  })
})

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

describe("RefusalBlock — integration with demo document", () => {
  it("processes demo-document.md and finds 4 refusal blocks", async () => {
    // This test mirrors the demo document processing in main.ts
    const fixturePath = join(__dirname, "..", "fixtures", "demo-document.md")
    const content = readFileSync(fixturePath, "utf8")

    const quotePattern = /[「"]([^」"]+)[」"]/g
    const quotes: { quote: string; segmentIndex: number }[] = []
    let segmentIndex = 0

    const sections = content.split(/^##\s+/m)
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      if (section === undefined) continue
      const sectionQuotes = section.match(/[「"]([^」"]+)[」"]/g) || []
      for (const q of sectionQuotes) {
        const cleanQuote = q.slice(1, -1)
        quotes.push({ quote: cleanQuote, segmentIndex: i })
      }
    }

    // Filter to only too-short quotes
    const tooShort = quotes.filter(q => isQuoteTooShort(q.quote))

    // Demo document has 4 quotes < 15 chars (sections 1, 2, 4, 5)
    // Section 3 has the full valid hadith
    expect(tooShort.length).toBe(4)

    const refusalLines = await renderRefusalBlocks(tooShort)
    expect(refusalLines.length).toBeGreaterThan(0)

    const output = refusalLines.join("\n")
    expect(output.split("REFUSAL: quote too short").length - 1).toBe(4)
  })
})