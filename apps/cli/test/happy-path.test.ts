import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { isOk, transcriptLabel, type Claim, type Citation } from "@mizan/core"
import { hadithSearch, quranSearch } from "@mizan/retrieval"
import { openSnapshot, readSnapshotMeta, resolveCitations } from "@mizan/corpus"
import { runSpine, transcriptProvider, type RetrievedContext } from "@mizan/agent"
import { verifyAnswer } from "@mizan/verify"
import { preserveCommittedLedger, spawnCli } from "./committed-ledger.ts"
import { SUBPROCESS_TIMEOUT_MS } from "./subprocess-budget.ts"
import {
  EXIT_ATTESTATION_MISMATCH,
  EXIT_CORPUS_MISS,
  EXIT_DEGRADED,
  EXIT_LEDGER_WRITE_FAILURE,
  EXIT_OK,
  EXIT_PROVIDER_DOWN,
  EXIT_RANKER_DOWN,
  EXIT_TAFSIR_UNREACHABLE,
  EXIT_UNTRUSTED,
  EXIT_USAGE,
  EXIT_VERIFICATION_TIMEOUT,
} from "../src/exit-codes.ts"

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
  // Spawning the binary appends to the committed run ledger; the shared guard restores it and
  // exposes what was appended, which is what the trace assertions below read.
  const { appendedTrace } = preserveCommittedLedger()

  const run = (question: string): Promise<{ readonly code: number; readonly output: string }> => spawnCli(question)

  test.skipIf(!CORPUS_PRESENT)("a question the transcript does not cover exits non-zero and says model unavailable", async () => {
    // No transcript entry for this hash, so the honest answer is that there is no model. Exiting
    // 0 here would be the fail-open this project exists to avoid.
    const { code, output } = await run("What is the ruling on cryptocurrency?")
    expect(code).not.toBe(0)
    expect(output).toContain("model unavailable")
    // The forbidden surfaces, asserted so a future "helpful" fallback cannot sneak in.
    expect(output).not.toContain("VERIFIED")
    // Story 4: the offer must be true advice. This run has no key, so there is no live route to
    // leave, and telling the operator to unset `MIZAN_LLM_API_KEY` would be naming a command that
    // changes nothing — the fail-open shape wearing a helpful sentence (AGENTS.md §3).
    expect(output).not.toContain("unset MIZAN_LLM_API_KEY")
    expect(output).toContain("--list-questions")
  }, SUBPROCESS_TIMEOUT_MS)

  test.skipIf(!CORPUS_PRESENT)("a configured provider that fails offers the labelled replay, and does not take it", async () => {
    // The base URL is refused by the host allowlist before any socket is opened, so this exercises
    // the keyed-failure branch with no network and no real credential in the environment.
    const { code, output } = await spawnCli(QUESTION, {
      MIZAN_PROVIDER: "hosted",
      MIZAN_LLM_API_KEY: "sk-canary-not-a-real-key",
      MIZAN_LLM_BASE_URL: "https://not-in-the-allowlist.example.com",
    })
    expect(code).not.toBe(0)
    expect(output).toContain("model unavailable")
    // The offer names the label the next run would print, and it is the shared one — the same
    // string `transcriptLabel` gives the header, so the two cannot describe a mode differently.
    expect(output).toContain(`the header will read "${transcriptLabel("precomputed")}"`)
    // An offer, not a substitution: nothing was answered, and no key material is on screen.
    expect(output).not.toContain("sk-canary")
    expect(output).not.toContain("VERIFIED")
  }, SUBPROCESS_TIMEOUT_MS)

  test.skipIf(!CORPUS_PRESENT)("the committed question exits zero with a computed verdict", async () => {
    const { code, output } = await run(QUESTION)
    expect(code).toBe(0)
    expect(output).toContain("VERIFIED")
    // The replay label is the honesty guarantee, and it is on screen, not just in the trace.
    expect(output).toContain("PRECOMPUTED")
  }, SUBPROCESS_TIMEOUT_MS)

  test.skipIf(!CORPUS_PRESENT)("the report states which language the question was asked in", async () => {
    // US-13 made observable rather than asserted. Before this, `processQuestion` was exported from
    // `@mizan/core` and imported by nothing but its own test, so "we take questions in 44
    // languages" had no route to any code a user can reach. The language tag is printed in the
    // header, which is the part of the report a judge screenshots.
    const { code, output } = await run(QUESTION)
    expect(code).toBe(0)
    expect(output).toContain("language     en (ltr, detected)")
  }, SUBPROCESS_TIMEOUT_MS)

  test.skipIf(!CORPUS_PRESENT)("a question that merely uses a SQL word is asked, not refused", async () => {
    // The boundary must not refuse a real question. The previous filter rejected `\bsystem\b` and
    // `\bdelete\b` on sight, so this reached the user as a refusal with a security label on it.
    // The committed transcript covers no such question, so the honest outcome here is that the run
    // got as far as asking the provider - and "model unavailable" is that outcome. What must NOT
    // happen is the boundary refusing it: that is the assertion.
    const { code, output } = await run("Explain the system of prayer in Islam.")
    expect(output).not.toContain("ask REFUSED")
    expect(code).not.toBe(EXIT_USAGE)
  }, SUBPROCESS_TIMEOUT_MS)

  test.skipIf(!CORPUS_PRESENT)("a payload-shaped question is refused at the boundary, before anything runs", async () => {
    // Refusal at the boundary is the cheap, unambiguous place: nothing is opened, no provider is
    // resolved, no SQL is composed, and no trace exists - which is why this is EXIT_USAGE and not
    // EXIT_DEGRADED. A degraded run has a record; this has none.
    const { code, output } = await run("'; DROP TABLE records; --")
    expect(code).toBe(EXIT_USAGE)
    expect(output).toContain("ask REFUSED")
    // The message names the reason. "Rejected" without one is the surface AGENTS.md section 16
    // forbids, and a user who cannot tell why their question was refused cannot ask a different one.
    expect(output).toContain("injection")
    // And nothing that could be mistaken for an answer.
    expect(output).not.toContain("VERIFIED")
    expect(output).not.toContain("UNVERIFIABLE")
    expect(output).not.toContain("model unavailable")
  }, SUBPROCESS_TIMEOUT_MS)

  test.skipIf(!CORPUS_PRESENT)("a question in an undetectable script is refused, and says so", async () => {
    // The other boundary refusal, and a different fact from the one above: mizan cannot read this,
    // rather than mizan will not read it. Both are usage errors; neither is a verdict.
    const { code, output } = await run("1234")
    expect(code).toBe(EXIT_USAGE)
    expect(output).toContain("ask REFUSED")
    expect(output).toContain("could not detect")
  }, SUBPROCESS_TIMEOUT_MS)

  /**
   * The trace records what actually happened, not a plausible-looking summary.
   *
   * This is the assertion that the F4 numbers are real. The previous trace hard-coded its tool
   * calls — one row per query reading `tool: "quranSearch+hadithSearch"`, `resultCount: 3`,
   * `ranking: "fused"`, `elapsedMs: 0` — so a system that measured nothing still produced a trace
   * that looked healthy. A committed run ledger full of those rows documents a system that did not
   * run. Read here, while the append is still on disk and before `afterAll` restores the ledger.
   *
   * Note the field is `toolsCalled`, not `toolCalls`: the retrieval side calls its array
   * `calls` and the composition root's local too, and the trace schema has always said
   * `toolsCalled`. Asserting the wrong name would have made this test pass vacuously, which is
   * the exact failure it exists to catch.
   */
  test.skipIf(!CORPUS_PRESENT)("the trace records real tool calls, rankings and timings", async () => {
    const { code } = await run(QUESTION)
    expect(code).toBe(0)

    const trace = await appendedTrace()
    expect(trace).not.toBeNull()
    if (trace === null) return
    const record = trace as {
      readonly toolsCalled?: readonly {
        readonly tool: string
        readonly resultCount: number
        readonly ranking: string
        readonly elapsedMs: number
      }[]
      readonly timings?: { readonly retrievalMs: number; readonly generationMs: number; readonly verificationMs: number; readonly totalMs: number }
    }

    // One row per real call, not a concatenation. A single row whose tool name contains a `+` is
    // the old fabricated shape and is specifically what this rejects.
    const calls = record.toolsCalled ?? []
    const tools = calls.map((call) => call.tool).sort()
    expect(tools).toEqual(["hadithSearch", "quranSearch"])
    for (const call of calls) {
      expect(call.tool).not.toContain("+")
      // A measured call takes measurable time. A hard-coded 0 is the defect.
      expect(call.elapsedMs).toBeGreaterThan(0)
      // Only two values are honest here: "fused" (several rankers contributed) or "unavailable"
      // (one did). A third shape would be a silent downgrade presented as full fidelity.
      expect(["fused", "unavailable"]).toContain(call.ranking)
    }

    // The Qur'an question retrieves Qur'an.
    const quran = calls.find((call) => call.tool === "quranSearch")
    expect(quran?.resultCount).toBeGreaterThan(0)

    const timings = record.timings
    expect(timings).toBeDefined()
    if (timings === undefined) return
    // The strong one: retrievalMs is the SUM of the per-call measurements, so a trace cannot
    // report a total that disagrees with its own rows. Fabricated numbers are internally
    // consistent too, but only if the fabricator also adds them up — and this cross-check is
    // what fails first when someone hard-codes a total and leaves the rows real.
    expect(timings.retrievalMs).toBe(calls.reduce((sum, call) => sum + call.elapsedMs, 0))
    expect(timings.totalMs).toBeGreaterThanOrEqual(timings.retrievalMs)
  }, SUBPROCESS_TIMEOUT_MS)
})

/**
 * The exit-code table must stay honest about its own granularity.
 *
 * ## Why this exists
 *
 * `apps/cli/src/exit-codes.ts` carried a comment claiming "each failure mode has a unique non-zero
 * exit code so a harness can distinguish between them", above seven aliases holding **two**
 * distinct values. A comment that overstates what a constant guarantees is worse than no comment:
 * a reviewer reads it and stops looking, and a harness written against it cannot work. The fix was to
 * the comment, and this test is what stops the comment from quietly becoming true again by accident
 * — someone adding a mode and picking a fresh number would break the documented contract below.
 *
 * The claim being pinned is therefore the honest one: the seven names exist, they map onto the codes
 * `docs/degradation-matrix.md` publishes, and a caller branches on two.
 */
describe("the exit-code aliases are names, not distinct numbers", () => {
  test("the seven degradation modes map onto the codes the matrix documents", () => {
    const byMode = {
      providerDown: EXIT_PROVIDER_DOWN,
      corpusMiss: EXIT_CORPUS_MISS,
      verificationTimeout: EXIT_VERIFICATION_TIMEOUT,
      ledgerWriteFailure: EXIT_LEDGER_WRITE_FAILURE,
      attestationMismatch: EXIT_ATTESTATION_MISMATCH,
      tafsirUnreachable: EXIT_TAFSIR_UNREACHABLE,
      rankerDown: EXIT_RANKER_DOWN,
    } as const

    // The exact table in `docs/degradation-matrix.md`. If a mode is given a new code, this is the
    // test that refuses to let it do so quietly.
    expect(Object.values(byMode)).toEqual([1, 1, 1, 3, 3, 1, 1])
    expect(new Set(Object.values(byMode)).size).toBe(2)
  })

  test("every mode is distinguishable by NAME even where the number is shared", () => {
    // The distinction a shell cannot make is carried by the name and by the printed message, so the
    // seven aliases must all exist as separate bindings and none may shadow another.
    const aliases = [
      EXIT_PROVIDER_DOWN,
      EXIT_CORPUS_MISS,
      EXIT_VERIFICATION_TIMEOUT,
      EXIT_LEDGER_WRITE_FAILURE,
      EXIT_ATTESTATION_MISMATCH,
      EXIT_TAFSIR_UNREACHABLE,
      EXIT_RANKER_DOWN,
    ]
    expect(aliases).toHaveLength(7)
    expect(aliases.every((code) => code !== 0)).toBe(true)
  })

  test("the four pipeline codes remain OK / degraded / usage / untrusted", () => {
    // These four are what an entry point actually returns, and unlike the aliases above they are
    // genuinely distinct — a caller branching on "did it run" and "can I trust it" depends on it.
    expect([EXIT_OK, EXIT_DEGRADED, EXIT_USAGE, EXIT_UNTRUSTED]).toEqual([0, 1, 2, 3])
  })
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
