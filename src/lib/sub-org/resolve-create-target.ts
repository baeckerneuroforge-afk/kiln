/**
 * Sprint 19.7.4 — resolve the effective target orgId for create flows
 * that may originate from either the agency or a sub-org context.
 *
 * Pattern: client adds `subOrgId` to the create-request body when the
 * page is rendering inside /dashboard/sub-org/[id]. Server calls this
 * helper to validate the membership + permission and returns the
 * Clerk org id (= OrgRelationship.childOrgId) to write into the
 * entity's `orgId` field.
 *
 * When `subOrgId` is missing, the caller stays on the agency-side
 * default orgId from `auth()` — no behaviour change for existing
 * callers.
 */
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import {
  getUserSubOrgMembership,
  permissionsFor,
  type SubOrgPermission,
} from "@/lib/permissions/sub-org-permissions";

export type ResolveResult =
  | { ok: true; orgId: string; usedSubOrg: { subOrgId: string; clerkOrgId: string } | null }
  | { ok: false; status: 401 | 403 | 404; error: string };

type PrismaLike = Pick<PrismaClient, "orgRelationship" | "subOrgMembership">;

export interface ResolveArgs {
  userId: string;
  /** auth().orgId — the active Clerk org. Falls back to this when subOrgId is null. */
  defaultOrgId: string | null | undefined;
  /** OrgRelationship.id (CUID). Pass null/undefined to skip sub-org resolution. */
  subOrgId: string | null | undefined;
  /** Permission required to create under the sub-org (e.g. "agents.write"). */
  requiredPermission: SubOrgPermission;
}

export async function resolveCreateTargetOrgId(
  args: ResolveArgs,
  prisma: PrismaLike = defaultPrisma,
): Promise<ResolveResult> {
  if (!args.userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // No sub-org id → agency-context create; keep existing behaviour.
  if (!args.subOrgId) {
    if (!args.defaultOrgId) {
      return { ok: false, status: 401, error: "No active organization." };
    }
    return { ok: true, orgId: args.defaultOrgId, usedSubOrg: null };
  }

  const membership = await getUserSubOrgMembership(args.userId, args.subOrgId, prisma);
  if (!membership) {
    // Existence-hiding: cross-tenant subOrgId reads as 404.
    return { ok: false, status: 404, error: "Sub-org not found" };
  }

  if (!permissionsFor(membership.permissionSet).has(args.requiredPermission)) {
    return {
      ok: false,
      status: 403,
      error: `Missing permission: ${args.requiredPermission}`,
    };
  }

  const rel = await prisma.orgRelationship.findUnique({
    where: { id: args.subOrgId },
    select: { childOrgId: true, subOrgStatus: true },
  });
  if (!rel) {
    return { ok: false, status: 404, error: "Sub-org not found" };
  }
  if (rel.subOrgStatus !== "ACTIVE") {
    return { ok: false, status: 403, error: "Sub-org is archived or suspended" };
  }

  return {
    ok: true,
    orgId: rel.childOrgId,
    usedSubOrg: { subOrgId: args.subOrgId, clerkOrgId: rel.childOrgId },
  };
}
