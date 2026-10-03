/**
 * `@mizan/bench` — the unified benchmark's arithmetic.
 *
 * ## What lives here, and what deliberately does not
 *
 * The types (`report.ts`) say what each metric counts. The functions (`build.ts`) produce them.
 * Neither reads a corpus, a clock, or a random number: the caller resolves citations and runs
 * `@mizan/verify`, then hands the verdicts in. That is what makes the whole package testable against
 * outcomes a fixture chose — including a fabricated case that came back `verified`, which no
 * working verifier will produce on demand and which is exactly the row the report must still be
 * able to print.
 *
 * ## The one dependency direction that matters
 *
 * `@mizan/verify` is a dependency, and `@mizan/verify` does not depend on this. The harness scores
 * the verifier; it never runs it, never re-decides a claim, and never constructs a verdict. Gate
 * G-1 still governs `@mizan/verify`'s own manifest, and nothing here widens it.
 */

export {
  CASE_SCORINGS,
  FALSE_VERDICT,
  casePassed,
  percentOf,
  rateOf,
  scoringOf,
  type BenchCase,
  type BenchmarkReport,
  type CaseOutcome,
  type CaseResult,
  type CaseScoring,
  type Rate,
  type SuiteMetrics,
  type SuiteResult,
} from "./report.ts"

export {
  REPORT_SCHEMA_VERSION,
  buildReport,
  buildSuite,
  failedSuite,
  failingCases,
  renderReport,
  type FailingCase,
} from "./build.ts"

export * as Bench from "./build.ts"
