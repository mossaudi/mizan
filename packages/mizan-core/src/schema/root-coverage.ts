import { Schema } from "effect"

/**
 * Root-coverage measurement artefact schema.
 *
 * This artefact documents the dual-stemmer (CAMeL + Wensinck) cross-check
 * over the Quranic corpus. It is a MEASUREMENT ARTEFACT ONLY — no index
 * is shipped for production use (indexShipped: false).
 *
 * The dual-stemmer delta of 42-50% is explicitly documented as a limitation.
 * The 131-entry alias map from Itqan is noted as the gap-closing mechanism
 * that achieves 96.3% coverage in their production system.
 *
 * This schema enforces that the artefact honestly reports its conditions
 * and does not claim production readiness.
 */

export const RootCoverageArtefact = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  coveragePercent: Schema.Number,
  totalMappings: Schema.Number,
  aliasMapEntries: Schema.Literal(131),
  stemmerDelta: Schema.String,
  indexShipped: Schema.Literal(false),
  methodologicalNotes: Schema.String,
  conditions: Schema.Record(Schema.String, Schema.Unknown),
  generatedAt: Schema.String,
  gitCommit: Schema.String,
})
export type RootCoverageArtefact = Schema.Schema.Type<typeof RootCoverageArtefact>

export * as RootCoverage from "./root-coverage.ts"