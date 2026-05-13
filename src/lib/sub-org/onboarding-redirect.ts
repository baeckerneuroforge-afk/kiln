/**
 * Sprint 19.7.6 — sub-org onboarding wizard redirect rules.
 *
 * Pure, side-effect-free decision function: given the caller's
 * SubOrgMembership state, the current pathname, and the "snooze"
 * cookie, return the path to redirect to (or null to let the
 * request through).
 *
 * Lives in its own module so the layout can call it inline and tests
 * can exercise every branch without spinning up Next routing.
 *
 * Rules:
 *   - acceptedAt is null  → user hasn't joined yet (e.g. pending
 *                            invite) → no redirect, render whatever
 *                            the route asked for.
 *   - onboardingCompletedAt is set → user already finished → no redirect.
 *   - skip-cookie is set → user opted into "remind me later" within
 *                            the last 24h → no redirect.
 *   - pathname already inside /onboarding/* → already in the wizard,
 *                            don't loop.
 *   - otherwise → redirect to the next-step page (step-1 unless they
 *                            partially completed earlier).
 */

export type OnboardingRedirectInputs = {
  subOrgId: string;
  acceptedAt: Date | null;
  onboardingCompletedAt: Date | null;
  onboardingStepCompleted: number | null;
  pathname: string | null;
  skipCookie: string | null;
};

export const ONBOARDING_SKIP_COOKIE = "kiln_onboarding_skip";
export const ONBOARDING_SKIP_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h

function nextStep(stepCompleted: number | null): 1 | 2 | 3 {
  if (stepCompleted === 1) return 2;
  if (stepCompleted === 2) return 3;
  if (stepCompleted === 3) return 3; // shouldn't happen — completedAt would be set
  return 1;
}

export function resolveOnboardingRedirect(
  input: OnboardingRedirectInputs,
): string | null {
  if (!input.acceptedAt) return null;
  if (input.onboardingCompletedAt) return null;
  if (input.skipCookie) return null;

  const base = `/dashboard/sub-org/${input.subOrgId}/onboarding`;
  if (input.pathname && input.pathname.startsWith(base)) {
    return null;
  }

  return `${base}/step-${nextStep(input.onboardingStepCompleted)}`;
}
