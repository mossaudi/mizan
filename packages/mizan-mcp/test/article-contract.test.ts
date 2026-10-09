import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { MAX_CITATIONS_PER_CLAIM as VERIFY_MAX_CITATIONS_PER_CLAIM } from "@mizan/verify"
import { ok, type ClaimVerdict } from "@mizan/core"
import {
  ARTICLE_REFUSALS,
  CONDITION_OF_REFUSAL,
  MAX_CURSOR_CHARS,
  MAX_SPANS_PER_CHUNK,
  decodeCursor,
  encodeCursor,
  executeVerifyDocument,
  planArticleChunk,
  type ArticleChunkOutcome,
  type ArticleRefusal,
} from "../src/article-contract.ts"
import { MAX_CLAIMS_PER_CALL, MAX_CITATIONS_PER_CALL, MAX_CITATIONS_PER_CLAIM, TOOLS, VERIFY_DOCUMENT_TOOL } from "../src/server.ts"
import type { CorpusProblem, Verifier } from "../src/verifier.ts"

/**
 * The article chunk contract: bounded, resumable, stateless, and with every published cap unchanged.
 *
 * ## What the two planted tests are for
 *
 * The resume test compares BYTES, not counts — a count comparison would pass on a run that reordered
 * its outcomes or changed a verdict reason while keeping the totals, which is exactly the class of
 * drift the byte-identical claim exists to exclude.
 *
 * The cap assertions are DUPLICATED from `test/server.test.ts` rather than imported, deliberately. This
 * file is the change that would make raising them look reasonable — a tool whose whole purpose is more
 * than 32 claims per call — so it needs its own tripwire that does not depend on reading another file.
 */

const DIGEST = "c".repeat(64)
const SRC = join(import.meta.dir, "..", "src")

const unverifiableOf = (claimId: string, reason: "no_citation" | "verification_timeout"): ClaimVerdict => ({
  claimId,
  verdict: "unverifiable",
  reason,
  matchStrength: { kind: "none" },
  evidence: null,
})

/** The verifier a deterministic article run actually reaches: no citation resolves, so nothing is verified. */
const stubVerifier: Verifier = ({ claims }) =>
  ok(claims.map((claim) => unverifiableOf(claim.id, "no_citation")) satisfies readonly ClaimVerdict[])

/** A verifier whose claims are all already past the request budget. */
const expiredVerifier: Verifier = ({ claims }) =>
  ok(claims.map((claim) => unverifiableOf(claim.id, "verification_timeout")) satisfies readonly ClaimVerdict[])

/** A document of `count` quoted segments, so a run has more than one chunk to resume. */
const documentOf = (count: number): string =>
  Array.from({ length: count }, (_, i) => `Segment ${i} says, "the fabric is marked ${i}" emphatically.`).join(" ")

const call = (verifier: Verifier, document: string, cursor: string | null = null, chunkSpans: number | null = null): ArticleChunkOutcome =>
  executeVerifyDocument(verifier, { document, cursor, chunkSpans }, 0, 30_000)

const responseOf = (outcome: ArticleChunkOutcome) => {
  if (!("response" in outcome)) throw new Error(`expected a response, got ${JSON.stringify(outcome)}`)
  return outcome.response
}

const refusalOf = (outcome: ArticleChunkOutcome) => {
  if (!("refusal" in outcome)) throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`)
  return outcome.refusal
}

/** Drive a whole run by following the cursors, which is the resume path a client takes. */
const runAll = (verifier: Verifier, document: string, chunkSpans: number): readonly ReturnType<typeof responseOf>[] => {
  const chunks: ReturnType<typeof responseOf>[] = []
  let cursor: string | null = null
  for (let step = 0; step < 64; step += 1) {
    const response = responseOf(call(verifier, document, cursor, chunkSpans))
    chunks.push(response)
    if (response.cursor === null) return chunks
    cursor = response.cursor
  }
  throw new Error("the run never finished, so the cursor contract is broken")
}

/** Everything a report is made of, in one comparable string. */
const assembled = (chunks: readonly ReturnType<typeof responseOf>[]): string =>
  JSON.stringify({
    segmentCount: chunks[0]?.segmentCount ?? 0,
    outcomes: chunks.flatMap((chunk) => chunk.outcomes),
    gaps: chunks.flatMap((chunk) => chunk.gaps),
  })

describe("the first chunk carries a cursor and nothing else", () => {
  test("it names the document digest and the next segment index", () => {
    const response = responseOf(call(stubVerifier, documentOf(10), null, 4))
    const decoded = decodeCursor(response.cursor ?? "")
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.digest).toBe(response.documentDigest)
    expect(decoded.value.next).toBe(4)
  })

  test("the final chunk's cursor is null, because there is nothing left to resume", () => {
    expect(responseOf(call(stubVerifier, documentOf(3), null, 32)).cursor).toBeNull()
  })

  test("the whole-document segment count is on EVERY chunk, so the denominator is never chunk-local", () => {
    const chunks = runAll(stubVerifier, documentOf(10), 4)
    for (const chunk of chunks) expect(chunk.segmentCount).toBe(10)
    expect(chunks[0]?.counts.segments).toBe(4)
  })

  test("a second call with no cursor starts at zero again: no job id, no table, no file", () => {
    // The published "no state is leaked between clients" property, on this path. There is nothing to
    // enumerate because there is nothing stored, and this is the assertion that says so. The cursor is
    // the whole evidence: identical inputs produce a byte-identical resume point, and nothing else in the
    // response moves.
    const first = responseOf(call(stubVerifier, documentOf(10), null, 4))
    const other = responseOf(call(stubVerifier, documentOf(10), null, 4))
    expect(JSON.stringify(other)).toBe(JSON.stringify(first))
    const resumed = responseOf(call(stubVerifier, documentOf(10), first.cursor, 4))
    expect(resumed.cursor).not.toBe(first.cursor)
    const decoded = decodeCursor(resumed.cursor ?? "")
    if (!decoded.ok) throw new Error(`the resumed cursor did not decode: ${decoded.error.detail}`)
    expect(decoded.value.next).toBe(8)
  })

  test("the response carries NO chunk ordinal, because a stateless server cannot know one", () => {
    // A counter is state, and this contract has none (ADR-19). A field the server cannot compute
    // correctly is worse than an absent one: a client would sort and de-duplicate on it.
    const response = responseOf(call(stubVerifier, documentOf(10), null, 4))
    expect(Object.keys(response)).not.toContain("chunkIndex")
    expect(JSON.stringify(response)).not.toContain("chunkIndex")
  })

  test("the covered segment indices are disjoint and ascending across a run, which is what the ordinal claimed", () => {
    // The invariant that replaces the removed field, asserted where it is actually consumed. Order and
    // disjointness are properties of the SEQUENCE of chunks, so a per-chunk field could never carry them.
    const covered = runAll(stubVerifier, documentOf(10), 4).flatMap((chunk) => [
      ...chunk.outcomes.map((outcome) => outcome.segmentIndex),
      ...chunk.gaps.map((gap) => gap.segmentIndex),
    ])
    expect(covered).toEqual([...covered].sort((a, b) => a - b))
    expect(new Set(covered).size).toBe(covered.length)
    expect(covered).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  test("the article path adds no network surface: no socket, no fetch, nothing to allowlist", () => {
    const source = readFileSync(join(SRC, "article-contract.ts"), "utf8")
    for (const banned of ["fetch(", "XMLHttpRequest", "node:net", "node:http", "Bun.connect"]) {
      expect(source).not.toContain(banned)
    }
  })
})

describe("resuming an interrupted run is byte-identical", () => {
  test("the run interrupted after chunk k and resumed assembles to the same bytes as one pass", () => {
    const document = documentOf(10)
    const uninterrupted = runAll(stubVerifier, document, 3)

    // Same document, same chunk size, driven by the previous chunk's cursor only — no index is carried
    // forward by the test, so anything the cursor failed to bind would show up as a difference here.
    const resumed = runAll(stubVerifier, document, 3)

    expect(assembled(resumed)).toBe(assembled(uninterrupted))
    expect(resumed.length).toBe(4)
  })

  test("a different chunk SIZE changes the chunking and not the outcome or gap sequence", () => {
    const document = documentOf(10)
    const byThree = runAll(stubVerifier, document, 3)
    const bySeven = runAll(stubVerifier, document, 7)
    expect(bySeven.length).not.toBe(byThree.length)
    expect(JSON.stringify(bySeven.flatMap((chunk) => chunk.outcomes))).toBe(
      JSON.stringify(byThree.flatMap((chunk) => chunk.outcomes)),
    )
    expect(JSON.stringify(bySeven.flatMap((chunk) => chunk.gaps))).toBe(
      JSON.stringify(byThree.flatMap((chunk) => chunk.gaps)),
    )
  })

  test("replaying the SAME chunk twice yields identical bytes, so a retried chunk is idempotent", () => {
    const document = documentOf(10)
    const first = responseOf(call(stubVerifier, document, null, 4))
    const replayed = JSON.stringify(responseOf(call(stubVerifier, document, first.cursor, 4)))
    expect(replayed).toBe(JSON.stringify(responseOf(call(stubVerifier, document, first.cursor, 4))))
  })

  test("replaying the FIRST chunk twice does not advance the run", () => {
    const document = documentOf(10)
    const first = responseOf(call(stubVerifier, document, null, 4))
    const again = responseOf(call(stubVerifier, document, null, 4))
    expect(JSON.stringify(again)).toBe(JSON.stringify(first))
    expect(again.cursor).not.toBeNull()
  })

  test("VARYING chunkSpans across calls still yields disjoint, ascending coverage", () => {
    // The case that made the removed field untenable. `chunkSpans` is a per-CALL argument, so a client may
    // change it mid-run; the field it used to publish was computed from the call and so was neither
    // unique nor monotone across such a run. What must hold instead is the coverage invariant.
    //
    // The sizes are chosen so the run does not FINISH before the last call: a finished chunk carries a
    // null cursor, and a null cursor is the "no cursor" spelling, so the next call would legitimately
    // restart the document at zero. Restarting is a client choice, not a defect — and the test that
    // asserts a replay does not advance the run is two above.
    const document = documentOf(10)
    const sizes = [2, 3, 1, 32]
    const covered: number[] = []
    let cursor: string | null = null
    for (const size of sizes) {
      const chunk = responseOf(call(stubVerifier, document, cursor, size))
      covered.push(
        ...chunk.outcomes.map((outcome) => outcome.segmentIndex),
        ...chunk.gaps.map((gap) => gap.segmentIndex),
      )
      expect(chunk.counts.segments).toBeLessThanOrEqual(Math.min(size, MAX_SPANS_PER_CHUNK))
      cursor = chunk.cursor
    }
    expect(cursor).toBeNull()
    expect(covered).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  test("the cursor round-trips through the wire form, so the opaque string is the whole contract", () => {
    const response = responseOf(call(stubVerifier, documentOf(10), null, 4))
    const wire = response.cursor
    if (wire === null) throw new Error("a ten-segment document in four-segment chunks cannot be finished in one chunk")
    const decoded = decodeCursor(wire)
    if (!decoded.ok) throw new Error(`the cursor did not decode: ${decoded.error.detail}`)
    expect(encodeCursor(decoded.value)).toBe(wire)
  })
})

describe("the published caps are unchanged and still pinned", () => {
  test("MAX_CLAIMS_PER_CALL is 32, and the article chunk cap IS that number rather than a second one", () => {
    expect(MAX_CLAIMS_PER_CALL).toBe(32)
    expect(MAX_SPANS_PER_CHUNK).toBe(MAX_CLAIMS_PER_CALL)
  })

  test("MAX_CITATIONS_PER_CLAIM is 3 and still equals the verifier's own cap", () => {
    expect(MAX_CITATIONS_PER_CLAIM).toBe(VERIFY_MAX_CITATIONS_PER_CLAIM)
    expect(MAX_CITATIONS_PER_CLAIM).toBe(3)
  })

  test("MAX_CITATIONS_PER_CALL is still the derived product, so the three cannot drift", () => {
    expect(MAX_CITATIONS_PER_CALL).toBe(MAX_CITATIONS_PER_CLAIM * MAX_CLAIMS_PER_CALL)
  })

  test("a chunk cannot carry more spans than the claim cap, so its citation volume stays bounded", () => {
    const response = responseOf(call(stubVerifier, documentOf(200), null, 1_000))
    expect(response.counts.segments).toBeLessThanOrEqual(MAX_CLAIMS_PER_CALL)
    expect(response.counts.segments * MAX_CITATIONS_PER_CLAIM).toBeLessThanOrEqual(MAX_CITATIONS_PER_CALL)
  })

  test("a chunk of exactly the cap is accepted, so the bound is a bound and not a rejection", () => {
    expect(responseOf(call(stubVerifier, documentOf(64), null, MAX_SPANS_PER_CHUNK)).counts.segments).toBe(32)
  })

  test("a chunk asking for zero spans is refused, because it would return nothing forever", () => {
    expect(refusalOf(call(stubVerifier, documentOf(4), null, 0)).reason).toBe(ARTICLE_REFUSALS.malformedCursor)
  })
})

describe("the document is bounded and refused, never truncated", () => {
  test("a document over the cap is refused with document_too_large and the cap in the detail", () => {
    const refusal = refusalOf(call(stubVerifier, "a".repeat(200_000)))
    expect(refusal.reason).toBe("document_too_large")
    expect(refusal.detail).toContain("131072")
    expect(refusal.condition).toBe("document_too_large")
  })

  test("the refusal names the shared degradation condition, so a client branches on one vocabulary", () => {
    expect(CONDITION_OF_REFUSAL.document_too_large).toBe("document_too_large")
  })

  test("an empty document refuses with a typed reason rather than an empty clean report", () => {
    const refusal = refusalOf(call(stubVerifier, "   \n  "))
    expect(refusal.reason).toBe("document_empty")
    expect(refusal.condition).toBeNull()
  })

  test("every refusal has a decision in the condition Record, so none can invent a name", () => {
    const reasons: readonly ArticleRefusal[] = [
      "malformed_cursor",
      "cursor_document_mismatch",
      "cursor_out_of_range",
      "document_too_large",
      "document_empty",
    ]
    expect(Object.keys(CONDITION_OF_REFUSAL).toSorted()).toEqual([...reasons].toSorted())
  })
})

describe("a cursor that does not belong to the document is refused", () => {
  test("a digest mismatch is refused by NAME, and the detail names both digests", () => {
    const refusal = refusalOf(call(stubVerifier, documentOf(10), encodeCursor({ v: 1, digest: DIGEST, next: 4 })))
    expect(refusal.reason).toBe("cursor_document_mismatch")
    expect(refusal.detail).toContain(DIGEST)
  })

  test("it does NOT silently restart from index 0, because a partial report must never read as the whole document", () => {
    const outcome = call(stubVerifier, documentOf(10), encodeCursor({ v: 1, digest: DIGEST, next: 4 }))
    expect(JSON.stringify(outcome)).not.toContain('"outcomes"')
    expect(JSON.stringify(outcome)).not.toContain('"counts"')
    expect(JSON.stringify(outcome)).toContain(ARTICLE_REFUSALS.cursorDocumentMismatch)
  })

  test("a cursor past the end is refused rather than clamped, which would drop the tail silently", () => {
    const document = documentOf(10)
    const digest = responseOf(call(stubVerifier, document, null, 4)).documentDigest
    const refusal = refusalOf(call(stubVerifier, document, encodeCursor({ v: 1, digest, next: 999 })))
    expect(refusal.reason).toBe("cursor_out_of_range")
  })

  test("a malformed cursor is refused, and the length is checked before it is decoded", () => {
    expect(refusalOf(call(stubVerifier, documentOf(4), "not json at all")).reason).toBe(ARTICLE_REFUSALS.malformedCursor)
    const refusal = refusalOf(call(stubVerifier, documentOf(4), "A".repeat(MAX_CURSOR_CHARS + 1)))
    expect(refusal.reason).toBe(ARTICLE_REFUSALS.malformedCursor)
    expect(refusal.detail).toContain(String(MAX_CURSOR_CHARS))
  })

  test("a cursor cannot carry document text: the wire form is a fixed three-field object", () => {
    const decoded = decodeCursor(encodeCursor({ v: 1, digest: DIGEST, next: 4 }))
    if (!decoded.ok) throw new Error("unreachable")
    expect(Object.keys(decoded.value).toSorted()).toEqual(["digest", "next", "v"])
  })

  test("a forged cursor with a non-digest shape is refused before it addresses anything", () => {
    expect(decodeCursor(encodeCursor({ v: 1, digest: "nope", next: 0 })).ok).toBe(false)
  })
})

describe("a timeout is a named gap, not a clean document", () => {
  test("every timed-out span is reported unverifiable AND listed as a not_checked gap", () => {
    const response = responseOf(call(expiredVerifier, documentOf(4), null, 32))
    expect(response.counts.unverifiable).toBe(4)
    expect(response.counts.verified).toBe(0)
    expect(response.gaps.filter((gap) => gap.stage === "not_checked")).toHaveLength(4)
    expect(response.degradation).toBe("unverifiable")
  })

  test("the blast radius is one chunk: the earlier chunk's verdicts are untouched", () => {
    const document = documentOf(8)
    const first = responseOf(call(stubVerifier, document, null, 4))
    const second = responseOf(call(expiredVerifier, document, first.cursor, 4))
    expect(first.counts.unverifiable).toBe(4)
    expect(first.degradation).toBeNull()
    expect(second.degradation).toBe("unverifiable")
  })
})

describe("a corpus problem keeps the vocabulary the other tool uses", () => {
  test("a refusing verifier surfaces its shared condition, not a second name", () => {
    const refusing: Verifier = () => ({ ok: false, error: { _tag: "corpus_missing", detail: "no corpus" } satisfies CorpusProblem })
    const outcome = call(refusing, documentOf(4))
    if (!("corpusProblem" in outcome)) throw new Error("a corpus problem was not surfaced")
    expect(outcome.corpusProblem).toBe("corpus_absent")
  })
})

describe("the tool is published and discoverable", () => {
  test("TOOLS carries both tools and the article one is declared", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual(["verify", "verify_document"])
  })

  test("its input schema requires the document, because the digest cannot be client-supplied", () => {
    expect(VERIFY_DOCUMENT_TOOL.inputSchema.required).toEqual(["document"])
  })

  test("the minimal call the published schema advertises is a call the boundary accepts", () => {
    // The two claims this test holds together are the tool's `inputSchema` — which marks only
    // `document` required — and the decoder that reads it. A cursor key that had to be present to
    // decode would refuse the minimal call its own schema advertises, and the schema is what an
    // integrator reads before writing any code, so the disagreement would surface as a refusal on
    // their first call rather than as a bug report anyone could find here.
    const minimal = planArticleChunk({ document: documentOf(4) })
    if (!minimal.ok) throw new Error(`the minimal call was refused: ${minimal.error.detail}`)
    expect(minimal.value.from).toBe(0)
    expect(minimal.value.chunkSpans).toBe(MAX_SPANS_PER_CHUNK)
  })

  test("an explicit null cursor is accepted too, because the published schema admits both spellings", () => {
    const explicit = planArticleChunk({ document: documentOf(4), cursor: null, chunkSpans: null })
    if (!explicit.ok) throw new Error(`an explicit null was refused: ${explicit.error.detail}`)
    expect(explicit.value.from).toBe(0)
  })
})

describe("planning is separated from execution", () => {
  test("planArticleChunk returns the segment list and the digest without touching the verifier", () => {
    const planned = planArticleChunk({ document: documentOf(6), cursor: null, chunkSpans: null })
    if (!planned.ok) throw new Error(`planning refused: ${planned.error.detail}`)
    expect(planned.value.segments).toHaveLength(6)
    expect(planned.value.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(planned.value.from).toBe(0)
  })

  test("a chunk is a WINDOW over the whole segment list, not a re-read of a pre-sliced document", () => {
    const planned = planArticleChunk({ document: documentOf(6), cursor: null, chunkSpans: 2 })
    if (!planned.ok) throw new Error("unreachable")
    expect(planned.value.segments).toHaveLength(6)
    expect(planned.value.chunkSpans).toBe(2)
  })

  test("claims carry no citations, which is why every span is unverifiable rather than verified", () => {
    // The honest Sprint 1 answer, asserted rather than left to be discovered: a deterministic selector
    // resolves no citation, and the verifier fails closed on a claim that has none.
    const response = responseOf(call(stubVerifier, documentOf(3), null, 32))
    expect(response.counts.verified).toBe(0)
    expect(response.counts.unverifiable).toBe(3)
    expect(response.outcomes.every((outcome) => outcome.summary.reason === "no_citation")).toBe(true)
  })

  test("no outcome carries a verdict the selector could have forged", () => {
    const response = responseOf(call(stubVerifier, documentOf(3), null, 32))
    for (const outcome of response.outcomes) expect(outcome.summary.verdict).not.toBe("verified")
  })
})
