/**
 * Sprint 19.8 — hostname normalisation + validation.
 */
import { describe, expect, it } from "vitest";
import { normalizeHostname, validateHostname } from "@/lib/domains/hostname";

describe("normalizeHostname", () => {
  it("lower-cases the hostname", () => {
    expect(normalizeHostname("AI.Mueller.DE")).toBe("ai.mueller.de");
  });

  it("strips a trailing dot from an FQDN", () => {
    expect(normalizeHostname("ai.mueller.de.")).toBe("ai.mueller.de");
  });

  it("strips a pasted scheme and path", () => {
    expect(normalizeHostname("https://ai.mueller.de/foo/bar")).toBe(
      "ai.mueller.de",
    );
    expect(normalizeHostname("http://example.org/")).toBe("example.org");
  });

  it("strips a pasted port", () => {
    expect(normalizeHostname("ai.mueller.de:443")).toBe("ai.mueller.de");
  });

  it("trims whitespace", () => {
    expect(normalizeHostname("  ai.mueller.de  ")).toBe("ai.mueller.de");
  });
});

describe("validateHostname", () => {
  it("accepts a typical sub-domain", () => {
    expect(validateHostname("ai.muellergmbh.de")).toEqual({
      ok: true,
      hostname: "ai.muellergmbh.de",
    });
  });

  it("accepts an apex domain with two labels", () => {
    expect(validateHostname("kanzlei-mueller.de")).toEqual({
      ok: true,
      hostname: "kanzlei-mueller.de",
    });
  });

  it("rejects a hostname with no dot", () => {
    const r = validateHostname("localhost");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("at least one dot");
  });

  it("rejects wildcards", () => {
    const r = validateHostname("*.muellergmbh.de");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("wildcard");
  });

  it("rejects a leading-hyphen label", () => {
    const r = validateHostname("-ai.muellergmbh.de");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("invalid label");
  });

  it("rejects an empty hostname", () => {
    expect(validateHostname("   ").ok).toBe(false);
  });

  it("rejects KILN-reserved apex domains", () => {
    const r = validateHostname("kilnbase.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("reserved");
  });

  it("rejects KILN-reserved subdomains", () => {
    const r = validateHostname("evil.kilnbase.com");
    expect(r.ok).toBe(false);
  });

  it("rejects vercel.app subdomains so sub-orgs can't hijack preview links", () => {
    const r = validateHostname("attacker.vercel.app");
    expect(r.ok).toBe(false);
  });

  it("rejects hostnames over 253 characters", () => {
    const longLabel = "a".repeat(63);
    const tooLong = `${longLabel}.${longLabel}.${longLabel}.${longLabel}.${longLabel}.com`;
    const r = validateHostname(tooLong);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("253");
  });

  it("normalizes before validating (mixed case + trailing dot)", () => {
    expect(validateHostname("AI.Mueller.DE.")).toEqual({
      ok: true,
      hostname: "ai.mueller.de",
    });
  });
});
