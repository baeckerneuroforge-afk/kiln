/**
 * Sprint 19.7.2 — server helper that resolves the list of sub-orgs the
 * given user has access to, by joining SubOrgMembership → OrgRelationship.
 *
 * Used by:
 *   - ContextSwitcher (via /api/sub-orgs/for-current-user)
 *   - Auto-redirect (when a user has only sub-org memberships and no
 *     active agency org we route them straight into their sub-org)
 */
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient, SubOrgRole, PermissionSet } from "@prisma/client";

export interface UserSubOrgEntry {
  subOrgId: string;          // OrgRelationship.id (CUID)
  childOrgId: string;        // Clerk org id of the sub-org
  parentOrgId: string;       // Clerk org id of the agency
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  role: SubOrgRole;
  permissionSet: PermissionSet;
}

type PrismaLike = Pick<PrismaClient, "subOrgMembership">;

export async function getUserSubOrgs(
  userId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<UserSubOrgEntry[]> {
  if (!userId) return [];

  const memberships = await prisma.subOrgMembership.findMany({
    where: { userId },
    include: { subOrg: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    subOrgId: m.subOrg.id,
    childOrgId: m.subOrg.childOrgId,
    parentOrgId: m.subOrg.parentOrgId,
    name: m.subOrg.subOrgName,
    status: m.subOrg.subOrgStatus,
    role: m.role,
    permissionSet: m.permissionSet,
  }));
}
