/**
 * Smoke tests for the Stripe Connect lib.
 * Mocks the Stripe SDK + Prisma; verifies onboarding is idempotent at
 * the org level, refresh derives the four readiness flags correctly,
 * and disconnect deletes only the local row (never deletes from Stripe).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const accountsCreate = vi.fn();
  const accountsRetrieve = vi.fn();
  const accountLinksCreate = vi.fn();
  return {
    accountsCreate,
    accountsRetrieve,
    accountLinksCreate,
    getStripe: vi.fn(() => ({
      accounts: { create: accountsCreate, retrieve: accountsRetrieve },
      accountLinks: { create: accountLinksCreate },
    })),
  };
});
const mockStripeAccountsCreate = mocks.accountsCreate;
const mockStripeAccountsRetrieve = mocks.accountsRetrieve;
const mockStripeAccountLinksCreate = mocks.accountLinksCreate;

vi.mock("@/lib/stripe", () => ({
  getStripe: mocks.getStripe,
}));

const mockPrisma = vi.hoisted(() => ({
  agencyStripeAccount: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  createConnectAccount,
  createOnboardingLink,
  disconnectAccount,
  refreshAccountStatus,
} from "@/lib/stripe/connect";

beforeEach(() => {
  mockStripeAccountsCreate.mockReset();
  mockStripeAccountsRetrieve.mockReset();
  mockStripeAccountLinksCreate.mockReset();
  Object.values(mockPrisma.agencyStripeAccount).forEach((fn) => fn.mockReset());
});

describe("createConnectAccount", () => {
  it("creates a fresh Stripe Express account + DB row when none exists", async () => {
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce(null);
    mockStripeAccountsCreate.mockResolvedValueOnce({ id: "acct_new" });
    mockPrisma.agencyStripeAccount.create.mockResolvedValueOnce({
      id: "row_1",
      orgId: "org_acme",
      stripeAccountId: "acct_new",
      onboardingComplete: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
      chargesEnabled: false,
      requirementsJson: null,
      lastSyncedAt: null,
    });

    const row = await createConnectAccount("org_acme", "owner@acme.test");

    expect(row.stripeAccountId).toBe("acct_new");
    expect(mockStripeAccountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        email: "owner@acme.test",
        metadata: expect.objectContaining({ orgId: "org_acme" }),
      })
    );
  });

  it("is idempotent at the org level — returns the existing row", async () => {
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce({
      id: "row_1",
      orgId: "org_acme",
      stripeAccountId: "acct_existing",
    });

    const row = await createConnectAccount("org_acme", "owner@acme.test");
    expect(row.stripeAccountId).toBe("acct_existing");
    expect(mockStripeAccountsCreate).not.toHaveBeenCalled();
    expect(mockPrisma.agencyStripeAccount.create).not.toHaveBeenCalled();
  });
});

describe("createOnboardingLink", () => {
  it("returns the Stripe-hosted onboarding URL", async () => {
    mockStripeAccountLinksCreate.mockResolvedValueOnce({
      url: "https://connect.stripe.com/setup/e/x",
      expires_at: 1234567890,
    });
    const link = await createOnboardingLink(
      "acct_x",
      "https://k/return",
      "https://k/refresh"
    );
    expect(link.url).toContain("https://connect.stripe.com");
    expect(mockStripeAccountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_x",
        type: "account_onboarding",
        return_url: "https://k/return",
        refresh_url: "https://k/refresh",
      })
    );
  });
});

describe("refreshAccountStatus", () => {
  it("derives onboardingComplete only when all three flags are true", async () => {
    mockStripeAccountsRetrieve.mockResolvedValueOnce({
      id: "acct_x",
      details_submitted: true,
      payouts_enabled: true,
      charges_enabled: true,
      requirements: { currently_due: [] },
    });
    mockPrisma.agencyStripeAccount.update.mockImplementationOnce(
      ({ data }) => Promise.resolve({ stripeAccountId: "acct_x", ...data })
    );

    const row = await refreshAccountStatus("acct_x");
    expect(row.onboardingComplete).toBe(true);
    expect(mockPrisma.agencyStripeAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeAccountId: "acct_x" },
        data: expect.objectContaining({
          detailsSubmitted: true,
          payoutsEnabled: true,
          chargesEnabled: true,
          onboardingComplete: true,
        }),
      })
    );
  });

  it("flips onboardingComplete to false when any flag is missing", async () => {
    mockStripeAccountsRetrieve.mockResolvedValueOnce({
      id: "acct_x",
      details_submitted: true,
      payouts_enabled: false, // ← still pending
      charges_enabled: true,
      requirements: null,
    });
    mockPrisma.agencyStripeAccount.update.mockImplementationOnce(
      ({ data }) => Promise.resolve({ stripeAccountId: "acct_x", ...data })
    );

    const row = await refreshAccountStatus("acct_x");
    expect(row.onboardingComplete).toBe(false);
    expect(row.payoutsEnabled).toBe(false);
  });
});

describe("disconnectAccount", () => {
  it("deletes the local row and returns it; never calls Stripe", async () => {
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce({
      id: "row_1",
      orgId: "org_acme",
      stripeAccountId: "acct_x",
    });
    mockPrisma.agencyStripeAccount.delete.mockResolvedValueOnce({});

    const removed = await disconnectAccount("org_acme");
    expect(removed?.stripeAccountId).toBe("acct_x");
    expect(mockPrisma.agencyStripeAccount.delete).toHaveBeenCalledWith({
      where: { orgId: "org_acme" },
    });
    // Critical: the Stripe-side account is NOT deleted.
    expect(mockStripeAccountsRetrieve).not.toHaveBeenCalled();
    expect(mockStripeAccountsCreate).not.toHaveBeenCalled();
  });

  it("is a no-op when the org never connected", async () => {
    mockPrisma.agencyStripeAccount.findUnique.mockResolvedValueOnce(null);
    const removed = await disconnectAccount("org_unknown");
    expect(removed).toBeNull();
    expect(mockPrisma.agencyStripeAccount.delete).not.toHaveBeenCalled();
  });
});
