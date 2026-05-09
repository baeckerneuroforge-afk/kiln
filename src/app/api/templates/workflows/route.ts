import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  asBoolean,
  asJsonObject,
  asString,
  requireTemplateRouteContext,
  templateRouteError,
} from "@/lib/templates/api-utils";

export async function GET() {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const templates = await prisma.workflowTemplate.findMany({
      where: { agencyOrgId: orgId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    return templateRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const body = (await request.json()) as Record<string, unknown>;
    const name = asString(body.name);
    const workflowConfig = asJsonObject(body.workflowConfig);

    if (!name || !workflowConfig) {
      return NextResponse.json({ error: "name and workflowConfig are required" }, { status: 400 });
    }

    const template = await prisma.workflowTemplate.create({
      data: {
        agencyOrgId: orgId,
        name,
        description: asString(body.description),
        category: asString(body.category),
        workflowConfig,
        isPublished: asBoolean(body.isPublished) ?? true,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return templateRouteError(error);
  }
}
