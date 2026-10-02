import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DocsClaim } from "../src/docs-claims.ts"

import { checkedPaths, runDocsClaimChecks } from "../src/docs-check.ts"
import { LOCATED_VERDICT, POLARITY_REASONS, UNLOCATED_VERDICT, checkVerdictPolarityInverted } from "../src/docs-polarity.ts"

/**
 * Story 1 — rule twenty, the anchor arm's verdict polarity.
 *
 * The defect this rule exists for is a specification that stated the mapping as the inverse of the
 * code, so the prose a judge reads to understand the verifier would have been wrong about the one
 * thing the verifier is. Most tests here are pairs: the true statement passes and its inverse fails,
 * because a polarity rule that only knows the error reports nothing useful about a document that is
 * merely unclear.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((found) => found.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((found) => `${found.rule}: ${found.detail}`).join("\n")

const LOCATED_REASON = POLARITY_REASONS.find((arm) => arm.verdict === LOCATED_VERDICT)?.reason ?? ""
const UNLOCATED_REASON = POLARITY_REASONS.find((arm) => arm.verdict === UNLOCATED_VERDICT)?.reason ?? ""

/** What `anchoredOutcome` emits, quoted in running prose the way a document states it. */
const states = (subject: string, verdict: string, reason: string): string => `A claim whose anchor is ${subject} is \`${verdict}\` with reason \`${reason}\`.\n`

describe("R20 - the mapping ADR-C1 records is the one a document has to state", () => {
  test("a located anchor is unverifiable for want of a matching span", () => {
    expect(details(checkVerdictPolarityInverted(states("located", LOCATED_VERDICT, LOCATED_REASON), "docs/anchor-protocol.md"))).toBe("")
  })

  test("an anchor that cannot be located is rejected as absent at the cited id", () => {
    expect(details(checkVerdictPolarityInverted(states("not located", UNLOCATED_VERDICT, UNLOCATED_REASON), "docs/anchor-protocol.md"))).toBe("")
  })

  test("the literal `located: false` form is read the same way as the prose form", () => {
    expect(details(checkVerdictPolarityInverted("With `located: false` the claim becomes `rejected` with reason `quote_absent_at_cited_id`.\n", "docs/anchor-protocol.md"))).toBe("")
  })

  test("the `unlocat-` prefix is false on its own, with no negator before it", () => {
    // The form the token admits and the classification used to miss: `LOCATE_TOKEN` reads `unlocated`
    // and `unlocatable`, so `verdictFor` has to be able to call both of them false. Without the
    // prefix branch this sentence — which states the mapping the code emits — is reported as
    // inverted, and its inverse passes. Found by review; asserted here as a pair.
    expect(details(checkVerdictPolarityInverted("An unlocated anchor is `rejected`.\n", "README.md"))).toBe("")
    expect(rules(checkVerdictPolarityInverted("An unlocated anchor is `unverifiable`.\n", "README.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("the longer member of the same family is classified the same way", () => {
    expect(details(checkVerdictPolarityInverted("An unlocatable anchor is `rejected` with reason `quote_absent_at_cited_id`.\n", "docs/anchor-protocol.md"))).toBe("")
    expect(rules(checkVerdictPolarityInverted("An unlocatable anchor is `unverifiable`.\n", "docs/anchor-protocol.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("a literal form outranks a negator that governs something else", () => {
    // `located: true` decides the mention before the negator scan is reached, so "does not follow
    // that" three words back cannot make the mention negative.
    expect(details(checkVerdictPolarityInverted("It does not follow that `located: true` is `unverifiable`.\n", "docs/anchor-protocol.md"))).toBe("")
  })

  test("a bare mention still takes its polarity from a negator in the window", () => {
    // The residual the header names, pinned so it cannot be quietly forgotten in either direction.
    // The negator here binds to "missing", not to "located", and three words is the whole reach: the
    // honest sentence is reported, and the inverted one passes. Both halves are the same window.
    expect(rules(checkVerdictPolarityInverted("When the anchor is not missing it is located, so `rejected`.\n", "docs/anchor-protocol.md"))).toEqual(["verdict-polarity-inverted"])
    expect(details(checkVerdictPolarityInverted("When the anchor is not missing it is located, so `unverifiable`.\n", "docs/anchor-protocol.md"))).toBe("")
  })

  test("the shouted spelling the README uses is read too", () => {
    expect(details(checkVerdictPolarityInverted("Located: REJECTED for no matching evidence.\n", "README.md"))).not.toBe("")
    expect(details(checkVerdictPolarityInverted("Located: UNVERIFIABLE for no matching evidence.\n", "README.md"))).toBe("")
  })
})

describe("R20 - the inverse mapping is reported, wherever it is written", () => {
  test("the planted violation: located, inverted", () => {
    const claims = checkVerdictPolarityInverted(states("located", UNLOCATED_VERDICT, LOCATED_REASON), "docs/anchor-protocol.md")
    expect(rules(claims)).toEqual(["verdict-polarity-inverted"])
    expect(details(claims)).toContain("docs/anchor-protocol.md")
    expect(details(claims)).toContain("line 1")
    expect(details(claims)).toContain(UNLOCATED_VERDICT)
    expect(details(claims)).toContain(LOCATED_VERDICT)
  })

  test("the other direction of the same inversion, unlocated", () => {
    expect(rules(checkVerdictPolarityInverted(states("not located", LOCATED_VERDICT, UNLOCATED_REASON), "docs/anchor-protocol.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("the literal form, inverted, is caught as well", () => {
    expect(rules(checkVerdictPolarityInverted("With `located: true` the claim becomes `rejected`.\n", "docs/anchor-protocol.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("the verdict alone is enough, without the reason", () => {
    // A document that states only the verdict is making the same claim with less to check, and a
    // rule that needed the reason would have been quiet on the version people actually write.
    expect(rules(checkVerdictPolarityInverted("A located anchor is `rejected`.\n", "README.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("the reason alone is enough, without the verdict", () => {
    expect(rules(checkVerdictPolarityInverted("An anchor that cannot be located is rejected, with reason `no_matching_evidence`.\n", "README.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("plain prose counts, not only backticks", () => {
    expect(rules(checkVerdictPolarityInverted("A claim whose anchor is located is rejected, because the citation says something else.\n", "README.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("a sentence about a corpus record is the residual the token's boundary states", () => {
    // Recorded rather than hidden. A verdict is read wherever it appears, so a sentence naming a
    // *record* and a verdict pairs them the same way. Telling the two apart needs to know that
    // `record` is a noun, which is a parser; the phrase-list alternative is what made this rule
    // wrong the first time. Pinned so a future narrowing of the token is a deliberate change.
    expect(rules(checkVerdictPolarityInverted("The located record was rejected at ingest.\n", "docs/anchor-protocol.md"))).toEqual(["verdict-polarity-inverted"])
  })

  test("both arms on one line are reported once, and the line is the unit", () => {
    // One line carrying both arms is one sentence pair a reader reaches together, so it is one
    // finding with one fix. Reporting it twice would teach the reader that findings are noise.
    expect(checkVerdictPolarityInverted("Located is REJECTED; not located is UNVERIFIABLE.\n", "README.md")).toHaveLength(1)
  })

  test("the finding cites the authority, so the fix is a document to open rather than a guess", () => {
    const claims = checkVerdictPolarityInverted(states("located", UNLOCATED_VERDICT, LOCATED_REASON), "docs/anchor-protocol.md")
    expect(details(claims)).toContain("ADR-C1")
    expect(details(claims)).toContain("docs/anchor-protocol.md")
  })
})

describe("R20 - what a document may still say", () => {
  test("a sentence that records the proposal and the correction is allowed", () => {
    // This is what ADR-C7's own Context does, and it has to be allowed: a document explaining the
    // mistake it is not making does the opposite of the defect. The rule reads the verdicts inside
    // one anchor's window, so naming the wrong verdict and then the right one passes.
    const document = "A specification proposed `rejected` for a located anchor. The code emits `unverifiable`, and ADR-C7 is the authority.\n"
    expect(details(checkVerdictPolarityInverted(document, "docs/specs/adr/ADR-C7.md"))).toBe("")
  })

  test("a document contrasting the two arms honestly is allowed", () => {
    expect(details(checkVerdictPolarityInverted("A located anchor becomes `unverifiable` rather than `rejected`.\n", "README.md"))).toBe("")
  })

  test("a document that states the human ruling and the procedure output distinctly is allowed", () => {
    const document = "The 40 red-team fabrications are ruled `rejected` by a human, and the procedure emits `unverifiable` for them.\n"
    expect(details(checkVerdictPolarityInverted(document, "docs/value-proof.md"))).toBe("")
  })

  test("a locator that says what ran and not what came of it is not a finding", () => {
    // Nothing to contradict yet. A rule that reported this would be reporting the absence of a claim
    // as a false claim, and would be switched off for it.
    expect(details(checkVerdictPolarityInverted("The locator is run on every cited record before containment is attempted.\n", "docs/anchor-protocol.md"))).toBe("")
  })

  test("a document that names verdicts without attaching one to the other is not this rule's business", () => {
    expect(details(checkVerdictPolarityInverted("No arm of this repository has ever emitted `verified`.\n", "docs/demo-runbook.md"))).toBe("")
  })

  test("the timeout arm is step four, not this arm, so a timeout sentence is not judged here", () => {
    // Stated rather than assumed: `verification_timeout` belongs to the deadline in step four, and a
    // locator phrase on that sentence would be the rule reaching past the decision it records.
    expect(details(checkVerdictPolarityInverted("A deadline that fires during the search yields `unverifiable` with reason `verification_timeout`.\n", "docs/anchor-protocol.md"))).toBe("")
  })
})

describe("the shipped documents state the mapping the code emits", () => {
  test("no surface inverts it", () => {
    expect(rules(runDocsClaimChecks(ROOT).claims.filter((found) => found.rule === "verdict-polarity-inverted"))).toEqual([])
  })

  test("the surfaces that state the mapping are audited", () => {
    const paths = checkedPaths(runDocsClaimChecks(ROOT))
    expect(paths).toContain("docs/anchor-protocol.md")
    expect(paths).toContain("README.md")
    expect(paths).toContain("docs/specs/adr/ADR-C7.md")
  })

  test("ADR-C7's table agrees with the constants this rule checks", () => {
    // The record and the code are one fact in two places, which is only safe because the two are
    // compared. A table cell edited without the constant, or the reverse, fails here.
    const table = readFileSync(join(ROOT, "docs/specs/adr/ADR-C7.md"), "utf8")
    expect(table).toContain(`\`${LOCATED_VERDICT}\``)
    expect(table).toContain(LOCATED_REASON)
    expect(table).toContain(`\`${UNLOCATED_VERDICT}\``)
    expect(table).toContain(UNLOCATED_REASON)
  })

  test("the code emits what the record claims, arm for arm", () => {
    // Read from `verify.ts` rather than from a copy of it, so the assertion is about the shipped
    // code and not about a fixture that would keep passing after the code moved. The arms are
    // reached through builders, so each is checked where it is built.
    const verify = readFileSync(join(ROOT, "packages/mizan-verify/src/verify.ts"), "utf8")
    expect(verify).toContain(`verdict: "${LOCATED_VERDICT}"`)
    expect(verify).toContain(`verdict: "${UNLOCATED_VERDICT}"`)
    expect(verify).toContain(`reason: "${UNLOCATED_REASON}"`)
    expect(verify).toContain(`unverifiable(claim.id, "${LOCATED_REASON}")`)
    // Both arms name their reason in one function, which is where the mapping lives.
    const arms = verify.slice(verify.indexOf("const anchoredOutcome"), verify.indexOf("/**\n * Verify every claim"))
    expect(arms).toContain(LOCATED_REASON)
    expect(arms).toContain(UNLOCATED_VERDICT)
  })

  test("`verified` has exactly one constructor in the verifier, and it is not in the anchor arm", () => {
    // The point of the anchor arm: neither arm of it can produce `verified`. A second constructor
    // anywhere in the file would be the CWE-345 hole, so the count is asserted rather than assumed.
    const verify = readFileSync(join(ROOT, "packages/mizan-verify/src/verify.ts"), "utf8")
    expect(verify.split('verdict: "verified"')).toHaveLength(2)
    const arms = verify.slice(verify.indexOf("const anchoredOutcome"), verify.indexOf("/**\n * Verify every claim"))
    expect(arms).not.toContain("verified")
  })

  test("the rule's vocabulary is the reason vocabulary, which is the closed half", () => {
    // Two arms, two reasons. A third arm appearing in the code without appearing here is the change
    // that would make this rule incomplete, so the count is asserted rather than assumed.
    expect(POLARITY_REASONS).toHaveLength(2)
    expect([...POLARITY_REASONS].map((arm) => arm.verdict).sort()).toEqual([LOCATED_VERDICT, UNLOCATED_VERDICT].sort())
  })
})