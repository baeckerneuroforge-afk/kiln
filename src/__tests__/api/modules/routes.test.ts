import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockAuth = vi.hoisted(() =>
  vi.fn<() => Promise<{
    ok: boolean;
    relationship?: { id: string; childOrgId: string };
    userId?: string;
    agencyOrgId?: string;
    response?: Response;
  }>>(async () => ({
    ok: true,
    relationship: { id: "rel_1", childOrgId: "sub_a" },
    userId: "user_a",
    agencyOrgId: "org_agency",
  })),
);

const mockPrisma = vi.hoisted(() => ({
  subAccountModuleConfig: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/agency/sub-org-auth", () => ({
  requireSubOrgAccess: mockAuth,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function makeJsonRequest(body: unknown): import("next/server").NextRequest {
  return new Request("https://example.com/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST configure route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      ok: true,
      relationship: { id: "rel_1", childOrgId: "sub_a" },
      userId: "user_a",
      agencyOrgId: "org_agency",
    });
    mockPrisma.subAccountModuleConfig.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "smc_new",
      ...create,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("rejects unknown module names", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(makeJsonRequest({ mode: "pool" }), {
      params: { id: "rel_1", moduleName: "bogus" },
    });
    expect(response.status).toBe(400);
  });

  it("rejects invalid mode", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(makeJsonRequest({ mode: "freemium" }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(response.status).toBe(400);
  });

  it("requires credentials for BYOK modes", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(makeJsonRequest({ mode: "byok_agency" }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(response.status).toBe(400);
  });

  it("rejects credentials when mode=pool", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(makeJsonRequest({ mode: "pool", credentials: { anthropicKey: "sk-ant-x" } }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(response.status).toBe(400);
  });

  it("requires credentialsOwner for BYOK", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(
      makeJsonRequest({ mode: "byok_agency", credentials: { anthropicKey: "sk-ant-real" } }),
      { params: { id: "rel_1", moduleName: "ai" } },
    );
    expect(response.status).toBe(400);
  });

  it("validates Anthropic key prefix", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(
      makeJsonRequest({
        mode: "byok_agency",
        credentialsOwner: "agency",
        credentials: { anthropicKey: "no-prefix" },
      }),
      { params: { id: "rel_1", moduleName: "ai" } },
    );
    expect(response.status).toBe(400);
  });

  it("validates Twilio accountSid prefix", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(
      makeJsonRequest({
        mode: "byok_customer",
        credentialsOwner: "owner@x.test",
        credentials: { accountSid: "no-ac-prefix", authToken: "token" },
      }),
      { params: { id: "rel_1", moduleName: "sms" } },
    );
    expect(response.status).toBe(400);
  });

  it("persists encrypted credentials and writes audit log", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(
      makeJsonRequest({
        mode: "byok_agency",
        credentialsOwner: "agency",
        credentials: { anthropicKey: "sk-ant-good" },
      }),
      { params: { id: "rel_1", moduleName: "ai" } },
    );
    expect(response.status).toBe(200);
    const create = mockPrisma.subAccountModuleConfig.upsert.mock.calls[0]?.[0]?.create as Record<string, unknown>;
    expect(create?.encryptedCredentials).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(create?.encryptedCredentials).not.toContain("sk-ant-good");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MODULE_CONFIG_UPDATED" }),
      }),
    );
  });

  it("propagates auth failure response", async () => {
    mockAuth.mockResolvedValueOnce({ ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(makeJsonRequest({ mode: "pool" }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(response.status).toBe(401);
  });
});

describe("POST toggle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      ok: true,
      relationship: { id: "rel_1", childOrgId: "sub_a" },
      userId: "user_a",
      agencyOrgId: "org_agency",
    });
    mockPrisma.subAccountModuleConfig.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
      id: "smc_1",
      moduleName: create.moduleName ?? "ai",
      mode: create.mode ?? "pool",
      isActive: update.isActive ?? create.isActive ?? false,
      updatedAt: new Date(),
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("requires isActive boolean", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/toggle/route");
    const response = await POST(makeJsonRequest({}), { params: { id: "rel_1", moduleName: "ai" } });
    expect(response.status).toBe(400);
  });

  it("audits with MODULE_ACTIVATED / MODULE_DEACTIVATED", async () => {
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/toggle/route");
    await POST(makeJsonRequest({ isActive: true }), { params: { id: "rel_1", moduleName: "ai" } });
    // The billing service may emit MODULE_BILLING_SKIPPED first when env
    // is unset; the user-facing toggle audit is whichever entry matches
    // the toggle action. Scan rather than indexing.
    const actions = mockPrisma.auditLog.create.mock.calls.map((c) => c?.[0]?.data?.action);
    expect(actions).toContain("MODULE_ACTIVATED");

    mockPrisma.auditLog.create.mockClear();
    await POST(makeJsonRequest({ isActive: false }), { params: { id: "rel_1", moduleName: "sms" } });
    const actions2 = mockPrisma.auditLog.create.mock.calls.map((c) => c?.[0]?.data?.action);
    expect(actions2).toContain("MODULE_DEACTIVATED");
  });
});

describe("GET modules route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      ok: true,
      relationship: { id: "rel_1", childOrgId: "sub_a" },
      userId: "user_a",
      agencyOrgId: "org_agency",
    });
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValue([]);
    mockPrisma.subAccountModuleConfig.upsert.mockImplementation(async () => ({
      id: "x",
      moduleName: "ai",
      mode: "pool",
      isActive: false,
      encryptedCredentials: null,
      credentialsOwner: null,
      lastValidatedAt: null,
      validationError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  it("returns the four module names and never leaks encrypted credentials", async () => {
    mockPrisma.subAccountModuleConfig.findMany.mockResolvedValueOnce([
      {
        id: "smc_1",
        subAccountId: "sub_a",
        moduleName: "ai",
        mode: "byok_agency",
        isActive: true,
        encryptedCredentials: "secret-ciphertext",
        credentialsOwner: "agency",
        lastValidatedAt: null,
        validationError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const { GET } = await import("@/app/api/agency/sub-orgs/[id]/modules/route");
    const response = await GET(
      new Request("https://example.com/x") as unknown as import("next/server").NextRequest,
      { params: { id: "rel_1" } },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.moduleNames).toEqual(["ai", "sms", "voice", "whatsapp"]);
    expect(body.configs[0]).toMatchObject({ moduleName: "ai", hasCredentials: true });
    expect(JSON.stringify(body)).not.toContain("secret-ciphertext");
  });
});
