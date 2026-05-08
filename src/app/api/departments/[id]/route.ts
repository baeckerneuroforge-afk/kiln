import { NextRequest } from "next/server";
import { OrgContextError, requireOrgId } from "@/lib/auth/org-context";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/prisma";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await requireOrgId();
    const department = await prisma.department.findFirst({
      where: { id: params.id, ...orgScopeFilter(scope) },
      include: {
        workerAgents: { include: { agent: true }, orderBy: { priority: "desc" } },
        backlog: { orderBy: { createdAt: "desc" }, take: 10 },
        runLogs: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!department) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(department);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to load department" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await requireOrgId();
    const body = await request.json();
    const existing = await prisma.department.findFirst({
      where: { id: params.id, ...orgScopeFilter(scope) },
      select: { id: true },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const department = await prisma.department.update({
      where: { id: params.id },
      data: {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.description === "string" ? { description: body.description } : {}),
        ...(typeof body.managerSystemPrompt === "string"
          ? { managerSystemPrompt: body.managerSystemPrompt }
          : {}),
        ...(typeof body.managerModel === "string" ? { managerModel: body.managerModel } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.approvalMode ? { approvalMode: body.approvalMode } : {}),
        ...(typeof body.scheduleEnabled === "boolean"
          ? { scheduleEnabled: body.scheduleEnabled }
          : {}),
        ...(typeof body.scheduleCron === "string" || body.scheduleCron === null
          ? { scheduleCron: body.scheduleCron }
          : {}),
        ...(typeof body.webhookEnabled === "boolean"
          ? { webhookEnabled: body.webhookEnabled }
          : {}),
        ...(typeof body.emailEnabled === "boolean"
          ? { emailEnabled: body.emailEnabled }
          : {}),
        ...(typeof body.emailInboundAddr === "string" || body.emailInboundAddr === null
          ? { emailInboundAddr: body.emailInboundAddr }
          : {}),
        ...(typeof body.emailFromAddr === "string" || body.emailFromAddr === null
          ? { emailFromAddr: body.emailFromAddr }
          : {}),
        ...(typeof body.emailFromName === "string" || body.emailFromName === null
          ? { emailFromName: body.emailFromName }
          : {}),
        ...(typeof body.emailReplyToAddr === "string" || body.emailReplyToAddr === null
          ? { emailReplyToAddr: body.emailReplyToAddr }
          : {}),
        ...(typeof body.whatsappEnabled === "boolean"
          ? { whatsappEnabled: body.whatsappEnabled }
          : {}),
        ...(typeof body.whatsappPhoneId === "string" || body.whatsappPhoneId === null
          ? { whatsappPhoneId: body.whatsappPhoneId }
          : {}),
        ...(typeof body.whatsappBusinessId === "string" || body.whatsappBusinessId === null
          ? { whatsappBusinessId: body.whatsappBusinessId }
          : {}),
      },
    });

    return Response.json(department);
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to update department" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await requireOrgId();
    const existing = await prisma.department.findFirst({
      where: { id: params.id, ...orgScopeFilter(scope) },
      select: { id: true },
    });
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.department.update({
      where: { id: params.id },
      data: { status: "ARCHIVED" },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof OrgContextError) return unauthorized();
    return Response.json({ error: "Failed to archive department" }, { status: 500 });
  }
}
