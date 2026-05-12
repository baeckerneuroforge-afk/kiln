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
import type { SubOrgMembership } from "@prisma/client";
import {
  getUserSubOrgMembership,
  permissionsFor,
  type SubOrgPermission,
} from "@/lib/permissions/sub-org-permissions";

export type SubOrgAccessResult =
  | {
      ok: true;
      membership: SubOrgMembership;
      userId: string;
    }
  | { ok: false; response: Response };

export async function requireSubOrgAccess(
  subOrgId: string,
  permission?: SubOrgPermission,
): Promise<SubOrgAccessResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const membership = await getUserSubOrgMembership(userId, subOrgId);
  if (!membership) {
    return {
      ok: false,
      response: Response.json({ error: "Sub-org not found" }, { status: 404 }),
    };
  }

  if (permission && !permissionsFor(membership.permissionSet).has(permission)) {
    return {
      ok: false,
      response: Response.json(
        { error: "Insufficient permission", permission },
        { status: 403 },
      ),
    };
  }

  return { ok: true, membership, userId };
}
