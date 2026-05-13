/**
 * Sprint 19.7.6 — onboarding wizard redirect rules (pure unit).
 */
import { describe, expect, it } from "vitest";
import {
  ONBOARDING_SKIP_COOKIE,
  ONBOARDING_SKIP_MAX_AGE_SECONDS,
  resolveOnboardingRedirect,
} from "@/lib/sub-org/onboarding-redirect";

const base = (subOrgId: string) => `/dashboard/sub-org/${subOrgId}`;

function inputs(overrides: Partial<Parameters<typeof resolveOnboardingRedirect>[0]> = {}) {
  return {
    subOrgId: "sub_1",
    acceptedAt: new Date(),
    onboardingCompletedAt: null,
    onboardingStepCompleted: null,
    pathname: "/dashboard/sub-org/sub_1",
    skipCookie: null,
    ...overrides,
  };
}

describe("resolveOnboardingRedirect", () => {
  it("returns step-1 path for a fresh accepted membership", () => {
    expect(resolveOnboardingRedirect(inputs())).toBe(`${base("sub_1")}/onboarding/step-1`);
  });

  it("returns step-2 path when step 1 was completed", () => {
    expect(
      resolveOnboardingRedirect(inputs({ onboardingStepCompleted: 1 })),
    ).toBe(`${base("sub_1")}/onboarding/step-2`);
  });

  it("returns step-3 path when step 2 was completed", () => {
    expect(
      resolveOnboardingRedirect(inputs({ onboardingStepCompleted: 2 })),
    ).toBe(`${base("sub_1")}/onboarding/step-3`);
  });

  it("returns null when onboardingCompletedAt is set", () => {
    expect(
      resolveOnboardingRedirect(
        inputs({
          onboardingCompletedAt: new Date(),
          onboardingStepCompleted: 3,
        }),
      ),
    ).toBeNull();
  });

  it("returns null when acceptedAt is null (pending invite)", () => {
    expect(resolveOnboardingRedirect(inputs({ acceptedAt: null }))).toBeNull();
  });

  it("returns null when the skip-cookie is set", () => {
    expect(resolveOnboardingRedirect(inputs({ skipCookie: "1" }))).toBeNull();
  });

  it("returns null when already on an /onboarding/* route (don't loop)", () => {
    expect(
      resolveOnboardingRedirect(
        inputs({ pathname: "/dashboard/sub-org/sub_1/onboarding/step-2" }),
      ),
    ).toBeNull();
  });

  it("redirects from a sibling-sub-org route to that sibling's wizard", () => {
    expect(
      resolveOnboardingRedirect(
        inputs({ subOrgId: "sub_2", pathname: "/dashboard/sub-org/sub_2/agents" }),
      ),
    ).toBe("/dashboard/sub-org/sub_2/onboarding/step-1");
  });

  it("exports the skip-cookie name and TTL", () => {
    expect(ONBOARDING_SKIP_COOKIE).toBe("kiln_onboarding_skip");
    expect(ONBOARDING_SKIP_MAX_AGE_SECONDS).toBe(60 * 60 * 24);
  });
});
