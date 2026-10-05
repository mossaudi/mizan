#!/usr/bin/env bun
import { isErr } from "@mizan/core"
import { formatDocsFailure, formatDocsSuccess, requireRepositoryRoot, runDocsClaimChecks } from "@mizan/gate"

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
 * ## Why the decisions live in the gate package
 *
 * Every rule is a pure function in `packages/mizan-gate/src/docs-claims.ts`, tested there by
 * planting a violation. This file only locates the repository and prints. The same split as
 * `g4-gitleaks.ts`, and for the same reason: a gate that can only be tested by breaking a real
 * repository is a gate that does not get tested.
 *
 * ## The report is a claim too, and it is checked like one
 *
 * This file used to print one flat "27 files audited" over a list whose entries had received very
 * different treatment: six judge-facing documents ran the full rule set, fourteen corpus surfaces
 * received exactly one rule, and seven artefacts were read only as the authority a rule judges a
 * document against. A tool whose whole purpose is to stop the repository overstating coverage was
 * overstating its own, and a judge skimming the output would have taken that at face value. So the
 * counts are reported per tier and every listed file carries the tier it was read at — a list that a
 * reader can audit against what the rules actually do.
 *
 * `formatDocsSuccess` and `formatDocsFailure` are the wording of both reports, and they live in
 * `packages/mizan-gate/src/docs-report.ts` so that `test/docs-claims.test.ts` can assert against the
 * text a person actually reads. A report whose format only exists inside a function that calls
 * `process.exit` cannot be tested except by transcribing it, and a transcription asserts against
 * itself. That is the failure this extraction closes.
 *
 * ## Every finding, not the first
 *
 * A disclosure that drifted in six places should be fixed in one pass, not discovered one build at a
 * time.
 *
 * ## Not a gate
 *
 * The gates have published numbers, an acceptance criterion each, and a `runGates` entry. Adding
 * to that list would change published claims about what this project guarantees — and "we have
 * seven gates" is itself a claim a judge can check, which is why rule R8 now checks it against
 * `GATE_IDS` rather than leaving it to review. This runs as its own named step in the same CI job.
 */

const main = async (): Promise<number> => {
  const found = requireRepositoryRoot(import.meta.dir)
  if (isErr(found)) {
    console.error(`check:docs could not start — ${found.error}.`)
    console.error("  A check that cannot find the repository is not a pass.")
    return 2
  }

  const result = runDocsClaimChecks(found.value)
  if (result.ok) {
    for (const line of formatDocsSuccess(result)) console.log(line)
    return 0
  }

  for (const line of formatDocsFailure(result)) console.error(line)
  return 1
}

process.exit(await main())