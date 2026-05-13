/**
 * Sprint 19.7.6 — single-member CRUD on the agency team.
 *
 * PATCH  /api/agency/team/[id]
 *   - update role and/or sub-org assignments (with optional per-sub-org
 *     permissionOverride). Only an OWNER may touch another OWNER.
 *
 * DELETE /api/agency/team/[id]
 *   - remove the agency-membership. Refuses to remove the caller's own
 *     row and refuses to remove the last OWNER. Optionally also detaches
 *     the user from the Clerk org (best-effort).
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import type { AgencyRole, PermissionSet } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAgencyAccess } from "@/lib/permissions/require-agency-access";

export const dynamic = "force-dynamic";

const VALID_AGENCY_ROLES: ReadonlySet<AgencyRole> = new Set([
  "OWNER",
  "ADMIN",
  "CONSULTANT",
  "VIEWER",
]);

const VALID_PERMISSION_SETS: ReadonlySet<PermissionSet> = new Set([
  "READ_ONLY",
  "USE_AGENTS",
  "USE_AGENTS_PLUS_KNOWLEDGE",
  "FULL_ACCESS",
]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!agencyOrgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  const access = await requireAgencyAccess(agencyOrgId, "members.manage");
  if (!access.ok) return access.response;

  const target = await prisma.agencyMembership.findFirst({
    where: { id: params.id, agencyClerkOrgId: agencyOrgId },
  });
  if (!target) {
    return Response.json({ error: "Member not found" }, { status: 404 });
  }

  // Only an OWNER may touch another OWNER (prevents an ADMIN from
  // demoting an OWNER to ADMIN and then taking over).
  if (target.role === "OWNER" && access.membership.role !== "OWNER") {
    return Response.json(
      { error: "Only an OWNER can modify another OWNER" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    role?: unknown;
    subOrgIds?: unknown;
    permissionOverrides?: unknown;
  };

  const updates: { role?: AgencyRole } = {};
  if (
    typeof body.role === "string" &&
    VALID_AGENCY_ROLES.has(body.role as AgencyRole)
  ) {
    const newRole = body.role as AgencyRole;
    // Promotions to OWNER also require OWNER caller.
    if (newRole === "OWNER" && access.membership.role !== "OWNER") {
      return Response.json(
        { error: "Only an OWNER can promote to OWNER" },
        { status: 403 },
      );
    }
    // Demotions away from the last OWNER are refused.
    if (target.role === "OWNER" && newRole !== "OWNER") {
      const ownerCount = await prisma.agencyMembership.count({
        where: { agencyClerkOrgId: agencyOrgId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return Response.json(
          { error: "Cannot demote the last OWNER" },
          { status: 400 },
        );
      }
    }
    updates.role = newRole;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.agencyMembership.update({
      where: { id: target.id },
      data: updates,
    });
  }

  // Replace sub-org assignments if provided. Skipping (undefined)
  // preserves existing assignments — explicit empty array clears.
  if (Array.isArray(body.subOrgIds)) {
    const subOrgIds = body.subOrgIds
      .filter((s): s is string => typeof s === "string" && s.length > 0);

    if (subOrgIds.length > 0) {
      const valid = await prisma.orgRelationship.findMany({
        where: { id: { in: subOrgIds }, parentOrgId: agencyOrgId },
        select: { id: true },
      });
      if (valid.length !== subOrgIds.length) {
        return Response.json(
          { error: "One or more sub-orgs do not belong to this agency" },
          { status: 400 },
        );
      }
    }

    const permissionOverridesInput =
      body.permissionOverrides && typeof body.permissionOverrides === "object"
        ? (body.permissionOverrides as Record<string, unknown>)
        : {};
    const permissionOverrides: Record<string, PermissionSet> = {};
    for (const [k, v] of Object.entries(permissionOverridesInput)) {
      if (typeof v === "string" && VALID_PERMISSION_SETS.has(v as PermissionSet)) {
        permissionOverrides[k] = v as PermissionSet;
      }
    }

    await prisma.$transaction([
      prisma.agencyMemberSubOrgAccess.deleteMany({
        where: { agencyMembershipId: target.id },
      }),
      ...(subOrgIds.length > 0
        ? [
            prisma.agencyMemberSubOrgAccess.createMany({
              data: subOrgIds.map((subOrgId) => ({
                agencyMembershipId: target.id,
                subOrgId,
                permissionOverride: permissionOverrides[subOrgId] ?? null,
              })),
            }),
          ]
        : []),
    ]);
  }

  const refreshed = await prisma.agencyMembership.findUnique({
    where: { id: target.id },
    include: { subOrgAccess: true },
  });
  return Response.json({ member: refreshed });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!agencyOrgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  const access = await requireAgencyAccess(agencyOrgId, "members.manage");
  if (!access.ok) return access.response;

  const target = await prisma.agencyMembership.findFirst({
    where: { id: params.id, agencyClerkOrgId: agencyOrgId },
  });
  if (!target) {
    return Response.json({ error: "Member not found" }, { status: 404 });
  }

  // Cannot remove yourself — protect against accidental self-lockout.
  if (target.userId === userId) {
    return Response.json(
      { error: "You cannot remove yourself; ask another OWNER" },
      { status: 400 },
    );
  }

  if (target.role === "OWNER") {
    if (access.membership.role !== "OWNER") {
      return Response.json(
        { error: "Only an OWNER can remove another OWNER" },
        { status: 403 },
      );
    }
    const ownerCount = await prisma.agencyMembership.count({
      where: { agencyClerkOrgId: agencyOrgId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return Response.json(
        { error: "Cannot remove the last OWNER" },
        { status: 400 },
      );
    }
  }

  // Best-effort: also detach from the Clerk org. We don't block on this
  // because the local row is the gate that matters now.
  try {
    const client = await clerkClient();
    await client.organizations.deleteOrganizationMembership({
      organizationId: agencyOrgId,
      userId: target.userId,
    });
  } catch (err) {
    console.warn("[agency/team] Clerk org detach failed (continuing):", err);
  }

  // Cascade deletes the AgencyMemberSubOrgAccess rows via FK.
  await prisma.agencyMembership.delete({ where: { id: target.id } });

  return Response.json({ ok: true });
}
