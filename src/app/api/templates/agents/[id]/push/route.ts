import { NextResponse } from "next/server";
import { requireTemplateRouteContext, templateRouteError } from "@/lib/templates/api-utils";
import { pushAgentTemplateUpdate } from "@/lib/templates/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await requireTemplateRouteContext();
    const { id } = await context.params;
    const result = await pushAgentTemplateUpdate({ agencyOrgId: orgId, templateId: id });
    return NextResponse.json({ result });
  } catch (error) {
    return templateRouteError(error);
  }
}
