import { existsSync, statSync } from "node:fs"
import { delimiter, isAbsolute, join, resolve as resolvePath } from "node:path"

/**
 * Which executable G-4 is allowed to run, decided here rather than left to `Bun.spawn`.
 *
 * ## The defect this module exists to close
 *
 * The gate used to spawn the BARE NAME `gitleaks` and let the OS resolve it. Under `bun run`, Bun
 * prepends `node_modules/.bin` to PATH — so any executable named `gitleaks` sitting in that
 * directory wins the lookup, ahead of a real install. A `postinstall` script, a transitive package
 * that ships a colliding bin, or one copied binary is enough to get there, and `gitleaks` is not a
 * dependency of this repository, so a file at that path is by construction undeclared.
 *
 * What the squatter then controls is the whole verdict. It chooses the report file and the exit
 * code, so `[]` plus exit 0 satisfies every condition the gate checks and G-4 reports a clean tree
 * over a committable secret. Requiring a *parseable* report is not enough: `[]` is exactly what a
 * genuine clean run writes, and it is the first thing an impostor writes.
 *
 * So the discrimination cannot live in the report shape. It lives in resolution: the gate resolves
 * the scanner itself, to an absolute path, and refuses a resolution the tree under audit could have
 * supplied. Two rules, one sentence: **the tree must not grade itself.**
 *
 *  - a `node_modules` / `.bin` segment — a package-installed bin, whether dropped by an install
 *    script or copied in by hand, is never the pinned audited tool CI installs;
 *  - anything at or under the directory being scanned, which is the same objection stated over the
 *    whole subtree rather than over the one directory where it usually lands.
 *
 * Both rules are the STRICT direction, and that is deliberate. A case-insensitive comparison is
 * used for the containment check so a case-folded path cannot slip past it; on a case-sensitive
 * filesystem that can only refuse a path the rule would otherwise accept, which is the direction a
 * security control should err in. CI installs gitleaks through `.github/actions/setup-gitleaks`,
 * which lands it in a tool-cache directory outside the repository, so refusing the tree costs CI
 * nothing.
 *
 * Everything here is pure over an injected probe and an injected PATH string, which is the only
 * way to assert the untrusted branches on a machine where gitleaks genuinely is installed.
 *
 * ## Two rules about paths, because the OS has one the gate does not
 *
 * PATH entries are allowed to be RELATIVE — it is a documented, widely used convenience, and the
 * Windows loader accepts one. So two files are named here and they must not be allowed to drift
 * apart, because when they do the trust check judges one and the child opens another:
 *
 *  - `probeOnDisk` returns an ABSOLUTE candidate. It has to. The child is spawned with `cwd` set to
 *    the scanned root, so a relative candidate is re-resolved by the OS against THAT directory — and
 *    a PATH entry of `tools` would be trusted against `process.cwd()` while running
 *    `<scannedRoot>/tools/gitleaks`, which is exactly the planted auditor this module exists to refuse.
 *  - `isUntrustedScannerPath` resolves a relative candidate against the `cwd` it was HANDED, never
 *    against `process.cwd()`, and refuses anything still not absolute afterwards. Fail closed on the
 *    unresolved case: a candidate the gate cannot place is a candidate it cannot clear.
 *
 * The reproduction that motivated both lines, kept here because it is the argument: a scan root of
 * `<tmp>/root` containing both a planted auditor under `tools/` and a committable secret, with
 * `process.cwd()` at `<tmp>/work` holding an honest gitleaks and PATH entry `tools` — before the fix,
 * resolution reported `path="tools\gitleaks.exe" absolute=false trusted=true`, the planted file ran,
 * wrote `[]`, and G-4 passed over a secret the real scanner reports.
 */

export const GITLEAKS_BINARY = "gitleaks"

/** How the resolver asks whether a PATH entry holds a candidate, so the untrusted branches are testable. */
export type BinaryProbe = (dir: string, name: string) => string | null

/**
 * The real filesystem answer, including the one that matters: a DIRECTORY named gitleaks is not an
 * executable.
 *
 * Absolute on the way out, because the child is spawned by absolute path with its own `cwd` — see the
 * second header block. Returning the joined relative string verbatim is what let the two files drift.
 */
export const probeOnDisk: BinaryProbe = (dir, name) => {
  const candidate = resolvePath(join(dir, name))
  try {
    if (!existsSync(candidate)) return null
    return statSync(candidate).isFile() ? candidate : null
  } catch {
    // Unreadable metadata is not evidence of an executable, and the resolver treats it as absent.
    return null
  }
}

/**
 * The filenames a bare `gitleaks` can mean, per platform.
 *
 * Written out rather than read from `PATHEXT` so the set is one auditable list instead of a value
 * the environment controls on the exact gate whose job is to distrust the environment. Windows
 * needs the three because `Bun.spawn` will run `.exe`, `.cmd` and `.bat`; nothing else is offered,
 * so a PATH entry cannot smuggle in a target under a name this gate never intended to run.
 */
export const executableNames = (binary: string, platform: NodeJS.Platform = process.platform): readonly string[] =>
  platform === "win32" ? [`${binary}.exe`, `${binary}.cmd`, `${binary}.bat`] : [binary]

/** Absolute, slash-normalised path segments, lower-cased so containment cannot be defeated by case. */
const segmentsOf = (path: string, base: string): readonly string[] =>
  resolvePath(base, path)
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.toLowerCase())

/**
 * May this resolved path be the scanner? `false` means refuse, not "probably not".
 *
 * `node_modules/.bin` is matched on ADJACENT segments, so a path that merely contains the word —
 * `/opt/node_modules_backup/gitleaks` — is not caught by it, and the tree check then decides on its
 * own merits. Prefix matching is deliberately avoided: `startsWith` would both miss a real
 * traversal (`/repo-evil/…` is not under `/repo`) and, if written as a separator-aware variant,
 * would need this same second test anyway.
 *
 * `base` is the directory the CHILD will run in, not `process.cwd()`. A relative candidate is
 * resolved against `base` because that is the file the OS will open; resolving it against the
 * harness's own directory judges a file nobody runs. Whatever is still not absolute afterwards is
 * untrusted, because a candidate the gate cannot place is a candidate it cannot clear.
 */
export const isUntrustedScannerPath = (candidate: string, cwd: string): boolean => {
  if (!isAbsolute(candidate)) return true
  const segments = segmentsOf(candidate, cwd)
  if (segments.some((segment, index) => segment === "node_modules" && segments[index + 1] === ".bin")) return true
  const root = segmentsOf(cwd, cwd)
  if (segments.length < root.length) return false
  return root.every((segment, index) => segments[index] === segment)
}

/**
 * The three verdicts, and each one is a verdict rather than an absence of one.
 *
 * `resolved` carries the `ignored` squats as well as the winner, because a squatter that was passed
 * over is still something a reader of a green run should be told about; swallowing it would make the
 * refusal silent on exactly the machine where it matters. `untrusted_only` is the case where the
 * ONLY candidate came from the audited tree — that is a planted auditor, and it is refused by name.
 */
export type ScannerResolution =
  | { readonly kind: "resolved"; readonly path: string; readonly ignored: readonly string[] }
  | { readonly kind: "untrusted_only"; readonly paths: readonly string[] }
  | { readonly kind: "absent" }

/**
 * Every directory a PATH entry can mean AT RUN TIME, most likely first.
 *
 * An absolute entry names one file, so it names one directory. A RELATIVE one names a different
 * file depending on who is asking: the gate's own `process.cwd()` when it probes, and the CHILD's
 * `cwd` — the scanned root — when the process starts. `Bun.spawn` is handed that root, so
 * `<root>/tools/gitleaks` is the file that would actually execute, whatever the gate's own
 * directory holds. Probing only the first reading means the planted auditor is invisible to the
 * trust check on exactly the machine where it exists, so both are probed and every hit is judged.
 *
 * Duplicates are removed because PATH already repeats directories, and a repeated evidence line in
 * a message a human reads trains that reader to skim it.
 */
const directoriesAtRunTime = (dir: string, cwd: string): readonly string[] => {
  if (isAbsolute(dir)) return [dir]
  const asTheChildSeesIt = resolvePath(cwd, dir)
  return asTheChildSeesIt === dir ? [dir] : [dir, asTheChildSeesIt]
}

export const resolveScanner = (
  binary: string,
  cwd: string,
  searchPath: string,
  probe: BinaryProbe = probeOnDisk,
  platform: NodeJS.Platform = process.platform,
): ScannerResolution => {
  // A `Set` because PATH repeats directories (Bun's own `node_modules/.bin` twice is not unusual),
  // and the paths end up in a message a human has to read. Duplicated evidence reads like two
  // planted scanners where there is one, which trains the reader to skim the line.
  const trusted = new Set<string>()
  const untrusted = new Set<string>()
  for (const dir of searchPath.split(delimiter)) {
    if (dir.length === 0) continue
    for (const probeDir of directoriesAtRunTime(dir, cwd)) {
      for (const name of executableNames(binary, platform)) {
        const found = probe(probeDir, name)
        if (found === null) continue
        // Any reading that lands inside the audited tree disqualifies the candidate by name, so a
        // reader told about `tools/gitleaks` can go and look at the file rather than guess which
        // spelling of it the gate meant.
        if (isUntrustedScannerPath(found, cwd)) untrusted.add(found)
        else trusted.add(found)
      }
    }
  }
  const first = [...trusted][0]
  if (first !== undefined) return { kind: "resolved", path: first, ignored: [...untrusted] }
  if (untrusted.size > 0) return { kind: "untrusted_only", paths: [...untrusted] }
  return { kind: "absent" }
}

export * as G4Scanner from "./g4-scanner-resolution.ts"