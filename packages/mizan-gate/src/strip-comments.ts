/**
 * Comment stripping for source scanners.
 *
 * ## Why the gates need this
 *
 * A gate that greps raw text produces two kinds of noise, and both destroy trust in the
 * gate faster than a missed violation:
 *
 *  - false positives on documentation. `AGENTS.md` says "similarity" 40 times, and every
 *    `mizan-verify` file has a comment explaining that similarity is forbidden. A gate that
 *    flags those is a gate people learn to ignore.
 *  - a commented-out line (`// verdict: "verified"`) defeating a check is technically a
 *    violation and practically a non-event.
 *
 * So a scanner sees CODE. Two variants, because some rules must read string contents:
 *
 *  - `stripComments` blanks comments *and* string bodies. Use it for banned-TOKEN rules
 *    (`innerHTML`, `similarity`, `eval`): a token inside a string is data, not a call.
 *  - `stripCommentsOnly` blanks comments but keeps strings. Use it for rules about string
 *    CONTENT — import specifiers, the `"verified"` literal — which would otherwise be
 *    unreadable.
 *
 * String bodies are blanked with same-length asterisk runs, so a reported line and column
 * still point at the right place. Line numbers are the part a human actually uses, so they
 * must survive.
 *
 * ## What this is not
 *
 * This is NOT a JavaScript parser, and it is not a security boundary — it is an input filter
 * for a linter. It handles what appears in this repository's source: `//` line comments,
 * block comments, template literals, and quoted strings. Syntax cleverer than that deserves a
 * real parser (or `oxc`/`ts-morph`), not a regex.
 */

type StripOptions = { readonly blankStrings: boolean }

const walk = (source: string, options: StripOptions): string => {
  const out: string[] = []
  let i = 0
  let inBlock = false
  let inLine = false
  let quote: string | null = null

  while (i < source.length) {
    const char = source[i] ?? ""
    const next = source[i + 1] ?? ""

    if (inBlock) {
      if (char === "*" && next === "/") {
        inBlock = false
        out.push("  ")
        i += 2
        continue
      }
      out.push(char === "\n" ? "\n" : " ")
      i += 1
      continue
    }

    if (inLine) {
      if (char === "\n") {
        inLine = false
        out.push("\n")
        i += 1
        continue
      }
      out.push(" ")
      i += 1
      continue
    }

    if (quote !== null) {
      if (char === "\\") {
        out.push(options.blankStrings ? "  " : char + next)
        i += 2
        continue
      }
      if (char === quote) {
        quote = null
        out.push(char)
        i += 1
        continue
      }
      out.push(char === "\n" ? "\n" : options.blankStrings ? "*" : char)
      i += 1
      continue
    }

    if (char === "/" && next === "/") {
      inLine = true
      out.push("  ")
      i += 2
      continue
    }

    if (char === "/" && next === "*") {
      inBlock = true
      out.push("  ")
      i += 2
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char
      out.push(char)
      i += 1
      continue
    }

    out.push(char)
    i += 1
  }

  return out.join("")
}

/** Remove comments only. String contents stay readable — for rules that inspect string values. */
export const stripCommentsOnly = (source: string): string => walk(source, { blankStrings: false })

/** Remove comments and blank string bodies — for banned-token rules. */
export const stripComments = (source: string): string => walk(source, { blankStrings: true })

export * as Strip from "./strip-comments.ts"
