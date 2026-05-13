/**
 * Sprint 19.7.6 — agency-internal RBAC helpers.
 *
 * Mirrors the shape of sub-org-permissions.ts but at the agency tier.
 * Four roles: OWNER, ADMIN, CONSULTANT, VIEWER. OWNER/ADMIN see every
 * Sub-Org in their agency; CONSULTANT/VIEWER only see what's been
 * explicitly granted via AgencyMemberSubOrgAccess.
 *
 *   - getAgencyMembership(userId, agencyClerkOrgId)
 *   - hasAgencyPermission(userId, agencyClerkOrgId, permission)
 *   - getAccessibleSubOrgIds(userId, agencyClerkOrgId)
 *   - canAccessSubOrgViaAgency(userId, subOrgId) — bridges into Sub-Org
 *     access checks so an agency-level role grants entry without
 *     requiring a SubOrgMembership row.
 *
 * The agency-level role is independent from the per-Sub-Org PermissionSet
 * carried on AgencyMemberSubOrgAccess.permissionOverride: the role
 * decides "can this user see the Sub-Org at all"; the override decides
 * "what can they DO inside it" (defaulting to the role's natural floor).
 */
import type {
  AgencyMembership,
  AgencyRole,
  PermissionSet,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type AgencyPermission =
  | "agency.manage" // settings, branding, white-label
  | "billing.manage" // Stripe, subscription, cancellations
  | "members.manage" // invite/remove agency members + edit roles
  | "sub-orgs.create"
  | "sub-orgs.delete"
  | "sub-orgs.read" // list sub-orgs in the agency surface
  | "templates.manage"
  | "all-sub-orgs.access"; // implicit read+edit across every sub-org

const PERMISSIONS_BY_AGENCY_ROLE: Record<AgencyRole, ReadonlySet<AgencyPermission>> = {
  OWNER: new Set<AgencyPermission>([
    "agency.manage",
    "billing.manage",
    "members.manage",
    "sub-orgs.create",
    "sub-orgs.delete",
    "sub-orgs.read",
    "templates.manage",
    "all-sub-orgs.access",
  ]),
  ADMIN: new Set<AgencyPermission>([
    "agency.manage",
    "members.manage",
    "sub-orgs.create",
    "sub-orgs.delete",
    "sub-orgs.read",
    "templates.manage",
    "all-sub-orgs.access",
  ]),
  CONSULTANT: new Set<AgencyPermission>([
    "sub-orgs.read",
  ]),
  VIEWER: new Set<AgencyPermission>([
    "sub-orgs.read",
  ]),
};

type PrismaLike = Pick<
  typeof defaultPrisma,
  "agencyMembership" | "agencyMemberSubOrgAccess" | "orgRelationship"
>;

export function permissionsForAgencyRole(role: AgencyRole): ReadonlySet<AgencyPermission> {
  return PERMISSIONS_BY_AGENCY_ROLE[role];
}

export async function getAgencyMembership(
  userId: string,
  agencyClerkOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<AgencyMembership | null> {
  return prisma.agencyMembership.findUnique({
    where: { agencyClerkOrgId_userId: { agencyClerkOrgId, userId } },
  });
}

export async function hasAgencyPermission(
  userId: string,
  agencyClerkOrgId: string,
  permission: AgencyPermission,
  prisma: PrismaLike = defaultPrisma,
): Promise<boolean> {
  const membership = await getAgencyMembership(userId, agencyClerkOrgId, prisma);
  if (!membership) return false;
  return permissionsForAgencyRole(membership.role).has(permission);
}

/**
 * The list of OrgRelationship rows this user can access through their
 * agency-level role. OWNER/ADMIN: every row under the agency. Other
 * roles: only those linked via AgencyMemberSubOrgAccess. Returns null
 * when no AgencyMembership exists.
 */
export async function getAccessibleSubOrgIds(
  userId: string,
  agencyClerkOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<
  | { membership: AgencyMembership; scope: "all" }
  | { membership: AgencyMembership; scope: "assigned"; subOrgIds: string[] }
  | null
> {
  const membership = await getAgencyMembership(userId, agencyClerkOrgId, prisma);
  if (!membership) return null;
  if (permissionsForAgencyRole(membership.role).has("all-sub-orgs.access")) {
    return { membership, scope: "all" };
  }
  const access = await prisma.agencyMemberSubOrgAccess.findMany({
    where: { agencyMembershipId: membership.id },
    select: { subOrgId: true },
  });
  return {
    membership,
    scope: "assigned",
    subOrgIds: access.map((a) => a.subOrgId),
  };
}

/**
 * Default PermissionSet that an AgencyRole implies inside a Sub-Org
 * when no explicit override is set:
 *   OWNER, ADMIN    → FULL_ACCESS
 *   CONSULTANT      → FULL_ACCESS (edit, but not member-management — that
 *                                   is the agency-level members.manage,
 *                                   which they don't have)
 *   VIEWER          → READ_ONLY
 */
export function defaultPermissionSetForRole(role: AgencyRole): PermissionSet {
  switch (role) {
    case "OWNER":
    case "ADMIN":
    case "CONSULTANT":
      return "FULL_ACCESS";
    case "VIEWER":
      return "READ_ONLY";
  }
}

/**
 * Bridges agency-membership into sub-org access. Resolves the agency the
 * sub-org belongs to, looks up the user's AgencyMembership there, and
 * returns the effective PermissionSet (override if present, otherwise
 * the role's default) when access is allowed.
 *
 * Returns null when the user is not an agency-member, or when their role
 * requires an explicit assignment they don't have for this sub-org.
 */
export async function canAccessSubOrgViaAgency(
  userId: string,
  subOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<{
  membership: AgencyMembership;
  effectivePermissionSet: PermissionSet;
} | null> {
  const subOrg = await prisma.orgRelationship.findUnique({
    where: { id: subOrgId },
    select: { id: true, parentOrgId: true },
  });
  if (!subOrg) return null;

  const membership = await getAgencyMembership(userId, subOrg.parentOrgId, prisma);
  if (!membership) return null;

  const hasAll = permissionsForAgencyRole(membership.role).has("all-sub-orgs.access");
  if (hasAll) {
    return {
      membership,
      effectivePermissionSet: defaultPermissionSetForRole(membership.role),
    };
  }

  // CONSULTANT / VIEWER — needs explicit assignment.
  const assignment = await prisma.agencyMemberSubOrgAccess.findUnique({
    where: {
      agencyMembershipId_subOrgId: {
        agencyMembershipId: membership.id,
        subOrgId,
      },
    },
  });
  if (!assignment) return null;

  return {
    membership,
    effectivePermissionSet:
      assignment.permissionOverride ?? defaultPermissionSetForRole(membership.role),
  };
}

/**
 * Bootstrap helper for the rollout edge: a user who was the Clerk
 * org-admin but never created a sub-org (so the migration backfill
 * couldn't materialize their AgencyMembership row) would otherwise be
 * locked out of their own agency the moment Phase D wires up the
 * permission checks. To prevent that we auto-create an OWNER row on
 * first access when the caller is org:admin in Clerk and no row exists.
 *
 * Regular Clerk org-members never get auto-bootstrapped — they must be
 * invited by an existing OWNER/ADMIN.
 */
type EnsurePrismaLike = Pick<typeof defaultPrisma, "agencyMembership">;

export async function ensureAgencyMembershipFromClerkRole(
  userId: string,
  agencyClerkOrgId: string,
  clerkRole: string | null | undefined,
  prisma: EnsurePrismaLike = defaultPrisma,
): Promise<AgencyMembership | null> {
  const existing = await prisma.agencyMembership.findUnique({
    where: { agencyClerkOrgId_userId: { agencyClerkOrgId, userId } },
  });
  if (existing) return existing;
  if (clerkRole !== "org:admin") return null;

  return prisma.agencyMembership.create({
    data: {
      agencyClerkOrgId,
      userId,
      role: "OWNER",
      acceptedAt: new Date(),
    },
  });
}
