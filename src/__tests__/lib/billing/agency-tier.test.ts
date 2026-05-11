import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0".repeat(64);
  }
});

const mockPrisma = vi.hoisted(() => ({
  agencyPlatformSubscription: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  TIER_MONTHLY_EUR,
  getAgencyPlatformSubscription,
  getStripePriceIdForTier,
  isAgencyTier,
  resolveAgencyStripeSubscriptionId,
} from "@/lib/billing/agency-tier";

const ORIGINAL_ENV = {
  starter: process.env.STRIPE_PRICE_TIER_STARTER,
  professional: process.env.STRIPE_PRICE_TIER_PROFESSIONAL,
  agency_pro: process.env.STRIPE_PRICE_TIER_AGENCY_PRO,
  enterprise: process.env.STRIPE_PRICE_TIER_ENTERPRISE,
};

function clearTierEnv() {
  delete process.env.STRIPE_PRICE_TIER_STARTER;
  delete process.env.STRIPE_PRICE_TIER_PROFESSIONAL;
  delete process.env.STRIPE_PRICE_TIER_AGENCY_PRO;
  delete process.env.STRIPE_PRICE_TIER_ENTERPRISE;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearTierEnv();
  mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  process.env.STRIPE_PRICE_TIER_STARTER = ORIGINAL_ENV.starter;
  process.env.STRIPE_PRICE_TIER_PROFESSIONAL = ORIGINAL_ENV.professional;
  process.env.STRIPE_PRICE_TIER_AGENCY_PRO = ORIGINAL_ENV.agency_pro;
  process.env.STRIPE_PRICE_TIER_ENTERPRISE = ORIGINAL_ENV.enterprise;
});

describe("isAgencyTier", () => {
  it("accepts the four canonical tiers", () => {
    expect(isAgencyTier("starter")).toBe(true);
    expect(isAgencyTier("professional")).toBe(true);
    expect(isAgencyTier("agency_pro")).toBe(true);
    expect(isAgencyTier("enterprise")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAgencyTier("STARTER")).toBe(false);
    expect(isAgencyTier("agency-pro")).toBe(false);
    expect(isAgencyTier("free")).toBe(false);
    expect(isAgencyTier(null)).toBe(false);
    expect(isAgencyTier(undefined)).toBe(false);
    expect(isAgencyTier(123)).toBe(false);
  });
});

describe("getStripePriceIdForTier", () => {
  it("returns null when the per-tier env var is unset", () => {
    expect(getStripePriceIdForTier("starter")).toBeNull();
    expect(getStripePriceIdForTier("enterprise")).toBeNull();
  });

  it("returns the trimmed env value when set", () => {
    process.env.STRIPE_PRICE_TIER_STARTER = " price_starter ";
    expect(getStripePriceIdForTier("starter")).toBe("price_starter");
  });

  it("returns null when the env var is whitespace only", () => {
    process.env.STRIPE_PRICE_TIER_AGENCY_PRO = "   ";
    expect(getStripePriceIdForTier("agency_pro")).toBeNull();
  });
});

describe("TIER_MONTHLY_EUR pricing table", () => {
  it("matches the four canonical prices specified in the sprint", () => {
    expect(TIER_MONTHLY_EUR.starter).toBe(97);
    expect(TIER_MONTHLY_EUR.professional).toBe(297);
    expect(TIER_MONTHLY_EUR.agency_pro).toBe(497);
    expect(TIER_MONTHLY_EUR.enterprise).toBe(997);
  });
});

describe("resolveAgencyStripeSubscriptionId", () => {
  it("returns null when no row exists for the org", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce(null);
    expect(await resolveAgencyStripeSubscriptionId("org_x")).toBeNull();
  });

  it("returns null when the row exists but stripeSubscriptionId is null", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: null,
      status: "incomplete",
    });
    expect(await resolveAgencyStripeSubscriptionId("org_x")).toBeNull();
  });

  it("returns the subscription id when status is active", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: "sub_active",
      status: "active",
    });
    expect(await resolveAgencyStripeSubscriptionId("org_x")).toBe("sub_active");
  });

  it("returns the subscription id when status is trialing", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: "sub_trial",
      status: "trialing",
    });
    expect(await resolveAgencyStripeSubscriptionId("org_x")).toBe("sub_trial");
  });

  it("refuses past_due / canceled / unpaid / incomplete to block billing against dead subs", async () => {
    for (const status of ["past_due", "canceled", "unpaid", "incomplete"]) {
      mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
        stripeSubscriptionId: "sub_x",
        status,
      });
      expect(await resolveAgencyStripeSubscriptionId("org_x")).toBeNull();
    }
  });
});

describe("getAgencyPlatformSubscription", () => {
  it("forwards the orgId to the prisma lookup", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({ orgId: "org_a" });
    await getAgencyPlatformSubscription("org_a");
    expect(mockPrisma.agencyPlatformSubscription.findUnique).toHaveBeenCalledWith({
      where: { orgId: "org_a" },
    });
  });
});

describe("module-billing → agency-tier integration", () => {
  it("module-billing.resolveAgencyStripeSubscriptionId delegates to agency-tier and respects status gating", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: "sub_active",
      status: "active",
    });
    const { resolveAgencyStripeSubscriptionId: viaModuleBilling } = await import(
      "@/lib/billing/module-billing"
    );
    expect(await viaModuleBilling("org_x")).toBe("sub_active");
  });

  it("module-billing returns null when subscription is canceled", async () => {
    mockPrisma.agencyPlatformSubscription.findUnique.mockResolvedValueOnce({
      stripeSubscriptionId: "sub_dead",
      status: "canceled",
    });
    const { resolveAgencyStripeSubscriptionId: viaModuleBilling } = await import(
      "@/lib/billing/module-billing"
    );
    expect(await viaModuleBilling("org_x")).toBeNull();
  });
});
