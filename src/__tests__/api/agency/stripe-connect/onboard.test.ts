/**
 * Smoke tests for /api/agency/stripe-connect/onboard.
 *
 * Verifies plan gating (canConnectStripe), org context, and that the
 * happy path delegates to the Connect lib correctly. Stripe SDK + DB
 * are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ADMIN_ENV = process.env.ADMIN_USER_IDS;
const AGENCY_USER = "user_agency_onboard_test";
const AGENCY_ORG = "org_agency_onboard";

beforeAll(() => {
  process.env.ADMIN_USER_IDS = "";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.kiln.test";
});
afterAll(() => {
  if (ORIGINAL_ADMIN_ENV === undefined) {
    delete process.env.ADMIN_USER_IDS;
  } else {
    process.env.ADMIN_USER_IDS = ORIGINAL_ADMIN_ENV;
  }
});

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
const mockGetUserEmail = vi.hoisted(() => vi.fn());
const mockGetConnectAccount = vi.hoisted(() => vi.fn());
const mockCreateConnectAccount = vi.hoisted(() => vi.fn());
const mockCreateOnboardingLink = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/clerk-user-email", () => ({
  getUserEmailOrPlaceholder: mockGetUserEmail,
}));
vi.mock("@/lib/stripe/connect", () => ({
  getConnectAccount: mockGetConnectAccount,
  createConnectAccount: mockCreateConnectAccount,
  createOnboardingLink: mockCreateOnboardingLink,
}));

import { POST as onboardPOST } from "@/app/api/agency/stripe-connect/onboard/route";

beforeEach(() => {
  mockAuth.mockReset();
  mockPrisma.user.findUnique.mockReset();
  mockGetUserEmail.mockReset();
  mockGetConnectAccount.mockReset();
  mockCreateConnectAccount.mockReset();
  mockCreateOnboardingLink.mockReset();
});

describe("POST /api/agency/stripe-connect/onboard", () => {
  it("401 without auth", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null });
    const res = await onboardPOST();
    expect(res.status).toBe(401);
  });

  it("400 without active org", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: null });
    const res = await onboardPOST();
    expect(res.status).toBe(400);
  });

  it("403 when caller is on PRO (no Stripe Connect)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "PRO" });
    const res = await onboardPOST();
    expect(res.status).toBe(403);
  });

  it("403 when caller is on BUSINESS (sub-orgs but no Stripe Connect)", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "BUSINESS" });
    const res = await onboardPOST();
    expect(res.status).toBe(403);
  });

  it("happy path: AGENCY first-time onboarding creates account + link", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockGetUserEmail.mockResolvedValueOnce("owner@acme.test");
    mockGetConnectAccount.mockResolvedValueOnce(null);
    mockCreateConnectAccount.mockResolvedValueOnce({
      stripeAccountId: "acct_new",
    });
    mockCreateOnboardingLink.mockResolvedValueOnce({
      url: "https://connect.stripe.com/setup/e/x",
    });

    const res = await onboardPOST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toContain("connect.stripe.com");
    expect(body.stripeAccountId).toBe("acct_new");
    expect(mockCreateConnectAccount).toHaveBeenCalledWith(
      AGENCY_ORG,
      "owner@acme.test"
    );
  });

  it("idempotent: AGENCY with existing account just refreshes the link", async () => {
    mockAuth.mockResolvedValueOnce({ userId: AGENCY_USER, orgId: AGENCY_ORG });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ plan: "AGENCY" });
    mockGetUserEmail.mockResolvedValueOnce("owner@acme.test");
    mockGetConnectAccount.mockResolvedValueOnce({
      stripeAccountId: "acct_existing",
    });
    mockCreateOnboardingLink.mockResolvedValueOnce({
      url: "https://connect.stripe.com/setup/e/y",
    });

    const res = await onboardPOST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stripeAccountId).toBe("acct_existing");
    expect(mockCreateConnectAccount).not.toHaveBeenCalled();
  });
});
