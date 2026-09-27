import { Answer, sha256Hex, type Result } from "@mizan/core"
import { decodeAnswer, providerFailure, type GenerationRequest, type GenerationResult, type Provider, type RetrievedContext } from "./provider.ts"

/**
 * The precomputed transcript provider.
 *
 * ## Why this exists at all
 *
 * A demo that requires a live API key dies in the room. This provider replays a committed,
 * reviewed transcript so the product can be shown — and it is honest about being a replay at
 * three independent points, which is the whole design:
 *
 *  1. **The type.** `kind: "precomputed"`, so it cannot be passed to anything expecting a live
 *     generation without a visible mismatch.
 *  2. **The payload.** Every transcript entry carries `transcript: "precomputed"`, and
 *     `decodeAnswer` REFUSES a mismatch. A transcript file edited to claim `"live"` is
 *     rejected, not honoured.
 *  3. **The run trace.** `TranscriptKind` is a field on the `RunTrace`, so every ledger entry
 *     says which runs were replays. A judge can tell exactly which runs were live.
 *
 * ## The lookup is by question HASH, and a miss is an honest failure
 *
 * A transcript is matched on `sha256(normalize(question))`, never on the question text, so the
 * transcript file itself contains no questions and the ledger can contain no question either
 * (AGENTS.md section 13). A question with no entry returns `provider_unavailable` — which
 * renders as **model unavailable**. That is the correct surface, and it is the one the
 * constitution requires: not a guess, not the nearest transcript entry, and never a
 * fabricated answer presented as if the model had produced it.
 */

export type TranscriptEntry = {
  /** Which model call this entry replays. Both calls share a question hash. */
  readonly stage: "decompose" | "answer"
  readonly questionHash: string
  readonly answer: Answer
}

export type TranscriptFile = {
  readonly entries: readonly TranscriptEntry[]
}

/** The question hash a transcript must contain for this question. */
export const questionKey = (question: string): string => sha256Hex(question)

const normaliseHash = (hash: string): string => hash.trim().toLowerCase()

/**
 * The lookup key: the stage AND the question hash.
 *
 * Stage is part of the key because the spine makes two calls with the same question, and a
 * transcript keyed on the question alone would let the decomposition entry shadow the answer
 * entry. The pair is unambiguous and the failure mode — replaying a list of search queries as
 * if it were an answer — is loud rather than subtle.
 */
export const entryKey = (stage: TranscriptEntry["stage"], questionHash: string): string => `${stage}:${normaliseHash(questionHash)}`

/** A map keyed by stage and normalised hash, built once. */
const index = (file: TranscriptFile): ReadonlyMap<string, Answer> => {
  const entries = new Map<string, Answer>()
  for (const entry of file.entries) entries.set(entryKey(entry.stage, entry.questionHash), entry.answer)
  return entries
}

/**
 * Build the provider. Pure, and the returned object holds no clock and no I/O, so a test can
 * assert the entire degradation surface without a network or a fixture on disk.
 */
export const transcriptProvider = (file: TranscriptFile, name = "precomputed-transcript"): Provider => {
  const byKey = index(file)
  return {
    name,
    model: "transcript-v1",
    kind: "precomputed",
    generate: async (request: GenerationRequest): Promise<GenerationResult> => {
      const key = entryKey(request.stage, questionKey(request.question))
      const answer = byKey.get(key)
      if (answer === undefined) {
        return providerFailure(
          "provider_unavailable",
          `no transcript entry for the "${request.stage}" call on question hash ${questionKey(request.question).slice(0, 16)}…; ` +
            `the transcript has ${file.entries.length} entries and this call is not one of them`,
        )
      }
      // Re-decoded on every replay rather than returned as-is: a transcript file is data on
      // disk, and re-validating it at read time means a hand-edited file is caught here
      // instead of at the verifier.
      return decodeAnswer(answer, name, "transcript-v1", "precomputed")
    },
  }
}

/** Build a transcript file from a plain array, rejecting a non-array early. */
export const transcriptOf = (entries: readonly TranscriptEntry[]): Result<TranscriptFile, string> =>
  Array.isArray(entries) ? { ok: true, value: { entries } } : { ok: false, error: "transcript must be an array" }

/** How many contexts the spine retrieved, for the trace. Never the text. */
export const contextCount = (contexts: readonly RetrievedContext[]): number => contexts.length

export * as Transcript from "./transcript.ts"
