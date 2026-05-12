/**
 * Sprint 19.7.5 — deploy a Workflow template into one or more sub-orgs.
 * Mirrors /api/templates/agents/[id]/deploy.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireTemplateRouteContext,
  templateRouteError,
} from "@/lib/templates/api-utils";
import { installSelectedTemplatesForSubOrg } from "@/lib/templates/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { userId, orgId } = await requireTemplateRouteContext();
    const { id } = await context.params;

    const body = (await request.json().catch(() => ({}))) as { subOrgIds?: unknown };
    const subOrgIdsRaw = Array.isArray(body.subOrgIds) ? body.subOrgIds : [];
    const subOrgIds = subOrgIdsRaw.filter((v): v is string => typeof v === "string" && v.length > 0);

    if (subOrgIds.length === 0) {
      return NextResponse.json({ error: "subOrgIds is required" }, { status: 400 });
    }

    const template = await prisma.workflowTemplate.findFirst({
      where: { id, agencyOrgId: orgId },
      select: { id: true },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const relationships = await prisma.orgRelationship.findMany({
      where: { id: { in: subOrgIds }, parentOrgId: orgId, subOrgStatus: "ACTIVE" },
      select: { id: true, childOrgId: true, subOrgName: true },
    });
    if (relationships.length !== subOrgIds.length) {
      return NextResponse.json(
        { error: "One or more sub-orgs not found or inactive" },
        { status: 404 },
      );
    }

    const perSubOrg: Array<{
      subOrgId: string;
      subOrgName: string;
      created: number;
      reused: number;
    }> = [];

    let totalCreated = 0;
    let totalReused = 0;
    for (const rel of relationships) {
      const result = await installSelectedTemplatesForSubOrg({
        agencyOrgId: orgId,
        subOrgId: rel.childOrgId,
        userId,
        agentTemplateIds: [],
        workflowTemplateIds: [template.id],
      });
      totalCreated += result.createdInstances;
      totalReused += result.reusedInstances;
      perSubOrg.push({
        subOrgId: rel.id,
        subOrgName: rel.subOrgName,
        created: result.createdInstances,
        reused: result.reusedInstances,
      });
    }

    return NextResponse.json(
      {
        templateId: template.id,
        deployedTo: perSubOrg.length,
        created: totalCreated,
        reused: totalReused,
        perSubOrg,
      },
      { status: 200 },
    );
  } catch (error) {
    return templateRouteError(error);
  }
}
