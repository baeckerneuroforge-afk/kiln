import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function loadEntryInOrg(profileId: string, entryId: string, orgId: string) {
  return prisma.customerMemoryEntry.findFirst({
    where: {
      id: entryId,
      customerProfileId: profileId,
      customerProfile: { orgId },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; entryId: string } },
) {
  try {
    const scope = await requireOrgId();
    const entry = await loadEntryInOrg(params.id, params.entryId, scope.orgId);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const updated = await prisma.customerMemoryEntry.update({
      where: { id: entry.id },
      data: {
        content: typeof body.content === "string" ? body.content : entry.content,
        type: typeof body.type === "string" ? body.type : entry.type,
        importance: typeof body.importance === "number" ? Math.max(1, Math.min(10, body.importance)) : entry.importance,
        isActive: typeof body.isActive === "boolean" ? body.isActive : entry.isActive,
        expiresAt: body.expiresAt === null ? null : typeof body.expiresAt === "string" ? new Date(body.expiresAt) : entry.expiresAt,
      },
    });
    await prisma.customerProfileAudit.create({
      data: {
        customerProfileId: entry.customerProfileId,
        orgId: scope.orgId,
        actorUserId: scope.userId,
        action: "MEMORY_EDIT",
        details: { entryId: entry.id },
      },
    });
    await logAudit({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      actorOrgId: scope.orgId,
      action: "MEMORY_EDITED",
      resourceType: "MEMORY_ENTRY",
      resourceId: entry.id,
      description: `Memory entry edited (customer ${entry.customerProfileId})`,
      changes: {
        before: { content: entry.content, importance: entry.importance, isActive: entry.isActive },
        after: { content: updated.content, importance: updated.importance, isActive: updated.isActive },
      },
      request,
    });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/memory] patch failed", error);
    return Response.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; entryId: string } },
) {
  try {
    const scope = await requireOrgId();
    const entry = await loadEntryInOrg(params.id, params.entryId, scope.orgId);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
    await prisma.customerMemoryEntry.delete({ where: { id: entry.id } });
    await prisma.customerProfileAudit.create({
      data: {
        customerProfileId: entry.customerProfileId,
        orgId: scope.orgId,
        actorUserId: scope.userId,
        action: "MEMORY_DELETE",
        details: { entryId: entry.id },
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[customers/memory] delete failed", error);
    return Response.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
