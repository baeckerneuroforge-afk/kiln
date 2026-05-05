"use client";

/**
 * OrgRequired — server-authoritative org guard.
 *
 * Why server-authoritative: the previous client-hook-based version
 * (Phase 2.3a + the first hotfix) relied on `useUser().organizationMemberships`
 * and `useOrganizationList()` to count org memberships. Both turned out to
 * be unreliable in production:
 *
 *   - `user.organizationMemberships` is a snapshot of memberships at the
 *     time the user object was hydrated. Memberships created or repaired
 *     server-side AFTER hydration are invisible to it until the session
 *     reloads.
 *   - `useOrganizationList` paginates and only populates `count` after a
 *     fetch settles — the first render sees `count === 0` even when the
 *     user has 5 organizations.
 *
 * The result was a redirect loop for users who DO have orgs (the bug
 * reported on 2026-05-05): every render saw zero memberships and bounced
 * to /onboarding/create-organization.
 *
 * The fix: trust only two signals.
 *
 *   1. `useAuth().orgId` — JWT-claim, set the moment Clerk picks an
 *      active org. If present, we're done.
 *   2. `POST /api/repair-personal-org` — server-side authoritative call
 *      that uses the Clerk Backend SDK to look at the real membership
 *      list, repair drift if needed, and return the orgId the user
 *      should adopt.
 *
 * Decision tree:
 *
 *   - Auth still loading                           → wait
 *   - Not signed in                                → noop (Clerk middleware redirects)
 *   - Active org already set in JWT                → noop (happy path, common case)
 *   - Already on the onboarding page               → noop
 *   - Repair already attempted in this session     → redirect-onboarding
 *   - Otherwise                                    → repair
 *
 * The "set-active" case from the previous version is folded into the
 * repair endpoint — when memberships exist, the endpoint returns the
 * first orgId and the client calls setActive() with it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";

export const ONBOARDING_PATH = "/onboarding/create-organization";
export const REPAIR_ENDPOINT = "/api/repair-personal-org";

export type OrgGuardState = {
  authLoaded: boolean;
  userId: string | null | undefined;
  /** Active Clerk org id from auth().orgId, or null if none selected. */
  activeOrgId: string | null;
  pathname: string;
  /** True after we've already called /api/repair-personal-org once this
   *  session — prevents repair loops if the endpoint is broken. */
  repairAttempted: boolean;
};

export type OrgGuardDecision =
  | { kind: "wait" }
  | { kind: "noop" }
  | { kind: "repair" }
  | { kind: "redirect-onboarding" };

/**
 * Pure decision function — exported for unit testing. The React component
 * threads its hook state into this and dispatches on the result.
 */
export function decideOrgGuard(state: OrgGuardState): OrgGuardDecision {
  if (!state.authLoaded) return { kind: "wait" };
  if (!state.userId) return { kind: "noop" }; // unauth — Clerk middleware handles
  if (state.activeOrgId) return { kind: "noop" }; // happy path
  if (state.pathname === ONBOARDING_PATH) return { kind: "noop" };
  if (state.repairAttempted) return { kind: "redirect-onboarding" };
  return { kind: "repair" };
}

export function OrgRequired() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: authLoaded, userId, orgId: activeOrgId } = useAuth();
  const { setActive } = useClerk();

  const [repairAttempted, setRepairAttempted] = useState(false);
  const repairInFlightRef = useRef(false);

  const runRepair = useCallback(async () => {
    if (repairInFlightRef.current) return;
    repairInFlightRef.current = true;
    try {
      const res = await fetch(REPAIR_ENDPOINT, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        orgId?: string;
        action?: string;
      };

      if (!res.ok || !body.orgId) {
        // Endpoint couldn't resolve an org for this user — fall through to
        // onboarding. setRepairAttempted in finally so the next render
        // dispatches the redirect.
        return;
      }

      if (setActive) {
        try {
          await setActive({ organization: body.orgId });
          // setActive updates the Clerk session in place; router.refresh
          // makes Server Components re-fetch with the new org claim.
          router.refresh();
          return;
        } catch (err) {
          // setActive failed because the client's session doesn't yet
          // include this membership (the endpoint just created it on the
          // server). Force a hard reload so Clerk re-fetches the session
          // from scratch and the new org claim is picked up.
          console.warn(
            "[OrgRequired] setActive failed, forcing reload:",
            err
          );
          if (typeof window !== "undefined") {
            window.location.reload();
          }
          return;
        }
      }
    } catch (err) {
      console.warn("[OrgRequired] repair endpoint threw:", err);
    } finally {
      repairInFlightRef.current = false;
      setRepairAttempted(true);
    }
  }, [router, setActive]);

  useEffect(() => {
    const decision = decideOrgGuard({
      authLoaded,
      userId,
      activeOrgId: activeOrgId ?? null,
      pathname,
      repairAttempted,
    });

    switch (decision.kind) {
      case "wait":
      case "noop":
        return;
      case "repair":
        void runRepair();
        return;
      case "redirect-onboarding":
        router.replace(ONBOARDING_PATH);
        return;
    }
  }, [
    authLoaded,
    userId,
    activeOrgId,
    pathname,
    repairAttempted,
    router,
    runRepair,
  ]);

  return null;
}
