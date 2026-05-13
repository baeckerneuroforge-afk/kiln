/**
 * Sprint 19.7.6 — billing.manage permission gate.
 *
 * Only AGENCY_OWNERs see /dashboard/agency/billing. ADMINs cover the
 * rest of the agency surface but never billing or subscription
 * cancellation — by design, that's the OWNER-only responsibility.
 * Bootstrapped via ensureAgencyMembershipFromClerkRole so a Clerk
 * org-admin who never created a sub-org still gets in on first hit.
 */
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import {
  ensureAgencyMembershipFromClerkRole,
  permissionsForAgencyRole,
} from "@/lib/permissions/agency-permissions";

export default async function AgencyBillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/dashboard");

  const membership = await ensureAgencyMembershipFromClerkRole(
    userId,
    orgId,
    orgRole ?? null,
  );
  if (!membership || !permissionsForAgencyRole(membership.role).has("billing.manage")) {
    notFound();
  }

  return <>{children}</>;
}
