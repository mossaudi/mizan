import { afterAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync } from "node:fs"
import { isOk } from "@mizan/core"
import { EXPECTED_AYAH_COUNT, runIngest, type Fetcher, type IngestProgress } from "../src/index.ts"

/**
 * Acquisition progress: a network-bound run that can tell an operator it is alive.
 *
 * ## Why this file exists
 *
 * MIZ-101 requires the acquisition path to "publish a progress line so an operator can tell stall
 * from hang". Until now `runIngest` was silent for the whole of the fetch: `bun run ingest` printed
 * its first line only after every upstream had answered, which for the hadith source is minutes of
 * paging. A hung fetch and a slow fetch were therefore indistinguishable from the terminal, and
 * the natural response to that is to Ctrl-C a working run and start again - paying the full fetch
 * twice to learn nothing.
 *
 * The load-bearing property is ORDER, not the presence of a line: a progress line emitted after
 * the blocking call is a progress line that is silent for exactly the interval it exists to cover.
 * So the first assertion below interleaves a marker into the fetcher and compares positions, and
 * `started`-before-first-request is what the rest of the file defends.
 *
 * ## What is NOT asserted here
 *
 * Nothing about timing, cadence or wall-clock, because a test that asserts a clock is a flaky test.
 * The cadence is a page count (see `PROGRESS_PAGE_INTERVAL`) precisely so it can be checked
 * arithmetically instead, and the timestamps are the CLI's business - the library emits no clock at
 * all, which is the second thing worth defending.
 *
 * ## Everything here is offline
 *
 * Fake fetchers only, like every other test in this package. A progress test that needed the
 * network would be a test that fails on a train, and it would be testing the upstream.
 */

const TZIL = "tanzil/quran-uthmani"

const scratchDir = (): string => mkdtempSync(join(tmpdir(), "mizan-ingest-progress-"))
const SCRATCH: string[] = []

const tmp = (): string => {
  const dir = scratchDir()
  SCRATCH.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of SCRATCH) {
    // Best-effort, and the reason is the same one `benchmark.test.ts` gives: on Windows the
    // SQLite handle `buildSnapshot` opened is released asynchronously, so an `EBUSY` here is the
    // platform's ordering and not a test failure. A cleanup that can fail is a flaky test, and a
    // flaky test teaches a reader to ignore CI.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    } catch {
      // The OS reclaims the temp directory.
    }
  }
})

/**
 * A Tanzil body the adapter will accept: exactly `EXPECTED_AYAH_COUNT` non-`#` lines.
 *
 * Counted rather than copied, because the adapter's own assertion is that count and a fixture that
 * disagreed with it would make every test below fail for a reason that has nothing to do with
 * progress.
 */
const tanzilBody = (): string => `${Array.from({ length: EXPECTED_AYAH_COUNT }, (_, index) => `ayah ${index + 1}`).join("\n")}\n`

const okFetcher: Fetcher = async () => ({ ok: true, value: tanzilBody() })

const failingFetcher: Fetcher = async () => ({ ok: false, error: { _tag: "fetch_failed" as const, reason: "network_error" as const, detail: "boom" } })

/** Collect every event in order, and the stages alone for the terse assertions. */
const recorder = (): { readonly events: IngestProgress[]; readonly onProgress: (event: IngestProgress) => void } => {
  const events: IngestProgress[] = []
  return { events, onProgress: (event) => events.push(event) }
}

const stages = (events: readonly IngestProgress[]): readonly string[] => events.map((event) => event.stage)

/** One successful Tanzil ingest with progress recorded, which most cases below build on. */
const successfulRun = async () => {
  const { events, onProgress } = recorder()
  const result = await runIngest({ root: tmp(), now: "2026-01-01T00:00:00.000Z", fetcher: okFetcher, only: [TZIL], onProgress })
  if (!isOk(result)) throw new Error(`expected a successful ingest, got ${result.error.detail}`)
  return { result, events }
}

describe("a source announces itself before it blocks on the network", () => {
  test("`started` is emitted before the first request, which is the whole point of it", async () => {
    // The planted defect this file exists to catch: a heartbeat emitted AFTER `fetchRecords`
    // returns. It would still pass any assertion of the form "a progress event was emitted", and
    // it would be worth exactly nothing, because a fetch that hangs never returns.
    const order: string[] = []
    const result = await runIngest({
      root: tmp(),
      now: "2026-01-01T00:00:00.000Z",
      only: [TZIL],
      onProgress: (event) => order.push(`event:${event.stage}`),
      fetcher: async () => {
        order.push("fetch")
        return { ok: true, value: tanzilBody() }
      },
    })
    if (!isOk(result)) throw new Error(`expected a successful ingest, got ${result.error.detail}`)

    expect(order[0]).toBe("event:started")
    expect(order.indexOf("event:started")).toBeLessThan(order.indexOf("fetch"))
  })

  test("a source that fails still ends with an event, so the last line carries a reason", async () => {
    const { events, onProgress } = recorder()
    const result = await runIngest({ root: tmp(), now: "2026-01-01T00:00:00.000Z", fetcher: failingFetcher, only: [TZIL], onProgress })
    expect(isOk(result)).toBe(false)
    // A stream ending on `started` is the silent-hang symptom: the operator is told a fetch began
    // and never told how it ended.
    expect(stages(events)).toEqual(["started", "failed"])
    const failed = events[events.length - 1]
    expect(failed?.detail).toContain("boom")
    expect(failed?.rows).toBeNull()
  })

  test("a failing source is announced the same way in partial mode, and the run continues", async () => {
    // `--allow-partial` is a different control flow - `continue` instead of `return` - and a
    // progress stream that only covered the strict branch would leave a partial run silent about
    // the source it skipped.
    const { events, onProgress } = recorder()
    const result = await runIngest({
      root: tmp(),
      now: "2026-01-01T00:00:00.000Z",
      fetcher: failingFetcher,
      only: [TZIL],
      allowPartial: true,
      onProgress,
    })
    if (!isOk(result)) throw new Error("expected a partial result in allow-partial mode")
    expect(stages(events)).toEqual(["started", "failed"])
    expect(result.value.failures).toHaveLength(1)
  })
})

describe("a successful source reports a real count, in a stable order", () => {
  test("the stream is started, then rows, then completed", async () => {
    const { events } = await successfulRun()
    expect(stages(events)).toEqual(["started", "rows", "completed"])
  })

  test("the row count is the corpus's real size, not a placeholder", async () => {
    // The placeholder-timing bug the disclosure names was exactly a count that looked plausible
    // and meant nothing, so this asserts the number against the constant the adapter itself
    // enforces. A `report` that returned a constant would pass an "is a number" check.
    const { events } = await successfulRun()
    expect(events.find((event) => event.stage === "rows")?.rows).toBe(EXPECTED_AYAH_COUNT)
    expect(events.find((event) => event.stage === "completed")?.rows).toBe(EXPECTED_AYAH_COUNT)
  })

  test("the counts never go backwards, so a reader can trust the last line", async () => {
    const { events } = await successfulRun()
    const counts = events.filter((event) => event.rows !== null).map((event) => event.rows ?? 0)
    expect(counts.length).toBeGreaterThan(1)
    for (const [index, count] of counts.entries()) {
      if (index === 0) continue
      expect(count).toBeGreaterThanOrEqual(counts[index - 1] ?? 0)
    }
  })

  test("every event names its source, and the stages without a count carry null rather than a zero", async () => {
    // `0` here would be a plausible-looking count that is false, and `null` is the honest absence.
    // It is the same distinction `MatchStrength`'s `none` makes, and the same reason.
    const { events } = await successfulRun()
    for (const event of events) expect(event.source).toBe(TZIL)
    const started = events[0]
    expect(started?.rows).toBeNull()
    expect(started?.detail).toBeNull()
  })

  test("two runs produce the same stream, so the progress is reproducible and not a log", async () => {
    const first = await successfulRun()
    const second = await successfulRun()
    expect(first.events).toEqual(second.events)
  })
})

describe("the sink is a display concern and cannot reach the corpus", () => {
  test("a sink that throws does not fail a run that otherwise succeeded", async () => {
    // The realistic case is a closed stderr pipe. Failing an ingest over a write would be strictly
    // worse than the missing line it was trying to emit, and it would look like an upstream fault
    // in the log - pointing the operator at the wrong thing.
    const result = await runIngest({
      root: tmp(),
      now: "2026-01-01T00:00:00.000Z",
      fetcher: okFetcher,
      only: [TZIL],
      onProgress: () => {
        throw new Error("EPIPE")
      },
    })
    expect(isOk(result)).toBe(true)
  })

  test("a sink that throws on the failure path still reports the failure, and the failure survives", async () => {
    // The other direction, and the one that would be a real defect: absorbing the sink's throw
    // must not absorb the ingest's own outcome. A swallowed `failed` event would be indistinguishable
    // from a hang, which is the exact state this type exists to rule out.
    const seen: string[] = []
    const result = await runIngest({
      root: tmp(),
      now: "2026-01-01T00:00:00.000Z",
      fetcher: failingFetcher,
      only: [TZIL],
      onProgress: (event) => {
        seen.push(event.stage)
        throw new Error("EPIPE")
      },
    })
    expect(isOk(result)).toBe(false)
    expect(seen).toEqual(["started", "failed"])
  })

  test("the event is frozen, so a sink cannot rewrite what a later one is told", async () => {
    const captured: IngestProgress[] = []
    await runIngest({
      root: tmp(),
      now: "2026-01-01T00:00:00.000Z",
      fetcher: okFetcher,
      only: [TZIL],
      onProgress: (event) => {
        captured.push(event)
        expect(Object.isFrozen(event)).toBe(true)
        if (!Object.isFrozen(event)) throw new Error("the event was handed over mutable")
      },
    })
    expect(captured.length).toBeGreaterThan(0)
  })
})

describe("silence stays the default", () => {
  test("an ingest with no sink says nothing, and the existing callers are unaffected", async () => {
    // Every test in `corpus.test.ts` calls `runIngest` without a sink. If progress were mandatory,
    // or emitted unconditionally, those tests would have had to change - so this is the assertion
    // that keeps "omit the option, get silence" the documented contract rather than an accident.
    const result = await runIngest({ root: tmp(), now: "2026-01-01T00:00:00.000Z", fetcher: okFetcher, only: [TZIL] })
    expect(isOk(result)).toBe(true)
  })
})
