/**
 * Sprint 19.7.1 — sub-org permission helpers.
 *
 * Three primitives that future sub-org routes (Sprint 19.7.3+) build
 * on:
 *   - getUserSubOrgMembership(userId, subOrgId)
 *   - canAccessSubOrg(userId, subOrgId)
 *   - hasSubOrgPermission(userId, subOrgId, permission)
 *
 * `subOrgId` here is the OrgRelationship.id (CUID), matching the FK
 * shape on SubOrgMembership. Use childOrgId-based lookups via the
 * webhook handler's resolver if you only have the Clerk org id.
 *
 * Permission matrix (cumulative — each tier adds to the one below):
 *   READ_ONLY                  conversations.read, analytics.read
 *   USE_AGENTS                 + agents.read, agents.execute
 *   USE_AGENTS_PLUS_KNOWLEDGE  + knowledge.read, knowledge.write
 *   FULL_ACCESS                + agents.write, workflows.read+write,
 *                                integrations.read+write, memberships.manage
 */
import type { PermissionSet, SubOrgMembership } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type SubOrgPermission =
  | "conversations.read"
  | "analytics.read"
  | "agents.read"
  | "agents.execute"
  | "agents.write"
  | "knowledge.read"
  | "knowledge.write"
  | "workflows.read"
  | "workflows.write"
  | "integrations.read"
  | "integrations.manage"
  | "memberships.manage";

// Sprint 19.7.4 — integrations.read is now in every permission set so
// every member can see "Integrations are configured" (without seeing the
// secrets), while .manage stays gated to FULL_ACCESS.
const PERMISSIONS_BY_SET: Record<PermissionSet, ReadonlySet<SubOrgPermission>> = {
  READ_ONLY: new Set<SubOrgPermission>([
    "conversations.read",
    "analytics.read",
    "integrations.read",
  ]),
  USE_AGENTS: new Set<SubOrgPermission>([
    "conversations.read",
    "analytics.read",
    "agents.read",
    "agents.execute",
    "integrations.read",
  ]),
  USE_AGENTS_PLUS_KNOWLEDGE: new Set<SubOrgPermission>([
    "conversations.read",
    "analytics.read",
    "agents.read",
    "agents.execute",
    "knowledge.read",
    "knowledge.write",
    "integrations.read",
  ]),
  FULL_ACCESS: new Set<SubOrgPermission>([
    "conversations.read",
    "analytics.read",
    "agents.read",
    "agents.execute",
    "agents.write",
    "knowledge.read",
    "knowledge.write",
    "workflows.read",
    "workflows.write",
    "integrations.read",
    "integrations.manage",
    "memberships.manage",
  ]),
};

type PrismaLike = Pick<typeof defaultPrisma, "subOrgMembership">;

export async function getUserSubOrgMembership(
  userId: string,
  subOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgMembership | null> {
  return prisma.subOrgMembership.findUnique({
    where: { subOrgId_userId: { subOrgId, userId } },
  });
}

export async function canAccessSubOrg(
  userId: string,
  subOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<boolean> {
  const membership = await getUserSubOrgMembership(userId, subOrgId, prisma);
  return membership !== null;
}

export function permissionsFor(set: PermissionSet): ReadonlySet<SubOrgPermission> {
  return PERMISSIONS_BY_SET[set];
}

export async function hasSubOrgPermission(
  userId: string,
  subOrgId: string,
  permission: SubOrgPermission,
  prisma: PrismaLike = defaultPrisma,
): Promise<boolean> {
  const membership = await getUserSubOrgMembership(userId, subOrgId, prisma);
  if (!membership) return false;
  return permissionsFor(membership.permissionSet).has(permission);
}
