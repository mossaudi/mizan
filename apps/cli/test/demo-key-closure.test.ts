import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { stripCommentsOnly } from "@mizan/gate"
import { ROOT } from "./committed-ledger.ts"
import { boundedExit, SUBPROCESS_TIMEOUT_MS } from "./subprocess-budget.ts"

/**
 * MIZ-104's security acceptance, in the only form that survives the next edit.
 *
 * ## The requirement, and why a behaviour test is not it
 *
 * MIZ-104: *"The demo must not require, prompt for, or echo a secret. If a key happens to be
 * present, the demo still replays the committed transcript and says so."* R-A8 makes it
 * mechanical: *"a test asserts the demo's import closure contains no `provider-config.ts` and no
 * `MIZAN_LLM_API_KEY`."*
 *
 * The behaviour half — run the demo with a key set, watch it succeed — is checked below and is
 * necessary. It is not sufficient, because it describes today. `apps/cli/src/demo.ts` imported
 * `readTranscript` from `./provider-config.ts` while this file was written: it read no key, called
 * no provider, and the demo worked perfectly with a key in the environment. A behaviour test alone
 * would have been green over exactly the arrangement R-A8 names as the defect, and green for ever
 * after, because nothing would distinguish "cannot reach the key" from "chose not to use it".
 *
 * So the assertion is about REACH. The demo's closure is walked, and `provider-config.ts` — the one
 * module in `apps/cli` that reads `process.env` and that names `MIZAN_LLM_API_KEY` — must not be in
 * it. An edit that adds that import is red before the key is ever read, which is the property the
 * brief asks for and the one that cannot be reviewed away by reading a comment.
 *
 * ## Comments are stripped, and that is load-bearing
 *
 * Every module in the closure now *discusses* `process.env` and `MIZAN_LLM_API_KEY` in its header,
 * because explaining a ban requires naming it. A substring search over raw source would therefore
 * fail on the documentation of the property while a violation hidden inside a string literal sailed
 * past. `stripCommentsOnly` comes from `@mizan/gate` and is the same helper `benchmark.test.ts`
 * uses for its import guard, so the two agree on what "code" means — and the planted fixtures below
 * assert that a comment is NOT a reach, which is the other half of that agreement.
 *
 * ## The walker is parameterised over its reader
 *
 * `relativeClosure` takes a `read` callback rather than reaching for the filesystem itself, so the
 * planted-violation fixtures live in memory. A guard proved only against real repository files needs
 * a real repository defect to test, which is the AGENTS.md section 14 problem: a self-test that
 * cannot be watched failing has not been shown to fail. Nothing here writes into the tree.
 */

const DEMO_ENTRY = join(ROOT, "apps", "cli", "src", "demo.ts")

/** Every relative module specifier a file reaches, by any syntax. */
const relativeSpecifiers = (source: string): readonly string[] =>
  [
    ...stripCommentsOnly(source).matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s*|\brequire\s*\(\s*)["'](\.[^"']+)["']/g,
    ),
  ].map((match) => match[1] ?? "")

/**
 * Walk the relative-import closure from one entry point.
 *
 * Repo-relative keys, because a finding has to name something a reviewer can open. Cycles are
 * handled by the `seen` set rather than by a recursion depth: sibling modules in `apps/cli` import
 * one another's neighbours, and a walk that overflows the stack on a real file is a walk whose
 * failure mode is a crash rather than a finding.
 *
 * Package specifiers are deliberately not followed. `@mizan/agent` is a workspace package audited
 * where it lives, and following it into `node_modules` would make this test depend on the install
 * state of the machine it runs on — the same reason `benchmark.test.ts` asserts on package
 * specifiers instead of walking into them.
 */
const relativeClosure = (entry: string, read: (path: string) => string = readFromDisk): Map<string, string> => {
  const found = new Map<string, string>()
  const pending: string[] = [entry]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) continue
    const source = read(current)
    found.set(current, source)
    for (const specifier of relativeSpecifiers(source)) {
      const resolved = resolve(dirname(current), specifier)
      if (found.has(resolved)) continue
      pending.push(resolved)
    }
  }
  return found
}

/** Repo-relative paths, so a failure names a file a reviewer can open on either platform. */
const repoRelative = (path: string): string => path.slice(ROOT.length + 1).split("\\").join("/")

const demoClosure = (): Map<string, string> => relativeClosure(DEMO_ENTRY)

/** Every line of CODE in the closure that mentions a token, with the file and line it came from. */
const mentions = (tokens: readonly string[]): readonly string[] => {
  const hits: string[] = []
  for (const [path, source] of demoClosure()) {
    const code = stripCommentsOnly(source)
    for (const [index, line] of code.split("\n").entries()) {
      if (tokens.some((token) => line.includes(token))) hits.push(`${repoRelative(path)}:${index + 1}: ${line.trim()}`)
    }
  }
  return hits
}

const readFromDisk = (path: string): string => readFileSync(path, "utf8")

/** The closure with the entry point's own source replaced — how a planted violation is expressed. */
const closureWithDemoSource = (source: string): Map<string, string> =>
  relativeClosure(DEMO_ENTRY, (path) => (path === DEMO_ENTRY ? source : readFromDisk(path)))

const reachedProviderConfig = (closure: Map<string, string>): readonly string[] =>
  [...closure.keys()].map(repoRelative).filter((path) => path.endsWith("provider-config.ts"))

/**
 * A value shaped like a credential, committed nowhere.
 *
 * It is a string literal in a test file rather than a real secret, so G-4's scanner sees prose. The
 * canary's whole job is to be a value no other run would print, which is what lets the "the output
 * never contains it" assertion mean something.
 */
const CANARY = "sk-demo-canary-not-a-real-key-0000"

describe("the demo cannot reach an API key", () => {
  test("the closure contains no provider-config.ts", () => {
    expect(reachedProviderConfig(demoClosure())).toEqual([])
  })

  test("no module the demo imports names MIZAN_LLM_API_KEY", () => {
    expect(mentions(["MIZAN_LLM_API_KEY"])).toEqual([])
  })

  test("no module the demo imports reads the environment at all", () => {
    // Stronger than the two named checks, and it is the sentence the demo's own header prints:
    // "this command reads no environment variable". The header and this assertion are one claim
    // stated twice — once for a judge, once for CI — so if either drifts, one of them is wrong.
    expect(mentions(["process.env", "Bun.env", "import.meta.env"])).toEqual([])
  })

  test("the closure is not trivially empty, so the three checks above mean something", () => {
    // A walk that reads zero files passes everything. This is the assertion that the walk works,
    // and it is the one most often missing from a self-test of a self-test.
    const paths = [...demoClosure().keys()].map(repoRelative)
    expect(paths).toContain("apps/cli/src/demo.ts")
    expect(paths).toContain("apps/cli/src/transcript-file.ts")
    expect(paths.length).toBeGreaterThan(3)
  })

  test("the walk follows all four import shapes, so a planted reach is caught by each", () => {
    const shapes: readonly (readonly [string, string])[] = [
      ["a static `from` import", 'import { resolveProvider } from "./provider-config.ts"\nexport const used = resolveProvider\n'],
      ["a side-effect import", 'import "./provider-config.ts"\nexport const used = 1\n'],
      ["a dynamic import", 'export const load = () => import("./provider-config.ts")\n'],
      ["a `require`", 'export const needed = require("./provider-config.ts")\n'],
    ]
    for (const [shape, source] of shapes) {
      expect(reachedProviderConfig(closureWithDemoSource(source)), `the walk missed ${shape}`).not.toEqual([])
    }
  })

  test("a comment naming the forbidden module is not a reach, or the ban could not be documented", () => {
    const documented = '/** never import "./provider-config.ts" here, and never read process.env.MIZAN_LLM_API_KEY */\nexport const used = 1\n'
    expect(reachedProviderConfig(closureWithDemoSource(documented))).toEqual([])
  })
})

describe("the demo with a key in the environment", () => {
  let code: number
  let output: string

  beforeAll(async () => {
    // Spawned once and asserted three times. The demo rebuilds its corpus and replays both
    // questions on every run, and re-spawning it per assertion would triple the cost of the
    // slowest test in the package to learn nothing the first run did not say.
    //
    // The budget is on `boundedExit`, not on this hook. A `beforeAll` has no per-test timeout
    // annotation to raise — the tests below inherit whatever the hook is still doing — so a hang
    // here is the one hang a `test(..., 60_000)` cannot catch, and it is bounded at the spawn.
    const proc = Bun.spawn(["bun", "run", DEMO_ENTRY], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MIZAN_LLM_API_KEY: CANARY, MIZAN_LLM_BASE_URL: "" },
    })
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    const captured = `${stdout}${stderr}`
    code = await boundedExit(proc.exited, () => {
      proc.kill()
    }, "bun run apps/cli/src/demo.ts", () => captured)
    output = captured
  }, SUBPROCESS_TIMEOUT_MS)

  test("it still completes, and prints both badges", () => {
    expect(code).toBe(0)
    expect(output).toContain("[VERIFIED]")
    expect(output).toContain("[REJECTED]")
  })

  test("it never echoes the key", () => {
    expect(output).not.toContain(CANARY)
  })

  test("it says the key is ignored, which is the 'and says so' half of the requirement", () => {
    expect(output).toContain("a key in your shell is ignored")
  })
})
