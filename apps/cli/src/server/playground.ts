import type { Database } from "bun:sqlite"
import {
  err,
  isOk,
  MAX_QUOTE_CHARS,
  noMatchStrength,
  normalizeQuote,
  ok,
  type Claim,
  type ClaimVerdict,
  type ResolvedCitation,
  type Result,
} from "@mizan/core"
import { resolveCitations, type ResolveProblem } from "@mizan/corpus"
import { verifyAnswer } from "@mizan/verify"
import { VERIFICATION_BUDGET_MS } from "../instructions.ts"

export const MAX_TEXT_CHARS = 4000
export const MAX_NUMBER_CHARS = 64
export const COLLECTION_PATTERN = /^[a-z][a-z0-9]{0,31}$/i

export type VerifyFormInput = {
  readonly claimText: string
  readonly quote: string
  readonly collection: string
  readonly number: string | null
}

export type PlaygroundSample = {
  readonly id: string
  readonly label: string
  readonly blurb: string
  readonly input: VerifyFormInput
}

const FAITHFUL_QUOTE = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ"
const FABRICATED_QUOTE = "يَتَقَارَبُ الزَّمَانُ وَيَنْقُصُ الْفِقْهُ وَتَظْهَرُ الْفِتَنُ وَيُلْقَى الشُّحُّ وَيَكْثُرُ الْهَرْجُ"

export const VERIFY_SAMPLES: readonly PlaygroundSample[] = [
  {
    id: "quran-6222",
    label: "Sample A — a faithful quote",
    blurb: "A verbatim Qur'an quote cited to quran:6222. Expect VERIFIED.",
    input: {
      claimText: "Allah is one — a faithful quotation of Qur'an 6222.",
      quote: FAITHFUL_QUOTE,
      collection: "quran",
      number: "6222",
    },
  },
  {
    id: "abudawud-4255-fabricated",
    label: "Sample B — a one-word fabrication",
    blurb: "One word of twelve differs from abudawud:4255 (redteam-005). Expect REJECTED.",
    input: {
      claimText: "Fabricated hadith text — one word differs from the cited source.",
      quote: FABRICATED_QUOTE,
      collection: "abudawud",
      number: "4255",
    },
  },
]

export const parseVerifyForm = (form: Readonly<Record<string, string>>): Result<VerifyFormInput, string> => {
  const claimTextRaw = form.claimText ?? ""
  const quoteRaw = form.quote ?? ""
  const collectionRaw = form.collection ?? ""
  const numberRaw = form.number ?? ""

  if (quoteRaw.trim().length === 0) {
    return err("quote is required — a claim with no quoted span cannot be verified.")
  }
  if (quoteRaw.length > MAX_QUOTE_CHARS) {
    return err(`quote exceeds ${MAX_QUOTE_CHARS} characters.`)
  }
  if (claimTextRaw.length > MAX_TEXT_CHARS) {
    return err(`claim text exceeds ${MAX_TEXT_CHARS} characters.`)
  }

  const collection = collectionRaw.trim()
  if (collection.length === 0) {
    return err("collection is required (for example quran or abudawud).")
  }
  if (!COLLECTION_PATTERN.test(collection)) {
    return err("collection must be letters and digits only, starting with a letter.")
  }

  const numberTrimmed = numberRaw.trim()
  if (numberTrimmed.length > MAX_NUMBER_CHARS) {
    return err(`number exceeds ${MAX_NUMBER_CHARS} characters.`)
  }
  if (numberTrimmed.length > 0 && !/^[0-9]+$/.test(numberTrimmed)) {
    return err("number must be digits only, or empty for an unnumbered row.")
  }

  const quote = normalizeQuote(quoteRaw)
  if (quote === null) {
    return err("quote is required — a claim with no quoted span cannot be verified.")
  }

  return ok({
    claimText: claimTextRaw.trim(),
    quote,
    collection,
    number: numberTrimmed.length === 0 ? null : numberTrimmed,
  })
}

export const buildPlaygroundClaim = (input: VerifyFormInput, claimId: string): Claim => ({
  id: claimId,
  text: input.claimText.length === 0 ? input.quote : input.claimText,
  quote: input.quote,
  citations: [
    {
      collection: input.collection,
      number: input.number,
      grade: null,
      raw: input.number === null ? input.collection : `${input.collection}:${input.number}`,
    },
  ],
})

export type PlaygroundResult = {
  readonly claim: Claim
  readonly verdict: ClaimVerdict
  readonly resolved: readonly ResolvedCitation[]
  readonly problems: readonly ResolveProblem[]
  readonly snapshotHash: string
}

const unverifiableVerdict = (claimId: string): ClaimVerdict => ({
  claimId,
  verdict: "unverifiable",
  reason: "decomposition_failed",
  matchStrength: noMatchStrength,
  evidence: null,
})

export const verifyPlayground = (db: Database, snapshotHash: string, input: VerifyFormInput): PlaygroundResult => {
  const claim = buildPlaygroundClaim(input, "playground-1")
  const { resolved, problems } = resolveCitations(db, claim.citations)
  const startedAt = performance.now()
  const report = verifyAnswer({
    claims: [claim],
    evidence: resolved,
    snapshotHash,
    deadlineExpired: () => performance.now() - startedAt > VERIFICATION_BUDGET_MS,
  })
  const verdict = report.claims[0]
  if (verdict === undefined) {
    return { claim, verdict: unverifiableVerdict(claim.id), resolved, problems, snapshotHash }
  }
  return { claim, verdict, resolved, problems, snapshotHash }
}

export const sampleById = (id: string): PlaygroundSample | null => {
  const found = VERIFY_SAMPLES.find((sample) => sample.id === id)
  if (found === undefined) return null
  return found
}

export const sampleInputMatches = (input: VerifyFormInput, sample: PlaygroundSample): boolean => {
  const parsed = parseVerifyForm({
    claimText: input.claimText,
    quote: input.quote,
    collection: input.collection,
    number: input.number ?? "",
  })
  if (!isOk(parsed)) return false
  return (
    parsed.value.quote === sample.input.quote &&
    parsed.value.collection === sample.input.collection &&
    parsed.value.number === sample.input.number
  )
}

export * as Playground from "./playground.ts"
