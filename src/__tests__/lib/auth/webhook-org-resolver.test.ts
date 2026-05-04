import { afterEach, describe, expect, it, vi } from "vitest";

const mockUserFindFirst = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockAgentFindUnique = vi.hoisted(() => vi.fn());
const mockResellerFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: mockUserFindFirst,
      findUnique: mockUserFindUnique,
    },
    agent: {
      findUnique: mockAgentFindUnique,
    },
    resellerAccount: {
      findUnique: mockResellerFindUnique,
    },
  },
}));

import {
  resolveOrgFromAgentId,
  resolveOrgFromAgentSlug,
  resolveOrgFromStripeConnectAccount,
  resolveOrgFromStripeCustomer,
} from "@/lib/auth/webhook-org-resolver";

describe("webhook-org-resolver", () => {
  afterEach(() => {
    mockUserFindFirst.mockReset();
    mockUserFindUnique.mockReset();
    mockAgentFindUnique.mockReset();
    mockResellerFindUnique.mockReset();
  });

  describe("resolveOrgFromStripeCustomer", () => {
    it("maps a Stripe customer to its user's personal org", async () => {
      mockUserFindFirst.mockResolvedValueOnce({ id: "u1", personalOrgId: "org_p" });
      const r = await resolveOrgFromStripeCustomer("cus_123");
      expect(r).toEqual({ userId: "u1", orgId: "org_p" });
    });

    it("returns null when customer is unknown", async () => {
      mockUserFindFirst.mockResolvedValueOnce(null);
      expect(await resolveOrgFromStripeCustomer("cus_x")).toBeNull();
    });

    it("returns null on empty input without hitting the DB", async () => {
      expect(await resolveOrgFromStripeCustomer("")).toBeNull();
      expect(mockUserFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("resolveOrgFromAgentId", () => {
    it("uses the agent's own orgId when set", async () => {
      mockAgentFindUnique.mockResolvedValueOnce({ userId: "u1", orgId: "org_a" });
      const r = await resolveOrgFromAgentId("a1");
      expect(r).toEqual({ userId: "u1", orgId: "org_a" });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it("falls back to the user's personalOrgId for legacy agents", async () => {
      mockAgentFindUnique.mockResolvedValueOnce({ userId: "u1", orgId: null });
      mockUserFindUnique.mockResolvedValueOnce({ personalOrgId: "org_p" });
      const r = await resolveOrgFromAgentId("a1");
      expect(r).toEqual({ userId: "u1", orgId: "org_p" });
    });

    it("returns null for unknown agents", async () => {
      mockAgentFindUnique.mockResolvedValueOnce(null);
      expect(await resolveOrgFromAgentId("a1")).toBeNull();
    });
  });

  describe("resolveOrgFromAgentSlug", () => {
    it("looks up by slug", async () => {
      mockAgentFindUnique.mockResolvedValueOnce({ userId: "u1", orgId: "org_a" });
      const r = await resolveOrgFromAgentSlug("my-bot");
      expect(r).toEqual({ userId: "u1", orgId: "org_a" });
    });
  });

  describe("resolveOrgFromStripeConnectAccount", () => {
    it("maps a Stripe Connect account via reseller account", async () => {
      mockResellerFindUnique.mockResolvedValueOnce({
        userId: "u1",
        orgId: "org_reseller",
      });
      const r = await resolveOrgFromStripeConnectAccount("acct_123");
      expect(r).toEqual({ userId: "u1", orgId: "org_reseller" });
    });

    it("falls back to the reseller user's personalOrgId when reseller orgId missing", async () => {
      mockResellerFindUnique.mockResolvedValueOnce({ userId: "u1", orgId: null });
      mockUserFindUnique.mockResolvedValueOnce({ personalOrgId: "org_p" });
      const r = await resolveOrgFromStripeConnectAccount("acct_123");
      expect(r).toEqual({ userId: "u1", orgId: "org_p" });
    });
  });
});
