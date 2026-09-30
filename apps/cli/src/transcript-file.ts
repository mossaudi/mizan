import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import type { TranscriptEntry } from "@mizan/agent"

/**
 * Reading the committed transcript — and reading nothing else.
 *
 * ## Why this file exists: a closure, not a convenience
 *
 * MIZ-104's security acceptance says the demo must not require, prompt for, or echo a secret, and
 * R-A8 asks for the machine-checked form of that: *the demo's import closure must contain no
 * `provider-config.ts` and no `MIZAN_LLM_API_KEY`*. Until this file existed, `apps/cli/src/demo.ts`
 * imported `readTranscript` and `TRANSCRIPT_RELATIVE` from `./provider-config.ts` — the one module
 * in this app that reads `process.env`, that names `MIZAN_LLM_API_KEY`, and that builds an
 * outbound HTTPS client. The demo called none of that code, and the closure test would still have
 * failed, which is the whole point of asking for a closure rather than for a behaviour.
 *
 * A closure is the honest form of this claim. "The demo does not use the key" is true today and is
 * a property of a line that has not been written yet; "nothing the demo imports can reach an
 * environment variable" survives the next edit to `demo.ts`, because the edit would have to add an
 * import to `provider-config.ts` and the gate would be red before the key was ever read.
 *
 * ## Why the split is not a second source of truth
 *
 * `TRANSCRIPT_RELATIVE` and `readTranscript` are MOVED here, not copied. `provider-config.ts`
 * imports and re-exports both, so `main.ts` is unchanged and there remains one definition of "a
 * usable transcript entry" (AGENTS.md section 17). A second reader would have been a second answer
 * to that question, and the two would drift exactly where it matters: an entry this file accepts
 * and the replay cannot use turns into a decode error deep inside a demo instead of a rejected
 * file.
 *
 * ## What this module may not grow
 *
 * No `process.env`, no `fetch`, no provider. It reads one committed JSON file and narrows each
 * entry by shape. Anything that needs the network or the environment belongs in
 * `provider-config.ts`, which is where every caller that is allowed one looks.
 */

/**
 * Where the committed transcript lives, relative to the repository root.
 *
 * Declared once, here, beside the reader that consumes it. `main.ts` and `demo.ts` both replay this
 * file; two literals in two files is one rename away from one of them reading a different
 * transcript than the other, and the resulting bug looks like a corrupt artefact rather than a typo.
 */
export const TRANSCRIPT_RELATIVE = "data/transcript.json"

/**
 * Read the committed transcript, narrowing each entry by shape rather than trusting it.
 *
 * Exported because `demo.ts` replays the same file and needs the same narrowing.
 *
 * `null` means "nothing usable here", which is what `main.ts` treats as "no model configured" and
 * what `demo.ts` reports as a missing committed input. The two callers disagree about which exit
 * that is, and that is correct: a CLI with no key can still say so, while a demo that was supposed
 * to replay and cannot is a broken checkout.
 *
 * A committed file is a trust boundary in the section 1 sense, so the parse result is `unknown` and
 * the narrowing is explicit rather than a cast the reader trusts. `JSON.parse` sits inside a `try`
 * because a truncated or hand-mangled file throws a `SyntaxError` before any schema is involved,
 * and that is the one input here capable of crashing the command a judge is watching.
 */
export const readTranscript = async (path: string): Promise<readonly TranscriptEntry[] | null> => {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown
    if (typeof parsed !== "object" || parsed === null) return null
    const entries = (parsed as { readonly entries?: unknown }).entries
    if (!Array.isArray(entries)) return null
    // Narrowed by shape, not trusted: a malformed entry would otherwise surface as a confusing
    // decode error deep inside a replay. Anything that is not an entry with a usable stage and
    // question hash is dropped, and a file that ends up empty simply means "no model configured".
    return entries.filter((entry): entry is TranscriptEntry => {
      if (typeof entry !== "object" || entry === null) return false
      const candidate = entry as { readonly stage?: unknown; readonly questionHash?: unknown }
      if (candidate.stage !== "decompose" && candidate.stage !== "answer") return false
      return typeof candidate.questionHash === "string" && candidate.questionHash.length > 0
    })
  } catch {
    // A corrupt transcript is not a crash: it is the same "there is no model" state.
    return null
  }
}

export * as TranscriptFile from "./transcript-file.ts"
