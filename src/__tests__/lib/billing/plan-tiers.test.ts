/**
 * Plan-tier flag tests — pin the BUSINESS / AGENCY / ENTERPRISE
 * matrix from Phase 3 so the next refactor can't silently flip
 * canConnectStripe or canHaveCustomDomain on the wrong tier.
 */
import { describe, expect, it } from "vitest";
import {
  canConnectStripe,
  canHaveCustomDomain,
  canUseWhiteLabel,
  canViewRevenueDashboard,
  isAgencyTierPlan,
  PLAN_LIMITS,
  PLAN_PRICES,
} from "@/lib/stripe";

describe("isAgencyTierPlan", () => {
  it("true for plans that grant sub-orgs", () => {
    expect(isAgencyTierPlan("BUSINESS")).toBe(true);
    expect(isAgencyTierPlan("AGENCY")).toBe(true);
    expect(isAgencyTierPlan("ENTERPRISE")).toBe(true);
  });
  it("false for solo / team plans and missing values", () => {
    expect(isAgencyTierPlan("FREE")).toBe(false);
    expect(isAgencyTierPlan("STARTER")).toBe(false);
    expect(isAgencyTierPlan("PRO")).toBe(false);
    expect(isAgencyTierPlan(null)).toBe(false);
    expect(isAgencyTierPlan(undefined)).toBe(false);
  });
});

describe("canConnectStripe", () => {
  it("true only for AGENCY and ENTERPRISE — BUSINESS is excluded", () => {
    expect(canConnectStripe("AGENCY")).toBe(true);
    expect(canConnectStripe("ENTERPRISE")).toBe(true);
    expect(canConnectStripe("BUSINESS")).toBe(false);
    expect(canConnectStripe("PRO")).toBe(false);
    expect(canConnectStripe("FREE")).toBe(false);
    expect(canConnectStripe(null)).toBe(false);
  });
});

describe("canHaveCustomDomain", () => {
  it("aligned with canConnectStripe — Stripe-Connect-class only", () => {
    expect(canHaveCustomDomain("AGENCY")).toBe(true);
    expect(canHaveCustomDomain("ENTERPRISE")).toBe(true);
    expect(canHaveCustomDomain("BUSINESS")).toBe(false);
    expect(canHaveCustomDomain("PRO")).toBe(false);
  });
});

describe("canUseWhiteLabel", () => {
  it("aligned with canConnectStripe — Stripe-Connect-class only", () => {
    expect(canUseWhiteLabel("AGENCY")).toBe(true);
    expect(canUseWhiteLabel("ENTERPRISE")).toBe(true);
    expect(canUseWhiteLabel("BUSINESS")).toBe(false);
  });
});

describe("canViewRevenueDashboard", () => {
  it("aligned with canConnectStripe — Stripe-Connect-class only", () => {
    expect(canViewRevenueDashboard("AGENCY")).toBe(true);
    expect(canViewRevenueDashboard("ENTERPRISE")).toBe(true);
    expect(canViewRevenueDashboard("BUSINESS")).toBe(false);
  });
});

describe("PLAN_LIMITS sub-org caps", () => {
  it("BUSINESS = 5, AGENCY/ENTERPRISE unlimited (999999)", () => {
    expect((PLAN_LIMITS.BUSINESS as { maxSubOrgs: number }).maxSubOrgs).toBe(5);
    expect((PLAN_LIMITS.AGENCY as { maxSubOrgs: number }).maxSubOrgs).toBe(
      999999
    );
    expect((PLAN_LIMITS.ENTERPRISE as { maxSubOrgs: number }).maxSubOrgs).toBe(
      999999
    );
  });

  it("PRO / STARTER / FREE have zero sub-orgs", () => {
    expect((PLAN_LIMITS.FREE as { maxSubOrgs: number }).maxSubOrgs).toBe(0);
    expect((PLAN_LIMITS.STARTER as { maxSubOrgs: number }).maxSubOrgs).toBe(0);
    expect((PLAN_LIMITS.PRO as { maxSubOrgs: number }).maxSubOrgs).toBe(0);
  });
});

describe("PLAN_PRICES catalog", () => {
  it("matches the published GHL-style three-tier pricing", () => {
    expect(PLAN_PRICES.PRO.amount).toBe(9700);
    expect(PLAN_PRICES.BUSINESS.amount).toBe(29700);
    expect(PLAN_PRICES.AGENCY.amount).toBe(49700);
  });
  it("defaults all tiers to EUR", () => {
    expect(PLAN_PRICES.PRO.currency).toBe("eur");
    expect(PLAN_PRICES.BUSINESS.currency).toBe("eur");
    expect(PLAN_PRICES.AGENCY.currency).toBe("eur");
  });
});
