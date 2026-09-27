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
 */

export type GitleaksResult = { readonly ok: boolean; readonly detail: string }

/**
 * Where CI installs it, and what a local dev needs. Keep the two messages in one place.
 *
 * The step name is quoted exactly as it appears in `.github/workflows/ci.yml`, because this
 * message previously pointed at a step that did not exist: the `secrets` job used the
 * gitleaks ACTION, which installs nothing on the runner's PATH, and the `gate` job — the only
 * job that runs `bun run ci` and therefore the only job that runs this gate — had no gitleaks
 * at all. A developer who followed the old message found nothing. The action now runs in its
 * own named job (`secrets`) and the install step is named in the `gate` job.
 */
export const GITLEAKS_MISSING_MESSAGE =
  "gitleaks is not installed, so G-4 did not run. Install it (see .github/workflows/ci.yml, " +
  "'Install gitleaks (G-4 subprocess gate needs the binary, not the action)', which pins the version) " +
  "and re-run. A gate that does not run is not a gate."

/** The version CI installs, so a local developer reproduces the scan rather than approximating it. */
export const GITLEAKS_VERSION = "8.24.3"

export const GITLEAKS_ARGS = ["detect", "--source", ".", "--no-git", "--redact", "--exit-code", "1"] as const

export const runGitleaks = async (cwd: string, exists: (binary: string) => boolean): Promise<GitleaksResult> => {
  if (!exists("gitleaks")) return { ok: false, detail: GITLEAKS_MISSING_MESSAGE }
  const child = Bun.spawn(["gitleaks", ...GITLEAKS_ARGS], { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code === 0) return { ok: true, detail: stdout.trim() || "no findings" }
  return { ok: false, detail: `gitleaks exited ${code}: ${(stderr || stdout).trim()}` }
}

export * as G4 from "./g4-gitleaks.ts"
