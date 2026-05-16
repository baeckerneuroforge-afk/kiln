/**
 * DELETE /api/agency/sub-orgs/[id]/members/[membershipId] — remove a
 * member from the sub-org via the Clerk org membership.
 *
 * Auth: same agency-owns-sub-org guard as the rest of the namespace.
 * Removing the agency owner themselves is allowed (Clerk handles the
 * "must keep at least one admin" rule and surfaces it as an error).
 */
import { clerkClient } from "@clerk/nextjs/server";
// Sprint 20.1 — DELETE removes a sub-org member; gate to OWNER/ADMIN.
import { requireAgencyMutation } from "@/lib/agency/require-agency-mutation";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; membershipId: string } },
) {
  const access = await requireAgencyMutation(params.id);
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const client = await clerkClient();
  try {
    // Resolve membership → user id, then delete by userId (Clerk's
    // delete API takes organizationId + userId, not the membership id).
    const list = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    });
    const target = list.data.find((m) => m.id === params.membershipId);
    if (!target?.publicUserData?.userId) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }
    await client.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId: target.publicUserData.userId,
    });
    return Response.json({ removed: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Remove failed" },
      { status: 502 },
    );
  }
}
