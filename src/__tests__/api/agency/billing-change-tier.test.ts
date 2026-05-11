import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockAuth = vi.hoisted(() =>
  vi.fn<() => Promise<{ userId: string | null; orgId: string | null }>>(async () => ({
    userId: "user_a",
    orgId: "org_agency",
  })),
);

const mockPrisma = vi.hoisted(() => ({
  agencyPlatformSubscription: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));

const mockStripe = vi.hoisted(() => ({
  subscriptionItems: { update: vi.fn() },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => mockStripe }));

const ORIGINAL_ENV = process.env.STRIPE_PRICE_TIER_AGENCY_PRO;

function jsonRequest(body: unknown): import("next/server").NextRequest {
  return new Request("https://example.com/api/agency/billing/change-tier", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_a", orgId: "org_agency" });
  process.env.STRIPE_PRICE_TIER_AGENCY_PRO = "price_agency_pro";
  mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValue({
    id: "aps_1",
    tier: "starter",
    status: "active",
    stripeSubscriptionId: "sub_a",
    tierSubscriptionItemId: "si_tier",
  });
  mockPrisma.agencyPlatformSubscription.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "aps_1",
    tier: data.tier,
    status: "active",
  }));
  mockStripe.subscriptionItems.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
});

afterEach(() => {
  process.env.STRIPE_PRICE_TIER_AGENCY_PRO = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe("POST /api/agency/billing/change-tier", () => {
  it("returns 401 without auth", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const { POST } = await import("@/app/api/agency/billing/change-tier/route");
    const response = await POST(jsonRequest({ tier: "agency_pro" }));
    expect(response.status).toBe(401);
  });

  it("returns 404 when there is no subscription yet", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/agency/billing/change-tier/route");
    const response = await POST(jsonRequest({ tier: "agency_pro" }));
    expect(response.status).toBe(404);
  });

  it("returns 409 when subscription status is canceled", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      tier: "starter",
      status: "canceled",
      stripeSubscriptionId: "sub_x",
      tierSubscriptionItemId: "si_t",
    });
    const { POST } = await import("@/app/api/agency/billing/change-tier/route");
    const response = await POST(jsonRequest({ tier: "agency_pro" }));
    expect(response.status).toBe(409);
  });

  it("is a no-op when the requested tier matches the current tier", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      tier: "agency_pro",
      status: "active",
      stripeSubscriptionId: "sub_a",
      tierSubscriptionItemId: "si_t",
    });
    const { POST } = await import("@/app/api/agency/billing/change-tier/route");
    const response = await POST(jsonRequest({ tier: "agency_pro" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.unchanged).toBe(true);
    expect(mockStripe.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it("swaps the tier line item with create_prorations when active", async () => {
    const { POST } = await import("@/app/api/agency/billing/change-tier/route");
    const response = await POST(jsonRequest({ tier: "agency_pro" }));
    expect(response.status).toBe(200);
    expect(mockStripe.subscriptionItems.update).toHaveBeenCalledWith(
      "si_tier",
      expect.objectContaining({ price: "price_agency_pro", proration_behavior: "create_prorations" }),
    );
  });

  it("emits AGENCY_SUBSCRIPTION_TIER_CHANGED audit", async () => {
    const { POST } = await import("@/app/api/agency/billing/change-tier/route");
    await POST(jsonRequest({ tier: "agency_pro" }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "AGENCY_SUBSCRIPTION_TIER_CHANGED" }) }),
    );
  });

  it("returns 409 when tierSubscriptionItemId is missing on the row", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      tier: "starter",
      status: "active",
      stripeSubscriptionId: "sub_a",
      tierSubscriptionItemId: null,
    });
    const { POST } = await import("@/app/api/agency/billing/change-tier/route");
    const response = await POST(jsonRequest({ tier: "agency_pro" }));
    expect(response.status).toBe(409);
  });
});
