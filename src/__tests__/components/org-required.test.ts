import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATH,
  shouldRedirectToOnboarding,
} from "@/components/org-required";

const baseState = {
  authLoaded: true,
  orgsLoaded: true,
  userId: "user_1",
  membershipCount: 1,
  pathname: "/dashboard",
};

describe("shouldRedirectToOnboarding", () => {
  it("does not redirect while Clerk is still loading auth", () => {
    expect(
      shouldRedirectToOnboarding({ ...baseState, authLoaded: false })
    ).toBe(false);
  });

  it("does not redirect while the membership list is still loading", () => {
    expect(
      shouldRedirectToOnboarding({ ...baseState, orgsLoaded: false })
    ).toBe(false);
  });

  it("does not redirect unauthenticated visitors", () => {
    expect(shouldRedirectToOnboarding({ ...baseState, userId: null })).toBe(
      false
    );
    expect(
      shouldRedirectToOnboarding({ ...baseState, userId: undefined })
    ).toBe(false);
  });

  it("does not redirect when the user already has at least one org", () => {
    expect(
      shouldRedirectToOnboarding({ ...baseState, membershipCount: 1 })
    ).toBe(false);
    expect(
      shouldRedirectToOnboarding({ ...baseState, membershipCount: 5 })
    ).toBe(false);
  });

  it("does not redirect when the user is already on the onboarding page", () => {
    expect(
      shouldRedirectToOnboarding({
        ...baseState,
        membershipCount: 0,
        pathname: ONBOARDING_PATH,
      })
    ).toBe(false);
  });

  it("redirects an authenticated user with zero memberships", () => {
    expect(
      shouldRedirectToOnboarding({ ...baseState, membershipCount: 0 })
    ).toBe(true);
  });

  it("ONBOARDING_PATH points at the create-organization onboarding route", () => {
    expect(ONBOARDING_PATH).toBe("/onboarding/create-organization");
  });
});
