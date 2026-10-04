import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * R18 — a latency figure a document publishes resolves to the committed measurement artefact, within a
 * published tolerance band.
 *
 * ## Why this is a sibling of `docs-value.ts` and not a copy of it
 *
 * `checkBenchmarkClaimUnbacked` (rule ten) already answers "is this figure in the artefact, and is it
 * attributed to the quantity it belongs to", and it answers it over every benchmark section in every
 * audited document. Duplicating that would give the repository two answers to one question, which is
 * the failure AGENTS.md §17 exists to prevent, and the duplicated copy would be the one that drifts.
 *
 * So this module adds only the two things rule ten has no opinion about, and reads nothing of its own:
 *
 *  1. **A tolerance.** Rule ten requires exact equality between a stated figure and the artefact's. For
 *     a wall clock that is not a check, it is a coin flip — the same commit measures 736 ms and 773 ms
 *     depending on what else the machine is doing. A rule that fails at random gets deleted, and a
 *     deleted rule is a green build.
 *  2. **The corpus identity.** A latency figure without the snapshot it was measured on is a number
 *     about nothing: re-ingest the corpus and the figure describes a corpus this repository no longer
 *     serves. The artefact carries the fingerprint; a document that states a suggestion latency must
 *     name it.
 *
 * ## Why the artefact must be FLAT and TOP-LEVEL
 *
 * `readFigures` in `docs-value.ts` walks `Object.entries` of the parsed JSON and keeps entries whose
 * value is a number. A nested object or an array is invisible to it — silently, with no finding. An
 * artefact shaped `latency: { p95: 754 }` would produce a permanently green rule that never had anything
 * to compare, which is the same shape of defect as a rule scoped to a document list that excludes the
 * documents holding the defect (ADR-10). Every key this rule reads is top level, and a missing key is
 * reported rather than defaulted.
 *
 * ## Why `max` is checked one-sidedly and the quantiles are not
 *
 * Measured on the recorded machine over five consecutive runs of the harness: p50 spanned 632–655 ms
 * (1.04x) and p95 spanned 736–773 ms (1.05x), but `max` spanned 743 ms to 2,110 ms (2.84x). A single
 * sample has no noise suppression — one slow case is the figure — so no symmetric band on `max` is
 * honest: 1.5x would reject four of the five runs it was derived from.
 *
 * `max` is therefore checked in the one direction that can hide a defect: a stated `max` **below** the
 * recorded one is flattery and fails. A stated `max` above it is the conservative direction, and it is
 * reachable only by a machine slower than the recorded one, which the conditions block already tells a
 * reader to compare against their own run. p50 and p95 are quantiles over the same sample with the
 * order-statistic rule the harness publishes, and are checked both ways within the band.
 *
 * This asymmetry is a judgement about which error matters, not an oversight, and it is stated here and
 * in ADR-13 so that a reader who thinks it is wrong can disagree with the argument rather than guess.
 */

/** The artefact keys this rule reads, as one owner for the names (AGENTS.md §17). */
export const LATENCY_KEYS = {
  p50: "suggestionLatencyP50Ms",
  p95: "suggestionLatencyP95Ms",
  max: "suggestionLatencyMaxMs",
  band: "suggestionLatencyBandMultiplier",
  fingerprint: "suggestionCorpusFingerprint",
} as const

/**
 * Which keys must be present. A missing key is a finding, never a default.
 *
 * Exported because the shape of the artefact is this rule's precondition rather than a private detail:
 * the test suite pins that all four are required, so "we flattened the artefact" cannot pass as a
 * refactor that happens to stop the rule judging anything.
 */
export const REQUIRED_LATENCY_KEYS = [LATENCY_KEYS.p50, LATENCY_KEYS.p95, LATENCY_KEYS.max, LATENCY_KEYS.band] as const

/** The measurement artefact, as text, or `null` when the repository ships none. */
export type LatencyArtefact = {
  readonly path: string
  readonly text: string | null
}

/** Top-level numeric fields, or `null` when the text is absent, unparseable, or carries no numbers. */
const readLatencyFields = (text: string | null): Readonly<Record<string, number>> | null => {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const fields: Record<string, number> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "number" && Number.isFinite(value)) fields[key] = value
  }
  return Object.keys(fields).length === 0 ? null : fields
}

/** The top-level string field, or `null`. Kept apart because only the fingerprint is a string. */
const readLatencyString = (text: string | null, key: string): string | null => {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const value = (parsed as Record<string, unknown>)[key]
  return typeof value === "string" ? value : null
}

/**
 * The pattern that finds a stated suggestion latency.
 *
 * ## Why it names the quantity instead of hunting for bare milliseconds
 *
 * A document states latency in a dozen shapes — `p95 773 ms`, `p95 of 773ms`, `p95: 773 ms` — and a
 * bare `773 ms` with no quantity beside it says nothing about which of the three figures it is, so it
 * cannot be checked. This pattern therefore requires the quantity word immediately before the number
 * and accepts only the spellings the harness's own output line uses. A latency figure written in any
 * other shape is not judged here; it is simply not recognised, which is why the documents in this
 * repository were written against this pattern rather than the reverse.
 */
const STATED: Readonly<Record<"p50" | "p95" | "max", RegExp>> = {
  p50: /\bp50\b[^0-9\n]{0,24}?(\d+(?:,\d{3})*)\s*ms\b/gi,
  p95: /\bp95\b[^0-9\n]{0,24}?(\d+(?:,\d{3})*)\s*ms\b/gi,
  max: /\bmax\b[^0-9\n]{0,24}?(\d+(?:,\d{3})*)\s*ms\b/gi,
}

const ungroup = (stated: string): number => Number(stated.replace(/,/g, ""))

/** One stated latency figure, reduced to what the comparison needs. */
type StatedLatency = {
  readonly quantity: "p50" | "p95" | "max"
  readonly stated: number
}

/** Every latency figure the document states, in the order a reader meets them. */
const statedLatencies = (document: string): readonly StatedLatency[] => {
  const found: StatedLatency[] = []
  for (const [quantity, pattern] of Object.entries(STATED) as [StatedLatency["quantity"], RegExp][]) {
    for (const match of document.matchAll(pattern)) {
      const stated = ungroup(match[1] ?? "")
      if (Number.isFinite(stated)) found.push({ quantity, stated })
    }
  }
  return found
}

/**
 * Is this stated figure inside the band?
 *
 * `max` is one-sided; see the module header for the measured spread that forced it.
 */
const withinBand = (quantity: StatedLatency["quantity"], stated: number, measured: number, band: number): boolean => {
  if (stated <= 0 || measured <= 0 || band <= 1) return false
  if (quantity === "max") return stated >= measured / band
  return stated >= measured / band && stated <= measured * band
}

/** The artefact key each quantity is recorded under. One map, so a key cannot be written two ways. */
const KEY_OF: Readonly<Record<StatedLatency["quantity"], string>> = {
  p50: LATENCY_KEYS.p50,
  p95: LATENCY_KEYS.p95,
  max: LATENCY_KEYS.max,
}

/**
 * R18: a latency figure a document publishes agrees with the committed measurement, within the band.
 *
 * A document that states no latency is not this rule's business — it reports nothing rather than
 * manufacturing a finding, because a rule that fires on every document trains its readers to ignore it.
 *
 * A missing artefact is reported, not skipped: the documents that carry these figures are audited, so
 * "the file that would have told us this number is true is missing" is a finding about the repository
 * and not a licence to print the number (AGENTS.md §3).
 *
 * @param external the third-party registry. A latency figure a document explicitly attributes to an
 *   external measurement is that registry's business and not this rule's. Passed in rather than read
 *   here so this module stays a pure function of its arguments.
 */
export const checkLatencyFigureUnbacked = (
  document: string,
  file: string,
  artefact: LatencyArtefact,
  externalFigures: readonly number[] = [],
): readonly DocsClaim[] => {
  const stated = statedLatencies(document).filter((entry) => !externalFigures.includes(entry.stated))
  if (stated.length === 0) return []
  const findings: DocsClaim[] = []

  const fields = readLatencyFields(artefact.text)
  if (fields === null) {
    return [claim("latency-claim-unbacked", file, `states a latency figure but ${artefact.path} could not be read, so the number is unverified`)]
  }
  for (const key of REQUIRED_LATENCY_KEYS) {
    if (fields[key] === undefined) {
      findings.push(claim("latency-claim-unbacked", file, `states a latency figure but ${artefact.path} has no top-level numeric \`${key}\`, so there is nothing to compare it against`))
    }
  }
  const band = fields[LATENCY_KEYS.band]
  if (findings.length > 0) return findings

  for (const entry of stated) {
    const measured = fields[KEY_OF[entry.quantity]]
    if (measured === undefined) continue
    if (withinBand(entry.quantity, entry.stated, measured, band ?? 1)) continue
    findings.push(
      claim(
        "latency-claim-unbacked",
        file,
        `states ${entry.quantity} ${entry.stated}ms; ${artefact.path} recorded ${entry.quantity} ${measured}ms` +
          `${entry.quantity === "max" ? " and a stated max may not sit below the recorded one" : `, and the published tolerance is ${band}x`}`,
      ),
    )
  }
  return findings
}

/**
 * R18b: a document stating a suggestion latency names the corpus the figure was measured on.
 *
 * Separate from the comparison because it fails differently. A number can agree with the artefact and
 * still be describing a snapshot this repository no longer serves — and that is invisible to the
 * comparison precisely because the artefact was re-recorded after the re-ingest. So the fingerprint is
 * required to appear, and its absence is named as the missing thing rather than as a disagreement.
 *
 * ## Why a 16-character short form and not the 64-character hash
 *
 * The full fingerprint is the artefact's job and the figure-of-record block's job. Three prose documents
 * repeating 64 hex characters would be three copies of a fact that lives in one file, which is the
 * duplication AGENTS.md §17 forbids, and it would make the figure harder to read rather than harder to
 * question — a 64-character string in a table cell is a row nobody reads.
 *
 * Sixteen hex characters is the short form `README.md` already prints, so this rule adopts an existing
 * convention instead of minting one, and it is wide enough to be an identifier rather than a
 * coincidence: 2^64 values, and a reader who wants the rest greps the hash prefix and lands on the
 * recorded snapshot. Both spellings satisfy the rule, because a document that already carries the full
 * hash has said strictly more and must not be told it has said too little.
 */
export const FINGERPRINT_SHORT_FORM_CHARS = 16

/** The short form of a fingerprint, as `README.md` writes it. */
export const shortFingerprint = (fingerprint: string): string => fingerprint.slice(0, FINGERPRINT_SHORT_FORM_CHARS)

export const checkLatencyCorpusNamed = (
  document: string,
  file: string,
  artefact: LatencyArtefact,
): readonly DocsClaim[] => {
  if (statedLatencies(document).length === 0) return []
  const fingerprint = readLatencyString(artefact.text, LATENCY_KEYS.fingerprint)
  if (fingerprint === null) {
    return [claim("latency-corpus-unnamed", file, `states a latency figure but ${artefact.path} records no \`${LATENCY_KEYS.fingerprint}\`, so no corpus can be named`)]
  }
  if (document.includes(fingerprint)) return []
  if (document.includes(shortFingerprint(fingerprint))) return []
  return [claim("latency-corpus-unnamed", file, `states a latency figure without naming the corpus it was measured on; the recorded snapshotHash is ${shortFingerprint(fingerprint)}.`)]
}

export * as DocsLatency from "./docs-value-latency.ts"