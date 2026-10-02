import { Schema } from "effect"

/**
 * IETF VRO-aligned attestation schema.
 *
 * ## What is IETF VRO
 *
 * The IETF draft-hillier-certisyn (Verifiable Reference Ontology) defines a framework
 * for verifiable attestations with 8 control areas and 3 maturity levels. This module
 * maps mizan's attestation.json to that framework.
 *
 * ## The 8 control areas
 *
 * 1. **Identity** — What is being attested (the corpus snapshot)
 * 2. **Provenance** — Where the corpus came from (sources, ingest chain)
 * 3. **Integrity** — Has the corpus been modified (snapshot hash, record count)
 * 4. **Determinism** — Is the verification deterministic (100x byte-identical gate)
 * 5. **Licensing** — What are the usage rights (licence classes, attribution)
 * 6. **Coverage** — What does the corpus contain (collection counts, record count)
 * 7. **Degradation** — How does the system fail (honest degradation matrix)
 * 8. **Auditability** — Can a judge verify the claims (chain verify, run ledger)
 *
 * ## The 3 maturity levels
 *
 * - **Level 1 (Basic)** — Attestation exists and is machine-readable
 * - **Level 2 (Verifiable)** — Attestation is cryptographically verifiable
 * - **Level 3 (Auditable)** — Attestation is independently auditable by a judge
 *
 * mizan self-assesses at Level 3: the attestation is committed, the chain is verifiable
 * by a judge-runnable script, and the run ledger is independently auditable.
 */

/** The VRO control areas. */
export const VROControlArea = Schema.Union([
  Schema.Literal("identity"),
  Schema.Literal("provenance"),
  Schema.Literal("integrity"),
  Schema.Literal("determinism"),
  Schema.Literal("licensing"),
  Schema.Literal("coverage"),
  Schema.Literal("degradation"),
  Schema.Literal("auditability"),
])
export type VROControlArea = Schema.Schema.Type<typeof VROControlArea>

/** The VRO maturity levels. */
export const VROMaturityLevel = Schema.Union([
  Schema.Literal(1),
  Schema.Literal(2),
  Schema.Literal(3),
])
export type VROMaturityLevel = Schema.Schema.Type<typeof VROMaturityLevel>

/** Evidence for the determinism gate. */
export const DeterminismEvidence = Schema.Struct({
  /** The gate name. */
  gateName: Schema.String,
  /** Whether the gate passed. */
  passed: Schema.Boolean,
  /** Number of runs in the determinism check. */
  runCount: Schema.Number,
  /** Whether all runs were byte-identical. */
  byteIdentical: Schema.Boolean,
})
export type DeterminismEvidence = Schema.Schema.Type<typeof DeterminismEvidence>

/** One VRO control area with its concrete fields. */
export const ControlAreaMapping = Schema.Struct({
  /** The control area name. */
  area: VROControlArea,
  /** The concrete fields in attestation.json that satisfy this control area. */
  fields: Schema.Array(Schema.String),
  /** How mizan satisfies this control area. */
  description: Schema.String,
})
export type ControlAreaMapping = Schema.Schema.Type<typeof ControlAreaMapping>

/**
 * The VRO-aligned attestation schema.
 *
 * This extends the base `Attestation` type with VRO-specific fields. The schema is
 * used to validate attestation.json and to generate the VRO-aligned output.
 */
export const VROAttestation = Schema.Struct({
  /** Schema version. */
  schemaVersion: Schema.String,
  /** VRO maturity level (1, 2, or 3). */
  maturityLevel: VROMaturityLevel,
  /** The 8 VRO control areas with their concrete field mappings. */
  controlAreas: Schema.Array(ControlAreaMapping),
  /** The corpus snapshot SHA-256 hash. */
  snapshotHash: Schema.String,
  /** The number of records in the corpus. */
  recordCount: Schema.Number,
  /** Evidence of the determinism gate. */
  determinismEvidence: DeterminismEvidence,
  /** The corpus snapshot hash (redundant with snapshotHash for VRO compliance). */
  corpusSnapshotHash: Schema.String,
})
export type VROAttestation = Schema.Schema.Type<typeof VROAttestation>

/** The VRO schema version. */
export const VRO_SCHEMA_VERSION = "1"

/**
 * The 8 VRO control area mappings for mizan.
 *
 * Each control area is mapped to concrete fields in attestation.json. This is the
 * single source of truth for the VRO alignment.
 */
export const VRO_CONTROL_AREA_MAPPINGS: readonly ControlAreaMapping[] = [
  {
    area: "identity",
    fields: ["snapshotHash", "recordCount"],
    description: "The corpus is identified by its snapshot hash and record count.",
  },
  {
    area: "provenance",
    fields: ["sources", "chainHead", "chainLength"],
    description: "The corpus provenance is recorded in the ingest chain and source registry.",
  },
  {
    area: "integrity",
    fields: ["snapshotHash", "recordCount", "quarantinedRows"],
    description: "The corpus integrity is verified by comparing the snapshot hash and record count.",
  },
  {
    area: "determinism",
    fields: ["determinismEvidence"],
    description: "The verification is deterministic: 100x byte-identical output is enforced by gate G-6.",
  },
  {
    area: "licensing",
    fields: ["sources"],
    description: "Each source carries its licence class and attribution.",
  },
  {
    area: "coverage",
    fields: ["collectionCounts", "recordCount"],
    description: "The corpus coverage is described by collection counts and total record count.",
  },
  {
    area: "degradation",
    fields: ["quarantinedRows"],
    description: "The honest degradation matrix is documented in docs/degradation-matrix.md. The quarantinedRows field records rows that were fetched but not served.",
  },
  {
    area: "auditability",
    fields: ["chainHead", "chainLength"],
    description: "The run ledger is independently auditable by the judge-runnable chain verify script.",
  },
]

export * as AttestationSchema from "./attestation-schema.ts"
