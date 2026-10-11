import { normalizeForMatch } from "../normalize/normalize.ts"
import { MIN_VERIFIABLE_QUOTE_CHARS } from "../normalize/bounds.ts"

/**
 * Refusal block logic for incomplete/short quotes.
 *
 * Pure functions for determining when a quote is too short for deterministic
 * verification and rendering the refusal block. No I/O, no side effects.
 *
 * Per ADR-21: "No semantic nearest-match; refusal is product"
 * Per AGENTS.md §16: honest degradation — "unverifiable — quote too short for deterministic check"
 */

/** Check if a quote is too short for deterministic verification. */
export function isQuoteTooShort(quote: string): boolean {
  // Count non-whitespace, non-diacritic Arabic characters using the match fold
  const folded = normalizeForMatch(quote)
  const arabicChars = folded.replace(/[\s\p{M}]/gu, "")
  return arabicChars.length < MIN_VERIFIABLE_QUOTE_CHARS
}

/** Render the refusal block for a too-short quote as text lines. */
export function renderRefusalBlock(quote: string, segmentIndex: number): readonly string[] {
  const lines: string[] = []
  const indent = "    "
  const cont = `${indent}         `

  lines.push(`${indent}┌─ REFUSAL: quote too short for deterministic verification ────────────`)
  lines.push(`${indent}│`)
  lines.push(`${indent}│  Segment ${segmentIndex}: quote has fewer than ${MIN_VERIFIABLE_QUOTE_CHARS} Arabic characters (incomplete citation)`)
  lines.push(`${indent}│  Quoted: "${quote.slice(0, 100)}${quote.length > 100 ? "…" : ""}"`)
  lines.push(`${indent}│`)
  lines.push(`${indent}│  Verdict: unverifiable — quote too short for deterministic check (incomplete)`)
  lines.push(`${indent}│`)
  lines.push(`${indent}│  ┌─ SPIKE TABLE (ADR-03 measured) ─────────────────────────────────`)
  lines.push(`${indent}│  │  Semantic matching false-verified fabricated hadith: 67.50%`)
  lines.push(`${indent}│  │  Strict containment (mizan-verify) false-verified: 0.00%`)
  lines.push(`${indent}│  │  Conclusion: semantic/meaning matching accepts fabrications`)
  lines.push(`${indent}│  └────────────────────────────────────────────────────────────────`)
  lines.push(`${indent}│`)
  lines.push(`${indent}│  Refusal basis: ADR-21 — "No semantic nearest-match; refusal is product"`)
  lines.push(`${indent}│`)
  lines.push(`${indent}│  No "closest in meaning" suggestion is offered.`)
  lines.push(`${indent}│  This is a measured product decision, not a missing feature.`)
  lines.push(`${indent}└────────────────────────────────────────────────────────────────────`)

  return lines
}

/** Render refusal blocks for multiple too-short quotes in a document. */
export function renderRefusalBlocks(quotes: readonly { quote: string; segmentIndex: number }[]): readonly string[] {
  const tooShort = quotes.filter(q => isQuoteTooShort(q.quote))
  if (tooShort.length === 0) return []

  const lines: string[] = ["", "REFUSAL BLOCKS (incomplete quotes):", ""]
  for (const q of tooShort) {
    lines.push(...renderRefusalBlock(q.quote, q.segmentIndex))
    lines.push("")
  }
  return lines
}

export * as RefusalBlock from "./refusal-block.ts"