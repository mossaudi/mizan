#!/usr/bin/env bun
import { isErr } from "@mizan/core"
import { requireRepositoryRoot, runDocsClaimChecks } from "@mizan/gate"

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

const main = async (): Promise<number> => {
  const found = requireRepositoryRoot(import.meta.dir)
  if (isErr(found)) {
    console.error(`check:docs could not start — ${found.error}.`)
    console.error("  A check that cannot find the repository is not a pass.")
    return 2
  }

  const result = runDocsClaimChecks(found.value)
  if (result.ok) {
    // The two counts are separate because they are different scopes. `checked` is the named
    // artefacts with a dedicated rule; `swept` is the whole tree R8 read for gate-count claims.
    // Printing only the first would understate the check, which is the exact sin this tool exists
    // to catch in documents.
    console.log(
      `check:docs OK — ${result.checked.length} files audited, ${result.swept} swept for gate-count claims, no claim disagrees with the repository.`,
    )
    for (const file of result.checked) console.log(`  ${file}`)
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
