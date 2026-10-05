import { CollectionCoverageRow, digestOf, identityMismatch, type EvalCase } from "@mizan/core"
import { coverageOf, countFor } from "./selection.ts"

/**
 * An eval set's identity: the digest over the content a comparison may treat as the same data.
 *
 * ## The failure this prevents
 *
 * `vs-search.json` compares today's numbers against a committed baseline and reports a delta. Two
 * ways to be wrong, one visible and one not:
 *
 *  - **visible** — the number moved, which is the report's subject.
 *  - **invisible** — the *data* moved underneath a number that did not. Regenerating the red-team set
 *    changes the denominator; `falseVerifiedCount: 0` stays `0`; the comparison prints `+0.0pp` and
 *    passes. The evidence was never comparable and the gate said it was.
 *
 * The second is the dangerous one, because it presents as the gate working. `identityMismatch` is
 * what makes "same data?" answerable before "did it move?", and this module is where a set's
 * material is decided.
 *
 * ## The material is the whole document minus `datasetDigest`
 *
 * One key is excluded, and the exclusion is the entire design rather than an inconvenience. A digest
 * over a document containing itself has no fixed point: writing the digest changes the input, so no
 * value is ever correct and every set would fail its own check. Excluding the one key makes the
 * check available to any reader with no private knowledge — read the file, drop `datasetDigest`,
 * digest the rest, compare — which is what "committed digest" has to mean for it to be evidence.
 *
 * Everything else is included: the cases, the anchors, the class counts, the notice, the prose in
 * `purpose`. An identity that excluded prose would let a set's claims change while its identity held,
 * and the digest would certify a document nobody could recognise.
 *
 * ## Why coverage rows are recomputed here rather than trusted
 *
 * `coverageRows` IS part of the material, so editing it changes the identity — the set cannot quietly
 * misreport its own coverage without invalidating itself. It is not, however, *evidence* of coverage:
 * `docs-coverage.ts` counts `cases` independently, and the two disagreeing is exactly what that rule
 * is for. A digest that covered only `cases` would leave the rows unverified.
 */

/** The one key excluded from the material, named once so writer and checker cannot differ. */
export const EXCLUDED_FIELD = "datasetDigest"

/**
 * A set with its identity field removed: what the digest is taken over.
 *
 * The removal is shallow and by construction complete — `datasetDigest` is a top-level header field,
 * so no nested occurrence exists to miss, and a deep delete would be a second place for the rule to
 * live (AGENTS.md section 17).
 */
export const materialOf = <T extends Record<string, unknown>>(set: T): Omit<T, typeof EXCLUDED_FIELD> => {
  const { [EXCLUDED_FIELD]: _excluded, ...material } = set
  return material
}

/** The identity of a set's content, or a typed refusal when the content cannot be canonicalised. */
export const identityOf = (set: Readonly<Record<string, unknown>>) => digestOf(materialOf(set))

/**
 * Per-collection coverage rows, sorted by collection.
 *
 * Counted here with the same `coverageOf` the generator used to draw the anchors, so the published
 * rows and the drawing order cannot drift, and sorted so the file is byte-stable across runs — the
 * property `DETERMINISM` in the writer claims.
 *
 * `anchorCount` is the number of DISTINCT records the collection's cases cite. Six cases re-rendering
 * one span give `caseCount: 6, anchorCount: 1`, which is the honest rendering and the reason the two
 * fields exist separately.
 */
export const coverageRowsOf = (cases: readonly EvalCase[]) => {
  const counts = coverageOf(cases.map((entry) => ({ collection: entry.citation.collection })))
  const anchorsByCollection = new Map<string, Set<string>>()
  for (const entry of cases) {
    const existing = anchorsByCollection.get(entry.citation.collection)
    if (existing === undefined) {
      anchorsByCollection.set(entry.citation.collection, new Set([entry.anchorId]))
      continue
    }
    existing.add(entry.anchorId)
  }
  return [...counts.keys()]
    .sort()
    .map((collection) => ({
      collection,
      caseCount: countFor(counts, collection),
      anchorCount: anchorsByCollection.get(collection)?.size ?? 0,
    }))
}

/**
 * Whether a set's own `coverageRows` match the counts recomputed from its cases.
 *
 * The check the gate does NOT need but the writer does: this runs before the file is written, so a
 * generator bug that under-covered a collection is reported as a build failure naming the collection,
 * rather than surfacing days later as a `check:docs` finding in a repository nobody is thinking about.
 */
export const coverageRowProblems = (rows: readonly CollectionCoverageRow[], cases: readonly EvalCase[]): readonly string[] => {
  const recomputed = coverageRowsOf(cases)
  const problems: string[] = []
  if (rows.length !== recomputed.length) {
    return [`coverageRows lists ${rows.length} collections, but the cases name ${recomputed.length}`]
  }
  recomputed.forEach((expected, index) => {
    const published = rows[index]
    if (published === undefined) {
      problems.push(`coverageRows is missing ${expected.collection}`)
      return
    }
    if (published.collection !== expected.collection) {
      problems.push(`coverageRows is not sorted: ${published.collection} precedes ${expected.collection}`)
      return
    }
    if (published.caseCount !== expected.caseCount || published.anchorCount !== expected.anchorCount) {
      problems.push(`coverageRows says ${published.collection} has ${published.caseCount} cases over ${published.anchorCount} anchors, the cases have ${expected.caseCount} over ${expected.anchorCount}`)
    }
  })
  return problems
}

/**
 * Whether the digest a set publishes is the digest of its content.
 *
 * `identityMismatch` rather than a boolean, so an absent digest is a refusal with a reason instead of
 * a `false` that a caller might read as "different". A v2 artefact read by a v3 checker has no digest
 * at all, and the honest reading of that is "unknown", not "mismatch with today's set".
 */
export const digestAgrees = (published: string | null | undefined, recomputed: string) => identityMismatch(published, recomputed)

export * as Identity from "./identity.ts"