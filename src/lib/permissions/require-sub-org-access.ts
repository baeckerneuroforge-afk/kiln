/**
 * Sprint 19.7.1 — Middleware-style helper for sub-org routes.
 *
 * Validates that the authenticated user has a SubOrgMembership row for
 * the addressed sub-org. Routes lift the resolved membership off the
 * success branch and skip their own auth boilerplate.
 *
 * The shape mirrors lib/agency/sub-org-auth.ts so call sites stay
 * familiar:
 *   const access = await requireSubOrgAccess(subOrgId, "agents.write");
 *   if (!access.ok) return access.response;
 *   const { membership, userId } = access;
 *
 * Cross-tenant access is denied with 404 (not 403) — same
 * existence-hiding rationale as the agency-side helper.
 */
import { auth } from "@clerk/nextjs/server";
import type {
  AgencyMembership,
  AgencyRole,
  OrgRelationship,
  SubOrgMembership,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAgencyMembership } from "@/lib/permissions/agency-permissions";
import {
  getUserSubOrgMembership,
  permissionsFor,
  type SubOrgPermission,
} from "@/lib/permissions/sub-org-permissions";

export interface RequireSubOrgAccessOptions {
  requiredAgencyRole?: AgencyRole[];
  requiredSubOrgPermission?: SubOrgPermission;
}

type SubOrgAccessFailure = { ok: false; response: Response };

export type SubOrgMembershipAccessResult =
  | {
      ok: true;
      membership: SubOrgMembership;
      userId: string;
    }
  | SubOrgAccessFailure;

export type AgencySubOrgAccessResult =
  | {
      ok: true;
      relationship: OrgRelationship;
      agencyMembership: AgencyMembership;
      agencyOrgId: string;
      userId: string;
      membership?: SubOrgMembership;
    }
  | SubOrgAccessFailure;

export type CombinedSubOrgAccessResult =
  | {
      ok: true;
      relationship: OrgRelationship;
      agencyMembership: AgencyMembership;
      agencyOrgId: string;
      membership: SubOrgMembership;
      userId: string;
    }
  | SubOrgAccessFailure;

export type SubOrgAccessResult =
  | SubOrgMembershipAccessResult
  | AgencySubOrgAccessResult
  | CombinedSubOrgAccessResult;

type OptionsOrPermission = SubOrgPermission | RequireSubOrgAccessOptions;

export async function requireSubOrgAccess(
  subOrgId: string,
  permission?: SubOrgPermission,
): Promise<SubOrgMembershipAccessResult>;
export async function requireSubOrgAccess(
  subOrgId: string,
  options: RequireSubOrgAccessOptions & {
    requiredAgencyRole: AgencyRole[];
    requiredSubOrgPermission: SubOrgPermission;
  },
): Promise<CombinedSubOrgAccessResult>;
export async function requireSubOrgAccess(
  subOrgId: string,
  options: RequireSubOrgAccessOptions & {
    requiredSubOrgPermission: SubOrgPermission;
  },
): Promise<SubOrgMembershipAccessResult>;
export async function requireSubOrgAccess(
  subOrgId: string,
  options: RequireSubOrgAccessOptions & { requiredAgencyRole: AgencyRole[] },
): Promise<AgencySubOrgAccessResult>;
export async function requireSubOrgAccess(
  subOrgId: string,
  options: RequireSubOrgAccessOptions,
): Promise<SubOrgAccessResult>;
export async function requireSubOrgAccess(
  subOrgId: string,
  options?: OptionsOrPermission,
): Promise<SubOrgAccessResult> {
  const normalized =
    typeof options === "string"
      ? { requiredSubOrgPermission: options }
      : options ?? {};
  const { requiredAgencyRole, requiredSubOrgPermission } = normalized;
  const requiresAgencyCheck = requiredAgencyRole !== undefined;
  const requiresSubOrgCheck =
    requiredSubOrgPermission !== undefined || !requiresAgencyCheck;

  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let relationship: OrgRelationship | null = null;
  let agencyMembership: AgencyMembership | null = null;

  if (requiresAgencyCheck) {
    if (!agencyOrgId) {
      return {
        ok: false,
        response: Response.json(
          { error: "No active organization. Switch to your agency org first." },
          { status: 400 },
        ),
      };
    }

    relationship = await prisma.orgRelationship.findFirst({
      where: { id: subOrgId, parentOrgId: agencyOrgId },
    });
    if (!relationship) {
      return {
        ok: false,
        response: Response.json({ error: "Sub-org not found" }, { status: 404 }),
      };
    }

    agencyMembership = await getAgencyMembership(userId, agencyOrgId);
    if (!agencyMembership) {
      return {
        ok: false,
        response: Response.json({ error: "Sub-org not found" }, { status: 404 }),
      };
    }

    if (!requiredAgencyRole.includes(agencyMembership.role)) {
      return {
        ok: false,
        response: Response.json(
          {
            error: "Insufficient role for this action",
            errorCode: "INSUFFICIENT_AGENCY_ROLE",
          },
          { status: 403 },
        ),
      };
    }
  }

  let membership: SubOrgMembership | null = null;
  if (requiresSubOrgCheck) {
    membership = await getUserSubOrgMembership(userId, subOrgId);
    if (!membership) {
      return {
        ok: false,
        response: Response.json({ error: "Sub-org not found" }, { status: 404 }),
      };
    }

    if (
      requiredSubOrgPermission &&
      !permissionsFor(membership.permissionSet).has(requiredSubOrgPermission)
    ) {
      return {
        ok: false,
        response: Response.json(
          { error: "Insufficient permission", permission: requiredSubOrgPermission },
          { status: 403 },
        ),
      };
    }
  }

  if (requiresAgencyCheck && requiresSubOrgCheck) {
    return {
      ok: true,
      relationship: relationship!,
      agencyMembership: agencyMembership!,
      agencyOrgId: agencyOrgId!,
      membership: membership!,
      userId,
    };
  }

  if (requiresAgencyCheck) {
    return {
      ok: true,
      relationship: relationship!,
      agencyMembership: agencyMembership!,
      agencyOrgId: agencyOrgId!,
      userId,
    };
  }

  return { ok: true, membership: membership!, userId };
}
