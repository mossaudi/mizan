import { findMatchingLines, productionFiles, underPrefix, type Finding, type SourceFile } from "../scan.ts"
import { tokenPattern } from "../token-pattern.ts"

/**
 * G-1 — the verifier is isolated and similarity-free.
 *
 * Four rules, checked over `packages/mizan-verify/` only:
 *
 *  - **G-1.1 dependency isolation.** Every module import resolves to `@mizan/core` or to a
 *    relative path inside the package. One dependency, so an embedding library cannot be
 *    reached even accidentally.
 *  - **G-1.2 no similarity machinery.** No edit distance, no fuzzy, no n-gram, no
 *    embedding, no vector, no score threshold. This is the CWE-345 control.
 *  - **G-1.3 no ambient authority.** No clock, no randomness, no network, no environment,
 *    no `performance.now`. The verifier is a total function; a wall clock inside it would
 *    make verdicts depend on how fast the machine is.
 *  - **G-1.4 containment is the only match.** `String.prototype.includes` may appear in
 *    `steps/containment.ts` (the decision) and in `src/diagnostics/` (the display-only
 *    longest-run aid). Nowhere else, so there is exactly one route to `verified`.
 *
 * The banned-token lists are the interesting part of this file. They are deliberately
 * word-boundary-anchored so that `Grade` does not match "grade", `comparable` does not match
 * "compare", and `Vector2` in a comment-free line does not trip `vector`. A gate with sloppy
 * patterns gets switched off, and a switched-off gate protects nothing.
 */

export const VERIFY_PREFIX = "packages/mizan-verify/"

const IMPORT_PATTERN = /(?:^|\s)(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g

/** `matchAll` needs the global flag; exported so the self-test can reuse the exact patterns. */
const matchImports = (line: string): readonly string[] =>
  [...line.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? "")

/**
 * `fuzzy` must catch `fuzzyScore`; `embed` must catch `embeddings`; `threshold` must catch
 * `thresholds`. `tokenPattern` owns that, and this file owns the LISTS — the vocabulary of
 * what "similarity machinery" means is a policy decision, and it should be reviewable in one
 * place rather than encoded in a regex.
 */
export const SIMILARITY_TOKENS = [
  "similarity",
  "similar",
  "fuzzy",
  "levenshtein",
  "editDistance",
  "edit_distance",
  "jaro",
  "jaccard",
  "trigram",
  "ngram",
  "diceCoefficient",
  "cosineSimilarity",
  "cosine",
  "embed",
  "embedding",
  "embeddings",
  "vector",
  "tfidf",
  "bm25",
  "sbert",
  "sentenceTransformers",
  "rapidfuzz",
  "fuse",
  "tokenOverlap",
  "scoreThreshold",
  "threshold",
] as const

export const AMBIENT_AUTHORITY_TOKENS = [
  "Date.now",
  "new Date",
  "performance.now",
  "process.hrtime",
  "Math.random",
  "crypto.randomUUID",
  "fetch(",
  "XMLHttpRequest",
  "process.env",
  "require(",
  "import(",
  "Bun.nanoseconds",
  "setTimeout",
  "setInterval",
] as const

/** Files allowed to call `String.prototype.includes`. Everything else is a violation. */
export const INCLUDES_ALLOWLIST = ["packages/mizan-verify/src/steps/containment.ts", "packages/mizan-verify/src/diagnostics/"] as const

const isAllowed = (path: string, allowlist: readonly string[]): boolean =>
  allowlist.some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry))

/** G-1.1 — module imports resolve to core or to the package itself. */
export const checkDependencyIsolation = (files: readonly SourceFile[]): readonly Finding[] => {
  const findings: Finding[] = []
  for (const file of productionFiles(files).filter((f) => f.path.startsWith(VERIFY_PREFIX))) {
    file.text.split("\n").forEach((line, index) => {
      for (const specifier of matchImports(line)) {
        if (specifier === "@mizan/core") continue
        if (specifier.startsWith(".")) continue
        findings.push({
          gate: "G-1",
          rule: "G-1.1 dependency-isolation",
          path: file.path,
          line: index + 1,
          excerpt: line.trim().slice(0, 160),
        })
      }
    })
  }
  return findings
}

/** G-1.2 — no similarity machinery anywhere in the verifier. */
export const checkNoSimilarity = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-1", "G-1.2 no-similarity", productionFiles(files).filter((f) => f.path.startsWith(VERIFY_PREFIX)), tokenPattern(SIMILARITY_TOKENS))

/** G-1.3 — no clock, no randomness, no network, no env, no dynamic import. */
export const checkNoAmbientAuthority = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines("G-1", "G-1.3 no-ambient-authority", productionFiles(files).filter((f) => f.path.startsWith(VERIFY_PREFIX)), tokenPattern(AMBIENT_AUTHORITY_TOKENS))

/** G-1.4 — containment is the only place a quote may be matched. */
export const checkContainmentOnly = (files: readonly SourceFile[]): readonly Finding[] =>
  findMatchingLines(
    "G-1",
    "G-1.4 containment-only",
    productionFiles(files).filter((f) => f.path.startsWith(VERIFY_PREFIX)),
    /(?<![\w$])(?:\w+)\.includes\(/,
  ).filter((finding) => !isAllowed(finding.path, INCLUDES_ALLOWLIST))

/** The whole gate. */
export const gateNoSimilarity = (files: readonly SourceFile[]): readonly Finding[] => [
  ...checkDependencyIsolation(files),
  ...checkNoSimilarity(files),
  ...checkNoAmbientAuthority(files),
  ...checkContainmentOnly(files),
]

export * as G1 from "./g1-no-similarity.ts"
