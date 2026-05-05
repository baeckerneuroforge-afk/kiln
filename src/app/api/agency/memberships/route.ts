/**
 * GET /api/agency/memberships — caller's Clerk org memberships, grouped
 * by agency-relationship.
 *
 * Returns three buckets:
 *   - personal:  the user's auto-created Personal Workspace (the org
 *                whose id matches User.personalOrgId).
 *   - agencies:  array of { orgId, name, subOrgs: [...] }, one per
 *                agency the caller is a member of, with the sub-orgs
 *                they own nested inside (only ACTIVE ones).
 *   - other:     orgs the caller is in that aren't their personal org
 *                and aren't an agency they own — typically sub-orgs
 *                they were invited to as a client member.
 *
 * The custom org-switcher renders these three buckets with section
 * headers. Without this server-side grouping the client would have to
 * cross-reference Clerk memberships with our OrgRelationship table,
 * which is a chatty + race-prone fetch chain.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SubOrgEntry = {
  orgId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

type AgencyEntry = {
  orgId: string;
  name: string;
  imageUrl: string | null;
  subOrgs: SubOrgEntry[];
};

type Membership = {
  orgId: string;
  name: string;
  imageUrl: string | null;
  role: string;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();

  // (1) All Clerk memberships for the caller. Source of truth — both
  // the personal org and any orgs they joined as a client.
  const clerkResp = await client.users.getOrganizationMembershipList({ userId });
  const memberships: Membership[] = clerkResp.data.map((m) => ({
    orgId: m.organization.id,
    name: m.organization.name,
    imageUrl: m.organization.imageUrl ?? null,
    role: m.role,
  }));

  // (2) Local DB info: personalOrgId + the relationships the caller's
  // membership-orgs participate in (as parent or child).
  const localUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalOrgId: true },
  });

  const orgIds = memberships.map((m) => m.orgId);
  const relationships =
    orgIds.length > 0
      ? await prisma.orgRelationship.findMany({
          where: {
            OR: [
              { parentOrgId: { in: orgIds } },
              { childOrgId: { in: orgIds } },
            ],
          },
          select: {
            parentOrgId: true,
            childOrgId: true,
            subOrgName: true,
            subOrgStatus: true,
          },
        })
      : [];

  // (3) Bucket the memberships.
  const personalOrgId = localUser?.personalOrgId ?? null;
  const childOrgIds = new Set(relationships.map((r) => r.childOrgId));
  const parentMembershipIds = new Set(
    memberships
      .filter((m) =>
        relationships.some((r) => r.parentOrgId === m.orgId)
      )
      .map((m) => m.orgId)
  );

  let personal: Membership | null = null;
  const agencies: AgencyEntry[] = [];
  const other: Membership[] = [];

  for (const m of memberships) {
    if (personalOrgId && m.orgId === personalOrgId) {
      personal = m;
      continue;
    }
    if (parentMembershipIds.has(m.orgId)) {
      const subOrgs: SubOrgEntry[] = relationships
        .filter(
          (r) =>
            r.parentOrgId === m.orgId && r.subOrgStatus === "ACTIVE"
        )
        .map((r) => ({
          orgId: r.childOrgId,
          name: r.subOrgName,
          status: r.subOrgStatus,
        }));
      agencies.push({
        orgId: m.orgId,
        name: m.name,
        imageUrl: m.imageUrl,
        subOrgs,
      });
      continue;
    }
    // Skip child-of-an-agency entries from "other" if the caller's
    // also a member of the agency — those orgs already render under
    // the agency. If the caller is NOT a member of the parent agency
    // (got invited directly to a sub-org), the org belongs in "other".
    if (childOrgIds.has(m.orgId)) {
      const rel = relationships.find((r) => r.childOrgId === m.orgId);
      if (rel && parentMembershipIds.has(rel.parentOrgId)) {
        continue;
      }
    }
    other.push(m);
  }

  return Response.json({ personal, agencies, other });
}
