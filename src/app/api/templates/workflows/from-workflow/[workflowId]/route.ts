import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { snapshotWorkflowConfig } from "@/lib/templates/service";
import { requireTemplateRouteContext, templateRouteError } from "@/lib/templates/api-utils";

type RouteContext = { params: Promise<{ workflowId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const scope = await requireTemplateRouteContext();
    const { workflowId } = await context.params;
    const workflow = await prisma.agentTeam.findFirst({
      where: { id: workflowId, ...orgScopeFilter(scope) },
    });
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }
    const template = await prisma.workflowTemplate.create({
      data: {
        agencyOrgId: scope.orgId,
        name: workflow.name,
        description: workflow.description,
        category: "Converted",
        workflowConfig: snapshotWorkflowConfig(workflow) as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return templateRouteError(error);
  }
}
