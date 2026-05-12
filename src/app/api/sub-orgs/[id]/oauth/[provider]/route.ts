/**
 * Sprint 19.7.5 — disconnect a single OAuth provider for a sub-org.
 *
 *   DELETE /api/sub-orgs/[id]/oauth/[provider]
 *     → flips IntegrationConnection.isActive = false for the row scoped
 *       to this sub-org's Clerk org. Idempotent (404 if no row exists).
 *
 * Disconnect needs integrations.manage. We mark inactive rather than
 * hard-deleting so audit trails + per-agent assignments stay intact;
 * the connection is reused on the next OAuth callback.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";
import {
  getUserSubOrgMembership,
  permissionsFor,
} from "@/lib/permissions/sub-org-permissions";

export const dynamic = "force-dynamic";

const SUPPORTED_PROVIDERS = new Set(["gmail", "google-calendar", "slack", "hubspot", "notion"]);

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; provider: string } },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!SUPPORTED_PROVIDERS.has(params.provider)) {
    return Response.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const membership = await getUserSubOrgMembership(userId, params.id);
  if (!membership) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (!permissionsFor(membership.permissionSet).has("integrations.manage")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const rel = await prisma.orgRelationship.findUnique({
    where: { id: params.id },
    select: { childOrgId: true },
  });
  if (!rel) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  const connection = await prisma.integrationConnection.findFirst({
    where: { orgId: rel.childOrgId, provider: params.provider, isActive: true },
    select: { id: true, name: true },
  });
  if (!connection) {
    return Response.json({ error: "Not connected" }, { status: 404 });
  }

  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: { isActive: false, lastSyncAt: new Date() },
  });

  await logAudit({
    orgId: rel.childOrgId,
    actorUserId: userId,
    action: "INTEGRATION_DISCONNECTED",
    resourceType: "INTEGRATION_CONNECTION",
    resourceId: connection.id,
    description: `${params.provider} disconnected (${connection.name})`,
    severity: "INFO",
    metadata: { provider: params.provider, subOrgId: params.id },
  });

  return Response.json({ ok: true });
}
