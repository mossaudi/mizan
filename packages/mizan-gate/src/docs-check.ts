import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  checkBacktickedPaths,
  checkDocumentedScripts,
  checkEnvVars,
  checkRegistryClaims,
  type DocsClaim,
} from "./docs-claims.ts"

/**
 * D-1's runner: the IO half, so the four rules in `docs-claims.ts` stay pure and testable.
 *
 * Split the same way `g4-gitleaks.ts` is: the decision is a function of contents, the reading is
 * a function of the filesystem, and only this file knows where the repository is.
 */

/** The documents that make claims about the repository, and therefore the ones audited. */
export const AUDITED_DOCUMENTS = ["DISCLOSURE.md", "README.md", "INTEGRITY.md"] as const

export const PROVIDER_SOURCE = "apps/cli/src/provider-config.ts"
export const ENV_EXAMPLE = ".env.example"
export const REGISTRY = "data/registry/sources.json"
export const PACKAGE_JSON = "package.json"

export type DocsCheckResult = { readonly ok: boolean; readonly claims: readonly DocsClaim[]; readonly checked: readonly string[] }

const readIfPresent = (root: string, relative: string): string | null => {
  const path = join(root, relative)
  if (!existsSync(path)) return null
  return readFileSync(path, "utf8")
}

/**
 * Audit every documented claim about the repository.
 *
 * A document that is missing is itself a finding, not a reason to pass: `DISCLOSURE.md` is
 * required by the submission, and a build that cannot find it is a build that shipped without one.
 */
export const runDocsClaimChecks = (root: string): DocsCheckResult => {
  const claims: DocsClaim[] = []
  const checked: string[] = []
  const exists = (relative: string): boolean => existsSync(join(root, relative))

  for (const document of AUDITED_DOCUMENTS) {
    const text = readIfPresent(root, document)
    if (text === null) {
      claims.push({ rule: "missing-path", file: document, detail: `${document} is required by the submission and is not in this repository` })
      continue
    }
    checked.push(document)
    claims.push(...checkBacktickedPaths(text, document, exists))

    const scripts = scriptsIn(root)
    if (scripts !== null) claims.push(...checkDocumentedScripts(text, document, scripts))
  }

  const envExample = readIfPresent(root, ENV_EXAMPLE)
  const provider = readIfPresent(root, PROVIDER_SOURCE)
  if (envExample !== null && provider !== null) {
    checked.push(ENV_EXAMPLE, PROVIDER_SOURCE)
    claims.push(...checkEnvVars(envExample, provider))
  }

  const registry = readIfPresent(root, REGISTRY)
  const disclosure = readIfPresent(root, "DISCLOSURE.md")
  if (registry !== null && disclosure !== null) {
    checked.push(REGISTRY)
    claims.push(...checkRegistryClaims(registry, disclosure))
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
