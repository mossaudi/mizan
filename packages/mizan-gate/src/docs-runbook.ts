import { claim, type DocsClaim } from "./docs-claims.ts"

/**
 * R16 — the demo runbook puts the live, keyed run first and the replay second, and labels each.
 *
 * ## The defect
 *
 * mizan ships a committed transcript so a demo survives an outage, and the run header already says
 * which mode produced a run. Story 4's risk is not that the label is missing from the product — it
 * is that the *document* puts the two in the wrong order. A runbook that opens with the replay,
 * because that is the route the author could test without a key, teaches a judge to expect a
 * recording; and a judge who has been primed by an example is exactly the reader a later `LIVE`
 * header fails to convince. The order in a document is an instruction, and this one has a
 * consequence.
 *
 * The second half of the defect is quieter: a step that offers the replay without saying what the
 * reader will see on screen. Someone handed a `PRECOMPUTED` header who was not told to look for it
 * has learned nothing from it, and "it said verified" is the misunderstanding the whole
 * architecture exists to prevent (AGENTS.md §1, §16).
 *
 * ## Why a section, and not the document
 *
 * A document-level rule — "somewhere this file says PRECOMPUTED" — is satisfied by one label in a
 * footnote while the replay step itself stays silent, which is the defect with extra words. So the
 * unit is the *section* that contains the step, exactly as `docs-corpus.ts` makes the unit the line
 * that contains the name: the label has to travel with the command it describes. The cost is a
 * copy-editing constraint rather than a semantic one, and each finding says which section to fix.
 *
 * ## Why these are docs rules and not gates (D-3)
 *
 * `GATE_IDS` is a published count, and adding an eighth entry would change what the repository
 * claims about itself, which is a change no formatting rule is worth. The invariants live here
 * instead, with the planted violations in `test/docs-runbook.test.ts` — a guard that cannot fail is
 * not a guard, and this one can be failed by three lines of markdown.
 *
 * ## The markers, and what happens when the code's names change
 *
 * `KEYED_LIVE_PATH` and `REPLAY_PATH` are spelled out here rather than imported from
 * `apps/cli/src/provider-config.ts`, because the gate package must not depend on an application
 * (and `apps/cli` depends on this package, so the import would be a cycle). The cost is a duplicated
 * name, and it fails in the safe direction: rename the variable in the code and this runbook stops
 * matching, so the rule reports a document that names no live path, and `.env.example` plus R2 fail
 * separately on the same rename. A stale name here is loud; it is never silently permissive.
 */

export const KEYED_LIVE_PATH = /MIZAN_LLM_API_KEY/
export const REPLAY_PATH = /MIZAN_PROVIDER=scripted|\bprecomputed\b|\bPRECOMPUTED\b|transcript\.json/

/**
 * The label a reader is shown, not the mode name.
 *
 * Word-bounded and case-sensitive, because `LIVE` is a substring of `DELIVERED` and because the
 * claim being checked is that the document names the string on the screen. `PRECOMPUTED` covers
 * both the bare label and the full `PRECOMPUTED (deterministic replay)` the terminal prints.
 */
const LIVE_LABEL = /\bLIVE\b/
const REPLAY_LABEL = /\bPRECOMPUTED\b/

const HEADING = /^#{1,6} /

/** The zero-based index of the first line matching `marker`, or -1. */
const firstMatch = (rows: readonly string[], marker: RegExp): number => rows.findIndex((row) => marker.test(row))

/**
 * The block a line sits in: from the heading above it to the next heading.
 *
 * A document with no heading at all yields the whole file, so a fragment posted in a review is
 * audited as if it were the document rather than skipped.
 */
const sectionAround = (rows: readonly string[], at: number): readonly string[] => {
  let top = at
  while (top >= 0 && !HEADING.test(rows[top] ?? "")) top -= 1
  if (top < 0) return rows
  let bottom = at
  while (bottom < rows.length && !HEADING.test(rows[bottom] ?? "")) bottom += 1
  return rows.slice(top, bottom)
}

/**
 * R16: the live keyed route is documented before the replay, and each step says what the header
 * will read.
 *
 * Four findings, and the two absences are the point. A runbook that documents only the replay has
 * not mis-ordered its steps — it has omitted the live one, which is the same defect the judge would
 * not notice and a reader would not survive. Both absences fail for the same reason a missing
 * required path does: silence is not a smaller claim, it is a claim that can be read the wrong way.
 */
export const checkRunbookOrder = (document: string, file: string): readonly DocsClaim[] => {
  const rows = document.split("\n")
  const keyedAt = firstMatch(rows, KEYED_LIVE_PATH)
  const replayAt = firstMatch(rows, REPLAY_PATH)
  if (keyedAt === -1 && replayAt === -1) return []

  const claims: DocsClaim[] = []
  if (keyedAt === -1) {
    claims.push(
      claim("runbook-no-live-path", file, `line ${replayAt + 1} offers the committed replay but this document never shows a keyed live run; the live route is the one to demonstrate first`),
    )
  }
  if (replayAt === -1) {
    claims.push(
      claim("runbook-no-replay", file, `line ${keyedAt + 1} shows a keyed live run but this document never offers the replay as a labelled fallback`),
    )
  }
  if (keyedAt !== -1 && replayAt !== -1 && keyedAt > replayAt) {
    claims.push(
      claim("runbook-live-after-replay", file, `the replay is offered at line ${replayAt + 1} and the keyed live run at line ${keyedAt + 1}; the live route comes first, so a reader is primed to expect a recording`),
    )
  }
  if (keyedAt !== -1) {
    const section = sectionAround(rows, keyedAt).join("\n")
    if (!LIVE_LABEL.test(section)) {
      claims.push(claim("runbook-live-unlabelled", file, `the section containing line ${keyedAt + 1} shows the keyed run but never says the header will read LIVE; a reader cannot tell a live run from a replay without it`))
    }
  }
  if (replayAt !== -1) {
    const section = sectionAround(rows, replayAt).join("\n")
    if (!REPLAY_LABEL.test(section)) {
      claims.push(claim("runbook-replay-unlabelled", file, `the section containing line ${replayAt + 1} offers the replay but never states the label it prints; a reader who is not told to look for PRECOMPUTED learns nothing from seeing it`))
    }
  }
  return claims
}

export * as DocsRunbook from "./docs-runbook.ts"
