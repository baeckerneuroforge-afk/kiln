import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  integrationConnection: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));

const mockRequireOrgId = vi.hoisted(() => vi.fn(async () => ({ userId: "user_a", orgId: "org_a" })));
const mockRevoke = vi.hoisted(() =>
  vi.fn<(args: unknown) => Promise<{ ok: boolean; error?: string; unsupported?: boolean }>>(async () => ({ ok: true })),
);

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/org-context", () => ({
  requireOrgId: mockRequireOrgId,
  OrgContextError: class OrgContextError extends Error {},
}));
vi.mock("@/lib/auth/org-scope", () => ({
  orgScopeFilter: ({ userId, orgId }: { userId: string; orgId: string }) => ({
    OR: [{ orgId }, { userId, orgId: null }],
  }),
}));
vi.mock("@/lib/integrations/revoke", () => ({
  revokeIntegrationToken: mockRevoke,
}));

function makeRequest(body: unknown): Request {
  return new Request("https://example.com/api/integrations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.integrationConnection.findUnique.mockResolvedValue(null);
    mockPrisma.integrationConnection.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "ic_new",
      ...create,
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encrypts the config payload before persisting", async () => {
    const { POST } = await import("@/app/api/integrations/route");
    const response = await POST(makeRequest({ provider: "telegram", name: "Bot", config: { token: "secret-token" } }));
    expect(response.status).toBe(200);
    const upsertArgs = mockPrisma.integrationConnection.upsert.mock.calls[0]?.[0];
    const writtenConfig = upsertArgs?.create?.config as string;
    expect(writtenConfig).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(writtenConfig).not.toContain("secret-token");
  });

  it("logs INTEGRATION_CONNECTED on first connect", async () => {
    const { POST } = await import("@/app/api/integrations/route");
    await POST(makeRequest({ provider: "telegram", name: "Bot", config: {} }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "INTEGRATION_CONNECTED", resourceType: "INTEGRATION_CONNECTION" }),
      }),
    );
  });

  it("logs INTEGRATION_CONFIG_UPDATED on existing-row update", async () => {
    mockPrisma.integrationConnection.findUnique.mockResolvedValueOnce({
      id: "ic_1",
      name: "Bot",
      isActive: true,
      isCustom: false,
    });
    const { POST } = await import("@/app/api/integrations/route");
    await POST(makeRequest({ provider: "telegram", name: "Bot v2", config: { token: "x" } }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "INTEGRATION_CONFIG_UPDATED" }),
      }),
    );
  });

  it("returns 400 when provider/name missing", async () => {
    const { POST } = await import("@/app/api/integrations/route");
    const response = await POST(makeRequest({ provider: "" }));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.integrationConnection.findFirst.mockResolvedValue({
      id: "ic_1",
      provider: "gmail",
      orgId: "org_a",
      userId: "user_a",
      config: "encrypted-blob",
    });
    mockPrisma.integrationConnection.delete.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockRevoke.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls revokeIntegrationToken before deleting", async () => {
    const { DELETE } = await import("@/app/api/integrations/route");
    const response = await DELETE(
      new Request("https://example.com/api/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "ic_1" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith({ provider: "gmail", config: "encrypted-blob" });
    expect(mockPrisma.integrationConnection.delete).toHaveBeenCalledWith({ where: { id: "ic_1" } });
  });

  it("logs INTEGRATION_DISCONNECTED with revoke status", async () => {
    mockRevoke.mockResolvedValueOnce({ ok: false, error: "invalid_token" });
    const { DELETE } = await import("@/app/api/integrations/route");
    await DELETE(
      new Request("https://example.com/api/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "ic_1" }),
      }),
    );
    const auditCall = mockPrisma.auditLog.create.mock.calls[0]?.[0];
    expect(auditCall?.data?.action).toBe("INTEGRATION_DISCONNECTED");
    expect(auditCall?.data?.metadata).toMatchObject({ tokenRevoked: false, revokeError: "invalid_token" });
  });

  it("still deletes when revoke throws", async () => {
    mockRevoke.mockRejectedValueOnce(new Error("network down"));
    const { DELETE } = await import("@/app/api/integrations/route");
    const response = await DELETE(
      new Request("https://example.com/api/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "ic_1" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mockPrisma.integrationConnection.delete).toHaveBeenCalled();
  });

  it("returns 404 when connection is in a different org", async () => {
    mockPrisma.integrationConnection.findFirst.mockResolvedValueOnce(null);
    const { DELETE } = await import("@/app/api/integrations/route");
    const response = await DELETE(
      new Request("https://example.com/api/integrations", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "ic_other" }),
      }),
    );
    expect(response.status).toBe(404);
    expect(mockPrisma.integrationConnection.delete).not.toHaveBeenCalled();
  });
});
