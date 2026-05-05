import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  REPAIR_ENDPOINT,
  decideOrgGuard,
} from "@/components/org-required";

const baseState = {
  authLoaded: true,
  userId: "user_1",
  activeOrgId: null as string | null,
  pathname: "/dashboard",
  repairAttempted: false,
};

describe("decideOrgGuard (server-authoritative variant)", () => {
  describe("loading and auth gating", () => {
    it("waits while Clerk auth is still loading", () => {
      expect(decideOrgGuard({ ...baseState, authLoaded: false })).toEqual({
        kind: "wait",
      });
    });

    it("noops for unauthenticated visitors (Clerk middleware handles them)", () => {
      expect(decideOrgGuard({ ...baseState, userId: null })).toEqual({
        kind: "noop",
      });
      expect(decideOrgGuard({ ...baseState, userId: undefined })).toEqual({
        kind: "noop",
      });
    });
  });

  describe("happy path: active org in JWT", () => {
    it("noops when auth().orgId is set — most common branch", () => {
      expect(
        decideOrgGuard({ ...baseState, activeOrgId: "org_personal" })
      ).toEqual({ kind: "noop" });
    });

    it("noops on active org even when on the onboarding path (don't trap admins)", () => {
      expect(
        decideOrgGuard({
          ...baseState,
          activeOrgId: "org_personal",
          pathname: ONBOARDING_PATH,
        })
      ).toEqual({ kind: "noop" });
    });
  });

  describe("on onboarding page", () => {
    it("noops when already on the onboarding path even with no active org", () => {
      expect(
        decideOrgGuard({
          ...baseState,
          activeOrgId: null,
          pathname: ONBOARDING_PATH,
        })
      ).toEqual({ kind: "noop" });
    });
  });

  describe("repair → redirect fallback chain", () => {
    it("triggers repair when no active org and repair hasn't been tried yet", () => {
      expect(
        decideOrgGuard({
          ...baseState,
          activeOrgId: null,
          repairAttempted: false,
        })
      ).toEqual({ kind: "repair" });
    });

    it("redirects to onboarding once repair has already been tried", () => {
      expect(
        decideOrgGuard({
          ...baseState,
          activeOrgId: null,
          repairAttempted: true,
        })
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
