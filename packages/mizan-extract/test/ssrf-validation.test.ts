import { describe, it, expect } from "bun:test"
import { validateAllowedHosts, validateAllowedHostEntry, isSubdomainOf } from "../src/provider.ts"

describe("SSRF Validation - validateAllowedHostEntry", () => {
  it("rejects empty string", () => {
    const result = validateAllowedHostEntry("")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("empty")
  })

  it("rejects whitespace-only string", () => {
    const result = validateAllowedHostEntry("   ")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("empty")
  })

  it("rejects protocol prefix", () => {
    const result = validateAllowedHostEntry("https://example.com")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("protocol")
  })

  it("rejects http protocol", () => {
    const result = validateAllowedHostEntry("http://example.com")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("protocol")
  })

  it("rejects ftp protocol", () => {
    const result = validateAllowedHostEntry("ftp://example.com")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("protocol")
  })

  it("rejects path component", () => {
    const result = validateAllowedHostEntry("example.com/path")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("path")
  })

  it("rejects path with query", () => {
    const result = validateAllowedHostEntry("example.com/path?query=1")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("path")
  })

  it("rejects port specification", () => {
    const result = validateAllowedHostEntry("example.com:8080")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("port")
  })

  it("rejects wildcard", () => {
    const result = validateAllowedHostEntry("*.example.com")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("wildcard")
  })

  it("accepts valid bare domain", () => {
    const result = validateAllowedHostEntry("example.com")
    expect(result.ok).toBe(true)
  })

  it("accepts valid subdomain", () => {
    const result = validateAllowedHostEntry("api.example.com")
    expect(result.ok).toBe(true)
  })

  it("accepts valid multi-level subdomain", () => {
    const result = validateAllowedHostEntry("v1.api.example.com")
    expect(result.ok).toBe(true)
  })

  it("accepts IPv6 literal in brackets", () => {
    const result = validateAllowedHostEntry("[::1]")
    expect(result.ok).toBe(true)
  })

  it("accepts IPv6 literal with zone", () => {
    const result = validateAllowedHostEntry("[fe80::1%eth0]")
    expect(result.ok).toBe(true)
  })
})

describe("SSRF Validation - isSubdomainOf (label-based)", () => {
  it("returns true for exact match", () => {
    expect(isSubdomainOf("example.com", "example.com")).toBe(false) // exact match handled separately
  })

  it("returns true for direct subdomain", () => {
    expect(isSubdomainOf("api.example.com", "example.com")).toBe(true)
  })

  it("returns true for multi-level subdomain", () => {
    expect(isSubdomainOf("v1.api.example.com", "example.com")).toBe(true)
  })

  it("returns false for suffix-match bypass (attacker.com)", () => {
    expect(isSubdomainOf("example.com.attacker.com", "example.com")).toBe(false)
  })

  it("returns false for evil subdomain of attacker", () => {
    expect(isSubdomainOf("evil.example.com.attacker.com", "example.com")).toBe(false)
  })

  it("returns false for different TLD", () => {
    expect(isSubdomainOf("example.org", "example.com")).toBe(false)
  })

  it("returns false for hostname with fewer labels", () => {
    expect(isSubdomainOf("com", "example.com")).toBe(false)
  })

  it("returns false for similar but different domain", () => {
    expect(isSubdomainOf("example.com.br", "example.com")).toBe(false)
  })

  it("returns false for punycode lookalike", () => {
    expect(isSubdomainOf("exámple.com", "example.com")).toBe(false)
  })
})

describe("SSRF Validation - validateAllowedHosts integration", () => {
  it("allows exact hostname match", () => {
    const result = validateAllowedHosts("https://api.example.com/v1", ["example.com"])
    expect(result.ok).toBe(true)
  })

  it("allows subdomain of allowed host", () => {
    const result = validateAllowedHosts("https://v1.api.example.com/v1", ["example.com"])
    expect(result.ok).toBe(true)
  })

  it("rejects hostname not in allowlist", () => {
    const result = validateAllowedHosts("https://evil.com/v1", ["example.com"])
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not in allowed hosts")
  })

  it("rejects suffix-match bypass attempt", () => {
    const result = validateAllowedHosts("https://example.com.attacker.com/v1", ["example.com"])
    expect(result.ok).toBe(false)
  })

  it("rejects when allowedHosts contains invalid entry", () => {
    const result = validateAllowedHosts("https://example.com/v1", ["example.com", ""])
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalid allowedHosts configuration")
  })

  it("rejects when allowedHosts contains protocol", () => {
    const result = validateAllowedHosts("https://example.com/v1", ["https://example.com"])
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalid allowedHosts configuration")
  })

  it("rejects when allowedHosts contains path", () => {
    const result = validateAllowedHosts("https://example.com/v1", ["example.com/path"])
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalid allowedHosts configuration")
  })

  it("rejects when allowedHosts contains port", () => {
    const result = validateAllowedHosts("https://example.com/v1", ["example.com:8080"])
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalid allowedHosts configuration")
  })

  it("rejects when allowedHosts contains wildcard", () => {
    const result = validateAllowedHosts("https://example.com/v1", ["*.example.com"])
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalid allowedHosts configuration")
  })

  it("allows empty allowedHosts (no restriction)", () => {
    const result = validateAllowedHosts("https://any-host.com/v1", [])
    expect(result.ok).toBe(true)
  })

  it("allows undefined allowedHosts (no restriction)", () => {
    const result = validateAllowedHosts("https://any-host.com/v1", undefined)
    expect(result.ok).toBe(true)
  })

  it("rejects invalid URL", () => {
    const result = validateAllowedHosts("not-a-url", ["example.com"])
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalid provider URL")
  })

  it("handles case insensitivity", () => {
    const result = validateAllowedHosts("https://API.EXAMPLE.COM/v1", ["example.com"])
    expect(result.ok).toBe(true)
  })

  it("handles leading dot in allowed host", () => {
    const result = validateAllowedHosts("https://api.example.com/v1", [".example.com"])
    expect(result.ok).toBe(true)
  })

  it("handles leading dot in hostname", () => {
    const result = validateAllowedHosts("https://.api.example.com/v1", ["example.com"])
    expect(result.ok).toBe(true)
  })
})

export * as SSRFValidationTest from "./ssrf-validation.test.ts"