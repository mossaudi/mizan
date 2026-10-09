import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, isAbsolute, join, relative } from "node:path"
import { GITLEAKS_BINARY, resolveScanner, type ScannerResolution } from "./g4-scanner-resolution.ts"

/**
 * G-4 — gitleaks, run as a subprocess. Fail closed if the binary is missing.
 *
 * This is the only gate that is not a pure function of the source tree, because secret
 * scanning is a solved problem and reimplementing it would be worse. Four decisions worth
 * naming:
 *
 *  - **Fail closed on a missing binary.** A gate that skips when its tool is absent reports
 *    "pass" for "did not run", which is the exact failure mode AGENTS.md section 14 exists to
 *    prevent. CI installs gitleaks explicitly; a developer without it gets a message telling
 *    them how to install it, not a green tick. The same reading governs the SECOND subprocess:
 *    if `git` cannot be asked, nothing is excused, and neither subprocess is allowed to throw out
 *    of a function whose declared return type is a verdict. `Bun.spawn` throws ENOENT
 *    *synchronously* when an executable does not resolve, so "the binary exists" and "the binary
 *    starts" are different claims and both have to be asked.
 *  - **A scan is a report, not an exit code.** `code === 0 && no findings` cannot tell "a real
 *    scan found nothing" from "something exited 0 and wrote nothing" — a stub, a broken shim, a
 *    partial install, or a name that resolves to the wrong target. So the JSON report must EXIST
 *    to count as a scan: a genuine clean run writes `[]`, and its absence means the gate did not
 *    run. Requiring the artefact rather than the exit code is what makes this a scan rather than
 *    an opinion. Note what this rule CANNOT do, because the planted scanner exploits exactly that:
 *    `[]` plus exit 0 is indistinguishable from a real clean run, so report shape is not where the
 *    discrimination lives.
 *  - **The tree under audit may not supply the scanner.** The gate resolves `gitleaks` itself, to
 *    an absolute path, through `./g4-scanner-resolution.ts`, and refuses any resolution at or under
 *    the scanned tree or inside a `node_modules/.bin`. That is what closes the hole the previous
 *    bullet cannot: under `bun run`, `node_modules/.bin` comes FIRST on PATH, so a planted
 *    `gitleaks` there shadows a real install, chooses both the report file and the exit code, and
 *    passes this gate over a committable secret. The executable is then spawned BY ABSOLUTE PATH,
 *    so the resolution cannot be re-decided between the check and the exec.
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
 *  - A scan with no report is a scan that did not happen, whatever its exit code said. See the
 *    second bullet above; the report's existence is the evidence, not the process's mood.
 *  - A candidate scanner that came from inside the tree is named in the verdict, whether it was
 *    passed over in favour of a real install or was the only candidate on PATH. A green run that
 *    silently stepped over a planted auditor is how the next planted auditor goes unnoticed.
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
 * Where CI installs it, and what a local dev needs. Keep the messages in one place.
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

/**
 * How a refused candidate is NAMED in a gate verdict: relative to the tree under audit when it is
 * inside it, otherwise by file name alone.
 *
 * ## Why the absolute path is not printed
 *
 * Because `probeOnDisk` resolves to an absolute path, so printing one writes the OS account name —
 * `C:\Users\Saudi\...` — into a CI log, and AGENTS.md section 13 forbids PII in a log line whatever
 * produced it. A green CI run is the most public log surface this program has, and a path is the one
 * thing in a gate message that is certain to contain a user name.
 *
 * ## Why the tree-relative form is kept rather than reducing everything to a basename
 *
 * Because the reader's next action is to go and look at the file, and `node_modules/.bin/gitleaks.exe`
 * is the evidence while `gitleaks.exe` is a word. A candidate under the tree is therefore named by its
 * path from the tree's root; one outside it keeps only its name, since its directory is the tool cache's
 * business and its parent directories are exactly what carries the account name. The full absolute paths
 * stay in `resolution.ignored`, which is the evidence a reader on the machine can print for themselves.
 */
export const candidateLabels = (paths: readonly string[], root: string): string =>
  paths
    .map((path) => {
      const inside = relative(root, path)
      if (inside.length === 0 || inside.startsWith("..") || isAbsolute(inside)) return basename(path)
      return inside
    })
    .join(", ")

/**
 * The candidate scanner came from the tree under audit, so it was never run.
 *
 * A function rather than a constant because the paths are the evidence: a reader who is told only
 * "gitleaks is not installed" will go and install it, and a reader who is told the only candidate
 * is `node_modules/.bin/gitleaks` will go and look at that file, which is the point.
 */
export const UNTRUSTED_SCANNER_MESSAGE = (paths: readonly string[], root: string): string =>
  `G-4 did not run: the only ${GITLEAKS_BINARY} on PATH (${candidateLabels(paths, root)}) is inside the ` +
  "tree under audit or in a node_modules/.bin directory, so a file this repository can write supplied the " +
  "tool that audits it. A planted scanner writes [] and exits 0, which is indistinguishable from a clean " +
  "scan. Remove it, or install gitleaks outside the repository (see .github/actions/setup-gitleaks)."

/** The version CI installs, so a local developer reproduces the scan rather than approximating it. */
export const GITLEAKS_VERSION = "8.24.3"

export const GITLEAKS_ARGS = ["detect", "--source", ".", "--no-git", "--redact", "--exit-code", "1"] as const

/**
 * The JSON report shape, as far as this gate reads it.
 *
 * `unknown` plus a guard, never a bare cast: the report is produced by a third-party binary and is
 * therefore untrusted input like any other, and AGENTS.md section 1 forbids trusting it.
 *
 * `null` means this file is not a report at all, which is a different fact from "a report with no
 * findings in it". Collapsing the two is the fail-open below: a truncated file, a stub, or a shim
 * pointing at the wrong target all produce something that is not an array, and an empty array is
 * what a genuinely clean tree produces. Only the second of those is allowed to pass.
 */
const reportFindings = (raw: string): readonly GitleaksFinding[] | null => {
  let payload: unknown
  try {
    payload = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!Array.isArray(payload)) return null
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
 * How this module asks git, injected rather than reached for.
 *
 * `git` is a dependency like any other, and this gate already injects its other one (`exists`) for
 * exactly the reason this shape exists: the case a gate has to be honest about is the one where a
 * tool is ABSENT, and an absent tool cannot be arranged by a test that calls the real subprocess.
 */
export type GitOracle = (cwd: string, files: readonly string[]) => Promise<string>

/** `git check-ignore --stdin`, the real query, isolated so it is the only place `git` is named. */
const askGitCheckIgnore: GitOracle = async (cwd, files) => {
  const child = Bun.spawn(["git", "check-ignore", "--stdin"], {
    cwd,
    stdin: new Blob([files.join("\n")]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout] = await Promise.all([new Response(child.stdout).text(), child.exited])
  return stdout
}

/**
 * The paths git would refuse to accept, asked of git rather than written down here.
 *
 * Without `--no-index`, deliberately: `git check-ignore` reports a TRACKED file as not ignored even
 * when it matches a pattern, and that is the correct answer for this gate. A secret in a file that
 * is already tracked is committable — amending it is normal work — so excusing it because a pattern
 * happens to match its name would be the one direction this gate must never fail open.
 *
 * @param ask the oracle. Defaults to the real `git`; `test/gates.test.ts` substitutes one that
 *   throws, which is the only way to reach the branch below on a machine that happens to have git.
 * @returns the excused paths, or an empty set when git could not be asked. Empty is the strict
 *   reading: an oracle that cannot answer must not excuse a finding.
 */
export const excusedByGit = async (
  cwd: string,
  files: readonly string[],
  ask: GitOracle = askGitCheckIgnore,
): Promise<ReadonlySet<string>> => {
  if (files.length === 0) return new Set<string>()
  let stdout: string
  try {
    stdout = await ask(cwd, files)
  } catch {
    // The oracle is unavailable, so nothing is excused — the strict reading, and the one the module
    // header above already promises. `Bun.spawn` throws ENOENT synchronously when `git` does not
    // resolve, and this runs on every path that HAS findings, so an unguarded query turned the
    // documented "empty set" into an unhandled exception out of a function whose declared return
    // type is `Promise<ReadonlySet<string>>`. A security gate has to end in a verdict, not a crash,
    // and "no oracle" must never read as "excused".
    return new Set<string>()
  }
  const excused = new Set<string>()
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim().replaceAll("\\", "/")
    if (trimmed.length > 0) excused.add(trimmed)
  }
  return excused
}

/**
 * What a finished scan can tell us, and the injected way of asking for one.
 *
 * `null` means the process could not be STARTED — the reading that matters here, because
 * `Bun.spawn` throws ENOENT synchronously for an executable that does not resolve, so "present on
 * PATH" is not "runs". Injecting the spawn makes that branch assertable on a machine with or
 * without gitleaks installed, which is the same reason `GitOracle` and `ScannerResolver` are
 * injected: the case a gate has to be honest about is the one where a tool is absent, and an
 * absent tool cannot be arranged by a test that calls the real subprocess.
 *
 * `binary` is an ABSOLUTE path, resolved by the caller, and a bare name here would reopen the
 * hole the resolution exists to close — the exec would be free to resolve it again, and
 * differently. `reportPath` is handed to the spawn rather than computed by the caller so that the
 * report is read from exactly the path the scan was told to write — one path, not two that can drift.
 */
export type GitleaksScan = {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export type GitleaksSpawn = (cwd: string, binary: string, reportPath: string) => Promise<GitleaksScan | null>

/** How the gate finds its scanner, injected so the planted-binary branches are reachable with no binary present. */
export type ScannerResolver = (cwd: string) => ScannerResolution

/** The gate's own resolution: PATH, read once, with the tree rule applied. */
const resolveGitleaks: ScannerResolver = (cwd) => resolveScanner(GITLEAKS_BINARY, cwd, process.env["PATH"] ?? "")

/**
 * The scanner resolved and still would not start, which is a different sentence from "not installed".
 *
 * Deliberately NOT prefixed with `GITLEAKS_MISSING_MESSAGE`: telling someone to install a tool that
 * is already installed is the kind of wrong instruction that costs a half hour, and this is the one
 * branch where the binary is demonstrably present.
 */
export const UNSTARTABLE_SCANNER_MESSAGE = (binary: string, root: string): string =>
  `G-4 did not run: ${candidateLabels([binary], root)} resolved but the process could not be started. A ` +
  "present file that will not start is not a scanner (wrong architecture, or a shim with no interpreter). " +
  "Point PATH at a working gitleaks and re-run."

/** The real scan of a resolved executable. */
const spawnScanner: GitleaksSpawn = async (cwd, binary, reportPath) => {
  try {
    const child = Bun.spawn([binary, ...GITLEAKS_ARGS, "--report-format", "json", "--report-path", reportPath], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { code, stdout, stderr }
  } catch {
    return null
  }
}

/**
 * Run the scan, then fail on the findings git would accept.
 *
 * The report file is the only place a matched secret could land, so it goes to the OS temp
 * directory with `--redact` on (which redacts the `Secret` and `Match` fields in the file, not only
 * in stdout) and it is removed in a `finally`, including when the scan itself failed.
 *
 * Every environmental input ends in a verdict, and the ORDER is the point: resolve, THEN spawn.
 * Nothing is executed until the resolution has been accepted, so a candidate from the tree under
 * audit costs a name in the message and never a process. A binary that cannot be started is a gate
 * that did not run, and a report that is missing or is not a report is a scan that did not happen —
 * never a clean tree, because the alternative is the fail-open this gate exists to refuse.
 *
 * All three subprocess seams are injectable for the same single reason: every one of them is an
 * input this gate has to be honest about being absent, and none of those absences can be arranged
 * on demand by a test that calls the real thing. The defaults are the real tools.
 */
export const runGitleaks = async (
  cwd: string,
  resolve: ScannerResolver = resolveGitleaks,
  spawn: GitleaksSpawn = spawnScanner,
  ask: GitOracle = askGitCheckIgnore,
): Promise<GitleaksResult> => {
  const resolution = resolve(cwd)
  if (resolution.kind === "absent") return { ok: false, detail: GITLEAKS_MISSING_MESSAGE }
  if (resolution.kind === "untrusted_only") {
    return { ok: false, detail: UNTRUSTED_SCANNER_MESSAGE(resolution.paths, cwd) }
  }

  const reportPath = join(tmpdir(), `mizan-g4-${crypto.randomUUID()}.json`)
  const scan = await spawn(cwd, resolution.path, reportPath)
  if (scan === null) {
    await rm(reportPath, { force: true })
    return { ok: false, detail: UNSTARTABLE_SCANNER_MESSAGE(resolution.path, cwd) }
  }

  // `null` covers both "no report file" and "a file that is not a report". Either way nothing was
  // scanned, whatever the exit code claims. This is the half of the impostor problem that report
  // shape CAN settle: a stub which exits 0 while writing nothing, or writing something that is not a
  // report, is rejected here. It is deliberately not claimed to settle the rest — `[]` plus exit 0 is
  // exactly what a genuine clean run writes, so the planted scanner is caught by resolution (above),
  // not here, and pretending otherwise would be the fail-open this gate refuses.
  let findings: readonly GitleaksFinding[] | null = null
  try {
    findings = reportFindings(await readFile(reportPath, "utf8"))
  } catch {
    findings = null
  } finally {
    await rm(reportPath, { force: true })
  }

  if (findings === null) {
    return { ok: false, detail: `gitleaks exited ${scan.code} and wrote no readable report, so no file was scanned` }
  }

  // gitleaks exited non-zero and reported nothing: the only honest reading is that the scan itself
  // failed, which is a gate that did not run, not a clean tree.
  if (scan.code !== 0 && findings.length === 0) {
    return { ok: false, detail: `gitleaks exited ${scan.code} and reported no findings: ${(scan.stderr || scan.stdout).trim()}` }
  }

  const excused = await excusedByGit(cwd, findings.map((finding) => finding.file), ask)
  const blocking = partitionFindings(findings, (file) => excused.has(file))
  if (blocking.length > 0) {
    return { ok: false, detail: `secret(s) found in committable paths: ${describeFindings(blocking)}` }
  }
  const verdict = findings.length > 0
    ? `no secret in any committable path (${findings.length} finding(s) were in files git ignores)`
    : scan.stdout.trim() || "no findings"
  // A green run that silently stepped over a planted auditor teaches the next one that the spot is
  // free, so a squatter that lost the lookup is named here too — by FILE NAME only. `probeOnDisk`
  // returns absolute paths, so printing one writes the OS account name into a CI log, and AGENTS.md
  // section 13 forbids PII in a log line whatever produced it. The full paths stay in `resolution.ignored`,
  // which is the evidence a reader with the machine in front of them can print themselves.
  return {
    ok: true,
    detail: resolution.ignored.length === 0 ? verdict : `${verdict} (refused to run ${candidateLabels(resolution.ignored, cwd)})`,
  }
}

export * as G4 from "./g4-gitleaks.ts"
