import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { isErr, isOk } from "@mizan/core"
import { requireRepositoryRoot } from "@mizan/gate"
import { CORPUS_RELATIVE, OPT_IN_LANES, defaultLaneTestPaths, laneOf } from "./ci-lanes.ts"

/**
 * The lane table is an invariant, so it gets a self-test with planted violations.
 *
 * `ci-lanes.ts` replaces `testPaths: ["scripts"]` with a list, and a list is a place a file can be
 * forgotten: `bun test` would then never collect a test that typechecks, gates scan, and looks green.
 * That is the fail-open AGENTS.md section 3 forbids, reached through maintenance rather than through
 * an attacker, which makes it no less a defect.
 *
 * So the table is not trusted. These tests assert it against the filesystem, and each one carries the
 * violation it exists to catch — a lane entry with a typo, a lane entry that names no file, a test
 * that leaked back into the default lane, an exclusion with no stated reason.
 */

const ROOT = (): string => {
  const root = requireRepositoryRoot(import.meta.dir)
  if (isErr(root)) throw new Error(`the test could not locate the repository root: ${root.error}`)
  return root.value
}

const defaultLane = (): readonly string[] => {
  const paths = defaultLaneTestPaths(ROOT())
  if (isErr(paths)) throw new Error(`the default lane could not be computed: ${paths.error}`)
  return paths.value
}

describe("the default lane", () => {
  test("the corpus this repository cannot ship is named here, because it is the reason for a lane", () => {
    // The whole mechanism rests on `data/corpus.db` being absent from a clean clone. If it were
    // committed, the `corpus` lane would be complexity with no defect behind it, and this test is
    // what would say so.
    expect(CORPUS_RELATIVE).toBe("data/corpus.db")
    expect(OPT_IN_LANES.find((lane) => lane.id === "corpus")?.reason).toContain(CORPUS_RELATIVE)
  })

  test("the planted violation fails: an excluded test is not in the default lane", () => {
    // The defect the CR found, restated as an assertion. `scripts/benchmark.corpus.test.ts` measures
    // `data/corpus.db`, so the moment it is collectible by `bun run ci` a clean clone is red again,
    // and nothing else in this repository would notice until a judge ran it.
    for (const lane of OPT_IN_LANES) for (const test of lane.tests) expect(defaultLane()).not.toContain(test)
  })

  test("the lanes are a partition, so a new test file cannot be forgotten", () => {
    // The guard that makes the explicit list safe. Every `scripts/` test file is in exactly one lane,
    // and the default lane is computed by subtraction, so an unlisted file lands in the default lane
    // rather than in no lane. Both directions are asserted because a file in both lanes is the same
    // double-run as a file in neither.
    const excluded = new Set(OPT_IN_LANES.flatMap((lane) => lane.tests))
    const included = new Set(defaultLane())
    expect([...excluded].every((file) => !included.has(file))).toBe(true)
    expect([...included].every((file) => !excluded.has(file))).toBe(true)
    expect(included.size).toBeGreaterThan(0)
  })

  test("a lane entry that names no file is a finding, because a typo would exclude nothing", () => {
    // A misspelled entry is silently harmless: the file it meant to exclude stays in the default lane
    // and CI goes red on a clean clone with an unrelated message. This test is what turns that into a
    // message about the entry.
    for (const lane of OPT_IN_LANES) {
      for (const test of lane.tests) expect(existsSync(`${ROOT()}/${test}`)).toBe(true)
    }
  })

  test("an exclusion with no stated reason is a finding, because an unexplained exclusion is the switch", () => {
    // The sentence is what a reviewer reads to decide whether the exclusion is legitimate, so an empty
    // one is not a documentation nit — it is an exclusion nobody can evaluate.
    for (const lane of OPT_IN_LANES) expect(lane.reason.trim().length).toBeGreaterThan(20)
  })

  test("every entry is a greppable test file under scripts/, so a reader can find them", () => {
    // The alternative rejected in `ci-lanes.ts`: naming the lane by convention instead of by table,
    // which puts tests in files that do not look like tests.
    for (const lane of OPT_IN_LANES) {
      expect(lane.tests.length).toBeGreaterThan(0)
      for (const test of lane.tests) {
        expect(test.startsWith("scripts/")).toBe(true)
        expect(test.endsWith(".test.ts")).toBe(true)
      }
    }
  })

  test("a test file is in at most one lane, so nothing runs twice for being in two", () => {
    for (const lane of OPT_IN_LANES) for (const test of lane.tests) expect(laneOf(test)?.id).toBe(lane.id)
  })

  test("the paths are sorted, so a run collects tests in the same order every time", () => {
    const paths = defaultLane()
    expect([...paths].sort()).toEqual([...paths])
  })

  test("the lane is computed from the filesystem, and reports failure rather than a short list", () => {
    // Fail closed on a scan that cannot enumerate. A directory it could not read is a lane it has not
    // proved corpus-free, and reporting it as "these are the tests" is the switch.
    const missing = defaultLaneTestPaths(`${ROOT()}/no-such-directory`)
    expect(isOk(missing)).toBe(false)
    if (isOk(missing)) return
    expect(missing.error).toContain("could not be read")
  })
})

/**
 * The lane table is only safe while something runs the lanes.
 *
 * ## The defect this asserts away
 *
 * An exclusion with a stated reason still looks like a gate. `scripts/benchmark.corpus.test.ts` — the
 * published benchmark's own correctness test — was in the `corpus` lane, the lane was excluded from
 * `bun run ci`, and `.github/workflows/ci.yml` ran nothing but `bun run ci`. So the most expensive check
 * in the repository was collected by no one, and the reason it was not collected was correct in each
 * individual step: the corpus is gitignored, the test needs it, `bun run ci` must stay corpus-free. Three
 * correct decisions and an uncovered test, which is the shape of every "nobody runs it" defect this
 * repository has had.
 *
 * The assertion is deliberately coarse — a lane id appearing as `bun run ci:<id>` in the workflow — because
 * the thing that must not happen is the lane being orphaned, not the step being spelled a particular way.
 */
describe("every lane is run by something, or the table is only an exclusion", () => {
  const workflow = (): string => readFileSync(join(ROOT(), ".github", "workflows", "ci.yml"), "utf8")

  test("the planted violation fails: an orphan lane is a lane whose tests nobody runs", () => {
    for (const lane of OPT_IN_LANES) expect(workflow()).toContain(`bun run ci:${lane.id}`)
  })

  test("each lane's command exists in the manifest, so the workflow line is not decoration", () => {
    // The workflow spelling and the script it calls are two facts in two files; a lane renamed in the
    // table and not in `package.json` would leave CI invoking a command that no longer exists, which
    // fails as a step error rather than as a message about the lane.
    const manifest = JSON.parse(readFileSync(join(ROOT(), "package.json"), "utf8")) as {
      readonly scripts?: Readonly<Record<string, string>>
    }
    for (const lane of OPT_IN_LANES) expect(manifest.scripts?.[`ci:${lane.id}`]).toBeDefined()
  })

  test("the corpus lane is not run from the default-lane job, so `bun run ci` stays corpus-free", () => {
    // The mirror image, and the reason the `evidence` job is its own job: `bun run ci` must keep passing
    // on a checkout that has never run `bun run ingest`, so no corpus-dependent command may join the job
    // that runs it. Asserted on the `gate` job specifically rather than on the file, because a workflow
    // that mentions `ci:corpus` *somewhere* is exactly what this fix looks like and what would quietly
    // reintroduce the defect.
    const gate = jobNamed(workflow(), "gate")
    expect(gate).toContain("run: bun run ci\n")
    expect(gate).not.toContain("bun run ci:")
  })
})

/** The body of one job in `ci.yml`, so an assertion about a job is not an assertion about the file. */
function jobNamed(workflow: string, name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`)
  if (start < 0) throw new Error(`no job named ${name} in the workflow`)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z-]*:\n/)
  return next < 0 ? rest : rest.slice(0, next)
}
