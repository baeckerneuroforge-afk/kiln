/**
 * Sprint 19.7.5 — resolve the Clerk org id to persist an OAuth
 * IntegrationConnection under, given the userId + decoded state.
 *
 * State flow:
 *   - state.subOrgId present  → membership + integrations.manage check,
 *                               return the sub-org's Clerk org id
 *   - state.subOrgId missing  → fall back to the user's primary Clerk org
 *                               (auth() result). Pre-19.7.5 behaviour.
 *
 * The callback receives this result and writes orgId on the
 * IntegrationConnection upsert. The new (userId, orgId, provider) unique
 * key lets one user hold one connection per (org × provider) combination.
 */
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import {
  getUserSubOrgMembership,
  permissionsFor,
} from "@/lib/permissions/sub-org-permissions";

export type OAuthTargetResult =
  | { ok: true; orgId: string | null; usedSubOrg: { subOrgId: string; clerkOrgId: string } | null }
  | { ok: false; status: 403 | 404; reason: string };

type PrismaLike = Pick<PrismaClient, "orgRelationship" | "subOrgMembership">;

export interface ResolveOAuthTargetArgs {
  userId: string;
  /** auth().orgId — agency-side fallback when subOrgId is missing. */
  agencyOrgId: string | null | undefined;
  subOrgId: string | undefined | null;
}

export async function resolveOAuthTargetOrgId(
  args: ResolveOAuthTargetArgs,
  prisma: PrismaLike = defaultPrisma,
): Promise<OAuthTargetResult> {
  if (!args.subOrgId) {
    // Pre-19.7.5 behaviour — agency-context connection, orgId is whatever
    // Clerk says the active org is (may legitimately be null for legacy
    // users without an active org).
    return { ok: true, orgId: args.agencyOrgId ?? null, usedSubOrg: null };
  }

  const membership = await getUserSubOrgMembership(args.userId, args.subOrgId, prisma);
  if (!membership) {
    // Existence-hiding: cross-tenant subOrgId reads as 404.
    return { ok: false, status: 404, reason: "Sub-org not found" };
  }

  if (!permissionsFor(membership.permissionSet).has("integrations.manage")) {
    return { ok: false, status: 403, reason: "Missing permission: integrations.manage" };
  }

  const rel = await prisma.orgRelationship.findUnique({
    where: { id: args.subOrgId },
    select: { childOrgId: true, subOrgStatus: true },
  });
  if (!rel) return { ok: false, status: 404, reason: "Sub-org not found" };
  if (rel.subOrgStatus !== "ACTIVE") {
    return { ok: false, status: 403, reason: "Sub-org is archived or suspended" };
  }

  return {
    ok: true,
    orgId: rel.childOrgId,
    usedSubOrg: { subOrgId: args.subOrgId, clerkOrgId: rel.childOrgId },
  };
}
