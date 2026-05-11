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
  agencyPlatformSubscription: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));

const mockStripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => mockStripe }));

const ORIGINAL_ENV = process.env.STRIPE_PRICE_TIER_STARTER;

function jsonRequest(body: unknown): import("next/server").NextRequest {
  return new Request("https://example.com/api/agency/billing/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_a", orgId: "org_agency" });
  process.env.STRIPE_PRICE_TIER_STARTER = "price_starter_test";
  mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue({ email: "owner@example.com", companyName: "Hephaistos" });
  mockStripe.customers.create.mockResolvedValue({ id: "cus_new" });
  mockStripe.checkout.sessions.create.mockResolvedValue({ id: "cs_new", url: "https://stripe/checkout/cs_new" });
  mockPrisma.agencyPlatformSubscription.upsert.mockImplementation(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
    id: "aps_1",
    ...create,
    ...update,
  }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

afterEach(() => {
  process.env.STRIPE_PRICE_TIER_STARTER = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

describe("POST /api/agency/billing/subscribe", () => {
  it("returns 401 without auth", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    const response = await POST(jsonRequest({ tier: "starter" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 when no active organization", async () => {
    mockAuth.mockResolvedValueOnce({ userId: "user_a", orgId: null });
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    const response = await POST(jsonRequest({ tier: "starter" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 on invalid tier", async () => {
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    const response = await POST(jsonRequest({ tier: "garbage" }));
    expect(response.status).toBe(400);
  });

  it("returns 503 when the tier env var is missing", async () => {
    delete process.env.STRIPE_PRICE_TIER_STARTER;
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    const response = await POST(jsonRequest({ tier: "starter" }));
    expect(response.status).toBe(503);
  });

  it("creates a Stripe customer when none exists and returns checkout URL", async () => {
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    const response = await POST(jsonRequest({ tier: "starter" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkoutUrl).toBe("https://stripe/checkout/cs_new");
    expect(body.tier).toBe("starter");
    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        metadata: expect.objectContaining({ kiln_agency_org_id: "org_agency", kiln_owner_user_id: "user_a" }),
      }),
    );
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        mode: "subscription",
        line_items: [{ price: "price_starter_test", quantity: 1 }],
      }),
    );
    expect(mockPrisma.agencyPlatformSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org_agency" },
      }),
    );
  });

  it("reuses an existing incomplete row's customer id (no duplicate Stripe customer)", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      status: "incomplete",
      tier: "starter",
    });
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    await POST(jsonRequest({ tier: "starter" }));
    expect(mockStripe.customers.create).not.toHaveBeenCalled();
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    );
  });

  it("blocks with 409 when an active subscription already exists (must use change-tier)", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_x",
      status: "active",
      tier: "professional",
    });
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    // tier=starter to reuse the only env var set in beforeEach; the 409
    // check fires regardless of which valid tier is requested.
    const response = await POST(jsonRequest({ tier: "starter" }));
    expect(response.status).toBe(409);
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("emits an AGENCY_SUBSCRIPTION_CHECKOUT_STARTED audit entry", async () => {
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    await POST(jsonRequest({ tier: "starter" }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "AGENCY_SUBSCRIPTION_CHECKOUT_STARTED" }),
      }),
    );
  });

  it("stamps subscription_data.metadata so webhooks can match by org id", async () => {
    const { POST } = await import("@/app/api/agency/billing/subscribe/route");
    await POST(jsonRequest({ tier: "starter" }));
    const sessionArgs = mockStripe.checkout.sessions.create.mock.calls[0]?.[0];
    expect(sessionArgs?.subscription_data?.metadata?.kiln_agency_org_id).toBe("org_agency");
    expect(sessionArgs?.subscription_data?.metadata?.kiln_tier).toBe("starter");
  });
});
