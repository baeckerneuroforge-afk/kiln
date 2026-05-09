import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTemplateRouteContext, templateRouteError } from "@/lib/templates/api-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const { id } = await context.params;
    const result = await prisma.workflowTemplate.updateMany({
      where: { id, agencyOrgId: orgId },
      data: { isPublished: true },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return templateRouteError(error);
  }
}
