import { FABRICATION_COVERAGE_FLOOR } from "@mizan/gate"

/**
 * Which anchor a fabrication is drawn from — ADR-15.
 *
 * ## The defect this module exists to remove
 *
 * `buildSimple` used to take `mainAnchors(db).slice(0, count)`. `mainAnchors` is
 * `collectionsOf(db).flatMap(...)`, so it is already grouped by collection: five anchors from
 * abudawud, then five from ibnmajah, then malik, and so on. Slicing the front of a
 * collection-grouped list is therefore the same as slicing one collection. With `count = 8` over a
 * pool of five anchors per collection, `letter_transposed` and `word_inserted` drew their cases from
 * abudawud alone and into ibnmajah, and three of the six served collections — nasai, quran and
 * tirmidhi — never appeared in a fabrication case at all.
 *
 * Nothing about that is a bug the rest of the pipeline could see. The set validated: the declared
 * class counts matched, every case was a true fabrication absent from the whole corpus, and the
 * verifier produced the declared verdict for every one. The set was 40 correct fabrications of which
 * a third of the served corpus had never been asked to be falsified, and every artefact that reported
 * on it reported only totals.
 *
 * ## Why round-robin is the fix and not a bigger pool
 *
 * Widening `MAIN_ANCHORS_PER_COLLECTION` would have produced more abudawud cases, because the slice
 * is positional. The property required is not "more anchors" but "every served collection appears
 * before any collection appears twice", and that is a property of the ORDER the cases are drawn in,
 * so it belongs in a function that owns the order. `interleaveByCollection` is that function, and it
 * is pure: it takes a pool and a count and reads no corpus, no clock and no environment, which is
 * what lets `selection.test.ts` assert the whole rule with a literal pool.
 *
 * ## Why this is a separate module from `build.ts`
 *
 * Because of what it can be proved with. `build.ts` needs a `Database`, so a test of its selection
 * needs the 83 MB corpus and minutes of ingest. A test of this module needs a twelve-element array.
 * The CWE-345 claim this repository exists on has to be checkable in under a second by someone who
 * has not built anything, and the first version of that test could not be.
 */

/** The minimum a candidate carries for the interleaver to bucket it. Kept to what the pool has. */
export type Candidate = { readonly collection: string }

/**
 * Draw `count` candidates, one from each collection in turn, before any collection yields a second.
 *
 * ## Determinism
 *
 * Three orderings are all fixed: buckets appear in the order their first candidate appeared (so the
 * caller controls it by ordering the pool), within a bucket candidates keep pool order, and rounds
 * are consumed in that same bucket order. No sort, no `Set` iteration, no clock — so the same pool
 * and count yield byte-identical cases on every run and every machine, which is the property
 * AGENTS.md section 6 exists to protect and the reason the verifier's determinism claim is credible.
 *
 * ## What happens when the pool is smaller than the request
 *
 * It returns what exists, with no padding and no repeat. A fabricated re-use of an anchor would
 * raise the count to satisfy a quota while lowering the evidence — the exact substitution AGENTS.md
 * section 16 calls `silent mock` — so an exhausted pool shortens the draw and lets the caller's own
 * class-count check fail loudly, naming the class.
 */
export const interleaveByCollection = <T extends Candidate>(pool: readonly T[], count: number, offset = 0): readonly T[] => {
  if (count <= 0) return []
  const buckets = bucketByCollection(pool)
  if (buckets.length === 0) return []
  const depth = Math.max(...buckets.map((bucket) => bucket.length))
  const ordered: T[] = []
  for (let round = 0; round < depth; round += 1) {
    for (const bucket of buckets) {
      const candidate = bucket[round]
      if (candidate === undefined) continue
      ordered.push(candidate)
    }
  }
  return ordered.slice(offset, offset + count)
}

/**
 * Group the pool by collection, keeping first-appearance order within each bucket.
 *
 * One pass rather than a `Map` built from `new Set(...)` and then indexed: `Map` preserves
 * insertion order, which is the ordering `mainAnchors` already produces, and one pass makes that
 * the only ordering in play.
 */
const bucketByCollection = <T extends Candidate>(pool: readonly T[]): ReadonlyArray<readonly T[]> => {
  const order: string[] = []
  const buckets = new Map<string, T[]>()
  for (const candidate of pool) {
    const existing = buckets.get(candidate.collection)
    if (existing === undefined) {
      order.push(candidate.collection)
      buckets.set(candidate.collection, [candidate])
      continue
    }
    existing.push(candidate)
  }
  return order.map((collection) => buckets.get(collection) ?? [])
}

/**
 * How many of `candidates` came from each collection, keyed the way the corpus names them.
 *
 * Returned as a `Map` and read through `countFor` rather than as an object so a collection named
 * `constructor` or `toString` is a key like any other. The eval sets are read from disk and a
 * collection name comes from an ingest source, so it is untrusted input (AGENTS.md section 1) and
 * an object literal would have turned one name into a prototype lookup.
 */
export const coverageOf = (candidates: readonly Candidate[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const candidate of candidates) counts.set(candidate.collection, (counts.get(candidate.collection) ?? 0) + 1)
  return counts
}

/** The count for one collection, zero when it is absent — never `undefined`, so callers need no guard. */
export const countFor = (counts: ReadonlyMap<string, number>, collection: string): number => counts.get(collection) ?? 0

/**
 * Collections whose fabrication coverage is below the floor, sorted.
 *
 * The same arithmetic the gate rule performs, so a generator can assert the artefact it is about to
 * write is one the gate will accept. That is the point of reading the floor from `@mizan/gate`
 * rather than declaring a second copy of it here: the generator and the checker cannot disagree,
 * because there is only one number (AGENTS.md section 17).
 */
export const underFloor = (counts: ReadonlyMap<string, number>, served: Iterable<string>): readonly string[] =>
  [...served]
    .filter((collection) => countFor(counts, collection) < FABRICATION_COVERAGE_FLOOR)
    .sort()

/** The floor, re-exported so a caller building a set does not import `@mizan/gate` for one constant. */
export { FABRICATION_COVERAGE_FLOOR }

export * as Selection from "./selection.ts"