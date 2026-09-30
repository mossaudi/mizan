#!/usr/bin/env bun
import { isErr } from "@mizan/core"
import { requireRepositoryRoot, runDocsClaimChecks, type AuditTier, type DocsCheckResult } from "@mizan/gate"

/**
 * `bun run check:docs` — the command that keeps the disclosure honest (D-1).
 *
 * ## What it is for
 *
 * `DISCLOSURE.md` is the document a judge reads to work out what was actually built, and it had
 * drifted from the repository in six places at once: six backticked paths pointed at files that
 * do not exist, a local inference path was documented that was never implemented, and
 * `.env.example` described eight variables that no code read. Every one of those is a claim a
 * judge would reasonably rely on.
 *
 * Drift recurs, so this is a check rather than a review note. It catches four mechanical classes
 * of disagreement — file paths, environment variables, registry claims, and documented commands —
 * and it cannot catch a wrong prose sentence, which is a human's judgement and stays one.
 *
 * ## The report is a claim too, and it is checked like one
 *
 * This script used to print one flat "27 files audited" over a list whose entries had received
 * very different treatment: five judge-facing documents ran the full rule set, fourteen corpus
 * surfaces received exactly one rule, and six artefacts were read only as the authority a rule
 * judges a document against. A tool whose whole purpose is to stop the repository overstating
 * coverage was overstating its own, and a judge skimming the output would have taken that at face
 * value. So the counts are reported per tier and every listed file carries the tier it was read at
 * — a list that a reader can audit against what the rules actually do.
 *
 * ## Why the decisions live in the gate package
 *
 * Every rule is a pure function in `packages/mizan-gate/src/docs-claims.ts`, tested there by
 * planting a violation. This file only locates the repository and prints. The same split as
 * `g4-gitleaks.ts`, and for the same reason: a gate that can only be tested by breaking a real
 * repository is a gate that does not get tested.
 *
 * ## Every finding, not the first
 *
 * A disclosure that drifted in six places should be fixed in one pass, not discovered one build at
 * a time.
 *
 * ## Not a gate
 *
 * The gates have published numbers, an acceptance criterion each, and a `runGates` entry. Adding
 * to that list would change published claims about what this project guarantees — and "we have
 * seven gates" is itself a claim a judge can check, which is why rule R8 now checks it against
 * `GATE_IDS` rather than leaving it to review. This runs as its own named step in the same CI job.
 */

/** How a tier is described in the printed report, in the order a reader should see them. */
const TIER_CAPTION: Readonly<Record<AuditTier, string>> = {
  document: "audited document — the full claim-rule set",
  surface: "corpus surface — R15, plus the gate-count and ADR sweep",
  evidence: "evidence — read as the authority a rule judges a document against, not audited",
}

/** `documents` and `surfaces` counted; `evidence` counted separately because it is a different claim. */
const summariseTiers = (result: DocsCheckResult): string => {
  const at = (tier: AuditTier): number => result.checked.filter((entry) => entry.tier === tier).length
  return `${at("document")} audited documents, ${at("surface")} corpus surfaces, ${at("evidence")} evidence artefacts read`
}

const main = async (): Promise<number> => {
  const found = requireRepositoryRoot(import.meta.dir)
  if (isErr(found)) {
    console.error(`check:docs could not start — ${found.error}.`)
    console.error("  A check that cannot find the repository is not a pass.")
    return 2
  }

  const result = runDocsClaimChecks(found.value)
  if (result.ok) {
    // The three counts are separate because they are different claims, and `swept` is separate
    // again because it is a different scope. Printing a single total would understate the sweep
    // and overstate the audit — the two failures this tool exists to catch in documents, committed
    // here against the report itself.
    console.log(`check:docs OK — ${summariseTiers(result)}; ${result.swept} files swept for gate-count and ADR citations.`)
    console.log("  no claim disagrees with the repository.")
    for (const tier of ["document", "surface", "evidence"] as const) {
      const paths = result.checked.filter((entry) => entry.tier === tier).map((entry) => entry.path)
      if (paths.length === 0) continue
      console.log(`  ${TIER_CAPTION[tier]}: ${paths.join(", ")}`)
    }
    return 0
  }

  console.error(`check:docs FAILED — ${result.claims.length} documented claim(s) disagree with the repository.`)
  console.error("")
  for (const found_ of result.claims) {
    console.error(`  [${found_.rule}] ${found_.file}: ${found_.detail}`)
  }
  console.error("")
  console.error("  These are claims a judge would rely on. Fix the document, or implement what it")
  console.error("  describes — do not delete the claim, because the drift it records was real.")
  return 1
}

process.exit(await main())
