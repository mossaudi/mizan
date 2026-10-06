/**
 * The environment an acceptance child is allowed to see.
 *
 * ## Why this module exists
 *
 * `spawn` inherits `process.env` by default, and both acceptance surfaces — the orchestrator in
 * `scripts/accept-customer.ts` and the surface observer in `scripts/acceptance/surface-state.ts` —
 * spawned children without overriding it. So a developer's shell leaked into the evidence:
 *
 * - `MIZAN_LLM_API_KEY` — a live provider credential, inherited by `bun run ci`, `bun run eval:*`
 *   and every test in the tree. The key was never printed, but a child that crashes under a provider
 *   can dump its environment into a stack trace, and this report is pasted into tickets.
 * - `MIZAN_CORPUS_PATH` / `MIZAN_ATTESTATION_PATH` — and this one changes the *verdict*, which is
 *   worse than leaking a secret. A developer with `MIZAN_CORPUS_PATH` set to their own ingested
 *   snapshot made the clean-clone observer open that corpus instead of the synthetic one, and the
 *   surface reported a state the clone does not have. The report then claimed to describe a checkout
 *   nobody had ever cloned.
 *
 * The first failure is a confidentiality defect and the second is a correctness defect, and they have
 * one cause: the acceptance run was reading its subject from the operator rather than from the
 * checkout under test.
 *
 * ## Why a prefix, and why it is `MIZAN_` and not a list
 *
 * A hand-maintained deny-list of variable names is a list that is wrong the first time a fourth
 * override is added — and the failure mode is silent, because a missing entry produces a passing run.
 * Every configuration input this project honours is `MIZAN_`-prefixed by convention across the CLI,
 * the MCP server and the scripts, so the prefix is the namespace. Anything that matches it is
 * withheld, including names nobody has written yet.
 *
 * `PATH`, `SystemRoot`, `HOME`, `TEMP` and the rest are inherited deliberately: a child cannot run
 * without them, and none of them is a fact about the corpus or the run.
 *
 * ## Why the callers pass an explicit base
 *
 * Both call sites already build the environment they want — `surface-state.ts` adds the corpus paths
 * it means the server to open — and merging the scrubbed base underneath keeps the deny rule in one
 * place instead of one place per caller. The rule is a function of the base, so a caller cannot
 * accidentally reintroduce the inheritance it was written to prevent.
 */

/** The namespace every configuration input this project honours carries. */
export const MIZAN_PREFIX = "MIZAN_"

/**
 * `base` with every `MIZAN_`-prefixed variable removed.
 *
 * ## Why this preserves the type of `process.env`
 *
 * `NodeJS.ProcessEnv` admits `undefined` values (Windows variables are routinely unset), and
 * `spawn` accepts that shape, so returning it unchanged avoids a cast at either call site. A cast
 * here would be the first place in this tree where an environment could be declared well-formed
 * without being so.
 */
export const scrubbedEnv = (base: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string | undefined>> => {
  const scrubbed: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(base)) {
    if (name.startsWith(MIZAN_PREFIX)) continue
    scrubbed[name] = value
  }
  return scrubbed
}

/** The names `scrubbedEnv` would withhold, sorted — so a test can assert the rule rather than the effect. */
export const withheldNames = (base: Readonly<Record<string, string | undefined>>): readonly string[] =>
  Object.keys(base).filter((name) => name.startsWith(MIZAN_PREFIX)).toSorted()