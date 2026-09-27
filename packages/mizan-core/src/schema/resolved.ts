import { Schema } from "effect"
import { Citation } from "./claim.ts"
import { CorpusRecord } from "./record.ts"

/**
 * `ResolvedCitation` — the hand-off between corpus resolution and the verifier.
 *
 * ## Why this type is in `core` and not in `verify`
 *
 * It is the contract BETWEEN two packages: `@mizan/corpus` produces it (resolution is I/O) and
 * `@mizan/verify` consumes it (verification is pure). A shared contract belongs with the other
 * contracts, which is also what keeps `mizan-corpus` from depending on `mizan-verify` — a
 * dependency that would point the build graph the wrong way and make the verifier look less
 * isolated than it is.
 *
 * ## The three states, encoded
 *
 *  - `records` non-empty, `ambiguous: false` — resolved. The verifier may verify OR reject.
 *  - `records` empty, `ambiguous: true`  — the identifier exists in more than one collection
 *    and the citation named none. `unverifiable (collection_ambiguous)`.
 *  - `records` empty, `ambiguous: false` — no such identifier.
 *    `unverifiable (identifier_unresolved)`.
 *
 * `ambiguous` is deliberately NOT encoded as "more than one record": two rows in the same
 * collection with one number is a data defect, while the same number across two collections is
 * ordinary in hadith. The flag says "the CITATION was ambiguous", which is the fact the
 * verdict needs.
 */

export const ResolvedCitation = Schema.Struct({
  /** The citation exactly as the model wrote it, preserved for the citation chip. */
  citation: Citation,
  /** Every record the citation could mean, ordered by id. Empty when it does not resolve. */
  records: Schema.Array(CorpusRecord),
  /** True when the identifier exists in more than one collection and the citation named none. */
  ambiguous: Schema.Boolean,
})
export type ResolvedCitation = Schema.Schema.Type<typeof ResolvedCitation>

/** A citation that resolves to nothing. The shape a lookup miss produces. */
export const unresolved = (citation: Citation): ResolvedCitation => ({ citation, records: [], ambiguous: false })

export * as ResolvedSchema from "./resolved.ts"
