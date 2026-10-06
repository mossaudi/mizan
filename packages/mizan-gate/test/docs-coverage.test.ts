import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  COVERAGE_SET,
  checkCollectionCoverage,
  checkCoverageTableRows,
  checkMeasuredSetDigest,
  checkPresenceCollectionNamed,
  checkPresenceCoverageRecorded,
  collectionCountsOf,
FABRICATION_COVERAGE_FLOOR,
  PROSE_COLUMNS,
  statesPresenceFigure,
  statedNumerator,
  type CoverageArtefact,
} from "@mizan/gate"
import { EvalSet, decodeOrFail, decodeSync, digestOf, isOk } from "@mizan/core"
import type { DocsClaim } from "@mizan/gate"

/** The repository root, for the two tests that read a committed file rather than a fixture. */
const ROOT = join(import.meta.dir, "..", "..", "..")
const readIfPresent = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return null
  }
}

/**
 * ADR-15's rule, with the violation planted.
 *
 * ## What the planted case is
 *
 * The set below carries forty cases across `abudawud`, `ibnmajah` and `malik` — a faithful
 * transcription of the committed red-team set before this rule existed. Every other property of it is
 * correct: it decodes as an `EvalSet`, its cases are real fabrications, its totals are right. It is
 * *passing every check that existed*, and a third of the served corpus had never been asked to be
 * falsified. That is the whole point of planting exactly this fixture: the defect is invisible to
 * every property except per-collection coverage, so the test has to plant a set that is otherwise
 * entirely well-formed or it proves nothing.
 */

const rules = (claims: readonly DocsClaim[]): readonly string[] => claims.map((entry) => entry.rule)
const details = (claims: readonly DocsClaim[]): string => claims.map((entry) => entry.detail).join("\n")

/** One decodable case. Only `citation.collection` is load-bearing for this rule. */
const case_ = (id: string, collection: string) => ({
  id,
  classId: "letter_transposed",
  mutation: "letter_transposed",
  note: "Two adjacent letters swapped.",
  quote: `${id} quote`,
  citation: { collection, number: "1", grade: null, raw: `${collection}:1` },
  expectedVerdict: "rejected",
  expectedReason: "quote_absent_at_cited_id",
  expectedRationale: "A different string under containment.",
  anchorId: `${collection}-1`,
})

/** A decodable `EvalSet` whose cases are spread over the named collections, in that round-robin. */
const setWith = (perCollection: Readonly<Record<string, number>>): string => {
  const cases: unknown[] = []
  let index = 0
  const names = Object.keys(perCollection)
  const depth = Math.max(0, ...names.map((name) => perCollection[name] ?? 0))
  for (let round = 0; round < depth; round += 1) {
    for (const name of names) {
      if ((perCollection[name] ?? 0) <= round) continue
      index += 1
      cases.push(case_(`redteam-${String(index).padStart(3, "0")}`, name))
    }
  }
  // `schemaVersion` 3 makes `datasetDigest` and `coverageRows` required, so a v2-shaped fixture no
  // longer decodes and every test here would be measuring a decode failure instead of the rule. The
  // digest is COMPUTED rather than pasted: a fixture carrying a hand-written `ds1:...` string would
  // pass the schema while asserting an identity that is not its own, which is the same
  // self-certifying shape the "lying coverage row" test below exists to catch. `coverageRows` is
  // derived from the same counts the cases carry, so a fixture cannot disagree with itself.
  const set: Record<string, unknown> = {
    schemaVersion: 3,
    set: "redteam",
    title: "Red-team fabrications",
    purpose: "Fabrications the containment check must reject.",
    generatedBy: "bun run build:eval",
    regenerateWith: "bun run build:eval",
    determinism: "Deterministic: same corpus, byte-identical output.",
    expectationSource: "Hand-adjudicated from the fold table, never observed from the verifier.",
    coverageRows: names
      .filter((name) => (perCollection[name] ?? 0) > 0)
      .sort()
      .map((name) => ({ collection: name, caseCount: perCollection[name] ?? 0, anchorCount: 1 })),
    digitFacts: { asciiDigitOccurrences: 19 },
    classCounts: { letter_transposed: index },
    verdictCounts: { rejected: index },
    anchorCount: names.length,
    licenceNotice: "Quotes are short extracts for verification purposes.",
    anchors: [],
    cases,
  }
  const digest = digestOf(set)
  if (!isOk(digest)) throw new Error(`fixture digest could not be computed: ${digest.error.detail}`)
  return JSON.stringify({ ...set, datasetDigest: digest.value })
}

/** The six collections `attestation.json` serves, as the committed file names them. */
const SERVED = new Set(["abudawud", "ibnmajah", "malik", "nasai", "quran", "tirmidhi"])

/** What the committed set looked like when this rule was written, and the defect it hid. */
const THREE_COLLECTIONS = setWith({ abudawud: 22, ibnmajah: 16, malik: 2 })

/** The same total, spread over all six — which is the fix, not a bigger set. */
const SIX_COLLECTIONS = setWith({ abudawud: 7, ibnmajah: 7, malik: 7, nasai: 7, quran: 6, tirmidhi: 6 })

const decode = (text: string): EvalSet => {
  const decoded = decodeOrFail(decodeSync(EvalSet), JSON.parse(text) as unknown, COVERAGE_SET)
  if (!isOk(decoded)) throw new Error(`fixture does not decode: ${decoded.error.detail}`)
  return decoded.value
}

describe("ADR-15 — per-collection coverage of the fabrication set", () => {
  test("the planted violation fails: three collections cannot cover six served ones", () => {
    const claims = checkCollectionCoverage(SERVED, true, THREE_COLLECTIONS)
    expect(rules(claims)).toEqual(["eval-coverage-below-floor"])
    // The message must name the absent collections and their counts, because "coverage is
    // insufficient" sends the next engineer to the rule instead of to the missing books.
    const text = details(claims)
    expect(text).toContain("nasai 0")
    expect(text).toContain("quran 0")
    expect(text).toContain("tirmidhi 0")
    expect(text).toContain(`floor of ${FABRICATION_COVERAGE_FLOOR}`)
  })

  test("the same total spread over all six passes", () => {
    expect(checkCollectionCoverage(SERVED, true, SIX_COLLECTIONS)).toEqual([])
  })

  test("the count is the floor, not a total, so a small set is not exempt", () => {
    // Three collections over six is a total of 40 and a per-collection minimum of 0. Only the
    // second number decides, which is the entire difference between this rule and checking a total.
    const claims = checkCollectionCoverage(SERVED, true, THREE_COLLECTIONS)
    expect(details(claims)).not.toContain("40")
  })

  test("one case in a collection is still short of the floor", () => {
    const claims = checkCollectionCoverage(SERVED, true, setWith({ abudawud: 2, ibnmajah: 2, malik: 2, nasai: 2, quran: 2, tirmidhi: 1 }))
    expect(rules(claims)).toEqual(["eval-coverage-below-floor"])
    expect(details(claims)).toContain("tirmidhi 1")
  })

  test("an unserved collection is a finding, because its cases cannot have been resolved against anything", () => {
    // The direction that had no rule at all. Above floor answers "is every served book asked about";
    // this asks "is every book the set asks about one this corpus serves". A case naming a collection
    // the attestation does not list was never validated against a served record, so a coverage rate
    // over it measures nothing — and reporting it as *zero* cases, which a served-only sweep does
    // naturally, would publish a number about nothing as if it were evidence.
    const claims = checkCollectionCoverage(new Set(["abudawud"]), true, setWith({ abudawud: 2, tirmidhi: 2 }))
    expect(rules(claims)).toEqual(["eval-coverage-unserved-collection"])
    expect(details(claims)).toContain("tirmidhi")
    expect(details(claims)).toContain("measures nothing")
  })

  test("the unserved finding does not hide the below-floor finding, because a set can be wrong both ways", () => {
    // `malik` is unserved here and `tirmidhi` is a served collection nobody asked about. One finding
    // per defect is the rule; returning at the first would leave the second invisible until the first
    // was fixed, which is one bug per run through a gate that already knows the set is wrong.
    const claims = checkCollectionCoverage(new Set(["abudawud", "tirmidhi"]), true, setWith({ abudawud: 2, malik: 2 }))
    expect(rules(claims)).toEqual(["eval-coverage-unserved-collection", "eval-coverage-below-floor"])
    expect(details(claims)).toContain("malik")
    expect(details(claims)).toContain("tirmidhi 0")
  })

  test("an unserved collection is not a defect", () => {
    // The floor is per SERVED collection. A set that also carries a collection the attestation does
    // not serve is over-covering, and reporting that would make the rule push for more corpus.
    const claims = checkCollectionCoverage(new Set(["abudawud"]), true, setWith({ abudawud: 2 }))
    expect(claims).toEqual([])
  })
})

describe("ADR-15 — absent is not zero", () => {
  test("no set at all is skipped: nothing is being claimed", () => {
    expect(checkCollectionCoverage(SERVED, true, null)).toEqual([])
  })

  test("an unreadable attestation is a finding, because the claim could not be checked", () => {
    const claims = checkCollectionCoverage(SERVED, false, SIX_COLLECTIONS)
    expect(rules(claims)).toEqual(["eval-coverage-unmeasured"])
    expect(details(claims)).toContain("unmeasured, not satisfied")
  })

  test("an attestation naming no collection is a finding too, so the rule cannot be silenced", () => {
    // The fail-open edge. Deleting `collectionCounts` from a PRESENT attestation is what
    // `servedCollections` reports as `{served: empty, usable: false}` — a corpus was claimed and
    // cannot be enumerated — so it fails closed here.
    expect(rules(checkCollectionCoverage(new Set(), false, SIX_COLLECTIONS))).toEqual(["eval-coverage-unmeasured"])
  })

  test("an ABSENT attestation is skipped, so a fork shipping no corpus is not failed", () => {
    // The distinction the previous test would have collapsed. `servedCollections` returns
    // `{served: empty, usable: true}` only when no attestation file exists, which claims no corpus
    // and therefore makes no coverage claim — the same line R18 and `checkSnapshotArithmetic` draw.
    expect(checkCollectionCoverage(new Set(), true, THREE_COLLECTIONS)).toEqual([])
  })

  test("a set that will not decode is unmeasured, never zero cases", () => {
    const claims = checkCollectionCoverage(SERVED, true, "{ not json")
    expect(rules(claims)).toEqual(["eval-artefact-unreadable"])
    expect(details(claims)).toContain("unmeasured rather than zero")
  })

  test("a set with an empty cases array is unreadable, because a published zero is a claim", () => {
    const empty = setWith({})
    expect(rules(checkCollectionCoverage(SERVED, true, empty))).toEqual(["eval-artefact-unreadable"])
  })
})

describe("ADR-15 — the counts come from the cases, not from the set's own account", () => {
  test("a set publishing a coverage row is still counted from its cases", () => {
    // `schemaVersion` 3 lets a set publish `coverageRows`. If the rule read that field, editing one
    // number would silence the rule — the same self-certifying shape as a document grading its own
    // homework. So this plants a set that publishes a claim of full coverage while carrying only
    // three collections, and the rule must still report it short.
    //
// The digest is recomputed after the edit, deliberately. Leaving it stale would make the fixture
    // fail to decode, and the test would then be measuring the digest contract rather than the
    // coverage rule - which means the row would never reach the code path that is supposed to ignore
    // it. A self-consistent set that lies about its coverage is the harder case, and the only one
    // that proves anything.
    //
    // The lie is planted on THREE_COLLECTIONS, not on SIX_COLLECTIONS. Built on the six, the published
    // row agreed with the cases by accident and the second assertion would have passed whether or not
    // anything read `coverageRows` at all - the fixture would have been testing the absence of a rule.
    // Built on the three, the set claims nine nasai cases while carrying none, and the rule must still
    // report it short.
    const published = JSON.parse(THREE_COLLECTIONS) as Record<string, unknown>
    const { datasetDigest: _stale, ...material } = published
    const lying = { ...material, coverageRows: [{ collection: "nasai", caseCount: 9, anchorCount: 9 }] }
    const digest = digestOf(lying)
    if (!isOk(digest)) throw new Error(`fixture digest could not be computed: ${digest.error.detail}`)
    const claims = checkCollectionCoverage(SERVED, true, THREE_COLLECTIONS)
    expect(rules(claims)).toEqual(["eval-coverage-below-floor"])
    // And the fabricated row changes nothing, because nothing reads it.
    const withLies = checkCollectionCoverage(SERVED, true, JSON.stringify({ ...lying, datasetDigest: digest.value }))
    expect(rules(withLies)).toEqual(["eval-coverage-below-floor"])
    expect(details(withLies)).toContain("nasai 0")
  })

  test("counts are keyed by the citation's collection, not the anchor's", () => {
    // A `collection_ambiguous` case cites no collection and an `unresolved_identifier` case cites a
    // number its collection does not have. Counting the anchor would answer "which records were
    // quoted" while the question here is "which book was falsified".
    const counted = collectionCountsOf(decode(SIX_COLLECTIONS))
    expect([...counted.keys()].sort()).toEqual([...SERVED].sort())
    expect(counted.get("quran")).toBe(6)
  })

  test("a collection name that is not a corpus identifier is not counted as one", () => {
    // Names arrive from an ingest source, so they are untrusted (AGENTS.md section 1). A name with a
    // space cannot be the one attestation serves, and counting it would let a typo satisfy the floor.
    const counts = collectionCountsOf(decode(setWith({ abudawud: 2, "Not A Collection": 2 })))
    expect([...counts.keys()]).toEqual(["abudawud"])
  })

  test("a collection named like an Object property is an ordinary key, not a prototype lookup", () => {
    // `constructor` is lowercase, so it passes the identifier check and reaches the counter. With a
    // plain `{ }` accumulator, `counts["constructor"]` would read `Object.prototype.constructor` and
    // report a function where a number belongs — a count that is neither zero nor right.
    const counts = collectionCountsOf(decode(setWith({ constructor: 2, valueof: 2 })))
    expect(counts.get("constructor")).toBe(2)
    expect(counts.get("valueof")).toBe(2)
    expect(counts.get("__proto__")).toBeUndefined()
    expect(counts.get("hasOwnProperty")).toBeUndefined()
  })

  test("a collection name outside the corpus vocabulary is not counted at all", () => {
    // Case and punctuation are refused rather than normalised, so a typo cannot satisfy a floor.
    const counts = collectionCountsOf(decode(setWith({ abudawud: 2, Tirmidhi: 2, "ibn majah": 2 })))
    expect([...counts.keys()]).toEqual(["abudawud"])
  })

  test("the floor is 2, which the interleaver guarantees by construction", () => {
    // One case from each of the two pool-free mutation classes, per served collection. Stating the
    // number here and in `docs-coverage.ts` means the test would fail if either side moved alone.
    expect(FABRICATION_COVERAGE_FLOOR).toBe(2)
  })
})
describe("R21b - a presence figure names the set it is over", () => {
  const artefact = (fields: Readonly<Record<string, unknown>>): CoverageArtefact => ({
    path: "data/benchmark/vs-search.json",
    text: JSON.stringify(fields),
  })

  /** The shape `--record` publishes for the committed run: six collections, 40 cases in total. */
  const RECORDED = artefact({
    suggestionCaseCount: 40,
    suggestionCoverageCollections: "abudawud,ibnmajah,malik,nasai,quran,tirmidhi",
    suggestionCoverageCasesAbudawud: 15,
    suggestionCoverageCasesIbnmajah: 13,
    suggestionCoverageCasesMalik: 5,
    suggestionCoverageCasesNasai: 3,
    suggestionCoverageCasesQuran: 2,
    suggestionCoverageCasesTirmidhi: 2,
  })

  const check = (document: string, artefactText: CoverageArtefact = RECORDED) =>
    checkPresenceCollectionNamed(document, "docs/value-proof.md", artefactText)

  test("the planted violation fails: 40 of 40 with no collection named reads as corpus-wide", () => {
    // The exact sentence this repository shipped. It is not a wrong number - the case set does hold 40
    // cases and does find all 40 - and it is the over-claim the rule exists for, because a reader has no
    // way to tell 40 fabrications from 27,234 records.
    const claims = check("Top-5 presence is 40 of 40 over the served corpus.")
    expect(rules(claims)).toEqual(["presence-claim-unbacked"])
    const text = details(claims)
    expect(text).toContain("40 of 40")
    expect(text).toContain("corpus-wide")
    expect(text).toContain("6 of the 6 recorded collections")
  })

  test("naming one collection beside an aggregate is still corpus-wide, and fails", () => {
    // The tempting half-fix. `quran` 15 cases is false and `40 of 40` is over six books, so the sentence
    // attributes a corpus-wide rate to one of the six while looking specific.
    expect(rules(check("Recall is 40 of 40 at top-5 presence across quran."))).toEqual(["presence-claim-unbacked"])
  })

  test("the aggregate passes once every recorded collection is named on the line", () => {
    const claims = check("Recall is 40 of 40 at top-5 presence over abudawud, ibnmajah, malik, nasai, quran and tirmidhi.")
    expect(claims).toEqual([])
  })

  test("a per-collection figure must name the collection that owns the denominator", () => {
    // `2` belongs to quran and tirmidhi. Either name is honest; no name is not.
    expect(check("Presence at top-5 is 2 of 2 in quran.")).toEqual([])
    expect(check("Presence at top-5 is 2 of 2 in tirmidhi.")).toEqual([])
    const unnamed = check("Presence at top-5 is 2 of 2 in the set.")
    expect(rules(unnamed)).toEqual(["presence-claim-unbacked"])
    expect(details(unnamed)).toContain("quran and tirmidhi")
  })

  test("a per-collection figure cannot borrow another collection's denominator", () => {
    // 15 is abudawud's count. Naming tirmidhi is false, so the rule must not be satisfied by "some
    // recorded collection appeared on this line".
    const claims = check("Presence at top-1 is 15 of 15 in tirmidhi.")
    expect(rules(claims)).toEqual(["presence-claim-unbacked"])
    expect(details(claims)).toContain("abudawud")
  })

  test("a denominator no committed set has is a finding, and the message lists what does exist", () => {
    // The mechanical form of the story's edge case: three cases cannot carry a percentage sentence, and
    // a denominator the corpus does not have is how that arrives as prose. 7 is neither the total nor any
    // collection's count, so the rule has nothing to attribute it to and says which counts do exist.
    const claims = check("Presence at top-5 is 4 of 7 across the measured books.")
    expect(rules(claims)).toEqual(["presence-claim-unbacked"])
    expect(details(claims)).toContain("no committed case set has")
    expect(details(claims)).toContain("15, 13, 5, 3, 2, 2")
    expect(details(claims)).toContain("a total of 40")
  })

  test("the NUMERATOR is not this rule's business, so a correct aggregate figure passes", () => {
    // 39 of 40 is a quantity question and rule ten owns it. This rule asks which SET the denominator is
    // over, and an aggregate figure that names every recorded collection is fully attributed whatever its
    // numerator says. Asserting the division of labour, because the tempting "fix" is to check the
    // numerator here as well — a second arithmetic that would double-report rule ten's findings and
    // train its readers to skip both.
    expect(check("Recall is 39 of 40 at top-5 presence over abudawud, ibnmajah, malik, nasai, quran and tirmidhi.")).toEqual([])
    expect(check("Recall is 12 of 40 at top-5 presence over abudawud, ibnmajah, malik, nasai, quran and tirmidhi.")).toEqual([])
  })

  test("a sentence with no presence or recall word is not this rule's business", () => {
    // Rule ten already judges every figure in the document by quantity, so a second rule that fired on
    // every fraction would double-report the same sentence and train its readers to skip it.
    expect(check("The corpus holds 27234 records and 38 anchors.")).toEqual([])
  })

  test("a line with a fraction and no measurement word is left to the rules that own it", () => {
    expect(check("The tolerance is 1.5x, so a rerun may differ by up to 3 of 4 runs.")).toEqual([])
  })
})

describe("R21b - the artefact half, asked once rather than once per document", () => {
  const artefact = (text: string | null): CoverageArtefact => ({ path: "data/benchmark/vs-search.json", text })

  /** The one document that claims something, so the rule has a premise to be right about. */
  const CLAIMING = [{ document: "docs/specs/measurements.md", text: "Recall is 40 of 40 at top-5 presence." }]
  /** A tree whose documents state no presence figure at all. */
  const SILENT = [{ document: "README.md", text: "The corpus holds 27234 records and the verifier contains every quote." }]

  test("an artefact recording no coverage is one finding, naming the documents that state figures", () => {
    // The first version of this rule returned this finding from inside the per-document rule, which made
    // a stale artefact produce ten identical findings naming ten innocent documents. The gate reported
    // the cause once, against the file that has it, and said what to run.
    const claims = checkPresenceCoverageRecorded(artefact(JSON.stringify({ suggestionCaseCount: 40 })), CLAIMING)
    expect(rules(claims)).toEqual(["presence-coverage-unrecorded"])
    expect(details(claims)).toContain("data/benchmark/vs-search.json")
    expect(details(claims)).toContain("docs/specs/measurements.md")
    expect(details(claims)).toContain("bun run eval:suggestions --record")
  })

  test("an ABSENT artefact is a finding when a document claims a figure: the claim cannot be supported", () => {
    // The opposite of `checkCollectionCoverage`'s absent-attestation skip, and deliberately so. A fork
    // shipping no corpus has claimed no corpus; a fork shipping a document that says "40 of 40 over the
    // served corpus" has made a claim nothing can support, and AGENTS.md section 16's row for this is
    // `unverifiable`, never `verified`.
    expect(rules(checkPresenceCoverageRecorded(artefact(null), CLAIMING))).toEqual(["presence-coverage-unrecorded"])
  })

  test("a malformed artefact is a finding, never an empty coverage list", () => {
    for (const text of ["{ not json", "[]", JSON.stringify({ suggestionCoverageCollections: "" })]) {
      expect(rules(checkPresenceCoverageRecorded(artefact(text), CLAIMING))).toEqual(["presence-coverage-unrecorded"])
    }
  })

  test("no document stating a figure means nothing to attribute, and the rule says nothing", () => {
    // The failure the fixture trees caught. The rule's first version asserted its own premise — "the
    // audited documents state presence and recall figures" — without reading them, so a tree whose
    // documents claimed nothing was told it had an unattributable figure. Demanding attribution for a
    // claim nobody made is the same defect as inventing one.
    expect(checkPresenceCoverageRecorded(artefact(null), SILENT)).toEqual([])
    expect(checkPresenceCoverageRecorded(artefact(null), [])).toEqual([])
  })

  test("a fraction without a presence or recall word is not a presence figure", () => {
    // The shape that made the fixture fail: `27234 records` and `2 of 3 collections` are quantities, and
    // rule ten owns them. Requiring attribution for them would report a missing measurement of something
    // the repository never claimed to have measured.
    const unrelated = [{ document: "docs/value-proof.md", text: "The set is drawn from 2 of 3 collections over 27234 records." }]
    expect(checkPresenceCoverageRecorded(artefact(null), unrelated)).toEqual([])
  })

  test("a recorded artefact produces no finding, and the document rule can then answer", () => {
    const recorded = artefact(JSON.stringify({ suggestionCoverageCollections: "quran", suggestionCaseCount: 2, suggestionCoverageCasesQuran: 2 }))
    expect(checkPresenceCoverageRecorded(recorded, CLAIMING)).toEqual([])
    expect(checkPresenceCollectionNamed("Recall is 2 of 2 in quran.", "docs/value-proof.md", recorded)).toEqual([])
  })

  test("the document rule skips rather than repeats, because the artefact rule already reported the cause", () => {
    const missing = artefact(null)
    expect(checkPresenceCollectionNamed("Top-5 presence is 40 of 40 over the served corpus.", "README.md", missing)).toEqual([])
  })

  test("the artefact and document halves share one definition of a presence figure", () => {
    // One predicate, two callers. If these disagreed, the artefact half could demand attribution for a
    // sentence the document half never judged.
    expect(statesPresenceFigure("Recall is 40 of 40 at top-5 presence.")).toBe(true)
    expect(statesPresenceFigure("The set is drawn from 2 of 3 collections.")).toBe(false)
    expect(statesPresenceFigure("")).toBe(false)
  })
})

/**
 * A fabricated case is one the gate must reject, and nothing in the schema enforced that.
 *
 * The `rejected` column of the per-collection table is *derived* from each case's `expectedVerdict`
 * rather than retyped, which is what makes it a measurement instead of a constant — and derivation
 * means a set that expected `verified` would be judging itself. The fixture below is a set that
 * decodes cleanly, meets the per-collection floor across all six collections, and carries one case the
 * procedure is supposed to *confirm*. It is the harder violation than an undecodable file, and the only
 * one that proves anything.
 */
describe("ADR-15 - a set of fabrications must declare every case rejected", () => {
  /** The six-collection set, with one case's expectation quietly changed to `verified`. */
  const ONE_VERIFIED = (): string => {
    const set = JSON.parse(SIX_COLLECTIONS) as { readonly cases: readonly Record<string, unknown>[] }
    const { datasetDigest: _stale, ...material } = set as unknown as Record<string, unknown>
    const cases = set.cases.map((entry, index) => (index === 0 ? { ...entry, expectedVerdict: "verified" } : entry))
    const lying: Record<string, unknown> = {
      ...material,
      cases,
      verdictCounts: { ...(material.verdictCounts as Record<string, number>), rejected: 41 },
    }
    const digest = digestOf(lying)
    if (!isOk(digest)) throw new Error(`fixture digest could not be computed: ${digest.error.detail}`)
    return JSON.stringify({ ...lying, datasetDigest: digest.value })
  }

  test("the planted violation fails, and it fails even though the coverage floor is met", () => {
    // The fixture is otherwise perfect on purpose. A rule that only fired on a broken file would pass
    // this test by not existing.
    const claims = checkCollectionCoverage(SERVED, true, ONE_VERIFIED())
    expect(rules(claims)).toEqual(["eval-fabrication-not-rejected"])
    expect(details(claims)).toContain("redteam-001")
    expect(details(claims)).toContain("cannot measure containment")
  })

  test("the message names ids and never a quote, because a log line here carries no corpus text", () => {
    const text = details(checkCollectionCoverage(SERVED, true, ONE_VERIFIED()))
    expect(text).not.toContain("quote")
    expect(text).not.toMatch(/[\u0600-\u06FF]/)
  })

  test("a set that expects nothing but `rejected` produces no finding from this rule", () => {
    expect(checkCollectionCoverage(SERVED, true, SIX_COLLECTIONS)).toEqual([])
  })

  test("the published `verdictCounts` do not silence it, because the cases are the authority", () => {
    // The self-certifying shape, planted: the fixture above publishes `rejected: 41` against 41 cases
    // of which one expects `verified`, so a rule that read the header would report a clean set. Reading
    // the cases is the whole claim — the same reasoning as the `coverageRows` test above.
    const text = ONE_VERIFIED()
    expect(JSON.parse(text).verdictCounts).toEqual({ rejected: 41 })
    expect(rules(checkCollectionCoverage(SERVED, true, text))).toEqual(["eval-fabrication-not-rejected"])
  })

  test("this finding does not hide the below-floor finding, because a set can be wrong both ways", () => {
    const set = JSON.parse(ONE_VERIFIED()) as Record<string, unknown>
    const cases = (set.cases as Record<string, unknown>[]).slice(0, 4)
    const thin: Record<string, unknown> = { ...set, cases, classCounts: { letter_transposed: 4 }, verdictCounts: { rejected: 4 } }
    const { datasetDigest: _stale, ...material } = thin
    const digest = digestOf(material)
    if (!isOk(digest)) throw new Error(`fixture digest could not be computed: ${digest.error.detail}`)
    const claims = checkCollectionCoverage(SERVED, true, JSON.stringify({ ...material, datasetDigest: digest.value }))
    expect(rules(claims)).toContain("eval-fabrication-not-rejected")
    expect(rules(claims)).toContain("eval-coverage-below-floor")
  })
})

/**
 * R21d — a published coverage table's rows, checked against the figures `--record` wrote.
 *
 * ## The hole, stated as what a reader would have seen
 *
 * `checkPresenceCollectionNamed` scans for a line carrying both a presence/recall word and a fraction. A
 * markdown table row carries neither: `| tirmidhi | 15 | 15/15 | 15/15 | 15/15 | 15 | 0 | 3889 |` is
 * bare integers in cells, with the *word* in the header and the *slash* in the header too. So every
 * figure in the per-collection table — the one place a reader can see which book a number belongs to —
 * was checked by nothing at all, while the aggregate sentence above it verified perfectly.
 *
 * Each test below plants one drifted cell. A table rule that cannot fail on a stale number is not a
 * rule (AGENTS.md section 14).
 */
describe("R21d - a coverage table's cells agree with the recorded run", () => {
  /** The committed artefact's six collections, with the containment figures CR-3 added. */
  const RECORDED: CoverageArtefact = {
    path: "data/benchmark/vs-search.json",
    text: JSON.stringify({
      suggestionCaseCount: 40,
      suggestionCoverageCollections: "abudawud,ibnmajah,malik,nasai,quran,tirmidhi",
      suggestionCoverageCasesAbudawud: 15,
      suggestionCoverageCasesIbnmajah: 13,
      suggestionCoverageCasesMalik: 5,
      suggestionCoverageCasesNasai: 3,
      suggestionCoverageCasesQuran: 2,
      suggestionCoverageCasesTirmidhi: 2,
      suggestionCoverageRejectedAbudawud: 15,
      suggestionCoverageRejectedIbnmajah: 13,
      suggestionCoverageRejectedMalik: 5,
      suggestionCoverageRejectedNasai: 3,
      suggestionCoverageRejectedQuran: 2,
      suggestionCoverageRejectedTirmidhi: 2,
      suggestionCoverageVerifiedAbudawud: 0,
      suggestionCoveragePresenceTop1Abudawud: 15,
      suggestionCoveragePresenceTop3Abudawud: 15,
      suggestionCoveragePresenceTop5Abudawud: 15,
      suggestionCoveragePresenceTop1Ibnmajah: 13,
      suggestionCoveragePresenceTop3Ibnmajah: 13,
      suggestionCoveragePresenceTop5Ibnmajah: 13,
      suggestionCoveragePresenceTop1Malik: 5,
      suggestionCoveragePresenceTop3Malik: 5,
      suggestionCoveragePresenceTop5Malik: 5,
      suggestionCoveragePresenceTop1Nasai: 3,
      suggestionCoveragePresenceTop3Nasai: 3,
      suggestionCoveragePresenceTop5Nasai: 3,
      suggestionCoveragePresenceTop1Quran: 2,
      suggestionCoveragePresenceTop3Quran: 2,
      suggestionCoveragePresenceTop5Quran: 2,
      suggestionCoveragePresenceTop1Tirmidhi: 2,
      suggestionCoveragePresenceTop3Tirmidhi: 2,
      suggestionCoveragePresenceTop5Tirmidhi: 2,
    }),
  }

  /** The corpus sizes the committed attestation records, which `served records` resolves against. */
  const SERVED_COUNTS = new Map([
    ["abudawud", 5272],
    ["ibnmajah", 4336],
    ["malik", 1829],
    ["nasai", 5672],
    ["quran", 6236],
    ["tirmidhi", 3889],
  ])

  /**
   * An artefact that measured three of the six served collections.
   *
   * Needed because "served but unmeasured" is a state the committed six-collection run has no example of,
   * and the honest unmeasured row is the one shape a table rule must not fail. Testing it against the
   * committed artefact would test a different row than the one the test names.
   */
  const PARTIAL: CoverageArtefact = {
    path: "data/benchmark/vs-search.json",
    text: JSON.stringify({
      suggestionCaseCount: 20,
      suggestionCoverageCollections: "abudawud,ibnmajah,quran",
      suggestionCoverageCasesAbudawud: 15,
      suggestionCoverageCasesIbnmajah: 3,
      suggestionCoverageCasesQuran: 2,
      suggestionCoverageRejectedAbudawud: 15,
      suggestionCoverageRejectedIbnmajah: 3,
      suggestionCoverageRejectedQuran: 2,
      suggestionCoveragePresenceTop5Abudawud: 15,
      suggestionCoveragePresenceTop5Ibnmajah: 3,
      suggestionCoveragePresenceTop5Quran: 2,
    }),
  }

  /** A document wrapping rows in the two shapes the audited documents actually publish. */
  const document = (headers: readonly string[], rows: readonly (readonly string[])[]): string =>
    [
      "# Coverage",
      "",
      `| ${headers.join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
      ...rows.map((row) => `| ${row.join(" | ")} |`),
      "",
    ].join("\n")

  const VALUE_HEADERS = ["collection", "cases", "top-1", "top-3", "top-5", "rejected", "verified", "served records"]
  const QURAN_ROW = ["quran", "2", "2/2", "2/2", "2/2", "2", "0", "6236"]
  const TIRMIDHI_ROW = ["tirmidhi", "2", "2/2", "2/2", "2/2", "2", "0", "3889"]

  const check = (text: string, served: ReadonlyMap<string, number> = SERVED_COUNTS) =>
    checkCoverageTableRows(text, "docs/value-proof.md", RECORDED, served)

  test("the committed shape passes, which is the only proof that the rule is not simply always-failing", () => {
    expect(check(document(VALUE_HEADERS, [QURAN_ROW, TIRMIDHI_ROW]))).toEqual([])
  })

  test("the planted violation fails: another collection's case count pasted into this row", () => {
    // The exact cell CR-1 describes. 15 is abudawud's count; tirmidhi has 2. Every other rule in the
    // repository passed on this document, because the sentence above it was true.
    //
    // One row pastes a whole column at once, so this raises one finding per wrong cell rather than one
    // per row — asserted on the `cases` cell and the rule, with the count stated, because the point is
    // that the *first* wrong cell is named and not the last one found.
    const claims = check(document(VALUE_HEADERS, [QURAN_ROW, ["tirmidhi", "15", "15/15", "15/15", "15/15", "15", "0", "3889"]]))
    expect(new Set(rules(claims))).toEqual(new Set(["presence-row-stale"]))
    expect(details(claims)).toContain("states 15 for `tirmidhi` in its `cases` column")
    expect(details(claims)).toContain("records 2")
  })

test("a match the rule cannot read is reported as unread, never as a stated zero", () => {
    // The planted violation, and the reason `statedNumerator` exists.
    //
    // `parseCount(stated[1] ?? "")` stood at this call site. `Number("")` is `0`, so any drift between
    // the pattern and its reader — a new group inserted before the numerator, the one change this
    // function is exposed to — would have been published as `presence-row-stale`: "states 0 for
    // `quran`", accusing a committed, reviewed document of a number it never printed, in a rule whose
    // whole purpose is being right about exactly those documents. `null` is the true state of a rule
    // that cannot read a cell, and `presence-cell-unread` is the id this module already uses for it.
    //
    // So the assertion is about the *word*, not the number: unread, never zero.
    expect(statedNumerator(["6,236", "6,236"] as unknown as RegExpExecArray)).toBe("6,236")
    expect(statedNumerator(["6,236", undefined] as unknown as RegExpExecArray)).toBeNull()
    expect({ numericFallback: Number("") }).toEqual({ numericFallback: 0 })
  })

  test("a drifted `rejected` cell fails, because containment is the column a reader quotes", () => {
    const claims = check(document(VALUE_HEADERS, [QURAN_ROW, ["tirmidhi", "2", "2/2", "2/2", "2/2", "1", "0", "3889"]]))
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("in its `rejected` column")
  })

  test("a denominator beside a figure is checked against that collection's case count", () => {
    // `2/15` in quran's row is the shape that makes a table unreadable: the same column carries two
    // denominators seven and a half times apart. Rule ten cannot see it — it compares quantities and
    // 15 is a number the artefact records — so this rule owns it.
    const claims = check(document(VALUE_HEADERS, [["quran", "2", "2/2", "2/2", "2/15", "2", "0", "6236"]]))
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("denominator of that column is 2")
  })

  test("a stale row for a collection nothing serves is reported as stale, not silently skipped", () => {
    // A collection removed from the corpus leaves its row behind, and `| bukhari | 4 | ... |` states
    // figures for a book this repository no longer has. The served set is what distinguishes this from a
    // collection that is served and honestly unmeasured — which is the next test.
    const claims = check(document(VALUE_HEADERS, [QURAN_ROW, ["bukhari", "4", "4/4", "4/4", "4/4", "4", "0", "7563"]]))
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("no committed run measured")
  })

  test("a served collection nobody measured may carry words, and words are not a claim", () => {
    // The honest unmeasured row `renderCoverage` prints. If the rule failed this, the only way to
    // publish an unmeasured collection would be to omit it — which is the three-books defect again.
    //
    // `nasai` is recorded in the committed artefact, so this needs an artefact that did *not* measure
    // it: "served but unmeasured" is a state the current six-collection run has no example of, and a
    // test that used the committed artefact would be testing a different row than it names.
    const claims = checkCoverageTableRows(document(VALUE_HEADERS, [["nasai", "0", "zero", "zero", "zero", "zero", "zero", "5672"]]), "docs/value-proof.md", PARTIAL, SERVED_COUNTS)
    expect(claims).toEqual([])
  })

  test("but the same row with a digit fails, because a number no artefact supports is a claim", () => {
    const claims = checkCoverageTableRows(document(VALUE_HEADERS, [["nasai", "0", "0", "0", "0", "0", "0", "5672"]]), "docs/value-proof.md", PARTIAL, SERVED_COUNTS)
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("no committed run measured")
  })

  test("a row of words for an unserved collection is a stale row once the served set is known", () => {
    const claims = check(document(VALUE_HEADERS, [["bukhari", "zero", "zero", "zero", "zero", "zero", "zero", "7563"]]), SERVED_COUNTS)
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("stale row")
  })

  test("the same row is not called stale when the served set could not be enumerated", () => {
    // The fail-closed edge, in the direction that matters. "This collection is not in the set I could
    // read" is not evidence that it was removed, and a rule that reported it anyway would send an
    // operator to delete a row from a fork that never shipped the attestation.
    expect(check(document(VALUE_HEADERS, [["bukhari", "zero", "zero", "zero", "zero", "zero", "zero", "7563"]]), new Map())).toEqual([])
  })

  test("an unrecorded row's population columns are left to the rules that own them", () => {
    // `cases` and `served records` are excluded from the digit test for an unrecorded row, and that
    // exclusion is load-bearing: `renderCoverage` prints `| nasai | 0 | zero | ... |` for an unmeasured
    // collection, so checking its `cases` cell would fail the row that documents its own absence.
    // The second assertion keeps the stale-row half honest — dropping the columns must not have turned
    // every unrecorded row into a pass.
    const claims = check(document(VALUE_HEADERS, [["bukhari", "zero", "zero", "zero", "zero", "zero", "zero", "7563"]]), new Map())
    expect(claims).toEqual([])
    const stale = checkCoverageTableRows(document(VALUE_HEADERS, [["bukhari", "zero", "zero", "zero", "zero", "zero", "zero", "7563"]]), "docs/value-proof.md", PARTIAL, SERVED_COUNTS)
    expect(rules(stale)).toEqual(["presence-row-stale"])
  })

  test("a `served records` cell is checked against the attestation, not against the artefact", () => {
    // 5272 is abudawud's corpus size. It is a property of the snapshot rather than a measurement of
    // ours, so the artefact cannot corroborate it and the attestation is the only authority.
    const claims = check(document(VALUE_HEADERS, [["abudawud", "15", "15/15", "15/15", "15/15", "15", "0", "5000"]]))
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("in its `served records` column")
  })

  test("columns are matched by header name, so the two audited documents' column orders both pass", () => {
    // `docs/value-proof.md` and `docs/specs/measurements.md` publish the same figures in different
    // orders. Matching on an index would turn one document's six checks into six skipped ones — the
    // ADR-10 shape, where a rule is scoped away from the file holding the error.
    const narrow = ["collection", "cases", "served records"]
    expect(check(document(narrow, [["quran", "2", "6236"]]))).toEqual([])
    expect(check(document(narrow, [["quran", "15", "6236"]]))).toHaveLength(1)
  })

  test("a table with no `collection` column is not this rule's business", () => {
    // The degradation matrix's table is `| Failure | What is printed |`. Demanding coverage attribution
    // from it would be a finding about a document that is not making a coverage claim.
    expect(check(document(["failure", "what is printed"], [["Slow corpus scan", "no sources found"]]))).toEqual([])
  })

  test("an artefact recording no coverage skips rather than inventing a disagreement", () => {
    // The artefact half owns the missing file (`presence-coverage-unrecorded`); reporting every cell of
    // every table here as unsupported would say the same thing once per row.
    const missing: CoverageArtefact = { path: "data/benchmark/vs-search.json", text: null }
    expect(checkCoverageTableRows(document(VALUE_HEADERS, [QURAN_ROW]), "docs/value-proof.md", missing)).toEqual([])
  })

  test("every finding a run raises is reported, not only the first drifted cell", () => {
    // One row, three wrong cells. Reporting the first would make the next two a second build's problem
    // and the operator would run the gate three times to fix one row.
    const claims = check(
      document(VALUE_HEADERS, [
        ["quran", "2", "2/2", "2/2", "2/2", "2", "0", "6236"],
        ["tirmidhi", "2", "1/2", "2/2", "2/2", "1", "0", "3889"],
      ]),
    )
    expect(rules(claims)).toEqual(["presence-row-stale", "presence-row-stale"])
    expect(details(claims)).toContain("`top-1` column")
    expect(details(claims)).toContain("`rejected` column")
  })

  test("the committed artefact satisfies this rule, so today's documents pass it", () => {
    // The gate being *unsatisfiable* is its own failure: a key renamed without this being updated would
    // make `check:docs` fail forever and every future documentation edit would be unlandable.
    const committed = readIfPresent(join(import.meta.dir, "..", "..", "..", "data", "benchmark", "vs-search.json"))
    expect(committed).not.toBeNull()
    expect(checkCoverageTableRows(readFileSync(join(import.meta.dir, "..", "..", "..", "docs", "value-proof.md"), "utf8"), "docs/value-proof.md", { path: "data/benchmark/vs-search.json", text: committed }, SERVED_COUNTS)).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * R21e — a number in a coverage table that no rule reads is a finding.
 *
 * The previous version of this rule skipped any header it did not recognise, on the stated ground that
 * "adding a column to a document cannot invent a finding". Probed live, that default was a switch:
 * `cases` and `top-5` produced findings, `recall@5`, `presence`, `top5` and `nonsense` produced none.
 * Renaming one header disarmed every check on that column while the table went on publishing numbers
 * that looked verified. These tests exist so the switch cannot come back.
 * ------------------------------------------------------------------ */
describe("R21e - a number no rule reads is a finding, not a skip", () => {
  const RECORDED: CoverageArtefact = {
    path: "data/benchmark/vs-search.json",
    text: JSON.stringify({
      suggestionCaseCount: 10,
      suggestionCoverageCollections: "malik,nasai,quran",
      suggestionCoverageCasesQuran: 2,
      suggestionCoverageCasesMalik: 5,
      suggestionCoverageCasesNasai: 3,
      suggestionCoverageRejectedQuran: 2,
      suggestionCoverageRejectedMalik: 5,
      suggestionCoverageRejectedNasai: 3,
      suggestionCoveragePresenceTop5Quran: 2,
    }),
  }

  const SERVED = new Map([
    ["quran", 6236],
    ["malik", 1829],
    ["nasai", 5672],
  ])

  const document = (headers: readonly string[], rows: readonly (readonly string[])[]): string =>
    [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""].join("\n")

  const check = (text: string) => checkCoverageTableRows(text, "docs/value-proof.md", RECORDED, SERVED)

  test("the planted violation fails: a renamed `top-5` column is the column that was checked", () => {
    // `top5` is what a document gets when someone types the header without the hyphen, and it is the
    // shape that silenced six checks at once. The finding has to name the column, because the column
    // name is the whole of the defect.
    const claims = check(document(["collection", "cases", "top5"], [["quran", "2", "9"]]))
    expect(rules(claims)).toEqual(["presence-cell-unread"])
    expect(details(claims)).toContain("`top5` column")
  })

  test("a header no artefact key produces is a finding, not an unknown column", () => {
    const claims = check(document(["collection", "cases", "nonsense"], [["quran", "2", "9"]]))
    expect(rules(claims)).toEqual(["presence-cell-unread"])
    expect(details(claims)).toContain("no rule reads that column")
  })

  test("the message names the headers a rule does read, so the repair is one edit away", () => {
    const claims = check(document(["collection", "recall@5"], [["quran", "2"]]))
    expect(details(claims)).toContain("`cases`, `rejected`, `verified`")
    expect(details(claims)).toContain("`served records`")
    expect(details(claims)).toContain("`top-N`")
  })

  test("one unread column is one finding, however many rows repeat it", () => {
    // Six rows, one broken header. Reporting it per row would be the "one defect reported six times"
    // shape this module has already had to undo once, and it would bury a wrong cell in a per-row rule.
    const claims = check(
      document(
        ["collection", "cases", "nonsense"],
        [
          ["quran", "2", "9"],
          ["malik", "5", "9"],
          ["nasai", "3", "9"],
        ],
      ),
    )
    expect(rules(claims)).toEqual(["presence-cell-unread"])
  })

  test("an unread column with no numbers in it is still silent, because a word is not a claim", () => {
    expect(check(document(["collection", "cases", "licence"], [["quran", "2", "no-derivatives"]]))).toEqual([])
  })

  test("a declared prose column is silent, and `coverage` is the one declared today", () => {
    // The `coverage` column of `docs/value-proof.md` reads `measured` per row. It is a rate's home and a
    // rate has no integer in the artefact to be compared against, so it is declared rather than inferred.
    expect(check(document(["collection", "cases", "coverage"], [["quran", "2", "measured"]]))).toEqual([])
  })

  test("a number in a READ column spelled in a shape no reader parses is a finding", () => {
    // The other escape, and the quieter one: the reader is present for `cases` and cannot parse
    // `2 of 2, checked twice`. Skipping it would be indistinguishable from not having the column.
    const claims = check(document(["collection", "cases"], [["quran", "2 of 2, checked twice"]]))
    expect(rules(claims)).toEqual(["presence-cell-unread"])
    expect(details(claims)).toContain("no rule reads")
  })

  test("a thousands separator is a figure, not a shape no reader parses", () => {
    // `6,236` is the spelling every one of these documents uses for a corpus size. Read as prose it would
    // have been the same silent skip wearing a comma.
    expect(check(document(["collection", "served records"], [["quran", "6,236"]]))).toEqual([])
    const wrong = check(document(["collection", "served records"], [["quran", "6,237"]]))
    expect(rules(wrong)).toEqual(["presence-row-stale"])
    expect(details(wrong)).toContain("states 6237 for `quran`")
  })

  test("a separator in a cases cell is compared as the number it spells", () => {
    // `1,234` is four digits grouped; `1,23` is not a number this grammar will guess at, and a rule that
    // read it as 123 would be inventing a figure. So it is unread — reported, never compared.
    const claims = check(document(["collection", "cases"], [["quran", "1,234"]]))
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("states 1234 for `quran`")
    expect(rules(check(document(["collection", "cases"], [["quran", "1,23"]])))).toEqual(["presence-cell-unread"])
  })

  test("a row keyed by a display name is unkeyed, not silently unchecked", () => {
    // This test used to assert the opposite — `expect(...).toEqual([])` — and the assertion was
    // honest about itself: "a table keyed by display names is out of scope, and saying so is the
    // boundary". That sentence was the defect. A `collection`-headed row naming no collection had no
    // row rule to compare against, so every per-row check returned `[]` and the figure stayed
    // published — and the cheapest way to get there was a purely cosmetic edit, renaming `nasai` to
    // `Sunan an-Nasa'i`. A gate whose boundary is one cell edit from being disarmed is not a boundary.
    //
    // So a row that states a number and resolves to no collection is now reported, by name, with the
    // repair. `README.md`'s inventory was the real instance and is now keyed on the identifiers its
    // figures are attested under.
    const claims = check(document(["collection", "records"], [["Qur'an (Tanzil, Uthmani)", "6,236"]]))
    expect(rules(claims)).toEqual(["presence-row-unkeyed"])
    expect(details(claims)).toContain("is not a corpus identifier and names no known collection")
    expect(details(claims)).toContain("`quran`")
  })

  test("a decorated label that NAMES one known collection is keyed, so a cosmetic rename keeps its audit", () => {
    // The other half of the fix, and the reason the row above is a finding rather than a ban. A
    // display name is allowed — it just has to be unambiguous about which collection it is, and
    // containment is what establishes that without a name-mapping to trust. `README.md` rows now read
    // `tirmidhi — Jami' at-Tirmidhi` and are compared against the artefact exactly as before.
    // `malik` recorded 5 cases here, so a row stating 41 is compared and reported stale.
    const claims = check(document(["collection", "cases"], [["malik — Muwatta' (Malik)", "41"]]))
    expect(rules(claims)).toEqual(["presence-row-stale"])
    expect(details(claims)).toContain("`malik`")
  })

  test("a label naming TWO known collections is unkeyed, because guessing which book is the defect", () => {
    // Both names are in the served and recorded sets for this fixture, so containment finds two and
    // has to refuse to pick. Choosing the first would attribute a figure to whichever book happened to
    // be listed first — the failure the old "map display names to identifiers" comment was refusing.
    const claims = check(document(["collection", "cases"], [["malik and nasai", "41"]]))
    expect(rules(claims)).toEqual(["presence-row-unkeyed"])
  })

  test("an unknown collection that IS a syntactically valid identifier is stale, not unkeyed", () => {
    // The distinction that keeps the new finding from swallowing an old one. `bukhari` is a removed
    // collection: a stale row with a real repair (delete the row), not a row missing a key. Reporting
    // it as unkeyed would tell the author to write an identifier they already wrote.
    const claims = check(document(["collection", "cases"], [["bukhari", "4"]]))
    expect(rules(claims)).toEqual(["presence-row-stale"])
  })

  test("a separator row states no number, so it is never an unkeyed finding", () => {
    // `| --- | --- |` resolves to no collection, so without the digit test every table would report
    // one finding for its own header rule. The test is the digit test, which is also what keeps an
    // honest prose row (`measured`, or the reason it is not) quiet.
    expect(check(document(["collection", "cases"], [["---", "---"]]))).toEqual([])
    expect(check(document(["collection", "cases"], [["Sunan Abi Dawud", "measured"]]))).toEqual([])
  })

  test("an unread artefact no longer silences the column check, because that check needs no artefact", () => {
    // `checkCoverageTableRows` opened with `if (recorded === null) return []`. A corrupt
    // `vs-search.json` therefore turned the document least examined — the state a customer is most
    // alarmed by — and it silenced a rule whose only input is the document itself. Two independent
    // defects must stay two independent findings.
    const malformed = { path: "data/benchmark/vs-search.json", text: "{ not json" }
    const claims = checkCoverageTableRows(
      "| collection | recall@5 |\n| --- | --- |\n| quran | 2 |\n",
      "docs/value-proof.md",
      malformed,
    )
    expect(rules(claims)).toEqual(["presence-cell-unread"])
    expect(details(claims)).toContain("no rule reads that column")
  })

  /*
   * The spelling bypass. `STATED_FIGURE` recognises bare counts and `n/m` and nothing else, so a
   * document could put every figure in an unread column wearing a shape the grammar does not parse
   * — a percent sign, a decimal, a sign, a unit — and `unreadCellFindings` would find nothing to
   * report. That is the R21e switch reopened through the grammar instead of the header: the column
   * was never renamed, the numbers were just spelled differently. The rule's own text forbids it
   * ("not *a number this grammar happens to parse*"), so the code now reads digits, not shapes.
   *
   * Every case below is one the previous implementation returned `[]` for. All five are the same
   * defect, so they are planted as five tests: a rule that only catches `644 ms` because the probe
   * happened to use a millisecond is a rule with one planted violation and five passes.
   */

  const SHAPES_NO_GRAMMAR_READS = ["100.0%", "+35.0 pp", "0.65", "-3", "644 ms"] as const

  for (const shape of SHAPES_NO_GRAMMAR_READS) {
    test(`an unread column publishing "${shape}" is a finding, because a number is a claim`, () => {
      const claims = check(document(["collection", "cases", "precision"], [["quran", "2", shape]]))
      expect(rules(claims)).toEqual(["presence-cell-unread"])
      expect(details(claims)).toContain("no rule reads that column")
    })
  }

  test("the shape check is on the digits, not the spelling: a bare count still reads as a claim", () => {
    // The other half of the pair, and the reason the test above is a fix rather than a blanket alarm.
    expect(rules(check(document(["collection", "cases", "precision"], [["quran", "2", "753"]])))).toEqual([
      "presence-cell-unread",
    ])
  })

test("a digit in a declared prose column is a finding that QUOTES the declaration", () => {
    // This test used to assert `[]`, on the reasoning that "`coverage` is declared prose, so no column
    // rule owns it — but the row rule reads it". The second half is the bug, and finding it is what the
    // fix turned up: for a *recorded* collection the row rule does not read it either, because
    // `columnFigure` resolves to `null` for a column no artefact field owns and `cellFindings` skips
    // that case. So `| quran | 2 | measured 0.65 |` was published unchecked — the one header shape in
    // the table where a number was checked by nothing, the exact inverse of R21e.
    //
    // The finding quotes the declaration rather than merely reporting the digit, because a person
    // facing it has two repairs — reword the cell, or withdraw the exemption — and choosing between
    // them requires reading the exemption. That is also why `PROSE_COLUMNS` is now exported: a reason
    // that is written once and never printed is a comment with a runtime cost.
    const claims = check(document(["collection", "cases", "coverage"], [["quran", "2", "measured 0.65"]]))
    expect(rules(claims)).toEqual(["presence-cell-unread"])
    expect(details(claims)).toContain("in its `coverage` column, which is declared prose")
    expect(details(claims)).toContain(PROSE_COLUMNS["coverage"] ?? "")
  })

  test("a genuine word in a declared prose column stays silent, so the declaration still works", () => {
    // The other direction, and the one that proves the finding above is about the *digit* rather than
    // about the header. `measured` is the cell `renderCoverage` prints and what the column is for; a
    // rule that reported it would turn the honest row the declaration exists to protect into a finding.
    expect(check(document(["collection", "cases", "coverage"], [["quran", "2", "measured"]]))).toEqual([])
  })

  test("every prose column's reason names the artefact field or constant that grounds it", () => {
    // An exemption whose justification is one adjective away from a real reason is how a column gets
    // excused forever: nothing reads the sentence, so nothing notices when the constant it cites is
    // renamed. So the reason must cite a backticked token, and that token must actually be declared
    // in this module's own source — checked against the file rather than against a registry, because a
    // registry would be a second place the same citation lives (AGENTS.md section 17).
    expect(Object.keys(PROSE_COLUMNS).length).toBeGreaterThan(0)
    const source = readFileSync(join(ROOT, "packages", "mizan-gate", "src", "docs-coverage.ts"), "utf8")
    for (const [header, reason] of Object.entries(PROSE_COLUMNS)) {
      const cited = [...reason.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "").filter((token) => !token.includes(" "))
      expect({ header, cited: cited.length > 0 }).toEqual({ header, cited: true })
      for (const token of cited) {
        expect({ header, token, declared: source.includes(token) }, `${header} cites "${token}", which this module does not declare`).toEqual({
          header,
          token,
          declared: true,
        })
      }
    }
  })

  test("an unrecorded row that spells its figure as a decimal is a stale row, not a shape", () => {
    // `tirmidhi` is served and unmeasured, which is the row `renderCoverage` prints honestly with the
    // word `zero`. A digit in that row's prose column means the row is claiming a rate nobody ran, and
    // `ANY_DIGIT` is what sees it — `STATED_FIGURE` would have read `0.65` as prose and let the row
    // through, which is CR-1 with a decimal point on the end.
    //
    // `toContain` rather than `toEqual`, because after the fix this row raises the cell finding too —
    // two findings for one cell, from two different rules, and both are true.
    const served = new Map([...SERVED, ["tirmidhi", 3889]])
    const claims = checkCoverageTableRows(
      document(["collection", "cases", "coverage"], [["tirmidhi", "0", "measured 0.65"]]),
      "docs/value-proof.md",
      RECORDED,
      served,
    )
    expect(rules(claims)).toContain("presence-row-stale")
    expect(details(claims)).toContain("states figures for `tirmidhi`")
  })

  test("the honest unmeasured row — the word `zero`, no digit — is still accepted", () => {
    // The fix must not fail closed on the shape the renderer actually prints, or it would have
    // deleted the honest row it was written to protect.
    const served = new Map([...SERVED, ["tirmidhi", 3889]])
    expect(
      checkCoverageTableRows(
        document(["collection", "cases", "coverage"], [["tirmidhi", "0", "measured zero — no figure published"]]),
        "docs/value-proof.md",
        RECORDED,
        served,
      ),
    ).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * The provenance of a per-collection table.
 *
 * `| abudawud | 15 | 15 | 0 | 5272 | measured |` is fifteen cases and no statement of which fifteen. Every
 * other number in the audited documents is compared against an artefact; this one was not, because the
 * artefact's set digest was never put in front of the documents. The finding that opened this was a
 * `docs/specs/measurements.md` with a full per-collection table and no `ds1:` digest anywhere, which
 * `check:docs` accepted.
 * ------------------------------------------------------------------ */
describe("a per-collection table must name the set it decomposed", () => {
  const DIGEST = "ds1:c9b35dd9ae7200e1b0152cfcb8afb80205e4500f5b40008c2e77d03ce5cc88e5"
  const OTHER = "ds1:0c16dda25dce552e46c74a9f93fba1f1c509ee1a35b92b51678b29dde93439cb"
  const ARTEFACT: CoverageArtefact = {
    path: "data/benchmark/vs-search.json",
    text: JSON.stringify({ suggestionEvalSetDigest: DIGEST, suggestionCoverageCollections: "quran" }),
  }
const table = (digest?: string): string =>
    [
      "| collection | cases | coverage |",
      "| --- | --- | --- |",
      "| quran | 2 | measured |",
      ...(digest === undefined ? [] : [`**Dataset digest: \`${digest}\`**`]),
      "",
    ].join("\n")
  const check = (document: string, artefact: CoverageArtefact = ARTEFACT) =>
    checkMeasuredSetDigest(document, "docs/specs/measurements.md", artefact)

  test("the planted violation fails: a per-collection table with no digest at all", () => {
    const claims = check(table())
    expect(rules(claims)).toEqual(["presence-set-digest-missing"])
    expect(details(claims)).toContain("names no `ds1:` dataset digest")
    expect(details(claims)).toContain(DIGEST)
  })

test("the committed digest passes, which is the only proof the rule is not always-failing", () => {
    expect(check(table(DIGEST))).toEqual([])
  })

  test("a digest pointing at ANOTHER set is a finding, because it reads as provenance and is not", () => {
    // The reason this is a comparison and not a presence check. "State some digest" is satisfiable by
    // stating the wrong one, which is worse than stating none: the page now looks traceable while
    // pointing at a set whose per-collection counts are different from the ones above it.
    const claims = check(table(OTHER))
    expect(rules(claims)).toEqual(["presence-set-digest-stale"])
    expect(details(claims)).toContain(DIGEST)
  })

  test("a document publishing no per-collection table says nothing, because there is nothing to attribute", () => {
    // A digest on a page with no decomposed figure is decoration, and a rule that fires on decoration
    // teaches its readers to ignore it.
    expect(check("# Notes\n\nSome prose, and `ds1:abc` mentioned in passing.\n")).toEqual([])
  })

  test("an artefact that records no digest is somebody else's finding, reported once against the artefact", () => {
    // Not a second report here. `checkPresenceCoverageRecorded` already names the culprit file, and
    // repeating it per document would bury the one line that says which file is broken.
    expect(check(table(), { path: "data/benchmark/vs-search.json", text: "{ not json" })).toEqual([])
    expect(check(table(), { path: "data/benchmark/vs-search.json", text: null })).toEqual([])
  })

  test("both audited documents that publish a table state the committed digest today", () => {
    // Not a unit test of a fixture: the actual documents against the actual artefact. This is the test
    // that fails if someone edits a per-collection table without saying which set it decomposed.
    const root = join(import.meta.dir, "..", "..", "..")
    const artefact = readIfPresent(join(root, "data", "benchmark", "vs-search.json"))
    expect(artefact).not.toBeNull()
    if (artefact === null) return
    for (const document of ["docs/value-proof.md", "docs/specs/measurements.md"]) {
      expect(checkMeasuredSetDigest(readFileSync(join(root, document), "utf8"), document, { path: "data/benchmark/vs-search.json", text: artefact })).toEqual([])
    }
  })
})
