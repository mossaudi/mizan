import type { CorpusScope } from "./schema.ts"
import { QURAN_COLLECTION } from "@mizan/core"
import { broadExpression, phraseExpression, prefixExpression, prepareQuery } from "./query.ts"

/**
 * Shared search utilities and constants.
 *
 * Single source of truth for search configuration (AGENTS.md section 17).
 * Previously duplicated between search.ts and shamela-search.ts.
 */

/** Maximum number of candidate records a ranker considers before fusion. */
export const RECENT = 1_000

/** Default number of results to return. */
export const DEFAULT_LIMIT = 8

/** Maximum number of results a caller may request. */
export const MAX_LIMIT = 32

/** Scope predicate SQL for main records table. */
export const scopeSql = (scope: CorpusScope): { readonly predicate: string; readonly bindings: readonly string[] } => {
  if (scope === "any") return { predicate: "1 = 1", bindings: [] }
  if (scope === "quran") return { predicate: "r.collection = ?", bindings: [QURAN_COLLECTION] }
  return { predicate: "r.collection <> ?", bindings: [QURAN_COLLECTION] }
}

/** Normalize and clamp a caller-supplied limit. */
export const cleanLimit = (limit: number | undefined): number => {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT)
}

/**
 * Build search expressions for a token array.
 *
 * Three passes: OR (broad), PHRASE (exact phrase), PREFIX (single-word recall).
 * Deduplicated on expression string so a single-token query doesn't double-count.
 */
export const expressionsFor = (tokens: readonly string[], prefix: string): readonly { readonly name: string; readonly expression: string }[] => {
  const candidates = [
    { name: `${prefix}_bm25_or`, expression: broadExpression(tokens) },
    { name: `${prefix}_phrase`, expression: phraseExpression(tokens) },
    { name: `${prefix}_prefix`, expression: prefixExpression(tokens) },
  ]
  const seen = new Set<string>()
  return candidates.filter((pass) => {
    if (seen.has(pass.expression)) return false
    seen.add(pass.expression)
    return true
  })
}

/** Re-export query expression builders from query.ts */
export { broadExpression, phraseExpression, prefixExpression, prepareQuery, MAX_QUERY_CHARS, assertQuotable } from "./query.ts"