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
    upsert: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));

const mockAdd = vi.hoisted(() =>
  vi.fn<() => Promise<{ ok: boolean; skipped?: true; reason?: string; subscriptionItemId?: string }>>(async () => ({
    ok: true,
    skipped: true,
    reason: "missing_price_env",
  })),
);
const mockRemove = vi.hoisted(() =>
  vi.fn<() => Promise<{ ok: boolean; skipped?: true; reason?: string; subscriptionItemId?: string }>>(async () => ({
    ok: true,
    skipped: true,
    reason: "no_agency_subscription",
  })),
);

vi.mock("@/lib/agency/sub-org-auth", () => ({ requireSubOrgAccess: mockAuth }));
// Sprint 20.1 — configure + toggle now use requireAgencyMutation
// (OWNER/ADMIN gate). Stub it to return an authorized OWNER result;
// the billing-wiring tests don't exercise the role floor.
vi.mock("@/lib/agency/require-agency-mutation", () => ({
  requireAgencyMutation: vi.fn(async () => ({
    ok: true,
    relationship: { id: "rel_1", childOrgId: "sub_a" },
    userId: "user_a",
    agencyOrgId: "org_agency",
    membership: { id: "mem_1", role: "OWNER" },
  })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/billing/module-billing", () => ({
  addModuleSubscriptionItem: mockAdd,
  removeModuleSubscriptionItem: mockRemove,
}));

function makeJsonRequest(body: unknown): import("next/server").NextRequest {
  return new Request("https://example.com/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("configure endpoint billing wiring", () => {
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
      mode: create.mode ?? "pool",
      isActive: create.isActive ?? true,
      encryptedCredentials: create.encryptedCredentials ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("calls addModuleSubscriptionItem when transitioning BYOK → pool with isActive=true", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      mode: "byok_agency",
      isActive: true,
    });
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    await POST(makeJsonRequest({ mode: "pool", isActive: true }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ agencyOrgId: "org_agency", subAccountId: "sub_a", moduleName: "ai" }),
    );
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("calls removeModuleSubscriptionItem when transitioning pool → BYOK", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      mode: "pool",
      isActive: true,
    });
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    await POST(
      makeJsonRequest({
        mode: "byok_agency",
        credentialsOwner: "agency",
        credentials: { anthropicKey: "sk-ant-test" },
      }),
      { params: { id: "rel_1", moduleName: "ai" } },
    );
    expect(mockRemove).toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("does nothing on first pool→pool save (no state change)", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      mode: "pool",
      isActive: true,
    });
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    await POST(makeJsonRequest({ mode: "pool", isActive: true }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("adds when previous row didn't exist and new is pool+active", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    await POST(makeJsonRequest({ mode: "pool", isActive: true }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(mockAdd).toHaveBeenCalled();
  });

  it("never blocks the response when billing throws", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce(null);
    mockAdd.mockRejectedValueOnce(new Error("Stripe unreachable"));
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/configure/route");
    const response = await POST(makeJsonRequest({ mode: "pool", isActive: true }), {
      params: { id: "rel_1", moduleName: "ai" },
    });
    expect(response.status).toBe(200);
    expect(mockPrisma.subAccountModuleConfig.upsert).toHaveBeenCalled();
  });
});

describe("toggle endpoint billing wiring", () => {
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
      mode: create.mode ?? "pool",
      moduleName: create.moduleName ?? "ai",
      isActive: update.isActive ?? create.isActive ?? false,
      updatedAt: new Date(),
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("calls addModuleSubscriptionItem when toggling pool from inactive to active", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      mode: "pool",
      isActive: false,
    });
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/toggle/route");
    await POST(makeJsonRequest({ isActive: true }), { params: { id: "rel_1", moduleName: "ai" } });
    expect(mockAdd).toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("calls removeModuleSubscriptionItem when toggling pool from active to inactive", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      mode: "pool",
      isActive: true,
    });
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/toggle/route");
    await POST(makeJsonRequest({ isActive: false }), { params: { id: "rel_1", moduleName: "ai" } });
    expect(mockRemove).toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("does not call billing when toggling a BYOK row (BYOK is never billed)", async () => {
    mockPrisma.subAccountModuleConfig.findUnique.mockResolvedValueOnce({
      mode: "byok_agency",
      isActive: false,
    });
    mockPrisma.subAccountModuleConfig.upsert.mockImplementationOnce(async () => ({
      id: "smc_1",
      mode: "byok_agency",
      moduleName: "ai",
      isActive: true,
      updatedAt: new Date(),
    }));
    const { POST } = await import("@/app/api/agency/sub-orgs/[id]/modules/[moduleName]/toggle/route");
    await POST(makeJsonRequest({ isActive: true }), { params: { id: "rel_1", moduleName: "ai" } });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
