import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn(async () => ({ userId: "user_a", orgId: "org_a" })));
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("GET /api/users/me/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_a", orgId: "org_a" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 without auth", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const { GET } = await import("@/app/api/users/me/preferences/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns dashboardPreference for the authenticated user", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ dashboardPreference: "operations" });
    const { GET } = await import("@/app/api/users/me/preferences/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dashboardPreference).toBe("operations");
  });

  it("normalizes unknown stored values to auto", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ dashboardPreference: "garbage" });
    const { GET } = await import("@/app/api/users/me/preferences/route");
    const body = await (await GET()).json();
    expect(body.dashboardPreference).toBe("auto");
  });

  it("returns 404 when user row missing", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/users/me/preferences/route");
    const response = await GET();
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/users/me/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_a", orgId: "org_a" });
    mockPrisma.user.update.mockImplementation(async ({ data }: { data: { dashboardPreference: string } }) => ({
      dashboardPreference: data.dashboardPreference,
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeRequest(body: unknown): import("next/server").NextRequest {
    return new Request("https://example.com/api/users/me/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as import("next/server").NextRequest;
  }

  it("requires auth", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const { PATCH } = await import("@/app/api/users/me/preferences/route");
    const response = await PATCH(makeRequest({ dashboardPreference: "operations" }));
    expect(response.status).toBe(401);
  });

  it("rejects body without dashboardPreference key", async () => {
    const { PATCH } = await import("@/app/api/users/me/preferences/route");
    const response = await PATCH(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("rejects invalid preference values", async () => {
    const { PATCH } = await import("@/app/api/users/me/preferences/route");
    const response = await PATCH(makeRequest({ dashboardPreference: "BOGUS" }));
    expect(response.status).toBe(400);
  });

  it("persists valid preference and writes audit log", async () => {
    const { PATCH } = await import("@/app/api/users/me/preferences/route");
    const response = await PATCH(makeRequest({ dashboardPreference: "operations" }));
    expect(response.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_a" },
        data: { dashboardPreference: "operations" },
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "USER_PREFERENCE_UPDATED" }),
      }),
    );
  });

  it("ignores extra keys (no mass-assignment vulnerability)", async () => {
    const { PATCH } = await import("@/app/api/users/me/preferences/route");
    await PATCH(makeRequest({ dashboardPreference: "auto", plan: "ENTERPRISE", aiCreditsBalance: 999_999 }));
    const data = mockPrisma.user.update.mock.calls[0]?.[0]?.data;
    expect(data).toEqual({ dashboardPreference: "auto" });
  });
});
