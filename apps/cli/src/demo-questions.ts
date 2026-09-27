import { readFile } from "node:fs/promises"
import { decodeOrFail, decodeSync, DemoQuestionSet, describeDecodeFailure, err, isOk, ok, type Result } from "@mizan/core"

/**
 * Reading the committed synthetic question set.
 *
 * ## Why this is a module and not a `JSON.parse` at a call site
 *
 * Two callers need this file — the `--list-questions` surface in `main.ts` and the money-shot
 * tests in `test/demo.test.ts` — and a committed, hand-editable JSON file is a trust boundary in
 * exactly the sense AGENTS.md section 1 means. Declaring the shape once in `@mizan/core` means
 * the generator and the reader cannot disagree about it, and neither has to depend on `effect`
 * directly, because the beta API is confined to `core/schema/decode.ts` (ADR-02).
 *
 * ## Failure is a `Result`, never a throw
 *
 * A missing or malformed question set is a degraded demo, not a crash. Returning a typed error
 * lets `main.ts` print one honest line and carry on, which is the same shape a provider outage
 * takes: a product that dies on a missing optional file has turned a cosmetic problem into an
 * outage.
 */

export const DEMO_QUESTIONS_RELATIVE = "data/demo-questions.json"

/**
 * Read the file, parse it, and decode it — three steps that can each fail.
 *
 * `JSON.parse` is called inside the `try` on purpose. A truncated or hand-mangled file throws a
 * `SyntaxError` before any schema is involved, and letting that escape would be the one input in
 * this file capable of crashing the CLI.
 */
const parseAndDecode = (raw: string, path: string): Result<DemoQuestionSet, string> => {
  let payload: unknown
  try {
    payload = JSON.parse(raw) as unknown
  } catch (cause) {
    return err(`demo question set is not valid JSON: ${cause instanceof Error ? cause.message.split("\n")[0] : "unparseable"}`)
  }
  // Parsed as `unknown` and nothing more. A shape assertion here would be a second, weaker copy
  // of the schema, and the one thing this file must never do is trust its own `JSON.parse`.
  const decoded = decodeOrFail(decodeSync(DemoQuestionSet), payload, path)
  if (isOk(decoded)) return ok(decoded.value)
  return err(`demo question set is malformed — ${describeDecodeFailure(decoded.error)}`)
}

/** Read and decode the set, or explain precisely what is wrong with it. */
export const readDemoQuestionSet = async (root: string, relative: string = DEMO_QUESTIONS_RELATIVE): Promise<Result<DemoQuestionSet, string>> => {
  const path = `${root}/${relative}`
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch {
    return err(`no demo question set at ${relative}. Run \`bun run make:transcript\` to generate it.`)
  }
  return parseAndDecode(raw, path)
}

/**
 * The questions as lines for `--list-questions`.
 *
 * Every declared outcome is printed, because this list is the map a judge uses to decide which
 * question to run. Hiding which question produces a rejection would defeat the entire reason for
 * committing it.
 */
export const describeDemoQuestions = (set: DemoQuestionSet): string =>
  set.questions
    .map((question) =>
      [
        `  ${question.id}`,
        `    ask:   ${question.question}`,
        `    shows:  ${question.demonstrates}`,
        `    expect: ${question.expectations.map((entry) => `${entry.claimId} → ${entry.expectedVerdict} (${entry.expectedReason})`).join(", ")}`,
      ].join("\n"),
    )
    .join("\n\n")

export * as DemoQuestions from "./demo-questions.ts"
