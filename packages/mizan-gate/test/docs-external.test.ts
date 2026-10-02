import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { DocsClaim } from "../src/docs-claims.ts"
import { EXTERNAL_CLAIMS_PATH, checkExternalClaimUnbacked, externalClaimFigures, type FigurePromise } from "../src/docs-external.ts"

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname } from "node:path"
import { FIGURE_PROMISE_DOCUMENTS, BENCHMARK_ARTEFACT, runDocsClaimChecks } from "../src/docs-check.ts"
import { checkBenchmarkClaimUnbacked, statementBacking, type StatedBenchmark } from "../src/docs-value.ts"

/**
 * Story 1 — the external claim registry, and rule seventeen.
 *
 * The rule has two halves and each is proved by planting a violation, because both are checks that
 * pass by absence: a document with no marker and a registry with no entry are both indistinguishable
 * from correct unless something is asserted about the case where one of them is present and wrong.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const registryText = readFileSync(join(ROOT, EXTERNAL_CLAIMS_PATH), "utf8")
const registry: unknown = JSON.parse(registryText)
const benchmark: StatedBenchmark = { path: BENCHMARK_ARTEFACT, text: readFileSync(join(ROOT, BENCHMARK_ARTEFACT), "utf8") }

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((found) => found.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((found) => `${found.rule}: ${found.detail}`).join("\n")

/** A complete entry, so each test breaks exactly one field rather than inheriting a broken one. */
const entry = (overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> => ({
  id: "citation-support-gap",
  figure: 60,
  statement: "More than 60% of 1,600 citation queries returned the wrong source.",
  source: "The Tow Center for Digital Journalism",
  url: "https://example.org/study",
  retrievedOn: "2026-10-01",
  scope: "eight AI search tools, news citations",
  ownsVerdict: false,
  ...overrides,
})

const registryOf = (...entries: readonly Readonly<Record<string, unknown>>[]): unknown => ({ claims: entries })

/**
 * The promise exactly as `docs-check.ts` builds it: what this document attributes to a named rate,
 * keyed by the line that makes the attribution.
 *
 * Built from the committed artefacts rather than hand-written, so the tests below exercise the
 * *backing rule* and not only the rule that reads it — which is where the review found the hole, and
 * again two reviews later: the hand-written set pooled every attribution in the document, so a
 * percentage anywhere could borrow a spelling credited somewhere else.
 */
const shippedPromise = (document: string): FigurePromise => ({ backing: statementBacking(document, benchmark) })

/** Write `files` into a fresh temp tree, for the one assertion that has to exercise the runner. */
const tree = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "mizan-external-"))
  for (const [relative, body] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body, "utf8")
  }
  return root
}

/**
 * A document whose benchmark section prints the registry's figure, with or without a marker.
 *
 * The marker is passed in as a whole so the fixture can print the backticked citation a document
 * would really write — which is how this suite found that an id ending in a year injects a figure
 * into rule ten's scope. The shipped ids are digit-free for exactly that reason, and there is a test
 * below that keeps them so.
 */
const valueProof = (marker: string): string =>
  ["## The system arm", "", "Other tools are not asked the same question and are not scored here.", "", `Published work puts the support gap above 60% \`${marker}\`.`, ""].join("\n")

describe("R17 - a cited figure resolves to a registry entry, and the entry is a citation", () => {
  test("a complete entry behind its marker passes", () => {
    expect(details(checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", registryOf(entry())))).toBe("")
  })

  test("a marker that resolves to no entry fails and names the registry", () => {
    // Two findings, and both are true: the marker names nothing, and the figure it was supposed to
    // attribute is therefore unattributed in a benchmark section. Reporting one would leave the
    // other half of the defect in the document, and the two have different fixes.
    const claims = checkExternalClaimUnbacked(valueProof("external-claim:not-in-the-registry"), "docs/value-proof.md", registryOf(entry()))
    expect(rules(claims)).toEqual(["external-claim-unbacked", "external-claim-unbacked"])
    expect(details(claims)).toContain(EXTERNAL_CLAIMS_PATH)
    expect(details(claims)).toContain("not-in-the-registry")
  })

  test("a marker with no registry at all is reported rather than ignored", () => {
    // Fail closed: a repository that has deleted its registry has not been granted permission to
    // print unattributed figures, it has lost the authority every marker points at (AGENTS.md §3).
    const claims = checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", null)
    expect(rules(claims)).toEqual(["external-claim-unbacked"])
    expect(details(claims)).toContain("holds no entry")
  })

  for (const field of ["url", "retrievedOn", "scope", "statement", "source"]) {
    test(`an entry with no ${field} fails`, () => {
      const claims = checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", registryOf(entry({ [field]: "" })))
      expect(rules(claims)).toEqual(["external-claim-unbacked"])
      expect(details(claims)).toContain(`carries no ${field}`)
    })
  }

  test("a retrieval date that is not an ISO date fails, because an undated citation cannot be re-checked", () => {
    const claims = checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", registryOf(entry({ retrievedOn: "last autumn" })))
    expect(rules(claims)).toEqual(["external-claim-unbacked"])
    expect(details(claims)).toContain("not an ISO date")
  })

  test("an entry that claims ownership of the verdict fails, so the ADR-C2 boundary stays machine-readable", () => {
    const claims = checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", registryOf(entry({ ownsVerdict: true })))
    expect(rules(claims)).toEqual(["external-claim-unbacked"])
    expect(details(claims)).toContain("ownsVerdict")
  })

  test("an entry that omits ownsVerdict entirely fails as well - the field is required, not defaulted", () => {
    const claims = checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", registryOf(entry({ ownsVerdict: undefined })))
    expect(details(claims)).toContain("ownsVerdict: false")
  })

  test("an entry with no numeric figure fails, since it backs nothing", () => {
    const claims = checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", registryOf(entry({ figure: "60%" })))
    expect(rules(claims)).toEqual(["external-claim-unbacked"])
    expect(details(claims)).toContain("finite numeric figure")
  })
})

describe("R17 - a registry figure inside a benchmark section has to say whose it is", () => {
  test("the planted violation: the registry's figure, printed in the benchmark section, with no marker", () => {
    // This is the smuggling route. Rule ten's backing now includes the registry, so without the
    // marker "our detection rate is 60%" would pass every check in this repository.
    const claims = checkExternalClaimUnbacked(valueProof(""), "docs/value-proof.md", registryOf(entry()))
    expect(rules(claims)).toEqual(["external-claim-unbacked"])
    expect(details(claims)).toContain("carries no such marker")
    expect(details(claims)).toContain("in the section attributes nothing")
    expect(details(claims)).toContain("60")
  })

  test("the same section with the marker passes", () => {
    expect(details(checkExternalClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", registryOf(entry())))).toBe("")
  })

  test("a marker for a different entry does not attribute this figure", () => {
    const claims = checkExternalClaimUnbacked(valueProof("external-claim:some-other-study"), "docs/value-proof.md", registryOf(entry()))
    expect([...rules(claims)].sort()).toEqual(["external-claim-unbacked", "external-claim-unbacked"])
    expect(details(claims)).toContain("holds no entry")
    expect(details(claims)).toContain("carries no such marker")
  })

  test("outside a benchmark section the figure needs no marker, because it is not a benchmark claim", () => {
    const document = "## Why this exists\n\nPublished work reports a support gap above half (60% of queries).\n"
    expect(details(checkExternalClaimUnbacked(document, "docs/value-proof.md", registryOf(entry())))).toBe("")
  })

  test("in a document that promises its figures, the very same line needs the marker after all", () => {
    // The other half of the same finding. A fixture under a heading that matches nothing is what the
    // rule used to see, so the fixture passed — and the probe below uses the shipped file instead of
    // a fixture, because the review's evidence was that the *shipped* line was unreached.
    const document = "## Why this exists\n\nPublished work reports a support gap above half (60% of queries).\n"
    const claims = checkExternalClaimUnbacked(document, "docs/value-proof.md", registryOf(entry()), { backing: statementBacking(document, benchmark) })
    expect(rules(claims)).toContain("external-claim-unbacked")
    expect(details(claims)).toContain("anywhere in this document attributes nothing")
  })

  /**
   * The review's probe, and this rule's third and last version of the same hole.
   *
   * Scope had been widened to the whole body, and the widening was implemented as one run spanning
   * the document with the attribution read out of that run. So a registry figure was credited by a
   * marker *anywhere* in the file: appending `60% of the corpus text is Arabic.` to
   * `docs/value-proof.md` passed `check:docs` green, on the strength of a Tow Center citation eleven
   * lines above a sentence that fabricates an entirely different statistic. Arithmetic coincidence
   * dressed as a citation — the CWE-345 shape — and worse for being spelling-exact, because it reads
   * as a working rule.
   *
   * Each probe below is therefore the shipped document with one line inserted, so the borrowed digits
   * are the registry's own rather than a fixture's, and the fix is the one the ADR publishes: a
   * figure is credited by a marker on its own line. Scope says which lines are examined; credit says
   * which lines are attributed, and conflating them was the defect.
   */
  const REGISTRY_PROBES: readonly string[] = ["60% of the corpus text is Arabic.", "50% of sources are English translations.", "90% of the corpus text is Arabic."]

  for (const probe of REGISTRY_PROBES) {
    test(`a registry rendering borrowed from another line fails: ${probe}`, () => {
      const rows = readFileSync(join(ROOT, "docs", "value-proof.md"), "utf8").split("\n")
      // Inserted rather than appended: a line past the last one would sit outside the body the promise
      // covers for the wrong reason, and would prove nothing about the rule.
      const planted = [...rows.slice(0, -1), probe, rows[rows.length - 1] ?? ""].join("\n")
      const claims = checkExternalClaimUnbacked(planted, "docs/value-proof.md", registry, shippedPromise(planted))
      const findings = claims.filter((found) => found.rule === "external-claim-unbacked")
      expect(findings.length).toBeGreaterThan(0)
      expect(details(findings)).toContain(`line ${planted.split("\n").length - 1}`)
      expect(details(findings)).toContain("carries no such marker")
      // Exactly one finding, and exactly one owner. The promise half delegates every registry figure
      // to this half rather than reporting it twice, so a borrowed rendering is a single actionable
      // finding about a missing citation rather than two overlapping complaints.
      expect(claims).toHaveLength(1)
    })
  }

  test("the same figure, attributed on its own line, is admitted", () => {
    // The non-finding that makes the three above meaningful: the rule is about position, not about
    // the digits. `60%` on a line carrying its marker is the shape a document that means it writes.
    const cited = ["## Why this exists", "", "Published work puts the support gap above 60%.", "", "Source: `external-claim:citation-support-gap`.", ""].join("\n")
    expect(details(checkExternalClaimUnbacked(cited, "docs/value-proof.md", registryOf(entry()), shippedPromise(cited)))).toContain("carries no such marker")
    const sameLine = ["## Why this exists", "", "Published work puts the support gap above 60% (`external-claim:citation-support-gap`).", ""].join("\n")
    expect(details(checkExternalClaimUnbacked(sameLine, "docs/value-proof.md", registryOf(entry()), shippedPromise(sameLine)))).toBe("")
  })

  test("rule ten accepts a cited registry figure in its benchmark section - the two rules are one change", () => {
    const cited = checkBenchmarkClaimUnbacked(valueProof("external-claim:citation-support-gap"), "docs/value-proof.md", { path: "data/benchmark/vs-search.json", text: null }, externalClaimFigures(registryOf(entry())))
    expect(rules(cited)).toEqual([])
  })

  test("and rule ten still reports an uncited figure with no registry entry at all", () => {
    const uncited = checkBenchmarkClaimUnbacked(valueProof(""), "docs/value-proof.md", { path: "data/benchmark/vs-search.json", text: null })
    expect(rules(uncited)).toEqual(["benchmark-claim-unbacked"])
  })

  /**
   * The review's own probe, run against the shipped file rather than a fixture.
   *
   * Every other test in this block plants a violation in a document written for the test. This one
   * takes `docs/value-proof.md` as committed and deletes the marker on its line 47, because that was
   * the evidence: the markers in the file sit under a heading matching no `SECTION_TOPIC`, so
   * `benchmarkScope` reached neither and *deleting every marker in the document produced zero
   * findings*. A fixture cannot catch that regression — it is the shipped line's position that made
   * it invisible, and a fixture would have been placed wherever the rule already looked. So the
   * assertion is end-to-end on the artefact: the file as committed is clean, and the file with that
   * one marker removed names the line.
   */
  test("the shipped value proof's own market figure is uncitable once its marker is deleted", () => {
    const shipped = readFileSync(join(ROOT, "docs", "value-proof.md"), "utf8")
    expect(rules(checkExternalClaimUnbacked(shipped, "docs/value-proof.md", registry, shippedPromise(shipped)))).toEqual([])

    const rows = shipped.split("\n")
    const markerLine = rows.findIndex((row) => row.includes("external-claim:tow-miscited-share"))
    // Asserted rather than assumed: if the line moves, this test is stale and says so, which is
    // better than a fixture that keeps passing against a document nobody reads. The marker sits under
    // `## Why this exists rather than an answer`, a heading matching no `SECTION_TOPIC`, so rule ten's
    // scope is not what reaches it — the promise is.
    expect(markerLine).toBe(46)
    // The marker is on the figure's own line, which is the enforced rule rather than a courtesy: a
    // citation on the line below credits nothing, so a hard-wrapped figure must wrap with its marker.
    expect(rows[markerLine]).toContain("more than 60%")

    const mutilated = [...rows]
    mutilated[markerLine] = (rows[markerLine] ?? "").replace("external-claim:tow-miscited-share", "the source above")
    const text = mutilated.join("\n")
    const claims = checkExternalClaimUnbacked(text, "docs/value-proof.md", registry, shippedPromise(text))
    const findings = claims.filter((found) => found.rule === "external-claim-unbacked")
    expect(findings.length).toBeGreaterThan(0)
    // The finding names the line the *figure* is on — derived from the shipped rows rather than typed,
    // because the figure and its citation are one line by construction and hard-coding the number
    // would make this test a function of the document's wrapping rather than of the rule.
    expect(details(findings)).toContain(`line ${rows.findIndex((row) => row.includes("more than 60%")) + 1}`)
    expect(details(findings)).toContain("tow-miscited-share")
  })

  /**
   * The same probe on a figure whose marker is *present in the document*, which is the case the
   * document-wide credit could not see and the CR named as the hole.
   *
   * The shipped markers are all correctly placed, so no fixture of the shipped file would fail on
   * credit alone. This one does: the figure moves, the marker stays, and the two end up on different
   * lines — the exact shape of `60% of the corpus text is Arabic.` typed under a paragraph that
   * already cites the Tow Center eleven lines above.
   */
  test("a shipped figure separated from its own marker fails, so a real citation cannot be borrowed", () => {
    const rows = readFileSync(join(ROOT, "docs", "value-proof.md"), "utf8").split("\n")
    const markerLine = rows.findIndex((row) => row.includes("external-claim:tow-miscited-share"))
    const [figureRow, markerRow] = [rows[markerLine] ?? "", rows[markerLine + 1] ?? ""]
    const separated = [...rows]
    separated[markerLine] = figureRow.replace(/`external-claim:[a-z-]+`/, "")
    separated[markerLine + 1] = `${markerRow} 60% of the corpus text is Arabic.`

    const text = separated.join("\n")
    const findings = checkExternalClaimUnbacked(text, "docs/value-proof.md", registry, shippedPromise(text)).filter((found) => found.rule === "external-claim-unbacked")
    expect(details(findings)).toContain(`line ${markerLine + 2}`)
    expect(details(findings)).toContain("carries no such marker")
  })
})

/**
 * R17's promise half — the hole the review found and the amendment to ADR-C8.
 *
 * Rule ten is scoped by heading, so a percentage printed outside a benchmark-titled section was
 * policed by nothing, and `docs/value-proof.md`'s opening sentence ("every number printed below comes
 * from a file committed to this repository") could be false while the build stayed green. The probe
 * below is the review's own: `93%` and `88%` under a heading that matches nothing.
 *
 * The second review found the half was then satisfied too loosely: it accepted any percentage the
 * artefact had a number for, so `40%` (a case count) and `65%` (the baseline rate, about somebody
 * else) both passed. The suite below therefore builds its promise from the *shipped* artefact and the
 * *shipped* registry rather than from a hand-written set, so the backing rule itself is exercised and
 * not just the rule that reads it.
 */
describe("R17 - in the document that promises every figure is sourced, every percentage is", () => {
  /** A section heading that matches neither `benchmark` nor `system arm`, so rule ten cannot see it. */
  const comparison = (body: string): string => ["## How this compares", "", body, ""].join("\n")

  /**
   * The promise, built from the shipped artefact and registry by the same call `docs-check.ts` makes.
   *
   * There is no hand-written backing set here on purpose. The first version of this block had one, and
   * a hand-written set cannot express the rule that was wrong: it pooled every credited rendering
   * into one set, which is exactly the shape that let an unrelated percentage borrow a spelling. So
   * every fixture below is a real document and every promise is derived from the artefacts, and the
   * backing rule itself is under test alongside the rule that reads it.
   */
  const promised = (body: string): readonly DocsClaim[] => {
    const document = comparison(body)
    return checkExternalClaimUnbacked(document, "docs/value-proof.md", registry, shippedPromise(document))
  }

  test("the planted violation: an unsourced percentage above the benchmark section", () => {
    const claims = promised("The incumbent market leader misses 93% of its citations.")
    expect(rules(claims)).toEqual(["promise-figure-unbacked"])
    expect(details(claims)).toContain("93%")
    expect(details(claims)).toContain("line 3")
  })

  test("the second planted figure, because one probe is not a rule", () => {
    expect(rules(promised("It misses 88%."))).toEqual(["promise-figure-unbacked"])
  })

  test("an attributed rate passes anywhere in the document, which is the whole-body reach", () => {
    // The reach is the point of the promise half, and it survives the positional credit: rule ten
    // cannot see this heading, yet the claim is checked and admitted because the line names the field.
    expect(details(promised("`systemDetectionRate` is 100.0%, against a market rate we did not measure."))).toBe("")
  })

  test("a percentage a registry entry publishes passes, and is left to the marker rule", () => {
    // The more specific finding is the marker's, so only one is reported and it is not this one: a
    // document that printed `60%` here with no citation gets the "say whose it is" message, not a
    // second message about the same line.
    const unmarked = checkExternalClaimUnbacked(comparison("The gap is 60%."), "docs/value-proof.md", registryOf(entry()), shippedPromise(comparison("The gap is 60%.")))
    expect(rules(unmarked)).not.toContain("promise-figure-unbacked")
    const cited = comparison("The gap is 60% (external-claim:citation-support-gap).")
    expect(details(checkExternalClaimUnbacked(cited, "docs/value-proof.md", registryOf(entry()), shippedPromise(cited)))).toBe("")
  })

  test("both ends of a published range are printable, which is why the registry has two ids", () => {
    const bounds = registryOf(entry({ id: "gap-lower", figure: 50 }), entry({ id: "gap-upper", figure: 90 }))
    const document = comparison("Between 50% and 90% of responses are unsupported (external-claim:gap-lower, external-claim:gap-upper).")
    expect(details(checkExternalClaimUnbacked(document, "docs/value-proof.md", bounds, shippedPromise(document)))).toBe("")
  })

  test("the upper bound printed without its own entry fails, which is what the second id is for", () => {
    const oneBound = registryOf(entry({ id: "gap-lower", figure: 50 }))
    const document = comparison("Between 50% and 90% of responses are unsupported (external-claim:gap-lower).")
    const claims = checkExternalClaimUnbacked(document, "docs/value-proof.md", oneBound, shippedPromise(document))
    expect(rules(claims)).toEqual(["promise-figure-unbacked"])
    expect(details(claims)).toContain("90%")
  })

  test("the spelled-out form is a percentage too, so the rule has no one-keystroke hole", () => {
    expect(rules(promised("It misses 88 percent."))).toEqual(["promise-figure-unbacked"])
  })

  test("a percentage point delta is not a percentage", () => {
    // `+35.0 pp` is a difference between two published rates and is checked by rule ten's
    // attribution half. Reporting it here would be a false positive on the artefact's own table.
    expect(details(promised("The delta is +35.0 pp."))).toBe("")
  })

  test("a digit inside a word or a version is not a percentage", () => {
    expect(details(promised("Scored by bm25 and FTS5, corpus sha256abc, schema 1.2.3."))).toBe("")
  })

  test("a mixed line reports only the figure nobody vouches for", () => {
    const claims = promised("`systemDetectionRate` is 100.0% but the market rate is 88%.")
    expect(rules(claims)).toEqual(["promise-figure-unbacked"])
    expect(details(claims)).toContain("88%")
    expect(details(claims)).not.toContain("100.0%")
  })

  test("one finding per line however many times the figure is repeated, so the fix list is the file", () => {
    expect(promised("It misses 88%, and 88% again.")).toHaveLength(1)
  })

  test("without the promise the same document passes, because the scope is the document not the rule", () => {
    expect(details(checkExternalClaimUnbacked(comparison("It misses 88%."), "docs/value-proof.md", registryOf(entry())))).toBe("")
  })

test("a lost benchmark artefact tightens the promise rather than disabling it", () => {
    // The backing is built from the artefact, so an absent one means *fewer* things this
    // document may state — never more. A repository that deleted `vs-search.json` to print a
    // percentage is the fail-open direction and this is what refuses it (AGENTS.md §3).
    const document = comparison("`systemDetectionRate` is 100.0%.")
    const empty = { backing: statementBacking(document, { path: BENCHMARK_ARTEFACT, text: null }) }
    expect(rules(checkExternalClaimUnbacked(document, "docs/value-proof.md", registryOf(entry()), empty))).toEqual(["promise-figure-unbacked"])
  })

  test("exactly one audited document is held to the promise, and it is the one that makes it", () => {
    // The list is named rather than inferred, and a second document added to it would have to be a
    // document that asserts the promise. README's `41.7%` and INTEGRITY's `8%` are heterogeneous
    // figures from unrelated commits, and holding them to a promise they never made is how a rule
    // gets switched off.
    expect([...FIGURE_PROMISE_DOCUMENTS]).toEqual(["docs/value-proof.md"])
  })

  test("the planted figure is caught by the runner, not only by the pure function", () => {
    // The unit test above proves the rule; this proves the wiring. A `promise` argument that was never
    // passed from `runDocsClaimChecks` would leave the pure function correct and the build blind.
    const planted = tree({
      "attestation.json": JSON.stringify({ recordCount: 1, collectionCounts: { quran: 1 } }),
      "docs/value-proof.md": comparison("The incumbent market leader misses 93% of its citations."),
    })
    const claims = runDocsClaimChecks(planted).claims.filter((found) => found.rule === "promise-figure-unbacked")
    expect(claims.length).toBeGreaterThan(0)
    expect(details(claims)).toContain("93%")
  })
})

describe("the promise accepts a rate it can attribute, and refuses every other number", () => {
  /**
   * A section that cannot be reached by rule ten, carrying a figure this document may or may not
   * state. Built against the shipped artefact, so the backing under test is the shipped one.
   */
  const promised = (body: string): readonly DocsClaim[] => {
    const document = ["## How this compares", "", body, ""].join("\n")
    return checkExternalClaimUnbacked(document, "docs/value-proof.md", registry, shippedPromise(document))
  }

  test("the review's own probes: a count is not a percentage, whatever the artefact publishes", () => {
    // `caseCount`, `corpusRecordCount` and `schemaVersion` are 40, 27,234 and 2. All three are
    // figures this repository prints and percentages it must never publish, and all three passed
    // while the promise read the artefact's whole number space.
    for (const stated of ["40%", "27,234%", "2%"]) {
      expect(rules(promised(`It misses ${stated}.`))).toEqual(["promise-figure-unbacked"])
    }
  })

  test("a percentage-point difference is not a percentage either", () => {
    // `delta` is 0.35 and every document here prints it as `+35.0 pp`. Admitting its bare
    // renderings would make "the market misses 35%" pass on a measurement of ours.
    expect(rules(promised("It misses 35%."))).toEqual(["promise-figure-unbacked"])
    // Naming the difference does not make the percentage admissible either: attribution is what a
    // rate gets, and a difference named as a percentage is still a percentage nobody measured.
    expect(rules(promised("`delta` is 35%."))).toEqual(["promise-figure-unbacked"])
    expect(details(promised("`delta` is +35.0 pp."))).toBe("")
  })

  test("and the review's sharpest probe: a rate's own rendering passes nobody by accident", () => {
    // `65` is `baselineTop1HitRate`'s whole-number rendering, so an un-attributed `65%` is the
    // unsourced market claim ADR-C8 exists to refuse, admitted by arithmetic coincidence.
    expect(rules(promised("The incumbent misses 65% of its citations."))).toEqual(["promise-figure-unbacked"])
  })

  test("the same rate, attributed by name, is ours to print", () => {
    // The non-finding that makes the three above meaningful: attribution is the difference, not the
    // number. This is the shape a document that means it should write.
    expect(details(promised("`baselineTop1HitRate` is 65%, against a detection rate we did not measure here."))).toBe("")
  })

  test("a table row that names the field credits the rendering it prints, in whole or decimal", () => {
    const row = (figure: string): readonly DocsClaim[] => {
      const document = ["## How this compares", "", "| Artefact field | Figure |", "| --- | --- |", `| \`baselineTop1HitRate\` | ${figure} |`, ""].join("\n")
      return checkExternalClaimUnbacked(document, "docs/value-proof.md", registry, shippedPromise(document))
    }
    expect(row("65.0%")).toEqual([])
    expect(row("65%")).toEqual([])
  })

  test("a row that credits one rendering does not credit its neighbours", () => {
    // The reason the backing is per rendering. Crediting the whole rate instead would admit every
    // spelling of a number we happen to have measured, which is the hole the review reported.
    const row = ["| Artefact field | Figure |", "| --- | --- |", "| `baselineTop1HitRate` | 65.0% |", ""].join("\n")
    const document = ["## How this compares", "", row, "The incumbent misses 65% of its citations.", ""].join("\n")
    expect(details(checkExternalClaimUnbacked(document, "docs/value-proof.md", registry, shippedPromise(document)))).toContain("65%")
  })

  test("every percentage the shipped value proof states is credited on its own line", () => {
    // Read from the artefact and the document rather than asserted: this walks the same backing the
    // build uses and asks what it admits, so a figure added to the document without an attribution
    // on its own line shows up here as a difference rather than as a build failure somebody else has
    // to diagnose. Keyed by line — which is the whole of the correction.
    const rows = readFileSync(join(ROOT, "docs", "value-proof.md"), "utf8").split("\n")
    const { byLine } = statementBacking(rows.join("\n"), benchmark)
    /** The line that attributes a rate, read from the document so a moved table cannot stale this. */
    const rowOf = (field: string): number => rows.findIndex((row) => row.includes(`\`${field}\``)) + 1
    // Every `100.0` the document credits is credited on a line that names the rate it belongs to, so
    // the credit is a property of a claim rather than a property of a spelling. Three lines qualify:
    // the two `100.0%` table rows (`systemDetectionRate`, `systemAgreementRate`) and the sentence in
    // the legend that names `systemDetectionRate` and prints its figure with it.
    const credited = [...byLine.entries()].filter(([, credited]) => credited.has("100.0")).map(([line]) => line)
    expect(credited.length).toBe(3)
    for (const line of credited) expect(rows[line - 1]).toContain("system")
    expect(credited).toContain(rowOf("systemDetectionRate"))
    expect(credited).toContain(rowOf("systemAgreementRate"))
    // The legend's sentence is the case that shows the whole-body reach is real: it is prose, not a
    // table row, and it is still credited because the field name is on the line with the figure.
    expect(credited).toContain(rows.findIndex((row) => row.includes("**self-authored**")) + 1)
    expect(byLine.get(rowOf("systemAbstentionRate"))?.has("0.0")).toBe(true)
    expect(byLine.get(rowOf("baselineTop1HitRate"))?.has("65.0")).toBe(true)
    // And the strictest case the artefact can produce: two rates, one line each, no overlap. If the
    // backing were still pooled, `systemDetectionRate` would vouch for `0.0` and this would pass while
    // being wrong — the assertion has to be that it does *not*.
    expect(byLine.get(rowOf("systemDetectionRate"))?.has("0.0")).toBe(false)
    expect(byLine.get(rowOf("systemAbstentionRate"))?.has("65.0")).toBe(false)
    // The review's borrowing spellings are credited nowhere: a count, a version and the baseline's
    // whole-number form are not rates, and a document that prints them as percentages is inventing.
    for (const stated of ["40", "27,234", "2", "65"]) {
      expect([...byLine.values()].flatMap((credited) => [...credited]).includes(stated)).toBe(false)
    }
  })

  /**
   * The review's own probe, and the third version of this hole.
   *
   * The credit was collected into one document-wide set, so it carried no position: a rendering the
   * document attributed *somewhere* vouched for the same digits *everywhere*. Each of these three
   * sentences was appended to the shipped `docs/value-proof.md` during review and every one of them
   * passed with `check:docs` green, because the benchmark table prints `100.0%` and `0.0%` — the
   * borrow was spelling-exact, which is worse than an open hole because it reads as a working rule.
   * Each assertion is therefore the shipped document with the probe line inserted, so the borrowed
   * spellings are the repository's own rather than a fixture's, and the line number is derived from
   * the planted text rather than typed.
   */
  const PROBES: readonly string[] = [
    "100.0% of the corpus text is Arabic.",
    "0.0% of sources are English translations.",
    "100.0 percent of sources are translations.",
  ]

  for (const probe of PROBES) {
    test(`a rendering borrowed from another line fails: ${probe}`, () => {
      const rows = readFileSync(join(ROOT, "docs", "value-proof.md"), "utf8").split("\n")
      // Inserted rather than appended: a line past the last one would sit outside the body the promise
      // covers for the wrong reason, and would prove nothing about the rule.
      const planted = [...rows.slice(0, -1), probe, rows[rows.length - 1] ?? ""].join("\n")
      const findings = checkExternalClaimUnbacked(planted, "docs/value-proof.md", registry, shippedPromise(planted)).filter((found) => found.rule === "promise-figure-unbacked")
      expect(findings.length).toBeGreaterThan(0)
      expect(details(findings)).toContain(`line ${planted.split("\n").length - 1}`)
      expect(details(findings)).toContain(probe.split(" ")[0] ?? probe)
    })
  }

  test("a claim hard-wrapped across lines must keep the field name with its figure, which is the stated limit", () => {
    // Per line rather than per paragraph is the deliberate trade, and this is what it costs. Closing
    // it with a window would have introduced a second, unverifiable notion of "near", so the limit is
    // written down instead — here, and in ADR-C8, and in `docs/value-proof.md` itself.
    expect(rules(promised("`systemDetectionRate`\nwas 100.0%."))).toEqual(["promise-figure-unbacked"])
  })
})

describe("the repository's own registry is complete, and every marker in the tree resolves", () => {
  test("every shipped entry carries the full citation", () => {
    expect(rules(runDocsClaimChecks(ROOT).claims.filter((found) => found.rule === "external-claim-unbacked"))).toEqual([])
  })

  test("every shipped id is digit-free, so a marker never reads as a stated figure", () => {
    // Found by this suite. A document writes the marker into prose inside a benchmark section, and
    // rule ten counts every digit sequence there as a claim — so an id ending in a year made the
    // marker itself the unbacked figure, and the finding named a number nobody had typed.
    for (const figure of externalClaimFigures(registry)) expect(figure.id).toMatch(/^[a-z][a-z0-9._-]*$/)
  })

  test("the registry publishes at least two independently sourced figures, or it is decoration", () => {
    const sources = externalClaimFigures(registry).map((entry) => entry.id)
    expect(sources.length).toBeGreaterThanOrEqual(2)
    expect(new Set(sources).size).toBe(sources.length)
  })

  test("every shipped figure is attributed, and every shipped entry is cited somewhere", () => {
    // Both directions. A registry entry nothing prints is a citation no judge will read, and a
    // printed figure no entry publishes is exactly the claim this rule exists to prevent.
    const shipped = runDocsClaimChecks(ROOT)
    expect(details(shipped.claims)).not.toContain("external-claim-unbacked")
    expect(externalClaimFigures(registry).length).toBeGreaterThan(0)
  })

  test("no shipped entry claims a verdict of ours", () => {
    const parsed = registry as { readonly claims: readonly { readonly ownsVerdict: unknown }[] }
    for (const entry of parsed.claims) expect(entry.ownsVerdict).toBe(false)
  })

  test("a registry URL is a string in a committed file, never a fetch target", () => {
    // A10: nothing in the build may reach the network on a document's account. The registry is
    // swept by G-4 like any other committed JSON, and no rule in this package opens a URL.
    const parsed = registry as { readonly claims: readonly { readonly url: unknown }[] }
    for (const entry of parsed.claims) expect(typeof entry.url).toBe("string")
  })
})