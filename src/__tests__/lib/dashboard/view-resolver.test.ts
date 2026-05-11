import { describe, expect, it } from "vitest";
import {
  AUTO_THRESHOLDS,
  daysSince,
  isValidPreference,
  normalizePreference,
  pickDashboardView,
} from "@/lib/dashboard/view-resolver";

describe("pickDashboardView", () => {
  it("auto + zero sub-orgs + new account → onboarding", () => {
    expect(pickDashboardView({ preference: "auto", subOrgCount: 0, daysSinceSignup: 0 })).toBe("onboarding");
  });

  it("auto + 5 sub-orgs + 30 days → operations", () => {
    expect(pickDashboardView({ preference: "auto", subOrgCount: 5, daysSinceSignup: 30 })).toBe("operations");
  });

  it("auto + 5 sub-orgs + only 7 days (too new) → onboarding", () => {
    expect(pickDashboardView({ preference: "auto", subOrgCount: 5, daysSinceSignup: 7 })).toBe("onboarding");
  });

  it("auto + 2 sub-orgs + 30 days (not enough sub-orgs) → onboarding", () => {
    expect(pickDashboardView({ preference: "auto", subOrgCount: 2, daysSinceSignup: 30 })).toBe("onboarding");
  });

  it("auto exactly at both thresholds → operations", () => {
    expect(
      pickDashboardView({
        preference: "auto",
        subOrgCount: AUTO_THRESHOLDS.minSubOrgs,
        daysSinceSignup: AUTO_THRESHOLDS.minAccountAgeDays,
      }),
    ).toBe("operations");
  });

  it("explicit onboarding overrides high sub-org count", () => {
    expect(pickDashboardView({ preference: "onboarding", subOrgCount: 20, daysSinceSignup: 90 })).toBe("onboarding");
  });

  it("explicit operations overrides zero sub-orgs", () => {
    expect(pickDashboardView({ preference: "operations", subOrgCount: 0, daysSinceSignup: 0 })).toBe("operations");
  });

  it("invalid preference values fall through to auto behaviour", () => {
    expect(pickDashboardView({ preference: "bogus", subOrgCount: 0, daysSinceSignup: 0 })).toBe("onboarding");
    expect(pickDashboardView({ preference: null, subOrgCount: 10, daysSinceSignup: 90 })).toBe("operations");
    expect(pickDashboardView({ preference: undefined, subOrgCount: 0, daysSinceSignup: 0 })).toBe("onboarding");
  });
});

describe("preference helpers", () => {
  it("normalizePreference maps known values straight through and unknown to auto", () => {
    expect(normalizePreference("auto")).toBe("auto");
    expect(normalizePreference("onboarding")).toBe("onboarding");
    expect(normalizePreference("operations")).toBe("operations");
    expect(normalizePreference("garbage")).toBe("auto");
    expect(normalizePreference(null)).toBe("auto");
    expect(normalizePreference(undefined)).toBe("auto");
  });

  it("isValidPreference accepts only the three known values", () => {
    expect(isValidPreference("auto")).toBe(true);
    expect(isValidPreference("onboarding")).toBe(true);
    expect(isValidPreference("operations")).toBe(true);
    expect(isValidPreference("OPERATIONS")).toBe(false);
    expect(isValidPreference(null)).toBe(false);
    expect(isValidPreference(123)).toBe(false);
  });

  it("daysSince clamps negative deltas to zero and floors fractional days", () => {
    const reference = new Date("2026-05-10T12:00:00.000Z");
    expect(daysSince(reference, reference)).toBe(0);
    expect(daysSince(new Date("2026-05-08T00:00:00.000Z"), reference)).toBe(2);
    expect(daysSince(new Date("2026-05-11T00:00:00.000Z"), reference)).toBe(0);
  });
});
