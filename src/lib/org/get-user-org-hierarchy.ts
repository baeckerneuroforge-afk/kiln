/**
 * Sprint 19.7.4.1 — hierarchical view of every Clerk org the caller
 * is a member of, joined with our OrgRelationship table.
 *
 *   personal:      the user's auto-provisioned Personal Workspace
 *   agencies:      orgs the caller is in that own at least one
 *                  OrgRelationship; sub-orgs appear nested + carry the
 *                  OrgRelationship.id (CUID) so callers can build
 *                  /dashboard/sub-org/[id] URLs
 *   standaloneOrgs: orgs the caller is in that are neither personal
 *                  nor an agency they sit in (e.g. they were invited
 *                  to a sub-org Clerk org directly without joining the
 *                  parent agency)
 *
 * Returns null sections rather than empty arrays where useful — the
 * SingleContextSwitcher renders headers conditionally on presence.
 */
import type { clerkClient } from "@clerk/nextjs/server";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export interface HierarchySubOrg {
  subOrgId: string;        // OrgRelationship.id (CUID)
  clerkOrgId: string;      // OrgRelationship.childOrgId
  name: string;
  imageUrl: string | null;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

export interface HierarchyAgency {
  clerkOrgId: string;
  name: string;
  imageUrl: string | null;
  subOrgs: HierarchySubOrg[];
}

export interface HierarchyStandalone {
  clerkOrgId: string;
  name: string;
  imageUrl: string | null;
}

export interface HierarchyPersonal {
  clerkOrgId: string;
  name: string;
  imageUrl: string | null;
}

export interface UserOrgHierarchy {
  personal: HierarchyPersonal | null;
  agencies: HierarchyAgency[];
  standaloneOrgs: HierarchyStandalone[];
}

type PrismaLike = Pick<PrismaClient, "orgRelationship" | "user">;
type ClerkLike = typeof clerkClient;

interface ClerkMembershipRow {
  organization: { id: string; name: string; imageUrl?: string };
  role: string;
}

export interface BuildHierarchyArgs {
  memberships: ClerkMembershipRow[];
  personalOrgId: string | null;
  relationships: Array<{
    id: string;
    parentOrgId: string;
    childOrgId: string;
    subOrgName: string;
    subOrgStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  }>;
}

/**
 * Pure assembly — given the raw inputs, produce the hierarchical view.
 * Extracted so unit tests can pin the bucket logic without mocking
 * Clerk or Prisma.
 */
export function buildHierarchy(args: BuildHierarchyArgs): UserOrgHierarchy {
  const { memberships, personalOrgId, relationships } = args;

  const childOrgIds = new Set(relationships.map((r) => r.childOrgId));
  const parentOrgIdsInMemberships = new Set(
    memberships
      .filter((m) => relationships.some((r) => r.parentOrgId === m.organization.id))
      .map((m) => m.organization.id),
  );

  let personal: HierarchyPersonal | null = null;
  const agencies: HierarchyAgency[] = [];
  const standaloneOrgs: HierarchyStandalone[] = [];

  for (const m of memberships) {
    const orgId = m.organization.id;
    const name = m.organization.name;
    const imageUrl = m.organization.imageUrl ?? null;

    if (personalOrgId && orgId === personalOrgId) {
      personal = { clerkOrgId: orgId, name, imageUrl };
      continue;
    }

    if (parentOrgIdsInMemberships.has(orgId)) {
      const subOrgs = relationships
        .filter((r) => r.parentOrgId === orgId && r.subOrgStatus === "ACTIVE")
        .map((r) => ({
          subOrgId: r.id,
          clerkOrgId: r.childOrgId,
          name: r.subOrgName,
          imageUrl: null,
          status: r.subOrgStatus,
        }));
      agencies.push({ clerkOrgId: orgId, name, imageUrl, subOrgs });
      continue;
    }

    // If the caller is in a sub-org Clerk org but NOT in its parent
    // agency, surface it as a standalone workspace (they can still
    // operate inside it, just via the bottom bucket).
    if (childOrgIds.has(orgId)) {
      const rel = relationships.find((r) => r.childOrgId === orgId);
      if (rel && parentOrgIdsInMemberships.has(rel.parentOrgId)) {
        continue;
      }
    }

    standaloneOrgs.push({ clerkOrgId: orgId, name, imageUrl });
  }

  return { personal, agencies, standaloneOrgs };
}

export async function getUserOrgHierarchy(
  userId: string,
  deps: { clerk: ClerkLike; prisma?: PrismaLike },
): Promise<UserOrgHierarchy> {
  const prisma = deps.prisma ?? defaultPrisma;
  const client = await deps.clerk();
  const clerkResp = await client.users.getOrganizationMembershipList({ userId });
  const memberships: ClerkMembershipRow[] = clerkResp.data.map((m) => ({
    organization: {
      id: m.organization.id,
      name: m.organization.name,
      imageUrl: m.organization.imageUrl,
    },
    role: m.role,
  }));

  const localUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalOrgId: true },
  });

  const orgIds = memberships.map((m) => m.organization.id);
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
            id: true,
            parentOrgId: true,
            childOrgId: true,
            subOrgName: true,
            subOrgStatus: true,
          },
        })
      : [];

  return buildHierarchy({
    memberships,
    personalOrgId: localUser?.personalOrgId ?? null,
    relationships,
  });
}
