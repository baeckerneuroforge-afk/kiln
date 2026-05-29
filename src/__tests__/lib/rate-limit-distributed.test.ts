/**
 * Sprint 20.2 P2 — verteiltes Rate-Limiting (In-Memory-Fallback-Pfad).
 *
 * Der Upstash/Redis-Pfad braucht Env + Netzwerk; hier wird der Fallback
 * getestet, der greift, wenn UPSTASH_* nicht gesetzt ist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit-distributed";

describe("rateLimit (In-Memory-Fallback)", () => {
  it("erlaubt bis zum Limit und blockt danach", async () => {
    const r1 = await rateLimit("k-limit", { limit: 2, windowSeconds: 60 });
    const r2 = await rateLimit("k-limit", { limit: 2, windowSeconds: 60 });
    const r3 = await rateLimit("k-limit", { limit: 2, windowSeconds: 60 });
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(1);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("trennt Limits pro Key", async () => {
    const a = await rateLimit("k-a", { limit: 1, windowSeconds: 60 });
    const b = await rateLimit("k-b", { limit: 1, windowSeconds: 60 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("setzt nach Ablauf des Fensters zurück", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const a = await rateLimit("k-window", { limit: 1, windowSeconds: 60 });
    const b = await rateLimit("k-window", { limit: 1, windowSeconds: 60 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z")); // +61s
    const c = await rateLimit("k-window", { limit: 1, windowSeconds: 60 });
    expect(c.ok).toBe(true);
  });
});

describe("rateLimitedResponse", () => {
  it("liefert 429 mit positivem Retry-After", () => {
    const res = rateLimitedResponse({ ok: false, remaining: 0, resetMs: Date.now() + 30_000 });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
