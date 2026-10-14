import * as fs from "fs"
import { resolve } from "node:path"
import { realpathSync } from "node:fs"
import type { ShamelaLicenseRegistry, ShamelaLicenseEntry } from "./shamela.ts"

const DEFAULT_REGISTRY_RELATIVE = "data/registry/shamela-licenses.json"

/** Load the per-book license registry from disk. */
export const loadShamelaLicenseRegistry = (basePath?: string): ShamelaLicenseRegistry | null => {
  try {
    let registryPath: string
    if (basePath) {
      registryPath = resolve(basePath, DEFAULT_REGISTRY_RELATIVE)
    } else {
      const PACKAGE_ROOT = resolve(import.meta.dirname, "..") // packages/mizan-corpus
      const PROJECT_ROOT = resolve(PACKAGE_ROOT, "..", "..") // project root
      registryPath = resolve(PROJECT_ROOT, DEFAULT_REGISTRY_RELATIVE)
    }

    // Validate path is within project boundary (only when not using explicit basePath)
    if (!basePath) {
      const PACKAGE_ROOT = resolve(import.meta.dirname, "..")
      const PROJECT_ROOT = resolve(PACKAGE_ROOT, "..", "..")
      const realProjectRoot = realpathSync(PROJECT_ROOT)
      const realRegistryPath = realpathSync(registryPath)
      if (!realRegistryPath.startsWith(realProjectRoot)) {
        return null
      }
    }

    const text = fs.readFileSync(registryPath, "utf8")
    const parsed = JSON.parse(text)
    if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.books)) {
      return null
    }
    return parsed as ShamelaLicenseRegistry
  } catch {
    return null
  }
}

/** Build a map of bookId -> licenseStatus from the registry. */
export const buildShamelaLicenseMap = (basePath?: string): Map<number, "cleared" | "blocked" | "pending"> => {
  const registry = loadShamelaLicenseRegistry(basePath)
  const map = new Map<number, "cleared" | "blocked" | "pending">()
  if (registry) {
    for (const book of registry.books) {
      map.set(book.bookId, book.licenseStatus)
    }
  }
  return map
}

/** Load cleared book IDs from the license registry. */
export const loadClearedBookIds = (basePath?: string): readonly number[] => {
  try {
    const registry = loadShamelaLicenseRegistry(basePath)
    if (!registry) return []
    return registry.books
      .filter((book: ShamelaLicenseEntry) => book.licenseStatus === "cleared")
      .map((book: ShamelaLicenseEntry) => book.bookId)
  } catch {
    return []
  }
}

export * as ShamelaLicense from "./shamela-license.ts"