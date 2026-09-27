import { Database } from "bun:sqlite"
import { readFile } from "node:fs/promises"
import {
  DEMO_QUESTION_SET_VERSION,
  decodeOrFail,
  decodeSync,
  EvalSet,
  isOk,
  type Answer,
  type Claim,
  type Citation,
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

    await Bun.write(TRANSCRIPT_OUT, `${JSON.stringify({ entries }, null, 2)}\n`)
    await Bun.write(DEMO_OUT, `${JSON.stringify(set, null, 2)}\n`)
    console.log(`\nwrote ${TRANSCRIPT_OUT} (${entries.length} entries) and ${DEMO_OUT} (${set.questions.length} questions)`)
  } finally {
    db.close()
  }
}

await main()
