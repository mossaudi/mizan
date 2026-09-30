import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, extname } from "node:path"
import {
  checkBacktickedPaths,
  checkDocumentedScripts,
  checkEnvVars,
  checkRegistryClaims,
  claim,
  type DocsClaim,
} from "./docs-claims.ts"
import { checkGateCountClaim, GATE_CLAIM_EXCLUDES, GATE_CLAIM_EXTENSIONS } from "./docs-gates.ts"
import { checkSnapshotArithmetic } from "./docs-snapshot.ts"
import { checkEvalBreadth } from "./docs-artifacts.ts"
import { checkLiveProviderClaim } from "./docs-egress.ts"
import { checkAnswerQualityClaim, checkBenchmarkClaimUnbacked, type StatedBenchmark } from "./docs-value.ts"
import { ADR_DIRECTORY, checkAdrCitationUnresolved, checkAdrDocument } from "./docs-adr.ts"
import { checkCorpusAbsenceUnstated } from "./docs-corpus.ts"
import { isDeclaredGenerated } from "./docs-generated.ts"
import { checkRunbookOrder } from "./docs-runbook.ts"
import { collectCorpusSurfaces } from "./docs-surfaces.ts"
import { GATE_IDS } from "./run-gates.ts"
import { byPath, collectSourceFilesSync, productionFiles, underPrefix, type SourceFile } from "./scan.ts"

/**
 * D-1's runner: the IO half, so the rules in `docs-claims.ts`, `docs-gates.ts`,
 * `docs-snapshot.ts`, `docs-artifacts.ts`, `docs-egress.ts`, `docs-value.ts`, `docs-adr.ts`,
 * `docs-corpus.ts`, `docs-generated.ts` and `docs-runbook.ts` stay pure and testable.
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
export const BENCHMARK_ARTEFACT = "data/benchmark/vs-search.json"
export const VALUE_PROOF = "docs/value-proof.md"
export const DEMO_RUNBOOK = "docs/demo-runbook.md"
/** The declaration R1 consults before calling a documented path missing. Audited, never scanned. */
export const GITIGNORE = ".gitignore"

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
 *
 * `docs/value-proof.md` is here for the same reason a second time: it is the document that prints
 * the benchmark's figures, so it is where an unbacked number would be believed. It is audited when
 * present and not required, exactly like `.env.example` — a fork that ships no value-proof pack has
 * committed no defect, and telling it the pack "is required by the submission" would be a claim
 * about a submission it is not making.
 *
 * `docs/demo-runbook.md` is audited for the ordinary mechanical reasons and one unusual one. The
 * mechanical ones are R1 and R4: a runbook is a list of commands, and a renamed script or a moved
 * file in one costs a judge the sixty seconds the document promised. The unusual one is
 * `docs-runbook.ts` — that runbook exists to keep a live run ahead of a labelled replay, and the
 * ordering is the claim. It is audited when present and not required, for the same reason as the
 * other two: a fork that ships no runbook has committed no defect, and
 * `test/docs-runbook.test.ts` is what holds *this* submission to having one.
 */
export const AUDITED_DOCUMENTS = [...REQUIRED_DOCUMENTS, ENV_EXAMPLE, VALUE_PROOF, DEMO_RUNBOOK] as const

/** A `Set` rather than `REQUIRED_DOCUMENTS.includes`, which will not accept a wider union. */
const REQUIRED: ReadonlySet<string> = new Set(REQUIRED_DOCUMENTS)

export type DocsCheckResult = {
  readonly ok: boolean
  readonly claims: readonly DocsClaim[]
  readonly checked: readonly string[]
  /** How many files the whole-tree R8 sweep read. Reported so the summary cannot understate it. */
  readonly swept: number
}

/**
 * Every file the R8 sweep reads, in a stable order.
 *
 * **Discovered, not declared.** A declared list of the files allowed to make a gate-count claim is
 * an allowlist, and an allowlist is bypassed by the next file that starts making the claim — which
 * is exactly how the ten stale sites accumulated in the first place, each one added after the
 * previous had been corrected by hand. Walking the tree means a new file is covered the moment it
 * exists, and a file that makes no claim costs one regex over its text and produces nothing.
 *
 * Tests are included deliberately, unlike the source rules. The scope here is "does this sentence
 * state a number", not "does this code do something forbidden", so there is no fixture-shaped
 * false positive to design around — a planted violation in a test is text like any other, and
 * `test/docs-gates.test.ts` builds its own out of fragments so the rule does not read its fixtures.
 */
const collectGateClaimFiles = (root: string): readonly SourceFile[] => {
  const extensions: ReadonlySet<string> = new Set(GATE_CLAIM_EXTENSIONS)
  const found: SourceFile[] = []
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`
      if (GATE_CLAIM_EXCLUDES.some((excluded) => path.startsWith(excluded) || entry.name === excluded)) continue
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), path)
        continue
      }
      if (!extensions.has(extname(entry.name))) continue
      found.push({ path, text: readFileSync(join(directory, entry.name), "utf8") })
    }
  }
  walk(root, "")
  // `byPath` rather than a second inlined comparator: the sweep's report order is a claim about
  // the check just as much as a gate's is, and `scan.ts` already states what "in order" means
  // (UTF-16 code units, never `localeCompare`).
  return found.sort(byPath)
}

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
 * The ADR identifiers that resolve, read from the directory rather than declared.
 *
 * A declared list is the defect this rule exists to remove: the next ADR would be written, cited,
 * and left off the list, and the check would report a citation that resolves while missing one that
 * does not. Filenames become identifiers by dropping `.md`, so resolution is filename equality and
 * nothing else — no fuzzy matching, no directory listing in a rule that must stay pure.
 */
const adrIdentifiers = (root: string): ReadonlySet<string> => {
  const directory = join(root, ADR_DIRECTORY)
  if (!existsSync(directory)) return new Set()
  return new Set(
    readdirSync(directory)
      .filter((name) => name.startsWith("ADR-") && name.endsWith(".md"))
      .map((name) => name.slice(0, -".md".length)),
  )
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
  // Every input is listed once even when two rules read it, so the report cannot imply an artefact
  // was audited twice.
  const audited = (relative: string): void => {
    if (!checked.includes(relative)) checked.push(relative)
  }

  // A path a document names belongs to this repository if it is on disk, OR if `.gitignore`
  // declares it a generated artefact. Both halves are needed and the second is the one that was
  // missing: `bun run check:docs` is the first step in `ci.yml`, and on a clean clone it used to
  // exit 1 over `data/corpus.db` — a file the repository builds with `bun run ingest` and
  // deliberately does not ship. `.gitignore` is read rather than a list in this file so there is
  // one authority for what is generated (AGENTS.md section 17); see `docs-generated.ts`.
  const gitignore = readIfPresent(root, GITIGNORE)
  if (gitignore !== null) audited(GITIGNORE)
  const generated = isDeclaredGenerated(gitignore ?? "")
  const inRepository = (relative: string): boolean => existsSync(join(root, relative)) || generated(relative)

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

  // The benchmark artefact travels the same way: R10 judges a document's figures against the
  // committed run, so it needs the run rather than a second account of it. A repository with no
  // benchmark has no artefact to check against, and the rule reports a document that quotes one
  // anyway rather than skipping the section silently.
  const benchmark: StatedBenchmark = { path: BENCHMARK_ARTEFACT, text: readIfPresent(root, BENCHMARK_ARTEFACT) }
  if (benchmark.text !== null) audited(BENCHMARK_ARTEFACT)

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
    claims.push(...checkBacktickedPaths(text, document, inRepository))

    if (scripts !== null) claims.push(...checkDocumentedScripts(text, document, scripts))
    claims.push(...checkEvalBreadth(text, document, evalSets))
    claims.push(...checkLiveProviderClaim(text, document, sources))
    claims.push(...checkBenchmarkClaimUnbacked(text, document, benchmark))
    claims.push(...checkAnswerQualityClaim(text, document))
    if (document === DEMO_RUNBOOK) claims.push(...checkRunbookOrder(text, document))
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

  // R8 runs over the whole tree rather than `AUDITED_DOCUMENTS`, because the files that went stale
  // are mostly not judge-facing documents: they are a CI step name, a `package.json` description
  // and this package's own CLI help. `GATE_IDS` is the truth, so the check cannot be satisfied by
  // a document choosing not to mention the count.
  //
  // R12 rides the same sweep for the opposite reason: a citation lives in a source comment, a
  // module header or an architecture note far more often than it lives in a judge-facing document,
  // and the ~30 dangling sites this rule exists for are exactly the ones nobody was reading. R13
  // runs only over the ADR directory, which the sweep has already located by path.
  const swept = collectGateClaimFiles(root)
  const adrIds = adrIdentifiers(root)
  const adrPrefix = `${ADR_DIRECTORY}/`
  for (const file of swept) {
    claims.push(...checkGateCountClaim(file.text, file.path, GATE_IDS))
    claims.push(...checkAdrCitationUnresolved(file.text, file.path, adrIds))
    if (file.path.startsWith(adrPrefix)) claims.push(...checkAdrDocument(file.text, file.path))
  }

  // R15 rides a surface set of its own rather than the gate sweep: the sweep's job is numbers and
  // gate ids, where a fixture is text like any other, while a corpus-scope claim is made by the
  // documents and decks a judge reads and by nothing else. See `docs-corpus.ts` for why.
  for (const surface of collectCorpusSurfaces(root, AUDITED_DOCUMENTS)) {
    audited(surface.path)
    claims.push(...checkCorpusAbsenceUnstated(surface.text, surface.path))
  }

  return { ok: claims.length === 0, claims, checked, swept: swept.length }
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
