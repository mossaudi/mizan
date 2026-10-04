import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  FINGERPRINT_SHORT_FORM_CHARS,
  LATENCY_KEYS,
  REQUIRED_LATENCY_KEYS,
  checkLatencyCorpusNamed,
  checkLatencyFigureUnbacked,
  shortFingerprint,
  type LatencyArtefact,
} from "../src/docs-value-latency.ts"

/**
 * Story 9 — R18, a published latency figure must resolve to the recorded measurement, within the band,
 * and must name the corpus it was measured on.
 *
 * The planted violations are the two drifts ADR-C10 recorded as unwritten: ADR-08 printed a figure that
 * the harness no longer recorded (and passed, because nothing read it), and the degradation matrix
 * printed a figure with no corpus identity at all. Both are checked here against the real artefact, so a
 * rule that silently stops matching this repository's own spelling of a latency is caught by CI.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const ARTEFACT_PATH = "data/benchmark/vs-search.json"
const artefact: LatencyArtefact = { path: ARTEFACT_PATH, text: readFileSync(join(ROOT, ARTEFACT_PATH), "utf8") }

const rules = (claims: readonly { readonly rule: string }[]): readonly string[] => claims.map((found) => found.rule)
const details = (claims: readonly { readonly detail: string }[]): string => claims.map((found) => found.detail).join("\n")

/**
 * Every audited document that states a latency in a shape the rule recognises, listed once.
 *
 * Four documents, and the list is derived rather than padded. `README.md` is audited and names the
 * snapshot, but it states no latency, so it is not in this list — and the reach test below would have
 * thrown on it, which is the correct outcome for a document listed as governed by a rule it never
 * engages. Adding a name here is therefore a claim that the document writes a latency the rule can
 * read, and the test checks that claim rather than trusting it.
 *
 * One list, read by both directions of the reach test, so "the documents this rule governs" cannot be
 * one list in the passing test and a different one in the failing test.
 */
const LATENCY_BEARING_DOCUMENTS = [
  "docs/degradation-matrix.md",
  "docs/scaling-path.md",
  "docs/specs/measurements.md",
  "docs/specs/adr/ADR-08.md",
] as const

/** The committed figures, read rather than retyped, so this suite cannot drift from the artefact. */
const recorded = (key: string): number => (JSON.parse(artefact.text ?? "{}") as Record<string, number>)[key] as number

describe("R18 - a published latency figure is backed by the recorded measurement", () => {
  test("the committed figure of record passes", () => {
    const document = readFileSync(join(ROOT, "docs/specs/measurements.md"), "utf8")
    expect(details(checkLatencyFigureUnbacked(document, "docs/specs/measurements.md", artefact))).toBe("")
  })

  test("every audited document that states a latency passes", () => {
    // The rule is only as good as its reach, so it is exercised against the documents it governs rather
    // than than a fixture: a document added later carrying a stale figure must fail here.
    for (const document of LATENCY_BEARING_DOCUMENTS) {
      const text = readFileSync(join(ROOT, document), "utf8")
      expect(details(checkLatencyFigureUnbacked(text, document, artefact))).toBe("")
    }
  })

  test("REACHABILITY: a stale figure planted in each of those documents is caught in its own spelling", () => {
    // The defect ADR-C10 records was not a wrong number — it was a wrong number in a file nothing read,
    // so the rule passed while the drift survived. A unit test with a hand-written string proves only
    // that the regex matches that string; it does not prove the pattern matches the way these
    // documents actually write a latency. So the violation is planted INTO each real document, at its
    // real p95, and the rule has to fail on the result. A document that stops writing a recognisable
    // latency therefore fails this test, which is the alarm that the pattern has gone stale.
    const measured = recorded(LATENCY_KEYS.p95)
    const stale = Math.round(measured * 4)
    for (const document of LATENCY_BEARING_DOCUMENTS) {
      const text = readFileSync(join(ROOT, document), "utf8")
      const planted = text.replace(new RegExp(`\\bp95\\b[^0-9\\n]{0,24}?${measured} ms\\b`), `p95 ${stale} ms`)
      if (planted === text) {
        // Not a silent skip. A document that no longer carries the recorded p95 in a recognised
        // spelling is a coverage loss, and reporting nothing here would be the inert-rule failure
        // mode this very test exists to prevent.
        throw new Error(`${document} carries no recognisable \`p95 ${measured} ms\` to replace, so the rule's reach over it is unproven`)
      }
      const claims = checkLatencyFigureUnbacked(planted, document, artefact)
      expect(details(claims)).toContain(`p95 ${stale}ms`)
      expect(details(claims)).toContain(String(measured))
    }
  })

  test("the planted violation: a stated p95 outside the recorded band", () => {
    const measured = recorded(LATENCY_KEYS.p95)
    const claims = checkLatencyFigureUnbacked(`p95 ${measured * 4} ms per rejected claim\n`, "docs/specs/adr/ADR-08.md", artefact)
    expect(rules(claims)).toEqual(["latency-claim-unbacked"])
    expect(details(claims)).toContain(`p95 ${measured * 4}ms`)
    expect(details(claims)).toContain(String(measured))
  })

  test("a stated p50 below the recorded figure is a claim too, so understatement is not the safe direction", () => {
    const measured = recorded(LATENCY_KEYS.p50)
    const claims = checkLatencyFigureUnbacked(`p50 ${Math.round(measured / 4)} ms\n`, "docs/specs/adr/ADR-08.md", artefact)
    expect(rules(claims)).toEqual(["latency-claim-unbacked"])
  })

  test("a thousands-grouped figure is read as the number it spells, not as a different number", () => {
    // `1,234` is how a reader parses it and how the grouping rule prints it; judging it as 1 would be a
    // false positive against the honest rendering of a legitimate four-digit measurement.
    const measured = recorded(LATENCY_KEYS.p50)
    const grouped = Math.round(measured * 1.1).toLocaleString("en-US")
    expect(details(checkLatencyFigureUnbacked(`p50 ${grouped} ms\n`, "docs/specs/adr/ADR-08.md", artefact))).toBe("")
  })

  test("a stated max below the recorded one fails, because a trimmed maximum is flattery", () => {
    const measured = recorded(LATENCY_KEYS.max)
    const claims = checkLatencyFigureUnbacked(`max ${Math.round(measured / 2)} ms\n`, "docs/specs/adr/ADR-08.md", artefact)
    expect(rules(claims)).toEqual(["latency-claim-unbacked"])
    expect(details(claims)).toContain("may not sit below")
  })

  test("a stated max above the recorded one passes, because the conservative direction is honest", () => {
    const measured = recorded(LATENCY_KEYS.max)
    const claims = checkLatencyFigureUnbacked(`max ${Math.round(measured * 4)} ms\n`, "docs/specs/adr/ADR-08.md", artefact)
    expect(details(claims)).toBe("")
  })

  test("a document stating no latency is not this rule's business", () => {
    expect(checkLatencyFigureUnbacked("The verifier has no clock.\n", "INTEGRITY.md", artefact)).toEqual([])
  })

  test("a missing artefact is reported rather than skipped, per fail-closed", () => {
    const claims = checkLatencyFigureUnbacked("p95 752 ms\n", "docs/specs/adr/ADR-08.md", { path: ARTEFACT_PATH, text: null })
    expect(rules(claims)).toEqual(["latency-claim-unbacked"])
    expect(details(claims)).toContain(ARTEFACT_PATH)
  })

  test("a nested artefact is reported, not silently judged against nothing", () => {
    // The failure this pins: `readFigures` collects top-level numerics only, so latency keys moved under
    // a `retrieval` object would leave this rule judging against nothing while still reading as a parsed
    // artefact. The unrelated top-level number is what makes it parse, and therefore what makes the trap
    // live: without it the unreadable-artefact path would fire instead and the shape bug would hide.
    const nested = JSON.stringify({ retrievalRecallAt1: 0.918, retrieval: { [LATENCY_KEYS.p95]: 752 } })
    const claims = checkLatencyFigureUnbacked("p95 752 ms\n", "docs/specs/adr/ADR-08.md", { path: ARTEFACT_PATH, text: nested })
    // One finding per absent key rather than one per statement: the fix is the same edit either way, and
    // four findings for one structural mistake is noise a reader learns to skip.
    expect(new Set(rules(claims))).toEqual(new Set(["latency-claim-unbacked"]))
    expect(claims).toHaveLength(REQUIRED_LATENCY_KEYS.length)
    expect(details(claims)).toContain("no top-level numeric")
    expect(details(claims)).toContain(LATENCY_KEYS.p95)
    expect(details(claims)).toContain(LATENCY_KEYS.band)
  })

  test("a missing band key is a finding, never an implicit 1.0x", () => {
    const partial = JSON.stringify({ [LATENCY_KEYS.p50]: 632, [LATENCY_KEYS.p95]: 754, [LATENCY_KEYS.max]: 755 })
    const claims = checkLatencyFigureUnbacked("p95 754 ms\n", "docs/specs/adr/ADR-08.md", { path: ARTEFACT_PATH, text: partial })
    expect(rules(claims)).toEqual(["latency-claim-unbacked"])
    expect(details(claims)).toContain(LATENCY_KEYS.band)
  })

  test("an external figure is left to the registry that requires its citation", () => {
    const external = [recorded(LATENCY_KEYS.p95) * 4]
    expect(checkLatencyFigureUnbacked(`p95 ${external[0]} ms\n`, "docs/value-proof.md", artefact, external)).toEqual([])
  })
})

describe("R18b - a published latency names the corpus it was measured on", () => {
  const fingerprint = (JSON.parse(artefact.text ?? "{}") as Record<string, string>)[LATENCY_KEYS.fingerprint] as string

  test("the short form the repository prints satisfies the rule", () => {
    const document = `p95 754 ms on the committed corpus snapshotHash=${shortFingerprint(fingerprint)}.\n`
    expect(checkLatencyCorpusNamed(document, "docs/specs/adr/ADR-08.md", artefact)).toEqual([])
  })

  test("the full hash also satisfies it, because a document that said more is not told it said too little", () => {
    expect(checkLatencyCorpusNamed(`p95 754 ms on ${fingerprint}\n`, "docs/specs/adr/ADR-08.md", artefact)).toEqual([])
  })

  test("the planted violation: the figure with no corpus beside it", () => {
    const claims = checkLatencyCorpusNamed("p95 754 ms per rejected claim.\n", "docs/degradation-matrix.md", artefact)
    expect(rules(claims)).toEqual(["latency-corpus-unnamed"])
    expect(details(claims)).toContain(shortFingerprint(fingerprint))
  })

  test("a document stating no latency needs no corpus identity", () => {
    expect(checkLatencyCorpusNamed("The verifier has no clock.\n", "INTEGRITY.md", artefact)).toEqual([])
  })

  test("an artefact recording no fingerprint is reported, because no corpus can then be named", () => {
    const claims = checkLatencyCorpusNamed("p95 754 ms\n", "docs/degradation-matrix.md", { path: ARTEFACT_PATH, text: JSON.stringify({ [LATENCY_KEYS.p95]: 754 }) })
    expect(rules(claims)).toEqual(["latency-corpus-unnamed"])
  })

  test("the short form is the width README.md already prints, so the rule adopts a convention rather than minting one", () => {
    expect(FINGERPRINT_SHORT_FORM_CHARS).toBe(16)
    const readme = readFileSync(join(ROOT, "README.md"), "utf8")
    expect(readme).toContain(shortFingerprint(fingerprint))
  })

  test("every audited document stating a latency names the corpus", () => {
    for (const document of LATENCY_BEARING_DOCUMENTS) {
      const text = readFileSync(join(ROOT, document), "utf8")
      expect(details(checkLatencyCorpusNamed(text, document, artefact))).toBe("")
    }
  })

  test("REACHABILITY: removing the corpus identity from a real document is caught in its own spelling", () => {
    // The companion to the reach test above, and the half that is easy to forget: a figure can agree
    // with the artefact perfectly and still be describing a corpus this repository no longer serves. The
    // fingerprint is deleted from the real documents rather than replaced, because a replaced
    // fingerprint would be a *different* wrong value rather than the *absent* one this rule exists to
    // catch — and the absence is what survived in the document that had it.
    const short = shortFingerprint(fingerprint)
    for (const document of LATENCY_BEARING_DOCUMENTS) {
      const text = readFileSync(join(ROOT, document), "utf8")
      if (!text.includes(short)) {
        throw new Error(`${document} never named the recorded snapshot ${short}, so the corpus-identity rule has nothing to judge it on`)
      }
      // The full hash first, then the short form: the short form is a prefix of the full one, so the
      // other order leaves a 48-character tail behind and the deletion tests nothing.
      const stripped = text.replaceAll(fingerprint, "").replaceAll(short, "")
      expect(rules(checkLatencyCorpusNamed(stripped, document, artefact))).toContain("latency-corpus-unnamed")
    }
  })
})