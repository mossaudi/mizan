import { isErr, err, ok, type Result } from "@mizan/core"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Which `scripts/` tests `bun run ci` runs, and the ones it deliberately does not.
 *
 * ## What this is for
 *
 * `bun run ci` is the command `accept:customer` runs as its corpus-free step, so every test it
 * collects has to pass on a checkout that has never run `bun run ingest`. It used to collect
 * `scripts/benchmark.test.ts`, which measured the committed corpus and therefore needed
 * `data/corpus.db` — a gitignored 27,234-record file no fresh clone has. The result was the clean
 * clone this repository ships to a judge failing its own acceptance, with the reason printed as a
 * benchmark failure rather than as a missing corpus.
 *
 * The failure is not that the benchmark needs a corpus. It does, and that test is the published
 * run: a benchmark whose own correctness test is skipped reports a green tick for nothing. The
 * failure is that the published run sat in the *default* lane, where it could only ever be
 * optional.
 *
 * ## Why a table with a reason per lane, rather than a filename convention
 *
 * The cheaper shape is to name an excluded file something `bun test` does not discover, and then
 * `testPaths: ["scripts"]` needs no knowledge of lanes at all. It was rejected because the
 * repository's own rule is that an invariant nobody can see is not enforced: a test file that does
 * not look like a test file is a test nobody runs when they go looking for tests, and the way that
 * goes wrong is a rename to `*.test.ts`, which silently re-enters the default lane.
 *
 * Naming the exclusion here puts it in one readable place, and every lane carries the sentence
 * explaining why it is not in the default run — which is the sentence a reviewer needs to decide
 * whether the exclusion is legitimate. `ci-lanes.test.ts` asserts the table is a partition of the
 * discovered files, so a new `scripts/*.test.ts` that nobody added to either list fails CI rather
 * than going unrun.
 */

/** The corpus a corpus-dependent test needs. Gitignored, so absent on every fresh clone. */
export const CORPUS_RELATIVE = "data/corpus.db"

/**
 * Tests that `bun run ci` does not collect, each with the reason it is not collected.
 *
 * `id` is the command that runs the lane, so a reader who wants the behaviour runs it rather than
 * reading the table to find out it exists. `reason` is load-bearing: an exclusion with no stated
 * reason is the fail-open shape this file was written to prevent, so `ci-lanes.test.ts` fails on an
 * empty one.
 */
export type OptInLane = {
  readonly id: string
  readonly reason: string
  readonly tests: readonly string[]
}

export const OPT_IN_LANES: readonly OptInLane[] = [
  {
    id: "corpus",
    reason: `every test here measures ${CORPUS_RELATIVE}, which is gitignored and therefore absent from a clean clone — the same absence \`bun run ci\` has to survive for \`accept:customer\``,
    tests: ["scripts/benchmark.corpus.test.ts", "scripts/article-determinism.corpus.test.ts"],
  },
  {
    id: "clean-clone",
    reason: "this test runs the whole acceptance table, and that table's first step is `bun run ci`, so a lane `bun run ci` collects would recurse into itself",
    tests: ["scripts/accept-customer.clean-clone.test.ts"],
  },
]

/** Bun's test-file shapes: `*.test.ts`, `*_test.ts`, `*.spec.ts`. Kept literal, per AGENTS.md section 17. */
const TEST_FILE = /(\.test|_test|\.spec)\.[cm]?[jt]sx?$/

/**
 * `\` on Windows, `/` everywhere else. Bun's recursive `readdirSync` uses the platform separator.
 *
 * Exported because the lane table is keyed in POSIX spelling and a test that compared against
 * `import.meta.path` verbatim would look for an entry that cannot exist on Windows, then report the
 * corpus lane as undeclared. Two spellings of one path is the defect `ci-lanes.test.ts` exists to
 * catch, so the spelling is one declaration and both callers import it.
 */
export const posix = (path: string): string => path.replace(/\\/g, "/")

/** The lane a test file was excluded into, or `null` when the default lane runs it. */
export const laneOf = (testFile: string): OptInLane | null =>
  OPT_IN_LANES.find((lane) => lane.tests.includes(testFile)) ?? null

/** Every excluded test, from every lane. */
const excludedTests = (): ReadonlySet<string> => new Set(OPT_IN_LANES.flatMap((lane) => lane.tests))

/**
 * Every test file under `scripts/`, relative to the repository root and sorted.
 *
 * Sorted because the list becomes a `bun test` argument list, and a run that collects tests in
 * filesystem order is a run whose output reorders when a file is touched for an unrelated reason.
 */
const discoveredTestFiles = (root: string): Result<readonly string[], string> => {
  const scriptsDir = join(root, "scripts")
  let entries: string[]
  try {
    entries = readdirSync(scriptsDir, { recursive: true, encoding: "utf8" })
  } catch {
    return err(`the scripts directory could not be read, so no test file can be claimed corpus-free: ${scriptsDir}`)
  }
  const files: string[] = []
  for (const entry of entries) {
    const relative = posix(join("scripts", entry))
    if (!TEST_FILE.test(relative)) continue
    if (!statSync(join(root, relative)).isFile()) continue
    files.push(relative)
  }
  return ok([...files].sort())
}

/**
 * The `bun test` arguments for the default lane.
 *
 * Fails closed rather than returning a short list: a scan that cannot enumerate `scripts/` has not
 * proved the default lane is corpus-free, and a lane that quietly runs three of its four files is
 * the same switch as one that runs none.
 *
 * Excluded paths are subtracted by exact match. A lane entry that names no discovered file is left
 * to `ci-lanes.test.ts` to catch — this function cannot tell a typo from an intentional deletion,
 * and guessing which would be a claim about a file it did not read.
 */
export const defaultLaneTestPaths = (root: string): Result<readonly string[], string> => {
  const discovered = discoveredTestFiles(root)
  if (isErr(discovered)) return discovered
  const excluded = excludedTests()
  return ok(discovered.value.filter((file) => !excluded.has(file)))
}

export * as CiLanes from "./ci-lanes.ts"
