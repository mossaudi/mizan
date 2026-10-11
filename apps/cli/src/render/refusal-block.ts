import { normalizeForTerminal } from "@mizan/core"
import { MIN_VERIFIABLE_QUOTE_CHARS } from "@mizan/core"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { decodeOrFail, decodeSync } from "@mizan/core"

/**
 * Demo refusal block for incomplete/short quotes.
 *
 * This module renders a refusal block when a quote candidate is too short
 * for deterministic verification (< 15 Arabic characters). The block shows
 * the spike table + coverage report side-by-side to demonstrate that the
 * refusal is a measured product decision, not a gap.
 *
 * Per ADR-21: "No semantic nearest-match; refusal is product"
 * Per AGENTS.md §16: honest degradation - "unverifiable — quote too short for deterministic check"
 * Per AGENTS.md §1: schema-first decoding at trust boundaries - spike table decoded via schema
 */

/** Schema for the spike table artefact. */
const SpikeTableSchema = Schema.Struct({
  schemaVersion: Schema.Number,
  generatedAt: Schema.String,
  generatedBy: Schema.String,
  description: Schema.String,
  method: Schema.String,
  results: Schema.Struct({
    strictContainment: Schema.Struct({
      fabricationsTested: Schema.Number,
      falseVerified: Schema.Number,
      falseVerifiedRate: Schema.String,
    }),
    semanticSimilarity: Schema.Struct({
      fabricationsTested: Schema.Number,
      falseVerified: Schema.Number,
      falseVerifiedRate: Schema.String,
      note: Schema.String,
    }),
    paraphraseDetection: Schema.Struct({
      paraphrasesTested: Schema.Number,
      detectedByContainment: Schema.Number,
      detectedBySemantic: Schema.Number,
      note: Schema.String,
    }),
  }),
  conclusion: Schema.String,
  adrReference: Schema.optional(Schema.String),
})

/** Schema that parses JSON strings at the boundary (schema-first decoding). */
const SpikeTableFromJson = Schema.fromJsonString(SpikeTableSchema)

/** Resolve the spike table path using environment variable or build-time fallback. */
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = process.env.MIZAN_REPO_ROOT ?? join(__dirname, "..", "..", "..", "..")
const SPIKE_TABLE_PATH = join(REPO_ROOT, "docs", "artefacts", "spike-table.json")

/** Load the spike table artefact asynchronously with schema validation at the boundary. */
async function loadSpikeTable(): Promise<{ fabricationRate: string; adrReference: string } | null> {
  try {
    const content = await readFile(SPIKE_TABLE_PATH, "utf8")
    // Schema-first decoding at trust boundary (AGENTS.md §1)
    // The spike table artefact crosses a trust boundary (file system) and must be decoded via schema.
    // Schema.parseJson(SpikeTableSchema) parses the JSON string as part of decoding - no JSON.parse on untrusted input.
    const decoded = decodeOrFail(decodeSync(SpikeTableFromJson), content, "SpikeTable")
    if (!decoded.ok) {
      console.warn(`[refusal-block] Spike table schema validation failed: ${decoded.error.detail}`)
      return null
    }
    return {
      fabricationRate: decoded.value.results.semanticSimilarity.falseVerifiedRate,
      adrReference: decoded.value.adrReference ?? "ADR-21",
    }
  } catch (cause) {
    console.warn(`[refusal-block] Failed to load spike table: ${cause instanceof Error ? cause.message : String(cause)}`)
    return null
  }
}

/** Check if a quote is too short for deterministic verification. */
export function isQuoteTooShort(quote: string): boolean {
  // Count non-whitespace, non-diacritic Arabic characters
  const arabicChars = quote.replace(/[\s\p{M}]/gu, "")
  return arabicChars.length < MIN_VERIFIABLE_QUOTE_CHARS
}

/** Render the refusal block for a too-short quote. */
export async function renderRefusalBlock(quote: string, segmentIndex: number): Promise<string[]> {
  const spikeData = await loadSpikeTable()
  const lines: string[] = []
  const indent = "    "
  const cont = `${indent}         `

  lines.push(`${indent}┌─ REFUSAL: quote too short for deterministic verification ────────────`)
  lines.push(`${indent}│`)
  lines.push(`${indent}│  Segment ${segmentIndex}: quote has fewer than ${MIN_VERIFIABLE_QUOTE_CHARS} Arabic characters (incomplete citation)`)
  lines.push(`${indent}│  Quoted: "${normalizeForTerminal(quote.slice(0, 100))}${quote.length > 100 ? "…" : ""}"`)
  lines.push(`${indent}│`)
  lines.push(`${indent}│  Verdict: unverifiable — quote too short for deterministic check (incomplete)`)
  lines.push(`${indent}│`)

  if (spikeData) {
    lines.push(`${indent}│  ┌─ SPIKE TABLE (ADR-03 measured) ─────────────────────────────────`)
    lines.push(`${indent}│  │  Semantic matching false-verified fabricated hadith: ${spikeData.fabricationRate}`)
    lines.push(`${indent}│  │  Strict containment (mizan-verify) false-verified: 0.00%`)
    lines.push(`${indent}│  │  Conclusion: semantic/meaning matching accepts fabrications`)
    lines.push(`${indent}│  └────────────────────────────────────────────────────────────────`)
    lines.push(`${indent}│`)
    lines.push(`${indent}│  Refusal basis: ${spikeData.adrReference} — "No semantic nearest-match; refusal is product"`)
  } else {
    lines.push(`${indent}│  Spike table unavailable — refusal still applies (ADR-21)`)
    lines.push(`${indent}│  Refusal basis: ADR-21 — "No semantic nearest-match; refusal is product"`)
  }

  lines.push(`${indent}│`)
  lines.push(`${indent}│  No "closest in meaning" suggestion is offered.`)
  lines.push(`${indent}│  This is a measured product decision, not a missing feature.`)
  lines.push(`${indent}└────────────────────────────────────────────────────────────────────`)

  return lines
}

/** Render refusal blocks for multiple too-short quotes in a document. */
export async function renderRefusalBlocks(quotes: readonly { quote: string; segmentIndex: number }[]): Promise<string[]> {
  const tooShort = quotes.filter(q => isQuoteTooShort(q.quote))
  if (tooShort.length === 0) return []

  const lines: string[] = ["", "REFUSAL BLOCKS (incomplete quotes):", ""]
  for (const q of tooShort) {
    const blockLines = await renderRefusalBlock(q.quote, q.segmentIndex)
    lines.push(...blockLines)
    lines.push("")
  }
  return lines
}

export * as RefusalBlock from "./refusal-block.ts"