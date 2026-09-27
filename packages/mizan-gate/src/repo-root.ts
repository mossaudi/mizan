import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { err, ok, type Result } from "@mizan/core"

/**
 * Finding the repository root, and REFUSING to run without it.
 *
 * ## Why this module exists
 *
 * `runGates({ root: process.cwd() })` was a real defect, not a hypothetical one. Run the gate
 * from `packages/mizan-gate` — which is how `bun run gate` resolves when the script lives in
 * the package — and `collectSourceFiles` walks that directory. The gate package excludes
 * itself, so it inspected **zero files** and printed five PASS lines. A guard that passes
 * because it looked at nothing is worse than no guard: it manufactures false confidence in
 * exactly the property the project exists to prove.
 *
 * So the root is derived from this file's own location, not from the caller's shell, and then
 * it is ASSERTED. `requireRepositoryRoot` refuses a directory that is not the mizan workspace,
 * which turns "ran it from the wrong place" from a silent false pass into a loud failure.
 */

const REPO_MARKERS = ["package.json", "AGENTS.md"] as const

/** Directories whose presence means "this really is the workspace root". */
const REQUIRED_SUBTREES = ["packages/mizan-verify", "packages/mizan-core"] as const

type Marker = { readonly workspaces: boolean; readonly subtrees: boolean }

/**
 * A directory qualifies as the root only if it has BOTH a workspace `package.json` and the
 * packages the gates are written against. Requiring both is deliberate: `packages/mizan-gate`
 * itself has a `package.json`, so one signal alone would still pick the wrong directory.
 */
const inspect = (dir: string): Marker | null => {
  for (const marker of REPO_MARKERS) {
    if (!existsSync(join(dir, marker))) return null
  }
  const manifest = readFileSync(join(dir, "package.json"), "utf8")
  const workspaces = /"workspaces"\s*:/.test(manifest)
  const subtrees = REQUIRED_SUBTREES.every((subtree) => existsSync(join(dir, subtree)))
  return { workspaces, subtrees }
}

/** Walk up from `from` to the first directory that satisfies `isRoot`. `null` if none. */
export const findRoot = (from: string, isRoot: (dir: string) => boolean): string | null => {
  let current = resolve(from)
  for (;;) {
    if (isRoot(current)) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/** The repository root containing this module, or `null` if it cannot be identified. */
export const findRepositoryRoot = (from: string): string | null =>
  findRoot(from, (dir) => {
    const marker = inspect(dir)
    return marker !== null && marker.workspaces && marker.subtrees
  })

/**
 * The root for a gate run, or an explanation of why there is none.
 *
 * A failure here is the good outcome. It means the gates refused to run rather than passing
 * vacuously.
 */
export const requireRepositoryRoot = (from: string): Result<string, string> => {
  const found = findRepositoryRoot(from)
  if (found !== null) return ok(found)

  const marked = findRoot(from, (dir) => inspect(dir) !== null)
  if (marked === null) {
    return err(`no directory above ${from} contains ${REPO_MARKERS.join(" or ")}; not a mizan checkout`)
  }
  return err(
    `${marked} has a manifest but is not the mizan workspace root ` +
      `(missing "workspaces" or ${REQUIRED_SUBTREES.join(", ")}); the gates would inspect nothing`,
  )
}

export * as RepoRoot from "./repo-root.ts"
