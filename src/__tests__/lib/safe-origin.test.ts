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

  it("akzeptiert App-Origin mit Pfad/Query verbatim", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    const withPath = "https://app.kiln.test/dashboard/reseller?setup=complete";
    expect(resolveSafeOrigin(withPath)).toBe(withPath);
  });

  it("akzeptiert localhost außerhalb von Production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveSafeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("lehnt localhost in Production ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveSafeOrigin("http://localhost:3000")).toBe(APP_URL);
  });

  it("lehnt fremde Domains ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("https://evil.example.com")).toBe(APP_URL);
  });

  it("lehnt Look-alike-Subdomain ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("https://app.kiln.test.evil.com")).toBe(APP_URL);
  });

  it("lehnt userinfo-Bypass (…@evil.com) ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("https://app.kiln.test@evil.com")).toBe(APP_URL);
  });

  it("lehnt Scheme-Downgrade (http statt https) ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("http://app.kiln.test")).toBe(APP_URL);
  });

  it("lehnt javascript:-URL ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("javascript:alert(1)")).toBe(APP_URL);
  });

  it("lehnt Scheme-Confusion (javascript://host) ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("javascript://app.kiln.test/%0aalert(1)")).toBe(APP_URL);
  });

  it("lehnt protokoll-relative //evil.com ab → Fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    expect(resolveSafeOrigin("//evil.com")).toBe(APP_URL);
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
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveSafeOrigin("https://evil.example.com")).toBe("http://localhost:3000");
  });
});
