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
import { checkCollectionCoverage, checkCoverageBasis, checkCoverageTableRows, checkMeasuredSetDigest, checkPresenceCollectionNamed, checkPresenceCoverageRecorded, COVERAGE_SET } from "./docs-coverage.ts"
import { checkLiveProviderClaim } from "./docs-egress.ts"
import { checkAnswerQualityClaim, checkBenchmarkClaimUnbacked, statementBacking, type StatedBenchmark } from "./docs-value.ts"
import { checkExternalClaimUnbacked, externalClaimFigures, EXTERNAL_CLAIMS_PATH } from "./docs-external.ts"
import { checkLatencyCorpusNamed, checkLatencyFigureUnbacked } from "./docs-value-latency.ts"
import { checkExecutorLabelBlindness, EXECUTOR_PATH } from "./docs-benchmark.ts"
import { checkVerdictPolarityInverted } from "./docs-polarity.ts"
import { ADR_DIRECTORY, checkAdrCitationUnresolved, checkAdrDocument } from "./docs-adr.ts"
import { checkCorpusAbsenceUnstated, checkCorpusPresenceContradiction, checkServedCollectionsNamed } from "./docs-corpus.ts"
import { isDeclaredGenerated } from "./docs-generated.ts"
import { checkRunbookOrder } from "./docs-runbook.ts"
import { collectCorpusSurfaces } from "./docs-surfaces.ts"
import { GATE_IDS } from "./run-gates.ts"
import { byPath, collectSourceFilesSync, productionFiles, underPrefix, type SourceFile } from "./scan.ts"

/**
 * D-1's runner: the IO half, so the rules in `docs-claims.ts`, `docs-gates.ts`,
 * `docs-snapshot.ts`, `docs-artifacts.ts`, `docs-coverage.ts`, `docs-egress.ts`, `docs-value.ts`,
 * `docs-adr.ts`, `docs-corpus.ts`, `docs-generated.ts` and `docs-runbook.ts` stay pure and testable.
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
export const AUDITED_DOCUMENTS = [
  ...REQUIRED_DOCUMENTS,
  ENV_EXAMPLE,
  VALUE_PROOF,
  DEMO_RUNBOOK,
  "docs/degradation-matrix.md",
  "docs/scaling-path.md",
  "docs/specs/measurements.md",
  "docs/specs/adr/ADR-08.md",
] as const

/** A `Set` rather than `REQUIRED_DOCUMENTS.includes`, which will not accept a wider union. */
const REQUIRED: ReadonlySet<string> = new Set(REQUIRED_DOCUMENTS)

/**
 * The documents that promise every figure they print is sourced, so every percentage anywhere in
 * them is held to that promise (R17's second half; see `docs-external.ts`).
 *
 * One document, and the choice is an argument rather than an accident. `docs/value-proof.md` opens
 * by asserting that every number in it comes from a file committed to this repository, so an
 * unsourced percentage there falsifies a sentence the document makes about itself. The other five
 * audited documents print heterogeneous figures from unrelated commits — `README.md`'s `41.7%`,
 * `INTEGRITY.md`'s `8%`, `DISCLOSURE.md`'s `19%` — none of which promises anything of the sort, and
 * `ADR-C8` names them as the limit this leaves rather than leaving it implicit.
 */
export const FIGURE_PROMISE_DOCUMENTS: ReadonlySet<string> = new Set([VALUE_PROOF])

/**
 * Which files are documents, derived from the one list that says so.
 *
 * The document tier has to come from a single authority, or a caller could quietly demote a
 * judge-facing document to "evidence" by recording it from the wrong block. Nothing else in this
 * file maintains a second list.
 */
const DOCUMENT_TIERS: ReadonlySet<string> = new Set(AUDITED_DOCUMENTS)

/**
 * What a file in `checked` was read for: a `document` whose own claims ran the full rule set, a
 * `surface` that a corpus-scope claim can reach a judge on (R15, plus the whole-tree sweep), or an
 * `evidence` artefact read as the authority a rule judges a document against and never itself
 * audited.
 *
 * ## Why the tier is in the type
 *
 * The report used to print one flat `27 files audited` over a list in which 14 entries had received
 * exactly one rule and seven had only been read as evidence. That is a false claim about this
 * tool's own coverage, made by the tool whose purpose is to stop the repository overstating
 * coverage. A caller now cannot sum the wrong thing, because the wrong thing is not representable.
 */
export type AuditTier = "document" | "surface" | "evidence"

/** One entry in the coverage report: a file, and the strongest tier it was read at. */
export type CheckedFile = { readonly path: string; readonly tier: AuditTier }

export type DocsCheckResult = {
  readonly ok: boolean
  readonly claims: readonly DocsClaim[]
  readonly checked: readonly CheckedFile[]
  /** How many files the whole-tree R8 sweep read. Reported so the summary cannot understate it. */
  readonly swept: number
}

/** The paths in `checked`, for a caller that wants the list and not the tiers. */
export const checkedPaths = (result: DocsCheckResult): readonly string[] => result.checked.map((entry) => entry.path)

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
 * The external-claim registry, parsed as `unknown` and handed to the rule that narrows it.
 *
 * Deliberately not decoded through a schema. This is a committed file the rule itself is auditing,
 * exactly like `data/registry/sources.json`, and the reason a document claim is already handled at
 * that boundary is written down in `docs-claims.ts`: routing a config file that is *under* audit
 * through `decodeOrFail` would only move the question of who checks the schema. The narrow happens
 * in `docs-external.ts`, and anything it cannot vouch for is reported.
 */
const readJson = (root: string, relative: string): unknown => {
  const text = readIfPresent(root, relative)
  if (text === null) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * The collections the attested snapshot serves, read from `collectionCounts`.
 *
 * The authority is the attestation rather than any document, for the same reason
 * `checkSnapshotArithmetic` reads it: the document quotes a count, the attestation is the committed
 * record of that count, and a rule that let a document define the served set would be judging the
 * document by its own testimony.
 *
 * ## Three states, because two of them used to be one
 *
 * This returned an empty set both for "the repository ships no attestation" and for "the attestation
 * is present but says nothing about which collections are served" — and R18 is a rule about
 * collections a surface must *not* renounce, so an empty served set makes every renunciation legal.
 * A malformed attestation therefore disabled the rule while looking exactly like passing it
 * (AGENTS.md section 3, fail closed). `usable: false` is that middle state and the caller turns it
 * into a finding rather than into a smaller rule.
 *
 * The absent case stays `usable: true` with an empty set on purpose, and for the reason
 * `checkSnapshotArithmetic` skips rather than fails: a repository with no attestation makes no claim
 * this rule can falsify. Failing there would punish a fork for a file it never claimed to ship. The
 * line is drawn at *claiming* — an attestation that exists is a claim about the corpus, and one that
 * cannot answer R18's question has failed to keep it.
 */
export type ServedCollections = {
  readonly served: ReadonlySet<string>
  readonly usable: boolean
  /**
   * Collection -> served record count, for the table rule's `served records` column.
   *
   * Kept as the numbers and not just the names because R21d checks a published *corpus size* beside the
   * measurement figures: `docs/value-proof.md` states 5,272 abudawud records next to 15 adjudicated
   * cases, and the second number is measured by us while the first is a property of the snapshot. A set
   * of names cannot compare either, which is why this is a map and not the `served` set. Empty when the
   * attestation is absent or unusable, and `checkCoverageTableRows` treats an empty map as "the served
   * set could not be enumerated" and skips only the stale-row distinction.
   */
  readonly counts: ReadonlyMap<string, number>
}

export const servedCollections = (root: string): ServedCollections => {
  // `readJson` cannot tell an absent file from an unreadable one: both arrive as `null`. The
  // distinction is this rule's whole fail-closed edge — an absent attestation is a repository that
  // claims no corpus, and an unreadable one is a claim that failed to be made — so the presence of the
  // file is asked separately rather than inferred from the parse.
  const text = readIfPresent(root, ATTESTATION)
  if (text === null) return { served: new Set(), usable: true, counts: new Map() }
  const attestation = readJson(root, ATTESTATION)
  if (typeof attestation !== "object" || attestation === null) return { served: new Set(), usable: false, counts: new Map() }
  const counts = (attestation as { readonly collectionCounts?: unknown }).collectionCounts
  if (typeof counts !== "object" || counts === null) return { served: new Set(), usable: false, counts: new Map() }
  const fields = counts as Readonly<Record<string, unknown>>
  const served = new Set(Object.keys(fields).filter((key) => /^[a-z][a-z0-9_]*$/.test(key)))
  // A counts object that yields no usable key is the same defect as a missing field: a record of a
  // corpus naming no collection cannot renounce anything, so R18 would silently police nothing.
  if (served.size === 0) return { served, usable: false, counts: new Map() }
  // A count that is not a finite number cannot be compared against, so it is dropped from `counts` and
  // kept in `served`: the collection demonstrably exists, which is all `served` claims, and the rule that
  // needs its size will skip a column it has no number for rather than invent one.
  const measured = new Map<string, number>()
  for (const [collection, value] of Object.entries(fields)) {
    if (typeof value === "number" && Number.isFinite(value)) measured.set(collection, value)
  }
  return { served, usable: true, counts: measured }
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
  const checked: CheckedFile[] = []
  /**
   * Record a file the run read, at the tier the caller observed it.
   *
   * First record wins, so a path read twice keeps the tier describing the *stronger* claim — and
   * `AUDITED_DOCUMENTS` is consulted here rather than at each call site, so a caller cannot demote
   * a document to `evidence` by recording it from the wrong block. `.env.example` is the case in
   * point: R2 reads it, and it is also an audited document.
   */
  const recorded = (relative: string, tier: AuditTier): void => {
    if (checked.some((entry) => entry.path === relative)) return
    checked.push({ path: relative, tier: DOCUMENT_TIERS.has(relative) ? "document" : tier })
  }

  // A path a document names belongs to this repository if it is on disk, OR if `.gitignore`
  // declares it a generated artefact. Both halves are needed and the second is the one that was
  // missing: `bun run check:docs` is the first step in `ci.yml`, and on a clean clone it used to
  // exit 1 over `data/corpus.db` — a file the repository builds with `bun run ingest` and
  // deliberately does not ship. `.gitignore` is read rather than a list in this file so there is
  // one authority for what is generated (AGENTS.md section 17); see `docs-generated.ts`.
  const gitignore = readIfPresent(root, GITIGNORE)
  if (gitignore !== null) recorded(GITIGNORE, "evidence")
  const generated = isDeclaredGenerated(gitignore ?? "")
  const inRepository = (relative: string): boolean => existsSync(join(root, relative)) || generated(relative)

  const envExample = readIfPresent(root, ENV_EXAMPLE)
  const provider = readIfPresent(root, PROVIDER_SOURCE)
  if (envExample !== null && provider !== null) {
    recorded(ENV_EXAMPLE, "evidence")
    recorded(PROVIDER_SOURCE, "evidence")
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
  for (const set of evalSets) if (set.text !== null) recorded(set.path, "evidence")

  // The benchmark artefact travels the same way: R10 judges a document's figures against the
  // committed run, so it needs the run rather than a second account of it. A repository with no
  // benchmark has no artefact to check against, and the rule reports a document that quotes one
  // anyway rather than skipping the section silently.
  const benchmark: StatedBenchmark = { path: BENCHMARK_ARTEFACT, text: readIfPresent(root, BENCHMARK_ARTEFACT) }
  if (benchmark.text !== null) recorded(BENCHMARK_ARTEFACT, "evidence")

  // The audited documents' texts, gathered for R21b's artefact half below. Kept as one list rather than a
  // boolean flag because the rule needs to *name* the documents whose figures cannot be attributed, and a
  // flag would leave it inventing that list from the set of all audited documents.
  const auditedTexts: { document: string; text: string }[] = []

  // R17's registry. Read whole — it is a few kilobytes — and passed to the documents below, which
  // are the only place a figure can be attributed to it. `null` when absent, which the rule reports
  // against any document that still tries to attribute something.
  const externalClaims = readJson(root, EXTERNAL_CLAIMS_PATH)
  if (externalClaims !== null) recorded(EXTERNAL_CLAIMS_PATH, "evidence")
  // Narrowed once, by the module that owns the narrowing, and handed to both rules: rule ten needs
  // the figures it may back a section with, and rule seventeen needs to know which entries exist.
  const externalFigures = externalClaimFigures(externalClaims)

  // R17's promise half is given its backing set where the promise is checked rather than here, because
  // the set is a function of the document as well as of the artefact: a percentage is admitted only
  // where that document *attributes* it, on that line, to a named rate. Built once for all six
  // documents it would have been a union of six different answers. `statementBacking` is still the only
  // place that says which strings may stand for a published figure, so this file never answers that
  // question itself (§17) — and it stays empty when the artefact is missing, because a repository whose
  // artefact is gone has *fewer* things it may state, never more.

  const scripts = scriptsIn(root)
  const sources = productSources(root)

  /**
   * The served set and its per-collection sizes, read before the document sweep.
   *
   * Hoisted above the sweep for R21d: the table rule compares a document's `served records` column
   * against the attestation, and it is one artefact read for two rules rather than a second read of the
   * same file. Every comment below about *why* the attestation is read this way still applies; only the
   * position changed. `const` because a later reassignment would let the two rules see two corpora in
   * one run (AGENTS.md section 6).
   */
  const served = servedCollections(root)

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
    recorded(document, "document")
    auditedTexts.push({ document, text })
    claims.push(...checkBacktickedPaths(text, document, inRepository))

    if (scripts !== null) claims.push(...checkDocumentedScripts(text, document, scripts))
    claims.push(...checkEvalBreadth(text, document, evalSets))
    claims.push(...checkLiveProviderClaim(text, document, sources))
    claims.push(...checkBenchmarkClaimUnbacked(text, document, benchmark, externalFigures))
    claims.push(...checkAnswerQualityClaim(text, document))
    claims.push(...checkExternalClaimUnbacked(text, document, externalClaims, FIGURE_PROMISE_DOCUMENTS.has(document) ? { backing: statementBacking(text, benchmark) } : undefined))
    // R18. Read from the SAME artefact as rule ten, on purpose: a second artefact would be a second
    // answer to "what did this repository measure", and a second place for the two to disagree. It adds
    // the tolerance and the corpus-identity requirement that rule ten has no opinion about, and nothing
    // else — see `docs-value-latency.ts` for why this is an extension and not a copy.
    claims.push(...checkLatencyFigureUnbacked(text, document, benchmark, externalFigures.map((entry) => entry.figure)))
    claims.push(...checkLatencyCorpusNamed(text, document, benchmark))
    // R21b, on the same artefact and for the same reason as R18 above: this asks WHICH SET a presence
    // figure is over, which no figure comparison can answer. A document stating no presence figure is
    // not this rule's business — it reports nothing rather than manufacturing a finding, because a rule
    // that fires on every document trains its readers to ignore it.
    claims.push(...checkPresenceCollectionNamed(text, document, benchmark))
    // R21d, the table half of the same question. It runs on the *audited* documents only, because a
    // coverage table is a disclosure artefact and a per-collection row appearing in an unrelated fixture
    // is not a claim about this repository's measurements. Kept after R21b's sentence rule so a table
    // whose figures are fine and whose prose is not reports the prose defect alone: two findings for one
    // drifting number is what makes a reader stop reading the second.
    claims.push(...checkCoverageTableRows(text, document, benchmark, served.counts))
    // The provenance of that table, on the same artefact and for the same reason: a per-collection table
    // states fifteen cases without saying which fifteen, and every other number here is checked against an
    // artefact while that one was not. Runs immediately after the table rule so a document whose table is
    // both stale and unattributed reports the numbers first — a reader can act on the count before they
    // read about provenance.
    claims.push(...checkMeasuredSetDigest(text, document, benchmark))
    if (document === DEMO_RUNBOOK) claims.push(...checkRunbookOrder(text, document))
  }

  // R21b's artefact half, asked once and AFTER the sweep rather than once per document inside it: a
  // `vs-search.json` that records no coverage is one defect in one file, and reporting it against ten
  // documents would name the wrong culprit ten times and bury the line that names the right one. It runs
  // here because it needs the documents, and it stays silent when none of them states a presence figure —
  // demanding attribution for a claim nobody made is the same defect as inventing one.
  claims.push(...checkPresenceCoverageRecorded({ path: BENCHMARK_ARTEFACT, text: benchmark.text }, auditedTexts))

  const registry = readIfPresent(root, REGISTRY)
  const disclosure = readIfPresent(root, "DISCLOSURE.md")
  if (registry !== null && disclosure !== null) {
    recorded(REGISTRY, "evidence")
    claims.push(...checkRegistryClaims(registry, disclosure))
  }

  // The snapshot arithmetic is checked against `attestation.json` rather than against the corpus,
  // which is the point: the disclosure quotes a number, the attestation is the committed record of
  // that number, and the two must not drift. A repository with no attestation has nothing to check
  // against and therefore makes no claim this rule can falsify, so it is skipped rather than failed.
  const attestation = readIfPresent(root, ATTESTATION)
  if (attestation !== null) {
    recorded(ATTESTATION, "evidence")
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
  //
  // R18 and R20 ride the same set, for the same reason and with the same reasoning each way: R18 is
  // the mirror of R15 — a surface may not renounce a collection the snapshot serves — and R20 is a
  // claim about what this repository's procedure returns, which is made in the same documents and in
  // no fixture. A rule that ran over the `.ts` sweep instead would be reading test fixtures that
  // quote `rejected` and `unverifiable` by the hundred.
  //
  // ADR-15. The rule that reads the attestation for the *served set* rather than for a published
  // count, so it takes the same `usable` flag as R18 - the pair that distinguishes "no corpus is
  // claimed" from "a corpus is claimed and cannot be enumerated". It runs here, beside R18 rather
  // than inside the snapshot block above, because it answers a different question about the same
  // artefact: not "does this document quote the right number" but "was every served collection ever
  // asked to be falsified".
  const redTeamText = readIfPresent(root, REDTEAM_EVAL)
  claims.push(...checkCollectionCoverage(served.served, served.usable, redTeamText, COVERAGE_SET))
  if (!served.usable) {
    claims.push(
      claim(
        "corpus-absence-stated-for-served-collection",
        ATTESTATION,
        `${ATTESTATION} carries no readable \`collectionCounts\`, so the set of collections this snapshot serves is unknown and R18 cannot tell a surface renouncing one from a surface describing it; an attestation that cannot answer the question has not kept the claim it makes`,
      ),
    )
  }
  // R18's completeness half, checked once against the attestation rather than per surface: a served
  // collection with no name in `NAMES` is one no document can be judged about, so the corpus growing
  // fails the build here instead of quietly widening what the rule cannot see. Skipped when the
  // attestation is unusable, because the finding above has already said the served set is unknown and
  // a second finding computed from that unknown set would be noise.
  if (served.usable) claims.push(...checkServedCollectionsNamed(ATTESTATION, served.served))
  for (const surface of collectCorpusSurfaces(root, AUDITED_DOCUMENTS)) {
    recorded(surface.path, "surface")
    claims.push(...checkCorpusAbsenceUnstated(surface.text, surface.path))
    if (served.usable) claims.push(...checkCorpusPresenceContradiction(surface.text, surface.path, served.served))
    claims.push(...checkVerdictPolarityInverted(surface.text, surface.path))
    // SB-005's scope note rides the same surface set as R20 for the same reason: a document's
    // coverage basis is claimed on the document a judge reads, and the scope list inside the rule
    // keeps it to the two files that publish the measurement.
    claims.push(...checkCoverageBasis(surface.text, surface.path))
  }

  // R19 is the one new rule that reads a source file rather than a document, because its subject is
  // a source file: the benchmark executor that produces the detection rate. A missing executor is a
  // finding rather than a skip, because `docs/value-proof.md` now states that this scan exists — so
  // a repository without the file is a repository whose claim about the scan is false, which is the
  // one state a rule here may not let pass.
  const executor = readIfPresent(root, EXECUTOR_PATH)
  recorded(EXECUTOR_PATH, "evidence")
  if (executor === null) {
    claims.push(claim("executor-label-blindness", EXECUTOR_PATH, `${EXECUTOR_PATH} is absent, so the anti-tautology scan cannot run and the documents that state it is shipped are describing a check this repository does not have`))
  }
  if (executor !== null) {
    claims.push(...checkExecutorLabelBlindness(executor, EXECUTOR_PATH))
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
