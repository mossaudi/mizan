import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeOrFail, decodeSync, DemoAnchor, DemoAnchorSet, isOk, normalizeForMatch, sha256Hex, transcriptLabel } from "@mizan/core"
import { attestAllAnchors, attestDemoAnchor, buildDemoCorpus, describeDemoCorpusFailure, DEMO_ANCHORS_RELATIVE, readDemoAnchorSet } from "../src/demo-corpus.ts"
import { readDemoQuestionSet } from "../src/demo-questions.ts"
import { EXIT_DEGRADED, EXIT_OK, EXIT_UNTRUSTED, EXIT_USAGE } from "../src/exit-codes.ts"
import { preserveCommittedLedger, ROOT } from "./committed-ledger.ts"
import { boundedExit, subprocessBudgetFor, SUBPROCESS_TIMEOUT_MS } from "./subprocess-budget.ts"

/**
 * The `bun run demo` composition root, and the attestation it stands on.
 *
 * ## Why this file exists when `demo.test.ts` already exists
 *
 * `demo.test.ts` tests the parts: the question set decodes, the anchors attest, the transcript
 * replays, the verdicts come out right. None of it executes `apps/cli/src/demo.ts`, which is why
 * that file could be missing entirely — `package.json` pointed `bun run demo` at it, every test
 * passed, and the command a judge is most likely to run exited 1 with `Module not found`. A
 * composition root is only covered once something invokes it.
 *
 * ## The three properties worth protecting
 *
 *  1. **The attestation refuses.** Not "the hash is computed correctly" but "a changed diacritic
 *     stops the demo". A tamper check nobody has watched fail is a comment with a runtime cost.
 *  2. **The command is self-contained.** It is run against a temporary root holding only the
 *     three committed files it is allowed to read, so there is no `data/corpus.db` anywhere in
 *     reach. A claim the demo needs no corpus is otherwise untestable without moving 81 MB.
 *  3. **The command writes nothing.** `data/runs.jsonl` is committed and hash-chained; a demo
 *     that appended to it would dirty the tree and make `verify:runs` non-deterministic.
 */

const DEMO_RELATIVE = join("apps", "cli", "src", "demo.ts")
const QUESTION_RELATIVE = join("data", "demo-questions.json")
const TRANSCRIPT_RELATIVE = join("data", "transcript.json")

const parseJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown

const committedAnchors = (): readonly DemoAnchor[] => committedSet().anchors

const committedSet = (): DemoAnchorSet => {
  const decoded = decodeOrFail(decodeSync(DemoAnchorSet), parseJson(join(ROOT, DEMO_ANCHORS_RELATIVE)), DEMO_ANCHORS_RELATIVE)
  if (!isOk(decoded)) throw new Error(`the committed anchors do not decode: ${JSON.stringify(decoded.error)}`)
  return decoded.value
}

const firstAnchor = (): DemoAnchor => {
  const anchor = committedAnchors()[0]
  if (anchor === undefined) throw new Error("the committed anchors file is empty")
  return anchor
}

/** A copy of one anchor, so a test can edit a field without touching the committed file. */
const withAnchor = (overrides: Partial<DemoAnchor>): DemoAnchor => ({
  ...firstAnchor(),
  ...overrides,
})

/**
 * Run the demo with `cwd` pointed somewhere else.
 *
 * The script path stays absolute so the isolated root contains only the data the demo is allowed
 * to read. Bun resolves the script's own imports from its location in the repository, so the
 * workspace packages still load; what the isolated root denies is `data/corpus.db`.
 *
 * Bounded rather than awaited bare, because this is the whole composition root in a child process
 * and a hang here surfaces as a runner timeout that names neither the step nor the child. See
 * `subprocess-budget.ts`.
 */
const runDemoCommand = async (cwd: string): Promise<{ readonly code: number; readonly output: string }> => {
  const proc = Bun.spawn(["bun", "run", join(ROOT, DEMO_RELATIVE)], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    // No key, on purpose. The demo must not need one, and a run that found a key in the ambient
    // environment would not be evidence of that.
    env: { ...process.env, MIZAN_LLM_API_KEY: "", MIZAN_LLM_BASE_URL: "" },
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const output = `${stdout}${stderr}`
  const code = await boundedExit(proc.exited, () => {
    proc.kill()
  }, "bun run apps/cli/src/demo.ts", () => output)
  return { code, output }
}

/**
 * Temp directories this file creates, removed after the run.
 *
 * A registry rather than a `rmSync` after each test, because a test that fails on an assertion
 * never reaches the line below it — which is precisely when a littering temporary directory is
 * least welcome. A failing test should not leave anything behind for the next one to trip over.
 */
const TEMP_DIRS: string[] = []

afterAll(() => {
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

const scratchDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  TEMP_DIRS.push(dir)
  return dir
}

/**
 * A root that contains the demo's three committed inputs and nothing else.
 *
 * Deliberately no `data/corpus.db` and no `attestation.json`, so a demo that reached for either
 * would fail here rather than quietly succeeding on a developer's machine.
 */
const isolatedRoot = (): string => {
  const dir = scratchDir("mizan-demo-root-")
  mkdirSync(join(dir, "data", "eval"), { recursive: true })
  cpSync(join(ROOT, QUESTION_RELATIVE), join(dir, QUESTION_RELATIVE))
  cpSync(join(ROOT, DEMO_ANCHORS_RELATIVE), join(dir, DEMO_ANCHORS_RELATIVE))
  cpSync(join(ROOT, TRANSCRIPT_RELATIVE), join(dir, TRANSCRIPT_RELATIVE))
  return dir
}

describe("the demo corpus attestation", () => {
  test("a committed anchor is accepted, and its fold is re-derived rather than trusted", () => {
    const attested = attestDemoAnchor(firstAnchor())
    expect(isOk(attested)).toBe(true)
    if (!isOk(attested)) return
    // The record the demo builds carries the fold THIS code computes, not the copy in the file.
    expect(attested.value.textMatch).toBe(normalizeForMatch(attested.value.textDisplay))
  })

  test("editing one character of the stored text stops the demo", () => {
    const original = firstAnchor()
    // A single diacritic, the smallest edit that changes the hash and nothing else.
    const edited = { ...original, textDisplay: `${original.textDisplay}َ` }
    const attested = attestDemoAnchor(edited)
    expect(isOk(attested)).toBe(false)
    if (isOk(attested)) return
    expect(attested.error._tag).toBe("anchor_tampered")
    const message = describeDemoCorpusFailure(attested.error)
    expect(message).toContain("ATTESTATION FAILED")
    // The refusal names the anchor and the two digests, never the licensed text it is refusing.
    expect(message).toContain(original.anchorId)
    expect(message).not.toContain(edited.textDisplay)
  })

  test("a stored fold that disagrees with the fold table stops the demo", () => {
    const attested = attestDemoAnchor(withAnchor({ textMatch: "something that is not the fold" }))
    expect(isOk(attested)).toBe(false)
    if (isOk(attested)) return
    expect(attested.error._tag).toBe("anchor_fold_mismatch")
  })

  test("an anchor with no stored fold is legitimate, and the derived fold is used", () => {
    // `textMatch` is optional in the schema on purpose: the re-derived value is the authority,
    // so a file that omits the convenience copy is not a defect.
    const attested = attestDemoAnchor(withAnchor({ textMatch: undefined }))
    expect(isOk(attested)).toBe(true)
    if (!isOk(attested)) return
    expect(attested.value.textMatch).toBe(normalizeForMatch(attested.value.textDisplay))
  })

  test("two anchors claiming one record id stop the demo, because a citation would be ambiguous", () => {
    const anchor = firstAnchor()
    const duplicated = decodeOrFail(decodeSync(DemoAnchor), { ...anchor, anchorId: "quran:9999" }, "duplicate probe")
    expect(isOk(duplicated)).toBe(true)
    if (!isOk(duplicated)) return
    const set = { ...committedSet(), anchors: [anchor, duplicated.value] }
    const attested = attestAllAnchors(set)
    expect(isOk(attested)).toBe(false)
    if (isOk(attested)) return
    expect(attested.error._tag).toBe("anchor_duplicate_record_id")
  })

  test("a missing anchors file is a typed refusal naming the path, not a crash", async () => {
    const read = await readDemoAnchorSet(scratchDir("mizan-demo-empty-"))
    expect(isOk(read)).toBe(false)
    if (isOk(read)) return
    expect(read.error._tag).toBe("anchors_missing")
    // The absolute path is what makes the refusal actionable, so the name is what is asserted.
    expect(describeDemoCorpusFailure(read.error)).toContain("demo-anchors.json")
  })

  test("a truncated anchors file is refused at the decode, not parsed and trusted", async () => {
    const dir = scratchDir("mizan-demo-bad-")
    mkdirSync(join(dir, "data", "eval"), { recursive: true })
    writeFileSync(join(dir, DEMO_ANCHORS_RELATIVE), "{ this is not json", "utf8")
    const read = await readDemoAnchorSet(dir)
    expect(isOk(read)).toBe(false)
    if (isOk(read)) return
    expect(read.error._tag).toBe("anchors_unreadable")
  })

  test("a textHash in the file that does not match its own text is the tampering case, end to end", () => {
    // Not a synthetic hash: the same convention `toRecordMeta` uses, computed by the same
    // function, so this test cannot pass by agreeing with a wrong idea of what the field is.
    const anchor = withAnchor({ textHash: sha256Hex("a different text entirely") })
    const attested = attestDemoAnchor(anchor)
    expect(isOk(attested)).toBe(false)
    if (isOk(attested)) return
    expect(attested.error._tag).toBe("anchor_tampered")
  })
})

describe("building the snapshot the verdicts are computed against", () => {
  test("a temporary directory this machine will not accept is a typed refusal, not a stack trace", async () => {
    // The planted violation. `dir` is a REGULAR FILE, so `buildSnapshot`'s `mkdirSync` on the parent
    // throws EEXIST. Before the guard this rejected with an unhandled error whose frames crossed from
    // @mizan/corpus into the CLI — a raw stack trace on the one screen nobody debugs, and a throw
    // crossing a package boundary, which AGENTS.md section 2 forbids outright.
    const dir = join(scratchDir("mizan-demo-nodir-"), "not-a-directory")
    writeFileSync(dir, "x", "utf8")

    // The real committed anchors are used on purpose: they pass attestation, so the only thing that
    // can fail here is the build. A test that failed for a different reason would prove nothing.
    const built = await buildDemoCorpus(ROOT, dir)
    expect(isOk(built)).toBe(false)
    if (isOk(built)) return
    expect(built.error._tag).toBe("demo_snapshot_unbuildable")

    const message = describeDemoCorpusFailure(built.error)
    expect(message).toContain("could not be built")
    // The refusal must say plainly that nothing was decided, and must NOT claim the corpus was
    // tampered with: the anchors are fine, and reporting a local write fault as tampering would be a
    // false accusation against a committed, reviewed artefact.
    expect(message).toContain("No verdict is shown")
    expect(message).not.toContain("ATTESTATION FAILED")
  })
})

describe("bun run demo", () => {
  const ledger = preserveCommittedLedger()

  test("the script `package.json` points at exists, which is the bug this file was written for", () => {
    // The cheapest possible regression test for the defect this file was created by: a script
    // entry with no file behind it, which every other test in the repository passed straight
    // through.
    expect(existsSync(join(ROOT, DEMO_RELATIVE))).toBe(true)
  })

  test("the README tells a judge to run it, which is the other half of that bug", () => {
    // The demo existing and the demo being documented are separate facts, and only the first was
    // ever checked. `checkDocumentedScripts` (R4) proves a documented command is real; nothing
    // proved the reverse, so a quick start listing only `bun run ingest` passed every check in the
    // repository while leaving the two-command path undiscoverable — which is the R-05 problem the
    // demo was built to solve.
    //
    // Scoped to the Quick start section, because a later section mentioning the command must not
    // satisfy a claim about where a judge is told to start; and matched as whole command lines
    // rather than as substrings, because `bun run demo-not-real` contains `bun run demo` and a
    // substring assertion would pass on exactly the typo it exists to catch.
    const readme = readFileSync(join(ROOT, "README.md"), "utf8")
    const quickStart = readme.slice(readme.indexOf("## Quick start"), readme.indexOf("## The eval sets"))
    const commands = quickStart
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("bun "))

    // The install line is what makes the claim "two commands" true rather than one.
    expect(commands).toContain("bun install --frozen-lockfile")
    expect(commands).toContain("bun run demo")
  })

  test("it reaches both declared outcomes with no key, no network and no corpus.db", async () => {
    const dir = isolatedRoot()
    expect(existsSync(join(dir, "data", "corpus.db"))).toBe(false)
    const { code, output } = await runDemoCommand(dir)
    expect(output).toContain("[VERIFIED] ikhlas-1 — exact_containment")
    expect(output).toContain("[REJECTED] knowledge-fading-1 — quote_absent_at_cited_id")
    expect(output).toContain("2/2 questions reached the outcome")
    expect(code).toBe(EXIT_OK)
  }, SUBPROCESS_TIMEOUT_MS)

  test("it says on screen that the transcript is a replay and that it wrote no ledger entry", async () => {
    const dir = isolatedRoot()
    const { output } = await runDemoCommand(dir)
    // The shared label verbatim, not the word: the demo banner and the report header must print the
    // identical string, or a judge is shown two answers to "which mode is this?" on one screen.
    // The source-level half — that the banner derives it rather than typing it — is in demo.test.ts.
    expect(output).toContain(transcriptLabel("precomputed"))
    expect(output).toContain("appends nothing to data/runs.jsonl")
  }, SUBPROCESS_TIMEOUT_MS)

  test("the demo banner states that the verdicts were computed, not replayed", async () => {
    // The scope clause, from the other end. A `PRECOMPUTED` label with no scope reads as a
    // disclaimer covering the badges as well, which is a false retraction: the answers are
    // replayed, every badge under them is computed by the verifier on this run.
    const dir = isolatedRoot()
    const { output } = await runDemoCommand(dir)
    expect(output).toContain("verdicts computed live")
  }, SUBPROCESS_TIMEOUT_MS)

  test("it prints the corpus fingerprint in full, so a reader can check it", async () => {
    const dir = isolatedRoot()
    const { output } = await runDemoCommand(dir)
    const printed = /corpus\s+([0-9a-f]{64})/.exec(output)
    expect(printed).not.toBeNull()
    if (printed === null) return
    expect(printed[1]).toHaveLength(64)
  }, SUBPROCESS_TIMEOUT_MS)

  test("it shows the record's display text and never its folded matching key", async () => {
    // MIZ-104: "the folded matching key textMatch never appears in the output". The two fields
    // hold the same letters, so a renderer that printed the fold instead of the display text would
    // look *nearly* right to a reader - the diacritics would just be missing. So this asserts the
    // fold is ABSENT, which is the direction that catches the regression; the display text being
    // present is asserted per anchor so the test cannot pass on an empty output.
    const dir = isolatedRoot()
    const { output } = await runDemoCommand(dir)
    for (const anchor of committedAnchors()) {
      const folded = normalizeForMatch(anchor.textDisplay)
      // A one-character fold equals its display text when the record has no diacritics at all,
      // so there is nothing to distinguish and nothing to assert.
      if (folded === anchor.textDisplay) continue
      expect(output).toContain(anchor.textDisplay)
      expect(output).not.toContain(folded)
    }
  }, SUBPROCESS_TIMEOUT_MS)

  test("two runs produce the same corpus fingerprint and the same verdicts", async () => {
    const dir = isolatedRoot()
    const first = await runDemoCommand(dir)
    const second = await runDemoCommand(dir)
    const fingerprint = (output: string): string | null => /corpus\s+([0-9a-f]{64})/.exec(output)?.[1] ?? null
    expect(fingerprint(first.output)).toBe(fingerprint(second.output))
    expect(fingerprint(first.output)).not.toBeNull()
  }, subprocessBudgetFor(2))

  test("it appends nothing to the committed run ledger", async () => {
    const dir = isolatedRoot()
    await runDemoCommand(dir)
    expect(await ledger.appendedTrace()).toBeNull()
  }, SUBPROCESS_TIMEOUT_MS)

  test("a tampered demo corpus stops the demo with no verdict and the untrusted exit code", async () => {
    const dir = isolatedRoot()
    const path = join(dir, DEMO_ANCHORS_RELATIVE)
    const set = JSON.parse(readFileSync(path, "utf8")) as { anchors: { textDisplay: string }[] }
    const first = set.anchors[0]
    if (first === undefined) throw new Error("the isolated anchors file has no anchors")
    // Edit the text and leave `textHash` alone: exactly what a hand-edit to a licensed artefact
    // looks like, and the case the whole attestation exists to refuse.
    first.textDisplay = `${first.textDisplay} `
    writeFileSync(path, JSON.stringify(set, null, 2), "utf8")

    const { code, output } = await runDemoCommand(dir)
    expect(output).toContain("ATTESTATION FAILED")
    expect(output).not.toContain("[VERIFIED]")
    expect(output).not.toContain("[REJECTED]")
    expect(code).toBe(EXIT_UNTRUSTED)
  }, SUBPROCESS_TIMEOUT_MS)

  test("a missing anchors file exits as a usage error, not as an untrusted run", async () => {
    const dir = isolatedRoot()
    rmSync(join(dir, DEMO_ANCHORS_RELATIVE))
    const { code, output } = await runDemoCommand(dir)
    expect(output).toContain("the demo corpus file is missing")
    expect(code).toBe(EXIT_USAGE)
  }, SUBPROCESS_TIMEOUT_MS)
})

describe("the shared pipeline constants", () => {
  test("the four exit codes are distinct, so a harness can tell the failures apart", () => {
    const codes = [EXIT_OK, EXIT_DEGRADED, EXIT_USAGE, EXIT_UNTRUSTED]
    expect(new Set(codes).size).toBe(codes.length)
    expect(EXIT_OK).toBe(0)
  })

  test("the demo question set still decodes, because the demo is its only reader", async () => {
    const set = await readDemoQuestionSet(ROOT)
    expect(isOk(set)).toBe(true)
    if (!isOk(set)) return
    expect(set.value.questions.length).toBeGreaterThan(0)
  })
})
