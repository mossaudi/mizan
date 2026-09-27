/**
 * The one banned-token → RegExp builder. Every token rule in the gates uses it, because a
 * gate whose patterns disagree is a gate nobody can reason about.
 *
 * Three details do the real work, and each one was a bug first:
 *
 *  1. **The trailing boundary is conditional.** `eval(` already ends in a non-word character,
 *     so appending `(?!\w)` demanded a non-word character AFTER the `(`, and `eval(payload)`
 *     stopped matching. Word-ending tokens get the boundary; punctuation-ending tokens do not.
 *  2. **The leading lookbehind forbids word characters but NOT `.`.** `node.innerHTML` is
 *     exactly the violation we want; a lookbehind that also rejected `.` would have hidden it.
 *  3. **`allowSuffix` catches compound names.** `fuzzyScore`, `embeddings`, `thresholds` are
 *     the spellings real code uses, and a rule that only matches the bare token misses all of
 *     them.
 *
 * Matching is case-insensitive: `EmbeddingClient` and `innerHtml` are the same mistake.
 */

const escapeLiteral = (token: string): string => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const endsWithWordCharacter = (token: string): boolean => /[\w$]/.test(token.slice(-1))

export type TokenPatternOptions = {
  /** Allow an identifier tail, so `fuzzy` matches `fuzzyScore`. Default true. */
  readonly allowSuffix?: boolean
}

export const tokenPattern = (tokens: readonly string[], options: TokenPatternOptions = {}): RegExp => {
  const allowSuffix = options.allowSuffix ?? true
  const alternatives = tokens.map((token) => {
    const literal = escapeLiteral(token)
    if (!endsWithWordCharacter(token)) return literal
    if (allowSuffix) return `${literal}[A-Za-z0-9_]*(?![\\w$])`
    return `${literal}(?![\\w$])`
  })
  return new RegExp(`(?<![\\w$])(?:${alternatives.join("|")})`, "i")
}

export * as TokenPattern from "./token-pattern.ts"
