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
    const template = await prisma.agentTemplate.findFirst({
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
    const existing = await prisma.agentTemplate.findFirst({
      where: { id, agencyOrgId: orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const agentConfig = asJsonObject(body.agentConfig);
    const shouldBumpVersion =
      body.agentConfig !== undefined ||
      body.name !== undefined ||
      body.description !== undefined ||
      body.category !== undefined;

    const template = await prisma.agentTemplate.update({
      where: { id },
      data: {
        ...(asString(body.name) ? { name: asString(body.name) as string } : {}),
        ...(body.description !== undefined ? { description: asString(body.description) } : {}),
        ...(body.category !== undefined ? { category: asString(body.category) } : {}),
        ...(agentConfig ? { agentConfig } : {}),
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
    const existing = await prisma.agentTemplate.findFirst({
      where: { id, agencyOrgId: orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    await prisma.agentTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return templateRouteError(error);
  }
}
