import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orgScopeFilter } from "@/lib/auth/org-scope";
import { snapshotAgentConfig } from "@/lib/templates/service";
import { requireTemplateRouteContext, templateRouteError } from "@/lib/templates/api-utils";

type RouteContext = { params: Promise<{ agentId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const scope = await requireTemplateRouteContext();
    const { agentId } = await context.params;
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, ...orgScopeFilter(scope) },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    const template = await prisma.agentTemplate.create({
      data: {
        agencyOrgId: scope.orgId,
        name: agent.name,
        description: agent.description,
        category: "Converted",
        agentConfig: snapshotAgentConfig(agent) as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return templateRouteError(error);
  }
}
