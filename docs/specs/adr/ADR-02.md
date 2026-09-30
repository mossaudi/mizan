# ADR-02 — Effect `Schema` is adopted; the Effect runtime is not

- **Status:** Accepted

## Context

Decoding untrusted input is unavoidable: model output, committed JSON artefacts and HTTP responses
all cross a trust boundary and must be checked before any code touches them. The repository
therefore depends on `effect@4.0.0-beta.83` — a **beta**, on the critical path, where a patch
release can move an API. Adopting the library wholesale would put `Effect`, `Layer` and fiber types
into every package, so an upstream shape change becomes a repository-wide edit.

## Decision

1. Adopt the high-value, low-risk part only: `Schema`, for decoding at boundaries.
2. Bind `Schema.decodeUnknownSync` in **exactly one module** — `packages/mizan-core/src/schema/decode.ts`
   — and reach it everywhere else through `decodeOrFail` / `decodeSync`. The isolation gate asserts
   the beta's decode symbol is bound nowhere else in the tree.
3. Hand-roll `Result<T, E>` (`packages/mizan-core/src/result.ts`) as the only failure channel that
   crosses a package boundary, instead of exposing the Effect runtime.

## Rationale

- **Blast radius.** If the beta moves in a patch release, one adapter moves with it. That is the
  whole of the risk, and it is the reason the confinement is a gate rather than a convention.
- **Compile-time obligation.** A tagged union forces the caller to handle failure in the type
  system, which is what makes "degrade to an honest state" a compile-time obligation rather than a
  review comment (AGENTS.md sections 2 and 3).
- **Determinism.** The verdict path runs no fibers, no scheduler and no clock: same snapshot, same
  input, same verdicts, always. A runtime would put a second source of nondeterminism beside the
  one the project already works to remove.

## Consequences

- Nothing outside `decode.ts` may call the beta's decode function; a new call site fails the
  isolation gate rather than a review.
- A decode failure becomes a `Result` carrying the schema name and the first human-readable issue —
  never the offending payload, which is untrusted and may be enormous.
- No `any` is introduced to placate a beta signature; unknown input is narrowed by a schema.
- Upgrading `effect` is a one-file change plus a test run, which is the point of the confinement.
