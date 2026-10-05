/**
 * The bounds every consumer of `normalizeForMatch` must apply, in exactly one place.
 *
 * ## Why these live in core and not beside either consumer
 *
 * Two packages need the same two numbers for the same reason, and each had declared its own copy:
 * `@mizan/suggest` (which bounds the quote it folds and the record text it scans) and
 * `@mizan/verify`'s display-only `longest-run` diagnostic (which bounds the same two strings). Neither
 * package may depend on the other — `@mizan/verify` declares exactly one dependency, and that one is
 * this package (AGENTS.md §9) — so the shared owner cannot be either of them.
 *
 * A duplicated constant is not a style problem. It is two answers to one question about how much text
 * this product is willing to look at, and the failure is silent: raise one and the other keeps the old
 * value, and the two disagree about what was compared while every test on each side still passes. This
 * is the same class of defect as a duplicated fold table or a duplicated digest rule, and it is why
 * AGENTS.md §17 requires one module per fact.
 *
 * ## Why a bound at all
 *
 * Both numbers exist so a fold is bounded *before* anything quadratic is done with it. The
 * quote bound caps the work per row of the scan — a 65,536-character quote would multiply the
 * native-search order by sixteen — and the record bound caps the single scan itself. Neither is a
 * correctness limit: both are a denial-of-service limit on untrusted input, which is why they are
 * stated as constants a reader can check rather than derived from configuration.
 */

/** The most folded quote characters any consumer will look at. */
export const MAX_QUOTE_CHARS = 4_096

/** The most folded record characters any consumer will look at. */
export const MAX_RECORD_CHARS = 65_536

export * as Bounds from "./bounds.ts"