import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import {
  DEMO_ANCHOR_SET_VERSION,
  DEMO_QUESTION_SET_VERSION,
  decodeOrFail,
  decodeSync,
  EvalSet,
  isOk,
  normalizeForMatch,
  toRecordMeta,
  type Answer,
  type Claim,
  type Citation,
  type CorpusRecord,
  type DemoAnchorSet,
  type DemoQuestion,
  type DemoQuestionSet,
  type EvalCase,
  type Verdict,
  type VerdictReason,
} from "@mizan/core"
import { resolveCitations } from "@mizan/corpus"
import { questionKey } from "@mizan/agent"
import { verifyAnswer } from "@mizan/verify"

/**
 * Generate `data/transcript.json` and `data/demo-questions.json`.
 *
 * ## Why two artefacts come out of one generator
 *
 * The transcript is what the CLI replays; the question set is what a judge reads to know which
 * question to run and what it is supposed to prove. Generating them separately would let the
 * list and the replay drift, and a demo whose published expectations no longer match its own
 * output is worse than no demo. One generator, two files, one source of truth.
 *
 * ## Nothing here is hand-typed Arabic
 *
 * Every Arabic string this generator writes is either sliced out of the committed snapshot or
 * copied from `data/eval/redteam-fabricated.json`. A hand-typed string is a byte-exact comparison
 * waiting to fail on a diacritic, and a generator that cannot reproduce its own output is not a
 * generator.
 *
 * ## The expectations are declared, then enforced — not observed
 *
 * `DECLARATIONS` below is a literal table, written independently of the run. The generator then
 * resolves and verifies against the real snapshot and THROWS if reality disagrees. The direction
 * is the whole point: a generator that recorded whatever the verifier said would publish a demo
 * set that passes forever while proving nothing — the trap `apps/cli/test/eval.test.ts` guards the
 * eval generators against, and the reason `expectedVerdict` is a literal here.
 *
 * This is the one artefact generator allowed to import the verifier, and for a specific reason:
 * the output is a REPLAY, and a replay that cannot be checked against the real corpus is exactly
 * the fixture-driven "verified" that INTEGRITY.md section 7 refuses. The committed expectations
 * are re-asserted independently by `apps/cli/test/demo.test.ts`, from the committed file, against
 * the committed snapshot — so nothing here is its own proof.
 *
 * Throwing is the correct failure mode for all of it: this is a script entry point, where a
 * non-zero exit is the right response to an unusable state (see `unwrapOrThrow` in `@mizan/core`).
 */

const CORPUS = "data/corpus.db"
const REDTEAM = "data/eval/redteam-fabricated.json"
const TRANSCRIPT_OUT = "data/transcript.json"
const DEMO_OUT = "data/demo-questions.json"
const DEMO_ANCHORS_OUT = "data/eval/demo-anchors.json"

const PROVIDER = "precomputed-transcript"
const MODEL = "transcript-v1"
const TRANSCRIPT_KIND = "precomputed"

/**
 * How many words of a record head to retrieve with, and how many words of its tail to quote.
 *
 * Both are slices of the committed row rather than typed strings. The head makes the real record
 * come back; the tail of the Qur'an row is a self-contained clause, so containment has to find it
 * inside a much longer verse — a fair test, not a trivially short one.
 */
const RETRIEVAL_QUERY_WORDS = 8
const VERIFIED_QUOTE_WORDS = 4

/**
 * The published fabrication this demo replays.
 *
 * `redteam-005` changes exactly one word of Sunan Abi Dawud 4255 — `الْعِلْمُ` (knowledge) to
 * `الْفِقْهُ` (jurisprudence) — in a well-known hadith. It is the most instructive case in the
 * repository to put on screen: the fabrication is fluent, the citation is real and well-graded,
 * and the text is wrong by a single word. A similarity-based verifier calls that a near-perfect
 * match. Only strict containment catches it, and the run shows that happening.
 */
const FABRICATION_CASE_ID = "redteam-005"

type Declaration = {
  readonly id: string
  readonly question: string
  readonly demonstrates: string
  readonly retrievalNote: string
  readonly claimId: string
  readonly claimText: string
  readonly expectedVerdict: Verdict
  readonly expectedReason: VerdictReason
  readonly recordId: string
  readonly mutation: string
  /** The `redteam-*` case the quote is taken from, or null when the quote is the record's own text. */
  readonly sourceCaseId: string | null
  readonly citation: Citation
  readonly prose: string
}

const VERIFIED: Declaration = {
  id: "ikhlas",
  question: "What does the Qur'an say about the oneness of God?",
  demonstrates: "a faithful quotation of a cited verse, reaching a computed VERIFIED with the source shown beside it",
  retrievalNote: "Retrieve the opening of surah al-Ikhlas.",
  claimId: "ikhlas-1",
  claimText: "The opening of sura al-Ikhlas commands the Prophet to declare that God is one.",
  expectedVerdict: "verified",
  expectedReason: "exact_containment",
  recordId: "quran:6222",
  mutation: "verbatim",
  sourceCaseId: null,
  citation: { collection: "quran", number: "6222", grade: null, raw: "Qur'an 112:1" },
  prose:
    "The Qur'an states the oneness of God directly and without qualification. Surah al-Ikhlas opens by " +
    "commanding the Prophet to say that He is one, and the surah then denies any likeness to Him.",
}

const FABRICATION: Declaration = {
  id: "fabricated-hadith",
  question: "What does the hadith say about the end of the world and knowledge diminishing?",
  demonstrates: "a fabricated hadith cited to a real, well-graded record, rejected with the fabricated quote and the genuine source shown side by side",
  retrievalNote: "Retrieve the report on the signs of the Hour.",
  claimId: "knowledge-fading-1",
  claimText: "The Prophet said that time draws near, knowledge diminishes, tribulations appear, miserliness is encountered, and talk increases.",
  expectedVerdict: "rejected",
  expectedReason: "quote_absent_at_cited_id",
  recordId: "abudawud:4255",
  mutation: "one_word_changed",
  sourceCaseId: FABRICATION_CASE_ID,
  // Replaced below by the red-team case's own citation, so the demo and the red-team set can
  // never disagree about what was cited. Kept non-empty so the type is honest in the meantime.
  citation: { collection: "abudawud", number: "4255", grade: null, raw: "Sunan Abi Dawud 4255" },
  prose:
    "A well-known report on the signs of the Hour holds that the world draws near while knowledge " +
    "diminishes, tribulations surface, and people grow stingy and careless in speech. It is cited here " +
    "to Sunan Abi Dawud 4255.",
}

const must = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`make:transcript — ${message}`)
}

/** SHA-256, hex. The hash convention is `toRecordMeta`'s, so this only supplies the function. */
const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex")

/** The published fabrication, read out of the red-team set rather than minted here. */
const readFabrication = async (): Promise<EvalCase> => {
  const decoded = decodeOrFail(decodeSync(EvalSet), JSON.parse(await readFile(REDTEAM, "utf8")) as unknown, REDTEAM)
  if (!isOk(decoded)) throw new Error(`make:transcript — ${REDTEAM} does not match EvalSet`)
  const found = decoded.value.cases.find((entry) => entry.id === FABRICATION_CASE_ID)
  if (found === undefined) {
    throw new Error(`make:transcript — ${REDTEAM} has no case ${FABRICATION_CASE_ID}. Point at another published fabrication; do not invent one here.`)
  }
  must(found.mutation === "one_word_changed", `${FABRICATION_CASE_ID} is a ${found.mutation} case, not the one-word change the demo describes`)
  must(found.expectedVerdict === "rejected", `${FABRICATION_CASE_ID} declares ${found.expectedVerdict}, not rejected`)
  must(found.anchorId === FABRICATION.recordId, `${FABRICATION_CASE_ID} is anchored at ${found.anchorId}, but the demo declares ${FABRICATION.recordId}`)
  return found
}

const displayText = (db: Database, id: string): string => {
  const row = db.query<{ readonly textDisplay: string }, [string]>("SELECT textDisplay FROM records WHERE id = ?").get(id)
  if (row === null || row === undefined) throw new Error(`make:transcript — ${id} is not in ${CORPUS}. Run \`bun run ingest\` first.`)
  return row.textDisplay
}

/**
 * A snapshot row exactly as SQLite returns it, which is *not* a `CorpusRecord`.
 *
 * Two columns disagree with the record type, and both disagreements used to be hidden by a type
 * annotation on the query: `gradeApplicable` is a SQLite `0`/`1` integer rather than a boolean,
 * and `translation` is `NULL` rather than an absent key. Returning the row labelled
 * `CorpusRecord` put `"gradeApplicable": 0` and `"translation": null` into the committed
 * anchors file, and neither value passes the `DemoAnchor` schema — a file that was published
 * invalid and stayed invalid precisely because no reader decoded it. A type annotation on a
 * database row is an assertion; this one was false, and it took a decoder to find out.
 */
type SnapshotRow = Omit<CorpusRecord, "gradeApplicable" | "translation"> & {
  readonly gradeApplicable: number
  readonly translation: string | null
}

/** The same two conversions `resolve.ts` performs, so a row means one thing in this repository. */
const toRecord = (row: SnapshotRow): CorpusRecord => ({
  ...row,
  gradeApplicable: row.gradeApplicable === 1,
  translation: row.translation ?? undefined,
})

/**
 * The whole record row, for the demo anchors file.
 *
 * A named column list rather than `SELECT *`: this artefact is committed third-party text, and a
 * column added to the snapshot table later would otherwise be copied into a licence-governed file
 * without anyone deciding it should be.
 */
const recordRow = (db: Database, id: string): CorpusRecord => {
  const row = db
    .query<SnapshotRow, [string]>(
      "SELECT id, collection, number, grade, gradeApplicable, gradeSource, gradeBasis, attribution, license, licenseUrl, sourceUrl, textDisplay, textMatch, translation FROM records WHERE id = ?",
    )
    .get(id)
  if (row === null || row === undefined) throw new Error(`make:transcript — ${id} is not in ${CORPUS}. Run \`bun run ingest\` first.`)
  return toRecord(row)
}

/**
 * The demo's own corpus slice — the records the two demo questions cite.
 *
 * MIZ-101 requires the demo to attest its corpus before it prints a verdict, and attestation is
 * only meaningful against a corpus a reader can rebuild. So the demo does not open the 81 MB
 * snapshot: it builds a snapshot from these rows at run time and attests that instead. `bun run
 * demo` therefore needs no `bun run ingest` first, which is the difference between a demo a judge
 * can actually run and one they cannot.
 *
 * The rows are sliced from the committed snapshot, never hand-typed. Each carries the hash of its
 * own display text, so `apps/cli/src/demo.ts` can refuse to attest a file whose stored text has
 * been edited.
 */
const demoAnchors = (db: Database, declarations: readonly Declaration[]): DemoAnchorSet => {
  const anchors = declarations.map((entry) => {
    const record = recordRow(db, entry.recordId)
    /*
     * `textMatch` is committed AND re-checkable: the demo re-derives it with the real fold and
     * fails closed on a disagreement, so this copy is a tamper tripwire rather than a shortcut.
     * Asserting it matches here as well means a mismatch is caught at GENERATION time with a
     * named file, not only at demo time.
     */
    must(
      record.textMatch === normalizeForMatch(record.textDisplay),
      `${entry.recordId}: the snapshot's textMatch is not the fold of its textDisplay. Run \`bun run ingest\` before \`bun run make:transcript\`.`,
    )
    return {
      anchorId: entry.recordId,
      recordId: record.id,
      collection: record.collection,
      number: record.number,
      textDisplay: record.textDisplay,
      textMatch: record.textMatch,
      ...(record.translation === undefined ? {} : { translation: record.translation }),
      sourceUrl: record.sourceUrl,
      license: record.license,
      licenseUrl: record.licenseUrl,
      attribution: record.attribution,
      grade: record.grade,
      gradeApplicable: record.gradeApplicable,
      gradeSource: record.gradeSource,
      gradeBasis: record.gradeBasis,
      textHash: toRecordMeta(record, sha256Hex).textHash,
    }
  })
  const seen = new Set(anchors.map((anchor) => anchor.anchorId))
  must(seen.size === anchors.length, `demo anchors: two questions cite the same record (${[...seen].join(", ")})`)
  return {
    schemaVersion: DEMO_ANCHOR_SET_VERSION,
    set: "demo-anchors",
    purpose:
      "The records `bun run demo` rebuilds its corpus from, so the demo can attest its own snapshot in seconds with no ingest and no network. Sliced from the committed snapshot by apps/cli/scripts/make-transcript.ts.",
    generatedBy: "apps/cli/scripts/make-transcript.ts",
    regenerateWith: "bun run make:transcript",
    determinism:
      "Same snapshot in, byte-identical file out. The anchor order is the question order and no clock or randomness is consulted. textHash is the SHA-256 of textDisplay, per the shared toRecordMeta convention, so an edit to the diacritics of a committed row is detectable; textMatch is separately re-derived with the current fold table by apps/cli/src/demo.ts, which refuses to attest a file where the two disagree.",
    licenceNotice:
      "This file contains third-party source text — Qur'an and hadith — reproduced verbatim under each collection's own licence with its attribution and grade exactly as the source dataset asserts them. mizan states no grade of its own and asserts no ruling. The two questions in data/demo-questions.json are synthetic and are not hadith.",
    anchorIds: [...seen],
    anchors,
  }
}

/** Prove one declared outcome against the real corpus, or refuse to write it. */
const proveOrThrow = (db: Database, claim: Claim, citation: Citation, declared: Declaration): void => {
  const { resolved, problems } = resolveCitations(db, [citation])
  must(problems.length === 0, `${declared.claimId} did not resolve: ${problems[0]?.detail ?? "unknown"}`)
  const report = verifyAnswer({ claims: [claim], evidence: resolved, snapshotHash: "pending" })
  const verdict = report.claims[0]
  if (verdict === undefined) throw new Error(`make:transcript — ${declared.claimId}: the verifier returned no verdict`)
  must(
    verdict.verdict === declared.expectedVerdict,
    `${declared.claimId}: declared ${declared.expectedVerdict}, the real verifier said ${verdict.verdict} (${verdict.reason}). Refusing to write it.`,
  )
  must(verdict.reason === declared.expectedReason, `${declared.claimId}: declared reason ${declared.expectedReason}, the real verifier said ${verdict.reason}`)
  // G-6's dynamic invariant, run over the artefact this generator is about to publish.
  must(verdict.verdict !== "verified" || verdict.evidence !== null, `${declared.claimId}: a verified with no evidence`)
  console.log(`  ${declared.claimId}: ${verdict.verdict} (${verdict.reason}) against ${verdict.evidence?.recordId ?? declared.recordId}`)
}

const main = async (): Promise<void> => {
  const db = new Database(CORPUS, { readonly: true })
  try {
    const fabrication = await readFabrication()
    const declared: readonly Declaration[] = [VERIFIED, { ...FABRICATION, citation: fabrication.citation }]

    const entries: { readonly stage: "decompose" | "answer"; readonly questionHash: string; readonly answer: Answer }[] = []
    const questions: DemoQuestion[] = []

    for (const entry of declared) {
      const words = displayText(db, entry.recordId).split(" ")
      const quote = entry.sourceCaseId === null ? words.slice(-VERIFIED_QUOTE_WORDS).join(" ") : fabrication.quote
      const query = words.slice(0, RETRIEVAL_QUERY_WORDS).join(" ")
      const claim: Claim = { id: entry.claimId, text: entry.claimText, quote, citations: [entry.citation] }

      console.log(`${entry.id}:`)
      proveOrThrow(db, claim, entry.citation, entry)

      const hash = questionKey(entry.question)
      const common = { provider: PROVIDER, model: MODEL, transcript: TRANSCRIPT_KIND }
      entries.push(
        { stage: "decompose", questionHash: hash, answer: { ...common, questionHash: hash, prose: entry.retrievalNote, claims: [{ id: "q1", text: query, quote: null, citations: [] }] } },
        { stage: "answer", questionHash: hash, answer: { ...common, questionHash: hash, prose: entry.prose, claims: [claim], confidence: 0.9 } },
      )
      questions.push({
        id: entry.id,
        question: entry.question,
        demonstrates: entry.demonstrates,
        query,
        // The one record this question's corpus is rebuilt from. MIZ-101's demo builds its own
        // snapshot, so a question must name the rows it needs or it cannot be attested.
        anchorIds: [entry.recordId],
        expectations: [
          {
            claimId: entry.claimId,
            expectedVerdict: entry.expectedVerdict,
            expectedReason: entry.expectedReason,
            recordId: entry.recordId,
            mutation: entry.mutation,
            sourceCaseId: entry.sourceCaseId,
          },
        ],
      })
    }

    /**
     * The header, and the one field here that is prose a judge reads as a promise.
     *
     * `syntheticNotice` says "the only question text this repository commits UNDER data/". The
     * scope is load-bearing and was narrowed on purpose: the questions also sit in this file's
     * `Declaration` table above, in `README.md`, and in `apps/cli/test/*.ts`, so the wider claim
     * — "the only question text this repository commits" — is refuted by one grep. A notice a
     * reader can disprove is worse than no notice, because it teaches them that the surrounding
     * assurances are decorative too. Do not widen the scope without widening the file set; if
     * every one of those locations ever stopped carrying the questions, the stronger sentence
     * becomes true and belongs here.
     */
    const set: DemoQuestionSet = {
      schemaVersion: DEMO_QUESTION_SET_VERSION,
      set: "demo-questions",
      purpose:
        "The committed default surface for a two-minute demonstration: one question that verifies and one whose citation is a fabrication, so both badges can be seen with no API key and no network.",
      generatedBy: "apps/cli/scripts/make-transcript.ts",
      regenerateWith: "bun run make:transcript",
      determinism: "A replay, not a generation. Every claim, quote and citation here is committed, so the run is identical on every machine and no model sits in its trust path.",
      syntheticNotice:
        "The questions are invented strings with no user behind them, and they are the only question text this repository commits under data/: data/transcript.json and every run trace carry a SHA-256 of the question and never the question (AGENTS.md section 13). The fabricated quote is published synthetic test data copied from data/eval/redteam-fabricated.json. It is not hadith and it asserts nothing about anyone's religion.",
      questions,
    }

    const anchors = demoAnchors(db, declared)

    await Bun.write(TRANSCRIPT_OUT, `${JSON.stringify({ entries }, null, 2)}\n`)
    await Bun.write(DEMO_OUT, `${JSON.stringify(set, null, 2)}\n`)
    await Bun.write(DEMO_ANCHORS_OUT, `${JSON.stringify(anchors, null, 2)}\n`)
    console.log(`\nwrote ${TRANSCRIPT_OUT} (${entries.length} entries) and ${DEMO_OUT} (${set.questions.length} questions)`)
    console.log(`wrote ${DEMO_ANCHORS_OUT} (${anchors.anchors.length} anchors)`)
  } finally {
    db.close()
  }
}

await main()
