import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Database } from "bun:sqlite"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  BaselineDeclaration as BaselineDeclarationSchema,
  decodeOrFail,
  decodeSync,
  EvalSet as EvalSetSchema,
  HONEST_BASELINE,
  isErr,
  isOk,
  normalizeForMatch,
  PRE_REGISTERED_HYPOTHESIS,
  BenchmarkResult as BenchmarkResultSchema,
  type BenchmarkResult,
  type BaselineDeclaration,
  type CorpusRecord,
  type EvalAnchor,
  type EvalSet,
} from "@mizan/core"
import { buildSnapshot, openSnapshot } from "@mizan/corpus"
import { stripCommentsOnly } from "@mizan/gate"
import { HONEST_OPTIONS, runBaseline, FTS5_GRAMMAR_CHARACTERS, PUBLISHED_BASELINE_TOP1_HITS, type BaselineCase, type BaselineOptions } from "../../../scripts/benchmark/baseline.ts"
import { assertBaselineIsHonest, figuresOf, score, toDeclaration, type Figures, type ScoredCase } from "../../../scripts/benchmark/score.ts"
import { runSystemArm, type SystemOutcome } from "../../../scripts/benchmark/system-arm.ts"
import { compare, figuresOf as systemFigures, type ComparisonFigures, type LabelledCase } from "../../../scripts/benchmark/compare.ts"
import { BASELINE_FIELDS, movedFieldsOf, RIGGED_BASELINES, RIGGED_COUNT } from "../../../scripts/benchmark/rigged.ts"
import { renderBenchmarkReport } from "../../../scripts/benchmark/report.ts"

/**
 * MIZ-102's and MIZ-103's self-test: the benchmark's own honesty, proved against itself.
 *
 * ## What is asserted here and why it is not a unit test of `score`
 *
 * The comparison is the repository's only published number a judge can re-derive, and the one thing
 * that would destroy it is a baseline quietly rigged in the tree. So the assertions are about the
 * ARMS and the DECLARATION, not about the arithmetic: that the honest declaration is the one the
 * check accepts, that each of the six planted defects is rejected and attributed to a named lever,
 * that the system half of the score is independent of the baseline half, and that the report prints
 * its hypothesis before its figures and prints a number it does not like.
 *
 * The corpus is a **hermetic snapshot built from the red-team set's own 30 anchors**, which is what
 * the architecture specifies for the unit-test arm. `data/corpus.db` is a gitignored ~80 MB
 * artefact, so a test that needed it would be unrunnable in a clean clone — and a benchmark whose
 * honesty check only runs where the corpus happens to exist is a check that silently stops running.
 * Every figure below is therefore a function of the SET, not of the 27,234-record corpus, and the
 * assertions are written to hold for any corpus rather than to quote one.
 *
 * ## The import guard is written a THIRD time, on purpose
 *
 * `eval.test.ts` guards the eval generators and `anchor.test.ts` guards the adjudication table, each
 * with its own copy of the predicate. This file guards the baseline arm, which is a third
 * independent claim: the eval generator must not learn verdicts from the verifier, the table must not
 * record them from the verifier, and the comparison must not score the verifier with the verifier.
 * Sharing one predicate would mean a bug in it silences all three at once.
 */
const ROOT = join(import.meta.dir, "..", "..", "..")
const REDTEAM_PATH = join(ROOT, "data", "eval", "redteam-fabricated.json")

/**
 * Unwrap a success channel for an assertion whose subject is something else.
 *
 * Written once here because `figuresOf` is called from four places in this file and the alternative
 * was either a `.value` on every line or an `if` per call. It fails with the message the caller would
 * have printed, so a refusal inside a passing test still names the denominator that disagreed.
 */
const expectOk = <T, E>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }): T => {
  if (isErr(result)) throw new Error(`expected a figure, got the refusal: ${result.error}`)
  return result.value
}

/** A committed artefact, read through the schema the generator writes it with. Never `any`. */
const readSet = (path: string): EvalSet => {
  const decoded = decodeOrFail(decodeSync(EvalSetSchema), JSON.parse(readFileSync(path, "utf8")) as unknown, path)
  if (!isOk(decoded)) throw new Error(`cannot decode ${path}: ${decoded.error.detail}`)
  return decoded.value
}

/**
 * Every module specifier a file resolves, by any syntax.
 *
 * Matches `from "…"`, a side-effect `import "…"`, a dynamic `import("…")` and a `require("…")`. The
 * four shapes are the ones a planted import can hide behind, and the self-test below proves each of
 * them is caught rather than trusting that they are.
 */
const importSpecifiers = (source: string): readonly string[] => {
  const pattern = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s*|\brequire\s*\(\s*)["']([^"']+)["']/g
  return [...stripCommentsOnly(source).matchAll(pattern)].map((match) => match[1] ?? "")
}

/** Whether a file reaches into the verifier, by any syntax. Proved to fail on eight shapes below. */
const importsTheVerifier = (source: string): boolean =>
  importSpecifiers(source).some((specifier) => specifier === "@mizan/verify")

/**
 * The specifiers that name a package rather than a file in this repository.
 *
 * A relative one is a sibling module, which the module's own `export * as … from "./self.ts"`
 * self-reexport is full of and which says nothing about what the arm may depend on. What must be
 * named here is a package.
 */
const packageSpecifiers = (source: string): ReadonlySet<string> =>
  new Set(importSpecifiers(source).filter((specifier) => !specifier.startsWith(".")))

/**
 * The anchor as a full `CorpusRecord`, deriving `textMatch` with the real normalizer.
 *
 * Deriving rather than shipping, for the reason `eval.test.ts` gives: a fixture carrying its own
 * pre-folded column could make a fabrication retrieve itself, and the assertion would then be
 * describing a fiction.
 */
const toRecord = (anchor: EvalAnchor): CorpusRecord => ({
  id: anchor.id,
  collection: anchor.collection,
  number: anchor.number,
  grade: anchor.grade,
  gradeApplicable: anchor.gradeApplicable,
  gradeSource: anchor.gradeSource,
  gradeBasis: anchor.gradeBasis,
  attribution: anchor.attribution,
  license: anchor.license,
  licenseUrl: anchor.licenseUrl,
  sourceUrl: anchor.sourceUrl,
  textDisplay: anchor.textDisplay,
  textMatch: normalizeForMatch(anchor.textDisplay),
  translation: anchor.translation,
})

/* ------------------------------------------------------------------ the hermetic arm */

let set: EvalSet
let dir: string
let snapshotPath: string
let cases: ScoredCase[]
/** The baseline arm's view, kept separate so it cannot reach the system half by accident. */
let baselineCases: BaselineCase[]

beforeAll(() => {
  set = readSet(REDTEAM_PATH)
  dir = mkdtempSync(join(tmpdir(), "mizan-benchmark-"))
  snapshotPath = buildSnapshot(join(dir, "corpus.db"), set.anchors.map(toRecord)).path
  cases = set.cases.map((entry) => ({
    id: entry.id,
    classId: entry.classId,
    quote: entry.quote,
    anchorId: entry.anchorId,
    citation: entry.citation,
  }))
  baselineCases = cases.map((entry) => ({ id: entry.id, quote: entry.quote, anchorId: entry.anchorId, citation: entry.citation }))
})

afterAll(() => {
  // Best-effort: Windows releases the SQLite handle asynchronously, and a leftover directory under
  // the OS temp folder is not a test failure. A flaky cleanup would train the reader to ignore CI.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  } catch {
    // The OS reclaims it.
  }
})

/**
 * Score the red-team set with one declaration, against the hermetic snapshot.
 *
 * `figuresOf` returns a `Result`, so this unwraps it — and this is the only place in the file that
 * throws. AGENTS.md §2 allows a raw throw to escape a test helper and nowhere else, which is exactly
 * this: the two arm fixtures below have their case counts asserted to agree, so a refusal here is a
 * broken fixture, not a product behaviour under test. The refusals themselves are asserted as
 * `Result`s further down, where they are the subject rather than an accident.
 */
const runArm = (options: BaselineOptions): Figures => {
  const db = openSnapshot(snapshotPath)
  try {
    const computed = figuresOf(score(cases, runBaseline(db, baselineCases, options)), runSystemArmFigures(db))
    if (isErr(computed)) throw new Error(`the fixture's two arms disagree: ${computed.error}`)
    return computed.value
  } finally {
    db.close()
  }
}

/**
 * The system arm's figures, MEASURED on the same hermetic snapshot.
 *
 * Run through the real `verifyAnswer` rather than read off the set, which is the whole point of the
 * split: this helper is the only place in the test file where the two are joined, and it is the
 * proof that the published detection rate is a measurement rather than a restatement.
 *
 * The executor receives a projection with no verdict field of any kind, mirroring `run.ts`.
 */
const runSystemArmFigures = (db: Database): ComparisonFigures =>
  systemFigures(
    compare(
      set.cases.map((entry) => ({ id: entry.id, verdict: entry.expectedVerdict })),
      runSystemArm(
        db,
        set.cases.map((entry) => ({ id: entry.id, quote: entry.quote, citation: entry.citation })),
        "hermetic-snapshot",
      ),
    ),
  )

const honest = () => runArm(HONEST_OPTIONS)

/**
 * The two sides of the field-list comparison, both named `readonly string[]` and both sorted.
 *
 * `BASELINE_FIELDS` is `readonly (keyof BaselineDeclaration)[]`, and `Object.keys` gives `string[]`.
 * Comparing a narrow union against `string[]` is a compile error rather than a test failure, so the
 * widening is written down here once instead of being cast away twice. Nothing is lost: the
 * declaration's keys are what the assertion is about, and a key outside the union cannot reach
 * `Object.keys` of a decoded `BaselineDeclaration`.
 */
const catalogueFields = (): readonly string[] => [...BASELINE_FIELDS].sort()
const declaredFields = (declaration: BaselineDeclaration): readonly string[] => Object.keys(declaration).sort()

/* ------------------------------------------------------------------ independence */

describe("the two arms are not circular", () => {
  test("the baseline arm imports exactly bun:sqlite and the one normalizer it needs", () => {
    const source = readFileSync(join(ROOT, "scripts", "benchmark", "baseline.ts"), "utf8")
    expect(packageSpecifiers(source)).toEqual(new Set(["bun:sqlite", "@mizan/core"]))
  })

  test("only the executor imports the verifier, and it is the module that must", () => {
    // The invariant INVERTED when the system arm became a real run: previously no benchmark module
    // could import `@mizan/verify`, because the arm did not execute it and importing it would have
    // been scoring the system with itself. Now the executor must import it and every other module
    // must not — score.ts in particular, because it is the one that used to restate the labels.
    for (const relative of ["baseline.ts", "score.ts", "rigged.ts", "report.ts", "compare.ts"]) {
      const source = readFileSync(join(ROOT, "scripts", "benchmark", relative), "utf8")
      expect({ file: relative, importsVerifier: importsTheVerifier(source) }).toEqual({ file: relative, importsVerifier: false })
    }
    const executor = readFileSync(join(ROOT, "scripts", "benchmark", "system-arm.ts"), "utf8")
    expect(importsTheVerifier(executor)).toBe(true)
  })

  test("the executor cannot read the declarations, so it cannot restate them", () => {
    // The mechanical half of the same property: the token that would name a declared verdict is
    // absent from the file that produces the measurement. A comment mentioning the ban is fine;
    // what cannot appear is the field itself.
    const executor = readFileSync(join(ROOT, "scripts", "benchmark", "system-arm.ts"), "utf8")
    const code = executor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toContain("expectedVerdict")
    expect(code).not.toContain("expectedReason")
  })

  test("the guard itself fails on all eight planted shapes", () => {
    // A guard that cannot fail protects nothing (AGENTS.md §14). Each shape is a way the previous
    // single-line regex family failed open, so each is asserted to be caught here.
    const caught = [
      ["single-line import", 'import { verifyAnswer } from "@mizan/verify"'],
      ["multi-line import", 'import {\n  verifyAnswer,\n} from "@mizan/verify"'],
      ["re-export", 'export { verifyAnswer } from "@mizan/verify"'],
      ["star re-export", 'export * from "@mizan/verify"'],
      ["dynamic import", 'const v = await import("@mizan/verify")'],
      ["require", 'const v = require("@mizan/verify")'],
      ["single quotes", "import { verifyAnswer } from '@mizan/verify'"],
      ["indented inside a function", '  const v = await import("@mizan/verify")'],
    ] as const
    for (const [name, source] of caught) expect(`${name}: ${importsTheVerifier(source)}`).toBe(`${name}: true`)
  })

  test("the guard does not fire on prose, on a bare mention, or on a different package", () => {
    const allowed = [
      "/** The baseline must never import @mizan/verify; that would be scoring it with itself. */",
      "// never `import ... from \"@mizan/verify\"` here",
      'import { verifyLedger } from "@mizan/corpus"',
      'const note = "mizan/verify"',
    ] as const
    for (const source of allowed) expect(importsTheVerifier(source)).toBe(false)
  })

  test("the measured system arm does not move when the baseline arm is stripped away", () => {
    // The property the tautology made unfalsifiable, stated as a measurement. Scoring the set with
    // NO baseline results at all still yields the same system figures, because they come from
    // `verifyAnswer` rather than from anything the baseline did. A detection rate that improved when
    // the baseline got worse would be measuring the baseline.
    const withArm = score(cases, [])
    expect(withArm.every((entry) => entry.baselineTopRecordId === null && entry.baselineTopHit === false)).toBe(true)
    const db = openSnapshot(snapshotPath)
    try {
      const system = runSystemArmFigures(db)
      expect(system.detectionRate).toBe(honest().systemDetectionRate)
      expect(system.abstentionRate).toBe(honest().systemAbstentionRate)
      expect(system.agreementRate).toBe(honest().systemAgreementRate)
    } finally {
      db.close()
    }
  })
})

/* ------------------------------------------------------------------ the honest arm */

describe("an honest baseline is not punished", () => {
  test("the honest declaration raises no finding", () => {
    expect(assertBaselineIsHonest(HONEST_OPTIONS)).toEqual([])
    expect(movedFieldsOf(HONEST_OPTIONS)).toEqual([])
  })

  test("the honest options are the one published honest value, and are frozen", () => {
    expect(toDeclaration(HONEST_OPTIONS)).toEqual(HONEST_BASELINE)
    expect(Object.isFrozen(HONEST_OPTIONS)).toBe(true)
  })

  test("the declaration decodes through the schema, and carries exactly the declared fields", () => {
    const decoded = decodeOrFail(decodeSync(BaselineDeclarationSchema), toDeclaration(HONEST_OPTIONS), "declaration")
    if (!isOk(decoded)) throw new Error(`the honest declaration does not satisfy BaselineDeclaration: ${decoded.error.detail}`)
    expect(catalogueFields()).toEqual(declaredFields(decoded.value))
  })

  test("running it twice publishes the same figures, so the self-test changes nothing", () => {
    expect(honest()).toEqual(honest())
  })

  test("the executed system arm catches every fabrication, agrees with the set, and abstains on none", () => {
    const figures = honest()
    expect(figures.caseCount).toBe(set.cases.length)
    // Measured by running `verifyAnswer` over the set, not read off its declarations. The agreement
    // rate is the assertion that makes the detection rate mean something: a verifier that called
    // every case `unverifiable` would also score a perfect detection rate, and would score 0 here.
    expect(figures.systemDetectionRate).toBe(1)
    expect(figures.systemAgreementRate).toBe(1)
    expect(figures.systemAbstentionRate).toBe(0)
    // Computed from the executed verdicts, not hard-coded: zero false-verified is the release
    // blocker, and a `toBe(0)` on a figure this file derived is the strongest form of it.
    expect(figures.falseVerifiedCount).toBe(0)
  })
})

/* ------------------------------------------------------------------ the six planted defects */

describe("every planted defect fails the harness", () => {
  test("the catalogue holds exactly the number the architecture names, with unique names", () => {
    expect(RIGGED_BASELINES).toHaveLength(RIGGED_COUNT)
    const names = RIGGED_BASELINES.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test("the catalogue's own field list is the declaration's field list", () => {
    // A lever added to `BaselineDeclaration` and forgotten in `FIELDS` would be unchecked by
    // `movedFieldsOf` and therefore uncheckable by the honesty check. This is the gate on the gate.
    expect(catalogueFields()).toEqual(declaredFields(HONEST_BASELINE))
  })

  for (const rigged of RIGGED_BASELINES) {
    describe(`the ${rigged.name} rig`, () => {
      test("is rejected, and the finding names the lever", () => {
        const findings = assertBaselineIsHonest(rigged.options)
        expect(findings.length).toBeGreaterThan(0)
        for (const field of rigged.movedFields) {
          expect(findings.some((finding) => finding.includes(`${field} =`))).toBe(true)
        }
      })

      test("moves exactly the fields the catalogue declares, and nothing else", () => {
        expect(movedFieldsOf(rigged.options)).toEqual(rigged.movedFields)
      })

      test("leaves every field it does not declare at the honest value", () => {
        const declared: BaselineDeclaration = toDeclaration(rigged.options)
        for (const field of Object.keys(HONEST_BASELINE) as readonly (keyof BaselineDeclaration)[]) {
          if (rigged.movedFields.includes(field)) continue
          expect(`${rigged.name}.${field}: ${String(declared[field])}`).toBe(`${rigged.name}.${field}: ${String(HONEST_BASELINE[field])}`)
        }
      })
    })
  }

  test("at least one planted defect moves the number in the direction that flatters the baseline", () => {
    // AC-103-1: the rig must move the figure, not merely fail the check. `gold-record-id` is 1.0 on
    // any corpus because the answer is handed over, so this holds wherever the test runs.
    const rates = RIGGED_BASELINES.map((rigged) => runArm(rigged.options).baselineTop1HitRate)
    expect(Math.max(...rates)).toBeGreaterThan(honest().baselineTop1HitRate)
  })

  test("at least one planted defect moves it the other way, which is as bad as inflating it", () => {
    const rates = RIGGED_BASELINES.map((rigged) => runArm(rigged.options).baselineTop1HitRate)
    expect(Math.min(...rates)).toBeLessThan(honest().baselineTop1HitRate)
  })

  test("a combination of defects is attributed field by field, not as a single blob", () => {
    // The specification's edge case: a rig moving three levers at once must still yield three
    // separately named findings, or a reader cannot tell which lever to unpick.
    const combined: BaselineOptions = { ...HONEST_OPTIONS, collectionFilter: true, usesGoldRecordId: true, k: 12 }
    const findings = assertBaselineIsHonest(combined)
    expect(findings).toHaveLength(3)
    expect(findings.filter((finding) => finding.includes("collectionFilter ="))).toHaveLength(1)
    expect(findings.filter((finding) => finding.includes("usesGoldRecordId ="))).toHaveLength(1)
    expect(findings.filter((finding) => finding.includes("k ="))).toHaveLength(1)
    expect(movedFieldsOf(combined)).toEqual(["collectionFilter", "usesGoldRecordId", "k"])
  })

  test("the wide-k rig produces the honest number, which is why the declaration is printed", () => {
    // Structurally true, not corpus-dependent: `k` only changes how many rows come back, and the
    // honest path reads the first of them. So this defect is invisible in the figures, and the only
    // defence is the printed declaration plus this check.
    const wide = RIGGED_BASELINES.find((entry) => entry.name === "wide-k")
    expect(wide).toBeDefined()
    expect(runArm(wide?.options ?? HONEST_OPTIONS).baselineTop1HitRate).toBe(honest().baselineTop1HitRate)
    expect(assertBaselineIsHonest(wide?.options ?? HONEST_OPTIONS)).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ the join fails closed */

describe("a case cannot quietly leave the comparison", () => {
  const declared: readonly LabelledCase[] = [{ id: "a", verdict: "unverifiable" }]

  test("a declaration with no measurement is refused rather than dropped", () => {
    // The row that would silently shrink the denominator if the guard were absent: one label, no
    // verdict, and a rate computed over nothing.
    expect(() => compare(declared, [])).toThrow(/no measured outcome for a/)
  })

  test("a measurement with no declaration is refused, which is the guard the module documents", () => {
    // The direction the arithmetic cannot catch, because it produces no row to catch it on: the
    // executor was handed a case the set does not contain, and every rate would then be about a
    // smaller set than the report names. It cannot fire on the committed path, so it is planted here.
    const orphan: SystemOutcome[] = [{ caseId: "a", verdict: "unverifiable", reason: "not contained" }]
    expect(() => compare([], orphan)).toThrow(/the set does not declare/)
  })

  test("the refusal names the offending case, so the message is actionable", () => {
    const orphan: SystemOutcome[] = [{ caseId: "ghost-001", verdict: "verified", reason: "contained" }]
    expect(() => compare(declared, orphan)).toThrow(/ghost-001/)
  })

  test("an empty set is refused rather than published as 0 over 0", () => {
    // The specification's declared edge case. Every rate is `hits / total`, so an empty set yields
    // `0.0%` detection, `0.0%` baseline and a delta of `0.0` — an artefact reading "mizan caught
    // nothing" when the truth is "nothing ran". `run.ts` refuses it earlier with exit 3; this is
    // the invariant underneath, asserted where it lives.
    //
    // Asserted as a `Result` rather than through `toThrow`, because the return type is the thing under
    // test: `toThrow` would still pass against a function that threw a *string*, and it would not
    // compile if someone widened the signature back to `Figures | undefined` and dropped the refusal.
    const refusal = figuresOf(score([], []), systemFigures([]))
    expect(isOk(refusal)).toBe(false)
    expect(isErr(refusal) && refusal.error).toMatch(/zero cases/)
  })

  test("a one-case set is still scored, so the refusal above is not a size limit", () => {
    // The baseline arm returns nothing for the single case, so `baselineTop1HitRate` is a genuine
    // `0/1` rather than a `0/0`: the same numerator the empty set produced, over a denominator that
    // exists, and the two must not be the same claim.
    const oneCase = cases[0]
    if (oneCase === undefined) throw new Error("the committed red-team set has no cases")
    const figures = expectOk(
      figuresOf(score([oneCase], []), systemFigures(compare(declared, [{ caseId: "a", verdict: "unverifiable", reason: "not contained" }]))),
    )
    expect(figures.caseCount).toBe(1)
    expect(figures.systemDetectionRate).toBe(1)
    expect(figures.baselineTop1HitRate).toBe(0)
    expect(figures.delta).toBe(1)
  })
})

/* ------------------------------------------------------------------ the published report */

describe("the report publishes the claim before the numbers, and publishes an unfavourable one", () => {
  const result = (overrides: Partial<BenchmarkResult> = {}): BenchmarkResult => {
    const figures = honest()
    return {
      schemaVersion: 2,
      preRegisteredHypothesis: PRE_REGISTERED_HYPOTHESIS,
      corpusFingerprint: "0".repeat(64),
      corpusRecordCount: 27234,
      setName: "redteam-fabricated",
      caseCount: figures.caseCount,
      baselineTop1HitRate: figures.baselineTop1HitRate,
      systemDetectionRate: figures.systemDetectionRate,
      systemAgreementRate: figures.systemAgreementRate,
      systemAbstentionRate: figures.systemAbstentionRate,
      delta: figures.delta,
      falseVerifiedCount: figures.falseVerifiedCount,
      systemArmSource: "executed-verifier",
      declaration: toDeclaration(HONEST_OPTIONS),
      ...overrides,
    }
  }

  test("it states the pre-registered hypothesis verbatim, ABOVE the first figure", () => {
    const text = renderBenchmarkReport(result(), honest())
    expect(text).toContain(PRE_REGISTERED_HYPOTHESIS)
    expect(text.indexOf(PRE_REGISTERED_HYPOTHESIS)).toBeLessThan(text.indexOf("baseline top-1 hit rate"))
  })

  test("it prints all four figures, the fingerprint and the record count", () => {
    const text = renderBenchmarkReport(result(), honest())
    for (const label of ["baseline top-1 hit rate", "system detection rate", "system abstention rate", "delta", "false verified"]) {
      expect(text).toContain(label)
    }
    expect(text).toContain("0".repeat(64))
    expect(text).toContain("27234")
  })

  test("it prints the whole baseline configuration, which is where the levers are visible", () => {
    // MIZ-103's edge case: a lever invisible in the output is the lever that survives review.
    const text = renderBenchmarkReport(result(), honest())
    for (const line of ["strategy", "column", "collectionFilter", "usesGoldRecordId", "k", "rerunBudget"]) {
      expect(text).toContain(line)
    }
    // The query shape too, because `fts5-bm25` states the ranking and not what was asked for.
    expect(text).toContain("OR-ed")
  })

  test("the case count in the prose follows the artefact, not a number typed into the sentence", () => {
    // A literal `40` in a sentence is a second source of truth for the denominator that nothing
    // checks (AGENTS.md §17): the set grows, the sentence keeps claiming the old size, and the
    // report reads as though it described the run it just performed.
    expect(renderBenchmarkReport(result(), honest())).toContain(`returns 0 of these ${set.cases.length} on the committed`)
    expect(renderBenchmarkReport(result({ caseCount: set.cases.length + 1 }), honest())).toContain(`returns 0 of these ${set.cases.length + 1} on the committed`)
  })

  test("an unfavourable delta is printed as measured, and the run is still reported as successful", () => {
    const riggedResult = result({ baselineTop1HitRate: 1, delta: 0 })
    const text = renderBenchmarkReport(riggedResult, { ...honest(), baselineTop1HitRate: 1, delta: 0 })
    expect(text).toContain("delta                      +0.0%")
    expect(text).toContain("NOT supported")
    const negative = renderBenchmarkReport(result({ delta: -0.25 }), { ...honest(), delta: -0.25 })
    expect(negative).toContain("-25.0%")
    expect(negative).not.toContain("+25.0%")
  })

  test("two renders of the same result are byte-identical, and nothing in them varies", () => {
    const first = renderBenchmarkReport(result(), honest())
    const second = renderBenchmarkReport(result(), honest())
    expect(first).toBe(second)
    // A report that carried a clock or a path could not be diffed between two runs or between two
    // machines, which is the only reason to print one at all.
    expect(first).not.toContain(ROOT)
    expect(first).not.toContain("corpus.db")
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(first).not.toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  test("it carries no corpus text, no question text and no case text (rule 13)", () => {
    const text = renderBenchmarkReport(result(), honest())
    for (const entry of set.cases) {
      expect(text).not.toContain(entry.quote)
      expect(text).not.toContain(entry.id)
    }
  })

  test("the artefact satisfies the schema the runner writes it with", () => {
    const decoded = decodeOrFail(decodeSync(BenchmarkResultSchema), result(), "vs-search.json")
    if (!isOk(decoded)) throw new Error(`the published result does not satisfy BenchmarkResult: ${decoded.error.detail}`)
    expect(decoded.value.preRegisteredHypothesis).toBe(PRE_REGISTERED_HYPOTHESIS)
  })
})

/* ------------------------------------------------------------------ untrusted text into a grammar */

describe("a corpus span cannot become an FTS5 query", () => {
  const probe = (quote: string): string | null => {
    const db = openSnapshot(snapshotPath)
    try {
      return runBaseline(db, [{ id: "probe", quote, anchorId: "abudawud:1", citation: { collection: "abudawud", number: "1" } }], HONEST_OPTIONS)[0]
        ?.topRecordId ?? null
    } finally {
      db.close()
    }
  }

  /** "answered …", or why it did not. The property under test is that the harness answers at all. */
  const outcome = (quote: string): string => {
    try {
      return `answered ${probe(quote) === null ? "no hit" : "a hit"}`
    } catch (error) {
      return `threw ${error instanceof Error ? error.message : String(error)}`
    }
  }

  test("a quote containing FTS5 operators is searched as text, not parsed as a query", () => {
    // A03 at a text-shaped boundary. Unquoted, each of these either dies with `no such column: …`
    // or `fts5: syntax error` — which is how this harness crashed on real corpus text before the
    // query was quoted, and a harness that crashes on its own input set publishes no comparison at
    // all. A hit here is fine and is not what is asserted; an answer is.
    const operators = [
      ["a hyphen-joined compound", "الخبر - يعني-Abdul"],
      ["full stops, brackets, parentheses and a star", "ذاك. الرمز (2) والسؤال * هنا"],
      ["an embedded double quote", 'نص فيه "علامات اقتباس"another-thing'],
      ["a leading operator", "NOT anchor OR this"],
      ["an unbalanced quote", 'نص " غير مغلق'],
      ["nothing at all", ""],
    ] as const
    for (const [name, quote] of operators) expect(`${name}: ${outcome(quote)}`).toStartWith(`${name}: answered`)
  })

  test("a quote with no retrievable token scores as no hit, which is honest rather than fatal", () => {
    expect(probe("")).toBeNull()
    expect(probe("   ")).toBeNull()
    expect(probe("---")).toBeNull()
    expect(probe("zzz qqq xxx")).toBeNull()
  })
})

/* ------------------------------------------------------------------ the claims in the prose */

describe("the claims in baseline.ts are facts, not prose", () => {
  /** The cases whose FOLDED quote carries an FTS5 grammar character, in set order. */
  const atRisk = (): readonly string[] =>
    set.cases.filter((entry) => FTS5_GRAMMAR_CHARACTERS.test(normalizeForMatch(entry.quote))).map((entry) => entry.id)

  test("five of the forty quotes carry a grammar character, and the first is redteam-009", () => {
    // This is the correction of an earlier claim that the old harness "crashed on the fifth case".
    // Both numbers are functions of the SET and the exported character set, so neither needs a
    // corpus — which is what makes them checkable at all (AGENTS.md §17).
    expect(atRisk()).toHaveLength(5)
    expect(atRisk()[0]).toBe("redteam-009")
  })

  test("the set is large enough for the count to mean something", () => {
    // Guards the assertion above against becoming vacuous: a set of three quotes would make "five"
    // a typo rather than a finding.
    expect(set.cases.length).toBe(40)
    expect(atRisk().length).toBeLessThan(set.cases.length)
  })

  test("the honest harness answers every case in the real set, not only the synthetic probes", () => {
    // The regression test for the defect itself. Five hand-written probes could all be unlucky;
    // the forty committed cases are the input the crash actually happened on, so this asserts the
    // property the fix is for — a benchmark that dies on its own input set publishes no comparison.
    const db = openSnapshot(snapshotPath)
    let answers: string[]
    try {
      answers = runBaseline(db, baselineCases, HONEST_OPTIONS).map((entry) => entry.caseId)
    } catch (error) {
      throw new Error(`the honest harness threw on the red-team set: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      db.close()
    }
    expect(answers).toEqual(baselineCases.map((entry) => entry.id))
  })

  test("the '26 of them' is the committed artefact's figure, not prose this file remembers", () => {
    // The one claim in `baseline.ts` that is NOT a function of the set: it was measured against the
    // attested 27,234-record corpus, a gitignored artefact no unit test may require — which is why
    // the two claims above derive from a case list and this one does not. It is still checkable,
    // because the RESULT is committed. The measurement is not reproduced here (that needs the
    // corpus); the published claim is checked against the file `bun run benchmark:vs-search` writes,
    // decoded through the same schema the runner writes it with, so a stale artefact fails too.
    const path = join(ROOT, "data", "benchmark", "vs-search.json")
    const decoded = decodeOrFail(decodeSync(BenchmarkResultSchema), JSON.parse(readFileSync(path, "utf8")) as unknown, path)
    if (!isOk(decoded)) throw new Error(`cannot decode ${path}: ${decoded.error.detail}`)
    const published = decoded.value

    // Over the SAME set, or the figure is about something else and the multiplication below is
    // arithmetic on two unrelated numbers.
    expect(published.setName).toBe("redteam-fabricated")
    expect(published.caseCount).toBe(set.cases.length)

    // `0.65 x 40 = 26`, and the doc comment's "a substantial majority" is that same fraction read
    // against a half, rather than a hope stated in prose.
    expect(published.baselineTop1HitRate * published.caseCount).toBe(PUBLISHED_BASELINE_TOP1_HITS)
    expect(published.baselineTop1HitRate).toBeGreaterThan(0.5)

    // The artefact must be the HONEST arm's, and must record the release blocker as measured. A
    // published figure with a moved lever beside it is the one thing that would make the number
    // above meaningless, so the declaration is checked here rather than trusted from the report.
    expect(published.declaration).toEqual(HONEST_BASELINE)
    expect(published.falseVerifiedCount).toBe(0)
  })
})

/**
 * The committed artefact's own invariants, which `docs/value-proof.md` prints as figures.
 *
 * `data/benchmark/vs-search.json` is a committed RUN rather than a sentence somebody typed, and the
 * pack quotes it field by field. The schema already admits a single `systemArmSource`, so decoding
 * rules out the other shape; the assertions below are the ones a schema cannot carry — that the
 * delta is the two rates subtracted rather than a number written beside them, that abstention is
 * zero (so detection was not bought by punting to `unverifiable`), and that no fabrication was ever
 * called verified. They live here rather than in the pack's test because the pack only quotes these
 * fields: if an arithmetic relationship moved, this test reports it before a document has to.
 */
describe("the committed benchmark artefact's own invariants", () => {
  test("the system arm is the executed verifier, and the delta is the two rates subtracted", () => {
    const path = join(ROOT, "data", "benchmark", "vs-search.json")
    const decoded = decodeOrFail(decodeSync(BenchmarkResultSchema), JSON.parse(readFileSync(path, "utf8")) as unknown, path)
    if (!isOk(decoded)) throw new Error(`cannot decode ${path}: ${decoded.error.detail}`)
    const published = decoded.value

    expect(published.systemArmSource).toBe("executed-verifier")
    // Not `toBe`: the artefact stores 0.35 and IEEE-754 stores `1 - 0.65` as 0.35000000000000003.
    // An exact comparison would fail on a correct artefact, and a gate that cries wolf gets
    // switched off the first time somebody has to explain it.
    expect(published.systemDetectionRate - published.baselineTop1HitRate).toBeCloseTo(published.delta, 10)
    expect(published.systemAbstentionRate).toBe(0)
    expect(published.falseVerifiedCount).toBe(0)
  })
})
