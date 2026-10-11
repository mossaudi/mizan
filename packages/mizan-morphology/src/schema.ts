import { Schema } from "effect"
import { ArabicRoot, ArabicStem, ArabicLemma } from "@mizan/core"

/**
 * Morphology schemas for root/stem/lemma extraction results.
 * These are DISPLAY-ONLY schemas. The verifier never imports this package.
 */

export const RootExtractionResult = Schema.Struct({
  /** The extracted root, or null if extraction failed. */
  root: Schema.NullOr(ArabicRoot),
  /** The pattern stemmer's candidate. */
  patternCandidate: Schema.NullOr(Schema.String),
  /** Whether the dictionary stemmer validated the candidate. */
  dictionaryMatch: Schema.Boolean,
  /** Whether both stemmers agreed. */
  agreed: Schema.Boolean,
})
export type RootExtractionResult = Schema.Schema.Type<typeof RootExtractionResult>

export const StemExtractionResult = Schema.Struct({
  /** The extracted stem, or null if extraction failed. */
  stem: Schema.NullOr(ArabicStem),
})
export type StemExtractionResult = Schema.Schema.Type<typeof StemExtractionResult>

export const LemmaExtractionResult = Schema.Struct({
  /** The extracted lemma (citation form), or null if extraction failed. */
  lemma: Schema.NullOr(ArabicLemma),
})
export type LemmaExtractionResult = Schema.Schema.Type<typeof LemmaExtractionResult>

export const TextMorphologyAnalysis = Schema.Struct({
  /** Roots for each word position. */
  roots: Schema.Array(Schema.NullOr(ArabicRoot)),
  /** Stems for each word position. */
  stems: Schema.Array(Schema.NullOr(ArabicStem)),
  /** Lemmas for each word position. */
  lemmas: Schema.Array(Schema.NullOr(ArabicLemma)),
  /** Dual-stemmer cross-check statistics. */
  dualStemmerStats: Schema.Struct({
    agreed: Schema.Number,
    disagreed: Schema.Number,
    total: Schema.Number,
  }),
})
export type TextMorphologyAnalysis = Schema.Schema.Type<typeof TextMorphologyAnalysis>

export const RootCoverageArtefact = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedBy: Schema.String,
  corpusFingerprint: Schema.String,
  declaredRootCount: Schema.Number,
  rootsFound: Schema.Number,
  coveragePercent: Schema.String,
  dualStemmer: Schema.Struct({
    totalWords: Schema.Number,
    agreed: Schema.Number,
    disagreed: Schema.Number,
    agreementRate: Schema.String,
  }),
  conditions: Schema.Struct({
    corpus: Schema.String,
    stemmerVersion: Schema.String,
    dictionaryVersion: Schema.String,
  }),
  note: Schema.String,
})
export type RootCoverageArtefact = Schema.Schema.Type<typeof RootCoverageArtefact>

export * as MorphologySchema from "./schema.ts"