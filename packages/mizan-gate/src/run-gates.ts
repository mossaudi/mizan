import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { collectSourceFiles, formatFindings, type Finding, type GateId, type SourceFile } from "./scan.ts"
import { gateNoSimilarity } from "./gates/g1-no-similarity.ts"
import { gateNoRawHtml } from "./gates/g2-no-raw-html.ts"
import { gateNoEvasion } from "./gates/g3-no-evasion.ts"
import { checkLicenceFields, REGISTRY_PATH } from "./gates/g5-licence-fields.ts"
import { gateNoFalseVerified } from "./gates/g6-no-false-verified.ts"
import { GITLEAKS_MISSING_MESSAGE, runGitleaks } from "./gates/g4-gitleaks.ts"

/**
 * The gate runner. One exit code, and it names the gate and the file that failed.
 *
 * Order matters only for the reader: G-1 first, because a similarity violation makes every
 * later verdict untrustworthy. G-4 (gitleaks) runs last because it is the slow one and the
 * pure gates should fail in under a second.
 */

export type GateOutcome = { readonly gate: GateId; readonly findings: readonly Finding[]; readonly detail?: string }

export type RunGatesOptions = {
  readonly root: string
  /** Skip the gitleaks subprocess. Only the gate self-tests do this. */
  readonly skipGitleaks?: boolean
  /** Reuse an already-collected file list. The self-tests pass a fixture tree. */
  readonly files?: readonly SourceFile[]
  /** Reuse an already-parsed registry. */
  readonly registry?: unknown
}

const parseRegistry = async (root: string): Promise<{ readonly parsed: unknown; readonly present: boolean }> => {
  const full = `${root}/${REGISTRY_PATH}`
  if (!existsSync(full)) return { parsed: undefined, present: false }
  return { parsed: JSON.parse(await readFile(full, "utf8")), present: true }
}

/** Run G-1, G-2, G-3, G-5, G-6 over the tree, then G-4. */
export const runGates = async (options: RunGatesOptions): Promise<readonly GateOutcome[]> => {
  const files = options.files ?? (await collectSourceFiles(options.root))
  const registry =
    options.registry === undefined ? await parseRegistry(options.root) : { parsed: options.registry, present: true }

  const registryFindings: readonly Finding[] = registry.present
    ? checkLicenceFields(registry.parsed)
    : [
        {
          gate: "G-5",
          rule: "G-5.0 registry-missing",
          path: REGISTRY_PATH,
          line: 1,
          excerpt: `${REGISTRY_PATH} is missing. Run "bun run ingest" to generate the registry before the gates.`,
        },
      ]

  const outcomes: GateOutcome[] = [
    { gate: "G-1", findings: gateNoSimilarity(files) },
    { gate: "G-2", findings: gateNoRawHtml(files) },
    { gate: "G-3", findings: gateNoEvasion(files) },
    { gate: "G-5", findings: registryFindings },
    { gate: "G-6", findings: gateNoFalseVerified(files) },
  ]

  if (options.skipGitleaks === true) return outcomes

  const gitleaks = await runGitleaks(options.root, (binary) => {
    if (existsSync(binary)) return true
    return Bun.which(binary) !== null
  })
  return [
    ...outcomes,
    {
      gate: "G-4",
      findings: gitleaks.ok
        ? []
        : [{ gate: "G-4", rule: "G-4.1 gitleaks", path: ".", line: 1, excerpt: gitleaks.ok ? "" : gitleaks.detail || GITLEAKS_MISSING_MESSAGE }],
    },
  ]
}

/** Human-readable summary. Empty string when everything passed. */
export const summariseOutcomes = (outcomes: readonly GateOutcome[]): string => {
  const sections = outcomes
    .filter((outcome) => outcome.findings.length > 0)
    .map((outcome) => `GATE ${outcome.gate} FAILED (${outcome.findings.length})\n${formatFindings(outcome.findings)}`)
  return sections.join("\n\n")
}

export * as RunGates from "./run-gates.ts"
