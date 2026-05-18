/**
 * GET /api/agency/sub-orgs/[id]/members — list users with access to
 * the sub-org. Pulls org memberships from Clerk and joins minimal
 * user metadata (name, email, role, last active).
 *
 * Auth: agency-role helper; members are visible to CONSULTANT+.
 */
import { clerkClient } from "@clerk/nextjs/server";
import { requireSubOrgAccess } from "@/lib/permissions/require-sub-org-access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id, {
    requiredAgencyRole: ["OWNER", "ADMIN", "CONSULTANT"],
  });
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const client = await clerkClient();
  try {
    const memberships = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
    });

    const items = memberships.data.map((m) => {
      const u = m.publicUserData;
      const fullName = [u?.firstName, u?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        membershipId: m.id,
        userId: m.publicUserData?.userId ?? null,
        name: fullName || u?.identifier || "Unknown",
        email: u?.identifier ?? null,
        role: m.role, // "org:admin" / "org:member"
        imageUrl: u?.imageUrl ?? null,
        joinedAt: new Date(m.createdAt).toISOString(),
      };
    });

    return Response.json({ items, total: memberships.totalCount ?? items.length });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch members" },
      { status: 502 },
    );
  }
}
