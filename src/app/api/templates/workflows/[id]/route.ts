import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  asBoolean,
  asJsonObject,
  asString,
  requireTemplateRouteContext,
  templateRouteError,
} from "@/lib/templates/api-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const { id } = await context.params;
    const template = await prisma.workflowTemplate.findFirst({
      where: { id, agencyOrgId: orgId },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    return templateRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const existing = await prisma.workflowTemplate.findFirst({
      where: { id, agencyOrgId: orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const workflowConfig = asJsonObject(body.workflowConfig);
    const shouldBumpVersion =
      body.workflowConfig !== undefined ||
      body.name !== undefined ||
      body.description !== undefined ||
      body.category !== undefined;

    const template = await prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...(asString(body.name) ? { name: asString(body.name) as string } : {}),
        ...(body.description !== undefined ? { description: asString(body.description) } : {}),
        ...(body.category !== undefined ? { category: asString(body.category) } : {}),
        ...(workflowConfig ? { workflowConfig } : {}),
        ...(body.isPublished !== undefined ? { isPublished: asBoolean(body.isPublished) ?? true } : {}),
        ...(shouldBumpVersion ? { version: { increment: 1 } } : {}),
      },
    });
    return NextResponse.json({ template });
  } catch (error) {
    return templateRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const { id } = await context.params;
    const existing = await prisma.workflowTemplate.findFirst({
      where: { id, agencyOrgId: orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    await prisma.workflowTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return templateRouteError(error);
  }
}
