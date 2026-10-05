/**
 * D-1 — the documentation may only claim what the repository contains.
 *
 * ## The defect class
 *
 * `DISCLOSURE.md` is the document a judge reads to decide what was actually built, and it had
 * drifted from the repository in six places at once. Six of the ten backticked file paths it
 * pointed at did not exist: there is no `packages/mizan-gate/src/evaluate.ts`, no
 * `packages/mizan-corpus/src/registry.ts`, no `packages/mizan-agent/src/provider/port.ts`, no
 * `packages/mizan-gate/src/capability.ts`, no `packages/mizan-corpus/src/grade.ts`, and no
 * `data/questions/synthetic.json`. It also described a local `llama.cpp`/Ollama inference path
 * that was never implemented, and `.env.example` documented eight environment variables of which
 * the code read none.
 *
 * Every one of those is a claim a judge would reasonably rely on. A disclosure that points at
 * files which are not there is not a stylistic problem: it is the disclosure asserting, in the
 * most specific way available, that work exists which does not.
 *
 * ## Why this is a gate and not a review note
 *
 * Because the same drift recurs. The provider variable names had already been renamed once and
 * the documentation had not followed. There is no natural moment at which a human re-reads a
 * disclosure against a directory listing, and no test that would fail. So the rules below make the
 * drift impossible to commit rather than merely unlikely, and each one is a pure function over file
 * contents so it can be tested by planting a violation.
 *
 * This is deliberately NOT a gate. The gates have published numbers, an acceptance criterion each,
 * and a `runGates` entry. Renumbering or adding to that list would change published claims about
 * what this project guarantees, and "we have seven gates" is itself a claim a judge can check —
 * which is why R8 now checks it against the gate table rather than leaving it to review. The doc
 * rules stay a separate check with a distinct name that runs in the same CI job.
 *
 * ## What it does and does not check
 *
 * It checks the mechanical classes: file paths, environment variables, registry claims, documented
 * commands, the snapshot arithmetic in `docs-snapshot.ts`, the claims a document makes about the
 * repository's own artefacts in `docs-artifacts.ts`, the figures and quality claims a document
 * makes in `docs-value.ts`, the corpus-scope renunciations in `docs-corpus.ts`, and the live-before-
 * replay ordering of the demo runbook in `docs-runbook.ts`. It cannot check
 * whether a *prose* sentence is
 * true - no gate can, and a gate that claimed to would be the over-claiming AGENTS.md section 12
 * warns about. A judgement call like "a locally hosted model underperforms" stays a human's call;
 * "this file exists", "this number is the number in `attestation.json`" and "no two cases share a
 * span" do not.
 */

/** The rules, in the order they are reported. The name is what a failing build prints. */
export type DocsRule =
  | "missing-path"
  | "env-var-not-implemented"
  | "env-var-undocumented"
  | "unknown-licence-class"
  | "disabled-source-without-reason"
  | "enabled-source-not-disclosed"
  | "unknown-script"
  | "snapshot-count-mismatch"
  | "eval-breadth-overstated"
  | "eval-artefact-unreadable"
  | "eval-coverage-below-floor"
  | "eval-coverage-unmeasured"
  | "eval-coverage-unserved-collection"
  | "eval-fabrication-not-rejected"
  | "presence-coverage-unrecorded"
  | "presence-claim-unbacked"
  | "presence-row-stale"
  | "live-provider-denied"
  | "gate-count-stale"
  | "benchmark-claim-unbacked"
  | "latency-claim-unbacked"
  | "latency-corpus-unnamed"
  | "answer-quality-claim"
  | "adr-citation-unresolved"
  | "adr-document-incomplete"
  | "corpus-absence-unstated"
  | "corpus-absence-stated-for-served-collection"
  | "external-claim-unbacked"
  | "promise-figure-unbacked"
  | "executor-label-blindness"
  | "verdict-polarity-inverted"
  | "runbook-live-after-replay"
  | "runbook-live-unlabelled"
  | "runbook-replay-unlabelled"
  | "runbook-no-live-path"
  | "runbook-no-replay"

export type DocsClaim = {
  readonly rule: DocsRule
  /** The file making the claim, relative to the repository root. */
  readonly file: string
  /** What is wrong, phrased so the fix is obvious from the message. */
  readonly detail: string
}

/** One broken claim. */
export const claim = (rule: DocsRule, file: string, detail: string): DocsClaim => ({ rule, file, detail })

/**
 * Backticked strings that look like repository paths.
 *
 * A deliberately narrow shape: a backticked token containing a `/` and no whitespace, which
 * excludes prose like `bun run ingest`, shell fragments and inline code. Requiring the token to
 * start with a known top-level directory means a false positive needs a backticked
 * slash-containing word that also begins with a real directory name, which is not a mistake
 * anyone makes in documentation.
 */
const TOP_LEVEL_DIRECTORIES = ["apps", "packages", "scripts", "data", "docs", ".github"] as const

const BACKTICKED = /`([^`\s]+)`/g

const looksLikePath = (token: string): boolean => {
  if (!token.includes("/")) return false
  if (token.startsWith("http")) return false
  return TOP_LEVEL_DIRECTORIES.some((directory) => token === directory || token.startsWith(`${directory}/`))
}

/**
 * The path a glob pattern is really about.
 *
 * `data/eval/*.json` is a shape, not a file, and `existsSync` on it is always false — a rule that
 * reported it would be a false positive, and a gate that cries wolf gets disabled. So a token
 * containing `*` or `?` is checked as its literal directory prefix, which is the claim actually
 * being made: that this directory is where those files live. A glob whose parent does not exist is
 * still a wrong claim.
 */
const globPrefix = (token: string): string | null => {
  const firstWildcard = token.search(/[*?]/)
  if (firstWildcard === -1) return null
  const prefix = token.slice(0, firstWildcard)
  const lastSlash = prefix.lastIndexOf("/")
  if (lastSlash === -1) return null
  return prefix.slice(0, lastSlash)
}

/**
 * R1: every backticked repository path in a document must exist on disk, or be a declared
 * generated artefact.
 *
 * @param inRepository injected so the rule is testable without a filesystem, and so the caller
 *   decides what "belongs to this repository" means — the CI shim answers `existsSync(join(root,
 *   path))` OR "`.gitignore` declares it generated", because a reproducible artefact the repository
 *   ships the rule for is a true claim on a clean clone. See `docs-generated.ts` for why that is the
 *   fail-closed direction and not a loophole.
 */
export const checkBacktickedPaths = (text: string, file: string, inRepository: (path: string) => boolean): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const [, token] of text.matchAll(BACKTICKED)) {
    if (token === undefined || !looksLikePath(token)) continue
    const globbed = globPrefix(token)
    if (globbed !== null) {
      if (inRepository(globbed)) continue
      claims.push(claim("missing-path", file, `\`${token}\` names files in \`${globbed}\`, which does not exist in this repository`))
      continue
    }
    if (inRepository(token)) continue
    claims.push(claim("missing-path", file, `\`${token}\` does not exist in this repository`))
  }
  return claims
}

/** `NAME=…` or `export const NAME = "…"` lines in `.env.example`. */
const ENV_ASSIGNMENT = /^\s*(?:export\s+const\s+)?MIZAN_[A-Z_]+\s*=/gm

/** `export const ENV_X = "MIZAN_X"` in the provider module. */
const ENV_CONSTANT = /export const ENV_[A-Z_]+ = "(MIZAN_[A-Z_]+)"/g

const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort()

/**
 * R2: `.env.example` and `provider-config.ts` must describe the same set of variables, in both
 * directions.
 *
 * Both directions are checked because they are different defects with different fixes. A variable
 * in `.env.example` that no code reads is a documented feature that does not exist — eight of
 * them, before the fix. A variable the code reads that `.env.example` omits is a feature nobody
 * can discover, which is how `MIZAN_API_KEY` survived while every document named something else.
 *
 * Matching the *value* of the `ENV_*` constants rather than their names is what makes this
 * work: the code calls the variable `ENV_API_KEY` and the document calls it `MIZAN_LLM_API_KEY`,
 * and only the string literal is comparable.
 */
export const checkEnvVars = (envExample: string, providerSource: string): readonly DocsClaim[] => {
  const documented = unique([...envExample.matchAll(ENV_ASSIGNMENT)].map((match) => match[0].replace(/^\s*(?:export\s+const\s+)?/, "").replace(/\s*=.*/, "").trim()))
  const implemented = unique([...providerSource.matchAll(ENV_CONSTANT)].map((match) => match[1] ?? ""))

  const claims: DocsClaim[] = []
  for (const name of documented) {
    if (implemented.includes(name)) continue
    claims.push(claim("env-var-not-implemented", ".env.example", `${name} is documented but no code reads it`))
  }
  for (const name of implemented) {
    if (documented.includes(name)) continue
    claims.push(claim("env-var-undocumented", ".env.example", `${name} is read by apps/cli/src/provider-config.ts but not documented`))
  }
  return claims
}

/** The licence classes `SourceDescriptor` admits. Mirrors `@mizan/core/schema/source.ts`. */
export const LICENCE_CLASSES = ["permissive", "no-derivatives", "content-only", "unconfirmed"] as const

type RegistrySource = {
  readonly title: string
  readonly enabled: boolean
  readonly licenceClass: string
  readonly exclusionReason: string | null
}

/**
 * R3: the registry and the disclosure must agree about every source.
 *
 * Narrow, structural, and aimed at the specific claim that was wrong. A source that is
 * `enabled: false` with no `exclusionReason` has no honest sentence anyone could write about it,
 * so the document is a place where "we excluded it because…" is required rather than optional. An
 * enabled source that the disclosure does not mention is a shipped dataset nobody was told about.
 *
 * `JSON.parse` here is deliberate and safe: `data/registry/sources.json` is a committed file this
 * module is auditing, and the shape is narrowed by a guard immediately below. The trust boundary
 * that matters — model output and HTTP responses — goes through `decodeOrFail` (AGENTS.md §1); a
 * committed config file that is itself under audit is not a trust boundary, and routing it
 * through a schema decoder would only move the question of who checks the schema.
 */
export const checkRegistryClaims = (registryText: string, disclosureText: string): readonly DocsClaim[] => {
  let sources: readonly RegistrySource[]
  try {
    const parsed = JSON.parse(registryText) as { readonly sources?: unknown }
    if (!Array.isArray(parsed.sources)) return [claim("unknown-licence-class", "data/registry/sources.json", "no `sources` array: the registry cannot be audited")]
    sources = parsed.sources.filter((entry): entry is RegistrySource => {
      if (typeof entry !== "object" || entry === null) return false
      const candidate = entry as Partial<RegistrySource>
      return typeof candidate.title === "string" && typeof candidate.enabled === "boolean" && typeof candidate.licenceClass === "string"
    })
  } catch (cause) {
    return [claim("unknown-licence-class", "data/registry/sources.json", `not valid JSON: ${cause instanceof Error ? cause.message : "parse error"}`)]
  }

  const claims: DocsClaim[] = []
  for (const source of sources) {
    const known = (LICENCE_CLASSES as readonly string[]).includes(source.licenceClass)
    if (!known) {
      claims.push(claim("unknown-licence-class", "data/registry/sources.json", `${source.title} has licenceClass "${source.licenceClass}", which is not one of ${LICENCE_CLASSES.join(", ")}`))
    }
    if (!source.enabled && (source.exclusionReason === null || source.exclusionReason.trim().length === 0)) {
      claims.push(claim("disabled-source-without-reason", "data/registry/sources.json", `${source.title} is disabled with no exclusionReason, so the disclosure has nothing honest to say about it`))
    }
    if (source.enabled && !mentionsSource(disclosureText, source.title)) {
      claims.push(claim("enabled-source-not-disclosed", "DISCLOSURE.md", `${source.title} is enabled in the registry but is not named in the disclosure`))
    }
  }
  return claims
}

/**
 * Whether a document names a source.
 *
 * Three normalisations, each earning its place by preventing a *false* failure on a correct
 * document:
 *
 * - **Case.** Somebody writes "tanzil" for "Tanzil" and the build breaks over a capital letter.
 * - **Dashes.** The registry titles contain a real em-dash (U+2014) — `Tanzil — Qur'an` — because
 *   a human wrote them. Every editor, every "fix the dashes" pass and this author's own first
 *   draft replaced it with a hyphen, and the disclosure then failed to name a source it named in
 *   plain sight. Dash-shaped characters are folded to `-`.
 * - **Quotes.** `'` versus `’` in "Qur'an" is the same class of accident.
 *
 * What it deliberately does NOT do is shorten the title to a keyword. "Tanzil" alone must not
 * satisfy the check, because the point of the rule is that an *enabled dataset* is disclosed, and
 * a passing check that a keyword appears is a passing check that proves less than the rule claims.
 */
const normaliseForMention = (text: string): string =>
  text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase()

const mentionsSource = (document: string, title: string): boolean =>
  normaliseForMention(document).includes(normaliseForMention(title))

/** `bun run name` in a fenced code block. */
const RUN_SCRIPT = /bun run ([a-z][a-z0-9:_-]*)/g

/**
 * R4: every command a document tells a judge to run must be a real script.
 *
 * This is the smallest rule and the one most likely to fire, because a renamed script is a much
 * easier mistake to make than a wrong licence claim. A disclosure that says `bun run verify` when
 * the script is `verify:ledger` costs a judge the exact sixty seconds the section promised them.
 */
export const checkDocumentedScripts = (text: string, file: string, scripts: Readonly<Record<string, string>>): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const [, name] of text.matchAll(RUN_SCRIPT)) {
    if (name === undefined) continue
    if (name in scripts) continue
    claims.push(claim("unknown-script", file, `\`bun run ${name}\` is documented but package.json has no "${name}" script`))
  }
  return claims
}

export * as DocsClaims from "./docs-claims.ts"
