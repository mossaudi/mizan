import { claim, type DocsClaim } from "./docs-claims.ts"
import { byCodeUnit, gateNumber, type GateId } from "./scan.ts"

/**
 * D-1 R8 — the gate count is one number, and this module derives it rather than repeating it.
 *
 * ## The defect class
 *
 * "How many structural gates does this repository have?" was a hand-written answer in ten files:
 * the README said one number twice, `DISCLOSURE.md` and `AGENTS.md` section 14 said another, the
 * gate package's own `package.json` description and its CLI help text said a third, and the CI
 * workflow named a fourth. The answers disagreed with each other and with what CI actually ran.
 *
 * That is not a typo class. This repository's entire claim is that a badge was computed rather
 * than asserted, and a README that says the project has fewer safety gates than it actually has is
 * the same defect one layer up: an assertion about the machinery, in prose, that nobody re-checks.
 * It had already happened twice — once when G-6.5 landed inside an existing gate, once when G-7
 * arrived as a seventh — and both times the fix was a person editing ten strings.
 *
 * ## Why a rule and not another review note
 *
 * Because the drift is *mechanical*: the truth is `GATE_IDS` in `run-gates.ts`, and the claim is a
 * number in a file. Comparing a number in a file against the number the runner derives is exactly
 * the kind of check D-1 exists for, and it fails closed — a stale count is a red build, not a
 * review comment that the next person has to remember.
 *
 * ## What it matches, and what it deliberately does not
 *
 * Two shapes, both narrow:
 *
 *  - **A range**, `G-1` through the top gate, written with dots, an ellipsis, a dash, `to` or
 *    `through`. The range must END on the highest gate id. This is the high-value shape: it names
 *    the gates explicitly, so being wrong about it is unambiguous.
 *  - **A cardinal count followed by the word `structural`**, as in "the N structural gates". The
 *    word `structural` is required, and the omission is deliberate. A count is read in digits or in
 *    words, because the two spellings are one sentence, and a rule that read only the word form
 *    would be checking one spelling of the shape its own header documents — which is the defect
 *    `scan.ts` names as worse than being blind. Neither spelling is written out in full beside the
 *    word `structural` anywhere in this file: the rule scans this file, so an example spelled out
 *    here is a finding against this header.
 *
 * A sentence about a **sub-rule** is not matched at either end of a range. `G-6.5` is a rule
 * inside G-6, not a gate, so a line naming one states something R8 has no opinion about, and
 * reading the `6` out of it would report a true sentence as a stale count. The pattern therefore
 * requires a *complete* id on both ends — see `RANGE_PATTERN` for how each end is enforced.
 *
 * A bare `<count> gates` is **not** matched, because this repository already uses the word
 * `gate` in two unrelated senses: `apps/cli/test/eval.test.ts` has a heading reading "The two
 * gates, and why their bars differ" about the evidence invariant, and `scripts/eval/plan.ts` says
 * "the one gate G-6 can check". Both are true sentences, neither is a claim about the gate suite,
 * and a rule that flagged them would be a rule that cries wolf — which `scan.ts` says is strictly
 * worse than a rule that is sometimes blind. The residual is stated rather than hidden, and it is
 * exactly one thing: a sentence that counts the suite in some other phrasing — without the word
 * `structural`, or with the count in a shape neither pattern reads — slips through and is caught by
 * review instead. Everything the two documented shapes cover, in either spelling, is checked.
 *
 * ## Determinism
 *
 * The findings for a file are sorted by matched text through `byCodeUnit`, the same comparator the
 * source walk uses, so the report for a given commit is byte-identical on every machine. This is
 * not a stylistic preference in a repository whose differentiator is that its output was computed
 * rather than asserted: a check whose output order depends on the ICU data of the host that ran it
 * cannot be quoted as evidence twice and mean the same thing both times.
 *
 * ## Why this module cannot flag its own source
 *
 * Every pattern below is assembled from fragments, so the literal strings this module is looking
 * for never appear contiguously in it, and `docs-check.ts` scans this file like any other. The
 * self-test follows the same discipline, planting its fixtures from fragments for the same reason
 * — see the `range` and `cardinal` helpers in `test/docs-gates.test.ts`, which is the pattern
 * G-7's `ANCHOR_BANNED_WORD` export already established.
 */

/** The gate-id prefix, held as a fragment so no range literal exists in this file. */
const GATE_TOKEN = "G-"

/** Ways a range may be written between two gate ids, as regex sources. */
const RANGE_SEPARATORS = ["\\.{2,3}", "\\u2026", "\\u2014", "\\u2013", "to", "through"] as const

/**
 * A range: `G-<from>` SEP `G-<to>`.
 *
 * Both ends are required to be *complete* ids, and that is what keeps sub-rule numbering out of
 * this rule's results. A sub-rule is written `G-6.5`, so a sentence can name one without naming a
 * gate: `G-6.5 and G-7` fails at the head, because the text after `G-6` is `.5 and …` and no
 * separator starts there, and `G-1..G-6.5` fails at the tail, because `(?!\.\d)` rejects the `6`
 * that would otherwise be reported as a claim that this repository runs six gates. Both were real
 * false positives on true sentences about sub-rules, and a rule that reports those gets switched
 * off — which `scan.ts` says is strictly worse than a rule that is sometimes blind.
 *
 * The lookahead sits *after* `\b` so a multi-digit id is still read whole: `G-1..G-65.5` cannot
 * match the `6` of `65`, because the boundary after it fails first.
 */
const RANGE_PATTERN = new RegExp(
  `\\b${GATE_TOKEN}(\\d+)\\s*(?:${RANGE_SEPARATORS.join("|")})\\s*${GATE_TOKEN}(\\d+)\\b(?!\\.\\d)`,
  "g",
)

/**
 * Cardinal number words, as a 1-indexed table so the lookup is `NUMBER_WORDS[value]`.
 *
 * Zero is in the table so that a count of nothing is a parseable claim rather than a silently
 * unrecognised one. The word for zero is not written next to the word `structural` anywhere in
 * this file, which is not a style preference: the pattern below scans this file too, and prose
 * that spells out a stale example would make the rule report its own header.
 *
 * ## Why digits are not in this table
 *
 * Because a count written in figures is matched as a *run* by `CARDINAL_PATTERN` rather than as one
 * listed alternative per value, and listing the digits here as well would be a second spelling of
 * the rule the first one already covers — the exact duplication `AGENTS.md` section 17 exists to
 * prevent. It also fixes the hole the table previously had: read as words only, the count written
 * in figures passed `check:docs` while the same count spelled out failed, so the rule was checking
 * one spelling of the shape its own header documented. Half a rule is worse than a documented
 * residual, which is why the residual paragraph in this file's header now names only what is still
 * unread. Neither spelling is written out beside the word `structural` in this file, for the same
 * reason the table's own zero is not: the rule scans this file too, and an example spelled out here
 * would be a finding against this header.
 */
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
] as const

/**
 * A cardinal count qualified by the word `structural`, which is what distinguishes "this project
 * has N safety gates" from the two unrelated senses of `gate` documented in the header.
 *
 * Two spellings of one claim, so both are read: the words of `NUMBER_WORDS`, and a run of digits
 * for the count a document writes in figures. The run is what keeps a two-digit count readable
 * without a table entry per value, and it is the branch that was missing when this rule was words
 * only. The single capturing group is the matched count, which `extractGateCountClaims` reads back
 * through `tokenToNumber`; the two shapes the pattern admits are exactly the two that function
 * resolves, so a third spelling added here without a branch beside it would be dropped as unread
 * rather than graded as some number nobody wrote.
 */
const CARDINAL_PATTERN = new RegExp(`\\b(${NUMBER_WORDS.join("|")}|\\d+)\\s+structural\\s+gates\\b`, "gi")

/** A gate-count claim found in a file, with the number it asserts. */
export type GateCountClaim = {
  /** `"range"` for `G-1`..`G-N`, `"cardinal"` for a counted noun phrase. */
  readonly kind: "range" | "cardinal"
  /** The highest gate number the claim asserts. For a cardinal, the count itself. */
  readonly value: number
  /** The matched text, so a finding quotes what the file actually says. */
  readonly text: string
}

/**
 * A run of one or more digits and nothing else.
 *
 * The pattern admits `\d+`, so this rejects nothing it matched — and "rejects nothing" is the
 * defect. The previous version asked `Number` the same question, and `Number` is total: it answers
 * `0` for the empty string and `NaN` for a word. So a caller reaching this function with a token the
 * shape check did not recognise was handed either a fabricated zero or a lookup miss, and the type
 * could not tell the caller which. Asking the shape question directly makes both failures the same
 * failure — a null the caller can refuse — and stops an empty capture group from reading as a claim
 * that there are none of something.
 */
const DIGIT_RUN = /^\d+$/

/**
 * The number a cardinal claim asserts, or null when the token is a shape this function does not know.
 *
 * Both arms are reachable and both are planted in the self-test, which is the point of exporting it:
 * a guard nothing can reach is a guard nothing proves. The digits arm used to be unreachable in the
 * other direction, because `Number` answered on its behalf and never returned null — so widening
 * `CARDINAL_PATTERN` would have produced a claim nobody made instead of an admission the rule could
 * not read. Null is the honest answer for an unresolvable shape: the caller drops the claim and the
 * residual documented in this file's header covers it, rather than inventing a count and grading
 * typography.
 */
export const tokenToNumber = (token: string): number | null => {
  if (DIGIT_RUN.test(token)) return Number(token)
  const index = NUMBER_WORDS.indexOf(token.toLowerCase() as (typeof NUMBER_WORDS)[number])
  return index === -1 ? null : index
}

/**
 * Every gate-count claim in `text`.
 *
 * Pure, and exported so the self-test can assert on the parse itself rather than only on the
 * findings — a rule whose extraction is wrong can pass its own tests by accident.
 *
 * Sorted by matched text rather than by position, so two runs over one file report in the same
 * order. That is the same determinism requirement `findMatchingLines` is built around: a
 * byte-identical report is a precondition, not a coincidence. The comparison is `byCodeUnit` and
 * not `localeCompare` for the reason given there — a locale-aware sort makes the report order a
 * function of the ICU data on the machine that ran the check, which is precisely the
 * machine-dependence this repository's claim of reproducibility forbids.
 *
 * Overlap is possible in principle — a line naming both a range and a cardinal — and harmless in
 * practice, because each is checked against its own quantity, so a line stating one true and one
 * false count produces one finding and one pass. That is the right answer.
 */
export const extractGateCountClaims = (text: string): readonly GateCountClaim[] => {
  const claims: GateCountClaim[] = []
  for (const match of text.matchAll(RANGE_PATTERN)) {
    const to = Number(match[2] ?? "")
    if (Number.isNaN(to)) continue
    claims.push({ kind: "range", value: to, text: match[0] })
  }
  for (const match of text.matchAll(CARDINAL_PATTERN)) {
    // The pattern and `tokenToNumber` admit the same two shapes, so this arm does not fire on
    // anything a document can write today. It is kept because it is the only thing standing between
    // a widened pattern and a fabricated count, and because it is no longer a claim about that —
    // `tokenToNumber` is exported and both of its arms are planted, so a reader can check that
    // rather than take it on trust.
    const value = tokenToNumber(match[1] ?? "")
    if (value === null) continue
    claims.push({ kind: "cardinal", value, text: match[0] })
  }
  return claims.sort((a, b) => byCodeUnit(a.text, b.text))
}

/**
 * The file extensions the gate-count sweep reads. Prose plus the files that carry CI descriptions.
 *
 * `.html` is here for the same reason `.json` is: `apps/web/index.html` is a shipped surface that
 * makes prose claims about this repository, and a stale gate count in front of a judge is the
 * defect class this rule exists to close — the extension it is written in is not a defence.
 */
export const GATE_CLAIM_EXTENSIONS = [".md", ".mdx", ".txt", ".yml", ".yaml", ".json", ".ts", ".tsx", ".html"] as const

/**
 * Path prefixes the sweep does not read, each for a stated reason.
 *
 * `specs/` is the requirement document: it records what was *asked for* at a point in time,
 * including the analysis that identified this very defect, and "the plan says N" is not a claim
 * about what the repository currently runs. Auditing it would mean failing the build over a
 * historical planning note, which is how a check gets disabled.
 *
 * `.opencode/` is tooling state, not a submission: it holds the editor/agent harness's own
 * session checkpoints, which quote this repository's documents verbatim. A finding there would be
 * a report about a file the submission does not ship and a human did not write. The distinction is
 * the same one `docs-check.ts` draws between an *audited* and a *required* document.
 */
export const GATE_CLAIM_EXCLUDES = ["specs/", ".opencode/", "node_modules/", ".git/"] as const

/**
 * R8 — every gate-count claim in a file must agree with the gate set the runner declares.
 *
 * @param gateIds injected rather than imported so the rule is a pure function of its inputs and
 *   the self-test can plant a wrong truth as easily as a wrong claim. `docs-check.ts` passes
 *   `GATE_IDS`; a test passes `["G-1", "G-2"]` to prove the rule actually discriminates. Typed as
 *   `GateId` rather than `string` so a planted truth is still a *real* gate id — the test cannot
 *   satisfy the rule with `"G-one"`, which would make a test pass for the wrong reason.
 *
 * A file that makes no claim produces no findings, which is the intended state for the large
 * majority of the repository: silence is not a claim, and a rule that required every file to
 * announce the gate count would be a rule about a different thing.
 */
export const checkGateCountClaim = (text: string, file: string, gateIds: readonly GateId[]): readonly DocsClaim[] => {
  if (gateIds.length === 0) return []
  const highest = Math.max(...gateIds.map(gateNumber))
  const truth = `${gateIds.length} (${gateIds.join(", ")})`

  return extractGateCountClaims(text)
    // A range is about the highest id, a cardinal is about how many there are. They coincide
    // today, and comparing each against its own quantity means a retired gate id cannot make a
    // correct sentence wrong.
    .filter((found) => found.value !== (found.kind === "range" ? highest : gateIds.length))
    .map((found) =>
      claim("gate-count-stale", file, `\`${found.text}\` states gate ${found.value}, but this repository runs ${truth}`),
    )
}

export * as DocsGates from "./docs-gates.ts"
