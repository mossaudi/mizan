/**
 * What each shipped surface says on a checkout with no corpus — read at acceptance time, not asserted in a comment.
 *
 * ## Why this exists
 *
 * Story 7 promises that both surfaces degrade to a **typed** state on a clean clone, and the
 * degradation matrix in `docs/degradation-matrix.md` promises they name it the *same* way. Both
 * promises are words in a document until something runs both surfaces with no corpus and prints what
 * they said. That is what this script is: the disclosure half of `bun run accept:customer`, so the
 * customer-deal report carries the two words rather than a link to a document that carries them.
 *
 * It exists as a separate executable rather than as two more rows in the acceptance step table because
 * the step table's vocabulary is "a command that exits 0 or does not", and these two surfaces are
 * supposed to exit non-zero. A step for a refusal would have to treat the refusal as its success
 * criterion, which is a contradiction inside the one table that decides whether a run is accepted.
 *
 * ## Why a synthetic checkout, and not this one
 *
 * `data/corpus.db` is gitignored and present on most developer machines. A check that relied on its
 * absence would pass on CI and fail at home — the shape of a green run that means nothing (AGENTS.md
 * section 8, which is about `bun test` at the root and is the same failure). So each surface is pointed
 * at the smallest directory that a mizan workspace resolver accepts, with no corpus in it. That is what a
 * fresh clone has, on every machine, including one that has never run `bun run ingest`.
 *
 * ## What counts as agreement
 *
 * Agreement is that **both** surfaces decoded to the same shared condition, and that the condition is
 * `corpus_absent` — because that is the condition a clean clone is in. A surface that names a different
 * state (`corpus_unusable`, `attestation_unreadable`) is not wrong on this checkout, it is describing a
 * different checkout; the check fails rather than accepting whatever came back, because the point is
 * that a reader can rely on the word.
 */

import { spawn } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { decodeCondition, err, isOk, ok, type DegradationCondition, type Result } from "@mizan/core"
import { scrubbedEnv } from "./child-env.ts"

/** The two surfaces a customer integrates against, in the order the report prints them. */
export const SURFACES = ["cli", "mcp"] as const

export type Surface = (typeof SURFACES)[number]

/** The condition a clean clone puts both surfaces in. Anything else is a finding, not a variation. */
export const EXPECTED_ABSENT = "corpus_absent"

/**
 * The acceptance step that checks a surface, named in one place.
 *
 * The step table in `scripts/accept-customer.ts` and the report that prints those steps both need this
 * string, and a report that names a step the table does not contain — or the other way round — is a report
 * about a run that did not happen. Deriving it from the surface name means adding a surface to `SURFACES`
 * cannot leave one of the two ends behind.
 */
export const surfaceStepId = (surface: Surface): string => `${surface}-no-corpus-state`

/** What one surface is: the file to run, the arguments it needs, and the variables it reads the corpus from. */
export type SurfaceCommand = {
  readonly entry: string
  readonly argv: readonly string[]
  /** Empty for the CLI, which resolves its root from the working directory and has no corpus override. */
  readonly env: Readonly<Record<string, string>>
}

/** The repository this script reports on, from this file's own location rather than the caller's cwd. */
export const REPOSITORY_ROOT = resolve(import.meta.dir, "..", "..")

/**
 * How to invoke one surface against a given checkout.
 *
 * `root` is the synthetic checkout, and it is also what the MCP environment names: `main.ts` resolves
 * its defaults from its *own* file location, so pointing it at a foreign corpus means the documented
 * `MIZAN_CORPUS_PATH` / `MIZAN_ATTESTATION_PATH` overrides, which is the same path an operator takes to
 * serve a corpus from somewhere else. The CLI needs no override because it resolves the root from the
 * working directory we hand it.
 */
export const commandFor = (surface: Surface, root: string): SurfaceCommand => {
  if (surface === "cli") {
    return {
      entry: join(REPOSITORY_ROOT, "apps", "cli", "src", "main.ts"),
      argv: ["what is the definition of salah?"],
      env: {},
    }
  }
  return {
    entry: join(REPOSITORY_ROOT, "packages", "mizan-mcp", "src", "main.ts"),
    argv: [],
    env: {
      MIZAN_CORPUS_PATH: join(root, "data", "corpus.db"),
      MIZAN_ATTESTATION_PATH: join(root, "attestation.json"),
    },
  }
}

/**
 * The smallest directory a workspace resolver accepts as a mizan checkout, and no corpus inside it.
 *
 * `AGENTS.md` and the workspace `package.json` are committed at the real root and nowhere else, so their
 * presence is what makes a directory a repository rather than a folder; the two `packages/` subtrees are
 * what the CLI's root resolver requires before it will proceed. The caller removes the directory —
 * a temp directory this function creates is a resource, and a script that leaks one per run is a script
 * that fills the machine it was run on.
 */
export const syntheticCheckout = (): string => {
  const root = mkdtempSync(join(tmpdir(), "mizan-acceptance-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "mizan", workspaces: ["apps/*", "packages/*"] }), "utf8")
  writeFileSync(join(root, "AGENTS.md"), "# synthetic checkout\n", "utf8")
  mkdirSync(join(root, "packages", "mizan-verify"), { recursive: true })
  mkdirSync(join(root, "packages", "mizan-core"), { recursive: true })
  return root
}

/** Remove a checkout this script made. Exported so the caller owns the cleanup, as it owns the run. */
export const removeCheckout = (root: string): void => rmSync(root, { recursive: true, force: true })

/** How long a surface gets to name its state before we call it hung. */
export const SURFACE_TIMEOUT_MS = 60_000

/** What a finished surface looked like from the outside. */
export type SurfaceRun = {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

/**
 * The shared condition this surface named, or `null` if it named none.
 *
 * ## Why the text is scanned rather than a structured field read
 *
 * Because there is no structured field to read. The CLI puts its condition on stderr as prose, and an
 * integrator who scrapes the stderr gets the word out of it — so the check reads the same bytes the
 * integrator reads. Scanning for a token that `decodeCondition` accepts, rather than for a fixed string,
 * means the check is a property of the shared vocabulary: a surface cannot pass by printing a word this
 * repository has never declared, and if it prints nothing, this returns `null` and the check fails.
 */
export const conditionIn = (text: string): DegradationCondition | null => {
  for (const token of text.split(/[^A-Za-z_]+/)) {
    if (token.length === 0) continue
    const decoded = decodeCondition(token)
    if (isOk(decoded)) return decoded.value
  }
  return null
}

/**
 * The environment one surface child is spawned with: the operator's environment with every `MIZAN_`
 * variable removed, and this command's own overrides added on top.
 *
 * ## Why this is a named value and not an expression inside `observe`
 *
 * Because the defect it prevents is one property access wide. `{ ...process.env, ...command.env }`
 * reads as "the command's environment, defaulted from ours" and behaves as "whatever the operator has
 * set, winning" — `...process.env` comes last in the *reads* and the operator's `MIZAN_CORPUS_PATH`
 * is silently overwritten by, or overwrites, the override three lines above it. With the scrub
 * between them there is no ordering to get wrong, and extracting the composition gives the rule a
 * name a test can assert on instead of a spawn whose output has to be read to prove anything.
 *
 * ## Why the scrub runs FIRST and the overrides land second
 *
 * Because the scrub withholds the whole `MIZAN_` namespace, and the overrides this module *is* the
 * reason for live in it. Scrubbing the merged object would be a fail-closed gesture that removes the
 * corpus path the observer is trying to point the server at, and the clean-clone check would then
 * measure the server's default corpus — which on a developer machine is a real one. That is the same
 * defect as the inheritance, pointed the other way: the report describing a corpus nobody chose.
 */
export const childEnv = (command: SurfaceCommand): Readonly<Record<string, string | undefined>> => ({
  ...scrubbedEnv(process.env),
  ...command.env,
})

/**
 * Run one surface in the given checkout and report the condition it named.
 *
 * `err` for the three ways this can fail without a verdict, which are the three ways a customer would
 * otherwise see a green row: the surface named nothing, it named something that is not the expected
 * state, or it did not finish. A timeout is distinct from a refusal on purpose — a hang is a defect in
 * the surface, and reporting it as "corpus_absent" would credit it with an honest refusal it never made.
 */
export const observe = async (surface: Surface, root: string): Promise<Result<DegradationCondition, string>> => {
  const command = commandFor(surface, root)
  const run = await new Promise<SurfaceRun>((resolveRun) => {
    const child = spawn(process.execPath, [command.entry, ...command.argv], {
      cwd: root,
      env: childEnv(command),
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, SURFACE_TIMEOUT_MS)
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString()
    })
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString()
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolveRun({ code, stdout, stderr, timedOut })
    })
  })

  if (run.timedOut) return err(`did not finish within ${SURFACE_TIMEOUT_MS}ms`)
  const named = conditionIn(`${run.stdout}\n${run.stderr}`)
  if (named === null) return err(`named no condition from the shared vocabulary and exited ${String(run.code)}`)
  if (named !== EXPECTED_ABSENT) return err(`named \`${named}\`, and this checkout is a clean clone, so the expected state is \`${EXPECTED_ABSENT}\``)
  return ok(named)
}

/** One report line per surface: the surface, the condition it named, and nothing it did not name. */
export const renderState = (surface: Surface, outcome: Result<DegradationCondition, string>): string => {
  const label = `  ${surface.padEnd(5)}`
  if (!outcome.ok) return `${label} ${outcome.error}`
  return `${label} degradation state  ${outcome.value}`
}

/**
 * The surfaces asked about, in report order.
 *
 * Runs them in sequence rather than concurrently: each spawns a Bun process that loads the workspace, and
 * two at once on a loaded CI box is how a state check becomes a timing check. Two surfaces cost seconds;
 * the report is not worth a race for.
 */
export const observeAll = async (
  root: string,
  surfaces: readonly Surface[] = SURFACES,
): Promise<ReadonlyMap<Surface, Result<DegradationCondition, string>>> => {
  const outcomes = new Map<Surface, Result<DegradationCondition, string>>()
  for (const surface of surfaces) outcomes.set(surface, await observe(surface, root))
  return outcomes
}

/**
 * The surfaces named on the command line, from `--surface <name>` or `--surface=<name>`.
 *
 * A parser rather than a `find`, because the acceptance table spells the flag the readable way
 * (`--surface cli`, in a table a person reads before a demo) and a developer reaches for the other. Accepting
 * both and refusing anything else is the whole of the CLI contract here: an unrecognised value must be an
 * error, never an empty request that quietly checks nothing and exits 0.
 */
export const requestedSurfaces = (argv: readonly string[]): readonly string[] => {
  const requested: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (arg === "--surface") {
      const next = argv[index + 1]
      if (next === undefined) continue
      requested.push(next)
      index += 1
      continue
    }
    if (arg.startsWith("--surface=")) requested.push(arg.slice("--surface=".length))
  }
  return requested
}

/**
 * Run the surfaces and report.
 *
 * With `--surface <name>` it reports one surface, which is how `ACCEPTANCE_STEPS` runs each of them as its
 * own check: a shared step that verified both at once could not say which one degraded, and a customer
 * reading "the surfaces degrade consistently" cannot act on it. With no flag it reports both and asserts
 * they agree, which is the whole of Story 7's clean-clone promise.
 *
 * Exit code is the check's verdict: 0 when every requested surface named `corpus_absent`, 1 otherwise.
 * A non-zero exit here is the *product* behaving correctly, and the acceptance table runs this through the
 * same `runStep` as everything else — which is why the check's success is "the command refused to serve
 * and said which state it was in", and why a step for it does not belong in a table where a non-zero exit
 * means the check failed.
 */
if (import.meta.main) {
  const requested = requestedSurfaces(process.argv.slice(2))
  const unknown = requested.filter((name) => !SURFACES.includes(name as Surface))
  if (unknown.length > 0) {
    console.error(`unknown surface: ${unknown.join(", ")}; this script knows ${SURFACES.join(" and ")}`)
    process.exit(1)
  }
  const surfaces: readonly Surface[] = requested.length === 0 ? SURFACES : (requested as Surface[])
  const checkout = syntheticCheckout()
  try {
    const outcomes = await observeAll(checkout, surfaces)
    for (const surface of surfaces) console.log(renderState(surface, outcomes.get(surface) ?? err("the surface was not observed")))
    const refused = [...outcomes.values()].filter((outcome) => !outcome.ok)
    if (refused.length === 0) {
      console.log(`  every surface asked about named ${EXPECTED_ABSENT} on a checkout with no corpus`)
      process.exit(0)
    }
    process.exit(1)
  } finally {
    removeCheckout(checkout)
  }
}

export * as SurfaceState from "./surface-state.ts"
