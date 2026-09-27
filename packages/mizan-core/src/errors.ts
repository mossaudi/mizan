/**
 * Every failure mode the system can produce, as a tagged union.
 *
 * The tags are the vocabulary the degradation matrix in AGENTS.md section 16 is
 * written against. A new failure mode must be added here with an honest surface,
 * not invented at a call site as a bare string.
 */

// ── corpus ────────────────────────────────────────────────────────────────────

export type CorpusError =
  /** Content hash or record count no longer matches `attestation.json`. Fails CLOSED. */
  | { readonly _tag: "attestation_mismatch"; readonly source: string; readonly field: string; readonly expected: string; readonly actual: string }
  /** A pinned source returned fewer records than its published baseline. Fails the build. */
  | { readonly _tag: "count_below_baseline"; readonly source: string; readonly expected: number; readonly actual: number }
  /** A registry row has an empty licence field. Gate G-5 would also catch this. */
  | { readonly _tag: "license_field_empty"; readonly source: string; readonly field: string; readonly count: number }
  /** Rows were quarantined for internal inconsistency (never for absence). */
  | { readonly _tag: "quarantined_rows"; readonly source: string; readonly count: number; readonly samples: readonly string[] }
  /** A pinned raw source file is absent; run `bun run fetch`. */
  | { readonly _tag: "raw_source_missing"; readonly source: string; readonly path: string }
  /** A source could not be parsed. `detail` carries the reason, never the payload. */
  | { readonly _tag: "parse_failed"; readonly source: string; readonly detail: string }
  /** The snapshot database does not exist. */
  | { readonly _tag: "snapshot_missing"; readonly path: string }
  /** The snapshot handle was closed; callers must not use it. */
  | { readonly _tag: "snapshot_closed"; readonly path: string }
  /** A URL is not on the allowlist. A10 / R13. */
  | { readonly _tag: "url_not_allowlisted"; readonly source: string; readonly host: string }

// ── retrieval ─────────────────────────────────────────────────────────────────

export type RetrievalError =
  /** An empty or whitespace-only query. Rejected, never treated as match-everything. */
  | { readonly _tag: "empty_query" }
  /** The 2s budget elapsed. One retry is permitted at the caller. */
  | { readonly _tag: "budget_exceeded"; readonly elapsedMs: number; readonly budgetMs: number }
  /** A ranker is down. Degrades to the remaining rankers with an explicit marker. */
  | { readonly _tag: "backend_unavailable"; readonly backend: string; readonly detail: string }
  /** A10 / R13: a non-allowlisted host was requested. */
  | { readonly _tag: "allowlist_denied"; readonly host: string }
  /** Retrieval needs a snapshot and none is open. */
  | { readonly _tag: "snapshot_unavailable"; readonly detail: string }
  /** The query is longer than the input cap. */
  | { readonly _tag: "query_too_long"; readonly length: number; readonly cap: number }

// ── verify ────────────────────────────────────────────────────────────────────

export type VerifyError =
  /** The 10s verification budget elapsed. Degrades EVERY claim to `unverifiable`. */
  | { readonly _tag: "budget_exceeded"; readonly elapsedMs: number; readonly budgetMs: number }
  /** The input failed contract decoding. Degrades to `unverifiable` everywhere, never a crash. */
  | { readonly _tag: "malformed_input"; readonly detail: string }

// ── provider ──────────────────────────────────────────────────────────────────

export type ProviderError =
  /** No provider is configured. Say "model unavailable"; never substitute a mock. */
  | { readonly _tag: "not_configured"; readonly detail: string }
  /** Network failure, 5xx, or an empty completion. */
  | { readonly _tag: "unavailable"; readonly provider: string; readonly detail: string }
  /** The 30s generation budget elapsed. An honest failure, not a partial answer. */
  | { readonly _tag: "timeout"; readonly provider: string; readonly elapsedMs: number; readonly budgetMs: number }
  /** The completion did not satisfy the boundary schema. */
  | { readonly _tag: "malformed_output"; readonly provider: string; readonly detail: string }
  /** A10 / R13: the configured base URL is not allowlisted. */
  | { readonly _tag: "not_allowlisted"; readonly host: string }
  /** A model was requested that has no web access. Disclosed, never implied. */

// ── provenance ────────────────────────────────────────────────────────────────

export type ProvenanceError =
  /** The ledger could not be written. The run is marked untrusted — FAIL CLOSED. */
  | { readonly _tag: "append_failed"; readonly path: string; readonly detail: string }
  /** `entryHash` or `prevHash` does not chain. `index` is the exact broken entry. */
  | { readonly _tag: "chain_broken"; readonly index: number; readonly detail: string }
  /** The final line is not valid JSON. Loud failure, never silent truncation. */
  | { readonly _tag: "truncated_tail"; readonly line: number; readonly detail: string }

// ── gate ──────────────────────────────────────────────────────────────────────

export type GateError =
  /** Confidence is missing or malformed. Blocks; never defaults high. */
  | { readonly _tag: "missing_confidence"; readonly detail: string }

export type MizanError = CorpusError | RetrievalError | VerifyError | ProviderError | ProvenanceError | GateError

export type ErrorOfKind<T extends MizanError["_tag"]> = Extract<MizanError, { readonly _tag: T }>

export * as Errors from "./errors.ts"
