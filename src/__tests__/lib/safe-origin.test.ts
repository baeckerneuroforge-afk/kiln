/**
 * Sprint 20.2 — resolveSafeOrigin Open-Redirect-Schutz.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveSafeOrigin } from "@/lib/safe-origin";

const APP_URL = "https://app.kiln.test";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveSafeOrigin", () => {
  it("akzeptiert die App-eigene Origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin(APP_URL)).toBe(APP_URL);
  });

  it("akzeptiert App-Origin mit Pfad/Query (Host-Match)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("https://app.kiln.test")).toBe("https://app.kiln.test");
  });

  it("akzeptiert localhost in Dev", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("lehnt fremde Domains ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("https://evil.example.com")).toBe(APP_URL);
  });

  it("lehnt Look-alike-Subdomain ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("https://app.kiln.test.evil.com")).toBe(APP_URL);
  });

  it("lehnt javascript:-URL ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("javascript:alert(1)")).toBe(APP_URL);
  });

  it("nutzt Fallback bei leerem/ungültigem Input", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("")).toBe(APP_URL);
    expect(resolveSafeOrigin(undefined)).toBe(APP_URL);
    expect(resolveSafeOrigin(null)).toBe(APP_URL);
    expect(resolveSafeOrigin(123)).toBe(APP_URL);
    expect(resolveSafeOrigin("not a url")).toBe(APP_URL);
  });

  it("fällt auf localhost zurück, wenn NEXT_PUBLIC_APP_URL nicht gesetzt ist", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(resolveSafeOrigin("https://evil.example.com")).toBe("http://localhost:3000");
  });
});
