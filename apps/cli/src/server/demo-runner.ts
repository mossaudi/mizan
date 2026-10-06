import { existsSync } from "node:fs"
import { join } from "node:path"
import { err, ok, processQuestion, type Result } from "@mizan/core"
import { ENV_API_KEY, ENV_PROVIDER } from "../provider-config.ts"

export const DEMO_TIMEOUT_MS = 120_000
export const ASK_TIMEOUT_MS = 180_000
export const CORPUS_RELATIVE = "data/corpus.db"

const slot = { active: false }

export const tryAcquireDemoSlot = (): boolean => {
  if (slot.active) return false
  slot.active = true
  return true
}

export const releaseDemoSlot = (): void => {
  slot.active = false
}

export type RunnerFailure = {
  readonly kind: "busy" | "invalid_question" | "live_route_unavailable" | "spawn_failed" | "timeout" | "nonzero_exit"
  readonly detail: string
}

type SpawnOutcome = {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly timedOut: boolean
}

const spawnCapture = async (root: string, cmd: readonly string[], timeoutMs: number): Promise<SpawnOutcome> => {
  const proc = Bun.spawn({
    cmd: [...cmd],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  let timedOut = false
  const killTimer = setTimeout(() => {
    if (proc.exitCode === null && proc.signalCode === null) {
      timedOut = true
      proc.kill()
    }
  }, timeoutMs)
  const stdoutPromise = new Response(proc.stdout).text()
  const stderrPromise = new Response(proc.stderr).text()
  const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited])
  clearTimeout(killTimer)
  return { stdout, stderr, exitCode, timedOut }
}

const spawnOutcomeToResult = (outcome: SpawnOutcome): Result<string, RunnerFailure> => {
  if (outcome.timedOut) {
    return err({ kind: "timeout", detail: "the run did not finish inside the server's time budget." })
  }
  if (outcome.exitCode !== 0) {
    const detail = outcome.stderr.trim()
    return err({ kind: "nonzero_exit", detail: detail.length > 0 ? detail : `the run exited ${outcome.exitCode}.` })
  }
  return ok(outcome.stdout)
}

export const runDemoSubprocess = async (root: string): Promise<Result<string, RunnerFailure>> => {
  if (!tryAcquireDemoSlot()) {
    return err({ kind: "busy", detail: "a run is already in progress on this server; wait for it to finish and try again." })
  }
  try {
    const outcome = await spawnCapture(root, ["bun", "run", "demo"], DEMO_TIMEOUT_MS)
    return spawnOutcomeToResult(outcome)
  } catch (cause) {
    return err({ kind: "spawn_failed", detail: cause instanceof Error ? cause.message : "spawn failed" })
  } finally {
    releaseDemoSlot()
  }
}

export type LiveRouteStatus = {
  readonly available: boolean
  readonly hasApiKey: boolean
  readonly hasCorpus: boolean
  readonly hasAttestation: boolean
  readonly providerMode: string | null
}

export const liveRouteStatus = (root: string): LiveRouteStatus => {
  const key = process.env[ENV_API_KEY]
  const hasApiKey = key !== undefined && key.trim().length > 0
  const hasCorpus = existsSync(join(root, CORPUS_RELATIVE))
  const hasAttestation = existsSync(join(root, "attestation.json"))
  const providerMode = process.env[ENV_PROVIDER] ?? null
  const available = hasApiKey && hasCorpus && hasAttestation && providerMode !== "scripted"
  return { available, hasApiKey, hasCorpus, hasAttestation, providerMode }
}

export const liveAskAvailable = (root: string): boolean => liveRouteStatus(root).available

export const runAskForRoot = async (root: string, question: string): Promise<Result<string, RunnerFailure>> => {
  const checked = processQuestion(question)
  if (!checked.ok) {
    return err({ kind: "invalid_question", detail: checked.error })
  }
  const status = liveRouteStatus(root)
  if (!status.available) {
    const missing: string[] = []
    if (!status.hasApiKey) missing.push("MIZAN_LLM_API_KEY")
    if (!status.hasCorpus) missing.push(CORPUS_RELATIVE)
    if (!status.hasAttestation) missing.push("attestation.json")
    if (status.providerMode === "scripted") missing.push("MIZAN_PROVIDER=scripted")
    return err({
      kind: "live_route_unavailable",
      detail: `no live model route is configured on this server (missing: ${missing.join(", ")}).`,
    })
  }
  if (!tryAcquireDemoSlot()) {
    return err({ kind: "busy", detail: "a run is already in progress on this server; wait for it to finish and try again." })
  }
  try {
    const outcome = await spawnCapture(root, ["bun", "run", "apps/cli/src/main.ts", question], ASK_TIMEOUT_MS)
    return spawnOutcomeToResult(outcome)
  } catch (cause) {
    return err({ kind: "spawn_failed", detail: cause instanceof Error ? cause.message : "spawn failed" })
  } finally {
    releaseDemoSlot()
  }
}

export * as DemoRunner from "./demo-runner.ts"
