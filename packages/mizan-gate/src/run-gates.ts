import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { collectSourceFiles, formatFindings, gateNumber, type Finding, type GateId, type SourceFile } from "./scan.ts"
import { gateNoSimilarity } from "./gates/g1-no-similarity.ts"
import { gateNoRawHtml } from "./gates/g2-no-raw-html.ts"
import { gateNoEvasion } from "./gates/g3-no-evasion.ts"
import { checkLicenceFields, REGISTRY_PATH } from "./gates/g5-licence-fields.ts"
import { gateNoFalseVerified } from "./gates/g6-no-false-verified.ts"
import { gateVerdictPathPurity } from "./gates/g7-verdict-path-purity.ts"
import { GITLEAKS_MISSING_MESSAGE, runGitleaks } from "./gates/g4-gitleaks.ts"

/**
 * The gate runner. One exit code, and it names the gate and the file that failed.
 *
 * Order matters only for the reader: G-1 first, because a similarity violation makes every
 * later verdict untrustworthy, and G-7 immediately after it because it re-asserts the same
 * property at the granularity the decision path actually has. G-4 (gitleaks) runs last
 * because it is the slow one and the pure gates should fail in under a second.
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

type GateContext = {
  readonly root: string
  readonly files: readonly SourceFile[]
  readonly registry: { readonly parsed: unknown; readonly present: boolean }
}

/** A gate is pure over the tree, so most entries are synchronous; only the subprocess gate is not. */
type GateFindings = readonly Finding[] | Promise<readonly Finding[]>

type GateSpec = { readonly gate: GateId; readonly run: (context: GateContext) => GateFindings }

const parseRegistry = async (root: string): Promise<{ readonly parsed: unknown; readonly present: boolean }> => {
  const full = `${root}/${REGISTRY_PATH}`
  if (!existsSync(full)) return { parsed: undefined, present: false }
  return { parsed: JSON.parse(await readFile(full, "utf8")), present: true }
}

/** G-5.0 — the registry is a prerequisite for auditing the registry, so its absence fails. */
const licenceFindings = (registry: { readonly parsed: unknown; readonly present: boolean }): readonly Finding[] =>
  registry.present
    ? checkLicenceFields(registry.parsed)
    : [
        {
          gate: "G-5" as const,
          rule: "G-5.0 registry-missing",
          path: REGISTRY_PATH,
          line: 1,
          excerpt: `${REGISTRY_PATH} is missing. Run "bun run ingest" to generate the registry before the gates.`,
        },
      ]

const gitleaksFindings = async (context: GateContext): Promise<readonly Finding[]> => {
  const gitleaks = await runGitleaks(context.root, (binary) => {
    if (existsSync(binary)) return true
    return Bun.which(binary) !== null
  })
  if (gitleaks.ok) return []
  return [
    {
      gate: "G-4" as const,
      rule: "G-4.1 gitleaks",
      path: ".",
      line: 1,
      excerpt: gitleaks.detail === "" ? GITLEAKS_MISSING_MESSAGE : gitleaks.detail,
    },
  ]
}

/**
 * Every gate, in the order `runGates` reports it. **The single declaration of the gate set.**
 *
 * This table used to be an array literal inside `runGates`, and "how many gates does this
 * repository have" was a separate hand-written answer in ten files, which had already gone stale
 * twice — once when G-6.5 landed and once when G-7 did, leaving the README, the disclosure, this
 * package's own description and AGENTS.md section 14 all asserting a smaller number than CI
 * actually runs. Prose about a number drifts; a table does not, so the table is the number now and
 * `GATE_IDS` is derived from it. `docs-gates.ts` checks every file in the repository against the
 * derived value, which is what makes the next gate addition a build failure rather than a stale
 * sentence somebody notices a week later (AGENTS.md section 17).
 *
 * G-4 is last in the table because it is the slow one, so `GATE_IDS` sorts numerically rather
 * than taking the table's order — otherwise the gate set would read `… G-6, G-7, G-4`.
 */
const GATES: readonly GateSpec[] = [
  { gate: "G-1", run: (context) => gateNoSimilarity(context.files) },
  { gate: "G-2", run: (context) => gateNoRawHtml(context.files) },
  { gate: "G-3", run: (context) => gateNoEvasion(context.files) },
  { gate: "G-5", run: (context) => licenceFindings(context.registry) },
  { gate: "G-6", run: (context) => gateNoFalseVerified(context.files) },
  { gate: "G-7", run: (context) => gateVerdictPathPurity(context.files) },
  { gate: "G-4", run: gitleaksFindings },
]

/** The gate that needs the gitleaks binary, and is therefore skippable by the self-tests. */
const GITLEAKS_GATE: GateId = "G-4"

/**
 * Every gate id, ascending. The authoritative answer to "how many gates does this run?".
 *
 * Derived from `GATES` rather than restated, so a gate cannot be added to the runner without
 * appearing here — and therefore without the documentation check noticing that the prose
 * disagrees.
 */
export const GATE_IDS: readonly GateId[] = GATES.map((spec) => spec.gate).sort((a, b) => gateNumber(a) - gateNumber(b))

/** The highest-numbered gate, whose id every correct range claim ends on. */
export const HIGHEST_GATE_ID: GateId = GATE_IDS.reduce((highest, gate) =>
  gateNumber(gate) > gateNumber(highest) ? gate : highest,
)

/**
 * Run every gate except `skipGitleaks`, in the table's order.
 */
export const runGates = async (options: RunGatesOptions): Promise<readonly GateOutcome[]> => {
  const files = options.files ?? (await collectSourceFiles(options.root))
  const registry =
    options.registry === undefined ? await parseRegistry(options.root) : { parsed: options.registry, present: true }
  const context: GateContext = { root: options.root, files, registry }
  const specs = GATES.filter((spec) => options.skipGitleaks !== true || spec.gate !== GITLEAKS_GATE)

  const outcomes: GateOutcome[] = []
  for (const spec of specs) {
    outcomes.push({ gate: spec.gate, findings: await spec.run(context) })
  }
  return outcomes
}

/** Human-readable summary. Empty string when everything passed. */
export const summariseOutcomes = (outcomes: readonly GateOutcome[]): string => {
  const sections = outcomes
    .filter((outcome) => outcome.findings.length > 0)
    .map((outcome) => `GATE ${outcome.gate} FAILED (${outcome.findings.length})\n${formatFindings(outcome.findings)}`)
  return sections.join("\n\n")
}

export * as RunGates from "./run-gates.ts"
