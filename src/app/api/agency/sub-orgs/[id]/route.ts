/**
 * GET    /api/agency/sub-orgs/[id] — fetch single sub-org metadata.
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
import { prisma } from "@/lib/prisma";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;
  const r = access.relationship;
  return Response.json({
    id: r.id,
    childOrgId: r.childOrgId,
    name: r.subOrgName,
    status: r.subOrgStatus,
    createdAt: r.createdAt.toISOString(),
    pricingMode: r.pricingMode,
    monthlyPriceCents: r.monthlyPriceCents,
    setupFeeCents: r.setupFeeCents,
    pricingCurrency: r.pricingCurrency,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;

  await prisma.orgRelationship.update({
    where: { id: access.relationship.id },
    data: { subOrgStatus: "ARCHIVED" },
  });

  return Response.json({ archived: true, id: access.relationship.id });
}
