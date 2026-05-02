/**
 * Org-context helpers for the Multi-Tenancy migration.
 *
 * KILN's data model is being migrated from user-scoped to org-scoped (Clerk
 * Organizations). During the transition, every authenticated request needs a
 * resolved org id, but most users won't have an active org selected yet —
 * they're transparently mapped to their auto-created Personal workspace.
 *
 * Three helpers cover the three call sites we have:
 *   - requireOrgId():    "I need an authenticated user + an org id, error otherwise"
 *   - getOptionalOrgId():"I might have either, give me what's there"
 *   - getPersonalOrgId():"I have a userId, what's their personal org?"
 *
 * The Clerk active org (auth().orgId) is preferred. If absent, we fall back
 * to the user's User.personalOrgId in the local DB. Routes that need to
 * stay user-scoped during the transition (e.g. /api/agents PATCH) can use
 * getOptionalOrgId without changing behavior.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export type RequireOrgIdResult = { userId: string; orgId: string };

/**
 * Returns the current request's userId + orgId. Falls back to the user's
 * personal org when no Clerk active org is selected. Throws on missing
 * authentication or when the user has no personal org yet (pre-backfill
 * users — webhook should have provisioned one).
 */
export async function requireOrgId(): Promise<RequireOrgIdResult> {
  const { userId, orgId } = await auth();
  if (!userId) {
    throw new Error("Unauthenticated");
  }
  if (orgId) {
    return { userId, orgId };
  }
  const personal = await getPersonalOrgId(userId);
  if (!personal) {
    // Surface a deliberate, identifiable error so callers can map it to a
    // clean 409 / "no organization" UI state rather than a generic 500.
    throw new OrgContextError("User has no organization");
  }
  return { userId, orgId: personal };
}

/**
 * Returns the current request's userId and orgId without throwing. Either
 * field may be null. The orgId is the Clerk active org if set; we do NOT
 * resolve the personal org here — callers that want that fallback should
 * use requireOrgId() instead.
 *
 * Use this for routes that still need to operate user-only during Phase 2.1
 * and 2.2 (e.g. when a route doesn't yet filter by org).
 */
export async function getOptionalOrgId(): Promise<{
  userId: string | null;
  orgId: string | null;
}> {
  const { userId, orgId } = await auth();
  return { userId: userId ?? null, orgId: orgId ?? null };
}

/**
 * Looks up the user's auto-created Personal workspace org id from the local
 * DB. Returns null when the user record is missing or hasn't been backfilled
 * yet (in which case the webhook or backfill script should populate it
 * shortly).
 */
export async function getPersonalOrgId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalOrgId: true },
  });
  return user?.personalOrgId ?? null;
}

/**
 * Identifiable error class so route handlers can return a stable 409 when a
 * user lacks any organization, distinct from generic 500s.
 */
export class OrgContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgContextError";
  }
}
