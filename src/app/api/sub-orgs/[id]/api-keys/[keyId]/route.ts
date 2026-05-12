/**
 * Sprint 19.7.4 — DELETE /api/sub-orgs/[id]/api-keys/[keyId].
 * Owner / Admin (integrations.manage) only.
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getUserSubOrgMembership,
  permissionsFor,
} from "@/lib/permissions/sub-org-permissions";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; keyId: string } },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getUserSubOrgMembership(userId, params.id);
  if (!membership) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (!permissionsFor(membership.permissionSet).has("integrations.manage")) {
    return Response.json(
      { error: "Forbidden", permission: "integrations.manage" },
      { status: 403 },
    );
  }

  const result = await prisma.subOrgApiKey.deleteMany({
    where: { id: params.keyId, subOrgId: params.id },
  });
  if (result.count === 0) {
    return Response.json({ error: "API key not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
