import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  REPAIR_ENDPOINT,
  decideOrgGuard,
} from "@/components/org-required";

const baseState = {
  authLoaded: true,
  orgsLoaded: true,
  userId: "user_1",
  membershipCount: 1,
  activeOrgId: null as string | null,
  pathname: "/dashboard",
  repairAttempted: false,
};

describe("decideOrgGuard", () => {
  describe("loading and auth gating", () => {
    it("waits while Clerk auth is loading", () => {
      expect(
        decideOrgGuard({ ...baseState, authLoaded: false }, "org_1")
      ).toEqual({ kind: "wait" });
    });

    it("waits while the membership list is loading", () => {
      expect(
        decideOrgGuard({ ...baseState, orgsLoaded: false }, "org_1")
      ).toEqual({ kind: "wait" });
    });

    it("noops for unauthenticated visitors (Clerk middleware handles them)", () => {
      expect(decideOrgGuard({ ...baseState, userId: null }, null)).toEqual({
        kind: "noop",
      });
      expect(
        decideOrgGuard({ ...baseState, userId: undefined }, null)
      ).toEqual({ kind: "noop" });
    });
  });

  describe("happy paths", () => {
    it("noops when an active org is already selected (most common branch)", () => {
      expect(
        decideOrgGuard({ ...baseState, activeOrgId: "org_1" }, "org_1")
      ).toEqual({ kind: "noop" });
    });

    it("noops on the onboarding page itself even when zero memberships", () => {
      expect(
        decideOrgGuard(
          {
            ...baseState,
            membershipCount: 0,
            pathname: ONBOARDING_PATH,
          },
          null
        )
      ).toEqual({ kind: "noop" });
    });
  });

  describe("set-active fallback (the regression this commit fixes)", () => {
    it("adopts the first membership when the user has orgs but none active", () => {
      expect(
        decideOrgGuard(
          { ...baseState, membershipCount: 1, activeOrgId: null },
          "org_personal"
        )
      ).toEqual({ kind: "set-active", orgId: "org_personal" });
    });

    it("adopts the first membership even with multiple memberships", () => {
      expect(
        decideOrgGuard(
          { ...baseState, membershipCount: 3, activeOrgId: null },
          "org_first"
        )
      ).toEqual({ kind: "set-active", orgId: "org_first" });
    });

    it("does NOT call set-active when active org is already set", () => {
      expect(
        decideOrgGuard(
          { ...baseState, membershipCount: 3, activeOrgId: "org_1" },
          "org_first"
        )
      ).toEqual({ kind: "noop" });
    });
  });

  describe("repair fallback", () => {
    it("triggers repair when the user has zero memberships and no active org", () => {
      expect(
        decideOrgGuard(
          { ...baseState, membershipCount: 0, repairAttempted: false },
          null
        )
      ).toEqual({ kind: "repair" });
    });

    it("repair is gated to ONE attempt per session — afterwards we redirect", () => {
      expect(
        decideOrgGuard(
          { ...baseState, membershipCount: 0, repairAttempted: true },
          null
        )
      ).toEqual({ kind: "redirect-onboarding" });
    });
  });

  describe("constants", () => {
    it("ONBOARDING_PATH points at the create-organization route", () => {
      expect(ONBOARDING_PATH).toBe("/onboarding/create-organization");
    });

    it("REPAIR_ENDPOINT points at the repair API route", () => {
      expect(REPAIR_ENDPOINT).toBe("/api/repair-personal-org");
    });
  });
});
