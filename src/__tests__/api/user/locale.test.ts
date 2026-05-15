/**
 * Sprint 19.9 — POST /api/user/locale persistence.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockUserUpdate = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: mockUserUpdate } },
}));

import { POST } from "@/app/api/user/locale/route";

function postReq(body: unknown) {
  return new Request("http://localhost/api/user/locale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAuth.mockReset();
  mockUserUpdate.mockReset();
  mockUserUpdate.mockResolvedValue({});
});

describe("POST /api/user/locale", () => {
  it("400 for unsupported locale", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    const res = await POST(postReq({ locale: "fr" }));
    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("400 when locale field is missing", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("400 for non-string locale", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    const res = await POST(postReq({ locale: 42 }));
    expect(res.status).toBe(400);
  });

  it("anonymous visitor still gets the cookie (no User update)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null });
    const res = await POST(postReq({ locale: "en" }));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(res.headers.get("Set-Cookie")).toMatch(/kiln_locale=en/);
  });

  it("logged-in visitor persists to User.preferredLanguage", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    const res = await POST(postReq({ locale: "en" }));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { preferredLanguage: "en" },
    });
    const cookie = res.headers.get("Set-Cookie");
    expect(cookie).toMatch(/kiln_locale=en/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=\d+/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it("returns { ok: true, locale } on success", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    const res = await POST(postReq({ locale: "de" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, locale: "de" });
  });

  it("auth-lookup failure doesn't crash the request — cookie still set", async () => {
    mockAuth.mockRejectedValueOnce(new Error("Clerk down"));
    const res = await POST(postReq({ locale: "en" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toMatch(/kiln_locale=en/);
  });

  it("DB-update failure doesn't crash the request — cookie still set", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_1" });
    mockUserUpdate.mockRejectedValueOnce(new Error("DB unreachable"));
    const res = await POST(postReq({ locale: "en" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toMatch(/kiln_locale=en/);
  });
});
