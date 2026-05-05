/**
 * DELETE /api/agency/sub-orgs/[id] — archive a sub-org.
 *
 * "Archive" rather than hard-delete: the relationship row stays, marked
 * SUSPENDED on the way out and ARCHIVED once retention finishes. The
 * underlying Clerk org is kept for 30 days (managed out-of-band) so an
 * agency can reverse course without losing client data.
 *
 * Auth: caller must be a member of the agency org that owns this
 * sub-org. Cross-agency access is rejected as 404 to avoid leaking
 * sub-org existence.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return unauthorized();
  if (!agencyOrgId) {
    return Response.json(
      { error: "No active organization. Switch to your agency org first." },
      { status: 400 }
    );
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where: { id: params.id, parentOrgId: agencyOrgId },
  });
  if (!relationship) {
    // Either the row doesn't exist or it belongs to a different agency.
    // Either way: 404 to avoid existence leak.
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  await prisma.orgRelationship.update({
    where: { id: relationship.id },
    data: { subOrgStatus: "ARCHIVED" },
  });

  return Response.json({ archived: true, id: relationship.id });
}
