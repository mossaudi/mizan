#!/usr/bin/env bun
/**
 * Build `data/eval/golden-normalization.json` and `data/eval/redteam-fabricated.json`.
 *
 * Run `bun run build:eval` after an ingest that changes the quoted rows. The two files are
 * committed, so this is a deliberate act with a reviewable diff rather than something CI does
 * on the fly — a set that regenerated itself would stop being a fixed yardstick.
 *
 * ## What makes a set publishable
 *
 * Four conditions, all enforced here, all fatal:
 *
 *  1. Every class has exactly its declared case count.
 *  2. No two cases share an id, and no case folds to an empty quote.
 *  3. Every case labelled `rejected` is absent from the ENTIRE corpus, not merely from the
 *     record it cites. This is the one that matters: a fabrication that happened to be a real
 *     quotation elsewhere would be a fixture asserting the verifier is wrong when it is right.
 *  4. The generator is structurally unable to ask the verifier for an answer. `plan.ts` holds
 *     the expectations and imports nothing from `@mizan/verify`.
 *
 * Nothing is written unless all four hold. A partial set that a judge might run is worse than
 * no set, because its size and class counts would still look authoritative.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Database } from "bun:sqlite"
import { decodeOrFail, decodeSync, isOk, EvalSet as EvalSetSchema } from "@mizan/core"
import { anchorsOf, buildGolden, buildRedTeam, finalise, validate } from "./eval/build.ts"
import { indexCorpus, loadFoldedCorpus } from "./eval/anchors.ts"
import { DIGIT_FACTS, expectedCounts, GOLDEN_TARGET, goldenTotal, KNOWN_DIVERGENCE } from "./eval/plan.ts"

const CORPUS_PATH = "data/corpus.db"
const OUT_DIR = "data/eval"
const SCHEMA_VERSION = 1

/** Why the sets are hand-adjudicated, printed into both files so nobody has to ask. */
const EXPECTATION_SOURCE = "Hand-adjudicated in scripts/eval/plan.ts from the documented behaviour of the fold table. Never observed from @mizan/verify: a set whose expectations were recorded from the code under test is a regression test of the code against itself."

/**
 * The notice that ships with every quoted span.
 *
 * The spans are real Quran and hadith text, reproduced under each collection's own licence
 * with its attribution intact. The FABRICATED spans are synthetic test data and are not
 * hadith; the set is worthless if a reader could mistake one for a quotation, so every case
 * that is not a verbatim source span says so in its own `note`.
 */
const LICENCE_NOTICE =
  "Quoted spans are real source text, reproduced verbatim under each collection's own licence and attribution, as recorded per anchor. Fabricated spans (classes one_word_changed, two_word_changed, letter_transposed, digit_substituted, word_inserted, injection_appended) and elided spans are synthetic test data. They are not hadith, they assert nothing, and no case may be cited as a source. Qur'an text is under no-derivatives terms and is reproduced without modification."

const DETERMINISM = "Same snapshot in, byte-identical files out. Every selection is ordered (records by id, collections by name, classes by the table order in plan.ts) and no clock, locale or randomness is consulted."

/** Counts by class and by expected verdict, so a reviewer can see the shape without parsing. */
const tally = (cases: readonly { readonly classId: string; readonly expectedVerdict: string }[]): { readonly byClass: Record<string, number>; readonly byVerdict: Record<string, number> } => {
  const byClass: Record<string, number> = {}
  const byVerdict: Record<string, number> = {}
  for (const entry of cases) {
    byClass[entry.classId] = (byClass[entry.classId] ?? 0) + 1
    byVerdict[entry.expectedVerdict] = (byVerdict[entry.expectedVerdict] ?? 0) + 1
  }
  return { byClass, byVerdict }
}

const buildSet = (name: string, title: string, purpose: string, cases: ReturnType<typeof finalise>, anchors: ReturnType<typeof anchorsOf>) => {
  const { byClass, byVerdict } = tally(cases)
  return {
    schemaVersion: SCHEMA_VERSION,
    set: name,
    title,
    purpose,
    generatedBy: "scripts/build-eval-set.ts",
    regenerateWith: "bun run build:eval",
    determinism: DETERMINISM,
    expectationSource: EXPECTATION_SOURCE,
    knownDivergence: KNOWN_DIVERGENCE,
    digitFacts: DIGIT_FACTS,
    classCounts: byClass,
    verdictCounts: byVerdict,
    anchorCount: anchors.length,
    licenceNotice: LICENCE_NOTICE,
    anchors,
    cases,
  }
}

const main = (): number => {
  const db = new Database(CORPUS_PATH, { readonly: true })
  const foldedCorpus = loadFoldedCorpus(db)
  const index = indexCorpus(db)
  // Each of the two is built once and reused by both eval sets, rather than rebuilt per set.
  //
  // The previous version of this comment justified that with "an 81 MB file". The database is
  // not 81 MB — it is about 80 — and more importantly the number described a *build artefact*,
  // so it was wrong the next time anyone ran `bun run ingest` and it was never load-bearing
  // information for a reader deciding whether the work is shared. A volatile figure belongs in
  // one place that describes the artefact itself (`.gitignore`), not in a comment explaining an
  // allocation decision. Same defect class as the six false paths `bun run check:docs` now
  // fails the build over: a specific, checkable-looking claim that nothing keeps true.
  const builtGolden = buildGolden(db)
  const builtRedTeam = buildRedTeam(db)
  db.close()

  const golden = finalise(builtGolden, "golden")
  const redTeam = finalise(builtRedTeam, "redteam")

  const problems = [...validate("golden", golden, foldedCorpus, index), ...validate("redteam", redTeam, foldedCorpus, index)]
  if (golden.length !== GOLDEN_TARGET) problems.push(`golden: ${golden.length} cases, expected exactly ${GOLDEN_TARGET}`)
  if (goldenTotal() !== GOLDEN_TARGET) problems.push(`plan.ts: the class table sums to ${goldenTotal()}, not the ${GOLDEN_TARGET} the architecture names`)
  if (redTeam.some((entry) => entry.expectedVerdict === "verified")) problems.push("redteam: contains a case expected to verify, which defeats its purpose")

  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL ${problem}`)
    console.error(`\n${problems.length} problem(s). Nothing was written.`)
    return 1
  }

  const files = [
    {
      path: join(OUT_DIR, "golden-normalization.json"),
      body: buildSet(
        "golden",
        "Golden normalization and verification set",
        `${GOLDEN_TARGET} cases over ${Object.keys(expectedCounts("golden")).length} classes: four renderings of a correct quotation that must all verify, then the ways a text stops being a quotation, then the two citation shapes that make a verdict impossible rather than wrong. Run against the real resolver and the real verifier; nothing is mocked.`,
        golden,
        anchorsOf(builtGolden),
      ),
    },
    {
      path: join(OUT_DIR, "redteam-fabricated.json"),
      body: buildSet(
        "redteam",
        "Red-team set: fabrications that must never verify",
        "Every case is a fabrication of a real corpus span. A single `verified` here is a false positive on invented religious text, which is the failure this repository exists to prevent, so the gate is exactly zero rather than the golden set's accuracy bar.",
        redTeam,
        anchorsOf(builtRedTeam),
      ),
    },
  ]

  // Fifth condition, and the one that keeps the other four honest: each finished set is decoded
  // through the SAME schema `apps/cli/test/eval.test.ts` reads it with. Hand-rolled validation
  // checks what the builder intended; this checks that what it built is actually the contract, so
  // a field the test needs cannot be quietly left out of the writer.
  for (const file of files) {
    const decoded = decodeOrFail(decodeSync(EvalSetSchema), file.body, file.path)
    if (isOk(decoded)) continue
    console.error(`FAIL ${file.path} does not satisfy EvalSet: ${decoded.error.detail}`)
    console.error("\nNothing was written.")
    return 1
  }

  for (const file of files) {
    mkdirSync(dirname(file.path), { recursive: true })
    writeFileSync(file.path, `${JSON.stringify(file.body, null, 2)}\n`, "utf8")
    console.log(`wrote ${file.path} — ${file.body.cases.length} cases, ${file.body.anchorCount} anchors`)
  }
  console.log(`\ngolden verdicts  : ${JSON.stringify(tally(golden).byVerdict)}`)
  console.log(`redteam verdicts : ${JSON.stringify(tally(redTeam).byVerdict)}`)
  return 0
}

process.exit(main())
