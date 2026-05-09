import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const url = new URL(request.url);
    const departmentId = url.searchParams.get("departmentId");
    const where: Record<string, unknown> = {
      department: { orgId: scope.orgId },
    };
    if (departmentId) where.departmentId = departmentId;
    const policies = await prisma.slaPolicy.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
    return Response.json({ policies });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/policies] list failed", error);
    return Response.json({ error: "Failed to list policies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json().catch(() => ({}));
    const departmentId = typeof body.departmentId === "string" ? body.departmentId : null;
    if (!departmentId) return Response.json({ error: "departmentId required" }, { status: 400 });

    const department = await prisma.department.findFirst({
      where: { id: departmentId, orgId: scope.orgId },
      select: { id: true },
    });
    if (!department) return Response.json({ error: "Department not found" }, { status: 404 });

    const target = Number.parseInt(String(body.firstResponseTargetMinutes ?? 0), 10);
    if (!Number.isFinite(target) || target <= 0) {
      return Response.json({ error: "firstResponseTargetMinutes must be > 0" }, { status: 400 });
    }

    const policy = await prisma.slaPolicy.create({
      data: {
        departmentId,
        name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Standard SLA",
        description: typeof body.description === "string" ? body.description : null,
        appliesTo: ["ALL", "BY_PRIORITY", "BY_CHANNEL", "BY_TAG"].includes(body.appliesTo) ? body.appliesTo : "ALL",
        conditionValue: typeof body.conditionValue === "string" ? body.conditionValue : null,
        firstResponseTargetMinutes: target,
        resolutionTargetMinutes:
          typeof body.resolutionTargetMinutes === "number" && body.resolutionTargetMinutes > 0
            ? Math.trunc(body.resolutionTargetMinutes)
            : null,
        warningThresholdPercent:
          typeof body.warningThresholdPercent === "number"
            ? Math.max(1, Math.min(100, Math.trunc(body.warningThresholdPercent)))
            : 75,
        escalationChannel: typeof body.escalationChannel === "string" ? body.escalationChannel : null,
        escalationTargetUserId: typeof body.escalationTargetUserId === "string" ? body.escalationTargetUserId : null,
        priority: typeof body.priority === "number" ? Math.max(0, Math.min(100, Math.trunc(body.priority))) : 50,
        isActive: body.isActive !== false,
      },
    });
    await logAudit({
      orgId: scope.orgId,
      actorUserId: scope.userId,
      actorOrgId: scope.orgId,
      action: "SLA_POLICY_CREATED",
      resourceType: "SLA_POLICY",
      resourceId: policy.id,
      description: `SLA Policy '${policy.name}' created`,
      metadata: { departmentId, target: policy.firstResponseTargetMinutes },
      request,
    });
    return Response.json(policy, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    console.error("[sla/policies] create failed", error);
    return Response.json({ error: "Failed to create policy" }, { status: 500 });
  }
}
