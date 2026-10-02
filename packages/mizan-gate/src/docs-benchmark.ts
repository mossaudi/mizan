import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * R19 — the benchmark executor names no verdict expectation, so its detection rate cannot be a
 * restatement of the labels it would be restating.
 *
 * ## The defect this closes
 *
 * The previous system arm computed "detection" from the set's *declared* expectations, so on a
 * red-team set — where every case is declared caught — its detection rate was 1.0 by construction.
 * On such a set a tautology and a perfect verifier are indistinguishable, so a benchmark that cannot
 * be wrong is not evidence. The arm was rewritten to run the real verifier, and its label-blindness
 * rested on two things: the `SystemCase` type carrying no field a label could arrive in, and
 * *review* of one file. The second half was honest and unchecked, and the two documents that say so
 * name the missing scan as unshipped.
 *
 * This is that scan.
 *
 * ## Why the scope is one file and not a tree-wide token ban
 *
 * The obvious rule — "no source file may mention a verdict expectation" — is wrong, and wrong in the
 * direction that breaks the build. `scripts/eval/` *must* be able to hold labels: it is the generator
 * that publishes the sets, it holds the 66 hand-adjudicated rulings, and a generator forbidden from
 * writing `expectedVerdict` cannot express what a case is expected to be. The ban belongs on the
 * **executor**, which alone must be unable to see the labels. Scoping it there fails in the safe
 * direction: a rename of the executor stops this rule matching and R1 fails separately on the same
 * rename, and a token introduced under a name this list does not carry is a review question rather
 * than a silent hole — which is why the token list is identifier-shaped and a *missing* file is a
 * finding rather than a skip.
 *
 * ## Why these tokens and not the word `verdict`
 *
 * The executor is a verifier driver; it says `verdict` in its types, its field names and its prose,
 * and a rule that banned that word would report the file for doing its job. The tokens below are the
 * *label-bearing* identifiers — the ones that name what a case is supposed to come out as. A new one
 * is a one-line addition, and the comment in the executor that says the check is now shipped should
 * be updated with it.
 */

/** The file the ban applies to, relative to the repository root. */
export const EXECUTOR_PATH = "scripts/benchmark/system-arm.ts"

/**
 * Identifiers that carry a verdict expectation. Word-bounded, case- and separator-insensitive, and
 * matched against the source with comments left in place.
 *
 * Leaving comments in is a deliberate choice against the obvious alternative. Stripping them would
 * need a small parser, and a small parser is a second thing to keep correct — a stripper that treats
 * `//` in `"https://…"` as a comment would silently hide every token after the first URL in the
 * file, which is the fail-open direction. So the source is read whole, and a token inside a comment
 * is reported.
 *
 * That costs a false positive, and the cost was paid immediately and in the most useful way possible:
 * the executor's own header used to list the banned identifiers to explain the ban, and tripped the
 * rule. The header now points at this module instead. The list has exactly one home, and a
 * documentation sentence is not a licence to hold two copies of it.
 */
export const LABEL_TOKENS: readonly string[] = [
  "expectedVerdict",
  "expectedOutcome",
  "expectedReason",
  "verdictCounts",
  "groundTruth",
  "isFabrication",
  "adjudication",
]

const escapeForLiteral = (token: string): string => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * What may sit between two words of one token.
 *
 * `_` and whitespace are the two separators a TypeScript author writes. `-` is not legal in an
 * identifier at all, which is the reason it is here: the laundering path it closes is a *quoted* key
 * or a property read — `row["expected-verdict"]`, `--expected-verdict` — and a rule that matched only
 * identifier-legal spellings would be defeated by the one spelling that cannot be an identifier, in a
 * file whose entire subject is that reading labels is not what it does.
 */
const SEPARATOR = "[_\\s-]?"

/**
 * One token as a pattern, tolerant of the two spellings an author actually reaches for.
 *
 * A camelCase token is split at its own humps, and each boundary may be written as nothing, an
 * underscore or a space — so `expectedVerdict`, `expected_verdict` and `EXPECTED_VERDICT` are one
 * identifier to this rule. The whole list is then matched case-insensitively.
 *
 * ## Why a case-insensitive match is a correctness fix and not a nicety
 *
 * The first version was `flags: "g"` with a `\b`-bounded literal per token, and the review probed it:
 * `expectedVerdict` fired, `EXPECTED_VERDICT` did not. That is not a cosmetic gap. `EXPECTED_VERDICT`
 * is the *most idiomatic* TypeScript spelling of a constant the list already names, so the single
 * rename that silently disabled the anti-tautology check was the one nobody would notice — and nothing
 * else in the repository reacts to it, because the check exists precisely to be the thing that notices.
 * The separator tolerance matters for the same reason: `expected_verdict` is what the same author
 * writes the moment the identifier stops being a field and becomes a variable.
 *
 * A token stays *identifier-shaped*, and that is deliberate: the pattern still requires a word boundary
 * at each end, so `expectedVerdictCount` is not a hit. A guard that fired on a longer identifier would
 * report the file for an unrelated field and would be switched off. The residual is a *different*
 * name — `theLabel`, `whatShouldHappen` — and the module header says what that is: a review question,
 * not a silent hole, and a one-line addition to `LABEL_TOKENS`.
 */
const tokenPattern = (token: string): string =>
  token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter((word) => word !== "")
    .map(escapeForLiteral)
    .join(SEPARATOR)

/** One pattern per token, built here so the list stays the single place a token is written down. */
const LABEL_PATTERN = new RegExp(`\\b(${LABEL_TOKENS.map(tokenPattern).join("|")})\\b`, "gi")

/**
 * R19: the benchmark executor names no verdict expectation.
 *
 * One finding per token, however many times it appears, and the message names the token: a reader
 * who has been told "the executor may not read the labels" needs to know which identifier to remove,
 * not that something is wrong somewhere in a file they have to read first.
 */
export const checkExecutorLabelBlindness = (source: string, file: string): readonly DocsClaim[] => {
  const claims: DocsClaim[] = []
  const reported = new Set<string>()
  for (const match of source.matchAll(LABEL_PATTERN)) {
    const token = match[1]
    if (token === undefined || reported.has(token)) continue
    reported.add(token)
    // Line 1 when the match is at the very start, and the line it is on otherwise: `split` counts
    // the newlines before the match, and a file that begins with the token has none.
    const line = source.slice(0, match.index ?? 0).split("\n").length
    claims.push(
      claim(
        "executor-label-blindness",
        file,
        `line ${line} names \`${token}\`, a verdict expectation; the executor that produces the benchmark's detection rate must be unable to read the labels it would otherwise be restating`,
      ),
    )
  }
  return claims
}

export * as DocsBenchmark from "./docs-benchmark.ts"
