#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describeDecodeFailure, isOk } from "@mizan/core"
import { decodeFixture, renderPage } from "../src/page.ts"

/**
 * Regenerate `apps/web/index.html` from the committed fixture.
 *
 * ## Why the page is built rather than hand-written
 *
 * ADR-C3: the page is a build-time render of a committed fixture, so the badge strings cannot
 * drift from `badgeFor` and a fixture edit cannot be half-applied by a hand. `test/page.test.ts`
 * regenerates in memory and compares byte for byte, which is what makes a stale committed
 * `index.html` a red build rather than something a reviewer has to notice.
 *
 * ## Where it refuses
 *
 * Unreadable file, unparseable JSON, fixture that fails its schema — each returns 1 and writes
 * nothing. The fixture is decoded at the boundary before anything is rendered, so a malformed
 * committed file fails the build here rather than the browser later (ADR-C3). There is no path
 * from a fixture this program could not read to a page.
 */

const PACKAGE_DIR = join(import.meta.dir, "..")

const describeCause = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

/** Read the fixture as raw text, or explain why we cannot. */
const readFixture = (): string | null => {
  const path = join(PACKAGE_DIR, "fixtures", "page.json")
  try {
    return readFileSync(path, "utf8")
  } catch (cause) {
    console.error(`the page cannot be built: ${path} could not be read (${describeCause(cause)})`)
    return null
  }
}

/** Parse the fixture, or explain why we cannot. `JSON.parse` is followed immediately by a schema. */
const parseFixture = (raw: string): unknown | null => {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    console.error(`the page cannot be built: fixtures/page.json is not valid JSON (${describeCause(cause)})`)
    return null
  }
}

const main = (): number => {
  const raw = readFixture()
  if (raw === null) return 1

  const parsed = parseFixture(raw)
  if (parsed === null) return 1

  const decoded = decodeFixture(parsed)
  if (!isOk(decoded)) {
    console.error(`the page cannot be built: ${describeDecodeFailure(decoded.error)}`)
    return 1
  }

  const output = join(PACKAGE_DIR, "index.html")
  writeFileSync(output, renderPage(decoded.value), "utf8")
  console.log(`wrote ${output}`)
  return 0
}

process.exitCode = main()
