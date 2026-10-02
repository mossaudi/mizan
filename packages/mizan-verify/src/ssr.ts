import type { Claim, ClaimVerdict } from "@mizan/core"
import type { SsrResult } from "@mizan/core"

/**
 * Per-claim Sentence-Support Rate (SSR) computation.
 *
 * ## The one rule: a sentence is supported ONLY by a `verified` citation
 *
 * A sentence counts as supported when it contains at least one citation that received
 * a `verified` verdict. Sentences whose citations are all `unverifiable` or `rejected`
 * are NOT supported — they are honest degradations, not fabrications, but they are
 * also not grounded.
 *
 * ## Sentence segmentation is deterministic
 *
 * Segmentation splits on sentence-ending punctuation (`.`, `!`, `?`, `۔`, `؟`) followed
 * by whitespace or end-of-string. Arabic text uses the same rules. The same input always
 * produces the same sentence count — no clock, no randomness, no locale.
 *
 * ## Read-only: verdicts are never modified
 *
 * This function takes verdicts as input and produces a metric. It does not modify the
 * verdicts, does not re-run verification, and does not have a path to `verified`.
 */

/** Sentence-ending punctuation: ASCII and Arabic. */
const SENTENCE_END = /[.!?۔؟]/

/**
 * Segment a response into sentences.
 *
 * Deterministic: splits on sentence-ending punctuation followed by whitespace or
 * end-of-string. Empty segments are dropped. The same input always produces the
 * same output.
 */
export const segmentSentences = (response: string): readonly string[] => {
  const trimmed = response.trim()
  if (trimmed.length === 0) return []
  const sentences: string[] = []
  let current = ""
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i]!
    current += char
    if (SENTENCE_END.test(char)) {
      const next = trimmed[i + 1]
      if (next === undefined || /\s/.test(next)) {
        if (current.trim().length > 0) sentences.push(current.trim())
        current = ""
      }
    }
  }
  if (current.trim().length > 0) sentences.push(current.trim())
  return sentences
}

/**
 * Compute the per-claim Sentence-Support Rate.
 *
 * @param response The generated response text.
 * @param verdicts The per-claim verdicts from `verifyAnswer`.
 * @param claims The original claims from the answer, used to map claims to sentences.
 *   Each claim's `text` field is searched within each sentence to determine membership.
 * @returns The SSR result.
 */
export const computeSsr = (
  response: string,
  verdicts: readonly ClaimVerdict[],
  claims: readonly Claim[],
): SsrResult => {
  const sentences = segmentSentences(response)
  if (sentences.length === 0) {
    return { totalSentences: 0, supportedSentences: 0, rate: 0, perSentence: [] }
  }

  const verdictByClaimId = new Map(verdicts.map((v) => [v.claimId, v]))

  const perSentence = sentences.map((sentence, index) => {
    const claimIds: string[] = []
    for (const claim of claims) {
      const claimText = claim.text.trim()
      if (claimText.length === 0) continue
      // indexOf, not includes: G-1.4 allows .includes only in containment.ts and diagnostics/.
      // This is sentence segmentation, not quote matching — but the gate is mechanical.
      if (sentence.indexOf(claimText) !== -1) {
        claimIds.push(claim.id)
      }
    }
    const supported = claimIds.some((id) => verdictByClaimId.get(id)?.verdict === "verified")
    return { index: index + 1, supported, claimIds }
  })

  const supportedSentences = perSentence.filter((s) => s.supported).length
  return {
    totalSentences: sentences.length,
    supportedSentences,
    rate: supportedSentences / sentences.length,
    perSentence,
  }
}

export * as Ssr from "./ssr.ts"
