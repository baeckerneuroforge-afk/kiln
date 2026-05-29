/**
 * Sprint 20.2 — verifyCronSecret timing-safe cron auth helper.
 *
 * Verifiziert das fail-closed/fail-open-Verhalten und den timing-sicheren
 * Token-Vergleich. Prisma + @vercel/functions werden gemockt, damit der
 * Import von api-auth.ts keine DB-/Runtime-Abhängigkeiten zieht.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

import { verifyCronSecret, timingSafeBearer } from "@/lib/api-auth";

function reqWith(authorization?: string): Request {
  return new Request("https://app.test/api/cron/x", {
    headers: authorization ? { authorization } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("timingSafeBearer", () => {
  const SECRET = "per-webhook-secret-abcdef0123456789";

  it("verweigert immer, wenn kein Secret konfiguriert ist (kein fail-open)", () => {
    expect(timingSafeBearer(`Bearer ${SECRET}`, "")).toBe(false);
    expect(timingSafeBearer(`Bearer ${SECRET}`, null)).toBe(false);
    expect(timingSafeBearer(`Bearer ${SECRET}`, undefined)).toBe(false);
  });

  it("erlaubt bei korrektem Token", () => {
    expect(timingSafeBearer(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("verweigert bei falschem Token / falscher Länge / fehlendem Header", () => {
    expect(timingSafeBearer(`Bearer ${"x".repeat(SECRET.length)}`, SECRET)).toBe(false);
    expect(timingSafeBearer(`Bearer ${SECRET}extra`, SECRET)).toBe(false);
    expect(timingSafeBearer(null, SECRET)).toBe(false);
    expect(timingSafeBearer(SECRET, SECRET)).toBe(false); // kein Bearer-Präfix
    expect(timingSafeBearer("Bearer ", SECRET)).toBe(false);
  });
});

describe("verifyCronSecret", () => {
  describe("CRON_SECRET nicht gesetzt", () => {
    it("erlaubt in Development (fail-open)", () => {
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("NODE_ENV", "development");
      expect(verifyCronSecret(reqWith("Bearer whatever"))).toBe(true);
      expect(verifyCronSecret(reqWith())).toBe(true);
    });

    it("verweigert in Production (fail-closed)", () => {
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("NODE_ENV", "production");
      expect(verifyCronSecret(reqWith("Bearer whatever"))).toBe(false);
      expect(verifyCronSecret(reqWith())).toBe(false);
    });
  });

  describe("CRON_SECRET gesetzt", () => {
    const SECRET = "s3cr3t-cron-token-0123456789";

    it("erlaubt bei korrektem Bearer-Token", () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifyCronSecret(reqWith(`Bearer ${SECRET}`))).toBe(true);
    });

    it("verweigert bei falschem Token gleicher Länge", () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("NODE_ENV", "production");
      const wrong = "x".repeat(SECRET.length);
      expect(verifyCronSecret(reqWith(`Bearer ${wrong}`))).toBe(false);
    });

    it("verweigert bei Token abweichender Länge", () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifyCronSecret(reqWith(`Bearer ${SECRET}extra`))).toBe(false);
      expect(verifyCronSecret(reqWith(`Bearer short`))).toBe(false);
    });

    it("verweigert ohne Authorization-Header", () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifyCronSecret(reqWith())).toBe(false);
    });

    it("verweigert ohne Bearer-Präfix", () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifyCronSecret(reqWith(SECRET))).toBe(false);
      expect(verifyCronSecret(reqWith(`Basic ${SECRET}`))).toBe(false);
    });

    it("verweigert bei leerem Bearer-Token", () => {
      vi.stubEnv("CRON_SECRET", SECRET);
      vi.stubEnv("NODE_ENV", "production");
      expect(verifyCronSecret(reqWith("Bearer "))).toBe(false);
    });
  });
});
