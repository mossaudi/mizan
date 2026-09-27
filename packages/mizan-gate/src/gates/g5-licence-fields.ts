import { REQUIRED_LICENCE_FIELDS, decodeOrFail, decodeSync, isOk, SourceRegistry } from "@mizan/core"
import type { Finding } from "../scan.ts"

/**
 * G-5 — no empty licence fields, and no unconfirmed licence on an enabled source.
 *
 * Short, and the one that keeps the entry defensible: a corpus of sacred text whose
 * provenance cannot be stated does not ship. Four checks over the committed
 * `data/registry/sources.json`:
 *
 *  - **G-5.1 registry decodes.** Through the same `SourceRegistry` schema the ingest writes,
 *    via the core decode seam. A gate that parsed the file with its own looser rules would
 *    eventually disagree with the code, and the code would be right.
 *  - **G-5.2 required fields non-empty.** For every source, every field in
 *    `REQUIRED_LICENCE_FIELDS` is a non-blank string. A blank `attribution` is how a corpus
 *    ends up with no way to credit its source.
 *  - **G-5.3 sha256 well-formed.** 64 lowercase hex characters, so the attestation is
 *    reproducible rather than decorative. **Enabled sources only** — see below.
 *  - **G-5.4 no unconfirmed licence on an enabled source.** The load-bearing one. An
 *    `enabled: true` row with `licenceClass: "unconfirmed"` fails the build; the same source
 *    with `enabled: false` and a stated `exclusionReason` passes, because a VISIBLE exclusion
 *    is a decision and a silent one is an accident.
 *
 * ## Why `sha256` is required only of an ENABLED source
 *
 * `sha256` is a fact about a fetch, not a fact about a licence. A source we decided not to
 * ingest has no artefact, so it has no digest, and requiring one would force exactly two
 * wrong answers: invent a hash for bytes nobody downloaded, or delete the row and destroy the
 * record that the source was considered and rejected.
 *
 * That second loss is the serious one. `open-hadith-data` is in the registry precisely because
 * its licence could not be confirmed (risk R-L1). Its disabled row IS the evidence of the
 * decision, and G-5.4/G-5.5 exist to insist that decision stay visible. So the rule is split by
 * what kind of fact each field carries:
 *
 *  - **Licence metadata** — `source`, `title`, `publisher`, `url`, `license`, `licenseUrl`,
 *    `attribution`: required on EVERY row, enabled or not. We asserted these, so we must be
 *    able to show them.
 *  - **Artefact digest** — `sha256`: required on every row we actually ingested, because that
 *    is the row whose bytes someone can check.
 *
 * This narrows the rule to what is checkable rather than loosening it: the two sources it
 * stops demanding a digest of are exactly the two we never downloaded.
 *
 * A pure function of the parsed registry, so the self-test plants a blank licence, an
 * unconfirmed-and-enabled row, and a malformed digest on an ENABLED row, and requires all
 * three to fail — plus the new positive case, a disabled row with no digest, which must pass.
 */

export const REGISTRY_PATH = "data/registry/sources.json"

const SHA256_PATTERN = /^[0-9a-f]{64}$/

/**
 * The one field in `REQUIRED_LICENCE_FIELDS` that describes a download rather than a licence.
 *
 * Named rather than inlined so the exemption is greppable: anyone relaxing another field has
 * to come past this line and say why.
 */
export const ARTEFACT_DIGEST_FIELD = "sha256"

const finding = (path: string, line: number, rule: string, excerpt: string): Finding => ({
  gate: "G-5",
  rule,
  path,
  line,
  excerpt,
})

/** Validate a parsed `sources.json` payload. Returns findings; an empty list means the gate passed. */
export const checkLicenceFields = (parsed: unknown, path: string = REGISTRY_PATH): readonly Finding[] => {
  const decoded = decodeOrFail(decodeSync(SourceRegistry), parsed, "SourceRegistry")
  if (!isOk(decoded)) {
    return [finding(path, 1, "G-5.1 registry-decode", `sources.json does not match SourceRegistry: ${decoded.error.detail}`)]
  }
  const registry = decoded.value
  const findings: Finding[] = []

  registry.sources.forEach((source, index) => {
    const line = index + 2
    const label = `source ${source.source || "<missing slug>"}`

    for (const field of REQUIRED_LICENCE_FIELDS) {
      // A source we never ingested has no artefact, so it has no digest. Everything else in
      // this list is a statement we made about the source and is owed on every row.
      if (field === ARTEFACT_DIGEST_FIELD && !source.enabled) continue
      const value = source[field]
      if (typeof value === "string" && value.trim().length > 0) continue
      findings.push(finding(path, line, "G-5.2 required-field-empty", `${label}: ${field} is empty`))
    }

    if (source.enabled && !SHA256_PATTERN.test(source.sha256)) {
      findings.push(finding(path, line, "G-5.3 sha256-malformed", `${label}: sha256 is not 64 lowercase hex characters`))
    }

    if (source.enabled && source.licenceClass === "unconfirmed") {
      findings.push(
        finding(path, line, "G-5.4 unconfirmed-licence-enabled", `${label}: enabled with an unconfirmed licence`),
      )
    }

    if (!source.enabled && (source.exclusionReason === null || source.exclusionReason.trim().length === 0)) {
      findings.push(
        finding(path, line, "G-5.5 undeclared-exclusion", `${label}: disabled without an exclusionReason`),
      )
    }
  })

  return findings
}

export * as G5 from "./g5-licence-fields.ts"
