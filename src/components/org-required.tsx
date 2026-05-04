"use client";

/**
 * OrgRequired — client-side guard that pushes orgless users to the onboarding
 * create-org flow.
 *
 * Reasoning: detecting "this user has zero org memberships" reliably from
 * Clerk's edge middleware would need an API call from the request path,
 * which is expensive. Instead we rely on `useOrganizationList()` in the
 * dashboard layout: once Clerk has loaded the user's memberships, if the
 * count is zero we redirect.
 *
 * In normal operation every user has at least their auto-created Personal
 * workspace from the Phase-2.1 webhook. This guard only ever triggers for
 * the edge cases the user spec called out — backfill failures, Clerk
 * Organizations disabled in a dev instance, etc.
 *
 * Render once anywhere in the dashboard tree (typically the layout). The
 * component renders nothing.
 */
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, useOrganizationList } from "@clerk/nextjs";

export const ONBOARDING_PATH = "/onboarding/create-organization";

export type OrgGuardState = {
  authLoaded: boolean;
  orgsLoaded: boolean;
  userId: string | null | undefined;
  membershipCount: number;
  pathname: string;
};

/** Pure decision: should the dashboard guard push the user to the onboarding
 *  create-org flow? Exported for unit testing — the React component just
 *  threads its hooks into this. */
export function shouldRedirectToOnboarding(state: OrgGuardState): boolean {
  if (!state.authLoaded || !state.orgsLoaded) return false;
  if (!state.userId) return false; // unauthenticated, Clerk middleware handles
  if (state.pathname === ONBOARDING_PATH) return false; // already there
  return state.membershipCount === 0;
}

export function OrgRequired() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: authLoaded, userId } = useAuth();
  // We pass `userMemberships: true` so Clerk loads the membership list and
  // we can branch on its `count` field.
  const { isLoaded: orgsLoaded, userMemberships } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  useEffect(() => {
    if (
      shouldRedirectToOnboarding({
        authLoaded,
        orgsLoaded,
        userId,
        membershipCount: userMemberships?.count ?? 0,
        pathname,
      })
    ) {
      router.replace(ONBOARDING_PATH);
    }
  }, [authLoaded, orgsLoaded, userId, userMemberships?.count, pathname, router]);

  return null;
}
