import type { Database } from "bun:sqlite"
import { type Claim, type Citation, type Verdict, type VerdictReport } from "@mizan/core"
import { resolveCitations } from "@mizan/corpus"
import { verifyAnswer } from "@mizan/verify"

/**
 * The system arm: run the real verifier, once per case, and record what it said.
 *
 * ## Why this file exists, and why it is forbidden from reading the plan
 *
 * The previous system arm computed "detection" from the set's DECLARED expectations, so its
 * detection rate was 1.0 by construction: the number was a restatement of the fixture rather than a
 * measurement of anything, and on a red-team set — where every case is declared caught — a tautology
 * and a perfect verifier are indistinguishable. It was disclosed in the report, which is why it was
 * not dishonest, but disclosure is not measurement, and a benchmark that cannot be wrong is not
 * evidence.
 *
 * So the executor here is structurally unable to see the expectations. It receives a quote, a
 * citation and a snapshot hash, and returns the verdict `verifyAnswer` computed. Nothing in this
 * file mentions what the set says should happen; a module that cannot read the label cannot report
 * it.
 *
 * ## What holds that, and what does not
 *
 * The ban rests on the `SystemCase` type below, which has no field a label could arrive in, plus
 * review of this file. It is NOT held by a gate. There is no `B-1` in `GATE_IDS` and no
 * `packages/mizan-gate/src/benchmark-provenance.ts`; a structural scan that would reject the token
 * naming a verdict expectation is specified and unshipped, and that token is live in the eval
 * generator which publishes the sets. So this is a *reviewed* invariant, not a checked one, and
 * `docs/value-proof.md` states the same limit in the words a judge reads. It is written here
 * because the headline number of this project is the one place where an unshipped check named in
 * prose is least defensible.
 *
 * ## The arms stay independent
 *
 * The baseline arm imports the corpus and knows nothing about verdicts; this one imports
 * `@mizan/verify` and knows nothing about FTS5. If they shared a module, a defect in it would move
 * both numbers in the same direction and the delta would hold steady while both were wrong.
 *
 * ## No clock, no network, no randomness
 *
 * `verifyAnswer` takes a caller-supplied deadline predicate rather than reading a time, and nothing
 * here fetches or consults an external service, so re-running the arm over the same corpus yields
 * byte-identical outcomes. That is the property the whole determinism claim rests on, and it is why
 * the arm can be committed as an artefact rather than a transcript.
 */

/** One case as the executor needs it: the text to check and the source it is checked against. */
export type SystemCase = {
  readonly id: string
  readonly quote: string
  readonly citation: Citation
}

/** What the verifier said, and why. `reason` is the verifier's own vocabulary, never a restatement. */
export type SystemOutcome = {
  readonly caseId: string
  readonly verdict: Verdict
  readonly reason: string
}

/**
 * The single claim this arm builds per case.
 *
 * `text` is the claim's prose and is empty on purpose: the verifier reads `quote` and `citations`,
 * and a prose field here would be a second, unverifiable input that varies with nothing. The quote
 * is the whole of what is being checked.
 */
const claimFor = (testCase: SystemCase): Claim => ({
  id: testCase.id,
  text: "",
  quote: testCase.quote,
  citations: [testCase.citation],
})

/**
 * One case, verified.
 *
 * Citation resolution is the caller's job in `@mizan/verify`'s contract, so it happens here against
 * the same open snapshot the baseline arm queries. An unresolvable citation is not an error here:
 * the resolver returns an unresolved entry, `verifyAnswer` answers `unverifiable`, and that answer
 * is recorded — which is the honest outcome, because "we could not find that record" is a real
 * result and coercing it into anything else would be inventing a verdict.
 */
const verifyOne = (db: Database, testCase: SystemCase, snapshotHash: string): SystemOutcome => {
  const { resolved } = resolveCitations(db, [testCase.citation])
  const report: VerdictReport = verifyAnswer({ claims: [claimFor(testCase)], evidence: resolved, snapshotHash })
  const claim = report.claims[0]
  if (claim === undefined) {
    // A verifier that returned no verdict for a single claim has failed closed in a way the caller
    // must see, not one this arm may smooth over into a rate.
    throw new Error(`system arm: the verifier returned no verdict for ${testCase.id}`)
  }
  return { caseId: testCase.id, verdict: claim.verdict, reason: claim.reason }
}

/**
 * The whole arm: one `verifyAnswer` call per case, in the order the cases were given.
 *
 * Order is the caller's, never a `Set` or a `Map` iteration, so the outcome list is deterministic
 * and joins to the baseline arm positionally as well as by case id.
 */
export const runSystemArm = (db: Database, cases: readonly SystemCase[], snapshotHash: string): readonly SystemOutcome[] =>
  cases.map((testCase) => verifyOne(db, testCase, snapshotHash))

export * as SystemArm from "./system-arm.ts"
