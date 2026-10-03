/**
 * The red-team fixtures, re-exported from `src/`.
 *
 * This file used to DECLARE the fixtures, and that was the wrong place for a fact two consumers
 * need: `scripts/benchmark.ts` reached into this directory to read the taxonomy, which made the
 * harness's definition of "the 14 HALLMARK types" invisible to `@mizan/verify`'s dependency list and
 * killable by a fixture rename rather than by a contract change. The declaration now lives in
 * `src/red-team.ts` and is exported from the package index.
 *
 * The re-export is kept rather than deleted because the two Sprint 1 tests that import this path
 * are not this delivery's to churn, and there is exactly one binding either way (AGENTS.md section
 * 17). An import of the same names from `../src/index.ts` would also work and would make the move
 * observable; what would not work is a second copy of the table here.
 */
export {
  HALLMARK_TYPES,
  RED_TEAM_FIXTURES,
  type DifficultyTier,
  type HallmarkType,
  type RedTeamFixture,
} from "../src/red-team.ts"

export * as RedTeam from "../src/red-team.ts"