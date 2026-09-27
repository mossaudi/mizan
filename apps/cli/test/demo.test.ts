import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  decodeOrFail,
  decodeSync,
  DemoQuestionSet,
  EvalSet,
  isOk,
  normalizeForMatch,
  type Claim,
  type CorpusRecord,
  type EvalAnchor,
  type EvalCase,
  type Verdict,
} from "@mizan/core"
import { buildSnapshot, openSnapshot, resolveCitations } from "@mizan/corpus"
import { questionKey } from "@mizan/agent"
import { longestRunFor, resolutionKey, verifyAnswer } from "@mizan/verify"
import { renderReport, type SourceExcerpt } from "../src/render.ts"
import { readDemoQuestionSet } from "../src/demo-questions.ts"

/**
 * Best-effort removal of a temp directory that holds a SQLite file.
 *
 * Windows releases the file handle asynchronously after `close()` and does not honour every
 * retry, so an unguarded `rmSync` in a `finally` block turns a passing test red on a platform
 * quirk — which is how the first run of this file reported three failures that had nothing to do
 * with the claim under test. This mirrors the guard `cli.test.ts` already uses. A leftover
 * directory under the OS temp dir is a far smaller problem than a flaky test, and the OS reclaims
 * it.
 */
function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  } catch {
    // Best-effort temp cleanup; the OS reclaims the directory.
  }
}

/**
 * The money shot, as a test.
 *
 * ## What this file exists to prevent
 *
 * The whole claim of this project is that a fabricated citation gets caught, and that claim was
 * untestable end to end: the only committed run verified a real Qur'an verse, so a judge could
 * watch the product agree with itself and learn nothing about the case that matters. Story 10's
 * acceptance criterion — "the fabricated source is displayed side by side with the failure" — had
 * no code path that could satisfy it, because the renderer printed a badge and nothing else.
 *
 * So this file commits a fabrication, replays it, and asserts three separate things that a
 * system could each pass while failing the others:
 *
 *  1. the fabrication is REJECTED, at the real record it cites;
 *  2. it is rejected DESPITE sharing more than half its characters with that record — which is
 *     what makes it a test of the design rather than a test of string equality;
 *  3. the report shows the judge the quote, the record, and the URL, so the rejection can be
 *     checked from outside this program.
 *
 * ## The corpus-free section is the one that matters in CI
 *
 * `data/corpus.db` is 81 MB and gitignored, so a test that needs it is skipped on a clean
 * checkout — including CI. The section below therefore rebuilds a hermetic snapshot from the
 * red-team set's OWN anchor row, exactly as `test/eval.test.ts` does for its own sets, and proves
 * the money shot with no large file anywhere. The 81 MB section then re-proves it against the
 * real snapshot and the real CLI binary.
 *
 * ## Nothing here is mocked
 *
 * The same resolver, the same verifier, the same diagnostic, the same renderer. The only fixture
 * is the TEXT: the fabricated quote and the corpus row it was derived from, both read out of a
 * committed artefact rather than typed.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const DEMO_PATH = join(ROOT, "data", "demo-questions.json")
const TRANSCRIPT_PATH = join(ROOT, "data", "transcript.json")
const REDTEAM_PATH = join(ROOT, "data", "eval", "redteam-fabricated.json")
const CORPUS = join(ROOT, "data", "corpus.db")

const parseJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown

const readEvalSet = (path: string): EvalSet => {
  const decoded = decodeOrFail(decodeSync(EvalSet), parseJson(path), path)
  if (!isOk(decoded)) throw new Error(`cannot decode ${path}: ${decoded.error.detail}`)
  return decoded.value
}

/** The async loader under test, exercised through the real filesystem. */
const loadDemoSet = async (): Promise<DemoQuestionSet> => {
  const result = await readDemoQuestionSet(ROOT)
  if (!isOk(result)) throw new Error(result.error)
  return result.value
}

const set = readEvalSet(REDTEAM_PATH)

/** The one published fabrication the demo commits, located by the id both artefacts declare. */
const fabricationCase = (demo: DemoQuestionSet): EvalCase => {
  const declared = demo.questions.flatMap((question) => question.expectations).filter((entry) => entry.sourceCaseId !== null)
  expect(declared).toHaveLength(1)
  const id = declared[0]?.sourceCaseId
  const found = set.cases.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`the demo names red-team case ${id ?? "<null>"}, which does not exist`)
  return found
}

const anchorFor = (anchorId: string): EvalAnchor => {
  const found = set.anchors.find((anchor) => anchor.id === anchorId)
  if (found === undefined) throw new Error(`the red-team set ships no anchor ${anchorId}`)
  return found
}

/**
 * Rebuild an anchor into a full `CorpusRecord`, deriving `textMatch` with the real normalizer.
 *
 * Deliberately repeated rather than shared with `test/eval.test.ts`: each test rebuilds the
 * snapshot from the artefact it is testing, so a defect in one fixture builder cannot quietly
 * make the other test agree with itself. `textHash` on the anchor is what catches a hand-edited
 * `textDisplay`.
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

/** A snapshot containing exactly the rows named, in a temp directory this test owns. */
const snapshotOf = (name: string, records: readonly CorpusRecord[]) => {
  const dir = mkdtempSync(join(tmpdir(), `mizan-demo-${name}-`))
  const built = buildSnapshot(join(dir, "corpus.db"), records)
  return { db: openSnapshot(built.path), dir, snapshotHash: built.snapshotHash }
}

const claimOf = (id: string, text: string, quote: string, citation: EvalCase["citation"]): Claim => ({
  id,
  text,
  quote,
  citations: [citation],
})

/* ------------------------------------------------------------------ the committed set */

describe("the committed demo question set is self-consistent", () => {
  test("it decodes through the schema core declares for it", async () => {
    const demo = await loadDemoSet()
    expect(demo.set).toBe("demo-questions")
    expect(demo.questions.length).toBeGreaterThan(0)
  })

  /**
   * The anti-sugar-coating check. A demo set that only contains questions the product gets right
   * is a brochure. Requiring BOTH a `verified` and a `rejected` entry means the set cannot be
   * quietly edited down to its flattering half without failing.
   */
  test("it commits at least one question that verifies and at least one that is rejected", async () => {
    const demo = await loadDemoSet()
    const verdicts = new Set(demo.questions.flatMap((question) => question.expectations.map((entry) => entry.expectedVerdict)))
    expect(verdicts.has("verified")).toBe(true)
    expect(verdicts.has("rejected")).toBe(true)
  })

  test("every question says what it demonstrates, retrieves with, and expects an outcome", async () => {
    const demo = await loadDemoSet()
    for (const question of demo.questions) {
      expect(question.demonstrates.length).toBeGreaterThan(0)
      expect(question.query.trim().length).toBeGreaterThan(0)
      expect(question.expectations.length).toBeGreaterThan(0)
      for (const entry of question.expectations) {
        expect(entry.recordId).toMatch(/^[a-z]+:\S+$/)
        expect(entry.mutation.length).toBeGreaterThan(0)
      }
    }
  })

  test("it states that its questions are synthetic, because that is what makes committing them safe", async () => {
    const demo = await loadDemoSet()
    expect(demo.syntheticNotice.toLowerCase()).toContain("synthetic")
    expect(demo.syntheticNotice).toContain("data/eval/redteam-fabricated.json")
    expect(demo.determinism).toContain("replay")
  })

  /**
   * The fabrication is BORROWED, and this is the check that keeps it borrowed.
   *
   * A demo generator that invented its own fake hadith would be asserting an unverifiable claim
   * about itself. Pinning the quote and the citation to the published red-team case means the
   * rejection on screen and the rejection in the red-team set are provably the same judgement.
   */
  test("the committed fabrication is the published red-team case, quote and citation intact", async () => {
    const demo = await loadDemoSet()
    const published = fabricationCase(demo)
    expect(published.mutation).toBe("one_word_changed")
    expect(published.expectedVerdict).toBe("rejected")
  })

  test("no anchor text was hand-edited behind the demo's back", () => {
    for (const anchor of set.anchors) {
      expect(createHash("sha256").update(anchor.textDisplay, "utf8").digest("hex")).toBe(anchor.textHash)
    }
  })
})

/* ------------------------------------------------------------------ the transcript */

describe("the transcript the demo replays", () => {
  const entries = (): { stage: string; questionHash: string; answer: { transcript?: string; claims: readonly Claim[] } }[] => {
    const parsed = parseJson(TRANSCRIPT_PATH) as { entries?: unknown }
    if (!Array.isArray(parsed.entries)) throw new Error("data/transcript.json has no entries array")
    return parsed.entries as { stage: string; questionHash: string; answer: { transcript?: string; claims: readonly Claim[] } }[]
  }

  /** The spine makes exactly these two calls; a transcript missing either degrades the run. */
  test("every committed question has both a decompose and an answer stage", async () => {
    const demo = await loadDemoSet()
    for (const question of demo.questions) {
      const hash = questionKey(question.question)
      const stages = entries().filter((entry) => entry.questionHash === hash).map((entry) => entry.stage)
      expect(stages).toContain("decompose")
      expect(stages).toContain("answer")
    }
  })

  test("every entry is labelled precomputed, so a replay can never read as a live generation", () => {
    for (const entry of entries()) expect(entry.answer.transcript).toBe("precomputed")
  })

  test("it carries no question text, only hashes (AGENTS.md section 13)", async () => {
    const demo = await loadDemoSet()
    const raw = readFileSync(TRANSCRIPT_PATH, "utf8")
    for (const question of demo.questions) {
      expect(raw).not.toContain(question.question)
    }
    for (const entry of entries()) expect(entry.questionHash).toMatch(/^[0-9a-f]{64}$/)
  })

  /**
   * The drift alarm.
   *
   * The transcript is a copy of text taken out of a snapshot that is itself gitignored. Re-ingest,
   * and the numbers can move under it. This is the one assertion in the file that is DELIBERATELY
   * allowed to fail when the corpus moves: it is the alarm, not a nuisance.
   */
  test.skipIf(!existsSync(CORPUS))("every claim it replays cites a record the shipped snapshot still has", () => {
    const db = openSnapshot(CORPUS)
    try {
      for (const entry of entries()) {
        // Only the answer stage makes citation claims. A decompose entry's claim is the
        // retrieval query the planner hands the retriever, which by construction cites nothing —
        // it is the question being looked up, not an assertion about the corpus. Asserting that
        // a query resolves to a record would test the retriever, not the transcript.
        if (entry.stage !== "answer") continue
        for (const claim of entry.answer.claims) {
          const { resolved, problems } = resolveCitations(db, claim.citations)
          expect({ claim: claim.id, problems }).toEqual({ claim: claim.id, problems: [] })
          expect(resolved.some((resolution) => resolution.records.length > 0)).toBe(true)
        }
      }
    } finally {
      db.close()
    }
  })
})

/* ------------------------------------------------------------------ the money shot, hermetic */

/**
 * One word apart, and still rejected.
 *
 * This is the section that runs on a clean checkout, and it is the one that carries the argument.
 * The claim under test is not "the verifier rejects strings that differ" — trivial. It is that the
 * fabrication shares MORE THAN HALF its folded characters with the record it cites, so any
 * similarity-based design would have passed it, and strict containment does not.
 */
describe("a fabrication one word away from a real hadith is rejected anyway", () => {
  const build = () => {
    const demo = readFileSync(DEMO_PATH, "utf8")
    const parsed = decodeOrFail(decodeSync(DemoQuestionSet), JSON.parse(demo) as unknown, DEMO_PATH)
    if (!isOk(parsed)) throw new Error(parsed.error.detail)
    const published = fabricationCase(parsed.value)
    const anchor = anchorFor(published.anchorId)
    const record = toRecord(anchor)
    const snapshot = snapshotOf(published.id, [record])
    const verbatim = claimOf(`${published.id}-verbatim`, "A faithful quotation.", record.textDisplay, published.citation)
    const fabricated = claimOf(published.id, "A fluent misquotation.", published.quote, published.citation)
    const { resolved } = resolveCitations(snapshot.db, [published.citation])
    return { ...snapshot, record, published, verbatim, fabricated, resolved }
  }

  test("the genuine text verifies and the fabrication is rejected, at the same identifier", () => {
    const run = build()
    try {
      const honest = verifyAnswer({ claims: [run.verbatim], evidence: run.resolved, snapshotHash: run.snapshotHash }).claims[0]
      expect(honest?.verdict).toBe("verified")
      expect(honest?.reason).toBe("exact_containment")
      expect(honest?.evidence?.recordId).toBe(run.record.id)

      const lie = verifyAnswer({ claims: [run.fabricated], evidence: run.resolved, snapshotHash: run.snapshotHash }).claims[0]
      expect(lie?.verdict).toBe("rejected")
      expect(lie?.reason).toBe("quote_absent_at_cited_id")
      // A `rejected` carries no evidence, because there is no quote to point at.
      expect(lie?.evidence).toBeNull()
      expect(lie?.matchStrength).toEqual({ kind: "none" })
    } finally {
      run.db.close()
      cleanup(run.dir)
    }
  })

  test("the fabrication shares most of its characters with the record — and is still rejected", () => {
    const run = build()
    try {
      const shared = longestRunFor(run.fabricated.quote ?? "", run.record.textMatch)
      // The diagnostic, not the gate: this is the number a similarity design would have used.
      expect(shared.runChars / shared.quoteChars).toBeGreaterThan(0.5)
      expect(shared.contained).toBe(false)

      const lie = verifyAnswer({ claims: [run.fabricated], evidence: run.resolved, snapshotHash: run.snapshotHash }).claims[0]
      expect(lie?.verdict).toBe("rejected")
    } finally {
      run.db.close()
      cleanup(run.dir)
    }
  })
})

/* ------------------------------------------------------------------ the rendered evidence */

/**
 * The badge is not enough.
 *
 * Story 10 requires the fabricated source to be shown beside the failure. A `REJECTED` line on its
 * own is equally consistent with "the model invented this hadith" and "the model dropped a
 * clause", so these assertions pin the evidence a judge needs to tell those apart.
 */
describe("the report shows the quote beside the record it was checked against", () => {
  const run = () => {
    const demo = readFileSync(DEMO_PATH, "utf8")
    const parsed = decodeOrFail(decodeSync(DemoQuestionSet), JSON.parse(demo) as unknown, DEMO_PATH)
    if (!isOk(parsed)) throw new Error(parsed.error.detail)
    const published = fabricationCase(parsed.value)
    const record = toRecord(anchorFor(published.anchorId))
    const snapshot = snapshotOf("render", [record])
    const claim = claimOf(published.id, "A fluent misquotation.", published.quote, published.citation)
    const { resolved } = resolveCitations(snapshot.db, [published.citation])
    const report = verifyAnswer({ claims: [claim], evidence: resolved, snapshotHash: snapshot.snapshotHash })
    const sources = new Map<string, SourceExcerpt>()
    const excerpt = { recordId: record.id, label: `${record.collection} ${record.number ?? ""}`.trim(), sourceUrl: record.sourceUrl, textDisplay: record.textDisplay, textMatch: record.textMatch }
    // Two keys, because the renderer looks the source up two different ways. A `verified` claim
    // carries an `EvidenceRef` naming the record it matched, so the lookup is by record id. A
    // `rejected` claim carries no evidence at all — there is no quote to point at — so the
    // renderer falls back to the claim's own citation and looks up by resolution key. A
    // `rejected` claim is precisely the one this describe block exists to render, so keying the
    // table by record id alone silently printed an empty `source:` line.
    sources.set(resolutionKey(published.citation), excerpt)
    sources.set(record.id, excerpt)
    return { ...snapshot, record, claim, report, output: renderReport({ prose: "prose", report, claims: [claim], sources, transcript: "precomputed", model: "transcript-v1", sourceCount: 1, snapshotHash: snapshot.snapshotHash }) }
  }

  test("it prints the fabricated quote, the rejected badge, the record and its URL", () => {
    const built = run()
    try {
      expect(built.output).toContain(`[REJECTED] ${built.claim.id} — quote_absent_at_cited_id (match: none)`)
      expect(built.output).toContain(built.claim.quote ?? "")
      expect(built.output).toContain(built.record.sourceUrl)
      expect(built.output).toContain(built.record.id.split(":")[0] ?? "")
      // The genuine text, verbatim — this is the whole point of the side-by-side.
      expect(built.output).toContain(built.record.textDisplay)
    } finally {
      built.db.close()
      cleanup(built.dir)
    }
  })

  test("it shows the display-only run, and no percentage that could read as a match score", () => {
    const built = run()
    try {
      const runLine = built.output.split("\n").find((line) => line.includes("run:"))
      expect(runLine).toMatch(/run:\s+\d+ of \d+ folded characters shared/)
      expect(runLine).toContain("display only, never a verdict")
      expect(runLine).not.toContain("%")
    } finally {
      built.db.close()
      cleanup(built.dir)
    }
  })

  /**
   * The product rule is one line: render `textDisplay`, compare `textMatch`. This is the assertion
   * that keeps the folded matching key off the screen, where it would be both an offence and a
   * licensing problem — the folded form of `ٱلْعَٰلَمِينَ` is `العلمين`, which is not what the
   * dataset published.
   */
  test("it never displays the folded matching key", () => {
    const built = run()
    try {
      expect(built.record.textMatch).not.toBe(built.record.textDisplay)
      expect(built.output).toContain(built.record.textDisplay)
      expect(built.output).not.toContain(built.record.textMatch)
    } finally {
      built.db.close()
      cleanup(built.dir)
    }
  })

  test("a report with no matching claim still renders instead of throwing", () => {
    const built = run()
    try {
      const orphan = renderReport({
        prose: "prose",
        report: built.report,
        claims: [],
        sources: new Map(),
        transcript: "precomputed",
        model: "transcript-v1",
        sourceCount: 0,
        snapshotHash: built.snapshotHash,
      })
      expect(orphan).toContain("[REJECTED]")
      expect(orphan).toContain("no quotation to check")
    } finally {
      built.db.close()
      cleanup(built.dir)
    }
  })

  test("a citation that resolved to nothing says so instead of showing a source", () => {
    const built = run()
    try {
      const claim = claimOf("orphan", "text", "يَتَقَارَبُ الزَّمَانُ", { collection: "nasai", number: "999999", grade: null, raw: "x" })
      const report = verifyAnswer({ claims: [claim], evidence: [], snapshotHash: built.snapshotHash })
      const output = renderReport({ prose: "prose", report, claims: [claim], sources: new Map(), transcript: "precomputed", model: "m", sourceCount: 0, snapshotHash: built.snapshotHash })
      expect(output).toContain("[UNVERIFIABLE]")
      expect(output).toContain("identifier_unresolved")
      expect(output).toContain("no record in this snapshot matches nasai 999999")
    } finally {
      built.db.close()
      cleanup(built.dir)
    }
  })
})

/* ------------------------------------------------------------------ the real binary, real snapshot */

/**
 * The last mile: the shipped snapshot, the committed transcript, and the actual process.
 *
 * Everything above is in-process. This spawns `apps/cli/src/main.ts` the way a judge does, because
 * the only way to observe the demo as a caller sees it is from outside — and because the exit code
 * is part of the product. Skipped, loudly, when the gitignored snapshot is absent.
 */
describe.skipIf(!existsSync(CORPUS))("every committed demo question replays to its declared verdict", () => {
  const run = async (question: string) => {
    const proc = Bun.spawn(["bun", "run", join(ROOT, "apps", "cli", "src", "main.ts"), question], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MIZAN_API_KEY: "" },
    })
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    return { code: await proc.exited, output: `${stdout}${stderr}` }
  }

  const matchKind = (verdict: Verdict): "exact" | "none" => (verdict === "verified" ? "exact" : "none")

  test("both badges appear, each with the reason and match kind the set declares", async () => {
    const demo = await loadDemoSet()
    expect(demo.questions).toHaveLength(2)
    for (const question of demo.questions) {
      const { code, output } = await run(question.question)
      expect({ question: question.id, code }).toEqual({ question: question.id, code: 0 })
      expect(output).toContain("PRECOMPUTED")
      for (const entry of question.expectations) {
        expect(output).toContain(`[${entry.expectedVerdict.toUpperCase()}] ${entry.claimId} — ${entry.expectedReason} (match: ${matchKind(entry.expectedVerdict)})`)
        // The evidence a judge needs, on screen, for every claim.
        expect(output).toContain("quoted:")
        expect(output).toContain("source:")
      }
    }
  }, 120_000)

  test("the fabricated run prints a REJECTED badge and no VERIFIED one at all", async () => {
    const demo = await loadDemoSet()
    const fabrication = demo.questions.find((question) => question.id === "fabricated-hadith")
    if (fabrication === undefined) throw new Error("the demo set no longer has a fabricated-hadith question")
    const { code, output } = await run(fabrication.question)
    expect(code).toBe(0)
    expect(output).toContain("[REJECTED]")
    expect(output).not.toContain("[VERIFIED]")
  }, 120_000)

  test("the fabricated run shows the genuine source text beside the failure", async () => {
    const demo = await loadDemoSet()
    const fabrication = demo.questions.find((question) => question.id === "fabricated-hadith")
    if (fabrication === undefined) throw new Error("the demo set no longer has a fabricated-hadith question")
    const published = fabricationCase(demo)
    const { output } = await run(fabrication.question)
    expect(output).toContain(published.quote)
    expect(output).toContain(anchorFor(published.anchorId).textDisplay)
    // The label the renderer builds from the citation's collection and number, not the citation's
    // own `raw` string — the renderer never sees `raw`, and asserting on it would pin a spelling
    // this repository does not own.
    expect(output).toContain(`${published.citation.collection} ${published.citation.number ?? ""}`.trim())
  }, 120_000)

  test("retrieval actually found sources — the rejection is not a retrieval miss in disguise", async () => {
    const demo = await loadDemoSet()
    const fabrication = demo.questions.find((question) => question.id === "fabricated-hadith")
    if (fabrication === undefined) throw new Error("the demo set no longer has a fabricated-hadith question")
    const { output } = await run(fabrication.question)
    expect(output).toContain("from the local snapshot")
    expect(output).not.toContain("no_sources_found")
  }, 120_000)

  test("a question the transcript does not cover still degrades honestly", async () => {
    const { code, output } = await run("What is the ruling on cryptocurrency?")
    expect(code).not.toBe(0)
    expect(output).toContain("model unavailable")
    expect(output).not.toContain("VERIFIED")
  }, 120_000)
})
