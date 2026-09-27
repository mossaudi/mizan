import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  checkBacktickedPaths,
  checkDocumentedScripts,
  checkEnvVars,
  checkRegistryClaims,
  claim,
  type DocsClaim,
} from "./docs-claims.ts"
import { checkSnapshotArithmetic } from "./docs-snapshot.ts"
import { checkEvalBreadth } from "./docs-artifacts.ts"
import { checkLiveProviderClaim } from "./docs-egress.ts"
import { collectSourceFilesSync, productionFiles, underPrefix, type SourceFile } from "./scan.ts"

/**
 * D-1's runner: the IO half, so the rules in `docs-claims.ts`, `docs-snapshot.ts` and
 * `docs-artifacts.ts` stay pure and testable.
 *
 * Split the same way `g4-gitleaks.ts` is: the decision is a function of contents, the reading is
 * a function of the filesystem, and only this file knows where the repository is.
 */

export const PROVIDER_SOURCE = "apps/cli/src/provider-config.ts"
export const ENV_EXAMPLE = ".env.example"
export const REGISTRY = "data/registry/sources.json"
export const ATTESTATION = "attestation.json"
export const PACKAGE_JSON = "package.json"
export const GOLDEN_EVAL = "data/eval/golden-normalization.json"
export const REDTEAM_EVAL = "data/eval/redteam-fabricated.json"

/** The product source trees R7 reads for an outbound request. */
const SOURCE_ROOTS = ["apps", "packages"] as const

/**
 * The documents whose absence fails the build.
 *
 * `DISCLOSURE.md`, `README.md` and `INTEGRITY.md` are the three judge-facing deliverables. A
 * submission that ships without them has not shipped, so a missing one is `missing-path` rather than
 * a skipped check.
 */
export const REQUIRED_DOCUMENTS = ["DISCLOSURE.md", "README.md", "INTEGRITY.md"] as const

/**
 * The documents that make claims about the repository, and therefore the ones audited.
 *
 * `.env.example` is here because it is a judge-facing claim in its own right and R2 was not enough:
 * R2 cross-checks the *variable names*, so it cannot see a sentence that misdescribes what the code
 * does with them. A file the quick start tells a judge to copy is exactly where a false egress
 * disclosure hides best.
 *
 * **Audited is not the same as required, and the distinction is load-bearing.** Adding a file to this
 * list must not make it mandatory: a consumer or a fork that ships no `.env.example` would then fail
 * the build on a non-defect, told it was "required by the submission", which is a false statement
 * about a file the submission does not in fact require. So `.env.example` is audited **when
 * present** and its absence is silent, and the two concepts are separate exports because conflating
 * them is what produced that defect.
 */
export const AUDITED_DOCUMENTS = [...REQUIRED_DOCUMENTS, ENV_EXAMPLE] as const

/** A `Set` rather than `REQUIRED_DOCUMENTS.includes`, which will not accept a wider union. */
const REQUIRED: ReadonlySet<string> = new Set(REQUIRED_DOCUMENTS)

export type DocsCheckResult = { readonly ok: boolean; readonly claims: readonly DocsClaim[]; readonly checked: readonly string[] }

const readIfPresent = (root: string, relative: string): string | null => {
  const path = join(root, relative)
  if (!existsSync(path)) return null
  return readFileSync(path, "utf8")
}

/**
 * The product's own source, for R7's counterparty.
 *
 * `productionFiles` is the same reduction every other gate applies, and it is load-bearing here
 * rather than incidental: the gate package's own tests and sources contain `fetch(` in fixtures and
 * in prose about fixtures, so without it the rule would be satisfied by its own test data.
 */
const productSources = (root: string): readonly SourceFile[] => {
  const collected = productionFiles(collectSourceFilesSync(root))
  return SOURCE_ROOTS.flatMap((prefix) => underPrefix(collected, `${prefix}/`))
}

/**
 * Audit every documented claim about the repository.
 *
 * A *required* document that is missing is itself a finding, not a reason to pass: `DISCLOSURE.md` is
 * required by the submission, and a build that cannot find it is a build that shipped without one. An
 * *audited* document that is merely absent is skipped — see `AUDITED_DOCUMENTS`.
 */
export const runDocsClaimChecks = (root: string): DocsCheckResult => {
  const claims: DocsClaim[] = []
  const checked: string[] = []
  const exists = (relative: string): boolean => existsSync(join(root, relative))
  // Every input is listed once even when two rules read it, so the report cannot imply an artefact
  // was audited twice.
  const audited = (relative: string): void => {
    if (!checked.includes(relative)) checked.push(relative)
  }

  const envExample = readIfPresent(root, ENV_EXAMPLE)
  const provider = readIfPresent(root, PROVIDER_SOURCE)
  if (envExample !== null && provider !== null) {
    audited(ENV_EXAMPLE)
    audited(PROVIDER_SOURCE)
    claims.push(...checkEnvVars(envExample, provider))
  }

  // The eval sets are read before the documents and handed to each of them, because a claim about
  // either can sit in any of them. A null means the repository has no such artefact, so no document
  // can be claiming anything false about it. `path` travels with the text because the report and the
  // findings name the file that was read, and a name is not recoverable from a set name: a third set
  // called "perturbation" is not `redteam-fabricated.json`.
  const evalSets = [
    { name: "golden", path: GOLDEN_EVAL, text: readIfPresent(root, GOLDEN_EVAL) },
    { name: "redteam", path: REDTEAM_EVAL, text: readIfPresent(root, REDTEAM_EVAL) },
  ]
  for (const set of evalSets) if (set.text !== null) audited(set.path)

  const scripts = scriptsIn(root)
  const sources = productSources(root)

  for (const document of AUDITED_DOCUMENTS) {
    const text = readIfPresent(root, document)
    if (text === null) {
      // Only a *required* document is a finding. `.env.example` is audited when present and absent
      // without comment, because a fork that ships no env example has committed no defect, and the
      // old code told it the file "is required by the submission" — a claim about the submission that
      // was simply untrue.
      if (REQUIRED.has(document)) claims.push(claim("missing-path", document, `${document} is required by the submission and is not in this repository`))
      continue
    }
    audited(document)
    claims.push(...checkBacktickedPaths(text, document, exists))

    if (scripts !== null) claims.push(...checkDocumentedScripts(text, document, scripts))
    claims.push(...checkEvalBreadth(text, document, evalSets))
    claims.push(...checkLiveProviderClaim(text, document, sources))
  }

  const registry = readIfPresent(root, REGISTRY)
  const disclosure = readIfPresent(root, "DISCLOSURE.md")
  if (registry !== null && disclosure !== null) {
    audited(REGISTRY)
    claims.push(...checkRegistryClaims(registry, disclosure))
  }

  // The snapshot arithmetic is checked against `attestation.json` rather than against the corpus,
  // which is the point: the disclosure quotes a number, the attestation is the committed record of
  // that number, and the two must not drift. A repository with no attestation has nothing to check
  // against and therefore makes no claim this rule can falsify, so it is skipped rather than failed.
  const attestation = readIfPresent(root, ATTESTATION)
  if (attestation !== null) {
    audited(ATTESTATION)
    if (disclosure !== null) claims.push(...checkSnapshotArithmetic(disclosure, attestation, "DISCLOSURE.md"))
  }

  return { ok: claims.length === 0, claims, checked }
}

/** The root `scripts` map, or null when `package.json` is unreadable. */
const scriptsIn = (root: string): Readonly<Record<string, string>> | null => {
  const text = readIfPresent(root, PACKAGE_JSON)
  if (text === null) return null
  try {
    const parsed = JSON.parse(text) as { readonly scripts?: unknown }
    if (typeof parsed.scripts !== "object" || parsed.scripts === null) return null
    const entries = Object.entries(parsed.scripts as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    )
    return Object.fromEntries(entries)
  } catch {
    return null
  }
}

export * as DocsCheck from "./docs-check.ts"
