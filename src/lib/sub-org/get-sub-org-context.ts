/**
 * Sprint 19.7.3 — server-side context loader for /dashboard/sub-org/* pages.
 *
 * Returns everything a sub-org page needs in one shot:
 *   - The OrgRelationship row (id, name, brand colour, etc.)
 *   - The caller's SubOrgMembership row
 *   - The resolved permission set for quick has() checks
 *   - The Clerk org id (= OrgRelationship.childOrgId) for entity-scoped
 *     prisma queries — every list helper in get-sub-org-data filters
 *     by this id.
 *
 * Returns null when the caller can't access the sub-org; the page
 * decides whether to call notFound() or redirect.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { OrgRelationship, PrismaClient, SubOrgMembership } from "@prisma/client";
import {
  getUserSubOrgMembership,
  permissionsFor,
  type SubOrgPermission,
} from "@/lib/permissions/sub-org-permissions";

export type SubOrgContextSubOrg = Pick<
  OrgRelationship,
  | "id"
  | "childOrgId"
  | "parentOrgId"
  | "subOrgName"
  | "subOrgStatus"
  | "brandColor"
  | "logoUrl"
  | "industry"
>;

export interface SubOrgContext {
  userId: string;
  subOrg: SubOrgContextSubOrg;
  clerkOrgId: string;
  membership: SubOrgMembership;
  permissions: ReadonlySet<SubOrgPermission>;
}

type AuthLike = () => Promise<{ userId: string | null }>;
type PrismaLike = Pick<PrismaClient, "orgRelationship" | "subOrgMembership">;

export async function getSubOrgContext(
  subOrgId: string,
  deps?: { auth?: AuthLike; prisma?: PrismaLike },
): Promise<SubOrgContext | null> {
  const authFn = deps?.auth ?? auth;
  const prisma = deps?.prisma ?? defaultPrisma;

  const { userId } = await authFn();
  if (!userId) return null;

  const membership = await getUserSubOrgMembership(userId, subOrgId, prisma);
  if (!membership) return null;

  const subOrg = await prisma.orgRelationship.findUnique({
    where: { id: subOrgId },
    select: {
      id: true,
      childOrgId: true,
      parentOrgId: true,
      subOrgName: true,
      subOrgStatus: true,
      brandColor: true,
      logoUrl: true,
      industry: true,
    },
  });
  if (!subOrg) return null;

  return {
    userId,
    subOrg,
    clerkOrgId: subOrg.childOrgId,
    membership,
    permissions: permissionsFor(membership.permissionSet),
  };
}
