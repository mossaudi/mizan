import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * D-1, rule five — the disclosure's quarantine arithmetic must equal the attested snapshot's.
 *
 * ## The defect class
 *
 * R1 caught the disclosure pointing at files that do not exist. It cannot catch the disclosure
 * stating a *number* that is wrong, and the number was wrong in the most consequential place in
 * the document: the quarantine table. It had 42260 enabled, 27234 attested, 15026 quarantined —
 * and described the 15026 as "15026 = 6236 Qur'anic verses where `gradeApplicable` is false,
 * plus 8790 ungraded hadith". Every one of those four claims was false. The 6236 Qur'anic
 * verses are **served**; `quarantineReason` returns `null` for them precisely because ṣaḥīḥ/ḍa'īf
 * does not apply, so listing them as quarantined inverted the one rule §15 is written to protect.
 * The other 8790 hadith do not exist: the 15026 are all hadith, and the served hadith count is
 * 20998.
 *
 * This is not a typo. The table contradicted the prose eight paragraphs above it, and the prose
 * contradicted the code. A reader checking the arithmetic — which is the one thing this document
 * invites them to do, in bold, with a note that the number "is not a typo and not a rounding"
 * — could not reconcile it. The number was the product's central honesty claim, and it was the
 * one claim nothing in the repository verified.
 *
 * ## Why a gate
 *
 * Because the same drift will recur, for the same reason R1 exists: nobody re-reads a table
 * against `attestation.json` by hand, and no existing test failed when the table was wrong. The
 * numbers are already machine-readable in a committed file, so the comparison is a lookup, and
 * leaving it to a reviewer's memory is how it was wrong in the first place.
 *
 * ## What it compares, and what it deliberately does not
 *
 * Three figures, each read from a labelled table row in the disclosure and compared against
 * `attestation.json`: the enabled total (summed from `sources[].rows`, so it is also checked
 * against the registry rather than merely against a stored constant), the served total
 * (`recordCount`), and the quarantined total (`quarantinedRows`).
 *
 * What it deliberately does NOT do is verify the arithmetic is *philosophically* right, or that
 * the prose around the table is honest. AGENTS.md §12: a prompt is not a boundary and neither is
 * a gate. This rule checks that the document's number is the snapshot's number, which is a fact,
 * and leaves the judgement — serve the ungraded rows or quarantine them — to the reader, who is
 * entitled to disagree with the rule rather than be told they are wrong about the arithmetic.
 */

/** A number, with its label, as the disclosure states it. */
type StatedFigure = { readonly stated: number; readonly line: string }

const NUMBER = /(\d[\d,]*)/g

/** The last number on a line, comma separators removed. */
const lastNumber = (line: string): number | null => {
  const matches = [...line.matchAll(NUMBER)]
  const last = matches[matches.length - 1]
  if (last === undefined || last[1] === undefined) return null
  const digits = last[1].replace(/,/g, "")
  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? parsed : null
}

const tableRows = (document: string): readonly string[] =>
  document.split("\n").filter((line) => line.trimStart().startsWith("|"))

/**
 * The figure a labelled table row states, or null when no row carries that label.
 *
 * Restricted to table rows on purpose. The prose quotes the same numbers while explaining the
 * arithmetic — "36024 − 20998 = 15026", "42260 − 7867 = 34393" — and a rule that scanned the whole
 * document would latch onto a derivation and report the document wrong for explaining itself.
 * The table is the claim; the prose is commentary on it.
 *
 * The *last* number on the row is the one compared, for the same reason: a row may itemise its
 * parts ("6236 Qur'an + 36024 hadith | 42260 |") and the total is the figure being asserted.
 */
const statedFigure = (document: string, label: RegExp): StatedFigure | null => {
  const row = tableRows(document).find((line) => label.test(line))
  if (row === undefined) return null
  const stated = lastNumber(row)
  if (stated === null) return null
  return { stated, line: row.trim() }
}

type AttestedSnapshot = {
  readonly recordCount: number
  readonly quarantinedRows: number
  readonly enabledRows: number
}

/**
 * The three figures from a committed `attestation.json`.
 *
 * The same reasoning as `checkRegistryClaims` applies to the `JSON.parse` here: this is a
 * committed file that this rule exists to audit, so it is not a trust boundary, and the shape is
 * narrowed by an explicit guard immediately below rather than by a schema decoder whose
 * correctness is the question being asked.
 */
const readSnapshot = (attestationText: string): AttestedSnapshot | null => {
  let parsed: { readonly recordCount?: unknown; readonly quarantinedRows?: unknown; readonly sources?: unknown }
  try {
    parsed = JSON.parse(attestationText) as typeof parsed
  } catch {
    return null
  }
  if (typeof parsed.recordCount !== "number" || typeof parsed.quarantinedRows !== "number") return null
  if (!Array.isArray(parsed.sources)) return null
  const rows = parsed.sources.map((entry) =>
    typeof entry === "object" && entry !== null && typeof (entry as { rows?: unknown }).rows === "number"
      ? (entry as { rows: number }).rows
      : 0,
  )
  if (rows.length === 0) return null
  return {
    recordCount: parsed.recordCount,
    quarantinedRows: parsed.quarantinedRows,
    enabledRows: rows.reduce((total, rows) => total + rows, 0),
  }
}

const LABEL = {
  enabled: /enabled in the registry/i,
  quarantined: /quarantined/i,
  served: /\bserved\b/i,
} as const

/**
 * One figure, compared.
 *
 * The absent case is a finding rather than a pass, which is the whole point: a rule that only ever
 * compares numbers is trivially satisfied by deleting the row that carries them.
 */
const compare = (input: {
  readonly term: string
  readonly expected: number
  readonly document: string
  readonly file: string
  readonly label: RegExp
}): readonly DocsClaim[] => {
  const found = statedFigure(input.document, input.label)
  if (found === null) {
    return [claim("snapshot-count-mismatch", input.file, `the quarantine table no longer has a row stating the ${input.term} total, so it cannot be checked against attestation.json`)]
  }
  if (found.stated === input.expected) return []
  return [claim("snapshot-count-mismatch", input.file, `the disclosure's quarantine table states ${input.term} as ${found.stated}, but attestation.json says ${input.expected}`)]
}

/**
 * R5: the numbers in the disclosure's quarantine table must be the numbers `attestation.json`
 * attests.
 *
 * @param disclosureText the document making the claim.
 * @param attestationText the committed snapshot, or null when the repository has none — in which
 *   case there is nothing to compare against and nothing is claimed.
 */
export const checkSnapshotArithmetic = (disclosureText: string, attestationText: string | null, file = "DISCLOSURE.md"): readonly DocsClaim[] => {
  if (attestationText === null) return []
  const snapshot = readSnapshot(attestationText)
  if (snapshot === null) {
    return [claim("snapshot-count-mismatch", "attestation.json", "attestation.json has no recordCount, quarantinedRows and sources[].rows, so the disclosure's quarantine table cannot be checked")]
  }
  const context = { document: disclosureText, file }
  return [
    ...compare({ ...context, term: "enabled", expected: snapshot.enabledRows, label: LABEL.enabled }),
    ...compare({ ...context, term: "served", expected: snapshot.recordCount, label: LABEL.served }),
    ...compare({ ...context, term: "quarantined", expected: snapshot.quarantinedRows, label: LABEL.quarantined }),
  ]
}

export * as DocsSnapshot from "./docs-snapshot.ts"
