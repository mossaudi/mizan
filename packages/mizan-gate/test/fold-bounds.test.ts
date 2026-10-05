import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { stripCommentsOnly } from "../src/strip-comments.ts"
import { collectSourceFilesSync, productionFiles, type SourceFile } from "../src/scan.ts"

/**
 * CR-4: the two fold bounds are declared once, in `@mizan/core`.
 *
 * ## Why this is a test and not a gate
 *
 * It is the same kind of claim every gate in this package makes, but a gate owns a *rule id* and
 * `GATE_IDS` is a published count that `check:docs` cross-checks against the documentation
 * (AGENTS.md §14). Adding an eighth rule to protect one duplicated number would spend a permanent
 * claim on it, so this is a test: it fails the build in the same place, and no new gate id is spent.
 *
 * ## Why the assertion is keyed on the NAME, not on the value
 *
 * `apps/cli/src/relevance.ts` caps a model answer at `MAX_ANSWER_CHARS = 4_096`, a different fact with
 * a coincidentally identical number. A rule matching the literal `4_096` would flag that file and be
 * switched off within a day; a rule matching `MAX_QUOTE_CHARS` asks the question that is actually being
 * asked — *is this bound declared anywhere a second time?* — and `MAX_ANSWER_CHARS` is not an answer to it.
 *
 * ## Why comments are stripped before matching
 *
 * A commented-out `export const MAX_QUOTE_CHARS = 4_096` is not a second declaration, and a rule that
 * reported it would train its readers to ignore it. This is the opposite of `relativeSpecifiers`, which
 * deliberately counts commented-out imports: that rule bans a *shape* wherever it appears, while this one
 * counts *owners*, and only an owner that exists can be a second owner.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..", "..")

/** Where the bounds are allowed to be declared. Named, because a bare path in an assertion reads as a coincidence. */
const BOUNDS_MODULE = "packages/mizan-core/src/normalize/bounds.ts"

/** The files that bound text before the duplication was found, named so a failure says who regressed. */
const CONSUMERS = ["packages/mizan-suggest/src/trigrams.ts", "packages/mizan-verify/src/diagnostics/longest-run.ts"] as const

/** Every production file that declares `name`, by repo-relative path. Lines are not pinned: an unrelated edit above the declaration is not a regression. */
const declaringFiles = (name: string, files: readonly SourceFile[]): readonly string[] => {
  const pattern = new RegExp(`\\b(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=`)
  return files.flatMap((file) => (pattern.test(stripCommentsOnly(file.text)) ? [file.path] : []))
}

describe("the fold bounds have exactly one owner", () => {
  const files = productionFiles(collectSourceFilesSync(REPO_ROOT))

  test("MAX_QUOTE_CHARS is declared in core and nowhere else", () => {
    expect(declaringFiles("MAX_QUOTE_CHARS", files)).toEqual([BOUNDS_MODULE])
  })

  test("MAX_RECORD_CHARS is declared in core and nowhere else", () => {
    expect(declaringFiles("MAX_RECORD_CHARS", files)).toEqual([BOUNDS_MODULE])
  })

  test("a second owner is reported by path, so the regression names itself", () => {
    // The fail-closed direction, stated as its own test: the rule must be able to return two paths.
    // A rule that always returned one could not have found this duplication in the first place.
    const planted: readonly SourceFile[] = [
      { path: BOUNDS_MODULE, text: "export const MAX_QUOTE_CHARS = 4_096" },
      { path: "packages/mizan-verify/src/diagnostics/longest-run.ts", text: "const MAX_QUOTE_CHARS = 4_096" },
    ]
    expect(declaringFiles("MAX_QUOTE_CHARS", planted)).toEqual([
      BOUNDS_MODULE,
      "packages/mizan-verify/src/diagnostics/longest-run.ts",
    ])
  })

  test("both consumers read the bounds instead of restating them", () => {
    for (const path of CONSUMERS) {
      const file = files.find((candidate) => candidate.path === path)
      if (file === undefined) throw new Error(`expected ${path} in the production tree`)
      expect(declaringFiles("MAX_QUOTE_CHARS", [file])).toEqual([])
      expect(declaringFiles("MAX_RECORD_CHARS", [file])).toEqual([])
    }
  })
})