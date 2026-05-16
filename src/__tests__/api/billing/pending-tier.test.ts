/**
 * Sprint 20.1.1 — /api/billing/pending-tier GET (read + clear).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockCookieGet = vi.hoisted(() => vi.fn());
const mockCookieSet = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mockCookieGet,
    set: mockCookieSet,
  }),
}));

import { GET } from "@/app/api/billing/pending-tier/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_a" });
  mockCookieGet.mockReturnValue(undefined);
});

describe("Sprint 20.1.1 — GET /api/billing/pending-tier", () => {
  it("401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    // Don't read the cookie on rejected auth (defense in depth).
    expect(mockCookieGet).not.toHaveBeenCalled();
  });

  it("returns pendingTier=null when no cookie is set", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pendingTier: null });
    // No clear needed when there was nothing to clear.
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("returns the cookie value when valid AND clears it server-side", async () => {
    mockCookieGet.mockReturnValueOnce({ value: "starter" });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pendingTier: "starter" });
    // The set call is the clear — value="", maxAge=0.
    expect(mockCookieSet).toHaveBeenCalledWith(
      "kiln-pending-tier",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });

  it("returns pendingTier=null but still clears the cookie when value is malformed", async () => {
    // A user with a tampered cookie should also have it cleared so
    // they don't keep hitting the API with a junk value.
    mockCookieGet.mockReturnValueOnce({ value: "🦄" });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ pendingTier: null });
    expect(mockCookieSet).toHaveBeenCalled();
  });

  it("rejects 'free' even though it's a valid TierId (no Stripe checkout to fire)", async () => {
    mockCookieGet.mockReturnValueOnce({ value: "free" });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ pendingTier: null });
  });

  it("rejects 'enterprise' (mailto path, not Stripe Checkout)", async () => {
    mockCookieGet.mockReturnValueOnce({ value: "enterprise" });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ pendingTier: null });
  });
});
