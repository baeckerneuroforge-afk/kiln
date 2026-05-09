import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function loadOrgPolicy(id: string, orgId: string) {
  return prisma.slaPolicy.findFirst({
    where: { id, department: { orgId } },
    include: { department: { select: { id: true, name: true, orgId: true } } },
  });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const policy = await loadOrgPolicy(params.id, scope.orgId);
    if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(policy);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/policies] get failed", error);
    return Response.json({ error: "Failed to load policy" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const policy = await loadOrgPolicy(params.id, scope.orgId);
    if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const data: Prisma.SlaPolicyUpdateInput = {};
    if (typeof body.name === "string") data.name = body.name;
    if (typeof body.description === "string" || body.description === null) data.description = body.description;
    if (["ALL", "BY_PRIORITY", "BY_CHANNEL", "BY_TAG"].includes(body.appliesTo)) data.appliesTo = body.appliesTo;
    if (typeof body.conditionValue === "string" || body.conditionValue === null) data.conditionValue = body.conditionValue;
    if (typeof body.firstResponseTargetMinutes === "number" && body.firstResponseTargetMinutes > 0) {
      data.firstResponseTargetMinutes = Math.trunc(body.firstResponseTargetMinutes);
    }
    if (typeof body.resolutionTargetMinutes === "number" || body.resolutionTargetMinutes === null) {
      data.resolutionTargetMinutes = body.resolutionTargetMinutes === null ? null : Math.max(1, Math.trunc(body.resolutionTargetMinutes));
    }
    if (typeof body.warningThresholdPercent === "number") {
      data.warningThresholdPercent = Math.max(1, Math.min(100, Math.trunc(body.warningThresholdPercent)));
    }
    if (typeof body.escalationChannel === "string" || body.escalationChannel === null) data.escalationChannel = body.escalationChannel;
    if (typeof body.escalationTargetUserId === "string" || body.escalationTargetUserId === null) data.escalationTargetUserId = body.escalationTargetUserId;
    if (typeof body.priority === "number") data.priority = Math.max(0, Math.min(100, Math.trunc(body.priority)));
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    const updated = await prisma.slaPolicy.update({ where: { id: policy.id }, data });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/policies] patch failed", error);
    return Response.json({ error: "Failed to update policy" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const scope = await requireOrgId();
    const policy = await loadOrgPolicy(params.id, scope.orgId);
    if (!policy) return Response.json({ error: "Not found" }, { status: 404 });
    // Trackings keep their FK by design — we deactivate first to prevent
    // new tracking creation, then delete only if no trackings reference it.
    const referenced = await prisma.slaTracking.count({ where: { slaPolicyId: policy.id } });
    if (referenced > 0) {
      await prisma.slaPolicy.update({ where: { id: policy.id }, data: { isActive: false } });
      return Response.json({ deactivated: true, referenced });
    }
    await prisma.slaPolicy.delete({ where: { id: policy.id } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/policies] delete failed", error);
    return Response.json({ error: "Failed to delete policy" }, { status: 500 });
  }
}
