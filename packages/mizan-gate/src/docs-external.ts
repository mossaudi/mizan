import { claim, type DocsClaim } from "./docs-claims.ts"
import { benchmarkScope, FIGURE_PATTERN, figuresIn, renderingsOf, type ExternalFigure, type StatementBacking } from "./docs-value.ts"

/**
 * R17 — a third-party figure printed in an audited document resolves to a registry entry, and every
 * entry it resolves to carries the citation that makes the figure checkable; and in the one document
 * that promises every figure it prints is sourced, every percentage anywhere in it resolves to some
 * committed authority.
 *
 * ## Why a figure needs a registry at all
 *
 * `docs/value-proof.md` opens by promising that every number printed in it comes from a file
 * committed to this repository, and rules ten and fourteen keep that promise honest: a benchmark
 * figure the artefact does not publish fails the build, and an answer-quality claim fails it too.
 * That is a good property with one consequence — a *third-party* figure has nowhere to go. The only
 * detection rate the committed artefact publishes is 100.0%, and the market question a judge
 * actually asks is about other products.
 *
 * So the honest options were to weaken the promise or to admit a second class. Weakening it is the
 * defect this repository exists to prevent: a document whose opening sentence is false is worse
 * than a document that makes no market claim at all. The class is therefore admitted, and the price
 * is that every figure in it is *cited* rather than asserted. `data/registry/external-claims.json`
 * records the number, the publishing organisation, a URL, the date it was retrieved and what the
 * figure measures. `ownsVerdict` is present and `false` on every row, so the ADR-C2 boundary is
 * stated in machine-readable form rather than in prose no rule can read.
 *
 * ## Why a marker, and why a heading cannot stand in for one
 *
 * Rule ten is scoped **by heading**: `SECTION_TOPIC` in `docs-value.ts` opens a benchmark section,
 * and that scope is deliberately narrow. Which means a figure could be made to pass by renaming a
 * heading, and a rule satisfiable by editing a title is not a rule. So the class is marked in the
 * text instead — a document attributes a figure by writing `external-claim:<id>` — and this rule
 * checks that the id resolves and that the entry it names is complete.
 *
 * `SECTION_TOPIC` is untouched, deliberately. A cited external figure inside a benchmark-titled
 * section passes rule ten *because it is in the registry*, a second committed authority, and not
 * because the heading changed. Widening `SECTION_TOPIC` to sweep third-party numbers would have
 * been the shortcut, and it would export rule ten's heading scope across the whole document, which
 * is the failure mode that scoping was introduced to prevent.
 *
 * ## The promise half, and the limit it leaves
 *
 * Leaving rule ten's heading scope alone leaves a real hole, and it was reported as one: a figure
 * printed *above* the benchmark section, or under a heading that does not match `SECTION_TOPIC`, is
 * policed by no rule at all. `93%` typed into the comparison table passes, and the opening sentence of
 * the document is false. A published invariant that is not the enforced one is the exact defect class
 * this repository is about, so ADR-C8 was amended rather than left aspirational.
 *
 * The fix is scoped by *document*, not by section, and to one document. `docs/value-proof.md` is the
 * only audited document that states "every number here comes from a file committed to this
 * repository", so it is the only one where an unsourced percentage falsifies something the document
 * itself asserts. Every percentage anywhere in that document must resolve, **on the line that states
 * it**, to a rate this document attributes there to a named field of the artefact, or to a registry
 * entry; the entry path is owned by the marker half above, so the promise half only has to reject
 * percentages that *nobody* vouches for.
 *
 * "On the line that states it" is load-bearing and was not in the first version of this half. The
 * credit was collected into one document-wide set, so it carried no position: a rendering the
 * document attributed *somewhere* vouched for the same digits *everywhere*, and `100.0% of the
 * corpus text is Arabic.` passed while the benchmark table printed `100.0%` on another line. That is
 * the published invariant not being the enforced one, which is the defect class this rule was written
 * to correct — stated here because the code comment is what the next reader believes.
 *
 * Per line is the right unit rather than the cheap one, and the reason is §17: rule ten's attribution
 * is already read per line by `rowClaims` and `proseClaims`, so the positional promise reuses the
 * notion rule ten enforces instead of inventing a second one. The residual is stated rather than
 * papered over — a hard-wrapped claim must keep the field name with its figure, and a percentage in
 * the same sentence on another line is still uncredited.
 *
 * ## The marker half was scoped the other way, and that was the same hole once more
 *
 * The promise half was widened to the whole body. The marker half was not: it still looked for a
 * citation only inside rule ten's benchmark sections, so a registry figure printed anywhere else in
 * the promising document needed no marker at all. The review named the consequence with a probe
 * rather than an opinion — the two markers in the shipped `docs/value-proof.md` sit at lines 40 and 42,
 * under a heading that matches no `SECTION_TOPIC`, so `benchmarkScope` contained neither, and deleting
 * every marker in the file produced **zero** findings. The project's own headline market claim was
 * therefore uncitable in practice while the build stayed green, and the asymmetry was the tell: an
 * unmarked `60%` inside a benchmark section fired, the same `60%` outside one did not.
 *
 * So the marker half now takes the same scope the promise half takes, from the same `promise`
 * argument, and the two halves are one rule over one scope: a document that promises every figure is
 * sourced owes a citation for every registry figure it prints, wherever it prints it. A document that
 * makes no promise keeps the section scope, so the other five audited documents gain no obligation
 * they never made.
 *
 * ## Scope is not credit, and reading it as credit was this rule's third version of the same hole
 *
 * That widening created a new one, and it is the one this amendment closes. Widening the scope made
 * the scope *one run covering the whole document*, and the attribution was read out of that run — so
 * a rendering the document cited **anywhere** vouched for the same digits **everywhere**. The probe
 * was one line: appending `60% of the corpus text is Arabic.` to `docs/value-proof.md` passed
 * `bun run check:docs` with the build green, because `external-claim:tow-miscited-share` sits
 * eleven lines above it. `50%` and `90%` were the same, against the two range entries.
 *
 * That is arithmetic coincidence dressed as a citation, and it is the CWE-345 shape this repository
 * was built to refuse: the number is fabricated and the check says somebody measured it. The tell was
 * the same every time — the code comment describing a stricter rule than the code enforced, which is
 * why this section exists at all.
 *
 * **Scope says which lines are examined; credit says which lines are attributed.** They are separate
 * properties and conflating them is the defect. Scope stays as it is — whole body for a document that
 * promises its figures, benchmark sections otherwise — because scope decides how much of a document
 * the rule reaches. Credit is now per line, so a registry figure is credited only where a marker for
 * it sits on the line that states it.
 *
 * Per line rather than per paragraph or per document, and the reason is §17 again: the promise half
 * already credits a rate per line through `statementBacking`, so this reuses the single notion of
 * position the package enforces instead of introducing a second one. The cost is written down where
 * it is paid — a hard-wrapped figure must keep its marker with it — and `docs/value-proof.md` is
 * reflowed to satisfy the rule the ADR publishes. The residual is stated rather than papered over: a
 * marker one line below its figure credits nothing, and the finding says so by naming the line.
 *
 * ## Why attribution rather than the artefact's whole number space
 *
 * The first version of that half asked only "does the artefact publish a figure that renders as this
 * one?", and the answer admitted every numeric field: `caseCount` of 40 made `40%` pass,
 * `corpusRecordCount` made `27,234%` pass and `schemaVersion` made `2%` pass. All three are
 * nonsensical percentages, and `93%` failing while `40%` passed is a rule whose remaining hole is a
 * keystroke. Worse, `65` is `baselineTop1HitRate`'s whole-number rendering, so *"the incumbent misses
 * 65% of its citations"* passed on the strength of a figure measured **here** — the unsourced market
 * claim this ADR exists to refuse, admitted by arithmetic coincidence.
 *
 * So the answer is now per rendering, per attribution, and per line. `statementBacking` in
 * `docs-value.ts` credits a rendering only where this document names the rate it belongs to, and only
 * on that line, which is rule ten's own attribution machinery rather than a second one: the table row
 * that prints `65.0%` beside `` `baselineTop1HitRate` `` credits `65.0`, a sentence that prints
 * `` `baselineTop1HitRate` is 65% `` credits `65`, and a `65%` that names neither fails. Counts and
 * the percentage-point `delta` are not rates at all and are never credited, so `40%`, `27,234%`,
 * `2%` and `35%` fail whatever else is in the artefact. All three properties — one rendering, one
 * attribution, one line — are enforced rather than implied, because a published invariant that is not
 * the enforced one is the defect class this rule was written to correct.
 *
 * The widening is deliberately not applied to the other five audited documents, and ADR-C8 names the
 * figures it therefore does not police — `README.md`'s `41.7%` and `99%`, `INTEGRITY.md`'s `8%`,
 * `DISCLOSURE.md`'s `19%`. Those are heterogeneous quantities from unrelated commits; a rule that
 * demanded all six documents source every percentage would either be satisfied by registering more
 * numbers or be switched off, and the document that actually promises something is the one worth
 * holding to it. The other residual is the *shape*: only a figure followed by `%` or by `percent` is
 * a percentage here, so a figure written as `0·6` is invisible to this rule — stated in the ADR
 * rather than papered over.
 *
 * ## Why the URLs are data and never a request
 *
 * Nothing here fetches a URL. `check:docs` is a build-time string check that runs offline, the gate
 * that does egress reads a code-only allowlist, and this file is a committed JSON document that G-4
 * sweeps like every other. A URL recorded as a citation is data, never a fetch target, so adding a
 * source cannot introduce an outbound request (A10).
 */

/** Where the registry lives, relative to the repository root. */
export const EXTERNAL_CLAIMS_PATH = "data/registry/external-claims.json"

/**
 * The marker a document writes to attribute a figure: `external-claim:<id>`.
 *
 * The prefix is assembled from fragments so this module's own source is never read as a citation by
 * the rule that hunts for one, and the character class admits the ids a registry actually holds, so
 * a half-typed marker is read as a marker and reported as unresolvable rather than matching nothing.
 */
const MARKER_PREFIX = "external" + "-claim:"
const CLAIM_MARKER = new RegExp(`${MARKER_PREFIX}([a-z0-9][a-z0-9._-]*)`, "g")

/** The fields that make an entry a citation rather than a number someone remembered. */
const REQUIRED_TEXT_FIELDS = ["statement", "source", "url", "retrievedOn", "scope"] as const

/** An ISO calendar date, the only shape `retrievedOn` accepts. A figure with no retrieval date is undated. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** An entry as it arrived, before anything in it has been believed. */
type RawEntry = Readonly<Record<string, unknown>>

const asRecord = (value: unknown): RawEntry | null => (typeof value === "object" && value !== null ? (value as RawEntry) : null)

const textField = (entry: RawEntry, field: string): string => (typeof entry[field] === "string" ? (entry[field] as string) : "")

const isBlank = (value: string): boolean => value.trim().length === 0

/** The `claims` array as records, dropping anything that is not an object. */
const claimEntries = (registry: unknown): readonly RawEntry[] => {
  const root = asRecord(registry)
  if (root === null) return []
  const claims = root["claims"]
  if (!Array.isArray(claims)) return []
  return claims.flatMap((raw): readonly RawEntry[] => {
    const entry = asRecord(raw)
    return entry === null ? [] : [entry]
  })
}

/** Every entry, by id. A registry with no `claims` array yields an empty map, so every marker fails. */
const entriesById = (registry: unknown): ReadonlyMap<string, RawEntry> => {
  const byId = new Map<string, RawEntry>()
  for (const entry of claimEntries(registry)) {
    const id = textField(entry, "id")
    if (id === "") continue
    if (byId.has(id)) continue
    byId.set(id, entry)
  }
  return byId
}

/**
 * The figures the registry publishes, ignoring entries this rule cannot vouch for.
 *
 * An entry with no numeric figure is not a figure, and an entry whose figure is not a finite number
 * is worse: folding it in would make `NaN` a rendering and back a number no document wrote. Both are
 * reported against the document that cites the entry, which is where the fix belongs.
 */
const usableFigures = (entries: ReadonlyMap<string, RawEntry>): readonly ExternalFigure[] =>
  [...entries].flatMap(([id, entry]): readonly ExternalFigure[] => {
    const figure = entry["figure"]
    if (typeof figure !== "number" || !Number.isFinite(figure)) return []
    return [{ id, figure }]
  })

/**
 * The figures the registry publishes, in the shape `docs-value.ts` folds into rule ten's backing set.
 *
 * Exported so the narrowing happens once: rule ten and rule seventeen must agree about which
 * figures exist, and two independent parses of one file would be two answers to the same question.
 */
export const externalClaimFigures = (registry: unknown): readonly ExternalFigure[] => usableFigures(entriesById(registry))

/** The ids this document attributes a figure to, in the order it cites them, without repeats. */
const citedIds = (document: string): readonly string[] => {
  const seen = new Set<string>()
  for (const match of document.matchAll(CLAIM_MARKER)) {
    const id = match[1]
    if (id === undefined) continue
    seen.add(id)
  }
  return [...seen]
}

/** What is wrong with one entry, as findings against the document that cited it. */
const entryFindings = (id: string, entry: RawEntry, file: string): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  const reported = (detail: string): void => {
    claims.push(claim("external-claim-unbacked", file, `\`${MARKER_PREFIX}${id}\` resolves to a registry entry that ${detail}; a figure a reader cannot trace is not a citation`))
  }
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!isBlank(textField(entry, field))) continue
    reported(`carries no ${field}`)
  }
  const retrieved = textField(entry, "retrievedOn")
  if (!isBlank(retrieved) && !ISO_DATE.test(retrieved)) reported(`carries retrievedOn "${retrieved}", which is not an ISO date`)
  const figure = entry["figure"]
  if (typeof figure !== "number" || !Number.isFinite(figure)) reported("carries no finite numeric figure to back")
  if (entry["ownsVerdict"] !== false) reported("does not state ownsVerdict: false, so the ADR-C2 boundary between a cited figure and one of ours is unstated")
  return claims
}

/**
 * Where the marker half looks for a citation, phrased for a finding.
 *
 * Two scopes, and the second is not a refinement of the first — it is the scope that is *required*.
 * The first is a section, because that is the unit a reader reaches when a document claims a number.
 * The second is the whole document, and it is what the review found missing.
 *
 * A set of lines rather than a set of runs, and the distinction is the whole point of this rule:
 * `lines` says which lines are *examined*, and the marker that credits a figure is read off the very
 * line that states it. Bundling the lines into a run to search it for any marker is what let a figure
 * at the end of a 200-line document borrow a citation printed near the top.
 */
type MarkerScope = { readonly lines: ReadonlySet<number>; readonly where: string; readonly markerWhere: string }

/**
 * The half of the rule that closes the smuggling route.
 *
 * Rule ten's backing now includes the registry's figures, so a third-party number printed inside a
 * benchmark section would otherwise pass silently — and "our detection rate is 60%" is exactly the
 * over-claiming ADR-C2 exists to forbid. The citation is therefore required: the figure has to carry
 * a marker for a matching entry in the same scope.
 *
 * ## Why the scope is the whole document for a document that promises its figures
 *
 * It was benchmark sections only, and that is a hole the review named with a probe rather than an
 * opinion: the two markers in `docs/value-proof.md` sit at its lines 40 and 42, under a heading that
 * matches no `SECTION_TOPIC`, so `benchmarkScope` contained neither. Deleting every marker in the
 * document then produced **zero** findings — the project's own headline market claim was uncitable in
 * practice while the build stayed green, and the asymmetry was the point: an unmarked `60%` inside a
 * benchmark section fired, and the same `60%` outside one did not.
 *
 * The fix is the same widening the promise half already applies, and it inherits that half's
 * justification: `docs/value-proof.md` is the one audited document that asserts every figure in it
 * comes from a committed file, so the citation it owes is owed for the whole body rather than for the
 * parts rule ten happens to reach. A document that makes no such promise keeps the section scope, so
 * this adds no new obligation to the other five audited documents.
 *
* The residual is stated rather than hidden: an uncited figure in a *promise* document is now reported
  * document-wide, while a non-promise document still gets the section scope — and the finding names
  * which of the two it read, so a reader can tell which rule reached the number.
  *
  * Widening the scope does not widen the credit, which is the distinction the next half draws: these
  * are the lines to examine, and each one is attributed only by what is on it.
  */
const markerScope = (document: string, wholeBody: boolean): MarkerScope => {
  if (!wholeBody) return { lines: benchmarkScope(document), where: "of this document's benchmark section", markerWhere: "in the section" }
  const rows = document.split("\n")
  return { lines: new Set(rows.map((_, index) => index)), where: "of this document", markerWhere: "anywhere in this document" }
}

/**
 * The half of the rule that says a third-party figure is cited by saying whose it is.
 *
 * A registry figure is credited **only** by a marker for a matching entry that appears on the very line
 * that states the figure. That is the whole rule, and it is stated here because three previous versions
 * of it were each enforced more loosely than their comments claimed: document-wide credit let
 * `60% of the corpus text is Arabic.` pass on the strength of a Tow Center citation eleven lines
 * above it, in a document that promises every number in it comes from a committed file.
 *
 * Per line rather than per paragraph, section or document, and §17 is the reason: the promise half
 * already answers "may *this* percentage stand *here*" from `statementBacking`, so this half answers
 * its own question the same way and the package holds one notion of position rather than three. The
 * price is a document must wrap a cited figure together with its marker, which is a formatting rule
 * no judge will resent and a fabricated figure cannot satisfy by proximity.
 *
 * One finding per figure per line, for the same reason the promise half deduplicates: a figure printed
 * twice on one line is one thing to fix, and a repeated finding trains the reader to skip the rule.
 */
const unmarkedFigures = (document: string, file: string, figures: readonly ExternalFigure[], wholeBody: boolean): readonly DocsClaim[] => {
  if (figures.length === 0) return []
  const rows = document.split("\n")
  const claims: DocsClaim[] = []
  const { lines, where, markerWhere } = markerScope(document, wholeBody)
  for (const index of [...lines].sort((left, right) => left - right)) {
    const row = rows[index] ?? ""
    const attributed = new Set(citedIds(row))
    for (const stated of figuresIn([row])) {
      const matches = figures.filter((entry) => renderingsOf(entry.figure).includes(stated))
      if (matches.length === 0) continue
      if (matches.some((entry) => attributed.has(entry.id))) continue
      claims.push(
        claim(
          "external-claim-unbacked",
          file,
          `line ${index + 1} ${where} states ${stated}, which ${EXTERNAL_CLAIMS_PATH} publishes for ${matches.map((entry) => `\`${MARKER_PREFIX}${entry.id}\``).join(" and ")}, but that line carries no such marker — a marker ${markerWhere} attributes nothing here; a third-party figure has to say whose it is, on the line that says it`,
        ),
      )
    }
  }
  return claims
}

/**
 * A percentage, which is a figure followed by a percent sign or the spelled-out word.
 *
 * `FIGURE_PATTERN` does the work of finding the figure without finding a fragment of one, so the
 * suffix here is the only thing this adds. Two spellings rather than one because a rule that catches
 * `93%` and not `93 percent` is a rule whose remaining hole is a single keystroke.
 */
const PERCENT_FIGURE = new RegExp(`(${FIGURE_PATTERN})((?:[ \\t]*%)|(?:[ \\t]+percent\\b))`, "gi")

/** One percentage as the document spells it: its line, its digits, and the sign that made it one. */
type StatedPercentage = { readonly line: number; readonly stated: string; readonly sign: string }

/**
 * Every percentage a document states, deduplicated per line and in document order.
 *
 * Per line rather than per document because the finding names a line, and per line deduplication
 * rather than per document because one figure printed in a table and repeated in the sentence under
 * it is one error to fix, not two.
 */
const statedPercentages = (rows: readonly string[]): readonly StatedPercentage[] => {
  const found: StatedPercentage[] = []
  for (const [index, row] of rows.entries()) {
    const seen = new Set<string>()
    for (const match of row.matchAll(PERCENT_FIGURE)) {
      const stated = match[1]
      if (stated === undefined || seen.has(stated)) continue
      seen.add(stated)
      found.push({ line: index + 1, stated, sign: match[2] ?? "%" })
    }
  }
  return found
}

/**
 * What the promise half is allowed to accept, handed in by the caller that has read the artefact.
 *
 * The per-line backing rather than a pooled set, because the question is per occurrence: "may *this*
 * percentage stand *here*". `docs-external.ts` must not grow a second reader of `vs-search.json`
 * either — `docs-value.ts` already parses it, already knows which of its quantities are rates, and
 * already defines what a figure may be spelled as, so asking for its answer is what keeps one
 * question from having two (§17). The backing is built from *this document's* attributions rather
 * than from every rate the artefact publishes: the union would admit `65%` merely because
 * `baselineTop1HitRate` is 0.65, which is the unsourced market claim this rule exists to refuse.
 */
export type FigurePromise = { readonly backing: StatementBacking }

/**
 * The half of the rule that makes the document's own opening sentence true.
 *
 * Scoped to the whole body of the document rather than to its benchmark sections, which is the whole
 * point: the sentence `docs/value-proof.md` opens with makes no mention of sections, and a rule that
 * only checked the section would be checking something the document never claimed. A percentage that
 * resolves to a registry entry is left to the marker half, because that half already says the more
 * specific thing — the figure exists, it just does not say whose it is — and two findings for one
 * defect trains the reader to ignore both.
 *
 * The credit is read at the percentage's own line, so an attributed rendering vouches for the claim
 * that attributes it and for nothing else. `docs/value-proof.md` prints `100.0%` and `0.0%` in its
 * benchmark table, and both spellings are therefore *credited spellings*; the finding below is what
 * stops an unrelated statistic elsewhere in the body from borrowing one of them.
 *
 * The registry skip on the last line is a **delegation, not a credit**, and the distinction is
 * load-bearing. It says "the marker half owns this figure", because the marker half reaches the same
 * body and says the more specific thing. It grants nothing: with the marker half reading attribution
 * off each figure's own line, an uncited `60%` is reported there — which is the probe that used to
 * pass, since this half skipped every registry rendering while the marker half credited a document-
 * wide set. Had the two halves been left reading scopes differently, this skip would have become a
 * silent hole, so the shape is now: every registry figure has exactly one owner, and that owner
 * checks position.
 */
const unsourcedPercentages = (document: string, file: string, figures: readonly ExternalFigure[], promise: FigurePromise): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  for (const { line, stated, sign } of statedPercentages(document.split("\n"))) {
    if (promise.backing.byLine.get(line)?.has(stated) === true) continue
    // Delegated, not admitted: see the note above. The registry half reports it on its own terms.
    if (figures.some((entry) => renderingsOf(entry.figure).includes(stated))) continue
    claims.push(
      claim(
        "promise-figure-unbacked",
        file,
        `line ${line} states ${stated}${sign}, which this document attributes to no rate the benchmark artefact publishes and which no entry in ${EXTERNAL_CLAIMS_PATH} publishes either, yet this document promises that every figure it prints comes from a file committed to this repository; name the \`Artefact field\` beside it or cite the source`,
      ),
    )
  }
  return claims
}

/**
 * R17: every external-marked figure in a document resolves to a registry entry, and the entry it
 * names carries the citation that makes the figure checkable.
 *
 * @param registry the parsed `external-claims.json`, or `null` when the repository ships none. A
 *   missing registry is not a licence to print figures — it is a licence to print *nothing*, and a
 *   marker with no registry behind it is reported rather than ignored (AGENTS.md §3).
 * @param promise present only for a document that promises every figure it prints is sourced, and
 *   then the promise is enforced across the whole document rather than rule ten's benchmark sections.
 */
export const checkExternalClaimUnbacked = (document: string, file: string, registry: unknown, promise?: FigurePromise): readonly DocsClaim[] => {
  const entries = entriesById(registry)
  const figures = usableFigures(entries)
  const claims: DocsClaim[] = []
  for (const id of citedIds(document)) {
    const entry = entries.get(id)
    if (entry === undefined) {
      claims.push(claim("external-claim-unbacked", file, `this document attributes a figure to \`${MARKER_PREFIX}${id}\`, and ${EXTERNAL_CLAIMS_PATH} holds no entry with that id; an unresolvable attribution is not a citation`))
      continue
    }
    claims.push(...entryFindings(id, entry, file))
  }
  claims.push(...unmarkedFigures(document, file, figures, promise !== undefined))
  if (promise !== undefined) claims.push(...unsourcedPercentages(document, file, figures, promise))
  return claims
}

export * as DocsExternal from "./docs-external.ts"
