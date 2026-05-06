/**
 * Tests for the Phase 4 sub-org pricing helpers — createSubOrgPricing
 * and createBrandedCheckoutSession. Mocks Stripe SDK; verifies that:
 *
 *   - Both prices land on the same Product (one per sub-org).
 *   - Setup price has no `recurring` block; monthly price has month interval.
 *   - Trial days propagate to subscription_data.trial_period_days.
 *   - The setup line item appears as the first checkout line so it
 *     shows above the recurring item on the hosted page.
 *   - Existing product is reused + renamed; not duplicated.
 *   - Zero-price branches skip Stripe creation calls cleanly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const productsCreate = vi.fn();
  const productsUpdate = vi.fn();
  const pricesCreate = vi.fn();
  const checkoutSessionsCreate = vi.fn();
  return {
    productsCreate,
    productsUpdate,
    pricesCreate,
    checkoutSessionsCreate,
    getStripe: vi.fn(() => ({
      products: { create: productsCreate, update: productsUpdate },
      prices: { create: pricesCreate },
      checkout: { sessions: { create: checkoutSessionsCreate } },
    })),
  };
});

vi.mock("@/lib/stripe", () => ({ getStripe: mocks.getStripe }));

import {
  createSubOrgPricing,
  createBrandedCheckoutSession,
} from "@/lib/stripe/connect-pricing";

beforeEach(() => {
  mocks.productsCreate.mockReset();
  mocks.productsUpdate.mockReset();
  mocks.pricesCreate.mockReset();
  mocks.checkoutSessionsCreate.mockReset();
});

describe("createSubOrgPricing", () => {
  it("creates a fresh product + monthly + setup prices on first call", async () => {
    mocks.productsCreate.mockResolvedValueOnce({ id: "prod_new" });
    mocks.pricesCreate
      .mockResolvedValueOnce({ id: "price_monthly_new" })
      .mockResolvedValueOnce({ id: "price_setup_new" });

    const result = await createSubOrgPricing({
      agencyAccountId: "acct_x",
      subOrgId: "org_sub",
      subOrgName: "Acme Inc.",
      monthlyPriceCents: 19700,
      setupFeeCents: 49000,
      currency: "eur",
    });

    expect(result).toEqual({
      productId: "prod_new",
      monthlyPriceId: "price_monthly_new",
      setupPriceId: "price_setup_new",
    });
    expect(mocks.productsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Acme Inc. Subscription",
        metadata: { kilnSubOrgId: "org_sub" },
      }),
      { stripeAccount: "acct_x" }
    );
    // Monthly price has a recurring block; setup price does not.
    expect(mocks.pricesCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        product: "prod_new",
        unit_amount: 19700,
        currency: "eur",
        recurring: { interval: "month" },
      }),
      { stripeAccount: "acct_x" }
    );
    expect(mocks.pricesCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        product: "prod_new",
        unit_amount: 49000,
        currency: "eur",
      }),
      { stripeAccount: "acct_x" }
    );
    const setupCall = mocks.pricesCreate.mock.calls[1][0] as Record<
      string,
      unknown
    >;
    expect(setupCall.recurring).toBeUndefined();
  });

  it("reuses + renames an existing product instead of creating a duplicate", async () => {
    mocks.productsUpdate.mockResolvedValueOnce({ id: "prod_existing" });
    mocks.pricesCreate.mockResolvedValueOnce({ id: "price_monthly_2" });

    const result = await createSubOrgPricing({
      agencyAccountId: "acct_x",
      subOrgId: "org_sub",
      subOrgName: "Acme (renamed)",
      monthlyPriceCents: 9900,
      existingProductId: "prod_existing",
    });

    expect(result.productId).toBe("prod_existing");
    expect(result.monthlyPriceId).toBe("price_monthly_2");
    expect(result.setupPriceId).toBeNull();
    expect(mocks.productsCreate).not.toHaveBeenCalled();
    expect(mocks.productsUpdate).toHaveBeenCalledWith(
      "prod_existing",
      { name: "Acme (renamed) Subscription" },
      { stripeAccount: "acct_x" }
    );
  });

  it("skips price creation cleanly when amounts are zero", async () => {
    mocks.productsCreate.mockResolvedValueOnce({ id: "prod_x" });

    const result = await createSubOrgPricing({
      agencyAccountId: "acct_x",
      subOrgId: "org_sub",
      subOrgName: "Free tier",
      monthlyPriceCents: 0,
      setupFeeCents: 0,
    });

    expect(result.monthlyPriceId).toBeNull();
    expect(result.setupPriceId).toBeNull();
    expect(mocks.pricesCreate).not.toHaveBeenCalled();
  });
});

describe("createBrandedCheckoutSession", () => {
  it("attaches setup line item first, then monthly; trial → subscription_data", async () => {
    mocks.checkoutSessionsCreate.mockResolvedValueOnce({
      id: "cs_test",
      url: "https://checkout.stripe.com/c/x",
    });

    const session = await createBrandedCheckoutSession({
      agencyAccountId: "acct_x",
      monthlyPriceId: "price_monthly",
      setupPriceId: "price_setup",
      trialDays: 14,
      successUrl: "https://k/success",
      cancelUrl: "https://k/cancel",
      customerEmail: "client@acme.test",
      subOrgId: "org_sub",
      parentAgencyOrgId: "org_agency",
    });

    expect(session).toEqual({
      sessionId: "cs_test",
      url: "https://checkout.stripe.com/c/x",
    });
    const args = mocks.checkoutSessionsCreate.mock.calls[0][0] as {
      line_items: Array<{ price: string }>;
      subscription_data: { trial_period_days?: number };
    };
    // Setup first so it's the top line on the hosted checkout page.
    expect(args.line_items[0].price).toBe("price_setup");
    expect(args.line_items[1].price).toBe("price_monthly");
    expect(args.subscription_data.trial_period_days).toBe(14);
  });

  it("omits trial when not configured + skips setup line when no setup price", async () => {
    mocks.checkoutSessionsCreate.mockResolvedValueOnce({
      id: "cs_2",
      url: "https://checkout.stripe.com/c/y",
    });

    await createBrandedCheckoutSession({
      agencyAccountId: "acct_x",
      monthlyPriceId: "price_monthly",
      successUrl: "https://k/success",
      cancelUrl: "https://k/cancel",
      subOrgId: "org_sub",
      parentAgencyOrgId: "org_agency",
    });

    const args = mocks.checkoutSessionsCreate.mock.calls[0][0] as {
      line_items: Array<{ price: string }>;
      subscription_data: { trial_period_days?: number };
    };
    expect(args.line_items).toHaveLength(1);
    expect(args.line_items[0].price).toBe("price_monthly");
    expect(args.subscription_data.trial_period_days).toBeUndefined();
  });

  it("forwards sub-org + agency org IDs into both metadata buckets", async () => {
    mocks.checkoutSessionsCreate.mockResolvedValueOnce({
      id: "cs_3",
      url: "https://checkout.stripe.com/c/z",
    });

    await createBrandedCheckoutSession({
      agencyAccountId: "acct_x",
      monthlyPriceId: "price_monthly",
      successUrl: "https://k/s",
      cancelUrl: "https://k/c",
      subOrgId: "org_sub",
      parentAgencyOrgId: "org_agency",
    });

    const args = mocks.checkoutSessionsCreate.mock.calls[0][0] as {
      metadata: Record<string, string>;
      subscription_data: { metadata: Record<string, string> };
    };
    expect(args.metadata.kilnSubOrgId).toBe("org_sub");
    expect(args.metadata.kilnParentAgencyOrgId).toBe("org_agency");
    expect(args.subscription_data.metadata.kilnSubOrgId).toBe("org_sub");
    expect(args.subscription_data.metadata.kilnParentAgencyOrgId).toBe(
      "org_agency"
    );
  });
});
