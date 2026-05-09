import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTemplateRouteContext, templateRouteError } from "@/lib/templates/api-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const { id } = await context.params;
    const template = await prisma.workflowTemplate.findFirst({
      where: { id, agencyOrgId: orgId },
      select: { id: true },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const instances = await prisma.templateInstance.findMany({
      where: { templateType: "WORKFLOW", templateId: id },
      orderBy: { installedAt: "desc" },
    });
    const subOrgIds = instances.map((instance) => instance.subOrgId);
    const relationships = await prisma.orgRelationship.findMany({
      where: { parentOrgId: orgId, childOrgId: { in: subOrgIds } },
      select: { childOrgId: true, subOrgName: true, subOrgStatus: true },
    });
    const byOrgId = new Map(relationships.map((relationship) => [relationship.childOrgId, relationship]));

    return NextResponse.json({
      instances: instances.map((instance) => ({
        ...instance,
        subOrgName: byOrgId.get(instance.subOrgId)?.subOrgName ?? instance.subOrgId,
        subOrgStatus: byOrgId.get(instance.subOrgId)?.subOrgStatus ?? null,
      })),
    });
  } catch (error) {
    return templateRouteError(error);
  }
}
