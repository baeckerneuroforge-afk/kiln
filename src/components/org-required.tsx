"use client";

/**
 * OrgRequired — client-side guard that recovers users with broken org state
 * and falls back to the onboarding create-org flow only as a last resort.
 *
 * Lifecycle (each step is gated on the previous failing):
 *
 *   1. Active org already selected (auth().orgId or useOrganization()) →
 *      nothing to do, return immediately. Most users hit this branch every
 *      render.
 *   2. User has at least one membership but no active selection → call
 *      Clerk's setActive() so subsequent server requests carry the org_id
 *      claim. This catches the "Phase 2.1 backfill ran, but the user's
 *      session was loaded before the org claim landed" race.
 *   3. Zero memberships AND zero active org → call /api/repair-personal-org
 *      once. The endpoint re-creates the membership / org if our DB knows
 *      about a personalOrgId that Clerk has lost track of.
 *   4. Repair couldn't help → redirect to the create-org onboarding page.
 *
 * Without steps 2 and 3 the dashboard would loop forever for users whose
 * Clerk membership got dropped after backfill — they'd land on the
 * onboarding page, create a SECOND org, and accumulate orphan workspaces.
 *
 * Render once anywhere in the dashboard tree (typically the layout). The
 * component renders nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, useClerk, useOrganizationList, useUser } from "@clerk/nextjs";

export const ONBOARDING_PATH = "/onboarding/create-organization";
export const REPAIR_ENDPOINT = "/api/repair-personal-org";

export type OrgGuardState = {
  authLoaded: boolean;
  orgsLoaded: boolean;
  userId: string | null | undefined;
  /** Number of org memberships visible to Clerk for the current user. */
  membershipCount: number;
  /** Active Clerk org id, or null if none selected. */
  activeOrgId: string | null;
  pathname: string;
  /** True after we've already called /api/repair-personal-org once this
   *  session — prevents repair loops if the endpoint is broken. */
  repairAttempted: boolean;
};

export type OrgGuardDecision =
  | { kind: "wait" }
  | { kind: "noop" }
  | { kind: "set-active"; orgId: string }
  | { kind: "repair" }
  | { kind: "redirect-onboarding" };

/**
 * Pure decision function — exported for unit testing. The React component
 * threads its hook state into this and dispatches on the result.
 */
export function decideOrgGuard(
  state: OrgGuardState,
  firstMembershipOrgId: string | null
): OrgGuardDecision {
  if (!state.authLoaded || !state.orgsLoaded) return { kind: "wait" };
  if (!state.userId) return { kind: "noop" }; // unauth — Clerk middleware handles
  if (state.activeOrgId) return { kind: "noop" }; // happy path
  if (state.pathname === ONBOARDING_PATH) return { kind: "noop" };

  // Memberships exist but none active → adopt the first one. This is the
  // common case for users whose session predates Phase 2.1.
  if (state.membershipCount > 0 && firstMembershipOrgId) {
    return { kind: "set-active", orgId: firstMembershipOrgId };
  }

  // Zero memberships. Try a repair before bouncing to onboarding so we
  // don't accumulate orphan orgs from users whose Clerk membership got
  // dropped after backfill.
  if (!state.repairAttempted) return { kind: "repair" };

  return { kind: "redirect-onboarding" };
}

export function OrgRequired() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: authLoaded, userId, orgId: activeOrgId } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const { setActive } = useClerk();
  // useOrganizationList is paginated; useUser().organizationMemberships is
  // hydrated alongside the user object and avoids a second fetch. We read
  // memberships from there preferentially and fall back to
  // useOrganizationList only if the user object hasn't loaded yet.
  const { isLoaded: orgsListLoaded, userMemberships } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  const [repairAttempted, setRepairAttempted] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const repairInFlightRef = useRef(false);

  // Source of truth for memberships: prefer the user object, fall back to
  // the org list. Returns null when nothing has loaded yet.
  const userMembershipsList = user?.organizationMemberships ?? null;
  const orgsLoaded = userLoaded || orgsListLoaded;
  const membershipCount =
    userMembershipsList?.length ?? userMemberships?.count ?? 0;
  const firstOrgId =
    userMembershipsList?.[0]?.organization?.id ??
    userMemberships?.data?.[0]?.organization?.id ??
    null;

  const runRepair = useCallback(async () => {
    if (repairInFlightRef.current) return;
    repairInFlightRef.current = true;
    setRepairing(true);
    try {
      const res = await fetch(REPAIR_ENDPOINT, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        if (body.orgId && setActive) {
          // Adopt the recovered/created org as the active one so the next
          // render sees activeOrgId and skips the guard entirely.
          try {
            await setActive({ organization: body.orgId });
          } catch {
            // setActive can fail if Clerk's session doesn't include the
            // membership yet — a router.refresh forces re-hydration.
          }
        }
        router.refresh();
      } else {
        console.warn("[OrgRequired] repair endpoint failed:", body);
      }
    } catch (err) {
      console.warn("[OrgRequired] repair endpoint threw:", err);
    } finally {
      setRepairAttempted(true);
      setRepairing(false);
      repairInFlightRef.current = false;
    }
  }, [router, setActive]);

  useEffect(() => {
    const decision = decideOrgGuard(
      {
        authLoaded,
        orgsLoaded,
        userId,
        membershipCount,
        activeOrgId: activeOrgId ?? null,
        pathname,
        repairAttempted,
      },
      firstOrgId
    );

    switch (decision.kind) {
      case "wait":
      case "noop":
        return;
      case "set-active":
        if (setActive) {
          setActive({ organization: decision.orgId }).catch((err) => {
            console.warn("[OrgRequired] setActive failed:", err);
          });
        }
        return;
      case "repair":
        if (!repairing) {
          void runRepair();
        }
        return;
      case "redirect-onboarding":
        router.replace(ONBOARDING_PATH);
        return;
    }
  }, [
    authLoaded,
    orgsLoaded,
    userId,
    activeOrgId,
    membershipCount,
    firstOrgId,
    pathname,
    repairAttempted,
    repairing,
    router,
    runRepair,
    setActive,
  ]);

  return null;
}
