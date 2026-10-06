import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * G-4 — gitleaks, run as a subprocess. Fail closed if the binary is missing.
 *
 * This is the only gate that is not a pure function of the source tree, because secret
 * scanning is a solved problem and reimplementing it would be worse. Two decisions worth
 * naming:
 *
 *  - **Fail closed on a missing binary.** A gate that skips when its tool is absent reports
 *    "pass" for "did not run", which is the exact failure mode AGENTS.md section 14 exists to
 *    prevent. CI installs gitleaks explicitly; a developer without it gets a message telling
 *    them how to install it, not a green tick.
 *  - **`--redact`.** The report may quote a matched line. A leaked credential in a CI log is
 *    leaked. We need to know *that* something matched, not *what*.
 *
 * ## Why a finding in an uncommittable file is not a failure
 *
 * This gate scans with `--no-git`, which reads the WORKING TREE rather than the git history. A
 * developer who has exported a provider key into `.env` — the documented way to use the live route
 * locally — therefore produces a correct detection of a real credential in a file that `.gitignore`
 * refuses and `git ls-files` reports as untracked. Exiting non-zero there is a false positive: the
 * gate's subject, as `.gitignore` states it, is "nothing under these patterns may ever be
 * committed", and git will not accept this file under any circumstances.
 *
 * The alternative is not an allowlist file. A `.gitleaks.toml` carrying only `[allowlist] paths`
 * REPLACES the default ruleset rather than extending it, so the gate passes because it is scanning
 * nothing — verified on 8.24.3 by planting a format-valid `openai-api-key` in a committable path
 * and watching the same command report `no leaks found`. That is fail-open on a secret gate, so it
 * is not an option.
 *
 * So the partition happens here, on gitleaks's own JSON report, and the list of excused paths is
 * read from git rather than written down:
 *
 *  - `git check-ignore --stdin` answers "would git accept this path?", and it is deliberately
 *    called WITHOUT `--no-index`, because a tracked file that matches an ignore pattern is still a
 *    tracked file — excusing it would be the dangerous direction.
 *  - `.gitignore` stays the single source of truth (AGENTS.md section 17). Nothing in this module
 *    repeats a path, so there is no second list to drift.
 *  - If git cannot be asked, the excused set is EMPTY, which is the strict reading: an unavailable
 *    oracle must not silently excuse findings.
 *  - Only the rule id and the path are ever printed. The report is written to the OS temp directory
 *    with `--redact` (verified: the `Secret` and `Match` fields are both redacted on disk) and is
 *    deleted before this function returns, on every path including the failure paths.
 */

export type GitleaksResult = { readonly ok: boolean; readonly detail: string }

/** One finding, reduced to the two fields this gate is allowed to print. */
export type GitleaksFinding = {
  readonly ruleId: string
  readonly file: string
}

/**
 * Split findings into the ones git would refuse and the ones it would accept.
 *
 * Pure, and separated from both subprocesses so the partition — the whole content of this gate's
 * only judgement — is testable without a binary and without a repository. `excused` is a predicate
 * rather than a list so that "git said nothing" (the empty set) and "git said these" cannot be
 * confused by a caller that forgot to handle one of them.
 *
 * @returns the findings that block, in the order gitleaks reported them.
 */
export const partitionFindings = (
  findings: readonly GitleaksFinding[],
  excused: (file: string) => boolean,
): readonly GitleaksFinding[] => findings.filter((finding) => !excused(finding.file))

/** One line per blocking finding, naming the rule and the path and nothing else (AGENTS.md section 13). */
export const describeFindings = (findings: readonly GitleaksFinding[]): string =>
  findings.map((finding) => `${finding.ruleId} in ${finding.file}`).join("; ")

/**
 * Where CI installs it, and what a local dev needs. Keep the two messages in one place.
 *
 * The step name is quoted exactly as it appears in `.github/workflows/ci.yml`, because this
 * message previously pointed at a step that did not exist: the `secrets` job used the
 * gitleaks ACTION, which installs nothing on the runner's PATH, and the `gate` job — the only
 * job that ran `bun run ci` and therefore the only job that ran this gate — had no gitleaks
 * at all. A developer who followed the old message found nothing. The action now runs in its
 * own named job (`secrets`), and the install step named here lives in `.github/actions/
 * setup-gitleaks` and is used by every job that runs `bun run ci`.
 *
 * `test/gates.test.ts` asserts both halves of that claim: that the action's default version is this
 * module's `GITLEAKS_VERSION`, and that every job running `bun run ci` uses the action. Without those
 * two assertions this comment is exactly the kind of claim that was wrong once already.
 */
export const GITLEAKS_MISSING_MESSAGE =
  "gitleaks is not installed, so G-4 did not run. Install it (see .github/workflows/ci.yml, " +
  "'Install gitleaks (G-4 subprocess gate needs the binary, not the action)', which runs " +
  ".github/actions/setup-gitleaks and pins the version) " +
  "and re-run. A gate that does not run is not a gate."

/** The version CI installs, so a local developer reproduces the scan rather than approximating it. */
export const GITLEAKS_VERSION = "8.24.3"

export const GITLEAKS_ARGS = ["detect", "--source", ".", "--no-git", "--redact", "--exit-code", "1"] as const

/**
 * The JSON report shape, as far as this gate reads it.
 *
 * `unknown` plus a guard, never a bare cast: the report is produced by a third-party binary and is
 * therefore untrusted input like any other, and AGENTS.md section 1 forbids trusting it.
 */
const reportFindings = (raw: string): readonly GitleaksFinding[] => {
  let payload: unknown
  try {
    payload = JSON.parse(raw) as unknown
  } catch {
    return []
  }
  if (!Array.isArray(payload)) return []
  const findings: GitleaksFinding[] = []
  for (const entry of payload) {
    if (typeof entry !== "object" || entry === null) continue
    const record = entry as Readonly<Record<string, unknown>>
    const ruleId = record["RuleID"]
    const file = record["File"]
    if (typeof ruleId !== "string") continue
    if (typeof file !== "string") continue
    findings.push({ ruleId, file: file.replaceAll("\\", "/") })
  }
  return findings
}

/**
 * The paths git would refuse to accept, asked of git rather than written down here.
 *
 * Without `--no-index`, deliberately: `git check-ignore` reports a TRACKED file as not ignored even
 * when it matches a pattern, and that is the correct answer for this gate. A secret in a file that
 * is already tracked is committable — amending it is normal work — so excusing it because a pattern
 * happens to match its name would be the one direction this gate must never fail open.
 *
 * @returns the excused paths, or an empty set when git could not be asked. Empty is the strict
 *   reading: an oracle that cannot answer must not excuse a finding.
 */
const excusedByGit = async (cwd: string, files: readonly string[]): Promise<ReadonlySet<string>> => {
  if (files.length === 0) return new Set<string>()
  const child = Bun.spawn(["git", "check-ignore", "--stdin"], {
    cwd,
    stdin: new Blob([files.join("\n")]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited])
  const excused = new Set<string>()
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim().replaceAll("\\", "/")
    if (trimmed.length > 0) excused.add(trimmed)
  }
  return excused
}

/**
 * Run the scan, then fail on the findings git would accept.
 *
 * The report file is the only place a matched secret could land, so it goes to the OS temp
 * directory with `--redact` on (which redacts the `Secret` and `Match` fields in the file, not only
 * in stdout) and it is removed in a `finally`, including when the scan itself failed.
 */
export const runGitleaks = async (cwd: string, exists: (binary: string) => boolean): Promise<GitleaksResult> => {
  if (!exists("gitleaks")) return { ok: false, detail: GITLEAKS_MISSING_MESSAGE }
  const reportPath = join(tmpdir(), `mizan-g4-${crypto.randomUUID()}.json`)
  const child = Bun.spawn(["gitleaks", ...GITLEAKS_ARGS, "--report-format", "json", "--report-path", reportPath], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  let findings: readonly GitleaksFinding[] = []
  try {
    const raw = await readFile(reportPath, "utf8")
    findings = reportFindings(raw)
  } catch {
    findings = []
  } finally {
    await rm(reportPath, { force: true })
  }

  // gitleaks exited non-zero and produced nothing readable: the only honest reading is that the scan
  // itself failed, which is a gate that did not run, not a clean tree.
  if (code !== 0 && findings.length === 0) {
    return { ok: false, detail: `gitleaks exited ${code} and wrote no readable report: ${(stderr || stdout).trim()}` }
  }

  const excused = await excusedByGit(cwd, findings.map((finding) => finding.file))
  const blocking = partitionFindings(findings, (file) => excused.has(file))
  if (blocking.length > 0) {
    return { ok: false, detail: `secret(s) found in committable paths: ${describeFindings(blocking)}` }
  }
  if (findings.length > 0) {
    return { ok: true, detail: `no secret in any committable path (${findings.length} finding(s) were in files git ignores)` }
  }
  return { ok: true, detail: stdout.trim() || "no findings" }
}

export * as G4 from "./g4-gitleaks.ts"
