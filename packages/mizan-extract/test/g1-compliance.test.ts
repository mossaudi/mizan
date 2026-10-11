import { describe, it, expect } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join, extname } from "node:path"

/**
 * G-1.1 compliance test for @mizan/extract package.
 *
 * This test ensures that no module in @mizan/extract imports @mizan/verify,
 * which would violate the architectural constraint that the verifier has
 * exactly one dependency (@mizan/core) and that extraction/display packages
 * cannot reach the verdict path.
 *
 * This is a package-local check in addition to the repo-wide G-1 gate.
 */

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const full = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          walk(full)
        }
      } else if (extname(entry.name) === ".ts") {
        files.push(full)
      }
    }
  }
  walk(dir)
  return files
}

const IMPORT_PATTERN = /(?:^|\s)(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g

function findForbiddenImports(filePath: string): { line: number; specifier: string; excerpt: string }[] {
  const content = readFileSync(filePath, "utf8")
  const findings: { line: number; specifier: string; excerpt: string }[] = []

  content.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1]
      if (specifier === "@mizan/verify" || specifier.startsWith("@mizan/verify/")) {
        findings.push({
          line: index + 1,
          specifier,
          excerpt: line.trim().slice(0, 160),
        })
      }
    }
  })

  return findings
}

describe("@mizan/extract G-1.1 compliance — no @mizan/verify imports", () => {
  const packageRoot = join(import.meta.dirname, "..")
  const sourceFiles = collectSourceFiles(join(packageRoot, "src"))

  it("has no imports of @mizan/verify in any source file", () => {
    const violations: { file: string; line: number; specifier: string; excerpt: string }[] = []

    for (const file of sourceFiles) {
      const findings = findForbiddenImports(file)
      for (const finding of findings) {
        violations.push({ file, ...finding })
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map((v) => `${v.file}:${v.line} — imports ${v.specifier} — ${v.excerpt}`)
        .join("\n")
      throw new Error(`G-1.1 VIOLATION: @mizan/extract imports @mizan/verify\n${details}`)
    }
  })
})

export * as G1ComplianceTest from "./g1-compliance.test.ts"