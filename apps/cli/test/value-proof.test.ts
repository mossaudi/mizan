import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isOk, type RunTrace } from "@mizan/core"
import { auditRunLedger, describeProblem } from "@mizan/provenance"
import {
  BENCHMARK_ARTEFACT,
  checkAnswerQualityClaim,
  checkBenchmarkClaimUnbacked,
  type StatedBenchmark,
} from "@mizan/gate"

/**
 * Story 6's acceptance criteria, asserted against the real pack rather than a fixture.
 *
 * The gate package's own tests prove the RULES (a planted violation is caught and named). What
 * cannot be proved there is that this repository's actual document is honest — so the three claims
 * a judge will check are re-derived here from the committed files:
 *
 *  - **s6-ac1**, every printed number traces to `data/benchmark/vs-search.json`: the same rule the
 *    gate runs, against the same document, so a stale figure fails CI rather than a review.
 *  - **s6-ac2**, the claim is one short sentence at the top and asserts no answer or retrieval
 *    quality — the negative space ADR-C2 draws.
 *  - **s6-ac4**, the ledger excerpt is a projection of two real adjacent entries, carrying hashes
 *    and a verdict code and nothing a reader could leak.
 *
 * s6-ac3 (an unbacked figure fails the gate and names the claim) is proved at both ends: the gate
 * package plants the violation, and the drift test below shows this document failing the same way
 * once a number is edited by hand.
 */
const ROOT = join(import.meta.dir, "..", "..", "..")
const PACK_PATH = join(ROOT, "docs", "value-proof.md")
const PACK = readFileSync(PACK_PATH, "utf8")

const ARTIFACT: StatedBenchmark = { path: BENCHMARK_ARTEFACT, text: readFileSync(join(ROOT, BENCHMARK_ARTEFACT), "utf8") }

const details = (claims: readonly { readonly rule: string; readonly detail: string }[]): string =>
  claims.map((entry) => `${entry.rule}: ${entry.detail}`).join("\n")

/** The fenced `json` block the pack publishes as its ledger excerpt. */
const excerptOf = (document: string): string => {
  const match = document.match(/```json\n([\s\S]*?)\n```/)
  if (match === null || match[1] === undefined) throw new Error("the pack publishes no ```json ledger excerpt")
  return match[1]
}

/** The claim's verdict, from a trace that must carry exactly one claim. */
const verdictOf = (trace: RunTrace): string => {
  const summary = trace.claims[0]
  if (summary === undefined) throw new Error("a ledger entry in the excerpt carries no claim to report")
  return summary.verdict
}

describe("s6-ac1 — every figure in the pack is one the committed artefact publishes", () => {
  test("the document draws no benchmark claim out of the gate", () => {
    expect(details(checkBenchmarkClaimUnbacked(PACK, "docs/value-proof.md", ARTIFACT))).toBe("")
  })

  test("s6-ac3 — a figure edited by hand is caught, and the finding names the artefact", () => {
    // The negative half of the same rule: the pack is correct today, so the only way to show it
    // fails when it is not is to break it. The first row is the detection rate, which is where a
    // hand edit would land.
    const drifted = PACK.replace("**100.0%**", "**99.0%**")
    expect(drifted).not.toBe(PACK)
    const claims = checkBenchmarkClaimUnbacked(drifted, "docs/value-proof.md", ARTIFACT)
    expect(claims.length).toBeGreaterThan(0)
    const reported = details(claims)
    expect(reported).toContain("data/benchmark/vs-search.json")
    expect(reported).toContain("99.0")
  })
})

describe("s6-ac2 — the one-sentence claim, and the scope it refuses", () => {
  test("is stated before any section, and is short enough to read in one breath", () => {
    const quoteLines = PACK.split("\n").filter((line) => line.startsWith("> "))
    const quote = quoteLines.map((line) => line.slice(2)).join(" ")
    expect(quote.length).toBeLessThan(400)
    expect(quote).toContain("fail-closed verdict per claim")
    expect(quote).toContain("hash-chained receipt")

    // The claim is the FIRST thing after the title: a judge who stops reading at the second screen
    // still has it. The H1 is the only heading it may follow.
    const firstLine = quoteLines[0] ?? ""
    expect(firstLine).not.toBe("")
    expect(PACK.indexOf(firstLine)).toBeGreaterThan(PACK.indexOf("# Value proof"))
    expect(PACK.indexOf(firstLine)).toBeLessThan(PACK.indexOf("\n## "))
  })

  test("claims neither answer nor retrieval quality anywhere in the document", () => {
    expect(details(checkAnswerQualityClaim(PACK, "docs/value-proof.md"))).toBe("")
  })
})

describe("s6-ac4 — the ledger excerpt carries hashes and verdicts, and nothing else", () => {
  test("projects two real adjacent entries, chained, with no field the rule forbids", () => {
    const block = excerptOf(PACK)
    const entryHashes = [...block.matchAll(/"entryHash": "([0-9a-f]{64})"/g)].map((match) => match[1] ?? "")
    expect(entryHashes).toHaveLength(2)

    const audited = auditRunLedger(readFileSync(join(ROOT, "data", "runs.jsonl"), "utf8"))
    if (!isOk(audited)) throw new Error(`the committed run ledger does not audit: ${describeProblem(audited.error)}`)
    const traces = audited.value.traces

    const pair: RunTrace[] = []
    for (const entryHash of entryHashes) {
      const found = traces.find((trace) => trace.entryHash === entryHash)
      if (found === undefined) throw new Error("the excerpt quotes an entryHash the committed ledger does not contain")
      pair.push(found)
    }
    const first = pair[0]
    const second = pair[1]
    if (first === undefined || second === undefined || pair.length !== 2) throw new Error("the excerpt does not carry exactly two ledger entries")

    // Adjacent, and linked: the second entry's prevHash is the first entry's entryHash, which is
    // the whole of what a hash chain claims about these two runs.
    const firstIndex = traces.indexOf(first)
    expect(firstIndex).toBeGreaterThanOrEqual(0)
    expect(traces.indexOf(second)).toBe(firstIndex + 1)
    expect(second.prevHash).toBe(first.entryHash)
    expect(first.claims).toHaveLength(1)
    expect(second.claims).toHaveLength(1)

    // The excerpt is EXACTLY this projection — compared as text rather than parsed, so the key set
    // and the key order are both part of the assertion. One more field in the document and the
    // strings stop matching, which is the mechanical half of "no question text, no corpus text,
    // no PII, no key".
    const projected = [first, second].map((trace) => ({
      questionHash: trace.questionHash,
      verdict: verdictOf(trace),
      prevHash: trace.prevHash,
      entryHash: trace.entryHash,
    }))
    expect(block).toBe(JSON.stringify(projected, null, 2))
  })

  test("names no content field a reader could reconstruct a question from", () => {
    const block = excerptOf(PACK)
    for (const forbidden of ['"question"', '"answer"', '"text"', '"corpus', '"prompt', '"pii', '"key"']) {
      expect(block).not.toContain(forbidden)
    }
  })
})
