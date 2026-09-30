/**
 * Is a documented path a DECLARED build artefact, or a path that does not exist?
 *
 * ## The defect this fixes
 *
 * R1 (`checkBacktickedPaths` in `docs-claims.ts`) reports every backticked repository path a
 * document names and the repository does not contain. That rule caught six false file paths in
 * `DISCLOSURE.md` — the drift class it exists for. It also, on a clean clone, reported
 * `data/corpus.db` as a false claim: `DISCLOSURE.md` tells a judge the snapshot is built by
 * `bun run ingest`, the file is gitignored and reproducible from pinned URLs, and a judge who has
 * just cloned the repository does not have it. So `bun run check:docs` — the FIRST step in
 * `ci.yml`, before typecheck, tests and gates — exited 1 on every fresh clone, on both matrix legs,
 * over a file the repository never intended to ship. Every local run was green, because the
 * artefact happened to be built on the machine doing the running. A gate that is red on a correct
 * checkout is a gate that gets deleted, and then the six real false paths come back too.
 *
 * ## Why `.gitignore` is the authority and not a list in this file
 *
 * The fact being checked is "this path is deliberately absent and reproducible", and the place the
 * repository already declares exactly that is `.gitignore`. A second list here would be a second
 * source of truth (AGENTS.md section 17), and it would drift the first time somebody tidied a rule
 * out of `.gitignore` — in the direction that re-breaks a clean clone while every local run stays
 * green, which is the least detectable failure mode this repository has.
 *
 * ## The subset of gitignore syntax read here, and why a subset is safe
 *
 * Only literal patterns are read: no `*`, `?` or `[`, with a trailing `/` marking a directory. A
 * pattern this module cannot read is SKIPPED, and skipping can only ever ADD a finding — a path git
 * genuinely ignores may be reported. It can never remove one, because every pattern that IS read is
 * a literal gitignore rule, so a path excused here is one git excuses too. That is the fail-closed
 * direction (AGENTS.md section 3): the failure mode of this approximation is a red build naming a
 * generated file, never a green build over a path that does not exist.
 *
 * Anchoring is git's own rule — a pattern containing a slash is relative to the directory holding
 * the `.gitignore`, one without a slash matches at any depth — and the LAST matching pattern wins,
 * `!` negations included, so a re-admitted file is not treated as generated. The `.gitignore` in
 * this repository uses exactly these forms.
 */

type Pattern = {
  readonly value: string
  readonly anchored: boolean
  readonly directory: boolean
  readonly negated: boolean
}

/** The syntax this module declines to read. Declining is the fail-closed half of the contract. */
const UNREADABLE = /[*?[\]]/

const parse = (gitignore: string): readonly Pattern[] => {
  const patterns: Pattern[] = []
  for (const line of gitignore.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    const negated = trimmed.startsWith("!")
    const body = negated ? trimmed.slice(1) : trimmed
    if (body === "" || UNREADABLE.test(body)) continue
    const directory = body.endsWith("/")
    const value = directory ? body.slice(0, -1) : body
    if (value === "") continue
    patterns.push({ value, anchored: value.includes("/"), directory, negated })
  }
  return patterns
}

const matches = (pattern: Pattern, path: string): boolean => {
  if (pattern.anchored) return path === pattern.value || path.startsWith(`${pattern.value}/`)
  if (pattern.directory) return path.split("/").includes(pattern.value)
  return path.slice(path.lastIndexOf("/") + 1) === pattern.value
}

/** The form a document writes a path in, reduced to what a `.gitignore` pattern is compared against. */
const normalize = (path: string): string => path.replace(/^\.\//, "").replace(/\/+$/, "")

/**
 * Build the predicate. A path the `.gitignore` declares generated is a TRUE claim about this
 * repository even when it is not on disk, because the repository ships the rule that produces it.
 *
 * @param gitignore the contents of the repository's `.gitignore`, read once by the caller.
 */
export const isDeclaredGenerated = (gitignore: string): ((path: string) => boolean) => {
  const patterns = parse(gitignore)
  return (path: string): boolean => {
    const normalized = normalize(path)
    let generated = false
    for (const pattern of patterns) {
      if (matches(pattern, normalized)) generated = !pattern.negated
    }
    return generated
  }
}

export * as DocsGenerated from "./docs-generated.ts"
