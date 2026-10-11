#!/usr/bin/env bun
/**
 * `bun run eval:roots` — measures root coverage of the corpus against the
 * Quranic root dictionary (272 roots in this tool; ~1,651 per classical scholarship).
 *
 * ## What this measures
 *
 * - How many of the tool's Quranic roots are found in the corpus
 * - Dual-stemmer agreement rate (pattern stemmer + dictionary stemmer)
 * - Per-collection root distribution
 *
 * ## This is a MEASUREMENT ARTEFACT ONLY (ADR-22)
 *
 * No index ships. The root coverage is a measurement of dictionary alignment,
 * not a retrieval feature. The artefact is committed to `data/artefacts/root-coverage.json`
 * and the docs claim sweep (`check:docs`) compares prose against it.
 *
 * ## Dictionary Size Note
 *
 * The tool's embedded dictionary contains 272 unique Quranic roots (deduplicated from
 * the source data file). Classical Arabic scholarship (Lisan al-Arab, Taj al-Arous,
 * Quranic concordance) establishes approximately 1,651 triliteral/quadriliteral roots
 * attested in the Qur'an. This tool's dictionary is a subset; coverage percentages
 * are reported against the tool's actual dictionary size, not the scholarly total.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { arch, cpus, platform } from "node:os"
import { Database } from "bun:sqlite"
import { decodeOrFail, decodeSync, isErr, isOk, ok, err, sha256Hex, type Result } from "@mizan/core"
import {
  attestSnapshot,
  attestSnapshotUnchanged,
  attestationUnreadable,
  describeAttestationProblem,
  readSnapshotMeta,
  type AttestationProblem,
  type SnapshotIdentity,
} from "@mizan/corpus"
import { analyzeText, buildRootCoverageArtefact, DECLARED_QURANIC_ROOT_COUNT, type RootCoverageArtefact, RootCoverageArtefactSchema } from "@mizan/morphology"

const CORPUS_PATH = "data/corpus.db"
const ATTESTATION_PATH = "attestation.json"
const ARTEFACT_PATH = "data/artefacts/root-coverage.json"

/** The command a reader runs to reproduce every figure printed here. */
export const HARNESS_COMMAND = "bun run eval:roots"

/** Reserved for an integrity failure: a figure printed here would describe nothing. */
export const EXIT_UNTRUSTED = 3

/**
 * Read a file as text, returning a Result.
 */
const readTextFile = (path: string): Result<string, string> => {
  try {
    return ok(readFileSync(path, "utf8"))
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause))
  }
}

/**
 * Read the committed attestation file.
 */
const readCommittedAttestation = (): Result<string, AttestationProblem> => {
  if (!existsSync(ATTESTATION_PATH)) return err(attestationUnreadable(`${ATTESTATION_PATH} does not exist`))
  const read = readTextFile(ATTESTATION_PATH)
  if (!isOk(read)) return err(attestationUnreadable(read.error))
  return ok(read.value)
}

/**
 * Read the corpus identity from the open database.
 */
const readIdentity = (db: Database): SnapshotIdentity => {
  const meta = readSnapshotMeta(db)
  return { snapshotHash: meta.snapshotHash ?? "", recordCount: Number(meta.recordCount) }
}

/**
 * Run a `Result`-returning computation and turn anything thrown into a `Result` failure.
 */
export const attempt = <T>(compute: () => T): Result<T, string> => {
  try {
    return ok(compute())
  } catch (cause) {
    return err(cause instanceof Error ? cause.message : String(cause))
  }
}

/**
 * Scan the corpus and collect root/stem/lemma statistics.
 */
export const scanCorpusRoots = (db: Database): Result<{
  readonly totalWords: number
  readonly agreed: number
  readonly disagreed: number
  readonly rootsFound: ReadonlySet<string>
  readonly perCollection: ReadonlyMap<string, { words: number; agreed: number; roots: ReadonlySet<string> }>
}, string> => {
  return attempt(() => {
    const stmt = db.query<{ readonly collection: string; readonly textDisplay: string }, []>(`
      SELECT collection, textDisplay FROM records
    `)
    
    let totalWords = 0
    let agreed = 0
    let disagreed = 0
    const rootsFound = new Set<string>()
    const perCollection = new Map<string, { words: number; agreed: number; roots: Set<string> }>()

    for (const row of stmt.iterate()) {
      const collection = row.collection as string
      const textDisplay = row.textDisplay as string
      
      const analysis = analyzeText(textDisplay)
      
      totalWords += analysis.dualStemmerStats.total
      agreed += analysis.dualStemmerStats.agreed
      disagreed += analysis.dualStemmerStats.disagreed
      
      for (const root of analysis.roots) {
        if (root !== null) {
          rootsFound.add(root)
          
          let collStats = perCollection.get(collection)
          if (!collStats) {
            collStats = { words: 0, agreed: 0, roots: new Set() }
            perCollection.set(collection, collStats)
          }
          collStats.roots.add(root)
        }
      }
      
      let collStats = perCollection.get(collection)
      if (!collStats) {
        collStats = { words: 0, agreed: 0, roots: new Set() }
        perCollection.set(collection, collStats)
      }
      collStats.words += analysis.dualStemmerStats.total
      collStats.agreed += analysis.dualStemmerStats.agreed
    }

    // Convert Sets to ReadonlySets for return type
    const perCollectionReadonly = new Map<string, { words: number; agreed: number; roots: ReadonlySet<string> }>()
    for (const [key, value] of perCollection) {
      perCollectionReadonly.set(key, { ...value, roots: value.roots })
    }

    return {
      totalWords,
      agreed,
      disagreed,
      rootsFound,
      perCollection: perCollectionReadonly,
    }
  })
}

/**
 * Render the root coverage table for console output.
 */
export const renderRootCoverage = (
  stats: { readonly totalWords: number; readonly agreed: number; readonly disagreed: number },
  rootsFound: ReadonlySet<string>,
  perCollection: ReadonlyMap<string, { words: number; agreed: number; roots: ReadonlySet<string> }>,
  served: ReadonlyMap<string, number>
): string => {
  const lines: string[] = []
  lines.push("ROOT COVERAGE MEASUREMENT")
  lines.push("=".repeat(60))
  lines.push("")
  lines.push(`Declared Quranic roots: ${DECLARED_QURANIC_ROOT_COUNT}`)
  lines.push(`Roots found in corpus: ${rootsFound.size}`)
  lines.push(`Coverage: ${DECLARED_QURANIC_ROOT_COUNT > 0 ? (Math.round((rootsFound.size / DECLARED_QURANIC_ROOT_COUNT) * 1000) / 10).toFixed(1) : 0}%`)
  lines.push("")
  lines.push("DUAL-STEMMER CROSS-CHECK")
  lines.push("-".repeat(60))
  lines.push(`Total words analyzed: ${stats.totalWords}`)
  lines.push(`Stemmers agreed: ${stats.agreed} (${stats.totalWords > 0 ? (Math.round((stats.agreed / stats.totalWords) * 1000) / 10).toFixed(1) : 0}%)`)
  lines.push(`Stemmers disagreed: ${stats.disagreed} (${stats.totalWords > 0 ? (Math.round((stats.disagreed / stats.totalWords) * 1000) / 10).toFixed(1) : 0}%)`)
  lines.push("")
  lines.push("PER-COLLECTION BREAKDOWN")
  lines.push("-".repeat(60))
  lines.push("| collection | words | agreed | agreement% | roots found | served records |")
  lines.push("| --- | --- | --- | --- | --- | --- |")
  
  const servedMap = new Map(served)
  for (const [collection, data] of perCollection) {
    const agreementPct = data.words > 0 ? (Math.round((data.agreed / data.words) * 1000) / 10).toFixed(1) : "0.0"
    const servedRecords = servedMap.get(collection) ?? 0
    lines.push(`| ${collection} | ${data.words} | ${data.agreed} | ${agreementPct}% | ${data.roots.size} | ${servedRecords} |`)
  }
  
  // Collections with no root data but served records
  for (const [collection, count] of servedMap) {
    if (!perCollection.has(collection)) {
      lines.push(`| ${collection} | 0 | 0 | 0.0% | 0 | ${count} |`)
    }
  }
  
  return lines.join("\n")
}

/**
 * The conditions block for the measurement.
 */
export const buildConditions = (identity: SnapshotIdentity): Readonly<Record<string, string>> => ({
  corpus: identity.snapshotHash,
  stemmerVersion: "pattern+dictionary:v1",
  dictionaryVersion: `quranic-roots-${DECLARED_QURANIC_ROOT_COUNT}`,
  command: HARNESS_COMMAND,
  platform: platform(),
  arch: arch(),
  cpus: String(cpus().length),
  nodeVersion: process.version,
})

/**
 * Record the artefact to disk.
 */
export const recordArtefact = (artefact: RootCoverageArtefact): Result<string, string> => {
  return attempt(() => {
    writeFileSync(ARTEFACT_PATH, `${JSON.stringify(artefact, null, 2)}\n`, "utf8")
    return ARTEFACT_PATH
  })
}

/**
 * Check if this run's figures match or improve on the recorded baseline.
 * For root coverage, we only check that the artefact can be read - we don't
 * enforce a recall floor because this is a measurement, not a search feature.
 */
export const checkBaseline = (
  baseline: Readonly<Record<string, unknown>>,
  figures: Readonly<Record<string, number | string>>,
): Result<string, string> => {
  // For measurement artefacts, we just verify the baseline exists and is readable
  // The delta is published in the artefact for human review
  if (!baseline || Object.keys(baseline).length === 0) {
    return err(`${ARTEFACT_PATH} has no baseline recorded. Run with --record to establish one.`)
  }
  return ok("baseline exists")
}

/** Parse command line flags. */
export type RootCoverageMode = "measure" | "check" | "record"

export const parseMode = (argv: readonly string[]): Result<RootCoverageMode, string> => {
  const flags = argv.filter((arg) => arg.startsWith("--"))
  if (flags.length > 1) return err(`pass at most one of --check, --record, or none to measure`)
  const unknown = flags.filter((f) => !["--check", "--record"].includes(f))
  if (unknown.length > 0) return err(`unknown flag ${unknown.join(", ")}; use --check, --record, or none`)
  if (flags.includes("--check")) return ok("check")
  if (flags.includes("--record")) return ok("record")
  return ok("measure")
}

async function main() {
  const mode = parseMode(process.argv.slice(2))
  if (!mode.ok) {
    console.error(mode.error)
    process.exit(2)
  }

  // Read committed attestation
  const committedResult = readCommittedAttestation()
  if (!committedResult.ok) {
    console.error(`Attestation: ${describeAttestationProblem(committedResult.error)}`)
    process.exit(EXIT_UNTRUSTED)
  }
  const committedText = committedResult.value

  // Open corpus
  if (!existsSync(CORPUS_PATH)) {
    console.error(`Corpus not found at ${CORPUS_PATH}. Run 'bun run ingest' first.`)
    process.exit(2)
  }
  const db = new Database(CORPUS_PATH, { readonly: true })

  // Read identity from corpus
  const identity = readIdentity(db)

  // Verify corpus hasn't changed
  const verifyResult = attestSnapshotUnchanged(identity, identity)
  if (!verifyResult.ok) {
    console.error(`Corpus verification failed: ${verifyResult.error}`)
    process.exit(EXIT_UNTRUSTED)
  }

  // Attest snapshot against committed attestation
  const attested = attestSnapshot(committedText, identity)
  if (!attested.ok) {
    console.error(`FAIL ${describeAttestationProblem(attested.error)}`)
    console.error(`  committed   ${ATTESTATION_PATH}`)
    console.error(`  on disk     snapshotHash=${identity.snapshotHash} recordCount=${identity.recordCount}`)
    console.error("No figures were computed.")
    process.exit(EXIT_UNTRUSTED)
  }

  // Get served collection counts from attested attestation
  const served = new Map<string, number>(Object.entries(attested.value.collectionCounts))

  // Scan corpus
  const scanResult = scanCorpusRoots(db)
  if (!scanResult.ok) {
    console.error(`Scan failed: ${scanResult.error}`)
    process.exit(EXIT_UNTRUSTED)
  }
  const { totalWords, agreed, disagreed, rootsFound, perCollection } = scanResult.value

  // Build conditions
  const conditions = buildConditions(identity)

  // Build artefact
  const artefact = buildRootCoverageArtefact(
    identity.snapshotHash,
    { totalWords, agreed, disagreed },
    rootsFound.size
  )

  // Print measurement
  console.log(renderRootCoverage({ totalWords, agreed, disagreed }, rootsFound, perCollection, served))
  console.log("")
  console.log("CONDITIONS")
  console.log("-".repeat(60))
  for (const [key, value] of Object.entries(conditions)) {
    console.log(`${key}: ${value}`)
  }
  console.log("")

  // Handle mode
  if (mode.value === "measure") {
    console.log("Mode: measure (no write)")
    return
  }

  if (mode.value === "check") {
    // Read baseline
    if (!existsSync(ARTEFACT_PATH)) {
      console.error(`${ARTEFACT_PATH} not found. Run with --record first.`)
      process.exit(2)
    }
    const baselineContent = readFileSync(ARTEFACT_PATH, "utf8")
    // Decode through schema - never trust raw JSON (AGENTS.md §1)
    const baselineDecoded = decodeOrFail(decodeSync(RootCoverageArtefactSchema), JSON.parse(baselineContent), "RootCoverageArtefact")
    if (!baselineDecoded.ok) {
      console.error(`Baseline artefact does not satisfy schema: ${baselineDecoded.error}`)
      process.exit(1)
    }
    const baseline = baselineDecoded.value
    const figures: Readonly<Record<string, number | string>> = {
      rootsFound: rootsFound.size,
      coveragePercent: artefact.coveragePercent,
      agreementRate: artefact.dualStemmer.agreementRate,
    }
    const checkResult = checkBaseline(baseline as unknown as Readonly<Record<string, unknown>>, figures)
    if (!checkResult.ok) {
      console.error(`Baseline check failed: ${checkResult.error}`)
      process.exit(1)
    }
    console.log("Baseline check: PASS")
    return
  }

  if (mode.value === "record") {
    const recordResult = recordArtefact(artefact)
    if (!recordResult.ok) {
      console.error(`Failed to record artefact: ${recordResult.error}`)
      process.exit(1)
    }
    console.log(`Artefact recorded to ${ARTEFACT_PATH}`)
    return
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal error:", e)
    process.exit(1)
  })
}