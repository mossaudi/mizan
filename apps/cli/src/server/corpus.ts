import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import type { Database } from "bun:sqlite"
import { isErr, isOk, err, ok, type Result } from "@mizan/core"
import { attestSnapshot, describeAttestationProblem, openSnapshot, readSnapshotMeta } from "@mizan/corpus"
import { buildDemoCorpus, describeDemoCorpusFailure, type DemoCorpus } from "../demo-corpus.ts"

/**
 * The corpus the web playground computes verdicts against.
 *
 * ## Why there are two kinds and the page has to say which
 *
 * The repository ships two corpora and they are not the same artefact. `data/corpus.db` is the
 * attested snapshot — 27,234 records across six collections — and it is what `bun run ask` verifies
 * against. `data/eval/demo-anchors.json` is a handful of committed anchors that `bun run demo`
 * rebuilds into a temporary database so the demo runs on a laptop with no 83 MB file present.
 *
 * A demo server that labelled the anchor corpus "27,234 records" would be making the exact claim
 * this project exists to falsify, so `kind` is carried all the way to the screen and the record
 * count beside it is the count of the corpus actually open. `searchAllCollections` widens a search
 * across whatever is open, and over four anchor records "all collections" is a true statement about
 * four records.
 *
 * ## Why an attestation mismatch is a refusal and not a fallback
 *
 * The three states are deliberately different, because AGENTS.md section 16 gives them different
 * surfaces:
 *
 *  - no `data/corpus.db` → the anchor corpus. Nothing is wrong; the large artefact is simply not
 *    present, and the demo contract is that it need not be.
 *  - `data/corpus.db` present and attested → the snapshot. The normal case.
 *  - `data/corpus.db` present and NOT attested → `integrity_error`, and the page shows it.
 *
 * The tempting third behaviour is "fall back to the anchors so the page still works". That would be
 * a corpus swap performed silently by a failure, which is the shape of every provenance bug this
 * repository refuses: the reader would see ordinary verdicts and have no way to know they were
 * computed against a different corpus than the one that was on disk. Refuse instead.
 */
export type ServerCorpus = {
  readonly db: Database
  readonly dbPath: string
  /** In full, because a truncated fingerprint is not checkable. */
  readonly snapshotHash: string
  readonly recordCount: number
  readonly collectionCounts: Readonly<Record<string, number>>
  readonly kind: "snapshot" | "anchors"
  readonly close: () => void
}

/**
 * Everything that can stop the playground having a corpus.
 *
 * A tagged union, and not a bare `string`, for the reason `DemoCorpusFailure` gives: a message
 * cannot carry the difference between "absent, and that is fine" and "present and untrustworthy",
 * and a caller that pattern-matches on English turns an honest state into a wrong one after a
 * reword.
 */
export type ServerCorpusFailure =
  | { readonly _tag: "integrity_error"; readonly detail: string }
  | { readonly _tag: "unusable"; readonly detail: string }
  | { readonly _tag: "anchors_failed"; readonly detail: string }

/** The committed attestation's path, relative to the repository root. */
export const ATTESTATION_RELATIVE = "attestation.json"

/**
 * Open the attested snapshot, or name why it cannot be opened.
 *
 * Every step that can throw is wrapped, because `bun:sqlite` opens lazily: a file that exists and
 * is not a database opens without complaint and raises on the first query. That escape would
 * otherwise leave this function and print a stack trace for a condition the vocabulary now names —
 * and this runs at server start, so it would take the whole page down rather than one card.
 */
const openSnapshotCorpus = async (root: string): Promise<Result<ServerCorpus, ServerCorpusFailure>> => {
  const path = `${root}/data/corpus.db`
  let db: Database
  try {
    db = openSnapshot(path)
  } catch (cause) {
    return err({ _tag: "unusable", detail: `data/corpus.db could not be opened: ${messageOf(cause)}` })
  }

  let meta: Readonly<Record<string, string>>
  try {
    meta = readSnapshotMeta(db)
  } catch (cause) {
    db.close()
    return err({ _tag: "unusable", detail: `data/corpus.db is not a readable snapshot: ${messageOf(cause)}` })
  }

  const snapshotHash = meta["snapshotHash"]
  if (snapshotHash === undefined) {
    db.close()
    return err({ _tag: "unusable", detail: "this corpus records no snapshotHash, so there is nothing to attest." })
  }
  const recordCount = Number(meta["recordCount"])
  if (!Number.isInteger(recordCount)) {
    db.close()
    return err({ _tag: "unusable", detail: `this corpus records a recordCount of ${JSON.stringify(meta["recordCount"])}, which is not a count.` })
  }

  let committed: string
  try {
    committed = await readFile(`${root}/${ATTESTATION_RELATIVE}`, "utf8")
  } catch (cause) {
    db.close()
    // `attestation_unreadable` is the state `main.ts` already names for this, and reusing the word
    // keeps one condition from having three spellings across three surfaces.
    return err({ _tag: "integrity_error", detail: `${ATTESTATION_RELATIVE} is missing or unreadable (${messageOf(cause)}), so the corpus cannot be attested.` })
  }

  const attested = attestSnapshot(committed, { snapshotHash, recordCount })
  if (isErr(attested)) {
    db.close()
    return err({ _tag: "integrity_error", detail: describeAttestationProblem(attested.error) })
  }

  return ok({
    db,
    dbPath: path,
    snapshotHash,
    recordCount,
    // Read from the attestation rather than counted again: the attestation is the authority for what
    // the corpus contains, and a second count is a second number that can disagree with the first.
    collectionCounts: attested.value.collectionCounts,
    kind: "snapshot",
    close: () => db.close(),
  })
}

/** The anchor corpus, restated as a `ServerCorpus` so callers never branch on which one they have. */
const anchorsAsCorpus = (demo: DemoCorpus): ServerCorpus => ({
  db: demo.db,
  dbPath: demo.dbPath,
  snapshotHash: demo.snapshotHash,
  recordCount: demo.recordCount,
  collectionCounts: demo.collectionCounts,
  kind: "anchors",
  close: demo.close,
})

/** One line of a thrown value's message, so a failure never prints a stack trace to a reader. */
const messageOf = (cause: unknown): string =>
  cause instanceof Error ? (cause.message.split("\n")[0] ?? cause.message) : "unreadable"

/**
 * The corpus the playground opens: the snapshot when there is an attested one, the anchors when
 * there is not, and a refusal when the one on disk cannot be trusted.
 *
 * @param root the repository root.
 * @param dir a temporary directory for the anchor corpus, which has to be built rather than opened.
 */
export const openServerCorpus = async (root: string, dir: string): Promise<Result<ServerCorpus, ServerCorpusFailure>> => {
  if (existsSync(`${root}/data/corpus.db`)) {
    return await openSnapshotCorpus(root)
  }
  const built = await buildDemoCorpus(root, dir)
  if (isOk(built)) return ok(anchorsAsCorpus(built.value))
  return err({ _tag: "anchors_failed", detail: describeDemoCorpusFailure(built.error) })
}

/** The one sentence the page may show for a given failure. Paired with `ServerCorpusFailure`. */
export const describeCorpusFailure = (failure: ServerCorpusFailure): string => {
  if (failure._tag === "integrity_error") {
    return `ATTESTATION FAILED — ${failure.detail} No verdict is shown; the corpus on disk is not the corpus that was attested.`
  }
  if (failure._tag === "unusable") {
    return `the corpus could not be read — ${failure.detail} No verdict is shown.`
  }
  return failure.detail
}

export * as ServerCorpusSource from "./corpus.ts"
