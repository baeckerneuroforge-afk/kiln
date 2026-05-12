/**
 * Sprint 19.7.5 — list OAuth connections for a sub-org.
 *
 *   GET /api/sub-orgs/[id]/oauth → { connections: [{ provider, label,
 *                                       connectedAt, identifier }] }
 *
 * Requires integrations.read. Returns one row per (provider) currently
 * connected under the sub-org's Clerk org id (= OrgRelationship.childOrgId).
 * `identifier` is provider-specific (Gmail address, Slack team name, etc.)
 * derived from the connection name field — we never decrypt the config
 * just to render a status row.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getUserSubOrgMembership,
  permissionsFor,
} from "@/lib/permissions/sub-org-permissions";

export const dynamic = "force-dynamic";

const SUPPORTED_PROVIDERS = ["gmail", "google-calendar", "slack", "hubspot", "notion"] as const;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getUserSubOrgMembership(userId, params.id);
  if (!membership) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (!permissionsFor(membership.permissionSet).has("integrations.read")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const rel = await prisma.orgRelationship.findUnique({
    where: { id: params.id },
    select: { childOrgId: true },
  });
  if (!rel) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }

  const connections = await prisma.integrationConnection.findMany({
    where: {
      orgId: rel.childOrgId,
      provider: { in: [...SUPPORTED_PROVIDERS] },
      isActive: true,
    },
    select: {
      id: true,
      provider: true,
      name: true,
      lastSyncAt: true,
      createdAt: true,
    },
  });

  return Response.json({
    connections: connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      identifier: c.name,
      connectedAt: c.createdAt.toISOString(),
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    })),
  });
}
