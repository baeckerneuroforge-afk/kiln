import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    const scope = await requireOrgId();
    const departments = await prisma.department.findMany({
      where: {
        ...orgScopeFilter(scope),
        status: { not: "ARCHIVED" },
      },
      include: {
        workerAgents: { include: { agent: { select: { id: true, name: true, status: true } } } },
        _count: { select: { backlog: true, runLogs: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(departments);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return apiError("Failed to list departments", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await requireOrgId();
    const body = await request.json();

    const department = await prisma.department.create({
      data: {
        userId: scope.userId,
        orgId: scope.orgId,
        name: typeof body.name === "string" ? body.name : "Untitled Department",
        description: typeof body.description === "string" ? body.description : null,
        type: body.type || "CUSTOM",
        managerSystemPrompt:
          typeof body.managerSystemPrompt === "string" ? body.managerSystemPrompt : null,
        managerModel:
          typeof body.managerModel === "string" ? body.managerModel : "claude-sonnet-4-6",
        approvalMode: body.approvalMode || "APPROVAL_FIRST",
        scheduleEnabled: body.scheduleEnabled === true,
        scheduleCron: typeof body.scheduleCron === "string" ? body.scheduleCron : null,
        webhookEnabled: body.webhookEnabled !== false,
      },
    });

    return Response.json(department, { status: 201 });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return apiError("Failed to create department", 500);
  }
}
