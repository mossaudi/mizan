import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeOrFail, decodeSync, isOk, normalizeForMatch, EvalSet as EvalSetSchema, type Claim, type CorpusRecord, type EvalAnchor, type EvalCase, type EvalSet, type Verdict, type VerdictReason } from "@mizan/core"
import { buildSnapshot, openSnapshot, resolveCitations } from "@mizan/corpus"
import { stripCommentsOnly } from "@mizan/gate"
import { verifyAnswer } from "@mizan/verify"
import type { Database } from "bun:sqlite"

/**
 * The eval sets, run for real.
 *
 * ## What this asserts, and why it is not a unit test
 *
 * A golden set is only evidence if the things it measures are real. So nothing here is mocked:
 * the snapshots are built by the production `buildSnapshot` from the anchors the artefact ships,
 * the citations go through the production `resolveCitations`, and the verdicts come from the
 * production `verifyAnswer`. The only thing a fixture supplies is TEXT - the quote and the corpus
 * rows it was derived from. If the normalizer, the resolver or the verifier changes behaviour,
 * this fails.
 *
 * ## The two gates, and why their bars differ
 *
 *  - `redteam-fabricated.json`: **exactly zero** `verified`. Every case is a fabrication, so one
 *    hit is a false positive on invented religious text. There is no tolerance here and no
 *    accuracy percentage to trade against: a 39/40 score on this set is a shipped bug, not a
 *    near miss.
 *
 *  - `golden-normalization.json`: **100%**, which is stricter than the architecture's 99% bar.
 *    The 99% bar exists so a legitimately hard case can be documented and excluded. Here every
 *    expectation is derived from the fold table by construction, so a mismatch means either the
 *    fold table changed or an expectation is wrong - and both need a human to look, not a
 *    tolerance to absorb them. A verifier this deterministic should not be within 1% of a set
 *    built to describe it.
 *
 * ## Why the snapshot is hermetic
 *
 * `data/corpus.db` is a large gitignored build artefact, so a set that needed it would be
 * unrunnable by a judge and unrunnable in a fresh clone. (The size is stated once, in
 * `.gitignore`; what matters here is that it is not committed.) Each set therefore ships the
 * rows it quotes, and this builds a snapshot from exactly those. The consequence is a real
 * constraint the generator had to respect: a citation can only resolve if the row it names is
 * among the set's own anchors, which is why the `ambiguous_collection` class quotes from every
 * collection that numbers a record `1`.
 */
const ROOT = join(import.meta.dir, "..", "..", "..")
const GOLDEN_PATH = join(ROOT, "data", "eval", "golden-normalization.json")
const REDTEAM_PATH = join(ROOT, "data", "eval", "redteam-fabricated.json")

/** The accuracy bar the architecture states, recorded so the stricter one below is a decision, not an accident. */
const ARCHITECTURE_MIN_ACCURACY = 0.99

/** A JSON.parse, then a type. Only ever applied to a file this repository committed itself. */
const parseJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown

/* ------------------------------------------------------------------ reading the artefacts */

/**
 * Decode a committed artefact through the schema core declares for it.
 *
 * The shape lives in `@mizan/core` rather than here for two reasons: the generator writes these
 * files and must not be able to describe a different shape, and this test must not need `effect`
 * in its own dependency list, since the beta API is deliberately confined to one seam.
 */
const readSet = (path: string): EvalSet => {
  const decoded = decodeOrFail(decodeSync(EvalSetSchema), parseJson(path), path)
  if (!isOk(decoded)) throw new Error(`cannot decode ${path}: ${decoded.error.detail}`)
  return decoded.value
}

/* ------------------------------------------------------------------ the hermetic snapshot */

/**
 * Rebuild each anchor into a full `CorpusRecord`, deriving `textMatch` with the real normalizer.
 *
 * Deriving rather than shipping is the point: a fixture that carried its own pre-folded column
 * could make a fabrication verify itself by editing `textMatch` alone, and the set would then be
 * asserting a falsehood. Here the only thing worth editing is `textDisplay`, and `textHash`
 * catches that.
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

const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex")

/** Every case in a set as one answer, so the whole set runs through `verifyAnswer` in a single pass. */
const claimsOf = (cases: readonly EvalCase[]): readonly Claim[] =>
  cases.map((entry) => ({ id: entry.id, text: entry.note, quote: entry.quote, citations: [entry.citation] }))

type Run = { readonly db: Database; readonly dir: string; readonly report: ReturnType<typeof verifyAnswer> }

/** Build a snapshot from the set's own anchors, then verify the whole set against it. */
const runSet = (name: string, set: EvalSet): Run => {
  const dir = mkdtempSync(join(tmpdir(), `mizan-eval-${name}-`))
  const built = buildSnapshot(join(dir, "corpus.db"), set.anchors.map(toRecord))
  const db = openSnapshot(built.path)
  const claims = claimsOf(set.cases)
  const citations = set.cases.map((entry) => entry.citation)
  const resolved = resolveCitations(db, citations)
  if (resolved.problems.length > 0) throw new Error(`${name}: ${resolved.problems.length} rows failed CorpusRecord decoding: ${resolved.problems[0]?.detail ?? ""}`)
  const report = verifyAnswer({ claims, evidence: resolved.resolved, snapshotHash: built.snapshotHash })
  return { db, dir, report }
}

/* ------------------------------------------------------------------ the runs */

let golden: EvalSet
let redTeam: EvalSet
let goldenRun: Run
let redTeamRun: Run

beforeAll(() => {
  golden = readSet(GOLDEN_PATH)
  redTeam = readSet(REDTEAM_PATH)
  goldenRun = runSet("golden", golden)
  redTeamRun = runSet("redteam", redTeam)
})

afterAll(() => {
  // Best-effort. Windows holds the SQLite file for a moment after `close()`, and a leftover
  // directory under the OS temp folder is not a test failure — failing here would report a bug
  // that does not exist and train the reader to ignore the suite.
  goldenRun?.db.close()
  redTeamRun?.db.close()
  for (const run of [goldenRun, redTeamRun]) {
    if (!run) continue
    try {
      rmSync(run.dir, { recursive: true, force: true })
    } catch {
      // ignored on purpose; see above
    }
  }
})

/** The verdicts the run produced, keyed by claim id, for readable failure messages. */
const verdictsOf = (run: Run): ReadonlyMap<string, { readonly verdict: Verdict; readonly reason: VerdictReason }> =>
  new Map(run.report.claims.map((claim) => [claim.claimId, { verdict: claim.verdict, reason: claim.reason }]))

describe("the eval sets are self-consistent", () => {
  test("the header class counts match the cases that are actually present", () => {
    for (const set of [golden, redTeam]) {
      const counted = new Map<string, number>()
      for (const entry of set.cases) counted.set(entry.classId, (counted.get(entry.classId) ?? 0) + 1)
      const fromHeader = Object.fromEntries([...counted.entries()].sort())
      expect(fromHeader).toEqual({ ...Object.fromEntries(Object.entries(set.classCounts).sort()) })
    }
  })

  test("the header verdict counts match the expectations actually declared", () => {
    const counted = new Map<string, number>()
    for (const entry of golden.cases) counted.set(entry.expectedVerdict, (counted.get(entry.expectedVerdict) ?? 0) + 1)
    expect(Object.fromEntries([...counted.entries()].sort())).toEqual({ ...Object.fromEntries(Object.entries(golden.verdictCounts).sort()) })
  })

  test("every case cites an anchor the set actually ships", () => {
    const shipped = new Set(golden.anchors.map((anchor) => anchor.id))
    for (const entry of golden.cases) expect(shipped.has(entry.anchorId)).toBe(true)
    const redShipped = new Set(redTeam.anchors.map((anchor) => anchor.id))
    for (const entry of redTeam.cases) expect(redShipped.has(entry.anchorId)).toBe(true)
  })

  test("the anchor count in the header is the number of anchors present", () => {
    expect(golden.anchorCount).toBe(golden.anchors.length)
    expect(redTeam.anchorCount).toBe(redTeam.anchors.length)
  })

  /**
   * The other half of that claim, and the part that makes it a breadth claim rather than a count.
   *
   * `anchorCount === anchors.length` only proves the header is internally honest. An anchor that no
   * case quotes is shipped, counted, and then never exercised — so "the 200 golden cases draw on 56
   * records" would still be true while the sets actually exercise fewer subjects than they say. This
   * is the arithmetic `bun run check:docs` rule R6 compares a document against, so it is what has to
   * hold for the document to be telling the truth.
   */
  test("every shipped anchor is actually cited, so 'draws on N records' stays true", () => {
    const goldenCited = new Set(golden.cases.map((entry) => entry.anchorId))
    expect(goldenCited.size).toBe(golden.anchorCount)
    const redTeamCited = new Set(redTeam.cases.map((entry) => entry.anchorId))
    expect(redTeamCited.size).toBe(redTeam.anchorCount)
  })

  /**
   * Tamper detection. A committed fixture is edited by hand more often than anyone intends, and
   * an edited `textDisplay` would quietly make every case drawn from that row wrong.
   */
  test("each anchor's textHash is the sha256 of the text it ships", () => {
    for (const set of [golden, redTeam]) {
      for (const anchor of set.anchors) {
        expect(anchor.textHash).toBe(sha256Hex(anchor.textDisplay))
      }
    }
  })

  test("every case carries a note saying what it is", () => {
    for (const set of [golden, redTeam]) {
      for (const entry of set.cases) expect(entry.note.length).toBeGreaterThan(0)
    }
  })
})

describe("the golden set", () => {
  test("has exactly 200 cases", () => {
    expect(golden.cases).toHaveLength(200)
  })

  test("every case produces exactly the declared verdict and reason", () => {
    const verdicts = verdictsOf(goldenRun)
    const wrong = golden.cases
      .map((entry) => {
        const got = verdicts.get(entry.id)
        if (got === undefined) return `${entry.id} (${entry.classId}): no verdict`
        if (got.verdict === entry.expectedVerdict && got.reason === entry.expectedReason) return null
        return `${entry.id} (${entry.classId}): expected ${entry.expectedVerdict}/${entry.expectedReason}, got ${got.verdict}/${got.reason}`
      })
      .filter((problem): problem is string => problem !== null)
    expect(wrong).toEqual([])
  })

  test("accuracy is 100%, above the architecture's 99% floor", () => {
    const verdicts = verdictsOf(goldenRun)
    const correct = golden.cases.filter((entry) => verdicts.get(entry.id)?.verdict === entry.expectedVerdict).length
    const accuracy = correct / golden.cases.length
    expect(accuracy).toBe(1)
    expect(accuracy).toBeGreaterThan(ARCHITECTURE_MIN_ACCURACY)
  })

  test("a verdict report asserts evidence if and only if it is verified", () => {
    for (const claim of goldenRun.report.claims) {
      if (claim.verdict === "verified") expect(claim.evidence).not.toBeNull()
      if (claim.verdict !== "verified") expect(claim.evidence).toBeNull()
    }
  })

  test("the four renderings of one source span all reach the same verdict", () => {
    // Story 7's scenario, stated directly: the same text, normalized three ways, one answer.
    // The digit class uses different rows, so it is compared on verdict only.
    const bySpan = new Map<string, string[]>()
    for (const entry of golden.cases) {
      if (entry.classId === "verbatim" || entry.classId === "undiacriticized" || entry.classId === "tatweel_spacing") {
        const key = entry.anchorId
        bySpan.set(key, [...(bySpan.get(key) ?? []), entry.classId])
      }
    }
    const complete = [...bySpan.entries()].filter(([, classes]) => classes.length === 3)
    expect(complete).toHaveLength(30)
    const verdicts = verdictsOf(goldenRun)
    for (const [anchorId, classes] of complete) {
      const seen = golden.cases.filter((entry) => entry.anchorId === anchorId && classes.includes(entry.classId)).map((entry) => verdicts.get(entry.id)?.verdict)
      expect(new Set(seen)).toEqual(new Set(["verified"]))
    }
  })
})

describe("the red-team set", () => {
  test("contains no case expected to verify", () => {
    expect(redTeam.cases.filter((entry) => entry.expectedVerdict === "verified")).toEqual([])
  })

  test("fabrications produce ZERO verified verdicts", () => {
    const falsePositives = redTeamRun.report.claims.filter((claim) => claim.verdict === "verified").map((claim) => claim.claimId)
    expect(falsePositives).toEqual([])
  })

  test("every fabrication is rejected at the identifier it cites", () => {
    const verdicts = verdictsOf(redTeamRun)
    for (const entry of redTeam.cases) {
      expect(verdicts.get(entry.id)?.verdict).toBe("rejected")
      expect(verdicts.get(entry.id)?.reason).toBe("quote_absent_at_cited_id")
    }
  })

  test("no rejected fabrication carries evidence", () => {
    for (const claim of redTeamRun.report.claims) {
      expect(claim.evidence).toBeNull()
      expect(claim.matchStrength).toEqual({ kind: "none" })
    }
  })
})

/**
 * The generator must not be able to derive its expectations from the code it measures.
 *
 * Without this, "hand-adjudicated" is a claim in a comment and nothing more: a future change
 * could route the build through `verifyAnswer`, record the verdicts, and produce a set that
 * passes forever while proving nothing. The check is textual and blunt on purpose - the three
 * generator files must not name the verifier at all - and it is the reason `expectedVerdict` is
 * a literal in `plan.ts`.
 */
describe("the expectations are not self-fulfilling", () => {
  const generatorFiles = ["scripts/eval/plan.ts", "scripts/eval/build.ts", "scripts/eval/mutations.ts", "scripts/eval/anchors.ts", "scripts/build-eval-set.ts"]

  /**
   * Whether a generator file reaches into the verifier.
   *
   * ## Why this is not a substring search
   *
   * These files DISCUSS `@mizan/verify` in prose at length — `plan.ts` explains why it must never
   * import it — so a naive `source.includes("@mizan/verify")` fails on its own documentation, which
   * is the wrong reason to fail anything. Comments are therefore stripped first, using the gate
   * package's own `stripCommentsOnly` rather than a second copy of it.
   *
   * ## Why the old anchored regex was a hole, not a guard
   *
   * The previous check was `/^import\b.*@mizan\/verify/m`, which required the specifier to sit on
   * the SAME LINE as the word `import`. Two ordinary ways of importing the verifier therefore
   * passed it:
   *
   * ```ts
   * import {
   *   verifyAnswer,
   * } from "@mizan/verify"          // multi-line: `.` never crossed the newline
   *
   * export { verifyAnswer } from "@mizan/verify"   // not an `import` at all
   * ```
   *
   * A guard whose failure mode is "the thing it forbids is written slightly differently" is not a
   * guard. So the rule is stated against the module specifier itself — anything that resolves
   * `@mizan/verify` as a module, by any syntax, in any number of lines — and it is proven below
   * against each of those shapes.
   */
  const importsTheVerifier = (source: string): boolean =>
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']@mizan\/verify["']/.test(stripCommentsOnly(source))

  test("no generator file imports the verifier", () => {
    for (const relative of generatorFiles) {
      const source = readFileSync(join(ROOT, ...relative.split("/")), "utf8")
      expect({ file: relative, importsVerifier: importsTheVerifier(source) }).toEqual({ file: relative, importsVerifier: false })
    }
  })

  // The planted cases. A guard that cannot fail is not a guard (AGENTS.md §14), and this one had
  // already failed open once, so each shape the old regex missed is now asserted to be caught.
  describe("the guard itself", () => {
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

    for (const [name, source] of caught) {
      test(`catches a ${name}`, () => {
        expect(importsTheVerifier(source)).toBe(true)
      })
    }

    const allowed = [
      ["prose in a block comment", "/** The plan explains why @mizan/verify must never be imported. */"],
      ["prose in a line comment", "// never `import ... from \"@mizan/verify\"` here"],
      ["a different package", 'import { verifyLedger } from "@mizan/corpus"'],
      ["the word alone", 'const note = "mizan/verify"'],
    ] as const

    for (const [name, source] of allowed) {
      test(`does not flag ${name}`, () => {
        expect(importsTheVerifier(source)).toBe(false)
      })
    }
  })

  test("the plan declares every verdict as a literal, in one table", () => {
    const source = readFileSync(join(ROOT, "scripts", "eval", "plan.ts"), "utf8")
    for (const literal of ['expectedVerdict: "verified"', 'expectedVerdict: "rejected"', 'expectedVerdict: "unverifiable"']) {
      expect(source).toContain(literal)
    }
    // One table, one source: every `expectedVerdict` literal in `plan.ts` must belong to a
    // declared class, so the count has to match the classes the two artefacts actually use. An
    // `expectedVerdict` appearing anywhere else would mean a builder had started adjudicating
    // for itself, which is the exact failure this test exists to catch.
    const declared = new Set([...Object.keys(golden.classCounts), ...Object.keys(redTeam.classCounts)])
    const source2 = readFileSync(join(ROOT, "scripts", "eval", "plan.ts"), "utf8")
    const occurrences = source2.split('expectedVerdict: "').length - 1
    expect(occurrences).toBe(declared.size)
  })
})

/**
 * The paraphrase divergence is recorded rather than resolved.
 *
 * The user story asks for `unverifiable` on a faithful paraphrase; the implemented six-step
 * procedure delivers `rejected`, and the two cannot both hold. Publishing the affected cases
 * without the caveat would be the worst of the three available options, so the caveat is asserted
 * to be attached to the artefact and to every case it affects.
 */
describe("the known divergence is published, not hidden", () => {
  test("both artefacts carry the divergence record", () => {
    for (const set of [golden, redTeam]) {
      const record = set.knownDivergence as { readonly id?: string; readonly storyRequires?: string; readonly procedureDelivers?: string; readonly whoDecides?: string }
      expect(record.id).toBe("paraphrase-rejected-not-unverifiable")
      expect(record.storyRequires).toBe("unverifiable")
      expect(record.procedureDelivers).toBe("rejected")
      expect(record.whoDecides?.length ?? 0).toBeGreaterThan(0)
    }
  })

  test("every elide_middle case is stamped with the divergence", () => {
    const elided = golden.cases.filter((entry) => entry.classId === "elide_middle")
    expect(elided.length).toBeGreaterThan(0)
    for (const entry of elided) {
      const record = entry.divergence as { readonly storyRequires?: string; readonly procedureDelivers?: string }
      expect(record.storyRequires).toBe("unverifiable")
      expect(record.procedureDelivers).toBe("rejected")
    }
  })

  test("cases outside the divergence are not stamped", () => {
    const verbatim = golden.cases.filter((entry) => entry.classId === "verbatim")
    for (const entry of verbatim) expect(entry.divergence).toBeNull()
  })
})
