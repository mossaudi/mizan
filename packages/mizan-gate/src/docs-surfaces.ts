import { existsSync, readFileSync, readdirSync } from "node:fs"
import { extname, join } from "node:path"
import { CORPUS_SURFACE_EXTENSIONS, CORPUS_SURFACE_ROOTS } from "./docs-corpus.ts"
import { byPath, type SourceFile } from "./scan.ts"

/**
 * The IO that decides *which files* the corpus-scope rule reads, kept out of `docs-check.ts` for
 * the same reason every rule is a pure function of its inputs: the runner already owns "read this
 * named artefact", and a second, differently-shaped walk belongs beside the rule it feeds rather
 * than inside the runner that wires twelve of them.
 *
 * ## Why this is a walk and not a declared list
 *
 * The alternative — an allowlist of documents allowed to make a corpus claim — is bypassed by the
 * next document that makes one, which is how a claim survives a rule that already exists. A walk
 * over `docs/` and `submission/` covers a new ADR or a new deck the moment it is written, and a
 * file that says nothing about the corpus costs one pass over its lines.
 *
 * `audited` arrives as an argument rather than being imported from `docs-check.ts`, because
 * `docs-check.ts` imports this module and a cycle between the two would make the report's own
 * "which files were audited" list a function of import order.
 */

/**
 * Every public surface a corpus-scope claim can reach a judge on.
 *
 * Two sources, deliberately: `audited` is the three judge-facing deliverables plus the two
 * audited-when-present files, and `CORPUS_SURFACE_ROOTS` adds `docs/` and `submission/` — where the
 * ADRs and the decks live, and `.py` is a corpus surface while it is not a gate-claim sweep file.
 * The `Map` is the dedup: `docs/value-proof.md` is reached both ways and must appear once.
 */
export const collectCorpusSurfaces = (root: string, audited: readonly string[]): readonly SourceFile[] => {
  const found = new Map<string, string>()
  for (const document of audited) {
    const path = join(root, document)
    if (existsSync(path)) found.set(document, readFileSync(path, "utf8"))
  }
  const extensions: ReadonlySet<string> = new Set(CORPUS_SURFACE_EXTENSIONS)
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        // Byte-compiled output is never a surface, and `__pycache__` is the one such directory a
        // Python submission carries.
        if (entry.name !== "__pycache__") walk(join(directory, entry.name), path)
        continue
      }
      if (found.has(path) || !extensions.has(extname(entry.name))) continue
      found.set(path, readFileSync(join(directory, entry.name), "utf8"))
    }
  }
  for (const prefix of CORPUS_SURFACE_ROOTS) {
    const directory = join(root, prefix)
    if (existsSync(directory)) walk(directory, prefix)
  }
  return [...found].map(([path, text]) => ({ path, text })).sort(byPath)
}

export * as DocsSurfaces from "./docs-surfaces.ts"
