/**
 * GET /api/agency/login-status — does the current session look like an
 * agency owner who has switched into one of their sub-orgs?
 *
 * Used by the dashboard's client-mode banner: when the active org is a
 * sub-org and the caller is also a member of the parent agency, we
 * render a banner reading "You're in client-mode for {sub-org name} —
 * back to {agency name}".
 *
 * Response shape:
 *   {
 *     isClientMode: boolean,
 *     activeOrgId: string | null,
 *     parentAgencyId: string | null,
 *     parentAgencyName: string | null,
 *     subOrgName: string | null,
 *   }
 *
 * isClientMode = true requires three things:
 *   1. There IS an active org.
 *   2. That org is the child side of an OrgRelationship (i.e. someone's
 *      sub-org).
 *   3. The caller is a member of the parent agency. (We check via the
 *      Clerk Backend SDK so the answer is authoritative even when the
 *      session JWT doesn't include all memberships yet.)
 *
 * If condition 3 fails the banner shouldn't render — the caller might
 * be a regular sub-org member who never had agency access, and we'd
 * give them a misleading "back to {agency}" link.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!orgId) {
    return Response.json({
      isClientMode: false,
      activeOrgId: null,
      parentAgencyId: null,
      parentAgencyName: null,
      subOrgName: null,
    });
  }

  // Is the active org a known sub-org?
  const relationship = await prisma.orgRelationship.findUnique({
    where: { childOrgId: orgId },
    select: {
      parentOrgId: true,
      subOrgName: true,
      subOrgStatus: true,
    },
  });

  if (!relationship || relationship.subOrgStatus !== "ACTIVE") {
    return Response.json({
      isClientMode: false,
      activeOrgId: orgId,
      parentAgencyId: null,
      parentAgencyName: null,
      subOrgName: null,
    });
  }

  // Verify the caller is actually a member of the parent agency. Without
  // this check, the banner would mislead a regular sub-org user who has
  // no path back to the agency.
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({
    userId,
  });
  const parentMembership = memberships.data.find(
    (m) => m.organization.id === relationship.parentOrgId
  );

  if (!parentMembership) {
    return Response.json({
      isClientMode: false,
      activeOrgId: orgId,
      parentAgencyId: relationship.parentOrgId,
      parentAgencyName: null,
      subOrgName: relationship.subOrgName,
    });
  }

  return Response.json({
    isClientMode: true,
    activeOrgId: orgId,
    parentAgencyId: relationship.parentOrgId,
    parentAgencyName: parentMembership.organization.name,
    subOrgName: relationship.subOrgName,
  });
}
