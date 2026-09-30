import { readdir, readFile } from "node:fs/promises"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { stripComments, stripCommentsOnly } from "./strip-comments.ts"

/**
 * The shared vocabulary of every structural gate, and the I/O that feeds them.
 *
 * A gate is a pure function from source text to findings; the filesystem walk lives here so
 * that each gate stays a testable function of a list of files — which is what makes the
 * planted-violation self-tests possible without touching the working tree.
 */

export type SourceFile = { readonly path: string; readonly text: string }

export type GateId = "G-1" | "G-2" | "G-3" | "G-4" | "G-5" | "G-6" | "G-7"

/**
 * The number inside a gate id, and the single parse of the gate vocabulary.
 *
 * Declared here because this is the module that owns the `GateId` union. Two modules need the
 * parse — `run-gates.ts` sorts the gate table by it, and `docs-gates.ts` compares a range a
 * document asserts against it — and two copies of `Number(id.slice(2))` would be two places for
 * a future `G-10` or a re-prefixed id to change the answer, which is the drift AGENTS.md
 * section 17 exists to prevent.
 */
export const gateNumber = (gate: GateId): number => Number(gate.slice(2))

export type Finding = {
  readonly gate: GateId
  /** The rule identifier, stable enough to reference in a code review. */
  readonly rule: string
  /** Repository-relative, POSIX-separated, so findings read the same on Windows and Linux. */
  readonly path: string
  /** 1-based. Preserved through comment stripping. */
  readonly line: number
  /** The offending source line, trimmed. */
  readonly excerpt: string
}

/**
 * The extensions the structural gates read.
 *
 * `.html` is in this list because `apps/web/index.html` is a shipped product surface and a gate
 * that skips it is a gate that protects the source and not the bytes a judge actually opens. A
 * hand edit that adds a `<script>` to the committed page is exactly the failure the page's
 * tests catch, and those tests run only when someone runs them — this makes the same edit a red
 * build. It is safe to scan markup with token rules because every gate here matches *sink*
 * tokens (`innerHTML`, `document.write`, `eval(`) rather than markup itself; a tag named
 * `<script>` in a document is a tag, and the rules that forbid it live in the page's tests.
 */
export const CODE_EXTENSIONS = [".ts", ".tsx", ".html"] as const

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".turbo"])

/** Normalise a path for reporting: forward slashes, no leading `./`. */
export const repoPath = (from: string, to: string): string => relative(from, to).split(sep).join("/")

const isCode = (name: string): boolean => CODE_EXTENSIONS.some((extension) => name.endsWith(extension))

/**
 * Byte-identical output order, so a gate's log is a precondition rather than a coincidence.
 *
 * A UTF-16 **code-unit** comparison, and never `localeCompare`. Collation order is a property of
 * the ICU data on the machine that ran the check, so the same gate over the same commit can
 * report in two different orders on two machines. The pair that exposes it is not exotic: ICU
 * orders `seven` before `Seven`, code units order `S` before `s`. A small-ICU runtime makes the
 * two implementations agree, which is exactly why this class of bug survives until someone runs
 * the check in a full-ICU container.
 */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** {@link byCodeUnit} over paths, which is the order every collected file and every finding is reported in. */
export const byPath = (a: SourceFile, b: SourceFile): number => byCodeUnit(a.path, b.path)

/**
 * Walk `root` and return every TypeScript source file, sorted so a gate's output order is
 * stable. Sorted collection is a precondition for a byte-identical CI log.
 */
export const collectSourceFiles = async (root: string): Promise<readonly SourceFile[]> => {
  const found: SourceFile[] = []
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(
      entries.map(async (entry) => {
        const full = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (SKIP_DIRECTORIES.has(entry.name)) return null
          await walk(full)
          return null
        }
        if (!isCode(entry.name)) return null
        return { path: repoPath(root, full), text: await readFile(full, "utf8") }
      }),
    )
    for (const file of files) {
      if (file !== null) found.push(file)
    }
  }
  await walk(root)
  found.sort(byPath)
  return found
}

/**
 * The synchronous twin of `collectSourceFiles`, for a caller that cannot await.
 *
 * `runDocsClaimChecks` is synchronous — it is called from a CLI script, a test, and nothing that
 * has a reason to be async — and it needs the whole product source tree to decide whether the
 * repository opens a socket to a model API. The recursion shape is the only thing duplicated
 * here: the async version parallelises a directory's entries, which a synchronous walk cannot,
 * and the three decisions that make the walk correct (`SKIP_DIRECTORIES`, `isCode`, `repoPath`)
 * are the same module constants in both.
 */
export const collectSourceFilesSync = (root: string): readonly SourceFile[] => {
  const found: SourceFile[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (isCode(entry.name)) found.push({ path: repoPath(root, full), text: readFileSync(full, "utf8") })
    }
  }
  walk(root)
  return found.sort(byPath)
}

/** Keep only files under a repo-relative prefix, e.g. `packages/mizan-verify/`. */
export const underPrefix = (files: readonly SourceFile[], prefix: string): readonly SourceFile[] =>
  files.filter((file) => file.path.startsWith(prefix))

/**
 * The gate package's own directory.
 *
 * A gate has to be able to NAME what it forbids — the banned-token lists in
 * `src/gates/*.ts` are full of `innerHTML`, `similarity`, `verified` and so on — so a
 * token-list rule that scanned this package would flag its own source and be switched off
 * within a day. The gate package is therefore out of scope for the token-list rules.
 *
 * The residual risk is a violation hidden inside the gate package itself. That is accepted
 * and bounded: the package is ~400 lines, it is read in every code review, and the gate
 * self-tests plant violations in fixtures rather than in real source, so a rule cannot be
 * weakened by editing the rule's own list without the fixture test failing.
 */
export const GATE_SELF_PREFIX = "packages/mizan-gate/"

export const withoutGateSelf = (files: readonly SourceFile[]): readonly SourceFile[] =>
  files.filter((file) => !file.path.startsWith(GATE_SELF_PREFIX))

/** True for test files, by directory or by naming convention. */
export const isTestPath = (path: string): boolean =>
  path.startsWith("test/") || path.includes("/test/") || path.includes(".test.") || path.includes(".spec.")

export const withoutTests = (files: readonly SourceFile[]): readonly SourceFile[] => files.filter((file) => !isTestPath(file.path))

/**
 * The files the source rules apply to: production code only.
 *
 * Tests are excluded, and this is a real limitation that has to be stated rather than
 * discovered. A self-test must be able to PLANT a violation — `verdict: "verified"` in
 * `test/gates.test.ts` is the fixture that proves G-6.1 fires — so a rule that scanned
 * tests would report the fixtures as violations and the gates could never pass.
 *
 * The exposure this creates is bounded and worth being honest about: a real violation placed
 * in a `*.test.ts` file would not be caught by the source rules. What still covers it:
 * `tsc --noEmit`, `bun test` (a test cannot construct a forbidden verdict without failing the
 * G-6 dynamic invariant where it matters), and code review. The alternative — scanning tests
 * too — produces a gate that is always red, which is strictly worse than a gate that is
 * sometimes blind.
 */
export const productionFiles = (files: readonly SourceFile[]): readonly SourceFile[] => withoutTests(withoutGateSelf(files))

/**
 * How much of a line a rule can see.
 *
 *  - `"code"`        comments removed and string bodies blanked. For banned-token rules:
 *                    `innerHTML` inside a string is data, not a sink.
 *  - `"code+strings"` comments removed, string contents intact. For rules that are ABOUT
 *                    string content — an import specifier, the `"verified"` literal — which
 *                    are unreadable once the body is blanked.
 */
export type ScanMode = "code" | "code+strings"

/**
 * Find every line whose stripped form matches `pattern`.
 *
 * The pattern is tested against the STRIPPED line but reported against the ORIGINAL line, so a
 * finding points at code a human can read. `pattern` must anchor its own boundaries — every
 * token rule builds them with a word-boundary lookbehind, which is why `Grade` does not match
 * "grade" and `x.includes` is not read as a bare `includes`.
 */
export const findMatchingLines = (
  gate: GateId,
  rule: string,
  files: readonly SourceFile[],
  pattern: RegExp,
  mode: ScanMode = "code",
): readonly Finding[] => {
  const findings: Finding[] = []
  for (const file of files) {
    const source = mode === "code" ? stripComments(file.text) : stripCommentsOnly(file.text)
    const stripped = source.split("\n")
    const original = file.text.split("\n")
    stripped.forEach((line, index) => {
      if (!pattern.test(line)) return
      findings.push({
        gate,
        rule,
        path: file.path,
        line: index + 1,
        excerpt: (original[index] ?? "").trim().slice(0, 160),
      })
    })
  }
  return findings
}

/** Render findings for a terminal. Sorted so two runs of the same tree agree. */
export const formatFindings = (findings: readonly Finding[]): string => {
  const sorted = [...findings].sort((a, b) => (a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1))
  return sorted.map((finding) => `  ${finding.gate}/${finding.rule} ${finding.path}:${finding.line}\n    ${finding.excerpt}`).join("\n")
}

/**
 * The transitive relative-import closure of `entryPath`, within `files`.
 *
 * ## Why this exists
 *
 * G-2.2 is about the VERDICT PATH, not about the repository. The check that matters is "no file
 * reachable from `verify.ts` may import the display-only diagnostic". A rule that scanned every
 * production file instead would flag `index.ts`, which re-exports the diagnostic ON PURPOSE so
 * display code can render it — and a rule that cries wolf over a deliberate, documented export
 * gets switched off, which costs more than it ever protected.
 *
 * Resolving the closure is what lets the rule be both precise and total: adding a helper module
 * that `verify.ts` imports does not escape the check, and widening the barrel does not trip it.
 *
 * A cycle terminates because `closure` only ever grows and the file set is finite.
 */
export const importClosure = (files: readonly SourceFile[], entryPath: string): readonly SourceFile[] => {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const seen = new Set<string>()
  const queue: string[] = [entryPath]
  while (queue.length > 0) {
    const path = queue.pop()
    if (path === undefined || seen.has(path)) continue
    const file = byPath.get(path)
    if (file === undefined) continue
    seen.add(path)
    for (const specifier of relativeSpecifiers(file.text)) {
      const resolved = resolveRelative(path, specifier)
      if (resolved === null) continue
      queue.push(resolved)
    }
  }
  return [...seen].sort().flatMap((path) => (byPath.has(path) ? [byPath.get(path)!] : []))
}

/** `from "./x.ts"` / `from '../y/z.ts'`, and `import("./x.ts")`. Package specifiers are ignored. */
const relativeSpecifiers = (text: string): readonly string[] => {
  const specifiers: string[] = []
  const pattern = /(?:from|import)\s*\(?\s*["'](\.[^"']*)["']/g
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== undefined) specifiers.push(match[1])
  }
  return specifiers
}

/** Resolve a relative specifier against the importing file's repo-relative path, POSIX-style. */
export const resolveRelative = (fromPath: string, specifier: string): string | null => {
  if (!specifier.endsWith(".ts") && !specifier.endsWith(".tsx")) return null
  const base = fromPath.split("/").slice(0, -1)
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment === "") continue
    if (segment === "..") {
      if (base.length === 0) return null
      base.pop()
      continue
    }
    base.push(segment)
  }
  return base.join("/")
}

export * as Scan from "./scan.ts"
