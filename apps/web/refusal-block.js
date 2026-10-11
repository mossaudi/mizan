/**
 * Demo refusal block for incomplete/short quotes - Web renderer (ES module).
 *
 * Renders a refusal block when a quote candidate is too short for deterministic
 * verification (< 15 Arabic characters). Shows spike table + coverage report
 * side-by-side to demonstrate refusal is a measured product decision (ADR-21).
 *
 * Per ADR-21: "No semantic nearest-match; refusal is product"
 * Per AGENTS.md §16: honest degradation - "unverifiable — quote too short for deterministic check"
 * Per AGENTS.md §11: No raw-HTML sinks - text nodes only
 * Per AGENTS.md §1: schema-first decoding at trust boundaries - spike table validated via schema
 * 
 * NOTE: Quote length validation logic (isQuoteTooShort) is duplicated from 
 * @mizan/core/src/render/refusal-block.ts. Both implementations MUST produce
 * identical results. A CI sync test (packages/mizan-core/test/quote-length-sync.test.ts)
 * verifies this. Do not modify one without updating the other.
 */

// Configuration injected via data attributes on the container element
function getConfig(container) {
  return {
    minQuoteChars: parseInt(container.getAttribute("data-mizan-min-quote-chars") || "15", 10),
    spikeTableUrl: container.getAttribute("data-mizan-spike-table-url") || "/docs/artefacts/spike-table.json",
  };
}

/** Spike table schema validator - schema-first at network trust boundary (AGENTS.md §1).
 * The spike table artefact crosses a trust boundary (network fetch) and must be
 * validated before any code touches it. This replaces JSON.parse + manual validation.
 */
const SpikeTableSchema = {
  schemaVersion: "number",
  generatedAt: "string",
  generatedBy: "string",
  description: "string",
  method: "string",
  conclusion: "string",
  adrReference: "string?",
  results: {
    strictContainment: {
      fabricationsTested: "number",
      falseVerified: "number",
      falseVerifiedRate: "string",
    },
    semanticSimilarity: {
      fabricationsTested: "number",
      falseVerified: "number",
      falseVerifiedRate: "string",
      note: "string",
    },
    paraphraseDetection: {
      paraphrasesTested: "number",
      detectedByContainment: "number",
      detectedBySemantic: "number",
      note: "string",
    },
  },
};

/** Validate data against schema descriptor (schema-first decoding). */
function validateAgainstSchema(data, schema, path = "root") {
  if (data === null || typeof data !== "object") {
    return { ok: false, error: `${path}: expected object, got ${typeof data}` };
  }
  for (const [key, expectedType] of Object.entries(schema)) {
    const isOptional = key.endsWith("?");
    const actualKey = isOptional ? key.slice(0, -1) : key;
    const type = isOptional ? expectedType.slice(0, -1) : expectedType;
    
    if (!(actualKey in data)) {
      if (!isOptional) {
        return { ok: false, error: `${path}.${actualKey}: missing required field` };
      }
      continue;
    }
    const value = data[actualKey];
    if (typeof type === "object") {
      const nested = validateAgainstSchema(value, type, `${path}.${actualKey}`);
      if (!nested.ok) return nested;
    } else if (typeof value !== type) {
      return { ok: false, error: `${path}.${actualKey}: expected ${type}, got ${typeof value}` };
    }
  }
  return { ok: true };
}

/** Validate spike table data against schema (schema-first at trust boundary). */
function validateSpikeTable(data) {
  return validateAgainstSchema(data, SpikeTableSchema).ok;
}

/** Load the spike table artefact with schema validation at the boundary. */
async function loadSpikeTable(container) {
  const config = getConfig(container);
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(config.spikeTableUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    })
    clearTimeout(timeoutId)
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      return null
    }
    
    // Read as text first, then parse and validate (schema-first at trust boundary)
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.warn("[mizan-refusal] Spike table response was not valid JSON")
      return null
    }
    
    // Schema-first validation at trust boundary (AGENTS.md §1)
    // The spike table artefact crosses a trust boundary (network) and must be validated
    if (!validateSpikeTable(data)) {
      console.warn("[mizan-refusal] Spike table schema validation failed")
      return null
    }
    
    return {
      fabricationRate: data.results.semanticSimilarity.falseVerifiedRate,
      adrReference: data.adrReference ?? "ADR-21",
    }
  } catch {
    return null
  }
}

/** Check if a quote is too short for deterministic verification.
 * 
 * This implementation MUST match @mizan/core/src/render/refusal-block.ts:isQuoteTooShort
 * exactly. Both use normalizeForMatch (which folds Arabic) then count non-whitespace,
 * non-diacritic characters. A CI sync test verifies parity.
 * 
 * We inline the full normalizeForMatch fold logic here because @mizan/core is a Node.js
 * package and cannot be imported in the browser. The algorithm mirrors the core's
 * FOLD_PIPELINE exactly:
 * 1. strip-bidi-controls - remove U+202A-U+202E, U+2066-U+2069, U+200E/U+200F, U+061C
 * 2. nfkc - NFKC compatibility composition
 * 3. fold-arabic-indic-digits - Arabic-Indic (U+0660-U+0669) and Extended (U+06F0-U+06F9) to ASCII
 * 4. strip-join-controls - remove ZWNJ (U+200C) and ZWJ (U+200D)
 * 5. strip-tatweel - remove U+0640 kashida
 * 6. strip-combining-marks - remove tashkeel (Unicode category M); preserves Quranic annotation marks (Cf)
 * 7. fold-letter-forms - alef/yeh/waw/ta-marbuta variants to one canonical letter each
 * 8. collapse-whitespace - collapse runs to single space and trim
 * Then count non-whitespace characters and compare against MIN_VERIFIABLE_QUOTE_CHARS (15)
 */
function isQuoteTooShort(quote, container) {
  const config = getConfig(container);
  const folded = normalizeForMatchWeb(quote);
  // Count non-whitespace characters (matching core: .replace(/[\s\p{M}]/gu, ""))
  // After normalizeForMatch, no combining marks remain, so just remove whitespace
  const arabicChars = folded.replace(/\s+/gu, "");
  return arabicChars.length < config.minQuoteChars
}

/** Browser implementation of normalizeForMatch matching @mizan/core exactly. */
function normalizeForMatchWeb(input) {
  let value = input;
  
  // Stage 1: strip-bidi-controls (MUST run before NFKC for idempotency)
  // U+202A-U+202E, U+2066-U+2069, U+200E/U+200F, U+061C
  value = value.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, "");
  
  // Stage 2: nfkc - NFKC compatibility composition
  value = value.normalize("NFKC");
  
  // Stage 3: fold-arabic-indic-digits
  // Arabic-Indic U+0660-U+0669 and Extended Arabic-Indic U+06F0-U+06F9 to ASCII 0-9
  value = value.replace(/[\u0660-\u0669]/gu, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x30));
  value = value.replace(/[\u06F0-\u06F9]/gu, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 0x30));
  
  // Stage 4: strip-join-controls - ZWNJ (U+200C) and ZWJ (U+200D)
  value = value.replace(/[\u200C\u200D]/gu, "");
  
  // Stage 5: strip-tatweel - U+0640 kashida
  value = value.replace(/\u0640/gu, "");
  
  // Stage 6: strip-combining-marks - all Unicode combining marks (category M)
  // This removes tashkeel but preserves Quranic annotation marks (category Cf)
  value = value.replace(/[\p{Mn}\p{Mc}\p{Me}]+/gu, "");
  
  // Stage 7: fold-letter-forms
  // Alef variants (U+0622, U+0623, U+0625, U+0671, U+0672, U+0673, U+0675) -> U+0627 (ا)
  value = value.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/gu, "\u0627");
  // Yeh variants (U+0649, U+06CC, U+06CD, U+06D0, U+06D2) -> U+064A (ي)
  value = value.replace(/[\u0649\u06CC\u06CD\u06D0\u06D2]/gu, "\u064A");
  // Waw with hamza (U+0624) -> Waw (U+0648) - NFKC already decomposes, but explicit for clarity
  value = value.replace(/\u0624/gu, "\u0648");
  // Yeh with hamza (U+0626) -> Yeh (U+064A) - NFKC already decomposes, but explicit for clarity
  value = value.replace(/\u0626/gu, "\u064A");
  // Ta marbuta variants (U+0629, U+06C3) -> Ha (U+0647)
  value = value.replace(/[\u0629\u06C3]/gu, "\u0647");
  
  // Stage 8: collapse-whitespace - collapse runs to single space and trim
  value = value.replace(/\s+/gu, " ").trim();
  
  return value;
}

/** Create a text node with escaped content. */
function createTextNode(text) {
  return document.createTextNode(text)
}

/** Render the refusal block for a too-short quote as DOM elements. */
export async function renderRefusalBlock(
  quote,
  segmentIndex,
  container
) {
  const spikeData = await loadSpikeTable(container)

  const block = document.createElement("div")
  block.className = "mizan-refusal-block"
  block.setAttribute("role", "alert")
  block.setAttribute("aria-live", "polite")

  // Header
  const header = document.createElement("div")
  header.className = "mizan-refusal-header"
  header.appendChild(createTextNode(`REFUSAL: Segment ${segmentIndex} \u2014 quote too short for deterministic verification`))
  block.appendChild(header)

  // Quote preview
  const quoteEl = document.createElement("div")
  quoteEl.className = "mizan-refusal-quote"
  const preview = quote.length > 100 ? quote.slice(0, 100) + "\u2026" : quote
  quoteEl.appendChild(createTextNode(`Quoted: "${preview}"`))
  block.appendChild(quoteEl)

  // Verdict
  const verdict = document.createElement("div")
  verdict.className = "mizan-refusal-verdict"
  verdict.appendChild(createTextNode("Verdict: unverifiable \u2014 quote too short for deterministic check"))
  block.appendChild(verdict)

  // Spike table section
  const spikeSection = document.createElement("div")
  spikeSection.className = "mizan-refusal-spike"

  if (spikeData) {
    const spikeTitle = document.createElement("div")
    spikeTitle.className = "mizan-refusal-spike-title"
    spikeTitle.appendChild(createTextNode("SPIKE TABLE (ADR-03 measured)"))
    spikeSection.appendChild(spikeTitle)

    const spikeRow1 = document.createElement("div")
    spikeRow1.className = "mizan-refusal-spike-row"
    spikeRow1.appendChild(createTextNode(`Semantic matching false-verified fabricated hadith: ${spikeData.fabricationRate}`))
    spikeSection.appendChild(spikeRow1)

    const spikeRow2 = document.createElement("div")
    spikeRow2.className = "mizan-refusal-spike-row"
    spikeRow2.appendChild(createTextNode("Strict containment (mizan-verify) false-verified: 0.00%"))
    spikeSection.appendChild(spikeRow2)

    const spikeRow3 = document.createElement("div")
    spikeRow3.className = "mizan-refusal-spike-row"
    spikeRow3.appendChild(createTextNode("Conclusion: semantic/meaning matching accepts fabrications"))
    spikeSection.appendChild(spikeRow3)

    const adrLine = document.createElement("div")
    adrLine.className = "mizan-refusal-adr"
    adrLine.appendChild(createTextNode(`Refusal basis: ${spikeData.adrReference} \u2014 "No semantic nearest-match; refusal is product"`))
    spikeSection.appendChild(adrLine)
  } else {
    const unavailable = document.createElement("div")
    unavailable.className = "mizan-refusal-spike-unavailable"
    unavailable.appendChild(createTextNode("Spike table unavailable \u2014 refusal still applies (ADR-21)"))
    spikeSection.appendChild(unavailable)

    const adrLine = document.createElement("div")
    adrLine.className = "mizan-refusal-adr"
    adrLine.appendChild(createTextNode('Refusal basis: ADR-21 \u2014 "No semantic nearest-match; refusal is product"'))
    spikeSection.appendChild(adrLine)
  }

  block.appendChild(spikeSection)

  // No-suggestion notice
  const noSuggestion = document.createElement("div")
  noSuggestion.className = "mizan-refusal-no-suggestion"
  noSuggestion.appendChild(createTextNode("No 'closest in meaning' suggestion is offered. This is a measured product decision, not a missing feature."))
  block.appendChild(noSuggestion)

  container.appendChild(block)
}

/** Render refusal blocks for multiple too-short quotes. */
export async function renderRefusalBlocks(
  quotes,
  container
) {
  const tooShort = quotes.filter(q => isQuoteTooShort(q.quote, container))
  if (tooShort.length === 0) return

  const section = document.createElement("section")
  section.className = "mizan-refusal-blocks"
  section.setAttribute("aria-label", "Refusal blocks for incomplete quotes")

  const title = document.createElement("h3")
  title.appendChild(createTextNode("REFUSAL BLOCKS (incomplete quotes)"))
  section.appendChild(title)

  for (const q of tooShort) {
    const blockContainer = document.createElement("div")
    blockContainer.className = "mizan-refusal-block-wrapper"
    await renderRefusalBlock(q.quote, q.segmentIndex, blockContainer)
    section.appendChild(blockContainer)
  }

  container.appendChild(section)
}

/** Quotes array schema for DOM trust boundary validation. */
const QuotesArraySchema = {
  quote: "string",
  segmentIndex: "number",
};

/** Validate quotes array from DOM attribute (schema-first at trust boundary). */
function validateQuotesArray(data) {
  if (!Array.isArray(data)) return false;
  for (const item of data) {
    const result = validateAgainstSchema(item, QuotesArraySchema, "quotes[]");
    if (!result.ok) return false;
  }
  return true;
}

/** Auto-initialize from data attributes on page load. */
export function initRefusalBlocks() {
  const containers = document.querySelectorAll("[data-mizan-refusal-blocks]")
  for (const container of containers) {
    try {
      const quotesJson = container.getAttribute("data-mizan-refusal-blocks")
      if (!quotesJson) continue
      let quotes
      try {
        quotes = JSON.parse(quotesJson)
      } catch {
        console.error("[mizan] Invalid quotes JSON in data attribute")
        continue
      }
      // Schema-first validation at trust boundary (AGENTS.md §1)
      // The quotes array crosses a trust boundary (DOM attribute) and must be validated
      if (!validateQuotesArray(quotes)) {
        console.error("[mizan] Invalid quotes structure in data attribute")
        continue
      }
      renderRefusalBlocks(quotes, container)
    } catch (e) {
      console.error("[mizan] Failed to initialize refusal blocks:", e)
    }
  }
}

// Auto-init on DOM ready
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRefusalBlocks)
  } else {
    initRefusalBlocks()
  }
}