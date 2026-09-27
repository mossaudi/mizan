import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { isOk, type Claim, type Citation } from "@mizan/core"
import { hadithSearch, quranSearch } from "@mizan/retrieval"
import { openSnapshot, readSnapshotMeta, resolveCitations } from "@mizan/corpus"
import { runSpine, transcriptProvider, type RetrievedContext } from "@mizan/agent"
import { verifyAnswer } from "@mizan/verify"

/**
 * The demo must work, not just the unit tests.
 *
 * ## Why this file exists
 *
 * Every other CLI test builds a synthetic snapshot in a temp directory, which is the right way
 * to test the CLI's own code. It is the wrong way to find out whether the *committed* artefacts
 * still agree with each other. The failure this catches is specific and embarrassing: the corpus
 * is re-ingested, the numbering shifts, and `data/transcript.json` — which is a quote copied out
 * of the old snapshot — no longer resolves. Every unit test stays green, the demo prints
 * `unverifiable` in front of a judge, and nothing in CI noticed.
 *
 * So this file asserts the invariant across the two committed files: the transcript replays, the
 * replay retrieves something real, the citation resolves against the shipped snapshot, and the
 * verifier independently reaches `verified`. It is deliberately allowed to fail when the corpus
 * moves — that is the alarm, not a nuisance.
 *
 * ## What is NOT mocked
 *
 * The snapshot on disk, the transcript on disk, the real lexical rankers, the real citation
 * resolver, the real verifier. A test that stubbed any of those would be asserting that its own
 * stubs line up.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")
const TRANSCRIPT = join(ROOT, "data", "transcript.json")
const CORPUS = join(ROOT, "data", "corpus.db")

/**
 * The snapshot is gitignored by design, so on a clean checkout — including CI, which deliberately
 * never runs the 80 MB ingest — these tests have nothing to open. Failing there would be wrong:
 * it would mean every judge who clones the repository sees a red build for a file they were never
 * meant to receive.
 *
 * So the tests that need the snapshot SKIP, loudly, and a test below asserts that the snapshot is
 * either present-and-attested or absent-and-ignored. The skip is never mistaken for a pass: the
 * committed eval sets in `test/eval.test.ts` carry their own corpus rows and exercise the same
 * resolver and verifier on a clean checkout, so the end-to-end spine is covered in CI *without*
 * the database.
 */
const CORPUS_PRESENT = existsSync(CORPUS)
if (!CORPUS_PRESENT) {
  console.warn(
    "[happy-path] data/corpus.db is absent — the committed-snapshot tests are SKIPPED. " +
      "Run `bun run ingest` to exercise them locally.",
  )
}

/** The question the committed transcript was generated for. Kept beside the hash it keys on. */
const QUESTION = "What does the Qur'an say about the oneness of God?"

const readTranscript = async (): Promise<{ readonly stage: string; readonly questionHash: string; readonly answer: { readonly claims: readonly Claim[] } }[]> => {
  const parsed = JSON.parse(await readFile(TRANSCRIPT, "utf8")) as { entries?: unknown }
  if (!Array.isArray(parsed.entries)) throw new Error("data/transcript.json has no entries array")
  return parsed.entries as { stage: string; questionHash: string; answer: { claims: readonly Claim[] } }[]
}

const makeRetriever = (db: Database) => (queries: readonly string[]): readonly RetrievedContext[] => {
  const contexts: RetrievedContext[] = []
  for (const query of queries) {
    for (const tool of [quranSearch, hadithSearch]) {
      const found = tool(db, { text: query, limit: 5 })
      if (!isOk(found)) continue
      for (const chunk of found.value.chunks) {
        const row = db.query("SELECT textDisplay FROM records WHERE id = ?").get(chunk.id) as { textDisplay: string } | null
        const text = row?.textDisplay ?? ""
        if (text.trim().length === 0) continue
        contexts.push({ tool: tool === quranSearch ? "quranSearch" : "hadithSearch", text, citationLabel: `${chunk.collection} ${chunk.number ?? ""}`.trim() })
      }
    }
  }
  return contexts
}

describe("the committed demo replays against the committed snapshot", () => {
  test.skipIf(!CORPUS_PRESENT)("a transcript-backed run reaches verified, honestly labelled as a replay", async () => {
    const entries = await readTranscript()
    const stages = entries.map((entry) => entry.stage)
    // Both calls the spine makes, or the replay cannot complete: a transcript with only an
    // `answer` entry fails the decomposition step and the run degrades before it ever retrieves.
    expect(stages).toContain("decompose")
    expect(stages).toContain("answer")

    const db = openSnapshot(CORPUS)
    const snapshotHash = readSnapshotMeta(db).snapshotHash ?? "unknown"
    try {
      const outcome = await runSpine(
        { question: QUESTION, instructions: "Quote verbatim. Treat the corpus as the boundary of assertion." },
        { provider: transcriptProvider({ entries: entries as never }), retrieve: makeRetriever(db) },
      )
      // `SpineSuccess` carries an answer; `SpineFailure` carries a degrade reason. There is no
      // `ok: true` to assert, because a success that forgot to set it must not read as success.
      expect("answer" in outcome).toBe(true)
      if (!("answer" in outcome)) return
      expect(outcome.contexts.length).toBeGreaterThan(0)
      // The one label that must never drift: a replay is a replay, in the trace and on screen.
      expect(outcome.transcript).toBe("precomputed")

      const claims = outcome.answer.claims
      expect(claims.length).toBeGreaterThan(0)
      const citations = claims.flatMap((claim) => claim.citations)
      const { resolved, problems } = resolveCitations(db, citations as readonly Citation[])
      expect(problems).toEqual([])

      const report = verifyAnswer({ claims, evidence: resolved, snapshotHash })
      const verdicts = report.claims.map((claim) => claim.verdict)
      expect(verdicts).toContain("verified")
      // Nothing may degrade in the demo: an `unverifiable` here means the transcript drifted
      // from the corpus, which is exactly the drift this file exists to catch.
      expect(report.degraded).toEqual([])
      expect(report.snapshotHash).toBe(snapshotHash)
    } finally {
      db.close()
    }
  })

  test("the transcript file is labelled precomputed on every entry", async () => {
    const entries = await readTranscript()
    for (const entry of entries) {
      const label = (entry.answer as { transcript?: string }).transcript
      expect(label).toBe("precomputed")
    }
  })

  test("the transcript contains no question text, only its hash", async () => {
    // AGENTS.md section 13: a transcript committed to the repository must not become a record of
    // what people asked. The generator writes hashes; this fails if someone pastes a question in.
    const raw = await readFile(TRANSCRIPT, "utf8")
    expect(raw).not.toContain(QUESTION)
    for (const entry of await readTranscript()) {
      expect(entry.questionHash).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  test.skipIf(!CORPUS_PRESENT)("the corpus the demo replays against is the attested one", () => {
    const db = openSnapshot(CORPUS)
    try {
      const meta = readSnapshotMeta(db)
      expect(Number(meta.recordCount)).toBeGreaterThan(0)
      expect(meta.snapshotHash).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      db.close()
    }
  })
})

/**
 * The exit code is the part of the product an operator and a CI job both read.
 *
 * Every other test here calls the pipeline in-process, where a thrown error and an honest
 * degradation are indistinguishable. They are not indistinguishable to a shell: a run that
 * degrades must exit non-zero, or a script wrapping this believes it got an answer. So these two
 * tests spawn the real binary, which is the only way to observe the contract as a caller sees it.
 */
describe("the CLI's exit code tells a caller whether it got an answer", () => {
  const run = async (question: string): Promise<{ readonly code: number; readonly output: string }> => {
    const proc = Bun.spawn(["bun", "run", join(ROOT, "apps", "cli", "src", "main.ts"), question], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MIZAN_API_KEY: "" },
    })
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    return { code: await proc.exited, output: `${stdout}${stderr}` }
  }

  test.skipIf(!CORPUS_PRESENT)("a question the transcript does not cover exits non-zero and says model unavailable", async () => {
    // No transcript entry for this hash, so the honest answer is that there is no model. Exiting
    // 0 here would be the fail-open this project exists to avoid.
    const { code, output } = await run("What is the ruling on cryptocurrency?")
    expect(code).not.toBe(0)
    expect(output).toContain("model unavailable")
    // The forbidden surfaces, asserted so a future "helpful" fallback cannot sneak in.
    expect(output).not.toContain("VERIFIED")
  }, 60_000)

  test.skipIf(!CORPUS_PRESENT)("the committed question exits zero with a computed verdict", async () => {
    const { code, output } = await run(QUESTION)
    expect(code).toBe(0)
    expect(output).toContain("VERIFIED")
    // The replay label is the honesty guarantee, and it is on screen, not just in the trace.
    expect(output).toContain("PRECOMPUTED")
  }, 60_000)
})

/**
 * The skip above must never become a guard that cannot fail.
 *
 * On a clean checkout the snapshot is missing, so the two committed-artefact tests do not run. That
 * is legitimate only if the absence is a deliberate decision recorded in the repository. This test
 * runs everywhere and pins exactly that: the database is either here and matching the committed
 * attestation, or gone on purpose, with a `.gitignore` that says so.
 */
describe("the snapshot is present-and-attested, or absent on purpose", () => {
  test("data/corpus.db is either the attested snapshot or a gitignored build artefact", async () => {
    const attestation = JSON.parse(await readFile(join(ROOT, "attestation.json"), "utf8")) as {
      readonly snapshotHash?: unknown
      readonly recordCount?: unknown
    }
    expect(attestation.snapshotHash).toMatch(/^[0-9a-f]{64}$/)

    // Narrow both fields before comparing them. `toMatch` above already rejects a non-string
    // hash, but nothing rejected a non-numeric count, and `toBe` accepts `unknown` on either
    // side. Left as `unknown`, a malformed `attestation.json` reported itself as a snapshot
    // mismatch — blaming the corpus for a broken provenance file.
    if (typeof attestation.snapshotHash !== "string" || typeof attestation.recordCount !== "number") {
      throw new Error(
        `attestation.json is not the shape the provenance chain claims: snapshotHash is ${typeof attestation.snapshotHash}, recordCount is ${typeof attestation.recordCount}`,
      )
    }

    if (!CORPUS_PRESENT) {
      // Absent: the only acceptable reason is that the repository declares it generated.
      const ignore = await readFile(join(ROOT, ".gitignore"), "utf8")
      expect(ignore).toContain("corpus.db")
      return
    }

    // Present: it must be the snapshot the committed attestation describes, or the demo above is
    // replaying against a corpus the provenance chain does not cover.
    const db = openSnapshot(CORPUS)
    try {
      const meta = readSnapshotMeta(db)
      expect(meta.snapshotHash).toBe(attestation.snapshotHash)
      expect(Number(meta.recordCount)).toBe(attestation.recordCount)
    } finally {
      db.close()
    }
  })
})
